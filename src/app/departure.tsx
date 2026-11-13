// My departure: a leaver's last day, their own tasks to tick off, and the exit interview. The figures, which tasks are theirs, the interview's questions and
// what is sent are the web app's own rules (shared/field-core.js). The interview is for HR and the leaver only. Ticking a task and sending feedback need signal.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { DEPARTURE_TASK_SAID, departureSub, departureTaskDraft, departureTaskMeta, departureTasks, departureTiles, EXIT_ABOUT, EXIT_ALREADY, EXIT_HEAD, EXIT_RATINGS, EXIT_RECOMMEND, EXIT_SAID, EXIT_SCORES, EXIT_TEXTS, exitDraft, exitStart,
  exitSubmitLabel, NO_DEPARTURE, NO_DEPARTURE_TASKS, ONB_DONE_PILL, onbVerb } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { localToday, parseDay } from '@/lib/dates';
import { day } from '@/app/onboarding';
import { Body, Button, Card, Choice, Empty, Field, Figures, Heading, Loading, Notice, Pill, Problem, Screen, Title, type Figure } from '@/ui';

type Task = { id: string; title: string; description: string | null; assignee_id: string | null; due_date: string | null; status: string };
type Interview = Record<string, string | number | null>;
type Detail = { run: { id: string; kind: string; last_day: string }; tasks: Task[]; interview: Interview | null };
// The last day in a figure, which has no room for the year (the line under the title says it in full).
const short = (d: string) => parseDay(String(d).slice(0, 10)).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
const SCORES = (EXIT_SCORES as number[]).map(n => ({ key: String(n), label: String(n) }));

export default function Departure() {
  const { state, api, changed } = useSession();
  const me = state.status === 'signedIn' ? state.me.employee.id : '';
  const list = useRead<{ rows: { id: string }[] }>(me ? `/offboarding-runs?employee_id=${encodeURIComponent(me)}&status=active` : null);
  const runId = list.data?.rows[0]?.id;
  const detail = useRead<Detail>(runId ? `/offboarding-runs/${encodeURIComponent(runId)}` : null);
  const [form, setForm] = useState<Interview | null>(null);
  const [busy, setBusy] = useState('');
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState('');
  useEffect(() => { if (detail.data && !form) setForm(exitStart(detail.data.interview) as Interview); }, [detail.data, form]);
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (!list.data) return list.error ? <Screen><Title>My departure</Title><Problem>{list.error}</Problem></Screen> : <Loading />;
  if (!runId) return <Screen><Title>My departure</Title><Empty icon="exit-outline">{NO_DEPARTURE as string}</Empty></Screen>;
  if (!detail.data || !form) return detail.error ? <Screen><Title>My departure</Title><Problem>{detail.error}</Problem></Screen> : <Loading />;
  const data = detail.data, mine = departureTasks(data, me) as Task[];

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key); setProblem(''); setSaid('');
    try { const told = await fn(); await detail.reload(); changed(); setSaid(told); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy('');
  };
  const complete = (id: string) => run(id, async () => { await api('/offboarding-tasks', { method: 'PUT', body: departureTaskDraft(id) }); return DEPARTURE_TASK_SAID as string; });
  const send = () => run('interview', async () => { await api('/exit-interviews', { method: 'POST', body: exitDraft(form, data.run) }); return EXIT_SAID as string; });
  const recommend = form.would_recommend === 1 ? 'yes' : form.would_recommend === 0 ? 'no' : '';
  return (
    <Screen>
      <Title>My departure</Title>
      <Body tone="muted">{departureSub(data.run, day) as string}</Body>
      <Figures figures={departureTiles(data, me, localToday(), short) as Figure[]} />
      {!!said && <Notice tone="ok">{said}</Notice>}
      <Problem>{problem || detail.error}</Problem>

      <Heading>My tasks</Heading>
      {mine.length === 0 ? <Empty icon="checkmark-circle-outline">{NO_DEPARTURE_TASKS as string}</Empty> : mine.map(task => (
        <Card key={task.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}><Body strong>{task.title}</Body></View>
            {task.status === 'completed' && <Pill tone="ok">{ONB_DONE_PILL as string}</Pill>}
          </View>
          {!!task.description && <Body tone="muted">{task.description}</Body>}
          {!!departureTaskMeta(task, day) && <Body tone="muted">{departureTaskMeta(task, day) as string}</Body>}
          {task.status !== 'completed' && <Button busy={busy === task.id} disabled={!!busy} onPress={() => { void complete(task.id); }}>{onbVerb({ kind: 'task' }) as string}</Button>}
        </Card>
      ))}

      <Heading>{EXIT_HEAD as string}</Heading>
      {!!data.interview && <Notice tone="ok">{EXIT_ALREADY as string}</Notice>}
      <Body tone="muted">{EXIT_ABOUT as string}</Body>
      {(EXIT_RATINGS as [string, string][]).map(([key, label]) => (
        <View key={key} style={{ gap: 8 }}>
          <Body>{label}</Body>
          <Choice options={SCORES} value={form[key] ? String(form[key]) : ''} onChange={v => setForm({ ...form, [key]: Number(v) })} />
        </View>
      ))}
      {(EXIT_TEXTS as [string, string][]).map(([key, label]) => <Field key={key} label={label} value={String(form[key] || '')} onChangeText={v => setForm({ ...form, [key]: v })} multiline maxLength={2000} />)}
      <Body>{EXIT_RECOMMEND as string}</Body>
      <Choice options={[{ key: 'yes', label: 'Yes', tone: 'ok' as const }, { key: 'no', label: 'No', tone: 'danger' as const }]} value={recommend} onChange={v => setForm({ ...form, would_recommend: v === 'yes' ? 1 : 0 })} />
      <Button onPress={() => { void send(); }} busy={busy === 'interview'} disabled={!!busy}>{exitSubmitLabel(data.interview) as string}</Button>
    </Screen>
  );
}
