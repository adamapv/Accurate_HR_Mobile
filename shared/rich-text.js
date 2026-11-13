// Rich text for policies and contracts. Shared by the Worker and the browser (like pay-rules.js), so what is kept is written
// once and tested once (scripts/test-rich-text.mjs).
//
// What is stored is a small fixed set of HTML: paragraphs, two heading sizes, bold, italic, underline, links, line breaks, and
// bullet or numbered lists that can nest. sanitizeRich() is the only thing that makes it. It reads whatever it is given (the
// editor's own markup, a page pasted from Word or Google Docs, or something hostile) and writes that set out again from
// scratch: a tag or attribute it does not know is never copied, so there is no list of bad things to keep up to date. The
// Worker runs it on every write, and the browser runs it again before showing anything, so text that reached the database
// some other way is still harmless. It never throws, and it keeps working on deeply nested or very large input.
//
// Text colour is kept as <span style="color:#rrggbb">, from a font tag, a style or a class in what was pasted, or from the editor's colour
// picker. It is only ever a six-digit hex colour the cleaner worked out itself (never the source's own text), and black, white and
// anything very near them are dropped, so a document pasted from Word follows the app's light or dark text instead of fixing black on dark.
// A page break is kept as <hr class="pb"> between blocks: from the editor's Page break button, or from Word's own (a paragraph or line break that
// starts a new page). It prints as a new page and shows as a dashed line; an email ignores it.
// Indents are kept as four levels (class="i1" to "i4" on a paragraph or heading), worked out from the margins in whatever was pasted,
// including the class styles in the <style> block that Word sends along with its HTML. Tables are kept as plain tables: rows, cells,
// header cells and merged cells, each cell holding text (and lists).
//
// Text written before the editor existed is plain text with line breaks. isRichText() tells the two apart (everything
// sanitizeRich writes starts with a block tag); plain text is shown as it always was, and turned into paragraphs
// (plainToRich) only when someone edits it or a contract is made from it.

export const RICH_INPUT_MAX = 1000000;   // sanitizeRich reads no more than this
const DEPTH_MAX = 48;                    // how deep the tags it reads may nest
const CSS_MAX = 300000;                  // how much of the <style> blocks it reads
const INDENT_MAX = 4, INDENT_PT = 36;    // indent levels, and how far one is (a Word tab stop)
const TABLE_MAX_CELLS = 2000;

const NAMED = Object.assign(Object.create(null), {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ', shy: '', zwnj: '', zwj: '',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„',
  hellip: '…', bull: '•', middot: '·', copy: '©', reg: '®', trade: '™', deg: '°', plusmn: '±',
  times: '×', divide: '÷', laquo: '«', raquo: '»', euro: '€', pound: '£', cent: '¢', yen: '¥',
  sect: '§', para: '¶', frac12: '½', frac14: '¼', frac34: '¾', micro: 'µ', iexcl: '¡', iquest: '¿',
});
const decode = s => s.indexOf('&') < 0 ? s : s.replace(/&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,31}));/g, (whole, dec, hex, name) => {
  if (name) return name in NAMED ? NAMED[name] : whole;
  const cp = dec ? parseInt(dec, 10) : parseInt(hex, 16);
  return cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : '�';
});
export const escapeHtml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = s => escapeHtml(s).replace(/"/g, '&quot;');
// Control characters and the zero-width ones Google Docs sprinkles in.
const JUNK = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‍⁠﻿]/g;

// ---- reading: HTML text to a forgiving tree ----
const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'param', 'source', 'track', 'wbr']);
// Elements that are dropped with everything inside them.
const DROP = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript', 'plaintext', 'xml', 'template',
  'object', 'applet', 'svg', 'math', 'canvas', 'audio', 'video', 'select', 'frameset', 'frame']);
const RE_NAME = /<([A-Za-z][^\s/>]*)/y, RE_SKIP = /[\s/]*/y, RE_ATTR = /[^\s/>=]+/y, RE_EQ = /\s*=\s*/y, RE_UNQ = /[^\s>]*/y, RE_CLOSE = /<\/([A-Za-z][^\s/>]*)[^>]*/y;

