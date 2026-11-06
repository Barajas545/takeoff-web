// COUNTING ACROSS A CTRL+Z -- the desktop's 3.07 count rules, on the web.
//
// He picks up Count, says what he is counting, taps a few, takes one or two
// back with Ctrl+Z -- and taps on. Every one of those taps belongs to the
// item he named. Until this port the web made the desktop's 3.06 "twin": the
// undo put a fresh copy of every item back, the tool kept pointing at the
// old one, the next tap asked the form again and split the count over two
// rows. And a name typed in the Item box was ignored while a count was armed.
//
// Each section below is one section of the desktop's own test,
// tests/test_count_undo.py in the desktop's folder, beside PTT_DESKTOP_SRC
// (tests/config.mjs) -- its SECTIONS are the spec -- re-driven through the
// web's REAL Project and ToolController:
// taps through the controller's own pointer handlers (a finger: down, then
// up), the form answered by a stub of host.askCountItem that counts how
// often it was asked, Ctrl+Z / Ctrl+Y as Project.undo / redo (what the menu,
// the keys and the Count bar's buttons run), the Items list's Delete as
// removeItems, its eye as setVisible, Properties as updateItem, the Item box
// as what its input writes. Every section checks the marks per row, how
// often the form asked, and that the count the tool is armed on is the
// store's OWN object -- by identity, not a discarded copy.
//
// Where the web cannot do what the desktop does (no framing engine, no
// Groups, no heading rename), the section is listed N/A with the reason, and
// a TAG CHECK reads the SECTIONS out of the desktop's test by text and fails
// on any tag neither ported nor listed -- so a section added there later
// cannot be missed here.
//
// And a DIFFERENTIAL: countAnswersAgain (what a count is made again from)
// against the desktop's own _rearm_count, armCount / forgetArmedCount
// against arm_count / forget_armed_count, and _framedSource (where a new
// count under a framed name must ask or say so) against the desktop's
// _inherit_count_framing, lifted out of pdf_fast_viewer.py by
// tests/count-undo-python-truth.py (closure-checked). And the RULES of a
// tap -- their order, the held counts, finding counts again after a step --
// against the desktop's own _add_count_point, arm_count, _rearm_count and
// _count_found_again, lifted by tests/count-undo-desktop-model.py and run
// on a stub canvas over the same random sessions as the web.
//
// Without the desktop source the scenarios still run -- this is a PORTABLE
// harness, and they are most of it -- and the differentials and the tag
// check are SKIPPED: the last line says so, and the harness exits 0, as
// revision-counting does when its live differential is skipped.
//
// Run: node tests/count-undo.mjs
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Project } from '../js/core/project.js';
import { CountingModel } from '../js/core/counting.js';
import * as Controller from '../js/tools/controller.js';
import { DESKTOP_SRC, haveDesktopSource } from './config.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
// Absent from a build without the port (Round 1's): the scenarios then run
// against it and fail where it makes the 3.06 twin, and the differential
// fails rather than crashes.
const { ToolController } = Controller;
const countAnswersAgain = Controller.countAnswersAgain || (() => ({ missing: 'countAnswersAgain' }));
const COUNT_TEMPLATE = Controller.COUNT_TEMPLATE || [];
const CLASS_FIELDS = Controller.CLASS_FIELDS || [];

let fails = 0;
let checks = 0;
function eq(label, got, want) {
  checks += 1;
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) return true;
  fails += 1;
  console.log(`FAIL ${label}\n  got  ${a}\n  want ${b}`);
  return false;
}
const ok = (label, cond, detail = '') => {
  checks += 1;
  if (cond) return true;
  fails += 1;
  console.log(`FAIL ${label}${detail ? `\n  ${detail}` : ''}`);
  return false;
};
const tick = async () => { for (let i = 0; i < 4; i += 1) await new Promise(r => setTimeout(r, 0)); };

// ── the world: one job, the real controller, a form that counts ──────────

const COLORS = { Outlets: [0.9, 0.2, 0.2, 0.35], Switches: [0.2, 0.7, 0.3, 0.35],
  Doors: [0.95, 0.45, 0.15, 0.35], Windows: [0.2, 0.55, 1, 0.35], Lights: [0.8, 0.8, 0.1, 0.35] };
const spec = (name, floor = 'Level 1', cat = 'Electrical', extra = {}) => ({
  name, label: name, category: cat, floor_level: floor, cost_type: 'material', unit_cost: 0,
  color: (COLORS[name] || [0.5, 0.5, 0.5, 0.35]).slice(), ...extra });

const LABELS = ['E1.0', 'E1.1', 'E2.0'];
function jobOf({ sheets = 1, items = {}, revisions = null } = {}) {
  const metadata = { page_labels: LABELS.slice(0, sheets), pixels_per_foot: 50, dpi: 150 };
  if (revisions) metadata.revisions = revisions;
  return { metadata, annotations: {}, measurements: structuredClone(items), pageCount: sheets,
    revisionCounts: revisions ? revisions.map(r => r.page_labels.length) : [] };
}

// A tap's form answer is promises only (no timer in the controller but the
// long press, which a tap cancels): the random sessions below wait this,
// not the 15 ms a setTimeout costs on Windows, a thousand times over.
const settle = async () => { for (let i = 0; i < 3; i += 1) await new Promise(r => setImmediate(r)); };

