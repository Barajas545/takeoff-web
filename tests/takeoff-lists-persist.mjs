// TAKEOFF LISTS (desktop 3.08): a web edit and save keeps every takeoff.
//
// The web is in Main, always, this round: it shows and totals Main's items
// only. But the file it saves is the desktop's job, Deck and all -- so every
// `takeoff_list` tag and the three metadata keys (takeoff_lists,
// takeoff_list_active, takeoff_main_label) must come back from a web save
// exactly as the desktop wrote them. The web writes the tag in exactly two
// places, both through setTakeoffList (js/core/takeoff-lists.js): a run
// promoted in place of its main shape takes the item's takeoff, and a new
// item is Main's (no tag).
//
// Every check here goes through the real producers: the desktop-made
// tests/data/two-takeoffs.takeoff (tests/make-two-takeoffs.py) opened with
// openProject -> Project.loadFrom, the edit made with the web's own Project
// / ToolController / classify functions, saved with buildSaveMetadata ->
// writeProject and opened again with openProject.
//
//   T6  21 edit paths: the three keys byte for byte, every other metadata
//       key kept, the saved tags == the store's, position for position;
//       every surviving item keeps its takeoff, a promoted run takes its
//       main shape's, a new item has none.
//   T7  new work is Main: a tool's _file, + Add item, a count by name and a
//       count made again (COUNT_TEMPLATE) carry no tag, in a job the
//       desktop left in Deck; addItem handed a tagged dict drops it.
//   T8  a job with only Main: a save gains none of the keys and no tag, and
//       its items equal v31's save of the same edits (v31's own modules,
//       read out of this repository's history at df6739d); a new job saves
//       none of them. ONE difference from v31 is expected, and checked as
//       the only one: a Group-filed multi-sheet item whose main shape goes
//       (its run added by Add Shape, so carrying no in_group) hands its
//       Group on to the promoted run -- in_group is in PROMOTE_KEYS since
//       3.08, as in the desktop's _PROMOTE_KEYS (spec 10, R3-12a). v31's
//       heir lost the Group.
//   T11 the source: nothing outside takeoff-lists.js assigns, deletes or
//       defaults the three keys; the one writer of the tag is
//       setTakeoffList, called by promoteChild and addItem alone;
//       takeoff_list_active is read by leftInTakeoffLabel alone;
//       activeTakeoffList is assigned in the ToolController's constructor
//       alone.
//
// Run: node tests/takeoff-lists-persist.mjs
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const V31 = 'df6739d';

let checks = 0;
let fails = 0;
const log = s => console.log(s);
function ok(label, cond, detail = '') {
  checks += 1;
  if (cond) return true;
  fails += 1;
  log(`FAIL ${label}${detail ? `\n  ${detail}` : ''}`);
  return false;
}
function eq(label, got, want) {
  checks += 1;
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) return true;
  fails += 1;
  log(`FAIL ${label}\n  got  ${a}\n  want ${b}`);
  return false;
}

/** The app's modules, from `root` (this tree, or v31's read out of git). */
async function modules(root) {
  const m = p => import(pathToFileURL(path.join(root, p)).href);
  const tf = await m('js/core/takeoff-file.js');
  const pj = await m('js/core/project.js');
  const ps = await m('js/core/page-store.js');
  const cl = await m('js/core/classify.js');
  const ct = await m('js/tools/controller.js');
  const th = await m('js/render/theme.js');
  return { ...tf, ...pj, ...ps, ...cl, ...ct, setPaletteIndex: th.setPaletteIndex };
}
const M = await modules(ROOT);
const TL = await import(pathToFileURL(path.join(ROOT, 'js/core/takeoff-lists.js')).href);

const KEYS = ['takeoff_lists', 'takeoff_list_active', 'takeoff_main_label'];
const TAG = 'takeoff_list';
const RUNTIME = ['_uid', 'ppf', 'ppf_recovered', 'scale_label', 'self_intersects'];
const BYTES = await readFile(path.join(here, 'data', 'two-takeoffs.takeoff'));
const FIRST = await M.openProject(new Blob([BYTES]));
const ORIG = JSON.parse(JSON.stringify(FIRST.metadata));
const DECK = (ORIG.takeoff_lists || [{}])[0].list_id;

log('-- the fixture, as the web reads it --');
ok('the fixture is a job of two takeoffs, Main renamed and left in the other',
  !!DECK && ORIG.takeoff_main_label === 'House' && ORIG.takeoff_list_active === DECK,
  JSON.stringify(KEYS.map(k => ORIG[k])));
const tagsIn = meas => Object.values(meas).flat().filter(m => m[TAG]).length;
ok('...with items of both on it', tagsIn(FIRST.measurements) >= 8
  && Object.values(FIRST.measurements).flat().length - tagsIn(FIRST.measurements) >= 8);

