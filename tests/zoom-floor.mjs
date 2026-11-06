// ZOOMING OUT STOPS AT THE WHOLE SHEET -- the desktop's 3.06 / 3.07 rules, on the web.
//
// A plain wheel notch out, a pinch or the minus button stops exactly at Fit
// with the sheet centred; Shift+wheel goes past (Ctrl+Shift+wheel when the
// wheel scrolls); the readout says 'Fit 21%'; the first refused notch of a
// session says why; Zoom to item never lands below Fit; a sideways wheel
// never zooms; a change of size keeps a view at Fit at the new Fit; and the
// picture windows stop at their picture's Fit, Shift going on to half.
//
//  1. wheelInOut, the one wheel rule the sheet, the callout preview and the
//     picture windows share: no up or down, no zoom -- but Shift+wheel,
//     which browsers deliver sideways, is a notch.
//  2. THE WORDS, character for character: the Settings box, its tooltip, the
//     minus button's tooltip, the Shortcuts wheel line and the once-a-session
//     line, against the desktop's own (and the touch wordings the user chose).
//  3. THE DIFFERENTIAL: every scenario the desktop's own methods ran in
//     tests/zoom-floor-python-truth.py (lifted by text, closure-checked),
//     replayed on the web -- the wheel through the REAL ToolController, a
//     resize through the REAL Viewport, the buttons through runAction's own
//     zoom cases and the app's own ZoomFloor host, both lifted out of
//     main.js by text -- with the desktop's margin and limits, and diffed
//     after every step: zoom, pan, readout, the zoom he chose, past-Fit, the
//     raise and every sentence. From the COMMITTED tests/data/zoom-floor-truth.json,
//     so it runs on a fresh clone; and live against the desktop source when
//     it is here, which also fails a stale snapshot.
//  4. The picture windows (the Diff, a revision page on its own): main.js's
//     own showImageViewer, lifted by text onto stand-in elements, replaying
//     the desktop _RefCanvas scenarios, then its new pinch, and how far in
//     it goes (the drawing's own pixels, on a phone too).
//  5. THE TOUCH RULES (the user's decisions, web only): a pinch stops at Fit,
//     centred, and holds there with the drift ignored until the fingers
//     spread again; a fresh pinch that starts at Fit goes past; one that
//     rose above Fit within the gesture stops; a pinch from Fit follows the
//     fingers (the dead band a threshold, not a loss); and the Fit zoom
//     with the sheet dragged aside holds the zoom but not the sheet --
//     through the controller's own pointer handlers.
//  6. A change of size: Fit stays Fit at the new size (an iPad turned); any
//     other view keeps its centre; a device-pixel-ratio change is no resize.
//  7. The Settings box on a stand-in page: the desktop's words in the
//     standard layout, the touch words in the touch layout, reworded live
//     when the wheel setting changes before OK, saved by OK under its own
//     NEW key, ticked on an install that never had it -- and off, nothing
//     stops.
//  8. The app's wiring, by text and by lifting: F fits the drawing ON SCREEN
//     (a revision on other paper by its own paper), the once-a-session line,
//     and a landing on a sheet whose Newest is on other paper ends framed on
//     that drawing (main.js's own goToPage) -- not over a zoom or a drag he
//     made while it decoded, and not on the next sheet he turned to.
//
// The only differences from the desktop are the documented ones: the web's
// Fit keeps its 16 px margin, and Zoom to item fits the desktop's box inside
// the same margin (sections 5-8 run it; the differential runs the desktop's
// margin-free Fit), the readout's number is rounded as the web
// always has (the desktop truncates), a refusal by pinch is said in the touch
// words, and the picture windows draw at fractional pixels where the desktop
// rounds to whole ones (the pan is compared to within that rounding). Then
// the ones KNOWN lists, each still checked to be there: the web's F never
// leaves the zoom limits (the desktop's F does not clamp, so on a sheet whose
// Fit is past a limit a bare F differs in zoom and readout until a settle);
// on a floor the MINIMUM zoom raised the web says no "Fit" and no "fits the
// screen" -- the sheet does not fit there; with the Settings box off the
// picture windows zoom OUT without limit, as the web's always did (the
// desktop keeps half whatever the box says); and, box or no box, they zoom
// IN until a drawing pixel is 32 screen px, the sheet's own most (the
// desktop stops at ten times the whole picture, short of the drawing's own
// pixels in the Diff on a phone).
//
// Run: node tests/zoom-floor.mjs
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DATA, DESKTOP_SRC, haveDesktopSource } from './config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);

// Viewport.resize reads the device pixel ratio; Settings reads storage.
globalThis.window = globalThis.window || { devicePixelRatio: 1 };
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: k => { store.delete(k); },
};

const ZF = await import('../js/render/zoom-floor.js');
const { Viewport, MAX_ZOOM } = await import('../js/render/viewport.js');
const { ToolController } = await import('../js/tools/controller.js');
const { Project } = await import('../js/core/project.js');
const { boundingBox } = await import('../js/core/geom.js');

let fails = 0;
let checks = 0;
const log = (...a) => console.log(...a);
function eq(label, got, want) {
  checks += 1;
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) return true;
  fails += 1;
  log(`FAIL ${label}\n  got  ${a}\n  want ${b}`);
  return false;
}
function ok(label, cond, detail = '') {
  checks += 1;
  if (cond) return true;
  fails += 1;
  log(`FAIL ${label}${detail ? `\n  ${detail}` : ''}`);
  return false;
}
const close = (a, b, rel = 1e-12, abs = 0) => (a === null || b === null)
  ? a === b : Math.abs(a - b) <= Math.max(abs, rel * Math.max(1, Math.abs(b)));

const TOUCH_LINE = 'The whole sheet fits the screen — pinch out again to zoom out further';
const TOUCH_BOX = 'Stop zooming out when the whole sheet fits the screen '
  + '(pinch out again to go further; Shift+wheel with a mouse)';

// ── main.js, by text ───────────────────────────────────────────────────────
// main.js runs only in a browser. Its functions are lifted out by text and
// run inside `with (env)`, so every free name they read -- pageImage,
// versionView, the settings -- is read from the stand-in at call time.
const MAIN = (await readFile(new URL('../js/main.js', import.meta.url), 'utf-8')).replace(/\r\n/g, '\n');
function fnText(name) {
  const m = new RegExp(`\\n((?:async )?function ${name}\\()`).exec(MAIN);
  if (!m) return null;
  const i = m.index + 1;
  const j = MAIN.indexOf('\n}\n', i);
  return j < 0 ? null : MAIN.slice(i, j + 2);
}
function liftMain(names, env) {
  const parts = names.map(n => {
    const t = fnText(n);
    if (!t) throw new Error(`main.js has no function ${n}`);
    return `${n}: (${t})`;
  });
  // eslint-disable-next-line no-new-func
  Object.assign(env, new Function('env', `with (env) { return {\n${parts.join(',\n')}\n}; }`)(env));
  return env;
}
function runMain(text, env) {
  // eslint-disable-next-line no-new-func
  return new Function('env', `with (env) { ${text}\n }`)(env);
}
/** main.js from `start` to the end of the line holding `end` (both included). */
function between(start, end) {
  const i = MAIN.indexOf(start);
  if (i < 0) return null;
  const j = MAIN.indexOf(end, i);
  if (j < 0) return null;
  return MAIN.slice(i, MAIN.indexOf('\n', j) + 1);
}
// The app's ZoomFloor, as main.js builds it and hands it to the controller
// and the viewport -- the host is the app's own.
const BUILD = between('const zoomFloor = new ZoomFloor(viewport, {',
  'viewport.onResize = (w, h) => zoomFloor.resized(w, h);');
// runAction's zoom cases, word for word.
const CASES = between("    case 'zoom-in':", "    case 'toggle-thumbs':")
  ?.replace(/\n {4}case 'toggle-thumbs':[^\n]*\n$/, '\n');
// showItemMenu's own 'Zoom to item' callback, word for word.
const ITEM_FN = (() => {
  const a = MAIN.indexOf("  add('Zoom to item', () => {");
  if (a < 0) return null;
  return MAIN.slice(MAIN.indexOf('() =>', a), MAIN.indexOf('\n  });', a) + 4);
})();
const LIFTED = ['shownDrawingSize', 'zoomStopsAtFit', 'applyDefaultZoom',
  'applyDefaultZoomTo', 'sayZoomFloorOnce', 'pressedByFinger',
  // a flip between the versions of a sheet
  'showSheetVersion', 'clearVersion'];

/**
 * One sheet on screen: a real Viewport and ToolController on a stand-in
 * canvas, the app's own ZoomFloor host and zoom cases from main.js.
 * `desktop` runs the desktop's margin-free Fit and limits, for the diff.
 */
function rig({ canvas: [w, h], pages, settings: s0 = {} }, { desktop = false, touch = false } = {}) {
  const settings = { zoom_out_stops_at_fit: true, wheel_mode: 'zoom', zoom_step_percent: 15,
    default_zoom_mode: 'fit', ...s0 };
  const rect = { left: 0, top: 0, width: w, height: h };
  const on = {};
  const canvas = { addEventListener: (t, f) => { on[t] = f; }, setPointerCapture() {},
    releasePointerCapture() {}, style: {}, getBoundingClientRect: () => ({ ...rect }),
    width: 0, height: 0 };
  const vp = new Viewport(canvas);
  vp.resize();
  const st = { page: 0, said: [], saidAt: [], step: -1 };
  const c = new ToolController({ canvas, viewport: vp, project: new Project(),
    currentPage: () => st.page, host: {} });
  c.zoomStepPercent = settings.zoom_step_percent;
  c.wheelMode = settings.wheel_mode;
  const env = {
    ZoomFloor: ZF.ZoomFloor, zoomFloorLine: ZF.zoomFloorLine, boundingBox,
    viewport: vp, controller: c, zoomFloor: null, pendingFit: false, zoomFloorSaid: false,
    app: {
      settings: { get: k => settings[k] }, get currentPage() { return st.page; },
      // One revision page, of the size the step asks for, for the flip.
      pages: { get pageCount() { return pages.length; }, lruSize: 4,
        hasRevisionPage: () => true, getRevisionPage: async () => env.revBitmap },
      project: { measurements: {} },
    },
    versionView: { revId: '', revPage: null, set: -1, bitmap: null, size: null },
    versionTicket: 0, MAIN_LRU: 4, MAIN_LRU_COMPARING: 2, revBitmap: null,
    allRevisions: () => [], sheetOrigin: () => null,
    sheetVersions: () => [{ revId: 'r1', revPage: 0, rev: { _setIndex: 0 }, label: 'Rev 1', date: '' }],
    syncVersionUi() {}, goToPage: async () => {},
    revPageLabel: () => '', sizesMatch: () => true, sizeRefusal: () => '',
    get pageImage() { const p = pages[st.page]; return p ? { width: p[0], height: p[1] } : null; },
    browsingOtherVersion: () => !!env.versionView.revId,
    setStatus: t => { st.said.push(t); st.saidAt.push(st.step); },
    uiMode: () => (touch ? 'touch' : 'standard'),
    // What pressed last, and whether there is a mouse: a touch rig is a finger on an iPad.
    lastPressFinger: touch,
    window: { matchMedia: q => ({ matches: q === '(any-pointer: fine)' ? !touch : false }) },
    requestDraw() {},
  };
  liftMain(LIFTED, env);
  runMain(BUILD.replace('const zoomFloor =', 'zoomFloor ='), env);
  const zf = env.zoomFloor;
  if (desktop) { zf.margin = 0; zf.min = 0.05; zf.max = 10; }
  // eslint-disable-next-line no-new-func
  const act = new Function('env', `with (env) { return async function act(a) { switch (a) {\n${CASES}\n} }; }`)(env);
  // eslint-disable-next-line no-new-func
  const zoomToItem = new Function('env', 'item', `with (env) { return (${ITEM_FN})(); }`);
  return {
    vp, zf, c, on, rect, st, env, settings, pages, act,
    size: () => pages[st.page],
    resize(w2, h2) { rect.width = w2; rect.height = h2; vp.resize(); },
    /** Zoom to item, through showItemMenu's own callback. */
    item(points, type = 'count') { zoomToItem(env, { points, type }); },
    /** A revision of size [w, h] flipped up, or (null) the sheet's own drawing back. */
    async flip(size) {
      if (size) {
        env.revBitmap = { width: size[0], height: size[1] };
        await env.showSheetVersion(st.page, 'r1', { announce: false, flip: false });
      } else {
        await env.showSheetVersion(st.page, '', { announce: false });
      }
    },
    /** The desktop's pan: the centre of the drawing ON SCREEN, off the canvas centre. */
    pan() {
      const s = env.shownDrawingSize();
      const z = vp.zoom;
      return [(s.w / 2 - (vp.origin.x + vp.width / (2 * z))) * z,
              (s.h / 2 - (vp.origin.y + vp.height / (2 * z))) * z];
    },
    /** A wheel event as a browser sends it, from the desktop's angleDelta. */
    wheel(x, y, dy, dx = 0, shift = false, ctrl = false, swap = true) {
      let deltaY = -dy, deltaX = -dx;
      // Chromium and Firefox send Shift+wheel sideways (macOS does it for Safari).
      if (shift && swap && dx === 0) { deltaX = deltaY; deltaY = 0; }
      on.wheel({ deltaY, deltaX, deltaMode: 0, shiftKey: !!shift, ctrlKey: !!ctrl, altKey: false,
        clientX: x, clientY: y, preventDefault() {} });
    },
    finger(type, id, x, y) {
      on[type]({ pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y, type,
        preventDefault() {}, shiftKey: false, ctrlKey: false, metaKey: false });
    },
  };
}

