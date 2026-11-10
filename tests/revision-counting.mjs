// WHAT COUNTS — the port against the desktop, so the two cannot disagree on
// a total.
//
// A sheet can carry takeoff on several of its drawings and exactly one of them
// is in the totals. Until 3.05 this app added up every one of them, so the
// same file priced differently here and on the desktop: on one real job 0 sq
// ft there and 2,929.2 sq ft here. js/core/counting.js now ports the desktop's
// counting methods, and this harness holds the port to them three ways:
//
//   1. EDGE CASES and the Python-exact number formatting. Pure; everywhere.
//   2. A COMMITTED SNAPSHOT of the desktop's own answers over synthetic jobs
//      built the way he builds one — an original set, a revision that
//      replaces sheets and adds one in the middle, a second that replaces and
//      adds again, takeoff on revisions, pins and notes, a multi-sheet item,
//      a booked revision with no pages, a page swap, the first takeoff on
//      empty sheets. No client data, so it is committed (tests/data/
//      counting-truth.json) and runs in a fresh clone.
//   3. A LIVE DIFFERENTIAL: the same scenarios regenerated from the desktop
//      source NOW — which also re-checks that the lifted methods are a
//      dependency CLOSURE (an `ast` walk, before anything executes) — and the
//      estimator's whole library, read without its pixels.
//
// Every answer is compared: what counts, item by item; the totals by
// quantity; each sheet's counted, newest and listed drawings; the tiles'
// words and tooltips; one name per revision; the sentence a move would say;
// what the first takeoff on each sheet books, and what it says.
//
// And what each DELETE takes (desktop delete_item / delete_shapes /
// _drop_shape, and _on_item_delete's question word for word): every shape
// of every scenario, and every item of the library, deleted on a fresh copy
// both ways -- the places emptied and the items changed must be the
// desktop's, in as many undo levels, and one Undo must give back the job
// exactly -- a selection of shapes across several sheets included. Plus what
// a job switch leaves of the count tool's state (_drop_per_project_reads),
// over every combination of the tool, the Item box, the counted name and
// what is armed.
//
// And the desktop OPENING what this app saved after each of those deletes:
// it re-adds every multi-shape item on every open (_resync_group_totals) and
// announces any total that comes out different at all, so a total re-added
// here must be the one it finds there, to the bit -- with this app's JSON,
// where a whole number has no point and Python reads an int (pySum).
//
// Run: node tests/revision-counting.mjs
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CountingModel, applyBooking, pyFixed, pyRound, pyG, takeoffQtyText,
  takeoffQty, takeoffMoveWords, takeoffQuantityWords, isTakeoffItem,
  deleteItemQuestion, pySum,
} from '../js/core/counting.js';
import {
  sheetRows, hiddenWords, sheetTitle, sheetTip, sheetNotes, qtyWords, valueStr,
  sheetValueStr, sheetPageWords, countsHere, alsoOn, shapesOnScreen, deleteHereChoice,
  deletedHereWords, deleteName, activateOnThisSheet, activateAcrossSheets,
  propertiesOnThisSheet, NOT_ROWS,
} from '../js/core/counting.js';
import {
  ItemsPanel, SOLO_KEY, SOLO_LABEL, SOLO_HUE, SHEET_SETTING, SHEET_FOLLOW_MS, sheetKeyOf,
} from '../js/ui/items-panel.js';
import { SOLO } from '../js/core/classify.js';
import { Settings, DEFAULT_SETTINGS } from '../js/ui/settings.js';
import { mix } from '../js/render/theme.js';
import {
  revisionShortName, workingVersionOf, newestVersionOf, sheetVersions,
} from '../js/core/revisions.js';
import { Project, resyncGroups } from '../js/core/project.js';
import { ToolController } from '../js/tools/controller.js';
import { choiceDialog } from '../js/ui/dialogs.js';
import { collectItems, collectRows } from '../js/ui/reports.js';
import { parsePyJson, stringifyPyJson } from '../js/core/py-json.js';
import { inTakeoffList, WEB_TAKEOFF } from '../js/core/takeoff-lists.js';
import {
  LIBRARY, DESKTOP_SRC, DATA, haveLibrary, haveDesktopSource, walkProjects,
} from './config.mjs';

const sortObj = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

const run = promisify(execFile);
let fails = 0;
let checks = 0;

function eq(label, got, want) {
  checks += 1;
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) return true;
  fails += 1;
  const show = s => (s && s.length > 700 ? `${s.slice(0, 700)} … (${s.length})` : s);
  console.log(`FAIL ${label}\n  got  ${show(a)}\n  want ${show(b)}`);
  return false;
}
const ok = (label, cond) => eq(label, !!cond, true);

// ═══ 1. the edges ═══════════════════════════════════════════════════════
console.log('-- Python-exact numbers --');
{
  // Python rounds an exact tie to EVEN; toFixed rounds it up.
  eq('1.25 -> 1.2', pyFixed(1.25, 1), '1.2');
  eq('1.35 -> 1.4 (1.35 is just above the tie in binary)', pyFixed(1.35, 1), '1.4');
  eq('0.125 -> 0.12', pyFixed(0.125, 2), '0.12');
  eq('2929.21 with commas', pyFixed(2929.21, 1, true), '2,929.2');
  // 999.95 is a hair ABOVE the tie in binary, so it carries into a new digit.
  eq('999.95 carries', pyFixed(999.95, 1, true), '1,000.0');
  eq('-0.04 keeps its sign', pyFixed(-0.04, 1), '-0.0');
  eq('takeoffQtyText drops .0', takeoffQtyText(1200, 'sq ft'), '1,200 sq ft');
  eq('takeoffQtyText keeps .5', takeoffQtyText(12.5, 'sq ft'), '12.5 sq ft');
  eq('pyRound half-even', pyRound(2.675, 2), 2.67);
  eq('%g of 5', pyG(5), '5');
  eq('%g of 0.5', pyG(0.5), '0.5');
  eq('%g of 1234567', pyG(1234567), '1.23457e+06');
  eq('%g of 0.0001', pyG(0.0001), '0.0001');
  eq('%g of 0.00001', pyG(0.00001), '1e-05');
  eq('a ruler is not takeoff', isTakeoffItem({ type: 'distance' }), false);
  eq('a group container is not takeoff', isTakeoffItem({ type: 'group' }), false);
  eq('a run of a multi-sheet item IS takeoff', isTakeoffItem({ type: 'area', group_child: true }), true);
  eq('a linear count counts whole pieces', takeoffQty({ type: 'linear_count', value: '7.9' }), [7, 'EA']);
  eq('a standalone item keeps its unit', takeoffQty({ type: 'standalone', qty: 3, unit: ' box ' }), [3, 'box']);
  eq('one name: a number that is its own',
    revisionShortName({ description: 'Rev 3' }, 3, []), 'Rev 3');
  eq('one name: a number that is another\'s',
    revisionShortName({ description: 'Revision 10' }, 1, []), 'REV 1');
  const a = { description: 'Bulletin' }, b = { description: 'bulletin' };
  eq('one name: two revisions cannot share one', revisionShortName(a, 1, [a, b]), 'REV 1');
}

// ═══ 1b. the sentence's lists (desktop FIX7 step 3) ════════════════════
console.log('-- one item, one line; never netted --');
{
  const pic = rows => new Map(rows.map((r, i) => [i, [r[0], [r[1], r[2]]]]));
  // ADV-2: Wall T5 20 -> 29 and Wall T6 29 -> 20 were "and 2 more (no net
  // change)" -- 18 sq ft between two separately priced walls.
  const walls = [1, 2, 3, 4, 5, 6].map(k => ({ type: 'area', name: `Wall T${k}` }));
  const b6 = pic(walls.map((m, i) => [m, [13, 13, 13, 13, 20, 29][i], 'sq ft']));
  const a6 = pic(walls.map((m, i) => [m, [8, 8, 8, 8, 29, 20][i], 'sq ft']));
  eq('a swap between two items is named, the biggest first, the rest unnetted',
    takeoffMoveWords(b6, a6, true),
    'Wall T5 20 → 29 sq ft, Wall T6 29 → 20 sq ft, Wall T1 13 → 8 sq ft, '
    + 'Wall T2 13 → 8 sq ft and 2 more: 10 sq ft will leave');
  // a small swap in the rest: priced alike it is summed both ways ...
  const w = [1, 2, 3, 4, 5, 6].map(k => ({ type: 'area', name: `W${k}`, unit_cost: 2 }));
  const bs = pic(w.map((m, i) => [m, [40, 40, 40, 40, 13, 20][i], 'sq ft']));
  const as = pic(w.map((m, i) => [m, [13, 13, 13, 13, 20, 13][i], 'sq ft']));
  eq('a rest priced alike says what came in and what left',
    takeoffMoveWords(bs, as),
    'W1 40 → 13 sq ft, W2 40 → 13 sq ft, W3 40 → 13 sq ft, W4 40 → 13 sq ft '
    + 'and 2 more: 7 sq ft comes in, 7 sq ft leaves');
  // ... and priced apart it is NAMED: the cap is not for hiding a swap
  w[5].unit_cost = 3.5;
  eq('a rest priced apart is named in full', takeoffMoveWords(bs, as),
    'W1 40 → 13 sq ft, W2 40 → 13 sq ft, W3 40 → 13 sq ft, W4 40 → 13 sq ft, '
    + 'W5 13 → 20 sq ft, W6 20 → 13 sq ft');
  // N7: three items of one name are one line
  const three = [0, 1, 2].map(k => ({ type: 'area', name: 'Wall', points: [[k, 0]] }));
  eq('one name, one line', takeoffMoveWords(new Map(), pic(three.map(m => [m, 2, 'sq ft']))),
    '6 sq ft of Wall comes in');
  // N7: the same item re-shaped (an undo installs a copy) is one change...
  const p0 = { type: 'count', name: 'Post', points: [[1, 1], [2, 2], [3, 3]] };
  const p1 = { ...p0, points: [[1, 1], [2, 2]] };
  eq('an undone count click is one change',
    takeoffMoveWords(new Map([[1, [p0, [3, 'EA']]]]), new Map([[2, [p1, [2, 'EA']]]])),
    'Post 3 → 2 EA');
  // ...but takeoff on another drawing is another piece of takeoff
  eq('another drawing is not the same item',
    takeoffMoveWords(new Map([[1, [p0, [3, 'EA']]]]),
      new Map([[2, [{ ...p1, rev_id: 'r1', rev_page: 0 }, [2, 'EA']]]])),
    '3 EA of Post leaves; 2 EA of Post comes in');
  // a change of materials alone is a change
  const s0 = { type: 'area', name: 'Slab', points: [[0, 0]] };
  const s1 = { ...s0, associated_items: [{ name: 'Dumpster', qty: 1, qty_mode: 'total', unit: 'each' }] };
  eq('a material added is said', takeoffMoveWords(new Map([[1, [s0, [25, 'sq ft']]]]),
    new Map([[2, [s1, [25, 'sq ft']]]])), 'Slab 25 sq ft (1 each of Dumpster comes in)');
  // two items of one name on one drawing, priced apart, one leaving and the
  // other arriving at the same quantity: a swap that moves money, said --
  // and priced alike, one item whose shape changed, which moves nothing
  const w1 = { type: 'area', name: 'Wall', unit_cost: 2, points: [[0, 0]] };
  const w2 = { type: 'area', name: 'Wall', unit_cost: 5, points: [[9, 9]] };
  eq('a swap priced apart is said',
    takeoffMoveWords(new Map([[1, [w1, [9, 'sq ft']]]]), new Map([[2, [w2, [9, 'sq ft']]]])),
    '9 sq ft of Wall leaves; 9 sq ft of Wall comes in');
  eq('priced alike it is one item, and nothing moved',
    takeoffMoveWords(new Map([[1, [w1, [9, 'sq ft']]]]),
      new Map([[2, [{ ...w2, unit_cost: 2 }, [9, 'sq ft']]]])), '');
  // two items of one name moving opposite ways are never one line
  const i0 = { type: 'area', name: 'Wall', points: [[0, 0]] };
  const i1 = { type: 'area', name: 'Wall', points: [[9, 9]] };
  eq('opposite ways stay two lines',
    takeoffMoveWords(new Map([[1, [i0, [4, 'sq ft']]], [2, [i1, [6, 'sq ft']]]]),
      new Map([[1, [i0, [6, 'sq ft']]], [2, [i1, [4, 'sq ft']]]])),
    'Wall 4 → 6 sq ft, Wall 6 → 4 sq ft');
  // materials past their limit: the biggest named, the rest unnetted
  const m0 = { type: 'area', name: 'Slab', points: [[0, 0]], value: 10,
    associated_items: [['Mesh', 1], ['Wire', 0.5], ['Rebar', 2]]
      .map(([n, q]) => ({ name: n, qty: q, qty_mode: 'per_unit', unit: 'LF' })) };
  eq('materials: biggest named, the rest unnetted',
    takeoffMoveWords(new Map([[1, [m0, [10, 'sq ft']]]]),
      new Map([[1, [{ ...m0, value: 4 }, [4, 'sq ft']]]])),
    'Slab 10 → 4 sq ft (Rebar 20 → 8 LF, Mesh 10 → 4 LF and 1 more material: 3 LF leaves)');
  // the per-drawing words: two shapes of one item are one entry
  eq('two shapes of one item on a drawing are one entry', takeoffQuantityWords([
    { type: 'area', name: 'Item 23', group_id: 'g', group_child: true, value: 5.8 },
    { type: 'area', name: 'Item 26', value: 3.2 },
    { type: 'area', name: 'Item 23', group_id: 'g', group_child: true, value: 5.8 }]),
  '11.6 sq ft of Item 23, Item 26 3.2 sq ft');
}

// ═══ one scenario through the port ══════════════════════════════════════
// (the SHEET chip's web-only behaviour -- 'Opening …', one rebuild per turn,
// the setting across a reload, the taps that say -- is section 1c, below
// the helpers it uses)

/** The port's model of a scenario, built the way the app builds it. */
function modelOf(input) {
  const md = structuredClone(input.metadata);
  const size = input.pageSize || [64, 48];
  md.revisions = (md.revisions || []).map(r => {
    const out = { ...r, pageCount: Number(r.pages) || 0 };
    delete out.pages;
    return out;
  });
  const sizes = input.pageSizes || {};
  return new CountingModel({
    metadata: md,
    measurements: structuredClone(input.measurements || {}),
    pageCount: input.pageCount,
    order: input.order || 'date',
    sizeOf: p => sizes[String(p)] || size,
    revSizeOf: (rev, rp) => ((rev.sizes || {})[String(rp)] || size),
  });
}

function rankJson(r) { return [r[0], r[1].slice(), r[2]]; }

// ═══ Delete takes what was asked ════════════════════════════════════════

// What this app adds to an item at load and strips on every save: never part
// of a comparison with the desktop's store (project.js RUNTIME_KEYS).
const RUNTIME = ['_uid', 'ppf', 'ppf_recovered', 'scale_label', 'self_intersects'];

/** JSON with every object's keys sorted: two stores compare by content. */
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])]));
  }
  return v;
}
const canonStr = v => JSON.stringify(canon(v));

/** The job as the app opens it: the same Project the screens edit. */
function projectOf(input) {
  const model = modelOf(input);
  const p = new Project();
  p.loadFrom({ metadata: structuredClone(model.md), annotations: {},
    measurements: structuredClone(input.measurements || {}), pageCount: input.pageCount,
    revisionCounts: (model.md.revisions || []).map(r => r.pageCount) });
  return p;
}

/** An item as the desktop's store would hold it, for one that was `raw` there. */
function asDesktop(m, raw) {
  const c = structuredClone(m);
  for (const k of RUNTIME) delete c[k];
  // The app gives an item with no `visible` key `visible: true` at load;
  // the desktop leaves the key out. Both mean shown.
  if (raw && !('visible' in raw) && c.visible === true) delete c.visible;
  return c;
}

/**
 * {gone, changed} -- what a delete did, told the desktop's way (the Python's
 * _Before.delta): the places that were emptied, and the items that stayed
 * but changed, at their place before the delete.
 */
function deltaOf(p, was, input) {
  const here = new Set();
  const changed = [];
  for (const [pg, m] of p.allItems()) {
    const w = was.get(m._uid);
    if (!w) throw new Error('a delete made an item');
    here.add(m._uid);
    const raw = (input.measurements[String(w.pg)] || [])[w.i];
    const now = canonStr(asDesktop(m, raw));
    if (now !== w.json) changed.push([pg, w.i, canon(asDesktop(m, raw))]);
  }
  const gone = [...was.entries()].filter(([u]) => !here.has(u)).map(([, w]) => [w.pg, w.i])
    .sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  changed.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  return { gone, changed };
}

