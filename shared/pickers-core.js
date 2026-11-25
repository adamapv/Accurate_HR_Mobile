// The logic behind the date, time and drop-down boxes (public/pickers.js), kept free of React and the browser so scripts/test-pickers.mjs can
// run it in Node: what a typed date or time means, the month grid a calendar draws, and how a long list is narrowed as someone types.
// Dates are 'YYYY-MM-DD' and times 'HH:MM' (24 hour) everywhere outside the box that shows them, as an <input type="date"> and <input type="time">
// give them, so a screen that swaps one for the other changes nothing else.

export const pad2 = n => String(n).padStart(2, '0');
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// A real calendar day (31 February is not one), as { y, m0, d } with a zero-based month, or null.
export function parseIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const y = +m[1], m0 = +m[2] - 1, d = +m[3];
  const t = new Date(y, m0, d);
  return t.getFullYear() === y && t.getMonth() === m0 && t.getDate() === d ? { y, m0, d } : null;
}
export const isoOf = (y, m0, d) => { const t = new Date(y, m0, d); return `${String(t.getFullYear()).padStart(4, '0')}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`; };
export const isoToday = (now = new Date()) => isoOf(now.getFullYear(), now.getMonth(), now.getDate());
export const addDaysIso = (iso, n) => { const p = parseIso(iso); return p ? isoOf(p.y, p.m0, p.d + n) : iso; };
export const addMonthsIso = (iso, n) => {   // the same day number a month on, or the month's last day when it has no such day (31 Jan + 1 month = 28/29 Feb)
  const p = parseIso(iso); if (!p) return iso;
  const first = new Date(p.y, p.m0 + n, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return isoOf(first.getFullYear(), first.getMonth(), Math.min(p.d, last));
};

// A two-digit year means this century unless that is more than ten years ahead (so 85 is 1985 and 30 is 2030 in 2026): right for a date of
// birth and for a date to come.
function fullYear(text, now) {
  if (text.length === 4) return +text;
  const yy = +text, cur = now.getFullYear() % 100, century = Math.floor(now.getFullYear() / 100) * 100;
  return yy <= cur + 10 ? century + yy : century - 100 + yy;
}
function build(y, m, d) { const iso = `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`; return parseIso(iso) ? iso : null; }

// What someone typed into a date box. '' for blank (clear it), null for something that is not a date, otherwise 'YYYY-MM-DD'.
// Day first, as in Australia: 2/11/2026, 2-11-26, 2.11, 2 Nov 2026, 2nov, 02112026, 2026-11-02, and "today".
export function parseDateText(text, now = new Date()) {
  const s = String(text ?? '').trim().toLowerCase();
  if (!s) return '';
  if (s === 'today' || s === 't') return isoToday(now);
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return build(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[\s/.\-,]+(\d{1,2})(?:[\s/.\-,]+(\d{4}|\d{2}))?$/.exec(s);
  if (m) return build(m[3] ? fullYear(m[3], now) : now.getFullYear(), +m[2], +m[1]);
  m = /^(\d{1,2})[\s.\-,]*([a-z]{3,9})\.?[\s.\-,]*(\d{4}|\d{2})?$/.exec(s);
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3));
    if (mi < 0 || !MONTH_NAMES[mi].toLowerCase().startsWith(m[2]) && m[2] !== 'sept') return null;
    return build(m[3] ? fullYear(m[3], now) : now.getFullYear(), mi + 1, +m[1]);
  }
  m = /^(\d{2})(\d{2})(\d{4}|\d{2})$/.exec(s);
  if (m) return build(fullYear(m[3], now), +m[2], +m[1]);
  return null;
}
// How a date reads in its box: the way the rest of the app writes one (2 Nov 2026).
export function formatDate(iso) {
  const p = parseIso(iso);
  return p ? new Date(p.y, p.m0, p.d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}
// A date held to its limits: the same date, or '' when it is before `min` or after `max` (each 'YYYY-MM-DD' or empty).
export const withinLimits = (iso, min, max) => !!iso && (!min || iso >= min) && (!max || iso <= max);

// The weeks of a month, Monday first, as rows of 7 cells ({ iso, d, out } for a day, out for one from the next or last month).
export function monthGrid(y, m0) {
  const first = new Date(y, m0, 1);
  const lead = (first.getDay() + 6) % 7;
  const total = Math.ceil((lead + new Date(y, m0 + 1, 0).getDate()) / 7) * 7;
  const rows = [];
  for (let i = 0; i < total; i += 7) {
    rows.push(Array.from({ length: 7 }, (_, j) => {
      const t = new Date(y, m0, 1 - lead + i + j);
      return { iso: isoOf(t.getFullYear(), t.getMonth(), t.getDate()), d: t.getDate(), out: t.getMonth() !== m0 };
    }));
  }
  return rows;
}

// The month's weeks padded with the next month's to a fixed number of rows, so a week picker is the same height every month and the week after the month's last
// is always there to pick.
export function weekRows(y, m0, rows = 6) {
  const grid = monthGrid(y, m0);
  while (grid.length < rows) {
    const start = addDaysIso(grid[grid.length - 1][0].iso, 7);
    grid.push(Array.from({ length: 7 }, (_, j) => { const iso = addDaysIso(start, j), q = parseIso(iso); return { iso, d: q.d, out: q.m0 !== m0 }; }));
  }
  return grid;
}
// The Monday of the week a day is in (weeks run Monday to Sunday, as the board's do).
export const mondayOfIso = iso => { const p = parseIso(iso); return p ? isoOf(p.y, p.m0, p.d - ((new Date(p.y, p.m0, p.d).getDay() + 6) % 7)) : iso; };
// A week as the board's header writes it: { text: '2 – 8 Nov', year: '2026' } for the week starting on this Monday; a week over a month's end names both months
// ('30 Nov – 6 Dec') and one over a year's end both years ('2026–27').
export function weekLabel(monday) {
  const a = parseIso(monday), b = parseIso(addDaysIso(monday, 6));
  if (!a || !b) return { text: '', year: '' };
  const mon = p => MONTH_NAMES[p.m0].slice(0, 3);
  return { text: a.m0 === b.m0 ? `${a.d} – ${b.d} ${mon(b)}` : `${a.d} ${mon(a)} – ${b.d} ${mon(b)}`, year: a.y === b.y ? String(a.y) : `${a.y}–${String(b.y).slice(2)}` };
}

// What someone typed into a time box. '' for blank, null for something that is not a time, otherwise 'HH:MM' (24 hour).
// 7, 7:30, 730, 0730, 7.30, 7:30am, 7pm, 12am, 13:45, 1345.
export function parseTimeText(text) {
  const s = String(text ?? '').trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return '';
  const m = /^(\d{1,2})(?:[:.h]?(\d{2}))?(am|pm|a|p)?$/.exec(s) || /^(\d{1,2})(\d{2})(am|pm|a|p)?$/.exec(s);
  if (!m) return null;
  let hh = +m[1]; const mm = m[2] ? +m[2] : 0; const ap = m[3] && m[3][0];
  if (mm > 59) return null;
  if (ap) { if (hh < 1 || hh > 12) return null; hh = ap === 'p' ? (hh === 12 ? 12 : hh + 12) : (hh === 12 ? 0 : hh); }
  else if (hh > 23) return null;
  return `${pad2(hh)}:${pad2(mm)}`;
}
// How a time reads in its box: 7:30 am, or 07:30 where the device keeps 24 hour time.
export function formatTime(hhmm, hour12 = true) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return '';
  const hh = +m[1], mm = m[2];
  if (!hour12) return `${pad2(hh)}:${mm}`;
  return `${hh % 12 === 0 ? 12 : hh % 12}:${mm} ${hh < 12 ? 'am' : 'pm'}`;
}
// The times offered in a time box's list, every `step` minutes through the day.
export function timeSlots(step = 15) {
  const out = [];
  for (let t = 0; t < 24 * 60; t += step) out.push(`${pad2(Math.floor(t / 60))}:${pad2(t % 60)}`);
  return out;
}
// The slot nearest a time (to scroll the list to it), as an index.
export function nearestSlot(hhmm, step = 15) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(hhmm || ''));
  return m ? Math.min(Math.round((+m[1] * 60 + +m[2]) / step), 24 * 60 / step - 1) : 0;
}

