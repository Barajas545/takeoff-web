// TAKEOFF LISTS (desktop 3.08): what the web SHOWS of a job of several
// takeoffs -- Main's, only.
//
// The web is in Main, always, this round. Every reader that shows or
// touches an item asks one question, ToolController.inActiveList (the
// desktop's GLPageWidget.in_active_list, composed into _onScreen as the
// desktop composes it into version_items): what is painted is what a tap
// finds, what Delete removes, what the list lists and what a card counts.
// Another takeoff's work is none of them, a shared mark (a note, a callout,
// a ruler) is in every one of them, and a job with only Main reads exactly
// as v31 read it.
//
// Every check goes through the real producers: the desktop-made
// tests/data/two-takeoffs.takeoff (Main renamed House, Deck, the job left
// in Deck) opened with openProject -> Project.loadFrom, a real
// ToolController driven by pointer events, the real ItemsPanel and
// Thumbnails on stand-in elements, the real Renderer on a stand-in canvas,
// and main.js's own lines -- drawFrame's isVisible and the two host
// lambdas -- lifted by text.
//
//   T2  painted == tappable == deletable == listed == badged, page by page;
//       every shared mark painted and tappable; one frame of 5,000 items
//       timed through the real Renderer (spec G13).
//   T3  the Count tool: Carry on with never offers Deck's count, a tap by
//       name makes a NEW untagged count beside Deck's namesake, a held
//       count is never Deck's, and _framedSource ignores a framed Deck
//       namesake.
//   T4  the select gate: select() of a Deck item selects nothing, a row's
//       walk across a hand-split item never selects its Deck run, a long
//       press on Deck's pixels opens no menu and a drag on them moves
//       nothing (the same on Main's do).
//   T5  the SHEET chip: hidden.takeoffs only when non-zero, said on top and
//       under "Not shown:", never in `filtered`; soloCount and the combos
//       are Main's; a Main-only job lists, notes and words exactly as v31
//       (v31's own modules, read out of this repository's history).
//   T9  what the web WRITES reaches no item it hides: a heading's Rename in
//       House leaves Deck's shapes and a shared note Deck still files under
//       the name as they were, and takes the spelling only another takeoff
//       has without a merge question; Set's 'every item' is every item of
//       House, and Deck's blank ones stay blank; where new pins go moves only
//       when no takeoff keeps the trade -- each through the real list, its
//       heading menu and main.js's own router (the count guards are T3's,
//       and the Delete sheet words U9's). A Main-only job renames and sets
//       the whole job, in v31's words.
//   T13 the words: the list's top line, empty state, foot and title (its
//       tooltip and a tap), main.js's syncTitle, setSheetScale's question
//       and the sentence on open (lifted by text and run), the tile tip and
//       the Count button's tooltip (the real VersionBar) -- House wherever
//       Main would be, a tag with no record in its own words, and with no
//       tag and no registry every one of them v31's.
//
// Run: node tests/takeoff-lists-view.mjs
import { execFileSync } from 'node:child_process';
import { setMaxListeners } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

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

// ── a document for the panel and the cards ──────────────────────────────

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
    this.id = '';
    this.hidden = false;
    this.scrollTop = 0;
    this._text = '';
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
  set innerHTML(v) { this.textContent = String(v).replace(/<[^>]*>/g, ''); }
  get isConnected() { for (let x = this; x; x = x.parentNode) if (x === this.ownerDocument) return true; return false; }
  appendChild(c) {
    if (c.tagName === '#FRAGMENT') { for (const k of [...c.children]) this.appendChild(k); return c; }
    if (c.parentNode) c.parentNode.children = c.parentNode.children.filter(x => x !== c);
    c.parentNode = this;
    this.children.push(c);
    return c;
  }
  prepend(c) { this.appendChild(c); this.children.unshift(this.children.pop()); return c; }
  insertBefore(c, ref) {
    this.appendChild(c);
    if (ref) { this.children.pop(); this.children.splice(this.children.indexOf(ref), 0, c); }
    return c;
  }
  addEventListener(t, fn) { this._l.push({ t, fn }); }
  removeEventListener(t, fn) { this._l = this._l.filter(l => !(l.t === t && l.fn === fn)); }
  descendants() { return this.children.flatMap(c => [c, ...c.descendants()]); }
  matches(sel) {
    if (sel.includes(',')) return sel.split(',').some(s => this.matches(s));
    const m = /^([a-z]*)((?:\.[\w-]+)*)$/i.exec(sel.trim());
    if (!m) return false;
    if (m[1] && this.tagName !== m[1].toUpperCase()) return false;
    return m[2].split('.').filter(Boolean).every(c => this.classList.contains(c));
  }
  querySelector(sel) { return this.descendants().find(e => e.matches(sel)) || null; }
  querySelectorAll(sel) { return this.descendants().filter(e => e.matches(sel)); }
  closest(sel) { for (let x = this; x && x.tagName; x = x.parentNode) if (x.matches(sel)) return x; return null; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 200, bottom: 20, width: 200, height: 20 }; }
  scrollIntoView() {}
  getContext() { return null; }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(x => x !== this);
    this.parentNode = null;
  }
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
}
function stubDocument() {
  const doc = new StubEl('#document', null);
  doc.ownerDocument = doc;
  doc.createElement = tag => new StubEl(tag, doc);
  doc.createElementNS = (ns, tag) => new StubEl(tag, doc);
  doc.createDocumentFragment = () => new StubEl('#fragment', doc);
  doc.documentElement = doc.appendChild(new StubEl('html', doc));
  doc.documentElement.style.setProperty = () => {};
  doc.documentElement.dataset = {};
  doc.body = doc.documentElement.appendChild(new StubEl('body', doc));
  doc.add = (tag, id) => { const e = new StubEl(tag, doc); e.id = id; return doc.body.appendChild(e); };
  return doc;
}
globalThis.document = stubDocument();
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.window ??= { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {} };

/** The app's modules, from `root` (this tree, or v31's read out of git). */
async function modules(root) {
  const m = p => import(pathToFileURL(path.join(root, p)).href);
  return {
    ...(await m('js/core/takeoff-file.js')), ...(await m('js/core/project.js')),
    ...(await m('js/core/counting.js')), ...(await m('js/core/revisions.js')),
    ...(await m('js/tools/controller.js')), ...(await m('js/ui/items-panel.js')),
    ...(await m('js/ui/thumbnails.js')), ...(await m('js/render/renderer.js')),
    ...(await m('js/render/viewport.js')),
  };
}
const M = await modules(ROOT);
const TL = await import(pathToFileURL(path.join(ROOT, 'js/core/takeoff-lists.js')).href);
const MAIN = await readFile(path.join(ROOT, 'js/main.js'), 'utf-8');

// ── main.js's own lines, lifted by text ─────────────────────────────────

/** drawFrame's isVisible: (app, controller) => (m => ...). */
const VISIBLE_TEXT = (/\n {4}isVisible: (m => [^\n]+),\n/.exec(
  MAIN.slice(MAIN.indexOf('function drawFrame()'))) || [])[1] || null;
/** One arrow of a host object literal, by its key, inside `new <Cls>({`. */
function hostArrow(cls, key) {
  const a = MAIN.indexOf(`new ${cls}({`);
  if (a < 0) return null;
  const b = MAIN.indexOf('\n});', a);
  const hit = new RegExp(`\\n {2,4}${key}: (m => [^\\n]+),\\n`).exec(MAIN.slice(a, b));
  return hit ? hit[1] : null;
}
const PANEL_IN_LIST = hostArrow('ItemsPanel', 'inActiveList');
const CARD_IN_VIEW = hostArrow('Thumbnails', 'inView');
ok('main.js: drawFrame hands the renderer isVisible, and the panel and the cards their takeoff test',
  !!VISIBLE_TEXT && !!PANEL_IN_LIST && !!CARD_IN_VIEW,
  JSON.stringify({ VISIBLE_TEXT, PANEL_IN_LIST, CARD_IN_VIEW }));
// eslint-disable-next-line no-new-func
const lift = (text, names, values) => new Function(...names, `return (${text});`)(...values);
const paintTest = (app, controller) => lift(VISIBLE_TEXT || 'm => true', ['app', 'controller'], [app, controller]);
const panelTest = controller => lift(PANEL_IN_LIST || 'undefined', ['controller'], [controller]);
const cardTest = controller => lift(CARD_IN_VIEW || 'undefined', ['controller'], [controller]);

// ── the job ──────────────────────────────────────────────────────────────

const BYTES = await readFile(path.join(here, 'data', 'two-takeoffs.takeoff'));
const TAG = 'takeoff_list';
const KEYS = ['takeoff_lists', 'takeoff_list_active', 'takeoff_main_label'];

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
const find = (p, name, pg = null, child = false) => {
  for (const [k, m] of p.allItems()) {
    if (m.name === name && (pg == null || k === pg) && !!m.group_child === child) return m;
  }
  throw new Error(`no ${name}@${pg}${child ? ' (run)' : ''}`);
};
const isDeck = m => TL.takeoffListOf(m) !== '';
const nameOf = m => `${m.type}:${m.name ?? m.text ?? ''}${m.group_child ? '(run)' : ''}`;
const names = list => [...list].map(nameOf).sort();

/** A real ToolController on a stand-in canvas: page coordinates are client
 *  coordinates, and the zoom is high, so a grab finds only what is under it. */
function ctlRig(p, page = 0, extraHost = {}) {
  const st = { page, menus: [], offered: null, answer: null };
  const on = {};
  const canvas = { addEventListener: (t, f) => { on[t] = f; }, setPointerCapture() {},
    releasePointerCapture() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1024, height: 704 }) };
  const viewport = { zoom: 20, toPage: pt => pt, eventToPage: ev => [ev.clientX, ev.clientY],
    toScreen: (x, y) => [x, y], panBy() {}, ensureVisible() {} };
  const host = {
    showItemMenu: item => st.menus.push(item),
    askCountItem: async ({ existing }) => {
      st.offered = existing;
      const a = st.answer;
      return typeof a === 'function' ? a(existing) : (a ? structuredClone(a) : null);
    },
    ...extraHost,
  };
  const c = new M.ToolController({ canvas, viewport, project: p, currentPage: () => st.page, host });
  const ev = (type, x, y, pointerType = 'mouse') => ({ pointerId: pointerType === 'touch' ? 7 : 1, pointerType,
    button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY: y, type,
    shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, preventDefault() {}, stopPropagation() {} });
  return { c, on, st, ev, viewport };
}
const settle = async () => { for (let i = 0; i < 4; i += 1) await new Promise(r => setImmediate(r)); };
const wait = ms => new Promise(r => setTimeout(r, ms));
/** Where a shape is grabbed: its own first vertex (a note by its box's centre). */
const grabOf = m => (m.type === 'textnote' ? m.points[1] : m.points[0]);

