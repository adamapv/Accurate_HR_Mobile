// SWMS (Safe Work Method Statements): what a statement is made of, shared by the browser (the editor and the printed page) and the Worker
// (what it will keep and publish), so both always agree. Nothing here touches the DOM or the database.
//
// A statement is a few fixed lists (the kinds of hazardous work and environmental impact, the high-risk construction work, the protective
// equipment), five lists of management statements, a legislation note, and then the job tasks: each task has hazards, and each hazard a risk
// rating before controls, the controls, who is responsible and a rating after them. The ratings are the four on the company's own SWMS
// (1 Low, 2 Moderate, 3 High, 4 Acute) taken from a likelihood by consequence grid. The wording of the lists is what those statements carry
// today; the writer can add their own in the "other" boxes, and the legislation note is free text, so nothing here names a state or a regulator.
//
// A statement the company writes has a working copy (the draft) and numbered versions. Publishing freezes the content, with a fingerprint
// (SHA-256) of it, so what someone signs on to is exactly what was published.
//
// Rich text (28 Oct 2026): the control measures of a hazard, the five management lists and the legislation note can be written with bold, bullets (inside
// bullets too), numbers, indents, colour, links and tables, in the same editor policies and contracts use (public/rich-text.js, whose cleaner is the only thing that
// makes the markup). Each of those fields holds either what it always held (a hazard's controls a line each, a management list an array of lines, the legislation
// plain text) or a string of that cleaned markup, and every reader (the printed page, the phone's reading view) takes either. A statement written before is never
// rewritten: cleanBody gives the same text, and so the same fingerprint, for the shapes it always did. The editor turns the old shapes into bullets when it opens one
// (richBody), and what it saves from then on is markup. A hazard's name can be written the same way (28 Oct 2026, ACC-334: bold, bullets and line breaks, a short box
// of its own); everything on a job's own details stays plain.
import { sanitizeRich, isRichText, richToText, richBlocks, plainToRich, escapeHtml } from './rich-text.js';

export const RATINGS = [
  { code: '1L', name: 'Low', action: 'Record and monitor.' },
  { code: '2M', name: 'Moderate', action: 'Maintain control measures.' },
  { code: '3H', name: 'High', action: 'Review before commencing work.' },
  { code: '4A', name: 'Acute', action: 'Do not proceed.' },
];
export const RATING_CODES = RATINGS.map(r => r.code);
export const ratingName = code => { const r = RATINGS.find(x => x.code === code); return r ? `${r.code[0]} - ${r.name}` : ''; };
export const ratingRank = code => RATING_CODES.indexOf(code);

// The grid: a row for each likelihood, a column for each consequence, both from least to most.
export const LIKELIHOODS = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'];
export const CONSEQUENCES = ['Insignificant', 'Minor', 'Moderate', 'Major', 'Catastrophic'];
export const RISK_GRID = [
  ['1L', '1L', '2M', '3H', '3H'],   // Rare
  ['1L', '1L', '2M', '3H', '4A'],   // Unlikely
  ['1L', '2M', '3H', '4A', '4A'],   // Possible
  ['2M', '3H', '3H', '4A', '4A'],   // Likely
  ['3H', '3H', '4A', '4A', '4A'],   // Almost certain
];
export const riskRating = (likelihood, consequence) => RISK_GRID[likelihood]?.[consequence] || '';

// [key, label]. The keys are what is stored; the labels can be reworded without touching a saved statement.
export const HAZARDOUS_WORK = [
  ['electrical', 'Electrical equipment'], ['elevated', 'Elevated levels'], ['slips', 'Slips, trips and falls'], ['hazsub', 'Hazardous substances'],
  ['silica', 'Silica dust'], ['hot_work', 'Hot work'], ['manual', 'Hazardous manual tasks'], ['outdoor', 'Outdoor work'],
  ['remote', 'Remote or isolated work'], ['noise', 'Noise and vibration'], ['vegetation', 'Native vegetation and weeds'], ['air', 'Air quality'],
  ['waste', 'Waste'], ['vehicles', 'Vehicle movement'], ['fuels', 'Fuels, oils and chemicals'], ['fauna', 'Terrestrial fauna'],
  ['waterways', 'Waterways and soils'], ['heritage', 'Cultural heritage'],
];
export const HRCW = [
  ['confined', 'Confined spaces'], ['mobile_plant', 'Mobile plant movement'], ['demolition', 'Demolition of a load-bearing structure'], ['asbestos', 'Asbestos disturbance'],
  ['explosives', 'Using explosives'], ['diving', 'Diving work'], ['extremes', 'Artificial extremes of temperature'], ['tilt_up', 'Tilt-up or pre-cast concrete'],
  ['gas_mains', 'Pressurised gas distribution mains or piping'], ['lines', 'Chemical, fuel or refrigerant lines'], ['energised', 'Energised electrical installations or services'],
  ['structural', 'Structural alterations or repairs that need temporary support to prevent collapse'], ['falls', 'A risk of a person falling 2 metres or more'],
  ['depth', 'Work at depths greater than 1.5 metres, including tunnels or mines'], ['atmosphere', 'An area that may have a contaminated or flammable atmosphere'],
  ['traffic', 'Adjacent to a road, railway, shipping lane or traffic corridor'], ['drowning', 'In or near water or other liquid, with a risk of drowning'],
];
export const PPE = [
  ['foot', 'Foot protection'], ['hearing', 'Hearing protection'], ['hivis', 'High visibility clothing'], ['head', 'Head protection'], ['eye', 'Eye protection'],
  ['face', 'Face protection'], ['hand', 'Hand protection'], ['clothing', 'Protective clothing'], ['breathing', 'Breathing protection'], ['sun', 'Sun protection'],
  ['harness', 'Safety harness'],
];
export const PERMITS = [['hot_work', 'Hot work'], ['confined_space', 'Confined space'], ['council', 'Local council']];
export const SUPERVISION = [
  ['audits', 'Audits'], ['spot_checks', 'Spot checks'], ['reporting', 'Reporting systems'], ['qualified', 'Suitably qualified supervisors for the job'],
  ['direct', 'Direct on-site supervision'], ['remote_comms', 'Remote site: communication systems or a schedule'],
];
export const MANAGEMENT = [
  ['planning', 'Planning and preparation'], ['hold_points', 'Hold points'], ['training', 'Training and licences'], ['duties', 'Worker duties and responsibilities'],
  ['monitor', 'Monitoring and review'],
];
export const REVIEW_MONTHS = [3, 6, 12, 24, 36];

