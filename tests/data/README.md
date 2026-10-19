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
takeoff on each drawing books — over synthetic jobs built the way the
estimator builds one. **No real project is in it**: every scenario is written
out in `tests/counting-python-truth.py`, so there is nothing to scrub.

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

## Why a snapshot AND a live differential

`tests/revisions-logic.mjs` runs both. The snapshot is the regression check —
it fails anywhere if the port's ranking drifts. The live differential is what
keeps the snapshot honest: if the **desktop's** rule changes, the snapshot
would happily go on asserting the old one, and only a run against the real
source catches that. Neither alone is enough.
