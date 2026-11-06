// A 3.06 PICTURE OVERLAY through this app: kept by every save, and never
// copied by undo.
//
// The desktop (3.06+) keeps a picture laid over a sheet as two things: a CAD
// picture in that sheet's annotations, flagged `as_overlay`, and the sheet's
// record in metadata.page_overlays, which names the picture by id and holds
// its tint, fade and LOOK (mode, invert, cutoff). A sheet record and a
// revision record carry the look too, and a record with no `cutoff` is a
// 3.05 one. This app neither draws nor writes any of it -- so all it must do
// is give every byte of it back, and move a record with its sheet.
//
//   1. open -> save -> open, through the real writer and reader: every
//      record and both pictures come back exactly, and a plain picture never
//      gains the flag.
//   2. the edits that touch the file around it -- an item added, deleted,
//      undone and redone -- leave it exactly as it was.
//   3. a sheet inserted or deleted re-keys the records with their sheets the
//      desktop's way, and a save writes them so.
//   4. UNDO SHARES THE PICTURE. An overlay picture is kept at up to 6000 px:
//      tens of MB of base64 in one string. Undo snapshots used to be
//      structuredClones, which copy strings, so every edit copied every
//      picture again -- 10 levels of a 24 MB picture added 264 MB of heap,
//      and there are 60. Measured here with the collector run between
//      readings: 60 levels, and 60 undos and redos, must together cost less
//      than ONE copy of the picture.
//   5. ...and shares nothing else: a change to the live job after a snapshot
//      never shows in the snapshot, and no object or array is ever held by
//      both.
//
// Portable: synthetic data only, no library, no desktop.
// Run: node tests/picture-overlay-format.mjs
import v8 from 'node:v8';
import vm from 'node:vm';
import { Project, copySharingStrings } from '../js/core/project.js';
import { openProject, writeProject } from '../js/core/takeoff-file.js';

let fails = 0;
let checks = 0;
function eq(label, got, want) {
  checks += 1;
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) return true;
  fails += 1;
  const show = s => (s && s.length > 600 ? `${s.slice(0, 600)} … (${s.length})` : s);
  console.log(`FAIL ${label}\n  got  ${show(a)}\n  want ${show(b)}`);
  return false;
}
const ok = (label, cond, detail = '') => {
  checks += 1;
  if (cond) return true;
  fails += 1;
  console.log(`FAIL ${label}${detail ? `\n  ${detail}` : ''}`);
  return false;
};

// ── the job: four sheets, one revision, a picture overlay on A1.1 ─────────

// The picture as cad_add_entity + _place_image_overlay write it.
const PIC = {
  subtype: 'cad', etype: 'image', id: '9f3a01bc', pts: [[10, 20], [5410, 3620]],
  color: [1, 1, 1, 1], width: 1.0, layer: '0', group: null, visible: true,
  img_b64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  aspect: 1.5, as_overlay: true,
};
// The same picture before it became the overlay: no flag at all.
const PLAIN = (() => { const p = { ...PIC, id: '4c2d88e0' }; delete p.as_overlay; return p; })();
// The three record shapes, the 3.06 look on each, and one from 3.05.
const OVERLAYS = {
  1: { image_id: '9f3a01bc', color: [1, 0.3, 0.3], alpha: 0.8, matched: true,
    home: [[0, 0], [5400, 3600]], matched_size: [5400, 3600],
    mode: 'original', invert: true, cutoff: null },
  2: { offset: [3, -4], color: [0.2, 0.4, 1], alpha: 0.5, overlay_page: 0,
    mode: 'lines', invert: false, cutoff: 255 },
  3: { offset: [0, 0], color: [1, 0.3, 0.3], alpha: 0.5, rev_id: 'rev-a1', rev_page: 0,
    mode: 'lines', invert: false, cutoff: 200 },
  0: { offset: [1, 1], color: [0, 1, 0], alpha: 0.35, overlay_page: 3 },
};
const OVERLAYS_JSON = JSON.stringify(OVERLAYS);

const pageBytes = i => new Uint8Array([0x50, 0x41, 0x47, 0x45, i]);   // a sheet's bytes

