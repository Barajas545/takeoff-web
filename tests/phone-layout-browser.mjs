// THE PHONE AND TABLET LAYOUTS IN A REAL BROWSER, by real taps: a desktop
// job holding Infinity opens and reads 'vertical'; the finger's toast stands
// clear of the saved overlay's strip; every tool's options bar is on the
// screen and takes a finger's input.
//
//   A. a desktop job whose vertical pitch lines the desktop saved as the bare
//      word Infinity (Python's json.dumps; tests/py-json.mjs holds the reader
//      to Python's json.loads) is opened by a real tap on "Open a .takeoff
//      project" and the file chooser: it opens, nothing is marked unsaved,
//      the change count stays put, and the canvas reads the lines
//      'vertical   90°'.
//   B. the finger's toast (main.js sayToFinger; shown where the status line
//      is not drawn, a phone under 721px) is said by a real row step in the
//      Items drawer -- 'Shape 1 of 2 on X1.0 …' -- with the saved overlay's
//      strip (#savedOvBar) up: the toast must not cover the strip, and Flash
//      and Hide must take real taps while it is up. With the strip gone the
//      toast is back where the stylesheet puts it. Where no toast is shown
//      (wider layouts, the standard desktop) nothing about it changes.
//   C. every tool's options bar (main.js syncToolOptions / placeToolOptions),
//      reached by real taps on the tool buttons: every control in it inside
//      the screen and not covered, and every field and list taking a real
//      tap and real keys -- the value changes and the tool has it (below
//      1024, where it wraps). From 1024 up the bar is laid out as it always
//      was (one row, a pair no box of its own), on screen and uncovered.
//      Count's Undo and Redo are one pair, on one row, in every layout --
//      on a 320px phone they wrapped apart, Redo alone under its Undo.
//   B2. a menu opened while the toast is up (within its time of a row's
//      step): the toast is not drawn over it -- on a phone held upright it
//      lay over the View menu's Bigger Markers, on smaller phones over other
//      entries -- and a menu shut within the toast's time shows it again,
//      where it was. Every way a menu opens and shuts: its title, a second
//      title, Escape (which shuts it), a tap on the sheet outside it,
//      an entry (where a finger can reach one: the menu fix).
//   B3. ...and the item menu (#ctxMenu), opened while the toast is up by a
//      finger's hold on the shape in Edit Mode or on its row in the Items
//      drawer: it lay under the toast too (Delete on a phone upright). Not
//      drawn while it is open; drawn again once it is shut by Escape, a tap
//      outside it, or an entry (Zoom to item).
//   D. View › Markup Toolbar, with Tile's and Count's bars up, the toolbars
//      floating and pinned (a phone, an iPad upright and on its side): the
//      toolbars grow, and the bar comes down with them -- every control on
//      screen and uncovered, a real tap on its first box lands in it -- and
//      goes back exactly where it was with the row off; then Standard and
//      Touch again from View. Below 1024 a View entry takes a finger only
//      with the menu fix (main.js placeOpenMenu); without it D is checked at
//      1024x768, where the menus open, and says so.
//
// Layouts: phone 390x844 and 844x390, a small phone's 667x375 and a narrow
// phone's 320x568 (touch),
// iPad 1024x768, 820x1180 and 834x1194 (touch), desktop 1280x800 (mouse,
// the standard layout). Every one in a fresh profile, its service workers
// and caches cleared and the page reloaded first, with proof the code came
// from this checkout over the network.
//
// Synthetic: no real job, sheet labels X1.0 and X2.0. Chrome or Edge is
// found at its usual place or at $CHROME; without one this SKIPS (exit 2).
// PTT_SHOTS=<folder> keeps a screenshot of each layout's moments there.
// PTT_FINITE_JOB=1 writes the vertical lines' rise as 0 instead (the job a
// build that cannot read Infinity can still open), to show B and C there.
// Run: node tests/phone-layout-browser.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.normalize(path.join(here, '..'));
const SHOTS = process.env.PTT_SHOTS || '';
const FINITE = process.env.PTT_FINITE_JOB === '1';

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
const MAIN_JS = readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
// main.js with the menus that open by finger below 1024 px (the menu fix):
// there a menu's entry must take a finger's tap
const MENUS_BY_FINGER = /^function placeOpenMenu\b/m.test(MAIN_JS);
const FINGER_TOAST_MS = Number((/^const FINGER_TOAST_MS = (\d+);$/m.exec(MAIN_JS) || [])[1]) || 4000;

// ── the job: the desktop's own text (tests/data/py-json-truth.json), two sheets ──
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = b => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function png(w, h, shade) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = shade(x, y);
      const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = v; raw[o + 1] = v; raw[o + 2] = v;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function takeoffBytes(metaText, pages) {
  const meta = Buffer.from(metaText, 'utf8');
  const head = Buffer.alloc(17);
  head.write('PDFCACHE1', 0, 'ascii'); head.writeUInt32LE(pages.length, 9); head.writeUInt32LE(meta.length, 13);
  const index = Buffer.alloc(pages.length * 12);
  let at = 17 + meta.length + index.length;
  pages.forEach((p, i) => { index.writeBigUInt64LE(BigInt(at), i * 12); index.writeUInt32LE(p.length, i * 12 + 8); at += p.length; });
  return Buffer.concat([head, meta, index, ...pages]);
}
const SNAP = JSON.parse(readFileSync(path.join(here, 'data', 'py-json-truth.json'), 'utf8'));
let JOB_TEXT = SNAP.cases.find(c => /vertical pitch line/.test(c.name)).desktop;
ok('the desktop\'s own text holds the bare word Infinity', /"value": Infinity/.test(JOB_TEXT));
if (FINITE) JOB_TEXT = JOB_TEXT.replace(/"value": Infinity/g, '"value": 0');
// Beside the desktop's pitch lines: a two-shape item on X1.0 (a row step
// says 'Shape 1 of 2'), and X2.0 laid over X1.0 as its saved overlay.
const deck = (extra, pts) => JSON.stringify({ type: 'area', name: 'Deck', label: 'Deck', points: pts, visible: true,
  floor_level: 'Level 1', category: 'Framing', sub_category: '', cost_type: 'material', unit_cost: 2.5,
  color: [0.2, 0.7, 0.3, 1.0], group_id: 'g-deck', ...extra });
JOB_TEXT = JOB_TEXT
  .replace('"measurements": {"0": [', `"measurements": {"0": [${[
    deck({ value: 12, own_value: 6, group_count: 2 }, [[300.5, 300.5], [450.5, 300.5], [450.5, 400.5], [300.5, 400.5]]),
    deck({ value: 6, group_child: true }, [[500.5, 300.5], [650.5, 300.5], [650.5, 400.5], [500.5, 400.5]]),
  ].join(', ')}, `)
  .replace('"pixels_per_foot": 50.5', '"pixels_per_foot": 50.0')
  .replace(/"revisions": \[\]\}$/, '"revisions": [], "page_overlays": {"0": {"overlay_page": 1, "color": [1.0, 0.3, 0.3], "alpha": 0.5}}}');