// Narrows a list as someone types: every word they typed is somewhere in an option's label (any case), the ones that start with it first.
// options are { value, label }; an empty search keeps them all, in order.
export function filterOptions(options, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return options;
  const scored = [];
  options.forEach((o, i) => {
    const label = String(o.label).toLowerCase();
    if (!words.every(w => label.includes(w))) return;
    scored.push({ o, i, rank: label.startsWith(words[0]) ? 0 : label.split(/[\s(·,–-]+/).some(p => p.startsWith(words[0])) ? 1 : 2 });
  });
  return scored.sort((a, b) => a.rank - b.rank || a.i - b.i).map(s => s.o);
}

// Narrows a list of jobs as someone types: every word is in the job's number, name, customer, site or company, in any order ("#859" and "859" are
// the same), the ones whose number or name starts with it first. Jobs are { id, name, customer_name, site_name }; companyOf(job) names its company.
export function filterJobs(jobs, query, companyOf = () => '') {
  const q = String(query || '').replace(/#/g, ' ');
  if (!q.trim()) return jobs;
  const byLabel = new Map(jobs.map(j => [j, `${j.id} ${j.name || ''} · ${j.customer_name || ''} · ${j.site_name || ''} · ${companyOf(j) || ''}`]));
  return filterOptions(jobs.map(j => ({ job: j, label: byLabel.get(j) })), q).map(o => o.job);
}

// ---- The flip date and time sheet ----
// What the flip-clock sheet (public/pickers.js, FlipSheet) rolls through and what a roll means: a rack of tiles that roll up and down, each with an arrow over and under it.
// Where the date and time boxes use it: the Field view on a touch screen (the phone app's own sheet, `Accurate_HR_Mobile` src/flip.tsx, is the same look and the same rules;
// its src/lib/flip-core.ts says the same things in TypeScript, and can read these instead). Plain functions, so Node tests them (scripts/test-pickers.mjs).

export const FLIP_WORDS = { set: 'Set', now: 'Now', today: 'Today', clear: 'Clear', hour: 'HOUR', minute: 'MIN', day: 'DAY', month: 'MONTH', year: 'YEAR', close: 'Close', earlier: 'earlier', later: 'later', choose: 'Choose',
  dateBox: 'Choose a date', timeBox: 'Choose a time' };
export const FLIP_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// The hours of a day, and the minutes on offer: every one, or every `step` (a time that is kept to quarter hours goes in 15s).
export const FLIP_HOURS = Array.from({ length: 24 }, (_, i) => pad2(i));
export const flipMinutes = step => { const s = step > 1 ? step : 1; return Array.from({ length: Math.ceil(60 / s) }, (_, i) => pad2(i * s)); };
// Where the wheels sit for a time ('HH:MM'; none, or something that is not a time, opens on `fallback`), snapped to the step: { h: the hour, m: which of flipMinutes }.
export function flipTimeParts(hm, step, fallback) {
  const s = step > 1 ? step : 1;
  const [h, m] = (/^\d{1,2}:\d{2}$/.test(hm || '') ? hm : fallback).split(':').map(Number);
  const mins = (Math.round((h * 60 + m) / s) * s) % 1440;
  return { h: Math.floor(mins / 60), m: (mins % 60) / s };
}
export const flipTimeOf = (h, m, step) => `${pad2(h)}:${pad2(m * (step > 1 ? step : 1))}`;

// A date on the wheels: { y, m (0 to 11), d }. A value that is not a day opens on `fallback` (today).
export const flipDaysIn = (y, m0) => new Date(y, m0 + 1, 0).getDate();
export function flipDateParts(iso, fallback) { const p = parseIso(iso) || parseIso(fallback); return p ? { y: p.y, m: p.m0, d: p.d } : { y: 1970, m: 0, d: 1 }; }
// A date from the three wheels; a day the month does not have is its last (31 rolled onto February).
export const flipDateOf = (y, m0, d) => `${String(y).padStart(4, '0')}-${pad2(m0 + 1)}-${pad2(Math.min(d, flipDaysIn(y, m0)))}`;
// Kept inside the earliest and latest day allowed.
export const flipClamp = (iso, min, max) => (max && iso > max ? max : min && iso < min ? min : iso);
// The years on the wheel: from the earliest day allowed (else far enough back for a date of birth) to the latest (else far enough on for an expiry date). `year` is the year
// the wheel opens on: with no limit at an end it is always there (an old date of birth, a far expiry), never cut off.
export function flipYears(today, min, max, year = null) {
  const from = parseIso(min)?.y ?? Math.min(1930, year ?? 1930), to = Math.max(from, parseIso(max)?.y ?? Math.max((parseIso(today)?.y ?? 2026) + 15, year ?? 0));
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}
export const flipWeekday = iso => { const p = parseIso(iso); return p ? WEEKDAY_NAMES[new Date(p.y, p.m0, p.d).getDay()] : ''; };
// The day named in full over the wheels: "Wednesday 18 Nov 2026".
export const flipDayLine = iso => { const p = parseIso(iso); return p ? `${flipWeekday(iso)} ${p.d} ${MONTH_NAMES[p.m0].slice(0, 3)} ${p.y}` : ''; };
// What the sheet says when the wheels show a day outside what is allowed (Set then sets the nearest allowed one).
export const flipOutOfRange = (rolled, min, max) => (max && rolled > max ? 'That is the latest day you can choose.' : min && rolled < min ? 'That is the earliest day you can choose.' : '');
// How a wheel reads for a screen reader: the month in full, the rest as they are.
export const flipMonthName = m0 => MONTH_NAMES[m0] || '';

// Which tile a roll has stopped on (`top` is how far the wheel has scrolled, each tile is `tile` tall), and where an arrow or a key moves a wheel to: the tile
// `by` away, or none at all past either end.
export const flipIndexAt = (top, tile, last) => Math.max(0, Math.min(last, Math.round(top / tile)));
export const flipStep = (index, by, last) => Math.max(0, Math.min(last, index + by));

// A number or a time drawn as dots, like a dot matrix display (the phone app's clock and hours figures, a time in the box and over the Start sheet): each character is a grid
// of five by seven (a colon and a full stop are one wide) and only its lit dots are drawn. → { width, height, r, dots: [[x, y]] } in the units of `size` (the height of
// a character), or null when something in `text` has no glyph (draw it as ordinary text).
const GLYPHS = {
  '0': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'], '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'], '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'], '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'], '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ':': ['.', '.', '#', '.', '#', '.', '.'], '.': ['.', '.', '.', '.', '.', '.', '#'], ' ': ['..', '..', '..', '..', '..', '..', '..'], '-': ['....', '....', '....', '####', '....', '....', '....'],
};
export function dotMatrix(text, size) {
  const s = String(text ?? '');
  if (!s || ![...s].every(c => c in GLYPHS)) return null;
  const pitch = size / 7, r = pitch * 0.39, gap = pitch * 0.9, dots = [];
  let x0 = 0;
  [...s].forEach((c, i) => {
    const g = GLYPHS[c];
    g.forEach((line, y) => [...line].forEach((on, x) => { if (on === '#') dots.push([x0 + x * pitch + pitch / 2, y * pitch + pitch / 2]); }));
    x0 += g[0].length * pitch + (i < s.length - 1 ? gap : 0);
  });
  return { width: x0, height: size, r, dots };
}
