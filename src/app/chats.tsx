// The chats: the office's first, then the rest, each with its last message, when, and how many are waiting. What a chat is called, what its row says and how the
// list is narrowed are the web app's own rules (shared/chat-core.js).
import { useEffect, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { can } from '@shared/access.js';
import { CHAT_NEW, chatBadge, chatListTime, chatName, chatPreview, chatRows } from '@shared/chat-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtTime } from '@/lib/dates';
import { useTheme } from '@/theme';
import { Avatar, Body, Button, Empty, Field, List, Notice, Pill, Problem, Screen, Title } from '@/ui';

export type ChatThreadRow = { id: string; kind: string; title?: string | null; muted?: boolean; unread: number; mentioned?: boolean; others?: { id: string; name: string }[]; updated_at?: string;
  last?: { sender_id?: string; sender_name?: string; text?: string; created_at?: string; photo?: boolean; audio?: boolean; audio_secs?: number; deleted?: boolean; system?: boolean } | null };

export default function Chats() {
  const { state } = useSession();
  const theme = useTheme();
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
      {can(state.me.access, 'chat', 'edit') && <Button kind="plain" icon="create-outline" onPress={() => router.push('/new-chat')}>{(CHAT_NEW as { title: string }).title}</Button>}
      <Field label="Search chats" placeholder="A name or a group" value={q} onChangeText={setQ} autoCorrect={false} />
      {threads.offlineAt !== null && <Notice tone="warn" icon="cloud-offline-outline">{`No signal. Showing what was saved at ${fmtTime(threads.offlineAt)}.`}</Notice>}
      <Problem>{threads.error}</Problem>
      {!threads.data ? (threads.error ? null : <Body tone="muted">Loading…</Body>)
        : shown.length === 0 ? <Empty icon="chatbubbles-outline">{q.trim() ? 'No chats match that.' : 'No chats yet.'}</Empty>
        : <List>{shown.map((t, n) => {
          const line = chatPreview(t, me) as { who: string; text: string; photo: boolean; audio: boolean };
          const name = chatName(t) as string;
          return (
            <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={`${name}. ${t.unread > 0 ? `${t.unread} unread. ` : ''}${line.who}${line.text || ''}`} onPress={() => router.push({ pathname: '/chat', params: { id: t.id } })}
              style={({ pressed }) => pressed && { backgroundColor: theme.surface2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 }}>
                  {n < shown.length - 1 && <View style={{ position: 'absolute', left: 16 + 46 + 14, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: theme.line }} />}
                  <Avatar name={name} size={46} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <View style={{ flex: 1 }}><Body strong>{name}{t.muted ? ' · muted' : ''}</Body></View>
                      <Body tone="muted">{chatListTime(t.last?.created_at || t.updated_at, now) as string}</Body>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <View style={{ flex: 1 }}><Body tone="muted">{line.who}{line.photo ? 'Photo: ' : ''}{line.text}</Body></View>
                      {t.unread > 0 && <Pill tone="info">{`${t.mentioned ? '@ ' : ''}${chatBadge(t.unread) as string}`}</Pill>}
                    </View>
                  </View>
                </View>
            </Pressable>
          );
        })}</List>}
    </Screen>
  );
}
