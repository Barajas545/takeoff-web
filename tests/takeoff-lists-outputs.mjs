// TAKEOFF LISTS (desktop 3.08): what the web REPORTS of a job of several
// takeoffs -- Main's, and it says so.
//
// The web is in Main, always, this round. Every report, table and export is
// of that takeoff (the desktop's report seam, decision 3): only its rows,
// its floors and trades, its work left out on other versions -- and each
// says which takeoff it is of: "Takeoff: House" leading the header, the
// Material List's title, the Report Center's title and its note, the file
// names ("<job> - House.csv"), the workbook's own title and every sheet's
// printed header. The counting model stays the whole job's (which drawing a
// sheet counts from is every takeoff's), and a job with only Main reports,
// names and writes exactly as v31 did: the same seven reports, the same CSV
// text, the same workbook BYTES.
//
// Every check goes through the real producers: the desktop-made
// tests/data/two-takeoffs.takeoff (Main renamed House, Deck) opened with
// openProject -> Project.loadFrom, then reports.js's own collectRows /
// collectItems / buildReportHtml / exportCsv / exportWorkbook (the download
// caught where the browser would hand it over) and openReportCenter on the
// real dialogs (stand-in elements); and, with the desktop source here, the
// desktop's own re-add of every multi-sheet total on opening what the web
// saved (tests/counting-python-truth.py --reopen).
//
//   T12a only Main's: every report, the CSV and the workbook of the job are
//        those of the same job with Deck's items taken out (its registry
//        kept) -- rows, bands, closing tables, cells, bytes; the Report
//        Center's floors and trades are Main's.
//   T12b the names: the header's "Takeoff: House", the Material List's
//        "<project> - House", the files "<job> - House.csv / .xlsx", the
//        workbook's docProps title and every sheet's oddHeader, the Report
//        Center's title and note, the print window's title; a name with '&'
//        and '<' in it, escaped where it is markup and doubled where Excel
//        reads '&' as a code; an empty Main said as Main's.
//   T12c a job with only Main is v31's: all 7 reports, the CSV text, the
//        workbook bytes (no docProps part), the file names, the Report
//        Center's title and the print title (v31's own modules, read out of
//        this repository's history).
//   T12d the job-wide canary: after a Count this version on a sheet holding
//        a Deck run, a Delete sheet holding a Deck master (its run promoted),
//        a canvas delete of a Main run and the Undo of a booking, the desktop
//        reopening the web's save re-adds NO total -- Deck's included.
//
// Run: node tests/takeoff-lists-outputs.mjs
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DESKTOP_SRC, haveDesktopSource } from './config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const V31 = 'df6739d';

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

// ── stand-in elements, and where the browser would hand a file over ──────

/** What download() handed over ([{name, blob}]) and print windows opened. */
const handed = [];
const printed = [];
let lastBlob = null;

