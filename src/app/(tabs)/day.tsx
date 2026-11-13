// The Job card tab: one day's time. The day's cards (with what is still waiting on the phone laid over them), its total, where the day stands with the approver,
// what an approver would query, and Add time. A card opens in the job card form to change or delete while the day is still the person's own.
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { cardOnDate, dayIsMine, dayRowOf, entryHours, planJobCard, timeFromJobs } from '@shared/field-core.js';
import { applyToWeek } from '@shared/offline-queue.js';
import { addDaysIso } from '@shared/pickers-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { useOutbox } from '@/lib/use-outbox';
import { fmtDate, fmtTime, localToday } from '@/lib/dates';
import { Body, Button, Card, Problem, Screen, Title } from '@/ui';

type WeekCard = { id: string; work_date: string; clock_on: string; clock_off: string | null; job_label: string | null; activity_label: string | null; pending?: boolean };
type Entry = { card_id: string | null; work_date: string; start_time: string; end_time: string };
type Week = { period: { period_start: string; period_end: string }; cards: WeekCard[]; entries: Entry[]; days: { id: string; work_date: string; status: string; decision_note?: string | null; auto?: number }[]; flags: { kind: string; date: string | null; text: string }[] };

const STATUS: Record<string, string> = { submitted: 'Sent for approval', approved: 'Approved', rejected: 'Sent back' };
const hours = (n: number) => `${n.toFixed(2).replace(/\.?0+$/, '')}h`;

export default function Day() {
  const { state } = useSession();
  const [date, setDate] = useState(localToday());
  const today = localToday();
  const week = useRead<Week>(`/timesheets/mine?date=${date}`);
  const queued = useOutbox();
  if (state.status !== 'signedIn') return null;

  const view = (week.data ? applyToWeek(week.data, queued, planJobCard) : null) as Week | null;
  const cards = (view?.cards || []).filter(c => cardOnDate(c, date)).sort((a, b) => a.clock_on.localeCompare(b.clock_on));
  const entries = (view?.entries || []).filter(t => t.work_date === date);
  const total = entries.reduce((n, t) => n + entryHours(t), 0);
  const dayRow = view ? dayRowOf(view, date) : null;
  const mine = dayIsMine(dayRow);
  const fromJobs = timeFromJobs(state.me.employee, date);
  const flags = (view?.flags || []).filter(f => f.date === date && !(f.kind === 'missing_day' && date === today));

  return (
    <Screen>
      <Title>{date === today ? 'Today' : fmtDate(date)}</Title>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}><Button kind="plain" onPress={() => setDate(d => addDaysIso(d, -1))}>Earlier</Button></View>
        <View style={{ flex: 1 }}><Button kind="plain" onPress={() => setDate(d => addDaysIso(d, 1))} disabled={date >= today}>Later</Button></View>
      </View>
      {week.offlineAt !== null && <Body tone="muted">No signal. Showing what was saved at {fmtTime(week.offlineAt)}.</Body>}
      <Problem>{week.error}</Problem>

      {dayRow && (
        <Card>
          <Body tone={dayRow.status === 'rejected' ? 'danger' : dayRow.status === 'approved' ? 'ok' : 'fg'}>{STATUS[dayRow.status] || dayRow.status}</Body>
          {dayRow.status === 'rejected' && <Body tone="muted">{dayRow.decision_note || 'Fix it and submit it again.'}</Body>}
          {!mine && <Body tone="muted">This day can’t be changed while it is with your approver or approved.</Body>}
        </Card>
      )}

      {!view ? (week.error ? null : <Body tone="muted">Loading…</Body>)
        : fromJobs ? <Body tone="muted">Your job time for this day is recorded in AccurateJobs.</Body>
        : cards.length === 0 ? <Body tone="muted">No time on this day.</Body>
        : cards.map(c => {
          const mins = entries.filter(t => t.card_id === c.id).reduce((n, t) => n + entryHours(t), 0);
          const body = (
            <Card>
              <Body>{c.clock_on}–{c.clock_off || 'on the clock'}{c.clock_off ? ` · ${hours(mins)}` : ''}</Body>
              <Body tone="muted">{c.job_label || c.activity_label || 'No job yet'}</Body>
              {c.pending && <Body tone="muted">Saved on your phone. It’s sent when you have signal.</Body>}
            </Card>
          );
          return mine
            ? <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`${c.clock_on} to ${c.clock_off || 'now'}, ${c.job_label || c.activity_label || 'no job yet'}. Change`} onPress={() => router.push({ pathname: '/job-card', params: { id: c.id, date } })}>{body}</Pressable>
            : <View key={c.id}>{body}</View>;
        })}
      {view && cards.length > 0 && <Body>{hours(total)} on this day</Body>}
      {flags.map(f => <Body key={`${f.kind}:${f.date}`} tone="muted">{f.text}</Body>)}

      {view && mine && !fromJobs && <Button onPress={() => router.push({ pathname: '/job-card', params: { date } })}>Add time</Button>}
      {view && mine && !fromJobs && cards.some(c => c.clock_off) && <Body tone="muted">Submit your day in the Field view in your browser for now.</Body>}
    </Screen>
  );
}
