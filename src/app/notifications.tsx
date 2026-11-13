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
import { Body, Button, Empty, List, Notice, Pill, Problem, Row, Screen, Title } from '@/ui';

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
    if (!n.read_at) api(notifReadPath(n) as string, { method: 'POST', body: {} }).then(() => changed(true)).catch(() => {});
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
      {notes.offlineAt !== null && <Notice tone="warn" icon="cloud-offline-outline">{`No signal. Showing what was saved at ${fmtTime(notes.offlineAt)}.`}</Notice>}
      <Problem>{problem || notes.error}</Problem>
      {!!said && <Notice tone="neutral">{said}</Notice>}
      {unread > 0 && <Button kind="plain" icon="checkmark-done-outline" onPress={() => { void readAll(); }}>Mark all read</Button>}
      {!rows ? (notes.error ? null : <Body tone="muted">Loading…</Body>) : rows.length === 0 ? <Empty icon="notifications-outline">{NO_NOTIFS as string}</Empty> : (
        <List>
          {rows.map((n, i) => (
            <Row key={n.id} icon={n.read_at ? 'notifications-outline' : 'notifications'} tint={n.read_at ? 'slate' : 'blue'} title={n.title} sub={[n.body, fmtDateTime(n.created_at)].filter(Boolean).join(' · ')}
              right={n.read_at ? undefined : <Pill tone="info">New</Pill>} onPress={() => open(n)} last={i === rows.length - 1} />
          ))}
        </List>
      )}
    </Screen>
  );
}
