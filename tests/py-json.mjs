// THE DESKTOP'S JSON: Infinity, -Infinity and NaN, read and written as
// Python's json module reads and writes them (js/core/py-json.js).
//
// The desktop saves its metadata with json.dumps(...) -- allow_nan on, its
// default -- and a vertical pitch line's rise is float("inf"), saved as the
// bare word Infinity. JSON.parse refused the whole block over it, so such a
// job could not be opened here at all. Held here:
//
//   1. the reader against Python's own json.loads, and the writer against
//      Python's own json.dumps, byte for byte, on synthetic metadata (the top
//      level, nested at any depth, arrays, -Infinity, NaN, the words inside
//      strings and as keys, a key __proto__, a key json.dumps writes twice
//      with a NaN under the first) and on texts where the words stand where
//      json.loads refuses them, or under a key a later one throws away --
//      from the committed tests/data/py-json-truth.json
//      (tests/py-json-python-truth.py, which also checks BY TEXT that the
//      desktop's save and load calls are the plain json.dumps / json.loads,
//      and lifts _pitch_from_points and _pitch_label to make the pitch item),
//      and live when the desktop source is here: Python reads back every text
//      this app writes. A text it cannot read is refused with JSON.parse's
//      own words for THAT text (the file's position and snippet, never those
//      of the text rewritten to read the words);
//   2. the fast path: a block with none of the words is ONE plain JSON.parse,
//      the same result, no slower on a multi-MB block; and a value with no
//      non-finite number is written byte for byte as JSON.stringify wrote it
//      -- a whole project file byte for byte as HEAD d4f63fb's writer made it
//      (when git can show that commit), and the same bytes saved twice;
//   3. every reader of a project file: readHeader, openProject and the
//      library's prefix reader open a desktop file holding the words -- and
//      so do the harnesses that pick jobs out of the real library: the
//      library scan (tests/lib-scan.mjs probe), which dropped such a job
//      without a word, and tests/revision-counting.mjs, whose library run is
//      json.dumps of real jobs' items (live: the desktop's counting of the
//      job writes the word, and it is read);
//   4. the opened job: the vertical line reads 'vertical' on the canvas, the
//      Items list (which lists no pitch line, as the desktop's does not) and
//      its footer, the reports, the CSV and the workbook's rows never say
//      inf, nan or $nan -- a priced pitch line with a material included --
//      opening marks nothing dirty and moves no changeCount, a draft keeps the
//      value (a structured clone), an untouched line is saved back as
//      Infinity -- and so is one reshaped (still vertical), renamed as the
//      Properties dialog's OK does it, or nudged by the arrow keys through
//      the real controller: each recomputes the line, and the desktop's
//      Infinity is kept while it is vertical (a 0 there reads '0:12' on the
//      desktop). A line drawn here, or one that held a 0, still stores 0 --
//      this app's rule, kept -- and so does a desktop line once it has been
//      sloped and made vertical again. The canvas DRAWS (the real
//      _drawItemLabel, on a context that records its text) the desktop's own
//      words for the desktop's pitch lines -- the pitch branch of its
//      _gl_draw_measurement_label, lifted by text into the snapshot -- the
//      stored angle as it is: two clicks on one point make a line of rise
//      Infinity and angle 0, which reads 'vertical   0°' there and here,
//      opened, renamed and nudged (it read 90° here).
//
// Run: node tests/py-json.mjs
import { execFile, spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { DATA, DESKTOP_SRC, haveDesktopSource } from './config.mjs';

import { parsePyJson, stringifyPyJson, pyJsonWord } from '../js/core/py-json.js';
import { openProject, readHeader, readProjectSummary, writeProject, MAGIC } from '../js/core/takeoff-file.js';
import { Project, copySharingStrings } from '../js/core/project.js';
import * as M from '../js/core/measure.js';
import { unitTotals } from '../js/ui/report-html.js';
import { pyFixed } from '../js/core/pyformat.js';
import { Renderer } from '../js/render/renderer.js';
import { draftTwins } from '../js/core/save-route.js';
import { ToolController } from '../js/tools/controller.js';
import { probe as libraryProbe } from './lib-scan.mjs';

globalThis.window = globalThis.window || { devicePixelRatio: 1 };
const Reports = await import('../js/ui/reports.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const run = promisify(execFile);

/** Python's json.loads of each text, tagged (tests/py-json-python-truth.py --loads). */
function pyLoads(texts) {
  return new Promise((resolve, reject) => {
    const py = spawn('python', ['-B', path.join(here, 'py-json-python-truth.py'), '--loads'], { windowsHide: true });
    let out = '';
    let err = '';
    py.stdout.on('data', d => { out += d; });
    py.stderr.on('data', d => { err += d; });
    py.on('error', reject);
    py.on('close', code => (code === 0 ? resolve(JSON.parse(out)) : reject(new Error(err || `python exited ${code}`))));
    py.stdin.end(JSON.stringify(texts));
  });
}

/** The desktop's canvas words for each item text (py-json-python-truth.py --canvas). */
function pyCanvas(texts) {
  return new Promise((resolve, reject) => {
    const py = spawn('python', ['-B', path.join(here, 'py-json-python-truth.py'), DESKTOP_SRC, '--canvas'], { windowsHide: true });
    let out = '';
    let err = '';
    py.stdout.on('data', d => { out += d; });
    py.stderr.on('data', d => { err += d; });
    py.on('error', reject);
    py.on('close', code => (code === 0 ? resolve(out) : reject(new Error(err || `python exited ${code}`))));
    py.stdin.end(JSON.stringify(texts));
  });
}

let fails = 0;
let checks = 0;
const log = (...a) => console.log(...a);
function eq(label, got, want) {
  checks += 1;
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) return true;
  fails += 1;
  if (fails <= 60) log(`FAIL ${label}\n  got  ${a}\n  want ${b}`);
  return false;
}
function ok(label, cond, detail = '') {
  checks += 1;
  if (cond) return true;
  fails += 1;
  if (fails <= 60) log(`FAIL ${label}${detail ? `\n  ${detail}` : ''}`);
  return false;
}

/** A value as the truth tags it (tests/py-json-python-truth.py tag). */
function tag(v) {
  if (typeof v === 'boolean') return { b: v };
  if (v === null) return { z: 1 };
  if (typeof v === 'number') {
    if (v !== v) return { n: 'nan' };
    if (!Number.isFinite(v)) return { n: v > 0 ? 'inf' : '-inf' };
    return { n: v };
  }
  if (typeof v === 'string') return { s: v };
  if (Array.isArray(v)) return { a: v.map(tag) };
  if (v && typeof v === 'object') return { o: Object.keys(v).map(k => [k, tag(v[k])]) };
  throw new Error(`untaggable ${typeof v}`);
}
const tagText = v => JSON.stringify(v);

/**
 * The words this app's canvas DRAWS for an item: the real
 * Renderer._drawItemLabel, its notes hint and name line included, on a 2D
 * context that records every fillText. The box's header ('Pitch / Angle',
 * as the desktop's) is given apart.
 */
function drawnLabel(m) {
  const drawn = [];
  const ctx = new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'fillText') return s => drawn.push(String(s));
      if (k === 'measureText') return s => ({ width: String(s).length * 7, actualBoundingBoxAscent: 9, actualBoundingBoxDescent: 3 });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  const r = Object.assign(Object.create(Renderer.prototype), { viewport: { toScreen: (x, y) => [x, y], zoom: 1 }, pageDpi: 150 });
  Renderer.prototype._drawItemLabel.call(r, ctx, m, 1);
  return { header: drawn[0], words: drawn.slice(1).join('\n') };
}

