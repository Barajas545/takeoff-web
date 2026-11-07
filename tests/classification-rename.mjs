// RENAME A HEADING, AND FILE THE ITEMS UNDER A BLANK ONE -- desktop 3.07 on
// the web (Round 7: rename-heading, assign-blank-heading).
//
// A floor level, a category and a sub-category are strings on the items, on
// the material lines that carry their own and on a framed item's hand-added
// lines. Renaming a heading REWRITES them, job-wide, as one undo level, where
// the desktop's classification_plan writes them -- or the desktop's next
// framing recompute undoes it. This holds the web to the desktop's own code,
// lifted by text and closure-checked in tests/rename-python-truth.py (the
// committed tests/data/rename-truth.json on a fresh clone; live when the
// desktop source is here):
//
//  1. The words: the refusals, the lists' own words, _n / _amount, the
//     spelling a look-alike merges into; and _class_norm (casefold) and
//     _class_sort_key (any decimal digit a number), character by character,
//     for every character both Unicode tables assign.
//  2. The plan (classification_plan, _plan_counts): every field, the
//     category and Group scopes, a list two items share, junk -- the same
//     dicts in the same order, the same counts.
//  3. Set (unfiled_items, assign_classification): what is filed, the shapes
//     with it, never a line, never a dict an undo replaced; the counts and
//     exactly the leaves the desktop changes, through a real Project.
//  4. Where new pins are filed (_pin_stock / _pin_files / _pin_filing /
//     _set_pin_filing / _follow_pin_filing): stock, junk records, every kind.
//  5. What the TOOL holds follows (_follow_classification,
//     _class_tool_now / _moved) and goes back with an undo, and forward with
//     a redo, only while it still holds what the rename left
//     (_undo_class_tool).
//  6. What the LIST holds follows (_follow_rename): the floor and group
//     filters, the folded headings -- a merge of two folds, the items on no
//     sheet's.
//  7. THE FLOWS, through the producer: a real ItemsPanel (stand-in
//     elements), its real heading menu entry, the real form
//     (dialogs.js askClassification: the name typed, the choice picked, the
//     real OK and its refusals), a real ToolController and a real Project --
//     against the desktop's _rename_from_header / _assign_from_header on
//     the desktop's own fixture: the rows under the heading, what the list
//     listed, the form's title, label, lists, sentence, notes and refusal,
//     the merge question, the status line, one undo level, EXACTLY the
//     leaves of the saved job that change (nothing else) and every record's
//     keys in the desktop's order, pin_filing, the filters, the folds, the
//     tool and the armed count; then Undo and Redo, each followed by the
//     desktop's refresh (a filter on a name gone falls back to All). Some
//     with the SHEET chip on (the lifted _sheet_rows), names that strip()
//     and trim() part on, a key the rename adds. Then CHAINS of steps across
//     Undo and Redo, and the declared page-order divergence (below).
//  8. The undo level: changeCount moves on a rename, its Undo and its Redo;
//     tagTool only on the newest level; a booking still rides its own level.
//  9. The file: pin_filing, an unknown key, in_group and group_item_id
//     survive a web save and an open; a window or door pin placed after a
//     rename (and after its undo, and its redo) is filed where the job says.
// 10. The switch: Rename / Set offered while editing, and the tooltip says
//     so, in both layouts; nothing in View Only or on an older drawing, or
//     on NOT ON A SHEET; a menu chosen after the gate closed writes nothing.
// 10b. Between the steps (the web's menu and form are not modal): a fold
//     he changed since the rename is his on Undo and Redo; a menu left up
//     across an Undo, a Redo, a delete or a page turn (the SHEET chip on:
//     the next sheet's rows under the same heading) files the rows it
//     NAMED, found again by _uid, never by the heading's place; a menu from
//     the last job writes nothing in the next; a Set that finds nothing says
//     so; Enter accepts the form, which opens on its first choice; a
//     heading is the plan's own string; the touch layout's field and
//     button sizes.
// 11. The wiring, by text: main.js's host and router, the controller's pins,
//     project.js's tag above tagBooking, run-all.
// 12. Live: the desktop source as it is now, when it is here.
//
// The web's own, on purpose, each checked: the status line says '— Undo
// puts it back' (decision 1); no Report preset sentence (decision 3); no
// Group-only scope (decision 4); ONE Undo also puts back the folded headings
// (the desktop's Ctrl+Z leaves them renamed) -- each only while the new
// heading is still folded as the rename left it; a Set's filter that
// followed the items onto the new name goes back onto the blank heading
// with an Undo and forward again with a Redo (the desktop's Ctrl+Z leaves
// the list filtered to the new name, which its refresh drops to All Floors
// (All Groups) wherever no row carries that name any more, and its Ctrl+Y
// leaves it there); the web keeps no last category, so the tool's category
// is never moved (the desktop's would be); and a merge into one of two
// look-alike spellings picks the one met first in PAGE order, the order the
// web holds and saves a job's sheets in -- where a file the desktop wrote
// keeps the order its sheets were first drawn on, and can pick the other
// (never on a file the web saved). Not ported: a sort-key part made only of
// digits that are not decimal ('²', '①') makes the desktop's int() raise;
// the web sorts it as text.
//
// Run: node tests/classification-rename.mjs
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { DATA, DESKTOP_SRC, haveDesktopSource } from './config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);

const C = await import('../js/core/classify.js');
const { ItemsPanel, FLOOR_LEVEL_PRESETS, CATEGORY_PRESETS, SOLO_KEY, SHEET_FOLLOW_MS } = await import('../js/ui/items-panel.js');
const D = await import('../js/ui/dialogs.js');
const { Project } = await import('../js/core/project.js');
const { ToolController } = await import('../js/tools/controller.js');
const { openProject, writeProject } = await import('../js/core/takeoff-file.js');

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
const clone = v => JSON.parse(JSON.stringify(v));