ok('...and the job has its overlay and its two-shape item', /"page_overlays"/.test(JOB_TEXT) && /"group_child":\s*true/.test(JOB_TEXT));
const JOB = takeoffBytes(JOB_TEXT, [
  zlib.deflateSync(png(800, 600, (x, y) => (x % 100 < 2 || y % 100 < 2 ? 40 : 250))),
  zlib.deflateSync(png(800, 600, (x, y) => (Math.abs(x - y) < 2 || Math.abs(x + y - 600) < 2 ? 20 : 252))),
]);
const jobDir = mkdtempSync(path.join(tmpdir(), 'plb-job-'));
const JOB_PATH = path.join(jobDir, 'Synthetic job.takeoff');
writeFileSync(JOB_PATH, JOB);

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

// ── headless Chrome, a throw-away profile, the DevTools protocol ──────────
const profile = mkdtempSync(path.join(tmpdir(), 'plb-'));
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
  for (const d of [profile, jobDir]) {
    try { rmSync(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* locked */ }
  }
  process.exit(code);
}

const LAYOUTS = [
  { name: 'phone upright', w: 390, h: 844, touch: true, mobile: true },
  { name: 'phone landscape', w: 844, h: 390, touch: true, mobile: true },
  { name: 'small phone landscape', w: 667, h: 375, touch: true, mobile: true },
  { name: 'narrow phone upright', w: 320, h: 568, touch: true, mobile: true },
  { name: 'iPad landscape', w: 1024, h: 768, touch: true, mobile: false },
  { name: 'iPad upright', w: 820, h: 1180, touch: true, mobile: false },
  { name: 'iPad Pro upright', w: 834, h: 1194, touch: true, mobile: false },
  { name: 'desktop', w: 1280, h: 800, touch: false, mobile: false, standard: true },
];
// D, the toolbars growing: a phone, an iPad upright, an iPad on its side
const GROWS = ['390x844', '820x1180', '1024x768'];

