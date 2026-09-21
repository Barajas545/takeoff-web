// thumbnails.js — the sheets list.
//
// A drawing set runs to hundreds of sheets, and decoding every one of them at
// full size to make a thumbnail would be the single most expensive thing this
// app does. So the rows are built immediately with empty tiles and the images
// arrive as an IntersectionObserver notices each row scroll into view —
// decoded once, at thumbnail size, straight out of the PNG.

export class Thumbnails {
  constructor({ listEl, panelEl, project, pages, onPick, revisionCounts }) {
    this.listEl = listEl;
    this.panelEl = panelEl;
    this.project = project;
    this.pages = pages;
    this.onPick = onPick;
    // () => Map<pageIndex, how many revision sets reissued that sheet>. A job
    // with no revisions hands back an empty map and no card changes at all,
    // which is the point: most projects have one drawing set and must look
    // exactly as they did.
    this.revisionCounts = revisionCounts || (() => new Map());
    this.current = 0;
    this._rows = [];

    this._io = new IntersectionObserver(entries => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        this._io.unobserve(e.target);
        this._fill(e.target);
      }
    }, { root: listEl, rootMargin: '300px 0px' });
  }

  refresh(current = this.current) {
    this._io.disconnect();
    this.listEl.textContent = '';
    this._rows = [];
    const n = this.pages.pageCount;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const row = this._row(i);
      this._rows.push(row);
      frag.appendChild(row);
    }
    this.listEl.appendChild(frag);
    for (const r of this._rows) this._io.observe(r);
    this.setCurrent(current);
  }

  _row(i) {
    const el = document.createElement('div');
    el.className = 'thumb';
    el.dataset.index = String(i);

    const img = document.createElement('canvas');
    img.className = 'thumb-img';
    el.appendChild(img);

    const cap = document.createElement('div');
    cap.className = 'thumb-cap';
    const no = document.createElement('span');
    no.className = 'thumb-no';
    cap.appendChild(no);
    const name = document.createElement('span');
    name.className = 'thumb-name';
    cap.appendChild(name);
    const badge = document.createElement('span');
    badge.className = 'thumb-badge';
    cap.appendChild(badge);
    const rev = document.createElement('span');
    rev.className = 'thumb-rev';
    cap.appendChild(rev);
    el.appendChild(cap);

    this._label(el, i);
    el.addEventListener('click', () => this.onPick?.(i));
    return el;
  }

  _label(el, i) {
    const md = this.project.metadata;
    const label = md.page_labels?.[i];
    el.querySelector('.thumb-no').textContent = label || `${i + 1}`;
    const name = md.page_names?.[i] || '';
    el.querySelector('.thumb-name').textContent = name;
    el.querySelector('.thumb-name').title = name;
    const items = (this.project.measurements[i] || []).filter(m => !m.group_child).length;
    const badge = el.querySelector('.thumb-badge');
    badge.textContent = items ? String(items) : '';
    badge.title = items ? `${items} takeoff item${items === 1 ? '' : 's'} on this sheet` : '';

    // How many times this sheet was re-issued. One dot per revision that
    // carries it, so a glance down the list shows which drawings changed —
    // and a job with no revisions gets an empty span and no layout shift.
    const rev = el.querySelector('.thumb-rev');
    const n = this.revisionCounts().get(i) || 0;
    rev.textContent = n ? '•'.repeat(Math.min(n, 4)) + (n > 4 ? '+' : '') : '';
    rev.title = n
      ? `${n} revision${n === 1 ? '' : 's'} re-issued this sheet — `
        + 'open Plan Revisions to compare them'
      : '';
  }

  async _fill(el) {
    const i = Number(el.dataset.index);
    const canvas = el.querySelector('.thumb-img');
    if (!canvas || canvas.dataset.done) return;
    try {
      const bmp = await this.pages.getThumbnail(i, 176);
      if (!bmp) return;
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      canvas.style.aspectRatio = `${bmp.width} / ${bmp.height}`;
      canvas.getContext('2d').drawImage(bmp, 0, 0);
      canvas.dataset.done = '1';
    } catch {
      // An undecodable sheet still gets a row and a number — the thumbnail is
      // a convenience, and losing it must not lose the page.
      canvas.style.minHeight = '40px';
    }
  }

  setCurrent(index) {
    this.current = index;
    for (const r of this._rows) {
      const on = Number(r.dataset.index) === index;
      r.classList.toggle('on', on);
      if (on) r.scrollIntoView({ block: 'nearest' });
    }
  }

  /** Re-read the labels and item counts without rebuilding the rows. */
  syncLabels() {
    for (const r of this._rows) this._label(r, Number(r.dataset.index));
  }
}
