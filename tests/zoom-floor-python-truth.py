"""Ground truth for ZOOMING OUT STOPS AT THE WHOLE SHEET, from the desktop app.

Desktop 3.06 stops a plain wheel notch out, a pinch and the minus button at
Fit, with the sheet centred; Shift on the wheel goes past (3.07: Ctrl+Shift
when the wheel scrolls the page). The methods that decide it are lifted out
of pdf_fast_viewer.py BY TEXT (through `ast`, so a method is exactly its own
lines) and run as the methods of two small stand-ins for the canvas and the
window, so the browser port (js/render/zoom-floor.js) is held to the
desktop's own code rather than to a transcription of it:

  * GLPageWidget: set_zoom, get_zoom, zoom_fit, fit_view, fit_zoom,
    wants_zoom_floor, zoom_floor, at_zoom_floor, shows_fit, land_on_fit,
    floor_takes_notch, _floor_refused_notch, _note_past_fit,
    below_fit_by_choice, _zoom_chosen, _is_turn_raise, _zoom_about,
    _canvas_resized, zoom_to_measurement, wheelEvent and _FIT_EPS -- and
    set_page, whose turn forgets the last raise and puts the pan back in
    the middle;
  * PDFCacheViewer: _apply_default_zoom, _turn_zoom_settle, zoom_in,
    zoom_out, update_zoom_label, _say_zoom_floor_once, _zoom_out_tip,
    _hold_turn_zoom, _settle_held_turn_zoom, _zoom_label_refresh, zoom_fit,
    _set_zoom_100, and the wheel line of _show_shortcuts (_wheel_help, its
    own three statements);
  * ...and the page turns, whole: next_page, prev_page (Page Down / Up),
    go_to_page (a thumbnail, a jump), the Newest landing every one of them
    makes (_land_on_page), show_sheet_version (the version bar, the matrix:
    a turn HELD until the revision it asked for is up, then settled once),
    go_to_page_own_version, hide_revision_preview, and the Items list's jump
    to an item (_on_item_activated, go_to_item: the turn first, THEN
    zoom_to_measurement -- the item zoom is his, a number);
  * SettingsDialog._zoom_floor_words and the zoom-stop box's tooltip;
  * _RefCanvas.wheelEvent: the picture windows (a revision page on its own,
    the Diff), which stop at their picture's Fit and go on to half with Shift;
  * the module's _zoom_stops_at_fit and DEFAULT_SETTINGS, reached by the
    closure walk.

THE LIFTED SET MUST BE A CLOSURE, checked BEFORE anything runs: every
`self.<name>` a lifted method touches is another lifted method, a lifted
class attribute or a DECLARED stub, and every free name it reads is a
builtin, a lifted module name or a DECLARED stand-in (Qt's modifier bits,
QApplication.keyboardModifiers, math, json).

Each scenario is a list of steps (the wheel, a pinch, the buttons, a drag, a
page turn, a resize, a jump to an item, a flip to a revision on other paper,
a setting changed); after every step the trace records zoom, pan, the
readout, the zoom he chose, past-Fit, and what was said. The flip is the one
step the stand-in plays itself: set_page_preview is GL texture work, and
"Zoom and pan are untouched" (its own words) is all it does to the view --
so the stand-in's _page_size answers the revision's size, as the desktop's
does, and nothing else moves. tests/zoom-floor.mjs replays the same steps on the web port
and diffs it, from the committed tests/data/zoom-floor-truth.json on a fresh
clone and live against this script when the desktop source is here.

Usage:
  python -B tests/zoom-floor-python-truth.py [pdf_fast_viewer.py]          JSON to stdout
  python -B tests/zoom-floor-python-truth.py [pdf_fast_viewer.py] --write  rewrite the snapshot
(PTT_DESKTOP_SRC when no path is given.)
"""
import ast
import builtins
import json
import math
import os
import sys
import textwrap

ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
WRITE = "--write" in sys.argv[1:]
SRC = ARGS[0] if ARGS else os.environ.get("PTT_DESKTOP_SRC", "")
if not SRC or not os.path.exists(SRC):
    raise SystemExit("Give pdf_fast_viewer.py (argument or PTT_DESKTOP_SRC).")
SNAPSHOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data",
                        "zoom-floor-truth.json")

GL_METHODS = [
    "set_zoom", "get_zoom", "zoom_fit", "fit_view", "fit_zoom",
    "wants_zoom_floor", "zoom_floor", "at_zoom_floor", "shows_fit",
    "land_on_fit", "floor_takes_notch", "_floor_refused_notch",
    "_note_past_fit", "below_fit_by_choice", "_zoom_chosen",
    "_is_turn_raise", "_zoom_about", "_canvas_resized",
    "zoom_to_measurement", "wheelEvent", "set_page",
]
GL_CLASS_ATTRS = ["_FIT_EPS"]
# The stand-in's data, and the canvas's other business: the photo-marker
# preview and the scale tip the wheel stands down first (not the floor's).
GL_STUBS = {
    "_current_page", "_page_sizes", "_page_size", "width", "height",
    "_main_window", "update", "_zoom", "_pan_x", "_pan_y",
    "_past_fit_by_choice", "_past_fit_zoom", "_zoom_base",
    "_zoom_base_fit", "_raise_rec", "_canvas_seen", "current_page",
    "preview_key", "_wheel_mode",
    "_photo_hover_step", "_photo_hover_cancel", "_scale_tip_hide",
    # set_page's other business: the drawing list it checks the index
    # against, the revision it takes down (clear_page_preview: only the
    # picture), and the selection and CAD state it drops with the sheet.
    "_images", "_preview_tex", "clear_page_preview",
    "_current_measurement", "_sel_meas", "_sel_vert_idx", "_cad_sel",
    "_cad_hover", "_cad_vert_drag", "_pre_drag_committed",
    "annotations_changed", "_cad_grip_base", "_cad_grip_grab",
    "_cad_rot_arm", "_cad_tab_cycle", "_sel_stroke", "sheet_shown",
    # ...and what the page turns ask of the canvas.
    "page_count", "_overlay_page", "_overlay_shown",
    "_measurement_group", "select_measurement", "version_items",
}
WIN_METHODS = [
    "_apply_default_zoom", "_turn_zoom_settle", "zoom_in", "zoom_out",
    "update_zoom_label", "_say_zoom_floor_once", "_zoom_out_tip",
    "_hold_turn_zoom", "_settle_held_turn_zoom", "_zoom_label_refresh",
    "zoom_fit", "_set_zoom_100",
    # the page turns, whole
    "next_page", "prev_page", "go_to_page", "go_to_page_own_version",
    "show_sheet_version", "_land_on_page", "hide_revision_preview",
    "go_to_item", "_on_item_activated",
]
# The window's data and the furniture the zoom only reports to: the status
# strip (recorded), the readout (recorded), full screen (never, on the web).
WIN_STUBS = {
    "gl_widget", "settings", "_flash_status", "zoom_label",
    "is_focus_mode", "focus_layout", "canvas_free_rect",
    "_turn_zoom_hold", "_zoom_floor_said",
    # A page turn's other business: the overlay it saves and restores, the
    # page label, the photo Back button, the detail-marking run it ends.
    "_flush_overlay_save", "_update_page_label", "_restore_overlay_for_page",
    "_say_kept_overlay_pictures", "_photo_nav", "_clear_photo_back",
    "marking_details", "_detail_mark_page", "refresh_detail_zones",
    "_detail_next", "_end_manual_details", "status_label",
    "_counts_here_clause", "_refresh_version_bar", "_sync_revision_highlight",
    # The sheet's drawings, as the scenario gives them: which is newest, its
    # paper, and putting one up (show_revision_in_main: set_page_preview,
    # which keeps zoom and pan -- its own words).
    "images", "_newest_swap", "_newest_version_view", "_visible_revisions",
    "newest_version_of", "sheet_versions", "show_revision_in_main",
    # The Items list: where an item is drawn, and the rows that do not turn.
    "mark_version", "item_on_drawing", "_activate_on_this_sheet",
    "_edit_group_item", "_edit_standalone_item",
    "_shape_cycle_gid", "_shape_cycle_idx",
}
SET_METHODS = ["_zoom_floor_words"]
REF_METHODS = ["wheelEvent"]
REF_STUBS = {"_view_zoom", "_view_pan_x", "_view_pan_y", "_pw", "_ph",
             "width", "height", "update", "_main_viewer"}
