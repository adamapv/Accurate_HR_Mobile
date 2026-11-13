// Access levels (ACC-273): what each kind of person can see and do. Shared by the browser (which screens and
// buttons to show, and the Access levels editor) and the Worker (what it will actually allow), so
// both always agree.
//
// A level is a name plus a grant for each area of the app below. A grant is a scope (none, own,
// team or all: whose records) and, where the area has them, "can change" and "can approve" ticks.
// Levels hang off employee types (Settings → Access levels), and a person has the level of their type.
// A person with no type, or a type with no level, has the built-in level of their role.
//
// Areas are being moved over to levels one at a time. A `live` area is enforced by the Worker from
// the level's grant. Every other area still follows the role the level "works like" (its
// worksLike), so a level that has no stored grant for an area behaves exactly as its role does
// today. ROLE_GRANTS below is what each role has today, area by area; it is also the starting point
// of every level. When an area goes live nothing changes for anyone until a level is edited.
//
// What staff may do for themselves (edit their own details, request leave, see the team leave
// calendar, see and upload their own documents, raise purchase orders) used to be six company-wide
// switches (Settings → Self-service permissions, since folded into the levels). They are now the grants of each level for Own
// details, Leave, Employee documents and Purchase orders; the switches were copied into the
// levels when they went.

export const SCOPES = ['none', 'own', 'team', 'all'];
export const SCOPE_LABELS = { none: 'No access', own: 'Their own', team: 'Their team', all: 'Everyone' };
export const scopeRank = s => Math.max(0, SCOPES.indexOf(s));
// The scope a set of grants has in an area ('none' when it has none), and whether it reaches `scope`.
export const scopeOf = (access, area) => access?.[area]?.scope || 'none';
export const atLeast = (access, area, scope) => scopeRank(scopeOf(access, area)) >= scopeRank(scope);

// The roles a level can work like. 'owner' is only ever the built-in Owner level, which cannot be edited.
export const ROLES = ['user', 'mechanic', 'manager', 'admin', 'owner'];
export const ROLE_NAMES = { user: 'Employee', mechanic: 'Mechanic', manager: 'Manager', admin: 'Admin', owner: 'Owner' };
export const BASE_ROLES = ['user', 'mechanic', 'manager', 'admin'];

// An area is a company-wide setting when only none and all make sense for it.
const COMPANY = ['none', 'all'];
const SEE = { none: 'Hidden', all: 'Can see' };   // how a sensitive-data area words its two choices
const FULL = ['none', 'own', 'team', 'all'];
const EDIT = { key: 'edit', label: 'Can change' };
const RAISE = { key: 'edit', label: 'Can raise' };   // the same tick, worded for purchase orders
const APPROVE = { key: 'approve', label: 'Can approve' };
const SEND = { key: 'edit', label: 'Can send' };   // the same tick, worded for chat
const MODERATE = { key: 'approve', label: 'Can moderate' };
const SAVE_TO_JOBS = { key: 'edit', label: 'Can save' };   // the same tick, worded for saving a chat to a job
const ASK_FOR_HELP = { key: 'edit', label: 'Can ask for help' };   // the same tick, worded for support requests
const ALLOW_ACCESS = { key: 'approve', label: 'Can allow account access' };
const WRITE_AND_ATTACH = { key: 'edit', label: 'Can write and attach' };   // the same tick, worded for job safety: writing a SWMS and choosing what goes with which job
const PUBLISH_SWMS = { key: 'approve', label: 'Can publish SWMS' };

