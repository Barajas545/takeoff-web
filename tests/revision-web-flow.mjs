// The web's OWN wiring of plan revisions, through the real objects: Project,
// ToolController, the reports. No browser, no pixels, no library -- the few
// pieces that are DOM (the item menu, the Yes/No question) run on stand-in
// elements that deliver a press the way a browser does.
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
//   8. Delete takes what was asked: the Items list's Delete every shape of
//      the item on every sheet (it left the runs on the other sheets, and
//      the desktop's open-time heal put the item back in the bid), the
//      drawing's Delete one shape (it took every shape of the item on the
//      sheet and left the total stale), the list asking first, each one
//      Undo -- and the app's own wiring of the two: the menu's rows answer
//      a real press (it closed on the press, so none of them ran), the
//      question's default is No, a shape on another sheet is never deleted
//      from this one, Undo ends isolation, a long press is not a drag, and
//      a Delete made while a press is held is not undone by its release.
//   9. a job switch puts the count down: the first tap in the next job asks
//      the form, no window pin takes the last job's floor, and a form still
//      up from the last job answers nothing in the next.
//  10. the Count bar (desktop 3.07 on a tablet): Undo and Redo inside it,
//      finger-sized, doing what the top bar's do -- the same data-act, the
//      same dispatcher, a real press -- off when there is nothing to take
//      back, the bar still up after, the keyboard handed back to the
//      drawing after a press, and off again when another job comes in; and
//      Return or Escape in the Item box lets go of the keyboard, so the
//      next tap and Cmd+Z reach the drawing -- and goes no further, so the
//      document's own Escape never takes him off the drawing he counts on.
//      And where the bar is parked on an iPad: over the sheet, not the
//      Items panel's head, and below the toolbars when they are pulled down.
//  11. a file's words are printed, never made markup: a cost type, floor or
//      category from the file is escaped in every report, and a row's class
//      is one of the report's own two words.
//
// Run: node tests/revision-web-flow.mjs
import { readFile } from 'node:fs/promises';
import { Project } from '../js/core/project.js';
import { ToolController } from '../js/tools/controller.js';
import { newestVersionOf, sheetVersions, versionItems } from '../js/core/revisions.js';
import { CountingModel, takeoffMoveWords, deleteItemQuestion } from '../js/core/counting.js';
import * as Reports from '../js/ui/reports.js';
import * as H from '../js/ui/report-html.js';
import { yesNoDialog } from '../js/ui/dialogs.js';
import * as Dialogs from '../js/ui/dialogs.js';
import { MARKUP_TOOLS } from '../js/tools/controller.js';
import { menuPlace } from '../js/ui/hold.js';

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
  // Worded on the job as the filing left it (what came in), as the app says it.
  const b0 = events[0] && events[0].booking;
  const said0 = b0 && b0.says ? new CountingModel({ metadata: p.metadata,
    measurements: p.measurements, pageCount: p.pageCount }).firstTakeoffSaid(0, b0.rid, b0.before) : '';
  ok('and said so, naming the quantity that came in',
    /S1 now counts from REV 1 — the drawing you are taking off; in your totals: 120 sq ft of Slab comes in\./.test(said0),
    said0);
  eq('ONE undo step for both', p._undo.length, 1);
  const said = [];
  p.addEventListener('booking', ev => said.push(ev.detail));
  p.undo();
  ok('Ctrl+Z takes back the item AND the booking',
    !(p.measurements[0] || []).length && !p.metadata.sheet_version);
  eq('and says the booking moved', said.map(s => [s.direction, s.kind, s.to]), [['undo', 'first', '']]);
  // ...measured from the job BEFORE the step: read after the restore, the
  // totals were already the picture's and the 120 sq ft that left went unnamed.
  {
    const pr = said[0] && said[0].prior;
    const before = pr ? new CountingModel({ metadata: pr.metadata, measurements: pr.measurements,
      pageCount: pr.pageCount }).countedQuantities() : new Map();
    const now = new CountingModel({ metadata: p.metadata, measurements: p.measurements,
      pageCount: p.pageCount }).countedQuantities();
    eq('the undo is said from the job before it: what left is named',
      takeoffMoveWords(before, now), '120 sq ft of Slab leaves');
  }
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

// ═══ 8. Delete takes what was asked ═══════════════════════════════════════
console.log('\n-- Delete: the whole item from the list, one shape from the drawing --');
// "Wall M": its main shape on A1.0 (10 sq ft of its own), two runs on A1.1
// and one on A2.0 -- 65 sq ft in all, four shapes. A slab beside it.
function wallJob() {
  const p = new Project();
  p.loadFrom({
    metadata: { page_labels: ['A1.0', 'A1.1', 'A2.0'] }, annotations: {}, pageCount: 3,
    measurements: {
      0: [area('Wall M', 65, { group_id: 'gm', own_value: 10, group_count: 4, floor_level: 'L1',
        category: 'Framing', associated_items: [{ name: 'Studs', qty: 0.75, qty_mode: 'per_unit', unit: 'EA' }] }),
      area('Slab', 48)],
      1: [area('Wall M', 20, { group_id: 'gm', group_child: true }),
        area('Wall M', 15, { group_id: 'gm', group_child: true })],
      2: [area('Wall M', 20, { group_id: 'gm', group_child: true })],
    },
  });
  return p;
}
const shapesOf = (p, gid) => [...p.allItems()].filter(([, m]) => m.group_id === gid);
const storeJson = p => JSON.stringify(p.measurements);
const nextTick = () => new Promise(r => setTimeout(r, 0));

