// Sending what is waiting on the phone while the app is closed. The phone decides when it runs (roughly every quarter of an hour at best, when there is
// signal and battery to spare), so this is a safety net behind the sends the app makes while it is open, never a promise of a time.
// When the app is still in memory the task uses the app's own outbox, so there is only ever one copy of what is waiting. From cold it reads the session from
// the phone's secure store and builds one of its own. Every new record carries the id it waits under, so the Worker answers a second send of it with the
// record it already has. A refused session is left for the app to deal with when it is next opened.
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import * as SecureStore from 'expo-secure-store';
import { createApi } from './api-core';
import { API_URL, APP_VERSION } from './config';
import { SESSION_KEY, TENANT_KEY } from './keys';
import { fingerprintOf, makeOffline } from './offline';
import type { Offline } from './offline-core';

export const SEND_TASK = 'send-waiting';
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
  TaskManager.defineTask(SEND_TASK, async () => {
    try { await sendWaiting(); return BackgroundTask.BackgroundTaskResult.Success; }
    catch { return BackgroundTask.BackgroundTaskResult.Failed; }
  });
} catch { /* somewhere tasks cannot run: the app still sends while it is open */ }

// On while someone is signed in, off when nobody is. A phone that does not allow it (battery saver, a restricted app) is left alone.
export async function sendInBackground(on: boolean): Promise<void> {
  try {
    if (!on) { if (await TaskManager.isTaskRegisteredAsync(SEND_TASK)) await BackgroundTask.unregisterTaskAsync(SEND_TASK); return; }
    if ((await BackgroundTask.getStatusAsync()) !== BackgroundTask.BackgroundTaskStatus.Available) return;
    await BackgroundTask.registerTaskAsync(SEND_TASK, { minimumInterval: EVERY_MINUTES });
  } catch { /* the app still sends while it is open */ }
}
