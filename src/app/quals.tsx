// My qualifications: the four figures over the person's tickets, what they have sent in for review (one still waiting can be withdrawn), and the tickets on their
// record, each with Renew / update. The figures, the rows and what can be withdrawn are the web app's own rules (shared/field-core.js).
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { NO_QUALS, qualRow, qualTiles, QUALS_SUB, recentSubmissions, submissionRow, withdrawConfirm } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtDate, fmtTime } from '@/lib/dates';
import { Body, Button, Card, Empty, Figures, Heading, Notice, Pill, Problem, Screen, Title, type Figure } from '@/ui';

type Qual = { id: string; title: string; category: string | null; issuing_body: string | null; qualification_number: string | null; expiry_date: string | null; status: string; renewal_booked_for: string | null };
type Sub = { id: string; title: string; qualification_number: string | null; status: string; submitted_at: string; reviewed_at: string | null; reject_reason: string | null };
type Tile = { key: string; label: string; value: number; sub: string; tone?: 'ok' | 'warn' | 'danger' };
type Row = { title: string; meta: string; status: string; tone?: 'ok' | 'warn' | 'danger'; canWithdraw?: boolean };
const day = (d: string) => fmtDate(String(d).slice(0, 10));

export default function Quals() {
  const { state, api, changed } = useSession();
  const quals = useRead<{ rows: Qual[] }>('/qualifications/mine');
  const sent = useRead<{ rows: Sub[] }>('/qualifications/submissions/mine');
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const [said, setSaid] = useState('');
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  const rows = quals.data?.rows;
  const recent = recentSubmissions(sent.data?.rows || [], Date.now()) as Sub[];
  const tiles = qualTiles(rows || [], recent) as Tile[];
  const withdraw = (s: Sub) => {
    const ask = withdrawConfirm(s) as { title: string; body: string; confirmLabel: string };
    Alert.alert(ask.title, ask.body, [{ text: 'Cancel', style: 'cancel' }, { text: ask.confirmLabel, style: 'destructive', onPress: () => {
      setBusy(s.id); setProblem(''); setSaid('');
      api(`/qualifications/submissions/${s.id}`, { method: 'DELETE' }).then(() => { setSaid('Withdrawn'); changed(); })
        .catch(e => setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.')).finally(() => setBusy(''));
    } }]);
  };
  return (
    <Screen>
      <Title>My qualifications</Title>
      <Body tone="muted">{QUALS_SUB as string}</Body>
      {!!state.me.card_reader_configured && <Button icon="scan-outline" onPress={() => router.push('/scan-card')}>Scan a card</Button>}
      <Button kind={state.me.card_reader_configured ? 'plain' : 'primary'} icon="camera-outline" onPress={() => router.push('/submit-ticket')}>Submit a ticket</Button>
      {quals.offlineAt !== null && <Notice tone="warn" icon="cloud-offline-outline">{`No signal. Showing what was saved at ${fmtTime(quals.offlineAt)}.`}</Notice>}
      <Problem>{problem || quals.error || sent.error}</Problem>
      {!!said && <Notice tone="ok">{said}</Notice>}
      {!!rows && (rows.length > 0 || recent.length > 0) && (
        <Figures figures={tiles as Figure[]} />
      )}
      {recent.length > 0 && <Heading>Sent for review</Heading>}
      {recent.map(s => {
        const row = submissionRow(s, day) as Row;
        return (
          <Card key={s.id}>
            <Body strong>{row.title}</Body>
            <Body tone="muted">{row.meta}</Body>
            <Pill tone={row.tone === 'danger' ? 'danger' : row.tone === 'ok' ? 'ok' : 'warn'}>{row.status}</Pill>
            {row.canWithdraw && <Button kind="plain" onPress={() => withdraw(s)} busy={busy === s.id} disabled={!!busy}>Withdraw</Button>}
          </Card>
        );
      })}
      <Heading>On your record</Heading>
      {!rows ? (quals.error ? null : <Body tone="muted">Loading…</Body>)
        : rows.length === 0 ? <Empty>{NO_QUALS as string}</Empty>
        : rows.map(q => {
          const row = qualRow(q, day) as Row;
          return (
            <Card key={q.id}>
              <Body strong>{row.title}</Body>
              <Body tone="muted">{row.meta}</Body>
              <Pill tone={row.tone || 'neutral'}>{row.status}</Pill>
              <Button kind="plain" onPress={() => router.push(`/submit-ticket?renew=${encodeURIComponent(q.id)}`)} disabled={!!busy}>Renew / update</Button>
            </Card>
          );
        })}
    </Screen>
  );
}
