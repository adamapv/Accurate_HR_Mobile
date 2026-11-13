// Report an incident, or (?damage=1) property damage. One form, laid out like the web's: the notifiable-incident question first, then what happened, when and
// where, who was involved (or what was damaged), a description, photos taken with the camera, witnesses, treatment when someone was hurt, the regulator's part
// when it is or may be notifiable, and the reporter's typed name. Every list, question, hint, check and what is sent are the web app's own rules
// (shared/whs-core.js); the regulator is the company's own (`me.company.whs`). It needs signal: a report is sent there and then.
import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { findJob } from '@shared/field-core.js';
import { filterJobs } from '@shared/pickers-core.js';
import {
  clearPerson, DAMAGE_ACTIONS, DAMAGE_CAUSES, DAMAGE_FOLLOW_UP, DAMAGE_KINDS, DAMAGE_NOTE, DAMAGE_PAY_NOTE, DESCRIBE_HINT, HOSPITAL_NOTE, INCIDENT_KINDS, incidentDraft, incidentFormStart, incidentHead,
  incidentKindHint, incidentProblem, incidentSaid, NEAR_MISS_NOTE, notifiableNow, PERSON_FIELDS, PERSON_TYPES, personHint, pickPerson, regulatorSection, SEVERITIES, SEVERITY_HINT, showsHospitalNote, showsInjury,
  showsMedical, showsTreatment, SIGN_LABEL, swapAddress, TREATMENTS, witnessFields,
} from '@shared/whs-core.js';
import { useSession } from '@/lib/session';
import { useRead } from '@/lib/use-read';
import { localNowHM, localToday, parseDay } from '@/lib/dates';
import { ChooseField, WhenField, type Option } from '@/pickers';
import { Body, Button, Field, Problem, Screen, Title } from '@/ui';
import { EmergencyCard, NotifiableQuestion, PhotoList, PickField, RowsEditor, Tick, TickList, type Photo } from '@/whs';

type Job = { id: string; company_id: string; name: string | null; customer_name?: string | null; site_name?: string | null; site_address?: string | null };
type F = Record<string, string>;
type D = Record<string, unknown> & { notifiable_check: string };
// A date and a time of day by the phone's clock, as the moment the Worker stores.
const moment = (date: string, time: string) => { const at = parseDay(date); const [h, m] = (time || '00:00').split(':').map(Number); at.setHours(h || 0, m || 0, 0, 0); return at.toISOString(); };
const Section = ({ title, hint }: { title: string; hint?: string | null }) => <View style={{ gap: 2, marginTop: 8 }}><Title>{title}</Title>{!!hint && <Body tone="muted">{hint}</Body>}</View>;

