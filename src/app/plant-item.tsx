// The plant form (?id=<item>&mode=take|takeover|return|prestart): take an item, take it over from someone, hand it back, or record the day's pre-start on one
// the person holds. What it asks, when it can be sent, what is sent and what the person is told are the web app's own rules (shared/field-core.js); the Worker
// decides the rest, and its own words are shown when it refuses. A check that is Not OK reports a fault: the item is tagged out of service. It needs signal.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { PLANT_CONDITION_LABEL, PLANT_DEFECT_EXAMPLE, PLANT_DEFECT_LABEL, PLANT_FAIL_NOTE, PLANT_SCHEDULED_TODAY, PLANT_WHERE_EXAMPLE, PLANT_WHERE_FROM_SCHEDULE, PLANT_WHERE_LABEL, plantDraft, plantFailing, plantFaultRecorded,
  plantFormTitle, plantHeld, plantJobText, plantLicenceLabel, plantLikely, plantReadingLabel, plantSaid, plantScheduled, plantSubmitLabel, plantTakeoverHint, PRESTART_ALL_OK, PRESTART_CHOICES, PRESTART_HEAD, PRESTART_MAX_PHOTOS,
  PRESTART_WRONG, prestartAllOk, prestartPhotoLabel, prestartState, RETURN_CONDITIONS } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { localToday } from '@/lib/dates';
import type { PlantItem } from '@/app/plant';
import { PhotoList, Tick, type Photo } from '@/whs';
import { Body, Button, Card, Choice, Field, Heading, Loading, Notice, Problem, Screen, Title } from '@/ui';

type Cfg = { required: boolean; photo_required: boolean; items: string[] };
type Answers = Record<string, { result?: string; note?: string }>;
type Check = { required: boolean; ready: boolean; failed: boolean; prestart: { items: unknown[]; photos: string[] } };
type Sched = { work_date: string; company_id: number; job_id: string | null; job_name: string | null; activity: boolean; plant?: string[] };
const MODES = ['take', 'takeover', 'return', 'prestart'];
const TONES = { pass: 'ok', fail: 'danger', na: 'neutral' } as const;

