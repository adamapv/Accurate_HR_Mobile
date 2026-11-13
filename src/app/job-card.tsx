// The job card: clocking off the open card or changing a finished one (?id=<card id>, with ?date= for a finished one), or adding time by hand (no id),
// on a job or on an activity (training, a toolbox talk, a public holiday, an RDO). The date, start, finish and lunch, the job, and how the time is shared
// between its cost centres. Every rule is the web form's own (shared/field-core.js): what a new card opens with, what is refused before it is sent, how the shares
// move, and what is sent. It is saved through the outbox, so it works with no signal.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Switch, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { can } from '@shared/access.js';
import { activityAsksFirst, activityGroups, cardDefaults, cardDraft, cardProblem, costCentreOptions, dropSplits, findJob, hmMins, insertSplit, onlyCostCentre, planJobCard, rememberedCostCentre, setSplitPct, splitEvenly } from '@shared/field-core.js';
import { applyToOpenCard, applyToWeek } from '@shared/offline-queue.js';
import { filterJobs } from '@shared/pickers-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { useOutbox } from '@/lib/use-outbox';
import type { Draft } from '@/lib/offline-core';
import { fmtMins, localNowHM, localToday } from '@/lib/dates';
import { take } from '@/lib/handoff';
import { ChooseField, WhenField, type Option } from '@/pickers';
import { Body, Button, Card, Field, Loading, Problem, Screen, Title } from '@/ui';

type CostCentre = { id: string; name: string };
type Job = { id: string; company_id: string; name: string | null; customer_name?: string | null; site_name?: string | null; sections: { id: string; name: string; cost_centres: CostCentre[] }[]; closed?: boolean };
type Split = { job_id: string; company_id: string; section_id: string; cost_centre_id: string; pct: number };
type Row = Split & { key: number; remembered?: boolean };
type CardRow = { id: string; work_date: string; clock_on: string; clock_off: string | null; lunch: number | boolean | null; job_id: string | null; company_id: string | null; job_label: string | null;
  splits: Split[] | null; notes: string | null; activity_id: string | null; activity_label: string | null; source: string | null; updated_at?: string; prefill_off?: string };
// What Start hands over (shared/job-checks.js startStep): a clock-on to a job whose cost centre has to be chosen, or the open card moved onto another job.
type StartInit = { kind?: 'clock-on'; id?: string; work_date: string; clock_on: string; company_id: string; job_id: string; splits: Split[] } & Partial<CardRow>;
type Open = { card: CardRow | null; last_card: (CardRow & { splits: Split[] | null }) | null; night: { rest_hours: number; window: { start: string; end: string } } | null };
type Week = { period: { period_start: string; period_end: string }; cards: CardRow[]; entries: { card_id: string | null; work_date: string; start_time: string; end_time: string }[]; holidays?: { date: string }[]; rdos?: { date: string }[] };
type Activity = { id: string; name: string; needs_approval?: number | boolean; ask_first?: number | boolean; day_off?: string | null; leave_type_id?: string | null };

let nextKey = 0;
const blank = (over: Partial<Row> = {}): Row => ({ key: ++nextKey, job_id: '', company_id: '', section_id: '', cost_centre_id: '', pct: 100, ...over });

export default function JobCardScreen() {
  const { state } = useSession();
  const { id, date, init } = useLocalSearchParams<{ id?: string; date?: string; init?: string }>();
  const open = useRead<Open>('/job-cards/open');
  // A finished card is found in its day's week (the Job card tab passes the date).
  const week = useRead<Week>(id && date ? `/timesheets/mine?date=${date}` : null);
  const queued = useOutbox();
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (open.data === undefined) return open.error ? <Screen centered><Problem>{open.error}</Problem><Button kind="plain" onPress={() => router.back()}>Back</Button></Screen> : <Loading />;
  // From Start: clock on to a job (no card yet), or the open card with another job put on it.
  const started = take<StartInit>(init);
  if (started && !started.id) return <Form key={`start:${init}`} card={null} start={started} open={open.data} />;
  if (started) return <Form key={`switch:${init}`} card={started as CardRow} open={open.data} />;
  if (!id) return <Form key={`new:${date || ''}`} card={null} open={open.data} date={date} />;
  // The open card as the phone sees it, with what is still waiting laid over it; else one of the day's cards the same way.
  const live = applyToOpenCard(open.data.card, queued).card as CardRow | null;
  let card = live && live.id === id ? live : null;
  if (!card && date) {
    if (week.data === undefined) return week.error ? <Screen centered><Problem>{week.error}</Problem><Button kind="plain" onPress={() => router.back()}>Back</Button></Screen> : <Loading />;
    card = ((applyToWeek(week.data, queued, planJobCard) as Week).cards || []).find(c => c.id === id) || null;
  }
  if (!card) return <Redirect href="/" />;   // it was clocked off or deleted somewhere else
  return <Form key={id} card={card} open={open.data} />;
}

