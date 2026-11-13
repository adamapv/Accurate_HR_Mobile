// Safety reports: the emergency numbers, the three things to report (an incident, property damage, a hazard), the person's own reports (the ones they made and the
// incidents they were involved in), and the hazards everyone can see. A tap opens one. What each row says is the web app's own rule (shared/whs-core.js).
import { Pressable } from 'react-native';
import { Redirect, router } from 'expo-router';
import { can } from '@shared/access.js';
import { hazardRow, incidentRow, isOpen, MY_REPORTS_NOTE, NO_HAZARDS, NO_INCIDENTS } from '@shared/whs-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { fmtDateTime } from '@/lib/dates';
import { Body, Button, Card, Problem, Screen, Title } from '@/ui';
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
      <Button onPress={() => router.push('/report-incident')}>Report incident</Button>
      <Button kind="plain" onPress={() => router.push('/report-incident?damage=1')}>Property damage</Button>
      <Button kind="plain" onPress={() => router.push('/report-hazard')}>Report hazard</Button>
      <Problem>{incidents.error || hazards.error}</Problem>

      <Body>My reports{mine ? ` · ${mine.filter(x => isOpen(x)).length} open` : ''}</Body>
      <Body tone="muted">{MY_REPORTS_NOTE as string}</Body>
      {!mine ? (incidents.error ? null : <Body tone="muted">Loading…</Body>) : mine.length === 0 ? <Body tone="muted">{NO_INCIDENTS as string}</Body> : mine.map(x => {
        const row = incidentRow(x, fmtDateTime) as { title: string; meta: string; severity: string; status: string; notifiable: boolean };
        return (
          <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={`${row.title}, ${row.meta}. Open`} onPress={() => router.push(`/safety-report?kind=incident&id=${encodeURIComponent(x.id)}`)}>
            <Card>
              <Body>{row.title}</Body>
              <Body tone="muted">{row.meta}</Body>
              <Body tone={row.notifiable ? 'danger' : 'muted'}>{[row.severity, row.status, row.notifiable && 'Notifiable'].filter(Boolean).join(' · ')}</Body>
            </Card>
          </Pressable>
        );
      })}

      <Body>Hazards{seen ? ` · ${seen.filter(x => isOpen(x)).length} open` : ''}</Body>
      {!seen ? (hazards.error ? null : <Body tone="muted">Loading…</Body>) : seen.length === 0 ? <Body tone="muted">{NO_HAZARDS as string}</Body> : seen.map(x => {
        const row = hazardRow(x) as { title: string; meta: string; risk: string; status: string };
        return (
          <Pressable key={x.id} accessibilityRole="button" accessibilityLabel={`${row.title}, ${row.risk}. Open`} onPress={() => router.push(`/safety-report?kind=hazard&id=${encodeURIComponent(x.id)}`)}>
            <Card>
              <Body>{row.title}</Body>
              <Body tone="muted">{row.meta}</Body>
              <Body tone={['extreme', 'high'].includes(x.risk_band) ? 'danger' : 'muted'}>{row.risk} · {row.status}</Body>
            </Card>
          </Pressable>
        );
      })}
      <Button kind="plain" onPress={() => router.back()}>Back</Button>
    </Screen>
  );
}
