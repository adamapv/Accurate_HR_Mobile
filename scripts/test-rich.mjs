// Tests how the app reads AccurateHR's rich text for drawing (src/lib/rich-parse.ts): `node scripts/test-rich.mjs`. The text is cleaned first by the shared
// sanitizeRich, as the app does, so this also shows that whatever comes in (a script, a style, a tag nobody knows) reaches the screen only as harmless text.
import { parseRich, decode } from '../src/lib/rich-parse.ts';
import { sanitizeRich } from '../shared/rich-text.js';

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };
const read = html => parseRich(sanitizeRich(html));
const text = runs => runs.map(r => r.text).join('');

let b = read('<p>Park <strong>clear</strong> of <em>traffic</em> &amp; <u>sign in</u></p>');
check(b.length === 1 && b[0].kind === 'p' && text(b[0].runs) === 'Park clear of traffic & sign in' && b[0].runs.find(r => r.text === 'clear').bold && b[0].runs.find(r => r.text === 'traffic').italic && b[0].runs.find(r => r.text === 'sign in').underline,
  'a paragraph keeps its bold, italic and underline, and an ampersand reads as one');
b = read('<h2>Scope</h2><h3>Detail</h3><p>One<br>Two</p>');
check(b.map(x => x.kind).join() === 'h2,h3,p' && text(b[2].runs) === 'One\nTwo', 'headings are headings and a line break is a new line');
b = read('<ul><li>Park clear<ul><li>Never on the footpath</li></ul></li><li>Sign in at the <strong>site office</strong></li></ul>');
check(b.length === 1 && b[0].kind === 'list' && !b[0].ordered && b[0].items.length === 2 && text(b[0].items[0].runs) === 'Park clear' && b[0].items[0].blocks[0].kind === 'list' && text(b[0].items[0].blocks[0].items[0].runs) === 'Never on the footpath'
  && b[0].items[1].runs.some(r => r.bold && r.text === 'site office'), 'a bullet under a bullet is a list inside the item, not run into its text');
check(read('<ol><li>First</li><li>Second</li></ol>')[0].ordered === true, 'a numbered list is numbered');
b = read('<p><a href="https://example.test/x">the code</a> and <a href="javascript:alert(1)">not this</a></p>');
check(b[0].runs.find(r => r.text === 'the code').href === 'https://example.test/x' && !b[0].runs.some(r => r.href && /javascript/i.test(r.href)) && text(b[0].runs).includes('not this'), 'a web link is a link; a script link is only its words');
b = read('<table><tr><th>Item</th><th>Control</th></tr><tr><td>Ladders</td><td><ul><li>Inspected</li></ul></td></tr></table>');
check(b[0].kind === 'table' && b[0].rows.length === 2 && b[0].rows[0][0].header && text(b[0].rows[1][0].blocks[0].runs) === 'Ladders' && b[0].rows[1][1].blocks[0].kind === 'list', 'a table is rows of cells, a header cell known as one, each cell holding text or a list');
b = read('<p>Before</p><script>alert(1)</script><p onclick="x()">After <img src=x onerror=alert(1)></p><style>p{color:red}</style>');
check(b.every(x => x.kind === 'p') && !JSON.stringify(b).includes('alert') && !JSON.stringify(b).includes('onclick') && text(b[b.length - 1].runs).trim() === 'After', 'a script, a style block and an event handler never reach the screen');
check(parseRich('<p>Unknown <blink>tag</blink> kept as text</p>')[0].runs.map(r => r.text).join('') === 'Unknown tag kept as text' && parseRich('').length === 0 && parseRich(null).length === 0, 'a tag it does not know is dropped and its words kept; nothing in, nothing out');
check(parseRich('<p class="i2">Indented</p>')[0].indent === 2 && parseRich('<p>x</p><hr class="pb"><p>y</p>').map(x => x.kind).join() === 'p,break,p', 'an indent and a page break are kept');
check(decode('&lt;b&gt; &#39;q&#x27; &nbsp;&unknown;') === "<b> 'q'  &unknown;", 'entities read as their characters');

console.log(failures ? `\n${failures} failed` : '\nAll rich text checks passed');
process.exit(failures ? 1 : 0);
