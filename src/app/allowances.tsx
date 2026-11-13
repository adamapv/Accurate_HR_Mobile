// My allowances: what the person has earned, week by week, from time on jobs that carry their allowances, and where each week stands with the approver.
// A week in words (how much, on which days and jobs, the amount, its state) is the web app's own rule (shared/field-core.js). Nothing is changed from here.
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { can } from '@shared/access.js';
import { ALLOWANCE_NO_RATE, ALLOWANCES_SUB, allowanceRow, NO_ALLOWANCES } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtDate, fmtTime, parseDay } from '@/lib/dates';
import { fmtMoney } from '@/lib/money';
import { Body, Card, Empty, Loading, Notice, Pill, Problem, Screen, Title, type Tone } from '@/ui';

type Told = { key: string; week: string; name: string; what: string; jobs: string; was: string; amount: string | null; state: { tone: Tone; label: string }; note: string; notOver: string };
const fmt = {
  fmtRange: (a: string, b: string) => (a === b || !b) ? fmtDate(a) : `${fmtDate(a)} – ${fmtDate(b)}`,
  fmtHours: (n: number) => `${Number(n).toFixed(1)}h`,
  fmtMoney: (c: number) => fmtMoney(c),
  shortDay: (d: string) => parseDay(d).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'numeric' }),
};

export default function Allowances() {
  const { state } = useSession();
  const allowed = state.status === 'signedIn' && can(state.me.access, 'allowances');
  const mine = useRead<{ rows: unknown[] }>(allowed ? '/allowances/mine' : null);
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (!allowed) return <Redirect href="/more" />;
  if (!mine.data) return mine.error ? <Screen><Title>My allowances</Title><Problem>{mine.error}</Problem></Screen> : <Loading />;
  const rows = mine.data.rows.map(r => allowanceRow(r, fmt) as Told);
  return (
    <Screen>
      <Title>My allowances</Title>
      <Body tone="muted">{ALLOWANCES_SUB as string}</Body>
      {mine.offlineAt !== null && <Notice tone="warn" icon="cloud-offline-outline">{`No signal. Showing what was saved at ${fmtTime(mine.offlineAt)}.`}</Notice>}
      <Problem>{mine.error}</Problem>
      {rows.length === 0 ? <Empty icon="cash-outline">{NO_ALLOWANCES as string}</Empty> : rows.map(r => (
        <Card key={r.key}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ flex: 1 }}><Body strong>{r.name}</Body></View>
            {r.amount === null ? <Body tone="danger">{(ALLOWANCE_NO_RATE as { text: string }).text}</Body> : <Body strong>{r.amount}</Body>}
          </View>
          <Body tone="muted">{r.week}</Body>
          <Body>{r.what}</Body>
          {!!r.jobs && <Body tone="muted">{r.jobs}</Body>}
          {!!r.was && <Body tone="muted">{r.was}</Body>}
          <Pill tone={r.state.tone}>{r.state.label}</Pill>
          {!!r.note && <Body tone="muted">{r.note}</Body>}
          {!!r.notOver && <Body tone="muted">{r.notOver}</Body>}
          {r.amount === null && <Body tone="muted">{(ALLOWANCE_NO_RATE as { why: string }).why}</Body>}
        </Card>
      ))}
    </Screen>
  );
}
