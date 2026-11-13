// Opens the right screen when a notification is tapped, whether the app was open, in the background or closed. It draws nothing. The notification that
// stays up while on the clock leads Home; one from the Worker leads where its link says (src/lib/push.ts).
import { useEffect } from 'react';
import { router, type Href } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { CLOCK_NOTICE_ID } from '@/lib/clock-notice-core';
import { pushTarget } from '@/lib/push';

export function PushTaps() {
  useEffect(() => {
    let handled = '';
    const open = (r: Notifications.NotificationResponse | null | undefined) => {
      if (!r) return;
      const req = r.notification.request;
      const key = `${req.identifier}:${r.notification.date}`;
      if (key === handled) return;
      handled = key;
      if (req.identifier === CLOCK_NOTICE_ID) { router.navigate('/'); return; }
      router.push(pushTarget(req.content.data as Record<string, unknown> | null) as Href);
    };
    // The tap that opened the app from closed, then every tap after.
    try { open(Notifications.getLastNotificationResponse()); } catch { /* nothing opened the app */ }
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);
  return null;
}