export default function PlantItemForm() {
  const { state, api, changed } = useSession();
  const { id, mode: asked } = useLocalSearchParams<{ id: string; mode: string }>();
  const mode = MODES.includes(asked || '') ? asked! : 'take';
  const returning = mode === 'return', taking = mode === 'take' || mode === 'takeover';
  const today = localToday();
  const plant = useRead<{ rows: PlantItem[] }>('/plant/available');
  const cfg = useRead<Cfg>(!returning && id ? `/plant/${encodeURIComponent(id)}/prestart-form` : null);
  const sched = useRead<{ rows: Sched[] }>(taking ? `/schedule/mine?from=${today}&to=${today}` : null);
  // The item as it was when the form opened: once it is taken or handed back the list moves it, and the form still has to say what happened.
  const [item, setItem] = useState<PlantItem | null>(null);
  const [hours, setHours] = useState('');
  const [typed, setTyped] = useState<string | null>(null);
  const [licence, setLicence] = useState(false);
  const [condition, setCondition] = useState('good');
  const [defect, setDefect] = useState('');
  const [answers, setAnswers] = useState<Answers>({});
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [said, setSaid] = useState<{ text: string; fault: boolean } | null>(null);
  const found = plant.data?.rows.find(r => r.id === id);
  useEffect(() => { if (found && !item) setItem(found); }, [found, item]);
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (said) return <Screen centered><Title>{said.fault ? 'Fault recorded' : 'Done'}</Title><Body tone={said.fault ? 'danger' : 'fg'}>{said.text}</Body><Button onPress={() => router.back()}>Done</Button></Screen>;
  if (!plant.data) return plant.error ? <Screen centered><Problem>{plant.error}</Problem></Screen> : <Loading />;
  if (!item) return found ? <Loading /> : <Redirect href="/plant" />;

  const check = returning ? null : cfg.data ? prestartState(cfg.data, answers, photos.map(p => p.key), uploading) as Check : null;
  const failing = plantFailing(mode, check) as boolean;
  const scheduled = plantScheduled(sched.data?.rows, today) as Sched[];
  const likely = plantLikely(scheduled, item) as Sched | null;
  const notes = typed ?? (likely ? plantJobText(likely) as string : '');
  const set = (label: string, patch: { result?: string; note?: string }) => setAnswers(a => ({ ...a, [label]: { ...a[label], ...patch } }));

  const send = async () => {
    setBusy(true); setProblem('');
    try {
      const { path, body } = plantDraft({ item, mode, hours, notes, licence, condition, defect, check }) as { path: string; body: object };
      const res = await api(path, { method: 'POST', body });
      setSaid({ text: plantSaid({ item, mode, defect, res }) as string, fault: mode === 'prestart' && (res as { result?: string }).result !== 'pass' });
      changed();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Something went wrong. Try again.';
      // A failed pre-start at check-out is recorded and tagged: it is done, not something to try again.
      if (plantFaultRecorded(failing, message) as boolean) { setSaid({ text: message, fault: true }); changed(); }
      else setProblem(message);
    }
    setBusy(false);
  };

  return (
    <Screen>
      <Title>{plantFormTitle(item, mode) as string}</Title>
      {mode === 'takeover' && <Body tone="muted">{plantTakeoverHint(item) as string}</Body>}
      {!returning && !!item.warning && <Notice tone="warn">{item.warning}</Notice>}
      <Field label={plantReadingLabel(item) as string} value={hours} onChangeText={setHours} keyboardType="decimal-pad" maxLength={12} />

      {returning && (
        <View style={{ gap: 8 }}>
          <Body>{PLANT_CONDITION_LABEL as string}</Body>
          <Choice options={(RETURN_CONDITIONS as [string, string][]).map(([key, label]) => ({ key, label: label.split(' — ')[0], tone: key === 'good' ? 'ok' as const : key === 'fair' ? 'warn' as const : 'danger' as const }))} value={condition} onChange={setCondition} />
          <Field label={PLANT_DEFECT_LABEL as string} placeholder={PLANT_DEFECT_EXAMPLE as string} value={defect} onChangeText={setDefect} multiline maxLength={1000} />
        </View>
      )}

      {taking && (
        <View style={{ gap: 8 }}>
          {scheduled.length > 1 && !likely && (
            <View style={{ gap: 8 }}>
              <Body tone="muted">{PLANT_SCHEDULED_TODAY as string}</Body>
              {scheduled.map(r => <Button key={`${r.company_id}:${r.job_id}`} kind="plain" onPress={() => setTyped(plantJobText(r) as string)}>{plantJobText(r) as string}</Button>)}
            </View>
          )}
          <Field label={PLANT_WHERE_LABEL as string} placeholder={PLANT_WHERE_EXAMPLE as string} value={notes} onChangeText={setTyped} maxLength={200} />
          {typed == null && !!likely && <Body tone="muted">{PLANT_WHERE_FROM_SCHEDULE as string}</Body>}
          {!!item.requires_licence && <Tick label={plantLicenceLabel(item) as string} value={licence} onChange={setLicence} />}
        </View>
      )}

      {!returning && !cfg.data && (cfg.error ? <Problem>{cfg.error}</Problem> : <Body tone="muted">Loading checks…</Body>)}
      {!returning && cfg.data?.required && (
        <View style={{ gap: 10 }}>
          <Heading right={<Button kind="plain" icon="checkmark-done-outline" onPress={() => setAnswers(prestartAllOk(cfg.data) as Answers)}>{PRESTART_ALL_OK as string}</Button>}>{PRESTART_HEAD as string}</Heading>
          {cfg.data.items.map(label => (
            <Card key={label}>
              <Body>{label}</Body>
              <Choice options={(PRESTART_CHOICES as [keyof typeof TONES, string][]).map(([key, text]) => ({ key, label: text, tone: TONES[key] }))} value={(answers[label]?.result || '') as keyof typeof TONES | ''} onChange={v => set(label, { result: v })} />
              {answers[label]?.result === 'fail' && <Field label={PRESTART_WRONG as string} value={answers[label]?.note || ''} onChangeText={v => set(label, { note: v })} maxLength={500} multiline />}
            </Card>
          ))}
          <Body>{prestartPhotoLabel(cfg.data) as string}</Body>
          <PhotoList photos={photos} onChange={setPhotos} onBusy={setUploading} max={PRESTART_MAX_PHOTOS as number} hint="" filename="prestart.jpg" />
        </View>
      )}

      {failing && <Notice tone="danger">{PLANT_FAIL_NOTE as string}</Notice>}
      <Problem>{problem}</Problem>
      <Button kind={failing ? 'danger' : 'primary'} onPress={() => { void send(); }} busy={busy} disabled={plantHeld({ mode, check, item, licence }) as boolean}>{plantSubmitLabel(mode, failing) as string}</Button>
      <Button kind="plain" onPress={() => router.back()} disabled={busy}>Cancel</Button>
    </Screen>
  );
}
