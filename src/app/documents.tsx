// My documents: the three figures over them, the ones waiting on the person (Sign or Acknowledge with a typed name), and everything else on file, each with its
// file to open where it has one. What waits, what each says, where it stands and what can be done are the web app's own rules (shared/field-core.js).
// A contract is read and signed on its own page, which the app does not have yet.
import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { can } from '@shared/access.js';
import { docActions, docExpired, docMeta, DOCS_ALL_SIGNED, DOCS_HEADING, DOCS_NOT_YOURS, docsOnFile, docStatus, docsToDo, docTiles, NO_DOCS } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtDate, fmtTime, isoLocal, localToday, parseDay } from '@/lib/dates';
import { openFile } from '@/lib/open-file';
import { Body, Button, Card, Empty, Figures, Heading, Notice, Pill, Problem, Screen, Title, type Figure } from '@/ui';

export type Doc = { id: string; title: string; doc_type: string; description: string | null; issued_date: string | null; expiry_date: string | null; requires_signature: number; signed_at: string | null; acknowledged_at: string | null; contract_id: string | null; r2_key: string | null; mime_type: string | null };
type Tile = { key: string; label: string; value: number; sub: string; tone?: 'warn' };
type Acts = { confirm: { kind: 'contract' | 'sign' | 'acknowledge'; label: string } | null; view: boolean; download: boolean };
const day = (d: string) => fmtDate(String(d).slice(0, 10));

export default function Documents() {
  const { state, sessionId } = useSession();
  const allowed = state.status === 'signedIn' && can(state.me.access, 'documents');
  const docs = useRead<{ rows: Doc[] }>(allowed ? `/documents?employee_id=${encodeURIComponent(state.me.employee.id)}` : null);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (!allowed) return <Screen><Title>My documents</Title><Body tone="muted">{DOCS_NOT_YOURS as string}</Body><Button kind="plain" onPress={() => router.back()}>Back</Button></Screen>;
  const today = localToday(), soonDate = parseDay(today);
  soonDate.setDate(soonDate.getDate() + 30);
  const rows = docs.data?.rows;
  const toDo = docsToDo(rows || []) as Doc[], onFile = docsOnFile(rows || []) as Doc[];
  const open = async (d: Doc) => {
    setBusy(d.id); setProblem('');
    try { await openFile(sessionId(), `/documents/${d.id}/download`, d.title, d.mime_type); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Couldn’t open the file.'); }
    setBusy('');
  };
  const row = (d: Doc) => {
    const acts = docActions(d) as Acts;
    return (
      <Card key={d.id}>
        <Body strong>{d.title}</Body>
        <Body tone={docExpired(d, today) ? 'danger' : 'muted'}>{docMeta(d, today, day) as string}</Body>
        <Pill tone={d.signed_at || d.acknowledged_at ? 'ok' : d.requires_signature ? 'warn' : 'neutral'}>{docStatus(d) as string}</Pill>
        {acts.confirm && acts.confirm.kind !== 'contract' && <Button onPress={() => router.push(`/sign-document?id=${encodeURIComponent(d.id)}`)} disabled={!!busy}>{acts.confirm.label}</Button>}
        {(acts.view || acts.confirm?.kind === 'contract') && <Body tone="muted">{acts.view ? 'This is a contract. View and print it in the Field view in your browser for now.' : 'This is a contract. Read and sign it in the Field view in your browser for now.'}</Body>}
        {acts.download && <Button kind="plain" icon="open-outline" onPress={() => { void open(d); }} busy={busy === d.id} disabled={!!busy}>Open the file</Button>}
      </Card>
    );
  };
  return (
    <Screen>
      <Title>My documents</Title>
      {docs.offlineAt !== null && <Notice tone="warn" icon="cloud-offline-outline">{`No signal. Showing what was saved at ${fmtTime(docs.offlineAt)}.`}</Notice>}
      <Problem>{problem || docs.error}</Problem>
      {!!rows && rows.length > 0 && (
        <Figures figures={docTiles(rows, isoLocal(soonDate)) as Figure[]} />
      )}
      {toDo.length > 0 && <Heading>Needs your signature</Heading>}
      {toDo.map(row)}
      <Heading>{DOCS_HEADING(toDo.length > 0) as string}</Heading>
      {!rows ? (docs.error ? null : <Body tone="muted">Loading…</Body>)
        : rows.length === 0 ? <Empty>{NO_DOCS as string}</Empty>
        : onFile.length === 0 ? <Empty>{DOCS_ALL_SIGNED as string}</Empty>
        : onFile.map(row)}
    </Screen>
  );
}
