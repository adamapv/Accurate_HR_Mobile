// Add a line to an expense claim (?claim=<id>): a receipt or amount, or a distance paid at the company's rate; its date and category; a photo of the receipt; and,
// if it is charged to a job, the job and its cost centre. What the form opens with, what stands in its way, what it is sent as and the hints are the web app's own
// rules (shared/field-core.js). It needs signal.
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { costCentreOptions, findJob, lastJobLine, lineDraft, lineFormStart, lineJobHint, linePlaceholder, lineProblem, mileageHint, NOT_READ_YET, soleCostCentre, toCents } from '@shared/field-core.js';
import { filterJobs } from '@shared/pickers-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { localToday } from '@/lib/dates';
import { fmtMoney } from '@/lib/money';
import { uploadPhoto } from '@/lib/upload';
import { ChooseField, WhenField, type Option } from '@/pickers';
import { Body, Button, Card, Field, Problem, Screen, Title } from '@/ui';

type Job = { id: string; company_id: string; name: string | null; customer_name?: string | null; site_name?: string | null; sections: { id: string; name: string; cost_centres: { id: string; name: string }[] }[] };
type Category = { id: string; name: string };
type Form = { description: string; amount_cents: number; gst_cents: number; category_id: string; line_date: string; mileage_km: number | null; receipt_r2_key: string | null; company_id: string; job_id: string; section_id: string; cost_centre_id: string };
type JobLine = { company_id: string; job_id: string | null; section_id: string; cost_centre_id: string };
const money = (v: string) => v.replace(/[^\d.]/g, '');

