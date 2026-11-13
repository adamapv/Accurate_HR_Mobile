// One support request (?id=<request>): the messages with their pictures, a reply, Mark solved or Reopen, and letting support look at the account for a few days
// (offered only to a level that may allow it). What each message says, what the person may do, the access card and every word are the web app's own rules
// (shared/field-core.js). Each step answers with the whole thread again, so the screen shows what the Worker now holds. It needs signal.
import { useEffect, useState } from 'react';
import { Alert, AppState, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { can } from '@shared/access.js';
import { SUPPORT_ALLOW, SUPPORT_BODY_MAX, SUPPORT_DAYS, SUPPORT_DAYS_START, SUPPORT_REOPEN, SUPPORT_REPLY, SUPPORT_SOLVE, SUPPORT_SOLVED_NOTE, SUPPORT_TEAM_PILL, SUPPORT_WITHDRAW, supportAccess, supportActions, supportAsked, supportMessage,
  supportPath, supportReplyDraft, supportState } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtDateTime } from '@/lib/dates';
import { pillTone, type SupportRequest } from '@/app/support';
import { SupportImage, SupportPics, type Pic } from '@/support';
import { Body, Button, Card, Choice, Field, Heading, Loading, Notice, Pill, Problem, Screen, Title } from '@/ui';

type Message = { id: string; from: string; author_name: string; body: string; created_at: string; files?: { id: string }[] };
type Thread = { request: SupportRequest; messages: Message[]; can_allow_access: boolean };
type Told = { system: true; text: string } | { system: false; who: string; team: boolean; when: string; text: string; files: string[] };
type Access = { head?: string; open?: boolean; text?: string; withdraw?: boolean; allow?: boolean; note?: string } | null;
const REPLY = SUPPORT_REPLY as { label: string; example: string; send: string }, ALLOW = SUPPORT_ALLOW as { label: string; howLong: string; said: string };
const WITHDRAW = SUPPORT_WITHDRAW as { label: string; title: string; body: string; confirmLabel: string };

export default function SupportRequestScreen() {
  const { state, api, changed } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const read = useRead<Thread>(id ? supportPath(id) as string : null);
  const [fresh, setFresh] = useState<Thread | null>(null);   // the thread as the last step answered it
  const [reply, setReply] = useState('');
  const [pics, setPics] = useState<Pic[]>([]);
  const [uploading, setUploading] = useState(false);
  const [days, setDays] = useState(String(SUPPORT_DAYS_START));
  const [busy, setBusy] = useState('');
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState('');
  const reload = read.reload;
  useEffect(() => { const t = setInterval(() => { if (AppState.currentState === 'active') void reload().then(() => setFresh(null)); }, 30000); return () => clearInterval(t); }, [reload]);
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  const data = fresh || read.data;
  if (!data) return read.error ? <Screen><Title>Support</Title><Problem>{read.error}</Problem></Screen> : <Loading />;
  const me = state.me.employee.id, r = data.request;
  const st = supportState(r, me) as { label: string; tone: string };
  const acts = supportActions(r, can(state.me.access, 'support', 'edit')) as { reply: boolean; solve: boolean; reopen: boolean };
  const access = supportAccess(data, me, fmtDateTime) as Access;
  const run = async (key: string, part: string, opts: { method: 'POST' | 'DELETE'; body?: object }, told = '') => {
    setBusy(key); setProblem(''); setSaid('');
    try { setFresh(await api<Thread>(supportPath(r.id, part) as string, opts)); changed(); setSaid(told); return true; }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); return false; }
    finally { setBusy(''); }
  };
  const send = async () => { if (await run('reply', '/messages', { method: 'POST', body: supportReplyDraft(reply, pics.map(p => p.id)) })) { setReply(''); setPics([]); } };
  const withdraw = () => Alert.alert(WITHDRAW.title, WITHDRAW.body, [{ text: 'Cancel', style: 'cancel' }, { text: WITHDRAW.confirmLabel, style: 'destructive', onPress: () => { void run('access', '/access', { method: 'DELETE' }); } }]);
  return (
    <Screen>
      <Title>{r.subject}</Title>
      <Body tone="muted">{supportAsked(r, me, fmtDateTime) as string}</Body>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pill tone={pillTone(st.tone)}>{st.label}</Pill>
      </View>
      {data.messages.map(m => { const t = supportMessage(m, fmtDateTime) as Told; return t.system ? <Body key={m.id} tone="muted">{t.text}</Body> : (
        <Card key={m.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Body strong>{t.who}</Body>
            {t.team && <Pill tone="info">{SUPPORT_TEAM_PILL as string}</Pill>}
          </View>
          <Body tone="muted">{t.when}</Body>
          <Body>{t.text}</Body>
          {t.files.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{t.files.map(f => <SupportImage key={f} id={f} />)}</View>}
        </Card>
      ); })}
      {!!said && <Notice tone="ok">{said}</Notice>}
      <Problem>{problem || read.error}</Problem>

      {acts.reply && (
        <>
          <Field label={REPLY.label} placeholder={REPLY.example} value={reply} onChangeText={setReply} multiline maxLength={SUPPORT_BODY_MAX as number} />
          <SupportPics pics={pics} onChange={setPics} onBusy={setUploading} disabled={!!busy} />
          <Button onPress={() => { void send(); }} busy={busy === 'reply'} disabled={!!busy || uploading || !reply.trim()}>{REPLY.send}</Button>
        </>
      )}
      {acts.solve && <Button kind="plain" icon="checkmark-done-outline" onPress={() => { void run('solve', '/solve', { method: 'POST' }); }} busy={busy === 'solve'} disabled={!!busy}>{SUPPORT_SOLVE as string}</Button>}
      {r.status === 'solved' && <Body tone="muted">{SUPPORT_SOLVED_NOTE as string}</Body>}
      {acts.reopen && <Button kind="plain" icon="refresh-outline" onPress={() => { void run('reopen', '/reopen', { method: 'POST' }); }} busy={busy === 'reopen'} disabled={!!busy}>{SUPPORT_REOPEN as string}</Button>}

      {!!access?.head && (
        <>
          <Heading>{access.head}</Heading>
          <Card>
            <Body tone={access.open ? 'fg' : 'muted'}>{access.text}</Body>
            {access.open && access.withdraw && <Button kind="plain" onPress={withdraw} disabled={!!busy}>{WITHDRAW.label}</Button>}
            {access.allow && (
              <>
                <Body>{ALLOW.howLong}</Body>
                <Choice options={(SUPPORT_DAYS as [number, string][]).map(([v, label]) => ({ key: String(v), label }))} value={days} onChange={setDays} />
                <Button kind="plain" onPress={() => { void run('access', '/access', { method: 'POST', body: { days: Number(days) } }, ALLOW.said); }} busy={busy === 'access'} disabled={!!busy}>{ALLOW.label}</Button>
              </>
            )}
          </Card>
        </>
      )}
      {!!access?.note && <Body tone="muted">{access.note}</Body>}
    </Screen>
  );
}
