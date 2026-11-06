// classify.js -- floor levels, categories and sub-categories, as the desktop
// names, sorts and offers them.
//
// A floor level, a category and a sub-category are nothing but strings on
// the items (and on the material lines that carry their own). A heading in
// the Items list is not a thing of its own either: it is the string its rows
// share. This module holds the few rules every place that names one shares,
// ported line for line from pdf_fast_viewer.py 3.07 and held to the lifted
// desktop functions by tests/heading-menu.mjs (tests/rename-python-truth.py):
//
//   * classClean / classNorm / classSortKey     _class_clean / _class_norm /
//                                               _class_sort_key (L313-328)
//   * projectValues                             GLPageWidget.project_values
//   * classChoicesFrom                          _fill_class_combo (L360-374)
//   * headerAct / headerTip                     TakeoffItemsPanel._header_act
//                                               / _header_tip (L51127-51162)
//   * rowsUnder                                 TakeoffItemsPanel._rows_under
//
// Pure: no DOM, no Project. The store is handed in.

/** The three fields a heading can be (GLPageWidget.CLASS_FIELDS). */
export const CLASS_FIELDS = Object.freeze(['floor_level', 'category', 'sub_category']);

// Python's str.split() and str.strip() take these as whitespace. JS's \s
// also takes U+FEFF and leaves out \x1c-\x1f, so a name with either in it
// would clean differently -- spelled out instead.
const PY_WS_CHARS = ' \\t\\n\\r\\x0b\\x0c\\x1c-\\x1f\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const PY_WS = new RegExp(`[${PY_WS_CHARS}]+`);
const PY_EDGE_WS = new RegExp(`^[${PY_WS_CHARS}]+|[${PY_WS_CHARS}]+$`, 'g');

/** Python's `str(x or "")`: 0, false, null and '' are all blank. */
const pyStr = v => (v ? String(v) : '');
/** Python's `str.strip()`. */
const pyStrip = s => s.replace(PY_EDGE_WS, '');
const isDict = v => !!v && typeof v === 'object' && !Array.isArray(v);

/** A name as it is kept: no leading or trailing spaces, one space where he
 *  typed two. */
export function classClean(s) {
  return pyStr(s).split(PY_WS).filter(Boolean).join(' ');
}

/** A name as it is COMPARED: "Level 2", "level 2" and "Level  2 " are one
 *  floor to him. Python's casefold(), which for every name a list will hold
 *  is toLowerCase() -- except the German sharp s, folded here as Python does. */
export function classNorm(s) {
  return classClean(s).toLowerCase().replace(/ß/g, 'ss');
}

/** Level 2 before Level 10: the name split into runs of digits (compared as
 *  numbers -- BigInt, as Python's int has no limit) and everything else. */
export function classSortKey(s) {
  return classNorm(s).split(/(\d+)/).filter(Boolean)
    .map(p => (/^\d+$/.test(p) ? [0, BigInt(p), ''] : [1, 0n, p]));
}

/** Compare two names by classSortKey, as Python compares the key lists. */
export function cmpSortKey(a, b) {
  const ka = classSortKey(a);
  const kb = classSortKey(b);
  for (let i = 0; i < Math.min(ka.length, kb.length); i++) {
    for (let j = 0; j < 3; j++) {
      if (ka[i][j] < kb[i][j]) return -1;
      if (ka[i][j] > kb[i][j]) return 1;
    }
  }
  return ka.length - kb.length;
}

/** GLPageWidget._class_val: the field as a stripped string. */
const classVal = (d, field) => pyStrip(pyStr((d || {})[field]));

/**
 * This job's own names for `field`, each once, Level 2 before Level 10 --
 * what the item forms offer first. With `category`, only the sub-categories
 * filed under that category. A name that is only on a material line counts:
 * the desktop's does too.
 *
 * Ties (a name and its look-alike, 'Level 2' and 'level 2') keep the order
 * they were first met in, walking the store in its own order -- for the web
 * store, the sheets in order and then the items on no sheet.
 */
export function projectValues(store, field, category = null) {
  if (!CLASS_FIELDS.includes(field)) return [];
  const want = category === null || category === undefined
    ? null : pyStrip(pyStr(category));
  const seen = new Set();
  for (const lst of Object.values(store || {})) {
    for (const m of Array.isArray(lst) ? lst : []) {
      if (!isDict(m)) continue;
      const cat = classVal(m, 'category');
      if (want === null || cat === want) {
        const v = classVal(m, field);
        if (v) seen.add(v);
      }
      for (const ai of Array.isArray(m.associated_items) ? m.associated_items : []) {
        if (!isDict(ai)) continue;
        if (want !== null && (classVal(ai, 'category') || cat) !== want) continue;
        const v = classVal(ai, field);
        if (v) seen.add(v);
      }
    }
  }
  // Array.prototype.sort is stable, as Python's sorted() is.
  return [...seen].sort(cmpSortKey);
}

