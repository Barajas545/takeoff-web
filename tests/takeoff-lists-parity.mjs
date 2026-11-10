// TAKEOFF LISTS (desktop 3.08): js/core/takeoff-lists.js == the desktop's
// own functions, lifted by text.
//
// An item filed in a takeoff other than Main carries `takeoff_list`; the
// job's takeoffs are its metadata. Which takeoff an item is in, what a
// takeoff is called and which names two takeoffs may not share are each
// read in one place on each side -- and a reading that parts by one
// character (a tag padded with a character one side calls whitespace, a name
// cut at 60 UTF-16 units on one side and 60 code points on the other) puts
// an item in a different takeoff on the two screens. So:
//
//   1. the committed tests/data/takeoff-lists-truth.json -- the desktop's
//      answers on a corpus of edge cases -- is replayed through the module;
//   2. the web's own readings, which the desktop has no twin for (a tag the
//      registry does not know is still another takeoff; the words; the
//      clause of the sentence on open), and that nothing here writes;
//   3. the wiring: the worker precaches the module, the runner runs this;
//   4. live, when the desktop source is here: tests/takeoff-lists-python-
//      truth.py is run on it, the module is held to that, and the snapshot
//      must still be the desktop's answer.
//
// The truths for takeoff_where_words and takeoff_others_moved_words are in
// the snapshot too; their JS twins are counting.js's (the money sentences),
// and are held to them there.
//
// Run: node tests/takeoff-lists-parity.mjs
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DATA, DESKTOP_SRC, haveDesktopSource } from './config.mjs';
import * as TL from '../js/core/takeoff-lists.js';
import { setTakeoffNaming, takeoffWhereWords, takeoffOthersMovedWords } from '../js/core/counting.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);

let checks = 0;
let fails = 0;
const log = s => console.log(s);
function ok(label, cond, detail = '') {
  checks += 1;
  if (cond) return true;
  fails += 1;
  log(`FAIL ${label}${detail ? `\n  ${detail}` : ''}`);
  return false;
}
function eq(label, got, want) {
  checks += 1;
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) return true;
  fails += 1;
  log(`FAIL ${label}\n  got  ${a}\n  want ${b}`);
  return false;
}
// A record's keys in sorted order: JavaScript puts an integer-like key
// first whatever the file says, so key ORDER is not compared, keys and
// values are.
const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map(kk => [kk, x[kk]])) : x));
const short = v => JSON.stringify(v).slice(0, 120);
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const naming = n => (n === null ? null : [n[0], [...n[1].entries()]]);

/** One pass of the desktop's answers through the module; one check per
 *  family, each naming its first few disagreements. */