function world(opts = {}) {
  const p = new Project();
  p.loadFrom(jobOf(opts));
  const page = { n: 0 };
  const on = {};
  const canvas = { addEventListener: (t, f) => { on[t] = f; }, setPointerCapture() {},
    releasePointerCapture() {}, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  const viewport = { zoom: 1, toPage: pt => pt, eventToPage: ev => [ev.clientX, ev.clientY],
    toScreen: (x, y) => [x, y], panBy() {} };
  const f = { asked: 0, answer: null };
  const said = [];
  const host = {
    askCountItem: async ({ existing, note = '' }) => {
      f.asked += 1;
      f.offered = existing;
      f.note = note;                 // why it asked, when the tap says
      // A build that asks again from inside its own answer (Round 1's step
      // 5 did, for a pick it could not find) would ask for ever: stop
      // answering, and let the counts of asks say so.
      if (f.asked > 300) return null;
      const a = f.answer;
      return typeof a === 'function' ? a(existing) : (a ? structuredClone(a) : null);
    },
    askItem: async () => (f.item ? structuredClone(f.item) : null),
  };
  const c = new ToolController({ canvas, viewport, project: p, currentPage: () => page.n, host });
  c.addEventListener('status', ev => said.push(ev.detail.text));
  let told = 0;
  c.addEventListener('tool-name', () => { told += 1; });
  let spot = 0;
  const finger = (x, y, type) => ({ pointerId: 7, pointerType: 'touch', button: 0, clientX: x,
    clientY: y, type, shiftKey: false, ctrlKey: false, metaKey: false, preventDefault() {} });
  const W = {
    p, c, f, page, said,
    get told() { return told; },
    /** A finger's tap on the drawing, somewhere new each time. */
    async tap() {
      spot += 1;
      const x = 300 + (spot % 14) * 40, y = 300 + Math.floor(spot / 14) * 30;
      on.pointerdown(finger(x, y, 'pointerdown'));
      on.pointerup(finger(x, y, 'pointerup'));
      await (opts.tick || tick)();
    },
    /** Press Count and start a new item from the form. */
    async arm(name, floor = 'Level 1', cat = 'Electrical', extra = {}) {
      f.answer = { spec: spec(name, floor, cat, extra) };
      const n = f.asked;
      const done = await c.setMode('count');
      f.answer = null;
      if (!done || c.mode !== 'count' || f.asked !== n + 1) throw new Error(`arming ${name} did not ask once`);
    },
    /** Press Count and carry on with a count from the form's list. */
    async carry(name, floor = null) {
      f.answer = ex => {
        const hit = ex.filter(m => m.name === name && (floor == null || m.floor_level === floor));
        if (hit.length !== 1) throw new Error(`the carry-on list: ${JSON.stringify(ex.map(m => m.name))}`);
        return { continueItem: hit[0] };
      };
      const done = await c.setMode('count');
      f.answer = null;
      if (!done || c.mode !== 'count') throw new Error(`carrying on ${name} did not arm`);
    },
    async pan() { await c.setMode('pan'); },
    async tool(mode) { await c.setMode(mode); },
    undo() { return p.undo(); },
    redo() { return p.redo(); },
    /** The Item box: what its input writes (a pick from its list does the same). */
    typeBox(text) { c.options.pendingName = text; },
    go(n) { page.n = n; },
    item(name, floor = null, pg = null) {
      const got = [...p.allItems()].filter(([k, m]) => m.name === name
        && (floor == null || m.floor_level === floor) && (pg == null || k === pg)).map(([, m]) => m);
      if (got.length !== 1) throw new Error(`${got.length} items called ${name} ${floor || ''}`);
      return got[0];
    },
    /** {name: [marks of each count with that name, in list order]} on a sheet. */
    marks(pg = page.n) {
      const o = {};
      for (const m of p.measurements[pg] || []) {
        if (m.type === 'count') (o[m.name] ||= []).push((m.points || []).length);
      }
      return o;
    },
    /** [floor, marks] of every count called `name` on a sheet, sorted. */
    counts(pg = page.n, name = 'Outlets') {
      return (p.measurements[pg] || []).filter(m => m.type === 'count' && m.name === name)
        .map(m => [m.floor_level, (m.points || []).length]).sort();
    },
    /** The armed count, on sheet `pg`, BY IDENTITY: [name, floor, marks]. */
    armed(pg = page.n) {
      const t = c.countTarget;
      return t && (p.measurements[pg] || []).includes(t)
        ? [t.name, t.floor_level, (t.points || []).length] : null;
    },
  };
  return W;
}

/** The tool is armed on the store's own `name` with `n` marks; the sheet holds `want`. */
function armedIs(W, label, name, n, want, pg = W.page.n) {
  const a = W.armed(pg);
  eq(`${label}: armed on the sheet's own "${name}" with ${n}`, a && [a[0], a[2]], [name, n]);
  eq(`${label}: marks per row`, W.marks(pg), want);
}
/** The tool is on the store's own count on sheet `pg`: name, floor, marks. */
function heldOn(W, label, pg, floor, n, name = 'Outlets') {
  eq(`${label}: armed on sheet ${pg + 1}'s own count`, W.armed(pg), [name, floor, n]);
}

const seed = (name, floor, n, extra = {}) => ({ type: 'count', name, label: name, floor_level: floor,
  category: 'Electrical', sub_category: '', cost_type: 'material', unit_cost: 0,
  points: Array.from({ length: n }, (_, i) => [40 + i * 30, 1200]), value: n, visible: true,
  color: [0.2, 0.2, 0.9, 0.35], notes: '', purpose: '', ...extra });
const WALL = { type: 'polyline', name: 'Wall', label: 'Wall', points: [[100, 1500], [900, 1500]],
  value: 16, floor_level: 'Level 1', category: 'Walls', sub_category: '', cost_type: 'material',
  unit_cost: 0, color: [0.2, 0.5, 0.9, 1], visible: true, sort_order: 2 };

// ── the sections ─────────────────────────────────────────────────────────
//
// Each tag is the desktop's. `first` is the part of its test before the
// SECTIONS list; the `web_` ones are the web's own (the user's decisions of
// 2026-11-05 and the paths only the web has).

const SECTIONS = [];
const S = (tag, fn) => SECTIONS.push([tag, fn]);

S('first', async () => {
  const W = world();
  await W.arm('Outlets');
  eq('pressing Count asks once', W.f.asked, 1);
  const asked = W.f.asked;
  await W.tap(); await W.tap(); await W.tap();
  eq('three taps, three marks', W.counts(), [['Level 1', 3]]);
  W.undo();
  eq('Ctrl+Z took back one tap', W.counts(), [['Level 1', 2]]);
  // The Items list redraws on 'items-changed': a tap that only JOINS a
  // count must say it too, or its row reads one mark short.
  let told = 0;
  const listen = () => { told += 1; };
  W.p.addEventListener('items-changed', listen);
  await W.tap();
  W.p.removeEventListener('items-changed', listen);
  ok('a tap that joins the count tells the Items list', told >= 1);
  eq('the tap after Ctrl+Z asked no form', W.f.asked, asked);
  eq('...and joined the count he was making, no twin', W.counts(), [['Level 1', 3]]);
  armedIs(W, 'Ctrl+Z, tap', 'Outlets', 3, { Outlets: [3] });

  W.undo(); W.redo();
  eq('Ctrl+Z, Ctrl+Y', W.counts(), [['Level 1', 3]]);
  await W.tap();
  eq('the tap after Ctrl+Y: no form, the same item', [W.f.asked, W.counts()], [asked, [['Level 1', 4]]]);
  armedIs(W, 'Ctrl+Y, tap', 'Outlets', 4, { Outlets: [4] });

  W.undo(); W.undo();
  await W.tap(); await W.tap();
  eq('two back, two on: still one item', [W.f.asked, W.counts()], [asked, [['Level 1', 4]]]);
  armedIs(W, 'several', 'Outlets', 4, { Outlets: [4] });

  const first = W.item('Outlets');
  const colour = first.color.slice();
  for (let i = 0; i < 4; i += 1) W.undo();
  eq('four taps, four undos: nothing left', W.counts(), []);
  ok('the tool still holds answers to make it from', !!W.c.countSpec);
  await W.tap();
  eq('every tap back: the next starts it again, with no form', [W.f.asked, W.counts()],
    [asked, [['Level 1', 1]]]);
  const again = W.item('Outlets');
  eq('...from the same answers', [again.category, again.color], ['Electrical', colour]);
  armedIs(W, 'made again', 'Outlets', 1, { Outlets: [1] });

  W.undo();
  eq('Ctrl+Z of that first tap', W.counts(), []);
  W.redo();
  eq('Ctrl+Y brings it back', W.counts(), [['Level 1', 1]]);
  await W.tap();
  eq('the tap after Ctrl+Y joins the count it brought back, not a twin from the answers',
    [W.f.asked, W.counts()], [asked, [['Level 1', 2]]]);
  armedIs(W, 'Ctrl+Y of the first tap', 'Outlets', 2, { Outlets: [2] });
});

S('same_name', async () => {
  const W = world({ items: { 0: [seed('Outlets', 'Level 1', 3), WALL] } });
  await W.arm('Outlets', 'Level 2');            // offered Level 1's; starts anew
  const asked = W.f.asked;
  await W.tap(); await W.tap();
  eq('a Level 2 beside the Level 1', W.counts(), [['Level 1', 3], ['Level 2', 2]]);
  W.undo();
  await W.tap();
  eq('the tap belongs to the Level 2 he armed, not the Level 1 of the same name',
    [W.f.asked, W.counts()], [asked, [['Level 1', 3], ['Level 2', 2]]]);
  eq('armed on the Level 2', W.armed(), ['Outlets', 'Level 2', 2]);
  W.p.removeItems([W.item('Wall')._uid]);       // the Items list's Delete, Count in hand
  eq('the tool is still Count', W.c.mode, 'count');
  await W.tap();
  eq('a tap after the delete', W.counts(), [['Level 1', 3], ['Level 2', 3]]);
  W.undo();                                     // the tap
  W.undo();                                     // the delete: the Wall is back
  ok('the Wall is back', W.p.measurements[0].some(m => m.name === 'Wall'));
  await W.tap();
  eq('the Wall came back in front of it; the tap still goes to the Level 2',
    [W.f.asked, W.counts()], [asked, [['Level 1', 3], ['Level 2', 3]]]);
  eq('armed on the store\'s own Level 2', W.armed(), ['Outlets', 'Level 2', 3]);

  // ...and with the box SHOWING the name (Count pressed again: the box
  // keeps it): a name match would find the Level 1 first in the list.
  const V = world({ items: { 0: [seed('Outlets', 'Level 1', 3)] } });
  await V.tool('area');
  await V.arm('Outlets', 'Level 2');
  await V.arm('Outlets', 'Level 2');            // pressed again, in Count
  eq('the box shows the name', V.c.options.pendingName, 'Outlets');
  await V.tap(); await V.tap();
  V.undo();
  await V.tap();
  eq('the box naming both: the tap after Ctrl+Z still goes to the Level 2',
    V.counts(), [['Level 1', 3], ['Level 2', 2]]);
});

S('isolated_redo', async () => {
  const W = world({ items: { 0: [WALL] } });
  await W.arm('Outlets');
  const asked = W.f.asked;
  await W.tap();
  W.p.isolate([W.item('Wall')._uid]);
  ok('isolated', W.p.isolating);
  W.undo();
  eq('Ctrl+Z of the first tap', W.marks(), {});
  W.redo();
  eq('Ctrl+Y', W.marks(), { Outlets: [1] });
  await W.tap();
  eq('no form', W.f.asked, asked);
  armedIs(W, 'isolation, Ctrl+Z, Ctrl+Y, tap', 'Outlets', 2, { Outlets: [2] });
});

S('delete_in_front', async () => {
  const W = world();
  await W.arm('Switches'); await W.tap(); await W.tap();
  await W.arm('Outlets'); await W.tap(); await W.tap(); await W.tap();
  await W.pan();
  await W.carry('Outlets');
  W.p.removeItems([W.item('Switches')._uid]);
  eq('Switches deleted in front', W.marks(), { Outlets: [3] });
  await W.tap();
  armedIs(W, 'a tap after the delete', 'Outlets', 4, { Outlets: [4] });
  W.undo();                                     // the tap
  W.undo();                                     // the delete: Switches is back
  eq('Switches back in its old place', W.marks(), { Switches: [2], Outlets: [3] });
  await W.tap();
  armedIs(W, 'the tap goes to the armed count, not the one put back', 'Outlets', 4,
    { Switches: [2], Outlets: [4] });
});

async function threeCounts(W) {
  await W.arm('Doors', 'Level 1', 'Doors & Windows'); await W.tap(); await W.tap();
  await W.arm('Windows', 'Level 1', 'Doors & Windows'); await W.tap(); await W.tap();
  await W.arm('Outlets'); await W.tap();
  armedIs(W, 'three counts', 'Outlets', 1, { Doors: [2], Windows: [2], Outlets: [1] });
  const o = W.item('Outlets');
  return [o.color.slice(), o.category, o.floor_level];
}

/**
 * Outlets' first mark beside Doors and Windows; `between` happens; the
 * Ctrl+Z (`undos` of them: on the web an eye is an undo level of its own)
 * takes the mark back; the taps after it make Outlets again.
 */
async function firstMarkBack(label, between, undos = 1, opts = {}) {
  const W = world(opts);
  const first = await threeCounts(W);
  await between(W);
  const asked = W.f.asked;
  for (let i = 0; i < undos; i += 1) W.undo();
  eq(`${label}: the first mark taken back`, W.marks(), { Doors: [2], Windows: [2] });
  await W.tap();
  eq(`${label}: no form`, W.f.asked, asked);
  armedIs(W, `${label}: made again`, 'Outlets', 1, { Doors: [2], Windows: [2], Outlets: [1] });
  const o = W.item('Outlets');
  eq(`${label}: from the same answers`, [o.color, o.category, o.floor_level], first);
  await W.tap();
  armedIs(W, `${label}: the next tap`, 'Outlets', 2, { Doors: [2], Windows: [2], Outlets: [2] });
  return W;
}

S('beside_others', async () => {
  const W = await firstMarkBack('beside others', () => {});
  const asked = W.f.asked;
  W.undo(); W.undo();
  eq('Ctrl+Z x2', W.marks(), { Doors: [2], Windows: [2] });
  W.redo();
  eq('Ctrl+Y', W.marks(), { Doors: [2], Windows: [2], Outlets: [1] });
  await W.tap();
  eq('no form', W.f.asked, asked);
  armedIs(W, 'beside others, Ctrl+Y, tap', 'Outlets', 2, { Doors: [2], Windows: [2], Outlets: [2] });
});

S('others_clicks', async () => {
  const W = world();
  await W.arm('Doors', 'Level 1', 'Doors & Windows'); await W.tap(); await W.tap();
  await W.arm('Windows', 'Level 1', 'Doors & Windows'); await W.tap(); await W.tap();
  await W.arm('Outlets'); await W.tap(); await W.tap();
  await W.carry('Doors'); await W.tap();
  await W.carry('Outlets'); await W.tap();
  armedIs(W, 'interleaved', 'Outlets', 3, { Doors: [3], Windows: [2], Outlets: [3] });
  const asked = W.f.asked;
  W.undo();                                     // Outlets' tap
  W.undo();                                     // Doors' tap, Outlets armed
  eq('Ctrl+Z of another count\'s tap', W.marks(), { Doors: [2], Windows: [2], Outlets: [2] });
  await W.tap();
  eq('no form', W.f.asked, asked);
  armedIs(W, 'another count\'s tap taken back', 'Outlets', 3, { Doors: [2], Windows: [2], Outlets: [3] });
  await W.carry('Windows'); await W.tap();
  await W.carry('Outlets');
  W.undo();                                     // Windows' tap, Outlets armed, not tapped
  eq('Windows\' tap back', W.marks(), { Doors: [2], Windows: [2], Outlets: [3] });
  await W.tap();
  armedIs(W, 'armed, not tapped, another count\'s tap back', 'Outlets', 4,
    { Doors: [2], Windows: [2], Outlets: [4] });
});

S('eyes', async () => {
  // On the web the eye IS an undo level (setVisible), so the Ctrl+Z that
  // takes the mark back is the second one; the rule under test is the
  // same: the tap makes Outlets again and never lands on the count beside.
  const ids = (W, pred) => [...W.p.allItems()].filter(([, m]) => pred(m)).map(([, m]) => m._uid);
  await firstMarkBack('an eye on another count\'s row',
    W => W.p.setVisible([W.item('Doors')._uid], false), 2);
  await firstMarkBack('the eye on a trade heading',
    W => W.p.setVisible(ids(W, m => m.category === 'Doors & Windows'), false), 2);
  await firstMarkBack('the eye on a floor heading (Outlets itself hidden too)',
    W => W.p.setVisible(ids(W, m => m.floor_level === 'Level 1'), false), 2);

  const W = world();
  await threeCounts(W);
  const asked = W.f.asked;
  await W.pan();
  W.p.setVisible([W.item('Doors')._uid], false);   // hidden before he starts
  await W.arm('Switches');
  await W.tap();
  W.p.setVisible([W.item('Doors')._uid], true);    // shown, between the tap and its Ctrl+Z
  W.undo(); W.undo();                              // the eye, then Switches' tap
  eq('Doors hidden again by the Ctrl+Z', W.item('Doors').visible, false);
  await W.tap();
  eq('only the arming asked', W.f.asked, asked + 1);
  armedIs(W, 'an eye that showed a hidden count', 'Switches', 1,
    { Doors: [2], Windows: [2], Outlets: [1], Switches: [1] });
  eq('the tap did not go onto the count he cannot see', W.item('Doors').visible, false);
});

S('same_name_eye', async () => {
  const W = world();
  await W.arm('Outlets'); await W.tap(); await W.tap();
  await W.arm('Outlets', 'Level 2'); await W.tap();
  eq('two Outlets', W.counts(), [['Level 1', 2], ['Level 2', 1]]);
  const asked = W.f.asked;
  W.p.setVisible([W.item('Outlets', 'Level 1')._uid], false);
  W.undo(); W.undo();                           // the eye, then Level 2's first mark
  await W.tap();
  eq('no form', W.f.asked, asked);
  eq('the tap belongs to the Level 2 answers, not the Level 1 by name',
    W.counts(), [['Level 1', 2], ['Level 2', 1]]);
  eq('armed on the store\'s own Level 2', W.armed(), ['Outlets', 'Level 2', 1]);
});

S('isolation', async () => {
  await firstMarkBack('isolation on during the Ctrl+Z', W => {
    W.p.isolate([W.item('Outlets')._uid]);
    ok('isolated', W.p.isolating);
  });
  await firstMarkBack('isolation on and off before it', W => {
    W.p.isolate([W.item('Doors')._uid]);
    W.p.clearIsolation();
    ok('not isolated', !W.p.isolating);
  });
});

S('continue', async () => {
  // The answer carries what the desktop's form asks and the web's does
  // not yet (purpose, notes, the catalog words): an item made from such an
  // answer keeps them, and so does one made again from the item itself.
  const W = world();
  await W.arm('Outlets', 'Level 1', 'Electrical', { unit_cost: 12.5, purpose: 'Receptacles',
    notes: 'kitchen', sub_category: 'Rough-in', catalog_code: 'OUTLET-STD', catalog_unit: 'EA',
    rate_unit: 'EA', cost_type: 'labor' });
  await W.tap(); await W.tap();
  const made = { ...W.item('Outlets') };
  await W.pan();
  await W.carry('Outlets');
  const asked = W.f.asked;
  await W.tap();
  armedIs(W, 'carried on', 'Outlets', 3, { Outlets: [3] });
  W.undo(); W.undo(); W.undo();
  eq('every mark back', W.marks(), {});
  await W.tap();
  eq('carried on, every mark back: its answers are its own, no form', W.f.asked, asked);
  armedIs(W, 'made again', 'Outlets', 1, { Outlets: [1] });
  const again = W.item('Outlets');
  for (const f of ['color', 'floor_level', 'category', 'sub_category', 'cost_type', 'unit_cost',
    'purpose', 'notes', 'catalog_code', 'catalog_unit', 'rate_unit']) {
    eq(`made again with its own ${f}`, again[f], made[f]);
  }
  await W.tap();
  armedIs(W, 'and the next tap', 'Outlets', 2, { Outlets: [2] });

  const V = world();
  await V.arm('Outlets'); await V.tap(); await V.tap();
  await V.arm('Outlets', 'Level 2'); await V.tap();
  await V.pan();
  await V.carry('Outlets', 'Level 2');
  const asked2 = V.f.asked;
  await V.tap();
  V.undo(); V.undo();
  eq('the Level 2 taken back past its first mark', V.counts(), [['Level 1', 2]]);
  await V.tap(); await V.tap();
  eq('made again, and the taps after stay on it', [V.f.asked, V.counts()],
    [asked2, [['Level 1', 2], ['Level 2', 2]]]);
  eq('armed on the Level 2', V.armed(), ['Outlets', 'Level 2', 2]);
});

S('deleted_while_held', async () => {
  const W = world();
  await W.arm('Outlets'); await W.tap(); await W.tap();
  await W.pan();                                // the Item box empties
  await W.arm('Outlets', 'Level 2'); await W.tap();
  W.p.removeItems([W.item('Outlets', 'Level 2')._uid]);
  eq('the armed count deleted', W.counts(), [['Level 1', 2]]);
  W.f.answer = { spec: spec('Outlets', 'Level 2') };
  let asked = W.f.asked;
  await W.tap();                                // nothing armed: the form
  eq('nothing armed: the form asks', W.f.asked, asked + 1);
  await W.tap(); await W.tap();
  eq('the taps after the form follow the item it made, not the first of its name',
    W.counts(), [['Level 1', 2], ['Level 2', 3]]);
  // ...deleted again, a new item named in the form, all its marks back:
  // made again from ITS answers, not from the deleted count's.
  W.f.answer = { spec: spec('Switches', 'Level 1', 'Electrical', { purpose: 'Plates' }) };
  W.p.removeItems([W.item('Outlets', 'Level 2')._uid]);
  W.typeBox('');                                // the box emptied
  asked = W.f.asked;
  await W.tap();                                // the form: Switches
  eq('the form again', W.f.asked, asked + 1);
  await W.tap();
  W.undo(); W.undo();
  eq('Switches taken back', W.marks(), { Outlets: [2] });
  W.f.answer = null;
  await W.tap();
  eq('no form: Switches is made again', W.f.asked, asked + 1);
  armedIs(W, 'from its own answers', 'Switches', 1, { Outlets: [2], Switches: [1] });
  eq('...with its purpose', W.item('Switches').purpose, 'Plates');

  // one armed on another sheet stays armed: back there, the taps go to it
  const V = world({ sheets: 2 });
  await V.arm('Outlets'); await V.tap(); await V.tap();
  await V.pan();
  await V.arm('Outlets', 'Level 2'); await V.tap();
  V.go(1);
  V.f.answer = { spec: spec('Outlets', 'Level 2') };
  await V.tap();                                // another sheet: the form
  V.f.answer = null;
  V.go(0);
  await V.tap();
  eq('back on the first sheet: the count armed there, not the first of its name',
    V.counts(0), [['Level 1', 2], ['Level 2', 2]]);
});

S('typed_name', async () => {
  for (const order of ['before the first tap', 'after a tap', 'after a Ctrl+Z']) {
    const W = world();
    await W.arm('Outlets');
    const asked = W.f.asked;
    if (order !== 'before the first tap') await W.tap();
    if (order === 'after a Ctrl+Z') W.undo();
    W.typeBox('Switches');
    await W.tap();
    eq(`${order}: no form`, W.f.asked, asked);
    const want = order === 'after a tap' ? { Outlets: [1], Switches: [1] } : { Switches: [1] };
    armedIs(W, `${order}: a new name starts the next item`, 'Switches', 1, want);
    await W.tap();
    armedIs(W, `${order}: and the next tap`, 'Switches', 2, { ...want, Switches: [2] });
    if (order === 'after a Ctrl+Z') {
      W.undo(); W.undo();                       // Switches' marks
      await W.tap();
      eq(`${order}: Switches made again, no form`, W.f.asked, asked);
      armedIs(W, `${order}: from its own answers`, 'Switches', 1, { Switches: [1] });
    }
  }
  // A rename of the armed item (Properties) does not start a twin: the box
  // still says what the tool put there.
  const W = world();
  await W.arm('Outlets'); await W.tap(); await W.tap();
  await W.carry('Outlets');                     // in Count: the box keeps the name
  eq('Count pressed again: the box shows the armed name', W.c.options.pendingName, 'Outlets');
  W.p.updateItem(W.c.countTarget._uid, { name: 'Receptacles', label: 'Receptacles' });
  eq('the rename does not touch the box', W.c.options.pendingName, 'Outlets');
  eq('renamed', W.marks(), { Receptacles: [2] });
  const asked = W.f.asked;
  await W.tap();
  eq('no form', W.f.asked, asked);
  armedIs(W, 'renamed by Properties: the taps stay on it', 'Receptacles', 3, { Receptacles: [3] });
});

const job2 = () => jobOf({ items: { 0: [WALL] } });

S('job_switch', async () => {
  for (const tapped of [true, false]) {
    const W = world();
    await W.arm('Outlets', 'Level 3', 'Electrical', { unit_cost: 7 });
    if (tapped) { await W.tap(); W.undo(); }
    W.p.loadFrom(job2());
    eq(`${tapped ? 'tapped and undone' : 'never tapped'}: still Count`, W.c.mode, 'count');
    W.f.answer = { spec: spec('Job two item') };
    const asked = W.f.asked;
    await W.tap();
    eq(`${tapped ? 'tapped and undone' : 'never tapped'}: the first tap in the other job asks`,
      W.f.asked, asked + 1);
    eq(`${tapped ? 'tapped and undone' : 'never tapped'}: and makes this job's item`,
      W.marks(), { 'Job two item': [1] });
  }
});

S('job_switch_box', async () => {
  for (const tapped of [true, false]) {
    const W = world();
    await W.arm('Doors', 'Level 1', 'Doors & Windows'); await W.tap();
    await W.arm('Outlets', 'Level 3');          // pressed again, in Count
    eq('Count pressed again: the box shows the name', W.c.options.pendingName, 'Outlets');
    if (tapped) await W.tap();
    W.p.loadFrom(job2());
    eq('another job: the box no longer names the last job\'s item', W.c.options.pendingName, '');
    W.f.answer = { spec: spec('Job two item') };
    const asked = W.f.asked;
    await W.tap();
    eq(`${tapped ? 'tapped' : 'never tapped'}: the first tap asks`, W.f.asked, asked + 1);
    armedIs(W, 'this job\'s item', 'Job two item', 1, { 'Job two item': [1] });
  }
  for (const tool of ['count', 'area']) {
    const W = world();
    await W.arm('Outlets', 'Level 3'); await W.tap();
    if (tool === 'count') W.typeBox('Switches');   // not tapped with yet
    else { await W.tool('area'); W.typeBox('Outlets'); }
    const typed = W.c.options.pendingName;
    W.p.loadFrom(job2());
    eq(`${tool}: a name he typed is his, and stays`, W.c.options.pendingName, typed);
    if (tool === 'count') {
      const asked = W.f.asked;
      await W.tap();
      eq('the typed name needs no form', W.f.asked, asked);
      armedIs(W, 'a typed name over a job switch', 'Switches', 1, { Switches: [1] });
    }
  }
});

S('job_switch_class', async () => {
  for (const kind of ['typed', 'window', 'door']) {
    const W = world();
    // The last job's floor, trade, sub-category and Labor, remembered from
    // an item form (on the web the count form is not remembered: the
    // user's decision of 2026-11-05).
    W.f.item = { name: 'Slab', label: 'Slab', floor_level: 'Level 3', category: 'Concrete',
      sub_category: 'Interior', cost_type: 'labor', unit_cost: 0, color: [0.3, 0.3, 0.3, 0.35] };
    await W.tool('area');
    await W.c._finalizePolygon('area', [[0, 0], [100, 0], [100, 100]]);
    eq(`${kind}: the last floor, sub-category and Labor are remembered`,
      [W.c._lastFloor, W.c._lastSub, W.c._lastCostType], ['Level 3', 'Interior', 'labor']);
    await W.arm('Doors', 'Level 4', 'Doors & Windows'); await W.tap();
    eq(`${kind}: the count form is not filed as the last floor`, W.c._lastFloor, 'Level 3');
    W.p.loadFrom(job2());
    const asked = W.f.asked;
    let m;
    if (kind === 'typed') {
      W.typeBox('Switches');
      await W.tap();
      m = W.item('Switches');
      eq('not filed under the last job\'s trade', m.category, '');
      armedIs(W, 'typed', 'Switches', 1, { Switches: [1] });
    } else {
      await W.tool(kind);
      await W.tap();
      const got = W.p.measurements[0].filter(x => x.type === kind);
      eq(`one ${kind} pin`, got.length, 1);
      m = got[0];
    }
    eq(`${kind}: no form`, W.f.asked, asked);
    eq(`${kind}: not filed under the last job's floor, sub-category or cost type`,
      [m.floor_level, m.sub_category, m.cost_type], ['', '', 'material']);
    await W.pan();
  }
});

/** Sheet one: Outlets L1 (2), then Outlets L2 (2), the one he is counting.
 *  Sheet two: Outlets L1 (3). Ends on sheet two after its form made a
 *  Level 2 there and two more taps (3). */
async function twoSheetsSetup() {
  const W = world({ sheets: 2 });
  await W.arm('Outlets'); await W.tap(); await W.tap();
  await W.pan();
  W.go(1);
  await W.arm('Outlets'); await W.tap(); await W.tap(); await W.tap();
  await W.pan();
  W.go(0);
  await W.arm('Outlets', 'Level 2'); await W.tap(); await W.tap();
  heldOn(W, 'set-up', 0, 'Level 2', 2);
  W.go(1);
  W.f.answer = { spec: spec('Outlets', 'Level 2') };
  const asked = W.f.asked;
  await W.tap();                                // nothing held here: the form
  W.f.answer = null;
  eq('set-up: the form asks on sheet two', W.f.asked, asked + 1);
  await W.tap(); await W.tap();
  eq('the taps after the form stay on the item it made here, not the first Outlets',
    W.counts(1), [['Level 1', 3], ['Level 2', 3]]);
  heldOn(W, 'set-up', 1, 'Level 2', 3);
  return { W, asked };
}

S('two_sheets', async () => {
  const { W, asked } = await twoSheetsSetup();
  W.undo(); W.undo(); W.undo();                 // every mark of sheet two's Level 2
  eq('sheet two\'s Level 2 taken back', W.counts(1), [['Level 1', 3]]);
  await W.tap(); await W.tap();
  eq('made again from its own answers: no form', W.f.asked, asked + 1);
  eq('...not onto the Level 1 Outlets', W.counts(1), [['Level 1', 3], ['Level 2', 2]]);
  heldOn(W, 'after the Ctrl+Z', 1, 'Level 2', 2);
  W.go(0); await W.tap();
  eq('back on sheet one: the count held there', W.counts(0), [['Level 1', 2], ['Level 2', 3]]);
  heldOn(W, 'sheet one', 0, 'Level 2', 3);
  W.go(1); await W.tap();
  eq('and on sheet two again: that sheet\'s', W.counts(1), [['Level 1', 3], ['Level 2', 3]]);
  heldOn(W, 'sheet two', 1, 'Level 2', 3);
  W.undo();                                     // a Ctrl+Z on sheet two
  W.go(0); await W.tap();
  eq('after a Ctrl+Z on sheet two, sheet one\'s count is still held',
    W.counts(0), [['Level 1', 2], ['Level 2', 4]]);
  heldOn(W, 'sheet one after a Ctrl+Z', 0, 'Level 2', 4);
  W.go(1); await W.tap();
  heldOn(W, 'sheet two', 1, 'Level 2', 3);
  // Count pressed again, the form cancelled: what was held is.
  W.f.answer = null;
  const n = W.f.asked;
  eq('a cancelled form leaves the tool as it was', [await W.c.setMode('count'), W.c.mode], [false, 'count']);
  eq('...having asked', W.f.asked, n + 1);
  W.go(0); await W.tap();
  eq('a cancelled form put nothing down', W.counts(0), [['Level 1', 2], ['Level 2', 5]]);
  heldOn(W, 'after a cancelled form', 0, 'Level 2', 5);
  // The box emptied on sheet two: back on sheet one the count held there
  // still takes the tap, as the armed one would.
  W.go(1); await W.tap();
  heldOn(W, 'sheet two', 1, 'Level 2', 4);
  W.typeBox('');
  W.go(0);
  const a2 = W.f.asked;
  await W.tap();
  eq('the box emptied: no form for the count held here', W.f.asked, a2);
  heldOn(W, 'box emptied', 0, 'Level 2', 6);
  eq('sheet one', W.counts(0), [['Level 1', 2], ['Level 2', 6]]);
  eq('sheet two', W.counts(1), [['Level 1', 3], ['Level 2', 4]]);
});

S('two_sheets_names', async () => {
  // The form on sheet two names Switches: back on sheet one the box says
  // Switches, and the Outlets held there do not take the tap.
  {
    const W = world({ sheets: 2 });
    await W.arm('Outlets'); await W.tap(); await W.tap();
    await W.pan();
    await W.arm('Outlets', 'Level 2'); await W.tap(); await W.tap();
    W.go(1);
    W.f.answer = { spec: spec('Switches', 'Level 2') };
    const asked = W.f.asked;
    await W.tap();
    W.f.answer = null;
    eq('the form: Switches', W.f.asked, asked + 1);
    heldOn(W, 'Switches on sheet two', 1, 'Level 2', 1, 'Switches');
    eq('the form put its name in the box', W.c.options.pendingName, 'Switches');
    W.go(0); await W.tap();
    eq('the box says Switches: not the Outlets held here', W.counts(0), [['Level 1', 2], ['Level 2', 2]]);
    eq('...a Switches here, by its name', W.counts(0, 'Switches'), [['', 1]]);
    eq('armed on it', W.armed(0), ['Switches', '', 1]);
  }
  // The box emptied on sheet two, back on sheet one: the Outlets held there
  // take it. Then Switches typed: Switches, not those Outlets.
  {
    const W = world({ sheets: 2 });
    await W.arm('Outlets'); await W.tap(); await W.tap();
    await W.pan();
    await W.arm('Outlets', 'Level 2'); await W.tap(); await W.tap();
    W.go(1);
    W.f.answer = { spec: spec('Switches', 'Level 2') };
    await W.tap();
    W.f.answer = null;
    heldOn(W, 'Switches on sheet two', 1, 'Level 2', 1, 'Switches');
    W.typeBox('');
    W.go(0);
    const asked = W.f.asked;
    await W.tap();
    eq('the box emptied: no form for the count held here', W.f.asked, asked);
    heldOn(W, 'back onto it', 0, 'Level 2', 3);
    W.typeBox('Switches');
    await W.tap();
    eq('Switches typed: not onto the Outlets', W.counts(0), [['Level 1', 2], ['Level 2', 3]]);
    eq('...a Switches here', W.counts(0, 'Switches'), [['', 1]]);
    eq('armed on it', W.armed(0), ['Switches', '', 1]);
  }
  // A new item from the form while one is held on the other sheet: the
  // count held there is not this item.
  {
    const { W } = await twoSheetsSetup();
    await W.arm('Outlets', 'Level 3');          // pressed again: a new item
    W.go(0);
    const asked = W.f.asked;
    await W.tap();
    eq('the new item\'s answers were armed: no form', W.f.asked, asked);
    eq('a new item from the form: not onto the one held before it',
      W.counts(0), [['Level 1', 2], ['Level 2', 2], ['Level 3', 1]]);
    heldOn(W, 'the new item', 0, 'Level 3', 1);
  }
});

S('two_held_one_sheet', async () => {
  // Switches typed on sheet two, counted on sheet one by that name, the box
  // emptied on sheet two: back on sheet one the tap goes onto the Switches,
  // not the Outlets he stopped counting when he picked Switches.
  {
    const W = world({ sheets: 2 });
    await W.arm('Outlets'); await W.tap(); await W.tap();
    W.go(1);
    W.f.answer = { spec: spec('Outlets') };
    await W.tap();
    W.f.answer = null;
    W.typeBox('Switches');
    await W.tap();
    heldOn(W, 'Switches typed on sheet two', 1, '', 1, 'Switches');
    W.go(0); await W.tap(); await W.tap();
    heldOn(W, 'Switches by name on sheet one', 0, '', 2, 'Switches');
    W.go(1); await W.tap();
    heldOn(W, 'back on sheet two', 1, '', 2, 'Switches');
    W.typeBox('');
    W.go(0);
    const asked = W.f.asked;
    await W.tap();
    eq('the box emptied: no form', W.f.asked, asked);
    eq('back on sheet one: not onto the Outlets he stopped counting', W.counts(0), [['Level 1', 2]]);
    heldOn(W, 'the one counted there last', 0, '', 3, 'Switches');
  }
  // Switches made on sheet one from its answers: its first tap on sheet two
  // taken back, the next tap on sheet one. Three sheets.
  {
    const W = world({ sheets: 3 });
    await W.arm('Outlets'); await W.tap(); await W.tap();
    W.go(2);
    W.f.answer = { spec: spec('Outlets') };
    await W.tap();
    heldOn(W, 'Outlets on sheet three', 2, 'Level 1', 1);
    W.go(1);
    W.typeBox('');
    W.f.answer = { spec: spec('Switches') };
    const asked = W.f.asked;
    await W.tap();                              // the form: Switches
    W.f.answer = null;
    eq('the form: Switches', W.f.asked, asked + 1);
    W.undo();                                   // its first tap back
    eq('Switches taken back', W.counts(1, 'Switches'), []);
    W.go(0); await W.tap();                     // made from its answers
    eq('no form: made from its answers', W.f.asked, asked + 1);
    heldOn(W, 'Switches on sheet one', 0, 'Level 1', 1, 'Switches');
    W.typeBox('');
    W.go(2); await W.tap();
    heldOn(W, 'back onto sheet three\'s', 2, 'Level 1', 2);
    W.go(0); await W.tap();
    eq('the box emptied: no form', W.f.asked, asked + 1);
    eq('back on sheet one: not the Outlets held there before Switches was made there',
      W.counts(0), [['Level 1', 2]]);
    heldOn(W, 'the one counted there last', 0, 'Level 1', 2, 'Switches');
  }
  // The sheet's own drawing and a revision of it each keep their own count.
  {
    const W = world({ sheets: 2, revisions: [{ id: 'r1', date: '03/01/2026', description: 'Bulletin 1',
      page_labels: ['E1.0'], match: { 0: 0 }, extra: {} }] });
    await W.arm('Outlets'); await W.tap(); await W.tap();
    await W.pan();
    await W.arm('Outlets', 'Level 2'); await W.tap(); await W.tap();
    W.c.setVersionView('r1', 0);                // the revision of the sheet is up
    W.f.answer = { spec: spec('Outlets', 'Level 2') };
    await W.tap(); await W.tap();
    W.f.answer = null;
    eq('the form made a Level 2 on the revision',
      W.p.measurements[0].filter(m => m.rev_id === 'r1').map(m => [m.floor_level, m.points.length]),
      [['Level 2', 2]]);
    W.c.setVersionView('', null);               // back on the sheet's own drawing
    await W.tap();
    const own = W.p.measurements[0].filter(m => !m.rev_id).map(m => [m.floor_level, m.points.length]).sort();
    eq('back on its own drawing: onto the Level 2 held there, not the first Outlets by name',
      own, [['Level 1', 2], ['Level 2', 3]]);
    const t = W.c.countTarget;
    ok('armed on the store\'s own Level 2 of the sheet\'s own drawing',
      W.p.measurements[0].includes(t) && !t.rev_id && t.floor_level === 'Level 2');
  }
});

S('held_answers', async () => {
  const W = world({ sheets: 2 });
  await W.arm('Outlets'); await W.tap(); await W.tap();
  W.go(1);
  W.f.answer = { spec: spec('Switches', 'Level 2') };
  const asked = W.f.asked;
  await W.tap();                                // the form: Switches
  W.f.answer = null;
  eq('the form: Switches', W.f.asked, asked + 1);
  W.undo();                                     // its first tap back
  await W.tap();                                // made from its answers
  heldOn(W, 'Switches made again', 1, 'Level 2', 1, 'Switches');
  W.go(0);
  W.typeBox('');
  await W.tap();                                // back onto the Outlets
  heldOn(W, 'back onto the Outlets', 0, 'Level 1', 3);
  for (let i = 0; i < 4; i += 1) W.undo();      // every tap since
  eq('all of it taken back', [W.counts(0), W.counts(1, 'Switches')], [[], []]);
  W.f.answer = { spec: spec('Lights', 'Level 3') };
  await W.tap();
  eq('no form: made from its answers', W.f.asked, asked + 1);
  eq('every tap of the Outlets back: made again, not another item from Switches\' answers',
    W.p.measurements[0].filter(m => m.type === 'count').map(m => [m.name, m.floor_level]),
    [['Outlets', 'Level 1']]);
  heldOn(W, 'the Outlets', 0, 'Level 1', 1);
});

S('held_after_undo', async () => {
  // Two Outlets held on sheet one, the Level 1 left first and the Level 2
  // later; then a Switches made there by the Item box's name and taken away
  // again -- Ctrl+Z of its only tap (with a tap on sheet two between), or
  // its Delete. The next tap on sheet one, with 'Outlets' typed or the box
  // emptied, goes onto the Level 2: the newest count still held there. Not
  // the Level 1 held before it, not the first Outlets by name, and no form.
  //
  // How the Level 2 comes to be held on sheet one is the web's own way: the
  // desktop's (the box emptied BY HAND keeps the last name, so the form asks
  // beside a held count) cannot happen here -- emptying the box by hand is
  // the desktop's x on the web (the user's decision of 2026-11-05: no x).
  // So the Level 2 starts as a Switches made by name on sheet one and is
  // renamed by Properties, which keeps the taps on it. For the same reason
  // the desktop's "leave by a new Outlets made on sheet two by the name in
  // the box" is not reachable; the Level 2 leaves by going back to the
  // Switches held on sheet two.
  for (const [gone, box] of [['undo', 'typed'], ['delete', 'typed'], ['undo', 'emptied'],
    ['delete', 'emptied']]) {
    const flow = `${gone}, box ${box}`;
    const W = world({ sheets: 2 });
    await W.arm('Outlets'); await W.tap(); await W.tap();
    W.go(1);
    W.f.answer = { spec: spec('Switches') };
    const asked = W.f.asked;
    await W.tap();                              // the form: Switches
    W.f.answer = null;
    eq(`${flow}: the form`, W.f.asked, asked + 1);
    W.go(0);
    await W.tap();                              // a Switches here, by the box's name...
    W.p.updateItem(W.c.countTarget._uid, { name: 'Outlets', label: 'Outlets', floor_level: 'Level 2' });
    await W.tap();                              // ...renamed: the Level 2
    heldOn(W, `${flow}: the Level 2`, 0, 'Level 2', 2);
    W.go(1);
    await W.tap();                              // back onto the Switches held here
    heldOn(W, `${flow}: sheet two's Switches`, 1, 'Level 1', 2, 'Switches');
    W.go(0);
    W.typeBox('Switches');
    await W.tap();                              // Switches made here by name
    eq(`${flow}: a Switches on sheet one`, W.counts(0, 'Switches'), [['', 1]]);
    if (gone === 'undo') {
      W.undo();                                 // its only tap back
      W.go(1);
      await W.tap();
      heldOn(W, `${flow}: sheet two's Switches again`, 1, 'Level 1', 3, 'Switches');
      W.go(0);
    } else {
      W.p.removeItems([W.item('Switches', null, 0)._uid]);
    }
    eq(`${flow}: the Switches gone from sheet one`, W.counts(0, 'Switches'), []);
    W.typeBox(box === 'typed' ? 'Outlets' : '');
    W.f.answer = { spec: spec('Lights', 'Level 3') };
    const a2 = W.f.asked;
    await W.tap();
    eq(`${flow}: no form`, W.f.asked, a2);
    eq(`${flow}: onto the Level 2 counted there last, not the Level 1 held before it or the first by name`,
      W.counts(0), [['Level 1', 2], ['Level 2', 3]]);
    heldOn(W, flow, 0, 'Level 2', 3);
  }
});

// ── the materials manager cancelled (assemblies.js), on stand-in elements ──

class El {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = doc; this.children = [];
    this.parentNode = null; this.hidden = false; this.id = ''; this.className = '';
    this.style = {}; this._text = ''; this._l = []; this.title = '';
    const cls = () => this.className.split(/\s+/).filter(Boolean);
    this.classList = {
      add: c => { if (!cls().includes(c)) this.className = [...cls(), c].join(' '); },
      remove: c => { this.className = cls().filter(x => x !== c).join(' '); },
      contains: c => cls().includes(c),
    };
  }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  appendChild(c) { c.remove(); c.parentNode = this; this.children.push(c); return c; }
  append(...cs) { for (const c of cs) this.appendChild(c); }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(x => x !== this);
    this.parentNode = null;
  }
  addEventListener(t, fn, o) { this._l.push({ t, fn, capture: o === true || !!(o && o.capture) }); }
  removeEventListener(t, fn) { this._l = this._l.filter(l => !(l.t === t && l.fn === fn)); }
  descendants() { return this.children.flatMap(c => [c, ...c.descendants()]); }
  querySelector(sel) {
    const alts = sel.split(',').map(s => s.trim().split('.'));
    return this.descendants().find(e => alts.some(([tag, cl]) =>
      e.tagName === tag.toUpperCase() && (!cl || e.classList.contains(cl)))) || null;
  }
  focus() {} select() {} setAttribute() {}
  /** A click, delivered to this element's own listeners and then up. */
  click() {
    const ev = { type: 'click', target: this, stopPropagation() {}, preventDefault() {} };
    for (let x = this; x; x = x.parentNode) for (const l of x._l) if (l.t === 'click') l.fn.call(x, ev);
  }
}
function stubDocument() {
  const doc = new El('#document', null);
  doc.ownerDocument = doc;
  doc.createElement = tag => new El(tag, doc);
  doc.body = doc.appendChild(doc.createElement('body'));
  const modal = doc.body.appendChild(doc.createElement('div'));
  modal.id = 'modal';
  doc.getElementById = id => doc.descendants().find(e => e.id === id) || null;
  doc.all = pred => doc.descendants().filter(pred);
  return doc;
}

