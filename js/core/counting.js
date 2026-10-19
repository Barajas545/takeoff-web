// counting.js — WHAT COUNTS. Which piece of takeoff is in the totals, how much
// it adds, and every sentence that says so.
//
// A sheet can carry takeoff on several of its drawings — its own, and every
// revision that reissued it — and exactly ONE of them is in the totals: the
// one metadata.sheet_version books for it, the sheet's own drawing when there
// is no entry. Adding them all up would count the same wall twice on every
// report, which is what this app did until 3.05: it priced EVERY revision's
// takeoff, so the same file came to a different total here than on the
// desktop. On one real job the desktop priced 0 sq ft and this app 2,929.2.
//
// So this file is a PORT, not a design. Every method below is the desktop
// method of the same name (pdf_fast_viewer.py, PDFCacheViewer), line for line,
// and tests/revision-counting.mjs runs the desktop's own methods — lifted out
// of its source by text, as a closure — against these on the same inputs, so
// the two programs cannot disagree on a total without a red test.
//
// THE RULE THAT OUTRANKS EVERYTHING: a quantity that reaches the estimate
// must not change without a sentence on screen saying so, and the sentence
// names the QUANTITY. Looking never moves a price. The sentences are here,
// worded by the desktop's own functions (takeoff_move_words and friends), so
// "36 sq ft of Slab will leave" reads the same on both screens.
//
// Nothing here touches the DOM, and nothing here writes the project: a
// booking is RETURNED as data and the caller applies it inside the same undo
// step as the takeoff that caused it.

import {
  liveRevisions, visibleRevisions, revPageCount, sheetVersions, sheetRanks,
  newestVersionOf, workingVersionOf, revPageOf, itemOnDrawing, itemRevId,
  revNameOf, revisionNumber, revisionNamesOf, originMapOf, originPairsOf,
  originDateOf, pyInt, pyStr, isTakeoffType, KEPT_MARK_TYPES,
  resolveLatestSheets,
} from './revisions.js';

export { isTakeoffType as isTakeoffItem, KEPT_MARK_TYPES };

/** The bucket for takeoff that belongs to the job rather than a sheet. */
export const STANDALONE = -1000;

/** desktop PIN_TYPES: one click on the plan that stands for one thing. */
const PIN_TYPES = new Set(['window', 'door', 'partition', 'header']);

/** desktop REPORT_UNIT_BY_TYPE. */
const REPORT_UNIT_BY_TYPE = {
  area: 'SF', grid: 'SF', tile: 'SF', slope_area: 'SF',
  distance: 'LF', polyline: 'LF',
  count: 'EA', linear_count: 'EA',
};

// ── Python's number formatting, exactly ──────────────────────────────────
//
// The sentences are compared with the desktop's character for character, so
// "1,318.6 sq ft" has to round the way Python does: half to EVEN on the exact
// binary value. Number.prototype.toFixed rounds an exact tie UP (1.25 -> 1.3
// where Python says 1.2), so the digits are taken exactly and rounded here.

/** {ok, n} — Python's float() of a JSON value. */
export function pyFloat(v) {
  if (typeof v === 'boolean') return { ok: true, n: v ? 1 : 0 };
  if (typeof v === 'number') return { ok: true, n: v };
  if (typeof v === 'string') {
    const t = v.trim().replace(/_/g, '');
    if (/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(t)) return { ok: true, n: Number(t) };
    if (/^[+-]?(inf|infinity)$/i.test(t)) return { ok: true, n: t[0] === '-' ? -Infinity : Infinity };
    if (/^[+-]?nan$/i.test(t)) return { ok: true, n: NaN };
  }
  return { ok: false, n: 0 };
}

