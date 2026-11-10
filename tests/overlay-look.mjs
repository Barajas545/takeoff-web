// THE SAVED OVERLAY ON ARRIVAL -- the desktop's 3.06 look and restore rule, on the web.
//
// Arriving on a sheet whose metadata.page_overlays[str(page)] holds a record
// it can show puts that overlay up -- another sheet at its saved offset, a
// revision page at its saved offset, or a picture of this sheet at its own
// box -- in its saved tint, fade and look; a record that names nothing leaves
// NOTHING up, and the last sheet's overlay is always taken down first.
// Looking writes nothing.
//
//  1. THE LOOK, pixel for pixel: js/core/overlay-look.js overlayRgba against
//     the desktop's own _overlay_rgba (lifted by text, run by
//     tests/overlay-python-truth.py) over grey ramps, a transparent cut-out,
//     a grey-paper photo, saturated colours, L / LA / palette pictures,
//     across mode x invert x cutoff -- every byte and every cut-off it chose
//     (Auto among them); in place too, as the app builds it.
//  2. A RECORD'S LOOK: lookOfRecord against _apply_overlay_look +
//     set_overlay_look: 3.05 records (no cut-off: 255), pictures (Auto), a
//     null / bool / string / float / out-of-range cut-off.
//  3. THE ARRIVAL: overlaySourceOf + overlayRgba + overlayRect against the
//     desktop's _restore_overlay_for_page, run whole on stand-ins, on a job of
//     sheets of different sizes, a revision set and pictures: what goes up,
//     where, in what tint, fade and look, the texture, the fade label -- and
//     for every record that names nothing, nothing. Before 3.08 the desktop's
//     revision branch left the LAST sheet's overlay up ('return # revision
//     gone'); 3.08 takes it down (R3-12 c), as the web always has -- so a
//     record naming a revision that is gone is 'nothing' on both, and the
//     old residual coming back is a FAIL.
//  4. SIZES: a 5400x3600 sheet over a 2592x1728 sheet, a 3600x2400 revision
//     page, a picture box -- page pixels, never stretched to the sheet.
//  5. The small ones: _cad_image_rect, _pts_pair, overlay_picture (found by
//     id; the FIRST with the id), the sheet labels, 'Picture N', reading a
//     picture's base64, the fade label int(alpha * 100).
//  6. overlay-wrong-sheet on the web's own terms: every record of a file
//     that names nothing, and the records stay as they were.
//  7. THE STATE MACHINE (js/core/saved-overlay.js) with a REAL Project:
//     arrival, a turn (down BEFORE anything is restored; the invalid-record
//     sheet after an overlay sheet shows nothing), a save's 'keep', Hide for
//     the visit, the paint gate on another version and its one sentence,
//     Compare, Flash, a build overtaken by a turn, a failed read asked
//     again by the sheet's own card (an unreadable picture not), an
//     unreadable picture said once, a picture found by id on every frame,
//     a job reset -- the
//     mask closed every time it comes down -- and NOTHING WRITTEN: the
//     project's change count, its dirty flag, its metadata and its
//     annotations exactly as they were, in Edit Mode and View Only alike.
//  8. The app's wiring, by text: goToPage takes the last overlay down before
//     its first wait and before any return; the frame, Compare, Escape and
//     the strip; and no line of it writes a record or marks the project.
//     Then RUN, lifted by text onto stand-ins: how each source is read (a
//     semi-transparent or colour-tagged picture as PIL reads it, a plain
//     sheet by the browser's decode, a reduced decode's Auto off the full
//     rows; a decode the page store holds read FIRST, before any wait, and
//     kept when its bytes cannot be read or the store closes it; what is
//     learnt of a sheet asked once), every decode made closed the moment
//     its pixels are read, the
//     strip's words, the opening's sentence waiting for the opening and
//     bound to its visit; the strip's CSS (44 px, above the foot bar).
//  8b. The renderer's pass on a recording canvas: Lines tinted source-in on
//     a scratch at the box, at the fade; Original untinted; the scratch let
//     go when nothing needs it, kept through a Flash.
//  9. Live: the desktop source as it is now, which also fails a stale
//     snapshot.
// 10. A PNG read as PIL reads it (pngRgba / pngAutoCutoff / pngPlain): the
//     desktop's mask and cut-off for semi-transparent, grey-alpha, palette,
//     colour-keyed, ICC- and gamma-tagged, 2/4/16-bit PNGs, as a sheet and
//     as a picture.
//
// Portable: the committed tests/data/overlay-truth.json; the live part needs
// PTT_DESKTOP_SRC (or tests/config.local.mjs) and SKIPS without it.
// Run: node tests/overlay-look.mjs
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA, DESKTOP_SRC, haveDesktopSource } from './config.mjs';
import {
  overlayRgba, autoCutoff, lookOfRecord, cadImageRect, ptsPair, overlayPicture,
  overlayEntryLabel, pictureName, pictureBytes, fadePercent, overlaySourceOf, overlayRect,
  overlayColor, overlayAlpha, pilLuma, tintCss, KEPT_NOTE_UNREADABLE, OVERLAY_WHITE_PAPER,
  OVERLAY_PAPER_MARGIN, OVERLAY_ORIGINAL_KNEE, pngInfo, pngHeadInfo, pngPlain, pngRgba, pngAutoCutoff,
} from '../js/core/overlay-look.js';
import {
  SavedOverlay, FLASH_MS, VERSION_NOTE, HIDDEN_NOTE, COMPARE_NOTE, overlayWords,
} from '../js/core/saved-overlay.js';
import { Project } from '../js/core/project.js';
import { remapPageIndices, deleteMapper, insertMapper } from '../js/core/revisions.js';
import { Renderer } from '../js/render/renderer.js';
import { createHash } from 'node:crypto';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const SNAP = JSON.parse(await readFile(new URL('overlay-truth.json', DATA), 'utf8'));

let fails = 0;
let checks = 0;
const log = s => console.log(s);
function ok(label, cond, detail) {
  checks += 1;
  if (cond) return true;
  fails += 1;
  log(`FAIL ${label}${detail === undefined ? '' : `\n  ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`}`);
  return false;
}
function eq(label, got, want) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(want);
  return ok(label, a === b, `got  ${a && a.length > 400 ? `${a.slice(0, 400)}...` : a}\n  want ${b && b.length > 400 ? `${b.slice(0, 400)}...` : b}`);
}

const bytes = s => new Uint8Array(Buffer.from(s, 'base64'));
const imageOf = p => ({ data: new Uint8ClampedArray(bytes(p.rgba)), width: p.w, height: p.h });
const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const firstDiff = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) return `byte ${i}: ${a[i]} vs ${b[i]}`;
  return '';
};

// ═══ the differential, against a truth (the snapshot, or live) ═══════════
function checkLook(T, tag) {
  log(`\n-- 1. the look, pixel for pixel (${tag}) --`);
  let rows = 0;
  let bad = 0;
  for (const row of T.look) {
    const src = imageOf(T.images[row.img]);
    const out = overlayRgba(src, row.mode, row.invert, row.cutoff);
    const want = bytes(row.out);
    rows += 1;
    const same = sameBytes(out.data, want) && out.cutoff === row.used;
    if (!same) {
      bad += 1;
      if (bad <= 5) {
        ok(`${row.img} ${row.mode} invert=${row.invert} cutoff=${row.cutoff}: the desktop's pixels and its cut-off ${row.used}`,
          false, `cutoff ${out.cutoff}; ${firstDiff(out.data, want)}`);
      }
    }
    // ...and built in place, as the app builds a sheet's
    const inPlace = imageOf(T.images[row.img]);
    const again = overlayRgba(inPlace, row.mode, row.invert, row.cutoff, inPlace.data);
    if (!(sameBytes(again.data, want) && again.data === inPlace.data)) {
      bad += 1;
      ok(`${row.img} ${row.mode} ${row.invert} ${row.cutoff}: the same built in place`, false);
    }
  }
  ok(`every pixel and every chosen cut-off of ${rows} looks equal the desktop's _overlay_rgba (${bad} differ)`, bad === 0);
  const autos = T.look.filter(r => r.cutoff === null).map(r => r.used);
  ok('Auto chose a cut-off other than 255 somewhere (the fixture reaches the grey-paper rule)',
    autos.some(c => c !== 255) && autos.includes(255), autos);
}

function checkRecords(T, tag) {
  log(`\n-- 2. a record's look (${tag}) --`);
  for (const r of T.records) {
    const got = lookOfRecord(r.record);
    eq(`look of ${JSON.stringify(r.record)}`, [got.mode, got.invert, got.cutoff], r.look);
  }
}

// What the desktop did on one arrival, in a word.
function outcome(a) {
  if (a.raised) return 'raised';
  if (a.up && a.built === 0 && a.before !== null && a.log.length === 0) return 'residual';
  if (a.up && a.built === 1) return 'shown';
  if (!a.up) return 'nothing';
  return 'other';
}
// Declared divergences: records no build of 3.06 writes, where the web does
// better or cannot tell. Each is asserted for what the desktop does, so a
// desktop change shows.
const DECLARED = {
  'revision page True': 'the desktop takes True as page 1 (Python indexes with a bool); a bool names no page on the web',
  'sheet 2.0': 'the desktop refuses a float overlay_page; JSON hands JavaScript 2.0 as 2, so the web shows sheet 2',
  'revision page 1.0': 'the desktop raises on a float rev_page (leaving the last sheet\'s up); JSON hands JavaScript 1.0 as 1, '
    + 'so the web shows that page',
};
// What a browser can decode, as far as node can tell: the fixture's
// pictures are PNGs, and createImageBitmap refuses what is not an image.
const isPng = b => !!b && b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;

function sourcePixels(T, a, src) {
  if (src.kind === 'sheet') return T.sheets[src.page];
  if (src.kind === 'revision') return T.revs[src.revPage];
  return T.pictures[src.imageId];
}

