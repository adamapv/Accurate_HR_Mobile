// Holds the shared logic to what was copied: `npm run check:shared` (part of `npm run check`).
// shared/ and src/theme/tokens.ts come from the AccurateHR repo (`npm run sync:shared`) and are never edited here: a rule changed in this repo alone would make the
// app and the web app disagree. This fails when a file differs from the SHA-256 recorded in shared/SOURCE.json, when one is missing or extra, or when a shared file
// imports something that was not copied. With `-- <path to AccurateHR>` (or ACCURATEHR_REPO) it also says which files have moved on there since the copy.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { SHARED } from './shared-list.mjs';

const root = resolve(import.meta.dirname, '..');
const sha = text => createHash('sha256').update(text).digest('hex');
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

const source = JSON.parse(readFileSync(join(root, 'shared', 'SOURCE.json'), 'utf8'));
check(/^[0-9a-f]{40}$/.test(source.commit), `the copy records the AccurateHR commit it came from (${String(source.commit).slice(0, 7)})`);
const expected = [...SHARED, '../src/theme/tokens.ts'];
check(expected.every(n => n in source.files) && Object.keys(source.files).length === expected.length, 'every file in scripts/shared-list.mjs was copied, and nothing else');
const changed = expected.filter(n => !existsSync(join(root, 'shared', n)) || sha(readFileSync(join(root, 'shared', n), 'utf8')) !== source.files[n]);
check(!changed.length, `no copied file has been edited here${changed.length ? ` (changed: ${changed.join(', ')}; change it in AccurateHR and run npm run sync:shared)` : ''}`);
const extra = readdirSync(join(root, 'shared')).filter(n => n !== 'SOURCE.json' && !SHARED.includes(n));
check(!extra.length, `shared/ holds only copied files${extra.length ? ` (extra: ${extra.join(', ')})` : ''}`);
const loose = [];
for (const name of SHARED) {
  if (!existsSync(join(root, 'shared', name))) continue;
  const text = readFileSync(join(root, 'shared', name), 'utf8');
  for (const m of text.matchAll(/from '([^']+)'/g)) if (!/^\.\/[\w-]+\.js$/.test(m[1]) || !SHARED.includes(m[1].slice(2))) loose.push(`${name} → ${m[1]}`);
  if (/(?<![.\w'"`])(window|document|localStorage|sessionStorage)\.\w/.test(text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''))) loose.push(`${name} reads the page or its storage`);
}
check(!loose.length, `the shared files import only each other and never read a web page${loose.length ? ` (${loose.join('; ')})` : ''}`);

const repo = process.argv[2] || process.env.ACCURATEHR_REPO;
if (repo) {
  const moved = SHARED.filter(n => !existsSync(join(repo, 'public', n)) || sha(readFileSync(join(repo, 'public', n), 'utf8')) !== source.files[n]);
  console.log(moved.length ? `\nMoved on in AccurateHR since the copy: ${moved.join(', ')}. Run npm run sync:shared -- ${repo}, then npm run check.` : '\nAccurateHR has not changed these files since the copy.');
}
console.log(failures ? `\n${failures} failed` : '\nAll shared file checks passed');
process.exit(failures ? 1 : 0);