// group is the tab each area belongs to in the app. `scopeLabels` words a company-wide area's choices.
export const AREAS = [
  { key: 'people', label: 'People and records', group: 'Team', scopes: FULL, actions: [EDIT],
    blurb: 'The people directory, profiles and personal details.' },
  // One scope only: everyone can see their own details; the tick says whether they can change them.
  { key: 'my_details', label: 'Own details', group: 'Team', scopes: ['own'], actions: [EDIT], live: true,
    blurb: 'Their own profile under My HR: address, emergency contact, phone and photo.' },
  { key: 'leave', label: 'Leave', group: 'Team', scopes: FULL, actions: [EDIT, APPROVE], live: true,
    blurb: 'Leave requests and balances, approving them, and the team leave calendar (Their team or Everyone).' },
  { key: 'timesheets', label: 'Timesheets', group: 'Team', scopes: FULL, actions: [APPROVE],
    blurb: 'Days of time submitted for approval, and approving them.' },
  { key: 'expenses', label: 'Expenses', group: 'Team', scopes: FULL, actions: [EDIT, APPROVE],
    blurb: 'Claims, their approval and paying approved claims.' },
  // Allowances (living away from home, meals, PPE): the scope is whose allowances they can see; Can change is choosing who carries which allowance and which jobs
  // do (the library and its rates are Company setup); Can approve is deciding the weeks that need a manager. Live from the start, so a level decides it.
  { key: 'allowances', label: 'Allowances', group: 'Team', scopes: FULL, actions: [EDIT, APPROVE], live: true,
    blurb: 'Allowances paid for time on jobs: seeing them, choosing who carries which and which jobs do, and approving them. The allowance types and their rates are under Company setup.' },
  { key: 'reviews', label: 'Performance', group: 'Team', scopes: FULL, actions: [EDIT],
    blurb: 'Review cycles, goals and one-on-ones.' },
  // Chat is company-wide: everyone with it on can message anyone. Private one-to-one chats stay private to the two people
  // whatever the level; Can moderate is deleting other people's messages in the Office channel and in groups.
  { key: 'chat', label: 'Chat', group: 'Team', scopes: COMPANY, actions: [SEND, MODERATE], live: true,
    scopeLabels: { all: 'Yes' }, blurb: 'Messaging colleagues, one to one or in groups, and the Office channel. Can send is posting; Can moderate is deleting other people’s messages in the Office and in groups. Private chats are only ever read by the two people in them.' },
  // Putting a chat on a job in simPRO makes it readable by everyone who can see that job, so it is its own area: who may do it is the
  // company's choice. A person still has to be in the chat they save, and a line in the chat tells the others.
  { key: 'chat_save', label: 'Save chats to jobs', group: 'Team', scopes: COMPANY, actions: [SAVE_TO_JOBS], live: true,
    scopeLabels: { all: 'Yes' }, blurb: 'Saving some or all of a chat to a job in simPRO as a Word document. Everyone who can see that job in simPRO can read it, and the chat is told. Only people in the chat can save it, and only if they also have Chat.' },
  // Keeping a group to the right people (12 Nov 2026): taking someone else out of a group you are in. Anyone with Chat can still start a group, name it and add people.
  { key: 'chat_groups', label: 'Manage chat groups', group: 'Team', scopes: COMPANY, actions: [{ key: 'edit', label: 'Can manage' }], live: true,
    scopeLabels: { all: 'Yes' }, blurb: 'Taking people out of a chat group they are in, so a job’s group keeps to the people on the job. Anyone with Chat can already start a group, rename it and add people, and anyone can leave one.' },
  { key: 'qualifications', label: 'Licences and tickets', group: 'Team', scopes: FULL, actions: [EDIT],
    blurb: 'Who holds which licence or ticket, and what is expiring.' },
  { key: 'documents', label: 'Employee documents', group: 'Team', scopes: ['none', 'own', 'all'], actions: [EDIT], live: true,
    blurb: 'The HR paperwork kept on each person; Can change is uploading.' },
  { key: 'contracts', label: 'Contracts', group: 'Team', scopes: ['none', 'own', 'all'], actions: [EDIT],
    blurb: 'Contracts and offers of employment, and the job details they are pre-filled with (award, hours, place of work, states).' },
  { key: 'onboarding', label: 'Onboarding', group: 'Team', scopes: ['none', 'own', 'all'], actions: [EDIT],
    blurb: 'New starter checklists and induction.' },
  { key: 'offboarding', label: 'Offboarding', group: 'Team', scopes: ['none', 'own', 'all'], actions: [EDIT],
    blurb: 'Departures and exit interviews.' },
  { key: 'hiring', label: 'Hiring and employee types', group: 'Team', scopes: COMPANY, actions: [EDIT], live: true,
    scopeLabels: { all: 'Yes' }, blurb: 'The Hire board, starter packs, employee types, and the onboarding and offboarding templates.' },
  // The Field view (ACC-358): whether a phone opens the app as the field app for people on the tools (Home, Job card, Safety, My week, More) or as the
  // full app laid out for a small screen (managers and office staff). A company-wide yes or no on the level; a device can still choose the other
  // (More, or the account menu). Live from the start: the standard Employee and Mechanic levels have it, Manager and Admin do not.
  // `free`: it opens no records and lets nobody do anything, so it is left out of "nobody can hand out more than they hold" (an admin without it still sets it).
  { key: 'field_view', label: 'Uses the Field view', group: 'Team', scopes: COMPANY, actions: [], live: true, free: true,
    scopeLabels: { all: 'Yes' }, blurb: 'On a phone, the field app for people on the tools (Home, Job card, Safety, My week, More) instead of the full app laid out for a small screen. Any device can still switch to the other under More or the account menu.' },
  { key: 'reports', label: 'Reports', group: 'Team', scopes: ['none', 'team', 'all'], actions: [],
    blurb: 'Headcount, leave, hours and compliance reports.' },

  // Live since 6 Nov 2026 (ACC-375). Their own is My schedule only (their published days); Their team is the board for the people they manage and the jobs they
  // lead; Everyone is the whole board. Can change is planning and publishing; someone who plans everyone also renames tags and pins jobs to everyone's board.
  { key: 'schedule', label: 'Schedule', group: 'Operations', scopes: FULL, actions: [EDIT], live: true,
    blurb: 'Who is working on which job each day. Their own is My schedule; Their team is the board for the people they manage and the jobs they lead; Everyone is the whole board. Can change is planning and publishing.' },
  { key: 'jobs', label: 'Jobs', group: 'Operations', scopes: COMPANY, actions: [EDIT],
    scopeLabels: { all: 'Yes' }, blurb: 'Open simPRO jobs, sections and cost centres. Can change is the team leaders, the project manager set here, and whether a job’s time counts as productive.' },
  { key: 'purchase_orders', label: 'Purchase orders', group: 'Operations', scopes: ['none', 'own', 'all'], actions: [RAISE], live: true,
    blurb: 'simPRO purchase order numbers: whose they can see, and whether they can raise one.' },
  { key: 'assets', label: 'Assets', group: 'Operations', scopes: FULL, actions: [EDIT],
    blurb: 'Tools and equipment issued to people, and the ute checks on the utes they hold (Can change: choosing a ute’s checklist and checking any ute in reach).' },
  { key: 'workshop', label: 'Workshop and plant', group: 'Operations', scopes: COMPANY, actions: [EDIT],
    scopeLabels: { all: 'Yes' }, blurb: 'Plant, work orders, defects, parts and servicing.' },
  { key: 'whs', label: 'Safety and WHS', group: 'Operations', scopes: ['none', 'own', 'team', 'all'], actions: [EDIT],
    blurb: 'Incidents, hazards, investigations and corrective actions.' },
  // Job safety (28 Oct 2026): the checklists ticked when starting and finishing a job, and the SWMS written for the work. The scope is whose records a person
  // sees (the checklists they have ticked and the SWMS they have signed on to, their team's, or everyone's); anyone with the area reads the SWMS that have been
  // published. Can write and attach is writing a SWMS and choosing which checklists and SWMS go with which job; Can publish SWMS is making a version official.
  // The checklists themselves are a library under Company setup. Live from the start, so a level decides it.
  { key: 'job_safety', label: 'Job safety', group: 'Operations', scopes: FULL, actions: [WRITE_AND_ATTACH, PUBLISH_SWMS], live: true,
    blurb: 'Start and finish checklists and SWMS on jobs: reading the published SWMS, ticking checklists, seeing who did, writing a SWMS and choosing which go with which job, and publishing one. The checklists themselves are written under Company setup.' },
  { key: 'pay_cycles', label: 'Pay cycles', group: 'Operations', scopes: COMPANY, actions: [EDIT], live: true,
    scopeLabels: { all: 'Yes' }, blurb: 'Reviewing everyone’s hours, approving them and sending them to Xero.' },
  { key: 'recharges', label: 'Intercompany recharges', group: 'Operations', scopes: COMPANY, actions: [EDIT], live: true,
    scopeLabels: { all: 'Yes' }, blurb: 'Hours worked on another company’s jobs, and the invoices raised for them.' },

  { key: 'company_setup', label: 'Company setup and libraries', group: 'Admin', scopes: COMPANY, actions: [EDIT], live: true,
    scopeLabels: { all: 'Yes' }, blurb: 'Company details, categories, contract templates, policies, forms, announcements, timesheet profiles and imports.' },
  { key: 'access', label: 'Access levels', group: 'Admin', scopes: COMPANY, actions: [EDIT], live: true,
    scopeLabels: { all: 'Yes' }, blurb: 'Creating levels and choosing which one each employee type gets.' },
  // Deleting: who may delete what was made by mistake or to test (a contract, a person, a leave request...). The app asks first, and never deletes what has
  // been signed or sent to simPRO, Xero or a pay run: those are only archived. Company-wide, like Company setup; it starts with admins and owners only.
  { key: 'records_delete', label: 'Delete records', group: 'Admin', scopes: COMPANY, actions: [], live: true,
    scopeLabels: { all: 'Yes' }, blurb: 'Deleting contracts, people, documents, leave, expense claims, timesheets and the like that were made by mistake or to test. It always asks first, and never deletes anything signed or sent to simPRO or Xero (that is only archived). Every delete is logged.' },
  { key: 'integrations', label: 'Integrations and logs', group: 'Integrations', scopes: COMPANY, actions: [EDIT], live: true,
    scopeLabels: { all: 'Yes' }, blurb: 'simPRO, Xero, Dropbox, email and AccurateJobs connections, and their logs.' },
  // Support requests (ACC-318): asking AccurateHR's own support team for help from inside the app. The scope is whose requests a person sees (their
  // own, or the whole company's); Can ask for help is raising one and replying; Can allow account access is agreeing, on a request, that AccurateHR
  // support may look at the company's account for a few days (it is the company's data, so it is an admin's call, not whoever raised the request).
  { key: 'support', label: 'Support requests', group: 'Admin', scopes: ['none', 'own', 'all'], actions: [ASK_FOR_HELP, ALLOW_ACCESS], live: true,
    blurb: 'Asking AccurateHR support for help from inside the app, and following the answer. Their own or Everyone’s: whose requests they see. Can allow account access is letting AccurateHR support look at your account for a few days to sort a request out.' },

  // Sensitive data: whether a level may see (and change) these parts of other people's records, among the people it can
  // already reach. Hidden blanks them out of every screen without closing the screen. A person always sees their own.
  { key: 'sens_bank', label: 'Bank account', group: 'Sensitive data', scopes: COMPANY, actions: [EDIT], live: true, sensitive: true,
    scopeLabels: SEE, blurb: 'Bank, account name, BSB and account number (the number stays masked until shown in full, which is logged).' },
  { key: 'sens_super', label: 'Superannuation', group: 'Sensitive data', scopes: COMPANY, actions: [EDIT], live: true, sensitive: true,
    scopeLabels: SEE, blurb: 'Super fund, USI and member number.' },
  { key: 'sens_tfn', label: 'Tax file number', group: 'Sensitive data', scopes: COMPANY, actions: [EDIT], live: true, sensitive: true,
    scopeLabels: SEE, blurb: 'The TFN (masked until shown in full, which is logged).' },
  { key: 'sens_pay', label: 'Pay rates and job costing', group: 'Sensitive data', scopes: COMPANY, actions: [EDIT], live: true, sensitive: true,
    scopeLabels: SEE, blurb: 'Hourly cost, on-costs, overhead and sell price, the annual salary a contract can use, and the pay rates simPRO holds.' },
  { key: 'sens_dob', label: 'Date of birth', group: 'Sensitive data', scopes: COMPANY, actions: [EDIT], live: true, sensitive: true,
    scopeLabels: SEE, blurb: 'The full date of birth on a person’s page (birthdays on the Team page show the day and month only).' },
  { key: 'sens_contact', label: 'Address and emergency contact', group: 'Sensitive data', scopes: COMPANY, actions: [EDIT], live: true, sensitive: true,
    scopeLabels: SEE, blurb: 'Home address and emergency contact in the directory and on a person’s page.' },
];
// Whether a set of grants can see any of the three sensitive areas a payroll record holds (the Pay & PPE details screen opens on any).
export const PAY_RECORD_AREAS = ['sens_bank', 'sens_super', 'sens_tfn'];
export const canSeePayRecord = access => PAY_RECORD_AREAS.some(k => can(access, k));
export const AREA_BY_KEY = Object.fromEntries(AREAS.map(a => [a.key, a]));
export const GROUPS = ['Team', 'Operations', 'Admin', 'Integrations', 'Sensitive data'];
export const LIVE_AREAS = AREAS.filter(a => a.live).map(a => a.key);

