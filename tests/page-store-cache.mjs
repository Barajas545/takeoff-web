// page-store-cache.mjs — the caches that must never answer for another sheet.
//
// PageStore keeps the last sheet it inflated, so that reading one detail
// closely (which now takes a crop per settled pan or zoom) does not re-read
// a Blob and re-inflate 20 MB every time. That cache is keyed by page INDEX,
// and a page index means nothing on its own: inserting a sheet renumbers
// every one after it, and opening another project renumbers all of them.
//
// So every read captures `_gen` and files its result only if the page set
// has not moved under it. This file is what stops that guard being quietly
// weakened — an adversarial review found `clearCaches()` was not bumping the
// counter, so an inflate straddling File ▸ Open filed the OLD project's
// sheet under the NEW project's number, and nativeSize() then stamped the
// old sheet's dimensions onto the new source, where they outlived the bytes.
//
// Run: node tests/page-store-cache.mjs
import zlib from 'node:zlib';
import { PageStore, pngSize, cropGeometry } from '../js/core/page-store.js';
import { inflatePartial } from '../js/core/zlib.js';

let failed = 0;
const ok = (cond, msg) => {
  if (cond) { console.log('  ok   ' + msg); return; }
  failed++;
  console.log('  FAIL ' + msg);
};

/** Just enough PNG for pngSize: signature, then an IHDR carrying w and h. */
function fakePng(width, height, tag = 0x11) {
  const b = new Uint8Array(64).fill(tag);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const dv = new DataView(b.buffer);
  dv.setUint32(8, 13);                      // IHDR length
  b.set([0x49, 0x48, 0x44, 0x52], 12);      // "IHDR"
  dv.setUint32(16, width);
  dv.setUint32(20, height);
  return b;
}

const deflated = bytes => new Uint8Array(zlib.deflateSync(Buffer.from(bytes)));

/**
 * A sheet that behaves like a real one: big, and incompressible, so that a
 * 4 KB slice of its deflated form really is a FRAGMENT. The first fixture
 * here was 64 bytes, which deflates to about 70 — `slice(0, 4096)` was the
 * entire stream, so the prefix read could not fail and the test passed
 * while the code under it was dead.
 *
 * Deterministic: a fixture that changes every run cannot be bisected.
 */
function bigPng(width, height, tag = 0x11) {
  const body = new Uint8Array(400000);
  let x = 0x2545f491;                       // xorshift32, same bytes every run
  for (let i = 0; i < body.length; i++) {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    body[i] = x & 0xff;
  }
  const out = new Uint8Array(24 + body.length);
  out.set(fakePng(width, height, tag).subarray(0, 24), 0);
  out.set(body, 24);
  return out;
}

function storeWith(pages) {
  const s = new PageStore();
  s.sources = pages.map(p => ({
    kind: 'raw', data: deflated(fakePng(p.w, p.h, p.tag)), width: 0, height: 0,
  }));
  return s;
}

console.log('-- the fixture itself --');
{
  const png = fakePng(5400, 3600, 0xaa);
  const size = pngSize(png);
  ok(size.width === 5400 && size.height === 3600,
     'a sheet header reads back as the size it was written with');
  ok(pngSize(new Uint8Array(8)) === null, 'and a truncated one reads as nothing');
}

console.log('\n-- the bytes cache answers for the sheet that was asked for --');
{
  const s = storeWith([{ w: 5400, h: 3600, tag: 0xaa }, { w: 2400, h: 3600, tag: 0xbb }]);
  const a = await s.pngBytes(0);
  ok(a[63] === 0xaa, 'sheet 0 is sheet 0');
  ok(s._bytes && s._bytes.index === 0, 'and it was kept');
  const again = await s.pngBytes(0);
  ok(again === a, 'a second read of the same sheet is the same array, not a new inflate');
  const b = await s.pngBytes(1);
  ok(b[63] === 0xbb, 'sheet 1 is sheet 1');
  ok(s._bytes.index === 1, 'and the one entry moved to it');
  ok((await s.pngBytes(0))[63] === 0xaa, 'sheet 0 still reads correctly after eviction');
}

