// My morning note: a short note of the person's day, at an hour they choose, optionally emailed too. The hours, the wording, what the form opens with and what it
// saves are the web app's own rules (shared/field-core.js).
import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { DAY_NOTE_ABOUT, DAY_NOTE_HOURS, DAY_NOTE_SWITCH, DAY_NOTE_WHERE, dayNoteDraft, dayNoteEmailLabel, dayNoteSaid, dayNoteStart, hourLabel } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { Body, Button, Problem, Screen, Title } from '@/ui';
import { PickField, Tick } from '@/whs';

export default function MorningNote() {
  const { state, api, refreshMe } = useSession();
  const me = state.status === 'signedIn' ? state.me : null;
  const [form, setForm] = useState(() => dayNoteStart(me ? me.employee : {}) as { on: boolean; hour: number; email: boolean });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [said, setSaid] = useState('');
  if (!me) return <Redirect href="/" />;
  const canEmail = !!(me.email_configured && me.employee.email);
  const save = async () => {
    setBusy(true); setProblem('');
    try { await api('/me/preferences', { method: 'PUT', body: dayNoteDraft(form, canEmail) }); await refreshMe(); setSaid(dayNoteSaid(form) as string); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy(false);
  };
  if (said) return <Screen centered><Title>{said}</Title><Button onPress={() => router.back()}>Done</Button></Screen>;
  return (
    <Screen>
      <Title>My morning note</Title>
      <Body tone="muted">{DAY_NOTE_ABOUT as string}</Body>
      <Tick label={DAY_NOTE_SWITCH as string} value={form.on} onChange={on => setForm(f => ({ ...f, on }))} />
      {form.on && <PickField label="At" value={String(form.hour)} pairs={(DAY_NOTE_HOURS as number[]).map(h => [String(h), hourLabel(h) as string] as [string, string])} onChange={v => setForm(f => ({ ...f, hour: Number(v) }))} />}
      {form.on && canEmail && <Tick label={dayNoteEmailLabel(true, me.employee.email) as string} value={form.email} onChange={email => setForm(f => ({ ...f, email }))} />}
      {form.on && !canEmail && <Body tone="muted">{dayNoteEmailLabel(false, '') as string}</Body>}
      {form.on && <Body tone="muted">{DAY_NOTE_WHERE as string}</Body>}
      <Problem>{problem}</Problem>
      <Button onPress={() => { void save(); }} busy={busy}>Save</Button>
      <Button kind="plain" onPress={() => router.back()} disabled={busy}>Cancel</Button>
    </Screen>
  );
}
