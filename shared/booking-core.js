// Bookings' own rules: a booking is one person booked for a start time and a duration (a survey, say), several a day, optionally linked to a job. The Worker
// (src/index.mjs), the web app (public/app.js) and the phone app (its own repo, Accurate_HR_Mobile, which copies this file) all use this one module, so what may
// be saved, who may do what to a booking and how a day lays out are the same everywhere. Logic only: nothing here reads the page, storage or the clock.
// A start is the company's own wall time, written 'YYYY-MM-DDTHH:MM' (what DateTimeInput gives): it never carries a zone.
import { can, scopeOf } from './access.js';

// 'declined' is what postponing was called before the board (20 Nov 2026): a booking declined then reads, and behaves, as postponed.
// 'requested' is a booking with no time yet: whoever made it left the booked person to choose it (starts_at is '').
export const BOOKING_STATUSES = ['requested', 'booked', 'postponed', 'declined', 'done', 'cancelled'];
export const STATUS_WORDS = { requested: 'To schedule', booked: 'Booked', postponed: 'Postponed', declined: 'Postponed', done: 'Done', cancelled: 'Cancelled' };
export const isRequest = row => row?.status === 'requested';
export const NO_TIME = 'No time yet';
export const isParked = row => row?.status === 'postponed' || row?.status === 'declined';
export const statusWord = s => STATUS_WORDS[s] || STATUS_WORDS.booked;
export const STATUS_TONE = { requested: 'warn', booked: 'accent', postponed: 'warn', declined: 'warn', done: 'ok', cancelled: 'muted' };

export const SNAP_MINS = 15;
export const MIN_MINS = 15;
export const MAX_MINS = 8 * 60;
export const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240, 300, 360, 420, 480];
export const DEFAULT_MINS = 60;
export const MAX_FILES = 10;
export const NOTE_MAX = 500;
export const BOOKING_WORDS = {
  screen: 'Bookings', add: 'New booking', today: 'Booked today', none: 'No bookings', declined: 'Declined', start: 'Start', done: 'Mark done', decline: 'Decline',
  move: 'Move', cancel: 'Cancel booking', reopen: 'Book again', postpone: 'Postpone', postponed: 'Postponed', schedule: 'Give it a time', visit: 'Visit notes', board: 'Board', calendar: 'Calendar',
  reasonLabel: 'Reason (sent to the person who booked it)', reasonOwn: 'Reason (optional)', moveTo: 'Move to',
  doneByTime: 'Done: time recorded on the job', doneByHand: 'Done', noJob: 'Not linked to a job',
};

const pad = n => String(n).padStart(2, '0');
const two = s => String(s == null ? '' : s).trim();
const clip = (s, n) => two(s).slice(0, n);