class StubEl {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.parentNode = null;
    this.className = '';
    this.style = {};
    this.dataset = {};
    this.attrs = {};
    this.title = '';
    this.value = '';
    this.checked = false;
    this.type = '';
    this.id = '';
    this.hidden = false;
    this._text = '';
    this._html = '';
    this._l = [];
    const cls = () => this.className.split(/\s+/).filter(Boolean);
    this.classList = {
      add: (...cs) => { for (const c of cs) if (!cls().includes(c)) this.className = [...cls(), c].join(' '); },
      remove: (...cs) => { this.className = cls().filter(x => !cs.includes(x)).join(' '); },
      contains: c => cls().includes(c),
      toggle: (c, on) => {
        const want = on === undefined ? !cls().includes(c) : !!on;
        if (want) this.classList.add(c); else this.classList.remove(c);
        return want;
      },
    };
  }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); for (const c of this.children) c.parentNode = null; this.children = []; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  appendChild(c) {
    if (c.tagName === '#FRAGMENT') { for (const k of [...c.children]) this.appendChild(k); return c; }
    c.remove();
    c.parentNode = this;
    this.children.push(c);
    return c;
  }
  append(...cs) { for (const c of cs) this.appendChild(typeof c === 'string' ? this.ownerDocument.createTextNode(c) : c); }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(x => x !== this);
    this.parentNode = null;
  }
  get parentElement() { return this.parentNode; }
  addEventListener(t, fn) { this._l.push({ t, fn }); }
  removeEventListener(t, fn) { this._l = this._l.filter(l => !(l.t === t && l.fn === fn)); }
  /** A button's own click handlers, as a click on it runs them. */
  fire(t) { for (const l of [...this._l]) if (l.t === t) l.fn({ type: t, target: this, preventDefault() {}, stopPropagation() {} }); }
  /** download()'s anchor: what it was asked to save, and the blob behind it. */
  click() { if (this.tagName === 'A') handed.push({ name: this.download, blob: lastBlob }); }
  descendants() { return this.children.flatMap(c => [c, ...c.descendants()]); }
  matches(sel) {
    return sel.split(',').some(one => {
      const m = /^([a-z]*)((?:\.[\w-]+)*)$/i.exec(one.trim());
      if (!m) return false;
      if (m[1] && this.tagName !== m[1].toUpperCase()) return false;
      return m[2].split('.').filter(Boolean).every(c => this.classList.contains(c));
    });
  }
  querySelector(sel) { return this.descendants().find(e => e.matches(sel)) || null; }
  querySelectorAll(sel) { return this.descendants().filter(e => e.matches(sel)); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  focus() {}
  select() {}
}
function stubDocument() {
  const doc = new StubEl('#document', null);
  doc.ownerDocument = doc;
  doc.createElement = tag => new StubEl(tag, doc);
  doc.createElementNS = (ns, tag) => new StubEl(tag, doc);
  doc.createDocumentFragment = () => new StubEl('#fragment', doc);
  doc.createTextNode = t => { const n = new StubEl('#text', doc); n._text = String(t); return n; };
  doc.documentElement = doc.appendChild(new StubEl('html', doc));
  doc.body = doc.documentElement.appendChild(new StubEl('body', doc));
  doc.getElementById = id => doc.descendants().find(e => e.id === id) || null;
  const modal = doc.body.appendChild(new StubEl('div', doc));
  modal.id = 'modal';
  return doc;
}
globalThis.document = stubDocument();
URL.createObjectURL = b => { lastBlob = b; return 'blob:caught'; };
URL.revokeObjectURL = () => {};
globalThis.window = {
  devicePixelRatio: 1, addEventListener() {}, removeEventListener() {},
  open: () => {
    const page = { html: '' };
    printed.push(page);
    return { document: { write: h => { page.html += h; }, close() {} }, addEventListener() {}, print() {} };
  },
};

// ── the app's modules (this tree's, or v31's read out of git) ────────────
async function modules(root) {
  const m = p => import(pathToFileURL(path.join(root, p)).href);
  return {
    ...(await m('js/core/takeoff-file.js')), ...(await m('js/core/project.js')),
    ...(await m('js/core/counting.js')), ...(await m('js/ui/reports.js')),
    ...(await m('js/tools/controller.js')), D: await m('js/ui/dialogs.js'),
  };
}
const M = await modules(ROOT);
const TL = await import(pathToFileURL(path.join(ROOT, 'js/core/takeoff-lists.js')).href);
const PY = await import(pathToFileURL(path.join(ROOT, 'js/core/py-json.js')).href);
const REV = await import(pathToFileURL(path.join(ROOT, 'js/core/revisions.js')).href);
const MAIN = await readFile(path.join(ROOT, 'js/main.js'), 'utf-8');

// ── the job ──────────────────────────────────────────────────────────────
const BYTES = await readFile(path.join(here, 'data', 'two-takeoffs.takeoff'));
const TAG = 'takeoff_list';
const KEYS = ['takeoff_lists', 'takeoff_list_active', 'takeoff_main_label'];
/** The test's own reading of the tag (held to the desktop's by T1). */
const isDeck = m => TL.takeoffListOf(m) !== '';
const NON_TAKEOFF = new Set(['distance', 'textnote', 'page_ref', 'pitch', 'ref_distance', 'group']);

/** The fixture opened as the app opens it; `edit(opened)` before loadFrom. */
async function fresh({ mods = M, edit = null } = {}) {
  const o = await mods.openProject(new Blob([BYTES]));
  if (edit) edit(o);
  const p = new mods.Project();
  p.loadFrom({ metadata: o.metadata, annotations: o.annotations, measurements: o.measurements,
    pageCount: o.pageCount, revisionCounts: o.revisions.map(s => s.length) });
  return p;
}
/** The same job with only Main: no key, no tag. */
const mainOnly = o => {
  for (const k of KEYS) delete o.metadata[k];
  for (const m of Object.values(o.measurements).flat()) delete m[TAG];
};
/** The same job with Deck's items taken out -- its registry kept, so it is
 *  still a job of two takeoffs, named the same. */
