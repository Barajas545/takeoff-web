// THE TILE FORM IN A REAL BROWSER: its size list is the desktop's, a preset
// picked with the keyboard is the size that is saved, and its estimate reads
// its numbers the desktop's way.
//
// The form (js/ui/dialogs.js askTile) is the desktop's ItemPropertiesDialog
// tile section: TILE_SIZE_PRESETS rows of (label, w_in, h_in), "3″ × 6″
// subway" being 6 × 3 in; the row showing is found by NUMBER, within 0.01 and
// either way round (_sync_tile_preset_combo), and a size typed by hand points
// the list at its row or at Custom… (_tile_size_edited); the estimate's
// numbers are _tile_refresh's: f"{area:,.1f}", f"{needed:,}",
// f"{int(math.ceil(needed / per_box)):,}". A <select>'s value only does what
// a browser does with it, so this runs in headless Chrome: the real module,
// the real form, real key presses (Input.dispatchKeyEvent) on the list and in
// the size boxes, and a real mouse click on OK -- and reads what the form
// hands back, which is what Properties and a new tile run store.
//
// Synthetic: no iPad. Chrome or Edge is found at its usual place or at
// $CHROME; without one this SKIPS (exit 2).
// Run: node tests/tile-form-browser.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TILE_SIZE_PRESETS } from '../js/tools/controller.js';
import { pyIntStr } from '../js/core/pyformat.js';

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

// ── a static server over this checkout's js/, read-only ───────────────────
const server = http.createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/__blank.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><meta charset="utf-8"><title>tile form</title><body><div id="modal" hidden></div>');
      return;
    }
    const f = path.normalize(path.join(ROOT, p));
    if (!f.startsWith(path.join(ROOT, 'js'))) { res.writeHead(403); res.end(); return; }
    const b = await readFile(f);
    res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' });
    res.end(b);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

