"""Ground truth for THE SAVED OVERLAY ON ARRIVAL, from the desktop app.

Desktop 3.06 puts a sheet's saved overlay (metadata.page_overlays[str(page)])
up the moment he arrives on it: another sheet, a revision of it, or a picture
of it, in its own tint, fade and look -- Lines or Original colours, Invert,
the paper cut-off or Auto. The functions that decide all of it are lifted
out of pdf_fast_viewer.py BY TEXT (through `ast`, so a function is exactly
its own lines) and run here, so the web port (js/core/overlay-look.js) is
held to the desktop's own code rather than to a transcription of it:

  * module: _overlay_rgba, _overlay_auto_cutoff, the _OVERLAY_* constants
    they read, _cad_image_rect and _pts_pair;
  * GLPageWidget: set_overlay, set_overlay_image, clear_overlay,
    set_overlay_color, set_overlay_alpha, set_overlay_look, overlay_picture,
    overlay_rect, _overlay_is_picture, _create_overlay_texture and
    _create_overlay_texture_from_image -- with GL itself a stand-in that
    keeps the texture it is handed (the RGBA the desktop would draw);
  * PDFCacheViewer: _restore_overlay_for_page (the arrival, whole),
    _restore_picture_overlay, _apply_overlay_look, _picture_pil,
    _picture_key, _overlay_entry_label, _pictures_on_sheet, _picture_name,
    and the strip's fade label, the expression `int(alpha * 100)` read out
    of _restore_overlay_for_page itself.

THE LIFTED SET MUST BE A CLOSURE, checked BEFORE anything runs: every
`self.<name>` a lifted method touches is another lifted method or a DECLARED
stub (the strip's buttons, combo and fader, which only show; _hide_overlay
and _overlay_strip_down, which are recorded), and every free name it reads
is a builtin, a lifted module name or a declared stand-in (PIL's Image, io,
OpenGL's GL).

What it emits (tests/data/overlay-truth.json, committed; small seeded
images only, nothing from any real job):
  look     _overlay_rgba's pixels and chosen cut-off for grey ramps, a
           transparent cut-out, a grey-paper photo, saturated colours, an L,
           an LA and a palette picture with transparency, across mode x
           invert x cutoff (None, 255, 180, 64, 1, and 0 / 300 / 12.7)
  records  what _apply_overlay_look + set_overlay_look make of a record:
           a missing / null / bool / string / float / out-of-range cut-off,
           3.05 records, pictures
  arrive   _restore_overlay_for_page on a job of sheets of DIFFERENT sizes,
           a revision set, flagged and unflagged pictures, unreadable ones,
           and every record a file can hold that names nothing (-1, True,
           99, '3', a revision gone, a page outside it, a picture gone):
           what is up afterwards, where (overlay_rect), in what tint, fade
           and look, the texture it built, the label, and whether the LAST
           sheet's overlay was taken down
  sizes    overlay_rect for a 2592x1728 sheet under a 5400x3600 sheet, a
           3600x2400 revision page and a picture box: page pixels, never
           stretched to the sheet (a points / pixels bug fails here)
  small    _cad_image_rect, _pts_pair, overlay_picture, _overlay_entry_label,
           _picture_name, b64 reads, the fade label
  decode   what PIL reads out of a PNG -- a sheet as Image.open opens it, a
           picture through _picture_pil -- and _overlay_rgba's masks (sha1)
           and cut-offs over it, for every shape a browser reads otherwise:
           semi-transparent, grey + alpha, palettes, colour keys, ICC- and
           gamma-tagged, 1/2/4/16-bit

Usage:
  python -B tests/overlay-python-truth.py [pdf_fast_viewer.py]          JSON to stdout
  python -B tests/overlay-python-truth.py [pdf_fast_viewer.py] --write  rewrite the snapshot
(PTT_DESKTOP_SRC when no path is given.)
"""
import ast
import base64
import builtins
import copy
import io
import json
import os
import random
import sys
import textwrap

from PIL import Image
import PIL

ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
WRITE = "--write" in sys.argv[1:]
SRC = ARGS[0] if ARGS else os.environ.get("PTT_DESKTOP_SRC", "")
if not SRC or not os.path.exists(SRC):
    raise SystemExit("Give pdf_fast_viewer.py (argument or PTT_DESKTOP_SRC).")
SNAPSHOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data",
                        "overlay-truth.json")

MODULE_SEED = ["_overlay_rgba", "_overlay_auto_cutoff", "_cad_image_rect",
               "_pts_pair", "_OVERLAY_WHITE_PAPER", "_OVERLAY_PAPER_MARGIN",
               "_OVERLAY_ORIGINAL_KNEE"]
GL_METHODS = [
    "set_overlay", "set_overlay_image", "clear_overlay", "set_overlay_color",
    "set_overlay_alpha", "set_overlay_look", "overlay_picture", "overlay_rect",
    "_overlay_is_picture", "_create_overlay_texture",
    "_create_overlay_texture_from_image",
]
# The stand-in canvas's data, and the GL context work that only frames the
# texture upload (which the stand-in keeps instead of uploading).
GL_STUBS = {
    "_overlay_texture", "makeCurrent", "doneCurrent", "_overlay_page",
    "_overlay_source", "_overlay_src_img", "_overlay_size", "_page_sizes",
    "_overlay_offset", "_overlay_shown", "_overlay_align", "_overlay_dragging",
    "update", "overlay_changed", "_overlay_mode", "_overlay_invert",
    "_overlay_cutoff", "_overlay_cutoff_used", "_upload_temp_texture",
    "_images", "_annotations", "_current_page", "_overlay_alpha",
    "_overlay_color", "current_page",
}
WIN_METHODS = [
    "_restore_overlay_for_page", "_restore_picture_overlay",
    "_apply_overlay_look", "_picture_pil", "_picture_key",
    "_overlay_entry_label", "_pictures_on_sheet", "_picture_name",
]
# The window's data, and the strip furniture the arrival only SHOWS on
# (recorded or ignored): the Overlay button, the strip, its picker, its fader
# and label, and the two take-downs (_hide_overlay, _overlay_strip_down),
# which are recorded -- they are what says the last sheet's overlay went.
WIN_STUBS = {
    "metadata", "gl_widget", "_overlay_lost", "_hide_overlay",
    "_overlay_strip_down", "_reset_base_look", "_refresh_overlay_page_combo",
    "_select_overlay_row", "_btn_overlay_toggle", "_show_overlay_toolbar",
    "_overlay_page_combo", "_overlay_alpha_slider", "_overlay_alpha_lbl",
    "_revisions", "_overlay_look_timer", "_overlay_pic_key",
    "_picture_decoded", "_pictures_unread",
}


