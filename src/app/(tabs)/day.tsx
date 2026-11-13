// The Job card tab: one day's time. The day's cards (with what is still waiting on the phone laid over them), its total, where the day stands with the approver,
// what an approver would query, Add time, Submit day and Pull back. A card opens in the job card form to change or delete while the day is still the person's own.
// Which days can go, what stands in the way and what is said before and after are the web app's own rules (shared/field-core.js).
import { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { cardOnDate, dayIsMine, dayRowOf, daysSubmittedText, daysToSend, entryHours, planJobCard, sendChecks, submitConfirm, timeFromJobs } from '@shared/field-core.js';
import { applyToWeek } from '@shared/offline-queue.js';
import { addDaysIso } from '@shared/pickers-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { useOutbox } from '@/lib/use-outbox';
import { fmtDate, fmtTime, localToday } from '@/lib/dates';
import { Body, Button, Card, Empty, Notice, Pill, Problem, Screen, Title } from '@/ui';

type WeekCard = { id: string; work_date: string; clock_on: string; clock_off: string | null; job_label: string | null; activity_label: string | null; pending?: boolean };
type Entry = { card_id: string | null; work_date: string; start_time: string; end_time: string };
type Week = { period: { period_start: string; period_end: string }; cards: WeekCard[]; entries: Entry[]; days: { id: string; work_date: string; status: string; decision_note?: string | null; auto?: number }[]; flags: { kind: string; date: string | null; text: string }[] };

const STATUS: Record<string, string> = { submitted: 'Sent for approval', approved: 'Approved', rejected: 'Sent back' };
const hours = (n: number) => `${n.toFixed(2).replace(/\.?0+$/, '')}h`;

export default function Day() {
  const { state, api, changed } = useSession();
  const [date, setDate] = useState(localToday());
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
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
  // What stands between this day and Submit: what stops it, then what an approver would query.
  const checks = (view ? sendChecks(view, today, [date], fmtDate) : []) as { key: string; block: boolean; date?: string; text: string }[];
  const blocks = checks.filter(c => c.block), queries = checks.filter(c => !c.block && c.date === date);
  const canSubmit = !!view && !fromJobs && (daysToSend(view, today) as string[]).includes(date) && blocks.length === 0;

  // Submitting and pulling back need signal (the answer says which days went), so they do not wait in the outbox.
  const run = async (fn: () => Promise<string>) => {
    setBusy(true); setSaid(null);
    try { const text = await fn(); await week.reload(); changed(); setSaid({ tone: 'ok', text }); }
    catch (e) { setSaid({ tone: 'danger', text: e instanceof Error ? e.message : 'Something went wrong. Try again.' }); }
    setBusy(false);
  };
  const submit = () => {
    const ask = submitConfirm(view, [date], !!state.me.company.timesheet_auto_approve, { fmtDate, fmtHours: (n: number) => `${n.toFixed(1)}h` });
    Alert.alert(ask.title, ask.body, [{ text: 'Cancel', style: 'cancel' }, { text: 'Submit', onPress: () => { void run(async () => daysSubmittedText(await api('/days/submit', { method: 'POST', body: { dates: [date] } }), fmtDate)); } }]);
  };
  const pullBack = () => Alert.alert('Pull this day back?', 'It leaves your manager’s approvals until you submit it again. You can change your time in the meantime.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Pull back', onPress: () => { void run(async () => { await api(`/days/${dayRow!.id}/withdraw`, { method: 'POST', body: {} }); return 'Day pulled back. Fix it and submit it again.'; }); } },
  ]);

  return (
    <Screen>
      <Title>{date === today ? 'Today' : fmtDate(date)}</Title>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}><Button kind="plain" icon="chevron-back" onPress={() => { setSaid(null); setDate(d => addDaysIso(d, -1)); }}>Earlier</Button></View>
        <View style={{ flex: 1 }}><Button kind="plain" onPress={() => { setSaid(null); setDate(d => addDaysIso(d, 1)); }} disabled={date >= today} icon="chevron-forward">Later</Button></View>
      </View>
      {week.offlineAt !== null && <Notice tone="warn" icon="cloud-offline-outline">{`No signal. Showing what was saved at ${fmtTime(week.offlineAt)}.`}</Notice>}
      <Problem>{week.error}</Problem>

      {dayRow && (
        <Card>
          <Pill tone={dayRow.status === 'rejected' ? 'danger' : dayRow.status === 'approved' ? 'ok' : dayRow.status === 'submitted' ? 'warn' : 'neutral'}>{STATUS[dayRow.status] || dayRow.status}</Pill>
          {dayRow.status === 'rejected' && <Notice tone="danger">{dayRow.decision_note || 'Fix it and submit it again.'}</Notice>}
          {!mine && <Body tone="muted">This day can’t be changed while it is with your approver or approved.</Body>}
          {dayRow.status === 'submitted' && <Button kind="plain" onPress={pullBack} disabled={busy}>Pull back</Button>}
        </Card>
      )}

      {!view ? (week.error ? null : <Body tone="muted">Loading…</Body>)
        : fromJobs ? <Body tone="muted">Your job time for this day is recorded in AccurateJobs.</Body>
        : cards.length === 0 ? <Empty icon="time-outline">No time on this day.</Empty>
        : cards.map(c => {
          const mins = entries.filter(t => t.card_id === c.id).reduce((n, t) => n + entryHours(t), 0);
          const body = (
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <Body strong>{c.clock_on}–{c.clock_off || 'on the clock'}</Body>
                {c.clock_off ? <Pill tone="info">{hours(mins)}</Pill> : <Pill tone="ok">On the clock</Pill>}
              </View>
              <Body tone="muted">{c.job_label || c.activity_label || 'No job yet'}</Body>
              {c.pending && <Notice tone="info" icon="cloud-upload-outline">Saved on your phone. It’s sent when you have signal.</Notice>}
            </Card>
          );
          return mine
            ? <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`${c.clock_on} to ${c.clock_off || 'now'}, ${c.job_label || c.activity_label || 'no job yet'}. Change`} onPress={() => router.push({ pathname: '/job-card', params: { id: c.id, date } })}>{body}</Pressable>
            : <View key={c.id}>{body}</View>;
        })}
      {view && cards.length > 0 && <Body strong>{hours(total)} on this day</Body>}
      {mine && blocks.map(c => <Notice key={c.key} tone="danger">{c.text}</Notice>)}
      {mine && queries.map(c => <Body key={c.key} tone="muted">{c.text}</Body>)}
      {said && <Notice tone={said.tone}>{said.text}</Notice>}

      {view && mine && !fromJobs && <Button kind={canSubmit ? 'plain' : 'primary'} onPress={() => router.push({ pathname: '/job-card', params: { date } })} disabled={busy} icon="add-circle-outline">Add time</Button>}
      {canSubmit && <Button icon="paper-plane-outline" onPress={submit} busy={busy}>Submit day</Button>}
    </Screen>
  );
}