// ── headless Chrome, a throw-away profile, the DevTools protocol ──────────
const profile = mkdtempSync(path.join(tmpdir(), 'tfb-'));
const chrome = spawn(EXE, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-gpu',
  '--window-size=1100,900', 'about:blank'],
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

  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const call = (m, prm) => send(m, prm, sessionId);
  await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride', { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });
  const loaded = new Promise(r => {
    const h = msg => { if (msg.sessionId === sessionId && msg.method === 'Page.loadEventFired') { handlers.delete(h); r(); } };
    handlers.add(h);
  });
  await call('Page.navigate', { url: `${ORIGIN}/__blank.html` });
  await Promise.race([loaded, sleep(15000)]);
  const evaluate = async expression => {
    const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) {
      throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
    }
    return r.result.value;
  };
  await evaluate(`(async () => {
    window.__errors = [];
    window.addEventListener('error', e => window.__errors.push(String(e.message)));
    window.addEventListener('unhandledrejection', e => window.__errors.push(String(e.reason)));
    window.__D = await import('/js/ui/dialogs.js');
    return true; })()`);

  // real input: keys as a keyboard sends them, a click as a mouse makes it
  const KEYS = {
    ArrowUp: ['ArrowUp', 38], ArrowDown: ['ArrowDown', 40], Backspace: ['Backspace', 8],
  };
  const press = async name => {
    const [code, vk] = KEYS[name];
    const base = { key: name, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
    await call('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
    await call('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await sleep(60);
  };
  const type = async text => {
    for (const ch of text) {
      const code = /\d/.test(ch) ? `Digit${ch}` : ch === '.' ? 'Period' : '';
      const vk = /\d/.test(ch) ? 48 + Number(ch) : ch === '.' ? 190 : 0;
      const base = { key: ch, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
      await call('Input.dispatchKeyEvent', { type: 'keyDown', ...base, text: ch, unmodifiedText: ch });
      await call('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    }
    await sleep(60);
  };
  const click = async expr => {
    const r = await evaluate(`(e => { const b = e.getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })(${expr})`);
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r[0], y: r[1] });
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x: r[0], y: r[1], button: 'left', clickCount: 1, buttons: 1 });
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r[0], y: r[1], button: 'left', clickCount: 1 });
    await sleep(120);
  };
  const LAYER = `[...document.querySelectorAll('#modal .modal-layer')].pop()`;
  const SEL = `${LAYER}.querySelector('select')`;
  const SIZE = `[...${LAYER}.querySelectorAll('input[type=number]')]`;
  const box = n => `${SIZE}[${n}]`;          // 0 width, 1 height, ... 4 tiles per box
  const state = () => evaluate(`(() => { const s = ${SEL};
    return { value: s.value, text: (s.options[s.selectedIndex] || {}).text || '',
      w: ${box(0)}.value, h: ${box(1)}.value,
      readout: [...${LAYER}.querySelectorAll('.hint')].map(e => e.textContent).find(t => / sq ft /.test(t)) || '' }; })()`);
  /** Empty a size box with real keys (it is focused by a real click), then type. */
  const retype = async (n, text) => {
    await click(box(n));
    await evaluate(`(${box(n)}).select(); true`);
    await press('Backspace');
    await type(text);
  };
  const open = setup => evaluate(`(() => { window.__res = undefined;
    __D.askTile(${JSON.stringify(setup)}).then(r => { window.__res = r === null ? 'cancelled' : r; }); return true; })()`);
  const answer = async () => {
    for (let i = 0; i < 50; i++) {
      const r = await evaluate('window.__res');
      if (r !== undefined && r !== null) return r;
      await sleep(50);
    }
    return null;
  };
  const setup = { tileWIn: 12, tileHIn: 12, groutIn: 0.125, pattern: 'grid', wastePct: 10, tilesPerBox: 0,
    areaFt2: 1235.25, existing: { name: 'Floor T' } };

  // ═══ 1. the list is the desktop's, and opens on the row of the size ════
  log('-- 1. the size list: the desktop\'s presets, the size\'s own row --');
  await open(setup);
  await sleep(150);
  const options = await evaluate(`[...(${SEL}).options].map(o => [o.value, o.text])`);
  eq('the list: every preset by its own label, keyed by its size, then Custom…', options,
    [...TILE_SIZE_PRESETS.map(([label, w, h]) => [`${w}x${h}`, label]), ['custom', 'Custom…']]);
  ok('...the desktop\'s own rows: "3″ × 6″ subway" is 6 × 3 in, "12″ × 24″" is 24 × 12',
    TILE_SIZE_PRESETS.some(([l, w, h]) => l === '3″ × 6″ subway' && w === 6 && h === 3)
    && TILE_SIZE_PRESETS.some(([l, w, h]) => l === '12″ × 24″' && w === 24 && h === 12));
  let s = await state();
  eq('a 12 × 12 tile opens on its row', [s.value, s.text, s.w, s.h], ['12x12', '12″ × 12″', '12', '12']);

  // ═══ 2. a preset picked with the keyboard is the size handed back ═════
  log('-- 2. ArrowUp to "3″ × 6″ subway", then OK with the mouse --');
  await evaluate(`(${SEL}).focus(); true`);
  const target = TILE_SIZE_PRESETS.findIndex(([l]) => l === '3″ × 6″ subway');
  for (let i = 0; i < 20; i++) {
    const idx = await evaluate(`(${SEL}).selectedIndex`);
    if (idx === target) break;
    await press(idx > target ? 'ArrowUp' : 'ArrowDown');
  }
  s = await state();
  eq('the list shows the subway row', [s.value, s.text], ['6x3', '3″ × 6″ subway']);
  eq('...and the size boxes hold ITS size, 6 × 3 in', [s.w, s.h], ['6', '3']);
  await click(`[...${LAYER}.querySelectorAll('button')].find(b => b.textContent.trim() === 'OK')`);
  const got = await answer();
  eq('OK hands back the preset\'s size: tileWIn 6, tileHIn 3 (the desktop\'s _tile_preset_picked)',
    got && [got.tileWIn, got.tileHIn], [6, 3]);
  eq('...with the rest of the form as it was', got && [got.name, got.pattern, got.groutIn], ['Floor T', 'grid', 0.125]);

  // ═══ 3. found by number, either way round; typed sizes follow ══════════
  log('-- 3. a size found by number, and typed by hand --');
  await open({ ...setup, tileWIn: 12, tileHIn: 24 });
  await sleep(150);
  s = await state();
  eq('12 × 24 opens on "12″ × 24″" (24 × 12 there: either way round)', [s.value, s.text], ['24x12', '12″ × 24″']);
  await retype(0, '7');
  s = await state();
  eq('a width typed to 7 (7 × 24, no preset): Custom…', [s.value, s.w, s.h], ['custom', '7', '24']);
  await retype(0, '4');
  await retype(1, '12.004');
  s = await state();
  eq('4 × 12.004, within 0.01 of "4″ × 12″ subway" (12 × 4 there): its row', [s.value, s.text], ['12x4', '4″ × 12″ subway']);
  await retype(1, '12.02');
  s = await state();
  eq('...12.02 is not within 0.01: Custom…', s.value, 'custom');

  // ═══ 4. the estimate reads its numbers the desktop's way ══════════════
  log('-- 4. the estimate\'s numbers: f"{area:,.1f}", f"{needed:,}", f"{boxes:,}" --');
  await retype(1, '12');
  await retype(4, '1');
  s = await state();
  const m = /^(\S+) sq ft {2}≈ {2}(\S+) tiles {2}→ {2}(\S+) with waste {2}· {2}(\S+) boxes$/.exec(s.readout);
  ok('the estimate reads area, tiles, with waste, boxes', !!m, s.readout);
  if (m) {
    eq('the area, 1235.25 sq ft: half to even, with the thousands comma (_tile_refresh f"{area_ft2:,.1f}")', m[1], '1,235.2');
    const n = t => Number(t.replace(/,/g, ''));
    ok('the counts are four-figure ones here (the commas are being looked at)', n(m[3]) >= 1000 && n(m[4]) >= 1000, s.readout);
    for (const [what, t] of [['tiles', m[2]], ['with waste', m[3]], ['boxes', m[4]]]) {
      eq(`...${what} with the comma, as f"{n:,}" writes ${n(t)}`, t, pyIntStr(n(t), true));
    }
    eq('...and at one tile a box, as many boxes as tiles', m[4], m[3]);
  }
  await click(`[...${LAYER}.querySelectorAll('button')].find(b => b.textContent.trim() === 'OK')`);
  const got2 = await answer();
  eq('OK hands back the size typed, 4 × 12, and 1 a box', got2 && [got2.tileWIn, got2.tileHIn, got2.tilesPerBox], [4, 12, 1]);
  const errors = await evaluate('window.__errors || []');
  eq('no page errors', errors, []);
} catch (err) {
  fails += 1;
  log(`FAIL the browser check could not run: ${err && err.stack || err}`);
}

console.log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass -- the tile form's sizes and estimate are the desktop's, by real keys in headless Chrome (synthetic: no iPad)`);
await finish(fails ? 1 : 0);