function verdict(text) {
  try {
    return { ok: true, value: tag(parsePyJson(text)) };
  } catch (err) {
    return { ok: false, error: err instanceof SyntaxError ? 'SyntaxError' : String(err) };
  }
}

const SNAP = JSON.parse(await readFile(new URL('py-json-truth.json', DATA), 'utf-8'));

// ═══ 1. Python's json, from the snapshot ═════════════════════════════════
function checkTruth(truth, where) {
  log(`\n-- 1. ${where}: the reader is json.loads, the writer json.dumps --`);
  eq(`${where}: the desktop saves with a plain json.dumps -- allow_nan on (no keyword)`,
    [truth.calls.save.call, truth.calls.save.keywords], ['json.dumps(self._build_save_metadata())', []]);
  eq(`${where}: ...and reads with a plain json.loads, in both of its readers`,
    [truth.calls.load_cache_to_ram.keywords, truth.calls.read_cache_header.keywords], [[], []]);
  eq(`${where}: the desktop's vertical pitch line is written Infinity and labelled 'vertical'`,
    [truth.vertical.value, truth.vertical.label], ['Infinity', 'vertical']);
  // The desktop's canvas words for its own pitch lines (the pitch branch of
  // its _gl_draw_measurement_label, lifted by text): this app's canvas draws
  // the same -- the stored angle as it is, a zero-length line's 0 included
  // (two clicks on one point: rise Infinity, angle atan2(0, 0)) -- when the
  // line is opened, and after a recompute that leaves its ends where they are
  // (a rename does that; the desktop's reshape gives the same two numbers).
  eq(`${where}: the desktop's canvas words for a pitch line are lifted from its label drawing`, truth.canvas_lifted,
    { in: 'GLPageWidget._gl_draw_measurement_label', assigns: ['name', 'notes_hint', 'pstr', 'ang', 'body', 'disp'] });
  ok(`${where}: ...for six of its lines, a zero-length one among them`,
    Array.isArray(truth.canvas) && truth.canvas.length === 6
    && truth.canvas.some(c => /zero length/.test(c.name) && /vertical {3}0°$/.test(c.disp)));
  for (const c of truth.canvas || []) {
    const m = parsePyJson(c.item);
    const opened = drawnLabel(m);
    eq(`${where}: canvas: ${c.name}: drawn as the desktop draws it`, [opened.header, opened.words], ['Pitch / Angle', c.disp]);
    M.recompute(m);
    eq(`${where}: canvas: ${c.name}: ...and after a recompute`, drawnLabel(m).words, c.disp);
  }
  for (const c of truth.cases) {
    let read = null;
    try { read = parsePyJson(c.desktop); } catch (err) { read = err; }
    ok(`${where}: ${c.name}: the desktop's text is read as json.loads reads it`,
      !(read instanceof Error) && tagText(tag(read)) === tagText(c.loads),
      read instanceof Error ? read.message : `got  ${tagText(tag(read)).slice(0, 300)}\n  want ${tagText(c.loads).slice(0, 300)}`);
    let compact = null;
    try { compact = parsePyJson(c.web); } catch (err) { compact = err; }
    ok(`${where}: ${c.name}: ...and so is the compact text this app writes`,
      !(compact instanceof Error) && tagText(tag(compact)) === tagText(c.web_loads));
    if (!(read instanceof Error)) {
      const wrote = stringifyPyJson(read);
      ok(`${where}: ${c.name}: written back byte for byte as json.dumps writes it`, wrote === c.web,
        `got  ${String(wrote).slice(0, 300)}\n  want ${c.web.slice(0, 300)}`);
    }
  }
  for (const [text, want] of truth.texts) {
    const got = verdict(text);
    ok(`${where}: ${JSON.stringify(text)}: ${want.ok ? 'read' : 'refused'} as json.loads ${want.ok ? 'reads' : 'refuses'} it`,
      got.ok === want.ok && (!want.ok || tagText(got.value) === tagText(want.value)),
      JSON.stringify(got));
  }
}
checkTruth(SNAP, 'snapshot');

