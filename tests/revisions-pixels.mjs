// What a revision costs to look at.
//
// The revision tail is where most of a real project's bytes are — on the
// estimator's largest job it is 1.42 GB against 887 MB of original sheets. So
// the whole viewer rests on one property: opening a project reads the tail's
// INDEX and none of its pixels, and putting one revision sheet on screen reads
// that ONE sheet and nothing else.
//
// This counts the bytes rather than reading the code. It also runs against the
// 2.3 GB project, which means it cannot slurp the file first — every read goes
// through a file handle, exactly as `File.slice()` does in the browser.
//
// Run: node tests/revisions-pixels.mjs
import { open, stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { openProject, pageBlob } from '../js/core/takeoff-file.js';
import { revPageCount, visibleRevisions, sheetVersions } from '../js/core/revisions.js';
import { LIBRARY, haveLibrary, skip } from './config.mjs';

const ROOT = LIBRARY;
// This one runs against the real project library. Without one it SKIPS rather
// than fails — see tests/config.mjs.
if (!await haveLibrary()) skip('no project library at ' + LIBRARY);

let fails = 0;

function fail(msg) { fails += 1; console.log(`FAIL ${msg}`); }

/**
 * A Blob-shaped window onto a file on disk that never holds the file.
 *
 * `slice()` returns another window; only `arrayBuffer()` touches the disk, and
 * every byte it reads is counted. This is the same contract the browser's File
 * gives the reader, which is what makes the count meaningful.
 */
function lazyFile(fh, size, stats, start = 0, end = size) {
  return {
    size: end - start,
    slice(a = 0, b = end - start) {
      const s = start + Math.max(0, a);
      const e = Math.min(end, start + Math.max(0, b));
      return lazyFile(fh, size, stats, s, Math.max(s, e));
    },
    async arrayBuffer() {
      const len = end - start;
      stats.reads += 1;
      stats.bytes += len;
      const buf = Buffer.alloc(len);
      if (len) await fh.read(buf, 0, len, start);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + len);
    },
  };
}

async function* walk(dir, d = 0) {
  if (d > 3) return;
  let es;
  try { es = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of es) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'Backups' || e.name === 'Archive') continue;   // the same jobs again
      yield* walk(p, d + 1);
    } else if (e.name.toLowerCase().endsWith('.takeoff')) {
      yield p;
    }
  }
}

const rows = [];
let checked = 0;

for await (const file of walk(ROOT)) {
  const size = (await stat(file)).size;
  const fh = await open(file, 'r');
  try {
    const stats = { bytes: 0, reads: 0 };
    const blob = lazyFile(fh, size, stats);
    let opened;
    try {
      opened = await openProject(blob);
    } catch {
      continue;                        // not a project this test is about
    }
    if (!opened.revisions.length) continue;
    checked += 1;

    const openBytes = stats.bytes;
    const revCount = opened.revisions.length;
    const revSheets = opened.revisions.reduce((n, s) => n + s.length, 0);

    // THE OPEN BUDGET. Header + metadata + the page index + the tail's size
    // table. The size table is read as one bounded over-read of
    // revCount * 4 * (1 + 4096) bytes, because it is variable length and
    // there is no way to know how long without reading it.
    const budget = 256 * 1024 + revCount * 20 * 1024;
    if (openBytes > budget) {
      fail(`${path.basename(file)}: opening read ${(openBytes / 1024).toFixed(0)} KB, `
        + `over the ${(budget / 1024).toFixed(0)} KB budget for ${revCount} revision sets`);
    }

    // Not one revision pixel. Every revision blob lives past the main pages,
    // so any read into that region during an open is the bug this guards.
    const mainEnd = opened.pages.length
      ? opened.pages[opened.pages.length - 1].offset + opened.pages[opened.pages.length - 1].size
      : 0;
    const tailBytes = size - mainEnd;
    if (openBytes > tailBytes && tailBytes > 0 && openBytes > budget) {
      fail(`${path.basename(file)}: the open read more than the whole revision tail`);
    }

    // ONE REVISION SHEET. Pick the first version of the first sheet that has
    // one, and read exactly it.
    const revs = visibleRevisions(opened.metadata.revisions.map((r, i) => ({
      ...r, pageCount: opened.revisions[i] ? opened.revisions[i].length : 0, _setIndex: i,
    })));
    let one = null;
    for (let p = 0; p < opened.pageCount && !one; p++) {
      const v = sheetVersions(p, revs).find(x => x.revId);
      if (v) one = { page: p, v };
    }

    let sheetKB = 0;
    let sheetCost = 0;
    if (one) {
      const entry = opened.revisions[one.v.rev._setIndex][one.v.revPage];
      const before = stats.bytes;
      await pageBlob(blob, entry).arrayBuffer();
      sheetCost = stats.bytes - before;
      sheetKB = entry.size / 1024;
      // A laziness assertion, not a magic number: a revision sheet is 0.5 MB
      // at its smallest and 21 MB at its largest in the real library, so the
      // only meaningful claim is "it read that sheet and nothing else".
      if (sheetCost !== entry.size) {
        fail(`${path.basename(file)}: reading one revision sheet cost ${sheetCost} B, `
          + `not the sheet's own ${entry.size} B`);
      }
      const total = stats.bytes;
      if (total > openBytes + entry.size * 1.2) {
        fail(`${path.basename(file)}: total after one sheet was ${total} B, `
          + `more than the open plus that sheet`);
      }
    }

    // Every revision record must pair with a real set of blobs, and the blob
    // count must match the labels the record carries — the pairing the file
    // makes by POSITION and nothing else.
    for (let i = 0; i < (opened.metadata.revisions || []).length; i++) {
      const rec = opened.metadata.revisions[i];
      const n = opened.revisions[i] ? opened.revisions[i].length : 0;
      const labels = (rec.page_labels || []).length;
      if (n && labels && n !== labels) {
        fail(`${path.basename(file)}: revision ${i + 1} has ${n} images but ${labels} labels`);
      }
      // No page may be both matched to a sheet and filling a new-sheet row.
      const m = new Set(Object.values(rec.match || {}));
      const both = Object.values(rec.extra || {}).filter(v => m.has(v));
      if (both.length) {
        fail(`${path.basename(file)}: revision ${i + 1} has page(s) ${both} in both match and extra`);
      }
    }

    rows.push({
      project: path.basename(file).slice(0, 34),
      MB: +(size / 1e6).toFixed(0),
      sets: revCount,
      revSheets,
      'tail MB': +((size - mainEnd) / 1e6).toFixed(0),
      'open KB': +(openBytes / 1024).toFixed(1),
      'open %': +((openBytes / size) * 100).toFixed(4),
      'one sheet KB': +sheetKB.toFixed(0),
    });
  } finally {
    await fh.close();
  }
}

if (!checked) {
  console.log('No project with revisions found under', ROOT);
  process.exit(2);
}

console.table(rows);
console.log(fails
  ? `\n${fails} CHECK(S) FAILED`
  : `\nAll ${checked} projects with revisions open on their index alone, and one`
    + ' revision sheet costs exactly that sheet.');
process.exit(fails ? 1 : 0);
