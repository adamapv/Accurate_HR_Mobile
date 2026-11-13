// The Field view's own rules, kept free of React and the browser so scripts/test-field-core.mjs can run them in Node and the phone app (its own repo) can use the
// same file: how a job card lays out its time, what a new card opens with, where the open card and the rest period stand, which days of a week can be submitted
// and what stands in the way, what needs doing now, the session's fingerprint, and where a notification's link leads. Nothing here reads the clock, storage or the
// page: today, the time and how a date is written are passed in, so the web app and the phone app say the same thing from the same data.
// Dates are 'YYYY-MM-DD' and times 'HH:MM' (24 hour).
import { pad2 } from './pickers-core.js';
import { NIGHT_MAX_MINS, isOvernight, addDaysYmd, wallMins, inWindow, restHold } from './pay-rules.js';

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
