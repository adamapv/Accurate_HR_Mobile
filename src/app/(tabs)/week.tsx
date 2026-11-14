// My week: a pay period's time day by day, where each day stands with the approver, the week's safety counts and leave balances, Copy last week, and Submit.
// How the week is grouped, named and worded, which days can go and what stands in the way are the web app's own rules (shared/field-core.js). Time itself is logged
// on Home and the Job card tab; a card here opens in the job card form.
import { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { can } from '@shared/access.js';
import { cardNotes, copyWeekPlan, hoursByRate, LEAVE_BALANCES_SHOWN, copyWeekSaid, dayIsMine, dayRowOf, daysSubmittedText, daysToSend, entryHours, nothingToSubmit, periodLabel, planJobCard, sendChecks, sentBackText, submitHelp, submitLabel,
  timeFromJobs, weekByDay, weekPillLabel, weekState } from '@shared/field-core.js';
import { applyToWeek } from '@shared/offline-queue.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { useOutbox } from '@/lib/use-outbox';
import { fmtDate, fmtTime, localToday, parseDay } from '@/lib/dates';
import { ChooseField } from '@/pickers';
import { WeekHoursCard } from '@/week-parts';
import { Body, Button, Card, Field, Figures, List, Notice, Pill, Problem, Row, Screen, Title, type Figure } from '@/ui';

type Period = { id: string; period_start: string; period_end: string; label: string | null };
type WeekCard = { id: string; work_date: string; clock_on: string; clock_off: string | null; job_label: string | null; activity_label: string | null; notes: string | null; lunch?: number | boolean; carry_in?: boolean; pending?: boolean; splits?: unknown[] };
type Entry = { id: string; card_id: string | null; work_date: string; start_time: string; end_time: string; job_label?: string | null; cost_centre_label?: string | null; activity_label?: string | null; notes?: string | null };
type DayRow = { id: string; work_date: string; status: string; decision_note?: string | null; auto?: number };
type Week = { rate_summary?: { rate_id?: string; rate_name?: string; hours: number }[]; rate_profile?: { name: string } | null; period: Period | null; cards: WeekCard[]; entries: Entry[]; days: DayRow[]; flags: unknown[]; total_hours: number; pending?: number };
type Check = { key: string; block: boolean; kind?: string; date?: string; text: string };

const hours = (n: number) => `${Number(n || 0).toFixed(1)}h`;
const dayName = (iso: string) => parseDay(iso).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' });
const STATUS: Record<string, string> = { submitted: 'Sent for approval', approved: 'Approved', rejected: 'Sent back' };

export default function WeekTab() {
  const { state, api, changed } = useSession();
  const today = localToday();
  const [periodId, setPeriodId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const ts = useRead<Week>(`/timesheets/mine?${periodId ? `period_id=${periodId}&` : ''}date=${today}`);
  // Opening this week can create its pay period, so the list is read once the week has answered.
  const periods = useRead<{ rows: Period[] }>(ts.data ? '/timesheet-periods' : null);
  const queued = useOutbox();
  const data = (ts.data ? applyToWeek(ts.data, queued, planJobCard) : null) as Week | null;
  useEffect(() => { if (!periodId && data?.period) setPeriodId(data.period.id); }, [periodId, data?.period?.id]);
  const access = state.status === 'signedIn' ? state.me.access : {};
  const canSafety = can(access, 'job_safety'), canLeave = can(access, 'leave');
  const counts = useRead<{ swms_signed: number; checklists_done: number; checklists_not_ok: number }>(canSafety && data?.period ? `/job-safety/my-week?from=${data.period.period_start}&to=${data.period.period_end}` : null);
  if (state.status !== 'signedIn') return null;
  const me = state.me;

  if (!data) return <Screen><Title>My week</Title>{ts.error ? <Problem>{ts.error}</Problem> : <Body tone="muted">Loading…</Body>}</Screen>;
  if (!data.period) return <Screen><Title>My week</Title><Body tone="muted">This week’s pay period couldn’t be opened. Try again, or ask your admin.</Body></Screen>;
  const period = data.period;

  // A week wholly in the AccurateJobs era is not logged or sent from here.
  const fromJobs = timeFromJobs(me.employee, period.period_start) as boolean, canEdit = !fromJobs;
  const pending = data.pending || 0;
  const wk = weekState(data) as { status: string | null; submitted: number; unsent: number };
  const { days, byDay, cardEntries } = weekByDay(data) as { days: string[]; byDay: Record<string, { cards: WeekCard[]; entries: Entry[] }>; cardEntries: Record<string, Entry[]> };
  const sendable = (canEdit ? daysToSend(data, today) : []) as string[];
  const checks = (canEdit ? sendChecks(data, today, sendable, fmtDate) : []) as Check[];
  const help = submitHelp(!!me.company.timesheet_auto_approve) as { title: string; text: string; noteLabel: string };
  const back = sentBackText(data, fmtDate) as string;
  const defaultDate = today >= period.period_start && today <= period.period_end ? today : period.period_start;
  const balances = (me as unknown as { balances?: { id: string; balance_hours: number; type_name: string }[] }).balances || [];

  // Submitting, pulling back and copying need signal: each answer says what happened.
  const run = async (fn: () => Promise<{ tone: 'ok' | 'danger'; text: string }>) => {
    setBusy(true); setSaid(null);
    try { const told = await fn(); await ts.reload(); changed(); setSaid(told); }
    catch (e) { setSaid({ tone: 'danger', text: e instanceof Error ? e.message : 'Something went wrong. Try again.' }); }
    setBusy(false);
  };
  const submit = (dates: string[]) => run(async () => { const r = await api('/days/submit', { method: 'POST', body: { dates, note } }); setNote(''); return { tone: 'ok', text: daysSubmittedText(r, fmtDate) as string }; });
  const pullBack = (rows: DayRow[]) => Alert.alert(rows.length === 1 ? 'Pull this day back?' : `Pull ${rows.length} days back?`, 'They leave your manager’s approvals until you submit them again. You can change your time in the meantime.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Pull back', onPress: () => { void run(async () => { for (const d of rows) await api(`/days/${d.id}/withdraw`, { method: 'POST', body: {} }); return { tone: 'ok', text: rows.length === 1 ? 'Day pulled back. Fix it and submit it again.' : 'Days pulled back. Fix them and submit them again.' }; }); } },
  ]);
  const copyLastWeek = () => Alert.alert('Copy last week’s time into this week?', 'Each day’s cards are copied to the same weekday. Days that clash with time you’ve already logged are skipped.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Copy', onPress: () => { void run(async () => {
      const results: unknown[] = [];
      for (const { from, to } of copyWeekPlan(period, today) as { from: string; to: string }[]) {
        try { results.push({ to, ...(await api('/job-cards/copy', { method: 'POST', body: { from_date: from, to_date: to } })) }); }
        catch (e) { results.push({ to, error: e instanceof Error ? e.message.charAt(0).toLowerCase() + e.message.slice(1) : 'could not be copied' }); }
      }
      const told = copyWeekSaid(results, fmtDate) as { text: string; tone: 'ok' | 'danger' };
      return { tone: told.tone, text: told.text };
    }); } },
  ]);

  return (
    <Screen>
      <Title>My week</Title>
      <Body tone="muted">{fmtDate(period.period_start)} – {fmtDate(period.period_end)}{wk.status ? ` · ${weekPillLabel(wk) || STATUS[wk.status] || wk.status}` : ''}</Body>
      {(periods.data?.rows.length || 0) > 1 && (
        <ChooseField<Period> label="Pay period" placeholder="Choose the week" value={periodLabel(period, fmtDate) as string}
          options={(periods.data?.rows || []).map(p => ({ key: p.id, title: periodLabel(p, fmtDate) as string, item: p }))} onChoose={p => { setSaid(null); setPeriodId(p.id); }} />
      )}
      {ts.offlineAt !== null && <Notice tone="warn" icon="cloud-offline-outline">{`No signal. Showing what was saved at ${fmtTime(ts.offlineAt)}.`}</Notice>}
      <Problem>{ts.error}</Problem>

      <WeekHoursCard week={data} expected={Number(me.employee.expected_weekly_hours) || 38} fromJobs={fromJobs} today={today} />
      {(() => {
        const by = hoursByRate(data) as { several: boolean; rows: { key: string; label: string; hours: string }[]; note: string };
        return by.several ? (
          <Card>
            <Body strong>Hours by rate</Body>
            <Figures figures={by.rows.map(r => ({ key: r.key, label: r.label, value: r.hours })) as Figure[]} />
            <Body tone="muted">{by.note}</Body>
          </Card>
        ) : null;
      })()}
      <Figures figures={[
        { key: 'total', label: 'Job cards', value: data.cards.filter(c => !c.carry_in).length, sub: `${days.length} ${days.length === 1 ? 'day' : 'days'} worked` },
        ...(canLeave && balances.length ? balances.slice(0, LEAVE_BALANCES_SHOWN as number).map(b => ({ key: `leave-${b.id}`, label: b.type_name, value: hours(b.balance_hours), sub: 'Leave balance' })) : []),
        ...(canSafety ? [{ key: 'swms', label: 'SWMS signed on', value: counts.data ? counts.data.swms_signed : '—' },
          { key: 'checks', label: 'Checklists done', value: counts.data ? counts.data.checklists_done : '—', tone: counts.data && counts.data.checklists_not_ok > 0 ? 'danger' as const : undefined,
            sub: counts.data && counts.data.checklists_not_ok > 0 ? `${counts.data.checklists_not_ok} not OK` : undefined }] : []),
      ] as Figure[]} />
      {canLeave && (
        <List>
          <Row icon="calendar-outline" tint="amber" title="My leave" sub="Your balances and requests" onPress={() => router.push('/leave')} last />
        </List>
      )}

      {canEdit && (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}><Button kind="plain" onPress={copyLastWeek} disabled={busy}>Copy last week</Button></View>
          <View style={{ flex: 1 }}><Button kind="plain" onPress={() => router.push({ pathname: '/job-card', params: { date: defaultDate, quiet: '1' } })} disabled={busy}>Add time</Button></View>
        </View>
      )}
      {said && <Notice tone={said.tone}>{said.text}</Notice>}

      {days.length === 0 ? <Body tone="muted">{canEdit ? 'Nothing logged this week yet. Add time on the Job card tab.' : fromJobs ? 'Approved AccurateJobs job cards for this week show here.' : 'No time logged in this period.'}</Body>
        : days.map(d => {
          const row = dayRowOf(data, d) as DayRow | null, mine = dayIsMine(row) as boolean;
          return (
            <Card key={d}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Body strong>{dayName(d)}{d === today ? ' · today' : ''}</Body>
                {row && <Pill tone={row.status === 'rejected' ? 'danger' : row.status === 'approved' ? 'ok' : row.status === 'submitted' ? 'warn' : 'neutral'}>{row.status === 'approved' && row.auto ? 'Approved automatically' : STATUS[row.status] || row.status}</Pill>}
              </View>
              {row?.status === 'rejected' && <Notice tone="danger">{`Sent back: ${row.decision_note || 'fix it and submit it again'}`}</Notice>}
              {byDay[d].cards.map(c => {
                const blocks = cardEntries[c.id] || [], total = blocks.reduce((n, t) => n + (entryHours(t) as number), 0);
                const body = (
                  <View style={{ gap: 2, paddingVertical: 6 }}>
                    <Body strong>{c.clock_off ? `${c.clock_on}–${c.clock_off}` : `${c.clock_on}–…`} {c.job_label || c.activity_label || 'No job yet'}{c.clock_off ? ` · ${hours(total)}` : ' · on the clock'}</Body>
                    {(cardNotes(c, fmtDate) as string[]).length > 0 && <Body tone="muted">{(cardNotes(c, fmtDate) as string[]).join(' · ')}</Body>}
                    {blocks.map(t => <Body key={t.id} tone="muted">{t.start_time}–{t.end_time} {t.cost_centre_label || (t.activity_label ? 'Activity' : '')} · {hours(entryHours(t) as number)}</Body>)}
                    {!!c.notes && <Body tone="muted">{c.notes}</Body>}
                    {c.pending && <Body tone="muted">Saved on your phone. It’s sent when you have signal.</Body>}
                  </View>
                );
                return canEdit && mine
                  ? <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`${c.clock_on} to ${c.clock_off || 'now'}, ${c.job_label || c.activity_label || 'no job yet'}. Change`} onPress={() => router.push({ pathname: '/job-card', params: { id: c.id, date: c.work_date, quiet: '1' } })}>{body}</Pressable>
                  : <View key={c.id}>{body}</View>;
              })}
              {byDay[d].entries.map(t => <Body key={t.id} tone="muted">{t.start_time}–{t.end_time} {t.job_label || ''} {t.cost_centre_label || ''} · {hours(entryHours(t) as number)}</Body>)}
              {canEdit && sendable.includes(d) && <Button icon="paper-plane-outline" onPress={() => { void submit([d]); }} disabled={busy || pending > 0}>Submit day</Button>}
              {canEdit && row?.status === 'submitted' && <Button kind="plain" onPress={() => pullBack([row])} disabled={busy}>Pull back</Button>}
            </Card>
          );
        })}

      {canEdit && (
        <Card>
          <Body strong>{help.title}</Body>
          <Body tone="muted">{help.text}</Body>
          {!!back && <Notice tone="danger">{back}</Notice>}
          {checks.map(c => c.block ? <Notice key={c.key} tone="danger">{c.text}</Notice> : <Body key={c.key} tone="muted">{c.text}</Body>)}
          {sendable.length === 0 ? <Body tone="muted">{nothingToSubmit(wk) as string}</Body> : (
            <>
              <Field label={help.noteLabel} value={note} onChangeText={setNote} multiline />
              <Button onPress={() => { void submit(sendable); }} busy={busy} disabled={pending > 0}>{submitLabel(sendable, fmtDate) as string}</Button>
            </>
          )}
        </Card>
      )}
    </Screen>
  );
}