async function materialsCancelled(W, m) {
  // main.js openMaterials, lifted by text, with the real manager behind it
  // and its own Cancel pressed.
  const src = await readFile(new URL('../js/main.js', import.meta.url), 'utf-8');
  const i = src.indexOf('async function openMaterials(');
  const j = src.indexOf('\n}\n', i);
  let body = src.slice(i, j + 2);
  const dyn = "await import('./ui/assemblies.js')";
  if (!body.includes(dyn)) throw new Error('openMaterials no longer imports the manager as it did');
  body = body.replace(dyn, 'await importAssemblies()');
  const openMaterials = new Function('controller', 'setStatus', 'app', 'importAssemblies',
    `${body}\nreturn openMaterials;`)(W.c, () => {}, { project: W.p },
    () => import('../js/ui/assemblies.js'));
  const doc = stubDocument();
  const was = globalThis.document;
  globalThis.document = doc;
  try {
    const done = openMaterials(m);
    await tick();
    const cancel = doc.all(e => e.tagName === 'BUTTON' && e.textContent === 'Cancel');
    if (cancel.length !== 1) throw new Error(`the manager's Cancel: ${cancel.length}`);
    cancel[0].click();
    await done;
  } finally {
    globalThis.document = was;
  }
}

S('mat_cancel', async () => {
  // (a) on a same-name count beside the armed one
  {
    const W = world();
    await W.arm('Outlets'); await W.tap(); await W.tap(); await W.tap();
    await W.pan();
    await W.arm('Outlets', 'Level 2'); await W.tap();
    await materialsCancelled(W, W.item('Outlets', 'Level 1'));
    const asked = W.f.asked;
    W.undo();                                   // Level 2's first mark
    eq('(a) the Level 2 taken back', W.counts(), [['Level 1', 3]]);
    await W.tap(); await W.tap();
    eq('(a) no form', W.f.asked, asked);
    eq('(a) not onto the Level 1 whose materials he opened', W.counts(), [['Level 1', 3], ['Level 2', 2]]);
    eq('(a) armed on the Level 2', W.armed(), ['Outlets', 'Level 2', 2]);
  }
  // (b) on the armed count itself, a count deleted in front of it and put
  //     back by the Ctrl+Z
  {
    const W = world();
    await W.arm('Switches'); await W.tap(); await W.tap();
    await W.pan();
    await W.arm('Outlets'); await W.tap(); await W.tap();
    W.p.removeItems([W.item('Switches')._uid]);
    await materialsCancelled(W, W.item('Outlets'));
    const asked = W.f.asked;
    W.undo();                                   // the delete: Switches back
    eq('(b) Switches back', W.marks(), { Switches: [2], Outlets: [2] });
    await W.tap();
    eq('(b) no form', W.f.asked, asked);
    armedIs(W, '(b) the armed count', 'Outlets', 3, { Switches: [2], Outlets: [3] });
  }
});

