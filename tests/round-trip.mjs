// Open a real project, write it back with the web writer, re-open the result,
// and prove nothing moved: same pages, same bytes per page, same item values.
import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { openProject, writeProject } from '../js/core/takeoff-file.js';
import { Project } from '../js/core/project.js';
import { PageStore } from '../js/core/page-store.js';
import { LIBRARY, haveLibrary, skip } from './config.mjs';

const ROOT = LIBRARY;
// This one runs against the real project library. Without one it SKIPS rather
// than fails — see tests/config.mjs.
if (!await haveLibrary()) skip('no project library at ' + LIBRARY);

const MAX_MB = 250;

async function* walk(dir, d = 0) {
  if (d > 3) return;
  let es; try { es = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of es) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'Backups') yield* walk(p, d + 1); }
    else if (e.name.toLowerCase().endsWith('.takeoff')) yield p;
  }
}

let pass = 0, fail = 0;
const rows = [];

for await (const p of walk(ROOT)) {
  const buf = await readFile(p).catch(() => null);
  if (!buf || buf.length > MAX_MB * 1048576) continue;

  const before = await openProject(new Blob([buf]));
  const project = new Project();
  project.loadFrom({
    metadata: before.metadata, annotations: before.annotations,
    measurements: before.measurements, pageCount: before.pageCount,
  });
  const store = new PageStore();
  store.setFromProject(before);

  const blob = await writeProject({
    metadata: project.buildSaveMetadata(),
    pageSources: store.saveSources(),
    revisionSources: store.saveRevisionSources(),
  });
  const outBuf = new Uint8Array(await blob.arrayBuffer());
  const after = await openProject(new Blob([outBuf]));

  const problems = [];
  if (after.pageCount !== before.pageCount) problems.push('page count');
  if (after.revisions.length !== before.revisions.length) {
    problems.push(`revision sets ${before.revisions.length} -> ${after.revisions.length}`);
  } else {
    for (let r = 0; r < before.revisions.length; r++) {
      if (before.revisions[r].length !== after.revisions[r].length) {
        problems.push(`revision ${r} sheets ${before.revisions[r].length} -> ${after.revisions[r].length}`);
      }
    }
  }

  // Every page blob must come through byte for byte.
  for (let i = 0; i < before.pageCount; i++) {
    const a = new Uint8Array(buf.buffer, buf.byteOffset + before.pages[i].offset, before.pages[i].size);
    const b = outBuf.subarray(after.pages[i].offset, after.pages[i].offset + after.pages[i].size);
    if (a.length !== b.length) { problems.push(`page ${i} size ${a.length} -> ${b.length}`); break; }
    for (let k = 0; k < a.length; k += 4093) {
      if (a[k] !== b[k]) { problems.push(`page ${i} bytes differ at ${k}`); break; }
    }
  }

  // Every item value must be identical, and no runtime key may have leaked.
  const p2 = new Project();
  p2.loadFrom({
    metadata: after.metadata, annotations: after.annotations,
    measurements: after.measurements, pageCount: after.pageCount,
  });
  const va = [...project.allItems()].map(([, m]) => `${m.type}:${m.value}`).sort();
  const vb = [...p2.allItems()].map(([, m]) => `${m.type}:${m.value}`).sort();
  if (va.length !== vb.length) problems.push(`item count ${va.length} -> ${vb.length}`);
  else for (let i = 0; i < va.length; i++) {
    if (va[i] !== vb[i]) { problems.push(`item ${va[i]} -> ${vb[i]}`); break; }
  }

  const written = JSON.stringify(project.buildSaveMetadata());
  for (const k of ['"_uid"', '"ppf"', '"ppf_recovered"', '"scale_label"']) {
    if (written.includes(k)) problems.push(`runtime key leaked: ${k}`);
  }

  rows.push({
    file: path.basename(p).slice(0, 40),
    pages: before.pageCount,
    items: va.length,
    revSheets: before.revisions.reduce((n, s) => n + s.length, 0),
    inMB: (buf.length / 1048576).toFixed(1),
    outMB: (outBuf.length / 1048576).toFixed(1),
    result: problems.length ? problems.join('; ') : 'OK',
  });
  if (problems.length) fail++; else pass++;
}

console.table(rows);
console.log(`\nRound-trip: ${pass} clean, ${fail} with problems`);
process.exit(fail ? 1 : 0);
