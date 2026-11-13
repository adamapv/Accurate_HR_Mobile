// POs: the ones this person has raised (or everyone's, for a level that sees everyone's), newest first. A tap copies the number to give to a supplier.
// What the list says and each PO's lines are the web app's own words (shared/field-core.js).
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { can, scopeOf } from '@shared/access.js';
import { poEmptyText, poJobLine, poListSub, poMeta } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtTime } from '@/lib/dates';
import { Body, Button, Card, Empty, Notice, Pill, Problem, Screen, Title } from '@/ui';

type PO = { id: string; po_number: string; vendor_name: string | null; job_label: string | null; cost_centre_label: string | null; reference: string | null; created_at: string; created_by_name: string | null };
const when = (iso: string) => new Date(/^\d{4}-\d{2}-\d{2} /.test(iso) ? `${iso.replace(' ', 'T')}Z` : iso).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

export default function POs() {
  const { state } = useSession();
  const pos = useRead<{ rows: PO[] }>('/purchase-orders');
  const jobs = useRead<{ configured: boolean }>('/jobs');
  const [copied, setCopied] = useState('');
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  const everyones = scopeOf(state.me.access, 'purchase_orders') === 'all';
  const configured = !!jobs.data?.configured, rows = pos.data?.rows || [];
  const copy = async (n: string) => { await Clipboard.setStringAsync(n); setCopied(n); };
  return (
    <Screen>
      <Title>POs</Title>
      <Body tone="muted">{poListSub(everyones) as string}</Body>
      {can(state.me.access, 'purchase_orders', 'edit') && <Button icon="add-circle-outline" onPress={() => router.push('/raise-po')} disabled={!jobs.data || !configured}>Raise a PO</Button>}
      {pos.offlineAt !== null && <Notice tone="warn" icon="cloud-offline-outline">{`No signal. Showing what was saved at ${fmtTime(pos.offlineAt)}.`}</Notice>}
      <Problem>{pos.error || jobs.error}</Problem>
      {!!copied && <Notice tone="ok">{`PO ${copied} copied`}</Notice>}
      {!pos.data || !jobs.data ? (pos.error || jobs.error ? null : <Body tone="muted">Loading…</Body>)
        : rows.length === 0 ? <Empty>{poEmptyText(configured) as string}</Empty>
        : rows.map(p => (
          <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`PO ${p.po_number}, ${p.vendor_name || ''}. Copy the number`} onPress={() => { void copy(p.po_number); }}>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Body strong>{p.vendor_name}</Body>
                <Pill tone="info">{`PO ${p.po_number}`}</Pill>
              </View>
              <Body tone="muted">{when(p.created_at)}</Body>
              <Body tone="muted">{poJobLine(p) as string}</Body>
              {!!(poMeta(p, everyones) as string) && <Body tone="muted">{poMeta(p, everyones) as string}</Body>}
            </Card>
          </Pressable>
        ))}
    </Screen>
  );
}