// What a worker agrees to when they sign on to a version (kept with the sign-on, so the words they agreed to are the words kept).
export const SIGN_ON_STATEMENT = 'I have read this SWMS and I understand it. I have the skills, training and any licences or certificates the work it describes needs. I agree to follow its control measures, safe work instructions and protective equipment requirements.';

// controls and responsible were 3000 and 120 until 28 Oct 2026, when the company's own sheets (a long control list, a responsible person written as a sentence)
// did not fit. A limit only cuts what is saved from now on: a statement or a published version written under the old one reads the same.
// A rich field is limited by its words, not its markup (richToText), and by the size of the markup as a safety net; one over its limit is refused where it is written
// (limitIssues), and cut to whole blocks only if it reaches cleanBody anyway. references and managementText were 2000 and (30 lines of 300) until 28 Oct 2026.
export const LIMITS = { title: 120, code: 40, description: 500, other: 300, note: 300, references: 4000, statement: 300, statements: 30, managementText: 9000, tasks: 40, taskName: 160, hazards: 20,
  hazard: 400, controls: 6000, responsible: 300, plant: 20, plantItem: 120, plantControl: 300 };
export const RICH_HTML_MAX = { controls: 30000, management: 40000, references: 20000, hazard: 4000 };
export const BODY_MAX = 900000;   // the whole body as text: far more than a real statement (the largest of the company's is 40,000), well inside what one row can hold

export const emptyBody = () => ({
  hazardous: [], hazardous_other: '', hrcw: [], hrcw_other: '', ppe: [], ppe_note: '',
  management: Object.fromEntries(MANAGEMENT.map(([k]) => [k, []])),
  references: '', tasks: [], plant: [], permits: [], supervision: [],
});

