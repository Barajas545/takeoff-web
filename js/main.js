// main.js — the app shell: open, save, draw, and everything that hangs off a menu.

import {
  openProject, writeProject, readProjectSummary, FILE_EXTENSION, LEGACY_EXTENSION,
  STANDALONE_PAGE,
} from './core/takeoff-file.js';
import { draftKey, putDraft, getDraft, dropDraft } from './core/drafts.js';
import { PageStore } from './core/page-store.js';
import { Project } from './core/project.js';
import { importPdf, canvasToPng } from './core/pdf-import.js';
import {
  SCALE_PRESETS, EXTENDED_SCALES, computePixelsPerFoot, scaleLabelFor,
  DEFAULT_DPI, DEFAULT_PPF, formatFtIn,
} from './core/units.js';
import { recompute } from './core/measure.js';
import { boundingBox } from './core/geom.js';
import { Viewport } from './render/viewport.js';
import { Renderer } from './render/renderer.js';
import { clampMarkerScale, MARKER_STEPS } from './render/markers.js';
import { calloutRadius } from './render/callouts.js';
import { setPaletteIndex } from './render/theme.js';
import {
  ToolController, TOOLS, TAKEOFF_TOOLS, MARKUP_TOOLS, HINTS, isMarkupTool,
} from './tools/controller.js';
import { HIGHLIGHT_COLORS, PEN_COLORS } from './tools/markup.js';
import { ItemsPanel } from './ui/items-panel.js';
import * as D from './ui/dialogs.js';
import { Settings } from './ui/settings.js';
import { openReportCenter } from './ui/reports.js';
import { openCatalog, loadCatalog } from './ui/catalog.js';
import { Thumbnails } from './ui/thumbnails.js';

const $ = id => document.getElementById(id);

const app = {
  project: new Project(),
  pages: new PageStore(),
  settings: new Settings(),
  currentPage: 0,
  fileHandle: null,
  fileName: '',
};

const canvas = $('canvas');
const viewport = new Viewport(canvas);
const renderer = new Renderer(canvas, viewport);

const controller = new ToolController({
  canvas, viewport,
  project: app.project,
  currentPage: () => app.currentPage,
  host: {
    askItem: D.askItem,
    askSlopeRoof: D.askSlopeRoof,
    askTile: D.askTile,
    askCountItem: D.askCountItem,
    askCalibration: async ({ distPx }) => D.askCalibration({ distPx }),
    askNote: opts => D.askNote(opts),
    askCallout: opts => D.askCallout({
      ...opts,
      // Offer the sheets in this set, so a callout can point at one.
      sheets: Array.from({ length: app.pages.pageCount }, (_, i) => [i, pageFinalLabel(i)]),
    }),
    alert: D.alertDialog,
    openProperties: item => openProperties(item),
    showItemMenu: (item, ev) => showItemMenu(item, ev),
  },
});

const itemsPanel = new ItemsPanel({
  root: $('itemsPanel'),
  listEl: $('itemList'),
  floorFilterEl: $('floorFilter'),
  groupFilterEl: $('groupFilter'),
  costToggleEl: $('costToggle'),
  footEl: $('itemsFoot'),
  project: app.project,
  host: {
    pageLabel: idx => pageFinalLabel(idx),
    selectItem: (m, pageIdx, ev) => {
      if (pageIdx !== STANDALONE_PAGE && pageIdx !== app.currentPage) goToPage(pageIdx);
      controller.select([m._uid]);
      const bb = boundingBox(m.points || []);
      if (bb.w || bb.h) viewport.ensureVisible(bb);
      requestDraw();
    },
    openProperties: item => openProperties(item),
    openMaterials: item => openMaterials(item),
    showItemMenu: (item, ev) => showItemMenu(item, ev),
  },
});

const thumbs = new Thumbnails({
  listEl: $('thumbList'),
  panelEl: $('thumbsPanel'),
  project: app.project,
  pages: app.pages,
  onPick: idx => goToPage(idx),
});

// ── render loop ───────────────────────────────────────────────────────────

let drawQueued = false;
let pageImage = null;
// A fit that could not run because the canvas had no size yet. Retried on the
// first frame that has one, so a project opened in a background tab still
// lands framed rather than at 2%.
let pendingFit = false;

function requestDraw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => {
    drawQueued = false;
    drawFrame();
  });
}

function drawFrame() {
  viewport.resize();
  if (pendingFit && pageImage && viewport.measured) {
    if (applyDefaultZoom()) pendingFit = false;
  }
  renderer.markerScale = app.settings.get('marker_scale');
  renderer.uiScale = app.settings.get('ui_touch_mode') ? 1.6 : 1.0;
  renderer.background = app.settings.get('background_color');
  renderer.pageDpi = app.project.dpi;
  controller.calloutRadiusPx = calloutRadius({
    dpi: app.project.dpi, zoom: viewport.zoom,
    markerScale: app.settings.get('marker_scale'),
  });
  renderer.draw({
    pageImage,
    items: app.project.measurements[app.currentPage] || [],
    annotations: app.project.annotations[app.currentPage] || [],
    isVisible: m => app.project.isVisible(m),
    selected: controller.selected,
    hoverId: controller.hoverId,
    hoverVertex: controller.hoverVertex,
    dragVertex: controller.dragVertex,
    preview: controller.previewState(),
    markup: controller.markupPreview(),
    ppf: app.project.pagePpf(app.currentPage),
  });
  $('zoomLabel').textContent = `${Math.round(viewport.zoom * 100)}%`;
}

controller.addEventListener('changed', () => { requestDraw(); syncMobileBar(); });
controller.addEventListener('selection-changed', ev => {
  itemsPanel.setSelection(ev.detail.ids);
});
controller.addEventListener('status', ev => setStatus(ev.detail.text));
controller.addEventListener('mode-changed', ev => {
  for (const wrap of [$('toolButtons'), $('markupButtons')]) {
    for (const b of wrap.children) {
      b.classList.toggle('on', b.dataset.mode === ev.detail.mode);
    }
  }
  syncToolOptions(ev.detail.mode);
  syncMarkupWidth();
});

app.project.addEventListener('items-changed', () => {
  itemsPanel.refresh();
  requestDraw();
});
app.project.addEventListener('visibility-changed', () => requestDraw());
app.project.addEventListener('annotations-changed', () => requestDraw());
app.project.addEventListener('history-changed', ev => {
  syncHistoryButtons();
  if (ev.detail && ev.detail.cleared && ev.detail.reason) {
    setStatus(`Undo history cleared — ${ev.detail.reason}.`);
  }
});
app.project.addEventListener('dirty-changed', syncTitle);
app.project.addEventListener('scale-changed', () => {
  syncScaleSelect();
  itemsPanel.refresh();
  requestDraw();
});
app.project.addEventListener('pages-changed', () => {
  thumbs.refresh(app.currentPage);
  syncPageOf();
});

new ResizeObserver(() => requestDraw()).observe($('stage'));

// ── pages ─────────────────────────────────────────────────────────────────

// Every goToPage call takes a ticket. A decode that finishes after the user
// has moved on must not paint its sheet under another sheet's takeoff — on a
// 25 MB sheet that window is seconds wide.
let pageTicket = 0;

async function goToPage(index) {
  if (index < 0 || index >= app.pages.pageCount) return;
  const ticket = ++pageTicket;
  const first = app.currentPage !== index || !pageImage;
  app.currentPage = index;
  app.project.metadata.last_viewed_page = index;
  controller.cancel();
  thumbs.setCurrent(index);
  syncPageOf();
  syncScaleSelect();
  itemsPanel.refresh();

  let decoded = null;
  try {
    decoded = await app.pages.getPage(index);
  } catch (err) {
    if (ticket === pageTicket) {
      pageImage = null;
      setStatus(`Could not open sheet ${index + 1} — ${err.message}`);
      requestDraw();
    }
    return;
  }
  if (ticket !== pageTicket) return;   // the user has moved on; drop this one

  pageImage = decoded;
  if (first && pageImage) pendingFit = !applyDefaultZoom();
  app.pages.prefetchAround(index, 1);
  requestDraw();
}

/** Frame the current sheet. Returns false if the canvas has no size yet. */
function applyDefaultZoom() {
  if (!pageImage) return false;
  viewport.resize();
  if (!viewport.measured) return false;
  const rect = { x: 0, y: 0, w: pageImage.width, h: pageImage.height };
  const mode = app.settings.get('default_zoom_mode');
  if (mode === '100') {
    viewport.zoom = 1;
    viewport.centerOn(rect.w / 2, rect.h / 2);
    return true;
  }
  return mode === 'width' ? viewport.fitWidth(rect) : viewport.fit(rect);
}

function applyDefaultZoomTo(mode) {
  if (!pageImage) return false;
  viewport.resize();
  if (!viewport.measured) return false;
  const rect = { x: 0, y: 0, w: pageImage.width, h: pageImage.height };
  return mode === 'width' ? viewport.fitWidth(rect) : viewport.fit(rect);
}

function pageFinalLabel(idx) {
  if (idx === STANDALONE_PAGE) return 'no sheet';
  return app.project.pageLabel(idx);
}

function syncPageOf() {
  $('pageOf').textContent = app.pages.pageCount
    ? `${pageFinalLabel(app.currentPage)}  ·  ${app.currentPage + 1} / ${app.pages.pageCount}`
    : '';
  syncMobileBar();
}

