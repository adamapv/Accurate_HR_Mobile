// The Field view's own rules, kept free of React and the browser so scripts/test-field-core.mjs can run them in Node and the phone app (its own repo) can use the
// same file: how a job card lays out its time, what a new card opens with, where the open card and the rest period stand, which days of a week can be submitted
// and what stands in the way, what needs doing now, the session's fingerprint, and where a notification's link leads. Nothing here reads the clock, storage or the
// page: today, the time and how a date is written are passed in, so the web app and the phone app say the same thing from the same data.
// Dates are 'YYYY-MM-DD' and times 'HH:MM' (24 hour).
import { pad2 } from './pickers-core.js';
import { NIGHT_MAX_MINS, isOvernight, addDaysYmd, wallMins, inWindow, restHold, cardMins } from './pay-rules.js';

export const hmMins = s => { const [hh, mm] = String(s || '0:0').split(':').map(Number); return hh * 60 + mm; };
export const minsHM = m => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
export const entryHours = t => Math.max(0, hmMins(t.end_time) - hmMins(t.start_time)) / 60;
const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;

// ---- the job card ----
// Must match jobCardBlocks in src/index.mjs (scripts/test-field-core.mjs holds the two together): lunch is 30 unpaid minutes
// 3.5h after clock on; worked time is split by %, laid out back to back.
export const LUNCH_AFTER = 210, LUNCH_MINS = 30;
// A card over this long with no lunch is probably missing one (the server's no_lunch flag says the same).
export const NO_LUNCH_MINS = 360;
// The nearest 15-minute mark: a clocked time (07:03) as by-hand time, which goes in quarter hours.
export const snap15 = hm => minsHM(Math.min(23 * 60 + 45, Math.round(hmMins(hm) / 15) * 15));
// What a new by-hand card opens with: the last day's start, finish and lunch (GET /job-cards/open,
// last_card), else 7 to 3:30 with lunch. → { clock_on, clock_off, lunch, from: the day it came from | null }
export function cardDefaults(last) {
  if (last?.clock_on && last.clock_off) {
    const on = snap15(last.clock_on), off = snap15(last.clock_off);
    // A night shift that ran past midnight opens as one (its finish is before its start).
    if (hmMins(off) !== hmMins(on) && (hmMins(off) > hmMins(on) || isOvernight(last))) return { clock_on: on, clock_off: off, lunch: !!last.lunch, from: last.work_date };
  }
  return { clock_on: '07:00', clock_off: '15:30', lunch: true, from: null };
}
// A card that finishes before it starts runs past midnight (a night shift: the server only takes one for a profile with a Night shift rule). Its blocks are cut at
// midnight, like the server's: `day` is 0 for the card's own date (the last ends at 24:00) or 1 for the next (the first starts at 00:00).
export function planJobCard(on, off, lunch, splits) {
  const a = hmMins(on), b0 = hmMins(off);
  if (!on || !off || b0 === a) return { worked: 0, blocks: [] };
  const b = b0 < a ? b0 + 1440 : b0;
  const useLunch = lunch && b - a > LUNCH_AFTER + LUNCH_MINS;
  const lunchStart = a + LUNCH_AFTER, lunchEnd = lunchStart + LUNCH_MINS;
  const worked = b - a - (useLunch ? LUNCH_MINS : 0);
  const blocks = [];
  let cursor = a, given = 0;
  splits.forEach((s, i) => {
    let need = i === splits.length - 1 ? worked - given : Math.min(Math.round(worked * (Number(s.pct) || 0) / 100), worked - given);
    given += need;
    while (need > 0) {
      if (useLunch && cursor === lunchStart) cursor = lunchEnd;
      const end = Math.min(cursor + need, useLunch && cursor < lunchStart ? lunchStart : Infinity, cursor < 1440 ? 1440 : Infinity);
      const day = cursor >= 1440 ? 1 : 0;
      blocks.push({ split: i, day, start: minsHM(cursor - day * 1440), end: minsHM(end - day * 1440) });
      need -= end - cursor;
      cursor = end;
    }
  });
  return { worked, blocks, lunch: useLunch ? `${minsHM(lunchStart % 1440)}–${minsHM(lunchEnd % 1440)}` : null };
}
// Is this card (or the times in a form) a shift that runs past midnight?
export const runsPastMidnight = c => !!c?.clock_on && !!c?.clock_off && hmMins(c.clock_off) < hmMins(c.clock_on);
// The card's date and the next, for a card that runs past midnight; just its own otherwise. A card is "on" a date when it starts then or carries on into it.
export const cardOnDate = (c, date) => c.work_date === date || (isOvernight(c) && c.clock_off !== '00:00' && addDaysYmd(c.work_date, 1) === date);

// ---- the job card's form ----
// From a Monday on, a person's job time can come from AccurateJobs instead (employees.time_source / time_source_from): on a day from then on they do not clock on here.
export const timeFromJobs = (emp, date) => emp?.time_source === 'jobs' && !!emp.time_source_from && String(date) >= emp.time_source_from;
// A job in the list (GET /jobs), by its number and, where there is more than one company, its company.
export const findJob = (jobs, companyId, id) => id ? jobs.find(j => j.id === String(id) && (!companyId || j.company_id === String(companyId))) : undefined;
// A job with one section holding one cost centre needs no choosing: { section_id, cost_centre_id }, else null.
export const onlyCostCentre = j => j?.sections?.length === 1 && j.sections[0].cost_centres?.length === 1
  ? { section_id: j.sections[0].id, cost_centre_id: j.sections[0].cost_centres[0].id } : null;
// The cost centres a job offers: [{ value: 'section:cost centre', label }], the section named only when the job has more than one.
export const costCentreOptions = job => {
  const sections = job?.sections || [];
  return sections.flatMap(s => s.cost_centres.map(c => ({ value: `${s.id}:${c.id}`, label: sections.length > 1 ? `${s.name} · ${c.name}` : c.name })));
};
// The section and cost centre the person last put time on for this job, if the job still has them (GET /job-cards/recent → cost_centres).
export const rememberedCostCentre = (job, lastCc) => {
  const m = job && (lastCc || []).find(c => c.company_id === job.company_id && c.job_id === job.id);
  const s = m && (job.sections || []).find(x => x.id === m.section_id);
  return s?.cost_centres?.some(c => c.id === m.cost_centre_id) ? { section_id: m.section_id, cost_centre_id: m.cost_centre_id } : null;
};
// The rows of a card each carry a share (pct) and the shares always make 100. Rows are told apart by `key`.
export const splitEvenly = list => list.map((r, i) => ({ ...r, pct: Math.floor(100 / list.length) + (i < 100 % list.length ? 1 : 0) }));
// A new row takes half the biggest row's share, so the rest don't move much.
export function insertSplit(rs, at, row) {
  const big = rs.reduce((b, r, i) => r.pct > rs[b].pct ? i : b, 0);
  if (rs[big].pct < 2) return splitEvenly([...rs.slice(0, at), { ...row, pct: 0 }, ...rs.slice(at)]);
  const give = Math.floor(rs[big].pct / 2);
  return [...rs.slice(0, at), { ...row, pct: give }, ...rs.slice(at)].map(r => r === rs[big] ? { ...r, pct: r.pct - give } : r);
}
// Taking rows out (by their keys) shares the whole between the ones left.
export function dropSplits(rs, keys) {
  const left = rs.filter(r => !keys.has(r.key));
  return left.length === 1 ? [{ ...left[0], pct: 100 }] : splitEvenly(left);
}
// Changing one row's % moves the last row (or the one before it, when editing the last) so the total stays 100, never below 1% each.
export function setSplitPct(rs, key, raw) {
  if (rs.length === 1) return rs;
  const i = rs.findIndex(r => r.key === key);
  const bal = i === rs.length - 1 ? rs.length - 2 : rs.length - 1;
  const fixed = rs.reduce((n, r, j) => j === i || j === bal ? n : n + r.pct, 0);
  const v = Math.max(1, Math.min(Math.round(Number(raw) || 0), 100 - fixed - 1));
  return rs.map((r, j) => j === i ? { ...r, pct: v } : j === bal ? { ...r, pct: 100 - fixed - v } : r);
}
// Time on an activity (GET /activities → { id, name, needs_approval, ask_first, day_off, leave_type_id }), instead of on a job.
// Leave, not time: asked for under My leave. The RDO is that too when its leave type needs approval (ask_first), except on an RDO that is the person's own (`rdoDay`).
export const activityAsksFirst = (a, rdoDay) => !!a.needs_approval || (!!a.ask_first && !rdoDay);
// A public holiday is offered only on a public holiday (`holiday`), as the server accepts; one already picked stays listed. The RDO is offered on any day.
export const activityOfferable = (a, { chosenId, holiday }) => a.day_off !== 'holiday' || a.id === chosenId || !!holiday;
// What the Activity box lists: the ones that can be logged as time, then (under their own heading) the ones asked for as leave.
// `chosenId` and `chosenName` are the card's own activity, which stays listed even when the list no longer has it.
// → [{ key: 'time' | 'ask', title, rows: [{ key, title, text }] }]
export function activityGroups(activities, { chosenId, chosenName, holiday, rdoDay }) {
  const row = a => ({ key: a.id, title: a.name, text: a.name });
  const time = activities.filter(a => !activityAsksFirst(a, rdoDay) && activityOfferable(a, { chosenId, holiday })).map(row);
  if (chosenId && !activities.some(a => a.id === chosenId)) time.unshift({ key: chosenId, title: chosenName || `Activity ${chosenId}`, text: chosenName || chosenId });
  const ask = activities.filter(a => activityAsksFirst(a, rdoDay)).map(row);
  return [{ key: 'time', title: ask.length ? 'Activities' : null, rows: time }, ...(ask.length ? [{ key: 'ask', title: 'Needs approval — request as leave', rows: ask }] : [])];
}
// Catches what the server would refuse, before the round trip: '' when the card can be saved, else the words to show.
// `form` is { work_date, clock_on, clock_off, activity_id }, `rows` the job rows, `night` the person's Night shift rule or null, `dayEntries` their other time
// ([{ card_id, work_date, start_time, end_time }]), `cardId` the card being changed, `needsApproval` the name of a chosen activity that goes in as leave instead.
export function cardProblem({ form, rows, onActivity, night, dayEntries, cardId, needsApproval }) {
  if (needsApproval) return `${needsApproval} needs approval — request it as leave instead`;
  if (!form.clock_off) return '';
  if (hmMins(form.clock_off) === hmMins(form.clock_on)) return 'Finish has to be after start';
  const dayMins = form.clock_on && form.clock_off && form.clock_off !== form.clock_on ? cardMins(form) : 0;   // lunch included; a night shift runs into the next day
  // Only a night shift may run past midnight: the profile has a Night shift rule and the shift starts inside its window (what the server checks).
  if (runsPastMidnight(form)) {
    if (!night) return 'Finish has to be after start — a shift can’t run past midnight';
    if (!inWindow(night.window, form.clock_on)) return `A shift can only run past midnight if it starts between ${night.window.start} and ${night.window.end}`;
    if (dayMins > NIGHT_MAX_MINS) return `A night shift can’t be longer than ${NIGHT_MAX_MINS / 60} hours`;
  }
  // Other time is checked as moments, so a night shift is checked against both of its dates.
  const from = wallMins(form.work_date, form.clock_on), to = from + dayMins;
  const clash = (dayEntries || []).find(t => t.card_id !== cardId && wallMins(t.work_date, t.start_time) < to && from < wallMins(t.work_date, t.end_time));
  if (clash) return `That overlaps your ${clash.start_time}–${clash.end_time} time on ${clash.work_date === form.work_date ? 'the same day' : 'the next day'}`;
  if (onActivity) return form.activity_id ? '' : 'Choose the activity';
  if (rows.some(r => !r.job_id)) return 'Choose a job on every row';
  if (rows.some(r => !r.cost_centre_id)) return 'Choose a cost centre on every row';
  const total = rows.reduce((n, r) => n + (Number(r.pct) || 0), 0);
  if (total !== 100) return `The cost centres add up to ${total}% — they need to make 100%`;
  return '';
}
// What saving the form sends, as a draft for the outbox, and what the screen that opened it is told.
// `card` is what the form was opened on: {} or { kind: 'clock-on' | 'activity' } for a new one, else the card (a card still waiting on the phone has a 'local:' id, and
// a change to it rewrites what is waiting). `firstJob` is the first row's job from the list, `activityName` the chosen activity's name.
// → { draft: { kind, method, path, body, local_card }, done: { clockedOff, finished, work_date } }
export function cardDraft({ card, form, rows, onActivity, firstJob, activityName }) {
  const isNew = !card.id;
  const clockingOn = isNew && card.kind === 'clock-on';            // Start on a job: clocks on now, no finish yet
  const manual = (isNew && !clockingOn) || card.source === 'manual'; // a start and finish rather than a clock on/off
  const isLocal = String(card.id || '').startsWith('local:');
  const body = onActivity
    ? { ...form, clock_off: form.clock_off || null, company_id: '', job_id: '', splits: [] }
    : { ...form, clock_off: form.clock_off || null, activity_id: '', company_id: rows[0].company_id, job_id: rows[0].job_id,
        splits: rows.map(({ job_id, company_id, section_id, cost_centre_id, pct }) => ({ job_id, company_id, section_id, cost_centre_id, pct })) };
  // Exact times stay exact: a clock on/off (not by-hand time) says so, since a clock-off that waited
  // on the phone arrives as one new card. A server card also says when the phone last saw it.
  if (!manual && body.clock_off) body.source = 'clock';
  if (!isNew && !isLocal && card.updated_at) body.expected_updated_at = card.updated_at;
  const local_card = { ...card, ...body, id: undefined, updated_at: undefined, expected_updated_at: undefined, source: card.source || (manual ? 'manual' : 'clock'),
    job_label: onActivity ? null : firstJob ? `#${firstJob.id} ${firstJob.name || ''}`.trim() : card.job_label || (rows[0].job_id ? `#${rows[0].job_id}` : null),
    activity_label: onActivity ? activityName || null : null };
  const draft = { kind: clockingOn && !form.clock_off ? 'clock-on' : isNew ? 'add' : !card.clock_off && form.clock_off ? 'clock-off' : 'change',
    method: isNew ? 'POST' : 'PUT', path: isNew ? '/job-cards' : `/job-cards/${card.id}`, body, local_card };
  return { draft, done: { clockedOff: !isNew && !card.clock_off && !!form.clock_off, finished: !!form.clock_off, work_date: form.work_date } };
}

