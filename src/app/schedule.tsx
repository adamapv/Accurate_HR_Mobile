// My schedule: where the person is working over the next four weeks, a day at a time. A day appears once it is published. Each job is the same card Home
// shows (who else is on it, the plant, Navigate, Call PM, Call team leaders). Starting a job is done on Home, where its safety checks are.
import { Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { byWorkDate, dayLongOf, SCHED_WORDS, SCHEDULE_AHEAD_DAYS } from '@shared/field-core.js';
import { addDaysIso } from '@shared/pickers-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtTime, localToday, parseDay } from '@/lib/dates';
import { useTheme } from '@/theme';
import { JobRow, type SchedRow } from '@/job-row';
import { Body, Empty, Notice, Problem, Screen, Title } from '@/ui';

const longDate = (iso: string) => parseDay(iso).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });

export default function Schedule() {
  const { state } = useSession();
  const t = useTheme();
  const today = localToday();
  const sched = useRead<{ rows: SchedRow[] }>(`/schedule/mine?from=${today}&to=${addDaysIso(today, SCHEDULE_AHEAD_DAYS)}`);
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  const byDay = byWorkDate(sched.data?.rows) as Record<string, SchedRow[]>;
  const days = Object.keys(byDay).sort();
  return (
    <Screen>
      <Title>My schedule</Title>
      <Body tone="muted">{SCHED_WORDS.sub as string}</Body>
      {sched.offlineAt !== null && <Notice tone="warn" icon="cloud-offline-outline">{`No signal. Showing what was saved at ${fmtTime(sched.offlineAt)}.`}</Notice>}
      <Problem>{sched.error}</Problem>
      {!sched.data ? (sched.error ? null : <Body tone="muted">Loading…</Body>)
        : days.length === 0 ? <Empty icon="calendar-outline">{SCHED_WORDS.empty as string}</Empty>
        : days.map(d => (
          <View key={d} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 }}>
              <View style={{ width: 52, alignItems: 'center', paddingVertical: 7, borderRadius: 14, backgroundColor: d === today ? t.accent : t.surface2 }}>
                <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: d === today ? '#FFFFFF' : t.muted }}>{parseDay(d).toLocaleDateString('en-AU', { weekday: 'short' }).toUpperCase()}</Text>
                <Text style={{ fontSize: 19, fontWeight: '900', color: d === today ? '#FFFFFF' : t.fg }}>{parseDay(d).getDate()}</Text>
              </View>
              <Text accessibilityRole="header" style={{ flex: 1, color: t.fg, fontSize: 19, fontWeight: '800', letterSpacing: -0.3 }}>{dayLongOf(d, today, longDate) as string}</Text>
            </View>
            {byDay[d].map(r => <JobRow key={`${r.company_id}:${r.job_id}`} row={r} />)}
          </View>
        ))}
    </Screen>
  );
}
