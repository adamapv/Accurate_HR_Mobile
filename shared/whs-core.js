// Safety reports' own rules: reporting an incident, property damage or a hazard, and reading a report back. The web app (public/app.js) and the phone app (its own
// repo, Accurate_HR_Mobile, which copies this file) both use this one module, so what a report asks, what stands in the way of sending it and what is sent are the
// same on both. Logic only: nothing here reads the page, storage or the clock. The regulator's name and number are never written here: they are the company's own
// (`whsOf` in public/locale.js, sent as the company's `whs`), passed in as `w`.

const sentenceCase = s => s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).replace(/_/g, ' ') : '';

// ---- the lists a report chooses from ----
export const HAZARD_CATEGORIES = ['manual_handling', 'electrical', 'gas', 'chemical', 'asbestos', 'working_at_height', 'excavation_trenching', 'confined_space',
  'hot_work', 'plant_equipment', 'vehicles_traffic', 'slips_trips_falls', 'noise_dust', 'psychosocial', 'other'];
// [value, label, what it means]
export const INCIDENT_KINDS = [
  ['injury', 'Injury', 'Someone was hurt.'],
  ['illness', 'Illness', 'A work-related illness or exposure — fumes, dust, heat, a substance.'],
  ['near_miss', 'Near miss', 'Nobody was hurt, but someone could have been.'],
  ['occupational_violence', 'Violence or aggression', 'Someone was abused, threatened or assaulted — including by a client or member of the public.'],
  ['dangerous_occurrence', 'Dangerous occurrence', 'Trench or structure collapse, uncontrolled gas escape, electric shock, fall of plant or materials. Usually notifiable.'],
  ['environmental', 'Environmental', 'A spill, contamination or discharge.'],
  ['other', 'Other', 'Anything else that affected health or safety.'],
];
export const INCIDENT_TYPES = [...INCIDENT_KINDS.map(k => k[0]), 'property_damage'];
const INCIDENT_TYPE_LABEL = { ...Object.fromEntries(INCIDENT_KINDS.map(k => [k[0], k[1]])), property_damage: 'Property damage' };
export const incidentLabel = t => INCIDENT_TYPE_LABEL[t] || sentenceCase(t);
export const incidentKindHint = t => (INCIDENT_KINDS.find(k => k[0] === t) || [])[2];
// Types where someone was (or may have been) hurt, so the injury and treatment questions apply.
export const HURT_TYPES = new Set(['injury', 'illness', 'occupational_violence']);
export const SEVERITIES = ['minor', 'moderate', 'serious', 'critical'];
export const SEVERITY_HINT = { minor: 'no injury or first aid only; minor damage', moderate: 'medical treatment or some time off; repairable damage',
  serious: 'hospital or lost time; significant damage', critical: 'life-threatening or fatal; major damage' };
