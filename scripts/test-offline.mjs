// Tests what the app keeps on the phone (src/lib/offline-core.ts): `node scripts/test-offline.mjs`. The outbox is the web app's own queue; this is the app's wiring
// of it and the copies kept for reading with no signal: one session never sees or sends another's, a clock-on with no signal waits and is sent once, a refusal is
// shown and not kept, and signing out forgets everything.
import { createOffline } from '../src/lib/offline-core.ts';

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };
function memory() {
  const m = new Map();
  return { m, getItemSync: k => (m.has(k) ? m.get(k) : null), setItemSync: (k, v) => { m.set(k, v); }, removeItemSync: k => m.delete(k), getAllKeysSync: () => [...m.keys()] };
}
function harness(store = memory()) {
  const sent = []; let online = true, reply = async () => ({ ok: true, id: 'jc_1' });
  const off = createOffline({ store, isOnline: () => online, send: async e => { if (!online) throw new Error('no signal'); sent.push(e); return reply(e); } });
  return { off, store, sent, online: v => { online = v; }, reply: fn => { reply = fn; } };
}
const clockOn = { kind: 'clock-on', method: 'POST', path: '/job-cards', body: { work_date: '2030-03-04', clock_on: '07:00' }, local_card: { work_date: '2030-03-04', clock_on: '07:00' } };
const A = 'aaaaaaaaaaaaaaaa', B = 'bbbbbbbbbbbbbbbb';

console.log('-- the outbox');
let h = harness();
check(await h.off.submit(clockOn).then(() => false, e => /sign-in needs refreshing/.test(e.message)), 'with nobody signed in nothing is queued');
h.off.setSession(A);
let r = await h.off.submit(clockOn);
check(r.outcome === 'sent' && r.result.id === 'jc_1' && h.sent.length === 1 && /^[A-Za-z0-9_-]{8,64}$/.test(h.sent[0].body.client_ref) && h.off.entries().length === 0, 'with signal a clock-on goes at once, carrying a reference the Worker uses to take it only once');
h.online(false);
r = await h.off.submit(clockOn);
check(r.outcome === 'pending' && h.off.entries().length === 1 && h.off.pending() === 1 && h.sent.length === 1, 'with no signal it waits on the phone');
const ref = h.off.entries()[0].body.client_ref;
check((await h.off.replay()).stopped === 'network' && h.off.pending() === 1, 'trying to send with no signal keeps it');
h.online(true);
r = await h.off.replay();
check(r.sent.length === 1 && h.sent[1].body.client_ref === ref && h.off.pending() === 0 && (await h.off.replay()) === null, 'when the signal returns it is sent once, with the same reference, and nothing is left');
h.reply(async () => { const e = new Error('You’re already clocked on — clock off first'); e.status = 409; throw e; });
const refused = await h.off.submit(clockOn).then(() => null, e => e);
check(refused?.status === 409 && /already clocked on/.test(refused.message) && h.off.entries().length === 0, 'a refusal on the first send is shown and not kept');
h.online(false); await h.off.submit(clockOn); h.online(true);
r = await h.off.replay();
check(r.failed === 1 && h.off.entries()[0].status === 'failed' && /already clocked on/.test(h.off.entries()[0].error), 'one refused later (it waited with no signal) is kept as failed with the Worker’s words');
const failedId = h.off.entries()[0].id;
check(h.off.retry(failedId) && h.off.entries()[0].status === 'pending' && h.off.discard(failedId) && h.off.entries().length === 0, '...to try again or throw away');

h = harness(); h.off.setSession(A); h.online(false);
await h.off.submit({ kind: 'chat-send', method: 'POST', path: '/chat/threads/t1/messages', body: { body: 'On my way' }, local_card: { body: 'On my way' } });
await h.off.submit(clockOn);
check(h.off.entries().length === 1 && h.off.entries()[0].kind === 'clock-on' && h.off.chatEntries().length === 1 && h.off.chatEntries()[0].body.body === 'On my way' && h.off.pending() === 2, 'a chat message waits in the same outbox but is listed apart, for its own chat to show');

console.log('\n-- one session at a time');
h = harness(); h.off.setSession(A); h.online(false);
await h.off.submit(clockOn);
h.off.remember('/job-cards/open', { card: { id: 'a' } });
check(h.off.recall('/job-cards/open').json.card.id === 'a' && typeof h.off.recall('/job-cards/open').at === 'number' && h.off.recall('/me') === null, 'a read is kept for the session that made it');
h.off.setSession(B);
check(h.off.entries().length === 0 && h.off.pending() === 0 && h.off.recall('/job-cards/open') === null, 'another session sees none of it: not the outbox, not the copies');
h.online(true);
check((await h.off.replay()) === null && h.sent.length === 0, '...and never sends the first one’s clock-on as its own');
h.off.setSession(A);
check(h.off.entries().length === 1 && h.off.recall('/job-cards/open') !== null, 'the first session still has its own');
const again = harness(h.store); again.off.setSession(A);
check(again.off.entries().length === 1, 'what was waiting is still there after the app is closed and opened again');
h.off.setSession('');
h.off.remember('/me', { x: 1 });
check(h.off.recall('/me') === null && ![...h.store.m.keys()].some(k => k.endsWith(':/me')), 'with nobody signed in nothing is kept');

console.log('\n-- forgetting');
h.off.setSession(A);
let told = 0; const stop = h.off.subscribe(() => { told++; });
const before = h.off.snapshot();
h.off.forgetAll();
check(h.store.m.size === 0 && h.off.fingerprint() === '' && h.off.entries().length === 0, 'signing out wipes the outbox and every copy, whoever’s they were');
check(told > 0 && h.off.snapshot() !== before, 'the screens are told, so they redraw');
stop();

console.log(failures ? `\n${failures} failed` : '\nAll offline checks passed');
process.exit(failures ? 1 : 0);