let idCount = 0;
const defaultId = prefix => `${prefix}_${Date.now().toString(36)}${(idCount++).toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const clip = (v, n) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, n);
const keep = (list, allowed) => { const ok = new Set(allowed.map(([k]) => k)); return [...new Set((Array.isArray(list) ? list : []).map(String).filter(k => ok.has(k)))]; };
// A list of statements: an array, or text with one on each line. Blank ones are dropped.
const lines = (v, maxItems, maxLen) => (Array.isArray(v) ? v : String(v ?? '').split('\n')).map(x => clip(x, maxLen).replace(/\n+/g, ' ')).filter(Boolean).slice(0, maxItems);
const rating = v => (RATING_CODES.includes(v) ? v : '');
const idOf = (v, prefix, newId) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : newId(prefix));

// ---- rich fields ----
// What sanitizeRich writes starts with a block tag, which is how a rich field is told from the plain text a field held before (isRichText).
// A rich field as it is kept: cleaned to the fixed set (a page break means nothing inside a table cell, so none is kept) and within its limits. Over them, the blocks
// that fit are kept and the rest go (never a cut through markup); a first block that is too long is kept as plain paragraphs of its first words. The same text is
// cleaned again and again while someone types (the editor works out what is missing on every change), so the last answers are remembered.
const richMemo = new Map();
function cleanRich(v, textMax, htmlMax) {
  const key = `${textMax}:${htmlMax}:${v}`;
  const seen = richMemo.get(key);
  if (seen !== undefined) return seen;
  let html = sanitizeRich(v).replace(/<hr class="pb">/g, '');
  const fits = s => richToText(s).length <= textMax && s.length <= htmlMax;
  if (!fits(html)) {
    let kept = '';
    for (const block of richBlocks(html)) { if (!fits(kept + block)) break; kept += block; }
    html = kept || plainToRich(richToText(html).slice(0, textMax));
  }
  if (richMemo.size > 1500) richMemo.clear();
  richMemo.set(key, html);
  return html;
}
// Whether a rich or plain field has nothing in it (a paragraph holding a line break is nothing).
export const richBlank = v => (isRichText(v) ? !richToText(v).trim() : !String(v ?? '').trim());
// A management list: markup if it was written with the editor, else (as ever) an array of one-line statements. An emptied rich list is an empty array.
const cleanList = v => (isRichText(v) ? cleanRich(v, LIMITS.managementText, RICH_HTML_MAX.management) || [] : lines(v, LIMITS.statements, LIMITS.statement));
const cleanHazard = v => (isRichText(v) ? cleanRich(v, LIMITS.hazard, RICH_HTML_MAX.hazard) : clip(v, LIMITS.hazard));
const cleanControls = v => (isRichText(v) ? cleanRich(v, LIMITS.controls, RICH_HTML_MAX.controls)
  : clip(v, LIMITS.controls).split('\n').map(l => l.trim()).filter(Boolean).join('\n'));

// The statement's body as it will be kept: only what the lists allow, within limits, always in the same order of keys, so the same content gives the same
// fingerprint. `newId` makes the ids of tasks and hazards that have none (a row's key on the screen, not a reference to anything).
export function cleanBody(input, newId = defaultId) {
  const b = input && typeof input === 'object' ? input : {};
  const mgmt = b.management && typeof b.management === 'object' ? b.management : {};
  return {
    hazardous: keep(b.hazardous, HAZARDOUS_WORK), hazardous_other: clip(b.hazardous_other, LIMITS.other),
    hrcw: keep(b.hrcw, HRCW), hrcw_other: clip(b.hrcw_other, LIMITS.other),
    ppe: keep(b.ppe, PPE), ppe_note: clip(b.ppe_note, LIMITS.note),
    management: Object.fromEntries(MANAGEMENT.map(([k]) => [k, cleanList(mgmt[k])])),
    references: isRichText(b.references) ? cleanRich(b.references, LIMITS.references, RICH_HTML_MAX.references) : clip(b.references, LIMITS.references),
    tasks: (Array.isArray(b.tasks) ? b.tasks : []).slice(0, LIMITS.tasks).map(t => ({
      id: idOf(t?.id, 'swt', newId), name: clip(t?.name, LIMITS.taskName),
      hazards: (Array.isArray(t?.hazards) ? t.hazards : []).slice(0, LIMITS.hazards).map(x => ({
        id: idOf(x?.id, 'swh', newId), hazard: cleanHazard(x?.hazard), before: rating(x?.before),
        controls: cleanControls(x?.controls),
        responsible: clip(x?.responsible, LIMITS.responsible), after: rating(x?.after),
      })),
    })),
    plant: (Array.isArray(b.plant) ? b.plant : []).slice(0, LIMITS.plant).map(p => ({ item: clip(p?.item, LIMITS.plantItem), control: clip(p?.control, LIMITS.plantControl) })).filter(p => p.item),
    permits: keep(b.permits, PERMITS), supervision: keep(b.supervision, SUPERVISION),
  };
}

// The details kept beside the body: a title, the company's own document number, a note for the office, and how often it is reviewed.
export function cleanMeta(input) {
  const m = input && typeof input === 'object' ? input : {};
  const months = Number(m.review_every_months);
  return { title: clip(m.title, LIMITS.title).replace(/\n+/g, ' '), code: clip(m.code, LIMITS.code).replace(/\n+/g, ' '), description: clip(m.description, LIMITS.description),
    review_every_months: REVIEW_MONTHS.includes(months) ? months : 12 };
}

// What belongs to one job rather than to the statement: who the principal contractor is, where the site is, when the statement was given to them, what is
// taken on site. Kept on the link between the statement and the job, and printed in the header and the lists of the page. Every part is optional.
export const JOB_LIMITS = { name: 120, phone: 40, address: 300, email: 254, notes: 2000, substance: 120, substances: 12 };
export const emptyJobDetails = () => ({ businessContact: '', businessPhone: '', responsiblePerson: '', principalContractor: '', principalContractorAddress: '', principalContractorPhone: '', principalContractorEmail: '',
  siteAddress: '', providedOn: '', siteNotes: '', hazardousSubstances: [], permits: [], constructionProject: null });
// An email address as it is kept: lower case, one address, or '' when it is not one.
export const cleanEmail = v => { const t = String(v ?? '').trim().toLowerCase(); return t.length <= JOB_LIMITS.email && /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(t) ? t : ''; };
const realDate = v => { const t = String(v ?? '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(t) && new Date(`${t}T00:00:00Z`).toISOString().slice(0, 10) === t ? t : ''; };
export function cleanJobDetails(input) {
  const d = input && typeof input === 'object' ? input : {};
  const one = (v, n) => clip(v, n).replace(/\n+/g, ' ');
  return {
    businessContact: one(d.businessContact, JOB_LIMITS.name), businessPhone: one(d.businessPhone, JOB_LIMITS.phone), responsiblePerson: one(d.responsiblePerson, JOB_LIMITS.name),
    principalContractor: one(d.principalContractor, JOB_LIMITS.name), principalContractorAddress: one(d.principalContractorAddress, JOB_LIMITS.address), principalContractorPhone: one(d.principalContractorPhone, JOB_LIMITS.phone), principalContractorEmail: cleanEmail(d.principalContractorEmail),
    siteAddress: one(d.siteAddress, JOB_LIMITS.address), providedOn: realDate(d.providedOn), siteNotes: clip(d.siteNotes, JOB_LIMITS.notes),
    hazardousSubstances: lines(d.hazardousSubstances, JOB_LIMITS.substances, JOB_LIMITS.substance),
    permits: keep(d.permits, PERMITS),
    constructionProject: d.constructionProject === true || d.constructionProject === 'yes' ? true : d.constructionProject === false || d.constructionProject === 'no' ? false : null,
  };
}

// ---- a job's details, and a statement's own over them (28 Oct 2026, ACC-335) ----
// The details are entered once for the job and shared by every statement on it. A statement keeps only what it changes (its "own" details): a blank, empty or unset field in them
// means "as the job's". What the statement shows, prints, sends and puts on the phone is the two merged. The date it was given to the principal contractor is the statement's
// own (each is sent on its own day), so the job never holds one.
const blankValue = v => v == null || v === '' || (Array.isArray(v) && v.length === 0);
export const cleanJobLevel = input => ({ ...cleanJobDetails(input), providedOn: '' });
export function mergeJobDetails(job, own) {
  const out = cleanJobLevel(job), o = cleanJobDetails(own);
  for (const k of Object.keys(o)) if (!blankValue(o[k])) out[k] = o[k];
  return out;
}
// What a statement's details have to keep, given the job's: the fields that are filled in and differ from it.
export function ownDetails(job, full) {
  const j = cleanJobLevel(job), f = cleanJobDetails(full), out = emptyJobDetails();
  for (const k of Object.keys(f)) if (!blankValue(f[k]) && JSON.stringify(f[k]) !== JSON.stringify(j[k])) out[k] = f[k];
  return out;
}

// What is frozen when a version is published, and fingerprinted: the details and the body together, always in the same order.
export const contentOf = (meta, body) => ({ title: meta.title, code: meta.code, review_every_months: meta.review_every_months, ...body });

// What is missing before a statement can be published: a title, at least one task, and every hazard with its words and both ratings. A hazard still rated
// Acute after its controls cannot go ahead as written, and controls cannot leave a hazard rated worse than it started.
// Every one of them with where it is, so the editor can take the person to it: `task` and `hazard` are positions (null when the problem is the whole statement or
// the whole task) and `field` is the box to go to ('title', 'tasks', 'name', 'hazards', 'hazard', 'controls', 'before', 'after').
export function publishIssues(meta, body) {
  const out = [];
  const add = (text, task, hazard, field) => out.push({ text, task, hazard, field });
  if (!meta.title) add('Give it a title.', null, null, 'title');
  if (!body.tasks.length) add('Add at least one job task.', null, null, 'tasks');
  body.tasks.forEach((t, i) => {
    const name = t.name || `Task ${i + 1}`;
    if (!t.name) add(`Task ${i + 1} needs a name.`, i, null, 'name');
    if (!t.hazards.length) add(`“${name}” needs at least one hazard.`, i, null, 'hazards');
    t.hazards.forEach((x, j) => {
      const at = `“${name}”, hazard ${j + 1}`;
      if (richBlank(x.hazard)) add(`${at}: say what the hazard is.`, i, j, 'hazard');
      if (richBlank(x.controls)) add(`${at}: add the control measures.`, i, j, 'controls');
      if (!x.before) add(`${at}: choose the risk rating before controls.`, i, j, 'before');
      if (!x.after) add(`${at}: choose the risk rating after controls.`, i, j, 'after');
      if (x.after === '4A') add(`${at}: still rated Acute after controls, so it cannot go ahead as written.`, i, j, 'after');
      if (x.before && x.after && ratingRank(x.after) > ratingRank(x.before)) add(`${at}: the rating after controls is worse than before them.`, i, j, 'after');
    });
  });
  return out;
}
// The same, as the words the Worker sends back when a publish is refused (the first twenty).
export const publishProblems = (meta, body) => publishIssues(meta, body).slice(0, 20).map(x => x.text);
// The highest rating after controls anywhere in the statement ('' when nothing is rated).
export const overallRating = body => body.tasks.flatMap(t => t.hazards).map(x => x.after).filter(Boolean).sort((a, b) => ratingRank(b) - ratingRank(a))[0] || '';

// ---- working on the tasks of a statement ----
// What the editor does to a list of tasks and their hazards, kept here so each move can be tested without a browser. Each returns a new list and never changes the one
// it was given. A copy gets new ids (an id is only a row's key on the screen).
export const hazardCount = tasks => tasks.reduce((n, t) => n + t.hazards.length, 0);
export const taskRating = task => overallRating({ tasks: [task] });
export function moveItem(list, i, step) {
  const j = i + step;
  if (i < 0 || i >= list.length || j < 0 || j >= list.length) return list;
  const out = list.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}
export const copyHazard = (x, newId = defaultId) => ({ ...x, id: newId('swh') });
export const copyTask = (t, newId = defaultId) => ({ ...t, id: newId('swt'), hazards: t.hazards.map(x => copyHazard(x, newId)) });
// The person responsible, when every hazard of a task has the same one (a task on the company's sheets has one for the whole task); null when they differ.
export function responsibleOf(task) {
  const all = new Set(task.hazards.map(x => x.responsible || ''));
  return all.size === 1 ? [...all][0] : all.size === 0 ? '' : null;
}
export const withResponsible = (task, who) => ({ ...task, hazards: task.hazards.map(x => ({ ...x, responsible: String(who ?? '').slice(0, LIMITS.responsible) })) });
// A hazard moved to the end of another task (nothing happens if either place is not there, or the other task is full).
export function moveHazard(tasks, from, k, to) {
  const x = tasks[from]?.hazards[k];
  if (!x || !tasks[to] || from === to || tasks[to].hazards.length >= LIMITS.hazards) return tasks;
  return tasks.map((t, i) => (i === from ? { ...t, hazards: t.hazards.filter((_, j) => j !== k) } : i === to ? { ...t, hazards: [...t.hazards, x] } : t));
}
// Tasks taken from another statement (by position) as new ones to add after the `have` the statement already has, as many as the limit leaves room for.
export function takeTasks(source, picks, have, newId = defaultId) {
  const room = Math.max(0, LIMITS.tasks - have);
  return [...new Set(picks)].filter(i => source[i]).sort((a, b) => a - b).slice(0, room)
    .map(i => { const t = copyTask(source[i], newId); return { ...t, hazards: t.hazards.map(x => ({ ...x, hazard: hazardToRich(x.hazard), controls: controlsToRich(x.controls) })) }; });   // the editor holds these as markup
}

// ---- moving between the two kinds of text ----
// What the editor does when it opens a statement written before rich text: each of those fields becomes the markup it would have printed as (a control or a management
// statement a line each becomes a bullet; the legislation note, paragraphs), and anything already markup is only cleaned. Nothing is saved until the person saves, and what
// is saved is markup. All of them are safe to run again on what they have made.
const bullets = items => (items.length ? `<ul>${items.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : '');
const eachLine = v => (Array.isArray(v) ? v : String(v ?? '').split('\n')).map(x => String(x).trim()).filter(Boolean);
export const controlsToRich = v => (isRichText(v) ? sanitizeRich(v) : sanitizeRich(bullets(eachLine(v))));
export const listToRich = v => (isRichText(v) ? sanitizeRich(v) : sanitizeRich(bullets(eachLine(v))));
export const hazardToRich = v => (isRichText(v) ? sanitizeRich(v) : plainToRich(v));
export const referencesToRich = v => (isRichText(v) ? sanitizeRich(v) : plainToRich(v));
export function richBody(input) {
  const b = input && typeof input === 'object' ? input : {};
  const mgmt = b.management && typeof b.management === 'object' ? b.management : {};
  return {
    ...b,
    management: Object.fromEntries(MANAGEMENT.map(([k]) => [k, listToRich(mgmt[k])])),
    references: referencesToRich(b.references),
    tasks: (Array.isArray(b.tasks) ? b.tasks : []).map(t => ({ ...t, hazards: (Array.isArray(t?.hazards) ? t.hazards : []).map(x => ({ ...x, hazard: hazardToRich(x?.hazard), controls: controlsToRich(x?.controls) })) })),
  };
}
// How many characters a field says, with the markup taken away (what the limits count).
export const richLength = v => richToText(v).length;
// How many statements a management list holds, whichever kind of text it is (a line, or a bullet, each).
export const listCount = v => (Array.isArray(v) ? v.filter(x => String(x).trim()).length : richToText(v).split('\n').filter(l => l.trim()).length);

