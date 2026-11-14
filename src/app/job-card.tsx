// The job card: clocking off the open card or changing a finished one (?id=<card id>, with ?date= for a finished one), or adding time by hand (no id),
// on a job or on an activity (training, a toolbox talk, a public holiday, an RDO). The date, start, finish and lunch, the job, and how the time is shared
// between its cost centres. Every rule is the web form's own (shared/field-core.js): what a new card opens with, what is refused before it is sent, how the shares
// move, and what is sent. It is saved through the outbox, so it works with no signal.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { can } from '@shared/access.js';
import { activityAsksFirst, activityGroups, cardDefaults, cardDraft, cardProblem, costCentreOptions, dayIsMine, dayOffActivity, dayRowOf, dayOffBanner, dropSplits, findJob, goesToText, hoursToPct, pctToHours, shareName, SPLIT_WORDS, splitIsWhole, splitTotalText, hmMins, insertSplit, jobKeyOf, lastCardFill, lastCardLine, lunchHint, LUNCH_LABEL, NOTES_HINT, OFFLINE_CARD,
  onlyCostCentre, openCardHint, pastMidnightHint, planJobCard, rememberedCostCentre, runsPastMidnight, setSplitPct, soleScheduledJob, splitEvenly, usedLastHint, useLastLabel } from '@shared/field-core.js';
import { applyToOpenCard, applyToWeek } from '@shared/offline-queue.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { useOutbox } from '@/lib/use-outbox';
import type { Draft } from '@/lib/offline-core';
import { fmtDate, fmtMins, localNowHM, localToday } from '@/lib/dates';
import { isOnline } from '@/lib/offline';
import { useCostCentreStars } from '@/lib/use-stars';
import { useTheme } from '@/theme';
import { Dots } from '@/dots';
import { CostCentreField, JobField, type PickJob } from '@/job-pick';
import { take } from '@/lib/handoff';
import { ChooseField, WhenField, type Option } from '@/pickers';
import { Choice, Toggle, Body, Button, Card, Field, Loading, Notice, Pill, Problem, Screen, Title } from '@/ui';

type Job = PickJob;
type Split = { job_id: string; company_id: string; section_id: string; cost_centre_id: string; pct: number };
type Row = Split & { key: number; remembered?: boolean };
type CardRow = { id: string; work_date: string; clock_on: string; clock_off: string | null; lunch: number | boolean | null; job_id: string | null; company_id: string | null; job_label: string | null;
  splits: Split[] | null; notes: string | null; activity_id: string | null; activity_label: string | null; source: string | null; updated_at?: string; prefill_off?: string };
// What Start hands over (shared/job-checks.js startStep): a clock-on to a job whose cost centre has to be chosen, or the open card moved onto another job.
type StartInit = { kind?: 'clock-on'; id?: string; work_date: string; clock_on: string; company_id: string; job_id: string; splits: Split[] } & Partial<CardRow>;
type Open = { card: CardRow | null; last_card: (CardRow & { splits: Split[] | null }) | null; night: { rest_hours: number; window: { start: string; end: string } } | null };
type Week = { period: { period_start: string; period_end: string }; days?: { work_date: string; status: string }[]; cards: CardRow[]; entries: { card_id: string | null; work_date: string; start_time: string; end_time: string }[]; holidays?: { date: string; name: string }[]; rdos?: { date: string; name: string }[] };
type Ref = { company_id: string; job_id: string; work_date?: string };
type Banner = { strong: string; rest: string; button: string };
type Activity = { id: string; name: string; needs_approval?: number | boolean; ask_first?: number | boolean; day_off?: string | null; leave_type_id?: string | null };

let nextKey = 0;
const blank = (over: Partial<Row> = {}): Row => ({ key: ++nextKey, job_id: '', company_id: '', section_id: '', cost_centre_id: '', pct: 100, ...over });

