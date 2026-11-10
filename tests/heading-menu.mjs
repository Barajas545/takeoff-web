// THE ITEMS LIST'S MENUS BY FINGER, AND THE FORMS' NAME LISTS -- desktop 3.07
// on the web (Round 5: heading-menu, forms-job-names-first).
//
// iOS Safari fires no 'contextmenu' for a finger held on an element, so on an
// iPad the Items list's row menu (Zoom to item, Properties, Delete) had no
// way in. This round gives the list a finger's hold (js/ui/hold.js: the
// canvas's 500 ms and 11 px), a heading menu (Collapse all / Expand all), the
// desktop's 3.07 heading tooltips -- worked out from the SAME answer as the
// menu, so a tooltip never promises what the menu lacks -- and Floor and
// Trade boxes that list THIS job's names first.
//
//  1. THE DIFFERENTIAL, from the committed tests/data/rename-truth.json (the
//     desktop's own _header_act, _header_tip, _rows_under,
//     _show_header_menu, project_values and _fill_class_combo, lifted by
//     text and closure-checked in tests/rename-python-truth.py): headerAct,
//     headerTip (both canDrag values, every act), rowsUnder, the menu's
//     entries as ItemsPanel itself builds them, what Collapse all / Expand
//     all / the act's own entry do, projectValues, the name sort, and the
//     forms' lists -- for every heading kind (named floor, NO FLOOR LEVEL, a
//     Group's section, NOT ON A SHEET, category, Uncategorized,
//     sub-category, blank sub-category).
//  2. THE DESKTOP'S RULE (tests/test_items_sheet_only.py:1070-1100), on the
//     list ItemsPanel really renders: every heading's tooltip promises
//     exactly what its own menu offers -- with the rename switch off (this
//     round: nothing but Collapse all / Expand all, and no 'Right-click'
//     clause), with it on (Round 7 inherits the check), read-only (nothing
//     offered), and in the touch layout's words.
//  3. THE HOLD (hold.js), through stand-in pointer events and a clock: a
//     still finger opens at 500 ms and not before; more than 11 px, a lift,
//     pointercancel, a second finger and the element leaving the page call
//     it off; the lift's click is swallowed, that one only; a pen is a
//     finger, a mouse is not.
//  4. THROUGH THE PANEL: a hold on a heading opens its menu at the finger, a
//     tap still folds it, a hold on a row opens the item menu and selects
//     nothing (the desktop's right-click selects nothing either), a mouse
//     right-click still opens both, a drag that scrolls opens nothing, and
//     a finger's 'contextmenu' (Chrome) is the hold's -- one menu.
//  5. THE MENU (main.js showMenu and showItemMenu, lifted by text): drawn off
//     the finger so the lift cannot land on its first entry, on screen at
//     the edges and at phone width, at the pointer for a mouse, the item
//     menu's entries as before.
//  6. The one-time hint: once a session, touch layout only, only when the
//     list is on screen with something in it; never saved.
//  7. The forms: dialogs.js classChoices and every Floor/Trade box in
//     dialogs.js and assemblies.js, opened on stand-in elements.
//  8. The wiring, by text: main.js, the stylesheet, sw.js, modules-parse,
//     run-all.
//  9. Live: the desktop source as it is now, when it is here.
//
// The differences from the desktop are the web's on purpose, each checked:
// no 'Drag to reorder' (the web cannot reorder yet: canDrag false); no
// Rename… / Set … for these N items… while the host's
// canClassifyFromHeadings is off (on since Round 7 while editing; the menu
// and the tooltip both follow the one switch; tests/classification-rename.mjs
// holds what the entries then do); nothing to rename or set while the list
// is read-only; the touch
// layout says 'Tap' and 'Hold'; a datalist shows neither the desktop's
// leading blank nor its separator. And in a job of several takeoffs (3.08)
// the web moves and copies nothing between takeoffs this round: the
// desktop's 'Move / Copy these N items to takeoff' submenus and its
// 'Right-click to move or copy them to another takeoff' clause are N/A --
// declared, and checked to be exactly what the desktop adds to its
// one-takeoff heading (section 1b).
//
// Run: node tests/heading-menu.mjs
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DATA, DESKTOP_SRC, haveDesktopSource } from './config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;

const C = await import('../js/core/classify.js');
const H = await import('../js/ui/hold.js');
const { ItemsPanel, FLOOR_LEVEL_PRESETS, CATEGORY_PRESETS, HOLD_HINT } = await import('../js/ui/items-panel.js');
const D = await import('../js/ui/dialogs.js');
const { editLine } = await import('../js/ui/assemblies.js');
const { Project } = await import('../js/core/project.js');
const CTL = await import('../js/tools/controller.js');

let fails = 0;
let checks = 0;
const log = (...a) => console.log(...a);
function eq(label, got, want) {
  checks += 1;
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) return true;
  fails += 1;
  log(`FAIL ${label}\n  got  ${a}\n  want ${b}`);
  return false;
}
function ok(label, cond, detail = '') {
  checks += 1;
  if (cond) return true;
  fails += 1;
  log(`FAIL ${label}${detail ? `\n  ${detail}` : ''}`);
  return false;
}

const SNAP = JSON.parse(await readFile(new URL('rename-truth.json', DATA), 'utf-8'));

// ═══ stand-in elements ═══════════════════════════════════════════════════
// Enough of a document for the Items list, a menu and a form, delivering an
// event the way a browser does: capture from the document down, the target's
// own listeners (capture first), then bubbling back up; stopPropagation and
// stopImmediatePropagation honoured, defaultPrevented recorded.
class StubEl {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.parentNode = null;
    this.hidden = false;
    this.id = '';
    this.className = '';
    this.style = {};
    this.dataset = {};
    this.attrs = {};
    this.title = '';
    this.value = '';
    this._text = '';
    this._l = [];
    this.offsetWidth = 200;
    this.offsetHeight = 90;
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
  get isConnected() {
    for (let x = this; x; x = x.parentNode) if (x === this.ownerDocument) return true;
    return false;
  }
  get firstChild() { return this.children[0] || null; }
  appendChild(c) {
    if (c.tagName === '#FRAGMENT') { for (const k of [...c.children]) this.appendChild(k); return c; }
    c.remove(); c.parentNode = this; this.children.push(c); return c;
  }
  append(...cs) { for (const c of cs) this.appendChild(typeof c === 'string' ? this.ownerDocument.createTextNode(c) : c); }
  insertBefore(c, ref) {
    c.remove();
    const i = ref ? this.children.indexOf(ref) : -1;
    c.parentNode = this;
    if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
    return c;
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(x => x !== this);
    this.parentNode = null;
  }
  contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
  addEventListener(t, fn, o) { this._l.push({ t, fn, capture: o === true || !!(o && o.capture) }); }
  removeEventListener(t, fn, o) {
    const capture = o === true || !!(o && o.capture);
    this._l = this._l.filter(l => !(l.t === t && l.fn === fn && l.capture === capture));
  }
  listeners(t) { return this._l.filter(l => l.t === t); }
  descendants() { return this.children.flatMap(c => [c, ...c.descendants()]); }
  matches(sel) {
    return sel.split(',').some(one => {
      const m = /^([a-z]*)((?:\.[\w-]+)*)$/i.exec(one.trim());
      if (!m) return false;
      const [, tag, classes] = m;
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      return classes.split('.').filter(Boolean).every(c => this.classList.contains(c));
    });
  }
  querySelector(sel) { return this.descendants().find(e => e.matches(sel)) || null; }
  querySelectorAll(sel) { return this.descendants().filter(e => e.matches(sel)); }
  closest(sel) { for (let x = this; x && x.tagName; x = x.parentNode) if (x.matches && x.matches(sel)) return x; return null; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  scrollIntoView() {}
  focus() { this.ownerDocument.activeElement = this; }
  blur() {}
  select() {}
  getBoundingClientRect() { return { left: 0, top: 0, right: this.offsetWidth, bottom: this.offsetHeight, width: this.offsetWidth, height: this.offsetHeight }; }
}

function stubDocument() {
  const doc = new StubEl('#document', null);
  doc.ownerDocument = doc;
  doc.activeElement = null;
  doc.createElement = tag => new StubEl(tag, doc);
  doc.createElementNS = (ns, tag) => new StubEl(tag, doc);
  doc.createDocumentFragment = () => new StubEl('#fragment', doc);
  doc.createTextNode = text => { const t = new StubEl('#text', doc); t._text = String(text); return t; };
  doc.documentElement = doc.appendChild(doc.createElement('html'));
  doc.body = doc.documentElement.appendChild(doc.createElement('body'));
  doc.byId = id => doc.descendants().find(e => e.id === id) || null;
  doc.getElementById = doc.byId;
  doc.add = (tag, id) => { const e = doc.createElement(tag); e.id = id; return doc.body.appendChild(e); };
  const fire = (node, ev, capture) => {
    for (const l of [...node._l]) {
      if (ev._halt) return;
      if (l.t === ev.type && l.capture === capture) { ev.currentTarget = node; l.fn.call(node, ev); }
    }
    const h = !capture && node[`on${ev.type}`];
    if (typeof h === 'function' && !ev._halt) h.call(node, ev);
  };
  doc.dispatch = (target, type, extra = {}) => {
    const route = [];
    for (let x = target; x; x = x.parentNode) route.push(x);
    if (route[route.length - 1] !== doc) route.push(doc);
    const ev = {
      type, target, button: 0, pointerType: 'mouse', pointerId: 1, isPrimary: true,
      clientX: 0, clientY: 0, defaultPrevented: false, _stop: false, _halt: false, ...extra,
      stopPropagation() { this._stop = true; },
      stopImmediatePropagation() { this._stop = true; this._halt = true; },
      preventDefault() { this.defaultPrevented = true; },
    };
    for (let i = route.length - 1; i > 0 && !ev._stop; i--) fire(route[i], ev, true);
    if (!ev._stop) { fire(route[0], ev, true); if (!ev._halt) fire(route[0], ev, false); }
    for (let i = 1; i < route.length && !ev._stop; i++) fire(route[i], ev, false);
    return ev;
  };
  return doc;
}

// A clock of the test's own, put in as the global one while a block runs:
// the panel's holds read setTimeout when they arm, so they run on it too.
function fakeClock() {
  let now = 0;
  let seq = 0;
  const due = new Map();
  const clock = {
    setTimeout: (fn, ms = 0) => { seq += 1; due.set(seq, { at: now + Math.max(0, ms), fn }); return seq; },
    clearTimeout: id => { due.delete(id); },
    get now() { return now; },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const [id, t] of due) if (t.at <= end && (!next || t.at < next[1].at || (t.at === next[1].at && id < next[0]))) next = [id, t];
        if (!next) break;
        due.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = end;
    },
  };
  return clock;
}
function withClock(fn) {
  const clock = fakeClock();
  globalThis.setTimeout = clock.setTimeout;
  globalThis.clearTimeout = clock.clearTimeout;
  try { return fn(clock); } finally {
    globalThis.setTimeout = realSetTimeout;
    globalThis.clearTimeout = realClearTimeout;
  }
}

// ═══ the web's tree of the snapshot's rows ═══════════════════════════════
// As ItemsPanel.refresh builds it (Map floor -> cat -> sub -> [[pg, m]]); a
// Group's section and the items on no sheet take the `top` the desktop's
// _top_of gives them -- the web lists neither yet, so the panel never makes
// those keys, but the functions are held to the desktop's answer for them.
function webTree(rows) {
  const tree = new Map();
  for (const [pg, m] of rows) {
    const fl = m.top !== undefined ? m.top : String(m.floor_level || '').trim();
    const cat = String(m.category || '').trim();
    const sub = String(m.sub_category || '').trim();
    if (!tree.has(fl)) tree.set(fl, new Map());
    if (!tree.get(fl).has(cat)) tree.get(fl).set(cat, new Map());
    const subs = tree.get(fl).get(cat);
    if (!subs.has(sub)) subs.set(sub, []);
    subs.get(sub).push([pg, m]);
  }
  return tree;
}
const labels = entries => entries.map(e => (e === '-' ? '-' : e.label));
const toKey = k => k.join('\x00');
const dropDrag = tip => tip.split('  •  ').filter(p => p !== 'Drag to reorder').join('  •  ');
const touchWords = tip => tip.replace(/^Click to/, 'Tap to').replace(/Right-click to/g, 'Hold to');

// A panel on stand-in elements, with the host the app gives it.
function panelRig({ project = null, classify = false, readOnly = false, touch = false, shown = true } = {}) {
  const doc = stubDocument();
  const was = globalThis.document;
  globalThis.document = doc;
  const calls = [];
  const state = { classify, readOnly, touch, shown };
  const host = {
    pageLabel: i => `X${i + 1}.0`,
    readOnly: () => state.readOnly,
    canClassifyFromHeadings: () => state.classify,
    touchLayout: () => state.touch,
    listShown: () => state.shown,
    hint: (text, when) => { calls.push(['hint', text]); state.when = when; },
    // Each menu's handle, as main.js showMenu returns one: close() records.
    showMenu: (entries, at) => {
      calls.push(['menu', labels(entries), at, entries]);
      return { close: () => calls.push(['close', labels(entries)[0]]) };
    },
    showItemMenu: (m, at) => {
      calls.push(['itemMenu', m.name, at]);
      return { close: () => calls.push(['close', m.name]) };
    },
    selectItem: m => calls.push(['select', m.name]),
    openProperties: m => calls.push(['properties', m.name]),
    classifyFromHeading: (act, meta, rows) => calls.push(['classify', act, meta.type, rows.map(m => m.name)]),
  };
  const listEl = doc.add('div', 'itemList');
  const floorFilterEl = doc.add('select', 'floorFilter');
  const groupFilterEl = doc.add('select', 'groupFilter');
  const footEl = doc.add('div', 'itemsFoot');
  const panel = new ItemsPanel({
    root: doc.body, listEl, floorFilterEl, groupFilterEl, costToggleEl: null, footEl,
    project: project || new Project(), host,
  });
  return {
    doc, panel, calls, state, listEl,
    restore() { globalThis.document = was; },
    headings: () => listEl.children.filter(e => e.classList.contains('grp')),
    rows: () => listEl.children.filter(e => e.classList.contains('row')),
    labelOf: e => (e.children.find(c => c.classList.contains('grp-label'))?.textContent || ''),
  };
}

// A job: several floors (Level 1, Level 2, Level 10, none), categories
// (Uncategorized among them) and sub-categories, on three sheets and none.
function itemJob() {
  const p = new Project();
  const a = (name, fl, cat, sub, order, extra = {}) => ({
    type: 'area', name, label: name, value: 10, unit: 'SF', points: [[1, 1], [9, 1], [9, 9]],
    floor_level: fl, category: cat, sub_category: sub, sort_order: order, visible: true, ...extra });
  p.loadFrom({
    metadata: { page_labels: ['X1.0', 'X2.0', 'X3.0'] },
    annotations: {},
    measurements: {
      0: [a('Slab', 'Level 1', 'Concrete', '', 100), a('Wall A', 'Level 1', 'Walls', 'Exterior', 200),
        a('Wall B', 'Level 1', 'Walls', 'Interior', 300), a('Loose', 'Level 1', '', '', 400)],
      1: [a('Joists', 'Level 2', 'Framing', 'Floor', 500), a('Patio', '', 'Concrete', '', 600),
        a('Outlets', '', '', '', 700)],
      2: [a('Roof deck', 'Level 10', 'Roofing', 'Sheathing', 800)],
      [-1000]: [{ type: 'standalone', name: 'Nails', label: 'Nails', qty: 3, unit: 'each',
        floor_level: 'Level 2', category: 'Hardware', sort_order: 900 }],
    },
    pageCount: 3,
  });
  return p;
}