S('mat_cancel_writes', async () => {
  const W = world();
  await W.arm('Outlets'); await W.tap(); await W.tap();
  const o = W.item('Outlets');
  ok('no materials yet', !('associated_items' in o));
  const depth = W.p._undo.length;
  const before = JSON.stringify(o);
  await materialsCancelled(W, o);
  eq('Cancel made no undo level', W.p._undo.length, depth);
  eq('Cancel wrote nothing on the item (no empty materials list)', JSON.stringify(W.item('Outlets')), before);
});

// ── the web's own ─────────────────────────────────────────────────────────

S('web_box', async () => {
  // The Item box rules the typed-name rule leans on (the user's decision 3).
  const W = world();
  await W.arm('Outlets');
  eq('Count picked up from Pan: the box starts empty', W.c.options.pendingName, '');
  eq('...but the tool knows the name it counts under', W.c.countNamed, 'Outlets');
  await W.arm('Switches');
  eq('Count pressed again while counting: the box keeps the armed name', W.c.options.pendingName, 'Switches');
  await W.tool('area');
  eq('another tool picked up: the box is emptied', W.c.options.pendingName, '');
  W.typeBox('Slab');
  await W.tool('area');
  eq('the same tool pressed again keeps what he typed', W.c.options.pendingName, 'Slab');
  await W.tool('pan');
  eq('Pan: emptied', W.c.options.pendingName, '');
  // the form at a tap shows the name it gave in the box
  await W.arm('Outlets');
  W.go(0);
  W.p.removeItems([...W.p.allItems()].map(([, m]) => m._uid));
  W.f.answer = { spec: spec('Lights') };
  W.c.countSpec = null;                         // spent, nothing to go on
  await W.tap();
  eq('the form at a tap puts its name in the box', [W.c.options.pendingName, W.c.countNamed], ['Lights', 'Lights']);
  // a cancelled arming form leaves the box and the tool alone
  await W.pan();
  W.f.answer = null;
  eq('a cancelled form leaves Pan', [await W.c.setMode('count'), W.c.mode], [false, 'pan']);
});