export default function ReportIncident() {
  const { state, api, changed } = useSession();
  const params = useLocalSearchParams<{ damage?: string }>();
  const damage = params.damage === '1';
  const jobs = useRead<{ rows: Job[] }>('/jobs');
  const me = state.status === 'signedIn' ? state.me : null;
  const [start] = useState(() => incidentFormStart({ damage, me: me ? me.employee : { id: '', name: '' }, occurredAt: 'now' }) as { f: F; d: D });
  const [f, setF] = useState<F>(start.f);
  const [d, setD] = useState<D>(start.d);
  const [onDate, setOnDate] = useState(localToday());
  const [atTime, setAtTime] = useState(localNowHM());
  const [toldDate, setToldDate] = useState('');
  const [toldTime, setToldTime] = useState('');
  const [witnesses, setWitnesses] = useState<Record<string, string>[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [sent, setSent] = useState(false);
  if (!me) return <Redirect href="/" />;
  const whs = me.company.whs, meId = me.employee.id;
  const head = incidentHead(true, damage) as { title: string; sub: string; submit: string };
  if (sent) return <Screen centered><Title>{incidentSaid(true) as string}</Title><Button onPress={() => router.back()}>Done</Button></Screen>;

  const set = (k: string, v: string) => setF(x => ({ ...x, [k]: v }));
  const det = (k: string, v: unknown) => setD(x => ({ ...x, [k]: v }));
  const text = (k: string) => String(d[k] ?? '');
  const list = jobs.data?.rows || [];
  const job = findJob(list, f.company_id, f.job_id) as Job | undefined;
  const jobOptions: Option<Job | null>[] = [{ key: 'none', title: 'No job', item: null }, ...list.map(j => ({ key: `${j.company_id}:${j.id}`, title: `#${j.id} ${j.name || ''}`.trim(), detail: [j.customer_name, j.site_name].filter(Boolean).join(' · '), item: j as Job | null }))];
  const searchJobs = (q: string) => { const by = new Map(jobOptions.map(o => [o.item, o])); return (filterJobs(list, q) as Job[]).map(j => by.get(j)!).filter(Boolean); };
  // Choosing the job fills in the site address (what the job has, or what its contact details say), unless something else was typed there.
  const pickJob = (j: Job | null) => {
    const prev = job?.site_address || '';
    setF(x => ({ ...x, job_id: j?.id || '', company_id: j?.company_id || '' }));
    if (!j) return;
    const swap = (addr: string) => setF(x => swapAddress(x, prev, addr) as F);
    swap(j.site_address || '');
    if (!j.site_address) api<{ site_address: string | null }>(`/jobs/${encodeURIComponent(j.company_id)}/${encodeURIComponent(j.id)}/contact`).then(r => { if (r.site_address) swap(r.site_address); }).catch(() => {});
  };
  const send = async () => {
    const filled = { ...f, occurred_at: onDate && atTime ? `${onDate}T${atTime}` : '' };
    const bad = incidentProblem({ f: filled, d, isNew: true, uploading }) as string;
    if (bad) return setProblem(bad);
    setBusy(true); setProblem('');
    try {
      await api('/whs/incidents', { method: 'POST', body: incidentDraft({ f: filled, d, witnesses, photos, isNew: true, id: undefined, occurredAt: moment(onDate, atTime), notifiedAt: toldDate ? moment(toldDate, toldTime || '00:00') : null,
        jobLabel: job ? `#${job.id} ${job.name || ''}`.trim() : null }) });
      setSent(true); changed();
    } catch (e) { setProblem(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    setBusy(false);
  };
  const itWasMe = f.employee_id === meId;
  const regulator = regulatorSection(whs) as { title: string; hint: string };

  return (
    <Screen>
      <Title>{head.title}</Title>
      <Body tone="muted">{head.sub}</Body>
      <EmergencyCard whs={whs} />
      {damage && <Body tone="muted">{DAMAGE_NOTE as string}</Body>}
      <NotifiableQuestion whs={whs} value={d.notifiable_check} onChange={v => det('notifiable_check', v)} />

      {!damage && (
        <>
          <Section title="What happened?" />
          <PickField label="Type of incident" value={f.incident_type} pairs={(INCIDENT_KINDS as string[][]).map(k => [k[0], k[1]] as [string, string])} onChange={v => set('incident_type', v)} />
          {!!f.incident_type && <Body tone="muted">{incidentKindHint(f.incident_type) as string}</Body>}
          {f.incident_type === 'near_miss' && <Body tone="muted">{NEAR_MISS_NOTE as string}</Body>}
        </>
      )}
      <PickField label="How serious?" value={f.severity} values={SEVERITIES as string[]} onChange={v => set('severity', v)} />
      <Body tone="muted">{(SEVERITY_HINT as Record<string, string>)[f.severity]}</Body>

      <Section title="When and where" />
      <WhenField label="Date" mode="date" value={onDate} maxDate={localToday()} onChange={setOnDate} />
      <WhenField label="Time" mode="time" value={atTime} onChange={setAtTime} />
      {damage && <Field label="Client name" value={text('client_name')} onChangeText={v => det('client_name', v)} maxLength={120} />}
      <ChooseField<Job | null> label="Job (optional)" placeholder={jobs.data ? 'Choose the job' : 'Loading jobs…'} value={job ? `#${job.id} ${job.name || ''}`.trim() : ''} options={jobOptions} search={searchJobs} onChoose={pickJob} />
      <Field label="Site address" value={f.location} onChangeText={v => set('location', v)} maxLength={300} />
      <Field label="Exact location on site" value={f.location_detail} onChangeText={v => set('location_detail', v)} placeholder="e.g. north trench, level 2 plant room" maxLength={300} />

      {!damage && (
        <>
          <Section title="Person involved" hint={personHint(f, true, meId) as string | null} />
          <Tick label="It was me" value={itWasMe} onChange={on => setF(x => (on ? pickPerson(x, meId, me.employee) : clearPerson(x)) as F)} />
          {!itWasMe && <Field label="Who was involved? (name)" value={f.person_name} onChangeText={v => set('person_name', v)} maxLength={120} />}
          <PickField label="They are a…" value={f.person_type} values={PERSON_TYPES as string[]} none="Not said" onChange={v => set('person_type', v)} />
          <Field label="Position" value={text('person_position')} onChangeText={v => det('person_position', v)} maxLength={120} />
          <Field label="Contact phone" value={f.person_phone} onChangeText={v => set('person_phone', v)} keyboardType="phone-pad" maxLength={40} />
          <Field label="Their manager / supervisor" value={text('supervisor_name')} onChangeText={v => det('supervisor_name', v)} maxLength={120} />
        </>
      )}

      {damage && (
        <>
          <Section title="What was damaged?" />
          <PickField label="Damage to" value={text('damage_kind')} pairs={DAMAGE_KINDS as [string, string][]} onChange={v => det('damage_kind', v)} />
          <Field label="Estimated cost ($, if known)" value={f.estimated_cost} onChangeText={v => set('estimated_cost', v.replace(/[^\d.]/g, ''))} keyboardType="decimal-pad" />
          <Field label="Item(s) damaged, and who owns them" value={text('damage_items')} onChangeText={v => det('damage_items', v)} maxLength={300} />
          <Field label="Description of the damage" value={text('damage_description')} onChangeText={v => det('damage_description', v)} multiline maxLength={2000} />
          <Tick label="A company vehicle was involved" value={!!d.vehicle_involved} onChange={v => det('vehicle_involved', v)} />
          {!!d.vehicle_involved && <Field label="Vehicle rego" value={text('vehicle_rego')} onChangeText={v => det('vehicle_rego', v)} autoCapitalize="characters" maxLength={20} />}
          {!!d.vehicle_involved && <Field label="Police report number (if any)" value={text('police_report_no')} onChangeText={v => det('police_report_no', v)} maxLength={60} />}
        </>
      )}

      <Section title={damage ? 'What happened?' : 'Describe it'} hint={DESCRIBE_HINT as string} />
      <Field label="What happened, step by step" value={f.description} onChangeText={v => set('description', v)} multiline maxLength={5000} />
      {showsInjury(f, damage) && <Field label="Nature of injury / illness" value={f.injury_nature} onChangeText={v => set('injury_nature', v)} placeholder="e.g. cut, sprain, burn, fracture" maxLength={300} />}
      {showsInjury(f, damage) && <Field label="Part of body affected" value={f.body_part} onChangeText={v => set('body_part', v)} placeholder="e.g. left hand" maxLength={200} />}
      {!damage && <Field label="Equipment, tool, vehicle or substance involved (if any)" value={text('equipment')} onChangeText={v => det('equipment', v)} maxLength={300} />}
      <Field label="Immediate action taken" value={f.immediate_action} onChangeText={v => set('immediate_action', v)} multiline maxLength={2000} />
      {damage && (
        <>
          <Body>Done straight away</Body>
          <TickList options={DAMAGE_ACTIONS as [string, string][]} value={d.immediate_actions as string[] | undefined} onChange={v => det('immediate_actions', v)} />
          <PickField label="Cause (if known)" value={text('cause')} pairs={DAMAGE_CAUSES as [string, string][]} none="Not sure" onChange={v => det('cause', v)} />
          {d.cause === 'other' && <Field label="Other cause" value={text('cause_other')} onChangeText={v => det('cause_other', v)} maxLength={300} />}
        </>
      )}

      <Section title="Photos" />
      <PhotoList photos={photos} onChange={setPhotos} onBusy={setUploading} />

      {damage && (
        <>
          <Section title="People involved" />
          <RowsEditor rows={(d.persons as Record<string, string>[]) || []} onChange={v => det('persons', v)} fields={PERSON_FIELDS as { key: string; label: string }[]} addLabel="Add a person" />
        </>
      )}
      <Section title="Witnesses" />
      <RowsEditor rows={witnesses} onChange={setWitnesses} fields={witnessFields(damage) as { key: string; label: string }[]} addLabel="Add a witness" />

      {showsTreatment(f, damage, true) && (
        <>
          <Section title="Treatment and follow-up" />
          <Tick label="Reported to a supervisor" value={!!d.reported_to_supervisor} onChange={v => det('reported_to_supervisor', v)} />
          {!!d.reported_to_supervisor && <Field label="Who, and when?" value={text('reported_to_supervisor_when')} onChangeText={v => det('reported_to_supervisor_when', v)} maxLength={200} />}
          <PickField label="Treatment" value={f.treatment} pairs={TREATMENTS as [string, string][]} none="Not said" onChange={v => set('treatment', v)} />
          <Field label="First aid given by" value={text('first_aid_by')} onChangeText={v => det('first_aid_by', v)} maxLength={120} />
          {showsMedical(f) && <Field label="Medical treatment details" value={text('medical_details')} onChangeText={v => det('medical_details', v)} maxLength={300} />}
          {showsHospitalNote(f, d) && <Body tone="danger">{HOSPITAL_NOTE as string}</Body>}
        </>
      )}

      {notifiableNow(d) && (
        <>
          <Section title={regulator.title} hint={regulator.hint} />
          <WhenField label="Regulator notified on" mode="date" value={toldDate} maxDate={localToday()} onChange={setToldDate} placeholder="Not yet" />
          {!!toldDate && <WhenField label="At" mode="time" value={toldTime} onChange={setToldTime} placeholder="Time" />}
          <Field label="Regulator reference number" value={f.worksafe_reference} onChangeText={v => set('worksafe_reference', v)} maxLength={80} />
        </>
      )}

      {damage && (
        <>
          <Section title="Follow-up" hint={DAMAGE_PAY_NOTE as string} />
          <TickList options={DAMAGE_FOLLOW_UP as [string, string][]} value={d.follow_up as string[] | undefined} onChange={v => det('follow_up', v)} />
          {((d.follow_up as string[]) || []).includes('insurance') && <Field label="Insurance claim number" value={text('insurance_claim_no')} onChangeText={v => det('insurance_claim_no', v)} maxLength={80} />}
        </>
      )}

      <Section title="Your details" />
      <Field label="Your position" value={text('reporter_position')} onChangeText={v => det('reporter_position', v)} maxLength={120} />
      {damage
        ? <Field label="Your phone / email" value={text('reporter_contact')} onChangeText={v => det('reporter_contact', v)} maxLength={120} />
        : <PickField label="Did you see it happen?" value={d.reporter_witnessed == null ? '' : d.reporter_witnessed ? 'yes' : 'no'} pairs={[['yes', 'Yes'], ['no', 'No']]} none="Not said" onChange={v => det('reporter_witnessed', v === '' ? undefined : v === 'yes')} />}
      <Field label={SIGN_LABEL as string} value={text('reporter_signature')} onChangeText={v => det('reporter_signature', v)} autoCapitalize="words" autoComplete="name" maxLength={120} />

      <Problem>{problem || jobs.error}</Problem>
      <Button onPress={() => { void send(); }} busy={busy} disabled={uploading}>{head.submit}</Button>
      <Button kind="plain" onPress={() => router.back()} disabled={busy}>Cancel</Button>
    </Screen>
  );
}
