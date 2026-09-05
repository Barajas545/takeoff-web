// settings.js — per-user preferences, kept in this browser.
//
// These are about this screen and these eyes, never about the project: nothing
// here is written into a .takeoff file. Defaults mirror the desktop app's
// DEFAULT_SETTINGS so the two builds behave the same out of the box.
//
// A NOTE ON DEFAULTS, learned the hard way on the desktop side: changing a
// default value never reaches anyone who already has the app, because their
// stored settings already carry the old value. When a default needs to change
// in a way that matters, introduce a NEW key instead of editing an old one.

import * as D from './dialogs.js';
import { DEFAULT_DPI } from '../core/units.js';

const STORAGE_KEY = 'ptt.settings.v1';

export const DEFAULT_SETTINGS = {
  import_dpi: DEFAULT_DPI,
  default_zoom_mode: 'fit',        // fit | 100 | width
  marker_scale: 1.0,               // clamped 0.6–2.2 by the marker layer
  zoom_step_percent: 15,
  wheel_mode: 'zoom',              // zoom (CAD style) | scroll (touchpad style)
  background_color: '#1e1e1e',
  ui_touch_mode: false,
  page_nav_keys: 'pageupdown',
  thumb_width: 190,
  items_width: 300,
  thumb_compact: false,
  distance_precision: '1/2',
  autosave_enabled: true,
  autosave_interval_minutes: 5,
  // Company / letterhead — printed on reports.
  company_name: '',
  company_address: '',
  company_phone: '',
  company_email: '',
  company_license: '',
  shortcuts: {
    pan: 'R', distance: 'D', area: 'A', polyline: 'P', count: 'C',
    window: 'W', door: 'O', slope_area: 'H', pitch: 'K',
  },
};

export const PAGE_NAV_PRESETS = [
  ['pageupdown', 'Page Up / Page Down'],
  ['leftright', 'Left / Right arrows'],
  ['updown', 'Up / Down arrows'],
  ['brackets', '[  and  ]'],
  ['commaperiod', ',  and  .'],
];

export class Settings {
  constructor() {
    this.values = { ...DEFAULT_SETTINGS };
    this.load();
  }

  load() {
    // A private window, cleared site data or a browser set to block storage
    // all read as "no settings", which is ordinary. Never let it be an error.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw);
        this.values = {
          ...DEFAULT_SETTINGS, ...stored,
          shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...(stored.shortcuts || {}) },
        };
      }
    } catch { /* defaults stand */ }
    this._applyChrome();
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch { /* a full or blocked store must not break the app */ }
  }

  get(key) { return this.values[key]; }

  set(key, value) {
    this.values[key] = value;
    this.save();
    this._applyChrome();
  }

  _applyChrome() {
    const r = document.documentElement;
    r.style.setProperty('--thumb-w', `${this.values.thumb_width}px`);
    r.style.setProperty('--items-w', `${this.values.items_width}px`);
    r.style.setProperty('--canvas-bg', this.values.background_color);
  }

  /** The settings form. Resolves once, after the user closes it. */
  async open(onChange) {
    const v = this.values;
    const patch = await D.showDialog(close => {
      const form = D.el('div', 'form');

      const dpi = D.field(form, 'Import resolution',
        D.input(String(v.import_dpi), 'number', { min: '72', max: '600', step: '25' }),
        '72 = fast and small · 150 = balanced · 300 = high quality · 600 = max. ' +
        'Only affects PDFs imported from now on.');

      const zoomMode = D.field(form, 'Open sheets at',
        D.select([['fit', 'Fit to window'], ['100', 'Actual size'], ['width', 'Fit width']],
          v.default_zoom_mode));

      const wheel = D.field(form, 'Mouse wheel',
        D.select([['zoom', 'Zooms (CAD style)'], ['scroll', 'Scrolls (touchpad style)']],
          v.wheel_mode),
        'Ctrl and the wheel always zooms, whichever this is set to.');

      const zoomStep = D.field(form, 'Zoom per tick',
        D.input(String(v.zoom_step_percent), 'number', { min: '2', max: '50', step: '1' }));

      const marker = D.field(form, 'Marker size',
        D.input(String(v.marker_scale), 'number', { min: '0.6', max: '2.2', step: '0.05' }),
        'Count bubbles and window/door symbols. 1.0 is as designed.');

      const bg = D.field(form, 'Canvas background', D.input(v.background_color, 'color'));

      const nav = D.field(form, 'Page keys', D.select(PAGE_NAV_PRESETS, v.page_nav_keys));

      const precision = D.field(form, 'Measure precision',
        D.select(['Nearest Inch', 'Inches Only', '1/2', '1/8', '1/16'], v.distance_precision));

      const touch = D.input('', 'checkbox');
      touch.checked = !!v.ui_touch_mode;
      const touchWrap = D.el('div', 'radio-row');
      const tl = D.el('label');
      tl.appendChild(touch);
      tl.appendChild(D.el('span', null, 'Bigger buttons and grab targets'));
      touchWrap.appendChild(tl);
      D.field(form, 'Touch mode', touchWrap);

      const sep = D.el('div', 'full');
      sep.style.cssText = 'border-top:1px solid #333;margin:8px 0 2px';
      form.appendChild(sep);
      const head = D.el('div', 'full');
      head.style.cssText = 'font-size:11px;color:#606060;letter-spacing:.5px;font-weight:700';
      head.textContent = 'COMPANY — printed on reports';
      form.appendChild(head);

      const cName = D.field(form, 'Company', D.input(v.company_name));
      const cAddr = D.field(form, 'Address', D.input(v.company_address));
      const cPhone = D.field(form, 'Phone', D.input(v.company_phone));
      const cEmail = D.field(form, 'Email', D.input(v.company_email));
      const cLic = D.field(form, 'Licence #', D.input(v.company_license));

      return D.dlg({
        title: 'Settings',
        body: form,
        buttons: [
          D.button('Cancel', '', () => close(null)),
          D.button('OK', 'primary', () => close({
            import_dpi: clamp(Number(dpi.value) || DEFAULT_DPI, 72, 600),
            default_zoom_mode: zoomMode.value,
            wheel_mode: wheel.value,
            zoom_step_percent: clamp(Number(zoomStep.value) || 15, 2, 50),
            marker_scale: clamp(Number(marker.value) || 1, 0.6, 2.2),
            background_color: bg.value,
            page_nav_keys: nav.value,
            distance_precision: precision.value,
            ui_touch_mode: touch.checked,
            company_name: cName.value.trim(),
            company_address: cAddr.value.trim(),
            company_phone: cPhone.value.trim(),
            company_email: cEmail.value.trim(),
            company_license: cLic.value.trim(),
          })),
        ],
      });
    });
    if (!patch) return false;
    Object.assign(this.values, patch);
    this.save();
    this._applyChrome();
    onChange?.();
    return true;
  }
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
