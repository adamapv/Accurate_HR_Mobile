// Safety reports: the emergency numbers, the three things to report (an incident, property damage, a hazard), the person's own reports (the ones they made and the
// incidents they were involved in), and the hazards everyone can see. A tap opens one. What each row says is the web app's own rule (shared/whs-core.js).
import { Pressable, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { can } from '@shared/access.js';
import { hazardRow, incidentRow, isOpen, MY_REPORTS_NOTE, NO_HAZARDS, NO_INCIDENTS } from '@shared/whs-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtDateTime } from '@/lib/dates';
import { Body, Button, Card, Empty, Heading, Pill, Problem, Screen, Title } from '@/ui';
import { EmergencyCard } from '@/whs';

export type Incident = { id: string; incident_type: string; severity: string; status: string; occurred_at: string; location: string | null; job_label: string | null; employee_name: string | null; person_name: string | null;
  notifiable_to_regulator: number; notified_at: string | null; photos: string[]; reported_by_name: string | null };
export type Hazard = { id: string; title: string; description: string | null; category: string; location: string | null; job_label: string | null; risk_band: string; status: string; control_measures: string | null; photos: string[]; reported_by_name: string | null };

export default function SafetyReports() {
  const { state } = useSession();
  const incidents = useRead<{ rows: Incident[] }>('/whs/incidents');
  const hazards = useRead<{ rows: Hazard[] }>('/whs/hazards');
  if (state.status !== 'signedIn' || !can(state.me.access, 'whs')) return <Redirect href="/" />;
  const mine = incidents.data?.rows, seen = hazards.data?.rows;
  return (
    <Screen>
      <Title>Safety reports</Title>
      <EmergencyCard whs={state.me.company.whs} />
      <Button icon="medkit-outline" onPress={() => router.push('/report-incident')}>Report incident</Button>
      <Button kind="plain" icon="hammer-outline" onPress={() => router.push('/report-incident?damage=1')}>Property damage</Button>
      <Button kind="plain" icon="warning-outline" onPress={() => router.push('/report-hazard')}>Report hazard</Button>
      <Problem>{incidents.error || hazards.error}</Problem>

      <Heading right={mine && mine.filter(x => isOpen(x)).length > 0 ? <Pill tone="warn">{`${mine.filter(x => isOpen(x)).length} open`}</Pill> : undefined}>My reports</Heading>
      <Body tone="muted">{MY_REPORTS_NOTE as string}</Body>
      {!mine ? (incidents.error ? null : <Body tone="muted">Loading…</Body>) : mine.length === 0 ? <Empty>{NO_INCIDENTS as string}</Empty> : mine.map(x => {
        const row = incidentRow(x, fmtDateTime) as { title: string; meta: string; severity: string; status: string; notifiable: boolean };
        return (
          <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={`${row.title}, ${row.meta}. Open`} onPress={() => router.push(`/safety-report?kind=incident&id=${encodeURIComponent(x.id)}`)}>
            <Card>
              <Body strong>{row.title}</Body>
              <Body tone="muted">{row.meta}</Body>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <Pill tone={['serious', 'critical'].includes(x.severity) ? 'danger' : x.severity === 'moderate' ? 'warn' : 'neutral'}>{row.severity}</Pill>
                <Pill tone={isOpen(x) ? 'warn' : 'ok'}>{row.status}</Pill>
                {row.notifiable && <Pill tone="danger">Notifiable</Pill>}
              </View>
            </Card>
          </Pressable>
        );
      })}

      <Heading right={seen && seen.filter(x => isOpen(x)).length > 0 ? <Pill tone="warn">{`${seen.filter(x => isOpen(x)).length} open`}</Pill> : undefined}>Hazards</Heading>
      {!seen ? (hazards.error ? null : <Body tone="muted">Loading…</Body>) : seen.length === 0 ? <Empty>{NO_HAZARDS as string}</Empty> : seen.map(x => {
        const row = hazardRow(x) as { title: string; meta: string; risk: string; status: string };
        return (
          <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={`${row.title}, ${row.risk}. Open`} onPress={() => router.push(`/safety-report?kind=hazard&id=${encodeURIComponent(x.id)}`)}>
            <Card>
              <Body strong>{row.title}</Body>
              <Body tone="muted">{row.meta}</Body>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                <Pill tone={['extreme', 'high'].includes(x.risk_band) ? 'danger' : x.risk_band === 'medium' ? 'warn' : 'ok'}>{row.risk}</Pill>
                <Pill tone={isOpen(x) ? 'warn' : 'ok'}>{row.status}</Pill>
              </View>
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}