// Where a rich field is longer than it may be, in the same shape as publishIssues (`field` is 'controls', 'references' or 'management:<list>'). Words are counted, not markup.
// The editor will not save while there is one, and the Worker refuses a write that has one, so nothing is ever cut without saying. It reads what it is given as it is (it may
// not be clean, or even the right shape: it is what came in a request).
export function limitIssues(input) {
  const b = input && typeof input === 'object' ? input : {};
  const out = [];
  const over = (v, textMax, htmlMax) => isRichText(v) && (richToText(v).length > textMax || String(v).length > htmlMax);
  const mgmt = b.management && typeof b.management === 'object' ? b.management : {};
  MANAGEMENT.forEach(([k, label]) => { if (over(mgmt[k], LIMITS.managementText, RICH_HTML_MAX.management)) out.push({ text: `${label} is too long: ${richToText(mgmt[k]).length} characters, and it can hold ${LIMITS.managementText}.`, task: null, hazard: null, field: `management:${k}` }); });
  if (over(b.references, LIMITS.references, RICH_HTML_MAX.references)) out.push({ text: `The legislation note is too long: ${richToText(b.references).length} characters, and it can hold ${LIMITS.references}.`, task: null, hazard: null, field: 'references' });
  (Array.isArray(b.tasks) ? b.tasks : []).forEach((t, i) => (Array.isArray(t?.hazards) ? t.hazards : []).forEach((x, j) => {
    if (over(x?.hazard, LIMITS.hazard, RICH_HTML_MAX.hazard)) out.push({ text: `“${String(t?.name || '').trim() || `Task ${i + 1}`}”, hazard ${j + 1}: the hazard is too long: ${richToText(x.hazard).length} characters, and it can hold ${LIMITS.hazard}.`, task: i, hazard: j, field: 'hazard' });
    if (over(x?.controls, LIMITS.controls, RICH_HTML_MAX.controls)) out.push({ text: `“${String(t?.name || '').trim() || `Task ${i + 1}`}”, hazard ${j + 1}: the control measures are too long: ${richToText(x.controls).length} characters, and they can hold ${LIMITS.controls}.`, task: i, hazard: j, field: 'controls' });
  }));
  return out;
}