// ---- the clock ----
// When a rest period ends, in words: "6:30 pm today", "4:00 pm tomorrow", else the date as `fmtDate` writes it.
export function restUntilText(rest, today, fmtDate) {
  const { date, time } = rest.until;
  const [hh, mm] = time.split(':').map(Number);
  const clock = `${hh % 12 === 0 ? 12 : hh % 12}:${pad2(mm)} ${hh < 12 ? 'am' : 'pm'}`;
  return `${clock} ${date === today ? 'today' : date === addDaysYmd(today, 1) ? 'tomorrow' : `on ${fmtDate(date)}`}`;
}
export const restHoldText = (rest, today, fmtDate) => `Rest period after your night shift: you can start again at ${restUntilText(rest, today, fmtDate)}.`;
// Where the clock stands at `date` and `time` (the phone's own): `card` is the open card with what is waiting on the phone laid over it, `night` the Night shift rule on
// the person's profile (or null), `recent` their recent cards the same way. → { rest: the rest period holding Clock on, or null; sameDay: the open card is today's shift
// (a night shift that clocked on in the evening is still the same shift after midnight, when its date is yesterday's); elapsed: minutes it has been on }
export function openCardState({ card, night, recent, date, time }) {
  const rest = night?.rest_hours > 0 ? restHold(night, recent || [], { date, time }) : null;
  const age = card ? wallMins(date, time) - wallMins(card.work_date, card.clock_on) : 0;
  const sameDay = !!card && (card.work_date === date || (!!night && inWindow(night.window, card.clock_on) && age >= 0 && age < NIGHT_MAX_MINS));
  return { rest, sameDay, elapsed: sameDay ? Math.max(0, age) : 0 };
}

// ---- the week ----
export const dayRowOf = (week, date) => (week?.days || []).find(d => d.work_date === date) || null;
// The day is still the person's to change and submit: never submitted, or sent back.
export const dayIsMine = day => !day || day.status === 'rejected';
// The dates in this week that can be submitted now: job time logged here, not in the future, nobody still on the clock that day, and not already sent (or approved).
export function daysToSend(week, today) {
  if (!week) return [];
  const logged = new Set((week.entries || []).filter(t => !t.jobs_card_id).map(t => t.work_date));
  const open = new Set((week.cards || []).filter(c => !c.clock_off).map(c => c.work_date));
  return [...logged].filter(d => d <= today && !open.has(d) && dayIsMine(dayRowOf(week, d))).sort();
}
// Where the week stands, from its days: { status, submitted, approved, rejected, unsent } — status is 'approved' (every day with time is), 'submitted' (some day waits on an
// approver), 'rejected' (some day was sent back), 'open' (some day is still to submit) or null when nothing is logged.
export function weekState(week) {
  const logged = [...new Set((week?.entries || []).filter(t => !t.jobs_card_id).map(t => t.work_date))];
  if (!logged.length) return { status: null, submitted: 0, approved: 0, rejected: 0, unsent: 0 };
  const of = d => dayRowOf(week, d)?.status;
  const n = st => logged.filter(d => of(d) === st).length;
  const unsent = logged.filter(d => !of(d)).length;
  const status = n('rejected') ? 'rejected' : n('submitted') ? 'submitted' : unsent ? 'open' : 'approved';
  return { status, submitted: n('submitted'), approved: n('approved'), rejected: n('rejected'), unsent };
}
// What stands between these days and Submit, for the person to see before they send them: what stops
// it (still clocked on; time saved on the phone that hasn't gone yet), then what an approver would
// query (the server's flags on /timesheets/mine: a long day, no lunch on a long card, a weekday
// with nothing logged, a difference from the simPRO schedule). Today is never "missing" — it
// isn't over yet. Only the flags on the days being sent (and the days with nothing logged) are listed.
// → [{ key, block, kind, date, text }]
export function sendChecks(week, today, dates, fmtDate) {
  if (!week) return [];
  const out = [];
  const open = (week.cards || []).find(c => !c.clock_off);
  if (open) out.push({ key: 'open', block: true, date: open.work_date, text: `You’re still clocked on${open.work_date !== today ? ` from ${fmtDate(open.work_date)}` : ''} — clock off first` });
  if (week.pending > 0) out.push({ key: 'pending', block: true, text: week.pending === 1 ? 'A change saved on your phone is still waiting to send — submit once it has gone' : `${week.pending} changes saved on your phone are still waiting to send — submit once they have gone` });
  for (const f of week.flags || []) {
    if (f.kind === 'missing_day' && f.date === today) continue;
    if (f.kind === 'long_week' || (dates && f.kind !== 'missing_day' && !dates.includes(f.date))) continue;
    out.push({ key: `${f.kind}:${f.date || ''}`, block: false, kind: f.kind, date: f.date, text: f.text });
  }
  return out;
}
// What submitting a day leads to, said the same wherever a day is submitted. `autoApprove` is the company's Timesheet approval setting (me.company.timesheet_auto_approve).
export const submitConsequence = autoApprove => autoApprove ? 'It is approved straight away and its time goes to simPRO.' : 'Your manager is asked to approve it.';
// What to ask before these days are sent: { title, body } for a confirm, with their hours.
export function submitConfirm(week, dates, autoApprove, { fmtDate, fmtHours }) {
  const hours = (week?.entries || []).filter(t => dates.includes(t.work_date)).reduce((n, t) => n + entryHours(t), 0);
  return { title: dates.length === 1 ? 'Submit this day?' : `Submit ${dates.length} days?`, body: `${fmtHours(hours)} on ${dates.map(fmtDate).join(', ')}. ${submitConsequence(autoApprove)}` };
}
// Says what submitting days did (POST /days/submit → { submitted, skipped, auto_approved }): how many went, and which could not and why.
export function daysSubmittedText(r, fmtDate) {
  const n = r?.submitted?.length || 0, skipped = r?.skipped || [];
  const base = r?.auto_approved ? `${plural(n, 'day')} submitted and approved — the time is on its way to simPRO` : `${plural(n, 'day')} sent for approval`;
  return skipped.length ? `${base}\nNot sent: ${skipped.map(x => `${fmtDate(x.date)} ${x.reason}`).join('; ')}` : base;
}
// What needs doing now, most urgent first: [{ key, tone, title, meta, href | onClick, cta }]. Documents,
// policies and tasks are in the to-do list under it, so they are not repeated here. An `href` is one of the app's own addresses ('#/route?…').
export function meAttention({ week, plant, quals, gaps, today, onSubmit }, { fmtDate, fmtHours }) {
  const out = [];
  const cards = week?.cards || [], entries = week?.entries || [], wk = weekState(week), toSend = daysToSend(week, today);
  for (const r of (plant?.rows || []).filter(x => x.mine && x.prestart_due)) {
    out.push({ key: `ps${r.id}`, tone: 'danger', title: `Pre-start due: ${r.name}`, meta: r.registration_number ? `${r.registration_number} · before you use it today` : 'Before you use it today',
      href: `#/plant-checkout?prestart=${r.id}`, cta: 'Do pre-start' });
  }
  for (const r of (plant?.rows || []).filter(x => x.mine && x.ute_check_due)) {
    out.push({ key: `ute${r.id}`, tone: 'warn', title: `Ute check due: ${r.name}`, meta: r.ute_last_checked ? `Last checked ${fmtDate(r.ute_last_checked)} · tick off what is on the ute` : 'Never checked · tick off what is on the ute',
      href: `#/plant-checkout?ute=${r.id}`, cta: 'Check ute' });
  }
  const stuck = cards.find(c => !c.clock_off && c.work_date < today);
  if (stuck) out.push({ key: 'stuck', tone: 'danger', title: `Still clocked on from ${fmtDate(stuck.work_date)}`, meta: 'Enter your clock-off time so your hours are right', href: '#/my-timesheet', cta: 'Fix' });
  const sentBack = (week?.days || []).filter(d => d.status === 'rejected');
  if (sentBack.length) out.push({ key: 'rejected', tone: 'danger', title: sentBack.length === 1 ? `Your time for ${fmtDate(sentBack[0].work_date)} was sent back` : `${sentBack.length} days of your time were sent back`, meta: sentBack[0].decision_note || 'Fix it and submit it again', href: '#/my-timesheet', cta: 'Open' });
  if (toSend.length && wk.status !== 'rejected') {
    out.push({ key: 'submit', tone: 'warn', title: toSend.length === 1 ? `Submit your time for ${toSend[0] === today ? 'today' : fmtDate(toSend[0])}` : `Submit ${toSend.length} days of time`, meta: `${fmtHours((entries || []).filter(t => toSend.includes(t.work_date)).reduce((n, t) => n + entryHours(t), 0))} logged`, onClick: onSubmit, cta: 'Submit' });
  }
  const expired = (quals || []).filter(q => q.status === 'expired').length, expiring = (quals || []).filter(q => q.status === 'expiring').length;
  if (expired) out.push({ key: 'qx', tone: 'danger', title: `${plural(expired, 'ticket')} expired`, meta: 'Send in the renewal so you stay compliant', href: '#/my-qualifications', cta: 'Open' });
  if (expiring) out.push({ key: 'qe', tone: 'warn', title: `${plural(expiring, 'ticket')} expiring soon`, meta: 'Within the next 30 days', href: '#/my-qualifications', cta: 'Open' });
  for (const c of gaps?.missing || []) out.push({ key: `gap-${c.key}`, tone: 'info', title: c.title, meta: 'Keeps your record complete', href: c.href, cta: 'Open' });
  const rank = { danger: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.tone] - rank[b.tone]);
}

// ---- My week ----
// A pay period's name: its own label when it was given one, else "Week of <its first day>".
export const periodLabel = (p, fmtDate) => p.label && !/^Week of \d{4}-\d{2}-\d{2}$/.test(p.label) ? p.label : `Week of ${fmtDate(p.period_start)}`;
// The week grouped by day: job cards (with the blocks of time each lays out as), then any loose entries from before job cards. A night shift that started the evening
// before the period is shown on the period's first day, where its time after midnight is. → { days: [dates, in order], byDay: { [date]: { cards, entries } }, cardEntries: { [card id]: [entries] } }
export function weekByDay(week) {
  const byDay = {}, cardEntries = {};
  const dayOf = d => (byDay[d] = byDay[d] || { cards: [], entries: [] });
  (week?.entries || []).forEach(t => t.card_id ? (cardEntries[t.card_id] = cardEntries[t.card_id] || []).push(t) : dayOf(t.work_date).entries.push(t));
  (week?.cards || []).forEach(c => dayOf(c.carry_in ? week.period.period_start : c.work_date).cards.push(c));
  return { days: Object.keys(byDay).sort(), byDay, cardEntries };
}
// Where the week stands, in a few words beside its dates (weekState): how many days are still to submit or waiting, else nothing more than the status itself.
export const weekPillLabel = wk => wk.status === 'open' ? `${plural(wk.unsent, 'day')} to submit` : wk.status === 'submitted' ? `${plural(wk.submitted, 'day')} waiting for approval` : undefined;
// What is said beside a card's times: more jobs on it, lunch, a night shift carried in from the day before, or one that ends the next day.
export function cardNotes(c, fmtDate) {
  const n = new Set((c.splits || []).map(s => s.job_id).filter(Boolean)).size;
  return [n > 1 ? `+ ${n - 1} more job${n > 2 ? 's' : ''}` : null, c.lunch ? '30 min lunch' : null, c.carry_in ? `night shift from ${fmtDate(c.work_date)}` : null,
    runsPastMidnight(c) && !c.carry_in ? 'ends the next day' : null].filter(Boolean);
}
// The Submit card: its heading and what it explains, by the company's Timesheet approval setting.
export const submitHelp = autoApprove => autoApprove
  ? { title: 'Submit your days', text: 'Time is approved a day at a time, and approved automatically here: once you submit a day it is approved and its time goes to simPRO. You can still add or change time on that day: it goes through again.', noteLabel: 'Note (optional)' }
  : { title: 'Submit for approval', text: 'Time is approved a day at a time: submit each day when you finish it, and your manager approves it. Approved time goes to simPRO. You can still add or change time on a submitted day: it goes back to your manager.', noteLabel: 'Note for approver (optional)' };
// The days that were sent back, in words: "2 days sent back: 4 Mar (wrong job); 5 Mar. Fix them, then submit them again." ('' when none).
export function sentBackText(week, fmtDate) {
  const back = (week?.days || []).filter(d => d.status === 'rejected');
  return back.length ? `${plural(back.length, 'day')} sent back: ${back.map(d => `${fmtDate(d.work_date)}${d.decision_note ? ` (${d.decision_note})` : ''}`).join('; ')}. Fix them, then submit them again.` : '';
}
// What the Submit button says for these days, and what is said when there are none.
export const submitLabel = (dates, fmtDate) => dates.length === 1 ? `Submit ${fmtDate(dates[0])}` : `Submit ${dates.length} days`;
export const nothingToSubmit = wk => wk.status ? 'Nothing to submit right now — every finished day has been sent.' : 'Nothing logged yet this week.';
// Copy last week: each day of this week up to today takes the cards of the same weekday last week (POST /job-cards/copy { from_date, to_date }, a day at a time).
// → [{ from, to }]
export function copyWeekPlan(period, today) {
  const out = [];
  for (let d = period.period_start; d <= period.period_end && d <= today; d = addDaysYmd(d, 1)) out.push({ from: addDaysYmd(d, -7), to: d });
  return out;
}
// What copying said, from each day's answer ({ to, copied, skipped } or { to, error }): how many cards came across and what was skipped, and how it is toned.
// A day with nothing on it last week is not a skip.
export function copyWeekSaid(results, fmtDate) {
  let copied = 0; const skipped = [];
  for (const r of results) {
    if (r.error) { if (!/no time on that day/.test(r.error)) skipped.push(`${fmtDate(r.to)}: ${r.error}`); continue; }
    copied += r.copied; skipped.push(...(r.skipped || []).map(x => `${fmtDate(r.to)} ${x}`));
  }
  const text = copied || skipped.length ? `Copied ${copied} card${copied === 1 ? '' : 's'}` + (skipped.length ? `\nSkipped ${skipped.length}:\n${skipped.join('\n')}` : '') : 'Nothing to copy from last week';
  return { copied, text, tone: skipped.length || !copied ? 'danger' : 'ok' };
}

