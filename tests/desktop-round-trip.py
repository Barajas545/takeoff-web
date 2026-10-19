"""The DESKTOP half of the round trip: the real program, offscreen.

    python desktop-round-trip.py make  <out.takeoff>
    python desktop-round-trip.py check <file.takeoff>
    python desktop-round-trip.py delete-rev <file.takeoff> <revision name>

`make` builds a job the way he builds one -- an original set, a revision
that reissues sheets and ADDS one in the middle, a second that reissues and
adds two at the end -- and takes it off through the real canvas (mouse
presses and Enter on the Area tool, the real import, the arrows landing on
the newest drawing, Yes to "count the drawing you just took off"), places
callout pins and a note on a revision, adds a multi-sheet item, and saves.

`check` opens a file -- the one the WEB saved -- and reports everything a
price or a pin depends on: the sheets in order, which drawing each counts
from, every quantity in the totals and the Report Center's own estimate rows,
which sheets a revision ADDED (sheet_origin, after the desktop's own pixel
proof at open), where every pin points, what every tile says, and what
Delete Revision would remove.

`delete-rev` runs Delete Revision on that file and reports what it removed.

Every command prints one line `JSON: {...}` at the end, by labels and
revision NAMES (the ids are random): the browser side compares them with its
own reading of the same file. PTT_DESKTOP_SRC points at pdf_fast_viewer.py.
One PDFCacheViewer per process -- two segfault at exit.
"""
import json
import os
import sys
import tempfile
import time

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
sys.stdout.reconfigure(line_buffering=True, errors="replace")
SRC = os.environ.get("PTT_DESKTOP_SRC", "")
if not SRC:
    raise SystemExit("Set PTT_DESKTOP_SRC to pdf_fast_viewer.py")
sys.path.insert(0, os.path.dirname(os.path.abspath(SRC)))

from pathlib import Path                                    # noqa: E402
from PyQt5.QtCore import QEvent, QPoint, Qt                 # noqa: E402
from PyQt5.QtGui import QMouseEvent                         # noqa: E402
from PyQt5.QtWidgets import QApplication                    # noqa: E402
from PIL import Image                                       # noqa: E402

import pdf_fast_viewer as V                                 # noqa: E402

TMP = Path(tempfile.mkdtemp())
V.SETTINGS_PATH = TMP / "settings.json"
V.DEFAULT_LIBRARY_DIR = TMP / "lib"
app = QApplication.instance() or QApplication(sys.argv[:1])

import OpenGL.GL as _GL                                     # noqa: E402
_GL.glDeleteTextures = lambda ids: None

ASKED = []
ANSWER = {"default": V.QMessageBox.Yes}


def _q(*a, **k):
    ASKED.append([str(a[1]) if len(a) > 1 else "",
                  str(a[2]) if len(a) > 2 else ""])
    return ANSWER["default"]


V.QMessageBox.question = staticmethod(_q)
V.QMessageBox.information = staticmethod(
    lambda *a, **k: ASKED.append(["INFO " + (str(a[1]) if len(a) > 1 else ""),
                                  str(a[2]) if len(a) > 2 else ""]))
V.QMessageBox.warning = staticmethod(lambda *a, **k: None)

W, H = 640, 480


