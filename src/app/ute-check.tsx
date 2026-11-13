// The check of what a ute carries (?id=<ute>): Yes, No or N/A for every tool on its checklist, the asset number of a tool that carries one, where a missing one
// is, the date and a note. What makes it ready, what is sent and what the person is told are the web app's own rules (shared/field-core.js). Anything short
// tells the workshop. It needs signal.
import { useState } from 'react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { UTE_ALL_ON, UTE_ASSET_NO, UTE_ASSET_NO_HINT, UTE_CHOICES, UTE_DATE_LABEL, UTE_HEAD, UTE_NO_LIST, UTE_NOTES_LABEL, UTE_SAVE, UTE_WHERE, uteAllOn, uteDraft, uteSaid, uteState, uteSub, uteTitle } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { localToday } from '@/lib/dates';
import { WhenField } from '@/pickers';
import { Body, Button, Card, Choice, Field, Heading, Loading, Notice, Problem, Screen, Title } from '@/ui';

type UteItem = { id: string; label: string; needs_asset_no: number | boolean };
type Ute = { asset: { id: string; name: string; registration_number: string | null; holder_name: string | null; mine: boolean }; checklist: { id: string; name: string; items: UteItem[] } | null; can_check: boolean };
type Answers = Record<string, { answer?: string; asset_no?: string; note?: string }>;
const TONES = { yes: 'ok', no: 'danger', na: 'neutral' } as const;

export default function UteCheck() {
  const { state, api, changed } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const ute = useRead<Ute>(id ? `/assets/${encodeURIComponent(id)}/ute-check` : null);
  const [answers, setAnswers] = useState<Answers>({});
  const [date, setDate] = useState(localToday());
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [said, setSaid] = useState('');
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (said) return <Screen centered><Title>Check saved</Title><Body>{said}</Body><Button onPress={() => router.back()}>Done</Button></Screen>;
  if (!ute.data) return ute.error ? <Screen centered><Problem>{ute.error}</Problem></Screen> : <Loading />;
  const data = ute.data, list = data.checklist;
  const check = list ? uteState(list, answers) as { ready: boolean; items: unknown[] } : null;
  const set = (key: string, patch: { answer?: string; asset_no?: string; note?: string }) => setAnswers(a => ({ ...a, [key]: { ...a[key], ...patch } }));
  const save = async () => {
    setBusy(true); setProblem('');
    try { const res = await api(`/assets/${encodeURIComponent(data.asset.id)}/ute-check`, { method: 'POST', body: uteDraft({ date, check, notes }) }); setSaid(uteSaid(res, data.asset) as string); changed(); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy(false);
  };
  const sub = uteSub(data) as string;
  return (
    <Screen>
      <Title>{uteTitle(data.asset) as string}</Title>
      {!!sub && <Body tone="muted">{sub}</Body>}
      {!list ? <Notice tone="warn">{UTE_NO_LIST as string}</Notice> : (
        <>
          <WhenField label={UTE_DATE_LABEL as string} mode="date" value={date} onChange={setDate} maxDate={localToday()} />
          <Heading right={<Button kind="plain" icon="checkmark-done-outline" onPress={() => setAnswers(a => uteAllOn(list, a) as Answers)}>{UTE_ALL_ON as string}</Button>}>{UTE_HEAD as string}</Heading>
          {list.items.map(it => (
            <Card key={it.id}>
              <Body>{it.needs_asset_no ? `${it.label} ${UTE_ASSET_NO_HINT as string}` : it.label}</Body>
              <Choice options={(UTE_CHOICES as [keyof typeof TONES, string][]).map(([key, label]) => ({ key, label, tone: TONES[key] }))} value={(answers[it.id]?.answer || '') as keyof typeof TONES | ''} onChange={v => set(it.id, { answer: v })} />
              {answers[it.id]?.answer === 'yes' && !!it.needs_asset_no && <Field label={UTE_ASSET_NO as string} value={answers[it.id]?.asset_no || ''} onChangeText={v => set(it.id, { asset_no: v })} maxLength={60} autoCapitalize="characters" />}
              {answers[it.id]?.answer === 'no' && <Field label={UTE_WHERE as string} value={answers[it.id]?.note || ''} onChangeText={v => set(it.id, { note: v })} maxLength={500} />}
            </Card>
          ))}
          <Field label={UTE_NOTES_LABEL as string} value={notes} onChangeText={setNotes} multiline maxLength={1000} />
          <Problem>{problem}</Problem>
          <Button onPress={() => { void save(); }} busy={busy} disabled={!check?.ready}>{UTE_SAVE as string}</Button>
        </>
      )}
      <Button kind="plain" onPress={() => router.back()} disabled={busy}>Cancel</Button>
    </Screen>
  );
}