// ---- a scheduled job ----
// A row of the person's published schedule (GET /schedule/mine): { work_date, company_id, job_id, job_name, activity, customer_name, site_name, site_address, site_lat,
// site_lng, site_id, notes, crew: [names], plant: [names] }.
// How it is headed: its number (or "Activity" for a public holiday, an RDO, a toolbox) and its name.
export const schedRowTitle = r => ({ tag: r.activity ? 'Activity' : `#${r.job_id}`, name: r.job_name || (r.activity ? 'Activity' : 'Job') });
// The address is shown unless it only repeats the site's name.
export const showAddress = r => !!r.site_address && !r.site_address.toLowerCase().startsWith(String(r.site_name || '').trim().toLowerCase() || '\0');
// Who else is on the row: up to six names, then "+ N more".
export const crewLine = crew => crew.length > 6 ? `${crew.slice(0, 6).join(', ')} + ${crew.length - 6} more` : crew.join(', ');
// Directions to a site, by its coordinates when known, else its address: Apple's maps on an Apple device (`apple`), Google's otherwise. Null with neither.
export function mapsUrl(c, apple) {
  if (!c?.site_address && c?.site_lat == null) return null;
  const dest = c.site_lat != null && c.site_lng != null ? `${c.site_lat},${c.site_lng}` : c.site_address;
  return apple ? `https://maps.apple.com/?daddr=${encodeURIComponent(dest)}` : `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}`;
}
// A phone number as a link to ring.
export const telHref = phone => `tel:${String(phone).replace(/[^\d+]/g, '')}`;
// Ringing one person: { ring: 'tel:…' }, or what to say when their record has no number.
export const ringStep = p => p.phone ? { ring: telHref(p.phone) } : { say: `${p.name} has no phone number on their record`, tone: 'info' };
// What a tap on Navigate ('nav'), Call PM ('pm') or Call team leaders ('leaders') does, from the job's details (the row with GET /jobs/:company/:id/contact laid over
// it: { site_address, site_lat, site_lng, pm: { name, phone }, leaders: [{ id, name, position, phone }] }). Who to ring is the job's own people, never the customer.
// → { nav: url } | { ring: 'tel:…' } | { say, tone } | { choose: [{ id, name, detail, phone }] } (several team leaders: say who they are, then ringStep the one chosen)
export function contactStep(what, d, apple) {
  if (what === 'nav') return mapsUrl(d, apple) ? { nav: mapsUrl(d, apple) } : { say: 'simPRO has no address for this site', tone: 'danger' };
  if (what === 'pm') return !d.pm ? { say: 'This job has no project manager set', tone: 'info' } : ringStep(d.pm);
  const leaders = d.leaders || [];
  if (!leaders.length) return { say: 'This job has no team leaders set', tone: 'info' };
  if (leaders.length === 1) return ringStep(leaders[0]);
  return { choose: leaders.map(l => ({ id: l.id, name: l.name, phone: l.phone || null, detail: l.phone ? [l.position, l.phone].filter(Boolean).join(' · ') : 'No phone number on their record' })) };
}

// ---- purchase orders ----
// A job with one cost centre in all needs no choosing: { section_id, cost_centre_id }, else both empty.
export const soleCostCentre = j => {
  const all = (j?.sections || []).flatMap(s => (s.cost_centres || []).map(c => ({ section_id: s.id, cost_centre_id: c.id })));
  return all.length === 1 ? all[0] : { section_id: '', cost_centre_id: '' };
};
export const NOT_READ_YET = 'This job’s cost centres haven’t been read from simPRO yet — try again after tonight’s sync, or ask an admin to refresh it on the Jobs page.';
export const NO_SUPPLIERS = 'No suppliers yet — they’re copied from simPRO overnight';
// The Raise PO form after a job is chosen: its company and number, its cost centre when it has only one, and the supplier kept only if it is the same company's
// (suppliers belong to a company).
export const poPickJob = (form, j) => ({ ...form, company_id: j?.company_id || '', job_id: j?.id || '', ...soleCostCentre(j), vendor_id: j?.company_id === form.company_id ? form.vendor_id : '' });
// A PO can be raised once it has a supplier, a job and the job's cost centre.
export const poReady = form => !!(form.vendor_id && form.job_id && form.section_id && form.cost_centre_id);
// The suppliers as the box lists them: the person's starred ones under their own heading, then the rest; one list with no heading when none is starred.
// → [{ key, title, rows: [{ key, title }] }]
export function supplierGroups(suppliers, starred) {
  const row = s => ({ key: s.id, title: s.name });
  const mine = (suppliers || []).filter(s => (starred || []).includes(s.id));
  return mine.length ? [{ key: 'star', title: 'Your starred suppliers', rows: mine.map(row) }, { key: 'rest', title: 'All suppliers', rows: suppliers.filter(s => !starred.includes(s.id)).map(row) }]
    : [{ key: 'all', title: null, rows: (suppliers || []).map(row) }];
}
// A person's starred suppliers after one is starred or has its star taken off.
export const starredAfter = (starred, vendorId, on) => on ? [...(starred || []).filter(x => x !== vendorId), vendorId] : (starred || []).filter(x => x !== vendorId);
// What is said under a PO number once it is raised (POST /purchase-orders → po).
export const poRaisedText = po => `${po.vendor_name} · ${po.job_label} — ${po.cost_centre_label}. Give this number to the supplier; add the materials in simPRO when the receipt comes in.`;
// The phone's PO list: what it says it lists (a level with Everyone sees who raised each one), and a PO's lines under its number.
export const poListSub = everyones => everyones ? 'Every PO raised here, newest first.' : 'The POs you’ve raised, newest first. Tap one to copy its number.';
export const poJobLine = p => `${p.job_label || ''}${p.cost_centre_label ? ` — ${p.cost_centre_label}` : ''}`;
export const poMeta = (p, everyones) => [p.reference && `Ref ${p.reference}`, everyones && p.created_by_name && `by ${p.created_by_name}`].filter(Boolean).join(' · ');
export const poEmptyText = configured => configured ? 'No POs raised yet. Tap Raise a PO when you need a number for a supplier.' : 'simPRO isn’t connected yet — ask the office.';

// ---- policies and documents ----
// What a person is told as they confirm a policy or document with their typed name: signing it, or acknowledging it.
export const confirmNote = sign => sign
  ? 'By signing, you confirm you’ve read and agree to this document. We record your name, IP address and the time.'
  : 'By acknowledging, you confirm you’ve read this. We record your name, IP address and the time.';
// The company's policies as the person reads them: the ones not yet acknowledged first, each saying where it stands. `fmtDate` writes a date the caller's way.
export const policyList = (rows, fmtDate) => [...(rows || []).filter(p => !p.acknowledged_at), ...(rows || []).filter(p => p.acknowledged_at)]
  .map(p => ({ policy: p, read: !!p.acknowledged_at, sub: p.acknowledged_at ? `Acknowledged ${fmtDate(p.acknowledged_at)}` : 'Not yet read' }));
// What is said under a policy the person has already acknowledged.
export const acknowledgedText = (p, fmtDate) => `You acknowledged this on ${fmtDate(p.acknowledged_at)} as ${p.signature_name}.`;

// ---- leave ----
// A date range as words: one day when both ends are the same.
const range = (a, b, fmtDate) => (a === b || !b) ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`;
const day10 = d => String(d).slice(0, 10);
// "From Xero 30 Sept · 16h approved, not yet paid" for a balance read from Xero; null for one that is not.
export function xeroBalanceNote(b, { fmtDate, fmtHours }) {
  if (!b.xero_synced_at) return null;
  const pending = Number(b.xero_hours) - Number(b.balance_hours);
  return `From Xero ${fmtDate(b.xero_synced_at)}` + (pending > 0.05 ? ` · ${fmtHours(pending)} approved, not yet paid` : '');
}
// What is said under one of a person's leave balances.
export const leaveBalanceSub = (b, fmt) => xeroBalanceNote(b, fmt) || `${fmt.fmtHours(b.accrued_hours)} accrued · ${fmt.fmtHours(b.taken_hours)} taken`;
// One of a person's own leave requests as its row: what it says, the colour of its date, and what can still be done with it (a draft is sent or discarded; one that is
// waiting, or approved and not yet started, can be cancelled). `today` is the caller's own day.
export function leaveRow(r, today, { fmtDate, fmtHours }) {
  const draft = r.status === 'draft';
  return {
    title: `${r.type_name} · ${range(r.start_date, r.end_date, fmtDate)}`,
    meta: [fmtHours(r.hours_requested), r.reason].filter(Boolean).join(' · '),
    tone: r.status === 'rejected' ? 'danger' : r.status === 'approved' ? 'ok' : undefined,
    canSubmit: draft,
    canCancel: draft || r.status === 'submitted' || (r.status === 'approved' && r.start_date > today),
    cancelLabel: draft ? 'Discard' : 'Cancel',
    note: r.status === 'rejected' && r.decision_note ? r.decision_note : '',
  };
}
// What a person is asked before a request is discarded or cancelled.
export const leaveCancelConfirm = r => ({
  title: r.status === 'draft' ? 'Discard this draft?' : 'Cancel this leave?',
  body: r.status === 'approved' ? 'The hours go back on your balance, and it’s taken off the simPRO schedule.' : undefined,
  confirmLabel: r.status === 'draft' ? 'Discard' : 'Cancel leave', cancelLabel: 'Keep it', danger: true });
// The heading of a person's requests: how many are waiting for a decision, and how many approved ones are still to come.
export const leaveWaiting = rows => (rows || []).filter(r => r.status === 'submitted').length;
export const leaveComingUp = (rows, today) => `${plural((rows || []).filter(r => r.status === 'approved' && r.end_date >= today).length, 'approved request')} coming up`;
export const leaveEmptyText = canAsk => canAsk ? 'No leave requests yet. Start one with New request.' : 'No leave requests yet.';
// A new request as its form opens: the kind of leave that was asked for (Request leave on a job card activity), else the first one.
export const leaveFormStart = (types, wantType) => ({ leave_type_id: (types || []).find(t => t.id === wantType)?.id || (types || [])[0]?.id || '', start_date: '', end_date: '', hours_requested: '', reason: '' });
// Choosing the start date moves an end date that would now be before it.
export const leavePickStart = (form, v) => ({ ...form, start_date: v, end_date: form.end_date && form.end_date >= v ? form.end_date : v });
export const LEAVE_HOURS_HINT = 'Leave blank for every working day between the dates (weekends and public holidays are left out).';
// What stands in the way of sending a request ('' when nothing does). The server checks the rest and says so in its own words.
export const leaveProblem = form => !form.leave_type_id || !form.start_date || !form.end_date ? 'Choose a leave type and both dates'
  : form.end_date < form.start_date ? 'The end date is before the start date' : '';
// What a request is sent as: straight for approval.
export const leaveDraft = form => ({ ...form, status: 'submitted' });
export const LEAVE_SENT = 'Request sent for approval';
// What to ask the server about a request as it is filled in (its hours, the balance after, who else is off), or null while it is not complete enough to ask.
export const leavePreviewAsk = form => !form.leave_type_id || !form.start_date || !form.end_date || form.end_date < form.start_date ? null
  : { leave_type_id: form.leave_type_id, start: form.start_date, end: form.end_date, hours: form.hours_requested };
// The server's answer as the notes shown under the form: each { tone, lines }. `asked` is what is in the Hours box. It never stops a request being sent: a manager decides.
export function leavePreviewNotes(p, asked, { fmtDate, fmtHours }) {
  if (!p?.valid) return [];
  const short = p.balance_after != null && p.balance_after < 0;
  const out = [{ tone: short ? 'warn' : 'info', lines: [
    `${fmtHours(p.hours)} · ${plural(p.working_days, 'working day')}`,
    p.balance != null && `${p.type?.name || 'Balance'}: ${fmtHours(p.balance)} now, ${fmtHours(p.balance_after)} after this${p.waiting_hours > 0 ? ` and the ${fmtHours(p.waiting_hours)} already waiting` : ''}.`,
    short && 'That is more than the balance. It can still be sent: a manager decides.',
    !p.hours_kept && asked !== '' && asked != null && `${fmtHours(Number(asked))} is more than those days hold, so the working days are used.`].filter(Boolean) }];
  if (p.overlaps?.length) out.push({ tone: 'warn', lines: [`You already have ${plural(p.overlaps.length, 'request')} on these days: ${p.overlaps.map(o => `${range(day10(o.start_date), day10(o.end_date), fmtDate)} (${o.status})`).join(', ')}.`] });
  if (p.others_off?.length) out.push({ tone: 'info', lines: [`Also off then: ${p.others_off.map(o => `${o.employee_name} ${range(day10(o.start_date), day10(o.end_date), fmtDate)}${o.masked ? '' : ` (${o.type_name})`}`).join(', ')}.`] });
  return out;
}
// Who is away in a month, as a phone lists it: by when they go, then by name, each saying the kind of leave, the days, and whether it is still waiting.
export const teamLeaveList = (rows, fmtDate) => [...(rows || [])].sort((a, b) => a.start_date.localeCompare(b.start_date) || a.employee_name.localeCompare(b.employee_name))
  .map(r => ({ row: r, title: r.employee_name, meta: `${r.type_name} · ${range(r.start_date, r.end_date, fmtDate)}${r.status === 'submitted' ? ' · waiting for approval' : ''}` }));
export const NOBODY_AWAY = 'Nobody is away this month.';

// ---- expense claims ----
// Dollars typed into a box, as cents.
export const toCents = v => Math.round((parseFloat(v) || 0) * 100);
const sumCents = list => list.reduce((s, r) => s + (r.total_cents || 0), 0);
// The four figures over a person's claims: drafts, what is waiting, what is approved and not yet paid, and what was paid this year. `year` is the caller's own ('2026').
export function expenseTiles(rows, year, fmtMoney) {
  const by = st => (rows || []).filter(r => r.status === st);
  const paid = (rows || []).filter(r => r.status === 'paid' && String(r.claim_date || '').startsWith(year));
  return [
    { key: 'draft', label: 'Drafts', value: by('draft').length, sub: by('draft').length ? 'Not sent yet' : 'Nothing half-done' },
    { key: 'submitted', label: 'Awaiting approval', value: fmtMoney(sumCents(by('submitted')), { whole: true }), tone: by('submitted').length ? 'warn' : undefined, sub: plural(by('submitted').length, 'claim') },
    { key: 'approved', label: 'Approved, to be paid', value: fmtMoney(sumCents(by('approved')), { whole: true }), tone: by('approved').length ? 'ok' : undefined, sub: plural(by('approved').length, 'claim') },
    { key: 'paid', label: `Paid in ${year}`, value: fmtMoney(sumCents(paid), { whole: true }), sub: plural(paid.length, 'claim') }];
}
// One of a person's claims as its row. `title` is '' while it has no description (the caller says NO_CLAIM_TITLE, greyed).
export const claimRow = (r, { fmtDate, fmtMoney }) => ({ title: r.description || '', meta: [fmtDate(r.claim_date), r.line_count && plural(r.line_count, 'line'), r.jobs].filter(Boolean).join(' · '), amount: fmtMoney(r.total_cents) });
export const NO_CLAIM_TITLE = 'No description yet';
export const NO_CLAIMS = 'No claims yet — start one with New claim.';
// A claim can be changed by the person it belongs to while it is a draft or was sent back.
export const claimEditable = claim => !claim.status || claim.status === 'draft' || claim.status === 'rejected';
export const claimTitle = (claim, fmtMoney) => claim.id ? `Claim · ${fmtMoney(claim.total_cents)}` : 'New claim';
export const claimSubmitLabel = claim => claim.status === 'rejected' ? 'Resubmit' : 'Submit for approval';
export const CLAIM_SENT = 'Claim sent for approval';
// What is said over a claim that was sent back, or paid ('' otherwise).
export const claimSentBack = claim => claim.status === 'rejected' && claim.decision_note ? `Sent back: ${claim.decision_note}` : '';
export const claimPaidText = (claim, fmtDate) => claim.status !== 'paid' ? '' : `Paid${claim.payment_reference ? ` · ref ${claim.payment_reference}` : ''}${claim.paid_at ? ` · ${fmtDate(claim.paid_at)}` : ''}`;
// A claim opened new and closed with nothing in it is not kept as an empty draft.
export const claimIsEmpty = (claim, lines) => (lines || []).length === 0 && !claim.description;
export const claimDeleteConfirm = lines => ({ title: 'Delete this claim?', body: (lines || []).length ? `Its ${plural(lines.length, 'line')} and receipts are deleted too.` : undefined, danger: true, confirmLabel: 'Delete claim' });
export const LINE_DELETE_CONFIRM = { title: 'Delete this line?', danger: true, confirmLabel: 'Delete' };
// One line of a claim: what it says under its description, and the job it is charged to ('' when it is not).
export const claimLineMeta = (l, fmtDate) => `${fmtDate(l.line_date)}${l.category_name ? ` · ${l.category_name}` : ''}${l.mileage_km != null ? ` · ${l.mileage_km} km` : ''}`;
export const claimLineJob = l => l.job_id ? `Charged to ${l.job_label} · ${l.cost_centre_label}` : '';
// Where a cost stands in simPRO, for a claim line or an allowance: { text, failed } or null when there is nothing to say.
export function simproCostText(state, error) {
  if (!state || state === 'withdrawn') return null;
  if (state === 'posted') return { text: 'In simPRO', failed: false };
  if (state === 'pending' || state === 'removing') return { text: 'Waiting to go to simPRO', failed: false };
  return { text: `Not sent to simPRO: ${error || 'unknown'}`, failed: true };
}
// A new line as its form opens: today, the first category, and the job another line on this claim was charged to (`lastLine`), if one was.
export const lineFormStart = (cats, today, lastLine) => ({ description: '', amount_cents: 0, gst_cents: 0, category_id: (cats || [])[0]?.id || '', line_date: today, mileage_km: null, receipt_r2_key: null,
  company_id: lastLine?.company_id || '', job_id: lastLine?.job_id || '', section_id: lastLine?.section_id || '', cost_centre_id: lastLine?.cost_centre_id || '' });
export const lastJobLine = lines => [...(lines || [])].reverse().find(l => l.job_id);
export const linePlaceholder = mode => mode === 'mileage' ? 'e.g. Site visit, Coles Brunswick' : 'e.g. BP fuel — van #4';
// What stands in the way of adding a line ('' when nothing does).
export const lineProblem = (form, onJob) => !String(form.description || '').trim() ? 'Description is required'
  : onJob && !(form.job_id && form.section_id && form.cost_centre_id) ? 'Choose the job, section and cost centre this is charged to' : '';
// What a line is sent as: no job unless it is charged to one, and either an amount or a distance (the server works a distance out at the rate).
export function lineDraft(form, claimId, onJob, mode) {
  const body = { ...form, claim_id: claimId };
  if (!onJob) Object.assign(body, { company_id: '', job_id: '', section_id: '', cost_centre_id: '' });
  if (mode === 'mileage') body.amount_cents = 0;
  else body.mileage_km = null;
  return body;
}
// Under the Distance box: what it comes to, the rate, or that there is no rate yet.
export const mileageHint = (km, rate, fmtMoney) => !rate ? 'No mileage rate is set yet — ask an admin to set one in Settings.'
  : km ? `Comes to ${fmtMoney(Math.round(km * rate.rate_cents_per_km))} at ${fmtMoney(rate.rate_cents_per_km)}/km` : `Paid at ${fmtMoney(rate.rate_cents_per_km)}/km`;
export const lineJobHint = onJob => onJob ? 'Once approved, the cost is recorded on that job’s cost centre in simPRO.' : 'Not charged to a job: it is reimbursed and goes nowhere else.';

// ---- licences and tickets ----
const sentenceCase = s => s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).replace(/_/g, ' ') : '';
// What a person has sent in that is still worth showing: everything not yet approved, and what was approved in the last 14 days. `now` is the caller's clock, in milliseconds.
export const recentSubmissions = (subs, now) => (subs || []).filter(s => s.status !== 'approved' || now - Date.parse(String(s.reviewed_at || s.submitted_at).replace(' ', 'T') + 'Z') < 14 * 864e5);
// The four figures over a person's tickets: valid (one with no expiry counts), expiring, expired, and what is waiting for review.
export function qualTiles(rows, recent) {
  const count = st => (rows || []).filter(q => q.status === st || (st === 'valid' && q.status === 'no_expiry')).length;
  const pending = (recent || []).filter(s => s.status === 'pending').length;
  return [
    { key: 'valid', label: 'Valid', value: count('valid'), tone: 'ok', sub: 'Current on your record' },
    { key: 'expiring', label: 'Expiring', value: count('expiring'), tone: count('expiring') ? 'warn' : undefined, sub: 'Within the next 30 days' },
    { key: 'expired', label: 'Expired', value: count('expired'), tone: count('expired') ? 'danger' : undefined, sub: count('expired') ? 'Renew these first' : 'None lapsed' },
    { key: 'pending', label: 'Waiting for review', value: pending, sub: pending ? 'An admin checks them' : 'Nothing sent in' }];
}
export const QUALS_SUB = 'New and renewed tickets are checked by an admin before they go on your record';
export const NO_QUALS = 'No qualifications on file yet. Use Submit a ticket to add one.';
// A ticket on a person's record as its row: what it says, where it stands, and the colour of that.
export const QUAL_STATUS = { valid: 'Valid', no_expiry: 'No expiry', expiring: 'Expiring', expired: 'Expired' };
export const qualRow = (q, fmtDate) => ({
  title: q.title,
  meta: [sentenceCase(q.category), q.issuing_body, q.qualification_number && `# ${q.qualification_number}`,
    q.expiry_date ? (q.status === 'expired' ? `expired ${fmtDate(q.expiry_date)}` : `expires ${fmtDate(q.expiry_date)}`) : 'no expiry',
    q.renewal_booked_for && `renewal booked ${fmtDate(q.renewal_booked_for)}`].filter(Boolean).join(' · '),
  status: QUAL_STATUS[q.status] || sentenceCase(q.status),
  tone: q.status === 'expired' ? 'danger' : q.status === 'expiring' ? 'warn' : 'ok' });