const deckOut = o => {
  for (const k of Object.keys(o.measurements)) o.measurements[k] = o.measurements[k].filter(m => !isDeck(m));
};
const labelOf = p => i => p.pageLabel(i);

/** The dialog on top: its title, its body text, a note, its selects' values. */
function topDialog() {
  const modal = document.getElementById('modal');
  const layer = modal.children[modal.children.length - 1];
  if (!layer) return null;
  const btn = name => layer.querySelectorAll('button').find(b => b.textContent === name);
  return {
    title: layer.querySelector('.dlg-head')?.textContent ?? null,
    body: layer.querySelector('.dlg-body')?.textContent ?? '',
    note: layer.querySelector('.takeoff-note')?.textContent ?? null,
    selects: layer.querySelectorAll('select').map(s => s.children.map(o => o.value)),
    press: name => { const b = btn(name); if (b) b.fire('click'); return !!b; },
  };
}
/** An export's alert, read and answered OK. */
async function alertSaid(run) {
  const n = handed.length;
  const pr = run();
  await Promise.resolve();
  const d = topDialog();
  const said = d ? d.body : null;
  if (d) d.press('OK');
  await pr;
  return { said, handed: handed.length - n };
}
/** The Report Center opened, read, Print / PDF pressed, and closed. */
async function reportCenter(mods, p) {
  const n = printed.length;
  const pr = mods.openReportCenter(p, labelOf(p));
  await Promise.resolve();
  const d = topDialog();
  const got = { title: d.title, note: d.note, selects: d.selects };
  d.press('Print / PDF');
  const html = printed.length > n ? printed[printed.length - 1].html : '';
  got.print = (/<title>([\s\S]*?)<\/title>/.exec(html) || [])[1] ?? null;
  d.press('Close');
  await pr;
  return got;
}
async function exported(mods, p, kind) {
  const n = handed.length;
  if (kind === 'csv') mods.exportCsv(p, labelOf(p), {});
  else await mods.exportWorkbook(p, labelOf(p), {});
  const h = handed.slice(n);
  if (h.length !== 1) return { name: null, bytes: null };
  return { name: h[0].name, bytes: new Uint8Array(await h[0].blob.arrayBuffer()) };
}
const text = bytes => new TextDecoder().decode(bytes);
/** A stored (method 0) zip's parts, by name -- the workbook xlsx.js writes. */
function unzip(bytes) {
  const out = new Map();
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  while (at + 30 <= bytes.length && dv.getUint32(at, true) === 0x04034b50) {
    const size = dv.getUint32(at + 18, true);
    const nameLen = dv.getUint16(at + 26, true);
    const extra = dv.getUint16(at + 28, true);
    const name = text(bytes.subarray(at + 30, at + 30 + nameLen));
    const start = at + 30 + nameLen + extra;
    out.set(name, text(bytes.subarray(start, start + size)));
    at = start + size;
  }
  return out;
}
const KEYS7 = M.REPORTS.map(r => r[0]);
const OPTIONS = { groupBy: 'ft', notes: true, sheets: true, materials: true, subtotals: true, costs: true,
  totalsOnly: false };
const FILTERS = [{ floor: null, category: null, includeDims: false }, { floor: null, category: null, includeDims: true }];