MODULE_SEED = ["_zoom_stops_at_fit", "DEFAULT_SETTINGS"]


class _Qt:
    ShiftModifier = 0x02000000
    ControlModifier = 0x04000000
    NoModifier = 0


class _QApplication:
    """keyboardModifiers(): the wheel ORs the keyboard's into the event's;
    the stand-in keyboard holds what the event says."""
    mods = 0

    @staticmethod
    def keyboardModifiers():
        return _QApplication.mods


PROVIDED = {"math": math, "json": json, "Qt": _Qt,
            "QApplication": _QApplication}

DESK = open(SRC, "r", encoding="utf-8").read()
TREE = ast.parse(DESK)
LINES = DESK.splitlines(True)
TOP = {}
IMPORTED = set()
for n in TREE.body:
    if isinstance(n, (ast.FunctionDef, ast.ClassDef)):
        TOP.setdefault(n.name, n)
    elif isinstance(n, ast.Assign):
        for t in n.targets:
            if isinstance(t, ast.Name):
                TOP.setdefault(t.id, n)
    elif isinstance(n, (ast.Import, ast.ImportFrom)):
        for a in n.names:
            IMPORTED.add((a.asname or a.name).split(".")[0])


def _class(name):
    node = TOP.get(name)
    if not isinstance(node, ast.ClassDef):
        raise SystemExit("no class %s in %s" % (name, SRC))
    return node


def _member(cls, name):
    for n in cls.body:
        if isinstance(n, ast.FunctionDef) and n.name == name:
            return n
        if isinstance(n, ast.Assign) and any(
                isinstance(t, ast.Name) and t.id == name for t in n.targets):
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
    """self.<x> and (through the window) self.gl_widget.<x> / gl.<x>."""
    alias = {"gl"}
    out_self, out_gl = set(), set()
    for s in ast.walk(fn):
        if not isinstance(s, ast.Attribute):
            continue
        v = s.value
        if isinstance(v, ast.Name) and v.id == "self":
            out_self.add(s.attr)
        elif isinstance(v, ast.Name) and v.id in alias:
            out_gl.add(s.attr)
        elif isinstance(v, ast.Attribute) and isinstance(v.value, ast.Name) \
                and v.value.id == "self" and v.attr == "gl_widget":
            out_gl.add(s.attr)
    for s in ast.walk(fn):
        if isinstance(s, ast.Call) and isinstance(s.func, ast.Name) \
                and s.func.id == "getattr" and len(s.args) >= 2 \
                and isinstance(s.args[1], ast.Constant):
            tgt = s.args[0]
            if isinstance(tgt, ast.Name) and tgt.id == "self":
                out_self.add(s.args[1].value)
            elif isinstance(tgt, ast.Name) and tgt.id in alias:
                out_gl.add(s.args[1].value)
    return out_self, out_gl


def _wheel_help_node():
    """The three statements of PDFCacheViewer._show_shortcuts that say what
    the wheel does (`_scroll = ...`, `_wheel_help = ...` and the `if` that
    adds the zoom stop), as a function of its own -- and nothing else of it:
    the rest builds a message box."""
    fn = _member(_class("PDFCacheViewer"), "_show_shortcuts")
    picked = []
    for st in fn.body:
        names = {t.id for t in ast.walk(st)
                 if isinstance(t, ast.Name) and isinstance(t.ctx, ast.Store)}
        if names & {"_scroll", "_wheel_help"}:
            picked.append(st)
    if [type(s).__name__ for s in picked] != ["Assign", "Assign", "If"]:
        raise SystemExit("_show_shortcuts no longer says the wheel in the three "
                         "statements this lifts: %s" % [type(s).__name__ for s in picked])
    body = "".join(textwrap.indent(
        textwrap.dedent("".join(LINES[s.lineno - 1:s.end_lineno])), "    ")
        for s in picked)
    text = "def _wheel_help_of(self):\n" + body + "    return _wheel_help\n"
    return ast.parse(text).body[0], text


def _zoom_floor_tip():
    """The zoom-stop box's tooltip, a literal in SettingsDialog.__init__."""
    init = _member(_class("SettingsDialog"), "__init__")
    for s in ast.walk(init):
        if isinstance(s, ast.Call) and isinstance(s.func, ast.Attribute) \
                and s.func.attr == "setToolTip" \
                and isinstance(s.func.value, ast.Attribute) \
                and s.func.value.attr == "zoom_floor_check":
            return ast.literal_eval(s.args[0])
    raise SystemExit("SettingsDialog.__init__ gives the zoom-stop box no tooltip")


def closure():
    gl_cls, win_cls = _class("GLPageWidget"), _class("PDFCacheViewer")
    set_cls, ref_cls = _class("SettingsDialog"), _class("_RefCanvas")
    problems, want = [], set(MODULE_SEED)
    gl_known = set(GL_METHODS) | set(GL_CLASS_ATTRS) | GL_STUBS
    for name in GL_METHODS:
        fn = _member(gl_cls, name)
        s, g = _self_attrs(fn)
        for a in sorted((s | g) - gl_known):
            problems.append("GLPageWidget.%s reads self.%s" % (name, a))
        want |= _free(fn)
    wh_node, _ = _wheel_help_node()
    for name, fn in [(n, _member(win_cls, n)) for n in WIN_METHODS] \
            + [("_show_shortcuts:_wheel_help", wh_node)]:
        s, g = _self_attrs(fn)
        for a in sorted(s - set(WIN_METHODS) - WIN_STUBS):
            problems.append("PDFCacheViewer.%s reads self.%s" % (name, a))
        for a in sorted(g - gl_known):
            problems.append("PDFCacheViewer.%s reads gl.%s" % (name, a))
        want |= _free(fn)
    for name in SET_METHODS:
        fn = _member(set_cls, name)
        s, _g = _self_attrs(fn)
        if s:
            problems.append("SettingsDialog.%s reads self.%s" % (name, sorted(s)))
        want |= _free(fn)
    for name in REF_METHODS:
        fn = _member(ref_cls, name)
        s, _g = _self_attrs(fn)
        for a in sorted(s - set(REF_METHODS) - REF_STUBS):
            problems.append("_RefCanvas.%s reads self.%s" % (name, a))
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

