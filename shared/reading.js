// Reading & focus settings: how the app reads for one person. A dyslexia-friendly or easy-to-read font, bigger text, more space between
// the lines and words, one thing at a time on the front pages, softer colours, a calmer screen with nothing moving, and a reading guide
// that follows the mouse. Nothing here
// is about a role or an access level: every person has them, like Sunlight mode, and they say nothing about anyone else.
//
// The settings are kept with the person (employees.reading_prefs, saved through PUT /me/preferences { reading }), so they follow
// them to every device they sign in on, and a copy sits on the device (localStorage, READING_KEY) only so index.html can apply them
// before the first paint; clearOfflineData() forgets that copy when nobody is signed in, like everything else of the previous person's.
//
// The Worker imports cleanReading to check what is saved, the app imports the rest, and scripts/test-reading.mjs tests both ends
// and that index.html, app.css and the app agree on the names.

// Where the device's copy is kept.
export const READING_KEY = 'hrhead_reading';

// Each setting with a choice, in the order the pop-up shows them: the html attribute that carries it, and the choices with a label
// and a line under it. The first choice is the default, and the default sets no attribute.
export const READING_CHOICES = [
  { key: 'font', attr: 'data-font', label: 'Font', choices: [
    ['standard', 'Standard', 'The app’s usual font'],
    ['easy', 'Easy to read', 'Lexend: wider, plainer letters, made to be read quickly'],
    ['dyslexic', 'Dyslexia-friendly', 'OpenDyslexic: heavier bottoms on each letter, so letters are harder to flip or swap'],
  ] },
  { key: 'size', attr: 'data-text', label: 'Text size', choices: [
    ['normal', 'Normal', ''],
    ['large', 'Larger', 'About an eighth bigger everywhere'],
    ['xl', 'Largest', 'A quarter bigger everywhere'],
  ] },
  { key: 'space', attr: 'data-space', label: 'Spacing', choices: [
    ['normal', 'Normal', ''],
    ['wide', 'Spread out', 'More room between lines, letters and words'],
  ] },
];

// The yes-or-no settings: the html attribute that carries a yes (set to "1"), or none for one the app alone reads.
export const READING_SWITCHES = [
  { key: 'focus', attr: 'data-focus', label: 'One thing at a time', hint: 'The dashboard, the Me tab and Home show what is waiting on you one item at a time, with Skip for now and Show everything, in place of the whole page; the quick-action chips go' },
  { key: 'soft', attr: 'data-soft', label: 'Softer colours', hint: 'Less glare: softer white text on the dark look, and cream in place of white in Sunlight mode' },
  { key: 'calm', attr: 'data-calm', label: 'Calmer screen', hint: 'Nothing slides, fades, pulses or counts up: every screen simply appears' },
  { key: 'ruler', attr: null, label: 'Reading guide', hint: 'On a computer, a tinted band follows your mouse to keep your place on the line' },
];

export const READING_DEFAULTS = Object.freeze({ font: 'standard', size: 'normal', space: 'normal', focus: false, soft: false, calm: false, ruler: false });

const CHOICE_BY_KEY = Object.fromEntries(READING_CHOICES.map(c => [c.key, c]));
const SWITCH_KEYS = new Set(READING_SWITCHES.map(s => s.key));

// What may be saved: null (or nothing chosen) for the standard look; otherwise only the keys above, each choice one on offer and each
// switch a yes or no. Gives back null when everything is the default, the settings that differ from it otherwise, and false for
// anything else (an unknown key, a choice that is not on offer, a switch that is not a yes or no).
export function cleanReading(input) {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'object' || Array.isArray(input)) return false;
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (CHOICE_BY_KEY[k]) {
      if (typeof v !== 'string' || !CHOICE_BY_KEY[k].choices.some(c => c[0] === v)) return false;
      if (v !== READING_DEFAULTS[k]) out[k] = v;
    } else if (SWITCH_KEYS.has(k)) {
      if (typeof v !== 'boolean') return false;
      if (v) out[k] = true;
    } else return false;
  }
  return Object.keys(out).length ? out : null;
}

// The saved text (employees.reading_prefs, JSON or null) or an object as the full set of settings, defaults filled in. Anything
// unreadable is the standard look.
export function parseReading(saved) {
  let v = saved;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  const clean = cleanReading(v);
  return { ...READING_DEFAULTS, ...(clean || {}) };
}

// The html attributes a set of settings puts on the document: only those that differ from the default.
export function readingAttrs(prefs) {
  const p = parseReading(prefs);
  const out = {};
  for (const c of READING_CHOICES) if (p[c.key] !== READING_DEFAULTS[c.key]) out[c.attr] = p[c.key];
  for (const s of READING_SWITCHES) if (s.attr && p[s.key]) out[s.attr] = '1';
  return out;
}

// Puts the settings on the document (the html element): sets what differs from the default and removes the rest, so a setting
// turned off leaves nothing behind.
export function applyReading(root, prefs) {
  if (!root) return;
  const attrs = readingAttrs(prefs);
  for (const name of [...READING_CHOICES.map(c => c.attr), ...READING_SWITCHES.map(s => s.attr).filter(Boolean)]) {
    if (attrs[name]) root.setAttribute(name, attrs[name]); else root.removeAttribute(name);
  }
}

// The order One thing at a time shows a page's rows in: anything overdue (a due date before today) jumps the queue, the most overdue
// first; everything else stays in the order the page's own list gives it (urgent, then to review, then to-dos). `today` is the
// company's own date (localToday in the app), as YYYY-MM-DD like `due`.
export function orderForFocus(items, today) {
  const overdue = i => typeof i?.due === 'string' && i.due < today;
  return [...items].map((i, n) => ({ i, n })).sort((a, b) => {
    const ao = overdue(a.i), bo = overdue(b.i);
    if (ao !== bo) return ao ? -1 : 1;
    if (ao && a.i.due !== b.i.due) return a.i.due < b.i.due ? -1 : 1;
    return a.n - b.n;
  }).map(x => x.i);
}

// Whether anything differs from the standard look.
export const isStandardReading = prefs => cleanReading(typeof prefs === 'string' ? parseReading(prefs) : prefs) === null;
