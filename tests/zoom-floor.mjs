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
//     raise, the drawing on screen and every sentence. PAGE TURNS (3.06) go
//     through main.js's own goToPage, a sheet card's own tap, stepSheet
//     (Page Down / Up), showSheetVersion and the Items list's jump, against
//     the desktop's own next_page / prev_page / go_to_page /
//     show_sheet_version / _on_item_activated: Fit remembered as Fit, the
//     small sheet raised and the big one back at his zoom, Shift past Fit
//     kept (onto a reissue on smaller paper too), the box off as 3.05, Fit
//     Width a number, a newest drawing on other paper, a turn while a
//     revision decodes, the card of the sheet on screen clicked again
//     (centred and settled), and a step made while the sheet a turn asked
//     for is still being decoded ('during': Page Down then Page Up, the
//     card, Page Down twice, a row whose item is on the sheet just left --
//     the desktop's turns are synchronous, so there they are one after the
//     other). From the COMMITTED tests/data/zoom-floor-truth.json,
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
//     and a landing on a sheet whose Newest is on other paper ends settled on
//     that drawing (main.js's own goToPage) -- not over a zoom, a pinch or a
//     drag he made while it decoded, and not on the next sheet he turned to;
//     a decode he turned past settles nothing; a settle parked for want of a
//     canvas runs on the first frame that has one, and never over a zoom to
//     an item; the doors (import, delete, the Items list, Zoom to item, the
//     Fit Width menu) and 'keep'. A save through a file handle (main.js's
//     own reacquireAfterSave, lifted with stand-ins for the handle and the
//     re-read, which closes the drawings on screen as the page store does):
//     with no turn, zoom and pan exactly as they were (a reissue on other
//     paper up, the sheet's own drawing, past Fit; three saves running);
//     Page Down then a save while the next sheet decodes lands exactly as
//     the same turn with no save; a save while the job's first sheet opens
//     is an opening; a save while a landing's drawing is still coming lands
//     on THAT drawing (his own for a jump to his work, the Revisions panel's
//     own drawing, a reissue picked, the Newest still decoding on the sheet
//     up), settled as with no save. The foot bar: the cut written on the
//     body, which the drawers, the Revisions panel and the start card read
//     too -- and no other rule in the file takes their cut back, however it
//     names them (aside.items, .mopen.items, aside.revpanel).
//     And WHILE THE NEXT SHEET DECODES, the drawing up is the last sheet's
//     (goToPage's shownPage): a card tapped twice, Next and then the card, a
//     row double-clicked, a turn made with nothing up (a deleted sheet's
//     neighbour decoding, a sheet that would not decode), a zoom past Fit or
//     a notch in and out made on the drawing still up, Page Down then Page
//     Up (the keys and runAction's own arrows), a row or a row menu's Zoom
//     to item whose item is on the sheet being left -- 'this sheet' asked of
//     the drawing up AND app.currentPage (onSheetUp), neither alone -- and a
//     mark is refused there, while a pinch, which is looking, says nothing.
//     A finger already down when he turns does nothing on the sheet turned
//     to: a tap in Count or a chain tool, a hold in Pan, a callout bubble
//     (while it opens and once it is up), a mouse's right press (no item
//     menu -- nor for one pressed while the sheet opened and released once
//     it was up), and an eraser sweep the turn cut short is its own undo
//     level -- through the controller's own handlers. So is a sweep a pinch
//     or a pointercancel ends, once, with nothing of it left for the next
//     turn or the next job opened to file; and one the history moves under
//     (Ctrl+Z held, Ctrl+Y, the history cleared) is over there, its own
//     level filed at its first deletion, so the Ctrl+Z takes back the sweep.
//
// The only differences from the desktop are the documented ones: the web's
// Fit keeps its 16 px margin, and Zoom to item fits the desktop's box inside
// the same margin (sections 5-8 run it; the differential runs the desktop's
// margin-free Fit), a refusal by pinch is said in the touch
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
// pixels in the Diff on a phone); and a job that opens at Fit Width keeps
// the top of the sheet in view on the web, where the desktop's is centred
// (the same zoom; from the first turn on both are centred). The readout's
// number truncates as the desktop's does (int(zoom * 100): 12.5% is '12%'),
// and 1 (100%), + and - keep a dragged pan as the desktop's set_zoom does --
// the user's decisions of 2026-11-07, compared exactly; ZoomFloor.setZoom
// keeps the pan at any zoom. Not in the
// differential, on purpose: the web's row click on THIS sheet selects and
// scrolls to the item at the zoom he has, as it always has (the desktop's
// double-click zooms there too); a row on another sheet is the desktop's.
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
// deleteCurrentPage's words of other takeoffs (desktop 3.08): the real ones,
// with no naming installed -- a job with only Main, so '' and v31's question.
const { hiddenTakeoffsWords, takeoffNaming } = await import('../js/core/counting.js');

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
// The Items list's row click, word for word (the ItemsPanel host's selectItem;
// since Round 6 its arguments are the row's item and page, and the shape it
// jumps to is the step's).
const SELECT_ITEM = (() => {
  const a = MAIN.indexOf('    selectItem: (item, row, ev) => {');
  const b = MAIN.indexOf('\n    },\n', a);
  return a < 0 || b < 0 ? null : MAIN.slice(a, b + 6);
})();
// The tools' host: whether the sheet turned to is still opening, and the words.
const SHEET_OPENING = between('    sheetOpening: () =>', "once it is on screen` : ''),");
// The thumbnails' tap, word for word: a sheet card (and the Sheets drawer).
const THUMB_PICK = between('  onPick: idx => goToPage(', '  onPick: idx => goToPage(')?.trim().replace(/,$/, '');
// drawFrame's parked view: the open and the turn that had no canvas to land in.
const PARKED = (() => {
  const a = MAIN.indexOf('  if (pendingFit && pageImage && viewport.measured) {');
  const b = MAIN.indexOf('if (zoomFloor.turned(pendingTurn.chose)) pendingTurn = null;', a);
  return a < 0 || b < 0 ? null : MAIN.slice(a, MAIN.indexOf('\n  }\n', b) + 4);
})();
const LIFTED = ['shownDrawingSize', 'zoomStopsAtFit', 'applyDefaultZoom',
  'applyDefaultZoomTo', 'landOpen', 'sayZoomFloorOnce', 'pressedByFinger',
  // a flip between the versions of a sheet
  'showSheetVersion', 'clearVersion',
  // a page turn, and its doors: Page Down / Up, the own drawing, an item
  'goToPage', 'stepSheet', 'goToPageOwnVersion', 'jumpToItem',
  // ...and what it asks: whose drawing is up, which job, how it comes up
  'sheetUp', 'onSheetUp', 'jobNow', 'inLandedJob', 'viewOf', 'leftByChoice',
  // 1 (100%): runAction's case calls it
  'zoomTo100'];
const tick = () => new Promise(res => setTimeout(res, 0));

/**
 * One sheet on screen: a real Viewport and ToolController on a stand-in
 * canvas, the app's own ZoomFloor host and zoom cases from main.js.
 * `desktop` runs the desktop's margin-free Fit and limits, for the diff.
 */
