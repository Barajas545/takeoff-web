"""Ground truth for the REFERENCE DISTANCE, taken from the desktop app itself.

The reference distance is one measurement taken at a scale the estimator
picks for that line alone, so the sheet's own scale is left where it is. The
whole object is its length and the scale printed beside it — which means the
two builds must word that scale identically, or the same line says two
different things on two screens and the feature has defeated itself.

So the wording is not re-typed here. The desktop's own functions are lifted
out of pdf_fast_viewer.py BY TEXT and exec'd in a bare namespace: if the
desktop changes how it says a scale, this picks the new words up on the next
run and the JS port starts failing, which is the point. Importing the module
outright is not an option — it pulls in PyQt5, fitz and a single-instance
socket.

Usage:  python ref-distance-python-truth.py  > truth.json
        PTT_DESKTOP_SRC must point at pdf_fast_viewer.py.
        tests/ref-distance.mjs passes it through automatically.
"""
import json
import math
import os
import re
import sys

SRC = os.environ.get("PTT_DESKTOP_SRC", "")
if not SRC:
    raise SystemExit(
        "Set PTT_DESKTOP_SRC to pdf_fast_viewer.py. This script runs the "
        "desktop app's own functions, so it needs the desktop app's source; "
        "tests/ref-distance.mjs passes it through automatically.")

# The definitions the reference distance's wording rests on, and nothing else.
WANT = [
    "REF_DIST_TYPE", "REF_DIST_COLOR", "REF_DIST_STIPPLE", "REF_DIST_CAPTION",
    "SCALE_PRESETS", "compute_pixels_per_foot", "scale_label_for",
    # ref_scale_words delegates to scale_words_for, which asks
    # ppf_of_scale_label and same_scale whether the words a shape recorded
    # still name its figure. Lifting a function by text does not bring what
    # it calls, so this list has to be the whole closure -- it went stale
    # once already when scale_words_for was introduced.
    "same_scale", "ppf_of_scale_label", "scale_words_for",
    "SCALE_SAME_FRAC",      # same_scale reads it; a constant, never called
    "ref_scale_words", "format_distance_precision", "px_dist", "px_to_ft",
]


def extract(src_text):
    """Each wanted top-level def or assignment, with its whole body.

    A continuation line is anything indented — plus the closing bracket of a
    multi-line literal, which sits in column 0. SCALE_PRESETS ends on a bare
    `]`, and stopping one line short of it produces a syntax error rather
    than a wrong answer, which at least fails loudly.
    """
    lines = src_text.splitlines(True)
    starts = {}
    for i, ln in enumerate(lines):
        m = re.match(r"^(?:def\s+(\w+)|(\w+)\s*=)", ln)
        if not m:
            continue
        name = m.group(1) or m.group(2)
        if name in WANT and name not in starts:
            starts[name] = i
    out = []
    for name in WANT:
        i = starts.get(name)
        if i is None:
            raise SystemExit(f"could not find {name} in {SRC}")
        j = i + 1
        while j < len(lines):
            ln = lines[j]
            if ln.strip() and not ln[0].isspace() and ln[0] not in ")]}":
                break
            j += 1
        out.append("".join(lines[i:j]))
    return "\n".join(out)


def missing_names(src_text, wanted):
    """Top-level names the wanted ones reach that WANT does not carry.

    Lifting a function out by text brings the function, not what it calls,
    so WANT has to be a real closure. It has gone stale twice; this is what
    makes the next time say which name, instead of raising NameError from a
    line number inside <extracted> that matches no file on disk.
    """
    import ast
    tree = ast.parse(src_text)
    top = {}
    for n in tree.body:
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
            top[n.name] = n
        elif isinstance(n, ast.Assign):
            for t in n.targets:
                if isinstance(t, ast.Name):
                    top[t.id] = n
    seen, queue, gap = set(), list(wanted), []
    while queue:
        nm = queue.pop(0)
        if nm in seen:
            continue
        seen.add(nm)
        if nm not in wanted:
            gap.append(nm)
        node = top.get(nm)
        if node is None:
            continue
        for sub in ast.walk(node):
            if isinstance(sub, ast.Name) and sub.id in top and sub.id not in seen:
                queue.append(sub.id)
    return gap


NS = {"re": re, "math": math, "json": json, "os": os}
with open(SRC, "r", encoding="utf-8") as fh:
    _desktop = fh.read()
