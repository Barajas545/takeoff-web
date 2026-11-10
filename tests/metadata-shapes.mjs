// The metadata this app writes must have the SHAPES the desktop app reads.
// Verified against real files and pdf_fast_viewer.py:
//   dpi                 int
//   page_labels         LIST   (detected, by index)
//   page_labels_custom  DICT   {str(idx): label}
//   page_names          DICT   {str(idx): name}
// ...and desktop 3.08's takeoffs, which THIS APP WRITES NONE OF (it keeps
// them as the file had them, byte for byte; js/core/takeoff-lists.js):
//   takeoff_lists       LIST   [{list_id: str, label: str}], written only when
//                              the job has a takeoff besides Main
//   takeoff_list_active STR    the takeoff the desktop left the job in (absent: Main)
//   takeoff_main_label  STR    Main's own name (absent: 'Main')
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
const TL_KEYS = ['takeoff_lists', 'takeoff_list_active', 'takeoff_main_label'];
/** The shapes desktop 3.08 writes the three in, '' when right. */
function takeoffShapes(m) {
  const out = [];
  if ('takeoff_lists' in m) {
    const l = m.takeoff_lists;
    if (!Array.isArray(l) || !l.length) out.push(`takeoff_lists is ${JSON.stringify(l)}, want a non-empty list`);
    else if (!l.every(r => isDict(r) && typeof r.list_id === 'string' && typeof r.label === 'string')) {
      out.push('takeoff_lists holds a record that is not {list_id: str, label: str}');
    }
  }
  for (const k of ['takeoff_list_active', 'takeoff_main_label']) {
    if (k in m && typeof m[k] !== 'string') out.push(`${k} is ${typeof m[k]}, want a str`);
  }
  return out.join('; ');
}

for await (const f of walk(ROOT)) {
  const buf = await readFile(f).catch(() => null);
  if (!buf || buf.length > 60 * 1048576) continue;
  checked++;

  const before = await openProject(new Blob([buf]));
  // what the file says of takeoffs, as it was (none, in a job made before 3.08)
  const hadTl = Object.fromEntries(TL_KEYS.filter(k => k in before.metadata)
    .map(k => [k, JSON.stringify(before.metadata[k])]));
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
  // The takeoffs: this app writes none of the three -- each is the file's own, or absent.
  for (const k of TL_KEYS) {
    const now = k in m ? JSON.stringify(m[k]) : undefined;
    if (now !== hadTl[k]) bad(`${name}: ${k} ${hadTl[k] ?? '(absent)'} -> ${now ?? '(absent)'}: this app writes none of the takeoff keys`);
  }
  if (takeoffShapes(m)) bad(`${name}: ${takeoffShapes(m)}`);
  for (const lst of Object.values(after.measurements || {})) {
    for (const it of lst || []) {
      if ('takeoff_list' in it && (typeof it.takeoff_list !== 'string' || !it.takeoff_list.trim())) {
        bad(`${name}: an item's takeoff_list is ${JSON.stringify(it.takeoff_list)}, want an id (a non-empty str)`);
      }
    }
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

// Desktop 3.08's takeoffs: a job of two keeps its three keys in their shapes,
// as they were, through an edit and a save; a job with only Main, and a new
// one, gain none of them.
{
  const md = { page_labels: ['X1.0'], takeoff_lists: [{ list_id: 'tl-0000beef', label: 'Deck' }],
    takeoff_list_active: 'tl-0000beef', takeoff_main_label: 'House' };
  const p = new Project();
  p.loadFrom({ metadata: structuredClone(md), annotations: {},
    measurements: { 0: [{ type: 'area', name: 'Deck boards', points: [[0, 0], [10, 0], [10, 10]], value: 1, takeoff_list: 'tl-0000beef' }] },
    pageCount: 1 });
  p.setPageLabel(0, 'X1.1');
  const out = p.buildSaveMetadata();
  for (const k of TL_KEYS) {
    if (JSON.stringify(out[k]) !== JSON.stringify(md[k])) bad(`a job of two takeoffs: ${k} ${JSON.stringify(md[k])} -> ${JSON.stringify(out[k])}`);
  }
  if (takeoffShapes(out)) bad(`a job of two takeoffs: ${takeoffShapes(out)}`);
  if (out.measurements['0'][0].takeoff_list !== 'tl-0000beef') bad('a job of two takeoffs: the item lost its takeoff');
  const one = new Project();
  one.loadFrom({ metadata: { page_labels: ['X1.0'] }, annotations: {}, measurements: {}, pageCount: 1 });
  one.setPageLabel(0, 'X1.1');
  const fresh = new Project();
  for (const [what, o] of [['a job with only Main', one.buildSaveMetadata()], ['a new job', fresh.buildSaveMetadata()]]) {
    const got = TL_KEYS.filter(k => k in o);
    if (got.length) bad(`${what} gained ${got.join(', ')}: this app writes none of the takeoff keys`);
  }
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
  : `\nMetadata shapes correct across ${checked} projects (none gained a takeoff key), plus the legacy, takeoff and insert cases`);
process.exit(fails ? 1 : 0);
