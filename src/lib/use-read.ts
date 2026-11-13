// One read for a screen: the server's answer when there is signal (kept for next time), else the copy kept from last time, with when it was made.
// It reads again when the app comes back to the front and when something waiting on the phone has been sent.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { ApiError } from './api-core';
import { useSession } from './session';

export type Read<T> = { data: T | undefined; offlineAt: number | null; error: string; reload: () => Promise<void> };

export function useRead<T>(path: string | null): Read<T> {
  const { api, offline, refreshed } = useSession();
  const [state, setState] = useState<{ data: T | undefined; offlineAt: number | null; error: string }>(() => {
    const kept = path ? offline.recall<T>(path) : null;
    return { data: kept?.json, offlineAt: kept ? kept.at : null, error: '' };
  });
  const seq = useRef(0);
  const reload = useCallback(async () => {
    if (!path) return;
    const mine = ++seq.current;
    try {
      const data = await api<T>(path);
      offline.remember(path, data);
      if (mine === seq.current) setState({ data, offlineAt: null, error: '' });
    } catch (e) {
      if (mine !== seq.current) return;
      const kept = offline.recall<T>(path);
      const noSignal = e instanceof ApiError && e.offline;
      setState(s => ({ data: kept?.json ?? s.data, offlineAt: kept && noSignal ? kept.at : s.offlineAt, error: noSignal && kept ? '' : e instanceof Error ? e.message : 'Could not load.' }));
    }
  }, [api, offline, path]);
  useEffect(() => {
    void reload();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') void reload(); });
    return () => sub.remove();
  }, [reload, refreshed]);
  return { ...state, reload };
}