// ═══ stand-in elements (as tests/heading-menu.mjs's) ═════════════════════
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
    this.checked = false;
    this.type = '';
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
  get firstChild() { return this.children[0] || null; }
  appendChild(c) {
    if (c.tagName === '#FRAGMENT') { for (const k of [...c.children]) this.appendChild(k); return c; }
    c.remove(); c.parentNode = this; this.children.push(c); return c;
  }
  append(...cs) { for (const c of cs) this.appendChild(typeof c === 'string' ? this.ownerDocument.createTextNode(c) : c); }
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
  focus() { this.ownerDocument.activeElement = this; }
  blur() {}
  select() {}
  getBoundingClientRect() { return { left: 0, top: 0, right: 200, bottom: 90, width: 200, height: 90 }; }
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
  doc.getElementById = id => doc.descendants().find(e => e.id === id) || null;
  doc.add = (tag, id) => { const e = doc.createElement(tag); e.id = id; return doc.body.appendChild(e); };
  const fire = (node, ev, capture) => {
    for (const l of [...node._l]) {
      if (ev._halt) return;
      if (l.t === ev.type && l.capture === capture) { ev.currentTarget = node; l.fn.call(node, ev); }
    }
  };
  doc.dispatch = (target, type, extra = {}) => {
    const route = [];
    for (let x = target; x; x = x.parentNode) route.push(x);
    if (route[route.length - 1] !== doc) route.push(doc);
    const ev = {
      type, target, button: 0, defaultPrevented: false, _stop: false, _halt: false, ...extra,
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

// ═══ the desktop's shapes, the web's ═════════════════════════════════════
const storeOf = pairs => Object.fromEntries(clone(pairs).map(([pg, lst]) => [String(pg), lst]));
const fileStore = p => clone(p.buildSaveMetadata().measurements);

/** Where every dict a plan can name sits (the truth script's index). */
function indexOf(store) {
  const ix = new Map();
  const set = (d, pth) => { if (!ix.has(d)) ix.set(d, pth); };
  for (const [pg, lst] of Object.entries(store)) {
    (Array.isArray(lst) ? lst : []).forEach((m, i) => {
      if (!m || typeof m !== 'object' || Array.isArray(m)) return;
      set(m, [Number(pg), i]);
      (Array.isArray(m.associated_items) ? m.associated_items : []).forEach((ai, j) => {
        if (!ai || typeof ai !== 'object' || Array.isArray(ai)) return;
        set(ai, [Number(pg), i, 'associated_items', j]);
        const fs = ai.framing_spec;
        if (fs && typeof fs === 'object' && !Array.isArray(fs)) set(fs, [Number(pg), i, 'associated_items', j, 'framing_spec']);
      });
      const ex = m.framing && m.framing.params && m.framing.params._extras;
      (Array.isArray(ex) ? ex : []).forEach((sp, j) => {
        if (sp && typeof sp === 'object' && !Array.isArray(sp)) set(sp, [Number(pg), i, 'framing', 'params', '_extras', j]);
      });
    });
  }
  return ix;
}
const planPaths = (store, plan) => { const ix = indexOf(store); return plan.map(([d, k, kind]) => [ix.get(d) ?? null, k, kind]); };

const MISSING = '<missing>';
/** The truth script's leaf_diff: every leaf where two stores differ. */
function leafDiff(a, b, pth = []) {
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  if (isObj(a) && isObj(b)) {
    const out = [];
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      if (!(k in a) || !(k in b)) out.push([[...pth, k], k in a ? a[k] : MISSING, k in b ? b[k] : MISSING]);
      else out.push(...leafDiff(a[k], b[k], [...pth, k]));
    }
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    return a.flatMap((x, i) => leafDiff(x, b[i], [...pth, i]));
  }
  return JSON.stringify(a) === JSON.stringify(b) ? [] : [[pth, a, b]];
}

const WEB_NAME = { _lastFloor: '_last_floor', _lastSub: '_last_sub', _lastCategory: '_last_category',
  floorFilter: '_floor_filter', groupFilter: '_group_filter' };
/** A web move in the desktop's words: who holds it, by the desktop's name. */
function deskMove(mv, { tool = null, panel = null } = {}) {
  const [where, holder, name, was, now] = mv;
  const who = holder == null ? null : holder === tool ? 'tool' : holder === panel ? 'panel'
    : where === 'spec' ? 'spec' : null;
  return [where, who, where === 'spec' || where === 'pin' ? name : (WEB_NAME[name] || name), was, now];
}
const undoWords = s => s.replace('— Ctrl+Z puts it back', C.UNDO_WORDS);

// ═══ 1. the words ════════════════════════════════════════════════════════
function checkWords(truth, where) {
  const w = truth.rename.words;
  eq(`${where}: the lists' own words`, C.CLASS_RESERVED, w.reserved);
  eq(`${where}: the framing engine's trades`, C.ENGINE_CATEGORIES, w.engine);
  for (const [s, why] of w.problems) eq(`${where}: is ${JSON.stringify(s)} a name? (_class_name_problem)`, C.classNameProblem(s), why);
  for (const [n, word, txt] of w.n) eq(`${where}: _n(${n}, ${word})`, C.nOf(n, word), txt);
  for (const [counts, txt] of w.amount) eq(`${where}: _amount(${JSON.stringify(counts)})`, C.amountWords(counts), txt);
  const store = storeOf(truth.rename.fixtures.build);
  for (const [field, nu, old, cat, want] of w.spelling) {
    eq(`${where}: the spelling ${JSON.stringify(nu)} merges into (${field}, not ${old}, under ${cat})`,
      C.existingSpelling(store, field, nu, old, cat), want);
  }
}

// ═══ 2. the plan ═════════════════════════════════════════════════════════
function oddStore(build) {
  // The truth script's: a line two items share, junk in the lists, a bare extra.
  const s = storeOf(build);
  const shared = { name: 'Shared', floor_level: 'Level 1', category: 'Walls' };
  s['0'][0].associated_items.push(shared);
  s['0'][1].associated_items = [shared, null, 'junk', 7];
  s['1'].push('junk');
  s['1'].push(null);
  s['2'][1].framing.params._extras.push(null);
  s['2'][1].framing.params._extras.push({ id: 'e9', name: 'Bare' });
  return s;
}
function checkPlans(truth, where) {
  let n = 0;
  for (const c of truth.rename.plans) {
    const store = c.odd ? oddStore(truth.rename.fixtures.build) : storeOf(truth.rename.fixtures.build);
    const plan = C.classificationPlan(store, c.field, c.old, c.scope);
    const tag = `${where}: plan ${c.field} ${JSON.stringify(c.old)} ${JSON.stringify(c.scope)}${c.odd ? ' (odd store)' : ''}`;
    if (!eq(`${tag}: the places`, planPaths(store, plan), c.plan)) continue;
    eq(`${tag}: the counts`, C.planCounts(plan), c.counts);
    n += 1;
  }
  log(`   ${n} of ${truth.rename.plans.length} plans equal, place for place`);
}

// ═══ 3. Set ══════════════════════════════════════════════════════════════
const PICKS = {
  'the blank rows': s => [s['0'][3], s['0'][4], s['1'][2]],
  'a run of one (its master is what is filed)': s => [s['2'][3]],
  'a row twice, a filed one, a note': s => [s['0'][3], s['0'][3], s['0'][0], s['0'][6]],
  'a row from before an undo': s => [structuredClone(s['0'][3]), s['0'][4]],
  'the Group container, filed': s => [s['-1000'][1]],
  nothing: () => [],
};
function jobOf(pairs, meta = {}) {
  const p = new Project();
  p.loadFrom({ metadata: { page_labels: ['X1.0', 'X2.0', 'X3.0'], ...clone(meta) }, annotations: {},
    measurements: storeOf(pairs), pageCount: 3 });
  return p;
}
function checkAssign(truth, where) {
  const fx = truth.rename.fixtures.build;
  for (const c of truth.rename.assign.filter(x => x.unfiled)) {
    const store = storeOf(fx);
    const ix = indexOf(store);
    eq(`${where}: unfiled_items(${c.field})`, C.unfiledItems(store, c.field).map(m => ix.get(m)), c.unfiled);
  }
  for (const c of truth.rename.assign.filter(x => x.label)) {
    const p = jobOf(fx);
    const items = PICKS[c.label](p.measurements);
    const ix = indexOf(p.measurements);
    const tag = `${where}: Set ${c.field} ${JSON.stringify(c.value)} on ${c.label}`;
    eq(`${tag}: the items asked about`, items.map(m => ix.get(m) ?? null), c.items);
    const levels = p._undo.length;
    const got = C.assignClassification(p, c.field, c.value, items);
    eq(`${tag}: the counts`, got, c.counts);
    eq(`${tag}: exactly the leaves the desktop changes`, leafDiff(storeOf(fx), fileStore(p)), c.changes);
    eq(`${tag}: undo levels`, p._undo.length - levels, c.levels);
  }
}

// ═══ 4. pins ═════════════════════════════════════════════════════════════
function checkPins(truth, where) {
  for (const c of truth.rename.pins) {
    if (c.label === 'no window') {
      eq(`${where}: no job to keep it in: nothing recorded`, C.setPinFiling(null, 'window', ['X', null]), c.set);
      eq(`${where}: ...and stock is where pins go`, C.pinFiling(null, 'window'), c.filing);
      continue;
    }
    const tag = `${where}: pins, ${c.label}`;
    eq(`${tag}: stock`, Object.fromEntries(Object.keys(c.stock).map(k => [k, C.pinStock(k)])), c.stock);
    eq(`${tag}: what the job files elsewhere`, C.pinFiles(clone(c.meta)), c.files);
    eq(`${tag}: where each kind goes`, Object.fromEntries(Object.keys(c.filing).map(k => [k, C.pinFiling(clone(c.meta), k)])), c.filing);
    for (const s of c.sets) {
      const m = clone(c.meta);
      eq(`${tag}: set ${s.kind} -> ${JSON.stringify(s.filing)}`, [C.setPinFiling(m, s.kind, s.filing), m], [s.ok, s.meta]);
    }
    for (const f of c.follows) {
      const m = clone(c.meta);
      const moves = C.followPinFiling(m, f.field, f.old, f.new, f.scope);
      eq(`${tag}: ${f.field} ${f.old} -> ${f.new} ${JSON.stringify(f.scope)}`, [moves.map(mv => deskMove(mv)), m], [f.moves, f.meta]);
    }
  }
}

// ═══ 5. the tool ═════════════════════════════════════════════════════════
function checkTool(truth, where) {
  for (const c of truth.rename.tool) {
    const tool = { _lastFloor: c.start.floor || '', _lastSub: c.start.sub || '', countSpec: clone(c.start.spec ?? null) };
    const tag = `${where}: the tool (${c.state}) on ${c.field} ${c.old} -> ${c.new} ${JSON.stringify(c.scope)}`;
    const moves = C.followTool(tool, c.field, c.old, c.new, c.scope);
    eq(`${tag}: what moved`, moves.map(mv => deskMove(mv, { tool })), c.moves);
    eq(`${tag}: where it stands`, [tool._lastFloor, tool._lastSub, tool.countSpec], c.after);
    const back = new Set();
    C.applyClassTool({ tag: { moves }, direction: 'undo', applied: back }, () => true, { countSpec: () => tool.countSpec });
    const undone = moves.filter(mv => back.has(mv));
    eq(`${tag}: undone`, [tool._lastFloor, tool._lastSub, tool.countSpec, undone.map(mv => deskMove(mv, { tool }))], c.undone);
    const fwd = new Set();
    C.applyClassTool({ tag: { moves: undone }, direction: 'redo', applied: fwd }, () => true, { countSpec: () => tool.countSpec });
    eq(`${tag}: redone`, [tool._lastFloor, tool._lastSub, tool.countSpec,
      undone.filter(mv => fwd.has(mv)).map(mv => deskMove(mv, { tool }))], c.redone);
  }
}

// ═══ 6. the list ═════════════════════════════════════════════════════════
function checkFollow(truth, where) {
  for (const c of truth.rename.follow) {
    const st = { floorFilter: c.start.floor, groupFilter: c.start.group, collapsed: new Set(c.start.collapsed) };
    const set = st.collapsed;
    C.followRename(st, c.field, c.old, c.new, c.scope);
    eq(`${where}: the list (${c.state}) on ${c.field} ${c.old} -> ${c.new} ${JSON.stringify(c.scope)}`,
      [st.floorFilter, st.groupFilter, [...st.collapsed].sort()], [c.floor, c.group, c.collapsed]);
    ok(`${where}: ...the folds rewritten in place (the list's own set)`, st.collapsed === set);
  }
}

// ═══ 7. the flows, through the producer ══════════════════════════════════
const mainText = (await readFile(new URL('../js/main.js', import.meta.url), 'utf-8')).replace(/\r\n/g, '\n');
const fnText = name => { const i = mainText.indexOf(`\nfunction ${name}(`); return i < 0 ? '' : mainText.slice(i + 1, mainText.indexOf('\n}\n', i) + 2); };

/** The form on screen, answered the way he answers it: the choice picked,
 *  the name typed, the real OK -- and Cancel when OK refused. */
function answerForm(doc, opts, st) {
  const promise = D.askClassification(opts);
  const modal = doc.getElementById('modal');
  const layer = modal.children[modal.children.length - 1];
  const inputs = layer.querySelectorAll('input');
  const name = inputs.find(i => i.type === 'text');
  const radios = inputs.filter(i => i.type === 'radio');
  const info = {
    title: layer.querySelector('.dlg-head').textContent,
    label: layer.querySelector('.cls-label').textContent,
    current: name.value,
    own: opts.own, rest: opts.rest,
    shown: layer.querySelectorAll('option').map(o => o.value),
    opts: radios.map(r => r.parentNode.textContent),
    notes: layer.querySelectorAll('.cls-note').map(n => n.textContent),
    what: layer.querySelector('.cls-what').textContent,
  };
  st.forms.push(info);
  const click = cls => doc.dispatch(layer.querySelectorAll('button').find(b => b.classList.contains(cls)
    || (cls === 'cancel' && !b.classList.contains('primary'))), 'click');
  const a = st.answer;
  if (a.name === undefined || a.name === null) { click('cancel'); return promise; }
  if (a.opt !== undefined) {
    const i = (opts.options || []).findIndex(o => o[1] === a.opt);
    radios.forEach((r, j) => { r.checked = j === i; });
    if (radios[i]) doc.dispatch(radios[i], 'change');
    info.what_opt = layer.querySelector('.cls-what').textContent;
  }
  name.value = a.name;
  click('primary');
  const err = layer.querySelector('.cls-err');
  info.err = err.hidden ? '' : err.textContent;
  if (!err.hidden) click('cancel');
  return promise;
}

function rig({ pairs, meta = {}, panel: ps = {}, tool = {} }) {
  const doc = stubDocument();
  globalThis.document = doc;
  doc.add('div', 'modal');
  const p = jobOf(pairs, meta);
  const ctl = new ToolController({ canvas: { addEventListener() {}, setPointerCapture() {}, style: {} },
    viewport: { zoom: 1 }, project: p, currentPage: () => 0, host: {} });
  ctl._lastFloor = tool.floor || '';
  ctl._lastSub = tool.sub || '';
  if (tool.spec) ctl.armCount(null, clone(tool.spec));
  const st = { classify: true, readOnly: false, touch: false, answer: {}, merge: 'No', pending: null,
    said: [], asked: [], forms: [] };
  let panel = null;
  // main.js's own router, lifted by text, over the panel.
  const route = new Function('itemsPanel', `${fnText('classifyFromHeading')}\nreturn classifyFromHeading;`)({
    renameFromHeader: m => { st.pending = panel.renameFromHeader(m); return st.pending; },
    assignFromHeader: (m, r) => { st.pending = panel.assignFromHeader(m, r); return st.pending; },
  });
  const host = {
    pageLabel: i => `X${i + 1}.0`,
    readOnly: () => st.readOnly,
    canClassifyFromHeadings: () => st.classify,
    touchLayout: () => st.touch,
    listShown: () => true,
    hint() {},
    showMenu: () => ({ close() {} }),
    showItemMenu: () => ({ close() {} }),
    say: t => st.said.push(t),
    classifyFromHeading: (act, m, rows) => route(act, m, rows),
    askClassification: opts => answerForm(doc, opts, st),
    askYesNo: (title, text) => { st.asked.push([title, text]); return Promise.resolve(st.merge === 'Yes'); },
    followTool: (f, o, n, s) => C.followTool(ctl, f, o, n, s),
  };
  panel = new ItemsPanel({
    root: doc.body, listEl: doc.add('div', 'itemList'), floorFilterEl: doc.add('select', 'floorFilter'),
    groupFilterEl: doc.add('select', 'groupFilter'), costToggleEl: null, footEl: doc.add('div', 'itemsFoot'),
    project: p, host,
  });
  // main.js: every 'items-changed' rebuilds the list.
  p.addEventListener('items-changed', () => panel.refresh());
  panel.costFilter = ps.cost || 'all';
  panel.floorFilter = ps.floor ?? null;
  panel.groupFilter = ps.group ?? null;
  for (const k of ps.collapsed || []) panel.collapsed.add(k);
  if (ps.sheet !== undefined && ps.sheet !== null) {
    // The SHEET chip on, the sheet's own drawing on screen.
    host.view = () => ({ page: ps.sheet, revId: '', revPage: null, coming: false });
    panel.sheetChip = true;
  }
  panel.refresh();
  return { doc, p, ctl, panel, st };
}

/** The truth script's items_order: where a dict's keys are not, IN ORDER,
 *  the same dict's keys before -- a key added, dropped or moved -- which
 *  leafDiff (keys sorted) cannot see. Inside every sheet's list. */
function keyOrder(a, b, pth = []) {
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const out = [];
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) out.push([pth, kb]);
    for (const k of kb) if (k in a) out.push(...keyOrder(a[k], b[k], [...pth, k]));
  } else if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    a.forEach((x, i) => out.push(...keyOrder(x, b[i], [...pth, i])));
  }
  return out;
}
const itemsOrder = (a, b) => Object.keys(b).filter(pg => pg in a).flatMap(pg => keyOrder(a[pg], b[pg], [pg]));

