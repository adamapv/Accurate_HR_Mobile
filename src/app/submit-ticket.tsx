// Send a ticket in for review: a new one (chosen from the company's list, or named by hand) or, with ?renew=<id>, a renewal of one on the record. Photos of the
// card are taken with the camera; what is printed on it is typed in. An admin checks it before it goes on the record. How it is named, what stands in its way
// and what it is sent as are the web app's own rules (shared/field-core.js). It needs signal.
import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { OTHER_TICKET, TICKET_SENT, ticketDraft, ticketFormStart, ticketHead, ticketNamed, ticketProblem } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { uploadPhoto } from '@/lib/upload';
import { ChooseField, WhenField } from '@/pickers';
import { Body, Button, Card, Field, Problem, Screen, Title } from '@/ui';

type Qual = { id: string; title: string; category: string | null; issuing_body: string | null };
type Name = { id: string; name: string; category: string };
type Form = { issuing_body: string; qualification_number: string; issued_date: string; expiry_date: string; notes: string };
type Photo = { uri: string; r2_key: string; file_name: string; mime_type: string; file_size_bytes: number };
const MAX_PHOTOS = 4;

export default function SubmitTicket() {
  const { state, api, changed, sessionId } = useSession();
  const { renew } = useLocalSearchParams<{ renew?: string }>();
  const quals = useRead<{ rows: Qual[] }>(renew ? '/qualifications/mine' : null);
  const names = useRead<{ rows: Name[] }>(renew ? null : '/ticket-types/names');
  const renews = renew ? (quals.data?.rows || []).find(q => q.id === renew) || null : null;
  const [pick, setPick] = useState('');
  const [other, setOther] = useState('');
  const [form, setForm] = useState<Form>(() => ticketFormStart(null) as Form);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState('');
  const [sent, setSent] = useState(false);
  // A renewal opens with who issued the old card, once the record has arrived.
  useEffect(() => { if (renews) setForm(f => f.issuing_body ? f : { ...f, issuing_body: (ticketFormStart(renews) as Form).issuing_body }); }, [renews?.id]);
  if (state.status !== 'signedIn') return <Redirect href="/" />;

  const snap = async () => {
    setProblem('');
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setProblem('Allow the camera to take a photo of the card.');
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    const a = shot.canceled ? null : shot.assets?.[0];
    if (!a) return;
    setUploading(true);
    try {
      const file_name = `card-${photos.length + 1}.jpg`, mime_type = a.mimeType || 'image/jpeg';
      const r2_key = await uploadPhoto(api, sessionId(), a.uri, mime_type, '/documents/upload-url', file_name);
      setPhotos(p => [...p, { uri: a.uri, r2_key, file_name, mime_type, file_size_bytes: a.fileSize || 0 }]);
    } catch (e) { setProblem(e instanceof Error ? e.message : 'Upload failed. Try again.'); }
    setUploading(false);
  };
  const named = ticketNamed({ renews, pick, other, names: names.data?.rows || [] }) as { title: string; category: string };
  const send = async () => {
    const bad = ticketProblem(named.title, photos.length) as string;
    if (bad) return setProblem(bad);
    setBusy(true); setProblem('');
    try {
      await api('/qualifications/submissions', { method: 'POST', body: ticketDraft({ renews, named, form, files: photos.map(({ uri: _uri, ...file }) => file) }) });
      setSent(true); changed();
    } catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy(false);
  };

  if (sent) {
    return (
      <Screen centered>
        <Title>{TICKET_SENT as string}</Title>
        <Body tone="muted">An admin checks it before it goes on your record.</Body>
        <Button onPress={() => router.back()}>Done</Button>
      </Screen>
    );
  }
  if (renew && !renews) {
    return (
      <Screen>
        <Title>Renew a ticket</Title>
        <Problem>{quals.error || (quals.data ? 'That ticket isn’t on your record.' : '')}</Problem>
        {!quals.data && !quals.error && <Body tone="muted">Loading…</Body>}
        <Button kind="plain" onPress={() => router.back()}>Back</Button>
      </Screen>
    );
  }
  const head = ticketHead(renews) as { title: string; sub: string };
  const options = [...(names.data?.rows || []).map(n => ({ key: n.id, title: n.name, item: n.name })), { key: OTHER_TICKET as string, title: 'Something else…', item: OTHER_TICKET as string }];
  return (
    <Screen>
      <Title>{head.title}</Title>
      <Body tone="muted">{head.sub}</Body>
      {!renews && <ChooseField<string> label="Which ticket?" placeholder={names.data ? 'Choose…' : 'Loading…'} value={pick === OTHER_TICKET ? 'Something else…' : pick} options={options}
        search={q => options.filter(o => o.title.toLowerCase().includes(q.trim().toLowerCase()))} onChoose={setPick} />}
      {!renews && pick === OTHER_TICKET && <Field label="What is it called?" value={other} onChangeText={setOther} placeholder="e.g. Forklift licence" maxLength={120} />}
      <Body>Photos of the card</Body>
      {photos.map((p, i) => (
        <Card key={p.r2_key}>
          <Image source={{ uri: p.uri }} style={{ width: '100%', height: 180, borderRadius: 8 }} resizeMode="contain" accessibilityLabel={`Photo ${i + 1} of the card`} />
          <Button kind="plain" onPress={() => setPhotos(ps => ps.filter(x => x.r2_key !== p.r2_key))} disabled={busy}>Remove</Button>
        </Card>
      ))}
      {photos.length < MAX_PHOTOS && <Button kind="plain" onPress={() => { void snap(); }} busy={uploading} disabled={busy}>{photos.length ? 'Take another photo' : 'Take a photo of the card'}</Button>}
      <Field label="Card / licence number" value={form.qualification_number} onChangeText={v => setForm(f => ({ ...f, qualification_number: v }))} maxLength={80} autoCapitalize="characters" />
      <Field label="Issued by" value={form.issuing_body} onChangeText={v => setForm(f => ({ ...f, issuing_body: v }))} maxLength={120} />
      <WhenField label="Issued" mode="date" value={form.issued_date} onChange={v => setForm(f => ({ ...f, issued_date: v }))} placeholder="Not set" />
      <View style={{ gap: 4 }}>
        <WhenField label="Expires (leave blank if none)" mode="date" value={form.expiry_date} onChange={v => setForm(f => ({ ...f, expiry_date: v }))} placeholder="No expiry" />
        {!!form.expiry_date && <Button kind="plain" onPress={() => setForm(f => ({ ...f, expiry_date: '' }))}>Clear the expiry date</Button>}
      </View>
      <Field label="Anything else? (optional)" value={form.notes} onChangeText={v => setForm(f => ({ ...f, notes: v }))} multiline maxLength={1000} />
      <Problem>{problem || names.error}</Problem>
      <Button onPress={() => { void send(); }} busy={busy} disabled={uploading}>Send for review</Button>
      <Button kind="plain" onPress={() => router.back()} disabled={busy}>Cancel</Button>
    </Screen>
  );
}