{
  // A text it cannot read is refused with JSON.parse's own error for that
  // text: the position and the snippet the 'Could not open' dialog shows are
  // the file's -- never those of the text rewritten to read the words.
  for (const t of ['{"value": NaN x}', '{"value": Infinity, "b": tru}', '{"a": 1}{"value": NaN}',
    '{NaN: 1}', '{"a": {NaN: 1}, "a": 2}', '[-NaN]', '[1Infinity]', '{"a": NaN :1}']) {
    let mine = '';
    let theirs = '';
    try { parsePyJson(t); mine = 'read'; } catch (err) { mine = `${err.name}: ${err.message}`; }
    try { JSON.parse(t); } catch (err) { theirs = `${err.name}: ${err.message}`; }
    eq(`${JSON.stringify(t)} is refused in JSON.parse's own words for it`, mine, theirs);
  }
  // A NaN under a key written again later is read, as json.loads reads it --
  // one try, not eight full parses and a refusal.
  const realParse = JSON.parse;
  let calls = 0;
  JSON.parse = function counted(...a) { calls += 1; return realParse.apply(this, a); };
  let got = null;
  try { got = parsePyJson('{"a": NaN, "a": 1, "b": [NaN]}'); } catch (err) { got = err.message; } finally { JSON.parse = realParse; }
  eq('{"a": NaN, "a": 1, "b": [NaN]} is read as json.loads reads it, the last "a" kept', tag(got), tag({ a: 1, b: [NaN] }));
  eq('...in two parses: the plain one that refused it, and one more', calls, 2);
}

eq('Python\'s words for the three numbers', [pyJsonWord(Infinity), pyJsonWord(-Infinity), pyJsonWord(NaN)],
  ['Infinity', '-Infinity', 'NaN']);
{
  // The marks the reader and writer use stand for nothing a text can hold.
  const tricky = { note: 'ptt-nan-x', arr: ['ptt-nan-', NaN, 'NaN'], 'ptt-nan-k': -Infinity };
  const t = stringifyPyJson(tricky);
  eq('a value that holds strings like the marks is written as it is', t,
    '{"note":"ptt-nan-x","arr":["ptt-nan-",NaN,"NaN"],"ptt-nan-k":-Infinity}');
  eq('...and read back the same', tag(parsePyJson(t)), tag(tricky));
  eq('a boxed number and a toJSON are followed as JSON.stringify follows them',
    stringifyPyJson({ a: Object(Infinity), d: { toJSON: () => [NaN, 1] }, u: undefined, f() {} }),
    '{"a":Infinity,"d":[NaN,1]}');
  eq('nothing to write is nothing, as JSON.stringify answers', [stringifyPyJson(undefined), stringifyPyJson(() => 1)],
    [JSON.stringify(undefined), JSON.stringify(() => 1)]);
}

