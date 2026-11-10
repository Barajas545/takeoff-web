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
//   7. TWO TAKEOFFS (desktop 3.08): the DESKTOP makes a job of House and
//      Deck with its own takeoff tools (New Takeoff, Main renamed, Move to
//      Takeoff, left in Deck); THIS APP edits House through every door it
//      has that writes the job (21, each through its own producer) and saves
//      it twice -- the same bytes; the DESKTOP reopens it with the same
//      registry, takeoff and Main name, every item in its takeoff and Group
//      (the promoted heirs in their masters'), every stored total its own,
//      Deck's included, and an open that put nothing right and said nothing
//      (a hand-split copy shows the heal is heard when it speaks).
//  7b. ...and with a run left filed in a Group its item is not in (3.07's
//      put-back): BOTH programs delete the sheets of those items' main
//      shapes, each by its own Delete Page / Delete Sheet, and leave the
//      same items, tags, Groups (the heirs in none: desktop 3.08's
//      set-or-pop) and totals; this app's save of it, twice the same bytes,
//      reopens on the desktop as made, in silence.
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
import zlib from 'node:zlib';
import { openProject, writeProject, STANDALONE_PAGE } from '../js/core/takeoff-file.js';
import { recompute } from '../js/core/measure.js';
import { stringifyPyJson } from '../js/core/py-json.js';
import { Project, resyncGroups, takeoffFingerprint } from '../js/core/project.js';
import { PageStore } from '../js/core/page-store.js';
import { ToolController } from '../js/tools/controller.js';
import {
  CountingModel, applyBooking, isTakeoffItem, takeoffQuantityWords, takeoffMoveWords, hiddenTakeoffsWords,
  takeoffNaming, setTakeoffNaming,
} from '../js/core/counting.js';
import { newestVersionOf, itemRevId } from '../js/core/revisions.js';
import { collectItems } from '../js/ui/reports.js';
import {
  renameClassification, projectValues, pinFiling, PIN_KINDS, CLASS_FIELDS, unfiledItems, assignClassification,
} from '../js/core/classify.js';
import { takeoffListOf, inTakeoffList, takeoffNamingOf, WEB_TAKEOFF } from '../js/core/takeoff-lists.js';
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