/** The real ItemsPanel on stand-in elements, the app's host lambda in it. */
function panelRig(p, c, { view = null, chip = false, mods = M } = {}) {
  const doc = stubDocument();
  const was = globalThis.document;
  globalThis.document = doc;
  const settings = { values: { [mods.SHEET_SETTING]: chip }, get(k) { return this.values[k]; }, set(k, v) { this.values[k] = v; } };
  const host = {
    pageLabel: i => p.pageLabel(i),
    readOnly: () => false,
    view: () => view,
    settings,
    say: () => {},
    touchLayout: () => false,
    listShown: () => true,
    hint: () => {},
    selectItem: () => {},
    openProperties: () => {},
    showItemMenu: () => null,
    showMenu: () => null,
    canClassifyFromHeadings: () => false,
  };
  if (c) host.inActiveList = panelTest(c);
  setMaxListeners(200, p);         // one panel per check on the same job
  const panel = new mods.ItemsPanel({
    root: doc.body, listEl: doc.add('div', 'itemList'), floorFilterEl: doc.add('select', 'floorFilter'),
    groupFilterEl: doc.add('select', 'groupFilter'), costToggleEl: null, footEl: doc.add('div', 'itemsFoot'),
    sheetChipEl: doc.add('button', 'sheetChip'), titleEl: doc.add('span', 'itemsTitle'),
    project: p, host,
  });
  panel.collapsed.clear();
  panel.refresh();
  const kids = () => panel.listEl.children;
  const byUid = new Map([...p.allItems()].map(([, m]) => [m._uid, m]));
  return {
    panel, doc,
    restore() { globalThis.document = was; },
    rows: () => kids().filter(e => e.classList.contains('row')).map(e => byUid.get(e.dataset.id)),
    notes: () => kids().filter(e => e.classList.contains('sheet-note')).map(e => e.textContent),
    combos: () => [panel.floorFilterEl.children.map(o => o.value), panel.groupFilterEl.children.map(o => o.value)],
    foot: () => panel.footEl.textContent,
    title: () => [panel.titleEl.textContent, panel.titleEl.title],
  };
}
const own = page => ({ page, revId: '', revPage: null, coming: false });

// ═══ T2: one set ═════════════════════════════════════════════════════════
log('-- T2: painted == tappable == deletable == listed == badged --');
{
  const p = await fresh();
  const { c } = ctlRig(p, 0);
  const isVisible = paintTest({ project: p }, c);
  // the cards, with the app's own host lambda
  const doc = stubDocument();
  globalThis.document = doc;
  const thumbs = new M.Thumbnails({ listEl: doc.add('div', 'thumbList'), panelEl: doc.add('div', 'thumbsPanel'),
    project: p, pages: { pageCount: p.pageCount }, onPick() {}, inView: cardTest(c) });
  thumbs.refresh(0);
  const cards = thumbs._rows.map(r => r.querySelector('.thumb-badge'));
  const masterOf = new Map();
  for (const [, m] of p.allItems()) if (m.group_id && !m.group_child) masterOf.set(m.group_id, m);
  for (let page = 0; page < p.pageCount; page += 1) {
    c.getCurrentPage = () => page;
    const lbl = `X${page + 1}.0`;
    const onPage = p.measurements[page] || [];
    // painted: the renderer's version filter, then drawFrame's own isVisible
    const painted = M.versionItems(onPage, '', null, null).filter(isVisible);
    const tappable = onPage.filter(m => { const h = c.hitTest(grabOf(m)); return !!h && h.item === m; });
    eq(`${lbl}: what is painted is exactly what a tap finds`, names(tappable), names(painted));
    ok(`${lbl}: nothing of another takeoff is painted or found`, !painted.some(isDeck) && !tappable.some(isDeck));
    const shared = onPage.filter(m => !TL.takeoffListScoped(m));
    ok(`${lbl}: every shared mark is painted and found (${shared.length})`,
      shared.every(m => painted.includes(m) && tappable.includes(m)));
    // listed: the sheet's rows (the chip on), each by its main shape
    const rig = panelRig(p, c, { view: own(page), chip: true });
    const listed = rig.rows().filter(m => p.findItem(m._uid).pageKey !== M.STANDALONE_PAGE);
    rig.restore();
    const want = new Set(painted.filter(m => TL.takeoffListScoped(m) && !M.NOT_ROWS.has(m.type))
      .map(m => (m.group_child ? masterOf.get(m.group_id) : m)));
    eq(`${lbl}: what the list shows on this sheet is the painted items, by their main shape`,
      names(listed), names(want));
    // badged: the card counts the items of the takeoff he is in
    const mine = onPage.filter(m => !m.group_child && !isDeck(m)).length;
    const more = onPage.filter(m => !m.group_child && isDeck(m)).length;
    eq(`${lbl}: the card's badge counts Main's items, and says the rest`, [cards[page].textContent, cards[page].title],
      [mine ? String(mine) : '', mine ? `${mine} takeoff item${mine === 1 ? '' : 's'} on this sheet`
        + (more ? ` (${more} more in other takeoffs)` : '') : '']);
    ok(`${lbl}: ...and the badge is the painted count where no revision is traced on (${mine})`,
      page === 1 || mine === painted.filter(m => !m.group_child).length);
    // deletable: everything on the sheet selected, then Delete
    const p2 = await fresh();
    const { c: c2 } = ctlRig(p2, page);
    const all2 = p2.measurements[page] || [];
    c2.selected = new Set(all2.map(m => m._uid));
    c2.deleteSelected();
    const left = new Set([...p2.allItems()].map(([, m]) => m._uid));
    const gone = all2.filter(m => !left.has(m._uid));
    eq(`${lbl}: Delete with every shape on it selected takes exactly what is painted`, names(gone),
      names(M.versionItems(all2, '', null, null).filter(paintTest({ project: p2 }, c2))));
    // select(): the takeoff he is in only (the drawing is not asked)
    const p3 = await fresh();
    const { c: c3 } = ctlRig(p3, page);
    const all3 = p3.measurements[page] || [];
    c3.select(all3.map(m => m._uid));
    eq(`${lbl}: select() of every shape keeps Main's and the shared marks`,
      names(all3.filter(m => c3.selected.has(m._uid))), names(all3.filter(m => !isDeck(m))));
  }
  globalThis.document = stubDocument();
  // the full list (the chip off): Main's items, every sheet and none
  {
    const rig = panelRig(p, c, { view: null, chip: false });
    const want = [...p.allItems()].map(([, m]) => m).filter(m => !m.group_child && !isDeck(m)
      && !['distance', 'textnote', 'page_ref', 'pitch', 'ref_distance', 'group'].includes(m.type));
    eq('the full list: every Main item, nothing of Deck', names(rig.rows()), names(want));
    rig.restore();
  }
}

// One frame of 5,000 items through the real Renderer (spec G13): the paint
// asks inActiveList of every item, every frame. Timed against the same
// frame with v31's isVisible, on a job with no tags (the fast path) and on
// one with every other item in Deck.
{
  const mkCtx = () => new Proxy({ canvas: { width: 1024, height: 704 } }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return s => ({ width: String(s).length * 6, actualBoundingBoxAscent: 8,
        actualBoundingBoxDescent: 2 });
      if (k === 'getLineDash') return () => [];
      if (k === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      if (/^create(Linear|Radial|Conic)Gradient$|^createPattern$/.test(k)) return () => ({ addColorStop() {} });
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  const canvas = { getContext: () => mkCtx(), addEventListener() {}, style: {}, width: 1024, height: 704,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1024, height: 704 }) };
  const vp = new M.Viewport(canvas);
  vp.resize();
  const renderer = new M.Renderer(canvas, vp);
  const job = tagged => {
    const items = [];
    for (let i = 0; i < 5000; i += 1) {
      const x = (i % 100) * 10, y = Math.floor(i / 100) * 10;
      const m = i % 3 === 0 ? { type: 'count', name: 'Posts', points: [[x, y], [x + 2, y]], value: 2 }
        : i % 3 === 1 ? { type: 'polyline', name: 'Wall', points: [[x, y], [x + 8, y], [x + 8, y + 8]], value: 3 }
          : { type: 'area', name: 'Slab', points: [[x, y], [x + 8, y], [x + 8, y + 8], [x, y + 8]], value: 1 };
      m.color = [0.2, 0.4, 0.8, 0.35];
      if (tagged && i % 2) m[TAG] = 'tl-deck0001';
      items.push(m);
    }
    const p = new M.Project();
    p.loadFrom({ metadata: { page_labels: ['X1.0'], pixels_per_foot: 50, dpi: 150 }, annotations: {},
      measurements: { 0: items }, pageCount: 1 });
    return p;
  };
  const frame = (p, isVisible) => renderer.draw({ pageImage: null, items: p.measurements[0], annotations: [],
    overlay: null, savedOverlay: null, savedOverlayFlashing: false, isVisible, selected: new Set(), hoverId: null,
    hoverVertex: null, dragVertex: null, preview: null, markup: null, ppf: 50 });
  const median = (p, isVisible) => {
    for (let i = 0; i < 5; i += 1) frame(p, isVisible);
    const t = [];
    for (let i = 0; i < 25; i += 1) { const a = performance.now(); frame(p, isVisible); t.push(performance.now() - a); }
    return t.sort((a, b) => a - b)[12];
  };
  for (const tagged of [false, true]) {
    const p = job(tagged);
    const { c } = ctlRig(p, 0);
    const v31Visible = m => (m.scratch ? m.visible !== false : p.isVisible(m));
    let painted = 0;
    const now = paintTest({ project: p }, c);
    const counting = m => { const v = now(m); if (v) painted += 1; return v; };
    frame(p, counting);
    const tNew = median(p, now);
    const tOld = median(p, v31Visible);
    log(`   one frame of 5,000 items${tagged ? ', half of them Deck\'s' : ', no tags'}: `
      + `${tNew.toFixed(2)} ms with the takeoff test, ${tOld.toFixed(2)} ms with v31's isVisible`);
    eq(`5,000 items${tagged ? ', half Deck' : ', no tags'}: the frame paints ${tagged ? 'Main\'s half' : 'all of them'}`,
      painted, tagged ? 2500 : 5000);
    ok(`5,000 items${tagged ? ', half Deck' : ', no tags'}: the takeoff test costs the frame no more than 2 ms `
      + 'over v31\'s', tNew <= tOld * 1.5 + 2, `${tNew} vs ${tOld}`);
  }
}