S('web_framed', async () => {
  // A Posts/Hardware count the desktop framed (its lumber and hardware lines
  // made by a framing engine the web does not have). Taken off entirely by a
  // step, the next tap ASKS -- never made again bare -- and the status line
  // says why (the user's decision 2). Joined, nothing of its framing moves,
  // and every such tap says the lumber was not worked out again: the
  // engine's lines are TOTALS for the posts it saw (framing.py material()),
  // so after a tap here they read 2 under a count of 3, on the web's report
  // and on the desktop's until it touches that count again.
  const lines = [{ name: '6x6 post', qty: 2, qty_mode: 'total', unit: 'EA', framing_gen: true },
    { name: 'Post base', qty: 2, qty_mode: 'total', unit: 'EA', framing_gen: true }];
  const POST = seed('Posts 6x6', 'Level 1', 2, { category: 'Wood Framing',
    framing: { assembly: 'post', params: { height_ft: 8 } }, framing_suppressed: ['Post cap'],
    associated_items: lines });
  for (const box of ['the box empty', 'the box naming it']) {
    const W = world({ items: { 0: [POST] } });
    await W.carry('Posts 6x6');
    if (box === 'the box naming it') await W.carry('Posts 6x6');   // pressed again, in Count
    eq(`${box}: the box`, W.c.options.pendingName, box === 'the box empty' ? '' : 'Posts 6x6');
    const keep = m => JSON.stringify([m.framing, m.framing_suppressed, m.associated_items]);
    const was = keep(W.item('Posts 6x6'));
    const n0 = W.said.length;
    await W.tap();
    armedIs(W, `${box}: carried on`, 'Posts 6x6', 3, { 'Posts 6x6': [3] });
    eq(`${box}: a tap on a framed count leaves its framing as it was`, keep(W.item('Posts 6x6')), was);
    eq(`${box}: ...so its lumber lines still read the desktop's 2 under a count of 3`,
      [W.item('Posts 6x6').value, W.item('Posts 6x6').associated_items.map(a => a.qty)], [3, [2, 2]]);
    const joined = W.said.slice(n0).join(' | ');
    ok(`${box}: and the tap says so -- the lumber is not worked out again here`,
      /Posts 6x6/.test(joined) && /is at 3/.test(joined) && /lumber/.test(joined)
      && /cannot work them out again/.test(joined), joined);
    W.p.removeItems([W.item('Posts 6x6')._uid]);       // deleted from the list...
    W.undo();                                          // ...back...
    eq(`${box}: back, and found again`, W.armed(), ['Posts 6x6', 'Level 1', 3]);
    W.redo();                                          // ...and taken off by a step
    eq(`${box}: taken off`, W.marks(), {});
    ok(`${box}: nothing armed to make it from`, !W.c.countSpec);
    const said = W.said[W.said.length - 1] || '';
    ok(`${box}: the status line says why`, /Posts 6x6/.test(said) && /framing/i.test(said)
      && /asks/.test(said), said);
    W.f.answer = null;                                 // he cancels the form
    const asked = W.f.asked;
    const n1 = W.said.length;
    await W.tap();
    eq(`${box}: the next tap asks the form`, W.f.asked, asked + 1);
    // The status line at the step is long gone (six seconds) by the tap:
    // the form itself says why it asked, and the status line says it again.
    ok(`${box}: the form says why it asked`, /Posts 6x6/.test(W.f.note) && /framing/i.test(W.f.note)
      && /this tap asks/.test(W.f.note), W.f.note);
    eq(`${box}: ...and so does the status line, at the tap`, W.said.slice(n1), [W.f.note]);
    eq(`${box}: and, cancelled, makes nothing`, W.marks(), {});
    ok(`${box}: nothing in the job carries a copied framing`,
      ![...W.p.allItems()].some(([, m]) => 'framing' in m));
    W.redo();                                          // nothing to redo now? (the delete was redone)
    W.undo();                                          // the delete undone: it is back
    eq(`${box}: Ctrl+Z brings it back, found again`, W.armed(), ['Posts 6x6', 'Level 1', 3]);
    await W.tap();
    eq(`${box}: and the tap joins it, no form`, [W.f.asked, W.marks()], [asked + 1, { 'Posts 6x6': [4] }]);
  }
  // Not counting any more (Pan): the same step says nothing about a tap.
  {
    const W = world({ items: { 0: [POST] } });
    await W.carry('Posts 6x6'); await W.tap();
    W.p.removeItems([W.item('Posts 6x6')._uid]);
    W.undo();
    await W.pan();
    const n = W.said.length;
    W.redo();
    eq('in Pan, taking it off says nothing about the next tap',
      W.said.slice(n).filter(t => /framing/.test(t)), []);
  }
  // A spec that carries framing never writes it.
  {
    const W = world();
    W.c.mode = 'count';
    W.c.armCount(null, { ...spec('Posts'), framing: { assembly: 'post' } });
    await W.tap();
    ok('answers carrying framing make a count without it', !('framing' in W.item('Posts')));
  }
});

