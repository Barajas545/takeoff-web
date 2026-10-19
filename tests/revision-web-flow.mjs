// The web's OWN wiring of plan revisions, through the real objects: Project,
// ToolController, the reports. No DOM, no pixels, no library.
//
// revision-counting.mjs proves the counting RULE equals the desktop's. This
// proves the app is wired to it — that a delete here carries every record the
// desktop files by sheet, that a takeoff is stamped and booked in one undo
// step, that an undo cannot take back a choice made since, that the reports
// price only what counts. Every section is a thing that was wrong in 3.04's
// port, and every one fails against it:
//
//   1. sheet_origin follows its sheet (the file-lens review's x2: a delete
//      here left the ADDED sheet's origin on the ORIGINAL sheet that slid
//      into its row, and the desktop's Delete Revision then deleted that
//      original as "the sheet it added").
//   2. the other records filed by sheet, and the indices inside records.
//   3. a sheet a revision ADDED: its own drawing is its newest, so it is not
//      locked read-only under an older reissue of the same number.
//   4. a multi-sheet item survives a delete of its master's sheet.
//   5. the controller stamps EVERY item and books the first takeoff, inside
//      the item's own undo level; undo/redo move the booking, said.
//   6. the book is not in the history: an undo of an older edit keeps a
//      Count this version made since.
//   7. the reports count what the desktop counts, and list what they leave out.
//
// Run: node tests/revision-web-flow.mjs
import { Project } from '../js/core/project.js';
import { ToolController } from '../js/tools/controller.js';
import { newestVersionOf, sheetVersions, versionItems } from '../js/core/revisions.js';
import * as Reports from '../js/ui/reports.js';

const { collectRows, collectItems, buildReportHtml } = Reports;
// Absent from a build that has no counting rule at all (3.04's port): the
// pin then answers by its stamp alone, which is exactly what fails below.
const countingOf = Reports.countingOf
  || (() => ({ markVersion: (pg, m) => [String(m.rev_id || ''), m.rev_page ?? null] }));

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
const ok = (label, cond, detail = '') => {
  checks += 1;
  if (cond) return true;
  fails += 1;
  console.log(`FAIL ${label}${detail ? `\n  ${detail}` : ''}`);
  return false;
};

function area(name, value, extra = {}) {
  return { type: 'area', name, label: name, value,
    points: [[1, 1], [9, 1], [9, 9]], visible: true, ...extra };
}

/**
 * The job the file-lens review built (x2_make): six sheets, a revision that
 * reissues A2.0 and A3.0 and ADDS A2.5 between them, A2.5 promoted into the
 * set as sheet 3. A roof on A6.0.
 */
function x2Job() {
  const p = new Project();
  p.loadFrom({
    metadata: {
      page_labels: ['A1.0', 'A2.0', 'A2.5', 'A3.0', 'A4.0', 'A5.0', 'A6.0'],
      sheet_origin: { 2: ['r-asi2', 1, '02/10/2026'] },
      revisions: [{ id: 'r-asi2', date: '02/10/2026', description: 'ASI 2',
        page_labels: ['A2.0', 'A2.5', 'A3.0'], match: { 1: 0, 3: 2 }, extra: {} }],
    },
    annotations: {},
    measurements: { 6: [area('roof (on A6.0)', 900)] },
    pageCount: 7,
    revisionCounts: [3],
  });
  return p;
}

// ═══ 1. sheet_origin follows its sheet ═══════════════════════════════════
console.log('-- sheet_origin follows its sheet --');
{
  const p = x2Job();
  p.notePageRemoved(0);                       // A1.0 goes; everything moves up
  eq('the ADDED sheet is still the one with an origin', p.metadata.sheet_origin,
    { 1: ['r-asi2', 1, '02/10/2026'] });
  eq('and that sheet is A2.5', p.pageLabel(1), 'A2.5');
  eq('the original A3.0 slid into row 2 and has NO origin',
    [p.pageLabel(2), (p.metadata.sheet_origin || {})['2']], ['A3.0', undefined]);
  eq('the reissue pairs moved with their sheets', p.metadata.revisions[0].match, { 0: 0, 2: 2 });
}
{
  const p = x2Job();
  p.notePageRemoved(2);                       // the ADDED sheet itself goes
  eq('deleting the ADDED sheet drops its origin', p.metadata.sheet_origin, {});
  ok('and no original sheet is left marked ADDED',
    !Object.keys(p.metadata.sheet_origin || {}).length);
}
{
  const p = x2Job();
  p.notePagesInserted(1, 1);                  // a blank sheet in front of A2.0
  eq('an insert above moves the origin down a row, date and all',
    p.metadata.sheet_origin, { 3: ['r-asi2', 1, '02/10/2026'] });
}
{
  // A 2.97-3.04 file: two elements, no date. Carried as it is.
  const p = x2Job();
  p.metadata.sheet_origin = { 2: ['r-asi2', 1] };
  p.notePageRemoved(1);
  eq('a two-element origin is carried, not padded', p.metadata.sheet_origin, { 1: ['r-asi2', 1] });
}