function jobMetadata() {
  return {
    project_name: 'Overlay job', dpi: 150, pixels_per_foot: 37.5,
    page_labels: ['A1.0', 'A1.1', 'A2.0', 'A3.0'],
    page_overlays: structuredClone(OVERLAYS),
    image_drop_mode: 'overlay',
    revisions: [{ id: 'rev-a1', date: '10/01/2026', description: 'ASI 1', notes: '',
      source: 'asi-1.pdf', page_labels: ['A3.0'], match: { 3: 0 }, extra: {} }],
    annotations: { 1: [structuredClone(PIC), structuredClone(PLAIN)],
      2: [{ type: 'highlight', points: [[1, 1], [9, 9]], color: [1, 1, 0, 0.4], width: 12 }] },
    measurements: { 1: [{ type: 'area', name: 'Slab', label: 'Slab', value: 48,
      points: [[100, 100], [900, 100], [900, 900]], visible: true }] },
  };
}

/** The job as a .takeoff file, written by this app's own writer. */
async function fileOf(metadata, pageCount) {
  return writeProject({
    metadata,
    pageSources: Array.from({ length: pageCount }, (_, i) => ({ kind: 'raw', data: pageBytes(i) })),
    revisionSources: [[{ kind: 'raw', data: new Uint8Array([0x52, 0x45, 0x56]) }]],
  });
}

/** Open a file the way the app does: openProject, then Project.loadFrom. */
async function open(blob) {
  const o = await openProject(blob);
  const p = new Project();
  p.loadFrom({ metadata: o.metadata, annotations: o.annotations, measurements: o.measurements,
    pageCount: o.pageCount, revisionCounts: o.revisions.map(s => s.length) });
  return { p, opened: o };
}

/** Save with this app's writer and read the file back: what the desktop opens. */
async function saved(p) {
  const blob = await fileOf(p.buildSaveMetadata(), p.pageCount);
  const o = await openProject(blob);
  return { meta: o.metadata, annotations: o.annotations, pageCount: o.pageCount };
}

const pictures = a => Object.fromEntries(Object.entries(a)
  .map(([k, list]) => [k, list.filter(x => x.subtype === 'cad' && x.etype === 'image')]));

// ═══ 1. open -> save -> open ═══════════════════════════════════════════════
console.log('-- a web save gives the overlay back --');
{
  const { p } = await open(await fileOf(jobMetadata(), 4));
  const s = await saved(p);
  eq('page_overlays come back byte for byte: the picture record, the sheet and revision '
    + 'records with their look, and a 3.05 record with none', JSON.stringify(s.meta.page_overlays), OVERLAYS_JSON);
  eq('the overlay picture keeps every key it was written with, as_overlay included',
    JSON.stringify(s.annotations[1][0]), JSON.stringify(PIC));
  eq('the plain picture comes back plain: no as_overlay invented', JSON.stringify(s.annotations[1][1]),
    JSON.stringify(PLAIN));
  ok('no runtime key reaches a picture', !Object.keys(s.annotations[1][0]).some(k => k.startsWith('_')));
  eq('the other metadata it rides with is kept', s.meta.image_drop_mode, 'overlay');
  // ...and a second generation: what a web save wrote, saved again
  const { p: p2 } = await open(await fileOf(p.buildSaveMetadata(), p.pageCount));
  const s2 = await saved(p2);
  eq('saved twice, still byte for byte', [JSON.stringify(s2.meta.page_overlays),
    JSON.stringify(s2.annotations[1])], [OVERLAYS_JSON, JSON.stringify([PIC, PLAIN])]);
}

// ═══ 2. the edits around it ════════════════════════════════════════════════
console.log('\n-- edits, deletes, undo and redo leave it alone --');
{
  const { p } = await open(await fileOf(jobMetadata(), 4));
  const added = p.addItem(2, { type: 'area', name: 'Deck', value: 12, points: [[0, 0], [5, 0], [5, 5]] });
  p.updateItem(added._uid, { name: 'Deck 2' });
  p.dropShapes([added._uid]);
  p.removeItems([p.measurements[1][0]._uid]);
  p.undo(); p.undo(); p.redo();
  p.transact('probe', () => { p.metadata.page_overlays[1].alpha = 0.1; });
  p.undo();
  const s = await saved(p);
  eq('after an add, an edit, two deletes, undo and redo: page_overlays exactly as written',
    JSON.stringify(s.meta.page_overlays), OVERLAYS_JSON);
  eq('...and both pictures', JSON.stringify(pictures(s.annotations)[1]), JSON.stringify([PIC, PLAIN]));
}