console.log('\n-- a read in flight when the project changes under it --');
{
  const s = storeWith([{ w: 5400, h: 3600, tag: 0xaa }]);
  const job = s.pngBytes(0);                 // not awaited: it is mid-flight
  const gen = s._gen;
  // Project B is adopted. setFromProject calls clearCaches and replaces
  // `sources` wholesale, so index 0 now names a different sheet in a
  // different job.
  s.clearCaches();
  s.sources = [{ kind: 'raw', data: deflated(fakePng(2400, 3600, 0xbb)), width: 0, height: 0 }];
  await job;
  ok(s._gen !== gen, 'swapping the project moves the generation counter');
  ok(s._bytes === null,
     'so the read that was in flight does NOT file the old project\'s sheet');
  const after = await s.pngBytes(0);
  ok(after[63] === 0xbb, 'and sheet 0 of the new project is the new project\'s sheet');
  const nat = await s.nativeSize(0);
  ok(nat.width === 2400 && nat.height === 3600,
     `and its size is its own: ${nat.width}x${nat.height}, not 5400x3600`);
}

console.log('\n-- the same, through the door the bug came in --');
{
  const s = storeWith([{ w: 5400, h: 3600, tag: 0xaa }]);
  const job = s.pngBytes(0);
  // The real door: a project file plus its page index, which is what an
  // open hands the store. 'slice' sources, as every opened project has.
  const bytesB = deflated(fakePng(2400, 3600, 0xbb));
  s.setFromProject({
    file: new Blob([bytesB]),
    pages: [{ offset: 0, size: bytesB.length }],
    revisions: [],
  });
  await job;
  ok(s._bytes === null, 'setFromProject() closes it too, not just clearCaches()');
  const nat = await s.nativeSize(0);
  ok(nat.width === 2400,
     `nativeSize reports the new project's sheet: ${nat.width} wide`);
  ok(s.sources[0].width === 2400,
     'and what it stamps on the source is the new sheet\'s size, which outlives the bytes');
}

console.log('\n-- a page inserted under a read in flight --');
{
  const s = storeWith([{ w: 5400, h: 3600, tag: 0xaa }, { w: 2400, h: 3600, tag: 0xbb }]);
  const job = s.pngBytes(1);
  s.addPage({ kind: 'raw', data: deflated(fakePng(1200, 1200, 0xcc)) }, 0);
  const got = await job;
  ok(got[63] === 0xbb, 'the caller still gets the bytes it asked for');
  ok(s._bytes === null, 'but they are not filed under an index that now means another sheet');
  ok((await s.pngBytes(2))[63] === 0xbb, 'the sheet is where the insert put it');
}

console.log('\n-- nativeSize does not decode, and remembers --');
{
  const s = storeWith([{ w: 5400, h: 3600, tag: 0xaa }]);
  ok(s.sources[0].width === 0, 'a freshly opened sheet does not know its own size');
  const nat = await s.nativeSize(0);
  ok(nat.width === 5400 && nat.height === 3600, 'the IHDR says so without a decode');
  ok(s.sources[0].width === 5400, 'and it is remembered on the source');
  s._bytes = null;
  const again = await s.nativeSize(0);
  ok(again.width === 5400, 'so the second answer costs nothing at all');
  ok(s._bytes === null, '...and does not even read the bytes');
  ok(await s.nativeSize(9) === null, 'a sheet that is not there has no size');
}

console.log('\n-- the blob is the bytes --');
{
  const s = storeWith([{ w: 5400, h: 3600, tag: 0xaa }]);
  const b1 = await s.pngBlob(0);
  const b2 = await s.pngBlob(0);
  ok(b1 === b2, 'the same sheet twice is the same Blob, not a second 20 MB copy');
  ok(b1.type === 'image/png', 'typed as a PNG, which createImageBitmap needs');
  ok(b1.size === (await s.pngBytes(0)).length, 'and it is all of the bytes');
  s.clearCaches();
  const b3 = await s.pngBlob(0);
  ok(b3 !== b1, 'and it is dropped with everything else');
}

