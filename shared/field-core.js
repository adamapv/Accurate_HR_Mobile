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