// ═══ 3. a sheet inserted or deleted ════════════════════════════════════════
console.log('\n-- a record moves with its sheet --');
{
  const { p } = await open(await fileOf(jobMetadata(), 4));
  p.notePagesInserted(0, 1);                       // a sheet in front of everything
  const s = await saved(p);
  const po = s.meta.page_overlays;
  eq('the picture record moves 1 -> 2 untouched, and no overlay_page is invented on it',
    JSON.stringify(po[2]), JSON.stringify(OVERLAYS[1]));
  eq('the sheet record moves 2 -> 3, and the sheet it compares moves 0 -> 1',
    JSON.stringify(po[3]), JSON.stringify({ ...OVERLAYS[2], overlay_page: 1 }));
  eq('the revision record moves 3 -> 4 untouched', JSON.stringify(po[4]), JSON.stringify(OVERLAYS[3]));
  eq('the 3.05 record moves 0 -> 1 and compares 3 -> 4', JSON.stringify(po[1]),
    JSON.stringify({ ...OVERLAYS[0], overlay_page: 4 }));
  eq('the picture moved with its sheet, flag and all', JSON.stringify(pictures(s.annotations)[2]),
    JSON.stringify([PIC, PLAIN]));
}
{
  const { p } = await open(await fileOf(jobMetadata(), 4));
  p.notePageRemoved(0);                            // the sheet record 2 compares against
  const po = (await saved(p)).meta.page_overlays;
  eq('delete A1.0: the picture record 1 -> 0, untouched', JSON.stringify(po[0]), JSON.stringify(OVERLAYS[1]));
  eq('...the record comparing the deleted sheet is gone', po[1], undefined);
  eq('...the revision record 3 -> 2, untouched', JSON.stringify(po[2]), JSON.stringify(OVERLAYS[3]));
  eq('...and nothing else is left', Object.keys(po).sort(), ['0', '2']);
}
{
  const { p } = await open(await fileOf(jobMetadata(), 4));
  p.notePageRemoved(1);                            // the picture's own sheet
  const s = await saved(p);
  ok('delete A1.1: no record is left for a sheet that is gone, nor names the picture',
    !Object.values(s.meta.page_overlays).some(r => r.image_id === PIC.id), JSON.stringify(s.meta.page_overlays));
  ok('...and the picture went with its sheet', !JSON.stringify(s.annotations).includes(PIC.id));
}

// ═══ 4. undo shares the picture ════════════════════════════════════════════
console.log('\n-- undo keeps one copy of a big picture, not one per level --');
{
  // The collector, so a reading is what is HELD, not what is waiting to go.
  // run-all starts each harness without flags, so it is switched on here.
  v8.setFlagsFromString('--expose-gc');
  let gc = null;
  try { gc = vm.runInNewContext('gc'); } catch { gc = null; }
  if (typeof gc !== 'function') {
    ok('the collector can be run to measure the heap (node --expose-gc)', false);
    gc = () => {};
  }
  const MB = 1048576;
  const heap = () => { gc(); gc(); const m = process.memoryUsage(); return m.heapUsed + m.external; };
  // 24 MB of base64, built the way a decoder builds it: one flat string
  const big = Buffer.alloc(18 * MB, 0x5a).toString('base64');
  const md = jobMetadata();
  md.annotations[1][0].img_b64 = big;
  const p = new Project();
  p.loadFrom({ metadata: md, annotations: md.annotations, measurements: md.measurements,
    pageCount: 4, revisionCounts: [1] });
  delete md.annotations;
  const ONE = big.length;                            // one copy of the picture, in bytes
  const h0 = heap();
  let levels = 0;
  let over = 0;
  for (let i = 0; i < 60; i++) {
    p.transact(`edit ${i}`, () => { p.measurements[1][0].value = 48 + i; });
    levels += 1;
    over = heap() - h0;
    if (over > ONE) break;                           // a copy per level: stop before the heap does
  }
  console.log(`   60 undo levels of a ${(ONE / MB).toFixed(0)} MB picture: heap +${(over / MB).toFixed(2)} MB`);
  eq('sixty undo levels were taken', [levels, p._undo.length], [60, 60]);
  ok('...and all sixty together cost less than ONE copy of the picture', over < ONE,
    `+${(over / MB).toFixed(1)} MB after ${levels} levels`);
  ok('...under 1 MB a level', over / levels < MB);
  for (let i = 0; i < 60; i++) p.undo();
  for (let i = 0; i < 60; i++) p.redo();
  const after = heap() - h0;
  console.log(`   ...and 60 undos and 60 redos: heap +${(after / MB).toFixed(2)} MB`);
  ok('undoing and redoing all sixty still costs less than one copy', after < ONE,
    `+${(after / MB).toFixed(1)} MB`);
  eq('and the picture is the picture', p.annotations[1][0].img_b64 === big, true);
}

