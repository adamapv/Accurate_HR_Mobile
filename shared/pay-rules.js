// Timesheet profiles — which simPRO schedule rate each minute of a day's
// work goes at. Shared by the browser (Settings preview, timesheet
// screens) and the Worker (what's sent to simPRO), so both always agree.
//
// A profile's rules hold one rule per day type:
//   { window: { start: 'HH:MM', end: 'HH:MM' } | null,
//     tiers: [{ rate_id, rate_name, hours, rate_ids? }, …, { rate_id, rate_name, hours: null }] }
// rate_id/rate_name are the default simPRO company's; rate_ids holds the
// same tier's rate in each other company ({ companyId: { id, name } }).
// The tiers run in order through the day's worked time: the first
// `hours` at the first rate, the next `hours` at the second, and so on;
// the last tier (hours: null) takes whatever's left. Time outside the
// window is never ordinary: it goes to the overtime tiers (the second tier
// onwards) and does not use up the first tier's hours, and ordinary time
// past the first tier's hours goes to the overtime tiers too. Counts reset
// every day.
//
// A profile may also carry a Night shift rule, `rules.night` (null when the
// profile has none), which works by shift rather than by day:
//   { window: { start: 'HH:MM', end: 'HH:MM' },      // a shift that clocks on inside this window is a night shift (may wrap midnight)
//     rest_hours: 10,                                // hours of rest before the next clock-on (0 = none)
//     lines: [{ band: { from, to } | null, after_hours: number | null, rate_id, rate_name, rate_ids? }, …] }
// The lines are read in order and the first one that fits a minute decides its
// rate: `band` is a clock-time band (may wrap midnight), `after_hours` means
// "once this many hours of the shift have been worked" (the unpaid lunch is
// not worked time). The last line has neither and takes everything else.
// A shift is one job card, which may run past midnight: its time is stored on
// two dates, the first ending at 24:00, and the day-by-day `splitDay` never
// sees it (see `splitEntries`). Times are wall-clock minutes, like every card.

export const DAY_TYPES = ['weekday', 'saturday', 'sunday', 'public_holiday'];
export const DAY_TYPE_LABELS = { weekday: 'Weekdays', saturday: 'Saturday', sunday: 'Sunday', public_holiday: 'Public holiday', night: 'Night shift' };
// The longest a shift that runs past midnight may be.
export const NIGHT_MAX_MINS = 16 * 60;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMins = t => { const [hh, mm] = String(t).split(':').map(Number); return hh * 60 + mm; };
const toHHMM = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const roundHours = mins => Math.round(mins / 60 * 100) / 100;
const DAY_MS = 86400000;

// A public holiday wins over the day of the week.
export function dayType(date, holidays) {
  if (holidays && (holidays.has ? holidays.has(date) : holidays.includes(date))) return 'public_holiday';
  const dow = weekdayOfYmd(date);
  return dow === 6 ? 'saturday' : dow === 0 ? 'sunday' : 'weekday';
}

// One rule with a single "all hours" tier at the given rate.
export function flatRule(rate, window = null) {
  return { window, tiers: [{ rate_id: rate?.id ? String(rate.id) : '', rate_name: rate?.name || '', hours: null }] };
}
export function flatRules(rate) {
  return Object.fromEntries(DAY_TYPES.map(d => [d, flatRule(rate)]));
}

// The same line's rate in each other simPRO company: { companyId: { id, name } }.
function otherRates(t) {
  return Object.entries(t?.rate_ids && typeof t.rate_ids === 'object' ? t.rate_ids : {})
    .filter(([, v]) => v?.id != null && v.id !== '').map(([co, v]) => [co, { id: String(v.id), name: v.name ? String(v.name) : '' }]);
}
const ratePart = t => ({ rate_id: t?.rate_id != null && t.rate_id !== '' ? String(t.rate_id) : '', rate_name: t?.rate_name ? String(t.rate_name) : '' });

// Tidies what a form or the database gives us into the shape above.
export function normaliseRules(input) {
  let rules = input;
  if (typeof rules === 'string') { try { rules = JSON.parse(rules); } catch { rules = null; } }
  const out = {};
  for (const d of DAY_TYPES) {
    const r = rules?.[d] || {};
    const w = r.window && r.window.start && r.window.end ? { start: String(r.window.start), end: String(r.window.end) } : null;
    const tiers = (Array.isArray(r.tiers) ? r.tiers : []).map((t, i, all) => {
      const others = otherRates(t);
      return {
        ...ratePart(t),
        hours: i === all.length - 1 || t?.hours === '' || t?.hours == null ? null : Number(t.hours),
        ...(others.length ? { rate_ids: Object.fromEntries(others) } : {})
      };
    });
    out[d] = { window: w, tiers: tiers.length ? tiers : flatRule(null).tiers };
  }
  // The Night shift rule is only there when the profile has one.
  const night = normaliseNight(rules?.night);
  if (night) out.night = night;
  return out;
}