NS = dict(PROVIDED)
mod_nodes = sorted({id(TOP[n]): TOP[n] for n in MODNAMES}.values(),
                   key=lambda n: n.lineno)
exec(compile("\n".join(_text(n) for n in mod_nodes), "<module.lifted>", "exec"), NS)


def _cls_src(name, cls, members, extra=""):
    body = ["class %s:" % name, "    pass"]
    for m in members:
        body.append(textwrap.indent(_text(_member(cls, m)), "    "))
    if extra:
        body.append(textwrap.indent(extra, "    "))
    return "\n".join(body)


exec(compile(_cls_src("GLBase", _class("GLPageWidget"),
                      GL_CLASS_ATTRS + GL_METHODS), "<GL.lifted>", "exec"), NS)
exec(compile(_cls_src("WinBase", _class("PDFCacheViewer"), WIN_METHODS,
                      _wheel_help_node()[1]), "<Win.lifted>", "exec"), NS)
exec(compile(_cls_src("SetBase", _class("SettingsDialog"), SET_METHODS),
             "<Settings.lifted>", "exec"), NS)
exec(compile(_cls_src("RefBase", _class("_RefCanvas"), REF_METHODS),
             "<RefCanvas.lifted>", "exec"), NS)


# ── stand-ins ────────────────────────────────────────────────────────────
class Settings:
    def __init__(self, **kw):
        self.v = dict(NS["DEFAULT_SETTINGS"])
        self.v.update(kw)

    def get(self, k):
        return self.v.get(k)


class Label:
    def __init__(self):
        self.text = ""

    def setText(self, t):
        self.text = t


class _Signal:
    def emit(self, *a):
        pass


class GL(NS["GLBase"]):
    def __init__(self, win, w, h):
        self._win = win
        self._w, self._h = w, h
        self._zoom, self._pan_x, self._pan_y = 1.0, 0.0, 0.0
        self._past_fit_by_choice = False
        self._past_fit_zoom = None
        self._zoom_base = None
        self._zoom_base_fit = False
        self._raise_rec = None
        self._canvas_seen = None
        self._page_sizes = {}
        self._images = []
        self._current_page = -1
        self._wheel_mode = "zoom"
        self._preview = None
        self._preview_key = None
        self._preview_tex = None
        self._overlay_page = None
        self._overlay_shown = False
        self._cad_vert_drag = None
        self._pre_drag_committed = False
        self.annotations_changed = _Signal()
        self.sheet_shown = _Signal()

    def width(self):
        return self._w

    def height(self):
        return self._h

    def _main_window(self):
        return self._win

    def update(self):
        pass

    def current_page(self):
        return self._current_page

    def preview_key(self):
        return self._preview_key

    def page_count(self):
        return len(self._images)

    def _measurement_group(self, gid):
        return []

    def select_measurement(self, m):
        pass

    def version_items(self):        # what show_sheet_version announces
        return []

    # The desktop's _page_size, as it answers: the drawing ON SCREEN -- a
    # revision up for comparison (_preview_size) before the sheet's own.
    def _page_size(self):
        if self._preview is not None:
            return self._preview
        return self._page_sizes.get(self._current_page, (1, 1))

    def _photo_hover_step(self, d):
        return False

    def _photo_hover_cancel(self):
        pass

    def _scale_tip_hide(self):
        pass

    # A flip between versions (set_page_preview / clear_page_preview): only
    # the drawing changes -- "Zoom and pan are untouched", its own words.
    # (set_page, lifted, takes a revision down through clear_page_preview.)
    def flip(self, size, key=("flip", 0)):
        self._preview = tuple(size) if size else None
        self._preview_key = tuple(key) if size else None
        self._preview_tex = self._preview_key

    def clear_page_preview(self, update=True):
        self.flip(None)


class Win(NS["WinBase"]):
    def __init__(self, w, h, revs=None, newest=True, **settings):
        self.settings = Settings(**settings)
        self.zoom_label = Label()
        self.status_label = Label()
        self.said = []
        self.gl_widget = GL(self, w, h)
        self.gl_widget._wheel_mode = self.settings.get("wheel_mode") or "zoom"
        self.images = self.gl_widget._images
        # {page: [(rev_id, (w, h)), ...]}, oldest first: the sheet's other
        # drawings, each on its own paper; the last one is the newest.
        self.revs = {int(k): [(str(r), tuple(sz)) for r, sz in v]
                     for k, v in (revs or {}).items()}
        self.newest = newest
        self._newest_swap = False
        self._detail_next = ""
        self._photo_nav = False

    def _flash_status(self, t):
        self.said.append(t)

    def is_focus_mode(self):
        return False

    def focus_layout(self, animate=True):
        pass

    def canvas_free_rect(self, canvas=None):
        return None

    # A page turn's other business, none of it the view's.
    def _flush_overlay_save(self):
        pass

    def _update_page_label(self):
        pass

    def _restore_overlay_for_page(self, page):
        pass

    def _say_kept_overlay_pictures(self):
        pass

    def _clear_photo_back(self):
        pass

    def marking_details(self):
        return False

    def refresh_detail_zones(self):
        pass

    def _end_manual_details(self, why=""):
        pass

    def _refresh_version_bar(self):
        pass

    def _sync_revision_highlight(self):
        pass

    def _counts_here_clause(self, page, rev_id):
        return ""

    # The sheet's drawings, as sheet_versions lists them: (rev_id, name,
    # date, set, rev, rev_page), the sheet's own first.
    def sheet_versions(self, page):
        out = [("", "ORIGINAL", "", "", None, page)]
        for rid, size in self.revs.get(page, []):
            out.append((rid, rid, "", "", {"id": rid, "size": size}, page))
        return out

    def newest_version_of(self, page):
        vers = self.revs.get(page, [])
        return vers[-1][0] if vers else ""

    def _newest_version_view(self):
        return self.newest

    def _visible_revisions(self):
        return [r for v in self.revs.values() for r in v]

    # set_page_preview: the revision's picture up, zoom and pan untouched.
    def show_revision_in_main(self, rev, rev_page, offer_add=False):
        self.gl_widget.flip(rev["size"], (rev["id"], rev_page))
        return (rev["id"], rev_page)

    # The Items list: an item is shown on the drawing it was traced on.
    def mark_version(self, page, m):
        return (str(m.get("rev_id") or ""), None)

    def item_on_drawing(self, page, rev_id, m):
        return True

    def _activate_on_this_sheet(self, page_idx, m):
        return False                # the list shows every sheet

    def _edit_group_item(self, m):
        pass

    def _edit_standalone_item(self, m):
        pass


class _XY:
    def __init__(self, x, y):
        self._x, self._y = x, y

    def x(self):
        return self._x

    def y(self):
        return self._y


class WheelEv:
    def __init__(self, x, y, dy, dx=0, mods=0):
        self._p, self._d, self._m = _XY(x, y), _XY(dx, dy), mods

    def angleDelta(self):
        return self._d

    def pos(self):
        return self._p

    def modifiers(self):
        return self._m

    def accept(self):
        pass


