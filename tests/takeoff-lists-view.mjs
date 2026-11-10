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
if (v31Dir) await rm(v31Dir, { recursive: true, force: true });

log(fails ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass -- what is painted is what is tapped, deleted, listed and badged: Main's, `
    + 'and a job with only Main reads as v31');
process.exit(fails ? 1 : 0);
