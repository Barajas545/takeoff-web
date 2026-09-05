// units.js — scale, calibration and every number the app prints.
//
// SCALE MODEL, and the invariant the whole program rests on:
//
//   Geometry is stored in PAGE PIXELS at the project's import DPI (150 by
//   default). A length in feet is pixels / ppf, where
//
//       ppf = dpi × inches_per_unit / feet_per_unit
//
//   so 1/4" = 1'-0" at 150 DPI is 150 × 0.25 / 1 = 37.5 pixels per foot.
//
//   ppf BELONGS TO THE SHEET, not to the document, and every item stamps the
//   ppf it was drawn at into itself when it is created. Readers must use the
//   item's own stamp, never re-resolve the page's current scale at paint or
//   report time. Restating a sheet after work has been done on it would
//   otherwise silently re-value measurements the estimator was not even
//   looking at, and a 320 LF wall would quietly become 160 LF inside a bid.

export const DEFAULT_DPI = 150;

/** pixels_per_foot = dpi × inches_per_unit / feet_per_unit */
export function computePixelsPerFoot(dpi, inchPerUnit, feetPerUnit) {
  return (dpi * inchPerUnit) / feetPerUnit;
}

// The presets the scale dropdown offers, in the desktop app's order.
// [label, inchesPerUnit, feetPerUnit] — a null pair means "Custom…".
export const SCALE_PRESETS = [
  ['1/4" = 1 ft  (default)', 0.25, 1.0],
  ['1/8" = 1 ft', 0.125, 1.0],
  ['3/32" = 1 ft', 0.09375, 1.0],
  ['1" = 1 ft', 1.0, 1.0],
  ['1" = 10 ft', 1.0, 10.0],
  ['Custom…', null, null],
];

// A wider set the web build offers, since a browser has room for a real list.
// The five above are always present and keep their exact labels.
export const EXTENDED_SCALES = [
  ['1/16" = 1 ft', 0.0625, 1.0],
  ['3/32" = 1 ft', 0.09375, 1.0],
  ['1/8" = 1 ft', 0.125, 1.0],
  ['3/16" = 1 ft', 0.1875, 1.0],
  ['1/4" = 1 ft', 0.25, 1.0],
  ['3/8" = 1 ft', 0.375, 1.0],
  ['1/2" = 1 ft', 0.5, 1.0],
  ['3/4" = 1 ft', 0.75, 1.0],
  ['1" = 1 ft', 1.0, 1.0],
  ['1-1/2" = 1 ft', 1.5, 1.0],
  ['3" = 1 ft', 3.0, 1.0],
  ['1" = 10 ft', 1.0, 10.0],
  ['1" = 20 ft', 1.0, 20.0],
  ['1" = 30 ft', 1.0, 30.0],
  ['1" = 40 ft', 1.0, 40.0],
  ['1" = 50 ft', 1.0, 50.0],
  ['1" = 60 ft', 1.0, 60.0],
  ['1" = 100 ft', 1.0, 100.0],
];

export const DEFAULT_PPF = computePixelsPerFoot(DEFAULT_DPI, 0.25, 1.0);   // 37.5

/**
 * Short human-readable drawing scale for a pixels-per-foot value.
 * Falls back to a px/ft figure for a calibrated scale, so the item still
 * records how it was measured.
 */
export function scaleLabelFor(ppf, dpi = DEFAULT_DPI) {
  for (const [label, inches, feet] of SCALE_PRESETS) {
    if (inches == null) continue;
    if (Math.abs(computePixelsPerFoot(dpi, inches, feet) - ppf) < 0.5) {
      const base = label.split('  (')[0].trim();
      return feet === 1.0 ? base.split(' = ')[0].trim() : base;
    }
  }
  for (const [label, inches, feet] of EXTENDED_SCALES) {
    if (Math.abs(computePixelsPerFoot(dpi, inches, feet) - ppf) < 0.5) {
      return feet === 1.0 ? label.split(' = ')[0].trim() : label;
    }
  }
  return `${ppf.toFixed(1)} px/ft`;
}

/** True when this page's scale came from the calibrate tool, not a preset. */
export function isCalibrated(ppf, dpi = DEFAULT_DPI) {
  return scaleLabelFor(ppf, dpi).endsWith('px/ft');
}

// Calibration guard rails. A blank entry, a zero, a two-pixel line or an
// absurd result is a mis-click, not a scale, and accepting one silently
// re-values every measurement drawn on the sheet afterwards.
export const CALIBRATE_MIN_LINE_PX = 10;
export const CALIBRATE_MIN_PPF = 0.5;
export const CALIBRATE_MAX_PPF = 1500;

/**
 * ppf from a drawn line of `pixels` that the user says is `feet` long.
 * Throws with a message meant for the user when the pair cannot be a scale.
 */