// ═══ 1. the wheel rule ══════════════════════════════════════════════════
log('-- 1. wheelInOut --');
{
  const W = ZF.wheelInOut;
  eq('a notch towards you zooms out', W({ deltaY: 120 }), 'out');
  eq('a notch away zooms in', W({ deltaY: -120 }), 'in');
  eq('a tilt wheel right never zooms', W({ deltaY: 0, deltaX: 120 }), null);
  eq('a tilt wheel left never zooms', W({ deltaY: 0, deltaX: -120 }), null);
  eq('Alt+wheel (sideways, Alt held) never zooms', W({ deltaY: 0, deltaX: 120, altKey: true }), null);
  eq('Shift+wheel as Chromium sends it (sideways): a notch out', W({ deltaY: 0, deltaX: 120, shiftKey: true }), 'out');
  eq('...and in', W({ deltaY: 0, deltaX: -100, shiftKey: true }), 'in');
  eq('Shift+wheel sent upright is a notch too', W({ deltaY: -120, deltaX: 0, shiftKey: true }), 'in');
  eq('a trackpad pinch (Ctrl, a fraction of a line) zooms in', W({ deltaY: -3.2, ctrlKey: true }), 'in');
  eq('...and out', W({ deltaY: 0.5, ctrlKey: true }), 'out');
  eq('Shift with nothing in it: nothing', W({ deltaY: 0, deltaX: 0, shiftKey: true }), null);
  eq('a -0, a NaN, an empty event: nothing', [W({ deltaY: -0 }), W({ deltaY: NaN }), W({}), W(null)],
    [null, null, null, null]);
  // ...and through the sheet's own wheel handler, with the floor and without it.
  const r = rig({ canvas: [1600, 900], pages: [[7200, 4800]] });
  r.zf.fit();
  r.wheel(800, 450, 120);
  const z = r.vp.zoom;
  r.wheel(800, 450, 0, 120);
  r.wheel(800, 450, 0, -120);
  eq('the sheet: a sideways wheel leaves the zoom alone', r.vp.zoom, z);
  r.c.zoomGate = null;
  r.wheel(800, 450, 0, 120);
  eq('...with no zoom floor too (the old handler zoomed OUT on deltaY 0)', r.vp.zoom, z);
  r.wheel(800, 450, 120);
  ok('...while an upright notch still zooms without one', r.vp.zoom > z);
}

// ═══ 2. the words ═══════════════════════════════════════════════════════
const SNAP = JSON.parse(await readFile(new URL('zoom-floor-truth.json', DATA), 'utf-8'));
function checkWords(truth, label) {
  const w = truth.words;
  eq(`${label}: the box, the wheel zooming`, ZF.zoomFloorWords('zoom'), w.floorWords.zoom);
  eq(`${label}: the box, the wheel scrolling (3.07: Ctrl+Shift)`, ZF.zoomFloorWords('scroll'), w.floorWords.scroll);
  eq(`${label}: the box, no wheel setting yet`, ZF.zoomFloorWords(undefined), w.floorWords['']);
  eq(`${label}: the box's tooltip`, ZF.ZOOM_FLOOR_TIP, w.tip);
  for (const t of w.minusTip) {
    eq(`${label}: the minus button's tooltip (box ${t.stops ? 'on' : 'off'}, wheel ${t.wheel})`,
      ZF.zoomOutTip(t.stops, t.wheel), t.text);
  }
  for (const t of w.wheelHelp) {
    eq(`${label}: the Shortcuts wheel line (box ${t.stops ? 'on' : 'off'}, wheel ${t.wheel})`,
      ZF.wheelHelp(t.wheel, t.stops), t.text);
  }
  for (const t of w.once) {
    eq(`${label}: the once-a-session line (wheel ${t.wheel})`, [ZF.zoomFloorLine('wheel', t.wheel)], t.said);
    eq(`${label}: ...and the minus button's in the standard layout`,
      [ZF.zoomFloorLine('button', t.wheel, false)], t.said);
  }
  eq(`${label}: the box is ticked to begin with`, truth.default, true);
  eq(`${label}: FIT_EPS`, ZF.FIT_EPS, truth.FIT_EPS);
}
log('\n-- 2. the words --');
checkWords(SNAP, 'snapshot');
eq('touch: the once-a-session line for a pinch', ZF.zoomFloorLine('pinch', 'zoom'), TOUCH_LINE);
eq('touch: ...for a pinch whatever the wheel does', ZF.zoomFloorLine('pinch', 'scroll', false), TOUCH_LINE);
eq('touch: ...and for the minus button in the touch layout', ZF.zoomFloorLine('button', 'zoom', true), TOUCH_LINE);
eq('touch: the wheel says its keys even in the touch layout (a mouse on the iPad)',
  ZF.zoomFloorLine('wheel', 'zoom', true), SNAP.words.once[0].said[0]);
eq('touch: the box in the touch layout', ZF.zoomFloorWords('zoom', true), TOUCH_BOX);
eq('touch: ...naming Ctrl+Shift when the wheel scrolls (the 3.07 rule)', ZF.zoomFloorWords('scroll', true),
  TOUCH_BOX.replace('Shift+wheel', 'Ctrl+Shift+wheel'));
ok('the desktop uses an em dash, and so do the web\'s lines',
  SNAP.words.once[0].said[0].includes('—') && TOUCH_LINE.includes('—'));
{
  const { DEFAULT_SETTINGS } = await import('../js/ui/settings.js');
  eq('the web\'s default is the desktop\'s, under the desktop\'s own key',
    DEFAULT_SETTINGS.zoom_out_stops_at_fit, SNAP.default);
  eq('the Shortcuts pinch line', [ZF.pinchHelp(true), ZF.pinchHelp(false)],
    ['Zoom about the fingers; zooming out stops when the whole sheet fits, a new pinch from there goes further',
      'Zoom about the fingers']);
}

// ═══ 3. the differential ════════════════════════════════════════════════
async function replay(scn, { swap = true } = {}) {
  const r = rig(scn, { desktop: true });
  const out = [];
  for (const [i, step] of scn.steps.entries()) {
    r.st.step = i;
    const op = step[0];
    if (op === 'open') r.env.applyDefaultZoom();
    else if (op === 'wheel') r.wheel(step[1], step[2], step[3], step[4] || 0, !!step[5], !!step[6], swap);
    else if (op === 'pinch') r.zf.zoomAt(step[1], step[2], step[3], false, 'pinch');
    else if (op === 'minus') await r.act('zoom-out');
    else if (op === 'plus') await r.act('zoom-in');
    else if (op === 'F') await r.act('zoom-fit');
    else if (op === 'one') await r.act('zoom-100');
    else if (op === 'pan') r.vp.panBy(step[1], step[2]);
    else if (op === 'turn') {
      // The module's page-turn rule (the next round wires it into goToPage):
      // asked of the sheet being left, the new sheet centred at the zoom it
      // had (what the desktop's set_page does), then settled.
      const chose = r.zf.belowFitByChoice();
      r.st.page = step[1];
      const [pw, ph] = r.size();
      r.vp.centerOn(pw / 2, ph / 2);
      r.zf.turnSettle(chose);
    } else if (op === 'resize') r.resize(step[1], step[2]);
    // Zoom to item through showItemMenu's own callback, the box and all.
    else if (op === 'item') r.item(step[1], step[2] || 'count');
    // A flip, through main.js's own showSheetVersion / clearVersion.
    else if (op === 'rev') await r.flip(step[1]);
    else if (op === 'settings') {
      Object.assign(r.settings, step[1]);
      r.c.wheelMode = r.settings.wheel_mode;
    } else throw new Error(`unknown step ${JSON.stringify(step)}`);
    out.push({ page: r.st.page, zoom: r.vp.zoom, pan: r.pan(), label: r.zf.label(),
      atFloor: r.zf.atFloor(), showsFit: r.zf.showsFit(), base: r.zf.base,
      baseFit: r.zf.baseFit, pastFit: r.zf.pastFit, raised: r.zf.raise !== null,
      said: r.st.said.slice(), saidAt: r.st.saidAt.slice() });
  }
  return { trace: out,
    minusTip: ZF.zoomOutTip(r.settings.zoom_out_stops_at_fit !== false, r.settings.wheel_mode) };
}
// Where the web differs from the desktop on purpose: scenario -> the fields
// that differ (at the steps listed, or at any step) and why. Every entry must
// still be seen, or it is dropped from here.
//
// THE ZOOM LIMITS. The desktop's F sets the unclamped Fit (fit_view); its
// floor, and only its floor, is kept inside the limits (zoom_floor). The
// web's F, as its Viewport.fit always has, never sets a zoom outside them.
// After 'open' -- the desktop's F and then the settle a job's opening runs
// -- the two agree on the view; only the zoom the desktop RECORDS as his is
// F's unclamped one (never read: his zoom is Fit and Fit is asked again).
// A bare F with no settle after it differs in zoom and readout too.
const KNOWN = {
  'a sheet whose Fit is past the maximum stops at the maximum': [{
    fields: ['base'],
    why: 'the desktop records F\'s unclamped zoom (22.5 > the limit 10); the web never sets a zoom past its limit',
  }],
  'a bare F on a sheet whose Fit is past the maximum': [{
    fields: ['zoom', 'label', 'atFloor', 'showsFit', 'base'], at: [0, 1, 3],
    why: 'the desktop\'s bare F is the unclamped 22.5 ("2250%", above its floor of 10) and its minus then 18.75; '
      + 'the web\'s F stops at its limit, on the floor, "Fit 1000%", where minus is refused',
  }, {
    fields: ['baseFit'], at: [1, 2],
    why: 'the desktop\'s minus and notch out from 22.5 are zooms of his; the web\'s were refused at Fit',
  }, {
    fields: ['said'], at: [1, 2, 3],
    why: 'the web\'s refused minus says the once-a-session line; the desktop refused nothing to say it of',
  }],
  'a sheet whose Fit is below the minimum': [{
    fields: ['label', 'said'],
    why: 'the minimum zoom (5%) raised the floor above Fit (3%): the sheet does not fit there, so the web '
      + 'says no "Fit" and no "the whole sheet fits the screen"; the desktop says both',
  }, {
    fields: ['base'], at: [0, 1, 4],
    why: 'the desktop records F\'s unclamped 3%; the web\'s F stops at its limit',
  }, {
    fields: ['zoom', 'atFloor', 'showsFit'], at: [4],
    why: 'a bare F: the desktop\'s goes to 3%, below its own minimum and so below its floor; '
      + 'the web\'s stops at the minimum, on the floor',
  }],
};
const knownSeen = new Set();
const knownHit = (name, i, d) => {
  const at = (KNOWN[name] || []).findIndex(k => k.fields.some(f => d.startsWith(`${f} `))
    && (!k.at || k.at.includes(i)));
  if (at >= 0) knownSeen.add(`${name}#${at}`);
  return at >= 0;
};
async function checkScenarios(truth, label) {
  let steps = 0, bad = 0;
  for (const scn of truth.scenarios) {
    for (const swap of [true, false]) {
      const hasShift = scn.steps.some(s => s[0] === 'wheel' && s[5]);
      if (!swap && !hasShift) continue;
      const got = await replay(scn, { swap });
      const tag = `${label} "${scn.name}"${swap ? '' : ' (Shift sent upright)'}`;
      scn.trace.forEach((t, i) => {
        steps += 1;
        const g = got.trace[i];
        const diff = [];
        if (!close(g.zoom, t.zoom)) diff.push(`zoom ${g.zoom} vs ${t.zoom}`);
        if (!close(g.pan[0], t.pan[0], 1e-9, 1e-6) || !close(g.pan[1], t.pan[1], 1e-9, 1e-6)) {
          diff.push(`pan ${g.pan} vs ${t.pan}`);
        }
        // The one difference in the readout: the web rounds its number, as it
        // always has; the desktop truncates. 'Fit ' and when it shows are the desktop's.
        const wantLabel = t.label.replace(/\d+%$/, `${Math.round(t.zoom * 100)}%`);
        if (g.label !== wantLabel) diff.push(`label ${g.label} vs ${wantLabel}`);
        for (const k of ['page', 'atFloor', 'showsFit', 'baseFit', 'pastFit', 'raised']) {
          if (g[k] !== t[k]) diff.push(`${k} ${g[k]} vs ${t[k]}`);
        }
        if (!close(g.base, t.base)) diff.push(`base ${g.base} vs ${t.base}`);
        // What was said, and when: the desktop's words -- except that a pinch
        // says the touch line, as the user chose.
        const firstAt = [];
        scn.trace.forEach((tt, k) => { if (tt.said.length > (k ? scn.trace[k - 1].said.length : 0)) firstAt.push(k); });
        const wantSaid = t.said.map((s, k) => (scn.steps[firstAt[k]][0] === 'pinch' ? TOUCH_LINE : s));
        if (JSON.stringify(g.said) !== JSON.stringify(wantSaid)) {
          diff.push(`said ${JSON.stringify(g.said)} vs ${JSON.stringify(wantSaid)}`);
        }
        const real = diff.filter(d => !knownHit(scn.name, i, d));
        if (real.length) {
          bad += 1;
          if (bad <= 25) log(`FAIL ${tag} step ${i} ${JSON.stringify(scn.steps[i])}: ${real.join('; ')}`);
        }
      });
      if (!swap) continue;
      eq(`${tag}: the minus button's tooltip after it`, got.minusTip, scn.minusTip);
    }
  }
  checks += steps;
  fails += bad;
  log(`   ${truth.scenarios.length} scenarios, ${steps} steps compared, ${bad} differing`);
  for (const [name, entries] of Object.entries(KNOWN)) {
    entries.forEach((k, j) => {
      const seen = knownSeen.has(`${name}#${j}`);
      if (seen) log(`   KNOWN "${name}": ${k.fields.join(', ')}${k.at ? ` at ${k.at.join(', ')}` : ''} -- ${k.why}`);
      ok(`${label}: the known difference in "${name}" (${k.fields.join(', ')}) is still there to be known `
        + '(else drop it from KNOWN)', seen);
    });
  }
  knownSeen.clear();
}
log('\n-- 3. the differential: the committed snapshot --');
log(`   (lifted by text: ${Object.entries(SNAP.lifted).map(([k, v]) => `${k} ${v.length}`).join(', ')})`);
await checkScenarios(SNAP, 'snapshot');