// ═══ 2. the other records filed by sheet ══════════════════════════════════
console.log('\n-- every record filed by sheet, and the indices inside them --');
{
  const p = x2Job();
  Object.assign(p.metadata, {
    page_titles: { 0: 'COVER', 3: 'FLOOR PLAN', 6: 'ROOF' },
    page_overlays: { 4: { overlay_page: 0, opacity: 0.5 }, 5: { overlay_page: 6 },
      1: { rev_id: 'r-asi2', rev_page: 0 } },
    page_groups: [{ id: 'g1', name: 'Arch', pages: [0, 3, 6] }],
    revisions_pending_images: [{ id: 'r-parked', match: { 0: 1, 4: 0 } }],
    page_label_conf: { 0: 0.4, 5: 0.9 },
    detail_maps: { 0: { a: 1 } },
    vision_callouts: { 6: [1, 2] },
    extra_sheets: [{ id: 'xs-1', after: 0, label: 'A0.5' }, { id: 'xs-2', after: 5, label: 'A5.5' }],
    sheet_version: { 1: 'r-asi2', 3: 'r-asi2' },
  });
  p.measurements[4] = [{ type: 'page_ref', ref_page: 0, points: [[1, 1]], visible: true },
    { type: 'page_ref', ref_page: 6, points: [[2, 2]], visible: true }];
  p.notePageRemoved(0);
  eq('page_titles', p.metadata.page_titles, { 2: 'FLOOR PLAN', 5: 'ROOF' });
  eq('page_overlays: re-keyed, the compared sheet moved, a state comparing the deleted sheet dropped',
    p.metadata.page_overlays, { 0: { rev_id: 'r-asi2', rev_page: 0 }, 4: { overlay_page: 5 } });
  eq('page_groups keeps the desktop LIST shape, its pages moved',
    p.metadata.page_groups, [{ id: 'g1', name: 'Arch', pages: [2, 5] }]);
  eq('a parked revision\'s pairing moved', p.metadata.revisions_pending_images[0].match, { 3: 0 });
  eq('the reader\'s doubt moved', p.metadata.page_label_conf, { 4: 0.9 });
  ok('a detail map of the deleted sheet went with it', !('detail_maps' in p.metadata));
  eq('what a look saw moved', p.metadata.vision_callouts, { 5: [1, 2] });
  eq('extra_sheets anchors: the deleted anchor falls back above it',
    p.metadata.extra_sheets.map(s => s.after), [-1, 4]);
  eq('sheet_version keys moved', p.metadata.sheet_version, { 0: 'r-asi2', 2: 'r-asi2' });
  eq('callout pins: the target that went points nowhere (-1), the other moved',
    p.measurements[3].map(m => m.ref_page), [-1, 5]);
  eq('a delete in the middle marks the pages rearranged', p.metadata.pages_rearranged, true);
}

// ═══ 3. an ADDED sheet's own drawing is its newest ════════════════════════
console.log('\n-- the newest drawing of a sheet a revision added --');
{
  // ASI 2 (Feb) added A2.5; an OLDER bulletin (Jan) also printed an A2.5 and
  // was paired with the sheet. Ranked as the ORIGINAL, the sheet's own
  // drawing lost to January — and the web locked it read-only as "older".
  const revs = [
    { id: 'r-jan', date: '01/05/2026', description: 'Bulletin', match: { 2: 0 }, extra: {}, pageCount: 1 },
    { id: 'r-asi2', date: '02/10/2026', description: 'ASI 2', match: { 1: 0, 3: 2 }, extra: {}, pageCount: 3 },
  ];
  const origins = { 2: ['r-asi2', 1, '02/10/2026'] };
  eq('the sheet\'s own drawing is newest — it IS February', newestVersionOf(2, revs, 'date', origins), '');
  eq('without the origin the older bulletin would win (the bug)', newestVersionOf(2, revs, 'date'), 'r-jan');
  // An origin pair still written into match: the sheet is not a version of itself.
  const healed = [{ ...revs[1], match: { 1: 0, 2: 1, 3: 2 } }];
  eq('the origin page is not a version of its own sheet',
    sheetVersions(2, healed, origins).map(v => v.revId), ['']);
}

