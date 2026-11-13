// One chat: its messages under day chips, with the unread line, names in a group and a tick on the reader's own, and a box to send a text message, a photo
// from the camera, a document from the phone or a voice message recorded here. The menu at the top mutes the chat and, for a group, opens its people and its name; tapping a
// message's reactions shows who reacted. Typing "@" offers the chat's people to mention. Holding a message offers a reaction, Reply, Copy and Delete; a
// document opens through the phone's share sheet.
// How the messages are laid out, how a message's text is cut into words, links and mentions, and what sending puts in the outbox are the web app's own rules
// (shared/chat-core.js). A message goes through the outbox, so one typed with no signal waits in the chat and is sent once.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, FlatList, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { can } from '@shared/access.js';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CHAT_REACTION_REMOVE, CHAT_REACTIONS_TITLE, chatMenu, chatSub, muteDraft, muteSaid, reactionMine, reactionRows, reactionsPath, CHAT_VOICE, voiceDraft, voiceFull, voiceKeep, voicePath, voiceSecs, voiceUploadPath, CHAT_DELETE_CONFIRM, CHAT_DOC_FAILED, CHAT_EMOJI, CHAT_PHOTO_FAILED, CHAT_SEND_DOC, CHAT_SEND_PHOTO, MENTION_LIST, chatDocDraft, chatDocProblem, chatDocUploadPath, chatFileType, mentionCandidates, mentionIds, mentionPick, mentionQuery, chatActions, chatCanReact, chatClock, chatDeleted, chatDeletedText, chatDivider, chatFileLine, chatHue, chatItems, chatName, chatParts, chatPhotoDraft, chatQuote, chatReacted,
  chatReactionDraft, chatSecs, chatSendDraft, mergeChat } from '@shared/chat-core.js';
import { useSession } from '@/lib/session';
import { useOutbox } from '@/lib/use-outbox';
import { ApiError } from '@/lib/api-core';
import { API_URL } from '@/lib/config';
import { openFile } from '@/lib/open-file';
import { VOICE_RECORDING, VOICE_TYPE, VoicePlayer } from '@/voice';
import type { Draft, Entry } from '@/lib/offline-core';
import { radius, space, TOUCH, useTheme } from '@/theme';

const VOICE = CHAT_VOICE as Record<string, string>;
type Person = { id: string; name: string; position?: string | null };
type Quote = { sender_name?: string; text?: string | null; photo?: boolean; audio?: boolean; file?: string | null; deleted?: boolean };
type Msg = { id: string; seq: number; sender_id: string; sender_name?: string; body?: string | null; created_at: string; system?: string; deleted?: boolean; reply?: Quote | null;
  mentions?: { id: string; name: string }[]; reactions?: { emoji: string; count: number; mine: boolean }[]; photo_key?: string | null; audio_key?: string | null; audio_secs?: number; file?: { key?: string; name: string; size?: number } | null };
type Page = { thread: { id: string; kind: string; title?: string | null; muted?: boolean; others?: Person[] }; messages: Msg[]; last_read_seq: number; read_upto: number | null; me: string; rev?: number };
type Item = { kind: 'day' | 'unread' | 'system'; key: string; text: string } | { kind: 'msg'; key: string; m: Msg; mine: boolean; first: boolean; showName: boolean; tick: string } | { kind: 'local'; key: string; e: Entry };