def drawing(i):
    return Image.new("RGB", (W, H), (i % 251, (i // 251) % 251 + 1, 97))


win = V.PDFCacheViewer()
gl = win.gl_widget
for _a in ("makeCurrent", "doneCurrent", "update"):
    setattr(gl, _a, lambda *x, **k: None)
gl._upload_temp_texture = lambda img: 77
gl._create_overlay_texture_from_image = lambda img: 7
win._apply_default_zoom = lambda: None
win._refresh_all_thumb_overlays = lambda: None
win._update_autosave_timer = lambda: None


def _fake_set_images(imgs):
    gl.clear_page_preview(update=False)
    gl._images = list(imgs)
    gl._page_sizes = {i: im.size for i, im in enumerate(imgs)}
    gl._current_page = 0 if imgs else -1


gl.set_images = _fake_set_images
# In the order he takes them off below.
NAMES = iter(["Wall A3 old", "Slab A2", "Garage A2.5", "Wall A3 new",
              "Shed A7"] + ["Item %d" % i for i in range(1, 50)])
gl._show_item_dialog = lambda *a, **k: (next(NAMES), "", (1, 0, 0), "", "",
                                        "", "material", 0.0)
gl.resize(1000, 800)
win.settings.set("newest_version_view", True)


def settle():
    for _ in range(4):
        app.processEvents()


def labels():
    return [win._page_final_label(i) for i in range(len(win.images))]


def at(lbl):
    return labels().index(lbl)


def click(page_pt):
    sp = gl._page_to_screen(*page_pt)
    pt = QPoint(int(round(sp[0])), int(round(sp[1])))
    gl.mousePressEvent(QMouseEvent(QEvent.MouseButtonPress, pt, Qt.LeftButton,
                                   Qt.LeftButton, Qt.NoModifier))
    gl.mouseReleaseEvent(QMouseEvent(QEvent.MouseButtonRelease, pt,
                                     Qt.LeftButton, Qt.NoButton,
                                     Qt.NoModifier))


def take_off_area(x, y, s):
    gl._zoom, gl._pan_x, gl._pan_y = 1.0, 0.0, 0.0
    gl.set_mode("area")
    for p in ((x, y), (x + s, y), (x + s, y + s), (x, y + s)):
        click(p)
    gl.finish_measurement()
    gl.set_mode("pan")
    settle()


def import_revision(pages, date, desc, source):
    imgs = [drawing(c) for _l, c in pages]
    win._on_revision_rendered(
        (imgs, [lbl for lbl, _c in pages], [1.0] * len(pages)),
        {"date": date, "description": desc, "notes": "", "source": source})
    settle()
    return win._revisions[-1]


def rev_by_name(name):
    return next(r for r in win._revisions if win.rev_name(r.get("id")) == name)


def summary():
    """Everything a price or a pin depends on, by label and name."""
    labs = labels()
    meas = gl._measurements or {}

    def lab(p):
        return labs[p] if isinstance(p, int) and 0 <= p < len(labs) else (
            "standalone" if p == V.STANDALONE_PAGE else "page %s" % p)

    counted = []
    for _k, (m, (q, u)) in win._counted_quantities().items():
        pg = next(p for p, lst in meas.items() if any(x is m for x in lst))
        counted.append([lab(pg), m.get("name") or m.get("label") or "",
                        round(float(q), 4), u, win.rev_name(m.get("rev_id"))])
    counted.sort()
    sums = {}
    for _l, _n, q, u, _r in counted:
        sums[u] = round(sums.get(u, 0.0) + q, 4)
    rc = V.ReportCenterDialog(gl.get_measurements(), win._page_final_label,
                              win.metadata, parent=win, settings=win.settings,
                              rev_label_fn=win.revision_label,
                              counted=win.counted_filter())
    rows, _w, _d = rc._collect()
    rc.deleteLater()
    estimate = sorted([r.get("name") or "", round(float(r.get("qty") or 0), 4)]
                      for r in rows)
    origin = {}
    for k, v in (win.metadata.get("sheet_origin") or {}).items():
        origin[lab(int(k))] = [win.rev_name(v[0]), int(v[1]),
                               (v[2] if len(v) > 2 else None)]
    book = {lab(int(k)): win.rev_name(v)
            for k, v in (win.metadata.get("sheet_version") or {}).items()}
    marks = []
    for p, lst in meas.items():
        for m in lst or []:
            if m.get("type") == "page_ref":
                rp = m.get("ref_page", -1)
                marks.append(["pin", lab(p), win.rev_name(m.get("rev_id")),
                              lab(rp) if isinstance(rp, int) and rp >= 0
                              else None])
            elif m.get("type") == "textnote":
                marks.append(["note", lab(p), win.rev_name(m.get("rev_id")),
                              m.get("text")])
    marks.sort(key=lambda r: [str(x) for x in r])
    tiles = {lab(p): s["text"] for p, s in win._sheet_tile_states().items()}
    plans = {}
    for r in win._revisions:
        pl = win._rev_delete_plan(str(r.get("id")))
        plans[win.rev_name(r.get("id"))] = {
            "added": [lab(p) for p in pl["added"]],
            "drop": [lab(p) for p in pl["drop"]],
            "keep": [lab(p) for p in pl["keep"]]}
    newest = {lab(i): win.rev_name(win.newest_version_of(i))
              for i in range(len(win.images))}
    groups = sorted([lab(p), m.get("name"), round(float(m.get("value") or 0), 4)]
                    for p, lst in meas.items() for m in lst or []
                    if m.get("group_id") and not m.get("group_child"))
    return {"labels": labs, "origin": origin, "book": book,
            "counted": counted, "sums": sums, "estimate": estimate,
            "marks": marks, "tiles": tiles, "plans": plans,
            "newest": newest, "groups": groups,
            "revisions": [win.rev_name(r.get("id")) for r in win._revisions]}


def load(path):
    imgs, meta, ann, meas = V.load_cache_to_ram(str(path))
    win._cache_load_start = time.perf_counter()
    win._current_path = str(path)
    win._on_cache_loaded((imgs, meta, ann, meas))
    settle()
    for _ in range(10):
        app.processEvents()


def save(path):
    win._current_path = str(path)
    win._do_save_to_path(str(path))
    assert win._wait_for_worker(timeout_ms=60000), "the save never finished"
    settle()


def make(out):
    # 1. the original set, and one wall on A3.0's own drawing
    SET = ["A1.0", "A2.0", "A3.0", "A4.0", "A5.0", "A6.0"]
    win.images = [drawing(i) for i in range(len(SET))]
    gl._images = list(win.images)
    gl._page_sizes = {i: (W, H) for i in range(len(SET))}
    win.metadata = {"page_labels": list(SET), "page_labels_custom": {},
                    "page_names": {}, "dpi": 150, "pixels_per_foot": 50.0,
                    "project_name": "Round Trip", "project_id": "RT-1"}
    gl._pixels_per_foot = 50.0
    win._revisions = []
    win._vision_callouts = {}
    gl.set_measurements({})
    gl.set_annotations({})
    win.thumb_panel.populate(win.images, list(SET), {}, {})
    win.go_to_page(at("A3.0"))
    take_off_area(50, 50, 150)                       # Wall A3 old, 9 sq ft

    # 2. ASI 1 reissues A2.0 and A3.0 and ADDS A2.5 between them
    r1 = import_revision([("A2.0", 502), ("A2.5", 503), ("A3.0", 504)],
                         "02/10/2026", "ASI 1", "asi1.pdf")
    # 3. a second revision reissues A3.0 and A5.0 and adds A7.0 and A8.0
    r2 = import_revision([("A3.0", 601), ("A5.0", 602), ("A7.0", 603),
                          ("A8.0", 604)], "03/01/2026", "", "rev2.pdf")

    # 4. he walks the set: every sheet lands on its newest drawing
    win.go_to_page(at("A2.0"))
    take_off_area(60, 60, 100)                       # Slab A2, on ASI 1
    win.go_to_page(at("A2.5"))
    take_off_area(60, 60, 120)                       # Garage A2.5, its own
    win.go_to_page(at("A3.0"))
    take_off_area(60, 60, 170)                       # Wall A3 new, on REV 2 -> Yes
    win.go_to_page(at("A7.0"))
    take_off_area(60, 60, 130)                       # Shed A7, its own

    # 5. marks on a revision, and a multi-sheet wall
    a2, a3, a25, a6 = at("A2.0"), at("A3.0"), at("A2.5"), at("A6.0")
    rp2 = r1["match"][str(a2)]
    gl._measurements.setdefault(a2, []).append(
        {"type": "page_ref", "points": [[30.0, 30.0]], "ref_page": a6,
         "ref_zone": [0.1, 0.1, 0.2, 0.2], "ref_page_label": "A6.0",
         "label": "1/A6.0", "detail": "1", "visible": True,
         "rev_id": r1["id"], "rev_page": rp2})
    gl._measurements[a2].append(
        {"type": "textnote", "points": [[40.0, 40.0], [80.0, 40.0]],
         "text": "check the beam", "visible": True,
         "rev_id": r1["id"], "rev_page": rp2})
    gl._measurements.setdefault(a3, []).append(
        {"type": "page_ref", "points": [[30.0, 30.0]], "ref_page": a25,
         "ref_zone": [0.2, 0.2, 0.3, 0.3], "ref_page_label": "A2.5",
         "label": "2/A2.5", "detail": "2", "visible": True})
    wall = {"type": "polyline", "name": "Footing", "label": "Footing",
            "points": [[0.0, 0.0], [2000.0, 0.0]], "visible": True,
            "category": "Concrete", "group_id": "g-foot"}
    gl._measurements.setdefault(at("A1.0"), []).append(
        dict(wall, value=100.0, own_value=40.0, group_count=3))
    gl._measurements.setdefault(at("A4.0"), []).append(
        dict(wall, value=25.0, group_child=True,
             points=[[0.0, 0.0], [1250.0, 0.0]]))
    gl._measurements.setdefault(a6, []).append(
        dict(wall, value=35.0, group_child=True,
             points=[[0.0, 0.0], [1750.0, 0.0]]))
    win._resync_group_totals()
    save(out)
    return summary()


def main():
    cmd, path = sys.argv[1], sys.argv[2]
    if cmd == "make":
        out = make(path)
    elif cmd == "check":
        ANSWER["default"] = V.QMessageBox.No      # opening must ask nothing
        load(path)
        out = summary()
    elif cmd == "delete-rev":
        load(path)
        rev = rev_by_name(sys.argv[3])
        before = labels()
        ASKED[:] = []
        done = win._rev_delete(rev)
        settle()
        out = summary()
        out["deleted"] = bool(done)
        out["before"] = before
    else:
        raise SystemExit("unknown command %s" % cmd)
    out["asked"] = ASKED
    out["status"] = win.status_label.text()
    print("JSON: " + json.dumps(out))
    sys.stdout.flush()
    os._exit(0)


main()
