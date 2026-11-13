// My expenses: the four figures over the person's claims, and the claims themselves, newest first. A tap opens one; New claim starts one.
// The figures and what each row says are the web app's own rules (shared/field-core.js).
import { Pressable, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { claimRow, expenseTiles, NO_CLAIM_TITLE, NO_CLAIMS } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtDate, fmtTime, localToday } from '@/lib/dates';
import { fmtMoney } from '@/lib/money';
import { CLAIM_STATUS } from '@/lib/claims';
import { Body, Button, Card, Problem, Screen, Title } from '@/ui';

type Claim = { id: string; claim_date: string; description: string | null; status: string; total_cents: number; jobs: string | null };
type Tile = { key: string; label: string; value: string | number; sub: string; tone?: 'warn' | 'ok' };
const fmt = { fmtDate: (d: string) => fmtDate(String(d).slice(0, 10)), fmtMoney };

export default function Expenses() {
  const { state } = useSession();
  const claims = useRead<{ rows: Claim[] }>('/expense-claims/mine');
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  const rows = claims.data?.rows;
  const tiles = expenseTiles(rows || [], localToday().slice(0, 4), fmtMoney) as Tile[];
  return (
    <Screen>
      <Title>My expenses</Title>
      <Button onPress={() => router.push('/claim')}>New claim</Button>
      {claims.offlineAt !== null && <Body tone="muted">No signal. Showing what was saved at {fmtTime(claims.offlineAt)}.</Body>}
      <Problem>{claims.error}</Problem>
      {!!rows && rows.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {tiles.map(t => (
            <View key={t.key} style={{ flexBasis: '47%', flexGrow: 1 }}>
              <Card>
                <Body tone="muted">{t.label}</Body>
                <Body tone={t.tone === 'ok' ? 'ok' : 'fg'}>{String(t.value)}</Body>
                <Body tone="muted">{t.sub}</Body>
              </Card>
            </View>
          ))}
        </View>
      )}
      {!rows ? (claims.error ? null : <Body tone="muted">Loading…</Body>)
        : rows.length === 0 ? <Body tone="muted">{NO_CLAIMS as string}</Body>
        : rows.map(r => {
          const row = claimRow(r, fmt) as { title: string; meta: string; amount: string };
          return (
            <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={`${row.title || NO_CLAIM_TITLE}, ${row.amount}, ${CLAIM_STATUS[r.status] || r.status}. Open`} onPress={() => router.push(`/claim?id=${encodeURIComponent(r.id)}`)}>
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <View style={{ flex: 1 }}><Body tone={row.title ? 'fg' : 'muted'}>{row.title || (NO_CLAIM_TITLE as string)}</Body></View>
                  <Body>{row.amount}</Body>
                </View>
                <Body tone="muted">{row.meta}</Body>
                <Body tone={r.status === 'rejected' ? 'danger' : r.status === 'approved' || r.status === 'paid' ? 'ok' : 'muted'}>{CLAIM_STATUS[r.status] || r.status}</Body>
              </Card>
            </Pressable>
          );
        })}
      <Button kind="plain" onPress={() => router.back()}>Back</Button>
    </Screen>
  );
}
