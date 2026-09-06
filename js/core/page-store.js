// page-store.js — page pixels, fetched and decoded on demand.
//
// WHY THIS EXISTS AT ALL. Measured against the estimator's live library: one
// sheet is 6300 × 4500 at 150 DPI, which is 113 MB once it is decoded to RGBA,
// and a job runs to 240 of them. Fully decoded that is 27 GB. The container
// itself reaches 2.3 GB, so it cannot be held as bytes either.
//
// So this store holds NO pixels and NO file bytes. It holds a File and a list
// of {offset, size}, fetches one page's compressed blob when that page is
// drawn, and keeps a handful of decoded ImageBitmaps in an LRU that closes
// what it evicts. Thumbnails are decoded once at a fraction of the size and
// kept, because the sheet list needs them all and they are small.
//
// A page's SOURCE is one of four things, and knowing which is what makes
// saving nearly free:
//   'slice'  a Blob slice of the opened file. Untouched. On save it is passed
//            straight through — no fetch, no decode, no re-encode.
//   'raw'    zlib(PNG) bytes we already hold.
//   'png'    PNG bytes we produced (a freshly imported PDF page).
//   'bitmap' pixels with no encoded form yet (a blank sheet we drew).

import { pageBlob, readPagePng, decodePng, encodePageSource } from './takeoff-file.js';
import { canvasLimits, fitFactor } from './canvas-limits.js';

const DEFAULT_LRU = 4;
const THUMB_WIDTH = 176;

export class PageStore {
  constructor({ lruSize = DEFAULT_LRU } = {}) {
    this.file = null;
    this.lruSize = lruSize;

    // The plan-revision image sets, as Blob slices of the opened file. This
    // app does not yet display them, but a save that quietly dropped them
    // would destroy work: on the estimator's largest job that tail is 1.42 GB
    // of scanned revision sheets, and it would be gone with no error and no
    // way back. They are carried through untouched.
    /** @type {Array<Array<Blob>>} */
    this.revisionSlices = [];

    /** @type {Array<{kind:string,data:any,width:number,height:number}>} */
    this.sources = [];
    /** @type {Map<number, ImageBitmap>} insertion order is recency order */
    this._lru = new Map();
    /** @type {Map<number, ImageBitmap>} */
    this._thumbs = new Map();
    this._pending = new Map();
    this._thumbPending = new Map();
    // Bumped whenever a page is inserted, removed or moved. A decode that
    // was already in flight when the set changed underneath it must not
    // write its result into what is now a different sheet's slot.
    this._gen = 0;
  }

  get pageCount() { return this.sources.length; }

  /** Adopt an opened project's page index. Nothing is fetched or decoded. */
  setFromProject({ file, pages, revisions = [] }) {
    this.clearCaches();
    this.file = file;
    this.sources = pages.map(entry => ({
      kind: 'slice', data: pageBlob(file, entry), width: 0, height: 0,
    }));
    this.revisionSlices = revisions.map(set => set.map(e => pageBlob(file, e)));
  }

  clearCaches() {
    for (const bmp of this._lru.values()) bmp.close?.();
    for (const bmp of this._thumbs.values()) bmp.close?.();
    this._lru.clear();
    this._thumbs.clear();
    this._pending.clear();
    this._thumbPending.clear();
  }

  addPage(source, at = -1) {
    const entry = {
      kind: source.kind, data: source.data,
      width: source.width || 0, height: source.height || 0,
    };
    if (at < 0 || at >= this.sources.length) {
      this.sources.push(entry);
      return this.sources.length - 1;
    }
    this.sources.splice(at, 0, entry);
    this._shiftCaches(at, +1);
    return at;
  }

  removePage(index) {
    if (index < 0 || index >= this.sources.length) return false;
    this.sources.splice(index, 1);
    this._lru.get(index)?.close?.();
    this._lru.delete(index);
    // Every width this sheet was cached at, not just the default one.
    for (const k of [...this._thumbs.keys()]) {
      if (thumbKeyIndex(k) === index) {
        this._thumbs.get(k)?.close?.();
        this._thumbs.delete(k);
      }
    }
    this._shiftCaches(index, -1);
    return true;
  }

  movePage(from, to) {
    if (from === to) return;
    this._gen++;
    const [entry] = this.sources.splice(from, 1);
    this.sources.splice(to, 0, entry);
    // Cheaper to drop the caches than to permute two maps correctly.
    this.clearCaches();
  }

