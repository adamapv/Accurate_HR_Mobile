// Chat's own rules, kept free of React and the browser so scripts/test-chat-core.mjs can run them in Node and the phone app (its own repo) can use the same file:
// what a chat is called, what its row in the list says, when a message was sent in words, how a message's text is cut into plain words, links and the people
// mentioned, how a chat's messages are laid out (day chips, the unread line, who gets a name and a tick), what a reaction does, what may be attached, and what
// sending a message puts in the outbox. Nothing here reads the clock, storage or the page: "now" is passed in.

// A voice message's length: 75 → "1:15".
export const chatSecs = n => `${Math.floor((n || 0) / 60)}:${String(Math.floor((n || 0) % 60)).padStart(2, '0')}`;
// The bars drawn for a voice message: the same for the same message every time (a picture of the shape of speech, not the real sound).
export function chatWave(seed, n = 30) {
  let x = 0;
  for (const c of String(seed)) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  return Array.from({ length: n }, (_, i) => { x = (x * 1664525 + 1013904223 + i) >>> 0; return 22 + (x >>> 8) % 78; });
}
// A colour for a person's name in a group, the same for the same person every time (a hue, 0 to 359).
export const chatHue = id => [...String(id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 360;
export const firstName = n => String(n || '').trim().split(/\s+/)[0] || '';

// ---- when ----
export const chatClock = iso => iso ? new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
const dayStart = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
// How many calendar days before `now` a moment was (0 today, 1 yesterday), by the device's own days.
export const chatDaysAgo = (iso, now) => Math.round((dayStart(now) - dayStart(new Date(iso))) / 86400000);
// The chip above a day's messages: Today, Yesterday, the weekday within a week, else the date (with the year when it is not this one).
export function chatDay(iso, now) {
  const n = chatDaysAgo(iso, now), d = new Date(iso);
  if (n <= 0) return 'Today';
  if (n === 1) return 'Yesterday';
  if (n < 7) return d.toLocaleDateString([], { weekday: 'long' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
}
// The time beside a chat in the list: the time today, Yesterday, the weekday within a week, else the date.
export function chatListTime(iso, now) {
  if (!iso) return '';
  const n = chatDaysAgo(iso, now), d = new Date(iso);
  return n <= 0 ? chatClock(iso) : n === 1 ? 'Yesterday' : n < 7 ? d.toLocaleDateString([], { weekday: 'short' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

// ---- the list ----
// What a chat is called: the office's, the other person's name, or the group's title.
export const chatName = t => t.kind === 'office' ? 'Office' : t.kind === 'dm' ? (t.others?.[0]?.name || 'Chat') : (t.title || 'Group');
// The chats in the order they are listed (the office's first, the rest as the server sent them), narrowed to the ones whose name has what was typed.
export function chatRows(rows, query) {
  const q = String(query || '').trim().toLowerCase();
  return (rows || []).slice().sort((a, b) => (b.kind === 'office') - (a.kind === 'office')).filter(t => !q || chatName(t).toLowerCase().includes(q));
}
// The line under a chat's name: its last message. → { who: 'You: ' | 'Sam: ' | '', text, photo, audio, deleted, system }
// (`photo` and `audio` ask for a small camera or microphone before the words).
export function chatPreview(t, me) {
  const last = t.last;
  if (!last) return { who: '', text: t.kind === 'office' ? 'Ask the office anything' : 'No messages yet', photo: false, audio: false, deleted: false, system: false };
  if (last.system) return { who: '', text: last.text, photo: false, audio: false, deleted: false, system: true };
  if (last.deleted) return { who: '', text: 'This message was deleted', photo: false, audio: false, deleted: true, system: false };
  const who = last.sender_id === me ? 'You: ' : t.kind !== 'dm' && last.sender_name ? `${firstName(last.sender_name)}: ` : '';
  return { who, photo: !!last.photo, audio: !!last.audio, deleted: false, system: false, text: last.audio ? `Voice message (${chatSecs(last.audio_secs)})` : last.photo && !last.text ? 'Photo' : last.text };
}
// The badge on a chat with messages waiting: the number, or 99+.
export const chatBadge = n => n > 99 ? '99+' : String(n);

// ---- a message ----
// A message as it is quoted in a reply.
export const chatQuote = m => ({ id: m.id, sender_name: m.sender_name, text: m.body ? String(m.body).slice(0, 140) : null, photo: !!m.photo_key, audio: !!m.audio_key, file: m.file?.name || null, deleted: !!m.deleted });
// A message's text cut into what it is made of, in order: plain words, web links (http and https only; everything else stays words) and the people @mentioned
// (`mentions`: [{ id, name }]; `me` says the mention is of the reader). → [{ text } | { link } | { mention, me }]
export function chatParts(body, mentions, meId) {
  const links = text => {
    const out = [], re = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g;
    let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ text: text.slice(last, m.index) });
      out.push({ link: m[0] });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ text: text.slice(last) });
    return out;
  };
  const text = String(body ?? '');
  const names = (mentions || []).map(m => ({ ...m, tag: `@${m.name}` })).filter(m => m.name && text.includes(m.tag)).sort((a, b) => b.tag.length - a.tag.length);
  if (!names.length) return links(text);
  const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${names.map(n => esc(n.tag)).join('|')})`, 'g');
  return text.split(re).flatMap(part => {
    const hit = names.find(n => n.tag === part);
    return hit ? [{ mention: part, me: hit.id === meId }] : links(part);
  });
}
// Messages put together by id and kept in the order they were sent (a page of older ones, a fresh look at the newest).
export const mergeChat = (a, b) => { const by = new Map((a || []).map(m => [m.id, m])); for (const m of b) by.set(m.id, m); return [...by.values()].sort((x, y) => x.seq - y.seq); };
// The reactions a person can pick from, and a message's reactions after they pick one (the same one again takes it back).
export const CHAT_EMOJI = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
export function chatReacted(reactions, emoji) {
  const mine = (reactions || []).find(r => r.mine);
  let out = (reactions || []).map(r => (r.mine ? { ...r, count: r.count - 1, mine: false } : r)).filter(r => r.count > 0);
  if (emoji && mine?.emoji !== emoji) {
    const same = out.find(r => r.emoji === emoji);
    out = same ? out.map(r => (r === same ? { ...r, count: r.count + 1, mine: true } : r)) : [...out, { emoji, count: 1, mine: true }];
  }
  return out;
}
// What a deleted message says, to the person who deleted it and to everyone else.
export const chatDeletedText = mine => mine ? 'You deleted this message' : 'This message was deleted';

// ---- a chat's messages, laid out ----
// The list as it is drawn, oldest first: a chip where the day changes, the "unread" line above the first message not yet read, a line for something that happened
// (someone joined), and each message with whether it is the reader's own, whether it starts a run from that sender, whether it shows the sender's name (in a group,
// at the start of a run), and its tick ('read' once the others have read up to it; never in the office's chat). `head` is { read_upto }, `divider` { seq, count } or null.
// → [{ kind: 'day', key, text } | { kind: 'unread', key, text } | { kind: 'system', key, text } | { kind: 'msg', key, m, mine, first, showName, tick }]
export function chatItems({ msgs, thread, head, me, divider, now }) {
  const items = [];
  let prevDay = null, prevSender = null;
  const showNames = !!thread && thread.kind !== 'dm';
  for (const m of msgs || []) {
    const day = chatDay(m.created_at, now);
    if (day !== prevDay) { items.push({ kind: 'day', key: `d${m.id}`, text: day }); prevDay = day; prevSender = null; }
    if (divider && m.seq === divider.seq) { items.push({ kind: 'unread', key: 'unread', text: `${divider.count} unread message${divider.count === 1 ? '' : 's'}` }); prevSender = null; }
    if (m.system) { items.push({ kind: 'system', key: m.id, text: m.system }); prevSender = null; continue; }
    const mine = m.sender_id === me;
    const read = mine && thread?.kind !== 'office' && head?.read_upto != null && m.seq <= head.read_upto;
    items.push({ kind: 'msg', key: m.id, m, mine, first: prevSender !== m.sender_id, showName: showNames && prevSender !== m.sender_id, tick: read ? 'read' : 'sent' });
    prevSender = m.sender_id;
  }
  return items;
}
// The messages a person has not read yet when a chat opens: someone else's, after the last one they read. → { seq, count } for the unread line, or null.
export function chatDivider(messages, lastReadSeq, me) {
  const unread = (messages || []).filter(m => m.seq > lastReadSeq && m.sender_id !== me && !m.system);
  return unread.length ? { seq: unread[0].seq, count: unread.length } : null;
}

// ---- sending ----
// A text message as a draft for the outbox: queued, then sent at once when there is signal (with none it waits and goes once). `reply` is the message being
// answered, `mentionIds` the people picked from the "@" list.
export function chatSendDraft({ threadId, text, reply, mentionIds }) {
  return { kind: 'chat-send', method: 'POST', path: `/chat/threads/${threadId}/messages`,
    body: { body: text, ...(reply ? { reply_to_id: reply.id } : {}), ...(mentionIds?.length ? { mention_ids: mentionIds } : {}) },
    local_card: { body: text, reply: reply ? chatQuote(reply) : null } };
}
// A document in a chat: what may be sent, by its extension (a phone often gives no type for a CSV), and the type it is uploaded as.
export const CHAT_FILE_TYPES = { pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', csv: 'text/csv', txt: 'text/plain' };
export const CHAT_FILE_MAX = 10 * 1024 * 1024;
export const CHAT_DROP_MAX = 5;   // files taken at once by paste or drag and drop
export const chatFileSize = n => !n ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;
// What is said under a document's name: its kind and size.
export const chatFileLine = f => [String(f.name).split('.').pop().toUpperCase(), chatFileSize(f.size)].filter(Boolean).join(' · ');

// ---- what can be done with a message ----
// The choices on a message, in order: [{ act, label, danger }]. act is 'reply' | 'copy' | 'delete'. `sendable` is whether the person may send in chats (the
// Chat area's edit), `moderator` whether they may delete other people's messages in a group or the office's chat (its approve), `kind` the chat's kind.
export function chatActions(m, { me, sendable, moderator, kind }) {
  if (m.deleted) return [];
  return [
    sendable && { act: 'reply', label: 'Reply', danger: false },
    m.body && { act: 'copy', label: 'Copy', danger: false },
    sendable && (m.sender_id === me || (moderator && kind !== 'dm')) && { act: 'delete', label: 'Delete for everyone', danger: true }].filter(Boolean);
}
// Whether the reactions row is offered on a message (never on a deleted one, or one still waiting on the phone).
export const chatCanReact = (m, sendable) => !!sendable && !m.deleted && !m.local;
// What is sent when a reaction is picked: the same one again takes it back.
export const chatReactionDraft = (reactions, emoji) => ({ emoji: emoji === (reactions || []).find(r => r.mine)?.emoji ? null : emoji });
export const CHAT_DELETE_CONFIRM = { title: 'Delete this message?', body: 'It is deleted for everyone in the chat.', confirmLabel: 'Delete' };
// A message once it has been deleted, as the chat then shows it.
export const chatDeleted = m => ({ ...m, deleted: true, body: null, photo_key: null });
export const CHAT_COPIED = 'Copied';
// A photo as a message: `key` is what the upload answered with, `ref` a new id so a retry is the one message, never two.
export const chatPhotoDraft = ({ key, ref, caption, reply }) => ({ photo_key: key, client_ref: ref, ...(caption ? { body: caption } : {}), ...(reply ? { reply_to_id: reply.id } : {}) });
export const CHAT_PHOTO_FAILED = 'Couldn’t upload the photo';
export const CHAT_SEND_PHOTO = 'Send a photo';

// ---- starting a chat ----
export const CHAT_NEW = { title: 'New chat', group: 'New group', groupName: 'Group name', groupExample: 'For example: Crew 2', create: 'Create group', search: 'Search for a person…', none: 'Nobody matches that.' };
export const CHAT_GROUP_NAME_MAX = 60;
// The people offered, leaving out any already chosen elsewhere (the members of a group being added to).
export const chatPeopleShown = (rows, exclude) => (rows || []).filter(p => !(exclude || []).includes(p.id));
export const chatDmDraft = person => ({ kind: 'dm', to_employee_id: person.id });
export const chatGroupReady = (title, ids) => !!String(title || '').trim() && (ids || []).length > 0;
export const chatGroupDraft = (title, ids) => ({ kind: 'group', title: String(title).trim(), people_ids: ids });
export const chatPickToggle = (ids, person) => ids.includes(person.id) ? ids.filter(x => x !== person.id) : [...ids, person.id];

// ---- "@" mentions and sending a document ----
// What is being typed after an "@" just before the caret (null when the caret is not in a mention): a name, or a first name and the start of a surname.
export const mentionQuery = (draft, caret) => { const mt = String(draft || '').slice(0, caret).match(/(?:^|\s)@([^\s@]*(?: [^\s@]*)?)$/); return mt ? mt[1] : null; };
// The people offered for it, out of the chat's own (everyone in the company for the Office): those whose name holds what was typed, a name that starts
// with it first, four at most.
export function mentionCandidates(query, people) {
  if (query === null || query === undefined) return [];
  const q = String(query).toLowerCase();
  return (people || []).filter(p => p.name.toLowerCase().includes(q))
    .sort((a, b) => (b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name)).slice(0, 4);
}
// Picking one: the "@…" being typed becomes "@Their Name " and the caret goes after it. → { draft, caret, mentions }
export function mentionPick(draft, caret, mentions, person) {
  const before = String(draft || '').slice(0, caret), at = before.lastIndexOf('@');
  return { draft: `${before.slice(0, at)}@${person.name} ${String(draft || '').slice(caret)}`, caret: at + person.name.length + 2,
    mentions: (mentions || []).some(x => x.id === person.id) ? mentions : [...(mentions || []), { id: person.id, name: person.name }] };
}
// Who a message really mentions when it is sent: the people picked whose "@Name" is still in the words.
export const mentionIds = (text, mentions) => (mentions || []).filter(m => String(text || '').includes(`@${m.name}`)).map(m => m.id);
export const MENTION_LIST = 'Mention someone';
// A document: what kind it is by its name ('' when a chat does not take it), why it cannot be sent ('' when it can), where it is uploaded and what is sent.
export const chatFileType = name => CHAT_FILE_TYPES[String(name || '').split('.').pop().toLowerCase()] || '';
export function chatDocProblem(f, online) {
  if (online === false) return 'Documents need a signal — try again when you have some';
  if (!chatFileType(f.name)) return `${f.name || 'That file'} can’t be sent: send a PDF, a Word, Excel or PowerPoint file, a CSV or a text file. A picture goes with the camera button`;
  if (f.size > CHAT_FILE_MAX) return `${f.name || 'That document'} is over 10 MB, which is the most a chat takes`;
  return '';
}
export const chatDocUploadPath = name => `/chat/file?name=${encodeURIComponent(name)}`;
export const chatDocDraft = ({ key, name, ref, reply }) => ({ file_key: key, file_name: name, client_ref: ref, ...(reply ? { reply_to_id: reply.id } : {}) });
export const CHAT_DOC_FAILED = 'Couldn’t upload the document';
export const CHAT_SEND_DOC = 'Send a document';

// ---- voice messages ----
// A recording lasts 1 to 300 seconds (the Worker refuses anything else). How long one ran, from the milliseconds it took; whether it is worth sending; where
// its bytes go and where they are played from; what is then sent as the message; and the words.
export const CHAT_VOICE_MAX_SECS = 300;
export const voiceSecs = ms => Math.min(CHAT_VOICE_MAX_SECS, Math.round((ms || 0) / 1000));
export const voiceKeep = (secs, hasSound) => secs >= 1 && !!hasSound;
export const voiceFull = ms => Math.floor((ms || 0) / 1000) >= CHAT_VOICE_MAX_SECS;
export const voiceUploadPath = secs => `/chat/audio?secs=${secs}`;
export const voicePath = key => `/chat/audio?key=${encodeURIComponent(key)}`;
export const voiceDraft = ({ key, secs, ref, reply }) => ({ audio_key: key, audio_secs: secs, client_ref: ref, ...(reply ? { reply_to_id: reply.id } : {}) });
export const CHAT_VOICE = { record: 'Record a voice message', recording: 'Recording…', send: 'Send the voice message', discard: 'Throw the recording away', failed: 'Couldn’t upload the recording',
  noMic: 'Allow the microphone for AccurateHR in your phone’s settings to send voice messages', cantStart: 'Couldn’t start the microphone', cantPlay: 'Couldn’t get the recording', play: 'Play voice message', pause: 'Pause voice message', unplayable: 'This phone can’t play that recording',
  noSignal: 'A voice message needs signal' };
