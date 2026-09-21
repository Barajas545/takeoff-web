// revisions.js — plan revisions: the model, and the rule for "which drawing is
// current". Pure logic, no DOM, no pixels.
//
// WHAT A REVISION IS. The architect reissues part of the set. Those sheets are
// imported as a REVISION SET: a list of pages that sits alongside the original
// drawings rather than replacing them, because the takeoff on a sheet was
// traced over that sheet's own lines and moving it to a different drawing would
// put measurements on lines they were never taken from.
//
// So a project holds one original set plus N revision sets, and every sheet
// number can have several versions. Two questions follow, and this module
// answers both the way the desktop app does:
//
//   · which versions does this sheet have?            sheetVersions()
//   · which one of them is the CURRENT drawing?       newestVersionOf()
//                                                     resolveLatestSheets()
//
// "Newest" is the hard one. Revision dates are typed by hand, arrive in several
// formats, are sometimes blank, and two revisions issued the same day are
// ordinary. Measured on the estimator's largest job: 11 revision sets, dates
// written as "3-4-2026", "05/6/2026" and "06-19-2026" — and the one written
// "06-19-2026" sits NINTH in the list, so list order is not date order. The
// rule is therefore stated once, here, and used by everything that has an
// opinion about which drawing is current.
//
// ─────────────────────────────────────────────────────────────────────────
// PORTING NOTE. The desktop holds `rev["images"]` — decoded PIL pages — and
// bounds-checks every page index against it. This app never holds a revision's
// pixels: on the largest real job the revision tail alone is 1.42 GB. It holds
// the BLOB COUNT read out of the file's index, as `rev.pageCount`, and bounds-
// checks against that instead. Verified against the library: the blob count and
// page_labels.length agree on every revision set in every project that has one.
// ─────────────────────────────────────────────────────────────────────────
//
// Checked against the desktop's own functions by tests/revisions-logic.mjs,
// which runs them through tests/revisions-python-truth.py rather than against
// a transcription of them.

/** How many pages a revision set has, without holding one of them. */
export function revPageCount(rev) {
  if (!rev) return 0;
  if (Number.isFinite(rev.pageCount)) return rev.pageCount;
  return (rev.page_labels || []).length;
}

/**
 * The revision sets the matrix shows and the Current Set chooses from.
 *
 * Hiding or archiving a revision is a way of LOOKING — it takes a column out
 * of the matrix. It is deliberately not the same list that `workingVersionOf`
 * resolves against, which has to see every revision including the hidden ones,
 * because hiding one must not silently move a price.
 *
 * A set with no pages is dropped too. The desktop drops it at load
 * (`if _r["images"]`), so its column never exists there; leaving it in here
 * would shift every column number after it and rank against the wrong index.
 * It can only ever be a record at the END of the list — the file pairs records
 * with blob sets by position, so "no pages" means "past the last set".
 *
 * THE COLUMN INDEX IS AN INDEX INTO THIS LIST, not into metadata.revisions.
 * Everything that ranks, names a column, or reads `cols` counts from here.
 */
export function visibleRevisions(revs) {
  return (revs || []).filter(
    r => r.visible !== false && !r.archived && revPageCount(r) > 0);
}

// ── sheet numbers ────────────────────────────────────────────────────────

/**
 * Compare sheet numbers the way a human does — 'S-2.1', 'S2.1' and 's 2 1'
 * are all the same sheet.
 */
