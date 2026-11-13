// A job on the person's published schedule, as Home shows it: its number and name, the customer and site, the address, notes, who else is on it and what plant,
// and Navigate, Call PM and Call team leaders. How it is headed and what each button does are the web app's own rules (shared/field-core.js); who to ring is the
// job's own people, never the customer, and they are asked for only when a button is pressed.
import { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { contactStep, crewLine, ringStep, schedRowTitle, showAddress } from '@shared/field-core.js';
import { useSession } from '@/lib/session';
import { useTheme } from '@/theme';
import { Body, Card, Notice, Pill, type IconName } from '@/ui';

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

  const hasNav = !!(row.site_address || row.site_lat != null || row.site_id);
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Body strong>{title.name}</Body>
          {(row.customer_name || row.site_name) && <Body tone="muted">{[row.customer_name, row.site_name].filter(Boolean).join(' · ')}</Body>}
        </View>
        <Pill tone="info">{title.tag}</Pill>
      </View>
      {showAddress(row) && <Line icon="location-outline">{row.site_address}</Line>}
      {row.crew.length > 0 && <Line icon="people-outline">With {crewLine(row.crew)}</Line>}
      {row.plant.length > 0 && <Line icon="construct-outline">{row.plant.join(', ')}</Line>}
      {!!row.notes && <Notice tone="info" icon="chatbox-ellipses-outline">{row.notes}</Notice>}
      {!row.activity && (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {hasNav && <Chip icon="navigate-outline" label="Navigate" busy={busy === 'nav'} onPress={() => { void go('nav'); }} />}
          <Chip icon="call-outline" label="Call PM" busy={busy === 'pm'} onPress={() => { void go('pm'); }} />
          <Chip icon="people-outline" label="Leaders" full="Call team leaders" busy={busy === 'leaders'} onPress={() => { void go('leaders'); }} />
        </View>
      )}
      {!!said && <Notice tone="neutral">{said}</Notice>}
      {children}
    </Card>
  );
}

// One line of a job's details, with the icon that says what it is.
function Line({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={16} color={t.dim} style={{ marginTop: 3 }} />
      <View style={{ flex: 1 }}><Body tone="muted">{children}</Body></View>
    </View>
  );
}
// One of the small buttons along the bottom of a job: an icon over a word.
function Chip({ icon, label, full, busy, onPress }: { icon: IconName; label: string; full?: string; busy: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={full || label} accessibilityState={{ busy }} disabled={busy} onPress={onPress}
      style={({ pressed }) => ({ flex: 1, minHeight: 56, borderRadius: 12, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center', gap: 3, opacity: pressed || busy ? 0.6 : 1 })}>
      {busy ? <ActivityIndicator color={t.accent2} /> : <Ionicons name={icon} size={19} color={t.accent2} />}
      <Text style={{ color: t.fg, fontSize: 12.5, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}
