// Tests what Home's Today's tasks card reads and sends (src/lib/tasks-core.ts): `node scripts/test-tasks.mjs` (Node 22.18+, which runs TypeScript as it is). The rules of a day of
// tasks are the web app's own (shared/task-core.js, tested in AccurateHR); this is the app's wiring of them: who is a driver and who is never asked, the read, Done and Undo through
// the outbox with no signal (shown as waiting, sent once when the signal returns, a refusal shown in the Worker's words), one session never seeing another's, and what the card is made of.
import { readFileSync } from 'node:fs';
import { createOffline } from '../src/lib/offline-core.ts';
import { AHEAD_DAYS, isDriver, LOCK_MS, TASK_SIZES, taskDraft, tasksPath, taskView, UNDO_MS } from '../src/lib/tasks-core.ts';
import { describe } from '../shared/offline-queue.js';
import { isLate, laterWords, placeLines, progressWords, TASK_WORDS } from '../shared/task-core.js';

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };
function memory() {
  const m = new Map();
  return { m, getItemSync: k => (m.has(k) ? m.get(k) : null), setItemSync: (k, v) => { m.set(k, v); }, removeItemSync: k => m.delete(k), getAllKeysSync: () => [...m.keys()] };
}
function harness() {
  const sent = []; let online = true, reply = async () => ({ ok: true });
  const off = createOffline({ store: memory(), isOnline: () => online, send: async e => { if (!online) throw new Error('no signal'); sent.push(e); return reply(e); } });
  return { off, sent, online: v => { online = v; }, reply: fn => { reply = fn; } };
}
const A = 'aaaaaaaaaaaaaaaa', B = 'bbbbbbbbbbbbbbbb';
const today = '2026-11-26';
const grant = (scope, edit = false) => ({ scope, edit, approve: false });
const driver = { tasks: grant('own'), takes_tasks: grant('all') };
const task = (id, title, extra = {}) => ({ id, title, notes: null, from_place: null, from_lat: null, from_lng: null, to_place: null, to_lat: null, to_lng: null, job_id: null, company_id: null,
  assignee_id: 'emp', task_date: today, sort_order: 0, status: 'planned', published: true, ...extra });
// The driver's day as GET /tasks/mine sends it: one left over from yesterday, two to do, one already done, and two for tomorrow.
const rows = [
  task('t0', 'Collect the skip', { task_date: '2026-11-25' }),
  task('t1', 'Pick up the pit', { from_place: 'Kolbe Mickleham', from_lat: -37.5, from_lng: 144.9, to_place: 'Estia Bentleigh', notes: 'Ask for Ryan' }),
  task('t2', 'Take the fuel cell', { sort_order: 1 }),
  task('t3', 'Back at the yard', { sort_order: 2, status: 'done' }),
  task('n1', 'Tomorrow first', { task_date: '2026-11-27' }),
  task('n2', 'Tomorrow second', { task_date: '2026-11-27', sort_order: 1 }),
];
const ids = list => list.map(r => r.id).join();

console.log('-- who is a driver');
check(isDriver(driver) === true, 'a level with Tasks and Takes tasks is a driver');
check(isDriver({ tasks: grant('all', true) }) === false && isDriver({ takes_tasks: grant('all') }) === false && isDriver({ tasks: grant('none'), takes_tasks: grant('all') }) === false
  && isDriver({}) === false && isDriver(undefined) === false && isDriver(null) === false, 'the office (Tasks alone), Takes tasks alone, a level with neither and nobody are not drivers');
check(tasksPath(driver, today) === `/tasks/mine?from=${today}&to=2026-12-03` && AHEAD_DAYS === 7 && tasksPath(driver, '2026-12-28') === '/tasks/mine?from=2026-12-28&to=2027-01-04', 'a driver reads today and the week ahead, across a month and a year end');
check(tasksPath({ tasks: grant('all', true) }, today) === null && tasksPath({}, today) === null && tasksPath(undefined, today) === null, 'anyone else gets no list to read, so no request is made for them');

