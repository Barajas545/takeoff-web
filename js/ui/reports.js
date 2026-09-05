// reports.js — the Report Center, and every export that leaves the app.
//
// ONE ROW MODEL FEEDS EVERYTHING. collectRows() produces the flat list the CSV
// and the workbook are built from, and collectItems() produces the grouped
// model the printable reports use. Both apply the same filters and the same
// skips, so what the estimator sees on screen is what lands in the file.
//
// The column names, the type labels and the number formats below are the
// desktop app's, character for character. A takeoff exported from the web and
// one exported from the desktop have to line up in the same spreadsheet.

import * as D from './dialogs.js';
import {
  notesWithPurpose, expandAssembly, assemblyTotal, reportQty, tilePatternLabel,
} from '../core/measure.js';
import { comparePageKeys, STANDALONE_PAGE } from '../core/takeoff-file.js';
import { writeWorkbook, cell } from '../core/xlsx.js';
import * as H from './report-html.js';

export const REPORTS = [
  ['estimate', 'Estimate Summary',
    'Everything in the project — Labor and Material sections, grouped and subtotaled'],
  ['mto', 'Material Takeoff',
    'Material items and associated materials only — the purchasing list'],
  ['matlist', 'Material List',
    'The printed list for the yard — banded by floor and room, with a Purpose column'],
  ['labor', 'Labor Estimate',
    'Labor items only — the scope you price labor from'],
  ['rollup', 'Quantity Summary',
    'Same-named quantities merged into one line each — quick totals'],
  ['windows', 'Window Schedule', 'Every window pin with mark and dimensions'],
  ['doors', 'Door Schedule', 'Every door pin with mark and dimensions'],
];

const SUBTITLES = {
  estimate: 'Complete estimate — labor and material',
  mto: 'Material takeoff — purchasing quantities',
  labor: 'Labor estimate — scope quantities',
  rollup: 'Merged quantities across the whole selection',
  windows: 'Window schedule',
  doors: 'Door schedule',
  matlist: '',
};

const TYPE_LABEL = {
  distance: 'Lineal', polyline: 'Lineal', area: 'Area', slope_area: 'Slope Area',
  grid: 'Grid', tile: 'Tile', count: 'Item', linear_count: 'Item',
  standalone: 'Item', window: 'Window', door: 'Door',
};

/** Types that produce no export row of their own. Their materials still do. */
const NO_ROW_TYPES = new Set(['textnote', 'page_ref', 'pitch']);

// ── the flat row model ────────────────────────────────────────────────────

function g(v) { return String(parseFloat((Number(v) || 0).toPrecision(6))); }
function commas(n) { return Math.trunc(Number(n) || 0).toLocaleString('en-US'); }

function tileBlurb(m) {
  let t = `${commas(m.tiles_needed || 0)} tiles ` +
    `(${g(m.tile_w_in ?? 12)}″×${g(m.tile_h_in ?? 12)}″ ` +
    `${tilePatternLabel(m.pattern || 'grid')}, +${g(m.waste_pct || 0)}% waste)`;
  if (m.boxes) t += ` · ${m.boxes} boxes`;
  return t;
}

function openingDims(m, kind) {
  const p = kind === 'window' ? 'win_' : 'door_';
  const w = m[p + 'width'] || '', h = m[p + 'height'] || '';
  if (!w && !h) return '';
  return `${w} × ${h}`.replace(/^\s*×\s*|\s*×\s*$/g, '').trim();
}

function joinDesc(...parts) {
  return parts.filter(Boolean).join('  ');
}

/** The description prefix a type carries into every report and export. */
function typePrefix(m) {
  switch (m.type) {
    case 'tile': return tileBlurb(m);
    case 'slope_area': return `pitch ${g(m.pitch ?? 4)}:12`;
    case 'linear_count': return `@ ${g(m.spacing_in ?? 12)}″ spacing`;
    case 'window': case 'door': return openingDims(m, m.type);
    case 'grid': return `${Number(m.cols) || 1}×${Number(m.rows) || 1} cells`;
    default: return '';
  }
}

