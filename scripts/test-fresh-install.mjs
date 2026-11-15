// Tests the first-start-of-an-install rule (src/lib/fresh-install-core.ts): `node scripts/test-fresh-install.mjs` (Node 22.18+, which runs TypeScript as it is).
import { checkFreshInstall } from '../src/lib/fresh-install-core.ts';

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };
const phone = (platform, marker, broken) => {
  const p = { marker, forgot: 0, platform,
    getMarker: async () => { if (broken) throw new Error('store unavailable'); return p.marker; },
    setMarker: async () => { p.marker = '1'; },
    forgetKept: async () => { p.forgot++; } };
  return p;
};

console.log('\n-- an app put back on an iPhone');
{ const p = phone('ios', null); const fresh = await checkFreshInstall(p);
  check(fresh && p.forgot === 1 && p.marker === '1', 'with no marker, the Keychain is wiped once and the marker is written'); }
{ const p = phone('ios', '1'); const fresh = await checkFreshInstall(p);
  check(!fresh && p.forgot === 0, 'with the marker there, the session is left alone'); }
{ const p = phone('ios', null); await checkFreshInstall(p); const again = await checkFreshInstall(p);
  check(!again && p.forgot === 1, 'the next start is not a fresh install'); }
{ const p = phone('ios', null, true); const fresh = await checkFreshInstall(p);
  check(!fresh && p.forgot === 0, 'if the marker cannot be read, nobody is signed out of a working app'); }

console.log('\n-- Android');
{ const p = phone('android', null); const fresh = await checkFreshInstall(p);
  check(!fresh && p.forgot === 0 && p.marker === null, 'is never touched'); }

console.log(failures ? `\n${failures} failed` : '\nAll fresh install checks passed');
process.exit(failures ? 1 : 0);
