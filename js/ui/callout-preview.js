// callout-preview.js — read a detail without leaving the plan.
//
// A callout bubble on a framing sheet says "see 3/S301". Following it means
// finding S301, finding detail 3 on it, reading it, and finding your way
// back — four navigations to answer one question, and you lose your place
// every time. The desktop program answers it in place, and the spec is blunt
// about why it matters: "reading a detail without leaving the plan IS the
// feature."
//
// Every callout in the estimator's library — 633 of 633 across 22 jobs —
// carries `ref_page` (the sheet it points at) and `ref_zone` (the rectangle
// on that sheet, in 0..1). So the preview is a crop of a real drawing, not a
// shrunken whole sheet: the median zone is 11% of a sheet's area, which at
// 480px is legible, where a whole 5400px sheet in the same box is a smudge.
//
// The crop is taken at decode time — see PageStore.cropRegion — so a 74 MB
// sheet is never held to take a corner out of it.

const SIZES = {
  small: [320, 210],
  medium: [480, 320],
  large: [640, 430],
  'x-large': [800, 535],
};

/** How long a mouse must rest on a bubble before we decode anything. */
const HOVER_DWELL_MS = 220;
/** Margin kept between the popup and the window edge. */
const EDGE = 10;

export class CalloutPreview {
  /**
   * @param {object} host
   *   pages        PageStore
   *   sheetLabel   (index) => string
   *   goToSheet    (index) => void
   *   sizeName     () => 'small'|'medium'|'large'|'x-large'
   */
  constructor(host) {
    this.host = host;
    this.pinned = false;
    this.item = null;
    this._token = 0;
    this._cache = new Map();      // `${page}:${zone}:${w}` -> ImageBitmap
    this._hoverTimer = null;
    this._build();
  }

  // ── the DOM ─────────────────────────────────────────────────────────