export default function JobCardScreen() {
  const { state } = useSession();
  const { id, date, init, edit, job, quiet } = useLocalSearchParams<{ id?: string; date?: string; init?: string; edit?: string; job?: string; quiet?: string }>();
  const review = !quiet;   // a finished card shows the day afterwards, unless the screen that opened it shows the day itself (?quiet=1)
  const open = useRead<Open>('/job-cards/open');
  // A finished card is found in its day's week (the Job card tab passes the date).
  const week = useRead<Week>(id && date ? `/timesheets/mine?date=${date}` : null);
  const queued = useOutbox();
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (open.data === undefined) return open.error ? <Screen centered><Problem>{open.error}</Problem><Button kind="plain" onPress={() => router.back()}>Back</Button></Screen> : <Loading />;
  // From Start: clock on to a job (no card yet), or the open card with another job put on it.
  const started = take<StartInit>(init);
  if (started && !started.id) return <Form key={`start:${init}`} card={null} start={started} open={open.data} review={review} />;
  if (started) return <Form key={`switch:${init}`} card={started as CardRow} open={open.data} review={review} />;
  if (!id) return <Form key={`new:${date || ''}:${job || ''}`} card={null} open={open.data} date={date} preJob={job} review={review} />;
  // The open card as the phone sees it, with what is still waiting laid over it; else one of the day's cards the same way.
  const live = applyToOpenCard(open.data.card, queued).card as CardRow | null;
  let card = live && live.id === id ? live : null;
  if (!card && date) {
    if (week.data === undefined) return week.error ? <Screen centered><Problem>{week.error}</Problem><Button kind="plain" onPress={() => router.back()}>Back</Button></Screen> : <Loading />;
    card = ((applyToWeek(week.data, queued, planJobCard) as Week).cards || []).find(c => c.id === id) || null;
  }
  if (!card) return <Redirect href="/" />;   // it was clocked off or deleted somewhere else
  // Opened to change the job or the notes while still on the clock (?edit=1): the clock off stays empty, as it does on the web.
  return <Form key={id} card={edit && !card.clock_off ? { ...card, prefill_off: '' } : card} open={open.data} review={review} />;
}