// ═══ 4. the picture windows ═════════════════════════════════════════════
// Stand-in elements, enough for dialogs.js and showImageViewer.
class El {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.parentNode = null;
    this._l = [];
    this._text = '';
    this.className = '';
    this.style = { setProperty() {} };
    this.dataset = {};
    this.attrs = {};
    this.hidden = false;
    this.title = '';
    this.rect = null;
    const cls = () => this.className.split(/\s+/).filter(Boolean);
    this.classList = {
      add: c => { if (!cls().includes(c)) this.className = [...cls(), c].join(' '); },
      remove: c => { this.className = cls().filter(x => x !== c).join(' '); },
      contains: c => cls().includes(c),
    };
  }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  appendChild(c) { c.remove(); c.parentNode = this; this.children.push(c); return c; }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(x => x !== this);
    this.parentNode = null;
  }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  addEventListener(t, fn) { this._l.push({ t, fn }); }
  removeEventListener(t, fn) { this._l = this._l.filter(l => !(l.t === t && l.fn === fn)); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] ?? null; }
  descendants() { return this.children.flatMap(c => [c, ...c.descendants()]); }
  _is(sel) {
    const [tag, cl] = sel.trim().split('.');
    return (!tag || this.tagName === tag.toUpperCase()) && (!cl || this.classList.contains(cl));
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const alts = sel.split(',');
    return this.descendants().filter(e => alts.some(s => e._is(s)));
  }
  focus() {}
  select() {}
  setPointerCapture() {}
  releasePointerCapture() {}
  getBoundingClientRect() { return this.rect || { left: 0, top: 0, width: 0, height: 0 }; }
  getContext() {
    if (!this._ctx) {
      const draws = [];
      this._ctx = { draws, setTransform() {}, fillRect() {}, drawImage(...a) { draws.push(a); } };
    }
    return this._ctx;
  }
  fire(type, extra = {}) {
    const ev = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; },
      stopPropagation() {}, ...extra };
    for (const l of [...this._l]) if (l.t === type) l.fn.call(this, ev);
    return ev;
  }
}
function stubDocument() {
  const doc = new El('#document', null);
  doc.createElement = tag => new El(tag, doc);
  doc.documentElement = new El('html', doc);
  doc.body = doc.appendChild(doc.createElement('body'));
  doc.getElementById = id => doc.descendants().find(e => e.id === id) || null;
  const modal = doc.body.appendChild(doc.createElement('div'));
  modal.id = 'modal';
  return doc;
}