// One Night shift rule tidied into the shape above, or null for "this profile has none".
export function normaliseNight(input) {
  if (!input || typeof input !== 'object') return null;
  const w = input.window && input.window.start && input.window.end ? { start: String(input.window.start), end: String(input.window.end) } : null;
  const rest = Number(input.rest_hours);
  const lines = (Array.isArray(input.lines) ? input.lines : []).map((l, i, all) => {
    const last = i === all.length - 1;
    const others = otherRates(l);
    const after = l?.after_hours === '' || l?.after_hours == null ? null : Number(l.after_hours);
    return {
      band: !last && l?.band && l.band.from && l.band.to ? { from: String(l.band.from), to: String(l.band.to) } : null,
      after_hours: last ? null : after,
      ...ratePart(l),
      ...(others.length ? { rate_ids: Object.fromEntries(others) } : {})
    };
  });
  return {
    window: w,
    rest_hours: Number.isFinite(rest) && rest > 0 ? Math.min(48, Math.round(rest * 100) / 100) : 0,
    lines: lines.length ? lines : [{ band: null, after_hours: null, rate_id: '', rate_name: '' }]
  };
}

// Returns a problem as a sentence fragment, or null when the Night shift rule is usable.
export function validateNight(night, { needRates = true } = {}) {
  const label = DAY_TYPE_LABELS.night;
  if (!night || typeof night !== 'object') return `${label} needs its rules`;
  if (!night.window || !HHMM.test(night.window.start) || !HHMM.test(night.window.end)) return `${label}: choose the times a night shift starts between`;
  if (night.window.start === night.window.end) return `${label}: the start times can’t begin and finish at the same time`;
  if (!(Number.isFinite(night.rest_hours) && night.rest_hours >= 0 && night.rest_hours <= 48)) return `${label}: rest must be between 0 and 48 hours`;
  if (!Array.isArray(night.lines) || !night.lines.length) return `${label} needs at least one rate`;
  for (const [i, l] of night.lines.entries()) {
    const last = i === night.lines.length - 1;
    if (needRates && !l.rate_id) return `${label}: choose a schedule rate for every line`;
    if (last && (l.band || l.after_hours != null)) return `${label}: the last line takes everything else, so it has no times or hours`;
    if (l.band) {
      if (!HHMM.test(l.band.from) || !HHMM.test(l.band.to)) return `${label}: each time band needs a start and a finish`;
      if (l.band.from === l.band.to) return `${label}: a time band can’t begin and finish at the same time`;
    }
    if (l.after_hours != null && !(Number.isFinite(l.after_hours) && l.after_hours > 0 && l.after_hours <= 24)) return `${label}: hours into the shift must be more than 0 and at most 24`;
  }
  return null;
}

// Returns a problem as a sentence fragment, or null when the rules are usable.
// `needRates` = false lets a profile be saved before its rates are picked.
export function validateRules(rules, { needRates = true } = {}) {
  for (const d of DAY_TYPES) {
    const r = rules?.[d], label = DAY_TYPE_LABELS[d];
    if (!r || !Array.isArray(r.tiers) || !r.tiers.length) return `${label} needs at least one rate`;
    if (r.window) {
      if (!HHMM.test(r.window.start) || !HHMM.test(r.window.end)) return `${label}: the ordinary hours need a start and finish time`;
      if (toMins(r.window.start) >= toMins(r.window.end)) return `${label}: the ordinary hours must finish after they start`;
    }
    for (const [i, t] of r.tiers.entries()) {
      const last = i === r.tiers.length - 1;
      if (needRates && !t.rate_id) return `${label}: choose a schedule rate for every line`;
      if (!last && !(Number.isFinite(t.hours) && t.hours > 0 && t.hours <= 24)) return `${label}: each line except the last needs a number of hours`;
    }
  }
  if (rules?.night) return validateNight(rules.night, { needRates });
  return null;
}

// The rate lines of one rule: a day rule's tiers or the Night shift rule's lines.
export const ratesOf = rule => rule?.lines ?? rule?.tiers ?? [];

