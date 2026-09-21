"""Capture what the DESKTOP matcher returns, so the JS can be diffed against it.

Runs the real `catalog_search` from pdf_fast_viewer.py over the same
materials_catalog.json the web app ships, and writes the result codes for a set
of queries to catalog-python-truth.json.

Headless: it imports the module for its pure catalog functions only, so it sets
QT_QPA_PLATFORM=offscreen first and never constructs a window.
"""
import json
import os
import pathlib
import sys

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")

# The folder holding pdf_fast_viewer.py. Taken from PTT_DESKTOP_SRC (the same
# variable the rest of the suite uses, pointed at the file) so no one person's
# disk is written into a public repository.
_src = os.environ.get("PTT_DESKTOP_SRC", "")
if not _src:
    raise SystemExit(
        "Set PTT_DESKTOP_SRC to pdf_fast_viewer.py. This script imports the "
        "desktop app to capture what its matcher really returns.")
sys.path.insert(0, os.path.dirname(os.path.abspath(_src)))

import pdf_fast_viewer as V  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
catalog = json.loads((HERE.parent / "data" / "materials_catalog.json").read_text("utf-8"))
items = catalog["items"] if isinstance(catalog, dict) else catalog
index = V.catalog_build_index(items)

QUERIES = [
    # the shorthand, in every order
    "248d", "d248", "248df", "df248", "DF248", "2x4x8", "2412", "2x4",
    "pt268", "268pt", "2x6x8",
    # fractions and tags
    "1/2 cdx", "1/2", "cdx", "simpson", "hdu2", "hdu",
    # prefixes that must keep everything
    "24", "26", "48",
    # words, and words that narrow
    "labor", "lumber", "plywood", "framing", "concrete",
    "248d lumber", "248d hardware", "df 8", "8 df", "2x4 df",
    # nothing
    "", "   ", "zzzz", "qqqq zzzz",
    # things a real estimator types
    "osb", "1/2 osb", "16d", "joist hanger", "anchor bolt", "tyvek",
    "5/8 type x", "r19", "hardie", "pt 4x4",
]

results = {}
for q in QUERIES:
    results[q] = [it.get("code") for it in V.catalog_search(index, q)]

out = {
    "itemCount": len(items),
    "maxResults": V._CATALOG_MAX_RESULTS,
    "results": results,
}
(HERE / "catalog-python-truth.json").write_text(json.dumps(out, indent=1), "utf-8")
print(f"wrote {len(QUERIES)} queries over {len(items)} items")
