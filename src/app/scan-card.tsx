// Scan a card: choose the ticket, take a photo of the card (and its back), and its number and dates are read off the photo for the person to check. Nothing
// is saved until they say so; what they check is then sent in for an admin to approve, as Submit a ticket does. When the photo can be read, what the form
// opens with, a name on the card that is not theirs, the choice between renewing and adding, what is sent and every word are the web app's own rules
// (shared/field-core.js). It is offered only where the company has reading photos switched on. It needs signal.
import { useState } from 'react';
import { Image, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { OTHER_TICKET, SCAN_ABOUT, SCAN_FIELDS, SCAN_MAX_PHOTOS, SCAN_TITLE, SCAN_TOO_MANY, SCAN_WORDS, scanCanRead, scanCheck, scanFields, scanFormStart, scanHeld, scanMismatch, scanModes, scanModeStart, scanReadDraft, scanSaid, scanSaveLabel,
  scanSubmitDraft, scanUnsure, ticketNamed } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtDate } from '@/lib/dates';
import { uploadPhoto } from '@/lib/upload';
import { ChooseField, WhenField } from '@/pickers';
import { Tick } from '@/whs';
import { Body, Button, Card, Choice, Field, Notice, Problem, Screen, Title } from '@/ui';

type Name = { id: string; name: string; category: string };
type Shot = { uri: string; data: string; mime: string; size: number };
type CardRead = { qualification_number: string | null; expiry_date: string | null; issued_date: string | null; issuing_body: string | null; holder_name: string | null; unsure?: string[]; name_ok?: boolean;
  replaces: { id: string; title: string; qualification_number: string | null; expiry_date: string | null } | null };
type Form = Record<string, string>;
const WORDS = SCAN_WORDS as Record<string, string>;
const day = (d: string) => fmtDate(String(d).slice(0, 10));