const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map(kk => [kk, x[kk]])) : x));
const clean = m => { const c = { ...m }; for (const k of RUNTIME) delete c[k]; return c; };

async function fresh(mods = M, bytes = BYTES) {
  const opened = await mods.openProject(new Blob([bytes]));
  const p = new mods.Project();
  p.loadFrom({ metadata: opened.metadata, annotations: opened.annotations,
    measurements: opened.measurements, pageCount: opened.pageCount,
    revisionCounts: opened.revisions.map(s => s.length) });
  const store = new mods.PageStore();
  store.setFromProject(opened);
  return { p, store };
}

async function saveBytes(p, store, mods = M) {
  const blob = await mods.writeProject({ metadata: p.buildSaveMetadata(),
    pageSources: store.saveSources(), revisionSources: store.saveRevisionSources() });
  return new Uint8Array(await blob.arrayBuffer());
}

/** page|name|tag of every item, in page-key and list order. */
function positional(meas) {
  const out = [];
  for (const k of Object.keys(meas).map(Number).sort((a, b) => a - b)) {
    for (const m of meas[k] || []) out.push(`${k}|${m.type}|${m.name ?? ''}|${m[TAG] ?? ''}`);
  }
  return out;
}

function picture(p) {
  const out = new Map();
  for (const [pg, m] of p.allItems()) {
    out.set(m._uid, { pg, name: m.name, gid: m.group_id || '', child: !!m.group_child,
      has: TAG in m, tag: m[TAG], of: TL.takeoffListOf(m) });
  }
  return out;
}

const find = (p, name, pg = null, child = false) => {
  for (const [k, m] of p.allItems()) {
    if (m.name === name && (pg == null || k === pg) && !!m.group_child === child) return m;
  }
  throw new Error(`no ${name}@${pg}${child ? ' (run)' : ''}`);
};

