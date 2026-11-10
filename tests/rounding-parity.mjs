// A NUMBER READS AS THE DESKTOP WRITES IT -- the user's decision of
// 2026-11-07, "match the desktop rounding".
//
// The desktop formats with Python: format(x, '.1f'), f'{x:,.2f}', '%g',
// round(x, n), int(x). An exact binary tie goes to EVEN there (12.25 sq ft is
// '12.2 sq ft', $0.125 is '$0.12', 22.5 inches is 1'-10", 12.5% zoom is
// '12%' because the readout truncates); JavaScript's toFixed / toLocaleString
// / Intl.NumberFormat round it away from zero and Math.round rounds it up.
// Real takeoff makes those ties, so the same number used to read two ways on
// one screen -- 12.2 in the Items list with the SHEET chip on, 12.3 with it
// off, on the drawing and in the report.
//
//  1. THE HELPERS (js/core/pyformat.js) equal Python's own format() -- '.Nf'
//     and ',.Nf' for N 0..6, '.pg' for p 1..7, round(x, n), round(x),
//     int(x), '{:,}' and str(x) -- on generated ties at every place, the
//     doubles either side of them, negatives, -0.0, 1e21 and beyond, and
//     the subnormals.
//  2. THE PRODUCERS: every web text the map found, against the desktop's own
//     producer of the same text, lifted out of pdf_fast_viewer.py by
//     tests/rounding-python-truth.py (ast, closure-checked) and run on the
//     same corpus: the canvas labels and the live read-outs, a row's
//     quantity (both chip modes), a report's quantities and money, the
//     export's rounding and words, the labels and suggested names a
//     finished shape writes (through the REAL ToolController), the reshape's
//     labels (measure.js refreshLabel: a Measure line's, a grid's, and a
//     pitch line re-read through the real recompute), the pitch words, the
//     feet and inches, a calibrated scale's words, the catalog's table and
//     pick-list prices, the calibration's sentences, the slope form, the tile
//     form's estimate, the materials' quantities, a reissue's size refusal,
//     the zoom readout, and the CSV of a whole job (the real collectRows and
//     buildCsv against the desktop's own _collect_items and csv.writer: str()
//     of an int or a float, '20' / '20.0'). Browser-only modules (catalog.js,
//     assemblies.js, dialogs.js, main.js) are lifted by text.
//  2b. THE WORKBOOK: a quantity is rounded before it is written as the
//     desktop's own workbook rounds it -- the Takeoff sheet's 'Qty / Value'
//     (its value_and_unit: f"{v:.2f}", a whole count, '%g') and a material's
//     '%g', both lifted (the xlsx_qty cases) -- so Excel, which rounds a tie
//     away from zero itself, shows the desktop's digits; the All Items sheet
//     holds the desktop's export numbers under General; a rate, a cost and a
//     total are written AS THEY ARE (the user's rule), each total the sum of
//     the cells above it. Declared divergences (KNOWN) are each checked to
//     still be there.
//  2c. THE REPORT'S MONEY: collectItems against the desktop Report Center's
//     own _collect (every pin one EA, priced, with its materials; an array by
//     its whole dots), and the Items list's footer adds the same (the
//     report_collect cases).
//  3. THE SOURCE GUARD: every toFixed / toPrecision / toExponential /
//     toLocaleString / Intl.NumberFormat / *FractionDigits left in js/, every
//     Math.round / trunc / floor / ceil inside a template substitution, glued
//     to words with + or on a line that writes text, and every Math.round in
//     js/ui and js/main.js, is on ALLOWED below with its one-line reason -- so
//     a new display toFixed or Math.round fails here. An entry nothing
//     matches any more fails too.
//
// From the COMMITTED tests/data/rounding-truth.json, so it runs on a fresh
// clone; and live against the desktop source when it is here (PTT_DESKTOP_SRC
// or tests/config.local.mjs), which also fails a stale snapshot.
//
// Run: node tests/rounding-parity.mjs
import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DATA, DESKTOP_SRC, haveDesktopSource } from './config.mjs';

import * as P from '../js/core/pyformat.js';
import * as U from '../js/core/units.js';
import * as M from '../js/core/measure.js';
import * as C from '../js/core/counting.js';
import * as H from '../js/ui/report-html.js';
import { sizeRefusal } from '../js/core/revisions.js';
import { Renderer, previewLabel, shapeTag } from '../js/render/renderer.js';
import { ToolController, pitchLabel, TILE_PATTERNS } from '../js/tools/controller.js';
import { ZoomFloor } from '../js/render/zoom-floor.js';
import { Viewport } from '../js/render/viewport.js';
import * as Reports from '../js/ui/reports.js';
import { cell as xlsxCell, STYLES } from '../js/core/xlsx.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);
const ROOT = path.resolve(here, '..');
globalThis.window = globalThis.window || { devicePixelRatio: 1 };

let fails = 0;
let checks = 0;
const log = (...a) => console.log(...a);
function eq(label, got, want) {
  checks += 1;
  if (got === want) return true;
  fails += 1;
  if (fails <= 60) log(`FAIL ${label}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`);
  return false;
}
function ok(label, cond, detail = '') {
  checks += 1;
  if (cond) return true;
  fails += 1;
  if (fails <= 60) log(`FAIL ${label}${detail ? `\n  ${detail}` : ''}`);
  return false;
}
/** A float the truth carries as Python's repr. */
const num = s => (s === 'inf' ? Infinity : s === '-inf' ? -Infinity : s === 'nan' ? NaN : Number(s));
const arg = v => (typeof v === 'string' && /^-?(\d|inf|nan)/.test(v) && !/[$, ]/.test(v) ? num(v) : v);

// ── the browser-only modules, by text ──────────────────────────────────────
const src = async rel => (await readFile(path.join(ROOT, rel), 'utf-8')).replace(/\r\n/g, '\n');
const REPORTS = await src('js/ui/reports.js');
const CATALOG = await src('js/ui/catalog.js');
const ASSEMBLIES = await src('js/ui/assemblies.js');
const DIALOGS = await src('js/ui/dialogs.js');
const MAIN = await src('js/main.js');
const ITEMS = await src('js/ui/items-panel.js');
const CONTROLLER = await src('js/tools/controller.js');