export default function Chat() {
  const { state, api, offline, sessionId, changed } = useSession();
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const path = `/chat/threads/${id}/messages`;
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [head, setHead] = useState<Page | null>(null);
  const [divider, setDivider] = useState<{ seq: number; count: number } | null>(null);
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<Msg | null>(null);       // the message whose choices are showing
  const [replyTo, setReplyTo] = useState<Msg | null>(null);   // the message being answered
  const [sending, setSending] = useState(false);              // a photo or a document on its way
  const [menu, setMenu] = useState(false);                   // the chat's own menu
  const [who, setWho] = useState<{ m: Msg; rows: { emoji: string; id: string; name: string }[] } | null>(null);   // who reacted to a message
  const [told, setTold] = useState('');
  const [rec, setRec] = useState<{ secs: number } | null>(null);   // a voice message being recorded
  const recorder = useAudioRecorder(VOICE_RECORDING);
  const recState = useRef<{ start: number; timer: ReturnType<typeof setInterval> | null; reply: Msg | null; ending: boolean } | null>(null);
  const [caret, setCaret] = useState(0);                      // where the cursor is in the message box
  const [mentions, setMentions] = useState<{ id: string; name: string }[]>([]);   // the people picked from the "@" list
  const [officePeople, setOfficePeople] = useState<Person[] | null>(null);
  const latest = useRef(0), rev = useRef(0), readSent = useRef(0);
  const list = useRef<FlatList<Item>>(null);
  useOutbox();   // redraw when something in the outbox moves
  const waiting = offline.chatEntries().filter(e => e.path === path);

  // Open: the latest page, and where the reader left off. With no signal, the copy kept from last time.
  const open = useCallback(async () => {
    try {
      const d = await api<Page>(path, { params: { limit: 40 } });
      offline.remember(`${path}#latest`, d);
      setDivider(chatDivider(d.messages, d.last_read_seq, d.me) as { seq: number; count: number } | null);
      setHead(d); setMsgs(d.messages); setMore(d.messages.length >= 40); setError('');
      rev.current = d.rev || 0; latest.current = d.messages.reduce((n, m) => Math.max(n, m.seq), 0);
    } catch (e) {
      const kept = offline.recall<Page>(`${path}#latest`);
      if (kept && e instanceof ApiError && e.offline) { setHead(kept.json); setMsgs(kept.json.messages); setError('No signal. Showing the messages saved on this phone.'); }
      else setError(e instanceof ApiError && e.status === 404 ? 'This chat isn’t available any more.' : e instanceof Error ? e.message : 'Could not load.');
    }
  }, [api, offline, path]);
  useEffect(() => { void open(); }, [open]);

  // While it is open and in front: what is new every few seconds, and the latest page now and then (or at once when the chat's revision moves) so a delete or a
  // reaction made elsewhere shows up.
  useEffect(() => {
    if (!head) return undefined;
    let n = 0, stop = false;
    const tick = async () => {
      if (stop || AppState.currentState !== 'active') return;
      try {
        const full = ++n % 10 === 0;
        let d = await api<Page>(path, { params: full ? { limit: 40 } : { after: latest.current } });
        if (!full && (d.rev || 0) !== rev.current) d = await api<Page>(path, { params: { limit: 40 } });
        if (stop) return;
        rev.current = d.rev || 0;
        if (d.messages.length) { setMsgs(prev => mergeChat(prev, d.messages) as Msg[]); latest.current = Math.max(latest.current, ...d.messages.map(m => m.seq)); }
        setHead(h => (h ? { ...h, thread: d.thread || h.thread, read_upto: d.read_upto !== undefined ? d.read_upto : h.read_upto } : h));
        setError('');
      } catch { /* the next look will say */ }
    };
    const timer = setInterval(() => { void tick(); }, 6000);
    return () => { stop = true; clearInterval(timer); };
  }, [!!head, api, path]);

  // Reading: once someone else's message is on screen the chat is marked read up to it.
  useEffect(() => {
    if (!msgs || !head) return;
    const top = msgs.filter(m => m.sender_id !== head.me && !m.system).reduce((n, m) => Math.max(n, m.seq), 0);
    if (top <= Math.max(head.last_read_seq, readSent.current)) return;
    readSent.current = top;
    api(`/chat/threads/${id}/read`, { method: 'POST', body: { seq: top } }).then(() => changed()).catch(() => { readSent.current = 0; });
  }, [msgs, head, api, id, changed]);

  const items = useMemo<Item[]>(() => {
    if (!msgs || !head) return [];
    const laid = chatItems({ msgs, thread: head.thread, head, me: head.me, divider, now: new Date() }) as Item[];
    return [...laid, ...waiting.map(e => ({ kind: 'local' as const, key: e.id, e }))];
  }, [msgs, head, divider, waiting.map(e => `${e.id}:${e.status}`).join()]);
  useEffect(() => { if (items.length) setTimeout(() => list.current?.scrollToEnd({ animated: false }), 50); }, [items.length]);

  // Everyone in the company, asked for once when an "@" is first typed in the Office chat (a group or a chat with one person offers its own people).
  const typingMention = mentionQuery(draft, Math.min(caret, draft.length)) !== null, inOffice = head?.thread.kind === 'office';
  useEffect(() => {
    if (!typingMention || !inOffice || officePeople) return;
    api<{ people: Person[] }>('/chat/people').then(d => setOfficePeople(d.people)).catch(() => setOfficePeople([]));
  }, [typingMention, inOffice, officePeople, api]);

  if (state.status !== 'signedIn') return <Redirect href="/" />;
  const canSend = can(state.me.access, 'chat', 'edit');
  const sid = sessionId();
  const photo = (key: string) => ({ uri: `${API_URL}/api/hr/chat/photo?key=${encodeURIComponent(key)}`, headers: sid ? { Authorization: `Bearer ${sid}` } : undefined });

  const older = async () => {
    if (!msgs?.length) return;
    try { const d = await api<Page>(path, { params: { before: msgs[0].seq, limit: 40 } }); setMsgs(prev => mergeChat(prev, d.messages) as Msg[]); setMore(d.messages.length >= 40); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load.'); }
  };
  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    const reply = replyTo, picked = mentions;
    setBusy(true); setDraft(''); setReplyTo(null); setMentions([]);
    try {
      const r = await offline.submit(chatSendDraft({ threadId: id, text, reply, mentionIds: mentionIds(text, picked) }) as Draft);
      if (r.outcome === 'sent' && r.result?.message) { setMsgs(prev => mergeChat(prev, [r.result.message]) as Msg[]); latest.current = Math.max(latest.current, r.result.message.seq); }
      else if (r.outcome === 'sent') await open();
      changed();
    } catch (e) { setDraft(text); setReplyTo(reply); setMentions(picked); setError(e instanceof Error ? e.message : 'Not sent. Try again.'); }
    setBusy(false);
  };
  // A photo from the camera: its bytes go up first, then it is a message that names them. It needs signal, so it is not queued.
  const sendPhoto = async () => {
    setError('');
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return setError('Allow the camera to take a photo.');
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.5 });
    const a = shot.canceled ? null : shot.assets?.[0];
    if (!a) return;
    const reply = replyTo;
    setSending(true);
    try {
      const bytes = await (await fetch(a.uri)).blob();
      const up = await fetch(`${API_URL.replace(/\/+$/, '')}/api/hr/chat/photo`, { method: 'PUT', body: bytes, headers: { 'content-type': a.mimeType || 'image/jpeg', ...(sid ? { Authorization: `Bearer ${sid}` } : {}) } });
      const j = await up.json().catch(() => ({})) as { ok?: boolean; error?: string; photo_key?: string };
      if (!up.ok || j.ok === false || !j.photo_key) throw new Error(j.error ? j.error.charAt(0).toUpperCase() + j.error.slice(1) : CHAT_PHOTO_FAILED as string);
      const ref = `app${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      const d = await api<{ message: Msg }>(path, { method: 'POST', body: chatPhotoDraft({ key: j.photo_key, ref, caption: draft.trim(), reply }) });
      setMsgs(prev => mergeChat(prev, [d.message]) as Msg[]); latest.current = Math.max(latest.current, d.message.seq);
      setDraft(''); setReplyTo(null); changed();
    } catch (e) { setError(e instanceof ApiError && e.offline ? 'No signal. A photo needs signal.' : e instanceof Error ? e.message : CHAT_PHOTO_FAILED as string); }
    setSending(false);
  };
  // A document from the phone: checked by its name and size, its bytes go up, then it is a message of its own (a reply if one was being written). It needs signal.
  const sendDoc = async () => {
    setError('');
    const got = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    const a = got.canceled ? null : got.assets?.[0];
    if (!a) return;
    const bad = chatDocProblem({ name: a.name, size: a.size || 0 }, true) as string;
    if (bad) return setError(bad);
    const reply = replyTo;
    setSending(true);
    try {
      const bytes = await (await fetch(a.uri)).blob();
      const up = await fetch(`${API_URL.replace(/\/+$/, '')}/api/hr${chatDocUploadPath(a.name) as string}`, { method: 'PUT', body: bytes, headers: { 'content-type': chatFileType(a.name) as string, ...(sid ? { Authorization: `Bearer ${sid}` } : {}) } });
      const j = await up.json().catch(() => ({})) as { ok?: boolean; error?: string; file_key?: string; file_name?: string };
      if (!up.ok || j.ok === false || !j.file_key) throw new Error(j.error ? j.error.charAt(0).toUpperCase() + j.error.slice(1) : CHAT_DOC_FAILED as string);
      const ref = `app${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      const d = await api<{ message: Msg }>(path, { method: 'POST', body: chatDocDraft({ key: j.file_key, name: j.file_name || a.name, ref, reply }) });
      setMsgs(prev => mergeChat(prev, [d.message]) as Msg[]); latest.current = Math.max(latest.current, d.message.seq);
      setReplyTo(null); changed();
    } catch (e) { setError((e instanceof ApiError && e.offline) || e instanceof TypeError ? chatDocProblem({ name: a.name, size: a.size || 0 }, false) as string : e instanceof Error ? e.message : CHAT_DOC_FAILED as string); }
    setSending(false);
  };
  // A voice message: the microphone starts it, the arrow sends it, the bin throws it away. Its bytes go up with its length, then it is a message that names
  // them. It needs signal, and stops by itself at the longest a chat takes.
  const finishVoice = async (sendIt: boolean) => {
    const st = recState.current;
    if (!st || st.ending) return;
    st.ending = true;
    if (st.timer) clearInterval(st.timer);
    const secs = voiceSecs(Date.now() - st.start) as number;
    let uri: string | null = null;
    try { await recorder.stop(); uri = recorder.uri; } catch { /* nothing recorded */ }
    void setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    recState.current = null; setRec(null);
    if (!sendIt || !(voiceKeep(secs, !!uri) as boolean) || !uri) return;
    setSending(true);
    try {
      const bytes = await (await fetch(uri)).blob();
      const up = await fetch(`${API_URL.replace(/\/+$/, '')}/api/hr${voiceUploadPath(secs) as string}`, { method: 'PUT', body: bytes, headers: { 'content-type': VOICE_TYPE, ...(sid ? { Authorization: `Bearer ${sid}` } : {}) } });
      const j = await up.json().catch(() => ({})) as { ok?: boolean; error?: string; audio_key?: string };
      if (!up.ok || j.ok === false || !j.audio_key) throw new Error(j.error ? j.error.charAt(0).toUpperCase() + j.error.slice(1) : VOICE.failed);
      const ref = `app${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
      const d = await api<{ message: Msg }>(path, { method: 'POST', body: voiceDraft({ key: j.audio_key, secs, ref, reply: st.reply }) });
      setMsgs(prev => mergeChat(prev, [d.message]) as Msg[]); latest.current = Math.max(latest.current, d.message.seq);
      setReplyTo(null); changed();
    } catch (e) { setError((e instanceof ApiError && e.offline) || e instanceof TypeError ? VOICE.noSignal : e instanceof Error ? e.message : VOICE.failed); }
    setSending(false);
  };
  const startVoice = async () => {
    if (recState.current) return;
    setError('');
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) return setError(VOICE.noMic);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch { return setError(VOICE.cantStart); }
    const st = { start: Date.now(), timer: null as ReturnType<typeof setInterval> | null, reply: replyTo, ending: false };
    st.timer = setInterval(() => { const ms = Date.now() - st.start; setRec({ secs: Math.floor(ms / 1000) }); if (voiceFull(ms) as boolean) void finishVoice(true); }, 250);
    recState.current = st; setRec({ secs: 0 });
  };
  // "@": the people of this chat (everyone in the company for the Office), narrowed by what has been typed after it.
  const mentionQ = mentionQuery(draft, Math.min(caret, draft.length)) as string | null;
  const candidates = !canSend || !head ? [] : mentionCandidates(mentionQ, head.thread.kind === 'office' ? officePeople : head.thread.others) as Person[];
  const pickMention = (p: Person) => {
    const got = mentionPick(draft, Math.min(caret, draft.length), mentions, p) as { draft: string; caret: number; mentions: { id: string; name: string }[] };
    setDraft(got.draft); setMentions(got.mentions); setCaret(got.caret);
  };
  const react = async (m: Msg, emoji: string) => {
    const before = m.reactions || [];
    setSheet(null);
    setMsgs(ms => (ms || []).map(x => (x.id === m.id ? { ...x, reactions: chatReacted(before, emoji) as Msg['reactions'] } : x)));
    try {
      const d = await api<{ reactions: Msg['reactions'] }>(`/chat/messages/${m.id}/reaction`, { method: 'PUT', body: chatReactionDraft(before, emoji) });
      setMsgs(ms => (ms || []).map(x => (x.id === m.id ? { ...x, reactions: d.reactions } : x)));
    } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Try again.'); setMsgs(ms => (ms || []).map(x => (x.id === m.id ? { ...x, reactions: before } : x))); }
  };
  const remove = (m: Msg) => {
    const ask = CHAT_DELETE_CONFIRM as { title: string; body: string; confirmLabel: string };
    Alert.alert(ask.title, ask.body, [{ text: 'Cancel', style: 'cancel' }, { text: ask.confirmLabel, style: 'destructive', onPress: () => {
      api(`/chat/messages/${m.id}`, { method: 'DELETE' }).then(() => { setMsgs(ms => (ms || []).map(x => (x.id === m.id ? chatDeleted(x) as Msg : x))); changed(); })
        .catch(e => setError(e instanceof Error ? e.message : 'Something went wrong. Try again.'));
    } }]);
  };
  // The chat's own menu: notifications on or off here; a group's people and its name on the group's own page.
  const menuDo = (a: string) => {
    setMenu(false);
    if (!head) return;
    if (a === 'info') return router.push({ pathname: '/chat-group', params: { id } });
    if (a === 'rename') return router.push({ pathname: '/chat-group', params: { id, rename: '1' } });
    const was = !!head.thread.muted;
    api(`/chat/threads/${id}`, { method: 'PUT', body: muteDraft(head.thread) }).then(() => { setHead(h => (h ? { ...h, thread: { ...h.thread, muted: !was } } : h)); setTold(muteSaid(was) as string); changed(); })
      .catch(e => setError(e instanceof Error ? e.message : 'Something went wrong. Try again.'));
  };
  const openWho = (m: Msg) => {
    api<{ reactions: { emoji: string; id: string; name: string }[] }>(reactionsPath(m.id) as string).then(d => setWho({ m, rows: d.reactions }))
      .catch(e => setError(e instanceof Error ? e.message : 'Something went wrong. Try again.'));
  };
  const act = (m: Msg, a: string) => {
    setSheet(null);
    if (a === 'reply') setReplyTo(m);
    else if (a === 'copy') void Clipboard.setStringAsync(m.body || '');
    else if (a === 'delete') remove(m);
  };
  const openDoc = async (m: Msg) => {
    if (!m.file?.key) return;
    setError('');
    try { await openFile(sid, `/chat/file?key=${encodeURIComponent(m.file.key)}`, m.file.name); }
    catch (e) { setError(e instanceof Error ? e.message : 'Couldn’t open the file.'); }
  };
  const quoteLine = (q: Quote) => `${q.sender_name ? `${q.sender_name}: ` : ''}${q.deleted ? 'This message was deleted' : q.text || (q.photo ? 'Photo' : q.audio ? 'Voice message' : q.file || '')}`;

  const bubble = (m: Msg, mine: boolean, showName: boolean, tick: string) => (
    <Pressable accessibilityHint="Hold for more" onLongPress={() => { if (!m.deleted) setSheet(m); }} delayLongPress={350} style={[styles.row, mine ? styles.mine : styles.theirs]}>
      <View style={[styles.bubble, { backgroundColor: mine ? t.accent : t.surface2 }]}>
        {showName && !mine && <Text style={[styles.from, { color: `hsl(${chatHue(m.sender_id || m.sender_name || '')}, 70%, 72%)` }]}>{m.sender_name || 'Someone'}</Text>}
        {!!m.reply && <Text style={[styles.quote, { color: t.muted, borderLeftColor: t.line }]} numberOfLines={2}>{quoteLine(m.reply)}</Text>}
        {m.deleted ? <Text style={[styles.text, { color: t.muted, fontStyle: 'italic' }]}>{chatDeletedText(mine) as string}</Text> : (
          <>
            {!!m.photo_key && <Image source={photo(m.photo_key)} style={styles.photo} resizeMode="cover" accessibilityLabel="Photo" />}
            {!!m.audio_key && <VoicePlayer uri={`${API_URL.replace(/\/+$/, '')}/api/hr${voicePath(m.audio_key) as string}`} headers={sid ? { Authorization: `Bearer ${sid}` } : undefined} secs={m.audio_secs || 0} id={m.id} mine={mine} />}
            {!!m.file && (
              <Pressable accessibilityRole="button" accessibilityLabel={`Open ${m.file.name}`} onPress={() => { void openDoc(m); }} style={styles.doc}>
                <Ionicons name="document-outline" size={22} color={t.fg} />
                <View style={{ flexShrink: 1 }}><Text style={[styles.text, { color: t.fg, fontWeight: '700' }]} numberOfLines={2}>{m.file.name}</Text><Text style={[styles.meta, { color: mine ? '#E6E8FF' : t.muted }]}>{chatFileLine(m.file) as string}</Text></View>
              </Pressable>
            )}
            {!!m.body && (
              <Text style={[styles.text, { color: t.fg }]}>
                {(chatParts(m.body, m.mentions, head?.me) as { text?: string; link?: string; mention?: string; me?: boolean }[]).map((p, i) => p.link
                  ? <Text key={i} accessibilityRole="link" style={styles.link} onPress={() => { void Linking.openURL(p.link!).catch(() => {}); }}>{p.link}</Text>
                  : p.mention ? <Text key={i} style={{ fontWeight: '700', color: p.me ? t.warn : t.fg }}>{p.mention}</Text> : p.text)}
              </Text>
            )}
          </>
        )}
        {!m.deleted && !!m.reactions?.length && (
          <Pressable accessibilityRole="button" accessibilityLabel="Who reacted" onPress={() => openWho(m)} hitSlop={8}>
            <Text style={[styles.meta, { color: t.fg }]}>{m.reactions.map(r => `${r.emoji}${r.count > 1 ? ` ${r.count}` : ''}`).join('  ')}</Text>
          </Pressable>
        )}
        <Text style={[styles.meta, { color: mine ? '#E6E8FF' : t.muted }]}>{chatClock(m.created_at) as string}{mine && !m.deleted ? (tick === 'read' ? ' · Read' : ' · Sent') : ''}</Text>
      </View>
    </Pressable>
  );
  const local = (e: Entry) => (
    <View style={[styles.row, styles.mine]}>
      <View style={[styles.bubble, { backgroundColor: t.accent, opacity: e.status === 'failed' ? 1 : 0.7 }]}>
        <Text style={[styles.text, { color: t.fg }]}>{e.local_card?.body ?? e.body?.body}</Text>
        <Text style={[styles.meta, { color: '#E6E8FF' }]}>{e.status === 'failed' ? e.error || 'Not sent' : 'Waiting to send'}</Text>
      </View>
      {e.status === 'failed' && (
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Pressable accessibilityRole="button" onPress={() => { offline.retry(e.id); void offline.replay().then(() => open()); }} style={styles.small}><Text style={{ color: t.accent2, fontSize: 15 }}>Retry</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => { offline.discard(e.id); }} style={styles.small}><Text style={{ color: t.danger, fontSize: 15 }}>Delete</Text></Pressable>
        </View>
      )}
    </View>
  );

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: t.bg }]}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={[styles.head, { borderBottomColor: t.line, backgroundColor: t.topbar }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to chats" onPress={() => router.back()} style={styles.back}><Ionicons name="chevron-back" size={24} color={t.accent2} /></Pressable>
          <View style={{ flex: 1 }}>
            <Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { color: t.fg, flex: 0 }]}>{head ? (chatName(head.thread) as string) : 'Chat'}</Text>
            {!!head && !!(chatSub(head.thread) as string) && <Text numberOfLines={1} style={{ fontSize: 13, color: t.muted }}>{`${chatSub(head.thread) as string}${head.thread.muted ? ' · Muted' : ''}`}</Text>}
          </View>
          {!!head && <Pressable accessibilityRole="button" accessibilityLabel="Chat options" onPress={() => { setTold(''); setMenu(true); }} style={styles.back}><Ionicons name="ellipsis-horizontal" size={22} color={t.fg} /></Pressable>}
        </View>
        {!!told && <Text accessibilityRole="alert" style={[styles.note, { color: t.muted }]}>{told}</Text>}
        {!!error && <Text accessibilityRole="alert" style={[styles.note, { color: msgs ? t.muted : t.danger }]}>{error}</Text>}
        {!msgs ? (!error && <Text style={[styles.note, { color: t.muted }]}>Loading…</Text>) : (
          <FlatList ref={list} data={items} keyExtractor={i => i.key} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled"
            ListHeaderComponent={more ? <Pressable accessibilityRole="button" onPress={() => { void older(); }} style={styles.older}><Text style={{ color: t.accent2, fontSize: 15 }}>Earlier messages</Text></Pressable> : undefined}
            ListEmptyComponent={<Text style={[styles.note, { color: t.muted }]}>{head?.thread.kind === 'office' ? 'Ask the office anything.' : 'No messages yet.'}</Text>}
            renderItem={({ item }) => item.kind === 'msg' ? bubble(item.m, item.mine, item.showName, item.tick)
              : item.kind === 'local' ? local(item.e)
              : <Text style={[styles.chip, { color: item.kind === 'unread' ? t.accent2 : t.muted }]}>{item.text}</Text>} />
        )}
        {canSend && !!head && !!replyTo && (
          <View style={[styles.replying, { borderTopColor: t.line, backgroundColor: t.topbar }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.from, { color: t.accent2 }]}>{`Replying to ${replyTo.sender_id === head.me ? 'yourself' : replyTo.sender_name || 'a message'}`}</Text>
              <Text style={[styles.quote, { color: t.muted, borderLeftColor: t.line }]} numberOfLines={1}>{quoteLine(chatQuote(replyTo) as Quote)}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Cancel the reply" onPress={() => setReplyTo(null)} style={styles.back}><Ionicons name="close" size={22} color={t.muted} /></Pressable>
          </View>
        )}
        {candidates.length > 0 && (
          <View accessibilityLabel={MENTION_LIST as string} style={[styles.people, { borderTopColor: t.line, backgroundColor: t.topbar }]}>
            {candidates.map(p => (
              <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Mention ${p.name}`} onPress={() => pickMention(p)} style={styles.person}>
                <Text numberOfLines={1} style={{ flex: 1, fontSize: 16, color: t.fg }}>{p.name}</Text>
                {!!p.position && <Text numberOfLines={1} style={{ fontSize: 13, color: t.muted }}>{p.position}</Text>}
              </Pressable>
            ))}
          </View>
        )}
        {canSend && !!head && !!rec && (
          <View accessibilityRole="summary" style={[styles.bar, { borderTopColor: t.line, backgroundColor: t.topbar, alignItems: 'center' }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={VOICE.discard} onPress={() => { void finishVoice(false); }} style={[styles.send, { backgroundColor: t.surface2 }]}><Ionicons name="trash-outline" size={21} color={t.danger} /></Pressable>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.danger }} />
              <Text style={{ fontSize: 17, fontWeight: '700', color: t.fg }}>{chatSecs(rec.secs) as string}</Text>
              <Text style={{ fontSize: 15, color: t.muted }}>{VOICE.recording}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={VOICE.send} onPress={() => { void finishVoice(true); }} style={[styles.send, { backgroundColor: t.accent }]}><Ionicons name="send" size={19} color="#FFFFFF" /></Pressable>
          </View>
        )}
        {canSend && !!head && !rec && (
          <View style={[styles.bar, { borderTopColor: t.line, backgroundColor: t.topbar }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={CHAT_SEND_PHOTO as string} disabled={sending || busy} onPress={() => { void sendPhoto(); }}
              style={[styles.send, { backgroundColor: t.surface2, opacity: sending || busy ? 0.5 : 1 }]}><Ionicons name={sending ? 'cloud-upload-outline' : 'camera-outline'} size={21} color={t.fg} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={CHAT_SEND_DOC as string} disabled={sending || busy} onPress={() => { void sendDoc(); }}
              style={[styles.send, { backgroundColor: t.surface2, opacity: sending || busy ? 0.5 : 1 }]}><Ionicons name="attach-outline" size={22} color={t.fg} /></Pressable>
            <TextInput accessibilityLabel="Message" placeholder="Message" placeholderTextColor={t.dim} value={draft} onChangeText={setDraft} multiline onSelectionChange={e => setCaret(e.nativeEvent.selection.end)}
              style={[styles.box, { color: t.fg, backgroundColor: t.surface2, borderColor: t.line }]} />
            {draft.trim()
              ? <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={busy} onPress={() => { void send(); }} style={[styles.send, { backgroundColor: t.accent, opacity: busy ? 0.5 : 1 }]}><Ionicons name="send" size={19} color="#FFFFFF" /></Pressable>
              : <Pressable accessibilityRole="button" accessibilityLabel={VOICE.record} disabled={busy || sending} onPress={() => { void startVoice(); }} style={[styles.send, { backgroundColor: t.accent, opacity: busy || sending ? 0.5 : 1 }]}><Ionicons name="mic" size={20} color="#FFFFFF" /></Pressable>}
          </View>
        )}
      </KeyboardAvoidingView>
      <Modal visible={menu && !!head} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable accessibilityLabel="Close" onPress={() => setMenu(false)} style={styles.shade}>
          <View style={[styles.sheet, { backgroundColor: t.surface, borderColor: t.line }]}>
            {(chatMenu(head?.thread, canSend) as { act: string; label: string }[]).map((a, n) => (
              <Pressable key={a.act} accessibilityRole="button" onPress={() => menuDo(a.act)} style={[styles.choice, { borderTopColor: t.line, borderTopWidth: n ? StyleSheet.hairlineWidth : 0 }]}><Text style={{ fontSize: 17, color: t.fg }}>{a.label}</Text></Pressable>
            ))}
            <Pressable accessibilityRole="button" onPress={() => setMenu(false)} style={[styles.choice, { borderTopColor: t.line }]}><Text style={{ fontSize: 17, color: t.muted }}>Cancel</Text></Pressable>
          </View>
        </Pressable>
      </Modal>
      <Modal visible={!!who} transparent animationType="fade" onRequestClose={() => setWho(null)}>
        <Pressable accessibilityLabel="Close" onPress={() => setWho(null)} style={styles.shade}>
          {!!who && (
            <View style={[styles.sheet, { backgroundColor: t.surface, borderColor: t.line }]}>
              <Text accessibilityRole="header" style={{ fontSize: 15, fontWeight: '700', color: t.muted, padding: space.md }}>{CHAT_REACTIONS_TITLE as string}</Text>
              {(reactionRows(who.rows, head?.me) as { key: string; text: string }[]).map(r => (
                <View key={r.key} style={[styles.choice, { borderTopColor: t.line }]}><Text style={{ fontSize: 17, color: t.fg }}>{r.text}</Text></View>
              ))}
              {canSend && !!(reactionMine(who.rows, head?.me) as string | null) && (
                <Pressable accessibilityRole="button" onPress={() => { const m = msgs?.find(x => x.id === who.m.id) || who.m, e = reactionMine(who.rows, head?.me) as string; setWho(null); void react(m, e); }} style={[styles.choice, { borderTopColor: t.line }]}>
                  <Text style={{ fontSize: 17, color: t.danger }}>{CHAT_REACTION_REMOVE as string}</Text>
                </Pressable>
              )}
              <Pressable accessibilityRole="button" onPress={() => setWho(null)} style={[styles.choice, { borderTopColor: t.line }]}><Text style={{ fontSize: 17, color: t.muted }}>Close</Text></Pressable>
            </View>
          )}
        </Pressable>
      </Modal>
      <Modal visible={!!sheet} transparent animationType="fade" onRequestClose={() => setSheet(null)}>
        <Pressable accessibilityLabel="Close" onPress={() => setSheet(null)} style={styles.shade}>
          {!!sheet && (
            <View style={[styles.sheet, { backgroundColor: t.surface, borderColor: t.line }]}>
              {(chatCanReact(sheet, canSend) as boolean) && (
                <View style={styles.emoji}>
                  {(CHAT_EMOJI as string[]).map(e => { const on = sheet.reactions?.some(r => r.mine && r.emoji === e); return (
                    <Pressable key={e} accessibilityRole="button" accessibilityLabel={`React ${e}`} accessibilityState={{ selected: !!on }} onPress={() => { void react(sheet, e); }} style={[styles.emojiBtn, on && { backgroundColor: t.surface2 }]}><Text style={{ fontSize: 26 }}>{e}</Text></Pressable>
                  ); })}
                </View>
              )}
              {(chatActions(sheet, { me: head?.me, sendable: canSend, moderator: can(state.me.access, 'chat', 'approve'), kind: head?.thread.kind }) as { act: string; label: string; danger: boolean }[]).map(a => (
                <Pressable key={a.act} accessibilityRole="button" onPress={() => act(sheet, a.act)} style={[styles.choice, { borderTopColor: t.line }]}><Text style={{ fontSize: 17, color: a.danger ? t.danger : t.fg }}>{a.label}</Text></Pressable>
              ))}
              <Pressable accessibilityRole="button" onPress={() => setSheet(null)} style={[styles.choice, { borderTopColor: t.line }]}><Text style={{ fontSize: 17, color: t.muted }}>Cancel</Text></Pressable>
            </View>
          )}
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, minHeight: TOUCH + 8, borderBottomWidth: 1 },
  back: { minHeight: TOUCH, minWidth: 32, justifyContent: 'center' },
  title: { flex: 1, fontSize: 19, fontWeight: '700' },
  note: { padding: space.lg, fontSize: 15, textAlign: 'center' },
  list: { padding: space.md, gap: 6 },
  people: { borderTopWidth: 1, paddingHorizontal: space.lg },
  person: { minHeight: TOUCH, flexDirection: 'row', alignItems: 'center', gap: space.md },
  older: { minHeight: TOUCH, alignItems: 'center', justifyContent: 'center' },
  chip: { textAlign: 'center', fontSize: 13, marginVertical: 8 },
  row: { maxWidth: '86%', gap: 4 },
  mine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  theirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { borderRadius: radius.lg, paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  from: { fontSize: 13, fontWeight: '700' },
  quote: { fontSize: 14, borderLeftWidth: 3, paddingLeft: 8 },
  text: { fontSize: 16, lineHeight: 22 },
  link: { textDecorationLine: 'underline' },
  photo: { width: 220, height: 220, borderRadius: radius.md },
  meta: { fontSize: 12 },
  small: { minHeight: TOUCH, justifyContent: 'center' },
  bar: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, padding: space.sm, borderTopWidth: 1 },
  box: { flex: 1, minHeight: TOUCH, maxHeight: 132, borderRadius: 22, borderWidth: 1, paddingHorizontal: space.md, paddingVertical: 10, fontSize: 16 },
  send: { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, alignItems: 'center', justifyContent: 'center' },
  replying: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingTop: space.sm, borderTopWidth: 1 },
  doc: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: TOUCH },
  shade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end', padding: space.md },
  sheet: { borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  emoji: { flexDirection: 'row', justifyContent: 'space-around', padding: space.sm },
  emojiBtn: { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, alignItems: 'center', justifyContent: 'center' },
  choice: { minHeight: TOUCH + 6, justifyContent: 'center', paddingHorizontal: space.lg, borderTopWidth: 1 },
});
