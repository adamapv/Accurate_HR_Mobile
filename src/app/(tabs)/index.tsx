// Home. Who is signed in, where the clock stands, Clock on, and the jobs published for the person today and tomorrow, each with its safety checks and Start.
// Start is held until the job's statements are signed on to and its start checklists ticked: the rule is the web app's own (shared/job-checks.js startGate), and
// nothing is held on a guess (only once what goes with the job has been read, for someone whose level has the Job safety area). The clock is read with the web Field view's own rules (shared/field-core.js) and written through
// the outbox (shared/offline-queue.js), so a clock-on with no signal is kept on the phone and sent once when the signal returns.
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { can } from '@shared/access.js';
import { findJob, onlyCostCentre, openCardState, restHoldText, timeFromJobs } from '@shared/field-core.js';
import { finishChecks, holdText, safetyJobKeys, startButton, startGate, startStep } from '@shared/job-checks.js';
import { applyToOpenCard, applyToRecent, describe } from '@shared/offline-queue.js';
import { addDaysIso } from '@shared/pickers-core.js';
import { JobRow, type SchedRow } from '@/job-row';
import { JobSafety, type ForJobs } from '@/safety';
import { hand } from '@/lib/handoff';
import type { Draft } from '@/lib/offline-core';
import { useSession, type Me } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { useOutbox } from '@/lib/use-outbox';
import { fmtDate, fmtMins, fmtTime, localNowHM, localToday, parseDay } from '@/lib/dates';
import { useTheme } from '@/theme';
import { Avatar, Body, Button, Card, Display, Empty, Heading, Hero, List, Notice, Pill, Problem, Row, Screen, Title } from '@/ui';
import { SafeModeCard } from '@/safe-mode';

// The shared rules are plain JavaScript, so what these two take and give back is spelled out here.
type Gate = { ready: boolean; held: boolean; outstanding: unknown[] };
const gateOf = startGate as unknown as (a: { job: unknown; swms: unknown[]; lists: unknown[]; queued: unknown[]; today: string }) => Gate;
const finishOf = finishChecks as unknown as (a: { job: unknown; lists: unknown[]; queued: unknown[]; today: string }) => { state: string }[];

type OpenCard = {
  card: { id: string; work_date: string; clock_on: string; job_id: string | null; company_id: string | null; job_label: string | null; activity_label: string | null } | null;
  night: { rest_hours: number; window: { start: string; end: string } } | null;
  recent?: unknown[];
};

export default function Home() {
  const { state } = useSession();
  // The tabs only open for someone signed in (see _layout.tsx).
  return state.status === 'signedIn' ? <SignedIn me={state.me} /> : null;
}