function checkTruth(T, tag) {
  log(`\n-- ${tag}: ${T.predicates.length} items, ${T.setters.length} writes, ${T.clean.length} names, `
    + `${T.free.length} free names, ${T.registries.length} registries, ${T.counts.length} stores --`);
  eq(`${tag}: the constants`, [TL.TAKEOFF_LIST_KEY, TL.MAIN_TAKEOFF_LABEL, TL.TAKEOFF_NAME_MAX],
    [T.constants.TAKEOFF_LIST_KEY, T.constants.MAIN_TAKEOFF_LABEL, T.constants.TAKEOFF_NAME_MAX]);

  const bad = { scoped: [], of: [], in: [], view: [] };
  for (const p of T.predicates) {
    const m = clone(p.m);
    if (TL.takeoffListScoped(m) !== p.scoped) bad.scoped.push(short(p.m));
    if (TL.takeoffListOf(m) !== p.of) bad.of.push(`${short(p.m)} -> ${JSON.stringify(TL.takeoffListOf(m))}`);
    const got = T.ids.map(i => TL.inTakeoffList(m, i));
    if (JSON.stringify(got) !== JSON.stringify(p.in)) bad.in.push(`${short(p.m)} ${JSON.stringify(got)}`);
    // the canvas's view test (GLPageWidget.in_active_list) is the same
    // predicate asked with the takeoff he is in
    if (JSON.stringify(got) !== JSON.stringify(p.view)) bad.view.push(short(p.m));
    if (canon(m) !== canon(p.m)) bad.of.push(`a reading WROTE ${short(p.m)}`);
  }
  for (const [k, list] of Object.entries(bad)) {
    ok(`${tag}: ${{ scoped: 'takeoffListScoped == takeoff_list_scoped', of: 'takeoffListOf == takeoff_list_of',
      in: 'inTakeoffList == in_takeoff_list, for every id', view: '...and == the canvas\'s in_active_list' }[k]}`
      + ` (${T.predicates.length} items)`, !list.length, list.slice(0, 4).join('\n  '));
  }

  const badSet = [];
  for (const s of T.setters) {
    const d = clone(s.d);
    TL.setTakeoffList(d, s.id);
    if (JSON.stringify(d) !== JSON.stringify(s.after)) badSet.push(`${short(s.d)} ${JSON.stringify(s.id)} -> ${short(d)}`);
  }
  ok(`${tag}: setTakeoffList == _set_takeoff_list: set, popped, or left alone (${T.setters.length})`,
    !badSet.length, badSet.slice(0, 4).join('\n  '));

  const badClean = T.clean.filter(c => TL.cleanTakeoffName(clone(c.s)) !== c.out)
    .map(c => `${JSON.stringify(c.s)} -> ${JSON.stringify(TL.cleanTakeoffName(clone(c.s)))} (desktop ${JSON.stringify(c.out)})`);
  ok(`${tag}: cleanTakeoffName == clean_takeoff_name (${T.clean.length})`, !badClean.length, badClean.slice(0, 4).join('\n  '));

  const badFree = T.free.filter(f => TL.freeTakeoffName(clone(f.s), clone(f.taken)) !== f.out)
    .map(f => `${JSON.stringify(f.s)} ${JSON.stringify(f.taken)} -> ${JSON.stringify(TL.freeTakeoffName(clone(f.s), clone(f.taken)))}`
      + ` (desktop ${JSON.stringify(f.out)})`);
  ok(`${tag}: freeTakeoffName == free_takeoff_name (${T.free.length})`, !badFree.length, badFree.slice(0, 4).join('\n  '));

  const badReg = { lists: [], labels: [], has: [], naming: [], deck: [], wrote: [] };
  for (const r of T.registries) {
    const md = clone(r.md);
    const before = canon(md);
    if (canon(TL.takeoffLists(md)) !== canon(r.lists)) {
      badReg.lists.push(`${short(r.md)}\n    got  ${short(TL.takeoffLists(md))}\n    want ${short(r.lists)}`);
    }
    const labels = T.label_ids.map(i => TL.takeoffListLabel(md, i));
    if (JSON.stringify(labels) !== JSON.stringify(r.labels)) badReg.labels.push(`${short(r.md)} ${JSON.stringify(labels)}`);
    // with no item tagged, the web's "has others" is the desktop's
    if (TL.hasOtherTakeoffs(md, {}) !== r.has) badReg.has.push(short(r.md));
    if (JSON.stringify(naming(TL.takeoffNamingOf(md, {}, ''))) !== JSON.stringify(r.naming)) {
      badReg.naming.push(`${short(r.md)} ${JSON.stringify(naming(TL.takeoffNamingOf(md, {}, '')))}`);
    }
    if (JSON.stringify(naming(TL.takeoffNamingOf(md, {}, 'tl-1a2b3c4d'))) !== JSON.stringify(r.naming_in_deck)) {
      badReg.deck.push(short(r.md));
    }
    if (canon(md) !== before) badReg.wrote.push(short(r.md));
  }
  const words = {
    lists: 'takeoffLists == PDFCacheViewer.takeoff_lists: ids, labels, every other field kept',
    labels: 'takeoffListLabel == takeoff_list_label, for every id',
    has: 'with no tag on an item, hasOtherTakeoffs == has_takeoff_lists',
    naming: 'takeoffNamingOf == _takeoff_naming_now, in Main: Main\'s name first, then the registry',
    deck: '...and with the canvas in Deck',
    wrote: 'no reading writes the metadata',
  };
  for (const [k, list] of Object.entries(badReg)) {
    ok(`${tag}: ${words[k]} (${T.registries.length})`, !list.length, list.slice(0, 3).join('\n  '));
  }

  const badCount = [];
  for (const c of T.counts) {
    const md = clone(c.md);
    const store = clone(c.store);
    const before = canon([md, store]);
    for (const [id, want] of c.items) {
      // the counts otherTakeoffs reports: Main's from a takeoff he is not
      // in, every other id's from Main; an id with no items is 0 (or not
      // listed at all)
      const from = id ? TL.otherTakeoffs(md, store, '') : TL.otherTakeoffs(md, store, 'tl-1a2b3c4d');
      const got = (from.find(o => o.id === id) || { n: 0 }).n;
      if (got !== want) badCount.push(`${short(c.md)} ${JSON.stringify(id)}: ${got} (desktop ${want})`);
    }
    if (canon([md, store]) !== before) badCount.push(`counting WROTE ${short(c.md)}`);
  }
  ok(`${tag}: otherTakeoffs' counts == _takeoff_items: items, once, by their main shape (no run, no Group)`,
    !badCount.length, badCount.slice(0, 4).join('\n  '));
  ok(`${tag}: the money words' truths are recorded for counting.js (${T.where.length} + ${T.moved.length})`,
    T.where.length > 100 && T.moved.length > 30 && typeof T.moved_naming_raises === 'string');

  // counting.js's twins of the desktop's two money-word functions. A naming
  // recorded as [active, [[id, name], ...]] is the desktop's (active, dict):
  // here [active, Map]; anything else (null, a malformed value) is handed
  // over as it is, as the harness handed it.
  const asNaming = n => (Array.isArray(n) && n.length === 2 && Array.isArray(n[1])
    ? [n[0], new Map(n[1])] : clone(n));
  const badWhere = T.where.filter(w => takeoffWhereWords(clone(w.m), asNaming(w.naming)) !== w.out)
    .map(w => `${short(w.m)} ${short(w.naming)}: ${JSON.stringify(takeoffWhereWords(clone(w.m), asNaming(w.naming)))}`
      + ` (desktop ${JSON.stringify(w.out)})`);
  ok(`${tag}: takeoffWhereWords == takeoff_where_words (${T.where.length})`, !badWhere.length,
    badWhere.slice(0, 4).join('\n  '));
  const picture = rows => new Map(rows.map(([k, m, q, u]) => [k, [clone(m), [q, u]]]));
  const badMoved = [];
  try {
    for (const c of T.moved) {
      setTakeoffNaming(c.naming === null ? null : () => asNaming(c.naming));
      const got = takeoffOthersMovedWords(picture(c.before), picture(c.after), c.future);
      if (got !== c.out) badMoved.push(`${short([c.before, c.after])} ${short(c.naming)} ${c.future}: `
        + `${JSON.stringify(got)} (desktop ${JSON.stringify(c.out)})`);
    }
    setTakeoffNaming(() => { throw new Error('the naming hook raised'); });
    const raising = takeoffOthersMovedWords(picture([['d', { type: 'area', name: 'Boards', takeoff_list: 'tl-1a2b3c4d' }, 1, 'SF']]),
      picture([['d', { type: 'area', name: 'Boards', takeoff_list: 'tl-1a2b3c4d' }, 2, 'SF']]), false);
    if (raising !== T.moved_naming_raises) badMoved.push(`a raising hook: ${JSON.stringify(raising)} (desktop ${JSON.stringify(T.moved_naming_raises)})`);
  } finally {
    setTakeoffNaming(null);
  }
  ok(`${tag}: takeoffOthersMovedWords == takeoff_others_moved_words, a raising hook included (${T.moved.length + 1})`,
    !badMoved.length, badMoved.slice(0, 4).join('\n  '));

  // The values str() spells its own way and py-json reads out of a file --
  // NaN, the infinities, true -- recorded by name (JSON cannot carry them)
  // and made again here. NaN is the one that moves an item: Python calls it
  // TRUE, so its tag reads 'nan' -- another takeoff, never Main.
  const SPECIAL = { nan: NaN, inf: Infinity, '-inf': -Infinity, True: true };
  const sp = T.specials || [];
  const badSp = [];
  for (const s of sp) {
    const v = SPECIAL[s.value];
    if (s.type === 'registry') {
      const md = { takeoff_lists: [{ list_id: v, label: 'Odd' }, { list_id: 'tl-1a2b3c4d', label: 'Deck' }],
        takeoff_list_active: v };
      const got = { lists: TL.takeoffLists(md), labels: [v, 'nan', 'True', 'tl-1a2b3c4d'].map(i => TL.takeoffListLabel(md, i)),
        naming: naming(TL.takeoffNamingOf(md, {}, '')), naming_in: naming(TL.takeoffNamingOf(md, {}, v)) };
      const want = { lists: s.lists, labels: s.labels, naming: s.naming, naming_in: s.naming_in };
      if (canon(got) !== canon(want)) badSp.push(`${s.value} registry: ${short(got)}`);
      continue;
    }
    const m = { type: s.type, takeoff_list: v };
    const d = { type: s.type, name: 'x', takeoff_list: 'tl-1a2b3c4d' };
    TL.setTakeoffList(d, v);
    const asked = [{ type: s.type }, { type: s.type, takeoff_list: 'nan' }, { type: s.type, takeoff_list: 'True' },
      { type: s.type, takeoff_list: 'tl-1a2b3c4d' }];
    const got = { of: TL.takeoffListOf(m), in: T.ids.map(i => TL.inTakeoffList(m, i)), asked: asked.map(x => TL.inTakeoffList(x, v)), set: d };
    const want = { of: s.of, in: s.in, asked: s.asked, set: s.set };
    if (JSON.stringify(got) !== JSON.stringify(want) || JSON.stringify(s.view) !== JSON.stringify(s.in)) {
      badSp.push(`${s.value} ${s.type}: ${short(got)} (desktop ${short(want)})`);
    }
  }
  ok(`${tag}: a tag or an id of NaN, Infinity, -Infinity or true reads as Python's str() reads it (${sp.length})`,
    sp.length >= 20 && !badSp.length, badSp.slice(0, 4).join('\n  ') || `${sp.length} recorded`);
}

