// callout-view.mjs — the maths behind a pannable detail preview.
//
// The preview is a window onto a sheet. Three things have to hold or it
// shows the wrong thing, quietly:
//
//   1. The window OPENS on the whole zone the pin points at. A view that
//      cropped the detail would answer "see 3/S301" with two thirds of
//      detail 3 and no sign that anything was missing.
//   2. The rectangle the preview DRAWS is the rectangle the store CROPPED.
//      Both go through cropGeometry, so a rounding rule cannot drift —
//      this file is what stops someone "simplifying" one of them.
//   3. The resolution asked for is the canvas's BACKING store, not its CSS
//      size. Getting that wrong is invisible on a desk monitor and halves
//      the resolution on the iPad this is read on.
//
// Run: node tests/callout-view.mjs
import {
  SIZES, PREVIEW_SIZES, previewBudget, previewBox, zoneAspect, zoneRect,
  fitView, clampView, zoomView, panView, sourceRequest, covers, canvasPixels,
} from '../js/ui/callout-preview.js';
import { cropGeometry } from '../js/core/page-store.js';

let failed = 0;
const ok = (cond, msg) => {
  if (cond) { console.log('  ok   ' + msg); return; }
  failed++;
  console.log('  FAIL ' + msg);
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// A real sheet from the estimator's library, and a portrait one.
const SHEET = { width: 5400, height: 3600 };
const PORT = { width: 2400, height: 3600 };

console.log('-- the size budget --');
{
  const big = previewBudget('huge', 1366, 1024);
  ok(big.w === SIZES.huge[0] && big.h === SIZES.huge[1],
     'a 12.9" iPad in landscape gets the whole "huge" budget');

  const phone = previewBudget('huge', 390, 844);
  ok(phone.w < 390 && phone.h < 844,
     `the same choice on a phone is clamped to the screen (${Math.round(phone.w)}x${Math.round(phone.h)})`);
  ok(phone.w <= 390 - 2 * 10, 'with the window margin still kept');

  const tiny = previewBudget('huge', 120, 120);
  ok(tiny.w >= 150 && tiny.h >= 150,
     'and never shrinks below something you could read');

  ok(previewBudget('nonsense', 2000, 2000).w === SIZES.medium[0],
     'an unknown name falls back to medium, not to undefined');
  ok(PREVIEW_SIZES.every(([v]) => SIZES[v]),
     'every name offered in Settings is a size that exists');
  ok(PREVIEW_SIZES.length === Object.keys(SIZES).length,
     'and every size that exists is offered');
}

console.log('\n-- the box takes the drawing\'s shape --');
{
  const budget = { w: 480, h: 320 };
  const wide = previewBox(budget, 3.0);
  ok(near(wide.w, 480), 'a wide detail fills the width');
  ok(wide.h <= 320 + 1e-9, 'and stays inside the height');
  ok(near(wide.w / wide.h, 480 / 320 * 2.1, 1e-6) || wide.w / wide.h <= 3.0 + 1e-9,
     'its shape is the detail\'s, held within a factor of the budget\'s');

  const tall = previewBox(budget, 0.25);
  ok(tall.h <= 320 + 1e-9 && tall.w <= 480 + 1e-9, 'a tall detail fits too');
  ok(tall.w / tall.h > 0.25,
     'an absurd 1:4 zone is not given a 120px-wide slot to pan around in');

  const square = previewBox(budget, 1);
  ok(near(square.w, square.h), 'a square detail gets a square window');
  ok(near(square.h, 320), 'filling the budget it was given');

  for (const a of [0.05, 0.3, 1, 1.5, 4, 25]) {
    const b = previewBox(budget, a);
    if (!(b.w <= 480 + 1e-9 && b.h <= 320 + 1e-9 && b.w > 0 && b.h > 0)) {
      ok(false, `aspect ${a} stays inside the budget`);
    }
  }
  ok(true, 'no aspect, however silly, escapes the budget');
  ok(previewBox(budget, 0).w > 0 && previewBox(budget, NaN).w > 0,
     'a degenerate aspect does not produce a zero-sized window');
}

console.log('\n-- it opens on the whole detail --');
{
  const box = { w: 480, h: 320 };
  const zone = [0.30, 0.40, 0.45, 0.62];
  const g = zoneRect(zone, SHEET);
  const v = fitView(zone, SHEET, box);
  ok(v.x <= g.x + 0.5 && v.y <= g.y + 0.5
     && v.x + v.w >= g.x + g.w - 0.5 && v.y + v.h >= g.y + g.h - 0.5,
     'the view contains every pixel of the zone');
  ok(near(v.w / v.h, box.w / box.h, 1e-6),
     'and has exactly the window\'s shape, so nothing is stretched');
  ok(v.x >= 0 && v.y >= 0 && v.x + v.w <= SHEET.width && v.y + v.h <= SHEET.height,
     'and lies on the paper');

  // A detail in the very corner: the clamp must not push the zone out.
  const corner = fitView([0, 0, 0.08, 0.08], SHEET, box);
  const cg = zoneRect([0, 0, 0.08, 0.08], SHEET);
  ok(corner.x >= -0.5 && corner.y >= -0.5,
     'a corner detail does not open off the edge of the sheet');
  ok(corner.x + corner.w >= cg.w - 0.5 && corner.y + corner.h >= cg.h - 0.5,
     'and is still shown whole');

  ok(zoneAspect(zone, SHEET) > 0, 'a zone has a shape');
  const ga = zoneRect(zone, SHEET);
  ok(near(zoneAspect(zone, SHEET), ga.w / ga.h, 1e-9),
     'which is the shape of the rectangle that will be cropped');
}

console.log('\n-- zoom and pan --');
{
  const box = { w: 480, h: 320 };
  const v0 = fitView([0.3, 0.4, 0.45, 0.62], SHEET, box);

  const z = zoomView(v0, 2, 0.25, 0.75);
  ok(near(z.x + z.w * 0.25, v0.x + v0.w * 0.25, 1e-9)
     && near(z.y + z.h * 0.75, v0.y + v0.h * 0.75, 1e-9),
     'zooming holds the sheet pixel under the fingers still');
  ok(near(z.w, v0.w / 2, 1e-9), 'and 2x means half as much sheet');

  const back = zoomView(z, 0.5, 0.25, 0.75);
  ok(near(back.x, v0.x, 1e-6) && near(back.w, v0.w, 1e-6),
     'in and out about the same point returns to where it started');

  const p = panView(v0, 0.25, 0);
  ok(p.x < v0.x, 'dragging right moves the window LEFT: the drawing follows the finger');
  ok(near(p.x, v0.x - 0.25 * v0.w, 1e-9), 'by a quarter of what is on screen');

  // Zoomed out past the paper.
  const out = clampView(zoomView(v0, 0.001), SHEET);
  ok(out.w <= SHEET.width + 1e-6 && out.h <= SHEET.height + 1e-6,
     'you cannot zoom out past the whole drawing');
  ok(near(out.x + out.w / 2, SHEET.width / 2, 1e-6),
     'and the whole drawing is centred, not jammed into a corner');

  // Zoomed in past the limit.
  const inn = clampView(zoomView(v0, 1e6), SHEET, v0.w / 8);
  ok(near(inn.w, v0.w / 8, 1e-6), 'and not in past 8x the detail');
  ok(near(inn.w / inn.h, v0.w / v0.h, 1e-9), 'the shape survives both clamps');

  // Panned off the paper.
  const off = clampView(panView(v0, -10, -10), SHEET);
  ok(off.x + off.w <= SHEET.width + 1e-6 && off.y + off.h <= SHEET.height + 1e-6,
     'and you cannot slide off the sheet into white space');
  ok(off.x >= -1e-6 && off.y >= -1e-6, 'in either direction');
}

console.log('\n-- what gets decoded --');
{
  const box = { w: 480, h: 320 };
  const dpr = 2;
  const v = fitView([0.3, 0.4, 0.45, 0.62], SHEET, box);

  const r1 = sourceRequest(v, SHEET, box.w * 1);
  const r2 = sourceRequest(v, SHEET, box.w * dpr);
  ok(r2.maxWidth > r1.maxWidth * 1.9,
     `a retina screen asks for twice the pixels (${r1.maxWidth} -> ${r2.maxWidth})`);
  ok(near(r2.need, (box.w * dpr) / v.w, 1e-9),
     'the resolution wanted is canvas pixels per sheet pixel');

  ok(covers(r2.rect, v), 'the decoded rectangle covers the view');
  ok(r2.rect.w > v.w && r2.rect.h > v.h,
     'with room around it, so a small drag needs no new decode');

  const g = cropGeometry(r2.zone, SHEET);
  ok(g.sx === r2.rect.x && g.sy === r2.rect.y
     && g.sw === r2.rect.w && g.sh === r2.rect.h,
     'and it is the SAME rectangle the store will crop — one definition');

  // Never ask for more pixels than the sheet has.
  const deep = sourceRequest(clampView(zoomView(v, 64), SHEET, 1), SHEET, 4000);
  ok(deep.maxWidth <= deep.rect.w,
     'zoomed right in, it asks for native and not for pixels that do not exist');

  // The whole sheet, which is what zooming out lands on.
  const all = sourceRequest(clampView(zoomView(v, 1e-6), SHEET), SHEET, 2080);
  ok(all.rect.w >= SHEET.width - 1 && all.rect.h >= SHEET.height - 1,
     'zoomed out, the source is the whole drawing');
  ok(all.maxWidth < SHEET.width,
     'at the resolution the window can show, not at 5400px');

  // The pixel budget: a tablet has to hold this.
  const huge = sourceRequest(v, SHEET, 6000, { maxPixels: 1e6 });
  ok(huge.maxWidth * (huge.maxWidth / (huge.rect.w / huge.rect.h)) <= 1.05e6,
     'a decode is capped at the pixel budget whatever the screen asks for');
}

console.log('\n-- covers() --');
{
  const r = { x: 100, y: 100, w: 200, h: 200 };
  ok(covers(r, { x: 120, y: 120, w: 50, h: 50 }), 'inside is covered');
  ok(covers(r, { x: 100, y: 100, w: 200, h: 200 }), 'exactly is covered');
  ok(!covers(r, { x: 90, y: 120, w: 50, h: 50 }), 'off the left is not');
  ok(!covers(r, { x: 120, y: 120, w: 250, h: 50 }), 'too wide is not');
  ok(!covers(null, { x: 0, y: 0, w: 1, h: 1 }), 'and nothing covers nothing');
}

console.log('\n-- every zone in a sweep, on two sheet shapes --');
{
  // The invariants that matter, over the whole space of zones and sizes
  // rather than the handful above. 11 x 11 positions x 4 sizes x 5 boxes.
  let checked = 0;
  let zoneHeld = 0;
  const bad = [];
  for (const nat of [SHEET, PORT]) {
    for (const name of Object.keys(SIZES)) {
      const budget = previewBudget(name, 1366, 1024);
      for (let i = 0; i <= 10; i++) {
        for (let j = 0; j <= 10; j++) {
          for (const [zw, zh] of [[0.06, 0.09], [0.33, 0.33], [0.6, 0.12], [0.08, 0.5]]) {
            const x0 = (i / 10) * (1 - zw);
            const y0 = (j / 10) * (1 - zh);
            const zone = [x0, y0, x0 + zw, y0 + zh];
            const box = previewBox(budget, zoneAspect(zone, nat));
            const v = fitView(zone, nat, box);
            checked++;

            if (!(v.x >= -0.5 && v.y >= -0.5
                  && v.x + v.w <= nat.width + 0.5
                  && v.y + v.h <= nat.height + 0.5)) {
              bad.push(['view off the sheet', name, zone.join()]);
              continue;
            }
            if (!near(v.w / v.h, box.w / box.h, 1e-6)) {
              bad.push(['view not the window shape', name, zone.join()]);
              continue;
            }
            const g = zoneRect(zone, nat);
            const whole = v.x <= g.x + 0.5 && v.y <= g.y + 0.5
              && v.x + v.w >= g.x + g.w - 0.5
              && v.y + v.h >= g.y + g.h - 0.5;
            if (whole) zoneHeld++;
            else if (v.w < nat.width - 0.5 && v.h < nat.height - 0.5) {
              // Only acceptable when the paper itself ran out.
              bad.push(['detail cropped with room to spare', name, zone.join()]);
              continue;
            }

            const req = sourceRequest(v, nat, box.w * 2);
            if (!covers(req.rect, v)) {
              bad.push(['source misses the view', name, zone.join()]);
              continue;
            }
            const cg = cropGeometry(req.zone, nat);
            if (cg.sx !== req.rect.x || cg.sy !== req.rect.y
                || cg.sw !== req.rect.w || cg.sh !== req.rect.h) {
              bad.push(['rect drifted from the crop', name, zone.join()]);
              continue;
            }
            if (!Number.isInteger(req.rect.x) || !Number.isInteger(req.rect.w)
                || req.rect.x + req.rect.w > nat.width
                || req.rect.y + req.rect.h > nat.height) {
              bad.push(['rect not whole pixels on the paper', name, zone.join()]);
              continue;
            }
            if (req.maxWidth > req.rect.w) {
              bad.push(['asked for more than native', name, zone.join()]);
            }
          }
        }
      }
    }
  }
  ok(bad.length === 0,
     `${checked} zones: ${bad.length ? JSON.stringify(bad.slice(0, 3)) : 'all four invariants hold'}`);
  ok(zoneHeld === checked,
     `and the detail itself is shown whole in all ${checked} of them`);
}

console.log('\n-- the defects this replaced --');
{
  // 1. A zone smaller than the box used to be drawn at 1:1 with the rest of
  //    the window left empty: Math.min(1, maxW/bmp.width).
  const budget = previewBudget('large', 1366, 1024);
  const small = [0.5, 0.5, 0.53, 0.55];          // 162 x 72 sheet pixels
  const box = previewBox(budget, zoneAspect(small, SHEET));
  ok(box.w > 300, `a 162px-wide detail now fills a ${Math.round(box.w)}px window`);
  const v = fitView(small, SHEET, box);
  const req = sourceRequest(v, SHEET, box.w * 2);
  ok(req.maxWidth <= req.rect.w,
     'and asks only for the pixels that are there (the rest is honest upscale)');

  // 2. The crop was decoded at CSS pixels and drawn into a dpr-backed canvas.
  //
  // NOT `retina.need === cssOnly.need * 2` — need is pxWide / view.w, so
  // that holds for every implementation there could be, including the
  // broken one. The rule worth pinning is that the bitmap asked for is the
  // resolution the canvas will draw at, until the sheet runs out of pixels.
  const cssOnly = sourceRequest(v, SHEET, box.w);
  const retina = sourceRequest(v, SHEET, box.w * 2);
  const asked = r => Math.max(1, Math.round(r.rect.w * Math.min(1, r.need)));
  ok(retina.maxWidth === asked(retina) && cssOnly.maxWidth === asked(cssOnly),
     'the width asked for is rect x min(1, need): the screen\'s resolution, capped at the sheet\'s');
  ok(retina.maxWidth === cssOnly.maxWidth && retina.maxWidth === retina.rect.w,
     'on a detail this small both are already native - there is nothing more to ask for');
  const tiny = sourceRequest(v, SHEET, 10);
  ok(tiny.maxWidth < 40 && tiny.maxWidth >= 1,
     'and a small canvas asks for little, so the rule is not "always native"');

  // 3. The other half of that defect is the CALLER: the canvas is backed
  //    at device pixels, and the resolution asked for must be MEASURED in
  //    them. sourceRequest is linear in pxWide, so it cannot catch a caller
  //    that hands it the CSS width - this is where that half is pinned.
  const b = { w: 638, h: 682 };
  const one = canvasPixels(b, 1);
  const two = canvasPixels(b, 2);
  ok(one.cw === 638 && one.ch === 682, 'at dpr 1 the backing store is the box');
  ok(two.cw === 1276 && two.ch === 1364,
     `at dpr 2 it is twice the box (${two.cw}x${two.ch}) - what the iPad can show`);
  ok(two.cssW === 638 && two.cssH === 682, 'shown at the same size either way');
  ok(Math.abs(two.cw / two.ch - two.cssW / two.cssH) < 1e-12,
     'and the two have the SAME shape, so the browser never stretches it');
  ok(canvasPixels(b, 3).cw === two.cw,
     'capped: a 3x phone does not ask for 2.25x the pixels');
  ok(canvasPixels(b, 0).cw === 638 && canvasPixels(b, undefined).cw === 638,
     'a browser that reports no ratio still gets a canvas');
  ok(canvasPixels({ w: 0.2, h: 0.2 }, 2).cw === 1, 'and a silly box still has a pixel');
  const wide = fitView([0.30, 0.40, 0.45, 0.62], SHEET, b);
  const dpr1 = sourceRequest(wide, SHEET, canvasPixels(b, 1).cw);
  const dpr2 = sourceRequest(wide, SHEET, canvasPixels(b, 2).cw);
  ok(dpr2.maxWidth > dpr1.maxWidth,
     `end to end: the same window decodes ${dpr1.maxWidth}px at 1x and ${dpr2.maxWidth}px at 2x`);
  ok(dpr2.maxWidth === dpr2.rect.w,
     'at 2x this window wants every pixel the sheet has for that rectangle');
  ok(dpr1.maxWidth < dpr1.rect.w,
     `and at 1x it wants only ${Math.round(100 * dpr1.maxWidth / dpr1.rect.w)}% of them`);
}

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nAll callout-view checks passed');
process.exit(failed ? 1 : 0);
