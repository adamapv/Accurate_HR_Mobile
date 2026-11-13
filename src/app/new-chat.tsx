// New chat: pick someone in the company to message, or name a group and pick its people. Who is offered, what is sent and the words are the web app's own
// rules (shared/chat-core.js); the Worker finds the chat with a person again if there already is one. It needs signal, and opens the chat once it is made.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { CHAT_GROUP_NAME_MAX, CHAT_NEW, chatDmDraft, chatGroupDraft, chatGroupReady, chatPeopleShown, chatPickToggle } from '@shared/chat-core.js';
import { useSession } from '@/lib/session';
import { Avatar, Body, Button, Choice, Empty, Field, List, Problem, Row, Screen, Title } from '@/ui';

type Person = { id: string; name: string; position: string | null };
const WORDS = CHAT_NEW as { title: string; group: string; groupName: string; groupExample: string; create: string; search: string; none: string };

export default function NewChat() {
  const { state, api, changed } = useSession();
  const [mode, setMode] = useState<'one' | 'group'>('one');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Person[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  // The people are searched as the name is typed, a moment after the last key.
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      api<{ people: Person[] }>('/chat/people', { params: { q: q.trim() } }).then(d => { if (live) { setRows(d.people); setProblem(''); } }).catch(e => { if (live) setProblem(e instanceof Error ? e.message : 'Could not load.'); });
    }, q ? 250 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [q, api]);
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  const start = async (body: object) => {
    setBusy(true); setProblem('');
    try { const d = await api<{ thread: { id: string } }>('/chat/threads', { method: 'POST', body }); changed(); router.replace({ pathname: '/chat', params: { id: d.thread.id } }); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); setBusy(false); }
  };
  const list = chatPeopleShown(rows, []) as Person[], group = mode === 'group';
  return (
    <Screen>
      <Title>{group ? WORDS.group : WORDS.title}</Title>
      <Choice options={[{ key: 'one', label: WORDS.title }, { key: 'group', label: WORDS.group }]} value={mode} onChange={v => { setMode(v); setPicked([]); }} disabled={busy} />
      {group && <Field label={WORDS.groupName} placeholder={WORDS.groupExample} value={title} onChangeText={setTitle} maxLength={CHAT_GROUP_NAME_MAX as number} />}
      <Field label="Search" placeholder={WORDS.search} value={q} onChangeText={setQ} autoCorrect={false} />
      <Problem>{problem}</Problem>
      {rows === null ? (!problem && <Body tone="muted">Loading…</Body>) : list.length === 0 ? <Empty icon="search-outline">{WORDS.none}</Empty> : (
        <List>
          {list.map((p, n) => { const on = picked.includes(p.id); return (
            <Row key={p.id} title={p.name} sub={p.position} last={n === list.length - 1}
              right={group ? <Body tone={on ? 'ok' : 'muted'}>{on ? 'Added' : 'Add'}</Body> : <View><Avatar name={p.name} size={32} /></View>}
              onPress={busy ? undefined : () => (group ? setPicked(ids => chatPickToggle(ids, p) as string[]) : void start(chatDmDraft(p)))} />
          ); })}
        </List>
      )}
      {group && <Button onPress={() => { void start(chatGroupDraft(title, picked)); }} busy={busy} disabled={!(chatGroupReady(title, picked) as boolean)}>{picked.length ? `${WORDS.create} (${picked.length})` : WORDS.create}</Button>}
    </Screen>
  );
}
