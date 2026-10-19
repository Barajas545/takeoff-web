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
// Run: node tests/revision-counting.mjs
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CountingModel, applyBooking, pyFixed, pyRound, pyG, takeoffQtyText,
  takeoffQty, takeoffMoveWords, takeoffQuantityWords, isTakeoffItem,
} from '../js/core/counting.js';
import {
  revisionShortName, workingVersionOf, newestVersionOf, sheetVersions,
} from '../js/core/revisions.js';
import { Project } from '../js/core/project.js';
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

function checkScenario(input, truth, label, { words = true } = {}) {
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
    for (const s of truth.scenarios) checkScenario(s.input, s.truth, `live ${s.truth.name}`);
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
      for (const s of lib.scenarios) {
        // The words list items in the order the store is walked; the desktop
        // walks the file's order, this app walks pages ascending.
        const js = Object.keys(s.input.measurements || {});
        const same = JSON.stringify(js) === JSON.stringify(s.truth.keyOrder);
        if (same) sameOrder += 1;
        items += s.truth.items.length;
        checkScenario(s.input, s.truth, s.truth.name, { words: same });
      }
      console.log(`   (${lib.scenarios.length} projects, ${items} items; words compared on `
        + `${sameOrder} whose store order matches)`);
      live += ' + library';
    }
  }
}

console.log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass — the port counts what the desktop counts`
    + (live ? ` (snapshot + live ${live})` : ' (snapshot; live differential skipped)'));
process.exit(fails ? 1 : 0);
