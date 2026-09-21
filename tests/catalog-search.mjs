// The catalog matcher.
//
// Part 1 runs the desktop app's own six-item fixture from tests/test_catalog.py
// and asserts what it asserts. Running those assertions against the FULL
// 2,151-item catalog would be meaningless — of course "simpson" returns forty
// Simpson products there.
//
// Part 2 is the real check: a differential over the full catalog against what
// the Python matcher actually returns, captured by catalog-python-truth.py.
import { readFile } from 'node:fs/promises';
import { buildIndex, search } from '../js/ui/catalog.js';

let fails = 0;
const check = (desc, got, want) => {
  const ok = typeof want === 'function' ? want(got) : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FAIL ${desc}\n  got  ${JSON.stringify(got)}\n  want ${want}`); }
};

// ── Part 1: the desktop fixture, verbatim ─────────────────────────────────
const FIX = [
  { name: "2x4 x 8' DF", code: 'DF248', unit: 'EA', price: 5.25, trade: 'Framing',
    group: 'Dimensional Lumber', dims: [2, 4, 8], tags: ['d', 'df', 'lumber'], kind: 'material' },
  { name: "2x4 x 12' DF", code: 'DF2412', unit: 'EA', price: 8.45, trade: 'Framing',
    group: 'Dimensional Lumber', dims: [2, 4, 12], tags: ['d', 'df', 'lumber'], kind: 'material' },
  { name: "2x6 x 8' PT", code: 'PT268', unit: 'EA', price: 11.0, trade: 'Framing',
    group: 'Pressure Treated', dims: [2, 6, 8], tags: ['pt'], kind: 'material' },
  { name: 'HDU2 Hold-down', code: 'HDU2', unit: 'EA', price: 32.0, trade: 'Hardware',
    group: 'Hold-downs', tags: ['simpson'], kind: 'material' },
  { name: '1/2" CDX Plywood 4x8', code: 'CDX12', unit: 'SHEET', price: 52.0,
    trade: 'Sheathing', group: 'Plywood', dims: [4, 8], tags: ['1/2', 'cdx', 'ply'], kind: 'material' },
  { name: 'Framing Labor', code: 'LAB-FRAME-SF', unit: 'SF', price: 14.0,
    trade: 'Labor', group: 'Labor', kind: 'labor' },
];
const IDX = buildIndex(FIX);
const S = q => search(IDX, q).map(i => i.code);

console.log('-- the desktop fixture (tests/test_catalog.py) --');
check('S("248d")[0]', S('248d')[0], 'DF248');
check('S("d248")[0]', S('d248')[0], 'DF248');
check('S("248df")[0]', S('248df')[0], 'DF248');
check('S("DF248")[0] exact code wins', S('DF248')[0], 'DF248');
check('S("2x4x8")[0]', S('2x4x8')[0], 'DF248');
check('S("2412")[0]', S('2412')[0], 'DF2412');
check('S("248d lumber") narrows', S('248d lumber'), ['DF248']);
check('S("248d hardware") empties', S('248d hardware'), []);
check('S("pt268")[0]', S('pt268')[0], 'PT268');
check('S("268pt")[0]', S('268pt')[0], 'PT268');
check('S("hdu2")', S('hdu2'), ['HDU2']);
check('S("simpson")', S('simpson'), ['HDU2']);
check('S("1/2 cdx")', S('1/2 cdx'), ['CDX12']);
check('"DF248" in S("24")', S('24'), g => g.includes('DF248'));
check('"DF2412" in S("24")', S('24'), g => g.includes('DF2412'));
check('S("labor")[0]', S('labor')[0], 'LAB-FRAME-SF');
check('S("")', S(''), []);
check('S("   ")', S('   '), []);
check('S("zzzz")', S('zzzz'), []);
check('S("2x4") all DF24*', S('2x4'), g => g.length > 0 && g.every(c => c.startsWith('DF24')));
check('order never matters',
  JSON.stringify([...S('df 8')].sort()), JSON.stringify([...S('8 df')].sort()));
check('S("df248")[0] exact code above everything', S('df248')[0], 'DF248');

// RUNS and DIMSEP carry the /g flag. `.match()` and `.replace()` both reset
// lastIndex, but a stateful regex is a classic JS trap — prove it rather than
// trusting it.
{
  const a = S('2x4x8');
  S('1/2 cdx'); S('248d'); S('hdu2'); S('2412');
  check('no regex state leaks across searches', JSON.stringify(S('2x4x8')), JSON.stringify(a));
}

// ── Part 2: differential against the Python, full catalog ─────────────────
let truth = null;
try {
  truth = JSON.parse(await readFile(new URL('./catalog-python-truth.json', import.meta.url), 'utf-8'));
} catch {
  console.log('\n(no Python truth file — run `python tests/catalog-python-truth.py` to generate one)');
}

if (truth) {
  console.log(`\n-- differential vs the desktop matcher, ${truth.itemCount} items --`);
  const data = JSON.parse(await readFile(new URL('../data/materials_catalog.json', import.meta.url), 'utf-8'));
  const full = buildIndex(Array.isArray(data) ? data : data.items);
  const queries = Object.keys(truth.results);
  let same = 0;
  for (const q of queries) {
    const want = truth.results[q];
    const got = search(full, q).map(i => i.code);
    if (JSON.stringify(got) === JSON.stringify(want)) { same += 1; continue; }
    fails++;
    console.log(`FAIL query ${JSON.stringify(q)}  (js ${got.length} results, python ${want.length})`);
    console.log(`  js     ${JSON.stringify(got.slice(0, 6))}`);
    console.log(`  python ${JSON.stringify(want.slice(0, 6))}`);
  }
  console.log(`  ${same}/${queries.length} queries identical to the desktop matcher`);

  // The desktop budget: 400 searches over the full index in under 2 s.
  const t0 = Date.now();
  for (let i = 0; i < 400; i++) search(full, queries[i % queries.length]);
  const ms = Date.now() - t0;
  if (ms > 2000) { fails++; console.log(`FAIL speed: 400 searches took ${ms}ms, budget 2000ms`); }
  console.log(`  400 searches over ${full.length} items: ${ms}ms (budget 2000ms)`);
}

console.log(fails ? `\n${fails} CATALOG CHECK(S) FAILED` : '\nAll catalog behaviours match the desktop app');
process.exit(fails ? 1 : 0);
