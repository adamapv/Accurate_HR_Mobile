// Home. For now it shows who is signed in and where the clock stands, read from the server with the same rules the web Field view uses (shared/field-core.js);
// clocking on and the rest of Home are built on this next.
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { Redirect } from 'expo-router';
import { can } from '@shared/access.js';
import { openCardState, restHoldText } from '@shared/field-core.js';
import { useSession, type Me } from '@/lib/session';
import { fmtDate, fmtMins, localNowHM, localToday } from '@/lib/dates';
import { Body, Button, Card, Loading, Problem, Screen, Title } from '@/ui';

type OpenCard = { card: { work_date: string; clock_on: string; job_label: string | null; activity_label: string | null } | null; night: { rest_hours: number; window: { start: string; end: string } } | null; recent?: unknown[] };

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
  const { api, signOut } = useSession();
  const [open, setOpen] = useState<OpenCard | null>(null);
  const [problem, setProblem] = useState('');
  const [, tick] = useState(0);
  const load = useCallback(async () => {
    try { setOpen(await api<OpenCard>('/job-cards/open')); setProblem(''); } catch (e) { setProblem(e instanceof Error ? e.message : 'Could not load.'); }
  }, [api]);
  // Fresh when the app opens and each time it comes back to the front; the minutes tick over on their own.
  useEffect(() => {
    void load();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') void load(); });
    const t = setInterval(() => tick(n => n + 1), 30000);
    return () => { sub.remove(); clearInterval(t); };
  }, [load]);

  const today = localToday();
  const clock = open ? openCardState({ card: open.card, night: open.night, recent: open.recent || [], date: today, time: localNowHM() }) : null;
  const first = me.employee.name.split(/\s+/)[0];
  return (
    <Screen>
      <Title>Hi {first}</Title>
      <Body tone="muted">{me.company.company_name}{me.access_level ? ` · ${me.access_level}` : ''}</Body>
      <Card>
        {!open || !clock ? <Body tone="muted">{problem ? '' : 'Loading…'}</Body>
          : open.card && clock.sameDay ? (
            <>
              <Body tone="ok">On the clock since {open.card.clock_on}</Body>
              <Body>{fmtMins(clock.elapsed)} so far{open.card.job_label ? ` · ${open.card.job_label}` : open.card.activity_label ? ` · ${open.card.activity_label}` : ''}</Body>
            </>
          ) : open.card ? <Body tone="danger">Still clocked on from {fmtDate(open.card.work_date)}</Body>
          : clock.rest ? <Body tone="danger">{restHoldText(clock.rest, today, fmtDate)}</Body>
          : <Body>Not on the clock.</Body>}
        <Problem>{problem}</Problem>
      </Card>
      <Card>
        <Body tone="muted">This is an early build of the app. {can(me.access, 'field_view') ? 'Clock on, your job card and the rest of your day are in the Field view in your browser for now.' : 'Your level uses the full app in a browser.'}</Body>
      </Card>
      <Button kind="plain" onPress={() => { void signOut(); }}>Sign out</Button>
    </Screen>
  );
}