// ═══ T12a: only Main's ═══════════════════════════════════════════════════
log('-- T12a: every report, table and export is of Main, the takeoff the web is in --');
{
  const p = await fresh();
  const q = await fresh({ edit: deckOut });
  ok('the fixture: Deck has items, House has items, and a revision of X2.0 holds one of each, not counted',
    [...p.allItems()].some(([, m]) => isDeck(m)) && [...q.allItems()].length > 5
    && [...p.allItems()].some(([, m]) => m.rev_id && isDeck(m)) && [...p.allItems()].some(([, m]) => m.rev_id && !isDeck(m)));
  const strip = items => items.map(e => ({ ...e, src: undefined }));
  eq('collectRows: the rows are the rows of the job with Deck\'s items taken out',
    M.collectRows(p, labelOf(p), {}), M.collectRows(q, labelOf(q), {}));
  eq('collectItems: the same', strip(M.collectItems(p, labelOf(p), {})), strip(M.collectItems(q, labelOf(q), {})));
  ok('...and nothing of Deck is in them', M.collectItems(p, labelOf(p), {}).every(e => !isDeck(e.src)));
  const posts = M.collectRows(p, labelOf(p), {}).filter(r => r.ItemName === 'Posts');
  eq('...one Posts row: House\'s (Deck\'s namesake is Deck\'s)', posts.length, 1);
  let same = 0;
  for (const filters of FILTERS) {
    for (const key of KEYS7) {
      if (eq(`${key}${filters.includeDims ? ', dimensions included' : ''}: the report of the job is the report `
        + 'of its House alone (rows, bands, closing tables)',
      M.buildReportHtml(p, labelOf(p), key, filters, OPTIONS), M.buildReportHtml(q, labelOf(q), key, filters, OPTIONS))) same += 1;
    }
  }
  log(`   (${same} of ${KEYS7.length * FILTERS.length} reports equal)`);
  const model = M.countingOf(p);
  const listsMain = m => !isDeck(m);
  eq('versionsLine: House\'s work on another version only (Deck\'s Rail on Rev B is not this report\'s)',
    M.versionsLine(model, labelOf(p), listsMain), M.versionsLine(M.countingOf(q), labelOf(q)));
  const tail = M.buildReportHtml(p, labelOf(p), 'estimate', FILTERS[0], OPTIONS);
  ok('...the closing table lists Siding (House) and not Rail (Deck)', /<td>Siding<\/td>/.test(tail) && !/<td>Rail<\/td>/.test(tail));
  const csv = await exported(M, p, 'csv');
  const csvQ = await exported(M, q, 'csv');
  eq('the CSV\'s text: the cells of House alone, and no title line', text(csv.bytes), text(csvQ.bytes));
  const wb = await exported(M, p, 'xlsx');
  const wbQ = await exported(M, q, 'xlsx');
  ok('the workbook: byte for byte the workbook of House alone', !!wb.bytes && !!wbQ.bytes
    && wb.bytes.length === wbQ.bytes.length && wb.bytes.every((b, i) => b === wbQ.bytes[i]));
  // The Report Center's floors and trades: House's, never Deck's.
  const pD = await fresh({ edit: o => {
    for (const m of Object.values(o.measurements).flat()) {
      if (m.name === 'Deck boards') Object.assign(m, { floor_level: 'Deck Level', category: 'Decking' });
    }
  } });
  const rc = await reportCenter(M, pD);
  ok('the Report Center\'s floors and trades are House\'s: no Deck Level, no Decking',
    rc.selects[0].includes('Level 1') && !rc.selects[0].includes('Deck Level') && !rc.selects[1].includes('Decking')
    && rc.selects[1].includes('Framing'), JSON.stringify(rc.selects.slice(0, 2)));
}