/**
 * The flat rows behind CSV and the workbook's "All Items" sheet.
 *
 * @param {import('../core/project.js').Project} project
 * @param {(idx:number)=>string} pageLabel
 * @param {object} [filters] {floor, category, costType}
 */
export function collectRows(project, pageLabel, filters = {}) {
  const rows = [];
  const keys = Object.keys(project.measurements).sort(comparePageKeys);

  for (const key of keys) {
    const pageIdx = Number(key);
    const sheet = pageIdx < 0 ? '—' : pageLabel(pageIdx);
    for (const m of project.measurements[key]) {
      if (m.group_child) continue;
      if (!passes(m, filters)) continue;

      const floor = m.floor_level || '';
      const cat = m.category || '';
      const sub = m.sub_category || '';
      const notes = notesWithPurpose(m);
      const name = m.name || m.label || '';
      const parentVal = Number(m.value) || 0;

      if (!NO_ROW_TYPES.has(m.type)) {
        const row = {
          ItemName: name,
          ItemDescription: notes,
          ItemFloorLevel: floor,
          ItemLocation: m.type === 'standalone' ? '—' : sheet,
          ItemCategory: cat,
          ItemSubCategory: sub,
          ItemCostType: (m.cost_type || 'material') === 'labor' ? 'Labor' : 'Material',
          ItemType: TYPE_LABEL[m.type] || '',
          ItemArea: null, ItemDistance: null, ItemCount: null,
          _rate: Number(m.unit_cost) || 0,
        };
        switch (m.type) {
          case 'distance': case 'polyline':
            row.ItemDistance = round4(m.value); break;
          case 'area': case 'slope_area': case 'grid':
            row.ItemArea = round4(m.value); break;
          case 'tile':
            row.ItemArea = round4(m.value);
            row.ItemDescription = joinDesc(tileBlurb(m), notes);
            break;
          case 'count':
            row.ItemCount = (m.points || []).length; break;
          case 'standalone':
            row.ItemCount = Number(m.qty) || 0; break;
          case 'linear_count':
            row.ItemCount = Math.trunc(Number(m.value) || 0);
            row.ItemDescription = joinDesc(`@ ${g(m.spacing_in ?? 12)}″ spacing`, notes);
            break;
          case 'window': case 'door':
            row.ItemCount = 1;
            row.ItemDescription = joinDesc(openingDims(m, m.type), notes);
            break;
          default: break;
        }
        if (row.ItemType) rows.push(row);
      }

      // Associated materials are emitted for EVERY measurement, outside the
      // type dispatch — a material hung off a text note still has to be bought.
      for (const ai of m.associated_items || []) {
        rows.push({
          ItemName: ai.name || '',
          ItemDescription: notesWithPurpose(ai),
          ItemFloorLevel: floor,
          ItemLocation: sheet,
          ItemCategory: ai.category || cat || '',
          ItemSubCategory: ai.sub_category || sub || '',
          ItemCostType: (ai.cost_type || 'material') === 'labor' ? 'Labor' : 'Material',
          ItemType: 'Material',
          ItemArea: null, ItemDistance: null,
          ItemCount: round4(assemblyTotal(ai, parentVal)),
          ParentItemName: name,
          _rate: Number(ai.unit_cost) || 0,
        });
      }
    }
  }

  // The pricing pass. The quantity is whichever column is truthy, in the order
  // Area → Distance → Count; a zero rate or zero quantity leaves both money
  // columns EMPTY rather than printing $0.00 into a bid.
  for (const r of rows) {
    const qty = r.ItemArea || r.ItemDistance || r.ItemCount || 0;
    const rate = r._rate || 0;
    delete r._rate;
    r.ItemUnitCost = rate ? round4(rate) : null;
    r.ItemTotalCost = (rate && qty) ? Math.round(qty * rate * 100) / 100 : null;
  }
  return rows;
}

function round4(v) {
  const n = Number(v) || 0;
  return Math.round(n * 10000) / 10000;
}

function passes(m, { floor, category, costType } = {}) {
  if (floor != null && (m.floor_level || '').trim() !== floor) return false;
  if (category != null && (m.category || '').trim() !== category) return false;
  if (costType && costType !== 'all' && (m.cost_type || 'material') !== costType) return false;
  return true;
}

