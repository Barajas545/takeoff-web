// The portal and this app agree on the Plans Archive switch.
//
// The employee portal sends a person here with `#plans=<project number>` once
// the plans have moved to the Plans Archive folder (its takeoff-open.js,
// openPlans), and this app reads that link with parsePlansLink. Two copies of
// one rule in two repositories is how a link quietly stops working, so this
// runs the PORTAL'S OWN takeoff-open.js and plans-library.js — in a sandbox,
// with made-up values — and checks what they produce against this app's
// reader:
//
//   · the portal's default is this app's PLANS_SOURCE (the two switches are
//     flipped the same day), and the switch is on only for "folder";
//   · every link openPlans writes is one parsePlansLink reads back to the
//     same project, and anything that is not a project number opens the
//     whole archive rather than travelling in the address;
//   · with the switch on, the portal's Plans Library refuses to save, update
//     or check anything in SharePoint — before it touches its storage.
//
// It needs a checkout of the portal with that switch in it, so it SKIPS
// without one: set PTT_PORTAL (or PORTAL in tests/config.local.mjs) to the
// portal's folder.
//
// Run: PTT_PORTAL=<dcr-portal folder> node tests/portal-plans-link.mjs
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { PORTAL, skip } from './config.mjs';
import { parsePlansLink } from '../js/core/plans-folder.js';
import { PLANS_SOURCE } from '../js/site-config.js';

const OPEN = PORTAL && path.join(PORTAL, 'takeoff-open.js');
const LIB = PORTAL && path.join(PORTAL, 'plans-library.js');
if (!OPEN || !existsSync(OPEN) || !existsSync(LIB)) skip('no portal checkout to test against');
const openSrc = readFileSync(OPEN, 'utf8');
if (!/openPlans/.test(openSrc)) skip('this portal checkout predates the Plans Archive switch');
const libSrc = readFileSync(LIB, 'utf8');

let fails = 0;
let checks = 0;
function eq(label, got, want) {
  checks += 1;
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) return true;
  fails += 1;
  console.log(`FAIL ${label}\n  got  ${a}\n  want ${b}`);
  return false;
}

/** The portal's scripts in a page of their own: just what they reach for. */
function page(config) {
  const store = new Map();
  const sandbox = {
    location: { href: 'https://example.test/dcr-portal/search.html' },
    sessionStorage: { setItem: (k, v) => store.set(k, v), getItem: k => store.get(k) ?? null },
    localStorage: { setItem: (k, v) => store.set(k, v), getItem: k => store.get(k) ?? null },
    document: { currentScript: null },
    navigator: { onLine: true },
    indexedDB: { open() { touched.push('indexedDB'); throw new Error('storage touched'); } },
    isSecureContext: true,
    DCR: { getToken: () => 'x.eyJzdWIiOiI5OSJ9.y', api: async () => { touched.push('api'); throw new Error('network touched'); } },
    console,
    URL,
    TextDecoder,
    atob,
    setTimeout,
    clearTimeout,
    Promise,
  };
  const touched = [];
  if (config) sandbox.DCR_CONFIG = config;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(openSrc, sandbox, { filename: 'takeoff-open.js' });
  vm.runInContext(libSrc, sandbox, { filename: 'plans-library.js' });
  return { w: sandbox, touched };
}

// ── the switch ───────────────────────────────────────────────────────────
eq(`the default matches this app's (${PLANS_SOURCE})`, page(null).w.DCRTakeoff.plansFromFolder(), PLANS_SOURCE === 'folder');
eq('off for "sharepoint"', page({ PLANS_SOURCE: 'sharepoint' }).w.DCRTakeoff.plansFromFolder(), false);
eq('off for anything else', page({ PLANS_SOURCE: 'Folder ' }).w.DCRTakeoff.plansFromFolder(), false);
eq('on for "folder"', page({ PLANS_SOURCE: 'folder' }).w.DCRTakeoff.plansFromFolder(), true);
eq('the library follows it', [page({ PLANS_SOURCE: 'sharepoint' }).w.DCRPlansLibrary.plansMoved(), page({ PLANS_SOURCE: 'folder' }).w.DCRPlansLibrary.plansMoved(), page(null).w.DCRPlansLibrary.plansMoved()], [false, true, PLANS_SOURCE === 'folder']);

// ── the link, written by the portal, read by this app ────────────────────
for (const [given, code] of [
  ['A249', 'A249'], ['a249', 'A249'], [' A249 ', 'A249'], ['A249-B', 'A249-B'], ['A249–B', 'A249-B'],
  ['A000T1', 'A000T1'], ['A1000', 'A1000'],
  ['', ''], ['Templates', ''], ['A249 - Smith', ''], ['../A249', ''], ['A249/x', ''], ['A12', ''],
  [null, ''], ['<script>', ''],
]) {
  const { w } = page({ PLANS_SOURCE: 'folder', TAKEOFF_URL: '../takeoff-web/' });
  w.DCRTakeoff.openPlans(given);
  const href = w.location.href;
  const hash = href.slice(href.indexOf('#'));
  eq(`openPlans(${JSON.stringify(given)}) lands on the takeoff tool`, href.startsWith('../takeoff-web/index.html#plans'), true);
  eq(`… and this app reads it as ${code || 'the whole archive'}`, parsePlansLink(hash), { code });
}

// The search tile hands openPlans the archive folder's first word.
const first = name => String(name || '').trim().split(/\s+/)[0];
for (const [folder, code] of [['A249', 'A249'], ['A249 - old name', 'A249'], ['A249-B - x', 'A249-B']]) {
  const { w } = page({ PLANS_SOURCE: 'folder' });
  w.DCRTakeoff.openPlans(first(folder));
  eq(`a tile for folder "${folder}" opens ${code}`, parsePlansLink(w.location.href.slice(w.location.href.indexOf('#'))), { code });
}

// ── with the switch on, nothing reaches SharePoint or the device's storage ──
{
  const { w, touched } = page({ PLANS_SOURCE: 'folder' });
  const L = w.DCRPlansLibrary;
  let code = '';
  try { await L.save({ id: '01MADEUP', name: 'Made-up.takeoff' }); } catch (e) { code = e.code; }
  eq('save is refused as moved', code, 'moved');
  code = '';
  try { await L.update('01MADEUP'); } catch (e) { code = e.code; }
  eq('update is refused as moved', code, 'moved');
  eq('the background check does nothing', await L.maybeCheck(), null);
  eq('an asked-for check says why', await L.checkUpdates({}), { checked: 0, moved: true });
  eq('… and none of it touched storage or the network', touched, []);
}
{
  // Off (the portal's config.js set back to "sharepoint", the rollback): the
  // same call goes on to the library's usual checks — here the
  // sandbox has no device storage, so it stops at "unsupported", not "moved".
  const { w } = page({ PLANS_SOURCE: 'sharepoint' });
  let code = '';
  try { await w.DCRPlansLibrary.save({ id: '01MADEUP' }); } catch (e) { code = e.code; }
  eq('with the switch off, save goes on as before', code, 'unsupported');
}

console.log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass — the portal's plan links open this app's Plans Archive`);
process.exit(fails ? 1 : 0);
