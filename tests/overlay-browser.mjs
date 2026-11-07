// THE SAVED OVERLAY'S PIXELS IN A REAL BROWSER -- the read path the mask is
// built from, which no node test can run: a browser's own PNG decode, its 2D
// canvas, createImageBitmap, and an iPad's reduced decode.
//
// tests/overlay-look.mjs holds the arithmetic and the PNG reader to the
// desktop's PIL. This holds the WIRING that chooses between them, in headless
// Chrome: js/main.js passCanvas / readDecode / overlaySurface, lifted by text
// and run on the real modules (overlay-look.js, page-store.js), with the
// ImageData handed to createImageBitmap -- the mask itself -- captured and
// compared, by sha1, with the desktop's mask for every PNG of the committed
// truth (tests/data/overlay-truth.json `decode`), each read
//   as a picture        (its base64, a colour key counted),
//   as a sheet decoded privately (not in the page store), and
//   as a sheet the page store already holds (its default decode);
// so a semi-transparent picture (a 2D canvas premultiplies it), one tagged
// Display P3 or Adobe RGB (a browser colour-manages it), 16-bit and keyed
// PNGs all have to come out as the desktop's. Then the same with an iPad's
// canvas cap emulated (getImageData blank over 1 MP, as the build's own iPad
// probe does): a picture decoded smaller must still choose the cut-off Auto
// reads off the WHOLE picture, which the resampled one moves. Then a decode
// the page store HOLDS while its PNG is read (a job over the network): the
// store closing it mid-read (a neighbour's prefetch evicting it), a head or
// bytes that fail (offline) -- full size and reduced -- must still give the
// mask, and what is learnt of a sheet is asked once.
//
// Synthetic: no real iPad. Chrome or Edge is found at its usual place or at
// $CHROME; without one this SKIPS (exit 2).
// Run: node tests/overlay-browser.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.normalize(path.join(here, '..'));
const SNAP = JSON.parse(await readFile(path.join(here, 'data', 'overlay-truth.json'), 'utf8'));
const MAIN = await readFile(path.join(ROOT, 'js', 'main.js'), 'utf8');

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

/** A top-level function of main.js, by its text (its parameter list may
 *  hold a default `() => {}`). '' for a helper main.js does not have
 *  (`optional`): the wiring it serves is then run as it is, and fails or
 *  passes on what it does. */
function fnText(name, optional = false) {
  const m = new RegExp(`\\n(async )?function ${name}\\(`).exec(MAIN);
  if (!m && optional) return '';
  if (!m) throw new Error(`main.js has no function ${name}`);
  let close = m.index + m[0].length - 1;
  for (let d = 0; close < MAIN.length; close++) {
    if (MAIN[close] === '(') d += 1;
    else if (MAIN[close] === ')') { d -= 1; if (d === 0) break; }
  }
  const open = MAIN.indexOf('{', close);
  let depth = 0;
  for (let i = open; i < MAIN.length; i++) {
    if (MAIN[i] === '{') depth += 1;
    else if (MAIN[i] === '}') { depth -= 1; if (depth === 0) return MAIN.slice(m.index + 1, i + 1); }
  }
  throw new Error(`could not read ${name}`);
}
const LIFTED = [...['passCanvas', 'readDecode', 'overlaySurface'].map(n => fnText(n)),
  ...['readHeld', 'readIfYouCan'].map(n => fnText(n, true))].join('\n');

