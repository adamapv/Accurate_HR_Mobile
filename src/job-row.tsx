// A job on the person's published schedule, as Home shows it: its number and name, the customer and site, the address, notes, who else is on it and what plant,
// and Navigate, Call PM and Call team leaders. How it is headed and what each button does are the web app's own rules (shared/field-core.js); who to ring is the
// job's own people, never the customer, and they are asked for only when a button is pressed.
import { useState } from 'react';
import { Alert, Linking, Platform, View } from 'react-native';
import { contactStep, crewLine, ringStep, schedRowTitle, showAddress } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { Body, Button, Card } from '@/ui';

export type SchedRow = {
  work_date: string; company_id: string; job_id: string; job_name: string | null; activity: boolean; customer_name: string | null; site_name: string | null;
  site_address: string | null; site_lat: number | null; site_lng: number | null; site_id: string | null; notes: string | null; crew: string[]; plant: string[];
};
type Step = { nav?: string; ring?: string; say?: string; tone?: string; choose?: { id: string; name: string; detail: string; phone: string | null }[] };

export function JobRow({ row, children }: { row: SchedRow; children?: React.ReactNode }) {
  const { api } = useSession();
  const [info, setInfo] = useState<Record<string, unknown> | null>(null);
  const [busy, setBusy] = useState('');
  const [said, setSaid] = useState('');
  const title = schedRowTitle(row) as { tag: string; name: string };
  const details = info ? { ...row, ...info } : row;

  const act = (step: Step) => { if (step.say) setSaid(step.say); else if (step.nav || step.ring) void Linking.openURL((step.nav || step.ring)!).catch(() => setSaid('Could not open that on this phone.')); };
  const go = async (what: 'nav' | 'pm' | 'leaders') => {
    setSaid('');
    let d: Record<string, unknown> = details;
    if (what !== 'nav' || !(row.site_address || row.site_lat != null)) {
      if (!info) {
        setBusy(what);
        try { d = { ...row, ...(await api(`/jobs/${encodeURIComponent(row.company_id || '')}/${encodeURIComponent(row.job_id)}/contact`)) }; setInfo(d); }
        catch (e) { setBusy(''); return setSaid(e instanceof Error ? e.message : 'Could not find that.'); }
        setBusy('');
      }
    }
    const step = contactStep(what, d, Platform.OS === 'ios') as Step;
    if (!step.choose) return act(step);
    // Several on the job: say who they are, and ring the one chosen.
    Alert.alert('Call a team leader', 'The team leaders on this job', [...step.choose.map(l => ({ text: `${l.name} · ${l.detail}`, onPress: () => act(ringStep(l) as Step) })), { text: 'Cancel', style: 'cancel' as const }]);
  };

  return (
    <Card>
      <Body>{title.tag} {title.name}</Body>
      {(row.customer_name || row.site_name) && <Body tone="muted">{[row.customer_name, row.site_name].filter(Boolean).join(' · ')}</Body>}
      {showAddress(row) && <Body tone="muted">{row.site_address}</Body>}
      {!!row.notes && <Body>{row.notes}</Body>}
      {row.crew.length > 0 && <Body tone="muted">With {crewLine(row.crew)}</Body>}
      {row.plant.length > 0 && <Body tone="muted">Plant: {row.plant.join(', ')}</Body>}
      {!row.activity && (
        <View style={{ gap: 8 }}>
          {(row.site_address || row.site_lat != null || row.site_id) && <Button kind="plain" onPress={() => { void go('nav'); }} busy={busy === 'nav'}>Navigate</Button>}
          <Button kind="plain" onPress={() => { void go('pm'); }} busy={busy === 'pm'}>Call PM</Button>
          <Button kind="plain" onPress={() => { void go('leaders'); }} busy={busy === 'leaders'}>Call team leaders</Button>
        </View>
      )}
      {!!said && <Body tone="muted">{said}</Body>}
      {children}
    </Card>
  );
}
