// Choosing a job and its cost centre on a job card. The job box has the day's published jobs and the ones lately worked on as one-tap buttons over it, and
// opens a list with those first and the rest under their companies. The cost centre box lists the job's sections with this person's starred cost centres
// first, each with a star to put on or take off. How both lists are made is the web app's own rule (shared/field-core.js, shared/pickers-core.js).
import { useState } from 'react';
import { View } from 'react-native';
import { CC_WORDS, costCentreChipName, costCentreGroups, costCentreLabel, jobCapText, jobKeyOf, jobMetaOf, jobSearchGroups, jobShortcuts, jobTitleOf, JOB_WORDS, STARRED_CC_MAX } from '@shared/field-core.js';
import { filterJobs } from '@shared/pickers-core.js';
import { PickBox, PickSheet, QuickPicks, type PickGroup } from '@/pickers';

export type PickJob = { id: string; company_id: string; name: string | null; customer_name?: string | null; site_name?: string | null; sections: { id: string; name: string; cost_centres: { id: string; name: string }[] }[]; closed?: boolean };
type Ref = { company_id: string; job_id: string };
type CcRow = { key: string; title: string; meta: string | null; text: string; section_id: string; cost_centre_id: string; section_name: string; disabled?: boolean };

export function JobField({ label, jobs, companies, scheduled, recent, job, loading, onChoose }: { label: string; jobs: PickJob[]; companies: { id: string; name: string }[]; scheduled: Ref[]; recent: Ref[]; job: PickJob | undefined; loading: boolean;
  onChoose: (j: PickJob) => void }) {
  const [open, setOpen] = useState(false);
  const cuts = jobShortcuts({ jobs, scheduled, recent, value: jobKeyOf(job) }) as { scheduled: PickJob[]; recent: PickJob[] };
  const found = (q: string) => (q.trim() ? filterJobs(jobs, q) : jobs) as PickJob[];
  const groupsFor = (q: string): PickGroup[] => (jobSearchGroups(found(q), scheduled, companies) as { key: string; title: string | null; list: PickJob[] }[])
    .map(g => ({ key: String(g.key), title: g.title, rows: g.list.map(j => ({ key: jobKeyOf(j) as string, title: jobTitleOf(j) as string, meta: jobMetaOf(j) as string, tag: j.closed ? (JOB_WORDS.closed as string) : undefined })) }));
  const pick = (key: string) => { const j = jobs.find(x => jobKeyOf(x) === key); if (j) onChoose(j); };
  return (
    <View style={{ gap: 10 }}>
      <QuickPicks strong label={`${JOB_WORDS.scheduled}:`} picks={cuts.scheduled.map(j => ({ key: jobKeyOf(j) as string, title: jobTitleOf(j) as string }))} onPick={pick} />
      <QuickPicks label={`${JOB_WORDS.recent}:`} picks={cuts.recent.slice(0, 6).map(j => ({ key: jobKeyOf(j) as string, title: `#${j.id}` }))} onPick={pick} />
      <PickBox label={label} value={job ? (jobTitleOf(job) as string) : ''} meta={job ? (jobMetaOf(job) as string) : null} placeholder={loading ? 'Loading jobs…' : (JOB_WORDS.choose as string)} onPress={() => setOpen(true)} />
      {open && <PickSheet title={label} hint={JOB_WORDS.hint as string} groupsFor={groupsFor} footerFor={q => jobCapText(found(q)) as string} empty={JOB_WORDS.none as string} onPick={pick} onClose={() => setOpen(false)} />}
    </View>
  );
}

// `value` is "section:cost centre" ('' for none). `stars` is this person's stars on this job and how to change one (src/lib/use-stars.ts).
export function CostCentreField({ job, value, stars, onChoose }: { job: PickJob; value: string; stars: { keys: string[]; toggle: (sectionId: string, costCentreId: string, on: boolean) => void }; onChoose: (sectionId: string, costCentreId: string) => void }) {
  const [open, setOpen] = useState(false);
  const sections = job.sections || [];
  const { groups, mine } = costCentreGroups(sections, stars.keys) as { groups: { key: string; title: string | null; rows: CcRow[] }[]; mine: CcRow[] };
  const all = groups.flatMap(g => g.rows);
  const chosen = all.find(r => r.key === value && !r.disabled);
  const on = new Set(stars.keys);
  const groupsFor = (q: string): PickGroup[] => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return groups.map(g => ({ key: String(g.key), title: g.title, rows: g.rows.filter(r => words.every(w => r.text.toLowerCase().includes(w)))
      .map(r => ({ key: `${g.key}|${r.key}`, title: r.title, meta: r.meta, disabled: r.disabled, star: r.disabled ? undefined : on.has(r.key) })) }));
  };
  const parts = (key: string) => key.slice(key.indexOf('|') + 1).split(':');
  const label = costCentreLabel(sections) as string;
  return (
    <View style={{ gap: 10 }}>
      <QuickPicks label={CC_WORDS.chips as string} picks={mine.filter(r => r.key !== value).slice(0, STARRED_CC_MAX as number).map(r => ({ key: r.key, title: costCentreChipName(r, mine) as string }))}
        onPick={key => { const [s, c] = key.split(':'); onChoose(s, c); }} />
      <PickBox label={label} value={chosen?.title || ''} meta={chosen && sections.length > 1 ? chosen.section_name : null} placeholder={CC_WORDS.choose as string} onPress={() => setOpen(true)} />
      {open && <PickSheet title={CC_WORDS.title as string} hint={CC_WORDS.hint as string} groupsFor={groupsFor} empty={CC_WORDS.empty as string}
        onPick={key => { const [s, c] = parts(key); onChoose(s, c); }} onStar={(key, star) => { const [s, c] = parts(key); stars.toggle(s, c, star); }} onClose={() => setOpen(false)} />}
    </View>
  );
}