// ═══ 1. the differential ═════════════════════════════════════════════════
function checkWords(truth, where) {
  log(`\n-- 1. headings: act, tooltip, rows under (${where}) --`);
  eq(`${where}: HDR_FIELD`, C.HDR_FIELD, truth.HDR_FIELD);
  eq(`${where}: HDR_WHAT`, C.HDR_WHAT, truth.HDR_WHAT);
  eq(`${where}: the items on no sheet's key`, C.SOLO, truth.SOLO);
  const trees = { list: webTree(truth.rows.list), 'one blank': webTree(truth.rows['one blank']) };
  let n = 0;
  for (const h of truth.headers) {
    const meta = h.meta;
    const tag = `${where}: ${h.label} (${h.rows})`;
    eq(`${tag}: headerAct`, C.headerAct(meta), h.act);
    eq(`${tag}: headerTip`, C.headerTip(meta), h.tip);
    eq(`${tag}: headerTip, its own act given`, C.headerTip(meta, { act: h.act }), h.tip);
    for (const [k, f] of Object.entries(h.forced)) {
      const act = k === 'none' ? '' : k;
      eq(`${tag}: headerTip, act '${act}'`, C.headerTip(meta, { act }), f.tip);
      eq(`${tag}: headerTip, act '${act}', no drag`, C.headerTip(meta, { act, canDrag: false }), dropDrag(f.tip));
      eq(`${tag}: headerTip, act '${act}', a finger's words`,
        C.headerTip(meta, { act, canDrag: false, touch: true }), touchWords(dropDrag(f.tip)));
    }
    eq(`${tag}: rowsUnder`, C.rowsUnder(trees[h.rows], meta).map(m => m.name), h.under);
    n += 1;
  }
  ok(`${where}: every heading kind is in the truth`,
    ['a named floor', 'NO FLOOR LEVEL', "a Group's section", 'NOT ON A SHEET', 'a category',
      'Uncategorized', 'a sub-category', 'a blank sub-category'].every(k => truth.headers.some(h => h.label === k)));
  log(`   ${n} headings`);
}

/** The desktop's heading in a job of several takeoffs, its takeoff entries
 *  taken out (declared N/A on the web this round): the Move / Copy
 *  submenus and the separator the desktop puts after them. */
const TAKEOFF_CLAUSE = 'Right-click to move or copy them to another takeoff';
function dropTakeoffMenus(menu) {
  const out = [];
  for (let i = 0; i < menu.length; i += 1) {
    const x = menu[i];
    if (x && typeof x === 'object') {
      if (menu[i + 1] === '-') i += 1;      // the separator after the last submenu
      continue;
    }
    out.push(x);
  }
  return out;
}
const dropTakeoffClause = tip => tip.split('  •  ').filter(p => p !== TAKEOFF_CLAUSE).join('  •  ');

/** A job of two takeoffs as a 3.08 file holds it (the truth's rows). */
function takeoffJob(rows) {
  const p = new Project();
  p.loadFrom({ metadata: { page_labels: ['X1.0', 'X2.0', 'X3.0'], takeoff_main_label: rows[0][1],
    takeoff_lists: rows.slice(1).map(([id, label]) => ({ list_id: id, label })) },
  annotations: {}, measurements: {}, pageCount: 3 });
  return p;
}

function checkTakeoffHeadings(truth, where) {
  log(`\n-- 1b. a heading in a job of two takeoffs: the desktop's Move / Copy entries are N/A (${where}) --`);
  const tl = truth.headers.filter(h => h.takeoffs);
  ok(`${where}: the truth has every heading in a job of two takeoffs too`, tl.length === truth.headers.length
    && tl.some(h => h.takeoffs.menu.some(x => x && typeof x === 'object'))
    && tl.some(h => h.takeoffs.tip.includes(TAKEOFF_CLAUSE)));
  const r = panelRig({ project: takeoffJob(tl[0] ? tl[0].takeoffs.rows : [['', 'Main']]) });
  try {
    for (const h of tl) {
      const T = h.takeoffs;
      const tag = `${where}: ${h.label} (${h.rows}), two takeoffs`;
      eq(`${tag}: the desktop's act is the one-takeoff act`, T.act, h.act);
      // The N/A is exactly the takeoff entries: without them the desktop's
      // heading is its one-takeoff heading, entry for entry, word for word.
      eq(`${tag}: the desktop's menu, its Move / Copy submenus taken out, is its one-takeoff menu`,
        dropTakeoffMenus(T.menu), h.menu);
      eq(`${tag}: ...and its tooltip, the move-or-copy clause taken out, is its one-takeoff tooltip`,
        dropTakeoffClause(T.tip), h.tip);
      for (const [k, f] of Object.entries(T.forced)) {
        eq(`${tag}: act '${k}': the same, menu and tooltip`, [dropTakeoffMenus(f.menu), dropTakeoffClause(f.tip)],
          [h.forced[k].menu, h.forced[k].tip]);
      }
      ok(`${tag}: ...the clause stands only where the heading has no right-click of its own`,
        !T.tip.includes(TAKEOFF_CLAUSE) || !/Right-click to (rename|set a )/.test(T.tip), T.tip);
      // The web's own, on the job's list: no takeoff entry, no takeoff clause.
      r.panel._tree = webTree(truth.rows[h.rows]);
      r.state.classify = true; r.state.readOnly = false;
      eq(`${tag}: the web's menu: the desktop's without its takeoff entries`,
        labels(r.panel._headerEntries(h.meta)), dropTakeoffMenus(T.menu));
      eq(`${tag}: ...its tooltip: the desktop's without the clause (and no drag)`, r.panel._headerTitle(h.meta),
        dropDrag(dropTakeoffClause(T.tip)));
    }
  } finally { r.restore(); }
}

function checkMenus(truth, where) {
  log(`\n-- 1. the heading menu ItemsPanel builds == _show_header_menu (${where}) --`);
  const r = panelRig();
  try {
    for (const h of truth.headers) {
      const tag = `${where}: ${h.label} (${h.rows})`;
      r.panel._tree = webTree(truth.rows[h.rows]);
      r.state.classify = true; r.state.readOnly = false;
      eq(`${tag}: the menu, renaming on (Round 7)`, labels(r.panel._headerEntries(h.meta)), h.menu);
      eq(`${tag}: ...and its tooltip`, r.panel._headerTitle(h.meta), dropDrag(h.tip));
      r.state.classify = false;
      eq(`${tag}: the menu this round: Collapse all, Expand all`, labels(r.panel._headerEntries(h.meta)), h.forced.none.menu);
      eq(`${tag}: ...and its tooltip says a click and nothing more`, r.panel._headerTitle(h.meta), dropDrag(h.forced.none.tip));
      r.state.classify = true; r.state.readOnly = true;
      eq(`${tag}: read-only: nothing to rename or set`, labels(r.panel._headerEntries(h.meta)), h.forced.none.menu);
      eq(`${tag}: ...and the tooltip does not offer it`, r.panel._headerTitle(h.meta), dropDrag(h.forced.none.tip));
    }
  } finally { r.restore(); }
}

/** The snapshot's rows as a job holds them: a Project with each row on its
 *  sheet, and the rows again as [page, the job's own dict] in the
 *  snapshot's order -- a Set hands on the rows its menu named as the job
 *  holds them (classify.js rowsNow), so a tree of dicts the job does not
 *  hold would hand on none. */
function jobOfRows(rows) {
  const measurements = {};
  for (const [pg, m] of rows) (measurements[pg] = measurements[pg] || []).push(JSON.parse(JSON.stringify(m)));
  const p = new Project();
  p.loadFrom({ metadata: { page_labels: ['X1.0', 'X2.0', 'X3.0'] }, annotations: {}, measurements, pageCount: 3 });
  const at = {};
  const live = rows.map(([pg]) => { at[pg] = (at[pg] || 0) + 1; return [pg, p.measurements[pg][at[pg] - 1]]; });
  return { p, live };
}

function checkChoices(truth, where) {
  log(`\n-- 1. what the entries do == the desktop's (${where}) --`);
  const { p, live } = jobOfRows(truth.rows.list);
  ok(`${where}: the snapshot's rows load as the job's own, in order`,
    live.every(([pg, m], i) => m && m.name === truth.rows.list[i][1].name && Number(pg) === Number(truth.rows.list[i][0])));
  const r = panelRig({ project: p });
  try {
    let refreshes = 0;
    r.panel.refresh = () => { refreshes += 1; };
    for (const c of truth.choices) {
      const tag = `${where}: ${c.label}: ${c.entry}`;
      r.panel._tree = webTree(live);
      r.panel.collapsed = new Set(c.before.map(toKey));
      r.state.classify = true; r.state.readOnly = false;
      r.calls.length = 0;
      refreshes = 0;
      const entry = r.panel._headerEntries(c.meta).find(e => e !== '-' && e.label === c.entry);
      if (!ok(`${tag}: offered`, !!entry)) continue;
      entry.run();
      // (as the web spells a key: its parts joined by \x00 -- a Group's or the
      // no-sheet section's own key holds one too, which the web lists neither of)
      eq(`${tag}: the collapse set after`, [...r.panel.collapsed].sort(), c.after.map(toKey).sort());
      eq(`${tag}: the list rebuilt as the desktop's is`, refreshes, c.shots.length);
      const act = C.headerAct(c.meta);
      const want = c.pick !== 'main' ? []
        : act === 'rename' ? [['classify', 'rename', c.meta.type, C.rowsUnder(r.panel._tree, c.meta).map(m => m.name)]]
          : act === 'assign' ? [['classify', 'assign', c.meta.type, c.log[0][2]]]
            : [['classify', 'group', c.meta.type, C.rowsUnder(r.panel._tree, c.meta).map(m => m.name)]];
      eq(`${tag}: what it hands on`, r.calls.filter(x => x[0] === 'classify'), want);
      if (c.pick === 'main') {
        // the desktop hands rename the heading, assign its rows, a Group its form
        const kind = c.log[0][0];
        eq(`${tag}: the desktop's own hand-off is the same act`,
          { rename: 'rename', assign: 'assign', item_properties: 'group' }[kind], act);
        // Asked again when CHOSEN: a version flip closes the gate under an
        // open menu, and its write must not go through; nor once the switch
        // is off.
        for (const [why, set] of [['read-only by then', () => { r.state.readOnly = true; }],
          ['the switch off by then', () => { r.state.classify = false; }]]) {
          r.state.classify = true; r.state.readOnly = false;
          const again = r.panel._headerEntries(c.meta).find(e => e !== '-' && e.label === c.entry);
          set();
          r.calls.length = 0;
          again.run();
          eq(`${tag}: ${why}: nothing is handed on`, r.calls, []);
        }
      }
    }
  } finally { r.restore(); }
}

function checkValues(truth, where) {
  log(`\n-- 1. this job's names first == _fill_class_combo (${where}) --`);
  eq(`${where}: the stock floor levels are the desktop's`, FLOOR_LEVEL_PRESETS, truth.presets.floor_level);
  eq(`${where}: the stock trades are the desktop's`, CATEGORY_PRESETS, truth.presets.category);
  for (const v of truth.values) {
    const store = Object.fromEntries(v.store.map(([pg, items]) => [pg, items]));
    eq(`${where}: ${v.label}: the store is walked in the truth's order`,
      Object.keys(store).map(Number), v.store.map(([pg]) => pg));
    for (const [field, want] of Object.entries(v.values)) {
      eq(`${where}: ${v.label}: projectValues ${field}`, C.projectValues(store, field), want);
    }
    for (const [cat, want] of Object.entries(v.subsOf)) {
      eq(`${where}: ${v.label}: the sub-categories under '${cat}'`, C.projectValues(store, 'sub_category', cat), want);
    }
    for (const c of v.combos) {
      const presets = c.field === 'floor_level' ? FLOOR_LEVEL_PRESETS : CATEGORY_PRESETS;
      const hasJob = !['no job anywhere', 'the job cannot answer'].includes(c.owner);
      const want = c.items.filter(x => x !== '' && x !== '-');
      eq(`${where}: ${v.label}: ${c.field}, ${c.owner}`,
        C.classChoicesFrom(hasJob ? store : {}, c.field, presets), want);
      // ...and through dialogs.js, the forms' own door to it
      D.setClassSource(hasJob ? () => store : () => { throw new Error('no job'); });
      eq(`${where}: ${v.label}: ${c.field}, ${c.owner}: dialogs.js classChoices`, D.classChoices(c.field), want);
      // the desktop's separator stands between the job's names and the stock
      // ones exactly when both are there: the datalist keeps that order
      const sep = c.items.indexOf('-');
      if (sep > 0) eq(`${where}: ${v.label}: ${c.field}: own names, then stock`,
        C.projectValues(store, c.field), c.items.slice(1, sep));
    }
  }
  D.setClassSource(() => ({}));
  // The names in the order the desktop was given them (its `norm` list keeps
  // that order), sorted here: ties (look-alikes) keep their order, as there.
  eq(`${where}: Level 2 before Level 10 (the name sort, ties kept in order)`,
    truth.norm.map(([s]) => s).sort(C.cmpSortKey), truth.sorted);
  for (const [s, clean, norm] of truth.norm) {
    eq(`${where}: classClean ${JSON.stringify(s)}`, C.classClean(s), clean);
    eq(`${where}: classNorm ${JSON.stringify(s)}`, C.classNorm(s), norm);
  }
}

// A selection made on the drawing (desktop highlight_measurement, wired to
// the canvas's selection_changed, and its _apply_selection; the web's
// revealSelection, wired to the controller's 'selection-changed' where the
// desktop sends one -- section 2c): the keys it opens, whether the list is
// rebuilt, which row is lit and which one is scrolled to. A RUN of a
// multi-sheet item is not a row: selected on its sheet, it lights its item's
// row (they share a group_id), as the item's own main shape does.
function checkReveals(truth, where) {
  log(`\n-- 1. a selection on the drawing opens its row's sections and lights it == highlight_measurement + _apply_selection (${where}) --`);
  ok(`${where}: the truth has the scenarios`, (truth.reveals || []).length >= 60);
  ok(`${where}: ...a run of a multi-sheet item selected among them, its item's row lit`,
    (truth.reveals || []).some(s => s.pick != null && s.store[s.pick][1].group_child && s.lit.length === 1
      && s.lit[0] !== s.store[s.pick][1].name));
  const scrolled = [];
  const keepScroll = ItemsPanel.prototype._scrollToRow;
  ItemsPanel.prototype._scrollToRow = function _scrollToRow(row) { scrolled.push(row); return keepScroll.call(this, row); };
  try {
    for (const s of truth.reveals || []) {
      const p = new Project();
      // The store as the truth walked it: sheet by sheet, in order.
      const measurements = {};
      for (const [pg, m] of s.store) {
        (measurements[pg] ||= []).push({ label: m.name, value: 4, unit: 'SF', visible: true,
          points: [[1, 1], [9, 1], [9, 9]], sort_order: 100, ...m });
      }
      const pages = Math.max(1, ...s.store.map(([pg]) => pg + 1));
      p.loadFrom({ metadata: { page_labels: Array.from({ length: pages }, (_, i) => `X${i + 1}.0`) },
        annotations: {}, measurements, pageCount: pages });
      const r = panelRig({ project: p });
      try {
        r.panel.collapsed = new Set(s.before.map(toKey));
        r.panel.refresh();
        let refreshes = 0;
        const real = r.panel.refresh.bind(r.panel);
        r.panel.refresh = () => { refreshes += 1; real(); };
        scrolled.length = 0;
        let uid = null;
        if (s.pick != null) {
          const pg = s.store[s.pick][0];
          const k = s.store.slice(0, s.pick).filter(([g]) => g === pg).length;
          uid = p.measurements[pg][k]._uid;
        }
        r.panel.revealSelection(uid ? [uid] : []);
        const name = id => p.findItem(id)?.item.name;
        const tag = `${where}: ${s.folded}, ${s.pick != null ? s.store[s.pick][1].name : 'nothing'} selected`;
        eq(`${tag}: what is folded after`, [...r.panel.collapsed].sort(), s.after.map(toKey).sort());
        eq(`${tag}: the list rebuilt as the desktop's is`, refreshes, s.log.filter(x => x[0] === 'refresh').length);
        ok(`${tag}: ...and then the selection lit, and scrolled to (_apply_selection(scroll=True))`,
          JSON.stringify(s.log.at(-1)) === '["apply_selection",true]');
        eq(`${tag}: the rows lit`, r.rows().filter(e => e.classList.contains('on')).map(e => name(e.dataset.id)).sort(),
          [...s.lit].sort());
        // (The desktop keeps 40 px above and below the row; the web scrolls
        // the list just enough -- block 'nearest', section 2b.)
        const last = scrolled.filter(Boolean).at(-1);
        eq(`${tag}: the row scrolled to`, last ? name(last.dataset.id) : null, s.target ? s.target[0] : null);
        if (s.pick != null) eq(`${tag}: it is the selection`, [...r.panel.selected].map(name), [s.selected]);
      } finally { r.restore(); }
    }
  } finally { ItemsPanel.prototype._scrollToRow = keepScroll; }
}