function checkDeletes(input, deletes, label, reopen = null) {
  for (const d of deletes) {
    const p = projectOf(input);
    const was = new Map();
    const uidAt = new Map();
    for (const [pg, m] of p.allItems()) {
      const i = p.measurements[pg].indexOf(m);
      const raw = (input.measurements[String(pg)] || [])[i];
      was.set(m._uid, { pg, i, json: canonStr(asDesktop(m, raw)) });
      uidAt.set(`${pg}:${i}`, m._uid);
    }
    const before = JSON.stringify(p.measurements);
    const at = i => uidAt.get(`${d.page}:${i}`);
    const got = { undo: 0 };
    const tag = `${label} · delete ${d.kind}${d.answer ? ` (${d.answer})` : ''} `
      + (d.kind === 'selection' ? d.at.map(a => a.join(':')).join('+')
        : `${d.page}:${d.kind === 'shapes' ? d.ids.join('+') : d.i}`);
    // the items a shape delete re-adds the totals of (the reopen check)
    const gidsOf = uids => [...new Set(uids.map(u => p.findItem(u)?.item.group_id).filter(Boolean))];
    let touched = [];
    if (d.kind === 'shape') {
      touched = gidsOf([at(d.i)]);
      p.dropShapes([at(d.i)]);
    } else if (d.kind === 'item-of-run') {
      p.removeItems([at(d.i)]);
    } else if (d.kind === 'shapes') {
      touched = gidsOf(d.ids.map(at));
      got.n = p.dropShapes(d.ids.map(at));
    } else if (d.kind === 'selection') {
      const uids = d.at.map(([pg, i]) => uidAt.get(`${pg}:${i}`));
      touched = gidsOf(uids);
      got.n = p.dropShapes(uids);
    } else if (d.kind === 'item') {
      const q = deleteItemQuestion(p.findItem(at(d.i)).item);
      got.asked = [[q.title, q.text, q.buttons, [q.defaultButton]]];
      got.said = [];
      if (d.answer === 'Yes') { p.removeItems([at(d.i)]); got.said = [q.done]; }
    }
    got.undo = p._undo.length;
    if (reopen && touched.length) reopen.push(savedGroups(input, p, touched, tag));
    Object.assign(got, deltaOf(p, was, input));
    const want = { undo: d.undo };
    if ('n' in d) want.n = d.n;
    if ('asked' in d) { want.asked = d.asked; want.said = d.said; }
    want.gone = d.gone;
    want.changed = d.changed.map(([pg, i, m]) => [pg, i, canon(asDesktop(m, m))]);
    const order = ['undo', 'n', 'asked', 'said', 'gone', 'changed'];
    const sorted = o => Object.fromEntries(order.filter(k => k in o).map(k => [k, o[k]]));
    eq(tag, sorted(got), sorted(want));
    // ...and one Undo gives the job back exactly, one Redo takes it again
    if (got.undo === 1) {
      const after = JSON.stringify(p.measurements);
      p.undo();
      eq(`${tag} · one Undo gives back every shape, exactly`, JSON.stringify(p.measurements), before);
      p.redo();
      eq(`${tag} · and Redo takes them again`, JSON.stringify(p.measurements), after);
    }
  }
}

/**
 * What the desktop is handed when it opens the browser's save of `p`: the
 * shapes of the items `gids` names -- all an item's re-add reads, with the
 * metadata that says which drawings count -- in the JSON this app writes,
 * where a whole number has no point.
 */
function savedGroups(input, p, gids, tag) {
  const want = new Set(gids);
  const measurements = {};
  for (const [pg, m] of p.allItems()) {
    if (!want.has(m.group_id)) continue;
    const c = { ...m };
    for (const k of RUNTIME) delete c[k];
    (measurements[String(pg)] ||= []).push(c);
  }
  return { tag, gids, job: { name: tag, pageCount: input.pageCount,
    metadata: input.metadata, measurements } };
}

/**
 * The desktop OPENING what this app saved: it re-adds every multi-shape
 * item from its runs on every open (_resync_group_totals, run here as the
 * desktop's own lifted method) and announces any total that comes out
 * different at all -- "re-added from its runs on opening". A total this
 * app re-added must be the one it finds, to the bit. Python's own sum() of
 * `sums` comes back too, for pySum to be held to.
 */
function desktopReopens(saved, sums = [], promote = []) {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'counting-python-truth.py');
  let out;
  try {
    out = execFileSync('python', [script, '--reopen'], {
      input: stringifyPyJson({ jobs: saved.map(s => s.job), sums, promote }),
      env: { ...process.env, PTT_DESKTOP_SRC: DESKTOP_SRC },
      maxBuffer: 1 << 28, windowsHide: true, encoding: 'utf-8' });
  } catch (err) {
    // A closure break (or a desktop source this harness cannot lift) is a
    // FAIL with the harness's own words -- not a crash whose last line is
    // only "Node.js v...", which is all run-all.mjs would show.
    checks += 1;
    fails += 1;
    console.log('FAIL the desktop could not reopen what this app saved (counting-python-truth.py --reopen):\n  '
      + String(err.stderr || err.message).trim().split('\n').join('\n  '));
    return { moved: saved.map(() => []), sums: [], heirs: [] };
  }
  return parsePyJson(out);
}

function checkReopen(saved, label) {
  if (!saved.length) return;
  const { moved } = desktopReopens(saved);
  let bad = 0;
  saved.forEach((s, k) => {
    const mine = moved[k].filter(([gid]) => s.gids.includes(gid));
    if (mine.length && bad++ < 5) eq(`${s.tag} · the desktop re-adds it on opening the save`, mine, []);
  });
  if (bad > 5) eq(`${label} · ${bad - 5} more totals the desktop re-adds on opening`, bad, 0);
  eq(`${label} · ${saved.length} saves after a delete: the desktop's open re-adds no total the web re-added`,
    bad, 0);
}

/** desktop _drop_per_project_reads, as the browser's count tool keeps it. */
function checkJobSwitch(cases, label) {
  for (const k of cases) {
    const p = new Project();
    const held = { type: 'count', name: 'Outlets', points: [[1, 1]] };
    p.loadFrom({ metadata: {}, annotations: {}, measurements: { 0: [held] }, pageCount: 1 });
    const canvas = { addEventListener() {}, setPointerCapture() {}, style: {} };
    const c = new ToolController({ canvas, viewport: { zoom: 1, toPage: pt => pt },
      project: p, currentPage: () => 0, host: {} });
    let told = 0;
    c.addEventListener('tool-name', () => { told += 1; });
    c.mode = k.mode;
    c.options.pendingName = k.box;
    c.countNamed = k.named;
    if (k.armed === 'target') c.countTarget = p.measurements[0][0];
    if (k.armed === 'spec') c.countSpec = { name: 'Outlets', floor_level: 'Level 1' };
    c._lastFloor = 'Level 3';
    c._lastSub = 'Rough-in';
    c._lastCostType = 'labor';
    p.loadFrom({ metadata: {}, annotations: {}, measurements: {}, pageCount: 1 });
    const got = {
      cleared: told > 0,
      box: c.options.pendingName,
      armed: c.countTarget ? 'target' : c.countSpec ? 'spec' : 'none',
      named: c.countNamed,
      lastFloor: c._lastFloor || '',
      lastSub: c._lastSub || '',
      lastCostType: c._lastCostType || 'material',
    };
    const w = k.after;
    got.category = c.options.countCategory;
    eq(`${label} · ${k.mode}, box ${JSON.stringify(k.box)}, counted as ${JSON.stringify(k.named)}, `
      + `${k.armed} armed`, got, { cleared: w.cleared, box: w.box, armed: w.armed, named: w.named,
      lastFloor: w.lastFloor, lastSub: w.lastSub, lastCostType: w.lastCostType,
      category: w.category });
  }
}

function checkScenario(input, truth, label, { words = true, reopen = null, sheet = 'full' } = {}) {
  const model = modelOf(input);
  const n = input.pageCount;

  // ── per item ──
  const rows = [];
  for (const k of model.pageKeys()) {
    model.items(k).forEach((m, i) => {
      const row = {
        page: k, i,
        takeoff: isTakeoffItem(m),
        counts: model.itemCountsTowards(k, m),
        run: model.runCountsTowards(k, m),
        waiting: model.waitingReason(k, m, true),
        waitingLong: model.waitingReason(k, m),
      };
      if (['page_ref', 'textnote'].includes(m.type) && k >= 0 && k < n) {
        row.mark = model.markVersion(k, m);
      }
      rows.push(row);
    });
  }
  const byPos = r => `${r.page}:${r.i}`;
  const want = new Map(truth.items.map(r => [byPos(r), r]));
  eq(`${label} · item count`, rows.length, truth.items.length);
  for (const r of rows) {
    const w = want.get(byPos(r));
    if (!w) { eq(`${label} · item ${byPos(r)} exists on the desktop`, false, true); continue; }
    eq(`${label} · item ${byPos(r)}`, r, w);
  }

  // ── the totals, by quantity ──
  const pos = new Map();
  for (const k of model.pageKeys()) model.items(k).forEach((m, i) => pos.set(m, [k, i]));
  const tot = [];
  for (const [m, [, [q, u]]] of model.countedQuantities()) {
    const [pg, i] = pos.get(m);
    tot.push([pg, i, pyRound(q, 6), u]);
  }
  tot.sort((x, y) => (x[0] - y[0]) || (x[1] - y[1]));
  eq(`${label} · the counted items and their quantities`, tot, truth.counted);
  const sums = {};
  for (const r of tot) sums[r[3]] = pyRound((sums[r[3]] || 0) + r[2], 6);
  eq(`${label} · THE TOTALS`, sums, truth.sums);

  // ...and the REPORT this app prints and exports adds up to the same: the
  // Report Center as it opens (dimensions not included, as on the desktop),
  // the printed rows and the CSV/Excel rows both.
  {
    const p = new Project();
    p.loadFrom({ metadata: structuredClone(model.md), annotations: {},
      measurements: structuredClone(input.measurements || {}), pageCount: n,
      revisionCounts: (model.md.revisions || []).map(r => r.pageCount) });
    const lbl = i => `S${i}`;
    const fromItems = {};
    for (const e of collectItems(p, lbl, { includeDims: false })) {
      fromItems[e.unit] = pyRound((fromItems[e.unit] || 0) + e.qty, 6);
    }
    eq(`${label} · the printed report adds up to the desktop's totals`, sortObj(fromItems), sortObj(truth.sums));
    // The flat rows carry no unit column, only which column the quantity
    // is in; the job's own sheets are compared (the standalone bucket's
    // units are whatever was typed, and it always counts).
    // Each row is rounded to 4 places, as the desktop's CSV rounds it, so
    // the sums agree to within half a unit in the 4th place per row.
    const fromRows = {};
    let nRows = 0;
    for (const r of collectRows(p, lbl, { includeDims: false })) {
      if (r.ItemType === 'Material' || r.ItemLocation === '—') continue;
      const q = r.ItemArea ?? r.ItemDistance ?? r.ItemCount;
      const u = r.ItemArea != null ? 'sq ft' : r.ItemDistance != null ? 'LF' : 'EA';
      fromRows[u] = (fromRows[u] || 0) + q;
      nRows += 1;
    }
    const onSheets = {};
    for (const [pg, , q, u] of truth.counted) {
      if (pg >= 0) onSheets[u] = (onSheets[u] || 0) + q;
    }
    const tol = 5e-5 * nRows + 1e-9;
    const units = [...new Set([...Object.keys(fromRows), ...Object.keys(onSheets)])].sort();
    ok(`${label} · the CSV and the workbook add up to the desktop's totals`,
      units.every(u => u in fromRows && u in onSheets && Math.abs(fromRows[u] - onSheets[u]) <= tol),
      `rows ${JSON.stringify(sortObj(fromRows))} desktop ${JSON.stringify(sortObj(onSheets))}`);
  }

  // ── per sheet ──
  for (let p = 0; p < n; p++) {
    const r = model.sheetRanks(p);
    const got = {
      working: model.workingVersionOf(p),
      newest: model.newestVersionOf(p),
      versions: model.sheetVersions(p).map(v => [v.revId, v.label, v.revPage]),
      own: rankJson(r.own),
      ranked: r.ranked.map(([rk, id]) => [rankJson(rk), id]),
      originDate: model.originDate(p),
      byVersion: Object.fromEntries(model.itemsByVersion(p)),
      label: model.pageLabel(p),
    };
    eq(`${label} · sheet ${p}`, got, truth.pages[p]);
    // ...and the same three questions asked the way the app's screens ask
    // them: with EVERY record in metadata.revisions, including one whose
    // pages the file does not carry. The model hands the functions the
    // desktop's list already; main.js hands them everything.
    const all = model.md.revisions;
    const sv = model.md.sheet_version;
    const org = model.md.sheet_origin;
    eq(`${label} · sheet ${p} · as the screens ask it`, {
      working: workingVersionOf(p, all, sv),
      newest: newestVersionOf(p, all, model.order, org),
      versions: sheetVersions(p, all, org).map(v => [v.revId, v.label, v.revPage]),
    }, { working: truth.pages[p].working, newest: truth.pages[p].newest,
      versions: truth.pages[p].versions });
  }

  // ── tiles ──
  const tiles = {};
  for (const [p, st] of Object.entries(model.sheetTileStates())) {
    tiles[p] = { kind: st.kind, text: st.text, short: st.short, added: st.added,
      shows: st.shows, tip: st.tip };
  }
  eq(`${label} · the tiles`, tiles, truth.tiles);

  // ── names ──
  const names = {};
  for (const id of Object.keys(truth.names)) {
    names[id] = { name: model.revName(id), hidden: model.revName(id, true),
      number: model.revisionNumber(id), title: model.revTitle(id),
      version: model.versionName(id) };
  }
  eq(`${label} · one name per revision`, names, truth.names);

  // ── what a move would say ──
  if (words) {
    const effect = [];
    for (let p = 0; p < n; p++) {
      for (const v of model.sheetVersions(p)) {
        effect.push([p, v.revId, model.totalsEffectWords({ book: { [p]: v.revId } })]);
      }
    }
    eq(`${label} · the sentence each book would say`, effect, truth.effect);
    const drop = model.revs.map(r => [String(r.id),
      model.totalsEffectWords({ dropRevs: [r.id], future: false })]);
    eq(`${label} · the sentence deleting each revision would say`, drop, truth.dropEffect);
  }

  // ── the first takeoff books ──
  const book = [];
  for (let p = 0; p < n; p++) {
    const targets = [['', null], ...model.sheetVersions(p).filter(v => v.revId)
      .map(v => [v.revId, v.revPage])];
    for (const [rid, rp] of targets) {
      const m = { type: 'area', name: 'Probe', value: 12.5,
        points: [[0, 0], [10, 0], [10, 10]], visible: true };
      if (rid) { m.rev_id = rid; m.rev_page = rp; }
      const ch = model.firstTakeoffBooking(p, m);
      const md = structuredClone(model.md);
      if (ch) applyBooking(md, ch);
      const bo = {};
      for (const r of md.revisions || []) {
        if (r.booked_over && Object.keys(r.booked_over).length && (r.pageCount || 0) > 0) {
          bo[String(r.id)] = r.booked_over;
        }
      }
      // The sentence is worded on the job AFTER the takeoff is filed, as the
      // desktop words it (its _add_measurement files it, then the price
      // sentence is said): the booking applied, the probe on its sheet.
      let said = [];
      if (ch && ch.says) {
        const filed = new CountingModel({ metadata: md,
          measurements: { ...model.meas, [p]: [...model.items(p), m] },
          pageCount: n, order: model.order, sizeOf: model.sizeOf, revSizeOf: model.revSizeOf });
        said = [filed.firstTakeoffSaid(p, rid, ch.before)];
      }
      book.push({ page: p, rev: rid, revPage: rp, booked: !!ch,
        book: md.sheet_version === undefined ? null : md.sheet_version,
        bookedOver: bo, said });
    }
  }
  eq(`${label} · what the first takeoff on each drawing books`, book, truth.book);

  // ── the questions and the sentences ──
  if (words) {
    const ask = [];
    for (let p = 0; p < n; p++) {
      for (const v of model.sheetVersions(p)) {
        const q = model.countQuestion(p, v.revId);
        ask.push([p, v.revId, q ? [q.refused || q.body] : []]);
      }
    }
    eq(`${label} · "which drawing does this sheet count from?" — every one`, ask, truth.ask);

    const after = [];
    for (const k of model.pageKeys()) {
      model.items(k).forEach((m, i) => {
        if (!(k >= 0 && k < n) || !isTakeoffItem(m) || model.itemCountsTowards(k, m)) return;
        const rid = String(m.rev_id || '');
        const q = model.countQuestion(k, rid, model.afterTakeoffLead(k, m));
        const said = model.workingVersionOf(k) !== rid ? [model.declinedSentence(k, m)] : [];
        after.push([k, i, q ? [q.refused || q.body] : [], said]);
      });
    }
    after.sort((x, y) => (x[0] - y[0]) || (x[1] - y[1]));
    const wantAfter = truth.after.slice().sort((x, y) => (x[0] - y[0]) || (x[1] - y[1]));
    eq(`${label} · the question after takeoff lands where it does not count, and a No`, after, wantAfter);

    const setSaid = [];
    for (let p = 0; p < n; p++) {
      for (const v of model.sheetVersions(p)) {
        const ch = model.workingVersionChange(p, v.revId);
        if (!ch) { setSaid.push([p, v.revId, false, []]); continue; }
        const after2 = model.variant({ sheetVersion: ch.book }).countedQuantities();
        setSaid.push([p, v.revId, true,
          [model.bookedSentence(p, v.revId, ch.was, model.countedQuantities(), after2)]]);
      }
    }
    eq(`${label} · what Count this version says`, setSaid, truth.setSaid);

    const lone = model.loneUncountedSheets();
    eq(`${label} · sheets taken off only on a drawing that does not count`, lone, truth.lone);
    eq(`${label} · the line said when such a job opens`,
      lone.length ? model.leftOutSentence(lone, 'Not in your totals') : '', truth.leftOut);

    const watch = [];
    for (let p = 0; p < n; p++) {
      const m2 = modelOf(input);
      const lst = m2.items(p);
      const wid = m2.workingVersionOf(p);
      const here = lst.filter(m => isTakeoffItem(m) && String(m.rev_id || '') === wid);
      if (!here.length) continue;
      const prev = m2.countedState();
      m2.meas[p] = lst.filter(m => !here.includes(m));
      const s = m2.watchSentence(prev);
      watch.push([p, s ? [s] : []]);
    }
    eq(`${label} · the sentence when the counted drawing is emptied`, watch, truth.watch);
  }

  // ── the Current Set ──
  for (const order of ['date', 'column']) {
    const m2 = new CountingModel({ metadata: model.md, measurements: model.meas,
      pageCount: n, order });
    const { rows: lrows, notes } = m2.latestSheets();
    const got = {
      rows: lrows.map(r => ({ sheet: r.sheet, source: r.source, date: r.date,
        from: r.from, versions: r.versions, kind: r.kind, usedCol: r.usedCol,
        cols: Object.fromEntries(Object.entries(r.cols).map(([k, v]) => [String(k), v])) })),
      notes,
    };
    eq(`${label} · the Current Set (${order})`, got, truth.latest[order]);
  }

  // ── what each Delete takes ──
  // A truth from before deletes were lifted has none; that is a stale
  // snapshot, said as a failure rather than skipped as if it had passed.
  if (!Array.isArray(truth.deletes)) {
    eq(`${label} · the truth says what each delete takes (regenerate it)`, false, true);
  } else {
    checkDeletes(input, truth.deletes, label, reopen);
  }

  // ── the SHEET chip: the list on one sheet, a row's words, its tap,
  //    its Properties… and its Delete ──
  if (!Array.isArray(truth.sheet)) {
    eq(`${label} · the truth says what the SHEET chip lists (regenerate it)`, false, true);
  } else {
    checkSheet(input, truth.sheet, label, { dom: sheet === 'full' });
  }
  if (sheet === 'full') {
    if (!truth.sheetActs) eq(`${label} · the truth says what a row does on one sheet (regenerate it)`, false, true);
    else checkSheetActs(input, truth.sheetActs, label);
  }
}

