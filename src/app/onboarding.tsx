// My onboarding: a new starter's first weeks as one list (tasks, induction modules, forms, documents and policies), nearest deadline first, with one thing to
// do next, and any task the person owes on someone else's onboarding. The Worker works out what is theirs and in what order; what is next, the groups, the
// wording and what each row offers are the web app's own rules (shared/field-core.js). A task is ticked here; everything else opens in its own screen.
import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { ONB_ALL_DONE, ONB_DONE_PILL, ONB_OWED_HEAD, ONB_UP_NEXT, onbActions, onbEmpty, onbFinishedHead, onbGroupHead, onbHero, onbIsLate, onbKey, onbMeta, onbOwedMeta, onbPlan, onbTaskDraft, onbTaskSaid, onbVerb } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtDate, fmtTime, localToday } from '@/lib/dates';
import { openFile } from '@/lib/open-file';
import { useTheme } from '@/theme';
import { Body, Button, Card, Empty, Heading, Loading, Notice, Pill, Problem, Screen, Title } from '@/ui';

export type OnbItem = { kind: 'task' | 'module' | 'form' | 'document' | 'policy'; id: string; title: string; description?: string | null; minutes?: number | null; due_date: string | null; done: boolean; done_at: string | null;
  form_id?: string; sign?: boolean; file?: string | null; contract?: string | null; content?: string | null };
type Owed = { id: string; title: string; description: string | null; due_date: string | null; for_name: string };
export type Onboarding = { run: { id: string; template_name: string | null; start_date: string | null; target_date: string | null } | null; today: string; items?: OnbItem[]; total?: number; done?: number;
  others?: { total: number; done: number }; owed: Owed[]; past?: { id: string; status: string; completed_at: string | null }[] };
type Hero = { eyebrow: string; template: string; greeting: string; name: string; strong: string; rest: string; pct: number; tone: 'ok' | 'warn' | 'accent'; ring: string; others: string };
type Plan = { next: OnbItem | null; finished: boolean; groups: { key: string; label: string; rows: OnbItem[] }[]; done: OnbItem[] };
type Action = { act: 'done' | 'undo' | 'open' | 'download'; label: string };
// A day the Worker stored, with or without a time, as a date.
export const day = (d: string) => fmtDate(String(d).slice(0, 10));

