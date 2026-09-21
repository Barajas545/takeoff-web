// Find projects in the library by what is IN them, without reading them.
//
// Several harnesses want "a project that actually has revisions" rather than
// "the first four files on disk" — a differential that happens to pick four
// jobs with no revision tail proves nothing and reports success.
//
// Every check here is a header read: the 17-byte head, the metadata block, and
// the 8 bytes where the revision tail's magic would be. On the estimator's
// largest job that is a few KB against 2.3 GB.
import { open, stat } from 'node:fs/promises';
import { walkProjects } from './config.mjs';

const MAGIC = 'PDFCACHE1';
const REVS = 'TKREVS01';

/** The header facts, read through a file handle. Never the whole file. */
export async function probe(file) {
  const size = (await stat(file)).size;
  const fh = await open(file, 'r');
  try {
    const read = async (pos, len) => {
      const b = Buffer.alloc(len);
      await fh.read(b, 0, len, pos);
      return b;
    };
    const head = await read(0, 17);
    if (head.toString('latin1', 0, 9) !== MAGIC) return null;
    const pageCount = head.readUInt32LE(9);
    const metaLen = head.readUInt32LE(13);
    const meta = JSON.parse((await read(17, metaLen)).toString('utf8'));
    const idxStart = 17 + metaLen;
    const idx = await read(idxStart, pageCount * 12);
    let mainEnd = idxStart + pageCount * 12;
    if (pageCount) {
      const off = Number(idx.readBigUInt64LE((pageCount - 1) * 12));
      mainEnd = off + idx.readUInt32LE((pageCount - 1) * 12 + 8);
    }
    const hasTail = mainEnd + 8 <= size
      && (await read(mainEnd, 8)).toString('latin1') === REVS;
    return {
      file, size, pageCount, mainEnd, hasTail,
      revisionRecords: (meta.revisions || []).length,
      tailBytes: size - mainEnd,
    };
  } catch {
    return null;                  // not a project this scan is about
  } finally {
    await fh.close();
  }
}

/**
 * Up to `limit` projects that carry a revision tail, largest last.
 *
 * Backups and Archive are skipped: they hold the same jobs again, and four
 * copies of one job is not four projects' worth of coverage.
 */
export async function withRevisions(limit = 4) {
  const found = [];
  for await (const file of walkProjects(undefined, 0, 3, { skipCopies: true })) {
    const p = await probe(file);
    if (p && p.hasTail && p.revisionRecords) found.push(p);
  }
  found.sort((a, b) => a.size - b.size);
  // Smallest first, then the biggest — the big one is where the lazy-read
  // claims matter, and the small ones keep the run quick.
  const picked = found.slice(0, Math.max(0, limit - 1));
  if (found.length > picked.length) picked.push(found[found.length - 1]);
  return picked.map(p => p.file);
}

/** Every project, for the harnesses that want breadth rather than revisions. */
export async function allProjects({ skipCopies = false } = {}) {
  const out = [];
  for await (const f of walkProjects(undefined, 0, 3, { skipCopies })) out.push(f);
  return out;
}


/**
 * A Blob-shaped window onto a file on disk that never holds the file.
 *
 * `slice()` returns another window; only `arrayBuffer()` touches the disk, and
 * every byte it reads is counted. This is the same contract the browser's File
 * gives the reader, which is what makes the byte counts in these harnesses
 * mean anything.
 *
 * It is also the only way to read the estimator's largest job from Node at
 * all: `readFile` refuses past 2 GiB, and that project is 2.31 GB — the one
 * file where the lazy-read design matters most is the one a slurping test
 * cannot open.
 */
export function lazyBlob(fh, size, stats = { bytes: 0, reads: 0 }, start = 0, end = size) {
  return {
    size: end - start,
    stats,
    slice(a = 0, b = end - start) {
      const s = start + Math.max(0, a);
      const e = Math.min(end, start + Math.max(0, b));
      return lazyBlob(fh, size, stats, s, Math.max(s, e));
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

/** Open a project as a lazy Blob. The caller must close() it. */
export async function openLazy(file) {
  const size = (await stat(file)).size;
  const fh = await open(file, 'r');
  const stats = { bytes: 0, reads: 0 };
  return { blob: lazyBlob(fh, size, stats), size, stats, close: () => fh.close() };
}
