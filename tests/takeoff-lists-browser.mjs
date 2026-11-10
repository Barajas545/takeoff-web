// TAKEOFF LISTS IN A REAL BROWSER, by real taps: a job of several takeoffs,
// made by the desktop 3.08's own tools (tests/data/two-takeoffs.takeoff:
// Main renamed House, Deck, the job left in Deck), opened by a real tap on
// "Open a .takeoff project" and the file chooser, at a desktop's width
// (mouse, the standard layout) and a phone's (touch).
//
//   A. Opening it SAYS so, once, after "Opened …": in the status line where
//      it is drawn -- on the bar's one line, inside the bar and the window,
//      the scale readout beside it on its own one line, the whole line in
//      its tooltip -- and as the finger's toast on a phone (no status line
//      there). The project title and the tab name the takeoff: "Two
//      Takeoffs — House", the title on screen where he can read it (on a
//      phone, at the far end of the menubar a finger swipes along). Nothing
//      is marked unsaved.
//   B. The Items list's first line says which takeoff it is of, on screen
//      (the column at a desktop's width, the drawer on a phone).
//   C. On X1.0's own drawing, by real pointer events at a shape's exact
//      pixels (worked out from the page through the app's viewport): a tap,
//      a hold (a finger's; a mouse's right-click) and a drag on Deck's
//      "Deck boards" select nothing, open no item menu and move nothing --
//      the change count does not move; the same on House's "Slab" select
//      it, open its menu and move its corner.
//
// Every layout in a Chrome of its own on a fresh profile, its service workers
// and caches cleared and the HTTP cache off, with proof the code came from
// this checkout over the network. Synthetic: sheet labels X1.0-X3.0. Chrome or Edge is found at
// its usual place or at $CHROME; without one this SKIPS (exit 2).
// PTT_SHOTS=<folder> keeps a screenshot of each layout's moments there.
// Run: node tests/takeoff-lists-browser.mjs [WxH ...]
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.normalize(path.join(here, '..'));
const SHOTS = process.env.PTT_SHOTS || '';

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

// ── the job: the desktop's own file, under the name he would see ─────────
const jobDir = mkdtempSync(path.join(tmpdir(), 'tlb-job-'));
const JOB_NAME = 'Two Takeoffs.takeoff';
const JOB_PATH = path.join(jobDir, JOB_NAME);
copyFileSync(path.join(here, 'data', 'two-takeoffs.takeoff'), JOB_PATH);

// What is said (spec section 4), as he reads it: Main is "House" on the
// desktop, Deck holds 6 items, and the desktop left the job in Deck.
const OPEN_WORDS = 'This job also has Deck (6 items), worked on in the desktop app. Here you see, total and report '
  + 'House only; what you add goes in House. It was left in Deck on the desktop, which will open it there again.';
const NOTE = 'Takeoff: House. This job also has Deck (6 items), worked on in the desktop app — not shown or totalled here.';
// Two shapes of X1.0, by their own corners (page pixels, as the file holds
// them): House's Slab and Deck's Deck boards, each 40 x 30.
const SHAPES = { Slab: [10, 10], 'Deck boards': [200, 200] };

// ── a static server over this checkout, read-only, never cached ──────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.normalize(path.join(ROOT, p));
    if (!f.startsWith(ROOT) || f.includes(`${path.sep}tests${path.sep}`)) { res.writeHead(403); res.end(); return; }
    const b = await readFile(f);
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(b);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

