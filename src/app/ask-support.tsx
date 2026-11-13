// Ask for help: a few words, what happened, and up to three photos, sent to the product's own support team. What it needs, what is sent and the words are the
// web app's own rules (shared/field-core.js). It needs signal, and opens the new request once it is sent.
import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { SUPPORT_BODY_MAX, SUPPORT_NEW, SUPPORT_SUBJECT_MAX, SUPPORT_WARNING, supportCanSend, supportDraft, supportFormStart } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { SupportPics, type Pic } from '@/support';
import { Body, Button, Field, Notice, Problem, Screen, Title } from '@/ui';

const WORDS = SUPPORT_NEW as { title: string; subject: string; subjectExample: string; body: string; bodyHint: string; send: string; sent: string };

export default function AskSupport() {
  const { state, api, changed } = useSession();
  const [form, setForm] = useState(supportFormStart() as { subject: string; body: string });
  const [pics, setPics] = useState<Pic[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  const send = async () => {
    setBusy(true); setProblem('');
    try {
      const r = await api<{ id: string }>('/support/requests', { method: 'POST', body: supportDraft(form, pics.map(p => p.id)) });
      changed();
      router.replace(`/support-request?id=${encodeURIComponent(r.id)}`);
    } catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); setBusy(false); }
  };
  return (
    <Screen>
      <Title>{WORDS.title}</Title>
      <Notice tone="info">{SUPPORT_WARNING as string}</Notice>
      <Field label={WORDS.subject} placeholder={WORDS.subjectExample} value={form.subject} onChangeText={v => setForm({ ...form, subject: v })} maxLength={SUPPORT_SUBJECT_MAX as number} />
      <Field label={WORDS.body} value={form.body} onChangeText={v => setForm({ ...form, body: v })} multiline maxLength={SUPPORT_BODY_MAX as number} />
      <Body tone="muted">{WORDS.bodyHint}</Body>
      <SupportPics pics={pics} onChange={setPics} onBusy={setUploading} disabled={busy} />
      <Problem>{problem}</Problem>
      <Button onPress={() => { void send(); }} busy={busy} disabled={uploading || !(supportCanSend(form) as boolean)}>{WORDS.send}</Button>
      <Button kind="plain" onPress={() => router.back()} disabled={busy}>Cancel</Button>
    </Screen>
  );
}
