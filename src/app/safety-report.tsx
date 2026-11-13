// One safety report, read back (?kind=incident|hazard&id=): an incident as its labelled sections, a hazard as what was seen and its controls, each with its
// photos. A notifiable incident the regulator has not yet been told about shows what to do. How it reads is the web app's own rule (shared/whs-core.js), with
// the company's own regulator. Changing a report after it is sent is the office's to do.
import { Image, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { enumLabel, incidentLabel, incidentSections, photoPath, REPORT_GONE, reportSub } from '@shared/whs-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { API_URL } from '@/lib/config';
import { fmtDateTime } from '@/lib/dates';
import { fmtMoney } from '@/lib/money';
import type { Hazard, Incident } from '@/app/safety-reports';
import { Body, Button, Card, Loading, Problem, Screen, Title } from '@/ui';
import { NotifiableSteps } from '@/whs';

type Section = { title: string; text?: string; list?: string[]; rows: [string, string][] };

export default function SafetyReport() {
  const { state, sessionId } = useSession();
  const { kind, id } = useLocalSearchParams<{ kind: string; id: string }>();
  const hazard = kind === 'hazard';
  const got = useRead<{ incident?: Incident; hazard?: Hazard }>(id ? `/whs/${hazard ? 'hazards' : 'incidents'}/${id}` : null);
  if (state.status !== 'signedIn' || !id) return <Redirect href="/" />;
  if (!got.data) return got.error ? <Screen centered><Problem>{REPORT_GONE as string}</Problem><Button kind="plain" onPress={() => router.back()}>Back</Button></Screen> : <Loading />;
  const item = hazard ? got.data.hazard : got.data.incident;
  if (!item) return <Redirect href="/safety-reports" />;
  const whs = state.me.company.whs;
  const photo = (n: number) => ({ uri: `${API_URL.replace(/\/+$/, '')}/api/hr${photoPath(hazard ? 'hazard' : 'incident', id, n) as string}`, headers: sessionId() ? { Authorization: `Bearer ${sessionId()}` } : undefined });
  const inc = hazard ? null : item as Incident, hz = hazard ? item as Hazard : null;
  const sections = inc ? incidentSections(inc, whs, { fmtDateTime, fmtMoney }) as Section[] : [];
  return (
    <Screen>
      <Title>{hz ? hz.title : incidentLabel(inc!.incident_type) as string}</Title>
      <Body tone="muted">{reportSub(hazard ? 'hazard' : 'incident', item, fmtDateTime) as string}</Body>
      <Body tone={inc?.notifiable_to_regulator || ['extreme', 'high'].includes(hz?.risk_band || '') ? 'danger' : 'muted'}>
        {[hz ? `${enumLabel(hz.risk_band) as string} risk` : enumLabel(inc!.severity) as string, enumLabel(item.status) as string, inc?.notifiable_to_regulator ? 'Notifiable' : ''].filter(Boolean).join(' · ')}
      </Body>
      {!!inc?.notifiable_to_regulator && !inc.notified_at && <NotifiableSteps whs={whs} />}
      {!!hz?.description && <Body>{hz.description}</Body>}
      {!!hz?.control_measures && <Card><Body tone="muted">Control measures</Body><Body>{hz.control_measures}</Body></Card>}
      {sections.map(s => (
        <Card key={s.title}>
          <Body tone="muted">{s.title}</Body>
          {!!s.text && <Body>{s.text}</Body>}
          {(s.list || []).map((l, n) => <Body key={n}>{l}</Body>)}
          {s.rows.map(([k, v]) => (
            <View key={k} style={{ gap: 0 }}>
              <Body tone="muted">{k}</Body>
              <Body>{v}</Body>
            </View>
          ))}
        </Card>
      ))}
      {(item.photos || []).map((_, n) => <Image key={n} source={photo(n)} style={{ width: '100%', height: 220, borderRadius: 8 }} resizeMode="cover" accessibilityLabel={`Photo ${n + 1}`} />)}
      <Button kind="plain" onPress={() => router.back()}>Close</Button>
    </Screen>
  );
}
