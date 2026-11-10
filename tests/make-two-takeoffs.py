"""Make tests/data/two-takeoffs.takeoff with the desktop 3.08's OWN producers.

A job of two takeoffs, every item drawn by the desktop's own tools (the
area, line and count tools, the window pin, + Add item, Group ▸) and the
takeoffs made, named and switched by its own window methods (new_takeoff,
rename_takeoff, switch_takeoff_list), then saved by its own writer. The web
tests open it: a hand-built file would test what this script's author
thinks the desktop writes, not what it writes.

What is in it (synthetic: no client, no job number, sheet labels X1.0-X3.0):
  * Main renamed "House"; a second takeoff "Deck"; the job left in Deck;
  * a two-sheet item in each takeoff ("Wall M" X1.0+X2.0 in House, "Deck
    boards" X1.0+X2.0+X3.0 in Deck);
  * same-name counts "Posts" in both; window pins in both;
  * a Deck Group ("Stairs") with a member ("Ledger");
  * standalones (+ Add item) in both;
  * a shared ruler, note and callout;
  * a revision "Rev B" reissuing X2.0, with work traced on it in both
    takeoffs -- not counted: the sheet counts from its own drawing.

Headless (QT_QPA_PLATFORM=offscreen), ONE PDFCacheViewer, os._exit(0) at
the end. Ids are made from a seeded generator, so a rerun on the same
desktop makes the same items with the same ids (the save's timestamp still
moves).

Usage:
  python -B tests/make-two-takeoffs.py [desktop program folder]          print what it would hold
  python -B tests/make-two-takeoffs.py [desktop program folder] --write  rewrite the fixture
(the folder of PTT_DESKTOP_SRC when none is given; it must be the 3.08
desktop, with its framing.py and assets beside pdf_fast_viewer.py.)
"""
import json
import os
import random
import shutil
import struct
import sys
import tempfile
import uuid

ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
WRITE = "--write" in sys.argv[1:]
ROOT = os.path.abspath(ARGS[0] if ARGS else os.path.dirname(
    os.environ.get("PTT_DESKTOP_SRC", "") or "."))
if not os.path.exists(os.path.join(ROOT, "pdf_fast_viewer.py")):
    raise SystemExit("Give the desktop program folder (argument, or "
                     "PTT_DESKTOP_SRC = its pdf_fast_viewer.py).")
with open(os.path.join(ROOT, "pdf_fast_viewer.py"), encoding="utf-8") as _fh:
    if "def new_takeoff(" not in _fh.read():
        raise SystemExit("tests/make-two-takeoffs.py needs the desktop 3.08 "
                         "source (PTT_DESKTOP_SRC): %s has no takeoff lists"
                         % ROOT)
FIXTURE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data",
                       "two-takeoffs.takeoff")

os.environ.setdefault("QT_QPA_PLATFORM", "offscreen")
sys.stdout.reconfigure(line_buffering=True, errors="replace")
# Every id the desktop makes (takeoffs, groups, Group items) from uuid4:
# seeded, so the fixture's ids are the same on every run.
_RNG = random.Random(308)
uuid.uuid4 = lambda: uuid.UUID(int=_RNG.getrandbits(128), version=4)

sys.path.insert(0, ROOT)
from pathlib import Path                                  # noqa: E402
from PyQt5.QtCore import QEvent                          # noqa: E402
from PyQt5.QtWidgets import QApplication                 # noqa: E402
from PIL import Image                                    # noqa: E402
import pdf_fast_viewer as V                              # noqa: E402

TMP = Path(tempfile.mkdtemp())
V.SETTINGS_PATH = TMP / "settings.json"
V.DEFAULT_LIBRARY_DIR = TMP / "lib"
app = QApplication.instance() or QApplication(sys.argv)
import OpenGL.GL as _GL                                  # noqa: E402
_GL.glDeleteTextures = lambda ids: None
# The questions the tools ask: Yes, except "count this drawing?" -- the
# work traced on Rev B is to stay NOT counted.
ANSWER = {"yes": True}
V.QMessageBox.question = staticmethod(
    lambda *a, **k: V.QMessageBox.Yes if ANSWER["yes"] else V.QMessageBox.No)