/* ══════════════════════════════════════════════════════════════════════
   Phones and tablets

   Below 1024px the two side panels are drawers that slide over the sheet
   instead of columns beside it, and a bar at the foot of the screen carries
   the handful of things that must never be more than one tap away — the two
   drawers, the two page arrows, Fit — because the toolbars scroll sideways
   on a narrow screen and anything can be off the edge.

   While a chain tool is collecting points the bar swaps to Finish / Undo
   point / Cancel. That is not a convenience: a polyline finishes on a
   double-click or Enter, and a tablet has neither, so before this there was
   no way to close one at all.

   Everything here is behind one matchMedia. The desktop layout is untouched.
   ══════════════════════════════════════════════════════════════════════ */

const MOBILE_Q = window.matchMedia('(max-width: 1023px)');
const isMobileLayout = () => MOBILE_Q.matches;

function closeDrawers() {
  $('thumbsPanel').classList.remove('mopen');
  $('itemsPanel').classList.remove('mopen');
  $('scrim').hidden = true;
}

function toggleDrawer(which) {
  const el = which === 'thumbs' ? $('thumbsPanel') : $('itemsPanel');
  const other = which === 'thumbs' ? $('itemsPanel') : $('thumbsPanel');
  const open = !el.classList.contains('mopen');
  other.classList.remove('mopen');
  el.classList.toggle('mopen', open);
  $('scrim').hidden = !open;
}

// 'changed' fires on every pointermove of a pan, so the bar only writes to
// the DOM when something it shows has actually moved.
let _mbarWas = null;
function syncMobileBar() {
  const on = isMobileLayout();
  const chain = on && controller.chainLive;
  const label = app.pages.pageCount
    ? `${app.currentPage + 1}/${app.pages.pageCount}`
    : 'Fit';
  const key = `${on}|${chain}|${label}`;
  if (key === _mbarWas) return;
  _mbarWas = key;
  $('mobileBar').hidden = !on;
  $('mbarMain').hidden = chain;
  $('mbarChain').hidden = !chain;
  $('mbarPage').textContent = label;
  if (!on) closeDrawers();
}

// ── scale ─────────────────────────────────────────────────────────────────

function buildScaleSelect() {
  const sel = $('scaleSelect');
  sel.textContent = '';
  const dpi = app.project.dpi;
  const seen = new Set();
  for (const [label, inches, feet] of EXTENDED_SCALES) {
    const ppf = computePixelsPerFoot(dpi, inches, feet);
    const key = ppf.toFixed(3);
    if (seen.has(key)) continue;
    seen.add(key);
    const o = document.createElement('option');
    o.value = String(ppf);
    o.textContent = label;
    sel.appendChild(o);
  }
  const custom = document.createElement('option');
  custom.value = 'custom';
  custom.textContent = 'Custom…';
  sel.appendChild(custom);
}

function syncScaleSelect() {
  const sel = $('scaleSelect');
  const ppf = app.project.pagePpf(app.currentPage);
  const label = app.project.pageScaleLabel(app.currentPage);
  // A calibrated sheet has no preset to select, so show its px/ft figure as a
  // one-off option rather than silently displaying somebody else's scale.
  let calOpt = sel.querySelector('option[data-calibrated]');
  if (label.endsWith('px/ft')) {
    if (!calOpt) {
      calOpt = document.createElement('option');
      calOpt.dataset.calibrated = '1';
      sel.insertBefore(calOpt, sel.firstChild);
    }
    calOpt.value = String(ppf);
    calOpt.textContent = `${label} (calibrated)`;
  } else if (calOpt) {
    calOpt.remove();
  }
  const match = [...sel.options].find(o => Math.abs(Number(o.value) - ppf) < 0.01);
  sel.value = match ? match.value : String(ppf);
  $('scaleReadout').textContent = app.pages.pageCount
    ? `Scale ${label}   ·   ${ppf.toFixed(2)} px/ft`
    : '';
}

$('scaleSelect').addEventListener('change', async ev => {
  const sel = ev.target;
  let ppf;
  if (sel.value === 'custom') {
    const txt = await D.promptDialog('Custom Scale', 'Pixels per foot',
      String(app.project.pagePpf(app.currentPage).toFixed(2)),
      `At ${app.project.dpi} DPI, 1/4" = 1 ft is ${computePixelsPerFoot(app.project.dpi, 0.25, 1).toFixed(1)} px/ft.`);
    ppf = Number(txt);
    if (!(ppf > 0)) { syncScaleSelect(); return; }
  } else {
    ppf = Number(sel.value);
  }
  await setSheetScale(ppf);
});

/**
 * Restate the current sheet's scale.
 *
 * Work already drawn keeps the scale it was drawn at, and the user is told so
 * — and offered the destructive alternative explicitly. Silently re-valuing a
 * sheet full of measurements is how a 320 LF wall becomes 160 LF inside a bid
 * with nobody watching.
 */
async function setSheetScale(ppf) {
  const existing = (app.project.measurements[app.currentPage] || [])
    .filter(m => m.type !== 'pitch' && (m.points || []).length);
  if (existing.length) {
    const answer = await D.showDialog(close => {
      const body = D.el('div');
      body.style.cssText = 'font-size:12.5px;line-height:1.65';
      body.textContent =
        `This sheet already carries ${existing.length} measurement${existing.length === 1 ? '' : 's'}, ` +
        `each recorded at the scale it was drawn at.\n\n` +
        `Keep them as they are, and draw everything from now on at the new scale? ` +
        `Or re-value every one of them to the new scale?`;
      body.style.whiteSpace = 'pre-line';
      return D.dlg({
        title: 'Change sheet scale',
        body,
        buttons: [
          D.button('Cancel', '', () => close(null)),
          D.button('Re-value everything', 'danger', () => close('restamp')),
          D.button('Keep existing work', 'primary', () => close('keep')),
        ],
      });
    });
    if (!answer) { syncScaleSelect(); return; }
    if (answer === 'restamp') app.project.restampPage(app.currentPage, ppf);
    else app.project.setPageScale(app.currentPage, ppf);
  } else {
    app.project.setPageScale(app.currentPage, ppf);
  }
  syncScaleSelect();
  setStatus(`Sheet scale set to ${app.project.pageScaleLabel(app.currentPage)}`);
}

// ── toolbar ───────────────────────────────────────────────────────────────

function buildToolButtons() {
  fillToolRow($('toolButtons'), TAKEOFF_TOOLS);
  fillToolRow($('markupButtons'), MARKUP_TOOLS);
  buildMarkupStyleControls();
}

function fillToolRow(wrap, tools) {
  wrap.textContent = '';
  for (const [mode, label] of tools) {
    const b = document.createElement('button');
    b.className = `tool-btn${mode === 'pan' ? ' on' : ''}`;
    b.dataset.mode = mode;
    b.textContent = label;
    b.title = HINTS[mode] || label;
    b.addEventListener('click', () => controller.setMode(mode));
    wrap.appendChild(b);
  }
}

/**
 * The markup colour and width controls.
 *
 * Highlighter and pen keep SEPARATE colours and widths, as they do on the
 * desktop: a 14 px yellow wash and a 3 px red line are different instruments,
 * and making them share a setting means every switch costs two adjustments.
 */
function buildMarkupStyleControls() {
  const style = controller.markupStyle;

  const fill = (wrap, colors, key) => {
    wrap.textContent = '';
    for (const [name, c] of colors) {
      const b = document.createElement('button');
      b.className = 'swatch-btn';
      b.title = `${name} ${key === 'highlightColor' ? 'highlight' : 'pen'}`;
      b.style.background = `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${key === 'highlightColor' ? 0.78 : 1})`;
      b.classList.toggle('on', sameColor(style[key], c));
      b.addEventListener('click', () => {
        style[key] = c.slice();
        // Picking a colour picks the instrument too — nobody chooses a
        // highlighter colour meaning to keep drawing with the pen.
        controller.setMode(key === 'highlightColor' ? 'highlight' : 'draw');
        buildMarkupStyleControls();
      });
      wrap.appendChild(b);
    }
  };
  fill($('highlightColors'), HIGHLIGHT_COLORS, 'highlightColor');
  fill($('penColors'), PEN_COLORS, 'penColor');
  syncMarkupWidth();
}

function sameColor(a, b) {
  return a && b && Math.abs(a[0] - b[0]) < 0.02
    && Math.abs(a[1] - b[1]) < 0.02 && Math.abs(a[2] - b[2]) < 0.02;
}

/** The width slider follows whichever instrument is live. */
function syncMarkupWidth() {
  const style = controller.markupStyle;
  const pen = controller.mode === 'draw';
  const el = $('markupWidth');
  el.value = String(pen ? style.penWidth : style.highlightWidth);
  $('markupWidthOut').textContent = el.value;
}

$('markupWidth').addEventListener('input', () => {
  const v = Math.max(1, Number($('markupWidth').value) || 1);
  if (controller.mode === 'draw') controller.markupStyle.penWidth = v;
  else controller.markupStyle.highlightWidth = v;
  $('markupWidthOut').textContent = String(v);
});

