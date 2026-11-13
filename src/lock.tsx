// The app lock: a setting kept on this phone that covers the app until the phone's own unlock (a face, a fingerprint, or the phone's passcode) says who is
// holding it. When it asks is the rule in src/lib/lock-core.ts. The lock only covers what is on screen: what is waiting on the phone is still sent behind it.
// The setting is forgotten with the session, so the next person on this phone starts with it off.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LOCK_WORDS, lockAvailable, lockOnOpen, lockOnReturn, lockProblem } from '@/lib/lock-core';
import { useSession } from '@/lib/session';
import { feel } from '@/lib/haptics';
import { useTheme } from '@/theme';
import { Body, Button, Problem, Title } from '@/ui';

export const LOCK_KEY = 'hrhead_lock';
type Lock = { available: boolean; on: boolean; setOn: (on: boolean) => Promise<string> };   // setOn answers with what to say, or throws with why not
const Ctx = createContext<Lock>({ available: false, on: false, setOn: async () => '' });
export const useLock = () => useContext(Ctx);

// Ask the phone who is holding it. → '' when unlocked, else what to say (which may be nothing, when the prompt was simply closed).
async function ask(prompt: string): Promise<{ ok: boolean; problem: string }> {
  try {
    const r = await LocalAuthentication.authenticateAsync({ promptMessage: prompt, cancelLabel: 'Cancel', disableDeviceFallback: false });
    return r.success ? { ok: true, problem: '' } : { ok: false, problem: lockProblem(r.error) };
  } catch { return { ok: false, problem: LOCK_WORDS.failed }; }
}

export function LockProvider({ children }: { children: ReactNode }) {
  const { state, signOut } = useSession();
  const t = useTheme();
  const [available, setAvailable] = useState(false);
  const [on, setOnState] = useState(false);
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  // `how` is how the session got here: 'kept' when it was already on the phone, 'typed' when the PIN was typed just now.
  const onRef = useRef(false), how = useRef<'unknown' | 'kept' | 'typed'>('unknown'), prev = useRef<string>('loading'), leftAt = useRef<number | null>(null), ready = useRef(false);
  const status = state.status;

  // What this phone can do, and whether the lock was switched on here. The session may have loaded first: one that was already on the phone opens locked.
  useEffect(() => {
    let live = true;
    void (async () => {
      const [hardware, level, kept] = await Promise.all([
        LocalAuthentication.hasHardwareAsync().catch(() => false), LocalAuthentication.getEnrolledLevelAsync().catch(() => 0), SecureStore.getItemAsync(LOCK_KEY).catch(() => null)]);
      if (!live) return;
      const can = lockAvailable({ hardware, level: Number(level) });
      onRef.current = can && kept === '1'; ready.current = true;
      setAvailable(can); setOnState(onRef.current);
      if (lockOnOpen({ on: onRef.current, kept: how.current === 'kept' })) setLocked(true);
    })();
    return () => { live = false; };
  }, []);

  // Opening: a session that was already on the phone asks; one typed in just now does not. Signing out forgets the setting.
  useEffect(() => {
    if (status === 'signedIn') {
      how.current = prev.current === 'signedOut' ? 'typed' : 'kept';
      if (ready.current && lockOnOpen({ on: onRef.current, kept: how.current === 'kept' })) setLocked(true);
    } else if (status === 'signedOut') {
      how.current = 'unknown';
      setLocked(false);
      if (onRef.current) { onRef.current = false; setOnState(false); }
      if (ready.current) void SecureStore.deleteItemAsync(LOCK_KEY).catch(() => {});
    }
    prev.current = status;
  }, [status]);

  // Coming back to the front after a while away asks again.
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') {
        const away = leftAt.current === null ? 0 : Date.now() - leftAt.current;
        leftAt.current = null;
        if (lockOnReturn({ on: onRef.current, awayMs: away })) setLocked(true);
      } else if (leftAt.current === null) leftAt.current = Date.now();
    });
    return () => sub.remove();
  }, []);

  const unlock = useCallback(async () => {
    setBusy(true); setProblem('');
    const r = await ask(LOCK_WORDS.prompt);
    if (r.ok) { feel.saved(); setLocked(false); } else setProblem(r.problem);
    setBusy(false);
  }, []);
  // The prompt comes up by itself once each time the app locks.
  const covering = locked && status === 'signedIn';
  useEffect(() => { if (covering) void unlock(); }, [covering, unlock]);

  const value = useMemo<Lock>(() => ({
    available, on,
    // Switching it on asks once first, so nobody is locked out by a lock that cannot be opened.
    async setOn(next) {
      if (next) {
        const r = await ask(LOCK_WORDS.turnOn);
        if (!r.ok) { if (r.problem) throw new Error(r.problem); return ''; }
        await SecureStore.setItemAsync(LOCK_KEY, '1');
      } else await SecureStore.deleteItemAsync(LOCK_KEY).catch(() => {});
      onRef.current = next; setOnState(next);
      return next ? LOCK_WORDS.saidOn : LOCK_WORDS.saidOff;
    },
  }), [available, on]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {covering && (
        <View accessibilityViewIsModal style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: t.bg }]}>
          <Ionicons name="lock-closed" size={44} color={t.accent2} />
          <Title>{LOCK_WORDS.title}</Title>
          <Body tone="muted">{LOCK_WORDS.about}</Body>
          <Problem>{problem}</Problem>
          <View style={styles.actions}>
            <Button icon="finger-print-outline" onPress={() => { void unlock(); }} busy={busy}>{LOCK_WORDS.unlock}</Button>
            <Button kind="plain" onPress={() => { void signOut(); }} disabled={busy}>{LOCK_WORDS.signOut}</Button>
          </View>
        </View>
      )}
    </Ctx.Provider>
  );
}

const styles = StyleSheet.create({
  cover: { alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14 },
  actions: { alignSelf: 'stretch', gap: 10, marginTop: 10 },
});