/** main.js's own picture window, on a stand-in page, sized `box`, showing `pic`. */
function pictureWindow(box, pic, settings) {
  const doc = stubDocument();
  const observers = [];
  const env = {
    document: doc,
    window: { devicePixelRatio: 1 },
    D: { showDialog: build => build(() => {}), el: (tag, cls, text) => {
      const n = doc.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    } },
    requestAnimationFrame() { return 0; },
    setTimeout() { return 0; },
    ResizeObserver: class { constructor(cb) { observers.push(cb); } observe() {} },
    zoomStopsAtFit: () => settings.zoom_out_stops_at_fit !== false,
    pictureZoom: ZF.pictureZoom, pictureRect: ZF.pictureRect, PinchHold: ZF.PinchHold,
    fitPlace: ZF.fitPlace, pinchPlace: ZF.pinchPlace, wheelInOut: ZF.wheelInOut, PICTURE_STEP: ZF.PICTURE_STEP,
  };
  liftMain(['showImageViewer'], env);
  const node = env.showImageViewer({ width: pic[0], height: pic[1] }, 'Diff');
  const wrap = node.descendants().find(e => e.classList.contains('imgview-body'));
  const cv = node.descendants().find(e => e.tagName === 'CANVAS');
  wrap.rect = { left: 0, top: 0, width: box[0], height: box[1] };
  for (const cb of observers) cb();
  const fit = ZF.pictureFit({ w: box[0], h: box[1] }, { w: pic[0], h: pic[1] });
  const view = () => {
    const d = cv.getContext().draws.at(-1);
    if (!d) return null;
    const [, x, y, w, h] = d;
    return { vz: (w / pic[0]) / fit, px: x - (box[0] - w) / 2, py: y - (box[1] - h) / 2 };
  };
  return {
    wrap, view, settings,
    wheel(x, y, dy, dx = 0, shift = false, swap = true) {
      let deltaY = -dy, deltaX = -dx;
      if (shift && swap && dx === 0) { deltaX = deltaY; deltaY = 0; }
      return wrap.fire('wheel', { deltaY, deltaX, deltaMode: 0, shiftKey: !!shift, clientX: x, clientY: y });
    },
    drag(dx, dy) {
      wrap.fire('pointerdown', { pointerId: 9, pointerType: 'mouse', clientX: 300, clientY: 300 });
      wrap.fire('pointermove', { pointerId: 9, pointerType: 'mouse', clientX: 300 + dx, clientY: 300 + dy });
      wrap.fire('pointerup', { pointerId: 9, pointerType: 'mouse', clientX: 300 + dx, clientY: 300 + dy });
    },
    finger(type, id, x, y) { wrap.fire(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y }); },
  };
}
// The picture windows' declared differences: with the Settings box off they
// zoom out as the web's always did, without limit, where the desktop's keep
// their half whatever the box says; and they zoom in until a drawing pixel is
// 32 screen px, where the desktop's stop at ten times the whole picture
// (_RefCanvas.wheelEvent).
const PICTURE_KNOWN = {
  'a picture window: sideways never zooms, the box off goes to half': {
    fields: ['vz', 'pan'], from: 3,
    why: 'the box off: the web zooms out past half the picture, as before Round 3; the desktop stops at half',
  },
  'a picture window zoomed in to its limit': {
    fields: ['vz', 'pan'], from: 16, to: 35,
    why: 'the web zooms in until a drawing pixel is 32 screen px (the sheet\'s own most), here 120 times the '
      + 'whole picture, box ticked or not; the desktop stops at ten times it -- the Diff on a phone could not '
      + 'reach the drawing\'s own pixels there. Back out, both stop on the whole picture',
  },
};
function checkPictures(truth, label) {
  let steps = 0, bad = 0;
  const seen = new Set();
  for (const scn of truth.pictures) {
    const settings = { zoom_out_stops_at_fit: true, ...(scn.settings || {}) };
    const pw = pictureWindow(scn.box, scn.picture, settings);
    eq(`${label} "${scn.name}": it opens on the whole picture, centred`, pw.view(), { vz: 1, px: 0, py: 0 });
    let since = 0;
    scn.steps.forEach((step, i) => {
      steps += 1;
      if (step[0] === 'wheel') { pw.wheel(step[1], step[2], step[3], step[4] || 0, !!step[5]); since += 1; }
      else if (step[0] === 'pan') pw.drag(step[1], step[2]);
      else if (step[0] === 'settings') Object.assign(settings, step[1]);
      const g = pw.view(), t = scn.trace[i];
      const centred = t.pan[0] === 0 && t.pan[1] === 0;
      if (centred) since = 0;
      // The desktop draws at whole pixels (int() and //2 of each size) and
      // the web at fractional ones: within a pixel and a half for every
      // step since the picture was last centred, and exactly centred when
      // the desktop is.
      const tol = centred ? 0 : 1.5 * (since + 1);
      const diff = [];
      if (!close(g.vz, t.vz, 1e-9)) diff.push(`vz ${g.vz} vs ${t.vz}`);
      if (Math.abs(g.px - t.pan[0]) > tol || Math.abs(g.py - t.pan[1]) > tol) {
        diff.push(`pan ${[g.px, g.py].map(v => v.toFixed(2))} vs ${t.pan} (within ${tol})`);
      }
      const k = PICTURE_KNOWN[scn.name];
      const real = diff.filter(d => !(k && i >= k.from && !(i > k.to) && k.fields.some(f => d.startsWith(`${f} `))));
      if (real.length < diff.length) seen.add(scn.name);
      if (real.length) {
        bad += 1;
        if (bad <= 15) log(`FAIL ${label} "${scn.name}" step ${i} ${JSON.stringify(step)}: ${real.join('; ')}`);
      }
    });
  }
  checks += steps;
  fails += bad;
  log(`   ${truth.pictures.length} picture scenarios, ${steps} steps compared, ${bad} differing`);
  for (const [name, k] of Object.entries(PICTURE_KNOWN)) {
    if (seen.has(name)) log(`   KNOWN "${name}": ${k.fields.join(', ')} from step ${k.from}${k.to ? ` to ${k.to}` : ''} -- ${k.why}`);
    ok(`${label}: the known picture difference in "${name}" is still there to be known`, seen.has(name));
  }
}
log('\n-- 4. the picture windows: main.js\'s showImageViewer against the desktop\'s _RefCanvas --');
checkPictures(SNAP, 'snapshot');
{
  // ...its pinch (web only): the same rule as the sheet's, about the midpoint.
  const settings = { zoom_out_stops_at_fit: true };
  const pw = pictureWindow([800, 600], [3000, 2000], settings);
  pw.wheel(400, 300, 120);
  pw.wheel(400, 300, 120);
  const zIn = pw.view().vz;
  pw.finger('pointerdown', 1, 250, 300);
  pw.finger('pointerdown', 2, 550, 300);
  for (let d = 280; d >= 60; d -= 20) {
    pw.finger('pointermove', 1, 400 - d / 2, 300);
    pw.finger('pointermove', 2, 400 + d / 2, 300);
  }
  eq('a picture window\'s pinch from zoomed in stops at the whole picture, centred', pw.view(), { vz: 1, px: 0, py: 0 });
  let held = true;
  for (let k = 1; k <= 6; k += 1) {            // both fingers slide fast, one event at a time
    pw.finger('pointermove', 1, 370 + 20 * k, 300 + 15 * k);
    held = held && JSON.stringify(pw.view()) === JSON.stringify({ vz: 1, px: 0, py: 0 });
    pw.finger('pointermove', 2, 430 + 20 * k, 300 + 15 * k);
    held = held && JSON.stringify(pw.view()) === JSON.stringify({ vz: 1, px: 0, py: 0 });
  }
  ok('...and holds it there, centred, while the fingers drift', held, JSON.stringify(pw.view()));
  pw.finger('pointermove', 1, 400, 390);
  pw.finger('pointermove', 2, 600, 390);
  ok('...until they spread again', pw.view().vz > 1);
  pw.finger('pointerup', 1, 400, 390);
  const after = pw.view();
  pw.finger('pointermove', 2, 650, 450);
  eq('the finger left after a pinch does not drag', pw.view(), after);
  pw.finger('pointerup', 2, 650, 450);
  // a fresh pinch from the whole picture goes on to half
  for (let i = 0; i < 20; i += 1) pw.wheel(400, 300, -120);
  eq('(back on the whole picture)', pw.view(), { vz: 1, px: 0, py: 0 });
  pw.finger('pointerdown', 3, 100, 300);
  pw.finger('pointerdown', 4, 700, 300);
  for (let d = 580; d >= 100; d -= 40) {
    pw.finger('pointermove', 3, 400 - d / 2, 300);
    pw.finger('pointermove', 4, 400 + d / 2, 300);
  }
  eq('a fresh pinch from the whole picture goes on down -- to half of it, no further',
    pw.view().vz, ZF.PICTURE_MIN);
  pw.finger('pointerup', 3, 0, 0);
  pw.finger('pointerup', 4, 0, 0);
  ok('(it had zoomed in before the pinch)', zIn > 1.3);
  // A pinch that has fully ended hands the picture back to a drag (a pinch
  // never put down took every later press and move for itself).
  let v0 = pw.view();
  pw.finger('pointerdown', 5, 300, 300);
  pw.finger('pointermove', 5, 340, 270);
  pw.finger('pointerup', 5, 340, 270);
  const moved = () => [pw.view().px - v0.px, pw.view().py - v0.py].map(v => Math.round(v * 1e6) / 1e6);
  eq('after a pinch, both fingers lifted: one finger drags the picture again', moved(), [40, -30]);
  v0 = pw.view();
  pw.drag(-25, 15);
  eq('...and so does the mouse', moved(), [-25, 15]);
}
{
  // Two fingers laid on the whole picture, trembling, are not a pinch: the
  // picture stays exactly where it is, and the wheel still knows it is Fit.
  const pw = pictureWindow([800, 600], [3000, 2000], { zoom_out_stops_at_fit: true });
  pw.wheel(400, 300, 120);
  pw.wheel(400, 300, -120);
  eq('(on the whole picture)', pw.view(), { vz: 1, px: 0, py: 0 });
  pw.finger('pointerdown', 1, 300, 300);
  pw.finger('pointerdown', 2, 500, 300);
  for (const [a, b] of [[301, 499], [302, 498], [303, 497], [301, 498], [299, 501], [302, 497]]) {
    pw.finger('pointermove', 1, a, 300);
    pw.finger('pointermove', 2, b, 300);
  }
  pw.finger('pointerup', 1, 302, 300);
  pw.finger('pointerup', 2, 497, 300);
  eq('two fingers resting on the whole picture, a 1-3 px tremble: vz exactly 1, centred',
    pw.view(), { vz: 1, px: 0, py: 0 });
  pw.wheel(400, 300, 120);
  ok('...and a plain notch in from there is a notch from Fit', close(pw.view().vz, ZF.PICTURE_STEP, 1e-12));
  pw.wheel(400, 300, -120);
  pw.wheel(400, 300, -120);
  eq('...out again stops on it, and refuses', pw.view(), { vz: 1, px: 0, py: 0 });
  // A pinch in from there that means it still goes past.
  pw.finger('pointerdown', 3, 200, 300);
  pw.finger('pointerdown', 4, 600, 300);
  for (let d = 390; d >= 200; d -= 10) {
    pw.finger('pointermove', 3, 400 - d / 2, 300);
    pw.finger('pointermove', 4, 400 + d / 2, 300);
  }
  ok('...while a pinch in from it that means it goes past', pw.view().vz < 0.6, JSON.stringify(pw.view()));
  pw.finger('pointerup', 3, 0, 0);
  pw.finger('pointerup', 4, 0, 0);
}
{
  // A third finger -- a palm -- and one of the pinch's own lifting.
  const pw = pictureWindow([800, 600], [3000, 2000], { zoom_out_stops_at_fit: true });
  for (let i = 0; i < 4; i += 1) pw.wheel(400, 300, 120);
  pw.finger('pointerdown', 1, 300, 300);
  pw.finger('pointerdown', 2, 500, 300);
  pw.finger('pointermove', 1, 290, 300);
  pw.finger('pointermove', 2, 510, 300);
  const v1 = pw.view();
  pw.finger('pointerdown', 3, 700, 560);         // a palm lands
  pw.finger('pointermove', 3, 640, 520);
  pw.finger('pointermove', 3, 600, 500);
  eq('a palm that lands during a pinch moves nothing', pw.view(), v1);
  pw.finger('pointerup', 1, 290, 300);           // one of the pinch's own lifts
  pw.finger('pointermove', 2, 511, 301);
  pw.finger('pointermove', 3, 560, 480);
  eq('...and when one of the pinch\'s own fingers lifts, the pinch is over: no jump to finger-and-palm',
    pw.view(), v1);
  pw.finger('pointerup', 2, 511, 301);
  pw.finger('pointerup', 3, 560, 480);
  pw.finger('pointerdown', 4, 300, 300);
  pw.finger('pointermove', 4, 320, 300);
  pw.finger('pointerup', 4, 320, 300);
  eq('...and once they are all up, a finger drags again', Math.round((pw.view().px - v1.px) * 1e6) / 1e6, 20);
  // the wheel there: sideways nothing, Shift as a browser sends it
  const p2 = pictureWindow([800, 600], [3000, 2000], { zoom_out_stops_at_fit: true });
  p2.wheel(400, 300, 120);
  p2.wheel(400, 300, 120);
  const zoomedIn = p2.view();
  p2.wheel(500, 200, 0, 120);
  p2.wheel(500, 200, 0, -120);
  eq('a sideways wheel never zooms a picture window, in or out', p2.view(), zoomedIn);
  const ev = p2.wheel(400, 300, 0, -120);
  ok('...and the page does not scroll under it', ev.defaultPrevented);
  for (let i = 0; i < 4; i += 1) p2.wheel(400, 300, -120);
  p2.wheel(400, 300, -120);
  eq('a plain notch out at the whole picture: nothing', p2.view(), { vz: 1, px: 0, py: 0 });
  p2.wheel(400, 300, -120, 0, true);
  ok('Shift+wheel (sent sideways) goes on past it', close(p2.view().vz, 1 / ZF.PICTURE_STEP));
  // the pure rule's own edges
  const box = { w: 800, h: 600 }, pic = { w: 3000, h: 2000 };
  eq('pictureZoom: a step that changes less than the dead band is no step',
    ZF.pictureZoom({ vz: 2, px: 5, py: 5 }, 1.0004, 10, 10, box, pic).v, { vz: 2, px: 5, py: 5 });
  ok('...but a pinch\'s small step is kept', ZF.pictureZoom({ vz: 2, px: 5, py: 5 }, 1.0004, 10, 10, box, pic,
    { dead: 0 }).v.vz > 2);
  // Zooming IN stops where a drawing pixel is as big as the sheet itself lets
  // one be (viewport.js MAX_ZOOM: 32 screen px), or at the desktop's ten times
  // the whole picture when that is further -- whatever the zoom-OUT box says.
  const cap = ZF.pictureMaxZoom(box, pic);
  eq('...a step in past the limit stops at the limit', ZF.pictureZoom({ vz: cap / 1.1, px: 0, py: 0 }, 1.15, 0, 0, box, pic).v.vz,
    cap);
  eq('...the same limit with the box off: it is not the zoom-OUT box\'s',
    ZF.pictureZoom({ vz: cap / 1.1, px: 0, py: 0 }, 1.15, 0, 0, box, pic, { stops: false }).v.vz, cap);
  ok('...there a drawing pixel is 32 screen px, the sheet\'s own most (viewport.js MAX_ZOOM)',
    close(cap * ZF.pictureFit(box, pic), 32, 1e-12) && ZF.PICTURE_PIXEL_MAX === MAX_ZOOM, String(cap));
  eq('...or ten times the whole picture, the desktop\'s, when that is further (a small picture)',
    ZF.pictureMaxZoom({ w: 800, h: 600 }, { w: 40, h: 30 }), ZF.PICTURE_MAX);
  eq('...a picture above the limit (its window grew since): a step in leaves it, never zooms it out',
    ZF.pictureZoom({ vz: cap * 2, px: 7, py: 7 }, 1.15, 0, 0, box, pic).v, { vz: cap * 2, px: 7, py: 7 });
  ok('...while a step out from there is a step out', close(ZF.pictureZoom({ vz: cap * 2, px: 0, py: 0 }, 1 / 1.15, 400, 300,
    box, pic).v.vz, cap * 2 / 1.15, 1e-12));
  // The box off: nothing stops a zoom out, in a picture window either -- as it never did on the web.
  const off = { zoom_out_stops_at_fit: false };
  const p3 = pictureWindow([900, 600], [5400, 3600], off);
  for (let i = 0; i < 12; i += 1) p3.wheel(450, 300, -120);
  ok('box off: twelve plain notches out go on past half the picture, as before (1.15^-12)',
    close(p3.view().vz, ZF.PICTURE_STEP ** -12, 1e-9), String(p3.view().vz));
  for (let i = 0; i < 40; i += 1) p3.wheel(450, 300, 120);
  ok('...and in past ten times it', close(p3.view().vz, ZF.PICTURE_STEP ** 28, 1e-9), String(p3.view().vz));
  off.zoom_out_stops_at_fit = true;
  p3.wheel(450, 300, 120);
  ok('ticked again: a notch in is still a notch in -- the box stops zooming OUT', close(p3.view().vz, ZF.PICTURE_STEP ** 29, 1e-9),
    String(p3.view().vz));
  // R3b-4: the Diff on a phone or an iPad reaches the drawing's own pixels
  // with the box ticked (it stopped at ten times the whole picture: 0.48 and
  // 0.78 screen px per drawing px), and goes exactly as far with it off.
  for (const [b, p, where] of [[[343, 480], [7200, 4800], 'a phone, a 36x24 sheet at 200 dpi'],
    [[900, 560], [10800, 7200], 'an iPad, a 36x24 sheet at 300 dpi']]) {
    const per = {};
    for (const stops of [true, false]) {
      const w = pictureWindow(b, p, { zoom_out_stops_at_fit: stops });
      for (let i = 0; i < 60; i += 1) w.wheel(b[0] / 2, b[1] / 2, 120);
      per[stops] = w.view().vz * ZF.pictureFit({ w: b[0], h: b[1] }, { w: p[0], h: p[1] });
    }
    ok(`the Diff on ${where}: zooming in with the box ticked reaches 32 screen px per drawing px`,
      close(per.true, 32, 1e-9), String(per.true));
    ok('...and exactly as far with it off', close(per.false, per.true, 1e-12), `${per.false} vs ${per.true}`);
  }
}
{
  // R3b-1: a picture dragged aside at its Fit is not where Fit puts it, so a
  // two-finger slide moves it, the zoom held in the dead band; centred there,
  // the slide is the drift a pinch held at Fit ignores (decision 3).
  const pw = pictureWindow([800, 600], [3000, 2000], { zoom_out_stops_at_fit: true });
  pw.drag(200, 0);
  eq('(a picture dragged 200 px aside at its Fit)', pw.view(), { vz: 1, px: 200, py: 0 });
  pw.finger('pointerdown', 1, 300, 300);
  pw.finger('pointerdown', 2, 500, 300);
  for (let k = 1; k <= 25; k += 1) {             // both slide 250 px left, one event a finger
    pw.finger('pointermove', 1, 300 - 10 * k, 300);
    pw.finger('pointermove', 2, 500 - 10 * k, 300);
  }
  eq('a picture dragged aside at its Fit: a two-finger slide of 250 px moves it 250 px, the zoom held at Fit',
    pw.view(), { vz: 1, px: -50, py: 0 });
  pw.finger('pointerup', 1, 50, 300);
  pw.finger('pointerup', 2, 250, 300);
  pw.wheel(400, 300, -120);
  eq('(a notch out there centres it)', pw.view(), { vz: 1, px: 0, py: 0 });
  pw.finger('pointerdown', 3, 300, 300);
  pw.finger('pointerdown', 4, 500, 300);
  for (let k = 1; k <= 25; k += 1) {
    pw.finger('pointermove', 3, 300 - 10 * k, 300);
    pw.finger('pointermove', 4, 500 - 10 * k, 300);
  }
  pw.finger('pointerup', 3, 50, 300);
  pw.finger('pointerup', 4, 250, 300);
  eq('...centred at its Fit, the same slide leaves it there (held at Fit, the drift ignored)', pw.view(), { vz: 1, px: 0, py: 0 });
  // R3b-2: a pinch from the whole picture follows the fingers.
  for (const [from, to, step] of [[200, 400, 4], [200, 380, 30], [300, 180, 4]]) {
    const w = pictureWindow([800, 600], [3000, 2000], { zoom_out_stops_at_fit: true });
    w.finger('pointerdown', 1, 400 - from / 2, 300);
    w.finger('pointerdown', 2, 400 + from / 2, 300);
    const B = { w: 800, h: 600 }, P = { w: 3000, h: 2000 };
    const at0 = ZF.pictureRect(w.view(), B, P);
    const u = (400 - from / 2 - at0.x) / at0.scale;        // the picture under the left finger
    const dir = Math.sign(to - from);
    for (let d = from + dir * step; dir > 0 ? d <= to : d >= to; d += dir * step) {
      w.finger('pointermove', 1, 400 - d / 2, 300);
      w.finger('pointermove', 2, 400 + d / 2, 300);
    }
    ok(`a pinch from the whole picture, ${from} -> ${to} px apart in ${step} px moves: the picture x ${to}/${from}`,
      close(w.view().vz, to / from, 1e-9), String(w.view().vz));
    const at1 = ZF.pictureRect(w.view(), B, P);
    ok('...and what was under the left finger as they landed is under it still',
      close(at1.x + u * at1.scale, 400 - to / 2, 1e-9, 1e-6), `${at1.x + u * at1.scale} vs ${400 - to / 2}`);
  }
}

// ═══ 5. the touch rules ═════════════════════════════════════════════════
log('\n-- 5. the touch rules: a pinch through the controller\'s own pointer handlers --');
const IPAD = [1024, 704], SHEET = [7200, 4800];
function pinchRig(opts = {}) {
  const r = rig({ canvas: IPAD, pages: [SHEET], settings: opts.settings || {} }, { touch: true });
  r.zf.fit();
  return r;
}
/**
 * Two fingers, tracked, each move its own event, as a browser reports them:
 * between the two the pair is half moved.
 */