checkWords(SNAP, 'snapshot');
checkMenus(SNAP, 'snapshot');
checkTakeoffHeadings(SNAP, 'snapshot');
checkChoices(SNAP, 'snapshot');
checkValues(SNAP, 'snapshot');
checkReveals(SNAP, 'snapshot');

// ═══ 2. the desktop's rule, on the list the panel renders ════════════════
log('\n-- 2. every heading\'s tooltip promises exactly what its own menu offers --');
const CLAUSE = [['Rename group', 'Right-click to rename the group'],
  ['Set floor level', 'Right-click to set a floor level'],
  ['Set category', 'Right-click to set a category'],
  ['Rename ', 'Right-click to rename']];
function checkHeadings(where, { classify, readOnly, touch }) {
  const r = panelRig({ project: itemJob(), classify, readOnly, touch });
  const seen = new Set();
  try {
    r.panel.refresh();
    const hs = r.headings();
    ok(`${where}: the list has headings`, hs.length >= 8, String(hs.length));
    for (const el of hs) {
      const tip = el.title;
      r.calls.length = 0;
      const ev = r.doc.dispatch(el, 'contextmenu', { pointerType: 'mouse', clientX: 40, clientY: 60 });
      const menus = r.calls.filter(c => c[0] === 'menu');
      if (!eq(`${where}: ${r.labelOf(el)}: a right-click opens one menu`, menus.length, 1)) continue;
      ok(`${where}: ${r.labelOf(el)}: ...and the browser's own is kept off`, ev.defaultPrevented);
      const offered = menus[0][1].filter(a => !['-', 'Collapse all', 'Expand all'].includes(a));
      eq(`${where}: ${r.labelOf(el)}: Collapse all and Expand all, last`, menus[0][1].slice(-2), ['Collapse all', 'Expand all']);
      const parts = tip.split('  •  ');
      eq(`${where}: ${r.labelOf(el)}: the tooltip starts with the click`, parts[0],
        touch ? 'Tap to collapse / expand' : 'Click to collapse / expand');
      const how = touch ? 'Hold' : 'Right-click';
      const said = parts.filter(p => p.startsWith(how));
      const want = offered.length
        ? CLAUSE.find(([pre]) => offered[0].startsWith(pre))[1].replace('Right-click', how) : null;
      eq(`${where}: ${r.labelOf(el)}: the tooltip promises what the menu offers`, said, want ? [want] : []);
      ok(`${where}: ${r.labelOf(el)}: no 'Drag to reorder' (the web cannot reorder yet)`, !parts.includes('Drag to reorder'));
      eq(`${where}: ${r.labelOf(el)}: nothing else in it`, parts.length, 1 + said.length);
      seen.add(`${el.className.split(' ')[1]}:${want || '-'}`);
    }
  } finally { r.restore(); }
  return seen;
}
const offSeen = checkHeadings('this round (switch off)', { classify: false, readOnly: false, touch: false });
eq('this round: every heading offers Collapse all / Expand all, and its tooltip nothing more',
  [...offSeen].sort(), ['cat:-', 'floor:-', 'sub:-']);
const onSeen = checkHeadings('Round 7 (switch on)', { classify: true, readOnly: false, touch: false });
eq('switch on: every kind of heading the web lists, with its own clause',
  [...onSeen].sort(), ['cat:Right-click to rename', 'cat:Right-click to set a category',
    'floor:Right-click to rename', 'floor:Right-click to set a floor level', 'sub:Right-click to rename']);
eq('read-only: nothing offered, nothing promised',
  [...checkHeadings('read-only (switch on)', { classify: true, readOnly: true, touch: false })].sort(),
  ['cat:-', 'floor:-', 'sub:-']);
eq('touch layout, switch on: the same sentence in a finger\'s words',
  [...checkHeadings('touch (switch on)', { classify: true, readOnly: false, touch: true })].sort(),
  ['cat:Hold to rename', 'cat:Hold to set a category', 'floor:Hold to rename',
    'floor:Hold to set a floor level', 'sub:Hold to rename']);
eq('touch layout, this round: a tap, and nothing more',
  [...checkHeadings('touch (switch off)', { classify: false, readOnly: false, touch: true })].sort(),
  ['cat:-', 'floor:-', 'sub:-']);
{
  // The headings the panel renders carry the desktop's meta, raw values.
  const r = panelRig({ project: itemJob() });
  try {
    const metas = [];
    const keep = r.panel._groupHeader.bind(r.panel);
    r.panel._groupHeader = (...a) => { metas.push(a[7]); return keep(...a); };
    r.panel.refresh();
    eq('each heading is built with what it IS: {type, fl, cat, sub}, raw', metas, [
      { type: 'floor', fl: 'Level 1', cat: null, sub: null },
      { type: 'cat', fl: 'Level 1', cat: 'Concrete', sub: null },
      { type: 'cat', fl: 'Level 1', cat: 'Walls', sub: null },
      { type: 'sub', fl: 'Level 1', cat: 'Walls', sub: 'Exterior' },
      { type: 'sub', fl: 'Level 1', cat: 'Walls', sub: 'Interior' },
      { type: 'cat', fl: 'Level 1', cat: '', sub: null },
      { type: 'floor', fl: 'Level 2', cat: null, sub: null },
      { type: 'cat', fl: 'Level 2', cat: 'Framing', sub: null },
      { type: 'sub', fl: 'Level 2', cat: 'Framing', sub: 'Floor' },
      { type: 'cat', fl: 'Level 2', cat: 'Hardware', sub: null },
      { type: 'floor', fl: '', cat: null, sub: null },
      { type: 'cat', fl: '', cat: 'Concrete', sub: null },
      { type: 'cat', fl: '', cat: '', sub: null },
      { type: 'floor', fl: 'Level 10', cat: null, sub: null },
      { type: 'cat', fl: 'Level 10', cat: 'Roofing', sub: null },
      { type: 'sub', fl: 'Level 10', cat: 'Roofing', sub: 'Sheathing' },
    ]);
    ok('...a named floor, NO FLOOR LEVEL, a category, Uncategorized and a sub-category among them',
      ['Level 1', ''].every(f => metas.some(m => m.type === 'floor' && m.fl === f))
      && metas.some(m => m.type === 'cat' && m.cat === '') && metas.some(m => m.type === 'cat' && m.cat)
      && metas.some(m => m.type === 'sub'));
    eq('the tree the list was built from is kept: its floors', [...r.panel._tree.keys()].sort(),
      ['', 'Level 1', 'Level 10', 'Level 2']);
  } finally { r.restore(); }
}

// ═══ 2b. Collapse all / Expand all, a tap, on the rendered list ══════════
log('\n-- 2. Collapse all, Expand all and a tap, on the list --');
{
  const r = panelRig({ project: itemJob() });
  try {
    r.panel.refresh();
    const rowsBefore = r.rows().length;
    const sub = r.headings().find(e => r.labelOf(e).includes('Exterior'));
    r.doc.dispatch(sub, 'contextmenu', { clientX: 10, clientY: 10 });
    r.calls.at(-1)[3].find(e => e.label === 'Collapse all').run();
    const hs = r.headings();
    eq('Collapse all: only the floors are left, each folded', hs.map(e => [e.className, r.labelOf(e).slice(0, 2)]),
      hs.map(() => ['grp floor', '▸ ']));
    eq('...every floor listed', hs.length, 4);
    eq('...and no row', r.rows().length, 0);
    r.doc.dispatch(hs[0], 'contextmenu', { clientX: 10, clientY: 10 });
    r.calls.at(-1)[3].find(e => e.label === 'Expand all').run();
    eq('Expand all: every row is back', r.rows().length, rowsBefore);
    ok('...and nothing is folded', r.panel.collapsed.size === 0 && r.headings().every(e => r.labelOf(e).startsWith('▾')));
    // a click folds one heading (the desktop's plain click)
    const floor = r.headings()[0];
    r.doc.dispatch(floor, 'click', { clientX: 10, clientY: 10 });
    ok('a click on a heading folds it', r.panel.collapsed.has('fl\x00Level 1'));
    ok('...collapse state is the panel\'s, nothing in the project', !JSON.stringify(r.panel.project.metadata).includes('collapsed'));
  } finally { r.restore(); }
}
{
  // After Collapse all, a shape tapped on the drawing is still found in the
  // list: its floor, category and sub-category open, the rest stay folded.
  const p = itemJob();
  const r = panelRig({ project: p });
  try {
    r.panel.refresh();
    r.doc.dispatch(r.headings()[0], 'contextmenu', { clientX: 10, clientY: 10 });
    r.calls.at(-1)[3].find(e => e.label === 'Collapse all').run();
    eq('Collapse all: no row listed', r.rows().length, 0);
    const wall = p.measurements[0].find(m => m.name === 'Wall A');
    r.panel.revealSelection([wall._uid]);          // main.js: on the controller's 'selection-changed'
    const row = r.rows().find(e => e.dataset.id === wall._uid);
    ok('a shape selected on the drawing: its row is listed again, and lit', !!row && row.classList.contains('on'));
    eq('...its floor, category and sub-category opened; every other floor still folded',
      [...r.panel.collapsed].sort(), ['fl\x00', 'fl\x00Level 10', 'fl\x00Level 2']);
    eq('...so its floor\'s rows are listed (Collapse all folded floors only), no other floor\'s',
      r.rows().map(e => p.findItem(e.dataset.id)?.item.name).sort(), ['Loose', 'Slab', 'Wall A', 'Wall B']);
    r.panel.collapsed.add('fl\x00Level 1');
    r.panel.refresh();
    ok('a fold of the selected item\'s own floor, made in the list, is kept by a rebuild', r.panel.collapsed.has('fl\x00Level 1')
      && !r.rows().some(e => e.dataset.id === wall._uid));
    r.panel.revealSelection([]);
    ok('...and by a selection of nothing', r.panel.collapsed.has('fl\x00Level 1'));
  } finally { r.restore(); }
}
{
  // The row is brought into view by scrolling the LIST alone. scrollIntoView
  // scrolls every ancestor that can scroll: on a phone, with the drawer
  // shut, it slid the page 315 px sideways under the tap (headless Chrome,
  // 390x844), whose click then folded a heading in the drawer.
  const p = itemJob();
  const r = panelRig({ project: p });
  const keepRect = StubEl.prototype.getBoundingClientRect;
  const keepInto = StubEl.prototype.scrollIntoView;
  const pageScrolls = [];
  try {
    const list = r.listEl;
    // 60 px a line, the list's box 100..400, as a browser lays it out
    StubEl.prototype.getBoundingClientRect = function rect() {
      if (this === list) return { left: 0, right: 300, top: 100, bottom: 400, width: 300, height: 300 };
      const i = list.children.indexOf(this);
      if (i < 0) return keepRect.call(this);
      const top = 100 + i * 60 - (list.scrollTop || 0);
      return { left: 0, right: 300, top, bottom: top + 60, width: 300, height: 60 };
    };
    StubEl.prototype.scrollIntoView = function into() { pageScrolls.push(this.className); };
    list.scrollTop = 0;
    r.panel.refresh();
    const roof = p.measurements[2].find(m => m.name === 'Roof deck');
    r.panel.revealSelection([roof._uid]);
    const row = r.rows().find(e => e.dataset.id === roof._uid);
    const box = row && row.getBoundingClientRect();
    ok('a row below the list\'s box: the list scrolls just enough to show it (block: nearest)',
      !!box && box.top >= 100 && box.bottom === 400, JSON.stringify([list.scrollTop, box]));
    eq('...and nothing but the list is scrolled (no scrollIntoView)', pageScrolls, []);
    const slab = p.measurements[0].find(m => m.name === 'Slab');
    r.panel.setSelection([slab._uid]);
    const sb = r.rows().find(e => e.dataset.id === slab._uid).getBoundingClientRect();
    ok('a row above it: scrolled back to its top', sb.top === 100, JSON.stringify([list.scrollTop, sb]));
    const before = list.scrollTop;
    r.panel.setSelection([slab._uid]);
    eq('a row already in view: the list stays put', list.scrollTop, before);
    eq('...the page is never scrolled', pageScrolls, []);
  } finally {
    StubEl.prototype.getBoundingClientRect = keepRect;
    StubEl.prototype.scrollIntoView = keepInto;
    r.restore();
  }
}

