// Home. Who is signed in, where the clock stands, and Clock on. The clock is read with the web Field view's own rules (shared/field-core.js) and written through
// the outbox (shared/offline-queue.js), so a clock-on with no signal is kept on the phone and sent once when the signal returns.
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';
import { openCardState, restHoldText } from '@shared/field-core.js';
import { applyToOpenCard, applyToRecent, describe } from '@shared/offline-queue.js';
import { useSession, type Me } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { useOutbox } from '@/lib/use-outbox';
import { fmtDate, fmtMins, fmtTime, localNowHM, localToday } from '@/lib/dates';
import { Body, Button, Card, Loading, Problem, Screen, Title } from '@/ui';

type OpenCard = {
  card: { id: string; work_date: string; clock_on: string; job_label: string | null; activity_label: string | null } | null;
  night: { rest_hours: number; window: { start: string; end: string } } | null;
  recent?: unknown[];
};

export default function Home() {
  const { state, retry, signOut } = useSession();
  if (state.status === 'loading') return <Loading />;
  if (state.status === 'signedOut') return <Redirect href="/sign-in" />;
  if (state.status === 'unreachable') {
    return (
      <Screen centered>
        <Title>Can’t reach AccurateHR</Title>
        <Body tone="muted">{state.message}</Body>
        <Button onPress={retry}>Try again</Button>
        <Button kind="plain" onPress={() => { void signOut(); }}>Sign out</Button>
      </Screen>
    );
  }
  if (state.me.employee.must_change_pin) return <Redirect href="/change-pin" />;
  return <SignedIn me={state.me} />;
}

function SignedIn({ me }: { me: Me }) {
  const { offline, signOut } = useSession();
  const open = useRead<OpenCard>('/job-cards/open');
  const queued = useOutbox();
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
  const fromJobs = me.employee.time_source === 'jobs';
  const loaded = open.data !== undefined || !!card;

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
      <Title>Hi {me.employee.name.split(/\s+/)[0]}</Title>
      <Body tone="muted">{me.company.company_name}{me.access_level ? ` · ${me.access_level}` : ''}</Body>
      {open.offlineAt !== null && <Body tone="muted">No signal. Showing what was saved at {fmtTime(open.offlineAt)}.</Body>}

      <Card>
        {!loaded ? <Body tone="muted">{open.error ? '' : 'Loading…'}</Body>
          : card && clock.sameDay ? (
            <>
              <Body tone="ok">On the clock since {card.clock_on}</Body>
              <Body>{fmtMins(clock.elapsed)} so far{card.job_label ? ` · ${card.job_label}` : card.activity_label ? ` · ${card.activity_label}` : ''}</Body>
              {card.pending && <Body tone="muted">Saved on your phone. It’s sent when you have signal.</Body>}
              <Body tone="muted">Clock off in the Field view in your browser for now.</Body>
            </>
          ) : card ? <Body tone="danger">Still clocked on from {fmtDate(card.work_date)}. Enter your clock-off time in the Field view in your browser.</Body>
          : fromJobs ? <Body tone="muted">Your job time is recorded in AccurateJobs.</Body>
          : (
            <>
              <Body>{view.clockedOff ? 'Clocked off. Saved on your phone until you have signal.' : 'Not on the clock.'}</Body>
              {clock.rest && <Body tone="danger">{restHoldText(clock.rest, today, fmtDate)}</Body>}
              <Button onPress={clockOn} busy={busy} disabled={!!clock.rest}>{`Clock on · ${now}`}</Button>
            </>
          )}
        <Problem>{problem || open.error}</Problem>
      </Card>

      {failed.length > 0 && (
        <Card>
          <Body tone="danger">{failed.length === 1 ? 'Something saved on your phone couldn’t be sent' : `${failed.length} things saved on your phone couldn’t be sent`}</Body>
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

      <Card>
        <Body tone="muted">This is an early build of the app. Your job card and the rest of your day are in the Field view in your browser for now.</Body>
      </Card>
      <Button kind="plain" onPress={() => { void signOut(); }}>Sign out</Button>
    </Screen>
  );
}