S('web_framed_name', async () => {
  // A NEW count under the name of one the desktop framed. The desktop's
  // by-name path hands the framing over from the same name on another sheet
  // (_inherit_count_framing); this app has no engine to do it with, so made
  // here it would be a Posts row that prices no lumber, with nothing said.
  // So the tap asks, and says why (the user's decision 2). Joining one of
  // that name on the drawing on screen is as it was.
  const lines = [{ name: '6x6 post', qty: 2, qty_mode: 'total', unit: 'EA', framing_gen: true }];
  const POST = seed('Posts', 'Level 1', 2, { category: 'Wood Framing',
    framing: { assembly: 'post', params: { height_ft: 8 } }, associated_items: lines });
  const framedWhy = (W, label, asked, n) => {
    eq(`${label}: the tap asked the form`, W.f.asked, asked + 1);
    ok(`${label}: the form says why`, /Posts/.test(W.f.note) && /framing/i.test(W.f.note), W.f.note);
    eq(`${label}: ...and so does the status line`, W.said.slice(n), [W.f.note]);
  };
  {
    // Count pressed again: the box shows "Posts"; another sheet has none
    const W = world({ sheets: 2, items: { 0: [POST] } });
    await W.carry('Posts'); await W.tap();
    await W.carry('Posts');
    eq('the box shows the framed count\'s name', W.c.options.pendingName, 'Posts');
    W.go(1);
    const asked = W.f.asked, n = W.said.length;
    await W.tap();
    framedWhy(W, 'another sheet, the box naming a framed count', asked, n);
    eq('...and nothing was made there by its name', W.marks(1), {});
    // answered, it is made: from the answers he gave, with no framing copied
    W.f.answer = { spec: spec('Posts', 'Level 1', 'Wood Framing') };
    await W.tap();
    W.f.answer = null;
    eq('answered: the count he asked for, from the form', W.marks(1), { Posts: [1] });
    ok('...carrying no framing of its own', !('framing' in W.item('Posts', null, 1)));
    const a2 = W.f.asked;
    await W.tap();
    eq('the taps after it join it, no form', [W.f.asked - a2, W.marks(1)], [0, { Posts: [2] }]);
  }
  {
    // the same name TYPED on a sheet that has none
    const W = world({ sheets: 2, items: { 0: [POST] } });
    await W.arm('Outlets'); await W.tap();
    W.go(1); W.typeBox('Posts');
    const asked = W.f.asked, n = W.said.length;
    await W.tap();
    framedWhy(W, 'a framed count\'s name typed on another sheet', asked, n);
    eq('...and nothing made by its name', W.marks(1), {});
    // a name nobody framed still counts with no form
    W.typeBox('Washers');
    const a2 = W.f.asked;
    await W.tap();
    eq('a plain typed name: no form, made', [W.f.asked - a2, W.marks(1)], [0, { Washers: [1] }]);
  }
  for (const how of ['the list\'s Delete', 'the drawing\'s Delete']) {
    // carried on, the box naming it, then deleted: the next tap would have
    // made it again by the name in the box -- bare
    const W = world({ items: { 0: [POST] } });
    await W.carry('Posts'); await W.carry('Posts');
    await W.tap();
    const uid = W.item('Posts')._uid;
    if (how === 'the list\'s Delete') W.p.removeItems([uid]);
    else { W.c.select([uid]); W.c.deleteSelected(); }
    eq(`${how}: gone`, W.marks(), {});
    const asked = W.f.asked, n = W.said.length;
    await W.tap();
    framedWhy(W, `${how} of the framed count being counted, the box naming it`, asked, n);
    ok(`${how}: the words say it was deleted`, /deleted/.test(W.f.note), W.f.note);
    eq(`${how}: and nothing made again bare`, W.marks(), {});
    W.undo();                                         // the delete undone: it is back
    const a2 = W.f.asked;
    await W.tap();
    eq(`${how}, undone: the tap joins it again, no form`, [W.f.asked - a2, W.marks()], [0, { Posts: [4] }]);
  }
  {
    // the box naming it on the sheet it is on: joined by its name, as before
    const W = world({ sheets: 2, items: { 0: [POST] } });
    await W.arm('Outlets'); await W.tap();
    W.typeBox('Posts');
    const asked = W.f.asked;
    await W.tap();
    eq('the box naming a framed count on this drawing: joined, no form',
      [W.f.asked - asked, W.marks()], [0, { Posts: [3], Outlets: [1] }]);
  }
  {
    // A framed count a step took off, then a NEW name typed: that name is
    // not framed, and it counts with no form -- the framed refusal is the
    // framed count's, not the tool's.
    const W = world({ items: { 0: [POST] } });
    await W.carry('Posts');
    W.p.removeItems([W.item('Posts')._uid]); W.undo(); W.redo();
    ok('set-up: taken off by a step, the next tap must ask', W.c.countMustAsk === true);
    W.typeBox('Washers');
    let asked = W.f.asked;
    await W.tap();
    eq('typed Washers after it: no form, Washers made', [W.f.asked - asked, W.marks()], [0, { Washers: [1] }]);
    // ...and after another job comes in, too
    const V = world({ items: { 0: [POST] } });
    await V.carry('Posts');
    V.p.removeItems([V.item('Posts')._uid]); V.undo(); V.redo();
    V.p.loadFrom(jobOf({ sheets: 1 }));
    V.typeBox('Washers');
    asked = V.f.asked;
    await V.tap();
    eq('...and in the next job: no form, Washers made', [V.f.asked - asked, V.marks()], [0, { Washers: [1] }]);
  }
  // THE FORM'S DOOR. The desktop hands the framing over on the armed
  // answers' path too: _add_count_point's spec branch ends in
  // _inherit_count_framing, and so does its form at a click. A name given in
  // the Count form made a bare Posts on another sheet with nothing said --
  // while the same name typed in the box asked -- and made it bare again
  // after a Ctrl+Z of every mark. Now the armed answers ask as the box does,
  // and keep the answers for the tap after a Cancel; and the form's own
  // answer is made (it WAS the asking) and the status line says that the
  // count carries none of that framing.
  const bareSaid = (W, label, n, name = 'Posts') => {
    const said = W.said.slice(n);
    const last = said[said.length - 1] || '';
    ok(`${label}: the status line says it was made with none of the desktop's framing`,
      last.includes(`“${name}”`) && /without Posts\/Hardware framing/.test(last)
      && /no lumber or hardware/.test(last), JSON.stringify(said));
  };
  for (const how of ['Count picked up from Pan', 'Count pressed again, the box naming it']) {
    const W = world({ sheets: 2, items: { 0: [POST] } });
    W.go(1);
    await W.arm('Posts', 'Level 1', 'Wood Framing');   // a NEW "Posts", named in the form
    if (how !== 'Count picked up from Pan') await W.arm('Posts', 'Level 1', 'Wood Framing');
    eq(`${how}: the box`, W.c.options.pendingName, how === 'Count picked up from Pan' ? '' : 'Posts');
    let asked = W.f.asked, n = W.said.length;
    await W.tap();
    framedWhy(W, `${how}: arming form named a framed count, other sheet, tap`, asked, n);
    ok(`${how}: ...in the words the box's door uses`, /elsewhere in this job/.test(W.f.note), W.f.note);
    eq(`${how}: nothing made from the answers`, W.marks(1), {});
    ok(`${how}: ...and the answers kept`, !!W.c.countSpec && W.c.countSpec.name === 'Posts');
    asked = W.f.asked; n = W.said.length;
    await W.tap();
    framedWhy(W, `${how}: cancelled, the next tap asks again`, asked, n);
    // answered: the count he asked for, from the form, with no framing copied
    W.f.answer = { spec: spec('Posts', 'Level 1', 'Wood Framing') };
    n = W.said.length;
    await W.tap();
    W.f.answer = null;
    eq(`${how}: answered, made`, W.marks(1), { Posts: [1] });
    ok(`${how}: ...carrying no framing`, !('framing' in W.item('Posts', null, 1)));
    bareSaid(W, `${how}: answered`, n);
    asked = W.f.asked;
    await W.tap();
    eq(`${how}: the taps after it join it, no form`, [W.f.asked - asked, W.marks(1)], [0, { Posts: [2] }]);
    // its Ctrl+Z re-tap: every mark back arms its answers again; made from
    // them it would be bare again with nothing said -- it asks
    W.undo(); W.undo();
    eq(`${how}: every mark back`, W.marks(1), {});
    ok(`${how}: ...its answers armed again`, !!W.c.countSpec);
    asked = W.f.asked; n = W.said.length;
    await W.tap();
    framedWhy(W, `${how}: arming form named a framed count, Ctrl+Z of every mark, tap`, asked, n);
    eq(`${how}: ...nothing made again bare`, W.marks(1), {});
  }
  {
    // The form a TAP asks -- nothing armed, the box empty, so it opens with
    // no note -- named a framed count's name: made, and said after.
    const W = world({ sheets: 2, items: { 0: [POST] } });
    await W.arm('Outlets'); await W.tap();
    W.go(1);
    eq('set-up: the box is empty', W.c.options.pendingName, '');
    W.f.answer = { spec: spec('Posts', 'Level 1', 'Wood Framing') };
    const asked = W.f.asked, n = W.said.length;
    await W.tap();
    W.f.answer = null;
    eq('the form at a tap named a framed count: it asked once, with no note, and made it',
      [W.f.asked - asked, W.f.note, W.marks(1)], [1, '', { Posts: [1] }]);
    ok('...carrying no framing', !('framing' in W.item('Posts', null, 1)));
    bareSaid(W, 'the form at a tap named a framed count', n);
    // and a plain name answered there says nothing of the sort
    W.typeBox(''); W.c.forgetArmedCount();
    W.f.answer = { spec: spec('Washers') };
    const n2 = W.said.length;
    await W.tap();
    W.f.answer = null;
    eq('the form at a tap named a plain count: nothing said of framing',
      W.said.slice(n2).filter(t => /framing/i.test(t)), []);
  }
  {
    // The form taking the place of a framed count a step took off (the
    // decision-2 ask) answered with its name: made bare, and said.
    const W = world({ items: { 0: [POST] } });
    await W.carry('Posts');
    W.p.removeItems([W.item('Posts')._uid]); W.undo(); W.redo();
    W.f.answer = { spec: spec('Posts', 'Level 1', 'Wood Framing') };
    const n = W.said.length;
    await W.tap();
    W.f.answer = null;
    eq('the framed count taken off, the form answered with its name: made', W.marks(), { Posts: [1] });
    bareSaid(W, 'the framed count taken off, the form answered with its name', n);
  }
  {
    // A NEW "Posts" beside the framed one, on its own drawing: the desktop
    // hands nothing over from a namesake on the drawing on screen (that is
    // what Carry on with continues) -- made bare there too, no form, and
    // nothing said: the desktop's own count would be the same.
    const W = world({ items: { 0: [POST] } });
    await W.arm('Posts', 'Level 2', 'Wood Framing');
    const asked = W.f.asked, n = W.said.length;
    await W.tap();
    eq('a new namesake on the framed one\'s own drawing: made, no form',
      [W.f.asked - asked, W.counts(0, 'Posts')], [0, [['Level 1', 2], ['Level 2', 1]]]);
    eq('...and nothing said of framing', W.said.slice(n).filter(t => /framing/i.test(t)), []);
  }
  const REV1 = [{ id: 'r1', date: '03/01/2026', description: 'B1', page_labels: ['E1.0'],
    match: { 0: 0 }, extra: {} }];
  {
    // ...but on ANOTHER drawing of that sheet -- its revision -- the desktop
    // hands it over, so the tap asks.
    const W = world({ sheets: 2, revisions: REV1, items: { 0: [POST] } });
    W.c.setVersionView('r1', 0);
    await W.arm('Posts', 'Level 1', 'Wood Framing');
    const asked = W.f.asked, n = W.said.length;
    await W.tap();
    framedWhy(W, 'the revision of the framed count\'s sheet, the arming form named it', asked, n);
    eq('...nothing made on it', W.marks(0), { Posts: [2] });
  }
  for (const booked of [false, true]) {
    // A framed count on a drawing the job is NOT priced from hands nothing
    // over on the desktop (only drawings the job is priced from do): made
    // with no form, by either door. Booked to that drawing, it is priced,
    // and both doors ask.
    const ON_REV = { ...POST, rev_id: 'r1', rev_page: 0 };
    const label = booked ? 'the framed count on a revision the sheet is booked to'
      : 'the framed count on a revision the sheet is not priced from';
    for (const door of ['box', 'form']) {
      const W = world({ sheets: 2, revisions: REV1, items: { 0: [ON_REV] } });
      if (booked) W.p.metadata.sheet_version = { 0: 'r1' };
      W.go(1);
      if (door === 'box') { await W.arm('Outlets'); W.typeBox('Posts'); } else await W.arm('Posts', 'Level 1', 'Wood Framing');
      const asked = W.f.asked;
      await W.tap();
      eq(`${label}, the ${door}'s door: ${booked ? 'asks' : 'made, no form'}`,
        [W.f.asked - asked, W.marks(1)], booked ? [1, {}] : [0, { Posts: [1] }]);
    }
  }
  {
    // One name, one answer, whichever door it came in by: the same sheet
    // and the same job, typed in the box or named in the arming form.
    const situations = [
      ['another sheet', { sheets: 2, items: { 0: [POST] } }, 1],
      ['a plain namesake elsewhere', { sheets: 2, items: { 0: [seed('Posts', 'Level 1', 1)] } }, 1],
      ['a framed count of another name', { sheets: 2, items: { 0: [{ ...POST, name: 'Hangers', label: 'Hangers' }] } }, 1],
    ];
    for (const [what, opts, pg] of situations) {
      const res = [];
      for (const door of ['box', 'form']) {
        const W = world(opts);
        W.go(pg);
        if (door === 'box') { await W.arm('Outlets'); W.typeBox('Posts'); } else await W.arm('Posts', 'Level 1', 'Wood Framing');
        const asked = W.f.asked;
        await W.tap();
        res.push([W.f.asked - asked, W.marks(pg)]);
      }
      eq(`${what}: the box's door and the form's door give the same answer`, res[0], res[1]);
    }
  }
});

S('web_found_again', async () => {
  // Every mark taken back arms the answers again; a Ctrl+Y that brings the
  // count back finds it, and the answers are put away (desktop
  // _rearm_count): the taps go onto the count, and a tap on another sheet
  // makes nothing from answers that belong to a count already made.
  const W = world({ sheets: 2, items: { 0: [seed('Doors', 'Level 1', 1)] } });
  await W.arm('Outlets');
  await W.tap(); await W.tap();
  W.undo(); W.undo();
  ok('every mark back: the answers armed again', !!W.c.countSpec);
  W.redo();
  eq('Ctrl+Y: found again, the answers put away', [W.c.countSpec, W.armed()], [null, ['Outlets', 'Level 1', 1]]);
  W.go(1);
  const asked = W.f.asked;
  await W.tap();
  eq('a tap on another sheet: the form asks (the box is empty), nothing made from the answers',
    [W.f.asked - asked, W.marks(1)], [1, {}]);
  W.go(0);
  W.f.answer = null;
  await W.tap();
  eq('back on sheet one: onto the Outlets found again', W.marks(0), { Doors: [1], Outlets: [2] });
});

S('web_restore', async () => {
  // Every path that replaces the item objects finds the counts again: an
  // undo and a redo (above), and a long press that puts a trembled shape
  // back (controller _armLongPress -> project.restore).
  const W = world({ sheets: 2, items: { 0: [WALL] } });
  await W.arm('Outlets'); await W.tap(); await W.tap();
  W.go(1);
  W.f.answer = { spec: spec('Switches') };
  await W.tap();
  W.f.answer = null;
  const heldBefore = W.c.countLeft.slice();
  eq('Outlets held on sheet one', heldBefore.map(m => m.name), ['Outlets']);
  W.go(0);
  W.p.restore(W.p.snapshot());                  // what the long press does
  ok('the armed count is the store\'s own copy after a restore',
    W.p.measurements[1].includes(W.c.countTarget));
  ok('...and so is the one held on sheet one',
    W.c.countLeft.length === 1 && W.p.measurements[0].includes(W.c.countLeft[0]));
  W.typeBox('');                                // the form had put Switches there
  await W.tap();
  eq('back on sheet one: onto the Outlets held there', W.counts(0), [['Level 1', 3]]);

  // the real long press: Pan, a finger on the Wall's corner trembles, holds
  const V = world({ items: { 0: [WALL] } });
  await V.arm('Outlets'); await V.tap();
  await V.pan();
  const target = V.c.countTarget;
  const on = {};
  V.c.canvas.addEventListener = (t, fn) => { on[t] = fn; };
  V.c._bind();
  V.c.host.showItemMenu = () => {};
  const ev = (x, y, type) => ({ pointerId: 3, pointerType: 'touch', button: 0, clientX: x, clientY: y,
    type, shiftKey: false, ctrlKey: false, metaKey: false, preventDefault() {} });
  V.c.uiScale = 1;
  V.c.select([V.item('Wall')._uid]);
  on.pointerdown(ev(100, 1500, 'pointerdown'));
  on.pointermove(ev(102, 1501, 'pointermove'));
  ok('the tremble moved the corner', V.c._dragMoved === true);
  await new Promise(r => setTimeout(r, 560));
  on.pointerup(ev(102, 1501, 'pointerup'));
  ok('the long press put the Wall back', V.item('Wall').points[0][0] === 100);
  ok('the count held over the long press is the store\'s own',
    V.c.countTarget !== target && V.p.measurements[0].includes(V.c.countTarget));
});

S('web_carry_list', async () => {
  // The arming form offers only the counts on the drawing on screen, and a
  // pick made while a step replaced every item is found again.
  const W = world({ sheets: 1, revisions: [{ id: 'r1', date: '03/01/2026', description: 'B1',
    page_labels: ['E1.0'], match: { 0: 0 }, extra: {} }],
  items: { 0: [seed('Outlets', 'Level 1', 2), seed('Switches', 'Level 1', 1, { rev_id: 'r1', rev_page: 0 })] } });
  W.f.answer = () => null;
  await W.c.setMode('count');
  eq('the sheet\'s own drawing: its own counts only', W.f.offered.map(m => m.name), ['Outlets']);
  W.c.setVersionView('r1', 0);
  await W.c.setMode('count');
  eq('the revision: its own', W.f.offered.map(m => m.name), ['Switches']);
  W.c.setVersionView('', null);
  await W.arm('Lights'); await W.tap();
  W.f.answer = ex => { W.p.undo(); W.p.redo(); return { continueItem: ex.find(m => m.name === 'Outlets') }; };
  eq('a pick from a list a step replaced arms', await W.c.setMode('count'), true);
  ok('...the store\'s own Outlets', W.p.measurements[0].includes(W.c.countTarget)
    && W.c.countTarget.name === 'Outlets');
  await W.tap();
  eq('and the tap lands on it', W.counts(), [['Level 1', 3]]);

  // ...and the form a TAP asks, answered the same way
  const V = world({ items: { 0: [seed('Outlets', 'Level 1', 2)] } });
  V.c.mode = 'count';                           // nothing armed, the box empty
  V.p.setVisible([V.item('Outlets')._uid], true);   // a step to take back
  V.f.answer = ex => { V.p.undo(); V.p.redo(); return { continueItem: ex.find(m => m.name === 'Outlets') }; };
  await V.tap();
  V.f.answer = null;
  eq('a pick at the tap from a list a step replaced: the tap lands on the store\'s own',
    V.counts(), [['Level 1', 3]]);
  ok('...and it is armed', V.p.measurements[0].includes(V.c.countTarget));
});