// A ticket sent in for review as its row: only one still waiting can be withdrawn.
export const submissionRow = (s, fmtDate) => ({
  title: s.title,
  meta: [s.qualification_number && `# ${s.qualification_number}`, `sent ${fmtDate(String(s.submitted_at).slice(0, 10))}`, s.status === 'rejected' && s.reject_reason].filter(Boolean).join(' · '),
  status: s.status === 'pending' ? 'Waiting for review' : s.status === 'approved' ? 'Approved' : 'Rejected',
  tone: s.status === 'pending' ? undefined : s.status === 'approved' ? 'ok' : 'danger',
  canWithdraw: s.status === 'pending' });
export const withdrawConfirm = s => ({ title: `Withdraw “${s.title}”?`, body: 'It’s taken off the review list and the photos are deleted.', danger: true, confirmLabel: 'Withdraw' });
// Sending a ticket in: a new one (chosen from the company's list, or named by hand under OTHER_TICKET), or a renewal of one on the record (`renews`).
export const OTHER_TICKET = '__other';
export const ticketFormStart = renews => ({ issuing_body: renews?.issuing_body || '', qualification_number: '', issued_date: '', expiry_date: '', notes: '' });
export const ticketHead = renews => renews
  ? { title: `Renew ${renews.title}`, sub: 'Send in the new card — the old one stays on your record until it’s approved' }
  : { title: 'Submit a ticket', sub: 'Photograph the card and fill in what’s printed on it' };
// What the ticket is called and its category: the renewed ticket's own, the chosen name's from the list, or what was typed for something else.
export const ticketNamed = ({ renews, pick, other, names }) => renews ? { title: renews.title, category: renews.category }
  : pick === OTHER_TICKET ? { title: String(other || '').trim(), category: 'other' }
  : { title: pick || '', category: (names || []).find(n => n.name === pick)?.category || 'other' };
// What stands in the way of sending it ('' when nothing does). `photos` is how many pictures of the card there are.
export const ticketProblem = (title, photos) => !title ? 'Choose which ticket this is' : !photos ? 'Add a photo of the card (front and back if it has writing on both)' : '';
// What it is sent as. `files` are the uploaded pictures: { r2_key, file_name, mime_type, file_size_bytes }.
export const ticketDraft = ({ renews, named, form, files }) => ({ qualification_id: renews?.id, title: named.title, category: named.category, ...form, files });
export const TICKET_SENT = 'Sent for review';

// ---- a person's own documents ----
export const DOC_TYPE_LABEL = { cert: 'Certificate', id: 'ID', policy: 'Policy', contract: 'Contract', offer: 'Offer letter', payslip: 'Payslip', other: 'Other' };
// A document still waiting on the person: neither signed nor acknowledged.
export const docOpen = r => !r.signed_at && !r.acknowledged_at;
// A person's documents as the screen lists them: the ones waiting on them, then the rest.
export const docsToDo = rows => (rows || []).filter(docOpen);
export const docsOnFile = rows => (rows || []).filter(r => !docOpen(r));
// The three figures over them. `soon` is the caller's own day 30 days from today.
export function docTiles(rows, soon) {
  const all = rows || [], toDo = docsToDo(all), expiring = all.filter(r => r.expiry_date && r.expiry_date <= soon);
  return [
    { key: 'todo', label: 'To sign or acknowledge', value: toDo.length, tone: toDo.length ? 'warn' : undefined, sub: toDo.length ? 'Waiting on you' : 'Nothing waiting on you' },
    { key: 'expiring', label: 'Expiring soon', value: expiring.length, tone: expiring.length ? 'warn' : undefined, sub: 'Within 30 days' },
    { key: 'file', label: 'On file', value: all.length, sub: `${plural(all.filter(r => r.r2_key).length, 'file')} to download` }];
}
// What a document says under its title, and whether it has expired. `today` is the caller's own day.
export const docMeta = (r, today, fmtDate) => [DOC_TYPE_LABEL[r.doc_type] || sentenceCase(r.doc_type), r.issued_date && `issued ${fmtDate(r.issued_date)}`,
  r.expiry_date && (r.expiry_date < today ? `expired ${fmtDate(r.expiry_date)}` : `expires ${fmtDate(r.expiry_date)}`), r.description].filter(Boolean).join(' · ');
export const docExpired = (r, today) => !!r.expiry_date && r.expiry_date < today;
// Where a document stands, in words.
export const docStatus = d => d.signed_at ? 'Signed' : d.acknowledged_at ? 'Acknowledged' : d.requires_signature ? 'Awaiting signature' : 'Not yet opened';
// What can be done with it: { kind, label } for the one thing waiting on the person (a contract is read and signed on its own page; anything else is confirmed with
// a typed name), 'view' for a contract already signed, and whether there is a file to download.
export function docActions(r) {
  const open = docOpen(r);
  return {
    confirm: open ? (r.contract_id ? { kind: 'contract', label: 'Read & sign' } : r.requires_signature ? { kind: 'sign', label: 'Sign' } : { kind: 'acknowledge', label: 'Acknowledge' }) : null,
    view: !open && !!r.contract_id,
    download: !!r.r2_key };
}
export const DOCS_HEADING = toDo => toDo ? 'Everything on file' : 'Your documents';
export const NO_DOCS = 'No documents yet. Contracts and HR paperwork show here once HR adds them.';
export const DOCS_ALL_SIGNED = 'Everything else is signed and on file.';
export const DOCS_NOT_YOURS = 'Your documents aren’t part of your access level. Ask HR if you need a copy of something.';
// Confirming a document or a policy with a typed name: what the pop-up is called, its button, what stands in the way, what is sent and what is said after.
export const confirmHead = sign => ({ title: sign ? 'Sign document' : 'Acknowledge document', label: sign ? 'Sign' : 'Acknowledge', done: sign ? 'Signed' : 'Acknowledged' });
export const CONFIRM_NAME_LABEL = 'Type your full name to confirm';
export const confirmProblem = name => String(name || '').trim() ? '' : CONFIRM_NAME_LABEL;
export const confirmDraft = name => ({ signature_name: String(name || '').trim() });
export const docConfirmPath = doc => `/documents/${doc.id}/${doc.requires_signature ? 'sign' : 'acknowledge'}`;

// ---- the assets a person holds ----
// The three figures over them: how many, what they are worth on the register, and how many are in poor condition or lost.
export function assetTiles(rows, fmtMoney) {
  const all = rows || [], attention = all.filter(a => ['poor', 'lost'].includes(String(a.condition || '').toLowerCase()));
  return [
    { key: 'items', label: 'Items with you', value: all.length, sub: `${new Set(all.map(a => a.category_name).filter(Boolean)).size || 0} categories` },
    { key: 'value', label: 'Total value', value: fmtMoney(all.reduce((s, a) => s + (a.current_value_cents || 0), 0), { whole: true }), sub: 'Current value on the register' },
    { key: 'attention', label: 'Needs attention', value: attention.length, tone: attention.length ? 'warn' : undefined, sub: attention.length ? 'Reported as damaged or faulty' : 'All in good order' }];
}
export const assetsSub = rows => `${plural((rows || []).length, 'item')} with you`;
export const NO_ASSETS = 'You have no assets assigned. Speak to your manager if that’s wrong.';
// An asset as its row: what it says under its name, and its condition in words.
export const assetRow = (a, fmtMoney) => ({ title: a.name,
  meta: [a.category_name, [a.brand, a.model].filter(Boolean).join(' '), a.serial_number && `SN ${a.serial_number}`, a.current_value_cents && fmtMoney(a.current_value_cents, { whole: true })].filter(Boolean).join(' · '),
  condition: sentenceCase(a.condition) });
// Telling the office about an asset: what happened, and the condition it is in now. These are the kinds and conditions the person holding it may send.
export const ASSET_EVENTS = [['condition_change', 'Its condition has changed'], ['damaged', 'It’s damaged'], ['lost', 'It’s lost or stolen'], ['audit', 'Just a check-in']];
export const HOLDER_CONDITIONS = ['good', 'fair', 'poor', 'lost'];
export const conditionLabel = c => sentenceCase(c);
// The report as its form opens: on the condition the register has, when that is one the holder may send, else good.
export const assetReportStart = asset => ({ event_type: 'condition_change', condition: HOLDER_CONDITIONS.includes(asset?.condition) ? asset.condition : 'good', notes: '' });
export const assetReportTitle = asset => `Report on ${asset.name}`;
export const ASSET_REPORT_SENT = 'Thanks — the office has your report';

