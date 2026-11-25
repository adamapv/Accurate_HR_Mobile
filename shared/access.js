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
const COPY_JOBS = { key: 'approve', label: 'Can copy quotes and jobs' };   // the second tick, worded for the Copy quote and Copy job tools
const BOOK_OTHERS = { key: 'edit', label: 'Can book others' };   // the same tick, worded for bookings
const PLAN_TASKS = { key: 'edit', label: 'Can plan tasks' };   // the same tick, worded for tasks: making them and putting them on a driver's day
const ENTER_TIME = { key: 'edit', label: 'Can add and change' };   // the same tick, worded for entering time on someone else's day

// group is the tab each area belongs to in the app. `scopeLabels` words a company-wide area's choices.
export const AREAS = [
  // People and records (live 23 Nov 2026): whose records a level reaches (the People screen needs Their team or Everyone; a person's own record is always theirs), and Can
  // change, the office's part within that reach: a person's record and profile, login details, PIN and sign-in. Adding a person needs Everyone as well. What each record
  // shows of pay, bank, date of birth and address is the Sensitive data tab's, and the cards of other areas on a person's page follow those areas.
  { key: 'people', label: 'People and records', group: 'Team', scopes: FULL, actions: [EDIT], live: true,
    blurb: 'The people directory and each person’s page: whose they can open (Their team or Everyone), and with Can change, editing a person, sending login details and resetting a PIN. Adding a person needs Everyone.' },
  // One scope only: everyone can see their own details; the tick says whether they can change them.
  { key: 'my_details', label: 'Own details', group: 'Team', scopes: ['own'], actions: [EDIT], live: true,
    blurb: 'Their own profile under My HR: address, emergency contact, phone and photo.' },
  { key: 'leave', label: 'Leave', group: 'Team', scopes: FULL, actions: [EDIT, APPROVE], live: true,
    blurb: 'Leave requests and balances, approving them, and the team leave calendar (Their team or Everyone).' },
  // Timesheets (live 23 Nov 2026): whose submitted days a level sees (the Timesheet hub needs Their team or Everyone), and Can approve, which decides them. Their team is
  // the people they manage and, for people grouped by jobs, the ones who worked on a job they lead. A person's own time (My timesheet, the job card) is always theirs.
  { key: 'timesheets', label: 'Timesheets', group: 'Team', scopes: FULL, actions: [APPROVE], live: true,
    blurb: 'Other people’s days of time: seeing the days they have submitted (Their team or Everyone), and approving them. Their own time is always theirs to log and send.' },
  // Entering time on someone else's day (a day they missed, a card that is wrong), from the Details of their row in a pay cycle. The scope is whose days: Their team
  // or Everyone; Can add and change is the right itself. The card is the person's own (they are told, and it says who entered it); the day is submitted for them and,
  // by someone who can approve it, approved in the same step. Live from the start, so a level decides it. Admins and owners start with it; nobody else does.
  { key: 'time_for_others', label: 'Time for others', group: 'Team', scopes: ['none', 'team', 'all'], actions: [ENTER_TIME], live: true,
    blurb: 'Adding, changing and removing time on another person’s day when they have missed it or got it wrong, then submitting that day for them (and approving it, with Can approve under Timesheets). The person is told, and the card says who entered it.' },
  // Expenses (live 23 Nov 2026). A person's own claims are theirs to make and send whenever the area is not None. Can change is the office's part: claiming for someone
  // else, changing or deleting their claim, changing one already sent, and marking approved claims paid. Can approve is deciding the claims of the people in scope.
  { key: 'expenses', label: 'Expenses', group: 'Team', scopes: FULL, actions: [EDIT, APPROVE], live: true,
    blurb: 'Expense claims: making their own, approving other people’s, and (with Can change) changing someone else’s claim and marking approved claims paid.' },
  // Allowances (living away from home, meals, PPE): the scope is whose allowances they can see; Can change is choosing who carries which allowance and which jobs
  // do (the library and its rates are Company setup); Can approve is deciding the weeks that need a manager. Live from the start, so a level decides it.
  { key: 'allowances', label: 'Allowances', group: 'Team', scopes: FULL, actions: [EDIT, APPROVE], live: true,
    blurb: 'Allowances paid for time on jobs: seeing them, choosing who carries which and which jobs do, and approving them. The allowance types and their rates are under Company setup.' },
  // Performance (live 23 Nov 2026): whose reviews and goals a level reaches (the Performance reviews screen needs Their team or Everyone). Can change is reviewing: writing
  // the manager's part of a review they are the reviewer of, and running one-on-ones with their people; with Everyone it is running the whole thing (cycles, anyone's
  // review). A person's own review, goals and one-on-ones are always theirs.
  { key: 'reviews', label: 'Performance', group: 'Team', scopes: FULL, actions: [EDIT], live: true,
    blurb: 'Review cycles, goals and one-on-ones: whose they see (Their team or Everyone), and with Can change, reviewing their people. Everyone with Can change runs the cycles. Their own are always theirs.' },
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
  // Licences and tickets (live 23 Nov 2026): whose tickets a level may read (a person's own are always theirs to see and to send in for review). Everyone opens the company-wide
  // Compliance view; Everyone with Can change is the office's part: adding and changing anyone's ticket, the review queue, ticket types, who needs which, and the reminders.
  { key: 'qualifications', label: 'Licences and tickets', group: 'Team', scopes: FULL, actions: [EDIT], live: true,
    blurb: 'Whose licences and tickets they can read (Their team or Everyone; Everyone opens Compliance). With Everyone and Can change: adding and approving tickets, ticket types, requirements and reminders.' },
  { key: 'documents', label: 'Employee documents', group: 'Team', scopes: ['none', 'own', 'all'], actions: [EDIT], live: true,
    blurb: 'The HR paperwork kept on each person; Can change is uploading.' },
  // Contracts (live 23 Nov 2026). A person's own contract is always theirs to read and sign once it has been sent. Everyone is reading anyone's contracts on their page;
  // Everyone with Can change is the office's part: making, sending, withdrawing and emailing contracts and offers. The templates are Company setup; the salary is Sensitive data.
  { key: 'contracts', label: 'Contracts', group: 'Team', scopes: ['none', 'own', 'all'], actions: [EDIT], live: true,
    blurb: 'Contracts and offers of employment. Everyone reads anyone’s on their page; with Can change, making, sending and withdrawing them. Their own is always theirs to read and sign.' },
  // Onboarding and Offboarding (live 23 Nov 2026). A person's own run, and any task given to them, is always theirs. The scope is whose runs they see besides (their team's
  // checklist, as a manager does, or everyone's). Everyone with Can change is the office's part: starting, changing and cancelling a run and its tasks, and for a departure
  // the reason, final pay and rehire notes, which nobody else sees. The templates are the Hiring area's.
  { key: 'onboarding', label: 'Onboarding', group: 'Team', scopes: FULL, actions: [EDIT], live: true,
    blurb: 'New starters’ checklists and induction: whose they see (Their team or Everyone), and with Everyone and Can change, starting and changing them. Their own is always theirs.' },
  { key: 'offboarding', label: 'Offboarding', group: 'Team', scopes: FULL, actions: [EDIT], live: true,
    blurb: 'Departures: whose checklist they see (Their team or Everyone), and with Everyone and Can change, starting one and its reason, final pay and rehire notes. Their own is always theirs.' },
  { key: 'hiring', label: 'Hiring and employee types', group: 'Team', scopes: COMPANY, actions: [EDIT], live: true,
    scopeLabels: { all: 'Yes' }, blurb: 'The Hire board, starter packs, employee types, and the onboarding and offboarding templates.' },
  // The Field view (ACC-358): whether a phone opens the app as the field app for people on the tools (Home, Job card, Safety, My week, More) or as the
  // full app laid out for a small screen (managers and office staff). A company-wide yes or no on the level; a device can still choose the other
  // (More, or the account menu). Live from the start: the standard Employee and Mechanic levels have it, Manager and Admin do not.
  // `free`: it opens no records and lets nobody do anything, so it is left out of "nobody can hand out more than they hold" (an admin without it still sets it).
  { key: 'field_view', label: 'Uses the Field view', group: 'Team', scopes: COMPANY, actions: [], live: true, free: true,
    scopeLabels: { all: 'Yes' }, blurb: 'On a phone, the field app for people on the tools (Home, Job card, Safety, My week, More) instead of the full app laid out for a small screen. Any device can still switch to the other under More or the account menu.' },
  // Reports (live 23 Nov 2026): whose figures the reports cover. Their team is themselves and the people they manage; Everyone is the whole company, and is what the
  // company-wide reports (expenses, incidents, corrective actions, intercompany hours) need. The plant report follows workshop access.
  { key: 'reports', label: 'Reports', group: 'Team', scopes: ['none', 'team', 'all'], actions: [], live: true,
    blurb: 'Headcount, leave, hours and compliance reports: for their team, or for everyone. The expense, incident and intercompany reports need Everyone.' },

  // Live since 6 Nov 2026 (ACC-375). Their own is My schedule only (their published days); Their team is the board for the people they manage and the jobs they
  // lead; Everyone is the whole board. Can change is planning and publishing; someone who plans everyone also renames tags and pins jobs to everyone's board.
  { key: 'schedule', label: 'Schedule', group: 'Operations', scopes: FULL, actions: [EDIT], live: true,
    blurb: 'Who is working on which job each day. Their own is My schedule; Their team is the board for the people they manage and the jobs they lead; Everyone is the whole board. Can change is planning and publishing.' },
  // The Whole-day schedule (20 Nov 2026): a read-only list of where everyone is working on a day that has been published, for the people on the tools ("the boys onsite can see where
  // everyone is working"). A company-wide yes or no with no ticks: the published jobs and who and what is on them, and never leave or a day off. Live from the start, so a level decides it.
  // Managers, admins and owners already see all of it on the board, so they start with it; staff and mechanics start without it until a level is set.
  { key: 'schedule_day', label: 'Whole-day schedule', group: 'Operations', scopes: COMPANY, actions: [], live: true,
    scopeLabels: { all: 'Yes' }, blurb: 'Seeing where everyone is working on a day, read only: each published job and who and what is on it. Leave and days off are never shown. It is separate from Schedule, which is planning the board and seeing your own days.' },
  // Bookings (20 Nov 2026): one person booked for a start time and a duration, several a day (a surveyor's calendar), optionally linked to a job. Their own is
  // the bookings made for them or by them; Everyone is every booking and every bookable person's calendar. Can book others is making, changing and cancelling
  // bookings. Live from the start, so a level decides it. Managers, admins and owners start with everything; staff and mechanics start without it.
  { key: 'bookings', label: 'Bookings', group: 'Operations', scopes: ['none', 'own', 'all'], actions: [BOOK_OTHERS], live: true,
    blurb: 'Timed bookings for a person, several a day, each with a start time and how long it takes. Their own is the bookings made for them or by them; Everyone is every booking. Can book others is making, changing and cancelling them.' },
  // Who can be booked: a yes or no with no ticks. Only the people whose level says Yes are offered in the booking form and have a booking calendar; they can move
  // or decline a booking made for them and say it is done. `free` like the Field view: it opens no one else's records, so an admin without it still sets it.
  { key: 'takes_bookings', label: 'Takes bookings', group: 'Operations', scopes: COMPANY, actions: [], live: true, free: true,
    scopeLabels: { all: 'Yes' }, blurb: 'Can be booked: these people are offered in the booking form and have a booking calendar. They see the bookings made for them, and can move one, decline it with a reason or mark it done.' },
  // Tasks (26 Nov 2026): things for a driver to do on a day (pick up a pit, take a fuel cell to a yard), put on the driver's day by the office and ticked off on the driver's phone.
  // Their own is the driver's: their own tasks once the day has been published to them, and finishing them. Everyone is the office's: every task and the board, and Can plan tasks is
  // making, changing, moving, cancelling and finishing them. Live from the start, so a level decides it. Managers, admins and owners start with everything; staff and mechanics without.
  { key: 'tasks', label: 'Tasks', group: 'Operations', scopes: ['none', 'own', 'all'], actions: [PLAN_TASKS], live: true,
    blurb: 'Tasks for drivers: things to pick up and take somewhere, put on a driver’s day and ticked off on their phone. Their own is the driver’s: their own tasks and finishing them. Everyone is every task and the board; Can plan tasks is making and moving them.' },
  // Who can be given a task: a yes or no with no ticks. The people whose level says Yes are the drivers: each has a lane on the schedule and a column on the Tasks board, and can be
  // given tasks. `free` like Takes bookings: it opens no one else's records, so an admin without it still sets it.
  { key: 'takes_tasks', label: 'Takes tasks', group: 'Operations', scopes: COMPANY, actions: [], live: true, free: true,
    scopeLabels: { all: 'Yes' }, blurb: 'Can be given tasks: these people are the drivers. Each has a lane on the schedule and a column on the Tasks board, and sees the tasks put on their day (once the day is published) with a Done button.' },
  // Jobs (live 23 Nov 2026): Yes opens the Jobs screen. Choosing a job for their own time, a purchase order or a booking needs no area: everyone has the job list.
  // Can change is who leads a job and whether its time counts as productive; Can copy is the Copy quote and Copy job tools, which write to simPRO.
  { key: 'jobs', label: 'Jobs', group: 'Operations', scopes: COMPANY, actions: [EDIT, COPY_JOBS], live: true,
    scopeLabels: { all: 'Yes' }, blurb: 'The Jobs screen: open simPRO jobs, sections and cost centres. Can change is the team leaders, the project manager set here, and whether a job’s time counts as productive. Can copy is Copy quote and Copy job. Everyone can still choose a job on their own time.' },
  { key: 'purchase_orders', label: 'Purchase orders', group: 'Operations', scopes: ['none', 'own', 'all'], actions: [RAISE], live: true,
    blurb: 'simPRO purchase order numbers: whose they can see, and whether they can raise one.' },
  // Assets (live 23 Nov 2026): whose tools and equipment a level sees (what a person holds themselves is always theirs). Everyone is the whole register, unissued items
  // and plant included; with Can change it is the office's part: adding, changing, issuing, transferring and taking back. Plant is also the workshop's.
  { key: 'assets', label: 'Assets', group: 'Operations', scopes: FULL, actions: [EDIT], live: true,
    blurb: 'Tools and equipment issued to people: whose they see (Their team or Everyone, which is the whole register). Everyone with Can change adds, changes, issues and transfers them. Also the ute checks on the utes in reach (Can change: choosing a ute’s checklist and checking any ute in reach).' },
  // Workshop and plant (live 23 Nov 2026): Yes sees the workshop (plant, the maintenance matrix, work orders, defects, parts, the plant reports and every ute's checks);
  // Can change does its work. Mechanics and admins as standard; a manager has neither.
  { key: 'workshop', label: 'Workshop and plant', group: 'Operations', scopes: COMPANY, actions: [EDIT], live: true,
    scopeLabels: { all: 'Yes' }, blurb: 'Plant, work orders, defects, parts and servicing.' },
  // Safety and WHS (live 23 Nov 2026). There is no None: everyone can always report a hazard or an incident, read the hazard register and see what they reported. The
  // scope is whose incidents they see, and the names on them; Can change is editing, investigating and closing, corrective actions, and (with Everyone) the summary.
  { key: 'whs', label: 'Safety and WHS', group: 'Operations', scopes: ['own', 'team', 'all'], actions: [EDIT], live: true,
    blurb: 'Incidents, hazards, investigations and corrective actions. Everyone can report and can read the hazard register; this is whose incidents they see, and (Can change) investigating, closing and corrective actions.' },
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
  // A new capability, so nobody had it before: admins and owners start with it (Adam, 17 Nov 2026: the office back-fills missing hours in AccurateHR, not in simPRO);
  // managers, staff and mechanics start without it, and a level can give a manager Their team.
  time_for_others: rolesGrant(NONE, NONE, G('all', 'edit')),
  expenses: rolesGrant(G('own'), G('team', 'approve'), G('all', 'edit', 'approve')),
  // Staff see their own; managers see and approve their team's; admins and owners also choose who carries which allowance and which jobs do.
  allowances: rolesGrant(G('own'), G('team', 'approve'), G('all', 'edit', 'approve')),
  reviews: rolesGrant(G('own'), G('team', 'edit'), G('all', 'edit')),
  // A new area has to start on for chat to work at all: everyone can send, admins can also moderate.
  chat: rolesGrant(G('all', 'edit'), G('all', 'edit'), G('all', 'edit', 'approve')),
  // Off for staff and mechanics (a tech asks the office to save it), on for managers, admins and owners.
  chat_save: rolesGrant(NONE, G('all', 'edit'), G('all', 'edit')),
  chat_groups: rolesGrant(NONE, G('all', 'edit'), G('all', 'edit')),
  qualifications: rolesGrant(G('own'), G('team'), G('all', 'edit')),
  documents: rolesGrant(G('own'), G('own'), G('all', 'edit')),
  contracts: rolesGrant(G('own'), G('own'), G('all', 'edit')),
  onboarding: rolesGrant(G('own'), G('team'), G('all', 'edit')),
  offboarding: rolesGrant(G('own'), G('team'), G('all', 'edit')),
  hiring: rolesGrant(NONE, NONE, G('all', 'edit')),
  reports: rolesGrant(NONE, G('team'), G('all')),
  // The Field view is for people on the tools: on for the standard Employee and Mechanic levels, off for Manager, Admin and Owner (the full app on a phone).
  field_view: rolesGrant(G('all'), NONE, NONE),
  // Adam's decision when the area went live (6 Nov 2026, ACC-375): anyone from Manager up has the whole board and everything on it. The built-in Manager level
  // used to plan their own team only; a level set to Their team still does.
  schedule: rolesGrant(G('own'), G('all', 'edit'), G('all', 'edit')),
  // A new capability: managers, admins and owners already see every published day on the board, so they start with it; staff and mechanics start without it.
  schedule_day: rolesGrant(NONE, G('all'), G('all')),
  // New capabilities (20 Nov 2026): from Manager up, everyone's bookings and booking others; nobody takes bookings until a level says so.
  bookings: rolesGrant(NONE, G('all', 'edit'), G('all', 'edit')),
  takes_bookings: rolesGrant(NONE, NONE, NONE),
  // New capabilities (26 Nov 2026): from Manager up, every task and planning them; nobody takes tasks until a level says so.
  tasks: rolesGrant(NONE, G('all', 'edit'), G('all', 'edit')),
  takes_tasks: rolesGrant(NONE, NONE, NONE),
  jobs: rolesGrant(NONE, G('all', 'approve'), G('all', 'edit', 'approve')),
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
