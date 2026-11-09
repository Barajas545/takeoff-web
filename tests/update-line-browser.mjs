// 'A NEW VERSION IS READY' ONLY WHEN ONE IS: two real versions served one
// after the other, to a real service worker, in headless Chrome.
//
// The program is fetched network-first (sw.js), so the first open after a
// release already RUNS the new version -- and the worker it brings takes the
// page over all the same (a controllerchange). js/main.js asks that worker
// which version it caches (sw.js answers 'ptt-cache?') and compares it with
// the version the page runs (the CACHE of the sw.js read beside its files):
// the same, and nothing is said and nothing reloads. Held here, with the
// app served at /takeoff/ as the portal serves its copy, a page of the
// portal at /, and sw.js's CACHE line rewritten per version (the release
// step: a one-line bump):
//
//   1. a tab, idle on the start screen: version A installs; B is put up and
//      the page opened again -- the worker changes, and the page neither
//      says a new version is ready nor reloads;
//   2. inside the portal's frame (a page of its own site frames
//      index.html#portal=<nonce> and hands a plan over): C is put up and the
//      portal's page opened again -- the plan arrives, the portal's arrival
//      line ('Opened …, saved on this … by the portal …') is said, the worker
//      changes, and no reload hint is said and nothing reloads;
//   3. an update that arrives while a job is open (the page runs C, D is
//      put up and the browser checks): it IS said, and nothing reloads;
//   4. ...and once the job is closed (New) the page reloads into it, as from
//      an idle start screen it always has;
//   3b. in the portal's frame, an update while its plan is open (D, then
//      E): said -- but never over the arrival line, only once it is down;
//   5. a page that came from the old cache with no network (E's copy,
//      offline), when F arrives: said;
//   6. a page that came with no worker in front of it (a first visit): G's
//      first install takes it over and says nothing -- and H, a real
//      release arriving while a job is open in that same page, IS said;
//   7. the page's own read of sw.js stalls (a line that never answers it):
//      J, the next version, still takes the page over -- the read is no
//      fetch held open in the old worker -- and is said; the read answered
//      at last (with J's sw.js) silences nothing;
//   8. a slow line: the page's main.js takes longer than the worker waits
//      (2.5 s), so it comes from J's cache while the rest is L's: a page
//      part old and part new, which L's worker taking over must not take
//      for L. Idle on the start screen, it reloads into L;
//   9. inside the portal, a frame whose takeoff worker never installed (one
//      file of the program missing), held by the portal's own root worker:
//      the portal's worker updating is no new version of this app, and
//      nothing is said;
//  10. the first release after a worker from before 'ptt-cache?' (v28,
//      v29: it never answers, so the page cannot ask it what it served from
//      its cache), with one file slow -- the stylesheet, or a module
//      (renderer.js) -- so that it came from that worker's cache and the
//      rest from the network: idle on the start screen the page reloads into
//      the new version; with a job open it says so, once the status line is
//      quiet, and does not reload;
//  11. ...and with every file fast the page IS the new version: in a tab
//      idle, in a tab with a job open, and in the portal's frame with its
//      plan open, nothing is said and nothing reloads;
//  12. a browser without FetchEvent.resultingClientId (Safari before 16:
//      there a navigation's only id is the page it came FROM), the page
//      itself (index.html) slow, so it came from the worker's cache and the
//      rest from the network: idle on the start screen the page reloads into
//      the new version; with a job open it says so -- and with every file
//      fast, nothing is said and nothing reloads.
//
// Synthetic. Chrome or Edge is found at its usual place or at $CHROME;
// without one this SKIPS (exit 2). Run: node tests/update-line-browser.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.normalize(path.join(here, '..'));