function readTag(src, i) {
  RE_NAME.lastIndex = i;
  const m = RE_NAME.exec(src);
  const tag = m[1].toLowerCase();
  let p = RE_NAME.lastIndex;
  const attrs = Object.create(null);
  for (;;) {
    RE_SKIP.lastIndex = p; RE_SKIP.exec(src); p = RE_SKIP.lastIndex;
    if (p >= src.length) break;
    if (src[p] === '>') { p++; break; }
    RE_ATTR.lastIndex = p;
    const a = RE_ATTR.exec(src);
    if (!a) { p++; continue; }
    p = RE_ATTR.lastIndex;
    const name = a[0].toLowerCase();
    let value = '';
    RE_EQ.lastIndex = p;
    if (RE_EQ.exec(src)) {
      p = RE_EQ.lastIndex;
      const q = src[p];
      if (q === '"' || q === "'") {
        const end = src.indexOf(q, p + 1);
        value = src.slice(p + 1, end < 0 ? src.length : end); p = end < 0 ? src.length : end + 1;
      } else { RE_UNQ.lastIndex = p; value = RE_UNQ.exec(src)[0]; p = RE_UNQ.lastIndex; }
    }
    // Only these are ever looked at. The first of a repeated attribute wins, as in a browser.
    if ((name === 'style' || name === 'href' || name === 'class' || name === 'colspan' || name === 'rowspan' || name === 'color') && !(name in attrs)) attrs[name] = decode(value);
  }
  return { tag, attrs, end: p };
}

function parse(src) {
  const root = { tag: '#root', attrs: {}, kids: [], css: '' };
  const stack = [root];
  const add = node => stack[stack.length - 1].kids.push(node);
  const n = src.length;
  let i = 0;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { add(decode(src.slice(i))); break; }
    if (lt > i) add(decode(src.slice(i, lt)));
    i = lt;
    const c = src[i + 1];
    if (src.startsWith('<!--', i)) { const end = src.indexOf('-->', i + 4); i = end < 0 ? n : end + 3; continue; }
    // <!doctype>, <![if !supportLists]>, <?xml ?> and a stray </ : dropped up to the next >.
    if (c === '!' || c === '?' || (c === '/' && !/[A-Za-z]/.test(src[i + 2] || ''))) { const end = src.indexOf('>', i + 2); i = end < 0 ? n : end + 1; continue; }
    if (c === '/') {
      RE_CLOSE.lastIndex = i;
      const m = RE_CLOSE.exec(src);
      i = RE_CLOSE.lastIndex < n ? RE_CLOSE.lastIndex + 1 : n;
      const name = m[1].toLowerCase();
      for (let j = stack.length - 1; j >= 1; j--) if (stack[j].tag === name) { stack.length = j; break; }
      continue;
    }
    if (!/[A-Za-z]/.test(c || '')) { add('<'); i++; continue; }   // a lone < is just text
    const { tag, attrs, end } = readTag(src, i);
    i = end;
    if (DROP.has(tag)) {
      const close = new RegExp(`</${tag}[\\s/>]`, 'gi');
      close.lastIndex = i;
      const m = close.exec(src);
      if (tag === 'style' && root.css.length < CSS_MAX) root.css += `${src.slice(i, Math.min(m ? m.index : n, i + CSS_MAX - root.css.length))}\n`;   // read for its indents, below
      if (!m) { i = n; continue; }
      const gt = src.indexOf('>', m.index);
      i = gt < 0 ? n : gt + 1;
      continue;
    }
    if (VOID.has(tag)) { if (tag === 'br' || tag === 'hr') add({ tag, attrs, kids: [] }); continue; }
    if (tag === 'li') {   // a new <li> ends the one before it
      for (let j = stack.length - 1; j >= 1 && stack[j].tag !== 'ul' && stack[j].tag !== 'ol'; j--) if (stack[j].tag === 'li') { stack.length = j; break; }
    }
    if (tag === 'td' || tag === 'th') {   // a new cell ends the one before it, a new row ends the row before it
      for (let j = stack.length - 1; j >= 1 && stack[j].tag !== 'tr' && stack[j].tag !== 'table'; j--) if (stack[j].tag === 'td' || stack[j].tag === 'th') { stack.length = j; break; }
    }
    if (tag === 'tr') {
      for (let j = stack.length - 1; j >= 1 && stack[j].tag !== 'table'; j--) if (stack[j].tag === 'tr') { stack.length = j; break; }
    }
    if (stack.length >= DEPTH_MAX) continue;   // too deep: the tag is ignored, what is inside it still counts
    const node = { tag, attrs, kids: [] };
    add(node);
    stack.push(node);
  }
  return root;
}

// ---- writing: the tree to the fixed set ----
const HEADING = { h1: 'h2', h2: 'h2', h3: 'h3', h4: 'h3', h5: 'h3', h6: 'h3' };
const BLOCK = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'aside', 'main', 'nav', 'address', 'pre', 'blockquote', 'figure', 'figcaption',
  'center', 'form', 'fieldset', 'legend', 'details', 'summary', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'dl', 'dt', 'dd', 'li',
  'body', 'html', 'hgroup', 'menu', 'dir']);

