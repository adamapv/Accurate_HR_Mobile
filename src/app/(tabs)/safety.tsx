// The Safety tab: what has to be signed on to and ticked on today's jobs (and what is coming tomorrow), the company's policies to read and acknowledge, and where to
// report an incident or hazard. The checks are the same ones Home shows, by the same rules (shared/job-checks.js); the policies' order and wording are the web app's.
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { can } from '@shared/access.js';
import { policyList, schedRowTitle } from '@shared/field-core.js';
import { applyToOpenCard } from '@shared/offline-queue.js';
import { finishChecks, holdText, safetyJobKeys, startGate } from '@shared/job-checks.js';
import { addDaysIso } from '@shared/pickers-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { useOutbox } from '@/lib/use-outbox';
import { fmtDate, fmtTime, localToday } from '@/lib/dates';
import type { SchedRow } from '@/job-row';
import { JobSafety, type ForJobs } from '@/safety';
import { Body, Card, Empty, Heading, List, Notice, Pill, Problem, Row, Screen, Title } from '@/ui';

type Gate = { ready: boolean; held: boolean };
const gateOf = startGate as unknown as (a: { job: unknown; swms: unknown[]; lists: unknown[]; queued: unknown[]; today: string }) => Gate;
const finishOf = finishChecks as unknown as (a: { job: unknown; lists: unknown[]; queued: unknown[]; today: string }) => { state: string }[];
export type Policy = { id: string; title: string; description: string | null; template_body: string | null; requires_signature: number; acknowledged_at: string | null; signature_name: string | null };

export default function Safety() {
  const { state } = useSession();
  const today = localToday(), tomorrow = addDaysIso(today, 1);
  const sched = useRead<{ rows: SchedRow[] }>(`/schedule/mine?from=${today}&to=${tomorrow}`);
  const open = useRead<{ card: { id: string; job_id: string | null; company_id: string | null } | null }>('/job-cards/open');
  const queued = useOutbox();
  const policies = useRead<{ rows: Policy[] }>('/policies/mine');
  const access = state.status === 'signedIn' ? state.me.access : {};
  const canSafety = can(access, 'job_safety'), canWhs = can(access, 'whs');
  const card = applyToOpenCard(open.data?.card || null, queued).card as { job_id: string | null; company_id: string | null } | null;
  const keys = safetyJobKeys(sched.data?.rows, card, today, tomorrow) as string;
  const forJobs = useRead<ForJobs>(canSafety && keys ? `/job-safety/for-jobs?jobs=${keys}` : null);
  if (state.status !== 'signedIn') return null;

  const block = (r: SchedRow, isTomorrow: boolean) => {
    const key = `${r.company_id}:${r.job_id}`, ref = { company_id: r.company_id, job_id: r.job_id, label: `#${r.job_id} ${r.job_name || ''}`.trim() };
    const lists = forJobs.data?.checks?.[key] || [], swms = forJobs.data?.jobs?.[key] || [];
    if (!swms.length && (isTomorrow || !lists.length)) return null;
    const onThis = !!card && String(card.job_id) === String(r.job_id) && String(card.company_id || '') === String(r.company_id || '');
    const gate = !isTomorrow && forJobs.data ? gateOf({ job: ref, swms, lists, queued, today }) : null;
    const title = schedRowTitle(r) as { tag: string; name: string };
    return (
      <Card key={`${r.work_date}:${key}`}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Body strong>{title.name}</Body>
            {(r.customer_name || r.site_name) && <Body tone="muted">{[r.customer_name, r.site_name].filter(Boolean).join(' · ')}</Body>}
          </View>
          <Pill tone="info">{title.tag}</Pill>
        </View>
        <JobSafety job={ref} swms={swms} lists={isTomorrow ? [] : lists} queued={queued} today={today} keys={keys}
          showFinish={onThis || finishOf({ job: ref, lists, queued, today }).some(c => c.state !== 'todo')} />
        {gate && !gate.ready && !onThis && <Notice tone={gate.held ? 'danger' : 'warn'}>{holdText(gate) as string}</Notice>}
      </Card>
    );
  };
  const rows = sched.data?.rows || [];
  const todays = rows.filter(r => r.work_date === today && !r.activity && r.job_id), tomorrows = rows.filter(r => r.work_date === tomorrow && !r.activity && r.job_id);
  const todayBlocks = todays.map(r => block(r, false)).filter(Boolean), tomorrowBlocks = tomorrows.map(r => block(r, true)).filter(Boolean);
  const list = policyList(policies.data?.rows, fmtDate) as { policy: Policy; read: boolean; sub: string }[];
  const offlineAt = sched.offlineAt ?? forJobs.offlineAt ?? policies.offlineAt;

  return (
    <Screen>
      <Title>Safety</Title>
      {offlineAt !== null && <Notice tone="warn" icon="cloud-offline-outline">{`No signal. Showing what was saved at ${fmtTime(offlineAt)}.`}</Notice>}
      {canWhs && (
        <List>
          <Row icon="medkit-outline" tint="orange" title="Safety reports" sub="Report an incident, damage or a hazard" onPress={() => router.push('/safety-reports')} last />
        </List>
      )}
      {canSafety && (
        <>
          <Heading>Today’s jobs</Heading>
          {!sched.data || (keys && !forJobs.data && !forJobs.error) ? <Body tone="muted">{sched.error || 'Loading…'}</Body>
            : todayBlocks.length === 0 ? <Empty icon="shield-checkmark-outline">{todays.length ? 'Nothing to sign on to or tick on today’s jobs.' : 'Nothing published for you today.'}</Empty>
            : todayBlocks}
          <Problem>{forJobs.error}</Problem>
          {tomorrowBlocks.length > 0 && <><Heading>Tomorrow</Heading>{tomorrowBlocks}</>}
        </>
      )}

      <Heading>Company policies</Heading>
      {!policies.data ? <Body tone="muted">{policies.error || 'Loading…'}</Body>
        : list.length === 0 ? <Empty icon="book-outline">No policies published yet.</Empty>
        : (
          <List>
            {list.map(({ policy, read, sub }, i) => (
              <Row key={policy.id} icon="book-outline" tint={read ? 'green' : 'amber'} title={policy.title} sub={sub} right={read ? undefined : <Pill tone="warn">To read</Pill>}
                onPress={() => router.push({ pathname: '/policy', params: { id: policy.id } })} last={i === list.length - 1} />
            ))}
          </List>
        )}

    </Screen>
  );
}