const CHROMES = [process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
const EXE = CHROMES.find(p => existsSync(p));
if (!EXE || typeof WebSocket === 'undefined') {
  console.log('SKIPPED: no Chrome or Edge here (set CHROME), or no WebSocket in this node');
  process.exit(2);
}

let fails = 0;
let checks = 0;
const log = s => console.log(s);
function ok(label, cond, detail) {
  checks += 1;
  if (cond) return true;
  fails += 1;
  log(`FAIL ${label}${detail === undefined ? '' : `\n  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  return false;
}
const eq = (label, got, want) => ok(label, JSON.stringify(got) === JSON.stringify(want),
  `got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const READY = 'A new version of Professional Takeoff Tools is ready';
const SW = readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const CACHE_LINE = /^const CACHE = '[^']+';$/m;
ok('sw.js has its one CACHE line, the release step', (SW.match(new RegExp(CACHE_LINE.source, 'gm')) || []).length === 1);

// ── a small job to open (one blank sheet) ────────────────────────────────
function job() {
  const w = 64, h = 48;
  const raw = Buffer.alloc((w * 3 + 1) * h, 250);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const o = Buffer.alloc(12 + d.length); o.writeUInt32BE(d.length, 0); o.write(t, 4, 'ascii'); d.copy(o, 8); o.writeUInt32BE(crc(o.subarray(4, 8 + d.length)), 8 + d.length); return o; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  const page = zlib.deflateSync(png);
  const meta = Buffer.from(JSON.stringify({ project_name: 'Synthetic job', page_labels: ['X1.0'], page_labels_custom: {},
    page_names: {}, dpi: 150, pixels_per_foot: 50, annotations: {}, measurements: {}, revisions: [] }), 'utf8');
  const head = Buffer.alloc(17);
  head.write('PDFCACHE1', 0, 'ascii'); head.writeUInt32LE(1, 9); head.writeUInt32LE(meta.length, 13);
  const index = Buffer.alloc(12);
  index.writeBigUInt64LE(BigInt(17 + meta.length + 12), 0); index.writeUInt32LE(page.length, 8);
  return Buffer.concat([head, meta, index, page]);
}
const JOB = job();

// ── the server: the app at /takeoff/, a page of the portal at / ──────────
const NONCE = 'UpdateLineTest_0123456789';
const PORTAL_PAGE = `<!doctype html><meta charset="utf-8"><title>portal</title>
<body style="margin:0"><iframe id="f" style="border:0;width:100vw;height:100vh"></iframe>
<script src="/__portal.js"></script>`;
const PORTAL_JS = `
const nonce = ${JSON.stringify(NONCE)};
const f = document.getElementById('f');
const q = new URLSearchParams(location.search);
if (q.has('sw')) navigator.serviceWorker.register('/__portal-sw.js', { scope: '/' });
window.addEventListener('message', async ev => {
  if (ev.source !== f.contentWindow) return;
  const d = ev.data;
  if (!d || d.type !== 'ptt-ready' || d.nonce !== nonce) return;
  const bytes = await (await fetch('/__job.takeoff', { cache: 'no-store' })).arrayBuffer();
  const file = new File([bytes], 'Synthetic job.takeoff', { lastModified: 1700000000000 });
  f.contentWindow.postMessage({ type: 'ptt-open', v: 1, nonce, kind: 'file', file, name: file.name, size: file.size,
    lastModified: file.lastModified, number: 'X-1', canSave: true, who: 'whoWord_0001', plan: 'planWord_001' }, location.origin);
});
if (!q.has('noframe')) f.src = '/takeoff/index.html#portal=' + nonce;
`;
// The portal's own worker, by the real portal's rule: it never answers
// anything under takeoff/, and claims its pages when it activates.
const PORTAL_SW = `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', ev => ev.waitUntil(self.clients.claim()));
self.addEventListener('fetch', ev => {
  const url = new URL(ev.request.url);
  if (url.pathname.startsWith('/takeoff/') || ev.request.method !== 'GET') return;
  ev.respondWith(fetch(ev.request, { cache: 'no-cache' }));
});`;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
let version = 'A';
let offline = false;
// From 6 on: main.js says which version it is (the release step changes
// only sw.js's CACHE line, so the code itself is the same file each time --
// this is how a page shows WHICH copy it runs); main.js answered late; the
// page's own reads of sw.js held; one file of the program missing; the
// portal worker's version.
let marker = false;
let mainDelayMs = 0;
let holdSwReads = false;
const held = [];
const missing = new Set();
let portalSwVer = 1;
// From 10 on: the version put up is served with a worker from before
// 'ptt-cache?' (OLD_WORKER); one file of the page is slow (the page's own
// request for it, never the worker's install); one file only the worker's
// install fetches (precached, never loaded by the page) is held, so that
// the new worker takes over only once a job is open.
let oldWorker = false;
let slowFile = '';
let slowMs = 0;
let installHoldMs = 0;
const INSTALL_ONLY = 'js/core/opfs-write-worker.js';
// v28's and v29's worker, as far as a page can tell: it never answers
// 'ptt-cache?' (the answer below it is never reached), and a page's own read
// of sw.js goes through it to the network like any shell file's. The rest of
// it is the worker of this checkout -- network-first with the same 2.5 s
// wait, the same cache -- so only the answer differs.
const OLD_WORKER = `// a worker from before 'ptt-cache?' (tests/update-line-browser.mjs)
self.addEventListener('message', ev => { if (ev.data && ev.data.type === 'ptt-cache?') ev.stopImmediatePropagation(); });
self.addEventListener('fetch', ev => {
  if (ev.request.method === 'GET' && new URL(ev.request.url).pathname === self.location.pathname) ev.respondWith(fetch(ev.request, { cache: 'no-cache' }));
});
`;
// From 12 on: a browser without FetchEvent.resultingClientId (Safari before
// 16), as far as the worker can tell -- it reads '' -- and the worker says
// so when asked 'no-rid?'. A navigation's clientId there is still the page
// it came FROM, as in Chrome.
let noResultingId = false;
const NO_RESULTING_ID = `// a browser without FetchEvent.resultingClientId (tests/update-line-browser.mjs)
try { Object.defineProperty(FetchEvent.prototype, 'resultingClientId', { configurable: true, get() { return ''; } }); } catch (e) {}
self.addEventListener('message', ev => {
  if (ev.data && ev.data.type === 'no-rid?' && ev.ports && ev.ports[0]) {
    let rid = null;
    try { rid = new FetchEvent('fetch', { request: new Request(self.location.href), resultingClientId: 'x' }).resultingClientId; } catch (e) { rid = String(e); }
    ev.ports[0].postMessage(rid);
  }
});
`;
const swText = async () => Buffer.from((await readFile(path.join(ROOT, 'sw.js'))).toString('utf8')
  .replace(CACHE_LINE, `const CACHE = '${cacheOf(version)}';`), 'utf8');
async function releaseHeld() {
  for (const res of held.splice(0)) {
    try { res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }); res.end(await swText()); } catch { /* gone */ }
  }
}
const cacheOf = v => `ptt-web-test-${v}`;
const server = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/' || p === '/index.html') { res.writeHead(200, { 'content-type': 'text/html', 'cache-control': 'no-store' }); res.end(PORTAL_PAGE); return; }
  if (p === '/__portal.js') { res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }); res.end(PORTAL_JS); return; }
  if (p === '/__job.takeoff') { res.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' }); res.end(JOB); return; }
  if (p === '/__portal-sw.js') { res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }); res.end(`// portal worker v${portalSwVer}\n${PORTAL_SW}`); return; }
  if (!p.startsWith('/takeoff/')) { res.writeHead(404); res.end(); return; }
  if (offline) { req.socket.destroy(); return; }
  const relNow = p.slice('/takeoff/'.length);
  // A page's own read of sw.js -- never the browser's update fetch, which says Service-Worker: script.
  if (holdSwReads && relNow === 'sw.js' && !req.headers['service-worker']) { held.push(res); return; }
  if (missing.has(relNow)) { res.writeHead(404); res.end(); return; }
  if (mainDelayMs && relNow === 'js/main.js') await sleep(mainDelayMs);
  if (slowMs && relNow === slowFile && !req.headers['service-worker']) await sleep(slowMs);
  if (installHoldMs && relNow === INSTALL_ONLY) await sleep(installHoldMs);
  try {
    let rel = p.slice('/takeoff/'.length) || 'index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const f = path.normalize(path.join(ROOT, rel));
    if (!f.startsWith(ROOT) || f.includes(`${path.sep}tests${path.sep}`)) { res.writeHead(403); res.end(); return; }
    let body = await readFile(f);
    // The release: sw.js's CACHE line, and nothing else, per version.
    if (rel === 'sw.js') body = Buffer.from(body.toString('utf8').replace(CACHE_LINE, `const CACHE = '${cacheOf(version)}';`), 'utf8');
    if (rel === 'sw.js' && oldWorker) body = Buffer.concat([Buffer.from(OLD_WORKER, 'utf8'), body]);
    if (rel === 'sw.js' && noResultingId) body = Buffer.concat([Buffer.from(NO_RESULTING_ID, 'utf8'), body]);
    // ...and which copy of the page itself (index.html) it is
    if (rel === 'index.html' && marker) body = Buffer.from(body.toString('utf8').replace('<head>', `<head><meta name="served" content="${version}">`), 'utf8');
    if (rel === 'js/main.js' && marker) {
      body = Buffer.concat([body, Buffer.from(`\n;try { sessionStorage.setItem('__vers', (sessionStorage.getItem('__vers') || '') + ${JSON.stringify(version)} + ','); } catch (e) {}\n`)]);
    }
    // ...and which copy of the stylesheet and of a module the page has.
    if (rel === 'css/app.css' && marker) body = Buffer.concat([body, Buffer.from(`\n:root { --served: ${version}; }\n`)]);
    if (rel === 'js/render/renderer.js' && marker) body = Buffer.concat([body, Buffer.from(`\n;globalThis.__rend = ${JSON.stringify(version)};\n`)]);
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

// ── headless Chrome, a throw-away profile, the DevTools protocol ──────────
const profile = mkdtempSync(path.join(tmpdir(), 'ulb-'));
const chrome = spawn(EXE, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-gpu', 'about:blank'],
{ stdio: 'ignore', windowsHide: true });
let ws = null;
const waiting = new Map();
const handlers = new Set();
let seq = 0;
function send(method, params = {}, sessionId) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((res, rej) => waiting.set(id, { res, rej }));
}
async function finish(code) {
  try { if (ws) await Promise.race([send('Browser.close'), sleep(2000)]); } catch { /* gone */ }
  try { chrome.kill(); } catch { /* gone */ }
  server.close();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* locked */ }
  process.exit(code);
}

try {
  let port = '';
  for (let i = 0; i < 150 && !port; i++) {
    try { port = readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8'); } catch { await sleep(100); }
  }
  if (!port) {
    console.log('SKIPPED: Chrome did not start');
    await finish(2);
  }
  const [pp, wsPath] = port.trim().split('\n');
  ws = new WebSocket(`ws://127.0.0.1:${pp}${wsPath}`);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = m => {
    const msg = JSON.parse(typeof m.data === 'string' ? m.data : m.data.toString());
    if (msg.id && waiting.has(msg.id)) {
      const w = waiting.get(msg.id);
      waiting.delete(msg.id);
      if (msg.error) w.rej(new Error(msg.error.message)); else w.res(msg.result);
    } else if (msg.method) for (const h of handlers) h(msg);
  };

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (m, prm) => send(m, prm, sessionId);
  await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
  // Every page and frame of the app counts its loads (a reload is one more),
  // the worker changes it hears, and every line its status line shows --
  // from its very start, before any of the app's own code runs.
  await call('Page.addScriptToEvaluateOnNewDocument', { source: `
    if (location.pathname.startsWith('/takeoff/')) {
      try { sessionStorage.setItem('__loads', String(Number(sessionStorage.getItem('__loads') || 0) + 1)); } catch (e) {}
      window.__changes = 0;
      window.__said = [];
      if (navigator.serviceWorker) navigator.serviceWorker.addEventListener('controllerchange', () => { window.__changes += 1; });
      document.addEventListener('DOMContentLoaded', () => {
        const s = document.getElementById('statusText');
        if (!s) return;
        const note = () => { const t = s.textContent; if (window.__said[window.__said.length - 1] !== t) window.__said.push(t); };
        note();
        new MutationObserver(note).observe(s, { childList: true, characterData: true, subtree: true });
      });
    }` });
  const evaluate = async expression => {
    const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const once = (method, pred = () => true) => new Promise(res => {
    const h = msg => {
      if (msg.sessionId === sessionId && msg.method === method && pred(msg.params)) { handlers.delete(h); res(msg.params); }
    };
    handlers.add(h);
  });
  const go = async url => {
    const loaded = once('Page.loadEventFired');
    await call('Page.navigate', { url });
    await Promise.race([loaded, sleep(20000)]);
  };
  const until = async (expr, ms = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try { if (await evaluate(expr)) return true; } catch { /* the page is between loads */ }
      await sleep(150);
    }
    return false;
  };
  // The app's window: the tab itself, or the portal page's frame.
  const TAB = 'window';
  const FRAME = `(document.getElementById('f') && document.getElementById('f').contentWindow)`;
  let W = TAB;
  const inApp = expr => `(() => { const w = ${W}; if (!w || !w.document) return undefined; with (w) { return (${expr}); } })()`;
  const status = async () => (await evaluate(inApp(`document.getElementById('statusText') ? document.getElementById('statusText').textContent : ''`))) || '';
  const said = async () => (await evaluate(inApp('window.__said'))) || [];
  const loads = async () => Number(await evaluate(inApp(`sessionStorage.getItem('__loads') || 0`)));
  const changes = async () => Number(await evaluate(inApp('window.__changes')) || 0);
  /** The worker in charge has version v's cache and none other, and the page has heard `n` changes of worker. */
  const settled = async (v, n) => until(inApp(`(async () => !!navigator.serviceWorker.controller
    && navigator.serviceWorker.controller.state === 'activated'
    && JSON.stringify((await caches.keys()).filter(k => k.startsWith('ptt-web-'))) === ${JSON.stringify(JSON.stringify([cacheOf(v)]))}
    && window.__changes >= ${n})()`), 30000);
  const appUp = () => until(inApp(`!!(window.TakeoffApp && document.readyState === 'complete')`), 30000);
  const openJob = () => evaluate(inApp(`(async () => {
    const b = await (await fetch('/__job.takeoff', { cache: 'no-store' })).arrayBuffer();
    await TakeoffApp.loadProjectFile(new File([b], 'Synthetic job.takeoff', { lastModified: 1700000000000 }));
  })()`));
  const update = () => evaluate(inApp(`navigator.serviceWorker.getRegistration().then(r => r && r.update())`));

  // ── a clean slate, and proof the code is this checkout's ──
  await go(`${ORIGIN}/takeoff/index.html`);
  await sleep(1500);
  await evaluate(`(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
  })()`);
  await go(`${ORIGIN}/takeoff/index.html`);
  await appUp();
  const fresh = await evaluate(`(async () => ({
    nav: performance.getEntriesByType('navigation')[0].workerStart === 0,
    main: (await (await fetch('js/main.js', { cache: 'no-store' })).text()).length }))()`);
  eq('a clean slate: the page came with no worker in front, and runs this checkout\'s main.js',
    fresh, { nav: true, main: readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8').length });

  // ── 1. a tab, idle: A installs; B is up; the page opened again ──
  log('-- 1. the first open after a release, in a tab, idle on the start screen --');
  ok('version A installed and took the page', await settled('A', 1));
  version = 'B';
  const l1 = await loads();
  await go(`${ORIGIN}/takeoff/index.html`);
  await appUp();
  ok('...B put up and the page opened again: B\'s worker took it over (a controllerchange)', await settled('B', 1));
  await sleep(2500);
  eq('...and the page did not reload for it', await loads(), l1 + 1);
  const s1 = await said();
  ok('...nor said a new version is ready', !s1.some(t => t.includes(READY)), s1);

  // ── 2. inside the portal's frame ──
  log('\n-- 2. the same inside the portal\'s frame, the plan arriving --');
  W = FRAME;
  version = 'C';
  await go(`${ORIGIN}/`);
  ok('the portal page framed the app and handed the plan over',
    await until(inApp(`!!(window.TakeoffApp && TakeoffApp.app.project.pageCount === 1)`), 30000));
  ok('...and said its arrival line', await until(inApp(`window.__said.some(t => /by the portal/.test(t))`), 10000), await said());
  const l2 = await loads();
  ok('...C\'s worker took the frame over (a controllerchange)', await settled('C', 1));
  await sleep(2500);
  eq('...the frame did not reload', await loads(), l2);
  const s2 = await said();
  const arrival = s2.find(t => /by the portal/.test(t)) || '';
  ok(`...the arrival line ("${arrival.slice(0, 60)}…") is the portal's`, /^Opened Synthetic job\.takeoff, saved on this .* by the portal/.test(arrival));
  ok('...and no reload hint was said, over it or after it', !s2.some(t => t.includes(READY)), s2);

  // ── 3. a real update while the job is open ──
  log('\n-- 3. an update that arrives while a job is open --');
  W = TAB;
  await go(`${ORIGIN}/takeoff/index.html`);
  await appUp();
  ok('C runs in a tab, its worker in charge', await settled('C', 0));
  await openJob();
  ok('a job is open', await until(`TakeoffApp.app.project.pageCount === 1`));
  const l3 = await loads();
  const c3 = await changes();
  version = 'D';
  await update();
  ok('D arrives (the browser checks): its worker takes the page over', await settled('D', c3 + 1));
  ok('...and the page, running C, says a new version is ready',
    await until(`window.__said.some(t => t.includes(${JSON.stringify(READY)}))`, 15000), await said());
  eq('...without reloading under the open job', await loads(), l3);

  // ── 4. ...and from an idle start screen it reloads ──
  log('\n-- 4. the job closed: the waiting version loads --');
  await evaluate(`TakeoffApp.runAction('new-project')`);
  ok('New, with the update waiting: the page reloads into it', await until(`Number(sessionStorage.getItem('__loads') || 0) === ${l3 + 1}`, 15000));
  await appUp();

  // ── 3b. in the portal's frame: said, never over the arrival line ──
  log('\n-- 3b. an update while the portal\'s plan is open: said once its arrival line is down --');
  W = FRAME;
  await go(`${ORIGIN}/`);
  ok('the portal\'s plan is open again (D)', await until(inApp(`!!(window.TakeoffApp && TakeoffApp.app.project.pageCount === 1)`), 30000));
  ok('...its arrival line said', await until(inApp(`window.__said.some(t => /by the portal/.test(t))`), 10000));
  const c3b = await changes();
  version = 'E';
  await update();
  ok('E arrives in the frame', await settled('E', c3b + 1));
  ok('...the hint is said', await until(inApp(`window.__said.some(t => t.includes(${JSON.stringify(READY)}))`), 20000), await said());
  const s3 = await said();
  const first = s3.findIndex(t => t.includes(READY));
  ok(`...but never over the arrival line: what it replaced is "${first > 0 ? s3[first - 1].slice(0, 50) : ''}"`,
    first > 0 && !/by the portal/.test(s3[first - 1]), s3);

  // ── 5. a page that came from the old cache, offline ──
  log('\n-- 5. a page from the old cache with no network, then a new version --');
  W = TAB;
  await go(`${ORIGIN}/takeoff/index.html`);
  await appUp();
  ok('E in a tab, in charge', await settled('E', 0));
  offline = true;
  await go(`${ORIGIN}/takeoff/index.html`);
  await appUp();
  const fromCache = await evaluate(`(() => { const n = performance.getEntriesByType('navigation')[0]; return !!n && n.workerStart > 0; })()`);
  ok('offline, the page came from the worker\'s copy', fromCache);
  await openJob();
  await until(`TakeoffApp.app.project.pageCount === 1`);
  offline = false;
  version = 'F';
  const l5 = await loads();
  const c5 = await changes();
  await update();
  ok('the network back with F: its worker takes the page over', await settled('F', c5 + 1));
  ok('...and the page, from E\'s copy, says a new version is ready',
    await until(`window.__said.some(t => t.includes(${JSON.stringify(READY)}))`, 15000), await said());
  eq('...without reloading under the open job', await loads(), l5);

  // ── 6. a first visit: no worker in front of the page ──
  log('\n-- 6. a page that came with no worker in front: its first install, then a real release --');
  W = TAB;
  await go(`${ORIGIN}/takeoff/index.html`);
  await appUp();
  await evaluate(`(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
  })()`);
  marker = true;
  version = 'G';
  await go(`${ORIGIN}/takeoff/index.html`);
  await appUp();
  ok('the page came with no worker in front of it (a first visit)',
    await evaluate(`performance.getEntriesByType('navigation')[0].workerStart === 0 && !navigator.serviceWorker.controller`));
  const l6 = await loads();
  ok('...G, its first install, takes it over', await settled('G', 1));
  await sleep(2500);
  eq('...which does not reload it', await loads(), l6);
  ok('...nor says a new version is ready', !(await said()).some(t => t.includes(READY)), await said());
  await openJob();
  ok('a job is open', await until(`TakeoffApp.app.project.pageCount === 1`));
  version = 'H';
  await update();
  ok('H arrives while it is open: its worker takes the page over', await settled('H', 2));
  ok('...and the page, running G, says a new version is ready',
    await until(`window.__said.some(t => t.includes(${JSON.stringify(READY)}))`, 15000), await said());
  eq('...without reloading under the job', await loads(), l6);

  // ── 7. the page's own read of sw.js stalls ──
  log("\n-- 7. the page's read of sw.js never answered: the next version takes over all the same, and is said --");
  holdSwReads = true;
  await go(`${ORIGIN}/takeoff/index.html`);
  await appUp();
  ok('H in charge of the page', await settled('H', 0));
  let waited = 0;
  while (!held.length && waited < 10000) { await sleep(100); waited += 100; }
  ok('...and its read of sw.js is held, unanswered', held.length >= 1, held.length);
  await openJob();
  ok('a job is open', await until(`TakeoffApp.app.project.pageCount === 1`));
  const l7 = await loads();
  const c7 = await changes();
  version = 'J';
  await update();
  ok('J arrives: its worker takes the page over, the read still unanswered', await settled('J', c7 + 1));
  ok('...and the page, running H, says a new version is ready -- before the read is ever answered',
    await until(`window.__said.some(t => t.includes(${JSON.stringify(READY)}))`, 15000), await said());
  holdSwReads = false;
  await releaseHeld();
  await sleep(1500);
  eq("...the read answered at last (with J's sw.js): no reload under the job", await loads(), l7);

  // ── 8. a slow line: main.js from the old cache, the rest new ──
  log("\n-- 8. a slow line: main.js from J's cache, the rest L's: idle, the page reloads into L --");
  await go(`${ORIGIN}/takeoff/index.html`);
  await appUp();
  ok('J in charge, the page idle on the start screen', await settled('J', 0)
    && await evaluate(`!document.getElementById('emptyState').hidden && !TakeoffApp.app.project.dirty`));
  await sleep(1000);
  const l8 = await loads();
  const v8 = String(await evaluate(`sessionStorage.getItem('__vers') || ''`)).length;
  version = 'L';
  mainDelayMs = 3500;
  await go(`${ORIGIN}/takeoff/index.html`);
  ok('L takes the page over', await until(`(async () => JSON.stringify((await caches.keys()).filter(k => k.startsWith('ptt-web-'))) === ${JSON.stringify(JSON.stringify([cacheOf('L')]))})()`, 40000));
  ok("...and the page, part J's, reloads into L",
    await until(`Number(sessionStorage.getItem('__loads') || 0) === ${l8 + 2} && !!window.TakeoffApp && document.readyState === 'complete'`, 30000),
    { loads: await loads(), l8 });
  mainDelayMs = 0;
  const runs = String(await evaluate(`sessionStorage.getItem('__vers') || ''`)).slice(v8);
  eq("...the slow open ran J's main.js (from the old cache), the reload L's", runs.split(',').filter(Boolean).slice(0, 2), ['J', 'L']);

  // ── 9. inside the portal, the portal's own worker in front of the frame ──
  log("\n-- 9. a frame held by the portal's own worker (the takeoff install failed): the portal's update says nothing --");
  await evaluate(`(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
  })()`);
  missing.add('js/core/opfs-write-worker.js');   // precached, never loaded by the page: the install fails
  portalSwVer = 1;
  version = 'M';
  W = TAB;
  await go(`${ORIGIN}/?sw&noframe`);
  for (let i = 0; i < 8 && !(await evaluate(`!!navigator.serviceWorker.controller`)); i++) {
    await sleep(500);
    await go(`${ORIGIN}/?sw&noframe`);
  }
  ok("the portal's worker is in charge of its page", await evaluate(`!!navigator.serviceWorker.controller
    && navigator.serviceWorker.controller.scriptURL.endsWith('/__portal-sw.js')`));
  W = FRAME;
  await go(`${ORIGIN}/?sw`);
  ok('the portal framed the app and handed the plan over',
    await until(inApp(`!!(window.TakeoffApp && TakeoffApp.app.project.pageCount === 1)`), 30000));
  ok('...its arrival line said', await until(inApp(`window.__said.some(t => /by the portal/.test(t))`), 10000), await said());
  await sleep(4000);
  ok("the takeoff worker never installed; the frame is the portal worker's", await evaluate(inApp(`(async () =>
    !(await navigator.serviceWorker.getRegistrations()).some(r => r.scope.endsWith('/takeoff/'))
    && !!navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL.endsWith('/__portal-sw.js'))()`)));
  const l9 = await loads();
  portalSwVer = 2;
  await evaluate(`navigator.serviceWorker.getRegistration('/').then(r => r && r.update())`);
  ok("the portal's worker v2 takes the frame over", await until(inApp(`window.__changes >= 1`), 20000));
  await sleep(12000);
  const s9 = await said();
  ok('...and the frame says nothing of a new version of this app (none came)', !s9.some(t => t.includes(READY)), s9);
  eq('...nor reloads', await loads(), l9);
  missing.clear();
  W = TAB;

  // ── 10-11. the first release after a worker from before 'ptt-cache?' ──
  // v28's and v29's workers never answer it, so on the first release after
  // them the page cannot ask whether any of it came from the old cache. Its
  // own timings say: a file that took as long as that worker waits for the
  // network (2.5 s) may be the old cache's, and the page's version is not
  // known; with none, the network's read stands.
  const ran = () => evaluate(inApp(`({ main: (sessionStorage.getItem('__vers') || '').split(',').filter(Boolean).pop() || '',
    css: getComputedStyle(document.documentElement).getPropertyValue('--served').trim(), rend: globalThis.__rend || '' })`));
  /** What the worker in front of the page answers 'ptt-cache?' within 1.5 s (null: nothing). */
  const answer = () => evaluate(inApp(`new Promise(r => { const w = navigator.serviceWorker.controller; if (!w) { r('no worker'); return; }
    const c = new MessageChannel(); const t = setTimeout(() => r(null), 1500);
    c.port1.onmessage = ev => { clearTimeout(t); r(ev.data); }; w.postMessage({ type: 'ptt-cache?' }, [c.port2]); })`)).catch(() => 'error');
  /** A clean slate, then version v served with a worker from before 'ptt-cache?', in front of a page. */
  const oldInCharge = async v => {
    W = TAB;
    await go(`${ORIGIN}/takeoff/index.html`);
    await appUp();
    await evaluate(`(async () => {
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
      for (const k of await caches.keys()) await caches.delete(k);
    })()`);
    oldWorker = true;
    version = v;
    await go(`${ORIGIN}/takeoff/index.html`);
    await appUp();
    const installed = await settled(v, 1);
    await go(`${ORIGIN}/takeoff/index.html`);
    await appUp();
    oldWorker = false;
    const via = await evaluate(`performance.getEntriesByType('navigation')[0].workerStart > 0`);
    ok(`${v}, a worker from before 'ptt-cache?', installed and in front of the page -- and it does not answer one`,
      installed && via && (await answer()) === null);
  };
  const READY_SAID = `window.__said.some(t => t.includes(${JSON.stringify(READY)}))`;
  /** Until the status line is quiet (the job's or the portal's opening line down: it is said only then), and 3 s more. */
  const quietThen = async () => {
    ok('...its status line goes quiet', await until(inApp(`(() => { const s = window.__said; const t = s[s.length - 1] || '';
      return !/^Opened /.test(t) && !/by the portal/.test(t); })()`), 25000), await said());
    await sleep(3000);
  };

  log("\n-- 10. a worker from before 'ptt-cache?' in front, one file slow: a page part old and part new is behind --");
  for (const [file, what, key] of [['css/app.css', 'its stylesheet', 'css'], ['js/render/renderer.js', 'a module (renderer.js)', 'rend']]) {
    for (const job of [false, true]) {
      const [from, to] = job ? (key === 'css' ? ['N', 'O'] : ['R', 'S']) : (key === 'css' ? ['P', 'Q'] : ['T', 'U']);
      await oldInCharge(from);
      const l10 = await loads();
      version = to;
      slowFile = file;
      slowMs = 4000;
      installHoldMs = job ? 9000 : 0;   // with a job: the new worker takes over once it is open
      await go(`${ORIGIN}/takeoff/index.html`);
      await appUp();
      const mixed = await ran();
      ok(`${to} put up, ${what} slow: the page came part from ${from}'s cache (${what} ${from}'s, main.js ${to}'s)`,
        mixed[key] === from && mixed.main === to, mixed);
      if (job) {
        await openJob();
        ok(`...a job is open, ${from}'s worker still in charge`,
          await until(`TakeoffApp.app.project.pageCount === 1`) && await evaluate(`window.__changes === 0`));
      }
      // (idle, the page may reload the moment it is taken over: its count of changes starts again)
      ok(`...${to}'s worker takes it over`, await settled(to, job ? 1 : 0));
      slowMs = 0;
      installHoldMs = 0;
      if (!job) {
        ok(`...and the page, idle on the start screen, reloads into ${to}`,
          await until(`Number(sessionStorage.getItem('__loads') || 0) === ${l10 + 2} && !!window.TakeoffApp && document.readyState === 'complete'`, 30000),
          { loads: await loads(), l10 });
        await appUp();
        eq(`...and runs ${to}'s files, all of them`, await ran(), { main: to, css: to, rend: to });
      } else {
        ok(`...and the page, with the job open, says a new version is ready`, await until(READY_SAID, 20000), await said());
        const s10 = await said();
        const at10 = s10.findIndex(t => t.includes(READY));
        ok(`...once the status line is quiet (it replaced "${at10 > 0 ? s10[at10 - 1].slice(0, 40) : ''}")`,
          at10 > 0 && !/^Opened /.test(s10[at10 - 1]), s10);
        eq('...without reloading under the job', await loads(), l10 + 1);
      }
    }
  }
  slowFile = '';

  log("\n-- 11. a worker from before 'ptt-cache?' in front, every file fast: the page IS the new version, and nothing is said --");
  // a tab, idle
  await oldInCharge('V');
  const l11 = await loads();
  version = 'W';
  await go(`${ORIGIN}/takeoff/index.html`);
  await appUp();
  eq("W put up: the page runs W's files, all from the network", await ran(), { main: 'W', css: 'W', rend: 'W' });
  ok("...W's worker takes it over", await settled('W', 1));
  await sleep(5000);
  eq('...the page, idle on the start screen, does not reload', await loads(), l11 + 1);
  ok('...nor says a new version is ready', !(await said()).some(t => t.includes(READY)), await said());
  // a tab, a job open
  await oldInCharge('X');
  const l11b = await loads();
  version = 'Y';
  installHoldMs = 9000;
  await go(`${ORIGIN}/takeoff/index.html`);
  await appUp();
  await openJob();
  ok("Y put up, a job opened while X's worker is still in charge",
    await until(`TakeoffApp.app.project.pageCount === 1`) && await evaluate(`window.__changes === 0`));
  ok("...Y's worker takes it over", await settled('Y', 1));
  installHoldMs = 0;
  await quietThen();
  ok('...and the page, running Y, says nothing of a new version, its status line quiet', !(await said()).some(t => t.includes(READY)), await said());
  eq('...nor reloads', await loads(), l11b + 1);
  // the portal's frame, its plan open
  await oldInCharge('Z');
  W = FRAME;
  version = 'AA';
  await go(`${ORIGIN}/`);
  ok('the portal framed the app (AA put up) and handed the plan over',
    await until(inApp(`!!(window.TakeoffApp && TakeoffApp.app.project.pageCount === 1)`), 30000));
  ok("...its arrival line said, Z's worker in front of the frame",
    await until(inApp(`window.__said.some(t => /by the portal/.test(t))`), 10000)
    && await evaluate(inApp(`performance.getEntriesByType('navigation')[0].workerStart > 0`)), await said());
  const l11c = await loads();
  ok("...AA's worker takes the frame over", await settled('AA', 1));
  await quietThen();
  const s11 = await said();
  ok('...and the frame says nothing of a new version, over its arrival line or after it', !s11.some(t => t.includes(READY)), s11);
  eq('...nor reloads', await loads(), l11c);
  W = TAB;

  log("\n-- 12. a browser without FetchEvent.resultingClientId, the page itself (index.html) slow: it came from the worker's cache, the rest from the network --");
  // There a navigation names no client of its own, and its clientId is the
  // page it came FROM: the worker keeps such a navigation by its time, never
  // under that page -- kept under it, the page being made was told it had
  // nothing from the cache, and took itself for the new version.
  /** A clean slate, then version v (this checkout's worker) in front of a page, in such a browser. */
  const noRidInCharge = async v => {
    W = TAB;
    await go(`${ORIGIN}/takeoff/index.html`);
    await appUp();
    await evaluate(`(async () => {
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
      for (const k of await caches.keys()) await caches.delete(k);
    })()`);
    noResultingId = true;
    version = v;
    await go(`${ORIGIN}/takeoff/index.html`);
    await appUp();
    const installed = await settled(v, 1);
    await go(`${ORIGIN}/takeoff/index.html`);
    await appUp();
    const via = await evaluate(`performance.getEntriesByType('navigation')[0].workerStart > 0`);
    const rid = await evaluate(`new Promise(r => { const w = navigator.serviceWorker.controller; if (!w) { r('no worker'); return; }
      const c = new MessageChannel(); const t = setTimeout(() => r('no answer'), 1500);
      c.port1.onmessage = ev => { clearTimeout(t); r(ev.data); }; w.postMessage({ type: 'no-rid?' }, [c.port2]); })`);
    const ans = await answer();
    ok(`${v} installed and in front of the page, in a browser whose FetchEvent.resultingClientId reads '' -- and it answers 'ptt-cache?'`,
      installed && via && rid === '' && !!ans && ans.cache === cacheOf(v), { installed, via, rid, ans });
  };
  const pageRan = () => evaluate(inApp(`(document.querySelector('meta[name=served]') || {}).content || ''`));
  for (const job of [false, true]) {
    const [from, to] = job ? ['AD', 'AE'] : ['AB', 'AC'];
    await noRidInCharge(from);
    const l12 = await loads();
    version = to;
    slowFile = 'index.html';
    slowMs = 4000;
    installHoldMs = job ? 9000 : 0;   // with a job: the new worker takes over once it is open
    await go(`${ORIGIN}/takeoff/index.html`);
    await appUp();
    const page = await pageRan();
    const mixed = await ran();
    ok(`${to} put up, the page itself slow: index.html came from ${from}'s cache, main.js and the rest ${to}'s`,
      page === from && mixed.main === to && mixed.css === to && mixed.rend === to, { page, mixed });
    if (job) {
      await openJob();
      ok(`...a job is open, ${from}'s worker still in charge`,
        await until(`TakeoffApp.app.project.pageCount === 1`) && await evaluate(`window.__changes === 0`));
    }
    ok(`...${to}'s worker takes it over`, await settled(to, job ? 1 : 0));
    slowMs = 0;
    installHoldMs = 0;
    if (!job) {
      ok(`...and the page, idle on the start screen, reloads into ${to}`,
        await until(`Number(sessionStorage.getItem('__loads') || 0) === ${l12 + 2} && !!window.TakeoffApp && document.readyState === 'complete'`, 30000),
        { loads: await loads(), l12 });
      await appUp();
      eq(`...and runs ${to}'s page and files, all of them`, [await pageRan(), await ran()], [to, { main: to, css: to, rend: to }]);
    } else {
      ok('...and the page, with the job open, says a new version is ready', await until(READY_SAID, 20000), await said());
      eq('...without reloading under the job', await loads(), l12 + 1);
    }
  }
  slowFile = '';
  // ...and with every file fast, in such a browser the page IS the new version
  await noRidInCharge('AF');
  const l12c = await loads();
  version = 'AG';
  await go(`${ORIGIN}/takeoff/index.html`);
  await appUp();
  eq("AG put up, every file fast: the page runs AG's page and files, all from the network", [await pageRan(), await ran()],
    ['AG', { main: 'AG', css: 'AG', rend: 'AG' }]);
  ok("...AG's worker takes it over", await settled('AG', 1));
  await sleep(5000);
  eq('...the page, idle on the start screen, does not reload', await loads(), l12c + 1);
  ok('...nor says a new version is ready', !(await said()).some(t => t.includes(READY)), await said());
  noResultingId = false;
} catch (err) {
  fails += 1;
  log(`FAIL the browser run: ${err.stack || err}`);
}

log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass -- 'a new version is ready' only when the page runs an older one than its worker (a first visit's page, a slow line's half-old page and a stalled read of sw.js included, behind a worker from before 'ptt-cache?' and in a browser without resultingClientId too), never over the portal's arrival line, never for the portal's own worker`);
await finish(fails ? 1 : 0);