// A page of stand-in elements, for the few pieces of the app that are DOM:
// enough of a document to build a menu or a dialog, and to deliver a press
// the way a browser does -- capture down, bubble up -- with the release
// landing on what is UNDER the pointer then: the pressed element if it is
// still on screen, the page behind it if it was hidden in the meantime.
class StubEl {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.parentNode = null;
    this.hidden = false;
    this.id = '';
    this.className = '';
    this.style = {};
    this._text = '';
    this._l = [];
    this.offsetWidth = 160;
    this.offsetHeight = 120;
    this.dataset = {};
    this.disabled = false;
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
  addEventListener(t, fn, o) { this._l.push({ t, fn, capture: o === true || !!(o && o.capture) }); }
  removeEventListener(t, fn, o) {
    const capture = o === true || !!(o && o.capture);
    this._l = this._l.filter(l => !(l.t === t && l.fn === fn && l.capture === capture));
  }
  descendants() { return this.children.flatMap(c => [c, ...c.descendants()]); }
  querySelector(sel) {
    const alts = sel.split(',').map(s => s.trim().split('.'));
    return this.descendants().find(e => alts.some(([tag, cl]) =>
      e.tagName === tag.toUpperCase() && (!cl || e.classList.contains(cl)))) || null;
  }
  focus() { this.ownerDocument.activeElement = this; }
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = null; }
  // `tag`, `.class`, `tag.class` or `tag[data-some-thing]`
  matches(sel) {
    return sel.split(',').some(one => {
      const m = /^([a-z]*)(?:\.([\w-]+))?(?:\[data-([\w-]+)(?:="([^"]*)")?\])?$/i.exec(one.trim());
      if (!m) return false;
      const [, tag, cl, data, val] = m;
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      if (cl && !this.classList.contains(cl)) return false;
      if (data) {
        const key = data.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        if (!this.dataset || !(key in this.dataset)) return false;
        if (val !== undefined && this.dataset[key] !== val) return false;
      }
      return true;
    });
  }
  closest(sel) { for (let x = this; x && x.tagName; x = x.parentNode) if (x.matches && x.matches(sel)) return x; return null; }
  querySelectorAll(sel) { return this.descendants().filter(e => e.matches(sel)); }
  select() {}
  setAttribute() {}
}
function stubDocument() {
  const doc = new StubEl('#document', null);
  doc.ownerDocument = doc;
  doc.activeElement = null;
  doc.createElement = tag => new StubEl(tag, doc);
  doc.body = doc.appendChild(doc.createElement('body'));
  doc.all = pred => doc.descendants().filter(pred);
  doc.byId = id => doc.descendants().find(e => e.id === id) || null;
  doc.getElementById = doc.byId;
  doc.add = (tag, id) => { const e = doc.createElement(tag); e.id = id; return doc.body.appendChild(e); };
  const fire = (node, ev, capture) => {
    for (const l of [...node._l]) if (l.t === ev.type && l.capture === capture) l.fn.call(node, ev);
    const h = !capture && node[`on${ev.type}`];
    if (typeof h === 'function') h.call(node, ev);
  };
  doc.dispatch = (target, type, extra = {}) => {
    const path = [];
    for (let x = target; x; x = x.parentNode) path.push(x);
    if (path[path.length - 1] !== doc) path.push(doc);
    let stopped = false;
    const ev = { type, target, button: 0, pointerType: 'mouse', ...extra,
      stopPropagation() { stopped = true; }, preventDefault() { this.defaultPrevented = true; } };
    for (let i = path.length - 1; i > 0 && !stopped; i--) fire(path[i], ev, true);
    if (!stopped) fire(path[0], ev, true);
    for (let i = 0; i < path.length && !stopped; i++) fire(path[i], ev, false);
    return ev;
  };
  const shown = e => { for (let x = e; x && x !== doc; x = x.parentNode) if (x.hidden) return false; return true; };
  // A press and its release where `target` is. A finger's mouse events come
  // after it lifts, all at the one point, as Safari sends them.
  doc.realPress = (target, how = 'mouse') => {
    doc.dispatch(target, 'pointerdown', { pointerType: how });
    if (how !== 'touch') doc.dispatch(target, 'mousedown');
    doc.dispatch(shown(target) ? target : doc.body, 'pointerup', { pointerType: how });
    if (how === 'touch') doc.dispatch(target, 'mousedown');
    const under = shown(target) ? target : doc.body;
    doc.dispatch(under, 'mouseup');
    doc.dispatch(under, 'click');
  };
  return doc;
}

