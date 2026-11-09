// THE MENUS BY FINGER, AT EVERY WIDTH: every entry of every menu can be
// tapped, and a tap on File › Save is a Save.
//
// Below 1024 px the menu bar scrolls sideways (css/app.css), and a scroller
// clips whatever hangs out of it -- overflow-x makes overflow-y auto as well.
// From the phone build (dda21ce) to this check an open menu there showed as
// nothing but its lit title: a tap where Save should be landed on the sheet,
// on every phone and on an iPad held upright, which inside the portal left no
// way to send a plan back by finger. The open menu now hangs from the chrome
// (main.js placeOpenMenu, wireMenuPlacement), under its title, on screen,
// above the foot bar, and scrolls when it is taller than the room.
//
// So this runs the real page in headless Chrome, with a phone's or a tablet's
// screen and touch (each size in a browser context of its own), and checks:
//  1. the toolbars are pulled down from the top edge as a finger does, when
//     they float (one phone size runs with them pinned instead);
//  2. each of the seven menus opens by a real tap on its title (the bar
//     scrolled to it first, as a finger would), and every entry in it is
//     scrolled into the menu's own view and hit-tested at its centre: the
//     point is that entry, inside the screen, below the menu bar and above
//     the foot bar; below 1024 px the menu hangs under the bar from its
//     title (or as near as the screen allows); at 1024 px and wider it is
//     placed as it always was (no placing by hand, .menu position: relative);
//  3. File › Save tapped for real says what a Save with nothing open says
//     ('Nothing to save yet.'), and shuts the menu; Escape (an iPad's
//     keyboard, a desktop's) shuts an open menu and goes no further -- the
//     app's own keys (the saved overlay, a trace, the versions) never see it
//     -- and with no menu open Escape is the app's as before; a dialog over
//     an open menu keeps its own Escape (one layer at a time);
//  4. below 1024 px:
//     - a scrolled menu keeps its place when the bar scrolls sideways;
//     - with the foot bar's Items drawer open, a menu whose title is clear of
//       the drawer opens over it whole (the toolbars stand above the drawers
//       while a menu is open: every entry hit-tests as itself, also where the
//       menu lies over the drawer, and the drawer stays open), and View ›
//       Project Items Panel then shuts the drawer -- across the sizes at least
//       one menu really lies over the drawer;
//     - a pan on the sheet shuts the open menu (the floating toolbars slide
//       away with it), and with the toolbars pinned a tap on the sheet does;
//     - a menu left open while the screen turns follows its title;
//  5. an iPad sideways (1180 wide) narrowed to 780 x 660 with View open (Split
//     View): the foot bar comes after the 'resize', and the menu is placed
//     again above it -- every entry still tappable;
//  6. the wiring, by text.
//
// Not covered here: a menu opened mid-slide (the room is measured again when
// the slide ends, main.js wireMenuPlacement), and iOS's keyboard (the visual
// viewport; Chrome has no software keyboard).
//
// Synthetic: Chrome, not an iPad's WebKit. Chrome or Edge is found at its
// usual place or at $CHROME; without one this SKIPS (exit 2).
// Run: node tests/menu-touch.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── a static server over this checkout, read-only; no service worker ──────
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.bcmap': 'application/octet-stream', '.pfb': 'application/octet-stream',
  '.ttf': 'font/ttf' };