// What each role has today, area by area. The first word is the scope; the rest are ticks.
const G = (scope, ...ticks) => ({ scope, edit: ticks.includes('edit'), approve: ticks.includes('approve') });
const NONE = G('none');
const FULL_ACCESS = G('all', 'edit', 'approve');
function rolesGrant(user, manager, admin, mechanic = user) { return { user, mechanic, manager, admin, owner: admin }; }
const DEFAULTS = {
  people: rolesGrant(G('own'), G('team'), G('all', 'edit')),
  my_details: rolesGrant(G('own', 'edit'), G('own', 'edit'), G('own', 'edit')),
  leave: rolesGrant(G('own', 'edit'), G('team', 'edit', 'approve'), G('all', 'edit', 'approve')),
  timesheets: rolesGrant(G('own'), G('team', 'approve'), G('all', 'approve')),
  expenses: rolesGrant(G('own'), G('team', 'approve'), G('all', 'edit', 'approve')),
  // Staff see their own; managers see and approve their team's; admins and owners also choose who carries which allowance and which jobs do.
  allowances: rolesGrant(G('own'), G('team', 'approve'), G('all', 'edit', 'approve')),
  reviews: rolesGrant(G('own'), G('team', 'edit'), G('all', 'edit')),
  // A new area has to start on for chat to work at all: everyone can send, admins can also moderate.
  chat: rolesGrant(G('all', 'edit'), G('all', 'edit'), G('all', 'edit', 'approve')),
  // Off for staff and mechanics (a tech asks the office to save it), on for managers, admins and owners.
  chat_save: rolesGrant(NONE, G('all', 'edit'), G('all', 'edit')),
  chat_groups: rolesGrant(NONE, G('all', 'edit'), G('all', 'edit')),
  qualifications: rolesGrant(G('own'), G('own'), G('all', 'edit')),
  documents: rolesGrant(G('own'), G('own'), G('all', 'edit')),
  contracts: rolesGrant(G('own'), G('own'), G('all', 'edit')),
  onboarding: rolesGrant(G('own'), G('own'), G('all', 'edit')),
  offboarding: rolesGrant(G('own'), G('own'), G('all', 'edit')),
  hiring: rolesGrant(NONE, NONE, G('all', 'edit')),
  reports: rolesGrant(NONE, G('team'), G('all')),
  // The Field view is for people on the tools: on for the standard Employee and Mechanic levels, off for Manager, Admin and Owner (the full app on a phone).
  field_view: rolesGrant(G('all'), NONE, NONE),
  // Adam's decision when the area went live (6 Nov 2026, ACC-375): anyone from Manager up has the whole board and everything on it. The built-in Manager level
  // used to plan their own team only; a level set to Their team still does.
  schedule: rolesGrant(G('own'), G('all', 'edit'), G('all', 'edit')),
  jobs: rolesGrant(NONE, G('all'), G('all', 'edit')),
  purchase_orders: rolesGrant(G('own', 'edit'), G('all', 'edit'), G('all', 'edit')),
  assets: rolesGrant(G('own'), G('own'), G('all', 'edit')),
  workshop: { user: NONE, mechanic: G('all', 'edit'), manager: NONE, admin: G('all', 'edit'), owner: G('all', 'edit') },
  whs: rolesGrant(G('own'), G('team'), G('all', 'edit')),
  // Admins and owners only while the phone's Start and Finish flow was being built; since 31 Oct 2026 (ACC-361) the standard Employee and Mechanic
  // levels read and sign on to the SWMS on their jobs and tick the checklists (their own records), Manager sees the team's, Admin and Owner everything
  // with Can write and attach and Can publish. A level that stored none on purpose keeps none (a stored grant always wins over the default).
  job_safety: rolesGrant(G('own'), G('team'), G('all', 'edit', 'approve')),
  pay_cycles: rolesGrant(NONE, NONE, G('all', 'edit')),
  recharges: rolesGrant(NONE, NONE, G('all', 'edit')),
  company_setup: rolesGrant(NONE, NONE, G('all', 'edit')),
  access: rolesGrant(NONE, NONE, G('all', 'edit')),
  integrations: rolesGrant(NONE, NONE, G('all', 'edit')),
  // A new capability, so nothing changes until a level is set: managers can ask for help on their own account, admins and owners see everyone's
  // requests and are the ones who can let support into the account. Staff and mechanics ask their office first.
  support: rolesGrant(NONE, G('own', 'edit'), G('all', 'edit', 'approve')),
  records_delete: rolesGrant(NONE, NONE, G('all')),
  // What each role sees of other people's sensitive data today: admins everything; managers the date of birth on a report's page.
  sens_bank: rolesGrant(NONE, NONE, G('all', 'edit')),
  sens_super: rolesGrant(NONE, NONE, G('all', 'edit')),
  sens_tfn: rolesGrant(NONE, NONE, G('all', 'edit')),
  sens_pay: rolesGrant(NONE, NONE, G('all', 'edit')),
  sens_dob: rolesGrant(NONE, G('all'), G('all', 'edit')),
  sens_contact: rolesGrant(NONE, NONE, G('all', 'edit')),
};
export function defaultGrant(role, area) { return DEFAULTS[area]?.[role] || DEFAULTS[area]?.user || NONE; }

