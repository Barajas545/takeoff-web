// The embedded profile: this app inside the employee portal (js/core/embedded.js).
//
// On a phone or a tablet the portal shows its OWN copy of this app (the same
// files, served from its site at /takeoff/) in a frame over its page, at
// index.html#portal=<nonce>, and the frame's parent is the peer of the
// hand-over. Inside it the portal keeps the plans: no Plans Archive, no Keep
// on This Device, no old-portal list, the portal's words. These check when
// the profile is on (a frame of a page of this site, with the hand-over — and
// never a frame of another site, never a tab of its own), what it changes,
// and what the portal's copy needs of this app's files: no inline script for
// its page policy, the layout boot as a file of its own, no look-behind (see
// tests/modules-parse.mjs), nothing of the portal's storage names.
//
// Run: node tests/embedded.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
  EMBEDDED_KEY, embeddedFrom, detectEmbedded, plansSourceFor, EMBEDDED_PLANS, EMBEDDED_IDLE, EMBEDDED_NO_KEEP,
  EMBEDDED_NO_ARCHIVE, EMBEDDED_NOTHING, TO_ONEDRIVE_HINT, NO_SAVE_BACK, COPY_TO_FILES, DRAFT_OF_ANYONE, noSaveBackWords,
} from '../js/core/embedded.js';
import { portalPeer } from '../js/core/portal-handoff.js';
import { resolvePlansSource } from '../js/core/plans-folder.js';
import { HANDHELD_SAVE, remoteSaveWords } from '../js/core/save-route.js';
import { FROM_THE_PORTAL, HANDHELD_HINT, PORTAL_SAFARI_IF_ASKED, deviceWord } from '../js/core/plans-link.js';
import {
  PORTAL_INDEX_KEY, PORTAL_DIR, PORTAL_DB, PORTAL_TOKEN_KEY, OWNER_KEY, KEPT_INDEX_KEY, KEPT_DIR, OPEN_LOCK, WRITE_LOCK,
} from '../js/core/device-plans.js';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => readFileSync(path.join(APP, rel), 'utf8');

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
const ok = (label, cond) => eq(label, !!cond, true);

// ── the decision ─────────────────────────────────────────────────────────
eq('framed by its own site, handed over now: on', embeddedFrom({ framed: true, handoff: true }), true);
eq('framed by its own site, handed over earlier in this tab (a reload of the frame): on', embeddedFrom({ framed: true, remembered: true }), true);
eq('framed by its own site with nothing handed over: off (a warm-up frame, a page of its own)', embeddedFrom({ framed: true }), false);
eq('not framed by its own site: off, whatever came', [embeddedFrom({ handoff: true }), embeddedFrom({ remembered: true }),
  embeddedFrom({ handoff: true, remembered: true }), embeddedFrom()], [false, false, false, false]);