class _GLStub:
    """OpenGL's GL module, as far as the overlay methods call it."""
    calls = []

    @staticmethod
    def glDeleteTextures(ids):
        _GLStub.calls.append(("delete", list(ids)))


PROVIDED = {"Image": Image, "io": io, "GL": _GLStub}

DESK = open(SRC, "r", encoding="utf-8").read()
TREE = ast.parse(DESK)
LINES = DESK.splitlines(True)
TOP = {}
for n in TREE.body:
    if isinstance(n, (ast.FunctionDef, ast.ClassDef)):
        TOP.setdefault(n.name, n)
    elif isinstance(n, ast.Assign):
        for t in n.targets:
            if isinstance(t, ast.Name):
                TOP.setdefault(t.id, n)


def _class(name):
    node = TOP.get(name)
    if not isinstance(node, ast.ClassDef):
        raise SystemExit("no class %s in %s" % (name, SRC))
    return node


def _member(cls, name):
    for n in cls.body:
        if isinstance(n, ast.FunctionDef) and n.name == name:
            return n
    raise SystemExit("missing %s.%s" % (cls.name, name))


def _text(node):
    for d in getattr(node, "decorator_list", []):
        if not (isinstance(d, ast.Name) and d.id in ("staticmethod", "classmethod")):
            raise SystemExit("%s has a decorator this cannot lift" % node.name)
    first = min([node.lineno] + [d.lineno for d in
                                 getattr(node, "decorator_list", [])])
    return textwrap.dedent("".join(LINES[first - 1:node.end_lineno]))


def _locals(fn):
    out = {a.arg for a in fn.args.args + fn.args.kwonlyargs}
    if fn.args.vararg:
        out.add(fn.args.vararg.arg)
    if fn.args.kwarg:
        out.add(fn.args.kwarg.arg)
    for s in ast.walk(fn):
        if isinstance(s, ast.Name) and isinstance(s.ctx, (ast.Store, ast.Del)):
            out.add(s.id)
        elif isinstance(s, ast.ExceptHandler) and s.name:
            out.add(s.name)
        elif isinstance(s, ast.arg):
            out.add(s.arg)
        elif isinstance(s, (ast.Import, ast.ImportFrom)):
            for a in s.names:
                out.add((a.asname or a.name).split(".")[0])
    return out


def _free(node):
    loc = _locals(node) if isinstance(node, ast.FunctionDef) else set()
    return {s.id for s in ast.walk(node)
            if isinstance(s, ast.Name) and isinstance(s.ctx, ast.Load)
            and s.id not in loc}


def _self_attrs(fn):
    """self.<x>, and (through the window) self.gl_widget.<x> / gl.<x>."""
    out_self, out_gl = set(), set()
    for s in ast.walk(fn):
        if not isinstance(s, ast.Attribute):
            continue
        v = s.value
        if isinstance(v, ast.Name) and v.id == "self":
            out_self.add(s.attr)
        elif isinstance(v, ast.Name) and v.id == "gl":
            out_gl.add(s.attr)
        elif isinstance(v, ast.Attribute) and isinstance(v.value, ast.Name) \
                and v.value.id == "self" and v.attr == "gl_widget":
            out_gl.add(s.attr)
    for s in ast.walk(fn):
        if isinstance(s, ast.Call) and isinstance(s.func, ast.Name) \
                and s.func.id == "getattr" and len(s.args) >= 2 \
                and isinstance(s.args[1], ast.Constant) \
                and isinstance(s.args[0], ast.Name):
            if s.args[0].id == "self":
                out_self.add(s.args[1].value)
            elif s.args[0].id == "gl":
                out_gl.add(s.args[1].value)
    return out_self, out_gl


def _fade_label_expr():
    """`int(alpha * 100)`, as _restore_overlay_for_page writes the fader's
    label -- read out of the method, so a change of rounding there shows."""
    fn = _member(_class("PDFCacheViewer"), "_restore_overlay_for_page")
    found = set()
    for s in ast.walk(fn):
        if isinstance(s, ast.FormattedValue):
            found.add(ast.unparse(s.value))
    if found != {"int(alpha * 100)"}:
        raise SystemExit("_restore_overlay_for_page no longer labels the fade "
                         "int(alpha * 100): %s" % sorted(found))
    return "int(alpha * 100)"


def closure():
    gl_cls, win_cls = _class("GLPageWidget"), _class("PDFCacheViewer")
    problems, want = [], set(MODULE_SEED)
    gl_known = set(GL_METHODS) | GL_STUBS
    for name in GL_METHODS:
        fn = _member(gl_cls, name)
        s, g = _self_attrs(fn)
        for a in sorted((s | g) - gl_known):
            problems.append("GLPageWidget.%s reads self.%s" % (name, a))
        want |= _free(fn)
    for name in WIN_METHODS:
        fn = _member(win_cls, name)
        s, g = _self_attrs(fn)
        for a in sorted(s - set(WIN_METHODS) - WIN_STUBS):
            problems.append("PDFCacheViewer.%s reads self.%s" % (name, a))
        for a in sorted(g - gl_known):
            problems.append("PDFCacheViewer.%s reads gl.%s" % (name, a))
        want |= _free(fn)
    seen, queue, lifted = set(), sorted(want), []
    while queue:
        nm = queue.pop(0)
        if nm in seen:
            continue
        seen.add(nm)
        if nm == "self" or hasattr(builtins, nm) or nm in PROVIDED:
            continue
        node = TOP.get(nm)
        if node is None:
            problems.append("reads %r, which is neither lifted, a builtin nor "
                            "a declared stand-in" % nm)
            continue
        if isinstance(node, ast.ClassDef):
            problems.append("reaches class %s" % nm)
            continue
        lifted.append(nm)
        queue.extend(sorted(_free(node) - seen))
    return problems, lifted