const SHIPPED = ['index.html', 'manifest.webmanifest', 'css', 'js', 'icons', 'data', 'vendor'];
const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const rel = p.replace(/^\/+/, '');
    // The worker would keep a copy of this page between sizes: none here.
    if (!SHIPPED.some(s => rel === s || rel.startsWith(s + '/'))) { res.writeHead(404); res.end(); return; }
    const f = path.normalize(path.join(ROOT, rel));
    if (!f.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    const b = await readFile(f);
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(b);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

// ── headless Chrome, a throw-away profile, the DevTools protocol ──────────
const profile = mkdtempSync(path.join(tmpdir(), 'mtb-'));
const chrome = spawn(EXE, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-gpu',
  '--window-size=1400,1400', 'about:blank'],
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

const UA_IPAD = 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
// A phone each way (and once with the toolbars pinned), the iPads upright and
// sideways, and a desktop with a mouse.
const SIZES = [
  { w: 390, h: 844, touch: true, ua: UA_PHONE, what: 'a phone upright' },
  { w: 390, h: 844, touch: true, ua: UA_PHONE, what: 'a phone upright, toolbars pinned', pinned: true },
  { w: 844, h: 390, touch: true, ua: UA_PHONE, what: 'a phone sideways' },
  { w: 820, h: 1180, touch: true, ua: UA_IPAD, what: 'an iPad upright' },
  { w: 1180, h: 820, touch: true, ua: UA_IPAD, what: 'an iPad sideways', split: true },
  { w: 1024, h: 1366, touch: true, ua: UA_IPAD, what: 'a 12.9-inch iPad upright' },
  { w: 1366, h: 900, touch: false, ua: '', what: 'a desktop with a mouse' },
];
let overDrawer = 0;          // menus seen lying over an open drawer, all sizes

// What a menu looks like now: where it is, and whether each entry is under a finger.
const REPORT = name => `(() => {
  const menu = document.querySelector('.menu[data-menu=${name}]');
  const pop = menu.querySelector('.menu-pop');
  const title = menu.querySelector('.menu-btn').getBoundingClientRect();
  const bar = document.getElementById('menubar').getBoundingClientRect();
  const foot = document.getElementById('mobileBar');
  const fr = foot.hidden ? null : foot.getBoundingClientRect();
  const footTop = fr && fr.height > 0 ? fr.top : innerHeight;
  const vw = document.documentElement.clientWidth;
  const pr = pop.getBoundingClientRect();
  const drawer = document.querySelector('.thumbs.mopen, .items.mopen');
  const dr = drawer ? drawer.getBoundingClientRect() : null;
  const items = [];
  let onDrawer = false;
  for (const b of pop.querySelectorAll('button')) {
    if (!b.getClientRects().length) continue;      // not offered here
    // into the menu's own view, as a finger scrolls it
    const top = b.offsetTop, h = b.offsetHeight;
    if (top < pop.scrollTop) pop.scrollTop = top;
    else if (top + h > pop.scrollTop + pop.clientHeight) pop.scrollTop = top + h - pop.clientHeight;
    const r = b.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    if (dr && cx >= dr.left && cx <= dr.right && cy >= dr.top && cy <= dr.bottom) onDrawer = true;
    items.push({ act: b.dataset.act || b.textContent.trim().slice(0, 24), hitIsIt: !!hit && hit.closest('button') === b,
      hitWhat: hit ? (hit.id || hit.className || hit.tagName) : null,
      onScreen: r.left >= -0.5 && r.right <= vw + 0.5 && r.top >= bar.bottom - 0.5 && r.bottom <= footTop + 0.5 });
  }
  pop.scrollTop = 0;
  return { open: menu.classList.contains('open'), position: getComputedStyle(menu).position,
    inline: ['--menu-x', '--menu-y', '--menu-max-h'].map(k => pop.style.getPropertyValue(k)).filter(Boolean),
    popLeft: pr.left, popTop: pr.top, popRight: pr.right, popBottom: pr.bottom, titleLeft: title.left, titleBottom: title.bottom,
    barBottom: bar.bottom, footTop, vw, items, onDrawer, drawerOpen: !!drawer };
})()`;

try {
  let port = '';
  for (let i = 0; i < 150 && !port; i++) {
    try { port = readFileSync(path.join(profile, 'DevToolsActivePort'), 'utf8'); } catch { await sleep(100); }
  }
  if (!port) {
    console.log('SKIPPED: Chrome did not start');
    await finish(2);
  }
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

  for (const S of SIZES) {
    const tag = `${S.w}x${S.h} (${S.what})`;
    // A browser context of its own: nothing one size stores reaches the next.
    const { browserContextId } = await send('Target.createBrowserContext');
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const call = (m, prm) => send(m, prm, sessionId);
    const errors = [];
    handlers.add(msg => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails?.exception?.description || 'exception');
    });
    await call('Page.enable');
    await call('Runtime.enable');
    const metrics = (w, h) => call('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: S.touch });
    await metrics(S.w, S.h);
    await call('Emulation.setTouchEmulationEnabled', S.touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
    if (S.ua) await call('Emulation.setUserAgentOverride', { userAgent: S.ua, platform: S.w < 700 || S.h < 500 ? 'iPhone' : 'iPad' });
    // The Escapes the app's own keys are given (3b): a listener put on the
    // document before any script of the page runs, so it is the first of its
    // bubble phase -- ahead of main.js's keys, whatever a later one stops.
    await call('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.__escSeen = 0;
        document.addEventListener('keydown', e => { if (e.key === 'Escape') window.__escSeen += 1; });` });
    if (S.pinned) {
      await call('Page.addScriptToEvaluateOnNewDocument', {
        source: `try { localStorage.setItem('ptt.settings.v1', JSON.stringify({ chrome_pinned: true })); } catch {}` });
    }
    const loaded = new Promise(r => {
      const h = msg => { if (msg.sessionId === sessionId && msg.method === 'Page.loadEventFired') { handlers.delete(h); r(); } };
      handlers.add(h);
    });
    await call('Page.navigate', { url: `${ORIGIN}/index.html` });
    await Promise.race([loaded, sleep(20000)]);
    const evaluate = async expression => {
      const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`${tag}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
      return r.result.value;
    };
    for (let i = 0; i < 100 && !(await evaluate(`!!document.querySelector('#menus .menu') && !!window.TakeoffApp`)); i++) await sleep(100);
    await sleep(400);

    const tap = async (x, y) => {
      x = Math.round(x); y = Math.round(y);
      if (S.touch) {
        await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
      }
      await sleep(180);
    };
    const drag = async (x, y, dx, dy, steps = 8) => {
      x = Math.round(x); y = Math.round(y);
      await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= steps; i++) {
        await call('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(x + dx * i / steps), y: Math.round(y + dy * i / steps) }] });
        await sleep(16);
      }
      await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(250);
    };
    const centre = sel => evaluate(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const isOpen = name => evaluate(`document.querySelector('.menu[data-menu=${name}]').classList.contains('open')`);
    const anyOpen = () => evaluate(`!!document.querySelector('#menus .menu.open')`);
    // a title's tap: the bar scrolled to it first, as a finger would
    const tapTitle = async name => {
      await evaluate(`document.querySelector('.menu[data-menu=${name}] .menu-btn').scrollIntoView({ block: 'nearest', inline: 'nearest' })`);
      await sleep(120);
      const c = await centre(`.menu[data-menu=${name}] .menu-btn`);
      await tap(c.x, c.y);
    };

    // 1. the toolbars, pulled down when they float
    const chromeState = () => evaluate(`(() => { const a = document.getElementById('app');
      return { float: a.classList.contains('chrome-float'), open: a.classList.contains('chrome-open') }; })()`);
    const pullChrome = async () => {
      const s0 = await chromeState();
      if (!s0.float || s0.open) return s0;
      const e = await centre('#chromeEdge');
      if (S.touch) await drag(e.x, e.y, 0, 60, 6);
      else await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(e.x), y: Math.round(e.y) });
      await sleep(400);
      return chromeState();
    };
    const st = await pullChrome();
    ok(`${tag}: the toolbars are down`, !st.float || st.open, st);
    if (S.pinned) ok(`${tag}: the toolbars are pinned`, !st.float, st);

    // 2. every entry of every menu
    const narrow = S.w < 1024;
    const menus = await evaluate(`[...document.querySelectorAll('#menus .menu')].map(m => m.dataset.menu)`);
    ok(`${tag}: seven menus`, menus.length === 7, menus);
    for (const name of menus) {
      await tapTitle(name);
      const m = await evaluate(REPORT(name));
      ok(`${tag}: a tap on ${name} opens it`, m.open, m);
      const bad = m.items.filter(i => !i.hitIsIt || !i.onScreen);
      ok(`${tag}: every entry of ${name} can be tapped (${m.items.length})`, m.items.length > 0 && bad.length === 0, bad);
      ok(`${tag}: ${name} is on screen`, m.popLeft >= -0.5 && m.popRight <= m.vw + 0.5 && m.popBottom <= m.footTop + 0.5,
        { left: m.popLeft, right: m.popRight, bottom: m.popBottom, vw: m.vw, footTop: m.footTop });
      if (narrow) {
        ok(`${tag}: ${name} hangs under the bar`, Math.abs(m.popTop - m.barBottom) < 1, { popTop: m.popTop, barBottom: m.barBottom });
        ok(`${tag}: ${name} starts at its title, or as near as the screen allows`,
          Math.abs(m.popLeft - Math.max(6, Math.min(m.titleLeft, m.vw - (m.popRight - m.popLeft) - 6))) < 1,
          { popLeft: m.popLeft, titleLeft: m.titleLeft });
      } else {
        ok(`${tag}: ${name} is placed as it always was (no hand placing)`, m.inline.length === 0 && m.position === 'relative', m);
        ok(`${tag}: ${name} hangs from its own title`, Math.abs(m.popLeft - m.titleLeft) < 1 && Math.abs(m.popTop - m.titleBottom) < 1,
          { popLeft: m.popLeft, titleLeft: m.titleLeft, popTop: m.popTop, titleBottom: m.titleBottom });
      }
      await tapTitle(name);
      ok(`${tag}: a second tap on ${name} closes it`, !(await isOpen(name)));
    }

    // 3. File › Save by a real tap
    await tapTitle('file');
    const sv = await evaluate(`(() => { const pop = document.querySelector('.menu[data-menu=file] .menu-pop');
      const b = pop.querySelector('button[data-act=save]');
      if (b.offsetTop + b.offsetHeight > pop.scrollTop + pop.clientHeight) pop.scrollTop = b.offsetTop + b.offsetHeight - pop.clientHeight;
      document.getElementById('statusText').textContent = '';
      const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await tap(sv.x, sv.y);
    await sleep(200);
    const said = await evaluate(`document.getElementById('statusText').textContent`);
    ok(`${tag}: a tap on File › Save is a Save`, said === 'Nothing to save yet.', said);
    ok(`${tag}: and closes the menu`, !(await anyOpen()));

    // 3b. Escape: the menu's while one is open. The page's first listener
    // (above) counts the Escapes that reached the app's keys.
    ok(`${tag}: the Escape counter is in place, ahead of the app's keys`, (await evaluate('typeof window.__escSeen')) === 'number');
    await evaluate('window.__escSeen = 0');
    const escape = async () => {
      const k = { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 };
      await call('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...k });
      await call('Input.dispatchKeyEvent', { type: 'keyUp', ...k });
      await sleep(150);
    };
    // With a mouse the Save left the pointer over the sheet, and the toolbars
    // go 420 ms after it leaves them: let them go, then reach the top again.
    if (!S.touch) await sleep(900);
    await pullChrome();
    await tapTitle('view');
    ok(`${tag}: View is open before Escape`, await isOpen('view'));
    await escape();
    ok(`${tag}: Escape shuts the open menu`, !(await anyOpen()));
    ok(`${tag}: and goes no further -- the app's own keys never see it`, (await evaluate('window.__escSeen')) === 0,
      await evaluate('window.__escSeen'));
    await escape();
    ok(`${tag}: with no menu open, Escape is the app's as before`, (await evaluate('window.__escSeen')) === 1,
      await evaluate('window.__escSeen'));
    // A dialog over a menu still open (a shortcut pressed with a menu open):
    // the first Escape is the dialog's, the next the menu's.
    const layers = () => evaluate(`({ dialog: document.querySelectorAll('.modal-layer').length,
      menu: !!document.querySelector('#menus .menu.open') })`);
    await evaluate(`(() => { document.querySelector('#menus button[data-act=shortcuts]').click(); return true; })()`);
    // With a mouse the dialog's layer comes up under the pointer: the toolbars
    // hear it leave them and go 420 ms later, shutting an open menu with them.
    // That is over before the menu is put up under the dialog.
    await sleep(S.touch ? 200 : 900);
    await evaluate(`(() => { document.querySelector('.menu[data-menu=view]').classList.add('open'); return true; })()`);
    await sleep(100);
    const l0 = await layers();
    ok(`${tag}: a dialog is up over an open menu`, l0.dialog === 1 && l0.menu, l0);
    await escape();
    const l1 = await layers();
    ok(`${tag}: the first Escape is the dialog's -- the menu stays`, l1.dialog === 0 && l1.menu, l1);
    await escape();
    const l2 = await layers();
    ok(`${tag}: the next Escape is the menu's`, l2.dialog === 0 && !l2.menu, l2);
    ok(`${tag}: and neither reached the app's own keys`, (await evaluate('window.__escSeen')) === 1,
      await evaluate('window.__escSeen'));

    if (S.touch && narrow) {
      // 4a. a scrolled menu keeps its place when the bar scrolls sideways
      await pullChrome();
      await tapTitle('view');
      const kept = await evaluate(`(async () => {
        const pop = document.querySelector('.menu[data-menu=view] .menu-pop');
        if (pop.scrollHeight <= pop.clientHeight + 1) return { scrolls: false };
        pop.scrollTop = 40;
        const bar = document.getElementById('menubar');
        const was = bar.scrollLeft;
        bar.scrollLeft = was > 0 ? was - 5 : was + 5;
        await new Promise(r => setTimeout(r, 150));
        return { scrolls: true, moved: bar.scrollLeft !== was, top: pop.scrollTop };
      })()`);
      if (kept.scrolls) ok(`${tag}: a scrolled menu keeps its place when the bar moves`, Math.abs(kept.top - 40) <= 1, kept);
      else log(`  ${tag}: View fits without scrolling here -- its place has nothing to keep`);
      await tapTitle('view');

      // 4b. the Items drawer open, then the menus over it
      await evaluate(`document.getElementById('menubar').scrollLeft = 0`);
      const ib = await centre('#mbarMain .mbar-btn[data-act=toggle-items]');
      await tap(ib.x, ib.y);
      await sleep(300);
      ok(`${tag}: the foot bar's Items opens its drawer`,
        await evaluate(`document.getElementById('itemsPanel').classList.contains('mopen')`));
      await pullChrome();
      let clearOnes = 0;
      for (const name of menus) {
        const clear = await evaluate(`(() => { const b = document.querySelector('.menu[data-menu=${name}] .menu-btn');
          const r = b.getBoundingClientRect(); if (r.right <= 0 || r.left >= document.documentElement.clientWidth) return false;
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return !!hit && hit.closest('.menu-btn') === b; })()`);
        if (!clear) continue;                        // under the drawer: not reachable while it is open
        clearOnes += 1;
        const c = await centre(`.menu[data-menu=${name}] .menu-btn`);
        await tap(c.x, c.y);
        const m = await evaluate(REPORT(name));
        const bad = m.items.filter(i => !i.hitIsIt || !i.onScreen);
        ok(`${tag}: ${name} opened beside the open drawer is whole -- every entry under the finger`, m.open && bad.length === 0, bad);
        ok(`${tag}: and the drawer stays open`, m.drawerOpen);
        if (m.onDrawer) overDrawer += 1;
        await tap(c.x, c.y);
      }
      // A phone upright: the drawer (84vw) lies over the whole bar, so no
      // title can be reached until it is put away -- as it always was.
      if (!clearOnes) log(`  ${tag}: every menu title is under the open drawer -- nothing to open beside it`);
      const viewClear = await evaluate(`(() => { const b = document.querySelector('.menu[data-menu=view] .menu-btn');
        const r = b.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!hit && hit.closest('.menu-btn') === b; })()`);
      if (viewClear) {
        const c = await centre('.menu[data-menu=view] .menu-btn');
        await tap(c.x, c.y);
        const e = await evaluate(`(() => { const pop = document.querySelector('.menu[data-menu=view] .menu-pop');
          const b = pop.querySelector('button[data-act=toggle-items]');
          if (b.offsetTop + b.offsetHeight > pop.scrollTop + pop.clientHeight) pop.scrollTop = b.offsetTop + b.offsetHeight - pop.clientHeight;
          if (b.offsetTop < pop.scrollTop) pop.scrollTop = b.offsetTop;
          const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
        await tap(e.x, e.y);
        await sleep(300);
        ok(`${tag}: View › Project Items Panel shuts the open drawer`,
          !(await evaluate(`document.getElementById('itemsPanel').classList.contains('mopen')`)));
      } else {
        log(`  ${tag}: View's title is under the open drawer -- the drawer is shut from the foot bar instead`);
        await tap(ib.x, ib.y);
        await sleep(300);
      }
      ok(`${tag}: the drawer is away again`, !(await evaluate(`document.getElementById('itemsPanel').classList.contains('mopen')`)));

      // 4c. the sheet: a pan (floating toolbars) or a tap (pinned) shuts the open menu
      await pullChrome();
      await tapTitle('file');
      ok(`${tag}: File is open before the sheet is touched`, await isOpen('file'));
      // a spot of the sheet itself, clear of the open menu and the bars
      const sc = await evaluate(`(() => { const vw = document.documentElement.clientWidth;
        for (let y = innerHeight - 80; y > 60; y -= 20) for (let x = vw - 12; x > 12; x -= 20) {
          const el = document.elementFromPoint(x, y);
          if (el && el.closest('#stage') && !el.closest('.menu, .tool-opts, .sov-bar')) return { x, y };
        } return null; })()`);
      ok(`${tag}: some of the sheet is clear of the open menu`, !!sc);
      if (S.pinned) await tap(sc.x, sc.y);
      else await drag(sc.x, sc.y, -40, -40);
      ok(`${tag}: a ${S.pinned ? 'tap' : 'pan'} on the sheet shuts the open menu`, !(await anyOpen()));
      if (!S.pinned) ok(`${tag}: and the floating toolbars went away`, !(await chromeState()).open);

      // 4d. the screen turns with a menu open: it follows its title
      await pullChrome();
      await tapTitle('file');
      ok(`${tag}: File is open before the turn`, await isOpen('file'));
      await metrics(S.h, S.w);
      await sleep(400);
      const turned = await evaluate(`(() => { const menu = document.querySelector('.menu.open'); if (!menu) return null;
        const pop = menu.querySelector('.menu-pop'); const pr = pop.getBoundingClientRect();
        const t = menu.querySelector('.menu-btn').getBoundingClientRect();
        const bar = document.getElementById('menubar').getBoundingClientRect();
        const foot = document.getElementById('mobileBar'); const fr = foot.hidden ? null : foot.getBoundingClientRect();
        const footTop = fr && fr.height > 0 ? fr.top : innerHeight;
        return { narrowNow: matchMedia('(max-width: 1023px)').matches, top: pr.top, left: pr.left, barBottom: bar.bottom, bottom: pr.bottom,
          footTop, right: pr.right, vw: document.documentElement.clientWidth, titleLeft: t.left, titleBottom: t.bottom,
          position: getComputedStyle(menu).position, inline: pop.style.getPropertyValue('--menu-x') }; })()`);
      ok(`${tag} turned: the menu is still open`, turned !== null);
      if (turned && turned.narrowNow) {
        ok(`${tag} turned: the open menu follows (under the bar, on screen)`, Math.abs(turned.top - turned.barBottom) < 1
          && turned.bottom <= turned.footTop + 0.5 && turned.right <= turned.vw + 0.5, turned);
      } else if (turned) {
        ok(`${tag} turned to ${S.h} wide: placed as it always was, from its own title`, turned.inline === '' && turned.position === 'relative'
          && Math.abs(turned.left - turned.titleLeft) < 1 && Math.abs(turned.top - turned.titleBottom) < 1, turned);
      }
      await metrics(S.w, S.h);
      await sleep(300);
    }

    // 5. Split View: from 1180 wide to 780 x 660 with View open
    if (S.split) {
      await pullChrome();
      await tapTitle('view');
      ok(`${tag}: View is open before the narrowing`, await isOpen('view'));
      await metrics(780, 660);
      await sleep(500);
      const m = await evaluate(REPORT('view'));
      const bad = m.items.filter(i => !i.hitIsIt || !i.onScreen);
      ok(`${tag} narrowed to 780x660: View ends above the foot bar that came`, m.open && m.popBottom <= m.footTop + 0.5,
        { popBottom: m.popBottom, footTop: m.footTop });
      ok(`${tag} narrowed to 780x660: every entry of View can still be tapped`, bad.length === 0, bad);
      await metrics(S.w, S.h);
      await sleep(300);
    }

    ok(`${tag}: no errors on the page`, errors.length === 0, errors);
    await send('Target.closeTarget', { targetId });
    await send('Target.disposeBrowserContext', { browserContextId });
  }
  ok('across the sizes, some menu really lay over an open drawer (the toolbars above the drawers is tested)', overDrawer > 0, overDrawer);

  // 6. the wiring, by text
  const src = await readFile(path.join(ROOT, 'js/main.js'), 'utf8');
  const css = await readFile(path.join(ROOT, 'css/app.css'), 'utf8');
  ok('main.js: wireMenus places the menu it opens, and the boot wires the placing',
    /menu\.classList\.add\('open'\);\s*placeOpenMenu\(true\);/.test(src) && /\nwireMenus\(\);\nwireMenuPlacement\(\);\n/.test(src));
  ok('main.js: Escape is taken in the capture phase while a menu of the bar is open, and shuts it',
    /document\.addEventListener\('keydown', ev => \{\s*if \(ev\.key !== 'Escape' \|\| D\.dialogsOpen\(\) \|\| !\$\('menus'\)\.querySelector\('\.menu\.open'\)\) return;\s*ev\.preventDefault\(\);\s*ev\.stopPropagation\(\);\s*closeOpenMenus\(\);\s*\}, true\);/.test(src));
  const narrowBlock = css.slice(css.indexOf('@media (max-width: 1023px)')).slice(0, 3000);
  ok('app.css: below 1024 px the open menu does not hang from its title\'s box, and the toolbars stand above the drawers while it is open',
    /\.menu \{ position: static; \}/.test(narrowBlock)
    && /\.menu-pop \{[^}]*left: var\(--menu-x, 0px\); top: var\(--menu-y, 100%\);[^}]*overflow-y: auto;/.test(narrowBlock)
    && /\.chrome\.menu-up \{ z-index: 65; \}/.test(narrowBlock));

  log(`\n${fails ? `${fails} of ${checks} checks FAILED` : `All ${checks} checks pass`} — every menu entry can be tapped at a phone's, a tablet's and a desktop's width, File › Save by finger is a Save, and Escape is an open menu's`);
  await finish(fails ? 1 : 0);
} catch (err) {
  console.log('FAIL', err && err.stack ? err.stack : err);
  await finish(1);
}
