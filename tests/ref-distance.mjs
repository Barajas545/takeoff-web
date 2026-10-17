// The REFERENCE DISTANCE, end to end in this build.
//
// WHAT IT IS. One measurement taken at a scale the estimator picks for that
// line alone: a detail drawn at 1" = 1'-0" on a 1/4" plan cannot be read
// without recalibrating the sheet, and recalibrating the sheet makes every
// quantity already taken off it suspect. So it measures the detail, leaves
// the sheet alone, and carries its OWN pixels-per-foot and its own scale
// label. It is not takeoff and never reaches a report.
//
// WHY THIS HARNESS EXISTS. The exclusion half of it arrived here correct —
// NON_TAKEOFF_TYPES, the report's NO_ROW_TYPES and the items panel all name
// the type — and the DRAWING half was missing outright. Driven through the
// real Renderer, a ref_distance produced three path calls fewer than a
// distance: zero. No geometry, no label, no mark. An estimator measured a
// detail on the desktop, opened the job on the iPad, and the line was gone.
//
// And one worse: RUNTIME_KEYS strips `ppf` on save, which is safe only
// because recoverPpf inverts it back out of the item's own geometry on the
// next open. recoverPpf had no case for this type, so the one object whose
// stamp is the only record of a scale no sheet knows came back measured at
// the sheet's scale — silently, with the wrong scale printed beside it.
//
// So three things are pinned here:
//   1. it is DRAWN, through renderer.draw() and not through a branch poked
//      at directly: dashed, in its own colour, captioned, with the length
//      and the scale in the chip;
//   2. its stamp SURVIVES a save and reload, exactly, with the page's own
//      scale deliberately set to something else so a fallback cannot pass;
//   3. its WORDS are the desktop's, checked against the desktop's own
//      functions lifted out of pdf_fast_viewer.py rather than re-typed.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Renderer } from '../js/render/renderer.js';
import { Viewport } from '../js/render/viewport.js';
import {
  Project, NON_TAKEOFF_TYPES, ITEM_TYPES, recoverPpf,
} from '../js/core/project.js';
import { recompute, reportQty } from '../js/core/measure.js';
import {
  refScaleWords, itemOwnPpf, scaleLabelFor, formatDistancePrecision,
  computePixelsPerFoot,
} from '../js/core/units.js';
import { DESKTOP_SRC, haveDesktopSource } from './config.mjs';

const run = promisify(execFile);
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

function ok(label, cond, detail = '') {
  checks += 1;
  if (cond) return true;
  fails += 1;
  console.log(`FAIL ${label}${detail ? `\n  ${detail}` : ''}`);
  return false;
}

function near(label, got, want, tol = 1e-9) {
  checks += 1;
  if (Number.isFinite(got) && Math.abs(got - want) <= tol) return true;
  fails += 1;
  console.log(`FAIL ${label}\n  got  ${got}\n  want ${want} (±${tol})`);
  return false;
}

// ── a canvas that remembers what it was told ─────────────────────────────
//
// Every call and every property assignment, in order. A render test that
// looks at pixels would prove nothing here anyway: node has no canvas, and
// the desktop's own lesson is that an offscreen surface with no font
// families draws no glyphs at all. What is checked is the INSTRUCTIONS —
// which is where the bug was: there were none.
function recordingCanvas() {
  const calls = [];
  const state = { __dash: [] };
  const target = {
    measureText(t) { return { width: String(t).length * 7 }; },
    getLineDash() { return state.__dash.slice(); },
    setLineDash(d) {
      state.__dash = Array.from(d || []);
      calls.push(['setLineDash', state.__dash.slice()]);
    },
  };
  const ctx = new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (k in state) return state[k];
      const fn = (...args) => { calls.push([String(k), ...args]); };
      t[k] = fn;
      return fn;
    },
    set(t, k, v) {
      state[k] = v;
      calls.push([`=${String(k)}`, v]);
      return true;
    },
  });
  const canvas = { width: 800, height: 600, getContext: () => ctx };
  return { canvas, ctx, calls };
}

