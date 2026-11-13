// Report a hazard: what was seen, its category and where, an optional job, how likely harm is and how bad it could be (which gives its risk rating), suggested
// controls and photos taken with the camera. The lists, the rating, what a new hazard rated high or extreme is told, what stands in the way and what is sent are
// the web app's own rules (shared/whs-core.js). It needs signal.
import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { findJob } from '@shared/field-core.js';
import { filterJobs } from '@shared/pickers-core.js';
import { CONSEQUENCE, enumLabel, HAZARD_CATEGORIES, HAZARD_URGENT_NOTE, hazardDraft, hazardFormStart, hazardHead, hazardProblem, hazardSaid, hazardUrgent, LIKELIHOOD, riskBand, scaleLabel } from '@shared/whs-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { ChooseField, type Option } from '@/pickers';
import { Body, Button, Field, Problem, Screen, Title } from '@/ui';
import { PhotoList, PickField, type Photo } from '@/whs';

type Job = { id: string; company_id: string; name: string | null; customer_name?: string | null; site_name?: string | null };
type Form = { title: string; description: string; location: string; category: string; likelihood: number; consequence: number; control_measures: string; review_date: string; status: string; job_id: string; company_id: string };
const scale = (list: string[]) => list.map((_, i) => [String(i + 1), scaleLabel(list, i + 1) as string] as [string, string]);

export default function ReportHazard() {
  const { state, api, changed } = useSession();
  const jobs = useRead<{ rows: Job[] }>('/jobs');
  const [form, setForm] = useState<Form>(() => hazardFormStart() as Form);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [sent, setSent] = useState(false);
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  const head = hazardHead(true) as { title: string; sub: string; submit: string; controls: string };
  if (sent) return <Screen centered><Title>{hazardSaid(true) as string}</Title><Button onPress={() => router.back()}>Done</Button></Screen>;

  const list = jobs.data?.rows || [];
  const job = findJob(list, form.company_id, form.job_id) as Job | undefined;
  const jobOptions: Option<Job | null>[] = [{ key: 'none', title: 'No job', item: null }, ...list.map(j => ({ key: `${j.company_id}:${j.id}`, title: `#${j.id} ${j.name || ''}`.trim(), detail: [j.customer_name, j.site_name].filter(Boolean).join(' · '), item: j as Job | null }))];
  const searchJobs = (q: string) => { const by = new Map(jobOptions.map(o => [o.item, o])); return (filterJobs(list, q) as Job[]).map(j => by.get(j)!).filter(Boolean); };
  const band = riskBand(form.likelihood, form.consequence) as string;
  const send = async () => {
    const bad = hazardProblem(form, uploading) as string;
    if (bad) return setProblem(bad);
    setBusy(true); setProblem('');
    try { await api('/whs/hazards', { method: 'POST', body: hazardDraft({ form, photos, isNew: true, id: undefined, jobLabel: job ? `#${job.id} ${job.name || ''}`.trim() : null }) }); setSent(true); changed(); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy(false);
  };
  return (
    <Screen>
      <Title>{head.title}</Title>
      <Body tone="muted">{head.sub}</Body>
      <Field label="What did you see?" value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))} maxLength={200} />
      <PickField label="Category" value={form.category} values={HAZARD_CATEGORIES as string[]} onChange={v => setForm(f => ({ ...f, category: v }))} />
      <Field label="Location" value={form.location} onChangeText={v => setForm(f => ({ ...f, location: v }))} maxLength={300} />
      <ChooseField<Job | null> label="Job (optional)" placeholder={jobs.data ? 'Choose the job' : 'Loading jobs…'} value={job ? `#${job.id} ${job.name || ''}`.trim() : ''} options={jobOptions} search={searchJobs}
        onChoose={j => setForm(f => ({ ...f, job_id: j?.id || '', company_id: j?.company_id || '' }))} />
      <Field label="Description" value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} multiline maxLength={3000} />
      <PickField label="How likely is harm?" value={String(form.likelihood)} pairs={scale(LIKELIHOOD as string[])} onChange={v => setForm(f => ({ ...f, likelihood: Number(v) }))} />
      <PickField label="How bad could it be?" value={String(form.consequence)} pairs={scale(CONSEQUENCE as string[])} onChange={v => setForm(f => ({ ...f, consequence: Number(v) }))} />
      <Body tone={band === 'high' || band === 'extreme' ? 'danger' : 'muted'}>Risk rating: {enumLabel(band) as string}{hazardUrgent(form, true) ? ` ${HAZARD_URGENT_NOTE as string}` : ''}</Body>
      <Field label={head.controls} value={form.control_measures} onChangeText={v => setForm(f => ({ ...f, control_measures: v }))} multiline maxLength={2000} />
      <PhotoList photos={photos} onChange={setPhotos} onBusy={setUploading} />
      <Problem>{problem || jobs.error}</Problem>
      <Button onPress={() => { void send(); }} busy={busy} disabled={uploading}>{head.submit}</Button>
      <Button kind="plain" onPress={() => router.back()} disabled={busy}>Cancel</Button>
    </Screen>
  );
}