/** A filter the step moved, as the desktop's undo leaves it: a Set's
 *  followed filter is on no undo level of the desktop's, so its Ctrl+Z
 *  leaves the filter on the new name -- and its refresh drops it to All
 *  where no row carries that name any more. `values` are the filter's
 *  values after the undo (the list's own options). */
function deskUndoneFilter(moves, panel, name, start, values) {
  const mv = moves.find(m => m[0] === 'attr' && m[1] === panel && m[2] === name);
  if (!mv) return start;
  return values.includes(mv[4]) ? mv[4] : null;
}
const optionValues = sel => sel.children.map(o => o.value).filter(v => v !== '\x00ALL');

const panelNow = panel => ({ floor: panel.floorFilter, group: panel.groupFilter, collapsed: [...panel.collapsed].sort() });
const toolNow = ctl => ({ floor: ctl._lastFloor ?? '', sub: ctl._lastSub ?? '', spec: ctl.countSpec ?? null });
const metaNow = p => (p.metadata.pin_filing === undefined ? {} : { pin_filing: p.metadata.pin_filing });
const actMeta = act => ({ type: act.type, fl: act.fl ?? '', cat: act.cat ?? null, sub: act.sub ?? null });

async function checkFlows(truth, where) {
  const fixtures = truth.rename.fixtures;
  let n = 0;
  for (const f of truth.rename.flows) {
    const tag = `${where}: ${f.label}`;
    const pairs = fixtures[f.start.fixture];
    const r = rig({ pairs, meta: f.start.meta, panel: f.start.panel, tool: f.start.tool });
    const { p, ctl, panel, st } = r;
    const fixture = storeOf(pairs);
    eq(`${tag}: the web opens and saves the fixture changing nothing`, leafDiff(fixture, fileStore(p)), []);
    eq(`${tag}: the panel starts where the desktop's does`, panelNow(panel), {
      floor: f.start.panel.floor, group: f.start.panel.group, collapsed: f.start.panel.collapsed });
    const ix = indexOf(p.measurements);
    const meta = actMeta(f.act);
    eq(`${tag}: the rows under the heading (_rows_under)`, C.rowsUnder(panel._tree, meta).map(m => ix.get(m)), f.rowsUnder);
    eq(`${tag}: what the list listed (_listed_ids, a Group container among them)`,
      [...panel._listedIds].map(m => ix.get(m)).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1)), f.listed);
    st.answer = f.answer;
    st.merge = f.merge;
    const levels0 = p._undo.length;
    const cc0 = p.changeCount;
    const entry = panel._headerEntries(meta).find(e => e !== '-' && !['Collapse all', 'Expand all'].includes(e.label));
    if (!ok(`${tag}: the heading's menu offers its act`, !!entry)) continue;
    entry.run();
    await st.pending;
    const dlg = f.dialog[0];
    const form = st.forms[0];
    if (!ok(`${tag}: one form`, st.forms.length === 1 && f.dialog.length === 1, JSON.stringify(st.forms))) continue;
    const keys = ['title', 'label', 'current', 'own', 'rest', 'opts', 'notes', 'what', 'what_opt', 'err'];
    eq(`${tag}: the form (ClassificationDialog)`, Object.fromEntries(keys.filter(k => k in dlg).map(k => [k, form[k]])),
      Object.fromEntries(keys.filter(k => k in dlg).map(k => [k, dlg[k]])));
    eq(`${tag}: ...its name box lists the job's names first, then the stock list`, form.shown, [...dlg.own, ...dlg.rest]);
    eq(`${tag}: the merge question`, st.asked, f.asked);
    eq(`${tag}: the status line ('— Undo puts it back')`, st.said, f.said.map(undoWords));
    eq(`${tag}: undo levels`, p._undo.length - levels0, f.levels);
    eq(`${tag}: exactly the leaves the desktop changes, and nothing else`, leafDiff(fixture, fileStore(p)), f.after.changes);
    eq(`${tag}: ...and every record's keys in the desktop's order (a key it adds lands where the desktop's does)`,
      itemsOrder(fixture, fileStore(p)), f.after.order);
    eq(`${tag}: where new pins go`, metaNow(p), f.after.meta);
    eq(`${tag}: the list`, panelNow(panel), f.after.panel);
    eq(`${tag}: the tool`, toolNow(ctl), f.after.tool);
    if (!f.levels) {
      eq(`${tag}: nothing written, nothing counted as a change`, p.changeCount, cc0);
      n += 1;
      continue;
    }
    ok(`${tag}: the change is counted (changeCount)`, p.changeCount > cc0);
    const t = p.undoTop.tool || { moves: [], pins: [] };
    const webMoves = t.moves.filter(mv => mv[0] !== 'fold');
    const mine = mv => mv[1] === ctl || mv[0] === 'spec';
    const assigned = f.act.kind === 'assign';
    // The desktop's order: the tool's, where pins go, the list's. (A Set's
    // filter that followed the items is the web's own, on its level.)
    const fromWeb = [...webMoves.filter(mine), ...(t.pins || []), ...webMoves.filter(mv => !mine(mv))]
      .map(mv => deskMove(mv, { tool: ctl, panel }));
    const extra = assigned ? fromWeb.filter(mv => mv[1] === 'panel') : [];
    eq(`${tag}: what the rename moved (its undo level's tag)`, fromWeb.filter(mv => !extra.includes(mv)), f.moves);
    // A renamed fold is ONE move, [old key, new key, the new one folded
    // already]: what it toggles is the old key off and, unless it was folded
    // already, the new one on -- the desktop's start and end, key by key.
    const folds = t.moves.filter(mv => mv[0] === 'fold');
    ok(`${tag}: ...each renamed fold one move, both its halves`, folds.every(mv => mv[1] === panel.collapsed
      && typeof mv[2] === 'string' && typeof mv[3] === 'string' && typeof mv[4] === 'boolean'), JSON.stringify(folds));
    eq(`${tag}: ...and the folds it moved (the web's: one Undo puts them back)`,
      folds.flatMap(mv => [[mv[2], true, false], ...(mv[4] ? [] : [[mv[3], false, true]])])
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
      [...new Set([...f.start.panel.collapsed, ...f.after.panel.collapsed])].sort()
        .filter(k => f.start.panel.collapsed.includes(k) !== f.after.panel.collapsed.includes(k))
        .map(k => [k, f.start.panel.collapsed.includes(k), f.after.panel.collapsed.includes(k)]));
    if (f.between) {
      if ('floor' in f.between) ctl._lastFloor = f.between.floor;
      if ('spec' in f.between) ctl.armCount(null, clone(f.between.spec));
    }
    const cc1 = p.changeCount;
    p.undo();
    ok(`${tag}: its Undo is counted as a change`, p.changeCount > cc1);
    eq(`${tag}: Undo: the job exactly as it was`, leafDiff(fixture, fileStore(p)), f.undone.changes);
    eq(`${tag}: Undo: ...every key back where it was`, itemsOrder(fixture, fileStore(p)), f.undone.order);
    eq(`${tag}: Undo: where new pins go`, metaNow(p), f.undone.meta);
    eq(`${tag}: Undo: the tool`, toolNow(ctl), f.undone.tool);
    // The desktop leaves the folds renamed (the web's own: one Undo puts
    // them back). A rename's filters go back on both. A Set's filter that
    // followed the items is on no undo level of the desktop's: its Ctrl+Z
    // leaves the list filtered to the new name, and where no row carries
    // that name any more its refresh drops it to All Floors (All Groups);
    // the web puts it back on the blank heading.
    if (!assigned) {
      eq(`${tag}: Undo: the filters, the desktop's`, [panel.floorFilter, panel.groupFilter],
        [f.undone.panel.floor, f.undone.panel.group]);
    } else {
      eq(`${tag}: Undo: the desktop's filters are the declared ones (left on the new name, or All where it is gone)`,
        [f.undone.panel.floor, f.undone.panel.group],
        [deskUndoneFilter(t.moves, panel, 'floorFilter', f.start.panel.floor, optionValues(panel.floorFilterEl)),
          deskUndoneFilter(t.moves, panel, 'groupFilter', f.start.panel.group, optionValues(panel.groupFilterEl))]);
    }
    eq(`${tag}: Undo: the list as it was before the step (the web's, with the folds)`, panelNow(panel),
      { floor: f.start.panel.floor, group: f.start.panel.group, collapsed: f.start.panel.collapsed });
    const cc2 = p.changeCount;
    p.redo();
    ok(`${tag}: its Redo is counted as a change`, p.changeCount > cc2);
    eq(`${tag}: Redo: the job`, leafDiff(fixture, fileStore(p)), f.redone.changes);
    eq(`${tag}: Redo: ...and its keys, in order`, itemsOrder(fixture, fileStore(p)), f.redone.order);
    eq(`${tag}: Redo: where new pins go`, metaNow(p), f.redone.meta);
    eq(`${tag}: Redo: the tool`, toolNow(ctl), f.redone.tool);
    if (!assigned) {
      eq(`${tag}: Redo: the list`, panelNow(panel), f.redone.panel);
    } else {
      // The web's Redo moves a followed filter forward again; the desktop's
      // Ctrl+Y leaves it where its Ctrl+Z left it.
      eq(`${tag}: Redo: the list, the web's (forward again, as the step left it)`, panelNow(panel), f.after.panel);
      eq(`${tag}: Redo: ...the desktop's filters where its Ctrl+Z left them`,
        [f.redone.panel.floor, f.redone.panel.group], [f.undone.panel.floor, f.undone.panel.group]);
    }
    p.undo();
    eq(`${tag}: a second Undo, the same as the first`, [leafDiff(fixture, fileStore(p)), toolNow(ctl), metaNow(p)],
      [f.undone.changes, f.undone.tool, f.undone.meta]);
    n += 1;
  }
  log(`   ${n} of ${truth.rename.flows.length} flows the desktop's, step for step`);
}