// Every rate line a profile uses, day rules first and then the Night shift's.
export function allRateLines(rules) {
  return [...DAY_TYPES.flatMap(d => ratesOf(rules?.[d])), ...ratesOf(rules?.night)];
}

// Rules that are missing a rate (so time can't go to simPRO yet): day types, then 'night'.
export function missingRates(rules) {
  const days = DAY_TYPES.filter(d => rules?.[d]?.tiers?.some(t => !t.rate_id));
  return rules?.night?.lines?.some(l => !l.rate_id) ? [...days, 'night'] : days;
}

// Splits one person's time entries for one date ({ id, start_time,
// end_time }) into blocks by rate: { [entryId]: [{ start, end, rate_id,
// rate_name, mins }] }.
export function splitDay(rule, entries) {
  const tiers = rule?.tiers?.length ? rule.tiers : flatRule(null).tiers;
  // Two running totals (in minutes): ordinary time, against the first line's hours, and overtime, against the
  // later lines. Time outside the ordinary window only ever counts as overtime, so it does not use up the day's
  // ordinary hours; time inside the window past the first line's hours counts as overtime too.
  const ordCap = tiers.length > 1 && tiers[0].hours != null ? Math.round(Number(tiers[0].hours) * 60) : Infinity;
  // Running total of overtime minutes at which each later line ends; the last never does.
  const otEnds = [];
  let acc = 0;
  for (const [i, t] of tiers.entries()) {
    if (i === 0) { otEnds.push(0); continue; }
    acc = i === tiers.length - 1 || t.hours == null ? Infinity : acc + Math.round(Number(t.hours) * 60);
    otEnds.push(acc);
  }
  const win = rule?.window && tiers.length > 1 ? [toMins(rule.window.start), toMins(rule.window.end)] : null;
  const out = {};
  let ord = 0, ot = 0;
  const sorted = [...entries].sort((a, b) => toMins(a.start_time) - toMins(b.start_time));
  for (const e of sorted) {
    const blocks = [];
    let cur = toMins(e.start_time);
    const end = toMins(e.end_time);
    while (cur < end) {
      const inside = !win || (cur >= win[0] && cur < win[1]);
      // The next point where the window opens or closes (the time changes kind there).
      let next = Math.min(end, !win ? Infinity : cur < win[0] ? win[0] : cur < win[1] ? win[1] : Infinity);
      let idx = 0;
      if (inside && ord < ordCap) next = Math.min(next, cur + (ordCap - ord));
      else {
        idx = otEnds.findIndex((x, i) => i > 0 && ot < x);
        next = Math.min(next, cur + (otEnds[idx] - ot));
      }
      const mins = next - cur;
      if (idx === 0) ord += mins; else ot += mins;
      const t = tiers[idx];
      const prev = blocks[blocks.length - 1];
      if (prev && prev.rate_id === (t.rate_id || '') && prev.rate_name === (t.rate_name || '')) prev.endM = next;
      else blocks.push({ startM: cur, endM: next, rate_id: t.rate_id || '', rate_name: t.rate_name || '' });
      cur = next;
    }
    out[e.id] = blocks.map(b => ({ start: toHHMM(b.startM), end: toHHMM(b.endM), rate_id: b.rate_id, rate_name: b.rate_name, mins: b.endM - b.startM }));
  }
  return out;
}

// ---------- Night shift: whole shifts that may run past midnight ----------