// `preJob` ("company:job") is a job to open a new card on: a job published for the day with no time against it.
function Form({ card, open, date, start, preJob, review }: { card: CardRow | null; open: Open; date?: string; start?: StartInit; preJob?: string; review?: boolean }) {
  const { state, offline, changed } = useSession();
  const isNew = !card;
  const finished = !!card?.clock_off;                 // a finished card being changed, not a clock-off
  const byHand = (isNew && !start) || card?.source === 'manual';  // a start and finish typed in, which go in quarter hours
  const stillOn = (!!card && !card.clock_off) || !!start;          // an open card may be saved without a clock off
  const jobsRead = useRead<{ rows: Job[] }>('/jobs');
  const recent = useRead<{ rows: Ref[]; cost_centres: { company_id: string; job_id: string; section_id: string; cost_centre_id: string }[] }>('/job-cards/recent');
  const t = useTheme();
  const d0 = useMemo(() => (isNew && !start ? cardDefaults(open.last_card) : null), [isNew, start, open.last_card]);
  const [form, setForm] = useState({
    work_date: card?.work_date || start?.work_date || date || localToday(),
    clock_on: card?.clock_on || start?.clock_on || d0?.clock_on || '',
    clock_off: card ? card.clock_off ?? card.prefill_off ?? localNowHM() : start ? '' : d0?.clock_off || '',
    lunch: card?.lunch != null ? !!card.lunch : !!d0?.lunch,
    activity_id: card?.activity_id || '', notes: card?.notes || '',
  });
  const [onActivity, setOnActivity] = useState(!!card?.activity_id);
  const activitiesRead = useRead<{ rows: Activity[] }>('/activities');
  const [rows, setRows] = useState<Row[]>(() => (card?.splits?.length ? card.splits : start?.splits?.length ? start.splits : [{ pct: 100 } as Split])
    .map(s => blank({ ...s, job_id: s.job_id ?? card?.job_id ?? '', company_id: (s.job_id ?? card?.job_id) ? s.company_id || card?.company_id || '' : '' })));
  const week = useRead<Week>(`/timesheets/mine?date=${form.work_date}`);
  const [inHours, setInHours] = useState(false);   // the shares are typed as hours, not percent
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [from, setFrom] = useState<string | null>(d0?.from || null);   // the day the times came from, if any
  const ccStars = useCostCentreStars(setProblem);
  // The day's published jobs: offered over the job box, and a day with exactly one picks it.
  const sched = useRead<{ rows: Ref[] }>(`/schedule/mine?from=${form.work_date}&to=${form.work_date}`);
  const scheduled = (sched.data?.rows || []).filter(r => r.work_date === form.work_date && r.job_id);

  // A job closed since the card was made stays on it.
  const jobs = useMemo(() => {
    const list = jobsRead.data?.rows || [];
    const extra: Job[] = [];
    for (const r of rows) if (r.job_id && !findJob(list, r.company_id, r.job_id) && !extra.some(j => j.id === r.job_id && j.company_id === r.company_id))
      extra.push({ company_id: r.company_id, id: r.job_id, name: String(card?.job_label || '').replace(/^.*?#\d+\s*/, ''), sections: [], closed: true });
    return extra.length ? [...extra, ...list] : list;
  }, [jobsRead.data, rows, card?.job_label]);
  const jobOf = (r: Row) => findJob(jobs, r.company_id, r.job_id) as Job | undefined;
  const lastCc = recent.data?.cost_centres;

  // Choosing a job sets its cost centre when it has only one, else the one used last time on it.
  const pickJob = (key: number, j: Job) => setRows(rs => rs.map(r => {
    if (r.key !== key) return r;
    const only = onlyCostCentre(j), last = only ? null : rememberedCostCentre(j, lastCc), pick = only || last;
    return { ...r, job_id: j.id, company_id: j.company_id, section_id: pick?.section_id || '', cost_centre_id: pick?.cost_centre_id || '', remembered: !!last };
  }));
  // The memory can arrive after a job was chosen: fill the gap once it has.
  const filled = useRef(false);
  useEffect(() => {
    if (!lastCc?.length || filled.current) return;
    filled.current = true;
    setRows(rs => rs.map(r => {
      if (!r.job_id || r.cost_centre_id || rs.filter(x => x.job_id === r.job_id && x.company_id === r.company_id).length > 1) return r;
      const last = rememberedCostCentre(jobOf(r), lastCc);
      return last ? { ...r, ...last, remembered: true } : r;
    }));
  }, [lastCc]);

  // A card with no job yet on a day with one job published for the person: that job, picked (once a day; clearing it stands).
  const autoPicked = useRef('');
  useEffect(() => {
    if (!preJob || !jobsRead.data || autoPicked.current) return;
    const j = jobs.find(x => jobKeyOf(x) === preJob);
    autoPicked.current = form.work_date;
    if (j && !rows.some(r => r.job_id)) pickJob(rows[0].key, j);
  }, [preJob, jobsRead.data]);
  useEffect(() => {
    if (preJob || onActivity || !sched.data || !jobsRead.data || rows.some(r => r.job_id) || autoPicked.current === form.work_date) return;
    const j = soleScheduledJob(sched.data.rows, form.work_date, jobs) as Job | null;
    if (!j) return;
    autoPicked.current = form.work_date;
    pickJob(rows[0].key, j);
  }, [onActivity, form.work_date, sched.data, jobsRead.data]);
  // "Use <day>'s times": the last card's times, lunch, and job or activity, on the date already chosen.
  const lastCard = isNew && !start ? open.last_card : null;
  const fillFromLast = () => {
    const fill = lastCardFill(lastCard, jobs) as { kind: string; clock_on: string; clock_off: string; lunch: boolean; activity_id: string; from: string; splits: Split[] };
    setOnActivity(fill.kind === 'activity');
    setForm(f => ({ ...f, clock_on: fill.clock_on, clock_off: fill.clock_off, lunch: fill.lunch, activity_id: fill.activity_id }));
    setFrom(fill.from);
    if (fill.splits.length) setRows(fill.splits.map(sp => blank(sp)));
  };

  // The Activity box: what can be logged as time, then what is asked for as leave instead (the web form's own rule).
  const activities = activitiesRead.data?.rows || [];
  const holiday = (week.data?.holidays || []).find(x => x.date === form.work_date) || null, rdoDay = (week.data?.rdos || []).find(x => x.date === form.work_date) || null;
  const picked = activities.find(a => a.id === form.activity_id);
  const activityName = picked?.name || card?.activity_label || null;
  const askFirst = onActivity && !!picked && activityAsksFirst(picked, rdoDay);
  const activityOptions: Option<string>[] = (activityGroups(activities, { chosenId: form.activity_id, chosenName: activityName, holiday, rdoDay }) as { key: string; rows: { key: string; title: string }[] }[])
    .flatMap(g => g.rows.map(r => ({ key: `${g.key}:${r.key}`, title: r.title, detail: g.key === 'ask' ? 'Needs approval. Request it as leave.' : undefined, item: r.key })));

  const plan = planJobCard(form.clock_on, form.clock_off, form.lunch, onActivity ? [{ pct: 100 }] : rows);
  // The minutes each row really lays out as (what goes to simPRO), not the unrounded share.
  const rowMins = (i: number) => (plan.blocks as { split: number; start: string; end: string }[]).filter(b => b.split === i).reduce((n, b) => n + hmMins(b.end) - hmMins(b.start), 0);
  const dayMins = form.clock_on && form.clock_off && form.clock_off !== form.clock_on ? (hmMins(form.clock_off) - hmMins(form.clock_on) + 1440) % 1440 : 0;   // lunch included
  // A public holiday or an RDO says so, with one tap to log the day as it.
  const banner = (kind: 'holiday' | 'rdo') => dayOffBanner(kind, kind === 'holiday' ? holiday : rdoDay, dayOffActivity(activities, kind), onActivity ? form.activity_id : '') as Banner;
  const logDayOff = (kind: 'holiday' | 'rdo') => { const a = dayOffActivity(activities, kind) as Activity | null; if (!a) return; setOnActivity(true); setForm(f => ({ ...f, activity_id: a.id })); };
  const companies = state.status === 'signedIn' ? ((state.me as { companies?: { id: string; name: string }[] }).companies || []) : [];

  const save = async () => {
    const bad = cardProblem({ form, rows, onActivity, night: open.night, dayEntries: week.data?.entries || [], cardId: card?.id, needsApproval: askFirst ? picked!.name : null });
    if (bad) return setProblem(bad);
    setBusy(true); setProblem('');
    const { draft, done } = cardDraft({ card: card || start || {}, form, rows, onActivity, firstJob: onActivity ? null : jobOf(rows[0]) || null, activityName });
    try {
      await offline.submit(draft as Draft);
      changed();
      // A finished card on a day that is still the person's own shows the day: its hours, what is missing, and Submit day.
      const told = done as { finished: boolean; work_date: string };
      if (review && told.finished && dayIsMine(week.data ? dayRowOf(week.data, told.work_date) : null)) router.replace({ pathname: '/day-review', params: { date: told.work_date } });
      else router.back();
    } catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); setBusy(false); }
  };

  // Deleting asks first, and goes through the outbox like everything else.
  const remove = () => Alert.alert(byHand ? 'Delete this time?' : 'Delete this job card?', 'It comes off your timesheet.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      setBusy(true); setProblem('');
      try { await offline.submit({ kind: 'delete', method: 'DELETE', path: `/job-cards/${card!.id}`, local_card: card }); changed(); router.back(); }
      catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); setBusy(false); }
    } },
  ]);

  const what = start ? (form.clock_off ? 'Add time' : 'Clock on') : isNew ? 'Add time' : finished ? 'Change time' : card?.prefill_off === '' ? 'Job card' : 'Clock off';
  return (
    <Screen>
      <Title>{what}</Title>
      {([['holiday', holiday], ['rdo', rdoDay]] as const).map(([kind, day]) => day && (
        <Notice key={kind} tone={kind === 'holiday' ? 'warn' : 'info'} icon={kind === 'holiday' ? 'sunny' : 'home'}>
          <Body strong>{banner(kind).strong}</Body>{banner(kind).rest}
          {!!banner(kind).button && <View style={{ marginTop: 10 }}><Button kind="plain" onPress={() => logDayOff(kind)}>{banner(kind).button}</Button></View>}
        </Notice>
      ))}
      {!isOnline() && <Notice tone="warn" icon="cloud-offline-outline">{OFFLINE_CARD.noSignal}</Notice>}

      <Card>
        <WhenField label="Date" mode="date" value={form.work_date} maxDate={localToday()} onChange={v => setForm(f => ({ ...f, work_date: v }))} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><WhenField label={byHand ? 'Start' : 'Clock on'} mode="time" value={form.clock_on} step={byHand ? 15 : undefined} onChange={v => setForm(f => ({ ...f, clock_on: v }))} /></View>
          <View style={{ flex: 1 }}><WhenField label={byHand ? 'Finish' : 'Clock off'} mode="time" value={form.clock_off} step={byHand ? 15 : undefined} placeholder={stillOn ? 'Still on' : undefined} onChange={v => setForm(f => ({ ...f, clock_off: v }))} /></View>
        </View>
        {stillOn && !form.clock_off && <Body tone="muted">{openCardHint(!!start)}</Body>}
        {runsPastMidnight(form) && <Body tone="muted">{pastMidnightHint(open.night)}</Body>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Body strong>{LUNCH_LABEL}</Body>
            <Body tone="muted">{lunchHint({ planned: plan.lunch, dayMins, lunch: form.lunch, manual: byHand })}</Body>
          </View>
          <Toggle accessibilityLabel="Lunch" value={form.lunch} onValueChange={v => setForm(f => ({ ...f, lunch: v }))} />
        </View>
        {plan.worked > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingTop: 4 }}>
            <Dots text={fmtMins(plan.worked)} size={28} color={t.accent2} />
            <Body tone="muted">worked</Body>
          </View>
        )}
        {!!lastCard && (
          <View style={{ gap: 6 }}>
            {!from && <Button kind="plain" icon="copy-outline" onPress={fillFromLast}>{useLastLabel(lastCard, fmtDate)}</Button>}
            <Body tone="muted">{from ? usedLastHint(from, fmtDate) : lastCardLine(lastCard)}</Body>
          </View>
        )}
      </Card>

      <Choice options={[{ key: 'job', label: 'Job' }, { key: 'activity', label: 'Activity' }]} value={onActivity ? 'activity' : 'job'} onChange={v => setOnActivity(v === 'activity')} />
      {onActivity && (
        <Card>
          <ChooseField<string> label="Activity" placeholder={activitiesRead.data ? 'Choose the activity' : 'Loading activities…'} value={form.activity_id ? activityName || `Activity ${form.activity_id}` : ''}
            options={activityOptions} onChoose={id => setForm(f => ({ ...f, activity_id: id }))} />
          {askFirst && <Body tone="danger">{picked!.name} needs a manager’s approval, so it goes in as leave rather than on a timesheet.</Body>}
          {askFirst && state.status === 'signedIn' && can(state.me.access, 'leave', 'edit') && <Button onPress={() => router.replace(picked!.leave_type_id ? `/request-leave?type=${encodeURIComponent(picked!.leave_type_id)}` : '/request-leave')}>Request leave</Button>}
          {!askFirst && !!picked?.day_off && <Body tone="muted">Counts as your {picked.day_off === 'rdo' ? 'RDO' : 'public holiday'}.</Body>}
          <Problem>{activitiesRead.error}</Problem>
        </Card>
      )}

      {!onActivity && rows.map((r, i) => {
        const job = jobOf(r), prev = rows[i - 1];
        const ownJob = i === 0 || !r.job_id || jobKeyOf({ id: prev.job_id, company_id: prev.company_id }) !== jobKeyOf({ id: r.job_id, company_id: r.company_id });   // rows on one job sit under one job box
        return (
          <Card key={r.key}>
            {ownJob && <JobField label="Job" jobs={jobs} companies={companies} scheduled={scheduled} recent={recent.data?.rows || []} job={job} loading={!jobsRead.data} onChoose={j => pickJob(r.key, j)} />}
            {!ownJob && <Body tone="muted">Also on #{r.job_id}</Body>}
            {!!job && (job.closed
              ? <Body tone="muted">This job is closed. Its cost centre stays as it was.</Body>
              : <CostCentreField job={job} value={`${r.section_id}:${r.cost_centre_id}`} stars={ccStars(job)}
                  onChoose={(section_id, cost_centre_id) => setRows(rs => rs.map(x => (x.key === r.key ? { ...x, section_id, cost_centre_id, remembered: false } : x)))} />)}
            {r.remembered && <Body tone="muted">The one you used last time on this job.</Body>}
            {rows.length > 1 && (
              <>
                {inHours && plan.worked > 0
                  ? <Field label={`Hours · ${r.pct}%`} keyboardType="decimal-pad" defaultValue={String(pctToHours(r.pct, plan.worked))} key={`${r.key}-${r.pct}`} maxLength={5}
                      onEndEditing={e => setRows(rs => setSplitPct(rs, r.key, String(hoursToPct(e.nativeEvent.text.replace(',', '.'), plan.worked))) as Row[])} />
                  : <Field label={`Share (%)${plan.worked > 0 ? ` · ${fmtMins(rowMins(i))}` : ''}`} keyboardType="number-pad" value={String(r.pct)} maxLength={3}
                      onChangeText={v => setRows(rs => setSplitPct(rs, r.key, v.replace(/\D/g, '')) as Row[])} />}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[-10, -5, 5, 10].map(d => (
                    <View key={d} style={{ flex: 1 }}><Button kind="plain" onPress={() => setRows(rs => setSplitPct(rs, r.key, String(Math.max(1, Math.min(99, (Number(r.pct) || 0) + d)))) as Row[])}>{d > 0 ? `+${d}` : String(d)}</Button></View>
                  ))}
                </View>
                <Button kind="plain" icon="trash-outline" onPress={() => setRows(rs => dropSplits(rs, new Set([r.key])) as Row[])}>Remove</Button>
              </>
            )}
          </Card>
        );
      })}
      {!onActivity && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}><Button kind="plain" icon="add" onPress={() => setRows(rs => { const last = rs[rs.length - 1]; return insertSplit(rs, rs.length, blank({ job_id: last.job_id, company_id: last.company_id })) as Row[]; })}>Cost centre</Button></View>
          <View style={{ flex: 1 }}><Button kind="plain" icon="add" onPress={() => setRows(rs => insertSplit(rs, rs.length, blank()) as Row[])}>Another job</Button></View>
        </View>
      )}
      {!onActivity && rows.length > 1 && (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <Body strong tone={splitIsWhole(rows) ? 'muted' : 'danger'}>{splitTotalText(rows) as string}</Body>
            {plan.worked > 0 && <Pill tone="neutral">{fmtMins(plan.worked)} worked</Pill>}
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button kind="plain" onPress={() => setRows(rs => splitEvenly(rs) as Row[])}>{SPLIT_WORDS.evenly as string}</Button></View>
            {plan.worked > 0 && <View style={{ flex: 1 }}><Button kind="plain" onPress={() => setInHours(v => !v)}>{(inHours ? SPLIT_WORDS.asPercent : SPLIT_WORDS.asHours) as string}</Button></View>}
          </View>
          {plan.blocks.length > 0 && rows.every(r => r.cost_centre_id) && (
            <Body tone="muted">{goesToText(plan, (i: number) => {
              const r = rows[i], job = jobOf(r), label = (job && (costCentreOptions(job) as { value: string; label: string }[]).find(o => o.value === `${r.section_id}:${r.cost_centre_id}`)?.label) || '';
              return shareName(label, r.job_id, new Set(rows.map(x => x.job_id)).size > 1) as string;
            }) as string}</Body>
          )}
        </Card>
      )}

      <Field label="Notes" value={form.notes} onChangeText={v => setForm(f => ({ ...f, notes: v }))} placeholder={NOTES_HINT} multiline />
      <Problem>{problem}</Problem>
      {stillOn && !!form.clock_off && <Button kind="plain" onPress={() => setForm(f => ({ ...f, clock_off: '' }))} disabled={busy}>Stay on the clock</Button>}
      <Button onPress={save} busy={busy} disabled={askFirst}>{start ? (form.clock_off ? 'Add time' : 'Clock on') : isNew ? 'Add time' : finished ? 'Save' : form.clock_off ? 'Clock off' : 'Save'}</Button>
      {!isNew && <Button kind="plain" icon="trash-outline" onPress={remove} disabled={busy}>{byHand ? 'Delete this time' : 'Delete this job card'}</Button>}
    </Screen>
  );
}