function newRenderer({ zoom = 1, dpi = 150 } = {}) {
  const { canvas, calls } = recordingCanvas();
  const vp = new Viewport(canvas);
  vp.width = 800; vp.height = 600; vp.zoom = zoom; vp.dpr = 1;
  const r = new Renderer(canvas, vp);
  r.pageDpi = dpi;
  return { renderer: r, calls, viewport: vp };
}

/** One frame with these items on it, and what the canvas was told to do. */
function drawItems(items, opts = {}) {
  const { renderer, calls } = newRenderer(opts);
  renderer.draw({
    pageImage: null,
    items,
    annotations: [],
    isVisible: m => m.visible !== false,
    selected: new Set(),
    hoverId: null,
    preview: null,
    marquee: null,
    ppf: opts.pagePpf ?? 37.5,
  });
  return calls;
}

const named = (calls, name) => calls.filter(c => c[0] === name);
const texts = calls => named(calls, 'fillText').map(c => c[1]);

// The item the desktop's _finalize_ref_distance writes, field for field:
// no name, no floor, no trade, no category, no unit cost — not blank ones,
// NONE — and the two that make it what it is, `ppf` and `scale`.
const REF_COLOR = [0.62, 0.78, 0.92, 1.0];
// The default is the line the desktop was proved on: 525 px, which at the
// detail's 1" = 1 ft is 3'-6" and at the 1/4" sheet it sits on would be
// 14'-0". Two readings of one line, which is the whole point of the type.
function refItem({ ppf = 150.0, scale = '1"', pts = [[100, 100], [625, 100]] } = {}) {
  const ft = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) / ppf;
  return {
    type: 'ref_distance',
    points: pts.map(p => p.slice()),
    label: formatDistancePrecision(ft, '1/2'),
    notes: '',
    color: REF_COLOR.slice(),
    value: ft,
    precision: '1/2',
    visible: true,
    ppf,
    scale,
  };
}

// ═══ 1. it is drawn at all ════════════════════════════════════════════════
console.log('-- the line, the mark and the chip --');
{
  const m = refItem();
  const calls = drawItems([{ ...m, _uid: 'r1' }]);
  const strokes = named(calls, 'stroke').length;
  const lineTo = named(calls, 'lineTo');
  ok('a reference distance draws something at all', strokes > 0,
    `stroke() was called ${strokes} times — this was 0, which is the bug`);
  ok('its two points are the line that is drawn',
    lineTo.some(c => c[1] === 625 && c[2] === 100),
    JSON.stringify(lineTo.slice(0, 4)));
  ok('it is marked at both ends', named(calls, 'arc').length >= 2);

  // The chip: the length and the scale in one box, under the caption.
  const t = texts(calls);
  ok('the chip carries the length read at the detail\'s scale',
    t.some(s => String(s).includes("3'-6\"")), JSON.stringify(t));
  ok('and not the length the sheet\'s scale would give',
    !t.some(s => String(s).includes("14'")), JSON.stringify(t));
  ok('the chip carries the scale it was read at',
    t.some(s => String(s).includes('1" scale')), JSON.stringify(t));
  ok('the caption says it is not in the takeoff',
    t.includes('REFERENCE — not in the takeoff'), JSON.stringify(t));
}