function hand(r, ids = [1, 2]) {
  const at = new Map();
  const h = {
    down(cx, cy, d) {
      at.set(ids[0], [cx - d / 2, cy]);
      at.set(ids[1], [cx + d / 2, cy]);
      for (const id of ids) r.finger('pointerdown', id, ...at.get(id));
      return h;
    },
    centre() {
      const [a, b] = ids.map(i => at.get(i));
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    },
    move(id, x, y) { at.set(id, [x, y]); r.finger('pointermove', id, x, y); },
    /** To `d` apart about where they are: one finger, then the other. */
    to(d) {
      const [cx, cy] = h.centre();
      h.move(ids[0], cx - d / 2, cy);
      h.move(ids[1], cx + d / 2, cy);
      return h;
    },
    /** Both slide by (dx, dy) in `n` steps, one finger then the other; `each` after every event. */
    slide(dx, dy, n, each) {
      for (let k = 0; k < n; k += 1) {
        for (const id of ids) {
          const [x, y] = at.get(id);
          h.move(id, x + dx / n, y + dy / n);
          each?.();
        }
      }
      return h;
    },
    up() { for (const id of ids) r.finger('pointerup', id, ...at.get(id)); },
  };
  return h;
}
const centred = r => { const [px, py] = r.pan(); return Math.abs(px) <= 0.5 && Math.abs(py) <= 0.5; };
{
  const r = pinchRig();
  const floor = r.zf.floor();
  ok('the web\'s floor IS the web\'s F (its 16 px margin)', r.vp.zoom === floor
    && floor === Math.min((IPAD[0] - 32) / SHEET[0], (IPAD[1] - 32) / SHEET[1]));
  ok('...and the readout says so', /^Fit \d+%$/.test(r.zf.label()), r.zf.label());
  r.wheel(300, 250, 120);
  r.wheel(300, 250, 120);
  ok('(two notches in)', r.vp.zoom > floor * 1.3);
  const h = hand(r).down(600, 380, 320);
  for (let d = 300; d >= 80; d -= 20) h.to(d);
  eq('a pinch in from a zoomed view stops exactly at Fit', r.vp.zoom, floor);
  ok('...with the sheet centred', centred(r), JSON.stringify(r.pan()));
  eq('...and says why, once, in the touch words', r.st.said, [TOUCH_LINE]);
  for (let d = 70; d >= 40; d -= 10) h.to(d);
  eq('pinching on at Fit: still Fit, the line not said again', [r.vp.zoom, r.st.said.length], [floor, 1]);
  let held = true;
  const still = () => { held = held && centred(r) && r.vp.zoom === floor; };
  h.slide(-150, -120, 6, still);                 // 25 px a finger, a fast slide
  h.slide(90, 60, 30, still);                    // and a slow one
  ok('held at Fit, the two-finger drift is ignored: the sheet stays centred, every event', held,
    JSON.stringify([r.pan(), r.vp.zoom / floor]));
  h.to(40 + ZF.PINCH_SPREAD_PX - 2);
  ok('a tremble outward is not a spread', r.vp.zoom === floor && centred(r));
  h.to(40);
  for (let d = 60; d <= 160; d += 20) h.to(d);
  ok('the fingers spread again: it zooms in', r.vp.zoom > floor * 1.5, String(r.vp.zoom / floor));
  for (let d = 150; d >= 40; d -= 10) h.to(d);
  ok('in-then-out in the same gesture still stops at Fit, centred', r.vp.zoom === floor && centred(r),
    String(r.vp.zoom / floor));
  eq('...a zoom he set: Fit', [r.zf.baseFit, r.zf.belowFitByChoice()], [true, false]);
  h.up();

  // A NEW pinch that starts at Fit may go past it.
  const f = hand(r).down(500, 350, 300);
  for (let d = 280; d >= 140; d -= 20) f.to(d);
  ok('a fresh pinch that starts at Fit goes past it', r.vp.zoom < floor * 0.7, String(r.vp.zoom / floor));
  ok('...below Fit by choice, as Shift is', r.zf.belowFitByChoice());
  ok('...and the readout is the number alone', /^\d+%$/.test(r.zf.label()), r.zf.label());
  eq('...nothing said for a zoom that was not refused', r.st.said.length, 1);
  const zSlide = r.vp.zoom;
  f.slide(120, 80, 4);
  ok('...and a slide of the same two fingers then only moves it', close(r.vp.zoom, zSlide, 1e-9));
  f.up();
  r.wheel(500, 350, -120);
  ok('a plain notch out below Fit does nothing', r.vp.zoom < floor * 0.7 && r.zf.belowFitByChoice());

  // A pinch that starts below Fit, rises above it, then pinches in: it stops.
  const z0 = r.vp.zoom;
  const b = hand(r).down(500, 350, 120);
  for (let d = 140; d <= 420; d += 20) b.to(d);
  ok('(a pinch from below Fit spread up past it)', r.vp.zoom > floor * 1.2, String(r.vp.zoom / floor));
  for (let d = 400; d >= 60; d -= 20) b.to(d);
  ok('...rose above Fit, so pinching in stops at Fit', r.vp.zoom === floor && centred(r), String(r.vp.zoom / floor));
  b.up();
  ok('(it had started below)', z0 < floor);

  // A tremble as the fingers land does not cost the right.
  const t = hand(r).down(500, 350, 300);
  t.to(304);
  t.to(301);
  for (let d = 290; d >= 150; d -= 20) t.to(d);
  ok('a fresh pinch from Fit that trembles outward first still goes past', r.vp.zoom < floor * 0.7);
  t.up();

  // Minus and the Fit buttons never go past.
  await r.act('zoom-fit');
  ok('F lands on Fit', r.zf.showsFit());
  await r.act('zoom-out');
  await r.act('zoom-out');
  eq('minus at Fit does nothing', r.vp.zoom, floor);
  r.wheel(500, 350, -120, 0, true);
  ok('Shift+wheel with a mouse on the iPad goes past', r.vp.zoom < floor && r.zf.belowFitByChoice());
  await r.act('zoom-out');
  ok('...and minus below Fit does nothing either', r.vp.zoom < floor);
  r.wheel(500, 350, 120);
  r.wheel(500, 350, 120);
  r.wheel(500, 350, 120);
  for (let i = 0; i < 6; i += 1) await r.act('zoom-out');
  eq('minus from zoomed in lands exactly on Fit, centred, and stops', [r.vp.zoom === floor, centred(r)], [true, true]);
}
{
  // The box off: nothing stops, a pinch or anything else (3.05).
  const r = pinchRig({ settings: { zoom_out_stops_at_fit: false } });
  const fit = r.vp.zoom;
  const h = hand(r).down(500, 350, 300);
  for (let d = 280; d >= 100; d -= 20) h.to(d);
  ok('box off: a pinch goes on down past Fit', r.vp.zoom < fit * 0.5);
  h.up();
  await r.act('zoom-out');
  ok('box off: so does minus', r.vp.zoom < fit * 0.45);
  r.wheel(500, 350, -120);
  ok('box off: and a plain notch', r.vp.zoom < fit * 0.4);
  eq('box off: nothing said, no Fit in the readout', [r.st.said.length, /^Fit/.test(r.zf.label())], [0, false]);
  r.settings.zoom_out_stops_at_fit = true;
  await r.act('zoom-fit');
  r.wheel(500, 350, -120);
  eq('ticked again: it stops at once (read live, as the desktop reads it)', r.vp.zoom, r.zf.floor());
}
{
  // Without a zoom floor the controller's pinch is what it was.
  const r = pinchRig();
  r.c.zoomGate = null;
  const z = r.vp.zoom;
  const h = hand(r).down(500, 350, 200);
  h.to(100);
  ok('no zoom floor: a pinch zooms as it always did', close(r.vp.zoom, z * 0.5, 1e-9));
  h.up();
}
{
  // Two fingers laid on the sheet at Fit, trembling, are not a pinch: a pinch
  // that lands at Fit starts held there, with the right to go past.
  const r = pinchRig();
  const floor = r.zf.floor();
  const h = hand(r).down(512, 352, 200);
  for (const d of [199, 198, 197, 198, 197, 199, 201, 203, 200, 198]) h.to(d);
  h.up();
  ok('two fingers resting at Fit, trembling 1-3 px: still exactly Fit, centred',
    r.vp.zoom === floor && r.zf.showsFit(), JSON.stringify([r.vp.zoom / floor, r.pan()]));
  eq('...not past Fit by choice, the readout still says Fit, his zoom still Fit, nothing said',
    [r.zf.belowFitByChoice(), /^Fit \d+%$/.test(r.zf.label()), r.zf.baseFit, r.st.said.length], [false, true, true, 0]);
  await r.act('zoom-out');
  eq('...so minus is refused as at Fit, with the line', [r.vp.zoom === floor, r.st.said.length], [true, 1]);
  r.resize(704, 1024);
  ok('...and turning the iPad still lands on the new Fit', r.zf.showsFit() && r.vp.zoom === r.zf.floor());
  r.resize(1024, 704);
  // ...while a pinch in from there that means it goes past (the dead band, then the zoom).
  const p = hand(r).down(512, 352, 300);
  for (let d = 296; d >= 150; d -= 2) p.to(d);
  ok('...a pinch in from Fit that means it still goes past', r.vp.zoom < floor * 0.6 && r.zf.belowFitByChoice(),
    String(r.vp.zoom / floor));
  p.up();
}
{
  // R3b-1: at the Fit zoom with the sheet dragged aside, the sheet is NOT
  // where Fit puts it, so there is nothing to keep it at: a two-finger slide
  // in a drawing tool -- where two fingers are the only way to pan -- moves
  // it, while the zoom still holds in the dead band.
  const r = pinchRig();
  const floor = r.zf.floor();
  r.finger('pointerdown', 7, 500, 350);
  for (let i = 1; i <= 10; i += 1) r.finger('pointermove', 7, 500 + 30 * i, 350);
  r.finger('pointerup', 7, 800, 350);
  ok('(one finger in Pan dragged the sheet 300 px aside at the Fit zoom; the readout still says Fit)',
    r.vp.zoom === floor && close(r.pan()[0], 300, 1e-9, 1e-6) && !r.zf.showsFit() && /^Fit /.test(r.zf.label()),
    JSON.stringify([r.vp.zoom / floor, r.pan(), r.zf.label()]));
  await r.c.setMode('area', { ask: false });
  const h = hand(r).down(600, 352, 240);
  h.slide(-300, 0, 30);
  ok('in a drawing tool, a two-finger slide of 300 px brings it back by 300 px, the zoom still Fit',
    r.vp.zoom === floor && close(r.pan()[0], 0, 1e-9, 1e-6) && close(r.pan()[1], 0, 1e-9, 1e-6),
    JSON.stringify([r.vp.zoom / floor, r.pan()]));
  h.slide(0, 120, 12);
  ok('...and on, as far as the fingers go: it is a pan', close(r.pan()[1], 120, 1e-9, 1e-6), JSON.stringify(r.pan()));
  for (let d = 236; d >= 120; d -= 4) h.to(d);
  ok('...while a pinch in from there still goes past Fit (it started at Fit), following the fingers',
    close(r.vp.zoom / floor, 120 / 240, 1e-9) && r.zf.belowFitByChoice(), String(r.vp.zoom / floor));
  h.up();
  // Centred at Fit, the same slide is the drift a pinch held at Fit ignores
  // (decision 3): the sheet stays where Fit puts it.
  const c = pinchRig();
  await c.c.setMode('area', { ask: false });
  const g = hand(c).down(512, 352, 240);
  g.slide(200, 90, 20);
  ok('centred at Fit, a two-finger slide leaves the sheet where Fit puts it', c.zf.showsFit(), JSON.stringify(c.pan()));
  g.up();
  // The box off: nothing holds, the slide pans as it always did.
  const o = pinchRig({ settings: { zoom_out_stops_at_fit: false } });
  await o.c.setMode('area', { ask: false });
  const q = hand(o).down(512, 352, 240);
  q.slide(200, 0, 20);
  ok('box off: a two-finger slide at Fit pans', close(o.pan()[0], 200, 1e-9, 1e-6), JSON.stringify(o.pan()));
  q.up();
}
{
  // R3b-2: a pinch from Fit -- where every sheet opens -- follows the
  // fingers. The dead band is a threshold, not a loss: once the fingers
  // mean it the zoom catches up to them, so a spread from 200 to 400 px is
  // Fit x 2 (it was 1.90, and what was under the fingers slid away).
  for (const [from, to, step] of [[200, 400, 4], [200, 395, 15], [200, 380, 30], [300, 150, 4], [300, 150, 15]]) {
    const r = pinchRig();
    const floor = r.zf.floor();
    const h = hand(r).down(512, 352, from);
    const dir = Math.sign(to - from);
    let last = from;
    for (let d = from + dir * step; dir > 0 ? d <= to : d >= to; d += dir * step) { h.to(d); last = d; }
    ok(`a pinch from Fit, ${from} -> ${last} px apart in ${step} px moves: Fit x ${last}/${from}`,
      close(r.vp.zoom / floor, last / from, 1e-9), String(r.vp.zoom / floor));
    h.up();
  }
  // ...and what was under a finger as they landed ends under it -- whichever
  // finger's move lets go (it was 11 px off at 4 px moves, 27 px at 30).
  for (const [step, end] of [[4, 400], [30, 380], [30, 410], [15, 395]]) {
    const r = pinchRig();
    const h = hand(r).down(512, 352, 200);
    const under = r.vp.toPage(412, 352);
    for (let d = 200 + step; d <= end; d += step) h.to(d);
    const [lx, ly] = r.vp.toScreen(under[0], under[1]);
    const want = 512 - (200 + Math.floor((end - 200) / step) * step) / 2;
    ok(`...the point under the left finger as they landed is under it at the end (${step} px moves, to ${end})`,
      close(lx, want, 1e-9, 1e-6) && close(ly, 352, 1e-9, 1e-6), `${lx},${ly} vs ${want},352`);
    h.up();
  }
  // A slide made while held at Fit stays ignored when the fingers then spread:
  // the sheet moves no more than the move that lets go.
  const r = pinchRig();
  const h = hand(r).down(512, 352, 200);
  h.slide(160, 0, 16);
  ok('(held: the slide moved nothing)', r.zf.showsFit());
  const mid = h.centre();
  const under = r.vp.toPage(mid[0], mid[1]);
  for (let d = 204; d <= 300; d += 4) h.to(d);
  const [ux] = r.vp.toScreen(under[0], under[1]);
  ok('...then a spread: what is between the fingers stays there, the slide not replayed',
    Math.abs(ux - mid[0]) <= 1 * 1.5 + 1e-6, `${ux} vs ${mid[0]}`);
  h.up();
}
{
  // Fingers close together: a small zoom in from below Fit is a rise above
  // it, though they spread less than PINCH_SPREAD_PX past where it was Fit.
  const r = pinchRig();
  const floor = r.zf.floor();
  r.wheel(512, 352, -120, 0, true);
  ok('(below Fit by Shift)', r.vp.zoom < floor && r.zf.belowFitByChoice());
  const h = hand(r).down(512, 352, 60);
  for (let d = 61; d <= 72; d += 1) h.to(d);
  ok('(fingers 60 px apart, spread 12: 4% above Fit)', r.vp.zoom > floor * 1.03 && r.vp.zoom < floor * 1.06,
    String(r.vp.zoom / floor));
  for (let d = 70; d >= 30; d -= 2) h.to(d);
  ok('fingers close together: in-then-out still stops at Fit, centred', r.vp.zoom === floor && centred(r),
    String(r.vp.zoom / floor));
  h.up();
}
{
  // A two-finger slide above Fit carries the sheet (the iPad's main way of
  // moving it): the page point between the fingers stays between them.
  const r = pinchRig();
  r.wheel(512, 352, 120);
  r.wheel(512, 352, 120);
  const z = r.vp.zoom;
  const h = hand(r).down(500, 350, 200);
  const p0 = r.vp.toPage(500, 350);
  const o0 = { ...r.vp.origin };
  h.slide(120, 80, 4);
  const p1 = r.vp.toPage(620, 430);
  ok('a two-finger slide above Fit: the point under the fingers moves with them',
    close(p1[0], p0[0], 1e-12, 1e-6) && close(p1[1], p0[1], 1e-12, 1e-6), `${p0} -> ${p1}`);
  ok('...by the slide, 120 x 80 screen px, at the same zoom', close(r.vp.zoom, z, 1e-9)
    && close((o0.x - r.vp.origin.x) * z, 120, 1e-9, 1e-6) && close((o0.y - r.vp.origin.y) * z, 80, 1e-9, 1e-6),
  JSON.stringify([(o0.x - r.vp.origin.x) * z, (o0.y - r.vp.origin.y) * z]));
  h.up();
}
{
  // A third finger (a palm) during a pinch, then one of the pinch's own lifts.
  const r = pinchRig();
  for (let i = 0; i < 3; i += 1) r.wheel(512, 352, 120);
  r.finger('pointerdown', 1, 400, 350);
  r.finger('pointerdown', 2, 600, 350);
  r.finger('pointermove', 1, 390, 350);
  r.finger('pointermove', 2, 610, 350);
  const at = () => [r.vp.zoom, r.vp.origin.x, r.vp.origin.y];
  const v1 = at();
  ok('(the pinch zoomed)', v1[0] > r.zf.floor() * 1.5);
  r.finger('pointerdown', 3, 900, 650);
  r.finger('pointermove', 3, 850, 600);
  r.finger('pointermove', 3, 800, 560);
  eq('a palm that lands during a pinch on the sheet moves nothing', at(), v1);
  r.finger('pointerup', 1, 390, 350);
  r.finger('pointermove', 2, 611, 351);
  r.finger('pointermove', 3, 760, 520);
  eq('...and when one of the pinch\'s own fingers lifts it is over: no jump to finger-and-palm', at(), v1);
  r.finger('pointerup', 2, 611, 351);
  r.finger('pointerup', 3, 760, 520);
}
{
  // The pure rule's own edges.
  const h = new ZF.PinchHold(200, 'above');
  eq('PinchHold: the factor is from the last move, not the start', [h.step(180).factor, h.step(160).factor],
    [0.9, 160 / 180]);
  h.after(0.8, 1);
  eq('...held at the wider of its last two distances', h.holdDist, 180);
  eq('...held: closer (both of the last two) is refused', [h.step(150), h.step(150)],
    [{ refused: true }, { refused: true }]);
  eq('...a slide, half moved then moved, is drift: neither refused nor let go',
    [h.step(130), h.step(150), h.step(130), h.step(150)], [{ ignore: true }, { ignore: true },
      { ignore: true }, { ignore: true }]);
  eq('...a spread of less than PINCH_SPREAD_PX is drift', h.step(150 + ZF.PINCH_SPREAD_PX), { ignore: true });
  eq('...one wider than it, but only one of the two moves: still drift',
    h.step(150 + ZF.PINCH_SPREAD_PX + 5), { ignore: true });
  eq('...both of the last two wider: it lets go, by the whole way from where it held (a threshold, not a loss)',
    h.step(150 + ZF.PINCH_SPREAD_PX + 6), { factor: (150 + ZF.PINCH_SPREAD_PX + 6) / 150, past: false });
  // Landed at the Fit zoom with the sheet aside: the band holds the zoom, not the sheet.
  const a = new ZF.PinchHold(200, 'aside');
  eq('PinchHold landed at the Fit zoom with the sheet aside: the dead band holds the zoom, the drift still pans',
    [a.step(210), a.step(200), a.step(191)], Array(3).fill({ ignore: true, pan: true }));
  eq('...and it may go past Fit, by the whole way from the landing', a.step(190), { factor: 190 / 200, past: true });
  eq('...where it stands against Fit: the zoom on the floor, the sheet aside',
    [ZF.pinchPlace('at', false), ZF.pinchPlace('at', true), ZF.pinchPlace('below', false), ZF.pinchPlace(null, false)],
    ['aside', 'at', 'below', null]);
  // Landed AT Fit: held at once, with the right to go past.
  const n = new ZF.PinchHold(200, 'at');
  eq('PinchHold landed at Fit: the tremble of fingers at rest, either way, is nothing',
    [n.step(197), n.step(203), n.step(193), n.step(207), n.step(199)], Array(5).fill({ ignore: true }));
  eq('...one of the two moves PINCH_SPREAD_PX closer: still nothing', n.step(191), { ignore: true });
  eq('...both of them: it goes past, by the whole way from where they landed (the band a threshold, not a loss)',
    n.step(190), { factor: 190 / 200, past: true });
  let ratio = 190 / 200;
  n.after(190 / 200, ratio);
  ratio *= 300 / 190;
  eq('...out again: may still go past', n.step(300).past, true);
  n.after(300 / 190, ratio);
  eq('...above Fit by one wide move (a slide, half moved): still may', n.step(250).past, true);
  ratio *= 250 / 300;
  n.after(250 / 300, ratio);
  eq('...by two: it has risen, and may not', n.step(250).past, false);
  const w = new ZF.PinchHold(200, 'at');
  eq('PinchHold landed at Fit: both PINCH_SPREAD_PX wider lets go, zooming in by the whole way from the landing',
    [w.step(205), w.step(209), w.step(210)], [{ ignore: true }, { ignore: true }, { factor: 210 / 200, past: true }]);
  w.after(210 / 200, 210 / 200);
  eq('...and that spread is a rise above Fit', w.step(208).past, false);
  // Fingers close together: risen by the zoom, before they spread PINCH_SPREAD_PX.
  const c = new ZF.PinchHold(60, 'below');
  ratio = 0.97;
  const past = [];
  for (const d of [61, 62, 63, 64, 65]) {
    const s = c.step(d);
    past.push(s.past);
    ratio *= s.factor;
    c.after(s.factor, ratio);
  }
  eq('PinchHold from below Fit, fingers 60 px apart: right kept until the zoom is PINCH_RISE above Fit',
    [...past, c.step(66).past], [true, true, true, true, true, false]);
  // ...but read at the closer of the last two distances: a slide half moved is no rise.
  const s2 = new ZF.PinchHold(285, 'below');
  ratio = 0.98;
  for (const d of [310, 285, 312, 285]) { const s = s2.step(d); ratio *= s.factor; s2.after(s.factor, ratio); }
  eq('...a slide along the fingers, half moved 25 px wider and back: still may go past', s2.step(250).past, true);
  eq('fitPlace: at, below, above, no floor', [ZF.fitPlace(1, 1), ZF.fitPlace(1 + 1e-7, 1), ZF.fitPlace(0.99, 1),
    ZF.fitPlace(1.01, 1), ZF.fitPlace(1, null)], ['at', 'at', 'below', 'above', null]);
}
{
  // Zoom to item through showItemMenu's own callback: the desktop's box
  // (zoom_to_measurement), the web's margin, never below Fit.
  const r = pinchRig();
  const floor = r.zf.floor();
  const mid = () => r.vp.toPage(IPAD[0] / 2, IPAD[1] / 2);
  r.wheel(300, 300, 120);
  r.item([[-400, -400], [SHEET[0] + 400, SHEET[1] + 400]]);
  ok('Zoom to item on a count spread across the sheet lands on Fit, centred', r.vp.zoom === floor && centred(r));
  eq('...recorded as a number, not as Fit (the desktop\'s zoom_to_measurement)', r.zf.baseFit, false);
  const box = Math.min((IPAD[0] - 32) / (SHEET[0] * 0.12), (IPAD[1] - 32) / (SHEET[1] * 0.12));
  r.item([[3000, 2000]]);
  ok('a single count: the desktop\'s box, 12% of the sheet, centred on it (it did nothing)',
    close(r.vp.zoom, box, 1e-12) && close(mid()[0], 3000, 1e-12, 1e-6) && close(mid()[1], 2000, 1e-12, 1e-6),
    JSON.stringify([r.vp.zoom, box, mid()]));
  r.zf.fit();
  r.item([[3000, 2000], [3004, 2003]]);
  ok('a 4 x 3 px shape: the same 12% box (it went to 3200%)', close(r.vp.zoom, box, 1e-12), String(r.vp.zoom));
  r.item([[500, 2400], [6500, 2400]]);
  ok('a straight run across the sheet, as Shift draws it: Fit, centred (it did nothing)',
    r.vp.zoom === floor && centred(r));
  r.item([[3600, 300], [3600, 4500]], 'linear');
  ok('...and a straight run down it', r.vp.zoom === floor && centred(r));
  r.item([[1000, 1000], [5000, 3000]], 'textnote');
  ok('a note: framed by its box, its second point', close(r.vp.zoom, box, 1e-12)
    && close(mid()[0], 5000, 1e-12, 1e-6) && close(mid()[1], 3000, 1e-12, 1e-6));
  const z = r.vp.zoom;
  r.item([]);
  r.item([[NaN, 5]]);
  eq('no points (or none that are numbers): nothing happens', r.vp.zoom, z);
  const small = rig({ canvas: IPAD, pages: [[500, 300]] }, { touch: true });
  small.zf.fit();
  small.item([[250, 150]]);
  eq('on a small sheet the zoom is capped at 8x, as on the desktop', small.vp.zoom, ZF.ITEM_MAX_ZOOM);
}

