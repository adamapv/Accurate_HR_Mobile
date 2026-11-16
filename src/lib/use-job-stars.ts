// A person's starred jobs: read once for a screen, changed the moment a star is pressed, and put back (with the reason) if it could not be saved. Which stars there are,
// how one is put on or taken off and what is sent are the web app's own rules (shared/field-core.js).
import { useEffect, useRef, useState } from 'react';
import { jobStarDraft, jobStarFailed, jobStarKeys, jobStarPut, jobStarRow } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';

type Star = { company_id: string; job_id: string };
export type JobStars = { rows: Star[]; keys: string[]; toggle: (job: { id: string; company_id: string }, on: boolean) => Promise<void> };

export function useJobStars(onProblem: (why: string) => void): JobStars {
  const { api } = useSession();
  const read = useRead<{ rows: Star[] }>('/jobs/favourites');
  const [rows, setRows] = useState<Star[]>([]);
  const latest = useRef<Star[]>([]);
  const keep = (list: Star[]) => { latest.current = list; setRows(list); };
  useEffect(() => { if (read.data) keep(read.data.rows || []); }, [read.data]);
  return {
    rows, keys: jobStarKeys(rows) as string[],
    toggle: async (job, on) => {
      const row = jobStarRow(job) as Star;
      keep(jobStarPut(latest.current, row, on) as Star[]);
      try { await api('/jobs/favourite', { method: 'PUT', body: jobStarDraft(row, on) }); }
      catch (e) { keep(jobStarPut(latest.current, row, !on) as Star[]); onProblem(jobStarFailed(on, e instanceof Error ? e.message : 'try again') as string); }
    },
  };
}