function checkArrivals(T, tag) {
  log(`\n-- 3. the arrival (${tag}) --`);
  const counts = {};
  for (const a of T.arrive) {
    const ctx = { pageCount: T.sheets.length, revisions: T.web_revisions,
      pictures: T.annotations[String(a.page)] || [] };
    const before = JSON.stringify(a.record);
    const src = overlaySourceOf(a.record, ctx);
    ok(`${a.name}: the record is read, never changed`, JSON.stringify(a.record) === before);
    const what = outcome(a);
    counts[what] = (counts[what] || 0) + 1;
    if (DECLARED[a.name]) {
      if (a.name === 'revision page True') {
        ok(`DECLARED ${a.name}: the desktop shows ${JSON.stringify(a.up && a.up.source)}; the web shows nothing`,
          what === 'shown' && a.up.source.rev_page === true && src === null);
      } else if (a.name === 'revision page 1.0') {
        ok(`DECLARED ${a.name}: the desktop raises ${a.raised} with the last sheet's overlay still up; the web shows page 1`,
          what === 'raised' && a.up && a.up.page === a.before && src && src.kind === 'revision' && src.revPage === 1);
      } else {
        ok(`DECLARED ${a.name}: the desktop takes the last sheet's down and shows nothing; the web shows sheet 2`,
          what === 'nothing' && a.log.length === 1 && src && src.kind === 'sheet' && src.page === 2);
      }
      continue;
    }
    if (what === 'residual') {
      // 3.08 (R3-12 c) takes the last sheet's overlay down here, as the web
      // always has (saved-overlay.js turn()): a residual is the old bug back.
      ok(`${a.name}: the desktop leaves the last sheet's overlay up again (its revision branch's 'return', fixed in 3.08) `
        + '-- the web shows nothing here (the caller has taken the last one down first)', false,
      src && src.kind);
      continue;
    }
    if (what === 'raised') {
      ok(`${a.name}: the desktop raises ${a.raised} (a record no build of 3.06 writes); the web shows nothing`, src === null);
      continue;
    }
    if (what === 'nothing') {
      // A picture whose pixels cannot be read passes the record's rule and
      // fails at its decode (main.js overlayPixels), where it is said.
      const unreadable = !!src && src.kind === 'picture' && !isPng(pictureBytes(src.entity.img_b64));
      ok(`${a.name}: nothing up, as on the desktop (which took the last sheet's down: ${JSON.stringify(a.log)})`
        + (unreadable ? ' -- the picture fails at its decode' : ''), src === null || unreadable, src && src.kind);
      continue;
    }
    if (!ok(`${a.name}: an overlay is up, as on the desktop`, what === 'shown' && !!src, what)) continue;
    const up = a.up;
    const desk = up.source && up.source.image_id ? { kind: 'picture', id: up.source.image_id }
      : up.source && up.source.rev_id ? { kind: 'revision', id: up.source.rev_id, rp: up.source.rev_page }
        : { kind: 'sheet', page: up.page };
    const web = src.kind === 'picture' ? { kind: 'picture', id: src.imageId }
      : src.kind === 'revision' ? { kind: 'revision', id: src.revId, rp: src.revPage }
        : { kind: 'sheet', page: src.page };
    eq(`${a.name}: the same source`, web, desk);
    eq(`${a.name}: the same look`, [src.look.mode, src.look.invert, src.look.cutoff], up.look);
    eq(`${a.name}: the same tint`, src.color, up.color);
    eq(`${a.name}: the same fade`, src.alpha, up.alpha);
    eq(`${a.name}: the fade said as the desktop's label says it`, `${fadePercent(src.alphaSaved)}%`, up.label);
    const px = sourcePixels(T, a, src);
    const rect = overlayRect(src, [px.w, px.h], ctx.pictures);
    eq(`${a.name}: drawn at the desktop's overlay_rect (page px)`, rect, up.rect);
    const out = overlayRgba(imageOf(px), src.look.mode, src.look.invert, src.look.cutoff);
    ok(`${a.name}: the texture, byte for byte, and its cut-off ${up.used}`,
      sameBytes(out.data, bytes(a.texture)) && out.cutoff === up.used,
      `cutoff ${out.cutoff}; ${firstDiff(out.data, bytes(a.texture))}`);
  }
  log(`   (desktop outcomes: ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')})`);
  ok('the fixture reaches every outcome: shown, nothing and a raise; the desktop no longer leaves the last sheet\'s '
    + 'overlay up', counts.shown >= 9 && counts.nothing >= 20 && !counts.residual && counts.raised >= 1, counts);
}

function checkSizes(T, tag) {
  log(`\n-- 4. sizes: page pixels (${tag}) --`);
  for (const s of T.sizes) {
    const pics = [{ subtype: 'cad', etype: 'image', id: 'bigpic01', pts: s.pts, img_b64: 'AAAA', as_overlay: true }];
    const ctx = { pageCount: 2, revisions: [{ id: 'rv-big', pageCount: 1, _setIndex: 0 }], pictures: s.page === 0 ? pics : [] };
    const src = overlaySourceOf(s.record, ctx);
    const size = !src ? null : src.kind === 'sheet' ? s.sizes[src.page] : src.kind === 'revision' ? s.rev : null;
    eq(`${s.name}: where the desktop draws it`, overlayRect(src, size, ctx.pictures), s.rect);
  }
  const big = T.sizes[0];
  ok('a 5400 px sheet over a 2592 px sheet is drawn 5400 page px wide from its offset -- not the sheet\'s width',
    big.rect[2] - big.rect[0] === 5400 && big.rect[3] - big.rect[1] === 3600 && big.rect[0] === -120.5);
}

function checkSmall(T, tag) {
  log(`\n-- 5. the small ones (${tag}) --`);
  for (const r of T.small.rects) eq(`_cad_image_rect(${JSON.stringify(r.ent)})`, cadImageRect(r.ent), r.rect);
  for (const r of T.small.pairs) eq(`_pts_pair(${JSON.stringify(r.raw)})`, ptsPair(r.raw), r.pair);
  for (const r of T.small.pictures) {
    const e = overlayPicture(T.annotations[String(r.page)] || [], r.eid);
    eq(`overlay_picture(${r.eid}, page ${r.page})`, e ? e.pts : null, r.found);
  }
  for (const r of T.small.labels) {
    eq(`_overlay_entry_label over ${JSON.stringify(r.md)}`, [0, 1, 2, 3].map(i => overlayEntryLabel(r.md, i)), r.labels);
  }
  for (const r of T.small.names) {
    const list = T.annotations[String(r.page)] || [];
    eq(`_picture_name on page ${r.page}`, Object.fromEntries(Object.keys(r.names).map(k => [k, pictureName(list, k)])), r.names);
  }
  for (const r of T.small.b64) {
    const got = pictureBytes(r.in);
    if (r.error) ok(`b64decode(${JSON.stringify(r.in.slice(0, 16))}) fails, as the desktop's does`, got === null);
    else eq(`b64decode(${JSON.stringify(r.in.slice(0, 16))}...)`, got ? Buffer.from(got).toString('base64') : null, r.bytes);
  }
  for (const [v, want] of T.small.fade) {
    if (v === null) continue;
    eq(`the fade label for a fader at ${v}`, fadePercent(v / 100), want);
  }
  for (const [, want] of T.small.fade.filter(f => f[0] === null)) void want;
  const extra = T.small.fade.filter(f => f[0] === null).map(f => f[1]);
  eq('the fade label for 0.05, 0.29, 0.57, 1.0, 0.333', [0.05, 0.29, 0.57, 1.0, 0.333].map(fadePercent), extra);
}

// ═══ 10. reading a PNG as PIL reads it ════════════════════════════════════
// The source's pixels are what the desktop's PIL decodes -- raw samples, no
// colour management, no premultiplied alpha, 16 bits cut to 8 -- and the web
// reads them itself (pngRgba) wherever a browser's decode would differ. Every
// PNG of the truth, as a sheet (Image.open) and as a picture (_picture_pil):
// the RGBA, every mask's sha1 and every cut-off; Auto read off the full-size
// rows (pngAutoCutoff, what an iPad's reduced decode asks); and which PNGs a
// browser's own decode reads exactly (pngPlain).
const sha1 = a => createHash('sha1').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex');
// Read here as the browser reads them, not as PIL does: declared.
const DECODE_DECLINED = {
  '16-bit grey with a colour key|picture': 'a picture\'s key on a 16-bit grey PNG: PIL compares it with what it '
    + 'unpacked -- left to the browser\'s decode (no desktop writer makes one)',
};
const PLAIN = ['grey on paper 236 (plain)', 'RGB on paper 240 (plain)', 'a palette (plain)',
  'RGB filtered every way (plain)'];

async function checkDecode(T, tag) {
  log(`\n-- 10. a PNG read as PIL reads it (${tag}) --`);
  let rows = 0;
  let bad = 0;
  for (const c of T.decode) {
    const png = bytes(c.png);
    const info = pngInfo(png);
    if (!ok(`${c.name}: its chunks are read`, !!info)) continue;
    for (const kind of ['sheet', 'picture']) {
      const want = c.kinds[kind];
      const colourKey = kind === 'picture';
      const px = await pngRgba(png, { colourKey, info });
      const declined = DECODE_DECLINED[`${c.name}|${kind}`];
      if (declined) {
        ok(`DECLARED ${c.name} (${kind}): ${declined}`, px === null && !want.unreadable);
        continue;
      }
      if (!ok(`${c.name} (${kind}): read here`, !!px && px.width === info.width && px.height === info.height)) continue;
      if (kind === 'picture') {
        eq(`${c.name} (picture): the RGBA _picture_pil reads (sha1)`, sha1(px.data), want.rgba);
      }
      for (const [mode, inv, cut, used, hash] of want.looks) {
        rows += 1;
        const copy = { data: new Uint8ClampedArray(px.data), width: px.width, height: px.height };
        const o = overlayRgba(copy, mode, inv, cut, copy.data);
        if (!(o.cutoff === used && sha1(o.data) === hash)) {
          bad += 1;
          ok(`${c.name} (${kind}, ${want.mode}) ${mode} invert=${inv} cutoff=${cut}: the desktop's mask and its cut-off ${used}`,
            false, `cutoff ${o.cutoff}`);
        }
        if (cut === null) {
          const full = await pngAutoCutoff(png, { colourKey, invert: inv, info });
          if (full !== used) {
            bad += 1;
            ok(`${c.name} (${kind}) invert=${inv}: Auto read off the full-size rows is the desktop's ${used}`, false, full);
          }
        }
      }
    }
  }
  ok(`every mask, cut-off and full-size Auto of ${rows} looks over ${T.decode.length} PNGs equals the desktop's (${bad} differ)`,
    bad === 0);
  eq('the PNGs a browser\'s own decode reads exactly: 8 bits, opaque, untagged (pngPlain)',
    T.decode.filter(c => pngPlain(pngInfo(bytes(c.png)))).map(c => c.name), PLAIN);
  const auto = T.decode.find(c => c.name === 'alpha 128 on paper 248');
  ok('a semi-transparent picture on white paper is white paper to Auto (255), as on the desktop',
    auto && auto.kinds.picture.looks[0][3] === 255);
  // ...and the reader declines what it cannot read exactly, never a guess
  const one = bytes(T.decode[0].png);
  const interlaced = new Uint8Array(one);
  interlaced[28] = 1;                       // IHDR's interlace byte (no CRC check here)
  ok('an interlaced PNG is declined (left to the browser\'s decode)', (await pngRgba(interlaced)) === null
    && (await pngAutoCutoff(interlaced)) === null);
  ok('a PNG cut short is declined', (await pngRgba(one.subarray(0, one.length - 40))) === null);
  ok('bytes that are not a PNG are declined', pngInfo(new Uint8Array(64).fill(7)) === null
    && (await pngRgba(new Uint8Array(64).fill(7))) === null);
  // The head alone (a prefix of the PNG, as page-store pngHead reads it)
  // answers pngPlain as the whole PNG does -- and a prefix that stops before
  // the pixels answers nothing, never 'plain'.
  let heads = 0;
  for (const c of T.decode) {
    const png = bytes(c.png);
    const firstIdat = (() => {
      for (let o = 8; o + 8 <= png.length;) {
        const len = new DataView(png.buffer, png.byteOffset + o, 4).getUint32(0);
        if (String.fromCharCode(...png.subarray(o + 4, o + 8)) === 'IDAT') return o;
        o += 12 + len;
      }
      return -1;
    })();
    const h = pngHeadInfo(png.subarray(0, firstIdat + 8));
    if (h && pngPlain(h) === pngPlain(pngInfo(png)) && pngHeadInfo(png.subarray(0, firstIdat - 1)) === null) heads += 1;
  }
  ok(`a PNG's head answers "plain" as the whole PNG does, and a head cut short answers nothing (${heads}/${T.decode.length})`,
    heads === T.decode.length);
  // ...and the page store reads that head from a prefix of a sheet's blob
  const { PageStore } = await import('../js/core/page-store.js');
  const { deflate } = await import('../js/core/zlib.js');
  const p3 = bytes(T.decode.find(c => c.name === 'a photo tagged Display P3, imported').png);
  const plain = bytes(T.decode.find(c => c.name === 'RGB on paper 240 (plain)').png);
  const store = new PageStore();
  store.sources = [{ kind: 'raw', data: await deflate(p3) }, { kind: 'slice', data: new Blob([await deflate(plain)]) },
    { kind: 'png', data: plain }, { kind: 'bitmap', data: {} }];
  store.revisionSlices = [[new Blob([await deflate(p3)])]];
  const read = async i => pngHeadInfo(await store.pngHead(i));
  eq('pngHead: a raw sheet, a slice, PNG bytes, a drawn sheet -- plain or not, or cannot tell',
    [pngPlain(await read(0)), pngPlain(await read(1)), pngPlain(await read(2)), await store.pngHead(3)],
    [false, true, true, null]);
  eq('...and a revision sheet\'s', pngPlain(pngHeadInfo(await store.revisionPngHead(0, 0))), false);
}

