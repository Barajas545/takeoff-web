// The service worker must precache every module the app can load.
//
// The worker registers at `load`, after the page has already fetched every
// module without it, so its fetch handler caches nothing on a first visit.
// Whatever PROGRAM in sw.js leaves out is simply not there offline: on a
// device that never ran the app before, a saved plan would not open. And
// PROGRAM is installed all or nothing (cache.addAll), so an entry naming a
// file that does not exist would fail every install and leave the app with
// no offline copy at all — both directions matter.
//
// So this walks js/main.js's imports (static, plus literal import() calls),
// checks PROGRAM against them, checks every listed file exists, and drives
// the worker's own install and activate handlers against stubbed caches.
// The lists are read by RUNNING sw.js in a sandbox, not by pattern-matching
// its text, so what is checked is what the worker actually has.
//
// Run: node tests/sw-precache.mjs
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

// ── sw.js, run in a sandbox ──────────────────────────────────────────────
const handlers = {};
const sandbox = { self: { addEventListener: (type, fn) => { handlers[type] = fn; } } };
const sw = vm.runInNewContext(
  `${readFileSync(path.join(APP, 'sw.js'), 'utf8')}\n;({ CACHE, PROGRAM, EXTRAS })`,
  sandbox, { filename: 'sw.js' });
const PROGRAM = [...sw.PROGRAM];
const EXTRAS = [...sw.EXTRAS];
const program = new Set(PROGRAM);

// ── what main.js can load ────────────────────────────────────────────────
// Line-anchored, so a commented-out import is not mistaken for a live one.
// The `{` lookbehind skips JSDoc's {import('…').Type}, which loads nothing.
const STATIC = /^[ \t]*(?:import|export)\s(?:[^;'"]*?\sfrom\s*)?['"]([^'"]+)['"]/gm;
const DYNAMIC = /(?<!\{)\bimport\(\s*['"]([^'"]+)['"]\s*\)/g;
const rel = f => path.relative(APP, f).split(path.sep).join('/');

function graph(patterns) {
  const seen = new Set();
  const queue = [path.join(APP, 'js', 'main.js')];
  while (queue.length) {
    const file = queue.shift();
    const name = rel(file);
    if (seen.has(name)) continue;
    seen.add(name);
    let src;
    try {
      src = readFileSync(file, 'utf8');
    } catch {
      ok(`${name} is imported but does not exist`, false);
      continue;
    }
    for (const re of patterns) {
      re.lastIndex = 0;
      for (let m; (m = re.exec(src));) {
        if (m[1].startsWith('.')) queue.push(path.resolve(path.dirname(file), m[1]));
      }
    }
  }
  return [...seen].sort();
}

const staticGraph = graph([STATIC]);
const fullGraph = graph([STATIC, DYNAMIC]);

// A walk that finds almost nothing means the pattern broke, not that the app
// shrank — and an empty walk would pass every check below.
ok(`the static walk finds the app (${staticGraph.length} modules)`, staticGraph.length >= 30);
for (const m of ['js/core/takeoff-file.js', 'js/core/page-store.js', 'js/core/zlib.js']) {
  ok(`the walk reaches ${m}`, fullGraph.includes(m));
}

const missingStatic = staticGraph.filter(m => !program.has(m));
const missingDynamic = fullGraph.filter(m => !staticGraph.includes(m) && !program.has(m));
eq('every module in main.js\'s static import graph is in PROGRAM', missingStatic, []);
eq('every module main.js imports on demand is in PROGRAM', missingDynamic, []);

// ── the lists themselves ─────────────────────────────────────────────────
for (const shell of ['./', 'index.html', 'css/app.css', 'js/main.js']) {
  ok(`PROGRAM has ${shell}`, program.has(shell));
}
const onDisk = u => existsSync(path.join(APP, u === './' ? 'index.html' : u));
eq('every PROGRAM entry exists (one that does not fails every install)',
  PROGRAM.filter(u => !onDisk(u)), []);
eq('every EXTRAS entry exists', EXTRAS.filter(u => !onDisk(u)), []);
eq('no entry is listed twice',
  [...PROGRAM, ...EXTRAS].filter((u, i, all) => all.indexOf(u) !== i), []);
ok('CACHE carries the prefix activate cleans up by', /^ptt-web-/.test(sw.CACHE));

// ── the handlers, against stubbed caches ─────────────────────────────────
function stubs({ addAllFails = false, failingExtra = null, names = [] } = {}) {
  const log = [];
  const cache = {
    addAll: async reqs => {
      log.push(['addAll', reqs.map(r => [r.url, r.cache])]);
      if (addAllFails) throw new TypeError('Failed to fetch');
    },
    put: async u => { log.push(['put', u]); },
  };
  Object.assign(sandbox, {
    Request: class { constructor(url, init = {}) { this.url = url; this.cache = init.cache; } },
    fetch: async (u, init = {}) => {
      log.push(['fetch', u, init.cache]);
      if (u === failingExtra) throw new TypeError('Failed to fetch');
      return { ok: true };
    },
    caches: {
      open: async () => cache,
      keys: async () => names,
      delete: async n => { log.push(['delete', n]); return true; },
    },
  });
  sandbox.self.skipWaiting = async () => { log.push(['skipWaiting']); };
  sandbox.self.clients = { claim: async () => { log.push(['claim']); } };
  return log;
}

async function fire(type) {
  let job = Promise.resolve();
  handlers[type]({ waitUntil: p => { job = p; } });
  try { await job; return 'resolved'; } catch { return 'rejected'; }
}

{
  const failingExtra = 'vendor/pdfjs/build/pdf.worker.min.js';
  const log = stubs({ failingExtra });
  eq('install succeeds when only an extra fails', await fire('install'), 'resolved');
  const adds = log.filter(e => e[0] === 'addAll');
  eq('the program goes in with ONE addAll', adds.length, 1);
  eq('…every PROGRAM entry, revalidated (no-cache)', adds[0]?.[1],
    PROGRAM.map(u => [u, 'no-cache']));
  eq('extras are cached best-effort, skipping the one that failed',
    log.filter(e => e[0] === 'put').map(e => e[1]), EXTRAS.filter(u => u !== failingExtra));
  eq('extras are revalidated too', log.filter(e => e[0] === 'fetch').every(e => e[2] === 'no-cache'), true);
  const at = kind => log.findIndex(e => e[0] === kind);
  ok('skipWaiting comes after the program is in', at('skipWaiting') > at('addAll'));
}
{
  const log = stubs({ addAllFails: true });
  eq('a failed program fetch fails the install', await fire('install'), 'rejected');
  eq('…and the old worker stays: no skipWaiting', log.some(e => e[0] === 'skipWaiting'), false);
  eq('…and no extras are fetched for a version that will not install',
    log.some(e => e[0] === 'fetch'), false);
}
{
  const log = stubs({ names: ['ptt-web-v7', 'ptt-web-v8', sw.CACHE, 'dcr-portal-v12', 'other'] });
  eq('activate settles', await fire('activate'), 'resolved');
  eq('activate deletes only this app\'s OLD caches — never the portal\'s',
    log.filter(e => e[0] === 'delete').map(e => e[1]), ['ptt-web-v7', 'ptt-web-v8']);
  ok('activate claims the open pages', log.some(e => e[0] === 'claim'));
}

console.log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass — the worker precaches all ${fullGraph.length} modules main.js can load`);
process.exit(fails ? 1 : 0);