export function ppfFromCalibration(pixels, feet) {
  if (!(pixels > CALIBRATE_MIN_LINE_PX)) {
    throw new Error('That line is too short to calibrate from. Draw across a longer known dimension.');
  }
  if (!(feet > 0)) {
    throw new Error('Enter the true length of the line you drew.');
  }
  const ppf = pixels / feet;
  if (ppf < CALIBRATE_MIN_PPF || ppf > CALIBRATE_MAX_PPF) {
    throw new Error(`That works out to ${ppf.toFixed(2)} pixels per foot, which is not a usable drawing scale. Check the length you entered.`);
  }
  return ppf;
}

/** The ppf an item was drawn at. Never resolve a page's scale in its place. */
export function itemPpf(item, fallback = DEFAULT_PPF) {
  const p = Number(item && item.ppf);
  return Number.isFinite(p) && p > 0 ? p : fallback;
}

// ── length parsing ────────────────────────────────────────────────────────

const FEET_INCH_RE =
  /^\s*(-)?\s*(?:(\d+(?:\.\d+)?)\s*(?:'|ft|feet)?)?\s*(?:[-\s]*(\d+(?:\.\d+)?)?\s*(?:(\d+)\s*\/\s*(\d+))?\s*(?:"|in|inch|inches)?)?\s*$/i;

/**
 * Decimal feet from anything an estimator types: 12, 12.5, 12', 12'6",
 * 12' 6 1/2", 6", 3/4". Returns null when the text is not a length.
 */
export function parseFeet(text) {
  const s = String(text == null ? '' : text).trim();
  if (!s) return null;

  // A bare number is feet.
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);

  let neg = false;
  let rest = s;
  if (rest.startsWith('-') && !/^-\s*\d+\s*\/\s*\d+/.test(rest)) {
    neg = true;
    rest = rest.slice(1).trim();
  }

  let feet = 0, inches = 0, matched = false;

  const fm = /^(\d+(?:\.\d+)?)\s*(?:'|ft\b|feet\b)/i.exec(rest);
  if (fm) { feet = parseFloat(fm[1]); rest = rest.slice(fm[0].length).trim(); matched = true; }

  // The dash in 12'-6" is a separator, not a minus.
  if (rest.startsWith('-')) rest = rest.slice(1).trim();

  const im = /^(?:(\d+(?:\.\d+)?)\s*)?(?:(\d+)\s*\/\s*(\d+))?\s*(?:"|in\b|inch(?:es)?\b)?$/i.exec(rest);
  if (im && (im[1] || im[2])) {
    if (im[1]) inches += parseFloat(im[1]);
    if (im[2] && im[3] && +im[3] !== 0) inches += parseInt(im[2], 10) / parseInt(im[3], 10);
    matched = true;
  } else if (rest) {
    return null;
  }

  if (!matched) return null;
  const v = feet + inches / 12;
  return neg ? -v : v;
}

// ── length formatting ─────────────────────────────────────────────────────

function gcd(a, b) { while (b) { [a, b] = [b, a % b]; } return a; }

/** 12.5 → 12'-6". The plain form, matching the desktop app's format_ft. */
export function formatFt(ft) {
  const totalIn = Math.round(ft * 12);
  const feet = Math.floor(totalIn / 12);
  const inches = totalIn - feet * 12;
  return `${feet}'-${inches}"`;
}

/**
 * 12.5417 → 12' 6 1/2", rounded to the nearest 1/16".
 * The architectural form, matching format_ft_in.
 */
export function formatFtIn(ft) {
  if (ft == null || !Number.isFinite(ft)) return '';
  const neg = ft < 0;
  const total16 = Math.round(Math.abs(ft) * 12 * 16);
  const feet = Math.floor(total16 / (12 * 16));
  const rem = total16 - feet * 12 * 16;
  const wholeIn = Math.floor(rem / 16);
  const frac16 = rem - wholeIn * 16;

  const parts = [];
  if (feet) parts.push(`${feet}'`);
  let inchS;
  if (frac16) {
    const g = gcd(frac16, 16);
    const fr = `${frac16 / g}/${16 / g}`;
    inchS = wholeIn ? `${wholeIn} ${fr}` : fr;
  } else {
    inchS = String(wholeIn);
  }
  parts.push(`${inchS}"`);
  return (neg ? '-' : '') + parts.join(' ');
}

export const DISTANCE_PRECISIONS = [
  'Nearest Inch', 'Inches Only', '1/2', '1/8', '1/16',
];

/** Format decimal feet using the user-chosen precision, matching the desktop app. */
export function formatDistancePrecision(ft, precision) {
  const totalIn = ft * 12;

  if (precision === 'Nearest Inch') {
    const wholeIn = Math.round(totalIn);
    const feet = Math.floor(wholeIn / 12);
    const inches = wholeIn - feet * 12;
    if (feet > 0) return inches ? `${feet}'-${inches}"` : `${feet}'`;
    return `${inches}"`;
  }

  if (precision === 'Inches Only') {
    const denom = 16;
    const scaled = Math.round(totalIn * denom);
    const whole = Math.floor(scaled / denom);
    const rem = scaled - whole * denom;
    if (rem === 0) return `${whole}"`;
    const g = gcd(rem, denom);
    return `${whole}-${rem / g}/${denom / g}"`;
  }

  const denom = { '1/2': 2, '1/8': 8, '1/16': 16 }[precision] ?? 8;
  const scaled = Math.round(totalIn * denom);
  const wholeIn = Math.floor(scaled / denom);
  const rem = scaled - wholeIn * denom;
  const feet = Math.floor(wholeIn / 12);
  const inches = wholeIn - feet * 12;

  let frac = '';
  if (rem > 0) {
    const g = gcd(rem, denom);
    frac = `-${rem / g}/${denom / g}`;
  }
  if (feet > 0) {
    if (inches === 0 && !frac) return `${feet}'`;
    return `${feet}'-${inches}${frac}"`;
  }
  return `${inches}${frac}"`;
}

// ── quantities ────────────────────────────────────────────────────────────

/** 1234.5 → "1,234.5"; trailing zeros dropped; 0 → "0". */
export function formatQty(q) {
  if (!q) return '0';
  const s = Number(q).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

export function formatNumber(v, dp = 2) {
  if (v == null || !Number.isFinite(Number(v))) return '';
  return Number(v).toLocaleString('en-US', {
    minimumFractionDigits: dp, maximumFractionDigits: dp,
  });
}

export function formatMoney(v) {
  const n = Number(v) || 0;
  return n.toLocaleString('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

export function formatArea(sf, { dp = 2 } = {}) {
  return `${formatNumber(sf, dp)} SF`;
}

/** Roofing squares — 100 SF each. */
export function toSquares(sf) { return sf / 100; }

// ── units of measure ──────────────────────────────────────────────────────
//
// A takeoff item measures ONE thing; the unit says which. The estimating
// units below are the ones the materials catalog uses, and the conversion
// table is how a measured quantity becomes a material quantity.

export const UNITS = {
  LF: { label: 'Linear Feet', kind: 'length' },
  FT: { label: 'Feet', kind: 'length' },
  IN: { label: 'Inches', kind: 'length' },
  SF: { label: 'Square Feet', kind: 'area' },
  SY: { label: 'Square Yards', kind: 'area' },
  SQ: { label: 'Squares (100 SF)', kind: 'area' },
  CF: { label: 'Cubic Feet', kind: 'volume' },
  CY: { label: 'Cubic Yards', kind: 'volume' },
  EA: { label: 'Each', kind: 'count' },
  PR: { label: 'Pair', kind: 'count' },
  BF: { label: 'Board Feet', kind: 'volume' },
  HR: { label: 'Hours', kind: 'time' },
  LS: { label: 'Lump Sum', kind: 'lump' },
  TON: { label: 'Tons', kind: 'weight' },
  LB: { label: 'Pounds', kind: 'weight' },
  GAL: { label: 'Gallons', kind: 'volume' },
  ROLL: { label: 'Rolls', kind: 'count' },
  SHT: { label: 'Sheets', kind: 'count' },
  BDL: { label: 'Bundles', kind: 'count' },
  BAG: { label: 'Bags', kind: 'count' },
  BOX: { label: 'Boxes', kind: 'count' },
};

export const UNIT_CODES = Object.keys(UNITS);

// Factors within one kind. A conversion across kinds is not arithmetic — it
// needs a coverage figure from the catalog record, which is why
// convertQuantity refuses rather than guessing.
const WITHIN_KIND = {
  length: { LF: 1, FT: 1, IN: 12 },
  area: { SF: 1, SY: 1 / 9, SQ: 1 / 100 },
  volume: { CF: 1, CY: 1 / 27, GAL: 7.48052 },
  weight: { LB: 1, TON: 1 / 2000 },
  count: { EA: 1, PR: 0.5 },
};

/**
 * Convert a quantity between units of the same kind.
 * Returns null when the pair needs a coverage figure instead — the caller
 * must then reach for the catalog record, never invent a factor.
 */
export function convertQuantity(qty, from, to) {
  if (from === to) return qty;
  const kf = UNITS[from]?.kind, kt = UNITS[to]?.kind;
  if (!kf || kf !== kt) return null;
  const table = WITHIN_KIND[kf];
  if (!table || !(from in table) || !(to in table)) return null;
  return (qty / table[from]) * table[to];
}

/** Waste added to a measured quantity, as a percentage. */
export function applyWaste(qty, wastePct) {
  const w = Number(wastePct) || 0;
  return qty * (1 + w / 100);
}

// There is deliberately NO materialQuantity()/coverage helper here.
//
// The desktop app does no automatic unit conversion between a takeoff quantity
// and a catalog material, and carries no coverage figure to do it with. An
// associated material's quantity is either a flat total or a rate per unit of
// the parent's measured value, and nothing else — see assemblyTotal in
// measure.js. A helper that guessed "one sheet of OSB covers 32 SF" would put
// a plausible, unchecked, wrong number straight into a bid.