/** Several steps one after the other -- Renames and Sets through the real
 *  menu and form, then Undo and Redo across them -- against the desktop's
 *  state after each (r7_chain). */
async function checkChains(truth, where) {
  let n = 0;
  for (const c of truth.rename.chains) {
    const pairs = truth.rename.fixtures[c.fixture];
    const r = rig({ pairs, panel: c.start.panel, tool: c.start.tool });
    const { p, ctl, panel, st } = r;
    const fixture = storeOf(pairs);
    let good = true;
    for (const [i, { step, state }] of c.steps.entries()) {
      const tag = `${where}: ${c.label}: step ${i + 1} (${step.do}${step.answer ? ` ${JSON.stringify(step.answer.name)}` : ''})`;
      st.said = [];
      st.forms = [];
      st.asked = [];
      if (step.do === 'undo') p.undo();
      else if (step.do === 'redo') p.redo();
      else if (step.do === 'filter') {
        // He picks a floor in the list's filter: the select's own change.
        panel.floorFilterEl.value = step.floor;
        r.doc.dispatch(panel.floorFilterEl, 'change');
      } else {
        st.answer = step.answer;
        st.merge = step.merge || 'No';
        const entry = panel._headerEntries(actMeta(step.act))
          .find(e => e !== '-' && !['Collapse all', 'Expand all'].includes(e.label));
        if (!ok(`${tag}: the heading's menu offers its act`, !!entry)) { good = false; break; }
        entry.run();
        await st.pending;
      }
      good = eq(`${tag}: the job`, leafDiff(fixture, fileStore(p)), state.changes) && good;
      good = eq(`${tag}: ...its keys, in order`, itemsOrder(fixture, fileStore(p)), state.order) && good;
      good = eq(`${tag}: where new pins go, the tool, the filters`,
        [metaNow(p), toolNow(ctl), panel.floorFilter, panel.groupFilter],
        [state.meta, state.tool, state.panel.floor, state.panel.group]) && good;
      good = eq(`${tag}: what is said, the undo and redo levels`, [st.said, p._undo.length, p._redo.length],
        [state.said.map(undoWords), state.levels, state.redos]) && good;
    }
    if (good) n += 1;
  }
  log(`   ${n} of ${truth.rename.chains.length} chains the desktop's, step for step`);
}

/** The declared divergence: a merge into one of two look-alikes picks the
 *  one met first, and the web meets a job's sheets in page order -- the
 *  order it saves them in -- where a file the desktop wrote keeps the
 *  order its sheets were first drawn on (r7_page_order). */
function checkPageOrder(truth, where) {
  const po = truth.rename.page_order;
  const flow = truth.rename.flows.find(f => f.start.fixture === 'order');
  const web = storeOf(truth.rename.fixtures.order);
  eq(`${where}: the web holds the sheets in page order, whatever the file's order`,
    Object.keys(storeOf(po.pages.map(pg => [pg, []]))), [...po.pages].sort((a, b) => Number(a) - Number(b)));
  eq(`${where}: ...so its names and look-alike are the desktop's on that order`,
    [C.projectValues(web, 'floor_level'), C.existingSpelling(web, 'floor_level', 'LEVEL 2', 'Level 1')],
    [po.values.web, po.spelling.web]);
  ok(`${where}: ...which on a file the desktop wrote with page ${po.pages[0]} first is the other spelling (declared)`,
    JSON.stringify(po.values.file) !== JSON.stringify(po.values.web) && po.spelling.file !== po.spelling.web
    && JSON.stringify(po.after) !== JSON.stringify(flow.after.changes), JSON.stringify(po));
}

/** The desktop's _class_norm and _class_sort_key, character by character,
 *  for every character both Unicode tables assign (r7_text). */
function checkText(truth, where) {
  const T = truth.rename.text;
  const hexes = s => (s ? s.split('.').map(h => String.fromCodePoint(parseInt(h, 16))).join('') : '');
  const fold = new Map(T.fold.split(' ').filter(Boolean).map(e => {
    const [cp, to] = e.split(':');
    return [parseInt(cp, 16), hexes(to)];
  }));
  const digits = new Map(T.digits.split(' ').filter(Boolean).map(e => e.split(':')).map(([cp, v]) => [parseInt(cp, 16), BigInt(v)]));
  const raises = new Set(T.raises.split(' ').filter(Boolean).map(h => parseInt(h, 16)));
  const known = /\P{Cn}/u;
  let seen = 0;
  const badFold = [];
  const badKey = [];
  for (const r of T.assigned.split(' ')) {
    const [a, b] = r.split('-').map(h => parseInt(h, 16));
    for (let cp = a; cp <= b; cp++) {
      const c = String.fromCodePoint(cp);
      if (!known.test(c)) continue;               // a character this engine's table does not have yet
      seen += 1;
      const want = fold.has(cp) ? fold.get(cp) : c;
      if (C.classNorm(c) !== want) badFold.push([cp.toString(16), C.classNorm(c), want]);
      if (raises.has(cp)) continue;               // the desktop's int() raises: no key to compare
      const k = C.classSortKey(c);
      const wantKey = digits.has(cp) ? [[0, digits.get(cp), '']] : want ? [[1, 0n, want]] : [];
      if (k.length !== wantKey.length || k.some((x, i) => x[0] !== wantKey[i][0] || x[1] !== wantKey[i][1] || x[2] !== wantKey[i][2])) {
        badKey.push([cp.toString(16), String(k), String(wantKey)]);
      }
    }
  }
  ok(`${where}: casefold(), character by character (${seen} characters both tables know, Unicode ${T.unicode})`,
    !badFold.length, JSON.stringify(badFold.slice(0, 12)));
  ok(`${where}: the sort key's digits and text, character by character (any decimal digit is a number)`,
    !badKey.length, JSON.stringify(badKey.slice(0, 12)));
  eq(`${where}: names in the desktop's order (_class_sort_key)`, [...T.names].sort(C.cmpSortKey), T.sorted);
  const same = [];
  T.names.forEach((a, i) => { for (const b of T.names.slice(i + 1)) if (C.classNorm(a) === C.classNorm(b)) same.push([a, b]); });
  eq(`${where}: the same name to him (_class_norm)`, same, T.same);
}

function runSections(truth, where) {
  log(`\n-- 1. the words == the desktop's (${where}) --`);
  checkWords(truth, where);
  checkText(truth, where);
  log(`\n-- 2. the plan == classification_plan (${where}) --`);
  checkPlans(truth, where);
  log(`\n-- 3. Set == unfiled_items + assign_classification (${where}) --`);
  checkAssign(truth, where);
  log(`\n-- 4. where new pins go == _pin_filing and friends (${where}) --`);
  checkPins(truth, where);
  log(`\n-- 5. the tool follows, and goes back == _follow_classification / _undo_class_tool (${where}) --`);
  checkTool(truth, where);
  log(`\n-- 6. the list follows == _follow_rename (${where}) --`);
  checkFollow(truth, where);
}

runSections(SNAP, 'snapshot');
log('\n-- 7. the flows: the real list, form, tool and job == _rename_from_header / _assign_from_header --');
await checkFlows(SNAP, 'snapshot');
await checkChains(SNAP, 'snapshot');
checkPageOrder(SNAP, 'snapshot');

