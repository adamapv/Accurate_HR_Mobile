// A group chat's own page (?id=<chat>): who is in it, adding people, taking someone out (for a level with Manage chat groups), a new name, and leaving. Who
// is listed and who can be added, what is sent, what is asked before leaving or taking someone out and every word are the web app's own rules
// (shared/chat-core.js); the Worker decides what is allowed and says so in its own words. It needs signal.
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { can } from '@shared/access.js';
import { CHAT_GROUP, CHAT_GROUP_NAME_MAX, CHAT_NEW, CHAT_RENAME, chatPeopleShown, chatPickToggle, groupAddDraft, groupCount, groupExclude, groupPeople, groupRemoveDraft, leaveConfirm, renameDraft, takeOutConfirm, takeOutSaid } from '@shared/chat-core.js';
import { useSession } from '@/lib/session';
import { Avatar, Body, Button, Empty, Field, Heading, List, Loading, Notice, Problem, Row, Screen, Title } from '@/ui';

type Person = { id: string; name: string; position?: string | null };
type Thread = { id: string; kind: string; title?: string | null; others?: Person[] };
type Ask = { title: string; body: string; confirmLabel: string };
const WORDS = CHAT_GROUP as { fallback: string; add: string; addDo: string; added: string; leave: string; rename: string; takeOut: string };
const NAME = CHAT_RENAME as { title: string; label: string; confirmLabel: string; said: string };
const NEW = CHAT_NEW as { search: string; none: string };

export default function ChatGroup() {
  const { state, api, changed } = useSession();
  const { id, rename } = useLocalSearchParams<{ id: string; rename?: string }>();
  const path = `/chat/threads/${id}`;
  const [thread, setThread] = useState<Thread | null>(null);
  const [me, setMe] = useState('');
  const [mode, setMode] = useState<'people' | 'add' | 'rename'>(rename ? 'rename' : 'people');
  const [title, setTitle] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Person[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState('');
  const load = useCallback(async () => {
    try { const d = await api<{ thread: Thread; me: string }>(`${path}/messages`, { params: { limit: 1 } }); setThread(d.thread); setMe(d.me); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Could not load.'); }
  }, [api, path]);
  useEffect(() => { void load(); }, [load]);
  // The people who can be added are searched as the name is typed, a moment after the last key.
  useEffect(() => {
    if (mode !== 'add') return undefined;
    let live = true;
    const t = setTimeout(() => {
      api<{ people: Person[] }>('/chat/people', { params: { q: q.trim() } }).then(d => { if (live) setRows(d.people); }).catch(e => { if (live) setProblem(e instanceof Error ? e.message : 'Could not load.'); });
    }, q ? 250 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [mode, q, api]);
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (!thread) return problem ? <Screen><Title>{WORDS.fallback}</Title><Problem>{problem}</Problem></Screen> : <Loading />;
  const canSend = can(state.me.access, 'chat', 'edit') as boolean, manages = can(state.me.access, 'chat_groups', 'edit') as boolean;

  const run = async (fn: () => Promise<string>) => {
    setBusy(true); setProblem(''); setSaid('');
    try { const told = await fn(); await load(); changed(); setSaid(told); }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy(false);
  };
  const add = () => run(async () => { await api(`${path}/members`, { method: 'POST', body: groupAddDraft(picked) }); setMode('people'); setPicked([]); setQ(''); return WORDS.added; });
  const saveName = () => {
    const body = renameDraft(title ?? thread.title, thread) as { title: string } | null;
    if (!body) { setMode('people'); return; }
    void run(async () => { await api(path, { method: 'PUT', body }); setMode('people'); setTitle(null); return NAME.said; });
  };
  const takeOut = (p: Person) => {
    const ask = takeOutConfirm(p, thread) as Ask;
    Alert.alert(ask.title, ask.body, [{ text: 'Cancel', style: 'cancel' }, { text: ask.confirmLabel, style: 'destructive', onPress: () => {
      void run(async () => { await api(`${path}/remove`, { method: 'POST', body: groupRemoveDraft(p) }); return takeOutSaid(p) as string; });
    } }]);
  };
  const leave = () => {
    const ask = leaveConfirm(thread) as Ask;
    Alert.alert(ask.title, ask.body, [{ text: 'Cancel', style: 'cancel' }, { text: ask.confirmLabel, style: 'destructive', onPress: () => {
      setBusy(true); setProblem('');
      api(`${path}/leave`, { method: 'POST' }).then(() => { changed(); router.dismiss(2); })
        .catch(e => { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); setBusy(false); });
    } }]);
  };

  if (mode === 'add') {
    const list = chatPeopleShown(rows, groupExclude(thread, me)) as Person[];
    return (
      <Screen>
        <Title>{WORDS.add}</Title>
        <Field label="Search" placeholder={NEW.search} value={q} onChangeText={setQ} autoCorrect={false} />
        <Problem>{problem}</Problem>
        {rows === null ? (!problem && <Body tone="muted">Loading…</Body>) : list.length === 0 ? <Empty icon="search-outline">{NEW.none}</Empty> : (
          <List>
            {list.map((p, n) => { const on = picked.includes(p.id); return (
              <Row key={p.id} title={p.name} sub={p.position} last={n === list.length - 1} right={<Body tone={on ? 'ok' : 'muted'}>{on ? 'Added' : 'Add'}</Body>}
                onPress={busy ? undefined : () => setPicked(ids => chatPickToggle(ids, p) as string[])} />
            ); })}
          </List>
        )}
        <Button onPress={() => { void add(); }} busy={busy} disabled={!picked.length}>{picked.length ? `${WORDS.addDo} (${picked.length})` : WORDS.addDo}</Button>
        <Button kind="plain" onPress={() => { setMode('people'); setPicked([]); setProblem(''); }} disabled={busy}>Back</Button>
      </Screen>
    );
  }
  if (mode === 'rename') {
    return (
      <Screen>
        <Title>{NAME.title}</Title>
        <Field label={NAME.label} value={title ?? thread.title ?? ''} onChangeText={setTitle} maxLength={CHAT_GROUP_NAME_MAX as number} autoFocus />
        <Problem>{problem}</Problem>
        <Button onPress={saveName} busy={busy}>{NAME.confirmLabel}</Button>
        <Button kind="plain" onPress={() => { setMode('people'); setTitle(null); setProblem(''); }} disabled={busy}>Back</Button>
      </Screen>
    );
  }
  const people = groupPeople(thread, me) as Person[];
  return (
    <Screen>
      <Title>{thread.title || WORDS.fallback}</Title>
      <Body tone="muted">{groupCount(thread) as string}</Body>
      {!!said && <Notice tone="ok">{said}</Notice>}
      <Problem>{problem}</Problem>
      {canSend && <Button kind="plain" icon="person-add-outline" onPress={() => { setSaid(''); setMode('add'); }} disabled={busy}>{WORDS.add}</Button>}
      <Heading>People</Heading>
      <List>
        {people.map((p, n) => (
          <Row key={p.id} title={p.name} sub={p.position} last={n === people.length - 1}
            right={manages && p.id !== me ? <Button kind="plain" onPress={() => takeOut(p)} disabled={busy}>{WORDS.takeOut}</Button> : <Avatar name={p.id === me ? state.me.employee.name : p.name} size={32} />} />
        ))}
      </List>
      {canSend && <Button kind="plain" icon="create-outline" onPress={() => { setSaid(''); setMode('rename'); }} disabled={busy}>{WORDS.rename}</Button>}
      <Button kind="danger" onPress={leave} busy={busy}>{WORDS.leave}</Button>
    </Screen>
  );
}