// ═══ 1. the committed snapshot ═══════════════════════════════════════════
let SNAP = null;
try {
  SNAP = JSON.parse(await readFile(new URL('takeoff-lists-truth.json', DATA), 'utf-8'));
} catch (err) {
  ok('tests/data/takeoff-lists-truth.json is committed (regenerate: python -B '
    + 'tests/takeoff-lists-python-truth.py <pdf_fast_viewer.py 3.08> --write)', false, err.message);
}
if (SNAP) checkTruth(SNAP, 'snapshot');

// ═══ 2. the web's own readings ══════════════════════════════════════════
log('\n-- 2. the web\'s own: a tag with no record, the words, the clause on open --');
const DECK = 'tl-1a2b3c4d';
const PATIO = 'tl-0000beef';
const REG = [{ list_id: DECK, label: 'Deck' }, { list_id: PATIO, label: 'Patio' }];
eq('the web is in Main, always, this round', TL.WEB_TAKEOFF, '');

const store = () => ({
  0: [{ type: 'area', name: 'Slab' },
    { type: 'area', name: 'Boards', group_id: 'g2', takeoff_list: DECK },
    { type: 'count', name: 'Posts', takeoff_list: ` ${DECK} ` },
    { type: 'textnote', takeoff_list: 'tl-on-a-note' }],
  1: [{ type: 'area', name: 'Boards', group_id: 'g2', group_child: true, takeoff_list: DECK }],
  '-1000': [{ type: 'standalone', name: 'Screws', takeoff_list: DECK },
    { type: 'group', name: 'Stairs', takeoff_list: DECK }],
});
const onlyTag = { 0: [{ type: 'area', name: 'Odd', takeoff_list: 'tl-gone' }] };
ok('a job with no registry and no tag has no other takeoff', !TL.hasOtherTakeoffs({}, { 0: [{ type: 'area' }] }));
ok('a tag the registry has no record of is another takeoff: never folded into Main',
  TL.hasOtherTakeoffs({}, onlyTag));