// ═══ the SHEET chip: the list on one sheet (desktop 3.06) ═══════════════
//
// Held to the desktop's own TakeoffItemsPanel methods (_sheet_rows,
// _hidden_words, _title_for, _qty_words, _sheet_value_str, _value_str,
// _also_on, _counts_here, and the lines of refresh and _item_row that word
// the notes, the title and a row's sheet label, lifted by text) and its
// window's (_ask_delete_here, _shapes_on_screen, _on_item_delete,
// _activate_on_this_sheet, _on_item_activated, _properties_on_this_sheet),
// for every sheet x every drawing of it x every filter of every scenario:
// the pure ports in counting.js, AND the real ItemsPanel rendering them
// on stand-in elements.

// Enough of a document for the Items list: elements with children, classes,
// datasets, titles and listeners, and a click delivered to its target and
// then up through each parent (stopPropagation honoured).
class StubEl {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.parentNode = null;
    this.className = '';
    this.style = {};
    this.dataset = {};
    this.attrs = {};
    this.title = '';
    this.value = '';
    this.id = '';
    this.hidden = false;
    this.scrollTop = 0;
    this._text = '';
    this._l = [];
    const cls = () => this.className.split(/\s+/).filter(Boolean);
    this.classList = {
      add: (...cs) => { for (const c of cs) if (!cls().includes(c)) this.className = [...cls(), c].join(' '); },
      remove: (...cs) => { this.className = cls().filter(x => !cs.includes(x)).join(' '); },
      contains: c => cls().includes(c),
      toggle: (c, on) => {
        const want = on === undefined ? !cls().includes(c) : !!on;
        if (want) this.classList.add(c); else this.classList.remove(c);
        return want;
      },
    };
  }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); for (const c of this.children) c.parentNode = null; this.children = []; }
  get isConnected() { for (let x = this; x; x = x.parentNode) if (x === this.ownerDocument) return true; return false; }
  appendChild(c) {
    if (c.tagName === '#FRAGMENT') { for (const k of [...c.children]) this.appendChild(k); return c; }
    if (c.parentNode) c.parentNode.children = c.parentNode.children.filter(x => x !== c);
    c.parentNode = this;
    this.children.push(c);
    return c;
  }
  addEventListener(t, fn) { this._l.push({ t, fn }); }
  removeEventListener(t, fn) { this._l = this._l.filter(l => !(l.t === t && l.fn === fn)); }
  descendants() { return this.children.flatMap(c => [c, ...c.descendants()]); }
  matches(sel) {
    if (sel.includes(',')) return sel.split(',').some(s => this.matches(s));
    const m = /^([a-z]*)((?:\.[\w-]+)*)$/i.exec(sel.trim());
    if (!m) return false;
    if (m[1] && this.tagName !== m[1].toUpperCase()) return false;
    return m[2].split('.').filter(Boolean).every(c => this.classList.contains(c));
  }
  querySelector(sel) { return this.descendants().find(e => e.matches(sel)) || null; }
  querySelectorAll(sel) { return this.descendants().filter(e => e.matches(sel)); }
  closest(sel) { for (let x = this; x && x.tagName; x = x.parentNode) if (x.matches(sel)) return x; return null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 200, bottom: 20, width: 200, height: 20 }; }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(x => x !== this);
    this.parentNode = null;
  }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
}

function stubDocument() {
  const doc = new StubEl('#document', null);
  doc.ownerDocument = doc;
  doc.createElement = tag => new StubEl(tag, doc);
  doc.createElementNS = (ns, tag) => new StubEl(tag, doc);
  doc.createDocumentFragment = () => new StubEl('#fragment', doc);
  doc.documentElement = doc.appendChild(new StubEl('html', doc));
  doc.documentElement.style.setProperty = () => {};
  doc.body = doc.documentElement.appendChild(new StubEl('body', doc));
  doc.add = (tag, id) => { const e = new StubEl(tag, doc); e.id = id; return doc.body.appendChild(e); };
  doc.click = (target, extra = {}) => {
    const ev = { type: 'click', target, detail: 1, _stop: false,
      stopPropagation() { this._stop = true; }, preventDefault() {}, ...extra };
    for (let x = target; x && !ev._stop; x = x.parentNode) {
      for (const l of [...x._l]) if (l.t === 'click') l.fn.call(x, ev);
    }
    return ev;
  };
  return doc;
}

// A clock of the test's own, put in as the global one while a block runs.
function withClock(fn) {
  let now = 0;
  let seq = 0;
  const due = new Map();
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  globalThis.setTimeout = (f, ms = 0) => { seq += 1; due.set(seq, { at: now + Math.max(0, ms), f }); return seq; };
  globalThis.clearTimeout = id => { due.delete(id); };
  const clock = {
    get now() { return now; },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const [id, t] of due) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
        if (!next) break;
        due.delete(next[0]);
        now = next[1].at;
        next[1].f();
      }
      now = end;
    },
  };
  try { return fn(clock); } finally {
    globalThis.setTimeout = realSet;
    globalThis.clearTimeout = realClear;
  }
}

/** A settings store as main.js hands the panel app.settings. */
function stubSettings(values = {}) {
  return { values: { ...values }, sets: 0, get(k) { return this.values[k]; },
    set(k, v) { this.values[k] = v; this.sets += 1; } };
}

/** The real ItemsPanel on stand-in elements, over the job `input` as the
 *  app opens it, with the host the app gives it. */
function sheetRig(input, { view = null, chip = false, settings = null, touch = false } = {}) {
  const doc = stubDocument();
  const was = globalThis.document;
  globalThis.document = doc;
  const p = projectOf(input);
  const size = input.pageSize || [64, 48];
  const sizes = input.pageSizes || {};
  const state = { view, said: [], calls: [] };
  const posOf = new Map();
  for (const [pg, m] of p.allItems()) posOf.set(m._uid, [pg, p.measurements[pg].indexOf(m)]);
  const host = {
    pageLabel: i => p.pageLabel(i),
    counting: () => new CountingModel({ metadata: p.metadata, measurements: p.measurements,
      pageCount: p.pageCount, order: input.order || 'date', sizeOf: q => sizes[String(q)] || size,
      revSizeOf: (rev, rp) => ((rev.sizes || {})[String(rp)] || size) }),
    readOnly: () => false,
    view: () => state.view,
    settings: settings || stubSettings({ [SHEET_SETTING]: chip }),
    say: t => state.said.push(t),
    touchLayout: () => touch,
    listShown: () => true,
    hint: () => {},
    selectItem: (m, pg, ev) => state.calls.push(['select', posOf.get(m._uid), ev && ev.detail]),
    openProperties: m => state.calls.push(['properties', posOf.get(m._uid)]),
    showItemMenu: () => null,
    showMenu: () => null,
    canClassifyFromHeadings: () => false,
  };
  const panel = new ItemsPanel({
    root: doc.body, listEl: doc.add('div', 'itemList'), floorFilterEl: doc.add('select', 'floorFilter'),
    groupFilterEl: doc.add('select', 'groupFilter'), costToggleEl: null, footEl: doc.add('div', 'itemsFoot'),
    sheetChipEl: doc.add('button', 'sheetChip'), titleEl: doc.add('span', 'itemsTitle'),
    project: p, host,
  });
  const kids = () => panel.listEl.children;
  return {
    doc, p, panel, state, posOf,
    restore() { globalThis.document = was; },
    rows: () => kids().filter(e => e.classList.contains('row')),
    notes: () => kids().filter(e => e.classList.contains('sheet-note')),
    headings: () => kids().filter(e => e.classList.contains('grp')),
    part: (row, cls) => row.querySelector(`.${cls}`),
  };
}

const viewOfRec = r => ({ page: r.page, revId: r.rev || '', revPage: r.rev ? r.revPage : null, coming: false });

/** Every sheet x drawing x filter: the pure ports, then the real panel. */
function checkSheet(input, recs, label, { dom = true } = {}) {
  let bad = 0;
  const once = (tag, got, want) => {
    if (JSON.stringify(got) === JSON.stringify(want)) { checks += 1; return; }
    bad += 1;
    if (bad <= 8) eq(tag, got, want); else { checks += 1; fails += 1; }
  };
  const model = modelOf(input);
  const pos = new Map();
  for (const k of model.pageKeys()) model.items(k).forEach((m, i) => pos.set(m, [k, i]));
  // the rows the web's refresh lists before the chip: its own filter walk
  // -- and, since 3.08, only the takeoff he is in (Main, the web's), as the
  // desktop's refresh walks it (`if not gl.in_active_list(m): continue`)
  const inList = m => inTakeoffList(m, WEB_TAKEOFF);
  const listed = (cost, floor, group) => {
    const out = [];
    for (const key of Object.keys(model.meas)) {
      for (const m of model.meas[key]) {
        if (['distance', 'textnote', 'page_ref', 'pitch', 'ref_distance', 'group'].includes(m.type)) continue;
        if (m.group_child) continue;
        if (!inList(m)) continue;
        const fl = String(m.floor_level || '').trim();
        const cat = String(m.category || '').trim();
        if (cost !== 'all' && (m.cost_type || 'material') !== cost) continue;
        if (floor !== null && fl !== floor) continue;
        if (group !== null && cat !== group) continue;
        out.push([Number(key), m]);
      }
    }
    return out;
  };
  const byPos = list => list.map(m => pos.get(m)).sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  // The chip-off footer under each filter, through the real panel: what the
  // chip-on footer must total (it is the whole job's, never one sheet's).
  const offFeet = new Map();
  const footOff = (cost, floor, group) => {
    const key = JSON.stringify([cost, floor, group]);
    if (!offFeet.has(key)) {
      const rig = sheetRig(input, { view: null, chip: false });
      try {
        Object.assign(rig.panel, { costFilter: cost, floorFilter: floor, groupFilter: group });
        rig.panel.refresh();
        offFeet.set(key, rig.panel.footEl.textContent || '');
      } finally { rig.restore(); }
    }
    return offFeet.get(key);
  };
  for (const r of recs) {
    const tag = `${label} · SHEET on ${r.label} (${r.rev || 'own'}) ${r.cost}${r.floor ? ` floor ${r.floor}` : ''}`
      + `${r.group ? ` group ${r.group}` : ''}`;
    once(`${tag} · the title`, [sheetTitle(model.pageLabel(r.page)), sheetTip(model.pageLabel(r.page))], [r.title, r.tip]);
    if (r.empty) continue;
    const view = viewOfRec(r);
    const all = listed(r.cost, r.floor, r.group);
    const sh = sheetRows(model, all, view, inList);
    once(`${tag} · the rows`, byPos(sh.rows.map(([, m]) => m)), r.rows.map(x => x.at));
    once(`${tag} · the items on no sheet`, byPos(sh.solo.map(([, m]) => m)), r.solo);
    once(`${tag} · what is left out, by item`, [sh.hidden, sh.filtered], [r.hidden, r.filtered]);
    once(`${tag} · the words for it`, hiddenWords(sh.hidden), r.words);
    const notes = sheetNotes(sh, model.pageLabel(r.page));
    once(`${tag} · the sentence on top, and 'Not shown:'`,
      [notes.top ? [[notes.top, true]] : [], notes.footer], [r.top, r.footer]);
    for (const w of r.rows) {
      const m = model.items(w.at[0])[w.at[1]];
      const here = sh.here.get(m) || [];
      const ch = countsHere(model, r.page, here);
      const pw = sheetPageWords(model, w.at[0], m, here, ch, sh.pages);
      once(`${tag} · row ${w.at.join(':')} ${m.name || m.type}`, {
        here: here.map(s => pos.get(s)), countedHere: ch,
        value: sheetValueStr(model, w.at[0], m, here, ch, sh.shapes),
        text: pw.text, tip: pw.tip, also: alsoOn(sh.pages, w.at[0], m).map(q => model.pageLabel(q)),
        counts: pw.counts, chip: pw.chip,
      }, { here: w.here, countedHere: w.countedHere, value: w.value, text: w.text, tip: w.tip,
        also: w.also, counts: w.counts, chip: w.chip });
    }
    if (!dom) continue;
    // ...and the list the real panel renders: every section opened, so every
    // row is there to be read
    const rig = sheetRig(input, { view, chip: true });
    try {
      const { panel } = rig;
      panel.costFilter = r.cost;
      panel.floorFilter = r.floor;
      panel.groupFilter = r.group;
      panel.collapsed.clear();
      panel.refresh();
      once(`${tag} · the panel's title`, [panel.titleEl.textContent, panel.titleEl.title], [r.title, r.tip]);
      const rows = rig.rows();
      const at = rows.map(e => rig.posOf.get(e.dataset.id));
      once(`${tag} · the panel lists the rows and the items on no sheet`,
        at.slice().sort((a, b) => (a[0] - b[0]) || (a[1] - b[1])),
        [...r.rows.map(x => x.at), ...r.solo].sort((a, b) => (a[0] - b[0]) || (a[1] - b[1])));
      for (const w of r.rows) {
        const e = rows[at.findIndex(a => a[0] === w.at[0] && a[1] === w.at[1])];
        if (!e) continue;
        const pg = rig.part(e, 'pg');
        const tagEl = rig.part(e, 'nc-tag');
        once(`${tag} · the panel's row ${w.at.join(':')}`, {
          value: rig.part(e, 'val')?.textContent || '', text: pg.textContent, tip: pg.title,
          crossed: e.classList.contains('nc'), tag: tagEl ? tagEl.textContent : '',
        }, { value: w.value, text: w.text, tip: w.counts ? w.tip : w.tip.split('\n')[0],
          crossed: !w.counts, tag: w.counts ? '' : '⊘ NOT COUNTED' });
      }
      const notesNow = rig.notes();
      const kids = panel.listEl.children;
      const soloAt = kids.findIndex(e => e.classList.contains('grp')
        && e.querySelector('.grp-label')?.textContent.includes(SOLO_LABEL.toUpperCase()));
      const want = [];
      if (r.top.length) want.push([r.top[0][0], 0, true]);
      if (r.footer) want.push([r.footer, r.solo.length ? soloAt - 1 : kids.length - 1, false]);
      once(`${tag} · the panel says what is left out, where the desktop does`,
        notesNow.map(e => [e.textContent, kids.indexOf(e), e.classList.contains('empty')]), want);
      if (r.solo.length) {
        const lastHere = kids.findLastIndex(e => e.classList.contains('row') && !r.solo.some(s => {
          const q = rig.posOf.get(e.dataset.id);
          return q[0] === s[0] && q[1] === s[1];
        }));
        once(`${tag} · NOT ON A SHEET is last, in its grey`,
          [soloAt > lastHere, kids[soloAt]?.style.borderLeftColor], [true, mix(SOLO_HUE, 0.9)]);
      }
      // the whole job's totals, as the chip-off footer has them under the
      // same filters -- 'Whole job:', or 'Whole job, filtered:' when one narrows them
      const off = footOff(r.cost, r.floor, r.group);
      const narrowed = r.cost !== 'all' || r.floor !== null || r.group !== null;
      once(`${tag} · the footer is the whole job's (as filtered), and says so`, panel.footEl.textContent || '',
        off ? `${narrowed ? 'Whole job, filtered: ' : 'Whole job: '}${off}` : '');
    } finally { rig.restore(); }
  }
  if (bad > 8) console.log(`   (${bad - 8} more SHEET differences in ${label})`);
}