// ── the grouped model behind the printable reports ────────────────────────

/**
 * One entry per item and per associated material, carrying everything a
 * report row needs. Text notes, callouts and child shapes never appear.
 */
export function collectItems(project, pageLabel, filters = {}) {
  const out = [];
  const keys = Object.keys(project.measurements).sort(comparePageKeys);

  for (const key of keys) {
    const pageIdx = Number(key);
    const sheet = pageIdx < 0 ? '—' : pageLabel(pageIdx);
    for (const m of project.measurements[key]) {
      if (m.group_child) continue;
      if (NO_ROW_TYPES.has(m.type)) continue;
      if (!passes(m, filters)) continue;
      const q = reportQty(m);
      if (!q) continue;

      const parts = [];
      // The per-type prefix the CSV and the workbook already carry: the tile
      // blurb, the array spacing, the opening's dimensions, the roof pitch.
      // Without it the printed reports held less than the exports did.
      const prefix = typePrefix(m);
      if (prefix) parts.push(prefix);
      const nShapes = Number(m.group_count) || 1;
      if (nShapes > 1) parts.push(`${nShapes} shapes`);
      const sc = String(m.scale || '').trim();
      if (sc) parts.push(`${sc} scale`);

      const entry = {
        kind: 'item',
        name: m.name || m.label || '',
        notes: notesWithPurpose(m),
        purpose: String(m.purpose || '').trim(),
        floor: m.floor_level || '',
        category: m.category || '',
        sub: m.sub_category || '',
        costType: m.cost_type || 'material',
        type: m.type,
        typeLabel: TYPE_LABEL[m.type] || '',
        qty: q.qty,
        unit: q.unit,
        rate: Number(m.unit_cost) || 0,
        cost: (Number(m.value) || 0) * (Number(m.unit_cost) || 0),
        sheet,
        detail: parts.join('  ·  '),
        // A crossed outline is flagged in the report rather than silently
        // totalled — the shoelace formula reads a bow-tie as near zero.
        selfIntersects: !!m.self_intersects,
        src: m,
        materials: [],
      };
      if (m.type === 'standalone') entry.cost = q.qty * entry.rate;
      if (m.type === 'count') entry.cost = q.qty * entry.rate;

      for (const line of expandAssembly(m)) {
        entry.materials.push({
          kind: 'material',
          name: line.name || '',
          notes: notesWithPurpose(line),
          purpose: String(line.purpose || '').trim(),
          floor: line.floor_level || entry.floor,
          category: line.category || entry.category,
          sub: line.sub_category || entry.sub,
          costType: line.cost_type || 'material',
          qty: line.total,
          unit: line.unit || 'each',
          rate: Number(line.unit_cost) || 0,
          cost: line.cost,
          sheet,
          parent: entry.name,
        });
      }
      out.push(entry);
    }
  }
  return out;
}

// ── CSV ───────────────────────────────────────────────────────────────────

const CSV_COLUMNS = [
  'ItemName', 'ItemDescription', 'ItemFloorLevel', 'ItemLocation', 'ItemCategory',
  'ItemSubCategory', 'ItemCostType', 'ItemType', 'ItemArea', 'ItemDistance',
  'ItemCount', 'ItemUnitCost', 'ItemTotalCost',
];

function csvField(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  // Quote only when the field would otherwise break the row — matching
  // Python's csv.QUOTE_MINIMAL, so the two exports diff cleanly.
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildCsv(rows) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const r of rows) {
    lines.push(CSV_COLUMNS.map(k => csvField(r[k])).join(','));
  }
  // \r\n line endings and a UTF-8 BOM, so Excel opens it without a wizard.
  return `﻿${lines.join('\r\n')}\r\n`;
}

export function exportCsv(project, pageLabel, filters = {}) {
  const rows = collectRows(project, pageLabel, filters);
  if (!rows.length) {
    D.alertDialog('Nothing to export', 'No measurements found.');
    return;
  }
  download(new Blob([buildCsv(rows)], { type: 'text/csv;charset=utf-8' }),
    `${baseName(project)}.csv`);
}