const SNAP_LIFTED = SNAP.lifted;
log(`(snapshot: PIL ${SNAP.pil}; lifted ${SNAP_LIFTED.module.length} module names, `
  + `${SNAP_LIFTED.gl.length} GLPageWidget and ${SNAP_LIFTED.win.length} PDFCacheViewer methods, the fade '${SNAP_LIFTED.fade}')`);
checkLook(SNAP, 'snapshot');
checkRecords(SNAP, 'snapshot');
checkArrivals(SNAP, 'snapshot');
checkSizes(SNAP, 'snapshot');
checkSmall(SNAP, 'snapshot');
await checkDecode(SNAP, 'snapshot');

// The luma, beyond the fixture: every grey, and the colours where the old
// (r*299 + g*587 + b*114) / 1000 is one off.
{
  let grey = true;
  for (let v = 0; v < 256; v++) if (pilLuma(v, v, v) !== v) grey = false;
  ok('PIL\'s L of every grey is the grey', grey);
  eq('the constants the look reads', [OVERLAY_WHITE_PAPER, OVERLAY_PAPER_MARGIN, OVERLAY_ORIGINAL_KNEE], [248, 12, 16]);
  eq('Auto with nothing light: 255; white paper: 255; grey paper 205: 193; a tie goes to the lighter',
    [autoCutoff(new Uint8Array([3, 40, 90])), autoCutoff(new Uint8Array([250, 250, 3])),
      autoCutoff(new Uint8Array([205, 205, 205, 0])), autoCutoff(new Uint8Array([150, 160, 150, 160]))],
    [255, 255, 193, 148]);
  eq('...and what is transparent is not paper', autoCutoff(new Uint8Array([205, 250, 250]), new Uint8Array([255, 0, 0])), 193);
  eq('a tint as canvas takes it, kept to 0..1 as GL keeps it', [tintCss([1, 0.3, 0.3]), tintCss([2, -1, 0.5])],
    ['rgb(255, 77, 77)', 'rgb(255, 0, 128)']);
}

// ═══ 6. overlay-wrong-sheet on the web's own terms ═══════════════════════
log('\n-- 6. a record that names nothing leaves nothing up, and stays as it was --');
{
  const revisions = [
    { id: 'rv-a', pageCount: 2, _setIndex: 0 },
    { id: 'rv-none', pageCount: 0, _setIndex: 1 },            // a set that is unreadable / has no pages
    { id: 'rev-unnamed-2', pageCount: 3, _setIndex: 2, _orphanSet: true },
  ];
  const pictures = [
    { subtype: 'cad', etype: 'image', id: 'p-flag', pts: [[0, 0], [9, 9]], img_b64: 'iVBORw0K', as_overlay: true },
    { subtype: 'cad', etype: 'image', id: 'p-plain', pts: [[0, 0], [9, 9]], img_b64: 'iVBORw0K' },
    { subtype: 'cad', etype: 'image', id: 'p-empty', pts: [[0, 0], [9, 9]], img_b64: '', as_overlay: true },
    { subtype: 'cad', etype: 'image', id: 'p-num', pts: [[0, 0], [9, 9]], img_b64: 5, as_overlay: true },
  ];
  const ctx = { pageCount: 4, revisions, pictures };
  const none = [
    ['overlay_page -1', { overlay_page: -1, offset: [0, 0], color: [1, 0.3, 0.3], alpha: 0.5 }],
    ['overlay_page true', { overlay_page: true }],
    ['overlay_page false', { overlay_page: false }],
    ['overlay_page 99', { overlay_page: 99 }],
    ['overlay_page 4 (one past the last sheet)', { overlay_page: 4 }],
    ["overlay_page '3'", { overlay_page: '3' }],
    ['overlay_page 1.5', { overlay_page: 1.5 }],
    ['overlay_page null', { overlay_page: null }],
    ['a rev_id not among the revisions', { rev_id: 'gone', rev_page: 0 }],
    ['a revision with no pages in this file', { rev_id: 'rv-none', rev_page: 0 }],
    ['a set with no record (never the desktop\'s)', { rev_id: 'rev-unnamed-2', rev_page: 0 }],
    ['rev_page outside the set', { rev_id: 'rv-a', rev_page: 2 }],
    ['rev_page -1', { rev_id: 'rv-a', rev_page: -1 }],
    ['rev_page missing', { rev_id: 'rv-a' }],
    ['rev_page true', { rev_id: 'rv-a', rev_page: true }],
    ["rev_page '0'", { rev_id: 'rv-a', rev_page: '0' }],
    ['rev_id 5 (a number)', { rev_id: 5, rev_page: 0 }],
    ["rev_id ''", { rev_id: '', rev_page: 0 }],
    ['image_id of a picture that is gone', { image_id: 'missing' }],
    ['image_id of a picture shown as a picture again', { image_id: 'p-plain' }],
    ['image_id of a picture with no pixels', { image_id: 'p-empty' }],
    ['image_id of a picture whose pixels are not text', { image_id: 'p-num' }],
    ['image_id a list', { image_id: ['p-flag'] }],
    ['an empty record', {}],
    ['no record', undefined],
    ['null', null],
    ['a list', [1, 2]],
    ['a string', 'overlay'],
  ];
  for (const [name, rec] of none) {
    const was = JSON.stringify(rec);
    eq(`${name}: nothing`, overlaySourceOf(rec, ctx), null);
    ok(`${name}: the record stays as it was`, JSON.stringify(rec) === was);
  }
  // Two records of one id (a corrupt file): the desktop parks the one whose
  // drawings were lost out of its revisions and finds the other; so does the
  // web. A revision with no id is '' on the web -- and '' names none.
  const twins = { pageCount: 4, pictures, revisions: [
    { id: 'dup', pageCount: 0, _setIndex: 0 }, { id: 'dup', pageCount: 2, _setIndex: 1 },
    { id: '', pageCount: 1, _setIndex: 2 }, { id: '5', pageCount: 1, _setIndex: 3 }] };
  const dup = overlaySourceOf({ rev_id: 'dup', rev_page: 1 }, twins);
  eq('two revisions of one id: the one with drawings, as the desktop finds it', dup && [dup.kind, dup.set, dup.revPage], ['revision', 1, 1]);
  eq("rev_id '' names no revision, not even one with no id", overlaySourceOf({ rev_id: '', rev_page: 0 }, twins), null);
  eq("rev_id 5 is not the revision '5' (the desktop compares them as they are)", overlaySourceOf({ rev_id: 5, rev_page: 0 }, twins), null);
  const some = overlaySourceOf({ rev_id: 'rv-a', rev_page: 1, offset: [2, 3] }, ctx);
  eq('a revision page inside the set: up, its set index for the page store',
    some && [some.kind, some.revId, some.revPage, some.set, some.offset], ['revision', 'rv-a', 1, 0, [2, 3]]);
  const pic = overlaySourceOf({ image_id: 'p-flag', offset: [50, 50] }, ctx);
  eq('a picture: up at its own box (a saved offset is not its place)', pic && [pic.kind, pic.offset], ['picture', [0, 0]]);
  // ...and a sheet deleted or inserted moves each record with its sheet, and
  // the sheet a record compares against only when it names one: a record
  // that named nothing must not come out of the re-key naming a real sheet
  // (R8-RS-5; the desktop's int() makes true sheet 1 and '3' sheet 3 --
  // reported for 3.08).
  const recs = () => ({
    0: { overlay_page: 3, alpha: 0.5 },
    2: { overlay_page: true, alpha: 0.5 },
    3: { overlay_page: '3', alpha: 0.5 },
    4: { overlay_page: 2.5 },
    5: { overlay_page: null },
    6: { overlay_page: 1 },
    7: { overlay_page: -1 },
    8: { image_id: 'p-flag' },
    9: { rev_id: 'rv-a', rev_page: 1 },
  });
  const md = { page_overlays: recs() };
  remapPageIndices(md, {}, deleteMapper(1));
  eq('sheet X1.1 deleted: whole numbers move (3 -> 2), the record comparing against X1.1 goes, '
    + 'and true / \'3\' / 2.5 / null stay as they were with their sheets',
  md.page_overlays, {
    0: { overlay_page: 2, alpha: 0.5 }, 1: { overlay_page: true, alpha: 0.5 }, 2: { overlay_page: '3', alpha: 0.5 },
    3: { overlay_page: 2.5 }, 4: { overlay_page: null }, 6: { overlay_page: -1 }, 7: { image_id: 'p-flag' },
    8: { rev_id: 'rv-a', rev_page: 1 },
  });
  const after = Object.values(md.page_overlays).map(r => overlaySourceOf(r, { pageCount: 9, revisions, pictures }))
    .map(s => s && s.kind);
  eq('...so after the delete, as before it, only the records that named something show anything',
    after, ['sheet', null, null, null, null, null, 'picture', 'revision']);
  const md2 = { page_overlays: recs() };
  remapPageIndices(md2, {}, insertMapper(0, 2));
  eq('two sheets inserted at the front: the same',
    [md2.page_overlays[2], md2.page_overlays[4], md2.page_overlays[5], md2.page_overlays[8]],
    [{ overlay_page: 5, alpha: 0.5 }, { overlay_page: true, alpha: 0.5 }, { overlay_page: '3', alpha: 0.5 },
      { overlay_page: 3 }]);
  eq('defaults: the desktop\'s tint and fade', [overlayColor({}), overlayAlpha({})], [[1, 0.3, 0.3], 0.5]);
  eq('a fade kept to 0..1 as set_overlay_alpha keeps it', [overlayAlpha({ alpha: 1.7 }), overlayAlpha({ alpha: -1 })], [1, 0]);
}

// ═══ 7. the state machine, with a REAL Project ═══════════════════════════
log('\n-- 7. arrival, turns, Hide, versions, Compare, Flash: and nothing written --');