export default function OnboardingScreen() {
  const { state, api, sessionId, changed } = useSession();
  const t = useTheme();
  const mine = useRead<Onboarding>('/onboarding/mine?full=1');
  const [working, setWorking] = useState('');
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState('');
  const [showDone, setShowDone] = useState(false);
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (!mine.data) return mine.error ? <Screen><Title>My onboarding</Title><Problem>{mine.error}</Problem></Screen> : <Loading />;
  const data = mine.data, today = data.today || localToday();
  const first = (state.me.employee.name || '').split(' ')[0];

  const run = async (key: string, fn: () => Promise<string>) => {
    setWorking(key); setProblem(''); setSaid('');
    try { const told = await fn(); await mine.reload(); changed(); setSaid(told); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setWorking('');
  };
  const setTask = (item: { id: string; kind?: string }, status: string) => run(onbKey({ kind: item.kind || 'task', id: item.id }) as string, async () => {
    await api('/onboarding-tasks', { method: 'PUT', body: onbTaskDraft(item, status) });
    return onbTaskSaid(status) as string;
  });
  const open = (i: OnbItem) => {
    setSaid(''); setProblem('');
    if (i.kind === 'module') router.push(`/induction?id=${encodeURIComponent(i.id)}`);
    else if (i.kind === 'form') router.push(`/form?id=${encodeURIComponent(i.form_id || '')}`);
    else if (i.kind === 'policy') router.push(`/policy?id=${encodeURIComponent(i.id)}`);
    else if (i.contract) setSaid('This is a contract. Read and sign it in the Field view in your browser for now.');
    else router.push(`/sign-document?id=${encodeURIComponent(i.id)}`);
  };
  const download = (i: OnbItem) => run(onbKey(i) as string, async () => {
    const ext = /\.[A-Za-z0-9]{2,5}$/.exec(i.file || '')?.[0] || '';
    await openFile(sessionId(), `/documents/${i.id}/download`, `${i.title}${ext}`);
    return '';
  });
  const act = (i: OnbItem, a: Action) => a.act === 'done' ? setTask(i, 'completed') : a.act === 'undo' ? setTask(i, 'pending') : a.act === 'download' ? download(i) : open(i);
  const buttons = (i: OnbItem, primary: boolean) => (onbActions(i) as Action[]).map(a => (
    <Button key={a.act} kind={primary && (a.act === 'done' || a.act === 'open') ? 'primary' : 'plain'} busy={working === onbKey(i) && a.act !== 'open'} disabled={!!working} onPress={() => { void act(i, a); }}>{a.label}</Button>
  ));
  const row = (i: OnbItem) => (
    <Card key={onbKey(i) as string}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}><Body strong>{i.title}</Body></View>
        {i.done ? <Pill tone="ok">{ONB_DONE_PILL as string}</Pill> : (onbIsLate(i, today) as boolean) ? <Pill tone="danger">Overdue</Pill> : null}
      </View>
      <Body tone="muted">{onbMeta(i, today, day) as string}</Body>
      {buttons(i, false)}
    </Card>
  );

  const hero = data.run ? onbHero(data, first, day) as Hero : null;
  const plan = onbPlan(data, today) as Plan;
  return (
    <Screen>
      <Title>My onboarding</Title>
      {mine.offlineAt !== null && <Notice tone="warn" icon="cloud-offline-outline">{`No signal. Showing what was saved at ${fmtTime(mine.offlineAt)}.`}</Notice>}
      {hero && (
        <Card>
          <Body tone="muted">{[hero.eyebrow, hero.template].filter(Boolean).join(' · ')}</Body>
          <Body strong>{`${hero.greeting}${hero.name}`}</Body>
          <Body>{`${hero.strong}${hero.rest}`}</Body>
          <View accessibilityRole="progressbar" accessibilityLabel={hero.ring} accessibilityValue={{ min: 0, max: 100, now: hero.pct }} style={{ height: 8, borderRadius: 4, backgroundColor: t.line, overflow: 'hidden' }}>
            <View style={{ width: `${hero.pct}%`, height: 8, backgroundColor: hero.tone === 'ok' ? t.ok : hero.tone === 'warn' ? t.warn : t.accent }} />
          </View>
          <Body tone="muted">{hero.ring}</Body>
          {!!hero.others && <Body tone="muted">{hero.others}</Body>}
        </Card>
      )}
      {!!said && <Notice tone="ok">{said}</Notice>}
      <Problem>{problem || mine.error}</Problem>

      {plan.next && (
        <Card>
          <Pill tone="info">{ONB_UP_NEXT as string}</Pill>
          <Body strong>{plan.next.title}</Body>
          <Body tone="muted">{onbMeta(plan.next, today, day) as string}</Body>
          {buttons(plan.next, true)}
        </Card>
      )}
      {plan.finished && <Notice tone="ok" icon="checkmark-circle-outline">{`${(ONB_ALL_DONE as { title: string; text: string }).title}. ${(ONB_ALL_DONE as { title: string; text: string }).text}`}</Notice>}

      {data.run && plan.groups.map(g => (
        <View key={g.key} style={{ gap: 10 }}>
          <Heading>{onbGroupHead(g) as string}</Heading>
          {g.rows.map(row)}
        </View>
      ))}
      {data.run && plan.done.length > 0 && (
        <View style={{ gap: 10 }}>
          <Heading right={<Button kind="plain" onPress={() => setShowDone(v => !v)}>{showDone ? 'Hide' : 'Show'}</Button>}>{onbFinishedHead(plan.done) as string}</Heading>
          {showDone && plan.done.map(row)}
        </View>
      )}

      {!data.run && data.owed.length === 0 && <Empty icon="flag-outline">{onbEmpty(data, day) as string}</Empty>}
      {data.owed.length > 0 && (
        <View style={{ gap: 10 }}>
          <Heading>{ONB_OWED_HEAD as string}</Heading>
          {data.owed.map(o => (
            <Card key={o.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}><Body strong>{o.title}</Body></View>
                {!!o.due_date && o.due_date < today && <Pill tone="danger">Overdue</Pill>}
              </View>
              <Body tone="muted">{onbOwedMeta(o, day) as string}</Body>
              <Button busy={working === onbKey({ kind: 'task', id: o.id })} disabled={!!working} onPress={() => { void setTask(o, 'completed'); }}>{onbVerb({ kind: 'task' }) as string}</Button>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
