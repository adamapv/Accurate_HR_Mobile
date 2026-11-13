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
import { Body, Button, Card, Empty, Figures, Notice, Pill, Problem, Screen, Title, type Figure } from '@/ui';

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
      <Button icon="add-circle-outline" onPress={() => router.push('/claim')}>New claim</Button>
      {claims.offlineAt !== null && <Notice tone="warn" icon="cloud-offline-outline">{`No signal. Showing what was saved at ${fmtTime(claims.offlineAt)}.`}</Notice>}
      <Problem>{claims.error}</Problem>
      {!!rows && rows.length > 0 && (
        <Figures figures={tiles as Figure[]} />
      )}
      {!rows ? (claims.error ? null : <Body tone="muted">Loading…</Body>)
        : rows.length === 0 ? <Empty>{NO_CLAIMS as string}</Empty>
        : rows.map(r => {
          const row = claimRow(r, fmt) as { title: string; meta: string; amount: string };
          return (
            <Pressable key={r.id} accessibilityRole="button" accessibilityLabel={`${row.title || NO_CLAIM_TITLE}, ${row.amount}, ${CLAIM_STATUS[r.status] || r.status}. Open`} onPress={() => router.push(`/claim?id=${encodeURIComponent(r.id)}`)}>
              <Card>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <View style={{ flex: 1 }}><Body strong tone={row.title ? 'fg' : 'muted'}>{row.title || (NO_CLAIM_TITLE as string)}</Body></View>
                  <Body strong>{row.amount}</Body>
                </View>
                <Body tone="muted">{row.meta}</Body>
                <Pill tone={r.status === 'rejected' ? 'danger' : r.status === 'approved' || r.status === 'paid' ? 'ok' : r.status === 'submitted' ? 'warn' : 'neutral'}>{CLAIM_STATUS[r.status] || r.status}</Pill>
              </Card>
            </Pressable>
          );
        })}
    </Screen>
  );
}
