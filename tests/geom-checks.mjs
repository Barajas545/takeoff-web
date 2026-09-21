// Cross-checks against the Python formulas, run without a browser.
import { pointsAlongPath, tileLayout, polygonArea, perimeter, slopeFactor,
         selfIntersects, constrainTo45, gridPoints } from '../js/core/geom.js';
import { formatFt, formatFtIn, formatDistancePrecision, parseFeet,
         computePixelsPerFoot, scaleLabelFor } from '../js/core/units.js';

let fails = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};
const near = (name, got, want, tol = 1e-6) => {
  if (Math.abs(got - want) > tol) { fails++; console.log(`FAIL ${name}: got ${got}, want ${want}`); }
};

// ── spacing resets at corners ──
// An L: 100px then 100px, spacing 30. Segment 1: 0,30,60,90 then corner(100).
// Segment 2 restarts at 30: 130,160,190 then end(200). 4+4 = 8 points.
const L = [[0,0],[100,0],[100,100]];
eq('array/L corner reset count', pointsAlongPath(L, 30).length, 9);
eq('array/first point on start', pointsAlongPath(L, 30)[0], [0,0]);
eq('array/corner emitted', pointsAlongPath(L, 30)[4], [100,0]);
eq('array/end emitted', pointsAlongPath(L, 30).at(-1), [100,100]);
eq('array/degenerate spacing', pointsAlongPath(L, 0).length, 3);
eq('array/single point', pointsAlongPath([[5,5]], 10), [[5,5]]);

// ── area / perimeter ──
near('area/unit square', polygonArea([[0,0],[10,0],[10,10],[0,10]]), 100);
near('area/winding independent', polygonArea([[0,10],[10,10],[10,0],[0,0]]), 100);
near('perimeter/closed', perimeter([[0,0],[10,0],[10,10],[0,10]]), 40);
eq('bowtie detected', selfIntersects([[0,0],[10,10],[10,0],[0,10]]), true);
eq('square not self-intersecting', selfIntersects([[0,0],[10,0],[10,10],[0,10]]), false);

// ── slope: sqrt(1 + (p/12)^2) == sqrt(144+p^2)/12 ──
for (const p of [0, 3, 4, 6, 8, 12, 18]) {
  near(`slope factor ${p}:12`, slopeFactor(p), Math.sqrt(1 + (p/12)**2), 1e-12);
}
near('slope 4:12 value', slopeFactor(4), 1.05409255338946, 1e-12);

// ── 45 constraint keeps DISTANCE, snaps ANGLE ──
{
  const out = constrainTo45([0,0], [10, 3]);
  near('constrain keeps distance', Math.hypot(out[0], out[1]), Math.hypot(10,3), 1e-9);
  near('constrain snaps to 0 deg', out[1], 0, 1e-9);
}

// ── scale ──
near('ppf 1/4in at 150dpi', computePixelsPerFoot(150, 0.25, 1), 37.5);
near('ppf 1in=10ft at 150dpi', computePixelsPerFoot(150, 1, 10), 15);
eq('label 1/4', scaleLabelFor(37.5, 150), '1/4"');
eq('label 1in=10ft', scaleLabelFor(15, 150), '1" = 10 ft');
eq('label calibrated', scaleLabelFor(12.56, 150), '12.6 px/ft');

// ── formatting, against the Python ──
eq('format_ft 12.5', formatFt(12.5), `12'-6"`);
eq('format_ft 0', formatFt(0), `0'-0"`);
eq('format_ft 0.9999', formatFt(0.9999), `1'-0"`);
eq('format_ft_in 12.5417', formatFtIn(12.5417), `12' 6 1/2"`);
eq('format_ft_in 0.0625', formatFtIn(0.0625), `3/4"`);
eq('format_ft_in exact ft', formatFtIn(3), `3' 0"`);
eq('precision NearestInch 12.5', formatDistancePrecision(12.5, 'Nearest Inch'), `12'-6"`);
eq('precision NearestInch whole ft', formatDistancePrecision(12, 'Nearest Inch'), `12'`);
eq('precision NearestInch under 1ft', formatDistancePrecision(0.5, 'Nearest Inch'), `6"`);
eq('precision InchesOnly', formatDistancePrecision(1.03125, 'Inches Only'), `12-3/8"`);
eq('precision 1/2', formatDistancePrecision(12.5417, '1/2'), `12'-6-1/2"`);
eq('precision 1/16', formatDistancePrecision(12.5417, '1/16'), `12'-6-1/2"`);
eq('precision 1/2 whole', formatDistancePrecision(12, '1/2'), `12'`);

// ── parseFeet ──
eq('parse 12', parseFeet('12'), 12);
eq('parse 12.5', parseFeet('12.5'), 12.5);
near('parse 12\'6"', parseFeet(`12'6"`), 12.5);
near('parse 12\'-6"', parseFeet(`12'-6"`), 12.5);
near('parse 12\' 6 1/2"', parseFeet(`12' 6 1/2"`), 12 + 6.5/12);
near('parse 6"', parseFeet(`6"`), 0.5);
eq('parse junk', parseFeet('hello'), null);
eq('parse blank', parseFeet('  '), null);

// ── tile cap: a whole Arch-D sheet of 1in mosaic at 1/4in scale ──
{
  const ppf = 37.5;
  const w = 36 * 150, h = 24 * 150;              // Arch D at 150 dpi, in px
  const poly = [[0,0],[w,0],[w,h],[0,h]];
  const t = 1/12 * ppf;                           // a 1-inch tile in page px
  const t0 = Date.now();
  const out = tileLayout(poly, { anchor:[0,0], tileW:t, tileH:t, grout:0, pattern:'grid' });
  const ms = Date.now() - t0;
  if (!out.capped) { fails++; console.log('FAIL tile cap: 2M-tile layout was not capped'); }
  if (ms > 500) { fails++; console.log(`FAIL tile cap: took ${ms}ms`); }
  // A capped layout still has to answer with a number, not zero.
  if (!(out.count > 1e6)) { fails++; console.log(`FAIL tile cap: count was ${out.count}`); }
  console.log(`  tile cap: capped=${out.capped}, area estimate ${out.count.toLocaleString()} in ${ms}ms`);
}
// ── a realistic tile run still works ──
{
  const ppf = 37.5, t = 37.5;                     // 12-inch tiles
  const poly = [[0,0],[20*ppf,0],[20*ppf,15*ppf],[0,15*ppf]];   // 20 x 15 ft
  const out = tileLayout(poly, { anchor:[0,0], tileW:t, tileH:t, grout:0, pattern:'grid' });
  if (out.capped) { fails++; console.log('FAIL: a 300 sq ft floor was capped'); }
  near('tile count 20x15 ft of 12in', out.count, 300, 0);
}
// ── running bond offsets every other course ──
{
  const a = tileLayout([[0,0],[100,0],[100,100],[0,100]], {anchor:[0,0],tileW:20,tileH:20,pattern:'grid'});
  const b = tileLayout([[0,0],[100,0],[100,100],[0,100]], {anchor:[0,0],tileW:20,tileH:20,pattern:'half'});
  if (JSON.stringify(a.whole) === JSON.stringify(b.whole)) {
    fails++; console.log('FAIL: running bond laid out identically to straight grid');
  }
}

// ── grid cells ──
eq('grid 4x3 cells', gridPoints([0,0],[40,30],10,10,0).length, 12);

console.log(fails ? `\n${fails} CHECK(S) FAILED` : '\nAll geometry and formatting checks passed');
process.exit(fails ? 1 : 0);