// ═══ 3b. a pin or a note whose revision left the sheet comes home ═══════
console.log('\n-- pins and notes whose drawing has left the sheet --');
{
  // A callout pin and a note placed on ASI 2's drawing of A2.0, and a wall
  // traced there. Then ASI 2 is HIDDEN — a way of looking. The wall must not
  // be painted over the sheet's own drawing (it was not traced on it); the
  // pin and the note must be, or nothing can ever reach them again.
  const p = x2Job();
  p.metadata.revisions[0].visible = false;
  p.measurements[1] = [
    { type: 'page_ref', points: [[1, 1]], ref_page: 6, rev_id: 'r-asi2', rev_page: 0, visible: true },
    { type: 'textnote', points: [[2, 2], [3, 3]], text: 'n', rev_id: 'r-asi2', rev_page: 0, visible: true },
    area('Wall on ASI 2', 40, { rev_id: 'r-asi2', rev_page: 0 }),
  ];
  const model = countingOf(p);
  const markOf = m => model.markVersion(1, m);
  eq('on the sheet\'s own drawing: the pin and the note, not the wall',
    versionItems(p.measurements[1], '', null, markOf).map(m => m.type), ['page_ref', 'textnote']);
  eq('their stamps are kept', p.measurements[1].map(m => m.rev_id), ['r-asi2', 'r-asi2', 'r-asi2']);
  p.metadata.revisions[0].visible = true;
  eq('shown again, the revision has them back',
    versionItems(p.measurements[1], 'r-asi2', 0, m => countingOf(p).markVersion(1, m)).map(m => m.type),
    ['page_ref', 'textnote', 'area']);
}

// ═══ 4. a multi-sheet item survives the delete of its master's sheet ═════
console.log('\n-- a multi-sheet item across a deleted sheet --');
{
  const p = new Project();
  p.loadFrom({
    metadata: { page_labels: ['W1', 'W2', 'W3'] },
    annotations: {},
    measurements: {
      0: [{ type: 'polyline', name: 'Wall', value: 100, own_value: 40, group_id: 'g', group_count: 3,
        points: [[0, 0], [40, 0]], visible: true }],
      1: [{ type: 'polyline', name: 'Wall', value: 25, group_id: 'g', group_child: true,
        points: [[0, 0], [25, 0]], visible: true }],
      2: [{ type: 'polyline', name: 'Wall', value: 35, group_id: 'g', group_child: true,
        points: [[0, 0], [35, 0]], visible: true }],
    },
    pageCount: 3,
  });
  p.notePageRemoved(0);
  const heir = p.measurements[0][0];
  ok('a run took the item over', !heir.group_child && heir.group_id === 'g');
  eq('and the item is what is left of it: 25 + 35', heir.value, 60);
  eq('its own run is its own', heir.own_value, 25);
  eq('two shapes now', heir.group_count, 2);
  const rows = collectRows(p, i => `W${i + 2}`);
  eq('the report prices it once, at 60 LF', rows.map(r => [r.ItemName, r.ItemDistance]), [['Wall', 60]]);
}

