// The chats: the office's first, then the rest, each with its last message, when, and how many are waiting. What a chat is called, what its row says and how the
// list is narrowed are the web app's own rules (shared/chat-core.js).
import { useEffect, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { chatBadge, chatListTime, chatName, chatPreview, chatRows } from '@shared/chat-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtTime } from '@/lib/dates';
import { Body, Button, Card, Field, Problem, Screen, Title } from '@/ui';

export type ChatThreadRow = { id: string; kind: string; title?: string | null; muted?: boolean; unread: number; mentioned?: boolean; others?: { id: string; name: string }[]; updated_at?: string;
  last?: { sender_id?: string; sender_name?: string; text?: string; created_at?: string; photo?: boolean; audio?: boolean; audio_secs?: number; deleted?: boolean; system?: boolean } | null };

export default function Chats() {
  const { state } = useSession();
  const threads = useRead<{ me: string; threads: ChatThreadRow[] }>('/chat/threads');
  const [q, setQ] = useState('');
  // The list is asked for again every 15 seconds while the app is in front, as on the web.
  useEffect(() => {
    const t = setInterval(() => { if (AppState.currentState === 'active') void threads.reload(); }, 15000);
    return () => clearInterval(t);
  }, [threads.reload]);
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  const me = threads.data?.me || state.me.employee.id, now = new Date();
  const shown = chatRows(threads.data?.threads, q) as ChatThreadRow[];
  return (
    <Screen>
      <Title>Chats</Title>
      <Field label="Search chats" value={q} onChangeText={setQ} autoCorrect={false} />
      {threads.offlineAt !== null && <Body tone="muted">No signal. Showing what was saved at {fmtTime(threads.offlineAt)}.</Body>}
      <Problem>{threads.error}</Problem>
      {!threads.data ? (threads.error ? null : <Body tone="muted">Loading…</Body>)
        : shown.length === 0 ? <Body tone="muted">{q.trim() ? 'No chats match that.' : 'No chats yet.'}</Body>
        : shown.map(t => {
          const line = chatPreview(t, me) as { who: string; text: string; photo: boolean; audio: boolean };
          const name = chatName(t) as string;
          return (
            <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={`${name}. ${t.unread > 0 ? `${t.unread} unread. ` : ''}${line.who}${line.text || ''}`} onPress={() => router.push({ pathname: '/chat', params: { id: t.id } })}>
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <View style={{ flex: 1 }}><Body>{name}{t.muted ? ' · muted' : ''}</Body></View>
                  <Body tone="muted">{chatListTime(t.last?.created_at || t.updated_at, now) as string}</Body>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <View style={{ flex: 1 }}><Body tone="muted">{line.who}{line.photo ? 'Photo: ' : ''}{line.text}</Body></View>
                  {t.unread > 0 && <Body tone="ok">{t.mentioned ? '@ ' : ''}{chatBadge(t.unread) as string}</Body>}
                </View>
              </Card>
            </Pressable>
          );
        })}
      <Button kind="plain" onPress={() => router.back()}>Back</Button>
    </Screen>
  );
}
