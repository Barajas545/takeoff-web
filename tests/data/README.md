# tests/data — committed snapshots

Everything in here is **derived, anonymised and safe to publish**. It exists so
that the checks which matter most can run in a fresh clone, on a machine that
has none of the estimator's files.

Contrast with `tests/fixtures/`, which is **not** committed: that holds real
`.takeoff` projects, including a named client's whole stamped plan set.

## revisions-truth.json

The desktop app's own answers about which version of each sheet is current,
captured over four real projects and then scrubbed.

**Kept**, because the ranking depends on all of it: revision dates exactly as
typed (`3-4-2026`, `05/6/2026`, `06-19-2026` — the messiness is the point), the
`match` and `extra` maps, `extra_sheets` with their ids and labels, every
sheet's drawing number, and the blob count of each revision set.

**Replaced**, because it names people: revision descriptions (in the real
files these carry a colleague's or a client's name — a revision is often
labelled by who sent it, or whose copy it is), notes, the source PDF
filenames, the project name and address, and the file name itself.

The scrub happens **before** the truth is computed, not after — a revision's
description feeds `_rev_name` and therefore every row's `source` field, so
scrubbing afterwards would leave the input and the expected output disagreeing.

Regenerate it when the desktop app's ranking rule changes:

```
python tests/revisions-python-truth.py --anonymise \
    "<project 1>.takeoff" "<project 2>.takeoff" … \
    > tests/data/revisions-truth.json
```

That script lifts `resolve_latest_sheets`, `revision_rank` and
`parse_revision_date` **out of `pdf_fast_viewer.py` by text extraction** and
runs them, so the expected values are the desktop program's own, not a
transcription of them.

## counting-truth.json

The desktop app's own answers to **what counts** — which piece of takeoff is
in the totals, how much it adds, which drawing each sheet counts from and is
shown at, what every tile and question and sentence says, what the first
takeoff on each drawing books, what each Delete takes (one shape, the shapes
on a sheet, a selection of shapes across several sheets, the whole item, and
the Items list's question word for word) —
over synthetic jobs built the way the estimator builds one; and what a job
switch leaves of the count tool's state. **No real project is in it**: every
scenario is written out in `tests/counting-python-truth.py`, so there is
nothing to scrub.

Regenerate it when the desktop's counting rule or its wording changes:

```
PTT_DESKTOP_SRC=<path to pdf_fast_viewer.py> \
    python tests/counting-python-truth.py --scenarios > tests/data/counting-truth.json
```

That script lifts PDFCacheViewer's and GLPageWidget's counting METHODS (and
every module-level name they reach) out of `pdf_fast_viewer.py` through `ast`,
and **refuses to run unless the lifted set is a closure**: a name reached and
not lifted, or a `self.<attribute>` that is neither lifted nor a declared
stand-in, is named before anything executes. `tests/revision-counting.mjs`
also runs it live, over these scenarios and over the whole library.

## zoom-floor-truth.json

The desktop app's own answers to **where zooming out stops**: after every step
of 30 scripted scenarios (the wheel, Shift and Ctrl+Shift on it, a sideways
wheel, a pinch, the minus and plus buttons, F and 1, a drag, a page turn, a
change of window size, a jump to an item, a flip to a revision on other paper,
the Settings box ticked off and on, the wheel set to scroll, sheets whose Fit
is past either zoom limit), the zoom, the pan, the readout ('Fit 18%'), whether
the view is on the floor and shows Fit, the zoom he last chose and whether it
was Fit, whether he is past Fit by choice, the raise a turn made, and every
sentence said; the same for the picture windows (_RefCanvas) over 4 more; and
the words -- the Settings box, its tooltip, the minus button's tooltip, the
Shortcuts wheel line and the once-a-session line, for each wheel setting.
**No project is in it**: the sheets are sizes, written out in
`tests/zoom-floor-python-truth.py`, so there is nothing to scrub.

Regenerate it when the desktop's zoom rule or its wording changes:

```
python -B tests/zoom-floor-python-truth.py <path to pdf_fast_viewer.py> --write
```

That script lifts GLPageWidget's, PDFCacheViewer's, SettingsDialog's and
_RefCanvas's zoom methods (and the module names they reach) out of
`pdf_fast_viewer.py` through `ast`, refusing to run unless the lifted set is a
closure. `tests/zoom-floor.mjs` diffs the web against this snapshot anywhere,
and against the script live when the desktop source is here -- which also
fails a snapshot gone stale.

## rename-truth.json

The desktop app's own answers about the Items list's **headings and the
names they carry**: what each heading's menu and tooltip offer, what a
selection on the drawing opens, the order the forms list a job's names in
(Round 5) -- and, under `rename` (Round 7), what renaming a floor level,
category or sub-category writes (every place, in order, over the desktop's
own test fixture), what Set for a blank heading files, where new pins are
filed, what the tool and the list follow, what one Ctrl+Z / Ctrl+Y puts back,
and every word of the forms, the merge question and the status line, for 41
flows driven the way he drives them -- the SHEET chip on in three -- and 4
chains of steps across Ctrl+Z and Ctrl+Y; the one look-alike merge that
goes the other way on a file the desktop wrote with its sheets out of page
order (the declared divergence); and the desktop's `_class_norm` and
`_class_sort_key` over every character its Python's Unicode table assigns,
compactly. **No project is in it**: the fixture is
the desktop test's own (generic names), written out in
`tests/rename-python-truth.py`, so there is nothing to scrub.

Regenerate it when the desktop's rule or its wording changes:

```
python -B tests/rename-python-truth.py <path to pdf_fast_viewer.py> --write
```

That script lifts the members out of `pdf_fast_viewer.py` (and the framing
helpers out of `framing.py` beside it) through `ast`, refusing to run unless
the lifted set is a closure. `tests/heading-menu.mjs` and
`tests/classification-rename.mjs` diff the web against this snapshot anywhere,
and against the script live when the desktop source is here.

## overlay-truth.json

The desktop app's own answers about **the overlay it saved for a sheet**
(Round 8): `_overlay_rgba`'s pixels and the cut-off it chose (Auto among
them) for small seeded images -- grey ramps, a transparent cut-out, a
grey-paper photo, saturated colours, L / LA / palette pictures -- across mode
x invert x cutoff; what `_apply_overlay_look` and `set_overlay_look` make of
a record's look (3.05 records, pictures, bad cut-offs); and what
`_restore_overlay_for_page` puts up on arrival, run whole on stand-ins over a
job of sheets of different sizes, a revision set and pictures -- the source,
`overlay_rect`, the tint, the fade, the look, the texture, the fader's label,
and for every record a file can hold that names nothing, whether the last
sheet's overlay was taken down (its revision branch leaves it up: the 3.08
residual). Plus page-pixel rects for a 5400x3600 sheet over a 2592x1728 one,
and `_cad_image_rect`, `_pts_pair`, `overlay_picture`, the sheet and picture
names and base64 reads. And `decode`: small PNGs of every shape a PIL read
and a browser read can disagree on -- semi-transparent RGBA, grey with alpha,
palettes with an alpha table or a clear index, colour keys, a picture tagged
Display P3 or Adobe RGB (profiles built in the script), a gamma chunk, 1-, 2-,
4- and 16-bit -- each as a sheet (`Image.open`) and as a picture (the lifted
`_picture_pil`), with the sha1 of every mask `_overlay_rgba` makes of it and
the cut-off it chose. **No project is in it**: every image is seeded and
written out in `tests/overlay-python-truth.py`, so there is nothing to scrub.

