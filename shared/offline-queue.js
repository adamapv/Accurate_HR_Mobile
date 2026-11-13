// The Field view's outbox (ACC-158): what someone does to their job cards — clock on, clock off,
// add time, change or delete a card — is written here first and sent from here, in order, online
// or not. With no signal it waits; the app replays it when the connection returns, when it comes
// back to the front, and on a timer while anything is waiting. Shared by the browser and the node
// test, so it takes its storage, its sender and its clock as arguments and touches no globals.
//
// Every entry is tagged with the session fingerprint the service worker uses for its offline
// copies (the first 8 bytes of SHA-256 over "Bearer <sid>", as hex), and every read and replay is
// for one fingerprint: a phone that several people share never shows, or sends as, another
// person's work. clear() drops the lot (sign-out, a new sign-in).
//
// An entry: { id, sid, kind, method, path, body, at, status: 'pending' | 'failed', error, local_card }.
//   kind is 'clock-on' | 'clock-off' | 'add' | 'change' | 'delete' (wording only, see describe()), or 'chat-send':
//   a chat message (path '/chat/threads/<id>/messages', body { body, reply_to_id }; local_card is { body, reply } for the
//   bubble that waits). Its client_ref is the entry id too, which the server answers with the message it already has,
//   so a retry never sends a chat message twice. Chat entries are not job cards: isChat() tells them apart, and the job
//   card views (applyToOpenCard, applyToWeek) leave them alone.
//   A third kind is 'swms-signon': signing on to a SWMS on a job (path '/job-safety/signons', body { company_id, job_id, swms_id, version, signature_name,
//   signed_at_phone }, local_card { job_id, job_label, swms_title, version, signed_name } for the screens while it waits). It is a POST like any other, so its
//   client_ref is the entry id and the server answers a sign-on it already has for it. isSignOn() tells it apart; the job card views leave it alone too.
//   A fourth is 'job-run': ticking a job checklist (path '/job-safety/runs', body { company_id, job_id, checklist_id, run_date, items }, local_card { job_id, job_label,
//   checklist_id, checklist_name, phase, held } where held lists the required items that were Not OK, which is what holds Start on the phone). Its client_ref is the entry
//   id and the server answers a run it already has for it. isJobRun() tells it apart; the job card views leave it alone too.
//   path is '/job-cards' (a new card), '/job-cards/<server id>' or '/job-cards/local:<entry id>'
//   (a card that has not been sent yet: a change or delete of one collapses into its own POST).
//   A new card's body carries client_ref = the entry id, so a reply lost on the way never makes a
//   second card: the server answers the existing card for a ref it has seen.
//   local_card is the card as the phone sees it (work_date, clock_on, clock_off, job_id, job_label,
//   company_id, splits, lunch, notes, activity_id, activity_label), for the screens while it waits.
//
// Replay outcomes, by what send() throws: no `status` on the error (fetch failed, timed out) → the
// phone has no signal: stop, keep everything; 401 → the session is gone: stop; 5xx → the server is
// having a moment: stop, keep; any other 4xx → the server refused this one: it is marked failed
// with the server's words (shown with Retry and Discard) and the rest still go.

export class QueueFullError extends Error {
  constructor() { super('Too much is waiting to be sent from this phone — get some signal first'); this.name = 'QueueFullError'; }
}

export const QUEUE_KEY = 'hrhead_offline_queue';
export const isChat = entry => entry?.kind === 'chat-send';
export const isSignOn = entry => entry?.kind === 'swms-signon';
export const isJobRun = entry => entry?.kind === 'job-run';
const isLocal = path => /^\/job-cards\/local:/.test(path || '');
const localId = path => String(path).slice('/job-cards/local:'.length);

