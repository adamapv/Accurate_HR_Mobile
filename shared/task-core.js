// Tasks' own rules: a task is one thing for a driver to do (pick up a pit, take a fuel cell to a yard), put on a driver's day by the office and ticked off by the driver
// on their phone. The Worker (src/index.mjs), the web app (public/app.js, public/tasks.js) and the phone app (its own repo, Accurate_HR_Mobile, which copies this file)
// all use this one module, so what may be saved, who may do what, how the board's columns fill and what the driver sees are the same everywhere. Logic only: nothing here
// reads the page, storage or the clock.
//
// A task is in one of four states. 'todo' (To plan) has no driver and no day; 'planned' has both and is on that driver's day; 'done' was finished (by the driver, or by
// the office on their behalf); 'cancelled' is kept but off every list. A task a driver has not finished stays on their day until it is done: the days before today
// carry over.
import { can, scopeOf } from './access.js';
import { addDays, dayWords } from './booking-core.js';

export { addDays, dayWords };

export const TASK_STATUSES = ['todo', 'planned', 'done', 'cancelled'];
export const STATUS_WORDS = { todo: 'To plan', planned: 'Planned', done: 'Done', cancelled: 'Cancelled' };
export const STATUS_TONE = { todo: 'warn', planned: 'info', done: 'ok', cancelled: 'muted' };
export const TITLE_MAX = 120;
export const NOTES_MAX = 1000;
export const PLACE_MAX = 240;
export const MAX_MOVE = 200;   // the most tasks one move names (a column's whole list)
export const TASK_WORDS = {
  screen: 'Tasks', add: 'New task', toPlan: 'To plan', planned: 'Planned', done: 'Done', doneButton: 'Done', undo: 'Undo', cancel: 'Cancel task', reopen: 'Bring it back', moveTo: 'Move to',
  from: 'Pick up', to: 'Drop off', notes: 'Notes', none: 'No tasks', allDone: 'All done for today. Thank you.', today: 'Today’s tasks', next: 'Next', then: 'Then', late: 'From an earlier day',
};

const two = s => String(s == null ? '' : s).trim();
const clip = (s, n) => two(s).slice(0, n);
export const ymdOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
export const statusWord = s => STATUS_WORDS[s] || STATUS_WORDS.todo;
export const taskTitle = row => two(row?.title) || 'Task';

// ---- what may be saved ----
const coord = (v, lo, hi) => { const n = Number(v); return v === null || v === undefined || v === '' || !Number.isFinite(n) || n < lo || n > hi ? null : Math.round(n * 1e6) / 1e6; };
// Cleans a task as sent by the form. Returns { values } or { error }. `existing` is the row being changed: a field not sent keeps what it had. The driver and the day go together:
// both or neither (a task with a driver and no day, or a day and no driver, is not on anyone's day).
export function cleanTask(body, existing = null) {
  const b = body || {}, was = existing || {};
  const pick = (k, n) => (b[k] === undefined ? (was[k] ?? null) : (clip(b[k], n) || null));
  const title = b.title === undefined ? clip(was.title, TITLE_MAX) : clip(b.title, TITLE_MAX);
  if (!title) return { error: 'say what the task is' };
  const assignee_id = b.assignee_id === undefined ? (was.assignee_id ?? null) : (two(b.assignee_id) || null);
  const task_date = b.task_date === undefined ? (was.task_date ?? null) : (two(b.task_date) || null);
  if (!!assignee_id !== !!task_date) return { error: 'choose the driver and the day together, or leave both empty to plan it later' };
  if (task_date && !ymdOk(task_date)) return { error: 'choose a valid day' };
  const from_place = pick('from_place', PLACE_MAX), to_place = pick('to_place', PLACE_MAX);
  // A place keeps its map point only while it is still the place that point was found for.
  const point = (k, place, lo, hi) => (!place ? null : b[k] === undefined ? coord(was[k], lo, hi) : coord(b[k], lo, hi));
  let job_id = b.job_id === undefined ? (was.job_id ?? null) : (two(b.job_id) || null);
  let company_id = b.job_id === undefined && b.company_id === undefined ? (was.company_id ?? null) : (two(b.company_id) || null);
  if (!job_id) { job_id = null; company_id = null; }
  const values = { title, notes: pick('notes', NOTES_MAX), from_place, to_place, assignee_id, task_date, job_id, company_id,
    from_lat: point('from_lat', from_place, -90, 90), from_lng: point('from_lng', from_place, -180, 180), to_lat: point('to_lat', to_place, -90, 90), to_lng: point('to_lng', to_place, -180, 180) };
  return { values };
}
// What a new task opens with: nobody and no day yet, or the driver and day of the cell it was started in.
export function formStart({ assignee_id = '', task_date = '' } = {}) {
  return { title: '', notes: '', from_place: '', from_lat: null, from_lng: null, to_place: '', to_lat: null, to_lng: null, job_key: '', assignee_id, task_date };
}
export function formOf(row) {
  return { title: row.title || '', notes: row.notes || '', from_place: row.from_place || '', from_lat: row.from_lat ?? null, from_lng: row.from_lng ?? null,
    to_place: row.to_place || '', to_lat: row.to_lat ?? null, to_lng: row.to_lng ?? null, job_key: row.job_id ? `${row.company_id || ''}:${row.job_id}` : '',
    assignee_id: row.assignee_id || '', task_date: row.task_date || '' };
}
// What the form sends.
export function taskDraft(form) {
  const cut = String(form.job_key || '').indexOf(':');
  const company_id = cut > 0 ? form.job_key.slice(0, cut) : '', job_id = cut > 0 ? form.job_key.slice(cut + 1) : '';
  return { title: form.title, notes: form.notes, from_place: form.from_place, from_lat: form.from_lat, from_lng: form.from_lng, to_place: form.to_place, to_lat: form.to_lat, to_lng: form.to_lng,
    company_id, job_id, assignee_id: form.assignee_id || '', task_date: form.task_date || '' };
}
export const formProblem = form => cleanTask(taskDraft(form)).error || '';