// ── read off made-up windows ─────────────────────────────────────────────
const PORTAL = 'https://portal.dcrframing.com';
const NONCE = 'Zk3pQ9_x-7LmN2aBcD4e';
function store({ throws = false, initial = {} } = {}) {
  const m = new Map(Object.entries(initial));
  return {
    m,
    getItem: k => { if (throws) throw new Error('SecurityError'); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (throws) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
  };
}
function win({ origin = PORTAL, hash = '', parentOrigin = PORTAL, framed = true, readable = true, opener = null, session = store() } = {}) {
  const w = { location: { origin, hash }, sessionStorage: session, opener };
  if (!framed) w.parent = w;
  else w.parent = readable ? { location: { origin: parentOrigin } } : { get location() { throw new Error('SecurityError'); } };
  return w;
}
{
  const s = store();
  ok('the portal\'s frame at #portal=<nonce>: on', detectEmbedded(win({ hash: `#portal=${NONCE}`, session: s })));
  eq('… and remembered for this tab', s.m.get(EMBEDDED_KEY), '1');
  ok('… so a reload of the same frame (the address consumed) is still inside the portal', detectEmbedded(win({ session: s })));
  eq('a frame of this site that never had a hand-over: off', detectEmbedded(win({ session: store() })), false);
  eq('a malformed hand-over: off', detectEmbedded(win({ hash: '#portal=short', session: store() })), false);
  const cross = store();
  eq('framed by ANOTHER site, with a hand-over: off', detectEmbedded(win({ hash: `#portal=${NONCE}`, readable: false, session: cross })), false);
  eq('… and nothing is remembered', cross.m.size, 0);
  eq('framed by another site whose address could be read: off', detectEmbedded(win({ hash: `#portal=${NONCE}`, parentOrigin: 'https://evil.test' })), false);
  eq('framed by another site, even with this tab\'s memory: off', detectEmbedded(win({ readable: false, session: store({ initial: { [EMBEDDED_KEY]: '1' } }) })), false);
  const opener = { closed: false };
  const tab = win({ origin: 'https://barajas545.github.io', hash: `#portal=${NONCE}`, framed: false, opener });
  eq('a tab the portal opened (a computer): off — the opener path is unchanged', detectEmbedded(tab), false);
  eq('… its peer is still the opener', portalPeer(tab)?.via, 'opener');
  eq('a tab of its own with this tab\'s memory: off', detectEmbedded(win({ framed: false, session: store({ initial: { [EMBEDDED_KEY]: '1' } }) })), false);
  ok('a store that refuses: on all the same while the hand-over is in the address', detectEmbedded(win({ hash: `#portal=${NONCE}`, session: store({ throws: true }) })));
  eq('… and off on a reload (nothing could be remembered)', detectEmbedded(win({ session: store({ throws: true }) })), false);
  eq('an opaque origin (a sandboxed frame): off', detectEmbedded(win({ origin: 'null', parentOrigin: 'null', hash: `#portal=${NONCE}` })), false);
  eq('nothing to ask: off', [detectEmbedded(null), detectEmbedded({})], [false, false]);
  const local = win({ origin: 'http://127.0.0.1:8797', parentOrigin: 'http://127.0.0.1:8797', hash: `#portal=${NONCE}` });
  ok('a page of the same site, whatever the site (a local test page): on — same site is the rule, not the portal\'s name', detectEmbedded(local));
  eq('… its peer is the parent at this page\'s own address', [portalPeer(local).via, portalPeer(local).origin], ['frame', 'http://127.0.0.1:8797']);
}

// ── where plans come from ────────────────────────────────────────────────
eq('inside the portal: always the portal\'s way, whatever Settings or the company say',
  [plansSourceFor({ embedded: true, personal: 'folder', company: 'folder', resolve: resolvePlansSource }),
    plansSourceFor({ embedded: true, resolve: resolvePlansSource })], ['sharepoint', 'sharepoint']);
eq('outside it: as before (Settings, then the company line)',
  [plansSourceFor({ personal: 'sharepoint', company: 'folder', resolve: resolvePlansSource }),
    plansSourceFor({ company: 'folder', resolve: resolvePlansSource }), plansSourceFor({ resolve: resolvePlansSource })],
  ['sharepoint', 'folder', 'sharepoint']);

// ── the words ────────────────────────────────────────────────────────────
for (const [name, words] of Object.entries({ EMBEDDED_PLANS, EMBEDDED_IDLE, EMBEDDED_NO_ARCHIVE, EMBEDDED_NOTHING })) {
  ok(`${name}: plans come from the portal's 📐 menu or its Plans Library, and nobody is sent to Safari`,
    /📐/.test(words) && /Plans Library/.test(words) && !/Safari|home-screen/.test(words));
}
ok('Keep on This Device inside the portal: the Plans Library keeps plans (📐 › Save to this device)',
  /Plans Library/.test(EMBEDDED_NO_KEEP) && /Save to this device/.test(EMBEDDED_NO_KEEP));
// Review fix: a way to OneDrive exists only where the portal lets this person save plans back (its switch on, and
// admin or Sees prices with "Can upload to OneDrive"), and only for a plan it can keep on the device — a plan opened
// over the internet inside the portal means it had no room. So the words say "if", and name the room.
eq('a plan opened over the internet inside the portal: how its work may reach OneDrive, as an "if"', TO_ONEDRIVE_HINT,
  'A plan opened over the internet is not saved back to OneDrive from here. '
  + 'If the portal lets you save plans back, open it again from 📐 when this device has room to keep it: '
  + 'Save then hands it to the portal.');
ok('… never promised outright (the old words were)', !/^To save to OneDrive/.test(TO_ONEDRIVE_HINT) && /\bIf the portal lets you\b/.test(TO_ONEDRIVE_HINT));
ok('… with what Save does here', NO_SAVE_BACK === `${TO_ONEDRIVE_HINT} ${HANDHELD_SAVE}`);
// Review MEM-1: a plan too big for Save to make a file of on a phone or a tablet (its sheets on the server would all
// come into memory) is never promised a new file when it opens.
{
  const MB = 1024 * 1024;
  eq('the words when such a plan opens: NO_SAVE_BACK while Save can make a file of it',
    [noSaveBackWords({ remoteBytes: 120 * MB, device: 'iPad' }), noSaveBackWords({ remoteBytes: 2300 * MB, device: 'iPad', handheld: false })],
    [NO_SAVE_BACK, NO_SAVE_BACK]);
  const big = noSaveBackWords({ remoteBytes: 2300 * MB, device: 'iPad' });
  ok('… and over the cap on a phone or a tablet: the way to OneDrive, then that Save keeps the changes instead — no new file promised',
    big === `${TO_ONEDRIVE_HINT} ${remoteSaveWords({ remoteBytes: 2300 * MB, device: 'iPad' })}` && !big.includes(HANDHELD_SAVE)
    && !/share sheet|download/i.test(big));
}
eq('the fallback\'s button', COPY_TO_FILES, 'Save a copy to Files');
// Review PRICE-4: a draft kept before the portal said who is signed in may be another person's, and "no" keeps it.
ok('a draft of no person is offered with the word that it may be someone else\'s, and that Cancel leaves it',
  /someone else's work/.test(DRAFT_OF_ANYONE) && /Restore it only if it is yours/.test(DRAFT_OF_ANYONE)
  && /Cancel leaves it as it is\.$/.test(DRAFT_OF_ANYONE) && !/prices|e-mail|id\b/.test(DRAFT_OF_ANYONE));
// github.io on a phone or a tablet (not inside the portal): plans come from the DCR Portal — with Safari only if the
// portal asks (review fix: true before the portal's frame is live, and whenever its switch for it is off)
ok('the handheld start screen says plans come from the DCR Portal, with Safari only when the portal asks for it',
  /Plans come from the DCR Portal/.test(FROM_THE_PORTAL) && /📐 on the project/.test(FROM_THE_PORTAL)
  && FROM_THE_PORTAL.endsWith(PORTAL_SAFARI_IF_ASKED) && /see prices/.test(FROM_THE_PORTAL)
  && !/opens inside the portal|inside itself/.test(FROM_THE_PORTAL));
ok('… and so does "nothing came from the portal" in a tab of its own',
  /const NOTHING_FROM_PORTAL = 'Nothing came from the portal[^']*'\s*\+ PORTAL_SAFARI_IF_ASKED;/.test(read('js/main.js'))
  && !/On an iPhone or iPad the portal opens the takeoff tool inside itself/.test(read('js/main.js')));
