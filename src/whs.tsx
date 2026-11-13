// The pieces every safety report screen uses: the emergency numbers, the notifiable-incident question with what to do about one, a choice from a list, ticks for a
// list, a short list of people, and photos taken with the camera. The numbers, the question and the steps are the web app's own words (shared/whs-core.js), written
// from the company's own regulator details (`me.company.whs`): the app never names a regulator itself.
import { useState } from 'react';
import { Image, Linking, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { emergencyLines, enumLabel, MAX_ROWS, NOTIFIABLE_CHECK, NOTIFIABLE_MEANS, NOTIFIABLE_QUESTION, notifiableSteps, notifiableUnsure, photoHint, WHS_MAX_PHOTOS } from '@shared/whs-core.js';
import { useSession } from '@/lib/session';
import { uploadPhoto } from '@/lib/upload';
import { ChooseField } from '@/pickers';
import { useTheme } from '@/theme';
import { Toggle, Body, Button, Card, Field, Problem } from '@/ui';

export type Whs = { regulator: string; phone: string | null; tel: string | null; written: string; eap: string | null; set: boolean };
type Part = { text?: string; phone?: string; tel?: string };
type Line = { key: string; label: string; phone: string | null; tel: string | null; missing?: string; danger?: boolean; muted?: boolean };
export type Photo = { key: string; uri?: string; idx?: number };

const ring = (tel: string) => { void Linking.openURL(tel); };

// Wording with a phone number in it: the number is something to tap.
export function Parts({ parts, tone = 'fg' }: { parts: Part[]; tone?: 'fg' | 'muted' | 'danger' }) {
  const t = useTheme();
  return (
    <Text style={{ fontSize: 16, lineHeight: 23, color: t[tone] }}>
      {parts.map((p, n) => p.tel ? <Text key={n} accessibilityRole="link" onPress={() => ring(p.tel!)} style={{ color: t.accent2, fontWeight: '700' }}>{p.phone}</Text> : <Text key={n}>{p.text}</Text>)}
    </Text>
  );
}

// 000, the regulator for a notifiable incident, and the company's own support line when it has one.
export function EmergencyCard({ whs }: { whs: Whs }) {
  const t = useTheme();
  return (
    <Card>
      {(emergencyLines(whs) as Line[]).map(l => (
        <Text key={l.key} style={{ fontSize: 16, lineHeight: 23, color: l.muted ? t.muted : t.fg }}>
          {l.label}
          {l.phone && l.tel
            ? <Text accessibilityRole="link" accessibilityLabel={`Call ${l.phone}`} onPress={() => ring(l.tel!)} style={{ color: l.danger ? t.danger : t.accent2, fontWeight: '700' }}>{l.phone}</Text>
            : <Text style={{ color: t.muted }}>{l.missing}</Text>}
        </Text>
      ))}
    </Card>
  );
}

// What to do about a notifiable incident, in order, with the regulator's number to ring.
export function NotifiableSteps({ whs }: { whs: Whs }) {
  const said = notifiableSteps(whs) as { title: string; steps: Part[][]; call: { label: string; tel: string } | null };
  return (
    <Card>
      <Body tone="danger">{said.title}</Body>
      {said.steps.map((parts, n) => (
        <View key={n} style={{ flexDirection: 'row', gap: 8 }}>
          <Body>{`${n + 1}.`}</Body>
          <View style={{ flex: 1 }}><Parts parts={parts} /></View>
        </View>
      ))}
      {said.call && <Button onPress={() => ring(said.call!.tel)}>{said.call.label}</Button>}
    </Card>
  );
}

// "Is this a notifiable incident?": No, Not sure or Yes, and what to do for the last two.
export function NotifiableQuestion({ whs, value, onChange }: { whs: Whs; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Body>{NOTIFIABLE_QUESTION as string}</Body>
      <Body tone="muted">{NOTIFIABLE_MEANS as string}</Body>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(NOTIFIABLE_CHECK as [string, string][]).map(([v, label]) => (
          <View key={v} style={{ flex: 1 }}><Button kind={value === v ? 'primary' : 'plain'} onPress={() => onChange(v)}>{label}</Button></View>
        ))}
      </View>
      {value === 'yes' && <NotifiableSteps whs={whs} />}
      {value === 'unsure' && <Card><Parts parts={notifiableUnsure(whs) as Part[]} tone="danger" /></Card>}
    </View>
  );
}