function controllerFor(p, page = 0) {
  const canvas = { addEventListener() {}, setPointerCapture() {}, releasePointerCapture() {},
    style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  const viewport = { zoom: 1, toPage: pt => pt, eventToPage: ev => [ev.clientX, ev.clientY],
    toScreen: (x, y) => [x, y], panBy() {} };
  const offered = [];
  const host = { askCountItem: async ({ existing }) => { offered.push(existing.map(m => m.name)); return null; },
    askItem: async () => null };
  const c = new M.ToolController({ canvas, viewport, project: p, currentPage: () => page, host });
  return { c, offered };
}

// ═══ T6: the 21 edit paths ═══════════════════════════════════════════════
log('\n-- T6: every web edit path keeps every takeoff, on the file --');
const DESK_POS = positional(FIRST.measurements);

async function path6(name, edit, { setup = null, byUid = true, sameAsDesktop = false, expect = null } = {}) {
  const { p, store } = await fresh();
  if (setup) setup(p);
  const before = picture(p);
  const env = { p, store };
  await edit(env);
  const after = picture(p);
  const bytes = await saveBytes(p, store);
  const re = await M.openProject(new Blob([bytes]));
  const keyDiff = KEYS.filter(k => JSON.stringify(re.metadata[k]) !== JSON.stringify(ORIG[k]));
  ok(`${name}: the three keys come back byte for byte`, !keyDiff.length,
    keyDiff.map(k => `${k}: ${JSON.stringify(re.metadata[k])}`).join('; '));
  const lost = Object.keys(ORIG).filter(k => !(k in re.metadata));
  ok(`${name}: every other metadata key the file had is still there`, !lost.length, lost.join(', '));
  const live = positional(Object.fromEntries(Object.keys(p.measurements).map(k => [k, p.measurements[k]])));
  eq(`${name}: the saved tags are the store's, position for position`, positional(re.measurements), live);
  if (sameAsDesktop) {
    eq(`${name}: ...and the desktop file's, position for position`, positional(re.measurements), DESK_POS);
  }
  if (byUid) {
    const bad = [];
    for (const [uid, b] of before) {
      const a = after.get(uid);
      if (!a) continue;
      if (b.child && !a.child) {
        // a run promoted in place of its main shape: the item's takeoff
        const doomed = [...before.values()].find(x => x.gid === b.gid && !x.child);
        const want = doomed ? doomed.of : b.of;
        if ((a.tag ?? '') !== want || (want === '' && a.has)) {
          bad.push(`heir ${b.name}@${b.pg}: ${JSON.stringify(a.tag)} (its main shape's: ${JSON.stringify(want)})`);
        }
      } else if (a.has !== b.has || a.tag !== b.tag) {
        bad.push(`${b.name}@${b.pg}: ${JSON.stringify(b.tag)} -> ${JSON.stringify(a.tag)}`);
      }
    }
    for (const [uid, a] of after) if (!before.has(uid) && a.has) bad.push(`new ${a.name}: ${JSON.stringify(a.tag)}`);
    ok(`${name}: every item keeps its takeoff, a promoted run takes its main shape's, a new one has none`,
      !bad.length, bad.join('\n  '));
  }
  if (expect) expect(p, re);
}

await path6('E00 open and save', () => {}, { sameAsDesktop: true });
await path6('E01 + Add item (addItem on no sheet)', ({ p }) => {
  p.addItem(M.STANDALONE_PAGE, { type: 'standalone', name: 'Glue', qty: 1, unit: 'ea', value: 1 }, { label: 'Add item' });
}, { expect: p => eq('E01: the new item is Main\'s', TAG in find(p, 'Glue'), false) });
await path6('E02 a tool finishing an area (ToolController._file)', ({ p }) => {
  controllerFor(p).c._file(0, { type: 'area', name: 'New', label: 'New', points: [[0, 0], [50, 0], [50, 50]], value: 12.5 });
}, { expect: p => eq('E02: the new area is Main\'s', TAG in find(p, 'New'), false) });
await path6('E03 Edit item (updateItem, Object.assign) on Main and Deck items', ({ p }) => {
  p.updateItem(find(p, 'Slab')._uid, { name: 'Slab 2', notes: 'x' });
  p.updateItem(find(p, 'Screws')._uid, { notes: 'deck' });
  const it = find(p, 'Joists');
  p.transact('Edit item', () => Object.assign(it, { unit_cost: 2 }));
});
await path6('E04 Hide (setVisible) a Main and a Deck item', ({ p }) => {
  p.setVisible([find(p, 'Slab')._uid, find(p, 'Ledger')._uid], false);
});
await path6('E05 removeItems: a Main multi-sheet item and the Deck Group container', ({ p }) => {
  p.removeItems([find(p, 'Wall M', 0)._uid]);
  p.removeItems([find(p, 'Stairs')._uid]);
}, { expect: p => eq('E05: the Group\'s member left the Group and stayed in Deck',
  [find(p, 'Ledger').in_group ?? null, find(p, 'Ledger')[TAG]], [null, DECK]) });
await path6('E06 dropShapes: a Main main shape (its run promoted)', ({ p }) => {
  p.dropShapes([find(p, 'Wall M', 0)._uid]);
}, { expect: p => eq('E06: Main\'s heir is Main\'s', TAG in find(p, 'Wall M', 1), false) });
await path6('E07 dropShapes: a Deck main shape (its run promoted)', ({ p }) => {
  p.dropShapes([find(p, 'Deck boards', 0)._uid]);
}, { expect: p => eq('E07: Deck\'s heir is Deck\'s', find(p, 'Deck boards', 1)[TAG], DECK) });
await path6('E08 Delete sheet X1.0 (notePageRemoved)', ({ p, store }) => { store.removePage(0); p.notePageRemoved(0); },
  { expect: p => eq('E08: the heir on what is now the first sheet is Deck\'s', find(p, 'Deck boards', 0)[TAG], DECK) });
await path6('E09 Add blank sheet (notePagesInserted)', ({ p, store }) => {
  store.addPage({ kind: 'png', data: new Uint8Array([1, 2, 3]), width: 1, height: 1 }, 1);
  p.notePagesInserted(1, 1);
});
await path6('E10 undo and redo after an add, an edit and a delete', ({ p }) => {
  p.addItem(0, { type: 'area', name: 'U', points: [[0, 0], [9, 0], [9, 9]], value: 1 });
  p.updateItem(find(p, 'Deck boards', 0)._uid, { notes: 'deck' });
  p.dropShapes([find(p, 'Deck boards', 0)._uid]);
  p.undo(); p.undo(); p.undo(); p.redo(); p.redo(); p.redo(); p.undo(); p.undo(); p.undo();
}, { sameAsDesktop: true });
await path6('E11 snapshot/restore (a drag, an erase, a long press put back)', ({ p }) => {
  const pre = p.snapshot();
  find(p, 'Slab').points = [[1, 1], [2, 2], [3, 1]];
  p.restore(pre);
  const pre2 = p.snapshot();
  find(p, 'Deck boards', 0).points = [[1, 1], [2, 2], [3, 1]];
  p.pushUndo('Reshape', pre2);
}, { sameAsDesktop: true });
await path6('E12 a heading Rename (floor Level 1 -> Level 1A)', ({ p }) => {
  M.renameClassification(p, 'floor_level', 'Level 1', 'Level 1A', {});
});
await path6('E13 Set for blank: every item in the job with no floor level', ({ p }) => {
  M.assignClassification(p, 'floor_level', 'Level 2', M.unfiledItems(p.measurements, 'floor_level'));
});
await path6('E14 scale, sheet labels and names, Project info', ({ p }) => {
  p.restampPage(0, 20);
  p.setPageScale(1, 15);
  p.setPageLabel(0, 'X9.0');
  p.setPageName(1, 'Plan');
  p.transact('Project info', () => Object.assign(p.metadata, { project_name: 'Renamed job' }));
});
await path6('E15 resyncGroups (a page op, a book change)', ({ p }) => {
  M.resyncGroups(p, { layout: true });
  M.resyncGroups(p);
}, { sameAsDesktop: true });
await path6('E16 a draft: buildSaveMetadata -> structuredClone -> loadFrom', ({ p }) => {
  const payload = structuredClone(p.buildSaveMetadata());
  p.loadFrom({ metadata: payload, annotations: payload.annotations, measurements: payload.measurements,
    pageCount: p.pageCount, revisionCounts: [] });
  p.markDirty();
}, { byUid: false, sameAsDesktop: true });
await path6('E17 a count tap with "Posts" in the Item box, on X1.0', ({ p }) => {
  const { c } = controllerFor(p, 0);
  c.options.pendingName = 'Posts';
  c._addCountPoint([700, 500]);
});
await path6('E18 Count pressed: the "Carry on with" list (asks, writes nothing)', async ({ p }) => {
  await controllerFor(p, 0).c._armCount();
}, { sameAsDesktop: true });
// a split item as 3.07 leaves one: a Deck main shape whose runs carry no tag
const splitDeck = p => { for (const [, m] of p.allItems()) if (m.name === 'Deck boards' && m.group_child) delete m[TAG]; };
await path6('E19 dropShapes of a SPLIT Deck item (its runs untagged)', ({ p }) => {
  p.dropShapes([find(p, 'Deck boards', 0)._uid]);
}, { setup: splitDeck,
  expect: p => eq('E19: the heir takes the item\'s takeoff, as the desktop\'s _promote_child does',
    find(p, 'Deck boards', 1)[TAG], DECK) });
await path6('E20 Delete sheet X1.0 holding a SPLIT Deck item\'s main shape', ({ p, store }) => {
  store.removePage(0); p.notePageRemoved(0);
}, { setup: splitDeck,
  expect: p => eq('E20: the heir (now on the first sheet) takes Deck', find(p, 'Deck boards', 0)[TAG], DECK) });
await path6('E21 addItem handed a dict copied from a Deck item', ({ p }) => {
  const { _uid, group_id, ...copy } = find(p, 'Deck boards', 0);
  p.addItem(0, { ...copy, name: 'Copy' });
}, { expect: p => eq('E21: the copy is filed in Main, where the web is', TAG in find(p, 'Copy'), false) });
// and a split the other way: a Main main shape with a run tagged Deck
await path6('E22 dropShapes of a Main main shape whose run carries a stray Deck tag', ({ p }) => {
  p.dropShapes([find(p, 'Wall M', 0)._uid]);
}, { setup: p => { find(p, 'Wall M', 1, true)[TAG] = DECK; },
  expect: p => eq('E22: the heir is Main\'s: the stray tag is popped', TAG in find(p, 'Wall M', 1), false) });

// A registry NOT in the normal form, on the same desktop-made bytes: every
// web reader normalises a COPY (takeoffLists), so the file's own record --
// a padded id, a repeated one, a blank one, a record that is no dict, a
// field from the future, a non-ASCII and an astral label, the dict form --
// comes back from an edit, an undo and a redo, a draft and a save exactly as
// it was (spec 9.2). A save that wrote the normalised copy back would heal
// the desktop's file behind its back.
log('\n-- T6: a registry the desktop would normalise comes back as the file had it --');
{
  const ODD = {
    'a list with odd records': [{ list_id: ` ${DECK} `, label: '  Deck ', color: [1, 2, 3], future: { a: 1 } },
      { list_id: DECK, label: 'Again' }, { list_id: '', label: 'Blank' }, 'junk', null, 5,
      { list_id: 'tl-pat00001', label: 'Pátio \u{1F3E0}' }, { label: 'No id' }],
    'the dict form': { [DECK]: 'Deck', 'tl-pat00001': { label: 'Patio', x: 1 }, 'tl-none': null },
  };
  for (const [what, reg] of Object.entries(ODD)) {
    const o = await M.openProject(new Blob([BYTES]));
    o.metadata.takeoff_lists = structuredClone(reg);
    o.metadata.takeoff_main_label = ' House ';
    o.metadata.takeoff_list_active = 'tl-pat00001 ';
    const sent = KEYS.map(k => JSON.stringify(o.metadata[k]));
    const p = new M.Project();
    p.loadFrom({ metadata: o.metadata, annotations: o.annotations, measurements: o.measurements,
      pageCount: o.pageCount, revisionCounts: o.revisions.map(s => s.length) });
    const store = new M.PageStore();
    store.setFromProject(o);
    ok(`odd registry, ${what}: the web reads it as the desktop would (a normalised copy), and Deck is another takeoff`,
      TL.takeoffLists(p.metadata).some(r => r.list_id === DECK) && TL.hasOtherTakeoffs(p.metadata, p.measurements));
    const { c } = controllerFor(p, 0);
    p.addItem(M.STANDALONE_PAGE, { type: 'standalone', name: 'Glue', qty: 1, unit: 'ea', value: 1 }, { label: 'Add item' });
    c._file(0, { type: 'area', name: 'New', label: 'New', points: [[0, 0], [50, 0], [50, 50]], value: 12.5 });
    M.renameClassification(p, 'floor_level', 'Level 1', 'Level 1A', { takeoff: TL.WEB_TAKEOFF });
    p.dropShapes([find(p, 'Deck boards', 0)._uid]);
    p.updateItem(find(p, 'Slab')._uid, { notes: 'x' });
    p.undo(); p.redo();
    eq(`odd registry, ${what}: after the edits, an undo and a redo the live metadata holds the file's record`,
      KEYS.map(k => JSON.stringify(p.metadata[k])), sent);
    const draft = structuredClone(p.buildSaveMetadata());
    eq(`odd registry, ${what}: ...a draft carries it as it was`, KEYS.map(k => JSON.stringify(draft[k])), sent);
    p.loadFrom({ metadata: draft, annotations: draft.annotations, measurements: draft.measurements,
      pageCount: p.pageCount, revisionCounts: o.revisions.map(s => s.length) });
    p.markDirty();
    const re = await M.openProject(new Blob([await saveBytes(p, store)]));
    eq(`odd registry, ${what}: ...and the file saved after it holds the three keys byte for byte`,
      KEYS.map(k => JSON.stringify(re.metadata[k])), sent);
  }
}

// ═══ T7: new work is Main ════════════════════════════════════════════════
log('\n-- T7: new work is Main, in a job the desktop left in Deck --');
{
  const { p } = await fresh();
  ok('the job was left in Deck (takeoff_list_active), and the web is in Main all the same',
    p.metadata.takeoff_list_active === DECK && TL.WEB_TAKEOFF === '');
  const { c } = controllerFor(p, 0);
  const area = c._file(0, { type: 'area', name: 'Patch', label: 'Patch', points: [[0, 0], [40, 0], [40, 40]], value: 16 });
  eq('a tool\'s _file: no tag', TAG in area, false);
  const solo = p.addItem(M.STANDALONE_PAGE, { type: 'standalone', name: 'Caulk', qty: 2, unit: 'ea', value: 2 },
    { label: 'Add item' });
  eq('+ Add item: no tag', TAG in solo, false);
  c.options.pendingName = 'Bolts';
  c._addCountPoint([700, 100]);
  const bolts = find(p, 'Bolts', 0);
  eq('a count by the name in the Item box: no tag', TAG in bolts, false);
  // a count made again: carried on with (no answers: its own fields,
  // COUNT_TEMPLATE), its making taken back, the next tap makes it again
  bolts[TAG] = DECK;                        // as if it were another takeoff's
  c.armCount(bolts, null);
  p.undo();
  ok('...its making taken back, the tool holds what it is made again from (COUNT_TEMPLATE)',
    !p.findItem(bolts._uid) && !!c.countSpec && !(TAG in c.countSpec), JSON.stringify(c.countSpec));
  c._addCountPoint([710, 100]);
  const again = [...p.allItems()].map(([, m]) => m).filter(m => m.name === 'Bolts');
  eq('a count made again: one new Bolts, no tag', again.map(m => [m._uid !== bolts._uid, TAG in m]), [[true, false]]);
  const handed = p.addItem(0, { type: 'area', name: 'Handed', points: [[0, 0], [5, 0], [5, 5]], value: 1, [TAG]: DECK });
  eq('addItem handed a Deck-tagged item drops the tag', TAG in handed, false);
  const padded = p.addItem(0, { type: 'count', name: 'Padded', points: [[1, 1]], value: 1, [TAG]: ` ${DECK} ` });
  eq('...a padded one too', TAG in padded, false);
  const note = p.addItem(0, { type: 'textnote', points: [[1, 1], [2, 2]], text: 'n', [TAG]: DECK });
  eq('...and a shared mark (a note) handed one: popped, as the desktop pops it', TAG in note, false);
  const bytes = await saveBytes(p, (await fresh()).store);
  const re = await M.openProject(new Blob([bytes]));
  const made = Object.values(re.measurements).flat().filter(m => ['Patch', 'Caulk', 'Bolts', 'Handed', 'Padded'].includes(m.name)
    || (m.type === 'textnote' && m.text === 'n'));
  eq('...and on the file: none of the new work carries a tag', made.map(m => [m.name ?? m.type, TAG in m]),
    made.map(m => [m.name ?? m.type, false]));
  eq('...while the job stays left in Deck, as the desktop left it', re.metadata.takeoff_list_active, DECK);
}

// ═══ T8: a job with only Main ════════════════════════════════════════════
log('\n-- T8: a job with only Main saves as v31 saved it --');
// The fixture with its takeoffs taken out -- a job as 3.07 and v31 write one.
const MAIN_ONLY = await (async () => {
  const { p, store } = await fresh();
  for (const k of KEYS) delete p.metadata[k];
  for (const [, m] of p.allItems()) delete m[TAG];
  return saveBytes(p, store);
})();
{
  const o = await M.openProject(new Blob([MAIN_ONLY]));
  ok('the Main-only job has none of the keys and no tag', KEYS.every(k => !(k in o.metadata))
    && tagsIn(o.measurements) === 0 && Object.values(o.measurements).flat().length > 15);
}

let v31 = null;
let v31Dir = null;
try {
  v31Dir = await mkdtemp(path.join(os.tmpdir(), 'ptt-v31-'));
  const files = execFileSync('git', ['-C', ROOT, 'ls-tree', '-r', '--name-only', V31, '--', 'js'],
    { encoding: 'utf-8', windowsHide: true }).split('\n').filter(Boolean);
  for (const f of files) {
    const buf = execFileSync('git', ['-C', ROOT, 'show', `${V31}:${f}`], { windowsHide: true, maxBuffer: 1 << 28 });
    await mkdir(path.dirname(path.join(v31Dir, f)), { recursive: true });
    await writeFile(path.join(v31Dir, f), buf);
  }
  v31 = await modules(v31Dir);
} catch (err) {
  ok(`v31's modules read out of this repository's history (${V31}) -- this check compares a Main-only save `
    + 'with v31\'s; it needs the commit (git fetch --unshallow)', false, String(err.message || err).split('\n')[0]);
}

const MAIN_EDITS = [
  ['open and save', () => {}],
  ['+ Add item', ({ p, m }) => p.addItem(m.STANDALONE_PAGE, { type: 'standalone', name: 'Glue', qty: 1, unit: 'ea', value: 1 },
    { label: 'Add item' })],
  ['a tool\'s _file', ({ p, c }) => c._file(0, { type: 'area', name: 'New', label: 'New', points: [[0, 0], [50, 0], [50, 50]], value: 12.5 })],
  ['a count by name', ({ c }) => { c.options.pendingName = 'Bolts'; c._addCountPoint([700, 100]); }],
  ['addItem handed an item copy', ({ p }) => {
    const { _uid, group_id, ...copy } = find(p, 'Deck boards', 0);
    p.addItem(0, { ...copy, name: 'Copy' });
  }],
  ['Edit item', ({ p }) => p.updateItem(find(p, 'Slab')._uid, { name: 'Slab 2' })],
  ['dropShapes of a main shape (its run promoted)', ({ p }) => p.dropShapes([find(p, 'Deck boards', 0)._uid])],
  ['removeItems of a Group container', ({ p }) => p.removeItems([find(p, 'Stairs')._uid])],
  ['Delete sheet X1.0', ({ p, store }) => { store.removePage(0); p.notePageRemoved(0); }],
  ['Add blank sheet', ({ p, store }) => {
    store.addPage({ kind: 'png', data: new Uint8Array([1, 2, 3]), width: 1, height: 1 }, 1);
    p.notePagesInserted(1, 1);
  }],
  ['undo and redo', ({ p }) => {
    p.addItem(0, { type: 'area', name: 'U', points: [[0, 0], [9, 0], [9, 9]], value: 1 });
    p.dropShapes([find(p, 'Wall M', 0)._uid]);
    p.undo(); p.redo(); p.undo();
  }],
  ['a heading Rename', ({ p, m }) => m.renameClassification(p, 'floor_level', 'Level 1', 'Level 1A', {})],
  ['resyncGroups', ({ p, m }) => { m.resyncGroups(p, { layout: true }); m.resyncGroups(p); }],
  ['a draft round trip', ({ p }) => {
    const payload = structuredClone(p.buildSaveMetadata());
    p.loadFrom({ metadata: payload, annotations: payload.annotations, measurements: payload.measurements,
      pageCount: p.pageCount, revisionCounts: [] });
    p.markDirty();
  }],
];

async function savedAfter(mods, edit) {
  const { p, store } = await fresh(mods, MAIN_ONLY);
  const canvas = { addEventListener() {}, setPointerCapture() {}, releasePointerCapture() {},
    style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  const viewport = { zoom: 1, toPage: pt => pt, eventToPage: ev => [ev.clientX, ev.clientY],
    toScreen: (x, y) => [x, y], panBy() {} };
  const c = new mods.ToolController({ canvas, viewport, project: p, currentPage: () => 0,
    host: { askCountItem: async () => null, askItem: async () => null } });
  // A new count's colour is the palette's next (module state): each side
  // starts from the same place.
  mods.setPaletteIndex(0);
  await edit({ p, store, c, m: mods });
  const re = await mods.openProject(new Blob([await saveBytes(p, store, mods)]));
  const meta = { ...re.metadata };
  delete meta.project_modified;           // the save's own clock
  return { meta, measurements: re.measurements };
}
// Each edit on a fresh open of the Main-only job, in this tree and in v31.
for (const [name, edit] of MAIN_EDITS) {
  const now = await savedAfter(M, edit);
  ok(`Main only · ${name}: none of the three keys is written`, KEYS.every(k => !(k in now.meta)),
    KEYS.filter(k => k in now.meta).join(', '));
  ok(`Main only · ${name}: no item carries a tag`, tagsIn(now.measurements) === 0);
  if (v31) {
    const was = await savedAfter(v31, edit);
    eq(`Main only · ${name}: the save is v31's save, metadata and items`, canon(now), canon(was));
  }
}
{
  // The one expected difference: Wall M filed in the Group Stairs on its
  // main shape (X1.0) only -- its X2.0 run added by Add Shape, which leaves
  // in_group off a run -- and the main shape deleted on the canvas.
  const stairs = Object.values((await M.openProject(new Blob([MAIN_ONLY]))).measurements).flat()
    .find(m => m.type === 'group' && m.name === 'Stairs');
  const GI = stairs && stairs.group_item_id;
  ok('Main only: the Group Stairs is there to file Wall M in', !!GI);
  const edit = ({ p }) => {
    find(p, 'Wall M', 0).in_group = GI;
    ok('Main only · the Group-filed item\'s run carries no in_group (as Add Shape leaves it)',
      !('in_group' in find(p, 'Wall M', 1, true)));
    p.dropShapes([find(p, 'Wall M', 0)._uid]);
  };
  const heir = s => (s.measurements[1] || []).find(m => m.name === 'Wall M' && !m.group_child);
  const now = await savedAfter(M, edit);
  ok('Main only · a Group-filed item\'s main shape dropped: none of the three keys, no tag',
    KEYS.every(k => !(k in now.meta)) && tagsIn(now.measurements) === 0);
  eq('Main only · ...the promoted run keeps the item\'s Group, as desktop 3.08\'s _promote_child does (in_group in '
    + 'PROMOTE_KEYS)', heir(now) && heir(now).in_group, GI);
  if (v31) {
    const was = await savedAfter(v31, edit);
    eq('Main only · ...where v31\'s heir lost it', heir(was) ? heir(was).in_group ?? null : 'no heir', null);
    if (heir(now)) delete heir(now).in_group;
    eq('Main only · ...and that one key is the only difference from v31\'s save, metadata and items', canon(now), canon(was));
  }
}
{
  // A new job: nothing opened, an item added, saved.
  const p = new M.Project();
  p.addItem(M.STANDALONE_PAGE, { type: 'standalone', name: 'Glue', qty: 1, unit: 'ea', value: 1 });
  const meta = p.buildSaveMetadata();
  ok('a new job (reset) saves none of the three keys, and no tag',
    KEYS.every(k => !(k in meta)) && tagsIn(meta.measurements) === 0, Object.keys(meta).join(', '));
  const bytes = new Uint8Array(await (await M.writeProject({ metadata: meta, pageSources: [], revisionSources: [] }))
    .arrayBuffer());
  const re = await M.openProject(new Blob([bytes]));
  ok('...and its file holds none of them either', KEYS.every(k => !(k in re.metadata)));
}
if (v31Dir) await rm(v31Dir, { recursive: true, force: true });

// ═══ T11: the source ═════════════════════════════════════════════════════
log('\n-- T11: who may write a takeoff --');
// The code of a file with its comments taken out, strings and template
// literals kept (a URL's // is not a comment).
function codeOf(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && d === '*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? src.length : j + 2; out += ' '; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}
async function jsFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await jsFiles(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
const SRC = {};
for (const f of await jsFiles(path.join(ROOT, 'js'))) {
  SRC[path.relative(ROOT, f).split(path.sep).join('/')] = codeOf(await readFile(f, 'utf-8'));
}
const HOME = 'js/core/takeoff-lists.js';
ok('the module is there to read', !!SRC[HOME]);
/** The named function or method a position of `code` is inside: the
 *  nearest line above it that opens one (a top-level `function name(`, or
 *  a class method `  name(...) {` -- never an if/for/while). */
const NOT_A_NAME = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'else', 'do', 'try', 'with']);
function enclosing(code, at) {
  const lines = code.slice(0, at).split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const top = lines[i].match(/^(?:export\s+)?(?:async\s+)?function\*?\s+(\w+)\s*\(/);
    if (top) return top[1];
    const meth = lines[i].match(/^ {2}(?:async\s+|static\s+|get\s+|set\s+)?\*?(\w+)\s*\(.*\)\s*\{\s*$/);
    if (meth && !NOT_A_NAME.has(meth[1])) return meth[1];
  }
  return '';
}
{
  const bad = [];
  for (const [f, code] of Object.entries(SRC)) {
    if (f === HOME) continue;
    for (const k of KEYS) if (new RegExp(`\\b${k}\\b`).test(code)) bad.push(`${f} names ${k}`);
  }
  ok('outside takeoff-lists.js no code names takeoff_lists, takeoff_list_active or takeoff_main_label '
    + '(so none assigns, deletes or defaults one)', !bad.length, bad.join('\n  '));
  const home = SRC[HOME] || '';
  // an assignment, a delete, or a key in an object literal (a default)
  const writes = KEYS.filter(k => new RegExp(`\\b${k}\\s*(=(?!=)|\\+=)|delete[^;\\n]*\\b${k}\\b`
    + `|[{,]\\s*['"]?${k}['"]?\\s*:|\\[\\s*['"]${k}['"]\\s*\\]\\s*=(?!=)`).test(home));
  ok('...and takeoff-lists.js only reads them', !writes.length, writes.join(', '));
  const actives = [...home.matchAll(/\btakeoff_list_active\b/g)].map(mm => enclosing(home, mm.index));
  eq('takeoff_list_active is read by leftInTakeoffLabel alone', [...new Set(actives)], ['leftInTakeoffLabel']);
}
{
  const bad = [];
  for (const [f, code] of Object.entries(SRC)) {
    if (f === HOME) continue;
    if (/\btakeoff_list\b/.test(code)) bad.push(`${f} names the tag 'takeoff_list'`);
    if (/TAKEOFF_LIST_KEY\s*\]\s*(=(?!=)|\+=)|delete[^;\n]*TAKEOFF_LIST_KEY/.test(code)) bad.push(`${f} writes TAKEOFF_LIST_KEY`);
  }
  ok('outside takeoff-lists.js no code names the tag or writes TAKEOFF_LIST_KEY', !bad.length, bad.join('\n  '));
  const home = SRC[HOME] || '';
  const WRITE = /\[\s*TAKEOFF_LIST_KEY\s*\]\s*(=(?!=)|\+=)|delete[^;\n]*TAKEOFF_LIST_KEY|\btakeoff_list\b\s*['"]?\s*[:=](?!=)/g;
  const where = [...home.matchAll(WRITE)].map(mm => enclosing(home, mm.index));
  eq('...and inside it the tag is written (set and popped) by setTakeoffList alone', where, ['setTakeoffList', 'setTakeoffList']);
  const calls = [];
  for (const [f, code] of Object.entries(SRC)) {
    for (const mm of code.matchAll(/\bsetTakeoffList\s*\(/g)) {
      if (/function\s*$/.test(code.slice(0, mm.index))) continue;     // its own definition
      calls.push(`${f}:${enclosing(code, mm.index)}`);
    }
  }
  eq('setTakeoffList is called by promoteChild and addItem alone (the promote heir; new work in Main)',
    calls.sort(), ['js/core/project.js:addItem', 'js/core/project.js:promoteChild']);
}
{
  const assigns = [];
  for (const [f, code] of Object.entries(SRC)) {
    for (const mm of code.matchAll(/\bactiveTakeoffList\s*(=(?!=)|\+=)/g)) assigns.push(`${f}:${enclosing(code, mm.index)}`);
  }
  ok('activeTakeoffList is assigned nowhere but the ToolController\'s constructor (once, if at all)',
    assigns.length <= 1 && assigns.every(a => a === 'js/tools/controller.js:constructor'), assigns.join(', '));
}
{
  const proj = SRC['js/core/project.js'] || '';
  const rt = (proj.match(/const RUNTIME_KEYS = \[[^\]]*\]/) || [''])[0];
  ok('RUNTIME_KEYS never strips the tag (nor anything named like it)', !!rt && !/takeoff/.test(rt), rt);
  const at = proj.indexOf('  reset() {');
  const reset = at < 0 ? '' : proj.slice(at, proj.indexOf('\n  }\n', at));
  ok('reset() defaults none of the takeoff keys', !!reset && !/takeoff/.test(reset));
}

console.log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass -- every web edit and save keeps every takeoff, and new work is Main's`);
process.exit(fails ? 1 : 0);