export const PERSON_TYPES = ['employee', 'apprentice', 'contractor', 'visitor', 'client', 'member_of_public'];
export const TREATMENTS = [['none', 'No treatment'], ['first_aid', 'First aid only'], ['gp', 'GP / medical centre'], ['hospital', 'Hospital']];
export const RETURN_TO_WORK = [['yes', 'Yes – normal duties'], ['suitable_duties', 'Yes – suitable duties'], ['no', 'Not yet']];
export const DAMAGE_KINDS = [['client_property', 'Client property'], ['company_vehicle', 'Company vehicle'], ['company_equipment', 'Company tools or equipment'], ['third_party', 'Third-party property'], ['other', 'Other']];
export const DAMAGE_ACTIONS = [['area_safe', 'Area made safe / secured'], ['supervisor_notified', 'Supervisor notified'], ['client_notified', 'Client notified'], ['temporary_repairs', 'Temporary repairs'], ['services_isolated', 'Water / gas / power isolated']];
export const DAMAGE_CAUSES = [['human_error', 'Human error'], ['equipment_failure', 'Equipment / tool failure'], ['existing_condition', 'Existing condition of property'], ['environmental', 'Environmental factors'], ['other', 'Other']];
export const DAMAGE_FOLLOW_UP = [['repair', 'Repair / replacement'], ['investigation', 'Further investigation'], ['insurance', 'Insurance claim'], ['procedure_review', 'Procedure / SWMS review'], ['training', 'Training']];
export const NOTIFIABLE_CHECK = [['no', 'No'], ['unsure', 'Not sure'], ['yes', 'Yes']];
export const WITNESS_FIELDS = [{ key: 'name', label: 'Name' }, { key: 'phone', label: 'Phone', type: 'tel' }, { key: 'company', label: 'Company' }, { key: 'statement', label: 'What they saw (optional)', wide: true }];
export const PERSON_FIELDS = [{ key: 'name', label: 'Name' }, { key: 'role', label: 'Role (employee, contractor, client…)' }, { key: 'company', label: 'Company' }, { key: 'phone', label: 'Phone', type: 'tel' }];
export const witnessFields = damage => damage ? WITNESS_FIELDS.filter(x => x.key !== 'company') : WITNESS_FIELDS;
export const WHS_MAX_PHOTOS = 10;   // the same limit as the Worker
export const MAX_ROWS = 12;         // witnesses, or people involved
export const LIKELIHOOD = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'];
export const CONSEQUENCE = ['Insignificant', 'Minor', 'Moderate', 'Major', 'Catastrophic'];
export const RISK_BANDS = ['extreme', 'high', 'medium', 'low'];
// The same 5×5 matrix as the Worker's.
export const riskBand = (l, c) => { const s = (Number(l) || 0) * (Number(c) || 0); return s >= 16 ? 'extreme' : s >= 10 ? 'high' : s >= 5 ? 'medium' : 'low'; };
export const scaleLabel = (list, n) => `${n} — ${list[n - 1]}`;
export const labelFrom = (list, v) => (list.find(x => x[0] === v) || [])[1] || (v ? sentenceCase(v) : '');
export const enumLabel = v => sentenceCase(v);

// ---- emergency numbers and a notifiable incident ----
// Wording that has a phone number in it is given as parts, so each screen can make the number something to tap: a part is { text } or { phone, tel }.
const numberParts = w => w.tel ? [{ text: ' on ' }, { phone: w.phone, tel: w.tel }] : [];
// The numbers on every safety screen: 000, the regulator for a notifiable incident, and the company's own support line when it has one.
export function emergencyLines(w) {
  return [
    { key: 'emergency', label: 'Emergency: ', phone: '000', tel: 'tel:000', danger: true },
    { key: 'regulator', label: `Notifiable incident: ${w.regulator} `, phone: w.tel ? w.phone : null, tel: w.tel, missing: '(set the number under Company details)' },
    w.eap && { key: 'eap', label: 'Support (EAP, 24/7): ', phone: w.eap, tel: `tel:${String(w.eap).replace(/[^0-9+]/g, '')}`, muted: true },
  ].filter(Boolean);
}
export const NOTIFIABLE_QUESTION = 'Is this a notifiable incident?';
export const NOTIFIABLE_MEANS = 'A death; a serious injury or illness — needing treatment as a hospital in-patient, or immediate treatment for an amputation, '
  + 'serious head or eye injury, serious burn, degloving, spinal injury, loss of a bodily function or serious cut; or a dangerous occurrence such as a trench or '
  + 'structure collapse, uncontrolled gas escape, electric shock, or fall of plant or materials.';
