// project.js — the whole document, and every edit that can be undone.
//
// STORAGE MODEL (identical to the desktop app, so files round-trip):
//
//   measurements  { pageKey: [item, …] }   takeoff work — what gets estimated
//   annotations   { pageKey: [annot, …] }  markup — text, images, CAD entities
//
// A pageKey is a page index, or STANDALONE_PAGE for work that belongs to the
// job rather than to any one sheet. Page inserts, deletes and reorders shift
// the numeric keys and must carry the standalone bucket through untouched.
//
// THE TAKEOFF TREE IS NOT STORED. Floor / category / sub-category grouping is
// derived at display time from three string fields on each item —
// floor_level, category, sub_category — ordered by sort_order. There is no
// separate tree structure to keep in sync, and adding one would be a bug.
//
// UNDO is a snapshot of the two stores plus the page order. Items are small
// and plain, structuredClone is fast, and a snapshot cannot go stale the way
// an inverse-operation log does when two features touch the same item.

import {
  STANDALONE_PAGE, shiftPageKey, comparePageKeys, intKeyed,
} from './takeoff-file.js';
import { DEFAULT_DPI, DEFAULT_PPF, scaleLabelFor } from './units.js';
import { polygonArea, pathLength } from './geom.js';
import { shapeOwn } from './measure.js';

export { STANDALONE_PAGE };

const UNDO_DEPTH = 60;

/** Item types the takeoff panel and the estimate never include. */
export const NON_TAKEOFF_TYPES = new Set(['distance', 'textnote', 'page_ref', 'pitch']);

/** Every item type the canvas can hold. */
export const ITEM_TYPES = [
  'distance', 'area', 'slope_area', 'pitch', 'polyline', 'count',
  'window', 'door', 'linear_count', 'grid', 'tile', 'page_ref', 'textnote',
];