// ---- the printed page ----
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nl = s => esc(s).replace(/\n/g, '<br>');
const tick = (on, label) => `<div class="tk">${on ? '&#9745;' : '&#9744;'} ${esc(label)}</div>`;
const grid = (items, chosen, other) => `<div class="grid">${items.map(([k, l]) => tick(chosen.includes(k), l)).join('')}${other ? tick(true, other) : ''}</div>`;
const blank = '<span class="blank"></span>';
// A rich field inside a cell of the page: cleaned again (the page does not trust what it is given), and in a box of its own so the page's styles for headings and lists
// do not reach into it. A field written before rich text prints as it always did.
const rich = html => `<div class="rtx">${sanitizeRich(html).replace(/<hr class="pb">/g, '')}</div>`;
const controlsHtml = s => (isRichText(s) ? rich(s) : s ? `<ul>${String(s).split('\n').map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : '');
const listHtml = v => (isRichText(v) ? rich(v) : (v || []).length ? `<ul>${v.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : '');
const hazardHtml = v => (isRichText(v) ? rich(v) : nl(v));
const referencesHtml = v => (isRichText(v) ? rich(v) : nl(v));

// A complete page, as text, ready for the print frame. `content` is what a version froze (or the draft, composed the same way). `opts`:
//   letterhead: { css, html } the company's own (printLetterhead); business: { name, address, contact } for the header lines;
//   version: the number (none for a draft); job: the details of one job (principal contractor, site, dates, hazardous substances...), left blank when absent;
//   signOns: rows already signed [{ name, role, licences, date, signature }], and blankRows: how many empty lines follow; fingerprint: the version's SHA-256.
export function swmsPrintHtml(content, opts = {}) {
  const c = { ...emptyBody(), ...content };
  const o = opts, job = o.job || {}, lh = o.letterhead || { css: '', html: '' };
  const field = (label, v) => `<td class="f"><b>${esc(label)}</b> ${v ? esc(v) : blank}</td>`;
  const headTitle = `${esc(c.title || 'Safe work method statement')} <span class="sub">Safe Work Method Statement (SWMS)</span>`;
  const mgmt = MANAGEMENT.map(([k, l]) => `<tr><th>${esc(l)}</th><td>${listHtml(c.management?.[k])}</td></tr>`).join('');
  const matrix = `<table class="mx"><tr><th>Likelihood</th>${CONSEQUENCES.map(x => `<th>${esc(x)}</th>`).join('')}</tr>${
    [...LIKELIHOODS].map((l, i) => ({ l, i })).reverse().map(({ l, i }) => `<tr><th>${esc(l)}</th>${RISK_GRID[i].map(code => `<td class="r${code}">${esc(ratingName(code))}</td>`).join('')}</tr>`).join('')}</table>`;
  const legend = `<table class="lg">${[...RATINGS].reverse().map(r => `<tr><td class="r${r.code}"><b>${esc(r.code)}</b> ${esc(r.name)}</td><td>${esc(r.action)}</td></tr>`).join('')}</table>`;
  const tasks = c.tasks.map((t, i) => t.hazards.map((x, j) => `<tr>${j === 0 ? `<td class="tn" rowspan="${t.hazards.length}">${i + 1}. ${esc(t.name)}</td>` : ''}<td>${hazardHtml(x.hazard)}</td><td class="rc r${x.before}">${esc(x.before)}</td>`
    + `<td>${controlsHtml(x.controls)}</td><td>${esc(x.responsible)}</td><td class="rc r${x.after}">${esc(x.after)}</td></tr>`).join('')).join('');
  const overall = overallRating(c);
  const plant = (c.plant || []).length ? `<table class="pl">${c.plant.map(p => `<tr><td>${esc(p.item)}</td><td>${esc(p.control)}</td></tr>`).join('')}</table>` : '';
  const substances = (job.hazardousSubstances || []).filter(Boolean);
  const signed = (o.signOns || []).map(s => `<tr><td>${esc(s.name)}</td><td>${esc(s.role)}</td><td>${esc(s.licences)}</td><td>${esc(s.date)}</td><td>${esc(s.signature)}</td></tr>`).join('');
  const empty = Array.from({ length: Math.max(0, o.blankRows ?? 8) }, () => '<tr class="bl"><td></td><td></td><td></td><td></td><td></td></tr>').join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.title || 'SWMS')}</title><style>
    @page{size:A4 landscape;margin:10mm}
    body{font:9pt/1.35 Arial,Helvetica,sans-serif;color:#000;margin:0}
    h1{font-size:15pt;margin:0 0 6pt}h1 .sub{display:block;font-size:9pt;font-weight:400;color:#444}
    h2{font-size:9pt;margin:10pt 0 3pt;text-transform:uppercase;letter-spacing:.03em;page-break-after:avoid}
    table{border-collapse:collapse;width:100%}td,th{border:1px solid #666;padding:2pt 4pt;vertical-align:top;text-align:left}th{background:#eee}
    ul{margin:0;padding-left:12pt}li{margin:0}.hd td.f{width:33%}.blank{display:inline-block;min-width:80pt;border-bottom:1px solid #666}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1pt 8pt;border:1px solid #666;padding:3pt 5pt}.tk{break-inside:avoid}
    .doc td{width:25%}.mgmt th{width:18%}.tasks thead{display:table-header-group}.tasks tr{break-inside:avoid}.tn{width:12%;font-weight:700}.rc{text-align:center;font-weight:700;width:5%}
    .tasks th:nth-child(2){width:20%}.tasks th:nth-child(4){width:38%}
    .r1L{background:#d8f0d8}.r2M{background:#fff3b8}.r3H{background:#ffd5a8}.r4A{background:#ffb3b3}
    .mx td,.mx th{text-align:center;font-size:8pt}.lg td{font-size:8pt}.cols{display:flex;gap:10pt}.cols>div{flex:1}.pl td{width:50%}
    .sign p{margin:0 0 4pt}.bl td{height:20pt}.fp{font:7pt monospace;color:#444;margin-top:6pt;word-break:break-all}.sec{break-inside:avoid}
    .rtx p{margin:0 0 3pt}.rtx>:last-child{margin-bottom:0}.rtx h2,.rtx h3{font-size:9pt;margin:3pt 0 2pt;text-transform:none;letter-spacing:0}
    .rtx ul,.rtx ol{margin:0 0 3pt;padding-left:12pt}.rtx ul{list-style:disc}.rtx ol{list-style:decimal}.rtx li ul,.rtx li ol{margin:1pt 0 0}.rtx ul ul{list-style:circle}.rtx ol ol{list-style:lower-alpha}
    .rtx table{margin:2pt 0;page-break-inside:avoid}.rtx td,.rtx th{padding:1pt 3pt;border-color:#888}.rtx a{color:#000;text-decoration:underline}
    .rtx .i1{margin-left:12pt}.rtx .i2{margin-left:24pt}.rtx .i3{margin-left:36pt}.rtx .i4{margin-left:48pt}
    ${lh.css}
  </style></head><body>
    ${lh.html}
    <h1>${headTitle}</h1>
    <table class="hd"><tr>${field('Business contact', job.businessContact)}${field('Phone', job.businessPhone)}${field('Responsible person for monitoring the work', job.responsiblePerson)}</tr>
      <tr>${field('Principal contractor', job.principalContractor)}${field('Address', job.principalContractorAddress)}${field('Phone', job.principalContractorPhone)}</tr>
      <tr><td class="f" colspan="2"><b>Job site address</b> ${job.siteAddress ? esc(job.siteAddress) : blank}</td>${field('Date provided to the principal contractor', job.providedOn)}</tr></table>
    <h2>This work involves the following hazardous work and environmental impacts</h2>${grid(HAZARDOUS_WORK, c.hazardous, c.hazardous_other)}
    <h2>This work involves the following high-risk construction work</h2>${grid(HRCW, c.hrcw, c.hrcw_other)}
    <h2>Protective equipment</h2>${grid(PPE, c.ppe, c.ppe_note)}
    <table class="doc" style="margin-top:6pt"><tr><td><b>Document</b> ${c.code ? esc(c.code) : blank}</td><td><b>Version</b> ${o.version ? esc(o.version) : 'Draft'}</td>
      <td><b>Developed by</b> ${esc(o.business?.name || '')}</td><td><b>Review due</b> ${o.reviewDue ? esc(o.reviewDue) : blank}</td></tr></table>
    <h2>Management of the work</h2><table class="mgmt">${mgmt}</table>
    <div class="cols sec"><div><h2>Site-specific notes</h2><table><tr><td style="height:36pt">${nl(job.siteNotes)}</td></tr></table></div>
      <div><h2>Legislation, regulations and codes of practice</h2><table><tr><td style="height:36pt">${referencesHtml(c.references)}</td></tr></table></div></div>
    <h2>Risk rating</h2><div class="cols sec">${matrix}${legend}</div>
    <h2>Job tasks, hazards and controls</h2>
    <table class="tasks"><thead><tr><th>Job task</th><th>Hazards</th><th>Risk</th><th>Control measures</th><th>Responsible person</th><th>After controls</th></tr></thead><tbody>${tasks}</tbody></table>
    <p class="sec"><b>Overall risk rating after controls:</b> ${overall ? `<span class="r${overall}" style="padding:1pt 6pt">${esc(ratingName(overall))}</span>` : blank}</p>
    <div class="cols sec"><div><h2>Permits</h2>${grid(PERMITS, [...(c.permits || []), ...(job.permits || [])], '')}
      <h2>Is the work part of a construction project?</h2><div class="grid">${tick(job.constructionProject === true, 'Yes')}${tick(job.constructionProject === false, 'No')}</div>
      <p style="margin:2pt 0 0;font-size:8pt">If yes, this SWMS has to line up with the site management plan for the project.</p></div>
      <div><h2>Plant and equipment</h2>${plant}<h2>Hazardous substances taken on site</h2><table>${(substances.length ? substances : ['', '', '']).map((s, i) => `<tr><td>${i + 1}. ${esc(s)}</td></tr>`).join('')}</table>
      <p style="margin:2pt 0 0;font-size:8pt">Keep the safety data sheet for each one on site.</p></div>
      <div><h2>Supervisory arrangements</h2>${grid(SUPERVISION, c.supervision, '')}</div></div>
    <div class="sign sec"><h2>SWMS sign-off</h2><p>${esc(SIGN_ON_STATEMENT)}</p>
      <table><tr><th>Worker</th><th>Role or position</th><th>Licences, competencies and qualifications</th><th>Date</th><th>Signature</th></tr>${signed}${empty}</table></div>
    ${o.fingerprint ? `<div class="fp">Version ${esc(o.version)} · content fingerprint (SHA-256) ${esc(o.fingerprint)}</div>` : ''}
  </body></html>`;
}

// ---- what changed between two versions (ACC-332) ----
// `a` is the earlier content (a version, or nothing) and `b` the later (a version, or the draft composed the same way: contentOf). The answer is a list of changes in the
// order a statement reads, each { section, where, kind: 'added' | 'removed' | 'changed', label, from, to, added, removed }: `from` and `to` for a box that changed (a rating
// is its code), `added` and `removed` for the lines of a list or of control measures. Tasks and hazards are matched by the id they keep from one version to the next (a task
// copied from another statement has a new one), then by their words, so a renamed task is one change and not a removal and an addition. Nothing here writes.
// A rich field as lines, one for each paragraph, bullet (a bullet under a bullet is a line of its own) and table row, the cells of a row on one line.
const htmlLines = h => String(h).replace(/<\/(?:td|th)>\s*/gi, ' ').replace(/<(?:\/?(?:ul|ol|li|p|tr|table|h[1-6]|div|blockquote)|br)\b[^>]*>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const lineList = v => (isRichText(v) ? htmlLines(v) : Array.isArray(v) ? v.join('\n') : String(v ?? '')).split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
const hazardText = v => lineList(v).join(' ');   // a hazard's name as one line, whichever kind of text it is
const wordsKey = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const lineDiff = (x, y) => { const A = lineList(x), B = lineList(y), sa = new Set(A), sb = new Set(B); return { removed: A.filter(l => !sb.has(l)), added: B.filter(l => !sa.has(l)) }; };
const labelIn = (list, key) => (list.find(([k]) => k === key) || [key, key])[1];
// Pairs of (earlier, later) items by id, then by their words; what is left over on either side is removed or added.
function pairUp(xs, ys, words) {
  const pairs = [], usedY = new Set(), left = [];
  for (const x of xs) {
    const j = x.id ? ys.findIndex((y, k) => !usedY.has(k) && y.id === x.id) : -1;
    if (j >= 0) { usedY.add(j); pairs.push([x, ys[j]]); } else left.push(x);
  }
  const removed = [];
  for (const x of left) {
    const j = ys.findIndex((y, k) => !usedY.has(k) && words(y) && words(y) === words(x));
    if (j >= 0) { usedY.add(j); pairs.push([x, ys[j]]); } else removed.push(x);
  }
  return { pairs, removed, added: ys.filter((_, k) => !usedY.has(k)) };
}
export function diffContent(a, b) {
  const A = a && typeof a === 'object' ? a : {}, B = b && typeof b === 'object' ? b : {};
  const out = [];
  const box = (section, label, x, y, where = '') => {
    const p = String(x ?? '').trim(), q = String(y ?? '').trim();
    if (p !== q) out.push({ section, where, kind: !p ? 'added' : !q ? 'removed' : 'changed', label, from: p, to: q });
  };
  box('Details', 'Title', A.title, B.title); box('Details', 'Document number', A.code, B.code);
  if (Number(A.review_every_months) !== Number(B.review_every_months)) box('Details', 'Review', A.review_every_months ? `every ${A.review_every_months} months` : '', B.review_every_months ? `every ${B.review_every_months} months` : '');
  for (const [key, list, name] of [['hazardous', HAZARDOUS_WORK, 'Hazardous work'], ['hrcw', HRCW, 'High-risk construction work'], ['ppe', PPE, 'Protective equipment'], ['permits', PERMITS, 'Permits'], ['supervision', SUPERVISION, 'Supervision']]) {
    const x = new Set(A[key] || []), y = new Set(B[key] || []);
    for (const k of list.map(([k]) => k)) { if (y.has(k) && !x.has(k)) out.push({ section: 'What the work involves', where: name, kind: 'added', label: labelIn(list, k) }); else if (x.has(k) && !y.has(k)) out.push({ section: 'What the work involves', where: name, kind: 'removed', label: labelIn(list, k) }); }
  }
  box('What the work involves', 'Other hazardous work', A.hazardous_other, B.hazardous_other); box('What the work involves', 'Other high-risk work', A.hrcw_other, B.hrcw_other); box('What the work involves', 'Protective equipment note', A.ppe_note, B.ppe_note);
  for (const [key, label] of MANAGEMENT) {
    const d = lineDiff(A.management?.[key], B.management?.[key]);
    if (d.added.length || d.removed.length) out.push({ section: 'Management of the work', where: label, kind: 'changed', label: '', ...d });
  }
  const refs = lineDiff(A.references, B.references);
  if (refs.added.length || refs.removed.length) out.push({ section: 'Legislation', where: '', kind: 'changed', label: '', ...refs });
  const plant = pairUp((A.plant || []).map(x => ({ ...x })), (B.plant || []).map(x => ({ ...x })), x => wordsKey(x.item));
  for (const x of plant.removed) out.push({ section: 'Plant and equipment', where: '', kind: 'removed', label: x.item });
  for (const x of plant.added) out.push({ section: 'Plant and equipment', where: '', kind: 'added', label: x.item });
  for (const [x, y] of plant.pairs) box('Plant and equipment', `Control for ${y.item}`, x.control, y.control);
  const tasks = pairUp(A.tasks || [], B.tasks || [], t => wordsKey(t.name));
  for (const t of tasks.removed) out.push({ section: 'Job tasks', where: t.name || 'A task with no name', kind: 'removed', label: 'Task', from: `${(t.hazards || []).length} hazard${(t.hazards || []).length === 1 ? '' : 's'}` });
  for (const t of tasks.added) out.push({ section: 'Job tasks', where: t.name || 'A task with no name', kind: 'added', label: 'Task', to: `${(t.hazards || []).length} hazard${(t.hazards || []).length === 1 ? '' : 's'}` });
  const order = tasks.pairs.map(([, y]) => (B.tasks || []).indexOf(y));
  if (order.some((n, i) => i && n < order[i - 1])) out.push({ section: 'Job tasks', where: '', kind: 'changed', label: 'Order of the job tasks' });
  for (const [x, y] of tasks.pairs) {
    const where = y.name || x.name || 'A task with no name';
    box('Job tasks', 'Task name', x.name, y.name, where);
    const hz = pairUp(x.hazards || [], y.hazards || [], h => wordsKey(hazardText(h.hazard)));
    for (const h of hz.removed) out.push({ section: 'Job tasks', where, kind: 'removed', label: 'Hazard', from: hazardText(h.hazard) });
    for (const h of hz.added) out.push({ section: 'Job tasks', where, kind: 'added', label: 'Hazard', to: hazardText(h.hazard) });
    for (const [p, q] of hz.pairs) {
      const at = `${where} › ${hazardText(q.hazard) || hazardText(p.hazard) || 'A hazard with no name'}`;
      box('Job tasks', 'Hazard', hazardText(p.hazard), hazardText(q.hazard), at);
      box('Job tasks', 'Rating before controls', p.before, q.before, at); box('Job tasks', 'Rating after controls', p.after, q.after, at);
      box('Job tasks', 'Person responsible', p.responsible, q.responsible, at);
      const c = lineDiff(p.controls, q.controls);
      if (c.added.length || c.removed.length) out.push({ section: 'Job tasks', where: at, kind: 'changed', label: 'Control measures', ...c });
    }
  }
  return out;
}
// How many changes there are, in a few words ("3 changes: Job tasks 2, Details 1"), or "No changes" for none.
export function diffSummary(changes) {
  if (!changes.length) return 'No changes';
  const by = new Map();
  for (const c of changes) by.set(c.section, (by.get(c.section) || 0) + 1);
  return `${changes.length} change${changes.length === 1 ? '' : 's'}: ${[...by].map(([s, n]) => `${s} ${n}`).join(', ')}`;
}
