// On the clock and not on Home or the Job card tab: a slim bar above the tab bar says since when, for how long and on what, with Clock off beside it. (Those two have the full clock,
// so they do without.) What it says is the web app's own rule (shared/field-core.js). It reads the open job card as Home does, with what is still waiting
// on the phone laid over it.
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clockStripJob, clockStripLine, openCardState } from '@shared/field-core.js';
import { applyToOpenCard, applyToRecent } from '@shared/offline-queue.js';
import { fmtDate, localNowHM, localToday } from '@/lib/dates';
import { useOutbox } from '@/lib/use-outbox';
import { useRead } from '@/lib/use-read';
import { useTheme } from '@/theme';
import { setTabsExtra, Touch } from '@/ui';

type Open = { card: { id: string; work_date: string; clock_on: string; job_label: string | null; activity_label: string | null } | null; night: unknown; recent?: unknown[] };
export const STRIP_HEIGHT = 62;

export function ClockStrip() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const open = useRead<Open>('/job-cards/open');
  const queued = useOutbox();
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(id); }, []);
  const card = (applyToOpenCard(open.data?.card || null, queued) as { card: Open['card'] }).card;
  const on = !!card && path !== '/' && path !== '/day';   // Home and the Job card tab lead with the clock themselves
  useEffect(() => { setTabsExtra(on ? STRIP_HEIGHT + 8 : 0); return () => setTabsExtra(0); }, [on]);
  if (!card || !on) return null;
  const clock = openCardState({ card, night: open.data?.night || null, recent: applyToRecent(open.data?.recent || [], queued), date: localToday(), time: localNowHM() }) as { sameDay: boolean; elapsed: number };
  return (
    <View accessibilityRole="summary" style={[styles.strip, { bottom: Math.max(insets.bottom, 10) + 74 + 8, backgroundColor: t.surface, borderColor: t.line2, shadowColor: '#000' }]}>
      <View style={[styles.live, { backgroundColor: t.ok }]} />
      <View style={styles.words}>
        <Text numberOfLines={1} style={[styles.line, { color: t.fg }]}>{clockStripLine(card, clock.sameDay, clock.elapsed, fmtDate) as string}</Text>
        <Text numberOfLines={1} style={[styles.job, { color: t.muted }]}>{clockStripJob(card) as string}</Text>
      </View>
      <Touch accessibilityRole="button" accessibilityLabel="Clock off" onPress={() => router.push({ pathname: '/job-card', params: { id: card.id } })} style={[styles.off, { backgroundColor: t.accent }]}>
        <Text style={styles.offText}>Clock off</Text>
      </Touch>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { position: 'absolute', left: 14, right: 14, height: STRIP_HEIGHT, borderRadius: 22, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 16, paddingRight: 10,
    shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 10 },
  live: { width: 10, height: 10, borderRadius: 5 },
  words: { flex: 1, gap: 1 },
  line: { fontSize: 14.5, fontWeight: '800' },
  job: { fontSize: 13 },
  off: { height: 42, borderRadius: 21, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  offText: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '800' },
});