/** Python truthiness of a JSON value. */
function truthy(v) {
  if (v === null || v === undefined || v === false || v === 0 || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return true;      // NaN is truthy in Python
}

/** Python's `x or 0` for a number field. */
function orZero(v) {
  return truthy(v) ? v : 0;
}

/** The exact decimal digits of |x| as [intDigits, fracDigits]. */
function exactDigits(x) {
  const s = Math.abs(x).toFixed(100);       // exact for every value a bid holds
  const [i, f = ''] = s.split('.');
  return [i, f];
}

/** Python format(x, '.Nf') with an optional ',' — round half to even. */
export function pyFixed(x, nd, commas = false) {
  if (Number.isNaN(x)) return 'nan';
  if (!Number.isFinite(x)) return x < 0 ? '-inf' : 'inf';
  const neg = x < 0 || Object.is(x, -0);
  let [ip, fp] = exactDigits(x);
  const keep = fp.slice(0, nd);
  const rest = fp.slice(nd);
  let digits = (ip + keep).split('').map(Number);
  const first = rest.length ? Number(rest[0]) : 0;
  const tail = rest.slice(1).replace(/0+$/, '');
  let up = false;
  if (first > 5 || (first === 5 && tail.length)) up = true;
  else if (first === 5 && !tail.length) up = digits.length ? digits[digits.length - 1] % 2 === 1 : false;
  if (up) {
    let k = digits.length - 1;
    while (k >= 0) {
      if (digits[k] === 9) { digits[k] = 0; k -= 1; } else { digits[k] += 1; break; }
    }
    if (k < 0) digits.unshift(1);
  }
  const all = digits.join('');
  let intPart = all.slice(0, all.length - nd) || '0';
  intPart = intPart.replace(/^0+(?=\d)/, '');
  const frac = nd ? all.slice(all.length - nd) : '';
  if (commas) intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + intPart + (nd ? `.${frac}` : '');
}

/** Python round(x, nd) — the nearest double to the half-even decimal. */
export function pyRound(x, nd) {
  if (!Number.isFinite(x)) return x;
  return Number(pyFixed(x, nd).replace(/,/g, ''));
}

/** Python format(x, 'g'). */
export function pyG(x) {
  if (Number.isNaN(x)) return 'nan';
  if (!Number.isFinite(x)) return x < 0 ? '-inf' : 'inf';
  if (x === 0) return Object.is(x, -0) ? '-0' : '0';
  const p = 6;
  // the exponent AFTER rounding to p significant digits
  const e = Number(x.toExponential(p - 1).split('e')[1]);
  if (e < -4 || e >= p) {
    let [m, ex] = x.toExponential(p - 1).split('e');
    if (m.includes('.')) m = m.replace(/0+$/, '').replace(/\.$/, '');
    const n = Number(ex);
    return `${m}e${n < 0 ? '-' : '+'}${String(Math.abs(n)).padStart(2, '0')}`;
  }
  let s = pyFixed(x, Math.max(0, p - 1 - e));
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}

// ── a piece of takeoff, by quantity ──────────────────────────────────────

/** (quantity, unit) of one takeoff item, the way the reports read it. */
export function takeoffQty(m) {
  const t = (m || {}).type || '';
  const v = orZero((m || {}).value);
  if (t === 'count') return [((m.points) || []).length, 'EA'];
  if (t === 'linear_count') {
    const f = pyFloat(v);
    return f.ok && Number.isFinite(f.n) ? [Math.trunc(f.n), 'EA'] : [0, ''];
  }
  if (PIN_TYPES.has(t)) return [1, 'EA'];
  if (t === 'standalone') {
    const q = pyFloat(orZero(m.qty));
    if (!q.ok) return [0, ''];
    return [q.n, String(m.unit || 'each').trim()];
  }
  const u = REPORT_UNIT_BY_TYPE[t] || '';
  const f = pyFloat(v);
  if (!f.ok) return [0, ''];
  return [f.n, u === 'SF' ? 'sq ft' : u];
}

/** 2929.21 sq ft -> '2,929.2 sq ft'. */
export function takeoffQtyText(q, u = '') {
  const f = pyFloat(q);
  let t = f.ok ? pyFixed(f.n, 1, true) : String(q);
  if (t.endsWith('.0')) t = t.slice(0, -2);
  return t + (u ? ` ${u}` : '');
}

function itemName(m) {
  return String((m || {}).name || (m || {}).label || '').trim() || 'an unnamed item';
}

/**
 * The takeoff in `items` by name and QUANTITY — "Deck 500 sq ft, Walls
 * 250 LF and 2 more" — because a sentence about money that says "1 item"
 * says nothing. '' when there is no takeoff in it.
 */
export function takeoffQuantityWords(items, limit = 4) {
  const rows = [];
  for (const m of items || []) {
    if (!isTakeoffType(m)) continue;
    const [q, u] = takeoffQty(m);
    const nm = itemName(m);
    if (m.group_child) rows.push(`${takeoffQtyText(q, u)} of ${nm}`);
    else rows.push(`${nm} ${takeoffQtyText(q, u)}`);
  }
  if (!rows.length) return '';
  let out = rows.slice(0, limit).join(', ');
  if (rows.length > limit) out += ` and ${rows.length - limit} more`;
  return out;
}

/** [[qty, unit]] -> "2,929.2 sq ft" / "1,200 sq ft and 14 EA". */
export function takeoffSumText(qtys) {
  const tot = new Map();
  for (const [q, u] of qtys || []) {
    const f = pyFloat(orZero(q));
    if (!f.ok) continue;
    tot.set(u, (tot.get(u) || 0) + f.n);
  }
  const rows = [...tot.entries()].sort((a, b) => -Math.abs(a[1]) + Math.abs(b[1]));
  return rows.filter(([, q]) => q).map(([u, q]) => takeoffQtyText(q, u)).join(' and ');
}

/**
 * What a piece of takeoff IS, whichever object holds it: its type, its name,
 * the drawing it was traced on and its geometry (desktop _takeoff_identity).
 * An undo restores copies, so a move is matched by this and not by object.
 */
export function takeoffIdentity(m) {
  m = m || {};
  let pts = '';
  try {
    pts = (m.points || []).filter(p => Array.isArray(p))
      .map(p => p.map(c => {
        const f = pyFloat(c);
        if (!f.ok) throw new Error('bad');
        return pyFixed(f.n, 3);
      }).join(',')).join(';');
  } catch {
    pts = '';
  }
  return [pyStr(m.type || ''), String(m.name || ''), String(m.rev_id || ''),
    pyStr(m.rev_page), String(m.group_id || ''), truthy(m.group_child) ? '1' : '0',
    pts].join('\u0000');
}

/**
 * THE sentence for what a move does to the totals, by quantity (desktop
 * takeoff_move_words). `before` and `after` are Maps {key: [item, [qty,
 * unit]]} as countedQuantities() returns them. '' when nothing moves.
 *
 *   "1,318.6 sq ft of Slab leaves; 576.7 sq ft of Garage Slab comes in;
 *    Wall M 13 → 4 sq ft"
 */
export function takeoffMoveWords(before, after, future = false, limit = 4) {
  const rows = (ks, src) => ks.map(k => `${takeoffQtyText(...src.get(k)[1])} of ${itemName(src.get(k)[0])}`);
  const cut = xs => {
    let out = xs.slice(0, limit).join(', ');
    if (xs.length > limit) out += ` and ${xs.length - limit} more`;
    return out;
  };
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  let gone = [...before.keys()].filter(k => !after.has(k));
  let came = [...after.keys()].filter(k => !before.has(k));
  const chg = [...after.keys()].filter(k => before.has(k) && !same(before.get(k)[1], after.get(k)[1]))
    .map(k => [before.get(k), after.get(k)]);
  if (gone.length && came.length) {
    const waiting = new Map();
    for (const k of came) {
      const id = takeoffIdentity(after.get(k)[0]);
      if (!waiting.has(id)) waiting.set(id, []);
      waiting.get(id).push(k);
    }
    const left = [];
    const paired = new Set();
    for (const k of gone) {
      const hit = waiting.get(takeoffIdentity(before.get(k)[0]));
      if (hit && hit.length) {
        const k2 = hit.shift();
        paired.add(k2);
        if (!same(before.get(k)[1], after.get(k2)[1])) chg.push([before.get(k), after.get(k2)]);
      } else {
        left.push(k);
      }
    }
    gone = left;
    came = came.filter(k => !paired.has(k));
  }
  const bits = [];
  if (gone.length) {
    bits.push(`${cut(rows(gone, before))} ${gone.length === 1
      ? (future ? 'will leave' : 'leaves') : (future ? 'will leave' : 'leave')}`);
  }
  if (came.length) {
    bits.push(`${cut(rows(came, after))} ${came.length === 1
      ? (future ? 'will come in' : 'comes in') : (future ? 'will come in' : 'come in')}`);
  }
  if (chg.length) {
    bits.push(cut(chg.map(([[, [a, u]], [m1, [b, u2]]]) => (u === u2
      ? `${itemName(m1)} ${takeoffQtyText(a)} → ${takeoffQtyText(b, u)}`
      : `${itemName(m1)} ${takeoffQtyText(a, u)} → ${takeoffQtyText(b, u2)}`))));
  }
  return bits.join('; ');
}

/** "3 items", "1 item and 2 shapes of items that span sheets", "nothing". */
export function amountWords(items, runs = 0) {
  const bits = [];
  if (items) bits.push(`${items} item${items === 1 ? '' : 's'}`);
  if (runs) bits.push(`${runs} shape${runs === 1 ? '' : 's'} of items that span sheets`);
  return bits.join(' and ') || 'nothing';
}

/**
 * What a move ADDS to the totals in all, by unit — "2,929.2 sq ft" — when it
 * only adds; '' when anything leaves or shrinks (desktop _totals_gain_text).
 */
export function totalsGainText(before, after) {
  for (const k of before.keys()) if (!after.has(k)) return '';
  const gain = [];
  for (const [k, [, [q0n, u]]] of after.entries()) {
    let q = q0n;
    if (before.has(k)) {
      const [qb, ub] = before.get(k)[1];
      if (ub !== u || q < qb) return '';
      q -= qb;
    }
    gain.push([q, u]);
  }
  return takeoffSumText(gain);
}

// ── the model: one job's book, asked every question the desktop asks ────

/**
 * Every counting question, asked of one job as it stands.
 *
 *   metadata      the project's metadata (revisions, sheet_version,
 *                 sheet_origin, page_labels, page_labels_custom, extra_sheets)
 *   measurements  {pageKey: [item]}
 *   pageCount     how many sheets
 *   order         'date' | 'column' — how "newest" is decided
 *   sizeOf        (page) -> [w, h] | null and
 *   revSizeOf     (rev, revPage) -> [w, h] | null, for the "another sheet
 *                 size" rule; unknown sizes pass, as the desktop's do
 *
 * Cheap to build: it holds references, reads on demand and caches nothing,
 * so a model made before an edit answers about the job after it.
 */
export class CountingModel {
  constructor({ metadata, measurements, pageCount, order = 'date',
    sizeOf = null, revSizeOf = null }) {
    this.md = metadata || {};
    this.meas = measurements || {};
    this.n = Number(pageCount) || 0;
    this.order = order === 'column' ? 'column' : 'date';
    this.sizeOf = sizeOf;
    this.revSizeOf = revSizeOf;
  }

  /** The same job with another book / without some revisions — a question. */
  variant({ sheetVersion, dropRevs = null } = {}) {
    const md = { ...this.md };
    if (sheetVersion === null) delete md.sheet_version;
    else if (sheetVersion !== undefined) md.sheet_version = sheetVersion;
    if (dropRevs && dropRevs.size) {
      md.revisions = (this.md.revisions || []).filter(r => !dropRevs.has(String(r.id)));
    }
    return new CountingModel({ metadata: md, measurements: this.meas,
      pageCount: this.n, order: this.order, sizeOf: this.sizeOf, revSizeOf: this.revSizeOf });
  }

  /** The revisions the desktop has (liveRevisions). */
  get revs() { return liveRevisions(this.md.revisions); }

  /** Page keys of the store, in its own order, as numbers. */
  pageKeys() {
    return Object.keys(this.meas).map(Number).filter(k => Number.isFinite(k));
  }

  items(page) {
    return this.meas[page] || this.meas[String(page)] || [];
  }

  // ── names ──────────────────────────────────────────────────────────

  /** desktop _page_final_label. */
  pageLabel(idx) {
    if (idx === null || idx === undefined || idx < 0) return '—';
    const custom = this.md.page_labels_custom || {};
    const labels = this.md.page_labels || [];
    let lbl = custom[String(idx)] || (idx < labels.length ? labels[idx] : '');
    lbl = String(lbl || '').trim();
    return lbl || `Pag: ${idx + 1}`;
  }

  revName(rid, hiddenNote = false) { return revNameOf(rid, this.revs, hiddenNote); }
  revisionLabel(rid) { return this.revName(rid, true); }
  revisionNames() { return revisionNamesOf(this.revs); }
  revisionNumber(rid) { return revisionNumber(rid, this.revs); }
  revTag(rid, hiddenNote = false) { return this.revName(rid, hiddenNote); }

  /** 'ASI 7 · 10/05/2026', 'REV 2 · 10/05/2026 · New changes as of …'. */
  revTitle(rid) {
    const n = this.revisionNumber(rid);
    if (!n) return this.revisionLabel(rid) || 'its own drawing';
    const rev = this.revs[n - 1];
    const nm = this.revName(rid);
    const bits = [nm];
    const d = String(rev.date || '').trim();
    const s = String(rev.description || '').split(/\s+/).filter(Boolean).join(' ');
    if (d) bits.push(d);
    if (s && s !== nm) bits.push([...s].length <= 60 ? s : `${[...s].slice(0, 57).join('').trimEnd()}…`);
    let t = bits.join(' · ');
    if (!(rev.visible !== false && !rev.archived)) t += ' (hidden)';
    return t;
  }

  /** 'REV 2', or "its own drawing". */
  versionName(rid) { return this.revTag(rid) || 'its own drawing'; }

  // ── the drawings of a sheet ────────────────────────────────────────

  visibleRevisions() { return visibleRevisions(this.revs); }
  sheetVersions(page) { return sheetVersions(page, this.revs, this.md.sheet_origin); }
  sheetRanks(page) { return sheetRanks(page, this.revs, this.order, this.md.sheet_origin); }
  newestVersionOf(page) { return newestVersionOf(page, this.revs, this.order, this.md.sheet_origin); }
  originDate(page) { return originDateOf(page, this.md.sheet_origin, this.revs); }
  originMap() { return originMapOf(this.md.sheet_origin, this.revs); }
  originPairs() { return originPairsOf(this.md.sheet_origin); }

  // ── what counts ────────────────────────────────────────────────────

  workingVersionOf(page) { return workingVersionOf(page, this.revs, this.md.sheet_version); }
  revPageOf(page, rid) { return revPageOf(page, rid, this.revs); }
  itemOnDrawing(page, rid, m) { return itemOnDrawing(page, rid, m, this.revs); }

  /** Whether ONE run is on a drawing its sheet is counted from. */
  runCountsTowards(page, m) {
    if (!Number.isInteger(page) || page < 0) return true;
    const rid = itemRevId(m);
    if (rid !== this.workingVersionOf(page)) return false;
    return !rid || this.itemOnDrawing(page, rid, m);
  }

  /** All [page, item] of one multi-shape item — master first, then by page. */
  measurementGroup(gid) {
    const out = [];
    for (const pg of this.pageKeys().sort((a, b) => a - b)) {
      for (const m of this.items(pg)) {
        if (m && m.group_id === gid) out.push([pg, m]);
      }
    }
    return out.map((t, i) => [t, i])
      .sort((a, b) => (truthy(a[0][1].group_child) - truthy(b[0][1].group_child))
        || (a[0][0] - b[0][0]) || (a[1] - b[1]))
      .map(x => x[0]);
  }

  /**
   * Whether one ITEM is in the totals. A multi-shape item is in the bid
   * whenever ANY of its runs is: its total is already the sum of the runs
   * that count, and dropping it whole would take the counted runs with it.
   */
  itemCountsTowards(page, m) {
    if (!Number.isInteger(page) || page < 0) return true;
    const gid = m && m.group_id;
    if (truthy(gid) && !truthy(m.group_child)) {
      const shapes = this.measurementGroup(gid);
      if (shapes.length) return shapes.some(([pg, sh]) => this.runCountsTowards(pg, sh));
    }
    return this.runCountsTowards(page, m);
  }

  /**
   * [qty, unit] one item adds to the totals as the book stands. A
   * multi-sheet item is re-added from the runs that count — the arithmetic
   * of the desktop's _sync_group, without writing the item's total.
   */
  countedQty(page, m) {
    const gid = m && m.group_id;
    if (!truthy(gid) || truthy(m.group_child)) return takeoffQty(m);
    const shapes = this.measurementGroup(gid);
    const mine = this.runCountsTowards(page, m);
    const own = ('own_value' in m) ? m.own_value : (('value' in m) ? m.value : 0);
    let tot = mine ? Number(orZero(own)) || 0 : 0;
    for (const [p, c] of shapes) {
      if (truthy(c.group_child) && this.runCountsTowards(p, c)) {
        tot += Number(orZero(('value' in c) ? c.value : 0)) || 0;
      }
    }
    return takeoffQty({ ...m, value: tot });
  }

  /**
   * Map {item: [item, [qty, unit]]} of every takeoff item in the totals — a
   * multi-sheet item once, by its master. THE totals: every report, export
   * and sentence about money reads them.
   */
  countedQuantities() {
    const out = new Map();
    for (const pg of this.pageKeys()) {
      for (const m of this.items(pg)) {
        if (!isTakeoffType(m) || truthy(m.group_child)) continue;
        if (this.itemCountsTowards(pg, m)) out.set(m, [m, this.countedQty(pg, m), pg]);
      }
    }
    return out;
  }

  /**
   * [before, after] — what a move does to the totals: the sheets in `book`
   * ({page: revId}, '' for the sheet's own drawing) counted from those
   * drawings, the revisions in `dropRevs` gone. Nothing is changed.
   */
  totalsEffect({ book = null, dropRevs = [] } = {}) {
    const before = this.countedQuantities();
    const drop = new Set((dropRevs || []).filter(Boolean).map(String));
    if ((!book || !Object.keys(book).length) && !drop.size) return [before, new Map(before)];
    let nb = { ...(this.md.sheet_version || {}) };
    for (const [pg, rid] of Object.entries(book || {})) {
      if (rid) nb[String(pg)] = String(rid);
      else delete nb[String(pg)];
    }
    if (drop.size) nb = Object.fromEntries(Object.entries(nb).filter(([, v]) => !drop.has(String(v))));
    const after = this.variant({ sheetVersion: nb, dropRevs: drop }).countedQuantities();
    return [before, after];
  }

  totalsEffectWords({ book = null, dropRevs = [], future = true } = {}) {
    const [b, a] = this.totalsEffect({ book, dropRevs });
    return takeoffMoveWords(b, a, future);
  }

  /** Map {revId: items} on one sheet; a run is not an item of its own. */
  itemsByVersion(page) {
    const out = new Map();
    for (const m of this.items(page)) {
      if (!isTakeoffType(m) || truthy(m.group_child)) continue;
      const rid = itemRevId(m);
      out.set(rid, (out.get(rid) || 0) + 1);
    }
    return out;
  }

  /** [items, runs] of takeoff on one drawing of a sheet. */
  takeoffAmount(page, rid) {
    let items = 0, runs = 0;
    const r = String(rid || '');
    for (const m of this.items(page)) {
      if (!isTakeoffType(m) || itemRevId(m) !== r) continue;
      if (truthy(m.group_child)) runs += 1; else items += 1;
    }
    return [items, runs];
  }

  /** The takeoff on `page` that is in the totals now. */
  countedTakeoffOn(page) {
    return this.items(page).filter(m => isTakeoffType(m) && this.runCountsTowards(page, m));
  }

  /** Where a revision page sits now: ['sheet', i] | ['slot', id] | null. */
  revPageHome(rev, rp) {
    for (const [k, v] of Object.entries(rev.match || {})) {
      if (v === rp) {
        const i = pyInt(k);
        return i.ok ? ['sheet', i.n] : null;
      }
    }
    for (const [k, v] of Object.entries(rev.extra || {})) {
      if (v === rp) return ['slot', k];
    }
    return null;
  }

  slotById(sid) {
    return (this.md.extra_sheets || []).find(s => s && s.id === sid) || null;
  }

  /**
   * Why a piece of takeoff counts NOWHERE — its drawing is no drawing of its
   * sheet now — or ''. `short` is the table cell, otherwise the sentence.
   */
  waitingReason(page, m, short = false) {
    if (!(Number.isInteger(page) && page >= 0 && page < this.n)) return '';
    if (!isTakeoffType(m)) return '';
    const rid = itemRevId(m);
    if (!rid) return '';
    const rev = this.revs.find(r => String(r.id) === rid) || null;
    const nm = this.revName(rid);
    if (!rev) {
      return short ? 'a revision since removed'
        : 'traced on a revision since removed from the project — it counts nowhere, and no drawing shows it';
    }
    if (this.revPageOf(page, rid) !== null && this.itemOnDrawing(page, rid, m)) return '';
    const rpi = pyInt(m.rev_page);
    const rp = (m.rev_page === undefined || m.rev_page === null || !rpi.ok) ? null : rpi.n;
    if (rp === null) {
      return short ? `${nm}, no longer a drawing of this sheet`
        : `traced on ${nm}, which is no longer a drawing of this sheet — it counts nowhere until that revision is paired with it again`;
    }
    const h = this.revPageHome(rev, rp);
    const where = `page ${rp + 1} of ${nm}`;
    if (h && h[0] === 'slot') {
      const row = String((this.slotById(h[1]) || {}).label || '').trim();
      return short ? `${where}, waiting in the Pages list`
        : `traced on ${where}, which waits on its own row in the Pages list`
          + `${row && row !== 'NEW SHEET' ? ` (${row})` : ''} — it counts nowhere until you click that row and say what the page is`;
    }
    if (h && h[0] === 'sheet') {
      const other = this.pageLabel(h[1]);
      return short ? `${where}, now a drawing of ${other}`
        : `traced on ${where}, which is now a drawing of ${other} — it counts nowhere until it is carried there`;
    }
    return short ? `${where}, under NEW in the revision matrix`
      : `traced on ${where}, which is a drawing of no sheet now (under NEW in the revision matrix) — it counts nowhere until you pair that page with a sheet or add it as one`;
  }

  /**
   * keep(page, item) — whether an item counts, with `.run` (one run),
   * `.waiting` (why it counts nowhere, short) and `.book` ({page: revId}).
   */
  countedFilter() {
    const keep = (pg, m) => this.itemCountsTowards(pg, m);
    const book = {};
    for (let p = 0; p < this.n; p++) {
      const rid = this.workingVersionOf(p);
      if (rid) book[p] = rid;
    }
    keep.book = book;
    keep.run = (pg, m) => this.runCountsTowards(pg, m);
    keep.waiting = (pg, m) => this.waitingReason(pg, m, true);
    return keep;
  }

  /** [[page, item]] stamped with a version this sheet no longer has. */
  orphanItems() {
    const out = [];
    for (const page of this.pageKeys()) {
      if (page < 0) continue;
      const have = new Set(this.revs
        .filter(r => (r.match || {})[String(page)] !== undefined && (r.match || {})[String(page)] !== null)
        .map(r => String(r.id)));
      for (const m of this.items(page)) {
        if (!isTakeoffType(m)) continue;
        const rid = itemRevId(m);
        if (rid && (!have.has(rid) || !this.itemOnDrawing(page, rid, m))) out.push([page, m]);
      }
    }
    return out;
  }

  // ── pins and notes come home ───────────────────────────────────────

  /**
   * [revId, revPage] of the drawing an item is SHOWN on: its stamp — except
   * a callout pin or a text note whose drawing this sheet no longer has,
   * which comes back to the sheet's own drawing so it can still be reached.
   * The stamp itself is kept. Takeoff never falls back.
   */
  markVersion(page, m) {
    const rid = itemRevId(m);
    const rp = (m || {}).rev_page;
    if (!rid || !KEPT_MARK_TYPES.has((m || {}).type)) return [rid, rp === undefined ? null : rp];
    for (const v of this.sheetVersions(page)) {
      if (v.revId !== rid) continue;
      if (rp === undefined || rp === null) return [rid, null];
      const a = pyInt(rp), b = pyInt(v.revPage);
      if (!a.ok || !b.ok) return [rid, rp];
      if (a.n === b.n) return [rid, rp];
    }
    return ['', null];
  }

  /** Is this item shown on the drawing `rid` shows for `page`? */
  markOnDrawing(page, rid, m) {
    const [mrid, mrp] = this.markVersion(page, m);
    if (mrid !== String(rid || '')) return false;
    if (!mrid || mrp === null || mrp === undefined) return true;
    const n = pyInt(mrp);
    if (!n.ok) return true;
    const now = this.revPageOf(page, mrid);
    return now !== null && Number(now) === n.n;
  }

  // ── the "another sheet size" rule ──────────────────────────────────

  versionTakeoffSizeOk(page, rid) {
    const r = String(rid || '');
    if (!r || !(page >= 0 && page < this.n)) return true;
    const hit = this.sheetVersions(page).find(v => v.revId === r);
    if (!hit) return true;
    if (!(hit.revPage >= 0 && hit.revPage < revPageCount(hit.rev))) return true;
    const ps = this.sizeOf ? this.sizeOf(page) : null;
    const rs = this.revSizeOf ? this.revSizeOf(hit.rev, hit.revPage) : null;
    if (!ps || !rs) return true;
    return Math.abs(rs[0] - ps[0]) <= 2 && Math.abs(rs[1] - ps[1]) <= 2;
  }

  // ── changing which drawing counts ──────────────────────────────────

  /**
   * desktop set_working_version, as a QUESTION: what the book becomes if
   * `page` counts from `rid`, or null when it may not ('' is the sheet's own
   * drawing). The caller writes it (applyBooking) — inside the undo step of
   * the takeoff that caused it, when one did.
   */
  workingVersionChange(page, rid0) {
    if (!(page >= 0 && page < this.n)) return null;
    const rid = String(rid0 || '');
    if (rid && !this.sheetVersions(page).some(v => v.revId === rid)) return null;
    if (rid && !this.takeoffAmount(page, rid).reduce((a, b) => a + b, 0)
        && !this.versionTakeoffSizeOk(page, rid)) return null;
    const book = { ...(this.md.sheet_version || {}) };
    const was = String(book[String(page)] || '');
    if (was === rid) return null;
    if (rid) book[String(page)] = rid;
    else delete book[String(page)];
    let bookedOver = null;
    if (rid) {
      const rv = this.revs.find(r => String(r.id) === rid);
      const rp = this.revPageOf(page, rid);
      if (rv && rp !== null) bookedOver = { revId: rid, revPage: rp, was };
    }
    return { page, rid, was, book: Object.keys(book).length ? book : null, bookedOver };
  }

  /**
   * The first takeoff on a sheet BOOKS the drawing it was traced on (desktop
   * _book_first_takeoff): if the sheet holds no takeoff on ANY of its
   * drawings — a raw scan; runs, hidden layers and orphans all count as
   * takeoff, notes, pins and rulers do not — the drawing `m` lands on
   * becomes the one it counts from. That moves no number but the one he just
   * drew. null when nothing is booked; else the change and the sentence.
   * Asked BEFORE `m` is filed.
   */
  firstTakeoffBooking(page, m) {
    if (!isTakeoffType(m)) return null;
    if (!(Number.isInteger(page) && page >= 0 && page < this.n)) return null;
    if (this.items(page).some(x => isTakeoffType(x))) return null;
    const rid = itemRevId(m);
    const book = this.md.sheet_version || {};
    if (String(book[String(page)] || '') === rid) return null;
    if (rid && !this.sheetVersions(page).some(v => v.revId === rid)) return null;
    const was = this.workingVersionOf(page);
    const ch = this.workingVersionChange(page, rid);
    if (!ch) return null;
    const after = this.variant({ sheetVersion: ch.book });
    let said = '';
    if (after.workingVersionOf(page) !== was) {
      const w = takeoffQuantityWords([m]);
      said = `${this.pageLabel(page)} now counts from ${this.versionName(rid)} — the drawing `
        + `you are taking off${w ? `; ${w} comes into your totals` : ''}. Nothing was taken `
        + 'off any of its other drawings, so no other total moved.';
    }
    return { ...ch, said };
  }

  /**
   * The question asked when takeoff lands on a drawing its sheet does NOT
   * count from (desktop _ask_count_after_takeoff + ask_count_version): the
   * lead, and the body with the before and the after. null when there is
   * nothing to ask.
   */
  countQuestion(page, rid0, lead = '') {
    const rid = String(rid0 || '');
    const was = this.workingVersionOf(page);
    if (rid === was) return null;
    const sheet = this.pageLabel(page);
    const toName = this.versionName(rid);
    const fromName = this.versionName(was);
    const hasTo = this.takeoffAmount(page, rid).reduce((a, b) => a + b, 0);
    // A drawing nothing can be traced on is a drawing this sheet would
    // contribute nothing from, for good: refused, and said why.
    if (!hasTo && !this.versionTakeoffSizeOk(page, rid)) {
      return { page, rid, was, refused: `${sheet} cannot count from ${toName}: it was reissued `
        + 'at a different sheet size, so nothing can be traced on it — the scale is the '
        + 'sheet’s, measured on the sheet’s own drawing. '
        + `${sheet} would contribute nothing, for good. Nothing was changed.` };
    }
    const moved = this.totalsEffectWords({ book: { [page]: rid } });
    let body = `${sheet} will count from ${toName} instead of ${fromName}.\n\n`
      + (moved ? `In your totals: ${moved}.`
        : 'Your totals do not change: nothing taken off either drawing counts differently.')
      + '\n\nNothing is deleted: the takeoff on every other version stays where it is, and is '
      + 'listed on the report as not counted. You can change this back the same way.';
    if (lead) body = `${lead}\n\n${body}`;
    if (!hasTo) {
      body += '\n\nThere is no takeoff on that drawing yet, so this sheet will contribute '
        + 'nothing until you take it off.';
    }
    return { page, rid, was, body, moved };
  }

  /** The lead of that question: why he is asked (desktop wording). */
  afterTakeoffLead(page, m) {
    const rid = itemRevId(m);
    const was = this.workingVersionOf(page);
    const just = takeoffQuantityWords([m]);
    const counted = this.countedTakeoffOn(page);
    const there = takeoffQuantityWords(counted);
    return `What you just took off on ${this.versionName(rid)}${just ? ` (${just})` : ''} is not `
      + `in your totals: ${this.pageLabel(page)} counts from ${this.versionName(was)}, `
      + (there ? `where ${there} ${counted.length === 1 ? 'is' : 'are'} in your totals`
        : 'which holds nothing that counts')
      + '.';
  }

  /** "<sheet> now counts from X instead of Y — in your totals: ...". */
  bookedSentence(page, rid, was, before, after) {
    const moved = takeoffMoveWords(before, after);
    return `${this.pageLabel(page)} now counts from ${this.versionName(rid)} instead of `
      + `${this.versionName(was)} — ${moved ? `in your totals: ${moved}` : 'your totals did not change'}.`;
  }

  /** The No to that question, said (desktop wording). */
  declinedSentence(page, m) {
    const rid = itemRevId(m);
    const just = takeoffQuantityWords([m]);
    return `${this.pageLabel(page)} still counts from ${this.versionName(this.workingVersionOf(page))}. `
      + `What you take off on ${this.versionName(rid)}${just ? ` (${just})` : ''} is kept and marked `
      + 'NOT COUNTED — it is not in your totals. Count this version, on the version bar, changes that.';
  }

  // ── jobs taken off on a drawing that does not count ────────────────

  /**
   * [[page, revId, items, runs]] for every sheet whose takeoff is ALL on one
   * drawing, when that is not the drawing the sheet counts from — the state
   * of every job taken off on a revision before 3.05 (desktop
   * _lone_uncounted_sheets).
   */
  loneUncountedSheets() {
    const out = [];
    for (let page = 0; page < this.n; page++) {
      const raw = this.items(page).filter(m => isTakeoffType(m));
      if (!raw.length) continue;
      const rids = new Set(raw.map(itemRevId));
      if (rids.size !== 1) continue;
      const rid = [...rids][0];
      if (rid === this.workingVersionOf(page)) continue;
      if (rid && !this.sheetVersions(page).some(v => v.revId === rid)) continue;
      if (rid && !raw.every(m => this.itemOnDrawing(page, rid, m))) continue;
      if (!this.versionTakeoffSizeOk(page, rid)) continue;
      const [items, runs] = this.takeoffAmount(page, rid);
      out.push([page, rid, items, runs]);
    }
    return out;
  }

  /**
   * One line naming takeoff that is not in the totals because its sheet
   * counts another drawing — the sheets, how much, and where the list marks
   * them (desktop _left_out_sentence).
   */
  leftOutSentence(lone, lead) {
    const tItems = lone.reduce((s, x) => s + x[2], 0);
    const tRuns = lone.reduce((s, x) => s + x[3], 0);
    const n = lone.length;
    const names = lone.slice(0, 6).map(x => this.pageLabel(x[0])).join(', ') + (n > 6 ? '…' : '');
    const held = [];
    for (const [p, r] of lone) {
      for (const m of this.items(p)) if (isTakeoffType(m) && itemRevId(m) === r) held.push(m);
    }
    const sum = takeoffSumText(held.map(takeoffQty));
    const what = takeoffQuantityWords(held) || amountWords(tItems, tRuns);
    return `${lead}: ${what}${sum && held.length > 1 ? ` (${sum} in all)` : ''} on ${n} sheet`
      + `${n === 1 ? '' : 's'} (${names}) stay${(tItems + tRuns) === 1 ? 's' : ''} out of your `
      + `totals — taken off on a drawing ${n === 1 ? 'that sheet does' : 'those sheets do'} not `
      + `count from. The ⚠ tiles in the Pages list mark ${n === 1 ? 'it' : 'them'}.`;
  }

  // ── a sheet whose counted drawing is empty while another holds takeoff ─

  /**
   * {page: [working, here, other]} — what the watch compares between two
   * moments (desktop _watch_counted_takeoff's state, keyed by page here: a
   * page insert or delete re-primes it).
   */
  countedState() {
    const out = {};
    for (let page = 0; page < this.n; page++) {
      const raw = new Map();
      for (const m of this.items(page)) {
        if (!isTakeoffType(m)) continue;
        const r = itemRevId(m);
        raw.set(r, (raw.get(r) || 0) + 1);
      }
      if (!raw.size) continue;
      const wid = this.workingVersionOf(page);
      const here = raw.get(wid) || 0;
      let tot = 0;
      for (const v of raw.values()) tot += v;
      out[page] = [wid, here, tot - here];
    }
    return out;
  }

  /**
   * The sentence for the sheets that have just come to HOLD takeoff that
   * does not count while their counted drawing holds nothing — '' when none
   * did. `prev` is countedState() from before the edit.
   */
  watchSentence(prev) {
    const now = this.countedState();
    let said = [];
    for (const [k, [wid, nHere, nOther]] of Object.entries(now)) {
      const p = prev ? prev[k] : undefined;
      if (p !== undefined && p[0] !== wid) continue;     // the book moved: said by its mover
      const [pHere, pOther] = p ? [p[1], p[2]] : [0, 0];
      if (nHere === 0 && nOther > 0 && !(pHere === 0 && pOther > 0)) {
        said.push([Number(k), wid, pHere > 0]);
      }
    }
    if (!said.length) return '';
    // A drawing that is not in the job YET -- its revision parked until it
    // is imported again -- can be neither opened nor counted: that sheet is
    // said by the import-again sentence (desktop _mark_revisions_changed).
    const pend = new Set((this.md.revisions_pending_images || [])
      .filter(q => q && typeof q === 'object').map(q => String(q.id)));
    if (pend.size) {
      const bk = this.md.sheet_version || {};
      said = said.filter(([page, wid]) => {
        if (pend.has(String(bk[String(page)] || ''))) return false;
        const others = new Set(this.items(page).filter(isTakeoffType).map(itemRevId));
        others.delete(wid);
        return ![...others].every(r => pend.has(r));
      });
      if (!said.length) return '';
    }
    const bits = [];
    for (const [page, wid, emptied] of said.slice(0, 3)) {
      const rids = [...new Set(this.items(page).filter(isTakeoffType).map(itemRevId))]
        .filter(r => r !== wid)
        .sort((a, b) => ((this.revisionNumber(a) || 0) - (this.revisionNumber(b) || 0))
          || (a < b ? -1 : a > b ? 1 : 0));
      const others = rids.map(r => `${this.versionName(r)} (${
        takeoffQuantityWords(this.items(page).filter(m => isTakeoffType(m) && itemRevId(m) === r))
        || amountWords(...this.takeoffAmount(page, r))})`);
      if (emptied) {
        bits.push(`${this.pageLabel(page)}: nothing is left on ${this.versionName(wid)}, the drawing it `
          + `counts from, so it adds nothing to your totals now. The takeoff on ${others.join(', ')} is `
          + 'not counted — open that drawing and press Count this version to count it');
      } else {
        bits.push(`${this.pageLabel(page)}: the takeoff on ${others.join(', ')} is back, and it is NOT `
          + `counted — the sheet counts from ${this.versionName(wid)}, which holds nothing. Open that `
          + 'drawing and press Count this version to count it');
      }
    }
    if (said.length > 3) bits.push(`and ${said.length - 3} more sheets the same`);
    return `${bits.join('. ')}.`;
  }

  // ── the Pages list's tiles ─────────────────────────────────────────

  /**
   * {page: {kind, text, short, added, shows, tip}} for every tile that says
   * something (desktop _sheet_tile_states): REV n when a revision superseded
   * the sheet, ADDED when a revision brought it, ⚠ when the takeoff counts
   * from a drawing other than the one shown. All of it is LOOKING.
   */
  sheetTileStates() {
    const out = {};
    if (!this.n) return out;
    const origin = this.originMap();
    if (!this.revs.length && !Object.keys(origin).length) return out;
    const known = new Set(this.revs.map(r => String(r.id)));
    for (let i = 0; i < this.n; i++) {
      const org = origin[String(i)] || null;
      const vers = this.sheetVersions(i);
      const shown = vers.length > 1 ? this.newestVersionOf(i) : '';
      const counted = this.workingVersionOf(i);
      const raw = new Map();
      for (const m of this.items(i)) {
        if (!isTakeoffType(m)) continue;
        const rid = itemRevId(m);
        raw.set(rid, (raw.get(rid) || 0) + 1);
      }
      const warn = raw.size > 0 && counted !== shown;
      if (!(shown || org || warn)) continue;
      let shows = null;
      if (shown) {
        const hit = vers.find(v => v.revId === shown);
        if (hit && hit.revPage >= 0 && hit.revPage < revPageCount(hit.rev)) shows = [shown, hit.revPage];
      }
      const tag = shown ? this.revTag(shown) : '';
      const no = shown ? this.revisionNumber(shown) : 0;
      const stag = (tag && [...tag].length <= 5 && !tag.startsWith('REV '))
        ? tag : (no ? `R${no}` : [...tag].slice(0, 3).join(''));
      let kind, text, short;
      if (warn) {
        kind = 'warn';
        text = `⚠ ${tag || (org ? 'ADDED' : 'ORIG')}`;
        short = `⚠${stag || (org ? '◆' : '')}`;
      } else if (org) {
        kind = 'added';
        text = shown ? `◆ ${tag}` : 'ADDED';
        short = `◆${stag}`;
      } else {
        kind = 'rev'; text = tag; short = stag;
      }
      out[i] = { kind, text, short, added: org !== null, shows,
        tip: this.sheetTileTip(i, vers, shown, counted, org, raw, warn, known) };
    }
    return out;
  }

  sheetTileTip(page, vers, shown, counted, org, raw, warn, known) {
    const nm = this.pageLabel(page);
    const lines = [];
    if (org) {
      const [rid, rp, date] = org;
      const src = known.has(rid) ? this.revTitle(rid)
        : `a revision since deleted${date ? `, dated ${date}` : ''}`;
      lines.push(`ADDED — not part of the original plans. ${nm} came with ${src}, as page ${rp + 1} of that set.`);
    }
    if (shown) {
      lines.push(org
        ? `Reissued since: the list shows ${this.revTitle(shown)}, the newest of the ${vers.length} drawings of this sheet.`
        : `REVISED — the list shows ${this.revTitle(shown)}, the newest of the ${vers.length} drawings of this sheet.`);
    }
    let own;
    if (!org) own = 'its own drawing (the original set)';
    else if (known.has(org[0])) own = `its own drawing (it came with ${this.revTag(org[0])})`;
    else own = 'its own drawing';
    const where = rid => (!rid ? own : (known.has(rid) ? this.revTitle(rid) : 'a revision since removed'));
    const items = this.itemsByVersion(page);
    const amount = rid => {
      const nIt = items.get(rid) || 0;
      const runs = (raw.get(rid) || 0) - nIt;
      const bits = [];
      if (nIt) bits.push(`${nIt} item${nIt === 1 ? '' : 's'}`);
      if (runs > 0) bits.push(`${runs} shape${runs === 1 ? '' : 's'} of items that span sheets`);
      return bits.join(' and ') || 'nothing';
    };
    if (!raw.size) {
      lines.push('Nothing taken off this sheet yet.');
    } else {
      lines.push(`Counting: ${where(counted)} — ${raw.get(counted) ? amount(counted) : 'nothing is taken off it'}.`);
      const others = [...raw.keys()].filter(r => r !== counted)
        .sort((a, b) => ((this.revisionNumber(a) || 1e6) - (this.revisionNumber(b) || 1e6))
          || (a < b ? -1 : a > b ? 1 : 0));
      for (const rid of others.slice(0, 4)) lines.push(`Not counted: ${amount(rid)} on ${where(rid)}.`);
      if (others.length > 4) lines.push(`…and takeoff on ${others.length - 4} more drawings, not counted.`);
    }
    if (warn) {
      const how = (shown && !this.versionTakeoffSizeOk(page, shown))
        ? "The drawing shown is another sheet size, so it cannot be taken off here: the scale belongs to the sheet's own drawing."
        : 'To count the drawing shown instead, open the sheet and press Count this version on the version bar — you are shown the change before it is made.';
      lines.push(`⚠ What counts is not the drawing shown. Nothing in your totals has changed. ${how}`);
    }
    return lines.join('\n');
  }

  // ── the report's closing tables ─────────────────────────────────────

  /**
   * [[page, countedRevId, Map{revId: [items not counted]}]] for every sheet
   * holding takeoff on a version that does not count (desktop
   * ReportCenterDialog._counted_book). `listsRow(m)` says whether the report
   * lists this type at all (the ruler only with dimensions included).
   */
  countedBook(listsRow = () => true) {
    const out = [];
    const keys = this.pageKeys().filter(k => k >= 0).sort((a, b) => a - b);
    for (const pg of keys) {
      const left = new Map();
      let countedRid = '';
      for (const m of this.items(pg)) {
        if (!m || ['textnote', 'page_ref', 'pitch', 'group', 'ref_distance'].includes(m.type)) continue;
        if (!listsRow(m)) continue;
        const rid = String(m.rev_id || '');
        if (this.runCountsTowards(pg, m)) {
          if (!truthy(m.group_child)) countedRid = rid;
        } else if (this.waitingReason(pg, m, true)) {
          continue;
        } else {
          if (!left.has(rid)) left.set(rid, []);
          left.get(rid).push(m);
        }
      }
      if (left.size) out.push([pg, countedRid, left]);
    }
    return out;
  }

  /** [[page, item, where]] for takeoff counted NOWHERE (_waiting_book). */
  waitingBook(listsRow = () => true) {
    const out = [];
    const keys = this.pageKeys().filter(k => k >= 0).sort((a, b) => a - b);
    for (const pg of keys) {
      for (const m of this.items(pg)) {
        if (!m || ['textnote', 'page_ref', 'pitch', 'group', 'ref_distance'].includes(m.type)) continue;
        if (!listsRow(m)) continue;
        const why = this.waitingReason(pg, m, true);
        if (why) out.push([pg, m, why]);
      }
    }
    return out;
  }

  // ── the Current Set, with promoted sheets ranked as what they are ──

  latestSheets({ includeNew = true, excludeIds = null } = {}) {
    const labels = Array.from({ length: this.n }, (_, i) => this.pageLabel(i));
    return resolveLatestSheets(labels, this.md.extra_sheets || [], this.visibleRevisions(),
      { order: this.order, includeNew, origins: this.originMap(),
        names: this.revisionNames(), excludeIds });
  }
}

/**
 * Write a booking into the metadata (the desktop's set_working_version, the
 * writing half). Called inside the transaction of the takeoff that caused it,
 * so an undo of that takeoff takes the booking back with it.
 */
export function applyBooking(md, change) {
  if (!change) return;
  if (change.book) md.sheet_version = { ...change.book };
  else delete md.sheet_version;
  if (change.bookedOver) {
    const { revId, revPage, was } = change.bookedOver;
    const rev = (md.revisions || []).find(r => String(r.id) === revId);
    if (rev) {
      rev.booked_over = { ...(rev.booked_over || {}) };
      rev.booked_over[String(revPage)] = was;
    }
  }
}

/** Python's `"%s" % x` for the quantity cell of a report's closing table. */
export function valueLine(m) {
  const t = (m || {}).type || '';
  const v = orZero(m.value);
  if (t === 'count') return `${(m.points || []).length} EA`;
  if (['area', 'grid', 'tile', 'slope_area'].includes(t)) {
    const f = pyFloat(v);
    return `${f.ok ? pyFixed(f.n, 1, true) : '0.0'} sq ft`;
  }
  if (t === 'distance' || t === 'polyline') {
    const f = pyFloat(v);
    return `${f.ok ? pyFixed(f.n, 2, true) : '0.00'} LF`;
  }
  if (t === 'standalone') {
    const f = pyFloat(orZero(m.qty));
    return `${pyG(f.ok ? f.n : 0)} ${m.unit || 'each'}`;
  }
  return '1 EA';
}
