// Fill in one form (?id=<form>): each question in the box its kind asks for, with the person's earlier answers filled in. A file question takes a photo with the
// camera. The box for each kind, a required question's star, an answer kept on the person's record, what stands in the way of saving and what is sent are the web
// app's own rules (shared/field-core.js). It needs signal.
import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { ANSWERS_SAVED, fieldBox, fieldLabel, fieldShown, fileAnswer, formDraft, formFilePath, formProblem, SAVED_PLACEHOLDER, savedOnRecord } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { openFile } from '@/lib/open-file';
import { uploadPhoto } from '@/lib/upload';
import { ChooseField, WhenField } from '@/pickers';
import { Body, Button, Card, Field, Loading, Problem, Screen, Title } from '@/ui';

type Question = { id: string; field_type: string; label: string; help_text: string | null; options: string[] | null; required: number };
type FileValue = { r2_key: string; file_name: string; file_size_bytes: number; mime_type: string };
type Answer = string | boolean | FileValue | null | undefined;
type Box = { kind: string; keyboard?: 'number' | 'email' | 'tel' | 'text' };
const KEYBOARD = { number: 'decimal-pad', email: 'email-address', tel: 'phone-pad', text: 'default' } as const;

export default function FormScreen() {
  const { state, api, changed, sessionId } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const def = useRead<{ form: { title: string; description: string | null }; fields: Question[] }>(id ? `/forms/${id}` : null);
  const mine = useRead<{ answers: Record<string, Answer> }>(id ? `/forms/${id}/mine` : null);
  const [answers, setAnswers] = useState<Record<string, Answer> | null>(null);
  const [busy, setBusy] = useState(false);
  const [working, setWorking] = useState('');
  const [problem, setProblem] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (mine.data && !answers) setAnswers(mine.data.answers || {}); }, [mine.data, answers]);
  if (state.status !== 'signedIn' || !id) return <Redirect href="/" />;
  if (saved) return <Screen centered><Title>{ANSWERS_SAVED as string}</Title><Button onPress={() => router.back()}>Done</Button></Screen>;
  if (!def.data || !answers) return def.error || mine.error ? <Screen centered><Problem>{def.error || mine.error}</Problem><Button kind="plain" onPress={() => router.back()}>Back</Button></Screen> : <Loading />;

  const set = (fieldId: string, v: Answer) => setAnswers(a => ({ ...(a || {}), [fieldId]: v }));
  const snap = async (q: Question) => {
    setProblem('');
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setProblem('Allow the camera to take a photo.');
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    const a = shot.canceled ? null : shot.assets?.[0];
    if (!a) return;
    setWorking(q.id);
    try {
      const file_name = 'photo.jpg', mime_type = a.mimeType || 'image/jpeg';
      const r2_key = await uploadPhoto(api, sessionId(), a.uri, mime_type, '/documents/upload-url', file_name);
      set(q.id, fileAnswer({ r2_key, file_name, file_size_bytes: a.fileSize || 0, mime_type }) as FileValue);
    } catch (e) { setProblem(e instanceof Error ? e.message : 'Upload failed. Try again.'); }
    setWorking('');
  };
  const open = async (q: Question, v: FileValue) => {
    setWorking(q.id); setProblem('');
    try { await openFile(sessionId(), formFilePath(id, q.id) as string, v.file_name, v.mime_type); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Couldn’t open the file.'); }
    setWorking('');
  };
  const save = async () => {
    const bad = formProblem(def.data!.fields, answers) as string;
    if (bad) return setProblem(bad);
    setBusy(true); setProblem('');
    try { await api(`/forms/${id}/submit`, { method: 'PUT', body: formDraft(answers) }); setSaved(true); changed(); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy(false);
  };
  // A file already saved with the form can be opened; one just taken is only on its way.
  const savedFiles = mine.data?.answers || {};

  const box = (q: Question) => {
    const kind = fieldBox(q) as Box, v = answers[q.id], label = fieldLabel(q) as string;
    if (kind.kind === 'textarea') return <Field label={label} value={String(v || '')} onChangeText={t => set(q.id, t)} multiline maxLength={4000} />;
    if (kind.kind === 'select' || kind.kind === 'radio') {
      return <ChooseField<string> label={label} placeholder="Choose" value={String(v || '')} options={(q.options || []).map(o => ({ key: o, title: o, item: o }))} onChoose={o => set(q.id, o)} />;
    }
    if (kind.kind === 'checkbox') {
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}><Body>{label}</Body></View>
          <Switch accessibilityLabel={label} value={!!v} onValueChange={on => set(q.id, on)} />
        </View>
      );
    }
    if (kind.kind === 'date') {
      return (
        <View style={{ gap: 4 }}>
          <WhenField label={label} mode="date" value={/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : ''} onChange={d => set(q.id, d)} placeholder="Not set" />
          {!!v && <Button kind="plain" onPress={() => set(q.id, '')}>Clear the date</Button>}
        </View>
      );
    }
    if (kind.kind === 'file') {
      const file = v && typeof v === 'object' ? v : null, kept = savedFiles[q.id] && typeof savedFiles[q.id] === 'object' ? savedFiles[q.id] as FileValue : null;
      return (
        <Card>
          <Body>{label}</Body>
          {!!file && <Body tone="ok">{file.file_name}</Body>}
          {!!file && !!kept && kept.r2_key === file.r2_key && <Button kind="plain" onPress={() => { void open(q, file); }} busy={working === q.id} disabled={!!working || busy}>Open the file</Button>}
          <Button kind="plain" onPress={() => { void snap(q); }} busy={working === q.id && !file} disabled={!!working || busy}>{file ? 'Take a new photo' : 'Take a photo'}</Button>
        </Card>
      );
    }
    return <Field label={label} value={String(fieldShown(v) as string)} onChangeText={t => set(q.id, t)} keyboardType={KEYBOARD[kind.keyboard || 'text']} autoCapitalize={kind.keyboard === 'email' ? 'none' : 'sentences'}
      placeholder={savedOnRecord(v) ? (SAVED_PLACEHOLDER as string) : undefined} maxLength={1000} />;
  };
  return (
    <Screen>
      <Title>{def.data.form.title}</Title>
      {!!def.data.form.description && <Body tone="muted">{def.data.form.description}</Body>}
      {def.data.fields.map(q => (fieldBox(q) as Box).kind === 'section' ? <Title key={q.id}>{q.label}</Title> : (
        <View key={q.id} style={{ gap: 4 }}>
          {box(q)}
          {!!q.help_text && <Body tone="muted">{q.help_text}</Body>}
        </View>
      ))}
      <Problem>{problem}</Problem>
      <Button onPress={() => { void save(); }} busy={busy} disabled={!!working}>Save answers</Button>
      <Button kind="plain" onPress={() => router.back()} disabled={busy}>Close</Button>
    </Screen>
  );
}
