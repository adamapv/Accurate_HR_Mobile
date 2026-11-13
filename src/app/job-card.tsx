// The job card: clocking off the open card (?id=<card id>), or adding time by hand (no id). The date, start, finish and lunch, the job, and how the time is shared
// between its cost centres. Every rule is the web form's own (shared/field-core.js): what a new card opens with, what is refused before it is sent, how the shares
// move, and what is sent. It is saved through the outbox, so it works with no signal.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Switch, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { cardDefaults, cardDraft, cardProblem, costCentreOptions, dropSplits, findJob, hmMins, insertSplit, onlyCostCentre, planJobCard, rememberedCostCentre, setSplitPct, splitEvenly } from '@shared/field-core.js';
import { applyToOpenCard } from '@shared/offline-queue.js';
import { filterJobs } from '@shared/pickers-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { useOutbox } from '@/lib/use-outbox';
import type { Draft } from '@/lib/offline-core';
import { fmtMins, localNowHM, localToday } from '@/lib/dates';
import { ChooseField, WhenField, type Option } from '@/pickers';
import { Body, Button, Card, Field, Loading, Problem, Screen, Title } from '@/ui';

type CostCentre = { id: string; name: string };
type Job = { id: string; company_id: string; name: string | null; customer_name?: string | null; site_name?: string | null; sections: { id: string; name: string; cost_centres: CostCentre[] }[]; closed?: boolean };
type Split = { job_id: string; company_id: string; section_id: string; cost_centre_id: string; pct: number };
type Row = Split & { key: number; remembered?: boolean };
type CardRow = { id: string; work_date: string; clock_on: string; clock_off: string | null; lunch: number | boolean | null; job_id: string | null; company_id: string | null; job_label: string | null;
  splits: Split[] | null; notes: string | null; activity_id: string | null; activity_label: string | null; source: string | null; updated_at?: string };
type Open = { card: CardRow | null; last_card: (CardRow & { splits: Split[] | null }) | null; night: { rest_hours: number; window: { start: string; end: string } } | null };
type Week = { entries: { card_id: string | null; work_date: string; start_time: string; end_time: string }[] };

let nextKey = 0;
const blank = (over: Partial<Row> = {}): Row => ({ key: ++nextKey, job_id: '', company_id: '', section_id: '', cost_centre_id: '', pct: 100, ...over });

export default function JobCardScreen() {
  const { state } = useSession();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const open = useRead<Open>('/job-cards/open');
  const queued = useOutbox();
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (open.data === undefined) return open.error ? <Screen centered><Problem>{open.error}</Problem><Button kind="plain" onPress={() => router.back()}>Back</Button></Screen> : <Loading />;
  // The open card as the phone sees it, with what is still waiting laid over it.
  const live = applyToOpenCard(open.data.card, queued).card as CardRow | null;
  if (id && (!live || live.id !== id)) return <Redirect href="/" />;   // it was clocked off somewhere else
  return <Form key={id || 'new'} card={id ? live : null} open={open.data} />;
}