ok('a blank or padded-blank tag is Main', !TL.hasOtherTakeoffs({}, { 0: [{ type: 'area', takeoff_list: '   ' }] }));
ok('a stray tag on a shared mark (a note, a callout, a ruler) is not a takeoff',
  !TL.hasOtherTakeoffs({}, { 0: [{ type: 'textnote', takeoff_list: DECK }, { type: 'page_ref', takeoff_list: DECK },
    { type: 'distance', takeoff_list: DECK }] }));
ok('a tagged Group container alone is another takeoff (it is one takeoff\'s)',
  TL.hasOtherTakeoffs({}, { '-1000': [{ type: 'group', takeoff_list: 'tl-g' }] }));
eq('...and the names a money sentence asks for are Main\'s alone: the item reads "another takeoff"',
  naming(TL.takeoffNamingOf({ takeoff_main_label: 'House' }, onlyTag)), ['', [['', 'House']]]);
eq('a job with only Main names nothing (every sentence is 3.07\'s)', TL.takeoffNamingOf({}, { 0: [{ type: 'area' }] }), null);
eq('an id that looks like an integer comes after Main, not before it',
  naming(TL.takeoffNamingOf({ takeoff_lists: [{ list_id: '5', label: 'Five' }] }, {}))[1].map(p => p[0]), ['', '5']);

