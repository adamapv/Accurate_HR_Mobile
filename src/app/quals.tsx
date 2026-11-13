// My qualifications: the four figures over the person's tickets, what they have sent in for review (one still waiting can be withdrawn), and the tickets on their
// record, each with Renew / update. The figures, the rows and what can be withdrawn are the web app's own rules (shared/field-core.js).
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { NO_QUALS, qualRow, qualTiles, QUALS_SUB, recentSubmissions, submissionRow, withdrawConfirm } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtDate, fmtTime } from '@/lib/dates';
import { Body, Button, Card, Problem, Screen, Title } from '@/ui';

type Qual = { id: string; title: string; category: string | null; issuing_body: string | null; qualification_number: string | null; expiry_date: string | null; status: string; renewal_booked_for: string | null };
type Sub = { id: string; title: string; qualification_number: string | null; status: string; submitted_at: string; reviewed_at: string | null; reject_reason: string | null };
type Tile = { key: string; label: string; value: number; sub: string; tone?: 'ok' | 'warn' | 'danger' };
type Row = { title: string; meta: string; status: string; tone?: 'ok' | 'warn' | 'danger'; canWithdraw?: boolean };
const day = (d: string) => fmtDate(String(d).slice(0, 10));
const toneOf = (t?: string) => t === 'danger' ? 'danger' : t === 'ok' ? 'ok' : 'muted';

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
      <Button onPress={() => router.push('/submit-ticket')}>Submit a ticket</Button>
      {quals.offlineAt !== null && <Body tone="muted">No signal. Showing what was saved at {fmtTime(quals.offlineAt)}.</Body>}
      <Problem>{problem || quals.error || sent.error}</Problem>
      {!!said && <Body tone="ok">{said}</Body>}
      {!!rows && (rows.length > 0 || recent.length > 0) && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {tiles.map(t => (
            <View key={t.key} style={{ flexBasis: '47%', flexGrow: 1 }}>
              <Card>
                <Body tone="muted">{t.label}</Body>
                <Body tone={t.value && t.tone === 'danger' ? 'danger' : t.tone === 'ok' ? 'ok' : 'fg'}>{String(t.value)}</Body>
                <Body tone="muted">{t.sub}</Body>
              </Card>
            </View>
          ))}
        </View>
      )}
      {recent.length > 0 && <Body>Sent for review</Body>}
      {recent.map(s => {
        const row = submissionRow(s, day) as Row;
        return (
          <Card key={s.id}>
            <Body>{row.title}</Body>
            <Body tone="muted">{row.meta}</Body>
            <Body tone={toneOf(row.tone)}>{row.status}</Body>
            {row.canWithdraw && <Button kind="plain" onPress={() => withdraw(s)} busy={busy === s.id} disabled={!!busy}>Withdraw</Button>}
          </Card>
        );
      })}
      <Body>On your record</Body>
      {!rows ? (quals.error ? null : <Body tone="muted">Loading…</Body>)
        : rows.length === 0 ? <Body tone="muted">{NO_QUALS as string}</Body>
        : rows.map(q => {
          const row = qualRow(q, day) as Row;
          return (
            <Card key={q.id}>
              <Body>{row.title}</Body>
              <Body tone="muted">{row.meta}</Body>
              <Body tone={row.tone === 'warn' ? 'danger' : toneOf(row.tone)}>{row.status}</Body>
              <Button kind="plain" onPress={() => router.push(`/submit-ticket?renew=${encodeURIComponent(q.id)}`)} disabled={!!busy}>Renew / update</Button>
            </Card>
          );
        })}
      <Button kind="plain" onPress={() => router.back()}>Back</Button>
    </Screen>
  );
}