// ═══ 2. the fast path ═══════════════════════════════════════════════════
log('\n-- 2. a block with none of the words: JSON.parse itself, and JSON.stringify\'s bytes --');
function bigMetadata(perSheet, sheets = 40) {
  const measurements = {};
  for (let p = 0; p < sheets; p++) {
    const list = [];
    for (let i = 0; i < perSheet; i++) {
      list.push({ type: 'area', name: `Item ${i}`, value: i * 1.25 + 0.5, visible: true, rev_id: null,
        points: [[i, 2.5], [i + 10.25, 3], [i + 4, 9.5]], color: [0.1, 0.2, 0.3, 1],
        notes: 'a note that says NaN and Infinity in words', floor_level: 'Level 1',
        associated_items: [{ name: 'Studs', qty: 2, qty_mode: 'per_unit', unit_cost: 3.25 }] });
    }
    measurements[String(p)] = list;
  }
  return { project_name: 'Synthetic big job', dpi: 150, pixels_per_foot: 50.5,
    page_labels: Array.from({ length: sheets }, (_, i) => `X${i + 1}.0`), annotations: {}, measurements };
}
{
  const big = bigMetadata(900);
  const text = JSON.stringify(big);
  const realParse = JSON.parse;
  let calls = 0;
  JSON.parse = function counted(...a) { calls += 1; return realParse.apply(this, a); };
  let got;
  try { got = parsePyJson(text); } finally { JSON.parse = realParse; }
  eq(`a ${pyFixed(text.length / 1e6, 1)} MB block with no word: one plain JSON.parse`, calls, 1);
  ok('...with the very result JSON.parse gives', JSON.stringify(got) === text);
  const median = f => {
    const ts = [];
    for (let i = 0; i < 9; i++) { const t0 = performance.now(); f(); ts.push(performance.now() - t0); }
    return ts.sort((a, b) => a - b)[4];
  };
  median(() => JSON.parse(text)); median(() => parsePyJson(text));
  const plain = median(() => JSON.parse(text));
  const mine = median(() => parsePyJson(text));
  ok(`...and no slower: ${pyFixed(mine, 1)} ms against JSON.parse's ${pyFixed(plain, 1)} ms`,
    mine <= plain * 1.25 + 5, `${mine} vs ${plain}`);
  ok('written back: JSON.stringify\'s bytes exactly', stringifyPyJson(big) === text);
  const w1 = median(() => JSON.stringify(big));
  const w2 = median(() => stringifyPyJson(big));
  log(`   (writing it: ${pyFixed(w2, 1)} ms against JSON.stringify's ${pyFixed(w1, 1)} ms -- the look for a non-finite number)`);
  // One Infinity, at the very end: the careful paths.
  big.measurements['39'][899].value = Infinity;
  big.measurements['0'][0].angle = NaN;
  const slow = stringifyPyJson(big);
  ok('with an Infinity and a NaN in it, only those two differ from JSON.stringify\'s bytes',
    slow.replace('"value":Infinity', '"value":null').replace('"angle":NaN', '"angle":null') === JSON.stringify(big));
  const back = parsePyJson(slow);
  ok('...and it reads back whole', back.measurements['39'][899].value === Infinity
    && Number.isNaN(back.measurements['0'][0].angle) && JSON.stringify(back) === JSON.stringify(big));
}

// ═══ 3. every reader of a project file ══════════════════════════════════
log('\n-- 3. a desktop file holding the words: every reader opens it --');
const te = new TextEncoder();
/** A .takeoff as the desktop lays one out, its metadata block given as TEXT. */
function takeoffBytes(metaText, pages) {
  const meta = te.encode(metaText);
  const size = MAGIC.length + 8 + meta.length + pages.length * 12 + pages.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(size);
  const dv = new DataView(out.buffer);
  out.set(te.encode(MAGIC), 0);
  dv.setUint32(MAGIC.length, pages.length, true);
  dv.setUint32(MAGIC.length + 4, meta.length, true);
  out.set(meta, MAGIC.length + 8);
  let ip = MAGIC.length + 8 + meta.length;
  let at = ip + pages.length * 12;
  for (const p of pages) {
    dv.setBigUint64(ip, BigInt(at), true); dv.setUint32(ip + 8, p.length, true); ip += 12;
    out.set(p, at); at += p.length;
  }
  return out;
}
const PAGES = [new Uint8Array([120, 156, 3, 0, 0, 0, 0, 1]), new Uint8Array([120, 156, 3, 0, 0, 0, 0, 1])];
const jobCase = SNAP.cases.find(c => /vertical pitch line/.test(c.name));
const desktopFile = new Blob([takeoffBytes(jobCase.desktop, PAGES)]);
let opened = null;
try {
  opened = await openProject(desktopFile);
} catch (err) {
  ok('openProject opens a desktop file whose pitch line is Infinity', false, err.message);
}
if (opened) {
  const pitches = opened.measurements[0].filter(m => m.type === 'pitch');
  eq('openProject opens it: the vertical lines are Infinity, the sloped one 6',
    pitches.map(m => m.value), [Infinity, 6, Infinity]);
}
try {
  const h = await readHeader(desktopFile);
  eq('readHeader reads it too', h.metadata.measurements['0'].map(m => m.value), [Infinity, 6, Infinity]);
} catch (err) {
  ok('readHeader reads it too', false, err.message);
}
try {
  const s = await readProjectSummary(desktopFile);
  eq('the library\'s prefix reader lists it', [s.project_name, s.page_count], ['Synthetic job', 2]);
} catch (err) {
  ok('the library\'s prefix reader lists it', false, err.message);
}
{
  // The harnesses that pick jobs out of the real library read the same block.
  const tmpLib = await mkdtemp(path.join(tmpdir(), 'ptt-pyjson-lib-'));
  const jobFile = path.join(tmpLib, 'Synthetic job.takeoff');
  try {
    await writeFile(jobFile, takeoffBytes(jobCase.desktop, PAGES));
    const pr = await libraryProbe(jobFile);
    eq('the library scan (tests/lib-scan.mjs probe) reads it -- it dropped such a job without a word',
      pr && [pr.pageCount, pr.hasTail, pr.revisionRecords], [2, false, 0]);
    const RC = (await readFile(path.join(here, 'revision-counting.mjs'), 'utf-8')).replace(/\r\n/g, '\n');
    ok('tests/revision-counting.mjs reads its library run (json.dumps of real jobs\' items) and the desktop\'s reopening as Python wrote them',
      /\n {6}lib = parsePyJson\(stdout\);\n/.test(RC) && /\n {2}return parsePyJson\(out\);\n\}\n/.test(RC)
      && !/\blib = JSON\.parse\(/.test(RC));
    if (await haveDesktopSource()) {
      let out = '';
      try {
        ({ stdout: out } = await run('python', ['-B', path.join(here, 'counting-python-truth.py'), jobFile],
          { maxBuffer: 1 << 26, windowsHide: true, env: { ...process.env, PTT_DESKTOP_SRC: DESKTOP_SRC } }));
      } catch (err) {
        ok('live: the desktop\'s counting of the job runs', false, err.stderr || err.message);
      }
      ok('live: the desktop\'s counting of the job, as revision-counting\'s library run gets it, holds the bare word',
        /:\s*Infinity\b/.test(out));
      let lib = null;
      try { lib = parsePyJson(out); } catch { lib = null; }
      eq('...and is read whole', lib && lib.scenarios.length, 1);
    }
  } finally {
    await rm(tmpLib, { recursive: true, force: true });
  }
}

