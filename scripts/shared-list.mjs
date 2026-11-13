// The logic the app takes from the AccurateHR repo, as the same files: `npm run sync:shared` copies them and `npm run check:shared` holds them.
// Each is logic only (no React, no page, no storage, no clock of its own) and is tested in AccurateHR's own `npm run check`.
// Add a file here when a screen needs it; every file one of these imports must be in the list too.
export const SHARED = [
  'access.js',        // access levels: can(), the areas
  'pay-rules.js',     // night shifts, the rest period, wall-clock minutes
  'pickers-core.js',  // dates and times as text
  'field-core.js',    // the job card's layout, the clock, which days can be submitted, what needs doing now
  'job-checks.js',    // what holds Start: SWMS sign-ons and start checklists
  'whs-core.js',      // safety reports: the lists, the notifiable-incident steps, what a report opens with, what is sent, a report read back
  'chat-core.js',     // chat: the list, a message's text, how messages are laid out, what sending puts in the outbox
  'offline-queue.js', // the outbox
  'rich-text.js',     // the one cleaner for SWMS and policy text
  'swms.js',          // what a SWMS is made of
  'reading.js',       // Reading & focus settings
  'locale.js',        // a company's state, time zone and regulator
];
