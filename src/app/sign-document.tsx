// Sign or acknowledge one of the person's own documents (?id=<document>) by typing their full name. What it is called, what stands in the way, what is sent and
// what the person is told as they confirm are the web app's own rules (shared/field-core.js). It needs signal: the answer is the record.
import { useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { CONFIRM_NAME_LABEL, confirmDraft, confirmHead, confirmNote, confirmProblem, docConfirmPath, docOpen } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import type { Doc } from '@/app/documents';
import { Body, Button, Field, Loading, Problem, Screen, Title } from '@/ui';

export default function SignDocument() {
  const { state, api, changed } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const docs = useRead<{ rows: Doc[] }>(state.status === 'signedIn' ? `/documents?employee_id=${encodeURIComponent(state.me.employee.id)}` : null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (!docs.data) return docs.error ? <Screen centered><Problem>{docs.error}</Problem><Button kind="plain" onPress={() => router.back()}>Back</Button></Screen> : <Loading />;
  const doc = docs.data.rows.find(d => d.id === id);
  if (!doc || doc.contract_id || !docOpen(doc)) return <Redirect href="/documents" />;
  const sign = !!doc.requires_signature, head = confirmHead(sign) as { title: string; label: string };
  const confirm = async () => {
    const bad = confirmProblem(name) as string;
    if (bad) return setProblem(bad);
    setBusy(true); setProblem('');
    try { await api(docConfirmPath(doc) as string, { method: 'POST', body: confirmDraft(name) }); changed(); router.back(); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); setBusy(false); }
  };
  return (
    <Screen>
      <Title>{head.title}</Title>
      <Body>{doc.title}</Body>
      {!!doc.description && <Body tone="muted">{doc.description}</Body>}
      <Field label={CONFIRM_NAME_LABEL as string} value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" maxLength={120} placeholder="Full name" />
      <Body tone="muted">{confirmNote(sign) as string}</Body>
      <Problem>{problem}</Problem>
      <Button onPress={() => { void confirm(); }} busy={busy}>{head.label}</Button>
      <Button kind="plain" onPress={() => router.back()} disabled={busy}>Cancel</Button>
    </Screen>
  );
}