// ═══ 2c. a selection on the drawing, through the producer ════════════════
// The canvas (the real ToolController, real pointer events on a stand-in
// canvas) -> main.js's own 'selection-changed' listener (lifted by text) ->
// the real list. The desktop tells its list only where its canvas emits
// selection_changed: a press on ANOTHER measurement (mousePressEvent), a
// vertex drag that changed it (`if sel_changed`), a selection made for it
// (select_measurement: the list's click, a jump) -- and only then are the
// selected item's folded sections opened (highlight_measurement). Its
// right-click selects silently (_do_right_click); a press on the shape
// already selected starts its move and says nothing. A finger's hold is the
// web's right-click, so a press by finger is not shown in the list until
// the finger is known not to be holding: its lift, its slide, a second
// finger. (Second-pass review R5-2P-1: a right-click, a hold and a re-press
// all unfolded a floor he had folded, and rebuilt the list.)
log('\n-- 2c. what a selection made on the drawing does to the list: only where the desktop tells it --');
{
  const mainSrc = (await readFile(new URL('../js/main.js', import.meta.url), 'utf-8')).replace(/\r\n/g, '\n');
  const at = mainSrc.indexOf("controller.addEventListener('selection-changed', ev => {");
  const end = at < 0 ? -1 : mainSrc.indexOf('\n});\n', at);
  ok('main.js hands the canvas\'s selection to the list in one listener', at > 0 && end > at);
  const wiring = mainSrc.slice(at, end + 4);
  const sq = (x, y, s = 300) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
  const a = (name, fl, cat, sub, order, points, extra = {}) => ({
    type: 'area', name, label: name, value: 9, unit: 'SF', points, floor_level: fl, category: cat,
    sub_category: sub, sort_order: order, visible: true, ...extra });
  const p = new Project();
  p.loadFrom({ metadata: { page_labels: ['X1.0', 'X2.0'] }, annotations: {}, pageCount: 2, measurements: {
    0: [a('Pad', 'Level 1', 'Concrete', '', 100, sq(100, 100)),
      a('Wall', 'Level 1', 'Walls', 'Exterior', 200, sq(500, 100)),
      a('Deck', 'Level 2', 'Framing', '', 300, sq(100, 500)),
      a('Multi', 'Level 1', 'Walls', 'Exterior', 400, sq(500, 500), { group_id: 'gm' })],
    1: [a('Multi', 'Level 1', 'Walls', 'Exterior', undefined, sq(100, 100), { group_id: 'gm', group_child: true })],
  } });
  const r = panelRig({ project: p });
  try {
    let page = 0;
    const on = {};
    const canvas = { addEventListener: (t, f) => { on[t] = f; }, setPointerCapture() {}, releasePointerCapture() {},
      style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1024, height: 768 }) };
    const viewport = { zoom: 1, toPage: pt => pt, eventToPage: ev => [ev.clientX, ev.clientY],
      toScreen: (x, y) => [x, y], panBy() {} };
    const asked = [];
    const sent = [];
    withClock(clock => {
      const ctl = new CTL.ToolController({ canvas, viewport, project: p, currentPage: () => page,
        host: { showItemMenu: m => asked.push(m.name) } });
      ctl.uiScale = 1;
      ctl.addEventListener('selection-changed', e => sent.push([e.detail.ids.map(id => p.findItem(id)?.item.name),
        e.detail.reveal]));
      new Function('controller', 'itemsPanel', wiring)(ctl, r.panel);
      r.panel.refresh();
      let refreshes = 0;
      const real = r.panel.refresh.bind(r.panel);
      r.panel.refresh = () => { refreshes += 1; real(); };
      const name = id => p.findItem(id)?.item.name;
      const st = () => ({ sel: [...ctl.selected].map(name),
        folded: [...r.panel.collapsed].map(k => k.split('\x00').join('|')).sort(),
        lit: r.rows().filter(e => e.classList.contains('on')).map(e => name(e.dataset.id)), refreshes });
      const ev = (type, x, y, { button = 0, pointerType = 'mouse', id = 1 } = {}) => ({ type, pointerId: id, pointerType,
        button, clientX: x, clientY: y, shiftKey: false, ctrlKey: false, metaKey: false, preventDefault() {} });
      const press = (x, y, o) => { on.pointerdown(ev('pointerdown', x, y, o)); on.pointerup(ev('pointerup', x, y, o)); };
      const finger = { pointerType: 'touch', id: 7 };
      const hold = (x, y) => { on.pointerdown(ev('pointerdown', x, y, finger)); clock.advance(520);
        on.pointerup(ev('pointerup', x, y, finger)); };
      const tap = (x, y) => { on.pointerdown(ev('pointerdown', x, y, finger)); clock.advance(80);
        on.pointerup(ev('pointerup', x, y, finger)); };
      const heading = label => r.headings().find(e => new RegExp(`^. ${label}$`, 'i').test(r.labelOf(e).trim()));
      const fold = label => {
        const h = heading(label);
        if (!h) return false;
        r.doc.dispatch(h, 'click', { clientX: 10, clientY: 10 });
        return true;
      };
      // Level 1 folded (by a click on its heading, when it is not), and
      // nothing counted yet: each case starts from there.
      const folded1 = () => {
        if (!r.panel.collapsed.has('fl\x00Level 1')) fold('Level 1');
        refreshes = 0; sent.length = 0; asked.length = 0;
        return st().folded.includes('fl|Level 1');
      };
      const reset = () => { refreshes = 0; sent.length = 0; asked.length = 0; };
      const PAD = [250, 250], PAD_CORNER = [100, 100], WALL = [650, 250], DECK = [250, 650], EMPTY = [950, 950];

      // A. a right-click (the mouse)
      ok('Level 1 folded by a click on its heading', fold('Level 1') && st().folded.join() === 'fl|Level 1');
      reset();
      press(...PAD, { button: 2 });
      eq('a right-click on a shape in a folded floor: selected, its menu open -- and the floor stays folded, the list not rebuilt',
        [st(), asked], [{ sel: ['Pad'], folded: ['fl|Level 1'], lit: [], refreshes: 0 }, ['Pad']]);
      eq('...the canvas says so once, as a selection to show, not to go and find', sent, [[['Pad'], false]]);
      // B. a second press on the shape already selected (the desktop: its move)
      folded1();
      press(...PAD);
      eq('a press on the shape already selected: nothing said, nothing opened', [st(), sent],
        [{ sel: ['Pad'], folded: ['fl|Level 1'], lit: [], refreshes: 0 }, []]);
      folded1();
      press(...PAD_CORNER);
      eq('...on its corner (a vertex drag that changes nothing): the same', [st(), sent],
        [{ sel: ['Pad'], folded: ['fl|Level 1'], lit: [], refreshes: 0 }, []]);
      folded1();
      press(...PAD, { button: 2 });
      eq('...a right-click on it again: the same, and its menu', [st(), sent, asked],
        [{ sel: ['Pad'], folded: ['fl|Level 1'], lit: [], refreshes: 0 }, [], ['Pad']]);
      // A press on ANOTHER shape is the desktop's selection_changed: shown.
      folded1();
      press(...DECK);
      eq('a press on another shape, its floor open: its row lit; the folded floor left alone',
        [st(), sent], [{ sel: ['Deck'], folded: ['fl|Level 1'], lit: ['Deck'], refreshes: 0 }, [[['Deck'], true]]]);
      folded1();
      press(...WALL);
      eq('a press on another shape in the folded floor: the floor opened, its row lit (highlight_measurement)',
        st(), { sel: ['Wall'], folded: [], lit: ['Wall'], refreshes: 1 });
      // A right-click on another shape: selected silently -- its row is lit
      // where it is listed (as the web always has), nothing is opened.
      folded1();
      press(...DECK, { button: 2 });
      eq('a right-click on a shape that IS listed: its row lit, nothing opened or rebuilt',
        [st(), asked], [{ sel: ['Deck'], folded: ['fl|Level 1'], lit: ['Deck'], refreshes: 0 }, ['Deck']]);

      // C. a finger's hold (the web's right-click)
      press(...EMPTY);
      eq('(a press on nothing clears the selection)', st().sel, []);
      folded1();
      hold(...PAD);
      eq('a finger held on a shape in a folded floor: selected, its menu open -- the floor stays folded',
        [st(), asked], [{ sel: ['Pad'], folded: ['fl|Level 1'], lit: [], refreshes: 0 }, ['Pad']]);
      eq('...shown, never sent to be found', sent.every(([, reveal]) => !reveal), true);
      folded1();
      hold(...PAD);
      eq('...held on it again: the same', [st(), asked], [{ sel: ['Pad'], folded: ['fl|Level 1'], lit: [], refreshes: 0 }, ['Pad']]);
      // A finger's tap is the desktop's press: shown -- once the finger is up.
      tap(...EMPTY);
      folded1();
      on.pointerdown(ev('pointerdown', ...PAD, finger));
      eq('a finger down on a shape in a folded floor: selected, and not yet looked for (it may be a hold)',
        st(), { sel: ['Pad'], folded: ['fl|Level 1'], lit: [], refreshes: 0 });
      clock.advance(80);
      on.pointerup(ev('pointerup', ...PAD, finger));
      eq('...lifted at once (a tap): its floor opened, its row lit', st(), { sel: ['Pad'], folded: [], lit: ['Pad'], refreshes: 1 });
      tap(...EMPTY);
      folded1();
      on.pointerdown(ev('pointerdown', ...WALL, finger));
      on.pointermove(ev('pointermove', WALL[0] + 30, WALL[1], finger));
      eq('a finger that lands on a shape and slides on (a pan): looked for at the slide',
        st(), { sel: ['Wall'], folded: [], lit: ['Wall'], refreshes: 1 });
      clock.advance(600);
      on.pointerup(ev('pointerup', WALL[0] + 30, WALL[1], finger));
      eq('...and no menu after it', asked, []);
      tap(...EMPTY);
      folded1();
      tap(...WALL);
      tap(...WALL);
      eq('a second tap on the shape just tapped: nothing more said', sent.filter(([, rv]) => rv).length, 1);

      // D. a run of a multi-sheet item, tapped on its own sheet (R5-2P-2)
      r.panel.collapsed.add('fl\x00Level 1');
      r.panel.collapsed.add('fl\x00Level 2');
      r.panel.refresh();
      tap(...EMPTY);
      page = 1;
      reset();
      tap(...PAD);
      eq('the run of a multi-sheet item tapped on its sheet: its floor opened, its ITEM\'s row lit',
        st(), { sel: ['Multi'], folded: ['fl|Level 2'], lit: ['Multi'], refreshes: 1 });
      ok('...the row lit is the item\'s main shape\'s, on the other sheet',
        r.rows().filter(e => e.classList.contains('on')).every(e => p.findItem(e.dataset.id)?.pageKey === 0));
      page = 0;

      // E. a selection made for it (the list's click, a jump: select_measurement)
      r.panel.collapsed = new Set(['fl\x00Level 2']);
      r.panel.refresh();
      reset();
      ctl.select([p.measurements[0][2]._uid]);
      eq('a selection made for the canvas (the list, a jump): shown, its sections opened',
        [st(), sent], [{ sel: ['Deck'], folded: [], lit: ['Deck'], refreshes: 1 }, [[['Deck'], true]]]);
    });
  } finally { r.restore(); }
}