S('web_forget', async () => {
  // What the new state is dropped by: a new choice and a job switch.
  const W = world({ sheets: 2 });
  await W.arm('Outlets'); await W.tap();
  W.go(1);
  W.f.answer = { spec: spec('Switches') };
  await W.tap();
  W.f.answer = null;
  W.undo();
  ok('set-up: answers armed again, a count held', !!W.c.countSpec && W.c.countLeft.length === 1);
  W.p.loadFrom(job2());
  eq('another job: nothing armed, no answers, nothing held, no name',
    [W.c.countTarget, W.c.countSpec, W.c.countAnswers, W.c.countLeft, W.c.countNamed, W.c.countMustAsk],
    [null, null, null, [], '', false]);
});

// ── run the sections ─────────────────────────────────────────────────────

const PORTED = new Set();
for (const [tag, fn] of SECTIONS) {
  console.log(`\n-- ${tag} --`);
  const before = fails;
  try {
    await fn();
  } catch (err) {
    fails += 1;
    console.log(`FAIL ${tag} threw: ${err.stack || err.message}`);
  }
  console.log(`   ${tag} ${fails === before ? 'OK' : 'FAILED'}`);
  PORTED.add(tag);
}

// The desktop sections that cannot be ported, and why. Every tag of the
// desktop's SECTIONS must be ported above or listed here.
const NOT_APPLICABLE = {
  posts: 'Tool Box Posts/Hardware and its framing engine are desktop only; the web asks the '
    + 'form instead of making a framed count again (web_framed, the user\'s decision 2)',
  posts_continue: 'attaching framing through the Tool Box is desktop only (no framing engine '
    + 'on the web); joining a framed count leaves its framing as it was (web_framed)',
  group: 'the web lists no Groups and files nothing in one (items-panel.js)',
  rename_all: 'the web has no heading rename yet (plan round 7)',
};

// ── the differential, and the tag check ──────────────────────────────────

function sortKeys(o) {
  if (Array.isArray(o)) return o.map(sortKeys);
  if (o && typeof o === 'object') return Object.fromEntries(Object.keys(o).sort().map(k => [k, sortKeys(o[k])]));
  return o;
}

const FULL = { type: 'count', name: 'Outlets', label: 'Outlets', notes: 'n', purpose: 'Receptacles',
  color: [1, 0, 0, 1], floor_level: 'Level 2', category: 'Electrical', sub_category: 'Rough-in',
  cost_type: 'labor', unit_cost: 12.5, catalog_code: 'OUTLET-STD', catalog_unit: 'EA', rate_unit: 'EA',
  points: [[1, 1]], value: 1, visible: false, sort_order: 300, count_number: 4, _uid: 'm-1',
  rev_id: 'r2', rev_page: 0 };
const REARM = [
  { what: 'carried on', where: 'taken', target: FULL, answers: null },
  { what: 'armed from the form, refiled since', where: 'taken',
    target: { ...FULL, floor_level: 'Level 9', category: '' },
    answers: { name: 'Outlets', floor_level: 'Level 1', category: 'Electrical', color: [0, 1, 0, 1],
      catalog: { code: 'X' }, unit_cost: 3 } },
  { what: 'a bare count', where: 'taken', target: { type: 'count', name: 'Bare', points: [[0, 0]] }, answers: null },
  { what: 'framed', where: 'taken', target: { ...FULL, framing: { assembly: 'post', params: { h: 8 } } }, answers: null },
  { what: 'answers framed, the item not', where: 'taken', target: { type: 'count', name: 'NoClass', points: [[0, 0]] },
    answers: { name: 'NoClass', floor_level: 'L1', framing: { assembly: 'post' } } },
  { what: 'an empty framing is no framing', where: 'taken', target: { ...FULL, framing: {} }, answers: null },
  { what: 'empty answers are answers', where: 'taken', target: { ...FULL, sub_category: 'x' }, answers: {} },
  { what: 'class fields absent from both', where: 'taken', target: { type: 'count', name: 'A', points: [] },
    answers: { name: 'A' } },
  { what: 'a null classification on the item', where: 'taken',
    target: { type: 'count', name: 'A', floor_level: null, points: [] }, answers: { floor_level: 'L3' } },
  { what: 'gone before this step', where: 'gone', target: FULL, answers: null, spec: { name: 'kept' } },
  { what: 'nothing armed', where: 'none', target: FULL, answers: null, spec: null },
];
const ARM = [
  { what: 'a new item', target: null, spec: { name: 'Outlets', floor_level: 'Level 1', color: [1, 0, 0, 1] } },
  { what: 'carried on', target: { type: 'count', name: 'Doors', points: [[1, 1]] }, spec: null },
  { what: 'a name with spaces', target: null, spec: { name: '  Switches ' } },
  { what: 'no name', target: { type: 'count', points: [] }, spec: null },
];

// Where the desktop hands Posts/Hardware framing over FROM, to a new count
// (its own _inherit_count_framing) -- the web cannot hand it over, so it
// asks or says so on exactly those (ToolController._framedSource). Random
// jobs of three sheets, a revision of the first two, framed and plain
// namesakes on either drawing (some on a page of the revision that no
// longer stands in for the sheet), empty framing, a name with a space,
// another kind of item; the sheet on screen, its drawing, the sheets booked.
const INHERIT_REVS = [{ id: 'r1', date: '03/01/2026', description: 'B1', page_labels: ['E1.0', 'E1.1'],
  match: { 0: 0, 1: 1 }, extra: {} }];
function inheritJob(k) {
  return { metadata: { page_labels: LABELS.slice(0, 3), pixels_per_foot: 50, dpi: 150,
    revisions: structuredClone(INHERIT_REVS), sheet_version: { ...k.sheet_version } },
  annotations: {}, measurements: structuredClone(k.store), pageCount: 3, revisionCounts: [2] };
}
function inheritCases() {
  const r = sessionRng(4242);
  const pick = a => a[Math.floor(r() * a.length)];
  const out = [];
  for (let i = 0; i < 600; i += 1) {
    const store = {};
    const n = 1 + Math.floor(r() * 4);
    for (let j = 0; j < n; j += 1) {
      const pg = pick([0, 1, 2]);
      const name = pick(['Posts', 'Posts', 'Posts', 'Hangers', 'Posts ']);
      const m = { type: r() < 0.9 ? 'count' : 'polyline', name, label: name, points: [[10 + j, 10]],
        value: 1, floor_level: 'Level 1', category: 'Wood Framing', sort_order: 100 + j * 10 };
      if (pg < 2 && r() < 0.45) { m.rev_id = 'r1'; m.rev_page = r() < 0.8 ? pg : 1 - pg; }
      const fr = r();
      const at = (store[pg] || []).length;
      if (fr < 0.6) m.framing = { assembly: 'post', src: `${pg}:${at}` };
      else if (fr < 0.7) m.framing = {};
      (store[pg] ||= []).push(m);
    }
    const cur = pick([0, 1, 2]);
    out.push({ store, cur, rid: cur < 2 && r() < 0.4 ? 'r1' : '', name: pick(['Posts', 'Posts', 'Hangers', 'Studs']),
      sheet_version: pick([{}, {}, { 0: 'r1' }, { 1: 'r1' }, { 0: 'r1', 1: 'r1' }]) });
  }
  // What the desktop asks of the window -- is this count priced? -- is the
  // web's own answer (revision-counting holds it to the desktop's), read
  // off the job as the web loaded it, item by item.
  return out.map(k => {
    const p = new Project();
    p.loadFrom(inheritJob(k));
    const model = new CountingModel({ metadata: p.metadata, measurements: p.measurements, pageCount: p.pageCount });
    const store = {}, priced = {};
    for (const [pg, list] of Object.entries(p.measurements)) {
      if (!list.length) continue;
      store[pg] = list.map(m => JSON.parse(JSON.stringify({ ...m, _uid: undefined })));
      priced[pg] = list.map(m => model.itemCountsTowards(Number(pg), m));
    }
    return { ...k, store, priced };
  });
}
/** The web's answer: is there a count it would hand framing over from? */
function webInherit(k) {
  const p = new Project();
  p.loadFrom(inheritJob(k));
  const c = new ToolController({ canvas: { addEventListener() {}, style: {} }, viewport: {},
    project: p, currentPage: () => k.cur, host: {} });
  c.setVersionView(k.rid, k.rid ? k.cur : null);
  if (typeof c._framedSource !== 'function') return 'missing _framedSource';
  return !!c._framedSource(k.name, k.cur);
}
let INHERIT = [];                 // made when the desktop is there to answer them

/** The web's _rearmCount on a controller set up the way the desktop's place says. */
function webRearm(k) {
  const p = new Project();
  p.loadFrom({ metadata: {}, annotations: {}, measurements: {}, pageCount: 1 });
  const c = new ToolController({ canvas: { addEventListener() {}, style: {} }, viewport: {},
    project: p, currentPage: () => 0, host: {} });
  const t = structuredClone(k.target);
  c.countTarget = k.where === 'none' ? null : t;
  c.countSpec = k.spec ? structuredClone(k.spec) : null;
  c.countAnswers = k.answers == null ? null : structuredClone(k.answers);
  if (typeof c._rearmCount !== 'function') return { missing: '_rearmCount' };
  c._rearmCount(k.where === 'taken' ? { 0: [t] } : { 0: [] });
  return { spec: c.countSpec, answers: c.countAnswers,
    specIsAnswers: c.countSpec != null && c.countSpec === c.countAnswers,
    target: c.countTarget === t, mustAsk: c.countMustAsk };
}

function webArm(k) {
  const p = new Project();
  p.loadFrom({ metadata: {}, annotations: {}, measurements: {}, pageCount: 1 });
  const c = new ToolController({ canvas: { addEventListener() {}, style: {} }, viewport: {},
    project: p, currentPage: () => 0, host: {} });
  const synced = [];
  c.addEventListener('tool-name', ev => synced.push(ev.detail.name));
  c.countLeft = [{ type: 'count', name: 'held' }];
  const target = structuredClone(k.target);
  const s = structuredClone(k.spec);
  if (typeof c.armCount === 'function') c.armCount(target, s);
  return { c, synced, target, s };
}

// ── the tap rules against the desktop's own, over random sessions ───────
//
// The sections above are transcriptions of the desktop's sections. This is
// its CODE: the same sessions -- arm, carry on, Pan, taps with and without a
// form answer, Ctrl+Z, Ctrl+Y, another sheet, a revision's drawing, a name
// typed or emptied, the list's Delete, a Properties rename -- driven through
// the web's controller and through the desktop's own _add_count_point and
// friends (tests/count-undo-desktop-model.py), compared after every step:
// every count row's marks, how often the form asked, which count is armed
// (by identity, on which sheet and drawing), what the Item box shows. Fixed
// seeds, so a difference is found again by the same seed. Without framing:
// the web has no engine, and its framed answers are web_framed's.

const SESSION_NAMES = ['Outlets', 'Switches'];
const SESSION_FLOORS = ['Level 1', 'Level 2'];
const sessionRng = s0 => { let s = s0 >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); };
function sessionOps(s0, n) {
  const r = sessionRng(s0);
  const pick = a => a[Math.floor(r() * a.length)];
  const ops = [['arm', 'Outlets', 'Level 1']];
  for (let i = 0; i < n; i += 1) {
    const x = r();
    if (x < 0.30) ops.push(r() < 0.5 ? ['tap'] : ['tap', pick(SESSION_NAMES), pick(SESSION_FLOORS)]);
    else if (x < 0.42) ops.push(['undo']);
    else if (x < 0.50) ops.push(['redo']);
    else if (x < 0.58) ops.push(['go', pick([0, 1])]);
    else if (x < 0.64) ops.push(['ver', pick(['', 'r1'])]);
    else if (x < 0.72) ops.push(['type', pick(['', '', 'Outlets', 'Switches', 'Lights'])]);
    else if (x < 0.80) ops.push(['arm', pick(SESSION_NAMES), pick(SESSION_FLOORS)]);
    else if (x < 0.86) ops.push(['carry', Math.floor(r() * 3)]);
    else if (x < 0.92) ops.push(['pan']);
    else if (x < 0.96) ops.push(['delete', Math.floor(r() * 3)]);
    else ops.push(['rename', Math.floor(r() * 3), pick(['Outlets', 'Switches', 'Receptacles'])]);
  }
  // the revision is of sheet one: its drawing is only ever looked at there
  let pg = 0;
  return ops.filter(op => { if (op[0] === 'go') [, pg] = op; return op[0] !== 'ver' || pg === 0; });
}
const SESSION_REV = [{ id: 'r1', date: '03/01/2026', description: 'B1', page_labels: ['E1.0'],
  match: { 0: 0 }, extra: {} }];
const SESSION_SEEDED = { 0: [seed('Outlets', 'Level 1', 2, { sort_order: 100, count_number: 1 }),
  seed('Outlets', 'Level 2', 1, { sort_order: 200, count_number: 2 })],
1: [seed('Outlets', 'Level 1', 3, { sort_order: 300, count_number: 3 }),
  seed('Switches', 'Level 1', 1, { sort_order: 400, count_number: 4 })] };