/** A row's tap, its Properties… and its Delete, the chip on; its tap off. */
function checkSheetActs(input, acts, label) {
  const verb = 'double-click';
  for (const a of acts.activate) {
    const model = modelOf(input);
    const pos = new Map();
    for (const k of model.pageKeys()) model.items(k).forEach((m, i) => pos.set(m, [k, i]));
    const m = model.items(a.at[0])[a.at[1]];
    const view = viewOfRec(a);
    let cycle = null;
    const seq = [];
    for (let k = 0; k < a.seq.length; k++) {
      const hit = activateOnThisSheet(model, view, a.at[0], m, cycle, verb);
      if (hit) {
        cycle = hit.cycle;
        seq.push({ said: hit.said ? [hit.said] : [], sel: [pos.get(hit.target)], zoom: [pos.get(hit.target)], edit: [], went: [] });
      } else {
        const st = activateAcrossSheets(model, a.at[0], m, cycle, verb);
        cycle = st.cycle;
        seq.push({ said: st.said ? [st.said] : [], sel: [pos.get(st.target[1])], zoom: [pos.get(st.target[1])],
          edit: [], went: [[st.target[0], pos.get(st.target[1])]] });
      }
    }
    eq(`${label} · a tap on ${a.at.join(':')} (${m.name}) on ${model.pageLabel(a.page)} (${a.rev || 'own'}), `
      + `${a.seq.length} times`, { local: shapesOnScreen(model, view, a.at[0], m).map(s => pos.get(s)), seq },
    { local: a.local, seq: a.seq });
  }
  for (const a of acts.across) {
    const model = modelOf(input);
    const pos = new Map();
    for (const k of model.pageKeys()) model.items(k).forEach((m, i) => pos.set(m, [k, i]));
    const m = model.items(a.at[0])[a.at[1]];
    let cycle = null;
    const seq = a.seq.map(() => {
      const st = activateAcrossSheets(model, a.at[0], m, cycle, verb);
      cycle = st.cycle;
      return { said: st.said ? [st.said] : [], sel: [pos.get(st.target[1])], zoom: [pos.get(st.target[1])],
        edit: [], went: [[st.target[0], pos.get(st.target[1])]] };
    });
    eq(`${label} · the chip off: a tap on ${a.at.join(':')} (${m.name}) walks it across sheets`, seq, a.seq);
  }
  for (const a of acts.flips || []) {
    const model = modelOf(input);
    const pos = new Map();
    for (const k of model.pageKeys()) model.items(k).forEach((m, i) => pos.set(m, [k, i]));
    const m = model.items(a.at[0])[a.at[1]];
    let cycle = null;
    const seq = a.seq.map(st0 => {
      const view = { page: a.page, revId: st0.rev || '', revPage: st0.rev ? st0.revPage : null };
      const hit = activateOnThisSheet(model, view, a.at[0], m, cycle, verb);
      if (hit) {
        cycle = hit.cycle;
        return { said: hit.said ? [hit.said] : [], sel: [pos.get(hit.target)], zoom: [pos.get(hit.target)],
          edit: [], went: [], rev: st0.rev, revPage: st0.revPage };
      }
      const st = activateAcrossSheets(model, a.at[0], m, cycle, verb);
      cycle = st.cycle;
      return { said: st.said ? [st.said] : [], sel: [pos.get(st.target[1])], zoom: [pos.get(st.target[1])],
        edit: [], went: [[st.target[0], pos.get(st.target[1])]], rev: st0.rev, revPage: st0.revPage };
    });
    eq(`${label} · taps on ${a.at.join(':')} (${m.name}) on ${model.pageLabel(a.page)}, a drawing flipped between`,
      seq, a.seq);
  }
  for (const a of acts.properties) {
    const model = modelOf(input);
    const pos = new Map();
    for (const k of model.pageKeys()) model.items(k).forEach((m, i) => pos.set(m, [k, i]));
    const m = model.items(a.at[0])[a.at[1]];
    const s = propertiesOnThisSheet(model, viewOfRec(a), a.at[0], m);
    const got = s ? { said: [], sel: [pos.get(s)], zoom: [], edit: [pos.get(s)], went: [] }
      : { said: [], sel: [pos.get(m)], zoom: [], edit: [pos.get(m)], went: [[a.at[0], pos.get(m)]] };
    eq(`${label} · Properties… on ${a.at.join(':')} (${m.name}) on ${model.pageLabel(a.page)} (${a.rev || 'own'})`,
      got, { said: a.said, sel: a.sel, zoom: a.zoom, edit: a.edit, went: a.went });
  }
  for (const d of acts.delete) {
    const p = projectOf(input);
    const was = new Map();
    for (const [pg, m] of p.allItems()) {
      const i = p.measurements[pg].indexOf(m);
      const raw = (input.measurements[String(pg)] || [])[i];
      was.set(m._uid, { pg, i, json: canonStr(asDesktop(m, raw)) });
    }
    const before = JSON.stringify(p.measurements);
    const model = new CountingModel({ metadata: p.metadata, measurements: p.measurements,
      pageCount: p.pageCount, order: input.order || 'date' });
    const m = p.measurements[d.at[0]][d.at[1]];
    const name = deleteName(m);
    const ch = deleteHereChoice(model, viewOfRec(d), d.at[0], m, name);
    const got = { boxes: [], asked: [], said: [], undo: 0 };
    if (ch) {
      got.boxes = [{ title: ch.title, text: ch.text, info: ch.info, buttons: ch.buttons,
        default: ch.buttons.indexOf(ch.defaultButton) }];
      if (d.pick === 0) {
        const n = p.dropShapes(ch.local.map(s => s._uid));
        if (n) got.said = [deletedHereWords(n, name, ch.where, ch.rest)];
      } else if (d.pick === 1) {
        p.removeItems([m._uid]);
        got.said = [`Deleted “${name}”.`];
      }
    } else {
      const q = deleteItemQuestion(m);
      got.asked = [[q.title, q.text, q.buttons, [q.defaultButton]]];
    }
    got.undo = p._undo.length;
    Object.assign(got, deltaOf(p, was, input));
    const tag = `${label} · SHEET Delete on ${model.pageLabel(d.page)} (${d.rev || 'own'}) of ${d.at.join(':')} `
      + `(${name}), ${['this sheet', 'the whole item', 'Cancel'][d.pick]}`;
    eq(tag, got, { boxes: d.boxes, asked: d.asked, said: d.said, undo: d.undo, gone: d.gone,
      changed: d.changed.map(([pg, i, mm]) => [pg, i, canon(asDesktop(mm, mm))]) });
    if (got.undo === 1) {
      const after = JSON.stringify(p.measurements);
      p.undo();
      eq(`${tag} · one Undo gives back every shape, exactly`, JSON.stringify(p.measurements), before);
      p.redo();
      eq(`${tag} · and Redo takes them again`, JSON.stringify(p.measurements), after);
    }
  }
}

/** The chip as a setting and a view, through the real panel, against the
 *  desktop's own (chip_truth), and the words the desktop's tests pin. */
function checkChip(ct, label) {
  for (const [s, want] of Object.entries(ct.titles)) eq(`${label} · the title for ${JSON.stringify(s)}`, sheetTitle(s), want);
  for (const [h, want] of ct.words) eq(`${label} · what is left out, ${JSON.stringify(h)}`, hiddenWords(h), want);
  let bad = 0;
  for (const [kind, m, q, want] of ct.qty) {
    const got = kind === 'qty' ? qtyWords(m, q) : valueStr(m);
    if (got !== want && bad++ < 6) eq(`${label} · ${kind} ${JSON.stringify(m)} ${q ?? ''}`, got, want);
    else checks += 1;
  }
  eq(`${label} · ${ct.qty.length} quantities in the desktop's words, its ties included`, bad, 0);
  eq(`${label} · NOT ON A SHEET's key, and what is never a row`, [SOLO, [...NOT_ROWS].sort()],
    [ct.SOLO, ct.NOT_ROWS.slice().sort()]);
  const step = what => ct.steps.find(s => s.what === what);
  const pick = (s, keys) => Object.fromEntries(keys.map(k => [k, s[k]]));
  withClock(clock => {
    const settings = stubSettings({ [SHEET_SETTING]: false });
    const rig = sheetRig(ct.input, { view: { page: 0, revId: '', revPage: null, coming: false }, settings });
    try {
      const { panel } = rig;
      let n0 = 0;
      const now = () => ({ on: panel.sheetChip, checked: panel.sheetChipEl.classList.contains('on'),
        soloFolded: panel.collapsed.has(SOLO_KEY), soloCount: panel._soloCount,
        setting: settings.values[SHEET_SETTING] });
      const KEYS = ['on', 'checked', 'soloFolded', 'soloCount', 'setting'];
      const built = () => { const b = panel.builds - n0; n0 = panel.builds; return b; };
      const desk = (a, b) => (b ? step(b).rebuilds - step(a).rebuilds : 0);
      eq(`${label} · a start with the setting off`, now(), pick(step('a start with the setting off'), KEYS));
      rig.doc.click(panel.sheetChipEl);
      built();
      // the chip's own rebuild opens nothing, and counts what is on no sheet
      eq(`${label} · the chip on (and the rebuild it makes)`, now(), pick(step('the rebuild it makes'), KEYS));
      eq(`${label} · the chip on folds NOT ON A SHEET, and the list shows it folded`,
        [rig.rows().length, rig.headings().some(h => h.textContent.includes('NOT ON A SHEET'))
          && rig.headings().find(h => h.textContent.includes('NOT ON A SHEET')).textContent.includes('▸')], [1, true]);
      panel.refresh();
      eq(`${label} · another rebuild, nothing added`, now(), pick(step('another rebuild, nothing added'), KEYS));
      rig.p.measurements['-1000'].push({ type: 'standalone', name: 'Glue', qty: 1, unit: 'each', visible: true, _uid: 'glue' });
      panel.refresh();
      eq(`${label} · an item added on no sheet opens NOT ON A SHEET`, now(), pick(step('an item added on no sheet'), KEYS));
      eq(`${label} · ...and it is there to be seen`, rig.rows().some(e => e.dataset.id === 'glue'), true);
      panel.collapsed.add(SOLO_KEY);
      panel.refresh();
      eq(`${label} · folded again by hand`, now(), pick(step('folded again by hand, nothing added'), KEYS));
      rig.p.measurements['-1000'].pop();
      panel.refresh();
      eq(`${label} · one on no sheet deleted opens nothing`, now(), pick(step('one on no sheet deleted'), KEYS));
      built();
      // following the drawing on screen: once, and only when it moved
      panel.onSheetShown();
      clock.advance(SHEET_FOLLOW_MS);
      eq(`${label} · shown again, the same drawing: no rebuild`, built(),
        desk('one on no sheet deleted', 'shown again, the same sheet and drawing'));
      rig.state.view = { page: 1, revId: '', revPage: null, coming: false };
      panel.onSheetShown();
      clock.advance(SHEET_FOLLOW_MS - 1);
      eq(`${label} · a page turn waits ${SHEET_FOLLOW_MS} ms`, built(), 0);
      panel.onSheetShown();
      clock.advance(SHEET_FOLLOW_MS);
      eq(`${label} · a page turn, twice said: one rebuild`, built(),
        desk('shown again, the same sheet and drawing', 'a page turn: the newest drawing, then the timer'));
      rig.state.view = { page: 1, revId: 'r-c', revPage: 0, coming: false };
      panel.onSheetShown();
      clock.advance(SHEET_FOLLOW_MS);
      eq(`${label} · a flip to the revision: one rebuild`, built(),
        desk('a page turn: the newest drawing, then the timer', 'a flip to the revision'));
      rig.state.view = { page: 1, revId: '', revPage: null, coming: false };
      panel.onSheetShown();
      clock.advance(SHEET_FOLLOW_MS);
      // (the web has no row drag yet: the desktop's waits for one to end)
      eq(`${label} · a flip back: one rebuild`, built(), desk('a flip to the revision', 'the drag over'));
      rig.doc.click(panel.sheetChipEl);
      eq(`${label} · the chip off`, pick(now(), ['on', 'checked', 'setting']),
        pick(step('the chip off'), ['on', 'checked', 'setting']));
      eq(`${label} · the chip off: the whole job, titled as the job`, [panel.titleEl.textContent, built()],
        ['PROJECT ITEMS', desk('the drag over', 'the chip off')]);
      rig.state.view = { page: 0, revId: '', revPage: null, coming: false };
      panel.onSheetShown();
      clock.advance(SHEET_FOLLOW_MS);
      eq(`${label} · a page turn with the chip off rebuilds nothing of its own`, built(),
        desk('the chip off', 'a page turn, the chip off'));
      rig.doc.click(panel.sheetChipEl);
      eq(`${label} · the chip on again folds it again`, pick(now(), ['on', 'checked', 'soloFolded', 'setting']),
        pick(step('the chip on again'), ['on', 'checked', 'soloFolded', 'setting']));
    } finally { rig.restore(); }
    const rig2 = sheetRig(ct.input, { view: { page: 0, revId: '', revPage: null, coming: false },
      settings: stubSettings({ [SHEET_SETTING]: true }) });
    try {
      eq(`${label} · a start with the setting on`, {
        on: rig2.panel.sheetChip, checked: rig2.panel.sheetChipEl.classList.contains('on'),
        soloFolded: rig2.panel.collapsed.has(SOLO_KEY) }, ct.restart);
    } finally { rig2.restore(); }
  });
}

/** The job switch cases, from a truth file -- refusing one without them. */
function checkJobSwitchOf(truth, label) {
  if (!Array.isArray(truth.jobSwitch) || !truth.jobSwitch.length) {
    eq(`${label} · the truth says what a job switch leaves (regenerate it)`, false, true);
    return;
  }
  console.log(`   (${truth.jobSwitch.length} job-switch cases)`);
  checkJobSwitch(truth.jobSwitch, label);
}