async function layout(L) {
  log(`\n-- ${L.name} ${L.w}x${L.h} (${L.touch ? 'touch' : 'mouse'}${L.standard ? ', the standard layout' : ''}) --`);
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (m, prm) => send(m, prm, sessionId);
  await call('Page.enable');
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
    writeFileSync(path.join(SHOTS, `${L.w}x${L.h}-${what}.png`), Buffer.from(r.data, 'base64'));
  };
  const tap = async (x, y) => {
    if (L.touch) {
      await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await sleep(40);
      await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await sleep(30);
      await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    }
    await sleep(150);
  };
  const drag = async (x0, y0, x1, y1, steps = 12) => {
    if (L.touch) {
      await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
      for (let i = 1; i <= steps; i++) {
        await sleep(25);
        await call('Input.dispatchTouchEvent', { type: 'touchMove',
          touchPoints: [{ x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps, id: 1 }] });
      }
      await sleep(150);   // held still: no fling
      await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x: x0, y: y0, deltaX: x0 - x1, deltaY: y0 - y1 });
    }
    await sleep(300);
  };
  const key = async (k, code, vk, modifiers = 0) => {
    await call('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers });
    await sleep(60);
  };
  /** The centre of what `expr` finds, if it is on screen: [x, y] or null. */
  const at = async expr => evaluate(`(() => { const e = ${expr}; if (!e) return null;
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) return null;
    return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  const tapOn = async (expr, label) => {
    const c = await at(expr);
    if (!ok(`${L.name}: ${label} is on screen to tap`, !!c)) return false;
    await tap(c[0], c[1]);
    return true;
  };
  /** The toolbars, slid away, pulled down from the top edge (a mouse reaches it). */
  const pullDown = async () => {
    const away = await evaluate(`(() => { const a = document.getElementById('app');
      return a.classList.contains('chrome-float') && !a.classList.contains('chrome-open'); })()`);
    if (!away) return;
    if (L.touch) await drag(L.w / 2, 2, L.w / 2, 160, 8);
    else await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: L.w / 2, y: 1 });
    await sleep(500);
  };
  /** Something in the menu bar (a menu's title, the pin) brought on screen by a finger's drag along the bar, then tapped. */
  const tapInMenubar = async (expr, label) => {
    await pullDown();
    for (let i = 0; i < 6; i++) {
      const r = await evaluate(`(() => { const r = ${expr}.getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom]; })()`);
      if (r[0] >= 2 && r[1] <= L.w - 2) break;
      const y = (r[2] + r[3]) / 2;
      const dx = Math.max(-L.w * 0.6, Math.min(L.w * 0.6, (r[0] + r[1]) / 2 - L.w / 2));
      await drag(L.w / 2 + dx / 2, y, L.w / 2 - dx / 2, y);
    }
    return tapOn(expr, label);
  };
  const tapTitle = name => tapInMenubar(`document.querySelector('.menu[data-menu=${name}] .menu-btn')`, `the ${name} menu's title`);
  /** The finger's toast and the open menu: whether it is drawn, and over the menu. */
  const toastNow = () => evaluate(`(() => {
    const t = document.getElementById('fingerToast');
    const open = document.querySelector('#menus .menu.open');
    const pop = open && open.querySelector('.menu-pop');
    const live = !!t && !t.hidden;
    const cs = t && getComputedStyle(t);
    const drawn = live && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0;
    const tr = t && t.getBoundingClientRect();
    const pr = pop && pop.getBoundingClientRect();
    const meets = !!tr && !!pr && tr.left < pr.right && pr.left < tr.right && tr.top < pr.bottom && pr.top < tr.bottom;
    return { menu: open ? open.dataset.menu : '', live, drawn, over: drawn && meets, meets,
      rect: tr ? [tr.left, tr.top, tr.right, tr.bottom].map(Math.round) : null };
  })()`);
  /** A finger's sentence: a row's step in the Items drawer, the SHEET chip on. Returns when it was said. */
  const sayStep = async () => {
    await tapOn(`document.querySelector('.mbar-btn[data-act="toggle-items"]')`, 'the foot bar\'s Items');
    await sleep(450);
    if (!(await evaluate(`document.getElementById('sheetChip').classList.contains('on')`))) {
      await tapOn(`document.getElementById('sheetChip')`, 'the SHEET chip');
      await sleep(250);
    }
    await tapOn(`[...document.querySelectorAll('#itemList .row')].find(r => /Deck/.test(r.textContent))`, 'the Deck row');
    const t0 = Date.now();
    await sleep(500);
    if (await evaluate(`document.getElementById('itemsPanel').classList.contains('mopen')`)) {
      await tapOn(`document.getElementById('scrim')`, 'the scrim (shuts the drawer)');
      await sleep(200);
    }
    return t0;
  };
  /**
   * B2. The toast is drawn over everything; a menu opened while it is up
   * (within its four seconds of a row's step) had its entries under it --
   * on a phone held upright the View menu's last, Bigger Markers, the toast
   * having stood up over the strip; on the smaller ones others wherever it
   * stood. While a menu is open the toast is not drawn; a menu shut within
   * its time shows it again, where it was. Every way a menu opens and shuts,
   * by real taps and keys: its title, a second title, Escape (which shuts
   * it), a tap outside it, an entry.
   */
  const menuOverToast = async () => {
    const ways = [];
    const stripNow = () => evaluate(`(() => { const s = document.getElementById('savedOvBar'); if (s.hidden) return null;
      const r = s.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map(Math.round); })()`);
    const check = async (what, toastTime) => {
      const s = await toastNow();
      const late = Date.now() - toastTime > FINGER_TOAST_MS - 300;
      ways.push(`${what}: menu '${s.menu}', toast ${s.live ? (s.drawn ? 'drawn' : 'not drawn') : 'down'}`);
      if (s.menu) {
        ok(`${L.name}: B2. ${what}: the ${s.menu} menu is open and the toast, still up, is not drawn over it (toast ${JSON.stringify(s.rect)})`,
          s.live && !s.drawn && !s.over, s);
      } else if (!late) {
        // where it stands: over the strip while the strip is up, else where the stylesheet puts it
        const strip = await stripNow();
        ok(`${L.name}: B2. ${what}: no menu open, and the toast, its time not up, is drawn again${strip ? ', clear of the strip' : ''}`,
          s.live && s.drawn && (!strip || s.rect[3] <= strip[1]), { s, strip });
      } else {
        log(`  (${L.name}: B2. ${what}: the toast's time ran out before this was seen; not judged)`);
      }
      return s;
    };
    // the saved overlay's strip back (B's Hide took it off for this visit:
    // to X2.0 and back), so the toast stands over it, as it did when seen
    if (await evaluate(`document.getElementById('savedOvBar').hidden`)) {
      await tapOn(`document.querySelector('.mbar-btn[data-act="next-page"]')`, 'the foot bar\'s Next');
      await sleep(700);
      await tapOn(`document.querySelector('.mbar-btn[data-act="prev-page"]')`, 'the foot bar\'s Prev');
      await sleep(1000);
    }
    ok(`${L.name}: B2. the saved overlay's strip is up again on X1.0`,
      await evaluate(`!document.getElementById('savedOvBar').hidden && TakeoffApp.app.currentPage === 0`));
    // its title; a second title; that title again
    let t0 = await sayStep();
    const first = await toastNow();
    ok(`${L.name}: B2. a row's step says the toast, no menu open, drawn`, first.live && first.drawn && !first.menu, first);
    await tapTitle('view');
    const v = await check('View opened by its title', t0);
    ok(`${L.name}: B2. ...where, open, the View menu meets the toast's place (it lay over Bigger Markers on a phone upright)`,
      v.meets || !MENUS_BY_FINGER, v);
    await tapTitle('file');
    await check('File\'s title tapped with View open', t0);
    await tapTitle('file');
    await check('File\'s title tapped again (shut)', t0);
    // a tap on the sheet outside it
    t0 = await sayStep();
    await tapTitle('view');
    await check('View opened again', t0);
    const pop = await evaluate(`(() => { const p = document.querySelector('#menus .menu.open .menu-pop'); if (!p) return null;
      const r = p.getBoundingClientRect(); const s = document.getElementById('stage').getBoundingClientRect();
      return { left: r.left, right: r.right, top: s.top, bottom: s.bottom }; })()`);
    if (ok(`${L.name}: B2. View is open, to tap outside it`, !!pop)) {
      const x = pop.left > 70 ? pop.left / 2 : (pop.right + L.w) / 2;
      await tap(x, pop.top + (pop.bottom - pop.top) * 0.4);
      await check('a tap on the sheet, outside the menu', t0);
      const still = (await toastNow()).menu;
      if (still) {
        await tapTitle(still);
        await check('the menu the tap left open, shut by its title', t0);
      }
    }
    // an entry (Fit to Window), where a finger can reach one
    t0 = await sayStep();
    await tapTitle('view');
    const fit = await evaluate(`(() => { const b = document.querySelector('.menu[data-menu=view] button[data-act=zoom-fit]');
      const r = b.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y); return { x, y, reached: !!hit && hit.closest('button') === b }; })()`);
    if (fit.reached) {
      await tap(fit.x, fit.y);
      await check('an entry tapped (Fit to Window)', t0);
    } else {
      ok(`${L.name}: B2. below 1024 a menu's entry takes a finger's tap where main.js has the menu fix`, !MENUS_BY_FINGER, fit);
      log(`  (${L.name}: B2. this main.js has no menus by finger below 1024: an entry cannot be tapped here, so the menu is shut by its title)`);
      await tapTitle('view');
      await check('View shut by its title', t0);
    }
    // Escape shuts the menu and goes no further: the strip stays up. A menu
    // still open after it (a main.js from before that) is shut by its title
    t0 = await sayStep();
    await tapTitle('view');
    await check('View opened once more', t0);
    await key('Escape', 'Escape', 27);
    await check('Escape', t0);
    if ((await toastNow()).menu) {
      await tapTitle((await toastNow()).menu);
      await check('the menu Escape left open, shut by its title', t0);
    }
    log(`  ${L.name}: B2. ${ways.join('; ')}`);
    // the strip off, as B left it for C
    if (await stripNow()) await tapOn(`document.getElementById('sovHide')`, 'Hide');
    ok(`${L.name}: B2. ...and the strip off again`, await evaluate(`document.getElementById('savedOvBar').hidden`));
    await sleep(FINGER_TOAST_MS);
  };
  /**
   * B3. The item menu (#ctxMenu: Properties, Associated materials, Hide,
   * Isolate, Zoom, Delete), opened while the toast is up -- a finger's hold
   * on the shape in Edit Mode, or on its row in the Items drawer: it is z 90
   * to the toast's 95, and lay under it too -- on a phone held upright its
   * Delete, on the smaller ones Hide, Isolate, Zoom. While it is open the
   * toast is not drawn; shut within the toast's time it is drawn again,
   * where it was. By real holds, taps and keys: a hold on the shape's middle
   * shut by Escape, a hold on its top edge shut by a tap on the sheet outside
   * it, a hold on the row shut by an entry (Zoom to item).
   */
  const itemMenuOverToast = async () => {
    const ways = [];
    let judged = 0;
    const met = [];
    const stripNow = () => evaluate(`(() => { const s = document.getElementById('savedOvBar'); if (s.hidden) return null;
      const r = s.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map(Math.round); })()`);
    const now = () => evaluate(`(() => {
      const t = document.getElementById('fingerToast');
      const m = document.getElementById('ctxMenu');
      const live = !!t && !t.hidden;
      const cs = t && getComputedStyle(t);
      const drawn = live && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0;
      const tr = t && t.getBoundingClientRect();
      const under = [];
      if (!m.hidden && tr) {
        for (const b of m.querySelectorAll('button')) {
          const r = b.getBoundingClientRect();
          if (r.width && r.height && r.left < tr.right && tr.left < r.right && r.top < tr.bottom && tr.top < r.bottom) under.push(b.textContent.trim());
        }
      }
      return { menu: !m.hidden, live, drawn, under, vis: t ? t.style.visibility : null,
        rect: tr ? [tr.left, tr.top, tr.right, tr.bottom].map(Math.round) : null };
    })()`);
    const check = async what => {
      const s = await now();
      ways.push(`${what}: item menu ${s.menu ? 'open' : 'shut'}, toast ${s.live ? (s.drawn ? 'drawn' : 'not drawn') : 'down'}`);
      if (s.menu) {
        if (s.under.length) met.push(`${what}: ${s.under.join(', ')}`);
        ok(`${L.name}: B3. ${what}: the item menu is open and the toast, still up, is not drawn over it (entries in its place: ${s.under.join(', ') || 'none'})`,
          s.live && !s.drawn, s);
      } else if (s.live) {
        judged += 1;
        const strip = await stripNow();
        ok(`${L.name}: B3. ${what}: the item menu shut, and the toast, its time not up, is drawn again${strip ? ', clear of the strip' : ''}`,
          s.drawn && s.vis === '' && (!strip || s.rect[3] <= strip[1]), { s, strip });
      } else {
        log(`  (${L.name}: B3. ${what}: the toast's time ran out before this was seen; not judged)`);
      }
      return s;
    };
    const hold = async (x, y) => {
      await call('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await sleep(700);
      await call('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(200);
    };
    /** A point of the drawing (page pixels) on screen, and whether a finger there lands on the canvas. */
    const onSheet = (px, py) => evaluate(`(() => { const c = document.getElementById('canvas');
      const b = c.getBoundingClientRect(); const [sx, sy] = TakeoffApp.viewport.toScreen(${px}, ${py});
      const x = b.left + sx, y = b.top + sy;
      const hit = x >= 0 && y >= 0 && x < innerWidth && y < innerHeight ? document.elementFromPoint(x, y) : null;
      return { x, y, canvas: hit === c }; })()`);
    /** A point of the Deck shape the row's step zoomed to ('Shape 1 of 2' or 'Shape 2 of 2'), its middle or its top edge. */
    const holdShape = async (py, what) => {
      const second = /Shape 2 of 2/.test(await evaluate(`(document.getElementById('fingerToast') || {}).textContent || ''`));
      const p = await onSheet(second ? 575.5 : 375.5, py);
      if (!ok(`${L.name}: B3. the Deck shape's ${what} is on screen, the canvas under it, to hold`, p.canvas, p)) return false;
      await hold(p.x, p.y);
      return true;
    };
    if (!L.touch) return;
    // Edit Mode: the item menu is Edit Mode's on the drawing
    if (!(await evaluate('TakeoffApp.app.editing'))) {
      await tapOn(`document.getElementById('mbarMode')`, 'the foot bar\'s Edit');
      await sleep(500);
    }
    ok(`${L.name}: B3. Edit Mode is on`, await evaluate('TakeoffApp.app.editing'));
    // the strip up again, so the toast stands over it, as in B2
    if (await evaluate(`document.getElementById('savedOvBar').hidden`)) {
      await tapOn(`document.querySelector('.mbar-btn[data-act="next-page"]')`, 'the foot bar\'s Next');
      await sleep(700);
      await tapOn(`document.querySelector('.mbar-btn[data-act="prev-page"]')`, 'the foot bar\'s Prev');
      await sleep(1000);
    }
    ok(`${L.name}: B3. the saved overlay's strip is up again on X1.0`,
      await evaluate(`!document.getElementById('savedOvBar').hidden && TakeoffApp.app.currentPage === 0`));
    const before = await evaluate('[TakeoffApp.app.project.changeCount, TakeoffApp.app.project.dirty]');
    // a hold on the shape's middle; Escape
    await sayStep();
    if (await holdShape(350.5, 'middle')) {
      await check('held on the shape\'s middle');
      await key('Escape', 'Escape', 27);
      await check('Escape');
    }
    // a hold on its top edge; a tap on the sheet outside the menu
    await sayStep();
    if (await holdShape(305, 'top edge')) {
      const m = await check('held on the shape\'s top edge');
      if (m.menu) {
        const r = await evaluate(`(() => { const r = document.getElementById('ctxMenu').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })()`);
        const stage = await evaluate(`(() => { const r = document.getElementById('stage').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; })()`);
        const x = r[0] > 40 ? r[0] / 2 : (r[2] + L.w) / 2;
        await tap(x, stage[1] + (stage[3] - stage[1]) * 0.4);
        await check('a tap on the sheet, outside the menu');
      }
    }
    // a hold on the row in the Items drawer; an entry
    await sayStep();
    await tapOn(`document.querySelector('.mbar-btn[data-act="toggle-items"]')`, 'the foot bar\'s Items');
    await sleep(450);
    const row = await at(`[...document.querySelectorAll('#itemList .row')].find(r => /Deck/.test(r.textContent))`);
    if (ok(`${L.name}: B3. the Deck row is on screen, to hold`, !!row)) {
      await hold(row[0], row[1]);
      const m = await check('held on the Deck row');
      if (m.menu) {
        const zoom = await evaluate(`(() => { const b = [...document.querySelectorAll('#ctxMenu button')].find(e => e.textContent.trim() === 'Zoom to item');
          if (!b) return null; const r = b.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
          const hit = document.elementFromPoint(x, y); return { x, y, reached: !!hit && hit.closest('button') === b }; })()`);
        if (ok(`${L.name}: B3. the item menu's Zoom to item takes a finger's tap`, !!zoom && zoom.reached, zoom)) {
          await tap(zoom.x, zoom.y);
          await check('an entry tapped (Zoom to item)');
        }
      }
    }
    if (await evaluate(`document.getElementById('itemsPanel').classList.contains('mopen')`)) {
      await tapOn(`document.querySelector('.mbar-btn[data-act="toggle-items"]')`, 'the foot bar\'s Items (to close it)');
      await sleep(300);
    }
    log(`  ${L.name}: B3. ${ways.join('; ')}`);
    ok(`${L.name}: B3. ...the item menu, open, stood in the toast's place at least once (${met.join('; ') || 'never'})`, met.length > 0);
    ok(`${L.name}: B3. ...and the toast was seen drawn again after a shut at least twice (${judged})`, judged >= 2);
    eq(`${L.name}: B3. ...nothing of the job changed: the change count, nothing unsaved`,
      await evaluate('[TakeoffApp.app.project.changeCount, TakeoffApp.app.project.dirty]'), before);
    if (await stripNow()) await tapOn(`document.getElementById('sovHide')`, 'Hide');
    ok(`${L.name}: B3. ...and the strip off again`, await evaluate(`document.getElementById('savedOvBar').hidden`));
    await sleep(FINGER_TOAST_MS);
  };

  // ── a clean slate: no worker, no cache, the page loaded fresh ──
  // (the first load registers a worker as it loads: let it, then take it
  // and every cache away, and load again)
  await go(`${ORIGIN}/index.html?nofsapi`);
  await sleep(1500);
  await evaluate(`(async () => {
    for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
  })()`);
  await go(`${ORIGIN}/index.html?nofsapi`);
  await sleep(800);
  const fresh = await evaluate(`(async () => {
    const nav = performance.getEntriesByType('navigation')[0];
    const js = performance.getEntriesByType('resource').find(e => /\\/js\\/main\\.js$/.test(e.name));
    const served = await (await fetch('css/app.css', { cache: 'no-store' })).text();
    return { nav: !!nav && nav.workerStart === 0 && nav.transferSize > 0,
      js: !!js && js.workerStart === 0 && js.transferSize > 0, served: served.length };
  })()`);
  ok(`${L.name}: the page and main.js came over the network from this checkout, no worker in front of them`,
    fresh.nav && fresh.js, fresh);
  eq(`${L.name}: ...and the stylesheet on the page is the one on disk`, fresh.served,
    readFileSync(path.join(ROOT, 'css', 'app.css'), 'utf8').length);

  // ── A. a real tap opens the desktop's job ──
  await call('Page.setInterceptFileChooserDialog', { enabled: true });
  const chooser = once('Page.fileChooserOpened');
  if (!(await tapOn(`document.querySelector('.es-btn.primary')`, '"Open a .takeoff project"'))) return;
  const fc = await Promise.race([chooser, sleep(6000).then(() => null)]);
  if (!ok(`${L.name}: the tap opened the file chooser`, !!fc)) return;
  await call('DOM.setFileInputFiles', { files: [JOB_PATH], backendNodeId: fc.backendNodeId });
  for (let i = 0; i < 60; i++) {
    if (await evaluate('!!(window.TakeoffApp && TakeoffApp.app.project.pageCount === 2 && document.getElementById("progress").hidden)')) break;
    await sleep(200);
  }
  await sleep(1200);
  const opened = await evaluate(`(() => {
    const p = TakeoffApp.app.project;
    const lines = (p.measurements[0] || []).filter(m => m.type === 'pitch');
    return { pages: p.pageCount, dirty: p.dirty, changes: p.changeCount, status: document.getElementById('statusText').textContent,
      values: lines.map(m => String(m.value)),
      words: lines.map(m => TakeoffApp.renderer._labelTextFor(m, '', '', '')),
      dialog: !!document.querySelector('.modal:not([hidden]), dialog[open]') };
  })()`);
  ok(`${L.name}: A. the desktop's job opened, no question and no error`,
    opened.pages === 2 && !opened.dialog && /^Opened Synthetic job/.test(opened.status), opened);
  eq(`${L.name}: A. its vertical lines are the desktop's Infinity, and read 'vertical' on the canvas`,
    [opened.values, opened.words.filter(w => /vertical/.test(w))],
    [FINITE ? ['0', '6', '0'] : ['Infinity', '6', 'Infinity'], ['vertical   90°', 'vertical   90°']]);
  await sleep(1500);
  const later = await evaluate('[TakeoffApp.app.project.dirty, TakeoffApp.app.project.changeCount]');
  eq(`${L.name}: A. nothing is marked unsaved, and the change count has not moved`, later, [false, opened.changes]);
  await shot('opened');

  // ── B. the finger's toast and the saved overlay's strip ──
  const strip = () => evaluate(`(() => { const s = document.getElementById('savedOvBar');
    if (s.hidden) return null; const r = s.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; })()`);
  const toast = () => evaluate(`(() => { const t = document.getElementById('fingerToast');
    if (!t || t.hidden) return null; const r = t.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, text: t.textContent, style: t.style.bottom }; })()`);
  const meets = (a, b) => !!a && !!b && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  ok(`${L.name}: B. the saved overlay's strip is up on X1.0`, !!(await strip()));
  const drawer = L.w < 1024;
  if (drawer) {
    await tapOn(`document.querySelector('.mbar-btn[data-act="toggle-items"]')`, 'the foot bar\'s Items');
  } else if (await evaluate(`document.querySelector('.body').classList.contains('no-items')`)) {
    // from 1024 up the list is a column, put away in View Only: opened as View > Items does
    await evaluate(`TakeoffApp.runAction('toggle-items')`);
  }
  await sleep(500);
  await tapOn(`document.getElementById('sheetChip')`, 'the SHEET chip');
  await sleep(300);
  await tapOn(`[...document.querySelectorAll('#itemList .row')].find(r => /Deck/.test(r.textContent))`, 'the Deck row');
  await sleep(750);
  const said = `Shape 1 of 2 on X1.0 — ${L.touch ? 'tap' : 'click'} the item again for the next shape`;
  const t1 = await toast();
  const s1 = await strip();
  const toastShown = L.w <= 720;
  eq(`${L.name}: B. the row's step is said ${toastShown ? 'in the finger\'s toast' : 'on the status line, with no toast'}`,
    [t1 ? t1.text : null, await evaluate(`document.getElementById('statusText').textContent`)],
    [toastShown ? said : null, said]);
  // A phone held upright: the drawer hid the drawing, and went by itself
  // (closeItemsDrawerSoon). Held sideways, or an iPad: it covers under 60%
  // and stays -- its scrim over the sheet takes the next tap and shuts it.
  const stays = await evaluate(`document.getElementById('itemsPanel').classList.contains('mopen')`);
  ok(`${L.name}: B. ...the drawer ${stays ? 'stays, over under 60% of the drawing' : 'has gone from over the drawing'}`,
    stays === (drawer && L.w * 0.6 > Math.min(320, L.w * 0.84)));
  await shot('toast');
  if (toastShown) {
    ok(`${L.name}: B. the toast stands clear of the strip (toast ${t1 && Math.round(t1.top)}-${t1 && Math.round(t1.bottom)}, `
      + `strip ${s1 && Math.round(s1.top)}-${s1 && Math.round(s1.bottom)})`, !!t1 && !!s1 && !meets(t1, s1) && t1.bottom <= s1.top);
    ok(`${L.name}: B. ...and inside the screen`, !!t1 && t1.top >= 0 && t1.left >= 0 && t1.right <= L.w);
  }
  if (stays) {
    await tapOn(`document.getElementById('scrim')`, 'the scrim (shuts the drawer)');
    await sleep(250);
    ok(`${L.name}: B. the drawer shut`, !(await evaluate(`document.getElementById('itemsPanel').classList.contains('mopen')`)));
    if (toastShown) {
      const t1b = await toast();
      ok(`${L.name}: B. ...the toast still up and still clear of the strip`, !!t1b && !meets(t1b, await strip()));
    }
  }
  // Flash and Hide, by real taps, while the toast is up.
  await tapOn(`document.getElementById('sovFlash')`, 'Flash');
  const flashing = await evaluate(`document.getElementById('sovFlash').getAttribute('aria-pressed')`);
  const t2 = await toast();
  eq(`${L.name}: B. a tap on Flash flashes the overlay${toastShown ? ', the toast still up' : ''}`,
    [flashing, toastShown ? !!t2 : null], ['true', toastShown ? true : null]);
  await tapOn(`document.getElementById('sovFlash')`, 'Flash again');
  eq(`${L.name}: B. ...and a second stops it`, await evaluate(`document.getElementById('sovFlash').getAttribute('aria-pressed')`), 'false');
  await tapOn(`document.getElementById('sovHide')`, 'Hide');
  const t3 = await toast();
  eq(`${L.name}: B. a tap on Hide takes the overlay off${toastShown ? ', the toast still up' : ''}`,
    [!(await strip()), toastShown ? !!t3 : null], [true, toastShown ? true : null]);
  if (toastShown) {
    eq(`${L.name}: B. with no strip the toast is back where the stylesheet puts it`, t3 && t3.style, '');
  } else {
    eq(`${L.name}: B. no toast was made, and nothing of one moved`, await evaluate(`(() => {
      const t = document.getElementById('fingerToast'); return t ? [t.hidden, t.style.bottom] : null; })()`), null);
  }
  await shot('hidden');
  // Taken off until he next turns to X1.0: turn there and back, for C.
  await sleep(toastShown ? 3500 : 0);
  if (drawer && await evaluate(`document.getElementById('itemsPanel').classList.contains('mopen')`)) {
    await tapOn(`document.querySelector('.mbar-btn[data-act="toggle-items"]')`, 'the foot bar\'s Items (to close it)');
  }

  // ── B2. a menu opened while the finger's toast is up ──
  if (toastShown) await menuOverToast();
  // ── B3. ...and the item menu ──
  if (toastShown) await itemMenuOverToast();

  // ── C. every tool's options bar ──
  const editing = await evaluate('TakeoffApp.app.editing');
  if (!editing) {
    if (drawer) await tapOn(`document.getElementById('mbarMode')`, 'the foot bar\'s Edit');
    else await evaluate(`TakeoffApp.setEditing(true)`);
    await sleep(500);
  }
  ok(`${L.name}: C. Edit Mode is on`, await evaluate('TakeoffApp.app.editing'));
  const modes = await evaluate(`[...document.querySelectorAll('#toolButtons [data-mode]')].map(b => b.dataset.mode)`);
  /** Bring the tool's button where a finger can tap it: the toolbars pulled down, the row scrolled. */
  const reach = async mode => {
    const btn = `document.querySelector('#toolButtons [data-mode="${mode}"]')`;
    for (let i = 0; i < 8; i++) {
      const r = await evaluate(`(() => { const r = ${btn}.getBoundingClientRect(); return [r.left, r.right, r.top, r.bottom]; })()`);
      if (r[3] <= 2) {
        // the toolbars are away: pull them down from the top edge (a mouse reaches it)
        if (L.touch) await drag(L.w / 2, 2, L.w / 2, 160, 8);
        else await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: L.w / 2, y: 1 });
        await sleep(500);
        continue;
      }
      if (r[0] >= 4 && r[1] <= L.w - 4) return true;
      const y = (r[2] + r[3]) / 2;
      const dx = Math.max(-L.w * 0.6, Math.min(L.w * 0.6, (r[0] + r[1]) / 2 - L.w / 2));
      await drag(L.w / 2 + dx / 2, y, L.w / 2 - dx / 2, y);
      // ...and still before the tap: a row still gliding takes it on another button
      let last = '';
      for (let k = 0; k < 20; k++) {
        const now = String(await evaluate(`${btn}.getBoundingClientRect().left`));
        if (now === last) break;
        last = now;
        await sleep(100);
      }
    }
    return false;
  };
  /** A form the tool asks first (Count: what are you counting?): answered, by a finger. */
  const answer = async mode => {
    const up = () => evaluate(`!!document.querySelector('.modal-layer:not(.behind) .dlg')`);
    if (!(await up())) return;
    const box = `document.querySelector('.modal-layer .dlg input[type=text], .modal-layer .dlg input:not([type])')`;
    if (await at(box)) {
      await tapOn(box, `the ${mode} form's first box`);
      await call('Input.insertText', { text: 'Posts' });
      await key('Enter', 'Enter', 13);
      await sleep(300);
    }
    if (await up()) { await key('Escape', 'Escape', 27); await sleep(300); }
    ok(`${L.name}: C. ${mode}: the form it asks is answered`, !(await up()));
  };
  for (const mode of modes) {
    if (!ok(`${L.name}: C. the ${mode} button can be brought on screen`, await reach(mode))) continue;
    await tapOn(`document.querySelector('#toolButtons [data-mode="${mode}"]')`, `the ${mode} button`);
    await sleep(350);
    await answer(mode);
    const bar = await evaluate(`(() => {
      const b = document.getElementById('toolOpts');
      if (b.hidden) return null;
      const foot = document.getElementById('mobileBar');
      const floor = foot && !foot.hidden ? foot.getBoundingClientRect().top : innerHeight;
      const r = b.getBoundingClientRect();
      const ctl = [...b.querySelectorAll('input, select, button')].map((e, i) => {
        const q = e.getBoundingClientRect();
        const hit = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
        return { i, tag: e.tagName, kind: e.type, left: q.left, right: q.right, top: q.top, bottom: q.bottom,
          covered: !(hit === e || e.contains(hit)), by: hit ? (hit.id || hit.className || hit.tagName) : null };
      });
      const pairs = [...b.children].map(c => c.className);
      const cs = getComputedStyle(b);
      return { mode: TakeoffApp.controller.mode, left: r.left, right: r.right, top: r.top, bottom: r.bottom, floor,
        ctl, pairs, wrap: cs.flexWrap, pairDisplay: b.firstElementChild ? getComputedStyle(b.firstElementChild).display : '' };
    })()`);
    if (!bar) {
      ok(`${L.name}: C. ${mode} is the tool (it has no options bar)`, await evaluate(`TakeoffApp.controller.mode`) === mode);
      continue;
    }
    eq(`${L.name}: C. ${mode}: the tool is picked`, bar.mode, mode);
    const off = bar.ctl.filter(c => c.left < 0 || c.right > L.w || c.top < 0 || c.bottom > bar.floor);
    ok(`${L.name}: C. ${mode}: its bar and every control in it are on the screen (bar ${Math.round(bar.left)}-${Math.round(bar.right)} of ${L.w})`,
      bar.left >= 0 && bar.right <= L.w && !off.length, off);
    const hid = bar.ctl.filter(c => c.covered);
    ok(`${L.name}: C. ${mode}: nothing covers them`, !hid.length, hid);
    if (mode === 'count') {
      // Undo and Redo, one pair: where the bar wraps they go to a line together.
      const hist = bar.ctl.filter(c => c.tag === 'BUTTON');
      eq(`${L.name}: C. count: its Undo and Redo are one pair, on one row`,
        [hist.length, bar.pairs.length, hist.length === 2 && Math.abs(hist[0].top - hist[1].top) < 1], [2, 2, true]);
    }
    if (L.w >= 1024) {
      eq(`${L.name}: C. ${mode}: from 1024 up, one row as before (no wrap; a pair is no box)`,
        [bar.wrap, bar.pairDisplay], ['nowrap', 'contents']);
    } else {
      eq(`${L.name}: C. ${mode}: below 1024 the bar wraps between label-and-control pairs`,
        [bar.wrap, bar.pairs.every(c => c === 'tool-opt')], ['wrap', true]);
    }
    // Every field and list, by a real tap and real keys: the tool has the
    // value -- below 1024, where the bar wraps (from 1024 up it is the bar it
    // always was, held above; its fields are the same fields).
    for (const c of L.w < 1024 ? bar.ctl : []) {
      const el = `document.querySelectorAll('#toolOpts input, #toolOpts select, #toolOpts button')[${c.i}]`;
      if (c.tag === 'BUTTON') continue;   // Count's Undo and Redo: placed, checked above
      await tap((c.left + c.right) / 2, (c.top + c.bottom) / 2);
      const focused = await evaluate(`document.activeElement === ${el}`);
      ok(`${L.name}: C. ${mode}: a tap on its ${c.tag === 'SELECT' ? 'list' : c.kind === 'text' ? 'name box' : 'number box'} ${c.i} puts the finger in it`, focused);
      const before = await evaluate(`JSON.stringify(TakeoffApp.controller.options)`);
      if (c.tag === 'SELECT') {
        const was = await evaluate(`${el}.value`);
        await key('ArrowDown', 'ArrowDown', 40);
        await key('Enter', 'Enter', 13);
        await sleep(150);
        const now = await evaluate(`${el}.value`);
        ok(`${L.name}: C. ${mode}: real keys move its list on (${was} -> ${now})`, now !== was);
      } else {
        const text = c.kind === 'text' ? 'Joists' : '45';
        await key('a', 'KeyA', 65, 2);
        await call('Input.insertText', { text });
        await sleep(150);
        eq(`${L.name}: C. ${mode}: typing in box ${c.i} sets it`, await evaluate(`${el}.value`), text);
      }
      const after = await evaluate(`JSON.stringify(TakeoffApp.controller.options)`);
      ok(`${L.name}: C. ${mode}: ...and the tool has the new value`, after !== before, `${before}\n  ${after}`);
      if (c.kind === 'text') await key('Enter', 'Enter', 13);
    }
    if (mode === 'tile') await shot('tile');
    if (mode === 'grid') await shot('grid');
  }

  // ── D. the toolbars growing under a tool's options bar ──
  const barNow = () => evaluate(`(() => {
    const b = document.getElementById('toolOpts');
    if (b.hidden) return null;
    const foot = document.getElementById('mobileBar');
    const floor = foot && !foot.hidden && foot.getBoundingClientRect().height > 0 ? foot.getBoundingClientRect().top : innerHeight;
    const r = b.getBoundingClientRect();
    const ctl = [...b.querySelectorAll('input, select, button')].map((e, i) => {
      const q = e.getBoundingClientRect();
      const x = q.left + q.width / 2, y = q.top + q.height / 2;
      const hit = x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight ? document.elementFromPoint(x, y) : null;
      return { i, tag: e.tagName, x, y, on: q.left >= 0 && q.right <= innerWidth && q.top >= 0 && q.bottom <= floor,
        covered: !(hit === e || e.contains(hit)), by: hit ? (hit.closest('[id]') ? hit.closest('[id]').id : hit.tagName) : null };
    });
    return { rect: [r.left, r.top, r.right, r.bottom].map(v => Math.round(v * 100) / 100),
      chromeBottom: Math.round(document.getElementById('chrome').getBoundingClientRect().bottom),
      markup: !document.getElementById('markupBar').hidden, ui: document.documentElement.dataset.ui || '',
      mode: TakeoffApp.controller.mode, ctl };
  })()`);
  /** View › <entry> by real taps: true when the finger reached the entry. A menu left open is shut by its title. */
  const viewEntry = async act => {
    await tapTitle('view');
    const e = await evaluate(`(() => { const b = document.querySelector('.menu[data-menu=view] button[data-act=${act}]');
      const r = b.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight ? document.elementFromPoint(x, y) : null;
      return { x, y, reached: !!hit && hit.closest('button') === b }; })()`);
    if (e.reached) {
      await tap(e.x, e.y);
      await sleep(450);
    }
    const left = await evaluate(`(document.querySelector('#menus .menu.open') || { dataset: {} }).dataset.menu || ''`);
    if (left) await tapTitle(left);
    return e.reached;
  };
  /**
   * D. View › Markup Toolbar puts a row on the toolbars (49px on a phone),
   * and the Touch layout's buttons are taller than the Standard's: pinned,
   * the sheet then starts lower, pulled down the stack ends lower. Nothing
   * placed the tool's options bar again, so its first row was left under
   * the toolbars, and a tap meant for Count's name box picked a markup tool.
   * With Tile's bar and Count's up, the toolbars floating and pinned: every
   * control of the bar on screen and uncovered once the row is on, a real
   * tap on its first box lands in it (the tool unchanged), nothing moves the
   * bar again after (no loop), and with the row off again the bar is back
   * exactly where it was. Then Standard and back to Touch from View, Count's
   * bar up. All by real taps on the View menu -- below 1024 that needs the
   * menus by finger (the menu fix); a main.js without them is checked by
   * its menu at 1024x768 instead, where its menus open.
   */
  const toolbarsGrow = async () => {
    if (L.w < 1024 && !MENUS_BY_FINGER) {
      log(`  (${L.name}: D. this main.js has no menus by finger below 1024 -- View's entries cannot be tapped here; checked at 1024x768 by its menu instead)`);
      return;
    }
    for (const pinned of [false, true]) {
      if (pinned !== await evaluate(`!!TakeoffApp.app.settings.get('chrome_pinned')`)) {
        await tapInMenubar(`document.getElementById('chromePin')`, 'the pin');
        await sleep(500);
      }
      const where = `${L.name}: D. ${pinned ? 'pinned' : 'floating'}`;
      if (!ok(`${where}: the toolbars are ${pinned ? 'pinned' : 'floating'}`,
        pinned === await evaluate(`!!TakeoffApp.app.settings.get('chrome_pinned')`))) continue;
      for (const mode of ['tile', 'count']) {
        // the row off before the tool is picked: the bar is placed under the toolbars as they are
        if (await evaluate(`!document.getElementById('markupBar').hidden`)) await viewEntry('toggle-markup-bar');
        if (!ok(`${where}: ${mode}: its button can be brought on screen`, await reach(mode))) continue;
        await tapOn(`document.querySelector('#toolButtons [data-mode="${mode}"]')`, `the ${mode} button`);
        await sleep(350);
        await answer(mode);
        await pullDown();
        await sleep(300);
        const b0 = await barNow();
        if (!ok(`${where}: ${mode}: its bar is up, the markup row off, every control on screen and uncovered`,
          !!b0 && b0.mode === mode && !b0.markup && !b0.ctl.some(c => c.covered || !c.on), b0)) continue;
        ok(`${where}: ${mode}: View › Markup Toolbar taken by a finger`, await viewEntry('toggle-markup-bar'));
        await pullDown();
        await sleep(300);
        const b1 = await barNow();
        ok(`${where}: ${mode}: the markup row is on, the toolbars taller (bottom ${b0.chromeBottom} -> ${b1 && b1.chromeBottom})`,
          !!b1 && b1.markup && b1.chromeBottom > b0.chromeBottom, b1);
        const hid = b1 ? b1.ctl.filter(c => c.covered || !c.on) : [];
        ok(`${where}: ${mode}: ...the bar came down with them (top ${b0.rect[1]} -> ${b1 && b1.rect[1]}): every control on screen, none covered`,
          !!b1 && !hid.length, hid);
        const moves = await evaluate(`new Promise(r => { let n = 0; const mo = new MutationObserver(() => { n += 1; });
          mo.observe(document.getElementById('toolOpts'), { attributes: true, attributeFilter: ['style'] });
          setTimeout(() => { mo.disconnect(); r(n); }, 1200); })`);
        eq(`${where}: ${mode}: ...placed and left: nothing moves it in the next 1.2 s`, moves, 0);
        const box = b1 && b1.ctl.find(c => c.tag === 'INPUT');
        if (ok(`${where}: ${mode}: its bar has a box`, !!box)) {
          await tap(box.x, box.y);
          eq(`${where}: ${mode}: a real tap on its first box puts the finger in it, the tool still ${mode}`,
            await evaluate(`({ focused: document.activeElement === document.querySelectorAll('#toolOpts input, #toolOpts select, #toolOpts button')[${box.i}],
              mode: TakeoffApp.controller.mode })`), { focused: true, mode });
        }
        ok(`${where}: ${mode}: View › Markup Toolbar again`, await viewEntry('toggle-markup-bar'));
        await pullDown();
        await sleep(300);
        const b2 = await barNow();
        eq(`${where}: ${mode}: ...the row off: the bar back exactly where it was`, b2 && [b2.markup, b2.rect], [false, b0.rect]);
      }
    }
    // Standard, then Touch again, from View, pinned: Count picked in the
    // Standard layout, its bar placed under the Standard's shorter toolbars;
    // the Touch layout's are taller
    const pick = async mode => {
      if (!ok(`${L.name}: D. the ${mode} button can be brought on screen`, await reach(mode))) return;
      await tapOn(`document.querySelector('#toolButtons [data-mode="${mode}"]')`, `the ${mode} button`);
      await sleep(350);
      await answer(mode);
    };
    if (await evaluate(`!document.getElementById('markupBar').hidden`)) await viewEntry('toggle-markup-bar');
    await pick('pan');
    await pick('count');
    const t0 = await barNow();
    if (!ok(`${L.name}: D. Count's bar up in the Touch layout, none of it covered`,
      !!t0 && t0.mode === 'count' && t0.ui === 'touch' && !t0.ctl.some(c => c.covered || !c.on), t0)) return;
    ok(`${L.name}: D. View › Standard layout`, await viewEntry('ui-standard'));
    await pick('pan');
    await pick('count');
    const t1 = await barNow();
    const hid1 = t1 ? t1.ctl.filter(c => c.covered || !c.on) : [];
    ok(`${L.name}: D. ...Count picked again in the Standard layout: its bar on screen, none of it covered`,
      !!t1 && t1.ui === 'standard' && !hid1.length, t1);
    ok(`${L.name}: D. View › Touch layout`, await viewEntry('ui-touch'));
    await sleep(300);
    const t2 = await barNow();
    const hid2 = t2 ? t2.ctl.filter(c => c.covered || !c.on) : [];
    ok(`${L.name}: D. ...Touch again, its toolbars taller (bottom ${t1 && t1.chromeBottom} -> ${t2 && t2.chromeBottom}): Count's bar on screen, none of it covered`,
      !!t1 && !!t2 && t2.ui === 'touch' && t2.chromeBottom > t1.chromeBottom && !hid2.length, { hid2, t2 });
    eq(`${L.name}: D. ...and exactly where the Touch layout puts it`, t2 && t2.rect, t0.rect);
  };
  if (GROWS.includes(`${L.w}x${L.h}`)) await toolbarsGrow();
  await call('Page.setInterceptFileChooserDialog', { enabled: false });
  await send('Target.closeTarget', { targetId });
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
  const only = process.argv.slice(2);
  for (const L of LAYOUTS) {
    if (only.length && !only.includes(`${L.w}x${L.h}`)) continue;
    try {
      await layout(L);
    } catch (err) {
      ok(`${L.name}: ran to the end`, false, err.stack || String(err));
    }
  }
} catch (err) {
  fails += 1;
  log(`FAIL the browser run: ${err.stack || err}`);
}

log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass -- by real taps on a phone, an iPad and a desktop: the desktop's Infinity opens and reads 'vertical', the toast leaves the overlay strip and an open menu clear, every tool's options are on the screen and take a finger, with the toolbars grown too`);
await finish(fails ? 1 : 0);
