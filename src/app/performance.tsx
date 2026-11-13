// My performance: the person's own goals (move one along, mark it achieved, add or edit one), the reviews they self-assess, and their 1:1s coming up and held.
// The figures, which goals are active, what the quick buttons send, and how a review and a 1:1 read are the web app's own rules (shared/field-core.js).
import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { activeGoals, GOALS_HEAD, goalPct, goalSteps, goalTarget, NEW_GOAL, NO_GOALS, ONE_ON_ONES_HEAD, ONE_ON_ONES_RECENT, ONE_ON_ONES_SOON, oneOnOnes, pastRow, perfTiles, reviewMeta, REVIEWS_HEAD, reviewState, upcomingRow } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtDate, fmtDateTime, parseDay } from '@/lib/dates';
import { useTheme } from '@/theme';
import { Body, Button, Card, Empty, Figures, Heading, List, Loading, Pill, Problem, Row, Screen, Title, type Figure, type Tone } from '@/ui';

export type Goal = { id: string; title: string; description: string | null; target_date: string | null; progress_pct: number; status: string };
export type Review = { id: string; cycle_name: string; starts_on: string; ends_on: string; manager_name: string | null; status: string; self_assessment: string | null; manager_comments: string | null; rating: string | null };
type Meet = { id: string; scheduled_at: string; duration_mins: number | null; status: string; agenda: string | null; notes: string | null; action_items: string | null; manager_name: string };
type Step = { key: string; label: string; say: string; primary: boolean; draft: object };
const day = (d: string) => fmtDate(String(d).slice(0, 10));
// A date in a figure, which has no room for the year.
const short = (d: string) => parseDay(String(d).slice(0, 10)).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
const range = (a: string, b: string) => (a === b || !b) ? day(a) : `${day(a)} – ${day(b)}`;

export default function Performance() {
  const { state, api, changed } = useSession();
  const t = useTheme();
  const me = state.status === 'signedIn' ? state.me.employee.id : '';
  const goals = useRead<{ rows: Goal[] }>('/goals');
  const reviews = useRead<{ rows: Review[] }>('/reviews/mine');
  const meetings = useRead<{ rows: Meet[] }>(me ? `/one-on-ones?employee_id=${encodeURIComponent(me)}` : null);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (!goals.data) return goals.error ? <Screen><Title>My performance</Title><Problem>{goals.error}</Problem></Screen> : <Loading />;
  const now = Date.now();
  const active = activeGoals(goals.data.rows) as Goal[];
  const { upcoming, past } = oneOnOnes(meetings.data?.rows, now) as { upcoming: Meet[]; past: Meet[] };
  const revs = reviews.data?.rows || [];
  const move = async (g: Goal, s: Step) => {
    setBusy(`${g.id}${s.key}`); setProblem('');
    try { await api('/goals', { method: 'PUT', body: s.draft }); await goals.reload(); changed(); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy('');
  };
  return (
    <Screen>
      <Title>My performance</Title>
      <Figures figures={perfTiles({ goals: goals.data.rows, reviews: reviews.data?.rows, meetings: meetings.data?.rows }, now, short) as Figure[]} />
      <Problem>{problem || goals.error || reviews.error || meetings.error}</Problem>

      <Heading right={<Button kind="plain" icon="add" onPress={() => router.push('/goal')}>{NEW_GOAL as string}</Button>}>{GOALS_HEAD as string}</Heading>
      {active.length === 0 ? <Empty icon="star-outline">{NO_GOALS as string}</Empty> : active.map(g => (
        <Card key={g.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}><Body strong>{g.title}</Body></View>
            <Body strong>{`${goalPct(g) as number}%`}</Body>
          </View>
          {!!g.description && <Body tone="muted">{g.description}</Body>}
          {!!g.target_date && <Body tone="muted">{goalTarget(g, day) as string}</Body>}
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: goalPct(g) as number }} style={{ height: 8, borderRadius: 4, backgroundColor: t.line, overflow: 'hidden' }}>
            <View style={{ width: `${goalPct(g) as number}%`, height: 8, backgroundColor: t.accent }} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(goalSteps(g) as Step[]).map(s => <View key={s.key} style={{ flex: s.primary ? 2 : 1 }}><Button kind={s.primary ? 'primary' : 'plain'} busy={busy === `${g.id}${s.key}`} disabled={!!busy} onPress={() => { void move(g, s); }}>{s.label}</Button></View>)}
          </View>
          <Button kind="plain" icon="create-outline" disabled={!!busy} onPress={() => router.push(`/goal?id=${encodeURIComponent(g.id)}`)}>Edit</Button>
        </Card>
      ))}

      {revs.length > 0 && (
        <>
          <Heading>{REVIEWS_HEAD as string}</Heading>
          <List>
            {revs.map((r, n) => { const st = reviewState(r) as { tone: Tone; label: string }; return (
              <Row key={r.id} icon="clipboard-outline" tint="amber" title={r.cycle_name} sub={reviewMeta(r, range) as string} right={<Pill tone={st.tone}>{st.label}</Pill>} onPress={() => router.push(`/review?id=${encodeURIComponent(r.id)}`)} last={n === revs.length - 1} />
            ); })}
          </List>
        </>
      )}

      {(upcoming.length > 0 || past.length > 0) && <Heading>{ONE_ON_ONES_HEAD as string}</Heading>}
      {upcoming.length > 0 && <Body tone="muted">{ONE_ON_ONES_SOON as string}</Body>}
      {upcoming.map(o => { const told = upcomingRow(o, fmtDateTime) as { title: string; meta: string; pill: string }; return (
        <Card key={o.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><View style={{ flex: 1 }}><Body strong>{told.title}</Body></View><Pill tone="info">{told.pill}</Pill></View>
          <Body tone="muted">{told.meta}</Body>
        </Card>
      ); })}
      {past.length > 0 && <Body tone="muted">{ONE_ON_ONES_RECENT as string}</Body>}
      {past.map(o => { const told = pastRow(o, day) as { title: string; meta: string; pill: string; notes: string; actions: string; actionsLabel: string }; return (
        <Card key={o.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><View style={{ flex: 1 }}><Body strong>{told.title}</Body></View><Pill tone="ok">{told.pill}</Pill></View>
          <Body tone="muted">{told.meta}</Body>
          {!!told.notes && <Body>{told.notes}</Body>}
          {!!told.actions && <Body>{`${told.actionsLabel}${told.actions}`}</Body>}
        </Card>
      ); })}
    </Screen>
  );
}