function rig({ canvas: [w, h], pages, settings: s0 = {}, revs = null, newest = true },
  { desktop = false, touch = false } = {}) {
  const settings = { zoom_out_stops_at_fit: true, wheel_mode: 'zoom', zoom_step_percent: 15,
    default_zoom_mode: 'fit', ...s0 };
  const rect = { left: 0, top: 0, width: w, height: h };
  // The sheets' other drawings ({page: [[rev_id, [w, h]], ...]}, oldest
  // first, the last the newest), each in a blob set of its own; and '~flip',
  // the revision the 'rev' step flips up on whatever sheet is up.
  const sets = [];
  const versOf = new Map();
  for (const [page, list] of Object.entries(revs || {})) {
    versOf.set(Number(page), list.map(([revId, size]) => {
      sets.push(size);
      return { revId, revPage: Number(page), rev: { _setIndex: sets.length - 1 }, label: revId, date: '' };
    }));
  }
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
  const bitmap = set => {
    const sz = set < 0 ? env.revBitmap && [env.revBitmap.width, env.revBitmap.height] : sets[set];
    return sz ? { width: sz[0], height: sz[1] } : null;
  };
  let img = pages[0] ? { width: pages[0][0], height: pages[0][1] } : null;
  const env = {
    ZoomFloor: ZF.ZoomFloor, zoomFloorLine: ZF.zoomFloorLine, boundingBox,
    viewport: vp, controller: c, zoomFloor: null, pendingFit: false, pendingTurn: null, comingUp: null,
    zoomFloorSaid: false, pageTicket: 0, STANDALONE_PAGE: -1000,
    // Whose drawing is up (the first sheet's, to begin with), and the job a
    // sheet landed in: none, so the first goToPage is the job's opening.
    shownPage: img ? 0 : -1, landedJob: null, jobIds: new WeakMap(), jobIdCount: 0, pageFinalLabel: i => `X${i}`,
    app: {
      settings: { get: k => settings[k] },
      get currentPage() { return st.page; }, set currentPage(v) { st.page = v; },
      pages: { get pageCount() { return pages.length; }, lruSize: 4, file: null,
        // A sheet's own drawing decodes at once -- or, held, when the test
        // lets it (holdPage), each held decode its own release (st.held,
        // oldest first; st.releasePage the newest); or fails (failPage, a
        // sheet index); a revision the same way (holdRev).
        getPage: i => {
          if (i === env.failPage) return Promise.reject(new Error('unreadable'));
          const out = { width: pages[i][0], height: pages[i][1] };
          if (!env.holdPage) return Promise.resolve(out);
          return new Promise(res => {
            st.releasePage = () => res(out);
            (st.held ||= []).push(st.releasePage);
          });
        },
        prefetchAround() {},
        hasRevisionPage: () => true,
        getRevisionPage: set => (env.holdRev
          ? new Promise(res => { st.release = () => res(bitmap(set)); })
          : Promise.resolve(bitmap(set))),
      },
      project: { measurements: {}, metadata: {}, findItem: id => env.itemAt?.(id) ?? null },
    },
    versionView: { revId: '', revPage: null, set: -1, bitmap: null, size: null },
    versionTicket: 0, MAIN_LRU: 4, MAIN_LRU_COMPARING: 2, revBitmap: null, holdRev: false, holdPage: false,
    failPage: -1, from: 'canvas',
    allRevisions: () => [], sheetOrigin: () => null,
    sheetVersions: page => [{ revId: '', revPage: null, rev: null, label: 'Own', date: '' },
      ...(versOf.get(page) || []),
      { revId: '~flip', revPage: page, rev: { _setIndex: -1 }, label: 'Flip', date: '' }],
    newestOf: i => (newest === false ? '' : (versOf.get(i) || []).at(-1)?.revId || ''),
    syncVersionUi() {}, clearOverlay() {}, thumbs: { setCurrent() {} }, syncPageOf() {},
    // (Round 8: a turn takes the last sheet's saved overlay down and the
    // landing settles this one's -- tests/overlay-look.mjs holds that; a
    // saved overlay moves no view)
    savedOv: { turn() {}, settle() {} },
    // (Round 6: the Items list on one sheet waits for a landing and follows
    // it -- tests/revision-counting.mjs holds that; here the list is off, and
    // a row's tap is the jump: no stepping on one sheet, the item itself)
    syncScaleSelect() {}, itemsPanel: { refresh() {}, onSheetShown() {}, sheetOnly: () => false }, landingTicket: 0, sheetFailed: null,
    stepOnThisSheet: () => false, stepAcrossSheets: (m, pageIdx) => [pageIdx, m],
    revPageLabel: () => '', sizesMatch: () => true, sizeRefusal: () => '',
    get pageImage() { return img; }, set pageImage(v) { img = v; },
    browsingOtherVersion: () => !!env.versionView.revId,
    setStatus: t => { st.said.push(t); st.saidAt.push(st.step); },
    uiMode: () => (touch ? 'touch' : 'standard'),
    // What pressed last, and whether there is a mouse: a touch rig is a finger on an iPad.
    lastPressFinger: touch,
    window: { matchMedia: q => ({ matches: q === '(any-pointer: fine)' ? !touch : false }) },
    requestDraw() {},
  };
  liftMain(LIFTED, env);
  // The tools ask the app's own host whether the sheet turned to is still opening.
  // eslint-disable-next-line no-new-func
  c.host.sheetOpening = new Function('env', `with (env) { return ({ ${SHEET_OPENING} }).sheetOpening; }`)(env);
  // The jump's promise, so a step can wait for it (selectItem does not).
  const jump = env.jumpToItem;
  env.jumpToItem = (...a) => (st.jumped = jump(...a));
  // eslint-disable-next-line no-new-func
  env.selectItem = new Function('env', `with (env) { return ({ ${SELECT_ITEM} }).selectItem; }`)(env);
  // eslint-disable-next-line no-new-func
  env.pickCard = new Function('env', `with (env) { return ({ ${THUMB_PICK} }).onPick; }`)(env);
  // eslint-disable-next-line no-new-func
  env.parked = new Function('env', `with (env) { return function parked() {\n${PARKED}\n}; }`)(env);
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
    /** Zoom to item, through showItemMenu's own callback (its item's other fields in `extra`). */
    item(points, type = 'count', extra = {}) { zoomToItem(env, { points, type, ...extra }); },
    /** A revision of size [w, h] flipped up, or (null) the sheet's own drawing back. */
    async flip(size) {
      if (size) {
        env.revBitmap = { width: size[0], height: size[1] };
        await env.showSheetVersion(st.page, '~flip', { announce: false, flip: false });
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
    await webStep(r, step, i, swap);
    const shown = r.env.shownDrawingSize();
    out.push({ page: r.st.page, shown: shown && [shown.w, shown.h], zoom: r.vp.zoom, pan: r.pan(), label: r.zf.label(),
      atFloor: r.zf.atFloor(), showsFit: r.zf.showsFit(), base: r.zf.base,
      baseFit: r.zf.baseFit, pastFit: r.zf.pastFit, raised: r.zf.raise !== null,
      said: r.st.said.slice(), saidAt: r.st.saidAt.slice() });
  }
  return { trace: out,
    minusTip: ZF.zoomOutTip(r.settings.zoom_out_stops_at_fit !== false, r.settings.wheel_mode) };
}
/** One step of a scenario, taken on the web as the app takes it. */
async function webStep(r, step, i, swap) {
  const op = step[0];
  // A job opens as loadProjectFile opens it: the store re-pointed at the
  // file just opened (setFromProject), no drawing up, then the sheet.
  if (op === 'open') {
    r.env.app.pages.file = { opened: i };
    r.env.pageImage = null;
    await r.env.goToPage(step[1] || 0);
  }
  else if (op === 'wheel') r.wheel(step[1], step[2], step[3], step[4] || 0, !!step[5], !!step[6], swap);
  else if (op === 'pinch') r.zf.zoomAt(step[1], step[2], step[3], false, 'pinch');
  else if (op === 'minus') await r.act('zoom-out');
  else if (op === 'plus') await r.act('zoom-in');
  else if (op === 'F') await r.act('zoom-fit');
  else if (op === 'one') await r.act('zoom-100');
  else if (op === 'pan') r.vp.panBy(step[1], step[2]);
  // A sheet card (the desktop's thumbnail: go_to_page), through the
  // thumbnails' own tap -- the sheet on screen too.
  else if (op === 'turn') await r.env.pickCard(step[1]);
  // Page Down / Up: the keys' own stepSheet.
  else if (op === 'next' || op === 'prev') await r.env.stepSheet(op === 'next' ? 1 : -1);
  // The version bar, the matrix: showSheetVersion, onto another sheet too.
  else if (op === 'version') await r.env.showSheetVersion(step[1], step[2], { announce: false, flip: false });
  // The Items list's row, through its own selectItem.
  else if (op === 'jump') {
    r.st.jumped = null;
    r.env.selectItem({ _uid: `j${i}`, type: step[3] || 'count', points: step[2], rev_id: step[4] || '' }, step[1]);
    await r.st.jumped;
  } else if (op === 'turns') {
    // The second sheet turned to while the first one's newest drawing is
    // still being decoded (the desktop's turns are synchronous).
    const [a, b] = step[1];
    r.env.holdRev = true;
    r.st.release = null;
    let done = false;
    const first = r.env.goToPage(a).then(() => { done = true; });
    while (!done && !r.st.release) await tick();
    // ...and it really is still decoding when he turns on, if it has one.
    if (r.env.newestOf(a) && (done || !r.st.release)) {
      throw new Error(`"turns" ${JSON.stringify(step)}: ${a}'s newest drawing was not held`);
    }
    r.env.holdRev = false;
    await r.env.goToPage(b);
    r.st.release?.();
    await first;
  } else if (op === 'during') {
    // ["during", turn, step...]: the steps made while the sheet the turn
    // asked for is still being decoded -- seconds on an iPad; the desktop's
    // turns are synchronous. What they turn to comes up at once (a sheet
    // just left is in the cache); the turn's own decode finishes last.
    r.env.holdPage = true;
    r.st.held = [];
    const turn = webStep(r, step[1], i, swap);
    r.env.holdPage = false;
    const held = r.st.held.splice(0);
    if (!held.length) throw new Error(`"during" ${JSON.stringify(step)}: the turn's sheet was not held`);
    for (const sub of step.slice(2)) await webStep(r, sub, i, swap);
    for (const f of held) f();
    await turn;
  } else if (op === 'resize') r.resize(step[1], step[2]);
  // Zoom to item through showItemMenu's own callback, the box and all.
  else if (op === 'item') r.item(step[1], step[2] || 'count');
  // A flip, through main.js's own showSheetVersion / clearVersion.
  else if (op === 'rev') await r.flip(step[1]);
  else if (op === 'settings') {
    Object.assign(r.settings, step[1]);
    r.c.wheelMode = r.settings.wheel_mode;
  } else throw new Error(`unknown step ${JSON.stringify(step)}`);
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
  // FIT WIDTH keeps the top of the sheet in view on the web (Viewport.fitWidth,
  // as it always has); the desktop's width zoom (set_zoom) leaves the pan
  // where the opening put it, in the middle. The zoom is the same number, and
  // from the first turn on both are centred.
  'turns: a job that opens at Fit Width keeps it as a number': [{
    fields: ['pan'], at: [0],
    why: 'the web\'s Fit Width puts the top of the sheet at the top of the screen; the desktop\'s leaves it centred',
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
        // The readout, exactly: 'Fit ', when it shows, and the number, which
        // truncates on both (update_zoom_label's int(zoom * 100)).
        if (g.label !== t.label) diff.push(`label ${g.label} vs ${t.label}`);
        for (const k of ['page', 'atFloor', 'showsFit', 'baseFit', 'pastFit', 'raised']) {
          if (g[k] !== t[k]) diff.push(`${k} ${g[k]} vs ${t[k]}`);
        }
        if (JSON.stringify(g.shown) !== JSON.stringify(t.shown)) diff.push(`shown ${g.shown} vs ${t.shown}`);
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

{
  // The foot bar of a phone or tablet. It is opaque and drawn over the
  // bottom of the stage, so the canvas stops at its top edge: at 844x390 the
  // stage is 366 high, the bar 53, the canvas 313. Fit and the floor are then
  // the part he can see, with nothing of their own to know about a bar.
  const CSS = (await readFile(new URL('../css/app.css', import.meta.url), 'utf-8')).replace(/\r\n/g, '\n');
  const rule = /\n#canvas \{([^}]*)\}/.exec(CSS)?.[1] || '';
  ok('css: the canvas is cut short by the foot bar (--mbar-h)',
    /height:\s*calc\(100% - var\(--mbar-h, 0px\)\)/.test(rule) && /bottom:\s*auto/.test(rule)
    && !/height:\s*100%\s*;/.test(rule) && !/inset:\s*0\s*;/.test(rule), rule);
  const fitText = fnText('fitCanvasAboveFootBar');
  ok('main.js: one observer hears the stage AND the bar, measures, then draws',
    !!fitText && /const ro = new ResizeObserver\(\(\) => \{ fitCanvasAboveFootBar\(\); requestDraw\(\); \}\);\n\s*ro\.observe\(\$\('stage'\)\);\n\s*ro\.observe\(\$\('mobileBar'\)\);/.test(MAIN)
    && !/new ResizeObserver\(\(\) => requestDraw\(\)\)\.observe\(\$\('stage'\)\)/.test(MAIN));
  // The cut is written on the body, the stage's parent (index.html), so the
  // drawers laid over the stage and the start card inside it read it too;
  // nothing is written on the stage itself.
  const cover = (stage, bar, hidden = false) => {
    const set = [];
    const props = {};
    const onStage = [];
    const el = {
      stage: { getBoundingClientRect: () => stage,
        style: { getPropertyValue: () => '', setProperty: (k, v) => { onStage.push([k, v]); } },
        parentElement: { style: { getPropertyValue: k => props[k] || '', setProperty: (k, v) => { props[k] = v; set.push(v); } } } },
      mobileBar: { hidden, getBoundingClientRect: () => bar },
    };
    const env = liftMain(['fitCanvasAboveFootBar'], { $: id => el[id] });
    env.fitCanvasAboveFootBar();
    env.fitCanvasAboveFootBar();
    return onStage.length ? ['written on the stage', onStage] : [props['--mbar-h'], set.length];
  };
  const HTML = (await readFile(new URL('../index.html', import.meta.url), 'utf-8')).replace(/\r\n/g, '\n');
  const body = (() => {
    const a = HTML.indexOf('<div class="body">');
    const b = HTML.indexOf('<!-- ── status bar', a);
    return a < 0 || b < 0 ? '' : HTML.slice(a, b);
  })();
  const stageHtml = /<main class="stage" id="stage">[\s\S]*?<\/main>/.exec(body)?.[0] || '';
  ok('index.html: the stage, both drawers and the foot bar are all in the body, and the start card in the stage',
    ['id="thumbsPanel"', 'id="stage"', 'id="mobileBar"', 'id="itemsPanel"'].every(s => body.includes(s))
    && stageHtml.includes('id="emptyState"') && !stageHtml.includes('id="itemsPanel"'));
  const narrow = (() => {
    const a = CSS.indexOf('@media (max-width: 1023px) {\n  /* The seven menus');
    return a < 0 ? '' : CSS.slice(a, CSS.indexOf('\n}\n', a));
  })();
  const drawers = /\n {2}\.thumbs, \.items \{([^}]*)\}/.exec(narrow)?.[1] || '';
  ok('css: on a phone or tablet both drawers stop at the foot bar (bottom: --mbar-h)',
    /position:\s*absolute;\s*top:\s*0;\s*bottom:\s*var\(--mbar-h, 0px\);/.test(drawers) && !/bottom:\s*0\s*;/.test(drawers), drawers);
  const es = /\n\.empty-state \{([^}]*)\}/.exec(CSS)?.[1] || '';
  const card = /\n\.es-card \{([^}]*)\}/.exec(CSS)?.[1] || '';
  ok('css: the start card stops at the foot bar and scrolls, centred by its own margins',
    /bottom:\s*var\(--mbar-h, 0px\)/.test(es) && /overflow-y:\s*auto/.test(es) && !/inset:\s*0/.test(es)
    && !/place-items:\s*center/.test(es) && /(^|\n)\s*margin:\s*auto;/.test(card), es + ' | ' + card);
  // The Revisions panel too: on a phone it is the whole screen, laid over
  // the stage, and under the bar were its last sheet row and its legend.
  const revNarrow = /\n@media \(max-width: 1023px\) \{\n {2}\.revpanel \{([^}]*)\}/.exec(CSS)?.[1] || '';
  ok('css: on a phone or tablet the Revisions panel stops at the foot bar (bottom: --mbar-h)',
    /bottom:\s*var\(--mbar-h, 0px\)/.test(revNarrow), revNarrow);
  // ...and nothing else in the file takes any of it back. Each check above
  // reads the one rule it names, so a later '.items { bottom: 0 }' put the
  // list's count and totals under the bar again with every check passing.
  // Every rule in the file, comments out; the box a selector styles is its
  // last compound ('.items.mopen' styles the drawer, '.items .row' a row),
  // wherever the name is in it: 'aside.items', '.mopen.items' and
  // 'aside#revPanel' style the box as '.items' does (the dot or the hash
  // starts the name, and what follows it must end it, so '.items-foot' and
  // '.no-items' are other boxes).
  const rules = [...CSS.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map(m => ({ sel: m[1].trim(), body: m[2] }));
  const styles = (re, sel) => sel.split(',').some(s => re.test(s.trim().split(/[\s>+~]+/).at(-1)));
  ok('(the guards below see a box named with its element or another class: aside.items, .mopen.items, aside#revPanel; not .items-foot, .no-items, .items .row)',
    [['aside.items', true], ['.mopen.items', true], ['.items.mopen', true], ['aside#itemsPanel', true],
      ['div.thumbs:not([hidden])', true], ['.items-foot', false], ['.no-items', false], ['.items .row', false],
      ['.thumbs > .thumb', false]].every(([sel, want]) => styles(/(\.thumbs|\.items|#thumbsPanel|#itemsPanel)(?![\w-])/, sel) === want)
    && styles(/(\.revpanel|#revPanel)(?![\w-])/, 'aside#revPanel') && styles(/(\.revpanel|#revPanel)(?![\w-])/, 'aside.revpanel'));
  const setting = props => new RegExp(`(^|[;\\s])(${props})\\s*:`);
  const BOX_PROPS = setting('position|top|bottom|inset(-[a-z-]+)?|height|max-height');
  /** The rules for one box, in file order, and the ones that cut it at the bar. */
  const named = re => {
    const all = rules.filter(({ sel }) => styles(re, sel));
    return { all, at: all.filter(({ body }) => /bottom:\s*var\(--mbar-h, 0px\)/.test(body)) };
  };
  const drawersAll = named(/(\.thumbs|\.items|#thumbsPanel|#itemsPanel)(?![\w-])/);
  ok('css: one rule cuts the drawers at the bar, and no other rule for a drawer sets its position, its top or bottom, or its height',
    drawersAll.at.length === 1 && drawersAll.at[0].sel === '.thumbs, .items'
    && drawersAll.all.filter(r => r !== drawersAll.at[0]).every(r => !BOX_PROPS.test(r.body)),
    JSON.stringify(drawersAll.all.filter(r => r !== drawersAll.at[0] && BOX_PROPS.test(r.body))));
  const startAll = named(/(\.empty-state|#emptyState)(?![\w-])/);
  const cardAll = rules.filter(({ sel }) => styles(/\.es-card(?![\w-])/, sel));
  const centredBy = cardAll.filter(({ body }) => /(^|[;\s])margin:\s*auto;/.test(body));
  ok('css: ...nor for the start card: no other rule sets where it ends, how it overflows or how it places the card, nor the card\'s margin',
    startAll.at.length === 1 && startAll.at[0].sel === '.empty-state'
    && startAll.all.filter(r => r !== startAll.at[0])
      .every(r => !setting('position|top|bottom|inset(-[a-z-]+)?|height|max-height|overflow(-[xy])?|place-items|place-content|align-items|align-content').test(r.body))
    && centredBy.length === 1 && cardAll.filter(r => r !== centredBy[0])
      .every(r => !setting('margin(-[a-z]+)?|align-self|place-self|position').test(r.body)),
    JSON.stringify([startAll.all.map(r => r.sel), cardAll.map(r => r.sel)]));
  // The panel's own rule (the first, the desktop's: top: 0; bottom: 0) sets
  // where it is; only the cut may set any of that again. A rule BEFORE the
  // cut that names the panel more closely ('aside.revpanel') outranks it
  // there as one after it does, and an !important on its own rule would too.
  const revAll = named(/(\.revpanel|#revPanel)(?![\w-])/);
  const revOwn = revAll.all[0];
  ok('css: ...nor for the Revisions panel: only its own rule (first) and its cut set where it is or how tall, neither !important',
    revAll.at.length === 1 && revAll.at[0].sel === '.revpanel' && !!revOwn && revOwn !== revAll.at[0]
    && revOwn.sel === '.revpanel' && BOX_PROPS.test(revOwn.body)
    && revAll.all.filter(r => r !== revOwn && r !== revAll.at[0]).every(r => !BOX_PROPS.test(r.body))
    && ![revOwn, revAll.at[0]].some(r => /!important/.test(r.body)),
    JSON.stringify(revAll.all.map(r => r.sel)));
  const R = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  eq('844x390: the bar covers 53 px of the stage, written once', cover(R(0, 24, 844, 366), R(0, 337, 844, 53)), ['53px', 1]);
  eq('820x1180 portrait: the same 53 px', cover(R(0, 24, 820, 1156), R(0, 1127, 820, 53)), ['53px', 1]);
  eq('a bar with the home-indicator inset: its whole height', cover(R(0, 24, 844, 366), R(0, 319, 844, 71)), ['71px', 1]);
  eq('no bar (hidden): nothing cut', cover(R(194, 24, 682, 796), R(0, 0, 0, 0), true), ['0px', 1]);
  eq('a bar beside the stage, not over it: nothing cut', cover(R(0, 24, 400, 366), R(500, 337, 300, 53)), ['0px', 1]);
  eq('never more than the stage itself', cover(R(0, 24, 844, 40), R(0, 0, 844, 400)), ['40px', 1]);

  // What the viewport then hears: a canvas 53 px shorter, like a turn.
  const r = pinchRig();
  r.resize(844, 366);
  ok('(at Fit on the full stage)', r.zf.showsFit());
  r.resize(844, 313);
  const [, y0] = r.vp.toScreen(0, 0);
  const [, y1] = r.vp.toScreen(SHEET[0], SHEET[1]);
  ok('the bar appears at Fit: the Fit of the canvas above the bar, centred',
    r.zf.showsFit() && r.vp.zoom === Math.min((844 - 32) / SHEET[0], (313 - 32) / SHEET[1]) && centred(r));
  ok('...and the whole sheet is above the bar, with the 16 px margin', y0 >= 16 - 1e-9 && y1 <= 313 - 16 + 1e-9, `${y0}..${y1}`);
  const fit = r.vp.zoom;
  r.wheel(400, 150, -120);
  eq('a notch out from there is refused: the sheet does fit', r.vp.zoom, fit);
  r.resize(844, 366);
  ok('the bar goes (the layout switched): the bigger Fit', r.zf.showsFit() && r.vp.zoom > fit);
}
{
  // ZoomFloor.setZoom is the desktop's set_zoom at ANY zoom, not only 1's:
  // the pan -- the page centre's offset from the canvas centre, in SCREEN
  // pixels -- is the same after it, so a sheet dragged aside stays that far
  // aside. (At zoom 1 a pan in page units reads the same; at 0.37 or 2.5 it
  // does not.)
  const r = pinchRig();
  for (const [from, pan, to] of [[0.5, [150, -80], 0.37], [0.37, [-63.25, 41.5], 2.5], [2.5, [0, 0], 1],
    [1, [212, 17.75], 10], [0.2, [-300, -120], 0.2]]) {
    r.vp.zoom = from;
    const s = { w: SHEET[0], h: SHEET[1] };
    r.vp.centerOn(s.w / 2 - pan[0] / from, s.h / 2 - pan[1] / from);
    const before = r.pan();
    r.zf.setZoom(to);
    const after = r.pan();
    ok(`setZoom(${to}) from ${from} with the sheet ${pan} aside: the zoom, and the same pan`,
      r.vp.zoom === to && close(after[0], before[0], 1e-9, 1e-9) && close(after[1], before[1], 1e-9, 1e-9),
      `${before} -> ${after} at ${r.vp.zoom}`);
  }
}
{
  // With no drawing up -- a sheet that could not be opened, its takeoff still
  // drawn; or one decoding again after a save -- there is no page centre to
  // keep: + and - (and 1) zoom about the middle of the screen, so a centred
  // view stays centred. Keeping the origin instead ran it off to the top-left.
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1024, height: 704 }), width: 0, height: 0 };
  const vp = new Viewport(canvas);
  vp.resize();
  const zf = new ZF.ZoomFloor(vp, { size: () => null, enabled: () => true, page: () => 0 });
  vp.zoom = 0.3;
  vp.centerOn(3600, 2400);
  const mid = () => vp.toScreen(3600, 2400);
  const was = mid();
  zf.zoomIn();
  const a = mid();
  zf.zoomOut();
  const b = mid();
  zf.setZoom(1);
  const c = mid();
  ok('no drawing up: +, - and 1 zoom about the middle of the screen, a centred view stays centred',
    close(vp.zoom, 1) && [a, b, c].every(p => close(p[0], was[0], 1e-9, 1e-9) && close(p[1], was[1], 1e-9, 1e-9)),
    `${was} -> ${a} -> ${b} -> ${c} at ${vp.zoom}`);
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
  ok('runAction: 1 is zoomTo100 alone, which is the zoom floor\'s set_zoom, a zoom he chose',
    /\n {4}case 'zoom-100':\n {6}zoomTo100\(\);\n {6}requestDraw\(\);\n {6}break;\n {4}case 'zoom-width':/.test(CASES || '')
    && /^function zoomTo100\(\) \{\n {2}zoomFloor\.setZoom\(1\);\n {2}zoomFloor\.chosen\(\);\n\}$/.test(fnText('zoomTo100') || ''));
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
  // (Later rounds' own imports may follow it, each a line of its own.)
  ok('the zoom-floor import is a line of its own after the import list',
    /\n\} from '\.\/core\/revisions\.js';\nimport \{ ZoomFloor[^\n]*\} from '\.\/render\/zoom-floor\.js';\n(?:import \{[^\n]*\} from '[^'\n]*';\n)*\nconst \$ = /.test(MAIN));
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
  // Landing on a sheet whose Newest is a reissue on other paper, through
  // main.js's own goToPage, showSheetVersion, landOpen and ZoomFloor.turned.
  // The view was settled on the sheet's OWN drawing while it was all there
  // was; the landing settles again on the drawing that goes up -- as the
  // desktop's held turn settles once its revision is on screen -- unless he
  // zoomed, pinched or moved the sheet while it was being decoded.
  const landing = (revSize, { mode = 'fit', hold = false, settings = {} } = {}) => {
    const r = rig({ canvas: IPAD, pages: [SHEET, SHEET], revs: { 1: [['r1', revSize]] },
      settings: { default_zoom_mode: mode, ...settings } }, { touch: true });
    r.env.pageImage = null;              // nothing up yet: the job opens on the first goToPage
    r.env.holdRev = hold;                // the revision's decode waits until the test lets it finish
    return r;
  };
  const revFit = (r, s) => Math.min((r.vp.width - 32) / s[0], (r.vp.height - 32) / s[1]);
  const SMALL_SHEET = [3400, 2200];
  for (const [paper, size] of [['smaller', SMALL_SHEET], ['bigger', [10800, 7200]], ['the same', SHEET]]) {
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
    const r = landing(SMALL_SHEET, { mode: '100' });
    await r.env.goToPage(1);
    eq('a job opening at 100% on a reissue: the reissue at 100%, centred', [r.vp.zoom, r.pan().map(v => Math.abs(v) < 1e-6)],
      [1, [true, true]]);
  }
  {
    // The desktop's settle (Round 3 re-applied the default zoom to the
    // reissue): the width is the sheet's OWN, a number, and a reissue on
    // smaller paper it would show smaller than the screen is raised.
    const r = landing(SMALL_SHEET, { mode: 'width' });
    await r.env.goToPage(1);
    const width = (IPAD[0] - 32) / SHEET[0];
    eq('a job opening at Fit Width on a reissue on smaller paper: raised to the reissue\'s Fit, his zoom the sheet\'s width',
      [r.vp.zoom === revFit(r, SMALL_SHEET), r.zf.showsFit(), r.zf.raise !== null, close(r.zf.base, width), r.zf.baseFit],
      [true, true, true, true, false]);
    r.wheel(512, 352, 120);
    r.wheel(512, 352, -120);
    ok('...a notch in and out there: his width again (the raise was the turn\'s)', close(r.zf.base, width) && !r.zf.baseFit);
    await r.env.goToPage(0);
    ok('...and the next sheet comes up at that width, centred', close(r.vp.zoom, width) && centred(r),
      JSON.stringify([r.vp.zoom / width, r.pan()]));
  }
  {
    // ...while with no reissue the web's Fit Width keeps the top of the
    // sheet in view: the open's settle sets his zoom and keeps the pan.
    // (A landscape screen wider than the sheet: there the width is not Fit.)
    const r = rig({ canvas: [1600, 900], pages: [SHEET, SMALL_SHEET], settings: { default_zoom_mode: 'width' } });
    r.env.pageImage = null;
    await r.env.goToPage(0);
    const z = (1600 - 32) / SHEET[0];
    ok('(the width is not Fit there)', z > r.zf.floor() * 1.1);
    ok('a job opening at Fit Width: the sheet\'s width, its top at the margin (the settle keeps the pan)',
      close(r.vp.zoom, z, 1e-12) && close(r.vp.origin.x, -16 / z, 1e-12, 1e-9) && close(r.vp.origin.y, -16 / z, 1e-12, 1e-9),
      JSON.stringify([r.vp.zoom / z, r.vp.origin]));
    await r.env.goToPage(1);
    ok('...the small sheet after it raised to its Fit', r.zf.showsFit() && r.zf.raise !== null);
    await r.env.goToPage(0);
    ok('...and the sheet after that at the width again, centred', close(r.vp.zoom, z) && centred(r));
  }
  {
    // He zooms while the reissue is decoded: his zoom is not overridden.
    const r = landing(SMALL_SHEET, { hold: true });
    await r.env.goToPage(0);
    const turned = r.env.goToPage(1);
    while (!r.st.release) await tick();
    r.wheel(400, 300, 120);
    const z = r.vp.zoom;
    r.st.release();
    await turned;
    eq('a notch in while the reissue decodes: his zoom stays (it is not re-settled)', [r.env.versionView.revId, r.vp.zoom],
      ['r1', z]);
  }
  {
    const r = landing(SMALL_SHEET, { hold: true });
    await r.env.goToPage(0);
    const turned = r.env.goToPage(1);
    while (!r.st.release) await tick();
    const h = hand(r).down(512, 352, 200);
    h.to(300);
    h.up();
    const z = r.vp.zoom;
    const [px, py] = r.pan();
    r.st.release();
    await turned;
    eq('a pinch while the reissue decodes: his zoom and his place stay (it is not re-settled)',
      [r.env.versionView.revId, z > revFit(r, SHEET) * 1.2, r.vp.zoom === z,
        close(r.pan()[0], px, 1e-9, 1e-6) && close(r.pan()[1], py, 1e-9, 1e-6)], ['r1', true, true, true]);
  }
  {
    const r = landing(SMALL_SHEET, { hold: true });
    const turned = r.env.goToPage(1);
    while (!r.st.release) await tick();
    r.finger('pointerdown', 7, 500, 350);
    r.finger('pointermove', 7, 560, 330);
    r.finger('pointerup', 7, 560, 330);
    r.st.release();
    await turned;
    ok('a drag while it decodes: the reissue comes up where he put the sheet (it is not re-settled)',
      r.env.versionView.revId === 'r1' && close(r.pan()[0], 60, 1e-9, 1e-6) && close(r.pan()[1], -20, 1e-9, 1e-6),
      JSON.stringify(r.pan()));
  }
  {
    // The iPad turned while it decodes, at Fit: Fit stays Fit, so the landing still ends on the reissue's.
    const r = landing(SMALL_SHEET, { hold: true });
    const turned = r.env.goToPage(1);
    while (!r.st.release) await tick();
    r.resize(704, 1024);
    r.st.release();
    await turned;
    ok('turned while it decodes: the reissue\'s Fit at the new size', r.zf.showsFit() && r.vp.zoom === revFit(r, SMALL_SHEET),
      String(r.vp.zoom / revFit(r, SMALL_SHEET)));
  }
  {
    // He turns on before the reissue is up: the stale landing settles nothing.
    const r = landing(SMALL_SHEET, { hold: true });
    const turned = r.env.goToPage(1);
    while (!r.st.release) await tick();
    const rel = r.st.release;
    r.env.holdRev = false;
    await r.env.goToPage(0);
    rel();
    await turned;
    eq('turned on while it decodes: the sheet he turned to at its own Fit, no reissue up, nothing re-settled',
      [r.st.page, r.env.versionView.revId, r.zf.showsFit(), r.vp.zoom === revFit(r, SHEET)], [0, '', true, true]);
  }
  {
    // The box off: a turn keeps the zoom, centred (3.05) -- onto a reissue too.
    const r = landing(SMALL_SHEET, { settings: { zoom_out_stops_at_fit: false } });
    await r.env.goToPage(0);
    r.vp.panBy(80, 40);
    const z = r.vp.zoom;
    await r.env.goToPage(1);
    eq('the box off: the reissue comes up at the zoom the sheet had, centred, nothing raised',
      [r.env.versionView.revId, r.vp.zoom === z, centred(r), r.zf.raise], ['r1', true, true, null]);
  }
}
{
  // A decode of the sheet's OWN drawing he turned past settles nothing.
  const SMALL_SHEET = [3400, 2200];
  const r = rig({ canvas: IPAD, pages: [SHEET, SMALL_SHEET, SHEET] }, { touch: true });
  r.env.pageImage = null;
  await r.env.goToPage(0);
  r.wheel(512, 352, 120);
  const his = r.vp.zoom;
  r.env.holdPage = true;
  const slow = r.env.goToPage(1);
  const rel = r.st.releasePage;
  r.env.holdPage = false;
  await r.env.goToPage(2);
  rel();
  await slow;
  eq('a turn whose drawing he turned past while it decoded: the sheet he went to at his zoom, centred, nothing raised',
    [r.st.page, r.env.pageImage.width, r.vp.zoom === his, centred(r), r.zf.raise], [2, SHEET[0], true, true, null]);
}
{
  // A turn with no canvas to land in is parked, and settled on the first
  // frame that has one (drawFrame's own lines), as pendingFit is.
  const SMALL_SHEET = [3400, 2200];
  const r = rig({ canvas: IPAD, pages: [SHEET, SMALL_SHEET] }, { touch: true });
  r.env.pageImage = null;
  await r.env.goToPage(0);
  r.wheel(512, 352, 120);
  const his = r.zf.base;
  r.resize(0, 0);
  await r.env.goToPage(1);
  ok('a turn landing with no canvas is parked for the sheet it landed on',
    r.env.pendingTurn !== null && r.zf.raise === null);
  r.resize(...IPAD);
  r.env.parked();
  eq('...and settled on the first frame with one: the small sheet raised to its Fit, his zoom kept aside',
    [r.zf.showsFit(), r.zf.raise !== null, r.zf.base === his, r.env.pendingTurn], [true, true, true, null]);
  r.wheel(512, 352, 120);
  r.wheel(512, 352, -120);
  ok('...a notch in and out there gives his zoom back', r.zf.base === his);
}
{
  // A jump to an item on another sheet whose landing had to park: the frame
  // after it does not settle over the zoom on the item.
  const r = rig({ canvas: IPAD, pages: [SHEET, SHEET], revs: { 1: [['r1', SHEET]] } }, { touch: true });
  r.env.pageImage = null;
  await r.env.goToPage(0);
  r.resize(0, 0);
  r.env.holdRev = true;
  r.st.jumped = null;
  r.env.selectItem({ _uid: 'x', type: 'count', points: [[3000, 2000], [3100, 2050]], rev_id: 'r1' }, 1);
  while (!r.st.release) await tick();
  ok('(its landing parked: no canvas when it landed)', r.env.pendingTurn !== null);
  r.resize(...IPAD);
  r.st.release();
  await r.st.jumped;
  const z = r.vp.zoom;
  const [px, py] = r.pan();
  r.env.parked();
  eq('a jump to an item, its landing parked: zoomed on the item, a number, and the next frame leaves it there',
    [r.env.versionView.revId, close(r.vp.toPage(512, 352)[0], 3050, 1e-9, 1e-6), r.zf.baseFit, r.vp.zoom === z,
      close(r.pan()[0], px, 1e-9, 1e-6) && close(r.pan()[1], py, 1e-9, 1e-6), r.env.pendingTurn, [...r.c.selected]],
    ['r1', true, false, true, true, null, ['x']]);
}
{
  // The Items list: a jump to an item on another sheet ends zoomed on it, in
  // the web's own margin; a jump he turned past does nothing.
  const SMALL_SHEET = [3400, 2200];
  const r = rig({ canvas: IPAD, pages: [SHEET, SMALL_SHEET, SHEET] }, { touch: true });
  r.env.pageImage = null;
  await r.env.goToPage(0);
  r.st.jumped = null;
  r.env.selectItem({ _uid: 'a', type: 'count', points: [[1000, 800], [1300, 1000]] }, 1);
  await r.st.jumped;
  const want = Math.min((IPAD[0] - 32) / Math.max(300 * 1.8, SMALL_SHEET[0] * 0.12),
    (IPAD[1] - 32) / Math.max(200 * 1.8, SMALL_SHEET[1] * 0.12), 8);
  eq('a row\'s item on another sheet: turned to, zoomed on the item, centred on it, selected, his zoom a number',
    [r.st.page, close(r.vp.zoom, want), close(r.vp.toPage(512, 352)[0], 1150, 1e-9, 1e-6),
      close(r.vp.toPage(512, 352)[1], 900, 1e-9, 1e-6), [...r.c.selected], r.zf.baseFit],
    [1, true, true, true, ['a'], false]);
  await r.env.goToPage(2);
  ok('...and the next sheet comes up at that zoom, centred', close(r.vp.zoom, want) && centred(r));
  // Turned away and back while the jump's sheet decoded: the jump is over.
  r.env.holdPage = true;
  r.st.jumped = null;
  r.env.selectItem({ _uid: 'b', type: 'count', points: [[100, 100], [140, 120]] }, 1);
  const relA = r.st.releasePage;
  const away = r.env.goToPage(0);
  const relB = r.st.releasePage;
  r.env.holdPage = false;
  await r.env.goToPage(1);
  const z1 = r.vp.zoom;
  relA();
  relB();
  await r.st.jumped;
  await away;
  eq('a jump he turned past and came back from: nothing zoomed to its item, nothing selected',
    [r.st.page, r.vp.zoom === z1, [...r.c.selected]], [1, true, []]);
  // Zoom to item from a row's menu, the item on another sheet: turned to first.
  r.env.itemAt = () => ({ pageKey: 0 });
  r.st.jumped = null;
  r.item([[5000, 3000], [5400, 3300]]);
  await r.st.jumped;
  eq('Zoom to item from a row, the item on another sheet: its sheet, zoomed on it',
    [r.st.page, close(r.vp.toPage(512, 352)[0], 5200, 1e-9, 1e-6), r.zf.baseFit], [0, true, false]);
}
{
  // Fit Width from the menu (web only): a NUMBER, as the desktop's width
  // zoom is (the user's decision) -- not a way of looking like Fit.
  const SMALL_SHEET = [3400, 2200];
  const r = rig({ canvas: [1600, 900], pages: [SHEET, SMALL_SHEET, SHEET, [10800, 7200]] });
  r.env.pageImage = null;
  await r.env.goToPage(0);
  await r.act('zoom-width');
  const width = (1600 - 32) / SHEET[0];
  ok('(the width is not Fit there)', width > r.zf.floor() * 1.1);
  eq('Fit Width: his zoom is the number', [close(r.zf.base, width), r.zf.baseFit], [true, false]);
  await r.env.goToPage(1);
  ok('...a smaller sheet it would show smaller than the screen: raised to its own Fit', r.zf.showsFit() && r.zf.raise !== null);
  await r.env.goToPage(2);
  ok('...the big sheet after it at the width again, centred', close(r.vp.zoom, width) && centred(r));
  await r.env.goToPage(3);
  ok('...and bigger paper at the same NUMBER, not its own width', close(r.vp.zoom, width) && centred(r)
    && !close(r.vp.zoom, (1600 - 32) / 10800));
}
{
  // Delete the sheet on screen: the sheet after it comes up as a turn onto
  // it (_apply_page_layout) -- through main.js's own deleteCurrentPage,
  // which asks below_fit_by_choice before the sheet goes.
  const SMALL_SHEET = [3400, 2200];
  const del = pages => {
    const r = rig({ canvas: IPAD, pages }, { touch: true });
    Object.assign(r.env, {
      D: { alertDialog: async () => {}, confirmDialog: async () => true },
      isTakeoffItem: () => true, takeoffQuantityWords: () => '', pageFinalLabel: i => `X${i}`,
      countingModel: () => ({ countedQuantities: () => ({}) }), takeoffMoveWords: () => '',
      sayPrice() {}, calloutPreview: { clearCache() {} }, hiddenTakeoffsWords, takeoffNaming,
    });
    r.env.thumbs.refresh = () => {};
    r.env.app.pages.removePage = i => { pages.splice(i, 1); };
    r.env.app.project.notePageRemoved = () => {};
    liftMain(['deleteCurrentPage'], r.env);
    return r;
  };
  {
    const r = del([SHEET, SHEET, SHEET]);
    r.env.pageImage = null;
    await r.env.goToPage(0);
    await r.env.goToPage(1);
    r.wheel(512, 352, -120, 0, true);
    const past = r.vp.zoom;
    ok('(past Fit by Shift on the sheet to delete)', r.zf.belowFitByChoice() && past < r.zf.floor());
    await r.env.deleteCurrentPage();
    eq('delete a sheet with a zoom Shift took past Fit: the sheet after it at that zoom, centred, still past Fit',
      [r.vp.zoom === past, centred(r), r.zf.pastFit, r.zf.raise], [true, true, true, null]);
  }
  {
    const r = del([SHEET, SHEET, SMALL_SHEET]);
    r.env.pageImage = null;
    await r.env.goToPage(0);
    await r.env.goToPage(1);
    r.wheel(512, 352, 120);
    const his = r.zf.base;
    await r.env.deleteCurrentPage();
    eq('delete a sheet at a notch in, a small sheet after it: raised to its Fit, his zoom kept aside (not the default zoom)',
      [r.zf.showsFit(), r.zf.raise !== null, r.zf.base === his, r.zf.baseFit], [true, true, true, false]);
  }
  const imp = fnText('importPdfFile') || '';
  ok('importPdfFile: sheets added to an open job are a turn (asked before the drawing goes); a new job opens',
    /const view = intoOpen && startAt > 0 \? 'turn' : 'open';\n\s*const chose = view === 'turn' && leftByChoice\(\);\n\s*pageImage = null;\n\s*await goToPage\(startAt, \{ view, chose \}\);/.test(imp));
}
{
  // 'keep': the drawing taken down and read back (the save's re-read,
  // reacquireAfterSave, driven below): the view exactly as it was, a
  // reissue on other paper up too.
  const r = rig({ canvas: IPAD, pages: [SHEET], revs: { 0: [['r1', [3400, 2200]]] } }, { touch: true });
  r.env.pageImage = null;
  await r.env.goToPage(0);
  await r.act('zoom-in');
  r.vp.panBy(50, 30);
  const before = r.vp.serialize();
  r.env.pageImage = null;
  await r.env.goToPage(0, { version: 'r1', view: 'keep' });
  const after = r.vp.serialize();
  ok('kept through a re-read: the same zoom, the reissue where he had it',
    r.env.versionView.revId === 'r1' && after.zoom === before.zoom && close(after.x, before.x, 1e-12, 1e-9)
      && close(after.y, before.y, 1e-12, 1e-9), JSON.stringify([before, after]));
  r.env.app.pages.file = { reread: true };   // the re-read re-points the store (setFromProject)
  r.env.pageImage = null;
  await r.env.goToPage(0, { version: 'r1' });
  ok('...which the re-read without it does not do: it opens again (the save re-fit before this round)',
    r.zf.showsFit());
  // ...and with it, a Page Down while the re-read decodes is a turn, not
  // another opening: the job is the one he was in.
  r.wheel(512, 352, -120, 0, true);
  const past = r.vp.zoom;
  r.env.app.pages.file = { reread: 2 };
  r.env.pageImage = null;
  r.env.holdPage = true;
  const kept = r.env.goToPage(0, { version: 'r1', view: 'keep' });
  r.env.holdPage = false;
  r.st.held = [];
  ok('(the re-read still decoding)', r.env.pageImage === null && !!r.st.releasePage);
  const relKeep = r.st.releasePage;
  r.pages.push(SHEET);
  await r.env.stepSheet(1);
  relKeep();
  await kept;
  eq('a Page Down while a kept re-read decodes: a turn at his zoom past Fit, not the default zoom',
    [r.st.page, r.vp.zoom === past, r.zf.pastFit, centred(r)], [1, true, true, true]);
}
{
  // A save through a file handle: main.js's own reacquireAfterSave, lifted
  // by text onto the rig -- the handle, the re-read (openProject) and the
  // store's re-point (setFromProject) are stand-ins; the decodes are the
  // rig's, held when a step says so. The re-read re-points the page store,
  // so to jobNow it is another file: before, the sheet came back as a job
  // opening, at the default zoom -- every save re-fitted the view. And a
  // re-read that kept the view while a turn still decoded cancelled the
  // turn: the sheet turned to came up at the last sheet's origin and zoom,
  // off the sheet. Each save below is diffed against the same steps with
  // no save at all.
  const saving = r => {
    const env = r.env;
    let n = 0;
    r.st.warned = [];
    Object.assign(env, {
      openProject: async file => ({ pageCount: env.app.pages.pageCount, file, pages: [] }),
      releaseLibraryCopy() {},
      // reacquireAfterSave swallows what throws, with a warning: a stand-in
      // missing would otherwise pass as 'the view did not move'.
      console: { warn: (...a) => r.st.warned.push(a.map(String).join(' ')) },
    });
    env.thumbs.refresh = () => {};
    env.app.pages.setFromProject = ({ file }) => {
      // As PageStore.clearCaches does, every drawing the store held is
      // closed, the ones on screen included: they read 0 x 0 from here on
      // (a closed ImageBitmap), so nothing after this can ask their size.
      for (const b of [env.pageImage, env.versionView.bitmap]) if (b) { b.width = 0; b.height = 0; }
      env.app.pages.file = file;
    };
    liftMain(['reacquireAfterSave'], env);
    return () => env.reacquireAfterSave({ name: 'job.takeoff', getFile: async () => ({ written: ++n }) });
  };
  // The zoom exactly; the origin to a millionth of a drawing pixel (a
  // reissue on other paper is carried there and back, as a flip carries it).
  const um = v => Math.round(v * 1e6) / 1e6;
  const state = r => ({ page: r.st.page, up: r.env.sheetUp(), rev: r.env.versionView.revId,
    view: { zoom: r.vp.zoom, x: um(r.vp.origin.x), y: um(r.vp.origin.y) },
    base: r.zf.base, baseFit: r.zf.baseFit, raise: r.zf.raise, pastFit: r.zf.pastFit, landed: r.env.inLandedJob() });
  /** Hold every sheet decode until `count` are asked for (a save asks after two awaits); returns them, oldest first. */
  const heldUntil = async (r, count) => {
    for (let k = 0; k < 50 && r.st.held.length < count; k += 1) await tick();
    r.env.holdPage = false;
    return r.st.held.splice(0);
  };
  const OTHER = [6000, 4400], SMALL = [3400, 2200];
  const flipped = r => r.env.showSheetVersion(0, '', { announce: false });

  // A save with no turn: zoom and pan exactly as they were, on the newest
  // drawing (a reissue on other paper), on the sheet's own drawing, and past
  // Fit by Shift.
  for (const [what, before] of [
    ['on a reissue on other paper', async r => { await r.act('zoom-in'); r.vp.panBy(50, 30); }],
    ['on the sheet\'s own drawing (not swapped for the newest)', async r => { await flipped(r); await r.act('zoom-in'); r.vp.panBy(-70, 40); }],
    ['past Fit by Shift, dragged', async r => { r.wheel(512, 352, -120, 0, true); r.vp.panBy(20, -15); }],
  ]) {
    const r = rig({ canvas: IPAD, pages: [SHEET, SHEET], revs: { 0: [['r1', [3400, 2200]]] } }, { touch: true });
    const save = saving(r);
    r.env.pageImage = null;
    await r.env.goToPage(0);
    await before(r);
    const was = state(r);
    await save();
    eq(`a save with no turn, ${what}: the view exactly as it was`, state(r), was);
    eq('...the re-read went through (nothing swallowed)', [r.st.warned, r.env.app.pages.file], [[], { written: 1 }]);
  }

  // Page Down, then a save while the next sheet decodes: it lands exactly as
  // the same turn with no save -- his zoom, centred (onto paper of another
  // size), a small sheet raised to its own Fit, Shift past Fit kept, the box
  // off as 3.05 -- whichever decode finishes first.
  async function turnThenSave(next, { save, before, box = true, saveFirst = false }) {
    const r = rig({ canvas: IPAD, pages: [SHEET, next], settings: { zoom_out_stops_at_fit: box } }, { touch: true });
    const saveNow = saving(r);
    r.env.pageImage = null;
    await r.env.goToPage(0);
    before(r);
    r.vp.panBy(-300, -150);
    r.env.holdPage = true;
    r.st.held = [];
    const turn = r.env.stepSheet(1);
    const saved = save ? saveNow() : null;
    const held = await heldUntil(r, save ? 2 : 1);
    const asked = [held.length, r.st.page, r.env.sheetUp()];
    for (const f of saveFirst ? held.reverse() : held) { f(); await tick(); }
    await Promise.all([turn, saved]);
    return { r, asked, got: state(r) };
  }
  for (const [what, next, before, box] of [
    ['onto other paper at his zoom', OTHER, r => r.wheel(512, 352, 120), true],
    ['onto a small sheet his zoom would show smaller than the screen', SMALL, r => r.wheel(512, 352, 120), true],
    ['past Fit by Shift', OTHER, r => r.wheel(512, 352, -120, 0, true), true],
    ['the box off', OTHER, r => r.wheel(512, 352, 120), false],
  ]) {
    const plain = await turnThenSave(next, { save: false, before, box });
    for (const saveFirst of [false, true]) {
      const { r, asked, got } = await turnThenSave(next, { save: true, before, box, saveFirst });
      eq(`(Page Down, then the save's re-read, both decodes held, ${what})`, asked, [2, 1, -1]);
      eq(`Page Down then a save while the next sheet decodes, ${what}${saveFirst ? ' (the re-read decoded first)' : ''}: `
        + 'it lands exactly as the turn with no save', got, plain.got);
      ok('...on the sheet, centred', got.up === 1 && centred(r) && r.st.warned.length === 0, JSON.stringify(r.st.warned));
    }
  }

  // A save while the job's first sheet is still opening: it opens, at the
  // default zoom -- not at the zoom of the job before it, nor as a turn.
  async function openThenSave(save) {
    const r = rig({ canvas: IPAD, pages: [SHEET, SHEET], settings: { default_zoom_mode: '100' } }, { touch: true });
    const saveNow = saving(r);
    r.env.pageImage = null;
    await r.env.goToPage(0);
    r.wheel(512, 352, -120);
    r.wheel(512, 352, -120);
    r.vp.panBy(80, 60);
    r.env.app.pages.file = { anotherJob: true };   // the next job: its own file, nothing landed in it yet
    r.env.pageImage = null;
    r.env.holdPage = true;
    r.st.held = [];
    const opening = r.env.goToPage(0);
    const saved = save ? saveNow() : null;
    const held = await heldUntil(r, save ? 2 : 1);
    for (const f of held) { f(); await tick(); }
    await Promise.all([opening, saved]);
    return { r, got: state(r) };
  }
  const opened0 = await openThenSave(false);
  const { r: o, got } = await openThenSave(true);
  eq('a save while the job\'s first sheet is still opening: it opens as with no save', got, opened0.got);
  eq('...at the default zoom (100%), centred', [o.vp.zoom, centred(o), o.st.warned], [1, true, []]);

  // Every save, again and again: on a reissue on other paper the view is
  // where it was after each (the store closes the drawing on screen; its
  // size, read once it was closed, was none, and each save threw the view
  // further off the sheet -- off it entirely after two).
  {
    const r = rig({ canvas: IPAD, pages: [SHEET, SHEET], revs: { 0: [['r1', [3400, 2200]]] } }, { touch: true });
    const save = saving(r);
    r.env.pageImage = null;
    await r.env.goToPage(0);
    await r.act('zoom-in');
    r.vp.panBy(-90, 50);
    const was = state(r);
    const after = [];
    for (let k = 0; k < 3; k += 1) { await save(); after.push(state(r)); }
    eq('three saves on a reissue on other paper, zoomed and dragged: the view exactly as it was after each',
      after, [was, was, was]);
  }

  // ...and the drawing a landing still on its way was bringing up. A turn
  // or a jump asks for a drawing of the sheet it turns to: his own drawing
  // for a jump to his work (the Items list, Zoom to item), the Revisions
  // panel's own drawing, an older reissue picked for another sheet. A save
  // while that sheet decodes lands on THAT drawing, as the landing would
  // have -- not on the Newest, which for his own work hid the item (work
  // is painted only over the drawing it was traced on). And with the sheet
  // up and the drawing still decoding -- the Newest after Page Down, a
  // reissue picked for the sheet up -- the re-read brings that drawing up,
  // settled as the landing would have been, not the sheet's own drawing.
  const REVS = { 1: [['r1', OTHER], ['r2', SMALL]] };   // sheet 1: two reissues, the Newest on small paper
  /** Hold every revision decode (each its own release, oldest first) until `stop`. */
  const holdRevs = r => {
    const real = r.env.app.pages.getRevisionPage;
    const held = [];
    r.env.app.pages.getRevisionPage = set => new Promise(res => held.push(() => res(real(set))));
    return { held, stop() { r.env.app.pages.getRevisionPage = real; } };
  };
  const until = async f => { for (let k = 0; k < 60 && !f(); k += 1) await tick(); };
  async function landThenSave(door, { save, saveFirst = false, revs = false, onSheet1 = false }) {
    const r = rig({ canvas: IPAD, pages: [SHEET, SHEET], revs: REVS }, { touch: true });
    const saveNow = saving(r);
    r.env.pageImage = null;
    await r.env.goToPage(0);
    if (onSheet1) await r.env.stepSheet(1);
    r.wheel(512, 352, 120);
    r.vp.panBy(-300, -150);
    let held;
    let saved = null;
    let landing;
    if (revs) {
      // The sheet's own drawing lands at once; the drawing asked of it decodes.
      const h = holdRevs(r);
      landing = door(r);
      await until(() => h.held.length >= 1);
      if (save) { saved = saveNow(); await until(() => h.held.length >= 2); }
      h.stop();
      held = h.held;
    } else {
      r.env.holdPage = true;
      r.st.held = [];
      landing = door(r);
      if (save) saved = saveNow();
      held = await heldUntil(r, save ? 2 : 1);
    }
    const asked = [held.length, r.st.page, r.env.sheetUp()];
    for (const f of saveFirst ? held.reverse() : held) { f(); await tick(); }
    await Promise.all([landing, saved]);
    for (let k = 0; k < 5; k += 1) await tick();
    return { r, asked, got: state(r) };
  }
  for (const [what, door, opts, drawing] of [
    ['the Revisions panel\'s own drawing of another sheet', r => r.env.goToPageOwnVersion(1), {}, ''],
    ['an older reissue picked for another sheet', r => r.env.showSheetVersion(1, 'r1', { announce: false }), {}, 'r1'],
    ['Page Down onto a sheet up at once, its Newest (small paper) still decoding', r => r.env.stepSheet(1), { revs: true }, 'r2'],
    ['an older reissue picked for another sheet, its own drawing up, the reissue still decoding',
      r => r.env.showSheetVersion(1, 'r1', { announce: false }), { revs: true }, 'r1'],
    ['an older reissue picked for the sheet up, still decoding (its Newest up)',
      r => r.env.showSheetVersion(1, 'r1', { announce: false }), { revs: true, onSheet1: true }, 'r1'],
  ]) {
    const plain = await landThenSave(door, { save: false, ...opts });
    eq(`(${what}, no save: the drawing it asked for)`, [plain.got.page, plain.got.up, plain.got.rev], [1, 1, drawing]);
    for (const saveFirst of [false, true]) {
      const { r, asked, got } = await landThenSave(door, { save: true, saveFirst, ...opts });
      eq(`(${what}, then the save's re-read: both decodes held)`, asked, [2, 1, opts.revs ? 1 : -1]);
      eq(`${what}, a save while it decodes${saveFirst ? ' (the re-read decoded first)' : ''}: `
        + 'it lands exactly as with no save, on the drawing asked for', got, plain.got);
      ok('...nothing swallowed', r.st.warned.length === 0, JSON.stringify(r.st.warned));
    }
  }
  {
    // A jump to his own work on a sheet whose Newest is a reissue: a save
    // while the sheet decodes lands on his own drawing, where the item is
    // painted -- his zoom, centred (the jump's own zoom on the item and its
    // selection are given up to the re-read, as before this round).
    const item = { _uid: 'own', type: 'count', points: [[3000, 2000], [3100, 2050]], rev_id: '' };
    const jump = r => { r.st.jumped = null; r.env.selectItem(item, 1); return r.st.jumped; };
    const plain = await landThenSave(jump, { save: false });
    eq('(a jump to his own work on a sheet whose Newest is a reissue, no save: his own drawing, zoomed on the item, selected)',
      [plain.got.page, plain.got.rev, [...plain.r.c.selected], close(plain.r.vp.toPage(512, 352)[0], 3050, 1e-9, 1e-6)],
      [1, '', ['own'], true]);
    for (const saveFirst of [false, true]) {
      const { r, got } = await landThenSave(jump, { save: true, saveFirst });
      eq(`a jump to his own work, a save while its sheet decodes${saveFirst ? ' (the re-read decoded first)' : ''}: `
        + 'his own drawing up (the item painted), not the Newest', [got.page, got.up, got.rev], [1, 1, '']);
      ok('...at his zoom, centred, nothing swallowed', centred(r) && r.st.warned.length === 0, JSON.stringify(r.st.warned));
    }
  }
}
{
  // The wiring, by text: the doors.
  const gp = fnText('goToPage') || '';
  ok('goToPage asks below_fit_by_choice of the sheet being LEFT -- the drawing still up -- as it lands under its own ticket',
    /if \(ticket !== pageTicket\) return;[^\n]*\n\n(\s*\/\/[^\n]*\n)*\s*const chose = how === 'turn' && \(leftChose \?\? leftByChoice\(\)\);\n\s*pageImage = decoded;\n\s*shownPage = index;\n\s*landedJob = jobNow\(\);[\s\S]*zoomFloor\.turned\(chose\)/.test(gp));
  // 'This sheet' is one question, asked in one place: he is on it AND its
  // drawing is up (onSheetUp) -- either alone was wrong while a turn decodes.
  const one = fnText('onSheetUp') || '';
  ok('onSheetUp asks both the drawing up and app.currentPage',
    /return sheetUp\(\) === index && app\.currentPage === index;/.test(one), one);
  ok('...and how the sheet comes up is asked of it, not of app.currentPage or the drawing alone',
    /const how = viewOf\(index, view\);/.test(gp) && !/app\.currentPage !== index \? 'turn'/.test(gp)
    && /view === 'turn' \|\| !onSheetUp\(index\) \? 'turn' : 'keep'/.test(fnText('viewOf') || ''));
  ok('the Items list: a row on another sheet than the one he is on, up, is a jump, zoomed on its item',
    /pageIdx !== STANDALONE_PAGE && !onSheetUp\(pageIdx\)\) \{ void jumpToItem\(m, pageIdx\); return; \}/.test(SELECT_ITEM || ''));
  ok('...and so is Zoom to item from a row\'s menu', /const elsewhere = !onSheetUp\(at\)\n/.test(ITEM_FN || ''));
  eq('nothing else asks sheetUp() alone whether a sheet is this one', [...MAIN.matchAll(/sheetUp\(\)/g)].length, 2);
  ok('the zoom floor\'s sheet is the one whose drawing is up', /page: \(\) => shownPage,/.test(BUILD || ''));
  const del = fnText('deleteCurrentPage') || '';
  ok('deleteCurrentPage: asked before the sheet goes, landed as a turn',
    /const chose = leftByChoice\(\);[\s\S]*app\.pages\.removePage\(idx\);[\s\S]*pageImage = null;\n\s*await goToPage\([^\n]*, \{ view: 'turn', chose \}\);/.test(del));
  ok('the turn doors all go through goToPage: the arrows, the keys, the thumbnails, a callout\'s sheet',
    /case 'prev-page': goToPage\(app\.currentPage - 1\); break;/.test(MAIN) && /case 'next-page': goToPage\(app\.currentPage \+ 1\); break;/.test(MAIN)
    && /onPick: idx => goToPage\(idx, \{ view: 'turn' \}\),/.test(MAIN)
    && /goToSheet: i => \{ void goToPage\(i, \{ view: 'turn' \}\); \},/.test(MAIN)
    && /return goToPage\(next\);/.test(fnText('stepSheet') || ''));
}
{
  // A row on THIS sheet whose item is on another drawing of it: a flip, not
  // a turn -- the view he has is kept, his drag included (no settle).
  const r = rig({ canvas: IPAD, pages: [SHEET, SHEET], revs: { 0: [['r1', [3400, 2200]]] } }, { touch: true });
  r.env.pageImage = null;
  await r.env.goToPage(0, { version: '' });
  r.vp.panBy(120, -50);
  const before = r.pan();
  r.env.selectItem({ _uid: 'k', type: 'count', points: [[3600, 2400], [3700, 2450]], rev_id: 'r1' }, 0);
  for (let k = 0; k < 5; k += 1) await tick();
  eq('a row on this sheet, its item on a reissue of it: the reissue up, his place on the sheet kept, nothing settled',
    [r.env.versionView.revId, close(r.pan()[0], before[0], 1e-9, 1e-6) && close(r.pan()[1], before[1], 1e-9, 1e-6)],
    ['r1', true]);
}
{
  // An item filed under a sheet the set does not have: goToPage refuses
  // it, and the jump zooms nothing on the sheet that is up.
  const r = rig({ canvas: IPAD, pages: [SHEET, SHEET] }, { touch: true });
  r.env.pageImage = null;
  await r.env.goToPage(0);
  const v = r.vp.serialize();
  r.st.jumped = null;
  r.env.selectItem({ _uid: 'z', type: 'count', points: [[100, 100], [150, 120]] }, 7);
  await r.st.jumped;
  eq('a jump to a sheet the set does not have: the sheet up is left as it was', [r.st.page, r.vp.serialize()], [0, v]);
}
{
  // A job opening with no canvas to land in: parked, then the default zoom
  // AND the settle on the first frame with one -- a sheet smaller than the
  // screen at 100% raised to its Fit, as the desktop's load does.
  const r = rig({ canvas: [1600, 900], pages: [[500, 300], SHEET], settings: { default_zoom_mode: '100' } });
  r.resize(0, 0);
  r.env.pageImage = null;
  await r.env.goToPage(0);
  ok('(parked: the open had no canvas)', r.env.pendingFit === true);
  r.resize(1600, 900);
  r.env.parked();
  eq('...the first frame with one: 100% would show it smaller than the screen, so it is raised, his zoom 100%',
    [r.zf.showsFit(), r.zf.raise !== null, r.zf.base, r.env.pendingFit], [true, true, 1, false]);
  await r.env.goToPage(1);
  eq('...and the big sheet after it at 100%, centred', [r.vp.zoom, centred(r)], [1, true]);
}
{
  // A turn parked for want of a canvas belongs to the sheet it was for: a
  // job opened after it (at Fit Width, its top in view) is not settled by it.
  const r = rig({ canvas: [1600, 900], pages: [SHEET, SHEET], settings: { default_zoom_mode: 'width' } });
  r.env.pageImage = null;
  await r.env.goToPage(0);
  r.resize(0, 0);
  await r.env.goToPage(1);
  ok('(a turn parked)', r.env.pendingTurn !== null);
  r.env.app.pages.file = { another: true };   // another job opens, still with no canvas
  r.env.pageImage = null;
  await r.env.goToPage(0);
  r.resize(1600, 900);
  r.env.parked();
  const z = (1600 - 32) / SHEET[0];
  ok('the job opened after a parked turn: at Fit Width, its top in view -- the old turn did not centre it',
    close(r.vp.zoom, z) && close(r.vp.origin.y, -16 / z, 1e-12, 1e-9) && r.env.pendingTurn === null,
    JSON.stringify([r.vp.zoom / z, r.vp.origin, r.env.pendingTurn]));
}

// ── while the next sheet decodes ─────────────────────────────────────────
// The drawing up is still the last sheet's for as long as the next one takes
// to read -- seconds on the iPad. What he does in that window is done on the
// drawing up (shownPage), not on app.currentPage, which the turn already
// moved: a second tap, a row clicked twice, a zoom, a mark. But the sheet up
// is no longer the sheet he is on: a turn back to it, or a row on it, is a
// turn, not a 'keep' (onSheetUp asks both).
const SMALL_PAPER = [3400, 2200];
const fitOn = (r, s) => Math.min((r.vp.width - 32) / s[0], (r.vp.height - 32) / s[1]);
/** A touch rig on the iPad, the job open on its first sheet. */
async function opened(pages, opts = {}) {
  const r = rig({ canvas: IPAD, pages, ...opts }, { touch: true });
  r.env.pageImage = null;
  await r.env.goToPage(0);
  return r;
}
/** Start `fn` with every sheet decode it asks for held; returns the release of them all, oldest first. */
function holding(r, fn) {
  r.env.holdPage = true;
  r.st.held = [];
  const out = fn();
  r.env.holdPage = false;
  return { out, release: () => { for (const f of r.st.held.splice(0)) f(); } };
}
{
  // A card tapped twice while its sheet decodes (F1): the second tap is the
  // same turn, centred and settled -- it was a 'keep' that cancelled the
  // first, and left the small sheet at the big one's Fit, off centre.
  const r = await opened([SHEET, SMALL_PAPER, SHEET]);
  const h = holding(r, () => [r.env.pickCard(1), r.env.pickCard(1)]);
  h.release();
  await Promise.all(h.out);
  eq('a card tapped twice while its sheet decodes, at Fit: that sheet at its own Fit, centred, "Fit N%"',
    [r.st.page, r.vp.zoom === fitOn(r, SMALL_PAPER), r.zf.showsFit(), /^Fit /.test(r.zf.label())], [1, true, true, true]);
  r.wheel(512, 352, -120);
  eq('...so a notch out there is refused at Fit, not taken', r.vp.zoom === fitOn(r, SMALL_PAPER), true);
}
{
  // Next, then that sheet's card while it decodes: the small sheet raised.
  const r = await opened([SHEET, SMALL_PAPER, SHEET]);
  r.wheel(512, 352, 120);
  const his = r.vp.zoom;
  const h = holding(r, () => [r.env.stepSheet(1), r.env.pickCard(1)]);
  h.release();
  await Promise.all(h.out);
  eq('Next, then that sheet\'s card while it decodes: raised to its Fit, centred, his zoom kept aside',
    [r.st.page, r.zf.showsFit(), r.zf.raise !== null, r.zf.base === his], [1, true, true, true]);
}
{
  // ...and onto paper of the same size, zoomed in and dragged aside: centred.
  const r = await opened([SHEET, SHEET]);
  r.wheel(512, 352, 120);
  r.wheel(512, 352, 120);
  r.vp.panBy(-400, -300);
  const his = r.vp.zoom;
  const h = holding(r, () => [r.env.pickCard(1), r.env.pickCard(1)]);
  h.release();
  await Promise.all(h.out);
  eq('a card tapped twice, zoomed in and dragged aside: the sheet at his zoom, centred',
    [r.st.page, r.vp.zoom === his, centred(r)], [1, true, true]);
}
{
  // An Items row clicked twice (a double click) while its item's sheet
  // decodes (F2): the second click is the same jump, ending on the item. It
  // took the same-sheet branch -- a 'keep', the old view, no zoom on it.
  const item = { _uid: 'd', type: 'count', points: [[1600, 1000], [1700, 1060]] };
  const want = Math.min((IPAD[0] - 32) / Math.max(100 * 1.8, SMALL_PAPER[0] * 0.12),
    (IPAD[1] - 32) / Math.max(60 * 1.8, SMALL_PAPER[1] * 0.12), 8);
  const onItem = r => [close(r.vp.zoom, want), close(r.vp.toPage(512, 352)[0], 1650, 1e-9, 1e-6),
    close(r.vp.toPage(512, 352)[1], 1030, 1e-9, 1e-6), [...r.c.selected]];
  {
    const r = await opened([SHEET, SMALL_PAPER, SHEET]);
    r.wheel(512, 352, 120);
    const h = holding(r, () => {
      r.env.selectItem(item, 1);
      const a = r.st.jumped;
      r.env.selectItem(item, 1);
      return [a, r.st.jumped];
    });
    h.release();
    await Promise.all(h.out);
    eq('a row double-clicked while its item\'s sheet decodes: turned to, zoomed and centred on the item, selected',
      [r.st.page, ...onItem(r)], [1, true, true, true, ['d']]);
  }
  {
    const r = await opened([SHEET, SMALL_PAPER, SHEET]);
    const h = holding(r, () => {
      const a = r.env.stepSheet(1);
      r.env.selectItem(item, 1);
      return [a, r.st.jumped];
    });
    h.release();
    await Promise.all(h.out);
    eq('Next, then a row on that sheet while it decodes: zoomed and centred on the item',
      [r.st.page, ...onItem(r)], [1, true, true, true, ['d']]);
  }
}
{
  // A turn made while nothing is up is a turn, not a job opening (F3): his
  // zoom, Shift past Fit included, is not thrown away for the default zoom.
  const SHEETS = [SHEET, SHEET, SHEET, SHEET];
  {
    // ...during a delete's landing decode.
    const pages = SHEETS.slice();
    const r = rig({ canvas: IPAD, pages }, { touch: true });
    Object.assign(r.env, {
      D: { alertDialog: async () => {}, confirmDialog: async () => true },
      isTakeoffItem: () => true, takeoffQuantityWords: () => '',
      countingModel: () => ({ countedQuantities: () => ({}) }), takeoffMoveWords: () => '',
      sayPrice() {}, calloutPreview: { clearCache() {} }, hiddenTakeoffsWords, takeoffNaming,
    });
    r.env.thumbs.refresh = () => {};
    r.env.app.pages.removePage = i => { pages.splice(i, 1); };
    r.env.app.project.notePageRemoved = () => {};
    liftMain(['deleteCurrentPage'], r.env);
    r.env.pageImage = null;
    await r.env.goToPage(0);
    await r.env.goToPage(1);
    r.wheel(512, 352, -120, 0, true);
    const past = r.vp.zoom;
    r.env.holdPage = true;
    r.st.held = [];
    const gone = r.env.deleteCurrentPage();
    while (!r.st.held.length) await tick();
    r.env.holdPage = false;
    ok('(the sheet after the deleted one still decoding, nothing up)', r.env.pageImage === null);
    await r.env.stepSheet(1);
    for (const f of r.st.held.splice(0)) f();
    await gone;
    eq('Page Down while a deleted sheet\'s neighbour decodes: his zoom Shift took past Fit, centred, still past Fit',
      [r.st.page, r.vp.zoom === past, r.zf.pastFit, centred(r)], [2, true, true, true]);
  }
  {
    // ...past a sheet that would not decode.
    const r = await opened(SHEETS.slice());
    r.wheel(512, 352, -120, 0, true);
    const past = r.vp.zoom;
    r.env.failPage = 1;
    await r.env.stepSheet(1);
    ok('(that sheet could not be opened: nothing up)', r.env.pageImage === null
      && /^Could not open sheet 2/.test(r.st.said.at(-1) || ''), r.st.said.at(-1));
    r.env.failPage = -1;
    await r.env.stepSheet(1);
    eq('Page Down past a sheet that would not decode: his zoom Shift took past Fit, centred, still past Fit',
      [r.st.page, r.vp.zoom === past, r.zf.pastFit, centred(r)], [2, true, true, true]);
  }
  {
    const r = await opened(SHEETS.slice());
    r.wheel(512, 352, 120);
    r.wheel(512, 352, 120);
    const his = r.vp.zoom;
    r.env.failPage = 1;
    await r.env.stepSheet(1);
    r.env.failPage = -1;
    await r.env.stepSheet(1);
    eq('...and zoomed in: his zoom, not the default zoom', [r.st.page, r.vp.zoom === his, r.zf.baseFit, centred(r)],
      [2, true, false, true]);
  }
}
{
  // A zoom made on the drawing up while the next sheet decodes is his
  // choice, asked as the turn lands (F4).
  {
    const r = await opened([SHEET, SMALL_PAPER, SHEET]);
    const h = holding(r, () => r.env.stepSheet(1));
    r.wheel(512, 352, -120, 0, true);
    const past = r.vp.zoom;
    ok('(Shift past Fit on the sheet still up)', past < fitOn(r, SHEET) && r.st.page === 1);
    h.release();
    await h.out;
    eq('Shift past Fit while the small sheet decodes: it comes up at that zoom, centred, not raised, still past Fit',
      [r.vp.zoom === past, centred(r), r.zf.raise, r.zf.pastFit], [true, true, null, true]);
    await r.env.stepSheet(1);
    eq('...and the big sheet after it at that zoom too (not the small sheet\'s Fit)',
      [r.st.page, r.vp.zoom === past, r.zf.pastFit], [2, true, true]);
  }
  {
    // ...a fresh pinch from Fit, the touch Shift.
    const r = await opened([SHEET, SMALL_PAPER, SHEET]);
    const h = holding(r, () => r.env.stepSheet(1));
    const f = hand(r).down(512, 352, 300);
    for (let d = 280; d >= 140; d -= 20) f.to(d);
    f.up();
    const past = r.vp.zoom;
    ok('(a fresh pinch from Fit went past it on the sheet still up)', past < fitOn(r, SHEET) * 0.7 && r.zf.pastFit);
    h.release();
    await h.out;
    eq('a fresh pinch past Fit while the small sheet decodes: kept there, not raised to its Fit',
      [r.vp.zoom === past, r.zf.raise, r.zf.pastFit], [true, null, true]);
    await r.env.stepSheet(1);
    ok('...and the big sheet after it at his zoom, not the small sheet\'s Fit', r.vp.zoom === past && centred(r),
      String(r.vp.zoom / past));
  }
  {
    // A notch in and out on a raised sheet while the next one decodes: his
    // zoom back (isTurnRaise asks the sheet up), so the next big sheet has it.
    const r = await opened([SHEET, SMALL_PAPER, SHEET]);
    r.wheel(512, 352, 120);
    const his = r.vp.zoom;
    await r.env.stepSheet(1);
    ok('(the small sheet raised)', r.zf.raise !== null && r.zf.showsFit());
    const h = holding(r, () => r.env.stepSheet(1));
    r.wheel(512, 352, 120);
    r.wheel(512, 352, -120);
    eq('a notch in and out on the raised sheet while the next decodes: his zoom again, a number',
      [r.zf.base === his, r.zf.baseFit], [true, false]);
    h.release();
    await h.out;
    eq('...so the big sheet after it comes up at his zoom, centred', [r.st.page, r.vp.zoom === his, centred(r)],
      [2, true, true]);
  }
}
{
  // The sheet on screen picked again (its card, a callout to it): centred and
  // settled again, as the desktop's go_to_page does (F5; the differential has
  // it too) -- while a row on this sheet, which flips at most, keeps the view.
  const r = await opened([SHEET, SMALL_PAPER]);
  r.wheel(512, 352, 120);
  r.vp.panBy(150, 80);
  const his = r.vp.zoom;
  await r.env.pickCard(0);
  eq('the card of the sheet on screen: centred at his zoom', [r.st.page, r.vp.zoom === his, centred(r)], [0, true, true]);
  r.vp.panBy(150, 80);
  const before = r.pan();
  r.env.selectItem({ _uid: 'h', type: 'count', points: [[3600, 2400], [3700, 2450]] }, 0);
  for (let k = 0; k < 5; k += 1) await tick();
  ok('...a row on it: the view he has', close(r.pan()[0], before[0], 1e-9, 1e-6) && close(r.pan()[1], before[1], 1e-9, 1e-6));
}
{
  // Zoom to item from a row's menu, the item traced on a reissue of the
  // sheet up: that drawing put up first, as a click on the row puts it up --
  // it was zoomed to on the sheet's own drawing, where it is not painted.
  const pts = [[1000, 700], [1200, 800]];
  const want = Math.min((IPAD[0] - 32) / Math.max(200 * 1.8, SMALL_PAPER[0] * 0.12),
    (IPAD[1] - 32) / Math.max(100 * 1.8, SMALL_PAPER[1] * 0.12), 8);
  const r = rig({ canvas: IPAD, pages: [SHEET, SHEET], revs: { 0: [['r1', SMALL_PAPER]] } }, { touch: true });
  r.env.pageImage = null;
  await r.env.goToPage(0, { version: '' });
  r.env.itemAt = () => ({ pageKey: 0 });
  r.env.from = 'list';
  r.st.jumped = null;
  r.item(pts, 'count', { _uid: 'q', rev_id: 'r1' });
  await r.st.jumped;
  eq('Zoom to item from a row, its item on a reissue of the sheet up: the reissue up, zoomed and centred on the item',
    [r.env.versionView.revId, close(r.vp.zoom, want), close(r.vp.toPage(512, 352)[0], 1100, 1e-9, 1e-6), [...r.c.selected]],
    ['r1', true, true, ['q']]);
  r.env.from = 'canvas';
  await r.env.showSheetVersion(0, '', { announce: false });
  r.st.jumped = null;
  r.item(pts, 'count', { _uid: 'q', rev_id: 'r1' });
  eq('...from the drawing, what was pressed is on the drawing up: no flip', [r.st.jumped, r.env.versionView.revId], [null, '']);
}
{
  // Past Fit by choice, then a turn onto a sheet whose newest drawing is on
  // smaller paper: kept there too -- the second settle, for the reissue,
  // is asked with the turn's `chose` (the differential has it as well).
  const r = await opened([SHEET, SHEET], { revs: { 1: [['r1', SMALL_PAPER]] } });
  r.wheel(512, 352, -120, 0, true);
  const past = r.vp.zoom;
  await r.env.stepSheet(1);
  eq('Shift past Fit, then a sheet whose newest drawing is smaller paper: the reissue up at that zoom, not raised',
    [r.env.versionView.revId, r.vp.zoom === past, r.zf.raise, r.zf.pastFit], ['r1', true, null, true]);
}
{
  // Nothing is drawn on the last sheet's drawing while the next one decodes
  // (F7): a stroke there was filed under the NEW sheet, at the old drawing's
  // place. Looking goes on: Pan pans.
  const r = await opened([SHEET, SMALL_PAPER]);
  r.c.addEventListener('status', e => r.st.said.push(e.detail.text));
  r.c.readOnly = false;
  r.c.setMode('draw');
  const ev = (type, x, y) => ({ pointerId: 7, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1,
    clientX: x, clientY: y, type, preventDefault() {}, stopPropagation() {}, shiftKey: false, ctrlKey: false,
    metaKey: false, altKey: false, detail: 1 });
  const stroke = () => {
    r.on.pointerdown(ev('pointerdown', 300, 300));
    for (let k = 1; k <= 6; k += 1) r.on.pointermove(ev('pointermove', 300 + 20 * k, 300 + 10 * k));
    r.on.pointerup(ev('pointerup', 420, 360));
  };
  const filed = () => Object.fromEntries(Object.entries(r.c.project.annotations || {})
    .filter(([, v]) => v.length).map(([k, v]) => [k, v.length]));
  const h = holding(r, () => r.env.stepSheet(1));
  stroke();
  eq('a stroke drawn on the last sheet\'s drawing while the next decodes: filed nowhere, and he is told why',
    [filed(), r.st.said.at(-1)], [{}, 'X1 is still opening — draw on it once it is on screen']);
  r.c.setMode('pan');
  const o = { ...r.vp.origin };
  r.on.pointerdown(ev('pointerdown', 300, 300));
  r.on.pointermove(ev('pointermove', 360, 330));
  r.on.pointerup(ev('pointerup', 360, 330));
  ok('...a drag in Pan still pans the drawing up', r.vp.origin.x !== o.x && r.vp.origin.y !== o.y);
  h.release();
  await h.out;
  r.c.setMode('draw');
  stroke();
  eq('...and once the sheet is up, the stroke is its', filed(), { 1: 1 });
}
{
  // Page Down, then back before the next sheet is up: a turn back, centred
  // at his zoom -- the desktop's prev_page, and what the same keys give
  // when the decode is quick. It was a 'keep' (the drawing up is the sheet
  // he went back to), left where he had dragged it, while the card of that
  // sheet centred it. The keys (stepSheet) and runAction's own page cases
  // (the arrows, the mobile bar), the box on and off, either decode done
  // first. (The differential runs the desktop's next_page / prev_page on it.)
  const PAGE_CASES = between("    case 'prev-page':", "    case 'next-page':");
  ok('(runAction\'s page cases, word for word)', /goToPage\(app\.currentPage - 1\)[\s\S]*goToPage\(app\.currentPage \+ 1\)/
    .test(PAGE_CASES || ''), PAGE_CASES);
  /** Sheet `pages`, zoomed in two notches and dragged aside; `turn` then `back` with every decode held. */
  async function andBack(pages, { box = true, keys = true, backFirst = false, before } = {}) {
    const r = await opened(pages, { settings: { zoom_out_stops_at_fit: box } });
    r.wheel(512, 352, 120);
    r.wheel(512, 352, 120);
    const his = r.vp.zoom;
    await before?.(r);
    r.vp.panBy(150, 80);
    const turns = [];
    const go = r.env.goToPage;
    r.env.goToPage = (...a) => { const p = go(...a); turns.push(p); return p; };
    // eslint-disable-next-line no-new-func
    const arrow = new Function('env', `with (env) { return function arrow(a) { switch (a) {\n${PAGE_CASES}\n} }; }`)(r.env);
    r.env.holdPage = true;
    r.st.held = [];
    if (keys) { r.env.stepSheet(1); r.env.stepSheet(-1); } else { arrow('next-page'); arrow('prev-page'); }
    r.env.holdPage = false;
    const held = r.st.held.splice(0);
    ok('(both decodes held: the turn and the turn back)', held.length === 2 && turns.length === 2);
    for (const f of backFirst ? held.reverse() : held) f();
    await Promise.all(turns);
    return { r, his };
  }
  for (const box of [true, false]) {
    for (const keys of [true, false]) {
      for (const backFirst of [false, true]) {
        const { r, his } = await andBack([SHEET, SHEET, SHEET], { box, keys, backFirst });
        eq(`the box ${box ? 'on' : 'off'}: ${keys ? 'Page Down then Page Up' : 'the next arrow then the back arrow'} `
          + `before the next sheet is up${backFirst ? ' (the sheet left decoding first)' : ''}: back at his zoom, centred`,
        [r.st.page, r.vp.zoom === his, centred(r)], [0, true, true]);
      }
    }
  }
  {
    // ...from a small sheet raised to its Fit: raised again, centred, his zoom kept aside.
    const { r, his } = await andBack([SHEET, SMALL_PAPER, SHEET], { before: r => r.env.stepSheet(1) });
    eq('Page Down then Page Up before the next sheet is up, from a small sheet raised: raised again, centred',
      [r.st.page, r.zf.showsFit(), r.zf.raise !== null, r.zf.base === his, centred(r)], [1, true, true, true, true]);
  }
}
{
  // An item on the sheet being LEFT, while the next one decodes: a row
  // clicked, and Zoom to item from a row's menu, are each a jump back to it,
  // zoomed and centred on the item, selected, the zoom a number -- what a
  // quick decode gives, and the desktop's _on_item_activated (current_page
  // already the next; the differential runs it). The row took the 'this
  // sheet' path (the old zoom, nothing zoomed on), and the menu zoomed on
  // the drawing still up, the turn going on: the next sheet came up at the
  // item's zoom, centred on its middle, the item not there.
  const pts = [[5000, 3000], [5400, 3300]];
  const want = Math.min((IPAD[0] - 32) / Math.max(400 * 1.8, SHEET[0] * 0.12),
    (IPAD[1] - 32) / Math.max(300 * 1.8, SHEET[1] * 0.12), 8);
  const onItem = (r, id) => [r.st.page, close(r.vp.zoom, want), close(r.vp.toPage(512, 352)[0], 5200, 1e-9, 1e-6),
    close(r.vp.toPage(512, 352)[1], 3150, 1e-9, 1e-6), [...r.c.selected], r.zf.baseFit, r.zf.base === r.vp.zoom];
  for (const via of ['a row clicked', 'Zoom to item from a row\'s menu']) {
    const got = {};
    for (const held of [false, true]) {
      const r = await opened([SHEET, SHEET]);
      r.env.itemAt = () => ({ pageKey: 0 });
      r.env.from = 'list';
      r.st.jumped = null;
      const h = held ? holding(r, () => r.env.stepSheet(1)) : null;
      if (!held) await r.env.stepSheet(1);
      if (via === 'a row clicked') r.env.selectItem({ _uid: 'w', type: 'count', points: pts, rev_id: '' }, 0);
      else r.item(pts, 'count', { _uid: 'w', rev_id: '' });
      h?.release();
      await h?.out;
      await r.st.jumped;
      for (let k = 0; k < 5; k += 1) await tick();
      got[held] = onItem(r, 'w');
    }
    eq(`${via}, its item on the sheet just left, quick decode: back on it, zoomed and centred on the item, a number`,
      got.false, [0, true, true, true, ['w'], false, true]);
    eq(`...and the same while the next sheet is still decoding (${via})`, got.true, got.false);
  }
}
{
  // A pinch in a takeoff or markup tool while the next sheet decodes is
  // looking: it zooms, and nothing is said -- its first finger's press was
  // refused with 'draw on it once it is on screen'. A finger that is not a
  // pinch is refused on its lift, and told why; nothing goes on the drawing
  // up. Through the controller's own pointer handlers, touch events.
  const r = await opened([SHEET, SMALL_PAPER]);
  r.c.addEventListener('status', e => r.st.said.push(e.detail.text));
  r.c.readOnly = false;
  const taps = [];
  r.c._collectPoint = (ev, pt) => { taps.push(pt); };
  const filed = () => Object.fromEntries(Object.entries(r.c.project.annotations || {})
    .filter(([, v]) => v.length).map(([k, v]) => [k, v.length]));
  const WHY = 'X1 is still opening — draw on it once it is on screen';
  const pinchOut = () => {
    const f = hand(r, [21, 22]).down(512, 352, 200);
    for (let d = 220; d <= 400; d += 20) f.to(d);
    f.up();
  };
  const stroke = id => {
    r.finger('pointerdown', id, 300, 300);
    for (let k = 1; k <= 6; k += 1) r.finger('pointermove', id, 300 + 20 * k, 300 + 10 * k);
    r.finger('pointerup', id, 420, 360);
  };
  await r.c.setMode('count', { ask: false });
  const h = holding(r, () => r.env.stepSheet(1));
  for (const mode of ['count', 'draw']) {
    await r.c.setMode(mode, { ask: false });
    r.st.said.length = 0;
    const z0 = r.vp.zoom;
    pinchOut();
    eq(`a pinch in ${mode === 'count' ? 'Count' : 'Draw'} while the next sheet decodes: it zooms, and nothing is said`,
      [r.vp.zoom > z0 * 1.5, r.st.said], [true, []]);
  }
  await r.c.setMode('count', { ask: false });
  r.st.said.length = 0;
  r.finger('pointerdown', 5, 300, 300);
  eq('...a finger down in Count says nothing yet (it may be the first of a pinch)', r.st.said, []);
  r.finger('pointerup', 5, 300, 300);
  eq('...lifted, a tap: nothing counted, and he is told why', [taps.length, r.st.said], [0, [WHY]]);
  await r.c.setMode('draw', { ask: false });
  r.st.said.length = 0;
  stroke(6);
  eq('...a finger stroke in Draw: filed nowhere, and he is told why, once', [filed(), r.st.said], [{}, [WHY]]);
  r.st.said.length = 0;
  r.finger('pointerdown', 8, 300, 300);
  r.on.pointercancel({ pointerId: 8, pointerType: 'touch', button: 0, clientX: 300, clientY: 300, type: 'pointercancel',
    preventDefault() {}, shiftKey: false, ctrlKey: false, metaKey: false });
  eq('...a finger the browser took back (pointercancel): nothing said', r.st.said, []);
  h.release();
  await h.out;
  r.st.said.length = 0;
  stroke(9);
  eq('...and once the sheet is up, the finger\'s stroke is its, nothing said', [filed(), r.st.said], [{ 1: 1 }, []]);
  await r.c.setMode('count', { ask: false });
  r.finger('pointerdown', 10, 300, 300);
  r.finger('pointerup', 10, 300, 300);
  eq('...and a tap in Count is a tap', taps.length, 1);
}
{
  // A finger already down on the sheet when he turns (the foot bar's Next
  // with the other hand, Page Down), lifted after: nothing it began is done
  // on the sheet turned to. The press refusal covers only a press made while
  // the next sheet opens; a finger that was down before the turn got its
  // point on the lift -- on the sheet turned to, from the last sheet's view
  // while it opened, under the finger once it was up -- and the job turned
  // dirty. Through the controller's own pointer handlers, touch events; the
  // turn is stepSheet's (Page Down), its decode held or let through.
  const { LONG_PRESS_MS } = await import('../js/tools/controller.js');
  const WHY = 'X1 is still opening — draw on it once it is on screen';
  const make = async () => {
    const r = await opened([SHEET, SMALL_PAPER]);
    r.c.addEventListener('status', e => r.st.said.push(e.detail.text));
    r.c.readOnly = false;
    return r;
  };
  /** Page Down with the finger down: the next sheet still opening, or (landed) up. */
  const turnUnder = async (r, landed) => {
    const h = holding(r, () => r.env.stepSheet(1));
    if (landed) { h.release(); await h.out; }
    return async () => { if (!landed) { h.release(); await h.out; } };
  };
  const counted = p => Object.fromEntries(Object.entries(p.measurements).filter(([, v]) => v.length)
    .map(([k, v]) => [k, v.length]));
  for (const landed of [false, true]) {
    // A tap in Count, the count named: the real tool, so what it would file is filed.
    const r = await make();
    await r.c.setMode('count', { ask: false });
    r.c.options.pendingName = 'Outlet';
    r.c.project.markSaved();
    r.st.said.length = 0;
    r.finger('pointerdown', 31, 300, 300);
    const done = await turnUnder(r, landed);
    r.finger('pointerup', 31, 303, 302);
    eq(`a finger down in Count, Page Down, the lift a tap ${landed ? 'once the next sheet is up' : 'while it opens'}: `
      + `nothing counted, the job not dirty, ${landed ? 'nothing said' : 'and he is told why'}`,
    [counted(r.c.project), r.c.project.dirty, r.st.said], [{}, false, landed ? [] : [WHY]]);
    await done();
    r.st.said.length = 0;
    r.finger('pointerdown', 32, 300, 300);
    r.finger('pointerup', 32, 300, 300);
    eq('...and the next tap, on the sheet up, counts there, nothing said', [counted(r.c.project), r.st.said], [{ 1: 1 }, []]);
  }
  for (const landed of [false, true]) {
    // An area being traced: the turn put it down (controller.cancel); the
    // lift does not begin another on the sheet turned to.
    const r = await make();
    await r.c.setMode('area', { ask: false });
    for (const [x, y] of [[200, 200], [400, 200]]) { r.finger('pointerdown', 40, x, y); r.finger('pointerup', 40, x, y); }
    const had = r.c.current.length;
    r.finger('pointerdown', 41, 400, 400);
    const done = await turnUnder(r, landed);
    r.finger('pointerup', 41, 400, 400);
    eq(`an area with 2 points, a finger down, Page Down, the lift ${landed ? 'once the next sheet is up' : 'while it opens'}: `
      + 'no point begins a chain there', [had, r.c.current.length, r.c.chainLive], [2, 0, false]);
    await done();
  }
  {
    // A finger held in Pan is the item menu (the long press): held across a
    // turn it opens none -- not on the sheet turned to, under the finger,
    // and it is not refused out loud either: the finger is panning.
    const fire = [];
    const realSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (f, ms, ...a) => (ms === LONG_PRESS_MS ? (fire.push(f), 0) : realSetTimeout(f, ms, ...a));
    try {
      for (const when of ['no turn', 'while the next sheet opens', 'once it is up']) {
        const r = await make();
        await r.c.setMode('pan');
        const menus = [];
        r.c._onRightClick = at => { menus.push([at.clientX, at.clientY]); };
        r.st.said.length = 0;
        fire.length = 0;
        r.finger('pointerdown', 50, 300, 300);
        const done = when === 'no turn' ? async () => {} : await turnUnder(r, when === 'once it is up');
        const timers = fire.splice(0);
        for (const f of timers) f();          // the hold's time is up, the finger still down
        r.finger('pointerup', 50, 300, 300);
        await done();
        eq(`a finger held in Pan, ${when}: ${when === 'no turn' ? 'the menu' : 'no menu, nothing said'}`,
          [timers.length, menus, r.st.said], [1, when === 'no turn' ? [[300, 300]] : [], []]);
      }
    } finally {
      globalThis.setTimeout = realSetTimeout;
    }
  }
  for (const turned of [false, true]) {
    // A callout bubble pressed in Pan: read on the lift -- not once he has
    // turned from its sheet.
    const r = await make();
    await r.c.setMode('pan');
    const bubble = { _uid: 'cb', type: 'page_ref', points: [[100, 100]] };
    r.c.hitTest = () => ({ item: bubble, vertexIndex: -1 });
    const read = [];
    r.c.addEventListener('callout-activated', e => read.push(e.detail.item._uid));
    r.finger('pointerdown', 60, 300, 300);
    const done = turned ? await turnUnder(r, false) : async () => {};
    r.finger('pointerup', 60, 300, 300);
    await done();
    eq(`a callout bubble pressed in Pan, ${turned ? 'Page Down, then' : 'then'} the lift: ${turned ? 'nothing opens' : 'its preview opens'}`,
      read, turned ? [] : ['cb']);
  }
  {
    // An eraser sweep cut short by the turn: what it took off is gone, and
    // is its own undo level -- its lift found nothing drawing, so it had
    // none, and the next Ctrl+Z took the edit before it as well.
    const r = await make();
    const p = r.c.project;
    const at = r.vp.toPage(300, 300);
    p.addAnnotation(0, { points: [[at[0] - 400, at[1]], [at[0] + 400, at[1]]], color: [1, 0, 0], width: 4 }, { label: 'Draw' });
    await r.c.setMode('erase');
    r.finger('pointerdown', 70, 300, 300);
    const gone = (p.annotations[0] || []).length === 0;
    const done = await turnUnder(r, false);
    r.finger('pointermove', 70, 330, 300);
    r.finger('pointerup', 70, 330, 300);
    await done();
    eq('an eraser sweep, Page Down while the finger is down: the stroke it took is its own undo level',
      [gone, p._undo.map(s => s.label)], [true, ['Draw', 'Erase']]);
    p.undo();
    eq('...and one Ctrl+Z puts that stroke back, and only that', [(p.annotations[0] || []).length, p._undo.map(s => s.label)],
      [1, ['Draw']]);
  }
  // An eraser sweep that ends without its lift -- a second finger lands
  // (the sweep becomes a pinch), the browser takes the gesture
  // (pointercancel) -- is its own undo level there, once, and leaves no
  // picture of the project behind: kept, the next turn filed it again, out
  // of order, and turned a saved job dirty; and the next job opened filed
  // it in THAT job, where one Ctrl+Z put this job's takeoff into it. A
  // sweep still going when another job comes in files nothing there.
  const sweep = async (end, then) => {
    const r = await make();
    const p = r.c.project;
    const at = r.vp.toPage(300, 300);
    p.addAnnotation(0, { points: [[at[0] - 400, at[1]], [at[0] + 400, at[1]]], color: [1, 0, 0], width: 4 }, { label: 'Draw' });
    await r.c.setMode('erase');
    r.finger('pointerdown', 80, 300, 300);
    r.finger('pointermove', 80, 306, 300);
    if (end === 'pinch') {
      r.finger('pointerdown', 81, 460, 420);
      r.finger('pointermove', 80, 280, 280);
      r.finger('pointermove', 81, 500, 460);
      r.finger('pointerup', 80, 280, 280);
      r.finger('pointerup', 81, 500, 460);
    } else if (end === 'cancel') {
      r.finger('pointercancel', 80, 306, 300);
    }
    const mid = [(p.annotations[0] || []).length, p._undo.map(s => s.label)];
    if (then === 'turn') {
      p.markSaved();
      await r.env.stepSheet(1);
    } else {
      // Another job: an open, a draft restore, the portal's hand-over --
      // loadFrom, then its first sheet (goToPage, which puts down whatever
      // is in progress: controller.cancel).
      p.loadFrom({ metadata: { project_name: 'Another' }, annotations: {}, measurements: {}, pageCount: 2 });
      await r.env.goToPage(0, { view: 'open' });
      if (end === 'held') r.finger('pointerup', 80, 306, 300);
    }
    return { mid, undo: p._undo.map(s => s.label), dirty: p.dirty, canUndo: p.canUndo };
  };
  for (const [end, what] of [['pinch', 'a second finger (a pinch)'], ['cancel', 'the browser taking it (pointercancel)']]) {
    const t = await sweep(end, 'turn');
    eq(`an eraser sweep ended by ${what}: what it took off is gone, and its own undo level at once`,
      t.mid, [0, ['Draw', 'Erase']]);
    eq('...the job saved, then Page Down: nothing more filed, the job still saved', [t.undo, t.dirty], [['Draw', 'Erase'], false]);
    const j = await sweep(end, 'job');
    eq(`...ended by ${what}, then another job opened: nothing to undo there, nothing changed`,
      [j.undo, j.canUndo, j.dirty], [[], false, false]);
  }
  {
    const j = await sweep('held', 'job');
    eq('an eraser sweep still going when another job comes in (its first sheet up, then the lift): nothing filed there',
      [j.undo, j.canUndo, j.dirty], [[], false, false]);
  }
  // An eraser sweep with the history moved under it -- Ctrl+Z, or the
  // toolbar's Undo (runAction: app.project.undo()), with the finger or the
  // button still down; on an iPad a second finger on the toolbar, which is
  // no canvas pointer and makes no pinch -- then Ctrl+Y, or the history
  // cleared (a sheet added). The sweep is over there: its first deletion
  // filed its undo level, so the Ctrl+Z takes back exactly what it took off,
  // with its redo kept, and the rest of the sweep takes nothing off the
  // store put back. Filed at the lift, its picture from before the step he
  // took back went over that step: the next Ctrl+Z brought back the stroke
  // he had undone, under 'Erase', and its redo was gone.
  const underSweep = async moved => {
    const r = await make();
    const p = r.c.project;
    const a = r.vp.toPage(300, 300);
    const b = r.vp.toPage(300, 450);
    const line = q => ({ points: [[q[0] - 400, q[1]], [q[0] + 400, q[1]]], color: [1, 0, 0], width: 4 });
    p.addAnnotation(0, line(a), { label: 'Draw' });
    p.addAnnotation(0, line(b), { label: 'Draw' });
    const on = () => (p.annotations[0] || []).map(s => (Math.abs(s.points[0][1] - a[1]) < 1e-6 ? 'A' : 'B')).sort();
    const now = () => [on(), p._undo.map(s => s.label), p._redo.map(s => s.label)];
    await r.c.setMode('erase');
    r.finger('pointerdown', 85, 300, 300);
    r.finger('pointermove', 85, 306, 300);
    const mid = now();
    moved(p);
    const after = now();
    r.finger('pointermove', 85, 330, 300);   // on along A, where the store put back has it
    r.finger('pointermove', 85, 300, 452);   // and across B
    r.finger('pointerup', 85, 300, 452);
    return { p, now, mid, after, lifted: now() };
  };
  {
    const { p, now, mid, after, lifted } = await underSweep(q => q.undo());
    eq('an eraser sweep takes stroke A off: its undo level is filed then, not at the lift', mid, [['B'], ['Draw', 'Draw', 'Erase'], []]);
    eq('...Ctrl+Z with the finger still down takes back the sweep: A back, B kept, its redo kept', after,
      [['A', 'B'], ['Draw', 'Draw'], ['Erase']]);
    eq('...the rest of the sweep, on along A and across B, takes nothing off, and the lift files nothing', lifted, after);
    p.undo();
    eq('...one more Ctrl+Z takes back B, as it would have with no sweep: not A and B back under "Erase", the redo kept',
      now(), [['A'], ['Draw'], ['Erase', 'Draw']]);
    p.redo();
    p.redo();
    eq('...and Ctrl+Y twice: B, then the sweep again', now(), [['B'], ['Draw', 'Draw', 'Erase'], []]);
  }
  {
    const { p, now, lifted } = await underSweep(q => { q.undo(); q.redo(); });
    eq('an eraser sweep, Ctrl+Z then Ctrl+Y with the finger still down: the sweep redone, nothing more taken off or filed',
      lifted, [['B'], ['Draw', 'Draw', 'Erase'], []]);
    p.undo();
    eq('...and one Ctrl+Z puts A back, and only A', now(), [['A', 'B'], ['Draw', 'Draw'], ['Erase']]);
  }
  {
    const { lifted } = await underSweep(q => q.clearHistory('a sheet was added'));
    eq('an eraser sweep, the history cleared under it (a sheet added): nothing filed after it, nothing more taken off',
      lifted, [['B'], [], []]);
  }
  // A RIGHT press with a mouse held across a turn (Page Down with the other
  // hand), released after: no item menu, nothing selected, on the sheet
  // turned to -- the shape under the pointer there was never pressed. While
  // that sheet still opens he is told why, as for a press made then.
  for (const when of ['no turn', 'while the next sheet opens', 'once it is up']) {
    const r = await make();
    await r.c.setMode('pan');
    const wall = { _uid: 'wall', type: 'area', points: [[0, 0], [10, 10]] };
    r.c.hitTest = () => ({ item: wall, vertexIndex: -1 });
    const menus = [];
    r.c.host.showItemMenu = item => { menus.push(item._uid); };
    const mouse = (type, buttons) => ({ pointerId: 90, pointerType: 'mouse', button: 2, buttons, clientX: 300, clientY: 300,
      type, preventDefault() {}, stopPropagation() {}, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, detail: 1 });
    r.st.said.length = 0;
    r.on.pointerdown(mouse('pointerdown', 2));
    const done = when === 'no turn' ? async () => {} : await turnUnder(r, when === 'once it is up');
    r.on.pointerup(mouse('pointerup', 0));
    await done();
    eq(`a right press held, ${when}, then released: ${when === 'no turn' ? 'the item menu' : 'no menu, nothing selected'}`,
      [menus, [...r.c.selected], r.st.said],
      when === 'no turn' ? [['wall'], ['wall'], []] : [[], [], when === 'once it is up' ? [] : [WHY]]);
  }
  // ...and a right press MADE while the sheet turned to is still opening
  // (the last sheet's drawing up, the Wall under the pointer not yet on
  // screen), released once it is up: no item menu there, nothing selected
  // -- the press armed itself before the opening was asked, on the sheet
  // being turned to, so once that was up it opened the menu for a shape he
  // never saw. He is told why, in the words of the moment he pressed, as a
  // finger pressed then is told on its lift; released while it still
  // opens, refused in the same words. A right-drag made then is looking:
  // it pans, and nothing is said.
  for (const [when, drag, landFirst] of [['released once it is up', false, true],
    ['released while it still opens', false, false], ['dragged, released once it is up', true, true]]) {
    const r = await make();
    await r.c.setMode('pan');
    const wall = { _uid: 'wall', type: 'area', points: [[0, 0], [10, 10]] };
    r.c.hitTest = () => ({ item: wall, vertexIndex: -1 });
    const menus = [];
    r.c.host.showItemMenu = item => { menus.push(item._uid); };
    const mouse = (type, buttons, x = 300, y = 300) => ({ pointerId: 91, pointerType: 'mouse', button: type === 'pointermove' ? -1 : 2,
      buttons, clientX: x, clientY: y, type, preventDefault() {}, stopPropagation() {},
      shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, detail: 1 });
    const h = holding(r, () => r.env.stepSheet(1));
    const atPress = [r.st.page, r.c.host.sheetOpening()];
    r.st.said.length = 0;
    r.on.pointerdown(mouse('pointerdown', 2));
    const origin = { ...r.vp.origin };
    if (drag) r.on.pointermove(mouse('pointermove', 2, 360, 330));
    const panned = r.vp.origin.x !== origin.x || r.vp.origin.y !== origin.y;
    if (landFirst) { h.release(); await h.out; }
    const atRelease = r.c.host.sheetOpening();
    r.on.pointerup(mouse('pointerup', 0, drag ? 360 : 300, drag ? 330 : 300));
    if (!landFirst) { h.release(); await h.out; }
    eq(`(Page Down, the right press made while X1 opens; ${landFirst ? 'it is up' : 'it still opens'} at the release)`,
      [atPress, atRelease], [[1, WHY], landFirst ? '' : WHY]);
    eq(`a right press made while the next sheet opens, ${when}: no menu, nothing selected, ${drag ? 'nothing said' : 'told why'}`,
      [menus, [...r.c.selected], r.st.said], [[], [], drag ? [] : [WHY]]);
    eq('...a right-drag made then pans the drawing up, as it would on any sheet', panned, drag);
    // The next right click, on the sheet up, is a right click there.
    r.st.said.length = 0;
    r.on.pointerdown(mouse('pointerdown', 2));
    r.on.pointerup(mouse('pointerup', 0));
    eq('...and the next right click, on the sheet up, opens its menu, nothing said', [menus, r.st.said], [['wall'], []]);
  }
}

// ═══ 8b. back on the own drawing: the words, with other takeoffs ═══════
//
// showSheetVersion, lifted word for word, says how many items of the
// takeoff he is in are on the sheet's own drawing -- and, with none of his
// but some of another takeoff's (desktop 3.08 show_sheet_version), that it
// is not a drawing nobody has taken off. It asks only the controller (a
// real ToolController: inActiveList, otherTakeoffsHere, takeoffLabel).
{
  log('\n-- 8b. back on the own drawing, a job of several takeoffs --');
  const DECK = 'tl-deck0001';
  const said = async (items, md = {}) => {
    const r = await opened([SHEET], { revs: { 0: [['r1', SHEET]] } });
    r.env.app.project.measurements = { 0: structuredClone(items) };
    // In the app the controller's project IS app.project: one store.
    r.c.project.measurements = r.env.app.project.measurements;
    Object.assign(r.c.project.metadata, md);
    await r.env.showSheetVersion(0, 'r1', { announce: false, flip: false });
    r.st.said.length = 0;
    await r.env.showSheetVersion(0, '', { announce: true });
    return r.st.said.slice();
  };
  const area = (name, extra = {}) => ({ type: 'area', name, points: [[0, 0], [9, 0], [9, 9]], ...extra });
  const note = { type: 'textnote', text: 'shared', points: [[1, 1]] };
  eq('no tags: nothing on it -- v31\'s words', await said([]),
    ["Back on this sheet's own drawing — nothing taken off it yet"]);
  eq('no tags: two items and a note -- v31\'s count, the note counted as v31 counts it',
    await said([area('Slab'), area('Wall'), note]), ["Back on this sheet's own drawing — 3 items here"]);
  eq('no tags, a run of an item on another sheet and an item of a revision: v31 leaves both out',
    await said([area('Slab', { group_id: 'g1', group_child: true }), area('Rail', { rev_id: 'r1', rev_page: 0 })]),
    ["Back on this sheet's own drawing — nothing taken off it yet"]);
  eq('only another takeoff\'s items (one of them with a run here): nothing in Main, said as what it is',
    await said([area('Deck boards', { takeoff_list: DECK, group_id: 'g2' }),
      area('Deck boards', { takeoff_list: DECK, group_id: 'g2', group_child: true }),
      area('Rail', { takeoff_list: ` ${DECK} ` })]),
    ["Back on this sheet's own drawing — nothing in Main on it yet (2 items here are in other takeoffs)"]);
  eq('...one of them, Main renamed House: "is", and the takeoff by its name',
    await said([area('Deck boards', { takeoff_list: DECK })], { takeoff_main_label: 'House' }),
    ["Back on this sheet's own drawing — nothing in House on it yet (1 item here is in other takeoffs)"]);
  eq('...another takeoff\'s item on a revision of the sheet is not on the own drawing',
    await said([area('Rail', { takeoff_list: DECK, rev_id: 'r1', rev_page: 0 })]),
    ["Back on this sheet's own drawing — nothing taken off it yet"]);
  eq('...with a shared note beside it: the note is everyone\'s, so it is in Main, and counted',
    await said([area('Deck boards', { takeoff_list: DECK }), note]),
    ["Back on this sheet's own drawing — 1 item here"]);
  eq('...Main\'s and Deck\'s: only Main\'s counted, nothing said of Deck\'s',
    await said([area('Slab'), area('Deck boards', { takeoff_list: DECK })]),
    ["Back on this sheet's own drawing — 1 item here"]);
  // In a job of several takeoffs the count is the desktop's: every shape of
  // the takeoff on screen on the own drawing (version_items) -- a run of an
  // item whose main shape is on another sheet included, painted and
  // tappable here -- whether or not another takeoff has work on the sheet.
  // (With Main alone, v31's run-blind count, above.)
  const run = (extra = {}) => area('Wall M', { group_id: 'g1', group_child: true, ...extra });
  const DECK_REG = { takeoff_lists: [{ list_id: DECK, label: 'Deck' }] };
  eq('...two runs of Main\'s item beside Deck\'s: Main\'s work here, each shape counted, as the desktop counts them',
    await said([run(), run(), area('Deck boards', { takeoff_list: DECK }), area('Rail', { takeoff_list: DECK })]),
    ["Back on this sheet's own drawing — 2 items here"]);
  eq('...a Deck-tagged run of Main\'s item is not Main\'s',
    await said([run({ takeoff_list: DECK }), area('Deck boards', { takeoff_list: DECK })]),
    ["Back on this sheet's own drawing — nothing in Main on it yet (2 items here are in other takeoffs)"]);
  eq('a job with Deck, a sheet holding only a run of Main\'s item (nothing of Deck\'s on it): "1 item here", as the desktop',
    await said([run()], DECK_REG), ["Back on this sheet's own drawing — 1 item here"]);
  eq('...the same sheet with one Deck item beside the run: still "1 item here" -- the count does not hang on Deck\'s work',
    await said([run(), area('Deck boards', { takeoff_list: DECK })], DECK_REG), ["Back on this sheet's own drawing — 1 item here"]);
  eq('...a main shape of Main\'s and a run of another of its items: every shape, "2 items here", as the desktop',
    await said([area('Slab'), run()], DECK_REG), ["Back on this sheet's own drawing — 2 items here"]);
  eq('...the same sheet with Main alone: v31\'s count, the run left out',
    await said([area('Slab'), run()]), ["Back on this sheet's own drawing — 1 item here"]);
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