const PNG1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
function job() {
  const pic = (id, pts, flag = true) => {
    const e = { subtype: 'cad', etype: 'image', id, pts, color: [1, 1, 1, 1], width: 1, layer: '0',
      group: '', visible: true, img_b64: PNG1, aspect: 1.5 };
    if (flag) e.as_overlay = true;
    return e;
  };
  const p = new Project();
  p.loadFrom({
    metadata: {
      project_name: 'Overlay R8', dpi: 150, pixels_per_foot: 37.5,
      page_labels: ['X1.0', 'X1.1', 'X1.2', 'X1.3', 'X1.4', 'X1.5'],
      page_names: { 1: 'Ground' },
      page_overlays: {
        1: { overlay_page: 0, offset: [12.5, -3], color: [0.2, 0.4, 1], alpha: 0.65,
          mode: 'lines', invert: false, cutoff: 255, zz_unknown: { kept: [1] } },
        2: { overlay_page: -1, offset: [0, 0], color: [1, 0.3, 0.3], alpha: 0.5 },
        4: { rev_id: 'rv-1', rev_page: 0, offset: [4, 4], color: [0, 0.8, 0.3], alpha: 0.5 },
        5: { image_id: 'pic00005', color: [1, 0.3, 0.3], alpha: 0.8, matched: false,
          home: [[10, 20], [110, 90]], mode: 'original', invert: true, cutoff: 200 },
      },
      revisions: [{ id: 'rv-1', date: '11/01/2026', description: 'Reissue', notes: '', source: '',
        page_labels: ['X1.4'], match: { 4: 0 }, extra: {} }],
    },
    annotations: { 5: [pic('pic00005', [[110, 90], [10, 20]]), pic('pic00006', [[0, 0], [5, 5]], false)] },
    measurements: { 1: [{ type: 'area', name: 'Slab', label: 'Slab', value: 48,
      points: [[100, 100], [900, 100], [900, 900]], visible: true }] },
    pageCount: 6,
    revisionCounts: [1],
  });
  p.markSaved();
  return p;
}

function harness(project) {
  const st = {
    sheetUp: -1, onVersion: false, comparing: false, said: [], strips: [], draws: 0,
    surfacesMade: 0, surfacesClosed: 0, released: 0, asked: [], timers: new Map(), nextTimer: 1,
    hold: null, failPicture: false, failedAsks: 0, retired: 0, events: [],
  };
  const host = {
    record: page => (project.metadata.page_overlays || {})[String(page)],
    context: page => ({ pageCount: project.pageCount, revisions: project.metadata.revisions,
      pictures: project.annotations[String(page)] || [] }),
    metadata: () => project.metadata,
    sheetUp: page => st.sheetUp === page,
    onVersion: () => st.onVersion,
    comparing: () => st.comparing,
    pixels: async src => {
      st.asked.push(src.kind === 'sheet' ? `sheet ${src.page}` : src.kind === 'revision'
        ? `revision ${src.revId}/${src.revPage}` : `picture ${src.imageId}`);
      if (st.hold) await st.hold.promise;
      if (src.kind === 'picture' && st.failPicture) { st.failedAsks += 1; throw new Error('decode failed'); }
      const w = src.kind === 'sheet' ? 2592 + src.page : 5400;
      return { img: { width: w, height: 1728, data: new Uint8ClampedArray(4).fill(255) }, owned: true };
    },
    surface: async (px, look, free) => {
      if (st.failSurface) throw new Error('could not read it');
      // its pixels are read, then the decode may go, then the mask is made
      st.events.push('read');
      free?.();
      st.events.push('mask');
      st.surfacesMade += 1;
      const n = st.surfacesMade;
      return { image: { n, look }, width: px.img.width, height: px.img.height, cutoff: look.cutoff ?? 255,
        close() { st.surfacesClosed += 1; } };
    },
    revisionName: src => `Reissue  X1.4  (11/01/2026)#${src.revPage}`,
    strip: s => st.strips.push(s),
    draw: () => { st.draws += 1; },
    say: (t, how, still) => st.said.push([t, how, still]),
    every: (fn, ms) => { const id = st.nextTimer++; st.timers.set(id, { fn, ms }); return id; },
    stop: id => st.timers.delete(id),
    release: () => { st.released += 1; st.events.push('released'); },
    retire: () => { st.retired += 1; },
  };
  return { st, so: new SavedOverlay(host) };
}
const settled = () => new Promise(r => setTimeout(r, 0));
const lastStrip = st => st.strips[st.strips.length - 1];