// ═══ 6. a change of size ════════════════════════════════════════════════
log('\n-- 6. a change of size: Fit stays Fit, anything else keeps its centre --');
{
  const r = pinchRig();
  r.resize(768, 960);
  ok('an iPad turned at Fit: the new Fit, centred', r.zf.showsFit() && r.vp.zoom === r.zf.floor());
  ok('...the floor of the NEW size', r.vp.zoom === Math.min((768 - 32) / SHEET[0], (960 - 32) / SHEET[1]));
  ok('...and the readout says Fit', /^Fit/.test(r.zf.label()));
  r.resize(1024, 704);
  ok('turned back: Fit again', r.zf.showsFit());
  eq('...still his Fit, not a number', r.zf.baseFit, true);
  r.wheel(300, 200, 120);
  r.wheel(300, 200, 120);
  r.vp.panBy(-120, 60);
  const z = r.vp.zoom;
  const mid = r.vp.toPage(r.vp.width / 2, r.vp.height / 2);
  r.resize(768, 960);
  const mid2 = r.vp.toPage(r.vp.width / 2, r.vp.height / 2);
  ok('a view not at Fit keeps its zoom and its centre through a turn',
    r.vp.zoom === z && close(mid2[0], mid[0], 1e-12, 1e-9) && close(mid2[1], mid[1], 1e-12, 1e-9),
    `${mid} -> ${mid2}`);
  r.resize(1300, 704);
  const mid3 = r.vp.toPage(r.vp.width / 2, r.vp.height / 2);
  ok('...and through a panel closing', close(mid3[0], mid[0], 1e-12, 1e-9) && close(mid3[1], mid[1], 1e-12, 1e-9));
  // a device pixel ratio change is not a resize
  await r.act('zoom-fit');
  r.vp.panBy(40, 0);
  const o = { ...r.vp.origin };
  const hook = r.vp.onResize;
  let heard = 0;
  r.vp.onResize = (...a) => { heard += 1; hook(...a); };
  globalThis.window.devicePixelRatio = 2;
  ok('(the backing store follows the ratio)', r.vp.resize() === true && r.c.canvas.width === 2600);
  globalThis.window.devicePixelRatio = 1;
  r.vp.resize();
  eq('a device pixel ratio change alone moves nothing, and is no resize', [r.vp.origin, heard], [o, 0]);
  r.vp.onResize = hook;
  // dragged aside at Fit is not Fit
  r.resize(1100, 704);
  ok('at the Fit zoom with the sheet dragged aside: left as it was, centre kept',
    !r.zf.showsFit() && close(r.pan()[0], 40, 1e-9, 1e-6));
  // hidden for a moment, then back at another size
  await r.act('zoom-fit');
  r.resize(0, 0);
  ok('(hidden: no size)', !r.vp.measured);
  r.resize(800, 600);
  ok('back from hidden at another size: Fit for the size it came back to', r.zf.showsFit());
  // below Fit by choice: never jumped up
  r.wheel(400, 300, -120, 0, true);
  const below = r.vp.zoom;
  r.resize(1024, 704);
  ok('below Fit by Shift, a bigger canvas leaves it below', r.vp.zoom === below && r.vp.zoom < r.zf.floor());
}
{
  const r = pinchRig({ settings: { zoom_out_stops_at_fit: false } });
  const z = r.vp.zoom;
  r.resize(768, 960);
  ok('box off: a turn at Fit keeps the zoom, centred, as on the desktop', r.vp.zoom === z && centred(r));
}
{
  // The first size a canvas gets is not a resize: the job is framed after it.
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 900, height: 600 }), width: 0, height: 0 };
  const vp = new Viewport(canvas);
  let heard = 0;
  vp.onResize = () => { heard += 1; };
  vp.origin = { x: 10, y: 20 };
  vp.resize();
  eq('the first measure moves nothing and is no resize', [vp.origin, heard], [{ x: 10, y: 20 }, 0]);
  vp.onResize = () => { throw new Error('a hook that fails'); };
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 700, height: 600 });
  const was = console.error;
  console.error = () => {};
  let threw = false;
  try { vp.resize(); } catch { threw = true; }
  console.error = was;
  ok('a hook that throws never fails the frame', !threw && vp.width === 700);
}