// ═══ 3. the hold ═════════════════════════════════════════════════════════
log('\n-- 3. the hold: 500 ms, 11 px, and the lift\'s click --');
eq('the canvas\'s two numbers, imported, not copied', [H.LONG_PRESS_MS, H.TAP_SLOP, CTL.LONG_PRESS_MS, CTL.TAP_SLOP], [500, 11, 500, 11]);
function holdRig(opts = {}) {
  const doc = stubDocument();
  const el = doc.body.appendChild(doc.createElement('div'));
  const child = el.appendChild(doc.createElement('span'));
  const clock = fakeClock();
  const fired = [];
  const clicks = [];
  el.addEventListener('click', ev => clicks.push([ev.clientX, ev.clientY]));
  const g = H.holdGesture(el, { onHold: at => fired.push(at), clock, ...opts });
  const press = (type, x, y, extra = {}) => doc.dispatch(extra.on || child, type,
    { pointerType: 'touch', pointerId: 1, clientX: x, clientY: y, ...extra });
  return { doc, el, child, clock, fired, clicks, g, press };
}
{
  const r = holdRig();
  r.press('pointerdown', 100, 100);
  ok('a finger down: the hold is busy', r.g.busy());
  r.clock.advance(499);
  eq('499 ms: nothing yet', r.fired, []);
  r.clock.advance(1);
  eq('500 ms: it fires once, at the finger, saying it is a finger', r.fired, [{ clientX: 100, clientY: 100, pointerType: 'touch' }]);
  r.clock.advance(2000);
  eq('...and once only', r.fired.length, 1);
  r.press('pointerup', 100, 100);
  const ev = r.press('click', 100, 100);
  ok('the lift\'s click is swallowed', ev.defaultPrevented && r.clicks.length === 0);
  const ev2 = r.press('click', 100, 100);
  ok('...that one only: the next click goes through', !ev2.defaultPrevented && r.clicks.length === 1);
  ok('...and the hold is done', !r.g.busy());
}
{
  const r = holdRig();
  r.press('pointerdown', 100, 100);
  r.press('pointermove', 111, 100);
  r.clock.advance(500);
  eq('a tremble of exactly 11 px still holds', r.fired.length, 1);
  const r2 = holdRig();
  r2.press('pointerdown', 100, 100);
  r2.press('pointermove', 108, 108);
  r2.clock.advance(200);
  eq('more than 11 px (a diagonal 11.3): a scroll, no hold', r2.fired.length, 0);
  ok('...no hold any more, and no move listened to', !r2.g.busy() && r2.doc.listeners('pointermove').length === 0);
  r2.press('pointerup', 108, 108);
  r2.clock.advance(500);
  eq('...still no hold once the hold\'s time has passed', r2.fired.length, 0);
  r2.press('click', 108, 108);
  eq('...and a quick slide\'s click is its own (not swallowed)', r2.clicks.length, 1);
  ok('...nothing left listening', r2.doc.listeners('pointerup').length === 0 && r2.doc.listeners('click').length === 0);
}
{
  // A press as long as a hold is no tap, even one that slid past the slop:
  // 6 px at 220 ms, 12 px at 480 ms, lifted at 900 ms, and the browser's
  // click made of it at the PRESS point (headless Chrome's real sequence).
  // It used to fold the heading or select the row.
  const r = holdRig();
  r.press('pointerdown', 100, 100);
  r.clock.advance(220);
  r.press('pointermove', 100, 106);
  r.clock.advance(260);
  r.press('pointermove', 100, 112);
  r.clock.advance(420);
  eq('a long press that slid 12 px: no menu', r.fired.length, 0);
  ok('...and it is no hold (a contextmenu now is a menu of its own)', !r.g.busy());
  r.press('pointerup', 100, 112);
  ok('a long press that slid: its click is swallowed', r.press('click', 100, 100).defaultPrevented && r.clicks.length === 0);
  ok('...that one only', !r.press('click', 100, 100).defaultPrevented && r.clicks.length === 1);
  // the same by the events' own times, the timer not run (a busy page)
  const t = holdRig();
  t.press('pointerdown', 100, 100, { timeStamp: 1000 });
  t.press('pointermove', 100, 112, { timeStamp: 1480 });
  t.press('pointerup', 100, 112, { timeStamp: 1900 });
  ok('...by its timeStamps too, the timer not yet run', t.press('click', 100, 100).defaultPrevented && t.fired.length === 0);
  // a slide the browser took for a scroll: no click comes, none is waited for
  const c = holdRig();
  c.press('pointerdown', 100, 100);
  c.press('pointermove', 100, 113);
  c.clock.advance(700);
  c.press('pointercancel', 100, 113);
  ok('a long slide the browser took for a scroll: nothing waits for its click',
    !c.press('click', 100, 100).defaultPrevented && c.doc.listeners('click').length === 0);
}
{
  // Hold or tap by how long the finger was DOWN, as the events say: a busy
  // page can run the timer before a tap's queued lift (pointerup's
  // timeStamp keeps the real lift time even when it is handled late).
  const took = [];
  const r = holdRig({ onTakeBack: () => took.push('back') });
  r.press('pointerdown', 100, 100, { timeStamp: 1000 });
  r.clock.advance(500);                       // the late timer, run first
  eq('a busy page: the timer runs before the queued lift', r.fired.length, 1);
  r.press('pointerup', 100, 100, { timeStamp: 1300 });
  eq('...the lift says 300 ms: a tap -- the menu is taken back', took, ['back']);
  ok('...and the tap\'s click is its own: the row selects, the heading folds',
    !r.press('click', 100, 100).defaultPrevented && r.clicks.length === 1 && !r.g.busy());
  const h = holdRig({ onTakeBack: () => took.push('back') });
  took.length = 0;
  h.press('pointerdown', 100, 100, { timeStamp: 1000 });
  h.clock.advance(500);
  h.press('pointerup', 100, 100, { timeStamp: 1650 });
  ok('a real hold, by its timeStamps: kept, and its lift\'s click swallowed',
    took.length === 0 && h.fired.length === 1 && h.press('click', 100, 100).defaultPrevented);
  const l = holdRig({ onTakeBack: () => took.push('back') });
  l.press('pointerdown', 100, 100, { timeStamp: 1000 });
  l.clock.advance(300);                       // the timer not run yet: the page is busy
  l.press('pointerup', 104, 103, { timeStamp: 1700 });
  eq('a hold the busy page had not got to: it opens on the lift', l.fired, [{ clientX: 104, clientY: 103, pointerType: 'touch' }]);
  ok('...its click swallowed', l.press('click', 104, 103).defaultPrevented && took.length === 0);
  l.clock.advance(1000);
  eq('...and once only', l.fired.length, 1);
  const z = holdRig({ onTakeBack: () => took.push('back') });
  z.press('pointerdown', 100, 100, { timeStamp: 0 });
  z.clock.advance(500);
  z.press('pointerup', 100, 100, { timeStamp: 0 });
  ok('events with no time (timeStamp 0): the timer\'s word -- a hold, kept, its click swallowed',
    z.fired.length === 1 && took.length === 0 && z.press('click', 100, 100).defaultPrevented);
}
{
  const r = holdRig();
  r.press('pointerdown', 50, 50);
  r.clock.advance(300);
  r.press('pointerup', 50, 50);
  r.clock.advance(500);
  eq('lifted at 300 ms: a tap, no hold', r.fired.length, 0);
  r.press('click', 50, 50);
  eq('...and the tap\'s click goes through', r.clicks.length, 1);
  const c = holdRig();
  c.press('pointerdown', 50, 50);
  c.clock.advance(200);
  c.press('pointercancel', 50, 50);
  c.clock.advance(500);
  eq('pointercancel (the browser took it for a scroll): no hold', c.fired.length, 0);
  const s = holdRig();
  s.press('pointerdown', 50, 50);
  s.clock.advance(100);
  s.press('pointerdown', 300, 300, { pointerId: 2, isPrimary: false, on: s.doc.body });
  s.clock.advance(1000);
  eq('a second finger anywhere: no hold', s.fired.length, 0);
  const s2 = holdRig();
  s2.press('pointerdown', 50, 50);
  s2.clock.advance(100);
  s2.press('pointerdown', 60, 60, { pointerId: 2 });   // on the same element, no isPrimary said
  s2.clock.advance(1000);
  eq('a second finger on the same element: no hold, and none of its own', s2.fired.length, 0);
  s2.press('pointerup', 60, 60, { pointerId: 2 });
  s2.press('pointerup', 50, 50);
  s2.clock.advance(10);
  s2.press('pointerdown', 70, 70, { pointerId: 2 });
  s2.clock.advance(500);
  eq('...and the same finger pressed again later is a hold again', s2.fired.length, 1);
  const d = holdRig();
  d.press('pointerdown', 50, 50);
  d.clock.advance(300);
  d.el.remove();
  d.clock.advance(300);
  eq('the element left the page (the list rebuilt under the finger): no hold', d.fired.length, 0);
  ok('...and nothing is left listening', !d.g.busy() && d.doc.listeners('pointerup').length === 0);
}
{
  const m = holdRig();
  m.press('pointerdown', 50, 50, { pointerType: 'mouse' });
  m.clock.advance(1000);
  eq('a mouse held down: nothing (it has its right button)', m.fired.length, 0);
  const b = holdRig();
  b.press('pointerdown', 50, 50, { button: 2 });
  b.clock.advance(1000);
  eq('not the main button: nothing', b.fired.length, 0);
  const n = holdRig();
  n.press('pointerdown', 50, 50, { isPrimary: false });
  n.clock.advance(1000);
  eq('a finger that is not the first one down: nothing', n.fired.length, 0);
  const p = holdRig();
  p.press('pointerdown', 70, 80, { pointerType: 'pen' });
  p.clock.advance(500);
  eq('a pen is a finger', p.fired, [{ clientX: 70, clientY: 80, pointerType: 'pen' }]);
  p.press('pointerup', 70, 80, { pointerType: 'pen' });
  ok('...its lift\'s click swallowed too', p.press('click', 70, 80).defaultPrevented);
}
{
  const r = holdRig();
  r.press('pointerdown', 100, 100);
  r.press('pointermove', 105, 104);
  r.clock.advance(500);
  eq('it opens where the finger is now', r.fired[0], { clientX: 105, clientY: 104, pointerType: 'touch' });
  r.press('pointerup', 105, 104);
  r.clock.advance(351);
  ok('a click more than 350 ms after the lift is not the lift\'s', !r.press('click', 105, 104).defaultPrevented);
  const f = holdRig();
  f.press('pointerdown', 100, 100);
  f.clock.advance(500);
  f.press('pointerup', 100, 100);
  ok('a click far from the lift (a menu entry) is not the lift\'s', !f.press('click', 160, 140).defaultPrevented);
  ok('...nor is the one after it, if it is', f.clicks.length === 1);
  // The browser puts the lift's click where it likes within a finger's
  // width: at the press point after a slide, a little off the lift. Up to
  // twice the slop (22 px) it is the lift's.
  for (const [dx, dy] of [[15, 0], [0, -15], [12, 12], [0, 22]]) {
    const n = holdRig();
    n.press('pointerdown', 100, 100);
    n.clock.advance(500);
    n.press('pointerup', 100, 100);
    ok(`a click ${Math.round(Math.hypot(dx, dy))} px off the lift is the lift's: swallowed`,
      n.press('click', 100 + dx, 100 + dy).defaultPrevented && n.clicks.length === 0);
  }
  const far = holdRig();
  far.press('pointerdown', 100, 100);
  far.clock.advance(500);
  far.press('pointerup', 100, 100);
  ok('...23 px off it is not', !far.press('click', 123, 100).defaultPrevented);
  const g = holdRig();
  g.press('pointerdown', 100, 100);
  g.clock.advance(500);
  g.press('pointerup', 100, 100);
  g.press('pointerdown', 100, 100, { pointerId: 3 });
  g.press('pointerup', 100, 100, { pointerId: 3 });
  ok('a new press after the lift: its click is its own', !g.press('click', 100, 100).defaultPrevented);
  const g2 = holdRig();
  g2.press('pointerdown', 100, 100);
  g2.clock.advance(500);
  g2.press('pointerup', 100, 100);
  g2.press('pointerdown', 104, 104, { pointerId: 3, on: g2.doc.body });
  g2.press('pointerup', 104, 104, { pointerId: 3, on: g2.doc.body });
  ok('...a new press somewhere else too (a menu that had to open under the finger)',
    !g2.press('click', 104, 104, { on: g2.doc.body }).defaultPrevented);
  const k = holdRig();
  k.press('pointerdown', 100, 100);
  k.clock.advance(500);
  k.press('pointercancel', 0, 0);
  ok('lifted by pointercancel: the click at the finger is still swallowed', k.press('click', 100, 100).defaultPrevented);
  const z = holdRig();
  z.g.dispose();
  z.press('pointerdown', 100, 100);
  z.clock.advance(600);
  eq('dispose: no more holds', z.fired.length, 0);
}

// ═══ 4. through the panel ════════════════════════════════════════════════
log('\n-- 4. through the panel: hold, tap, right-click, scroll --');
withClock(clock => {
  const r = panelRig({ project: itemJob(), touch: true });
  try {
    r.panel.refresh();
    const press = (target, type, x, y, extra = {}) => r.doc.dispatch(target, type,
      { pointerType: 'touch', pointerId: 7, clientX: x, clientY: y, ...extra });
    const tapLike = (target, x, y, hold, extra = {}) => {
      press(target, 'pointerdown', x, y, extra);
      clock.advance(hold);
      press(target, 'pointerup', x, y, extra);
      return press(target, 'click', x, y, { pointerType: extra.pointerType || 'touch' });
    };
    const floor = r.headings()[0];
    const label = floor.children.find(c => c.classList.contains('grp-label'));
    r.calls.length = 0;
    press(label, 'pointerdown', 250, 30);
    clock.advance(500);
    const menus = r.calls.filter(c => c[0] === 'menu');
    eq('a finger held on a heading (on its words): its menu, at the finger', menus.map(c => [c[1], c[2]]),
      [[['Collapse all', 'Expand all'], { clientX: 250, clientY: 30, pointerType: 'touch' }]]);
    press(label, 'pointerup', 250, 30);
    const lift = press(label, 'click', 250, 30);
    ok('...the lift does not fold it', lift.defaultPrevented && r.panel.collapsed.size === 0);
    tapLike(label, 250, 30, 120);
    ok('a tap on a heading still folds it', r.panel.collapsed.has('fl\x00Level 1'));
    tapLike(r.headings()[0], 250, 30, 120);
    ok('...and a second tap unfolds it', r.panel.collapsed.size === 0);

    const row = r.rows().find(e => e.textContent.includes('Slab'));
    r.calls.length = 0;
    press(row, 'pointerdown', 200, 80);
    clock.advance(500);
    eq('a finger held on a row: the item menu, at the finger', r.calls,
      [['itemMenu', 'Slab', { clientX: 200, clientY: 80, pointerType: 'touch' }]]);
    press(row, 'pointerup', 200, 80);
    press(row, 'click', 200, 80);
    eq('...and the selection is untouched (the lift selects nothing)', r.calls.filter(c => c[0] === 'select'), []);
    r.calls.length = 0;
    tapLike(row, 200, 80, 90);
    eq('a tap on a row still selects it', r.calls, [['select', 'Slab']]);
    r.calls.length = 0;
    const eye = row.querySelector('button.eye');
    press(eye, 'pointerdown', 280, 80);
    clock.advance(500);
    press(eye, 'pointerup', 280, 80);
    const eyeClick = press(eye, 'click', 280, 80);
    ok('a hold on the row\'s eye: the item menu, and the eye is not pressed by the lift',
      r.calls.length === 1 && r.calls[0][0] === 'itemMenu' && eyeClick.defaultPrevented
      && r.panel.project.findItem(r.panel.project.measurements[0][0]._uid).item.visible !== false);

    r.calls.length = 0;
    press(row, 'pointerdown', 200, 80);
    clock.advance(450);
    const cm = r.doc.dispatch(row, 'contextmenu', { pointerType: 'touch', clientX: 200, clientY: 80 });
    clock.advance(50);
    eq('a finger\'s contextmenu (Chrome, Android) is the hold\'s: one menu, not two', r.calls.map(c => c[0]), ['itemMenu']);
    ok('...and the browser\'s own menu is kept off', cm.defaultPrevented);
    press(row, 'pointerup', 200, 80);
    press(row, 'click', 200, 80);
    r.calls.length = 0;
    const hh = r.headings()[1];
    press(hh, 'pointerdown', 150, 60);
    clock.advance(480);
    const cmh0 = r.doc.dispatch(hh, 'contextmenu', { pointerType: 'touch', clientX: 150, clientY: 60 });
    clock.advance(20);
    eq('...on a heading too', r.calls.map(c => c[0]), ['menu']);
    ok('...its browser menu kept off', cmh0.defaultPrevented);
    press(hh, 'pointerup', 150, 60);
    press(hh, 'click', 150, 60);
    ok('...and the lift folds nothing', r.panel.collapsed.size === 0);

    r.calls.length = 0;
    const h2 = r.headings()[1];
    press(h2, 'pointerdown', 150, 60);
    press(h2, 'pointermove', 150, 75);
    press(h2, 'pointercancel', 150, 75);
    clock.advance(1000);
    eq('a finger drag that scrolls the list opens nothing', r.calls, []);
    r.calls.length = 0;
    press(h2, 'pointerdown', 150, 60);
    press(h2, 'pointermove', 150, 64);
    press(h2, 'pointermove', 150, 90);
    clock.advance(1000);
    press(h2, 'pointerup', 150, 90);
    eq('...nor one the browser has not taken yet', r.calls, []);

    r.calls.length = 0;
    const cmh = r.doc.dispatch(h2, 'contextmenu', { pointerType: 'mouse', clientX: 140, clientY: 66 });
    ok('a mouse right-click on a heading opens its menu', cmh.defaultPrevented
      && r.calls.length === 1 && r.calls[0][0] === 'menu');
    r.calls.length = 0;
    r.doc.dispatch(row, 'contextmenu', { clientX: 210, clientY: 90 });
    eq('a right-click on a row opens the item menu (Safari: no pointerType)', r.calls.map(c => [c[0], c[1]]), [['itemMenu', 'Slab']]);
    r.calls.length = 0;
    press(row, 'pointerdown', 200, 80, { pointerType: 'mouse' });
    clock.advance(800);
    eq('a mouse held on a row opens nothing', r.calls, []);
    press(row, 'pointerup', 200, 80, { pointerType: 'mouse' });

    r.calls.length = 0;
    const pr = r.rows().find(e => e.textContent.includes('Patio'));
    press(pr, 'pointerdown', 190, 120, { pointerType: 'pen' });
    clock.advance(500);
    eq('a pen held on a row: the item menu', r.calls.map(c => [c[0], c[1]]), [['itemMenu', 'Patio']]);
    press(pr, 'pointerup', 190, 120, { pointerType: 'pen' });

    r.calls.length = 0;
    const h3 = r.headings()[2];
    press(h3, 'pointerdown', 150, 60);
    clock.advance(300);
    r.panel.refresh();                      // an edit elsewhere rebuilds the list
    clock.advance(400);
    eq('the list rebuilt under a held finger: no menu from the gone heading', r.calls, []);
    press(h3, 'pointerup', 150, 60);
  } finally { r.restore(); }
});
withClock(clock => {
  const r = panelRig({ project: itemJob(), touch: true });
  try {
    r.panel.refresh();
    const press = (target, type, x, y, extra = {}) => r.doc.dispatch(target, type,
      { pointerType: 'touch', pointerId: 8, clientX: x, clientY: y, ...extra });
    const scrollTo = top => { r.listEl.scrollTop = top; r.doc.dispatch(r.listEl, 'scroll'); };
    const row = () => r.rows().find(e => e.textContent.includes('Slab'));
    // A hold, then the finger slides on and the list scrolls under the menu:
    // the menu points at a row that has moved away, so it goes.
    r.listEl.scrollTop = 0;
    r.calls.length = 0;
    press(row(), 'pointerdown', 200, 80);
    clock.advance(500);
    press(row(), 'pointercancel', 200, 60);
    eq('a hold that slides on into a scroll: the item menu opened', r.calls.map(c => c[0]), ['itemMenu']);
    scrollTo(1);
    eq('...a 1 px settle of the list keeps it', r.calls.map(c => c[0]), ['itemMenu']);
    scrollTo(135);
    eq('...the list scrolling under it closes it', r.calls.map(c => c.slice(0, 2)), [['itemMenu', 'Slab'], ['close', 'Slab']]);
    scrollTo(20);
    eq('...once', r.calls.length, 2);
    clock.advance(400);
    r.calls.length = 0;
    const hh = r.headings()[0];
    r.doc.dispatch(hh, 'contextmenu', { pointerType: 'mouse', clientX: 140, clientY: 30 });
    scrollTo(160);
    eq('a right-clicked heading\'s menu: a wheel that scrolls the list closes it too',
      r.calls.map(c => c[0]), ['menu', 'close']);
    r.calls.length = 0;
    scrollTo(0);
    eq('a scroll with no menu of the list\'s open: nothing', r.calls, []);

    // A busy page ran the hold's timer before a tap's queued lift.
    r.calls.length = 0;
    press(row(), 'pointerdown', 200, 80, { timeStamp: 5000 });
    clock.advance(500);
    press(row(), 'pointerup', 200, 80, { timeStamp: 5300 });
    press(row(), 'click', 200, 80);
    eq('a tap the timer outran: the menu taken back, and the tap selects the row',
      r.calls.map(c => c.slice(0, 2)), [['itemMenu', 'Slab'], ['close', 'Slab'], ['select', 'Slab']]);
    r.calls.length = 0;
    const fl = r.headings()[0];
    press(fl, 'pointerdown', 150, 30, { timeStamp: 9000 });
    clock.advance(500);
    press(fl, 'pointerup', 150, 30, { timeStamp: 9250 });
    press(fl, 'click', 150, 30);
    ok('...on a heading: its menu taken back, and the tap folds it',
      JSON.stringify(r.calls.map(c => c[0])) === '["menu","close"]' && r.panel.collapsed.has('fl\x00Level 1'));
    r.panel.collapsed.clear(); r.panel.refresh();

    // A long press that slid 12 px: no menu, and its lift does not fold.
    r.calls.length = 0;
    const f2 = r.headings()[0];
    press(f2, 'pointerdown', 150, 30);
    clock.advance(220);
    press(f2, 'pointermove', 150, 36);
    clock.advance(260);
    press(f2, 'pointermove', 150, 42);
    clock.advance(440);
    press(f2, 'pointerup', 150, 42);
    press(f2, 'click', 150, 30);
    ok('a long press that slid 12 px on a heading: no menu, and it does not fold',
      r.calls.length === 0 && r.panel.collapsed.size === 0, JSON.stringify([r.calls.map(c => c[0]), [...r.panel.collapsed]]));
    clock.advance(400);
    const row2 = row();
    press(row2, 'pointerdown', 200, 80);
    clock.advance(480);
    press(row2, 'pointermove', 212, 80);
    clock.advance(440);
    press(row2, 'pointerup', 212, 80);
    press(row2, 'click', 200, 80);
    eq('...on a row: no menu, and it does not select', r.calls, []);
    clock.advance(400);
    press(row2, 'pointerdown', 200, 80);
    clock.advance(150);
    press(row2, 'pointermove', 213, 80);
    press(row2, 'pointerup', 213, 80);
    press(row2, 'click', 213, 80);
    eq('...but a quick slide that the browser made a click of still selects', r.calls.map(c => c.slice(0, 2)), [['select', 'Slab']]);
  } finally { r.restore(); }
});
{
  // Collapse all folds the floors listed when its menu OPENED (the desktop's
  // meta['tree']), not a list rebuilt under the open menu since.
  const p = itemJob();
  const r = panelRig({ project: p });
  try {
    r.panel.refresh();
    r.doc.dispatch(r.headings()[0], 'contextmenu', { clientX: 10, clientY: 10 });
    const entries = r.calls.at(-1)[3];
    p.measurements[2].push({ type: 'area', name: 'Penthouse slab', label: 'Penthouse slab', value: 5, unit: 'SF',
      points: [[1, 1], [9, 1], [9, 9]], floor_level: 'Level 20', category: 'Concrete', sort_order: 950, visible: true });
    p.measurements[1] = p.measurements[1].filter(m => m.floor_level !== '');
    r.panel.refresh();
    eq('the list rebuilt under the open menu: another floor set', [...r.panel._tree.keys()].sort(),
      ['Level 1', 'Level 10', 'Level 2', 'Level 20']);
    entries.find(e => e.label === 'Collapse all').run();
    eq('Collapse all folds the floors its menu was opened on', [...r.panel.collapsed].sort(),
      ['fl\x00', 'fl\x00Level 1', 'fl\x00Level 10', 'fl\x00Level 2']);
  } finally { r.restore(); }
}