const SESSION_DIRECTED = [
  [['arm', 'Outlets', 'Level 1'], ['tap'], ['go', 1], ['tap', 'Switches', 'Level 2'], ['go', 0], ['tap']],
  [['arm', 'Outlets', 'Level 1'], ['tap'], ['tap'], ['pan'], ['arm', 'Outlets', 'Level 2'], ['tap'], ['tap'],
    ['go', 1], ['tap', 'Outlets', 'Level 2'], ['tap'], ['tap'], ['undo'], ['undo'], ['undo'], ['tap'], ['tap'],
    ['go', 0], ['tap'], ['go', 1], ['tap'], ['undo'], ['go', 0], ['tap'], ['go', 1], ['tap'], ['type', ''],
    ['go', 0], ['tap']],
  [['arm', 'Outlets', 'Level 1'], ['tap'], ['tap'], ['go', 1], ['type', ''], ['tap', 'Switches', 'Level 1'],
    ['go', 0], ['type', ''], ['tap', 'Outlets', 'Level 2'], ['tap'], ['go', 1], ['type', ''], ['tap'], ['go', 0],
    ['type', 'Switches'], ['tap'], ['undo'], ['go', 1], ['tap'], ['go', 0], ['type', 'Outlets'],
    ['tap', 'Lights', 'Level 3']],
  [['arm', 'Outlets', 'Level 1'], ['tap'], ['tap'], ['pan'], ['arm', 'Outlets', 'Level 2'], ['tap'], ['tap'],
    ['ver', 'r1'], ['tap', 'Outlets', 'Level 2'], ['tap'], ['ver', ''], ['tap'], ['ver', 'r1'], ['tap'],
    ['undo'], ['undo'], ['undo'], ['tap'], ['ver', ''], ['tap']],
];
function sessions() {
  const out = SESSION_DIRECTED.map(ops => ({ seed: 'directed', ops, sheets: 2, items: {} }));
  for (let s = 1; s <= 60; s += 1) out.push({ seed: s, ops: sessionOps(s, 40), sheets: 2, items: {} });
  for (let s = 1001; s <= 1060; s += 1) {
    out.push({ seed: s, ops: sessionOps(s, 40), sheets: 2, items: SESSION_SEEDED });
  }
  return out;
}

/** One session through the web's controller: the state after every step. */
async function webSession(ops, items) {
  const W = world({ sheets: 2, items, revisions: SESSION_REV, tick: settle });
  const out = [];
  for (const op of ops) {
    const k = op[0];
    if (k === 'arm') {
      W.f.answer = { spec: spec(op[1], op[2]) };
      await W.c.setMode('count');
      W.f.answer = null;
    } else if (k === 'carry') {
      W.f.answer = ex => (op[1] < ex.length ? { continueItem: ex[op[1]] } : null);
      await W.c.setMode('count');
      W.f.answer = null;
    } else if (k === 'pan') {
      await W.c.setMode('pan');
    } else if (k === 'tap') {
      if (W.c.mode === 'count') {
        W.f.answer = op[1] ? { spec: spec(op[1], op[2]) } : null;
        await W.tap();
        W.f.answer = null;
      }
    } else if (k === 'undo') W.undo();
    else if (k === 'redo') W.redo();
    else if (k === 'go') { W.go(op[1]); W.c.setVersionView('', null); } else if (k === 'ver') {
      W.c.setVersionView(op[1], op[1] ? 0 : null);
    } else if (k === 'type') {
      if (W.c.mode === 'count') W.typeBox(op[1]);
    } else if (k === 'rename' || k === 'delete') {
      const cs = (W.p.measurements[W.page.n] || []).filter(m => m.type === 'count');
      if (op[1] < cs.length) {
        if (k === 'rename') W.p.updateItem(cs[op[1]]._uid, { name: op[2], label: op[2] });
        else W.p.removeItems([cs[op[1]]._uid]);
      }
    }
    const rows = [];
    for (const pg of [0, 1]) {
      for (const m of W.p.measurements[pg] || []) {
        if (m.type === 'count') rows.push([pg, m.name, m.floor_level, String(m.rev_id || ''), (m.points || []).length]);
      }
    }
    const t = W.c.countTarget;
    let where = null;
    for (const pg of [0, 1]) {
      if (t && (W.p.measurements[pg] || []).includes(t)) {
        where = [pg, t.name, t.floor_level, String(t.rev_id || ''), (t.points || []).length];
      }
    }
    out.push({ rows, asked: W.f.asked, target: where, box: String(W.c.options.pendingName || '').trim() });
  }
  return out;
}

async function tapRulesDifferential() {
  console.log('\n-- the tap rules: the desktop\'s own _add_count_point, over random sessions --');
  const list = sessions();
  let truth = null;
  try {
    truth = await new Promise((resolve, reject) => {
      const child = execFile('python', ['-B', path.join(here, 'count-undo-desktop-model.py'), DESKTOP_SRC],
        { windowsHide: true, maxBuffer: 1 << 28, env: { ...process.env, PTT_DESKTOP_SRC: DESKTOP_SRC } },
        (err, out, errOut) => (err ? reject(new Error(errOut || err.message)) : resolve(JSON.parse(out))));
      child.stdin.end(JSON.stringify(list));
    });
  } catch (err) {
    fails += 1;
    console.log(`FAIL the desktop's tap rules could not be lifted and run:\n${err.message}`);
    return false;
  }
  console.log(`   (lifted ${truth.lifted.join(', ')} as a verified closure)`);
  let differ = 0;
  for (let i = 0; i < list.length; i += 1) {
    const web = await webSession(list[i].ops, list[i].items);
    const desk = truth.steps[i];
    const j = web.findIndex((w, n) => JSON.stringify(w) !== JSON.stringify(desk[n]));
    if (j >= 0) {
      differ += 1;
      if (differ <= 3) {
        console.log(`   session ${list[i].seed}, step ${j} ${JSON.stringify(list[i].ops[j])}`
          + `\n     ops  ${JSON.stringify(list[i].ops.slice(0, j + 1))}`
          + `\n     web  ${JSON.stringify(web[j])}\n     desk ${JSON.stringify(desk[j])}`);
      }
    }
  }
  eq(`${list.length} random count sessions: the web's taps land where the desktop's own code puts them`,
    differ, 0);
  return true;
}

let diff = 'skipped';
if (!(await haveDesktopSource())) {
  console.log('\n-- the differentials and the tag check SKIPPED (set PTT_DESKTOP_SRC) --');
} else {
  console.log('\n-- the desktop\'s own _rearm_count, arm_count and forget_armed_count --');
  let truth = null;
  INHERIT = inheritCases();
  try {
    truth = await new Promise((resolve, reject) => {
      const child = execFile('python', ['-B', path.join(here, 'count-undo-python-truth.py'), DESKTOP_SRC],
        { windowsHide: true, maxBuffer: 1 << 26, env: { ...process.env, PTT_DESKTOP_SRC: DESKTOP_SRC } },
        (err, out, errOut) => (err ? reject(new Error(errOut || err.message)) : resolve(JSON.parse(out))));
      child.stdin.end(JSON.stringify({ rearm: REARM, arm: ARM, inherit: INHERIT }));
    });
  } catch (err) {
    fails += 1;
    console.log(`FAIL the desktop's count methods could not be lifted and run:\n${err.message}`);
  }
  if (truth) {
    console.log(`   (lifted ${truth.lifted.join(', ')} as a verified closure)`);
    eq('COUNT_TEMPLATE is the desktop\'s _COUNT_TEMPLATE', [...COUNT_TEMPLATE], truth.COUNT_TEMPLATE);
    eq('CLASS_FIELDS is the desktop\'s', [...CLASS_FIELDS], truth.CLASS_FIELDS);
    REARM.forEach((k, i) => {
      const want = truth.rearm[i];
      if (k.where === 'taken') {
        const pure = countAnswersAgain(structuredClone(k.target), k.answers == null ? null : structuredClone(k.answers));
        eq(`countAnswersAgain, ${k.what}`, sortKeys(pure), sortKeys(want.answers));
      }
      const web = webRearm(k);
      eq(`_rearmCount, ${k.what}: the answers`, sortKeys(web.answers), sortKeys(want.answers));
      // The one place the web differs ON PURPOSE: a framed count is not made
      // again bare -- no answers armed, the next tap asks.
      const framed = k.where === 'taken' && want.spec && want.spec.framing;
      eq(`_rearmCount, ${k.what}: what the next tap is made from${framed ? ' (framed: nothing, it asks)' : ''}`,
        [sortKeys(web.spec), web.specIsAnswers, web.target, web.mustAsk],
        framed ? [null, false, want.target, true] : [sortKeys(want.spec), want.specIsAnswers, want.target, false]);
    });
    ARM.forEach((k, i) => {
      const want = truth.arm[i];
      const { c, synced, target, s } = webArm(k);
      eq(`armCount, ${k.what}`, {
        target: c.countTarget === target && target != null ? 'the target' : c.countTarget == null ? null : 'another',
        spec: c.countSpec, specIsGiven: s != null && c.countSpec === s, answersAreSpec: c.countAnswers === c.countSpec,
        named: c.countNamed, left: c.countLeft.length,
        box: c.options.pendingName,
      }, {
        target: want.target, spec: want.spec, specIsGiven: want.specIsGiven, answersAreSpec: want.answersAreSpec,
        named: String(want.named).trim(), left: want.left,
        box: String(want.synced[want.synced.length - 1] ?? '').trim(),
      });
      eq(`armCount, ${k.what}: the Item box is told once, or not at all when it already says it`,
        synced.length <= 1, true);
    });
    {
      const p = new Project();
      p.loadFrom({ metadata: {}, annotations: {}, measurements: {}, pageCount: 1 });
      const c = new ToolController({ canvas: { addEventListener() {}, style: {} }, viewport: {},
        project: p, currentPage: () => 0, host: {} });
      c.countTarget = { type: 'count', name: 'Outlets' };
      c.countSpec = { name: 'Outlets' };
      c.countAnswers = c.countSpec;
      c.options.countCategory = 'Outlets';
      c.countNamed = 'Outlets';
      c.countLeft = [{ type: 'count', name: 'Switches' }];
      c.forgetArmedCount();
      const w = truth.forget;
      eq('forgetArmedCount leaves what forget_armed_count leaves',
        { target: c.countTarget, spec: c.countSpec, answers: c.countAnswers,
          category: c.options.countCategory, named: c.countNamed, left: c.countLeft.length },
        { target: w.target, spec: w.spec, answers: w.answers, category: w.category, named: w.named,
          left: w.left });
    }
    {
      // A new count under a framed name: the web asks or says so exactly
      // where the desktop's own _inherit_count_framing hands framing over.
      let differ = 0, handed = 0;
      INHERIT.forEach((k, i) => {
        const want = truth.inherit[i];
        const web = webInherit(k);
        if (want.inherited) handed += 1;
        if (web !== want.inherited) {
          differ += 1;
          if (differ <= 3) {
            console.log(`   case ${i}: web ${JSON.stringify(web)}, desktop ${JSON.stringify(want)}`
              + `\n     ${JSON.stringify({ cur: k.cur, rid: k.rid, name: k.name, sheet_version: k.sheet_version, priced: k.priced, store: k.store })}`);
          }
        }
      });
      eq(`${INHERIT.length} new counts under a framed name: the web refuses to make bare exactly where `
        + 'the desktop\'s own _inherit_count_framing hands framing over', differ, 0);
      ok(`...and the cases reach both answers (${handed} handed over, ${INHERIT.length - handed} not)`,
        handed >= 100 && INHERIT.length - handed >= 100);
      ok('...and the desktop said where it came from on every one it handed over',
        truth.inherit.every(w => !w.inherited || (typeof w.from === 'string' && /continues on this sheet/.test(w.said || ''))));
    }
    // THE TAG CHECK: every section of the desktop's test is ported or N/A.
    if (!Array.isArray(truth.sections)) {
      diff = 'differential only';
      console.log('\n-- the tag check SKIPPED: no tests/test_count_undo.py beside the desktop source --');
    } else {
      console.log(`\n-- the desktop's ${truth.sections.length} sections --`);
      for (const tag of truth.sections) {
        ok(`desktop section "${tag}" is ported here or listed N/A with a reason`,
          PORTED.has(tag) || (NOT_APPLICABLE[tag] && NOT_APPLICABLE[tag].length > 20));
        ok(`desktop section "${tag}" is not both ported and N/A`, !(PORTED.has(tag) && NOT_APPLICABLE[tag]));
      }
      for (const tag of Object.keys(NOT_APPLICABLE)) {
        ok(`N/A "${tag}" is a desktop section`, truth.sections.includes(tag));
      }
      for (const tag of PORTED) {
        ok(`section "${tag}" is the desktop's or the web's own`,
          tag === 'first' || tag.startsWith('web_') || truth.sections.includes(tag));
      }
      diff = 'differential + tag check';
    }
  }
  if (await tapRulesDifferential()) diff += ' + tap rules';
}

// Exit 0 when only the desktop's parts were skipped: this is a PORTABLE
// harness, and a fresh clone or CI without the desktop source still runs
// every section; the last line says what did not run.
console.log(fails ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass — Ctrl+Z keeps the count (${SECTIONS.length} sections; `
    + `${diff === 'skipped' ? 'the desktop differentials and tag check skipped: no PTT_DESKTOP_SRC' : diff})`);
process.exit(fails ? 1 : 0);