// IDENTITY. The desktop format has NO id on a measurement item — Python uses
// object identity and the file carries nothing. So this build assigns `_uid` at
// load, uses it everywhere in the UI, and STRIPS IT ON SAVE.
//
// Persisting an invented id would be worse than useless: the desktop app's
// copy/paste and Add Shape both deep-copy an item, which would put two items
// carrying the same id back into a file this app then opens. Selection,
// deletion and the properties dialog would all address the wrong one.
let idCounter = 0;
/** A stable runtime id. Never reused within a session, never written to disk. */
export function newId(prefix = 'i') {
  idCounter += 1;
  const rand = Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}${rand}`;
}

// Keys this app adds at load and must never write back.
//
// `ppf` in particular. It is tempting to persist the recovered scale, but the
// desktop app's Add Shape and paste both deep-copy an item — so a copy made
// there would carry a ppf from the sheet it came from while its value was
// computed on the sheet it landed on, and the two would disagree with nothing
// to say which is right. Recovering it fresh on every load from the item's own
// value and geometry is always self-consistent, and self-heals.
const RUNTIME_KEYS = ['_uid', 'ppf', 'ppf_recovered', 'scale_label', 'self_intersects'];

/** Deep copy of a store with every runtime-only key removed. */
function stripRuntimeKeys(store) {
  const out = {};
  for (const [k, list] of Object.entries(store)) {
    if (!Array.isArray(list) || !list.length) continue;
    out[String(k)] = list.map(item => {
      const copy = { ...item };
      for (const key of RUNTIME_KEYS) delete copy[key];
      return copy;
    });
  }
  return out;
}

export class Project extends EventTarget {
  constructor() {
    super();
    this.reset();
  }

  reset() {
    this.metadata = {
      project_name: '',
      internal_id_number: '',
      client_name: '',
      project_address: '',
      estimator_name: '',
      bid_date: '',
      project_type: '',
      project_status: '',
      project_description: '',
      project_notes: '',
      project_created: nowStamp(),
      project_modified: '',
      // The render resolution. The on-disk key is "dpi"; "import_dpi" is the
      // desktop app's SETTINGS key and never appears in a project file.
      dpi: DEFAULT_DPI,
      // Sheet identity, in the three shapes the desktop app actually uses.
      // page_labels is a LIST of auto-detected numbers; the other two are
      // DICTS keyed by a stringified page index. Writing either of them as a
      // list produces a file the desktop app cannot open.
      page_labels: [],
      page_labels_custom: {},
      page_names: {},
      page_scales: {},
      page_groups: {},
      cad_layers: defaultLayers(),
      cad_layer_current: '0',
      pixels_per_foot: DEFAULT_PPF,
      last_viewed_page: 0,
      revisions: [],
    };
    this.measurements = {};       // pageKey -> item[]
    this.annotations = {};        // pageKey -> annot[]
    this.pageCount = 0;

    this._undo = [];
    this._redo = [];
    this._dirty = false;
    this._txDepth = 0;
    this._txSnapshot = null;
    this.filePath = '';           // display name of the opened file
    this.fileHandle = null;       // FileSystemFileHandle, when we have one
    this._isolation = null;       // transient "show only these" — never saved
  }

  // ── loading ──────────────────────────────────────────────────────────

  /** Adopt an opened project file. */
  loadFrom({ metadata, annotations, measurements, pageCount }) {
    this.reset();
    this.pageCount = pageCount;
    // Everything the writer folds in is stripped back out here, so metadata
    // stays the project's own fields and nothing else.
    const meta = { ...metadata };
    delete meta.annotations;
    delete meta.measurements;
    delete meta._rev_images;
    this.metadata = {
      ...this.metadata,
      ...meta,
      page_labels: Array.isArray(meta.page_labels) ? meta.page_labels.slice() : [],
      page_labels_custom: indexDict(meta.page_labels_custom),
      page_names: indexDict(meta.page_names),
      page_scales: normaliseScales(meta.page_scales),
      cad_layers: Array.isArray(meta.cad_layers) && meta.cad_layers.length
        ? meta.cad_layers : defaultLayers(),
    };
    this.measurements = normaliseStore(measurements);
    this.annotations = normaliseStore(annotations);
    this._backfillItems();
    this._dirty = false;
    this.emit('loaded');
  }

  /**
   * Repair what a desktop-written file does not carry, and RECOVER the scale
   * each item was actually drawn at.
   *
   * This is the most important thing this class does, and it is not obvious.
   *
   * The desktop app keeps ONE scale for the whole project. An estimator
   * calibrates a sheet, draws, calibrates again for a detail, draws more — and
   * every item's stored `value` was computed at whatever the scale was AT THAT
   * MOMENT. Nothing records which. Measured against the live library, 11 of 76
   * checked items disagree with what the project's current scale would give:
   * one 1,381 sq ft area re-derives as 378 sq ft, a 73% error, straight into a
   * bid.
   *
   * So the ppf is not guessed from the page. It is recovered from the item
   * itself: the geometry is in pixels and the value is in feet, so their ratio
   * IS the scale that item was drawn at, exactly. Only where that cannot be
   * inverted — a count, a pin, a zero value — does the page's scale stand in.
   *
   * `value` is never recomputed here. What the estimator measured is what the
   * file says, and this app's job is to keep it that way.
   */
  _backfillItems() {
    for (const [key, list] of Object.entries(this.measurements)) {
      const pagePpf = this.pagePpf(Number(key));
      for (const it of list) {
        if (!it._uid) it._uid = newId('m');
        if (it.visible === undefined) it.visible = true;
        if (!(Number(it.ppf) > 0)) {
          const recovered = recoverPpf(it);
          it.ppf = recovered ?? pagePpf;
          it.ppf_recovered = recovered != null;
          if (!it.scale) it.scale_label = scaleLabelFor(it.ppf, this.dpi);
        }
      }
    }
    for (const list of Object.values(this.annotations)) {
      for (const a of list) if (!a._uid) a._uid = newId('a');
    }
  }

  /** Items whose scale had to be inferred rather than recovered. */
  itemsWithAssumedScale() {
    const out = [];
    for (const [key, it] of this.allItems()) {
      if (it.ppf_recovered === false && MEASURED_TYPES.has(it.type)) out.push([key, it]);
    }
    return out;
  }

  get dpi() {
    // "dpi" is the key in the file. Accept the settings spelling as a fallback
    // so a project this app wrote before the shapes were pinned still opens.
    const d = Number(this.metadata.dpi ?? this.metadata.import_dpi);
    return Number.isFinite(d) && d > 0 ? d : DEFAULT_DPI;
  }

  set dpi(v) { this.metadata.dpi = v; }

  // ── the metadata block a save writes ────────────────────────────────

  buildSaveMetadata({ baselineVisibility = null } = {}) {
    const meas = baselineVisibility || this.measurements;
    const meta = { ...this.metadata };
    meta.project_modified = nowStamp();
    // Runtime keys never reach the file. See the note on identity above.
    meta.annotations = stripRuntimeKeys(this.annotations);
    meta.measurements = stripRuntimeKeys(meas);
    return meta;
  }

  // ── page scale ──────────────────────────────────────────────────────
  //
  // TWO SCALES, and the difference is the one thing to get right here.
  //
  // The desktop app keeps ONE scale for the whole project, in
  // metadata.pixels_per_foot. That is the field this app must read and must
  // keep writing, or a project edited here opens on the desktop measuring
  // everything at the wrong scale.
  //
  // But a real drawing set is not drawn at one scale. Details are 1/2", plans
  // are 1/4", site plans are 1"=20'. So this build ALSO keeps page_scales,
  // { pageKey: ppf }, as an additive key the desktop app does not read and
  // therefore cannot be broken by. A sheet with no entry falls back to the
  // document scale, which is exactly what the desktop app would have used.
  //
  // What makes this safe in both directions is that the stored `value` on
  // every item is authoritative and is never recomputed on load. A project
  // round-tripping through the desktop app keeps its numbers even where that
  // app has no idea a sheet had its own scale.

  get documentPpf() {
    const v = Number(this.metadata.pixels_per_foot);
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_PPF;
  }

  set documentPpf(ppf) {
    this.metadata.pixels_per_foot = ppf;
  }

  pagePpf(pageKey) {
    const scales = this.metadata.page_scales || {};
    const v = Number(scales[String(pageKey)]);
    if (Number.isFinite(v) && v > 0) return v;
    return this.documentPpf;
  }

  pageScaleLabel(pageKey) {
    return scaleLabelFor(this.pagePpf(pageKey), this.dpi);
  }

  /**
   * Restate one sheet's scale.
   *
   * Items already drawn KEEP their own stamped ppf — this only changes what
   * the next measurement will be drawn at. Re-valuing existing work is a
   * separate, explicit act; see restampPage.
   */
  setPageScale(pageKey, ppf) {
    this.transact('Set sheet scale', () => {
      this.metadata.page_scales = { ...(this.metadata.page_scales || {}) };
      this.metadata.page_scales[String(pageKey)] = ppf;
      // Keep the document scale following the sheet the user is working on.
      // The desktop app has only this one field, so leaving it behind would
      // make everything drawn there afterwards come out at the old scale.
      this.metadata.pixels_per_foot = ppf;
    });
    this.emit('scale-changed', { pageKey, ppf });
  }

  /**
   * Re-value every item on a sheet to a new scale. Destructive and explicit:
   * the caller must have confirmed it with the user, because the quantities
   * in a bid change underneath them.
   */
  restampPage(pageKey, ppf) {
    this.transact('Restate sheet scale', () => {
      this.metadata.page_scales = { ...(this.metadata.page_scales || {}) };
      this.metadata.page_scales[String(pageKey)] = ppf;
      this.metadata.pixels_per_foot = ppf;
      const label = scaleLabelFor(ppf, this.dpi);
      for (const it of this.itemsOn(pageKey)) {
        it.ppf = ppf;
        it.scale_label = label;
      }
    });
    this.emit('scale-changed', { pageKey, ppf, restamped: true });
  }

  // ── item access ─────────────────────────────────────────────────────

  itemsOn(pageKey) {
    return this.measurements[pageKey] || (this.measurements[pageKey] = []);
  }

  annotationsOn(pageKey) {
    return this.annotations[pageKey] || (this.annotations[pageKey] = []);
  }

  /** Every item in the job, as [pageKey, item] pairs, in page order. */
  *allItems() {
    for (const key of Object.keys(this.measurements).sort(comparePageKeys)) {
      for (const it of this.measurements[key]) yield [Number(key), it];
    }
  }

  /** Items that count toward the estimate: no rulers, notes or child shapes. */
  *takeoffItems() {
    for (const [key, it] of this.allItems()) {
      if (NON_TAKEOFF_TYPES.has(it.type)) continue;
      if (it.group_child) continue;
      yield [key, it];
    }
  }

  findItem(id) {
    for (const [key, it] of this.allItems()) if (it._uid === id) return { pageKey: key, item: it };
    return null;
  }

  /**
   * Add a markup annotation to a page.
   *
   * Annotations are NOT takeoff: no quantity, no unit, no scale stamp, and no
   * place in any report. They carry only what the desktop writes.
   */
  addAnnotation(pageKey, annot, { label = 'Markup' } = {}) {
    let created = null;
    this.transact(label, () => {
      created = { visible: true, ...annot, _uid: newId('a') };
      this.annotationsOn(pageKey).push(created);
    });
    this.emit('annotations-changed', { pageKey });
    return created;
  }

  /** Remove annotations by runtime id. */
  removeAnnotations(ids, { label = 'Erase' } = {}) {
    const set = new Set(ids);
    if (!set.size) return 0;
    let n = 0;
    this.transact(label, () => {
      for (const key of Object.keys(this.annotations)) {
        const before = this.annotations[key].length;
        this.annotations[key] = this.annotations[key].filter(a => !set.has(a._uid));
        n += before - this.annotations[key].length;
      }
    });
    this.emit('annotations-changed', {});
    return n;
  }

  /** Add an item to a page, stamping the fields every reader relies on. */
  addItem(pageKey, item, { label = 'Add item' } = {}) {
    let created = null;
    this.transact(label, () => {
      const list = this.itemsOn(pageKey);
      const ppf = Number(item.ppf) > 0 ? Number(item.ppf) : this.pagePpf(pageKey);
      created = {
        _uid: newId('m'),
        visible: true,
        sort_order: this._nextSortOrder(),
        ppf,
        scale_label: scaleLabelFor(ppf, this.dpi),
        ...item,
      };
      // A caller that passed ppf keeps it; one that did not gets the page's.
      created.ppf = ppf;
      created._uid = created._uid || newId('m');
      list.push(created);
    });
    this.emit('items-changed', { pageKey });
    return created;
  }

  updateItem(id, patch, { label = 'Edit item' } = {}) {
    const found = this.findItem(id);
    if (!found) return null;
    this.transact(label, () => Object.assign(found.item, patch));
    this.emit('items-changed', { pageKey: found.pageKey });
    return found.item;
  }

  removeItems(ids, { label = 'Delete' } = {}) {
    const set = new Set(ids);
    if (!set.size) return 0;
    let n = 0;
    this.transact(label, () => {
      for (const key of Object.keys(this.measurements)) {
        const before = this.measurements[key].length;
        // A group's children go with it — they exist only to draw its shape.
        // A group's children go with its master: they exist only to draw it.
        const masters = new Set(
          this.measurements[key].filter(it => set.has(it._uid) && it.group_id)
            .map(it => it.group_id)
        );
        this.measurements[key] = this.measurements[key].filter(
          it => !set.has(it._uid) && !(it.group_child && masters.has(it.group_id))
        );
        n += before - this.measurements[key].length;
      }
    });
    this.emit('items-changed', {});
    return n;
  }

  _nextSortOrder() {
    let max = 0;
    for (const [, it] of this.allItems()) max = Math.max(max, it.sort_order || 0);
    return max + 100;
  }

  // ── visibility and isolation ────────────────────────────────────────
  //
  // Isolation ("show only these") is a way of LOOKING, never a property of the
  // work. It must never reach the file: a save taken while isolated would
  // otherwise persist every other item as hidden, and the estimator would
  // reopen the job to a sheet that looks empty.

  /** Hide everything except these item ids, without touching stored state. */
  isolate(ids) {
    this._isolation = ids && ids.length ? new Set(ids) : null;
    this.emit('visibility-changed', {});
  }

  clearIsolation() {
    this._isolation = null;
    this.emit('visibility-changed', {});
  }

  get isolating() { return !!this._isolation; }

  /** What the canvas should draw right now. */
  isVisible(item) {
    if (this._isolation) return this._isolation.has(item._uid);
    return item.visible !== false;
  }

  /** The stores as they must be written — real visibility, never isolation. */
  measurementsWithBaselineVisibility() {
    return this.measurements;   // isolation was never written into the items
  }

  setVisible(ids, visible) {
    const set = new Set(ids);
    this.transact(visible ? 'Show items' : 'Hide items', () => {
      for (const [, it] of this.allItems()) if (set.has(it._uid)) it.visible = !!visible;
    });
    this.emit('visibility-changed', {});
  }

  // ── page structure ──────────────────────────────────────────────────

  /**
   * The sheet number as the app shows it: a user override first, then what
   * was detected off the drawing, then a plain page number.
   * This is the one place that order lives.
   */
  pageLabel(index) {
    const custom = this.metadata.page_labels_custom?.[String(index)];
    if (custom) return String(custom);
    const detected = this.metadata.page_labels?.[index];
    if (detected) return String(detected);
    return `Pag: ${index + 1}`;
  }

  /** The detected label alone, with no override applied. */
  detectedLabel(index) {
    return String(this.metadata.page_labels?.[index] || '');
  }

  /** The user's title for the sheet. */
  pageName(index) {
    return String(this.metadata.page_names?.[String(index)] || '');
  }

  /**
   * Rename a sheet. A label equal to what was detected clears the override
   * rather than storing a duplicate, so "reset to what the drawing says" is
   * just typing it back.
   */
  setPageLabel(index, label) {
    this.transact('Rename sheet', () => {
      const custom = { ...(this.metadata.page_labels_custom || {}) };
      const text = String(label || '').trim();
      if (!text || text === this.detectedLabel(index)) delete custom[String(index)];
      else custom[String(index)] = text;
      this.metadata.page_labels_custom = custom;
    });
    this.emit('pages-changed', {});
  }

  setPageName(index, name) {
    this.transact('Rename sheet', () => {
      const names = { ...(this.metadata.page_names || {}) };
      const text = String(name || '').trim();
      if (!text) delete names[String(index)];
      else names[String(index)] = text;
      this.metadata.page_names = names;
    });
    this.emit('pages-changed', {});
  }

  /**
   * Record that pages were inserted at `at`. Everything filed under a later
   * page number moves along with it; the standalone bucket does not move.
   */
  /**
   * Move every callout's target with the sheets.
   *
   * A page_ref item stores `ref_page`, the index of the sheet it points at.
   * That is a reference INTO the set, not a property of the page it sits on,
   * so the per-page bucket shuffling above does not touch it. Insert one
   * sheet in the middle and every callout after it points one drawing too
   * high; the preview then shows the wrong detail with total confidence.
   *
   * `removedIndex`, when given, is a sheet that no longer exists: a callout
   * that pointed AT it loses its target rather than silently sliding onto
   * whatever took its place.
   */
  _shiftCalloutTargets(at, delta, removedIndex = null) {
    for (const list of Object.values(this.measurements)) {
      for (const m of list) {
        if (m.type !== 'page_ref' || !Number.isInteger(m.ref_page)) continue;
        if (removedIndex != null && m.ref_page === removedIndex) {
          delete m.ref_page;                 // the sheet it named is gone
          continue;
        }
        if (m.ref_page >= at) m.ref_page += delta;
      }
    }
  }

  notePagesInserted(at, count) {
    this._shiftStores(at - 1, count);
    spliceArray(this.metadata.page_labels, at, count, '');
    // Every index-keyed dict has to move with the pages, or a sheet inserted
    // in the middle silently takes the name and scale of the one after it.
    for (const key of INDEX_DICT_KEYS) {
      this.metadata[key] = shiftIndexDict(this.metadata[key], at - 1, count);
    }
    this._shiftCalloutTargets(at, count);
    this.pageCount += count;
    this.clearHistory('a sheet was added');
    this.markDirty();
    this.emit('pages-changed', {});
  }

  /** Record that one page was removed. Its items go with it. */
  notePageRemoved(index) {
    delete this.measurements[index];
    delete this.annotations[index];
    this._shiftStores(index, -1);
    this._shiftCalloutTargets(index, -1, index);
    (this.metadata.page_labels || []).splice(index, 1);
    for (const key of INDEX_DICT_KEYS) {
      const d = { ...(this.metadata[key] || {}) };
      delete d[String(index)];
      this.metadata[key] = shiftIndexDict(d, index, -1);
    }
    this.pageCount = Math.max(0, this.pageCount - 1);
    this.clearHistory('a sheet was deleted');
    this.markDirty();
    this.emit('pages-changed', {});
  }

  /**
   * Drop the undo history.
   *
   * A snapshot holds the metadata and the two page-keyed stores, but NOT the
   * PageStore that owns the sheet images — that lives outside this class and
   * cannot be cloned, since its pages are slices of a 2 GB file. So an undo
   * taken across a sheet insert or delete would restore item buckets keyed for
   * a page list that no longer exists, and items would reappear on the wrong
   * drawings.
   *
   * Clearing is the honest answer. The alternative is an undo that looks like
   * it worked and quietly moved somebody's takeoff to another sheet.
   */
  clearHistory(reason = '') {
    if (!this._undo.length && !this._redo.length) return;
    this._undo.length = 0;
    this._redo.length = 0;
    this.emit('history-changed', { cleared: true, reason });
  }

  _shiftStores(after, delta) {
    for (const store of [this.measurements, this.annotations]) {
      const moved = {};
      for (const key of Object.keys(store)) {
        moved[shiftPageKey(Number(key), after, delta)] = store[key];
      }
      for (const key of Object.keys(store)) delete store[key];
      Object.assign(store, moved);
    }
  }

  // ── undo / redo ─────────────────────────────────────────────────────

  snapshot() {
    return {
      measurements: structuredClone(this.measurements),
      annotations: structuredClone(this.annotations),
      metadata: structuredClone(this.metadata),
      pageCount: this.pageCount,
    };
  }

  restore(snap) {
    this.measurements = structuredClone(snap.measurements);
    this.annotations = structuredClone(snap.annotations);
    this.metadata = structuredClone(snap.metadata);
    this.pageCount = snap.pageCount;
  }

  /**
   * Run `fn` as one undoable step.
   *
   * Nesting is allowed and collapses: an outer transaction owns the snapshot,
   * so a compound edit built from smaller ones lands on the undo stack once.
   */
  transact(label, fn) {
    if (this._txDepth === 0) this._txSnapshot = this.snapshot();
    this._txDepth += 1;
    try {
      return fn();
    } finally {
      this._txDepth -= 1;
      if (this._txDepth === 0) {
        this._undo.push({ label, state: this._txSnapshot });
        if (this._undo.length > UNDO_DEPTH) this._undo.shift();
        this._redo.length = 0;
        this._txSnapshot = null;
        this.markDirty();
        this.emit('history-changed', {});
      }
    }
  }

  /**
   * Push a step whose "before" state was captured earlier — a drag, where the
   * snapshot has to be taken on pointerdown but is only worth keeping if the
   * pointer actually moved something.
   *
   * Goes through the same depth cap as transact(). Pushing straight onto
   * _undo bypassed it, and a long editing session grew the stack without
   * bound, every entry a full clone of the project.
   */
  pushUndo(label, state) {
    this._undo.push({ label, state });
    if (this._undo.length > UNDO_DEPTH) this._undo.shift();
    this._redo.length = 0;
    this.markDirty();
    this.emit('history-changed', {});
  }

  get canUndo() { return this._undo.length > 0; }
  get canRedo() { return this._redo.length > 0; }
  get undoLabel() { return this._undo[this._undo.length - 1]?.label || ''; }
  get redoLabel() { return this._redo[this._redo.length - 1]?.label || ''; }

  undo() {
    const step = this._undo.pop();
    if (!step) return false;
    this._redo.push({ label: step.label, state: this.snapshot() });
    this.restore(step.state);
    this.markDirty();
    this.emit('history-changed', {});
    this.emit('items-changed', {});
    this.emit('pages-changed', {});
    return true;
  }

  redo() {
    const step = this._redo.pop();
    if (!step) return false;
    this._undo.push({ label: step.label, state: this.snapshot() });
    this.restore(step.state);
    this.markDirty();
    this.emit('history-changed', {});
    this.emit('items-changed', {});
    this.emit('pages-changed', {});
    return true;
  }

  // ── dirty state ─────────────────────────────────────────────────────

  get dirty() { return this._dirty; }

  markDirty() {
    if (!this._dirty) {
      this._dirty = true;
      this.emit('dirty-changed', { dirty: true });
    }
  }

  markSaved() {
    this._dirty = false;
    this.emit('dirty-changed', { dirty: false });
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

// ── helpers ───────────────────────────────────────────────────────────────

function nowStamp() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()} ${String(h).padStart(2, '0')}:${mi} ${ampm}`;
}