export function normalizeSheetLabel(s) {
  return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * A different, WEAKER normaliser, used only for auto-pairing on import.
 *
 * It folds case and spaces but keeps punctuation, so 'S-2.1' and 'S2.1' stay
 * different sheets here while `normalizeSheetLabel` calls them the same. Both
 * exist in the desktop and they are not interchangeable: matching is
 * deliberately stricter than comparing.
 */
export function normSheet(s) {
  return String(s == null ? '' : s).trim().toUpperCase().replace(/\s+/g, '');
}

// ── dates and ranking ────────────────────────────────────────────────────

const REV_DATE_RE = /^\s*(\d{1,4})\s*[-/.]\s*(\d{1,2})\s*[-/.]\s*(\d{1,4})\s*$/;

/**
 * Turn a hand-typed revision date into [y, m, d], or null.
 *
 * Accepts 07/24/2026, 3-4-2026 and 2026-08-19. A date nobody can read is not
 * guessed at — it comes back null and that revision ranks oldest, which is the
 * direction that cannot silently promote the wrong sheet into a bid.
 */
export function parseRevisionDate(s) {
  const m = REV_DATE_RE.exec(String(s == null ? '' : s));
  if (!m) return null;
  const a = parseInt(m[1], 10), b = parseInt(m[2], 10), c = parseInt(m[3], 10);
  let y, mo, d;
  if (a > 31) { y = a; mo = b; d = c; }       // 2026-08-19
  else { mo = a; d = b; y = c; }              // 07/24/2026 · 3-4-2026
  if (y < 100) y += y < 70 ? 2000 : 1900;
  if (!(mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
  return [y, mo, d];
}

// Every rank is [hasDate, [y, m, d], column], so a revision with no readable
// date can never outrank a dated one by accident — and the ORIGINAL, at -1,
// ranks below both. Note what that means: an UNDATED revision still beats the
// original drawing. That is the desktop's rule, and it is the safe direction —
// a set that was reissued is newer than one that was not, whatever the typist
// left out.
export const ORIGINAL_RANK = [-1, [0, 0, 0], -1];

/** How new a revision is. Bigger wins. `col` indexes the VISIBLE revisions. */
export function revisionRank(rev, col, order = 'date') {
  if (order === 'column') return [0, [0, 0, 0], col];
  const d = parseRevisionDate(rev && rev.date);
  return d ? [1, d, col] : [0, [0, 0, 0], col];
}

/** Tuple comparison, the way Python compares the rank tuples. */
export function compareRank(a, b) {
  if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
  for (let i = 0; i < 3; i++) {
    if (a[1][i] !== b[1][i]) return a[1][i] < b[1][i] ? -1 : 1;
  }
  if (a[2] !== b[2]) return a[2] < b[2] ? -1 : 1;
  return 0;
}

/** The name a revision goes by in the matrix and the Current Set. */
export function revName(rev, col) {
  return ((rev && rev.description) || '').trim() || `Revision ${col + 1}`;
}

/** The sheet number printed on one page of a revision set. */
export function revPageLabel(rev, rp) {
  const labels = (rev && rev.page_labels) || [];
  return (rp >= 0 && rp < labels.length ? labels[rp] : '') || '';
}

// ── pairing a revision's pages with the original sheets ──────────────────

/**
 * Auto-pair revision pages with main pages by sheet number.
 *
 * Returns {mainIndexAsString: revPageIndex} — note the direction, which is the
 * one the file stores: the KEY is the original sheet, the VALUE is the page of
 * the revision that reissues it. Getting this backwards reads every match map
 * in every existing project inside out.
 *
 * Falls back to positional pairing when no labels match at all, which is what
 * an unlabelled scan of a drawing set leaves you with.
 */
export function autoMatchPages(mainLabels, revLabels) {
  const revBy = new Map();
  (revLabels || []).forEach((rl, j) => {
    const n = normSheet(rl);
    if (n && !revBy.has(n)) revBy.set(n, j);
  });
  const match = {};
  const used = new Set();
  (mainLabels || []).forEach((ml, i) => {
    const n = normSheet(ml);
    const j = revBy.get(n);
    if (n && j !== undefined && !used.has(j)) {
      match[String(i)] = j;
      used.add(j);
    }
  });
  if (!Object.keys(match).length) {
    const n = Math.min((mainLabels || []).length, (revLabels || []).length);
    for (let i = 0; i < n; i++) match[String(i)] = i;
  }
  return match;
}

// ── the versions of one sheet ────────────────────────────────────────────

/**
 * Every version of one sheet, oldest first, as
 * [{revId, label, date, description, rev, revPage, col}].
 *
 * The original is revId '' and rev null. Order matches the revision matrix,
 * which is list order and NOT date order — the matrix is an arrangement, the
 * ranking is a judgement, and they are allowed to disagree.
 */
export function sheetVersions(page, revs) {
  const out = [{
    revId: '', label: 'ORIGINAL', date: '', description: '',
    rev: null, revPage: page, col: 0,
  }];
  visibleRevisions(revs).forEach((rev, c) => {
    const rp = (rev.match || {})[String(page)];
    if (rp === undefined || rp === null || !(rp >= 0 && rp < revPageCount(rev))) return;
    out.push({
      revId: String(rev.id),
      label: (rev.description || '').trim() || (rev.date || 'Revision'),
      date: rev.date || '',
      description: rev.description || '',
      rev, revPage: rp, col: c + 1,
    });
  });
  return out;
}

/**
 * The rev_id of the newest version of a sheet, by the SAME rule the Current
 * Set uses. Two answers to "which drawing is current" is a wrong sheet in a
 * bid, so there is only one rule and this is it.
 *
 * '' means the sheet's own drawing.
 */
export function newestVersionOf(page, revs, order = 'date') {
  const vis = visibleRevisions(revs);
  let best = '';
  let bestRank = ORIGINAL_RANK;
  for (let c = 0; c < vis.length; c++) {
    const rev = vis[c];
    const rp = (rev.match || {})[String(page)];
    if (rp === undefined || rp === null || !(rp >= 0 && rp < revPageCount(rev))) continue;
    const rank = revisionRank(rev, c, order);
    if (compareRank(rank, bestRank) > 0) { best = String(rev.id); bestRank = rank; }
  }
  return best;
}

/**
 * Which version of a sheet COUNTS towards the totals.
 *
 * Read out of metadata and nowhere else. It is not "the newest", not "the one
 * with work on it", and not "the one on screen": drawing something must never
 * move a price, and neither must looking at something.
 *
 * Resolved against EVERY revision, hidden and archived included, because
 * hiding a revision is a way of looking. A revision that has been deleted, or
 * whose match to this sheet is gone, falls back to the sheet's own drawing.
 *
 * Absent means the original, so every project made before this feature keeps
 * the totals it has always had.
 */
export function workingVersionOf(page, revs, sheetVersionMap) {
  const rid = String((sheetVersionMap || {})[String(page)] || '');
  if (!rid) return '';
  for (const rev of revs || []) {
    if (String(rev.id) === rid
        && (rev.match || {})[String(page)] !== undefined
        && (rev.match || {})[String(page)] !== null) return rid;
  }
  return '';
}

/**
 * Which page of `revId` stands in for `page` right now, or null.
 *
 * Re-pairing the matrix can move which page of a revision stands in for a
 * sheet, so this is asked fresh rather than remembered.
 */
export function revPageOf(page, revId, revs) {
  const rid = String(revId || '');
  if (!rid) return null;
  for (const rev of revs || []) {
    if (String(rev.id) !== rid) continue;
    const rp = (rev.match || {})[String(page)];
    return (rp !== undefined && rp !== null && rp >= 0 && rp < revPageCount(rev)) ? rp : null;
  }
  return null;
}

/**
 * Was this item traced on the drawing `revId` shows for `page` NOW?
 *
 * Re-pairing the matrix can move which page of a revision stands in for a
 * sheet. The quantity still belongs to the page it was traced on, so after a
 * swap it is neither painted nor printed over the page that took its place.
 */
export function itemOnDrawing(page, revId, item, revs) {
  const rp = item && item.rev_page;
  if (rp === undefined || rp === null) return true;
  const now = revPageOf(page, revId, revs);
  const n = Number(rp);
  if (!Number.isFinite(n)) return true;
  return now === n;
}

/** The rev_id an item was traced on. '' is the sheet's own drawing. */
export function itemRevId(item) {
  return String((item && item.rev_id) || '');
}

/**
 * Whether an item belongs to the drawing currently on screen.
 *
 * The takeoff belongs to the sheet AND to the version of it that was under the
 * pencil. Painting an item over a DIFFERENT version of that drawing would put
 * a measurement on lines it was never taken from, which is the one thing a set
 * of drawings must never do — so the work of every OTHER version is hidden,
 * not the work of all of them. Browsing a revision that was taken off shows
 * that revision's own items.
 *
 * A version is not one drawing, it is a set of them, and the matrix can
 * re-pair which of its pages stands in for this sheet. So the test is the PAGE
 * of the version, not the version alone: after a swap, work traced on page 5
 * must not be painted over page 7. An item with no `rev_page` predates that
 * being stamped and reads back unchanged.
 *
 * `viewingRevPage` is null when the sheet's own drawing is up.
 */
export function onThisVersion(item, viewingRevId, viewingRevPage) {
  if (itemRevId(item) !== String(viewingRevId || '')) return false;
  const rp = item && item.rev_page;
  if (rp === undefined || rp === null || viewingRevPage === null
      || viewingRevPage === undefined) return true;
  const a = Number(rp), b = Number(viewingRevPage);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
  return a === b;
}

/** The items on a page that belong to the drawing on screen. */
export function versionItems(items, viewingRevId, viewingRevPage) {
  return (items || []).filter(m => onThisVersion(m, viewingRevId, viewingRevPage));
}

/**
 * Whether takeoff may be traced on the drawing on screen.
 *
 * The scale belongs to the SHEET, and the sheet's calibration is in pixels of
 * the sheet's own image. A revision reissued at another sheet size has a
 * different number of pixels to the foot, so a length traced on it would be
 * stored against a scale it was never measured with — a wrong number, quietly.
 * Revisions render at the project's own dpi, so a reissue on the same paper is
 * pixel-identical and this is true; only a genuine paper-size change fails it.
 */
export function sizesMatch(sheetSize, revSize) {
  if (!sheetSize || !revSize) return true;
  return Math.abs(revSize.width - sheetSize.width) <= 2
    && Math.abs(revSize.height - sheetSize.height) <= 2;
}

/** Why nothing may be traced here, in the estimator's own terms. */
export function sizeRefusal(sheetSize, revSize) {
  const sw = Math.round((revSize && revSize.width) || 0);
  const sh = Math.round((revSize && revSize.height) || 0);
  const pw = Math.round((sheetSize && sheetSize.width) || 0);
  const ph = Math.round((sheetSize && sheetSize.height) || 0);
  return 'This revision was reissued at a different sheet size '
    + `(${sw}×${sh} against ${pw}×${ph} pixels at this job's dpi). `
    + 'The scale is the sheet’s, measured on the sheet’s own drawing, '
    + 'so anything traced here would come out at the wrong length.';
}

/** {revId: how many items} on one sheet. A group's child is not an item. */
export function itemsByVersion(items) {
  const out = {};
  for (const m of items || []) {
    if (m.group_child) continue;
    const rid = itemRevId(m);
    out[rid] = (out[rid] || 0) + 1;
  }
  return out;
}

/**
 * The short name of a version, for a status line.
 *
 * '' is the sheet's own drawing, and an id no revision answers to is one that
 * was removed from the project while its takeoff was still filed under it —
 * which is worth saying out loud rather than showing as a blank.
 */
export function revisionLabel(revId, revs) {
  const rid = String(revId || '');
  if (!rid) return '';
  for (const rev of revs || []) {
    if (String(rev.id) !== rid) continue;
    const d = (rev.description || '').trim();
    const dt = (rev.date || '').trim();
    let nm = d || dt || 'Revision';
    if (!(rev.visible !== false && !rev.archived)) nm += ' (hidden)';
    return nm;
  }
  return 'removed revision';
}

// ── the row plan: original sheets, inserted rows, orphans ────────────────

/**
 * The rows of the revision matrix, in order.
 *
 * Original sheets in their own order, with any inserted "new sheet" row
 * dropped in where `extra_sheets` says it goes. A slot with `after: -1` sits
 * before the first sheet; `after: i` sits directly after sheet i.
 *
 * `bound` is the set of slot ids some visible revision actually fills. A slot
 * nothing fills is not shown — it would be a row of empty cells.
 */
export function rowPlan(mainLabels, extraSheets, revs) {
  const bound = new Set();
  for (const r of revs || []) {
    for (const k of Object.keys(r.extra || {})) bound.add(k);
  }
  const byAfter = new Map();
  for (const s of extraSheets || []) {
    if (!bound.has(s.id)) continue;
    let a = parseInt(s.after, 10);
    if (!Number.isFinite(a)) a = -1;
    if (!byAfter.has(a)) byAfter.set(a, []);
    byAfter.get(a).push(s);
  }
  const plan = (byAfter.get(-1) || []).map(s => ({ kind: 'slot', slot: s }));
  for (let i = 0; i < (mainLabels || []).length; i++) {
    plan.push({ kind: 'main', index: i });
    for (const s of byAfter.get(i) || []) plan.push({ kind: 'slot', slot: s });
  }
  return plan;
}

/**
 * Work out the newest version of every sheet number in the set.
 *
 * Mirrors the revision matrix exactly — original sheets in their order,
 * inserted "new sheet" rows where the panel shows them, and any revision page
 * still unmatched at the bottom. Returns {rows, notes}; each row says which
 * sheet it is, where the page came from and why that one won, so the choice
 * can be shown before anything is printed from it.
 *
 * `revs` must already be the VISIBLE set — the column index is an index into
 * it, and feeding the full list in would rank by the wrong column.
 *
 * Row shape: {sheet, source, date, from, versions, kind, cols, usedCol} where
 * `from` is ['main', i] or ['rev', col, revPage], `cols` maps column number to
 * the same, and `kind` is 'main' | 'slot' | 'new'.
 */
export function resolveLatestSheets(mainLabels, extraSheets, revs, opts = {}) {
  const order = opts.order || 'date';
  const includeNew = opts.includeNew !== false;
  const rows = [];

  for (const step of rowPlan(mainLabels, extraSheets, revs)) {
    // Column 0 is the ORIGINAL set; revision c sits in column c + 1, the same
    // way the matrix on screen reads.
    const cands = [];
    let sheet;
    if (step.kind === 'main') {
      const i = step.index;
      sheet = (mainLabels[i] || '').trim() || `Page ${i + 1}`;
      cands.push({ rank: ORIGINAL_RANK, src: 'ORIGINAL', date: '', where: ['main', i], col: 0 });
      (revs || []).forEach((rev, c) => {
        const rp = (rev.match || {})[String(i)];
        if (rp === undefined || rp === null || !(rp >= 0 && rp < revPageCount(rev))) return;
        cands.push({
          rank: revisionRank(rev, c, order), src: revName(rev, c),
          date: rev.date || '', where: ['rev', c, rp], col: c + 1,
        });
      });
    } else {
      const slot = step.slot;
      sheet = (slot.label || '').trim() || 'NEW SHEET';
      (revs || []).forEach((rev, c) => {
        const rp = (rev.extra || {})[slot.id];
        if (rp === undefined || rp === null || !(rp >= 0 && rp < revPageCount(rev))) return;
        cands.push({
          rank: revisionRank(rev, c, order), src: revName(rev, c),
          date: rev.date || '', where: ['rev', c, rp], col: c + 1,
        });
      });
      if (!cands.length) continue;          // an empty row exports nothing
    }

    // Python's max() keeps the FIRST maximum, so only a STRICTLY greater
    // candidate displaces the one in hand.
    let best = cands[0];
    for (const c of cands) if (compareRank(c.rank, best.rank) > 0) best = c;

    const cols = {};
    for (const c of cands) cols[c.col] = c.where;
    rows.push({
      sheet, source: best.src, date: best.date, from: best.where,
      versions: cands.length, kind: step.kind, cols, usedCol: best.col,
    });
  }

  // Revision pages nobody has paired with a sheet yet. Leaving them out would
  // quietly drop a sheet the architect issued, so they go in — one per sheet
  // number, newest, same rule as everything else.
  let orphans = 0;
  if (includeNew) {
    const byLabel = new Map();
    const loose = [];
    (revs || []).forEach((rev, c) => {
      const used = new Set([
        ...Object.values(rev.match || {}),
        ...Object.values(rev.extra || {}),
      ]);
      for (let rp = 0; rp < revPageCount(rev); rp++) {
        if (used.has(rp)) continue;
        const lbl = revPageLabel(rev, rp).trim();
        const ent = {
          rank: revisionRank(rev, c, order), src: revName(rev, c),
          date: rev.date || '', where: ['rev', c, rp], lbl,
        };
        if (lbl) {
          const key = normalizeSheetLabel(lbl);
          const prev = byLabel.get(key);
          if (!prev || compareRank(ent.rank, prev.rank) > 0) byLabel.set(key, ent);
        } else {
          loose.push(ent);
        }
      }
    });
    for (const ent of [...byLabel.values(), ...loose]) {
      orphans += 1;
      rows.push({
        sheet: ent.lbl || `(unnamed p.${ent.where[2] + 1})`,
        source: ent.src, date: ent.date, from: ent.where,
        versions: 1, kind: 'new',
        cols: { [ent.where[1] + 1]: ent.where },
        usedCol: ent.where[1] + 1,
      });
    }
  }

  // Two rows carrying the same sheet number means the set's page numbers need
  // attention — the export is still right, each row is a real page, but the
  // reader deserves to know before printing it.
  const seen = new Set();
  const dupes = new Set();
  for (const r of rows) {
    const key = normalizeSheetLabel(r.sheet);
    if (key && seen.has(key)) dupes.add(r.sheet);
    seen.add(key);
  }

  const notes = {
    sheets: rows.length,
    from_revisions: rows.filter(r => r.from[0] === 'rev').length,
    unmatched: orphans,
    duplicates: [...dupes].sort(),
    undated: (revs || []).filter(r => !parseRevisionDate(r.date)).length,
  };
  return { rows, notes };
}

// ── keeping the model straight when the page list changes ────────────────

/**
 * Shift every page-index reference in the revision model after an insert or
 * a delete.
 *
 * `match` is keyed by main page index and `extra_sheets[].after` is a main
 * page index, so both move when a sheet is added or removed. `sheet_version`
 * is keyed the same way. Left behind, a reorder hands one sheet's chosen
 * version to whichever sheet landed on its number — and with it, the takeoff
 * that counts.
 *
 * `at` is the index inserted at or removed; `delta` is +1 or -1. On a delete
 * the entry FOR that page is dropped, not shifted.
 */
export function shiftRevisionIndices(revs, extraSheets, sheetVersionMap, at, delta) {
  for (const rev of revs || []) {
    const next = {};
    for (const [k, v] of Object.entries(rev.match || {})) {
      const i = parseInt(k, 10);
      if (!Number.isFinite(i)) continue;
      if (delta < 0 && i === at) continue;           // that sheet is gone
      next[String(i >= at ? i + delta : i)] = v;
    }
    rev.match = next;
  }
  for (const s of extraSheets || []) {
    let a = parseInt(s.after, 10);
    if (!Number.isFinite(a)) a = -1;
    // `after` names the sheet a slot follows, so it moves with that sheet.
    // A slot following the deleted sheet follows the one before it instead;
    // the row survives, because the revision page in it is still real.
    if (delta < 0 && a === at) s.after = at - 1;
    else if (a >= at) s.after = a + delta;
  }
  if (sheetVersionMap) {
    const next = {};
    for (const [k, v] of Object.entries(sheetVersionMap)) {
      const i = parseInt(k, 10);
      if (!Number.isFinite(i)) continue;
      if (delta < 0 && i === at) continue;
      next[String(i >= at ? i + delta : i)] = v;
    }
    for (const k of Object.keys(sheetVersionMap)) delete sheetVersionMap[k];
    Object.assign(sheetVersionMap, next);
  }
}