// What to do about a notifiable incident, in order.
export function notifiableSteps(w) {
  return {
    title: 'Notifiable incident — act now',
    steps: [
      [{ text: `Call ${w.regulator} immediately` }, ...numberParts(w), { text: '.' }],
      [{ text: 'Don’t disturb the site — except to help an injured person or make it safe.' }],
      [{ text: 'Tell the Director straight away.' }],
      [{ text: `${w.written} The office will look after it.` }],
    ],
    call: w.tel ? { label: `Call ${w.regulator} ${w.phone}`, tel: w.tel } : null,
  };
}
// What a person who is not sure is told.
export const notifiableUnsure = w => [{ text: `Treat it as notifiable until you know otherwise: don’t disturb the site, and call the Director now. If you can’t reach them, call ${w.regulator}` },
  ...numberParts(w), { text: ' for advice.' }];
export const notifiableNow = d => d.notifiable_check === 'yes' || d.notifiable_check === 'unsure';
export const regulatorSection = w => ({ title: `${w.regulator} notification`, hint: `Call ${w.phone || 'them'} straight away; ${w.written.charAt(0).toLowerCase()}${w.written.slice(1)}` });

// ---- reporting an incident or property damage ----
// The report as its form opens. `me` is the person reporting ({ id, name, employment_type }); `occurredAt` and `notifiedAt` are the incident's own times the way
// the caller's date-and-time box takes them (a new report's is now). A new incident report starts with the person reporting it as the one involved, which is
// usually true.
export function incidentFormStart({ incident = {}, damage, me, occurredAt, notifiedAt = '' }) {
  const isNew = !incident.id;
  return {
    f: {
      incident_type: incident.incident_type || (damage ? 'property_damage' : ''), severity: incident.severity || 'minor',
      occurred_at: occurredAt, job_id: incident.job_id || '', company_id: incident.company_id || '',
      location: incident.location || '', location_detail: incident.location_detail || '',
      ...(isNew && !damage ? { employee_id: me.id, person_name: me.name, person_type: me.employment_type === 'apprentice' ? 'apprentice' : 'employee' }
        : { employee_id: incident.employee_id || '', person_name: incident.person_name || '', person_type: incident.person_type || '' }),
      person_phone: incident.person_phone || '',
      description: incident.description || '', immediate_action: incident.immediate_action || '',
      injury_nature: incident.injury_nature || '', body_part: incident.body_part || '', treatment: incident.treatment || '',
      estimated_cost: incident.estimated_cost_cents != null ? String(incident.estimated_cost_cents / 100) : '',
      lost_time_days: incident.lost_time_days ?? '', notified_at: notifiedAt, worksafe_reference: incident.worksafe_reference || '',
      status: incident.status || 'open', investigated_by: incident.investigated_by || '', root_cause: incident.root_cause || '', controls: incident.controls || '',
    },
    d: { notifiable_check: incident.notifiable_to_regulator ? 'yes' : '', ...(incident.details || {}) },
    witnesses: incident.witnesses || [],
    photos: (incident.photos || []).map((key, idx) => ({ key, idx })),
  };
}
// Whether a report is property damage: a new one is what it was opened as, an old one is what it says.
export const isDamage = (incident, newDamage) => !incident?.id ? !!newDamage : incident.incident_type === 'property_damage';
// Naming the person involved: someone from the list (`p`, or none for someone not listed), keeping a kind already chosen.
export const pickPerson = (f, id, p) => ({ ...f, employee_id: id, person_name: p ? p.name : '', person_type: p ? (f.person_type || (p.employment_type === 'apprentice' ? 'apprentice' : 'employee')) : f.person_type });
export const clearPerson = f => ({ ...f, employee_id: '', person_name: '' });
// Choosing a job puts its site address in a new report, unless something else was typed there: the last job's address goes with it, what was typed stays.
export const swapAddress = (f, prev, addr) => (!String(f.location || '').trim() || (prev && f.location === prev) ? { ...f, location: addr } : f);
// What the form headings and hints say.
export const incidentHead = (isNew, damage) => ({
  title: isNew ? (damage ? 'Report property damage' : 'Report an incident') : `Update ${damage ? 'property damage report' : 'incident report'}`,
  sub: isNew ? 'Fill in what you can now — the office can add the rest later.' : null,
  submit: isNew ? 'Send report' : 'Save' });