function defaultLayers() {
  return [
    { name: '0', color: '#ffffff', visible: true, locked: false },
  ];
}

function normaliseStore(store) {
  const out = {};
  for (const [k, v] of Object.entries(intKeyed(store))) {
    out[k] = Array.isArray(v) ? v : [];
  }
  return out;
}

/**
 * Older files carried one scale for the whole document. Spread it across the
 * sheets rather than losing it — a document-wide scale is still what every
 * sheet in that file was measured at.
 */
function normaliseScales(pageScales) {
  const out = {};
  for (const [k, v] of Object.entries(pageScales || {})) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) out[String(k)] = n;
  }
  return out;
}

/** The metadata dicts keyed by a stringified page index. */
const INDEX_DICT_KEYS = ['page_labels_custom', 'page_names', 'page_scales', 'page_groups'];

/** Anything keyed by page index, normalised to a dict of string keys. */
function indexDict(v) {
  const out = {};
  if (Array.isArray(v)) {
    // A list written by an older build of THIS app. Carry the values over
    // rather than dropping the user's sheet names on the floor.
    v.forEach((val, i) => { if (val) out[String(i)] = val; });
    return out;
  }
  for (const [k, val] of Object.entries(v || {})) {
    if (val !== '' && val != null) out[String(k)] = val;
  }
  return out;
}

