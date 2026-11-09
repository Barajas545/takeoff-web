// THE ROUND TRIP, through both real programs.
//
//   1. The DESKTOP (pdf_fast_viewer.py, offscreen) builds a 3.05 job the way
//      he builds one: an original set; ASI 1 reissues sheets and ADDS A2.5 in
//      the middle; a second revision reissues two more and adds A7.0 and
//      A8.0; takeoff on revisions through the real canvas (the first takeoff
//      books its drawing, Yes to counting a reissue); callout pins and a
//      note stamped with a revision; a wall that spans three sheets; a
//      vertical line drawn with the Pitch tool, whose rise the save writes
//      as the bare word Infinity (Python's json.dumps). Saved. (This app
//      later renames that line, as the Properties dialog's OK does, and
//      nudges it with the arrow keys: both recompute it, and it must still
//      reach the desktop as its own Infinity, 'vertical' -- not '0:12'.)
//   2. THIS APP opens that file and must price it exactly as the desktop
//      does — every counted item and quantity, the Report's rows, which
//      drawing each sheet counts from, the sheets a revision added, where
//      every pin points, what every tile says, and the picture it laid over
//      A6.0 as the overlay to compare (3.06): the sheet's record, its look,
//      the flagged picture.
//   3. It then EDITS: the first takeoff on A5.0's newest drawing (booking
//      it), a count on the ADDED sheet A7.0 (its own drawing must be
//      takeable), and DELETES A1.0 — the first sheet, holding the wall's
//      master — so every index after it moves. Saved. Then it deletes that
//      wall from the Items list and saves again: the desktop must reopen it
//      with no shape of the wall left to heal back into the bid.
//   4. The DESKTOP reopens what this app saved, asks nothing, and reads back
//      every total, every sheet_origin, every pin and the overlay exactly as
//      this app left them (the overlay put up again in its look) — and its
//      Delete Revision removes the untouched sheet that
//      revision added, and no original sheet.
//   6. THIS APP renames a floor, the framing engine's trade, the pins' trade
//      and a pin kind's sub-category (Round 7) on the desktop test's own
//      fixture; the DESKTOP reads the same names, files its new pins where
//      the web recorded (metadata pin_filing), and its framing engine's
//      merge rule leaves the renamed lines where the web filed them.
//
// Needs the desktop source and its Python (PyQt5, PIL); SKIPS otherwise.
// Nothing it writes is kept: a temp folder, removed at the end.
//
// Run: node tests/desktop-round-trip.mjs
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openProject, writeProject } from '../js/core/takeoff-file.js';
import { recompute } from '../js/core/measure.js';
import { stringifyPyJson } from '../js/core/py-json.js';
import { Project } from '../js/core/project.js';
import { PageStore } from '../js/core/page-store.js';
import { ToolController } from '../js/tools/controller.js';
import { CountingModel } from '../js/core/counting.js';
import { newestVersionOf } from '../js/core/revisions.js';
import { collectItems } from '../js/ui/reports.js';
import { renameClassification, projectValues, pinFiling, PIN_KINDS, CLASS_FIELDS } from '../js/core/classify.js';
import { DESKTOP_SRC, haveDesktopSource, skip } from './config.mjs';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const driver = path.join(here, 'desktop-round-trip.py');

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

if (!(await haveDesktopSource())) skip('the desktop source (PTT_DESKTOP_SRC)');

async function desktop(...args) {
  let stdout = '';
  try {
    ({ stdout } = await run('python', [driver, ...args], {
      maxBuffer: 1 << 26, windowsHide: true, timeout: 300000,
      env: { ...process.env, PTT_DESKTOP_SRC: DESKTOP_SRC, QT_QPA_PLATFORM: 'offscreen' },
    }));
  } catch (err) {
    const msg = `${err.stdout || ''}${err.stderr || ''}`;
    if (/No module named '(PyQt5|PIL|fitz|OpenGL)/.test(msg)) {
      skip(`the desktop app's Python packages (${msg.match(/No module named '([^']+)'/)[1]})`);
    }
    throw new Error(`desktop ${args[0]} failed:\n${msg.slice(-3000)}`);
  }
  const line = stdout.split('\n').reverse().find(l => l.startsWith('JSON: '));
  if (!line) throw new Error(`desktop ${args[0]} printed no result:\n${stdout.slice(-3000)}`);
  return JSON.parse(line.slice(6));
}