eq('otherTakeoffs: the registry in order, then the ids it has no record of',
  TL.otherTakeoffs({ takeoff_lists: REG }, { ...store(), 2: [{ type: 'area', takeoff_list: 'tl-zz' },
    { type: 'area', takeoff_list: 'tl-aa' }, { type: 'area', takeoff_list: 'tl-aa' }] }),
  [{ id: DECK, label: 'Deck', known: true, n: 3 }, { id: PATIO, label: 'Patio', known: true, n: 0 },
    { id: 'tl-aa', label: '', known: false, n: 2 }, { id: 'tl-zz', label: '', known: false, n: 1 }]);
eq('...in Python\'s order of strings (by code point: an astral character after U+FFFD)',
  TL.otherTakeoffs({}, { 0: [{ type: 'area', takeoff_list: '\u{1F3E0}' }, { type: 'area', takeoff_list: '�' }] })
    .map(o => o.id), ['�', '\u{1F3E0}']);
eq('...with Main first when the takeoff asked about is not Main',
  TL.otherTakeoffs({ takeoff_lists: REG, takeoff_main_label: 'House' }, store(), DECK).map(o => [o.id, o.label, o.n]),
  [['', 'House', 1], [PATIO, 'Patio', 0]]);
const others = TL.otherTakeoffs({ takeoff_lists: REG }, store());
eq('the words: two takeoffs', TL.otherTakeoffsWords(others), 'Deck (3 items) and Patio (nothing in it yet)');
eq('the words: one item', TL.otherTakeoffsWords([{ id: DECK, label: 'Deck', known: true, n: 1 }]), 'Deck (1 item)');
eq('the words: three', TL.otherTakeoffsWords([{ label: 'Deck', known: true, n: 12 }, { label: 'Patio', known: true, n: 1 },
  { label: 'Shed', known: true, n: 0 }]), 'Deck (12 items), Patio (1 item) and Shed (nothing in it yet)');
eq('the words: a takeoff with no record', TL.otherTakeoffsWords(TL.otherTakeoffs({}, onlyTag)),
  'a takeoff this job has no record of (1 item)');
eq('the words: none', TL.otherTakeoffsWords([]), '');

eq('left in: a takeoff it has a record of', TL.leftInTakeoffLabel({ takeoff_lists: REG, takeoff_list_active: DECK }), 'Deck');
eq('left in: read trimmed, as the desktop reads it',
  TL.leftInTakeoffLabel({ takeoff_lists: REG, takeoff_list_active: ` ${PATIO} ` }), 'Patio');
eq('left in: one it has no record of opens in Main, and says nothing',
  TL.leftInTakeoffLabel({ takeoff_lists: REG, takeoff_list_active: 'tl-gone' }), '');
eq('left in: Main, or no key', [TL.leftInTakeoffLabel({ takeoff_lists: REG, takeoff_list_active: '' }),
  TL.leftInTakeoffLabel({ takeoff_lists: REG }), TL.leftInTakeoffLabel({})], ['', '', '']);

