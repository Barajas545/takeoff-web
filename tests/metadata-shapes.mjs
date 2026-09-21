// The metadata this app writes must have the SHAPES the desktop app reads.
// Verified against real files and pdf_fast_viewer.py:
//   dpi                 int
//   page_labels         LIST   (detected, by index)
//   page_labels_custom  DICT   {str(idx): label}
//   page_names          DICT   {str(idx): name}
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { openProject, writeProject } from '../js/core/takeoff-file.js';
import { Project } from '../js/core/project.js';
import { PageStore } from '../js/core/page-store.js';
import { LIBRARY, haveLibrary, skip } from './config.mjs';

const ROOT = LIBRARY;
// This one runs against the real project library. Without one it SKIPS rather
// than fails — see tests/config.mjs.
if (!await haveLibrary()) skip('no project library at ' + LIBRARY);

let fails = 0;
const bad = (m) => { fails++; console.log('FAIL ' + m); };

async function* walk(dir, d = 0) {
  if (d > 3) return;
  let es; try { es = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of es) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'Backups') yield* walk(p, d + 1); }
    else if (e.name.toLowerCase().endsWith('.takeoff')) yield p;
  }
}

const isDict = v => v && typeof v === 'object' && !Array.isArray(v);
let checked = 0;

for await (const f of walk(ROOT)) {
  const buf = await readFile(f).catch(() => null);
  if (!buf || buf.length > 60 * 1048576) continue;
  checked++;

  const before = await openProject(new Blob([buf]));
  const project = new Project();
  project.loadFrom({
    metadata: before.metadata, annotations: before.annotations,
    measurements: before.measurements, pageCount: before.pageCount,
  });
  const store = new PageStore();
  store.setFromProject(before);

  // Rename a sheet and give it a title, the way the UI does.
  if (before.pageCount) {
    project.setPageLabel(0, 'S9.99');
    project.setPageName(0, 'Test Sheet');
  }

  const blob = await writeProject({
    metadata: project.buildSaveMetadata(),
    pageSources: store.saveSources(),
    revisionSources: store.saveRevisionSources(),
  });
  const after = await openProject(new Blob([new Uint8Array(await blob.arrayBuffer())]));
  const m = after.metadata;
  const name = path.basename(f).slice(0, 32);

  if (!Number.isInteger(m.dpi)) bad(`${name}: dpi is ${JSON.stringify(m.dpi)}, want an int`);
  if ('import_dpi' in m) bad(`${name}: wrote import_dpi, which is a SETTINGS key`);
  if (!Array.isArray(m.page_labels)) bad(`${name}: page_labels is ${typeof m.page_labels}, want a list`);
  if (m.page_labels_custom !== undefined && !isDict(m.page_labels_custom)) {
    bad(`${name}: page_labels_custom is ${Array.isArray(m.page_labels_custom) ? 'a list' : typeof m.page_labels_custom}, want a dict`);
  }
  if (m.page_names !== undefined && !isDict(m.page_names)) {
    bad(`${name}: page_names is ${Array.isArray(m.page_names) ? 'a LIST — desktop dict() would throw' : typeof m.page_names}, want a dict`);
  }
  if (before.pageCount) {
    if (m.page_labels_custom?.['0'] !== 'S9.99') bad(`${name}: renamed label did not survive`);
    if (m.page_names?.['0'] !== 'Test Sheet') bad(`${name}: sheet title did not survive`);
    const p2 = new Project();
    p2.loadFrom({ metadata: m, annotations: after.annotations, measurements: after.measurements, pageCount: after.pageCount });
    if (p2.pageLabel(0) !== 'S9.99') bad(`${name}: pageLabel(0) = ${p2.pageLabel(0)}`);
    if (p2.pageName(0) !== 'Test Sheet') bad(`${name}: pageName(0) = ${p2.pageName(0)}`);
  }
}

// A file written by an older build of THIS app carried page_names as a list.
{
  const p = new Project();
  p.loadFrom({
    metadata: { page_names: ['', 'Second', 'Third'], page_labels: ['A1', 'A2', 'A3'] },
    annotations: {}, measurements: {}, pageCount: 3,
  });
  if (p.pageName(1) !== 'Second') bad(`legacy list page_names lost: got "${p.pageName(1)}"`);
  const out = p.buildSaveMetadata();
  if (Array.isArray(out.page_names)) bad('legacy list was written back as a list');
  if (out.page_names['1'] !== 'Second') bad('legacy list did not convert to a dict');
  if (p.pageLabel(0) !== 'A1') bad(`detected label lost: ${p.pageLabel(0)}`);
}

// Index-keyed dicts must move with an insert.
{
  const p = new Project();
  p.loadFrom({
    metadata: { page_labels: ['A1', 'A2'], page_names: { '1': 'Second' },
                page_labels_custom: { '1': 'X2' }, page_scales: { '1': 75 } },
    annotations: {}, measurements: { 1: [{ type: 'area', points: [], value: 1 }] },
    pageCount: 2,
  });
  p.notePagesInserted(1, 1);           // a sheet goes in ahead of the old page 1
  if (p.pageName(2) !== 'Second') bad(`insert lost the name: got "${p.pageName(2)}"`);
  if (p.pageLabel(2) !== 'X2') bad(`insert lost the custom label: got "${p.pageLabel(2)}"`);
  if (p.pagePpf(2) !== 75) bad(`insert lost the sheet scale: got ${p.pagePpf(2)}`);
  if (!(p.measurements[2] || []).length) bad('insert lost the items');
  if (p.canUndo) bad('undo survived a page insert — its snapshots are stale');
}

console.log(fails
  ? `\n${fails} SHAPE CHECK(S) FAILED across ${checked} projects`
  : `\nMetadata shapes correct across ${checked} projects, plus the legacy and insert cases`);
process.exit(fails ? 1 : 0);