export function createQueue({ storage, send, now = () => Date.now(), random = () => Math.random().toString(36).slice(2, 10), maxEntries = 50, maxBytes = 200000 } = {}) {
  let entries = load();
  let version = 0;
  const listeners = new Set();
  let replaying = null;

  function load() {
    try {
      const raw = storage.get();
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed?.entries) ? parsed.entries : [];
    } catch { return []; }
  }
  function persist() {
    version++;
    try { entries.length ? storage.set(JSON.stringify({ v: 1, entries })) : storage.remove(); } catch {}
    for (const fn of listeners) { try { fn(); } catch {} }
  }
  const forSid = sid => entries.filter(e => e.sid === sid);
  const newId = () => `q${now().toString(36)}${random()}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);

  // Puts a draft ({ kind, method, path, body, local_card }) in the queue for this session and returns the
  // entry it became: a change or delete of a card that has not been sent yet rewrites or removes that
  // card's own POST instead of adding to the queue (removed: true when it did).
  function enqueue(sid, draft) {
    if (!sid) throw new Error('Your sign-in needs refreshing — sign out and back in, then try again.'); // the browser has lost its copy of the session id (app.js keeps it again on the next load)
    const method = String(draft.method || 'POST').toUpperCase();
    if (isLocal(draft.path)) {
      const target = entries.find(e => e.sid === sid && e.id === localId(draft.path) && e.method === 'POST');
      if (!target) throw new Error('that card was already sent — refresh and try again');
      if (method === 'DELETE') {
        entries = entries.filter(e => e !== target);
        persist();
        return { removed: true, entry: target };
      }
      target.body = { ...draft.body, client_ref: target.id };
      target.local_card = { ...target.local_card, ...(draft.local_card || {}) };
      target.kind = draft.kind || target.kind;
      target.status = 'pending'; target.error = null; target.at = now();
      persist();
      return { entry: target };
    }
    const entry = { id: newId(), sid, kind: draft.kind || (method === 'POST' ? 'add' : method === 'DELETE' ? 'delete' : 'change'),
      method, path: draft.path, body: draft.body ? { ...draft.body } : null, at: now(), status: 'pending', error: null, local_card: draft.local_card || null };
    if (method === 'POST') entry.body = { ...(entry.body || {}), client_ref: entry.id };
    if (forSid(sid).length >= maxEntries) throw new QueueFullError();
    const next = [...entries, entry];
    if (JSON.stringify({ v: 1, entries: next }).length > maxBytes) throw new QueueFullError();
    entries = next;
    persist();
    return { entry };
  }

  // Sends this session's pending entries in order. One replay at a time: a second call while one runs
  // waits for it and then runs itself. Returns { sent: [{ id, result }], failed, stopped }.
  function replay(sid) {
    const run = async () => {
      const out = { sent: [], failed: 0, stopped: null };
      for (const entry of forSid(sid)) {
        if (entry.status !== 'pending') continue;
        let result;
        try { result = await send(entry); }
        catch (e) {
          const status = e?.status;
          if (status == null) { out.stopped = 'network'; break; }
          if (status === 401) { out.stopped = 'auth'; break; }
          if (status >= 500) { out.stopped = 'server'; break; }
          entry.status = 'failed'; entry.error = e.message || `Request failed (${status})`; entry.error_status = status;
          out.failed++;
          persist();
          continue;
        }
        entries = entries.filter(e => e !== entry);
        out.sent.push({ id: entry.id, entry, result });
        persist();
      }
      return out;
    };
    const p = (replaying || Promise.resolve()).then(run, run);
    replaying = p.finally(() => { if (replaying === p) replaying = null; });
    return p;
  }

  // What the Field view calls: queue the draft, then send straight away when there is signal.
  // → { outcome: 'sent', entry, result } | { outcome: 'pending', entry } | { outcome: 'removed' };
  // a refusal from the server on an immediate send is dropped from the queue and thrown, so the
  // form shows it as it always did.
  async function submit(sid, draft, { online = true } = {}) {
    const put = enqueue(sid, draft);
    if (put.removed) return { outcome: 'removed', entry: put.entry };
    const entry = put.entry;
    if (!online) return { outcome: 'pending', entry };
    const r = await replay(sid);
    const hit = r.sent.find(s => s.id === entry.id);
    if (hit) return { outcome: 'sent', entry, result: hit.result };
    const still = entries.find(e => e.id === entry.id);
    if (still?.status === 'failed') {
      entries = entries.filter(e => e !== still);
      persist();
      const err = new Error(still.error); err.status = still.error_status; err.entry = still;
      throw err;
    }
    return { outcome: 'pending', entry };
  }

  function retry(id) {
    const e = entries.find(x => x.id === id);
    if (!e) return false;
    e.status = 'pending'; e.error = null;
    persist();
    return true;
  }
  function discard(id) {
    const before = entries.length;
    entries = entries.filter(x => x.id !== id);
    if (entries.length !== before) persist();
    return entries.length !== before;
  }
  function clear() { entries = []; persist(); }
  function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  const snapshot = () => version;

  return { newId, entries: forSid, enqueue, replay, submit, retry, discard, clear, subscribe, snapshot, pending: sid => forSid(sid).filter(e => e.status === 'pending').length };
}

// One line for a waiting or failed entry: "Clock on at 07:12 on #4471".
export function describe(entry) {
  const c = entry.local_card || entry.body || {};
  const what = c.job_label || (c.job_id ? `#${c.job_id}` : c.activity_label || '');
  const on = what ? ` on ${what}` : '';
  switch (entry.kind) {
    case 'job-run': return `Tick “${c.checklist_name || 'a checklist'}”${on}`;
    case 'swms-signon': return `Sign on to “${c.swms_title || 'a SWMS'}”${on}`;
    case 'chat-send': { const t = String(c.body || '').replace(/\s+/g, ' ').trim(); return `Message “${t.length > 40 ? `${t.slice(0, 40)}…` : t}”`; }
    case 'clock-on': return `Clock on at ${c.clock_on}${on}`;
    case 'clock-off': return `Clock off at ${c.clock_off}${on}`;
    case 'delete': return `Delete your ${c.clock_on || ''} card${on}`.replace('  ', ' ');
    case 'change': return `Change to your ${c.clock_on || ''} card${on}`.replace('  ', ' ');
    default: return c.clock_off ? `Time ${c.clock_on}–${c.clock_off}${on}` : `Clock on at ${c.clock_on}${on}`;
  }
}

