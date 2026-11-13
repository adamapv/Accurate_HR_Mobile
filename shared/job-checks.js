// The phone's Start and Finish checks (ACC-330): what a person has to do on a job before Start, and how a checklist is answered. Shared by the browser and the node tests,
// so it touches no globals. The server (routeJobSafety) is the authority on what is stored: this is what the phone shows and holds on to while it decides, and what the
// answers look like before they are sent. A job's start checks are, in order, signing on to each SWMS on it and then ticking each start checklist that goes with it; Start is
// held until none is outstanding (handbook Q55) and while a required item is Not OK in the latest tick of a checklist (Q54), until it is ticked again with it put right.
// Nothing here is a permission: who sees any of it is the Job safety area, checked by the routes.

export const STATES = ['ok', 'fail', 'na'];
export const STATE_LABELS = { ok: 'OK', fail: 'Not OK', na: 'Not applicable' };
export const MAX_PHOTOS = 3;   // per item, as the server allows

// The answers so far ({ [item_id]: { state, note, photos } }) against a checklist's items: what is still wrong with them, in the order of the items.
// Nothing is wrong when every item is answered, a required item is not "not applicable", a Not OK says what is wrong, and an item that wants a photo has one when it is OK.
export function answerProblems(items, answers) {
  const out = [];
  for (const it of items || []) {
    const a = answers?.[it.id] || {};
    if (!STATES.includes(a.state)) out.push({ item_id: it.id, text: `Answer “${it.label}”` });
    else if (a.state === 'na' && it.required) out.push({ item_id: it.id, text: `“${it.label}” can’t be marked not applicable` });
    else if (a.state === 'fail' && !String(a.note || '').trim()) out.push({ item_id: it.id, text: `Say what’s wrong with “${it.label}”` });
    else if (a.state === 'ok' && it.needs_photo && !(a.photos || []).length) out.push({ item_id: it.id, text: `Add a photo of “${it.label}”` });
  }
  return out;
}
// The answers as the server wants them (POST job-safety/runs items): every item once, a note only on a Not OK, photos only where the item is not "not applicable".
export function runItems(items, answers) {
  return (items || []).map(it => {
    const a = answers?.[it.id] || {};
    return { item_id: it.id, state: a.state, ...(a.state === 'fail' ? { note: String(a.note || '').trim() } : {}), ...(a.state !== 'na' && (a.photos || []).length ? { photos: a.photos.slice(0, MAX_PHOTOS) } : {}) };
  });
}
// The labels of the required items answered Not OK: what holds a person from starting (or says the finish was not clean).
export const failedRequired = (items, answers) => (items || []).filter(it => it.required && answers?.[it.id]?.state === 'fail').map(it => it.label);

const sameJob = (e, job) => String(e?.body?.job_id) === String(job.job_id) && String(e?.body?.company_id) === String(job.company_id);
// 'pending' is saved on the phone and not sent yet. 'sent' is what the phone sent a moment ago and has not yet had the server's answer for (app.js keeps it for a few seconds
// beside the outbox), so the screen does not fall back to its older copy in between: the same rules apply, except that it is no longer waiting to be sent.
const pending = e => e?.status === 'pending' || e?.status === 'sent';

// Where a person is with one checklist on a job today, from the server's answer (done_today, held) and what is saved on the phone and not sent yet (queued: outbox
// entries of kind job-run, whose local_card.held lists the required items that were Not OK). A tick saved on the phone counts as done, the latest one wins, and
// "held" is a required item Not OK in it. → 'todo' | 'waiting' | 'done' | 'held'.
export function checkState(list, job, queued = [], today = '') {
  const mine = (queued || []).filter(e => e?.kind === 'job-run' && pending(e) && sameJob(e, job) && e.body?.checklist_id === list.id && (!today || !e.body?.run_date || e.body.run_date === today));
  const local = mine[mine.length - 1];
  if (local) return (local.local_card?.held || []).length ? 'held' : local.status === 'sent' ? 'done' : 'waiting';
  if (list.done_today) return (list.held || []).length ? 'held' : 'done';
  return 'todo';
}
// The labels behind a held checklist: the latest tick on the phone if there is one waiting, the server's otherwise.
export function heldItems(list, job, queued = [], today = '') {
  const mine = (queued || []).filter(e => e?.kind === 'job-run' && pending(e) && sameJob(e, job) && e.body?.checklist_id === list.id && (!today || !e.body?.run_date || e.body.run_date === today));
  return mine.length ? (mine[mine.length - 1].local_card?.held || []) : (list.held || []);
}
// Is a sign-on to this statement on this job saved on the phone and not sent yet?
const signOnWaiting = (queued, job, x) => (queued || []).some(e => e?.kind === 'swms-signon' && pending(e) && e.body?.swms_id === x.id && sameJob(e, job) && Number(e.body?.version) >= x.version);

