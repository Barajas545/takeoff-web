// Reads every real .takeoff project with the web reader and reports what it finds.
// Runs in Node: the container path uses only Blob, DataView and DecompressionStream.
import { stat } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { openProject, readProjectSummary } from '../js/core/takeoff-file.js';
import { inflate } from '../js/core/zlib.js';
import { LIBRARY, haveLibrary, skip } from './config.mjs';
import { openLazy } from './lib-scan.mjs';

const ROOT = process.argv[2] || LIBRARY;
// This one runs against the real project library. Without one it SKIPS rather
// than fails — see tests/config.mjs.
if (!await haveLibrary()) skip('no project library at ' + LIBRARY);


async function* walk(dir, depth = 0) {
  if (depth > 3) return;
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'Backups') yield* walk(p, depth + 1); }
    else if (e.name.toLowerCase().endsWith('.takeoff')) yield p;
  }
}


let ok = 0, failed = 0, totalItems = 0;
const rows = [];

for await (const p of walk(ROOT)) {
  const st = await stat(p);
  // Read through a file HANDLE, not readFile: the largest real job is 2.31 GB
  // and Node refuses to read a file past 2 GiB into a buffer. That project is
  // precisely the one worth opening, so the test reads the way the browser
  // does — a slice at a time.
  const { blob, close } = await openLazy(p);
  blob.name = path.basename(p);
  try {
    const summary = await readProjectSummary(blob);
    const proj = await openProject(blob);

    let items = 0, types = new Set(), noPpf = 0, withValue = 0;
    for (const list of Object.values(proj.measurements)) {
      for (const m of list) {
        items++;
        types.add(m.type);
        if (!(Number(m.ppf) > 0)) noPpf++;
        if (Number(m.value)) withValue++;
      }
    }
    totalItems += items;

    // Decode one page blob to prove the offsets and the zlib path are right.
    let pngOk = 'n/a';
    if (proj.pages.length) {
      const e = proj.pages[0];
      // Through the Blob, the way the app does — one slice, not an index into
      // a buffer the whole file had to fit in.
      const raw = new Uint8Array(await blob.slice(e.offset, e.offset + e.size).arrayBuffer());
      const png = await inflate(raw);
      pngOk = (png[0] === 0x89 && png[1] === 0x50 && png[2] === 0x4e && png[3] === 0x47)
        ? `PNG ${(png.length / 1048576).toFixed(1)}MB` : 'NOT PNG';
      if (pngOk.startsWith('PNG')) {
        const dv = new DataView(png.buffer, png.byteOffset);
        pngOk += ` ${dv.getUint32(16)}x${dv.getUint32(20)}`;
      }
    }

    rows.push({
      file: path.basename(p).slice(0, 46),
      mb: (st.size / 1048576).toFixed(1),
      read_kb: (proj.bytesRead / 1024).toFixed(1),
      pages: proj.pageCount,
      items,
      revs: proj.revisions.length,
      ppf: proj.metadata.pixels_per_foot ?? '-',
      dpi: proj.metadata.dpi ?? proj.metadata.import_dpi ?? '-',
      page0: pngOk,
      noPpf,
    });
    ok++;
  } catch (err) {
    rows.push({ file: path.basename(p).slice(0, 46), mb: (st.size / 1048576).toFixed(1), ERROR: err.message });
    failed++;
  } finally {
    await close();
  }
}

console.table(rows);
const allTypes = new Set();
console.log(`\nProjects read: ${ok}   failed: ${failed}   takeoff items across all: ${totalItems}`);
process.exit(failed ? 1 : 0);
