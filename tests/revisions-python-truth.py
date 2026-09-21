"""Ground truth for the revision logic, taken from the desktop app itself.

The pure functions are lifted out of pdf_fast_viewer.py by TEXT EXTRACTION
rather than re-typed, so this cannot drift from the thing it is checking: if
the desktop changes the ranking rule, this picks the new one up on the next
run and the JS port starts failing, which is the point.

Importing the module outright is not an option — it pulls in PyQt5, fitz and a
single-instance socket. So the handful of module-level defs the revision logic
needs are sliced out of the source and exec'd in a bare namespace.

Usage:  python revisions-python-truth.py <project.takeoff> [...]  > truth.json
"""
import io, json, os, re, struct, sys, zlib

# The desktop app's source. Overridden by PTT_DESKTOP_SRC so this runs on a
# machine that keeps it somewhere else — or not at all, in which case the
# caller skips this script rather than hardcoding one person's disk.
SRC = os.environ.get("PTT_DESKTOP_SRC", "")
if not SRC:
    raise SystemExit(
        "Set PTT_DESKTOP_SRC to pdf_fast_viewer.py. This script runs the "
        "desktop app's own functions, so it needs the desktop app's source; "
        "tests/revisions-logic.mjs passes it through automatically.")

# The definitions the revision logic needs, and nothing else.
WANT = [
    "_REV_DATE_RE", "_ORIGINAL_RANK", "_SHEET_LABEL_MAX",
    "parse_revision_date", "revision_rank", "_rev_name", "_rev_page_label",
    "resolve_latest_sheets", "normalize_sheet_label", "_norm_sheet",
    "_auto_match_pages", "_looks_like_sheet_number", "_clean_page_labels",
    "_decode_pdf_text", "_int_keyed",
]


def extract(src_text):
    """Pull out each wanted top-level def/assignment with its whole body."""
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
            if ln.strip() and not ln[0].isspace() and not ln.startswith(")"):
                break
            j += 1
        out.append("".join(lines[i:j]))
    return "\n".join(out)


NS = {"re": re, "io": io, "json": json, "os": os, "struct": struct, "zlib": zlib}
with open(SRC, "r", encoding="utf-8") as fh:
    exec(compile(extract(fh.read()), "<extracted>", "exec"), NS)

MAGIC, REVS = b"PDFCACHE1", b"TKREVS01"


def read_project(path):
    """Header + metadata + the revision tail's BLOB COUNTS. No pixels."""
    with open(path, "rb") as f:
        head = f.read(17)
        if head[:9] != MAGIC:
            raise ValueError("not a .takeoff")
        page_count, meta_len = struct.unpack_from("<II", head, 9)
        meta = json.loads(f.read(meta_len).decode("utf-8"))
        idx = f.read(page_count * 12)
        main_end = 17 + meta_len + page_count * 12
        if page_count:
            off, size = struct.unpack_from("<QI", idx, (page_count - 1) * 12)
            main_end = off + size
        f.seek(main_end)
        counts = []
        if f.read(8) == REVS:
            (n,) = struct.unpack("<I", f.read(4))
            for _ in range(n):
                (c,) = struct.unpack("<I", f.read(4))
                f.read(4 * c)
                counts.append(c)
    return meta, page_count, counts


def anonymise(meta, index):
    """Strip everything that could name a client, keep everything the RANKING
    depends on.

    Kept: dates, the match and extra maps, extra_sheets (ids are random hex,
    labels are drawing numbers like "A-1.1"), page_labels, blob counts. None
    of that identifies anyone, and all of it decides which sheet wins.

    Replaced: revision descriptions (a revision is often labelled by who sent
    it or whose copy it is, so they carry real names), notes, source PDF
    filenames, and the project's own name.
    Descriptions feed _rev_name and therefore every row's `source`, so this
    has to happen BEFORE the truth is computed or the two would not agree.
    """
    out = dict(meta)
    out.pop("project_name", None)
    out.pop("project_address", None)
    out.pop("client_name", None)
    out.pop("estimator_name", None)
    out.pop("project_notes", None)
    out.pop("project_description", None)
    out.pop("page_names", None)
    revs = []
    for i, r in enumerate(meta.get("revisions") or []):
        r = dict(r)
        r["description"] = "Revision %d" % (i + 1)
        r["notes"] = ""
        r["source"] = "revision-%d.pdf" % (i + 1)
        r.pop("added", None)
        revs.append(r)
    out["revisions"] = revs
    return out


def truth_for(path, anon=False, index=0):
    meta, page_count, counts = read_project(path)
    if anon:
        meta = anonymise(meta, index)
    revs = []
    for i, rm in enumerate(meta.get("revisions") or []):
        r = dict(rm)
        # resolve_latest_sheets bounds-checks against len(rev["images"]);
        # the web port has the blob COUNT and no images, so stand in a list
        # of the right length. Verified 1:1 with page_labels on real files.
        r["images"] = [None] * (counts[i] if i < len(counts) else 0)
        revs.append(r)

    main_labels = [(meta.get("page_labels") or [None] * page_count)[i]
                   if i < len(meta.get("page_labels") or []) else ""
                   for i in range(page_count)]
    # page_labels_custom wins, exactly as the app resolves a final label
    for k, v in NS["_int_keyed"](meta.get("page_labels_custom")).items():
        if v and 0 <= k < len(main_labels):
            main_labels[k] = v

    out = {"file": ("job-%d.takeoff" % (index + 1)) if anon
           else os.path.basename(path),
           "page_count": page_count,
           "blob_counts": counts, "main_labels": main_labels,
           "extra_sheets": meta.get("extra_sheets") or [],
           "revisions": [{k: v for k, v in r.items() if k != "images"}
                         for r in revs]}

    for order in ("date", "column"):
        for include_new in (True, False):
            rows, notes = NS["resolve_latest_sheets"](
                main_labels, meta.get("extra_sheets") or [], revs,
                order=order, include_new=include_new)
            out[f"latest.{order}.{'new' if include_new else 'nonew'}"] = {
                "rows": [{**r, "from": list(r["from"]),
                          "cols": {str(k): list(v) for k, v in r["cols"].items()}}
                         for r in rows],
                "notes": notes,
            }

    out["ranks"] = [
        {"date": r.get("date"),
         "parsed": NS["parse_revision_date"](r.get("date")),
         "rank_date": _jsonable(NS["revision_rank"](r, c, "date")),
         "rank_col": _jsonable(NS["revision_rank"](r, c, "column"))}
        for c, r in enumerate(revs)]
    out["normalized_labels"] = {lb: NS["normalize_sheet_label"](lb)
                                for lb in main_labels}
    return out


def _jsonable(t):
    return [list(x) if isinstance(x, tuple) else x for x in t]


if __name__ == "__main__":
    # --anonymise produces the COMMITTED fixture: same structure, no client
    # names, and the expected answers recomputed from the scrubbed input so
    # the two still agree.
    args = [a for a in sys.argv[1:] if a != "--anonymise"]
    anon = "--anonymise" in sys.argv[1:]
    print(json.dumps([truth_for(p, anon, i) for i, p in enumerate(args)],
                     indent=1))
