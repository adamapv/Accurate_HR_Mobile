// The notification that stays up while someone is on the clock, so the lock screen and the notification shade say when they started and on what. It draws
// nothing itself: it watches the open job card (the same read Home makes, with what is waiting on the phone laid over it) and puts the notification up, changes
// it, or takes it down. What it says is the rule in src/lib/clock-notice-core.ts. It is silent, cannot be swiped away while on the clock, and tapping it opens
// the app. If the phone will not show notifications, nothing happens and the app works as before.
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { openCardState } from '@shared/field-core.js';
import { applyToOpenCard, applyToRecent } from '@shared/offline-queue.js';
import { CLOCK_CHANNEL, CLOCK_NOTICE_ID, clockNotice } from '@/lib/clock-notice-core';
import { clearClockNotice } from '@/lib/clock-notice-clear';
import { localNowHM, localToday } from '@/lib/dates';
import { useOutbox } from '@/lib/use-outbox';
import { useRead } from '@/lib/use-read';

type Open = { card: { id: string; work_date: string; clock_on: string; job_id: string | null; job_label: string | null; activity_label: string | null } | null; night: unknown; recent?: unknown[] };

// With the app in front the notification still goes in the list, with no banner and no sound.
try { Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }) }); } catch { /* nowhere to show one */ }


// Asked for once, the first time there is something to show; a "no" is not asked again.
async function allowed(): Promise<boolean> {
  const now = await Notifications.getPermissionsAsync();
  if (now.granted) return true;
  if (!now.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export function ClockNotice() {
  const open = useRead<Open>('/job-cards/open');
  const queued = useOutbox();
  const shown = useRef('');
  const view = applyToOpenCard(open.data?.card || null, queued) as { card: (NonNullable<Open['card']> & { pending?: boolean }) | null };
  const state = openCardState({ card: view.card, night: open.data?.night || null, recent: applyToRecent(open.data?.recent || [], queued), date: localToday(), time: localNowHM() }) as { sameDay: boolean };
  const notice = open.data === undefined && !view.card ? undefined : clockNotice(view.card, state.sameDay);
  const key = notice === undefined ? '?' : notice ? notice.key : '';
  useEffect(() => {
    if (key === '?' || key === shown.current) return;   // not known yet, or already saying this
    shown.current = key;
    void (async () => {
      try {
        if (!notice) return await clearClockNotice();
        if (!(await allowed())) return;
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync(CLOCK_CHANNEL.id, { name: CLOCK_CHANNEL.name, importance: Notifications.AndroidImportance.LOW, lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC, showBadge: false });
        }
        await Notifications.scheduleNotificationAsync({ identifier: CLOCK_NOTICE_ID, content: { title: notice.title, body: notice.body, sticky: true, autoDismiss: false, sound: false, data: { link: '/' } },
          trigger: Platform.OS === 'android' ? { channelId: CLOCK_CHANNEL.id } : null });
      } catch { shown.current = ''; /* try again on the next change */ }
    })();
  }, [key]);
  return null;
}