// The open card as the phone sees it: the server's card with this session's pending entries laid
// over it. → { card, pending, clockedOff }: a pending clock-on is an open card with id local:<entry
// id>; a pending clock-off hides the card and says so.
export function applyToOpenCard(serverCard, entries) {
  let card = serverCard || null, pending = false, clockedOff = false;
  for (const e of entries) {
    if (e.status !== 'pending' || isChat(e) || isSignOn(e) || isJobRun(e)) continue;
    if (e.method === 'POST') {
      if (!e.body?.clock_off && !e.local_card?.clock_off) { card = { id: `local:${e.id}`, ...(e.local_card || e.body), pending: true, client_ref: e.id }; pending = true; clockedOff = false; }
      continue;
    }
    const target = e.path.replace('/job-cards/', '');
    if (!card || String(card.id) !== target) continue;
    if (e.method === 'DELETE') { card = null; pending = true; continue; }
    if (e.body?.clock_off) { card = null; clockedOff = true; pending = true; continue; }
    card = { ...card, ...(e.local_card || e.body), id: card.id, pending: true }; pending = true;
  }
  return { card, pending, clockedOff };
}

const hmM = s => { const [hh, mm] = String(s).split(':').map(Number); return hh * 60 + mm; };
const nextDate = ymd => new Date(Date.parse(`${ymd}T00:00:00Z`) + 864e5).toISOString().slice(0, 10);
// A card that clocks off before it clocked on is a night shift that ran past midnight (its time after midnight is on the next date).
const overnight = c => !!c?.clock_on && !!c?.clock_off && hmM(c.clock_off) < hmM(c.clock_on);