// The class styles in a <style> block (Word sends its whole style sheet along with what is copied): only plain "tag", ".class" and
// "tag.class" selectors, and only the properties that matter here. Anything else in it is ignored.
const CSS_KEEP = new Set(['page-break-before', 'break-before', 'margin', 'margin-left', 'text-indent', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'color']);
const SELECTOR = /^\s*([a-zA-Z][a-zA-Z0-9]*)?(?:\.([A-Za-z_][\w-]*))?\s*$/;
// It is read in one pass with indexOf, never with a pattern that can backtrack, so a hostile or broken sheet costs no more than its length.
function parseCss(text) {
  const sheet = { tag: Object.create(null), cls: Object.create(null), tagcls: Object.create(null) };
  const raw = text.replace(/<!--|-->/g, ' '), parts = [];   // with the comments taken out
  let from = 0;
  for (let a = raw.indexOf('/*'); a >= 0; a = raw.indexOf('/*', from)) {
    parts.push(raw.slice(from, a));
    const b = raw.indexOf('*/', a + 2);
    from = b < 0 ? raw.length : b + 2;
  }
  parts.push(raw.slice(from));
  const css = parts.join(' ');
  let pos = 0, closeAt = -1;
  for (let steps = 0; steps < 20000; steps++) {
    const open = css.indexOf('{', pos);
    if (open < 0) break;
    if (closeAt < open) closeAt = css.indexOf('}', open + 1);
    if (closeAt < 0) break;
    const nextOpen = css.indexOf('{', open + 1);
    if (nextOpen >= 0 && nextOpen < closeAt) { pos = open + 1; continue; }   // a block inside a block (@media): its rules are read as they come
    const selectors = css.slice(pos, open), body = css.slice(open + 1, closeAt);
    pos = closeAt + 1;
    const props = Object.create(null);
    let any = false;
    for (const d of body.split(';')) {
      const k = d.indexOf(':');
      const name = k > 0 ? d.slice(0, k).trim().toLowerCase() : '';
      if (CSS_KEEP.has(name)) { props[name] = d.slice(k + 1).trim().toLowerCase().replace(/\s*!important$/, ''); any = true; }
    }
    if (!any) continue;
    for (const sel of selectors.split(',')) {
      const s = SELECTOR.exec(sel);
      if (!s || (!s[1] && !s[2])) continue;
      const tg = s[1] && s[1].toLowerCase(), cl = s[2];
      const bucket = tg && cl ? sheet.tagcls : cl ? sheet.cls : sheet.tag, key = tg && cl ? `${tg}.${cl}` : cl || tg;
      bucket[key] = Object.assign(bucket[key] || Object.create(null), props);
    }
  }
  return sheet;
}
let SHEET = null;   // the sheet of the text being read (the cleaner never waits, so there is never more than one)

// What an element's style says: its tag's and class's rules from the style sheet, then its own style attribute.
function styleOf(el) {
  if (el.st !== undefined) return el.st;
  const inline = el.attrs.style, cls = el.attrs.class, sheet = SHEET;
  let o = null;
  if (sheet && (sheet.tag[el.tag] || cls)) {
    o = Object.assign(Object.create(null), sheet.tag[el.tag]);
    if (cls) for (const c of cls.split(/\s+/)) if (c) Object.assign(o, sheet.cls[c], sheet.tagcls[`${el.tag}.${c}`]);
  }
  if (inline) {
    o = o || Object.create(null);
    for (const part of inline.split(';')) { const k = part.indexOf(':'); if (k > 0) o[part.slice(0, k).trim().toLowerCase()] = part.slice(k + 1).trim().toLowerCase(); }
  }
  el.st = o;
  return o;
}