/** Move an index-keyed dict along when pages are inserted or removed. */
function shiftIndexDict(dict, after, delta) {
  const out = {};
  for (const [k, v] of Object.entries(dict || {})) {
    const n = Number(k);
    if (!Number.isFinite(n)) { out[k] = v; continue; }
    out[String(shiftPageKey(n, after, delta))] = v;
  }
  return out;
}

function spliceArray(arr, at, count, fill) {
  if (!Array.isArray(arr)) return;
  arr.splice(at, 0, ...new Array(count).fill(fill));
}

// ── scale recovery ────────────────────────────────────────────────────────

/** Types whose stored value is a real-world measurement, so scale matters. */
const MEASURED_TYPES = new Set([
  'area', 'slope_area', 'grid', 'tile', 'distance', 'polyline', 'linear_count',
]);

// A recovered ppf outside this band is arithmetic noise from a degenerate
// shape, not a drawing scale. Fall back rather than trust it.
const PPF_MIN = 0.5;
const PPF_MAX = 1500;

/**
 * The pixels-per-foot an item was drawn at, inverted from its own geometry and
 * its stored value. Returns null when the item carries nothing to invert.
 */
export function recoverPpf(item) {
  const pts = item.points || [];
  // A multi-shape master's `value` is the total over EVERY shape, while its
  // points are only its own. Dividing one shape's pixels by three shapes' feet
  // recovers a scale wrong by roughly the shape count — and it lands inside
  // the guard band, so it is accepted as recovered rather than flagged.
  const own = shapeOwn(item);
  const value = own.value;
  if (!(value > 0)) return null;

  let ppf = null;
  switch (item.type) {
    case 'area':
    case 'grid':
    case 'tile': {
      if (pts.length < 3) return null;
      const px2 = polygonArea(pts);
      if (!(px2 > 0)) return null;
      ppf = Math.sqrt(px2 / value);
      break;
    }
    case 'slope_area': {
      // The value is the SLOPED area; the flat one is what the pixels measure.
      const flat = own.flat;
      if (pts.length < 3 || !(flat > 0)) return null;
      const px2 = polygonArea(pts);
      if (!(px2 > 0)) return null;
      ppf = Math.sqrt(px2 / flat);
      break;
    }
    case 'distance':
    case 'polyline': {
      if (pts.length < 2) return null;
      const px = pathLength(pts);
      if (!(px > 0)) return null;
      ppf = px / value;
      break;
    }
    case 'linear_count': {
      // A count cannot be inverted, but the run it was counted along can.
      const ft = own.totalFt;
      if (pts.length < 2 || !(ft > 0)) return null;
      const px = pathLength(pts);
      if (!(px > 0)) return null;
      ppf = px / ft;
      break;
    }
    default:
      return null;
  }

  if (!Number.isFinite(ppf) || ppf < PPF_MIN || ppf > PPF_MAX) return null;
  return ppf;
}