def _mods(shift, ctrl):
    return (_Qt.ShiftModifier if shift else 0) | (_Qt.ControlModifier if ctrl else 0)


def run(scn):
    win = Win(scn["canvas"][0], scn["canvas"][1], revs=scn.get("revs"),
              newest=scn.get("newest", True), **scn.get("settings", {}))
    gl = win.gl_widget
    for i, size in enumerate(scn["pages"]):
        gl._page_sizes[i] = tuple(size)
        gl._images.append(tuple(size))
    gl._current_page = 0
    gl._canvas_seen = (gl._w, gl._h)
    trace = []
    # ["during", turn, step...]: on the web the steps are made while the
    # sheet the turn asked for is still being decoded (seconds on an iPad);
    # the desktop's turns are synchronous, so here they are one after the
    # other -- one trace entry for the lot, after the last.
    flat = []
    for s in scn["steps"]:
        subs = s[1:] if s[0] == "during" else [s]
        flat += [(sub, k == len(subs) - 1) for k, sub in enumerate(subs)]
    for step, last in flat:
        op = step[0]
        if op == "open":                    # ["open"[, page]]: the job opens on a sheet,
            # as load runs it: set_page(last viewed), _apply_default_zoom, the
            # Newest landing, then the settle for THAT drawing.
            at = step[1] if len(step) > 1 else 0
            gl.set_page(at)
            win._apply_default_zoom()
            win._land_on_page(at)
            win._turn_zoom_settle(False)
        elif op == "turn":                  # a thumbnail, a jump, the Go box
            win.go_to_page(step[1])
        elif op == "turns":                 # ["turns", [a, b]]: on the web b is turned to
            for i in step[1]:               # while a's newest drawing is decoding
                win.go_to_page(i)
        elif op == "next":                  # Page Down
            win.next_page()
        elif op == "prev":                  # Page Up
            win.prev_page()
        elif op == "version":               # ["version", page, rev_id]: the version bar, the matrix
            win.show_sheet_version(step[1], step[2], announce=False)
        elif op == "jump":                  # ["jump", page, points[, type[, rev_id]]]: the Items list
            m = {"type": step[3] if len(step) > 3 else "count", "points": step[2]}
            if len(step) > 4 and step[4]:
                m["rev_id"] = step[4]
            win._on_item_activated(step[1], m)
        elif op == "wheel":                 # ["wheel", x, y, dy, dx, shift, ctrl]
            mods = _mods(len(step) > 5 and step[5], len(step) > 6 and step[6])
            _QApplication.mods = mods
            gl.wheelEvent(WheelEv(step[1], step[2], step[3],
                                  step[4] if len(step) > 4 else 0, mods))
            _QApplication.mods = 0
        elif op == "pinch":                 # ["pinch", x, y, factor]
            gl._zoom_about(step[1], step[2], step[3])
        elif op == "minus":
            win.zoom_out()
        elif op == "plus":
            win.zoom_in()
        elif op == "F":
            win.zoom_fit()
        elif op == "one":
            win._set_zoom_100()
        elif op == "pan":
            gl._pan_x += step[1]
            gl._pan_y += step[2]
        elif op == "resize":
            gl._w, gl._h = step[1], step[2]
            gl._canvas_resized()
        elif op == "item":                  # Zoom to item: its points [, its type]
            gl.zoom_to_measurement({"type": step[2] if len(step) > 2 else "count",
                                    "points": step[1]})
        elif op == "rev":                   # a revision flipped up ([w, h]) or down (None)
            gl.flip(step[1])
        elif op == "settings":              # Preferences, OK
            win.settings.v.update(step[1])
            gl._wheel_mode = win.settings.get("wheel_mode") or "zoom"
        else:
            raise SystemExit("unknown step %r" % (step,))
        win.update_zoom_label()
        if not last:
            continue
        trace.append({
            "page": gl._current_page, "shown": list(gl._page_size()),
            "zoom": gl._zoom, "pan": [gl._pan_x, gl._pan_y],
            "label": win.zoom_label.text,
            "atFloor": gl.at_zoom_floor(), "showsFit": gl.shows_fit(),
            "base": gl._zoom_base, "baseFit": gl._zoom_base_fit,
            "pastFit": gl._past_fit_by_choice,
            "raised": gl._raise_rec is not None,
            "said": list(win.said),
        })
    out = {"name": scn["name"], "trace": trace,
           "canvas": list(scn["canvas"]), "pages": [list(x) for x in scn["pages"]],
           "settings": scn.get("settings", {}), "steps": scn["steps"],
           "minusTip": win._zoom_out_tip()}
    if scn.get("revs"):
        out["revs"] = {str(k): [[r, list(sz)] for r, sz in v]
                       for k, v in scn["revs"].items()}
    if scn.get("newest", True) is False:
        out["newest"] = False           # the Newest tick off: a turn lands on the sheet's own drawing
    return out


# ── the picture windows: _RefCanvas.wheelEvent ───────────────────────────
class RefWin:
    def __init__(self, **settings):
        self.settings = Settings(**settings)


class Ref(NS["RefBase"]):
    def __init__(self, win, w, h, pw, ph):
        self._win = win
        self._w, self._h = w, h
        self._pw, self._ph = pw, ph
        self._view_zoom, self._view_pan_x, self._view_pan_y = 1.0, 0.0, 0.0

    def width(self):
        return self._w

    def height(self):
        return self._h

    def update(self):
        pass

    def _main_viewer(self):
        return self._win


def run_picture(scn):
    win = RefWin(**scn.get("settings", {}))
    ref = Ref(win, scn["box"][0], scn["box"][1], scn["picture"][0], scn["picture"][1])
    trace = []
    for step in scn["steps"]:
        op = step[0]
        if op == "wheel":                   # ["wheel", x, y, dy, dx, shift]
            ref.wheelEvent(WheelEv(step[1], step[2], step[3],
                                   step[4] if len(step) > 4 else 0,
                                   _mods(len(step) > 5 and step[5], False)))
        elif op == "pan":                   # a drag: the pan follows the pointer
            ref._view_pan_x += step[1]
            ref._view_pan_y += step[2]
        elif op == "settings":
            win.settings.v.update(step[1])
        else:
            raise SystemExit("unknown picture step %r" % (step,))
        trace.append({"vz": ref._view_zoom, "pan": [ref._view_pan_x, ref._view_pan_y]})
    return {"name": scn["name"], "box": scn["box"], "picture": scn["picture"],
            "settings": scn.get("settings", {}), "steps": scn["steps"], "trace": trace}