// ---- who may do what ----
// What `me` may do to a task with these grants. Whoever plans tasks (the Tasks area at Everyone with Can plan) may change, move, finish, cancel and bring back any task.
// A driver (the area at Their own) may finish and undo only their own task, and only on a day that has been published to them (row.published is false before it is).
export function taskActions(row, me, access) {
  const plans = !!row && can(access, 'tasks', 'edit') && scopeOf(access, 'tasks') === 'all';
  const mine = !!row && !!me && row.assignee_id === me && can(access, 'tasks') && row.published !== false && row.published !== 0;
  const s = row?.status, open = s === 'todo' || s === 'planned';
  return {
    edit: plans && open,
    move: plans && (open || s === 'done'),   // dragging a finished task out of Done brings it back
    done: open && (plans || (mine && s === 'planned')),
    reopen: (s === 'done' && (plans || mine)) || (s === 'cancelled' && plans),
    cancel: plans && open,
  };
}
export const canPlan = access => can(access, 'tasks', 'edit') && scopeOf(access, 'tasks') === 'all';
export const takesTasks = access => can(access, 'takes_tasks');

// ---- the board: To plan, a column for each driver, Done ----
export const orderOf = (a, b) => String(a.task_date || '').localeCompare(String(b.task_date || '')) || (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
  || String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id));
