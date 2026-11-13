import { useMemo, useSyncExternalStore } from 'react';
import { useSession } from './session';
import type { Entry } from './offline-core';

// This session's waiting and failed entries, live.
export function useOutbox(): Entry[] {
  const { offline } = useSession();
  const v = useSyncExternalStore(offline.subscribe, offline.snapshot, offline.snapshot);
  return useMemo(() => offline.entries(), [offline, v]);
}