// ═══ 7. the Settings box ════════════════════════════════════════════════
log('\n-- 7. the Settings box, on a stand-in page --');
{
  const { Settings } = await import('../js/ui/settings.js');
  const tick = () => new Promise(r => setTimeout(r, 0));
  const open = async (values) => {
    const doc = stubDocument();
    globalThis.document = doc;
    const s = new Settings();
    Object.assign(s.values, values);
    const answer = s.open(() => {});
    await tick();
    const all = doc.descendants();
    const words = all.find(e => e.tagName === 'SPAN' && e.textContent.startsWith('Stop zooming out'));
    const box = words && words.parentNode.children.find(e => e.tagName === 'INPUT');
    const wheel = all.find(e => e.tagName === 'SELECT' && e.children.some(o => o.value === 'scroll'));
    const button = t => all.find(e => e.tagName === 'BUTTON' && e.textContent === t);
    return { s, doc, answer, words, box, wheel, button };
  };
  store.clear();
  let d = await open({ ui_mode: 'standard' });
  ok('the box is there', !!(d.words && d.box), 'no box in the Settings form');
  eq('standard layout: the desktop\'s words, exactly', d.words?.textContent, SNAP.words.floorWords.zoom);
  eq('...its tooltip, the desktop\'s', d.words?.parentNode.title, SNAP.words.tip);
  eq('...ticked to begin with', d.box?.checked, true);
  d.wheel.value = 'scroll';
  d.wheel.fire('change');
  eq('the wheel set to scroll: the words change before OK (3.07)', d.words?.textContent, SNAP.words.floorWords.scroll);
  d.wheel.value = 'zoom';
  d.wheel.fire('change');
  eq('...and back', d.words?.textContent, SNAP.words.floorWords.zoom);
  d.wheel.value = 'scroll';
  d.wheel.fire('change');
  d.box.checked = false;
  d.button('OK').fire('click');
  eq('OK saves it, unticked', await d.answer, true);
  eq('...under its own key', d.s.get('zoom_out_stops_at_fit'), false);
  eq('...and it is stored', JSON.parse(store.get('ptt.settings.v1')).zoom_out_stops_at_fit, false);
  d = await open({ ui_mode: null });
  eq('opened again in the touch layout: unticked, in its words for the wheel he chose',
    [d.box?.checked, d.words?.textContent], [false, TOUCH_BOX.replace('Shift+wheel', 'Ctrl+Shift+wheel')]);
  d.box.checked = true;
  d.button('Cancel').fire('click');
  await d.answer;
  eq('Cancel keeps what was saved', d.s.get('zoom_out_stops_at_fit'), false);
  store.set('ptt.settings.v1', JSON.stringify({ ui_mode: 'standard', wheel_mode: 'zoom', zoom_step_percent: 20 }));
  d = await open({});
  eq('an install whose settings never had the key: ticked (a NEW key reaches it)',
    [d.s.get('zoom_out_stops_at_fit'), d.box?.checked], [true, true]);
  eq('touch layout, the wheel zooming: the user\'s words', (await open({ ui_mode: null })).words?.textContent, TOUCH_BOX);
  // ...and the box off means nothing stops: the app reads it through zoomStopsAtFit.
  const env = { app: { settings: d.s } };
  liftMain(['zoomStopsAtFit'], env);
  eq('the app reads the box live', env.zoomStopsAtFit(), true);
  d.s.values.zoom_out_stops_at_fit = false;
  eq('...off', env.zoomStopsAtFit(), false);
  delete globalThis.document;
}

// ═══ 8. the app's wiring ════════════════════════════════════════════════
log('\n-- 8. the app\'s wiring --');
{
  ok('main.js builds the zoom floor and hands it to the controller and the viewport', !!BUILD
    && /controller\.zoomGate = zoomFloor;/.test(BUILD));
  ok('...measuring the drawing on screen, the box, this sheet, the once-line, the web\'s 16 px',
    /size: \(\) => shownDrawingSize\(\)/.test(BUILD) && /enabled: \(\) => zoomStopsAtFit\(\)/.test(BUILD)
    && /refused: via => sayZoomFloorOnce\(via\)/.test(BUILD) && /margin: 16,/.test(BUILD));
  const draw = fnText('drawFrame') || '';
  ok('the readout is the zoom floor\'s ("Fit 21%")', /\$\('zoomLabel'\)\.textContent = zoomFloor\.label\(\);/.test(draw));
  ok('runAction: + and - are the zoom floor\'s, F is the one Fit',
    /case 'zoom-in': zoomFloor\.zoomIn\(\);/.test(CASES || '') && /case 'zoom-out': zoomFloor\.zoomOut\(\);/.test(CASES || '')
    && /pendingFit = !applyDefaultZoomTo\('fit'\);/.test(CASES || ''));
  ok('Zoom to item is the zoom floor\'s port of zoom_to_measurement, and nothing else',
    /zoomFloor\.zoomToItem\(item\.points \|\| \[\], item\.type\)/.test(ITEM_FN || '')
    && !/viewport\.fit\(|zoomToRect|bb\.w \* 1\.8/.test(ITEM_FN || ''));
  ok('a flip between versions keeps the pan: showSheetVersion and clearVersion ask keepPan of the drawing they replace',
    /const was = shownDrawingSize\(\);[\s\S]*versionView\.bitmap = bmp;[\s\S]*zoomFloor\.keepPan\(was\);/
      .test(fnText('showSheetVersion') || '')
    && /const was = shownDrawingSize\(\);[\s\S]*versionView\.bitmap = null;[\s\S]*zoomFloor\.keepPan\(was\);/
      .test(fnText('clearVersion') || ''));
  ok('what pressed last is heard in the capture phase, a pencil counting as a finger',
    /document\.addEventListener\('pointerdown', ev => \{\n\s*lastPressFinger = ev\.pointerType === 'touch' \|\| ev\.pointerType === 'pen';\n\}, true\);/
      .test(MAIN));
  ok('the minus button\'s tooltip follows the settings',
    /zoomOutTip\(zoomStopsAtFit\(\), app\.settings\.get\('wheel_mode'\)\)/.test(fnText('onSettingsChanged') || ''));
  const sc = fnText('showShortcuts') || '';
  ok('the Shortcuts window says the wheel from the settings, and the pinch',
    /wheelHelp\(app\.settings\.get\('wheel_mode'\), stops\)/.test(sc) && /\['Pinch', pinchHelp\(stops\)\]/.test(sc)
    && !/\['Wheel', 'Zoom about the cursor'\]/.test(sc));
  ok('the zoom-floor import is a line of its own after the import list',
    /\n\} from '\.\/core\/revisions\.js';\nimport \{ ZoomFloor[^\n]*\} from '\.\/render\/zoom-floor\.js';\n\nconst \$ = /.test(MAIN));
  const ctl = (await readFile(new URL('../js/tools/controller.js', import.meta.url), 'utf-8')).replace(/\r\n/g, '\n');
  ok('the sheet\'s wheel: no up or down, no zoom; Shift goes past',
    /const dir = wheelInOut\(ev\);\n\s*if \(!dir\) return;/.test(ctl)
    && /this\.zoomGate\.zoomAt\(sx, sy, factor, !!ev\.shiftKey, 'wheel'\)/.test(ctl));
  const cpv = (await readFile(new URL('../js/ui/callout-preview.js', import.meta.url), 'utf-8')).replace(/\r\n/g, '\n');
  ok('the callout preview\'s wheel: the same rule',
    /const dir = wheelInOut\(ev\);\n\s*if \(!dir\) return;/.test(cpv) && !/ev\.deltaY < 0 \? step/.test(cpv));
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf-8');
  ok('the worker precaches the new module', sw.includes("'js/render/zoom-floor.js',"));

  // F fits the drawing ON SCREEN: a revision on other paper by its own paper.
  const r = rig({ canvas: [1600, 900], pages: [[7200, 4800]] });
  r.env.versionView = { revId: 'r2', bitmap: { width: 3400, height: 2200 } };
  await r.act('zoom-fit');
  eq('F with a revision on smaller paper up: ITS Fit (it fitted the sheet\'s own drawing)',
    r.vp.zoom, Math.min((1600 - 32) / 3400, (900 - 32) / 2200));
  ok('...centred on it, and the readout says Fit', close(r.vp.toPage(800, 450)[0], 1700, 1e-12, 1e-9)
    && /^Fit/.test(r.zf.label()));
  r.wheel(800, 450, -120);
  eq('...so the next notch out is refused, not a hair short of it', r.vp.zoom, Math.min((1600 - 32) / 3400, (900 - 32) / 2200));
  r.env.versionView = { revId: '', bitmap: null };
  await r.act('zoom-fit');
  eq('back on the sheet\'s own drawing: its Fit', r.vp.zoom, Math.min((1600 - 32) / 7200, (900 - 32) / 4800));
  await r.act('zoom-100');
  eq('1 (actual size): 100%, a zoom he set', [r.vp.zoom, r.zf.base, r.zf.baseFit], [1, 1, false]);
  // the once-a-session line, from the app's own sayZoomFloorOnce
  r.wheel(800, 450, -120, 0, true);
  for (let i = 0; i < 12; i += 1) r.wheel(800, 450, -120);
  await r.act('zoom-fit');
  for (let i = 0; i < 5; i += 1) r.wheel(800, 450, -120);
  for (let i = 0; i < 5; i += 1) await r.act('zoom-out');
  eq('thirty refused notches and presses: one line, once a session', r.st.said.length, 1);
  // an opening resets a zoom past Fit taken on the last sheet
  r.wheel(800, 450, -120, 0, true);
  ok('(past Fit by Shift)', r.zf.belowFitByChoice());
  r.env.applyDefaultZoom();
  ok('a sheet that opens at the default zoom: past-Fit is over', !r.zf.belowFitByChoice() && r.zf.showsFit());
}
{
  // The once-a-session line names the way the INPUT goes past Fit, not the
  // layout: every browser is in the touch layout until it picks one.
  const { DEFAULT_SETTINGS, resolveUiMode } = await import('../js/ui/settings.js');
  const said = [];
  const session = ({ finger = false, fine = true, wheel = 'zoom' } = {}) => {
    const env = {
      zoomFloorSaid: false, zoomFloorLine: ZF.zoomFloorLine, lastPressFinger: finger,
      window: { matchMedia: q => ({ matches: q === '(any-pointer: fine)' ? fine : false }) },
      uiMode: () => resolveUiMode(DEFAULT_SETTINGS),
      app: { settings: { get: k => (k === 'wheel_mode' ? wheel : undefined) } },
      setStatus: t => said.push(t),
    };
    liftMain(['sayZoomFloorOnce', 'pressedByFinger'], env);
    return env;
  };
  const SHIFT = SNAP.words.once[0].said[0];
  eq('(a browser that never chose a layout is in the touch one)', resolveUiMode(DEFAULT_SETTINGS), 'touch');
  const once = (opts, via) => { said.length = 0; session(opts).sayZoomFloorOnce(via); return said[0]; };
  eq('minus clicked with a mouse, in the touch layout of a fresh install: the desktop\'s Shift line',
    once({}, 'button'), SHIFT);
  eq('...pressed by a finger: the pinch line', once({ finger: true }, 'button'), TOUCH_LINE);
  eq('...on a device with no mouse or trackpad at all: the pinch line', once({ fine: false }, 'button'), TOUCH_LINE);
  eq('the wheel says its keys whatever pressed last (a mouse on the iPad)', once({ finger: true, fine: false }, 'wheel'),
    SHIFT);
  eq('...Ctrl+Shift when the wheel scrolls', once({ wheel: 'scroll' }, 'button'), SNAP.words.once[1].said[0]);
  eq('a pinch says the pinch line, mouse or not', once({}, 'pinch'), TOUCH_LINE);
  const broken = session();
  broken.window = { matchMedia() { throw new Error('no media queries here'); } };
  said.length = 0;
  broken.sayZoomFloorOnce('button');
  eq('a browser without media queries: the Shift line', said, [SHIFT]);
}
{
  // A floor the MINIMUM zoom raised is not Fit: a 36x24 sheet at 600 dpi on
  // a phone has its Fit under 2%, and the sheet hangs off both sides there.
  const r = rig({ canvas: [375, 560], pages: [[21600, 14400]] }, { touch: true });
  await r.act('zoom-fit');
  const drawn = r.vp.zoom * 21600;
  ok('(F stops at the minimum zoom, where the sheet is wider than the canvas)', r.vp.zoom === 0.02 && drawn > 375,
    String(drawn));
  eq('...so the readout says no "Fit" of it', r.zf.label(), '2%');
  r.wheel(187, 280, -120);
  r.wheel(187, 280, -120, 0, true);
  eq('...and a refused notch out says nothing: "the whole sheet fits" would be untrue', [r.vp.zoom, r.st.said], [0.02, []]);
  // ...while on a canvas it fits, it is Fit.
  r.resize(900, 600);
  await r.act('zoom-fit');
  ok('a canvas it fits: "Fit" again', /^Fit /.test(r.zf.label()), r.zf.label());
  r.wheel(450, 300, -120);
  eq('...and the line', r.st.said.length, 1);
}
{
  // A flip to a revision on other paper keeps the zoom and the pan, through
  // main.js's own showSheetVersion / clearVersion, in the web's own Fit.
  const r = rig({ canvas: IPAD, pages: [SHEET] }, { touch: true });
  r.zf.fit();
  const sheetFit = r.vp.zoom;
  await r.flip([3400, 2200]);
  eq('a flip at Fit to smaller paper: the revision comes up centred, at the same zoom (it sat in the corner)',
    [r.vp.zoom, r.pan().map(v => Math.abs(v) < 1e-6)], [sheetFit, [true, true]]);
  await r.act('zoom-fit');
  const revFit = r.vp.zoom;
  await r.flip(null);
  eq('F there, then back to the sheet\'s own drawing: centred at that zoom', [r.vp.zoom, r.pan().map(v => Math.abs(v) < 1e-6)],
    [revFit, [true, true]]);
  r.vp.panBy(90, -40);
  await r.flip([10800, 7200]);
  ok('dragged aside, flipped to bigger paper: its centre the same 90 x -40 off the canvas centre',
    close(r.pan()[0], 90, 1e-9, 1e-6) && close(r.pan()[1], -40, 1e-9, 1e-6), JSON.stringify(r.pan()));
  await r.flip(null);
  ok('...and back', close(r.pan()[0], 90, 1e-9, 1e-6) && close(r.pan()[1], -40, 1e-9, 1e-6), JSON.stringify(r.pan()));
}
{
  // ...at 100% too, on a sheet so small that 100% is below its Fit: the
  // opening is not a choice past Fit (the desktop's _apply_default_zoom).
  const r = rig({ canvas: [1600, 900], pages: [[500, 300]], settings: { default_zoom_mode: '100' } });
  r.zf.fit();
  r.wheel(800, 450, -120, 0, true);
  ok('(past Fit by Shift on a small sheet)', r.zf.belowFitByChoice());
  r.env.applyDefaultZoom();
  eq('a sheet that opens at 100%, below its Fit: not past Fit by choice', [r.vp.zoom, r.zf.belowFitByChoice()], [1, false]);
}
{
  // The minus button's tooltip, from main.js's own onSettingsChanged.
  const settings = { zoom_out_stops_at_fit: true, wheel_mode: 'zoom', page_nav_keys: 'pageupdown' };
  const buttons = [{ title: 'Zoom out' }, { title: 'Zoom out' }];
  const env = {
    controller: {}, app: { settings: { get: k => settings[k] } }, uiMode: () => 'touch',
    document: { querySelectorAll: sel => (sel === '[data-act="zoom-out"]' ? buttons : []) },
    $: () => ({ hidden: true }), renderStartLists() {}, requestDraw() {}, zoomOutTip: ZF.zoomOutTip,
  };
  liftMain(['zoomStopsAtFit', 'onSettingsChanged'], env);
  const tips = [];
  for (const [stops, wheel] of [[true, 'zoom'], [true, 'scroll'], [false, 'zoom']]) {
    settings.zoom_out_stops_at_fit = stops;
    settings.wheel_mode = wheel;
    env.onSettingsChanged();
    tips.push(buttons.map(b => b.title));
  }
  eq('the minus button says what it does, from the settings, every time they change', tips,
    [0, 1, 2].map(i => [SNAP.words.minusTip[i].text, SNAP.words.minusTip[i].text]));
}