export const DAMAGE_NOTE = 'If anyone was hurt, also report it as an incident. Damage involving a gas escape, structural collapse or electrical incident is a dangerous occurrence — treat it as notifiable.';
export const NEAR_MISS_NOTE = 'Spotted something that could hurt someone, but nothing happened yet? That’s a hazard — use Report a hazard instead.';
export const DESCRIBE_HINT = 'A clear, factual account: what happened, how it happened, and what led up to it.';
export const personHint = (f, isNew, meId) => isNew && f.employee_id === meId ? 'Filled in as you. Change it if it was someone else.' : f.incident_type === 'near_miss' ? 'Optional for a near miss.' : null;
export const HOSPITAL_NOTE = 'Hospital treatment as an in-patient makes this a notifiable incident — check the question at the top.';
export const DAMAGE_PAY_NOTE = 'The cost of damage is never deducted from an employee’s pay without their written agreement.';
export const photoHint = `Up to ${WHS_MAX_PHOTOS}. Photograph the scene, any damage and the equipment involved — before anything is moved, if it’s safe to.`;
export const SIGN_LABEL = 'Type your full name to confirm this report is true and correct';
// Which parts of the form apply.
export const showsInjury = (f, damage) => !damage && HURT_TYPES.has(f.incident_type);
export const showsTreatment = (f, damage, isNew) => !damage && (HURT_TYPES.has(f.incident_type) || !isNew);
export const showsMedical = f => f.treatment === 'gp' || f.treatment === 'hospital';
export const showsHospitalNote = (f, d) => f.treatment === 'hospital' && d.notifiable_check !== 'yes';
// What stands in the way of sending it ('' when nothing does). `uploading` is whether a photo is still on its way.
export function incidentProblem({ f, d, isNew, uploading }) {
  if (!f.incident_type) return 'Choose what type of incident it was';
  if (!f.occurred_at) return 'Say when it happened';
  if (!String(f.description || '').trim()) return 'Describe what happened';
  if (isNew && !String(d.reporter_signature || '').trim()) return 'Type your name at the bottom to confirm the report';
  if (uploading) return 'Wait for the photos to finish uploading';
  return '';
}
// What it is sent as. `occurredAt` and `notifiedAt` are those two times as the Worker stores them (ISO, or null for none); `jobLabel` is the chosen job in words.
// A new report leaves the investigation to the office.
export function incidentDraft({ f, d, witnesses, photos, isNew, id, occurredAt, notifiedAt, jobLabel }) {
  const body = {
    ...f, occurred_at: occurredAt, notified_at: notifiedAt || null,
    employee_id: f.employee_id || null, investigated_by: f.investigated_by || null, job_label: jobLabel ?? null,
    estimated_cost_cents: f.estimated_cost === '' ? null : Math.round(Number(f.estimated_cost) * 100),
    lost_time_days: f.lost_time_days === '' ? null : Number(f.lost_time_days),
    notifiable_to_regulator: d.notifiable_check === 'yes' ? 1 : 0,
    details: d, witnesses: (witnesses || []).filter(w => w.name || w.statement), photos: (photos || []).map(p => p.key),
  };
  delete body.estimated_cost;
  if (isNew) for (const k of ['status', 'investigated_by', 'root_cause', 'controls', 'lost_time_days']) delete body[k];
  return isNew ? body : { ...body, id };
}
export const incidentSaid = isNew => isNew ? 'Report sent — thanks for reporting it' : 'Saved';

// ---- reporting a hazard ----
export const hazardFormStart = (hazard = {}) => ({ title: hazard.title || '', description: hazard.description || '', location: hazard.location || '', category: hazard.category || 'other',
  likelihood: hazard.likelihood || 3, consequence: hazard.consequence || 3, control_measures: hazard.control_measures || '', review_date: hazard.review_date || '',
  status: hazard.status || 'open', job_id: hazard.job_id || '', company_id: hazard.company_id || '' });
