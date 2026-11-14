// Tests what the flip-clock date and time sheet rolls through (src/lib/flip-core.ts): `node scripts/test-flip.mjs` (Node 22.18+, which runs TypeScript as it is).
import { clampDay, dateOf, dateParts, dayLine, daysIn, HOURS, minuteItems, MONTHS, outOfRange, timeOf, timeParts, weekdayOf, yearItems, FLIP_WORDS } from '../src/lib/flip-core.ts';

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

console.log('\n-- a time on the wheels');
check(HOURS.length === 24 && HOURS[0] === '00' && HOURS[23] === '23' && minuteItems().length === 60 && minuteItems(15).join() === '00,15,30,45' && minuteItems(1).length === 60, 'the hours of a day, and every minute or every quarter hour');
check(JSON.stringify(timeParts('07:45', undefined, '09:00')) === '{"h":7,"m":45}' && JSON.stringify(timeParts('07:45', 15, '09:00')) === '{"h":7,"m":3}' && JSON.stringify(timeParts('07:53', 15, '09:00')) === '{"h":8,"m":0}'
  && JSON.stringify(timeParts('', 15, '09:07')) === '{"h":9,"m":0}' && JSON.stringify(timeParts('23:58', 15, '09:00')) === '{"h":0,"m":0}', 'a time opens where it is, snapped to the step; none opens on now; the last minutes of the day roll round to midnight');
check(timeOf(7, 45) === '07:45' && timeOf(7, 3, 15) === '07:45' && timeOf(0, 0, 15) === '00:00' && timeOf(timeParts('16:30', 15, '').h, timeParts('16:30', 15, '').m, 15) === '16:30', 'the wheels read back as the time they show');

console.log('\n-- a date on the wheels');
check(daysIn(2026, 1) === 28 && daysIn(2028, 1) === 29 && daysIn(2026, 10) === 30 && MONTHS.length === 12 && MONTHS[10] === 'NOV', 'a month has its own days, with a leap year');
check(JSON.stringify(dateParts('2026-11-14')) === '{"y":2026,"m":10,"d":14}' && dateOf(2026, 10, 14) === '2026-11-14' && dateOf(2026, 1, 31) === '2026-02-28' && dateOf(2028, 1, 31) === '2028-02-29', 'a day the month does not have is its last');
check(clampDay('2026-11-20', undefined, '2026-11-14') === '2026-11-14' && clampDay('2026-11-01', '2026-11-05') === '2026-11-05' && clampDay('2026-11-10', '2026-11-05', '2026-11-14') === '2026-11-10'
  && /latest/.test(outOfRange('2026-11-20', undefined, '2026-11-14')) && /earliest/.test(outOfRange('2026-11-01', '2026-11-05')) && outOfRange('2026-11-10', '2026-11-05', '2026-11-14') === '', 'a day past the latest or before the earliest is set as the nearest allowed one, and the sheet says so');
check(yearItems('2026-11-14', undefined, '2026-11-14').at(-1) === 2026 && yearItems('2026-11-14', undefined, '2026-11-14')[0] === 1930 && yearItems('2026-11-14', '2026-11-14')[0] === 2026 && yearItems('2026-11-14', '2026-11-14').at(-1) === 2041
  && yearItems('2026-11-14', '2030-01-01', '2029-01-01').length === 1, 'the years run from the earliest allowed (else back far enough for a date of birth) to the latest (else on far enough for an expiry)');
check(weekdayOf('2026-11-14') === 'Saturday' && dayLine('2026-11-14') === 'Saturday 14 Nov 2026', 'the day is named in full over the wheels');
check(Object.values(FLIP_WORDS).every(w => typeof w === 'string' && w.length > 1), 'every word on the sheet is there');

console.log(failures ? `\n${failures} failed` : '\nAll flip sheet checks passed');
process.exit(failures ? 1 : 0);