PROBLEMS, MODNAMES = closure()
if PROBLEMS:
    raise SystemExit("the lifted set is not a closure:\n  " + "\n  ".join(PROBLEMS))
FADE_EXPR = _fade_label_expr()

NS = dict(PROVIDED)
mod_nodes = sorted({id(TOP[n]): TOP[n] for n in MODNAMES}.values(),
                   key=lambda n: n.lineno)
exec(compile("\n".join(_text(n) for n in mod_nodes), "<module.lifted>", "exec"), NS)


def _cls_src(name, cls, members):
    body = ["class %s:" % name, "    pass"]
    for m in members:
        body.append(textwrap.indent(_text(_member(cls, m)), "    "))
    return "\n".join(body)


exec(compile(_cls_src("GLBase", _class("GLPageWidget"), GL_METHODS),
             "<GL.lifted>", "exec"), NS)
exec(compile(_cls_src("WinBase", _class("PDFCacheViewer"), WIN_METHODS),
             "<Win.lifted>", "exec"), NS)
FADE = eval(compile("lambda alpha: " + FADE_EXPR, "<fade.lifted>", "eval"), NS)


# ── stand-ins ────────────────────────────────────────────────────────────
class _Signal:
    def emit(self, *a):
        pass


class _Anything:
    """A button, a combo, a fader: takes any call, shows nothing."""
    def __getattr__(self, name):
        return lambda *a, **k: 0


class _Label:
    def __init__(self):
        self.text = None

    def setText(self, t):
        self.text = t


class GL(NS["GLBase"]):
    def __init__(self):
        self.reset([], {})

    def reset(self, images, annotations, sizes=None):
        self._images = list(images)
        self._page_sizes = dict(sizes) if sizes else {i: im.size for i, im in enumerate(images)}
        self._annotations = annotations
        self._current_page = 0
        self._overlay_texture = None
        self._overlay_page = None
        self._overlay_source = None
        self._overlay_src_img = None
        self._overlay_size = None
        self._overlay_offset = [0.0, 0.0]
        self._overlay_shown = True
        self._overlay_align = False
        self._overlay_dragging = False
        self._overlay_mode = "lines"
        self._overlay_invert = False
        self._overlay_cutoff = None
        self._overlay_cutoff_used = None
        self._overlay_alpha = 0.5
        self._overlay_color = [1.0, 0.3, 0.3]
        self.overlay_changed = _Signal()
        self.uploads = []
        self._next_tex = 1

    def current_page(self):
        return self._current_page

    def makeCurrent(self):
        pass

    def doneCurrent(self):
        pass

    def update(self):
        pass

    def _upload_temp_texture(self, img):
        self.uploads.append(img.copy())
        self._next_tex += 1
        return self._next_tex


class Win(NS["WinBase"]):
    def __init__(self, gl):
        self.gl_widget = gl
        self.metadata = {}
        self._revisions = []
        self._overlay_lost = None
        self._btn_overlay_toggle = _Anything()
        self._overlay_page_combo = _Anything()
        self._overlay_alpha_slider = _Anything()
        self._overlay_alpha_lbl = _Label()
        self._overlay_look_timer = None
        self.log = []

    def _hide_overlay(self, forget=False):
        self.log.append(["hide", bool(forget)])
        self.gl_widget.clear_overlay()

    def _overlay_strip_down(self):
        self.log.append(["strip_down"])

    def _reset_base_look(self):
        self.log.append(["base_look"])

    def _refresh_overlay_page_combo(self, pick_first=True):
        pass

    def _select_overlay_row(self, data):
        pass

    def _show_overlay_toolbar(self):
        pass


def rgba64(img):
    return base64.b64encode(img.convert("RGBA").tobytes()).decode("ascii")


def pic(img):
    return {"w": img.size[0], "h": img.size[1], "mode": img.mode, "rgba": rgba64(img)}


def png64(img):
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


# ── 1. the look: pixels and the cut-off chosen ───────────────────────────
def images():
    rnd = random.Random(8)
    out = {}
    ramp = Image.new("RGB", (256, 1))
    ramp.putdata([(v, v, v) for v in range(256)])
    out["ramp"] = ramp
    cols = Image.new("RGB", (8, 8))
    px = []
    for r in (0, 255, 128, 37):
        for g in (0, 255):
            for b in (0, 255, 200, 9):
                px.append((r, g, b))
    while len(px) < 64:
        px.append((rnd.randrange(256), rnd.randrange(256), rnd.randrange(256)))
    cols.putdata(px)
    out["colours"] = cols
    cut = Image.new("RGBA", (8, 4))
    cut.putdata([(0, 0, 0, 0), (0, 0, 0, 255), (230, 230, 230, 128), (255, 255, 255, 0),
                 (12, 200, 40, 255), (12, 200, 40, 1), (90, 90, 90, 254), (250, 250, 250, 255)]
                + [(rnd.randrange(256), rnd.randrange(256), rnd.randrange(256),
                    rnd.choice((0, 255, rnd.randrange(256)))) for _ in range(24)])
    out["cutout"] = cut
    # A phone photo of a print: grey paper with grain, dark lines across it.
    paper = Image.new("L", (32, 24))
    pv = []
    for y in range(24):
        for x in range(32):
            if y % 6 == 0 or x % 9 == 0:
                pv.append(rnd.randrange(10, 60))
            else:
                pv.append(max(0, min(255, 205 + rnd.randrange(-9, 10))))
    paper.putdata(pv)
    out["grey_paper"] = paper
    la = Image.new("LA", (8, 8))
    la.putdata([(rnd.randrange(256), rnd.choice((0, 255, 77))) for _ in range(64)])
    out["la"] = la
    pal = Image.new("P", (8, 8))
    pal.putpalette([c for i in range(256) for c in ((i * 7) % 256, (i * 13) % 256, (i * 29) % 256)])
    pal.putdata([rnd.randrange(16) for _ in range(64)])
    pal.info["transparency"] = 3
    out["palette"] = pal
    return out


