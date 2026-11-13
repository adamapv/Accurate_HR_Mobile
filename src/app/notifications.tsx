// Notifications: what the person has been told (leave decisions, approvals, tasks), newest first. A tap marks one read and opens the screen it is about, when the
// app has that screen. The unread count, the empty text and where a link leads are the web app's own rules (shared/field-core.js).
import { useState } from 'react';
import { Pressable } from 'react-native';
import { Redirect, router, type Href } from 'expo-router';
import { NO_NOTIFS, notifReadPath, notifUnread } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtDateTime, fmtTime } from '@/lib/dates';
import { screenFor } from '@/lib/links';
import { Body, Button, Card, Problem, Screen, Title } from '@/ui';

type Note = { id: string; title: string; body: string | null; link: string | null; read_at: string | null; created_at: string };

export default function Notifications() {
  const { state, api, changed } = useSession();
  const notes = useRead<{ rows: Note[]; unread: number }>('/notifications');
  const [problem, setProblem] = useState('');
  const [said, setSaid] = useState('');
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  const rows = notes.data?.rows, unread = notifUnread(notes.data) as number;
  const open = (n: Note) => {
    setSaid('');
    if (!n.read_at) api(notifReadPath(n) as string, { method: 'POST', body: {} }).then(changed).catch(() => {});
    const to = screenFor(n.link);
    if (to) router.push(to as Href);
    else setSaid('That one opens in the Field view in your browser for now.');
  };
  const readAll = async () => {
    setProblem('');
    try { await api('/notifications/read-all', { method: 'POST', body: {} }); changed(); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
  };
  return (
    <Screen>
      <Title>Notifications</Title>
      {notes.offlineAt !== null && <Body tone="muted">No signal. Showing what was saved at {fmtTime(notes.offlineAt)}.</Body>}
      <Problem>{problem || notes.error}</Problem>
      {!!said && <Body tone="muted">{said}</Body>}
      {unread > 0 && <Button kind="plain" onPress={() => { void readAll(); }}>Mark all read</Button>}
      {!rows ? (notes.error ? null : <Body tone="muted">Loading…</Body>) : rows.length === 0 ? <Body tone="muted">{NO_NOTIFS as string}</Body> : rows.map(n => (
        <Pressable key={n.id} accessibilityRole="button" accessibilityLabel={`${n.read_at ? '' : 'Unread. '}${n.title}`} onPress={() => open(n)}>
          <Card>
            <Body tone={n.read_at ? 'muted' : 'fg'}>{n.read_at ? n.title : `● ${n.title}`}</Body>
            {!!n.body && <Body tone="muted">{n.body}</Body>}
            <Body tone="muted">{fmtDateTime(n.created_at)}</Body>
          </Card>
        </Pressable>
      ))}
      <Button kind="plain" onPress={() => router.back()}>Back</Button>
    </Screen>
  );
}
