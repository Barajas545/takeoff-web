// takeoff-lists.js -- several takeoffs in one job (desktop 3.08), as this
// app reads them.
//
// A takeoff is a TAG on the item -- `takeoff_list: "tl-1a2b3c4d"` on every
// shape of an item filed in a takeoff other than Main -- exactly as a
// revision is (rev_id). ABSENT means Main, the job's own takeoff: every item
// of every job made before 3.08, and everything this app writes. The job's
// list of takeoffs is its metadata, written by the desktop only when it has
// more than Main:
//
//     "takeoff_lists":       [{"list_id": "tl-...", "label": "Deck"}]
//     "takeoff_list_active": "tl-..."   (absent: Main)
//     "takeoff_main_label":  "House"    (absent: "Main")
//
// THIS ROUND the web is in Main, always (WEB_TAKEOFF): it shows and totals
// Main's items only, says the job has other takeoffs and that the desktop
// works on them, and keeps every tag and all three keys exactly as the file
// had them. Nothing here writes metadata. The one writer of the tag is
// setTakeoffList, and it is called by exactly two producers: a promoted run
// taking its master's takeoff (project.js promoteChild) and a new item filed
// in the takeoff the web is in (project.js addItem).
//
// Each name mirrors the desktop's, ported line for line from
// pdf_fast_viewer.py 3.08 and held to the desktop's own functions, lifted by
// text, by tests/takeoff-lists-parity.mjs (tests/takeoff-lists-python-
// truth.py):
//
//   * TAKEOFF_LIST_KEY / MAIN_TAKEOFF_LABEL /   the module's constants
//     TAKEOFF_NAME_MAX
//   * takeoffListScoped / takeoffListOf /       takeoff_list_scoped /
//     inTakeoffList / setTakeoffList            takeoff_list_of /
//                                               in_takeoff_list /
//                                               _set_takeoff_list
//   * cleanTakeoffName / freeTakeoffName        clean_takeoff_name /
//                                               free_takeoff_name
//   * takeoffLists / takeoffListLabel /         PDFCacheViewer.takeoff_lists
//     mainTakeoffLabel                          / takeoff_list_label
//   * takeoffNamingOf                           _takeoff_naming_now
//   * otherTakeoffs (its counts)                _takeoff_items
//
// and the web's own: hasOtherTakeoffs (the desktop's has_takeoff_lists reads
// the registry alone, because its open-time heal registers every tag it does
// not know; the web cannot heal -- that would be a write -- so a tag with no
// record is still another takeoff, still hidden and still said, never folded
// into Main), otherTakeoffsWords, leftInTakeoffLabel, and the words the
// web says of the other takeoffs (takeoffsSaid, takeoffsOpenWords,
// otherTakeoffItemWords).
//
// Pure: no DOM, no Project. The metadata and the store are handed in.

import { isTakeoffType } from './revisions.js';
import { classStrip, classClean, pyCasefold, cmpCodePoints } from './classify.js';

/** The item's key that names its takeoff (desktop TAKEOFF_LIST_KEY). */
export const TAKEOFF_LIST_KEY = 'takeoff_list';
/** What Main is called until he renames it (metadata takeoff_main_label). */
export const MAIN_TAKEOFF_LABEL = 'Main';
/** How long a takeoff's name may be, in characters (code points). */
export const TAKEOFF_NAME_MAX = 60;
/** The takeoff the web is in: Main, always, this round. NEVER read from
 *  metadata takeoff_list_active -- a job the desktop left in Deck opens here
 *  in Main, and says so. */
export const WEB_TAKEOFF = '';

const isDict = v => !!v && typeof v === 'object' && !Array.isArray(v);

/** A tag or a takeoff's id, read as the desktop reads every one of them:
 *  Python's `str(x or "").strip()`. That is classStrip, but for the values
 *  str() spells its own way and py-json reads out of a file: NaN is TRUE
 *  in Python ('nan' -- another takeoff, never Main), the infinities are
 *  'inf' / '-inf' and True is 'True'. (A float written 5.0 still reads
 *  '5': JSON.parse cannot tell it from 5.) */