// ═══ 2. it is drawn DIFFERENTLY ═══════════════════════════════════════════
//
// Three signals, and all three have to cross: the dash, the pale colour it
// carries in the file, and the caption. A line that is drawn but reads as
// takeoff is its own kind of wrong — an estimator will go looking for it in
// the estimate.
console.log('\n-- and distinctly, so it cannot be read as takeoff --');
{
  const calls = drawItems([{ ...refItem(), _uid: 'r1' }]);
  const dashes = named(calls, 'setLineDash').map(c => c[1]);
  eq('dashed 6 on, 6 off at zoom 1', dashes[0], [6, 6]);
  eq('and the dash is put back afterwards', dashes[dashes.length - 1], []);
  const widths = calls.filter(c => c[0] === '=lineWidth').map(c => c[1]);
  ok('lighter than a distance (2.0 against 2.5)', widths.includes(2),
    JSON.stringify(widths));
  const strokeStyles = calls.filter(c => c[0] === '=strokeStyle').map(c => c[1]);
  ok('in the pale steel blue it carries in the file',
    strokeStyles.some(s => String(s).startsWith('rgba(158,199,235')),
    JSON.stringify(strokeStyles));
}
{
  // The dash is context state. Left on, it turns the next real measurement
  // into a fake one — which is the same mistake in the other direction.
  const ref = { ...refItem(), _uid: 'r1' };
  const dist = {
    type: 'distance', _uid: 'd1', visible: true, points: [[0, 0], [300, 0]],
    color: [0, 0.8, 0.2, 1], value: 8, ppf: 37.5, precision: '1/2',
  };
  const calls = drawItems([ref, dist]);
  // Everything the canvas was told between the reference line's stroke and
  // the plain distance's.
  const iRefStroke = calls.findIndex(c => c[0] === 'stroke');
  const after = calls.slice(iRefStroke + 1);
  const iDistStroke = after.findIndex(c => c[0] === 'stroke');
  const between = after.slice(0, iDistStroke);
  const lastDash = [...between].reverse().find(c => c[0] === 'setLineDash');
  eq('the dash does not leak onto the next item', lastDash && lastDash[1], []);
}
{
  // Zoom is the other half of "in screen pixels": a dash measured in page
  // pixels turns into a solid line as soon as he zooms in on the detail —
  // which is the only way this type is ever used.
  const calls = drawItems([{ ...refItem(), _uid: 'r1' }], { zoom: 4 });
  const first = named(calls, 'setLineDash')[0][1];
  eq('the dash stays a dash at 4x', first, [1.5, 1.5]);
}

// ═══ 3. a degenerate one cannot poison the frame ══════════════════════════
{
  const half = { ...refItem(), _uid: 'r0', points: [[10, 10]] };
  const dist = {
    type: 'distance', _uid: 'd1', visible: true, points: [[0, 0], [300, 0]],
    color: [0, 0.8, 0.2, 1], value: 8, ppf: 37.5,
  };
  const calls = drawItems([half, dist]);
  const dashes = named(calls, 'setLineDash').map(c => c[1]);
  ok('a one-point reference line still puts the dash back',
    dashes.length === 0 || dashes[dashes.length - 1].length === 0,
    JSON.stringify(dashes));
  ok('and the item after it still draws', named(calls, 'stroke').length >= 1);
}

// ═══ 4. the stamp survives a save ═════════════════════════════════════════
//
// The save strips `ppf` from every item, and that is only safe because the
// next open inverts it back out of the item's own geometry. The page here is
// deliberately a 1/4" sheet and the reference line a 1" detail, so a
// fallback to the page's scale cannot pass as a recovery.
console.log('\n-- the stamp survives the round trip this app does to itself --');
{
  const PAGE_PPF = computePixelsPerFoot(150, 0.25, 1);   // 37.5, the sheet
  const REF_PPF = computePixelsPerFoot(150, 1, 1);       // 150, the detail
  ok('the two scales differ, or this proves nothing', PAGE_PPF !== REF_PPF);

  const before = new Project();
  before.metadata.dpi = 150;
  before.metadata.pixels_per_foot = PAGE_PPF;
  before.metadata.page_scales = { 0: PAGE_PPF };
  before.measurements = { 0: [refItem({ ppf: REF_PPF, scale: '1"' })] };
  before._backfillItems();

  const meta = before.buildSaveMetadata();
  const saved = meta.measurements['0'][0];
  eq('the save still strips the runtime stamp', saved.ppf, undefined);
  eq('and the runtime id with it', saved._uid, undefined);
  for (const k of ['type', 'points', 'value', 'precision', 'scale', 'color',
    'label', 'notes', 'visible']) {
    ok(`the file keeps ${k}`, saved[k] !== undefined, JSON.stringify(saved));
  }
  ok('and nothing was invented on it',
    !('name' in saved) && !('category' in saved) && !('unit_cost' in saved),
    JSON.stringify(Object.keys(saved)));

  const after = new Project();
  after.metadata = { ...meta, dpi: 150, pixels_per_foot: PAGE_PPF,
    page_scales: { 0: PAGE_PPF } };
  after.measurements = JSON.parse(JSON.stringify(meta.measurements));
  after._backfillItems();
  const back = after.measurements['0'][0];

  near('the scale comes back exactly, not as the sheet\'s', back.ppf, REF_PPF, 1e-9);
  eq('and it is marked as recovered, not assumed', back.ppf_recovered, true);
  near('the length is never recomputed', back.value, 3.5, 1e-12);
  near('and the sheet would have made 14 feet of the same line',
    525 / PAGE_PPF, 14.0, 1e-12);
  eq('so the chip still says the detail\'s scale',
    refScaleWords(back, 150), '1" scale');
  ok('which is not what the sheet would have said',
    refScaleWords(back, 150) !== refScaleWords({ ppf: PAGE_PPF }, 150));
}
{
  // The file that CANNOT be inverted: a reference line with no value (a
  // hand-edited file, or one saved mid-edit). The page's scale stands in
  // because something has to — but the chip must not then claim it.
  const p = new Project();
  p.metadata.dpi = 150;
  p.metadata.page_scales = { 0: 37.5 };
  p.measurements = { 0: [{ ...refItem(), ppf: undefined, value: 0, scale: '' }] };
  p._backfillItems();
  const m = p.measurements['0'][0];
  eq('an un-invertible one falls back to the page', m.ppf, 37.5);
  eq('and says so', m.ppf_recovered, false);
  eq('the chip refuses to name the sheet\'s scale as the item\'s',
    refScaleWords(m, 150), 'scale not recorded');
  eq('itemOwnPpf agrees there is no record', itemOwnPpf(m), 0);
  ok('and the warning list has it',
    p.itemsWithAssumedScale().some(([, it]) => it.type === 'ref_distance'));
}

