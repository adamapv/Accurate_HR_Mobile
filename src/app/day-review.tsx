// Your day, once a card on it is finished (?date=): the day's hours and cards along a bar, a long card with no lunch, any job published for you with no time
// against it, and Add time, Submit day and Done for today. Submit day sends the whole day for approval. What is said and which days can go are the web
// app's own rules (shared/field-core.js). Adding or changing time replaces this screen with the job card, which comes back here when it is saved.
import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { DAY_WORDS, dayCards, dayEntries, dayNote, dayRowOf, daysSubmittedText, daysToSend, entriesMins, noLunchCard, planJobCard, reviewTitle, scheduleGaps, submitHint } from '@shared/field-core.js';
import { applyToWeek } from '@shared/offline-queue.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { useOutbox } from '@/lib/use-outbox';
import { fmtDate } from '@/lib/dates';
import { DayCardRows, DayGaps, DayHours, DayTimeline, type DayCard, type DayEntry, type Gap } from '@/day-parts';
import { Body, Button, Card, Notice, Problem, Screen, Title } from '@/ui';

type Week = { cards: DayCard[]; entries: DayEntry[]; pending?: number; days: { id: string; work_date: string; status: string; decision_note?: string | null; auto?: number }[] };
type Note = { tone: 'info' | 'ok' | 'danger'; strong: string; text: string };

export default function DayReview() {
  const { state, api, changed } = useSession();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const week = useRead<Week>(date ? `/timesheets/mine?date=${date}` : null);
  const sched = useRead<{ rows: (Gap & { activity?: boolean })[] }>(date ? `/schedule/mine?from=${date}&to=${date}` : null);
  const queued = useOutbox();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState('');
  if (state.status !== 'signedIn' || !date) return <Redirect href="/" />;

  const view = (week.data ? applyToWeek(week.data, queued, planJobCard) : null) as Week | null;
  const cards = dayCards(view, date) as DayCard[], entries = dayEntries(view, date) as DayEntry[];
  const saving = cards.some(c => !c.clock_off);   // the clock-off is still on its way
  const note = dayNote(view ? dayRowOf(view, date) : null) as Note | null;
  const canSubmit = !!view && !saving && !(view.pending! > 0) && (daysToSend(view, date) as string[]).includes(date) && !said;
  const gaps = scheduleGaps(sched.data?.rows, date, cards) as Gap[];

  const edit = (c: DayCard) => router.replace({ pathname: '/job-card', params: { id: c.id, date: c.work_date, edit: '1' } });
  const add = (job?: Gap) => router.replace({ pathname: '/job-card', params: job ? { date, job: `${job.company_id}:${job.job_id}` } : { date } });
  // Submitting needs signal (the answer says which days went), so it does not wait in the outbox.
  const submit = async () => {
    setBusy(true); setProblem('');
    try { const text = daysSubmittedText(await api('/days/submit', { method: 'POST', body: { dates: [date] } }), fmtDate) as string; await week.reload(); changed(); setSaid(text); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy(false);
  };

  return (
    <Screen>
      <Title>{reviewTitle(date, fmtDate) as string}</Title>
      <Card>
        <DayHours label={DAY_WORDS.hours as string} mins={entriesMins(entries) as number} loading={!view && !week.error}>
          <Body tone="muted">{saving ? (DAY_WORDS.saving as string) : `${cards.length} job card${cards.length === 1 ? '' : 's'}`}</Body>
        </DayHours>
        <DayTimeline cards={cards} date={date} onOpen={edit} />
      </Card>
      <Problem>{week.error}</Problem>
      {!!view && cards.length === 0 && <Body tone="muted">{DAY_WORDS.nothing as string}</Body>}
      {cards.length > 0 && <DayCardRows cards={cards} entries={entries} onEdit={edit} />}
      {!!said && <Notice tone="ok">{said}</Notice>}
      {!said && note && <Notice tone={note.tone}>{note.strong ? <Body strong>{note.strong}</Body> : null}{note.text}</Notice>}
      <DayGaps noLunch={noLunchCard(cards) as DayCard | null} gaps={gaps} onEdit={edit} onAdd={add} />
      {!sched.data && !!sched.error && <Body tone="muted">{DAY_WORDS.noSchedule as string}</Body>}
      {canSubmit && <Body tone="muted">{submitHint(!!state.me.company.timesheet_auto_approve) as string}</Body>}
      <Problem>{problem}</Problem>

      {canSubmit && <Button icon="paper-plane-outline" onPress={() => { void submit(); }} busy={busy}>{DAY_WORDS.submit as string}</Button>}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Button kind="plain" icon="add" onPress={() => add()} disabled={busy}>{DAY_WORDS.addTime as string}</Button></View>
        <View style={{ flex: 1 }}><Button kind={canSubmit ? 'plain' : 'primary'} onPress={() => router.back()} disabled={busy}>{(canSubmit ? DAY_WORDS.notYet : DAY_WORDS.done) as string}</Button></View>
      </View>
    </Screen>
  );
}
