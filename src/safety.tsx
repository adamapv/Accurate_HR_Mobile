// The safety checks under a job on Home: its safe work method statements, each with where the person stands and a button to read it and sign on, and the checklists
// that go with it (start ones, and finish ones once the person is on the job). Where each stands and how it is said are the web app's own rules (shared/job-checks.js).
import { View } from 'react-native';
import { router } from 'expo-router';
import { CHECK_PILL, checkState, heldItems, SWMS_PILL, swmsState } from '@shared/job-checks.js';
import type { Entry } from '@/lib/offline-core';
import { useTheme } from '@/theme';
import { Body, Button, Heading, Notice, Pill, type Tone } from '@/ui';

export type JobRef = { company_id: string; job_id: string; label: string };
export type SwmsEntry = { id: string; version: number; title: string; code?: string; signed: boolean; details?: Record<string, unknown> };
export type CheckItem = { id: string; label: string; required: boolean | number; needs_photo: boolean | number };
export type CheckList = { id: string; name: string; description?: string; phase: 'start' | 'finish'; items: CheckItem[]; done_today: boolean; held: string[] };
export type ForJobs = { jobs: Record<string, SwmsEntry[]>; checks: Record<string, CheckList[]> };

const TONE: Record<string, Tone> = { ok: 'ok', info: 'neutral', warn: 'warn', danger: 'danger' };
// One statement or checklist, set a little apart from the job's own details.
function Block({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <View style={{ gap: 6, padding: 12, borderRadius: 12, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.line2 }}>{children}</View>;
}

export function JobSafety({ job, swms, lists, queued, today, showFinish, keys }: { job: JobRef; swms: SwmsEntry[]; lists: CheckList[]; queued: Entry[]; today: string; showFinish: boolean; keys: string }) {
  const start = lists.filter(l => l.phase === 'start'), finish = showFinish ? lists.filter(l => l.phase === 'finish') : [];
  if (!swms.length && !start.length && !finish.length) return null;
  const to = (pathname: '/swms' | '/checklist', id: string) => router.push({ pathname, params: { company: job.company_id, job: job.job_id, label: job.label, id, keys } });
  return (
    <View style={{ gap: 10 }}>
      {swms.length > 0 && <Heading>{swms.length === 1 ? 'Safe work method statement' : 'Safe work method statements'}</Heading>}
      {swms.map(x => {
        const state = swmsState(x, job, queued) as keyof typeof SWMS_PILL, [tone, label] = SWMS_PILL[state];
        return (
          <Block key={x.id}>
            <Body strong>{x.title}</Body>
            <Body tone="muted">{[`Version ${x.version}`, x.code && `Document ${x.code}`].filter(Boolean).join(' · ')}</Body>
            <Pill tone={TONE[tone]}>{label}</Pill>
            <Button kind={state === 'needed' ? 'primary' : 'plain'} onPress={() => to('/swms', x.id)}>{state === 'needed' ? 'Read and sign on' : 'Read'}</Button>
          </Block>
        );
      })}
      {(start.length > 0 || finish.length > 0) && <Heading>{start.length && finish.length ? 'Start and finish checks' : start.length ? 'Start checks' : 'Finish checks'}</Heading>}
      {[...start, ...finish].map(l => {
        const state = checkState(l, job, queued, today) as keyof typeof CHECK_PILL, [tone, label] = CHECK_PILL[state], held = heldItems(l, job, queued, today) as string[];
        return (
          <Block key={l.id}>
            <Body strong>{l.name}</Body>
            <Body tone="muted">{[l.phase === 'start' ? 'Before you start' : 'When you finish', `${l.items.length} ${l.items.length === 1 ? 'item' : 'items'}`].join(' · ')}</Body>
            <Pill tone={TONE[tone]}>{label}</Pill>
            {state === 'held' && <Notice tone="danger">{`Not OK: ${held.join('; ')}`}</Notice>}
            <Button kind={state === 'todo' || state === 'held' ? 'primary' : 'plain'} onPress={() => to('/checklist', l.id)}>{state === 'todo' ? 'Tick checklist' : 'Tick again'}</Button>
          </Block>
        );
      })}
    </View>
  );
}