/** The floating options bar, parked under the button that owns it. */
function syncToolOptions(mode) {
  const bar = $('toolOpts');
  bar.textContent = '';
  const o = controller.options;
  const parts = [];

  // Markup carries no item name — it is not an item.
  const NO_NAME = new Set([
    'pan', 'window', 'door', 'calibrate', 'pitch',
    ...MARKUP_TOOLS.map(t => t[0]),
  ]);
  if (!NO_NAME.has(mode)) {
    const nameInput = D.input(o.pendingName, 'text');
    nameInput.className = 'tb-input';
    nameInput.placeholder = 'Item name…';
    nameInput.setAttribute('list', 'catalogNames');
    nameInput.addEventListener('input', () => { o.pendingName = nameInput.value; });
    parts.push([mode === 'count' ? 'Counting' : 'Item', nameInput]);
  }

  if (mode === 'linear_count') {
    const sp = D.input(String(o.spacingIn), 'number', { step: '0.25', min: '0.25' });
    sp.className = 'tb-input';
    sp.style.width = '70px';
    sp.addEventListener('input', () => {
      o.spacingIn = Number(sp.value) || 12;
      requestDraw();
    });
    parts.push(['Spacing (in)', sp]);
  }

  if (mode === 'grid') {
    const w = D.input(String(o.gridCellW), 'number', { step: '0.25', min: '0.05' });
    const h = D.input(String(o.gridCellH), 'number', { step: '0.25', min: '0.05' });
    const a = D.input(String(o.gridAngle), 'number', { step: '5' });
    for (const [n, key] of [[w, 'gridCellW'], [h, 'gridCellH'], [a, 'gridAngle']]) {
      n.className = 'tb-input'; n.style.width = '64px';
      n.addEventListener('input', () => { o[key] = Number(n.value) || 0; requestDraw(); });
    }
    parts.push(['Cell (ft)', w], ['×', h], ['Angle°', a]);
  }

  if (mode === 'tile') {
    const sizes = TILE_SIZE_OPTIONS();
    const size = D.select(sizes, `${o.tileWIn}x${o.tileHIn}`);
    size.className = 'tb-select';
    size.addEventListener('change', () => {
      const [tw, th] = size.value.split('x').map(Number);
      o.tileWIn = tw; o.tileHIn = th;
      requestDraw();
    });
    const pat = D.select(TILE_PATTERN_OPTIONS(), o.tilePattern);
    pat.className = 'tb-select';
    pat.addEventListener('change', () => { o.tilePattern = pat.value; requestDraw(); });
    const ang = D.input(String(o.tileAngle), 'number', { step: '5' });
    ang.className = 'tb-input'; ang.style.width = '64px';
    ang.addEventListener('input', () => { o.tileAngle = Number(ang.value) || 0; requestDraw(); });
    parts.push(['Size', size], ['Pattern', pat], ['Angle°', ang]);
  }

  if (!parts.length) { bar.hidden = true; return; }

  for (const [label, node] of parts) {
    bar.appendChild(D.el('span', 'tb-label', label));
    bar.appendChild(node);
  }
  bar.hidden = false;
  placeToolOptions(mode);
}

function TILE_SIZE_OPTIONS() {
  return [[1, 1], [2, 2], [4, 4], [6, 6], [8, 8], [12, 12], [12, 24], [16, 16],
    [18, 18], [20, 20], [24, 24], [6, 36], [8, 48], [12, 48], [24, 48]]
    .map(([w, h]) => [`${w}x${h}`, `${w}″×${h}″`]);
}
function TILE_PATTERN_OPTIONS() {
  return [['grid', 'Straight Grid'], ['half', 'Running Bond 1/2'],
    ['third', 'Stair-Step 1/3'], ['herringbone', 'Herringbone'],
    ['chevron', 'Chevron'], ['diagonal', 'Diagonal 45']];
}

/**
 * Park the options bar under its tool button.
 *
 * It floats over the canvas rather than sitting in the layout, because adding
 * a row to the layout shortened the canvas every time a tool was picked and
 * the drawing jumped under the cursor.
 */
function placeToolOptions(mode) {
  const bar = $('toolOpts');
  const btn = $('toolButtons').querySelector(`[data-mode="${mode}"]`)
    || $('markupButtons').querySelector(`[data-mode="${mode}"]`);
  if (!btn || bar.hidden) return;
  const br = btn.getBoundingClientRect();
  const ar = document.getElementById('app').getBoundingClientRect();
  const bw = bar.offsetWidth || 260;
  let x = br.left - ar.left;
  x = Math.max(6, Math.min(x, ar.width - bw - 6));
  bar.style.left = `${x}px`;
  bar.style.top = `${br.bottom - ar.top + 4}px`;
}

window.addEventListener('resize', () => placeToolOptions(controller.mode));

// ── open and save ─────────────────────────────────────────────────────────

/**
 * Whether this browser can write back to a file it opened.
 *
 * Chrome and Edge can; Firefox and Safari cannot, and fall back to an
 * <input type=file> for opening and a download for saving. That fallback is a
 * genuinely different code path with its own rules about user activation, and
 * it broke once without anyone noticing on Chrome — so `?nofsapi` forces it on
 * from any browser, which is how it gets tested.
 */
const canUseFsApi = 'showOpenFilePicker' in window
  && !new URLSearchParams(location.search).has('nofsapi');

/**
 * Open a project.
 *
 * The unsaved-changes prompt is checked SYNCHRONOUSLY first. Awaiting it
 * unconditionally cost the user activation the file picker needs in Firefox,
 * even when there was nothing to confirm — which is every first open.
 */
async function openProjectFile() {
  if (app.project.dirty) {
    if (!(await confirmDiscard())) return;
  }
  let file, handle = null;
  if (canUseFsApi) {
    try {
      [handle] = await window.showOpenFilePicker({
        types: [{
          description: 'Takeoff Projects',
          accept: { 'application/octet-stream': [FILE_EXTENSION, LEGACY_EXTENSION] },
        }],
      });
      file = await handle.getFile();
    } catch (err) {
      if (err.name === 'AbortError') return;
      throw err;
    }
  } else {
    file = await pickFileFallback(`${FILE_EXTENSION},${LEGACY_EXTENSION}`);
    if (!file) return;
  }
  await loadProjectFile(file, handle);
}

async function loadProjectFile(file, handle = null) {
  showProgress('Opening project…', 0, 1, file.name);
  try {
    // Only the header, the metadata and the page index are read here — about
    // 2 KB even on the 2.3 GB job. Sheets are fetched one at a time as drawn.
    const opened = await openProject(file);
    app.project.loadFrom({
      metadata: opened.metadata,
      annotations: opened.annotations,
      measurements: opened.measurements,
      pageCount: opened.pageCount,
    });
    app.pages.setFromProject(opened);
    app.fileHandle = handle;
    app.fileName = file.name;
    app.fileSize = file.size;
    app.project.filePath = file.name;
    // A new session picks up the palette where the project left off, so a
    // fresh item does not repeat the colour of the last one drawn.
    setPaletteIndex(countItems());
    hideEmptyState();
    buildScaleSelect();
    thumbs.refresh(0);
    const start = Math.min(
      Math.max(0, Number(app.project.metadata.last_viewed_page) || 0),
      opened.pageCount - 1
    );
    pageImage = null;
    await goToPage(Math.max(0, start));
    app.project.markSaved();
    noteRecent(file);
    syncTitle();
    await offerDraftRestore(file);
    const mb = (file.size / 1048576).toFixed(file.size > 1e9 ? 0 : 1);
    setStatus(
      `Opened ${file.name} — ${opened.pageCount} sheet${opened.pageCount === 1 ? '' : 's'}, ${mb} MB` +
      (opened.revisions.length ? `, ${opened.revisions.length} revision set(s)` : '')
    );
  } catch (err) {
    await D.alertDialog('Could not open', `${file.name}\n\n${err.message}`);
  } finally {
    hideProgress();
  }
}

function countItems() {
  let n = 0;
  for (const _ of app.project.allItems()) n += 1;
  return n;
}

async function saveProject({ saveAs = false } = {}) {
  // A project can be nothing but standalone items — hardware, glue, a labor
  // line — and refusing to save that loses real work with no message.
  if (!app.pages.pageCount && ![...app.project.allItems()].length) {
    setStatus('Nothing to save yet.');
    return;
  }
  let handle = app.fileHandle;
  if (saveAs || !handle) {
    if (canUseFsApi) {
      try {
        handle = await window.showSaveFilePicker({
          suggestedName: suggestedFileName(),
          types: [{
            description: 'Takeoff Project',
            accept: { 'application/octet-stream': [FILE_EXTENSION] },
          }],
        });
      } catch (err) {
        if (err.name === 'AbortError') return;
        throw err;
      }
    } else {
      handle = null;   // fall through to a download
    }
  }

  showProgress('Saving…', 0, app.pages.pageCount);
  try {
    const blob = await writeProject({
      metadata: app.project.buildSaveMetadata(),
      pageSources: app.pages.saveSources(),
      revisionSources: app.pages.saveRevisionSources(),
      onProgress: (done, total, label) => showProgress(label, done, total),
    });
    if (handle) {
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      app.fileHandle = handle;
      app.fileName = handle.name;
      // Every untouched sheet is a Blob slice of the file we just overwrote.
      // Chrome keeps those slices valid, but Firefox and Safari can invalidate
      // them, and a sheet would then fail to decode with the project still
      // open. Re-acquire the handle's File and re-point the page index at it.
      await reacquireAfterSave(handle);
    } else {
      const how = await downloadBlob(blob, suggestedFileName());
      if (how === 'cancelled') { setStatus('Save cancelled.'); return; }
    }
    app.project.markSaved();
    syncTitle();
    await dropDraft(draftKey(app.fileName || suggestedFileName(),
                             app.fileSize || 0));
    setStatus(`Saved ${app.fileName || suggestedFileName()}`);
  } catch (err) {
    await D.alertDialog('Could not save', err.message);
  } finally {
    hideProgress();
  }
}

/**
 * Re-point every page source at the file that was just written.
 *
 * Cheap: it re-reads the header and the index, not the sheets. Failing is not
 * fatal — the in-memory slices usually still work — so this degrades to a
 * warning rather than taking the project down with it.
 */