// ── Excel ─────────────────────────────────────────────────────────────────

export async function exportWorkbook(project, pageLabel, filters = {}) {
  const items = collectItems(project, pageLabel, filters);
  const rows = collectRows(project, pageLabel, filters);
  if (!items.length && !rows.length) {
    await D.alertDialog('Nothing to export', 'No measurements found.');
    return;
  }
  const md = project.metadata;

  // Sheet 1 — Takeoff: every item, with its materials indented beneath it.
  const s1 = [];
  s1.push([cell(md.project_name || 'Takeoff', 'title', 7)]);
  s1.push([cell([md.internal_id_number, md.client_name, md.project_address]
    .filter(Boolean).join('   ·   '), 'subtitle', 7)]);
  s1.push([]);
  s1.push([
    cell('Item', 'header'), cell('Type', 'header'), cell('Floor', 'header'),
    cell('Category', 'header'), cell('Sheet', 'header'),
    cell('Qty', 'header'), cell('Unit', 'header'),
    cell('Unit Cost', 'header'), cell('Total', 'header'), cell('Notes', 'header'),
  ]);

  let grand = 0;
  for (const it of items) {
    s1.push([
      it.name, it.typeLabel, it.floor, it.category, it.sheet,
      cell(round4(it.qty), 'num'), it.unit,
      cell(it.rate || null, 'money'), cell(it.cost || null, 'money'), it.notes,
    ]);
    grand += it.cost;
    for (const mat of it.materials) {
      s1.push([
        cell(`    ${mat.name}`, 'indent'), cell('Material', 'indent'),
        cell(mat.floor, 'indent'), cell(mat.category, 'indent'), cell(mat.sheet, 'indent'),
        cell(round4(mat.qty), 'num'), mat.unit,
        cell(mat.rate || null, 'money'), cell(mat.cost || null, 'money'),
        cell(mat.notes, 'indent'),
      ]);
      grand += mat.cost;
    }
  }
  s1.push([]);
  s1.push([
    cell('GRAND TOTAL', 'grand'), cell('', 'grand'), cell('', 'grand'),
    cell('', 'grand'), cell('', 'grand'), cell('', 'grand'), cell('', 'grand'),
    cell('', 'grand'), cell(grand || null, 'moneyGrand'), cell('', 'grand'),
  ]);

  // Sheet 2 — Materials: one row per associated material.
  const s2 = [[
    cell('Parent Item', 'header'), cell('Material', 'header'),
    cell('Floor', 'header'), cell('Category', 'header'), cell('Sub-Category', 'header'),
    cell('Qty', 'header'), cell('Unit', 'header'),
    cell('Unit Cost', 'header'), cell('Total', 'header'), cell('Notes', 'header'),
  ]];
  let matTotal = 0;
  for (const it of items) {
    for (const mat of it.materials) {
      s2.push([
        mat.parent, mat.name, mat.floor, mat.category, mat.sub,
        cell(round4(mat.qty), 'num'), mat.unit,
        cell(mat.rate || null, 'money'), cell(mat.cost || null, 'money'), mat.notes,
      ]);
      matTotal += mat.cost;
    }
  }
  if (s2.length > 1) {
    s2.push([]);
    s2.push([
      cell('TOTAL', 'grand'), cell('', 'grand'), cell('', 'grand'), cell('', 'grand'),
      cell('', 'grand'), cell('', 'grand'), cell('', 'grand'), cell('', 'grand'),
      cell(matTotal || null, 'moneyGrand'), cell('', 'grand'),
    ]);
  }

  // Sheet 3 — All Items: the flat model, for anyone doing their own analysis.
  const s3 = [CSV_COLUMNS.map(c => cell(c, 'header'))];
  for (const r of rows) {
    s3.push(CSV_COLUMNS.map(k => {
      const v = r[k];
      if (v === null || v === undefined) return '';
      if (k === 'ItemUnitCost' || k === 'ItemTotalCost') return cell(v, 'money');
      if (typeof v === 'number') return cell(v, 'num');
      return v;
    }));
  }

  const blob = writeWorkbook([
    { name: 'Takeoff', rows: s1, cols: [34, 12, 14, 18, 12, 11, 8, 11, 12, 40], freeze: 4 },
    { name: 'Materials', rows: s2, cols: [30, 30, 14, 18, 16, 11, 8, 11, 12, 34], freeze: 1 },
    { name: 'All Items', rows: s3, cols: [30, 40, 14, 12, 18, 16, 11, 11, 11, 11, 11, 11, 12], freeze: 1 },
  ]);
  download(blob, `${baseName(project)}.xlsx`);
}

