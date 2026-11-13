// Notifications from the Worker to this phone. Once someone is signed in and the phone allows notifications, the app tells the Worker the token the phone's
// own push service knows it by; the Worker sends to it, and takes it over for whoever registers it last, so a phone that changes hands stops getting the last
// person's. On sign-out the token is removed. A build with no push service set up has no token, and nothing here happens. Tapping a notification opens the
// screen its link names (src/lib/links.ts); a chat opens that chat.
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { Api } from './api-core';
import { APP_VERSION, HAS_PUSH } from './config';
import { screenFor } from './links';

// The channel the Worker's notifications arrive on (Android), made once.
export const PUSH_CHANNEL = { id: 'general', name: 'Notifications' };

let registered: string | null = null;   // the token the Worker has for this phone, while someone is signed in

// Whether the phone will show notifications, asking once if it has not been asked.
async function allowed(): Promise<boolean> {
  const now = await Notifications.getPermissionsAsync();
  if (now.granted) return true;
  if (!now.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export async function registerForPush(api: Api): Promise<void> {
  try {
    if (!HAS_PUSH || Platform.OS !== 'android' || !(await allowed())) return;   // an iPhone joins when there is an iPhone build
    await Notifications.setNotificationChannelAsync(PUSH_CHANNEL.id, { name: PUSH_CHANNEL.name, importance: Notifications.AndroidImportance.DEFAULT });
    const token = (await Notifications.getDevicePushTokenAsync()).data;
    if (typeof token !== 'string' || !token || token === registered) return;
    await api('/push/device', { method: 'POST', body: { token, platform: 'android', app_version: APP_VERSION } });
    registered = token;
  } catch { /* no push service in this build, or no signal: the app works as before */ }
}
export async function unregisterFromPush(api: Api): Promise<void> {
  const token = registered;
  registered = null;
  if (!token) return;
  try { await api('/push/device', { method: 'DELETE', body: { token } }); } catch { /* the Worker moves it to the next person who registers */ }
}

// Where a tapped notification leads: the chat it is about, the screen its link names, or the notifications list.
export function pushTarget(data: Record<string, unknown> | null | undefined): string {
  const link = typeof data?.link === 'string' ? data.link : '';
  const chat = /[#/]chat\?t=([A-Za-z0-9_-]+)/.exec(link);
  if (chat) return `/chat?id=${chat[1]}`;
  return screenFor(link) || '/notifications';
}