BIG, SMALL = (7200, 4800), (3400, 2200)     # 36x24 and 17x11 at 200 dpi
TALL = (4800, 7200)                         # a sheet turned on its side
TINY = (50, 40)                             # whose Fit is past the maximum
HUGE = (40000, 30000)                       # whose Fit is below the minimum
LARGE = (10800, 7200)                       # 36x24 at 300 dpi: a reissue on bigger paper
W, H = 1600, 900
SCENARIOS = [
    {"name": "wheel out lands on Fit, refuses, Shift goes on",
     "canvas": (W, H), "pages": [BIG],
     "steps": [["open"], ["wheel", 400, 300, 120], ["wheel", 400, 300, 120],
               ["wheel", 400, 300, -120], ["wheel", 400, 300, -120],
               ["wheel", 400, 300, -120], ["wheel", 400, 300, -120],
               ["wheel", 400, 300, -120, 0, True],
               ["wheel", 400, 300, -120], ["wheel", 400, 300, -120, 0, True],
               ["F"]]},
    {"name": "sideways wheel never zooms",
     "canvas": (W, H), "pages": [BIG],
     "steps": [["open"], ["wheel", 800, 450, 120], ["wheel", 800, 450, 0, 120],
               ["wheel", 800, 450, 0, -120], ["wheel", 800, 450, 0, -120, False, True]]},
    {"name": "dragged aside at Fit: a notch out centres it",
     "canvas": (W, H), "pages": [BIG],
     "steps": [["open"], ["pan", 200, -80], ["wheel", 800, 450, -120],
               ["wheel", 800, 450, -120], ["pan", -50, 30], ["minus"], ["minus"]]},
    {"name": "minus from zoomed in: lands on Fit, never past",
     "canvas": (W, H), "pages": [BIG],
     "steps": [["open"], ["plus"], ["plus"], ["plus"], ["minus"], ["minus"],
               ["minus"], ["minus"], ["minus"], ["plus"], ["minus"]]},
    {"name": "below Fit by choice: plain notches and minus refuse, zooming in comes back",
     "canvas": (W, H), "pages": [BIG],
     "steps": [["open"], ["wheel", 700, 400, -120, 0, True],
               ["wheel", 700, 400, -120, 0, True], ["wheel", 700, 400, -120],
               ["minus"], ["wheel", 700, 400, 120], ["wheel", 700, 400, 120],
               ["wheel", 700, 400, 120], ["wheel", 700, 400, -120],
               ["wheel", 700, 400, -120]]},
    {"name": "Shift all the way down stops at the zoom limit",
     "canvas": (W, H), "pages": [BIG],
     "steps": [["open"]] + [["wheel", 800, 450, -120, 0, True]] * 12
              + [["F"]]},
    {"name": "zooming in to the limit, then back out to Fit",
     "canvas": (W, H), "pages": [SMALL],
     "steps": [["open"]] + [["plus"]] * 22 + [["wheel", 300, 200, 120]]
              + [["wheel", 300, 200, -120]] * 30},
    {"name": "a pinch stops at Fit like the wheel",
     "canvas": (W, H), "pages": [BIG],
     "steps": [["open"], ["pinch", 500, 300, 1.6], ["pinch", 520, 310, 0.8],
               ["pinch", 520, 310, 0.8], ["pinch", 520, 310, 0.95],
               ["pinch", 520, 310, 0.9], ["pinch", 600, 500, 1.02]]},
    {"name": "Fit remembered as Fit across paper sizes",
     "canvas": (W, H), "pages": [BIG, SMALL, BIG],
     "steps": [["open"], ["turn", 1], ["turn", 2], ["turn", 1]]},
    {"name": "small sheet raised, big sheet back at his zoom",
     "canvas": (W, H), "pages": [BIG, SMALL, BIG],
     "steps": [["open"], ["plus"], ["turn", 1], ["wheel", 800, 450, 120],
               ["wheel", 800, 450, -120], ["turn", 2], ["turn", 1],
               ["turn", 0]]},
    {"name": "Shift past Fit is kept across turns until he zooms back",
     "canvas": (W, H), "pages": [BIG, SMALL, BIG],
     "steps": [["open"], ["wheel", 800, 450, -120, 0, True],
               ["turn", 1], ["turn", 2], ["wheel", 800, 450, 120],
               ["wheel", 800, 450, 120], ["turn", 0]]},
    {"name": "resize at Fit stays Fit; elsewhere the centre is kept",
     "canvas": (W, H), "pages": [BIG],
     "steps": [["open"], ["resize", 1000, 1300], ["plus"],
               ["resize", 1600, 900], ["wheel", 800, 450, -120],
               ["F"], ["pan", 120, 0], ["resize", 1300, 900],
               ["F"], ["wheel", 800, 450, -120, 0, True], ["resize", 1000, 700]]},
    {"name": "an iPad turned at Fit, and turned back",
     "canvas": (1024, 704), "pages": [BIG, TALL],
     "steps": [["open"], ["resize", 768, 960], ["resize", 1024, 704],
               ["turn", 1], ["resize", 768, 960], ["wheel", 384, 480, 120],
               ["resize", 1024, 704], ["wheel", 384, 480, -120]]},
    {"name": "a raised Fit stays the turn's through a resize",
     "canvas": (W, H), "pages": [BIG, SMALL, BIG],
     "steps": [["open"], ["plus"], ["turn", 1], ["resize", 1300, 1000],
               ["turn", 2], ["turn", 1], ["resize", 1600, 900], ["turn", 0]]},
    {"name": "item zoom never out past Fit",
     "canvas": (W, H), "pages": [BIG],
     "steps": [["open"], ["plus"], ["plus"],
               ["item", [[100, 100], [7100, 4700]]],
               ["wheel", 800, 450, -120],
               ["item", [[3000, 2000], [3100, 2050]]],
               ["item", [[10, 2400], [7190, 2400]]]]},
    {"name": "an item zoom that landed on Fit, then the window changes size",
     "canvas": (W, H), "pages": [BIG, SMALL],
     "steps": [["open"], ["plus"], ["item", [[100, 100], [7100, 4700]]],
               ["resize", 1200, 900], ["turn", 1], ["turn", 0], ["resize", 1600, 1000],
               ["wheel", 800, 450, -120]]},
    {"name": "a sheet whose Fit is past the maximum stops at the maximum",
     "canvas": (W, H), "pages": [TINY],
     "steps": [["open"], ["wheel", 800, 450, -120], ["minus"],
               ["wheel", 800, 450, -120, 0, True], ["plus"], ["minus"]]},
    {"name": "a bare F on a sheet whose Fit is past the maximum",
     "canvas": (W, H), "pages": [TINY],
     "steps": [["F"], ["minus"], ["wheel", 800, 450, -120], ["F"]]},
    {"name": "a sheet whose Fit is below the minimum",
     "canvas": (W, H), "pages": [HUGE],
     "steps": [["open"], ["wheel", 800, 450, -120], ["wheel", 800, 450, 120],
               ["wheel", 800, 450, -120], ["F"]]},
    {"name": "half a pixel: dragged 0.4 px aside at Fit is Fit, 0.6 px is not",
     "canvas": (W, H), "pages": [BIG],
     "steps": [["open"], ["pan", 0.4, 0], ["wheel", 800, 450, -120],
               ["pan", 0.2, 0], ["wheel", 800, 450, -120], ["wheel", 800, 450, -120],
               ["pan", 0, -0.45], ["minus"], ["pan", 0, -0.1], ["minus"]]},
    {"name": "half a pixel across a resize",
     "canvas": (W, H), "pages": [BIG],
     "steps": [["open"], ["pan", 0.4, -0.3], ["resize", 1300, 800],
               ["pan", 0.6, 0], ["resize", 1600, 900], ["F"], ["pan", 0, 0.55],
               ["resize", 1300, 800]]},
    {"name": "a zoom past Fit is not revived once he zoomed back to Fit",
     "canvas": (W, H), "pages": [BIG],
     "steps": [["open"], ["wheel", 800, 450, -120, 0, True], ["wheel", 800, 450, 120],
               ["wheel", 800, 450, 120], ["resize", 1100, 780],
               ["wheel", 800, 450, -120], ["wheel", 800, 450, -120],
               ["wheel", 800, 450, -120]]},
    {"name": "item zoom: the desktop's box -- a tiny shape, a single count, a straight run, a note",
     "canvas": (W, H), "pages": [BIG],
     "steps": [["open"], ["plus"], ["item", [[3000, 2000], [3004, 2003]]],
               ["item", [[3000, 2000], [3060, 2030]]], ["item", [[3000, 2000]]],
               ["item", [[500, 2400], [6500, 2400]]], ["item", [[3600, 300], [3600, 4500]]],
               ["item", [[1000, 1000], [5000, 3000]], "textnote"],
               ["item", [[-2000, -1000], [9000, 6000]]]]},
    {"name": "a revision on smaller paper: the flip keeps the zoom and the pan",
     "canvas": (W, H), "pages": [BIG],
     "steps": [["open"], ["rev", SMALL], ["wheel", 800, 450, -120], ["F"],
               ["wheel", 800, 450, -120], ["rev", None], ["wheel", 800, 450, -120],
               ["plus"], ["pan", 120, -60], ["rev", SMALL], ["rev", None], ["F"]]},
    {"name": "a revision on bigger paper: a notch out lands on its Fit",
     "canvas": (W, H), "pages": [BIG],
     "steps": [["open"], ["rev", LARGE], ["wheel", 800, 450, -120],
               ["wheel", 800, 450, -120], ["rev", None], ["wheel", 800, 450, -120]]},
    {"name": "box off: as 3.05",
     "canvas": (W, H), "pages": [BIG, SMALL],
     "settings": {"zoom_out_stops_at_fit": False},
     "steps": [["open"], ["wheel", 800, 450, -120], ["minus"], ["turn", 1],
               ["resize", 1000, 1300], ["item", [[100, 100], [3300, 2100]]],
               ["wheel", 800, 450, 0, 120]]},
    {"name": "box ticked off and on again mid-job",
     "canvas": (W, H), "pages": [BIG],
     "steps": [["open"], ["settings", {"zoom_out_stops_at_fit": False}],
               ["wheel", 800, 450, -120], ["wheel", 800, 450, -120],
               ["settings", {"zoom_out_stops_at_fit": True}],
               ["wheel", 800, 450, -120], ["minus"], ["wheel", 800, 450, 120],
               ["wheel", 800, 450, 120], ["wheel", 800, 450, -120]]},
    {"name": "scroll mode: Ctrl+wheel stops, Ctrl+Shift goes past, its words",
     "canvas": (W, H), "pages": [BIG],
     "settings": {"wheel_mode": "scroll"},
     "steps": [["open"], ["wheel", 800, 450, 120, 0, False, True],
               ["wheel", 800, 450, -120, 0, False, True],
               ["wheel", 800, 450, -120, 0, False, True],
               ["wheel", 800, 450, -120, 0, True, True], ["minus"]]},
    {"name": "the wheel set to scroll in the middle of a job",
     "canvas": (W, H), "pages": [BIG],
     "steps": [["open"], ["settings", {"wheel_mode": "scroll"}], ["minus"],
               ["wheel", 800, 450, -120, 0, False, True]]},
    {"name": "a job that opens at 100%",
     "canvas": (W, H), "pages": [BIG],
     "settings": {"default_zoom_mode": "100"},
     "steps": [["open"], ["minus"], ["minus"], ["minus"], ["minus"], ["minus"],
               ["minus"], ["minus"], ["minus"], ["minus"], ["minus"], ["minus"]]},
    # ── page turns (desktop 3.06), each one through the desktop's own
    # next_page / prev_page / go_to_page / show_sheet_version ──
    {"name": "turns: Page Down and Page Up at Fit across paper sizes",
     "canvas": (W, H), "pages": [BIG, SMALL, BIG, LARGE],
     "steps": [["open"], ["next"], ["next"], ["next"], ["next"], ["prev"],
               ["prev"], ["prev"], ["prev"]]},
    {"name": "turns: a notch in, the small sheet raised, a notch in and out on it, the big sheet back",
     "canvas": (W, H), "pages": [BIG, SMALL, BIG],
     "steps": [["open"], ["wheel", 500, 300, 120], ["pan", 140, -60], ["next"],
               ["prev"], ["next"], ["wheel", 1100, 600, 120], ["wheel", 1100, 600, -120],
               ["next"], ["prev"], ["wheel", 800, 450, -120], ["prev"]]},
    {"name": "turns: Page Down then Page Up gives the zoom back, centred",
     "canvas": (W, H), "pages": [BIG, BIG, SMALL],
     "steps": [["open"], ["plus"], ["plus"], ["pan", -300, 120], ["next"], ["prev"],
               ["wheel", 900, 200, 120], ["pan", 50, 50], ["next"], ["next"], ["prev"],
               ["prev"]]},
    {"name": "turns: Shift past Fit on small paper is kept on bigger paper until a zoom in reaches Fit",
     "canvas": (W, H), "pages": [SMALL, BIG, LARGE, SMALL],
     "steps": [["open"], ["wheel", 800, 450, -120, 0, True], ["wheel", 800, 450, -120, 0, True],
               ["turn", 1], ["turn", 2], ["turn", 3], ["wheel", 800, 450, 120],
               ["turn", 0], ["wheel", 800, 450, 120], ["turn", 1], ["turn", 2], ["F"],
               ["turn", 3]]},
    {"name": "turns: the box off keeps the zoom, centred (3.05)",
     "canvas": (W, H), "pages": [BIG, SMALL, BIG],
     "settings": {"zoom_out_stops_at_fit": False},
     "steps": [["open"], ["plus"], ["pan", 200, 100], ["turn", 1],
               ["wheel", 800, 450, -120], ["wheel", 800, 450, -120], ["next"], ["prev"],
               ["F"], ["turn", 2], ["minus"], ["turn", 0],
               ["settings", {"zoom_out_stops_at_fit": True}], ["turn", 1], ["turn", 2]]},
    {"name": "turns: a job that opens at Fit Width keeps it as a number",
     "canvas": (W, H), "pages": [BIG, SMALL, BIG],
     "settings": {"default_zoom_mode": "width"},
     "steps": [["open"], ["turn", 1], ["turn", 2], ["prev"], ["F"], ["turn", 2],
               ["turn", 0]]},
    {"name": "turns: a jump to an item on another sheet ends zoomed on it, a number",
     "canvas": (W, H), "pages": [BIG, SMALL, BIG, LARGE],
     "steps": [["open"], ["jump", 1, [[1000, 800], [1300, 1000]]], ["turn", 2],
               ["jump", 1, [[50, 50], [3350, 2150]]], ["turn", 3], ["turn", 0],
               ["jump", 2, [[3000, 2000]]], ["wheel", 800, 450, -120],
               ["jump", 0, [[-1000, -1000], [9000, 6000]]], ["turn", 1]]},
    {"name": "turns: a job that opens on a sheet whose newest drawing is on smaller paper",
     "canvas": (W, H), "pages": [BIG, BIG],
     "revs": {0: [["r1", SMALL]]},
     "steps": [["open"], ["turn", 1], ["turn", 0], ["plus"], ["turn", 1], ["turn", 0],
               ["turn", 1], ["jump", 0, [[3000, 2000], [3200, 2100]]], ["turn", 1],
               ["prev"]]},
    {"name": "turns: opening at Fit Width on a sheet whose newest drawing is on smaller paper",
     "canvas": (W, H), "pages": [BIG, BIG],
     "settings": {"default_zoom_mode": "width"},
     "revs": {1: [["r1", SMALL]]},
     "steps": [["open", 1], ["turn", 0], ["turn", 1]]},
    {"name": "turns: a revision-bar landing on another sheet settles on the revision",
     "canvas": (W, H), "pages": [BIG, BIG],
     "revs": {1: [["r1", SMALL], ["r2", LARGE]]},
     "steps": [["open"], ["version", 1, "r1"], ["version", 1, "r2"], ["version", 0, ""],
               ["plus"], ["version", 1, "r2"], ["version", 1, "r1"], ["version", 0, ""],
               ["version", 1, ""], ["turn", 0], ["turn", 1]]},
    {"name": "turns: a turn while the newest drawing is still being decoded",
     "canvas": (W, H), "pages": [BIG, BIG, SMALL, BIG],
     "revs": {1: [["r1", SMALL]], 3: [["r3", LARGE]]},
     "steps": [["open"], ["turns", [1, 2]], ["turn", 1], ["turns", [3, 0]], ["plus"],
               ["turns", [1, 3]], ["turns", [1, 0]]]},
    {"name": "turns: a job that opens at 100% on a sheet smaller than the screen",
     "canvas": (W, H), "pages": [(500, 300), BIG],
     "settings": {"default_zoom_mode": "100"},
     "steps": [["open"], ["turn", 1], ["prev"], ["wheel", 800, 450, 120],
               ["wheel", 800, 450, -120], ["next"], ["one"], ["prev"]]},
    {"name": "turns: a flip between versions keeps the zoom, a turn does not keep the flip",
     "canvas": (W, H), "pages": [BIG, SMALL],
     "revs": {0: [["r1", LARGE]]},
     "newest": False,
     "steps": [["open"], ["version", 0, "r1"], ["wheel", 800, 450, -120],
               ["version", 0, ""], ["turn", 1], ["turn", 0], ["version", 0, "r1"],
               ["turn", 1]]},
    # go_to_page onto the sheet on screen: set_page centres it and forgets
    # the raise, then the settle (a card clicked again, a callout to it)
    {"name": "turns: the card of the sheet on screen clicked again after a zoom and a drag",
     "canvas": (W, H), "pages": [BIG, SMALL, BIG],
     "steps": [["open"], ["plus"], ["pan", 200, -100], ["turn", 0], ["next"],
               ["pan", 150, 80], ["turn", 1], ["wheel", 800, 450, 120], ["pan", -60, 40],
               ["turn", 1], ["next"]]},
    {"name": "turns: the box off, the card of the sheet on screen clicked again after a drag",
     "canvas": (W, H), "pages": [BIG, SMALL],
     "settings": {"zoom_out_stops_at_fit": False},
     "steps": [["open"], ["plus"], ["pan", 200, -100], ["turn", 0], ["next"],
               ["pan", 150, 80], ["turn", 1]]},
    # the held turn's settle, once the reissue is up, keeps a zoom Shift took
    # past Fit (_settle_held_turn_zoom hands it the turn's `chose`)
    {"name": "turns: Shift past Fit, then a sheet whose newest drawing is on smaller paper",
     "canvas": (W, H), "pages": [BIG, BIG, BIG],
     "revs": {1: [["r1", SMALL]]},
     "steps": [["open"], ["wheel", 800, 450, -120, 0, True], ["next"], ["next"], ["prev"],
               ["wheel", 800, 450, 120], ["wheel", 800, 450, 120], ["prev"], ["next"],
               ["F"], ["next"]]},
    # 1 after a drag: the desktop's set_zoom keeps the pan -- the page
    # centre's screen offset -- and so does the web's (the user's decision of
    # 2026-11-07, "keep the pan"); from the next turn on both are centred
    {"name": "1 (100%) after a drag, then a walk",
     "canvas": (W, H), "pages": [BIG, SMALL, LARGE],
     "steps": [["open"], ["pan", 120, -70], ["one"], ["next"], ["next"], ["prev"],
               ["prev"]]},
    # ...from other zooms: zoomed in past 100%, at Fit, below Fit by Shift
    {"name": "1 (100%) after a drag at different zooms",
     "canvas": (W, H), "pages": [BIG, SMALL],
     "steps": [["open"], ["plus"], ["plus"], ["plus"], ["plus"], ["plus"], ["plus"],
               ["plus"], ["plus"], ["plus"], ["plus"], ["plus"], ["plus"], ["plus"],
               ["pan", 150, -60], ["one"], ["F"], ["pan", -200, 90], ["one"],
               ["wheel", 800, 450, -120, 0, True], ["wheel", 800, 450, -120, 0, True],
               ["pan", 33, 44], ["one"], ["wheel", 800, 450, -120], ["pan", -17, 5],
               ["one"], ["next"], ["pan", 61, -9], ["one"]]},
    # ...twice: the second 1 changes nothing, a drag between them is kept
    {"name": "1 (100%) twice, and again after a drag",
     "canvas": (W, H), "pages": [BIG, SMALL],
     "steps": [["open"], ["pan", 120, -70], ["one"], ["one"], ["pan", -30, 10],
               ["one"], ["one"], ["F"], ["one"], ["one"]]},
    # ...on a reissue on other paper (the newest drawing up, and a flip): the
    # pan is measured on the drawing ON SCREEN, its own centre
    {"name": "1 (100%) on a reissued drawing of other paper",
     "canvas": (W, H), "pages": [BIG, BIG, BIG],
     "revs": {1: [["r1", SMALL]], 2: [["r2", LARGE]]},
     "steps": [["open"], ["next"], ["pan", 90, -45], ["one"], ["pan", -20, 15], ["one"],
               ["next"], ["pan", -140, 60], ["one"], ["prev"], ["prev"],
               ["rev", SMALL], ["pan", 70, 25], ["one"], ["rev", None], ["one"],
               ["rev", LARGE], ["pan", -55, -35], ["one"], ["rev", None]]},
    # + and - with the sheet dragged aside, above Fit: the desktop's zoom_in /
    # zoom_out are set_zoom too, and keep the page centre's offset as 1 does;
    # so do the web's (the user's decision of 2026-11-07)
    {"name": "+ and - with the sheet dragged aside",
     "canvas": (W, H), "pages": [BIG],
     "steps": [["open"], ["one"], ["pan", 150, -80], ["plus"], ["plus"], ["minus"],
               ["pan", -40, 25], ["minus"], ["minus"]]},
    # ...then a page turn: centred from the turn on, at 100% (his zoom)
    {"name": "1 (100%) after a drag, then a page turn",
     "canvas": (W, H), "pages": [BIG, SMALL, BIG],
     "steps": [["open"], ["pan", 250, 130], ["one"], ["next"], ["pan", -80, 40],
               ["one"], ["turn", 0], ["pan", 10, -10], ["one"], ["prev"], ["next"],
               ["next"]]},
    # A step made while the sheet a turn asked for is still being decoded
    # (["during", ...]): Page Down then Page Up, the card, Page Down twice --
    # each a turn, centred, whatever the drawing still up is; a drag there is
    # the sheet left's. The box on, and off (3.05: the zoom kept, centred).
    {"name": "turns: a step made while the sheet turned to is still being decoded",
     "canvas": (W, H), "pages": [BIG, SMALL, BIG],
     "steps": [["open"], ["plus"], ["plus"], ["pan", -300, 120],
               ["during", ["next"], ["prev"]], ["pan", 150, 80],
               ["during", ["next"], ["turn", 0]], ["pan", -90, 60],
               ["during", ["next"], ["next"]], ["pan", 40, 40],
               ["during", ["prev"], ["next"]], ["prev"], ["pan", 70, -30],
               ["during", ["next"], ["prev"]], ["during", ["prev"], ["prev"]]]},
    {"name": "turns: the box off, a step made while the sheet turned to is still being decoded",
     "canvas": (W, H), "pages": [BIG, SMALL, BIG],
     "settings": {"zoom_out_stops_at_fit": False},
     "steps": [["open"], ["plus"], ["plus"], ["pan", -300, 120],
               ["during", ["next"], ["prev"]], ["pan", 150, 80],
               ["during", ["next"], ["turn", 0]], ["pan", -90, 60],
               ["during", ["next"], ["next"]], ["pan", 40, 40],
               ["during", ["prev"], ["next"]], ["prev"], ["pan", 70, -30],
               ["during", ["next"], ["prev"]], ["during", ["prev"], ["prev"]]]},
    # ...and an Items-list row clicked then (_on_item_activated, current_page
    # already the sheet turned to): its item on the sheet being LEFT is a
    # jump back to it, zoomed on the item; on the sheet turned to, the jump.
    {"name": "turns: a row clicked while the sheet turned to is still being decoded",
     "canvas": (W, H), "pages": [BIG, BIG, SMALL],
     "steps": [["open"], ["during", ["next"], ["jump", 0, [[5000, 3000], [5400, 3300]]]],
               ["turn", 1], ["during", ["next"], ["jump", 1, [[1000, 800], [1300, 1000]]]],
               ["during", ["prev"], ["jump", 1, [[2000, 1500], [2100, 1600]]]],
               ["during", ["next"], ["jump", 2, [[100, 100], [300, 200]]]],
               ["during", ["prev"], ["prev"]]]},
]