// ═══ 5. the menu: off the finger, on screen ══════════════════════════════
log('\n-- 5. the menu: off the finger, on screen, a mouse\'s at the pointer --');
{
  let bad = 0, n = 0, cannot = 0;
  for (const [vw, vh] of [[1024, 768], [390, 844], [768, 1024], [844, 390], [320, 568]]) {
    for (const [w, h] of [[200, 70], [200, 300], [240, 400]]) {
      for (let x = 0; x <= vw; x += 13) {
        for (let y = 0; y <= vh; y += 17) {
          n += 1;
          const at = { clientX: x, clientY: y, pointerType: 'touch' };
          const { left, top } = H.menuPlace(at, w, h, vw, vh);
          const inside = x >= left && x <= left + w && y >= top && y <= top + h;
          // (a menu taller or wider than the window is pinned at its top/left)
          const onScreen = left >= 8 && top >= 8
            && (left + w <= vw - 8 || w > vw - 16) && (top + h <= vh - 8 || h > vh - 16);
          // Off the finger is possible only where the menu fits beside it,
          // above it or below it; elsewhere (a tall menu mid-screen on a
          // 320px phone) the lift's click is still swallowed (section 3).
          const room = x + 12 + w <= vw - 8 || x - 12 - w >= 8 || y + 12 + h <= vh - 8 || y - 12 - h >= 8;
          if (!room) cannot += 1;
          if ((inside && room) || !onScreen) {
            bad += 1;
            if (bad < 4) log(`   menuPlace ${vw}x${vh} menu ${w}x${h} at ${x},${y}: ${left},${top} inside=${inside}`);
          }
        }
      }
    }
  }
  eq(`a finger's menu never covers the finger where it can help it, and is always on screen (${n} points, iPad and phone sizes; ${cannot} with no room on any side)`, bad, 0);
  eq('a finger\'s menu is drawn 12 px off it where there is room', H.menuPlace({ clientX: 100, clientY: 100, pointerType: 'touch' }, 200, 90, 1024, 768), { left: 112, top: 112 });
  eq('...a pen\'s too', H.menuPlace({ clientX: 100, clientY: 100, pointerType: 'pen' }, 200, 90, 1024, 768), { left: 112, top: 112 });
  eq('at the right edge (the Items list) it opens to the left of the finger', H.menuPlace({ clientX: 1000, clientY: 100, pointerType: 'touch' }, 200, 90, 1024, 768), { left: 788, top: 112 });
  eq('at the foot, above it', H.menuPlace({ clientX: 100, clientY: 740, pointerType: 'touch' }, 200, 90, 1024, 768), { left: 112, top: 638 });
  eq('a mouse\'s opens at the pointer, as before', H.menuPlace({ clientX: 100, clientY: 100, pointerType: 'mouse' }, 200, 90, 1024, 768), { left: 100, top: 100 });
  eq('...a Safari contextmenu (no pointerType) too', H.menuPlace({ clientX: 300, clientY: 200 }, 200, 90, 1024, 768), { left: 300, top: 200 });
  eq('...and the other way at an edge, as a desktop menu does', H.menuPlace({ clientX: 1000, clientY: 740 }, 200, 90, 1024, 768), { left: 800, top: 650 });
}
{
  // main.js's own showMenu and showItemMenu, lifted by text, on stand-ins.
  const src = (await readFile(new URL('../js/main.js', import.meta.url), 'utf-8')).replace(/\r\n/g, '\n');
  const fn = name => {
    const i = src.indexOf(`\nfunction ${name}(`);
    const j = src.indexOf('\n}\n', i);
    return i < 0 ? '' : src.slice(i + 1, j + 2);
  };
  const doc = stubDocument();
  const menuEl = doc.add('div', 'ctxMenu');
  menuEl.hidden = true;
  menuEl.offsetWidth = 200;
  menuEl.offsetHeight = 300;
  const calls = [];
  const timers = [];
  const env = {
    controller: { readOnly: false, readOnlyReason: 'View Only — nothing here can change the project.' },
    setStatus: t => calls.push(['status', t]),
    $: id => doc.byId(id),
    document: doc,
    window: { innerWidth: 1024, innerHeight: 768 },
    Node: StubEl,
    setTimeout: f => { timers.push(f); },
    menuPlace: H.menuPlace,
    openProperties: m => calls.push(['properties', m.name]),
    openMaterials: m => calls.push(['materials', m.name]),
    app: { project: { setVisible: () => calls.push(['hide']), isolate: () => calls.push(['isolate']),
      dropShapes: () => calls.push(['dropShapes']), findItem: () => ({ pageKey: 0 }) } },
    // (the list not on one sheet: the SHEET chip's way is tests/revision-counting.mjs's)
    itemsPanel: { refresh() {}, sheetOnly: () => false },
    onSheetUp: () => true,
    versionView: { revId: '' },
    jumpToItem: () => calls.push(['jump']),
    zoomFloor: { zoomToItem: () => { calls.push(['zoom']); return false; } },
    requestDraw() {},
    deleteWholeItem: () => calls.push(['deleteWholeItem']),
    forgetDeletedSelection() {},
  };
  const names = Object.keys(env);
  const { showMenu, showItemMenu } = new Function(...names,
    `${fn('closeMenu')}\n${fn('showMenu')}\n${fn('showItemMenu')}\nreturn { showMenu, showItemMenu };`)(...names.map(k => env[k]));
  const flush = () => { while (timers.length) timers.shift()(); };
  const item = { _uid: 'u1', type: 'area', name: 'Slab', points: [[0, 0], [1, 1]] };
  showItemMenu(item, { clientX: 900, clientY: 700, pointerType: 'touch' }, { from: 'list' });
  flush();
  const kids = menuEl.children.map(c => (c.tagName === 'HR' ? '-' : c.textContent));
  eq('the item menu\'s entries are as before', kids,
    ['Properties…', 'Associated materials…', '-', 'Hide', 'Isolate this item', 'Zoom to item', '-', 'Delete']);
  eq('...drawn off a finger at the corner of an iPad: left of it and above it',
    [menuEl.style.left, menuEl.style.top], ['688px', '388px']);
  const zoom = menuEl.children.find(c => c.textContent === 'Zoom to item');
  doc.dispatch(zoom, 'click');
  ok('an entry runs and closes the menu', menuEl.hidden && calls.some(c => c[0] === 'zoom'));
  eq('...and stops listening for its dismiss and its Escape',
    [doc.listeners('pointerdown').length, doc.listeners('keydown').length], [0, 0]);
  showItemMenu(item, { clientX: 900, clientY: 700 }, { from: 'list' });
  flush();
  showMenu([{ label: 'Collapse all', run: () => calls.push(['collapse']) }, { label: 'Expand all', run: () => {} }],
    { clientX: 300, clientY: 200, pointerType: 'touch' });
  flush();
  eq('a menu opened over another: still one dismiss and one Escape listening',
    [doc.listeners('pointerdown').length, doc.listeners('keydown').length], [1, 1]);
  eq('the heading menu: its two entries, no rule', menuEl.children.map(c => c.textContent), ['Collapse all', 'Expand all']);
  eq('...12 px off the finger', [menuEl.style.left, menuEl.style.top], ['312px', '212px']);
  doc.dispatch(menuEl.children[0], 'pointerdown');
  ok('a press on its own entry does not close it first', !menuEl.hidden);
  doc.dispatch(menuEl.children[0], 'click');
  ok('...its click runs it', calls.some(c => c[0] === 'collapse') && menuEl.hidden);
  showMenu([{ label: 'Collapse all', run: () => {} }], { clientX: 300, clientY: 200 });
  flush();
  doc.dispatch(doc.body, 'pointerdown');
  ok('a press anywhere else closes it', menuEl.hidden && doc.listeners('pointerdown').length === 0
    && doc.listeners('keydown').length === 0);
  eq('a mouse\'s menu is at the pointer', [menuEl.style.left, menuEl.style.top], ['300px', '200px']);
  // Escape closes it, as it closes the desktop's QMenu, and goes no further
  // (the app's own keydown -- version, sheet, tool -- does not see it).
  {
    const appKeys = [];
    const appKey = ev => appKeys.push(ev.key);
    doc.addEventListener('keydown', appKey);
    for (const [what, open] of [
      ['the heading menu', () => showMenu([{ label: 'Collapse all', run: () => calls.push(['collapse']) }],
        { clientX: 300, clientY: 200, pointerType: 'touch' })],
      ['the item menu', () => showItemMenu(item, { clientX: 300, clientY: 200 }, { from: 'canvas' })]]) {
      calls.length = 0;
      open();
      flush();
      const other = doc.dispatch(doc.body, 'keydown', { key: 'a' });
      ok(`${what}: another key goes on to the app`, !menuEl.hidden && !other.defaultPrevented && appKeys.at(-1) === 'a');
      appKeys.length = 0;
      const esc = doc.dispatch(doc.body, 'keydown', { key: 'Escape' });
      ok(`${what}: Escape closes it`, menuEl.hidden);
      ok(`${what}: ...and is the menu's: kept from the app, nothing run`,
        esc.defaultPrevented && appKeys.length === 0 && calls.length === 0, JSON.stringify([appKeys, calls]));
      eq(`${what}: ...and nothing is left listening`,
        [doc.listeners('pointerdown').length, doc.listeners('keydown').filter(l => l.capture).length], [0, 0]);
      const after = doc.dispatch(doc.body, 'keydown', { key: 'Escape' });
      ok(`${what}: the next Escape is the app's again`, !after.defaultPrevented && appKeys.at(-1) === 'Escape');
      appKeys.length = 0;
    }
    doc.removeEventListener('keydown', appKey);
  }
  // A menu's handle closes THAT menu only: the Items list closes the menu it
  // opened when the list scrolls, never one opened over it since.
  {
    const a = showMenu([{ label: 'Collapse all', run: () => {} }], { clientX: 300, clientY: 200 });
    flush();
    const b = showItemMenu(item, { clientX: 320, clientY: 220 }, { from: 'canvas' });
    flush();
    a.close();
    ok('a handle of a menu since replaced: closes nothing', !menuEl.hidden && menuEl.children[0].textContent === 'Properties…');
    b.close();
    ok('...its own handle closes it, and its listeners go', menuEl.hidden
      && doc.listeners('pointerdown').length === 0 && doc.listeners('keydown').length === 0);
    const c = showMenu([{ label: 'Collapse all', run: () => {} }], { clientX: 300, clientY: 200 });
    flush();
    doc.dispatch(menuEl.children[0], 'click');
    showItemMenu(item, { clientX: 320, clientY: 220 }, { from: 'canvas' });
    flush();
    c.close();
    ok('...nor a menu opened after it was chosen from', !menuEl.hidden);
    b.close();
    showMenu([], { clientX: 1, clientY: 1 }); flush();
    doc.dispatch(doc.body, 'pointerdown');
  }
  // The drawing's own long press (controller _armLongPress -> _onRightClick
  // -> host.showItemMenu): its menu is a finger's too, drawn off the finger.
  {
    const p = new Project();
    p.loadFrom({ metadata: { page_labels: ['X1.0'] }, annotations: {}, pageCount: 1, measurements: {
      0: [{ type: 'area', name: 'Pad', label: 'Pad', value: 1, unit: 'SF', visible: true,
        points: [[100, 100], [400, 100], [400, 400], [100, 400]], floor_level: 'Level 1', category: 'Concrete' }] } });
    const on = {};
    const canvas = { addEventListener: (t, f) => { on[t] = f; }, setPointerCapture() {}, releasePointerCapture() {},
      style: {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 1024, height: 768 }) };
    const viewport = { zoom: 1, toPage: pt => pt, eventToPage: ev => [ev.clientX, ev.clientY],
      toScreen: (x, y) => [x, y], panBy() {} };
    const asked = [];
    let ctl = null;
    withClock(clock => {
      ctl = new CTL.ToolController({ canvas, viewport, project: p, currentPage: () => 0,
        host: { showItemMenu: (m, at) => asked.push([m.name, at]) } });
      ctl.uiScale = 1;
      const finger = type => ({ pointerId: 4, pointerType: 'touch', button: 0, clientX: 250, clientY: 250, type,
        shiftKey: false, ctrlKey: false, metaKey: false, preventDefault() {} });
      on.pointerdown(finger('pointerdown'));
      clock.advance(520);
      on.pointerup?.(finger('pointerup'));
    });
    eq('a finger held on a shape on the drawing: the item menu, once', asked.map(a => a[0]), ['Pad']);
    const at = asked[0]?.[1] || {};
    eq('...asked for at the finger, saying it is a finger', [at.clientX, at.clientY, at.pointerType], [250, 250, 'touch']);
    eq('...so it is drawn 12 px off the finger, as the list\'s is', H.menuPlace(at, 200, 282, 1024, 768), { left: 262, top: 262 });
    const short = H.menuPlace({ ...at, clientX: 422, clientY: 157 }, 200, 282, 844, 390);
    ok('...and on a short screen (844x390) not over the finger',
      !(422 >= short.left && 422 <= short.left + 200 && 157 >= short.top && 157 <= short.top + 282), JSON.stringify(short));
  }
  env.controller.readOnly = true;
  calls.length = 0;
  showItemMenu(item, { clientX: 10, clientY: 10 }, { from: 'list' });
  eq('read-only: no item menu, the reason said (as before)', calls, [['status', env.controller.readOnlyReason]]);
  env.window.innerWidth = 390; env.window.innerHeight = 844;
  env.controller.readOnly = false;
  menuEl.offsetHeight = 330;
  showItemMenu(item, { clientX: 300, clientY: 500, pointerType: 'touch' }, { from: 'list' });
  flush();
  const L = parseFloat(menuEl.style.left), T = parseFloat(menuEl.style.top);
  ok('at phone width: on screen, and off the finger',
    L >= 8 && L + 200 <= 382 && T >= 8 && T + 330 <= 836 && !(300 >= L && 300 <= L + 200 && 500 >= T && 500 <= T + 330),
    `${L},${T}`);
}