// ---- the forms a person fills in ----
export const FORMS_SUB = 'Banking, super, licence and other details — fill in or update any time';
export const NO_FORMS = 'No forms published yet.';
// A person's forms as the screen lists them: the ones still to fill in, then the ones they have sent.
export const formsToDo = rows => (rows || []).filter(f => !f.submitted);
export const formsDone = rows => (rows || []).filter(f => f.submitted);
export function formTiles(rows) {
  const todo = formsToDo(rows).length, done = formsDone(rows).length;
  return [
    { key: 'todo', label: 'To fill in', value: todo, tone: todo ? 'warn' : undefined, sub: todo ? 'Waiting on you' : 'All done' },
    { key: 'done', label: 'Submitted', value: done, tone: 'ok', sub: 'You can update these any time' }];
}
// Where a form stands, and what its button says.
export const formRow = f => f.submitted ? { status: 'Submitted', action: 'Edit answers', done: true } : { status: 'Not started', action: 'Fill in', done: false };
// An answer that was saved to the person's pay details comes back as this note in place of what they typed: the box is shown empty, and typing replaces it.
const SAVED_NOTE = /^\(saved to your pay details\)$/;
export const savedOnRecord = v => SAVED_NOTE.test(String(v ?? ''));
export const SAVED_PLACEHOLDER = 'Saved on your record: type to replace';
// A question's label (a required one is starred), and what is shown in its box.
export const fieldLabel = f => `${f.label}${f.required ? ' *' : ''}`;
export const fieldShown = v => savedOnRecord(v) ? '' : v || '';
// The kind of box a question is answered in: 'section' (a heading, no answer), 'textarea', 'select', 'radio', 'checkbox', 'file', 'date', or 'text' with the
// keyboard it wants ('number', 'email', 'tel' or 'text').
export function fieldBox(f) {
  const t = f.field_type;
  if (['section', 'textarea', 'select', 'radio', 'checkbox', 'file', 'date'].includes(t)) return { kind: t };
  return { kind: 'text', keyboard: { number: 'number', email: 'email', phone: 'tel' }[t] || 'text' };
}
// What stands in the way of saving the answers: the first required question with no answer ('' when there is none).
export function formProblem(fields, answers) {
  const missing = (fields || []).find(f => f.field_type !== 'section' && f.required && !(answers || {})[f.id]);
  return missing ? `“${missing.label}” is required` : '';
}
export const formDraft = answers => ({ answers });
export const ANSWERS_SAVED = 'Answers saved';
// A file given as an answer: what is kept for it once it has been uploaded.
export const fileAnswer = ({ r2_key, file_name, file_size_bytes, mime_type }) => ({ r2_key, file_name, file_size_bytes, mime_type });
export const formFilePath = (formId, fieldId) => `/forms/${formId}/fields/${fieldId}/file`;

// ---- notifications ----
// How many are unread: the Worker's own count when it sends one, else counted from the rows.
export const notifUnread = data => data?.unread ?? (data?.rows || []).filter(r => !r.read_at).length;
export const notifBadge = unread => unread > 9 ? '9+' : String(unread);
export const notifBellLabel = unread => unread ? `Notifications, ${unread} unread` : 'Notifications';
export const NO_NOTIFS = 'Nothing yet — you’ll see leave decisions, approvals and tasks here.';
export const notifReadPath = n => `/notifications/${n.id}/read`;

// ---- a person's own settings ----
// Notification emails: what the switch is called and what is said once it is flipped. `emailOn` is how it stands now; `email` is the address on their record.
export const emailSwitch = (emailOn, email) => ({ label: emailOn ? 'Turn off email notifications' : 'Turn on email notifications',
  said: emailOn ? 'Notification emails off' : `Notification emails on — they go to ${email}`, draft: { email_notifications: !emailOn } });
export const emailIsOn = e => e.email_notifications !== 0;
// The morning note: a short note of the person's day, at an hour they choose.
export const DAY_NOTE_HOURS = [5, 6, 7, 8, 9];
export const hourLabel = h => `${h} am`;
export const dayNoteRow = e => e.day_note_hour != null ? { label: `My morning note: ${hourLabel(e.day_note_hour)}`, sub: 'Your day, each morning' } : { label: 'My morning note', sub: 'Get your day each morning' };
export const dayNoteStart = e => ({ on: e.day_note_hour != null, hour: e.day_note_hour ?? 6, email: !!e.day_note_email });
export const DAY_NOTE_ABOUT = 'A short note of what is on for you each morning: the jobs you are on and who is with you, events, who is away, milestones and what is due, then tomorrow in a line. It says only what the calendar shows you, and a morning with nothing on sends nothing.';
export const DAY_NOTE_SWITCH = 'Send me my day each morning';
export const DAY_NOTE_WHERE = 'It goes to the bell menu and, on a phone that has notifications on, to that phone. Nothing is emailed unless you tick the box.';
// Emailing it too is offered only when the company's email is set up and the person has an address.
export const dayNoteEmailLabel = (canEmail, email) => canEmail ? `Also email it to ${email}` : 'Also email it (email is not set up, or there is no address on your record)';
export const dayNoteDraft = ({ on, hour, email }, canEmail) => ({ day_note_hour: on ? Number(hour) : null, day_note_email: !!(on && canEmail && email) });
export const dayNoteSaid = ({ on, hour }) => on ? `Your day will arrive at ${hourLabel(hour)}` : 'Morning note off';
// Changing a PIN: an admin's or owner's has to be longer (they reach everyone's pay and bank details). The Worker also turns away easy ones.
export const pinStrict = role => ['admin', 'owner'].includes(role);
export const pinLabel = strict => `New PIN (${strict ? '6–8' : '4–8'} digits)`;
export const PIN_HINT = 'Not something easy to guess, like 1234 or 0000.';
export const pinProblem = ({ next, confirm }, strict) => !(strict ? /^\d{6,8}$/ : /^\d{4,8}$/).test(String(next || '')) ? `New PIN must be ${strict ? '6–8' : '4–8'} digits` : next !== confirm ? 'PINs don’t match' : '';
export const pinDraft = ({ current, next }) => ({ current_pin: current, new_pin: next });
export const PIN_CHANGED = 'PIN changed — any other devices have been signed out';

// ---- plant check-out ----
// Taking a truck, machine or trailer, handing it back, the daily pre-start and the check of what a ute carries. A row is one of GET plant/available.
export const PLANT_SUB = 'Take a truck, machine or trailer — and hand it back when you’re done';
export const PLANT_SEARCH = 'Search by name, rego, type…';
// With the person, free to take, and with someone else. The search narrows the last two only: what is with you always shows.
export function plantGroups(rows, q = '') {
  const needle = String(q || '').trim().toLowerCase();
  const match = r => !needle || [r.name, r.registration_number, r.category_name, r.brand, r.model, r.holder_name].some(v => String(v || '').toLowerCase().includes(needle));
  const list = rows || [];
  return { mine: list.filter(r => r.mine), free: list.filter(r => !r.mine && !r.holder_name && match(r)), others: list.filter(r => !r.mine && r.holder_name && match(r)), searching: !!needle };
}
export const plantHeads = g => ({ mine: `With you now (${g.mine.length})`, noMine: 'Nothing checked out to you.', free: `Available (${g.free.length})`, noFree: g.searching ? 'No matches.' : 'Everything is checked out.',
  others: `Checked out by others (${g.others.length})` });
// The line under an item's name. `since` writes when it was taken, the client's own way (a time today, a day otherwise).
export const plantMeta = (r, since) => [r.category_name, r.registration_number && `Rego ${r.registration_number}`,
  r.holder_name && !r.mine && `with ${r.holder_name}${r.held_since ? ` since ${since(r.held_since)}` : ''}`, r.mine && r.held_since && `since ${since(r.held_since)}`].filter(Boolean).join(' · ');
// What stops it being taken (in red), else what to know about it (a warning).
export const plantNote = r => r.block_reason ? { tone: 'danger', text: r.block_reason } : r.warning ? { tone: 'warn', text: r.warning } : null;
// An item that cannot be taken (expired rego, test and tag) shows as unavailable, with no button that looks as if it works.
export const plantBlocked = r => !!r.block_reason && !r.mine;
export const PLANT_UNAVAILABLE = 'Unavailable';
// What can be done with an item, in order: [{ mode, label, primary }]. mode is 'prestart' | 'ute' | 'return' | 'take' | 'takeover'.
export function plantActions(r) {
  if (r.mine) return [
    r.prestart_required && { mode: 'prestart', label: r.prestart_due ? 'Pre-start due' : 'Pre-start done', primary: !!r.prestart_due },
    r.ute_checklist_id && { mode: 'ute', label: r.ute_check_due ? 'Ute check due' : 'Check ute', primary: !!r.ute_check_due },
    { mode: 'return', label: 'Return', primary: false }].filter(Boolean);
  if (plantBlocked(r)) return [];
  return [r.holder_name ? { mode: 'takeover', label: 'Take over', primary: false } : { mode: 'take', label: 'Take', primary: true }];
}
// The form that takes, takes over, returns or pre-starts one item.
export const plantFormTitle = (item, mode) => mode === 'return' ? `Return ${item.name}` : mode === 'prestart' ? `Pre-start: ${item.name}` : mode === 'takeover' ? `Take over ${item.name}` : `Take ${item.name}`;
export const plantTakeoverHint = item => `${item.holder_name} still has this checked out. Taking it over moves it to you and lets them know.`;
export const plantReadingLabel = item => `Hour meter / odometer${item.current_hours != null ? ` (last: ${item.current_hours})` : ''} — optional`;
export const RETURN_CONDITIONS = [['good', 'Good'], ['fair', 'Fair — minor wear'], ['poor', 'Poor']];
export const PLANT_CONDITION_LABEL = 'Condition';
export const PLANT_DEFECT_LABEL = 'Any damage or faults? (goes straight to the office)';
export const PLANT_DEFECT_EXAMPLE = 'e.g. hydraulic leak on boom, cracked mirror';
export const PLANT_WHERE_LABEL = 'Where’s it going? (optional)';
export const PLANT_WHERE_EXAMPLE = 'Job or site';
export const PLANT_WHERE_FROM_SCHEDULE = 'From today’s schedule. Change it if it’s going somewhere else.';
export const PLANT_SCHEDULED_TODAY = 'Scheduled today:';
export const plantLicenceLabel = item => `I hold a current ${item.requires_licence}`;
export const PLANT_FAIL_NOTE = 'A check has failed — this tags it out of service and tells the office. Don’t use it until it’s been fixed.';
// The jobs the person is scheduled on today (rows of GET schedule/mine), each once.
export const plantScheduled = (rows, today) => (rows || []).filter(r => r.job_id && !r.activity && r.work_date === today)
  .filter((r, i, all) => all.findIndex(x => x.company_id === r.company_id && x.job_id === r.job_id) === i);
export const plantJobText = r => `#${r.job_id}${r.job_name ? ` ${r.job_name}` : ''}`;
// Where it is most likely going: the job this item is planned onto today, when that is one of the person's; else their only job. null when it can't be told.
export function plantLikely(scheduled, item) {
  const planned = scheduled.filter(r => (r.plant || []).includes(item.name));
  return planned.length === 1 ? planned[0] : scheduled.length === 1 ? scheduled[0] : null;
}
// `check` is what the pre-start checks say (prestartState), null until they have loaded. A return has none.
export const plantFailing = (mode, check) => mode !== 'return' && !!check?.required && !!check.failed;
export const plantSubmitLabel = (mode, failing) => mode === 'return' ? 'Return it' : failing ? 'Report fault — tag out of service' : mode === 'prestart' ? 'Record pre-start' : mode === 'takeover' ? 'Take it over' : 'Take it';
// Whether the form can't be sent yet: the checks still loading or unanswered, or the licence not ticked (a fault is reported without it).
export function plantHeld({ mode, check, item, licence }) {
  if (mode === 'return') return false;
  if (!check) return true;
  if (check.required && !check.ready) return true;
  return mode !== 'prestart' && !plantFailing(mode, check) && !!item.requires_licence && !licence;
}
// What is sent: { path, body }.
export function plantDraft({ item, mode, hours, notes, licence, condition, defect, check }) {
  if (mode === 'return') return { path: `/plant/${item.id}/return`, body: { hours, condition, defect } };
  if (mode === 'prestart') return { path: `/plant/${item.id}/prestart`, body: { hours, prestart: check.prestart } };
  return { path: `/plant/${item.id}/checkout`, body: { hours, notes, licence_confirmed: !!licence, take_over: mode === 'takeover', prestart: check?.required ? check.prestart : undefined } };
}
// What the person is told once it is saved. `res` is the Worker's answer.
export function plantSaid({ item, mode, defect, res }) {
  if (mode === 'return') return defect ? `${item.name} returned — the defect has been sent to the office.` : `${item.name} returned. Thanks!`;
  if (mode === 'prestart') return res?.result === 'pass' ? `Pre-start for ${item.name} recorded — all good.`
    : `Fault recorded. ${item.name} is now out of service and has been handed back — the office has been told. Don’t use it.`;
  return `${item.name} is checked out to you.` + (res?.taken_over_from ? ` ${res.taken_over_from} has been told.` : '') + (res?.warning ? ` Note: ${res.warning}` : '');
}
// A failed pre-start at check-out comes back as a refusal, but it is a finished job (recorded and tagged), not something to try again.
export const plantFaultRecorded = (failing, message) => !!failing && /failed its pre-start/.test(String(message || ''));

// The pre-start checks: `cfg` is GET plant/:id/prestart-form ({ required, photo_required, items: [labels] }), `answers` is { [label]: { result, note } },
// `photos` the keys of the photos sent. → { required, ready, failed, prestart } (prestart is what the Worker takes).
export const PRESTART_HEAD = 'Pre-start checks';
export const PRESTART_ALL_OK = 'All OK';
export const PRESTART_CHOICES = [['pass', 'OK'], ['fail', 'Not OK'], ['na', 'N/A']];
export const PRESTART_WRONG = 'What’s wrong?';
export const PRESTART_MAX_PHOTOS = 6;
export const prestartPhotoLabel = cfg => `Photos${cfg.photo_required ? ' (at least one)' : ' (optional)'} — a walk-around shot, plus any faults`;
export function prestartState(cfg, answers, photos, uploading) {
  const items = cfg.items.map(label => ({ label, result: answers[label]?.result, note: answers[label]?.note || '' }));
  const missing = items.filter(i => !i.result).length + items.filter(i => i.result === 'fail' && !i.note.trim()).length;
  return { required: !!cfg.required, ready: missing === 0 && (!cfg.photo_required || photos.length > 0) && !uploading, failed: items.some(i => i.result === 'fail'), prestart: { items, photos: [...photos] } };
}
export const prestartAllOk = cfg => Object.fromEntries(cfg.items.map(l => [l, { result: 'pass' }]));

// The check of what a ute carries: `checklist` is the one from GET assets/:id/ute-check ({ items: [{ id, label, needs_asset_no }] }), `answers` is
// { [item id]: { answer, asset_no, note } }. → { ready, items } (items is what the Worker takes).
export const UTE_HEAD = 'On the ute?';
export const UTE_ALL_ON = 'All on board';
export const UTE_CHOICES = [['yes', 'Yes'], ['no', 'No'], ['na', 'N/A']];
export const UTE_ASSET_NO = 'Asset number';
export const UTE_ASSET_NO_HINT = '(asset no.)';
export const UTE_WHERE = 'Where is it? (optional)';
export const UTE_NO_LIST = 'This ute has no checklist yet — an admin chooses one on its Ute checklist tab.';
export const UTE_DATE_LABEL = 'Date checked';
export const UTE_NOTES_LABEL = 'Notes (optional)';
export const UTE_SAVE = 'Save check';
export function uteState(checklist, answers) {
  const items = checklist.items.map(it => { const a = answers[it.id] || {}; return { item_id: it.id, label: it.label, answer: a.answer, asset_no: String(a.asset_no || '').trim(), note: String(a.note || '').trim() }; });
  const missing = items.filter((x, i) => !x.answer || (x.answer === 'yes' && checklist.items[i].needs_asset_no && !x.asset_no)).length;
  return { ready: missing === 0, items };
}
export const uteAllOn = (checklist, answers) => Object.fromEntries(checklist.items.map(it => [it.id, { ...answers[it.id], answer: 'yes' }]));
export const uteTitle = asset => asset ? `Check ${asset.name}` : 'Ute check';
export const uteSub = data => data?.asset ? [data.asset.registration_number && `Rego ${data.asset.registration_number}`, data.asset.holder_name && `with ${data.asset.holder_name}`, data.checklist?.name].filter(Boolean).join(' · ') : '';
export const uteDraft = ({ date, check, notes }) => ({ checked_on: date, items: check.items, notes });
export const uteSaid = (res, asset) => res?.short_count ? `Check saved — ${res.short_count} ${res.short_count === 1 ? 'tool' : 'tools'} short (${(res.short || []).join(', ')}). The workshop has been told.` : `Check saved — everything is on ${asset.name}.`;