// ═══ 4. the opened job ══════════════════════════════════════════════════
log('\n-- 4. the job opened: what it reads, what it saves --');
function load(f) {
  const p = new Project();
  p.loadFrom({ metadata: f.metadata, annotations: f.annotations, measurements: f.measurements,
    pageCount: f.pageCount, revisionCounts: f.revisions.map(s => s.length) });
  return p;
}
const lab = i => `X${i + 1}.0`;
const WORDS = /\b(?:NaN|nan|Infinity|inf)\b|\$-?nan|\$-?inf/i;
if (opened) {
  // the same job with the vertical lines' rise as this app stores one (0)
  const asWeb = await openProject(new Blob([takeoffBytes(jobCase.desktop.replace(/"value": Infinity/g, '"value": 0'), PAGES)]));
  const p = load(opened);
  const pWeb = load(asWeb);
  eq('opening marks nothing dirty', p.dirty, false);
  eq('...and moves the change count as any open does (as the job with a 0 there)', p.changeCount, pWeb.changeCount);
  const c0 = p.changeCount;
  const vert = p.measurements[0][0];
  const priced = p.measurements[0][2];
  eq('the untouched lines keep the desktop\'s value', [vert.value, priced.value, vert.label], [Infinity, Infinity, 'vertical']);
  const text = m => Renderer.prototype._labelTextFor.call({ pageDpi: 150 }, m, '', '', '');
  eq('on the canvas: the desktop\'s words, \'vertical\' and its angle', [text(vert), text(p.measurements[0][1])],
    ['vertical   90°', '6:12   27°']);
  eq('...as for the line this app stores 0 for', text(pWeb.measurements[0][0]), 'vertical   90°');
  // The Items list: no pitch line in it (the desktop's _refresh_items skips
  // them too) -- and its footer, lifted by text, over everything listed.
  const ITEMS = (await readFile(path.join(ROOT, 'js/ui/items-panel.js'), 'utf-8')).replace(/\r\n/g, '\n');
  const exLine = ITEMS.split('\n').find(l => l.startsWith('const EXCLUDED = new Set(['));
  // eslint-disable-next-line no-new-func
  const EXCLUDED = new Function(`return ${exLine.slice(exLine.indexOf('new Set'), exLine.lastIndexOf(';'))};`)();
  ok('the Items list lists no pitch line', EXCLUDED.has('pitch'));
  const a = ITEMS.indexOf('  _updateFoot(pairs, wholeJob = false) {');
  const b = ITEMS.indexOf('\n  }\n', a);
  const m0 = ITEMS.indexOf('\nfunction money(v) {');
  const m1 = ITEMS.indexOf('\n}\n', m0);
  // eslint-disable-next-line no-new-func
  const updateFoot = new Function('reportQty', 'unitTotals', 'itemCost', 'expandAssembly', 'pyFixed',
    `${ITEMS.slice(m0 + 1, m1 + 2)}\nreturn function ${ITEMS.slice(a + 2, b + 4)};`)(
    M.reportQty, unitTotals, M.itemCost, M.expandAssembly, pyFixed);
  const foot = { footEl: { textContent: '', title: '' }, _counts: new Map(), _counted: (pg, m) => m, _filtering: () => false };
  const all = Object.entries(p.measurements).flatMap(([k, l]) => l.map(m => [Number(k), m]));
  updateFoot.call(foot, all, false);
  ok(`the Items footer says no inf, nan or $nan: "${foot.footEl.textContent}"`, !WORDS.test(foot.footEl.textContent));
  eq('...its money is the reports\' none (no pitch line is priced)', foot.footEl.textContent.includes('$'), false);
  eq('a pitch line\'s own cost and its materials\' are 0, never inf or nan',
    [M.itemCost(priced), M.itemTotalCost(priced), M.expandAssembly(priced).map(l => [l.total, l.cost])],
    [0, 0, [[0, 0]]]);
  const rows = Reports.collectRows(p, lab);
  const rowsWeb = Reports.collectRows(pWeb, lab);
  const csv = Reports.buildCsv(rows);
  ok('the CSV says no inf or nan', !WORDS.test(csv), csv);
  eq('...and is the CSV of the job with the 0 this app stores', csv, Reports.buildCsv(rowsWeb));
  ok('the workbook\'s rows hold finite numbers only', rows.every(r => Object.values(r)
    .every(v => typeof v !== 'number' || Number.isFinite(v))), JSON.stringify(rows));
  const items = Reports.collectItems(p, lab);
  ok('the reports\' entries too', items.every(e => [e.qty, e.rate, e.cost, ...e.materials.flatMap(x => [x.qty, x.cost])]
    .every(Number.isFinite)));
  for (const key of ['estimate', 'material', 'labor', 'rollup', 'schedule', 'matlist']) {
    let html = '';
    try { html = Reports.buildReportHtml(p, lab, key, {}, {}); } catch (err) { html = `ERROR ${err.message}`; }
    ok(`the ${key} report says no inf, nan or $nan`, !WORDS.test(html.replace(/<[^>]*>/g, ' ')));
  }
  eq('none of that touched the job', [p.dirty, p.changeCount], [false, c0]);
  // A draft is the live object, structured-cloned; and the portal's twin
  // check compares drafts as JSON -- it must not throw on one.
  const work = p.buildSaveMetadata();
  eq('a draft keeps the value (a structured clone)', structuredClone(work).measurements['0'].map(m => m.value),
    [Infinity, 6, Infinity]);
  eq('...an undo snapshot too', copySharingStrings(work.measurements)['0'].map(m => m.value), [Infinity, 6, Infinity]);
  const WHO = 'whoWord_0001', PLAN = 'planWord_001';
  const key = n => `job.takeoff|${n}|@${WHO}|#${PLAN}`;
  const twins = await draftTwins({ key: key(100), draft: { payload: work, pageCount: 2 }, own: key(100) },
    { get: async () => ({ payload: structuredClone(work), pageCount: 2 }), keys: async () => [key(100), key(200)] }, WHO, PLAN);
  eq('...and the twin check of drafts (it compares them as JSON) finds the twin, not an error', twins, [key(200)]);

  // Saved back: the untouched lines in Python's spelling.
  const pageSources = PAGES.map(d => ({ kind: 'raw', data: d }));
  const blob = await writeProject({ metadata: work, pageSources });
  const saved = new Uint8Array(await blob.arrayBuffer());
  const metaLen = new DataView(saved.buffer).getUint32(MAGIC.length + 4, true);
  const block = new TextDecoder().decode(saved.slice(MAGIC.length + 8, MAGIC.length + 8 + metaLen));
  eq('saved: the untouched vertical lines are written Infinity, as the desktop wrote them',
    [...block.matchAll(/"type":"pitch"[^{}]*?"value":([^,}]+)/g)].map(x => x[1]), ['Infinity', '6', 'Infinity']);
  ok('...nothing written as null in their place', !/"value":null/.test(block));
  const again = await writeProject({ metadata: work, pageSources });
  ok('the same project saved twice: the same bytes',
    Buffer.compare(Buffer.from(saved), Buffer.from(new Uint8Array(await again.arrayBuffer()))) === 0);
  const reopened = await openProject(blob);
  eq('...and this app reads its own save back', reopened.measurements[0].map(m => m.value), [Infinity, 6, Infinity]);
  if (await haveDesktopSource()) {
    let py = null;
    try { py = (await pyLoads([block]))[0]; } catch { py = null; }
    const vals = py && py.ok ? py.value.o.find(([k]) => k === 'measurements')[1].o[0][1].a
      .map(x => x.o.find(([k]) => k === 'value')[1].n) : null;
    eq('live: Python\'s json.loads reads this app\'s save back as inf, 6, inf', vals, ['inf', 6, 'inf']);
  }

  // Every edit that recomputes the line (measure.js recompute): a reshape, a
  // rename as the Properties dialog's OK does it, a nudge by the arrow keys
  // through the real controller. The desktop's Infinity is kept while the
  // line is still vertical -- a 0 written over it reads '0:12' on the
  // desktop -- and a line drawn here, or one that held 0, stores 0 as ever.
  const isInf = v => v === Infinity;
  vert.points[1] = [vert.points[1][0], vert.points[1][1] + 40];
  M.recompute(vert);
  ok('a reshaped vertical line (still vertical) keeps the desktop\'s Infinity', isInf(vert.value), String(vert.value));
  eq('...and reads \'vertical\'', [vert.label, text(vert)], ['vertical', 'vertical   90°']);
  p.transact('Edit item', () => { Object.assign(vert, { name: 'Gable end' }); M.recompute(vert); });
  ok('renamed as the Properties dialog\'s OK does it (Object.assign, recompute): still Infinity', isInf(vert.value)
    && vert.label === 'Gable end', String(vert.value));
  const canvasStub = { addEventListener() {}, setPointerCapture() {}, style: {} };
  const tc = new ToolController({ canvas: canvasStub, viewport: { zoom: 1 }, project: p, currentPage: () => 0, host: {} });
  tc.select([priced._uid]);
  const x0 = priced.points[0][0];
  const took = tc.handleKey({ key: 'ArrowLeft', shiftKey: true, ctrlKey: false, metaKey: false, altKey: false,
    preventDefault() {}, stopPropagation() {} });
  ok('the priced line nudged 10 px by Shift+Left Arrow, through the real controller: still Infinity',
    took && priced.points[0][0] === x0 - 10 && isInf(priced.value), JSON.stringify([took, String(priced.value), priced.points]));
  tc.select([]);
  eq('...both read \'vertical\' on the canvas', [text(vert), text(priced)], ['vertical   90°', 'vertical   90°']);
  eq('...and price as before: the CSV is still the 0-valued job\'s', Reports.buildCsv(Reports.collectRows(p, lab)),
    Reports.buildCsv(Reports.collectRows(pWeb, lab)));
  ok('...the reports say no inf, nan or $nan', ['estimate', 'material', 'labor', 'rollup', 'schedule', 'matlist']
    .every(k => !WORDS.test(Reports.buildReportHtml(p, lab, k, {}, {}).replace(/<[^>]*>/g, ' '))));
  ok('...nor the footer\'s figures', Number.isFinite(M.itemTotalCost(priced)) && M.itemTotalCost(priced) === 0);
  const edited = await writeProject({ metadata: p.buildSaveMetadata(), pageSources });
  const eb = new Uint8Array(await edited.arrayBuffer());
  const eLen = new DataView(eb.buffer).getUint32(MAGIC.length + 4, true);
  const eBlock = new TextDecoder().decode(eb.slice(MAGIC.length + 8, MAGIC.length + 8 + eLen));
  eq('saved after those edits: still Infinity, 6, Infinity -- the desktop reads \'vertical\' back',
    [...eBlock.matchAll(/"type":"pitch"[^{}]*?"value":([^,}]+)/g)].map(x => x[1]), ['Infinity', '6', 'Infinity']);
  if (await haveDesktopSource()) {
    let py = null;
    try { py = (await pyLoads([eBlock]))[0]; } catch { py = null; }
    const vals = py && py.ok ? py.value.o.find(([k]) => k === 'measurements')[1].o[0][1].a
      .map(x => x.o.find(([k]) => k === 'value')[1].n) : null;
    eq('live: Python reads that save back as inf, 6, inf', vals, ['inf', 6, 'inf']);
  }
  // This app's rule, kept: a line drawn here stores 0, and keeps it.
  const own = pWeb.measurements[0][0];
  own.points[1] = [own.points[1][0], own.points[1][1] + 25];
  M.recompute(own);
  eq('a vertical line holding 0 (as every line drawn here does), reshaped: still 0', own.value, 0);
  const drew = new ToolController({ canvas: canvasStub, viewport: { zoom: 1 }, project: pWeb, currentPage: () => 0, host: {} });
  drew._finalizePitch([[40.5, 10.5], [40.5, 90.5]]);
  const fresh = pWeb.measurements[0].find(m => m.type === 'pitch' && m.points[0][0] === 40.5);
  eq('this app\'s own Pitch tool, a vertical line: 0 (and its pitch key 0)', [fresh.type, fresh.value, fresh.pitch], ['pitch', 0, 0]);
  fresh.points[1] = [40.5, 120.5];
  M.recompute(fresh);
  eq('...reshaped, still vertical: still 0', [fresh.value, fresh.pitch, text(fresh)], [0, 0, 'vertical   90°']);
  // A desktop line sloped, then made vertical again, is a line this app
  // measured: the 0 of this app's rule.
  vert.points[1] = [vert.points[0][0] + 60, vert.points[1][1]];
  M.recompute(vert);
  ok('a desktop line dragged off the vertical takes its rise', Number.isFinite(vert.value) && vert.value > 0, String(vert.value));
  vert.points[1] = [vert.points[0][0], vert.points[1][1]];
  M.recompute(vert);
  eq('...and dragged back to vertical stores this app\'s 0', vert.value, 0);

  // Two clicks on one point: the desktop's zero-length line (rise Infinity,
  // angle 0) in its own job, opened from a file. The canvas draws its
  // 'vertical   0°', as the desktop does -- and still does after a rename
  // and a nudge through the real controller, each of which recomputes it.
  // (Infinity is compared as its words: JSON.stringify, which eq compares
  // by, writes it null, as it writes a null.)
  const zeroCase = (SNAP.canvas || []).find(c => /zero length/.test(c.name));
  if (ok('the snapshot holds the desktop\'s zero-length line', !!zeroCase)) {
    const zText = jobCase.desktop.replace('"measurements": {"0": [', `"measurements": {"0": [${zeroCase.item}, `);
    const zp = load(await openProject(new Blob([takeoffBytes(zText, PAGES)])));
    const zero = zp.measurements[0][0];
    eq('opened: the zero-length line holds the desktop\'s Infinity and 0',
      [String(zero.value), zero.angle_deg, zp.dirty], ['Infinity', 0, false]);
    eq('...and the canvas draws the desktop\'s words', drawnLabel(zero).words, zeroCase.disp);
    zp.transact('Edit item', () => { Object.assign(zero, { name: 'Ridge' }); M.recompute(zero); });
    eq('renamed as the Properties dialog\'s OK does it: \'vertical   0°\' under the new name',
      [String(zero.value), zero.angle_deg, drawnLabel(zero).words], ['Infinity', 0, 'Ridge\nvertical   0°']);
    const ztc = new ToolController({ canvas: canvasStub, viewport: { zoom: 1 }, project: zp, currentPage: () => 0, host: {} });
    ztc.select([zero._uid]);
    const zx = zero.points[0][0];
    const zTook = ztc.handleKey({ key: 'ArrowRight', shiftKey: true, ctrlKey: false, metaKey: false, altKey: false,
      preventDefault() {}, stopPropagation() {} });
    ztc.select([]);
    eq('nudged 10 px by Shift+Right Arrow through the real controller: still Infinity, 0 and \'vertical   0°\'',
      [zTook, zero.points.map(q => q[0] - zx), String(zero.value), zero.angle_deg, drawnLabel(zero).words],
      [true, [10, 10], 'Infinity', 0, 'Ridge\nvertical   0°']);
    const zb = new Uint8Array(await (await writeProject({ metadata: zp.buildSaveMetadata(), pageSources })).arrayBuffer());
    const zLen = new DataView(zb.buffer).getUint32(MAGIC.length + 4, true);
    const zBlock = new TextDecoder().decode(zb.slice(MAGIC.length + 8, MAGIC.length + 8 + zLen));
    const zSaved = parsePyJson(zBlock).measurements['0'][0];
    eq('...saved: Infinity and 0, the desktop\'s own two numbers for it',
      [zSaved.name, String(zSaved.value), zSaved.angle_deg], ['Ridge', 'Infinity', 0]);
    if (await haveDesktopSource()) {
      // live: that save, read by Python's json.loads and drawn by the
      // desktop's own canvas words (the lifted branch)
      let drawn = null;
      try { drawn = JSON.parse(await pyCanvas([stringifyPyJson(zSaved)]))[0]; } catch (err) { drawn = err.message; }
      eq('live: the desktop draws this app\'s save of it as this app does', drawn, drawnLabel(zSaved).words);
    }
  }
}