// ═══ 5. every item is stamped, and the first takeoff books, in one step ═══
console.log('\n-- the controller files: stamped, booked, one undo step --');
function controllerFor(p, page = 0) {
  const canvas = { addEventListener() {}, setPointerCapture() {}, style: {} };
  const viewport = { zoom: 1, toPage: pt => pt };
  const events = [];
  const c = new ToolController({ canvas, viewport, project: p, currentPage: () => page, host: {} });
  c.addEventListener('takeoff-filed', ev => events.push(ev.detail));
  return { c, events };
}
function revJob() {
  const p = new Project();
  p.loadFrom({
    metadata: {
      page_labels: ['S1', 'S2'],
      revisions: [{ id: 'r2', date: '03/01/2026', description: '', page_labels: ['S1', 'S2'],
        match: { 0: 0, 1: 1 }, extra: {} }],
    },
    annotations: {}, measurements: {}, pageCount: 2, revisionCounts: [2],
  });
  return p;
}
{
  const p = revJob();
  const { c, events } = controllerFor(p, 0);
  c.setVersionView('r2', 0);               // REV 1 (r2) is the newest drawing of S1
  c._commit(area('Slab', 120), 'Area');
  const m = p.measurements[0][0];
  eq('stamped with the drawing it was traced on', [m.rev_id, m.rev_page], ['r2', 0]);
  eq('the first takeoff booked that drawing', p.metadata.sheet_version, { 0: 'r2' });
  ok('and said so, naming the quantity',
    events[0] && /S1 now counts from REV 1 — the drawing you are taking off; Slab 120 sq ft comes into your totals/.test(events[0].booking.said),
    JSON.stringify(events[0] && events[0].booking));
  eq('ONE undo step for both', p._undo.length, 1);
  const said = [];
  p.addEventListener('booking', ev => said.push(ev.detail));
  p.undo();
  ok('Ctrl+Z takes back the item AND the booking',
    !(p.measurements[0] || []).length && !p.metadata.sheet_version);
  eq('and says the booking moved', said.map(s => [s.direction, s.kind, s.to]), [['undo', 'first', '']]);
  p.redo();
  ok('Ctrl+Y puts back both', p.measurements[0].length === 1
    && JSON.stringify(p.metadata.sheet_version) === JSON.stringify({ 0: 'r2' }));
  eq('and says so', said.map(s => s.direction), ['undo', 'redo']);

  // A second takeoff on the same sheet books nothing.
  c._commit(area('Slab 2', 10), 'Area');
  eq('the second takeoff books nothing', (events[events.length - 1] || {}).booking, null);
}
{
  // Counts, windows, notes and callouts went to addItem directly and were
  // never stamped: on a revision they vanished the moment they were placed.
  const p = revJob();
  const { c } = controllerFor(p, 1);
  c.setVersionView('r2', 1);
  c.countSpec = { name: 'Outlets', color: [1, 0, 0, 1] };
  c._addCountPoint([5, 5]);
  c._addOpeningPin('window', [6, 6]);
  const kinds = (p.measurements[1] || []).map(m => [m.type, m.rev_id, m.rev_page]);
  eq('a count and a window placed on the revision are stamped with it',
    kinds, [['count', 'r2', 1], ['window', 'r2', 1]]);
  eq('the count booked the sheet', p.metadata.sheet_version, { 1: 'r2' });
  // The count tool must not add a dot to a count traced on ANOTHER drawing.
  p.measurements[1].push({ type: 'count', name: 'Lights', points: [[1, 1]], value: 1,
    visible: true });                         // on the sheet's own drawing
  c.countTarget = null; c.countSpec = null;
  c.options = { ...(c.options || {}), pendingName: 'Lights' };
  c._addCountPoint([7, 7]);
  const own = p.measurements[1].find(m => m.name === 'Lights' && !m.rev_id);
  eq('a count on another drawing gains no dot', own.points.length, 1);
  const onRev = p.measurements[1].filter(m => m.name === 'Lights' && m.rev_id === 'r2');
  eq('a Lights count is started on the drawing on screen instead', onRev.length, 1);
}

// ═══ 6. an undo of an older edit keeps a Count this version made since ═══
console.log('\n-- the book is not in the history --');
{
  const p = revJob();
  p.measurements[0] = [area('Own', 50), area('On rev', 60, { rev_id: 'r2', rev_page: 0 })];
  p._backfillItems();
  p.updateItem(p.measurements[0][0]._uid, { notes: 'edited' }, { label: 'Edit' });
  // Count this version: outside any transaction, as the app does it.
  p.metadata.sheet_version = { 0: 'r2' };
  p.undo();                                    // undo the OLDER edit
  eq('the edit is undone', p.measurements[0][0].notes, undefined);
  eq('the book he set since is not', p.metadata.sheet_version, { 0: 'r2' });
}

// ═══ 7. the reports count what counts ═════════════════════════════════════
console.log('\n-- the reports --');
{
  // A real job's shape: everything on a revision nothing counts.
  const p = revJob();
  p.measurements = { 0: [area('Demo floor', 2000.2, { rev_id: 'r2', rev_page: 0 })],
    1: [area('Demo roof', 929, { rev_id: 'r2', rev_page: 1 })] };
  p._backfillItems();
  const lbl = i => `S${i + 1}`;
  eq('nothing counts, so nothing is priced (the desktop prices 0)', collectRows(p, lbl).length, 0);
  const html = buildReportHtml(p, lbl, 'estimate', {}, { groupBy: 'ft', costs: true });
  ok('the report says what it left out, up top', html.includes('2 items on other versions of 2 sheets are not in these totals'));
  ok('and lists it at the end, by quantity',
    html.includes('Not counted — takeoff on other versions of these sheets')
    && html.includes('2,000.2 sq ft') && html.includes('929.0 sq ft'));

  // Counted from the revision on S1: the original's takeoff leaves, the revision's comes in.
  p.measurements[0].push(area('Old floor', 1500));
  p._backfillItems();
  p.metadata.sheet_version = { 0: 'r2' };
  const rows = collectRows(p, lbl);
  eq('only the counted drawing is priced', rows.map(r => [r.ItemName, r.ItemArea, r.ItemLocation]),
    [['Demo floor', 2000.2, 'S1 · REV 1']]);
  eq('the printed report agrees', collectItems(p, lbl).map(e => [e.name, e.qty]), [['Demo floor', 2000.2]]);
}

console.log(fails ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass — the web carries, stamps, books and prices revisions the desktop's way`);
process.exit(fails ? 1 : 0);
