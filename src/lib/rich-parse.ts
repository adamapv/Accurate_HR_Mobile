// Reads the small fixed set of HTML that AccurateHR keeps for rich text (shared/rich-text.js: sanitizeRich is the only thing that writes it) into a tree the app can
// draw as native text, with nothing from React Native in it so scripts/test-rich.mjs can run it in Node. Always clean with sanitizeRich first: this trusts the set
// (paragraphs, two headings, bold, italic, underline, links, line breaks, lists that nest, a text colour, indents, a page break and plain tables) and drops any tag
// it does not know while keeping its text.

export type Inline = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; href?: string; color?: string };
export type Block =
  | { kind: 'p' | 'h2' | 'h3'; indent: number; runs: Inline[] }
  | { kind: 'list'; ordered: boolean; items: { runs: Inline[]; blocks: Block[] }[] }
  | { kind: 'table'; rows: { header: boolean; blocks: Block[] }[][] }
  | { kind: 'break' };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decode = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
  return ENTITIES[e.toLowerCase()] ?? m;
});

type Node = { tag: string; attrs: Record<string, string>; children: (Node | string)[] };
const VOID = new Set(['br', 'hr']);
function tree(html: string): Node {
  const root: Node = { tag: '', attrs: {}, children: [] };
  const stack = [root];
  const re = /<(\/?)([a-z0-9]+)((?:\s+[a-z-]+(?:="[^"]*")?)*)\s*\/?>|([^<]+)/gi;
  for (const m of html.matchAll(re)) {
    const top = stack[stack.length - 1];
    if (m[4] !== undefined) { top.children.push(decode(m[4])); continue; }
    const tag = m[2].toLowerCase();
    if (m[1]) { const at = stack.map(n => n.tag).lastIndexOf(tag); if (at > 0) stack.length = at; continue; }
    const attrs: Record<string, string> = {};
    for (const a of (m[3] || '').matchAll(/([a-z-]+)(?:="([^"]*)")?/gi)) attrs[a[1].toLowerCase()] = decode(a[2] || '');
    const node: Node = { tag, attrs, children: [] };
    top.children.push(node);
    if (!VOID.has(tag)) stack.push(node);
  }
  return root;
}

const BLOCKS = new Set(['p', 'h2', 'h3', 'ul', 'ol', 'table', 'hr']);
function inline(nodes: (Node | string)[], style: Omit<Inline, 'text'>, out: Inline[]) {
  for (const n of nodes) {
    if (typeof n === 'string') { if (n) out.push({ ...style, text: n }); continue; }
    if (n.tag === 'br') { out.push({ ...style, text: '\n' }); continue; }
    if (BLOCKS.has(n.tag)) continue;   // a list inside a list item is drawn as a block, not as text
    const next = { ...style };
    if (n.tag === 'strong' || n.tag === 'b') next.bold = true;
    else if (n.tag === 'em' || n.tag === 'i') next.italic = true;
    else if (n.tag === 'u') next.underline = true;
    else if (n.tag === 'a' && /^(https?:|mailto:|tel:)/i.test(n.attrs.href || '')) next.href = n.attrs.href;
    else if (n.tag === 'span') { const c = /color:\s*(#[0-9a-f]{6})/i.exec(n.attrs.style || ''); if (c) next.color = c[1]; }
    inline(n.children, next, out);
  }
}
const runsOf = (nodes: (Node | string)[]) => { const out: Inline[] = []; inline(nodes, {}, out); return out; };
function blocks(nodes: (Node | string)[]): Block[] {
  const out: Block[] = [];
  let loose: (Node | string)[] = [];
  const flush = () => { const runs = runsOf(loose); if (runs.some(r => r.text.trim())) out.push({ kind: 'p', indent: 0, runs }); loose = []; };
  for (const n of nodes) {
    if (typeof n === 'string' || !BLOCKS.has(n.tag)) { loose.push(n); continue; }
    flush();
    if (n.tag === 'hr') out.push({ kind: 'break' });
    else if (n.tag === 'p' || n.tag === 'h2' || n.tag === 'h3') out.push({ kind: n.tag, indent: Number(/\bi([1-4])\b/.exec(n.attrs.class || '')?.[1] || 0), runs: runsOf(n.children) });
    else if (n.tag === 'ul' || n.tag === 'ol') out.push({ kind: 'list', ordered: n.tag === 'ol', items: n.children.filter((c): c is Node => typeof c !== 'string' && c.tag === 'li')
      .map(li => ({ runs: runsOf(li.children), blocks: blocks(li.children.filter(c => typeof c !== 'string' && BLOCKS.has(c.tag))) })) });
    else if (n.tag === 'table') {
      const rows: Node[] = [];
      const find = (x: Node) => { for (const c of x.children) if (typeof c !== 'string') { if (c.tag === 'tr') rows.push(c); else find(c); } };
      find(n);
      out.push({ kind: 'table', rows: rows.map(tr => tr.children.filter((c): c is Node => typeof c !== 'string' && (c.tag === 'td' || c.tag === 'th')).map(cell => ({ header: cell.tag === 'th', blocks: blocks(cell.children) }))) });
    }
  }
  flush();
  return out;
}
// The blocks of a cleaned rich text, in order.
export const parseRich = (html: string): Block[] => blocks(tree(String(html ?? '')).children);