ok('… in the phone hint, still with what Save really does', HANDHELD_HINT.startsWith(FROM_THE_PORTAL) && HANDHELD_HINT.includes(HANDHELD_SAVE));
const archiveUi = read('js/ui/plans-archive.js');
ok('… and in the Plans Archive note on a phone', /\$\{FROM_THE_PORTAL\} Or use “Open a \.takeoff project”/.test(archiveUi));
ok('nobody is sent to Safari unasked any more (the old words that always did are gone)', !/in Safari \(not from its home-screen icon\)/.test(archiveUi)
  && !/with the portal in Safari/.test(read('js/core/plans-link.js')) && !/works only with the portal open in Safari/.test(read('js/main.js')));
{
  const ua = (userAgent, maxTouchPoints = 0, mobile) => ({ navigator: { userAgent, maxTouchPoints, userAgentData: mobile === undefined ? undefined : { mobile } }, matchMedia: () => ({ matches: maxTouchPoints > 0 }) });
  eq('"this iPad", "this iPhone", …', [
    deviceWord(ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15', 5)),
    deviceWord(ua('Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1', 5)),
    deviceWord(ua('Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_1 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', 5)),
    deviceWord(ua('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0.0.0 Mobile Safari/537.36', 5, true)),
    deviceWord(ua('Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36', 10, false)),
    deviceWord(ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.6 Safari/605.1.15', 0)),
    deviceWord(ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36', 10)),
    deviceWord(null),
  ], ['iPad', 'iPad', 'iPhone', 'phone', 'tablet', 'device', 'device', 'device']);
}

// ── what the profile changes, in main.js and plans-archive.js (read as text) ──
const main = read('js/main.js');
const body = (src, name) => {
  const at = src.indexOf(`function ${name}(`);
  if (at < 0) return '';
  const next = src.slice(at + 10).search(/\n(?:async )?function /);
  return next < 0 ? src.slice(at) : src.slice(at, at + 10 + next);
};
ok('main.js reads the profile once, before the boot consumes the hand-over\'s address',
  main.indexOf('const embedded = detectEmbedded(window);') > 0
  && main.indexOf('const embedded = detectEmbedded(window);') < main.indexOf("const PORTAL_HANDOFF = parsePortalHash(location.hash || '');"));
{
  const firstDraw = main.indexOf('\nonSettingsChanged();\n');
  ok('… and before the start screen is first drawn (no TDZ: it reads `embedded`)', main.indexOf('const embedded = ') < firstDraw);
}
ok('plans come from the portal inside it (plansSourceFor)', /plansSourceFor\(\{\s*embedded,/.test(body(main, 'plansSource')));
ok('no old-portal list inside it', /if \(embedded\) return \[\];/.test(body(main, 'libraryEntries')));
ok('no kept copies listed, none swept', /if \(embedded\) return \[\];/.test(body(main, 'keptEntries')) && /if \(embedded \|\|/.test(body(main, 'sweepKeptLeftovers')));
ok('no Keep on This Device: said, before anything is written', /^function keepOnDevice\(\) \{[\s\S]{0,400}if \(embedded\) \{ await D\.alertDialog\('Keep on This Device', EMBEDDED_NO_KEEP\); return; \}/.test(body(main, 'keepOnDevice')));
ok('… and the menu does not offer it, nor the Plans Archive, nor Recent', /if \(embedded\) \{\s*for \(const act of \['plans-archive', 'keep-on-device', 'recent'\]\)/.test(main));
// Review fix: a plan opened over the internet inside the portal was noted by name in Recent (localStorage on the
// portal's site), which the portal's purge on lost prices never clears.
ok('nothing is noted in Recent inside the portal (names of plans gated by prices, on the portal\'s site)',
  /^function noteRecent\(file\) \{[\s\S]{0,400}?\n  if \(embedded\) return;\n  try \{/.test(body(main, 'noteRecent')));
ok('the idle words are the portal\'s', /const IDLE_STATUS = embedded\s*\?\s*EMBEDDED_IDLE/.test(main));
ok('"nothing came" in the portal\'s words inside it', /const nothingFromPortal = \(\) => \(embedded \? EMBEDDED_NOTHING : NOTHING_FROM_PORTAL\);/.test(main));
ok('the Plans Archive section says where plans come from, and reads no folders inside the portal',
  /if \(this\.embedded\(\)\) \{\s*box\.hidden = false;[\s\S]*EMBEDDED_PLANS/.test(archiveUi) && /supported\(\) \{ return !this\.embedded\(\) && canOpenArchiveFolder/.test(archiveUi));
ok('… File › Plans Archive and a #plans link say so too', (archiveUi.match(/if \(this\.embedded\(\)\) \{ await D\.alertDialog\('Plans', EMBEDDED_NO_ARCHIVE\); return; \}/g) || []).length === 2);
ok('the host tells the archive', /embedded: \(\) => embedded,/.test(main));
ok('the service worker registers relative to the page: its own scope (/takeoff/ inside the portal), never the site root',
  /navigator\.serviceWorker\.register\(new URL\('sw\.js', document\.baseURI\)\)/.test(main) && !/register\(\s*['"]\//.test(main));
ok('the app shows no install prompt of its own (none to hide inside the portal)', !/beforeinstallprompt|prompt\(\)\s*;?\s*\/\/\s*install/i.test(main));
// What the portal's frame relies on (Portal 2 js/plan-frame.js unsavedIn: Close asks first while the app has unsaved
// changes). It reads window.TakeoffApp.app.project.dirty — so that must be the live flag of the project on screen.
{
  const js = [];
  const walk = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(d, e.name));
      else if (e.name.endsWith('.js')) js.push(readFileSync(path.join(d, e.name), 'utf8'));
    }
  };
  walk(path.join(APP, 'js'));
  ok('the portal\'s Close guard reads TakeoffApp.app.project.dirty: the live app is exposed, and its project is one object for good',
    /\nwindow\.TakeoffApp = \{\s*app,/.test(main) && /\n  project: new Project\(\),/.test(main)
    && js.every(src => !/\bapp\.project\s*=(?!=)/.test(src))
    && /get dirty\(\) \{ return this\._dirty; \}/.test(read('js/core/project.js')));
}
// Review FRAME-1 (contract addendum 2 C2b): the portal's Close removes the frame, and a frame removed by its page
// gets no time after pagehide — the draft that event starts never lands. So Close first awaits
// window.TakeoffApp.saveDraftNow() (up to 3 s): Promise<boolean>, true once the draft is kept or nothing needed keeping.
{
  const keep = body(main, 'keepDraftForPortal');
  ok('TakeoffApp.saveDraftNow is there for the portal\'s frame, and it is keepDraftForPortal',
    /\nwindow\.TakeoffApp = \{[^}]*\n  saveDraftNow: keepDraftForPortal,/.test(main));
  ok('… which asks draftKeptNow with the live project, whether there is anything to keep, and the real draft write',
    /return await draftKeptNow\(\{\s*dirty: app\.project\.dirty,\s*hasWork: !!app\.pages\.pageCount \|\| \[\.\.\.app\.project\.allItems\(\)\]\.length > 0,\s*write: saveDraftNow,\s*\}\);/.test(keep)
    && /\} catch \{\s*return false;\s*\}/.test(keep));
  ok('… and the draft write it uses is the one under every key (all homes, the person\'s word)',
    /Promise\.all\(draftKeysNow\(\)\.map\(key => putDraft\(key, work, info\)\)\)/.test(body(main, 'saveDraftNow')));
}
ok('the old portal\'s Plans Library link is only in the list of plans on this device, which stays hidden inside the portal (both of its lists are empty there)',
  (read('index.html').match(/dcr-portal\//g) || []).length === 1
  && /<div class="es-lib" id="esLibrary" hidden>\s*<div class="es-lib-head"><span>Plans on this device<\/span><a class="es-lib-manage" href="\.\.\/dcr-portal\/plans-library\.html">/.test(read('index.html'))
  && /box\.hidden = !kept\.length && !portal\.length;/.test(body(main, 'renderLibraryList')));

// ── the page: no inline script (the portal's page policy: script-src 'self') ──
const html = read('index.html');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(m => ({ attrs: m[1], body: m[2] }));
ok('index.html has scripts to check', scripts.length >= 2);
eq('every <script> in index.html is a file, none inline', scripts.filter(s => !/\ssrc\s*=/.test(` ${s.attrs}`) || s.body.trim()).length, 0);
eq('no inline event handler in index.html', (html.match(/<[a-z][^>]*\son[a-z]+\s*=/gi) || []).length, 0);
eq('no javascript: address in index.html', /javascript:/i.test(html), false);
{
  const head = html.slice(0, html.indexOf('</head>'));
  const boot = head.indexOf('<script src="js/ui-mode-boot.js"></script>');
  ok('the layout boot is a classic, blocking script in <head> (no type=module, async or defer)', boot > 0);
  ok('… before the stylesheet, so the first paint is the right layout', boot < head.indexOf('<link rel="stylesheet" href="css/app.css">'));
  ok('… and the app itself is still the module at the end of the page', /<script type="module" src="js\/main\.js"><\/script>/.test(html));
}

// ── the boot itself: word for word what the inline script did ────────────
const BOOT = read('js/ui-mode-boot.js');
const code = src => src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim());
// index.html's inline script at main f499435, its statements (its comment aside):
const WAS = [
  'try {',
  "  var st = JSON.parse(localStorage.getItem('ptt.settings.v1') || '{}');",
  "  document.documentElement.dataset.ui = st.ui_mode === 'standard' ? 'standard' : 'touch';",
  '} catch (e) {',
  "  document.documentElement.dataset.ui = 'touch';",
  '}',
];
eq('js/ui-mode-boot.js runs exactly the statements the inline script did', code(BOOT), WAS);
ok('… as a classic script (no import or export)', !/^\s*(import|export)\b/m.test(BOOT));
function boot(settings, { throws = false } = {}) {
  const documentElement = { dataset: {} };
  const ctx = {
    localStorage: { getItem: k => { if (throws) throw new Error('SecurityError'); return k === 'ptt.settings.v1' ? settings : null; } },
    document: { documentElement },
    JSON,
  };
  vm.runInNewContext(BOOT, ctx, { filename: 'ui-mode-boot.js' });
  return documentElement.dataset.ui;
}
eq('standard chosen: standard', boot(JSON.stringify({ ui_mode: 'standard' })), 'standard');
eq('touch chosen, or nothing chosen, or no settings: touch', [boot(JSON.stringify({ ui_mode: 'touch' })), boot('{}'), boot(null)], ['touch', 'touch', 'touch']);
eq('settings that are not JSON, or a store that refuses: touch', [boot('{not json'), boot('{}', { throws: true })], ['touch', 'touch']);

// ── storage: nothing of the portal's names (same site inside it) ─────────
// Portal 2 keeps "dcr2-*", "dcr2_*", "dcr2:*", "dcr2<Word>" and "dcr-portal2-*" (localStorage, sessionStorage, IndexedDB,
// OPFS, caches, locks). This app's own names are "ptt.*", "ptt-*" and the OPFS "plans-kept"; the OLD portal's
// (barajas545.github.io, read only to tidy up) are "dcr.plansLibrary.v1", "dcr_portal_token", "dcr-plans-library",
// "plans-library" and "dcr-plans-open:" — none of them is the portal's, and inside the portal none is read.
{
  const NAMES = {
    'localStorage ptt.settings.v1': 'ptt.settings.v1',
    'localStorage ptt.recent.v1': 'ptt.recent.v1',
    'localStorage ptt.catalog.user.v1': 'ptt.catalog.user.v1',
    'localStorage kept index': KEPT_INDEX_KEY,
    'localStorage remembered owner': OWNER_KEY,
    'sessionStorage embedded': EMBEDDED_KEY,
    'IndexedDB drafts': 'ptt-drafts',
    'IndexedDB plans archive': 'ptt-plans-archive',
    'OPFS kept': KEPT_DIR,
    'lock keep-write': WRITE_LOCK,
    'cache': 'ptt-web-v22',
    'old portal index': PORTAL_INDEX_KEY,
    'old portal token': PORTAL_TOKEN_KEY,
    'old portal IndexedDB': PORTAL_DB,
    'old portal OPFS': PORTAL_DIR,
    'old portal lock': OPEN_LOCK,
  };
  const portalName = n => /^dcr2|^dcr-portal2/i.test(n) || n === 'plan-library';
  eq('no storage name of this app\'s is one of the portal\'s', Object.entries(NAMES).filter(([, n]) => portalName(n)).map(([k]) => k), []);
  ok('the names are the ones the code uses', read('js/core/drafts.js').includes("const DB_NAME = 'ptt-drafts';")
    && read('js/core/plans-folder.js').includes("export function idbBackend(name = 'ptt-plans-archive'")
    && read('js/ui/settings.js').includes("const STORAGE_KEY = 'ptt.settings.v1';")
    && main.includes("const RECENT_KEY = 'ptt.recent.v1';") && read('js/ui/catalog.js').includes("const USER_KEY = 'ptt.catalog.user.v1';")
    && read('sw.js').includes("const CACHE = 'ptt-web-v22';"));
  // A blank sheet added from the start screen (the iPad's first screen) takes the start card down, as a PDF does.
  {
    const i = main.indexOf('async function addBlankSheet(');
    const body = i < 0 ? '' : main.slice(i, main.indexOf('\n}\n', i));
    ok('Add Blank Sheet takes the start card down before it turns to the sheet',
      /hideEmptyState\(\);[\s\S]*await goToPage\(at\);/.test(body));
  }
  // and nothing anywhere in the shipped program names one of the portal's
  const files = [];
  const walk = dir => {
    for (const n of readdirSync(dir)) {
      const p = path.join(dir, n);
      if (statSync(p).isDirectory()) walk(p); else if (n.endsWith('.js')) files.push(p);
    }
  };
  walk(path.join(APP, 'js'));
  files.push(path.join(APP, 'sw.js'));
  const hits = files.filter(f => /['"`](?:dcr2[-_:A-Za-z]|dcr-portal2)/.test(readFileSync(f, 'utf8'))).map(f => path.relative(APP, f));
  eq('no shipped file names a storage of the portal\'s ("dcr2…", "dcr-portal2…")', hits, []);
  ok('the service worker cleans up only its own caches (ptt-web-*), never the portal\'s',
    /n\.startsWith\('ptt-web-'\) && n !== CACHE/.test(read('sw.js')));
}

console.log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass — inside the portal only when a page of its own site frames it with a hand-over; its page needs no inline script`);
process.exit(fails ? 1 : 0);