// ═══ T3: the Count tool ═════════════════════════════════════════════════
log('\n-- T3: the Count tool counts onto Main only --');
const SPEC = name => ({ spec: { name, label: name, category: 'Electrical', floor_level: '', cost_type: 'material',
  unit_cost: 0, color: [0.5, 0.5, 0.5, 0.35] } });
async function tap(r, x, y) {
  r.on.pointerdown(r.ev('pointerdown', x, y, 'touch'));
  r.on.pointerup(r.ev('pointerup', x, y, 'touch'));
  await settle();
}
{
  const p = await fresh();
  const r = ctlRig(p, 0);
  const deckPosts = find(p, 'Posts', 0);
  ok('the fixture has Deck\'s Posts on X1.0 (2 marks) and Main\'s on X2.0', isDeck(deckPosts)
    && deckPosts.points.length === 2 && !isDeck(find(p, 'Posts', 1)));
  r.st.answer = null;
  await r.c.setMode('count');
  eq('Carry on with, on X1.0: Main\'s counts only -- never Deck\'s Posts', names(r.st.offered || []),
    names((p.measurements[0] || []).filter(m => m.type === 'count' && !isDeck(m))));
  // armed from the form, then "Posts" typed in the Item box: the tap goes by name
  r.st.answer = SPEC('Outlets');
  await r.c.setMode('count');
  r.st.answer = null;
  r.c.options.pendingName = 'Posts';
  await tap(r, 700, 600);
  await tap(r, 720, 600);
  const posts = (p.measurements[0] || []).filter(m => m.type === 'count' && m.name === 'Posts');
  eq('a tap with "Posts" typed makes a NEW count beside Deck\'s namesake, and the next tap joins it',
    posts.map(m => [TL.takeoffListOf(m), m.points.length]).sort(), [['', 2], ['tl-805ec4ad', 2]]);
  ok('...the new one carries no tag at all (filed in Main), and Deck\'s keeps its 2 marks',
    posts.some(m => !(TAG in m) && m.points.length === 2) && deckPosts.points.length === 2);
}
{
  // A count held on this drawing (the tool's countLeft) that is Deck's --
  // only a stale hold can name one: the gate is the drawing's test.
  const p = await fresh();
  const r = ctlRig(p, 0);
  const deckPosts = find(p, 'Posts', 0);
  r.st.answer = SPEC('Outlets');
  await r.c.setMode('count');
  r.st.answer = null;
  r.c.countLeft = [deckPosts];
  r.c.countTarget = null;
  r.c.countSpec = null;
  r.c.countAnswers = null;
  r.c.options.pendingName = 'Posts';
  await tap(r, 700, 600);
  ok('a held count is never Deck\'s: the tap by "Posts" makes Main\'s own, Deck\'s Posts keeps 2 marks',
    deckPosts.points.length === 2 && (p.measurements[0] || []).some(m => m.name === 'Posts' && !isDeck(m)),
    JSON.stringify((p.measurements[0] || []).filter(m => m.type === 'count').map(m => [m.name, m.points.length, m[TAG]])));
}
{
  const p = await fresh();
  const r = ctlRig(p, 2);
  const deckPosts = find(p, 'Posts', 0);
  const mainPosts = find(p, 'Posts', 1);
  deckPosts.framing = { assembly: 'post', src: 'deck' };
  eq('_framedSource: a framed Deck namesake hands nothing to a new Main count (X3.0)',
    r.c._framedSource('Posts', 2), null);
  mainPosts.framing = { assembly: 'post', src: 'main' };
  ok('...Main\'s framed namesake does', r.c._framedSource('Posts', 2) === mainPosts);
}

// ═══ T4: the select gate ════════════════════════════════════════════════
log('\n-- T4: nothing of Deck is selected, menued or dragged --');
{
  const p = await fresh();
  const r = ctlRig(p, 0);
  const deck = find(p, 'Deck boards', 0);
  const slab = find(p, 'Slab', 0);
  r.c.select([deck._uid]);
  eq('select([a Deck item]) selects nothing', [...r.c.selected], []);
  r.c.select([deck._uid, slab._uid]);
  eq('select([Deck\'s, Main\'s]) selects Main\'s', [...r.c.selected], [slab._uid]);
}
{
  // A hand-split item (a 3.07 edit of a 3.08 job): Main's main shape, a Deck
  // run. The row's walk across sheets (activateAcrossSheets, the producer
  // stepAcrossSheets calls) ends in controller.select of each shape.
  const p = await fresh({ edit: o => { for (const m of o.measurements[1]) if (m.name === 'Wall M') m[TAG] = 'tl-805ec4ad'; } });
  const r = ctlRig(p, 0);
  const wall = find(p, 'Wall M', 0);
  const run = find(p, 'Wall M', 1, true);
  const model = new M.CountingModel({ metadata: p.metadata, measurements: p.measurements, pageCount: p.pageCount });
  let cycle = null;
  const seen = [];
  for (let i = 0; i < 4; i += 1) {
    const step = M.activateAcrossSheets(model, 0, wall, cycle);
    cycle = step.cycle;
    r.c.select([step.target[1]._uid]);
    seen.push([...r.c.selected]);
  }
  ok('a row\'s walk over a hand-split item reaches the Deck run, and never selects it',
    seen.some(s => s.length === 0) && !seen.some(s => s.includes(run._uid)) && seen.some(s => s.includes(wall._uid)),
    JSON.stringify(seen));
}
{
  const LP = M.LONG_PRESS_MS || 500;
  for (const [what, name, deckOne] of [['Deck\'s', 'Deck boards', true], ['Main\'s', 'Slab', false]]) {
    const p = await fresh();
    const r = ctlRig(p, 0);
    const m = find(p, name, 0);
    const [x, y] = m.points[0];
    r.on.pointerdown(r.ev('pointerdown', x, y, 'touch'));
    await wait(LP + 80);
    r.on.pointerup(r.ev('pointerup', x, y, 'touch'));
    await settle();
    if (deckOne) {
      eq(`a long press on ${what} shape's own corner: no item menu, nothing selected`,
        [r.st.menus.length, r.c.selected.size], [0, 0]);
    } else {
      eq(`a long press on ${what} shape's own corner opens its item menu`, r.st.menus.map(nameOf), [nameOf(m)]);
    }
    const p2 = await fresh();
    const r2 = ctlRig(p2, 0);
    const m2 = find(p2, name, 0);
    const before = JSON.stringify(m2.points);
    const n0 = p2.changeCount;
    const [x2, y2] = m2.points[0];
    r2.on.pointerdown(r2.ev('pointerdown', x2, y2));
    for (let k = 1; k <= 8; k += 1) r2.on.pointermove(r2.ev('pointermove', x2 + k * 5, y2 + k * 5));
    r2.on.pointerup(r2.ev('pointerup', x2 + 40, y2 + 40));
    await settle();
    if (deckOne) {
      eq(`a drag from ${what} corner moves nothing and writes nothing`,
        [JSON.stringify(m2.points) === before, p2.changeCount === n0], [true, true]);
    } else {
      ok(`a drag from ${what} corner moves it`, JSON.stringify(m2.points) !== before && p2.changeCount > n0);
    }
  }
}

{
  // A split item the other way (spec G5): Deck's main shape, a run with no
  // tag -- painted and tappable here, as every untagged shape is. Its form is
  // its item's (main.js itemOfShape), and that item is Deck's: Properties…
  // from the run's own menu (a long press on its pixels, a real
  // ToolController) opens no form and writes nothing to Deck's item -- said,
  // never silent. A run of House's item opens House's form, as before; and a
  // job with only Main opens every one, as v31 did. main.js's itemOfShape
  // and openProperties are lifted by text and run.
  const fnOf = name => {
    const a = MAIN.search(new RegExp(`\\n(?:async )?function ${name}\\(`)) + 1;
    return a > 0 ? MAIN.slice(a, MAIN.indexOf('\n}\n', a) + 2) : null;
  };
  const OPEN = fnOf('openProperties');
  const OF = fnOf('itemOfShape');
  ok('main.js has openProperties and itemOfShape', !!OPEN && !!OF);
  const CT = await import(pathToFileURL(path.join(ROOT, 'js/core/counting.js')).href);
  const LP = M.LONG_PRESS_MS || 500;
  const splitRun = o => { delete o.measurements[2].find(m => m.name === 'Deck boards' && m.group_child)[TAG]; };
  const props = async ({ edit, page, name }) => {
    const p = await fresh({ edit });
    const r = ctlRig(p, page);
    const run = find(p, name, page, true);
    const [x, y] = run.points[0];
    r.on.pointerdown(r.ev('pointerdown', x, y, 'touch'));
    await wait(LP + 80);
    r.on.pointerup(r.ev('pointerup', x, y, 'touch'));
    await settle();
    const st = { asked: [], said: [], menus: r.st.menus.map(nameOf) };
    const env = {
      app: { project: p, currentPage: page }, controller: r.c, deleteName: CT.deleteName,
      otherTakeoffItemWords: TL.otherTakeoffItemWords, setStatus: t => st.said.push(t), sayToFinger: t => st.said.push(t),
      refScaleWords: () => '', recompute() {},
      D: { askItem: async a => { st.asked.push(a.existing); return { unit_cost: 99 }; },
        askStandalone: async () => null, askOpening: async () => null, askSlopeRoof: async () => null, askTile: async () => null },
    };
    // eslint-disable-next-line no-new-func
    const open = new Function('env', `with (env) { ${OF}\nreturn (${OPEN}); }`)(env);
    const n0 = p.changeCount;
    const before = JSON.stringify([...p.allItems()].map(([, m]) => m));
    if (r.st.menus.length) await open(r.st.menus[0]);       // the menu's Properties… row
    return { ...st, run, p, changed: p.changeCount !== n0 || JSON.stringify([...p.allItems()].map(([, m]) => m)) !== before };
  };
  const a = await props({ edit: splitRun, page: 2, name: 'Deck boards' });
  eq('a split item: a long press on its untagged run (painted here) opens the run\'s menu', a.menus, [nameOf(a.run)]);
  eq('...and its Properties… opens no form of Deck\'s item, writes nothing, and says why',
    [a.asked.length, a.changed, a.said],
    [0, false, ['“Deck boards” is an item of the takeoff Deck, worked on in the desktop app — its properties are not edited here.']]);
  const b = await props({ edit: null, page: 1, name: 'Wall M' });
  eq('a run of House\'s item: Properties… opens the form of its item (the main shape on X1.0), and the OK writes it',
    [b.asked.map(m => [m.name, !!m.group_child, TL.takeoffListOf(m)]), b.changed, find(b.p, 'Wall M', 0).unit_cost],
    [[['Wall M', false, '']], true, 99]);
  const c = await props({ edit: o => { splitRun(o); mainOnly(o); }, page: 2, name: 'Deck boards' });
  eq('Main-only: the same run\'s Properties… opens its item\'s form, as v31 did',
    [c.asked.map(m => [m.name, !!m.group_child]), c.said], [[['Deck boards', false]], []]);
  const d = await props({ edit: o => { splitRun(o); delete o.metadata.takeoff_lists; }, page: 2, name: 'Deck boards' });
  eq('...a takeoff the job has no record of: said as what it is', d.said,
    ['“Deck boards” is an item of a takeoff this job has no record of, worked on in the desktop app — its properties are '
      + 'not edited here.']);
}