// ---- My onboarding ----
// A new starter's first weeks: one list of everything on their plate (tasks, induction modules, forms, documents to sign and policies to read), nearest deadline
// first, with one thing to do next. The Worker (GET onboarding/mine?full=1) works out what is theirs and in what order; this words it. `fmtDate` is the client's.
const daysApart = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5);
export const ONB_KIND_LABEL = { task: 'Task', module: 'Induction', form: 'Form', document: 'Document', policy: 'Policy' };
export const onbKey = i => `${i.kind}${i.id}`;
// What the button of something still to do says.
export const onbVerb = i => ({ task: 'Mark done', module: 'Start', form: 'Fill in', document: i.contract ? 'Read & sign' : i.sign ? 'Review & sign' : 'Acknowledge', policy: 'Read & acknowledge' })[i.kind];
export const onbDue = (i, today, fmtDate) => !i.due_date ? '' : i.due_date === today ? 'due today' : i.due_date < today ? `was due ${fmtDate(i.due_date)}` : `due ${fmtDate(i.due_date)}`;
export const onbMeta = (i, today, fmtDate, short) => [ONB_KIND_LABEL[i.kind], i.minutes ? `${i.minutes} min` : null, short ? null : i.description,
  i.done ? (i.done_at ? `done ${fmtDate(i.done_at)}` : 'done') : onbDue(i, today, fmtDate)].filter(Boolean).join(' · ');
export const onbIsLate = (i, today) => !i.done && !!i.due_date && i.due_date < today;
export const onbLate = (data, today) => data.items.filter(i => onbIsLate(i, today)).length;
// Where someone is in their program: before the start day, day N of the plan, or past its finish date.
export function onbPhase(run, today) {
  const toStart = daysApart(today, run.start_date);
  if (toStart > 0) return { before: true, day: 0, text: toStart === 1 ? 'Starts tomorrow' : `Starts in ${toStart} days` };
  const day = 1 - toStart;
  const length = run.target_date ? daysApart(run.start_date, run.target_date) : 0;
  return { before: false, day, text: length >= day ? `Day ${day} of ${length}` : `Day ${day}` };
}
// What is left, grouped by how soon it is due: [{ key, label, rows }]. Anything finished is shown separately.
export function onbGroups(items, today) {
  const week = addDaysYmd(today, 7);
  const groups = [{ key: 'overdue', label: 'Overdue' }, { key: 'today', label: 'Today' }, { key: 'week', label: 'This week' },
    { key: 'later', label: 'Later' }, { key: 'anytime', label: 'Whenever you can' }].map(g => ({ ...g, rows: [] }));
  for (const i of items.filter(x => !x.done)) {
    const key = !i.due_date ? 'anytime' : i.due_date < today ? 'overdue' : i.due_date === today ? 'today' : i.due_date <= week ? 'week' : 'later';
    groups.find(g => g.key === key).rows.push(i);
  }
  return groups.filter(g => g.rows.length > 0);
}
export const onbGroupHead = g => `${g.label} · ${g.rows.length}`;
// The page as lists: what is up next (shown on its own, not twice), the groups of what is left, and what is finished.
export function onbPlan(data, today) {
  const items = data?.items || [];
  const next = items.find(i => !i.done) || null;
  return { next, finished: !!data?.run && data.total > 0 && !next, groups: onbGroups(items.filter(i => i !== next), today), done: items.filter(i => i.done) };
}
export const onbFinishedHead = done => `Finished · ${done.length}`;
export const ONB_UP_NEXT = 'Up next';
export const ONB_ALL_DONE = { title: 'Everything’s done', text: 'Your documents and policies stay under Me whenever you need them.' };
// The top of the page: { eyebrow, template, greeting, name, strong, rest, pct, tone, ring, others }. `strong` is the part of the line in bold.
export function onbHero(data, first, fmtDate) {
  const { run, total, done, others } = data, today = data.today;
  const phase = onbPhase(run, today), left = total - done, late = onbLate(data, today), finished = total > 0 && left === 0, welcome = phase.before || phase.day <= 7;
  const line = total === 0 ? { strong: '', rest: 'Nothing has been given to you yet — your manager is getting things ready.' }
    : finished ? { strong: 'You’ve finished everything.', rest: ' Nice work. Your manager will close this off.' }
    : { strong: `${plural(left, 'thing')} to go`, rest: `${run.target_date ? `, finish by ${fmtDate(run.target_date)}` : ''}${late ? ` · ${late} overdue` : ''}` };
  return { eyebrow: phase.text, template: run.template_name || '', greeting: welcome ? 'Welcome, ' : 'Your onboarding', name: welcome ? (first || 'there') : '', ...line,
    pct: total ? Math.round((done / total) * 100) : 0, tone: finished ? 'ok' : late ? 'warn' : 'accent', ring: `${done} of ${total} done`,
    others: others?.total > 0 ? `Behind the scenes, your manager and the office have done ${others.done} of ${plural(others.total, 'step')} for you.` : '' };
}
// Whether a row opens something when tapped, and its buttons in order: [{ act, label }]. act is 'done' | 'undo' | 'open' | 'download'.
export const onbOpens = i => i.kind === 'module' || i.kind === 'form' || (!i.done && i.kind !== 'task');
export function onbActions(i) {
  if (i.done) return [i.kind === 'task' && { act: 'undo', label: 'Undo' }, i.kind === 'module' && { act: 'open', label: 'View' }, i.kind === 'form' && { act: 'open', label: 'Edit answers' }].filter(Boolean);
  return [i.kind === 'document' && i.file && { act: 'download', label: 'Download' }, { act: i.kind === 'task' ? 'done' : 'open', label: onbVerb(i) }].filter(Boolean);
}
export const ONB_DONE_PILL = 'Done';
export const onbTaskDraft = (item, status) => ({ id: item.id, status });
export const onbTaskSaid = status => status === 'completed' ? 'Done' : 'Back on your list';
export const onbModuleDraft = item => ({ id: item.id, status: 'completed' });
export const ONB_MODULE_SAID = 'Module completed';
export const ONB_MODULE_DONE = 'I’ve completed this';
export const NO_CONTENT = 'No content provided.';
export const moduleSub = m => { const mins = m.minutes ?? m.estimated_minutes; return [mins ? `About ${mins} min` : null, m.description].filter(Boolean).join(' · '); };
// Nothing in progress: finished before, or not started yet.
export const onbEmpty = (data, fmtDate) => data.past?.[0]?.status === 'completed'
  ? `Your onboarding was completed${data.past[0].completed_at ? ` on ${fmtDate(data.past[0].completed_at)}` : ''}. Everything you signed is under My documents.`
  : 'No onboarding in progress. When your manager starts yours, it shows up here.';
// Tasks the person owes on someone else's onboarding.
export const ONB_OWED_HEAD = 'Waiting on you for new starters';
export const onbOwedMeta = (t, fmtDate) => [t.description, `for ${t.for_name}`, t.due_date && `due ${fmtDate(t.due_date)}`].filter(Boolean).join(' · ');

// ---- My departure ----
// A leaver's own tasks and the exit interview. `detail` is GET offboarding-runs/:id ({ run, tasks, interview }).
export const NO_DEPARTURE = 'You have no departure in progress. Speak to your manager if this is unexpected.';
const said = s => { const t = String(s || '').replace(/_/g, ' '); return t ? t[0].toUpperCase() + t.slice(1) : ''; };
export const departureSub = (run, fmtDate) => `Last day ${fmtDate(run.last_day)} · ${said(run.kind)}`;
export const departureTasks = (detail, employeeId) => (detail?.tasks || []).filter(t => t.assignee_id === employeeId);
// The three figures at the top: [{ key, label, value, sub, tone }].
export function departureTiles(detail, employeeId, today, fmtDate) {
  const mine = departureTasks(detail, employeeId), pending = mine.filter(t => t.status === 'pending').length, left = daysApart(today, detail.run.last_day), interview = detail.interview;
  return [
    { key: 'last', label: 'Last day', value: fmtDate(detail.run.last_day), sub: left > 0 ? `${plural(left, 'day')} to go` : left === 0 ? 'Today' : 'Passed' },
    { key: 'tasks', label: 'Tasks for you', value: pending, sub: `${mine.length - pending} of ${plural(mine.length, 'task')} done`, tone: pending ? 'warn' : 'ok' },
    { key: 'interview', label: 'Exit interview', value: interview ? 'Done' : 'To do', sub: interview ? 'Thank you' : 'A few minutes, when you can', tone: interview ? 'ok' : undefined }];
}
export const NO_DEPARTURE_TASKS = 'No tasks assigned to you.';
export const departureTaskMeta = (t, fmtDate) => t.due_date ? `Due ${fmtDate(t.due_date)}` : '';
export const departureTaskDraft = id => ({ id, status: 'completed' });
export const DEPARTURE_TASK_SAID = 'Task done';
// The exit interview.
export const EXIT_HEAD = 'Exit interview';
export const EXIT_ABOUT = 'Your feedback is confidential and helps us improve. 1 = poor · 5 = excellent';
export const EXIT_ALREADY = 'You’ve already sent your feedback. You can update it below.';
export const EXIT_RATINGS = [['rating_role', 'Your role'], ['rating_manager', 'Your manager'], ['rating_culture', 'Team culture'], ['rating_compensation', 'Pay & benefits']];
export const EXIT_SCORES = [1, 2, 3, 4, 5];
export const EXIT_TEXTS = [['reason_for_leaving', 'Reason for leaving'], ['what_worked', 'What worked well?'], ['what_didnt', 'What could be better?']];
export const EXIT_RECOMMEND = 'Would you recommend us as a place to work?';
export const exitStart = existing => existing || { rating_role: '', rating_manager: '', rating_culture: '', rating_compensation: '', what_worked: '', what_didnt: '', reason_for_leaving: '', would_recommend: null };
export const exitDraft = (form, run) => ({ ...form, run_id: run.id });
export const exitSubmitLabel = existing => existing ? 'Update feedback' : 'Send feedback';
export const EXIT_SAID = 'Thank you — your feedback has been recorded.';

// ---- My allowances ----
// What a person has earned, week by week, from time on jobs that carry their allowances. A row is one of GET allowances/mine.
export const ALLOWANCES_SUB = 'What you have earned from time on jobs that carry your allowances';
export const NO_ALLOWANCES = 'Nothing yet. An allowance appears here for a week when you work a job that carries one of yours.';
export const ALLOWANCE_STATE = { proposed: ['warn', 'Waiting for approval'], auto: ['neutral', 'No approval needed'], approved: ['ok', 'Approved'], rejected: ['danger', 'Declined'], changed: ['warn', 'Time changed: decide again'] };
export const allowanceState = r => ({ tone: ALLOWANCE_STATE[r.state]?.[0] || 'neutral', label: ALLOWANCE_STATE[r.state]?.[1] || r.state });
export const allowanceQty = (r, fmtHours) => r.unit === 'hours' ? fmtHours(r.qty / 60) : plural(r.qty, r.frequency === 'week' ? 'week' : 'day');
export const allowanceRowKey = r => `${r.employee_id}|${r.allowance_id}|${r.week_start}`;
export const allowanceJobs = r => [...new Set((r.jobs || []).map(j => j.job_label).filter(Boolean))];
// What it was before the person's time changed, when it has to be decided again.
export const allowanceWas = (r, fmtHours) => r.state === 'changed' && r.was ? `Was ${allowanceQty({ ...r, qty: r.was.qty }, fmtHours)}, ${r.was.status}` : '';
export const ALLOWANCE_NO_RATE = { text: 'No rate', why: 'No rate is set for this allowance on that date' };
export const WEEK_NOT_OVER = 'This week isn’t over yet';
// One row in words: { key, week, name, what, jobs, was, amount, state: { tone, label }, note, notOver }. amount is null when no rate is set for that date.
// The client gives its own ways of writing a range of dates, hours, money and a short day.
export const allowanceRow = (r, { fmtRange, fmtHours, fmtMoney, shortDay }) => ({ key: allowanceRowKey(r), week: fmtRange(r.week_start, r.week_end), name: r.allowance_name,
  what: [allowanceQty(r, fmtHours), r.days?.length > 0 ? r.days.map(shortDay).join(', ') : ''].filter(Boolean).join(' · '), jobs: allowanceJobs(r).join(', '), was: allowanceWas(r, fmtHours),
  amount: r.amount_cents == null ? null : fmtMoney(r.amount_cents), state: allowanceState(r), note: r.state === 'rejected' && r.decision_note ? r.decision_note : '', notOver: r.week_over ? '' : WEEK_NOT_OVER });

// ---- My performance ----
// A person's own goals, the reviews they self-assess, and their 1:1s. Rows are GET goals, reviews/mine and one-on-ones?employee_id=<me>.
// A moment the Worker stored ("2026-11-13 04:12:00" in UTC, or an ISO time) in milliseconds.
const storedMs = s => Date.parse(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(String(s)) ? `${String(s).replace(' ', 'T')}Z` : String(s));
const dayOfStored = at => String(at || '').slice(0, 10);
export const activeGoals = goals => (goals || []).filter(g => g.status === 'active');
// Coming up (soonest first) and the last five held. `now` is the client's clock in milliseconds.
export function oneOnOnes(rows, now) {
  const all = rows || [];
  return { upcoming: all.filter(o => o.status === 'scheduled' && storedMs(o.scheduled_at) >= now).reverse(), past: all.filter(o => o.status === 'completed').slice(0, 5) };
}
export const openReviews = reviews => (reviews || []).filter(r => r.status === 'draft').length;
// The four figures at the top: [{ key, label, value, sub, tone }].
export function perfTiles({ goals, reviews, meetings }, now, fmtDate) {
  const active = activeGoals(goals), achieved = (goals || []).filter(g => g.status === 'achieved').length, open = openReviews(reviews), next = oneOnOnes(meetings, now).upcoming[0];
  const avg = active.length ? Math.round(active.reduce((s, g) => s + (g.progress_pct || 0), 0) / active.length) : 0;
  return [
    { key: 'active', label: 'Active goals', value: active.length, sub: avg ? `${avg}% along on average` : 'Set one to get started' },
    { key: 'achieved', label: 'Achieved', value: achieved, sub: 'All time', tone: achieved ? 'ok' : undefined },
    { key: 'reviews', label: 'Reviews to self-assess', value: open, sub: open ? 'Waiting on you' : 'Nothing waiting', tone: open ? 'warn' : undefined },
    { key: 'next', label: 'Next 1:1', value: next ? fmtDate(dayOfStored(next.scheduled_at)) : '—', sub: next ? `with ${next.manager_name}` : 'None booked' }];
}
export const GOALS_HEAD = 'Active goals';
export const NO_GOALS = 'No active goals — set one to get started.';
export const NEW_GOAL = 'New goal';
export const goalTarget = (g, fmtDate) => g.target_date ? `Target: ${fmtDate(g.target_date)}` : '';
export const goalPct = g => g.progress_pct || 0;
// The three quick buttons on a goal: [{ key, label, say, primary, draft }]. `say` is what a screen reader hears.
export const goalSteps = g => { const pct = goalPct(g); return [
  { key: 'down', label: '−10', say: 'Progress down 10%', primary: false, draft: { id: g.id, progress_pct: Math.max(0, pct - 10) } },
  { key: 'up', label: '+10', say: 'Progress up 10%', primary: false, draft: { id: g.id, progress_pct: Math.min(100, pct + 10) } },
  { key: 'achieved', label: 'Achieved', say: 'Mark achieved', primary: true, draft: { id: g.id, status: 'achieved', progress_pct: 100 } }]; };
