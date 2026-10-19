// THE ROUND TRIP, through both real programs.
//
//   1. The DESKTOP (pdf_fast_viewer.py, offscreen) builds a 3.05 job the way
//      he builds one: an original set; ASI 1 reissues sheets and ADDS A2.5 in
//      the middle; a second revision reissues two more and adds A7.0 and
//      A8.0; takeoff on revisions through the real canvas (the first takeoff
//      books its drawing, Yes to counting a reissue); callout pins and a
//      note stamped with a revision; a wall that spans three sheets. Saved.
//   2. THIS APP opens that file and must price it exactly as the desktop
//      does — every counted item and quantity, the Report's rows, which
//      drawing each sheet counts from, the sheets a revision added, where
//      every pin points, what every tile says.
//   3. It then EDITS: the first takeoff on A5.0's newest drawing (booking
//      it), a count on the ADDED sheet A7.0 (its own drawing must be
//      takeable), and DELETES A1.0 — the first sheet, holding the wall's
//      master — so every index after it moves. Saved.
//   4. The DESKTOP reopens what this app saved, asks nothing, and reads back
//      every total, every sheet_origin and every pin exactly as this app
//      left them — and its Delete Revision removes the untouched sheet that
//      revision added, and no original sheet.
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
import { Project } from '../js/core/project.js';
import { PageStore } from '../js/core/page-store.js';
import { ToolController } from '../js/tools/controller.js';
import { CountingModel } from '../js/core/counting.js';
import { newestVersionOf } from '../js/core/revisions.js';
import { collectItems } from '../js/ui/reports.js';
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
  return { labels: labs, origin, book, counted, sums, estimate, marks, tiles, newest, groups,
    revisions: model.revs.map(r => model.revName(r.id)) };
}

const SAME = ['labels', 'origin', 'book', 'counted', 'sums', 'estimate', 'marks', 'tiles',
  'newest', 'groups', 'revisions'];

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

  // ── 4. the desktop reopens what this app saved ──
  console.log('\n-- 4. the desktop reopens it --');
  const d2 = await desktop('check', savedPath);
  for (const k of SAME) eq(`reopened on the desktop: ${k}`, d2[k], w2[k]);
  eq('opening asked nothing (nothing to repair, nothing left out)', d2.asked, []);
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
} finally {
  await rm(dir, { recursive: true, force: true });
}

console.log(fails ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass — desktop -> web -> desktop: every total, every sheet_origin `
    + 'and every pin as the other program left it');
process.exit(fails ? 1 : 0);