// ═══ T5: the SHEET chip ═════════════════════════════════════════════════
log('\n-- T5: the SHEET chip says what another takeoff leaves out --');
{
  const p = await fresh();
  const { c } = ctlRig(p, 0);
  // the test's own reading of the takeoff (the tag, as the desktop reads it), not the producer's
  const inList = m => !isDeck(m);
  const model = new M.CountingModel({ metadata: p.metadata, measurements: p.measurements, pageCount: p.pageCount });
  const all = [];
  for (const key of Object.keys(p.measurements)) {
    for (const m of p.measurements[key]) {
      if (['distance', 'textnote', 'page_ref', 'pitch', 'ref_distance', 'group'].includes(m.type)) continue;
      if (m.group_child || !inList(m)) continue;
      all.push([Number(key), m]);
    }
  }
  const s0 = M.sheetRows(model, all, own(0), inList);
  const s1 = M.sheetRows(model, all, own(1), inList);
  const s2 = M.sheetRows(model, all, own(2), inList);
  eq('X1.0, X2.0, X3.0: hidden.takeoffs is the Deck items painted on the drawing, by item',
    [s0.hidden, s1.hidden, s2.hidden],
    [{ drawings: 0, waiting: 0, sheets: 3, takeoffs: 3 }, { drawings: 1, waiting: 0, sheets: 3, takeoffs: 1 },
      { drawings: 0, waiting: 0, sheets: 7, takeoffs: 2 }]);
  eq('...never counted as hidden by the filters', [s0.filtered, s1.filtered, s2.filtered], [0, 0, 0]);
  ok('...and absent without the takeoff test (no key at all)',
    !('takeoffs' in M.sheetRows(model, all, own(0)).hidden));
  eq('the words, on top and under "Not shown:"',
    [M.sheetNotes(s1, 'X2.0'), M.sheetNotes(s2, 'X3.0')],
    [{ top: null, footer: 'Not shown: 1 on another drawing of this sheet, 3 on other sheets, 1 in another takeoff' },
      { top: 'Nothing on X3.0 (this drawing) — 7 on other sheets, 2 in other takeoffs', footer: null }]);
  // ...through the real panel
  const rig2 = panelRig(p, c, { view: own(2), chip: true });
  eq('the real panel on X3.0: the one line on top, Nails on no sheet listed', [rig2.notes(), names(rig2.rows())],
    [['Nothing on X3.0 (this drawing) — 7 on other sheets, 2 in other takeoffs'], ['standalone:Nails']]);
  rig2.restore();
  const rig1 = panelRig(p, c, { view: own(1), chip: true });
  ok('the real panel on X2.0: "Not shown:" says the one in another takeoff',
    rig1.notes().includes('Not shown: 1 on another drawing of this sheet, 3 on other sheets, 1 in another takeoff'),
    JSON.stringify(rig1.notes()));
  rig1.restore();
  // A floor filter that hides every Main item on X1.0 (only Joists, on X2.0,
  // is on Level 2): the 4 Main items painted here are "hidden by them", and
  // Deck's 3 are said as what they are -- never counted with the filtered.
  const pF = await fresh({ edit: o => { for (const m of o.measurements[1]) if (m.name === 'Joists') m.floor_level = 'Level 2'; } });
  const { c: cF } = ctlRig(pF, 0);
  const rigF = panelRig(pF, cF, { view: own(0), chip: true });
  rigF.panel.floorFilter = 'Level 2';
  rigF.panel.refresh();
  eq('a filter on X1.0: Main\'s 4 items are hidden by it, Deck\'s 3 are in other takeoffs', rigF.notes(),
    ['Nothing on X1.0 (this drawing) matches the filters — 4 items here are hidden by them; '
      + '1 on another sheet, 3 in other takeoffs']);
  rigF.restore();
  eq('soloCount: the items on no sheet of the takeoff he is in (Nails; Screws is Deck\'s)',
    [M.soloCount(p.measurements, inList), M.soloCount(p.measurements)], [1, 2]);
}
{
  // the combos: Main's floors and groups only
  const p = await fresh({ edit: o => {
    for (const m of Object.values(o.measurements).flat()) {
      if (m.name === 'Deck boards' && !m.group_child) Object.assign(m, { floor_level: 'Deck Level', category: 'Decking' });
      if (m.name === 'Slab') Object.assign(m, { floor_level: 'Level 1', category: 'Concrete' });
    }
  } });
  const { c } = ctlRig(p, 0);
  const rig = panelRig(p, c, { view: null, chip: false });
  const [floors, groups] = rig.combos();
  ok('the floor and group combos list Main\'s values, never Deck\'s',
    floors.includes('Level 1') && groups.includes('Concrete') && !floors.includes('Deck Level')
    && !groups.includes('Decking'), JSON.stringify([floors, groups]));
  rig.restore();
}

// ═══ T9: what the web writes reaches no item it hides ═══════════════════
//
// Through the real ItemsPanel: its heading menu's entry, main.js's own
// router (classifyFromHeading, lifted by text) into renameFromHeader /
// assignFromHeader, the form answered the way he answers it (its sentence
// asked of the form's own describe), the job's own undo level.
log('\n-- T9: a heading\'s Rename and Set write House\'s items only --');
const ROUTER = (() => {
  const a = MAIN.indexOf('\nfunction classifyFromHeading(');
  return a < 0 ? null : MAIN.slice(a + 1, MAIN.indexOf('\n}\n', a) + 2);
})();
ok('main.js has classifyFromHeading', !!ROUTER);
const CL = await import(pathToFileURL(path.join(ROOT, 'js/core/classify.js')).href);
/** The list with renaming on, its menu's act run as main.js runs it. */
function classifyRig(p, c, opts = {}) {
  const rig = panelRig(p, c, opts);
  const st = { forms: [], asked: [], said: [], answer: null, merge: true, pending: null };
  // eslint-disable-next-line no-new-func
  const route = new Function('itemsPanel', `${ROUTER}\nreturn classifyFromHeading;`)({
    renameFromHeader: m => { st.pending = rig.panel.renameFromHeader(m); return st.pending; },
    assignFromHeader: (m, r) => { st.pending = rig.panel.assignFromHeader(m, r); return st.pending; },
  });
  Object.assign(rig.panel.host, {
    canClassifyFromHeadings: () => true,
    classifyFromHeading: (act, meta, rows) => route(act, meta, rows),
    askClassification: async o => {
      st.forms.push({ label: o.label, options: (o.options || []).map(x => x[0]),
        what: o.describe(o.options ? (st.answer.option ?? o.options[0][1]) : null) });
      // (the choice he picks, when the form offers one; the first, as it opens, otherwise)
      return st.answer && { name: st.answer.name, option: o.options ? (st.answer.option ?? o.options[0][1]) : null };
    },
    askYesNo: async (title, text) => { st.asked.push(text); return st.merge; },
    say: t => st.said.push(t),
  });
  rig.panel.refresh();
  const act = async (meta, answer) => {
    st.answer = answer;
    st.pending = null;
    const e = rig.panel._headerEntries(meta).find(x => x !== '-' && !['Collapse all', 'Expand all'].includes(x.label));
    if (!e) return false;
    e.run();
    await st.pending;
    return true;
  };
  return { ...rig, st, act };
}
const shapesOf = (p, name) => [...p.allItems()].filter(([, m]) => m.name === name || m.text === name).map(([, m]) => m);
const fieldOf = (p, name, field) => shapesOf(p, name).map(m => m[field] ?? '');
const CAT = cat => ({ type: 'cat', fl: 'Level 1', cat, sub: null });
{
  // A shared note under the name Deck still uses: it keeps the name too.
  const p = await fresh({ edit: o => { o.measurements[0].find(m => m.type === 'textnote').category = 'Framing'; } });
  const { c } = ctlRig(p, 0);
  const r = classifyRig(p, c);
  const deck0 = JSON.stringify(shapesOf(p, 'Deck boards'));
  eq('the fixture: Deck boards has 3 shapes under Framing, House\'s Wall M 2 and Joists 1',
    [fieldOf(p, 'Deck boards', 'category'), fieldOf(p, 'Wall M', 'category'), fieldOf(p, 'Joists', 'category')],
    [['Framing', 'Framing', 'Framing'], ['Framing', 'Framing'], ['Framing']]);
  const lv = p._undo.length;
  ok('the Level 1 / Framing heading offers Rename', await r.act(CAT('Framing'), { name: 'Carpentry' }));
  eq('Rename in House: House\'s shapes renamed; Deck\'s 3 shapes and the shared note keep Framing',
    [fieldOf(p, 'Wall M', 'category'), fieldOf(p, 'Joists', 'category'), fieldOf(p, 'Deck boards', 'category'),
      fieldOf(p, 'check', 'category')],
    [['Carpentry', 'Carpentry'], ['Carpentry'], ['Framing', 'Framing', 'Framing'], ['Framing']]);
  ok('...Deck\'s item is byte for byte as it was', JSON.stringify(shapesOf(p, 'Deck boards')) === deck0);
  eq('...the form asked it in House, and said what stays', [r.st.forms[0]?.label, r.st.forms[0]?.what],
    ['New name for the category \'Framing\' in House:',
      'Renames \'Framing\' on 2 items. Only in the takeoff House — 1 item in other takeoffs keeps \'Framing\'.']);
  eq('...one undo level, the takeoff in its scope, and the line names the takeoff',
    [p._undo.length - lv, p.undoTop.tool.rename[3], r.st.said],
    [1, { takeoff: '' }, ['Renamed category \'Framing\' to \'Carpentry\' on 2 items in the takeoff House — Undo puts it back']]);
  p.undo();
  eq('...Undo: every name back', [fieldOf(p, 'Wall M', 'category'), fieldOf(p, 'Joists', 'category')],
    [['Framing', 'Framing'], ['Framing']]);
  r.restore();
}
{
  // The spelling only Deck has is taken, with nothing to ask (no House item
  // is under it, so nothing is merged).
  const p = await fresh({ edit: o => {
    for (const m of Object.values(o.measurements).flat()) if (m.name === 'Slab') m.category = 'Masonry';
  } });
  const { c } = ctlRig(p, 0);
  const r = classifyRig(p, c);
  await r.act(CAT('Masonry'), { name: 'railing' });
  eq('a name only Deck spells ("Railing"): taken as Deck spells it, and no merge question',
    [fieldOf(p, 'Slab', 'category'), r.st.asked, r.st.said],
    [['Railing'], [], ['Renamed category \'Masonry\' to \'Railing\' on 1 item in the takeoff House — Undo puts it back']]);
  r.restore();
}
{
  // Set's 'every item': with the SHEET chip on X1.0 the list shows fewer
  // than House has, so the form offers the whole of House -- never Deck's.
  const p = await fresh();
  const { c } = ctlRig(p, 0);
  const deckBlank = [...p.allItems()].filter(([, m]) => isDeck(m) && CL.isClassRow(m) && !CL.classStrip(m.floor_level))
    .map(([, m]) => m);
  const houseBlank = [...p.allItems()].filter(([, m]) => !isDeck(m) && CL.isClassRow(m) && !CL.classStrip(m.floor_level))
    .map(([, m]) => m);
  eq('the fixture: Deck has 5 items with no floor level, House 4', [names(deckBlank), houseBlank.length],
    [['count:Posts', 'group:Stairs', 'polyline:Ledger', 'standalone:Screws', 'window:Window 2'], 4]);
  const deck0 = JSON.stringify(deckBlank);
  const r = classifyRig(p, c, { view: own(0), chip: true });
  await r.act({ type: 'floor', fl: '', cat: null, sub: null }, { name: 'Level 3', option: 'job' });
  eq('Set on X1.0\'s NO FLOOR LEVEL: the form offers every item in House, not the job',
    r.st.forms[0]?.options[1], `Every item in House with no floor level (${houseBlank.length})`);
  eq('..."every item": House\'s 4 filed, Deck\'s 5 still blank and byte for byte as they were',
    [houseBlank.map(m => m.floor_level), deckBlank.map(m => m.floor_level ?? ''), JSON.stringify(deckBlank) === deck0],
    [houseBlank.map(() => 'Level 3'), ['', '', '', '', ''], true]);
  r.restore();
}
{
  // Where new pins go is the job's: it moves only when no takeoff keeps the
  // trade (Deck's Window 2 is under Doors & Windows).
  const meta = { type: 'cat', fl: '', cat: 'Doors & Windows', sub: null };
  const p = await fresh();
  const { c } = ctlRig(p, 0);
  const r = classifyRig(p, c);
  await r.act(meta, { name: 'Openings' });
  eq('Rename Doors & Windows in House: Window 1 renamed, Deck\'s Window 2 keeps it -- and new pins still go there',
    [fieldOf(p, 'Window 1', 'category'), fieldOf(p, 'Window 2', 'category'), p.metadata.pin_filing ?? null],
    [['Openings'], ['Doors & Windows'], null]);
  r.restore();
  const p2 = await fresh({ edit: o => { for (const m of Object.values(o.measurements).flat()) if (m.name === 'Window 2') m.category = 'Glazing'; } });
  const { c: c2 } = ctlRig(p2, 0);
  const r2 = classifyRig(p2, c2);
  await r2.act(meta, { name: 'Openings' });
  eq('...no takeoff keeps it: new windows and doors follow the rename',
    p2.metadata.pin_filing ?? null, { window: { category: 'Openings' }, door: { category: 'Openings' } });
  p2.undo();
  ok('...and its Undo takes that back', p2.metadata.pin_filing === undefined);
  r2.restore();
}
{
  // A job with only Main: the whole job, in v31's words.
  const p = await fresh({ edit: o => { mainOnly(o); o.measurements[0].find(m => m.type === 'textnote').category = 'Framing'; } });
  const { c } = ctlRig(p, 0);
  const r = classifyRig(p, c);
  await r.act(CAT('Framing'), { name: 'Carpentry' });
  eq('Main-only: the whole job renamed, the note with it, and no takeoff in the form, the line or the scope',
    [fieldOf(p, 'Deck boards', 'category'), fieldOf(p, 'check', 'category'), r.st.forms[0]?.label, r.st.forms[0]?.what,
      r.st.said, p.undoTop.tool.rename[3]],
    [['Carpentry', 'Carpentry', 'Carpentry'], ['Carpentry'], 'New name for the category \'Framing\':',
      'Renames \'Framing\' on 3 items. Also on 1 note or ruler.',
      ['Renamed category \'Framing\' to \'Carpentry\' on 3 items — Undo puts it back'], {}]);
  r.restore();
  const p2 = await fresh({ edit: mainOnly });
  const { c: c2 } = ctlRig(p2, 0);
  const r2 = classifyRig(p2, c2, { view: own(0), chip: true });
  await r2.act({ type: 'floor', fl: '', cat: null, sub: null }, { name: 'Level 3', option: 'job' });
  eq('Main-only: Set\'s other choice is every item in the job, and files all 9',
    [r2.st.forms[0]?.options[1], [...p2.allItems()].filter(([, m]) => CL.isClassRow(m) && !CL.classStrip(m.floor_level)).length],
    ['Every item in the job with no floor level (9)', 0]);
  r2.restore();
}

