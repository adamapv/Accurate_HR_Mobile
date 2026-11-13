// A goal (?id=<goal> to edit one, none for a new one): its title, description, target date and progress, and Delete on one that exists. What the form opens
// with, what it needs, how it is sent and its words are the web app's own rules (shared/field-core.js). It needs signal.
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { GOAL_DELETE_CONFIRM, GOAL_FIELDS, goalFormStart, goalFormTitle, goalMethod, goalPctOf, goalProblem, goalSubmitLabel } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import type { Goal } from '@/app/performance';
import { WhenField } from '@/pickers';
import { Button, Field, Loading, Problem, Screen, Title } from '@/ui';

type Form = { id?: string; title: string; description: string | null; target_date: string | null; progress_pct: number };
const LABELS = GOAL_FIELDS as Record<string, string>, ASK = GOAL_DELETE_CONFIRM as { title: string; confirmLabel: string };

export default function GoalForm() {
  const { state, api, changed } = useSession();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const goals = useRead<{ rows: Goal[] }>(id ? '/goals' : null);
  const goal = id ? goals.data?.rows.find(g => g.id === id) : undefined;
  const [form, setForm] = useState<Form | null>(id ? null : goalFormStart({}) as Form);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  useEffect(() => { if (goal && !form) setForm(goalFormStart(goal) as Form); }, [goal, form]);
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (id && !goals.data) return goals.error ? <Screen centered><Problem>{goals.error}</Problem></Screen> : <Loading />;
  if (id && !goal && !busy) return <Redirect href="/performance" />;
  if (!form) return <Loading />;
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setProblem('');
    try { await fn(); changed(); router.back(); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); setBusy(false); }
  };
  const save = () => {
    const bad = goalProblem(form) as string;
    if (bad) return setProblem(bad);
    void run(() => api('/goals', { method: goalMethod(form) as 'PUT' | 'POST', body: form }));
  };
  const remove = () => Alert.alert(ASK.title, undefined, [{ text: 'Cancel', style: 'cancel' }, { text: ASK.confirmLabel, style: 'destructive', onPress: () => { void run(() => api('/goals', { method: 'DELETE', body: { id: form.id } })); } }]);
  return (
    <Screen>
      <Title>{goalFormTitle(form) as string}</Title>
      <Field label={LABELS.title} value={form.title} onChangeText={v => setForm({ ...form, title: v })} maxLength={200} />
      <Field label={LABELS.description} value={form.description || ''} onChangeText={v => setForm({ ...form, description: v })} multiline maxLength={2000} />
      <WhenField label={LABELS.target_date} mode="date" value={form.target_date || ''} onChange={v => setForm({ ...form, target_date: v })} />
      <Field label={LABELS.progress_pct} value={String(form.progress_pct ?? 0)} onChangeText={v => setForm({ ...form, progress_pct: goalPctOf(v) as number })} keyboardType="number-pad" maxLength={3} />
      <Problem>{problem}</Problem>
      <Button onPress={save} busy={busy}>{goalSubmitLabel(form) as string}</Button>
      {!!form.id && <Button kind="danger" icon="trash-outline" onPress={remove} disabled={busy}>{ASK.confirmLabel}</Button>}
      <Button kind="plain" onPress={() => router.back()} disabled={busy}>Cancel</Button>
    </Screen>
  );
}