_gap = missing_names(_desktop, WANT)
if _gap:
    raise SystemExit(
        "WANT is not a closure: the desktop source has moved and these "
        "names are reached but not lifted -- " + ", ".join(_gap))
exec(compile(extract(_desktop), "<extracted>", "exec"), NS)

scale_label_for = NS["scale_label_for"]
ref_scale_words = NS["ref_scale_words"]
fmt = NS["format_distance_precision"]
ppf_of = NS["compute_pixels_per_foot"]

DPIS = [96, 150, 200, 300]

# Every scale the desktop's own picker can hand a reference distance, at
# every DPI a project can carry.
labels = []
for dpi in DPIS:
    for _lbl, inches, feet in NS["SCALE_PRESETS"]:
        if inches is None:
            continue
        p = ppf_of(dpi, inches, feet)
        labels.append({"dpi": dpi, "ppf": p, "label": scale_label_for(p, dpi)})

# And figures that are NOT a preset: a calibrated line, and the near-misses
# that decide whether a preset's name may be used at all.
for dpi, p in [(150, 37.9), (150, 37.6), (150, 28.17), (150, 12.56),
               (150, 1.0), (96, 1.92), (96, 2.4), (300, 75.4), (150, 2.5)]:
    labels.append({"dpi": dpi, "ppf": p, "label": scale_label_for(p, dpi)})

# What the canvas and the printed sheet say the scale is, for items shaped
# the way _finalize_ref_distance writes them — and for the shapes a file
# can come back in after a round trip through a build that strips a key.
words = []
for item, dpi in [
    ({"ppf": 150.0, "scale": '1"'}, 150),
    ({"ppf": 37.5, "scale": '1/4"'}, 150),
    ({"ppf": 15.0, "scale": '1" = 10 ft'}, 150),
    ({"ppf": 28.17, "scale": "28.2 px/ft"}, 150),
    ({"ppf": 0, "scale": '1/2"'}, 150),           # stamp stripped, label kept
    ({"ppf": 0, "scale": '1" = 20 ft'}, 150),
    ({"ppf": 0, "scale": "28.2 px/ft"}, 150),
    ({"ppf": 0, "scale": ""}, 150),               # nothing recorded at all
    ({"scale": '3/4"'}, 150),                     # no ppf key whatsoever
    ({"ppf": 37.5, "scale": ""}, 150),            # stamp only
]:
    words.append({"item": item, "dpi": dpi,
                  "words": ref_scale_words(item, dpi)})

# The length, to the half inch, as both the canvas chip and the printed
# sheet write it.
lengths = []
for ft in [3.5, 14.0, 0.5, 1.0, 2.125, 12.5, 0.0, 99.99, 3.5416666666666665,
           0.0417, 7.0 / 3.0]:
    lengths.append({"ft": ft, "1/2": fmt(ft, "1/2"), "1/8": fmt(ft, "1/8"),
                    "1/16": fmt(ft, "1/16")})

# The canvas read-out itself: _gl_draw_measurement_label's REF_DIST_TYPE
# branch, which is "<length>   ·   <scale words>" under REF_DIST_CAPTION.
readouts = []
for pts, ppf, scale, dpi in [
    ([[100.0, 100.0], [198.6, 100.0]], 28.1714, '28.2 px/ft', 150),
    ([[0.0, 0.0], [525.0, 0.0]], 37.5, '1/4"', 150),
    ([[10.0, 10.0], [160.0, 10.0]], 150.0, '1"', 150),
]:
    ft = NS["px_to_ft"](NS["px_dist"](pts[0], pts[1]), ppf)
    item = {"type": NS["REF_DIST_TYPE"], "points": pts, "ppf": ppf,
            "scale": scale, "value": ft, "precision": "1/2"}
    readouts.append({
        "item": item, "dpi": dpi,
        "text": "%s   ·   %s" % (fmt(ft, "1/2"), ref_scale_words(item, dpi)),
        "caption": NS["REF_DIST_CAPTION"],
    })

json.dump({
    "type": NS["REF_DIST_TYPE"],
    "caption": NS["REF_DIST_CAPTION"],
    "color": list(NS["REF_DIST_COLOR"]),
    "stipple": list(NS["REF_DIST_STIPPLE"]),
    "presets": [[l, i, f] for (l, i, f) in NS["SCALE_PRESETS"]],
    "labels": labels,
    "words": words,
    "lengths": lengths,
    "readouts": readouts,
}, sys.stdout, indent=1)
sys.stdout.write("\n")
sys.stdout.flush()