console.log('\n-- the driver’s day');
let v = taskView(rows, [], today);
check(ids(v.open) === 't0,t1,t2' && v.next.id === 't0' && ids(v.done) === 't3' && v.total === 4, 'what is left from an earlier day comes first, then today’s in order; the finished one is listed apart');
check(isLate(rows[0], today) === true && isLate(rows[1], today) === false && progressWords(v.done.length, v.total) === '1 of 4 done' && laterWords(v.later, today) === 'Tomorrow: 2 tasks', 'the earlier one is marked, and the progress and the next day are said in words');
check(taskView([task('d1', 'One', { status: 'done' })], [], today).open.length === 0 && progressWords(1, 1) === 'All done' && TASK_WORDS.allDone === 'All done for today. Thank you.', 'with all finished there is nothing next and it says so');
const pl = placeLines(rows[1]);
check(pl.length === 2 && pl[0].href === 'https://www.google.com/maps/search/?api=1&query=-37.5,144.9' && pl[1].href === 'https://www.google.com/maps/search/?api=1&query=Estia%20Bentleigh' && placeLines(rows[2]).length === 0, 'the pick-up and drop-off each open the map (at the point when there is one, else a search for the place)');
check(taskView(undefined, [], today).total === 0 && taskView(undefined, [], today).next === null, 'nothing read yet is an empty day');

console.log('\n-- Done and Undo with the outbox');
let h = harness(); h.off.setSession(A); h.online(false);
const done = await h.off.submit(taskDraft(rows[1], 'done'));
const entry = h.off.entries()[0];
check(done.outcome === 'pending' && h.off.entries().length === 1 && entry.kind === 'task' && entry.method === 'POST' && entry.path === '/tasks/t1/done' && h.off.pending() === 1 && h.sent.length === 0, 'with no signal Done waits on the phone');
check(/^[A-Za-z0-9_-]{8,64}$/.test(entry.body.client_ref) && entry.body.client_ref === entry.id, 'and carries a reference the Worker uses to take it only once');
v = taskView(rows, h.off.entries(), today);
check(ids(v.open) === 't0,t2' && ids(v.done) === 't1,t3' && v.done[0].waiting === 'done' && v.next.id === 't0' && v.total === 4 && progressWords(v.done.length, v.total) === '2 of 4 done', 'it shows as done at once, says it is waiting to send, and the next task is next');
check(describe(entry) === 'Mark “Pick up the pit” done', 'the list of what is waiting says what it is');
check((await h.off.replay()).stopped === 'network' && h.off.pending() === 1, 'trying to send with no signal keeps it');
h.online(true);
let r = await h.off.replay();
check(r.sent.length === 1 && h.sent.length === 1 && h.sent[0].path === '/tasks/t1/done' && h.sent[0].body.client_ref === entry.body.client_ref && h.off.pending() === 0 && (await h.off.replay()) === null, 'when the signal returns it is sent once, with the same reference, and nothing is left');
v = taskView(rows.map(x => (x.id === 't1' ? { ...x, status: 'done' } : x)), h.off.entries(), today);
check(ids(v.done) === 't1,t3' && v.done[0].waiting === null && v.done[0].failed === null, 'and once the Worker says so it is done and no longer waiting');

h = harness(); h.off.setSession(A);
r = await h.off.submit(taskDraft(rows[1], 'done'));
check(r.outcome === 'sent' && h.sent.length === 1 && h.sent[0].path === '/tasks/t1/done' && h.off.entries().length === 0, 'with signal Done goes at once and nothing waits');
h.online(false);
const asDone = rows.map(x => (x.id === 't1' ? { ...x, status: 'done' } : x));
await h.off.submit(taskDraft(asDone[1], 'reopen'));
v = taskView(asDone, h.off.entries(), today);
check(h.off.entries()[0].path === '/tasks/t1/reopen' && ids(v.open) === 't0,t1,t2' && v.open[1].waiting === 'reopen' && ids(v.done) === 't3', 'Undo of a finished task also waits, and the task is back in the list');
await h.off.submit(taskDraft(asDone[2], 'done')); await h.off.submit(taskDraft(asDone[2], 'reopen'));
h.online(true); await h.off.replay();
check(h.sent.slice(1).map(e => e.path).join() === '/tasks/t1/reopen,/tasks/t2/done,/tasks/t2/reopen', 'what waited is sent in the order it was pressed');