// A colour as "#rrggbb", or '' for none: from #rgb, #rrggbb, rgb() or one of the colour names Word and the browsers use. Black, white and
// anything very near either (the text's own colour) come back as none, as does anything that is not a colour.
const COLOUR_NAMES = Object.assign(Object.create(null), {
  red: '#ff0000', green: '#008000', blue: '#0000ff', orange: '#ffa500', yellow: '#ffff00', purple: '#800080', pink: '#ffc0cb', brown: '#a52a2a',
  navy: '#000080', teal: '#008080', maroon: '#800000', olive: '#808000', lime: '#00ff00', aqua: '#00ffff', cyan: '#00ffff', fuchsia: '#ff00ff',
  magenta: '#ff00ff', gray: '#808080', grey: '#808080', silver: '#c0c0c0', darkred: '#8b0000', darkblue: '#00008b', darkgreen: '#006400',
  crimson: '#dc143c', coral: '#ff7f50', gold: '#ffd700', indigo: '#4b0082', violet: '#ee82ee', turquoise: '#40e0d0', royalblue: '#4169e1',
  firebrick: '#b22222', orangered: '#ff4500', darkorange: '#ff8c00', dodgerblue: '#1e90ff', seagreen: '#2e8b57', slategray: '#708090',
});
function colourOf(v) {
  const s = String(v ?? '').trim().toLowerCase();
  let m, rgb;
  if ((m = /^#([0-9a-f]{6})$/.exec(s))) rgb = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  else if ((m = /^#([0-9a-f]{3})$/.exec(s))) rgb = [...m[1]].map(c => parseInt(c + c, 16));
  else if ((m = /^rgba?\(\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*(?:[,/]\s*[\d.]+%?\s*)?\)$/.exec(s))) rgb = [+m[1], +m[2], +m[3]];
  else if (s in COLOUR_NAMES) rgb = [1, 3, 5].map(i => parseInt(COLOUR_NAMES[s].slice(i, i + 2), 16));
  else return '';
  if (rgb.some(n => n > 255)) return '';
  if (Math.max(...rgb) <= 0x40 || Math.min(...rgb) >= 0xd0) return '';
  return `#${rgb.map(n => n.toString(16).padStart(2, '0')).join('')}`;
}

// How far in a paragraph sits, as 0 to 4 levels. A hanging indent (Word's "(a)" items: the number out at the margin, the words in)
// counts from where its first line starts.
const POINTS = { pt: 1, px: 0.75, cm: 28.346, mm: 2.8346, in: 72, pc: 12, em: 12, rem: 12 };
function points(v) {
  const m = /^(-?\d*\.?\d+)\s*([a-z]*)$/.exec(String(v || '').trim());
  if (!m) return 0;
  return m[2] in POINTS ? +m[1] * POINTS[m[2]] : 0;
}
function leftMargin(st) {
  if (st['margin-left']) return points(st['margin-left']);
  if (!st.margin) return 0;
  const t = st.margin.split(/\s+/);
  return points(t.length === 4 ? t[3] : t.length === 1 ? t[0] : t[1]);
}
function indentOf(el, st) {
  const own = /(?:^|\s)i([1-4])(?:\s|$)/.exec(el.attrs.class || '');   // what this editor writes
  if (own) return +own[1];
  if (!st) return 0;
  const start = leftMargin(st) + Math.min(points(st['text-indent']), 0);
  return Math.max(0, Math.min(INDENT_MAX, Math.round(start / INDENT_PT)));
}

// Only absolute web, mail and phone links survive. The check is on what the text starts with, so a scheme hidden behind
// whitespace or odd casing (java\nscript:, JaVaScRiPt:) simply does not match.
function safeHref(v) {
  const s = String(v || '').trim();
  if (!/^(?:https?:\/\/[^\s/]|mailto:.|tel:.)/i.test(s) || s.length > 2000) return '';
  return s.replace(/[\u0000-\u001f\u007f]/g, '').replace(/ /g, '%20');
}

function nextFmt(el, f, st) {
  let { b, i, u, href, color } = f;
  const t = el.tag;
  if (t === 'b' || t === 'strong') b = true;
  if (t === 'i' || t === 'em' || t === 'cite' || t === 'dfn' || t === 'var') i = true;
  if (t === 'u' || t === 'ins') u = true;
  if (st) {
    // Google Docs wraps a whole page in <b style="font-weight:normal">, so what the style says beats what the tag says.
    const w = st['font-weight'], s = st['font-style'], d = st['text-decoration-line'] || st['text-decoration'];
    if (w && w !== 'inherit' && !HEADING[t]) b = /^(?:bold|bolder|[6-9]\d\d)$/.test(w);
    if (s && s !== 'inherit') i = /^(?:italic|oblique)/.test(s);
    if (d && /underline/.test(d)) u = true;
    if (st.color && st.color !== 'inherit') color = colourOf(st.color);   // a colour of black or white, or none at all, ends a colour above it
  }
  if (t === 'font' && el.attrs.color) color = colourOf(el.attrs.color);
  if (t === 'a') { const h = safeHref(el.attrs.href); if (h) href = h; }
  return b === f.b && i === f.i && u === f.u && href === f.href && color === f.color ? f : { b, i, u, href, color };
}
const sameFmt = (a, b) => a.b === b.b && a.i === b.i && a.u === b.u && a.href === b.href && a.color === b.color;

// A run is the inline content of one block: text pieces (each with its formatting) and line breaks.
function addText(run, raw, f) {
  let t = raw.replace(JUNK, '').replace(/\s+/g, ' ');
  const last = run[run.length - 1];
  if (t[0] === ' ' && (!last || last.br || last.t.endsWith(' '))) t = t.slice(1);
  if (!t) return;
  if (last && !last.br && sameFmt(last.f, f)) last.t += t; else run.push({ t, f });
}
function addBreak(run) {
  const last = run[run.length - 1];
  if (last && !last.br) { last.t = last.t.replace(/ $/, ''); if (!last.t) run.pop(); }
  run.push({ br: true });
}
function runHtml(run) {
  let s = 0, e = run.length;
  while (s < e && run[s].br) s++;
  while (e > s && (run[e - 1].br || !run[e - 1].t.trim())) e--;
  let html = '';
  for (let k = s; k < e; k++) {
    const g = run[k];
    if (g.br) { html += '<br>'; continue; }
    let h = escapeHtml(k === e - 1 ? g.t.replace(/ $/, '') : g.t);
    if (g.f.u) h = `<u>${h}</u>`;
    if (g.f.i) h = `<em>${h}</em>`;
    if (g.f.b) h = `<strong>${h}</strong>`;
    if (g.f.color) h = `<span style="color:${g.f.color}">${h}</span>`;
    if (g.f.href) h = `<a href="${escAttr(g.f.href)}" target="_blank" rel="noopener noreferrer">${h}</a>`;
    html += h;
  }
  return html;
}

const ctx = (block, raw) => ({ run: [], block, raw, ind: 0 });
function flush(c, tag) { const html = runHtml(c.run); c.run = []; if (html) c.block(html, tag, Math.min(c.ind, INDENT_MAX)); }

function textOf(el) { return el.kids.map(k => typeof k === 'string' ? k : textOf(k)).join(''); }
function findIgnored(el) {
  for (const k of el.kids) {
    if (typeof k === 'string') continue;
    const st = styleOf(k);
    if (st && /(?:^|\s)ignore\b/.test(st['mso-list'] || '')) return k;
    const deeper = findIgnored(k);
    if (deeper) return deeper;
  }
  return null;
}

function walk(kids, c, f, tag, depth) {
  for (const k of kids) {
    if (typeof k === 'string') addText(c.run, k, f);
    else if (depth < DEPTH_MAX + 8) element(k, c, f, tag, depth);
  }
}

// What Word puts in front of a numbered paragraph: a number or letter with a full stop or bracket ("1.", "(a)", "iv)"), or a number
// with parts ("6.1"). Anything else ("·", "o", "§", a symbol-font character) is a bullet.
export const PAGE_BREAK = '<hr class="pb">';
const ORDERED_MARKER = /^(?:\(?(?:\d+|[a-zA-Z]{1,6})[.)]|\d+(?:\.\d+)+\.?)$/;

function element(el, c, f, tag, depth) {
  const t = el.tag, st = styleOf(el);
  if (st && (st.display === 'none' || st['mso-hide'] === 'all')) return;
  const mso = (st && st['mso-list']) || '';
  if (/(?:^|\s)ignore\b/.test(mso)) {   // Word's own bullet or number, written as a separate piece of text in front of the paragraph
    if (c.keepMarker) addText(c.run, `${textOf(el).replace(/\s+/g, ' ').trim()} `, f);
    return;
  }
  // Word's page break: a paragraph, line break or span that starts a new page. It is a break before this element (a list inside a list item or a table cell has no room for one).
  const breaks = st && (st['page-break-before'] === 'always' || st['break-before'] === 'page');
  if (breaks && !c.flat) { flush(c, tag); c.raw(PAGE_BREAK); }
  if (t === 'br') { if (!breaks) addBreak(c.run); return; }
  if (t === 'hr') { flush(c, tag); if (/(?:^|\s)pb(?:\s|$)/.test(el.attrs.class || '') && !c.flat) c.raw(PAGE_BREAK); return; }
  if (t === 'ul' || t === 'ol') { flush(c, tag); const html = listHtml(el, f, depth); if (html) c.raw(html); return; }
  // A paragraph Word numbers or bullets. Word uses heading styles for the clauses of a contract ("1. Employer" is a Heading 1, and the
  // text under it often a Heading 2 with the numbering switched off), so a heading with numbering is a paragraph, not a heading.
  const word = (t === 'p' || t === 'div' || HEADING[t]) && /l\d+\s+level(\d+)/i.exec(mso);
  if (word) {
    flush(c, tag);
    const marker = textOf(findIgnored(el) || { kids: [] }).replace(/\s+/g, '');
    const fmt = nextFmt(el, f, st);
    if (ORDERED_MARKER.test(marker)) {
      // The number stays as typed text, so "1. Employer", "6.1" and "(a)" read as they do in Word. As a list it would start again at 1
      // after every paragraph of text between two clauses, and "(a)" would become "a.".
      const was = c.keepMarker, wasInd = c.ind;
      c.keepMarker = true;
      c.ind += indentOf(el, st);
      walk(el.kids, c, fmt, 'p', depth + 1);
      c.keepMarker = was;
      flush(c, 'p');
      c.ind = wasInd;
    } else {
      const it = inlineParts(el.kids, fmt, depth);
      if (it.text || it.subs.length) c.block({ level: +word[1], text: it.text, subs: it.subs }, 'item');
    }
    return;
  }
  if (HEADING[t]) {
    const plain = mso === 'none';   // a heading style with its numbering turned off: Word shows it as text
    const wasInd = c.ind;
    flush(c, tag);
    c.ind += indentOf(el, st);
    walk(el.kids, c, nextFmt(el, f, st), plain ? 'p' : HEADING[t], depth + 1);
    flush(c, plain ? 'p' : HEADING[t]);
    c.ind = wasInd;
    return;
  }
  if (t === 'table' && !c.flat) {   // inside a list item or a table cell there is no room for one: its cells run on as lines
    flush(c, tag);
    const html = tableHtml(el, f, depth);
    if (html) c.raw(html);
    return;
  }
  if (BLOCK.has(t)) {
    const wasInd = c.ind;
    flush(c, tag);
    c.ind += indentOf(el, st);
    walk(el.kids, c, nextFmt(el, f, st), tag, depth + 1);
    flush(c, tag);
    c.ind = wasInd;
    return;
  }
  walk(el.kids, c, nextFmt(el, f, st), tag, depth + 1);   // a span, a font, a tag nobody knows: what is inside it stays
}

// The inline content of one list item, and any lists inside it. Paragraphs inside the item become lines of its text.
function inlineParts(kids, f, depth) {
  const parts = [];
  const c = ctx(html => {
    if (typeof html === 'string') parts.push({ text: html });
    else { if (html.text) parts.push({ text: html.text }); for (const s of html.subs) parts.push({ list: s }); }   // a Word list item inside this one
  }, html => parts.push({ list: html }));
  c.flat = true;
  walk(kids, c, f, 'p', depth + 1);
  flush(c, 'p');
  let text = '';
  const subs = [];
  for (const p of parts) { if (p.list) subs.push(p.list); else text += (text ? '<br>' : '') + p.text; }
  return { text, subs };
}
function itemOf(li, f, depth) {
  const it = inlineParts(li.kids, nextFmt(li, f, styleOf(li)), depth);
  return it.text || it.subs.length ? it : null;
}

function listHtml(el, f, depth) {
  const items = [];
  const add = li => { const it = itemOf(li, f, depth); if (it) items.push(it); };
  for (const k of el.kids) {
    if (typeof k === 'string') { if (k.trim()) add({ tag: 'li', attrs: {}, kids: [k] }); continue; }
    if (k.tag === 'li') add(k);
    else if (k.tag === 'ul' || k.tag === 'ol') {   // Chrome puts a nested list straight inside the list, not inside an item
      const sub = listHtml(k, f, depth + 1);
      if (sub) { if (!items.length) items.push({ text: '', subs: [] }); items[items.length - 1].subs.push(sub); }
    } else add({ tag: 'li', attrs: {}, kids: [k] });
  }
  if (!items.length) return '';
  const tag = el.tag;
  return `<${tag}>${items.map(it => `<li>${it.text}${it.subs.join('')}</li>`).join('')}</${tag}>`;
}

// A table: its rows (in whatever thead, tbody and tfoot they came in), and each row's cells with what they span. A cell holds text,
// with the paragraphs of a cell as lines, and lists.
const span = v => { const n = parseInt(v, 10); return n >= 2 ? Math.min(n, 20) : 0; };
function tableHtml(el, f, depth) {
  const rows = [];
  const collect = nodes => { for (const k of nodes) { if (typeof k === 'string') continue; if (k.tag === 'tr') rows.push(k); else if (k.tag === 'thead' || k.tag === 'tbody' || k.tag === 'tfoot') collect(k.kids); } };
  collect(el.kids);
  const out = [];
  let cells = 0;
  for (const tr of rows) {
    const tds = [];
    for (const k of tr.kids) {
      if (typeof k === 'string' || (k.tag !== 'td' && k.tag !== 'th')) continue;
      if (++cells > TABLE_MAX_CELLS) break;
      const it = inlineParts(k.kids, nextFmt(k, f, styleOf(k)), depth);
      const cs = span(k.attrs.colspan), rs = span(k.attrs.rowspan);
      tds.push(`<${k.tag}${cs ? ` colspan="${cs}"` : ''}${rs ? ` rowspan="${rs}"` : ''}>${it.text}${it.subs.join('')}</${k.tag}>`);
    }
    if (tds.length) out.push(`<tr>${tds.join('')}</tr>`);
    if (cells > TABLE_MAX_CELLS) break;
  }
  return out.length ? `<table><tbody>${out.join('')}</tbody></table>` : '';
}

// Word's bulleted paragraphs arrive flat, each with a level; this nests them.
function wordLists(items) {
  let html = '';
  const stack = [];
  const render = l => `<ul>${l.lis.map(li => `<li>${li.html}${li.sub}</li>`).join('')}</ul>`;
  const close = () => {
    const l = stack.pop(), r = render(l);
    if (stack.length) stack[stack.length - 1].lis[stack[stack.length - 1].lis.length - 1].sub += r; else html += r;
  };
  for (const it of items) {
    while (stack.length && stack[stack.length - 1].level > it.level) close();
    if (!stack.length || stack[stack.length - 1].level < it.level) stack.push({ level: it.level, lis: [] });
    stack[stack.length - 1].lis.push({ html: it.text, sub: it.subs.join('') });
  }
  while (stack.length) close();
  return html;
}

export function sanitizeRich(input) {
  let src = String(input ?? '');
  if (src.length > RICH_INPUT_MAX) src = src.slice(0, RICH_INPUT_MAX);
  // What Word and Google put on the clipboard carries the page around the pasted part. Only the pasted part is read, but its style
  // sheet is in the page's head, so that is read first.
  let headCss = '';
  const a = src.indexOf('<!--StartFragment-->');
  if (a >= 0) {
    headCss = parse(src.slice(0, a)).css;
    const b = src.indexOf('<!--EndFragment-->', a);
    src = src.slice(a + 20, b < 0 ? src.length : b);
  }
  const out = [];
  const c = ctx((h, tag, ind) => out.push(typeof h === 'string' ? `<${tag}${ind ? ` class="i${ind}"` : ''}>${h}</${tag}>` : h), h => out.push(h));
  const tree = parse(src);
  try {
    const css = headCss + tree.css;
    SHEET = css.trim() ? parseCss(css) : null;
    walk(tree.kids, c, { b: false, i: false, u: false, href: '', color: '' }, 'p', 0);
    flush(c, 'p');
  } finally { SHEET = null; }
  let html = '';
  for (let i = 0; i < out.length;) {
    if (typeof out[i] === 'string') { html += out[i++]; continue; }
    let j = i;
    while (j < out.length && typeof out[j] !== 'string') j++;
    html += wordLists(out.slice(i, j));
    i = j;
  }
  return html;
}

// ---- telling the two kinds of text apart, and moving between them ----
export const isRichText = s => typeof s === 'string' && /^\s*<(?:p|h[1-6]|ul|ol|table)[\s>]/i.test(s);

export function plainToRich(text) {
  const paras = String(text ?? '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/).map(p => p.trim()).filter(Boolean);
  return sanitizeRich(paras.map(p => `<p>${p.split('\n').map(l => escapeHtml(l.trim())).join('<br>')}</p>`).join(''));
}
export const toRich = s => isRichText(s) ? sanitizeRich(s) : plainToRich(s);
// What a body says with the markup taken away (to tell an empty one, or to preview it). Plain text comes back as it is.
export function richToText(s) {
  if (!isRichText(s)) return String(s ?? '');
  return decode(String(s).replace(/<\/(?:p|h2|h3|li|tr)>|<br>/g, '\n').replace(/<\/t[dh]>/g, ' ').replace(/<[^>]*>/g, '')).replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

// ---- {{fields}}, in either kind of text ----
const FIELD_PLAIN = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;
// In HTML a field can have a tag through it ({{first_<b>name</b>}}, when someone bolds half of one), so the text between the
// braces is read with its tags taken out. Neither { nor < can be inside, so this reads in a straight line however much text there is.
const FIELD_HTML = /\{\{((?:[^{}<]|<[^>]*>)*?)\}\}/g;
const keyOf = inner => (/^\s*([a-zA-Z][a-zA-Z0-9_]*)\s*$/.exec(inner.replace(/<[^>]*>/g, '')) || [])[1];

export function fieldKeys(body) {
  const text = String(body ?? '');
  const keys = [];
  if (isRichText(text)) for (const m of text.matchAll(FIELD_HTML)) { const k = keyOf(m[1]); if (k) keys.push(k.toLowerCase()); }
  else for (const m of text.matchAll(FIELD_PLAIN)) keys.push(m[1].toLowerCase());
  return [...new Set(keys)];
}

// Fills in the fields that have a value; the rest stay as {{name}} for someone to see (or, with { blanks: true }, are taken out: an email
// has no one to ask). Values go in as text, never as markup, and a line break in one stays a line break.
export function mergeFields(body, values, { blanks = false } = {}) {
  const text = String(body ?? '');
  const has = key => Object.prototype.hasOwnProperty.call(values, key) && values[key] != null && values[key] !== '';
  if (!isRichText(text)) return text.replace(FIELD_PLAIN, (whole, key) => has(key.toLowerCase()) ? String(values[key.toLowerCase()]) : blanks ? '' : whole);
  // A field cut by a tag takes the tag's opening or closing with it, so what comes out is put right again.
  return sanitizeRich(text.replace(FIELD_HTML, (whole, inner) => {
    const k = keyOf(inner)?.toLowerCase();
    if (!k) return whole;
    return has(k) ? escapeHtml(values[k]).replace(/\r?\n/g, '<br>') : blanks ? '' : whole;
  }));
}

// ---- an email's body: the same text, as an email can show it ----
// Email programs ignore style sheets and classes, so what goes in an email carries its styles on each tag, and a table is a real table.

// The blocks of a body (paragraphs, headings, lists, tables), one string each. A body is already in the fixed set, so a block ends where
// its tag closes.
export function richBlocks(html) {
  const text = String(html ?? '');
  const blocks = [];
  let depth = 0, start = 0;
  for (const m of text.matchAll(/<(\/?)(p|h2|h3|ul|ol|table)\b[^>]*>/g)) {
    if (!m[1]) { if (depth === 0) start = m.index; depth++; }
    else if (depth > 0 && --depth === 0) blocks.push(text.slice(start, m.index + m[0].length));
  }
  return blocks;
}

const EMAIL_INDENT_PX = 28;
// A body (or a block of it) with its styles on the tags. The body is cleaned first, so nothing but the fixed set can get through.
export function richToEmail(html) {
  const lists = [];   // the lists open at this point, so a list inside a list is spaced tighter
  return sanitizeRich(html).replace(/<hr class="pb">/g, '').replace(/<(\/?)(p|h2|h3|ul|ol|li|table|td|th|a)((?:\s[^>]*)?)>/g, (whole, close, tag, attrs) => {
    if (close) { if (tag === 'ul' || tag === 'ol') lists.pop(); return whole; }
    const level = +((/ class="i([1-4])"/.exec(attrs) || [])[1] || 0), left = level ? `margin-left:${level * EMAIL_INDENT_PX}px;` : '';
    const spans = (attrs.match(/ (?:colspan|rowspan)="\d+"/g) || []).join('');
    switch (tag) {
      case 'p': return `<p style="margin:0 0 16px;${left}">`;
      case 'h2': return `<h2 style="margin:24px 0 8px;font-size:18px;line-height:1.3;color:#1a1d23;${left}">`;
      case 'h3': return `<h3 style="margin:20px 0 8px;font-size:16px;line-height:1.3;color:#1a1d23;${left}">`;
      case 'ul': case 'ol': { const nested = lists.length > 0; lists.push(tag); return `<${tag} style="margin:${nested ? '4px 0 0' : '0 0 16px'};padding-left:24px;">`; }
      case 'li': return '<li style="margin:0 0 4px;">';
      case 'table': return '<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:0 0 16px;font-size:14px;">';
      case 'td': return `<td${spans} style="border:1px solid #d1d5db;padding:6px 10px;vertical-align:top;">`;
      case 'th': return `<th${spans} style="border:1px solid #d1d5db;padding:6px 10px;vertical-align:top;text-align:left;font-weight:700;background:#f3f4f6;">`;
      default: return `<a${attrs} style="color:#4f46e5;">`;   // a link
    }
  });
}

// The same as plain text, for the part of an email that has no formatting: a blank line between blocks, "• " for a bullet, "1." for a
// number, a table a row to a line with its cells apart, and a link followed by its address.
export function richToPlain(html) {
  const lists = [];
  let text = '';
  const body = sanitizeRich(html).replace(/<a href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (whole, href, inner) => {
    const words = decode(inner.replace(/<[^>]*>/g, '')), url = decode(href);
    return words === url || words === url.replace(/^mailto:|^tel:/, '') ? escapeHtml(words) : `${inner} (${escapeHtml(url)})`;
  }).replace(/<(?!\/?(?:p|h2|h3|ul|ol|li|br|tr|td|th|table)\b)[^>]*>/g, '');   // the tags with no plain-text meaning go (bold, tbody...)
  for (const m of body.matchAll(/<(\/?)(p|h2|h3|ul|ol|li|br|tr|td|th|table)\b[^>]*>|([^<]+)/g)) {
    if (m[3] !== undefined) { text += decode(m[3]); continue; }
    const tag = m[2];
    if (!m[1]) {
      if (tag === 'ul' || tag === 'ol') lists.push({ ordered: tag === 'ol', n: 0 });
      else if (tag === 'li') { const l = lists[lists.length - 1]; if (l) l.n++; text += `\n${'  '.repeat(Math.max(0, lists.length - 1))}${l?.ordered ? `${l.n}. ` : '• '}`; }
      else if (tag === 'br') text += '\n';
    } else if (tag === 'p' || tag === 'h2' || tag === 'h3') text += '\n\n';
    else if (tag === 'ul' || tag === 'ol') { lists.pop(); if (!lists.length) text += '\n\n'; }
    else if (tag === 'tr' || tag === 'table') text += '\n';
    else if (tag === 'td' || tag === 'th') text += '   ';
  }
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
