// My assets: the three figures over what the person holds, and each item with Report issue. The figures and what a row says are the web app's own rules
// (shared/field-core.js).
import { Redirect, router } from 'expo-router';
import { View } from 'react-native';
import { assetRow, assetsSub, assetTiles, NO_ASSETS } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtTime } from '@/lib/dates';
import { fmtMoney } from '@/lib/money';
import { Body, Button, Card, Empty, Figures, Notice, Pill, Problem, Screen, Title, type Figure } from '@/ui';

export type Asset = { id: string; name: string; category_name: string | null; brand: string | null; model: string | null; serial_number: string | null; condition: string | null; current_value_cents: number | null };
type Tile = { key: string; label: string; value: string | number; sub: string; tone?: 'warn' };

export default function Assets() {
  const { state } = useSession();
  const assets = useRead<{ rows: Asset[] }>(state.status === 'signedIn' ? `/assets/by-employee/${encodeURIComponent(state.me.employee.id)}` : null);
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  const rows = assets.data?.rows;
  return (
    <Screen>
      <Title>My assets</Title>
      {!!rows && <Body tone="muted">{assetsSub(rows) as string}</Body>}
      {assets.offlineAt !== null && <Notice tone="warn" icon="cloud-offline-outline">{`No signal. Showing what was saved at ${fmtTime(assets.offlineAt)}.`}</Notice>}
      <Problem>{assets.error}</Problem>
      {!!rows && rows.length > 0 && (
        <Figures figures={assetTiles(rows, fmtMoney) as Figure[]} />
      )}
      {!rows ? (assets.error ? null : <Body tone="muted">Loading…</Body>)
        : rows.length === 0 ? <Empty>{NO_ASSETS as string}</Empty>
        : rows.map(a => {
          const row = assetRow(a, fmtMoney) as { title: string; meta: string; condition: string };
          return (
            <Card key={a.id}>
              <Body strong>{row.title}</Body>
              {!!row.meta && <Body tone="muted">{row.meta}</Body>}
              {!!row.condition && <Pill tone={['Poor', 'Lost'].includes(row.condition) ? 'danger' : row.condition === 'Fair' ? 'warn' : 'ok'}>{row.condition}</Pill>}
              <Button kind="plain" icon="alert-circle-outline" onPress={() => router.push(`/report-asset?id=${encodeURIComponent(a.id)}`)}>Report issue</Button>
            </Card>
          );
        })}
    </Screen>
  );
}
