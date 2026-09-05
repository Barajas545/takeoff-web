# Professional Takeoff Tools — Web

Construction plan takeoff in a browser. It opens and writes the **same
`.takeoff` project files** as the desktop program, so a job started at the
desk can be carried on from a phone or a tablet on site, and carried back
again, with no export step in between.

**→ [Open the app](https://barajas545.github.io/takeoff-web/)**

Add it to your home screen and it behaves like an installed app, offline
included.

---

## Your drawings never leave your device

There is no server, no account and no upload. The app is a set of static
files; your project is opened straight off your phone with the file picker,
measured in the page, and written back as a file you keep. Nothing about a
job is ever transmitted anywhere.

That is also why the address bar says `github.io` and your plans are still
private: GitHub hosts the *program*, not your work.

---

## Using it on a phone or tablet

**Open a job.** Tap *Open a .takeoff project* and pick the file — from
iCloud Drive, Google Drive, Files, wherever it lives. Big sets open fast
because only the sheet you are looking at is ever read.

**Move around.** Pinch to zoom, two fingers to pan, one finger to draw.

**Measure.** Pick a tool, tap the points. For anything that takes a chain of
points — Area, Polyline, Array, Grid, Tile — the bar at the foot of the
screen turns into **Finish · Undo point · Cancel** while you are placing
them, because a tablet has no Enter key.

**Long-press** an item for its menu: properties, materials, hide, isolate,
delete. That is the touch stand-in for a right-click.

**Sheets** and **Items** at either end of the foot bar slide the two panels
over the drawing. Tap the dimmed area to put them away.

**Save.** On a phone the browser cannot write back into the file it opened,
so Save hands you the finished project through the share sheet — send it to
Files, to Drive, to yourself. On Chrome or Edge on a desktop it overwrites
the original in place.

**If the tab is discarded** — which iOS does to background tabs when it
wants the memory — the measurements you had not saved are kept, and offered
back the next time you open that file.

---

## What it does

| | |
|---|---|
| **Opens** | `.takeoff` and legacy `.pdfcache` projects; PDF drawing sets |
| **Saves** | `.takeoff`, byte-compatible with the desktop program |
| **Measures** | distance, area, slope roof, pitch, polyline, count, windows, doors, array, grid, tile, calibrate |
| **Marks up** | pen, highlighter, box highlight, eraser, sticky notes, detail callouts |
| **Organises** | the Floor → Trade → Sub-group tree, visibility, isolation, filters |
| **Prices** | per-item unit costs, associated materials, a 2,151-item materials catalog |
| **Reports** | seven printable reports, CSV, and a styled three-sheet Excel workbook |

Not built yet: the CAD drafting engine, site photos, the revisions
comparison screen, and AI callout reading. **Revision image sets are carried
through a save untouched** — the app will not drop what it cannot yet show
you.

---

## Honest limits

**Very large projects.** Opening is cheap at any size — a 2.3 GB set reads
about 2 KB to open. Saving is not: on a phone the whole file has to be
rebuilt in memory to hand back, so jobs in the hundreds of megabytes are
better saved at a desk. Measuring and marking up a big set on a phone is
fine; it is the save that is heavy.

**Very large sheets on iPhone and iPad.** Safari refuses a canvas past about
16.8 megapixels and returns a blank one rather than an error. A plan sheet at
150 DPI is often bigger than that. The app measures what the device can
actually do and decodes an oversized sheet at reduced detail to fit —
quantities and positions are unaffected, because the sheet still measures its
true size; it is only slightly softer when you zoom right in.

**Browsers.** Chrome, Edge, Firefox 113+, Safari 16.4+. Chrome and Edge can
save back over the original file; Firefox and Safari cannot, and hand you a
copy instead.

---

## Running it yourself

Static files, no build step, no bundler, no framework — plain ES modules,
HTML and CSS. Serve the folder with anything:

```bash
python -m http.server 8791
```

Then open `http://localhost:8791`. It cannot run from `file://`, because
browsers refuse to load ES modules that way.

---

## How it is built

Four decisions shape the whole codebase, and each is written up at length at
the top of the file that implements it.

1. **Nothing reads the whole file.** Opening reads the header, the metadata
   and the page index — about 2 KB even on a 2.3 GB job. A sheet's bytes are
   `File.slice()`d only when that sheet is drawn, into a small cache that
   closes what it evicts. See `js/core/takeoff-file.js`, `js/core/page-store.js`.

2. **Saving passes untouched pages through as slices.** Page rasters are
   immutable here, so a page that was not edited is written back as the same
   blob it was read from: no decode, no re-encode, no generation loss. A
   38 MB project saves in 13 ms.

3. **Each item's scale is recovered from its own geometry**, never from the
   page. A document-wide scale gets recalibrated mid-job, so stored items
   routinely disagree with the current one — a stored value is never
   recomputed on load. See `recoverPpf` in `js/core/project.js`.

4. **The takeoff tree is derived, never stored** — from each item's floor,
   trade and sub-group plus its sort order, exactly as the desktop program
   does it.

`js/core/xlsx.js` is a dependency-free styled XLSX writer, written because
the export is banded by section and the small spreadsheet libraries cannot
fill a cell.

pdf.js is vendored in `vendor/` rather than loaded from a CDN, so starting a
new job from a PDF works on a site with no signal.

---

© DCR Framing. All rights reserved.