function Form({ card, open }: { card: CardRow | null; open: Open }) {
  const { offline, changed } = useSession();
  const isNew = !card;
  const jobsRead = useRead<{ rows: Job[] }>('/jobs');
  const recent = useRead<{ cost_centres: { company_id: string; job_id: string; section_id: string; cost_centre_id: string }[] }>('/job-cards/recent');
  const d0 = useMemo(() => (isNew ? cardDefaults(open.last_card) : null), [isNew, open.last_card]);
  const [form, setForm] = useState({
    work_date: card?.work_date || localToday(),
    clock_on: card?.clock_on || d0?.clock_on || '',
    clock_off: card ? card.clock_off || localNowHM() : d0?.clock_off || '',
    lunch: card?.lunch != null ? !!card.lunch : isNew ? !!d0?.lunch : true,
    activity_id: '', notes: card?.notes || '',
  });
  const [rows, setRows] = useState<Row[]>(() => (card?.splits?.length ? card.splits : [{ pct: 100 } as Split])
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

  const plan = planJobCard(form.clock_on, form.clock_off, form.lunch, rows);
  // The minutes each row really lays out as (what goes to simPRO), not the unrounded share.
  const rowMins = (i: number) => (plan.blocks as { split: number; start: string; end: string }[]).filter(b => b.split === i).reduce((n, b) => n + hmMins(b.end) - hmMins(b.start), 0);
  const jobOptions: Option<Job>[] = (jobsRead.data?.rows || []).map(j => ({ key: `${j.company_id}:${j.id}`, title: `#${j.id} ${j.name || ''}`.trim(), detail: [j.customer_name, j.site_name].filter(Boolean).join(' · '), item: j }));
  // Narrowed by the web app's own rule (every word in the number, name, customer or site; the ones that start with it first).
  const searchJobs = (q: string) => { const byJob = new Map(jobOptions.map(o => [o.item, o])); return (filterJobs(jobsRead.data?.rows || [], q) as Job[]).map(j => byJob.get(j)!).filter(Boolean); };

  const save = async () => {
    const bad = cardProblem({ form, rows, onActivity: false, night: open.night, dayEntries: week.data?.entries || [], cardId: card?.id, needsApproval: null });
    if (bad) return setProblem(bad);
    setBusy(true); setProblem('');
    const { draft } = cardDraft({ card: card || {}, form, rows, onActivity: false, firstJob: jobOf(rows[0]) || null, activityName: null });
    try {
      await offline.submit(draft as Draft);
      changed();
      router.back();
    } catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); setBusy(false); }
  };

  // A card clocked on to an activity is finished in the browser for now.
  if (card?.activity_id) {
    return (
      <Screen centered>
        <Title>{card.activity_label || 'Activity'}</Title>
        <Body tone="muted">This card is on an activity. Clock off in the Field view in your browser for now.</Body>
        <Button kind="plain" onPress={() => router.back()}>Back</Button>
      </Screen>
    );
  }
  return (
    <Screen>
      <Title>{isNew ? 'Add time' : 'Clock off'}</Title>
      {isNew && d0?.from && <Body tone="muted">Times from your last day. Change what is different.</Body>}
      <WhenField label="Date" mode="date" value={form.work_date} maxDate={localToday()} onChange={v => setForm(f => ({ ...f, work_date: v }))} />
      <WhenField label={isNew ? 'Start' : 'Clock on'} mode="time" value={form.clock_on} step={isNew ? 15 : undefined} onChange={v => setForm(f => ({ ...f, clock_on: v }))} />
      <WhenField label={isNew ? 'Finish' : 'Clock off'} mode="time" value={form.clock_off} step={isNew ? 15 : undefined} onChange={v => setForm(f => ({ ...f, clock_off: v }))} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Body>Lunch (30 minutes, unpaid)</Body>
        <Switch accessibilityLabel="Lunch" value={form.lunch} onValueChange={v => setForm(f => ({ ...f, lunch: v }))} />
      </View>
      {plan.worked > 0 && <Body tone="muted">{fmtMins(plan.worked)} worked{plan.lunch ? ` · lunch ${plan.lunch}` : ''}</Body>}

      {rows.map((r, i) => {
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
      <Button kind="plain" onPress={() => setRows(rs => { const last = rs[rs.length - 1]; return insertSplit(rs, rs.length, blank({ job_id: last.job_id, company_id: last.company_id })) as Row[]; })}>Add a cost centre</Button>
      {rows.length > 1 && <Button kind="plain" onPress={() => setRows(rs => splitEvenly(rs) as Row[])}>Split evenly</Button>}

      <Field label="Notes" value={form.notes} onChangeText={v => setForm(f => ({ ...f, notes: v }))} multiline />
      <Problem>{problem}</Problem>
      <Button onPress={save} busy={busy}>{isNew ? 'Add time' : 'Clock off'}</Button>
      <Button kind="plain" onPress={() => router.back()} disabled={busy}>Cancel</Button>
    </Screen>
  );
}
