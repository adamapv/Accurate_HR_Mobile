// Edit profile: the person's own details and emergency contact. The fields, their labels and what is saved are the web app's own (shared/field-core.js); the
// Worker refuses it for a level that may not change its own details, in its own words. The address is typed here (the web app's address search is not in the
// app). It needs signal.
import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { EMERGENCY_FIELDS, PERSONAL_FIELDS, PROFILE_PANELS, profileDraft, profileFormStart } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { localToday } from '@/lib/dates';
import { WhenField } from '@/pickers';
import { Body, Button, Field, Heading, Problem, Screen, Title } from '@/ui';

type FieldT = { key: string; label: string; type?: string; hint?: string; address?: boolean };
type Form = Record<string, string | null | undefined>;
const PANELS = PROFILE_PANELS as { personal: string; emergency: string };

export default function EditProfile() {
  const { state, api, refreshMe, changed } = useSession();
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  const f = form || (profileFormStart(state.me.profile) as Form);
  const set = (key: string, v: string) => setForm({ ...f, [key]: v });
  const save = async () => {
    setBusy(true); setProblem('');
    try { await api('/me', { method: 'PUT', body: profileDraft(f) }); await refreshMe(); changed(); router.back(); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); setBusy(false); }
  };
  const box = (x: FieldT) => x.type === 'date'
    ? <WhenField key={x.key} label={x.label} mode="date" value={String(f[x.key] || '').slice(0, 10)} maxDate={localToday()} onChange={v => set(x.key, v)} />
    : (
      <Field key={x.key} label={x.label} value={String(f[x.key] || '')} onChangeText={v => set(x.key, v)} maxLength={x.address ? 200 : 120}
        keyboardType={x.type === 'tel' ? 'phone-pad' : x.key === 'postcode' ? 'number-pad' : 'default'} autoCapitalize={x.key === 'state' ? 'characters' : 'words'} />
    );
  return (
    <Screen>
      <Title>Edit profile</Title>
      <Heading>{PANELS.personal}</Heading>
      {(PERSONAL_FIELDS as FieldT[]).map(x => [box(x), x.hint && !x.address ? <Body key={`${x.key}-hint`} tone="muted">{x.hint}</Body> : null])}
      <Heading>{PANELS.emergency}</Heading>
      {(EMERGENCY_FIELDS as FieldT[]).map(box)}
      <Problem>{problem}</Problem>
      <Button onPress={() => { void save(); }} busy={busy}>Save</Button>
      <Button kind="plain" onPress={() => router.back()} disabled={busy}>Cancel</Button>
    </Screen>
  );
}
