// My assets: the three figures over what the person holds, and each item with Report issue. The figures and what a row says are the web app's own rules
// (shared/field-core.js).
import { Redirect, router } from 'expo-router';
import { View } from 'react-native';
import { assetRow, assetsSub, assetTiles, NO_ASSETS } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtTime } from '@/lib/dates';
import { fmtMoney } from '@/lib/money';
import { Body, Button, Card, Problem, Screen, Title } from '@/ui';

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
      {assets.offlineAt !== null && <Body tone="muted">No signal. Showing what was saved at {fmtTime(assets.offlineAt)}.</Body>}
      <Problem>{assets.error}</Problem>
      {!!rows && rows.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(assetTiles(rows, fmtMoney) as Tile[]).map(t => (
            <View key={t.key} style={{ flexBasis: '30%', flexGrow: 1 }}>
              <Card>
                <Body tone="muted">{t.label}</Body>
                <Body tone={t.tone ? 'danger' : 'fg'}>{String(t.value)}</Body>
                <Body tone="muted">{t.sub}</Body>
              </Card>
            </View>
          ))}
        </View>
      )}
      {!rows ? (assets.error ? null : <Body tone="muted">Loading…</Body>)
        : rows.length === 0 ? <Body tone="muted">{NO_ASSETS as string}</Body>
        : rows.map(a => {
          const row = assetRow(a, fmtMoney) as { title: string; meta: string; condition: string };
          return (
            <Card key={a.id}>
              <Body>{row.title}</Body>
              {!!row.meta && <Body tone="muted">{row.meta}</Body>}
              {!!row.condition && <Body tone={['Poor', 'Lost'].includes(row.condition) ? 'danger' : 'muted'}>{row.condition}</Body>}
              <Button kind="plain" onPress={() => router.push(`/report-asset?id=${encodeURIComponent(a.id)}`)}>Report issue</Button>
            </Card>
          );
        })}
      <Button kind="plain" onPress={() => router.back()}>Back</Button>
    </Screen>
  );
}