// 'YYYY-MM-DD' plus n days (n may be negative); calendar arithmetic only, no time zone.
export function addDaysYmd(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dayNo = ymd => Math.round(Date.parse(`${ymd}T00:00:00Z`) / DAY_MS);
// A wall-clock moment as minutes since 1970 on the clock the card was typed on. Wall-clock like every card: no daylight saving correction.
export const wallMins = (ymd, hhmm) => dayNo(ymd) * 1440 + toMins(hhmm);
const fromWallMins = m => ({ date: new Date(Math.floor(m / 1440) * DAY_MS).toISOString().slice(0, 10), time: toHHMM(m % 1440) });

// Is `t` ('HH:MM') inside a { start, end } window? A window that ends before it starts wraps midnight.
export function inWindow(win, t) {
  if (!win) return false;
  const m = toMins(t), a = toMins(win.start), b = toMins(win.end);
  return a < b ? m >= a && m < b : m >= a || m < b;
}

// A finished card that clocks off at or before its clock-on time ran past midnight ('00:00' is midnight itself).
export const isOvernight = card => !!card?.clock_off && toMins(card.clock_off) <= toMins(card.clock_on);

// A card is a night shift when it ran past midnight, or when it clocked on inside the profile's night window.
export const isNightCard = (night, card) => isOvernight(card) || (!!night?.window && inWindow(night.window, card?.clock_on));

// The dates a card's time sits on: its own, and the next one when it ran past midnight with time after it.
export function cardDates(card) {
  return isOvernight(card) && card.clock_off !== '00:00' ? [card.work_date, addDaysYmd(card.work_date, 1)] : [card.work_date];
}

// When a finished card ended: { date, time }.
export const cardEnd = card => ({ date: isOvernight(card) ? addDaysYmd(card.work_date, 1) : card.work_date, time: card.clock_off });

// How long a card ran in minutes, lunch included (a card that ran past midnight is under 24 hours).
export function cardMins(card) {
  const on = toMins(card.clock_on), off = toMins(card.clock_off);
  return off > on ? off - on : off + 1440 - on;
}

// Splits ONE night shift's time entries ({ id, work_date, start_time, end_time }, on the shift's first date and
// the next) into rate blocks, like splitDay: { [entryId]: [{ start, end, rate_id, rate_name, mins }] }. Each
// block's times are on its own entry's date (the first date's last block ends at '24:00'). For every stretch of
// worked time the first line whose band holds the clock time and whose `after_hours` has been worked wins;
// the hours worked count only time in entries, so the unpaid lunch gap is not counted. No rule gives blank rates.
export function splitShift(night, entries) {
  const lines = night?.lines?.length ? night.lines : [{ band: null, after_hours: null, rate_id: '', rate_name: '' }];
  const first = entries.reduce((d, e) => (!d || e.work_date < d ? e.work_date : d), '');
  const shift = entries.map(e => ({ e, base: (dayNo(e.work_date) - dayNo(first)) * 1440 })).map(x => ({ ...x, start: x.base + toMins(x.e.start_time), end: x.base + toMins(x.e.end_time) }))
    .sort((a, b) => a.start - b.start);
  const edges = lines.flatMap(l => (l.band ? [toMins(l.band.from), toMins(l.band.to)] : []));
  const thresholds = lines.map(l => (l.after_hours != null ? Math.round(Number(l.after_hours) * 60) : null));
  const out = {};
  let worked = 0;
  for (const { e, base, start, end } of shift) {
    const blocks = [];
    let cur = start;
    while (cur < end) {
      const clock = toHHMM(cur % 1440);
      const idx = lines.findIndex((l, i) => (!l.band || inWindow({ start: l.band.from, end: l.band.to }, clock)) && (thresholds[i] == null || worked >= thresholds[i]));
      const line = lines[idx < 0 ? lines.length - 1 : idx];
      // The time changes kind at the next band edge, or when the hours worked reach a line's threshold.
      let next = end;
      for (const edge of edges) { const d = (edge - cur % 1440 + 1440) % 1440; if (d > 0) next = Math.min(next, cur + d); }
      for (const t of thresholds) if (t != null && worked < t) next = Math.min(next, cur + (t - worked));
      const prev = blocks[blocks.length - 1];
      if (prev && prev.rate_id === (line.rate_id || '') && prev.rate_name === (line.rate_name || '')) prev.endM = next;
      else blocks.push({ startM: cur, endM: next, rate_id: line.rate_id || '', rate_name: line.rate_name || '' });
      worked += next - cur;
      cur = next;
    }
    out[e.id] = blocks.map(b => ({ start: toHHMM(b.startM - base), end: toHHMM(b.endM - base), rate_id: b.rate_id, rate_name: b.rate_name, mins: b.endM - b.startM }));
  }
  return out;
}

// The one way a Worker or screen turns entries into rate blocks: entries of a night shift (a card that is a night
// card) go through splitShift as a whole shift, everything else goes through splitDay one date at a time.
//   entries   [{ id, work_date, start_time, end_time, card_id? }] the entries to split
//   cards     the cards they belong to, by id ({ id, work_date, clock_on, clock_off }): a Map or an object
//   siblings  the other entries of those night cards that are not in `entries` (their other date), same shape
//   holidays  the public holiday dates (a Set or an array)
// Returns { blocks: { [entryId]: [...] }, kind: { [entryId]: 'night' | a day type } }.
export function splitEntries(rules, { entries = [], cards = null, siblings = [], holidays = null } = {}) {
  const cardOf = id => (id && cards ? (cards.get ? cards.get(id) : cards[id]) || null : null);
  const night = rules?.night || null;
  const blocks = {}, kind = {};
  const byDate = new Map(), byCard = new Map();
  for (const e of entries) {
    const card = cardOf(e.card_id);
    if (card && isNightCard(night, card)) byCard.set(e.card_id, [...(byCard.get(e.card_id) || []), e]);
    else byDate.set(e.work_date, [...(byDate.get(e.work_date) || []), e]);
  }
  for (const [date, list] of byDate) {
    const type = dayType(date, holidays);
    Object.assign(blocks, splitDay(rules?.[type], list));
    for (const e of list) kind[e.id] = type;
  }
  for (const [cardId, list] of byCard) {
    const have = new Set(list.map(e => e.id));
    const whole = [...list, ...siblings.filter(s => s.card_id === cardId && !have.has(s.id))];
    const split = splitShift(night, whole);
    for (const e of list) { blocks[e.id] = split[e.id] || []; kind[e.id] = 'night'; }
  }
  return { blocks, kind };
}

// ---------- Rest period after a night shift ----------

// The moment the rest after a person's latest night shift ends: { date, time, card } or null (no night rule,
// no rest set, or no finished night card). `cards` are the person's finished cards ({ id, work_date, clock_on, clock_off }).
export function restUntil(night, cards) {
  if (!night || !(night.rest_hours > 0)) return null;
  let latest = null;
  for (const c of cards || []) {
    if (!c.clock_off || !isNightCard(night, c)) continue;
    const end = wallMins(cardEnd(c).date, c.clock_off);
    if (!latest || end > latest.end) latest = { card: c, end };
  }
  return latest ? { ...fromWallMins(latest.end + Math.round(night.rest_hours * 60)), card: latest.card } : null;
}

// Is clocking on at `at` ({ date, time }) inside a rest period? Null when it is allowed, else { until: { date, time }, card }.
// Only shifts that had already ended count, and the moment the rest ends is allowed.
export function restHold(night, cards, at) {
  if (!night || !(night.rest_hours > 0)) return null;
  const now = wallMins(at.date, at.time);
  const done = (cards || []).filter(c => c.clock_off && wallMins(cardEnd(c).date, c.clock_off) <= now);
  const r = restUntil(night, done);
  return r && wallMins(r.date, r.time) > now ? { until: { date: r.date, time: r.time }, card: r.card } : null;
}

// The ids of the cards (a person's finished cards, in any order) that clocked on inside the rest after an earlier night shift.
export function restBreaches(night, cards) {
  const out = new Set();
  if (!night || !(night.rest_hours > 0)) return out;
  for (const c of cards || []) {
    if (!c.clock_off) continue;
    const hold = restHold(night, (cards || []).filter(o => o.id !== c.id), { date: c.work_date, time: c.clock_on });
    if (hold) out.add(c.id);
  }
  return out;
}

// "Night shifts starting 18:00–04:00 · 10h rest · 3 rate lines" for a list.
export function describeNight(night) {
  if (!night) return '';
  const lines = night.lines || [];
  return `Night shifts starting ${night.window?.start}–${night.window?.end}${night.rest_hours > 0 ? ` · ${night.rest_hours}h rest` : ''} · ${lines.length} rate ${lines.length === 1 ? 'line' : 'lines'}`;
}

// Hours per rate across any number of blocks, in first-seen order.
export function summariseBlocks(blocks) {
  const by = new Map();
  for (const b of blocks || []) {
    const key = b.rate_id || `?${b.rate_name}`;
    const row = by.get(key) || { rate_id: b.rate_id, rate_name: b.rate_name, mins: 0 };
    row.mins += b.mins;
    by.set(key, row);
  }
  return [...by.values()].map(r => ({ rate_id: r.rate_id, rate_name: r.rate_name, hours: roundHours(r.mins) }));
}

// "8h Normal → 2h Time and a half → Double time" for one day type.
export function describeRule(rule) {
  const tiers = rule?.tiers || [];
  const name = t => t.rate_name || (t.rate_id ? `Rate #${t.rate_id}` : 'no rate chosen');
  const text = tiers.map((t, i) => i === tiers.length - 1 ? (tiers.length > 1 ? `then ${name(t)}` : `All hours at ${name(t)}`) : `${t.hours}h ${name(t)}`).join(', ');
  return rule?.window && tiers.length > 1 ? `${text} (ordinary ${rule.window.start}–${rule.window.end})` : text;
}

// The day of the week of a 'YYYY-MM-DD' date: 0 is Sunday, 6 Saturday.
export function weekdayOfYmd(date) { return new Date(`${date}T00:00:00Z`).getUTCDay(); }