// ── the Report Center ─────────────────────────────────────────────────────

export async function openReportCenter(project, pageLabel) {
  const floors = distinct(project, 'floor_level');
  const cats = distinct(project, 'category');

  await D.showDialog(close => {
    const body = D.el('div');
    const layout = D.el('div');
    layout.style.cssText = 'display:grid;grid-template-columns:250px 1fr;gap:14px;min-height:56vh';

    // Left: the report list.
    const list = D.el('div');
    list.style.cssText = 'border:1px solid #2c2c2c;border-radius:6px;overflow:auto';
    let selected = 'estimate';
    const rebuildList = () => {
      list.textContent = '';
      for (const [key, label, tip] of REPORTS) {
        const b = document.createElement('button');
        b.style.cssText =
          'display:block;width:100%;text-align:left;border:0;padding:9px 11px;cursor:pointer;' +
          `background:${key === selected ? 'var(--select)' : 'transparent'};` +
          'color:var(--text);font:inherit;font-size:12.5px';
        b.textContent = label;
        b.title = tip;
        b.addEventListener('click', () => { selected = key; rebuildList(); preview(); });
        list.appendChild(b);
      }
    };

    // Right: options and a live preview.
    const right = D.el('div');
    right.style.cssText = 'display:flex;flex-direction:column;gap:10px;min-width:0';

    const opts = D.el('div');
    opts.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;align-items:center';
    const floorSel = D.select([[' ALL', 'All Floors'],
      ...floors.map(f => [f, f || '(No Floor Level)'])], ' ALL');
    const tradeSel = D.select([[' ALL', 'All Trades'],
      ...cats.map(c => [c, c || '(Uncategorized)'])], ' ALL');
    const groupSel = D.select([['ft', 'Group: Floor → Trade'], ['tf', 'Group: Trade → Floor']], 'ft');
    for (const s of [floorSel, tradeSel, groupSel]) s.className = 'tb-select';
    const checks = {};
    const addCheck = (key, label, on) => {
      const l = D.el('label');
      l.style.cssText = 'display:flex;gap:4px;align-items:center;font-size:11.5px;color:#bdbdbd';
      const c = D.input('', 'checkbox');
      c.checked = on;
      c.addEventListener('change', preview);
      checks[key] = c;
      l.append(c, D.el('span', null, label));
      opts.appendChild(l);
    };
    opts.append(floorSel, tradeSel, groupSel);
    addCheck('notes', 'Notes', true);
    addCheck('sheets', 'Sheet refs', true);
    addCheck('mats', 'Materials', true);
    addCheck('subs', 'Subtotals', true);
    addCheck('costs', 'Costs ($)', true);
    addCheck('totalsOnly', 'Totals only', false);
    for (const s of [floorSel, tradeSel, groupSel]) s.addEventListener('change', preview);
    right.appendChild(opts);

    const frame = D.el('div');
    frame.style.cssText =
      'flex:1;overflow:auto;background:#fff;color:#111;border-radius:6px;padding:18px;min-height:0';
    right.appendChild(frame);

    let lastHtml = '';
    function preview() {
      const filters = {
        floor: floorSel.value === ' ALL' ? null : floorSel.value,
        category: tradeSel.value === ' ALL' ? null : tradeSel.value,
      };
      const options = {
        groupBy: groupSel.value,
        notes: checks.notes.checked,
        sheets: checks.sheets.checked,
        materials: checks.mats.checked,
        subtotals: checks.subs.checked,
        costs: checks.costs.checked,
        totalsOnly: checks.totalsOnly.checked,
      };
      lastHtml = buildReportHtml(project, pageLabel, selected, filters, options);
      frame.innerHTML = lastHtml;
    }

    layout.append(list, right);
    body.appendChild(layout);
    rebuildList();
    preview();

    return D.dlg({
      title: 'Report Center',
      wide: true,
      body,
      buttons: [
        D.button('Print / PDF', '', () => printHtml(lastHtml)),
        D.button('Export CSV', '', () => exportCsv(project, pageLabel)),
        D.button('Export Excel', '', () => exportWorkbook(project, pageLabel)),
        D.button('Close', 'primary', () => close(true)),
      ],
    });
  });
}