/** A top-level function of a module's text, word for word. */
function fnText(text, name) {
  const m = new RegExp(`\\n((?:export )?(?:async )?function ${name}\\()`).exec(text);
  if (!m) throw new Error(`no function ${name}`);
  const i = m.index + 1;
  const j = text.indexOf('\n}\n', i);
  return text.slice(i, j + 2).replace(/^export /, '');
}
/** The one line of `text` holding `needle` (it must be one). */
function lineWith(text, needle) {
  const hits = text.split('\n').filter(l => l.includes(needle));
  if (hits.length !== 1) throw new Error(`${hits.length} lines hold ${JSON.stringify(needle)}`);
  return hits[0];
}
/** The first template literal on a line, as a function of `names`. */
function templateOf(line, names, scope = {}) {
  const t = /`[^`]*`/.exec(line);
  if (!t) throw new Error(`no template literal in ${line}`);
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(scope), ...names, `return ${t[0]};`).bind(null, ...Object.values(scope));
}
const PYS = { pyFixed: P.pyFixed, pyG: P.pyG, pyRound: P.pyRound, pyRoundInt: P.pyRoundInt,
  pyIntStr: P.pyIntStr, pyMoney: P.pyMoney, pyStrFloat: P.pyStrFloat, pyQty: P.pyQty };
/** Lift top-level functions of a module's text into one scope. */
function lift(text, names, scope = {}) {
  const all = { ...PYS, ...scope };
  const body = names.map(n => fnText(text, n)).join('\n');
  // eslint-disable-next-line no-new-func
  return new Function(...Object.keys(all), `${body}\nreturn { ${names.join(', ')} };`)(...Object.values(all));
}
const R = lift(REPORTS, ['g', 'commas', 'tileBlurb', 'openingDims', 'typePrefix', 'round4'],
  { tilePatternLabel: M.tilePatternLabel });
const COST = (() => {
  const line = lineWith(REPORTS, 'r.ItemTotalCost = ');
  const expr = line.slice(line.indexOf('=') + 1).trim().replace(/;$/, '');
  // eslint-disable-next-line no-new-func
  return new Function('pyRound', 'qty', 'rate', `return ${expr};`).bind(null, P.pyRound);
})();
const CAT = lift(CATALOG, ['catalogPrice']);
const PRICE_CELL = (() => {
  const line = lineWith(CATALOG, "if (key === 'price') v = ");
  const expr = line.slice(line.indexOf('v = ') + 4).trim().replace(/;$/, '');
  // eslint-disable-next-line no-new-func
  return new Function('catalogPrice', 'pyMoney', 'pyFixed', 'v', `return ${expr};`)
    .bind(null, CAT.catalogPrice, P.pyMoney, P.pyFixed);
})();
// the price a pick list shows (attachSearch's tag): its money part
const PICK_PRICE = (() => {
  const line = lineWith(CATALOG, 'tag.textContent = [it.code, it.unit, ');
  const m = /it\.unit, (it\.price \? .*? : '')\]/.exec(line);
  if (!m) throw new Error('the pick list\'s price moved');
  // eslint-disable-next-line no-new-func
  return new Function('catalogPrice', 'pyMoney', 'pyFixed', 'it', `return ${m[1]};`)
    .bind(null, CAT.catalogPrice, P.pyMoney, P.pyFixed);
})();
// the tile form's estimate (askTile's readout), as a function of what it reads
const TILE_READOUT = (() => {
  const a = DIALOGS.indexOf('      readout.textContent =\n        `${pyFixed(setup.areaFt2');
  if (a < 0) throw new Error('the tile form readout moved');
  const b = DIALOGS.indexOf(';\n', a);
  const expr = DIALOGS.slice(DIALOGS.indexOf('=', a) + 1, b).trim();
  // eslint-disable-next-line no-new-func
  return new Function('pyFixed', 'pyIntStr', 'setup', 'approx', 'needed', 'pb', `return ${expr};`)
    .bind(null, P.pyFixed, P.pyIntStr);
})();
const ASM = lift(ASSEMBLIES, ['num', 'money']);
const ASM_HEAD = templateOf(lineWith(ASSEMBLIES, "|| 'Item'} — ${"), ['item', 'parentValue', 'hint'], { pyG: P.pyG });
const CAL_LINE = templateOf(lineWith(DIALOGS, 'Line drawn: ${'), ['distPx'], { pyFixed: P.pyFixed });
const SLOPE_READOUT = (() => {
  const a = DIALOGS.indexOf('      readout.textContent =\n        `Flat ');
  if (a < 0) throw new Error('the slope form readout moved');
  const b = DIALOGS.indexOf(';\n', a);
  const expr = DIALOGS.slice(DIALOGS.indexOf('=', a) + 1, b).trim();
  // eslint-disable-next-line no-new-func
  return new Function('pyFixed', 'flatArea', 'factor', 'ang', `return ${expr};`).bind(null, P.pyFixed);
})();
const SCALE_READOUT = templateOf(lineWith(MAIN, '? `Scale ${label}   ·   ${'), ['label', 'ppf'], { pyFixed: P.pyFixed });
const PANEL = lift(ITEMS, ['money']);
const TILE_NAME = (() => {
  const line = lineWith(CONTROLLER, '`Tile ${pyIntStr(item.tile_count || 0, true)} (${patternLabel(item.pattern)})`');
  const patternLabel = lift(CONTROLLER, ['patternLabel'], { TILE_PATTERNS }).patternLabel;
  return templateOf(line, ['item'], { pyIntStr: P.pyIntStr, patternLabel });
})();
const ARRAY_NAME = templateOf(lineWith(CONTROLLER, 'items @ ${pyG(spacingIn)}"'), ['count', 'spacingIn'], { pyG: P.pyG });

// The Items list's footer money: its loop, lifted by text from
// ItemsPanel._updateFoot, over the items the panel lists (its EXCLUDED set,
// lifted too).
const FOOTER_COST = (() => {
  const a = ITEMS.indexOf('    let cost = 0;\n    for (const m of items) {');
  const b = ITEMS.indexOf('\n    }\n', a);
  if (a < 0 || b < 0) throw new Error('the footer\'s money loop moved');
  // eslint-disable-next-line no-new-func
  return new Function('reportQty', 'itemCost', 'expandAssembly', 'items',
    `${ITEMS.slice(a, b + 6)}\nreturn cost;`).bind(null, M.reportQty, M.itemCost, M.expandAssembly);
})();
const PANEL_EXCLUDED = (() => {
  const line = lineWith(ITEMS, 'const EXCLUDED = new Set([');
  // eslint-disable-next-line no-new-func
  return new Function(`return ${line.slice(line.indexOf('new Set'), line.lastIndexOf(';'))};`)();
})();

// ── the workbook, lifted by text ──────────────────────────────────────────
// exportWorkbook and the helpers it calls, run on the REAL collectItems /
// collectRows and xlsx.js's cell; what it would write is caught. The lift is
// a closure: every bare call in the lifted text is a lifted function, a name
// handed in, or a JavaScript builtin -- checked before it runs.
const CSV_COLUMNS = (() => {
  const a = REPORTS.indexOf('const CSV_COLUMNS = [');
  const b = REPORTS.indexOf('];', a);
  // eslint-disable-next-line no-new-func
  return new Function(`return ${REPORTS.slice(a + 'const CSV_COLUMNS = '.length, b + 1)};`)();
})();
const WB_LIFTED = ['round4', 'gNumber', 'takeoffQtyCell', 'exportWorkbook'];
// (reportTakeoff, nothingWords and fileName name the takeoff a job of
// several is reported in -- tests/takeoff-lists-outputs.mjs holds them; here
// the real reportTakeoff, and the name and the empty words stand in)
const WB_SCOPE = ['collectItems', 'collectRows', 'D', 'cell', 'writeWorkbook', 'download', 'baseName',
  'pyRound', 'pyG', 'CSV_COLUMNS', 'reportTakeoff', 'nothingWords', 'fileName'];
const WB_TEXT = WB_LIFTED.map(n => fnText(REPORTS, n)).join('\n');
{
  const builtins = new Set(['Number', 'String', 'Boolean', 'Object', 'Array', 'Math', 'Blob', 'if', 'for',
    'switch', 'return', 'function', 'while', 'catch', 'await', 'async']);
  const code = WB_TEXT.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  const loose = [...new Set([...code.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)].map(x => x[1]))]
    .filter(n => !WB_LIFTED.includes(n) && !WB_SCOPE.includes(n) && !builtins.has(n));
  ok('the workbook lift is a closure (every bare call is lifted, handed in or a builtin)', !loose.length,
    `not provided: ${loose.join(', ')}`);
}
async function workbookOf(project) {
  let sheets = null;
  // eslint-disable-next-line no-new-func
  const exportWorkbook = new Function(...WB_SCOPE, `${WB_TEXT}\nreturn exportWorkbook;`)(
    Reports.collectItems, Reports.collectRows, { alertDialog: async () => {} }, xlsxCell,
    s => { sheets = s; return null; }, () => {}, () => 'job', P.pyRound, P.pyG, CSV_COLUMNS,
    Reports.reportTakeoff, () => 'No measurements found.', () => 'job.xlsx');
  await exportWorkbook(project, i => `X${i + 1}.0`);
  return sheets;
}
/** A number format's [prefix, commas, fewest places, most places]:
 *  '"$"#,##0.00##' is ['$', true, 2, 4], '0.00' is ['', false, 2, 2]. */