IMAGES = images()
CUTOFFS = [None, 255, 180, 64, 1]
EXTRA_CUTOFFS = [0, 300, 12.7, -5]


def look_truth():
    rows = []
    for name, im in IMAGES.items():
        cuts = CUTOFFS + (EXTRA_CUTOFFS if name in ("ramp", "cutout") else [])
        for mode in ("lines", "original"):
            for inv in (False, True):
                for c in cuts:
                    o = NS["_overlay_rgba"](im, mode, inv, c)
                    rows.append({"img": name, "mode": mode, "invert": inv, "cutoff": c,
                                 "used": o.info["cutoff"], "out": base64.b64encode(o.tobytes()).decode("ascii")})
    return rows


# ── 2. a record's look ───────────────────────────────────────────────────
RECORDS = [
    None, [], {}, {"overlay_page": 1}, {"image_id": "a1b2c3d4"},
    {"overlay_page": 1, "cutoff": None}, {"image_id": "x", "cutoff": None},
    {"cutoff": True}, {"cutoff": False}, {"cutoff": "180"}, {"cutoff": 180.9},
    {"cutoff": 0}, {"cutoff": -5}, {"cutoff": 300}, {"cutoff": [1]}, {"cutoff": {}},
    {"cutoff": 64, "mode": "original", "invert": True},
    {"mode": "ORIGINAL"}, {"mode": "original"}, {"invert": 1}, {"invert": "yes"},
    {"invert": True}, {"image_id": "", "mode": "original"}, {"image_id": 0},
    {"image_id": "p", "mode": "original", "invert": True, "cutoff": 200},
    {"rev_id": "rv-a", "rev_page": 0}, {"rev_id": "rv-a", "cutoff": 1},
]


def record_truth():
    gl = GL()
    win = Win(gl)
    out = []
    for rec in RECORDS:
        gl.set_overlay_look()
        win._apply_overlay_look(rec)
        out.append({"record": rec, "look": [gl._overlay_mode, gl._overlay_invert, gl._overlay_cutoff]})
    return out


# ── 3. the arrival: what is up afterwards ────────────────────────────────
def sheet_img(w, h, shade, step, seed):
    rnd = random.Random(seed)
    im = Image.new("RGB", (w, h), (255, 255, 255))
    px = im.load()
    for y in range(h):
        for x in range(w):
            if x % step == 0 or y % step == 0:
                px[x, y] = (shade, shade, shade)
            elif rnd.random() < 0.05:
                v = rnd.randrange(150, 256)
                px[x, y] = (v, v, rnd.randrange(150, 256))
    return im


SHEETS = [sheet_img(24, 16, 40, 5, 1), sheet_img(36, 24, 90, 7, 2),
          sheet_img(30, 20, 10, 4, 3), sheet_img(20, 28, 140, 3, 4)]
REVS = [sheet_img(40, 26, 30, 6, 5), sheet_img(18, 14, 60, 4, 6)]


def picture_img(seed, size=(14, 10), alpha=True):
    rnd = random.Random(seed)
    im = Image.new("RGBA" if alpha else "L", size)
    if alpha:
        im.putdata([(rnd.randrange(256), rnd.randrange(256), rnd.randrange(256),
                     rnd.choice((0, 255, 255, rnd.randrange(256)))) for _ in range(size[0] * size[1])])
    else:
        im.putdata([rnd.choice((215, 212, 218, 30)) for _ in range(size[0] * size[1])])
    return im


PICS = {"cut": picture_img(11), "grey": picture_img(12, (12, 9), alpha=False)}
GOOD = png64(PICS["cut"])
GREY = png64(PICS["grey"])


def ent(eid, pts, b64, flag=True, **kw):
    e = {"subtype": "cad", "etype": "image", "id": eid, "pts": pts, "color": [1, 1, 1, 1],
         "width": 1, "layer": "0", "group": "", "visible": True, "img_b64": b64, "aspect": 1.4}
    if flag:
        e["as_overlay"] = True
    e.update(kw)
    return e


ANNOTS = {
    0: [{"type": "highlight", "points": [[1, 1], [2, 2]]},
        ent("aa11bb22", [[20, 14], [2, 3]], GOOD),            # Picture 1: corners drawn backwards
        ent("cc33dd44", [[1, 1], [9, 7]], GREY, flag=False),  # Picture 2: a picture again
        ent("ee55ff66", [[0, 0], [5, 5]], GREY)],             # Picture 3
    1: [ent("dup00001", [[0, 0], [4, 4]], GOOD, flag=False),   # the FIRST with the id is not flagged
        ent("dup00001", [[1, 1], [6, 6]], GOOD),
        ent("bad00001", [[0, 0], [6, 6]], "not base64 at all !!"),
        ent("bad00002", [[0, 0], [6, 6]], base64.b64encode(b"not a picture").decode("ascii")),
        ent("emp00001", [[0, 0], [6, 6]], ""),
        ent("one00001", [[3, 3]], GOOD)],
    2: [ent("gry00001", [[2, 2], [14, 11]], GREY)],
}
REV_SETS = [{"id": "rv-a", "date": "11/01/2026", "description": "Reissue A", "images": list(REVS),
             "page_labels": ["X1.0", "X1.2"], "match": {"0": 0, "2": 1}}]
# How the web adopts the same file: the revision whose drawings were lost is
# parked out of the desktop's _revisions at load; the web keeps its record
# with no pages.
WEB_REVS = [{"id": "rv-a", "pageCount": 2, "_setIndex": 0},
            {"id": "rv-lost", "pageCount": 0, "_setIndex": 1}]