  _shiftCaches(at, delta) {
    this._gen++;
    // Two caches, two key shapes: _lru is the page index, _thumbs is
    // `${index}:${width}`. Shifting the second as if it were a number turns
    // every key into NaN and quietly leaves the whole cache pointing at the
    // wrong sheets, which is a picture of the wrong drawing, not a crash.
    const lruMoved = [];
    for (const [k, v] of this._lru) if (k >= at) lruMoved.push([k, v]);
    for (const [k] of lruMoved) this._lru.delete(k);
    for (const [k, v] of lruMoved) this._lru.set(k + delta, v);

    const thumbMoved = [];
    for (const [k, v] of this._thumbs) {
      const i = thumbKeyIndex(k);
      if (i >= at) thumbMoved.push([i, thumbKeyWidth(k), v]);
    }
    for (const [i, w] of thumbMoved) this._thumbs.delete(`${i}:${w}`);
    for (const [i, w, v] of thumbMoved) this._thumbs.set(`${i + delta}:${w}`, v);
    this._pending.clear();
    this._thumbPending.clear();
  }

  /** PNG bytes for a page, fetched and inflated. */
  async pngBytes(index) {
    const src = this.sources[index];
    if (!src) throw new Error(`No sheet ${index + 1}`);
    if (src.kind === 'png') return src.data;
    if (src.kind === 'slice') {
      const { inflate } = await import('./zlib.js');
      return inflate(new Uint8Array(await src.data.arrayBuffer()));
    }
    if (src.kind === 'raw') {
      const { inflate } = await import('./zlib.js');
      return inflate(src.data);
    }
    // A bitmap has no encoded form until it is asked for one.
    const { part } = await encodePageSource({ kind: 'bitmap', data: src.data });
    const { inflate } = await import('./zlib.js');
    return inflate(part);
  }

  /**
   * The full-resolution page, decoded. Repeated calls for the same page while
   * one decode is in flight all await that single decode.
   */
  async getPage(index) {
    const hit = this._lru.get(index);
    if (hit) {
      this._lru.delete(index);        // re-insert to mark it most recent
      this._lru.set(index, hit);
      return hit;
    }
    const inflight = this._pending.get(index);
    if (inflight) return inflight;

    const job = this._decode(index).then(bmp => {
      this._pending.delete(index);
      if (bmp) {
        const src = this.sources[index];
        if (src) { src.width = bmp.width; src.height = bmp.height; }
        this._lru.set(index, bmp);
        this._evict(index);
      }
      return bmp;
    }).catch(err => {
      this._pending.delete(index);
      throw err;
    });
    this._pending.set(index, job);
    return job;
  }

  /** The decoded page if it happens to be resident, else null. Never decodes. */
  peekPage(index) {
    return this._lru.get(index) || null;
  }

  async _decode(index) {
    const src = this.sources[index];
    if (!src) return null;
    if (src.kind === 'bitmap') return src.data;
    const bytes = await this.pngBytes(index);

    // How big is this sheet, before anything tries to hold it? The PNG says
    // so in its IHDR, 16 bytes in — far cheaper than finding out by failing.
    const nat = pngSize(bytes);
    const limits = await canvasLimits();
    const factor = nat ? fitFactor(nat.width, nat.height, limits) : 1;
    if (!nat || factor >= 1) return decodePng(bytes);

    const w = Math.max(1, Math.floor(nat.width * factor));
    const h = Math.max(1, Math.floor(nat.height * factor));
    let small = null;
    if (limits.resizeOnDecode) {
      small = await decodePng(bytes, {
        resizeWidth: w, resizeHeight: h, resizeQuality: 'high',
      });
      // Asked for, not necessarily given. A decoder that ignored the request
      // just handed back the full-size bitmap we were trying to avoid.
      if (small.width !== w) {
        const shrunk = await shrinkBitmap(small, w, true);
        small = shrunk;
      }
    } else {
      small = await shrinkBitmap(await decodePng(bytes), w, true);
    }
    return new ReducedPage(small, nat.width, nat.height);
  }

