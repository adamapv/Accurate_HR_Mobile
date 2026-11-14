// When the app hits an error it cannot carry on from, it used to close with nothing said. Now the error is written down on the phone first, and the next
// time the app opens the More tab shows what happened and in which build, so it can be passed on. Only the error's own words and where in the code it was
// are kept: nothing a person typed and nothing from the Worker. It is kept until it is dismissed.
import Storage from 'expo-sqlite/kv-store';
import { APP_BUILD } from './config';

const KEY = 'hrhead_last_crash', STARTING = 'hrhead_starting', SAFE = 'hrhead_safe';
const get = (k: string) => { try { return Storage.getItemSync(k); } catch { return null; } };
const set = (k: string, v: string) => { try { Storage.setItemSync(k, v); } catch { /* nowhere to write it */ } };
const drop = (k: string) => { try { Storage.removeItemSync(k); } catch { /* already gone */ } };

// Safe mode. Each start with a screen leaves a mark (markStarting, from the first screen drawn; a start the phone makes with no screen, to send what is
// waiting, leaves none) that is wiped once the app has been open for a few seconds or is put away (startedCleanly). A start that finds the mark still there
// knows the last one never got that far, whatever stopped it, and from then on the app opens without its extras (the app lock and notifications),
// whose native parts are not even loaded, until the person turns them back on. If that start fails too, the next one is safe again.
const unfinished = get(STARTING) === '1';
if (unfinished) set(SAFE, '1');
export const SAFE_MODE = get(SAFE) === '1';
export function markStarting() { set(STARTING, '1'); }
export function startedCleanly() { drop(STARTING); }
// Takes effect the next time the app is opened.
export function leaveSafeMode() { drop(SAFE); }

export type Crash = { at: number; build: string; message: string; where: string; fatal: boolean };

// The first few lines of where it happened, which is enough to find it.
const whereOf = (stack: unknown) => String(stack || '').split('\n').slice(0, 6).map(l => l.trim()).filter(Boolean).join('\n').slice(0, 900);

export function noteCrash(error: unknown, fatal: boolean) {
  try {
    const e = error as { message?: unknown; stack?: unknown } | null;
    const crash: Crash = { at: Date.now(), build: APP_BUILD, message: String(e?.message ?? error ?? 'Unknown error').slice(0, 400), where: whereOf(e?.stack), fatal };
    Storage.setItemSync(KEY, JSON.stringify(crash));
  } catch { /* nowhere to write it */ }
}
export function lastCrash(): Crash | null {
  try { const raw = Storage.getItemSync(KEY); return raw ? JSON.parse(raw) as Crash : null; } catch { return null; }
}
export function forgetCrash() { try { Storage.removeItemSync(KEY); } catch { /* already gone */ } }
// What to pass on, as one piece of text.
export const crashText = (c: Crash) => `AccurateHR ${c.build}\n${new Date(c.at).toISOString()}${c.fatal ? ' (the app closed)' : ''}\n${c.message}\n${c.where}`;

// Every error nothing else caught goes through here first, then on to what the phone would have done anyway.
type Handler = (error: unknown, isFatal?: boolean) => void;
const utils = (globalThis as { ErrorUtils?: { getGlobalHandler: () => Handler; setGlobalHandler: (h: Handler) => void } }).ErrorUtils;
if (utils) {
  const before = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => { noteCrash(error, !!isFatal); if (isFatal) set(SAFE, '1'); before(error, isFatal); });
}