// The steps between a person and starting a job: each statement on it (done when signed on, or when the sign-on is saved on the phone), then each start checklist.
// `swms` is the job's entries from for-jobs, `lists` its checklists from for-jobs (checks). → { steps, ready, held, outstanding }:
//   steps: [{ kind: 'swms' | 'checklist', id, title, state: 'todo' | 'waiting' | 'done' | 'held', held? }]; ready: nothing is outstanding, so Start is open;
//   held: some checklist has a required item Not OK; outstanding: the steps still to do (todo or held).
export function startGate({ job, swms = [], lists = [], queued = [], today = '' }) {
  const steps = [
    ...swms.map(x => ({ kind: 'swms', id: x.id, title: x.title, state: x.signed ? 'done' : signOnWaiting(queued, job, x) ? 'waiting' : 'todo' })),
    ...lists.filter(l => l.phase === 'start').map(l => {
      const state = checkState(l, job, queued, today);
      return { kind: 'checklist', id: l.id, title: l.name, state, ...(state === 'held' ? { held: heldItems(l, job, queued, today) } : {}) };
    })
  ];
  const outstanding = steps.filter(s => s.state === 'todo' || s.state === 'held');
  return { steps, ready: outstanding.length === 0, held: steps.some(s => s.state === 'held'), outstanding };
}
// The same for the checklists a person ticks when finishing a job: nothing holds them (clocking off is never blocked), but a Not OK is said.
export function finishChecks({ job, lists = [], queued = [], today = '' }) {
  return lists.filter(l => l.phase === 'finish').map(l => {
    const state = checkState(l, job, queued, today);
    return { kind: 'checklist', id: l.id, title: l.name, state, ...(state === 'held' ? { held: heldItems(l, job, queued, today) } : {}) };
  });
}
// One sentence for why Start is held, or '' when it is not.
export function holdText(gate) {
  if (!gate || gate.ready) return '';
  const held = gate.outstanding.find(s => s.state === 'held');
  if (held) return `Start is held: ${held.held.length === 1 ? `“${held.held[0]}” was` : `${held.held.length} required items were`} not OK in “${held.title}”. Put it right and tick it again. Your supervisor has been told.`;
  const sign = gate.outstanding.filter(s => s.kind === 'swms').length, lists = gate.outstanding.filter(s => s.kind === 'checklist').length;
  return `Start is held until you ${[sign && `sign on to ${sign === 1 ? 'the statement' : `${sign} statements`}`, lists && `tick ${lists === 1 ? 'the start checklist' : `${lists} start checklists`}`].filter(Boolean).join(' and ')}.`;
}