Declared, and pinned by `tests/overlay-look.mjs`: an `overlay_page` or
`rev_page` written as a JSON float (`3.0`, which no desktop build writes)
names nothing on the desktop, but JavaScript reads it as `3`, so the web shows
that sheet; a picture's colour key on a 16-bit grey PNG, an interlaced PNG and
a decode an iPad must reduce are read through the browser's decode, not as PIL
reads them (for the reduced one, Auto's cut-off is still read off the
full-size rows). A sheet the page store already holds is read at once, before
any wait, and its PNG's bytes only refine that read (whether it is plain, from
its head; Auto off a reduced one's full-size rows), each learnt once a job: so
when those bytes cannot be read (a job over the network, offline) the held read
stands -- for a sheet that is not plain, the browser's colour-managed read, and
on a reduced one, Auto off the reduced pixels (`tests/overlay-browser.mjs`
sections 3 and 4).

Regenerate it when the desktop's overlay look or restore rule changes:

```
python -B tests/overlay-python-truth.py <path to pdf_fast_viewer.py> --write
```

That script lifts the module functions, GLPageWidget's and PDFCacheViewer's
overlay methods out of `pdf_fast_viewer.py` through `ast` (and the fade
label's own expression out of `_restore_overlay_for_page`), refusing to run
unless the lifted set is a closure. `tests/overlay-look.mjs` diffs the web
against this snapshot anywhere, and against the script live when the desktop
source is here.

## Why a snapshot AND a live differential

`tests/revisions-logic.mjs` runs both. The snapshot is the regression check —
it fails anywhere if the port's ranking drifts. The live differential is what
keeps the snapshot honest: if the **desktop's** rule changes, the snapshot
would happily go on asserting the old one, and only a run against the real
source catches that. Neither alone is enough.