for (const mode of ['Edit Mode', 'View Only']) {
  const project = job();
  const editing = mode === 'Edit Mode';
  const before = {
    changes: project.changeCount, dirty: project.dirty,
    meta: JSON.stringify((({ project_modified, ...m }) => m)(project.buildSaveMetadata())),
    annots: JSON.stringify(project.annotations),
    records: project.metadata.page_overlays,
  };
  const { st, so } = harness(project);
  const arrive = async (page, how = 'turn', { version = false } = {}) => {
    so.turn(page, how);
    st.sheetUp = -1;                       // the sheet decodes
    st.onVersion = version;
    st.sheetUp = page;                     // ...and lands
    so.settle({ arrival: true, how });
    await settled();
  };
  log(`   [${mode}]`);

  // a. arrival on a sheet whose record names another sheet
  await arrive(1);
  let f = so.frame();
  eq(`${mode}: arriving on X1.1 puts up its saved overlay: sheet 0's pixels at its offset, its own size`,
    f && [f.box, f.alpha, f.tint], [[12.5, -3, 12.5 + 2592, -3 + 1728], 0.65, 'rgb(51, 102, 255)']);
  eq(`${mode}: the strip says what is up and the fade`, lastStrip(st) && [lastStrip(st).label, lastStrip(st).percent],
    ['Overlay: P1  X1.0', 65]);
  // b. a turn onto a sheet whose record names nothing (-1)
  const closedBefore = st.surfacesClosed;
  so.turn(2, 'turn');
  ok(`${mode}: the turn takes X1.1's overlay down at once, before anything is restored (its mask closed)`,
    so.frame() === null && st.surfacesClosed === closedBefore + 1 && lastStrip(st) === null);
  st.sheetUp = 2;
  so.settle({ arrival: true, how: 'turn' });
  await settled();
  ok(`${mode}: X1.2's record names nothing (overlay_page -1): NOTHING is up, nothing asked for`,
    so.frame() === null && so.up === null && st.asked.length === 1 && lastStrip(st) === null);
  // c. a sheet with no record, between two that have one
  await arrive(3);
  ok(`${mode}: X1.3 has no record: nothing up`, so.frame() === null && st.asked.length === 1);
  // d. back on X1.1: its own comes up again, built again
  await arrive(1);
  ok(`${mode}: back on X1.1 its overlay comes up again`, !!so.frame() && st.asked.length === 2);
  // e. a save's re-read: the same sheet, 'keep' -- the same visit, nothing rebuilt
  const made = st.surfacesMade;
  const retired = st.retired;
  ok(`${mode}: a 'keep' of the sheet he is on is the same visit`, so.turn(1, 'keep') === false && !!so.up
    && st.retired === retired);
  ok(`${mode}: every new visit took the last sheet's sentences off the line (${retired} turns)`, retired === 4);
  st.sheetUp = -1;
  ok(`${mode}: ...not drawn while the sheet is re-read`, so.frame() === null);
  st.sheetUp = 1;
  so.settle({ arrival: true, how: 'keep' });
  await settled();
  ok(`${mode}: ...and back, with no rebuild`, !!so.frame() && st.surfacesMade === made);
  // f. Hide: down for this visit only
  const closed = st.surfacesClosed;
  ok(`${mode}: Hide takes it down`, so.hide() === true && so.frame() === null && st.surfacesClosed === closed + 1);
  so.settle();
  await settled();
  ok(`${mode}: ...and it stays down while he stays (a version step, a settle)`, so.frame() === null && st.surfacesMade === made);
  // the card of the sheet he is on tapped again (a 'turn' onto the sheet up):
  // nothing turned, so it is the same visit and the Hide stands -- "until you
  // next turn to this sheet" (R8-TUM-3)
  const retiredT = st.retired;
  ok(`${mode}: the sheet's own card tapped again is the same visit`, so.turn(1, 'turn') === false && st.retired === retiredT);
  st.sheetUp = -1;
  st.sheetUp = 1;
  so.settle({ arrival: true, how: 'turn' });
  await settled();
  ok(`${mode}: ...so the overlay he hid stays hidden`, so.frame() === null && st.surfacesMade === made);
  // ...but a turn ONTO it while another sheet is still up is a turn
  st.sheetUp = 3;
  ok(`${mode}: a turn onto the sheet from another one is a new visit`, so.turn(1, 'turn') === true);
  st.sheetUp = 1;
  so.settle({ arrival: true, how: 'turn' });
  await settled();
  ok(`${mode}: ...and brings it back`, !!so.frame() && st.surfacesMade === made + 1);
  so.hide();
  await arrive(1, 'open');
  ok(`${mode}: ...and so is another job opening on the same sheet number: a Hide is not carried into it`,
    !!so.frame() && st.surfacesMade === made + 2);
  so.hide();
  await arrive(3);
  await arrive(1);
  ok(`${mode}: the next arrival brings it back`, !!so.frame() && st.surfacesMade === made + 3);
  // g. the paint gate: another version on screen
  st.onVersion = true;
  so.settle();
  ok(`${mode}: another version up: not drawn, the strip down, the mask kept`,
    so.frame() === null && lastStrip(st) === null && !!so.up);
  st.onVersion = false;
  so.settle();
  ok(`${mode}: the sheet's own drawing again: drawn, no rebuild`, !!so.frame() && st.surfacesMade === made + 3
    && lastStrip(st) && lastStrip(st).label === 'Overlay: P1  X1.0');
  // Flash, then another version: it is off the screen, so the blink stops --
  // no timer left repainting a sheet it is not on (R8-TUM-1)
  so.flash();
  const drawsF = st.draws;
  st.onVersion = true;
  so.settle();
  ok(`${mode}: flashing, then another version: the flash stops with it off the screen (no timer left)`,
    st.timers.size === 0 && so.flashing() === false && !!so.up);
  ok(`${mode}: ...and drew once for the step, not again`, st.draws === drawsF + 1);
  st.onVersion = false;
  so.settle();
  ok(`${mode}: ...back on its own drawing it is up, not blinking`, !!so.frame() && lastStrip(st).flashing === false);
  // a blink that comes due while it is off the screen paints nothing
  so.flash();
  st.onVersion = true;                   // (no settle yet: a landing still deciding)
  const drawsG = st.draws;
  [...st.timers.values()][0].fn();
  ok(`${mode}: a blink due while it is off the screen paints nothing`, st.draws === drawsG);
  st.onVersion = false;
  so.flash();
  ok(`${mode}: (Flash off again)`, st.timers.size === 0 && !!so.frame());
  // the decode the build owned went as soon as its pixels were read, before
  // the mask was made: two copies on an iPad at once, never three (R8-TUM-4)
  const ev = st.events.join(' ');
  ok(`${mode}: every owned decode was released after its read and before its mask, once`,
    /^(read released mask ?)+$/.test(ev), ev.slice(0, 80));
  {
    // ...and on the way out of a read that fails: released, nothing up, said
    st.failSurface = true;
    const rel = st.released;
    await arrive(3);
    await arrive(1);
    ok(`${mode}: a source whose read fails: its owned decode still released, nothing up, said`,
      st.released === rel + 1 && so.up === null
      && st.said[st.said.length - 1][0] === "Could not show this sheet's saved overlay — could not read it");
    // ...and its own card tapped again asks again (R8-2P-2): a read that
    // failed (offline, it may be) is tried once more, its sentence taken off
    // the line -- still the same visit, so a Hide would still stand
    const failedStill = st.said[st.said.length - 1][2];
    ok(`${mode}: (the failure is still true while nothing has asked again)`, failedStill() === true);
    so.settle();
    await settled();
    ok(`${mode}: ...and a settle of the same visit does not ask again (a version step, a mode change)`,
      so.up === null && st.released === rel + 1);
    st.failSurface = false;
    const retiredR = st.retired;
    const madeR = st.surfacesMade;
    ok(`${mode}: its own card tapped again: the same visit, but the failed read is asked again and its sentence goes`,
      so.turn(1, 'turn') === false && st.retired === retiredR + 1 && failedStill() === false);
    so.settle({ arrival: true, how: 'turn' });
    await settled();
    ok(`${mode}: ...and the overlay comes up`, !!so.frame() && st.surfacesMade === madeR + 1);
    ok(`${mode}: ...and a tap with it up asks nothing again`, so.turn(1, 'turn') === false && st.retired === retiredR + 1);
    so.settle({ arrival: true, how: 'turn' });
    await settled();
    ok(`${mode}: (no rebuild)`, st.surfacesMade === madeR + 1);
    st.events.length = 0;
    await arrive(3);
    await arrive(1);
    ok(`${mode}: (up again)`, !!so.frame());
  }
  // h. landing on the newest of a reissued sheet (decision 2): said once, built when he steps
  const asked = st.asked.length;
  await arrive(4, 'turn', { version: true });
  ok(`${mode}: X1.4 lands on its newest drawing: its overlay is not drawn and not even built`,
    so.frame() === null && st.asked.length === asked);
  eq(`${mode}: ...he is told once where it is`, st.said.slice(-1).map(s => s.slice(0, 2)), [[VERSION_NOTE, 'turn']]);
  so.settle({ arrival: true, how: 'turn' });
  ok(`${mode}: ...once`, st.said.filter(s => s[0] === VERSION_NOTE).length === 1);
  // A sentence said later (an opening's, once its own line is quiet) is
  // still true only on this visit, with the newest drawing up (R8-RS-1).
  const noteStill = st.said[st.said.length - 1][2];
  ok(`${mode}: ...and while it waits to be said it is still true (the newest is up, the same visit)`,
    typeof noteStill === 'function' && noteStill() === true);
  st.onVersion = false;                    // he steps to the sheet's own drawing
  ok(`${mode}: ...not once he is on the sheet's own drawing, where the overlay is to be seen`, noteStill() === false);
  so.settle();
  await settled();
  f = so.frame();
  eq(`${mode}: on its own drawing it comes up: the revision page at its offset`, f && f.box, [4, 4, 5404, 1732]);
  eq(`${mode}: ...named as the version bar names it`, lastStrip(st).label, 'Overlay: Reissue  X1.4  (11/01/2026)#0');
  st.onVersion = true;                     // back to the newest
  so.settle();
  ok(`${mode}: back on the newest it is off the screen`, so.frame() === null && lastStrip(st) === null);
  ok(`${mode}: (the note is true again there)`, noteStill() === true);
  {
    // ...and never on another visit: after a turn, or another job opening on
    // the same sheet number
    const keepSheet = st.sheetUp;
    st.sheetUp = -1;
    ok(`${mode}: ...nor while the sheet is not up`, noteStill() === false);
    st.sheetUp = keepSheet;
    const was = so.visit;
    so.visit = { ...was };                 // what a new visit of the same page looks like
    ok(`${mode}: ...nor on another visit of the same sheet number (a job opened on it)`, noteStill() === false);
    so.visit = was;
  }
  // i. Compare: one overlay at a time
  st.onVersion = false;
  so.settle();
  ok(`${mode}: (up again)`, !!so.frame());
  ok(`${mode}: Compare goes up: the saved one gives way`, so.stepAside() === true && so.frame() === null);
  st.comparing = true;
  so.settle();
  st.comparing = false;
  so.settle();
  await settled();
  ok(`${mode}: ...and stays down for the rest of the visit when Compare ends`, so.frame() === null);
  await arrive(3);
  await arrive(4);
  ok(`${mode}: the next arrival brings it back`, !!so.frame());
  // j. Flash
  ok(`${mode}: Flash starts at the desktop's speed`, so.flash() === true && [...st.timers.values()][0].ms === FLASH_MS);
  const tick = () => [...st.timers.values()][0].fn();
  tick();
  ok(`${mode}: a tick takes it off`, so.frame() === null && lastStrip(st) && lastStrip(st).flashing === true);
  tick();
  ok(`${mode}: the next puts it back`, !!so.frame());
  tick();
  so.flash();
  ok(`${mode}: Flash off: it is up, the timer gone`, !!so.frame() && st.timers.size === 0);
  so.flash();
  so.turn(3, 'turn');
  ok(`${mode}: a turn stops the flash`, st.timers.size === 0);
  // k. a build a turn overtakes
  st.sheetUp = -1;
  let release;
  st.hold = { promise: new Promise(r => { release = r; }) };
  so.turn(1, 'turn');
  st.sheetUp = 1;
  so.settle({ arrival: true, how: 'turn' });
  const madeK = st.surfacesMade;
  const releasedK = st.released;
  so.turn(3, 'turn');                      // he turned on before it was built
  st.sheetUp = 3;
  so.settle({ arrival: true, how: 'turn' });
  release();
  st.hold = null;
  await settled();
  await settled();
  ok(`${mode}: an overlay still being built when he turned on never goes up over the next sheet; its decode is released`,
    so.up === null && so.frame() === null && st.surfacesMade === madeK && st.released === releasedK + 1);
  // l. a picture: its own box, found by id on every frame; and unreadable
  await arrive(5);
  f = so.frame();
  eq(`${mode}: X1.5's picture overlay at the picture's own box (min / max of its corners), Original: no tint`,
    f && [f.box, f.tint, f.alpha], [[10, 20, 110, 90], null, 0.8]);
  eq(`${mode}: ...the strip names it as the desktop does`, lastStrip(st).label, 'Overlay: Picture 1');
  // an undo replaces every dict: the box is read off the entity the store holds NOW
  const list = project.annotations[5];
  const original = list[0];
  const moved = structuredClone(list[0]);
  moved.pts = [[0, 0], [50, 40]];
  list.splice(0, 1, moved);
  eq(`${mode}: ...read off the entity on every frame (an undo replaces every dict)`, so.frame().box, [0, 0, 50, 40]);
  const back = structuredClone(moved);
  delete back.as_overlay;
  list.splice(0, 1, back);
  ok(`${mode}: ...and a picture that is a picture again is not drawn, nor said up`,
    so.frame() === null && so.stripState() === null && !so.shown());
  list.splice(0, 1, original);           // ...and the undo's redo puts the first back
  st.failPicture = true;
  await arrive(3);
  const saidBefore = st.said.length;
  await arrive(5);
  eq(`${mode}: a picture that cannot be decoded is said in the desktop's words, and nothing is up`,
    [st.said.slice(saidBefore).map(s => s.slice(0, 2)), so.frame()], [[[KEPT_NOTE_UNREADABLE, 'turn']], null]);
  const unreadStill = st.said[st.said.length - 1][2];
  const askedBad = st.asked.length;
  so.settle();
  so.settle();
  await settled();
  ok(`${mode}: ...and it is not decoded again on every settle of the same visit (a version step, a mode change)`,
    st.asked.length === askedBad && so.up === null);
  ok(`${mode}: ...nor when its card is tapped again: its bytes are in the file, and will not decode the next time`,
    so.turn(5, 'turn') === false && (so.settle({ arrival: true, how: 'turn' }), st.asked.length === askedBad));
  ok(`${mode}: ...a sentence still true on its own visit`, unreadStill() === true);
  await arrive(3);
  ok(`${mode}: ...and not after a turn, so one queued for later is never said on the next sheet`, unreadStill() === false);
  await arrive(5);
  ok(`${mode}: ...once`, st.said.filter(s => s[0] === KEPT_NOTE_UNREADABLE).length === 1);
  st.failPicture = false;
  // m. a job reset takes it down and closes it
  await arrive(1);
  const c0 = st.surfacesClosed;
  so.takeDown();
  ok(`${mode}: a job reset takes it down and closes its mask`, so.frame() === null && st.surfacesClosed === c0 + 1);
  ok(`${mode}: every mask made was closed when it came down (${st.surfacesMade} made)`,
    st.surfacesClosed === st.surfacesMade);
  ok(`${mode}: every decode it owned was released (${st.released}; ${st.failedAsks} never decoded)`,
    st.released === st.asked.length - st.failedAsks && st.failedAsks === 2);

  // NOTHING WRITTEN
  const after = {
    changes: project.changeCount, dirty: project.dirty,
    meta: JSON.stringify((({ project_modified, ...m }) => m)(project.buildSaveMetadata())),
    annots: JSON.stringify(project.annotations),
  };
  ok(`${mode}: arrivals, turns, Hide, Flash, versions and Compare moved no change count (${before.changes})`,
    after.changes === before.changes, [before.changes, after.changes]);
  ok(`${mode}: ...and never marked the project unsaved`, after.dirty === false && before.dirty === false);
  ok(`${mode}: ...and wrote no record (page_overlays, its unknown key, the -1 record kept as they were)`,
    after.meta === before.meta && project.metadata.page_overlays === before.records
    && project.metadata.page_overlays[2].overlay_page === -1
    && JSON.stringify(project.metadata.page_overlays[1].zz_unknown) === '{"kept":[1]}');
  ok(`${mode}: ...and the annotations are as they were`, after.annots === before.annots);
  void editing;
}

eq('the sentences a turn takes off the line: the arrival\'s, Hide\'s, the unreadable picture\'s, a failure\'s, '
  + 'Compare\'s note and the Compare line that ends with it (R8-RS-3) -- nobody else\'s',
[VERSION_NOTE, HIDDEN_NOTE, KEPT_NOTE_UNREADABLE, "Could not show this sheet's saved overlay — x", COMPARE_NOTE,
  `Comparing: older in blue, newest in red. Slide towards the one you want to see more of — the centre shows both. ${COMPARE_NOTE}`,
  'Comparing: older in blue, newest in red. Slide towards the one you want to see more of — the centre shows both.',
  'Ready', '', `${COMPARE_NOTE} and more`]
  .map(overlayWords), [true, true, true, true, true, true, false, false, false, false]);