  _build() {
    const el = document.createElement('div');
    el.className = 'cpv';
    el.id = 'calloutPreview';
    // `hidden` alone is not enough to trust — an author rule that sets
    // display outranks it, which is how a fixed full-screen layer once ate
    // every click in this app. app.css sets [hidden] { display:none
    // !important }, and this element additionally has no size and no
    // pointer-events of its own when closed.
    el.hidden = true;
    el.innerHTML = `
      <div class="cpv-head">
        <span class="cpv-title" id="cpvTitle"></span>
        <button class="cpv-x" data-cpv="close" title="Close" aria-label="Close">✕</button>
      </div>
      <div class="cpv-body" id="cpvBody"></div>
      <div class="cpv-foot">
        <button class="cpv-go" data-cpv="go">Go to sheet</button>
        <span class="cpv-hint" id="cpvHint"></span>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.titleEl = el.querySelector('#cpvTitle');
    this.bodyEl = el.querySelector('#cpvBody');
    this.hintEl = el.querySelector('#cpvHint');

    el.addEventListener('pointerdown', ev => ev.stopPropagation());
    el.addEventListener('click', ev => {
      const act = ev.target.closest('[data-cpv]')?.dataset.cpv;
      if (act === 'close') { this.hide(); return; }
      if (act === 'go') {
        const page = this._targetPage(this.item);
        this.hide();
        if (page != null) this.host.goToSheet(page);
      }
    });
  }

  get open() { return !this.el.hidden; }

  // ── resolving where a callout points ────────────────────────────────

  /**
   * The sheet a callout refers to.
   *
   * `ref_page` is authoritative and present on every real pin. The label
   * fallback exists only for a file whose sheets were reordered by something
   * that did not remap the index — measured, a label resolves uniquely for
   * as few as 8% of pins on some jobs, so it is a last resort, never first.
   */
  _targetPage(m) {
    if (!m) return null;
    const n = this.host.pages?.pageCount ?? 0;
    if (Number.isInteger(m.ref_page) && m.ref_page >= 0 && m.ref_page < n) {
      return m.ref_page;
    }
    const want = String(m.ref_page_label || '').trim().toLowerCase();
    if (!want) return null;
    let found = null;
    for (let i = 0; i < n; i++) {
      const lab = String(this.host.sheetLabel(i) || '').trim().toLowerCase();
      if (lab === want) {
        if (found != null) return null;      // ambiguous: refuse to guess
        found = i;
      }
    }
    return found;
  }

  // ── showing ─────────────────────────────────────────────────────────

  /** A mouse resting on a bubble. Cheap until the dwell elapses. */
  hoverIn(item, x, y) {
    if (this.pinned) return;                 // a pinned preview is the user's
    if (this.item === item && this.open) return;
    this._clearHover();
    this._hoverTimer = setTimeout(() => {
      this._hoverTimer = null;
      this.show(item, x, y, { pinned: false });
    }, HOVER_DWELL_MS);
  }

  hoverOut() {
    this._clearHover();
    if (!this.pinned && this.open) this.hide();
  }

  _clearHover() {
    if (this._hoverTimer) { clearTimeout(this._hoverTimer); this._hoverTimer = null; }
  }

  /** A tap or a click. Opens and stays until dismissed. */
  async show(item, x, y, { pinned = true } = {}) {
    this._clearHover();
    this.item = item;
    this.pinned = pinned;
    const token = ++this._token;

    const page = this._targetPage(item);
    const label = page != null ? this.host.sheetLabel(page) : (item.ref_page_label || '');
    this.titleEl.textContent = `→ ${label || 'unknown sheet'}`;
    this.hintEl.textContent = pinned ? 'Tap outside or press Esc to close' : '';
    this.el.querySelector('.cpv-go').disabled = page == null;
    this._setBody(this._msg('Loading…'));
    this.el.hidden = false;
    this._place(x, y);

    if (page == null) { this._setBody(this._msg('No preview')); return; }
    if (!Array.isArray(item.ref_zone) || item.ref_zone.length < 4) {
      this._setBody(this._msg('No area selected'));
      return;
    }

    const [maxW] = SIZES[this.host.sizeName?.() || 'medium'] || SIZES.medium;
    const key = `${page}:${item.ref_zone.join(',')}:${maxW}`;
    try {
      let bmp = this._cache.get(key);
      if (!bmp) {
        bmp = await this.host.pages.cropRegion(page, item.ref_zone, maxW);
        if (bmp) {
          this._cache.set(key, bmp);
          // Small and bounded: 1 MB a crop, and a sheet has a few dozen pins.
          if (this._cache.size > 24) {
            const oldest = this._cache.keys().next().value;
            this._cache.get(oldest)?.close?.();
            this._cache.delete(oldest);
          }
        }
      }
      if (token !== this._token) return;     // superseded while decoding
      if (!bmp) { this._setBody(this._msg('No preview')); return; }
      this._setBody(this._canvasFor(bmp, maxW));
      this._place(x, y);
    } catch (err) {
      if (token !== this._token) return;
      console.warn('callout preview failed', err);
      this._setBody(this._msg('Preview error'));
    }
  }

  _msg(text) {
    const d = document.createElement('div');
    d.className = 'cpv-msg';
    d.textContent = text;
    return d;
  }

  /**
   * The image takes the shape of the drawing it is showing. The size is a
   * budget, not a box: pinning a detail of any aspect into a fixed rectangle
   * frames most of them in thick empty bars.
   */
  _canvasFor(bmp, maxW) {
    const [, maxH] = SIZES[this.host.sizeName?.() || 'medium'] || SIZES.medium;
    const k = Math.min(1, maxW / bmp.width, maxH / bmp.height);
    const w = Math.max(1, Math.round(bmp.width * k));
    const h = Math.max(1, Math.round(bmp.height * k));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const c = document.createElement('canvas');
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    return c;
  }

  _setBody(node) {
    this.bodyEl.textContent = '';
    this.bodyEl.appendChild(node);
  }

  /** Beside the bubble, flipped and clamped so it is always fully on screen. */
  _place(x, y) {
    const el = this.el;
    el.style.left = '0px';
    el.style.top = '0px';
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x + 18;
    if (left + r.width > vw - EDGE) left = x - 18 - r.width;
    left = Math.max(EDGE, Math.min(left, vw - r.width - EDGE));
    let top = y - r.height / 2;
    top = Math.max(EDGE, Math.min(top, vh - r.height - EDGE));
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
  }

  hide() {
    this._clearHover();
    this._token++;
    this.pinned = false;
    this.item = null;
    this.el.hidden = true;
    this.bodyEl.textContent = '';
  }

  /** Drop every decoded crop — on closing a project, or opening another. */
  clearCache() {
    for (const b of this._cache.values()) b?.close?.();
    this._cache.clear();
  }
}