function SignedIn({ me }: { me: Me }) {
  const { api, offline, changed } = useSession();
  const theme = useTheme();
  const open = useRead<OpenCard>('/job-cards/open');
  const queued = useOutbox();
  const day0 = localToday();
  const sched = useRead<{ rows: SchedRow[] }>(`/schedule/mine?from=${day0}&to=${addDaysIso(day0, 1)}`);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick(n => n + 1), 30000); return () => clearInterval(t); }, []);

  const today = localToday(), now = localNowHM();
  // The server's card with what is still waiting on this phone laid over it.
  const view = applyToOpenCard(open.data?.card || null, queued);
  const card = view.card as (NonNullable<OpenCard['card']> & { pending?: boolean }) | null;
  const clock = openCardState({ card, night: open.data?.night || null, recent: applyToRecent(open.data?.recent || [], queued), date: today, time: now });
  const failed = queued.filter(e => e.status === 'failed');
  // People whose job time comes from AccurateJobs do not clock on here.
  const fromJobs = timeFromJobs(me.employee, today) as boolean;
  const loaded = open.data !== undefined || !!card;

  // The statements and checklists on the jobs listed here, for someone whose level has the Job safety area; nobody else is asked.
  const canSafety = can(me.access, 'job_safety');
  const keys = safetyJobKeys(sched.data?.rows, card, today, addDaysIso(today, 1)) as string;
  const forJobs = useRead<ForJobs>(canSafety && keys ? `/job-safety/for-jobs?jobs=${keys}` : null);
  const jobs = useRead<{ rows: { id: string; company_id: string; sections: { id: string; cost_centres: { id: string }[] }[] }[] }>('/jobs');
  // Each statement is fetched once while there is signal, so it can be read and signed on to with none.
  useEffect(() => {
    for (const list of Object.values(forJobs.data?.jobs || {})) for (const x of list) {
      const path = `/job-safety/swms/${x.id}/versions/${x.version}`;
      if (!offline.recall(path)) void api(path).then(v => offline.remember(path, v)).catch(() => {});
    }
  }, [forJobs.data, api, offline]);
  const [starting, setStarting] = useState('');
  // Chat sits at the top of Home, as it sits in the top bar on the web, for a level with the Chat area.
  const canChat = can(me.access, 'chat');
  const canPo = can(me.access, 'purchase_orders', 'edit'), seesPos = can(me.access, 'purchase_orders');
  const unread = useRead<{ unread: number }>(canChat ? '/chat/unread' : null);

  // One scheduled job: its details, its safety checks, why Start is held if it is, and Start.
  const jobRow = (r: SchedRow, tomorrow: boolean) => {
    const key = `${r.company_id}:${r.job_id}`, ref = { company_id: r.company_id, job_id: r.job_id, label: `#${r.job_id} ${r.job_name || ''}`.trim() };
    if (r.activity) return <JobRow key={`${r.work_date}:${key}`} row={r} />;
    const swms = forJobs.data?.jobs?.[key] || [], lists = forJobs.data?.checks?.[key] || [];
    const onThis = !!card && String(card.job_id) === String(r.job_id) && String(card.company_id || '') === String(r.company_id || '');
    const gate = !tomorrow && forJobs.data ? gateOf({ job: ref, swms, lists, queued, today }) : null;
    const held = !!gate && !gate.ready, note = !onThis ? (holdText(gate) as string) : '';
    const job = findJob(jobs.data?.rows || [], r.company_id, r.job_id);
    const btn = startButton({ onIt: onThis, card, held, rest: clock.rest, restText: clock.rest ? restHoldText(clock.rest, today, fmtDate) : '', busy: !!starting, loaded }) as { label: string; disabled: boolean; title: string };
    const start = async () => {
      const step = startStep({ row: r, only: onlyCostCentre(job), hasJob: !!job, card, now: { date: localToday(), time: localNowHM() } }) as { form?: unknown; clockOn?: { job_label: string } & Record<string, unknown> };
      if (step.form) return router.push({ pathname: '/job-card', params: { init: hand(step.form) } });
      setStarting(key); setProblem('');
      const { job_label, ...body } = step.clockOn!;
      const at = { work_date: localToday(), clock_on: localNowHM() };
      try {
        const sent = await offline.submit({ kind: 'clock-on', method: 'POST', path: '/job-cards', body: { ...at, ...body }, local_card: { ...at, ...body, job_label, source: 'clock' } } as Draft);
        if (sent.outcome === 'sent') await open.reload();
        changed();
      } catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
      setStarting('');
    };
    return (
      <JobRow key={`${r.work_date}:${key}`} row={r}>
        <JobSafety job={ref} swms={swms} lists={tomorrow ? [] : lists} queued={queued} today={today} keys={keys}
          showFinish={onThis || finishOf({ job: ref, lists, queued, today }).some(c => c.state !== 'todo')} />
        {!!note && <Notice tone={gate?.held ? 'danger' : 'warn'}>{note}</Notice>}
        {!tomorrow && !fromJobs && (
          <>
            <Button icon={onThis ? undefined : 'play-circle-outline'} onPress={() => { void start(); }} busy={starting === key} disabled={btn.disabled} kind={onThis || card ? 'plain' : 'primary'}>{btn.label}</Button>
            {btn.disabled && !onThis && !note && !!btn.title && <Body tone="muted">{btn.title}</Body>}
          </>
        )}
        {canPo && <Button kind="plain" icon="receipt-outline" onPress={() => router.push({ pathname: '/raise-po', params: { job: key } })}>Raise PO</Button>}
      </JobRow>
    );
  };

  const clockOn = async () => {
    setBusy(true); setProblem('');
    const at = { work_date: localToday(), clock_on: localNowHM() };
    try {
      const r = await offline.submit({ kind: 'clock-on', method: 'POST', path: '/job-cards', body: at, local_card: { ...at, job_label: null, source: 'clock' } });
      if (r.outcome === 'sent') await open.reload();
    } catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy(false);
  };

  return (
    <Screen>
      <SafeModeCard />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.accent2, fontSize: 13.5, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 }}>{parseDay(today).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
          <Title>Hi {me.employee.name.split(/\s+/)[0]}</Title>
          <Body tone="muted">{me.company.company_name}{me.access_level ? ` · ${me.access_level}` : ''}</Body>
        </View>
        <Avatar name={me.employee.name} size={52} />
      </View>
      {open.offlineAt !== null && <Notice tone="warn" icon="cloud-offline-outline">{`No signal. Showing what was saved at ${fmtTime(open.offlineAt)}.`}</Notice>}
      {(seesPos || canChat) && (
        <List>
          {canChat && <Row icon="chatbubbles-outline" tint="violet" title="Chat" sub={unread.data && unread.data.unread > 0 ? `${unread.data.unread > 99 ? '99+' : unread.data.unread} unread` : 'Message the office and your crew'}
            right={unread.data && unread.data.unread > 0 ? <Pill tone="info">{unread.data.unread > 99 ? '99+' : String(unread.data.unread)}</Pill> : undefined} onPress={() => router.push('/chats')} last={!seesPos} />}
          {seesPos && <Row icon="receipt-outline" tint="violet" title="Purchase orders" sub="Raise one, and see yours" onPress={() => router.push('/pos')} last />}
        </List>
      )}

      <Hero tone={card && clock.sameDay ? 'ok' : 'accent'}>
        {!loaded ? <Body tone="muted">{open.error ? '' : 'Loading…'}</Body>
          : card && clock.sameDay ? (
            <>
              <Pill tone="ok">On the clock since {card.clock_on}</Pill>
              <Display>{fmtMins(clock.elapsed)}</Display>
              {!!(card.job_label || card.activity_label) && <Body tone="muted">{card.job_label || card.activity_label}</Body>}
              {card.pending && <Notice tone="info" icon="cloud-upload-outline">Saved on your phone. It’s sent when you have signal.</Notice>}
              <Button icon="stop-circle-outline" onPress={() => router.push({ pathname: '/job-card', params: { id: card.id } })}>Clock off</Button>
              <Button kind="plain" icon="swap-horizontal-outline" onPress={() => router.push({ pathname: '/job-card', params: { id: card.id, edit: '1' } })}>{card.job_id || card.activity_label ? 'Change job' : 'Pick job'}</Button>
            </>
          ) : card ? (
            <>
              <Notice tone="danger">{`Still clocked on from ${fmtDate(card.work_date)}.`}</Notice>
              <Button onPress={() => router.push({ pathname: '/job-card', params: { id: card.id } })}>Enter your clock-off time</Button>
            </>
          )
          : fromJobs ? <Body tone="muted">Your job time is recorded in AccurateJobs.</Body>
          : (
            <>
              <Pill tone="neutral">{view.clockedOff ? 'Clocked off' : 'Not on the clock'}</Pill>
              {view.clockedOff && <Body tone="muted">Saved on your phone until you have signal.</Body>}
              {clock.rest && <Notice tone="danger">{restHoldText(clock.rest, today, fmtDate) as string}</Notice>}
              <Button icon="play-circle-outline" onPress={clockOn} busy={busy} disabled={!!clock.rest}>{`Clock on · ${now}`}</Button>
              <Button kind="plain" icon="add-circle-outline" onPress={() => router.push('/job-card')} disabled={busy}>Add time</Button>
            </>
          )}
        <Problem>{problem || open.error}</Problem>
      </Hero>

      {failed.length > 0 && (
        <Card>
          <Notice tone="danger">{failed.length === 1 ? 'Something saved on your phone couldn’t be sent' : `${failed.length} things saved on your phone couldn’t be sent`}</Notice>
          {failed.map(e => (
            <View key={e.id} style={{ gap: 8 }}>
              <Body>{describe(e)}</Body>
              <Body tone="muted">{e.error}</Body>
              <Button kind="plain" onPress={() => { offline.retry(e.id); void offline.replay().then(() => open.reload()); }}>Try again</Button>
              <Button kind="plain" onPress={() => { offline.discard(e.id); }}>Discard</Button>
            </View>
          ))}
        </Card>
      )}

      <Heading>Scheduled today</Heading>
      {!sched.data ? <Body tone="muted">{sched.error || 'Loading…'}</Body>
        : sched.data.rows.filter(r => r.work_date === today).length === 0 ? <Empty icon="calendar-outline">Nothing published for you today.</Empty>
        : sched.data.rows.filter(r => r.work_date === today).map(r => jobRow(r, false))}
      {!!sched.data && sched.data.rows.some(r => r.work_date > today) && (
        <>
          <Heading>Tomorrow</Heading>
          {sched.data.rows.filter(r => r.work_date > today).map(r => jobRow(r, true))}
        </>
      )}

    </Screen>
  );
}