export default function ScanCard() {
  const { state, api, changed, sessionId } = useSession();
  const names = useRead<{ rows: Name[] }>('/ticket-types/names');
  const [pick, setPick] = useState('');
  const [other, setOther] = useState('');
  const [photos, setPhotos] = useState<Shot[]>([]);
  const [found, setFound] = useState<CardRead | null>(null);
  const [form, setForm] = useState<Form>(scanFormStart(null) as Form);
  const [mode, setMode] = useState('new');
  const [rightPerson, setRightPerson] = useState(false);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const [sent, setSent] = useState('');
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (!state.me.card_reader_configured) return <Redirect href="/quals" />;
  if (sent) return <Screen centered><Title>{sent}</Title><Body tone="muted">An admin checks it before it goes on your record.</Body><Button onPress={() => router.back()}>Done</Button></Screen>;
  const named = ticketNamed({ renews: null, pick, other, names: names.data?.rows || [] }) as { title: string; category: string };
  const options = [...(names.data?.rows || []).map(n => ({ key: n.id, title: n.name, item: n.name })), { key: OTHER_TICKET as string, title: 'Something else…', item: OTHER_TICKET as string }];

  const snap = async () => {
    setProblem('');
    if (photos.length >= (SCAN_MAX_PHOTOS as number)) return setProblem(SCAN_TOO_MANY as string);
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setProblem('Allow the camera to take a photo of the card.');
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.4, base64: true });
    const a = shot.canceled ? null : shot.assets?.[0];
    if (!a?.base64) return;
    setPhotos(p => [...p, { uri: a.uri, data: `data:image/jpeg;base64,${a.base64}`, mime: 'image/jpeg', size: a.fileSize || 0 }]);
  };
  const read = async () => {
    setBusy('reading'); setProblem('');
    try {
      const files = photos.map((p, n) => ({ name: `card-${n + 1}.jpg`, media_type: p.mime, data: p.data }));
      const res = await api<{ card: CardRead }>('/qualifications/read', { method: 'POST', body: scanReadDraft({ employeeId: undefined, title: named.title, files }) });
      setForm(scanFormStart(res.card) as Form); setMode(scanModeStart(res.card) as string); setRightPerson(false); setFound(res.card);
    } catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy('');
  };
  const save = async () => {
    if (!found) return;
    setBusy('saving'); setProblem('');
    try {
      const ups = [];
      for (const [n, p] of photos.entries()) {
        const file_name = `card-${n + 1}.jpg`;
        ups.push({ r2_key: await uploadPhoto(api, sessionId(), p.uri, p.mime, '/documents/upload-url', file_name), file_name, mime_type: p.mime, file_size_bytes: p.size });
      }
      await api('/qualifications/submissions', { method: 'POST', body: scanSubmitDraft({ mode, card: found, fields: scanFields({ title: named.title, category: named.category, form }), files: ups }) });
      changed(); setSent(scanSaid(null, named.title) as string);
    } catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy('');
  };
  const pictures = (
    <>
      {photos.map((p, i) => (
        <Card key={p.uri}>
          <Image source={{ uri: p.uri }} style={{ width: '100%', height: 170, borderRadius: 8 }} resizeMode="contain" accessibilityLabel={`Photo ${i + 1} of the card`} />
          {!found && <Button kind="plain" onPress={() => setPhotos(ps => ps.filter(x => x !== p))} disabled={!!busy}>Remove</Button>}
        </Card>
      ))}
    </>
  );

  if (!found) {
    return (
      <Screen>
        <Title>{SCAN_TITLE as string}</Title>
        <Notice tone="info">{SCAN_ABOUT as string}</Notice>
        <ChooseField<string> label={WORDS.ticket} placeholder={names.data ? 'Choose…' : 'Loading…'} value={pick === OTHER_TICKET ? 'Something else…' : pick} options={options}
          search={q => options.filter(o => o.title.toLowerCase().includes(q.trim().toLowerCase()))} onChoose={setPick} />
        {pick === OTHER_TICKET && <Field label={WORDS.other} value={other} onChangeText={setOther} placeholder={WORDS.otherExample} maxLength={120} />}
        <Body>{WORDS.photo}</Body>
        {pictures}
        {photos.length < (SCAN_MAX_PHOTOS as number) && <Button kind="plain" icon="camera-outline" onPress={() => { void snap(); }} disabled={!!busy}>{photos.length ? 'Take a photo of the back' : 'Take a photo of the card'}</Button>}
        {busy === 'reading' && <Body tone="muted">{WORDS.reading}</Body>}
        <Problem>{problem || names.error}</Problem>
        <Button onPress={() => { void read(); }} busy={busy === 'reading'} disabled={!(scanCanRead({ title: named.title, photos: photos.length, needsPerson: false, employee: null }) as boolean)}>{WORDS.read}</Button>
        <Button kind="plain" onPress={() => router.back()} disabled={!!busy}>Cancel</Button>
      </Screen>
    );
  }
  const mismatch = scanMismatch(found, null) as string;
  return (
    <Screen>
      <Title>{named.title}</Title>
      <Notice tone="info">{scanCheck(null) as string}</Notice>
      {!!mismatch && <Notice tone="danger">{mismatch}</Notice>}
      {!!mismatch && <Tick label={WORDS.rightPerson} value={rightPerson} onChange={setRightPerson} />}
      {found.replaces && (
        <View style={{ gap: 8 }}>
          <Body>{WORDS.thisCard}</Body>
          <Choice options={[{ key: 'renew', label: 'Renews it' }, { key: 'new', label: 'An extra card' }]} value={mode} onChange={setMode} disabled={!!busy} />
          <Body tone="muted">{(scanModes(found.replaces, day) as [string, string][]).find(m => m[0] === mode)?.[1]}</Body>
        </View>
      )}
      {pictures}
      {(SCAN_FIELDS as [string, string, string?][]).map(([key, label, type]) => (
        <View key={key} style={{ gap: 4 }}>
          {type === 'date'
            ? <WhenField label={label} mode="date" value={form[key] || ''} onChange={v => setForm(f => ({ ...f, [key]: v }))} placeholder="Not set" />
            : <Field label={label} value={form[key] || ''} onChangeText={v => setForm(f => ({ ...f, [key]: v }))} maxLength={120} />}
          {(scanUnsure(found, key) as boolean) && <Body tone="danger">{WORDS.unsure}</Body>}
          {type === 'date' && !!form[key] && <Button kind="plain" onPress={() => setForm(f => ({ ...f, [key]: '' }))} disabled={!!busy}>Clear this date</Button>}
        </View>
      ))}
      <Field label={WORDS.notes} value={form.notes || ''} onChangeText={v => setForm(f => ({ ...f, notes: v }))} multiline maxLength={1000} />
      <Problem>{problem}</Problem>
      <Button onPress={() => { void save(); }} busy={busy === 'saving'} disabled={!!busy || (scanHeld(found, rightPerson) as boolean)}>{scanSaveLabel(null, mode) as string}</Button>
      <Button kind="plain" onPress={() => { setFound(null); setProblem(''); }} disabled={!!busy}>{WORDS.back}</Button>
    </Screen>
  );
}