{
  // "Re-value everything on this sheet" is the operation this type exists to
  // survive. Changing a sheet's scale offers to restate every item on it —
  // and a reference distance is the one item that was never at the sheet's
  // scale to begin with.
  const p = new Project();
  p.metadata.dpi = 150;
  p.metadata.pixels_per_foot = 37.5;
  p.metadata.page_scales = { 0: 37.5 };
  p.measurements = {
    0: [
      refItem({ ppf: 150, scale: '1"' }),
      { type: 'distance', points: [[0, 0], [375, 0]], value: 10, ppf: 37.5,
        visible: true, color: [0, 0.8, 0.2, 1] },
    ],
  };
  p._backfillItems();
  p.restampPage(0, 18.75);                    // the sheet restated to 1/8"
  const [ref, dist] = p.measurements['0'];
  eq('an ordinary item is restated with the sheet', dist.ppf, 18.75);
  eq('the reference distance is not', ref.ppf, 150);
  eq('and it still says what it was read at', refScaleWords(ref, 150), '1" scale');
  eq('its stored label is untouched too', ref.label, "3'-6\"");
}

// ═══ 5. dragging one re-measures at its own scale ═════════════════════════
console.log('\n-- dragged, it re-measures at its own scale --');
{
  const m = refItem({ ppf: 150.0, scale: '1"', pts: [[0, 0], [150, 0]] });
  m.ppf = 150.0;
  near('one foot to start with', m.value, 1.0);
  m.points[1][0] = 450;                     // drag the far end out to 3 ft
  recompute(m);
  near('three feet after the drag, at 1" = 1 ft', m.value, 3.0, 1e-9);
  eq('and the stored label follows it', m.label, "3'");
  ok('not the 8 feet the sheet\'s 1/4" would have made of it',
    Math.abs(m.value - 450 / 37.5) > 1,
    `value ${m.value}`);
}

// ═══ 6. still no part of the takeoff ══════════════════════════════════════
console.log('\n-- and still no part of the job --');
{
  ok('NON_TAKEOFF_TYPES names it', NON_TAKEOFF_TYPES.has('ref_distance'));
  ok('ITEM_TYPES names it', ITEM_TYPES.includes('ref_distance'));
  eq('it has no report quantity', reportQty(refItem()), null);
  const p = new Project();
  p.measurements = {
    0: [refItem(), {
      type: 'area', points: [[0, 0], [100, 0], [100, 100]], value: 10,
      ppf: 37.5, visible: true,
    }],
  };
  p._backfillItems();
  const kinds = [...p.takeoffItems()].map(([, it]) => it.type);
  eq('takeoffItems skips it', kinds, ['area']);
}

