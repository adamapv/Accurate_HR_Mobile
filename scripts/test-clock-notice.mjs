// Tests what the on-the-clock notification says (src/lib/clock-notice-core.ts): `node scripts/test-clock-notice.mjs` (Node 22.18+, which runs TypeScript as it is).
import { clock12, clockNotice } from '../src/lib/clock-notice-core.ts';

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

console.log('\n-- the notification while someone is on the clock');
check(clock12('07:05') === '7:05 am' && clock12('00:30') === '12:30 am' && clock12('12:00') === '12:00 pm' && clock12('22:15') === '10:15 pm' && clock12('') === '', 'a time reads as the clock on the wall');
const card = { work_date: '2026-11-13', clock_on: '07:12', job_id: '4471', job_label: '#4471 Hot water', activity_label: null };
const n = clockNotice(card, true);
check(n.title === 'On the clock since 7:12 am' && n.body === '#4471 Hot water · Open AccurateHR to clock off', 'it says when the person clocked on, on what, and where to clock off');
check(clockNotice(null, true) === null && clockNotice(card, false) === null && clockNotice({ ...card, clock_on: '' }, true) === null, 'nothing shows with nobody on the clock, or for a card left open from another day');
check(clockNotice({ ...card, job_label: null }, true).body.startsWith('#4471 ·') && clockNotice({ ...card, job_label: null, job_id: null, activity_label: 'Workshop' }, true).body.startsWith('Workshop ·')
  && clockNotice({ ...card, job_label: null, job_id: null }, true).body === 'Open AccurateHR to clock off', 'a job with no name shows its number, an activity its name, and neither just the way to clock off');
check(clockNotice({ ...card, pending: true }, true).body.includes('Waiting to send') && clockNotice({ ...card, pending: true }, true).key !== n.key && clockNotice({ ...card }, true).key === n.key
  && clockNotice({ ...card, clock_on: '07:13' }, true).key !== n.key, 'a clock-on still waiting on the phone says so, and the notification is only redrawn when what it says changes');

console.log(failures ? `\n${failures} failed` : '\nAll clock notice checks passed');
process.exit(failures ? 1 : 0);