console.log('\n-- a refusal');
h = harness(); h.off.setSession(A); h.online(false);
await h.off.submit(taskDraft(rows[2], 'done'));
h.online(true);
h.reply(async () => { const e = new Error('a task that is cancelled can’t be changed that way'); e.status = 403; throw e; });
r = await h.off.replay();
const failed = h.off.entries()[0];
v = taskView(rows, h.off.entries(), today);
check(r.failed === 1 && failed.status === 'failed' && v.open.some(x => x.id === 't2' && x.failed === 'a task that is cancelled can’t be changed that way' && x.waiting === null), 'one the Worker refuses later stays in the list as it was, with the Worker’s words on it');
check(describe(failed) === 'Mark “Take the fuel cell” done' && h.off.retry(failed.id) && h.off.discard(failed.id) && taskView(rows, h.off.entries(), today).open.every(x => x.failed === null), 'and the list of what could not be sent can try it again or throw it away');
h = harness(); h.off.setSession(A);
h.reply(async () => { const e = new Error('this task was just changed by someone else: refresh and look again'); e.status = 409; throw e; });
const refused = await h.off.submit(taskDraft(rows[1], 'done')).then(() => null, e => e);
check(refused?.status === 409 && /changed by someone else/.test(refused.message) && h.off.entries().length === 0, 'one refused on the first send is shown in the Worker’s words and not kept');

console.log('\n-- one session at a time');
h = harness(); h.off.setSession(A); h.online(false);
await h.off.submit(taskDraft(rows[1], 'done'));
h.off.remember(tasksPath(driver, today), { rows });
check(h.off.recall(tasksPath(driver, today)).json.rows.length === rows.length, 'the list is kept for reading with no signal, for the session that read it');
h.off.setSession(B);
v = taskView(rows, h.off.entries(), today);
check(h.off.recall(tasksPath(driver, today)) === null && h.off.entries().length === 0 && ids(v.open) === 't0,t1,t2' && v.done.every(x => x.waiting === null), 'another session sees none of it: not the kept list, and not a Done waiting for someone else');
h.online(true);
check((await h.off.replay()) === null && h.sent.length === 0, '...and never sends the first person’s Done as its own');
h.off.forgetAll();
check(h.off.recall(tasksPath(driver, today)) === null && h.off.pending() === 0, 'signing out forgets the list and what was waiting');

console.log('\n-- the card');
const read = f => readFileSync(new URL(f, import.meta.url), 'utf8');
const card = read('../src/tasks.tsx'), hook = read('../src/lib/use-tasks.ts'), home = read('../src/app/(tabs)/index.tsx'), reader = read('../src/lib/use-read.ts'), core = read('../src/lib/tasks-core.ts');
const code = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
check(TASK_SIZES.done >= 72 && TASK_SIZES.row >= 48 && TASK_SIZES.touch >= 48 && /minHeight: TASK_SIZES\.done/.test(card) && /minHeight: TASK_SIZES\.row/.test(card) && /minHeight: TASK_SIZES\.touch/.test(card)
  && /minHeight: 72/.test(card), 'Done is at least 72 high, and every row and button at least 48, as the card is drawn');
check(UNDO_MS === 10000 && LOCK_MS > 0 && LOCK_MS < 2000 && /UNDO_MS/.test(card) && /LOCK_MS/.test(card), 'Undo stays about ten seconds, and the next Done is held a moment so a double tap finishes one task');
check(/useRead<MyTasks>\(tasksPath\(/.test(hook) && /if \(!path\) return;/.test(reader), 'the card reads only the path a driver gets, and a read with no path makes no request');
check(/offline\.submit\(taskDraft\(/.test(hook) && !/\bapi\(/.test(code(hook)) && !/\bapi\b/.test(code(card)), 'Done and Undo go through the outbox, never straight to the Worker');
check(home.indexOf('<TodaysTasks') > home.indexOf('</Hero>') && home.indexOf('<TodaysTasks') < home.indexOf('<Heading>To approve') && home.indexOf('<TodaysTasks') < home.indexOf('<Heading>Scheduled today') && /<TodaysTasks today=\{today\} \/>/.test(home), 'Home shows it under the clock and before everything else, for the local day Home itself uses');
check(!/new Date\(|Date\.now\(/.test(code(card) + code(hook) + code(core)), 'no date is worked out on its own: the day is the one Home gives it');
check(!/#[0-9A-Fa-f]{3,8}\b|rgba?\(/.test(code(card)) && /useTheme\(\)/.test(card), 'every colour comes from the theme, so Sunlight mode and Softer colours change it');
check(!/accurate|worksafe|workcover|melbourne|simpro/i.test(code(card) + code(hook) + code(core)), 'no customer’s name, city or regulator in what the card says');
check(/Linking\.openURL\(href\)/.test(card) && /placeLines\(row\)/.test(card), 'the pick-up and drop-off open the phone’s own maps from the addresses the shared rule gives');

console.log(failures ? `\n${failures} failed` : '\nAll task card checks passed');
process.exit(failures ? 1 : 0);
