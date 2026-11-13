// Tests how the app talks to the Worker (src/lib/api-core.ts): `node scripts/test-api.mjs` (Node 22.18+, which runs TypeScript as it is).
// The session id goes as a Bearer header, the company code only on the sign-in routes, every call says which app is asking, an answer the Worker refuses carries
// its words, its status and its code, no signal is an error with no status (which is how the outbox knows to keep a send), and a refused session signs the app out.
import { createApi, ApiError, TENANT_ROUTES, sentence } from '../src/lib/api-core.ts';

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };
const answer = (status, json) => ({ ok: status >= 200 && status < 300, status, json: async () => { if (json === undefined) throw new Error('not json'); return json; } });
function harness({ sid = null, code = null, reply = () => answer(200, { ok: true }) } = {}) {
  const calls = []; let signedOut = 0;
  const api = createApi({ baseUrl: 'https://app.test/', appVersion: '0.1.0 android', getSession: () => sid, getTenantCode: () => code, onSignedOut: () => { signedOut++; },
    fetchImpl: async (url, init) => { calls.push({ url, ...init }); return reply(url, init); } });
  return { api, calls, signedOut: () => signedOut };
}
const fails = async fn => { try { await fn(); return null; } catch (e) { return e; } };

console.log('-- what is sent');
let h = harness({ code: 'fieldco' });
await h.api('/login', { method: 'POST', body: { email: 'a@b.test', pin: '4827' } });
let c = h.calls[0];
check(c.url === 'https://app.test/api/hr/login' && c.method === 'POST' && c.body === '{"email":"a@b.test","pin":"4827"}' && c.headers['Content-Type'] === 'application/json', 'a sign-in is a JSON POST to the Worker’s own address');
check(c.headers['X-Tenant-Code'] === 'fieldco' && !('Authorization' in c.headers) && c.headers['X-App-Version'] === '0.1.0 android', 'it carries the company code and the app’s version, and no session');
h = harness({ sid: 'sid-123', code: 'fieldco' });
await h.api('/timesheets/mine', { params: { date: '2030-03-04', period_id: undefined, note: 'a b&c' } });
c = h.calls[0];
check(c.url === 'https://app.test/api/hr/timesheets/mine?date=2030-03-04&note=a%20b%26c' && c.method === 'GET' && c.body === undefined && !('Content-Type' in c.headers), 'a read puts its values in the address, leaving out the empty ones');
check(c.headers.Authorization === 'Bearer sid-123' && !('X-Tenant-Code' in c.headers), 'once signed in every call carries the session as a Bearer header, and the company code is not sent again');
check([...TENANT_ROUTES].sort().join() === '/bootstrap,/bootstrap-check,/login,/passkeys/login,/passkeys/login/options', 'the company code goes only on the sign-in routes');

console.log('\n-- what comes back');
h = harness({ sid: 's', reply: () => answer(200, { ok: true, rows: [1, 2] }) });
check((await h.api('/jobs')).rows.length === 2, 'an answer is handed back as it came');
h = harness({ sid: 's', reply: () => answer(409, { ok: false, error: 'you’re already clocked on — clock off first' }) });
let e = await fails(() => h.api('/job-cards', { method: 'POST', body: {} }));
check(e instanceof ApiError && e.status === 409 && !e.offline && e.message === 'You’re already clocked on — clock off first' && h.signedOut() === 0, 'a refusal carries the Worker’s words (with a capital) and its status, and does not sign anyone out');
h = harness({ sid: 's', reply: () => answer(403, { ok: false, error: 'choose your own PIN before you carry on', code: 'must_change_pin' }) });
e = await fails(() => h.api('/todos'));
check(e.status === 403 && e.code === 'must_change_pin', '...and its code, where it has one');
h = harness({ sid: 's', reply: () => answer(401, { ok: false, error: 'not authenticated' }) });
e = await fails(() => h.api('/me'));
check(e.status === 401 && h.signedOut() === 1, 'a session the Worker no longer accepts signs the app out');
h = harness({ code: 'fieldco', reply: () => answer(401, { ok: false, error: 'incorrect email or PIN' }) });
e = await fails(() => h.api('/login', { method: 'POST', body: {} }));
check(e.status === 401 && h.signedOut() === 0, 'a wrong PIN is not a lost session');
h = harness({ sid: 's', reply: () => { throw new TypeError('Network request failed'); } });
e = await fails(() => h.api('/job-cards', { method: 'POST', body: {} }));
check(e instanceof ApiError && e.status === undefined && e.offline && h.signedOut() === 0, 'no signal is an error with no status: nothing was refused, so a send is kept');
h = harness({ sid: 's', reply: () => answer(502, undefined) });
e = await fails(() => h.api('/jobs'));
check(e.status === 502 && !e.offline && /502/.test(e.message), 'an answer that is not the Worker’s (an error page on the way) still has its status');
h = harness({ sid: 's', reply: () => answer(200, { ok: false, error: 'nope' }) });
check((await fails(() => h.api('/jobs')))?.message === 'Nope', 'an answer that says ok: false is an error whatever its status');
check(sentence('') === '' && sentence('abc') === 'Abc', 'words get a capital');

console.log(failures ? `\n${failures} failed` : '\nAll API checks passed');
process.exit(failures ? 1 : 0);
