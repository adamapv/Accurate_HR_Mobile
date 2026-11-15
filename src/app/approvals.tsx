// Approvals: leave requests, days of time and expense claims waiting for the person's decision, for a level that can approve them. Each is a card with Approve
// and Reject; a reject asks for the reason, which is sent to the person. Approving leave that clashes with the schedule asks first, saying who comes off what.
// Which kinds are shown, what each row says and what is asked are the web app's own rules (shared/field-core.js); the server checks every decision again.
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { can } from '@shared/access.js';
import { approvalDraft, approvalKindsFor, approvalPath, approvalRowOf, approvalSaid, leaveBoardAsk, rejectAsk } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtDate, fmtTime, parseDay } from '@/lib/dates';
import { fmtMoney } from '@/lib/money';
import { useTheme } from '@/theme';
import { Body, Button, Card, Choice, Empty, Field, Notice, Pill, Problem, Screen, Title } from '@/ui';

type Kind = { key: 'leave' | 'time' | 'expenses'; label: string; noun: string; one: string; pendingPath: string; empty: string; sub: string };
type Row = { id: string; employee_name?: string } & Record<string, unknown>;
type Shown = { title: string; meta: string; notes: string[]; flags: string[] };
const fmt = { fmtDate: (d: string) => fmtDate(String(d).slice(0, 10)), fmtHours: (n: number) => `${Number(n || 0).toFixed(1).replace(/\.0$/, '')}h`, fmtMoney };
const day = (iso: string) => parseDay(iso).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

export default function Approvals() {
  const { state } = useSession();
  const { kind: want } = useLocalSearchParams<{ kind?: string }>();
  const access = state.status === 'signedIn' ? state.me.access : {};
  const kinds = approvalKindsFor((area: string, need: string) => can(access, area, need as 'approve')) as Kind[];
  const [picked, setPicked] = useState('');
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (!kinds.length) return <Screen><Title>Approvals</Title><Empty icon="lock-closed-outline">Your access level does not approve anything.</Empty></Screen>;
  const kind = kinds.find(k => k.key === (picked || want)) || kinds[0];
  return (
    <Screen>
      <Title>Approvals</Title>
      {kinds.length > 1 && <Choice options={kinds.map(k => ({ key: k.key, label: k.label }))} value={kind.key} onChange={setPicked} />}
      <Queue key={kind.key} kind={kind} />
    </Screen>
  );
}

function Queue({ kind }: { kind: Kind }) {
  const { api, changed } = useSession();
  const t = useTheme();
  const list = useRead<{ rows: Row[] }>(kind.pendingPath);
  const [busy, setBusy] = useState('');
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState('');
  const [rejecting, setRejecting] = useState<Row | null>(null);
  const [reason, setReason] = useState('');
  const rows = list.data?.rows;

  const decide = async (r: Row, action: 'approve' | 'reject', note = '') => {
    setBusy(r.id); setProblem(''); setSaid('');
    try {
      await api(approvalPath(kind, r.id, action) as string, { method: 'POST', body: approvalDraft(note) });
      setSaid(`${approvalSaid(action) as string}: ${r.employee_name || ''}`.trim());
      await list.reload(); changed();
    } catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy('');
  };
  // Approving leave that is planned on the schedule board asks first: the person comes off those jobs and goes on the leave row.
  const approve = async (r: Row) => {
    if (kind.key === 'leave') {
      setBusy(r.id);
      const check = await api<Record<string, unknown>>(`/leave-requests/${r.id}/schedule-check`).catch(() => null);
      setBusy('');
      const ask = leaveBoardAsk(check ? [check] : [], day) as { title: string; body: string; confirmLabel: string } | null;
      if (ask) return Alert.alert(ask.title, ask.body, [{ text: 'Cancel', style: 'cancel' }, { text: ask.confirmLabel, onPress: () => { void decide(r, 'approve'); } }]);
    }
    void decide(r, 'approve');
  };
  const ask = rejectAsk(kind) as { title: string; label: string; confirmLabel: string };

  return (
    <>
      <Body tone="muted">{kind.sub}</Body>
      {list.offlineAt !== null && <Notice tone="warn" icon="cloud-offline-outline">{`No signal. Showing what was saved at ${fmtTime(list.offlineAt)}. A decision needs signal.`}</Notice>}
      <Problem>{list.error}</Problem>
      {!!said && <Notice tone="ok">{said}</Notice>}
      <Problem>{problem}</Problem>
      {!rows ? (list.error ? null : <Body tone="muted">Loading…</Body>)
        : rows.length === 0 ? <Empty icon="checkmark-done-outline">{kind.empty}</Empty>
        : rows.map(r => {
          const shown = approvalRowOf(kind, r, fmt) as Shown;
          return (
            <Card key={r.id}>
              <Body strong>{shown.title}</Body>
              <Body tone="muted">{shown.meta}</Body>
              {shown.flags.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{shown.flags.map(f => <Pill key={f} tone="warn">{f}</Pill>)}</View>}
              {shown.notes.map(n => <Body key={n} tone="muted">{n}</Body>)}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}><Button icon="checkmark" onPress={() => { void approve(r); }} busy={busy === r.id} disabled={!!busy && busy !== r.id}>Approve</Button></View>
                <View style={{ flex: 1 }}><Button kind="plain" icon="close" onPress={() => { setReason(''); setRejecting(r); }} disabled={!!busy}>Reject</Button></View>
              </View>
            </Card>
          );
        })}

      <Modal visible={!!rejecting} transparent animationType="slide" onRequestClose={() => setRejecting(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <View style={{ backgroundColor: t.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, gap: 14 }}>
            <Body strong>{ask.title}</Body>
            <Field label={ask.label} value={reason} onChangeText={setReason} multiline autoFocus />
            <Button kind="danger" onPress={() => { const r = rejecting; setRejecting(null); if (r) void decide(r, 'reject', reason.trim()); }}>{ask.confirmLabel}</Button>
            <Button kind="plain" onPress={() => setRejecting(null)}>Cancel</Button>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
