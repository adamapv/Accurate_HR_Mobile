// Reading a safe work method statement and signing on to it, on a job. The statement is laid out by the web app's own rule (shared/swms.js readModel) and comes from
// the copy kept on the phone when there is no signal; the sign-on goes through the outbox with the phone's own time, so it works with none.
import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { signOnDraft, signOnEntry } from '@shared/job-checks.js';
import { ratingName, RATING_TONE, readModel, SIGN_ON_STATEMENT } from '@shared/swms.js';
import { isRichText } from '@shared/rich-text.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { useOutbox } from '@/lib/use-outbox';
import type { Draft } from '@/lib/offline-core';
import { fmtDate } from '@/lib/dates';
import { RichText } from '@/rich';
import type { ForJobs } from '@/safety';
import { Body, Button, Card, Field, Heading, Loading, Notice, Pill, Problem, Screen, Title } from '@/ui';

type Version = { content: Record<string, unknown>; change_note?: string | null };
type Model = { title: string; sub: string; job: [string, string][]; hazardous: string[]; hrcw: string[]; ppe: string[]; supervision: string[]; plant: string[]; overall: string | null; references: unknown;
  tasks: { id: string | number; name: string; hazards: { hazard: unknown; before: string; after: string; controls: unknown; responsible: string }[] }[]; management: { key: string; label: string; value: unknown }[] };
const TONE: Record<string, 'ok' | 'muted' | 'danger' | 'fg'> = { ok: 'ok', info: 'muted', warn: 'fg', danger: 'danger' };

function Rating({ label, code }: { label: string; code: string }) {
  if (!code) return null;
  const tone = (RATING_TONE as Record<string, string>)[code];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <Body tone="muted">{label}</Body>
      <Pill tone={tone === 'danger' ? 'danger' : tone === 'warn' ? 'warn' : tone === 'ok' ? 'ok' : 'neutral'}>{ratingName(code)}</Pill>
    </View>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <Card><Heading>{title}</Heading><View style={{ height: 4 }} />{children}</Card>;
}
const List = ({ items }: { items: string[] }) => <View style={{ gap: 4 }}>{items.map((t, i) => <Body key={i}>• {t}</Body>)}</View>;

export default function SwmsScreen() {
  const { state, offline, changed } = useSession();
  const p = useLocalSearchParams<{ company: string; job: string; label: string; id: string; keys: string }>();
  const forJobs = useRead<ForJobs>(p.keys ? `/job-safety/for-jobs?jobs=${p.keys}` : null);
  const queued = useOutbox();
  const job = { company_id: p.company, job_id: p.job, label: p.label };
  const swms = forJobs.data?.jobs?.[`${p.company}:${p.job}`]?.find(x => x.id === p.id) || null;
  const version = useRead<Version>(swms ? `/job-safety/swms/${swms.id}/versions/${swms.version}` : null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  if (state.status !== 'signedIn') return <Redirect href="/" />;
  if (!forJobs.data) return forJobs.error ? <Screen centered><Problem>{forJobs.error}</Problem><Button kind="plain" onPress={() => router.back()}>Back</Button></Screen> : <Loading />;
  if (!swms) return <Redirect href="/" />;   // it came off the job

  const waiting = swms.signed ? null : (signOnEntry(queued, job, swms) as { status: string } | undefined);
  const done = swms.signed || !!waiting;
  const m = version.data ? (readModel(version.data.content, swms.details, fmtDate) as Model) : null;
  const sign = async () => {
    setBusy(true); setProblem('');
    try {
      await offline.submit(signOnDraft({ job, swms, signature_name: name, signedAt: new Date().toISOString() }) as Draft);
      await forJobs.reload();
      changed();
      router.back();
    } catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); setBusy(false); }
  };

  return (
    <Screen>
      <Title>{swms.title}</Title>
      <Body tone="muted">{p.label} · version {swms.version}</Body>
      {!!version.data?.change_note && <Notice tone="info">{`What changed in version ${swms.version}: ${version.data.change_note}`}</Notice>}
      {!m ? (version.error ? <Problem>{version.error}</Problem> : <Body tone="muted">Loading the statement…</Body>) : (
        <>
          <Body tone="muted">{m.sub}</Body>
          {m.job.length > 0 && <Section title="This job">{m.job.map(([k, v]) => <View key={k}><Body tone="muted">{k}</Body><Body>{v}</Body></View>)}</Section>}
          {m.hazardous.length > 0 && <Section title="Hazardous work and environmental impacts"><List items={m.hazardous} /></Section>}
          {m.hrcw.length > 0 && <Section title="High-risk construction work"><List items={m.hrcw} /></Section>}
          {m.ppe.length > 0 && <Section title="Protective equipment"><List items={m.ppe} /></Section>}
          {m.tasks.length > 0 && <Heading>Job tasks, hazards and controls</Heading>}
          {m.tasks.map((t, i) => (
            <Card key={t.id}>
              <Body strong>{i + 1}. {t.name}</Body>
              {t.hazards.map((x, j) => (
                <View key={j} style={{ gap: 4, marginTop: 6 }}>
                  {isRichText(x.hazard) ? <RichText value={x.hazard} /> : <Body>{String(x.hazard ?? '')}</Body>}
                  <Rating label="Before controls" code={x.before} />
                  <Rating label="After" code={x.after} />
                  {x.controls != null && <RichText value={x.controls} kind="bullets" />}
                  {!!x.responsible && <Body tone="muted">Responsible: {x.responsible}</Body>}
                </View>
              ))}
            </Card>
          ))}
          {!!m.overall && <Card><Rating label="Overall risk after controls" code={m.overall} /></Card>}
          {m.management.map(g => <Section key={g.key} title={g.label}><RichText value={g.value} kind="bullets" /></Section>)}
          {m.plant.length > 0 && <Section title="Plant and equipment"><List items={m.plant} /></Section>}
          {m.supervision.length > 0 && <Section title="Supervisory arrangements"><List items={m.supervision} /></Section>}
          {m.references != null && <Section title="Legislation, regulations and codes of practice"><RichText value={m.references} /></Section>}
        </>
      )}

      {swms.signed || waiting?.status === 'sent' ? <Notice tone="ok">You have signed on to this version.</Notice>
        : waiting ? <Notice tone="info" icon="cloud-upload-outline">Your sign-on is saved on this phone. It is sent when you have signal.</Notice>
        : (
          <>
            <Body>{SIGN_ON_STATEMENT}</Body>
            <Field label="Type your full name to sign on" value={name} onChangeText={setName} maxLength={120} autoComplete="name" autoCapitalize="words" />
            <Problem>{problem}</Problem>
            <Button icon="create-outline" onPress={sign} busy={busy} disabled={name.trim().length < 2 || !version.data}>Sign on</Button>
          </>
        )}
      <Button kind="plain" onPress={() => router.back()} disabled={busy}>{done ? 'Close' : 'Cancel'}</Button>
    </Screen>
  );
}