console.log('\n-- residentBytes owns up to what is held --');
{
  const s = storeWith([{ w: 5400, h: 3600, tag: 0xaa }]);
  ok(s.residentBytes() === 0, 'nothing read, nothing held');
  const bytes = await s.pngBytes(0);
  ok(s.residentBytes() === bytes.length,
     `the kept sheet is counted (${bytes.length} bytes), not invisible`);
  const blob = await s.pngBlob(0);
  ok(s.residentBytes() === bytes.length + blob.size,
     'and so is the Blob beside it, which is a second copy of the same sheet');
  s.clearCaches();
  ok(s.residentBytes() === 0, 'both uncounted once dropped');
}

console.log('\n-- one inflate, however many ask at once --');
{
  const s = storeWith([{ w: 5400, h: 3600, tag: 0xaa }]);
  let reads = 0;
  const real = s._inflateSheet.bind(s);
  s._inflateSheet = (...a) => { reads++; return real(...a); };
  const [a, b, c] = await Promise.all([s.pngBytes(0), s.pngBytes(0), s.pngBytes(0)]);
  ok(reads === 1, `three readers at once cost one inflate, not three (${reads})`);
  ok(a === b && b === c, 'and they all get the same array');
  ok(s._bytesPending.size === 0, 'with nothing left in flight afterwards');
}

console.log('\n-- a sheet already in memory --');
{
  const s = new PageStore();
  const png = fakePng(5400, 3600, 0xaa);
  s.sources = [{ kind: 'png', data: png, width: 0, height: 0 }];
  const got = await s.pngBytes(0);
  ok(got === png, 'a png source is handed back as it is, with no copy');
  const b1 = await s.pngBlob(0);
  const b2 = await s.pngBlob(0);
  ok(b1 === b2,
     'and it gets the one kept Blob too, instead of copying the sheet per crop');
}

console.log('\n-- a decode landing after the page set moved --');
{
  // getPage is the one that files a DRAWING and stamps a sheet's size, so
  // it is the worst place to trust a stale index. It is also the one that
  // had no generation check at all.
  const s = storeWith([{ w: 5400, h: 3600, tag: 0xaa }, { w: 1200, h: 1200, tag: 0xbb }]);
  const bitmap = { width: 5400, height: 3600, closed: false, close() { this.closed = true; } };
  let land;
  s._decode = () => new Promise(r => { land = r; });

  const job = s.getPage(0);
  s.removePage(1);                      // an ordinary sheet delete, mid-decode
  land(bitmap);
  const got = await job;
  await new Promise(r => setTimeout(r, 0));   // the close is a microtask
  ok(got === null, 'the caller is told there is no sheet, not given the wrong one');
  ok(s._lru.size === 0, 'nothing is filed in the page cache');
  ok(s.sources[0].width === 0, 'and no dimensions are stamped on the source');
  ok(bitmap.closed, 'the bitmap it decoded is released, not leaked');
}

console.log('\n-- ...and when nothing moved, it still files it --');
{
  const s = storeWith([{ w: 5400, h: 3600, tag: 0xaa }]);
  const bitmap = { width: 5400, height: 3600, close() {} };
  s._decode = async () => bitmap;
  const got = await s.getPage(0);
  ok(got === bitmap, 'the decoded sheet comes back');
  ok(s._lru.get(0) === bitmap, 'and is cached');
  ok(s.sources[0].width === 5400, 'and its size is remembered');
  ok(await s.getPage(0) === bitmap, 'a second ask is the cached one');
}