V.QMessageBox.information = staticmethod(lambda *a, **k: None)
V.QMessageBox.warning = staticmethod(lambda *a, **k: None)
V.QMessageBox.critical = staticmethod(lambda *a, **k: print("CRITICAL", a[1:3]))

W, H, PPF = 800, 600, 10.0
win = V.PDFCacheViewer()
gl = win.gl_widget
for _a in ("makeCurrent", "doneCurrent", "update"):
    setattr(gl, _a, lambda *x, **k: None)
gl._upload_temp_texture = lambda img: 77
gl._create_overlay_texture_from_image = lambda img: 7
win._apply_default_zoom = lambda: None
win._update_autosave_timer = lambda: None
win._refresh_all_thumb_overlays = lambda: None


def _fake_set_images(imgs):
    gl.clear_page_preview(update=False)
    gl._images = list(imgs)
    gl._page_sizes = {i: im.size for i, im in enumerate(imgs)}
    gl._current_page = 0 if imgs else -1


gl.set_images = _fake_set_images
gl._page_origin = lambda: (0.0, 0.0)
# name, notes, color, floor, category, sub, cost type, unit cost
DLG = ["Item", "", (1, 0, 0), "", "", "", "material", 0.0]
gl._show_item_dialog = lambda *a, **k: tuple(DLG)


def settle(n=6):
    for _ in range(n):
        app.processEvents()


labels = ("X1.0", "X2.0", "X3.0")
n = len(labels)
win.images = [Image.new("RGB", (W, H), (255, 255, 255)) for _ in range(n)]
gl._images = list(win.images)
gl._page_sizes = {i: (W, H) for i in range(n)}
win.metadata = {"page_labels": list(labels), "page_labels_custom": {},
                "page_names": {}, "dpi": 150, "pixels_per_foot": PPF,
                "project_name": "Two Takeoffs", "project_id": 4242}
win._revisions = []
win._vision_callouts = {}
win._page_moves_waiting = []
win._sheet_made = {}
win._file_pages = None
win._file_stamp = None
gl._pixels_per_foot = PPF
gl._zoom = 1.0
gl.set_measurements({})
gl.set_annotations({})
gl.clear_undo_history()
gl.clear_page_preview(update=False)
gl._current_page = 0
gl.set_active_takeoff_list("")
gl._append_target = None
gl.forget_armed_count()
gl._pending_item_name = ""
win.thumb_panel.populate(win.images, list(labels), {}, {})
win._unsaved = False


def on(page, rev=None):
    gl._current_page = page
    gl._preview_key = rev


def rect(x, y, w=40, h=30):
    return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]


def area(name, x, y, floor="Level 1", cat="Framing", w=40, h=30):
    DLG[0], DLG[3], DLG[4] = name, floor, cat
    gl._finalize_area(rect(x, y, w, h))
    return gl._measurements[gl._current_page][-1]


def line(name, pts_ft, floor="Level 1", cat="Framing"):
    DLG[0], DLG[3], DLG[4] = name, floor, cat
    gl._finalize_polyline([(a * PPF, b * PPF) for a, b in pts_ft])
    return gl._measurements[gl._current_page][-1]


def count(name, pts):
    for p in pts:
        gl._pending_item_name = name
        gl._add_count_point(list(p))
    gl._pending_item_name = ""
    gl.forget_armed_count()


# ---- Main ("House") ----
on(0)
area("Slab", 10, 10, cat="Concrete")
wall = area("Wall M", 60, 10)
gl._append_target = wall
on(1)
gl._finalize_area(rect(10, 200))            # a Main run on X2.0
gl._append_target = None
on(1)
line("Joists", [(0, 5), (20, 5)])           # Level 1 / Framing, like Deck's
count("Posts", [(500, 500), (520, 500)])    # a MAIN "Posts" on X2.0
on(0)
count("Outlets", [(400, 50), (420, 50)])
gl._add_window_pin([150.0, 300.0])
gl.add_standalone({"name": "Nails", "qty": 2, "unit": "box"})
# shared marks: a ruler, a note, a callout
gl._finalize_distance([(10.0, 500.0), (110.0, 500.0)])
gl._add_measurement({"type": "textnote", "points": [[1, 1], [5, 5]],
                     "text": "check"})
