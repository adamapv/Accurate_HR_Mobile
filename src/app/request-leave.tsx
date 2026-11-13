// Request leave: the kind, the days, optionally the hours, and a reason. As it is filled in the server says what it would be (its hours, the balance after, leave
// already on those days, who else is off); that never stops it being sent, a manager decides. It is sent straight for approval and needs signal.
// What the form opens with, what stands in its way, what is asked and how the answer is written are the web app's own rules (shared/field-core.js).
// ?type=<leave type id> opens it on that kind (from a job card activity that needs approval).
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { can } from '@shared/access.js';
import { LEAVE_HOURS_HINT, LEAVE_SENT, leaveDraft, leaveFormStart, leavePickStart, leavePreviewAsk, leavePreviewNotes, leaveProblem } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtDate } from '@/lib/dates';
import { ChooseField, WhenField } from '@/pickers';
import { Body, Button, Card, Field, Problem, Screen, Title } from '@/ui';

type LeaveType = { id: string; name: string };
type Form = { leave_type_id: string; start_date: string; end_date: string; hours_requested: string; reason: string };
type Note = { tone: 'info' | 'warn'; lines: string[] };
const fmt = { fmtDate: (d: string) => fmtDate(String(d).slice(0, 10)), fmtHours: (n: number) => `${Number(n).toFixed(1)}h` };

export default function RequestLeave() {
  const { state, api, changed } = useSession();
  const { type } = useLocalSearchParams<{ type?: string }>();
  const types = useRead<{ rows: LeaveType[] }>('/leave-types');
  const list = types.data?.rows || [];
  const [form, setForm] = useState<Form>(() => leaveFormStart(list, type || '') as Form);
  // The kinds of leave may still be on their way when the form opens: pick one when they arrive.
  useEffect(() => { if (list.length) setForm(f => f.leave_type_id ? f : { ...f, leave_type_id: (leaveFormStart(list, type || '') as Form).leave_type_id }); }, [list.length]);
  const [preview, setPreview] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [sent, setSent] = useState(false);
  // What it would be, asked a moment after the last change.
  const ask = leavePreviewAsk(form) as Record<string, string> | null;
  const askKey = ask ? new URLSearchParams(ask).toString() : '';
  useEffect(() => {
    if (!askKey) { setPreview(null); return; }
    let gone = false;
    const timer = setTimeout(() => { api(`/leave-requests/preview?${askKey}`).then(r => { if (!gone) setPreview(r); }).catch(() => { if (!gone) setPreview(null); }); }, 250);
    return () => { gone = true; clearTimeout(timer); };
  }, [api, askKey]);
  if (state.status !== 'signedIn' || !can(state.me.access, 'leave', 'edit')) return <Redirect href="/" />;

  const send = async () => {
    const bad = leaveProblem(form) as string;
    if (bad) return setProblem(bad);
    setBusy(true); setProblem('');
    try { await api('/leave-requests', { method: 'POST', body: leaveDraft(form) }); setSent(true); changed(); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy(false);
  };
  if (sent) {
    return (
      <Screen centered>
        <Title>{LEAVE_SENT as string}</Title>
        <Body tone="muted">You’ll be told when it is decided.</Body>
        <Button onPress={() => router.back()}>Done</Button>
      </Screen>
    );
  }
  const chosen = list.find(t => t.id === form.leave_type_id);
  const notes = leavePreviewNotes(preview, form.hours_requested, fmt) as Note[];
  return (
    <Screen>
      <Title>Request leave</Title>
      <ChooseField<LeaveType> label="Leave type" placeholder={types.data ? 'Choose the kind of leave' : 'Loading…'} value={chosen?.name || ''} options={list.map(t => ({ key: t.id, title: t.name, item: t }))}
        onChoose={t => setForm(f => ({ ...f, leave_type_id: t.id }))} />
      <WhenField label="Start date" mode="date" value={form.start_date} onChange={v => setForm(f => leavePickStart(f, v) as Form)} />
      <WhenField label="End date" mode="date" value={form.end_date} minDate={form.start_date || undefined} onChange={v => setForm(f => ({ ...f, end_date: v }))} />
      <View style={{ gap: 4 }}>
        <Field label="Hours" value={form.hours_requested} onChangeText={v => setForm(f => ({ ...f, hours_requested: v.replace(/[^\d.]/g, '') }))} keyboardType="decimal-pad" placeholder="All working days" />
        <Body tone="muted">{LEAVE_HOURS_HINT as string}</Body>
      </View>
      {notes.map((n, i) => (
        <Card key={i}>
          {n.lines.map((l, j) => <Body key={j} tone={n.tone === 'warn' ? 'danger' : i === 0 && j === 0 ? 'fg' : 'muted'}>{l}</Body>)}
        </Card>
      ))}
      <Field label="Reason (optional)" value={form.reason} onChangeText={v => setForm(f => ({ ...f, reason: v }))} multiline maxLength={1000} />
      <Problem>{problem || types.error}</Problem>
      <Button onPress={send} busy={busy}>Submit</Button>
      <Button kind="plain" onPress={() => router.back()} disabled={busy}>Cancel</Button>
    </Screen>
  );
}