// ═══ 5. ...and shares nothing else ═════════════════════════════════════════
console.log('\n-- a snapshot and the live job share no object --');
/** Every object and array reachable from `v`. */
function objectsOf(v, out = new Set()) {
  if (v && typeof v === 'object' && !out.has(v)) {
    out.add(v);
    for (const k of Object.keys(v)) objectsOf(v[k], out);
  }
  return out;
}
function sharedObjects(a, b) {
  const inA = objectsOf(a);
  return [...objectsOf(b)].filter(o => inA.has(o)).length;
}
const liveOf = p => ({ m: p.measurements, a: p.annotations, d: p.metadata });
{
  const { p } = await open(await fileOf(jobMetadata(), 4));
  p.transact('first edit', () => { p.measurements[1][0].value = 49; });
  p.transact('edit', () => { p.measurements[1][0].value = 50; });
  const snap = p._undo[p._undo.length - 1].state;
  const frozen = JSON.stringify(snap);
  eq('a snapshot shares no object or array with the live job', sharedObjects(snap, liveOf(p)), 0);
  // every kind of thing the stores hold, changed in place
  p.measurements[1][0].points.push([5, 5]);
  p.measurements[1][0].points[0][0] = -1;
  p.measurements[1][0].name = 'Changed';
  p.annotations[1][0].pts[0][1] = 999;
  p.annotations[1][0].as_overlay = false;
  p.metadata.page_overlays[1].home[0][0] = 77;
  p.metadata.page_overlays[2].mode = 'original';
  p.metadata.page_labels.push('X9');
  p.metadata.revisions[0].match[3] = 9;
  eq('nothing changed in the live job after it shows in the snapshot', JSON.stringify(snap), frozen);
  p.undo();
  const redo = p._redo[p._redo.length - 1].state;
  eq('after an undo: the live job shares nothing with the redo level', sharedObjects(redo, liveOf(p)), 0);
  eq('...nor with the undo level still below it', p._undo.map(s => sharedObjects(s.state, liveOf(p))), [0]);
  eq('...and is exactly what the snapshot held', JSON.stringify(liveOf(p).a), JSON.stringify(snap.annotations));
  const redoFrozen = JSON.stringify(redo);
  p.measurements[1][0].points.length = 0;
  p.metadata.page_overlays[1].alpha = 0;
  eq('a change after the undo does not reach the redo level', JSON.stringify(redo), redoFrozen);
  p.redo();
  eq('Redo gives back exactly what was undone', [p.measurements[1][0].name, p.metadata.page_overlays[2].mode],
    ['Changed', 'original']);
}
{
  // restore() copies too: a snapshot a caller keeps -- a drag's "before",
  // put back when nothing moved -- stays as it was taken
  const { p } = await open(await fileOf(jobMetadata(), 4));
  const kept = p.snapshot();
  const frozen = JSON.stringify(kept);
  p.restore(kept);
  eq('restored, the job shares no object with the snapshot it came from', sharedObjects(kept, liveOf(p)), 0);
  p.annotations[1][0].pts.push([0, 0]);
  p.metadata.page_overlays[1].matched = false;
  p.measurements[1][0].points.pop();
  eq('...so an edit after it never reaches the snapshot', JSON.stringify(kept), frozen);
}
{
  // the copy itself, at its edges
  const m = new Map([['a', [1, 2]]]);
  const src = { s: 'text', n: 1.5, b: false, z: null, u: undefined, arr: [[1], { k: 'v' }], m };
  Object.defineProperty(src, '__proto__', { value: { kept: true }, enumerable: true, writable: true, configurable: true });
  const c = copySharingStrings(src);
  eq('plain values and nesting come through', [c.s, c.n, c.b, c.z, 'u' in c, c.arr], ['text', 1.5, false, null, true, [[1], { k: 'v' }]]);
  ok('a Map is copied, not shared', c.m instanceof Map && c.m !== m && c.m.get('a') !== m.get('a')
    && JSON.stringify([...c.m]) === JSON.stringify([...m]));
  ok('a key named "__proto__" stays a key', Object.prototype.hasOwnProperty.call(c, '__proto__')
    && Object.getPrototypeOf(c) === Object.prototype && c.__proto__.kept === true);
  let threw = false;
  try { copySharingStrings({ f() {} }); } catch { threw = true; }
  ok('a function in the store throws, as structuredClone always did', threw);
}

console.log(fails ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass — a web save keeps the picture overlay, and undo keeps one copy of it`);
process.exit(fails ? 1 : 0);
