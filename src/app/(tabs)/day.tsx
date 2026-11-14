// The Job card tab: one day's time. The day's cards (with what is still waiting on the phone laid over them), its total, where the day stands with the approver,
// what an approver would query, Add time, Submit day and Pull back. A card opens in the job card form to change or delete while the day is still the person's own.
// Which days can go, what stands in the way and what is said before and after are the web app's own rules (shared/field-core.js).
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DAY_WORDS, dayCards, dayEntries, dayIsMine, dayLongOf, dayRowOf, dayStatus, daysSubmittedText, daysToSend, entriesMins, noLunchCard, planJobCard, scheduleGaps, sendChecks, submitConfirm, timeFromJobs } from '@shared/field-core.js';
import { applyToOpenCard, applyToWeek } from '@shared/offline-queue.js';
import { addDaysIso } from '@shared/pickers-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { useOutbox } from '@/lib/use-outbox';
import { fmtDate, fmtTime, localToday, parseDay } from '@/lib/dates';
import { useTheme } from '@/theme';
import { Dots } from '@/dots';
import { WhenField } from '@/pickers';
import { DayCardRows, DayGaps, DayHours, DayTimeline, type DayCard, type DayEntry, type Gap } from '@/day-parts';
import { Body, Button, Card, Empty, Hero, Notice, Pill, Problem, Screen, Title, Touch, type Tone } from '@/ui';

type Week = { period: { period_start: string; period_end: string }; cards: DayCard[]; entries: DayEntry[]; pending?: number; days: { id: string; work_date: string; status: string; decision_note?: string | null; auto?: number }[]; flags: { kind: string; date: string | null; text: string }[] };
type OpenCard = { card: (DayCard & { activity_id?: string | null }) | null };
const longDate = (iso: string) => parseDay(iso).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
const PILL: Record<string, Tone> = { approved: 'ok', submitted: 'info', rejected: 'danger', 'on the clock': 'ok', open: 'warn' };