function idStr(v) {
  if (typeof v === 'number' && !Number.isFinite(v)) {
    if (Number.isNaN(v)) return 'nan';
    return v > 0 ? 'inf' : '-inf';
  }
  if (v === true) return 'True';
  return classStrip(v);
}

// Python's isalnum() for a name: a letter or a number somewhere in it.
const HAS_ALNUM = /[\p{L}\p{N}]/u;

/** Does this item belong to ONE takeoff? Takeoff items -- anything with a
 *  quantity, an item on no sheet included -- and Group containers do. A
 *  note, a callout pin, a Measure ruler, a reference distance and a pitch
 *  marker are shared by every takeoff, and never carry the tag.
 *  (desktop takeoff_list_scoped) */
export function takeoffListScoped(m) {
  return isTakeoffType(m) || (isDict(m) && m.type === 'group');
}

/** The takeoff an item is filed in: '' is Main. A shared mark reads '' too:
 *  a tag on one is not read. Read as Python's `str(x or "").strip()` (idStr)
 *  -- never trim(), which strips U+FEFF and keeps \x1c-\x1f and U+0085, and
 *  would put a padded tag in another takeoff than the desktop reads.
 *  (desktop takeoff_list_of) */
export function takeoffListOf(m) {
  return takeoffListScoped(m) ? idStr(m[TAKEOFF_LIST_KEY]) : '';
}

/** Is this item in takeoff `listId` ('' = Main)? A shared mark is in all of
 *  them. (desktop in_takeoff_list) */
export function inTakeoffList(m, listId) {
  // The paint asks this of every item, every frame: an untagged item asked
  // the Main question answers at once. (Only for Main: a shared mark is in
  // every takeoff, so the fast path cannot answer for another id; and NaN,
  // falsy here, is the takeoff 'nan' there -- see idStr.)
  if (!listId && !Number.isNaN(listId) && (!m || m[TAKEOFF_LIST_KEY] === undefined)) return true;
  if (!takeoffListScoped(m)) return true;
  return takeoffListOf(m) === idStr(listId);
}

/** THE ONE WAY the tag is written: SET for any takeoff but Main on an item
 *  that belongs to one, POPPED for Main and for every shared mark.
 *  (desktop _set_takeoff_list) */
export function setTakeoffList(d, listId) {
  if (!isDict(d)) return;
  const lid = idStr(listId);
  if (lid && takeoffListScoped(d)) d[TAKEOFF_LIST_KEY] = lid;
  else delete d[TAKEOFF_LIST_KEY];
}

/** A takeoff's name as a file may hold it, made one he could have typed:
 *  its whitespace read as one space, cut to TAKEOFF_NAME_MAX characters, and
 *  '' when no letter or number is left. (desktop clean_takeoff_name) */
export function cleanTakeoffName(s) {
  const cut = Array.from(classClean(s)).slice(0, TAKEOFF_NAME_MAX).join('');
  const t = classStrip(cut);
  return HAS_ALNUM.test(t) ? t : '';
}

/** `name`, or the first of "name (2)", "name (3)", ... that is none of
 *  `taken` in any capitals, cut so the number still fits. `taken` is read
 *  as the desktop reads it -- stripped and casefolded, its inner spaces as
 *  they are. (desktop free_takeoff_name) */
export function freeTakeoffName(s, taken = []) {
  const name = cleanTakeoffName(s) || 'Takeoff';
  const low = new Set([...(taken || [])].map(t => pyCasefold(classStrip(t))));
  if (!low.has(pyCasefold(name))) return name;
  const chars = Array.from(name);
  for (let n = 2; ; n += 1) {
    const tail = ` (${n})`;
    // A clean name holds no whitespace but single U+0020s, so Python's
    // rstrip() of the cut is this.
    const got = chars.slice(0, Math.max(0, TAKEOFF_NAME_MAX - tail.length)).join('')
      .replace(/ +$/, '') + tail;
    if (!low.has(pyCasefold(got))) return got;
  }
}

/** Main's name: 'Main' until he renames it. (desktop takeoff_list_label('')) */
export function mainTakeoffLabel(md) {
  return cleanTakeoffName(isDict(md) ? md.takeoff_main_label : undefined) || MAIN_TAKEOFF_LABEL;
}