// The board's columns for a day: { todo, drivers: [{ ...driver, rows }], done }. Planned tasks of an earlier day that are not finished stay in their driver's column,
// marked late, ahead of the day's own. Done shows what was finished on the day. Cancelled tasks are on no column.
export function boardColumns(rows, drivers, date) {
  const cols = new Map((drivers || []).map(d => [d.id, { ...d, rows: [] }]));
  const todo = [], done = [];
  for (const r of rows || []) {
    if (r.status === 'todo') todo.push(r);
    else if (r.status === 'done') { if (r.task_date === date) done.push(r); }
    else if (r.status === 'planned' && cols.has(r.assignee_id) && r.task_date <= date) cols.get(r.assignee_id).rows.push({ ...r, late: r.task_date < date });
  }
  for (const c of cols.values()) c.rows.sort(orderOf);
  todo.sort(orderOf);
  done.sort((a, b) => String(b.done_at || '').localeCompare(String(a.done_at || '')) || orderOf(a, b));
  return { todo, drivers: [...cols.values()], done };
}
// Where a card is dropped: { lane: 'todo' } | { lane: 'driver', id, date } | { lane: 'done' }. What dropping it there does, given what this person may do (taskActions):
// 'reorder' (it stays in its column and takes a new place), 'assign' (to a driver's day), 'unplan' (back to To plan), 'done', or '' when it stays where it is.
export function dropAction(row, target, acts) {
  if (!row || !target) return '';
  const s = row.status;
  if (target.lane === 'done') return s !== 'done' && acts.done ? 'done' : '';
  if (target.lane === 'todo') return s === 'todo' ? (acts.move ? 'reorder' : '') : (acts.move ? 'unplan' : '');
  if (target.lane === 'driver') {
    if (!acts.move || !target.id || !ymdOk(target.date)) return '';
    return s === 'planned' && row.assignee_id === target.id && row.task_date === target.date ? 'reorder' : 'assign';
  }
  return '';
}
// The ids of a column once `id` is placed at `index` in it (counted without `id`): the order a move sends.
export function placed(ids, id, index) {
  const rest = (ids || []).filter(x => x !== id);
  const at = Math.max(0, Math.min(rest.length, Number.isInteger(index) ? index : rest.length));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}
// The columns a task can be sent to from where it is (the "Move to" list on a phone): [[value, label, action, target]].
export function moveChoices(row, acts, drivers, date) {
  const out = [];
  const add = (value, label, target) => { const a = dropAction(row, target, acts); if (a && a !== 'reorder') out.push([value, label, a, target]); };
  add('todo', TASK_WORDS.toPlan, { lane: 'todo' });
  for (const d of drivers || []) add(`driver:${d.id}`, d.name, { lane: 'driver', id: d.id, date });
  add('done', TASK_WORDS.done, { lane: 'done' });
  return out;
}

// ---- the schedule board's driver rows: a driver's day is one cell ----
// The tasks in one driver's one day, in the order they are to be done (planned and done ones; cancelled are on no board).
export const cellRows = (rows, driverId, day) => (rows || []).filter(r => r.assignee_id === driverId && r.task_date === day && (r.status === 'planned' || r.status === 'done')).sort(orderOf);
// The ids of the tasks still to do in a cell, in order: what a move into that cell sends (a finished one keeps its place and is not named).
export const cellOpenIds = (rows, driverId, day) => cellRows(rows, driverId, day).filter(r => r.status === 'planned').map(r => r.id);
// How many tasks in a cell are done, of how many: "1 of 3".
export const cellProgress = cell => ({ done: cell.filter(r => r.status === 'done').length, total: cell.length });
// A task typed straight into a cell: what the quick add sends.
export const quickDraft = (title, driverId, day) => ({ title: clip(title, TITLE_MAX), assignee_id: driverId, task_date: day });
// The vehicle a driver holds, for their row's heading: "610" or "610, K104".
export const vehicleWords = driver => (driver?.vehicles || []).filter(Boolean).join(', ');
// Why a day is a warning for a driver ("On leave", "RDO", "Public holiday"), or ''. `off` is what the board says of that person that day: { leave, rdo, holiday }.
export const offWords = off => (off?.leave ? 'On leave' : off?.rdo ? 'RDO' : off?.holiday ? 'Public holiday' : '');

// ---- how a task reads ----
export const mapHref = (place, lat, lng) => {
  const la = Number(lat), lo = Number(lng);
  if (lat != null && lng != null && lat !== '' && lng !== '' && Number.isFinite(la) && Number.isFinite(lo)) return `https://www.google.com/maps/search/?api=1&query=${la},${lo}`;
  return two(place) ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(two(place))}` : '';
};
// The pick-up and drop-off of a task, as the lines a card shows: [{ key, label, place, href }].
export function placeLines(row) {
  const out = [];
  if (two(row?.from_place)) out.push({ key: 'from', label: TASK_WORDS.from, place: two(row.from_place), href: mapHref(row.from_place, row.from_lat, row.from_lng) });
  if (two(row?.to_place)) out.push({ key: 'to', label: TASK_WORDS.to, place: two(row.to_place), href: mapHref(row.to_place, row.to_lat, row.to_lng) });
  return out;
}
// "Kolbe Mickleham to Estia Bentleigh" for a card's second line.
export const routeWords = row => [two(row?.from_place), two(row?.to_place)].filter(Boolean).join(' to ');
export const jobWords = row => (row?.job_id ? `#${row.job_id}${two(row.job_display_name) || two(row.job_name) ? ` ${two(row.job_display_name) || two(row.job_name)}` : ''}` : '');
export const jobKeyOf = row => (row?.job_id ? `${row.company_id || ''}:${row.job_id}` : '');

