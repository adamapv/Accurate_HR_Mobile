// The copied logic runs here as it does in the web app: `node scripts/test-shared.mjs`. The rules themselves are tested where they live (AccurateHR's npm run check);
// this only shows that every copied file loads with nothing from a browser, and that the ones the app already uses answer.
import { SHARED } from './shared-list.mjs';

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };
const mods = {};
for (const name of SHARED) {
  try { mods[name] = await import(new URL(`../shared/${name}`, import.meta.url).href); } catch (e) { mods[name] = null; console.log(`      ${name}: ${e.message}`); }
}
check(SHARED.every(n => mods[n]), `all ${SHARED.length} copied files load with no browser`);
const F = mods['field-core.js'], A = mods['access.js'];
const plan = F.planJobCard('07:00', '15:30', true, [{ pct: 100 }]);
check(plan.worked === 480 && plan.lunch === '10:30–11:00', 'a job card lays out as on the web (8 hours worked from 7 to 3:30, lunch at 10:30)');
check(F.openCardState({ card: { work_date: '2030-03-04', clock_on: '07:00' }, night: null, recent: [], date: '2030-03-04', time: '09:30' }).elapsed === 150, 'the clock says how long a card has been on');
check(A.can({ field_view: { scope: 'all', edit: false, approve: false } }, 'field_view') === true && A.can({ field_view: { scope: 'none', edit: false, approve: false } }, 'field_view') === false, 'an access level decides what a person sees');
check(await F.sessionFingerprint('abc') !== await F.sessionFingerprint('abd') && (await F.sessionFingerprint('abc')).length === 16, 'a session has its own fingerprint');

console.log(failures ? `\n${failures} failed` : '\nAll shared logic checks passed');
process.exit(failures ? 1 : 0);