// ── a static server over this checkout, read-only ─────────────────────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/__blank.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><meta charset="utf-8"><title>overlay pixels</title>');
      return;
    }
    const f = path.normalize(path.join(ROOT, p));
    if (!f.startsWith(path.join(ROOT, 'js'))) { res.writeHead(403); res.end(); return; }
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
const profile = mkdtempSync(path.join(tmpdir(), 'ovb-'));
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

  async function page(prelude = '') {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const call = (m, prm) => send(m, prm, sessionId);
    await call('Page.enable');
    if (prelude) await call('Page.addScriptToEvaluateOnNewDocument', { source: prelude });
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
    // The modules, the lifted wiring, and the mask captured on its way into
    // createImageBitmap (a Blob going in is a decode, not the mask).
    await evaluate(`(async () => {
      const ol = await import('/js/core/overlay-look.js');
      const ps = await import('/js/core/page-store.js');
      window.__ol = ol; window.__ps = ps;
      window.__surface = new Function('overlayRgba', 'pngInfo', 'pngHeadInfo', 'pngPlain', 'pngRgba', 'pngAutoCutoff',
        'decodeSheet', 'decodeReduces', ${JSON.stringify(`${LIFTED}\nreturn overlaySurface;`)})(ol.overlayRgba,
        ol.pngInfo, ol.pngHeadInfo, ol.pngPlain, ol.pngRgba, ol.pngAutoCutoff, ps.decodeSheet, ps.decodeReduces);
      const make = window.createImageBitmap;
      window.__mask = null;
      window.createImageBitmap = function (a, ...rest) {
        if (a instanceof ImageData) window.__mask = new Uint8ClampedArray(a.data);
        return make.call(this, a, ...rest);
      };
      window.__sha1 = async d => [...new Uint8Array(await crypto.subtle.digest('SHA-1', d))]
        .map(b => b.toString(16).padStart(2, '0')).join('');
      window.__bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      return true;
    })()`);
    return { evaluate };
  }

  // ═══ 1. every PNG of the truth, every way it is read, every look ═══════
  log('-- 1. the mask, as the browser builds it, against the desktop\'s --');
  const pg = await page();
  const cases = SNAP.decode.map(c => ({ name: c.name, png: c.png, kinds: c.kinds }));
  const rows = await pg.evaluate(`(async () => {
    const out = [];
    for (const c of ${JSON.stringify(cases)}) {
      const raw = __bytes(c.png);
      for (const how of ['picture', 'sheet, privately', 'sheet, in the page store']) {
        const kind = how === 'picture' ? 'picture' : 'sheet';
        const want = c.kinds[kind];
        if (want.unreadable) continue;
        for (const [mode, invert, cutoff, used, hash] of want.looks) {
          let store = null;
          try {
            if (how === 'sheet, in the page store') store = await __ps.decodeSheet(raw);
            // a held decode comes with its PNG's head (page-store pngHead)
            const px = { img: store, owned: false, bytes: () => raw, colourKey: kind === 'picture',
              head: store ? async () => raw.subarray(0, 16384) : undefined };
            window.__mask = null;
            const s = await __surface(px, { mode, invert, cutoff });
            const got = window.__mask ? await __sha1(window.__mask) : null;
            out.push({ name: c.name, how, look: [mode, invert, cutoff], want: [used, hash], got: [s.cutoff, got],
              size: [s.width, s.height] });
            s.close();
          } catch (err) {
            out.push({ name: c.name, how, look: [mode, invert, cutoff], error: String(err && err.message || err) });
          } finally {
            store?.close?.();
          }
        }
      }
    }
    return out;
  })()`);
  // Read through the browser's decode, not as PIL reads it: declared (no
  // desktop writer makes one).
  const DECLARED = new Set(['16-bit grey with a colour key|picture']);
  let bad = 0;
  let declared = 0;
  for (const r of rows) {
    if (DECLARED.has(`${r.name}|${r.how}`)) { declared += 1; continue; }
    const same = !r.error && r.got[0] === r.want[0] && r.got[1] === r.want[1];
    if (!same) {
      bad += 1;
      if (bad <= 12) {
        ok(`${r.name} (${r.how}) ${JSON.stringify(r.look)}: the desktop's mask and cut-off ${r.want[0]}`, false,
          r.error || `cut-off ${r.got[0]}, mask ${r.got[1] === r.want[1] ? 'same' : 'DIFFERENT'}`);
      }
    }
  }
  ok(`every mask the browser built equals the desktop's: ${rows.length - declared} reads of ${cases.length} PNGs `
    + `(${bad} differ; ${declared} declared)`, bad === 0 && rows.length > 300);
  for (const name of ['alpha 128 on paper 248', 'a photo tagged Display P3, imported', 'a photo tagged Adobe RGB, imported',
    '16-bit RGBA', 'RGB with a colour key on its paper']) {
    const mine = rows.filter(r => r.name === name);
    ok(`...among them "${name}", every way it is read (${mine.length})`,
      mine.length >= 10 && mine.every(r => !r.error && r.got[0] === r.want[0] && r.got[1] === r.want[1]));
  }

  // ═══ 2. an iPad's reduced decode: Auto off the whole picture ═══════════
  log('\n-- 2. a decode made smaller (an iPad\'s canvas cap, emulated at 1 MP) --');
  const CAP = `(() => {
    const CAP = 1024 * 1024;
    const kinds = [CanvasRenderingContext2D.prototype];
    if (self.OffscreenCanvasRenderingContext2D) kinds.push(OffscreenCanvasRenderingContext2D.prototype);
    for (const P of kinds) {
      const get = P.getImageData;
      P.getImageData = function (x, y, w, h, ...r) {
        const c = this.canvas;
        if (c.width * c.height > CAP) return new ImageData(w, h);
        return get.call(this, x, y, w, h, ...r);
      };
    }
  })();`;
  const capped = await page(CAP);
  const res = await capped.evaluate(`(async () => {
    // A photographed print: grainy paper whose commonest shade is a white
    // one (252, three pixels in ten) among greys 236..247, dark lines across
    // it. Whole, it is white paper to Auto; resampled smaller, the grain
    // blends and the commonest shade is a grey.
    const W = 1400, H = 1000;
    const cv = new OffscreenCanvas(W, H);
    const cx = cv.getContext('2d');
    const im = cx.createImageData(W, H);
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let y = 0, i = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i += 4) {
        let v = rnd() < 0.3 ? 252 : 236 + Math.floor(rnd() * 12);
        if (x % 97 < 2 || y % 71 < 2) v = 30;
        im.data[i] = v; im.data[i + 1] = v; im.data[i + 2] = v; im.data[i + 3] = 255;
      }
    }
    cx.putImageData(im, 0, 0);
    const raw = new Uint8Array(await (await cv.convertToBlob({ type: 'image/png' })).arrayBuffer());
    const reduces = await __ps.decodeReduces(W, H);
    const out = { reduces, rows: [] };
    for (const invert of [false, true]) {
      // the desktop's answer: its arithmetic over the WHOLE picture
      const whole = __ol.overlayRgba(await __ol.pngRgba(raw), 'lines', invert, null).cutoff;
      // what the reduced pixels alone would choose
      const small = await __ps.decodeSheet(raw);
      const scv = new OffscreenCanvas(small.bitmap.width, small.bitmap.height);
      const sx = scv.getContext('2d');
      sx.drawImage(small.bitmap, 0, 0);
      const alone = __ol.overlayRgba(sx.getImageData(0, 0, scv.width, scv.height), 'lines', invert, null).cutoff;
      const decoded = [small.bitmap.width, small.bitmap.height];
      small.close();
      for (const kind of ['picture', 'sheet']) {
        window.__mask = null;
        const s = await __surface({ img: null, owned: false, bytes: () => raw, colourKey: kind === 'picture' },
          { mode: 'lines', invert, cutoff: null });
        out.rows.push({ kind, invert, whole, alone, decoded, got: s.cutoff, size: [s.width, s.height],
          mask: window.__mask ? window.__mask.length / 4 : 0 });
        s.close();
      }
    }
    return out;
  })()`);
  ok('the emulated cap makes the decode smaller (as an iPad\'s would)', res.reduces === true, res);
  for (const r of res.rows) {
    ok(`${r.kind}, invert ${r.invert}: decoded at ${r.decoded.join('x')} of 1400x1000, Auto is the whole picture's `
      + `${r.whole} (the reduced pixels alone: ${r.alone})`, r.got === r.whole, r);
    ok(`...its mask at the decode's size, reporting the native size`, r.mask === r.decoded[0] * r.decoded[1]
      && r.size[0] === 1400 && r.size[1] === 1000, r);
  }
  ok('(the case bites: the reduced pixels alone choose another cut-off at least once)',
    res.rows.some(r => r.alone !== r.whole), res.rows.map(r => [r.whole, r.alone]));

  // ═══ 3. a decode the page store holds, while its bytes are read ════════
  // The store closes what it evicts, and a neighbour's prefetch can land
  // while the overlay waits on a read of the source's PNG (a job read over
  // the network: every read is a request). And a read can fail outright
  // (offline). The held decode is in hand either way: it must still give
  // the desktop's mask, and a read that fails must not lose it (R8-2P-1,
  // R8-2P-2). Each read is counted: what is learnt of a sheet is learnt once.
  log('\n-- 3. a held decode the store closes, or reads that fail, while its bytes are asked for --');
  const plainCase = SNAP.decode.find(c => c.name === 'RGB on paper 240 (plain)');
  const taggedCase = SNAP.decode.find(c => c.name === 'a photo tagged Display P3, imported');
  const held = await pg.evaluate(`(async () => {
    const plain = ${JSON.stringify({ png: plainCase.png, looks: plainCase.kinds.sheet.looks })};
    const tagged = ${JSON.stringify({ png: taggedCase.png, looks: taggedCase.kinds.sheet.looks })};
    const offline = () => Promise.reject(new TypeError('Failed to fetch'));
    const out = [];
    const run = async (label, c, i, makePx) => {
      const raw = __bytes(c.png);
      const [mode, invert, cutoff, used, hash] = c.looks[i];
      const store = await __ps.decodeSheet(raw);
      const calls = { head: 0, bytes: 0 };
      try {
        const px = makePx({ raw, store, calls });
        window.__mask = null;
        const s = await __surface(px, { mode, invert, cutoff });
        const got = window.__mask ? await __sha1(window.__mask) : null;
        out.push({ label, want: [used, hash], got: [s.cutoff, got], size: [s.width, s.height], calls });
        s.close();
      } catch (err) {
        out.push({ label, want: [used, hash], error: String(err && err.message || err), calls });
      } finally {
        store.close();
      }
    };
    const later = ms => new Promise(r => setTimeout(r, ms));
    for (const i of [0, 1, 2, 3, 4]) {
      // the store evicts (closes) it while its head is being read
      await run('closed while its head is read', plain, i, ({ raw, store, calls }) => ({
        img: store, owned: false, bytes: () => { calls.bytes += 1; return raw; },
        head: async () => { calls.head += 1; store.close(); await later(20); return raw.subarray(0, 16384); } }));
      // offline: the head and the bytes both fail
      await run('offline: head and bytes fail', plain, i, ({ store, calls }) => ({
        img: store, owned: false, bytes: () => { calls.bytes += 1; return offline(); },
        head: () => { calls.head += 1; return offline(); } }));
      // a head that cannot tell, and bytes that fail
      await run('a head that cannot tell, bytes that fail', plain, i, ({ store, calls }) => ({
        img: store, owned: false, bytes: () => { calls.bytes += 1; return offline(); },
        head: async () => { calls.head += 1; return null; } }));
    }
    // learnt once: the second arrival asks nothing
    {
      const raw = __bytes(plain.png);
      const [mode, invert, cutoff, used, hash] = plain.looks[0];
      const facts = {};
      const calls = { head: 0, bytes: 0 };
      const rows = [];
      for (let n = 0; n < 2; n++) {
        const store = await __ps.decodeSheet(raw);
        try {
          window.__mask = null;
          const s = await __surface({ img: store, owned: false, facts,
            bytes: () => { calls.bytes += 1; return raw; },
            head: async () => { calls.head += 1; return raw.subarray(0, 16384); } }, { mode, invert, cutoff });
          rows.push([s.cutoff, window.__mask ? await __sha1(window.__mask) : null]);
          s.close();
        } catch (err) {
          rows.push(String(err && err.message || err));
        } finally {
          store.close();
        }
      }
      out.push({ label: 'twice, the same sheet', want: [used, hash], rows, calls: { ...calls } });
    }
    // a held decode of a sheet that is NOT plain, whose bytes cannot be read:
    // the held read, rather than nothing
    {
      const raw = __bytes(tagged.png);
      const [mode, invert, cutoff] = tagged.looks[0];
      const store = await __ps.decodeSheet(raw);
      try {
        window.__mask = null;
        const s = await __surface({ img: store, owned: false, bytes: offline,
          head: async () => raw.subarray(0, 16384) }, { mode, invert, cutoff });
        out.push({ label: 'not plain, its bytes unreadable', size: [s.width, s.height],
          mask: window.__mask ? window.__mask.length / 4 : 0, decoded: [store.width, store.height] });
        s.close();
      } catch (err) {
        out.push({ label: 'not plain, its bytes unreadable', error: String(err && err.message || err) });
      } finally {
        store.close();
      }
    }
    return out;
  })()`);
  const perLook = held.filter(x => x.want && !x.rows);
  ok('(every look of the plain sheet was read three ways)', perLook.length === 15, perLook.length);
  for (const r of perLook) {
    ok(`a plain sheet the store holds, ${r.label}: the desktop's mask and cut-off ${r.want[0]}`,
      !r.error && r.got[0] === r.want[0] && r.got[1] === r.want[1], r.error || { got: r.got, calls: r.calls });
  }
  {
    const r = held.find(x => x.label === 'offline: head and bytes fail');
    ok('...and offline it does not even ask for the bytes once its head could not be read', r && r.calls.bytes === 0, r);
    const t = held.find(x => x.label === 'twice, the same sheet');
    ok('a sheet read twice: the desktop\'s mask both times, and what was learnt of it asked once -- '
      + 'its head read once, its bytes never', t && t.rows.length === 2
      && t.rows.every(x => Array.isArray(x) && x[0] === t.want[0] && x[1] === t.want[1])
      && t.calls.head === 1 && t.calls.bytes === 0, t);
    const n = held.find(x => x.label === 'not plain, its bytes unreadable');
    ok('a held sheet that is not plain, its bytes unreadable: the held decode\'s read, at its own size -- not nothing',
      n && !n.error && n.mask === n.decoded[0] * n.decoded[1] && n.size[0] === n.decoded[0], n);
  }

  // ═══ 4. ...and the same on an iPad: a reduced decode on Auto ═══════════
  log('\n-- 4. a reduced decode the store holds, on Auto, while its bytes are asked for --');
  const red = await capped.evaluate(`(async () => {
    const W = 1400, H = 1000;
    const cv = new OffscreenCanvas(W, H);
    const cx = cv.getContext('2d');
    const im = cx.createImageData(W, H);
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let y = 0, i = 0; y < H; y++) {
      for (let x = 0; x < W; x++, i += 4) {
        let v = rnd() < 0.3 ? 252 : 236 + Math.floor(rnd() * 12);
        if (x % 97 < 2 || y % 71 < 2) v = 30;
        im.data[i] = v; im.data[i + 1] = v; im.data[i + 2] = v; im.data[i + 3] = 255;
      }
    }
    cx.putImageData(im, 0, 0);
    const raw = new Uint8Array(await (await cv.convertToBlob({ type: 'image/png' })).arrayBuffer());
    const whole = __ol.overlayRgba(await __ol.pngRgba(raw), 'lines', false, null).cutoff;
    const out = { whole, rows: [] };
    const later = ms => new Promise(r => setTimeout(r, ms));
    const run = async (label, makePx, facts) => {
      const store = await __ps.decodeSheet(raw);
      const decoded = [store.bitmap.width, store.bitmap.height];
      // what its reduced pixels alone choose
      const scv = new OffscreenCanvas(decoded[0], decoded[1]);
      const sx = scv.getContext('2d');
      sx.drawImage(store.bitmap, 0, 0);
      const alone = __ol.overlayRgba(sx.getImageData(0, 0, decoded[0], decoded[1]), 'lines', false, null).cutoff;
      const calls = { bytes: 0 };
      try {
        window.__mask = null;
        const s = await __surface({ ...makePx(store, calls), facts }, { mode: 'lines', invert: false, cutoff: null });
        out.rows.push({ label, reduced: !!store.reduced, decoded, alone, got: s.cutoff, size: [s.width, s.height],
          mask: window.__mask ? window.__mask.length / 4 : 0, calls });
        s.close();
      } catch (err) {
        out.rows.push({ label, reduced: !!store.reduced, decoded, alone, error: String(err && err.message || err), calls });
      } finally {
        store.close();
      }
    };
    // the store evicts it while its full-size rows are being read
    await run('closed while its bytes are read', (store, calls) => ({ img: store, owned: false,
      bytes: async () => { calls.bytes += 1; store.close(); await later(20); return raw; } }));
    // offline: Auto off the reduced pixels in hand, rather than nothing
    await run('offline: its bytes fail', (store, calls) => ({ img: store, owned: false,
      bytes: () => { calls.bytes += 1; return Promise.reject(new TypeError('Failed to fetch')); } }));
    // learnt once: the second arrival reads no bytes
    const facts = {};
    for (const n of [1, 2]) {
      await run('arrival ' + n + ', the same sheet', (store, calls) => ({ img: store, owned: false,
        bytes: () => { calls.bytes += 1; return raw; } }), facts);
    }
    return out;
  })()`);
  for (const r of red.rows) {
    const want = r.label.startsWith('offline') ? r.alone : red.whole;
    ok(`a reduced decode the store holds (${r.decoded.join('x')} of 1400x1000), ${r.label}: Auto ${want}`
      + `${r.label.startsWith('offline') ? ' -- read off the reduced pixels in hand' : ', the whole sheet\'s'}`,
    r.reduced && !r.error && r.got === want && r.mask === r.decoded[0] * r.decoded[1]
      && r.size[0] === 1400 && r.size[1] === 1000, r);
  }
  ok('...the first arrival reads its full-size rows, the second does not read them again',
    red.rows.filter(r => r.label.startsWith('arrival')).map(r => r.calls.bytes).join() === '1,0',
    red.rows.map(r => [r.label, r.calls.bytes]));
} catch (err) {
  fails += 1;
  log(`FAIL the browser check could not run: ${err && err.stack || err}`);
}

console.log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass -- in headless Chrome the mask is the desktop's, however its source is read (synthetic: no iPad)`);
await finish(fails ? 1 : 0);