// The goal form.
export const goalFormStart = goal => ({ title: '', description: '', target_date: '', progress_pct: 0, ...goal });
export const goalFormTitle = form => form.id ? 'Edit goal' : NEW_GOAL;
export const goalSubmitLabel = form => form.id ? 'Save' : 'Create';
export const GOAL_FIELDS = { title: 'Title', description: 'Description', target_date: 'Target date', progress_pct: 'Progress %' };
export const goalPctOf = v => Math.max(0, Math.min(100, parseInt(v, 10) || 0));
export const goalProblem = form => !String(form.title || '').trim() ? 'Title is required' : '';
export const goalMethod = form => form.id ? 'PUT' : 'POST';
export const GOAL_DELETE_CONFIRM = { title: 'Delete this goal?', confirmLabel: 'Delete' };
export const GOAL_DELETED = 'Goal deleted';
// Reviews. The manager's comments and rating arrive only once the review is finished.
export const REVIEWS_HEAD = 'Reviews';
export const RATINGS = [['exceeds', 'Exceeds expectations'], ['meets', 'Meets expectations'], ['developing', 'Developing'], ['below', 'Below expectations']];
export const REVIEW_STATUS = [['draft', 'Not started'], ['self_submitted', 'Self-assessed'], ['manager_complete', 'Reviewed'], ['closed', 'Closed']];
export const ratingLabel = v => RATINGS.find(r => r[0] === v)?.[1] || '';
export const reviewState = r => ({ tone: { draft: 'neutral', self_submitted: 'warn', manager_complete: 'ok', closed: 'neutral' }[r.status] || 'neutral', label: REVIEW_STATUS.find(s => s[0] === r.status)?.[1] || r.status });
export const reviewMeta = (r, fmtRange) => [fmtRange(r.starts_on, r.ends_on), r.manager_name && `reviewed by ${r.manager_name}`].filter(Boolean).join(' · ');
export const reviewSub = r => [r.employee_name, r.manager_name && `reviewer ${r.manager_name}`].filter(Boolean).join(' · ');
export const reviewFormStart = review => ({ self_assessment: '', manager_comments: '', rating: '', ...review });
// The person writes their self-assessment until they submit it.
export const selfAssessOpen = form => form.status === 'draft';
export const SELF_ASSESS_LABEL = 'Self-assessment';
export const SELF_ASSESS_EXAMPLE = 'What went well, what was hard, what you want to work on next.';
export const SELF_ASSESS_NONE = 'Not submitted yet';
export const MANAGER_COMMENTS_LABEL = 'Manager comments';
export const RATING_LABEL = 'Rating';
export const REVIEW_SAVE_DRAFT = 'Save draft';
export const REVIEW_SUBMIT_SELF = 'Submit self-assessment';
// What the person sends: their self-assessment, and the status when they submit it.
export const selfReviewDraft = (review, form, submit) => ({ id: review.id, self_assessment: form.self_assessment, ...(submit ? { status: 'self_submitted' } : {}) });
export const reviewSaid = status => status === 'self_submitted' ? 'Self-assessment submitted' : status === 'manager_complete' ? 'Review completed' : 'Saved';
// 1:1s: a row in words. `fmtDate` and `fmtDateTime` are the client's.
export const ONE_ON_ONES_HEAD = '1:1s';
export const ONE_ON_ONES_SOON = 'Coming up';
export const ONE_ON_ONES_RECENT = 'Recent';
export const upcomingRow = (o, fmtDateTime) => ({ title: fmtDateTime(o.scheduled_at), meta: [`${o.duration_mins || 30} min with ${o.manager_name}`, o.agenda].filter(Boolean).join(' · '), pill: 'Upcoming' });
export const pastRow = (o, fmtDate) => ({ title: fmtDate(dayOfStored(o.scheduled_at)), meta: `with ${o.manager_name}`, pill: 'Done', notes: o.notes || '', actions: o.action_items || '', actionsLabel: 'Actions: ' });

// ---- support ----
// Asking the product's own support team for help, and following the answer. `list` is GET support/requests ({ requests, me, everyone, can_ask, needs_you });
// `thread` is GET support/requests/:id ({ request, messages, can_allow_access }).
export const SUPPORT_STATUS = { open: ['With AccurateHR', 'info'], waiting: ['AccurateHR replied', 'warn'], solved: ['Solved', 'muted'] };
export const SUPPORT_DAYS = [[1, '1 day'], [3, '3 days'], [7, '7 days']];
export const SUPPORT_WARNING = 'AccurateHR support reads what you send here and answers in the app. Please don’t put a PIN, a password or bank details in a message or a screenshot.';
export const SUPPORT_PICS_MAX = 3;
export const SUPPORT_ASK = 'Ask for help';
// Where a request stands for the person looking: { label, tone }. A reply waiting on the person who asked is their turn.
export function supportState(r, me) {
  const [label, tone] = SUPPORT_STATUS[r.status] || SUPPORT_STATUS.open;
  return r.status === 'waiting' && r.raised_by === me ? { label: 'Your turn', tone: 'warn' } : { label, tone };
}
// The list as its two tabs: { open, solved }, and the words around it.
export const supportTabs = list => ({ open: (list?.requests || []).filter(r => r.status !== 'solved'), solved: (list?.requests || []).filter(r => r.status === 'solved') });
export const supportNeedsYou = list => list?.needs_you > 0 ? `${plural(list.needs_you, 'request')} waiting on your reply.` : '';
export const supportEmpty = (list, tab) => tab === 'solved' ? 'Nothing solved yet.' : list?.can_ask ? 'No open requests. Press Ask for help when you need us.' : 'No open requests.';
export const supportRowMeta = (r, list, fmtDateTime) => [list.everyone && r.raised_by !== list.me ? `Asked by ${r.raised_by_name}` : null, plural(r.messages, 'message'), `last ${fmtDateTime(r.last_message_at)}`].filter(Boolean).join(' · ');
// A new request.
export const SUPPORT_NEW = { title: 'Ask AccurateHR support for help', subject: 'In a few words', subjectExample: 'For example: Leave balances look wrong', body: 'What do you need help with?',
  bodyHint: 'What you were doing, what you expected and what happened instead. The more we know, the faster we can sort it out.', send: 'Send', sent: 'Sent to AccurateHR support' };
export const SUPPORT_SUBJECT_MAX = 120;
export const SUPPORT_BODY_MAX = 4000;
export const supportFormStart = () => ({ subject: '', body: '' });
export const supportCanSend = form => !!String(form.subject || '').trim() && !!String(form.body || '').trim();
export const supportDraft = (form, fileIds) => ({ ...form, file_ids: fileIds });
export const supportPicLabel = n => n ? 'Add another screenshot' : 'Add a screenshot';
export const supportPicLimit = `Up to ${SUPPORT_PICS_MAX}`;
export const SUPPORT_PIC_KIND = 'Use a JPEG, PNG or WebP picture';
export const SUPPORT_PIC_FAILED = 'Couldn’t upload a picture';
export const SUPPORT_PIC_GONE = 'Picture unavailable';
export const supportFilePath = id => `/support/files/${encodeURIComponent(id)}`;
// A thread.
export const supportPath = (id, part = '') => `/support/requests/${encodeURIComponent(id)}${part}`;
export const supportAsked = (r, me, fmtDateTime) => `${r.raised_by === me ? 'You' : r.raised_by_name} asked on ${fmtDateTime(r.created_at)}`;
export const SUPPORT_BACK = 'All support requests';
// What the person may do on it: { reply, solve, reopen } (asking for help is the Support area's edit).
export const supportActions = (r, canAsk) => ({ reply: !!canAsk && r.status !== 'solved', solve: !!canAsk && r.status !== 'solved', reopen: !!canAsk && r.status === 'solved' });
export const SUPPORT_SOLVE = 'Mark solved';
export const SUPPORT_REOPEN = 'Reopen';
export const SUPPORT_SOLVED_NOTE = 'This is solved. Press Reopen if it isn’t.';
export const SUPPORT_REPLY = { label: 'Your reply', example: 'Write a reply…', send: 'Send reply' };
export const supportReplyDraft = (text, fileIds) => ({ body: text, file_ids: fileIds });
export const SUPPORT_TEAM_PILL = 'AccurateHR';
// A message as the thread shows it: a system line is one centred line; the rest say who, when and what, with their pictures.
export const supportMessage = (m, fmtDateTime) => m.from === 'system' ? { system: true, text: `${m.body} · ${fmtDateTime(m.created_at)}` }
  : { system: false, who: m.author_name, team: m.from === 'support', when: fmtDateTime(m.created_at), text: m.body, files: (m.files || []).map(f => f.id) };
// Letting support look at the account: time-limited, on this request only. → null when there is nothing to show, else
// { head, open, text, withdraw } while it is allowed, or { head, open: false, text, allow } when the person may allow it, or { note } when only an admin can.
export const SUPPORT_ACCESS_HEAD = 'Let AccurateHR support look at your account';
export function supportAccess(thread, me, fmtDateTime) {
  const r = thread.request;
  if (r.status === 'solved') return null;
  if (r.access) return { head: SUPPORT_ACCESS_HEAD, open: true, text: `AccurateHR support can look at your account until ${fmtDateTime(r.access.until)}, or until this is marked solved.`, withdraw: !!thread.can_allow_access || r.access.by === me };
  if (thread.can_allow_access) return { head: SUPPORT_ACCESS_HEAD, open: false, allow: true,
    text: 'Sometimes it is quicker if we can see what you see. Allowing it lasts for the time you choose, only for this request, and ends when it is solved. It is recorded in History.' };
  return { note: 'If AccurateHR support needs to look at your account, an owner or admin can allow it from here.' };
}
export const SUPPORT_ALLOW = { label: 'Allow access', howLong: 'For how long', said: 'AccurateHR support can look at your account until it is solved or the time is up' };
export const SUPPORT_WITHDRAW = { label: 'Withdraw access', title: 'Withdraw access?', body: 'AccurateHR support will no longer be able to look at your account for this request.', confirmLabel: 'Withdraw' };
export const SUPPORT_DAYS_START = 3;

// ---- My HR ----
// A person's own profile: their details and emergency contact (which they change when their level allows it), their employment, who they report to and
// how they sign in. `me` is GET me ({ employee, profile, manager, company }). `fmtDate` is the client's.
export const PROFILE_FIELDS = [
  { key: 'dob', label: 'Date of birth', type: 'date' },
  { key: 'aka', label: 'AKA', hint: 'Nicknames, separated by commas.' },
  { key: 'address_line1', label: 'Address', wide: true, address: true, hint: 'Start typing and pick the address: the suburb, state and postcode fill in.' },
  { key: 'suburb', label: 'Suburb', group: 'addr' },
  { key: 'state', label: 'State', group: 'addr' },
  { key: 'postcode', label: 'Postcode', group: 'addr' },
  { key: 'emergency_contact_name', label: 'Emergency contact', section: 'Emergency contact', wide: true },
  { key: 'emergency_contact_phone', label: 'Their phone', type: 'tel', group: 'em' },
  { key: 'emergency_contact_relationship', label: 'Relationship', group: 'em' },
];
// The profile's two halves, for screens that show them in separate panels.
export const PERSONAL_FIELDS = PROFILE_FIELDS.filter(f => !f.key.startsWith('emergency_'));
export const EMERGENCY_FIELDS = PROFILE_FIELDS.filter(f => f.key.startsWith('emergency_'));
export const profileFormStart = profile => ({ ...(profile || {}) });
// What is saved: every field of the form, an empty one as nothing.
export const profileDraft = form => Object.fromEntries(PROFILE_FIELDS.map(f => [f.key, form[f.key] ?? null]));
export const PROFILE_SAVED = 'Profile saved';
export const PROFILE_EDIT = 'Edit profile';
export const PROFILE_EDIT_OFF = 'Profile editing is turned off — ask HR to update your details.';
// How complete the profile is: the checks, what is missing and a percentage. `formRows` is GET forms (left out while it loads). null for someone who can't
// fill it in themselves. An `href` is one of the app's own addresses.
export function profileGaps(profile, formRows, canEdit) {
  if (!canEdit) return null;
  const p = profile || {};
  const checks = [
    { key: 'address', label: 'home address', title: 'Add your home address', ok: !!(p.address_line1 && p.suburb && p.postcode), href: '#/my-hr' },
    { key: 'emergency', label: 'emergency contact', title: 'Add an emergency contact', ok: !!(p.emergency_contact_name && p.emergency_contact_phone), href: '#/my-hr' },
  ];
  if (formRows) {
    const n = formRows.filter(f => !f.submitted).length;
    checks.push({ key: 'forms', label: `${plural(n, 'form')} to fill in`, title: `${plural(n, 'form')} to fill in`, ok: n === 0, href: '#/my-forms' });
  }
  const missing = checks.filter(c => !c.ok);
  return { checks, missing, pct: Math.round(((checks.length - missing.length) / checks.length) * 100) };
}
// The line under the name: { strong, rest }.
export const profileVerdict = gaps => gaps.missing.length === 0 ? { strong: 'Your profile is complete', rest: '. Keep it current — these details are what HR and your emergency contact rely on.' }
  : { strong: `${gaps.pct}% complete`, rest: ` — ${gaps.missing.map(m => m.title).join(' · ')}.` };