{
  // R3b-3: landing on a sheet whose Newest is a reissue on other paper,
  // through main.js's own goToPage, showSheetVersion and applyDefaultZoom.
  // The default zoom framed the sheet's OWN drawing while it was all there
  // was; the landing ends framed on the drawing that goes up -- as the
  // desktop's held turn settles on the revision's Fit -- unless he zoomed or
  // moved the sheet while it was being decoded.
  const tick = () => new Promise(res => setTimeout(res, 0));
  const landing = (revSize, { mode = 'fit', hold = false } = {}) => {
    const r = rig({ canvas: IPAD, pages: [SHEET, SHEET], settings: { default_zoom_mode: mode } }, { touch: true });
    const env = r.env;
    let img = null;
    Object.defineProperty(env, 'pageImage', { get: () => img, set: v => { img = v; }, configurable: true });
    Object.defineProperty(env.app, 'currentPage', { get: () => r.st.page, set: v => { r.st.page = v; },
      configurable: true });
    Object.assign(env, { pageTicket: 0, clearOverlay() {}, thumbs: { setCurrent() {} }, syncPageOf() {},
      syncScaleSelect() {}, itemsPanel: { refresh() {} }, newestOf: i => (i === 1 ? 'r1' : '') });
    env.app.project.metadata = {};
    env.app.pages.getPage = async i => ({ width: r.pages[i][0], height: r.pages[i][1] });
    env.app.pages.prefetchAround = () => {};
    env.revBitmap = { width: revSize[0], height: revSize[1] };
    r.release = null;
    if (hold) {
      // The revision's decode waits until the test lets it finish.
      env.app.pages.getRevisionPage = () => new Promise(res => { r.release = () => res(env.revBitmap); });
    }
    liftMain(['goToPage'], env);
    return r;
  };
  const revFit = (r, s) => Math.min((r.vp.width - 32) / s[0], (r.vp.height - 32) / s[1]);
  for (const [paper, size] of [['smaller', [3400, 2200]], ['bigger', [10800, 7200]], ['the same', SHEET]]) {
    const r = landing(size);
    await r.env.goToPage(0);
    await r.env.goToPage(1);
    eq(`a sheet whose Newest is a reissue on ${paper} paper comes up at the reissue's Fit, centred, "Fit N%"`,
      [r.env.versionView.revId, r.vp.zoom === revFit(r, size), r.zf.showsFit(), /^Fit \d+%$/.test(r.zf.label())],
      ['r1', true, true, true]);
    eq('...his zoom: Fit', r.zf.baseFit, true);
    r.resize(704, 1024);
    ok('...so turning the iPad lands on its new Fit', r.zf.showsFit() && r.vp.zoom === revFit(r, size),
      String(r.vp.zoom / revFit(r, size)));
    r.wheel(352, 512, 120);
    ok('...and a notch in from there is a notch from Fit', close(r.vp.zoom / revFit(r, size), 1.15, 1e-12));
  }
  {
    const r = landing([3400, 2200], { mode: '100' });
    await r.env.goToPage(1);
    eq('the default zoom at 100%: the reissue at 100%, centred', [r.vp.zoom, r.pan().map(v => Math.abs(v) < 1e-6)],
      [1, [true, true]]);
  }
  {
    const r = landing([3400, 2200], { mode: 'width' });
    await r.env.goToPage(1);
    const z = (IPAD[0] - 32) / 3400;
    ok('the default zoom at Fit Width: the reissue\'s width, its top at the margin', close(r.vp.zoom, z, 1e-12)
      && close(r.vp.origin.x, -16 / z, 1e-12, 1e-9) && close(r.vp.origin.y, -16 / z, 1e-12, 1e-9),
    JSON.stringify([r.vp.zoom / z, r.vp.origin]));
  }
  {
    // He zooms while the reissue is decoded: his zoom is not overridden.
    const r = landing([3400, 2200], { hold: true });
    await r.env.goToPage(0);
    const turned = r.env.goToPage(1);
    while (!r.release) await tick();
    r.wheel(400, 300, 120);
    const z = r.vp.zoom;
    r.release();
    await turned;
    eq('a notch in while the reissue decodes: his zoom stays (it is not re-fitted)', [r.env.versionView.revId, r.vp.zoom],
      ['r1', z]);
  }
  {
    const r = landing([3400, 2200], { hold: true });
    const turned = r.env.goToPage(1);
    while (!r.release) await tick();
    r.finger('pointerdown', 7, 500, 350);
    r.finger('pointermove', 7, 560, 330);
    r.finger('pointerup', 7, 560, 330);
    r.release();
    await turned;
    ok('a drag while it decodes: the reissue comes up where he put the sheet (it is not re-framed)',
      r.env.versionView.revId === 'r1' && close(r.pan()[0], 60, 1e-9, 1e-6) && close(r.pan()[1], -20, 1e-9, 1e-6),
      JSON.stringify(r.pan()));
  }
  {
    // The iPad turned while it decodes, at Fit: Fit stays Fit, so the landing still ends on the reissue's.
    const r = landing([3400, 2200], { hold: true });
    const turned = r.env.goToPage(1);
    while (!r.release) await tick();
    r.resize(704, 1024);
    r.release();
    await turned;
    ok('turned while it decodes: the reissue\'s Fit at the new size', r.zf.showsFit() && r.vp.zoom === revFit(r, [3400, 2200]),
      String(r.vp.zoom / revFit(r, [3400, 2200])));
  }
  {
    // He turns on before the reissue is up: the stale landing frames nothing.
    const r = landing([3400, 2200], { hold: true });
    const turned = r.env.goToPage(1);
    while (!r.release) await tick();
    const rel = r.release;
    await r.env.goToPage(0);
    rel();
    await turned;
    eq('turned on while it decodes: the sheet he turned to at its own Fit, no reissue up, nothing re-framed',
      [r.st.page, r.env.versionView.revId, r.zf.showsFit(), r.vp.zoom === revFit(r, SHEET)], [0, '', true, true]);
  }
}

// ═══ 9. the live differential ═══════════════════════════════════════════
let live = 'skipped: no PTT_DESKTOP_SRC';
if (!(await haveDesktopSource())) {
  log('\n-- 9. live differential SKIPPED (set PTT_DESKTOP_SRC) --');
} else {
  log('\n-- 9. live: the desktop source as it is now --');
  let truth = null;
  try {
    const { stdout } = await run('python', ['-B', path.join(here, 'zoom-floor-python-truth.py'), DESKTOP_SRC],
      { maxBuffer: 1 << 28, windowsHide: true });
    truth = JSON.parse(stdout);
  } catch (err) {
    fails += 1;
    log(`FAIL the desktop's zoom methods could not be lifted and run:\n${err.stderr || err.message}`);
  }
  if (truth) {
    log(`   (lifted by text: ${Object.entries(truth.lifted).map(([k, v]) => `${k} ${v.length}`).join(', ')}`
      + ` -- module names ${truth.lifted.module.join(', ')})`);
    checkWords(truth, 'live');
    await checkScenarios(truth, 'live');
    checkPictures(truth, 'live');
    ok('the committed tests/data/zoom-floor-truth.json is the desktop\'s answer as it is now '
      + `(regenerate: python -B tests/zoom-floor-python-truth.py "${DESKTOP_SRC}" --write)`,
    JSON.stringify(truth) === JSON.stringify(SNAP));
    live = 'live differential run';
  }
}

console.log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass -- zooming out stops at the whole sheet, the desktop's way (${live})`);
process.exit(fails ? 1 : 0);