// ═══ 8. the undo level ═══════════════════════════════════════════════════
log('\n-- 8. the undo level --');
{
  const p = jobOf(SNAP.rename.fixtures.build);
  const level0 = p.undoTop;
  ok('tagTool refuses a level that is not the newest', !p.tagTool({}, { kind: 'class_tool', moves: [] }));
  ok('...and no level at all', !p.tagTool(null, { kind: 'class_tool', moves: [] }) && level0 === null);
  // A takeoff's level with a booking, then a rename: each tag rides its own
  // level and its own way back.
  p.transact('Area', () => { p.measurements['0'].push({ type: 'area', name: 'Fresh', floor_level: 'Level 1',
    category: 'Concrete', points: [[1, 1], [5, 1], [5, 5]], value: 1, visible: true, sort_order: 5000 }); });
  const booking = { kind: 'first', page: 0, was: '', now: 'r-x' };
  ok('a booking still hangs on its takeoff\'s level', p.tagBooking(p.undoTop, booking));
  const takeoffLevel = p.undoTop;
  const holder = { floorFilter: 'Level 1' };
  const counts = C.renameClassification(p, 'floor_level', 'Level 1', '1st Floor', null,
    { also: [['attr', holder, 'floorFilter', 'Level 1', '1st Floor']] });
  holder.floorFilter = '1st Floor';
  ok('the rename is one level of its own, above the takeoff\'s', p._undo.length === 2 && p._undo[0] === takeoffLevel
    && !!p.undoTop.tool && !p.undoTop.booking && p._undo[0].booking === booking && !p._undo[0].tool, JSON.stringify(counts));
  eq('...its tag: what moved, the rename itself', [p.undoTop.tool.kind, p.undoTop.tool.moves.length, p.undoTop.tool.rename.slice(0, 3)],
    ['class_tool', 1, ['floor_level', 'Level 1', '1st Floor']]);
  const seen = [];
  const off = ev => seen.push([ev.detail.direction, ev.detail.tag.kind]);
  p.addEventListener('class-tool', off);
  p.addEventListener('class-tool', ev => C.applyClassTool(ev.detail, mv => mv[1] === holder));
  p.undo();
  eq('Undo of the rename says class-tool once, and the holder is put back', [seen, holder.floorFilter],
    [[['undo', 'class_tool']], 'Level 1']);
  ok('...the redo level carries the tool tag, not a booking', !!p._redo.at(-1).tool && !p._redo.at(-1).booking
    && p._redo.at(-1).tool.moves.length === 1);
  p.undo();
  ok('Undo of the takeoff: its booking rides the redo level, and no tool tag is said',
    p._redo.at(-1).booking === booking && !p._redo.at(-1).tool && seen.length === 1);
  p.redo();
  ok('Redo of the takeoff: the booking back on its level', p.undoTop.booking === booking && !p.undoTop.tool);
  p.redo();
  eq('Redo of the rename: forward again', [seen.at(-1), holder.floorFilter], [['redo', 'class_tool'], '1st Floor']);
  // A move he changed since is his: Undo leaves it, and the way back holds
  // only what did go back.
  holder.floorFilter = 'Level 3';
  p.undo();
  ok('a value changed since the rename is left as he chose it', holder.floorFilter === 'Level 3'
    && p._redo.at(-1).tool && p._redo.at(-1).tool.moves.length === 0 && !!p._redo.at(-1).tool.rename);
  // The armed count's answers go back only while they are still the ones
  // armed: a count armed since is his (desktop: holder is not _count_spec).
  {
    const q = jobOf(SNAP.rename.fixtures.build);
    const ctl = new ToolController({ canvas: { addEventListener() {}, setPointerCapture() {}, style: {} },
      viewport: { zoom: 1 }, project: q, currentPage: () => 0, host: {} });
    ctl.armCount(null, { name: 'Switches', floor_level: 'Level 1', category: 'Electrical', sub_category: '' });
    const first = ctl.countSpec;
    C.renameClassification(q, 'floor_level', 'Level 1', '1st Floor', null,
      { followTool: (f, o, n, s) => C.followTool(ctl, f, o, n, s) });
    eq('the armed count follows the rename', first.floor_level, '1st Floor');
    ctl.armCount(null, { name: 'Outlets', floor_level: '1st Floor', category: 'Electrical', sub_category: '' });
    const second = ctl.countSpec;
    q.undo();
    eq('Undo: the answers armed since are his, and the ones the rename moved are no longer armed',
      [second.floor_level, first.floor_level, ctl.countSpec === second], ['1st Floor', '1st Floor', true]);
    ok('...and nothing went back, so the way forward carries nothing', q._redo.at(-1).tool.moves.length === 0);
  }
  // refused and empty renames push nothing
  const n0 = p._undo.length;
  eq('a reserved name is refused (null), nothing pushed',
    [C.renameClassification(p, 'floor_level', 'Level 1', 'All Floors'), p._undo.length], [null, n0]);
  eq('the same name, or a name nothing has, changes nothing ({})',
    [C.renameClassification(p, 'floor_level', 'Level 1', ' Level 1 '),
      C.renameClassification(p, 'floor_level', 'Nowhere', 'Somewhere'),
      C.renameClassification(p, 'nonsense', 'Level 1', 'X'), p._undo.length], [{}, {}, null, n0]);
  eq('Set refuses a list\'s own word and files nothing already filed',
    [C.assignClassification(p, 'floor_level', 'No Floor Level', [p.measurements['0'][3]]),
      C.assignClassification(p, 'floor_level', 'Level 9', [p.measurements['0'][0]]), p._undo.length], [null, {}, n0]);
}

// ═══ 9. the file ═════════════════════════════════════════════════════════
log('\n-- 9. the file: pin_filing and every other key survive a save and an open; new pins read it --');
{
  const pageBytes = i => new Uint8Array([0x50, 0x41, 0x47, 0x45, i]);
  const save = p => writeProject({ metadata: p.buildSaveMetadata(),
    pageSources: Array.from({ length: p.pageCount }, (_, i) => ({ kind: 'raw', data: pageBytes(i) })),
    revisionSources: [] });
  const open = async blob => {
    const o = await openProject(blob);
    const p = new Project();
    p.loadFrom({ metadata: o.metadata, annotations: o.annotations, measurements: o.measurements,
      pageCount: o.pageCount, revisionCounts: o.revisions.map(s => s.length) });
    return p;
  };
  const pairs = clone(SNAP.rename.fixtures.pins);
  pairs[0][1][0].zz_unknown_item_key = { kept: [1, 2] };
  const p = jobOf(pairs, { zz_unknown_meta: { a: 1 }, project_name: 'Synthetic job' });
  const ctl = new ToolController({ canvas: { addEventListener() {}, setPointerCapture() {}, style: {} },
    viewport: { zoom: 1 }, project: p, currentPage: () => 0, host: {} });
  ctl._lastFloor = 'Level 1';
  ctl._lastSub = '';
  const before = p.buildSaveMetadata();
  ctl._addOpeningPin('door', [300, 120]);
  const pin = () => p.measurements['0'].at(-1);
  eq('a door pin before any rename: stock', [pin().type, pin().category, pin().floor_level], ['door', 'Doors & Windows', 'Level 1']);
  p.undo();
  C.renameClassification(p, 'category', 'Doors & Windows', 'Openings', null,
    { followTool: (f, o, n, s) => C.followTool(ctl, f, o, n, s) });
  eq('the rename records where windows and doors go', p.metadata.pin_filing,
    { window: { category: 'Openings' }, door: { category: 'Openings' } });
  const after = p.buildSaveMetadata();
  const strip = m => { const o = { ...m }; for (const k of ['measurements', 'annotations', 'project_modified', 'pin_filing']) delete o[k]; return o; };
  eq('every other metadata key is as it was', strip(after), strip(before));
  ok('...the unknown one too', JSON.stringify(after.zz_unknown_meta) === '{"a":1}');
  const changed = leafDiff(before.measurements, after.measurements);
  ok('only floor levels, categories and sub-categories changed in the store',
    changed.length > 0 && changed.every(([pth]) => C.CLASS_FIELDS.includes(pth.at(-1))), JSON.stringify(changed.slice(0, 3)));
  ctl._addOpeningPin('door', [340, 120]);
  ctl._addOpeningPin('window', [380, 120]);
  eq('a door and a window placed after the rename go under Openings',
    p.measurements['0'].slice(-2).map(m => [m.type, m.category]), [['door', 'Openings'], ['window', 'Openings']]);
  const reopened = await open(await save(p));
  eq('pin_filing survives a web save and an open', reopened.metadata.pin_filing, p.metadata.pin_filing);
  eq('...and the unknown metadata key', reopened.metadata.zz_unknown_meta, { a: 1 });
  const ro = reopened.measurements;
  ok('...an unknown item key, in_group and group_item_id', JSON.stringify(ro['0'][0].zz_unknown_item_key) === '{"kept":[1,2]}'
    && ro['2'][0].in_group === 'gi-garage' && ro['-1000'][1].group_item_id === 'gi-garage');
  const c2 = new ToolController({ canvas: { addEventListener() {}, setPointerCapture() {}, style: {} },
    viewport: { zoom: 1 }, project: reopened, currentPage: () => 1, host: {} });
  c2._addOpeningPin('door', [10, 10]);
  eq('a door placed on the job opened again: Openings', reopened.measurements['1'].at(-1).category, 'Openings');
  // Undo the two pins, then the rename: stock again; Redo all three:
  // Openings again; then Undo back past the rename and place a door.
  p.undo(); p.undo(); p.undo();
  ok('the rename undone: no key', p.metadata.pin_filing === undefined, JSON.stringify(p.metadata.pin_filing));
  eq('...windows and doors go under stock', [C.pinFiling(p.metadata, 'window'), C.pinFiling(p.metadata, 'door')],
    [['Doors & Windows', null], ['Doors & Windows', null]]);
  p.redo(); p.redo(); p.redo();
  ctl._addOpeningPin('window', [460, 120]);
  eq('...and after its Redo, a window: Openings', pin().category, 'Openings');
  p.undo(); p.undo(); p.undo(); p.undo();
  ctl._addOpeningPin('door', [420, 120]);
  eq('a door placed after the rename was undone: Doors & Windows', pin().category, 'Doors & Windows');
  // Back on stock removes the key, and a save carries none.
  p.undo();
  C.renameClassification(p, 'category', 'Doors & Windows', 'Openings');
  C.renameClassification(p, 'category', 'Openings', 'Doors & Windows');
  ok('renamed back to stock: the key goes', p.metadata.pin_filing === undefined);
  const back = await open(await save(p));
  ok('...and a save carries none', back.metadata.pin_filing === undefined);
  // Partition and header records are kept, as the desktop reads them.
  const q = jobOf(clone(SNAP.rename.fixtures.pins));
  C.renameClassification(q, 'category', 'Wood Framing', 'Framing Labor');
  C.renameClassification(q, 'sub_category', 'Partitions', 'Interior Walls', { category: 'Framing Labor' });
  const q2 = await open(await save(q));
  eq('partition and header records written and kept, though the web places neither', q2.metadata.pin_filing, {
    partition: { category: 'Framing Labor', sub_category: 'Interior Walls' },
    header: { category: 'Framing Labor', sub_category: 'Headers' } });
}