{
  // Nothing that reads writes: every function over every registry the
  // snapshot holds, and the store, compared before and after.
  const mds = (SNAP ? SNAP.registries.map(r => clone(r.md)) : [{ takeoff_lists: REG }]);
  const st = store();
  const before = canon([mds, st]);
  const got = [];
  for (const md of mds) {
    for (const fn of [m => TL.takeoffLists(m), m => TL.mainTakeoffLabel(m), m => TL.hasOtherTakeoffs(m, st),
      m => TL.takeoffNamingOf(m, st), m => TL.otherTakeoffs(m, st), m => TL.otherTakeoffs(m, st, DECK),
      m => TL.leftInTakeoffLabel(m), m => TL.takeoffListLabel(m, DECK)]) got.push(fn(md));
    // and what it hands out is a copy: changing it changes no metadata
    for (const r of TL.takeoffLists(md)) { r.label = 'Changed'; r.list_id = 'tl-changed'; }
  }
  ok('no reader writes the metadata or the store, and takeoffLists hands out copies', canon([mds, st]) === before);
  ok('...and every reading answered', got.length === mds.length * 8);
}

// ═══ 3. the wiring ═══════════════════════════════════════════════════════
log('\n-- 3. the wiring --');
const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf-8');
ok('the worker precaches the module', sw.includes("  'js/core/takeoff-lists.js',\n"));
const runAll = await readFile(new URL('./run-all.mjs', import.meta.url), 'utf-8');
ok('this harness is in the PORTABLE list', /PORTABLE = \[[\s\S]*'takeoff-lists-parity'[\s\S]*\];\s*\n\s*\/\/ NEEDS THE LIBRARY/.test(runAll));
const src = await readFile(new URL('../js/core/takeoff-lists.js', import.meta.url), 'utf-8');
ok('no look-behind in the module (Safari before 16.4 refuses a whole module with one)', !/\(\?<[=!]/.test(src));
ok('the module never reads a tag with trim() (it would part from Python\'s strip)', !/\.trim\(\)/.test(src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')));
{
  // counting.js: the Delete sheet words sit beside the other takeoff words,
  // before the materials' heading -- not between aiTotal and its comment.
  const ct = await readFile(new URL('../js/core/counting.js', import.meta.url), 'utf-8');
  const head = ct.indexOf('// ── an item\'s associated materials go wherever the item goes');
  const hid = ct.indexOf('export function hiddenTakeoffsWords(');
  ok('counting.js: hiddenTakeoffsWords comes after takeoffMoveWords and before the materials\' heading, and aiTotal\'s '
    + 'doc comment sits on aiTotal', hid > ct.indexOf('export function takeoffMoveWords(') && head > hid
    && ct.includes('/** Python\'s _ai_total: a material\'s quantity for its item\'s quantity. */\nfunction aiTotal('));
}

// ═══ 4. live ═════════════════════════════════════════════════════════════
let live = 'skipped: no PTT_DESKTOP_SRC';
if (!(await haveDesktopSource())) {
  log('\n-- 4. live differential SKIPPED (set PTT_DESKTOP_SRC) --');
} else {
  log('\n-- 4. live: the desktop source as it is now --');
  let truth = null;
  try {
    const { stdout } = await run('python', ['-B', path.join(here, 'takeoff-lists-python-truth.py'), DESKTOP_SRC],
      { maxBuffer: 1 << 28, windowsHide: true });
    truth = JSON.parse(stdout);
  } catch (err) {
    fails += 1;
    log(`FAIL the desktop's takeoff-list functions could not be lifted and run:\n${(err.stderr || err.message).trim()}`);
  }
  if (truth) {
    log(`   (lifted by text: ${truth.lifted.join(', ')})`);
    checkTruth(truth, 'live');
    ok('the committed tests/data/takeoff-lists-truth.json is the desktop\'s answer as it is now '
      + `(regenerate: python -B tests/takeoff-lists-python-truth.py "${DESKTOP_SRC}" --write)`,
    JSON.stringify(truth) === JSON.stringify(SNAP));
    live = 'live differential run';
  }
}

console.log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass -- takeoff lists are read as the desktop reads them (${live})`);
process.exit(fails ? 1 : 0);
