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

## Why a snapshot AND a live differential

`tests/revisions-logic.mjs` runs both. The snapshot is the regression check —
it fails anywhere if the port's ranking drifts. The live differential is what
keeps the snapshot honest: if the **desktop's** rule changes, the snapshot
would happily go on asserting the old one, and only a run against the real
source catches that. Neither alone is enough.