export const hazardHead = isNew => ({ title: isNew ? 'Report a hazard' : 'Edit hazard',
  sub: isNew ? 'Something that could hurt someone. If someone has already been hurt, or nearly was, report an incident instead.' : null,
  submit: isNew ? 'Report' : 'Save', controls: isNew ? 'Suggested control measures (optional)' : 'Control measures' });
// A new hazard rated high or extreme goes to the office at once: the person is told so, and what to do meanwhile.
export const hazardUrgent = (form, isNew) => isNew && ['high', 'extreme'].includes(riskBand(form.likelihood, form.consequence));
export const HAZARD_URGENT_NOTE = '— the office is told straight away. Make the area safe or keep people away if you can.';
export const hazardProblem = (form, uploading) => !String(form.title || '').trim() ? 'Say what the hazard is' : uploading ? 'Wait for the photos to finish uploading' : '';
export function hazardDraft({ form, photos, isNew, id, jobLabel }) {
  const body = { ...form, job_label: jobLabel ?? null, photos: (photos || []).map(p => p.key) };
  return isNew ? body : { ...body, id };
}
export const hazardSaid = isNew => isNew ? 'Hazard reported — thanks for speaking up' : 'Saved';

// ---- reading reports back ----
export const isOpen = x => x.status !== 'closed';
export const MY_REPORTS_NOTE = 'Reports you’ve made, and incidents you were involved in.';
export const NO_INCIDENTS = 'No incidents reported.';
export const NO_HAZARDS = 'No hazards reported.';
export const REPORT_GONE = 'That report couldn’t be found — it may not be one you can see';
// A report in a list: an incident says its type, when, who and where; a hazard says what, its category and where.
export const incidentRow = (x, fmtDateTime) => ({ title: incidentLabel(x.incident_type), meta: [fmtDateTime(x.occurred_at), x.employee_name || x.person_name, x.location].filter(Boolean).join(' · '),
  severity: sentenceCase(x.severity), status: sentenceCase(x.status), notifiable: !!x.notifiable_to_regulator });
export const hazardRow = x => ({ title: x.title, meta: [sentenceCase(x.category), x.location, x.job_label].filter(Boolean).join(' · '), risk: `${sentenceCase(x.risk_band)} risk`, status: sentenceCase(x.status) });
// What is said under a report's heading when it is opened.
export const reportSub = (kind, item, fmtDateTime) => [kind === 'hazard' ? sentenceCase(item.category) : fmtDateTime(item.occurred_at), item.job_label, item.location || 'no location',
  item.reported_by_name && `reported by ${item.reported_by_name}`].filter(Boolean).join(' · ');
