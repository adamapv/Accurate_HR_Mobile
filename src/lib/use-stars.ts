// A person's starred cost centres: read once for a screen, changed the moment a star is pressed, and put back (with the reason) if it could not be saved.
// Which stars are on a job, and what is sent, are the web app's own rules (shared/field-core.js).
import { useEffect, useRef, useState } from 'react';
import { starDraft, starFailed, starKeysFor, starPut, starRow } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';

type Star = { company_id: string; job_id: string; section_id: string; cost_centre_id: string };
export function useCostCentreStars(onProblem: (why: string) => void) {
  const { api } = useSession();
  const read = useRead<{ rows: Star[] }>('/cost-centres/favourites');
  const [rows, setRows] = useState<Star[]>([]);
  const latest = useRef<Star[]>([]);
  const keep = (list: Star[]) => { latest.current = list; setRows(list); };
  useEffect(() => { if (read.data) keep(read.data.rows || []); }, [read.data]);
  return (job: { id: string; company_id: string } | null | undefined) => ({
    keys: starKeysFor(rows, job) as string[],
    toggle: async (sectionId: string, costCentreId: string, on: boolean) => {
      if (!job) return;
      const row = starRow(job, sectionId, costCentreId) as Star;
      keep(starPut(latest.current, row, on) as Star[]);
      try { await api('/cost-centres/favourite', { method: 'PUT', body: starDraft(row, on) }); }
      catch (e) { keep(starPut(latest.current, row, !on) as Star[]); onProblem(starFailed(on, e instanceof Error ? e.message : 'try again') as string); }
    },
  });
}
