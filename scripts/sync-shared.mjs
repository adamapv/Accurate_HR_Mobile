// Copies the shared logic and the colours from a checkout of the AccurateHR repo: `npm run sync:shared -- <path to AccurateHR>` (default: ../AccurateHR, or ACCURATEHR_REPO).
// The app never keeps its own version of a rule the web app has. This copies the files in scripts/shared-list.mjs from AccurateHR's public/ into shared/, writes the
// colours from its tailwind.config.js into src/theme/tokens.ts, and records the commit and each file's SHA-256 in shared/SOURCE.json. `npm run check:shared` then fails
// if anything in shared/ is edited by hand. The checkout must be clean, so the recorded commit really is what was copied.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { SHARED } from './shared-list.mjs';

const root = resolve(import.meta.dirname, '..');
const repo = resolve(process.argv[2] || process.env.ACCURATEHR_REPO || join(root, '..', 'AccurateHR'));
if (!existsSync(join(repo, 'public', 'field-core.js'))) { console.error(`No AccurateHR checkout with public/field-core.js at ${repo}`); process.exit(1); }
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
const dirty = git('status', '--porcelain', '--', 'public', 'tailwind.config.js');
if (dirty) { console.error(`AccurateHR has changes that are not committed:\n${dirty}\nCommit them first, so the recorded commit is what was copied.`); process.exit(1); }
const commit = git('rev-parse', 'HEAD');
const sha = text => createHash('sha256').update(text).digest('hex');

// Every file a shared file imports has to come across too.
const wanted = new Set(SHARED);
for (const name of SHARED) {
  for (const m of readFileSync(join(repo, 'public', name), 'utf8').matchAll(/from '\.\/([\w-]+\.js)'/g)) {
    if (!wanted.has(m[1])) { console.error(`${name} imports ${m[1]}, which is not in scripts/shared-list.mjs`); process.exit(1); }
  }
}
mkdirSync(join(root, 'shared'), { recursive: true });
const files = {};
for (const name of SHARED) {
  const text = readFileSync(join(repo, 'public', name), 'utf8');
  writeFileSync(join(root, 'shared', name), text);
  files[name] = sha(text);
}

// The colours: the web app's Tailwind build puts every colour on :root as a CSS variable, for the dark look and for Sunlight. Ask it for them.
const config = createRequire(import.meta.url)(join(repo, 'tailwind.config.js'));
let base = null;
for (const plugin of config.plugins || []) if (typeof plugin === 'function') plugin({ addBase: b => { base = { ...(base || {}), ...b }; } });
const pick = set => Object.fromEntries(Object.entries(set || {}).filter(([k]) => k.startsWith('--') && !k.endsWith('-rgb')).map(([k, v]) => [k.slice(2).replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase()), v]));
const dark = pick(base?.[':root']), light = pick(base?.[':root[data-theme="light"]']);
if (!dark.accent || !light.accent || Object.keys(dark).join() !== Object.keys(light).join()) { console.error('Could not read the two colour sets from tailwind.config.js'); process.exit(1); }
const lines = o => Object.entries(o).map(([k, v]) => `  ${k}: '${v}',`).join('\n');
const tokens = `// Written by \`npm run sync:shared\` from AccurateHR's tailwind.config.js. Do not edit: change the colours there and sync again.
// \`dark\` is the look the app has always had; \`light\` is Sunlight mode, for bright sun.
export const dark = {
${lines(dark)}
} as const;
export const light = {
${lines(light)}
} as const;
export type Tokens = { readonly [K in keyof typeof dark]: string };
`;
mkdirSync(join(root, 'src', 'theme'), { recursive: true });
writeFileSync(join(root, 'src', 'theme', 'tokens.ts'), tokens);
files['../src/theme/tokens.ts'] = sha(tokens);

writeFileSync(join(root, 'shared', 'SOURCE.json'), JSON.stringify({ repo: 'adamapv/AccurateHR', commit, files }, null, 2) + '\n');
console.log(`Copied ${SHARED.length} files and the colours from AccurateHR at ${commit.slice(0, 7)}.`);