// ═══ 10. the switch ══════════════════════════════════════════════════════
log('\n-- 10. the switch: what the menu offers, and the tooltip promises, when --');
{
  const r = rig({ pairs: SNAP.rename.fixtures.build });
  const { panel, st, doc, p } = r;
  const entryLabels = meta => panel._headerEntries(meta).filter(e => e !== '-').map(e => e.label);
  const headings = () => panel.listEl.children.filter(e => e.classList.contains('grp'));
  const L1 = { type: 'floor', fl: 'Level 1', cat: null, sub: null };
  const NOFL = { type: 'floor', fl: '', cat: null, sub: null };
  eq('editing: a named floor offers Rename floor level…', entryLabels(L1), ['Rename floor level…', 'Collapse all', 'Expand all']);
  eq('...NO FLOOR LEVEL offers Set for the items listed under it', entryLabels(NOFL),
    ['Set floor level for these 3 items…', 'Collapse all', 'Expand all']);
  eq('...a category and a sub-category', [entryLabels({ type: 'cat', fl: 'Level 1', cat: 'Walls', sub: null })[0],
    entryLabels({ type: 'sub', fl: 'Level 1', cat: 'Walls', sub: 'Exterior' })[0],
    entryLabels({ type: 'cat', fl: '', cat: '', sub: null })[0]],
  ['Rename category…', 'Rename sub-category…', 'Set category for this item…']);
  const tipOf = text => headings().find(h => h.textContent.includes(text))?.title;
  eq('the tooltips promise exactly that (mouse)', [tipOf('LEVEL 1'), tipOf('NO FLOOR LEVEL')],
    ['Click to collapse / expand  •  Right-click to rename', 'Click to collapse / expand  •  Right-click to set a floor level']);
  st.touch = true;
  panel.refresh();
  eq('...and in a finger\'s words (touch)', [tipOf('LEVEL 1'), tipOf('NO FLOOR LEVEL')],
    ['Tap to collapse / expand  •  Hold to rename', 'Tap to collapse / expand  •  Hold to set a floor level']);
  // Every heading the list renders: its tooltip's clause is its menu's entry.
  for (const touch of [false, true]) {
    st.touch = touch;
    panel.refresh();
    for (const h of headings()) {
      const tip = h.title;
      ok(`every heading's tooltip names a rename / set exactly when its menu has one (${touch ? 'touch' : 'mouse'}): ${h.textContent}`,
        /(Right-click|Hold) to (rename|set a )/.test(tip), tip);
    }
  }
  st.touch = false;
  // A menu built while editing, chosen after the gate closed (a version
  // flip): it writes nothing and asks nothing.
  const menu = panel._headerEntries(L1);
  st.readOnly = true;
  panel.refresh();
  eq('read-only (View Only, an older drawing): Collapse all and Expand all only', entryLabels(L1), ['Collapse all', 'Expand all']);
  ok('...and no tooltip offers a write', headings().every(h => !/rename|set a/.test(h.title)));
  st.answer = { name: '1st Floor' };
  const lv = p._undo.length;
  menu[0].run();
  await st.pending;
  ok('a Rename chosen from a menu built before the gate closed writes nothing and asks nothing',
    p._undo.length === lv && st.forms.length === 0);
  // The gate closes while the form is up: nothing is written.
  st.readOnly = false;
  panel.refresh();
  const realAsk = panel.host.askClassification;
  // (the form is answered OK by the time it returns; the gate closes then)
  panel.host.askClassification = opts => { const pr = realAsk(opts); st.readOnly = true; return pr; };
  panel._headerEntries(L1)[0].run();
  await st.pending;
  ok('the gate closed while the form was up: nothing written', p._undo.length === lv && st.forms.length === 1);
  // ...and the same for Set on NO FLOOR LEVEL.
  st.readOnly = false;
  panel.refresh();
  st.answer = { name: 'Level 3' };
  panel._headerEntries(NOFL)[0].run();
  await st.pending;
  ok('a Set answered after the gate closed: nothing written', p._undo.length === lv && st.forms.length === 2
    && p.measurements['0'][3].floor_level === '', JSON.stringify(p.measurements['0'][3].floor_level));
  st.answer = { name: '1st Floor' };
  panel.host.askClassification = realAsk;
  st.readOnly = false;
  // Another job came in while the form was up: nothing written into it.
  st.forms.length = 0;
  panel.host.askClassification = opts => { const pr = realAsk(opts); p.emit('reset'); return pr; };
  panel._headerEntries(L1)[0].run();
  await st.pending;
  ok('another job came in while the form was up: nothing written', p._undo.length === lv);
  panel.host.askClassification = realAsk;
  st.classify = false;
  panel.refresh();
  eq('the switch off: Collapse all and Expand all only', entryLabels(L1), ['Collapse all', 'Expand all']);
  st.classify = true;
  // NOT ON A SHEET (the SHEET chip on): the heading offers nothing.
  const S = { type: 'floor', fl: C.SOLO, cat: null, sub: null };
  eq('NOT ON A SHEET offers nothing to write', entryLabels(S), ['Collapse all', 'Expand all']);
  panel.host.view = () => ({ page: 0, revId: '', revPage: null, coming: false });
  panel.sheetChip = true;
  panel.collapsed.delete(SOLO_KEY);
  panel.refresh();
  const solo = headings().find(h => h.textContent.includes('NOT ON A SHEET'));
  ok('...its tooltip says only collapse / expand', !!solo && solo.title === 'Click to collapse / expand', solo && solo.title);
  // One sheet lists the Group a row drawn on it is in (desktop _sheet_rows):
  // the rename form counts that container as listed, and not otherwise.
  const garage = p.measurements['-1000'].find(m => m.type === 'group');
  ok('one sheet with no row of the Group drawn on it: the container is not listed', !panel._listedIds.has(garage));
  panel.host.view = () => ({ page: 2, revId: '', revPage: null, coming: false });
  panel.refresh();
  ok('...the sheet that has one: it is', panel._listedIds.has(garage));
  panel.sheetChip = false;
  panel.refresh();
  ok('...the chip off: listed whenever the filters let it through', panel._listedIds.has(garage));
  void doc;
}