/** A white sheet as PNG bytes (Add Blank Sheet's page: main.js draws it on a canvas). */
function blankPng(w, h) {
  const crcT = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0); out.write(type, 4, 'ascii'); Buffer.from(data).copy(out, 8);
    out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const raw = Buffer.alloc((w * 3 + 1) * h, 255);
  for (let y = 0; y < h; y++) raw[y * (w * 3 + 1)] = 0;
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return new Uint8Array(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
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

  // ── 7. two takeoffs (desktop 3.08), through every door this app has ──
  // The desktop makes the job with its own takeoff tools (make-two: New
  // Takeoff with its name asked, Main renamed House, Move to Takeoff, the
  // job left in Deck). This app opens it and edits House through EVERY door
  // that writes the job -- the doors are js/'s callers of the Project's
  // writers (addItem, updateItem, removeItems, dropShapes, setVisible,
  // transact, pushUndo, setPageScale, restampPage, notePagesInserted,
  // notePageRemoved, setPageLabel, setPageName, addAnnotation, the booking,
  // undo and redo): each is driven through the producer the app's button
  // drives (ToolController's pointer events and keys, main.js's own
  // countThisVersion / askCountAfterTakeoff / deleteCurrentPage lifted by
  // text, classify.js's rename and Set with the scope the Items list builds).
  // Saved by the real writer, twice: the same bytes. The DESKTOP then
  // reopens it: the same registry, the same takeoff it was left in, Main's
  // name, every item in the takeoff this app saved it in (the promoted heirs
  // in their masters'), every stored total its own (Deck's included), and an
  // open that put NOTHING right and said nothing. A hand-split copy is
  // reopened too, to show the desktop's heal is heard when it speaks.
  // (No Add Shape and no Duplicate Page door exists here: nothing in js/
  // appends a shape to an item or copies a sheet.)
  console.log('\n-- 7. two takeoffs: the desktop makes them, this app edits through every door, the desktop reopens --');
  const TAGK = 'takeoff_list';
  const TL_KEYS = ['takeoff_lists', 'takeoff_list_active', 'takeoff_main_label'];
  const madeTwo = path.join(dir, 'two.takeoff');
  const t1 = await desktop('make-two', madeTwo);
  const deck = t1.deck;
  ok('the desktop made Deck by New Takeoff, renamed Main House, and left the job in Deck',
    /^tl-/.test(deck) && JSON.stringify(t1.lists) === JSON.stringify([{ list_id: deck, label: 'Deck' }])
    && t1.active === deck && t1.main === 'House' && !t1.asked.length, JSON.stringify(t1));
  const ft = await openProject(new Blob([await readFile(madeTwo)]));
  const keys0 = TL_KEYS.map(k => JSON.stringify(ft.metadata[k]));
  const pt = new Project();
  pt.loadFrom({ metadata: ft.metadata, annotations: ft.annotations, measurements: ft.measurements,
    pageCount: ft.pageCount, revisionCounts: ft.revisions.map(s => s.length) });
  const st = new PageStore();
  st.setFromProject(ft);
  const idxT = l => Array.from({ length: pt.pageCount }, (_, i) => pt.pageLabel(i)).indexOf(l);
  const isDeck = m => takeoffListOf(m) === deck;
  const shapeOf = (name, l, child = false) => (pt.measurements[idxT(l)] || [])
    .find(m => m.name === name && !!m.group_child === child);
  const deckItems = () => [...pt.allItems()].filter(([, m]) => isDeck(m));
  const deck0 = deckItems().length;
  ok('the job holds Deck\'s work: Deck boards (X1.0 + X2.0 + X3.0), Beam (X4.0 + X3.0), Rail (moved), Posts, Window 2, '
    + 'Ledger in Stairs, Screws', deck0 === 11 && isDeck(shapeOf('Rail', 'X4.0')) && isDeck(shapeOf('Beam', 'X4.0')),
  JSON.stringify(deckItems().map(([, m]) => m.name)));
  let pgT = 0;
  let countAnswer = null;
  const onT = {};
  const ct = new ToolController({
    canvas: { addEventListener: (t, f) => { onT[t] = f; }, setPointerCapture() {}, releasePointerCapture() {}, style: {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 800 }) },
    viewport: { zoom: 1, toPage: q => q, eventToPage: ev => [ev.clientX, ev.clientY], toScreen: (x, y) => [x, y],
      panBy() {}, ensureVisible() {} },
    project: pt, currentPage: () => pgT,
    host: { askCountItem: async () => (countAnswer ? structuredClone(countAnswer) : null) } });
  const ptr = (type, x, y) => ({ pointerId: 1, pointerType: 'mouse', button: 0, buttons: type === 'pointerup' ? 0 : 1,
    clientX: x, clientY: y, type, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false,
    preventDefault() {}, stopPropagation() {} });
  const dragT = async (x0, y0, x1, y1) => {
    onT.pointerdown(ptr('pointerdown', x0, y0));
    for (let k = 1; k <= 6; k += 1) onT.pointermove(ptr('pointermove', x0 + (x1 - x0) * k / 6, y0 + (y1 - y0) * k / 6));
    onT.pointerup(ptr('pointerup', x1, y1));
    for (let i = 0; i < 4; i += 1) await new Promise(r => setImmediate(r));
  };
  // main.js's own doors, lifted by text and run with the real counting functions
  const MAIN = await readFile(new URL('../js/main.js', import.meta.url), 'utf-8');
  const MAIN_FNS = ['countThisVersion', 'askCountAfterTakeoff', 'stillOn', 'deleteCurrentPage'];
  const mainText = n => {
    const at = [`\nasync function ${n}(`, `\nfunction ${n}(`].map(h => MAIN.indexOf(h)).find(i => i >= 0);
    return at === undefined ? null : MAIN.slice(at + 1, MAIN.indexOf('\n}\n', at) + 2);
  };
  const texts = MAIN_FNS.map(mainText);
  ok(`main.js has ${MAIN_FNS.join(', ')}`, texts.every(Boolean));
  const said = [];
  // (on `pt` and `st`, or -- 7b -- on another job's project and page store)
  const mainRunOn = async (proj, store, fnName, page, revId, ...args) => {
    const env = {
      app: { project: proj, currentPage: page, editing: true, pages: store },
      versionView: { revId },
      countingModel: () => new CountingModel({ metadata: proj.metadata, measurements: proj.measurements,
        pageCount: proj.pageCount }),
      D: { confirmDialog: async (t, m) => { said.push(['asked', m]); return true; }, alertDialog: async (t, m) => said.push(['alert', m]) },
      countAsked: new Set(), setStatus: t => said.push(['status', t]),
      sayPrice: t => said.push(['price', typeof t === 'function' ? t() : t]), afterBookChange() {},
      applyBooking, resyncGroups, itemRevId, takeoffFingerprint, isTakeoffItem, takeoffQuantityWords, takeoffMoveWords,
      hiddenTakeoffsWords, takeoffNaming, pageFinalLabel: i => proj.pageLabel(i), leftByChoice: () => false,
      calloutPreview: { clearCache() {} }, thumbs: { refresh() {} }, pageImage: null, goToPage: async () => {},
    };
    const body = MAIN_FNS.map((n, i) => `const ${n} = (${texts[i]});`).join('\n');
    // eslint-disable-next-line no-new-func
    const f = new Function('env', `with (env) { ${body}\nreturn ${fnName}; }`)(env);
    setTakeoffNaming(() => takeoffNamingOf(proj.metadata, proj.measurements, WEB_TAKEOFF));
    try { return await f(...args); } finally { setTakeoffNaming(null); }
  };
  const mainRun = (...a) => mainRunOn(pt, st, ...a);
  const doors = [];
  const door = (name, cond, detail = '') => { doors.push(name); ok(`door: ${name}`, cond, detail); };
  const tagOf = m => (m && TAGK in m ? m[TAGK] : null);

  // + Add item (runAction 'add-standalone' -> Project.addItem, the form's shape)
  const glue = pt.addItem(STANDALONE_PAGE, { type: 'standalone', name: 'Glue', label: 'Glue', qty: 2, value: 2,
    unit: 'ea', floor_level: '', category: '', sub_category: '', cost_type: 'material', unit_cost: 1.5 }, { label: 'Add item' });
  door('+ Add item: filed in House (no tag)', tagOf(glue) === null);
  // a tool's takeoff (ToolController._commit -> _file)
  pgT = idxT('X1.0');
  ct.setVersionView('', null);
  ct._commit({ type: 'area', name: 'Patio', label: 'Patio', value: 12, ppf: 10, visible: true,
    points: [[400, 400], [460, 400], [460, 440], [400, 440]], floor_level: 'Level 1', category: 'Concrete' }, 'Area');
  door('a tool\'s takeoff on X1.0: filed in House', !!shapeOf('Patio', 'X1.0') && tagOf(shapeOf('Patio', 'X1.0')) === null);
  // count taps by the Item box's name, on a sheet where Deck has its own
  // Posts: the Count tool armed from its form, "Posts" typed, two clicks
  countAnswer = { spec: { name: 'Outlets', label: 'Outlets', category: 'Electrical', floor_level: '',
    cost_type: 'material', unit_cost: 0, color: [0.5, 0.5, 0.5, 0.35] } };
  await ct.setMode('count');
  countAnswer = null;
  ct.options.pendingName = 'Posts';
  for (const [x, y] of [[600, 500], [640, 500]]) {
    onT.pointerdown(ptr('pointerdown', x, y));
    onT.pointerup(ptr('pointerup', x, y));
    for (let i = 0; i < 4; i += 1) await new Promise(r => setImmediate(r));
  }
  const postsX1 = (pt.measurements[idxT('X1.0')] || []).filter(m => m.type === 'count' && m.name === 'Posts');
  door('two count taps "Posts" on X1.0: a new House Posts of 2, Deck\'s Posts still 2 and Deck\'s',
    JSON.stringify(postsX1.map(m => [tagOf(m), m.points.length]).sort()) === JSON.stringify([[deck, 2], [null, 2]].sort()),
    JSON.stringify(postsX1.map(m => [tagOf(m), m.points.length])));
  ct.setMode('pan');
  // a heading's Rename, inside House (the scope ItemsPanel.renameFromHeader builds in a job of several)
  const deckFraming = () => deckItems().filter(([, m]) => m.category === 'Framing').length;
  const df0 = deckFraming();
  const rn = renameClassification(pt, 'category', 'Framing', 'Carpentry', { takeoff: WEB_TAKEOFF });
  door('a heading\'s Rename Framing -> Carpentry in House: House\'s renamed, Deck\'s keep Framing',
    !!rn && rn.items > 0 && df0 > 0 && deckFraming() === df0
    && ![...pt.allItems()].some(([, m]) => !isDeck(m) && m.category === 'Framing'), JSON.stringify([rn, df0, deckFraming()]));
  // Set floor level for the blank items (ItemsPanel.assignFromHeader's every-item targets: House's)
  const unfiledT = unfiledItems(pt.measurements, 'floor_level').filter(m => inTakeoffList(m, WEB_TAKEOFF));
  const deckBlank = unfiledItems(pt.measurements, 'floor_level').filter(isDeck);
  const asg = assignClassification(pt, 'floor_level', 'Level 2', unfiledT);
  door('Set floor level of House\'s blank items: Deck\'s blank ones stay blank',
    !!asg && asg.items > 0 && deckBlank.length > 0 && deckBlank.every(m => !String(m.floor_level || '').trim()),
    JSON.stringify([asg, deckBlank.length]));
  // the Properties dialog's writes (main.js: updateItem, an 'Edit item' level, Materials)
  const slab = shapeOf('Slab', 'X1.0');
  pt.updateItem(slab._uid, { notes: 'poured in two pours' });
  pt.transact('Edit item', () => { Object.assign(slab, { name: 'Slab A', label: 'Slab A', unit_cost: 2 }); recompute(slab); });
  pt.updateItem(slab._uid, { associated_items: [{ name: 'Rebar', qty: 2, qty_mode: 'total', unit_cost: 3 }] },
    { label: 'Materials' });
  door('Properties: notes, name, price and materials of House\'s Slab', slab.name === 'Slab A'
    && (slab.associated_items || []).length === 1 && tagOf(slab) === null);
  // Hide (the item menu's and the list's eye)
  const outlets = shapeOf('Outlets', 'X1.0');
  pt.setVisible([outlets._uid], false);
  door('Hide House\'s Outlets', outlets.visible === false);
  // the arrow keys (a Nudge level) and a corner dragged (a Reshape level), by the controller's own handlers
  ct.select([slab._uid]);
  const x0 = slab.points[0][0];
  const nudged = ct.handleKey({ key: 'ArrowRight', shiftKey: true, ctrlKey: false, metaKey: false, altKey: false,
    preventDefault() {}, stopPropagation() {} });
  door('Shift+Right Arrow nudges House\'s Slab 10 px', nudged && slab.points[0][0] === x0 + 10);
  ct.select([]);
  // (its lower-left corner: nudged, its right edge sits on Wall M's left one)
  const [cx, cy] = slab.points[3];
  await dragT(cx, cy, cx - 10, cy + 10);
  door('a corner of House\'s Slab dragged', slab.points[3][0] === cx - 10 && slab.points[3][1] === cy + 10,
    JSON.stringify(slab.points));
  // a box highlight (markup: an annotation, through the controller's own press and release)
  const ann0 = (pt.annotations[idxT('X1.0')] || []).length;
  ct.setMode('highlight_rect');
  await dragT(700, 100, 760, 160);
  ct.setMode('pan');
  door('a box highlight on X1.0 (markup)', (pt.annotations[idxT('X1.0')] || []).length === ann0 + 1);
  // the canvas's Delete of a run, and of a main shape (its run takes the item over)
  pgT = idxT('X2.0');
  const wallRun = shapeOf('Wall M', 'X2.0', true);
  ct.select([wallRun._uid]);
  door('the canvas\'s Delete of House\'s Wall M run on X2.0', ct.deleteSelected() === 1 && !shapeOf('Wall M', 'X2.0', true));
  const fence = shapeOf('Fence', 'X2.0');
  ct.select([fence._uid]);
  const n1 = ct.deleteSelected();
  const fenceHeir = shapeOf('Fence', 'X3.0');
  door('the canvas\'s Delete of House\'s Fence main shape on X2.0: its X3.0 run is the item now, still House\'s',
    n1 === 1 && !!fenceHeir && !fenceHeir.group_child && tagOf(fenceHeir) === null, JSON.stringify(fenceHeir));
  // the list's Delete of a whole item (deleteWholeItem -> removeItems)
  const joists = shapeOf('Joists', 'X2.0');
  pt.removeItems([joists._uid]);
  door('the Items list\'s Delete of House\'s Joists', !shapeOf('Joists', 'X2.0'));
  // a booking: a takeoff on Rev B of X2.0, "Count Rev B?" Yes (it rides the level), Undo, Redo
  ct.setVersionView('r2', 0);
  ct._commit({ type: 'area', name: 'Rail B', label: 'Rail B', value: 6, ppf: 10, visible: true,
    points: [[100, 100], [160, 100], [160, 140]], floor_level: 'Level 1', category: 'Railing' }, 'Area');
  const railB = (pt.measurements[pgT] || []).find(m => m.name === 'Rail B');
  await mainRun('askCountAfterTakeoff', pgT, 'r2', pgT, railB, pt.undoTop, 'k');
  const working = () => new CountingModel({ metadata: pt.metadata, measurements: pt.measurements, pageCount: pt.pageCount })
    .workingVersionOf(pgT);
  door('a takeoff on Rev B of X2.0, and Yes to counting it: the booking rides its level',
    working() === 'r2' && !!pt.undoTop.booking && tagOf(railB) === null);
  pt.undo();
  door('...Undo: the takeoff and the booking go back', working() === '' && !(pt.measurements[pgT] || []).some(m => m.name === 'Rail B'));
  pt.redo();
  door('...Redo: both come back', working() === 'r2' && (pt.measurements[pgT] || []).some(m => m.name === 'Rail B'));
  ct.setVersionView('', null);
  await mainRun('countThisVersion', pgT, '');
  door('Count this version: X2.0 counts from its own drawing again (Deck boards\' run there counts again)', working() === '');
  // the scale: Keep existing work on X1.0, Re-value everything on X3.0 (Deck's runs there too: the scale is the sheet's)
  pt.setPageScale(idxT('X1.0'), 20);
  const beamRun = shapeOf('Beam', 'X3.0', true);
  pt.restampPage(idxT('X3.0'), 12.5);
  door('the scale: X1.0 kept, X3.0 restamped -- Deck\'s Beam run there with it (the scale is the sheet\'s)',
    pt.pagePpf(idxT('X1.0')) === 20 && pt.pagePpf(idxT('X3.0')) === 12.5 && beamRun.ppf === 12.5,
    JSON.stringify([pt.pagePpf(idxT('X1.0')), beamRun.ppf]));
  // Add Blank Sheet after X2.0 (main.js: PageStore.addPage, notePagesInserted, its label and title)
  const at = idxT('X2.0') + 1;
  st.addPage({ kind: 'png', data: blankPng(800, 600), width: 800, height: 600 }, at);
  pt.notePagesInserted(at, 1);
  pt.setPageLabel(at, 'X2.5');
  pt.setPageName(at, 'Inserted sheet');
  door('Add Blank Sheet after X2.0: every sheet after it moves up one', pt.pageCount === 5 && st.pageCount === 5
    && idxT('X3.0') === at + 1 && isDeck(shapeOf('Deck boards', 'X3.0', true)));
  // Delete Sheet of X4.0, which holds Deck's Beam main shape (main.js deleteCurrentPage)
  pgT = idxT('X4.0');
  said.length = 0;
  await mainRun('deleteCurrentPage', pgT, '');
  const beamHeir = shapeOf('Beam', 'X3.0');
  door('Delete Sheet X4.0, holding Deck\'s Beam main shape: its X3.0 run is the item now, in Deck',
    pt.pageCount === 4 && st.pageCount === 4 && idxT('X4.0') < 0 && !!beamHeir && !beamHeir.group_child && isDeck(beamHeir),
    JSON.stringify([pt.pageCount, beamHeir]));
  ok('...and the question said what of Deck went with it', said.some(([k, t]) => k === 'asked' && /takeoff Deck/.test(t)),
    JSON.stringify(said));
  // the sheet's name and number (Sheets: Rename) and Project Info
  pt.setPageLabel(idxT('X2.5'), 'X2.6');
  pt.transact('Project info', () => Object.assign(pt.metadata, { project_notes: 'Synthetic job.' }));
  door('a sheet renamed, and Project Info', idxT('X2.6') >= 0 && pt.metadata.project_notes === 'Synthetic job.');
  eq('the doors driven', doors.length, 21);
  eq('after every door, the three takeoff keys are as the desktop wrote them', TL_KEYS.map(k => JSON.stringify(pt.metadata[k])),
    keys0);
  eq('...and Deck still holds its 11 items, less the one that went with X4.0 (Rail) and the Beam shape there',
    deckItems().length, deck0 - 2);

  // saved by the real writer, twice: the same bytes (the stamp is to the minute -- a minute turning between
  // the two saves is the clock's, not the writer's, and they are made again)
  const saveT = async () => new Uint8Array(await (await writeProject({ metadata: pt.buildSaveMetadata(),
    pageSources: st.saveSources(), revisionSources: st.saveRevisionSources() })).arrayBuffer());
  let sa = null;
  let sb = null;
  for (let tries = 0; tries < 3; tries += 1) {
    const m0 = new Date().getMinutes();
    sa = await saveT();
    sb = await saveT();
    if (new Date().getMinutes() === m0) break;
  }
  ok('saving the same project twice gives the same bytes', sa.length === sb.length && sa.every((x, i) => x === sb[i]),
    `${sa.length} vs ${sb.length} bytes`);
  const savedTwo = path.join(dir, 'two-web.takeoff');
  await writeFile(savedTwo, sa);
  // this app's own reading of what it saved
  const fs2 = await openProject(new Blob([sa]));
  const ps2 = new Project();
  const rawItems = structuredClone(fs2.measurements);
  ps2.loadFrom({ metadata: fs2.metadata, annotations: fs2.annotations, measurements: fs2.measurements,
    pageCount: fs2.pageCount, revisionCounts: fs2.revisions.map(s => s.length) });
  // [sheet, type, name, tag, child, the Group it is filed in] -- the tag and
  // the Group as the store holds them (null when the key is absent), the
  // desktop driver's item_rows()
  const rowsOf = (proj, store) => {
    const labOf = k => (Number(k) === STANDALONE_PAGE ? 'standalone' : proj.pageLabel(Number(k)));
    return Object.keys(store).sort((a, b) => Number(a) - Number(b)).flatMap(k => (store[k] || []).map(m =>
      [labOf(k), m.type, m.name || m.text || m.label || '', TAGK in m ? m[TAGK] : null, !!m.group_child,
        m.in_group === undefined ? null : m.in_group]));
  };
  const webItems = rowsOf(ps2, rawItems);
  const w7 = webSummary(ps2);
  const d7 = await desktop('check-two', savedTwo);
  const two = d7.two || {};
  eq('the desktop reads the takeoffs as the desktop wrote them: the registry, the takeoff it was left in, Main\'s name',
    [two.lists, two.active, two.main], [t1.lists, t1.active, t1.main]);
  eq('...and opens it in Deck, Main called House', [two.registry, two.in, two.mainName], [t1.lists, deck, 'House']);
  eq('every item in the takeoff and the Group this app saved it in, the promoted heirs in their masters\' '
    + '(the desktop\'s reading)', two.items, webItems);
  ok('opening it put NOTHING right: not marked unsaved, each open-time check said nothing',
    two.unsaved === false && Array.isArray(two.heard) && two.heard.some(([n]) => n === '_heal_takeoff_lists')
    && two.heard.some(([n]) => n === '_heal_item_groups') && two.heard.every(([, t]) => t === ''), JSON.stringify(two.heard));
  eq('...no heal words, and nothing left for the heal to do', [two.healWords, two.healAgain, d7.asked], [[], '', []]);
  for (const k of ['labels', 'book', 'counted', 'sums', 'groups']) eq(`reopened on the desktop: ${k}`, d7[k], w7[k]);
  const deckTotals = rows => rows.filter(r => ['Deck boards', 'Beam'].includes(r[1]));
  ok('...Deck\'s stored totals are the ones this app saved: no total re-added on opening',
    deckTotals(w7.groups).length === 2 && JSON.stringify(deckTotals(d7.groups)) === JSON.stringify(deckTotals(w7.groups)),
    JSON.stringify([deckTotals(d7.groups), deckTotals(w7.groups)]));

  // ...and the probe hears a heal when there is one: the same save with one
  // of Deck boards' runs hand-split into House (the desktop puts it back, and says so)
  const fsx = await openProject(new Blob([sa]));
  const split = Object.values(fsx.measurements).flat().find(m => m.name === 'Deck boards' && m.group_child);
  delete split[TAGK];
  const px = new Project();
  px.loadFrom({ metadata: fsx.metadata, annotations: fsx.annotations, measurements: fsx.measurements,
    pageCount: fsx.pageCount, revisionCounts: fsx.revisions.map(s => s.length) });
  const stx = new PageStore();
  stx.setFromProject(fsx);
  const splitPath = path.join(dir, 'two-split.takeoff');
  await writeFile(splitPath, new Uint8Array(await (await writeProject({ metadata: px.buildSaveMetadata(),
    pageSources: stx.saveSources(), revisionSources: stx.saveRevisionSources() })).arrayBuffer()));
  const dx = await desktop('check-two', splitPath);
  ok('a hand-split item: the desktop\'s heal is heard (marked unsaved, its words said) -- the check above can hear one',
    dx.two && dx.two.unsaved === true && dx.two.heard.some(([n, t]) => n === '_heal_item_groups' && t),
    JSON.stringify(dx.two && dx.two.heard));

  // ── 7b. a run filed in a Group its item is not in: the heir takes the item's filing, none included ──
  // 3.07's put-back of a sheet kept aside (and 3.08's own, before its round 3
  // fixes) brought a run back filed in a Group he had taken the item out of;
  // deleting the item's main shape then handed the item that Group -- for a
  // House item, a Group of ANOTHER takeoff. Desktop 3.08 pops the heir's
  // in_group when the doomed main shape has none (_promote_child, R3RF-2),
  // and so does this app (project.js promoteChild). The answer is the
  // DESKTOP's own Delete Page of the same sheets of the same job: item for
  // item, tag and Group, and every total; then this app's save of it
  // reopens on the desktop as it was made, saying nothing.
  console.log('\n-- 7b. a run filed in a Group its item is not in: both programs delete its main shape\'s sheet --');
  const idxOf = (proj, l) => Array.from({ length: proj.pageCount }, (_, i) => proj.pageLabel(i)).indexOf(l);
  const loadT = f => {
    const p = new Project();
    p.loadFrom({ metadata: f.metadata, annotations: f.annotations, measurements: f.measurements,
      pageCount: f.pageCount, revisionCounts: f.revisions.map(s => s.length) });
    const s = new PageStore();
    s.setFromProject(f);
    return [p, s];
  };
  const saveOf = async (p, s) => new Uint8Array(await (await writeProject({ metadata: p.buildSaveMetadata(),
    pageSources: s.saveSources(), revisionSources: s.saveRevisionSources() })).arrayBuffer());
  const [p0, s0] = loadT(await openProject(new Blob([await readFile(madeTwo)])));
  const shape0 = (name, l, child) => (p0.measurements[idxOf(p0, l)] || []).find(m => m.name === name
    && !!m.group_child === child);
  const stairs0 = [...p0.allItems()].map(([, m]) => m).find(m => m.type === 'group' && m.name === 'Stairs');
  const staleRuns = [shape0('Fence', 'X3.0', true), shape0('Beam', 'X3.0', true)];
  const staleMains = [shape0('Fence', 'X2.0', false), shape0('Beam', 'X4.0', false)];
  ok('the job: Deck\'s Group Stairs; House\'s Fence (X2.0 + X3.0) and Deck\'s Beam (X4.0 + X3.0), in no Group',
    !!stairs0 && takeoffListOf(stairs0) === deck && staleRuns.every(Boolean)
    && staleMains.every(m => m && !('in_group' in m)) && takeoffListOf(staleMains[0]) === ''
    && takeoffListOf(staleMains[1]) === deck,
    JSON.stringify([stairs0, ...staleRuns, ...staleMains].map(m => m && [m.name, takeoffListOf(m), m.in_group])));
  // ...their X3.0 runs left filed in Stairs, as that put-back leaves them
  for (const r of staleRuns) if (r) r.in_group = stairs0.group_item_id;
  const stalePath = path.join(dir, 'two-stale.takeoff');
  await writeFile(stalePath, await saveOf(p0, s0));
  const dd = await desktop('delete-pages', stalePath, 'X2.0', 'X4.0');
  ok('the desktop opened it asking nothing, and asked its Delete Page question for each sheet',
    dd.openAsked.length === 0 && dd.asked.filter(([t]) => t === 'Delete Page').length === 2, JSON.stringify(dd.asked));
  // this app: the same sheets, by its own Delete Sheet (main.js deleteCurrentPage)
  const [p7, s7] = loadT(await openProject(new Blob([await readFile(stalePath)])));
  said.length = 0;
  for (const l of ['X2.0', 'X4.0']) await mainRunOn(p7, s7, 'deleteCurrentPage', idxOf(p7, l), '');
  ok('this app deleted X2.0 and X4.0 (each asked, as the desktop asks)',
    p7.pageCount === 2 && idxOf(p7, 'X2.0') < 0 && idxOf(p7, 'X4.0') < 0
    && said.filter(([k]) => k === 'asked').length === 2, JSON.stringify([p7.pageCount, said]));
  const heirs7 = ['Fence', 'Beam'].map(n => (p7.measurements[idxOf(p7, 'X3.0')] || []).find(m => m.name === n));
  eq('the two heirs on X3.0: main shapes now, in their item\'s takeoff, in NO Group (the stale filing popped)',
    heirs7.map(m => m && [!!m.group_child, takeoffListOf(m), m.in_group === undefined ? null : m.in_group]),
    [[false, '', null], [false, deck, null]]);
  eq('...item for item what the DESKTOP\'s own Delete Page leaves: every sheet, tag and Group',
    rowsOf(p7, p7.measurements), dd.items);
  const w7b = webSummary(p7);
  for (const k of ['labels', 'counted', 'sums', 'groups']) eq(`...and its ${k}`, w7b[k], dd[k]);
  // ...saved twice (the same bytes), and the desktop reopens it as it was made, in silence
  let sc = null;
  let sd = null;
  for (let tries = 0; tries < 3; tries += 1) {
    const m0 = new Date().getMinutes();
    sc = await saveOf(p7, s7);
    sd = await saveOf(p7, s7);
    if (new Date().getMinutes() === m0) break;
  }
  ok('saving it twice gives the same bytes', sc.length === sd.length && sc.every((x, i) => x === sd[i]),
    `${sc.length} vs ${sd.length} bytes`);
  const saved7b = path.join(dir, 'two-stale-web.takeoff');
  await writeFile(saved7b, sc);
  const f7b = await openProject(new Blob([sc]));
  const [p7b] = loadT(await openProject(new Blob([sc])));
  const d7b = await desktop('check-two', saved7b);
  const two7b = d7b.two || {};
  eq('the desktop reopens it: the registry, the takeoff it was left in, Main\'s name as made',
    [two7b.lists, two7b.active, two7b.main, two7b.in, two7b.mainName], [t1.lists, t1.active, t1.main, deck, 'House']);
  eq('...every item in the takeoff and Group this app saved', two7b.items, rowsOf(p7b, structuredClone(f7b.measurements)));
  ok('...and put nothing right and said nothing', two7b.unsaved === false && Array.isArray(two7b.heard)
    && two7b.heard.every(([, t]) => t === '') && JSON.stringify([two7b.healWords, two7b.healAgain, d7b.asked])
    === JSON.stringify([[], '', []]), JSON.stringify([two7b.heard, two7b.healWords, d7b.asked]));
  for (const k of ['labels', 'counted', 'sums', 'groups']) eq(`...reopened: ${k}`, d7b[k], webSummary(p7b)[k]);
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log(fails ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass — desktop -> web -> desktop: every total, every sheet_origin `
    + 'and every pin as the other program left it');
process.exit(fails ? 1 : 0);
