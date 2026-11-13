// The phone's side of what is kept for one session (offline-core.ts): the store, whether there is signal, and the session's fingerprint.
import Storage from 'expo-sqlite/kv-store';
import * as Crypto from 'expo-crypto';
import * as Network from 'expo-network';
import { sessionFingerprint } from '@shared/field-core.js';
import type { Api } from './api-core';
import { createOffline, type Offline } from './offline-core';

// Whether the phone has signal, kept up to date so the outbox can ask without waiting. Unknown counts as yes: the send itself finds out.
let online = true;
const seen = (s: Network.NetworkState) => { online = s.isInternetReachable ?? s.isConnected ?? true; };
Network.getNetworkStateAsync().then(seen).catch(() => {});
const onlineListeners = new Set<() => void>();
Network.addNetworkStateListener(s => { const was = online; seen(s); if (online && !was) for (const fn of onlineListeners) fn(); });
export const isOnline = () => online;
// Tells `fn` each time the signal comes back.
export function onBackOnline(fn: () => void) { onlineListeners.add(fn); return () => { onlineListeners.delete(fn); }; }

// A send that hangs on one bar ends as "no signal" after 15 seconds, so the outbox keeps it.
const SEND_TIMEOUT_MS = 15000;
export function makeOffline(api: Api): Offline {
  return createOffline({
    store: Storage,
    isOnline,
    send: entry => {
      const stop = new AbortController();
      const timer = setTimeout(() => stop.abort(), SEND_TIMEOUT_MS);
      return api(entry.path, { method: entry.method as 'POST' | 'PUT' | 'DELETE', body: entry.body ?? undefined, signal: stop.signal }).finally(() => clearTimeout(timer));
    },
  });
}

// The same fingerprint the web app and its service worker use (shared/field-core.js), with the phone's own SHA-256.
const subtle = { digest: (_name: string, data: BufferSource) => Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, data) };
export const fingerprintOf = (sid: string): Promise<string> => sessionFingerprint(sid, subtle as unknown as SubtleCrypto);