PICTURE = (3000, 2000)
PICTURES = [
    {"name": "a picture window stops at its Fit; Shift goes on to half",
     "box": (800, 600), "picture": PICTURE,
     "steps": [["wheel", 200, 150, 120], ["wheel", 200, 150, 120],
               ["wheel", 600, 400, -120], ["wheel", 600, 400, -120],
               ["wheel", 600, 400, -120], ["wheel", 600, 400, -120, 0, True],
               ["wheel", 600, 400, -120], ["wheel", 600, 400, -120, 0, True],
               ["wheel", 600, 400, -120, 0, True], ["wheel", 600, 400, -120, 0, True],
               ["wheel", 600, 400, -120, 0, True], ["wheel", 600, 400, -120, 0, True],
               ["wheel", 600, 400, 120], ["wheel", 600, 400, 120],
               ["wheel", 600, 400, 120], ["wheel", 600, 400, 120],
               ["wheel", 600, 400, 120], ["wheel", 600, 400, 120],
               ["wheel", 600, 400, -120]]},
    {"name": "a picture dragged aside at its Fit: a notch out centres it",
     "box": (800, 600), "picture": PICTURE,
     "steps": [["pan", 90, -40], ["wheel", 400, 300, -120], ["wheel", 400, 300, -120],
               ["wheel", 400, 300, 120], ["pan", 30, 30], ["wheel", 400, 300, -120]]},
    {"name": "a picture window: sideways never zooms, the box off goes to half",
     "box": (640, 900), "picture": (2000, 2400),
     "steps": [["wheel", 300, 300, 0, 120], ["wheel", 300, 300, 0, -120],
               ["settings", {"zoom_out_stops_at_fit": False}],
               ["wheel", 300, 300, -120], ["wheel", 300, 300, -120],
               ["wheel", 300, 300, -120], ["wheel", 300, 300, -120],
               ["wheel", 300, 300, -120], ["wheel", 300, 300, -120]]},
    {"name": "a picture window zoomed in to its limit",
     "box": (800, 600), "picture": PICTURE,
     "steps": [["wheel", 100, 500, 120]] * 18 + [["wheel", 100, 500, -120]] * 20},
]