function Form({ card, open, date, start }: { card: CardRow | null; open: Open; date?: string; start?: StartInit }) {
  const { state, offline, changed } = useSession();
  const isNew = !card;
  const finished = !!card?.clock_off;                 // a finished card being changed, not a clock-off
  const byHand = (isNew && !start) || card?.source === 'manual';  // a start and finish typed in, which go in quarter hours
  const stillOn = (!!card && !card.clock_off) || !!start;          // an open card may be saved without a clock off
  const jobsRead = useRead<{ rows: Job[] }>('/jobs');
  const recent = useRead<{ cost_centres: { company_id: string; job_id: string; section_id: string; cost_centre_id: string }[] }>('/job-cards/recent');
  const d0 = useMemo(() => (isNew && !start ? cardDefaults(open.last_card) : null), [isNew, start, open.last_card]);
  const [form, setForm] = useState({
    work_date: card?.work_date || start?.work_date || date || localToday(),
    clock_on: card?.clock_on || start?.clock_on || d0?.clock_on || '',
    clock_off: card ? card.clock_off ?? card.prefill_off ?? localNowHM() : start ? '' : d0?.clock_off || '',
    lunch: card?.lunch != null ? !!card.lunch : d0 ? !!d0.lunch : true,
    activity_id: card?.activity_id || '', notes: card?.notes || '',
  });
  const [onActivity, setOnActivity] = useState(!!card?.activity_id);
  const activitiesRead = useRead<{ rows: Activity[] }>('/activities');
  const [rows, setRows] = useState<Row[]>(() => (card?.splits?.length ? card.splits : start?.splits?.length ? start.splits : [{ pct: 100 } as Split])
    .map(s => blank({ ...s, job_id: s.job_id ?? card?.job_id ?? '', company_id: (s.job_id ?? card?.job_id) ? s.company_id || card?.company_id || '' : '' })));
  const week = useRead<Week>(`/timesheets/mine?date=${form.work_date}`);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

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
  const jobOptions: Option<Job>[] = (jobsRead.data?.rows || []).map(j => ({ key: `${j.company_id}:${j.id}`, title: `#${j.id} ${j.name || ''}`.trim(), detail: [j.customer_name, j.site_name].filter(Boolean).join(' · '), item: j }));
  // Narrowed by the web app's own rule (every word in the number, name, customer or site; the ones that start with it first).
  const searchJobs = (q: string) => { const byJob = new Map(jobOptions.map(o => [o.item, o])); return (filterJobs(jobsRead.data?.rows || [], q) as Job[]).map(j => byJob.get(j)!).filter(Boolean); };

  const save = async () => {
    const bad = cardProblem({ form, rows, onActivity, night: open.night, dayEntries: week.data?.entries || [], cardId: card?.id, needsApproval: askFirst ? picked!.name : null });
    if (bad) return setProblem(bad);
    setBusy(true); setProblem('');
    const { draft } = cardDraft({ card: card || start || {}, form, rows, onActivity, firstJob: onActivity ? null : jobOf(rows[0]) || null, activityName });
    try {
      await offline.submit(draft as Draft);
      changed();
      router.back();
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

  return (
    <Screen>
      <Title>{start ? (form.clock_off ? 'Add time' : 'Clock on') : isNew ? 'Add time' : finished ? 'Change time' : card?.prefill_off === '' ? 'Job card' : 'Clock off'}</Title>
      {isNew && d0?.from && <Body tone="muted">Times from your last day. Change what is different.</Body>}
      <WhenField label="Date" mode="date" value={form.work_date} maxDate={localToday()} onChange={v => setForm(f => ({ ...f, work_date: v }))} />
      <WhenField label={byHand ? 'Start' : 'Clock on'} mode="time" value={form.clock_on} step={byHand ? 15 : undefined} onChange={v => setForm(f => ({ ...f, clock_on: v }))} />
      <WhenField label={byHand ? 'Finish' : 'Clock off'} mode="time" value={form.clock_off} step={byHand ? 15 : undefined} placeholder={stillOn ? 'Still on the clock' : undefined} onChange={v => setForm(f => ({ ...f, clock_off: v }))} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Body>Lunch (30 minutes, unpaid)</Body>
        <Switch accessibilityLabel="Lunch" value={form.lunch} onValueChange={v => setForm(f => ({ ...f, lunch: v }))} />
      </View>
      {plan.worked > 0 && <Body tone="muted">{fmtMins(plan.worked)} worked{plan.lunch ? ` · lunch ${plan.lunch}` : ''}</Body>}

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}><Button kind={onActivity ? 'plain' : 'primary'} onPress={() => setOnActivity(false)}>Job</Button></View>
        <View style={{ flex: 1 }}><Button kind={onActivity ? 'primary' : 'plain'} onPress={() => setOnActivity(true)}>Activity</Button></View>
      </View>
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
        const job = jobOf(r), ccs = costCentreOptions(job) as { value: string; label: string }[];
        const cc = ccs.find(o => o.value === `${r.section_id}:${r.cost_centre_id}`);
        return (
          <Card key={r.key}>
            <ChooseField<Job> label="Job" placeholder={jobsRead.data ? 'Choose the job' : 'Loading jobs…'} value={r.job_id ? `#${r.job_id} ${job?.name || ''}`.trim() : ''} options={jobOptions} search={searchJobs} onChoose={j => pickJob(r.key, j)} />
            {!!r.job_id && (job?.closed
              ? <Body tone="muted">This job is closed. Its cost centre stays as it was.</Body>
              : <ChooseField<{ value: string }> label="Cost centre" placeholder="Choose the cost centre" value={cc?.label || ''} options={ccs.map(o => ({ key: o.value, title: o.label, item: o }))}
                  onChoose={o => { const [section_id, cost_centre_id] = o.value.split(':'); setRows(rs => rs.map(x => (x.key === r.key ? { ...x, section_id, cost_centre_id, remembered: false } : x))); }} />)}
            {r.remembered && <Body tone="muted">The one you used last time on this job.</Body>}
            {rows.length > 1 && (
              <>
                <Field label={`Share (%)${plan.worked > 0 ? ` · ${fmtMins(rowMins(i))}` : ''}`} keyboardType="number-pad" value={String(r.pct)} maxLength={3}
                  onChangeText={v => setRows(rs => setSplitPct(rs, r.key, v.replace(/\D/g, '')) as Row[])} />
                <Button kind="plain" onPress={() => setRows(rs => dropSplits(rs, new Set([r.key])) as Row[])}>Remove</Button>
              </>
            )}
          </Card>
        );
      })}
      {!onActivity && <Button kind="plain" onPress={() => setRows(rs => { const last = rs[rs.length - 1]; return insertSplit(rs, rs.length, blank({ job_id: last.job_id, company_id: last.company_id })) as Row[]; })}>Add a cost centre</Button>}
      {!onActivity && rows.length > 1 && <Button kind="plain" onPress={() => setRows(rs => splitEvenly(rs) as Row[])}>Split evenly</Button>}

      <Field label="Notes" value={form.notes} onChangeText={v => setForm(f => ({ ...f, notes: v }))} multiline />
      <Problem>{problem}</Problem>
      {stillOn && !!form.clock_off && <Button kind="plain" onPress={() => setForm(f => ({ ...f, clock_off: '' }))} disabled={busy}>Stay on the clock</Button>}
      <Button onPress={save} busy={busy} disabled={askFirst}>{start ? (form.clock_off ? 'Add time' : 'Clock on') : isNew ? 'Add time' : finished ? 'Save' : form.clock_off ? 'Clock off' : 'Save'}</Button>
      {!isNew && <Button kind="plain" onPress={remove} disabled={busy}>{byHand ? 'Delete this time' : 'Delete this job card'}</Button>}
      <Button kind="plain" onPress={() => router.back()} disabled={busy}>Cancel</Button>
    </Screen>
  );
}