export const profileSummary = gaps => ({ ring: `Profile ${gaps.pct}% complete`, pct: `${gaps.pct}%`, note: gaps.missing.length === 0 ? 'Everything HR needs is on file.' : `${plural(gaps.missing.length, 'thing')} still to add.` });
// How long someone has been with the company, from their start day to `today` (both 'YYYY-MM-DD'): "2 yrs 3 mths".
export function tenure(start, today) {
  const a = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(start || '')), b = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(today || ''));
  if (!a || !b) return '';
  const months = (Number(b[1]) - Number(a[1])) * 12 + Number(b[2]) - Number(a[2]) - (Number(b[3]) < Number(a[3]) ? 1 : 0);
  if (months < 0) return 'starts soon';
  if (months < 1) return 'under a month';
  const y = Math.floor(months / 12), m = months % 12;
  return [y && plural(y, 'yr'), m && plural(m, 'mth')].filter(Boolean).join(' ');
}
export const profileFacts = (e, today) => [e.position, e.department, e.employment_type && said(e.employment_type), e.start_date && `With us ${tenure(e.start_date, today)}`].filter(Boolean);
export const profileAddress = p => [p?.address_line1, [p?.suburb, p?.state, p?.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
// The panels, each as a heading and its rows: [{ label, value, empty }]. A row with no value shows `empty`, or a dash.
export const PROFILE_PANELS = { personal: 'Personal details', emergency: 'Emergency contact', employment: 'Employment', reportsTo: 'Reports to', signIn: 'Sign-in & security' };
export const personalRows = (p, fmtDate) => [{ label: 'Date of birth', value: p?.dob ? fmtDate(p.dob) : '', empty: 'Not on file' }, { label: 'AKA', value: p?.aka || '', empty: 'No nickname' }, { label: 'Home address', value: profileAddress(p), empty: 'Not on file' }];
// null when there is nobody to call yet (say `emergencyEmpty` instead).
export const emergencyRows = p => !p?.emergency_contact_name && !p?.emergency_contact_phone ? null
  : [{ label: 'Name', value: p.emergency_contact_name || '' }, { label: 'Phone', value: p.emergency_contact_phone || '', tel: p.emergency_contact_phone ? telHref(p.emergency_contact_phone) : '' }, { label: 'Relationship', value: p.emergency_contact_relationship || '' }];
export const emergencyEmpty = canEdit => canEdit ? 'No emergency contact yet. Add one so we know who to call.' : 'No emergency contact on file — ask HR to add one.';
export const emergencyCall = p => p?.emergency_contact_phone ? { label: `Call ${String(p.emergency_contact_name || '').split(' ')[0] || 'them'}`, tel: telHref(p.emergency_contact_phone) } : null;
export const employmentRows = (e, company, fmtDate) => [{ label: 'Employee type', value: e.position || '' }, { label: 'Department', value: e.department || '' }, { label: 'Employment type', value: e.employment_type ? said(e.employment_type) : '' },
  { label: 'Date of commencement', value: e.start_date ? fmtDate(e.start_date) : '' }, { label: 'Company', value: company?.company_name || '' }, e.expected_weekly_hours && { label: 'Expected hours', value: `${e.expected_weekly_hours}h a week` }].filter(Boolean);
export const NO_MANAGER = 'No manager set.';
export const managerRole = m => m.position || 'Manager';
export const signInRows = e => [{ label: 'Sign-in email', value: e.email || '' }, { label: 'Phone', value: e.phone || '' }];
export const PIN_CHANGE_NOTE = 'Changing your PIN signs out any other device.';

// ---- the company's shared documents ----
// Folders the company shares with its people (kept in its own Dropbox), browsed a folder at a time. `shared` is GET dropbox/shared ({ connected, folders });
// `listing` is GET dropbox/list?folder=&path= ({ folder, path, entries: [{ type: 'folder' | 'file', name, size, modified }] }).
export const SHARED_DOCS = 'Documents';
// Nothing shared yet. An admin is told where to set it up: { before, link, after } around the words that lead there; anyone else gets { text }.
export const sharedEmpty = isAdmin => isAdmin ? { before: 'No folders are shared yet. Connect Dropbox and choose folders in ', link: 'Settings → Dropbox', after: '.' } : { text: 'No documents have been shared with you yet.' };
// The folders are listed but can't be opened while the connection is down.
export const sharedDown = isAdmin => isAdmin ? { before: 'Dropbox is disconnected, so these folders can’t be opened. Reconnect in ', link: 'Settings → Dropbox', after: '.' } : { text: 'Documents are unavailable right now — ask an admin.' };
export const sharedSaid = x => x.text || `${x.before}${x.link}${x.after}`;
// A place inside a shared folder is the names from its top, joined by '/'; '' is the top.
export const sharedJoin = (path, name) => path ? `${path}/${name}` : name;
// The way back up, as crumbs: the folder itself, then each folder below it. `path` is where tapping it leads; the last one is where the person is (here: true).
export function sharedCrumbs(folder, path) {
  const segs = path ? String(path).split('/') : [];
  return [{ label: folder.label, path: '', here: segs.length === 0 }, ...segs.map((s, i) => ({ label: s, path: segs.slice(0, i + 1).join('/'), here: i === segs.length - 1 }))];
}
// One level up from a place, or null at the top of the folder.
export const sharedUp = path => !path ? null : String(path).split('/').slice(0, -1).join('/');
// Whether a listing is the one for this folder and place (an answer for the last place can arrive after the person has moved on).
export const sharedReady = (listing, folder, path) => !!listing && listing.folder?.id === folder.id && listing.path === path;
export const SHARED_FOLDER_EMPTY = 'This folder is empty.';
export const fmtBytes = n => n == null ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;
export const sharedEntryMeta = (e, fmtDate) => e.type === 'file' ? [fmtBytes(e.size), e.modified && fmtDate(e.modified)].filter(Boolean).join(' · ') : '';
// Where a file is fetched from. `inline` asks for it to be shown rather than saved, for the kinds a browser can show.
export const sharedFilePath = (folderId, path, inline) => `/dropbox/file?folder=${encodeURIComponent(folderId)}&path=${encodeURIComponent(path)}${inline ? '&inline=1' : ''}`;
export const sharedListPath = (folderId, path) => `/dropbox/list?folder=${encodeURIComponent(folderId)}&path=${encodeURIComponent(path)}`;
export const SHARED_VIEWABLE = /\.(pdf|png|jpe?g|gif|webp|txt|csv)$/i;

// ---- a contract ----
// A contract or an offer of employment, read and signed by the person it is for. `c` is the contract of GET contracts/:id (with can_sign and can_decline);
// `fmt` is the client's { fmtDate, fmtDateTime }.
export const isOffer = c => c?.kind === 'offer';
// The line above the contract that says where it stands: { tone, text }.
export function contractNote(c, { fmtDate, fmtDateTime }) {
  const offer = isOffer(c);
  if (c.can_sign) return { tone: 'info', text: offer ? 'Read all of it, then accept it by signing at the bottom of the page, or decline it.' : 'Read all of it, then sign at the bottom of the page.' };
  if (c.status === 'signed') return { tone: 'ok', text: `${offer ? 'Accepted' : 'Signed'} by ${c.signature_name} on ${fmtDateTime(c.signed_at)}. Print this page to keep a copy.` };
  if (c.status === 'declined') return { tone: 'warn', text: `Declined on ${fmtDate(c.declined_at)}${c.decline_reason ? `: “${c.decline_reason}”` : ''}. ${c.employee_name} has been archived.` };
  if (c.expired) return { tone: 'warn', text: 'This contract has expired and can no longer be signed. Ask for a new one.' };
  if (c.status === 'sent') return { tone: 'info', text: `Sent ${fmtDate(c.sent_at)}${c.expires_on ? `, valid until ${fmtDate(c.expires_on)}` : ''}. Waiting for ${c.employee_name} to sign.` };
  if (c.status === 'withdrawn') return { tone: 'warn', text: `Withdrawn on ${fmtDate(c.withdrawn_at)}. It can’t be signed.` };
  return { tone: 'info', text: 'A draft: it hasn’t been sent yet.' };
}
// The two signatures under the contract: [{ label, name, when, waiting }] (name and when are empty until that side has signed).
export const contractParties = (c, fmtDateTime) => [
  { label: 'Signed for the company', name: c.employer_name || '', when: c.employer_name ? fmtDateTime(c.employer_signed_at) : '', waiting: 'Not sent yet' },
  { label: 'Signed by the employee', name: c.signature_name || '', when: c.signature_name ? fmtDateTime(c.signed_at) : '', waiting: 'Waiting for their signature' }];
// The record kept under a signed contract.
export const contractReference = c => `Signed electronically. Contract ${c.id}${c.body_sha256 ? ` · text fingerprint (SHA-256) ${c.body_sha256}` : ''}${c.signature_ip ? ` · signed from ${c.signature_ip}` : ''}`;
export const contractFor = c => `For ${c.employee_name}`;
export const CONTRACT_GONE = 'This contract isn’t available to you.';
export const CONTRACT_NONE = 'Open a contract from My documents, or from a person’s page.';
// Signing: the words of the panel, what stands in the way, and what is sent.
export const contractSignWords = offer => ({ head: offer ? 'Accept this offer' : 'Sign this contract', agree: offer ? 'I have read all of this offer and I accept it' : 'I have read all of this contract and I agree to it',
  name: offer ? 'Type your full name to accept' : 'Type your full name to sign', hint: 'Typing your name is your signature. We keep your name, the time, and the address of the device you are using.',
  submit: offer ? 'Accept and sign' : 'Sign', said: offer ? 'Offer accepted. Thank you.' : 'Signed. Thank you.' });
export const contractSignProblem = ({ name, agree }) => !agree ? 'Tick the box to say you have read all of it and agree' : String(name || '').trim().length < 2 ? 'Type your full name to sign' : '';
export const contractSignDraft = name => ({ signature_name: String(name).trim(), agree: true });
// Declining an offer ends it and archives the person, who is then signed out.
export const CONTRACT_DECLINE = { open: 'Decline the offer', about: 'If you decline, this offer ends and your record is archived. You can’t undo it yourself, but whoever sent it can talk to you about it.',
  reason: 'Anything you would like to tell them? (optional)', confirm: 'Yes, decline the offer', doneTitle: 'Offer declined', done: 'You have declined this offer and we have let them know. Thank you for telling us.' };
export const contractDeclineDraft = reason => ({ reason: String(reason || '').trim() });

// ---- Scan a card ----
// A photo of a licence or ticket, read for its number and dates, which the person checks before anything is saved. `card` is what POST qualifications/read
// answers with ({ qualification_number, expiry_date, issued_date, issuing_body, holder_name, unsure: [keys], name_ok, replaces }). `employee` is who it is for
// when someone adds it for them (an admin); staff scan their own, and theirs is sent in for review.
export const SCAN_MAX_PHOTOS = 2;
export const SCAN_TOO_MANY = 'Two photos at most: the front and the back';
export const SCAN_TITLE = 'Scan a card';
export const SCAN_ABOUT = 'Choose which ticket it is, then take or choose a photo of the card (and the back, if the number or date is on it). The number and dates are read off the photo for you to check, and nothing is saved until you say so. The photo is read by an AI model on Cloudflare, the service this app already runs on.';
export const SCAN_OWN = 'A photo of your licence or ticket';
export const SCAN_WORDS = { ticket: 'Which ticket?', other: 'What is it called?', otherExample: 'e.g. Forklift licence', photo: 'Photo of the card', read: 'Read the card', reading: 'Reading the card. This takes a few seconds…', back: 'Back to the photo',
  rightPerson: 'It is the right person’s card', thisCard: 'This card', unsure: 'Not sure: check this against the photo', notes: 'Notes (optional)' };
export const SCAN_FIELDS = [['qualification_number', 'Number'], ['expiry_date', 'Expires (blank if none)', 'date'], ['issued_date', 'Issued', 'date'], ['issuing_body', 'Issued by']];
// Whether the photo can be read yet: a ticket chosen, a photo taken and, for someone adding it for another person, that person chosen.
export const scanCanRead = ({ title, photos, needsPerson, employee }) => !!title && photos > 0 && (!needsPerson || !!employee);
// What is sent to be read. `files` are [{ name, media_type, data }], the photos as data.
export const scanReadDraft = ({ employeeId, title, files }) => ({ employee_id: employeeId, ticket: title, files });
// The form as it opens on what was read, and whether the card renews the one on file or is added beside it.
export const scanFormStart = card => ({ qualification_number: card?.qualification_number || '', expiry_date: card?.expiry_date || '', issued_date: card?.issued_date || '', issuing_body: card?.issuing_body || '', notes: '' });
export const scanModeStart = card => card?.replaces ? 'renew' : 'new';
export const scanUnsure = (card, key) => !!card?.unsure?.includes(key);
// The name on the card is not the person's: what to say, or '' when it matches.
export const scanMismatch = (card, employee) => card?.name_ok === false ? `The name on this card is “${card.holder_name}”${employee ? `, not ${employee.name}` : ', which doesn’t look like yours'}. Make sure it’s the right person’s card.` : '';
// Saving is held while the name does not match and the person has not said it is the right card.
export const scanHeld = (card, rightPerson) => card?.name_ok === false && !rightPerson;
export const scanCheck = employee => `Here’s what was read from the photo. Check it against the card, and fix anything that’s wrong, before you ${employee ? 'add it' : 'send it in'}.`;
// The choice when the person already holds a card for this ticket: [[value, label]].
export const scanModes = (old, fmtDate) => [['renew', `Renews ${old.title}${old.qualification_number ? ` #${old.qualification_number}` : ''}${old.expiry_date ? `, expires ${fmtDate(old.expiry_date)}` : ''} (the old card is kept as history)`],
  ['new', 'An extra card: leave the one on file as it is']];
// What goes on the record, from the ticket and the form as the person left it.
export const scanFields = ({ title, category, form }) => ({ title, category, qualification_number: String(form.qualification_number || '').trim(), issuing_body: String(form.issuing_body || '').trim(), issued_date: form.issued_date, expiry_date: form.expiry_date,
  notes: String(form.notes || '').trim() });
// Staff: the card sent in for an admin to approve (a renewal names the card it replaces). `files` are the uploaded photos.
export const scanSubmitDraft = ({ mode, card, fields, files }) => ({ qualification_id: mode === 'renew' ? card.replaces.id : undefined, ...fields, files });
export const scanSaveLabel = (employee, mode) => employee ? (mode === 'renew' ? 'Renew the card' : 'Add the card') : 'Send for review';
export const scanSaid = (employee, title) => employee ? `Added ${title}` : `Sent ${title} for review`;

// ---- the session and links ----
// The session's fingerprint: the first 8 bytes of SHA-256 over "Bearer <session id>", as 16 hex characters. Everything kept on a device for one session (the outbox,
// the offline copies) is tagged with it, and the service worker keys its copies with the same value, so one person's never show for the next. '' with no session.
export async function sessionFingerprint(sid, subtle = globalThis.crypto?.subtle) {
  if (!sid) return '';
  try {
    const bytes = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(`Bearer ${sid}`)));
    return Array.from(bytes.slice(0, 8)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { return `plain:${sid.slice(0, 16)}`; } // no WebCrypto (plain http on a LAN): still per session
}
// Notification links are "/#/route"; older ones were plain paths. → '#/route'
export function linkToHash(link) {
  if (!link) return null;
  let p = String(link).replace(/^https?:\/\/[^/]+/, '').replace(/^\/?#?\/?/, '').split('?')[0];
  const legacy = { 'timesheets/approvals': 'timesheet-approvals', performance: 'reviews' };
  p = legacy[p] || p.replace(/^(onboarding|offboarding)\/.+$/, '$1');
  return `#/${p || 'dashboard'}`;
}