def words():
    setb = NS["SetBase"]
    out = {"floorWords": {m or "": setb._zoom_floor_words(m)
                          for m in ("zoom", "scroll", None)},
           "tip": _zoom_floor_tip(), "minusTip": [], "wheelHelp": [], "once": []}
    for stops in (True, False):
        for wm in ("zoom", "scroll"):
            win = Win(W, H, zoom_out_stops_at_fit=stops, wheel_mode=wm)
            out["minusTip"].append({"stops": stops, "wheel": wm,
                                    "text": win._zoom_out_tip()})
            out["wheelHelp"].append({"stops": stops, "wheel": wm,
                                     "text": win._wheel_help_of()})
    for wm in ("zoom", "scroll"):
        win = Win(W, H, wheel_mode=wm)
        win._say_zoom_floor_once()
        win._say_zoom_floor_once()
        out["once"].append({"wheel": wm, "said": list(win.said)})
    return out


def main():
    out = {
        "lifted": {"module": MODNAMES, "GLPageWidget": GL_METHODS + GL_CLASS_ATTRS,
                   "PDFCacheViewer": WIN_METHODS + ["_show_shortcuts:_wheel_help"],
                   "SettingsDialog": SET_METHODS + ["__init__:zoom_floor_check tooltip"],
                   "_RefCanvas": REF_METHODS},
        "FIT_EPS": NS["GLBase"]._FIT_EPS,
        "default": NS["DEFAULT_SETTINGS"].get("zoom_out_stops_at_fit"),
        "scenarios": [run(s) for s in SCENARIOS],
        "pictures": [run_picture(s) for s in PICTURES],
        "words": words(),
    }
    text = json.dumps(out, indent=1, ensure_ascii=True) + "\n"
    if WRITE:
        with open(SNAPSHOT, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        print("wrote %s: %d scenarios, %d picture scenarios"
              % (os.path.basename(SNAPSHOT), len(out["scenarios"]),
                 len(out["pictures"])), flush=True)
    else:
        sys.stdout.write(text)
        sys.stdout.flush()


if __name__ == "__main__":
    main()