// Every area's grant for a level that works like `role` and has these stored rows ([{ area, scope, can_edit, can_approve }]).
// An area with no stored row takes the role's default, so a new area never changes what an existing level can do.
export function resolveGrants(role, rows) {
  const stored = new Map((rows || []).map(r => [r.area, r]));
  const out = {};
  for (const a of AREAS) {
    const r = stored.get(a.key);
    out[a.key] = r ? { scope: SCOPES.includes(r.scope) ? r.scope : 'none', edit: !!r.can_edit, approve: !!r.can_approve } : { ...defaultGrant(role, a.key) };
  }
  return out;
}

// Whether a set of grants lets someone do something in an area. `need` is 'view' (any scope above none),
// 'edit' or 'approve'. An unknown area is never allowed.
export function can(access, area, need = 'view') {
  const g = access?.[area];
  if (!g || g.scope === 'none') return false;
  return need === 'view' ? true : !!g[need];
}
// What a request needs in an area: reading needs to see it, anything else needs to change it.
export const needFor = method => (method === 'GET' || method === 'HEAD') ? 'view' : 'edit';

// Checks grants sent by the editor ([{ area, scope, edit, approve }]) and returns them in storage shape, or { error, status }.
// Only live areas can be set. With `actor` (the grants of the person saving) nobody can hand out more than they hold (403).
export function cleanGrants(list, actor) {
  if (!Array.isArray(list) || list.length > AREAS.length) return { error: 'grants must be a list of areas', status: 400 };
  const seen = new Set(), out = [];
  for (const g of list) {
    const area = AREA_BY_KEY[g?.area];
    if (!area) return { error: 'unknown area', status: 400 };
    if (!area.live) return { error: `${area.label} can’t be set yet`, status: 400 };
    if (seen.has(area.key)) return { error: `${area.label} is listed twice`, status: 400 };
    seen.add(area.key);
    const scope = SCOPES.includes(g.scope) ? g.scope : null;
    if (!scope || !area.scopes.includes(scope)) return { error: `${area.label}: that choice isn’t available`, status: 400 };
    const ticks = { edit: false, approve: false };
    for (const t of area.actions) ticks[t.key] = scope !== 'none' && !!g[t.key];
    if (actor && !area.free) {
      const mine = actor[area.key] || NONE;
      if (scopeRank(scope) > scopeRank(mine.scope) || (ticks.edit && !mine.edit) || (ticks.approve && !mine.approve)) {
        return { error: `You can’t give more access to ${area.label} than you have yourself`, status: 403 };
      }
    }
    out.push({ area: area.key, scope, can_edit: ticks.edit ? 1 : 0, can_approve: ticks.approve ? 1 : 0 });
  }
  return { grants: out };
}

// The built-in levels: one per role, with ids that carry the tenant so they are unique across tenants.
export const builtInLevelId = (tenantId, role) => `lvl_${tenantId}_${role}`;
export const BUILT_IN_LEVELS = ROLES.map(role => ({ role, name: ROLE_NAMES[role] }));