/**
 * The job's takeoffs other than Main, in the order he sees them:
 * [{list_id, label, ...}] -- a normalised COPY of metadata takeoff_lists,
 * which is never written. A record with no id, or one repeating an id, is
 * no takeoff and is left out; any other field on a record is kept. Every
 * label is one a takeoff can have: cleaned, and no other's (Main's
 * included) in any capitals -- a second "Deck" reads "Deck (2)", a record
 * with no usable name "Takeoff N". A registry written as a mapping
 * {id: name} or {id: {label}} is read too. (desktop takeoff_lists)
 *
 * One way this cannot follow the desktop: a mapping whose ids look like
 * integers ("5") is read by JavaScript in number order, not the file's.
 */
export function takeoffLists(md) {
  const out = [];
  const seen = new Set();
  let recs = isDict(md) ? md.takeoff_lists : undefined;
  if (isDict(recs)) {
    recs = Object.entries(recs).map(([k, v]) => (isDict(v) ? { ...v, list_id: k }
      : { list_id: k, label: v }));
  }
  if (!Array.isArray(recs)) return out;
  const taken = new Set([pyCasefold(mainTakeoffLabel(md))]);
  for (const r of recs) {
    if (!isDict(r)) continue;
    const lid = idStr(r.list_id);
    if (!lid || seen.has(lid)) continue;
    seen.add(lid);
    const rec = { ...r };
    rec.list_id = lid;
    const nm = cleanTakeoffName(r.label) || `Takeoff ${out.length + 2}`;
    rec.label = freeTakeoffName(nm, taken);
    taken.add(pyCasefold(rec.label));
    out.push(rec);
  }
  return out;
}

/** A takeoff's name: Main's for '', the registry's for one it has, '' for
 *  an id the job has no record of. (desktop takeoff_list_label) */
export function takeoffListLabel(md, listId) {
  const lid = idStr(listId);
  if (!lid) return mainTakeoffLabel(md);
  for (const r of takeoffLists(md)) if (r.list_id === lid) return r.label;
  return '';
}

/** Every dict of the store ({page key: [items]}), once. */
function* itemsOf(store) {
  if (!isDict(store)) return;
  for (const lst of Object.values(store)) {
    if (!Array.isArray(lst)) continue;
    for (const m of lst) yield m;
  }
}

/** The tags the items carry that the registry has no record of (and that
 *  are not `except`), in Python's order of strings. */
function unregisteredIds(md, store, except = null) {
  const known = new Set(takeoffLists(md).map(r => r.list_id));
  const ids = new Set();
  for (const m of itemsOf(store)) {
    const lid = takeoffListOf(m);
    if (lid && !known.has(lid) && lid !== except) ids.add(lid);
  }
  return [...ids].sort(cmpCodePoints);
}

/** Does the job have a takeoff besides Main? A registry entry, or a tag on
 *  any item that belongs to one: the web cannot heal an unknown tag into
 *  the registry, so the item is still another takeoff's. (The desktop's
 *  has_takeoff_lists, which reads the registry its heal has filled.) */
export function hasOtherTakeoffs(md, store) {
  if (takeoffLists(md).length) return true;
  for (const m of itemsOf(store)) if (takeoffListOf(m) !== '') return true;
  return false;
}

/** What a money sentence needs to name a takeoff (counting.js
 *  setTakeoffNaming): [the takeoff he is in, Map(id -> name)], Main's ''
 *  first, then the registry in order -- or null in a job with only Main,
 *  where every sentence is 3.07's to the letter. A Map, not an object: an
 *  id that looks like an integer would sort ahead of Main as a key.
 *  (desktop _takeoff_naming_now) */
export function takeoffNamingOf(md, store, active = WEB_TAKEOFF) {
  if (!hasOtherTakeoffs(md, store)) return null;
  const names = new Map([['', mainTakeoffLabel(md)]]);
  for (const r of takeoffLists(md)) names.set(r.list_id, r.label);
  return [idStr(active), names];
}

/** How many items one takeoff has: each item once, by its main shape (a
 *  Group container is not an item). (desktop _takeoff_items) */
function itemCount(store, id) {
  let n = 0;
  for (const m of itemsOf(store)) {
    if (isTakeoffType(m) && !m.group_child && takeoffListOf(m) === id) n += 1;
  }
  return n;
}

