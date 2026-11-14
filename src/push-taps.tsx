// Opens the right screen when a notification is tapped, whether the app was open, in the background or closed. It draws nothing. The notification that
// stays up while on the clock leads Home; one from the Worker leads where its link says (src/lib/push.ts).
import { useEffect } from 'react';
import { router, type Href } from 'expo-router';
import type { NotificationResponse } from 'expo-notifications';
import { SAFE_MODE } from '@/lib/crash';
import { CLOCK_NOTICE_ID } from '@/lib/clock-notice-core';
import { pushTarget } from '@/lib/push';

// The phone's notifications are loaded only when first needed, and never in safe mode.
const N = () => require('expo-notifications') as typeof import('expo-notifications');

export function PushTaps() {
  useEffect(() => {
    if (SAFE_MODE) return undefined;
    let handled = '';
    const open = (r: NotificationResponse | null | undefined) => {
      if (!r) return;
      const req = r.notification.request;
      const key = `${req.identifier}:${r.notification.date}`;
      if (key === handled) return;
      handled = key;
      if (req.identifier === CLOCK_NOTICE_ID) { router.navigate('/'); return; }
      router.push(pushTarget(req.content.data as Record<string, unknown> | null) as Href);
    };
    // The tap that opened the app from closed, then every tap after.
    try { open(N().getLastNotificationResponse()); } catch { /* nothing opened the app */ }
    const sub = N().addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
  return null;
}
