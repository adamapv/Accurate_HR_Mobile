// The person's own pay, super, tax and PPE details. Unlike other reads it is never kept on the phone: it is asked for each time, so it needs signal.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from './session';

export type DetailField = { key: string; label: string; kind: 'text' | 'digits' | 'bsb' | 'choice' | 'textarea'; options?: { code: string; text: string }[]; sensitive?: boolean; max?: number; help?: string };
export type DetailGroup = { id: string; label: string; fields: DetailField[] };
export type Details = { schema: DetailGroup[]; values: Record<string, string>; masked: Record<string, string>; set: Record<string, unknown>; unreadable?: string[] };

export function useDetails(): { data: Details | undefined; error: string; reload: () => Promise<void> } {
  const { api, refreshed } = useSession();
  const [state, setState] = useState<{ data: Details | undefined; error: string }>({ data: undefined, error: '' });
  const seq = useRef(0);
  const reload = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const data = await api<Details>('/employee-details/mine');
      if (mine === seq.current) setState({ data, error: '' });
    } catch (e) {
      if (mine === seq.current) setState(s => ({ data: s.data, error: e instanceof Error ? e.message : 'Could not load.' }));
    }
  }, [api]);
  useEffect(() => { void reload(); }, [reload, refreshed]);
  return { ...state, reload };
}