// ---- dates and times (plain text sums: no Date in the company's zone is ever needed) ----
const ymdOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
export const addDays = (ymd, n) => new Date(Date.parse(`${ymd}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export const isStart = s => /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(s || '') && ymdOk(String(s).slice(0, 10));
export const startDate = row => String(row?.starts_at || '').slice(0, 10);
export const startTime = row => String(row?.starts_at || '').slice(11, 16);
export const startMins = row => { const t = startTime(row); return t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : 0; };
export const endMins = row => startMins(row) + (Number(row?.duration_mins) || 0);
export const hm = mins => `${pad(Math.floor((((mins % 1440) + 1440) % 1440) / 60))}:${pad((((mins % 1440) + 1440) % 1440) % 60)}`;
export const startOf = (ymd, mins) => `${ymd}T${hm(Math.max(0, Math.min(1439, mins)))}`;
// "9:00 am" from minutes past midnight.
export const clock = mins => { const m = ((mins % 1440) + 1440) % 1440, h = Math.floor(m / 60); return `${h % 12 || 12}:${pad(m % 60)} ${h < 12 ? 'am' : 'pm'}`; };
export const timeSpan = row => `${clock(startMins(row))} to ${clock(endMins(row))}`;
export const durationLabel = mins => {
  const m = Number(mins) || 0, h = Math.floor(m / 60), r = m % 60;
  if (!h) return `${r} min`;
  return `${h} ${h === 1 ? 'hour' : 'hours'}${r ? ` ${r} min` : ''}`;
};
// "Thu 19 Nov" from a date.
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayWords = ymd => { if (!ymdOk(ymd)) return ''; const d = new Date(`${ymd}T00:00:00Z`); return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
export const whenWords = row => (isStart(row?.starts_at) ? `${dayWords(startDate(row))}, ${clock(startMins(row))}` : NO_TIME.toLowerCase());
// The Monday of the week a date is in, and that week's seven days.
export const mondayOf = ymd => addDays(ymd, -((new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7));
export const weekDays = monday => Array.from({ length: 7 }, (_, i) => addDays(monday, i));
export const snap = mins => Math.round(mins / SNAP_MINS) * SNAP_MINS;

// ---- what may be saved ----
// Cleans a booking as sent by the form. Returns { values } or { error }. `existing` is the row being changed: a field not sent keeps what it had.
export function cleanBooking(body, existing = null) {
  const b = body || {}, was = existing || {};
  const pick = (k, n) => (b[k] === undefined ? (was[k] ?? null) : (clip(b[k], n) || null));
  const employee_id = b.employee_id === undefined ? was.employee_id : two(b.employee_id);
  if (!employee_id) return { error: 'choose who to book' };
  // A request has no time: asked for outright (`requested: true`), or a request being changed without being given one.
  const request = b.requested === true || (b.requested === undefined && was.status === 'requested' && !two(b.starts_at));
  const starts_at = request ? '' : (b.starts_at === undefined ? was.starts_at : two(b.starts_at).slice(0, 16));
  if (!request && !isStart(starts_at)) return { error: 'choose the day and time' };
  const duration_mins = b.duration_mins === undefined ? Number(was.duration_mins) : Number(b.duration_mins);
  if (!Number.isInteger(duration_mins) || duration_mins < MIN_MINS || duration_mins > MAX_MINS || duration_mins % SNAP_MINS) return { error: `choose how long it takes, from ${durationLabel(MIN_MINS)} to ${durationLabel(MAX_MINS)}` };
  let job_id = b.job_id === undefined ? (was.job_id ?? null) : (two(b.job_id) || null);
  let company_id = b.job_id === undefined && b.company_id === undefined ? (was.company_id ?? null) : (two(b.company_id) || null);
  if (!job_id) { job_id = null; company_id = null; }
  const values = {
    employee_id, starts_at, duration_mins, job_id, company_id, requested: request, wanted: request ? pick('wanted', 160) : null, type_id: b.type_id === undefined ? (was.type_id ?? null) : (two(b.type_id) || null),
    title: pick('title', 120), site_name: pick('site_name', 160), address: pick('address', 240), customer_name: pick('customer_name', 160),
    contact_name: pick('contact_name', 120), contact_phone: pick('contact_phone', 40), contact_email: pick('contact_email', 160), notes: pick('notes', 4000),
  };
  if (values.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contact_email)) return { error: 'that email address doesn’t look right' };
  if (!values.title && !values.site_name && !values.job_id) return { error: 'say what it is: a title, a site name or a job' };
  return { values };
}
// A move by the booked person: only the time and how long. Returns { values: { starts_at, duration_mins } } or { error }.
export function cleanMove(body, existing) {
  const r = cleanBooking({ starts_at: body?.starts_at, duration_mins: body?.duration_mins }, existing);
  return r.error ? r : { values: { starts_at: r.values.starts_at, duration_mins: r.values.duration_mins } };
}
// The files a save may keep or add: ones already on the booking, or ones this person has just uploaded (under their own id). [{ key, name }].
export function cleanFiles(input, existing, ownPrefix) {
  const have = new Set((existing || []).map(f => f.key));
  const seen = new Set(), out = [];
  for (const f of Array.isArray(input) ? input : []) {
    const key = two(f?.key);
    if (!key || key.includes('..') || seen.has(key) || !(have.has(key) || key.startsWith(ownPrefix))) continue;
    seen.add(key);
    out.push({ key, name: clip(f?.name, 120) || 'File' });
    if (out.length >= MAX_FILES) break;
  }
  return out;
}

// ---- who may do what ----
// What `me` may do to a booking with these grants. The booked person runs their own bookings: move one, postpone it, cancel it, say it is done, book it
// again, and write up the visit. Whoever may book others (everyone's bookings with the Everyone scope, else the ones they made) may do the same and change
// the rest of it. Postponing or cancelling a booking someone else made takes a reason (needsReason).
export function bookingActions(row, me, access) {
  const mine = !!row && row.employee_id === me;
  const books = !!row && can(access, 'bookings', 'edit') && (scopeOf(access, 'bookings') === 'all' || row.created_by === me);
  const s = row?.status, open = s === 'booked', parked = isParked(row) || s === 'requested', either = mine || books;
  return {
    edit: books && (open || parked),
    move: either && (open || parked),   // for a request or a parked booking this is giving it a time
    postpone: either && open,
    decline: mine && open,   // the old name for postponing, kept for a client that still sends it
    done: either && open,
    cancel: either && (open || parked),
    reopen: either && (s === 'done' || s === 'cancelled'),
    visit: either && s !== 'cancelled' && s !== 'requested',
  };
}
export const needsReason = (row, me) => !!row && row.created_by !== me;

// ---- the board: four columns a booking is dragged between ----
export const LANES = [['requested', 'To schedule'], ['scheduled', 'Scheduled'], ['postponed', 'Postponed'], ['done', 'Done'], ['cancelled', 'Cancelled']];
export const laneOf = row => (row?.status === 'requested' ? 'requested' : row?.status === 'booked' ? 'scheduled' : isParked(row) ? 'postponed' : row?.status === 'done' ? 'done' : 'cancelled');
// What dropping a booking on a column does, given what this person may do (bookingActions): 'schedule' (ask for a time), 'reopen', 'postpone', 'done',
// 'cancel', or '' when it stays where it is.
export function dropAction(row, lane, acts) {
  const from = laneOf(row);
  if (!row || from === lane || lane === 'requested') return '';   // nothing is dragged back to To schedule
  if (lane === 'scheduled') return from === 'postponed' || from === 'requested' ? (acts.move ? 'schedule' : '') : (acts.reopen ? 'reopen' : '');
  if (lane === 'postponed') return acts.postpone ? 'postpone' : '';
  if (lane === 'done') return acts.done ? 'done' : '';
  return acts.cancel ? 'cancel' : '';
}
// The columns a booking can be sent to from where it is (the "Move to" list on a phone): [[lane, label, action]].
export const moveChoices = (row, acts) => LANES.map(([lane, label]) => [lane, label, dropAction(row, lane, acts)]).filter(c => c[2]);
// Each column's cards: Scheduled in the order of the day, the others newest first.
export function boardRows(rows) {
  const out = { requested: [], scheduled: [], postponed: [], done: [], cancelled: [] };
  for (const r of rows || []) out[laneOf(r)].push(r);
  out.requested.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id)));   // the longest waiting first
  out.scheduled.sort((a, b) => a.starts_at.localeCompare(b.starts_at) || String(a.id).localeCompare(String(b.id)));
  for (const k of ['postponed', 'done', 'cancelled']) out[k].sort((a, b) => String(b.updated_at || b.created_at || '').localeCompare(String(a.updated_at || a.created_at || '')) || b.starts_at.localeCompare(a.starts_at));
  return out;
}
// "Rescheduled, was Thu 19 Nov, 9:00 am" for a booking that has been given a new time; '' otherwise.
export const rescheduledWords = row => (row?.status === 'booked' && isStart(row.previous_start) && row.previous_start !== row.starts_at ? `Rescheduled, was ${whenWords({ starts_at: row.previous_start })}` : '');
// What the booked person writes up after the visit.
export const cleanVisit = body => ({ visit_notes: clip(body?.visit_notes, 4000) || null });
export const hasVisit = row => !!(two(row?.visit_notes) || (row?.visit_files || []).length);
export const visitFilePath = (row, n) => `/bookings/${encodeURIComponent(row.id)}/visit-files/${n}`;
// Whether these grants show a booking to `me` at all.
// The project manager of the booking's job (pm_id) reads it too: they are told about every step, and the note links here.
// So do the people also attending it (row.people): they read it and are told about it, and that is all.
export const isAttending = (row, me) => (row?.people || []).some(p => p.id === me);
export const canSeeBooking = (row, me, access) => !!row && (row.employee_id === me || row.created_by === me || (!!row.pm_id && row.pm_id === me) || isAttending(row, me) || scopeOf(access, 'bookings') === 'all');
export const canBook = access => can(access, 'bookings', 'edit');
export const takesBookings = access => can(access, 'takes_bookings');

// ---- how a booking reads ----
export const bookingTitle = row => two(row?.title) || two(row?.site_name) || two(row?.job_display_name) || two(row?.job_name) || (row?.job_id ? `Job ${row.job_id}` : 'Booking');
export const jobWords = row => row?.job_id ? `#${row.job_id}${two(row.job_display_name) || two(row.job_name) ? ` ${two(row.job_display_name) || two(row.job_name)}` : ''}` : '';
// The second line of a row: the site (when the title is not already it), the customer, the address.
export function bookingMeta(row) {
  const title = bookingTitle(row);
  return [row?.site_name, row?.customer_name, row?.address].map(two).filter((v, i, a) => v && v !== title && a.indexOf(v) === i).join(' · ');
}
export const jobKeyOf = row => (row?.job_id ? `${row.company_id || ''}:${row.job_id}` : '');
export const telHref = phone => { const d = two(phone).replace(/[^\d+]/g, ''); return d ? `tel:${d}` : ''; };
export const mapHref = address => (two(address) ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(two(address))}` : '');
export const filePath = (row, n) => `/bookings/${encodeURIComponent(row.id)}/files/${n}`;

// ---- the form ----
// What a new booking opens with: who, when, and what a job gives it.
export function formStart({ employee_id = '', starts_at = '', duration_mins = DEFAULT_MINS, job = null } = {}) {
  return { employee_id, starts_at, duration_mins, requested: false, wanted: '', type_id: '', people_ids: [], title: '', job_key: job ? `${job.company_id}:${job.id}` : '', notes: '', contact_name: '', contact_phone: '', contact_email: '',
    site_name: '', address: '', customer_name: '', files: [], ...fromJob(job) };
}
// What picking a job fills in: its site, address and customer (each still the booker's to change).
export function fromJob(job) {
  if (!job) return {};
  return { site_name: two(job.site_name) || two(job.display_name) || two(job.name), address: two(job.site_address), customer_name: two(job.customer_name) };
}
export function formOf(row) {
  return { employee_id: row.employee_id, starts_at: row.starts_at, duration_mins: row.duration_mins, requested: isRequest(row), wanted: row.wanted || '', type_id: row.type_id || '', people_ids: (row.people || []).map(p => p.id), title: row.title || '', job_key: jobKeyOf(row), notes: row.notes || '',
    contact_name: row.contact_name || '', contact_phone: row.contact_phone || '', contact_email: row.contact_email || '', site_name: row.site_name || '', address: row.address || '',
    customer_name: row.customer_name || '', files: (row.files || []).map(f => ({ ...f })) };
}
// What the form sends.
export function bookingDraft(form) {
  const cut = String(form.job_key || '').indexOf(':');
  const company_id = cut > 0 ? form.job_key.slice(0, cut) : '', job_id = cut > 0 ? form.job_key.slice(cut + 1) : '';
  return { employee_id: form.employee_id, starts_at: form.requested ? '' : form.starts_at, requested: !!form.requested, wanted: form.requested ? form.wanted : '', duration_mins: Number(form.duration_mins), type_id: form.type_id || '', people_ids: (form.people_ids || []).filter(id => id !== form.employee_id), title: form.title, company_id, job_id,
    site_name: form.site_name, address: form.address, customer_name: form.customer_name, contact_name: form.contact_name, contact_phone: form.contact_phone,
    contact_email: form.contact_email, notes: form.notes, files: (form.files || []).map(f => ({ key: f.key, name: f.name })) };
}
export const formProblem = form => cleanBooking(bookingDraft(form)).error || '';

// ---- a day and a week ----
// The bookings that are on a calendar (declined and cancelled ones are not), by day.
export const onCalendar = row => row.status === 'booked' || row.status === 'done';
export const rowsOn = (rows, ymd, employeeId = '') => (rows || []).filter(r => onCalendar(r) && startDate(r) === ymd && (!employeeId || r.employee_id === employeeId))
  .sort((a, b) => a.starts_at.localeCompare(b.starts_at) || String(a.id).localeCompare(String(b.id)));
// The bookings parked with no time for now (postponed, and the ones declined before the board).
export const declinedRows = (rows, employeeId = '') => (rows || []).filter(r => isParked(r) && (!employeeId || r.employee_id === employeeId))
  .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
// A day's bookings laid out for a column: overlapping ones side by side. [{ row, start, mins, col, cols }], start and mins in minutes.
export function layoutDay(rows) {
  const list = [...(rows || [])].sort((a, b) => startMins(a) - startMins(b) || endMins(b) - endMins(a) || String(a.id).localeCompare(String(b.id)));
  const out = [];
  let group = [], groupEnd = -1, colEnds = [];
  const close = () => { for (const g of group) g.cols = colEnds.length; group = []; colEnds = []; groupEnd = -1; };
  for (const row of list) {
    const start = startMins(row), end = Math.min(1440, Math.max(endMins(row), start + MIN_MINS));
    if (group.length && start >= groupEnd) close();
    let col = colEnds.findIndex(e => e <= start);
    if (col < 0) { col = colEnds.length; colEnds.push(end); } else colEnds[col] = end;
    const item = { row, start, mins: end - start, col, cols: 1 };
    group.push(item); out.push(item);
    groupEnd = Math.max(groupEnd, end);
  }
  close();
  return out;
}
// The hours a week's grid shows: 6 am to 6 pm, wider when a booking sits outside it. { from, to } in whole hours' minutes.
export function gridHours(rows) {
  let from = 6 * 60, to = 18 * 60;
  for (const r of (rows || []).filter(onCalendar)) { from = Math.min(from, Math.floor(startMins(r) / 60) * 60); to = Math.max(to, Math.min(1440, Math.ceil(endMins(r) / 60) * 60)); }
  return { from, to };
}
// Where a booking dropped on a day at a time lands: the new start, snapped, kept inside the day.
export const movedTo = (row, ymd, mins) => startOf(ymd, Math.max(0, Math.min(1440 - SNAP_MINS, snap(mins))));
// The booked person's day on Home: what is still to do first, then what is done.
export const todayRows = (rows, today, me) => rowsOn(rows, today, me).sort((a, b) => (a.status === 'done') - (b.status === 'done') || a.starts_at.localeCompare(b.starts_at));
// Whether a card's time closes a booking: the same person, the booking's day, and its job among the card's jobs. `splits` is [{ company_id, job_id }].
export function closedByCard(row, card, splits) {
  if (!row || row.status !== 'booked' || !row.job_id || !card?.clock_off || startDate(row) !== card.work_date) return false;
  return (splits || []).some(s => String(s.job_id || '') === String(row.job_id) && String(s.company_id || '') === String(row.company_id || ''));
}

// ---- clashes: what else the person has on at that time (a warning, never a block) ----
export const overlaps = (a, b) => startDate(a) === startDate(b) && startMins(a) < endMins(b) && startMins(b) < endMins(a);
// The other bookings of the same person that overlap `row` (booked ones only; not itself).
export const overlapping = (row, rows) => (rows || []).filter(r => r.id !== row.id && r.status === 'booked' && (r.employee_id === row.employee_id || isAttending(r, row.employee_id)) && isStart(r.starts_at) && overlaps(row, r));
// One clash in words. { kind: 'booking' | 'leave' | 'holiday', title?, starts_at?, duration_mins?, name? }; a booking the asker may not open has no title.
export function clashWords(c) {
  if (c.kind === 'booking') return `Overlaps ${c.title ? `${c.title}, ` : 'another booking, '}${timeSpan(c)}`;
  if (c.kind === 'leave') return 'On approved leave that day';
  if (c.kind === 'holiday') return `${c.name || 'A public holiday'} is a public holiday`;
  return '';
}
// A person's bookings on a day in a few words, for the schedule board: "9:00 am Kolbe College, 1:00 pm Riser check".
export const dayBookingWords = rows => (rows || []).filter(r => isStart(r.starts_at)).sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map(r => `${clock(startMins(r))} ${bookingTitle(r)}`).join(', ');

// ---- reminders: the evening before, and about an hour before ----
// `nowAt` is the company's own wall time, 'YYYY-MM-DDTHH:MM' (the caller reads the clock; nothing here does).
export const addMins = (at, n) => new Date(Date.parse(`${at}:00Z`) + n * 60000).toISOString().slice(0, 16);
export const EVENING_HOUR = 18;
// A booking due its hour-before note: booked, starting in 20 to 70 minutes (the check runs every ten), and not already reminded for this start (a booking
// moved afterwards is reminded again; one made less than 20 minutes ahead is not reminded at all).
export const dueSoon = (row, nowAt) => row?.status === 'booked' && isStart(row.starts_at) && row.starts_at > addMins(nowAt, 20) && row.starts_at <= addMins(nowAt, 70) && row.reminded_hour !== row.starts_at;
// A booking due its evening-before note: booked for tomorrow, from 6 pm, and not already told for this start.
export const dueEvening = (row, nowAt) => row?.status === 'booked' && isStart(row.starts_at) && Number(String(nowAt).slice(11, 13)) >= EVENING_HOUR
  && startDate(row) === addDays(String(nowAt).slice(0, 10), 1) && row.reminded_eve !== row.starts_at;
const whereWords = row => [two(row?.site_name) !== bookingTitle(row) ? two(row?.site_name) : '', two(row?.address)].filter(Boolean).join(', ');
// The hour-before note: when and what, then where and who to ask for.
export function soonNote(row) {
  const contact = [two(row.contact_name), two(row.contact_phone)].filter(Boolean).join(' ');
  return { title: `At ${clock(startMins(row))}: ${bookingTitle(row)}`, body: [whereWords(row), contact && `Ask for ${contact}`].filter(Boolean).join(' · ') || durationLabel(row.duration_mins) };
}
// The evening-before note: one note for all of tomorrow's bookings, in the order of the day.
export function eveningNote(rows) {
  const list = [...rows].sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  return { title: `Tomorrow: ${list.length === 1 ? '1 booking' : `${list.length} bookings`}, first at ${clock(startMins(list[0]))}`,
    body: list.map(r => [`${clock(startMins(r))} ${bookingTitle(r)}`, whereWords(r)].filter(Boolean).join(', ')).join('\n') };
}

// ---- with no signal: what waits on the phone ----
// A booking action kept in the Field view's outbox (public/offline-queue.js) until there is signal: postpone, done, or the visit notes. The entry's own id goes
// with it as client_ref, so a resend after a lost answer is the same action.
export const QUEUED_ACTIONS = ['postpone', 'done', 'visit'];
export function queuedDraft(row, action, body = {}) {
  const words = action === 'postpone' ? `Postpone “${bookingTitle(row)}”` : action === 'done' ? `Mark “${bookingTitle(row)}” done` : `Visit notes for “${bookingTitle(row)}”`;
  return { kind: 'booking', method: 'POST', path: `/bookings/${encodeURIComponent(row.id)}/${action}`, body: { ...body },
    local_card: { booking_id: row.id, action, words, note: body.note || null, visit_notes: body.visit_notes ?? null } };
}
// The bookings as the phone shows them while something waits: each with `waiting` (the action not yet sent, or null) and `failed` (the server's words when it
// refused one), and with what the action will do already showing (postponed, done, the notes as typed). `entries` is this session's outbox.
export function applyQueued(rows, entries) {
  const mine = (entries || []).filter(e => e?.kind === 'booking' && e.local_card?.booking_id);
  return (rows || []).map(row => {
    let out = { ...row, waiting: null, failed: null };
    for (const e of mine.filter(x => x.local_card.booking_id === row.id)) {
      const c = e.local_card;
      if (e.status === 'failed') { out.failed = e.error || 'It couldn’t be sent'; continue; }
      out.waiting = c.action;
      if (c.action === 'postpone' && out.status === 'booked') out = { ...out, status: 'postponed', decision_note: c.note };
      if (c.action === 'done' && out.status === 'booked') out = { ...out, status: 'done', done_how: 'manual' };
      if (c.action === 'visit') out = { ...out, visit_notes: c.visit_notes };
    }
    return out;
  });
}

// ---- the edge drag: a new length for a booking on the calendar ----
// The length a booking has when its bottom edge is dragged to `endAt` minutes past midnight: on the quarter hour, from 15 minutes to 8 hours, never past midnight.
export const resizedTo = (row, endAt) => Math.max(MIN_MINS, Math.min(MAX_MINS, 1440 - startMins(row), snap(endAt - startMins(row))));

// ---- booking types: a company's own kinds of booking ----
// The app's eight tints (the same names the schedule's job tags use), so a type reads in the dark look and in Sunlight.
export const TYPE_COLOURS = ['blue', 'green', 'teal', 'violet', 'pink', 'orange', 'amber', 'slate'];
export const USUAL_TYPES = [{ name: 'Survey', colour: 'blue', default_mins: 60 }, { name: 'Inspection', colour: 'teal', default_mins: 45 }, { name: 'Measure-up', colour: 'orange', default_mins: 30 }];
export const MAX_TYPES = 20;
// Cleans the list the editor sends ([{ id?, name, colour, default_mins }]). Returns { types } or { error }.
export function cleanTypes(list) {
  if (!Array.isArray(list) || list.length > MAX_TYPES) return { error: `a company keeps up to ${MAX_TYPES} booking types` };
  const seen = new Set(), types = [];
  for (const t of list) {
    const name = clip(t?.name, 40);
    if (!name) return { error: 'give each type a name' };
    if (seen.has(name.toLowerCase())) return { error: `“${name}” is listed twice` };
    seen.add(name.toLowerCase());
    const default_mins = Number(t?.default_mins);
    if (!Number.isInteger(default_mins) || default_mins < MIN_MINS || default_mins > MAX_MINS || default_mins % SNAP_MINS) return { error: `choose how long “${name}” usually takes` };
    types.push({ id: two(t?.id) || null, name, colour: TYPE_COLOURS.includes(t?.colour) ? t.colour : TYPE_COLOURS[0], default_mins });
  }
  return { types };
}
// The types offered in the form: the ones still on the list, and the one a booking already has even if it has since been taken off.
export const typesFor = (types, currentId) => (types || []).filter(t => t.active || t.id === currentId);
