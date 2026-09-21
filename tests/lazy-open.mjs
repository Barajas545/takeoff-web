// Opening a project must read only the header, the metadata and the page index
// — never the sheets. A 2.3 GB project depends on this: the desktop loader does
// `data = f.read()` and no browser can.
//
// The check is not a code review: it counts the bytes actually pulled out of the
// Blob, through a proxy that records every slice.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { openProject } from '../js/core/takeoff-file.js';
import { PageStore } from '../js/core/page-store.js';
import { LIBRARY, haveLibrary, skip } from './config.mjs';

const ROOT = LIBRARY;
// This one runs against the real project library. Without one it SKIPS rather
// than fails — see tests/config.mjs.
if (!await haveLibrary()) skip('no project library at ' + LIBRARY);

let fails = 0;
const rows = [];

/** A Blob that records how many bytes anyone actually reads out of it. */
function counting(buf) {
  const inner = new Blob([buf]);
  const stats = { bytes: 0, slices: 0, wholeReads: 0 };
  const wrap = (blob, isRoot) => ({
    size: blob.size,
    slice(a, b) {
      stats.slices += 1;
      const s = blob.slice(a, b);
      return wrap(s, false);
    },
    async arrayBuffer() {
      if (isRoot) stats.wholeReads += 1;
      stats.bytes += blob.size;
      return blob.arrayBuffer();
    },
    stats,
  });
  return wrap(inner, true);
}

async function* walk(dir, d = 0) {
  if (d > 3) return;
  let es; try { es = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of es) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'Backups') yield* walk(p, d + 1); }
    else if (e.name.toLowerCase().endsWith('.takeoff')) yield p;
  }
}

for await (const f of walk(ROOT)) {
  const buf = await readFile(f).catch(() => null);
  if (!buf || buf.length > 250 * 1048576) continue;

  const blob = counting(buf);
  const opened = await openProject(blob);
  const store = new PageStore();
  store.setFromProject(opened);

  const read = blob.stats.bytes;
  const total = buf.length;
  const pct = (read / total) * 100;

  // The metadata block itself can be tens of MB — annotations live in it, and
  // on one real project it IS 97% of the file — so the bound is "everything
  // except the sheet blobs", not a flat number. A revision tail adds its own
  // size table, a few KB per set.
  const revisionAllowance = opened.revisions.length * 20 * 1024;
  const headerBudget = 17 + opened.pageCount * 12 + metaLen(buf) + 4096 + revisionAllowance;

  if (blob.stats.wholeReads > 0) { fails++; console.log(`FAIL ${path.basename(f)}: read the WHOLE file`); }
  if (read > headerBudget) {
    fails++;
    console.log(`FAIL ${path.basename(f)}: read ${read} bytes, budget ${headerBudget}`);
  }

  // The number that actually matters: how much of the SHEET data was touched.
  // A project whose metadata is 97% of the file will read 97% of it and still
  // be perfectly lazy, because none of that was pixels.
  const sheetBytes = opened.pages.reduce((n, e) => n + e.size, 0);
  const sheetsRead = Math.max(0, read - metaLen(buf) - 17 - opened.pageCount * 12);

  rows.push({
    file: path.basename(f).slice(0, 34),
    fileMB: (total / 1048576).toFixed(1),
    metaMB: (metaLen(buf) / 1048576).toFixed(2),
    sheetsMB: (sheetBytes / 1048576).toFixed(1),
    readKB: (read / 1024).toFixed(1),
    sheetBytesRead: sheetsRead,
    pages: opened.pageCount,
  });
}

function metaLen(buf) {
  return new DataView(buf.buffer, buf.byteOffset).getUint32(13, true);
}

console.table(rows);
const sheetMB = rows.reduce((a, r) => a + parseFloat(r.sheetsMB), 0);
const worstSheet = rows.reduce((a, r) => Math.max(a, r.sheetBytesRead), 0);
console.log(fails
  ? `
${fails} PROJECT(S) READ MORE THAN THE HEADER`
  : `
Open is lazy on all ${rows.length} projects: ${sheetMB.toFixed(0)} MB of sheet data in the
` +
    `library, and the most any open touched beyond the header was ${worstSheet} bytes
` +
    `(the revision size table). Reads that look large are the metadata block itself —
` +
    `annotations live in it, and on one project it IS 97% of the file.`);
process.exit(fails ? 1 : 0);
