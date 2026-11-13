// Raise a PO: the job, the supplier (the person's starred ones first), the job's cost centre, and an optional reference and note. It is raised in simPRO there and
// then and answers with its number, so it needs signal and does not wait in the outbox. What choosing a job does, when the form is ready and how suppliers are
// listed are the web app's own rules (shared/field-core.js). ?job=<company:job> opens it on that job (from a job on Home).
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { costCentreOptions, findJob, NO_SUPPLIERS, NOT_READ_YET, poPickJob, poRaisedText, poReady, starredAfter, supplierGroups } from '@shared/field-core.js';
import { filterJobs } from '@shared/pickers-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { ChooseField, type Option } from '@/pickers';
import { Body, Button, Card, Field, Problem, Screen, Title } from '@/ui';

type Job = { id: string; company_id: string; name: string | null; customer_name?: string | null; site_name?: string | null; sections: { id: string; name: string; cost_centres: { id: string; name: string }[] }[] };
type Supplier = { id: string; name: string };
type Raised = { po_number: string; vendor_name: string; job_label: string; cost_centre_label: string };

export default function RaisePO() {
  const { state, api, changed } = useSession();
  const { job: jobRef } = useLocalSearchParams<{ job?: string }>();
  const jobs = useRead<{ rows: Job[] }>('/jobs');
  const [form, setForm] = useState({ company_id: '', vendor_id: '', job_id: '', section_id: '', cost_centre_id: '', reference: '', notes: '' });
  const [starred, setStarred] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [po, setPo] = useState<Raised | null>(null);
  const [copied, setCopied] = useState(false);
  const list = jobs.data?.rows || [];
  const job = findJob(list, form.company_id, form.job_id) as Job | undefined;
  // Suppliers belong to a company: the chosen job's. The list comes with this person's own stars for that company.
  const suppliers = useRead<{ rows: Supplier[]; favourites: string[] }>(job ? `/suppliers?company=${job.company_id}` : null);
  useEffect(() => { setStarred(suppliers.data?.favourites || []); }, [suppliers.data]);
  // Opened from a job: that job, once the list has arrived.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !jobRef || !list.length) return;
    opened.current = true;
    const [co, id] = String(jobRef).includes(':') ? String(jobRef).split(':') : ['', String(jobRef)];
    setForm(f => poPickJob(f, findJob(list, co, id) || null));
  }, [jobRef, list.length]);
  if (state.status !== 'signedIn') return <Redirect href="/" />;

  // A star is this person's own and is saved at once; it shows straight away and is put back, with the reason, if it could not be saved.
  const star = async (vendorId: string, on: boolean) => {
    if (!job) return;
    setStarred(l => starredAfter(l, vendorId, on) as string[]);
    try { await api('/suppliers/favourite', { method: 'PUT', body: { company_id: job.company_id, vendor_id: vendorId, favourite: on } }); }
    catch (e) { setStarred(l => starredAfter(l, vendorId, !on) as string[]); setProblem(`Couldn’t ${on ? 'star' : 'take the star off'} that supplier. ${e instanceof Error ? e.message : ''}`); }
  };
  const raise = async () => {
    setBusy(true); setProblem('');
    try { const r = await api<{ po: Raised }>('/purchase-orders', { method: 'POST', body: form }); setPo(r.po); changed(); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy(false);
  };

  if (po) {
    return (
      <Screen centered>
        <Title>PO raised in simPRO</Title>
        <Body tone="muted">PO number</Body>
        <Title>{po.po_number}</Title>
        <Button kind="plain" onPress={() => { void Clipboard.setStringAsync(po.po_number).then(() => setCopied(true)); }}>{copied ? 'Copied' : 'Copy'}</Button>
        <Body tone="muted">{poRaisedText(po) as string}</Body>
        <Button onPress={() => router.back()}>Done</Button>
      </Screen>
    );
  }
  const jobOptions: Option<Job>[] = list.map(j => ({ key: `${j.company_id}:${j.id}`, title: `#${j.id} ${j.name || ''}`.trim(), detail: [j.customer_name, j.site_name].filter(Boolean).join(' · '), item: j }));
  const searchJobs = (q: string) => { const by = new Map(jobOptions.map(o => [o.item, o])); return (filterJobs(list, q) as Job[]).map(j => by.get(j)!).filter(Boolean); };
  const rows = suppliers.data?.rows || [];
  const supplierOptions: Option<string>[] = (supplierGroups(rows, starred) as { key: string; rows: { key: string; title: string }[] }[])
    .flatMap(g => g.rows.map(r => ({ key: `${g.key}:${r.key}`, title: r.title, detail: g.key === 'star' ? 'Starred' : undefined, item: r.key })));
  const chosen = rows.find(s => s.id === form.vendor_id);
  const ccs = costCentreOptions(job) as { value: string; label: string }[];
  const cc = ccs.find(o => o.value === `${form.section_id}:${form.cost_centre_id}`);
  return (
    <Screen>
      <Title>Raise a PO</Title>
      <Body tone="muted">Creates the purchase order in simPRO now and gives you its number.</Body>
      <ChooseField<Job> label="Job" placeholder={jobs.data ? 'Choose the job' : 'Loading jobs…'} value={job ? `#${job.id} ${job.name || ''}`.trim() : ''} options={jobOptions} search={searchJobs} onChoose={j => setForm(f => poPickJob(f, j))} />
      {!!job && (
        <Card>
          <ChooseField<string> label="Supplier" placeholder={!suppliers.data ? 'Loading suppliers…' : rows.length ? 'Choose a supplier' : (NO_SUPPLIERS as string)} value={chosen?.name || ''} options={supplierOptions}
            search={q => supplierOptions.filter(o => o.title.toLowerCase().includes(q.trim().toLowerCase()))} onChoose={v => setForm(f => ({ ...f, vendor_id: v }))} />
          {!!chosen && <Button kind="plain" onPress={() => { void star(chosen.id, !starred.includes(chosen.id)); }}>{starred.includes(chosen.id) ? 'Take the star off this supplier' : 'Star this supplier'}</Button>}
          <Problem>{suppliers.error}</Problem>
        </Card>
      )}
      {!!job && ccs.length === 0 && <Body tone="muted">{NOT_READ_YET as string}</Body>}
      {!!job && ccs.length > 0 && (
        <ChooseField<{ value: string }> label="Cost centre" placeholder="Choose the cost centre" value={cc?.label || ''} options={ccs.map(o => ({ key: o.value, title: o.label, item: o }))}
          onChoose={o => { const [section_id, cost_centre_id] = o.value.split(':'); setForm(f => ({ ...f, section_id, cost_centre_id })); }} />
      )}
      {!!job && (
        <View style={{ gap: 12 }}>
          <Field label="Reference (optional)" value={form.reference} onChangeText={v => setForm(f => ({ ...f, reference: v }))} maxLength={100} placeholder="e.g. the supplier’s quote number" />
          <Field label="Note for the office (optional)" value={form.notes} onChangeText={v => setForm(f => ({ ...f, notes: v }))} maxLength={1000} multiline />
          <Body tone="muted">The note is kept with the PO in simPRO. The supplier doesn’t see it.</Body>
        </View>
      )}
      <Problem>{problem || jobs.error}</Problem>
      <Button onPress={raise} busy={busy} disabled={!poReady(form)}>Raise PO</Button>
      <Button kind="plain" onPress={() => router.back()} disabled={busy}>Cancel</Button>
    </Screen>
  );
}