// This week as the phone sees it: pending cards added (laid out as time with planBlocks, the same
// rule as the server's), pending changes applied, pending deletes taken out, the total re-added.
// planBlocks(clock_on, clock_off, lunch, splits) → { blocks: [{ split, start, end, day? }] } (day 1: after midnight, on the next date).
// A night shift's time after midnight is on the next date, so it is in this week when that date is, whichever week the card started in
// (the card then comes carried in, like the server's).
export function applyToWeek(week, entries, planBlocks) {
  if (!week?.period) return week;
  const inWeek = d => d >= week.period.period_start && d <= week.period.period_end;
  // The card is in the week when it starts in it, or when the part after midnight does.
  const touches = c => inWeek(c.work_date) || (overnight(c) && c.clock_off !== '00:00' && inWeek(nextDate(c.work_date)));
  const placed = c => (inWeek(c.work_date) ? c : { ...c, carry_in: true });
  let cards = [...(week.cards || [])], times = [...(week.entries || [])];
  let pending = 0;
  const layOut = card => {
    if (!card.clock_off) return [];
    const splits = card.splits?.length ? card.splits : [{ pct: 100 }];
    return (planBlocks(card.clock_on, card.clock_off, !!card.lunch, splits).blocks || []).map((b, i) => ({
      id: `${card.id}:${i}`, card_id: card.id, employee_id: card.employee_id, work_date: b.day ? nextDate(card.work_date) : card.work_date, start_time: b.start, end_time: b.end,
      company_id: splits[b.split]?.company_id || card.company_id, job_id: splits[b.split]?.job_id || card.job_id || '', job_label: card.job_label,
      activity_id: card.activity_id || null, activity_label: card.activity_label || null, pending: true
    })).filter(t => inWeek(t.work_date));
  };
  for (const e of entries) {
    if (e.status !== 'pending' || isChat(e) || isSignOn(e) || isJobRun(e)) continue;
    if (e.method === 'POST') {
      const card = { id: `local:${e.id}`, ...(e.local_card || e.body), pending: true };
      if (!card.work_date || !touches(card)) continue;
      cards.push(placed(card)); times.push(...layOut(card)); pending++;
      continue;
    }
    const target = e.path.replace('/job-cards/', '');
    const i = cards.findIndex(c => String(c.id) === target);
    if (i < 0) continue;
    pending++;
    times = times.filter(t => String(t.card_id) !== target);
    if (e.method === 'DELETE') { cards.splice(i, 1); continue; }
    const card = { ...cards[i], ...(e.local_card || e.body), id: cards[i].id, pending: true };
    if (touches(card)) { cards[i] = placed(card); times.push(...layOut(card)); } else cards.splice(i, 1);
  }
  const mins = t => { const [a, b] = [t.start_time, t.end_time].map(s => { const [hh, mm] = String(s).split(':').map(Number); return hh * 60 + mm; }); return Math.max(0, b - a); };
  const total = times.reduce((n, t) => n + mins(t), 0) / 60;
  return { ...week, cards, entries: times, total_hours: total, billable_hours: total, pending };
}

// The finished cards of the last few days as the phone sees them (GET /job-cards/open → recent: { id, work_date, clock_on, clock_off }) with this
// session's pending entries laid over them: a clock-off the server has not heard yet still ends a shift (and so starts a rest period), a card that waited
// as one is added, a change is applied and a delete takes the card out. → [{ id, work_date, clock_on, clock_off }]
export function applyToRecent(recent, entries) {
  const cards = [...(recent || [])];
  const shape = (id, c) => ({ id, work_date: c.work_date, clock_on: c.clock_on, clock_off: c.clock_off });
  for (const e of entries) {
    if (e.status !== 'pending' || isChat(e) || isSignOn(e) || isJobRun(e)) continue;
    const c = { ...(e.body || {}), ...(e.local_card || {}) };
    if (e.method === 'POST') {
      if (c.work_date && c.clock_on && c.clock_off) cards.push(shape(`local:${e.id}`, c));
      continue;
    }
    const target = e.path.replace('/job-cards/', '');
    const i = cards.findIndex(x => String(x.id) === target);
    if (e.method === 'DELETE') { if (i >= 0) cards.splice(i, 1); continue; }
    // A change, or the clock-off of the open card: it is a finished card now.
    if (c.work_date && c.clock_on && c.clock_off) { if (i >= 0) cards[i] = shape(cards[i].id, c); else cards.push(shape(target, c)); }
    else if (i >= 0) cards.splice(i, 1);
  }
  return cards;
}
