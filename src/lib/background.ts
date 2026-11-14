// Sending what is waiting on the phone while the app is closed. The phone decides when it runs (roughly every quarter of an hour at best, when there is
// signal and battery to spare), so this is a safety net behind the sends the app makes while it is open, never a promise of a time.
// When the app is still in memory the task uses the app's own outbox, so there is only ever one copy of what is waiting. From cold it reads the session from
// the phone's secure store and builds one of its own. Every new record carries the id it waits under, so the Worker answers a second send of it with the
// record it already has. A refused session is left for the app to deal with when it is next opened.
import { SAFE_MODE } from './crash';
import * as SecureStore from 'expo-secure-store';
import { createApi } from './api-core';
import { API_URL, APP_VERSION } from './config';
import { SESSION_KEY, TENANT_KEY } from './keys';
import { fingerprintOf, makeOffline } from './offline';
import type { Offline } from './offline-core';

export const SEND_TASK = 'send-waiting';
// The phone's task runner is loaded only when it is needed, and never in safe mode.
const tasks = () => ({ BackgroundTask: require('expo-background-task') as typeof import('expo-background-task'), TaskManager: require('expo-task-manager') as typeof import('expo-task-manager') });
const EVERY_MINUTES = 15;

// The app's own outbox while it is running (session.tsx says so), else null.
let live: Offline | null = null;
export const setLiveOutbox = (offline: Offline | null) => { live = offline; };

export async function sendWaiting(): Promise<void> {
  if (live) { await live.replay(); return; }
  const [sid, tenant] = await Promise.all([SESSION_KEY, TENANT_KEY].map(k => SecureStore.getItemAsync(k).catch(() => null)));
  if (!sid) return;
  const api = createApi({ baseUrl: API_URL, appVersion: APP_VERSION, getSession: () => sid, getTenantCode: () => tenant, onSignedOut: () => {} });
  const offline = makeOffline(api);
  offline.setSession(await fingerprintOf(sid));
  await offline.replay();
}

// Defined as the file loads, which is what lets the phone start it with no screen open.
try {
  if (!SAFE_MODE) { const { BackgroundTask, TaskManager } = tasks(); TaskManager.defineTask(SEND_TASK, async () => {
    try { await sendWaiting(); return BackgroundTask.BackgroundTaskResult.Success; }
    catch { return BackgroundTask.BackgroundTaskResult.Failed; }
  }); }
} catch { /* somewhere tasks cannot run: the app still sends while it is open */ }

// On while someone is signed in, off when nobody is. A phone that does not allow it (battery saver, a restricted app) is left alone.
export async function sendInBackground(on: boolean): Promise<void> {
  if (SAFE_MODE) return;
  try {
    const { BackgroundTask, TaskManager } = tasks();
    if (!on) { if (await TaskManager.isTaskRegisteredAsync(SEND_TASK)) await BackgroundTask.unregisterTaskAsync(SEND_TASK); return; }
    if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) return;
    await BackgroundTask.registerTaskAsync(SEND_TASK, { minimumInterval: EVERY_MINUTES });
  } catch { /* the app still sends while it is open */ }
}