// ═══ 1c. the SHEET chip on the web: what the desktop has no word for ════
console.log('-- the SHEET chip: opening, following, the setting, the taps --');
{
  // A job built for it: a wall on three sheets (two shapes on X1.1), a deck
  // on X1.1 alone, a revision of X1.1 with a run of the wall on it, an item
  // on no sheet, an empty sheet.
  const area = (name, value, kw = {}) => ({ type: 'area', name, label: name, value,
    points: [[1, 1], [9, 1], [9, 9]], visible: true, floor_level: 'Level 1', category: 'Framing', ...kw });
  const job = {
    name: 'the chip on the web', pageCount: 4,
    metadata: { page_labels: ['X1.0', 'X1.1', 'X1.2', 'X1.3'],
      revisions: [{ id: 'r-w', date: '11/03/2026', description: 'ASI 8', notes: '', source: 'r.pdf',
        visible: true, archived: false, page_labels: ['X0'], match: { 1: 0 }, extra: {}, pages: 1 }] },
    measurements: {
      0: [area('Wall', 70, { group_id: 'gw', own_value: 10, group_count: 4 })],
      1: [area('Wall', 20, { group_id: 'gw', group_child: true }), area('Deck', 30),
        area('Wall', 25, { group_id: 'gw', group_child: true }),
        area('Wall', 9, { group_id: 'gw', group_child: true, rev_id: 'r-w', rev_page: 0 })],
      2: [area('Wall', 15, { group_id: 'gw', group_child: true })],
      // (filed first of all: NOT ON A SHEET still goes last)
      [-1000]: [{ type: 'standalone', name: 'Nails', qty: 5, unit: 'box', visible: true, sort_order: 1 }],
    },
  };
  const own = page => ({ page, revId: '', revPage: null, coming: false });
  withClock(clock => {
    const rig = sheetRig(job, { view: own(0), chip: true });
    try {
      const { panel, state } = rig;
      panel.refresh();
      const b0 = panel.builds;
      eq('on X1.0: its title, its row and the whole job below', [panel.titleEl.textContent,
        rig.rows().map(e => rig.part(e, 'val').textContent), panel.footEl.textContent.startsWith('Whole job: ')],
      ['ITEMS ON X1.0', ['10.0 sq ft   ·  70.0 sq ft in all'], true]);
      // A turn to X1.1: until its drawing is decided, 'Opening X1.1…' --
      // never the rows of a drawing that may not be the one that comes up.
      state.view = { ...own(1), coming: true };
      panel.refresh();                                    // goToPage's own refresh
      eq('a turn: the new title, and "Opening X1.1…" instead of rows', [panel.titleEl.textContent,
        rig.notes().map(e => [e.textContent, e.classList.contains('opening')]), rig.rows().length],
      ['ITEMS ON X1.1', [['Opening X1.1…', true]], 0]);
      eq('...with the whole job\'s totals still at the foot', panel.footEl.textContent.startsWith('Whole job: '), true);
      eq('...and no rows built for it', panel.builds - b0, 0);
      // (every refresh counted: the list's own following may not run one
      // while the drawing is still on its way -- only the app's own calls do)
      let refreshes = 0;
      const realRefresh = panel.refresh.bind(panel);
      panel.refresh = () => { refreshes += 1; realRefresh(); };
      panel.onSheetShown();                               // its own drawing up
      clock.advance(SHEET_FOLLOW_MS * 3);
      realRefresh();                                      // a readOnly change says so too
      panel.onSheetShown();                               // the newest, still decoding
      clock.advance(SHEET_FOLLOW_MS * 3);
      eq('while the newest drawing still decodes, still opening -- and the list does not rebuild itself',
        [rig.rows().length, panel.builds - b0, refreshes], [0, 0, 0]);
      panel.refresh = realRefresh;
      state.view = own(1);                                // the landing: up
      panel.onSheetShown();
      // ('Opening' gives way the moment the drawing is up -- the landing is
      // goToPage's one decided word -- so a turn onto a sheet already
      // decoded never shows it at all: no 80 ms of it on every turn)
      eq('the turn landed: ONE rebuild at once, for the drawing that came up -- "Opening" waits out no timer',
        [panel.builds - b0, rig.notes().filter(e => e.classList.contains('opening')).length], [1, 0]);
      clock.advance(SHEET_FOLLOW_MS * 2);
      eq('...and no second one after it', panel.builds - b0, 1);
      eq('X1.1\'s rows: the wall\'s two shapes here, then the whole item; the deck as it is',
        rig.rows().map(e => [rig.part(e, 'nm').textContent, rig.part(e, 'val').textContent, rig.part(e, 'pg').textContent]),
        [['MWall', '45.0 sq ft   ·  70.0 sq ft in all', 'X1.0 +2'], ['MDeck', '30.0 sq ft', 'X1.1']]);
      panel.onSheetShown();
      clock.advance(SHEET_FOLLOW_MS);
      eq('shown again, the same drawing: nothing rebuilt', panel.builds - b0, 1);
      // A flip to the revision while it decodes keeps the rows of the drawing
      // still up; it lands, and the list follows once.
      state.view = { page: 1, revId: '', revPage: null, coming: true };
      panel.refresh();
      eq('a flip decoding: the rows of the drawing still up, not "Opening"',
        [rig.rows().length, rig.notes().length], [2, 0]);
      state.view = { page: 1, revId: 'r-w', revPage: 0, coming: false };
      const b1 = panel.builds;
      panel.onSheetShown();
      clock.advance(SHEET_FOLLOW_MS - 1);
      eq(`a flip (rows kept, not "Opening"): nothing before ${SHEET_FOLLOW_MS} ms`, panel.builds - b1, 0);
      clock.advance(1);
      eq('the flip landed: one rebuild, the revision\'s own takeoff', [panel.builds - b1,
        rig.rows().map(e => [rig.part(e, 'val').textContent, e.classList.contains('nc'),
          rig.part(e, 'nc-tag')?.textContent || ''])],
      [1, [['9.0 sq ft   ·  70.0 sq ft in all', true, '⊘ NOT COUNTED']]]);
      // The taps that say: '+N', the ⊘ tag, the title -- and step nothing.
      state.said.length = 0;
      state.calls.length = 0;
      const row = rig.rows()[0];
      rig.doc.click(rig.part(row, 'pg'));
      rig.doc.click(rig.part(row, 'nc-tag'));
      rig.doc.click(panel.titleEl);
      eq('a tap on "+N" says the other sheets, the ⊘ tag its sentence, the title the sheet -- and none steps',
        [state.said, state.calls], [[
          'Wall is also on X1.1, X1.2',
          'NOT COUNTED from this drawing — taken off on ASI 8; X1.1 counts from its own drawing. '
            + 'The item is in your totals from its shapes on other drawings.',
          'Only the items drawn on X1.1 — the SHEET chip shows them all again'], []]);
      rig.doc.click(row);
      rig.doc.click(row, { detail: 2 });
      eq('a tap on the row is the host\'s (detail says a double\'s second click)',
        state.calls.map(c => c[2]), [1, 2]);
      // The rows on screen are built for the revision. The chip off, and on
      // again while X1.1 is landing on ANOTHER of its drawings: 'Opening
      // X1.1…' -- never the revision's rows from before the chip went off,
      // as if they were the rows he was just looking at.
      rig.doc.click(panel.sheetChipEl);                   // off: the whole list
      eq('(the chip off: the whole list)', panel.titleEl.textContent, 'PROJECT ITEMS');
      state.view = { ...own(1), coming: true };           // X1.1's own drawing on its way
      rig.doc.click(panel.sheetChipEl);                   // on again
      eq('the chip off, then on while another drawing of this sheet is coming: "Opening X1.1…", not rows built before',
        [rig.notes().map(e => e.textContent), rig.rows().length], [['Opening X1.1…'], 0]);
      state.view = own(1);
      panel.onSheetShown();
      eq('...and the rows of the drawing that came up, once it is up',
        rig.rows().map(e => rig.part(e, 'val').textContent), ['45.0 sq ft   ·  70.0 sq ft in all', '30.0 sq ft']);
      // A turn away and back before the next sheet came up: the list said
      // 'Opening X1.2…' last, so X1.1 landing again is opening too.
      state.view = { ...own(2), coming: true };
      panel.refresh();
      state.view = { ...own(1), coming: true };
      panel.refresh();
      eq('a turn away and straight back, both still coming: "Opening X1.1…", not the rows from before the turn',
        [rig.notes().map(e => e.textContent), rig.rows().length], [['Opening X1.1…'], 0]);
      state.view = own(1);
      panel.onSheetShown();
      // A sheet the host names that the job does not have, and no sheet at
      // all, are not a sheet for the list to be on.
      state.view = { ...own(4) };
      panel.refresh();
      eq('a view past the last sheet is no sheet: the whole list', [panel.sheetOnly(), panel.titleEl.textContent],
        [false, 'PROJECT ITEMS']);
      state.view = null;
      panel.refresh();
      eq('no sheet open: not on one sheet', [panel.sheetOnly(), panel.titleEl.textContent], [false, 'PROJECT ITEMS']);
      // An empty sheet, and the filters hiding what IS drawn here.
      state.view = own(3);
      panel.refresh();
      eq('an empty sheet says what it leaves out', rig.notes().map(e => e.textContent),
        ['Nothing on X1.3 (this drawing) — 2 on other sheets']);
      state.view = own(1);
      panel.costFilter = 'labor';
      panel.refresh();
      eq('a filter that leaves nothing at all: the list says the filter (the desktop says it first)',
        panel.listEl.children.map(e => e.textContent), ['No labor items.\n\nSet an item’s Type\nto Labor in its\nproperties dialog.']);
      panel.costFilter = 'all';
      // the deck on Level 2 and the list on Level 2: on X1.2 only the wall is
      // drawn, and the filter hides it -- said, not an empty drawing
      panel.floorFilter = 'Level 2';
      rig.p.measurements[1][1].floor_level = 'Level 2';
      state.view = own(2);
      panel.refresh();
      eq('the filters hiding what is drawn here: "matches the filters — 1 item here is hidden"',
        rig.notes().map(e => e.textContent),
        ['Nothing on X1.2 (this drawing) matches the filters — 1 item here is hidden by them; 1 on another sheet']);
      rig.p.measurements[1][1].floor_level = 'Level 1';
      panel.floorFilter = null;
      // 'Not shown:' sits above NOT ON A SHEET, which is last and grey
      panel.collapsed.delete(SOLO_KEY);
      state.view = own(2);
      panel.refresh();
      const kids = panel.listEl.children;
      eq('"Not shown:" sits above NOT ON A SHEET, last', kids.map(e => (e.classList.contains('sheet-note') ? `note ${e.textContent}`
        : e.classList.contains('grp') ? `head ${rig.part(e, 'grp-label').textContent}` : 'row')),
      ['head ▾ LEVEL 1', 'head ▾ Framing', 'row', 'note Not shown: 1 on another sheet', 'head ▾ NOT ON A SHEET',
        'head ▾ Uncategorized', 'row']);
      // Another job opened: what the list was built for is the last job's.
      // Its first sheet is page 0 too -- while it decodes, it is opening, not
      // the last job's rows; landed, it is built once, on its own.
      state.view = own(0);
      panel.refresh();
      const b2 = panel.builds;
      rig.p.loadFrom({ metadata: { page_labels: ['Y1.0'] }, annotations: {}, pageCount: 1,
        measurements: { 0: [area('Slab', 40)] } });
      state.view = { ...own(0), coming: true };
      panel.refresh();
      eq('another job, its page 0 decoding: opening, not the last job\'s page 0',
        [rig.notes().map(e => e.textContent), rig.rows().length, panel.builds - b2], [['Opening Y1.0…'], 0, 0]);
      state.view = own(0);
      panel.onSheetShown();
      clock.advance(SHEET_FOLLOW_MS);
      eq('...landed: built once, its own rows', [panel.builds - b2,
        rig.rows().map(e => rig.part(e, 'val').textContent)], [1, ['40.0 sq ft']]);
    } finally { rig.restore(); }
  });

  // The footer while the list is on one sheet: the whole job's totals --
  // what it says with the chip off, under the same filters -- never this
  // sheet's, and 'Whole job:' only when no filter narrows them ('Whole job,
  // filtered:' when ALL / LAB / MAT, the floor or the group filter does).
  {
    const job2 = JSON.parse(JSON.stringify(job));
    Object.assign(job2.measurements[1][1], { cost_type: 'labor', unit_cost: 3 });   // the deck: labor
    job2.measurements[2].push(area('Beam', 12.25, { floor_level: 'Level 2', category: 'Carpentry', unit_cost: 2 }));
    const footOf = (chip, f) => {
      const rig = sheetRig(job2, { view: own(1), chip });
      try {
        Object.assign(rig.panel, f);
        rig.panel.refresh();
        return [rig.panel.footEl.textContent, rig.rows().length];
      } finally { rig.restore(); }
    };
    const filters = [[{}, false], [{ costFilter: 'labor' }, true], [{ costFilter: 'material' }, true],
      [{ floorFilter: 'Level 1' }, true], [{ groupFilter: 'Framing' }, true], [{ floorFilter: 'Level 2' }, true]];
    for (const [f, narrowed] of filters) {
      const [off] = footOf(false, f);
      const [on, rows] = footOf(true, f);
      eq(`the chip on, ${JSON.stringify(f)}: the footer is the chip-off footer, ${narrowed ? '"Whole job, filtered:"' : '"Whole job:"'}`
        + ` (${rows} row${rows === 1 ? '' : 's'} listed)`,
        on, off ? `${narrowed ? 'Whole job, filtered: ' : 'Whole job: '}${off}` : '');
    }
    eq('(and with no filter it is the whole job: four items, where X1.1 lists two)',
      [footOf(true, {})[0].startsWith('Whole job: 4 items'), footOf(true, {})[1]], [true, 2]);
  }

  // The chip across a reload: a NEW key, so a store written before it
  // existed reads it off; turned on, it is saved, and the next start has it.
  {
    const store = new Map();
    const was = { ls: globalThis.localStorage, doc: globalThis.document };
    globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
    globalThis.document = stubDocument();
    try {
      store.set('ptt.settings.v1', JSON.stringify({ ...DEFAULT_SETTINGS, items_panel_sheet_only: undefined, marker_scale: 1.4 }));
      const old = JSON.parse(store.get('ptt.settings.v1'));
      eq('an install\'s stored settings from before the chip have no such key', SHEET_SETTING in old, false);
      const s1 = new Settings();
      eq('...and read the chip off (its default, the desktop\'s)', [s1.get(SHEET_SETTING), DEFAULT_SETTINGS[SHEET_SETTING]], [false, false]);
      s1.set(SHEET_SETTING, true);
      const s2 = new Settings();
      eq('turned on, it survives a reload', [s2.get(SHEET_SETTING), s2.get('marker_scale')], [true, 1.4]);
      // ...and the panel starts with it on, NOT ON A SHEET folded
      const rig = sheetRig(job, { view: own(0), settings: s2 });
      try {
        eq('a start with it on: the chip lit, NOT ON A SHEET folded',
          [rig.panel.sheetChip, rig.panel.sheetChipEl.classList.contains('on'),
            rig.panel.sheetChipEl.getAttribute('aria-pressed'), rig.panel.collapsed.has(SOLO_KEY)],
          [true, true, 'true', true]);
        rig.doc.click(rig.panel.sheetChipEl);
        eq('turned off by a tap, and saved off', [new Settings().get(SHEET_SETTING), rig.panel.titleEl.textContent],
          [false, 'PROJECT ITEMS']);
      } finally { rig.restore(); }
      // never written into a .takeoff: the project's metadata knows nothing of it
      const p = projectOf(job);
      eq('the chip is not in the file', JSON.stringify(p.metadata).includes(SHEET_SETTING), false);
    } finally {
      globalThis.localStorage = was.ls;
      globalThis.document = was.doc;
    }
  }

  // The wiring in main.js, by its own text: the host hands the panel the
  // drawing on screen and the settings; a goToPage holds the list until its
  // drawing lands and then lets it follow once; a version flip lets it
  // follow; a row's tap steps (a double's second click is Properties');
  // Properties… and Delete from the list go the one-sheet way first.
  const src = await readFile(new URL('../js/main.js', import.meta.url), 'utf-8');
  const fnBody = start => {
    const i = src.indexOf(start);
    if (i < 0) return '';
    const j = src.indexOf('\n}\n', i);
    return src.slice(i, j < 0 ? undefined : j);
  };
  ok('the host gives the panel the drawing on screen, the settings, the status line',
    src.includes('view: () => sheetView(),') && src.includes('settings: app.settings,')
    && src.includes('say: text => sayToFinger(text),') && src.includes("sheetChipEl: $('sheetChip'),")
    && src.includes("titleEl: $('itemsTitle'),"));
  const go = fnBody('async function goToPage(');
  ok('a goToPage holds the list from its start to its landing, then lets it follow once',
    /const ticket = \+\+pageTicket;\n\s+comingUp = [^\n]+\n(\s+\/\/[^\n]*\n)*\s+landingTicket = ticket;/.test(go)
    && /if \(landingTicket === ticket\) \{\n\s+landingTicket = 0;\n\s+itemsPanel\.onSheetShown\(\);\n\s+\}\s*$/.test(go)
    && /pageImage = null;\n\s+shownPage = -1;\n(\s+\/\/[^\n]*\n)*\s+landingTicket = 0;/.test(go));
  ok('every version flip lets the list follow, last',
    /itemsPanel\.onSheetShown\(\);$/.test(fnBody('function syncVersionUi(').trimEnd()));
  const sv = fnBody('function sheetView(');
  ok('the drawing on screen is coming while a landing or a flip is under way, or this job\'s sheet is not up',
    sv.includes('(landingTicket !== 0 && landingTicket === pageTicket) || flipping || !up')
    && sv.includes('comingUp.vticket === versionTicket')
    && sv.includes('(onSheetUp(app.currentPage) && inLandedJob())'));
  ok('...but a sheet that would not decode is not coming: its takeoff is listed',
    sv.includes('sheetFailed.page === app.currentPage && sheetFailed.job === jobNow()')
    && /landingTicket = 0;\n\s+sheetFailed = \{ page: index, job: jobNow\(\) \};/.test(go));
  ok('a row\'s tap steps on one sheet, else walks across sheets to the jump; a double\'s second click is Properties\'',
    /selectItem: \(item, row, ev\) => \{\n(\s+\/\/[^\n]*\n)*\s+if \(ev && ev\.detail >= 2\) return;\n(\s+\/\/[^\n]*\n)*\s+if \(stepOnThisSheet\(item, row\)\) return;\n\s+const \[pageIdx, m\] = stepAcrossSheets\(item, row\);\n/.test(src));
  const here = fnBody('function stepOnThisSheet(');
  // (what it does is run, below, in section 1d)
  ok('on one sheet it steps through the shapes here, zoomed to, and turns no page',
    /if \(!itemsPanel\.sheetOnly\(\)\) return false;/.test(here)
    && /activateOnThisSheet\(countingModel\(\), view, pageIdx, m, shapeCycle, rowGesture\(\)\)/.test(here)
    && /zoomFloor\.zoomToItem\(hit\.target\.points/.test(here) && !/goToPage|jumpToItem/.test(here));
  ok('...and across sheets the desktop\'s walk', /activateAcrossSheets\(countingModel\(\), pageIdx, m, shapeCycle, rowGesture\(\)\)/
    .test(fnBody('function stepAcrossSheets(')));
  // The status line names the web's gesture where the desktop says
  // 'double-click' (the one substitution in the words): a tap in the touch
  // layout, a click with a mouse -- run here as main.js has it.
  const gesture = new Function('document', `${fnBody('function rowGesture(')}\n}\nreturn rowGesture;`);
  eq('the step\'s words name a tap, or a click', ['touch', 'standard'].map(ui =>
    gesture({ documentElement: { dataset: { ui } } })()), ['tap', 'click']);
  ok('another job starts the walk again', src.includes("app.project.addEventListener('reset', () => { shapeCycle = null; });"));
  ok('Properties… from the list goes the one-sheet way first',
    src.includes('openProperties: item => openPropertiesFromList(item),')
    && src.includes("add('Properties…', () => (from === 'list' ? openPropertiesFromList(item) : openProperties(item)));"));
  ok('a run\'s form is its item\'s', /item = itemOfShape\(item\);/.test(fnBody('async function openProperties(')));
  const del = fnBody('async function deleteFromList(');
  ok('Delete from the list asks which on one sheet, Cancel the default, else the plain question',
    src.includes("if (from === 'list') { void deleteFromList(item); return; }")
    && /if \(!ch\) \{ await deleteWholeItem\(item\); return; \}/.test(del)
    && /defaultKey: 'cancel'/.test(del) && /app\.project\.dropShapes\(ch\.local/.test(del)
    && /app\.project\.removeItems\(\[item\._uid\]\)/.test(del));
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf-8');
  ok('the chip sits in the filter bar, after the group filter, off',
    /<select id="groupFilter"[^\n]*\n\s+<button id="sheetChip" class="sheet-chip" type="button" aria-pressed="false"/.test(html)
    && html.includes('<span class="panel-title" id="itemsTitle">PROJECT ITEMS</span>'));
  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf-8');
  ok('no new module for the service worker to carry', !/sheet[-_]?(rows|chip)\.js/.test(sw));
}

// ═══ 1d. main.js's list wiring, run ═════════════════════════════════════
// The SHEET chip's doors in main.js -- a row's tap (selectItem,
// stepOnThisSheet), Properties… (openPropertiesFromList), Delete
// (deleteFromList and its choiceDialog), Zoom to item from a row's menu, the
// drawing the list is on (sheetView) and where a finger's answer is said
// (sayToFinger) -- lifted out of main.js by text and RUN, over a real
// Project and the real counting ports: what each one selects, zooms to,
// asks and deletes. A text check cannot see a swapped answer or a dropped
// guard; these can. Every free name the lifted code reads or writes must be
// declared by the stand-in (or be a JavaScript global): an undeclared one is
// an error here, never a silent global -- the lift's closure, checked.
console.log('-- the SHEET chip in main.js: a row\'s tap, Properties…, Delete, Zoom to item, run --');
{
  const MAIN_SRC = (await readFile(new URL('../js/main.js', import.meta.url), 'utf-8')).replace(/\r\n/g, '\n');
  const mainFn = name => {
    const m = new RegExp(`\\n((?:async )?function ${name}\\()`).exec(MAIN_SRC);
    if (!m) throw new Error(`main.js has no function ${name}`);
    const i = m.index + 1;
    return MAIN_SRC.slice(i, MAIN_SRC.indexOf('\n}\n', i) + 2);
  };
  const mainConst = name => {
    const m = new RegExp(`\\nconst ${name} = ([^;\\n]+);`).exec(MAIN_SRC);
    if (!m) throw new Error(`main.js has no const ${name}`);
    return Number(m[1]);
  };
  const strictScope = env => new Proxy(env, {
    has: () => true,
    get(t, k) {
      if (typeof k === 'symbol' || k in t) return t[k];
      if (k in globalThis) return globalThis[k];
      throw new ReferenceError(`main.js's lifted code reads "${k}", which the stand-in does not declare`);
    },
    set(t, k, v) {
      if (!(k in t)) throw new ReferenceError(`main.js's lifted code writes "${k}", which the stand-in does not declare`);
      t[k] = v;
      return true;
    },
  });
  // eslint-disable-next-line no-new-func
  const inMain = (env, body) => new Function('scope', `with (scope) { ${body}\n}`)(strictScope(env));
  const liftMain = (env, names) => Object.assign(env,
    inMain(env, `return {\n${names.map(n => `${n}: (${mainFn(n)})`).join(',\n')}\n};`));
  // The host's row tap, word for word (the ItemsPanel host's selectItem).
  const SELECT_ITEM = (() => {
    const a = MAIN_SRC.indexOf('    selectItem: (item, row, ev) => {');
    const b = MAIN_SRC.indexOf('\n    },\n', a);
    return a < 0 || b < 0 ? null : MAIN_SRC.slice(a, b + 6);
  })();
  ok('(the host\'s selectItem is found by its text)', !!SELECT_ITEM);

  // A wall on three sheets: its main shape on X1.0, two runs on X1.1's own
  // drawing and one on its reissue (ASI 8), one on X1.2. A deck on X1.1
  // alone, a beam on X1.2 alone; a cap whose MAIN shape is filed on no
  // sheet, with its run on X1.1; nails on no sheet.
  const pts = k => [[k, k], [k + 4, k], [k + 4, k + 3]];
  const area = (name, value, kw = {}) => ({ type: 'area', name, label: name, value, points: pts(value),
    visible: true, floor_level: 'Level 1', category: 'Framing', ...kw });
  const job = {
    name: 'main.js on one sheet', pageCount: 4,
    metadata: { page_labels: ['X1.0', 'X1.1', 'X1.2', 'X1.3'],
      revisions: [{ id: 'r-w', date: '11/03/2026', description: 'ASI 8', notes: '', source: 'r.pdf',
        visible: true, archived: false, page_labels: ['X0'], match: { 1: 0 }, extra: {}, pages: 1 }] },
    measurements: {
      0: [area('Wall', 70, { group_id: 'gw', own_value: 10, group_count: 5, points: pts(10) })],
      1: [area('Wall', 20, { group_id: 'gw', group_child: true, points: pts(20) }), area('Deck', 30),
        area('Wall', 25, { group_id: 'gw', group_child: true, points: pts(40) }),
        area('Wall', 9, { group_id: 'gw', group_child: true, rev_id: 'r-w', rev_page: 0, points: pts(50) }),
        area('Cap', 1.5, { group_id: 'gc', group_child: true, points: pts(60) })],
      2: [area('Wall', 6, { group_id: 'gw', group_child: true, points: pts(70) }), area('Beam', 4)],
      [-1000]: [{ type: 'standalone', name: 'Nails', qty: 5, unit: 'box', visible: true, sort_order: 1 },
        area('Cap', 4.5, { group_id: 'gc', own_value: 3, group_count: 2, points: pts(90) })],
    },
  };
  const own = page => ({ page, revId: '', revPage: null, coming: false });
  const uids = list => list.map(s => s._uid);

  /** main.js's `names`, lifted, over a fresh copy of the job; `st` is what
   *  they did (and what the stand-ins answer). */
  function mainRig(names, extra = {}) {
    const p = projectOf(job);
    const st = { chip: true, view: own(1), up: [1], said: [], status: [], calls: [], asked: [],
      answer: null, pause: null, mobile: false, els: {} };
    const realDrop = p.dropShapes.bind(p);
    const realRemove = p.removeItems.bind(p);
    p.dropShapes = (ids, o) => { st.calls.push(['dropShapes', [...ids]]); return realDrop(ids, o); };
    p.removeItems = (ids, o) => { st.calls.push(['removeItems', [...ids]]); return realRemove(ids, o); };
    const find = (page, name, k = 0) => p.measurements[page].filter(m => m.name === name)[k];
    const env = {
      app: { project: p, currentPage: 1, pages: { pageCount: 4 } },
      itemsPanel: { sheetOnly: () => st.chip, refresh() {} },
      sheetView: () => st.view,
      onSheetUp: page => st.up.includes(page),
      countingModel: () => new CountingModel({ metadata: p.metadata, measurements: p.measurements,
        pageCount: p.pageCount }),
      activateOnThisSheet, activateAcrossSheets, propertiesOnThisSheet, shapesOnScreen,
      deleteHereChoice, deletedHereWords, deleteName,
      STANDALONE_PAGE: -1000,
      shapeCycle: null,
      pendingTurn: { parked: true },
      rowGesture: () => 'tap',
      sayToFinger: t => st.said.push(t),
      setStatus: t => st.status.push(t),
      controller: { readOnly: false, readOnlyReason: 'View Only — nothing here can be changed', selected: new Set(),
        select(ids) { this.selected = new Set(ids); st.calls.push(['select', [...ids]]); } },
      zoomFloor: { zoomToItem: (points, type) => { st.calls.push(['zoom', points, type]); return true; } },
      requestDraw() {},
      closeDrawers: () => st.calls.push(['closeDrawers']),
      isMobileLayout: () => st.mobile,
      $: id => st.els[id] || null,
      viewport: { width: 1024, ensureVisible: () => st.calls.push(['ensureVisible']) },
      pageFinalLabel: i => p.pageLabel(i),
      sheetFailed: null,
      jobNow: () => 'job-1',
      DRAWER_HIDES_SHARE: mainConst('DRAWER_HIDES_SHARE'),
      versionView: { revId: '', revPage: null },
      pageTicket: 1,
      goToPage: (...a) => { st.calls.push(['goToPage', ...a]); return Promise.resolve(); },
      jumpToItem: (m, pg) => { st.calls.push(['jump', m._uid, pg]); return Promise.resolve(); },
      D: { choiceDialog: async (...a) => { st.asked.push(a); if (st.pause) await st.pause(); return st.answer; } },
      deleteWholeItem: async item => { st.calls.push(['whole-question', item._uid]); },
      forgetDeletedSelection() {},
      openProperties: item => { st.calls.push(['properties', item._uid]); },
      boundingBox: () => ({ x: 0, y: 0, w: 4, h: 3 }),
      ...extra,
    };
    liftMain(env, names);
    return { p, st, env, find, realDrop };
  }
  const writes = st => st.calls.filter(c => c[0] === 'dropShapes' || c[0] === 'removeItems');

  // ── Delete from the list ──────────────────────────────────────────────
  const DEL = ['deleteFromList', 'sheetFailedOn'];
  {
    const R = mainRig(DEL);
    const { p, st, env } = R;
    const wall = R.find(0, 'Wall');
    const ch = deleteHereChoice(env.countingModel(), st.view, 0, wall, 'Wall');
    const before = JSON.stringify(p.measurements);
    const stay = [wall._uid, R.find(2, 'Wall')._uid, R.find(1, 'Wall', 2)._uid].sort();
    st.answer = 'here';
    await env.deleteFromList(wall);
    eq('Delete, the chip on, Wall on X1.1: the three-way question, each answer named as the desktop names it, Cancel the default',
      st.asked.map(a => [a[0], a[1], a[2], a[3].map(c => [c.key, c.label]), a[4]]),
      [[ch.title, ch.text, ch.info, [['here', ch.buttons[0]], ['whole', ch.buttons[1]], ['cancel', 'Cancel']],
        { defaultKey: 'cancel' }]]);
    eq('(...the buttons the desktop shows: this sheet\'s shapes, the whole item, Cancel)', ch.buttons,
      ['Delete the 2 shapes on X1.1 (this drawing)', 'Delete the whole item (5 shapes on X1.0, X1.1, X1.2)', 'Cancel']);
    eq('"Delete the 2 shapes on X1.1": exactly the shapes painted here, through dropShapes, in one undo level',
      [writes(st), p._undo.length], [[['dropShapes', uids(ch.local)]], 1]);
    eq('...the wall\'s other shapes stay: its main shape, its run on X1.2 and the one on the reissue',
      [...p.allItems()].filter(([, m]) => m.group_id === 'gw').map(([, m]) => m._uid).sort(), stay);
    eq('...and the line says where it still is', st.said, [deletedHereWords(2, 'Wall', ch.where, ch.rest)]);
    p.undo();
    eq('...one Undo gives the job back exactly', JSON.stringify(p.measurements), before);
  }
  {
    const R = mainRig(DEL);
    const { p, st, env } = R;
    const wall = R.find(0, 'Wall');
    st.answer = 'whole';
    await env.deleteFromList(wall);
    eq('"Delete the whole item": removeItems once, nothing else, one undo level, every shape of it gone from every sheet',
      [writes(st), p._undo.length, [...p.allItems()].filter(([, m]) => m.group_id === 'gw').length, st.status],
      [[['removeItems', [wall._uid]]], 1, 0, ['Deleted “Wall”.']]);
  }
  for (const [answer, what] of [['cancel', 'Cancel'], [null, 'Escape or a click outside (null)'],
    [undefined, 'a dialog torn down (undefined)']]) {
    const R = mainRig(DEL);
    const { p, st, env } = R;
    const before = JSON.stringify(p.measurements);
    st.answer = answer;
    await env.deleteFromList(R.find(0, 'Wall'));
    eq(`${what}: nothing is written`, [writes(st), p._undo.length, JSON.stringify(p.measurements) === before],
      [[], 0, true]);
  }
  {
    // The question is a pause: what is true when he answers is what counts.
    const R = mainRig(DEL);
    const { p, st, env } = R;
    const before = JSON.stringify(p.measurements);
    st.answer = 'here';
    st.pause = async () => { env.controller.readOnly = true; };
    await env.deleteFromList(R.find(0, 'Wall'));
    eq('View Only came on while it asked: "this sheet" writes nothing, and says why',
      [writes(st), JSON.stringify(p.measurements) === before, st.status], [[], true, [env.controller.readOnlyReason]]);
  }
  {
    const R = mainRig(DEL);
    const { p, st, env } = R;
    const wall = R.find(0, 'Wall');
    st.answer = 'here';
    st.pause = async () => { R.realDrop([wall._uid]); };       // the main shape went meanwhile
    await env.deleteFromList(wall);
    const after = p._undo.length;
    eq('the item went while it asked: nothing more is deleted than what went meanwhile',
      [writes(st), after], [[], 1]);
  }
  {
    const R = mainRig(DEL);
    const { st, env } = R;
    st.chip = false;                                      // the drawing is still on screen
    await env.deleteFromList(R.find(0, 'Wall'));
    eq('the chip off: the plain question (deleteWholeItem), never the three-way one',
      [st.calls, st.asked.length], [[['whole-question', R.find(0, 'Wall')._uid]], 0]);
  }
  {
    const R = mainRig(DEL);
    const { st, env } = R;
    await env.deleteFromList(R.find(1, 'Deck'));
    eq('an item wholly on the drawing on screen: the plain question', [st.calls.map(c => c[0]), st.asked.length],
      [['whole-question'], 0]);
  }
  {
    const R = mainRig(DEL);
    const { st, env } = R;
    st.up = [];
    env.sheetFailed = { page: 1, job: 'job-1' };
    st.answer = 'cancel';
    await env.deleteFromList(R.find(0, 'Wall'));
    eq('a sheet whose drawing would not open, its takeoff listed: the list is on it, Delete asks which',
      [st.asked.length, st.calls.map(c => c[0])], [1, []]);
    st.asked.length = 0;
    env.sheetFailed = { page: 1, job: 'job-0' };            // the last job's sheet
    await env.deleteFromList(R.find(0, 'Wall'));
    eq('...but not another job\'s failed sheet', [st.asked.length, st.calls.map(c => c[0])], [0, ['whole-question']]);
  }
  {
    const R = mainRig(DEL);
    const { st, env } = R;
    st.up = [];
    st.view = { ...own(1), coming: true };
    await env.deleteFromList(R.find(0, 'Wall'));
    eq('a sheet still opening: the plain question (nothing of the item is on screen to take off it)',
      [st.asked.length, st.calls.map(c => c[0])], [0, ['whole-question']]);
  }

  // ── a row's tap, the chip on ───────────────────────────────────────────
  const STEP = ['stepOnThisSheet', 'sheetFailedOn', 'itemsDrawerHidesDrawing'];
  {
    const R = mainRig(STEP);
    const { st, env } = R;
    const wall = R.find(0, 'Wall');
    const here = [R.find(1, 'Wall', 0), R.find(1, 'Wall', 1)];
    const seq = [];
    for (let k = 0; k < 3; k++) {
      st.calls.length = 0;
      st.said.length = 0;
      const did = env.stepOnThisSheet(wall, 0);
      seq.push([did, st.calls.slice(), st.said.slice()]);
    }
    eq('three taps on Wall, X1.1 up: shape 1, 2, 1 of the two painted here -- selected, zoomed to, said -- and no turn',
      seq, [0, 1, 0].map(k => [true, [['select', [here[k]._uid]], ['zoom', here[k].points, 'area']],
        [`Shape ${k + 1} of 2 on X1.1 — tap the item again for the next shape`]]));
    eq('...a settle parked for want of a canvas does not come after it', env.pendingTurn, null);
  }
  {
    const R = mainRig(STEP);
    const { st, env } = R;
    const cap = R.find(-1000, 'Cap');
    const run = R.find(1, 'Cap');
    eq('an item whose main shape is filed on no sheet, its run here: the tap selects and zooms to the run here',
      [env.stepOnThisSheet(cap, -1000), st.calls.map(c => c[0]), [...env.controller.selected]],
      [true, ['select', 'zoom'], [run._uid]]);
    st.calls.length = 0;
    eq('...a standalone (nothing of it painted anywhere): the tap goes on, nothing selected',
      [env.stepOnThisSheet(R.find(-1000, 'Nails'), -1000), st.calls], [false, []]);
    eq('...an item not on this sheet: the tap goes on (the jump)', [env.stepOnThisSheet(R.find(2, 'Beam'), 2), st.calls],
      [false, []]);
    st.chip = false;
    eq('the chip off: never stepping on one sheet', [env.stepOnThisSheet(R.find(0, 'Wall'), 0), st.calls], [false, []]);
    st.chip = true;
    st.up = [];
    st.view = { ...own(1), coming: true };
    eq('X1.1 still opening: the tap goes on', [env.stepOnThisSheet(R.find(0, 'Wall'), 0), st.calls], [false, []]);
  }
  {
    const R = mainRig(STEP);
    const { st, env } = R;
    st.up = [];
    env.sheetFailed = { page: 1, job: 'job-1' };
    eq('X1.1\'s drawing would not open, its takeoff listed: a tap on Wall stays on X1.1 -- no turn, nothing zoomed -- and says why',
      [env.stepOnThisSheet(R.find(0, 'Wall'), 0), st.calls, st.said],
      [true, [], ['The drawing of X1.1 did not open — “Wall” cannot be shown on it']]);
    eq('...a row of nothing on X1.1 goes on', env.stepOnThisSheet(R.find(2, 'Beam'), 2), false);
  }
  // ── a row's step and the drawer it is tapped in, on a clock ───────────
  // On a phone the open drawer covers most of the drawing, so a step closes
  // it and the shape is seen -- but never inside the tap that stepped: the
  // second tap of a double-tap (Properties, decision 10) must still land on
  // the ROW. Closed at once, it landed on the drawing the drawer had bared,
  // and the canvas's own double-click opened Properties of whatever shape
  // was under the finger -- another item's form, one OK from editing the
  // wrong item. Run here on a clock, with a finger's tap that lands on what
  // is on top: the row while the drawer is open, the drawing once it has
  // gone. main.js's own wiring of the drawer (the finger back on the list)
  // is lifted by its text and installed, not stood in for.
  {
    const PANEL_WIRING = (() => {
      const i = MAIN_SRC.indexOf("\n$('itemsPanel').addEventListener('pointerdown', ");
      return i < 0 ? null : MAIN_SRC.slice(i + 1, MAIN_SRC.indexOf('\n', i + 1));
    })();
    ok('(a finger back on the Items list is wired by its text)', !!PANEL_WIRING);
    const WAIT = MAIN_SRC.includes('\nconst STEP_CLOSE_MS = ') ? mainConst('STEP_CLOSE_MS') : 0;
    // Headless Chrome makes a second finger tap a double-tap up to 400 ms
    // after the first (measured, real CDP touch), Windows a double-click up
    // to 500 ms by default: the drawer waits that out.
    ok('the drawer waits out a double-tap\'s second tap (500 ms, Windows\' double-click default)', WAIT >= 500);
    const DRAWER = ['stepOnThisSheet', 'sheetFailedOn', 'itemsDrawerHidesDrawing', 'openPropertiesFromList', 'toggleDrawer',
      ...['closeItemsDrawerSoon', 'keepItemsDrawer'].filter(n => MAIN_SRC.includes(`\nfunction ${n}(`))];
    const drawerRig = ({ mobile = true, canvasW = 390, open = true } = {}) => {
      const clock = { now: 0, q: [], n: 0 };
      const el = isOpen => {
        const cls = new Set(isOpen ? ['mopen'] : []);
        return { on: {}, cls,
          classList: { contains: c => cls.has(c), add: c => cls.add(c), remove: c => cls.delete(c),
            toggle: (c, f) => ((f === undefined ? !cls.has(c) : f) ? cls.add(c) : cls.delete(c)) },
          getBoundingClientRect: () => ({ width: 320 }),
          addEventListener(type, fn) { (this.on[type] ||= []).push(fn); } };
      };
      const els = { itemsPanel: el(open), thumbsPanel: el(false), scrim: { hidden: !open } };
      const R = mainRig(DRAWER, {
        setTimeout: (fn, ms) => { clock.n += 1; clock.q.push({ id: clock.n, at: clock.now + (ms || 0), fn }); return clock.n; },
        clearTimeout: id => { clock.q = clock.q.filter(t => t.id !== id); },
        stepCloseTimer: 0,
        STEP_CLOSE_MS: WAIT,
        closeDrawers: () => {
          R.st.calls.push(['closeDrawers']);
          els.thumbsPanel.cls.delete('mopen');
          els.itemsPanel.cls.delete('mopen');
          els.scrim.hidden = true;
        },
      });
      Object.assign(R.st.els, els);
      R.st.mobile = mobile;
      R.env.viewport.width = canvasW;
      R.env.selectItem = inMain(R.env, `return ({ ${SELECT_ITEM} }).selectItem;`);
      if (PANEL_WIRING) inMain(R.env, PANEL_WIRING);
      const advance = ms => {
        const end = clock.now + ms;
        for (;;) {
          clock.q.sort((a, b) => a.at - b.at);
          const t = clock.q[0];
          if (!t || t.at > end) break;
          clock.q.shift();
          clock.now = t.at;
          t.fn();
        }
        clock.now = end;
      };
      const isOpen = () => els.itemsPanel.cls.has('mopen');
      // A finger's tap on a row: what it lands on is what is on top there.
      // On the row: its pointerdown (every listener the panel has), its
      // click -- detail 2 for a double-tap's second -- and then the row's
      // dblclick, which is the host's openProperties (openPropertiesFromList).
      const tap = (item, row, detail = 1) => {
        if (!isOpen()) return 'drawing';
        for (const fn of els.itemsPanel.on.pointerdown || []) fn({ type: 'pointerdown' });
        R.env.selectItem(item, row, { detail });
        if (detail >= 2) R.env.openPropertiesFromList(item);
        return 'row';
      };
      const closes = () => R.st.calls.filter(c => c[0] === 'closeDrawers').length;
      return Object.assign(R, { advance, tap, isOpen, closes, els });
    };
    // A double-tap: 40 ms down, then the second finger down `gap` ms after
    // the first click (the reviewer's 90 and 250 ms gaps, and a mouse's
    // slower double-click).
    for (const gap of [130, 290, 450]) {
      const R = drawerRig();
      const wall = R.find(0, 'Wall');
      const here = R.find(1, 'Wall', 0);
      const first = R.tap(wall, 0, 1);
      const atOnce = [R.closes(), [...R.env.controller.selected]];
      R.advance(gap);
      const second = R.tap(wall, 0, 2);
      R.advance(3000);
      eq(`a phone, the chip on: a double-tap on Wall's row (${gap} ms) -- both taps land on the row, and the second opens Wall's own Properties, its shape here selected`,
        [first, atOnce, second, R.st.calls.filter(c => c[0] === 'properties'), [...R.env.controller.selected]],
        ['row', [0, [here._uid]], 'row', [['properties', wall._uid]], [here._uid]]);
      eq(`...and the drawer stays open behind the form (${gap} ms): it never went`, [R.closes(), R.isOpen()], [0, true]);
    }
    {
      const R = drawerRig();
      const wall = R.find(0, 'Wall');
      R.tap(wall, 0, 1);
      const atOnce = R.closes();
      R.advance(WAIT - 1);
      const justBefore = R.closes();
      R.advance(1);
      eq('a phone, one tap: the step is seen -- the drawer goes once a double-tap can no longer be one, not inside the tap',
        [atOnce, justBefore, R.closes(), R.isOpen(), [...R.env.controller.selected]],
        [0, 0, 1, false, [R.find(1, 'Wall', 0)._uid]]);
    }
    {
      const R = drawerRig();
      const wall = R.find(0, 'Wall');
      R.tap(wall, 0, 1);
      R.advance(450);
      R.tap(wall, 0, 1);                       // past the browser's double-tap: a second step
      const stepped = [...R.env.controller.selected];
      R.advance(WAIT - 1);
      const before = R.closes();
      R.advance(1);
      eq('a phone, two single taps: shape 2 here, and the drawer goes a wait after the SECOND tap, not mid-way',
        [stepped, before, R.closes()], [[R.find(1, 'Wall', 1)._uid], 0, 1]);
    }
    {
      const R = drawerRig();
      R.tap(R.find(0, 'Wall'), 0, 1);
      R.advance(100);
      R.env.toggleDrawer('items');             // shut by its button...
      R.advance(100);
      R.env.toggleDrawer('items');             // ...and opened again
      R.advance(3000);
      eq('a phone: the drawer shut and opened again by its button within the wait -- the step does not shut it again',
        [R.closes(), R.isOpen()], [0, true]);
    }
    {
      const R = drawerRig();
      R.tap(R.find(0, 'Wall'), 0, 1);
      R.advance(100);
      R.env.toggleDrawer('thumbs');            // the sheets drawer opened over it
      R.advance(3000);
      eq('a phone: the sheets drawer opened within the wait stays open', [R.closes(), R.els.thumbsPanel.cls.has('mopen')], [0, true]);
    }
    {
      const R = drawerRig();
      R.tap(R.find(0, 'Wall'), 0, 1);
      R.advance(200);
      R.env.viewport.width = 844;              // turned to landscape: 320 of 844
      R.advance(3000);
      eq('a phone turned to landscape within the wait: the drawer no longer hides the drawing, and stays (as on an iPad)',
        [R.closes(), R.isOpen()], [0, true]);
    }
    for (const [opts, what] of [
      [{ canvasW: 768 }, 'an iPad in portrait (320 of 768): the drawer stays open while he steps'],
      [{ open: false }, 'a phone with the drawer shut: nothing to close'],
      [{ mobile: false }, 'the standard layout: the list is a column, never a drawer'],
    ]) {
      const R = drawerRig(opts);
      const wall = R.find(0, 'Wall');
      R.env.stepOnThisSheet(wall, 0);
      R.advance(3000);
      eq(`a step, ${what}`, R.closes(), 0);
    }
    {
      const R = drawerRig({ canvasW: 768 });
      const wall = R.find(0, 'Wall');
      R.tap(wall, 0, 1);
      R.advance(130);
      eq('an iPad in portrait: a double-tap on the row opens Wall\'s Properties, the drawer open',
        [R.tap(wall, 0, 2), R.st.calls.filter(c => c[0] === 'properties'), R.isOpen()],
        ['row', [['properties', wall._uid]], true]);
    }
  }

  // ── Properties… from the list ─────────────────────────────────────────
  {
    const PROPS = ['openPropertiesFromList'];
    for (const [name, page, chip, ro, sel, what] of [
      ['Wall', 0, true, false, [1, 'Wall', 0], 'Wall, its main shape on X1.0: its first shape here is selected, the form opens on the item'],
      ['Cap', -1000, true, false, [1, 'Cap', 0], 'an item whose main shape is on no sheet: its shape here is selected'],
      ['Deck', 1, true, false, [1, 'Deck', 0], 'an item here: itself'],
      ['Wall', 0, true, true, null, 'View Only: nothing selected (the form says why)'],
      ['Wall', 0, false, false, null, 'the chip off: nothing selected, no page turned'],
    ]) {
      const R = mainRig(PROPS);
      const { st, env } = R;
      st.chip = chip;
      env.controller.readOnly = ro;
      const item = R.find(page, name);
      env.openPropertiesFromList(item);
      eq(`Properties…, ${what}`, st.calls,
        [...(sel ? [['select', [R.find(...sel)._uid]]] : []), ['properties', item._uid]]);
    }
  }

  // ── a row's tap, the chip off: the walk across sheets lands, THEN selects
  {
    const flipRig = () => {
      const st0 = {};
      const R = mainRig([], {
        goToPage(page, opts) {
          R.st.calls.push(['goToPage', page, opts]);
          // As goToPage does before its first await: it takes its ticket and
          // takes down the revision up (clearVersion).
          R.env.pageTicket += 1;
          const wasUp = R.env.versionView.revId;
          R.env.versionView.revId = '';
          return new Promise(res => {
            st0.land = (rev = opts.version || '') => {
              // ...and as it lands: the drawings it took down and put up each
              // drop the selection (controller.setVersionView)
              if (wasUp || rev) R.env.controller.select([]);
              R.env.versionView.revId = rev;
              res();
            };
          });
        },
      });
      R.env.stepOnThisSheet = () => false;
      R.env.stepAcrossSheets = () => R.st.step;
      R.env.selectItem = inMain(R.env, `return ({ ${SELECT_ITEM} }).selectItem;`);
      return Object.assign(R, { st0 });
    };
    const tick = () => new Promise(r => setTimeout(r, 0));
    const cases = [
      ['a shape on the REISSUE of the sheet up (its own drawing up)', 2, 'r-a6', '', [2], true],
      ['a shape on the sheet\'s own drawing, a reissue up', 2, '', 'r-a6', [2], true],
      ['a shape on the reissue that is up', 2, 'r-a6', 'r-a6', [2], true],
    ];
    for (const [what, page, rev, up, sheets] of cases) {
      const R = flipRig();
      const m = { _uid: `s-${rev || 'own'}`, rev_id: rev, points: pts(5) };
      R.st.step = [page, m];
      R.st.up = sheets;
      R.env.versionView.revId = up;
      R.env.selectItem(m, page, { detail: 1 });
      R.st0.land();
      await tick();
      eq(`the chip off, ${what}: landed on its drawing, THEN selected -- the flip does not take the selection with it`,
        [R.st.calls.filter(c => c[0] === 'goToPage').map(c => [c[1], c[2]]), [...R.env.controller.selected]],
        [[[page, { version: rev }]], [m._uid]]);
    }
    {
      const R = flipRig();
      const m = { _uid: 's-own', rev_id: '', points: pts(5) };
      R.st.step = [2, m];
      R.st.up = [2];
      R.env.selectItem(m, 2, { detail: 1 });
      eq('a shape on the drawing up (own, own): selected at once, as before', [...R.env.controller.selected], ['s-own']);
    }
    {
      const R = flipRig();
      const m = { _uid: 's-r', rev_id: 'r-a6', points: pts(5) };
      R.st.step = [2, m];
      R.st.up = [2];
      R.env.selectItem(m, 2, { detail: 1 });
      R.st0.land('');                         // the reissue did not come up
      await tick();
      eq('...its drawing did not come up: nothing selected (it is not painted on the one that did)',
        [...R.env.controller.selected], []);
    }
    {
      const R = flipRig();
      const m = { _uid: 's-r', rev_id: 'r-a6', points: pts(5) };
      R.st.step = [2, m];
      R.st.up = [2];
      R.env.selectItem(m, 2, { detail: 1 });
      R.env.pageTicket += 1;                  // he turned on meanwhile
      R.st0.land();
      await tick();
      eq('...he went on before it landed: nothing selected', [...R.env.controller.selected], []);
    }
    {
      const R = flipRig();
      const m = { _uid: 's-x', rev_id: '', points: pts(5) };
      R.st.step = [0, m];
      R.st.up = [2];
      R.env.selectItem(m, 0, { detail: 1 });
      eq('a shape on another sheet: the jump (turned to, then zoomed and selected)',
        R.st.calls.filter(c => c[0] === 'jump' || c[0] === 'goToPage'), [['jump', 's-x', 0]]);
    }
  }

  // ── Zoom to item from a row's menu ─────────────────────────────────────
  {
    const menuRig = () => {
      const R = mainRig(['showItemMenu'], {
        showMenu: entries => { R.st.menu = entries; },
        openPropertiesFromList() {}, openMaterials() {}, deleteFromList() {},
      });
      R.env.app.project.setVisible = () => {};
      R.env.app.project.isolate = () => {};
      return R;
    };
    const zoomTo = (R, item, from) => {
      R.env.showItemMenu(item, { clientX: 5, clientY: 5 }, { from });
      R.st.menu.find(e => e && e.label === 'Zoom to item').run();
      return R.st.calls.filter(c => c[0] === 'zoom' || c[0] === 'jump')
        .map(c => (c[0] === 'zoom' ? ['zoom', c[1]] : c));
    };
    {
      const R = menuRig();
      const here = [R.find(1, 'Wall', 0), R.find(1, 'Wall', 1)];
      eq('the chip on, X1.1 up: Zoom to item on Wall (main shape on X1.0) zooms to its shapes HERE, no turn',
        zoomTo(R, R.find(0, 'Wall'), 'list'), [['zoom', [...here[0].points, ...here[1].points]]]);
    }
    {
      const R = menuRig();
      eq('...an item whose main shape is on no sheet: its run here', zoomTo(R, R.find(-1000, 'Cap'), 'list'),
        [['zoom', R.find(1, 'Cap').points]]);
    }
    {
      const R = menuRig();
      const beam = R.find(2, 'Beam');
      eq('...nothing of it here: the ordinary jump to it', zoomTo(R, beam, 'list'), [['jump', beam._uid, 2]]);
    }
    {
      const R = menuRig();
      R.st.chip = false;
      const wall = R.find(0, 'Wall');
      eq('the chip off: the jump to its main shape, as before', zoomTo(R, wall, 'list'), [['jump', wall._uid, 0]]);
    }
    {
      const R = menuRig();
      const deck = R.find(1, 'Deck');
      eq('from the drawing: the shape pressed, as before', zoomTo(R, deck, 'canvas'), [['zoom', deck.points]]);
    }
  }

  // ── the drawing the list is on ─────────────────────────────────────────
  {
    const env = {
      app: { pages: { pageCount: 4 }, currentPage: 1 },
      versionView: { revId: '', revPage: 3 },
      comingUp: null, versionTicket: 2, landingTicket: 0, pageTicket: 5,
      onSheetUp: () => true, inLandedJob: () => true, sheetFailed: null, jobNow: () => 'job-1',
    };
    liftMain(env, ['sheetView']);
    const at = patch => { const was = {}; for (const k of Object.keys(patch)) { was[k] = env[k]; env[k] = patch[k]; }
      const v = env.sheetView(); Object.assign(env, was); return v; };
    eq('the sheet\'s own drawing: no revision page, whatever the last one left behind', at({}),
      { page: 1, revId: '', revPage: null, coming: false });
    eq('a reissue up: its page', at({ versionView: { revId: 'r-w', revPage: 0 } }), { page: 1, revId: 'r-w', revPage: 0, coming: false });
    eq('a turn landing (its ticket the one in force): coming', at({ landingTicket: 5 }).coming, true);
    eq('...an old landing\'s ticket: not', at({ landingTicket: 4 }).coming, false);
    eq('a flip decoding: coming', at({ comingUp: { vticket: 2 } }).coming, true);
    eq('...a landing\'s own comingUp (no flip): not', at({ comingUp: { vticket: -1 } }).coming, false);
    eq('the drawing not up: coming', at({ onSheetUp: () => false }).coming, true);
    eq('...unless this job\'s sheet would not decode: its takeoff is listed', at({ onSheetUp: () => false,
      sheetFailed: { page: 1, job: 'job-1' } }).coming, false);
    eq('...another job\'s failure is not this one', at({ onSheetUp: () => false,
      sheetFailed: { page: 1, job: 'job-0' } }).coming, true);
    eq('no sheet open: none', at({ app: { pages: { pageCount: 0 }, currentPage: 0 } }), null);
  }

  // ── where a finger's answer is said ────────────────────────────────────
  {
    const st = { status: [], display: 'none', appended: [], timers: [] };
    const mk = () => ({ id: '', className: '', hidden: true, textContent: '', attrs: {},
      setAttribute(k, v) { this.attrs[k] = v; } });
    const env = {
      setStatus: t => st.status.push(t),
      document: {
        querySelector: sel => (sel === '.statusbar' ? { bar: true } : null),
        createElement: () => mk(),
        body: { appendChild: e => { st.appended.push(e); } },
      },
      getComputedStyle: () => ({ display: st.display }),
      $: id => st.appended.find(e => e.id === id) || null,
      setTimeout: (f, ms) => { st.timers.push([f, ms]); return st.timers.length; },
      clearTimeout() {},
      fingerToastTimer: 0,
      FINGER_TOAST_MS: mainConst('FINGER_TOAST_MS'),
    };
    liftMain(env, ['sayToFinger']);
    env.sayToFinger('Shape 1 of 2 on X1.1 — tap the item again for the next shape');
    const t = st.appended[0];
    eq('no status line drawn (a phone): the sentence in the status line AND in a toast, for a few seconds',
      [st.status, st.appended.length, t && t.className, t && t.textContent, t && t.hidden, st.timers.map(x => x[1])],
      [['Shape 1 of 2 on X1.1 — tap the item again for the next shape'], 1, 'toast finger-toast',
        'Shape 1 of 2 on X1.1 — tap the item again for the next shape', false, [env.FINGER_TOAST_MS]]);
    st.timers[0][0]();
    eq('...then the toast goes', t.hidden, true);
    env.sayToFinger('Wall is also on X1.0, X1.2');
    eq('...the next one uses the same toast', [st.appended.length, t.textContent, t.hidden], [1, 'Wall is also on X1.0, X1.2', false]);
    st.display = 'flex';
    st.appended.length = 0;
    env.sayToFinger('Only the items drawn on X1.1 — the SHEET chip shows them all again');
    eq('a status line on screen: the status line only', [st.status.length, st.appended.length], [3, 0]);
    ok('a finger\'s answers are said through it: the list\'s taps, a step, a Delete of this sheet\'s shapes',
      MAIN_SRC.includes('say: text => sayToFinger(text),') && /if \(hit\.said\) sayToFinger\(hit\.said\);/.test(mainFn('stepOnThisSheet'))
      && /if \(step\.said\) sayToFinger\(step\.said\);/.test(mainFn('stepAcrossSheets'))
      && /if \(n\) sayToFinger\(deletedHereWords\(/.test(mainFn('deleteFromList')));
  }

  // ── the question itself (dialogs.js choiceDialog) ──────────────────────
  {
    const doc = stubDocument();
    const modal = doc.add('div', 'modal');
    doc.getElementById = id => doc.descendants().find(e => e.id === id) || null;
    const was = globalThis.document;
    globalThis.document = doc;
    try {
      const choices = [{ key: 'here', label: 'Delete the 2 shapes on X1.1', danger: true },
        { key: 'whole', label: 'Delete the whole item (5 shapes on X1.0, X1.1, X1.2)', danger: true },
        { key: 'cancel', label: 'Cancel' }];
      const ask = async () => {
        doc.activeElement = null;
        const pr = choiceDialog('Delete Item', '“Wall” has 5 shapes, on X1.0, X1.1, X1.2.',
          'The list is showing X1.1. Delete only what is drawn there, or the whole item?', choices, { defaultKey: 'cancel' });
        await Promise.resolve();               // the focus is given a microtask after it opens
        return pr;
      };
      const buttons = () => modal.querySelectorAll('button');
      let pr = ask();
      await Promise.resolve();
      await Promise.resolve();
      eq('the answers in the order given, stacked one per line, the default the primary one',
        [buttons().map(b => b.textContent), modal.querySelector('.dlg-foot').classList.contains('stack'),
          buttons().map(b => b.classList.contains('primary'))],
        [choices.map(c => c.label), true, [false, false, true]]);
      eq('Cancel has the focus, so Enter answers it', doc.activeElement && doc.activeElement.textContent, 'Cancel');
      for (const l of [...doc._l]) if (l.t === 'keydown') l.fn({ key: 'Escape', stopPropagation() {} });
      eq('Escape answers null (as the desktop\'s Cancel) -- never an answer that deletes', await pr, null);
      for (const c of choices) {
        pr = ask();
        await Promise.resolve();
        await Promise.resolve();
        doc.click(buttons().find(b => b.textContent === c.label));
        eq(`"${c.label}" answers '${c.key}'`, await pr, c.key);
      }
      pr = ask();
      await Promise.resolve();
      await Promise.resolve();
      doc.click(doc.activeElement);
      eq('Enter -- the focused answer -- is Cancel', await pr, 'cancel');
      pr = ask();
      await Promise.resolve();
      await Promise.resolve();
      const layer = modal.children[modal.children.length - 1];
      layer.onmousedown({ target: layer });
      eq('a click outside the box answers null', await pr, null);
      eq('(and every box is gone again)', modal.children.length, 0);
    } finally {
      globalThis.document = was;
    }
  }
}

// ═══ 2. the committed snapshot ══════════════════════════════════════════
{
  let snap = null;
  try {
    snap = JSON.parse(await readFile(new URL('counting-truth.json', DATA), 'utf-8'));
  } catch {
    fails += 1;
    console.log('FAIL tests/data/counting-truth.json is missing. Regenerate it with\n'
      + '  python tests/counting-python-truth.py --scenarios > tests/data/counting-truth.json');
  }
  if (snap) {
    console.log(`\n-- committed snapshot: ${snap.scenarios.length} scenarios --`);
    for (const s of snap.scenarios) checkScenario(s.input, s.truth, s.truth.name);
    checkJobSwitchOf(snap, 'job switch');
    if (!snap.sheetChip) eq('the truth says what the SHEET chip does (regenerate it)', false, true);
    else checkChip(snap.sheetChip, 'SHEET chip');
  }
}

// ═══ 3. the live differential ═══════════════════════════════════════════
let live = '';
if (!(await haveDesktopSource())) {
  console.log('\n-- live differential SKIPPED (set PTT_DESKTOP_SRC) --');
} else {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const script = path.join(here, 'counting-python-truth.py');
  const env = { ...process.env, PTT_DESKTOP_SRC: DESKTOP_SRC };
  console.log('\n-- live: the scenarios, from the desktop source as it is now --');
  let truth = null;
  try {
    const { stdout } = await run('python', [script, '--scenarios'],
      { maxBuffer: 1 << 28, windowsHide: true, env });
    truth = JSON.parse(stdout);
  } catch (err) {
    fails += 1;
    console.log(`FAIL the desktop's counting methods could not be lifted and run:\n${err.stderr || err.message}`);
  }
  if (truth) {
    console.log(`   (lifted ${truth.lifted.length} module names as a verified closure)`);
    const saved = [];
    for (const s of truth.scenarios) {
      checkScenario(s.input, s.truth, `live ${s.truth.name}`, { reopen: saved });
    }
    checkReopen(saved, 'live scenarios');
    checkJobSwitchOf(truth, 'live job switch');
    if (!truth.sheetChip) eq('live: the desktop says what the SHEET chip does', false, true);
    else checkChip(truth.sheetChip, 'live SHEET chip');
    live = 'scenarios';
  }

  if (await haveLibrary()) {
    const files = [];
    for await (const f of walkProjects(LIBRARY, 0, 3, { skipCopies: true })) files.push(f);
    console.log(`\n-- live: the library, ${files.length} projects, metadata only --`);
    let lib = null;
    try {
      const { stdout } = await run('python', [script, ...files],
        { maxBuffer: 1 << 30, windowsHide: true, env });
      // json.dumps of real jobs' items: a desktop vertical pitch line's rise
      // is the bare word Infinity in it (js/core/py-json.js reads it).
      lib = parsePyJson(stdout);
    } catch (err) {
      fails += 1;
      console.log(`FAIL the library run failed:\n${(err.stderr || err.message).slice(0, 2000)}`);
    }
    if (lib) {
      let sameOrder = 0;
      let items = 0;
      const saved = [];
      for (const s of lib.scenarios) {
        // The words list items in the order the store is walked; the desktop
        // walks the file's order, this app walks pages ascending.
        const js = Object.keys(s.input.measurements || {});
        const same = JSON.stringify(js) === JSON.stringify(s.truth.keyOrder);
        if (same) sameOrder += 1;
        items += s.truth.items.length;
        checkScenario(s.input, s.truth, s.truth.name, { words: same, reopen: saved, sheet: 'rows' });
      }
      checkReopen(saved, 'library');
      console.log(`   (${lib.scenarios.length} projects, ${items} items; words compared on `
        + `${sameOrder} whose store order matches)`);
      live += ' + library';
    }
  }

  // ═══ 4. the desktop reopening a web save ════════════════════════════════
  // A run the desktop held as 180.0 is saved here as 180, and the desktop
  // reads an int back. Python's sum() adds a leading int exactly and the
  // first float to it with a plain `+`; compensating from the first number
  // instead missed by a bit, and the desktop then announced on opening that
  // the item had been "re-added from its runs". Seeded, so a failure repeats.
  console.log('\n-- live: the desktop opens a web save of whole-number-led runs --');
  {
    let seed = 0x5eed;
    const rnd = () => {          // mulberry32
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    // a whole number of sq ft, or one with every bit of a double in use (a
    // traced area: 83.13100005532559) -- 32 random bits would add exactly
    const num = () => (rnd() < 0.4 ? 1 + Math.floor(rnd() * 400)
      : (rnd() + rnd() * 2 ** -32) * 400);
    const shape = (v, kw) => ({ type: 'area', name: 'Wall Q', label: 'Wall Q', value: v,
      points: [[1, 1], [9, 1], [9, 9]], visible: true, ...kw });
    const saved = [];
    const untouched = [];
    for (let k = 0; k < 240; k++) {
      const runs = [1 + Math.floor(rnd() * 400)];
      for (let j = 1 + Math.floor(rnd() * 4); j > 0; j--) runs.push(num());
      const own = num();
      const input = { name: `whole-number-led ${k}`, pageCount: 2,
        metadata: { page_labels: ['P1', 'P2'] },
        measurements: {
          0: [shape(own, { group_id: 'gq', own_value: own, group_count: runs.length + 1 })],
          1: runs.map(v => shape(v, { group_id: 'gq', group_child: true })) } };
      const p = projectOf(input);
      resyncGroups(p);                      // the item as this app adds it up
      untouched.push(savedGroups(input, p, ['gq'], `${input.name} · saved, not deleted from`));
      const doomed = k % 3 === 0 ? p.measurements[1][runs.length - 1]   // the last run
        : k % 3 === 1 ? p.measurements[1][Math.min(1, runs.length - 1)]  // one after the first
          : p.measurements[0][0];                                         // the main shape
      p.dropShapes([doomed._uid]);
      saved.push(savedGroups(input, p, ['gq'], `${input.name} · a shape deleted`));
    }
    checkReopen(saved, 'whole-number-led runs, a shape deleted');
    checkReopen(untouched, 'whole-number-led runs, saved as this app added them');
    // The limit, said every run rather than hidden: a total the DESKTOP
    // added up from 180.0 as a float, which this app saved untouched, is
    // re-added from 180 as an int on the next open and can move by a bit.
    // Nothing a save may do about it; the desktop must compare past the
    // last bit.
    const floatLed = v => {               // Python's sum() when every number is a float
      let hi = 0, lo = 0;
      for (const x of v) {
        const t = hi + x;
        lo += Math.abs(hi) >= Math.abs(x) ? (hi - t) + x : (x - t) + hi;
        hi = t;
      }
      return lo && Number.isFinite(lo) ? hi + lo : hi;
    };
    const desk = untouched.map(s => {
      const job = structuredClone(s.job);
      const m = job.measurements['0'][0];
      m.value = m.own_value + floatLed(job.measurements['1'].map(r => r.value));
      return { ...s, job };
    });
    const still = desktopReopens(desk).moved.filter(x => x.length).length;
    console.log(`   (known limit, the desktop's to fix: ${still} of ${desk.length} totals the desktop `
      + 'added from floats move by a bit when it re-adds them from a web save it reopens)');
    // ...and pySum is Python's sum() of the numbers as this app writes them
    const sums = [];
    for (let k = 0; k < 3000; k++) {
      const v = [];
      for (let j = 2 + Math.floor(rnd() * 5); j > 0; j--) v.push(num());
      sums.push(v);
    }
    sums.push([], [3], [180, 0.20500007584682972, 83.13100005532559, 7.25],
      [0.1, 0.2, 0.3], [7, 8, 9], [0.5, 2, 3]);
    const py = desktopReopens([], sums).sums;
    const off = sums.map((v, k) => [v, pySum(v), py[k]]).filter(([, a, b]) => a !== b);
    eq(`pySum is Python's sum() of ${sums.length} lists as this app writes them`,
      off.slice(0, 3), []);
    // What a main shape's heir takes over from it: the desktop's
    // _PROMOTE_KEYS, exactly. Since 3.08 `in_group` (its Group container) is
    // among them on both sides, so the heir stays in the item's Group; if
    // either side ever drops or adds a key, this says so.
    const doomed = { type: 'area', name: 'M', label: 'M', notes: 'n', floor_level: 'L1',
      category: 'C', layer: 'Lay', sub_category: 'S', cost_type: 'labor', sort_order: 7,
      associated_items: [{ name: 'Studs', qty: 1 }], color: [1, 0, 0, 1], visible: true,
      pitch: 4, purpose: 'p', catalog_code: 'X1', catalog_unit: 'EA', framing: { plan: 1 },
      framing_suppressed: true, in_group: 'grp', unit_cost: 3, rev_id: 'r1', rev_page: 0,
      scale: '1/4"', group_id: 'gp', own_value: 10, value: 15, points: [[1, 1], [9, 1], [9, 9]] };
    const heir = { type: 'area', name: 'R', label: 'R', visible: false, cost_type: 'material',
      unit_cost: 9, group_id: 'gp', group_child: true, value: 5, points: [[2, 2], [8, 2], [8, 8]] };
    const took = h => (h ? Object.keys(doomed).filter(k => k !== 'value'
      && JSON.stringify(h[k]) === JSON.stringify(doomed[k])).sort() : null);
    const pp = new Project();
    pp.loadFrom({ metadata: {}, annotations: {}, pageCount: 2,
      measurements: { 0: [structuredClone(doomed)], 1: [structuredClone(heir)] } });
    pp.dropShapes([pp.measurements[0][0]._uid]);
    const [deskHeir] = desktopReopens([], [], [[structuredClone(doomed), structuredClone(heir)]]).heirs;
    eq('a main shape\'s heir takes over what the desktop\'s heir takes, and no more',
      took(pp.measurements[1][0]), took(deskHeir));
    // ...and the item's TAKEOFF goes with it (desktop 3.08 _promote_child ->
    // _set_takeoff_list), never through the key loop: SET from a Deck main
    // shape onto an untagged run (a split 3.07 left), read trimmed; POPPED
    // off a Deck-tagged run when the main shape is Main's (`took` reads only
    // doomed's keys, so the tag is asked apart); and an EMPTY doomed -- a
    // group with no main shape given its first by resyncGroups(layout) --
    // hands on nothing, so the run keeps its own tag.
    const DECK = 'tl-0000dec0';
    const tagCases = [
      ['a Deck main shape\'s heir is filed in Deck',
        { ...structuredClone(doomed), takeoff_list: DECK }, structuredClone(heir)],
      ['a padded tag is handed on as the desktop reads it',
        { ...structuredClone(doomed), takeoff_list: ` ${DECK} ` }, structuredClone(heir)],
      ['a Main main shape\'s heir loses the stray Deck tag it had',
        structuredClone(doomed), { ...structuredClone(heir), takeoff_list: DECK }],
    ];
    const deskTag = desktopReopens([], [], tagCases.map(([, d, h]) => [structuredClone(d), structuredClone(h)]))
      .heirs.map(h => (h ? h.takeoff_list ?? null : 'no answer'));
    tagCases.forEach(([label, d, h], k) => {
      const q = new Project();
      q.loadFrom({ metadata: {}, annotations: {}, pageCount: 2,
        measurements: { 0: [structuredClone(d)], 1: [structuredClone(h)] } });
      q.dropShapes([q.measurements[0][0]._uid]);
      eq(`${label}, as the desktop's heir is`, q.measurements[1][0].takeoff_list ?? null,
        k < deskTag.length ? deskTag[k] : 'no answer');
    });
    {
      const lone = { ...structuredClone(heir), takeoff_list: DECK };
      const q = new Project();
      q.loadFrom({ metadata: {}, annotations: {}, pageCount: 2,
        measurements: { 0: [structuredClone(lone)], 1: [{ ...structuredClone(heir), name: 'R2' }] } });
      resyncGroups(q, { layout: true });
      const [deskLone] = desktopReopens([], [], [[{}, structuredClone(lone)]]).heirs;
      eq('a group with no main shape: its first run, promoted with nothing to take, keeps its own takeoff',
        [q.measurements[0][0].group_child ?? null, q.measurements[0][0].takeoff_list ?? null],
        [deskLone ? deskLone.group_child ?? null : 'no answer', deskLone ? deskLone.takeoff_list ?? null : 'no answer']);
    }
  }
}

console.log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass — the port counts what the desktop counts`
    + (live ? ` (snapshot + live ${live})` : ' (snapshot; live differential skipped)'));
process.exit(fails ? 1 : 0);
