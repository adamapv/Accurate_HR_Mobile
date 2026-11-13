// One expense claim: its date and description, its lines, and what can still be done with it (add or delete a line, send it, delete a draft). Opened with no id it is
// a new claim, made at once so lines can go on it, and not kept if it is left with nothing in it. When it can be changed, what it is called, the questions asked
// first and what each line says are the web app's own rules (shared/field-core.js). It needs signal.
import { useEffect, useRef, useState } from 'react';
import { Alert, Image, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { CLAIM_SENT, claimDeleteConfirm, claimEditable, claimIsEmpty, claimLineJob, claimLineMeta, claimPaidText, claimSentBack, claimSubmitLabel, claimTitle, LINE_DELETE_CONFIRM, simproCostText } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { API_URL } from '@/lib/config';
import { fmtDate, localToday } from '@/lib/dates';
import { fmtMoney } from '@/lib/money';
import { CLAIM_STATUS } from '@/lib/claims';
import { WhenField } from '@/pickers';
import { Body, Button, Card, Field, Heading, Notice, Pill, Problem, Screen, Title } from '@/ui';

type Claim = { id: string; claim_date: string; description: string | null; status: string; total_cents: number; decision_note: string | null; payment_reference: string | null; paid_at: string | null };
type Line = { id: string; description: string; line_date: string; amount_cents: number; category_name: string | null; mileage_km: number | null; receipt_r2_key: string | null; job_id: string | null; job_label: string | null; cost_centre_label: string | null; simpro_state: string | null; simpro_error: string | null };
type Ask = { title: string; body?: string; confirmLabel: string };
const day = (d: string) => fmtDate(String(d).slice(0, 10));
const isPicture = (key: string) => /\.(jpe?g|png|webp|heic)$/i.test(key);

export default function ClaimScreen() {
  const { state, api, changed, sessionId } = useSession();
  const params = useLocalSearchParams<{ id?: string }>();
  const [id, setId] = useState(params.id || '');
  const detail = useRead<{ claim: Claim; lines: Line[] }>(id ? `/expense-claims/${id}` : null);
  const [head, setHead] = useState<{ claim_date: string; description: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const [sent, setSent] = useState(false);
  const claim = detail.data?.claim, lines = detail.data?.lines || [];

  // A new claim is made straight away, so lines can be attached to it.
  const made = useRef(false), createdHere = useRef(false);
  useEffect(() => {
    if (id || made.current || state.status !== 'signedIn') return;
    made.current = true;
    api<{ id: string }>('/expense-claims', { method: 'POST', body: { claim_date: localToday() } })
      .then(r => { createdHere.current = true; setId(r.id); })
      .catch(e => setProblem(e instanceof Error ? e.message : 'Could not start a claim. Try again.'));
  }, [api, id, state.status]);
  // The date and description as they are being typed, from the claim once it has arrived.
  useEffect(() => { if (claim && !head) setHead({ claim_date: String(claim.claim_date).slice(0, 10), description: claim.description || '' }); }, [claim, head]);
  // Leaving a claim that was started here with nothing in it does not leave an empty draft behind. The server is asked what it holds first, so a line added a
  // moment ago is never lost; a description still being typed is saved instead.
  const latest = useRef({ id, description: '', claim_date: '', gone: false });
  latest.current = { ...latest.current, id, description: head?.description || '', claim_date: head?.claim_date || '' };
  useEffect(() => () => {
    const l = latest.current;
    if (!createdHere.current || l.gone || !l.id) return;
    if (l.description) { void api('/expense-claims', { method: 'PUT', body: { id: l.id, description: l.description, claim_date: l.claim_date } }).then(() => changed(true)).catch(() => {}); return; }
    void api<{ claim: { description: string | null }; lines: unknown[] }>(`/expense-claims/${l.id}`)
      .then(d => claimIsEmpty(d.claim, d.lines) ? api('/expense-claims', { method: 'DELETE', body: { id: l.id } }).then(() => changed(true)) : undefined).catch(() => {});
  }, [api, changed]);
  if (state.status !== 'signedIn') return <Redirect href="/" />;

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key); setProblem('');
    try { await work(); } catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy('');
  };
  const saveHead = (next = head) => { if (id && next) void api('/expense-claims', { method: 'PUT', body: { id, description: next.description, claim_date: next.claim_date } }).then(() => changed(true)).catch(e => setProblem(e instanceof Error ? e.message : 'Could not save.')); };
  const confirm = (ask: Ask, then: () => void) => Alert.alert(ask.title, ask.body, [{ text: 'Cancel', style: 'cancel' }, { text: ask.confirmLabel, style: 'destructive', onPress: then }]);
  const deleteLine = (lineId: string) => confirm(LINE_DELETE_CONFIRM as Ask, () => { void run(lineId, async () => { await api('/expense-lines', { method: 'DELETE', body: { id: lineId } }); changed(); }); });
  const deleteClaim = () => confirm(claimDeleteConfirm(lines) as Ask, () => { void run('delete', async () => { await api('/expense-claims', { method: 'DELETE', body: { id } }); latest.current.gone = true; changed(); router.back(); }); });
  const submit = () => run('submit', async () => {
    if (head) await api('/expense-claims', { method: 'PUT', body: { id, description: head.description, claim_date: head.claim_date } });
    await api(`/expense-claims/${id}/submit`, { method: 'POST', body: {} });
    setSent(true); changed();
  });

  if (sent) {
    return (
      <Screen centered>
        <Title>{CLAIM_SENT as string}</Title>
        <Button onPress={() => router.back()}>Done</Button>
      </Screen>
    );
  }
  if (!claim || !head) {
    return (
      <Screen>
        <Title>{id ? 'Claim' : 'New claim'}</Title>
        <Problem>{problem || detail.error}</Problem>
        {!problem && !detail.error && <Body tone="muted">Loading…</Body>}
      </Screen>
    );
  }
  const editable = claimEditable(claim) as boolean;
  const sentBack = claimSentBack(claim) as string, paid = claimPaidText(claim, day) as string;
  const receipt = (key: string) => ({ uri: `${API_URL.replace(/\/+$/, '')}/api/hr/expense-receipts/${encodeURIComponent(key)}`, headers: sessionId() ? { Authorization: `Bearer ${sessionId()}` } : undefined });
  return (
    <Screen>
      <Title>{claimTitle(claim, fmtMoney) as string}</Title>
      <Pill tone={claim.status === 'rejected' ? 'danger' : claim.status === 'approved' || claim.status === 'paid' ? 'ok' : claim.status === 'submitted' ? 'warn' : 'neutral'}>{CLAIM_STATUS[claim.status] || claim.status}</Pill>
      {!!sentBack && <Notice tone="danger">{sentBack}</Notice>}
      {!!paid && <Notice tone="ok">{paid}</Notice>}
      {editable ? (
        <View style={{ gap: 12 }}>
          <WhenField label="Claim date" mode="date" value={head.claim_date} maxDate={localToday()} onChange={v => { const next = { ...head, claim_date: v }; setHead(next); saveHead(next); }} />
          <Field label="Description" value={head.description} onChangeText={v => setHead({ ...head, description: v })} onBlur={() => saveHead()} placeholder="e.g. Coles site materials" maxLength={200} />
        </View>
      ) : (
        <Card>
          <Body>{head.description || 'No description'}</Body>
          <Body tone="muted">{day(head.claim_date)}</Body>
        </Card>
      )}
      <Heading>Lines ({lines.length})</Heading>
      {editable && <Button kind="plain" icon="add-circle-outline" onPress={() => { saveHead(); router.push(`/claim-line?claim=${encodeURIComponent(id)}`); }} disabled={!!busy}>Add line</Button>}
      {lines.length === 0 ? <Body tone="muted">No lines yet.</Body> : lines.map(l => {
        const cost = l.job_id ? simproCostText(l.simpro_state, l.simpro_error) as { text: string; failed: boolean } | null : null;
        return (
          <Card key={l.id}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flex: 1 }}><Body strong>{l.description}</Body></View>
              <Body strong>{fmtMoney(l.amount_cents)}</Body>
            </View>
            <Body tone="muted">{claimLineMeta(l, day) as string}</Body>
            {!!l.job_id && <Body tone="muted">{claimLineJob(l) as string}</Body>}
            {!!cost && <Body tone={cost.failed ? 'danger' : 'muted'}>{cost.text}</Body>}
            {!!l.receipt_r2_key && (isPicture(l.receipt_r2_key)
              ? <Image source={receipt(l.receipt_r2_key)} style={{ width: '100%', height: 180, borderRadius: 8 }} resizeMode="cover" accessibilityLabel="Receipt" />
              : <Body tone="muted">Receipt attached</Body>)}
            {editable && <Button kind="plain" onPress={() => deleteLine(l.id)} busy={busy === l.id} disabled={!!busy}>Delete line</Button>}
          </Card>
        );
      })}
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Body tone="muted">Total</Body>
          <Title>{fmtMoney(claim.total_cents)}</Title>
        </View>
      </Card>
      <Problem>{problem || detail.error}</Problem>
      {editable && lines.length > 0 && <Button onPress={() => { void submit(); }} busy={busy === 'submit'} disabled={!!busy}>{claimSubmitLabel(claim) as string}</Button>}
      {editable && claim.status === 'draft' && <Button kind="danger" icon="trash-outline" onPress={deleteClaim} busy={busy === 'delete'} disabled={!!busy}>Delete claim</Button>}
      <Button kind="plain" onPress={() => router.back()} disabled={!!busy}>Close</Button>
    </Screen>
  );
}
