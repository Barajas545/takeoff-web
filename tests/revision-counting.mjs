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
  revisionShortName, workingVersionOf, newestVersionOf, sheetVersions,
} from '../js/core/revisions.js';
import { Project, resyncGroups } from '../js/core/project.js';
import { ToolController } from '../js/tools/controller.js';
import { collectItems, collectRows } from '../js/ui/reports.js';
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
  const out = execFileSync('python', [script, '--reopen'], {
    input: JSON.stringify({ jobs: saved.map(s => s.job), sums, promote }),
    env: { ...process.env, PTT_DESKTOP_SRC: DESKTOP_SRC },
    maxBuffer: 1 << 28, windowsHide: true, encoding: 'utf-8' });
  return JSON.parse(out);
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

function checkScenario(input, truth, label, { words = true, reopen = null } = {}) {
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
      lib = JSON.parse(stdout);
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
        checkScenario(s.input, s.truth, s.truth.name, { words: same, reopen: saved });
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
    // _PROMOTE_KEYS, exactly. `in_group` (its Group container) is not among
    // them there, so the heir leaves the Group on the desktop too, and here
    // it does the same -- if the desktop ever adds it, this says so.
    const doomed = { type: 'area', name: 'M', label: 'M', notes: 'n', floor_level: 'L1',
      category: 'C', layer: 'Lay', sub_category: 'S', cost_type: 'labor', sort_order: 7,
      associated_items: [{ name: 'Studs', qty: 1 }], color: [1, 0, 0, 1], visible: true,
      pitch: 4, purpose: 'p', catalog_code: 'X1', catalog_unit: 'EA', framing: { plan: 1 },
      framing_suppressed: true, in_group: 'grp', unit_cost: 3, rev_id: 'r1', rev_page: 0,
      scale: '1/4"', group_id: 'gp', own_value: 10, value: 15, points: [[1, 1], [9, 1], [9, 9]] };
    const heir = { type: 'area', name: 'R', label: 'R', visible: false, cost_type: 'material',
      unit_cost: 9, group_id: 'gp', group_child: true, value: 5, points: [[2, 2], [8, 2], [8, 8]] };
    const took = h => Object.keys(doomed).filter(k => k !== 'value'
      && JSON.stringify(h[k]) === JSON.stringify(doomed[k])).sort();
    const pp = new Project();
    pp.loadFrom({ metadata: {}, annotations: {}, pageCount: 2,
      measurements: { 0: [structuredClone(doomed)], 1: [structuredClone(heir)] } });
    pp.dropShapes([pp.measurements[0][0]._uid]);
    const [deskHeir] = desktopReopens([], [], [[structuredClone(doomed), structuredClone(heir)]]).heirs;
    eq('a main shape\'s heir takes over what the desktop\'s heir takes, and no more',
      took(pp.measurements[1][0]), took(deskHeir));
  }
}

console.log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass — the port counts what the desktop counts`
    + (live ? ` (snapshot + live ${live})` : ' (snapshot; live differential skipped)'));
process.exit(fails ? 1 : 0);