SC = [1.0, 0.3, 0.3]


def R(**kw):
    base = {"offset": [0.0, 0.0], "color": list(SC), "alpha": 0.5}
    base.update(kw)
    return base


ARRIVALS = [
    # name, page, record, the sheet whose overlay is up when he leaves it
    ("sheet, offset, 3.05 look", 0, R(overlay_page=1, offset=[3.0, -2.0], color=[0.2, 0.4, 1.0], alpha=0.65), 2),
    ("sheet, Original + Invert, cut 180", 0, R(overlay_page=2, mode="original", invert=True, cutoff=180, alpha=1.0), None),
    ("sheet, Auto", 1, R(overlay_page=3, mode="lines", invert=False, cutoff=None, alpha=0.29), 2),
    ("sheet, itself", 3, R(overlay_page=3, offset=[1.5, 2.25]), None),
    ("sheet, no tint or fade saved", 1, {"overlay_page": 0}, None),
    ("revision, offset", 0, R(rev_id="rv-a", rev_page=0, offset=[-4.0, 1.0], color=[0.0, 0.8, 0.3]), 1),
    ("revision, Lines, cut 64", 2, R(rev_id="rv-a", rev_page=1, mode="lines", invert=True, cutoff=64), None),
    ("picture, Original + Invert, cut 200", 0, R(image_id="aa11bb22", matched=False, home=[[20, 14], [2, 3]],
                                                  mode="original", invert=True, cutoff=200, alpha=0.8), 1),
    ("picture, Auto", 2, R(image_id="gry00001", matched=True, home=[[2, 2], [14, 11]], matched_size=[12, 9],
                            mode="lines", invert=False, cutoff=None, alpha=0.57), 0),
    ("picture, no cut-off saved: Auto", 0, {"image_id": "ee55ff66", "color": [0.9, 0.1, 0.9], "alpha": 0.4}, None),
    ("picture, the first with its id is a picture again", 1, R(image_id="dup00001"), 0),
    # records that name nothing: the last sheet's overlay must not stay up
    ("sheet -1 (an old file)", 1, R(overlay_page=-1), 0),
    ("sheet True", 1, R(overlay_page=True), 0),
    ("sheet 99", 1, R(overlay_page=99), 0),
    ("sheet '3'", 1, R(overlay_page="3"), 0),
    ("sheet 2.5", 1, R(overlay_page=2.5), 0),
    ("sheet null", 1, R(overlay_page=None), 0),
    ("no source at all", 1, R(), 0),
    ("an empty record", 1, {}, 0),
    ("revision gone", 1, R(rev_id="gone", rev_page=0), 0),
    ("revision whose drawings were lost", 1, R(rev_id="rv-lost", rev_page=0), 0),
    ("revision page outside it", 1, R(rev_id="rv-a", rev_page=2), 0),
    ("revision page -1", 1, R(rev_id="rv-a", rev_page=-1), 0),
    ("revision page null", 1, R(rev_id="rv-a", rev_page=None), 0),
    ("revision page True", 1, R(rev_id="rv-a", rev_page=True), 0),
    ("revision page 1.0", 1, R(rev_id="rv-a", rev_page=1.0), 0),
    ("sheet 2.0", 1, R(overlay_page=2.0), 0),
    ("revision gone, nothing up before", 1, R(rev_id="gone", rev_page=0), None),
    ("picture gone", 0, R(image_id="missing1"), 2),
    ("picture a picture again", 0, R(image_id="cc33dd44"), 2),
    ("picture unreadable (not base64)", 1, R(image_id="bad00001"), 2),
    ("picture unreadable (not a picture)", 1, R(image_id="bad00002"), 2),
    ("picture with no pixels", 1, R(image_id="emp00001"), 2),
    ("no record, overlay up before", 2, None, 1),
    ("no record, nothing up before", 2, None, None),
]


def arrive_truth():
    gl = GL()
    win = Win(gl)
    out = []
    for name, page, rec, before in ARRIVALS:
        gl.reset(SHEETS, copy.deepcopy(ANNOTS))
        win._revisions = [dict(r) for r in REV_SETS]
        win.metadata = {"page_labels": ["X1.0", "X1.1", "X1.2", "X1.3"],
                        "page_overlays": {}}
        win._picture_decoded = None
        win._pictures_unread = {}
        if before is not None:
            gl.set_overlay_look("lines", False, 255)
            gl.set_overlay(before)
            gl._overlay_offset = [7.0, 7.0]
            gl.set_overlay_color(0.1, 0.1, 0.1)
            gl.set_overlay_alpha(0.33)
        if rec is not None:
            win.metadata["page_overlays"][str(page)] = rec
        gl._current_page = page
        win.log = []
        win._overlay_alpha_lbl.text = None
        gl.uploads = []
        raised = None
        try:
            win._restore_overlay_for_page(page)
        except Exception as err:          # a record no build of 3.06 writes
            raised = type(err).__name__
        up = None
        if gl._overlay_page is not None:
            src = gl._overlay_source
            up = {"page": gl._overlay_page, "source": src,
                  "rect": list(gl.overlay_rect()) if gl.overlay_rect() is not None else None,
                  "color": list(gl._overlay_color), "alpha": gl._overlay_alpha,
                  "look": [gl._overlay_mode, gl._overlay_invert, gl._overlay_cutoff],
                  "used": gl._overlay_cutoff_used,
                  "label": win._overlay_alpha_lbl.text}
        tex = gl.uploads[-1] if gl.uploads else None
        out.append({"name": name, "page": page, "record": rec, "before": before,
                    "log": win.log, "raised": raised, "up": up,
                    "texture": base64.b64encode(tex.tobytes()).decode("ascii") if tex is not None else None,
                    "built": len(gl.uploads)})
    return out