// An incident report as labelled sections, for the opened report and the printout: each { title, text?, list?, rows: [label, value] }, with nothing empty.
export function incidentSections(i, w, { fmtDateTime, fmtMoney }) {
  const d = i.details || {};
  const yes = v => v === true ? 'Yes' : v === false ? 'No' : '';
  const damage = i.incident_type === 'property_damage';
  const list = (opts, vals) => (vals || []).map(v => labelFrom(opts, v)).join(', ');
  return [
    { title: 'Report', rows: [['Type', incidentLabel(i.incident_type)], ['Severity', sentenceCase(i.severity)], ['Status', sentenceCase(i.status)],
      [`Notifiable to ${w.regulator}`, i.notifiable_to_regulator ? 'Yes' : d.notifiable_check === 'unsure' ? 'Reporter wasn’t sure' : d.notifiable_check === 'no' ? 'No' : ''],
      [`${w.regulator} notified`, i.notified_at ? fmtDateTime(i.notified_at) : ''], [`${w.regulator} reference`, i.worksafe_reference]] },
    { title: 'When and where', rows: [['Date and time', fmtDateTime(i.occurred_at)], ['Job', i.job_label], ['Client', d.client_name], ['Site address', i.location], ['Exact location', i.location_detail]] },
    !damage && { title: 'Person involved', rows: [['Name', i.employee_name || i.person_name], ['Type', sentenceCase(i.person_type)], ['Position', d.person_position],
      ['Phone', i.person_phone], ['Manager / supervisor', d.supervisor_name]] },
    damage && { title: 'Property damage', rows: [['Damage to', labelFrom(DAMAGE_KINDS, d.damage_kind)], ['Items damaged and owner', d.damage_items],
      ['Description of damage', d.damage_description], ['Estimated cost', i.estimated_cost_cents != null ? fmtMoney(i.estimated_cost_cents) : ''],
      ['Company vehicle', d.vehicle_involved ? [d.vehicle_rego && `Rego ${d.vehicle_rego}`, d.police_report_no && `Police report ${d.police_report_no}`].filter(Boolean).join(' · ') || 'Yes' : '']] },
    { title: 'What happened', text: i.description, rows: [['Nature of injury / illness', i.injury_nature], ['Part of body', i.body_part],
      ['Equipment, tool, vehicle or substance', d.equipment], ['Immediate action taken', i.immediate_action],
      ['Done straight away', list(DAMAGE_ACTIONS, d.immediate_actions)], ['Cause', d.cause === 'other' ? d.cause_other || 'Other' : labelFrom(DAMAGE_CAUSES, d.cause)]] },
    damage && d.persons?.length > 0 && { title: 'People involved', list: d.persons.map(p => [p.name, p.role, p.company, p.phone].filter(Boolean).join(' · ')) },
    i.witnesses?.length > 0 && { title: 'Witnesses', list: i.witnesses.map(x => [x.name, x.phone, x.company].filter(Boolean).join(' · ') + (x.statement ? ` — “${x.statement}”` : '')) },
    !damage && { title: 'Treatment and follow-up', rows: [['Reported to supervisor', d.reported_to_supervisor ? (d.reported_to_supervisor_when || 'Yes') : ''],
      ['Treatment', labelFrom(TREATMENTS, i.treatment)], ['First aid given by', d.first_aid_by], ['Medical treatment', d.medical_details],
      ['Lost time', i.lost_time_days ? `${i.lost_time_days} day${Number(i.lost_time_days) === 1 ? '' : 's'}` : ''],
      ['Returned to work', labelFrom(RETURN_TO_WORK, d.returned_to_work)], ['Workers’ compensation claim form given', yes(d.workcover_form_given)]] },
    damage && { title: 'Follow-up', rows: [['Actions', list(DAMAGE_FOLLOW_UP, d.follow_up)], ['Insurance claim no.', d.insurance_claim_no]] },
    { title: 'Reported by', rows: [['Name', i.reported_by_name], ['Position', d.reporter_position], ['Contact', d.reporter_contact],
      ['Saw it happen', yes(d.reporter_witnessed)], ['Signed', d.reporter_signature], ['Reported', i.created_at ? fmtDateTime(i.created_at) : '']] },
    { title: 'Investigation', rows: [['Investigated by', i.investigated_by_name], ['Root cause(s)', i.root_cause], ['Controls put in place', i.controls],
      ['SWMS / procedures updated', yes(d.swms_updated)], ['Closed', i.closed_at ? fmtDateTime(i.closed_at) : '']] },
  ].filter(Boolean)
    .map(s => ({ ...s, rows: (s.rows || []).filter(([, v]) => v !== '' && v != null) }))
    .filter(s => s.rows.length || s.text || s.list?.length);
}
// Where a report's photos are read from, by their position.
export const photoPath = (kind, id, n) => `/whs/${kind === 'hazard' ? 'hazards' : 'incidents'}/${id}/photos/${n}`;
