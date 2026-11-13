// Tell the office about an asset the person holds (?id=<asset>): what happened, the condition it is in now, and a note. The kinds of report, the conditions and
// what the form opens with are the web app's own rules (shared/field-core.js), which are the ones the Worker takes from the holder. It needs signal.
import { useEffect, useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { ASSET_EVENTS, ASSET_REPORT_SENT, assetReportStart, assetReportTitle, conditionLabel, HOLDER_CONDITIONS } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import type { Asset } from '@/app/assets';
import { ChooseField } from '@/pickers';
import { Body, Button, Field, Loading, Problem, Screen, Title } from '@/ui';

type Form = { event_type: string; condition: string; notes: string };
const EVENTS = ASSET_EVENTS as [string, string][], CONDITIONS = HOLDER_CONDITIONS as string[];

export default function ReportAsset() {
  const { state, api, changed } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const assets = useRead<{ rows: Asset[] }>(state.status === 'signedIn' ? `/assets/by-employee/${encodeURIComponent(state.me.employee.id)}` : null);
  const asset = assets.data?.rows.find(a => a.id === id);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [sent, setSent] = useState(false);
  useEffect(() => { if (asset && !form) setForm(assetReportStart(asset) as Form); }, [asset, form]);
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (sent) return <Screen centered><Title>{ASSET_REPORT_SENT as string}</Title><Button onPress={() => router.back()}>Done</Button></Screen>;
  if (!assets.data) return assets.error ? <Screen centered><Problem>{assets.error}</Problem><Button kind="plain" onPress={() => router.back()}>Back</Button></Screen> : <Loading />;
  if (!asset) return <Redirect href="/assets" />;
  if (!form) return <Loading />;
  const send = async () => {
    setBusy(true); setProblem('');
    try { await api(`/assets/${asset.id}/audit`, { method: 'POST', body: form }); setSent(true); changed(); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy(false);
  };
  return (
    <Screen>
      <Title>{assetReportTitle(asset) as string}</Title>
      <ChooseField<string> label="What happened?" placeholder="Choose" value={EVENTS.find(e => e[0] === form.event_type)?.[1] || ''} options={EVENTS.map(([key, title]) => ({ key, title, item: key }))} onChoose={v => setForm({ ...form, event_type: v })} />
      <ChooseField<string> label="Current condition" placeholder="Choose" value={conditionLabel(form.condition) as string} options={CONDITIONS.map(c => ({ key: c, title: conditionLabel(c) as string, item: c }))} onChoose={v => setForm({ ...form, condition: v })} />
      <Field label="Notes" value={form.notes} onChangeText={v => setForm({ ...form, notes: v })} multiline maxLength={1000} />
      <Body tone="muted">The office sees this on the asset’s history.</Body>
      <Problem>{problem}</Problem>
      <Button onPress={() => { void send(); }} busy={busy}>Send report</Button>
      <Button kind="plain" onPress={() => router.back()} disabled={busy}>Cancel</Button>
    </Screen>
  );
}
