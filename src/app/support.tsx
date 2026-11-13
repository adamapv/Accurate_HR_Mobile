// Support: the requests the person has sent to the product's own support team (or the whole company's, when their level sees everyone's), open and solved,
// and Ask for help. Which are open, where each stands, whose turn it is and the words are the web app's own rules (shared/field-core.js). The Worker
// decides who may see and ask (the Support requests area); the row in More shows only for a level that has it.
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { Redirect, router } from 'expo-router';
import { can } from '@shared/access.js';
import { SUPPORT_ASK, SUPPORT_WARNING, supportEmpty, supportNeedsYou, supportRowMeta, supportState, supportTabs } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtDateTime } from '@/lib/dates';
import { Button, Choice, Empty, List, Loading, Notice, Pill, Problem, Row, Screen, Title, type Tone } from '@/ui';

export type SupportRequest = { id: string; subject: string; status: string; messages: number; raised_by: string | null; raised_by_name: string; created_at: string; last_message_at: string; access: { until: string; by: string | null } | null };
export type SupportList = { requests: SupportRequest[]; me: string; everyone: boolean; can_ask: boolean; can_allow_access: boolean; needs_you: number };
// The web app's "muted" pill is the app's neutral one.
export const pillTone = (t: string): Tone => (t === 'muted' ? 'neutral' : t as Tone);

export default function Support() {
  const { state } = useSession();
  const allowed = state.status === 'signedIn' && can(state.me.access, 'support');
  const list = useRead<SupportList>(allowed ? '/support/requests' : null);
  const [tab, setTab] = useState<'open' | 'solved'>('open');
  const reload = list.reload;
  // An answer arrives while the screen is open: look again every half minute, while the app is showing.
  useEffect(() => { const t = setInterval(() => { if (AppState.currentState === 'active') void reload(); }, 30000); return () => clearInterval(t); }, [reload]);
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (!allowed) return <Redirect href="/more" />;
  if (!list.data) return list.error ? <Screen><Title>Support</Title><Problem>{list.error}</Problem></Screen> : <Loading />;
  const data = list.data, tabs = supportTabs(data) as { open: SupportRequest[]; solved: SupportRequest[] }, shown = tabs[tab];
  const waiting = supportNeedsYou(data) as string;
  return (
    <Screen>
      <Title>Support</Title>
      <Notice tone="info">{SUPPORT_WARNING as string}</Notice>
      {!!waiting && <Notice tone="warn">{waiting}</Notice>}
      <Problem>{list.error}</Problem>
      {data.can_ask && <Button icon="help-buoy-outline" onPress={() => router.push('/ask-support')}>{SUPPORT_ASK as string}</Button>}
      <Choice options={[{ key: 'open', label: `Open (${tabs.open.length})` }, { key: 'solved', label: `Solved (${tabs.solved.length})` }]} value={tab} onChange={setTab} />
      {shown.length === 0 ? <Empty icon="chatbox-ellipses-outline">{supportEmpty(data, tab) as string}</Empty> : (
        <List>
          {shown.map((r, n) => { const st = supportState(r, data.me) as { label: string; tone: string }; return (
            <Row key={r.id} title={r.subject} sub={supportRowMeta(r, data, fmtDateTime) as string} right={<Pill tone={pillTone(st.tone)}>{st.label}</Pill>} onPress={() => router.push(`/support-request?id=${encodeURIComponent(r.id)}`)} last={n === shown.length - 1} />
          ); })}
        </List>
      )}
    </Screen>
  );
}
