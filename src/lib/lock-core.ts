// The app lock's own rules, with nothing from React Native in them so scripts/test-lock.mjs can run them in Node. With the lock switched on, the app asks for
// the phone's own unlock (a face, a fingerprint, or the phone's passcode) when it is opened with a session already on the phone, and when it comes back to
// the front after being away for a while. Someone who has just typed their PIN is not asked again straight away.
export const LOCK_AFTER_MS = 60_000;

// Opening the app. `kept` is true when the session was already on the phone (not typed in just now).
export const lockOnOpen = ({ on, kept }: { on: boolean; kept: boolean }) => on && kept;
// Coming back to the front after `awayMs` out of sight.
export const lockOnReturn = ({ on, awayMs }: { on: boolean; awayMs: number }) => on && awayMs >= LOCK_AFTER_MS;
// Whether this phone can lock the app at all: it needs some way of its own to prove who is holding it (0 is none).
export const lockAvailable = ({ hardware, level }: { hardware: boolean; level: number }) => level > 0 && (hardware || level === 1);

export const LOCK_WORDS = {
  row: 'Lock the app',
  rowOn: 'On: asks for your face, fingerprint or phone passcode when you come back',
  rowOff: 'Off',
  rowNone: 'Set up a screen lock on this phone first',
  title: 'AccurateHR is locked',
  about: 'Unlock with your face, fingerprint or phone passcode.',
  unlock: 'Unlock',
  prompt: 'Unlock AccurateHR',
  turnOn: 'Turn on the app lock',
  failed: 'That didn’t unlock it. Try again.',
  lockedOut: 'Too many tries. Unlock your phone, then try again.',
  signOut: 'Sign out instead',
  saidOn: 'The app lock is on',
  saidOff: 'The app lock is off',
};
// What to say after a try that did not unlock ('' when the person simply closed the prompt).
export const lockProblem = (error: string) => ['user_cancel', 'system_cancel', 'app_cancel', 'user_fallback'].includes(error) ? '' : error === 'lockout' ? LOCK_WORDS.lockedOut : LOCK_WORDS.failed;