/**
 * Every takeoff but `active`: [{id, label, known, n}] -- Main first when he
 * is not in it, then the registry in order (an empty one with n = 0), then
 * each id the items carry that the registry has no record of, in Python's
 * string order, with label '' and known false.
 */
export function otherTakeoffs(md, store, active = WEB_TAKEOFF) {
  const act = idStr(active);
  const out = [];
  if (act) out.push({ id: '', label: mainTakeoffLabel(md), known: true, n: itemCount(store, '') });
  for (const r of takeoffLists(md)) {
    if (r.list_id === act) continue;
    out.push({ id: r.list_id, label: r.label, known: true, n: itemCount(store, r.list_id) });
  }
  for (const id of unregisteredIds(md, store, act)) {
    out.push({ id, label: '', known: false, n: itemCount(store, id) });
  }
  return out;
}

/** "Deck (12 items)", "Deck (12 items) and Patio (1 item)", "Deck (nothing
 *  in it yet)"; a takeoff the registry does not know reads "a takeoff this
 *  job has no record of (2 items)". '' for none. */
export function otherTakeoffsWords(others) {
  const words = (others || []).map(o => {
    const what = o.n ? `${o.n} item${o.n === 1 ? '' : 's'}` : 'nothing in it yet';
    const who = o.known && o.label ? o.label : 'a takeoff this job has no record of';
    return `${who} (${what})`;
  });
  if (words.length <= 1) return words[0] || '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** The name of the takeoff the desktop left the job in, when it is one the
 *  job has a record of and not Main; '' otherwise (the desktop opens a job
 *  left in an unknown takeoff in Main). READ ONLY, and the one reader of
 *  takeoff_list_active: it is one clause of the sentence said on open. */
export function leftInTakeoffLabel(md) {
  const lid = idStr(isDict(md) ? md.takeoff_list_active : undefined);
  if (!lid) return '';
  for (const r of takeoffLists(md)) if (r.list_id === lid) return r.label;
  return '';
}

/**
 * What the web says of a job's other takeoffs: null in a job with Main
 * alone -- where nothing new is said anywhere -- else {label, others,
 * words}: the name of the takeoff the web is in, every other takeoff
 * (otherTakeoffs), and how they are said (otherTakeoffsWords). The Items
 * list's note, empty state, foot and title, the sentence on open and the
 * Report Center's note all read it. (The web's own: the desktop says which
 * takeoff he is in with its TAKEOFF combo, which the web does not have.)
 */
export function takeoffsSaid(md, store, active = WEB_TAKEOFF) {
  if (!hasOtherTakeoffs(md, store)) return null;
  const others = otherTakeoffs(md, store, active);
  return { label: takeoffListLabel(md, active), others, words: otherTakeoffsWords(others) };
}

/** What is said when a shape painted here is part of an item filed in
 *  another takeoff -- a split item (spec G5): a run with no tag, its main
 *  shape Deck's, as a 3.07 Add Shape on a 3.08 job leaves one. The item is
 *  that takeoff's, not listed here, so its form is not opened here either:
 *  the web edits the takeoff it is in only. `name` is the item's as the
 *  app says it (counting.js deleteName). */
export function otherTakeoffItemWords(md, m, name) {
  const label = takeoffListLabel(md, takeoffListOf(m));
  const where = label ? `the takeoff ${label}` : 'a takeoff this job has no record of';
  return `“${name}” is an item of ${where}, worked on in the desktop app — its properties are not edited here.`;
}

/** The sentence said once as a job of several takeoffs opens, '' for a job
 *  with Main alone: which takeoff is here, that the others are the desktop
 *  app's, and -- when the desktop left the job in another one -- that the
 *  desktop will open it there again. Says; writes nothing. */
export function takeoffsOpenWords(md, store) {
  const t = takeoffsSaid(md, store);
  if (!t) return '';
  const left = leftInTakeoffLabel(md);
  return `This job also has ${t.words}, worked on in the desktop app. Here you see, total and report `
    + `${t.label} only; what you add goes in ${t.label}.`
    + (left ? ` It was left in ${left} on the desktop, which will open it there again.` : '');
}