# ── 4. sizes: page pixels, never the sheet's ─────────────────────────────
def sizes_truth():
    base = (2592, 1728)
    big = (5400, 3600)
    rev = (3600, 2400)
    gl = GL()
    win = Win(gl)
    blank = {base: Image.new("L", base, 255), big: Image.new("L", big, 255), rev: Image.new("L", rev, 255)}
    out = []
    cases = [
        ("a 5400x3600 sheet over a 2592x1728 sheet", R(overlay_page=1, offset=[-120.5, 64.0])),
        ("the 2592x1728 sheet over the 5400x3600 one", R(overlay_page=0, offset=[10.0, 20.0])),
        ("a 3600x2400 revision page", R(rev_id="rv-big", rev_page=0, offset=[33.0, -7.5])),
        ("a picture's box", R(image_id="bigpic01", cutoff=None)),
    ]
    for i, (name, rec) in enumerate(cases):
        page = 1 if i == 1 else 0
        pics = {0: [ent("bigpic01", [[2400.0, 1500.5], [130.25, 96.0]], GREY)], 1: []}
        gl.reset([blank[base], blank[big]], pics)
        win._revisions = [{"id": "rv-big", "images": [blank[rev]]}]
        win.metadata = {"page_overlays": {str(page): rec}}
        win._picture_decoded = None
        win._pictures_unread = {}
        gl._current_page = page
        win._restore_overlay_for_page(page)
        out.append({"name": name, "page": page, "record": rec,
                    "sizes": [list(base), list(big)], "rev": list(rev),
                    "pts": pics[0][0]["pts"],
                    "rect": list(gl.overlay_rect())})
    return out


# ── 5. the small ones ────────────────────────────────────────────────────
def small_truth():
    rect_cases = [None, {}, {"pts": []}, {"pts": [[1, 2]]}, {"pts": [[5, 6], [1, 2]]},
                  {"pts": [[1.5, 9], [3, -2], [100, 100]]}, {"pts": [[0, 0], [0, 0]]}]
    pair_cases = [None, [], [[1, 2]], [[1, 2], [3, 4]], [[1, 2], [3]], [["1.5", 2], [3, "4e1"]],
                  [[1, 2], ["x", 4]], [[True, 2], [3, 4]], [{"0": 1}, [3, 4]], "ab",
                  [[1, 2], [3, 4], [5, 6]], [[1, None], [3, 4]]]
    gl = GL()
    gl.reset(SHEETS, copy.deepcopy(ANNOTS))
    pic_cases = [(0, "aa11bb22"), (0, "cc33dd44"), (0, "ee55ff66"), (0, "nope"), (0, ""),
                 (1, "dup00001"), (1, "one00001"), (2, "gry00001"), (5, "aa11bb22")]
    md_cases = [
        {}, {"page_labels": ["X1.0", "X1.1"]},
        {"page_labels": ["X1.0", " X1.1 "], "page_names": {"1": "Foundation"}},
        {"page_labels": ["X1.0"], "page_labels_custom": {"0": "X9.9"}, "page_names": {"0": "X9.9"}},
        {"page_labels": [None, ""], "page_names": {"1": "  Roof  "}},
        {"page_labels_custom": {"3": " "}, "page_labels": ["a", "b", "c", "X1.3"]},
    ]
    win = Win(gl)
    labels = []
    for md in md_cases:
        win.metadata = md
        labels.append({"md": md, "labels": [win._overlay_entry_label(i) for i in range(4)]})
    names = []
    for page in (0, 1, 2):
        gl._current_page = page
        names.append({"page": page, "names": {eid: win._picture_name(eid)
                                              for eid in ("aa11bb22", "cc33dd44", "ee55ff66",
                                                          "dup00001", "gry00001", "zzz")}})
    b64_cases = [GREY, GREY[:10] + "\n" + GREY[10:], GREY[:10] + "!" + GREY[10:],
                 "YQ==", "YQ", "Y Q==", "", "####", base64.b64encode(b"\x00\x01\xff").decode()]
    b64 = []
    for s in b64_cases:
        try:
            got = base64.b64decode(s)
            b64.append({"in": s, "bytes": base64.b64encode(got).decode("ascii")})
        except Exception as err:
            b64.append({"in": s, "error": type(err).__name__})
    return {
        "rects": [{"ent": c, "rect": (list(NS["_cad_image_rect"](c))
                                       if NS["_cad_image_rect"](c) is not None else None)} for c in rect_cases],
        "pairs": [{"raw": c, "pair": NS["_pts_pair"](c)} for c in pair_cases],
        "pictures": [{"page": p, "eid": e, "found": (gl.overlay_picture(e, p) or {}).get("pts")}
                     for p, e in pic_cases],
        "labels": labels,
        "names": names,
        "b64": b64,
        "fade": [[v, FADE(v / 100)] for v in range(0, 101)] + [[None, FADE(x)] for x in (0.05, 0.29, 0.57, 1.0, 0.333)],
    }


# ── 6. reading a PNG as PIL reads it ─────────────────────────────────────
# What the desktop hands _overlay_rgba from a PNG: a sheet or a revision page
# as it is opened (Image.open + load, as the project load decodes every
# page), a picture through _picture_pil (lifted: convert("RGBA")). The web
# reads these PNGs itself (overlay-look.js pngRgba / pngAutoCutoff) wherever
# a browser's decode would differ: semi-transparent pixels (a 2D canvas keeps
# them premultiplied), a colour profile or a gamma chunk (a browser
# colour-manages), 16 bits, a colour key, palettes. Small seeded images;
# each mask and each picture's RGBA kept as its sha1, so the snapshot stays
# small.
import hashlib
import struct
import zlib

DECODE_LOOKS = [("lines", False, None), ("lines", True, None), ("lines", False, 255),
                ("original", False, None), ("original", True, 200)]


def _sha(b):
    return hashlib.sha1(b).hexdigest()