// A file with no word in it: saved exactly as before.
{
  const plainCase = SNAP.cases.find(c => /no word at all/.test(c.name));
  const f = await openProject(new Blob([takeoffBytes(plainCase.desktop, PAGES)]));
  const p = load(f);
  const work = p.buildSaveMetadata();
  const pageSources = PAGES.map(d => ({ kind: 'raw', data: d }));
  const mine = new Uint8Array(await (await writeProject({ metadata: work, pageSources })).arrayBuffer());
  const metaLen = new DataView(mine.buffer).getUint32(MAGIC.length + 4, true);
  eq('a file with no word: its metadata block is JSON.stringify\'s, byte for byte',
    new TextDecoder().decode(mine.slice(MAGIC.length + 8, MAGIC.length + 8 + metaLen)), JSON.stringify(work));
  // ...and the whole file is HEAD d4f63fb's save of it, where git can show that commit.
  let head = null;
  const tmp = await mkdtemp(path.join(tmpdir(), 'ptt-pyjson-'));
  try {
    const show = async rel => (await run('git', ['-C', ROOT, 'show', `d4f63fb:${rel}`], { maxBuffer: 1 << 26, windowsHide: true })).stdout;
    await writeFile(path.join(tmp, 'takeoff-file.js'), await show('js/core/takeoff-file.js'));
    await writeFile(path.join(tmp, 'zlib.js'), await show('js/core/zlib.js'));
    head = await import(pathToFileURL(path.join(tmp, 'takeoff-file.js')).href);
  } catch {
    head = null;
  }
  if (head) {
    const theirs = new Uint8Array(await (await head.writeProject({ metadata: work, pageSources })).arrayBuffer());
    ok('...and the whole file is byte for byte HEAD d4f63fb\'s save of the same project',
      Buffer.compare(Buffer.from(mine), Buffer.from(theirs)) === 0);
    let refused = '';
    try { await head.openProject(desktopFile); } catch (err) { refused = err.message; }
    ok(`(HEAD d4f63fb could not open the desktop's file: "${refused.slice(0, 50)}")`, /Unexpected token/.test(refused));
  } else {
    log('   (HEAD d4f63fb not to hand here: the whole-file comparison is skipped)');
  }
  await rm(tmp, { recursive: true, force: true });
}