// ---- what the phone shows and sends ----
// The jobs a person's Home asks about: the ones published for them today and tomorrow, and the one on the clock. → 'company:job,company:job' (at most 20, as the route takes).
export function safetyJobKeys(schedRows, card, today, tomorrow) {
  return [...new Set([...(schedRows || []).filter(r => !r.activity && r.job_id && (r.work_date === today || r.work_date === tomorrow)).map(r => `${r.company_id}:${r.job_id}`),
    ...(card?.job_id ? [`${card.company_id}:${card.job_id}`] : [])])].slice(0, 20).join(',');
}
// The sign-on to this statement, on this job, that is saved on the phone and not sent yet ('pending') or was sent a moment ago ('sent'), or undefined.
export const signOnEntry = (queued, job, x) => (queued || []).find(e => e?.kind === 'swms-signon' && pending(e) && e.body?.swms_id === x.id && sameJob(e, job) && Number(e.body?.version) >= x.version);
// Where a person stands with one statement on a job: 'signed', 'waiting' (saved on the phone, not sent yet) or 'needed'.
export function swmsState(x, job, queued = []) {
  const e = x.signed ? null : signOnEntry(queued, job, x);
  return x.signed || e?.status === 'sent' ? 'signed' : e ? 'waiting' : 'needed';
}
// How each state is said, with its tone: a statement's, and a checklist's (checkState).
export const SWMS_PILL = { signed: ['ok', 'Signed'], waiting: ['info', 'Waiting to send'], needed: ['warn', 'Sign on needed'] };
export const CHECK_PILL = { todo: ['warn', 'To do'], waiting: ['info', 'Waiting to send'], done: ['ok', 'Done today'], held: ['danger', 'Not OK: held'] };
// Signing on to a statement on a job, as a draft for the outbox: queued like a job card, then sent at once when there is signal, with the phone's own time so a sign-on
// typed with none still says when it was typed. `job` is { company_id, job_id, label }, `swms` its entry from for-jobs, `signedAt` the phone's time as an ISO string.
export function signOnDraft({ job, swms, signature_name, signedAt }) {
  const name = String(signature_name || '').replace(/\s+/g, ' ').trim();
  return { kind: 'swms-signon', method: 'POST', path: '/job-safety/signons',
    body: { company_id: job.company_id, job_id: job.job_id, swms_id: swms.id, version: swms.version, signature_name: name, signed_at_phone: signedAt },
    local_card: { job_id: job.job_id, job_label: job.label || null, swms_title: swms.title, version: swms.version, signed_name: name } };
}
// Ticking a checklist on a job, as a draft for the outbox. The run is dated by the phone's own day (`runDate`), so one ticked with no signal is that day's even when it is
// sent the next, and local_card.held names the required items that were Not OK, which is what holds Start on this phone until it is ticked again.
// → { draft, held }
export function jobRunDraft({ job, list, answers, runDate }) {
  const held = failedRequired(list.items, answers);
  return { held, draft: { kind: 'job-run', method: 'POST', path: '/job-safety/runs',
    body: { company_id: job.company_id, job_id: job.job_id, checklist_id: list.id, run_date: runDate, items: runItems(list.items, answers) },
    local_card: { job_id: job.job_id, job_label: job.label || null, checklist_id: list.id, checklist_name: list.name, phase: list.phase, held } } };
}
// What to say once a checklist was sent (`blocked`: the server said a required item is Not OK): { text, tone }.
export function jobRunSaid(list, blocked) {
  if (!blocked) return { text: 'Checklist done', tone: 'ok' };
  return { tone: 'warn', text: list.phase === 'start' ? 'Recorded. Something required is not OK, so Start is held until it is put right. Your supervisor has been told.' : 'Recorded. Something required is not OK. Your supervisor has been told.' };
}
// What Start on a scheduled job does. `row` is the schedule row, `split` its one row for the card (the job's only cost centre filled in when it has just one: `only`),
// `card` the open card or null, `now` { date, time }. → { form: what the job card form opens on } when the cost centre has to be chosen or a card is already open
// (Switch moves it onto this job), else { clockOn: what to clock on with } straight away.
export function startStep({ row, only, hasJob, card, now }) {
  const split = { job_id: row.job_id, company_id: row.company_id, pct: 100, ...(only || { section_id: '', cost_centre_id: '' }) };
  if (card) return { form: { ...card, prefill_off: '', job_id: row.job_id, company_id: row.company_id, activity_id: '', splits: [split] } };
  if (only && hasJob) return { clockOn: { company_id: row.company_id, job_id: row.job_id, splits: [split], job_label: `#${row.job_id} ${row.job_name || ''}`.trim() } };
  return { form: { work_date: now.date, clock_on: now.time, kind: 'clock-on', company_id: row.company_id, job_id: row.job_id, splits: [split] } };
}
// The Start button on a scheduled job: what it says, whether it can be pressed and why not. `onIt`: the open card is on this job; `held`: the start checks are
// outstanding; `rest`: a rest period holds Clock on; `restText` its words.
export function startButton({ onIt, card, held, rest, restText, busy, loaded }) {
  return { label: onIt ? 'On it' : card ? 'Switch' : 'Start',
    disabled: !!onIt || !!busy || !loaded || (!!held && !onIt) || (!!rest && !card),
    title: onIt ? 'You’re on this job now' : held ? 'Sign on and tick the start checklists first' : rest && !card ? restText : card ? 'Move your open job card onto this job' : 'Clock on to this job now' };
}