export default function Day() {
  const { state, api, changed } = useSession();
  const [date, setDate] = useState(localToday());
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const today = localToday();
  const week = useRead<Week>(`/timesheets/mine?date=${date}`);
  const sched = useRead<{ rows: (Gap & { activity?: boolean })[] }>(`/schedule/mine?from=${date}&to=${date}`);
  const open = useRead<OpenCard>('/job-cards/open');
  const t = useTheme();
  const queued = useOutbox();
  if (state.status !== 'signedIn') return null;

  const view = (week.data ? applyToWeek(week.data, queued, planJobCard) : null) as Week | null;
  const cards = dayCards(view, date) as DayCard[], entries = dayEntries(view, date) as DayEntry[];
  const stillOn = cards.some(c => !c.clock_off);
  // The open card, with what is still waiting on the phone laid over it: on today it leads the screen.
  const card = date === today ? (applyToOpenCard(open.data?.card ?? null, queued).card as OpenCard['card']) : null;
  const dayRow = view ? dayRowOf(view, date) : null;
  const mine = dayIsMine(dayRow);
  const fromJobs = timeFromJobs(state.me.employee, date);
  // What stands between this day and Submit: what stops it, then what an approver would query.
  const checks = (view ? sendChecks(view, today, [date], fmtDate) : []) as { key: string; block: boolean; date?: string; text: string }[];
  const blocks = checks.filter(c => c.block), queries = checks.filter(c => !c.block && c.date === date);
  const canSubmit = !!view && !fromJobs && !stillOn && !(view.pending! > 0) && (daysToSend(view, today) as string[]).includes(date) && blocks.length === 0;
  const stands = dayStatus(dayRow, stillOn, cards.length) as { status: string; label: string } | null;
  const gaps = mine && !fromJobs ? (scheduleGaps(sched.data?.rows, date, cards) as Gap[]) : [];
  const edit = (c: DayCard) => router.push({ pathname: '/job-card', params: { id: c.id, date: c.work_date, edit: '1', quiet: '1' } });
  const add = (g?: Gap) => router.push({ pathname: '/job-card', params: g ? { date, job: `${g.company_id}:${g.job_id}`, quiet: '1' } : { date, quiet: '1' } });
  const go = (d: string) => { if (d <= today) { setSaid(null); setDate(d); } };

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
      <Title>{dayLongOf(date, today, longDate) as string}</Title>
      {/* The day: back and forward a day at a time, or the date box; never a day to come. */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
        <Touch accessibilityRole="button" accessibilityLabel="The day before" onPress={() => go(addDaysIso(date, -1) as string)} style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={22} color={t.fg} />
        </Touch>
        <View style={{ flex: 1 }}><WhenField label="Day" mode="date" value={date} maxDate={today} onChange={go} /></View>
        <Touch accessibilityRole="button" accessibilityLabel="The day after" disabled={date >= today} onPress={() => go(addDaysIso(date, 1) as string)} style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center', opacity: date >= today ? 0.4 : 1 }}>
          <Ionicons name="chevron-forward" size={22} color={t.fg} />
        </Touch>
      </View>
      {week.offlineAt !== null && <Notice tone="warn" icon="cloud-offline-outline">{`No signal. Showing what was saved at ${fmtTime(week.offlineAt)}.`}</Notice>}
      <Problem>{week.error}</Problem>

      {fromJobs ? <Card><Body strong>Your time comes from AccurateJobs</Body><Body tone="muted">Add your job cards there and submit them each day. Approved hours show up here.</Body></Card>
        : card ? (
          <Hero tone="ok">
            <Pill tone="ok">{card.work_date === today ? 'On the clock since' : `Still clocked on from ${fmtDate(card.work_date)}`}</Pill>
            <Dots text={card.clock_on} size={44} color="#FFFFFF" />
            <Body tone="muted">{card.job_label || card.activity_label || 'No job picked yet'}</Body>
            <Button icon="stop-circle-outline" onPress={() => router.push({ pathname: '/job-card', params: { id: card.id } })}>Clock off</Button>
            <Button kind="plain" icon="swap-horizontal-outline" onPress={() => router.push({ pathname: '/job-card', params: { id: card.id, edit: '1' } })}>{card.job_id || card.activity_label ? 'Change job' : 'Pick job'}</Button>
          </Hero>
        ) : mine && view ? (
          <Card>
            <Body strong>{date === today ? 'Add time to today' : `Add time to ${fmtDate(date)}`}</Body>
            <Body tone="muted">A job with its cost centre, or an activity such as a toolbox talk or training.</Body>
            <Button icon="add-circle-outline" onPress={() => add()} disabled={busy}>{DAY_WORDS.addTime as string}</Button>
          </Card>
        ) : null}

      <Card>
        <DayHours label="Hours" mins={entriesMins(entries) as number} loading={!view && !week.error}>
          {stands && <Pill tone={PILL[stands.status] || 'neutral'}>{stands.label}</Pill>}
          <Body tone="muted">{`${cards.length} job card${cards.length === 1 ? '' : 's'}`}</Body>
        </DayHours>
        <DayTimeline cards={cards} date={date} onOpen={mine && !fromJobs ? edit : undefined} />
        {dayRow?.status === 'rejected' && <Notice tone="danger"><Body strong>Sent back: </Body>{dayRow.decision_note || 'fix it and submit it again'}</Notice>}
        {dayRow && !mine && <Body tone="muted">This day can’t be changed while it is with your approver or approved.</Body>}
        {dayRow?.status === 'submitted' && <Button kind="plain" icon="arrow-undo-outline" onPress={pullBack} disabled={busy}>Pull back</Button>}
      </Card>

      {!!view && cards.length === 0 && <Empty icon="time-outline">{fromJobs ? 'Approved AccurateJobs job cards for this day show here.' : 'Nothing logged yet. Add time above, or clock on from Home.'}</Empty>}
      {cards.length > 0 && <DayCardRows cards={cards} entries={entries} onEdit={mine && !fromJobs ? edit : undefined} />}
      {mine && !fromJobs && <DayGaps noLunch={noLunchCard(cards) as DayCard | null} gaps={gaps} onEdit={edit} onAdd={add} />}
      {mine && blocks.map(c => <Notice key={c.key} tone="danger">{c.text}</Notice>)}
      {mine && queries.map(c => <Body key={c.key} tone="muted">{c.text}</Body>)}
      {said && <Notice tone={said.tone}>{said.text}</Notice>}
      {canSubmit && <Button icon="paper-plane-outline" onPress={submit} busy={busy}>Submit day</Button>}
    </Screen>
  );
}