// ---- the driver's day (Home in the Field view) ----
// What a driver sees from their published tasks (GET /tasks/mine) on a day: { open, done, next, total, later }. `open` is what is still to do: today's and any earlier day's that
// were never finished (in order, the earlier ones first); `done` is what was finished today; `next` is the first of `open`; `later` is the next published day with tasks, { date, count }, or null.
export function fieldDay(rows, today) {
  const mine = (rows || []).filter(r => r.status === 'planned' || r.status === 'done');
  const open = mine.filter(r => r.status === 'planned' && r.task_date <= today).sort(orderOf);
  const done = mine.filter(r => r.status === 'done' && r.task_date === today).sort((a, b) => orderOf(a, b));
  const ahead = mine.filter(r => r.status === 'planned' && r.task_date > today).sort(orderOf);
  const later = ahead.length ? { date: ahead[0].task_date, count: ahead.filter(r => r.task_date === ahead[0].task_date).length } : null;
  return { open, done, next: open[0] || null, total: open.length + done.length, later };
}
export const progressWords = (doneCount, total) => (total > 0 && doneCount >= total ? 'All done' : `${doneCount} of ${total} done`);
export const laterWords = (later, today) => (later ? `${later.date === addDays(today, 1) ? 'Tomorrow' : dayWords(later.date)}: ${later.count === 1 ? '1 task' : `${later.count} tasks`}` : '');
// Whether a task on the driver's list is from an earlier day.
export const isLate = (row, today) => row?.status === 'planned' && row.task_date < today;

// ---- with no signal: what waits on the phone ----
// Done or Undo kept in the Field view's outbox (public/offline-queue.js) until there is signal. The entry's own id goes with it as client_ref, so a resend after a lost answer
// is the same action.
export const QUEUED_ACTIONS = ['done', 'reopen'];
export function queuedDraft(row, action) {
  const words = action === 'done' ? `Mark “${taskTitle(row)}” done` : `Undo done on “${taskTitle(row)}”`;
  return { kind: 'task', method: 'POST', path: `/tasks/${encodeURIComponent(row.id)}/${action}`, body: {}, local_card: { task_id: row.id, action, words } };
}
// The tasks as the phone shows them while something waits: each with `waiting` (the action not yet sent, or null) and `failed` (the server's words when it refused one), and
// with what the action will do already showing. `entries` is this session's outbox.
export function applyQueued(rows, entries) {
  const mine = (entries || []).filter(e => e?.kind === 'task' && e.local_card?.task_id);
  return (rows || []).map(row => {
    let out = { ...row, waiting: null, failed: null };
    for (const e of mine.filter(x => x.local_card.task_id === row.id)) {
      if (e.status === 'failed') { out.failed = e.error || 'It couldn’t be sent'; continue; }
      out.waiting = e.local_card.action;
      if (e.local_card.action === 'done' && out.status === 'planned') out = { ...out, status: 'done' };
      if (e.local_card.action === 'reopen' && out.status === 'done') out = { ...out, status: 'planned' };
    }
    return out;
  });
}

// ---- telling the driver ----
// One day's tasks in a few words for the note that goes with a publish: "Thu 26 Nov: Pick up pit; Take fuel cell to Jeff YG".
export function noteLine(date, rows) {
  const open = (rows || []).filter(r => r.status === 'planned').sort(orderOf);
  const list = open.map(r => taskTitle(r) + (two(r.to_place) ? ` to ${two(r.to_place)}` : ''));
  return `${dayWords(date)}: ${list.length ? list.join('; ') : 'nothing left to do'}`;
}
// What changed for a driver's day, as the key a publish compares with what it last told them: every task on it that is not cancelled, in order. Finishing a task does not change it.
export const tasksKey = rows => (rows || []).filter(r => r.status === 'planned' || r.status === 'done').sort(orderOf).map(r => `${r.id}:${r.title}`).join('|');