  /**
   * A crop of one sheet, decoded straight out of the PNG at preview size.
   *
   * `zone` is [x0, y0, x1, y1] in 0..1 of the sheet, which is what a callout
   * stores in ref_zone. The crop overload of createImageBitmap decodes only
   * the rectangle asked for, so this costs about the same as a full decode
   * (~96ms on a 5400x3600 sheet, measured) and allocates 1 MB instead of 74:
   * the whole sheet is never held to take a corner out of it.
   *
   * Note the argument order — resizeWidth applies to the CROP, not the
   * sheet. Do not reach for the plain {resizeWidth} form instead: measured,
   * it is SLOWER than a full decode, because it decodes everything and then
   * resamples.
   */
  async cropRegion(index, zone, maxWidth = 480) {
    const src = this.sources[index];
    if (!src || !Array.isArray(zone) || zone.length < 4) return null;

    // A resident full-size sheet is the fast path: crop it in ~1ms rather
    // than re-reading and re-inflating megabytes we already have.
    const live = this._lru.get(index);
    const known = live || (src.width && src.height ? src : null);

    let nat = null;
    if (known) nat = { width: known.width, height: known.height };
    let bytes = null;
    if (!nat) {
      bytes = await this.pngBytes(index);
      nat = pngSize(bytes);
    }
    if (!nat) return null;

    const x0 = Math.max(0, Math.min(1, Number(zone[0]) || 0));
    const y0 = Math.max(0, Math.min(1, Number(zone[1]) || 0));
    const x1 = Math.max(0, Math.min(1, Number(zone[2]) || 0));
    const y1 = Math.max(0, Math.min(1, Number(zone[3]) || 0));
    const sx = Math.floor(Math.min(x0, x1) * nat.width);
    const sy = Math.floor(Math.min(y0, y1) * nat.height);
    const sw = Math.max(1, Math.round(Math.abs(x1 - x0) * nat.width));
    const sh = Math.max(1, Math.round(Math.abs(y1 - y0) * nat.height));
    if (sw < 2 || sh < 2) return null;          // an empty zone is no preview

    const scale = Math.min(1, maxWidth / sw);
    const opts = scale < 1
      ? { resizeWidth: Math.max(1, Math.round(sw * scale)),
          resizeHeight: Math.max(1, Math.round(sh * scale)),
          resizeQuality: 'high' }
      : undefined;

    if (live) {
      // Already decoded for the canvas — take the rectangle out of it.
      const inner = live.bitmap || live;
      const k = live.reduced ? inner.width / live.width : 1;
      return createImageBitmap(inner, Math.floor(sx * k), Math.floor(sy * k),
                               Math.max(1, Math.round(sw * k)),
                               Math.max(1, Math.round(sh * k)), opts);
    }
    if (!bytes) bytes = await this.pngBytes(index);
    const blob = new Blob([bytes], { type: 'image/png' });
    return createImageBitmap(blob, sx, sy, sw, sh, opts);
  }

  _evict(keep) {
    while (this._lru.size > this.lruSize) {
      const oldest = this._lru.keys().next().value;
      if (oldest === keep) break;
      const bmp = this._lru.get(oldest);
      this._lru.delete(oldest);
      // A bitmap still being painted this frame must not be closed under the
      // renderer, so release it on the next turn of the loop instead.
      queueMicrotask(() => bmp?.close?.());
    }
  }

  /** Page size without paying for a full decode when the source knows it. */
  async pageSize(index) {
    const src = this.sources[index];
    if (!src) return null;
    if (src.width && src.height) return { width: src.width, height: src.height };
    const bmp = await this.getPage(index);
    return bmp ? { width: bmp.width, height: bmp.height } : null;
  }

  /**
   * A small bitmap for the sheets list. Decoded once, then kept.
   *
   * Keyed by index AND width. It used to be keyed by index alone while
   * taking a width argument, so the first caller's size won: ask for 1024
   * anywhere and the 176px sheets list would be handed the 1024 one for the
   * rest of the session — 240 sheets x 3 MB pinned, and nothing evicts this
   * cache. Two callers at two sizes is exactly what a continuous view wants,
   * so the key has to carry the size.
   */
  async getThumbnail(index, width = THUMB_WIDTH) {
    const key = `${index}:${width}`;
    const hit = this._thumbs.get(key);
    if (hit) return hit;
    const inflight = this._thumbPending.get(key);
    if (inflight) return inflight;

    const gen = this._gen;
    const job = (async () => {
      const src = this.sources[index];
      if (!src) return null;
      let out;
      if (src.kind === 'bitmap') {
        out = src.data.width > width
          ? await createImageBitmap(src.data, { resizeWidth: width, resizeQuality: 'medium' })
          : src.data;
      } else {
        // resizeWidth lets the decoder downsample straight out of the PNG, so
        // the 113 MB full-size surface is never allocated at all.
        out = await decodePng(await this.pngBytes(index), {
          resizeWidth: width, resizeQuality: 'medium',
        });
      }
      // The resize options are OPTIONAL in the spec, and a browser that ignores
      // them hands back the full-size bitmap instead. That is not a cosmetic
      // difference: a 6300×4500 sheet is 113 MB, one is kept per page for the
      // life of the project, and a 240-sheet set would be 27 GB. So check what
      // actually came back rather than trusting the request.
      if (out && out.width > width * 1.5) {
        out = await shrinkBitmap(out, width, src.kind !== 'bitmap');
      }
      this._thumbPending.delete(key);
      // A sheet was inserted, removed or moved while this was decoding, so
      // `index` no longer means what it meant when the job started. Hand the
      // caller its bitmap but do not file it under a key that now points at
      // a different drawing.
      if (gen !== this._gen) { queueMicrotask(() => out?.close?.()); return null; }
      this._thumbs.set(key, out);
      return out;
    })().catch(err => {
      this._thumbPending.delete(key);
      console.warn('thumbnail decode failed for sheet', index + 1, err);
      return null;
    });

    this._thumbPending.set(key, job);
    return job;
  }