// ═══ 8. the app's wiring, by text ═════════════════════════════════════════
log('\n-- 8. the app\'s wiring, by text --');
{
  const main = await readFile(path.join(here, '..', 'js', 'main.js'), 'utf8');
  const fnText = name => {
    const m = new RegExp(`\\n(async )?function ${name}\\(`).exec(main);
    if (!m) return '';
    const start = m.index + 1;
    // the parameter list's own closing paren (a default may hold `() => {}`)
    let close = m.index + m[0].length - 1;
    for (let d = 0; close < main.length; close++) {
      if (main[close] === '(') d += 1;
      else if (main[close] === ')') { d -= 1; if (d === 0) break; }
    }
    const open = main.indexOf('{', close);
    let depth = 0;
    for (let i = open; i < main.length; i++) {
      if (main[i] === '{') depth += 1;
      else if (main[i] === '}') { depth -= 1; if (depth === 0) return main.slice(start, i + 1); }
    }
    return '';
  };
  const go = fnText('goToPage');
  // The code, not its comments: a comment may say 'return'.
  const body = go.slice(go.indexOf('{', go.indexOf(')')) + 1).replace(/\/\/[^\n]*/g, '');
  const turnAt = body.indexOf('savedOv.turn(');
  const firstAwait = body.indexOf('await ');
  const returns = [...body.matchAll(/\breturn\b/g)].map(m => m.index);
  ok('goToPage takes the last sheet\'s overlay down (savedOv.turn) before its first wait',
    turnAt > 0 && turnAt < firstAwait, [turnAt, firstAwait]);
  ok('...and before every return but the index guard on its first line',
    returns.length >= 2 && returns.slice(1).every(i => i > turnAt) && returns[0] < body.indexOf('\n', 1) + 1,
    { turnAt, returns: returns.slice(0, 4) });
  ok('...and settles this sheet\'s once the drawing it lands on is up (after the landing\'s last wait)',
    body.lastIndexOf('savedOv.settle(') > body.lastIndexOf('await '));
  ok('the frame draws savedOv.frame()', /savedOverlay:\s*savedOv\.frame\(\)/.test(fnText('drawFrame')));
  ok('...and says when it is blinking, so its off frames keep the renderer\'s tint canvas',
    /savedOverlayFlashing:\s*savedOv\.flashing\(\)/.test(fnText('drawFrame')));
  ok('Compare makes the saved overlay give way', fnText('startOverlay').includes('savedOv.stepAside('));
  ok('...but a Compare built for a sheet he has turned away from never goes up (nor takes the next one\'s down)',
    /const askedOn = savedOv\.visit;[\s\S]*if \(askedOn !== savedOv\.visit \|\| app\.currentPage !== page\) \{[\s\S]*return;[\s\S]*clearOverlay\(\{ draw: false \}\);[\s\S]*savedOv\.stepAside\(\)/
      .test(fnText('startOverlay')));
  ok('a sheet the prefetch is already decoding is shared, not decoded twice', /app\.pages\.decoding\?\.\(src\.page\)/.test(fnText('overlayPixels')));
  ok('syncVersionUi settles it when the drawing on screen changes', fnText('syncVersionUi').includes('settleSavedOverlay('));
  ok('Escape takes it down, after a trace in progress has had it', /savedOv\.shown\(\) && !controller\.chainLive/.test(main));
  ok('a job reset takes it down', /addEventListener\('reset', \(\) => \{?\s*savedOv\.takeDown/.test(main));
  const wiring = ['overlayPixels', 'overlaySurface', 'sourceFacts', 'readHeld', 'readIfYouCan', 'syncSavedOverlayStrip',
    'sayOnArrival', 'settleSavedOverlay', 'hideSavedOverlay', 'flashSavedOverlay', 'retireOverlayWords',
    'savedRevisionName'].map(n => [n, fnText(n)]);
  for (const [n, t] of wiring) ok(`main.js has ${n}`, t.length > 0);
  const hostAt = main.indexOf('const savedOv = new SavedOverlay(');
  const hostText = hostAt < 0 ? '' : main.slice(hostAt, main.indexOf('\n});', hostAt) + 4);
  ok('main.js builds the SavedOverlay with a host', hostText.length > 0);
  const all = [hostText, ...wiring.map(w => w[1])].join('\n');
  ok('no line of the wiring marks the project, opens a step or writes a record',
    !/markDirty|transact\(|tagBooking|page_overlays\s*(\[[^\]]*\])?\s*=[^=]|\.page_overlays\s*=[^=]|delete\s+[^;]*page_overlays/.test(all));

  // ── the wiring RUN, lifted by text, on stand-ins (R8-TUM-6, R8-TUM-4,
  // R8PF-1..4): how a source is read, which decodes are made and closed --
  // and in what order -- and the mask that comes out, against the desktop's.
  const ev = [];
  let reducedEverything = false;
  let decodeFails = false;
  class FakeImageData {
    constructor(data, w, h) { this.data = data; this.width = w; this.height = h; }
  }
  // A decode: its pixels are what a browser would read (here PIL's own
  // RGBA, or `pixels` when a test hands it a reduced one).
  const decoded = (tag, w, h, data, extra = {}) => ({
    tag, width: w, height: h, data,
    close() { ev.push(`close ${tag}`); },
    ...extra,
  });
  const canvases = [];
  const fakeCanvas = (w, h) => {
    const cv = { width: w, height: h, drawn: null };
    canvases.push(cv);
    cv.getContext = () => ({
      drawImage(img) { cv.drawn = img; },
      getImageData(x, y, ww, hh) {
        ev.push(`read ${cv.drawn.tag}`);
        return new FakeImageData(new Uint8ClampedArray(cv.drawn.data), ww, hh);
      },
    });
    return cv;
  };
  const stubs = {
    app: null, ImageData: FakeImageData, OffscreenCanvas: undefined,
    document: { createElement: () => fakeCanvas(0, 0) },
    overlayRgba, pictureBytes, pngInfo, pngHeadInfo, pngPlain, pngRgba, pngAutoCutoff,
    decodeSheet: async (raw, opts) => {
      ev.push(`decode ${JSON.stringify(opts || {})}`);
      if (decodeFails) throw new Error('decode refused');
      const info = pngInfo(raw);
      const px = await pngRgba(raw, { info });
      return decoded('mine', info.width, info.height, px.data);
    },
    decodeReduces: async () => reducedEverything,
    createImageBitmap: async img => { ev.push('mask'); return { mask: img, close() { ev.push('close mask'); } }; },
  };
  const names = Object.keys(stubs);
  const core = ['passCanvas', 'overlayPixels', 'readDecode', 'overlaySurface'].map(fnText);
  ok('the wiring that reads a source lifts out of main.js', core.every(t => t.length > 0));
  // ...with its helpers (a tree without one runs as it is, and is judged on
  // what it does)
  const lift = [...core, ...['sourceFacts', 'readHeld', 'readIfYouCan'].map(fnText)].filter(Boolean);
  // passCanvas makes an OffscreenCanvas where there is one: here, the fake
  const run2 = new Function(...names, `${lift.join('\n')}\nreturn { overlayPixels, overlaySurface };`
    .replace('typeof OffscreenCanvas !== \'undefined\'', 'false'));
  const W = run2(...names.map(n => stubs[n]));
  const caseOf = name => SNAP.decode.find(c => c.name === name);
  const lookOf = (c, kind, i) => {
    const [mode, inv, cut, used, hash] = c.kinds[kind].looks[i];
    return { look: { mode, invert: inv, cutoff: cut }, used, hash };
  };
  // `offline`: a read that fails, as a job read over the network does with
  // the connection gone. `key`: the store's own object for the sheet's
  // bytes (what the overlay keeps what it learns of a sheet with).
  const offline = () => Promise.reject(new TypeError('Failed to fetch'));
  const pageStore = pages => ({
    pageCount: pages.length, sources: pages.map(p => ({ kind: 'slice', data: p.key })),
    peekPage: i => pages[i].live || null, decoding: () => null,
    pngBytes: async i => { ev.push(`bytes ${i}`); return pages[i].bytesFail ? offline() : pages[i].png; },
    // the head: the first KB of the PNG (null: it cannot tell)
    pngHead: async i => {
      ev.push(`head ${i}`);
      if (pages[i].onHead) pages[i].onHead();
      if (pages[i].head === 'offline') return offline();
      return pages[i].head === undefined ? pages[i].png.subarray(0, 1024) : pages[i].head;
    },
    hasRevisionPage: () => true, peekRevisionPage: () => null, revisionPngBytes: async () => pages[0].png,
    revisionPngHead: async () => pages[0].png,
  });

  // 1. a semi-transparent picture: read as PIL reads it -- no browser decode
  // at all, so nothing premultiplied -- and its mask is the desktop's
  {
    const c = caseOf('alpha 128 on paper 248');
    ev.length = 0;
    const px = await W.overlayPixels({ kind: 'picture', entity: { img_b64: c.png } });
    const { look, used, hash } = lookOf(c, 'picture', 0);
    let freed = 0;
    const s = await W.overlaySurface(px, look, () => { freed += 1; ev.push('free'); });
    eq('a semi-transparent picture: never decoded by the browser, its mask the desktop\'s, Auto white paper (255)',
      [ev.join(', '), s.cutoff, sha1(s.image.mask.data), freed], ['free, mask', used, hash, 1]);
    eq('...at its own size', [s.width, s.height], [23, 11]);
  }
  // 2. a picture tagged Display P3: its raw values, as PIL reads them
  {
    const c = caseOf('a photo tagged Display P3, imported');
    for (const i of [0, 3]) {
      ev.length = 0;
      const px = await W.overlayPixels({ kind: 'picture', entity: { img_b64: c.png } });
      const { look, used, hash } = lookOf(c, 'picture', i);
      const s = await W.overlaySurface(px, look);
      eq(`a picture tagged Display P3 (${look.mode}): its file's own values, no colour management -- the desktop's mask`,
        [ev.join(', '), s.cutoff, sha1(s.image.mask.data)], ['mask', used, hash]);
    }
  }
  // 3. a plain sheet the store does not hold: the browser decodes it (exact
  // for a plain PNG), asked for the file's own colours, and the decode is
  // closed the moment its pixels are read -- before the mask is made
  {
    const c = caseOf('RGB on paper 240 (plain)');
    ev.length = 0;
    W.app = null;
    const app = { pages: pageStore([{ png: bytes(c.png) }]) };
    const run3 = new Function(...names, `${lift.join('\n')}\nreturn { overlayPixels, overlaySurface };`
      .replace('typeof OffscreenCanvas !== \'undefined\'', 'false'));
    const W3 = run3(...names.map(n => (n === 'app' ? app : stubs[n])));
    const px = await W3.overlayPixels({ kind: 'sheet', page: 0 });
    const { look, used, hash } = lookOf(c, 'sheet', 0);
    const s = await W3.overlaySurface(px, look, () => ev.push('free'));
    eq('a plain sheet decoded privately: bytes, one decode (its own colours), read, CLOSED, then the mask',
      [ev.join(', '), s.cutoff, sha1(s.image.mask.data)],
      ['bytes 0, decode {"colorSpaceConversion":"none"}, read mine, close mine, free, mask', used, hash]);
    ok('...and the canvas it was read through is let go (its backing store zeroed)',
      canvases.length > 0 && canvases.every(cv => cv.width === 0 && cv.height === 0), canvases.map(c => [c.width, c.height]));
    // ...and the store's own decode is used as it is, and never closed here
    ev.length = 0;
    const info = pngInfo(bytes(c.png));
    const live = decoded('store', info.width, info.height, (await pngRgba(bytes(c.png), { info })).data);
    const app2 = { pages: pageStore([{ png: bytes(c.png), live }]) };
    const W4 = run3(...names.map(n => (n === 'app' ? app2 : stubs[n])));
    const s2 = await W4.overlaySurface(await W4.overlayPixels({ kind: 'sheet', page: 0 }), look);
    eq('...the page store\'s own decode of a plain PNG: read as it is, FIRST, before anything waits (the store '
      + 'closes what it evicts) -- plain then asked of the PNG\'s head alone, not of the whole sheet\'s bytes '
      + '(a job read over the network) -- not decoded again, not closed here',
    [ev.join(', '), sha1(s2.image.mask.data)], ['read store, head 0, mask', hash]);
    ev.length = 0;
    const app2b = { pages: pageStore([{ png: bytes(c.png), live, head: null }]) };
    const W4b = run3(...names.map(n => (n === 'app' ? app2b : stubs[n])));
    const s2b = await W4b.overlaySurface(await W4b.overlayPixels({ kind: 'sheet', page: 0 }), look);
    eq('...and a head that cannot tell: the bytes are read to find out',
      [ev.join(', '), sha1(s2b.image.mask.data)], ['read store, head 0, bytes 0, mask', hash]);
    // R8-2P-2: offline, a held decode is still the overlay -- a head that
    // cannot be read is not followed by bytes that cannot be either; bytes
    // that fail after a head that cannot tell leave the held read
    for (const [what, page, want] of [
      ['its head cannot be read (offline): its bytes are not even asked for', { head: 'offline' },
        'read store, head 0, mask'],
      ['a head that cannot tell, then bytes that fail', { head: null, bytesFail: true },
        'read store, head 0, bytes 0, mask'],
    ]) {
      ev.length = 0;
      const appO = { pages: pageStore([{ png: bytes(c.png), live, ...page }]) };
      const WO = run3(...names.map(n => (n === 'app' ? appO : stubs[n])));
      let got;
      try {
        const sO = await WO.overlaySurface(await WO.overlayPixels({ kind: 'sheet', page: 0 }), look);
        got = [ev.join(', '), sO.cutoff, sha1(sO.image.mask.data)];
      } catch (err) {
        got = `thrown: ${err.message}`;
      }
      eq(`a plain sheet the store holds, ${what}: its own read -- the desktop's mask`, got, [want, used, hash]);
    }
    // R8-2P-1: the store closes the held decode while its head is read (a
    // neighbour's prefetch evicting it): it was read before the wait
    {
      ev.length = 0;
      // (a closed ImageBitmap is 0 x 0, its pixels gone)
      const shut = decoded('store', info.width, info.height, live.data);
      shut.close = () => { ev.push('store closes it'); shut.width = 0; shut.height = 0; shut.data = null; };
      const appC = { pages: pageStore([{ png: bytes(c.png), live: shut, onHead: () => shut.close() }]) };
      const WC = run3(...names.map(n => (n === 'app' ? appC : stubs[n])));
      let got;
      try {
        const sC = await WC.overlaySurface(await WC.overlayPixels({ kind: 'sheet', page: 0 }), look);
        got = [ev.join(', '), sC.cutoff, sha1(sC.image.mask.data), [sC.width, sC.height]];
      } catch (err) {
        got = `thrown: ${err.message}`;
      }
      eq('a held decode the store closes while its head is read: read before the wait -- the desktop\'s mask, its size',
        got, ['read store, head 0, store closes it, mask', used, hash, [info.width, info.height]]);
      // ...and one closed already (0 x 0) is read as if it were not held
      ev.length = 0;
      const gone = decoded('store', 0, 0, null);
      const appG = { pages: pageStore([{ png: bytes(c.png), live: gone }]) };
      const WG = run3(...names.map(n => (n === 'app' ? appG : stubs[n])));
      const sG = await WG.overlaySurface(await WG.overlayPixels({ kind: 'sheet', page: 0 }), look);
      eq('...and one the store closed already: read as if it were not held (its bytes, a decode of its own)',
        [ev.join(', '), sG.cutoff, sha1(sG.image.mask.data), [sG.width, sG.height]],
        ['bytes 0, decode {"colorSpaceConversion":"none"}, read mine, close mine, mask', used, hash,
          [info.width, info.height]]);
    }
    // what is learnt of a sheet is kept with the store's own object for its
    // bytes: the second arrival asks nothing of the network
    {
      const key = { sheet: 'X1.0' };
      const appF = { pages: pageStore([{ png: bytes(c.png), live, key }]) };
      const WF = run3(...names.map(n => (n === 'app' ? appF : stubs[n])));
      const seen = [];
      for (let n = 0; n < 2; n++) {
        ev.length = 0;
        const sF = await WF.overlaySurface(await WF.overlayPixels({ kind: 'sheet', page: 0 }), look);
        seen.push([ev.join(', '), sha1(sF.image.mask.data) === hash]);
      }
      eq('a held plain sheet, twice: its head read on the first arrival only', seen,
        [['read store, head 0, mask', true], ['read store, mask', true]]);
    }
    // ...and a held decode of a PNG that is NOT plain (tagged Display P3):
    // its head says so, and it is read as PIL reads it, not off the decode
    const t = caseOf('a photo tagged Display P3, imported');
    const tInfo = pngInfo(bytes(t.png));
    const tLive = decoded('store', tInfo.width, tInfo.height, new Uint8ClampedArray(tInfo.width * tInfo.height * 4));
    ev.length = 0;
    const app2c = { pages: pageStore([{ png: bytes(t.png), live: tLive }]) };
    const W4c = run3(...names.map(n => (n === 'app' ? app2c : stubs[n])));
    const tl = lookOf(t, 'sheet', 0);
    const s2c = await W4c.overlaySurface(await W4c.overlayPixels({ kind: 'sheet', page: 0 }), tl.look);
    eq('a held decode of a sheet tagged Display P3: its head says it is not plain; read as PIL reads it -- the desktop\'s mask',
      [ev.join(', '), s2c.cutoff, sha1(s2c.image.mask.data)], ['read store, head 0, bytes 0, mask', tl.used, tl.hash]);
    {
      // ...whose bytes cannot be read (offline): the held read, not nothing
      ev.length = 0;
      const appT = { pages: pageStore([{ png: bytes(t.png), live: tLive, bytesFail: true }]) };
      const WT = run3(...names.map(n => (n === 'app' ? appT : stubs[n])));
      let got;
      try {
        const sT = await WT.overlaySurface(await WT.overlayPixels({ kind: 'sheet', page: 0 }), tl.look);
        got = [ev.join(', '), sT.image.mask.data.length === tInfo.width * tInfo.height * 4, [sT.width, sT.height]];
      } catch (err) {
        got = `thrown: ${err.message}`;
      }
      eq('...and offline (its bytes fail): the held decode\'s own read, at its size -- not nothing', got,
        ['read store, head 0, bytes 0, mask', true, [tInfo.width, tInfo.height]]);
    }
    // 4. a decode the browser had to make smaller (an iPad): its pixels as
    // they are, but Auto read off the full-size rows -- a resampled grey
    // would have moved it
    ev.length = 0;
    const grey = new Uint8ClampedArray(12 * 5 * 4).fill(200);
    for (let i = 3; i < grey.length; i += 4) grey[i] = 255;
    const small = decoded('reduced', info.width, info.height, grey, { reduced: true, bitmap: null });
    small.bitmap = { tag: 'reduced', width: 12, height: 5, data: grey };
    const app3 = { pages: pageStore([{ png: bytes(c.png), live: small }]) };
    const W5 = run3(...names.map(n => (n === 'app' ? app3 : stubs[n])));
    const s3 = await W5.overlaySurface(await W5.overlayPixels({ kind: 'sheet', page: 0 }), look);
    const ownAuto = overlayRgba({ data: new Uint8ClampedArray(grey), width: 12, height: 5 }).cutoff;
    eq('a reduced decode on Auto: its own pixels -- read first -- the cut-off the desktop reads off the whole sheet '
      + `(${used}), not the resampled one's (${ownAuto})`,
    [ev.join(', '), s3.cutoff, [s3.width, s3.height]], ['read reduced, bytes 0, mask', used, [info.width, info.height]]);
    ok('(the reduced pixels alone would have chosen another cut-off)', ownAuto !== used);
    ev.length = 0;
    const s4 = await W5.overlaySurface(await W5.overlayPixels({ kind: 'sheet', page: 0 }), { ...look, cutoff: 180 });
    eq('...and with a hand cut-off it does not even fetch the sheet\'s bytes', [ev.join(', '), s4.cutoff],
      ['read reduced, mask', 180]);
    {
      // R8-2P-2: offline, Auto is read off the reduced pixels in hand
      ev.length = 0;
      const appR = { pages: pageStore([{ png: bytes(c.png), live: small, bytesFail: true }]) };
      const WR = run3(...names.map(n => (n === 'app' ? appR : stubs[n])));
      let got;
      try {
        const sR = await WR.overlaySurface(await WR.overlayPixels({ kind: 'sheet', page: 0 }), look);
        got = [ev.join(', '), sR.cutoff, [sR.width, sR.height]];
      } catch (err) {
        got = `thrown: ${err.message}`;
      }
      eq(`...and offline (its bytes fail): Auto off the reduced pixels in hand (${ownAuto}), not nothing`, got,
        ['read reduced, bytes 0, mask', ownAuto, [info.width, info.height]]);
      // ...and the whole sheet's Auto, once learnt, is not read again
      const key = { sheet: 'X1.0 reduced' };
      const appK = { pages: pageStore([{ png: bytes(c.png), live: small, key }]) };
      const WK = run3(...names.map(n => (n === 'app' ? appK : stubs[n])));
      const seen = [];
      for (let n = 0; n < 2; n++) {
        ev.length = 0;
        const sK = await WK.overlaySurface(await WK.overlayPixels({ kind: 'sheet', page: 0 }), look);
        seen.push([ev.join(', '), sK.cutoff]);
      }
      eq('a reduced sheet on Auto, twice: its full-size rows read on the first arrival only, the same cut-off both times',
        seen, [['read reduced, bytes 0, mask', used], ['read reduced, mask', used]]);
    }
    // 5. a picture the browser must reduce: decoded smaller, its own
    // colours asked for, closed after its read; Auto off the full rows
    reducedEverything = true;
    const p = caseOf('alpha 128 on paper 248');
    ev.length = 0;
    const s5 = await W.overlaySurface(await W.overlayPixels({ kind: 'picture', entity: { img_b64: p.png } }),
      lookOf(p, 'picture', 0).look);
    eq('a picture over the canvas cap: decoded (smaller), read, closed, then the mask; Auto the full-size one',
      [ev.join(', '), s5.cutoff], ['decode {"colorSpaceConversion":"none"}, read mine, close mine, mask', 255]);
    // 6. a decode that fails: nothing is left open, and it is said by the caller
    decodeFails = true;
    ev.length = 0;
    let threw = '';
    let freedF = 0;
    try {
      await W.overlaySurface(await W.overlayPixels({ kind: 'picture', entity: { img_b64: p.png } }),
        lookOf(p, 'picture', 0).look, () => { freedF += 1; });
    } catch (err) { threw = err.message; }
    eq('a picture that will not decode: thrown (to be said), the caller\'s decode freed, no mask',
      [threw, freedF, ev.includes('mask')], ['decode refused', 1, false]);
    decodeFails = false;
    reducedEverything = false;
  }
  ok('a picture with no pixels is refused at once', await W.overlayPixels({ kind: 'picture', entity: { img_b64: '' } })
    .then(() => false, err => /no pixels/.test(err.message)));

  // ── the strip, its buttons and the words, run ──────────────────────────
  {
    const el = {};
    const $ = id => {
      if (!el[id]) {
        el[id] = { id, hidden: true, textContent: '', title: '', dataset: {}, style: {}, attrs: {},
          classList: { on: false, toggle(_, v) { this.on = !!v; } },
          setAttribute(k, v) { this.attrs[k] = v; } };
      }
      return el[id];
    };
    const sync = new Function('$', `${fnText('syncSavedOverlayStrip')}\nreturn syncSavedOverlayStrip;`)($);
    sync({ label: 'Overlay: P1  X1.0', percent: 65, color: 'rgb(51, 102, 255)', flashing: true, kind: 'sheet', cutoff: 255 });
    eq('the strip says what is up, its fade and tint, and that it flashes',
      [el.savedOvBar.hidden, el.sovWhat.textContent, el.sovFade.textContent, el.sovSwatch.style.background,
        el.sovFlash.attrs['aria-pressed'], el.savedOvBar.dataset.kind],
      [false, 'Overlay: P1  X1.0', '65%', 'rgb(51, 102, 255)', 'true', 'sheet']);
    sync(null);
    ok('...and nothing up hides it', el.savedOvBar.hidden === true);
    ok('Hide hides (it does not flash)', /\$\('sovHide'\)\?\.addEventListener\('click', \(\) => \{\s*hideSavedOverlay\(\);/.test(main));
    ok('Flash flashes', /\$\('sovFlash'\)\?\.addEventListener\('click', \(\) => \{\s*flashSavedOverlay\(\);/.test(main));
    ok('hideSavedOverlay hides the saved overlay and says so', /savedOv\.hide\(\)[\s\S]*HIDDEN_NOTE/.test(fnText('hideSavedOverlay')));
    // Compare's note reaches a phone, where there is no status line (R8-TUM-2)
    ok('Compare\'s saved-overlay note is said in the finger\'s toast where there is no status line',
      /if \(gaveWay && !statusLineShown\(\)\) sayToFinger\(COMPARE_NOTE\)/.test(fnText('startOverlay'))
      && /display !== 'none'/.test(fnText('statusLineShown')));
    // the opening's sentence waits for the opening, and is bound to its visit
    // (R8-RS-1, R8-RS-2): sayOnArrival and sayWhenQuiet, run
    let asked = null;
    const said = [];
    const statusEl = { textContent: '' };
    const progress = { hidden: false };
    const timers = [];
    const fakes = {
      document: { querySelector: () => ({}) }, getComputedStyle: () => ({ display: 'flex' }),
      sayWhenQuiet: (t, o) => { asked = { t, o }; }, sayToFinger: t => said.push(['finger', t]),
      inLandedJob: () => landed, $: id => (id === 'progress' ? progress : id === 'statusText' ? statusEl : null),
    };
    let landed = true;
    const say = new Function(...Object.keys(fakes), `${fnText('sayOnArrival')}\n${fnText('openingUnderWay')}\n`
      + 'return { sayOnArrival, openingUnderWay };')(...Object.values(fakes));
    let still = true;
    say.sayOnArrival(VERSION_NOTE, 'open', () => still);
    ok('an opening\'s sentence waits while the opening is under way (its progress card is up)',
      !!asked && typeof asked.o.wait === 'function' && asked.o.wait() === true);
    progress.hidden = true;
    ok('...and no longer once it is through', asked.o.wait() === false);
    ok('...and is said only while it is still true on its own visit, in the job it was said in',
      asked.o.still() === true && ((still = false), asked.o.still() === false)
      && ((still = true), (landed = false), asked.o.still() === false));
    landed = true;
    say.sayOnArrival(VERSION_NOTE, 'turn', () => true);
    ok('a turn says it at once', said.length === 1 && said[0][1] === VERSION_NOTE);
    // sayWhenQuiet itself: nothing while the opening is under way, then not
    // over the opening's own line -- only once that line is quiet
    const HINTS = { pan: 'Pan hint' };
    const statusSet = [];
    const quiet = new Function('$', 'HINTS', 'controller', 'setStatus', 'setTimeout',
      `${fnText('sayWhenQuiet')}\nreturn sayWhenQuiet;`)(
      id => (id === 'statusText' ? statusEl : null), HINTS, { mode: 'pan' },
      t => { statusSet.push(t); statusEl.textContent = t; }, fn => timers.push(fn));
    statusEl.textContent = 'Pan hint';     // a quiet line: what made the note get lost
    progress.hidden = false;
    let waiting = true;
    quiet(VERSION_NOTE, { wait: () => waiting });
    const tick = () => { const fn = timers.shift(); if (fn) fn(); };
    tick(); tick(); tick();
    ok('while the opening is under way the line is quiet, and still nothing is said', statusSet.length === 0);
    statusEl.textContent = 'Opened job.takeoff — 3 sheets';
    waiting = false;
    tick(); tick();
    ok('...then not over the opening\'s own line', statusSet.length === 0);
    statusEl.textContent = 'Pan hint';
    tick();
    eq('...and once that line is quiet, the sentence', statusSet, [VERSION_NOTE]);
  }

  // ── the CSS a finger needs (R8-TUM-6) ──────────────────────────────────
  {
    const css = await readFile(path.join(here, '..', 'css', 'app.css'), 'utf8');
    const rule = sel => {
      const at = css.indexOf(`${sel} {`);
      return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
    };
    ok('the strip sits above the phone and tablet bar (--mbar-h), as the canvas stops there',
      /bottom:\s*calc\(var\(--mbar-h, 0px\) \+ \d+px\)/.test(rule('.sov-bar')));
    ok('its buttons are 44 px where the layout is for fingers',
      /:root\[data-ui="touch"\] \.sov-btn \{ min-height: 44px; min-width: 44px; \}/.test(css)
      && /@media \(pointer: coarse\) \{\s*:root:not\(\[data-ui\]\) \.sov-btn \{ min-height: 44px; min-width: 44px; \}/.test(css));
    const html = await readFile(path.join(here, '..', 'index.html'), 'utf8');
    ok('the strip has its line, its fade, Flash and Hide, and no menu action (it writes nothing)',
      /id="savedOvBar"[\s\S]*id="sovWhat"[\s\S]*id="sovFade"[\s\S]*id="sovFlash"[\s\S]*id="sovHide"/.test(html)
      && !/id="sov(Flash|Hide)"[^>]*data-act/.test(html));
  }
}

// ═══ 8b. the renderer draws it: over the sheet, in its tint, at its fade ══
log('\n-- 8b. the renderer\'s pass (a recording canvas) --');
{
  const recording = (w, h, tag) => {
    const calls = [];
    const state = {};
    const ctx = new Proxy({
      measureText: s => ({ width: String(s).length * 7 }),
      getLineDash: () => [],
    }, {
      get(t, k) {
        if (k in t) return t[k];
        if (k === 'canvas') return cv;
        if (k in state) return state[k];
        const fn = (...args) => { calls.push([tag, String(k), ...args]); };
        t[k] = fn;
        return fn;
      },
      set(t, k, v) { state[k] = v; calls.push([tag, `=${String(k)}`, v]); return true; },
    });
    const cv = { width: w, height: h, getContext: () => ctx, tag };
    return { cv, ctx, calls };
  };
  const all = [];
  const made = [];
  globalThis.OffscreenCanvas = class {
    constructor(w, h) {
      const r = recording(w, h, `scratch${made.length}`);
      made.push(r.cv);
      r.calls.push = (...c) => Array.prototype.push.apply(all, c);
      return r.cv;
    }
  };
  const screen = recording(800, 600, 'screen');
  screen.calls.push = (...c) => Array.prototype.push.apply(all, c);
  const { Viewport } = await import('../js/render/viewport.js');
  const vp = new Viewport(screen.cv);
  vp.width = 800; vp.height = 600; vp.zoom = 0.5; vp.dpr = 1;
  const r = new Renderer(screen.cv, vp);
  const frame = extra => ({ pageImage: null, items: [], annotations: [], isVisible: () => true, selected: new Set(),
    hoverId: null, preview: null, marquee: null, ppf: 37.5, ...extra });
  const mask = { width: 2592, height: 1728, tag: 'mask' };
  const box = [12.5, -3, 2604.5, 1725];
  all.length = 0;
  r.draw(frame({ savedOverlay: { image: mask, box, alpha: 0.65, tint: 'rgb(51, 102, 255)' } }));
  const on = (tag, name) => all.filter(c => c[0] === tag && c[1] === name);
  const s0 = made[0];
  eq('Lines: the mask is laid on a scratch the canvas\'s size, at its box in page px',
    s0 && [s0.width, s0.height, on('scratch0', 'drawImage').map(c => c.slice(3))], [800, 600, [box.slice(0, 2).concat([2592, 1728])]]);
  const sc = all.filter(c => c[0] === 'scratch0').map(c => c[1] + (typeof c[2] === 'string' ? `:${c[2]}` : ''));
  ok('...coloured in its tint, source-in, after it is drawn (the tint at draw time: never a rebuild)',
    sc.indexOf('drawImage') < sc.indexOf('=globalCompositeOperation:source-in')
    && sc.indexOf('=globalCompositeOperation:source-in') < sc.indexOf('=fillStyle:rgb(51, 102, 255)')
    && sc.indexOf('=fillStyle:rgb(51, 102, 255)') < sc.indexOf('fillRect'), sc);
  const scr = all.filter(c => c[0] === 'screen');
  const at = scr.findIndex(c => c[1] === 'drawImage' && c[2] === s0);
  ok('...and that goes over the sheet at the fade', at > 0
    && scr.slice(0, at).reverse().find(c => c[1] === '=globalAlpha')?.[2] === 0.65, scr.slice(Math.max(0, at - 4), at + 1));
  // Original: its own colours, at the fade, no tint canvas
  all.length = 0;
  r.draw(frame({ savedOverlay: { image: mask, box: [10, 20, 110, 90], alpha: 0.8, tint: null } }));
  const scr2 = all.filter(c => c[0] === 'screen');
  const at2 = scr2.findIndex(c => c[1] === 'drawImage' && c[2] === mask);
  eq('Original: the mask itself, at the picture\'s box, at the fade -- no tint',
    at2 >= 0 && [scr2[at2].slice(3), scr2.slice(0, at2).reverse().find(c => c[1] === '=globalAlpha')?.[2]],
    [[10, 20, 100, 70], 0.8]);
  ok('...and the tint canvas let go (its backing store zeroed)', r._tintScratch === null && s0.width === 0 && s0.height === 0);
  // flashing keeps it for the next blink; nothing up lets it go
  r.draw(frame({ savedOverlay: { image: mask, box, alpha: 0.5, tint: 'rgb(255, 77, 77)' } }));
  const s1 = r._tintScratch;
  r.draw(frame({ savedOverlay: null, savedOverlayFlashing: true }));
  ok('the off half of a Flash keeps the tint canvas', r._tintScratch === s1 && s1.width === 800);
  r.draw(frame({ savedOverlay: null }));
  ok('a frame with no saved overlay lets it go (Hide, a turn, another job: R8-TUM-5)',
    r._tintScratch === null && s1.width === 0 && s1.height === 0);
  all.length = 0;
  r.draw(frame({ savedOverlay: null }));
  ok('...and nothing is drawn for it', !all.some(c => c[1] === 'drawImage'));
  delete globalThis.OffscreenCanvas;
}

// ═══ 9. the live differential ═════════════════════════════════════════════
let live = 'skipped: no PTT_DESKTOP_SRC';
if (!(await haveDesktopSource())) {
  log('\n-- 9. live differential SKIPPED (set PTT_DESKTOP_SRC) --');
} else {
  log('\n-- 9. live: the desktop source as it is now --');
  let truth = null;
  try {
    const { stdout } = await run('python', ['-B', path.join(here, 'overlay-python-truth.py'), DESKTOP_SRC],
      { maxBuffer: 1 << 28, windowsHide: true });
    truth = JSON.parse(stdout);
  } catch (err) {
    fails += 1;
    log(`FAIL the desktop's overlay functions could not be lifted and run:\n${err.stderr || err.message}`);
  }
  if (truth) {
    log(`   (lifted by text: ${truth.lifted.module.join(', ')}; GLPageWidget ${truth.lifted.gl.length}, `
      + `PDFCacheViewer ${truth.lifted.win.length}; PIL ${truth.pil})`);
    checkLook(truth, 'live');
    checkRecords(truth, 'live');
    checkArrivals(truth, 'live');
    checkSizes(truth, 'live');
    checkSmall(truth, 'live');
    await checkDecode(truth, 'live');
    ok('the committed tests/data/overlay-truth.json is the desktop\'s answer as it is now '
      + `(regenerate: python -B tests/overlay-python-truth.py "${DESKTOP_SRC}" --write)`,
    JSON.stringify(truth) === JSON.stringify(SNAP));
    live = 'live differential run';
  }
}

console.log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass -- the saved overlay comes up in the desktop's look, never on the wrong sheet, writing nothing (${live})`);
process.exit(fails ? 1 : 0);
