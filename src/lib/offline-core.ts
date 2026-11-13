// What the app keeps on the phone for one session, with nothing from React Native in it so scripts/test-offline.mjs can run it in Node:
// the outbox (the web app's own queue, shared/offline-queue.js: a clock-on typed with no signal is kept and sent later, once) and the last copy of what the
// screens read, so Home opens with no signal. Everything is tagged with the session's fingerprint, only that session's is ever shown or sent, and forgetAll()
// wipes the lot: on sign-out, before a new sign-in and when the company changes, as clearOfflineData() does in the web app.
import { createQueue, QUEUE_KEY, isChat } from '../../shared/offline-queue.js';

// The synchronous part of expo-sqlite's key-value store (the queue reads and writes as it goes, so it cannot wait).
export type SyncStore = {
  getItemSync(key: string): string | null;
  setItemSync(key: string, value: string): void;
  removeItemSync(key: string): unknown;
  getAllKeysSync(): string[];
};
export type Entry = { id: string; kind: string; method: string; path: string; body: any; status: 'pending' | 'failed'; error: string | null; local_card: any; at: number };
export type Draft = { kind: string; method: 'POST' | 'PUT' | 'DELETE'; path: string; body?: unknown; local_card?: unknown };
export type Submitted = { outcome: 'sent' | 'pending' | 'removed'; entry: Entry; result?: any };
export type Replayed = { sent: { id: string; entry: Entry; result: any }[]; failed: number; stopped: 'network' | 'auth' | 'server' | null };

type Queue = {
  entries(sid: string): Entry[];
  pending(sid: string): number;
  submit(sid: string, draft: Draft, opts: { online: boolean }): Promise<Submitted>;
  replay(sid: string): Promise<Replayed>;
  retry(id: string): boolean;
  discard(id: string): boolean;
  clear(): void;
  subscribe(fn: () => void): () => void;
};

const CACHE = 'hrhead_cache:';

export function createOffline({ store, send, isOnline }: { store: SyncStore; send: (entry: Entry) => Promise<unknown>; isOnline: () => boolean }) {
  // The shared file is plain JavaScript, so what it gives back is spelled out here.
  const queue: Queue = (createQueue as (deps: unknown) => Queue)({
    storage: { get: () => store.getItemSync(QUEUE_KEY), set: (v: string) => store.setItemSync(QUEUE_KEY, v), remove: () => { store.removeItemSync(QUEUE_KEY); } },
    send,
  });
  let fp = '', seq = 0;
  const listeners = new Set<() => void>();
  const tell = () => { seq++; for (const fn of listeners) { try { fn(); } catch { /* a listener's own trouble */ } } };
  queue.subscribe(tell);
  const key = (path: string) => `${CACHE}${fp}:${path}`;

  return {
    // Whose data this is from now on: '' while nobody is signed in.
    setSession(fingerprint: string) { fp = fingerprint; tell(); },
    fingerprint: () => fp,
    // This session's waiting and failed entries (chat messages have their own list).
    entries: (): Entry[] => (fp ? queue.entries(fp).filter((e: Entry) => !isChat(e)) : []),
    pending: (): number => (fp ? queue.pending(fp) : 0),
    // Queue a write, then send it at once when there is signal. A refusal on that first send is thrown, so the screen shows the Worker's words.
    async submit(draft: Draft): Promise<Submitted> {
      if (!fp) throw new Error('Your sign-in needs refreshing. Sign out and back in, then try again.');
      return queue.submit(fp, draft, { online: isOnline() });
    },
    // Send what is waiting. Null when there was nothing to send.
    async replay(): Promise<Replayed | null> { return fp && queue.pending(fp) ? queue.replay(fp) : null; },
    retry: (id: string) => queue.retry(id),
    discard: (id: string) => queue.discard(id),
    // The last answer to a read, kept for this session.
    remember(path: string, json: unknown) { if (fp) { try { store.setItemSync(key(path), JSON.stringify({ at: Date.now(), json })); } catch { /* storage full: the copy is only a convenience */ } } },
    recall<T = any>(path: string): { at: number; json: T } | null {
      if (!fp) return null;
      try { const raw = store.getItemSync(key(path)); return raw ? JSON.parse(raw) : null; } catch { return null; }
    },
    // Forget everything kept on the phone, whoever's it was.
    forgetAll() {
      queue.clear();
      for (const k of store.getAllKeysSync()) if (k.startsWith(CACHE) || k === QUEUE_KEY) store.removeItemSync(k);
      fp = '';
      tell();
    },
    subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    snapshot: () => `${seq}:${fp}`,
  };
}
export type Offline = ReturnType<typeof createOffline>;