// ═══ U9: Delete sheet, through main.js's own deleteCurrentPage ══════════
//
// Lifted by text and run on the fixture with the real counting functions
// and the naming main.js installs: the question names what of other
// takeoffs goes with the sheet, and a change to it while the question is
// open refuses the delete. A job with only Main keeps v31's question and
// deletes as v31 did, a change during the question included.
log('\n-- U9: Delete sheet names what of other takeoffs goes with it --');
{
  const DEL = (() => {
    const a = MAIN.indexOf('async function deleteCurrentPage() {');
    return a < 0 ? null : MAIN.slice(a, MAIN.indexOf('\n}\n', a) + 2);
  })();
  ok('main.js has deleteCurrentPage', !!DEL);
  const CT = await import(pathToFileURL(path.join(ROOT, 'js/core/counting.js')).href);
  const run = async ({ edit = null, during = null, sheet = 0 } = {}) => {
    const p = await fresh({ edit });
    const st = { asked: [], said: [], priced: [], removed: [] };
    const env = {
      app: { currentPage: sheet, project: p,
        pages: { pageCount: p.pageCount, removePage: i => st.removed.push(i) } },
      D: { alertDialog: async () => {}, confirmDialog: async (title, text) => { st.asked.push(text); if (during) during(p); return true; } },
      isTakeoffItem: CT.isTakeoffItem, takeoffQuantityWords: CT.takeoffQuantityWords, takeoffMoveWords: CT.takeoffMoveWords,
      hiddenTakeoffsWords: CT.hiddenTakeoffsWords, takeoffNaming: CT.takeoffNaming,
      pageFinalLabel: i => p.pageLabel(i), setStatus: t => st.said.push(t), sayPrice: t => st.priced.push(t),
      leftByChoice: () => false, calloutPreview: { clearCache() {} }, thumbs: { refresh() {} }, pageImage: null,
      goToPage: async () => {},
      countingModel: () => new M.CountingModel({ metadata: p.metadata, measurements: p.measurements, pageCount: p.pageCount }),
    };
    // eslint-disable-next-line no-new-func
    const fn = new Function('env', `with (env) { return (${DEL}); }`)(env);
    CT.setTakeoffNaming(() => TL.takeoffNamingOf(p.metadata, p.measurements, TL.WEB_TAKEOFF));
    try { await fn(); } finally { CT.setTakeoffNaming(null); }
    return st;
  };
  const a = await run({ sheet: 2 });
  ok('X3.0, Deck\'s only: the question says what of Deck goes with it, in the desktop\'s words',
    a.asked.length === 1 && a.asked[0].endsWith(' It also holds 1 item of the takeoff Deck, hidden here — it goes with '
      + 'it. And part of 1 item of the takeoff Deck, hidden here, which is on other sheets too — the part on this sheet '
      + 'goes with it.') && a.asked[0].includes('(in Deck)') && a.removed.length === 1, JSON.stringify(a.asked));
  const b = await run({ sheet: 2, during: p => { p.measurements[2].push({ ...p.measurements[2][1], _uid: 'late', name: 'Late' }); } });
  eq('...a Deck item added while the question was open: nothing deleted, and said why', [b.removed, b.said],
    [[], ['X3.0 was not deleted: what is taken off it changed while the question was open. '
      + 'Delete it again to see the numbers as they are now.']]);
  const c = await run({ sheet: 2, edit: mainOnly });
  ok('Main-only: no word of other takeoffs', c.asked.length === 1 && !/takeoff (Deck|of)|other takeoffs|\(in /.test(c.asked[0])
    && c.removed.length === 1, JSON.stringify(c.asked));
  const d = await run({ sheet: 2, edit: mainOnly, during: p => { p.measurements[2].push({ ...p.measurements[2][1], _uid: 'late', name: 'Late' }); } });
  eq('Main-only, the same change during the question: deleted, as v31 deletes it', d.removed, [2]);

  // A tag the job has no record of (the registry gone, every tag kept): the
  // desktop's open-time heal registers every tag, so it never words one;
  // the web cannot heal, and says the takeoff as what it is -- never "the
  // takeoff another takeoff".
  const hidden = q => (q.asked[0] || '').slice((q.asked[0] || '').indexOf(' It also holds') + 1);
  const noRecord = o => { delete o.metadata.takeoff_lists; };
  const e = await run({ sheet: 0, edit: noRecord });
  eq('a takeoff the job has no record of: X1.0\'s question says what goes, in its own words',
    [hidden(e), e.removed.length], ['It also holds 2 items of a takeoff this job has no record of, hidden here — they go '
      + 'with it. And part of 1 item of a takeoff this job has no record of, hidden here, which is on other sheets too '
      + '— the part on this sheet goes with it.', 1]);
  const f = await run({ sheet: 2, edit: noRecord });
  ok('...X3.0\'s too, and never "the takeoff another takeoff"', hidden(f).startsWith('It also holds 1 item of a '
    + 'takeoff this job has no record of, hidden here — it goes with it.') && !/the takeoff another takeoff/.test(f.asked[0]),
  JSON.stringify(f.asked));
  // Window 2 in a second takeoff of no record: two of them, said as two.
  const otherTag = o => { o.measurements[0].find(m => m.name === 'Window 2')[TAG] = 'tl-norecord'; };
  const g = await run({ sheet: 0, edit: o => { noRecord(o); otherTag(o); } });
  ok('...two takeoffs of no record: "of 2 takeoffs this job has no record of"', hidden(g).startsWith('It also holds 2 '
    + 'items of 2 takeoffs this job has no record of, hidden here — they go with it.'), JSON.stringify(g.asked));
  // ...and one of them beside Deck, which the job knows: the desktop's words.
  const h = await run({ sheet: 0, edit: otherTag });
  ok('...one beside Deck: the desktop\'s own words, "(1 in Deck, 1 in another takeoff)"', hidden(h).startsWith('It also '
    + 'holds 2 items of other takeoffs (1 in Deck, 1 in another takeoff), hidden here — they go with it.'), JSON.stringify(h.asked));
  // ...and TWO of them beside Deck (the desktop never words this: its heal
  // registers both): one part for the takeoffs the job has no record of,
  // never two parts both called "another takeoff" for two takeoffs.
  const twoTags = o => {
    const z = o.measurements[0];
    z.find(m => m.name === 'Window 2')[TAG] = 'tl-nore0001';
    z.find(m => m.name === 'Outlets')[TAG] = 'tl-nore0002';
  };
  const i2 = await run({ sheet: 0, edit: twoTags });
  ok('...two beside Deck: "(1 in Deck, 2 in 2 takeoffs this job has no record of)"', hidden(i2).startsWith('It also '
    + 'holds 3 items of other takeoffs (1 in Deck, 2 in 2 takeoffs this job has no record of), hidden here — they go '
    + 'with it.') && !/another takeoff/.test(hidden(i2)), JSON.stringify(i2.asked));
}

// A job with only Main: the list, its notes, its title and its foot, page by
// page, chip on and off, as v31's own ItemsPanel builds them.
let v31 = null;
let v31Dir = null;
try {
  v31Dir = await mkdtemp(path.join(os.tmpdir(), 'ptt-v31-view-'));
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
    + 'list with v31\'s; it needs the commit (git fetch --unshallow)', false, String(err.message || err).split('\n')[0]);
}
if (v31) {
  const p = await fresh({ edit: mainOnly });
  const pOld = await fresh({ mods: v31, edit: mainOnly });
  const { c } = ctlRig(p, 0);
  const uidPos = q => new Map([...q.allItems()].map(([pg, m]) => [m._uid, `${pg}:${q.measurements[pg].indexOf(m)}`]));
  const posNew = uidPos(p), posOld = uidPos(pOld);
  const view = (rig, pos) => ({ rows: rig.rows().map(m => pos.get(m._uid)), notes: rig.notes(), title: rig.title(),
    foot: rig.foot(), combos: rig.combos() });
  let same = 0;
  for (const v of [null, own(0), own(1), own(2), { page: 1, revId: 'r2', revPage: 0, coming: false }]) {
    for (const cost of ['all', 'material', 'labor']) {
      const a = panelRig(p, c, { view: v, chip: !!v });
      a.panel.costFilter = cost; a.panel.refresh();
      const got = view(a, posNew); a.restore();
      const b = panelRig(pOld, null, { view: v, chip: !!v, mods: v31 });
      b.panel.costFilter = cost; b.panel.refresh();
      const want = view(b, posOld); b.restore();
      if (eq(`Main-only, ${v ? `X${v.page + 1}.0 ${v.revId || 'own'}` : 'the full list'}, ${cost}: as v31 lists it`, got, want)) same += 1;
    }
  }
  const model = new M.CountingModel({ metadata: p.metadata, measurements: p.measurements, pageCount: p.pageCount });
  const modelOld = new v31.CountingModel({ metadata: pOld.metadata, measurements: pOld.measurements, pageCount: pOld.pageCount });
  const walk = q => [...q.allItems()].filter(([, m]) => !m.group_child
    && !['distance', 'textnote', 'page_ref', 'pitch', 'ref_distance', 'group'].includes(m.type));
  for (let page = 0; page < p.pageCount; page += 1) {
    const sNew = M.sheetRows(model, walk(p), own(page), panelTest(c));
    const sOld = v31.sheetRows(modelOld, walk(pOld), own(page));
    eq(`Main-only X${page + 1}.0: sheetRows' hidden and filtered, and the words, are v31's`,
      [sNew.hidden, sNew.filtered, M.hiddenWords(sNew.hidden), M.sheetNotes(sNew, 'X')],
      [sOld.hidden, sOld.filtered, v31.hiddenWords(sOld.hidden), v31.sheetNotes(sOld, 'X')]);
  }
  eq('Main-only: soloCount is v31\'s', M.soloCount(p.measurements, panelTest(c)), v31.soloCount(pOld.measurements));
  log(`   (${same} of 15 Main-only builds equal v31's)`);
}
// ═══ T13: the words, each through its producer ══════════════════════════
//
// What a job of several takeoffs is SAID in: the Items list's top line, its
// empty state, its foot and its title (tooltip and tap) through the real
// ItemsPanel; main.js's syncTitle, setSheetScale's question and the
// sentence on open (sayLeftOutAtOpen), each lifted by text and run; the
// tile tip through the real CountingModel; the version bar's Count tooltip
// through the real VersionBar with main.js's own state line. House (Main's
// name on the desktop) wherever Main would be; a tag the job has no record
// of in its own words; and with no tag and no registry every string is
// v31's, v31's own modules and main.js read out of this repository's
// history. (showSheetVersion's sentence is zoom-floor.mjs's 8b, the Delete
// sheet words U9's above, the sentence on open in a browser
// takeoff-lists-browser.mjs's.)
log('\n-- T13: the words a job of several takeoffs is said in --');
{
  const fnText = (src, name) => {
    const at = [`\nasync function ${name}(`, `\nfunction ${name}(`].map(h => src.indexOf(h)).find(i => i >= 0);
    return at === undefined ? null : src.slice(at + 1, src.indexOf('\n}\n', at) + 2);
  };
  // eslint-disable-next-line no-new-func
  const liftFn = (src, name, env) => new Function('env', `with (env) { return (${fnText(src, name)}); }`)(env);
  ok('main.js has syncTitle, setSheetScale and sayLeftOutAtOpen',
    ['syncTitle', 'setSheetScale', 'sayLeftOutAtOpen'].every(n => !!fnText(MAIN, n)));
  const V31_MAIN = v31Dir && v31 ? await readFile(path.join(v31Dir, 'js/main.js'), 'utf-8') : null;
  const CT = await import(pathToFileURL(path.join(ROOT, 'js/core/counting.js')).href);
  const VB = await import(pathToFileURL(path.join(ROOT, 'js/ui/version-bar.js')).href);
  const VB31 = v31 ? await import(pathToFileURL(path.join(v31Dir, 'js/ui/version-bar.js')).href) : null;
  const withNaming = async (p, fn) => {
    CT.setTakeoffNaming(() => TL.takeoffNamingOf(p.metadata, p.measurements, TL.WEB_TAKEOFF));
    try { return await fn(); } finally { CT.setTakeoffNaming(null); }
  };
  const isTakeoffItem = m => !['distance', 'textnote', 'page_ref', 'pitch', 'ref_distance', 'group'].includes(m.type);
  const deckItems = p => [...p.allItems()].filter(([, m]) => isDeck(m) && !m.group_child && isTakeoffItem(m)).length;
  /** House's takeoff items taken out: what is left is Deck's and the shared marks. */
  const noHouse = o => {
    for (const k of Object.keys(o.measurements)) {
      o.measurements[k] = o.measurements[k].filter(m => isDeck(m) || !isTakeoffItem(m) || m.type === 'group');
    }
  };
  /** Deck's items taken out, and the keys: House's items alone, a job with only Main. */
  const noDeck = o => {
    for (const k of Object.keys(o.measurements)) o.measurements[k] = o.measurements[k].filter(m => !isDeck(m));
    for (const k of KEYS) delete o.metadata[k];
  };
  const kids = rig => rig.panel.listEl.children.map(e => [e.className, e.textContent]);
  const p0 = await fresh();
  eq('the fixture: Deck has 6 items (by the test\'s own reading of the tag)', deckItems(p0), 6);
  const NOTE = 'Takeoff: House. This job also has Deck (6 items), worked on in the desktop app — not shown or totalled here.';

  // ── the list's top line (U1) ──
  {
    const { c } = ctlRig(p0, 0);
    const full = panelRig(p0, c);
    eq('the full list: its first line says which takeoff it is of, and that Deck is the desktop app\'s',
      kids(full)[0], ['takeoff-note', NOTE]);
    eq('...one such line, and no .sheet-note of the SHEET chip\'s', [kids(full).filter(([k]) => k === 'takeoff-note').length,
      full.notes().length], [1, 0]);
    full.restore();
    const on0 = panelRig(p0, c, { view: own(0), chip: true });
    eq('one sheet (X1.0): the same line first, above the sheet\'s rows', kids(on0)[0], ['takeoff-note', NOTE]);
    on0.restore();
    const on2 = panelRig(p0, c, { view: own(2), chip: true });
    eq('X3.0, nothing of House\'s on it: the takeoff line, then the chip\'s line on top',
      kids(on2).slice(0, 2).map(([k, t]) => [k, t]),
      [['takeoff-note', NOTE], ['sheet-note empty', 'Nothing on X3.0 (this drawing) — 7 on other sheets, 2 in other takeoffs']]);
    on2.restore();
    const opening = panelRig(p0, c, { view: { page: 1, revId: '', revPage: null, coming: true }, chip: true });
    eq('"Opening X2.0…": the takeoff line above it', kids(opening),
      [['takeoff-note', NOTE], ['sheet-note empty opening', 'Opening X2.0…']]);
    opening.restore();
  }

  // ── the empty state (U2) ──
  {
    const p = await fresh({ edit: noHouse });
    const { c } = ctlRig(p, 0);
    const rig = panelRig(p, c);
    eq('House with nothing in it: the empty state says which takeoff, and where the rest is', kids(rig),
      [['empty-list takeoffs', 'Nothing in House yet.\n\nWhat you draw now is filed in House. This job also has '
        + 'Deck (6 items), worked on in the desktop app — not shown or totalled here.']]);
    rig.panel.costFilter = 'labor';
    rig.panel.refresh();
    eq('...a cost filter on: the filter\'s words come first, as on the desktop', kids(rig).map(([k]) => k), ['empty-list']);
    rig.restore();
    const pm = await fresh({ edit: o => { noHouse(o); noDeck(o); } });
    const rigM = panelRig(pm, ctlRig(pm, 0).c);
    eq('Main alone, nothing in it: v31\'s "No items yet."', kids(rigM).map(([k, t]) => [k, t.split('\n')[0]]),
      [['empty-list', 'No items yet.']]);
    rigM.restore();
  }

  // ── the foot (U3): its lead and its tooltip ──
  {
    const { c } = ctlRig(p0, 0);
    const pm = await fresh({ edit: noDeck });
    const { c: cm } = ctlRig(pm, 0);
    const pair = (view, chip, cost) => {
      const a = panelRig(p0, c, { view, chip });
      a.panel.costFilter = cost; a.panel.refresh();
      const b = panelRig(pm, cm, { view, chip });
      b.panel.costFilter = cost; b.panel.refresh();
      const out = [[a.foot(), a.panel.footEl.title], [b.foot(), b.panel.footEl.title]];
      a.restore(); b.restore();
      return out;
    };
    const NOT_COUNTED = '1 item is taken off on a drawing its sheet does not count from — marked NOT COUNTED above, and in no total.';
    const TIP = 'Totals of the takeoff House only — Deck (6 items) is not in them; the desktop app works on it.';
    const [[f1, t1], [g1, u1]] = pair(null, false, 'all');
    ok('the full list: "House only: " leads the same totals House\'s items alone add up to',
      f1 === `House only: ${g1}` && !!g1, JSON.stringify([f1, g1]));
    eq('...its tooltip: whose totals they are, then the NOT COUNTED words (Siding, on Rev B)', [t1, u1],
      [`${TIP}\n${NOT_COUNTED}`, NOT_COUNTED]);
    const [[f2], [g2]] = pair(own(0), true, 'all');
    ok('one sheet: "House only, all sheets: " where a job with Main alone says "Whole job: "',
      g2.startsWith('Whole job: ') && f2 === `House only, all sheets: ${g2.slice('Whole job: '.length)}`, JSON.stringify([f2, g2]));
    const [[f3], [g3]] = pair(own(0), true, 'material');
    ok('...filtered: "House only, all sheets, filtered: " for "Whole job, filtered: "',
      g3.startsWith('Whole job, filtered: ')
      && f3 === `House only, all sheets, filtered: ${g3.slice('Whole job, filtered: '.length)}`, JSON.stringify([f3, g3]));
    const [[f4], [g4]] = pair(null, false, 'material');
    ok('the full list filtered: still "House only: " (v31 has no lead there)', f4 === `House only: ${g4}`, JSON.stringify([f4, g4]));
    // A filter that lists nothing (LAB: no labor here). In a job of several
    // takeoffs: no totals, and no tooltip over the totals that are not there.
    {
      const a = panelRig(p0, c);
      const before = a.panel.footEl.title;
      a.panel.costFilter = 'labor'; a.panel.refresh();
      eq('a job of several takeoffs: LAB lists nothing -- the foot says nothing, and the tooltip it had goes with it',
        [!!before, a.rows().length, a.foot(), a.panel.footEl.title], [true, 0, '', '']);
      a.restore();
    }
    // In a job with Main alone the foot is v31's to the letter (Main-only =
    // v31), its tooltip included: v31's own panel leaves the NOT COUNTED
    // words standing over an emptied foot, and so does this one.
    if (v31) {
      const seq = (q, cq, mods) => {
        const a = panelRig(q, cq, { mods });
        const out = [];
        for (const cost of ['all', 'labor', 'all', 'material', 'labor']) {
          a.panel.costFilter = cost; a.panel.refresh();
          out.push([cost, a.rows().length, a.foot(), a.panel.footEl.title]);
        }
        a.restore();
        return out;
      };
      const got = seq(pm, cm, M);
      eq('a job with Main alone: the foot and its tooltip through ALL, LAB (nothing listed), ALL, MAT, LAB are v31\'s own',
        got, seq(await fresh({ mods: v31, edit: noDeck }), null, v31));
      ok('...LAB lists nothing there, and the tooltip v31 left over the empty foot is the NOT COUNTED words',
        got[1][1] === 0 && got[1][2] === '' && got[1][3] === NOT_COUNTED, JSON.stringify(got[1]));
    }
    // A job of several takeoffs, then a job with Main alone and nothing in
    // it opened into the same Project and the same panel (the app has one
    // of each): the tooltip the first job's foot had ("Totals of the takeoff
    // House only …") does not stay standing over the next job's empty foot.
    {
      const q = await fresh();
      const a = panelRig(q, ctlRig(q, 0).c);
      const before = a.panel.footEl.title;
      const o = await M.openProject(new Blob([BYTES]));
      noDeck(o);
      for (const k of Object.keys(o.measurements)) o.measurements[k] = [];
      q.loadFrom({ metadata: o.metadata, annotations: o.annotations, measurements: o.measurements,
        pageCount: o.pageCount, revisionCounts: o.revisions.map(s => s.length) });
      a.panel.refresh();
      eq('a job of several takeoffs, then an empty one with Main alone in the same panel: no takeoff tooltip is left over it',
        [before.startsWith('Totals of the takeoff House only'), a.panel.listEl.children.filter(e => e.classList.contains('row')).length,
          a.foot(), a.panel.footEl.title], [true, 0, '', '']);
      a.restore();
    }
    // two other takeoffs
    const p2 = await fresh({ edit: o => {
      o.metadata.takeoff_lists = [...o.metadata.takeoff_lists, { list_id: 'tl-patio001', label: 'Patio' }];
      for (const m of Object.values(o.measurements).flat()) if (m.name === 'Screws') m[TAG] = 'tl-patio001';
    } });
    const r2 = panelRig(p2, ctlRig(p2, 0).c);
    eq('Deck and Patio: "are not in them; ... works on them"', r2.panel.footEl.title.split('\n')[0],
      'Totals of the takeoff House only — Deck (5 items) and Patio (1 item) are not in them; the desktop app works on them.');
    eq('...and the top line names both', kids(r2)[0][1],
      'Takeoff: House. This job also has Deck (5 items) and Patio (1 item), worked on in the desktop app — not shown or totalled here.');
    r2.restore();
  }

  // ── the title: its tooltip and a finger's tap on it (U4) ──
  {
    const { c } = ctlRig(p0, 0);
    const tap = rig => {
      const said = [];
      rig.panel.host.say = t => said.push(t);
      for (const l of rig.panel.titleEl._l.filter(x => x.t === 'click')) l.fn({});
      return said;
    };
    const full = panelRig(p0, c);
    eq('the full list: the title is v31\'s, its tooltip says the takeoff', full.title(), ['PROJECT ITEMS', 'Takeoff: House']);
    eq('...and a tap on it says so (v31 said nothing there)', tap(full), ['Takeoff: House']);
    full.restore();
    const on0 = panelRig(p0, c, { view: own(0), chip: true });
    const SHEET = 'Only the items drawn on X1.0 — the SHEET chip shows them all again';
    eq('one sheet: "Takeoff: House — " before the sheet\'s words', on0.title(), ['ITEMS ON X1.0', `Takeoff: House — ${SHEET}`]);
    eq('...the tap says the same', tap(on0), [`Takeoff: House — ${SHEET}`]);
    on0.restore();
  }

  // ── Main's own name, and a tag with no record ──
  {
    const pMain = await fresh({ edit: o => { delete o.metadata.takeoff_main_label; } });
    const rig = panelRig(pMain, ctlRig(pMain, 0).c);
    eq('Main not renamed: "Main" where "House" was', [kids(rig)[0][1], rig.title()[1]],
      ['Takeoff: Main. This job also has Deck (6 items), worked on in the desktop app — not shown or totalled here.',
        'Takeoff: Main']);
    rig.restore();
    const pNo = await fresh({ edit: o => { delete o.metadata.takeoff_lists; } });
    const rigNo = panelRig(pNo, ctlRig(pNo, 0).c);
    eq('a tag the job has no record of: its own words, never Main', kids(rigNo)[0][1],
      'Takeoff: House. This job also has a takeoff this job has no record of (6 items), worked on in the desktop app — '
      + 'not shown or totalled here.');
    ok('...its items are still not listed', !rigNo.rows().some(isDeck));
    rigNo.restore();
    // Names a file can hold that are not text: py-json reads a bare NaN or
    // true. The desktop's clean_takeoff_name reads str(name or ""): Main
    // named NaN is "nan", Deck named true is "True" (takeoff-lists-truth.json
    // "special_names") -- never "Main" or "true".
    const pOdd = await fresh({ edit: o => {
      o.metadata.takeoff_main_label = NaN;
      o.metadata.takeoff_lists = o.metadata.takeoff_lists.map(r => ({ ...r, label: true }));
    } });
    const rigOdd = panelRig(pOdd, ctlRig(pOdd, 0).c);
    eq('Main named NaN and Deck named true in the file: "nan" and "True", as the desktop spells them',
      [kids(rigOdd)[0][1], rigOdd.title()[1]],
      ['Takeoff: nan. This job also has True (6 items), worked on in the desktop app — not shown or totalled here.',
        'Takeoff: nan']);
    rigOdd.restore();
  }

  // ── main.js: syncTitle (U6) ──
  const titleRun = (src, p, c) => {
    const els = { projTitle: { textContent: '' }, dirtyDot: { hidden: true } };
    const doc = { title: '' };
    const fn = liftFn(src, 'syncTitle', { app: { project: p, fileName: 'f.takeoff' }, $: id => els[id], document: doc,
      hasOtherTakeoffs: TL.hasOtherTakeoffs, controller: c });
    fn();
    const clean = [els.projTitle.textContent, doc.title];
    p.markDirty();
    fn();
    return [clean, [els.projTitle.textContent, doc.title, els.dirtyDot.hidden]];
  };
  {
    const p = await fresh();
    eq('syncTitle: the takeoff after the job\'s name, in the bar and the tab, clean and unsaved', titleRun(MAIN, p, ctlRig(p, 0).c),
      [['Two Takeoffs — House', 'Two Takeoffs — House — Professional Takeoff Tools'],
        ['Two Takeoffs — House', '• Two Takeoffs — House — Professional Takeoff Tools', false]]);
  }

  // ── main.js: setSheetScale's question (U10) ──
  const scaleAsk = async (src, p, c, page) => {
    const bodies = [];
    const D = {
      showDialog: async build => { const d = build(() => {}); bodies.push(d.body.textContent); return null; },
      el: () => ({ style: {}, textContent: '' }), dlg: o => o, button: () => ({}),
    };
    const fn = liftFn(src, 'setSheetScale', { app: { project: p, currentPage: page }, D,
      KEEPS_OWN_SCALE: M.KEEPS_OWN_SCALE, controller: c, syncScaleSelect() {}, setStatus() {} });
    await fn(25);
    return bodies;
  };
  {
    const p = await fresh();
    const c = ctlRig(p, 0).c;
    const mine = pg => (p.measurements[pg] || []).filter(m => m.type !== 'pitch' && m.type !== 'ref_distance'
      && (m.points || []).length);
    eq('the fixture: X1.0 holds 10 measurements, 3 of them Deck\'s; X2.0 6, 2; X3.0 2, 2',
      [0, 1, 2].map(pg => [mine(pg).length, mine(pg).filter(isDeck).length]), [[10, 3], [6, 2], [2, 2]]);
    const cc0 = [p.changeCount, p.dirty];
    const ask = await scaleAsk(MAIN, p, c, 0);
    eq('the scale question on X1.0 says how much of the sheet\'s work is in other takeoffs (the re-value reaches it too)',
      (ask[0] || '').split('\n')[0],
      'This sheet already carries 10 measurements (3 of them are in other takeoffs, not shown here), each recorded at '
      + 'the scale it was drawn at.');
    const p1 = await fresh({ edit: o => { o.measurements[2] = o.measurements[2].filter(m => m.name !== 'Ledger'); } });
    eq('...one of one: "1 of them is"', ((await scaleAsk(MAIN, p1, ctlRig(p1, 2).c, 2))[0] || '').split('\n')[0],
      'This sheet already carries 1 measurement (1 of them is in other takeoffs, not shown here), each recorded at '
      + 'the scale it was drawn at.');
    eq('...and nothing was changed by asking (Cancel)', [p.changeCount, p.dirty], cc0);
  }

  // ── main.js: the sentence on open (U7) ──
  const openSaid = (src, p, statusShown, Model = M.CountingModel, noHover = false) => {
    const st = { priced: [], finger: [], timers: [], held: [], toast: [] };
    const fn = liftFn(src, 'sayLeftOutAtOpen', {
      holdOnOneLine: t => st.held.push(t),
      cannotHover: () => noHover, showFingerToast: t => st.toast.push(t),
      countingModel: () => new Model({ metadata: p.metadata, measurements: p.measurements, pageCount: p.pageCount }),
      sayPrice: t => st.priced.push(typeof t === 'function' ? t() : t), app: { project: p },
      takeoffsOpenWords: TL.takeoffsOpenWords, statusLineShown: () => statusShown,
      setTimeout: f => { st.timers.push(f); return st.timers.length; }, sayToFinger: t => st.finger.push(t),
    });
    fn();
    for (const f of st.timers.splice(0)) f();
    return st;
  };
  const OPEN = 'This job also has Deck (6 items), worked on in the desktop app. Here you see, total and report House '
    + 'only; what you add goes in House.';
  const LEFT = ' It was left in Deck on the desktop, which will open it there again.';
  {
    const p = await fresh();
    const cc0 = [p.changeCount, p.dirty];
    const a = openSaid(MAIN, p, true);
    eq('on open: the sentence, said last, through sayPrice -- and the desktop left the job in Deck', a.priced.at(-1), OPEN + LEFT);
    eq('...no toast where the status line is drawn -- the line holds it on its one line instead (holdOnOneLine)',
      [a.finger, a.held, a.toast], [[], [OPEN + LEFT], []]);
    const b = openSaid(MAIN, p, false, M.CountingModel, true);
    eq('...a phone (no status line): the same sentence as a toast too', [b.priced.at(-1), b.finger, b.held, b.toast],
      [OPEN + LEFT, [OPEN + LEFT], [], []]);
    // An iPad in landscape: the status line is drawn and holds the sentence
    // on its one line, but its tooltip -- the rest of it -- is out of a
    // finger's reach: the whole sentence is the finger's toast as well, and
    // the line keeps "Opened … — <sentence>" (no sayToFinger over it).
    const t = openSaid(MAIN, p, true, M.CountingModel, true);
    eq('...a tablet (status line drawn, nothing that can hover): held on its one line AND the whole of it a toast',
      [t.priced.at(-1), t.held, t.toast, t.finger], [OPEN + LEFT, [OPEN + LEFT], [OPEN + LEFT], []]);
    eq('...and nothing written', [p.changeCount, p.dirty], cc0);
    const pNo = await fresh({ edit: o => { delete o.metadata.takeoff_lists; } });
    eq('a tag with no record: its own words, and no "left in" (the desktop opens a job left in no takeoff it knows in Main)',
      openSaid(MAIN, pNo, true).priced.at(-1), 'This job also has a takeoff this job has no record of (6 items), worked '
      + 'on in the desktop app. Here you see, total and report House only; what you add goes in House.');
    const pIn = await fresh({ edit: o => { delete o.metadata.takeoff_list_active; } });
    eq('a job the desktop left in House: no "left in"', openSaid(MAIN, pIn, true).priced.at(-1), OPEN);
  }

  // ── the tile tip (U11) and the Count tooltip (U12) ──
  const tips = p => withNaming(p, () => Object.fromEntries(Object.entries(new M.CountingModel({ metadata: p.metadata,
    measurements: p.measurements, pageCount: p.pageCount }).sheetTileStates()).map(([k, s]) => [k, s.tip])));
  const MANY = (() => {
    const a = MAIN.indexOf('new VersionBar({');
    const hit = a < 0 ? null : /\n {4}manyTakeoffs: ([^\n]+),\n/.exec(MAIN.slice(a, MAIN.indexOf('\n});', a)));
    return hit ? hit[1] : null;
  })();
  ok('main.js hands the version bar whether the job has other takeoffs', !!MANY, String(MANY));
  const countTitles = (Bar, p) => {
    const els = { '#vbSheet': { textContent: '' }, '#vbShowing': { textContent: '', classList: { add() {}, remove() {} } },
      '#vbNewestBtn': { disabled: false }, '#vbCountBtn': { hidden: false, disabled: false, title: '', classList: { toggle() {} } } };
    const ctx = new Proxy({}, { get: () => () => {} });
    const pips = { addEventListener() {}, getContext: () => ctx, style: {}, width: 1, height: 1, title: '' };
    const hadCs = globalThis.getComputedStyle;
    globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
    const out = [];
    // eslint-disable-next-line no-new-func
    const many = MANY ? new Function('app', 'hasOtherTakeoffs', `return (${MANY});`)({ project: p }, TL.hasOtherTakeoffs) : false;
    for (const [viewing, working, canCount] of [['r2', '', true], ['r2', '', false], ['', '', true]]) {
      const bar = new Bar({ root: { hidden: false, querySelector: s => els[s] }, pips, onPick() {},
        state: () => ({ revs: p.metadata.revisions, page: 1, sheetLabel: 'X2.0', viewingRevId: viewing,
          workingRevId: working, order: 'date', origins: p.metadata.sheet_origin || {}, canCount, manyTakeoffs: many }) });
      bar.refresh();
      out.push(els['#vbCountBtn'].title);
    }
    globalThis.getComputedStyle = hadCs;
    return out;
  };
  {
    const p = await fresh();
    const t = await tips(p);
    ok('the tile tip of X2.0 (takeoff on Rev B, not counted) says the counts are every takeoff\'s',
      (t['1'] || '').endsWith('\nThese counts are every takeoff\'s: which drawing a sheet counts from is one choice for the whole job.'),
      t['1']);
    const titles = countTitles(VB.VersionBar, p);
    ok('the Count button\'s tooltip, Count live, View Only and counted already: the desktop bar\'s line last',
      titles.length === 3 && titles.every(x => x.endsWith('\nWhich drawing a sheet counts from is one choice for every takeoff.')
        && x.split('\n').length === 2), JSON.stringify(titles));
  }

  // ── with no tag and no registry: every string is v31's ──
  if (!v31 || !V31_MAIN) {
    ok('the Main-only words are compared with v31\'s own (git history)', false, 'v31 could not be read (see above)');
  } else {
    const pm = await fresh({ edit: mainOnly });
    const pOld = await fresh({ mods: v31, edit: mainOnly });
    const c = ctlRig(pm, 0).c;
    const cOld = new v31.ToolController({ canvas: { addEventListener() {}, style: {} }, viewport: { zoom: 1 },
      project: pOld, currentPage: () => 0, host: {} });
    for (const v of [null, own(0), own(2), { page: 1, revId: '', revPage: null, coming: true }]) {
      const a = panelRig(pm, c, { view: v, chip: !!v });
      const b = panelRig(pOld, null, { view: v, chip: !!v, mods: v31 });
      const said = rig => { const s = []; rig.panel.host.say = t => s.push(t);
        for (const l of rig.panel.titleEl._l.filter(x => x.t === 'click')) l.fn({}); return s; };
      const look = rig => ({ kids: kids(rig).filter(([k]) => !k.split(' ').includes('row') && !k.startsWith('grp')),
        title: rig.title(), foot: [rig.foot(), rig.panel.footEl.title], tap: said(rig) });
      eq(`Main-only ${v ? `X${v.page + 1}.0${v.coming ? ' (opening)' : ''}` : 'full list'}: notes, empty state, title, `
        + 'tooltip, tap and foot are v31\'s', look(a), look(b));
      a.restore(); b.restore();
    }
    {
      const e = await fresh({ edit: o => { noHouse(o); noDeck(o); } });
      const eOld = await fresh({ mods: v31, edit: o => { noHouse(o); noDeck(o); } });
      const a = panelRig(e, ctlRig(e, 0).c);
      const b = panelRig(eOld, null, { mods: v31 });
      eq('Main-only, empty: v31\'s empty state', kids(a), kids(b));
      a.restore(); b.restore();
    }
    eq('Main-only: syncTitle\'s bar and tab are v31\'s', titleRun(MAIN, pm, c),
      titleRun(V31_MAIN, pOld, cOld).map(x => x));
    for (const pg of [0, 1, 2]) {
      const pa = await fresh({ edit: mainOnly });
      const pb = await fresh({ mods: v31, edit: mainOnly });
      eq(`Main-only X${pg + 1}.0: the scale question is v31's`, await scaleAsk(MAIN, pa, ctlRig(pa, pg).c, pg),
        await scaleAsk(V31_MAIN, pb, null, pg));
    }
    eq('Main-only: on open, what is said is v31\'s, and no toast', [openSaid(MAIN, pm, false).priced, openSaid(MAIN, pm, false).finger],
      [openSaid(V31_MAIN, pOld, false, v31.CountingModel).priced, []]);
    eq('Main-only: ...and the status line is never held on one line (its line is v31\'s)',
      [openSaid(MAIN, pm, true).held, openSaid(MAIN, pm, false).held], [[], []]);
    eq('Main-only: the tile tips are v31\'s', await tips(pm), Object.fromEntries(Object.entries(new v31.CountingModel({
      metadata: pOld.metadata, measurements: pOld.measurements, pageCount: pOld.pageCount }).sheetTileStates())
      .map(([k, s]) => [k, s.tip])));
    eq('Main-only: the Count button\'s tooltips are v31\'s', countTitles(VB.VersionBar, pm), countTitles(VB31.VersionBar, pOld));
  }
}

if (v31Dir) await rm(v31Dir, { recursive: true, force: true });

log(fails ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass -- what is painted is what is tapped, deleted, listed and badged: Main's, `
    + 'the job says so, and a job with only Main reads as v31');
process.exit(fails ? 1 : 0);