gl._add_measurement({"type": "page_ref", "points": [[400, 400]],
                     "ref_page": 1, "label": "X2.0"})

# ---- Deck ----
deck = win.new_takeoff("Deck", switch=False)
assert deck and deck.startswith("tl-"), deck
assert win.rename_takeoff("", "House")
assert win.switch_takeoff_list(deck)
on(0)
boards = area("Deck boards", 200, 200)
gl._append_target = boards
on(1)
gl._finalize_area(rect(300, 300))           # Deck run on X2.0
on(2)
gl._finalize_area(rect(300, 300))           # Deck run on X3.0
gl._append_target = None
on(0)
count("Posts", [(300, 300), (320, 300)])    # a DECK "Posts" on X1.0
gl._add_window_pin([600.0, 50.0])
on(2)
ledger = line("Ledger", [(0, 20), (30, 20)], floor="", cat="")
gl.add_standalone({"name": "Screws", "qty": 3, "unit": "box"})
stairs = gl.add_group_item({"name": "Stairs"})
assert gl.set_item_group(ledger, stairs["group_item_id"]) is True

# ---- Rev B: X2.0 reissued; work traced on it in both, NOT counted ----
win._revisions = [{
    "id": "r2", "date": "08/01/2026", "description": "Rev B",
    "visible": True, "archived": False,
    "page_labels": ["X2.0"], "match": {"1": 0}, "extra": {},
    "images": [Image.new("RGB", (W, H), (255, 255, 255))]}]
ANSWER["yes"] = False                       # "count this drawing?" -- No
on(1, ("r2", 0))
rail = area("Rail", 500, 100, cat="Railing")          # in Deck
assert rail.get("rev_id") == "r2", rail
assert win.switch_takeoff_list("")
on(1, ("r2", 0))
siding = area("Siding", 600, 300, cat="Siding")       # in House
assert siding.get("rev_id") == "r2", siding
settle()                                    # the question is asked after the tool is done
ANSWER["yes"] = True
assert win.switch_takeoff_list(deck)        # the job is left in Deck
on(0)
settle()
assert win.working_version_of(1) == "", "X2.0 must count from its own drawing"

out_dir = Path(tempfile.mkdtemp())
OUT = str(out_dir / "two-takeoffs.takeoff")
win._current_path = OUT
win._do_save_to_path(OUT)
assert win._wait_for_worker(timeout_ms=60000), "the save never finished"
settle()
with open(OUT, "rb") as f:
    head = f.read(len(V.MAGIC) + 8)
    ml = struct.unpack_from("<I", head, len(V.MAGIC) + 4)[0]
    meta = json.loads(f.read(ml))
print("DECK", deck)
for k in ("takeoff_lists", "takeoff_list_active", "takeoff_main_label",
          "sheet_version"):
    print(k, json.dumps(meta.get(k)))
print("revisions", json.dumps([{k: v for k, v in r.items() if k != "images"}
                                for r in meta.get("revisions") or []]))
for pg, lst in sorted(meta["measurements"].items(), key=lambda kv: int(kv[0])):
    for m in lst:
        print(pg, m.get("type"), m.get("name"), m.get("takeoff_list"),
              "child" if m.get("group_child") else "", m.get("group_id") or "",
              m.get("in_group") or "", m.get("rev_id") or "")
if WRITE:
    shutil.copyfile(OUT, FIXTURE)
    print("WROTE", FIXTURE, os.path.getsize(FIXTURE), "bytes")
for _ in range(3):
    app.sendPostedEvents(None, QEvent.DeferredDelete)
    app.processEvents()
sys.stdout.flush()
os._exit(0)