// ═══ 7. the words are the desktop's ═══════════════════════════════════════
let checkedAgainstDesktop = false;
if (!(await haveDesktopSource())) {
  console.log('\n-- differential vs pdf_fast_viewer.py SKIPPED '
    + '(set PTT_DESKTOP_SRC) --');
} else {
  console.log('\n-- the wording, against the desktop app\'s own functions --');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const script = path.join(here, 'ref-distance-python-truth.py');
  let truth = null;
  try {
    const { stdout } = await run('python', [script], {
      maxBuffer: 1 << 26, windowsHide: true,
      env: { ...process.env, PTT_DESKTOP_SRC: DESKTOP_SRC },
    });
    truth = JSON.parse(stdout);
  } catch (err) {
    fails += 1;
    console.log('FAIL could not run the python truth script:', err.message);
  }
  if (truth) {
    checkedAgainstDesktop = true;
    // The desktop offers two scales this build does not — 1" = 60 ft and
    // 1" = 100 ft are in EXTENDED_SCALES here and in no list there, so the
    // desktop can only call them "2.5 px/ft". Reaching one needs the ref
    // scale dialog's Custom box typed with a civil scale; it is written
    // down rather than silently tolerated, and a THIRD divergence fails.
    const KNOWN_WIDER_HERE = new Set(['1" = 60 ft', '1" = 100 ft']);
    let widened = 0;
    for (const row of truth.labels) {
      const got = scaleLabelFor(row.ppf, row.dpi);
      if (got !== row.label && KNOWN_WIDER_HERE.has(got)) { widened += 1; continue; }
      eq(`label ${row.ppf} @ ${row.dpi} dpi`, got, row.label);
    }
    ok('only the two documented scales are worded more widely here',
      widened <= 1, `${widened} rows`);

    for (const row of truth.words) {
      eq(`words ${JSON.stringify(row.item)}`,
        refScaleWords(row.item, row.dpi), row.words);
    }
    for (const row of truth.lengths) {
      for (const prec of ['1/2', '1/8', '1/16']) {
        eq(`length ${row.ft} at ${prec}`,
          formatDistancePrecision(row.ft, prec), row[prec]);
      }
    }

    // The whole chip, as the desktop writes it, against the whole chip as
    // this renderer writes it — separator, spacing and caption included.
    for (const row of truth.readouts) {
      const item = { ...row.item, _uid: 'x', visible: true };
      const calls = drawItems([item], { dpi: row.dpi });
      const t = texts(calls);
      ok(`the chip reads ${JSON.stringify(row.text)}`, t.includes(row.text),
        JSON.stringify(t));
      ok('under the desktop\'s caption', t.includes(row.caption),
        JSON.stringify(t));
    }

    eq('the type string', 'ref_distance', truth.type);

    // The dash, derived from the desktop's own stipple rather than typed
    // twice: glLineStipple(factor, 0x3333) is two bits on, two off, each
    // bit `factor` pixels wide.
    const [factor, bits] = truth.stipple;
    const runs = [];
    let cur = bits & 1, n = 0;
    for (let i = 0; i < 16; i++) {
      const b = (bits >> i) & 1;
      if (b === cur) { n += 1; } else { runs.push(n * factor); cur = b; n = 1; }
    }
    runs.push(n * factor);
    const calls = drawItems([{ ...refItem(), _uid: 'r1' }]);
    eq('the dash is the desktop\'s stipple', named(calls, 'setLineDash')[0][1],
      [runs[0], runs[1]]);

    // The colour is the desktop's, because the desktop writes it into the
    // file and this build draws what the item carries.
    const c = truth.color;
    const want = `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},`
      + `${Math.round(c[2] * 255)},1)`;
    const got = calls.filter(x => x[0] === '=strokeStyle').map(x => x[1]);
    ok(`the line is ${want}`, got.includes(want), JSON.stringify(got));
  }
}

// The last line is what the runner prints, so it says what actually ran:
// without the desktop source the wording half of this harness did not.
console.log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass — the reference distance is drawn, it is `
    + 'drawn distinctly,\nand its own scale survives a save'
    + (checkedAgainstDesktop
      ? ', in the desktop app\'s own words'
      : ' (wording not checked — no PTT_DESKTOP_SRC)'));
process.exit(fails ? 1 : 0);
