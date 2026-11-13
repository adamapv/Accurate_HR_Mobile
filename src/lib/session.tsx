// Who is signed in. The session id, the company code and the last email used are kept in the phone's secure store (the Keychain on an iPhone, the Keystore on
// Android), never in plain storage. Signing out, a session the server no longer accepts and "Not your company?" each forget what belongs to the person before.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { ApiError, createApi, type Api } from './api-core';
import { API_URL, APP_VERSION } from './config';

const SESSION_KEY = 'hrhead_session', TENANT_KEY = 'hrhead_tenant', EMAIL_KEY = 'hrhead_last_email';

// What GET /me and a sign-in answer with (AccurateHR's scripts/test-mobile-contract.mjs lists the fields the app may rely on).
export type Grant = { scope: string; edit: boolean; approve: boolean };
export type Me = {
  employee: { id: string; name: string; email: string; role: string; position: string | null; must_change_pin: number; time_source: string };
  access: Record<string, Grant>;
  access_level: string | null;
  company: { company_name: string; timezone: string | null; zone: string; timesheet_auto_approve: number | null };
};
type State =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'unreachable'; message: string }   // there is a session but the server could not be asked
  | { status: 'signedIn'; me: Me };
type Session = {
  state: State;
  api: Api;
  tenantCode: string | null;
  lastEmail: string;
  setTenantCode: (code: string | null) => Promise<void>;
  signIn: (email: string, pin: string) => Promise<void>;
  changePin: (currentPin: string, newPin: string) => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => void;
};
const Ctx = createContext<Session | null>(null);
export function useSession() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [tenantCode, setTenant] = useState<string | null>(null);
  const [lastEmail, setLastEmail] = useState('');
  const sid = useRef<string | null>(null), tenant = useRef<string | null>(null);

  const forget = useCallback(async () => {
    sid.current = null;
    await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => {});
    setState({ status: 'signedOut' });
  }, []);
  const api = useMemo(() => createApi({ baseUrl: API_URL, appVersion: APP_VERSION, getSession: () => sid.current, getTenantCode: () => tenant.current, onSignedOut: () => { void forget(); } }), [forget]);

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    const [s, t, e] = await Promise.all([SESSION_KEY, TENANT_KEY, EMAIL_KEY].map(k => SecureStore.getItemAsync(k).catch(() => null)));
    sid.current = s; tenant.current = t; setTenant(t); setLastEmail(e || '');
    if (!s) return setState({ status: 'signedOut' });
    try {
      setState({ status: 'signedIn', me: await api<Me>('/me') });
    } catch (err) {
      if (err instanceof ApiError && !err.offline) return forget();
      setState({ status: 'unreachable', message: err instanceof Error ? err.message : 'No connection.' });
    }
  }, [api, forget]);
  useEffect(() => { void load(); }, [load]);

  const value = useMemo<Session>(() => ({
    state, api, tenantCode, lastEmail, retry: () => { void load(); },
    // A new company code, or none ("Not your company?"): nothing of the last company's is kept.
    async setTenantCode(code) {
      tenant.current = code; setTenant(code);
      if (code) await SecureStore.setItemAsync(TENANT_KEY, code);
      else { await SecureStore.deleteItemAsync(TENANT_KEY).catch(() => {}); await SecureStore.deleteItemAsync(EMAIL_KEY).catch(() => {}); setLastEmail(''); }
    },
    async signIn(email, pin) {
      sid.current = null;
      const r = await api<Me & { session_id: string }>('/login', { method: 'POST', body: { email, pin } });
      sid.current = r.session_id;
      await SecureStore.setItemAsync(SESSION_KEY, r.session_id);
      await SecureStore.setItemAsync(EMAIL_KEY, email);
      setLastEmail(email);
      setState({ status: 'signedIn', me: r });
    },
    async changePin(currentPin, newPin) {
      await api('/change-pin', { method: 'POST', body: { current_pin: currentPin, new_pin: newPin } });
      setState({ status: 'signedIn', me: await api<Me>('/me') });
    },
    async signOut() {
      try { await api('/logout', { method: 'POST', body: {} }); } catch { /* the phone forgets the session either way */ }
      await forget();
    },
  }), [state, api, tenantCode, lastEmail, load, forget]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