// ═══ 6. the one-time hint ════════════════════════════════════════════════
log('\n-- 6. the one-time hint --');
{
  const r = panelRig({ project: itemJob(), touch: true, shown: true });
  try {
    const writes = [];
    const ls = globalThis.localStorage;
    globalThis.localStorage = { getItem: () => null, setItem: (k) => writes.push(k), removeItem: () => {} };
    r.panel.refresh();
    eq('touch layout, the list on screen with rows in it: said', r.calls.filter(c => c[0] === 'hint'), [['hint', HOLD_HINT]]);
    eq('...in the user\'s words', HOLD_HINT, 'Hold a heading or a row for its menu');
    r.panel.refresh(); r.panel.maybeHint();
    eq('...once: not again on the next rebuild', r.calls.filter(c => c[0] === 'hint').length, 1);
    eq('...and nothing saved', writes, []);
    globalThis.localStorage = ls;
  } finally { r.restore(); }
  const s = panelRig({ project: itemJob(), touch: false, shown: true });
  try {
    s.panel.refresh();
    eq('the standard layout: not said', s.calls.filter(c => c[0] === 'hint'), []);
    s.state.touch = true;
    s.panel.maybeHint();
    eq('...said once the layout is touch (the app asks when it switches)', s.calls.filter(c => c[0] === 'hint').length, 1);
  } finally { s.restore(); }
  const h = panelRig({ project: itemJob(), touch: true, shown: false });
  try {
    h.panel.refresh();
    eq('the list not on screen (a closed drawer, a tidied panel): not said', h.calls.filter(c => c[0] === 'hint'), []);
    h.state.shown = true;
    h.panel.maybeHint();
    eq('...said when it comes on screen', h.calls.filter(c => c[0] === 'hint').length, 1);
  } finally { h.restore(); }
  const e = panelRig({ touch: true, shown: true });
  try {
    e.panel.refresh();
    e.panel.maybeHint();
    eq('an empty list: not said (nothing to hold)', e.calls.filter(c => c[0] === 'hint'), []);
  } finally { e.restore(); }
  // The host says it later, when the status line is free: it asks again
  // then whether the sentence is still true there.
  const w = panelRig({ project: itemJob(), touch: true, shown: true });
  try {
    w.panel.refresh();
    const when = w.state.when || { still: () => true, dropped: () => {} };
    ok('the hint is asked with a way to ask again whether it is still due',
      typeof w.state.when?.still === 'function' && typeof w.state.when?.dropped === 'function');
    ok('...it is, while the layout is touch and the list on screen', when.still());
    w.state.touch = false;
    ok('...not once the layout went standard', !when.still());
    w.state.touch = true; w.state.shown = false;
    ok('...nor once the drawer shut', !when.still());
    when.dropped();
    w.panel.maybeHint();
    eq('dropped unsaid: not asked again while the list is off screen', w.calls.filter(c => c[0] === 'hint').length, 1);
    w.state.shown = true;
    w.panel.maybeHint();
    eq('...asked again the next time it is due', w.calls.filter(c => c[0] === 'hint').length, 2);
    w.panel.maybeHint();
    eq('...and once only, again', w.calls.filter(c => c[0] === 'hint').length, 2);
  } finally { w.restore(); }
}

// ═══ 7. the forms list this job's names first ════════════════════════════
log('\n-- 7. every Floor and Trade box: this job\'s names first --');
{
  const doc = stubDocument();
  doc.add('div', 'modal');
  const was = globalThis.document;
  globalThis.document = doc;
  const store = {
    0: [{ type: 'area', floor_level: 'Level 10', category: 'Framing' },
      { type: 'area', floor_level: 'Ground', category: ' wood framing' }],
    1: [{ type: 'area', floor_level: 'level 2', category: 'Carpentry' }],
    [-1000]: [{ type: 'standalone', floor_level: 'Level 2', category: '' }],
  };
  D.setClassSource(() => store);
  const wantFloor = ['Ground', 'level 2', 'Level 2', 'Level 10', 'Level 1', 'Level 3', 'Level 4',
    'Roof', 'Basement', 'Foundation', 'Mezzanine', 'Penthouse'];
  const wantCat = ['Carpentry', 'Framing', 'wood framing', 'Concrete', 'Masonry', 'Structural Steel',
    'MEP', 'Electrical', 'Plumbing', 'HVAC', 'Roofing', 'Drywall', 'Flooring', 'Doors & Windows',
    'Insulation', 'Site Work', 'Miscellaneous'];
  eq('the floors: the job\'s (Level 2 before Level 10, a look-alike kept), then stock without them',
    D.classChoices('floor_level'), wantFloor);
  eq('the trades: the job\'s, then stock without "Wood Framing" (the job has it, spelt its way)',
    D.classChoices('category'), wantCat);
  const lists = () => Object.fromEntries(doc.descendants().filter(e => e.tagName === 'DATALIST')
    .map(e => [e.id, e.children.map(o => o.value)]));
  try {
    const forms = [
      ['askItem (Properties of a drawn item)', () => D.askItem({}), ['floorPresets', 'catPresets']],
      ['askSlopeRoof', () => D.askSlopeRoof({ flatArea: 100 }), ['floorPresets2', 'catPresets2']],
      ['askTile', () => D.askTile({ existing: {}, areaFt2: 120, pattern: 'grid', tileWIn: 12, tileHIn: 12,
        groutIn: 0.125, wastePct: 10, tilesPerBox: 0 }), ['floorPresets3', 'catPresets3']],
      ['askCountItem', () => D.askCountItem({}), ['floorPresets4', 'catPresets4']],
      ['askStandalone', () => D.askStandalone(), ['floorPresets5', 'catPresets5']],
      ['a material line (assemblies.js editLine)', () => editLine({ value: 1 }, {}), ['aiFloor', 'aiCat']],
    ];
    for (const [what, open, [fl, ct]] of forms) {
      try {
        open();
        const l = lists();
        eq(`${what}: its Floor box`, l[fl], wantFloor);
        eq(`${what}: its Trade box`, l[ct], wantCat);
      } catch (err) {
        ok(`${what} opens on stand-in elements`, false, err.stack.split('\n').slice(0, 3).join(' | '));
      }
      D.closeAllDialogs();
    }
    store[2] = [{ type: 'area', floor_level: 'Mezz', category: 'Openings' }];
    D.askItem({});
    ok('read when the form opens: a name made since is offered', lists().floorPresets.includes('Mezz'));
    D.closeAllDialogs();
  } finally {
    D.setClassSource(() => ({}));
    globalThis.document = was;
  }
  const dsrc = await readFile(new URL('../js/ui/dialogs.js', import.meta.url), 'utf-8');
  const asrc = await readFile(new URL('../js/ui/assemblies.js', import.meta.url), 'utf-8');
  ok('no Floor or Trade box is left on the stock list alone',
    !/combo\([^)]*(FLOOR_LEVEL_PRESETS|CATEGORY_PRESETS)/.test(dsrc + asrc));
  eq('every combo of a floor or a trade asks classChoices',
    [...(dsrc + asrc).matchAll(/combo\([^\n]*'(floorPresets\d?|catPresets\d?|aiFloor|aiCat)'\)/g)]
      .filter(m => /classChoices\('(floor_level|category)'\)/.test(m[0])).length, 12);
}