async function reacquireAfterSave(handle) {
  try {
    const file = await handle.getFile();
    const reopened = await openProject(file);
    if (reopened.pageCount === app.pages.pageCount) {
      app.pages.setFromProject(reopened);
      pageImage = null;
      await goToPage(app.currentPage);
      thumbs.refresh(app.currentPage);
    }
  } catch (err) {
    console.warn('could not re-acquire the saved file; page slices kept', err);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   Unsaved work

   A phone does not close a tab, it discards it: iOS reclaims a backgrounded
   Safari tab under memory pressure and reloads it empty when you come back.
   `beforeunload` never fires for that, and iOS would not show its prompt
   anyway. So the work — measurements, annotations, metadata, never the sheet
   pixels — is written to IndexedDB every time the page is hidden, and offered
   back when the same file is opened again.
   ══════════════════════════════════════════════════════════════════════ */

function currentDraftKey() {
  return draftKey(app.fileName || suggestedFileName(), app.fileSize || 0);
}

async function saveDraftNow() {
  try {
    if (!app.project.dirty) return;
    if (!app.pages.pageCount && ![...app.project.allItems()].length) return;
    await putDraft(currentDraftKey(), app.project.buildSaveMetadata(), {
      pageCount: app.pages.pageCount,
      name: app.fileName || '',
    });
  } catch { /* a draft that cannot be written must not break the app */ }
}

async function offerDraftRestore(file) {
  const key = draftKey(file.name, file.size);
  const draft = await getDraft(key);
  if (!draft || !draft.payload) return;

  // A draft older than the file has already been saved into it.
  if (file.lastModified && draft.savedAt <= file.lastModified + 1500) {
    await dropDraft(key);
    return;
  }

  // Measurements are keyed by page index. If the sheet count has moved since
  // the draft was written, those indices point at different sheets — so this
  // refuses rather than quietly putting a wall on the wrong drawing.
  if (draft.pageCount != null && draft.pageCount !== app.pages.pageCount) {
    setStatus(`Unsaved work found for this file, but it was measured against `
      + `${draft.pageCount} sheets and this file has ${app.pages.pageCount}. `
      + `It has been left alone rather than landing on the wrong drawings.`);
    return;
  }

  const when = new Date(draft.savedAt).toLocaleString();
  const ok = await D.confirmDialog(
    'Unsaved work found',
    `There is takeoff for "${file.name}" from ${when} that was never saved `
    + `into the file — the tab was most likely closed or reloaded first.`
    + `\n\nRestore it?`,
    { okLabel: 'Restore it' });
  if (!ok) { await dropDraft(key); return; }

  app.project.loadFrom({
    metadata: draft.payload,
    annotations: draft.payload.annotations,
    measurements: draft.payload.measurements,
    pageCount: app.pages.pageCount,
  });
  app.project.markDirty();
  itemsPanel.refresh();
  thumbs.refresh(app.currentPage);
  requestDraw();
  setStatus('Unsaved work restored. Save it into the file to keep it.');
}

// Hidden, not unloading: this is the event a discarded tab actually gets.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') void saveDraftNow();
});
window.addEventListener('pagehide', () => { void saveDraftNow(); });

function suggestedFileName() {
  const n = (app.project.metadata.project_name || '').trim();
  const base = n || (app.fileName ? app.fileName.replace(/\.[^.]+$/, '') : 'Takeoff');
  return `${base.replace(/[<>:"/\\|?*]+/g, '_')}${FILE_EXTENSION}`;
}

/**
 * Hand the finished project back to the user.
 *
 * On a phone this is the ONLY save — there are no writable file handles in
 * Safari — so it has to actually work there. Two problems with a plain
 * <a download>: iOS puts the file in Downloads with no say in where it goes,
 * and inside an installed home-screen app the anchor has historically done
 * nothing at all, silently.
 *
 * So where the browser can share a file, share it: iOS then offers Files,
 * Drive, Mail, AirDrop — the estimator picks where the job goes, and it
 * works the same installed or not. The anchor stays as the fallback, and is
 * still the whole story on a desktop.
 */