// ═══ 5. live: Python as it is now ═══════════════════════════════════════
let live = 'skipped: no PTT_DESKTOP_SRC';
if (await haveDesktopSource()) {
  let truth = null;
  try {
    const { stdout } = await run('python', ['-B', path.join(here, 'py-json-python-truth.py'), DESKTOP_SRC],
      { maxBuffer: 1 << 26, windowsHide: true });
    truth = JSON.parse(stdout);
  } catch (err) {
    fails += 1;
    log(`FAIL the desktop's calls and pitch functions could not be lifted:\n${err.stderr || err.message}`);
  }
  if (truth) {
    checkTruth(truth, 'live');
    ok('the committed tests/data/py-json-truth.json is Python\'s answer as it is now '
      + `(regenerate: python -B tests/py-json-python-truth.py "${DESKTOP_SRC}" --write)`,
    JSON.stringify(truth) === JSON.stringify(SNAP));
    // Everything this app writes, read back by Python itself.
    const texts = truth.cases.map(c => stringifyPyJson(parsePyJson(c.desktop)));
    const back = await pyLoads(texts);
    truth.cases.forEach((c, i) => ok(`live: ${c.name}: Python reads this app's text back as the desktop's value`,
      back[i].ok && tagText(back[i].value) === tagText(c.web_loads)));
    live = 'live differential run';
  }
}

log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass -- the desktop's Infinity, -Infinity and NaN read and written as Python's json does (${live})`);
process.exit(fails ? 1 : 0);