// ═══ T12b: the names ═════════════════════════════════════════════════════
log('\n-- T12b: every report says which takeoff it is of --');
/** Deck's items, by the test's own reading: what the notes count. */
const deckItems = p => [...p.allItems()].filter(([, m]) => isDeck(m) && !NON_TAKEOFF.has(m.type) && !m.group_child).length;
{
  const p = await fresh();
  const nDeck = deckItems(p);
  const est = M.buildReportHtml(p, labelOf(p), 'estimate', FILTERS[0], OPTIONS);
  ok('the header: "Takeoff: House" leads the meta line', /<p class="meta">Takeoff: House {3}· {3}Printed /.test(est),
    (/<p class="meta">[^<]*<\/p>/.exec(est) || [])[0]);
  ok('...and the versions band still hangs after it', /<p class="meta">[^<]*<\/p><p style="font-size:11px;color:#8a5a12/.test(est));
  for (const key of KEYS7.filter(k => k !== 'matlist')) {
    ok(`${key}: its header names House`, M.buildReportHtml(p, labelOf(p), key, FILTERS[0], OPTIONS)
      .includes('<p class="meta">Takeoff: House'));
  }
  const ml = M.buildReportHtml(p, labelOf(p), 'matlist', FILTERS[0], OPTIONS);
  ok('the Material List\'s title: "<project> - House"', ml.includes('<h1>Two Takeoffs - House</h1>'), (/<h1>[^<]*<\/h1>/.exec(ml) || [])[0]);
  const csv = await exported(M, p, 'csv');
  const wb = await exported(M, p, 'xlsx');
  eq('the file names: "<job> - House"', [csv.name, wb.name], ['Two Takeoffs - House.csv', 'Two Takeoffs - House.xlsx']);
  const parts = unzip(wb.bytes);
  eq('the workbook\'s own title (docProps/core.xml)', (/<dc:title>([^<]*)<\/dc:title>/.exec(parts.get('docProps/core.xml') || '') || [])[1],
    'Takeoff: House');
  ok('...its part is declared and related', (parts.get('[Content_Types].xml') || '').includes('PartName="/docProps/core.xml"')
    && (parts.get('_rels/.rels') || '').includes('Target="docProps/core.xml"'));
  const sheets = [...parts.keys()].filter(k => k.startsWith('xl/worksheets/'));
  ok('every sheet\'s printed header, centred, after its merged cells and last in the sheet',
    sheets.length === 3 && sheets.every(k => /(<\/sheetData>\n|<\/mergeCells>)<headerFooter><oddHeader>&amp;CTakeoff: House<\/oddHeader><\/headerFooter>\n<\/worksheet>$/
      .test(parts.get(k))), sheets.map(k => parts.get(k).slice(-140)).join(' | '));
  const rc = await reportCenter(M, p);
  eq('the Report Center: its title and the note above the preview',
    [rc.title, rc.note], ['Report Center — House', `This is the takeoff House. This job also has Deck (${nDeck} items), `
      + 'worked on in the desktop app — it is in none of these reports.']);
  eq('...the print window\'s title, the name Save as PDF offers', rc.print, 'Two Takeoffs - House - Estimate Summary');
  // A name with '&' and '<' in it: escaped where it is markup, doubled where
  // Excel reads '&' as a header code, made safe in a file name.
  const pA = await fresh({ edit: o => { o.metadata.takeoff_main_label = 'R&D <1>'; } });
  const estA = M.buildReportHtml(pA, labelOf(pA), 'estimate', FILTERS[0], OPTIONS);
  ok('"R&D <1>": the header escapes it', estA.includes('<p class="meta">Takeoff: R&amp;D &lt;1&gt;'));
  const wbA = await exported(M, pA, 'xlsx');
  const partsA = unzip(wbA.bytes);
  eq('...the workbook: its name, its title, a sheet\'s header (& doubled for Excel, then escaped)',
    [wbA.name, (/<dc:title>([^<]*)<\/dc:title>/.exec(partsA.get('docProps/core.xml') || '') || [])[1],
      (/<oddHeader>([^<]*)<\/oddHeader>/.exec(partsA.get('xl/worksheets/sheet1.xml') || '') || [])[1]],
    ['Two Takeoffs - R&D _1_.xlsx', 'Takeoff: R&amp;D &lt;1&gt;', '&amp;CTakeoff: R&amp;&amp;D &lt;1&gt;']);
  const rcA = await reportCenter(M, pA);
  eq('...the print title escaped in the page', rcA.print, 'Two Takeoffs - R&amp;D _1_ - Estimate Summary');
  // Main with nothing in it.
  const pE = await fresh({ edit: o => {
    for (const k of Object.keys(o.measurements)) o.measurements[k] = o.measurements[k].filter(m => isDeck(m) || NON_TAKEOFF.has(m.type));
  } });
  const words = `No measurements found in House. This job's other takeoffs — Deck (${deckItems(pE)} items) — are worked on `
    + 'in the desktop app.';
  eq('House with nothing in it: the CSV says so, naming the others, and hands nothing over',
    await alertSaid(() => M.exportCsv(pE, labelOf(pE), { includeDims: false })), { said: words, handed: 0 });
  eq('...the workbook too', await alertSaid(() => M.exportWorkbook(pE, labelOf(pE), { includeDims: false })),
    { said: words, handed: 0 });
  ok('...an empty report says it of House', M.buildReportHtml(pE, labelOf(pE), 'estimate', FILTERS[0], OPTIONS)
    .includes('<i>Nothing in House matches the current filters.</i>')
    && M.buildReportHtml(pE, labelOf(pE), 'matlist', FILTERS[0], OPTIONS).includes('<i>No matching items in House.</i>'));
  // Deck as many takeoffs: "they are in none".
  const pP = await fresh({ edit: o => { o.metadata.takeoff_lists.push({ list_id: 'tl-patio001', label: 'Patio' }); } });
  eq('two other takeoffs: "they are in none"', (await reportCenter(M, pP)).note,
    `This is the takeoff House. This job also has Deck (${nDeck} items) and Patio (nothing in it yet), worked on in the `
    + 'desktop app — they are in none of these reports.');
}

// ═══ T12c: a job with only Main is v31's ═════════════════════════════════
log('\n-- T12c: a job with only Main reports, names and writes as v31 --');
let v31 = null;
let v31Dir = null;
try {
  v31Dir = await mkdtemp(path.join(os.tmpdir(), 'ptt-v31-outputs-'));
  const files = execFileSync('git', ['-C', ROOT, 'ls-tree', '-r', '--name-only', V31, '--', 'js'],
    { encoding: 'utf-8', windowsHide: true }).split('\n').filter(Boolean);
  for (const f of files) {
    const buf = execFileSync('git', ['-C', ROOT, 'show', `${V31}:${f}`], { windowsHide: true, maxBuffer: 1 << 28 });
    await mkdir(path.dirname(path.join(v31Dir, f)), { recursive: true });
    await writeFile(path.join(v31Dir, f), buf);
  }
  v31 = await modules(v31Dir);
} catch (err) {
  ok(`v31's modules read out of this repository's history (${V31}) -- this check compares a Main-only job's `
    + 'reports and files with v31\'s; it needs the commit (git fetch --unshallow)', false, String(err.message || err).split('\n')[0]);
}
if (v31) {
  const p = await fresh({ edit: mainOnly });
  const pOld = await fresh({ mods: v31, edit: mainOnly });
  let same = 0;
  for (const filters of FILTERS) {
    for (const key of KEYS7) {
      if (eq(`Main-only ${key}${filters.includeDims ? ', dimensions included' : ''}: v31's report, character for character`,
        M.buildReportHtml(p, labelOf(p), key, filters, OPTIONS),
        v31.buildReportHtml(pOld, labelOf(pOld), key, filters, OPTIONS))) same += 1;
    }
  }
  log(`   (${same} of ${KEYS7.length * FILTERS.length} reports equal v31's)`);
  const csv = await exported(M, p, 'csv');
  const csvOld = await exported(v31, pOld, 'csv');
  eq('Main-only: the CSV\'s name and text are v31\'s', [csv.name, text(csv.bytes)], [csvOld.name, text(csvOld.bytes)]);
  const wb = await exported(M, p, 'xlsx');
  const wbOld = await exported(v31, pOld, 'xlsx');
  ok('Main-only: the workbook is v31\'s, byte for byte', !!wb.bytes && wb.name === wbOld.name
    && wb.bytes.length === wbOld.bytes.length && wb.bytes.every((b, i) => b === wbOld.bytes[i]), `${wb.name} vs ${wbOld.name}`);
  ok('...no docProps part, no printed header', !unzip(wb.bytes).has('docProps/core.xml')
    && ![...unzip(wb.bytes).values()].some(x => x.includes('headerFooter')));
  const rc = await reportCenter(M, p);
  const rcOld = await reportCenter(v31, pOld);
  eq('Main-only: the Report Center\'s title, note, floors and trades, and the print title are v31\'s', rc, rcOld);
  eq('...the title is "Report Center", no note, the print title "Takeoff Report"', [rc.title, rc.note, rc.print],
    ['Report Center', null, 'Takeoff Report']);
  // an empty job says what v31 says
  const empty = o => { mainOnly(o); for (const k of Object.keys(o.measurements)) o.measurements[k] = []; };
  const pE = await fresh({ edit: empty });
  const pEOld = await fresh({ mods: v31, edit: empty });
  eq('Main-only, nothing in it: the exports say what v31 says',
    [await alertSaid(() => M.exportCsv(pE, labelOf(pE), {})), await alertSaid(() => M.exportWorkbook(pE, labelOf(pE), {}))],
    [await alertSaid(() => v31.exportCsv(pEOld, labelOf(pEOld), {})),
      await alertSaid(() => v31.exportWorkbook(pEOld, labelOf(pEOld), {}))]);
}
if (v31Dir) await rm(v31Dir, { recursive: true, force: true });

// ═══ T12d: the job-wide canary ═══════════════════════════════════════════
//
// The counting rule is the whole job's: a total the web re-adds after a
// change of which drawing counts, a promotion or a delete must be the one the
// desktop re-adds on opening -- for Deck's items as much as for House's. The
// four steps run through main.js's own countThisVersion, askCountAfterTakeoff
// and deleteCurrentPage (lifted by text, the counting functions real) and a
// real ToolController's delete.
log('\n-- T12d: the desktop reopens every save re-adding no total, Deck\'s included --');
if (!(await haveDesktopSource())) {
  log('   SKIPPED (set PTT_DESKTOP_SRC): the desktop re-adds the totals itself');
} else {
  const NAMES = ['countThisVersion', 'askCountAfterTakeoff', 'stillOn', 'deleteCurrentPage'];
  const texts = NAMES.map(n => {
    const at = [`\nasync function ${n}(`, `\nfunction ${n}(`].map(h => MAIN.indexOf(h)).find(i => i >= 0);
    return at === undefined ? null : MAIN.slice(at + 1, MAIN.indexOf('\n}\n', at) + 2);
  });
  ok('main.js has countThisVersion, askCountAfterTakeoff, stillOn and deleteCurrentPage', texts.every(Boolean));
  const envOf = (p, page, revId) => ({
    app: { project: p, currentPage: page, editing: true,
      pages: { get pageCount() { return p.pageCount; }, removePage() {} } },
    versionView: { revId },
    countingModel: () => new M.CountingModel({ metadata: p.metadata, measurements: p.measurements, pageCount: p.pageCount }),
    D: { confirmDialog: async () => true, alertDialog: async () => {} }, countAsked: new Set(),
    setStatus() {}, sayPrice() {}, afterBookChange() {}, applyBooking: M.applyBooking, resyncGroups: M.resyncGroups,
    itemRevId: REV.itemRevId, takeoffFingerprint: M.takeoffFingerprint,
    isTakeoffItem: M.isTakeoffItem, takeoffQuantityWords: M.takeoffQuantityWords, takeoffMoveWords: M.takeoffMoveWords,
    hiddenTakeoffsWords: M.hiddenTakeoffsWords, takeoffNaming: M.takeoffNaming,
    pageFinalLabel: i => p.pageLabel(i), leftByChoice: () => false, calloutPreview: { clearCache() {} },
    thumbs: { refresh() {} }, pageImage: null, goToPage: async () => {},
  });
  const run = async (p, page, revId, fn, ...args) => {
    const env = envOf(p, page, revId);
    // Each as an expression in the env's scope (stillOn is called by name).
    const body = NAMES.map((n, i) => `const ${n} = (${texts[i]});`).join('\n');
    // eslint-disable-next-line no-new-func
    const f = new Function('env', `with (env) { ${body}\nreturn ${fn}; }`)(env);
    M.setTakeoffNaming(() => TL.takeoffNamingOf(p.metadata, p.measurements, TL.WEB_TAKEOFF));
    try { return await f(...args); } finally { M.setTakeoffNaming(null); }
  };
  /** The job as the web saves it, as the desktop is handed it. */
  const jobOf = (p, name) => {
    const md = p.buildSaveMetadata();
    const measurements = md.measurements;
    delete md.measurements;
    delete md.annotations;
    md.revisions = (md.revisions || []).map((r, i) => ({ ...r, pages: (p.metadata.revisions[i] || {}).pageCount || 0 }));
    return { name, pageCount: p.pageCount, metadata: md, measurements };
  };
  const masters = p => [...p.allItems()].filter(([, m]) => m.group_id && !m.group_child).map(([, m]) => [m.name, isDeck(m)]);
  ok('the fixture: a multi-sheet item in each takeoff', JSON.stringify(masters(await fresh()).map(([, d]) => d).sort())
    === '[false,true]');
  const saves = [];
  {
    // Count this version: X2.0 (Wall M's and Deck boards' runs on its own
    // drawing) counts from Rev B from now on.
    const p = await fresh();
    const deck = [...p.allItems()].find(([, m]) => m.name === 'Deck boards' && !m.group_child)[1];
    const was = deck.value;
    await run(p, 1, 'r2', 'countThisVersion');
    ok('Count this version on X2.0: the sheet now counts from Rev B', M.countingOf(p).workingVersionOf(1) === 'r2');
    ok('...Deck boards\' stored total re-added without its X2.0 run: the resync is the whole job\'s',
      deck.value !== was && deck.value === M.countingOf(p).countedQty(0, deck)[0], `${was} -> ${deck.value}`);
    saves.push(jobOf(p, 'Count this version on X2.0'));
  }
  {
    // Delete X1.0, which holds the main shapes of Wall M (House) and Deck
    // boards (Deck): each run on another sheet takes its item over.
    const p = await fresh();
    await run(p, 0, '', 'deleteCurrentPage');
    const deckHeir = [...p.allItems()].find(([, m]) => m.name === 'Deck boards' && !m.group_child);
    ok('Delete X1.0: Deck boards lives on, a run promoted in its main shape\'s place, still Deck\'s',
      !!deckHeir && isDeck(deckHeir[1]) && p.pageCount === 2, JSON.stringify(masters(p)));
    saves.push(jobOf(p, 'Delete X1.0'));
  }
  {
    // A canvas delete of House's run of Wall M on X2.0.
    const p = await fresh();
    const canvas = { addEventListener() {}, setPointerCapture() {}, releasePointerCapture() {}, style: {} };
    const c = new M.ToolController({ canvas, viewport: { zoom: 1, toPage: pt => pt }, project: p, currentPage: () => 1, host: {} });
    const run1 = [...p.allItems()].find(([pg, m]) => pg === 1 && m.name === 'Wall M' && m.group_child)[1];
    c.select([run1._uid]);
    const n = c.deleteSelected();
    ok('a canvas delete of House\'s Wall M run on X2.0', n === 1 && !(p.measurements[1] || []).includes(run1));
    saves.push(jobOf(p, 'Delete a House run'));
  }
  {
    // The Undo of a booking: a takeoff on Rev B, "Count Rev B?" Yes (the
    // booking rides the takeoff's level), then Undo.
    const p = await fresh();
    const item = { type: 'area', name: 'Porch', label: 'Porch', points: [[2, 2], [8, 2], [8, 8]], value: 36,
      unit: 'SF', visible: true, rev_id: 'r2', rev_page: 0, floor_level: 'Level 1', category: 'Framing', sort_order: 9000 };
    const made = p.addItem(1, item, { label: 'Area' });
    await run(p, 1, 'r2', 'askCountAfterTakeoff', 1, made, p.undoTop, 'k');
    ok('a takeoff on Rev B, its question answered Yes: the booking rides its level',
      M.countingOf(p).workingVersionOf(1) === 'r2' && !!p.undoTop.booking);
    p.undo();
    ok('...Undo: the takeoff and the booking go back', M.countingOf(p).workingVersionOf(1) === ''
      && ![...p.allItems()].some(([, m]) => m.name === 'Porch'));
    saves.push(jobOf(p, 'Undo of a booking'));
  }
  const script = path.join(here, 'counting-python-truth.py');
  let back = null;
  try {
    back = PY.parsePyJson(execFileSync('python', ['-B', script, '--reopen'], {
      input: PY.stringifyPyJson({ jobs: saves, sums: [], promote: [] }),
      env: { ...process.env, PTT_DESKTOP_SRC: DESKTOP_SRC }, maxBuffer: 1 << 28, windowsHide: true, encoding: 'utf-8' }));
  } catch (err) {
    ok('the desktop could not reopen what this app saved (counting-python-truth.py --reopen)', false,
      String(err.stderr || err.message).trim().split('\n').join('\n  '));
  }
  if (back) {
    saves.forEach((s, k) => eq(`${s.name}: the desktop reopens the save re-adding no total (Deck's included)`,
      back.moved[k], []));
  }
}

log(fails ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass -- every report, table and export is Main's and says so, and a job with only `
    + 'Main reports and writes as v31');
process.exit(fails ? 1 : 0);