async function downloadBlob(blob, name) {
  const file = new File([blob], name, { type: 'application/octet-stream' });
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (err) {
      // The user dismissing the sheet is an answer, not a failure.
      if (err && err.name === 'AbortError') return 'cancelled';
      // Anything else: fall through and try the ordinary download.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return 'downloaded';
}

/**
 * The plain <input type=file> path, for browsers without the File System
 * Access API — which is Firefox and Safari, so most of them.
 *
 * Two things here are not optional, and both are Firefox:
 *
 *   · The input MUST be in the document. Chrome opens a picker for a detached
 *     input; Firefox silently does nothing at all, with no error anywhere.
 *   · The promise MUST settle on cancel. `change` does not fire when the user
 *     dismisses the dialog, so without this the caller awaits forever.
 *
 * It also has to be called inside the user's click, not after an await — see
 * openProjectFile.
 */
function pickFileFallback(accept, multiple = false) {
  return new Promise(resolve => {
    const i = document.createElement('input');
    i.type = 'file';
    // iOS greys out every file in the Files picker when `accept` names an
    // extension it does not recognise as a UTI — and .takeoff is not one, so
    // the estimator would look at his own project and be unable to tap it.
    // No filter at all on a touch device; the name is checked below instead.
    // maxTouchPoints is the test, not the user agent: iPadOS reports itself
    // as a Mac, and it is the device that needs this.
    const touchPicker = !('showOpenFilePicker' in window)
      && navigator.maxTouchPoints > 0;
    if (!touchPicker) i.accept = accept;
    i.multiple = multiple;
    // Off-screen rather than display:none — a hidden input is not focusable in
    // some browsers, and the picker needs it to be.
    i.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(i);

    let settled = false;
    const done = value => {
      if (settled) return;
      settled = true;
      i.remove();
      resolve(value);
    };

    i.addEventListener('change', () => {
      done(multiple ? [...i.files] : i.files[0] || null);
    });
    // Chrome and Firefox 91+ fire this on dismiss.
    i.addEventListener('cancel', () => done(multiple ? [] : null));
    // Everything else: the window regains focus with no files chosen. But
    // iOS copies the picked document into the app sandbox BEFORE it fires
    // `change`, and a project off iCloud or Google Drive can be hundreds of
    // megabytes — focus comes back first and a single 400 ms check called it
    // a cancel and threw the file away. Poll instead, and only give up when
    // the whole window has passed with nothing there.
    window.addEventListener('focus', () => {
      const deadline = Date.now() + 8000;
      const tick = () => {
        if (settled) return;
        if (i.files && i.files.length) return;      // `change` will settle it
        if (Date.now() >= deadline) { done(multiple ? [] : null); return; }
        setTimeout(tick, 250);
      };
      setTimeout(tick, 400);
    }, { once: true });

    i.click();
  });
}

async function confirmDiscard() {
  if (!app.project.dirty) return true;
  return D.confirmDialog(
    'Unsaved changes',
    'This project has changes that have not been saved.\n\nOpen a different project and lose them?',
    { okLabel: 'Discard and open', danger: true }
  );
}

// ── PDF import ────────────────────────────────────────────────────────────

async function importPdfFile(file, { intoOpen = false } = {}) {
  if (!intoOpen && app.project.dirty && !(await confirmDiscard())) return;
  const dpi = app.settings.get('import_dpi');
  showProgress('Reading PDF…', 0, 1, file.name);
  try {
    if (!intoOpen) {
      newProject();
      app.project.metadata.project_name = file.name.replace(/\.pdf$/i, '');
      app.project.metadata.source = file.name;
      app.project.metadata.dpi = dpi;
      app.project.metadata.import_dpi = undefined;
      delete app.project.metadata.import_dpi;
      app.project.metadata.pixels_per_foot = computePixelsPerFoot(dpi, 0.25, 1);
      setPaletteIndex(0);
    }
    const startAt = app.pages.pageCount;
    let clampedAny = false;

    const buf = await file.arrayBuffer();
    const result = await importPdf(buf, {
      dpi,
      onPage: async ({ raster, label, name }) => {
        if (raster.clampedFrom) clampedAny = true;
        const png = await canvasToPng(raster.canvas);
        app.pages.addPage({
          kind: 'png', data: png,
          width: raster.width, height: raster.height,
        });
        const idx = app.pages.pageCount - 1;
        // page_labels is the DETECTED list, indexed; page_names is a dict of
        // the user's own titles. A detected sheet title is not a user title,
        // so it goes in as a name only because nothing else carries it.
        const labels = app.project.metadata.page_labels;
        while (labels.length < idx) labels.push('');
        labels[idx] = label || '';
        if (name) app.project.metadata.page_names[String(idx)] = name;
        // Release the canvas immediately: a 300-sheet set cannot hold them.
        raster.canvas.width = raster.canvas.height = 0;
      },
      onProgress: (done, total) => showProgress('Rendering sheets…', done, total, file.name),
    });

    app.project.pageCount = app.pages.pageCount;
    if (!intoOpen) app.project.metadata.project_created = nowStamp();
    app.project.markDirty();
    hideEmptyState();
    buildScaleSelect();
    thumbs.refresh(startAt);
    pageImage = null;
    await goToPage(startAt);
    syncTitle();

    const detected = (app.project.metadata.page_labels || []).filter(Boolean).length;
    setStatus(
      `Imported ${result.pageCount} sheet${result.pageCount === 1 ? '' : 's'} at ${dpi} DPI` +
      (detected ? ` — read ${detected} sheet number${detected === 1 ? '' : 's'}` : '')
    );
    if (clampedAny) {
      await D.alertDialog(
        'Some sheets were rendered smaller',
        `At ${dpi} DPI one or more sheets exceeded what a browser canvas can hold, ` +
        `so they were rendered at a lower resolution.\n\n` +
        `Measurements are unaffected — scale is derived from each sheet's own pixels. ` +
        `Lower the import DPI in Settings if the linework looks soft.`
      );
    }
  } catch (err) {
    if (err.name !== 'AbortError') await D.alertDialog('Could not import', err.message);
  } finally {
    hideProgress();
  }
}

function nowStamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()} ${p(h)}:${p(d.getMinutes())} ${ampm}`;
}

// ── item editing ──────────────────────────────────────────────────────────

async function openProperties(item) {
  if (item.type === 'standalone') {
    const patch = await D.askStandalone(item);
    if (patch) app.project.updateItem(item._uid, patch);
    return;
  }
  if (item.type === 'window' || item.type === 'door') {
    const patch = await D.askOpening(item.type, item);
    if (patch) app.project.updateItem(item._uid, patch);
    return;
  }
  if (item.type === 'slope_area') {
    const patch = await D.askSlopeRoof({
      flatArea: Number(item.flat_area) || 0,
      existing: item,
      color: item.color,
    });
    if (!patch) return;
    app.project.transact('Edit item', () => {
      Object.assign(item, patch);
      recompute(item);
    });
    app.project.emit('items-changed', {});
    return;
  }
  if (item.type === 'tile') {
    const patch = await D.askTile({
      tileWIn: item.tile_w_in ?? 12, tileHIn: item.tile_h_in ?? 12,
      groutIn: item.grout_in ?? 0, pattern: item.pattern || 'grid',
      wastePct: item.waste_pct ?? 10, tilesPerBox: item.tiles_per_box ?? 0,
      areaFt2: Number(item.value) || 0, color: item.color, existing: item,
    });
    if (!patch) return;
    app.project.transact('Edit item', () => {
      Object.assign(item, {
        tile_w_in: patch.tileWIn, tile_h_in: patch.tileHIn,
        grout_in: patch.groutIn, pattern: patch.pattern,
        waste_pct: patch.wastePct, tiles_per_box: patch.tilesPerBox,
        name: patch.name, floor_level: patch.floor_level,
        category: patch.category, cost_type: patch.cost_type,
        unit_cost: patch.unit_cost, color: patch.color,
      });
      recompute(item);
    });
    app.project.emit('items-changed', {});
    return;
  }

  const patch = await D.askItem({
    type: item.type, existing: item, color: item.color,
    spacingIn: item.type === 'linear_count' ? item.spacing_in : null,
    gridCells: item.type === 'grid' ? [item.cell_w_ft, item.cell_h_ft] : null,
  });
  if (!patch) return;
  app.project.transact('Edit item', () => {
    const { spacingIn, cellW, cellH, ...rest } = patch;
    Object.assign(item, rest);
    if (spacingIn != null) item.spacing_in = spacingIn;
    if (cellW != null) {
      const ppf = Number(item.ppf) || app.project.pagePpf(app.currentPage);
      item.cell_w_ft = cellW; item.cell_h_ft = cellH;
      item.cell_w_px = cellW * ppf; item.cell_h_px = cellH * ppf;
    }
    recompute(item);
  });
  app.project.emit('items-changed', {});
}

async function openMaterials(item) {
  const { openAssemblyManager } = await import('./ui/assemblies.js');
  const lines = await openAssemblyManager(item);
  if (lines) app.project.updateItem(item._uid, { associated_items: lines }, { label: 'Materials' });
}

function showItemMenu(item, ev) {
  const menu = $('ctxMenu');
  menu.textContent = '';
  const add = (label, fn, cls) => {
    const b = document.createElement('button');
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener('click', () => { menu.hidden = true; fn(); });
    menu.appendChild(b);
  };
  add('Properties…', () => openProperties(item));
  add('Associated materials…', () => openMaterials(item));
  menu.appendChild(document.createElement('hr'));
  add(item.visible === false ? 'Show' : 'Hide',
    () => { app.project.setVisible([item._uid], item.visible === false); itemsPanel.refresh(); });
  add('Isolate this item', () => {
    app.project.isolate([item._uid]);
    setStatus('Showing this item only — View ▸ Show Everything to come back');
  });
  add('Zoom to item', () => {
    const bb = boundingBox(item.points || []);
    if (bb.w || bb.h) {
      viewport.fit({ x: bb.x - bb.w * 0.4, y: bb.y - bb.h * 0.4, w: bb.w * 1.8, h: bb.h * 1.8 });
      requestDraw();
    }
  });
  menu.appendChild(document.createElement('hr'));
  add('Delete', () => {
    app.project.removeItems([item._uid]);
    controller.selected.delete(item._uid);
    requestDraw();
  });

  menu.hidden = false;
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = `${Math.min(ev.clientX, window.innerWidth - w - 8)}px`;
  menu.style.top = `${Math.min(ev.clientY, window.innerHeight - h - 8)}px`;
  const dismiss = () => { menu.hidden = true; document.removeEventListener('mousedown', dismiss); };
  setTimeout(() => document.addEventListener('mousedown', dismiss), 0);
}

// ── menus ─────────────────────────────────────────────────────────────────

function wireMenus() {
  const menus = $('menus');
  menus.addEventListener('click', ev => {
    const btn = ev.target.closest('.menu-btn');
    if (btn) {
      const menu = btn.parentElement;
      const wasOpen = menu.classList.contains('open');
      for (const m of menus.querySelectorAll('.menu')) m.classList.remove('open');
      if (!wasOpen) menu.classList.add('open');
      return;
    }
    const act = ev.target.closest('button[data-act]');
    if (act) {
      for (const m of menus.querySelectorAll('.menu')) m.classList.remove('open');
      safeRun(act.dataset.act);
    }
  });
  document.addEventListener('mousedown', ev => {
    if (!ev.target.closest('.menu')) {
      for (const m of menus.querySelectorAll('.menu')) m.classList.remove('open');
    }
  });
  document.addEventListener('click', ev => {
    const act = ev.target.closest('button[data-act]');
    if (act && !act.closest('.menu-pop')) safeRun(act.dataset.act);
  });
}

/**
 * Run a menu action and never let it fail in silence.
 *
 * A cancelled file picker throws AbortError, which is the user saying no and
 * not an error. Anything else the user needs to be told about — a swallowed
 * rejection here reads as "the menu is broken".
 */
function safeRun(act) {
  // Called SYNCHRONOUSLY, not through Promise.resolve().then().
  //
  // Opening a file picker needs the browser's transient user activation, and
  // Firefox drops it across a task boundary. One stray microtask hop between
  // the click and the picker was enough for "Open a .takeoff project" to do
  // nothing at all, silently.
  let result;
  try {
    result = runAction(act);
  } catch (err) {
    reportActionError(act, err);
    return;
  }
  if (result && typeof result.catch === 'function') {
    result.catch(err => reportActionError(act, err));
  }
}

/** A cancelled picker is the user saying no; anything else needs saying. */
function reportActionError(act, err) {
  if (err && err.name === 'AbortError') return;
  console.error(act, err);
  const msg = err && err.message ? err.message : String(err);
  setStatus(`${act}: ${msg}`);
  D.alertDialog('Something went wrong', msg);
}

/** Tear the open project down and start clean. */
function newProject() {
  // A dialog left open over a project that no longer exists would write its
  // result into the new one.
  D.closeAllDialogs();
  app.project.reset();
  app.pages.clearCaches();          // release the old ImageBitmaps
  app.pages = new PageStore();
  thumbs.pages = app.pages;
  pageImage = null;
  pendingFit = false;
  pageTicket += 1;                  // orphan any decode still in flight
  app.currentPage = 0;
  app.fileHandle = null;
  app.fileName = '';
  controller.selected.clear();
  controller.cancel();
  showEmptyState();
  thumbs.refresh(0);
  itemsPanel.refresh();
  syncTitle();
  syncPageOf();
  syncScaleSelect();
  syncHistoryButtons();
  requestDraw();
}

async function runAction(act) {
  switch (act) {
    case 'new-project':
      if (!(await confirmDiscard())) return;
      newProject();
      break;
    case 'open-project': await openProjectFile(); break;
    case 'import-pdf': {
      // The picker is opened first, before anything that could await, so the
      // click's user activation is still live when it runs.
      const f = await pickFileFallback('.pdf,application/pdf');
      if (f) await importPdfFile(f);
      break;
    }
    case 'import-more': {
      if (!app.pages.pageCount) return;
      const f = await pickFileFallback('.pdf,application/pdf');
      if (f) await importPdfFile(f, { intoOpen: true });
      break;
    }
    case 'save': await saveProject(); break;
    case 'save-as': await saveProject({ saveAs: true }); break;
    case 'close-project': await runAction('new-project'); break;
    case 'project-info': await openProjectInfo(); break;

    case 'undo': app.project.undo(); itemsPanel.refresh(); requestDraw(); break;
    case 'redo': app.project.redo(); itemsPanel.refresh(); requestDraw(); break;
    case 'delete':
      if (controller.selected.size) {
        app.project.removeItems([...controller.selected]);
        controller.selected.clear();
        requestDraw();
      }
      break;
    case 'select-none':
      controller.selected.clear();
      controller.cancel();
      itemsPanel.setSelection([]);
      requestDraw();
      break;
    case 'settings': await app.settings.open(onSettingsChanged); break;

    case 'zoom-in': viewport.zoomBy(1.2); requestDraw(); break;
    case 'zoom-out': viewport.zoomBy(1 / 1.2); requestDraw(); break;
    case 'zoom-fit':
      if (pageImage) {
        pendingFit = !applyDefaultZoomTo('fit');
        requestDraw();
      }
      break;
    case 'zoom-100':
      viewport.zoom = 1;
      if (pageImage) viewport.centerOn(pageImage.width / 2, pageImage.height / 2);
      requestDraw();
      break;
    case 'zoom-width':
      if (pageImage) {
        pendingFit = !applyDefaultZoomTo('width');
        requestDraw();
      }
      break;

    case 'toggle-thumbs':
      if (isMobileLayout()) { toggleDrawer('thumbs'); break; }
      $('app').querySelector('.body').classList.toggle('no-thumbs');
      requestDraw();
      break;
    case 'toggle-items':
      if (isMobileLayout()) { toggleDrawer('items'); break; }
      $('app').querySelector('.body').classList.toggle('no-items');
      requestDraw();
      break;
    case 'toggle-markup-bar': {
      const bar = $('markupBar');
      bar.hidden = !bar.hidden;
      requestDraw();
      break;
    }

    // The foot bar's three chain buttons. Finish and Cancel go through the
    // keyboard map so a finger and a keyboard cannot drift apart.
    case 'chain-finish':
      if (!controller.handleKey({ key: 'Enter' })) {
        setStatus('Add at least two points first.');
      }
      syncMobileBar();
      break;
    case 'chain-undo':
      controller.undoPoint();
      syncMobileBar();
      break;
    case 'chain-cancel':
      controller.handleKey({ key: 'Escape' });
      syncMobileBar();
      break;
    case 'toggle-labels': renderer.showLabels = !renderer.showLabels; requestDraw(); break;
    case 'thumb-compact': $('thumbsPanel').classList.toggle('compact'); break;

    case 'marker-smaller': stepMarkerScale(-1); break;
    case 'marker-bigger': stepMarkerScale(+1); break;
    case 'marker-normal': app.settings.set('marker_scale', 1.0); requestDraw(); break;

    case 'prev-page': goToPage(app.currentPage - 1); break;
    case 'next-page': goToPage(app.currentPage + 1); break;
    case 'add-blank': await addBlankSheet(); break;
    case 'review-labels': await reviewSheetLabels(); break;
    case 'set-scale': $('scaleSelect').focus(); break;
    case 'delete-page': await deleteCurrentPage(); break;

    case 'catalog': await openCatalog(); break;
    case 'add-standalone': {
      const spec = await D.askStandalone();
      if (spec) {
        app.project.addItem(STANDALONE_PAGE, spec, { label: 'Add item' });
        itemsPanel.refresh();
      }
      break;
    }
    case 'isolate':
      if (controller.selected.size) {
        app.project.isolate([...controller.selected]);
        setStatus('Showing the selection only — Tools ▸ Show Everything to come back');
      }
      break;
    case 'exit-isolate':
      app.project.clearIsolation();
      setStatus('Showing everything');
      break;

    case 'report-center': await openReportCenter(app.project, pageFinalLabel); break;
    case 'export-csv': {
      const { exportCsv } = await import('./ui/reports.js');
      exportCsv(app.project, pageFinalLabel);
      break;
    }
    case 'export-xlsx': {
      const { exportWorkbook } = await import('./ui/reports.js');
      await exportWorkbook(app.project, pageFinalLabel);
      break;
    }

    case 'toggle-markup': {
      renderer.showMarkup = !renderer.showMarkup;
      $('markupToggle').textContent = renderer.showMarkup ? 'Markup on' : 'Markup off';
      $('markupToggle').classList.toggle('on', !renderer.showMarkup);
      setStatus(renderer.showMarkup ? 'Showing markup' : 'Markup hidden');
      requestDraw();
      break;
    }
    case 'clear-markup': {
      const list = app.project.annotations[app.currentPage] || [];
      const erasable = list.filter(a => a.subtype !== 'cad');
      if (!erasable.length) { setStatus('No markup on this sheet.'); break; }
      const ok = await D.confirmDialog('Clear markup',
        `Remove ${erasable.length} highlight${erasable.length === 1 ? '' : 's'} and pen ` +
        `stroke${erasable.length === 1 ? '' : 's'} from ${pageFinalLabel(app.currentPage)}?\n\n` +
        'Takeoff items are not affected.',
        { okLabel: 'Clear markup', danger: true });
      if (!ok) break;
      app.project.removeAnnotations(erasable.map(a => a._uid), { label: 'Clear markup' });
      requestDraw();
      break;
    }
    case 'recent': await showRecent(); break;
    case 'shortcuts': await showShortcuts(); break;
    case 'about':
      await D.alertDialog('Professional Takeoff Tools — Web',
        'Smart Takeoff. Better Estimates.\n\n' +
        'The browser build of Professional Takeoff Tools. It opens and writes the ' +
        'same .takeoff project files as the desktop app, so a job can move between ' +
        'the two without an export step.');
      break;
    default: break;
  }
}

function stepMarkerScale(dir) {
  const cur = app.settings.get('marker_scale');
  let i = MARKER_STEPS.findIndex(v => Math.abs(v - cur) < 0.01);
  if (i < 0) i = MARKER_STEPS.indexOf(1.0);
  i = Math.max(0, Math.min(MARKER_STEPS.length - 1, i + dir));
  app.settings.set('marker_scale', MARKER_STEPS[i]);
  setStatus(`Marker size ${Math.round(MARKER_STEPS[i] * 100)}%`);
  requestDraw();
}

function onSettingsChanged() {
  controller.zoomStepPercent = app.settings.get('zoom_step_percent');
  controller.wheelMode = app.settings.get('wheel_mode');
  controller.uiScale = app.settings.get('ui_touch_mode') ? 1.6 : 1.0;
  controller.markerScale = app.settings.get('marker_scale');
  // The nudge shortcut steps aside when the arrows are the page-turn keys.
  const nav = app.settings.get('page_nav_keys');
  controller.arrowsNavigatePages = nav === 'leftright' || nav === 'updown';
  requestDraw();
}

// ── sheets ────────────────────────────────────────────────────────────────

const SHEET_SIZES = [
  ['Arch A', 9.0, 12.0], ['Arch B', 12.0, 18.0], ['Arch C', 18.0, 24.0],
  ['Arch D', 24.0, 36.0], ['Arch E', 36.0, 48.0], ['Arch E1', 30.0, 42.0],
  ['ANSI A', 8.5, 11.0], ['ANSI B', 11.0, 17.0], ['ANSI C', 17.0, 22.0],
  ['ANSI D', 22.0, 34.0], ['ANSI E', 34.0, 44.0],
];

async function addBlankSheet() {
  const spec = await D.showDialog(close => {
    const form = D.el('div', 'form');
    const size = D.select(SHEET_SIZES.map((s, i) => [String(i), `${s[0]}  (${s[1]}″ × ${s[2]}″)`]), '3');
    D.field(form, 'Sheet size', size);
    const orient = D.select([['land', 'Landscape'], ['port', 'Portrait']], 'land');
    D.field(form, 'Orientation', orient);
    const label = D.input('');
    D.field(form, 'Sheet number', label, 'Optional — e.g. SK-1');
    const name = D.input('');
    D.field(form, 'Sheet title', name);
    return D.dlg({
      title: 'Add Blank Sheet',
      body: form,
      buttons: [
        D.button('Cancel', '', () => close(null)),
        D.button('Add', 'primary', () => close({
          size: SHEET_SIZES[Number(size.value)],
          landscape: orient.value === 'land',
          label: label.value.trim(), name: name.value.trim(),
        })),
      ],
    });
  });
  if (!spec) return;

  const dpi = app.project.dpi;
  const [, shortIn, longIn] = spec.size;
  const wIn = spec.landscape ? longIn : shortIn;
  const hIn = spec.landscape ? shortIn : longIn;
  const c = document.createElement('canvas');
  c.width = Math.round(wIn * dpi);
  c.height = Math.round(hIn * dpi);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);

  const png = await canvasToPng(c);
  // On an empty project there is no "after the current sheet" — index 0 is
  // the only place it can go, and currentPage is still 0 from the reset.
  const at = app.pages.pageCount ? app.currentPage + 1 : 0;
  app.pages.addPage({ kind: 'png', data: png, width: c.width, height: c.height }, at);
  app.project.notePagesInserted(at, 1);
  if (spec.label) app.project.setPageLabel(at, spec.label);
  if (spec.name) app.project.setPageName(at, spec.name);
  c.width = c.height = 0;
  thumbs.refresh(at);
  await goToPage(at);
  setStatus(`Added a blank ${spec.size[0]} sheet`);
}

async function deleteCurrentPage() {
  if (app.pages.pageCount <= 1) {
    await D.alertDialog('Cannot delete', 'A project needs at least one sheet.');
    return;
  }
  const n = (app.project.measurements[app.currentPage] || []).length;
  const ok = await D.confirmDialog(
    'Delete sheet',
    `Delete ${pageFinalLabel(app.currentPage)}?` +
    (n ? `\n\nIt carries ${n} takeoff item${n === 1 ? '' : 's'}, which go with it.` : ''),
    { okLabel: 'Delete sheet', danger: true }
  );
  if (!ok) return;
  const idx = app.currentPage;
  app.pages.removePage(idx);
  app.project.notePageRemoved(idx);
  thumbs.refresh(Math.min(idx, app.pages.pageCount - 1));
  pageImage = null;
  await goToPage(Math.min(idx, app.pages.pageCount - 1));
}

async function reviewSheetLabels() {
  if (!app.pages.pageCount) return;
  await D.showDialog(close => {
    const body = D.el('div');
    const table = D.el('table', 'grid');
    const thead = D.el('thead');
    const hr = D.el('tr');
    for (const h of ['#', 'Sheet number', 'Sheet title']) hr.appendChild(D.el('th', null, h));
    thead.appendChild(hr);
    table.appendChild(thead);
    const tb = D.el('tbody');
    const inputs = [];
    for (let i = 0; i < app.pages.pageCount; i++) {
      const tr = D.el('tr');
      tr.appendChild(D.el('td', null, String(i + 1)));
      const li = D.input(app.project.pageLabel(i));
      const ni = D.input(app.project.pageName(i));
      li.placeholder = app.project.detectedLabel(i) || `Pag: ${i + 1}`;
      for (const n of [li, ni]) {
        n.style.cssText = 'width:100%;background:#1c1c1c;color:#dedede;border:1px solid #303030;border-radius:4px;padding:4px 6px;font:inherit';
      }
      const td1 = D.el('td'); td1.appendChild(li); tr.appendChild(td1);
      const td2 = D.el('td'); td2.appendChild(ni); tr.appendChild(td2);
      inputs.push([li, ni]);
      tb.appendChild(tr);
    }
    table.appendChild(tb);
    body.appendChild(table);
    return D.dlg({
      title: 'Review Sheet Numbers',
      wide: true,
      body,
      buttons: [
        D.button('Cancel', '', () => close(null)),
        D.button('Apply', 'primary', () => {
          app.project.transact('Rename sheets', () => {
            // Only what differs from the detected label is stored as an
            // override, so re-typing what the drawing says clears it.
            const custom = {}, names = {};
            inputs.forEach(([li, ni], i) => {
              const label = li.value.trim();
              const name = ni.value.trim();
              if (label && label !== app.project.detectedLabel(i)
                  && label !== `Pag: ${i + 1}`) custom[String(i)] = label;
              if (name) names[String(i)] = name;
            });
            app.project.metadata.page_labels_custom = custom;
            app.project.metadata.page_names = names;
          });
          thumbs.refresh(app.currentPage);
          syncPageOf();
          itemsPanel.refresh();
          close(true);
        }),
      ],
    });
  });
}

async function openProjectInfo() {
  const md = app.project.metadata;
  const patch = await D.showDialog(close => {
    const form = D.el('div', 'form');
    const f = {};
    const add = (key, label, hint) => {
      f[key] = D.field(form, label, D.input(md[key] || ''), hint);
    };
    add('project_name', 'Project name');
    add('internal_id_number', 'Job number');
    add('client_name', 'Client');
    add('project_address', 'Address');
    add('estimator_name', 'Estimator');
    add('bid_date', 'Bid date');
    add('project_type', 'Project type');
    add('project_status', 'Status');
    const desc = document.createElement('textarea');
    desc.value = md.project_description || '';
    D.field(form, 'Description', desc);
    const notes = document.createElement('textarea');
    notes.value = md.project_notes || '';
    D.field(form, 'Notes', notes);

    const stamps = D.el('div', 'hint');
    stamps.textContent =
      `Created ${md.project_created || '—'}   ·   Last saved ${md.project_modified || '—'}`;
    form.appendChild(D.el('label', null, ''));
    form.appendChild(stamps);

    return D.dlg({
      title: 'Project Info',
      body: form,
      buttons: [
        D.button('Cancel', '', () => close(null)),
        D.button('OK', 'primary', () => {
          const out = {};
          for (const [k, node] of Object.entries(f)) out[k] = node.value.trim();
          out.project_description = desc.value;
          out.project_notes = notes.value;
          close(out);
        }),
      ],
    });
  });
  if (!patch) return;
  app.project.transact('Project info', () => Object.assign(app.project.metadata, patch));
  syncTitle();
}

/**
 * Recently opened projects.
 *
 * Only a list of names and sizes: a browser cannot reopen a file by path, and
 * pretending otherwise would give the user a link that silently does nothing.
 * Picking one opens the file picker with that name as the hint.
 */
const RECENT_KEY = 'ptt.recent.v1';

function noteRecent(file) {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    const entry = {
      name: file.name,
      size: file.size,
      project: app.project.metadata.project_name || '',
      at: new Date().toISOString(),
    };
    const next = [entry, ...list.filter(r => r.name !== entry.name)].slice(0, 12);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* a blocked store is not an error worth surfacing */ }
}

async function showRecent() {
  let list = [];
  try { list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { /* none */ }
  await D.showDialog(close => {
    const body = D.el('div');
    if (!list.length) {
      const p = D.el('div', 'hint', 'Nothing opened in this browser yet.');
      p.style.padding = '12px 0';
      body.appendChild(p);
    } else {
      const note = D.el('div', 'hint');
      note.style.cssText = 'margin-bottom:10px';
      note.textContent =
        'A browser cannot reopen a file from a path, so picking one here opens ' +
        'the file chooser. Drag a project onto the window to skip that step.';
      body.appendChild(note);

      const table = D.el('table', 'grid');
      const tb = D.el('tbody');
      for (const r of list) {
        const tr = D.el('tr');
        const nameCell = D.el('td');
        nameCell.appendChild(D.el('div', null, r.project || r.name));
        const sub = D.el('div', null, r.name);
        sub.style.cssText = 'font-size:10.5px;color:#7d7d7d';
        nameCell.appendChild(sub);
        tr.appendChild(nameCell);
        tr.appendChild(D.el('td', 'num', `${(r.size / 1048576).toFixed(1)} MB`));
        tr.appendChild(D.el('td', null, new Date(r.at).toLocaleDateString('en-US')));
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => { close(true); safeRun('open-project'); });
        tb.appendChild(tr);
      }
      table.appendChild(tb);
      body.appendChild(table);
    }
    return D.dlg({
      title: 'Recent Projects',
      body,
      buttons: [
        D.button('Clear list', '', () => {
          try { localStorage.removeItem(RECENT_KEY); } catch { /* fine */ }
          close(true);
        }),
        D.button('Close', 'primary', () => close(true)),
      ],
    });
  });
}

async function showShortcuts() {
  const rows = [
    ['R', 'Pan / Select'], ['D', 'Measure'], ['A', 'Area'], ['H', 'Slope Roof'],
    ['K', 'Pitch'], ['P', 'Polyline'], ['C', 'Count'], ['W', 'Windows'],
    ['O', 'Doors'],
    ['T', 'Pen'], ['S', 'Highlight'], ['B', 'Box highlight'],
    ['E', 'Erase markup'], ['N', 'Note'],
    ['F', 'Fit to window'], ['1', 'Actual size'],
    ['Esc', 'Cancel the shape in progress, then the selection'],
    ['Enter', 'Finish the shape in progress'],
    ['Double-click', 'Finish a chain, or edit an item in Pan mode'],
    ['Right-click', 'Undo one vertex while drawing, or the item menu in Pan mode'],
    ['Right-drag / Middle-drag', 'Pan, from any tool'],
    ['Shift while drawing', 'Constrain to 45° (not Pitch)'],
    ['Shift while highlighting', 'Keep the stroke straight'],
    ['Wheel', 'Zoom about the cursor'],
    ['Del', 'Delete the selection'],
    ['Arrows', 'Nudge the selection (Shift for 10px)'],
    ['Page Up / Page Down', 'Previous / next sheet'],
    ['Ctrl+Z / Ctrl+Y', 'Undo / redo'],
    ['Ctrl+S', 'Save'], ['Ctrl+O', 'Open'], ['Ctrl+I', 'Import PDF'],
    ['Ctrl+0', 'Normal marker size'],
    ['Ctrl+Shift+[ / ]', 'Smaller / bigger markers'],
  ];
  await D.showDialog(close => {
    const table = D.el('table', 'grid');
    const tb = D.el('tbody');
    for (const [k, v] of rows) {
      const tr = D.el('tr');
      const kd = D.el('td', null, k);
      kd.style.cssText = 'white-space:nowrap;color:#9a9a9a;width:190px';
      tr.appendChild(kd);
      tr.appendChild(D.el('td', null, v));
      tb.appendChild(tr);
    }
    table.appendChild(tb);
    return D.dlg({
      title: 'Keyboard Shortcuts', body: table,
      buttons: [D.button('Close', 'primary', () => close(true))],
    });
  });
}

// ── keyboard ──────────────────────────────────────────────────────────────

document.addEventListener('keydown', ev => {
  if (D.dialogsOpen()) return;
  const t = ev.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;

  const mod = ev.ctrlKey || ev.metaKey;
  if (mod) {
    const k = ev.key.toLowerCase();
    const map = {
      s: ev.shiftKey ? 'save-as' : 'save', o: 'open-project', n: 'new-project',
      i: 'import-pdf', z: 'undo', y: 'redo', '0': 'marker-normal',
    };
    if (k === 'z' && ev.shiftKey) { ev.preventDefault(); safeRun('redo'); return; }
    if (ev.shiftKey && k === '[') { ev.preventDefault(); safeRun('marker-smaller'); return; }
    if (ev.shiftKey && k === ']') { ev.preventDefault(); safeRun('marker-bigger'); return; }
    if (map[k]) { ev.preventDefault(); safeRun(map[k]); return; }
    return;
  }

  if (controller.handleKey(ev)) { ev.preventDefault(); return; }

  const nav = app.settings.get('page_nav_keys');
  const NAV = {
    pageupdown: ['PageUp', 'PageDown'], leftright: ['ArrowLeft', 'ArrowRight'],
    updown: ['ArrowUp', 'ArrowDown'], brackets: ['[', ']'], commaperiod: [',', '.'],
  }[nav] || ['PageUp', 'PageDown'];
  if (ev.key === NAV[0]) { ev.preventDefault(); goToPage(app.currentPage - 1); return; }
  if (ev.key === NAV[1]) { ev.preventDefault(); goToPage(app.currentPage + 1); return; }

  // The desktop's markup keys. T for draw, S for highlight, B for box,
  // E for erase, N for note.
  const MARKUP_KEYS = { T: 'draw', S: 'highlight', B: 'highlight_rect', E: 'erase', N: 'textnote' };
  if (MARKUP_KEYS[ev.key.toUpperCase()]) {
    ev.preventDefault();
    controller.setMode(MARKUP_KEYS[ev.key.toUpperCase()]);
    return;
  }

  const shortcuts = app.settings.get('shortcuts');
  const key = ev.key.toUpperCase();
  for (const [mode, sc] of Object.entries(shortcuts)) {
    if (sc && sc.toUpperCase() === key && TOOLS.some(t => t[0] === mode)) {
      ev.preventDefault();
      controller.setMode(mode);
      return;
    }
  }
  if (key === 'F') { ev.preventDefault(); safeRun('zoom-fit'); }
  if (key === '1') { ev.preventDefault(); safeRun('zoom-100'); }
});

// ── drag and drop ─────────────────────────────────────────────────────────

const veil = $('dropVeil');
let dragDepth = 0;
window.addEventListener('dragenter', ev => {
  if (![...ev.dataTransfer.types].includes('Files')) return;
  ev.preventDefault();
  dragDepth += 1;
  veil.hidden = false;
});
window.addEventListener('dragover', ev => {
  if ([...ev.dataTransfer.types].includes('Files')) ev.preventDefault();
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) veil.hidden = true;
});
window.addEventListener('drop', async ev => {
  ev.preventDefault();
  dragDepth = 0;
  veil.hidden = true;
  const file = ev.dataTransfer.files[0];
  if (!file) return;
  const n = file.name.toLowerCase();
  if (n.endsWith(FILE_EXTENSION) || n.endsWith(LEGACY_EXTENSION)) {
    if (await confirmDiscard()) await loadProjectFile(file);
  } else if (n.endsWith('.pdf')) {
    await importPdfFile(file, { intoOpen: app.pages.pageCount > 0 && await askAppend(file) });
  } else {
    setStatus(`${file.name} is not a takeoff project or a PDF`);
  }
});

async function askAppend(file) {
  return D.confirmDialog(
    'Add to this project?',
    `Add the sheets from ${file.name} to the project that is already open?\n\n` +
    `Choose Cancel to start a new project from it instead.`,
    { okLabel: 'Add to this project' }
  );
}

// ── panel resizing ────────────────────────────────────────────────────────

for (const grip of document.querySelectorAll('.grip')) {
  grip.addEventListener('pointerdown', ev => {
    ev.preventDefault();
    grip.setPointerCapture(ev.pointerId);
    const which = grip.dataset.target;
    const startX = ev.clientX;
    const prop = which === 'thumbs' ? '--thumb-w' : '--items-w';
    const start = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(prop));
    const move = e => {
      const d = which === 'thumbs' ? e.clientX - startX : startX - e.clientX;
      const next = Math.max(140, Math.min(560, start + d));
      document.documentElement.style.setProperty(prop, `${next}px`);
      requestDraw();
    };
    const up = () => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      app.settings.set(which === 'thumbs' ? 'thumb_width' : 'items_width',
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue(prop)));
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    // Without this, a cancelled drag (a browser gesture, a lost pointer) leaves
    // the move handler live and the panel resizes on plain hover.
    grip.addEventListener('pointercancel', up);
  });
}

// ── status, title, chrome ─────────────────────────────────────────────────

let statusTimer = null;
function setStatus(text) {
  $('statusText').textContent = text || '';
  clearTimeout(statusTimer);
  if (text && !text.includes('\n')) {
    statusTimer = setTimeout(() => {
      $('statusText').textContent = HINTS[controller.mode] || 'Ready';
    }, 6000);
  }
}

function syncTitle() {
  const name = (app.project.metadata.project_name || '').trim()
    || app.fileName || 'Untitled';
  $('projTitle').textContent = name;
  $('dirtyDot').hidden = !app.project.dirty;
  document.title = `${app.project.dirty ? '• ' : ''}${name} — Professional Takeoff Tools`;
}

function syncHistoryButtons() {
  $('undoBtn').disabled = !app.project.canUndo;
  $('redoBtn').disabled = !app.project.canRedo;
  $('undoBtn').title = app.project.canUndo ? `Undo ${app.project.undoLabel}` : 'Nothing to undo';
  $('redoBtn').title = app.project.canRedo ? `Redo ${app.project.redoLabel}` : 'Nothing to redo';
}

function showEmptyState() { $('emptyState').hidden = false; }
function hideEmptyState() { $('emptyState').hidden = true; }

function showProgress(label, done, total, sub = '') {
  $('progress').hidden = false;
  $('progressLabel').textContent = label;
  $('progressFill').style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';
  $('progressSub').textContent = total > 1 ? `${done} / ${total}${sub ? '  ·  ' + sub : ''}` : sub;
}
function hideProgress() { $('progress').hidden = true; }

window.addEventListener('beforeunload', ev => {
  if (app.project.dirty) { ev.preventDefault(); ev.returnValue = ''; }
});

// ── what this browser can do ──────────────────────────────────────────────

/**
 * Check the capabilities the app actually depends on, once, at startup.
 *
 * Two classes of answer. A missing REQUIRED feature means projects will not
 * open at all, and the user needs to know that before they try rather than
 * after. A missing optional one changes how something behaves — Firefox has no
 * File System Access API, so Save writes a download instead of overwriting the
 * file in place — and that is worth one line, not a dialog.
 */
function checkCapabilities() {
  const missing = [];
  if (typeof DecompressionStream === 'undefined' && !globalThis.pako) {
    missing.push('reading compressed project data (DecompressionStream)');
  }
  if (typeof createImageBitmap === 'undefined') missing.push('decoding sheet images');
  if (typeof structuredClone === 'undefined') missing.push('undo history (structuredClone)');

  if (missing.length) {
    D.alertDialog('This browser is too old', [
      'Professional Takeoff Tools needs:',
      '',
      ...missing.map(m => `  · ${m}`),
      '',
      'Chrome or Edge 111+, Firefox 113+, or Safari 16.4+ will work.',
    ].join('\n'));
    return false;
  }

  const notes = [];
  if (!canUseFsApi) {
    // Firefox and Safari. Not a defect — just a different shape for saving.
    notes.push('Save downloads a new copy of the project rather than overwriting the original — your browser does not let a page write back to a file it opened.');
  }
  if (typeof OffscreenCanvas === 'undefined') {
    notes.push('Blank sheets and PDF import will be a little slower here.');
  }
  if (notes.length) {
    app.capabilityNotes = notes;
    console.info(['Takeoff Tools — browser notes:', ...notes.map(n => `· ${n}`)].join('\n'));
  }
  return true;
}

/** Everything the browser does and does not support, for the About box. */
function capabilityReport() {
  const yes = v => (v ? 'yes' : 'no');
  return [
    ['Compressed project data', yes(typeof DecompressionStream !== 'undefined')],
    ['Save in place', yes(canUseFsApi)],
    ['Off-screen canvas', yes(typeof OffscreenCanvas !== 'undefined')],
    ['Image decoding', yes(typeof createImageBitmap !== 'undefined')],
  ];
}

// ── start ─────────────────────────────────────────────────────────────────

checkCapabilities();
buildToolButtons();
buildScaleSelect();
syncScaleSelect();
wireMenus();
// A phone has 844px of height and the markup row costs 34 of them for tools
// most jobs never use. It is one tap away under View ▸ Markup Toolbar.
if (window.matchMedia('(max-width: 720px)').matches) $('markupBar').hidden = true;
MOBILE_Q.addEventListener('change', () => { syncMobileBar(); requestDraw(); });
$('scrim').addEventListener('click', closeDrawers);
syncMobileBar();
syncHistoryButtons();
syncTitle();
onSettingsChanged();
setStatus(canUseFsApi
  ? 'Open a .takeoff project, or start from a PDF.'
  : 'Open a .takeoff project, or start from a PDF.  ·  Save downloads a copy here — this browser cannot write back to the original file.');
requestDraw();

// The catalog backs the name box's autocomplete; a failure to load it must
// leave the app fully usable, so it is warmed in the background and never
// awaited by anything on the critical path.
loadCatalog().then(n => {
  if (n) setStatus(`Materials catalog ready — ${n.toLocaleString('en-US')} items`);
}).catch(() => {});

// Offline. Registered late and never awaited: a worker that fails to
// register must not stop the app from opening a project.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  // Was a worker already driving this page? If so, a NEW one taking over
  // means the app was updated underneath us and the HTML now on screen is
  // the old one. Reload once so the markup, the stylesheet and the modules
  // are all the same version — a mismatched set is how a page ends up with
  // buttons that cannot be clicked.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;   // first install: nothing to replace
    reloading = true;
    location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', document.baseURI))
      .catch(err => console.warn('offline support unavailable', err));
  });
}

// Expose the live objects for the portal embed and for debugging.
// The live objects, for the portal embed and for driving the app in tests.
window.TakeoffApp = {
  app, viewport, renderer, controller, itemsPanel, thumbs,
  goToPage, loadProjectFile, importPdfFile, saveProject, runAction, newProject,
  requestDraw, pageFinalLabel,
};