// The controller's own pointer handlers, on a canvas that hands them over:
// page coordinates are screen coordinates here (zoom 1, no pan).
function pointerRig(p, page = 0) {
  const on = {};
  const canvas = { addEventListener: (t, f) => { on[t] = f; }, setPointerCapture() {},
    releasePointerCapture() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  const viewport = { zoom: 1, toPage: pt => pt, eventToPage: ev => [ev.clientX, ev.clientY],
    toScreen: (x, y) => [x, y], panBy() {} };
  const r = { menuFor: null };
  r.c = new ToolController({ canvas, viewport, project: p, currentPage: () => page,
    host: { showItemMenu: item => { r.menuFor = item; } } });
  const ev = (x, y, how) => ({ pointerId: 1, pointerType: how, button: 0, clientX: x, clientY: y,
    preventDefault() {}, shiftKey: false, ctrlKey: false, metaKey: false, type: '' });
  r.down = (x, y, how) => on.pointerdown({ ...ev(x, y, how), type: 'pointerdown' });
  r.move = (x, y, how) => on.pointermove({ ...ev(x, y, how), type: 'pointermove' });
  r.up = (x, y, how) => on.pointerup({ ...ev(x, y, how), type: 'pointerup' });
  return r;
}
// The wall job with the slab clear of the wall, so a press can land on it.
function apartJob() {
  const p = wallJob();
  p.measurements[0][1].points = [[100, 100], [200, 100], [200, 200]];
  return p;
}
{
  // (a) the list's Delete: every shape, every sheet, one undo level
  const p = wallJob();
  const before = storeJson(p);
  const n = p.removeItems([p.measurements[0][0]._uid]);
  eq('the list\'s Delete takes all four shapes', n, 4);
  eq('...and leaves no shape of the item on ANY sheet (no orphan run for the desktop to heal)',
    shapesOf(p, 'gm').length, 0);
  eq('...and nothing else', [...p.allItems()].map(([, m]) => m.name), ['Slab']);
  eq('one undo level', p._undo.length, 1);
  p.undo();
  eq('one Undo puts every shape back, exactly', storeJson(p), before);
  eq('a delete of something no longer there deletes nothing and leaves no undo level',
    [p.removeItems(['m-gone']), p.dropShapes(['m-gone']), p._undo.length], [0, 0, 0]);
}
{
  // (b) the drawing's Delete key on ONE run: that run, and the total re-added
  const p = wallJob();
  const { c } = controllerFor(p, 1);
  const run = p.measurements[1][0];
  c.select([run._uid]);
  const before = storeJson(p);
  ok('the Delete key is the controller\'s', c.handleKey({ key: 'Delete' }));
  eq('one shape goes, not every shape of the item on the sheet',
    shapesOf(p, 'gm').length, 3);
  eq('the one that goes is the one selected', p.measurements[1].map(m => m.value), [15]);
  const master = p.measurements[0][0];
  eq('the item re-adds what is left: 10 + 15 + 20', master.value, 45);
  eq('three shapes now, numbered again', shapesOf(p, 'gm').map(([, m]) => [m.shape_no, m.group_count]),
    [[1, 3], [2, 3], [3, 3]]);
  eq('nothing is selected any more', c.selected.size, 0);
  eq('one undo level', p._undo.length, 1);
  p.undo();
  eq('one Undo puts it back, total and all', storeJson(p), before);
}
{
  // (c) the drawing's Delete on the MAIN shape: the item passes to a run
  const p = wallJob();
  const { c } = controllerFor(p, 0);
  c.select([p.measurements[0][0]._uid]);
  c.handleKey({ key: 'Backspace' });
  const heir = p.measurements[1][0];
  ok('the first run left takes the item over', !heir.group_child && heir.group_id === 'gm');
  eq('with its name, materials and classification',
    [heir.name, heir.floor_level, heir.category, (heir.associated_items || []).map(a => a.name)],
    ['Wall M', 'L1', 'Framing', ['Studs']]);
  eq('its own shape is its own, and it re-adds the rest: 20 + 15 + 20', [heir.own_value, heir.value], [20, 55]);
  eq('the item is in the totals once, beside the slab', new CountingModel({ metadata: p.metadata,
    measurements: p.measurements, pageCount: p.pageCount }).countedQuantities().size, 2);
  eq('one undo level', p._undo.length, 1);
}
{
  // (d) several shapes at once (a selection, Edit > Delete Selected): runs
  //     first, so with the main shape among them the item passes ONCE
  const p = wallJob();
  const n = p.dropShapes([p.measurements[0][0]._uid, p.measurements[1][1]._uid]);
  eq('two shapes go in one undo level', [n, p._undo.length], [2, 1]);
  const heir = p.measurements[1][0];
  eq('the item passed once, to the first run left, and re-adds: 20 + 20',
    [!!heir.group_child, heir.value, shapesOf(p, 'gm').length], [false, 40, 2]);
}
{
  // ...and when the FIRST run is among them, the item goes straight to the
  // next one -- not through the doomed run, whose own notes and colour it
  // would carry away with it
  const p = wallJob();
  Object.assign(p.measurements[1][0], { notes: 'first run only', color: [0, 0, 1, 1] });
  p.dropShapes([p.measurements[0][0]._uid, p.measurements[1][0]._uid]);
  const heir = p.measurements[1][0];
  eq('the heir is the second run, with the item\'s identity and none of the first run\'s',
    [!!heir.group_child, heir.name, heir.floor_level, heir.value, 'notes' in heir, 'color' in heir],
    [false, 'Wall M', 'L1', 35, false, false]);
}
{
  // (e) isolation: a deleted item leaves it; an isolated main shape's heir
  //     takes its place, so the item does not vanish from the screen
  const p = wallJob();
  p.isolate([p.measurements[0][0]._uid]);
  p.dropShapes([p.measurements[0][0]._uid]);
  ok('the heir is what is isolated now', p.isolating && p.isVisible(p.measurements[1][0]));
  p.removeItems([p.measurements[1][0]._uid]);
  ok('the isolated item deleted: isolation ends, everything shows', !p.isolating
    && p.isVisible(p.measurements[0][0]));
}
{
  // (f) a Group container: its members are unfiled, inside the undo level
  const p = new Project();
  p.loadFrom({ metadata: {}, annotations: {}, pageCount: 1, measurements: {
    0: [area('Door trim', 10, { in_group: 'grp' })],
    [-1000]: [{ type: 'group', name: 'Garage', group_item_id: 'grp', visible: true }] } });
  p.removeItems([p.measurements[-1000][0]._uid]);
  ok('a deleted Group leaves no member pointing at it', !('in_group' in p.measurements[0][0]));
  p.undo();
  eq('and Undo files them under it again', p.measurements[0][0].in_group, 'grp');
}
{
  // (g) the question, the desktop's word for word (revision-counting diffs
  //     it against the desktop's own _on_item_delete for every item)
  const p = wallJob();
  eq('a multi-shape item: how many shapes go', deleteItemQuestion(p.measurements[0][0]), {
    title: 'Delete Item',
    text: 'Delete “Wall M”?\n\nThis removes all 4 shapes that make up the item.',
    buttons: ['Yes', 'No'], defaultButton: 'No', done: 'Deleted “Wall M”.' });
  eq('one shape: the plain question', deleteItemQuestion(p.measurements[0][1]).text, 'Delete “Slab”?');
  eq('no name: "this item"', deleteItemQuestion({ type: 'area' }).text, 'Delete “this item”?');
}
{
  // (h) the app's own wiring. main.js runs only in a browser, so this reads
  //     it: the drawing's three ways in delete SHAPES, the list's asks and
  //     deletes the whole item. A browser check clicks them for real.
  const src = await readFile(new URL('../js/main.js', import.meta.url), 'utf-8');
  const body = (start) => {
    const i = src.indexOf(start);
    if (i < 0) return '';
    const j = src.indexOf('\n}\n', i);
    return src.slice(i, j < 0 ? undefined : j);
  };
  const del = src.slice(src.indexOf("case 'delete':"), src.indexOf("case 'select-none':"));
  ok('Edit > Delete Selected deletes the selected shapes, the Delete key\'s way',
    /controller\.deleteSelected\(\)/.test(del) && !/removeItems|dropShapes/.test(del), del.trim());
  const menu = body('function showItemMenu(');
  ok('the item menu knows where it was opened',
    menu.startsWith("function showItemMenu(item, ev, { from = 'canvas' } = {})"));
  // (since Round 6 the list's Delete asks the SHEET chip's three-way question
  // first when the list is on one sheet -- deleteFromList -- and otherwise
  // hands over to the whole-item question, unchanged)
  ok('from the list it asks and deletes the whole item; from the drawing, the shape',
    /if \(from === 'list'\) \{ void deleteFromList\(item\); return; \}\s*app\.project\.dropShapes\(\[item\._uid\]\)/.test(menu)
    && /if \(!ch\) \{ await deleteWholeItem\(item\); return; \}/.test(body('async function deleteFromList(')));
  ok('the drawing opens it as the drawing',
    src.includes("showItemMenu: (item, ev) => showItemMenu(item, ev, { from: 'canvas' })"));
  ok('the Items list opens it as the list',
    src.includes("showItemMenu: (item, ev) => showItemMenu(item, ev, { from: 'list' })"));
  const whole = body('async function deleteWholeItem(');
  ok('the whole-item Delete asks the desktop\'s question first, No the default',
    /deleteItemQuestion\(item\)/.test(whole)
    && /await D\.yesNoDialog\(q\.title, q\.text, \{ defaultButton: q\.defaultButton/.test(whole)
    && /if \(!yes\) return;/.test(whole)
    && whole.indexOf('yesNoDialog') < whole.indexOf('removeItems('));
  const ctl = await readFile(new URL('../js/tools/controller.js', import.meta.url), 'utf-8');
  ok('nothing in the controller deletes a whole item', !/removeItems\(/.test(ctl));
  ok('the Item box is drawn again when the tool says it emptied it (a job switch)',
    /controller\.addEventListener\('tool-name', \(\) => syncToolOptions\(controller\.mode\)\)/.test(src));
  const turn = body('async function goToPage(');
  ok('a page turn drops the selection of the sheet it leaves, before a jump selects again',
    /if \(movedSheet && controller\.selected\.size\) controller\.select\(\[\]\);/.test(turn)
    && turn.indexOf('controller.select([])') < turn.indexOf('await '), turn.slice(0, 200));
}
{
  // (i) the item menu answers a REAL press. Its own functions, lifted out of
  //     main.js by text, on a page of stand-in elements that does what a
  //     browser does with a press: pointerdown and mousedown on the button,
  //     then the release lands on whatever is under the pointer -- the
  //     button only if the menu is still there -- and the click goes to
  //     that. The menu used to close on the button's own mousedown, so the
  //     release fell through to the row underneath and NO row of it ran:
  //     not the list's Delete with its question, not the drawing's Delete,
  //     not Isolate. element.click() cannot see that; this can.
  const src = await readFile(new URL('../js/main.js', import.meta.url), 'utf-8');
  const fn = name => {
    const i = src.indexOf(`function ${name}(`);
    const j = src.indexOf('\n}\n', i);
    return i < 0 ? '' : src.slice(src.lastIndexOf('\n', i) + 1, j + 2);
  };
  const doc = stubDocument();
  const menuEl = doc.add('div', 'ctxMenu');
  menuEl.hidden = true;
  const calls = [];
  const item = { _uid: 'm-wall', type: 'area', name: 'Wall M', points: [[0, 0], [10, 10]] };
  const env = {
    controller: { readOnly: false, readOnlyReason: '', selected: new Set() },
    setStatus: t => calls.push(['status', t]),
    $: id => doc.byId(id),
    document: doc,
    window: { innerWidth: 1024, innerHeight: 768 },
    Node: StubEl,
    setTimeout,
    openProperties: () => calls.push(['properties']),
    openMaterials: () => calls.push(['materials']),
    app: { project: {
      setVisible: ids => calls.push(['hide', ids]),
      isolate: ids => calls.push(['isolate', ids]),
      dropShapes: ids => calls.push(['dropShapes', ids]),
      findItem: id => (id === item._uid ? { pageKey: 0, item } : null),
    } },
    // The list not on one sheet (the SHEET chip off): its Delete is the
    // whole item's question (deleteFromList, lifted with the menu, hands
    // over to deleteWholeItem); tests/revision-counting.mjs holds the chip's.
    itemsPanel: { refresh() {}, sheetOnly: () => false },
    sheetView: () => null,
    onSheetUp: () => true,
    countingModel: () => null,
    deleteName: m => String(m.name || m.label || 'this item').trim(),
    deleteHereChoice: () => { throw new Error('asked only while the list is on one sheet'); },
    deletedHereWords: () => '',
    D: {},
    openPropertiesFromList: () => calls.push(['properties']),
    boundingBox: () => ({ x: 0, y: 0, w: 10, h: 10 }),
    viewport: { fit: () => calls.push(['zoom']) },
    requestDraw() {},
    deleteWholeItem: m => calls.push(['deleteWholeItem', m._uid]),
    forgetDeletedSelection() {},
    // The menu itself is showMenu's (main.js, lifted with it), placed by
    // hold.js's menuPlace.
    menuPlace,
  };
  const names = Object.keys(env);
  const showItemMenu = new Function(...names,
    `${fn('closeMenu')}\n${fn('showMenu')}\n${fn('showItemMenu')}\n${fn('deleteFromList')}\nreturn showItemMenu;`)(
    ...names.map(k => env[k]));
  const press = async (label, from, how = 'mouse') => {
    calls.length = 0;
    showItemMenu(item, { clientX: 300, clientY: 200 }, { from });
    await nextTick();                                  // its dismiss is armed after a tick
    const b = menuEl.children.find(c => c.tagName === 'BUTTON' && c.textContent === label);
    if (!b) return ['no button', label];
    doc.realPress(b, how);
    return calls.slice();
  };
  eq('a real press on the list menu\'s Delete reaches it: the question, then the whole item',
    await press('Delete', 'list'), [['deleteWholeItem', 'm-wall']]);
  eq('...and on the drawing menu\'s Delete: the one shape',
    await press('Delete', 'canvas'), [['dropShapes', ['m-wall']]]);
  eq('...and Isolate, and with a finger as well as a mouse',
    await press('Isolate this item', 'canvas', 'touch').then(c => c.filter(x => x[0] === 'isolate')),
    [['isolate', ['m-wall']]]);
  ok('the button that ran closed the menu', menuEl.hidden);
  calls.length = 0;
  showItemMenu(item, { clientX: 300, clientY: 200 }, { from: 'list' });
  await nextTick();
  ok('it is open', !menuEl.hidden);
  doc.realPress(doc.body, 'mouse');
  eq('a press anywhere else still closes it, and runs nothing', [menuEl.hidden, calls], [true, []]);

  // (j) the whole-item Delete, after its question: delete only what may be,
  //     and is still there to delete -- the answer can come long after the
  //     question, and the job can have changed under it.
  const deleted = [];
  const wenv = {
    deleteItemQuestion,
    D: { yesNoDialog: async () => { wenv.during(); return true; } },
    controller: { readOnly: false, readOnlyReason: 'View Only', selected: new Set() },
    setStatus: () => {},
    app: { project: { findItem: id => (wenv.there ? { item: { _uid: id } } : null),
      removeItems: ids => deleted.push(ids) } },
    forgetDeletedSelection() {},
    requestDraw() {},
    there: true,
    during() {},
  };
  const wnames = ['deleteItemQuestion', 'D', 'controller', 'setStatus', 'app',
    'forgetDeletedSelection', 'requestDraw'];
  const deleteWholeItem = new Function(...wnames, `${fn('deleteWholeItem')}\nreturn deleteWholeItem;`)(
    ...wnames.map(k => wenv[k]));
  await deleteWholeItem(item);
  eq('Yes deletes the whole item', deleted, [['m-wall']]);
  deleted.length = 0;
  wenv.during = () => { wenv.controller.readOnly = true; };
  await deleteWholeItem(item);
  eq('...but not once the job went View Only while the question was up', deleted, []);
  wenv.controller.readOnly = false;
  wenv.during = () => { wenv.there = false; };
  await deleteWholeItem(item);
  eq('...and not an item no longer there (an Undo while it was up)', deleted, []);
}
{
  // (k) the question itself (dialogs.js yesNoDialog), on stand-in elements:
  //     Yes and No in that order, NO the default -- it is the button that
  //     has the focus, so Enter answers No -- and Escape or a press on the
  //     backdrop answer No. Only Yes deletes.
  const doc = stubDocument();
  doc.add('div', 'modal');
  const was = globalThis.document;
  globalThis.document = doc;
  try {
    const open = async () => {
      const answer = yesNoDialog('Delete Item', 'Delete “Wall M”?', { defaultButton: 'No', danger: true });
      await nextTick();
      const btns = doc.all(e => e.tagName === 'BUTTON');
      return { answer, btns, focused: doc.activeElement };
    };
    let d = await open();
    eq('Yes and No, in that order', d.btns.map(b => b.textContent), ['Yes', 'No']);
    eq('No has the focus, so Enter answers No', d.focused && d.focused.textContent, 'No');
    doc.realPress(d.btns[0], 'mouse');
    eq('Yes answers yes', await d.answer, true);
    d = await open();
    doc.realPress(d.btns[1], 'mouse');
    eq('No answers no', await d.answer, false);
    d = await open();
    doc.dispatch(doc, 'keydown', { key: 'Escape' });
    eq('Escape answers no', await d.answer, false);
    d = await open();
    doc.dispatch(doc.all(e => e.className === 'modal-layer')[0], 'mousedown');
    eq('a press on the backdrop answers no', await d.answer, false);
    eq('and nothing is left on screen', doc.all(e => e.className === 'modal-layer').length, 0);
  } finally {
    globalThis.document = was;
  }
}
{
  // (l) Delete on the drawing takes only what is on the drawing on screen.
  //     The page turn now drops the selection (as the desktop's set_page
  //     does), and the Delete key and Edit > Delete Selected refuse
  //     whatever is left over from another sheet anyway, and say so: a run
  //     on the sheet just left was deleted with nothing on screen moving.
  const p = wallJob();
  let page = 1;
  const said = [];
  const canvas = { addEventListener() {}, setPointerCapture() {}, style: {} };
  const c = new ToolController({ canvas, viewport: { zoom: 1, toPage: pt => pt }, project: p,
    currentPage: () => page, host: {} });
  c.addEventListener('status', ev => said.push(ev.detail.text));
  c.select([p.measurements[1][0]._uid]);
  page = 2;                                  // the sheet on screen is A2.0 now
  const before = storeJson(p);
  ok('the Delete key is handled', c.handleKey({ key: 'Delete' }));
  eq('a shape on another sheet is not deleted, and nothing is undone',
    [storeJson(p) === before, p._undo.length], [true, 0]);
  eq('it says what it left', said.pop(),
    'Left 1 selected shape as it was — it is not on the drawing on screen');
  eq('and nothing is selected any more', c.selected.size, 0);
  c.select([p.measurements[1][0]._uid, p.measurements[2][0]._uid]);
  eq('Edit > Delete Selected (deleteSelected): only the shape on this sheet goes',
    [typeof c.deleteSelected === 'function' ? c.deleteSelected() : 'no deleteSelected',
      p.measurements[2].length, p.measurements[1].length], [1, 0, 2]);
  const q = wallJob();
  const cq = new ToolController({ canvas, viewport: { zoom: 1, toPage: pt => pt }, project: q,
    currentPage: () => 2, host: {} });
  cq.select([q.measurements[1][0]._uid]);
  cq.handleKey({ key: 'ArrowRight', shiftKey: true });
  eq('and a nudge moves nothing that is not on screen', [q._undo.length,
    q.measurements[1][0].points[0]], [0, [1, 1]]);
}
{
  // (m) Undo and Redo end isolation, as the desktop's restore does. The
  //     drawing's Delete of an isolated main shape isolates its heir; Undo
  //     then brought the main shape back HIDDEN, its heir a run again and
  //     showing alone, "isolating" still true.
  const p = wallJob();
  const main = p.measurements[0][0]._uid;
  p.isolate([main]);
  p.dropShapes([main]);
  p.undo();
  const back = p.measurements[0][0];
  ok('after Undo the main shape is back, shown, and isolation has ended',
    back._uid === main && !back.group_child && p.isVisible(back) && !p.isolating);
  p.isolate([p.measurements[0][1]._uid]);
  p.redo();
  ok('Redo ends it too', !p.isolating);
}
{
  // (n) a long press is not a drag. A finger held on a corner trembles a
  //     few pixels under the slop before the menu opens; that tremble used to
  //     reshape the shape with no undo level, so Delete then Undo gave back
  //     the reshaped shape and the original was gone. Through the real
  //     pointer handlers, touch, Pan.
  const p = new Project();
  p.loadFrom({ metadata: { page_labels: ['S1'], pixels_per_foot: 37.5, dpi: 150 }, annotations: {},
    pageCount: 1, measurements: { 0: [{ type: 'area', name: 'Slab', label: 'Slab', value: 100,
      perimeter: 40, ppf: 37.5, points: [[0, 0], [375, 0], [375, 375], [0, 375]], visible: true }] } });
  const r = pointerRig(p);
  const was = storeJson(p);
  r.down(375, 375, 'touch');                 // on a corner
  r.move(379, 379, 'touch');                 // a 4 px tremble, under the 11 px slop
  await new Promise(res => setTimeout(res, 560));
  ok('the long press opened the item menu', !!r.menuFor);
  eq('...and took the tremble back first: the shape is exactly as it was', storeJson(p), was);
  r.up(379, 379, 'touch');
  eq('the lift changes nothing, and no undo level was made', [storeJson(p), p._undo.length], [was, 0]);
  p.dropShapes([r.menuFor._uid]);            // the menu's Delete
  p.undo();
  eq('Delete, then Undo: the shape as it was, not as the finger left it', storeJson(p), was);
}
{
  // (o) Delete pressed while a press on a shape is still held. The release
  //     used to put the press's picture of the job back -- "nothing moved;
  //     leave no trace" -- undoing the Delete in silence and leaving its
  //     undo level behind doing nothing. Mouse, Pan.
  const p = apartJob();
  const r = pointerRig(p);
  const slab = p.measurements[0][1];
  r.down(100, 100, 'mouse');                     // the slab's corner: selected and held
  ok('the press selected the slab', r.c.selected.has(slab._uid) && r.c.selected.size === 1);
  r.c.handleKey({ key: 'Delete' });
  r.up(100, 100, 'mouse');
  eq('the Delete stands after the release, in one undo level',
    [p.measurements[0].map(m => m.name), p._undo.length, p.undoLabel], [['Wall M'], 1, 'Delete']);
  p.undo();
  eq('Undo brings it back', p.measurements[0].map(m => m.name), ['Wall M', 'Slab']);
  p.redo();
  eq('Redo deletes it again', p.measurements[0].map(m => m.name), ['Wall M']);
}
{
  // ...and a plain click on a shape (press, release, nothing moved) leaves
  //     the job as it is -- the very objects: the release used to swap every
  //     item for a copy of itself, so anything holding one (the armed count)
  //     was left holding an item no longer in the job.
  const p = apartJob();
  const r = pointerRig(p);
  const held = p.measurements[0][1];
  r.down(100, 100, 'mouse');
  r.up(100, 100, 'mouse');
  r.down(100, 100, 'mouse');                 // selected now: the press arms a move
  r.up(100, 100, 'mouse');
  ok('the slab in the job is still the slab held', p.measurements[0][1] === held
    && p._undo.length === 0);
}
{
  // ...and when the press had MOVED the corner first: the move is its own
  //     undo level, ahead of the Delete's, so each Undo takes back one.
  const p = apartJob();
  const r = pointerRig(p);
  const was = storeJson(p);
  r.down(100, 100, 'mouse');
  r.move(104, 100, 'mouse');
  r.c.handleKey({ key: 'Delete' });
  r.move(108, 100, 'mouse');                     // the button is still down
  r.up(108, 100, 'mouse');
  eq('two levels: the reshape, then the Delete', p._undo.map(s => s.label), ['Reshape', 'Delete']);
  p.undo();
  eq('Undo brings the slab back as the drag left it', p.measurements[0][1].points[0], [104, 100]);
  p.undo();
  eq('and Undo again, as it was', storeJson(p), was);
}
{
  // ...a Ctrl+Z while the press is held ends the press: its release must not
  //     push a picture from before that Undo as a level of its own.
  const p = apartJob();
  p.updateItem(p.measurements[0][1]._uid, { notes: 'edited' }, { label: 'Edit' });
  const r = pointerRig(p);
  r.down(100, 100, 'mouse');
  r.move(104, 100, 'mouse');
  p.undo();                                  // Ctrl+Z
  r.move(109, 100, 'mouse');
  r.up(109, 100, 'mouse');
  eq('the Undo stands, and the drag stopped with it',
    [p._undo.length, p._redo.length, 'notes' in p.measurements[0][1], p.measurements[0][1].points[0]],
    [0, 1, false, [100, 100]]);
}
{
  // ...and a page turn with the button still down keeps what the drag had
  //     moved as an undo level (controller.cancel(), which goToPage calls),
  //     instead of an edit no Ctrl+Z can take back.
  const p = apartJob();
  const r = pointerRig(p);
  r.down(100, 100, 'mouse');
  r.move(104, 100, 'mouse');
  r.c.cancel();
  r.up(104, 100, 'mouse');
  eq('one Reshape level, and the release adds none', p._undo.map(s => s.label), ['Reshape']);
  p.undo();
  eq('Undo takes the move back', p.measurements[0][1].points[0], [100, 100]);
}

// ═══ 9. a job switch puts the count down ═════════════════════════════════
console.log('\n-- another job: the count is put down --');
function countRig(p) {
  const canvas = { addEventListener() {}, setPointerCapture() {}, style: {} };
  const rig = { asked: 0, answer: null, told: 0 };
  const c = new ToolController({ canvas, viewport: { zoom: 1, toPage: pt => pt }, project: p,
    currentPage: () => 0,
    host: { askCountItem: async () => { rig.asked += 1; return rig.answer; } } });
  c.addEventListener('tool-name', () => { rig.told += 1; });
  rig.c = c;
  return rig;
}
const tick = () => new Promise(r => setTimeout(r, 0));
const jobA = () => ({ metadata: { page_labels: ['E1'] }, annotations: {}, measurements: {}, pageCount: 1 });
const jobB = () => ({ metadata: { page_labels: ['B1'] }, annotations: {}, measurements: {}, pageCount: 1 });
const OUTLETS = { name: 'Outlets', label: 'Outlets', category: 'Electrical', floor_level: 'Level 1',
  sub_category: 'Rough-in', cost_type: 'labor', unit_cost: 2, color: [1, 0, 0, 1] };
{
  // armed from the form, never tapped, then another job opened in Count
  const p = new Project(); p.loadFrom(jobA());
  const r = countRig(p);
  r.answer = { spec: { ...OUTLETS } };
  await r.c.setMode('count');
  r.c._remember(OUTLETS);                // the last job's answers, remembered
  p.loadFrom(jobB());
  eq('the tool is still Count', r.c.mode, 'count');
  r.asked = 0; r.answer = null;          // he cancels the form when it asks
  r.c._addCountPoint([5, 5]); await tick();
  eq('the first tap in the next job asks what is being counted', r.asked, 1);
  eq('...and makes nothing of the last job\'s', (p.measurements[0] || []).length, 0);
  r.c._addOpeningPin('window', [9, 9]);
  const pin = p.measurements[0][0];
  eq('a window pin takes no floor, trade or labour of the last job\'s',
    [pin.floor_level, pin.sub_category, pin.cost_type], ['', '', 'material']);
}
{
  // tapped under a name typed in the box: the box shows that count's name,
  // so it is emptied too -- on a bare reset(), the way New, close and a PDF
  // import bring the next job in (newProject)
  const p = new Project(); p.loadFrom(jobA());
  const r = countRig(p);
  r.c.mode = 'count';
  r.c.options.pendingName = 'Outlets';
  r.c._addCountPoint([1, 1]);
  eq('the typed name made the count with no form', [r.asked, p.measurements[0][0].name], [0, 'Outlets']);
  p.reset();
  eq('the box, still showing that count\'s name, is emptied, and the app is told',
    [r.c.options.pendingName, r.told], ['', 1]);
  ok('nothing is armed', !r.c.countTarget && !r.c.countSpec && r.c.countNamed === '');
  p.loadFrom(jobB());
  r.answer = null;
  r.c._addCountPoint([2, 2]); await tick();
  eq('the first tap asks', r.asked, 1);
}
{
  // a different name typed since, never counted, is his: it stays and counts
  const p = new Project(); p.loadFrom(jobA());
  const r = countRig(p);
  r.answer = { spec: { ...OUTLETS } };
  await r.c.setMode('count');
  r.c._remember(OUTLETS);
  r.c._addCountPoint([1, 1]);
  r.c.options.pendingName = 'Switches';
  const told = r.told;                    // arming put its name in the box; not this
  p.loadFrom(jobB());
  eq('a typed name the tool did not count stays', [r.c.options.pendingName, r.told - told], ['Switches', 0]);
  r.asked = 0;
  r.c._addCountPoint([3, 3]); await tick();
  eq('and the first tap counts it, with no form and nothing of the last job\'s',
    [r.asked, p.measurements[0].map(m => [m.name, m.floor_level, m.sub_category, m.cost_type])],
    [0, [['Switches', '', '', 'material']]]);
}
{
  // the count was armed FROM THE FORM with Count pressed again while
  // counting: the box shows that count's name (picked up from another tool
  // it starts empty), so another job empties it
  const p = new Project(); p.loadFrom(jobA());
  const r = countRig(p);
  r.answer = { spec: { ...OUTLETS, name: 'Doors', label: 'Doors' } };
  await r.c.setMode('count');
  eq('Count picked up from Pan: the box starts empty', r.c.options.pendingName, '');
  r.answer = { spec: { ...OUTLETS } };
  await r.c.setMode('count');
  eq('armed from the form again, in Count: the box shows its name, counted under it',
    [r.c.mode, r.c.options.pendingName, r.c.countNamed], ['count', 'Outlets', 'Outlets']);
  const told = r.told;
  p.loadFrom(jobB());
  eq('another job empties the box that shows it', [r.c.options.pendingName, r.told - told], ['', 1]);
}
{
  // ...and the same when a tap with nothing to go on asked the form
  const p = new Project(); p.loadFrom(jobA());
  const r = countRig(p);
  r.c.mode = 'count';
  r.answer = { spec: { ...OUTLETS } };
  r.c._addCountPoint([1, 1]); await tick();
  eq('the tap asked, and counts under the answer\'s name',
    [r.asked, p.measurements[0].map(m => m.name), r.c.countNamed], [1, ['Outlets'], 'Outlets']);
  eq('...and the form put that name in the box', r.c.options.pendingName, 'Outlets');
  const told = r.told;
  p.loadFrom(jobB());
  eq('another job empties that box too', [r.c.options.pendingName, r.told - told], ['', 1]);
}
// A form left up while another job comes in -- a .takeoff dropped on the
// window, the portal handing one over; neither waits for a form. Answered
// then, it filed the LAST job's count (or outline) into the next job, on
// whatever sheet that one showed, at the point tapped on the other.
function heldFormRig(p) {
  const canvas = { addEventListener() {}, setPointerCapture() {}, style: {} };
  const rig = { asked: 0 };
  const ask = () => { rig.asked += 1; return new Promise(res => { rig.answer = res; }); };
  rig.c = new ToolController({ canvas, viewport: { zoom: 1, toPage: pt => pt }, project: p,
    currentPage: () => 0, host: { askCountItem: ask, askItem: ask } });
  return rig;
}
const scaled = j => ({ ...j, metadata: { ...j.metadata, pixels_per_foot: 50, dpi: 150 } });
{
  const p = new Project(); p.loadFrom(scaled(jobB()));
  const r = heldFormRig(p);
  r.c.mode = 'count';
  r.c._addCountPoint([123, 456]);           // nothing to go on: the form is up
  p.loadFrom(scaled(jobA()));               // ...and another job comes in under it
  r.answer({ spec: { ...OUTLETS } }); await tick();
  eq('a count form answered after another job came in files nothing in it, and arms nothing',
    [(p.measurements[0] || []).length, !!r.c.countTarget || !!r.c.countSpec, r.c.countNamed, p.dirty],
    [0, false, '', false]);
}
{
  const p = new Project(); p.loadFrom(scaled(jobB()));
  const r = heldFormRig(p);
  const picked = r.c.setMode('count');      // picking the tool asks first
  p.loadFrom(scaled(jobA()));
  r.answer({ spec: { ...OUTLETS } });
  eq('...picking Count, answered after the switch, arms nothing and leaves the tool as it was',
    [await picked, r.c.mode, !!r.c.countSpec], [false, 'pan', false]);
}
{
  const p = new Project(); p.loadFrom(scaled(jobB()));
  const r = heldFormRig(p);
  const done = r.c._finalizePolygon('area', [[0, 0], [100, 0], [100, 100]]);
  p.loadFrom(scaled(jobA()));
  r.answer({ name: 'Slab', floor_level: 'Level 1' });
  await done;
  eq('...and an area\'s form likewise: the outline traced on the last job is filed nowhere',
    [(p.measurements[0] || []).length, p._undo.length], [0, 0]);
}

// ═══ 10. the Count bar: Undo, Redo, and Return in the Item box ══════════
console.log('\n-- the Count bar --');
{
  const src = await readFile(new URL('../js/main.js', import.meta.url), 'utf-8');
  const fn = name => {
    const i = src.indexOf(`function ${name}(`);
    const j = src.indexOf('\n}\n', i);
    return i < 0 ? '' : src.slice(src.lastIndexOf('\n', i) + 1, j + 2);
  };
  ok('the Count bar\'s buttons follow the history, as the top bar\'s do',
    /app\.project\.addEventListener\('history-changed', \(\) => syncCountHistoryButtons\(\)\);/.test(src));
  // main.js's own listeners on the job that keep the bars' Undo and Redo
  // true, lifted by text and run below against the real Project: another
  // job empties the history and says nothing on 'history-changed'.
  const jobListeners = src.split('\n').filter(l => /^app\.project\.addEventListener\('(history-changed|reset)', \(\) => .*\);$/.test(l)
    && /sync(Count)?HistoryButtons/.test(l));
  ok('another job puts both bars\' Undo and Redo right (main.js listens for \'reset\')',
    jobListeners.some(l => l.includes("'reset'") && l.includes('syncHistoryButtons()')
      && l.includes('syncCountHistoryButtons()')), jobListeners.join('\n'));
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf-8');
  ok('the top bar\'s Undo and Redo are data-act buttons, the same dispatcher',
    /data-act="undo" id="undoBtn"/.test(html) && /data-act="redo" id="redoBtn"/.test(html));
  const doc = stubDocument();
  const bar = doc.add('div', 'toolOpts');
  bar.hidden = true;
  doc.add('div', 'menus');
  const canvasEl = doc.add('canvas', 'canvas');
  // What a browser does on a mouse press: the pressed button takes the
  // keyboard (Safari does not, for a finger -- the case that hid this).
  doc.addEventListener('mousedown', ev => { if (ev.target.tagName === 'BUTTON') ev.target.focus(); }, true);
  // The document's own keydown (main.js): its Escape closes the revisions
  // panel, clears an overlay, takes an older drawing to the newest.
  const docKeys = [];
  doc.addEventListener('keydown', ev => docKeys.push(ev.key));
  const was = globalThis.document;
  globalThis.document = doc;
  try {
    const p = new Project(); p.loadFrom(jobA());
    const r = countRig(p);
    const c = r.c;
    const ran = [];
    const topBar = [];
    const env = {
      $: id => doc.byId(id), controller: c, D: Dialogs, MARKUP_TOOLS, requestDraw() {},
      TILE_SIZE_OPTIONS: () => [], TILE_PATTERN_OPTIONS: () => [], placeToolOptions() {},
      app: { project: p }, document: doc,
      // what the top bar's Undo and Redo run (safeRun -> runAction)
      safeRun: act => { ran.push(act); if (act === 'undo') p.undo(); if (act === 'redo') p.redo(); },
      // the top bar's own (not lifted: it reads index.html's buttons)
      syncHistoryButtons: () => topBar.push([p.canUndo, p.canRedo]),
    };
    const names = Object.keys(env);
    const lifted = new Function(...names, `${fn('syncToolOptions')}\n${fn('syncCountHistoryButtons')}\n`
      + `${fn('wireMenus')}\n${jobListeners.join('\n')}\n`
      + 'return { syncToolOptions, syncCountHistoryButtons, wireMenus };')(
      ...names.map(k => env[k]));
    lifted.wireMenus();
    r.answer = { spec: { ...OUTLETS } };
    await c.setMode('count');
    lifted.syncToolOptions('count');
    const buttons = () => bar.descendants().filter(e => e.tagName === 'BUTTON');
    eq('the Count bar holds Undo and Redo', buttons().map(b => [b.textContent, b.dataset.act]),
      [['↶ Undo', 'undo'], ['↷ Redo', 'redo']]);
    ok('finger-sized: at least 40 px each way', buttons().length === 2 && buttons().every(b =>
      parseFloat(b.style.minHeight) >= 40 && parseFloat(b.style.minWidth) >= 40));
    eq('nothing to take back yet: both off', buttons().map(b => b.disabled), [true, true]);
    c._addCountPoint([10, 10]); c._addCountPoint([20, 10]); c._addCountPoint([30, 10]);
    eq('three taps: Undo on, Redo off', buttons().map(b => b.disabled), [false, true]);
    if (buttons().length === 2) doc.realPress(buttons()[0], 'touch');
    eq('a real press on the bar\'s Undo runs the top bar\'s Undo', ran, ['undo']);
    eq('...which takes the last mark back', p.measurements[0].map(m => m.points.length), [2]);
    eq('the bar is still up, Redo now on', [bar.hidden, buttons().map(b => b.disabled)], [false, [false, false]]);
    r.asked = 0;
    c._addCountPoint([40, 10]); await tick();
    eq('and the next tap counts, on the same item, with no form',
      [r.asked, p.measurements[0].map(m => m.points.length)], [0, [3]]);
    p.undo();
    if (buttons().length === 2) doc.realPress(buttons()[1], 'mouse');
    eq('Redo, pressed with a mouse', ran, ['undo', 'redo']);
    // Left on the button, the keyboard's Space or Return pressed it again
    // and took another step, with nothing on screen to say why.
    eq('...and the press hands the keyboard back to the drawing', doc.activeElement === canvasEl, true);
    if (buttons().length === 2) doc.realPress(buttons()[0], 'mouse');
    eq('Undo, pressed with a mouse: the keyboard is the drawing\'s again',
      [ran.slice(-1)[0], doc.activeElement === canvasEl], ['undo', true]);
    p.redo();
    const box = bar.descendants().find(e => e.tagName === 'INPUT');
    box.focus();
    box.value = 'Switches';
    for (const l of box._l) if (l.t === 'input') l.fn.call(box, { type: 'input', target: box });
    eq('typing in the box is the name', c.options.pendingName, 'Switches');
    for (const key of ['Enter', 'Escape']) {
      box.focus();
      const ev = doc.dispatch(box, 'keydown', { key });
      eq(`${key === 'Enter' ? 'Return' : 'Escape'}: the box lets go of the keyboard, keeping the name`,
        [doc.activeElement === box, !!ev.defaultPrevented, c.options.pendingName], [false, true, 'Switches']);
    }
    eq('...and neither key goes on to the document\'s own Escape and Return', docKeys, []);
    // Another job, Count still in hand (open_in_edit_mode, the portal's
    // hand-over): its history is empty, and so are both bars' buttons.
    c._addCountPoint([50, 10]);
    eq('set-up: something to undo', buttons().map(b => b.disabled), [false, true]);
    topBar.length = 0;
    p.loadFrom(jobB());
    eq('another job: the Count bar\'s Undo and Redo are off', [c.mode, buttons().map(b => b.disabled)],
      ['count', [true, true]]);
    eq('...and say there is nothing', buttons().map(b => b.title), ['Nothing to undo', 'Nothing to redo']);
    eq('...and the top bar\'s are put right too', topBar.slice(-1), [[false, false]]);
    lifted.syncToolOptions('area');
    eq('no Undo or Redo in another tool\'s bar', buttons().length, 0);
  } finally {
    globalThis.document = was;
  }

  // Where the bar is parked (placeToolOptions, lifted by text), on an iPad
  // in landscape: 1024 wide, the sheets panel to 194, the Items panel from
  // 724, the Count bar 336 wide hanging from the Count button at 434.
  const rect = o => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, ...o });
  const geo = { chromeOpen: false };
  const btn = { getBoundingClientRect: () => (geo.chromeOpen
    ? rect({ left: 434, top: 39, bottom: 79 }) : rect({ left: 434, top: -187, bottom: -147 })) };
  const els = {
    toolOpts: { hidden: false, offsetWidth: 336, style: {} },
    toolButtons: { querySelector: () => btn },
    viewToolButtons: { querySelector: () => null },
    markupButtons: { querySelector: () => null },
    stage: { getBoundingClientRect: () => rect({ left: 194, right: 720, top: 0 }) },
    chrome: { getBoundingClientRect: () => (geo.chromeOpen ? rect({ top: 0, bottom: 226 }) : rect({ top: -226, bottom: 0 })) },
    app: { getBoundingClientRect: () => rect({ width: 1024, height: 768, right: 1024, bottom: 768 }) },
  };
  const placeToolOptions = new Function('$', 'document', `${fn('placeToolOptions')}\nreturn placeToolOptions;`)(
    id => els[id], { getElementById: id => els[id] });
  const optsBar = els.toolOpts;
  placeToolOptions('count');
  eq('the Count bar ends over the sheet, not over the Items panel\'s head',
    parseFloat(optsBar.style.left) + optsBar.offsetWidth <= 720 - 6, true);
  eq('...and, the toolbars away, sits at the top of the sheet', parseFloat(optsBar.style.top), 6);
  geo.chromeOpen = true;
  placeToolOptions('count');
  ok('the toolbars pulled down over the sheet: the bar hangs below the whole stack, where it can be reached',
    parseFloat(optsBar.style.top) >= 226, `top ${optsBar.style.top}`);
  // ...asked again once the slide is over (syncChrome asks at its start)
  const m = /\$\('chrome'\)\.addEventListener\('transitionend', [\s\S]*?\n\}\);\n/.exec(src);
  ok('main.js parks the bar again when the toolbars have finished sliding', !!m);
  if (m) {
    const heard = {};
    const placed = [];
    const chromeEl = { addEventListener: (t, f) => { heard[t] = f; } };
    new Function('$', 'placeToolOptions', 'controller', m[0])(
      id => (id === 'chrome' ? chromeEl : null), mode => placed.push(mode), { mode: 'count' });
    heard.transitionend({ target: chromeEl, propertyName: 'transform' });
    heard.transitionend({ target: {}, propertyName: 'transform' });          // a button inside it
    heard.transitionend({ target: chromeEl, propertyName: 'box-shadow' });
    eq('...on the stack\'s own slide, and nothing else', placed, ['count']);
  }
}

// ═══ 11. a file's words are printed, never made markup ═════════════════════
// A measurement's cost_type is whatever its file says, and the Report Center
// puts the report into the page with innerHTML (the print window: with
// document.write). Inside the portal that page is on the portal's own site.
// The cost type once went raw into a class attribute: `x"><form …>` closed it
// and drew a form of its own over the page. A row's class is one of two
// words now, and every word of the file is escaped for an attribute too.
console.log('\n-- a file\'s words in the reports --');
{
  const FORM = 'x"><form action="https://attacker.test/" target="_top"><input name=p type=password placeholder="Portal password">';
  const IMG = "y'><img src=x onerror=alert(1)>";
  const p = new Project();
  p.loadFrom({
    metadata: { page_labels: ['S1'] }, annotations: {}, pageCount: 1,
    measurements: { 0: [
      area('Wall "A"', 100, { cost_type: FORM, unit_cost: 2, floor_level: 'L1"><b>', category: "Trade'<i>",
        associated_items: [{ name: 'Studs', cost_type: IMG, qty_per: 1, unit: 'each', unit_cost: 1 }] }),
      area('Labor wall', 50, { cost_type: 'labor', unit_cost: 3 }),
    ] },
  });
  const lbl = i => `S${i + 1}`;
  eq('the reports know two cost types, whatever a file says (as the CSV and the workbook read it)',
    collectItems(p, lbl, { costType: 'all' }).map(e => [e.name, e.costType, e.materials.map(m => m.costType)]),
    [['Wall "A"', 'material', ['material']], ['Labor wall', 'labor', []]]);
  eq('… so the cost filters find an odd one where the CSV puts it', [
    collectItems(p, lbl, { costType: 'material' }).map(e => e.name),
    collectItems(p, lbl, { costType: 'labor' }).map(e => e.name),
  ], [['Wall "A"'], ['Labor wall']]);
  const opts = { groupBy: 'ft', costs: true, notes: true, sheets: true, materials: true, subtotals: true };
  for (const key of ['estimate', 'mto', 'labor', 'rollup', 'matlist']) {
    const html = buildReportHtml(p, lbl, key, {}, opts);
    const classes = [...html.matchAll(/\sclass="([^"]*)"/g)].map(m => m[1]);
    const odd = classes.filter(c => !/^(?:rpt|sub|meta|n|band|sect|labor|material|floor|cat|sub1|sub2|grand|mat|note|dim|warn|\s)*$/.test(c));
    eq(`${key}: every class is one of the report's own words`, odd, []);
    ok(`${key}: nothing of the file became markup (no form, input, img, b or i of its own)`,
      !/<(?:form|input|img|b|i)\b/i.test(html.replace(/<i>(?:Subtotal|No matching)[^<]*/g, '')),
      html.slice(0, 600));
    ok(`${key}: no attribute is closed by the file's words`, !/"><(?:form|img|b)/.test(html) && !/'><img/.test(html));
  }
  const est = buildReportHtml(p, lbl, 'estimate', {}, opts);
  ok('the words are still there, as words', est.includes('Wall &quot;A&quot;') && est.includes('L1&quot;&gt;&lt;b&gt;'));
  eq('esc escapes for an attribute as much as for text', H.esc(`a&b<c>d"e'f`), 'a&amp;b&lt;c&gt;d&quot;e&#39;f');
  // groupedHtml on its own, handed raw items (another caller, later): the class is still one of two words.
  const raw = H.groupedHtml([{ costType: IMG, name: 'n', qty: 1, unit: 'each', materials: [] }], { costs: false });
  eq('groupedHtml draws an odd cost type as material, never as its own text',
    [...raw.matchAll(/<tr class="([^"]*)"/g)].map(m => m[1]), ['band material', '', 'sect material', 'grand']);
  eq('… and costClass / costTypeOf are the two words', [H.costClass('labor'), H.costClass(FORM), Reports.costTypeOf('labor'),
    Reports.costTypeOf(undefined), Reports.costTypeOf(IMG)], ['labor', 'material', 'labor', 'material', 'material']);
}

console.log(fails ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass — the web carries, stamps, books and prices revisions the desktop's way`);
process.exit(fails ? 1 : 0);