// ═══ 10b. between the steps ══════════════════════════════════════════════
log('\n-- 10b. between the steps: folds he changed since, a menu left up across an Undo, the form\'s keys, a heading\'s own string --');
{
  const L = fl => ({ type: 'floor', fl, cat: null, sub: null });
  const act = async (r, meta, answer, merge = 'No') => {
    r.st.answer = answer;
    r.st.merge = merge;
    const e = r.panel._headerEntries(meta).find(x => x !== '-' && !['Collapse all', 'Expand all'].includes(x.label));
    if (!e) return false;
    e.run();
    await r.st.pending;
    return true;
  };
  const folded = r => [...r.panel.collapsed].sort();
  const heading = (r, text) => r.panel.listEl.children.find(e => e.classList.contains('grp') && e.textContent.includes(text));
  const expandAll = r => r.panel._headerEntries(L('Level 2')).find(e => e.label === 'Expand all').run();
  const build = SNAP.rename.fixtures.build;

  // A renamed fold is one move, both halves: Undo folds the old heading
  // again only while the new one is still folded as the rename left it.
  {
    const r = rig({ pairs: build, panel: { collapsed: ['fl\x00Level 1'] } });
    await act(r, L('Level 1'), { name: 'Ground' });
    eq('a folded heading renamed: its fold follows it', folded(r), ['fl\x00Ground']);
    expandAll(r);
    r.p.undo();
    eq('...Expand all since, then Undo: LEVEL 1 comes back open (his Expand all wins)', folded(r), []);
    r.p.redo();
    eq('...and Redo folds nothing either', folded(r), []);
  }
  {
    const r = rig({ pairs: build, panel: { collapsed: ['fl\x00Level 2'] } });
    await act(r, L('Level 2'), { name: 'Upper' });
    r.doc.dispatch(heading(r, 'UPPER'), 'click');
    eq('a tap opens the renamed heading', folded(r), []);
    r.p.undo();
    const h = heading(r, 'LEVEL 2');
    ok('...then Undo: LEVEL 2 stays open, as he left it', folded(r).length === 0 && !!h && h.textContent.startsWith('▾'),
      `${JSON.stringify(folded(r))} ${h && h.textContent}`);
  }
  {
    const r = rig({ pairs: build, panel: { collapsed: ['fl\x00Level 2', 'cat\x00Level 2\x00Framing'] } });
    await act(r, L('Level 2'), { name: 'Upper' });
    eq('two folds renamed with their floor', folded(r), ['cat\x00Upper\x00Framing', 'fl\x00Upper']);
    r.p.undo();
    eq('...Undo with nothing changed since: both back on the old name', folded(r), ['cat\x00Level 2\x00Framing', 'fl\x00Level 2']);
    r.p.redo();
    eq('...Redo: forward again', folded(r), ['cat\x00Upper\x00Framing', 'fl\x00Upper']);
    r.p.undo();
    r.doc.dispatch(heading(r, 'LEVEL 2'), 'click');
    r.p.redo();
    eq('...a heading he opened between Undo and Redo stays open; the fold he left goes forward',
      folded(r), ['cat\x00Upper\x00Framing']);
  }
  {
    const r = rig({ pairs: build, panel: { collapsed: ['fl\x00level 2', 'fl\x00Level 2'] } });
    await act(r, L('level 2'), { name: 'LEVEL  2 ' }, 'Yes');
    eq('a merge of two folded headings: one fold, the one there', folded(r), ['fl\x00Level 2']);
    eq('...one move: the old key into the new one, which was folded already',
      r.p.undoTop.tool.moves.filter(m => m[0] === 'fold').map(m => m.slice(2)), [['fl\x00level 2', 'fl\x00Level 2', true]]);
    r.p.undo();
    eq('...Undo with nothing changed: both folded again', folded(r), ['fl\x00Level 2', 'fl\x00level 2']);
    r.p.redo();
    r.doc.dispatch(heading(r, 'LEVEL 2'), 'click');
    r.p.undo();
    eq('...the merged heading opened since, then Undo: neither folds again', folded(r), []);
  }
  {
    const r = rig({ pairs: build, panel: { collapsed: ['fl\x00Level 1'] } });
    await act(r, L('Level 1'), { name: 'Ground' });
    await act(r, L('Ground'), { name: 'Main' });
    const seen = [folded(r)];
    for (const step of ['undo', 'undo', 'redo', 'redo']) { r.p[step](); seen.push(folded(r)); }
    eq('two renames of a folded heading, then Undo, Undo, Redo, Redo: the fold rides every step', seen,
      [['fl\x00Main'], ['fl\x00Ground'], ['fl\x00Level 1'], ['fl\x00Ground'], ['fl\x00Main']]);
  }

  // A menu left up across an Undo: the web's menu is not modal, and an Undo
  // puts a copy of every item. Its Set finds its rows again when chosen --
  // in the copies, by _uid.
  {
    const r = rig({ pairs: build });
    await act(r, L('Level 1'), { name: 'Level 11' });
    const menu = r.panel._headerEntries(L(''));
    eq('NO FLOOR LEVEL\'s menu, opened after a rename', menu[0].label, 'Set floor level for these 3 items…');
    r.p.undo();
    const levels = r.p._undo.length;
    r.st.answer = { name: 'Level 5' };
    r.st.said = [];
    r.st.forms = [];
    menu[0].run();
    await r.st.pending;
    const s = r.p.measurements;
    eq('...an Undo with the menu up, then its Set: the rows it named are filed (the copies the Undo put)',
      [s['0'][3].floor_level, s['0'][4].floor_level, s['1'][2].floor_level, s['2'][3].floor_level],
      ['Level 5', 'Level 5', 'Level 5', 'Level 5']);
    eq('...one undo level, and it is said', [r.p._undo.length - levels, r.st.said],
      [1, ['Filed 3 items under the floor level \'Level 5\' — Undo puts it back']]);
    eq('...and the form offered no choice: the rows listed are the job\'s', r.st.forms[0].opts, []);
  }
  {
    const r = rig({ pairs: build });
    await act(r, L('Level 1'), { name: 'Level 11' });
    const real = r.panel.host.askClassification;
    r.panel.host.askClassification = opts => { const pr = real(opts); r.p.undo(); return pr; };
    r.st.said = [];
    await act(r, L(''), { name: 'Level 5' });
    r.panel.host.askClassification = real;
    eq('a Set answered after an Undo put copies of its rows: nothing filed, no level -- and he is told',
      [r.p._undo.length, r.st.said, r.p.measurements['0'][3].floor_level],
      [0, ['Nothing is listed under NO FLOOR LEVEL any more'], '']);
  }

  // The rows a Set files are the rows its menu NAMED, found again by who
  // they are (_uid: an Undo's copies keep it), never by where the heading
  // sits in a list rebuilt since: a page turn (PageDown, an arrow, a
  // version step) does not close the web's menu, and with the SHEET chip on
  // it rebuilds the list for the next sheet under it.
  const floors = (r, ...names) => names.flatMap(n => [...r.p.allItems()].filter(([, m]) => m.name === n)
    .map(([pg, m]) => [pg, m.floor_level]));
  const setRun = async (r, menu, answer) => {
    r.st.answer = answer;
    r.st.said = [];
    r.st.forms = [];
    r.st.pending = null;
    menu[0].run();
    await r.st.pending;
  };
  const turn = async (r, view) => {
    r.panel.host.view = () => ({ revId: '', revPage: null, coming: false, ...view });
    r.panel.onSheetShown();
    await new Promise(res => setTimeout(res, SHEET_FOLLOW_MS + 60));
  };
  {
    const r = rig({ pairs: build, panel: { sheet: 0 } });
    const menu = r.panel._headerEntries(L(''));
    eq('the SHEET chip on X1.0: NO FLOOR LEVEL\'s menu names Patio and Roof',
      [menu[0].label, C.rowsUnder(r.panel._tree, L('')).map(m => m.name)],
      ['Set floor level for these 2 items…', ['Patio', 'Roof']]);
    await turn(r, { page: 1 });
    eq('...a page turn with the menu up rebuilds the list under it for X2.0',
      [r.panel._sheetKey, C.rowsUnder(r.panel._tree, L('')).map(m => m.name)], ['1||', ['Outlets']]);
    const levels = r.p._undo.length;
    await setRun(r, menu, { name: 'Level 5' });
    eq('...then its Set: it files the items the menu NAMED (Roof with its shape on X3.0), never X2.0\'s Outlets',
      floors(r, 'Patio', 'Roof', 'Outlets'), [[0, 'Level 5'], [0, 'Level 5'], [2, 'Level 5'], [1, '']]);
    eq('...the form counts them, one undo level, and the line says so',
      [r.st.forms[0] && r.st.forms[0].what, r.p._undo.length - levels, r.st.said],
      ['Sets the floor level of 2 items. The list is filtered, so only the items it is showing are included. '
        + '1 of them has shapes on more than one sheet — a floor level belongs to the whole item, so every shape gets it.',
      1, ['Filed 2 items under the floor level \'Level 5\' — Undo puts it back']]);
  }
  {
    const r = rig({ pairs: build, panel: { sheet: 0 } });
    const menu = r.panel._headerEntries(L(''));
    // The next sheet still decoding: the list says 'Opening X2.0…' and
    // lists no heading at all.
    r.panel.host.view = () => ({ page: 1, revId: '', revPage: null, coming: true });
    r.panel.refresh();
    eq('a turn onto a sheet still opening, the menu up: the list lists nothing yet', [r.panel._opening, r.panel._tree.size], [true, 0]);
    await setRun(r, menu, { name: 'Level 5' });
    eq('...its Set still files the items the menu named -- not \'Nothing is listed\'',
      [floors(r, 'Patio', 'Roof', 'Outlets'), r.st.said],
      [[[0, 'Level 5'], [0, 'Level 5'], [2, 'Level 5'], [1, '']], ['Filed 2 items under the floor level \'Level 5\' — Undo puts it back']]);
  }
  {
    // Undo with the menu up (the chip off) can put MORE rows under the
    // heading than the menu named: only the named ones are filed -- and the
    // form offers the rest as the whole-job choice, as the desktop's does.
    const r = rig({ pairs: build, panel: { sheet: 1 } });
    await act(r, L(''), { name: 'Level 5' });
    eq('the chip on X2.0: Outlets filed', floors(r, 'Outlets'), [[1, 'Level 5']]);
    r.panel.sheetChip = false;
    r.panel.refresh();
    const menu = r.panel._headerEntries(L(''));
    eq('...the chip off: NO FLOOR LEVEL\'s menu names Patio and Roof', menu[0].label, 'Set floor level for these 2 items…');
    r.p.undo();
    eq('...an Undo with the menu up puts Outlets back under it', C.rowsUnder(r.panel._tree, L('')).map(m => m.name), ['Patio', 'Roof', 'Outlets']);
    await setRun(r, menu, { name: 'Level 7' });
    eq('...then its Set files the two it named, not the three listed now',
      [floors(r, 'Patio', 'Roof', 'Outlets'), r.st.said],
      [[[0, 'Level 7'], [0, 'Level 7'], [2, 'Level 7'], [1, '']], ['Filed 2 items under the floor level \'Level 7\' — Undo puts it back']]);
    eq('...and its form offered the whole job as the other choice', r.st.forms[0].opts,
      ['The 2 items listed under NO FLOOR LEVEL', 'Every item in the job with no floor level (3)']);
  }
  {
    // A Redo with the menu up files one it named: that one is not blank any
    // more, and is left as it is.
    const r = rig({ pairs: build, panel: { sheet: 1 } });
    await act(r, L(''), { name: 'Level 5' });
    r.p.undo();
    r.panel.sheetChip = false;
    r.panel.refresh();
    const menu = r.panel._headerEntries(L(''));
    eq('a menu naming three', menu[0].label, 'Set floor level for these 3 items…');
    r.p.redo();
    await setRun(r, menu, { name: 'Level 7' });
    eq('...a Redo with it up files Outlets: its Set files the two still blank, and leaves Outlets on Level 5',
      [floors(r, 'Patio', 'Roof', 'Outlets'), r.st.said],
      [[[0, 'Level 7'], [0, 'Level 7'], [2, 'Level 7'], [1, 'Level 5']], ['Filed 2 items under the floor level \'Level 7\' — Undo puts it back']]);
  }
  {
    // Deleted with the menu up: what is left of what it named, and when
    // nothing is, he is told -- nothing filed.
    const r = rig({ pairs: build, panel: { sheet: 0 } });
    const menu = r.panel._headerEntries(L(''));
    const uid = n => [...r.p.allItems()].find(([, m]) => m.name === n && !m.group_child)[1]._uid;
    r.p.removeItems([uid('Patio')]);
    await setRun(r, menu, { name: 'Level 5' });
    eq('a named item deleted with the menu up: the one left is filed',
      [floors(r, 'Patio', 'Roof', 'Outlets'), r.st.said],
      [[[0, 'Level 5'], [2, 'Level 5'], [1, '']], ['Filed 1 item under the floor level \'Level 5\' — Undo puts it back']]);
    const r2 = rig({ pairs: build, panel: { sheet: 0 } });
    const menu2 = r2.panel._headerEntries(L(''));
    const uid2 = n => [...r2.p.allItems()].find(([, m]) => m.name === n && !m.group_child)[1]._uid;
    r2.p.removeItems([uid2('Patio'), uid2('Roof')]);
    await turn(r2, { page: 1 });
    const levels = r2.p._undo.length;
    await setRun(r2, menu2, { name: 'Level 5' });
    eq('...both deleted, a turn onto X2.0: nothing filed (not X2.0\'s Outlets), no level, and he is told',
      [floors(r2, 'Outlets'), r2.p._undo.length - levels, r2.st.forms.length, r2.st.said],
      [[[1, '']], 0, 0, ['Nothing is listed under NO FLOOR LEVEL any more']]);
  }
  {
    // A menu built in one job and chosen after another came in (an open
    // does not close it) writes nothing in the new one: not its Set, not
    // its Rename.
    const r = rig({ pairs: build });
    const setMenu = r.panel._headerEntries(L(''));
    const renameMenu = r.panel._headerEntries(L('Level 1'));
    r.p.loadFrom({ metadata: { page_labels: ['X1.0', 'X2.0', 'X3.0'] }, annotations: {},
      measurements: storeOf(build), pageCount: 3 });
    r.panel.refresh();
    const levels = r.p._undo.length;
    await setRun(r, setMenu, { name: 'Level 5' });
    await setRun(r, renameMenu, { name: 'Ground' });
    eq('a menu from the last job, chosen in the next: no form, nothing written',
      [r.st.forms.length, r.p._undo.length - levels, floors(r, 'Patio', 'Slab')],
      [0, 0, [[0, ''], [0, 'Level 1']]]);
  }
  {
    // rowsNow on its own: by _uid first, by the dict itself when it has
    // none; once each, in the menu's order; never junk, a ruler, another
    // shape of an item, or one filed since.
    const a = { _uid: 'u-a', type: 'area', name: 'A', floor_level: '' };
    const b = { type: 'area', name: 'B', floor_level: ' ' };
    const ruler = { _uid: 'u-r', type: 'distance', floor_level: '' };
    const shape = { _uid: 'u-s', type: 'area', name: 'A', floor_level: '', group_id: 'g', group_child: true };
    const filed = { _uid: 'u-f', type: 'area', name: 'F', floor_level: 'Level 1' };
    const store = { 0: [a, ruler, shape, 'junk', null], 1: [b, filed], '-1000': 'not a list' };
    const copyA = { ...a, floor_level: '' };
    eq('rowsNow: a copy by its _uid, a dict with none by itself, once each, in the menu\'s order',
      C.rowsNow(store, [b, copyA, a, ruler, shape, filed, null, 'junk', [], { type: 'area' }], 'floor_level').map(m => m.name),
      ['B', 'A']);
    ok('...the one it finds is the dict in the store, not the copy the menu kept',
      C.rowsNow(store, [copyA], 'floor_level')[0] === a);
    eq('...a category blank by Python\'s strip', C.rowsNow({ 0: [{ _uid: 'u-c', type: 'area', name: 'C', category: '　' }] },
      [{ _uid: 'u-c' }], 'category').map(m => m.name), ['C']);
    eq('...nothing for nothing', [C.rowsNow(store, null, 'floor_level'), C.rowsNow(null, [a], 'floor_level')], [[], []]);
  }

  // The form: Enter accepts it as OK does; a Set form opens on its first
  // choice.
  {
    const doc = stubDocument();
    globalThis.document = doc;
    doc.add('div', 'modal');
    const form = () => doc.getElementById('modal').children.at(-1);
    const text = layer => layer.querySelectorAll('input').find(i => i.type === 'text');
    const pr = D.askClassification({ title: 'Set Floor Level', label: 'Floor level for these items:', own: ['Level 1'],
      describe: o => `what ${o} does`, options: [['The 2 items listed under NO FLOOR LEVEL', 'listed'],
        ['Every item in the job with no floor level (3)', 'job']] });
    const layer = form();
    eq('the Set form opens on its first choice, and only that one',
      layer.querySelectorAll('input').filter(i => i.type === 'radio').map(x => x.checked), [true, false]);
    eq('...and its sentence is that choice\'s', layer.querySelector('.cls-what').textContent, 'what listed does');
    text(layer).value = 'Level 4';
    let answered;
    pr.then(v => { answered = v; });
    doc.dispatch(text(layer), 'keydown', { key: 'Enter' });
    await new Promise(res => setTimeout(res, 0));
    eq('Enter in the name box accepts it: the name typed, the choice shown', answered, { name: 'Level 4', option: 'listed' });
    if (answered === undefined) doc.dispatch(layer.querySelectorAll('button').find(b => !b.classList.contains('primary')), 'click');
    await pr;
    const pr2 = D.askClassification({ title: 'Rename Floor Level', label: 'x', current: 'Level 1', old: 'Level 1' });
    let done = false;
    pr2.then(() => { done = true; });
    const l2 = form();
    doc.dispatch(text(l2), 'keydown', { key: 'Enter' });
    await Promise.resolve();
    ok('...and refuses as OK does: the same name, said in red, the form still up',
      !done && !l2.querySelector('.cls-err').hidden && l2.querySelector('.cls-err').textContent === 'That is already its name.');
    doc.dispatch(l2.querySelectorAll('button').find(b => !b.classList.contains('primary')), 'click');
    eq('...Cancel answers nothing', await pr2, null);
  }

  // A heading is the plan's own string (Python's strip): every floor
  // heading lists exactly what its Rename renames, the BOM one a heading of
  // its own.
  {
    const r = rig({ pairs: SNAP.rename.fixtures.ws });
    eq('the headings: strip(), not trim()', [...r.panel._tree.keys()], ['Level 1', '﻿Level 1', 'Level 2']);
    eq('...and so are the filters\' values', optionValues(r.panel.floorFilterEl).sort(), ['Level 1', 'Level 2', '﻿Level 1']);
    for (const fl of r.panel._tree.keys()) {
      const rows = C.rowsUnder(r.panel._tree, L(fl)).map(m => m.name);
      const plan = C.classificationPlan(r.p.measurements, 'floor_level', fl).filter(([, , k]) => k === 'item').map(([d]) => d.name);
      eq(`...the heading ${JSON.stringify(fl)} lists exactly what its Rename renames`, rows, plan);
    }
  }

  const css = (await readFile(new URL('../css/app.css', import.meta.url), 'utf-8')).replace(/\r\n/g, '\n');
  const at = css.indexOf('\n.form input[type=text], .form input[type=number], .form select, .form textarea {');
  ok('a form\'s field takes the touch layout\'s 16px (under 16px iOS zooms the page in on focus), 12.5px otherwise',
    at > 0 && /font-size: max\(var\(--field-fs\), 12\.5px\);/.test(css.slice(at, css.indexOf('}', at))));
  ok('a dialog\'s OK / Cancel / Yes / No: a finger\'s height in the touch layout',
    /\n\.dlg-foot \.btn \{ min-height: var\(--ctl-h\); \}/.test(css));
}

