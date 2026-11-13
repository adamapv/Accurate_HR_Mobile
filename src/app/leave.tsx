// My leave: the person's balances, who on their team is away (for a level whose Leave reaches their team), and their own requests, each with what can still be
// done with it. What a row says, what can be done, and what is asked first are the web app's own rules (shared/field-core.js); the server decides the rest.
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { atLeast, can } from '@shared/access.js';
import { LEAVE_SENT, leaveBalanceSub, leaveCancelConfirm, leaveComingUp, leaveEmptyText, leaveRow, leaveWaiting, NOBODY_AWAY, teamLeaveList } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtDate, fmtTime, isoLocal, localToday } from '@/lib/dates';
import { Body, Button, Card, Empty, Figures, Heading, Notice, Pill, Problem, Screen, Title } from '@/ui';

type Balance = { id: string; type_name: string; balance_hours: number; accrued_hours: number; taken_hours: number; xero_hours: number | null; xero_synced_at: string | null };
type Request = { id: string; type_name: string; start_date: string; end_date: string; hours_requested: number; reason: string | null; status: string; decision_note: string | null };
type Away = { id: string; employee_name: string; type_name: string; start_date: string; end_date: string; status: string };
type Row = { title: string; meta: string; tone?: 'danger' | 'ok'; canSubmit: boolean; canCancel: boolean; cancelLabel: string; note: string };

const fmtHours = (n: number | null) => n == null ? '—' : `${Number(n).toFixed(1)}h`;
// A date, or the day of a date and time.
const fmt = { fmtDate: (d: string) => fmtDate(String(d).slice(0, 10)), fmtHours };
const STATUS: Record<string, string> = { draft: 'Draft', submitted: 'Waiting for approval', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled' };

export default function Leave() {
  const { state, api, changed } = useSession();
  const me = useRead<{ balances: Balance[] }>('/me');
  const mine = useRead<{ rows: Request[] }>('/leave-requests/mine');
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const seesTeam = state.status === 'signedIn' && atLeast(state.me.access, 'leave', 'team');
  const away = useRead<{ rows: Away[] }>(seesTeam ? `/leave-requests/team-calendar?start=${isoLocal(month)}&end=${isoLocal(new Date(month.getFullYear(), month.getMonth() + 1, 0))}` : null);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const [said, setSaid] = useState('');
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  const canAsk = can(state.me.access, 'leave', 'edit');
  const today = localToday();
  const rows = mine.data?.rows;
  const balances = me.data?.balances || [];

  const run = async (r: Request, action: 'submit' | 'cancel', done: string) => {
    setBusy(r.id); setProblem(''); setSaid('');
    try { await api(`/leave-requests/${r.id}/${action}`, { method: 'POST', body: {} }); setSaid(done); changed(); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy('');
  };
  const cancel = (r: Request) => {
    const ask = leaveCancelConfirm(r) as { title: string; body?: string; confirmLabel: string; cancelLabel: string };
    Alert.alert(ask.title, ask.body, [{ text: ask.cancelLabel, style: 'cancel' }, { text: ask.confirmLabel, style: 'destructive', onPress: () => { void run(r, 'cancel', 'Leave cancelled'); } }]);
  };
  const shift = (n: number) => setMonth(m => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const list = teamLeaveList(away.data?.rows || [], fmt.fmtDate) as { row: Away; title: string; meta: string }[];

  return (
    <Screen>
      <Title>My leave</Title>
      {canAsk && <Button icon="add-circle-outline" onPress={() => router.push('/request-leave')}>New request</Button>}
      {mine.offlineAt !== null && <Notice tone="warn" icon="cloud-offline-outline">{`No signal. Showing what was saved at ${fmtTime(mine.offlineAt)}.`}</Notice>}
      <Problem>{problem || mine.error}</Problem>
      {!!said && <Notice tone="ok">{said}</Notice>}
      {balances.length > 0 && <Figures figures={balances.map(b => ({ key: b.id, label: b.type_name, value: fmtHours(b.balance_hours), sub: leaveBalanceSub(b, fmt) as string }))} />}
      {seesTeam && (
        <Card>
          <Heading>Team leave calendar</Heading>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}><Button kind="plain" icon="chevron-back" onPress={() => shift(-1)}>Earlier</Button></View>
            <View style={{ flex: 1 }}><Button kind="plain" icon="chevron-forward" onPress={() => shift(1)}>Later</Button></View>
          </View>
          <Body strong>{month.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' })}</Body>
          <Problem>{away.error}</Problem>
          {!away.data ? (away.error ? null : <Body tone="muted">Loading…</Body>)
            : list.length === 0 ? <Empty>{NOBODY_AWAY as string}</Empty>
            : list.map(a => (
              <View key={a.row.id}>
                <Body>{a.title}</Body>
                <Body tone="muted">{a.meta}</Body>
              </View>
            ))}
        </Card>
      )}
      <Heading right={rows && leaveWaiting(rows) > 0 ? <Pill tone="warn">{`${leaveWaiting(rows) as number} waiting`}</Pill> : undefined}>My requests</Heading>
      {!!rows && rows.length > 0 && <Body tone="muted">{leaveComingUp(rows, today) as string}</Body>}
      {!rows ? (mine.error ? null : <Body tone="muted">Loading…</Body>)
        : rows.length === 0 ? <Empty>{leaveEmptyText(canAsk) as string}</Empty>
        : rows.map(r => {
          const row = leaveRow(r, today, fmt) as Row;
          return (
            <Card key={r.id}>
              <Body strong>{row.title}</Body>
              <Body tone="muted">{row.meta}</Body>
              <Pill tone={r.status === 'approved' ? 'ok' : r.status === 'rejected' ? 'danger' : r.status === 'submitted' ? 'warn' : 'neutral'}>{STATUS[r.status] || r.status}</Pill>
              {!!row.note && <Notice tone="danger">{row.note}</Notice>}
              {row.canSubmit && <Button onPress={() => { void run(r, 'submit', LEAVE_SENT as string); }} busy={busy === r.id} disabled={!!busy}>Submit</Button>}
              {row.canCancel && <Button kind="plain" onPress={() => cancel(r)} disabled={!!busy}>{row.cancelLabel}</Button>}
            </Card>
          );
        })}
    </Screen>
  );
}