function formatPlaces(fmt) {
  const m = /^("\$")?(#,##)?0(?:\.(0*)(#*))?$/.exec(fmt || '');
  if (!m) return null;
  return [m[1] ? '$' : '', !!m[2], (m[3] || '').length, (m[3] || '').length + (m[4] || '').length];
}
const dropZeros = (s, fewest) => {
  if (!s.includes('.')) return s;
  let [i, f] = s.split('.');
  while (f.length > fewest && f.endsWith('0')) f = f.slice(0, -1);
  return f ? `${i}.${f}` : i;
};
/** What Excel's General shows of a number -- modelled only where that is
 *  plain: its shortest digits, no exponent, at most 10 significant digits (a
 *  longer one General rounds to the column; the corpus holds none). */
function generalShows(v) {
  const s = Object.is(v, -0) ? '0' : String(v);
  if (/e/i.test(s) || s.replace(/^-/, '').replace('.', '').replace(/^0+/, '').length > 10) {
    throw new Error(`the workbook check models General only for plain digits (${v})`);
  }
  return s;
}
/** What Excel shows: under General its own digits; under a number format the
 *  number to 15 significant digits, that decimal rounded to the format's
 *  most places with a tie away from zero, commas if the format has them,
 *  zeros past the fewest dropped. */
function excelShows(v, fmt) {
  if (!fmt) return generalShows(v);
  const [pre, commas, fewest, most] = formatPlaces(fmt);
  const s = Math.abs(v).toPrecision(15);
  if (/e/.test(s)) throw new Error(`the workbook check reads no exponent (${v})`);
  const [ip, fp = ''] = s.split('.');
  const digits = (ip + fp.padEnd(most + 1, '0')).split('').map(Number);
  const keep = ip.length + most;
  const kept = digits.slice(0, keep);
  if (digits[keep] >= 5) {
    let k = kept.length - 1;
    while (k >= 0 && kept[k] === 9) { kept[k] = 0; k -= 1; }
    if (k < 0) kept.unshift(1); else kept[k] += 1;
  }
  const all = kept.join('');
  let intPart = (all.slice(0, all.length - most) || '0').replace(/^0+(?=\d)/, '');
  if (commas) intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const text = most ? `${intPart}.${all.slice(all.length - most)}` : intPart;
  return `${v < 0 ? '-' : ''}${pre}${dropZeros(text, fewest)}`;
}
/** What Python shows of the same number at the same places (half to even). */
const pythonShows = (v, fmt) => {
  const [pre, commas, fewest, most] = formatPlaces(fmt);
  return `${v < 0 ? '-' : ''}${pre}${dropZeros(P.pyFixed(Math.abs(v), most, commas), fewest)}`;
};
/** A workbook cell, as Excel shows it under its own style. */
const shownIn = c => excelShows(c.v, STYLES[c.s] && STYLES[c.s].numFmt);

// Declared divergences from the desktop's workbook, each CHECKED TO STILL BE
// THERE: one that goes away fails until it is dropped from this list.
const KNOWN = {
  rawMoney: 'The Takeoff and Materials sheets write a rate, a line\'s cost and the totals AS THEY ARE '
    + '(the user\'s rule: a number written as a number stays a raw number), so their sum is the total under '
    + 'them; Excel shows a cent tie under "$"#,##0.00 its own way, away from zero -- a $6.125 line reads '
    + '$6.13 where the report says $6.12. The desktop\'s Takeoff and Materials sheets have no money columns.',
  gExponent: 'A %g quantity Python writes with an exponent (a material of 1e-05, an item on no sheet of '
    + '1,234,565): the desktop\'s Takeoff and Materials sheets hold the TEXT "1e-05" / "1.23456e+06"; the web '
    + 'writes that same number, rounded the same, and Excel\'s General shows it in plain digits.',
};
const knownSeen = Object.fromEntries(Object.keys(KNOWN).map(k => [k, 0]));

// ── 1. the helpers ═════════════════════════════════════════════════════════
const SNAP = JSON.parse(await readFile(new URL('rounding-truth.json', DATA), 'utf-8'));

function checkHelpers(truth, label) {
  let n = 0, bad = 0;
  const one = (what, got, want) => {
    n += 1;
    if (got !== want) {
      bad += 1;
      if (bad <= 12) log(`FAIL ${label} ${what}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
    }
  };
  for (const r of truth.helpers) {
    const x = num(r.x);
    for (let k = 0; k <= 6; k += 1) {
      one(`format(${r.x}, '.${k}f')`, P.pyFixed(x, k), r.f[k]);
      one(`format(${r.x}, ',.${k}f')`, P.pyFixed(x, k, true), r.fc[k]);
      one(`repr(round(${r.x}, ${k}))`, P.pyStrFloat(P.pyRound(x, k)), r.r[k]);
    }
    for (let p = 1; p <= 7; p += 1) one(`format(${r.x}, '.${p}g')`, P.pyG(x, p), r.g[p - 1]);
    one(`format(${r.x}, 'g')`, P.pyG(x), r.g[5]);
    one(`str(${r.x})`, P.pyStrFloat(x), r.s);
    if (r.ri !== undefined) {
      one(`round(${r.x})`, P.pyIntStr(P.pyRoundInt(x)), r.ri);
      one(`int(${r.x})`, P.pyIntStr(P.pyInt(x)), r.i);
      one(`format(int(${r.x}), ',')`, P.pyIntStr(P.pyInt(x), true), r.ic);
      // the Items list's footer: whole dollars, web-only, Python's rounding
      one(`the footer's money of ${r.x}`, PANEL.money(x), `$${r.fc[0]}`);
    }
    one(`f"\${${r.x}:,.2f}"`, P.pyMoney(x), `$${r.fc[2]}`);
  }
  checks += n;
  fails += bad;
  log(`   ${label}: ${truth.helpers.length} numbers, ${n} formats compared with Python's, ${bad} differing`);
}
log('-- 1. the helpers == Python\'s format(), round(), int(), str() --');
checkHelpers(SNAP, 'snapshot');
// the old helpers' two weak spots, by name
eq('Python format(1234565.0, \'g\') -- the 6th digit a tie, to even', P.pyG(1234565), '1.23456e+06');
eq('Python format(1e21, \'.1f\') -- every digit', P.pyFixed(1e21, 1), '1000000000000000000000.0');
eq('...with commas', P.pyFixed(1.5e21, 1, true), '1,500,000,000,000,000,000,000.0');
eq('counting.js hands out the same helpers', [C.pyFixed, C.pyRound, C.pyG].every((f, i) => f === [P.pyFixed, P.pyRound, P.pyG][i]), true);

// ── 2. the producers ═══════════════════════════════════════════════════════
const fakeRenderer = { pageDpi: 150 };
/** The canvas label as _drawItemLabel builds it: its notes hint, shape tag and name line. */
function canvasLabel(m) {
  const notesHint = m.notes ? ' [N]' : '';
  const name = String(m.name || '').trim();
  return Renderer.prototype._labelTextFor.call(fakeRenderer, m, notesHint, shapeTag(m), name ? `${name}\n` : '');
}

/** The REAL ToolController, its forms answered and its writes caught. */
function controller({ ppf = 1, options = {}, calibrateFt = 2 } = {}) {
  const on = {};
  const canvas = { addEventListener: (t, f) => { on[t] = f; }, setPointerCapture() {},
    releasePointerCapture() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    width: 0, height: 0 };
  const asked = [];
  const alerts = [];
  const project = Object.assign(new EventTarget(), { pagePpf: () => ppf, pageScaleLabel: () => '1/4"',
    setPageScale() {}, allItems: () => [], metadata: {}, measurements: {} });
  const c = new ToolController({ canvas, viewport: new Viewport(canvas), project, currentPage: () => 0,
    host: {
      askItem: o => { asked.push(o); return Promise.resolve({ name: '' }); },
      askSlopeRoof: o => { asked.push(o); return Promise.resolve({ name: '', pitch: options.pitch }); },
      askCalibration: () => Promise.resolve(calibrateFt),
      alert: (t, x) => alerts.push(x),
    } });
  Object.assign(c.options, options);
  const made = [];
  c._commit = item => { made.push(item); return item; };
  return { c, asked, made, alerts };
}

const DIST_FT = { 'Nearest Inch': 1, 'Inches Only': 16, '1/2': 2, '1/8': 8, '1/16': 16, '': 8 };
async function checkCases(truth, label) {
  let n = 0, bad = 0;
  const one = (what, got, want) => {
    n += 1;
    if (got !== want) {
      bad += 1;
      bySurface[surface] = (bySurface[surface] || 0) + 1;
      if (bad <= 25) log(`FAIL ${label} ${what}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`);
    }
  };
  const seen = new Set();
  const bySurface = {};
  let surface = '';
  for (const k of truth.cases) {
    const a = k.a.map(arg);
    const w = k.w;
    const tag = `${k.s}(${JSON.stringify(k.a).slice(0, 90)})`;
    seen.add(k.s);
    surface = k.s;
    switch (k.s) {
      case 'format_ft': one(tag, U.formatFt(a[0]), w); break;
      case 'format_distance_precision':
        if (!(k.a[1] in DIST_FT)) throw new Error(`precision ${k.a[1]}`);
        one(tag, U.formatDistancePrecision(a[0], k.a[1]), w); break;
      case 'format_ft_in': one(tag, U.formatFtIn(a[0]), w); break;
      case '_pitch_label': one(tag, pitchLabel(a[0]), w); break;
      case 'scale_label_for': one(tag, U.scaleLabelFor(a[0], a[1]), w); break;
      case '_catalog_price': one(tag, P.pyStrFloat(CAT.catalogPrice(a[0])), w); break;
      // the table's cell: the desktop's digits (no commas) after the web's
      // '$', and '—' for an unpriced item where the desktop leaves it blank
      case 'catalog_table_price': one(tag, PRICE_CELL(a[0]), w ? `$${w}` : '—'); break;
      case 'catalog_pick_price': one(tag, PICK_PRICE({ price: a[0], unit: 'EA' }), w.split('/')[0]); break;
      case '_value_str':
        one(`${tag} (chip off: measure.js valueString)`, M.valueString(k.a[0]), w);
        one(`${tag} (chip on: counting.js valueStr)`, C.valueStr(k.a[0]), w);
        break;
      case '_fmt_qty':
        one(`${tag} (report-html fmtQty)`, H.fmtQty(a[0]), w);
        one(`${tag} (units formatQty)`, U.formatQty(a[0]), w);
        break;
      case '_unit_totals': one(tag, H.unitTotals(k.a[0]), w); break;
      case 'report_money':
        one(`${tag} (report-html money)`, H.money(a[0]), w);
        one(`${tag} (units formatMoney)`, U.formatMoney(a[0]), w);
        one(`${tag} (the materials' money)`, ASM.money(a[0]), w);
        break;
      case 'update_zoom_label': {
        const zf = Object.create(ZoomFloor.prototype);
        zf.vp = { zoom: a[0] };
        zf.atFloor = () => k.a[1];
        zf._floorFits = () => true;
        one(tag, zf.label(), w);
        break;
      }
      case 'canvas_label': one(tag, canvasLabel(k.a[0]), w); break;
      case 'preview_label': {
        const pv = { ...k.a[0] };
        const got = previewLabel(pv, a[1]);
        one(tag, got ? got.text : '', w);
        break;
      }
      case '_size_refusal': {
        const [sw, sh] = k.a[0], [rw, rh] = k.a[1];
        const got = sizeRefusal({ width: sw, height: sh }, { width: rw, height: rh });
        const nums = s => (/\((\S+ against \S+) pixels/.exec(s) || [])[1];
        one(tag, nums(got), nums(w));
        break;
      }
      case 'slope_dialog': {
        const [flat, pitch] = a;
        const factor = Math.sqrt(1 + (pitch / 12) ** 2);
        const ang = (Math.atan2(pitch, 12) * 180) / Math.PI;
        const got = SLOPE_READOUT(flat, factor, ang);
        const m = /×  (\S+)  =  (\S+ sq ft) sloped/.exec(got) || [];
        one(`${tag} factor`, m[1], (/= (\S+)×$/.exec(w[0]) || [])[1]);
        one(`${tag} sloped`, m[2], w[1]);
        break;
      }
      case 'area_suggest': case 'area_label': {
        const x = a[0];
        const r = controller({ ppf: 1 });
        await r.c._finalizePolygon('area', [[0, 0], [x, 0], [x, 1], [0, 1]]);
        if (k.s === 'area_suggest') one(tag, r.asked[0]?.suggestedName, w);
        else one(tag, r.made[0]?.label, w);
        break;
      }
      case 'recalc_area': {
        const it = { type: 'area', value: a[0] };
        one(tag, M.refreshLabel(it), w);
        break;
      }
      case 'run_suggest': case 'run_label': {
        const x = a[0];
        const r = controller({ ppf: 1 });
        await r.c._finalizePolyline([[0, 0], [x, 0]]);
        if (k.s === 'run_suggest') one(tag, r.asked[0]?.suggestedName, w);
        else one(tag, r.made[0]?.label, w);
        // ...and the reshape's (format_ft, the same words)
        if (k.s === 'run_label') one(`${tag} (reshape)`, M.refreshLabel({ type: 'polyline', value: x }), w);
        break;
      }
      case 'slope_label': {
        const [flat, pitch] = a;
        const r = controller({ ppf: 1, options: { pitch } });
        await r.c._finalizePolygon('slope_area', [[0, 0], [flat, 0], [flat, 1], [0, 1]]);
        one(tag, r.made[0]?.label, w);
        break;
      }
      case 'recalc_slope': {
        const [sloped, pitch] = a;
        one(tag, M.refreshLabel({ type: 'slope_area', value: sloped, pitch }), w);
        break;
      }
      case 'grid_suggest': {
        const [cols, rows, cw, ch] = a;
        const ppf = 100;
        const r = controller({ ppf, options: { gridCellW: cw, gridCellH: ch, gridAngle: 0 } });
        const W = (cols - 0.5) * cw * ppf, Hh = (rows - 0.5) * ch * ppf;
        await r.c._finalizeGrid([[0, 0], [W, 0], [W, Hh], [0, Hh]], 1, 1);
        one(tag, r.asked[0]?.suggestedName, w);
        break;
      }
      case 'tile_label': case 'recalc_tile': {
        const [count, pat] = k.a;
        if (k.s === 'tile_label') one(`${tag} (the finished tile run)`, TILE_NAME({ tile_count: count, pattern: pat }), w);
        else one(`${tag} (reshape)`, M.refreshLabel({ type: 'tile', tile_count: count, pattern: pat }), w);
        break;
      }
      case 'array_suggest': {
        const [count, sp] = a;
        one(tag, ARRAY_NAME(count, sp), w);
        break;
      }
      case 'recalc_array': one(tag, M.refreshLabel({ type: 'linear_count', value: a[0] }), w); break;
      case 'recalc_distance':
        one(tag, M.refreshLabel({ type: 'distance', value: a[0], points: [[0, 0], [1, 0]], ...k.a[1] }), w);
        break;
      case 'recalc_grid': {
        const [name, cols, rows] = k.a;
        one(tag, M.refreshLabel({ type: 'grid', name, cols, rows, value: 12.25 }), w);
        break;
      }
      case 'recalc_pitch': {
        // the REAL recompute a drag runs (controller: recompute(found.item)),
        // on a pitch line whose stored figures are stale
        const [p0, p1, name] = k.a;
        const it = { type: 'pitch', points: [p0, p1], name, value: 99, pitch: 99, angle_deg: 1, label: 'stale' };
        M.recompute(it);
        const rise = num(w[0]);
        one(`${tag} value`, it.value, Number.isFinite(rise) ? rise : 0);
        one(`${tag} pitch`, it.pitch, it.value);
        // atan2 is the platform's: V8's and the C library's can differ in the
        // last bit (29.981639368849333 / ...336), so the angle is held to a
        // few ulps -- and to the bit where it shows, the canvas's whole degrees
        const ang = num(w[1]);
        one(`${tag} angle_deg (to 4 ulps)`, Math.abs(it.angle_deg - ang) <= 4 * Number.EPSILON * Math.abs(ang), true);
        one(`${tag} angle_deg, as the canvas shows it`, P.pyFixed(it.angle_deg, 0), P.pyFixed(ang, 0));
        one(`${tag} label`, it.label, w[2]);
        // ...and the canvas label the reshaped line draws (a vertical one is
        // 'vertical' there, its rise inf; this app stores 0)
        one(`${tag} canvas`, canvasLabel(it), w[3]);
        break;
      }
      case 'recalc_grid_shape': {
        // the REAL recompute a drag runs, on a grid's outline
        const it = JSON.parse(JSON.stringify(k.a[0]));
        M.recompute(it);
        one(`${tag} cols`, it.cols, w[0]);
        one(`${tag} rows`, it.rows, w[1]);
        one(`${tag} cell_count`, it.cell_count, w[0] * w[1]);
        one(`${tag} label`, it.label, w[2]);
        one(`${tag} area`, it.value, num(w[3]));
        one(`${tag} canvas`, canvasLabel(it), w[4]);
        break;
      }
      case 'xlsx_qty': {
        // one item alone in a job: its Takeoff-sheet quantity, and each of
        // its materials' there and on the Materials sheet, as Excel shows them
        const [key, m] = k.a;
        const sheets = await workbookOf({ metadata: {},
          measurements: { [key]: [JSON.parse(JSON.stringify(m))] }, pageCount: 1 });
        const tk = sheets.find(s => s.name === 'Takeoff');
        const mats = sheets.find(s => s.name === 'Materials');
        const shows = (what, row, want) => {
          const c = row && row[5];
          if (!c || typeof c !== 'object' || typeof c.v !== 'number') {
            one(`${what}: a number cell`, JSON.stringify(c === undefined ? 'no row' : c), want);
            return;
          }
          const got = shownIn(c);
          if (/e/.test(want) && got !== want && c.v === Number(want)) {
            knownSeen.gExponent += 1;   // KNOWN.gExponent: the same number, in plain digits
            one(`${what} (declared: '%g' with an exponent, the same number)`, c.v, Number(want));
            return;
          }
          one(what, got, want);
        };
        shows(`${tag} Takeoff Qty`, tk.rows[4], w[0]);
        w[1].forEach((want, i) => shows(`${tag} material ${i}: Takeoff Qty`, tk.rows[5 + i], want));
        w[2].forEach((want, i) => shows(`${tag} material ${i}: Materials Qty`, mats && mats.rows[1 + i], want));
        break;
      }
      case 'report_collect': {
        // the report's rows against the desktop Report Center's: each item's
        // quantity, unit, rate and cost and its materials' -- every pin one
        // EA, priced, with its materials -- and the Items footer's money
        const project = { metadata: {}, measurements: JSON.parse(k.a[0]), pageCount: 1 };
        const items = Reports.collectItems(project, i => `X${i + 1}.0`);
        const byName = new Map(items.map(e => [e.name, e]));
        one(`${tag}: the report lists what the desktop's does`, JSON.stringify(items.map(e => e.name).sort()),
          JSON.stringify(w.map(x => x[0]).sort()));
        let desk = 0;
        for (const [name, qty, unit, rate, cost, dmats] of w) {
          desk += num(cost);
          for (const d of dmats) desk += num(d[3]);
          const e = byName.get(name);
          if (!e) continue;
          one(`${tag}: ${name} qty`, e.qty, num(qty));
          one(`${tag}: ${name} unit`, e.unit, unit);
          one(`${tag}: ${name} rate`, e.rate, num(rate));
          one(`${tag}: ${name} cost`, e.cost, num(cost));
          one(`${tag}: ${name} materials`, JSON.stringify(e.materials.map(x => [x.name, x.qty, x.rate, x.cost])),
            JSON.stringify(dmats.map(d => [d[0], num(d[1]), num(d[2]), num(d[3])])));
        }
        const listed = Object.values(project.measurements).flat().filter(m => !PANEL_EXCLUDED.has(m.type));
        const foot = FOOTER_COST(listed);
        one(`${tag}: the Items footer adds the desktop report's money`, Math.abs(foot - desk) < 1e-9, true);
        one(`${tag}: ...and so reads its whole dollars`, PANEL.money(foot), PANEL.money(desk));
        break;
      }
      case 'tile_form': {
        const [area, , needed, pb] = a;
        const got = TILE_READOUT({ areaFt2: area }, 0, needed, pb);
        one(`${tag} area`, (/^(\S+) sq ft/.exec(got) || [])[1], (/^Area (\S+) sq ft$/.exec(w[0]) || [])[1]);
        one(`${tag} with waste`, (/→ {2}(\S+) with waste/.exec(got) || [])[1], (/→ (\S+) tiles$/.exec(w[1]) || [])[1]);
        one(`${tag} boxes`, (/· {2}(\S+) boxes$/.exec(got) || [])[1], (/^(\S+) boxes$/.exec(w[2]) || [])[1]);
        break;
      }
      case 'export_csv': {
        const rows = Reports.collectRows({ metadata: {}, measurements: JSON.parse(k.a[0]), pageCount: 1 },
          i => `X${i + 1}.0`);
        const got = Reports.buildCsv(rows).replace(/^﻿/, '');
        const gl = got.split('\r\n'), wl = w.split('\r\n');
        one(`${tag}: as many lines`, gl.length, wl.length);
        wl.forEach((line, i) => one(`${tag}: line ${i}`, gl[i], line));
        one(`${tag}: a BOM leads it (the desktop's utf-8-sig)`, Reports.buildCsv(rows)[0], '﻿');
        break;
      }
      case 'calib_line': one(tag, CAL_LINE(a[0]), w.split('\n')[0]); break;
      case 'calib_set': {
        const [d, ft] = a;
        const r = controller({ calibrateFt: ft });
        await r.c._finishCalibration([[0, 0], [d, 0]]);
        one(tag, r.alerts[0], w);
        break;
      }
      case 'scale_readout': one(tag, SCALE_READOUT('X', a[0]).split('   ·   ')[1], w); break;
      case 'export_round4': one(tag, P.pyStrFloat(R.round4(a[0])), w); break;
      case 'export_cost': one(tag, P.pyStrFloat(COST(a[0], a[1])), w); break;
      case 'export_tile': one(tag, R.tileBlurb(k.a[0]), w); break;
      case 'export_spacing': one(tag, R.typePrefix({ type: 'linear_count', spacing_in: a[0] }), w); break;
      case 'mat_total': one(tag, `${ASM.num(a[0])} EA (total)`, w); break;
      case 'mat_parent': {
        const got = ASM_HEAD({ name: 'Wall' }, a[0], 'LF');
        one(tag, (/— (\S+) LF\./.exec(got) || [])[1], (/Measurement: (\S+) LF$/.exec(w) || [])[1]);
        break;
      }
      default:
        throw new Error(`no web producer for the desktop's ${k.s}`);
    }
  }
  checks += n;
  fails += bad;
  log(`   ${label}: ${truth.cases.length} cases over ${seen.size} surfaces, ${n} strings compared, ${bad} differing`);
  if (bad) log(`   ...differing by surface: ${JSON.stringify(bySurface)}`);
}
log('\n-- 2. the producers == the desktop\'s own (lifted by text) --');
log(`   (lifted: module ${SNAP.lifted.module.length}, static ${SNAP.lifted.static.length}, `
  + `methods ${SNAP.lifted.methods.length}, slices ${SNAP.lifted.slices.length})`);
await checkCases(SNAP, 'snapshot');

// The wiring the producers above stand on, by text.
ok('the Items list with the chip off reads a row through counting.js\'s valueStr (one port, both modes)',
  /export function valueString\(m\) \{\n {2}return valueStr\(m\);\n\}/.test(await src('js/core/measure.js')));
ok('...and with the chip on too (sheetValueStr falls back to valueStr)',
  /if \(whole && !differs\) return valueStr\(m\);/.test(await src('js/core/counting.js')));
ok('the canvas label is built as rounding-parity builds it (notes hint, shape tag, name line)',
  /const notesHint = m\.notes \? ' \[N\]' : '';\n {4}const tag = shapeTag\(m\);\n {4}const name = String\(m\.name \|\| ''\)\.trim\(\);\n {4}const nameLine = name \? `\$\{name\}\\n` : '';/
    .test(await src('js/render/renderer.js')));
ok('the live read-out is previewLabel\'s', /_drawPreviewLabel\(ctx, pv, ppf\) \{\n {4}const lbl = previewLabel\(pv, ppf\);/
  .test(await src('js/render/renderer.js')));
ok('the zoom readout is the zoom floor\'s label() (main.js drawFrame)',
  /\$\('zoomLabel'\)\.textContent = zoomFloor\.label\(\);/.test(MAIN));
ok('the footer\'s totals are report-html\'s unitTotals, its money the panel\'s own',
  /import \{ unitTotals \} from '\.\/report-html\.js';/.test(ITEMS) && /\$\{money\(cost\)\}/.test(ITEMS));
// A rounded text never feeds back into a stored figure: the Custom… scale
// box shows the sheet's scale to 2 places, and OK on that text as shown
// changes nothing (16.125 px/ft stays 16.125, not the 16.12 on screen).
if (!/\nfunction customScaleAnswer\(/.test(MAIN)) {
  ok('Custom… scale: the box\'s answer is read by customScaleAnswer (main.js), so OK on the text as shown '
    + 'can be told from a figure he typed', false);
} else {
  const answer = lift(MAIN, ['customScaleAnswer']).customScaleAnswer;
  const shown = P.pyFixed(16.125, 2);
  eq('Custom… scale: the box shows 16.125 px/ft as Python rounds it', shown, '16.12');
  eq('...OK on it as shown is no change', answer(shown, shown), 'unchanged');
  eq('...with the spaces a finger leaves too', answer(` ${shown} `, shown), 'unchanged');
  eq('...a figure he typed is read as typed', answer('16.2', shown), 16.2);
  eq('...and 16.13 too (not the figure shown)', answer('16.13', shown), 16.13);
  for (const t of [null, '', '0', '-3', 'junk']) eq(`...${JSON.stringify(t)} is no scale`, answer(t, shown), null);
  ok('...and the Custom… handler sets a scale only from a figure he typed',
    /const shown = pyFixed\(app\.project\.pagePpf\(app\.currentPage\), 2\);\n {4}const txt = await D\.promptDialog\('Custom Scale', 'Pixels per foot', shown,/
      .test(MAIN)
    && /const answer = customScaleAnswer\(txt, shown\);\n {4}if \(typeof answer !== 'number'\) \{ syncScaleSelect\(\); return; \}\n {4}ppf = answer;/
      .test(MAIN));
}
ok('the workbook rounds no rate, cost or total before it writes it (the user\'s rule: a number written as a '
  + 'number stays a raw number)', !/cell\((?:round4|pyRound)\(/.test(fnText(REPORTS, 'exportWorkbook')));

// ── 2b. the workbook: what each cell holds, and what Excel shows of it ─────
// exportWorkbook writes numbers AS numbers. A quantity is rounded before it
// is written, as the desktop's own Takeoff and Materials sheets round it
// (the xlsx_qty cases above hold each one to the desktop's text), so Excel
// has no tie left to round its own way; the All Items sheet holds the
// desktop's own export numbers (round(v, 4), round(qty * rate, 2)) and a
// quantity there is under General, as the desktop's is. A rate, a line's
// cost and the totals of the Takeoff and Materials sheets are written AS
// THEY ARE -- the user's rule -- and each total is the sum of the very cells
// above it, so =SUM of the column equals it (KNOWN.rawMoney: Excel shows a
// cent tie of those its own way). Run on the CSV job of the truth.
/** The desktop's CSV, parsed (csv.writer's QUOTE_MINIMAL). */
function parseCsv(text) {
  const out = [];
  for (const line of text.replace(/^﻿/, '').split('\r\n')) {
    if (!line) continue;
    const row = [];
    let i = 0;
    while (i <= line.length) {
      if (line[i] === '"') {
        let s = '';
        i += 1;
        for (;;) {
          const j = line.indexOf('"', i);
          if (line[j + 1] === '"') { s += line.slice(i, j + 1); i = j + 2; } else { s += line.slice(i, j); i = j + 1; break; }
        }
        row.push(s);
        i += 1;
      } else {
        const j = line.indexOf(',', i);
        const end = j < 0 ? line.length : j;
        row.push(line.slice(i, end));
        i = end + 1;
      }
    }
    out.push(row);
  }
  return out;
}
const RAW_MONEY_COLS = [7, 8];          // Unit Cost, Total (Takeoff and Materials)
async function checkWorkbook(truth, label) {
  const job = truth.cases.find(k => k.s === 'export_csv');
  if (!job) { ok(`${label}: the truth has the CSV job the workbook is checked on`, false); return; }
  const project = { metadata: {}, measurements: JSON.parse(job.a[0]), pageCount: 1 };
  const sheets = await workbookOf(project);
  const sheet = name => (sheets || []).find(s => s.name === name);
  let n = 0, bad = 0;
  const one = (what, got, want) => {
    n += 1;
    if (got === want) return;
    bad += 1;
    if (bad <= 20) log(`FAIL ${label} workbook ${what}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`);
  };
  const isNum = c => c && typeof c === 'object' && typeof c.v === 'number';

  // every number has a style of its own, and one this check can read; and
  // every ROUNDED number (all but the raw money) shows what Python shows at
  // the same places -- Excel has no tie of its own left to round
  for (const sh of sheets || []) {
    sh.rows.forEach((row, r) => row.forEach((c, k) => {
      if (!isNum(c)) {
        if (typeof c === 'number') one(`${sh.name} r${r} c${k}: a number with no style of its own`, c, 'a cell');
        return;
      }
      const fmt = STYLES[c.s] && STYLES[c.s].numFmt;
      if (fmt === undefined) { generalShows(c.v); return; }        // General: its own digits
      if (!formatPlaces(fmt)) { one(`${sh.name} r${r} c${k} (${c.v}): format ${fmt}`, String(fmt), 'a 0.00 / #,##0 format'); return; }
      if (sh.name !== 'All Items' && RAW_MONEY_COLS.includes(k)) return;
      one(`${sh.name} r${r} c${k} (${c.v} as ${fmt}): Excel shows what Python does`, excelShows(c.v, fmt), pythonShows(c.v, fmt));
    }));
  }

  // the Takeoff sheet: each line's rate and cost the report's own numbers, raw,
  // and GRAND TOTAL the sum of the Total cells above it
  const items = Reports.collectItems(project, i => `X${i + 1}.0`);
  const lines = [];
  for (const it of items) {
    lines.push([it.rate, it.cost]);
    for (const mat of it.materials) lines.push([mat.rate, mat.cost]);
  }
  const held = c => (isNum(c) ? c.v : 0);
  const tk = sheet('Takeoff');
  const tkRows = tk ? tk.rows.slice(4, 4 + lines.length) : [];
  one('Takeoff: each line\'s Unit Cost and Total hold the report\'s rate and cost, as they are',
    JSON.stringify(tkRows.map(row => [held(row[7]), held(row[8])])), JSON.stringify(lines));
  let sum = 0;
  for (const row of tkRows) if (isNum(row[8])) sum += row[8].v;
  const grandRow = tk ? tk.rows[tk.rows.length - 1] : [];
  one('Takeoff: GRAND TOTAL is the sum of the Total cells above it (=SUM of the column equals it)', held(grandRow[8]), sum);
  one('...and so is the report\'s total, to the cent', H.money(held(grandRow[8])),
    H.money(lines.reduce((s, [, c]) => s + c, 0)));
  let tie = 0;
  for (const row of tkRows) {
    if (isNum(row[8]) && excelShows(row[8].v, STYLES[row[8].s].numFmt) !== H.money(row[8].v)) tie += 1;
  }
  knownSeen.rawMoney += tie;          // KNOWN.rawMoney: a cent tie Excel shows its own way

  // the Materials sheet: its lines the report's materials, and TOTAL their sum
  const ms = sheet('Materials');
  const mats = items.flatMap(it => it.materials.map(mat => [mat.rate, mat.cost]));
  const msRows = ms ? ms.rows.slice(1, 1 + mats.length) : [];
  one('Materials: each line\'s Unit Cost and Total hold the report\'s, as they are',
    JSON.stringify(msRows.map(row => [held(row[7]), held(row[8])])), JSON.stringify(mats));
  let msum = 0;
  for (const row of msRows) if (isNum(row[8])) msum += row[8].v;
  one('Materials: TOTAL is the sum of the Total cells above it', ms ? held(ms.rows[ms.rows.length - 1][8]) : null, msum);

  // the All Items sheet: the desktop's own export numbers, cell for cell (its
  // CSV, the same rows), a quantity under General as the desktop's is
  const csv = parseCsv(job.w);
  const all = sheet('All Items');
  one('All Items: as many rows as the desktop\'s export', all ? all.rows.length : 0, csv.length);
  const NUMERIC = ['ItemArea', 'ItemDistance', 'ItemCount', 'ItemUnitCost', 'ItemTotalCost'];
  for (let r = 1; all && r < Math.min(all.rows.length, csv.length); r += 1) {
    for (const col of NUMERIC) {
      const k = CSV_COLUMNS.indexOf(col);
      const c = all.rows[r][k];
      const want = csv[r][csv[0].indexOf(col)];
      if (want === '') { one(`All Items r${r} ${col}: empty, as the desktop's`, isNum(c) ? c.v : '', ''); continue; }
      one(`All Items r${r} ${col}: the desktop's number`, isNum(c) ? c.v : null, Number(want));
      if (!col.endsWith('Cost')) one(`All Items r${r} ${col}: under General, as the desktop's`, isNum(c) ? c.s : '', 'general');
    }
  }
  checks += n;
  fails += bad;
  log(`   ${label}: ${n} workbook checks, ${bad} differing`);
}
log('\n-- 2b. the workbook: a quantity rounded as the desktop rounds it, the money as it is, each total its column\'s sum --');
await checkWorkbook(SNAP, 'snapshot');

// The Items list's footer adds the money the reports add: its loop (lifted
// by text from ItemsPanel._updateFoot) over the CSV job's items, against the
// report's own entries -- a count by its points, an item on no sheet by its
// typed quantity ($0.625 of 'Spare' was missing: $15 where the report said
// $15.62), every pin as one (the report_collect cases hold both to the
// desktop's own Report Center).
{
  const job = SNAP.cases.find(k => k.s === 'export_csv');
  const project = { metadata: {}, measurements: JSON.parse(job.a[0]), pageCount: 1 };
  // ...and a priced pitch line with a material: a kind the reports do not
  // list, so neither it nor its material is in their money
  project.measurements['0'].push({ type: 'pitch', name: 'Eave', value: 6.25, unit_cost: 3,
    points: [[0, 0], [48, 25]], associated_items: [{ name: 'Flashing', qty: 2, qty_mode: 'total', unit_cost: 1.5 }] });
  const all = Object.values(project.measurements).flat();
  let report = 0;
  for (const it of Reports.collectItems(project, i => `X${i + 1}.0`)) {
    report += it.cost;
    for (const mat of it.materials) report += mat.cost;
  }
  eq('the Items footer\'s money is the reports\' (the same sum)', FOOTER_COST(all), report);
  eq('...and so reads the same whole dollars', PANEL.money(FOOTER_COST(all)), PANEL.money(report));
  eq('...with the item on no sheet in it: $0.625 + $120 of the CSV job\'s', all.filter(m => m.type === 'standalone')
    .reduce((s, m) => s + M.itemCost(m), 0), 120.625);
  eq('...and the header pin and its hanger in it: $85 + $0.25', all.filter(m => m.type === 'header')
    .reduce((s, m) => s + M.itemCost(m) + M.expandAssembly(m).reduce((t, l) => t + l.cost, 0), 0), 85.25);
}

// ── 3. the source guard ════════════════════════════════════════════════════
// Every number-to-text call left in js/ that is NOT Python's, with why it may
// stay. {file, has: text on the line, why}. A display toFixed added anywhere
// fails here until it goes through pyformat.js -- or is put on this list with
// a reason a reviewer can read.
const ALLOWED = [
  { file: 'js/core/pyformat.js', has: 'a.toFixed(100)', why: 'the exact digits pyFixed rounds from (exact from 2^-14 to 1e21)' },
  { file: 'js/core/pyformat.js', has: 'Math.abs(x).toExponential()', why: 'the shortest round-trip digits str() writes' },
  { file: 'js/main.js', has: 'const key = ppf.toFixed(3);', why: 'a de-duplication key for the scale list, never shown' },
  { file: 'js/main.js', has: 'const mb = (file.size / 1048576).toFixed(file.size > 1e9 ? 0 : 1);',
    why: 'loadProjectFile is the peer session\'s (protected): a KNOWN GAP -- its "Opened ... MB" line still '
      + 'rounds a tie up (1.25 MB reads 1.3) where Recent, the library and the device list say 1.2; the '
      + 'one-line change to pyFixed(file.size / 1048576, file.size > 1e9 ? 0 : 1) waits for the peer' },
  { file: 'js/main.js', has: 'new Date(ms).toLocaleString(', why: 'a date, not a number' },
  { file: 'js/main.js', has: 'new Date(draft.savedAt).toLocaleString()', why: 'a date, not a number (offerDraftRestore, protected)' },
  { file: 'js/ui/plans-archive.js', has: "d.toLocaleString('en-US', { month:", why: 'a date, not a number' },
  { file: 'js/ui/callout-preview.js', has: 'req.zone.map(v => v.toFixed(6))', why: 'a decode cache key, never shown' },
  { file: 'js/ui/thumbnails.js', has: 'translateX(${pull.toFixed(1)}px)', why: 'CSS, not text' },
  // Math.* inside a template substitution
  { file: 'js/main.js', has: 'b.style.background = `rgba(${Math.round(c[0] * 255)}', why: 'a CSS colour' },
  { file: 'js/main.js', has: "$('progressFill').style.width = total ? `${Math.round(", why: 'a CSS width' },
  { file: 'js/ui/items-panel.js', has: '`rgb(${Math.round(c[0] * 255)}', why: 'a CSS colour' },
  { file: 'js/ui/callout-preview.js', has: 'el.style.left = `${Math.round(left)}px`', why: 'CSS pixels' },
  { file: 'js/ui/callout-preview.js', has: 'el.style.top = `${Math.round(top)}px`', why: 'CSS pixels' },
  { file: 'js/render/labels.js', has: 'return `bold ${Math.max(5, Math.round(12 * scale))}px ${FONT_FAMILY}`', why: 'a canvas font size' },
  { file: 'js/ui/dialogs.js', has: '(pb > 0 ? `  ·  ${pyIntStr(Math.ceil(needed / pb), true)} boxes`',
    why: 'f"{int(math.ceil(needed / per_box)):,}", the desktop\'s _tile_refresh: ceil is ceil in both, then Python\'s digits and commas' },
  { file: 'js/core/revisions.js', has: 'return `REV ${Math.trunc(Number(number))}`', why: 'int() truncates in both: the desktop\'s REV words' },
  { file: 'js/render/renderer.js', has: 'text += `  ·  ~${pyIntStr(Math.ceil(sf / tileArea), true)} tiles`', why: 'int(math.ceil(...)), the desktop\'s, then Python\'s digits' },
  { file: 'js/core/save-route.js', has: 'const MB = n => `${Math.round(Number(n) / 1048576)} MB`',
    why: 'save-route.js is the peer session\'s file: a known gap (whole MB, a tie only at an exact half MB)' },
  // every other Math.round in the screens' code: pixels, never text
  { file: 'js/main.js', has: 'cover = Math.max(0, Math.min(s.height, Math.round(s.bottom - b.top)));', why: 'CSS pixels (the foot bar\'s cover)' },
  { file: 'js/main.js', has: 'cv.width = Math.round(r.width * dpr);', why: 'a canvas\'s backing pixels' },
  { file: 'js/main.js', has: 'cv.height = Math.round(r.height * dpr);', why: 'a canvas\'s backing pixels' },
  { file: 'js/main.js', has: '? { dx: Math.round(overlay.dx), dy: Math.round(overlay.dy) }', why: 'a whole-pixel offset for the diff picture' },
  { file: 'js/main.js', has: 'c.width = Math.round(wIn * dpi);', why: 'a blank sheet\'s pixels' },
  { file: 'js/main.js', has: 'c.height = Math.round(hIn * dpi);', why: 'a blank sheet\'s pixels' },
  { file: 'js/ui/callout-preview.js', has: 'maxWidth: Math.max(1, Math.round(rect.w * scale)),', why: 'a decode size in pixels' },
  { file: 'js/ui/callout-preview.js', has: 'const cw = Math.max(1, Math.round(box.w * r));', why: 'a canvas size in pixels' },
  { file: 'js/ui/callout-preview.js', has: 'const ch = Math.max(1, Math.round(box.h * r));', why: 'a canvas size in pixels' },
  { file: 'js/ui/version-bar.js', has: 'c.width = Math.round(w * dpr);', why: 'a canvas\'s backing pixels' },
  { file: 'js/ui/version-bar.js', has: 'c.height = Math.round(h * dpr);', why: 'a canvas\'s backing pixels' },
];
const NUMBER_CALL = /\.toFixed\(|\.toPrecision\(|\.toExponential\(|\.toLocaleString\(|Intl\.NumberFormat|(?:maximum|minimum)FractionDigits/;
/** A string glued on with + (a quote or a backtick beside the +). */
const STRING_GLUE = /['"`]\s*\+|\+\s*['"`]/;
/** Where a line writes text the user reads. */
const TEXT_SINK = /\.(?:textContent|innerText|innerHTML|title|placeholder)\s*=|\b(?:setStatus|sayToFinger|sayStep|alertDialog|promptDialog|confirmDialog)\(|\btext:\s/;
/** The screens' code: the forms, panels and the app shell. */
const SCREENS = /^js\/(?:ui\/[^/]+|main)\.js$/;
/** The `${...}` substitutions on one line (balanced braces). */
function substitutions(line) {
  const out = [];
  for (let i = line.indexOf('${'); i >= 0; i = line.indexOf('${', i + 2)) {
    let depth = 0, j = i + 1;
    for (; j < line.length; j += 1) {
      if (line[j] === '{') depth += 1;
      else if (line[j] === '}') { depth -= 1; if (depth === 0) break; }
    }
    out.push(line.slice(i, j + 1));
  }
  return out;
}
async function* jsFiles(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* jsFiles(p);
    else if (e.name.endsWith('.js')) yield p;
  }
}
/** Every line of js/ that turns a number into text NOT through pyformat.js. */
async function scan(root) {
  const found = [];
  for await (const f of jsFiles(path.join(root, 'js'))) {
    const rel = path.relative(root, f).split(path.sep).join('/');
    const lines = (await readFile(f, 'utf-8')).replace(/\r\n/g, '\n').split('\n');
    lines.forEach((line, k) => {
      const t = line.trim();
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
      const code = line.replace(/\s\/\/ .*$/, '');
      const mathRound = /Math\.(round|trunc|floor|ceil)\(/.test(code);
      const hit = NUMBER_CALL.test(code)
        || substitutions(code).some(s => /Math\.(round|trunc|floor|ceil)\(/.test(s))
        || /String\(Math\.(round|trunc|floor|ceil)\(/.test(code)
        // ...glued onto words with +, or written straight into text
        || (mathRound && (STRING_GLUE.test(code) || TEXT_SINK.test(code)))
        // ...and every Math.round in the screens' code, the one JavaScript
        // rounding that is not Python's (a tie goes up): a figure rounded
        // into a variable there is said a line later (the Compare slider's)
        || (/Math\.round\(/.test(code) && SCREENS.test(rel));
      if (hit) found.push({ file: rel, line: k + 1, text: t });
    });
  }
  return found;
}
async function guard(root, label) {
  const found = await scan(root);
  const used = new Map(ALLOWED.map(a => [a, 0]));
  const stray = [];
  for (const f of found) {
    const a = ALLOWED.find(x => x.file === f.file && f.text.includes(x.has));
    if (a) used.set(a, used.get(a) + 1);
    else stray.push(f);
  }
  for (const s of stray) ok(`${label}: ${s.file}:${s.line} turns a number into text outside pyformat.js `
    + '(use its helpers, or put it on ALLOWED with the reason)', false, s.text);
  for (const [a, k] of used) {
    ok(`${label}: ALLOWED ${a.file} "${a.has}" still matches a line (else drop it)`, k >= 1);
    ok(`${label}: ...and only one (${a.file} "${a.has}")`, k <= 1, `${k} lines`);
  }
  return { found, stray };
}
log('\n-- 3. the source guard --');
const g = await guard(ROOT, 'js/');
log(`   ${g.found.length} number-to-text calls outside pyformat.js's helpers, every one on ALLOWED with its reason`);

// ── 4. live ════════════════════════════════════════════════════════════════
let live = 'skipped: no PTT_DESKTOP_SRC';
if (!(await haveDesktopSource())) {
  log('\n-- 4. live differential SKIPPED (set PTT_DESKTOP_SRC) --');
} else {
  log('\n-- 4. live: the desktop source as it is now --');
  let truth = null;
  try {
    const { stdout } = await run('python', ['-B', path.join(here, 'rounding-python-truth.py'), DESKTOP_SRC],
      { maxBuffer: 1 << 26, windowsHide: true, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
    truth = JSON.parse(stdout);
  } catch (err) {
    fails += 1;
    log(`FAIL the desktop's text producers could not be lifted and run:\n${err.stderr || err.message}`);
  }
  if (truth) {
    log(`   (lifted by text: module ${truth.lifted.module.join(', ')})`);
    checkHelpers(truth, 'live');
    await checkCases(truth, 'live');
    await checkWorkbook(truth, 'live');
    ok('the committed tests/data/rounding-truth.json is the desktop\'s answer as it is now '
      + `(regenerate: python -B tests/rounding-python-truth.py "${DESKTOP_SRC}" --write)`,
    JSON.stringify(truth) === JSON.stringify(SNAP));
    live = 'live differential run';
  }
}

// Every declared divergence was met: one that went away must be dropped.
log('\n-- the declared divergences (each still there) --');
for (const [k, why] of Object.entries(KNOWN)) {
  ok(`KNOWN.${k} is still there (else drop it from KNOWN): ${why}`, knownSeen[k] > 0);
  log(`   ${k}: met ${knownSeen[k]} times -- ${why}`);
}

console.log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass -- every number reads as the desktop writes it (${live})`);
process.exit(fails ? 1 : 0);
