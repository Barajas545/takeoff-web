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
switch leaves of the count tool's state. Since takeoff lists (desktop 3.08)
it also holds, per scenario, `takeoffs` (NOT ON A SHEET's count of Main's
items, how many items of other takeoffs each sheet's own drawing holds,
what Delete Page says of them, and the naming the sentences ask), one job of
several takeoffs (`"takeoffs": true`: Main renamed House, Deck and Patio,
asked with the window's naming installed, so every sentence names another
takeoff's item "(in Deck)"), and `named`: the money words of two totals
pictures, named and not, in Main, in Deck and with no naming at all.
**No real project is in it**: every
scenario is written out in `tests/counting-python-truth.py`, so there is
nothing to scrub.

Regenerate it when the desktop's counting rule or its wording changes:

```
PTT_DESKTOP_SRC=<path to pdf_fast_viewer.py> \
    python tests/counting-python-truth.py --scenarios > tests/data/counting-truth.json
```

(On Windows, Python writes that redirect with CRLF line ends; the committed
file is LF -- strip the CRs.) Since takeoff lists, it needs the **3.08**
desktop source: the canvas's view test (`in_active_list`) is lifted, and an
older source is refused in one line.

That script lifts PDFCacheViewer's and GLPageWidget's counting METHODS (and
every module-level name they reach) out of `pdf_fast_viewer.py` through `ast`,
and **refuses to run unless the lifted set is a closure**: a name reached and
not lifted, or a `self.<attribute>` that is neither lifted nor a declared
stand-in, is named before anything executes. `tests/revision-counting.mjs`
also runs it live, over these scenarios and over the whole library.

## zoom-floor-truth.json

The desktop app's own answers to **where zooming out stops**: after every step
of 55 scripted scenarios (the wheel, Shift and Ctrl+Shift on it, a sideways
wheel, a pinch, the minus and plus buttons -- with the sheet dragged aside
too, F and 1 -- which keeps a dragged pan, a drag, a page turn, a
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
compactly. Since desktop 3.08 it also holds the same headings in a job of
two takeoffs (each heading's `takeoffs`: the Move / Copy submenus and the
move-or-copy clause the web declares N/A), and under `rename` the plans and
pin filings inside one takeoff and 15 flows in that job (`start.takeoffs`,
fixture `tl`: Main renamed House, Deck beside it, the web in House) -- the
3.07-era entries are unchanged. **No project is in it**: the fixture is
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
sheet's overlay was taken down (before 3.08 its revision branch left it up;
the snapshot is the 3.08 desktop's, which takes it down there too -- and,
since 3.08's round 3 fixes, reads a float or bool rev_page as naming nothing,
where it raised or showed page 1, and takes the strip down on an arrival
with nothing up). Plus page-pixel rects for a 5400x3600 sheet over a 2592x1728 one,
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

## rounding-truth.json

The desktop app's own answers to **how a number reads** (the user's decision
of 2026-11-07, "match the desktop rounding"): Python rounds an exact binary
tie half to even, so 12.25 sq ft is '12.2 sq ft', $0.125 is '$0.12', 22.5
inches is 1'-10" and 12.5% zoom is '12%' (the readout truncates). Under
`cases`, what the desktop's own producers write for a corpus of exact ties,
the doubles either side of them, negatives, -0.0, large values with commas
and 1e21: every canvas label and live read-out, a row's quantity, a report's
quantities, totals and money, the export's rounding and words, the labels
and suggested names of a finished shape and of a reshape (a grid's cells, a
Measure line's length, a dragged pitch line's rise, angle and words), the
pitch words, feet and inches at every precision, a calibrated scale's words,
the catalog's table cell and pick-list price, the calibration's sentences,
the slope form, the tile form's estimate, the materials' quantities, a
reissue's size refusal, the zoom readout, and the CSV the desktop writes of
one made-up job (`export_csv`: its JSON text and the desktop's CSV text --
the rows of its own `_collect_items` through its `csv.writer`, so a float
reads '20.0'; the same job is the one `tests/rounding-parity.mjs` exports to
a workbook and adds up in the Items footer). Also: what a reshape writes
into a grid or a pitch line and the canvas label it then draws (the
desktop's whole `_recalc_value`: `recalc_grid_shape`, `recalc_pitch`), the
workbook's quantities item by item (`xlsx_qty`: the Takeoff sheet's
'Qty / Value' from `_export_excel`'s own `value_and_unit`, and a material's
'%g' there and on the Materials sheet), and the Report Center's rows of one
made-up job with every kind of pin (`report_collect`: each item's quantity,
unit, rate and cost and its materials', from `ReportCenterDialog._collect`).
Under `helpers`, Python's own
format() ('.Nf', ',.Nf', '.pg'), round(), int() and str() on generated ties
for N 0..6 and p 1..7. **No project is in it**: the inputs are numbers and
made-up items written out in `tests/rounding-python-truth.py`.

Regenerate it when a desktop format changes:

```
python -B tests/rounding-python-truth.py <path to pdf_fast_viewer.py> --write
```

That script lifts the producers out of `pdf_fast_viewer.py` through `ast` --
whole functions and methods on stand-ins that record what they paint, and
single expressions found by their own text -- refusing to run unless the
lifted set is a closure. `tests/rounding-parity.mjs` holds the web's helpers
and producers to this snapshot anywhere, and to the script live when the
desktop source is here.

## py-json-truth.json

Python's own **json.dumps and json.loads** on the words JSON has no room
for -- `Infinity`, `-Infinity`, `NaN`. The desktop saves its metadata with
`json.dumps(self._build_save_metadata())` and reads it with `json.loads`, no
keyword on either (checked BY TEXT, through `ast`, and recorded under
`calls`), so allow_nan is on: a vertical pitch line's rise, float("inf")
from its own `_pitch_from_points` (lifted out of `pdf_fast_viewer.py` with
`_pitch_label` and closure-checked, so the pitch item in the cases is the
desktop's own), is saved as the bare word Infinity. Each case holds the
desktop's text of a value (`desktop`), the text this app must write of it
byte for byte (`web`: the compact form, as JavaScript holds the value), and
what json.loads makes of each (`loads`, `web_loads`, as tagged trees in
which a non-finite number is "inf", "-inf" or "nan"); `texts` are Python's
verdicts on the words where it refuses them (`{NaN: 1}`, `1Infinity`,
`-NaN`, and a word as a key even in an object a later key throws away) and
where it still takes them (`[ NaN ]`, `1e999`, and a NaN under a key written
again later in the same object: `{"a": NaN, "a": 1}` is `{'a': 1}`). One
case is a dict json.dumps writes with one key twice -- the int 0 and the
str "0" -- a NaN under the first. `canvas` holds the words the desktop's
canvas draws for six of its own pitch lines (a vertical one; two clicks on
one point, rise Infinity and angle 0, which it draws 'vertical   0°'; the
same with a note; a run under its 1e-9; a sloped and a level one), each
beside the item as json.dumps writes it, from the pitch branch of
`GLPageWidget._gl_draw_measurement_label` lifted by text (`canvas_lifted`
names the method and the six assignments run; closure-checked: they read
only `m` and `_pitch_label`). **No project is in
it**: every value is written out in `tests/py-json-python-truth.py`, sheet
labels X1.0 and X2.0.

Regenerate it when the desktop's save or load call, or its pitch label,
changes:

```
python -B tests/py-json-python-truth.py <path to pdf_fast_viewer.py> --write
```

`tests/py-json.mjs` holds `js/core/py-json.js` to it anywhere, and live when
the desktop source is here: Python then reads back every text this app
writes, and the web's save of a desktop job; and the desktop's lifted canvas
words draw this app's save of an edited zero-length line as this app does.

## takeoff-lists-truth.json

The desktop 3.08's own answers about **takeoff lists**: which takeoff an item
is in (`takeoff_list_scoped`, `takeoff_list_of`, `in_takeoff_list` and the
canvas's `in_active_list`, over every type and tags padded with every
character Python and JavaScript part on -- `\x1c`, NBSP, U+0085, U+FEFF --
falsy and number tags), the one writer of the tag (`_set_takeoff_list`), a
takeoff's name (`clean_takeoff_name`, `free_takeoff_name`: over 60 code
points, astral characters, a name with no letter or number, casefolds), the
job's takeoffs as the window reads them (`takeoff_lists`,
`takeoff_list_label`, `has_takeoff_lists`, `_takeoff_naming_now`: the list
form and the dict form, repeated and blank ids, blank labels, a label equal
to Main's in other capitals) and how many items each holds
(`_takeoff_items`); and the money words' `takeoff_where_words` and
`takeoff_others_moved_words`. **No project is in it**: every case is written
out in `tests/takeoff-lists-python-truth.py`.

Regenerate it when the desktop's takeoff lists change (it needs the 3.08
source, and says so in one line on an older one):

```
python -B tests/takeoff-lists-python-truth.py <path to pdf_fast_viewer.py> --write
```

`tests/takeoff-lists-parity.mjs` holds `js/core/takeoff-lists.js` to it
anywhere, and live when the desktop source is here.

## two-takeoffs.takeoff

A job of two takeoffs made by the desktop 3.08's **own producers** -- its
tools, its + Add item and Group, its New takeoff / rename / switch, and its
writer -- from synthetic data only: "Two Takeoffs", sheets X1.0-X3.0, Main
renamed House, a second takeoff Deck, the job left in Deck, a revision Rev B
of X2.0 with work traced on it in both takeoffs (not counted). The web's
takeoff-list tests open it with the web's own reader. Remake it with

```
python -B tests/make-two-takeoffs.py <desktop 3.08 program folder> --write
```

(ids come from a seeded generator, so a rerun makes the same items with the
same ids; tests read the ids from the file all the same).