def paper_lines(paper, w, h, mode="RGB", alpha=None, seed=1):
    """Paper of one shade with a little grain, dark lines, a red and a blue
    pen mark: a photographed or scanned print."""
    rnd = random.Random(seed)
    im = Image.new("RGBA", (w, h))
    px = []
    for y in range(h):
        for x in range(w):
            if x % 7 == 0 or y % 5 == 0:
                v = (rnd.randrange(20, 70),) * 3
            elif 2 <= x < 6 and 1 <= y < 4:
                v = (190, 50, 45)
            elif 9 <= x < 13 and 6 <= y < 9:
                v = (40, 70, 170)
            else:
                g = max(0, min(255, paper + rnd.randrange(-2, 3)))
                v = (g, g, g)
            a = 255 if alpha is None else (alpha(x, y) if callable(alpha) else alpha)
            px.append(v + (a,))
    im.putdata(px)
    if mode == "RGBA":
        return im
    if mode == "LA":
        return im.convert("LA")
    return im.convert(mode)


def pil_png(im, **kw):
    buf = io.BytesIO()
    im.save(buf, format="PNG", **kw)
    return buf.getvalue()


def _chunk(t, d):
    return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)


def with_chunk(png, ctype, data):
    """`png` with one more chunk straight after its IHDR."""
    at = 8 + 8 + 13 + 4
    return png[:at] + _chunk(ctype, data) + png[at:]


def hand_png(w, h, depth, ctype, rows, trns=None):
    """A PNG written by hand (PIL writes no 16-bit RGB, nor 2- and 4-bit
    grey), its rows filtered every way in turn -- None, Sub, Up, Average,
    Paeth -- so a reader's unfiltering is held at every sample size."""
    chans = {0: 1, 2: 3, 4: 2, 6: 4}[ctype]
    bpp = max(1, chans * depth // 8)
    out, prev = [], bytes(len(rows[0]))
    for y, r in enumerate(rows):
        t = y % 5
        enc = bytearray([t])
        for i in range(len(r)):
            a = r[i - bpp] if i >= bpp else 0
            b = prev[i]
            c = prev[i - bpp] if i >= bpp else 0
            if t == 0:
                p = 0
            elif t == 1:
                p = a
            elif t == 2:
                p = b
            elif t == 3:
                p = (a + b) // 2
            else:
                q = a + b - c
                pa, pb, pc = abs(q - a), abs(q - b), abs(q - c)
                p = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
            enc.append((r[i] - p) & 255)
        out.append(bytes(enc))
        prev = r
    png = (b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, depth, ctype, 0, 0, 0)))
    if trns is not None:
        png += _chunk(b"tRNS", trns)
    return png + _chunk(b"IDAT", zlib.compress(b"".join(out))) + _chunk(b"IEND", b"")


def _rows16(w, h, chans, fn):
    return [b"".join(struct.pack(">" + "H" * chans, *fn(x, y)) for x in range(w)) for y in range(h)]


def _v16(x, y):
    return (x * 1031 + y * 4099 + 0x80) % 65536