/** The same summary the desktop driver prints, read by THIS app. */
function webSummary(project) {
  const n = project.pageCount;
  const md = project.metadata;
  const model = new CountingModel({ metadata: md, measurements: project.measurements, pageCount: n });
  const labs = Array.from({ length: n }, (_, i) => model.pageLabel(i));
  const lab = p => (p >= 0 && p < n ? labs[p] : (p === -1000 ? 'standalone' : `page ${p}`));
  const r4 = q => Math.round(q * 10000) / 10000;
  const counted = [];
  for (const [m, [, [q, u], pg]] of model.countedQuantities()) {
    counted.push([lab(pg), m.name || m.label || '', r4(q), u, model.revName(m.rev_id)]);
  }
  counted.sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  const sums = {};
  for (const [, , q, u] of counted) sums[u] = r4((sums[u] || 0) + q);
  const estimate = collectItems(project, i => model.pageLabel(i))
    .map(e => [e.name || '', r4(e.qty)]).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  const origin = {};
  for (const [k, v] of Object.entries(md.sheet_origin || {})) {
    origin[lab(Number(k))] = [model.revName(v[0]), Number(v[1]), v.length > 2 ? v[2] : null];
  }
  const book = {};
  for (const [k, v] of Object.entries(md.sheet_version || {})) book[lab(Number(k))] = model.revName(v);
  const marks = [];
  for (const [k, lst] of Object.entries(project.measurements)) {
    for (const m of lst || []) {
      if (m.type === 'page_ref') {
        const rp = Number.isInteger(m.ref_page) ? m.ref_page : -1;
        marks.push(['pin', lab(Number(k)), model.revName(m.rev_id), rp >= 0 ? lab(rp) : null]);
      } else if (m.type === 'textnote') {
        marks.push(['note', lab(Number(k)), model.revName(m.rev_id), m.text]);
      }
    }
  }
  marks.sort((a, b) => (a.map(String).join('\u0000') < b.map(String).join('\u0000') ? -1 : 1));
  const tiles = {};
  for (const [p, s] of Object.entries(model.sheetTileStates())) tiles[lab(Number(p))] = s.text;
  const newest = {};
  for (let i = 0; i < n; i++) newest[labs[i]] = model.revName(newestVersionOf(i, md.revisions, 'date', md.sheet_origin));
  const groups = [];
  for (const [k, lst] of Object.entries(project.measurements)) {
    for (const m of lst || []) {
      if (m.group_id && !m.group_child) groups.push([lab(Number(k)), m.name, r4(Number(m.value) || 0)]);
    }
  }
  groups.sort();
  // Every pitch line: its value as Python's json.dumps writes it, its label, angle.
  const pitch = [];
  for (const lst of Object.values(project.measurements)) {
    for (const m of lst || []) {
      if (m.type === 'pitch') pitch.push([stringifyPyJson(m.value), m.label, r4(Number(m.angle_deg) || 0)]);
    }
  }
  pitch.sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  // Each sheet's saved overlay record, by label, as the desktop driver
  // reports it (overlays()): what it compares, its tint, fade and look, and
  // for a picture whether the picture on that sheet still carries its flag.
  const overlays = {};
  for (const [k, st] of Object.entries(md.page_overlays || {})) {
    const p = Number(k);
    const rec = { color: (st.color || []).map(c => r4(Number(c))), alpha: st.alpha ?? null,
      mode: st.mode ?? null, invert: st.invert ?? null, cutoff: st.cutoff ?? null };
    if (st.image_id) {
      const pics = (project.annotations[p] || []).filter(a => a.subtype === 'cad'
        && a.etype === 'image' && String(a.id) === String(st.image_id));
      Object.assign(rec, { kind: 'picture', matched: !!st.matched,
        flagged: pics.map(a => !!a.as_overlay) });
    } else if (st.rev_id != null) {
      Object.assign(rec, { kind: 'revision', of: model.revName(st.rev_id) });
    } else {
      const op = st.overlay_page;
      Object.assign(rec, { kind: 'sheet', of: Number.isInteger(op) && op >= 0 && op < n ? labs[op] : null });
    }
    overlays[lab(p)] = rec;
  }
  const byLabel = Object.fromEntries(Object.entries(overlays)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return { labels: labs, origin, book, counted, sums, estimate, marks, tiles, newest, groups,
    overlays: byLabel, revisions: model.revs.map(r => model.revName(r.id)), pitch };
}

const SAME = ['labels', 'origin', 'book', 'counted', 'sums', 'estimate', 'marks', 'tiles',
  'newest', 'groups', 'overlays', 'revisions', 'pitch'];
// The overlay the desktop lays over A6.0 in `make`, as it must come back.
const A6_OVERLAY = { color: [1, 0.3, 0.3], alpha: 0.5, mode: 'original', invert: true, cutoff: 180,
  kind: 'picture', matched: false, flagged: [true] };

const dir = await mkdtemp(path.join(tmpdir(), 'ptt-roundtrip-'));
try {
  // ── 1. the desktop builds the job ──
  const made = path.join(dir, 'desktop.takeoff');
  console.log('-- 1. the desktop builds a 3.05 job --');
  const d1 = await desktop('make', made);
  ok('the desktop added A2.5, A7.0 and A8.0 as sheets', Object.keys(d1.origin).sort().join() === 'A2.5,A7.0,A8.0',
    JSON.stringify(d1.origin));
  ok('and its takeoff is on revisions', d1.counted.some(r => r[4]) && Object.keys(d1.book).length >= 2,
    JSON.stringify(d1.book));
  eq('and it laid a picture over A6.0 as the overlay, flagged, in a look of its own',
    d1.overlays, { 'A6.0': A6_OVERLAY });
  eq('and its Pitch tool drew a vertical line, saved as the bare word Infinity',
    d1.pitch, [['Infinity', 'vertical', 90]]);
  eq('...which the desktop says is \'vertical\', with no number on its hover', d1.pitchSays, [['vertical', '']]);

  // ── 2. this app opens it and prices it the same ──
  console.log('\n-- 2. this app opens it: the same job, the same price --');
  const f = await openProject(new Blob([await readFile(made)]));
  const project = new Project();
  project.loadFrom({ metadata: f.metadata, annotations: f.annotations,
    measurements: f.measurements, pageCount: f.pageCount,
    revisionCounts: f.revisions.map(s => s.length) });
  const store = new PageStore();
  store.setFromProject(f);
  const w1 = webSummary(project);
  for (const k of SAME) eq(`opened: ${k}`, w1[k], d1[k]);

  // ── 3. this app edits, deletes a sheet, and saves ──
  console.log('\n-- 3. this app takes off, deletes the first sheet, saves --');
  let page = 0;
  const canvas = { addEventListener() {}, setPointerCapture() {}, style: {} };
  const c = new ToolController({ canvas, viewport: { zoom: 1 }, project,
    currentPage: () => page, host: {} });
  const filed = [];
  c.addEventListener('takeoff-filed', ev => filed.push(ev.detail));
  const lab0 = i => project.pageLabel(i);
  const idx = l => Array.from({ length: project.pageCount }, (_, i) => lab0(i)).indexOf(l);

  // A5.0: nothing taken off it; its newest drawing is REV 2. The app lands
  // there (newestOf) and the first takeoff books it.
  page = idx('A5.0');
  const r2 = project.metadata.revisions.find(r => newestVersionOf(page, project.metadata.revisions,
    'date', project.metadata.sheet_origin) === String(r.id));
  ok('A5.0 opens on REV 2', !!r2);
  c.setVersionView(String(r2.id), r2.match[String(page)]);
  c._commit({ type: 'area', name: 'Wall A5', label: 'Wall A5', value: 12.25,
    points: [[10, 10], [185, 10], [185, 185], [10, 185]], visible: true, ppf: 50 }, 'Area');
  // Worded on the job as the filing left it, as the app says it.
  const bk = filed.at(-1).booking;
  const bkSaid = bk && bk.says ? new CountingModel({ metadata: project.metadata,
    measurements: project.measurements, pageCount: project.pageCount })
    .firstTakeoffSaid(page, bk.rid, bk.before) : '';
  ok('the first takeoff on A5.0 booked REV 2, and said so by quantity',
    /A5\.0 now counts from REV 2 — the drawing you are taking off; in your totals: 12\.2 sq ft of Wall A5 comes in\./.test(bkSaid),
    bkSaid || JSON.stringify(bk));

  // A7.0: a sheet REV 2 ADDED. Its own drawing is its newest — takeable.
  page = idx('A7.0');
  eq('the ADDED sheet\'s own drawing is its newest (not locked read-only)',
    newestVersionOf(page, project.metadata.revisions, 'date', project.metadata.sheet_origin), '');
  c.setVersionView('', null);
  c.countSpec = { name: 'Posts', color: [1, 0, 0, 1] };
  c._addCountPoint([100, 100]);
  c._addCountPoint([200, 100]);
  eq('two posts on A7.0\'s own drawing, unstamped',
    project.measurements[page].filter(m => m.type === 'count').map(m => [m.points.length, m.rev_id ?? '']),
    [[2, '']]);

  // Delete A1.0 — the first sheet, holding the wall's master shape.
  const del = idx('A1.0');
  store.removePage(del);
  project.notePageRemoved(del);
  // The desktop's vertical pitch line, renamed as the Properties dialog's
  // OK does it (main.js: Object.assign, then recompute) and nudged by the
  // arrow keys through the real controller: both recompute it.
  const pitchRow = [...project.allItems()].find(([, m]) => m.type === 'pitch');
  ok('the desktop\'s vertical pitch line is here, holding its Infinity', !!pitchRow && pitchRow[1].value === Infinity);
  if (pitchRow) {
    const [pk, line] = pitchRow;
    project.transact('Edit item', () => { Object.assign(line, { name: 'Gable end' }); recompute(line); });
    // on the drawing it was drawn on (a revision's): the arrows move what is on screen
    page = pk;
    c.setVersionView(String(line.rev_id || ''), line.rev_page ?? null);
    c.select([line._uid]);
    const x0 = line.points[0][0];
    const took = c.handleKey({ key: 'ArrowRight', shiftKey: true, ctrlKey: false, metaKey: false, altKey: false,
      preventDefault() {}, stopPropagation() {} });
    ok('...renamed, and nudged 10 px by Shift+Right Arrow', took && line.points[0][0] === x0 + 10 && line.name === 'Gable end',
      JSON.stringify([took, x0, line.points]));
    ok('...and still the desktop\'s Infinity, vertical', line.value === Infinity && line.label === 'Gable end',
      JSON.stringify([String(line.value), line.label]));
    c.select([]);
    c.setVersionView('', null);
  }
  const w2 = webSummary(project);
  eq('every ADDED sheet kept its origin, one row up, date and all', w2.origin,
    { 'A2.5': ['ASI 1', 1, '02/10/2026'], 'A7.0': ['REV 2', 2, '03/01/2026'],
      'A8.0': ['REV 2', 3, '03/01/2026'] });
  eq('the wall lives on in its runs: 25 + 35 LF', w2.groups, [['A4.0', 'Footing', 60]]);
  const savedPath = path.join(dir, 'web.takeoff');
  const blob = await writeProject({
    metadata: project.buildSaveMetadata(),
    pageSources: store.saveSources(),
    revisionSources: store.saveRevisionSources(),
  });
  await writeFile(savedPath, new Uint8Array(await blob.arrayBuffer()));

  // ── 3b. ...and again with the wall deleted from the Items list ──
  // The list's Delete used to take the item off ONE sheet: its runs stayed
  // on the others, and the desktop's open-time heal (one_main_shape) made
  // the first of them the item again -- the deleted wall, back in the bid.
  // Now every shape goes, so the desktop has nothing to heal.
  console.log('\n-- 3b. this app deletes the multi-sheet wall from the Items list, saves again --');
  const wallRow = [...project.allItems()].find(([, m]) => m.name === 'Footing' && !m.group_child);
  ok('the wall is still a multi-sheet item before the delete', !!wallRow
    && [...project.allItems()].filter(([, m]) => m.group_id === wallRow[1].group_id).length === 2);
  project.removeItems([wallRow[1]._uid]);
  eq('no shape of the wall is left on any sheet',
    [...project.allItems()].filter(([, m]) => m.group_id === wallRow[1].group_id).length, 0);
  const w3 = webSummary(project);
  const deletedPath = path.join(dir, 'web-deleted.takeoff');
  const blob3 = await writeProject({
    metadata: project.buildSaveMetadata(),
    pageSources: store.saveSources(),
    revisionSources: store.saveRevisionSources(),
  });
  await writeFile(deletedPath, new Uint8Array(await blob3.arrayBuffer()));
  const d4 = await desktop('check', deletedPath);
  for (const k of SAME) eq(`reopened after the list's Delete: ${k}`, d4[k], w3[k]);
  eq('the desktop healed nothing back into the bid: no wall', d4.groups, []);
  eq('...and asked nothing', d4.asked, []);

  // ── 4. the desktop reopens what this app saved ──
  console.log('\n-- 4. the desktop reopens it --');
  const d2 = await desktop('check', savedPath);
  for (const k of SAME) eq(`reopened on the desktop: ${k}`, d2[k], w2[k]);
  eq('the renamed, nudged pitch line reaches the desktop as its own Infinity, under its new name',
    d2.pitch, [['Infinity', 'Gable end', 90]]);
  eq('...and the desktop still says \'vertical\' of it, with no number on its hover (a 0 read \'0:12\')',
    d2.pitchSays, [['vertical', '']]);
  eq('opening asked nothing (nothing to repair, nothing left out)', d2.asked, []);
  eq('the picture overlay came back on A6.0 -- record, flag and look -- moved up a row with its sheet',
    d2.overlays, { 'A6.0': A6_OVERLAY });
  eq('...and arriving on A6.0 puts it up: a picture, Original colours, inverted, cut off at 180',
    d2.overlayUp, { 'A6.0': [true, true, 'original', true, 180] });
  eq('Delete Revision would remove only what the revisions added', d2.plans, {
    'ASI 1': { added: ['A2.5'], drop: [], keep: ['A2.5'] },
    'REV 2': { added: ['A7.0', 'A8.0'], drop: ['A8.0'], keep: ['A7.0'] },
  });

  console.log('\n-- 5. Delete Revision on the desktop removes no original sheet --');
  const d3 = await desktop('delete-rev', savedPath, 'REV 2');
  ok('the revision was deleted', d3.deleted, d3.status);
  const originals = ['A2.0', 'A3.0', 'A4.0', 'A5.0', 'A6.0'];
  eq('every original sheet is still there', originals.filter(l => d3.labels.includes(l)), originals);
  ok('the untouched sheet it added went with it', !d3.labels.includes('A8.0'), JSON.stringify(d3.labels));
  ok('the one he took off stayed', d3.labels.includes('A7.0') && d3.labels.includes('A2.5'));
  const dq = d3.asked.find(a => /Delete it/.test(a[1]));
  ok('and the question named the quantities that leave',
    !!dq && /11\.6 sq ft of Wall A3 new/.test(dq[1]) && /Wall A5/.test(dq[1]),
    `${JSON.stringify(d3.asked)} / ${d3.status}`);

  // ── 6. a rename on the web, read by the desktop (Round 7) ──
  // The desktop test's own fixture (tests/data/rename-truth.json: synthetic,
  // its framed wall made by framing.py's own functions) on the desktop's job;
  // this app renames a floor, the framing engine's trade, the pins' trade
  // and a pin kind's sub-category, and saves. The desktop must read the same
  // names, file new pins where the web recorded, and a framing recompute
  // must leave the renamed lines where the web filed them.
  console.log('\n-- 6. this app renames floors and trades; the desktop reads them back --');
  const RT = JSON.parse(await readFile(new URL('./data/rename-truth.json', import.meta.url), 'utf-8')).rename;
  const f6 = await openProject(new Blob([await readFile(made)]));
  const pj = new Project();
  pj.loadFrom({ metadata: f6.metadata, annotations: f6.annotations, measurements: f6.measurements,
    pageCount: f6.pageCount, revisionCounts: f6.revisions.map(s => s.length) });
  const st6 = new PageStore();
  st6.setFromProject(f6);
  for (const [pg, lst] of RT.fixtures.pins) {
    const key = String(pg);
    pj.measurements[key] = [...(pj.measurements[key] || []), ...JSON.parse(JSON.stringify(lst))];
  }
  const renames = [
    ['floor_level', 'Level 1', '1st Floor', null],
    ['category', 'Framing', 'Wood Framing', null],
    ['category', 'Doors & Windows', 'Openings', null],
    ['sub_category', 'Partitions', 'Interior Walls', { category: 'Wood Framing' }],
  ];
  const got6 = renames.map(([fld, o, nu, sc]) => renameClassification(pj, fld, o, nu, sc));
  ok('the four renames each wrote something', got6.every(c => c && c.items > 0), JSON.stringify(got6));
  eq('...and recorded where windows, doors and partitions go', pj.metadata.pin_filing, {
    window: { category: 'Openings' }, door: { category: 'Openings' },
    partition: { category: 'Wood Framing', sub_category: 'Interior Walls' } });
  const renamedPath = path.join(dir, 'web-renamed.takeoff');
  const blob6 = await writeProject({
    metadata: pj.buildSaveMetadata(),
    pageSources: st6.saveSources(),
    revisionSources: st6.saveRevisionSources(),
  });
  await writeFile(renamedPath, new Uint8Array(await blob6.arrayBuffer()));
  const d6 = await desktop('classes', renamedPath);
  const dc = d6.classes;
  for (const fld of CLASS_FIELDS) {
    eq(`the desktop reads this job's ${fld} names as the web does (project_values)`, dc.values[fld],
      projectValues(pj.measurements, fld));
  }
  ok('...and no old name is left', !dc.values.floor_level.includes('Level 1') && !dc.values.category.includes('Framing')
    && !dc.values.category.includes('Doors & Windows'), JSON.stringify(dc.values));
  eq('the desktop files new pins where the web recorded (_pin_filing)', dc.pinFiling,
    Object.fromEntries(PIN_KINDS.map(k => [k, pinFiling(pj.metadata, k)])));
  eq('...its metadata holds the web\'s record as written', dc.metaPinFiling, pj.metadata.pin_filing);
  eq('...a door and a window placed with the desktop\'s own pin tools go under Openings', dc.placed,
    [['door', 'Openings', 'Level 9'], ['window', 'Openings', 'Level 9']]);
  const wall = dc.framed['Wall B'];
  ok('the framed wall came through with its answers', !!wall, JSON.stringify(Object.keys(dc.framed)));
  if (wall) {
    eq('a framing recompute (the engine\'s own merge rule) leaves every renamed line where the web filed it',
      wall.recomputed, wall.saved);
    eq('...the lines, as the web wrote them', wall.saved, {
      Strap: ['Wood Framing', '1st Floor'], Shims: ['Wood Framing', ''], Crane: ['Hardware', '1st Floor'],
      '2x6 stud': ['Wood Framing', ''] });
    eq('...and the answers it re-attaches them from', wall.extras,
      [['e1', 'Wood Framing', '1st Floor'], ['e2', 'Wood Framing', ''], ['e3', 'Wood Framing', '1st Floor']]);
  }
  eq('opening the renamed job asked nothing', d6.asked, []);
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log(fails ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass — desktop -> web -> desktop: every total, every sheet_origin `
    + 'and every pin as the other program left it');
process.exit(fails ? 1 : 0);