  /**
   * Warm the pages either side of the current one, so paging through a set
   * does not stall. Failures here are silent by design — a prefetch that
   * cannot run is not an error the user should ever be told about.
   */
  prefetchAround(index, radius = 1) {
    for (let d = 1; d <= radius; d++) {
      for (const i of [index - d, index + d]) {
        if (i >= 0 && i < this.sources.length && !this._lru.has(i)) {
          this.getPage(i).catch(() => {});
        }
      }
    }
  }

  /**
   * The page sources in the shape the writer wants.
   *
   * Every untouched page comes back as its original Blob slice, so a save is a
   * composition rather than a copy. That is what makes saving a 2 GB project
   * possible in a tab at all.
   */
  saveSources() {
    return this.sources.map(src => ({ kind: src.kind, data: src.data }));
  }

  /** The revision image sets, ready for the writer. Pass-through slices. */
  saveRevisionSources() {
    return this.revisionSlices.map(set => set.map(b => ({ kind: 'slice', data: b })));
  }

  /** How many revision sheets are being carried through a save. */
  revisionSheetCount() {
    return this.revisionSlices.reduce((n, s) => n + s.length, 0);
  }

  /** Rough resident pixel cost, for the status bar and for tuning lruSize. */
  residentBytes() {
    let n = 0;
    for (const b of this._lru.values()) n += b.width * b.height * 4;
    for (const b of this._thumbs.values()) n += b.width * b.height * 4;
    return n;
  }
}

/**
 * Downscale a bitmap the decoder refused to downscale for us.
 *
 * `closeSource` says whether the input is ours to release — a thumbnail we
 * just decoded is, a page the caller still owns is not.
 */
/**
 * A sheet decoded smaller than it really is.
 *
 * It reports the sheet's TRUE width and height, because the page rect and
 * every measurement in the file are in native sheet pixels. Only the pixels
 * are fewer. Drawn with an explicit destination size, it lands exactly where
 * the full-size sheet would have.
 */
export class ReducedPage {
  constructor(bitmap, width, height) {
    this.bitmap = bitmap;
    this.width = width;
    this.height = height;
    this.reduced = true;
  }

  /** The LRU closes what it evicts; the inner bitmap is what holds memory. */
  close() { this.bitmap?.close?.(); }
}

/** The page index out of a `${index}:${width}` thumbnail cache key. */
function thumbKeyIndex(key) {
  return Number(String(key).slice(0, String(key).indexOf(':')));
}

/** The width out of a `${index}:${width}` thumbnail cache key. */
function thumbKeyWidth(key) {
  return String(key).slice(String(key).indexOf(':') + 1);
}

/** Width and height out of a PNG's IHDR, without decoding a single pixel. */
export function pngSize(bytes) {
  if (!bytes || bytes.length < 24) return null;
  // 8-byte signature, then the IHDR chunk: length, type, then w and h.
  if (bytes[0] !== 0x89 || bytes[1] !== 0x50) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = dv.getUint32(16);
  const height = dv.getUint32(20);
  if (!width || !height) return null;
  return { width, height };
}

async function shrinkBitmap(bmp, width, closeSource) {
  const scale = width / bmp.width;
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  let canvas;
  if (typeof OffscreenCanvas !== 'undefined') canvas = new OffscreenCanvas(w, h);
  else {
    canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
  }
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'medium';
  ctx.drawImage(bmp, 0, 0, w, h);
  const small = await createImageBitmap(canvas);
  if (closeSource) bmp.close?.();
  return small;
}