// ═══ 11. the wiring, by text ═════════════════════════════════════════════
log('\n-- 11. the wiring --');
{
  const panelHost = mainText.slice(mainText.indexOf('const itemsPanel = new ItemsPanel({'), mainText.indexOf('const thumbs = new Thumbnails({'));
  ok('main.js: the switch is on while editing and the list may write',
    panelHost.includes('canClassifyFromHeadings: () => app.editing && !controller.readOnly,'));
  ok('...the act chosen goes to the router, the form is the dialogs\' own, the merge question\'s default is No',
    panelHost.includes('classifyFromHeading: (act, meta, rows) => classifyFromHeading(act, meta, rows),')
    && panelHost.includes('askClassification: opts => D.askClassification(opts),')
    && panelHost.includes("askYesNo: (title, text) => D.yesNoDialog(title, text, { defaultButton: 'No' }),"));
  ok('...and the tool follows through the controller',
    panelHost.includes('followTool: (field, old, nu, scope) => followToolMoves(controller, field, old, nu, scope),'));
  ok('...and the step\'s sentence is said until the history moves past it',
    panelHost.includes('sayStep: text => sayStep(text),'));
  {
    // main.js's own sayStep and its history listener, lifted by text.
    const at = mainText.indexOf("let stepSaid = '';");
    const block = mainText.slice(at, mainText.indexOf('\n});\n', at) + 4);
    const status = { textContent: '' };
    const toast = { hidden: true, textContent: '' };
    const set = [];
    let fire = null;
    const sayStep = new Function('sayToFinger', 'app', '$', 'setStatus', 'HINTS', 'controller',
      `${block}\nreturn sayStep;`)(
      t => { status.textContent = t; toast.textContent = t; toast.hidden = false; },
      { project: { addEventListener: (type, fn) => { if (type === 'history-changed') fire = fn; } } },
      id => (id === 'statusText' ? status : id === 'fingerToast' ? toast : null),
      t => { set.push(t); status.textContent = t; }, { pan: 'Drag to pan.' }, { mode: 'pan' });
    ok('main.js: sayStep and its listener lift and run', typeof sayStep === 'function' && typeof fire === 'function');
    sayStep('Renamed floor level \'A\' to \'B\' on 1 item — Undo puts it back');
    fire();
    eq('an Undo (the history moving) takes the step\'s sentence down: the tool\'s hint, the toast hidden',
      [set, status.textContent, toast.hidden], [['Drag to pan.'], 'Drag to pan.', true]);
    sayStep('Filed 2 items under the floor level \'C\' — Undo puts it back');
    status.textContent = 'Something said since';
    toast.textContent = 'Something said since';
    fire();
    eq('...but never a sentence said since', [set.length, status.textContent, toast.hidden], [1, 'Something said since', false]);
    fire();
    eq('...and once taken down, it is forgotten', set.length, 1);
  }
  ok('main.js: the new import is a line of its own after the import list',
    // (later rounds' imports follow it, each a line of its own)
    /\nimport \{ activateOnThisSheet[^\n]*\} from '\.\/core\/counting\.js';\nimport \{ followTool as followToolMoves \} from '\.\/core\/classify\.js';\n(import [^\n]*;\n)*\nconst \$ = /.test(mainText));
  const ctlText = await readFile(new URL('../js/tools/controller.js', import.meta.url), 'utf-8');
  ok('controller.js: a window or door pin is filed where the job says (pinFiling), never a fixed trade',
    /category: pinFiling\(this\.project\.metadata, kind\)\[0\],/.test(ctlText) && !/CATEGORY_DEFAULT_OPENINGS/.test(ctlText));
  ok('controller.js: an undo of a rename puts its tool moves back',
    /addEventListener\('class-tool', ev => applyClassTool\(ev\.detail,/.test(ctlText));
  const projText = await readFile(new URL('../js/core/project.js', import.meta.url), 'utf-8');
  ok('project.js: tagTool sits above tagBooking, and undoTop is still the last thing before the dirty state',
    projText.indexOf('  tagTool(level, tag) {') > 0 && projText.indexOf('  tagTool(level, tag) {') < projText.indexOf('  tagBooking(level, tag) {')
    && /get undoTop\(\) \{[^\n]*\}\n\n {2}\/\/ ── dirty state/.test(projText));
  ok('project.js: undo and redo hand the tool tag on before the list is rebuilt',
    /this\._restoreKeepingBook\(step, 'undo'\);\n(?: {4}\/\/[^\n]*\n)* {4}this\._fireTool\(step, back, 'undo'\);/.test(projText)
    && /this\._restoreKeepingBook\(step, 'redo'\);\n {4}this\._fireTool\(step, back, 'redo'\);/.test(projText));
  const runAll = await readFile(new URL('./run-all.mjs', import.meta.url), 'utf-8');
  const portable = runAll.slice(runAll.indexOf('const PORTABLE = ['), runAll.indexOf('];', runAll.indexOf('const PORTABLE = [')));
  ok('run-all: this harness is PORTABLE, mid-list', /\n {2}'classification-rename',/.test(portable)
    && !/'classification-rename',[^\n]*\n\];?$/.test(portable.trim()));
}

// ═══ 12. live ════════════════════════════════════════════════════════════
let live = 'skipped: no PTT_DESKTOP_SRC';
if (!(await haveDesktopSource())) {
  log('\n-- 12. live differential SKIPPED (set PTT_DESKTOP_SRC) --');
} else {
  log('\n-- 12. live: the desktop source as it is now --');
  let truth = null;
  try {
    const { stdout } = await run('python', ['-B', path.join(here, 'rename-python-truth.py'), DESKTOP_SRC],
      { maxBuffer: 1 << 27, windowsHide: true });
    truth = JSON.parse(stdout);
  } catch (err) {
    fails += 1;
    log(`FAIL the desktop's rename members could not be lifted and run:\n${err.stderr || err.message}`);
  }
  if (truth) {
    log(`   (lifted by text: ${Object.entries(truth.lifted).map(([k, v]) => `${k} ${v.length}`).join(', ')}; `
      + `${Object.entries(truth.rename.lifted).map(([k, v]) => `${k} ${v.length}`).join(', ')})`);
    runSections(truth, 'live');
    await checkFlows(truth, 'live');
    await checkChains(truth, 'live');
    checkPageOrder(truth, 'live');
    ok('the committed tests/data/rename-truth.json is the desktop\'s answer as it is now '
      + `(regenerate: python -B tests/rename-python-truth.py "${DESKTOP_SRC}" --write)`,
    JSON.stringify(truth) === JSON.stringify(SNAP));
    live = 'live differential run';
  }
}

console.log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass -- a heading renames job-wide where the desktop does, follows the tool and the list, and one Undo puts it all back (${live})`);
process.exit(fails ? 1 : 0);
