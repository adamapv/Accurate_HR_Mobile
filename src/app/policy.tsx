// A company policy: read it, and acknowledge it by typing your full name. What the person is told as they confirm, and what is said once they have, are the web
// app's own words (shared/field-core.js). Acknowledging needs signal: the answer is the record.
import { useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { acknowledgedText, confirmNote } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtDate } from '@/lib/dates';
import { RichText } from '@/rich';
import type { Policy } from '@/app/(tabs)/safety';
import { Body, Button, Card, Field, Loading, Problem, Screen, Title } from '@/ui';

export default function PolicyScreen() {
  const { state, api, changed } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const policies = useRead<{ rows: Policy[] }>('/policies/mine');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (!policies.data) return policies.error ? <Screen centered><Problem>{policies.error}</Problem><Button kind="plain" onPress={() => router.back()}>Back</Button></Screen> : <Loading />;
  const policy = policies.data.rows.find(p => p.id === id);
  if (!policy) return <Redirect href="/" />;

  const acknowledge = async () => {
    if (!name.trim()) return setProblem('Type your full name to confirm');
    setBusy(true); setProblem('');
    try {
      await api(`/policies/${policy.id}/acknowledge`, { method: 'POST', body: { signature_name: name.trim() } });
      await policies.reload();
      changed();
      router.back();
    } catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); setBusy(false); }
  };
  return (
    <Screen>
      <Title>{policy.title}</Title>
      {!!policy.description && <Body tone="muted">{policy.description}</Body>}
      <Card><RichText value={policy.template_body || 'No content provided.'} /></Card>
      {policy.acknowledged_at ? <Body tone="ok">{acknowledgedText(policy, fmtDate) as string}</Body> : (
        <>
          <Field label="Type your full name to confirm" value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" maxLength={120} />
          <Body tone="muted">{confirmNote(false) as string}</Body>
          <Problem>{problem}</Problem>
          <Button onPress={acknowledge} busy={busy}>Acknowledge</Button>
        </>
      )}
      <Button kind="plain" onPress={() => router.back()} disabled={busy}>{policy.acknowledged_at ? 'Close' : 'Cancel'}</Button>
    </Screen>
  );
}