// ═══ 8. the wiring, by text ══════════════════════════════════════════════
log('\n-- 8. the wiring --');
{
  const main = (await readFile(new URL('../js/main.js', import.meta.url), 'utf-8')).replace(/\r\n/g, '\n');
  const panelHost = main.slice(main.indexOf('const itemsPanel = new ItemsPanel({'), main.indexOf('const thumbs = new Thumbnails({'));
  ok('the list\'s host: showMenu', panelHost.includes('showMenu: (entries, at) => showMenu(entries, at),'));
  ok('the list\'s host: the one switch, on while editing and the list may write (Round 7)',
    panelHost.includes('canClassifyFromHeadings: () => app.editing && !controller.readOnly,'));
  ok('the list\'s host: the layout, the list on screen, the hint',
    panelHost.includes("touchLayout: () => document.documentElement.dataset.ui === 'touch',")
    && panelHost.includes('listShown: () => itemsListShown(),') && panelHost.includes('hint: (text, when) => sayWhenQuiet(text, when),'));
  ok('...and the item menu as the list\'s, as before',
    panelHost.includes("showItemMenu: (item, ev) => showItemMenu(item, ev, { from: 'list' }),"));
  ok('...both hand the list the menu\'s handle', /\n {2}return showMenu\(entries, ev\);\n\}\n/.test(main)
    && /\n {2}return \{ close: \(\) => \{ if \(menu\.dismiss === dismiss\) closeMenu\(\); \} \};\n\}\n/.test(main));
  ok('a selection made on the drawing is found in the list (highlight_measurement) only where the canvas says so -- '
    + 'otherwise its row is lit (section 2c runs this listener)',
    /controller\.addEventListener\('selection-changed', ev => \{\n(?: {2}\/\/[^\n]*\n)* {2}if \(ev\.detail\.reveal\) itemsPanel\.revealSelection\(ev\.detail\.ids\);\n {2}else itemsPanel\.setSelection\(ev\.detail\.ids\);\n\}\);/.test(main)
    && main.split("addEventListener('selection-changed'").length - 1 === 1);
  eq('the forms read the open job: once, at start-up',
    main.split('D.setClassSource(() => app.project.measurements);').length - 1, 1);
  ok('the hold\'s import is a line of its own after the import list (later rounds\' own lines after it)',
    /\nimport \{ ZoomFloor[^\n]*\} from '\.\/render\/zoom-floor\.js';\nimport \{ menuPlace \} from '\.\/ui\/hold\.js';\n(?:import \{[^}]*\} from '[^']+';\n)*\nconst \$ = /.test(main));
  const fnText = name => { const i = main.indexOf(`\nfunction ${name}(`); return i < 0 ? '' : main.slice(i + 1, main.indexOf('\n}\n', i) + 2); };
  ok('a switch of layout rewords the headings', /itemsPanel\.refresh\(\);/.test(fnText('setUiMode')));
  ok('the hint is asked whenever the list may have come on screen',
    /new MutationObserver\(\(\) => itemsPanel\.maybeHint\(\)\)/.test(main)
    && /shown\.observe\(\$\('itemsPanel'\), \{ attributes: true, attributeFilter: \['class'\] \}\)/.test(main)
    && /shown\.observe\(document\.querySelector\('\.body'\), \{ attributes: true, attributeFilter: \['class'\] \}\)/.test(main)
    && /shown\.observe\(document\.documentElement, \{ attributes: true, attributeFilter: \['data-ui'\] \}\)/.test(main));
  // itemsListShown and sayWhenQuiet, lifted
  const cls = s => ({ contains: c => s.has(c) });
  const st = { mobile: false, panel: new Set(), body: new Set() };
  const shown = new Function('window', '$', 'document', `${fnText('itemsListShown')}\nreturn itemsListShown;`)(
    { matchMedia: () => ({ matches: st.mobile }) },
    () => ({ classList: cls(st.panel) }),
    { querySelector: () => ({ classList: cls(st.body) }) });
  const shownAt = [];
  for (const [mobile, panel, body] of [[false, [], []], [false, [], ['no-items']], [true, [], []], [true, ['mopen'], []], [true, ['mopen'], ['no-items']]]) {
    Object.assign(st, { mobile, panel: new Set(panel), body: new Set(body) });
    shownAt.push(shown());
  }
  eq('the list is on screen: a column not tidied away; a drawer that is open', shownAt, [true, false, false, true, true]);
  const status = { textContent: 'Edit Mode — the takeoff tools are live and changes are saved with the project.' };
  const said = [];
  const tq = [];
  const sayWhenQuiet = new Function('$', 'HINTS', 'controller', 'setStatus', 'setTimeout',
    `${fnText('sayWhenQuiet')}\nreturn sayWhenQuiet;`)(
    () => status, { pan: 'Drag to pan.' }, { mode: 'pan' }, t => { said.push(t); status.textContent = t; },
    (f, ms) => tq.push([f, ms]));
  sayWhenQuiet(HOLD_HINT);
  eq('the hint waits for this turn to finish', [said, tq.map(x => x[1])], [[], [0]]);
  tq.shift()[0]();
  eq('...and for the status line to be quiet: Edit Mode\'s sentence is not wiped', said, []);
  status.textContent = 'Drag to pan.';
  tq.shift()[0]();
  eq('...said once it is (the tool\'s own hint back)', said, [HOLD_HINT]);
  said.length = 0; tq.length = 0;
  status.textContent = 'A sentence that never goes';
  sayWhenQuiet('x');
  for (let i = 0; i < 20 && tq.length; i++) tq.shift()[0]();
  eq('...and said anyway after about twelve seconds', said, ['x']);
  // The panel's own hint through the app's own sayWhenQuiet: the layout goes
  // standard while the status line is busy (Edit Mode's sentence, then the
  // layout's): the hint is not said to a mouse, and it is said once the
  // list is on screen in the touch layout again.
  {
    const r = panelRig({ project: itemJob(), touch: true, shown: true });
    try {
      said.length = 0; tq.length = 0;
      status.textContent = 'Edit Mode — the takeoff tools are live and changes are saved with the project.';
      r.panel.host.hint = (text, when) => { r.calls.push(['hint', text]); sayWhenQuiet(text, when); };
      r.panel.refresh();
      tq.shift()[0]();
      r.state.touch = false;
      status.textContent = 'Standard layout — the desktop proportions.';
      for (let i = 0; i < 6 && tq.length; i++) tq.shift()[0]();
      status.textContent = 'Drag to pan.';
      for (let i = 0; i < 20 && tq.length; i++) tq.shift()[0]();
      eq('the layout went standard before the line was quiet: the hint is not said', said, []);
      r.state.touch = true;
      r.panel.maybeHint();                       // the app asks again: data-ui changed
      for (let i = 0; i < 20 && tq.length; i++) tq.shift()[0]();
      eq('...and back in the touch layout it is, once', said, [HOLD_HINT]);
      r.state.shown = false;
      r.panel.maybeHint(); r.state.shown = true; r.panel.maybeHint();
      for (let i = 0; i < 20 && tq.length; i++) tq.shift()[0]();
      eq('...and never again this session', said, [HOLD_HINT]);
      said.length = 0;
      const d = panelRig({ project: itemJob(), touch: true, shown: true });
      try {
        status.textContent = 'Edit Mode — busy';
        d.panel.host.hint = (text, when) => sayWhenQuiet(text, when);
        d.panel.refresh();
        tq.shift()[0]();
        d.state.shown = false;                   // the phone's drawer shut
        status.textContent = 'Drag to pan.';
        for (let i = 0; i < 20 && tq.length; i++) tq.shift()[0]();
        eq('the drawer shut before the line was quiet: not said with the list off screen', said, []);
        d.state.shown = true;
        d.panel.maybeHint();
        for (let i = 0; i < 20 && tq.length; i++) tq.shift()[0]();
        eq('...said when the drawer opens again', said, [HOLD_HINT]);
      } finally { d.restore(); }
    } finally { r.restore(); }
  }

  const css = (await readFile(new URL('../css/app.css', import.meta.url), 'utf-8')).replace(/\r\n/g, '\n');
  const rule = sel => { const i = css.indexOf(`\n${sel} {`); return i < 0 ? '' : css.slice(i, css.indexOf('}', i)); };
  for (const sel of ['.grp', '.row']) {
    ok(`${sel}: no text selection and no iOS callout under a held finger`,
      /-webkit-user-select: none;/.test(rule(sel)) && /-webkit-touch-callout: none;/.test(rule(sel)) && /user-select: none;/.test(rule(sel)));
  }
  ok('.grp: as tall as the layout says', /min-height: var\(--grp-h\);/.test(rule('.grp')));
  const block = head => { const i = css.indexOf(head); return i < 0 ? '' : css.slice(i, css.indexOf('}', i)); };
  const grpH = b => Number((/--grp-h: (\d+)px;/.exec(b) || [])[1]);
  eq('a heading row: 36 px in the touch layout (and on a coarse pointer with no choice yet), as before in the standard one',
    [grpH(block(':root[data-ui="touch"] {')), grpH(block(':root:not([data-ui]) {')),
      grpH(block(':root[data-ui="standard"] {')), grpH(block(':root {\n  --ctl-h: 0px;'))], [36, 36, 0, 0]);
  {
    // A row is as tall as its text, and a heading as its text or the
    // layout's --grp-h. The tree lines are an <svg height="100%"> in the
    // gutter (items-panel.js gutterEl); in flow, that 100% had no definite
    // height to be taken of -- a row's height is its content's -- so it fell
    // back to the 150 px default of a replaced element with no size, and in
    // Chromium every heading and row was 150 px tall (headless Chrome 156:
    // 150 for every category, sub-category and row, both layouts, 1024x768
    // and 390x844; after: 21/18/38 standard, 36/36/38 touch). Out of flow
    // (absolute, pinned to the gutter, which the row stretches to its own
    // height), it adds nothing to the row, and an absolutely positioned
    // box's percentage height is taken of its containing block's padding
    // box -- always known by then -- so no engine needs the indefinite
    // height resolved.
    const g = rule('.gutter'), gs = rule('.gutter svg');
    ok('.gutter: the box the lines are laid over, stretched to its row (a flex item)',
      /position: relative;/.test(g) && /align-self: stretch;/.test(g), g);
    ok('.gutter svg: out of flow, pinned to the gutter\'s box, as tall as it',
      /position: absolute;/.test(gs) && /top: 0;/.test(gs) && /left: 0;/.test(gs) && /height: 100%;/.test(gs), gs);
    ok('...and no other rule gives the gutter or its svg a position or a height of its own',
      [...css.matchAll(/\n([^{}\n]*\.gutter[^{}\n]*)\{([^}]*)\}/g)]
        .filter(([, sel]) => !['.gutter ', '.gutter svg '].includes(sel))
        .every(([, , body]) => !/(^|[;\s])(position|height|top|bottom)\s*:/.test(body)));
    // ...and the lines are drawn in the row's own terms (percentages), so at
    // any height they join from row to row and elbow at its middle.
    const r = panelRig({ project: itemJob() });
    try {
      r.panel.refresh();
      const drawn = [...r.headings(), ...r.rows()]
        .map(e => e.children.find(c => c.classList.contains('gutter'))?.children.find(c => c.tagName === 'SVG'))
        .filter(Boolean);
      const lines = drawn.flatMap(svg => svg.children.map(l => ['y1', 'y2'].map(k => l.getAttribute(k))));
      ok('every gutter\'s svg is 100% of the gutter, every line runs on percentages (0, 50%, 100%)',
        drawn.length > 10 && drawn.every(svg => svg.getAttribute('height') === '100%')
        && lines.length > drawn.length && lines.every(([a, b]) => ['0', '50%', '100%'].includes(a) && ['50%', '100%'].includes(b)),
        JSON.stringify(lines.slice(0, 6)));
    } finally { r.restore(); }
  }
  {
    // The list still scrolls with a finger. touch-action is decided for the
    // element pressed and every ancestor up to the scrolling list, so NO
    // rule that can match the list or anything in it -- whatever its
    // selector says: an id, a class, a descendant rule, inside an @media --
    // may take the vertical pan away. Every rule of the stylesheet is
    // matched against the list as ItemsPanel renders it, under the
    // ancestors index.html gives it (a matcher that only ever errs towards
    // a match: attributes and pseudo-classes are taken as matching, '>' as
    // any ancestor, a sibling step as anything).
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf-8');
    const chain = [];
    {
      const VOID = new Set(['meta', 'link', 'br', 'img', 'input', 'hr', 'source', 'wbr', 'area', 'base', 'col', 'embed', 'param', 'track']);
      const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g;
      const stack = [];
      for (let m; (m = re.exec(html));) {
        if (!m[2]) continue;
        const tag = m[2].toLowerCase();
        if (m[1]) { const i = stack.map(e => e.tag).lastIndexOf(tag); if (i >= 0) stack.length = i; continue; }
        const attr = k => (new RegExp(`\\s${k}="([^"]*)"`).exec(m[3]) || [])[1] || '';
        const node = { tag, id: attr('id'), classes: attr('class').split(/\s+/).filter(Boolean) };
        if (node.id === 'itemList') { chain.push(...stack, node); break; }
        if (tag === 'script' || tag === 'style') { re.lastIndex = html.indexOf(`</${tag}`, re.lastIndex); continue; }
        if (!VOID.has(tag) && !/\/\s*$/.test(m[3])) stack.push(node);
      }
    }
    ok('index.html: the list and its ancestors found', chain.length > 3 && chain.at(-1).classes.includes('item-list')
      && chain.some(e => e.id === 'itemsPanel'), chain.map(e => e.tag + (e.id ? `#${e.id}` : '')).join(' > '));
    // the list's own elements, as the panel renders them (a job, and an empty one)
    const inside = [];
    for (const project of [itemJob(), null]) {
      const r = panelRig({ project, touch: true });
      try {
        r.panel.refresh();
        const walk = (el, up) => {
          const node = { tag: el.tagName.toLowerCase(), id: el.id || '', classes: el.className.split(/\s+/).filter(Boolean) };
          inside.push([node, up]);
          for (const k of el.children) if (k.tagName && !k.tagName.startsWith('#')) walk(k, [...up, node]);
        };
        for (const k of r.listEl.children) walk(k, chain);
      } finally { r.restore(); }
    }
    inside.unshift([chain.at(-1), chain.slice(0, -1)]);
    ok('...rendered: headings, rows and what is in them', inside.some(([n]) => n.classes.includes('grp'))
      && inside.some(([n]) => n.classes.includes('row')) && inside.length > 40, String(inside.length));
    const rules = [];
    {
      const s = css.replace(/\/\*[\s\S]*?\*\//g, '');
      const stack = [];
      let mark = 0;
      for (let i = 0; i < s.length; i++) {
        if (s[i] === '{') {
          if (stack.length) stack.at(-1).nested = true;
          const pre = s.slice(mark, i);
          stack.push({ prelude: pre.slice(pre.lastIndexOf(';') + 1).trim(), start: i + 1, nested: false });
          mark = i + 1;
        } else if (s[i] === '}') {
          const b = stack.pop();
          if (b && !b.nested && !b.prelude.startsWith('@')) rules.push([b.prelude, s.slice(b.start, i)]);
          mark = i + 1;
        }
      }
    }
    const topSplit = (str, sep) => {
      const out = []; let depth = 0, cur = '';
      for (const ch of str) {
        if (ch === '(' || ch === '[') depth += 1;
        if (ch === ')' || ch === ']') depth -= 1;
        if (depth === 0 && sep(ch)) { out.push(cur); cur = ''; } else cur += ch;
      }
      out.push(cur);
      return out;
    };
    const compound = text => {
      const bare = text.replace(/\[[^\]]*\]/g, '').replace(/::?[\w-]+(\([^)]*\))?/g, '');
      return { tag: (/^[a-zA-Z][\w-]*|^\*/.exec(bare) || [''])[0].toLowerCase().replace('*', ''),
        ids: [...bare.matchAll(/#([\w-]+)/g)].map(x => x[1]), classes: [...bare.matchAll(/\.([\w-]+)/g)].map(x => x[1]) };
    };
    const fits = (c, n) => (!c.tag || c.tag === n.tag) && c.ids.every(i => i === n.id) && c.classes.every(k => n.classes.includes(k));
    const matches = (selector, node, up) => {
      const parts = selector.trim().replace(/\s*([>+~])\s*/g, ' $1 ').split(/\s+/).filter(Boolean);
      let i = parts.length - 1;
      if (!fits(compound(parts[i]), node)) return false;
      let at = up.length;
      for (i -= 1; i >= 0; i -= 1) {
        const p = parts[i];
        if (p === '>' ) continue;
        if (p === '+' || p === '~') { i -= 1; continue; }      // a sibling: anything
        const c = compound(p);
        do { at -= 1; } while (at >= 0 && !fits(c, up[at]));
        if (at < 0) return false;
      }
      return true;
    };
    const blocking = [];
    for (const [prelude, body] of rules) {
      const ta = /(?:^|;)\s*touch-action\s*:\s*([^;]+)/.exec(body);
      if (!ta || /\b(auto|manipulation|pan-y)\b/.test(ta[1])) continue;
      for (const sel of topSplit(prelude, ch => ch === ',')) {
        const hit = inside.find(([n, up]) => matches(sel, n, up));
        if (hit) blocking.push(`${sel.trim()} { touch-action: ${ta[1].trim()} } on ${hit[0].tag}.${hit[0].classes.join('.')}`);
      }
    }
    ok('the stylesheet has rules that take the pan away elsewhere (the sheet, the previews) -- the check sees them',
      rules.filter(([, b]) => /touch-action\s*:\s*none/.test(b)).length >= 3);
    eq('the list still scrolls with a finger: no rule takes the vertical pan from it, its headings, its rows or what is in them',
      blocking, []);
  }
  ok('the menu\'s entries are a fingertip tall in the touch layout', css.includes('.ctx-menu button { min-height: var(--menuitem-h); }'));

  const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf-8');
  ok('the worker precaches both new modules', sw.includes("  'js/core/classify.js',\n") && sw.includes("  'js/ui/hold.js',\n"));
  const mp = await readFile(new URL('./modules-parse.mjs', import.meta.url), 'utf-8');
  ok('both import cleanly in node and are checked to', mp.includes("'core/classify.js'") && mp.includes("'ui/hold.js'"));
  const ra = await readFile(new URL('./run-all.mjs', import.meta.url), 'utf-8');
  const portable = ra.slice(ra.indexOf('const PORTABLE = ['), ra.indexOf('];', ra.indexOf('const PORTABLE = [')));
  const order = [...portable.matchAll(/^\s+'([\w-]+)',/gm)].map(m => m[1]);
  ok('this harness is in the PORTABLE list, mid-list', order.includes('heading-menu')
    && order.indexOf('heading-menu') < order.length - 1, order.join(' '));
  const ctl = await readFile(new URL('../js/tools/controller.js', import.meta.url), 'utf-8');
  ok('the canvas\'s numbers are the ones exported', /export const TAP_SLOP = 11;/.test(ctl) && /export const LONG_PRESS_MS = 500;/.test(ctl));
  const holdSrc = await readFile(new URL('../js/ui/hold.js', import.meta.url), 'utf-8');
  ok('...and the hold\'s are those, imported: one number, not two copies of it',
    holdSrc.includes("import { LONG_PRESS_MS, TAP_SLOP } from '../tools/controller.js';")
    && !/const (LONG_PRESS_MS|TAP_SLOP)\s*=/.test(holdSrc));
  const settings = await readFile(new URL('../js/ui/settings.js', import.meta.url), 'utf-8');
  ok('no setting for the hint (said once a session, never saved)', !/hint/i.test(settings.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '')));
  ok('no look-behind in the new modules (Safari before 16.4 refuses a whole module with one)',
    !/\(\?<[=!]/.test(await readFile(new URL('../js/ui/hold.js', import.meta.url), 'utf-8')
      + await readFile(new URL('../js/core/classify.js', import.meta.url), 'utf-8')));
}

// ═══ 9. live ═════════════════════════════════════════════════════════════
let live = 'skipped: no PTT_DESKTOP_SRC';
if (!(await haveDesktopSource())) {
  log('\n-- 9. live differential SKIPPED (set PTT_DESKTOP_SRC) --');
} else {
  log('\n-- 9. live: the desktop source as it is now --');
  let truth = null;
  try {
    const { stdout } = await run('python', ['-B', path.join(here, 'rename-python-truth.py'), DESKTOP_SRC],
      { maxBuffer: 1 << 26, windowsHide: true });
    truth = JSON.parse(stdout);
  } catch (err) {
    fails += 1;
    log(`FAIL the desktop's heading and name-list members could not be lifted and run:\n${err.stderr || err.message}`);
  }
  if (truth) {
    log(`   (lifted by text: ${Object.entries(truth.lifted).map(([k, v]) => `${k} ${v.length}`).join(', ')}`
      + ` -- module names ${truth.lifted.module.join(', ')})`);
    checkWords(truth, 'live');
    checkMenus(truth, 'live');
    checkTakeoffHeadings(truth, 'live');
    checkChoices(truth, 'live');
    checkValues(truth, 'live');
    checkReveals(truth, 'live');
    ok('the committed tests/data/rename-truth.json is the desktop\'s answer as it is now '
      + `(regenerate: python -B tests/rename-python-truth.py "${DESKTOP_SRC}" --write)`,
    JSON.stringify(truth) === JSON.stringify(SNAP));
    live = 'live differential run';
  }
}

console.log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass -- the Items list's menus open by finger, its headings say what they offer, and the forms list the job's names first, the desktop's way (${live})`);
process.exit(fails ? 1 : 0);