export default function ClaimLine() {
  const { state, api, changed, sessionId } = useSession();
  const { claim: claimId } = useLocalSearchParams<{ claim?: string }>();
  const cats = useRead<{ rows: Category[] }>('/expense-categories');
  const rate = useRead<{ rate: { rate_cents_per_km: number } | null }>('/expense-mileage-rate');
  const jobs = useRead<{ rows: Job[] }>('/jobs');
  const detail = useRead<{ lines: JobLine[] }>(claimId ? `/expense-claims/${claimId}` : null);
  const [form, setForm] = useState<Form>(() => lineFormStart([], localToday()) as Form);
  const [amount, setAmount] = useState('');
  const [gst, setGst] = useState('');
  const [km, setKm] = useState('');
  const [onJob, setOnJob] = useState(false);
  const [mode, setMode] = useState<'amount' | 'mileage'>('amount');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState('');
  // The first category once the list arrives, and the job another line on this claim was charged to, if one was.
  const catList = cats.data?.rows || [];
  useEffect(() => { if (catList.length) setForm(f => f.category_id ? f : { ...f, category_id: catList[0].id }); }, [catList.length]);
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !detail.data) return;
    started.current = true;
    const last = lastJobLine(detail.data.lines) as JobLine | undefined;
    if (last) { setForm(f => ({ ...f, ...(lineFormStart([], f.line_date, last) as Form), description: f.description, category_id: f.category_id, receipt_r2_key: f.receipt_r2_key })); setOnJob(true); }
  }, [detail.data]);
  if (state.status !== 'signedIn' || !claimId) return <Redirect href="/" />;

  const snap = async () => {
    setProblem('');
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setProblem('Allow the camera to take a photo of the receipt.');
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (shot.canceled || !shot.assets?.[0]) return;
    setUploading(true);
    try { const key = await uploadPhoto(api, sessionId(), shot.assets[0].uri, shot.assets[0].mimeType || 'image/jpeg', '/expense-receipts/upload-url', 'receipt.jpg'); setForm(f => ({ ...f, receipt_r2_key: key })); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Upload failed. Try again.'); }
    setUploading(false);
  };
  const add = async () => {
    const filled: Form = { ...form, amount_cents: toCents(amount) as number, gst_cents: toCents(gst) as number, mileage_km: parseFloat(km) || null };
    const bad = lineProblem(filled, onJob) as string;
    if (bad) return setProblem(bad);
    setBusy(true); setProblem('');
    try { await api('/expense-lines', { method: 'POST', body: lineDraft(filled, claimId, onJob, mode) }); changed(); router.back(); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); setBusy(false); }
  };

  const list = jobs.data?.rows || [];
  const job = findJob(list, form.company_id, form.job_id) as Job | undefined;
  const jobOptions: Option<Job>[] = list.map(j => ({ key: `${j.company_id}:${j.id}`, title: `#${j.id} ${j.name || ''}`.trim(), detail: [j.customer_name, j.site_name].filter(Boolean).join(' · '), item: j }));
  const searchJobs = (q: string) => { const by = new Map(jobOptions.map(o => [o.item, o])); return (filterJobs(list, q) as Job[]).map(j => by.get(j)!).filter(Boolean); };
  const ccs = costCentreOptions(job) as { value: string; label: string }[];
  const cc = ccs.find(o => o.value === `${form.section_id}:${form.cost_centre_id}`);
  const cat = catList.find(c => c.id === form.category_id);
  return (
    <Screen>
      <Title>Add line</Title>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Button kind={mode === 'amount' ? 'primary' : 'plain'} onPress={() => setMode('amount')}>Receipt / amount</Button></View>
        <View style={{ flex: 1 }}><Button kind={mode === 'mileage' ? 'primary' : 'plain'} onPress={() => setMode('mileage')}>Mileage</Button></View>
      </View>
      <Field label="Description" value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))} placeholder={linePlaceholder(mode) as string} maxLength={200} />
      <WhenField label="Date" mode="date" value={form.line_date} maxDate={localToday()} onChange={v => setForm(f => ({ ...f, line_date: v }))} />
      <ChooseField<Category> label="Category" placeholder={cats.data ? 'Choose a category' : 'Loading…'} value={cat?.name || ''} options={catList.map(c => ({ key: c.id, title: c.name, item: c }))} onChoose={c => setForm(f => ({ ...f, category_id: c.id }))} />
      {mode === 'amount' ? (
        <View style={{ gap: 12 }}>
          <Field label="Amount ($)" value={amount} onChangeText={v => setAmount(money(v))} keyboardType="decimal-pad" placeholder="0.00" />
          <Field label="GST ($)" value={gst} onChangeText={v => setGst(money(v))} keyboardType="decimal-pad" placeholder="0.00" />
          {form.receipt_r2_key
            ? <Card><Body tone="ok">Receipt attached</Body><Button kind="plain" onPress={() => setForm(f => ({ ...f, receipt_r2_key: null }))}>Remove</Button></Card>
            : <Button kind="plain" icon="camera-outline" onPress={() => { void snap(); }} busy={uploading}>Take a photo of the receipt</Button>}
        </View>
      ) : (
        <View style={{ gap: 4 }}>
          <Field label="Distance (km)" value={km} onChangeText={v => setKm(money(v))} keyboardType="decimal-pad" />
          <Body tone="muted">{rate.data ? mileageHint(parseFloat(km) || 0, rate.data.rate, fmtMoney) as string : 'Loading the rate…'}</Body>
        </View>
      )}
      <Body>Charge this to a job?</Body>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Button kind={!onJob ? 'primary' : 'plain'} onPress={() => setOnJob(false)}>No</Button></View>
        <View style={{ flex: 1 }}><Button kind={onJob ? 'primary' : 'plain'} onPress={() => setOnJob(true)}>Yes, to a job</Button></View>
      </View>
      <Body tone="muted">{lineJobHint(onJob) as string}</Body>
      {onJob && (
        <Card>
          <ChooseField<Job> label="Job" placeholder={jobs.data ? 'Choose the job' : 'Loading jobs…'} value={job ? `#${job.id} ${job.name || ''}`.trim() : ''} options={jobOptions} search={searchJobs}
            onChoose={j => setForm(f => ({ ...f, company_id: j.company_id, job_id: j.id, ...(soleCostCentre(j) as { section_id: string; cost_centre_id: string }) }))} />
          {!!job && ccs.length === 0 && <Body tone="muted">{NOT_READ_YET as string}</Body>}
          {!!job && ccs.length > 0 && (
            <ChooseField<{ value: string }> label="Cost centre" placeholder="Choose the cost centre" value={cc?.label || ''} options={ccs.map(o => ({ key: o.value, title: o.label, item: o }))}
              onChoose={o => { const [section_id, cost_centre_id] = o.value.split(':'); setForm(f => ({ ...f, section_id, cost_centre_id })); }} />
          )}
        </Card>
      )}
      <Problem>{problem || cats.error || jobs.error}</Problem>
      <Button onPress={() => { void add(); }} busy={busy} disabled={uploading}>Add</Button>
      <Button kind="plain" onPress={() => router.back()} disabled={busy}>Cancel</Button>
    </Screen>
  );
}