// One choice from a list of [value, label] pairs, or of values said in words. `none` is what choosing nothing is called, when that is allowed.
export function PickField({ label, value, pairs, values, none, onChange }: { label: string; value: string; pairs?: [string, string][]; values?: string[]; none?: string; onChange: (v: string) => void }) {
  const list: [string, string][] = pairs || (values || []).map(v => [v, enumLabel(v) as string]);
  const options = [...(none ? [['', none] as [string, string]] : []), ...list].map(([key, title]) => ({ key: key || 'none', title, item: key }));
  return <ChooseField<string> label={label} placeholder={none || 'Choose'} value={list.find(x => x[0] === value)?.[1] || ''} options={options} onChoose={onChange} />;
}

// Ticks for a list of choices, kept as the list of ticked values.
export function TickList({ options, value, onChange }: { options: [string, string][]; value: string[] | undefined; onChange: (v: string[]) => void }) {
  const list = value || [];
  return (
    <View style={{ gap: 8 }}>
      {options.map(([v, label]) => (
        <View key={v} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flex: 1 }}><Body>{label}</Body></View>
          <Toggle accessibilityLabel={label} value={list.includes(v)} onValueChange={on => onChange(on ? [...list, v] : list.filter(x => x !== v))} />
        </View>
      ))}
    </View>
  );
}

// A yes or no on its own line.
export function Tick({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <View style={{ flex: 1 }}><Body>{label}</Body></View>
      <Toggle accessibilityLabel={label} value={value} onValueChange={onChange} />
    </View>
  );
}

// A short list of people (witnesses, people involved): a card each, with the fields the web form has.
export function RowsEditor({ rows, onChange, fields, addLabel }: { rows: Record<string, string>[]; onChange: (rows: Record<string, string>[]) => void; fields: { key: string; label: string; type?: string; wide?: boolean }[]; addLabel: string }) {
  const set = (i: number, k: string, v: string) => onChange(rows.map((r, j) => j === i ? { ...r, [k]: v } : r));
  return (
    <View style={{ gap: 8 }}>
      {rows.map((r, i) => (
        <Card key={i}>
          {fields.map(f => <Field key={f.key} label={f.label} value={r[f.key] || ''} onChangeText={v => set(i, f.key, v)} keyboardType={f.type === 'tel' ? 'phone-pad' : 'default'} multiline={!!f.wide} maxLength={f.wide ? 1000 : 120} />)}
          <Button kind="plain" onPress={() => onChange(rows.filter((_, j) => j !== i))}>Remove</Button>
        </Card>
      ))}
      {rows.length < (MAX_ROWS as number) && <Button kind="plain" onPress={() => onChange([...rows, {}])}>{addLabel}</Button>}
    </View>
  );
}

// Photos on a report, taken with the camera and sent as they are taken. `onBusy` says when one is still on its way, so the report waits for it.
export function PhotoList({ photos, onChange, onBusy }: { photos: Photo[]; onChange: (p: Photo[]) => void; onBusy: (busy: boolean) => void }) {
  const { api, sessionId } = useSession();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const snap = async () => {
    setProblem('');
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setProblem('Allow the camera to take a photo.');
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 });
    const a = shot.canceled ? null : shot.assets?.[0];
    if (!a) return;
    setBusy(true); onBusy(true);
    try {
      const key = await uploadPhoto(api, sessionId(), a.uri, a.mimeType || 'image/jpeg', '/documents/upload-url', 'whs-photo.jpg');
      onChange([...photos, { key, uri: a.uri }]);
    } catch (e) { setProblem(e instanceof Error ? e.message : 'Upload failed. Try again.'); }
    setBusy(false); onBusy(false);
  };
  return (
    <View style={{ gap: 8 }}>
      {photos.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {photos.map((p, i) => (
            <Pressable key={p.key} accessibilityRole="button" accessibilityLabel={`Remove photo ${i + 1}`} onPress={() => onChange(photos.filter(x => x !== p))}>
              <Image source={{ uri: p.uri }} style={{ width: 84, height: 84, borderRadius: 8 }} accessibilityLabel={`Photo ${i + 1}`} />
              <Body tone="muted">Remove</Body>
            </Pressable>
          ))}
        </View>
      )}
      {photos.length < (WHS_MAX_PHOTOS as number) && <Button kind="plain" icon="camera-outline" onPress={() => { void snap(); }} busy={busy}>{photos.length ? 'Take another photo' : 'Take a photo'}</Button>}
      <Body tone="muted">{photoHint as string}</Body>
      <Problem>{problem}</Problem>
    </View>
  );
}
