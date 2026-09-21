// study-layout.mjs — the continuous view must land a gesture on the same
// sheet, at the same coordinates, as the single-sheet view would.
//
// This is the one thing study mode cannot get wrong. An error here does not
// crash: it files a wall against the wrong drawing and saves it.
//
// Run: node tests/study-layout.mjs
import {
  buildLayout, worldToPage, pageToWorld, pageAtWorldY,
  visiblePages, anchorPage, pageWorldRect, GUTTER,
} from '../js/render/layout.js';

let failed = 0;
const ok = (cond, msg) => {
  if (cond) { console.log('  ok   ' + msg); return; }
  failed++;
  console.log('  FAIL ' + msg);
};

const uniform = n => Array.from({ length: n }, () => ({ width: 5400, height: 3600 }));

console.log('-- the stack --');
{
  const L = buildLayout(uniform(3));
  ok(L.pages[0].y === 0, 'the first sheet starts at zero');
  ok(L.pages[1].y === 3600 + GUTTER, 'the second clears the first plus a gutter');
  ok(L.pages[2].y === 2 * (3600 + GUTTER), 'and so on');
  ok(L.height === 3 * 3600 + 2 * GUTTER,
     `no trailing gutter: ${L.height} = 3 sheets + 2 gaps`);
  ok(L.width === 5400, 'the document is as wide as its widest sheet');
}

console.log('\n-- mixed sizes, which two real jobs have --');
{
  const L = buildLayout([
    { width: 5400, height: 3600 },
    { width: 1683, height: 2400 },
    { width: 1918, height: 2400 },
  ]);
  ok(L.width === 5400, 'widest wins');
  ok(L.pages[0].x === 0, 'the widest sheet is flush');
  ok(L.pages[1].x === Math.round((5400 - 1683) / 2), 'a narrow sheet is centred');
  ok(L.pages[1].y === 3600 + GUTTER && L.pages[2].y === 3600 + 2400 + 2 * GUTTER,
     'heights stack independently');
}

console.log('\n-- THE INVARIANT: a round trip changes nothing --');
{
  const L = buildLayout([
    { width: 5400, height: 3600 },
    { width: 1683, height: 2400 },
    { width: 6300, height: 4500 },
    { width: 5400, height: 3600 },
  ]);
  let worst = 0;
  let wrongPage = 0;
  for (let page = 0; page < L.pages.length; page++) {
    const p = L.pages[page];
    for (const [px, py] of [[0, 0], [1, 1], [p.width / 2, p.height / 2],
                            [p.width - 1, p.height - 1], [13.75, 907.5]]) {
      const w = pageToWorld(L, page, px, py);
      const back = worldToPage(L, w.x, w.y);
      if (!back || back.page !== page) { wrongPage++; continue; }
      worst = Math.max(worst, Math.abs(back.x - px), Math.abs(back.y - py));
    }
  }
  ok(wrongPage === 0, 'every point comes back on the sheet it went in on');
  ok(worst === 0, `and at exactly the same coordinates (worst drift ${worst})`);
}

console.log('\n-- page 0 is the identity, so single-sheet view is unaffected --');
{
  const L = buildLayout(uniform(4));
  const r = worldToPage(L, 123.5, 456.25);
  ok(r.page === 0 && r.x === 123.5 && r.y === 456.25,
     'a point on the first sheet needs no adjustment at all');
}

console.log('\n-- the gutter belongs to the sheet above --');
{
  const L = buildLayout(uniform(3));
  const gapY = 3600 + GUTTER / 2;
  ok(pageAtWorldY(L, gapY) === 0,
     'a gesture in the gap does not jump forward a page');
  ok(pageAtWorldY(L, 3600 + GUTTER) === 1, 'the next sheet starts exactly at its top');
  ok(pageAtWorldY(L, -50) === 0, 'above the set is the first sheet');
  ok(pageAtWorldY(L, 1e9) === 2, 'below the set is the last sheet');
}

console.log('\n-- which sheets are on screen --');
{
  const L = buildLayout(uniform(10));
  const h = 3600 + GUTTER;
  ok(JSON.stringify(visiblePages(L, 0, 100)) === '[0]', 'one sheet, one page');
  const across = visiblePages(L, 3500, h + 100);
  ok(across.includes(0) && across.includes(1),
     `a range spanning a boundary returns both — ${JSON.stringify(across)}`);
  const padded = visiblePages(L, 5 * h, 5 * h + 100, 2);
  ok(padded[0] === 3 && padded[padded.length - 1] === 7,
     `pad reaches two either side — ${JSON.stringify(padded)}`);
  const top = visiblePages(L, 0, 100, 3);
  ok(top[0] === 0, 'the pad never goes below zero');
  const bot = visiblePages(L, 9 * h, 9 * h + 3600, 3);
  ok(bot[bot.length - 1] === 9, 'nor past the last sheet');
}

console.log('\n-- the anchor sheet --');
{
  const L = buildLayout(uniform(5));
  const h = 3600 + GUTTER;
  ok(anchorPage(L, 0, 800) === 0, 'the middle of the screen decides');
  ok(anchorPage(L, 2 * h - 400, 2 * h + 400) === 2,
     'a boundary near the centre resolves to the sheet the centre is in');
}

console.log('\n-- an unknown size still occupies space --');
{
  const L = buildLayout([
    { width: 5400, height: 3600 }, null, { width: 5400, height: 3600 },
  ]);
  ok(L.pages[1].assumed === true, 'the unknown one is flagged');
  ok(L.pages[1].width === 5400 && L.pages[1].height === 3600,
     'it stands in with the commonest size in the set, not a guess');
  ok(L.pages[2].y === 2 * (3600 + GUTTER),
     'so nothing below it jumps when the real size arrives');
}

console.log('\n-- degenerate input --');
{
  const L = buildLayout([]);
  ok(L.pages.length === 0 && L.height === 0, 'an empty set has no height');
  ok(worldToPage(L, 0, 0) === null, 'and no point maps into it');
  ok(pageWorldRect(L, 0) === null, 'and no rectangle');
  ok(JSON.stringify(visiblePages(L, 0, 100)) === '[]', 'and nothing is visible');
}

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nAll study-layout checks passed');
process.exit(failed ? 1 : 0);
