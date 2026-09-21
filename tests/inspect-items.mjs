// What is actually inside real projects: item types, fields, and the values
// the web app derives from them.
import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { openProject } from '../js/core/takeoff-file.js';
import { Project } from '../js/core/project.js';
import { valueString, reportQty, computeValue } from '../js/core/measure.js';
import { scaleLabelFor } from '../js/core/units.js';
import { LIBRARY, haveLibrary, skip } from './config.mjs';

const ROOT = LIBRARY;
// This one runs against the real project library. Without one it SKIPS rather
// than fails — see tests/config.mjs.
if (!await haveLibrary()) skip('no project library at ' + LIBRARY);

const MAX_MB = 400;

async function* walk(dir, d = 0) {
  if (d > 3) return;
  let es; try { es = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of es) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'Backups') yield* walk(p, d + 1); }
    else if (e.name.toLowerCase().endsWith('.takeoff')) yield p;
  }
}

const typeCount = {};
const fieldsByType = {};
let mismatch = [];
let checked = 0;

for await (const p of walk(ROOT)) {
  const buf = await readFile(p).catch(() => null);
  if (!buf || buf.length > MAX_MB * 1048576) continue;
  let proj;
  try { proj = await openProject(new Blob([buf])); } catch { continue; }

  const project = new Project();
  project.loadFrom({
    metadata: proj.metadata, annotations: proj.annotations,
    measurements: proj.measurements, pageCount: proj.pageCount,
  });

  for (const [pg, m] of project.allItems()) {
    typeCount[m.type] = (typeCount[m.type] || 0) + 1;
    fieldsByType[m.type] ??= new Set();
    for (const k of Object.keys(m)) fieldsByType[m.type].add(k);

    // Does the value we would derive from the geometry match what is stored?
    if (['area', 'polyline', 'distance', 'grid', 'tile'].includes(m.type)
        && (m.points || []).length >= 2 && Number(m.value)) {
      checked++;
      const derived = computeValue(m);
      const stored = Number(m.value);
      const rel = Math.abs(derived - stored) / Math.max(1e-9, Math.abs(stored));
      if (rel > 0.005) {
        mismatch.push({
          file: path.basename(p).slice(0, 30), type: m.type,
          stored: stored.toFixed(3), derived: derived.toFixed(3),
          ppf: m.ppf, pagePpf: project.pagePpf(pg), rel: rel.toFixed(4),
        });
      }
    }
  }
}

console.log('ITEM TYPES SEEN:', typeCount);
console.log('\nFIELDS BY TYPE:');
for (const [t, s] of Object.entries(fieldsByType)) {
  console.log(` ${t}: ${[...s].sort().join(', ')}`);
}
console.log(`\nGeometry cross-check: ${checked} items, ${mismatch.length} disagree with the stored value`);
if (mismatch.length) console.table(mismatch.slice(0, 20));
