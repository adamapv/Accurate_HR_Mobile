// What the flip-clock date and time sheet (src/flip.tsx) rolls through, and what a roll means. No React Native here, so Node tests it (scripts/test-flip.mjs).
const pad2 = (n: number) => String(n).padStart(2, '0');

export const HOURS = Array.from({ length: 24 }, (_, i) => pad2(i));
// The minutes on offer: every one, or every `step` (a time typed by hand goes in quarter hours).
export const minuteItems = (step?: number) => { const s = step && step > 1 ? step : 1; return Array.from({ length: Math.ceil(60 / s) }, (_, i) => pad2(i * s)); };
// Where the wheels sit for a time ('HH:MM'; none opens on `fallback`), snapped to the step. → { h: the hour, m: which of minuteItems }
export function timeParts(hm: string, step: number | undefined, fallback: string) {
  const s = step && step > 1 ? step : 1;
  const [h, m] = (/^\d{1,2}:\d{2}$/.test(hm) ? hm : fallback).split(':').map(Number);
  const mins = (Math.round((h * 60 + m) / s) * s) % 1440;
  return { h: Math.floor(mins / 60), m: (mins % 60) / s };
}
export const timeOf = (h: number, m: number, step?: number) => `${pad2(h)}:${pad2(m * (step && step > 1 ? step : 1))}`;

export const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const daysIn = (year: number, month: number) => new Date(year, month + 1, 0).getDate();   // month is 0 to 11
export const dateParts = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return { y, m: m - 1, d }; };
// A date from the three wheels; a day the month does not have is its last (31 rolled onto February).
export const dateOf = (y: number, m: number, d: number) => `${y}-${pad2(m + 1)}-${pad2(Math.min(d, daysIn(y, m)))}`;
// Kept inside the earliest and latest day allowed.
export const clampDay = (iso: string, min?: string, max?: string) => (max && iso > max ? max : min && iso < min ? min : iso);
// The years on the wheel: from the earliest day allowed (else far enough back for a date of birth) to the latest (else far enough on for an expiry date).
export function yearItems(today: string, min?: string, max?: string) {
  const from = min ? dateParts(min).y : 1930, to = Math.max(from, max ? dateParts(max).y : dateParts(today).y + 15);
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}
export const weekdayOf = (iso: string) => { const { y, m, d } = dateParts(iso); return WEEKDAYS[new Date(y, m, d).getDay()]; };
export const dayLine = (iso: string) => { const { y, m, d } = dateParts(iso); return `${weekdayOf(iso)} ${d} ${MONTHS[m][0]}${MONTHS[m].slice(1).toLowerCase()} ${y}`; };
// What the sheet says when the wheels show a day outside what is allowed (the day set is the nearest allowed one).
export const outOfRange = (rolled: string, min?: string, max?: string) => (max && rolled > max ? 'That is the latest day you can choose.' : min && rolled < min ? 'That is the earliest day you can choose.' : '');
export const FLIP_WORDS = { set: 'Set', now: 'Now', today: 'Today', hour: 'HOUR', minute: 'MIN', day: 'DAY', month: 'MONTH', year: 'YEAR', close: 'Close', earlier: 'earlier', later: 'later' };
