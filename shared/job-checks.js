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
