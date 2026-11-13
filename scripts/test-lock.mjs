// Tests the app lock's rules (src/lib/lock-core.ts): `node scripts/test-lock.mjs` (Node 22.18+, which runs TypeScript as it is).
import { LOCK_AFTER_MS, LOCK_WORDS, lockAvailable, lockOnOpen, lockOnReturn, lockProblem } from '../src/lib/lock-core.ts';

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

console.log('\n-- when the app asks to be unlocked');
check(lockOnOpen({ on: true, kept: true }) && !lockOnOpen({ on: true, kept: false }) && !lockOnOpen({ on: false, kept: true }), 'opening with a session already on the phone asks; someone who has just typed their PIN is not asked again');
check(lockOnReturn({ on: true, awayMs: LOCK_AFTER_MS }) && !lockOnReturn({ on: true, awayMs: LOCK_AFTER_MS - 1 }) && !lockOnReturn({ on: false, awayMs: LOCK_AFTER_MS * 10 }) && LOCK_AFTER_MS === 60000,
  'coming back after a minute away asks; a glance at another app does not, and nothing asks with the lock off');
check(lockAvailable({ hardware: true, level: 3 }) && lockAvailable({ hardware: true, level: 2 }) && lockAvailable({ hardware: false, level: 1 }) && !lockAvailable({ hardware: true, level: 0 }) && !lockAvailable({ hardware: false, level: 0 }),
  'the lock is offered on a phone with a face, a fingerprint or a passcode set up, and not on one with none');

console.log('\n-- what a failed try says');
check(lockProblem('user_cancel') === '' && lockProblem('system_cancel') === '' && lockProblem('lockout') === LOCK_WORDS.lockedOut && lockProblem('authentication_failed') === LOCK_WORDS.failed && lockProblem('unknown') === LOCK_WORDS.failed,
  'closing the prompt says nothing; too many tries and a failed one each say what to do');
check(Object.values(LOCK_WORDS).every(w => typeof w === 'string' && w.length > 2) && !/Face ID|Touch ID|WorkSafe|Melbourne/.test(JSON.stringify(LOCK_WORDS)), 'the words name no phone maker’s feature and no customer');

console.log(failures ? `\n${failures} failed` : '\nAll lock checks passed');
process.exit(failures ? 1 : 0);