console.log('\n-- as much as a cut-off stream will give --');
{
  const whole = deflated(bigPng(3400, 2200, 0xcc));
  ok(whole.length > 40000,
     `the fixture is incompressible, so 4096 bytes is a real fragment of its ${whole.length}`);
  const prefix = whole.slice(0, 4096);

  // What the plain reader does with a fragment, which is why the fast path
  // needed its own function.
  let threw = false;
  try {
    await new Response(new Blob([prefix]).stream()
      .pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
  } catch { threw = true; }
  ok(threw, 'reading a fragment through one Response rejects - inflate() cannot do this');

  const part = await inflatePartial(prefix, 64);
  ok(part && part.length >= 24,
     `inflatePartial keeps what arrived (${part ? part.length : 0} bytes)`);
  const size = pngSize(part);
  ok(size && size.width === 3400 && size.height === 2200,
     'and that is enough to read the IHDR out of it');
  ok((await inflatePartial(whole, 64)).length >= 64,
     'a complete stream works through the same door');
  ok(await inflatePartial(new Uint8Array([1, 2, 3]), 64) === null,
     'and rubbish gives nothing rather than throwing');
}

console.log('\n-- a revision sheet\'s size, from that 4 KB prefix --');
{
  const s = new PageStore();
  s.revisionSlices = [[new Blob([deflated(bigPng(3400, 2200, 0xcc))])]];
  // If the prefix path is dead this is the only thing that can answer, so
  // breaking it proves which path the size actually came from.
  s.revisionPngBytes = async () => { throw new Error('the full read should not be needed'); };
  const size = await s.revisionPageSize(0, 0);
  ok(size && size.width === 3400 && size.height === 2200,
     `the prefix alone gives ${size ? size.width + 'x' + size.height : 'nothing'}`);
  ok(s._revSizes.get('0:0'), 'and it is remembered');
}

console.log('\n-- an in-memory sheet does not evict the kept inflate --');
{
  const s = storeWith([{ w: 5400, h: 3600, tag: 0xaa }]);
  s.sources.push({ kind: 'png', data: fakePng(1700, 1100, 0xdd), width: 0, height: 0 });
  await s.pngBytes(0);                       // the scanned sheet, inflated
  ok(s._bytes && s._bytes.index === 0, 'the sheet that cost a read is kept');
  const mem = await s.pngBytes(1);           // the imported one, already here
  ok(mem[63] === 0xdd, 'the in-memory sheet reads back');
  ok(s._bytes && s._bytes.index === 0,
     'and it did NOT take the one slot from the sheet a preview may be panning');
  const b1 = await s.pngBlob(1);
  const b2 = await s.pngBlob(1);
  ok(b1 === b2, 'it still gets one Blob kept for it, somewhere that evicts nothing');
  ok(s._bytes.index === 0, 'and asking for that Blob does not evict either');
}

console.log('\n-- a decode landing after a page change does not unregister a newer one --');
{
  const s = storeWith([{ w: 5400, h: 3600, tag: 0xaa }, { w: 1200, h: 1200, tag: 0xbb }]);
  let decodes = 0;
  const gate = [];
  s._decode = () => { decodes++; return new Promise(r => gate.push(r)); };

  const stale = s.getPage(1);                // in flight...
  s.removePage(0);                           // ...when a sheet is deleted
  const fresh = s.getPage(0);                // a new job under the shifted key
  ok(decodes === 2, 'two decodes so far');
  gate[0]({ width: 1, height: 1, close() {} });   // the stale one lands
  await stale;
  ok(s._pending.has(0),
     'the newer decode is still registered - the stale one did not delete it');
  const joined = s.getPage(0);        // must JOIN it, not start a third
  ok(decodes === 2, 'so asking again joins it instead of starting a third decode');
  gate[1]({ width: 1200, height: 1200, close() {} });
  const [a, b] = await Promise.all([fresh, joined]);
  ok(a === b && a.width === 1200, 'and both callers get the one bitmap');
  ok(!s._pending.has(0), 'with the map left clean');
}

console.log('\n-- cropGeometry, the one definition --');
{
  const nat = { width: 5400, height: 3600 };
  const g = cropGeometry([0.25, 0.5, 0.75, 1], nat);
  ok(g.sx === 1350 && g.sy === 1800 && g.sw === 2700 && g.sh === 1800, 'plain case');
  const rev = cropGeometry([0.75, 1, 0.25, 0.5], nat);
  ok(rev.sx === 1350 && rev.sw === 2700, 'a zone given backwards is the same rectangle');
  const out = cropGeometry([-5, -5, 9, 9], nat);
  ok(out.sx === 0 && out.sw === 5400 && out.sh === 3600, 'and one off the paper is clamped to it');
  const dot = cropGeometry([0.5, 0.5, 0.5, 0.5], nat);
  ok(dot.sw === 1 && dot.sh === 1, 'an empty zone still has a whole pixel');
  const junk = cropGeometry([null, undefined, 'x', NaN], nat);
  ok(Number.isFinite(junk.sx) && Number.isFinite(junk.sw), 'and rubbish does not make NaN');
}

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nAll page-store cache checks passed');
process.exit(failed ? 1 : 0);