def _rows_sub(w, h, depth, fn):
    per = 8 // depth
    rows = []
    for y in range(h):
        row = bytearray((w * depth + 7) // 8)
        for x in range(w):
            row[x // per] |= (fn(x, y) & ((1 << depth) - 1)) << (8 - depth * (x % per + 1))
        rows.append(bytes(row))
    return rows


def _s15(v):
    return struct.pack(">i", int(round(v * 65536)))


def _icc(rgbxyz, trc):
    """A v2 matrix/TRC display profile -- enough for a browser to
    colour-manage by, which is the whole point of the case."""
    tags = [(sig, b"XYZ " + b"\0" * 4 + b"".join(_s15(v) for v in xyz))
            for sig, xyz in zip((b"rXYZ", b"gXYZ", b"bXYZ"), rgbxyz)]
    tags.append((b"wtpt", b"XYZ " + b"\0" * 4 + _s15(0.9642) + _s15(1.0) + _s15(0.8249)))
    tags += [(sig, trc) for sig in (b"rTRC", b"gTRC", b"bTRC")]
    off = 128 + 4 + 12 * len(tags)
    table, data = b"", b""
    for sig, body in tags:
        body += b"\0" * (-len(body) % 4)
        table += sig + struct.pack(">II", off + len(data), len(body))
        data += body
    head = (struct.pack(">I", off + len(data)) + b"\0" * 4 + struct.pack(">I", 0x02100000)
            + b"mntrRGB XYZ " + b"\0" * 12 + b"acsp" + b"\0" * 28
            + _s15(0.9642) + _s15(1.0) + _s15(0.8249) + b"\0" * 48)
    return head + struct.pack(">I", len(tags)) + table + data


_SRGB_TRC = (b"para" + b"\0" * 4 + struct.pack(">HH", 3, 0) + _s15(2.4) + _s15(1 / 1.055)
             + _s15(0.055 / 1.055) + _s15(1 / 12.92) + _s15(0.04045))
ICC_P3 = _icc([(0.5151, 0.2412, -0.0011), (0.2920, 0.6922, 0.0419), (0.1571, 0.0666, 0.7841)], _SRGB_TRC)
ICC_ADOBE = _icc([(0.6097, 0.3111, 0.0195), (0.2053, 0.6257, 0.0609), (0.1492, 0.0632, 0.7446)],
                 b"curv" + b"\0" * 4 + struct.pack(">IH", 1, 563))


def imported(im, icc=None):
    """A picture as 'Overlay to compare' stores it (_import_image_file:
    convert('RGBA'), then save; PIL carries the profile into the file)."""
    if icc:
        im.info["icc_profile"] = icc
    pim = im.convert("RGBA")
    return pil_png(pim, icc_profile=icc) if icc else pil_png(pim)


def decode_cases():
    W, H = 23, 11
    pal = paper_lines(244, W, H).convert("P", palette=Image.ADAPTIVE, colors=24)
    pal_alpha = pal.copy()
    pal4 = paper_lines(236, W, H).convert("P", palette=Image.ADAPTIVE, colors=12)
    rnd = random.Random(31)
    trn_table = bytes(rnd.choice((0, 255, rnd.randrange(256))) for _ in range(24))
    cases = [
        ("alpha 128 on paper 248", pil_png(paper_lines(248, W, H, "RGBA", alpha=128))),
        ("alpha 64 on paper 248", pil_png(paper_lines(248, W, H, "RGBA", alpha=64, seed=2))),
        ("an alpha ramp on paper 230", pil_png(paper_lines(230, W, H, "RGBA", alpha=lambda x, y: (x * 37 + y * 11) % 256, seed=3))),
        ("one pixel (10, 20, 30, 7)", pil_png(Image.new("RGBA", (1, 1), (10, 20, 30, 7)))),
        ("grey with alpha 180 on paper 236", pil_png(paper_lines(236, W, H, "LA", alpha=180, seed=4))),
        ("grey on paper 236 (plain)", pil_png(paper_lines(236, W, H, "L", seed=5))),
        ("RGB on paper 240 (plain)", pil_png(paper_lines(240, W, H, seed=6))),
        ("bilevel", pil_png(paper_lines(255, W, H, "L", seed=7).convert("1"))),
        ("a palette (plain)", pil_png(pal)),
        ("a palette with an alpha table", pil_png(pal_alpha, transparency=trn_table)),
        ("a 4-bit palette, one index clear", pil_png(pal4, bits=4, transparency=0)),
        ("RGB with a colour key on its paper", pil_png(paper_lines(236, W, H, seed=8), transparency=(236, 236, 236))),
        ("grey with a colour key on its paper", pil_png(paper_lines(236, W, H, "L", seed=8), transparency=236)),
        ("a photo tagged Display P3, imported", imported(paper_lines(230, W, H, seed=9), ICC_P3)),
        ("a photo tagged Adobe RGB, imported", imported(paper_lines(230, W, H, seed=9), ICC_ADOBE)),
        ("the same photo, no profile, imported", imported(paper_lines(230, W, H, seed=9))),
        ("RGB with a gamma chunk", with_chunk(pil_png(paper_lines(238, W, H, seed=10)), b"gAMA", struct.pack(">I", 55555))),
        ("2-bit grey", hand_png(W, H, 2, 0, _rows_sub(W, H, 2, lambda x, y: (x + 2 * y) % 4))),
        ("4-bit grey", hand_png(W, H, 4, 0, _rows_sub(W, H, 4, lambda x, y: (x * 3 + y) % 16))),
        ("16-bit grey", hand_png(W, H, 16, 0, _rows16(W, H, 1, lambda x, y: (_v16(x, y) if x % 3 else x * 9,)))),
        ("16-bit grey with a colour key", hand_png(W, H, 16, 0, _rows16(W, H, 1, lambda x, y: ((x * 7) % 256,)),
                                                   trns=struct.pack(">H", 21))),
        ("16-bit RGB", hand_png(W, H, 16, 2, _rows16(W, H, 3, lambda x, y: (_v16(x, y), _v16(y, x), (_v16(x, y) * 3) % 65536)))),
        ("16-bit RGBA", hand_png(W, H, 16, 6, _rows16(W, H, 4, lambda x, y: (_v16(x, y), _v16(y, x), 40000, 30000 + x * 1000)))),
        ("16-bit grey with alpha", hand_png(W, H, 16, 4, _rows16(W, H, 2, lambda x, y: (_v16(x, y), 50000 - y * 3000)))),
        ("RGBA filtered every way", hand_png(W, H, 8, 6, [bytes(((x * 11 + y * 29 + k * 67) % 256) if k < 3 else ((x * y * 13) % 256)
                                                               for x in range(W) for k in range(4)) for y in range(H)])),
        ("RGB filtered every way (plain)", hand_png(W, H, 8, 2, [bytes((x * 17 + y * 5 + k * 91) % 256 for x in range(W) for k in range(3))
                                                                 for y in range(H)])),
    ]
    return cases


def decode_truth():
    gl = GL()
    win = Win(gl)
    out = []
    for n, (name, png) in enumerate(decode_cases()):
        b64 = base64.b64encode(png).decode("ascii")
        row = {"name": name, "png": b64, "kinds": {}}
        for kind in ("sheet", "picture"):
            if kind == "sheet":
                src = Image.open(io.BytesIO(png))
                src.load()
            else:
                win._picture_decoded = None
                win._pictures_unread = {}
                src = win._picture_pil({"id": "dec%05d" % n, "img_b64": b64})
                if src is None:
                    row["kinds"][kind] = {"unreadable": True}
                    continue
            k = {"mode": src.mode, "looks": []}
            if kind == "picture":
                k["rgba"] = _sha(src.tobytes())
            for mode, inv, cut in DECODE_LOOKS:
                o = NS["_overlay_rgba"](src, mode, inv, cut)
                k["looks"].append([mode, inv, cut, o.info["cutoff"], _sha(o.tobytes())])
            row["kinds"][kind] = k
        out.append(row)
    return out


out = {
    "pil": PIL.__version__,
    "lifted": {"module": MODNAMES, "gl": GL_METHODS, "win": WIN_METHODS, "fade": FADE_EXPR},
    "images": {k: pic(v) for k, v in IMAGES.items()},
    "look": look_truth(),
    "records": record_truth(),
    "sheets": [pic(s) for s in SHEETS],
    "revs": [pic(s) for s in REVS],
    "web_revisions": WEB_REVS,
    "annotations": ANNOTS,
    "pictures": {"aa11bb22": pic(PICS["cut"].convert("RGBA")), "ee55ff66": pic(PICS["grey"].convert("RGBA")),
                 "dup00001": pic(PICS["cut"].convert("RGBA")), "gry00001": pic(PICS["grey"].convert("RGBA"))},
    "arrive": arrive_truth(),
    "sizes": sizes_truth(),
    "small": small_truth(),
    "decode": decode_truth(),
}
text = json.dumps(out, indent=None, ensure_ascii=True, separators=(",", ":")) + "\n"
if WRITE:
    with open(SNAPSHOT, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print("wrote %s: %d look rows, %d records, %d arrivals, %d bytes"
          % (os.path.basename(SNAPSHOT), len(out["look"]), len(out["records"]),
             len(out["arrive"]), len(text)), flush=True)
else:
    sys.stdout.write(text)