// ── headless Chrome, a throw-away profile per layout, the DevTools protocol ──
// (one profile per layout: what one layout's edits leave on the device -- a
// draft of the job -- must not be offered to the next one's open)
let chrome = null;
let profile = null;
const profiles = [];
let ws = null;
const waiting = new Map();
const handlers = new Set();
let seq = 0;
// Every call answers within a minute or fails, naming itself: a protocol
// call that never returns must be a FAIL, never a run that never ends.
function send(method, params = {}, sessionId) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((res, rej) => {
    const t = setTimeout(() => { waiting.delete(id); rej(new Error(`${method}: no answer in 60 s`)); }, 60000);
    waiting.set(id, { res: v => { clearTimeout(t); res(v); }, rej: e => { clearTimeout(t); rej(e); } });
  });
}
/** A fresh Chrome on a fresh profile, connected; false when it did not start. */
async function startChrome() {
  profile = mkdtempSync(path.join(tmpdir(), 'tlb-'));
  profiles.push(profile);
  chrome = spawn(EXE, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-gpu', 'about:blank'],
  { stdio: 'ignore', windowsHide: true });
  let port = '';
  for (let i = 0; i < 150 && !port; i++) {
    try { port = readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8'); } catch { await sleep(100); }
  }
  if (!port) return false;
  const [p, wsPath] = port.trim().split('\n');
  ws = new WebSocket(`ws://127.0.0.1:${p}${wsPath}`);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = m => {
    const msg = JSON.parse(typeof m.data === 'string' ? m.data : m.data.toString());
    if (msg.id && waiting.has(msg.id)) {
      const w = waiting.get(msg.id);
      waiting.delete(msg.id);
      if (msg.error) w.rej(new Error(msg.error.message)); else w.res(msg.result);
    } else if (msg.method) for (const h of handlers) h(msg);
  };
  return true;
}
async function stopChrome() {
  try { if (ws) await Promise.race([send('Browser.close'), sleep(2000)]); } catch { /* gone */ }
  try { ws?.close(); } catch { /* gone */ }
  ws = null;
  try { chrome?.kill(); } catch { /* gone */ }
  chrome = null;
  await sleep(300);
}
async function finish(code) {
  await stopChrome();
  server.close();
  await sleep(300);
  for (const d of [...profiles, jobDir]) {
    try { rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* locked */ }
  }
  process.exit(code);
}

const LAYOUTS = [
  { name: 'desktop', w: 1280, h: 800, touch: false, mobile: false, standard: true, zoom: 1.5 },
  { name: 'phone upright', w: 390, h: 844, touch: true, mobile: true, zoom: 1.0 },
];

async function layout(L) {
  log(`\n-- ${L.name} ${L.w}x${L.h} (${L.touch ? 'touch' : 'mouse, the standard layout'}) --`);
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (m, prm) => send(m, prm, sessionId);
  await call('Page.enable');
  await call('Network.enable');
  await call('Network.setCacheDisabled', { cacheDisabled: true });
  await call('Emulation.setDeviceMetricsOverride', { width: L.w, height: L.h, deviceScaleFactor: 1, mobile: L.mobile });
  await call('Emulation.setTouchEmulationEnabled', L.touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  await call('Page.addScriptToEvaluateOnNewDocument', {
    source: `try { localStorage.setItem('ptt.settings.v1', JSON.stringify(${JSON.stringify(L.standard ? { ui_mode: 'standard' } : {})})); } catch (e) {}`,
  });
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
  const shot = async what => {
    if (!SHOTS) return;
    const r = await call('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path.join(SHOTS, `tl-${L.w}x${L.h}-${what}.png`), Buffer.from(r.data, 'base64'));
  };
  const mouse = (type, x, y, button = 'left', buttons = 0) => call('Input.dispatchMouseEvent',
    { type, x, y, button, buttons, clickCount: type === 'mouseMoved' ? 0 : 1 });
  const tap = async (x, y) => {
    if (L.touch) {
      await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await sleep(40);
      await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await mouse('mouseMoved', x, y, 'none');
      await mouse('mousePressed', x, y, 'left', 1);
      await sleep(30);
      await mouse('mouseReleased', x, y, 'left', 0);
    }
    await sleep(200);
  };
  /** A finger held still past the long press; a mouse's right-click (the desktop's). */
  const hold = async (x, y) => {
    if (L.touch) {
      await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await sleep(800);
      await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await mouse('mouseMoved', x, y, 'none');
      await mouse('mousePressed', x, y, 'right', 2);
      await sleep(30);
      await mouse('mouseReleased', x, y, 'right', 0);
    }
    await sleep(300);
  };
  const drag = async (x0, y0, x1, y1, steps = 10) => {
    if (L.touch) {
      await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
      for (let i = 1; i <= steps; i++) {
        await sleep(25);
        await call('Input.dispatchTouchEvent', { type: 'touchMove',
          touchPoints: [{ x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps, id: 1 }] });
      }
      await sleep(150);
      await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await mouse('mouseMoved', x0, y0, 'none');
      await mouse('mousePressed', x0, y0, 'left', 1);
      for (let i = 1; i <= steps; i++) {
        await sleep(20);
        await mouse('mouseMoved', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, 'left', 1);
      }
      await mouse('mouseReleased', x1, y1, 'left', 0);
    }
    await sleep(300);
  };
  const key = async (k, code, vk) => {
    await call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
    await sleep(100);
  };
  /** The centre of what `expr` finds, if it is on screen and nothing covers it: [x, y] or null. */
  const at = async expr => evaluate(`(() => { const e = ${expr}; if (!e) return null;
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) return null;
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return null;
    const top = document.elementFromPoint(x, y);
    return top && (top === e || e.contains(top)) ? [x, y] : null; })()`);
  const tapOn = async (expr, label) => {
    const c = await at(expr);
    if (!ok(`${L.name}: ${label} is on screen to tap`, !!c)) return false;
    await tap(c[0], c[1]);
    return true;
  };
  /** A point of the element by id that nothing covers, along its middle row (a scrim under a drawer). */
  const tapFree = async (id, label) => {
    const c = await evaluate(`(() => { const e = document.getElementById(${JSON.stringify(id)});
      const r = e.getBoundingClientRect(); const y = r.top + r.height / 2;
      for (let x = r.left + 4; x < r.right; x += 8) if (document.elementFromPoint(x, y) === e) return [x, y];
      return null; })()`);
    if (!ok(`${L.name}: ${label} is on screen to tap`, !!c)) return false;
    await tap(c[0], c[1]);
    return true;
  };
  /** The toolbars, slid away, brought down as a mouse brings them (to the top edge). */
  const pullDown = async () => {
    const away = await evaluate(`(() => { const a = document.getElementById('app');
      return a.classList.contains('chrome-float') && !a.classList.contains('chrome-open'); })()`);
    if (!away) return;
    if (L.touch) {
      await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: L.w / 2, y: 2, id: 1 }] });
      for (let i = 1; i <= 8; i++) {
        await sleep(25);
        await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: L.w / 2, y: 2 + 20 * i, id: 1 }] });
      }
      await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await mouse('mouseMoved', L.w / 2, 1, 'none');
    }
    await sleep(500);
  };

  // ── a clean slate: no worker, no cache, no storage, the page loaded fresh ──
  await go(`${ORIGIN}/index.html?nofsapi`);
  await sleep(1500);
  await evaluate(`(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
  })()`);
  await call('Network.clearBrowserCache');
  await go(`${ORIGIN}/index.html?nofsapi`);
  await sleep(800);
  const fresh = await evaluate(`(async () => {
    const nav = performance.getEntriesByType('navigation')[0];
    const js = performance.getEntriesByType('resource').find(e => /\\/js\\/main\\.js$/.test(e.name));
    const served = await (await fetch('js/main.js', { cache: 'no-store' })).text();
    return { nav: !!nav && nav.workerStart === 0 && nav.transferSize > 0,
      js: !!js && js.workerStart === 0 && js.transferSize > 0, served: served.length };
  })()`);
  ok(`${L.name}: the page and main.js came over the network from this checkout, no worker in front of them`,
    fresh.nav && fresh.js, fresh);
  eq(`${L.name}: ...and the main.js served is the one on disk`, fresh.served,
    readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8').length);

  // ── A. a real tap opens the desktop's job, and it says what is here ──
  await call('Page.setInterceptFileChooserDialog', { enabled: true });
  const chooser = once('Page.fileChooserOpened');
  const openAt = await at(`document.querySelector('.es-btn.primary')`);
  if (!ok(`${L.name}: "Open a .takeoff project" is on screen to tap`, !!openAt)) return;
  // The tap's lift is answered once the page has handled it, and the page
  // opens the chooser while handling it: the chooser is waited for beside
  // the tap, never after it.
  const tapping = tap(openAt[0], openAt[1]);
  const fc = await Promise.race([chooser, sleep(8000).then(() => null)]);
  if (!ok(`${L.name}: the tap opened the file chooser`, !!fc)) return;
  await call('DOM.setFileInputFiles', { files: [JOB_PATH], backendNodeId: fc.backendNodeId });
  await tapping;
  for (let i = 0; i < 60; i++) {
    if (await evaluate('!!(window.TakeoffApp && TakeoffApp.app.project.pageCount === 3 && document.getElementById("progress").hidden)')) break;
    await sleep(200);
  }
  // what is said: the status line and the finger's toast, watched until it is said (the toast is up 4 s)
  let said = null;
  for (let i = 0; i < 30; i++) {
    said = await evaluate(`(() => {
      const t = document.getElementById('fingerToast');
      const bar = document.querySelector('.statusbar');
      const cs = t && getComputedStyle(t);
      const tr = t && t.getBoundingClientRect();
      return { status: document.getElementById('statusText').textContent,
        statusDrawn: !!bar && getComputedStyle(bar).display !== 'none',
        toast: t && !t.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && tr.width > 0
          && tr.left >= 0 && tr.right <= innerWidth && tr.top >= 0 && tr.bottom <= innerHeight ? t.textContent : null,
        title: document.getElementById('projTitle').textContent, tab: document.title,
        dirty: TakeoffApp.app.project.dirty, dialog: !!document.querySelector('.modal:not([hidden]), dialog[open]') };
    })()`);
    if (said.status.includes(OPEN_WORDS) && (!L.touch || said.toast)) break;
    await sleep(100);
  }
  await shot('opened');
  ok(`${L.name}: A. the job opened, no question asked`, !said.dialog, said);
  const opened = said.status.indexOf(`Opened ${JOB_NAME}`);
  const words = said.status.indexOf(OPEN_WORDS);
  if (L.mobile) {
    // The status line is not drawn here: the toast is what he sees (its
    // line holds the sentence last, as sayToFinger leaves it).
    ok(`${L.name}: A. no status line is drawn here -- and the sentence is the finger's toast, on screen`,
      !said.statusDrawn && said.toast === OPEN_WORDS, said);
    ok(`${L.name}: A. ...said once`, words >= 0 && said.status.indexOf(OPEN_WORDS, words + 1) < 0, said.status);
  } else {
    ok(`${L.name}: A. the status line says it once, after "Opened …"`, opened === 0 && words > opened
      && said.status.indexOf(OPEN_WORDS, words + 1) < 0, said.status);
    ok(`${L.name}: A. the status line is drawn here, and no toast`, said.statusDrawn && said.toast === null, said);
  }
  if (!L.mobile) {
    // The bar is one line, 24 px: the sentence on it, not wrapped out of it
    // (its line boxes, read with a Range: a flex item's own box is one
    // rect however many lines its text takes).
    const fit = await evaluate(`(() => {
      const bar = document.querySelector('.statusbar').getBoundingClientRect();
      const boxes = el => { const r = document.createRange(); r.selectNodeContents(el);
        return [...r.getClientRects()].filter(b => b.width > 0 && b.height > 0).map(b => [b.top, b.bottom]); };
      const lines = l => { const tops = l.map(b => b[0]).sort((a, b) => a - b);
        return tops.filter((t, i) => i === 0 || t - tops[i - 1] > 4).length; };
      const inside = l => l.every(([t, b]) => t >= bar.top - 0.5 && b <= bar.bottom + 0.5 && b <= innerHeight);
      const st = document.getElementById('statusText');
      const s = boxes(st), right = boxes(document.querySelector('.status-right'));
      return { lines: lines(s), rightLines: lines(right), inside: inside(s) && inside(right),
        tip: st.title === st.textContent && st.textContent.includes(${JSON.stringify(OPEN_WORDS)}),
        bar: [bar.top, bar.bottom, innerHeight], s, right };
    })()`);
    ok(`${L.name}: A. ...on the status bar's one line, inside the bar and the window, the scale readout on its own one line`,
      fit.lines === 1 && fit.rightLines <= 1 && fit.inside, fit);
    ok(`${L.name}: A. ...and the whole line is its tooltip`, fit.tip, fit);
  }
  eq(`${L.name}: A. the project title and the tab name the takeoff`, [said.title, said.tab],
    ['Two Takeoffs — House', 'Two Takeoffs — House — Professional Takeoff Tools']);
  ok(`${L.name}: A. nothing is marked unsaved`, said.dirty === false);
  // ...and the title is SEEN: its centre inside the window, nothing over it.
  // The toolbars are brought down first; on a phone the title sits at the
  // far end of the menubar, which scrolls sideways -- a finger swipes it
  // along, as he would, until the title is in view.
  await pullDown();
  const TITLE = `document.getElementById('projTitle')`;
  let seen = await at(TITLE);
  for (let i = 0; i < 6 && !seen && L.touch; i++) {
    const bar = await evaluate(`(() => { const r = document.querySelector('.menubar').getBoundingClientRect();
      return [r.top + r.height / 2, Math.min(r.right, innerWidth)]; })()`);
    await drag(bar[1] - 30, bar[0], 30, bar[0]);
    seen = await at(TITLE);
  }
  await shot('title');
  ok(`${L.name}: A. the title is on screen where he can read it${L.touch ? ' (the menubar swiped along by a finger)' : ''}`,
    !!seen, await evaluate(`(() => { const r = ${TITLE}.getBoundingClientRect();
      return { rect: [r.left, r.top, r.width, r.height], innerWidth,
        scrolled: document.querySelector('.menubar').scrollLeft }; })()`));

  // ── Edit Mode, by a real tap ──
  if (L.mobile) {
    await tapOn(`document.getElementById('mbarMode')`, 'the foot bar\'s Edit');
  } else {
    await pullDown();
    await tapOn(`document.getElementById('modeBtn')`, 'Edit Mode');
    // ...and the pointer away again, so the toolbars slide back up off the list
    await mouse('mouseMoved', L.w / 2, L.h / 2, 'none');
    for (let i = 0; i < 20; i++) {
      if (!(await evaluate(`document.getElementById('app').classList.contains('chrome-open')`))) break;
      await sleep(150);
    }
    await sleep(400);
  }
  await sleep(500);
  if (!ok(`${L.name}: Edit Mode is on`, await evaluate('TakeoffApp.app.editing'))) return;
  if (!L.mobile) {
    // Edit Mode said its own sentence: the line has moved on, and the hold
    // that kept the takeoffs sentence on one line has let it go.
    const after = await evaluate(`(() => { const st = document.getElementById('statusText');
      return { text: st.textContent, has: st.textContent.includes(${JSON.stringify(OPEN_WORDS)}),
        oneLine: st.classList.contains('one-line'), tip: st.getAttribute('title') }; })()`);
    ok(`${L.name}: A. once the status line has moved on, it is its own again (no one-line hold, no tooltip)`,
      !after.has && !after.oneLine && after.tip === null && !!after.text, after);
  }

  // ── B. the Items list says which takeoff it is of ──
  if (L.mobile) {
    await tapOn(`document.querySelector('.mbar-btn[data-act="toggle-items"]')`, 'the foot bar\'s Items');
    await sleep(450);
  }
  // (on screen: inside the list's own box, as it is scrolled, and nothing over it)
  const note = await evaluate(`(() => { const n = document.querySelector('#itemList > .takeoff-note');
    if (!n) return null; const r = n.getBoundingClientRect(); const list = document.getElementById('itemList');
    const lr = list.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { first: list.firstElementChild === n, text: n.textContent,
      on: r.width > 0 && r.height > 0 && r.left >= lr.left - 1 && r.right <= lr.right + 1 && r.top >= lr.top - 1
        && r.bottom <= lr.bottom + 1 && r.bottom <= innerHeight && top === n,
      wraps: n.scrollWidth <= n.clientWidth + 1, scrollTop: list.scrollTop }; })()`);
  await shot('items');
  eq(`${L.name}: B. the Items list's first line, on screen and inside the list`, note && [note.first, note.text, note.on, note.wraps],
    [true, NOTE, true, true]);
  if (note && !note.on) log(`  (the list scrolled to ${note.scrollTop})`);
  if (L.mobile) {
    await tapFree('scrim', 'the scrim beside the drawer (shuts it)');
    await sleep(400);
    ok(`${L.name}: B. ...and the drawer shut again`, await evaluate(`!document.getElementById('itemsPanel').classList.contains('mopen')`));
  }

  // ── C. Deck's pixels take nothing; House's do ──
  ok(`${L.name}: C. X1.0 is on screen, its own drawing`,
    await evaluate(`TakeoffApp.app.currentPage === 0 && !TakeoffApp.versionView.revId`));
  // The view: both shapes on screen, clear of the bars (only the view is set
  // here; every press below is a real event at the shapes' pixels).
  const place = () => evaluate(`(() => { TakeoffApp.viewport.setZoomAt(0, 0, ${L.zoom});
    TakeoffApp.viewport.centerOn(125, 120); TakeoffApp.requestDraw(); return true; })()`);
  /** A point of X1.0 (page pixels) on screen, and whether the canvas is what is under it. */
  const onSheet = (px, py) => evaluate(`(() => { const c = document.getElementById('canvas');
    const b = c.getBoundingClientRect(); const [sx, sy] = TakeoffApp.viewport.toScreen(${px}, ${py});
    const x = b.left + sx, y = b.top + sy;
    const hit = x >= 0 && y >= 0 && x < innerWidth && y < innerHeight ? document.elementFromPoint(x, y) : null;
    return { x, y, canvas: hit === c }; })()`);
  const state = name => evaluate(`(() => { const p = TakeoffApp.app.project;
    const m = (p.measurements[0] || []).find(x => x.name === ${JSON.stringify(name)} && !x.group_child);
    const menu = document.getElementById('ctxMenu');
    return { uid: m && m._uid, pts: m && JSON.stringify(m.points), changes: p.changeCount,
      selected: [...TakeoffApp.controller.selected], menu: !menu.hidden }; })()`);
  const blank = async () => {
    const e = await onSheet(125, 120);
    if (e.canvas) await tap(e.x, e.y);
    if (await evaluate(`!document.getElementById('ctxMenu').hidden`)) await key('Escape', 'Escape', 27);
  };
  await place();
  await sleep(300);
  for (const [name, [x0, y0]] of Object.entries(SHAPES)) {
    const deck = name === 'Deck boards';
    const mid = await onSheet(x0 + 20, y0 + 15);
    const corner = await onSheet(x0, y0);
    if (!ok(`${L.name}: C. ${name}'s middle and corner are on screen, the canvas under them`, mid.canvas && corner.canvas,
      { mid, corner })) continue;
    // a tap
    await blank();
    const s0 = await state(name);
    await tap(mid.x, mid.y);
    const s1 = await state(name);
    if (deck) eq(`${L.name}: C. a tap on Deck's ${name} selects nothing`, s1.selected, []);
    else eq(`${L.name}: C. a tap on House's ${name} selects it`, s1.selected, [s1.uid]);
    // a hold (a finger's long press; a mouse's right-click)
    await blank();
    await hold(mid.x, mid.y);
    const s2 = await state(name);
    await shot(`hold-${deck ? 'deck' : 'house'}`);
    if (deck) ok(`${L.name}: C. a ${L.touch ? 'long press' : 'right-click'} on Deck's ${name} opens no item menu, selects nothing`,
      !s2.menu && !s2.selected.length, s2);
    else ok(`${L.name}: C. a ${L.touch ? 'long press' : 'right-click'} on House's ${name} opens its item menu`,
      s2.menu && s2.selected.includes(s2.uid), s2);
    await blank();
    // a drag from its corner
    await place();
    await sleep(200);
    const c2 = await onSheet(x0, y0);
    const before = await state(name);
    await drag(c2.x, c2.y, c2.x + 40, c2.y + 30);
    const after = await state(name);
    if (deck) {
      ok(`${L.name}: C. a drag from Deck's ${name}'s corner moves none of it, and changes nothing`,
        after.pts === before.pts && after.changes === before.changes && after.pts === s0.pts, { before, after });
    } else {
      ok(`${L.name}: C. a drag from House's ${name}'s corner moves that corner -- a change`,
        after.pts !== before.pts && after.changes > before.changes, { before, after });
    }
    await place();
    await sleep(200);
  }
  await call('Page.setInterceptFileChooserDialog', { enabled: false });
  await send('Target.closeTarget', { targetId });
}

try {
  const only = process.argv.slice(2);
  for (const L of LAYOUTS) {
    if (only.length && !only.includes(`${L.w}x${L.h}`)) continue;
    if (!(await startChrome())) {
      console.log('SKIPPED: Chrome did not start');
      await finish(2);
    }
    try {
      await layout(L);
    } catch (err) {
      ok(`${L.name}: ran to the end`, false, err.stack || String(err));
    }
    await stopChrome();
  }
} catch (err) {
  fails += 1;
  log(`FAIL the browser run: ${err.stack || err}`);
}

log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass -- by real taps on a desktop and a phone: a job of several takeoffs says so on open, `
    + 'in its title and its list, and Deck\'s pixels take no tap, hold or drag while House\'s do');
await finish(fails ? 1 : 0);