/**
 * A Floor or Trade box's suggestions: THIS job's names, then the stock list
 * without the look-alikes of names the job already has -- so a name he
 * renamed to is what he picks next time, and the old one does not creep
 * back in from the top of the presets. The desktop's _fill_class_combo,
 * minus its leading blank and its separator, which a datalist cannot show.
 */
export function classChoicesFrom(store, field, presets) {
  const own = projectValues(store, field);
  const have = new Set(own.map(classNorm));
  const rest = (presets || []).filter(p => p && !have.has(classNorm(p)));
  return [...own, ...rest];
}

// ── a heading's menu and tooltip ─────────────────────────────────────────

/** Which field each kind of heading is (TakeoffItemsPanel._HDR_FIELD). */
export const HDR_FIELD = Object.freeze({ floor: 'floor_level', cat: 'category', sub: 'sub_category' });
/** How the menu and the tooltip say that field (_HDR_WHAT). */
export const HDR_WHAT = Object.freeze({ floor_level: 'floor level', category: 'category',
  sub_category: 'sub-category' });
/** The section of the items on no sheet (the desktop's SHEET chip): never a
 *  floor's key (TakeoffItemsPanel._SOLO). The web lists no such section yet. */
export const SOLO = '\x00solo';

const ownProp = (obj, key) => (Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined);
const whatOf = type => ownProp(HDR_WHAT, ownProp(HDR_FIELD, type) || '') || '';

/**
 * What a heading's menu offers besides Collapse all and Expand all: 'rename'
 * it, 'assign' a floor level or a category to the items under a blank one,
 * 'group' (the Group's own form), or '' for the items on no sheet. The menu
 * and the heading's tooltip both ask here, so the tooltip cannot offer what
 * the menu does not have. (A Group's section key is '\x00g:' + its id.)
 */
export function headerAct(meta) {
  const t = meta.type;
  const fl = pyStr(meta.fl);
  const gid = fl.startsWith('\x00g:') ? fl.slice(3) : '';
  if (t === 'floor' && fl === SOLO) return '';
  if (t === 'floor' && gid) return 'group';
  if (t === 'floor') return fl ? 'rename' : 'assign';
  if (t === 'cat') return meta.cat ? 'rename' : 'assign';
  return 'rename';
}

/**
 * A heading's tooltip: what a click, a drag and a right-click do on THIS
 * heading, and nothing they do not -- worked out from the SAME `act` as its
 * menu. `canDrag` false until the web can reorder; `touch` says it in a
 * finger's words (the user's choice: a tap, a hold), the same sentence.
 */
export function headerTip(meta, { canDrag = true, act = headerAct(meta), touch = false } = {}) {
  const parts = [touch ? 'Tap to collapse / expand' : 'Click to collapse / expand'];
  // The items on no sheet are not a floor to move (_valid_drop).
  if (canDrag && !(meta.type === 'floor' && meta.fl === SOLO)) parts.push('Drag to reorder');
  const how = touch ? 'Hold' : 'Right-click';
  const what = whatOf(meta.type);
  const right = act === 'rename' ? `${how} to rename`
    : act === 'group' ? `${how} to rename the group`
      : act === 'assign' ? `${how} to set a ${what}`
        : '';
  if (right) parts.push(right);
  return parts.join('  •  ');
}

/**
 * The rows the list showed under a heading when it was built -- collapsed
 * ones included, ones the filters hide not. `tree` is the Items list's own:
 * Map floor -> Map category -> Map sub-category -> [[page, item], ...].
 */
export function rowsUnder(tree, meta) {
  const fl = meta.fl;
  const cat = meta.cat;
  if (!tree || !tree.has(fl)) return [];
  const cats = tree.get(fl);
  const items = subs => [...subs.values()].flatMap(list => list.map(([, m]) => m));
  if (meta.type === 'floor') return [...cats.values()].flatMap(items);
  if (!cats.has(cat)) return [];
  if (meta.type === 'cat') return items(cats.get(cat));
  return (cats.get(cat).get(meta.sub) || []).map(([, m]) => m);
}