function distinct(project, field) {
  const seen = new Set();
  for (const [, m] of project.allItems()) {
    if (m.group_child) continue;
    seen.add(String(m[field] || '').trim());
  }
  return [...seen].sort((a, b) => (a === '') - (b === '') || a.localeCompare(b));
}

// ── report HTML ───────────────────────────────────────────────────────────

/**
 * The rows a purchasing or labor document is made of.
 *
 * THE COST TYPE IS NOT A FILTER ON THE PARENT. An estimator hangs labor off a
 * measured material item — "Ext Wall, 1,240 sq ft" carrying "Framing labor,
 * 0.35 hr/sf" — which is the ordinary way this app is used. Filtering parents
 * by cost type dropped that item and its labor line with it, so the Labor
 * Estimate came out EMPTY on exactly the projects it exists for.
 *
 * So: keep parents of the wanted type, and PROMOTE every matching material to
 * a row of its own under its OWN floor and trade. A purchasing list has to
 * total studs and sheets, not the square feet of the wall they go into.
 */
function flattenFor(items, wantType) {
  const out = [];
  for (const it of items) {
    if (it.costType === wantType) out.push({ ...it, materials: [] });
    for (const mat of it.materials) {
      if (mat.costType !== wantType) continue;
      out.push({
        ...mat,
        type: it.type,
        typeLabel: 'Material',
        detail: it.name ? `for ${it.name}` : '',
        standaloneMat: true,
        materials: [],
      });
    }
  }
  return out;
}

export function buildReportHtml(project, pageLabel, key, filters, options) {
  const md = project.metadata;
  const title = (REPORTS.find(r => r[0] === key) || [])[1] || 'Report';

  // Always collect everything; the cost split happens after the materials have
  // been promoted, never before.
  const all = collectItems(project, pageLabel, { ...filters, costType: 'all' });

  if (key === 'matlist') {
    return H.matListHtml(md, flattenFor(all, 'material'), options);
  }

  const head = H.docHeader(md, title, SUBTITLES[key]);
  const items = key === 'mto' ? flattenFor(all, 'material')
    : key === 'labor' ? flattenFor(all, 'labor')
    : all;

  if (!items.length) {
    return head + '<p style="color:#6a7480"><i>Nothing matches the current filters.</i></p></div>';
  }
  if (key === 'windows') return head + H.scheduleHtml(items, 'window');
  if (key === 'doors') return head + H.scheduleHtml(items, 'door');
  if (key === 'rollup') return head + H.rollupHtml(items, options);
  // The promoted lists already hold their materials as rows, so the nesting
  // pass must not run again over them.
  const opts = (key === 'mto' || key === 'labor')
    ? { ...options, materials: false } : options;
  return head + H.groupedHtml(items, opts);
}

function printHtml(html) {
  const w = window.open('', '_blank');
  if (!w) {
    D.alertDialog('Popup blocked',
      'The print window could not open. Allow popups for this site and try again.');
    return;
  }
  w.document.write('<!doctype html><html><head><meta charset="utf-8">' +
    '<title>Takeoff Report</title></head><body>' + html + '</body></html>');
  w.document.close();
  // Give the styles a beat to apply before the print dialog measures the page.
  w.addEventListener('load', () => setTimeout(() => w.print(), 120));
}

// ── shared ────────────────────────────────────────────────────────────────

function baseName(project) {
  const n = (project.metadata.project_name || '').trim() || 'Takeoff';
  return n.replace(/[<>:"/\\|?*]+/g, '_');
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export { STANDALONE_PAGE };
