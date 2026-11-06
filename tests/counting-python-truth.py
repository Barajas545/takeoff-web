"""Ground truth for WHAT COUNTS, taken from the desktop app itself.

A sheet can carry takeoff on several of its drawings -- the original and every
revision that reissued it -- and exactly one of them is in the totals. The
desktop decides which, item by item, in a handful of PDFCacheViewer METHODS
(working_version_of, item_on_drawing, run_counts_towards, item_counts_towards,
_counted_qty, _counted_quantities, totals_effect, _book_first_takeoff, ...).
The browser port must reach the same totals on the same file, or the same job
is priced twice, differently. The same goes for what a DELETE takes
(GLPageWidget.delete_item / delete_shapes / _drop_shape, and the Items list's
question in _on_item_delete) and what a job switch leaves of the count tool
(_drop_per_project_reads): both write the file, so both are lifted too.

So the rule is not re-typed here. The methods are lifted out of
pdf_fast_viewer.py BY TEXT -- through `ast`, so a method is exactly its own
lines -- and exec'd as the methods of two small stand-in classes that hold the
data they read (metadata, the revision list, the measurements, the page
images). Importing the module is not an option: PyQt5, fitz and a
single-instance socket.

THE LIFTED SET MUST BE A CLOSURE, and that is checked BEFORE anything runs:

  * every module-level name a lifted function or method reaches is lifted
    too (an `ast` walk, breadth first, constants included -- a call-syntax
    grep misses constants, which is how this went stale twice last week);
  * every `self.<name>` a lifted method touches is either another lifted
    method of the same class or one of the stand-in's DECLARED stubs -- the
    data, and the user-interface side effects (a status line, a repaint)
    that have no bearing on a number;
  * a module-level import a lifted body reaches must be one this script
    provides.

A gap fails with the missing names, never with a NameError from a line inside
<extracted> that matches no file on disk.

Usage:
    python counting-python-truth.py --scenarios      > truth.json
    python counting-python-truth.py a.takeoff b.takeoff > truth.json
    python counting-python-truth.py --reopen < saved.json  (the desktop
        opening what the browser saved: which totals its open re-adds)
PTT_DESKTOP_SRC must point at pdf_fast_viewer.py; tests/revision-counting.mjs
passes it through.
"""
import ast
import copy
import json
import math
import os
import random
import re
import struct
import sys
import textwrap

SRC = os.environ.get("PTT_DESKTOP_SRC", "")
if not SRC:
    raise SystemExit(
        "Set PTT_DESKTOP_SRC to pdf_fast_viewer.py. This script runs the "
        "desktop app's own counting methods, so it needs the desktop app's "
        "source; tests/revision-counting.mjs passes it through.")

# ── what is lifted ────────────────────────────────────────────────────────

# PDFCacheViewer: every method a total, a booking, a tile or a name is
# decided in. Nothing here draws, asks or saves.
WIN_METHODS = [
    "working_version_of", "rev_page_of", "item_on_drawing",
    "run_counts_towards", "item_counts_towards", "_counted_qty",
    "_counted_quantities", "totals_effect", "totals_effect_words",
    "items_by_version", "_takeoff_on_drawings", "waiting_reason",
    "_rev_page_home", "_slot_by_id",
    "_extra_sheets", "sheet_versions", "_sheet_ranks", "_origin_date",
    "newest_version_of", "_visible_revisions", "rev_name", "revision_label",
    "revision_names", "revision_number", "_rev_tag", "_rev_title",
    "_version_name", "_origin_map", "_origin_pairs", "_sheet_tile_states",
    "_sheet_tile_tip", "_version_takeoff_size_ok", "_takeoff_amount",
    "mark_version", "mark_on_drawing", "_page_final_label",
    "_book_first_takeoff", "set_working_version", "_resync_group_totals",
    "_counted_takeoff_on", "orphan_items",
    # The questions and the sentences: every one the browser now speaks.
    "ask_count_version", "_ask_count_after_takeoff", "_page_image",
    "_page_of_image", "_takeoff_fingerprint", "_count_question_facts",
    "_tag_asked_booking", "_lone_uncounted_sheets", "_left_out_sentence",
    "_lone_words", "_amount_words", "_totals_gain_text",
    "_watch_counted_takeoff", "_retract_stale_watch",
    # Delete from the Items list: the question, word for word, and what a
    # Yes deletes. _ask_delete_here is the SHEET chip's three-way question;
    # with the list not on one sheet (always, in the browser: it has no
    # chip yet) it answers None and the plain question is asked.
    "_on_item_delete", "_ask_delete_here",
    # A job switch: the count held for the last job is put down.
    "_drop_per_project_reads",
]
# The stand-in window's DATA and the side effects that move no number.
WIN_STUBS = {
    "metadata", "_revisions", "images", "gl_widget", "settings",
    "status_label", "items_panel", "_unsaved", "_book_resolved",
    "_announce_price", "_update_window_title", "_refresh_version_bar",
    "_queue_thumb_refresh", "_rebase_counted_seen",
    # what the questions remember for the session, and the watch's state
    "_count_asked", "_counted_seen", "_watch_said",
    # the deferred price sentences (the watch takes back one made untrue)
    "_price_queue",
    # what the status line holds and the totals it described (a sentence
    # about totals that have moved since is never appended to): a record
    # of the line, no number
    "_note_money_line",
    # Only the SHEET chip's three-way question reads the shapes on screen;
    # with the list not on one sheet it is never reached (the stand-in
    # raises if it is).
    "_shapes_on_screen",
    # What a job switch forgets that is not the count: a marking run, the
    # source PDF, the vision readings. None of it moves a number, and the
    # stand-ins record nothing. The Item box is the window's.
    "_detail_next", "_end_manual_details", "_source_pdf_path",
    "_vision_callouts", "tool_name_box",
}

# GLPageWidget: the item's drawing, and the multi-shape arithmetic.
GL_METHODS = ["item_rev_id", "_measurement_group", "_sync_group",
              "_shape_counts", "_page_of_item",
              # Delete: the whole item (delete_item), one shape
              # (delete_selected_measurement -> _drop_shape) and the shapes
              # on one sheet (delete_shapes), with the multi-shape item kept
              # whole: a run re-adds its master, a master hands it on.
              "delete_item", "delete_shapes", "delete_selected_measurement",
              "_drop_shape", "_promote_child", "_group_master",
              # the count tool's held count, put down on a job switch
              "forget_armed_count", "_pending_name"]
# Class-level names lifted with the methods (assignments, not defs).
GL_ATTRS = ["_PROMOTE_KEYS"]
GL_STUBS = {"_measurements", "_current_page", "_main_window", "_undo_stack",
            "current_page", "viewing_rev_id",
            "recompute_framing", "tag_undo_top", "update",
            # Delete's bookkeeping: an undo level counted, the selection and
            # isolation it clears, the signals it emits -- no number.
            "_push_undo", "_isolation_saved", "_sel_meas", "_sel_vert_idx",
            "_drag_active", "selection_changed", "measurement_changed",
            "is_isolated", "isolated_master", "exit_isolation",
            # The framing engine's: a framed wall re-deriving its openings
            # when a pin goes, and which walls use them. `_framing` is None
            # here, so the last two are never reached (they raise if they
            # are), and refresh_walls_for_pin only records the call: the
            # browser has no framing engine, and that is a known gap.
            "refresh_walls_for_pin", "_uses_openings", "_framing_shapes",
            # the count tool's state, as a job switch reads and clears it
            "_mode", "_pending_item_name", "set_detail_zones",
            "_count_target", "_count_spec", "_count_answers",
            "_count_category", "_count_named", "_count_left",
            "_last_floor", "_last_category", "_last_sub", "_last_cost_type"}

# Module-level names the TEST itself calls. Everything they and the methods
# reach is found by the closure walk below, not listed by hand.
MODULE_SEED = ["is_takeoff_item", "takeoff_qty", "takeoff_quantity_words",
               "takeoff_move_words", "resolve_latest_sheets",
               "revision_short_name", "parse_revision_date", "revision_rank",
               "_ORIGINAL_RANK", "STANDALONE_PAGE", "KEPT_MARK_TYPES",
               "NON_TAKEOFF_TYPES", "READING_TYPES", "REF_DIST_TYPE",
               "PIN_TYPES"]

# Classes a lifted body names, and the stand-in each one becomes.
CLASS_ALIASES = {"GLPageWidget": "GL"}

# Module-level imports a lifted body may reach, and what provides them.
class _QMessageBox:
    """The one Qt name the questions reach: what was asked is recorded --
    title, text, the buttons and the default one -- and the answer is
    whatever the scenario says. Qt's own values, so `Yes | No` is a set of
    two buttons that can be told from `Yes` alone."""
    Yes, No = 0x4000, 0x10000
    asked = []
    answer = No

    @staticmethod
    def _names(flags):
        return [n for n, v in (("Yes", 0x4000), ("No", 0x10000))
                if int(flags or 0) & v]

    @staticmethod
    def question(*a, **k):
        _QMessageBox.asked.append([
            str(a[1]) if len(a) > 1 else "",
            str(a[2]) if len(a) > 2 else "",
            _QMessageBox._names(a[3]) if len(a) > 3 else [],
            _QMessageBox._names(a[4]) if len(a) > 4 else []])
        return _QMessageBox.answer

    @staticmethod
    def information(*a, **k):
        _QMessageBox.asked.append(["INFO " + (str(a[1]) if len(a) > 1 else ""),
                                   str(a[2]) if len(a) > 2 else ""])


def _log_exception(where=""):
    """The desktop writes a caught error to its crash log and carries on.
    Here it is raised again: a lifted body that swallowed an error (a stub
    nobody declared, say) would otherwise leave a half-done answer that
    looks like the desktop's."""
    raise


# Module-level DEFS a lifted body reaches that are stood in for, not lifted.
MODULE_STUBS = {"_log_exception": _log_exception}

PROVIDED_IMPORTS = {"re": re, "math": math, "json": json, "os": os,
                    "QMessageBox": _QMessageBox,
                    # the framing engine, absent: as on a desktop where
                    # framing.py did not import -- and as in the browser
                    "_framing": None}


with open(SRC, "r", encoding="utf-8") as fh:
    DESK = fh.read()
TREE = ast.parse(DESK)
LINES = DESK.splitlines(True)

TOP = {}            # module-level def / class / assignment, by name
IMPORTED = set()    # names bound by a module-level import
for _n in TREE.body:
    if isinstance(_n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
        TOP.setdefault(_n.name, _n)
    elif isinstance(_n, ast.Assign):
        for _t in _n.targets:
            if isinstance(_t, ast.Name):
                TOP.setdefault(_t.id, _n)
    elif isinstance(_n, ast.AnnAssign) and isinstance(_n.target, ast.Name):
        TOP.setdefault(_n.target.id, _n)
    elif isinstance(_n, (ast.Import, ast.ImportFrom)):
        for _a in _n.names:
            IMPORTED.add((_a.asname or _a.name).split(".")[0])
    elif isinstance(_n, (ast.Try, ast.If)):
        # `try: import fitz except ImportError: fitz = None` and friends
        for _s in ast.walk(_n):
            if isinstance(_s, (ast.Import, ast.ImportFrom)):
                for _a in _s.names:
                    IMPORTED.add((_a.asname or _a.name).split(".")[0])
            elif isinstance(_s, ast.Assign):
                for _t in _s.targets:
                    if isinstance(_t, ast.Name):
                        IMPORTED.add(_t.id)


def _class(name):
    node = TOP.get(name)
    if not isinstance(node, ast.ClassDef):
        raise SystemExit("no class %s in %s" % (name, SRC))
    return node


def _method(cls, name):
    for n in cls.body:
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) \
                and n.name == name:
            return n
    raise SystemExit("could not find %s.%s in %s" % (cls.name, name, SRC))


def _attr(cls, name):
    """A class-level assignment (`_PROMOTE_KEYS = (...)`), by its name."""
    for n in cls.body:
        if isinstance(n, ast.Assign) and any(
                isinstance(t, ast.Name) and t.id == name for t in n.targets):
            return n
    raise SystemExit("could not find %s.%s in %s" % (cls.name, name, SRC))


def _text(node):
    """The node's own lines, decorators included, dedented."""
    first = min([node.lineno] + [d.lineno for d in
                                 getattr(node, "decorator_list", [])])
    return textwrap.dedent("".join(LINES[first - 1:node.end_lineno]))


def _local_names(fn):
    """Names bound inside a function: never a reference to a module name."""
    out = set()
    a = fn.args
    for arg in a.args + a.kwonlyargs + getattr(a, "posonlyargs", []):
        out.add(arg.arg)
    if a.vararg:
        out.add(a.vararg.arg)
    if a.kwarg:
        out.add(a.kwarg.arg)
    for s in ast.walk(fn):
        if isinstance(s, ast.Name) and isinstance(s.ctx, (ast.Store, ast.Del)):
            out.add(s.id)
        elif isinstance(s, (ast.FunctionDef, ast.AsyncFunctionDef,
                            ast.ClassDef)) and s is not fn:
            out.add(s.name)
        elif isinstance(s, ast.arg):
            out.add(s.arg)
        elif isinstance(s, ast.ExceptHandler) and s.name:
            out.add(s.name)
        elif isinstance(s, (ast.Import, ast.ImportFrom)):
            for al in s.names:
                out.add((al.asname or al.name).split(".")[0])
    return out


def _free_names(node):
    """Module-level names a def or an assignment reads."""
    local = _local_names(node) if isinstance(
        node, (ast.FunctionDef, ast.AsyncFunctionDef)) else set()
    out = set()
    for s in ast.walk(node):
        if isinstance(s, ast.Name) and isinstance(s.ctx, ast.Load) \
                and s.id not in local:
            out.add(s.id)
    return out


def _self_attrs(fn):
    """{'win': {...}, 'gl': {...}} -- what a method reads off `self`, and off
    the canvas it reaches through `self.gl_widget` (or a local alias of it)."""
    gl_alias = set()
    for s in ast.walk(fn):
        if isinstance(s, ast.Assign) and len(s.targets) == 1 \
                and isinstance(s.targets[0], ast.Name) \
                and isinstance(s.value, ast.Attribute) \
                and isinstance(s.value.value, ast.Name) \
                and s.value.value.id == "self" \
                and s.value.attr == "gl_widget":
            gl_alias.add(s.targets[0].id)
    win, gl = set(), set()
    for s in ast.walk(fn):
        if not isinstance(s, ast.Attribute):
            continue
        v = s.value
        if isinstance(v, ast.Name) and v.id == "self":
            win.add(s.attr)
        elif isinstance(v, ast.Name) and v.id in gl_alias:
            gl.add(s.attr)
        elif isinstance(v, ast.Attribute) and isinstance(v.value, ast.Name) \
                and v.value.id == "self" and v.attr == "gl_widget":
            gl.add(s.attr)
    # getattr(self, "name", ...) is a read too
    for s in ast.walk(fn):
        if isinstance(s, ast.Call) and isinstance(s.func, ast.Name) \
                and s.func.id in ("getattr", "hasattr") and len(s.args) >= 2 \
                and isinstance(s.args[0], ast.Name) \
                and s.args[0].id == "self" \
                and isinstance(s.args[1], ast.Constant):
            win.add(s.args[1].value)
    return win, gl


def closure_problems():
    """Everything the lifted set reaches and does not carry. [] is a
    closure; anything else is said by name before a line is executed."""
    win_cls, gl_cls = _class("PDFCacheViewer"), _class("GLPageWidget")
    methods = [("win", _method(win_cls, n)) for n in WIN_METHODS] \
        + [("gl", _method(gl_cls, n)) for n in GL_METHODS]
    problems = []
    want = set(MODULE_SEED)
    for kind, fn in methods:
        win, gl = _self_attrs(fn)
        if kind == "win":
            gl_self = set()
        else:
            # a GLPageWidget method's own `self` is the canvas
            gl_self, win = win, set()
        for a in sorted(win - set(WIN_METHODS) - WIN_STUBS):
            problems.append("PDFCacheViewer.%s reads self.%s, which is "
                            "neither lifted nor a declared stub"
                            % (fn.name, a))
        for a in sorted((gl | gl_self) - set(GL_METHODS) - set(GL_ATTRS)
                        - GL_STUBS):
            problems.append("%s.%s reads the canvas's .%s, which is neither "
                            "lifted nor a declared stub"
                            % ("PDFCacheViewer" if kind == "win"
                               else "GLPageWidget", fn.name, a))
        want |= _free_names(fn)
    for n in GL_ATTRS:
        want |= _free_names(_attr(gl_cls, n))
    seen, queue, lifted = set(), sorted(want), []
    while queue:
        nm = queue.pop(0)
        if nm in seen:
            continue
        seen.add(nm)
        if nm in CLASS_ALIASES or nm in MODULE_STUBS:
            continue
        node = TOP.get(nm)
        if node is None:
            if nm in IMPORTED and nm not in PROVIDED_IMPORTS:
                problems.append("a lifted body reaches the import %r, which "
                                "this script does not provide" % nm)
            continue                  # a builtin, or a provided import
        if isinstance(node, ast.ClassDef):
            problems.append("a lifted body reaches class %s, which cannot be "
                            "lifted (alias it to a stand-in)" % nm)
            continue
        lifted.append(nm)
        for sub in sorted(_free_names(node)):
            if sub not in seen:
                queue.append(sub)
    return problems, lifted


PROBLEMS, MODULE_NAMES = closure_problems()
if PROBLEMS:
    raise SystemExit("The lifted set is not a closure -- the desktop source "
                     "has moved:\n  " + "\n  ".join(PROBLEMS))


def _module_source():
    # In source order, so an assignment that reads another runs after it.
    nodes = sorted({id(TOP[n]): TOP[n] for n in MODULE_NAMES}.values(),
                   key=lambda n: n.lineno)
    return "\n".join(_text(n) for n in nodes)


def _class_source(name, cls, methods, stubs_doc, attrs=()):
    body = ["class %s:" % name,
            "    %r" % stubs_doc]
    for a in attrs:
        body.append(textwrap.indent(_text(_attr(cls, a)), "    "))
    for m in methods:
        body.append(textwrap.indent(_text(_method(cls, m)), "    "))
    return "\n".join(body)


NS = dict(PROVIDED_IMPORTS)
NS.update(MODULE_STUBS)
exec(compile(_module_source(), "<extracted module names>", "exec"), NS)
exec(compile(_class_source("GL", _class("GLPageWidget"), GL_METHODS,
                           "the canvas: lifted methods + declared stubs",
                           attrs=GL_ATTRS),
             "<extracted GLPageWidget>", "exec"), NS)
NS["GLPageWidget"] = NS["GL"]
exec(compile(_class_source("WinBase", _class("PDFCacheViewer"), WIN_METHODS,
                           "the window: lifted methods + declared stubs"),
             "<extracted PDFCacheViewer>", "exec"), NS)


# ── the stand-ins ─────────────────────────────────────────────────────────

class Img:
    """A page image: what the methods read of one is its identity and size."""
    def __init__(self, size):
        self.size = (int(size[0]), int(size[1]))


class Recorder:
    def __init__(self):
        self.said = []

    def setText(self, t):
        self.said.append(str(t))

    def text(self):
        return self.said[-1] if self.said else ""


class _Panel:
    def refresh(self):
        pass

    def sheet_only(self):
        # The Items list is not on one sheet: the browser has no SHEET chip
        # yet, so the desktop's three-way question is never its question.
        return False


class _Sig:
    def __init__(self):
        self.n = 0

    def emit(self, *a):
        self.n += 1


class _Box:
    """The Item box (ToolNameBox): what a job switch reads and empties."""
    def __init__(self, canvas):
        self.gl = canvas
        self.cleared = False

    def clear_name(self):
        # as the real box does: the canvas's copy of the name goes with it,
        # and so does the count's own copy of the last name it used
        self.cleared = True
        self.gl._pending_item_name = ""
        self.gl._count_category = ""


class Canvas(NS["GL"]):
    def __init__(self, win, meas):
        self._win = win
        self._measurements = meas
        self._current_page = 0
        self._undo_stack = []
        self.tags = []
        # Delete's bookkeeping
        self.undo_levels = 0
        self.walls = []
        self._isolation_saved = None
        self._sel_meas = None
        self._sel_vert_idx = -1
        self._drag_active = False
        self.selection_changed = _Sig()
        self.measurement_changed = _Sig()
        # the count tool, at rest
        self._mode = "pan"
        self._pending_item_name = ""
        self._count_target = self._count_spec = self._count_answers = None
        self._count_category = self._count_named = ""
        self._count_left = []
        self._last_floor = self._last_category = self._last_sub = ""
        self._last_cost_type = "material"

    def _push_undo(self):
        self.undo_levels += 1

    def refresh_walls_for_pin(self, pin=None, page=None):
        # framing: a framed wall re-derives its openings. No framing engine
        # here or in the browser -- recorded, and nothing moves.
        self.walls.append([(pin or {}).get("type"), page])

    def _uses_openings(self, master):
        raise AssertionError("reached only with the framing engine loaded")

    def _framing_shapes(self, m):
        raise AssertionError("reached only with the framing engine loaded")

    def is_isolated(self):
        return False

    def isolated_master(self):
        return None

    def exit_isolation(self):
        raise AssertionError("not isolated, so never left")

    def set_detail_zones(self, items):
        pass

    def _main_window(self):
        return self._win

    def recompute_framing(self, m):
        pass

    def tag_undo_top(self, tag):
        self.tags.append(tag)
        return True

    def current_page(self):          # the questions are always asked of
        return self._current_page    # a page and a drawing, given

    def viewing_rev_id(self):
        return ""

    def update(self):
        pass

    def __getattr__(self, name):        # a stub nobody declared
        raise AttributeError("GLPageWidget stand-in has no %r -- declare it "
                             "or lift it" % name)


class Win(NS["WinBase"]):
    def __init__(self, scn):
        md = copy.deepcopy(scn["metadata"])
        revs = md.pop("revisions", []) or []
        size = scn.get("pageSize") or [64, 48]
        sizes = scn.get("pageSizes") or {}
        self.images = [Img(sizes.get(str(i), size))
                       for i in range(int(scn["pageCount"]))]
        self.metadata = md
        # The desktop keeps a revision only when the file carries its pages
        # (_on_cache_loaded: `if _r["images"]`); one with none is not there.
        self._revisions = []
        for r in revs:
            r = dict(r)
            n = int(r.pop("pages", 0) or 0)
            rs = r.pop("sizes", None) or {}
            r["images"] = [Img(rs.get(str(k), size)) for k in range(n)]
            if r["images"]:
                self._revisions.append(r)
        meas = {}
        for k, v in (scn.get("measurements") or {}).items():
            meas[int(k)] = copy.deepcopy(v)
        self.gl_widget = Canvas(self, meas)
        self._count_asked = set()
        self._counted_seen = None
        self._watch_said = None
        self._price_queue = []
        self.settings = {"latest_set_order": scn.get("order") or "date"}
        self.status_label = Recorder()
        self.items_panel = _Panel()
        self._unsaved = False
        self.announced = []
        # what a job switch forgets besides the count
        self._detail_next = ""
        self._source_pdf_path = "last-job.pdf"
        self._vision_callouts = {"0": []}
        self.tool_name_box = None

    def _shapes_on_screen(self, page_idx, m):
        raise AssertionError("reached only while the Items list shows one "
                             "sheet (the SHEET chip)")

    def _end_manual_details(self, msg):
        pass

    def _announce_price(self, text):
        # Kept as given: the desktop may hand a callable that WORDS the
        # sentence when it is said -- after the operation is over (_said).
        self.announced.append(text)

    def _update_window_title(self):
        pass

    def _refresh_version_bar(self):
        pass

    def _queue_thumb_refresh(self):
        pass

    def _rebase_counted_seen(self, page):
        pass

    def _note_money_line(self, text):
        pass

    def __getattr__(self, name):
        raise AttributeError("PDFCacheViewer stand-in has no %r -- declare "
                             "it or lift it" % name)


# ── one scenario, every answer ────────────────────────────────────────────

def _items(win):
    """[(page, index, item)] in the store's own order."""
    out = []
    for pg, lst in win.gl_widget._measurements.items():
        for i, m in enumerate(lst or []):
            out.append((pg, i, m))
    return out


def _qty(q):
    return [round(float(q[0]), 6), q[1]]


def _said(lst):
    """The sentences as the desktop puts them on the line: a deferred one is
    worded now (_flush_price), after the operation that queued it."""
    out = []
    for t in lst:
        t = t() if callable(t) else t
        if t:
            out.append(str(t))
    return out


def truth(scn):
    win = Win(scn)
    n = len(win.images)
    out = {"name": scn.get("name", "")}

    # ── per item ──
    rows = []
    for pg, i, m in _items(win):
        row = {"page": pg, "i": i,
               "takeoff": bool(NS["is_takeoff_item"](m)),
               "counts": bool(win.item_counts_towards(pg, m)),
               "run": bool(win.run_counts_towards(pg, m)),
               "waiting": win.waiting_reason(pg, m, short=True),
               "waitingLong": win.waiting_reason(pg, m)}
        if m.get("type") in NS["KEPT_MARK_TYPES"] and isinstance(pg, int) \
                and 0 <= pg < n:
            rid, rp = win.mark_version(pg, m)
            row["mark"] = [rid, rp]
        rows.append(row)
    out["items"] = rows

    # ── the totals ──
    counted = win._counted_quantities()
    pos = {id(m): (pg, i) for pg, i, m in _items(win)}
    tot = []
    for _k, (m, q) in counted.items():
        pg, i = pos[id(m)]
        tot.append([pg, i] + _qty(q))
    tot.sort(key=lambda r: (r[0], r[1]))
    out["counted"] = tot
    sums = {}
    for r in tot:
        sums[r[3]] = round(sums.get(r[3], 0.0) + r[2], 6)
    out["sums"] = sums

    # ── per sheet ──
    pages = []
    for p in range(n):
        own, ranked = win._sheet_ranks(p)
        pages.append({
            "working": win.working_version_of(p),
            "newest": win.newest_version_of(p),
            "versions": [[v[0], v[1], v[5]] for v in win.sheet_versions(p)],
            "own": [own[0], list(own[1]), own[2]],
            "ranked": [[[r[0][0], list(r[0][1]), r[0][2]], r[1]]
                       for r in ranked],
            "originDate": win._origin_date(p),
            "byVersion": win.items_by_version(p),
            "label": win._page_final_label(p),
        })
    out["pages"] = pages

    # ── the Pages list's tiles ──
    tiles = {}
    for p, st in win._sheet_tile_states().items():
        tiles[str(p)] = {"kind": st["kind"], "text": st["text"],
                         "short": st["short"], "added": st["added"],
                         "shows": list(st["shows"]) if st["shows"] else None,
                         "tip": st["tip"]}
    out["tiles"] = tiles

    # ── one name per revision ──
    names = {}
    for r in scn["metadata"].get("revisions") or []:
        rid = str(r.get("id"))
        names[rid] = {"name": win.rev_name(rid),
                      "hidden": win.rev_name(rid, hidden_note=True),
                      "number": win.revision_number(rid),
                      "title": win._rev_title(rid),
                      "version": win._version_name(rid)}
    names["r-not-here"] = {"name": win.rev_name("r-not-here"),
                           "hidden": win.rev_name("r-not-here", True),
                           "number": win.revision_number("r-not-here"),
                           "title": win._rev_title("r-not-here"),
                           "version": win._version_name("r-not-here")}
    out["names"] = names

    # ── what a move does to the totals, in words ──
    effect = []
    for p in range(n):
        for v in win.sheet_versions(p):
            rid = v[0]
            effect.append([p, rid, win.totals_effect_words(book={p: rid})])
    out["effect"] = effect
    gone = []
    for r in win._revisions:
        gone.append([str(r.get("id")),
                     win.totals_effect_words(drop_revs=(r.get("id"),),
                                             future=False)])
    out["dropEffect"] = gone

    # ── the first takeoff on a sheet books its drawing ──
    book = []
    for p in range(n):
        targets = [("", None)] + [(v[0], v[5]) for v in win.sheet_versions(p)
                                  if v[0]]
        # A fresh window per probe only where a booking can happen: on a
        # sheet already holding takeoff the desktop's first test refuses
        # before anything is written, so the shared one is asked.
        empty = not any(NS["is_takeoff_item"](x)
                        for x in (win.gl_widget._measurements.get(p) or []))
        for rid, rp in targets:
            w2 = Win(scn) if empty else win
            n_said = len(w2.announced)
            m = {"type": "area", "name": "Probe", "value": 12.5,
                 "points": [[0.0, 0.0], [10.0, 0.0], [10.0, 10.0]],
                 "visible": True}
            if rid:
                m["rev_id"] = rid
                m["rev_page"] = rp
            ok = w2._book_first_takeoff(p, m)
            if empty:
                # ...and filed, as _add_measurement files it after asking:
                # the sentence is worded on the job the filing left.
                w2.gl_widget._measurements.setdefault(p, []).append(m)
            book.append({
                "page": p, "rev": rid, "revPage": rp, "booked": bool(ok),
                "book": w2.metadata.get("sheet_version"),
                "bookedOver": {str(r.get("id")): r.get("booked_over")
                               for r in w2._revisions
                               if r.get("booked_over")},
                "said": _said(w2.announced[n_said:]),
            })
    out["book"] = book
    # The order the desktop walks the measurement store in -- the file's own.
    # The words of a move list items in that order, so they are compared
    # only where the browser walks it the same way.
    out["keyOrder"] = [str(k) for k in win.gl_widget._measurements]

    # ── the questions, and what a No says ──
    #
    # "Which drawing does this sheet count from?" for every drawing of every
    # sheet, answered No -- the body is the question; and the question asked
    # after takeoff lands on a drawing that does not count, for every piece
    # of takeoff that does not count, answered No -- the lead, and the
    # sentence a No leaves on the line.
    ask = []
    for p in range(n):
        for v in win.sheet_versions(p):
            w2 = Win(scn)
            _QMessageBox.asked[:] = []
            _QMessageBox.answer = _QMessageBox.No
            w2.ask_count_version(v[0], page=p)
            ask.append([p, v[0], [x[1] for x in _QMessageBox.asked]])
    out["ask"] = ask
    after = []
    for pg, i, m in _items(win):
        if not (isinstance(pg, int) and 0 <= pg < n) \
                or not NS["is_takeoff_item"](m) \
                or win.item_counts_towards(pg, m):
            continue
        w2 = Win(scn)
        m2 = w2.gl_widget._measurements[pg][i]
        _QMessageBox.asked[:] = []
        _QMessageBox.answer = _QMessageBox.No
        w2._ask_count_after_takeoff(m2, ("k",))
        after.append([pg, i, [x[1] for x in _QMessageBox.asked],
                      _said(w2.announced)])
    out["after"] = after
    # ...and what a Yes to the plain question says (set_working_version).
    said = []
    for p in range(n):
        for v in win.sheet_versions(p):
            w2 = Win(scn)
            ok = w2.set_working_version(p, v[0], announce=True)
            said.append([p, v[0], bool(ok), w2.status_label.said])
    out["setSaid"] = said

    # ── a job opened with takeoff on a drawing that does not count ──
    lone = win._lone_uncounted_sheets()
    out["lone"] = [list(x) for x in lone]
    out["leftOut"] = win._left_out_sentence(lone, "Not in your totals") \
        if lone else ""

    # ── the watch: the counted drawing emptied while another holds takeoff ──
    watch = []
    for p in range(n):
        w2 = Win(scn)
        lst = w2.gl_widget._measurements.get(p) or []
        wid = w2.working_version_of(p)
        here = [m for m in lst if NS["is_takeoff_item"](m)
                and NS["GLPageWidget"].item_rev_id(m) == wid]
        if not here:
            continue
        w2._watch_counted_takeoff(prime=True)
        w2.gl_widget._measurements[p] = [m for m in lst
                                         if not any(m is h for h in here)]
        w2.announced[:] = []
        w2._watch_counted_takeoff()
        watch.append([p, _said(w2.announced)])
    out["watch"] = watch

    # ── the Current Set, with promoted sheets ranked as what they are ──
    labels = [win._page_final_label(i) for i in range(n)]
    latest = {}
    for order in ("date", "column"):
        rows_, notes = NS["resolve_latest_sheets"](
            labels, win.metadata.get("extra_sheets") or [],
            win._visible_revisions(), order=order, include_new=True,
            origins=win._origin_map(), names=win.revision_names())
        latest[order] = {
            "rows": [{"sheet": r["sheet"], "source": r["source"],
                      "date": r["date"], "from": list(r["from"]),
                      "versions": r["versions"], "kind": r["kind"],
                      "usedCol": r["used_col"],
                      "cols": {str(k): list(v) for k, v in r["cols"].items()}}
                     for r in rows_],
            "notes": notes}
    out["latest"] = latest
    out["deletes"] = deletes(scn)
    return out


class _Before:
    """A fresh job, with every item's place and contents as they were, so a
    delete can be told as WHAT IT DID: the places emptied, and the items
    that stayed but changed (a master re-adding, a run taking over)."""
    def __init__(self, scn):
        self.win = Win(scn)
        self.gl = self.win.gl_widget
        self.was = {}
        for pg, i, m in _items(self.win):
            self.was[id(m)] = (pg, i, json.dumps(m, sort_keys=True))

    def at(self, pg, i):
        return self.gl._measurements[pg][i]

    def delta(self):
        here = set()
        changed = []
        for pg, lst in self.gl._measurements.items():
            for m in lst or []:
                if id(m) not in self.was:
                    raise AssertionError("a delete made an item")
                p0, i0, j0 = self.was[id(m)]
                if p0 != pg:
                    raise AssertionError("a delete moved an item to a sheet")
                here.add(id(m))
                if json.dumps(m, sort_keys=True) != j0:
                    changed.append([pg, i0, copy.deepcopy(m)])
        gone = sorted([[p, i] for k, (p, i, _j) in self.was.items()
                       if k not in here])
        return {"gone": gone, "changed": sorted(changed, key=lambda c: c[:2])}


def deletes(scn):
    """What each Delete takes, on a fresh copy of the job each time:

      shape        the drawing's Delete of ONE shape -- the Delete key, Edit
                   > Delete Selected, the canvas menu
                   (delete_selected_measurement -> _drop_shape)
      item         the Items list's Delete of a row, answered Yes and No:
                   the question word for word, and what a Yes takes
                   (_on_item_delete -> delete_item)
      item-of-run  delete_item handed a RUN: still the whole item
      shapes       every shape of one item on one sheet at once, runs first
                   (delete_shapes) -- what a selection of several does
      selection    shapes of several items on SEVERAL sheets at once: an
                   item's main shape with a run on another sheet, every run
                   of an item and not its main shape, and a seeded random
                   mix. Not a desktop gesture -- its canvas selects one shape
                   at a time -- but the browser's selection can hold more,
                   and its Delete of them must be the desktop's own pieces:
                   one undo level, then _drop_shape on each, the runs first
                   (delete_shapes' order, across sheets), so an item whose
                   main shape goes too passes ONCE.

    Each is told by what it did (_Before.delta) and how many undo levels it
    took, never by the whole store, so a real project's run stays small.
    """
    out = []
    for pg, i, m in _items(Win(scn)):
        b = _Before(scn)
        b.gl._current_page = pg
        b.gl._sel_meas = b.at(pg, i)
        b.gl.delete_selected_measurement()
        out.append(dict({"kind": "shape", "page": pg, "i": i,
                         "undo": b.gl.undo_levels}, **b.delta()))
        if m.get("group_child"):
            b = _Before(scn)
            b.gl.delete_item(b.at(pg, i))
            out.append(dict({"kind": "item-of-run", "page": pg, "i": i,
                             "undo": b.gl.undo_levels}, **b.delta()))
            continue
        for ans in ("Yes", "No"):
            b = _Before(scn)
            _QMessageBox.asked[:] = []
            _QMessageBox.answer = getattr(_QMessageBox, ans)
            b.win._on_item_delete(pg, b.at(pg, i))
            out.append(dict({"kind": "item", "answer": ans, "page": pg,
                             "i": i,
                             "asked": [list(x) for x in _QMessageBox.asked],
                             "said": list(b.win.status_label.said),
                             "undo": b.gl.undo_levels}, **b.delta()))
    for pg, lst in Win(scn).gl_widget._measurements.items():
        gids = []
        for s in lst or []:
            gid = s.get("group_id")
            if gid and gid not in gids:
                gids.append(gid)
        for gid in gids:
            idx = [i for i, s in enumerate(lst) if s.get("group_id") == gid]
            if len(idx) < 2:
                continue
            b = _Before(scn)
            n = b.gl.delete_shapes(pg, [b.at(pg, i) for i in idx])
            out.append(dict({"kind": "shapes", "page": pg, "ids": idx, "n": n,
                             "undo": b.gl.undo_levels}, **b.delta()))
    for at in _selections(scn):
        b = _Before(scn)
        doomed = [(pg, b.at(pg, i)) for pg, i in at]
        b.gl._push_undo()
        for pg, s in sorted(doomed, key=lambda d: not d[1].get("group_child")):
            b.gl._drop_shape(pg, s)
        out.append(dict({"kind": "selection", "at": [list(x) for x in at],
                         "n": len(doomed), "undo": b.gl.undo_levels},
                        **b.delta()))
    return out


def _selections(scn):
    """The several-sheet selections deletes() takes, each as [(page, i)] in
    the browser's order (pages ascending, each page in its own order)."""
    every = sorted((pg, i) for pg, i, _m in _items(Win(scn)))
    item = {(pg, i): m for pg, i, m in _items(Win(scn))}
    groups = {}
    for pg, i in every:
        gid = item[(pg, i)].get("group_id")
        if gid:
            groups.setdefault(gid, []).append((pg, i))
    out = []
    for gid, at in groups.items():
        if len({pg for pg, _i in at}) < 2:
            continue
        mains = [a for a in at if not item[a].get("group_child")]
        runs = [a for a in at if item[a].get("group_child")]
        if mains:
            far = [a for a in runs if a[0] != mains[0][0]]
            if far:
                out.append(sorted([mains[0], far[0]]))
        if runs:
            out.append(runs)
    rng = random.Random("selection " + str(scn.get("name", "")))
    for _ in range(3 if len(every) >= 2 else 0):
        out.append(sorted(rng.sample(every, min(len(every), rng.randint(2, 5)))))
    return out


def job_switch():
    """The count tool's state when another job comes in, and what is left of
    it after (_drop_per_project_reads): every combination of the tool, the
    Item box, the name the clicks were counted under and what is armed."""
    out = []
    held = {"type": "count", "name": "Outlets", "points": [[1, 1]]}
    for mode in ("count", "area"):
        for box in ("", "Outlets", "  Outlets ", "Switches"):
            for named in ("", "Outlets"):
                for armed in ("none", "target", "spec"):
                    w = Win({"metadata": {}, "pageCount": 1,
                             "measurements": {"0": [held]}})
                    g = w.gl_widget
                    w.tool_name_box = _Box(g)
                    g._mode = mode
                    g._pending_item_name = box
                    g._count_named = named
                    g._count_category = named
                    if armed == "target":
                        g._count_target = g._measurements[0][0]
                    elif armed == "spec":
                        g._count_spec = {"name": "Outlets",
                                         "floor_level": "Level 1"}
                        g._count_answers = g._count_spec
                    g._count_left = [g._measurements[0][0]]
                    g._last_floor, g._last_sub = "Level 3", "Rough-in"
                    g._last_category, g._last_cost_type = "Electrical", "labor"
                    w._drop_per_project_reads()
                    out.append({
                        "mode": mode, "box": box, "named": named,
                        "armed": armed,
                        "after": {
                            "cleared": w.tool_name_box.cleared,
                            "box": g._pending_item_name,
                            "armed": ("target" if g._count_target is not None
                                      else "spec" if g._count_spec is not None
                                      else "none"),
                            "named": g._count_named,
                            "category": g._count_category,
                            "lastFloor": g._last_floor,
                            "lastSub": g._last_sub,
                            "lastCostType": g._last_cost_type,
                        }})
    return out


# ── the scenarios: an estimator's job, built the way he builds one ───────

def _area(name, value, **kw):
    m = {"type": "area", "name": name, "label": name, "value": float(value),
         "points": [[1.0, 1.0], [9.0, 1.0], [9.0, 9.0]], "visible": True,
         "floor_level": "1st", "category": "Framing", "unit_cost": 1.0}
    m.update(kw)
    return m


def _line(name, value, **kw):
    m = {"type": "polyline", "name": name, "label": name,
         "value": float(value), "points": [[0.0, 0.0], [40.0, 0.0]],
         "visible": True, "category": "Framing"}
    m.update(kw)
    return m


def _rev(rid, date, desc, pages, match=None, extra=None, **kw):
    r = {"id": rid, "date": date, "description": desc, "notes": "",
         "source": rid + ".pdf", "visible": True, "archived": False,
         "page_labels": ["X%d" % k for k in range(pages)],
         "match": match or {}, "extra": extra or {}, "pages": pages}
    r.update(kw)
    return r


def scenarios():
    S = []

    # 1. His walk: an original set, a revision that replaces sheets AND adds
    #    one in the middle, a second that replaces and adds again.
    labels = ["A1.0", "A2.0", "A2.5", "A3.0", "A4.0", "A5.0", "A6.0", "A7.0"]
    r1 = _rev("r-asi1", "02/10/2026", "ASI 1", 5,
              match={"1": 0, "3": 2}, extra={"xs-new9": 4})
    r2 = _rev("r-two", "03/01/2026", "", 3, match={"3": 0, "2": 1})
    r3 = _rev("r-arch", "04/01/2026", "Revision 7", 1, match={"0": 0},
              archived=True)
    meas = {
        "0": [_area("Slab", 1200),
              {"type": "distance", "value": 12.0, "visible": True,
               "points": [[0, 0], [10, 0]]},
              {"type": "ref_distance", "value": 3.5, "visible": True,
               "points": [[0, 0], [5, 0]], "ppf": 150.0, "scale": '1"'},
              _area("Lost porch", 77, rev_id="r-gone", rev_page=0),
              _line("Footing", 30, group_id="g1", group_child=True)],
        "1": [_area("Deck", 500, rev_id="r-asi1", rev_page=0),
              _area("Stale deck", 480),
              _area("Waiting wall", 64, rev_id="r-asi1", rev_page=4)],
        "2": [_area("Garage slab", 300)],
        "3": [_area("Wall", 250),
              _area("Wall rev", 260, rev_id="r-two", rev_page=0),
              _line("Footing", 25, group_id="g1", group_child=True,
                    rev_id="r-two", rev_page=0)],
        "4": [_line("Footing", 100, own_value=40.0, group_id="g1",
                    group_count=3)],
        "5": [{"type": "count", "name": "Outlets", "label": "Outlets",
               "points": [[1, 1], [2, 2], [3, 3]], "value": 3,
               "visible": True, "rev_id": "r-asi1", "rev_page": 3},
              {"type": "page_ref", "ref_page": 1, "ref_zone": [0, 0, 1, 1],
               "points": [[5, 5]], "visible": True,
               "rev_id": "r-asi1", "rev_page": 3}],
        "6": [{"type": "textnote", "text": "check", "points": [[2, 2]],
               "visible": True, "rev_id": "r-arch", "rev_page": 0},
              {"type": "window", "name": "Window 1", "label": "Window 1",
               "points": [[3, 3]], "value": 1, "visible": True}],
        "7": [_area("Roof", 900)],
        "-1000": [{"type": "standalone", "name": "Nails", "qty": 5,
                   "unit": "box", "visible": True}],
    }
    S.append({
        "name": "the estimator's walk", "pageCount": 8,
        "pageSizes": {"5": [80, 48]},
        "metadata": {
            "page_labels": labels, "page_labels_custom": {"6": "A6.0 rev"},
            "sheet_version": {"1": "r-asi1"},
            "sheet_origin": {"2": ["r-asi1", 1, "02/10/2026"],
                             "7": ["r-two", 2]},
            "extra_sheets": [{"id": "xs-new9", "after": 6,
                              "label": "A9 (New)"}],
            "revisions": [r1, r2, r3],
        },
        "measurements": meas,
    })

    # 2. A real job's shape: every piece of takeoff drawn on a revision nothing
    #    counted -- the estimate as opened is zero.
    S.append({
        "name": "all on a revision nothing counts", "pageCount": 2,
        "metadata": {
            "page_labels": ["D1", "D2"],
            "revisions": [_rev("r-a", "01/05/2026", "Demo plan", 2,
                               match={"0": 0, "1": 1})],
        },
        "measurements": {
            "0": [_area("Demo floor", 2000.2, rev_id="r-a", rev_page=0)],
            "1": [_area("Demo roof", 929.0, rev_id="r-a", rev_page=1)],
        },
    })

    # 3. Names: duplicate descriptions, a number that is its own, a number
    #    that is another's, one too long to be a name, a hidden one.
    S.append({
        "name": "one name per revision", "pageCount": 3,
        "metadata": {
            "page_labels": ["S1", "S2", "S3"],
            "sheet_version": {"0": "r-b2", "2": "r-long"},
            "revisions": [
                _rev("r-b1", "1-2-2026", "Bulletin", 1, match={"0": 0}),
                _rev("r-b2", "1-3-2026", "bulletin", 1, match={"0": 0}),
                _rev("r-own", "1-4-2026", "Rev 3", 1, match={"1": 0}),
                _rev("r-other", "1-5-2026", "R2", 1, match={"1": 0}),
                _rev("r-long", "", "New changes as of 9-24-2026", 1,
                     match={"2": 0}),
                _rev("r-hid", "2026-02-01", "ASI 9", 1, match={"2": 0},
                     visible=False),
            ],
        },
        "measurements": {
            "0": [_area("A", 10, rev_id="r-b2", rev_page=0), _area("B", 20)],
            "1": [_area("C", 30, rev_id="r-own", rev_page=0)],
            "2": [_area("D", 40, rev_id="r-long", rev_page=0),
                  _area("E", 50, rev_id="r-hid", rev_page=0)],
        },
    })

    # 4. A promoted sheet whose revision was DELETED, ranked by the date
    #    stamped on it; one whose date cannot be read; an older reissue of
    #    each still paired with it.
    S.append({
        "name": "origins after a delete", "pageCount": 3,
        "metadata": {
            "page_labels": ["P1", "P2", "P3"],
            "sheet_origin": {"1": ["r-deleted", 0, "06/01/2026"],
                             "2": ["r-deleted", 1, "whenever"]},
            "revisions": [_rev("r-old", "05/01/2026", "Old ASI", 2,
                               match={"1": 0, "2": 1})],
        },
        "measurements": {
            "1": [_area("On own", 11)],
            "2": [_area("On own too", 12),
                  _area("On old", 13, rev_id="r-old", rev_page=1)],
        },
    })

    # 5. A revision the file names but carries no pages for, booked: the
    #    desktop has no such revision, so the sheet counts its own drawing.
    S.append({
        "name": "a booked revision with no pages", "pageCount": 2,
        "metadata": {
            "page_labels": ["Q1", "Q2"],
            "sheet_version": {"0": "r-empty", "1": "r-full"},
            "revisions": [_rev("r-full", "07/01/2026", "Full", 1,
                               match={"1": 0}),
                          _rev("r-empty", "07/02/2026", "Empty", 0,
                               match={"0": 0})],
        },
        "measurements": {
            "0": [_area("Own Q1", 100),
                  _area("Empty Q1", 101, rev_id="r-empty", rev_page=0)],
            "1": [_area("Own Q2", 200),
                  _area("Full Q2", 201, rev_id="r-full", rev_page=0)],
        },
    })

    # 6. A swap: two pages of the counted revision traded sheets; the
    #    takeoff stays with the PAGE it was traced on.
    S.append({
        "name": "a page swap inside the counted revision", "pageCount": 2,
        "metadata": {
            "page_labels": ["W1", "W2"],
            "sheet_version": {"0": "r-s", "1": "r-s"},
            "revisions": [_rev("r-s", "08/01/2026", "Swap", 2,
                               match={"0": 1, "1": 0})],
        },
        "measurements": {
            "0": [_area("Traced on p1", 40, rev_id="r-s", rev_page=0)],
            "1": [_area("Traced on p2", 50, rev_id="r-s", rev_page=0)],
        },
    })

    # 7. Sheets with NOTHING taken off: the first takeoff books the drawing
    #    it lands on. A pin, a note and a ruler are not takeoff and do not
    #    stand in the way; a reissue on other paper, or a hidden revision,
    #    cannot be booked; a sheet booked to its own drawing stays put.
    S.append({
        "name": "the first takeoff books", "pageCount": 5,
        "metadata": {
            "page_labels": ["F1", "F2", "F3", "F4", "F5"],
            "sheet_version": {"4": "r-f1"},
            "revisions": [
                _rev("r-f1", "09/01/2026", "ASI 4", 5,
                     match={"1": 0, "2": 1, "3": 2, "4": 3, "0": 4},
                     sizes={"4": [99, 48]}),
                _rev("r-fh", "09/02/2026", "Hidden one", 1,
                     match={"1": 0}, visible=False),
            ],
        },
        "measurements": {
            "2": [{"type": "page_ref", "ref_page": 0, "points": [[1, 1]],
                   "visible": True},
                  {"type": "textnote", "text": "n", "points": [[2, 2]],
                   "visible": True, "rev_id": "r-f1", "rev_page": 1}],
            "3": [{"type": "distance", "value": 4.0, "visible": True,
                   "points": [[0, 0], [3, 0]]}],
        },
    })

    # 8. Two things an older file or a web edit can hold: a sheet's ORIGIN
    #    pair still written into `match` (the desktop heals it out on its
    #    next revision edit -- until then the sheet must not be a version of
    #    itself), and a multi-sheet item whose MASTER sits on a drawing that
    #    does not count while one of its runs does. Plus runs whose master
    #    is gone altogether.
    S.append({
        "name": "an unhealed origin and a master that does not count",
        "pageCount": 3,
        "metadata": {
            "page_labels": ["H1", "H2", "H3"],
            "sheet_origin": {"1": ["r-h", 0, "10/01/2026"]},
            "revisions": [_rev("r-h", "10/01/2026", "Bulletin 9", 2,
                               match={"1": 0, "2": 1}),
                          _rev("r-old9", "09/01/2026", "Bulletin 8", 1,
                               match={"1": 0})],
        },
        "measurements": {
            "0": [_line("Beam", 12.0, group_id="g9", group_child=True)],
            "1": [_area("Own H2", 44)],
            "2": [_line("Beam", 99.0, own_value=30.0, group_id="g9",
                        group_count=2, rev_id="r-h", rev_page=1),
                  _line("Ghost", 7.0, group_id="g-gone", group_child=True)],
        },
    })

    # 9. A revision PARKED until it is imported again -- what a crash restore
    #    leaves when its drawings never reached the file. A sheet booked to it
    #    counts its own drawing meanwhile, and the takeoff on the parked
    #    drawing waits: no sentence may tell him to open that drawing and
    #    press Count this version -- it is not in the job. A sheet with
    #    takeoff on a LIVE revision as well still hears it.
    S.append({
        "name": "a revision waiting to be imported again", "pageCount": 3,
        "metadata": {
            "page_labels": ["P1", "P2", "P3"],
            "sheet_version": {"1": "r-park"},
            "revisions": [_rev("r-live", "05/01/2026", "ASI 3", 2,
                               match={"2": 0})],
            "revisions_pending_images": [
                {"id": "r-park", "date": "06/01/2026", "description": "ASI 4",
                 "source": "asi4.pdf", "match": {"1": 0}}],
        },
        "measurements": {
            "0": [_area("Own P1", 10)],
            "1": [_area("Own P2", 20),
                  _area("Parked P2", 30, rev_id="r-park", rev_page=0)],
            "2": [_area("Own P3", 40),
                  _area("Parked P3", 50, rev_id="r-park", rev_page=1),
                  _area("Live P3", 60, rev_id="r-live", rev_page=0)],
        },
    })

    # 10. The words for what moves (FIX6 step 2): an item's associated
    #     materials named with it, the rest of a long list summed by unit,
    #     and a multi-sheet item's first shape named by ITS amount on its
    #     own drawing (4 sq ft) -- never by the item's whole total (13).
    def _mat(name, qty, mode, unit):
        return {"name": name, "qty": qty, "qty_mode": mode, "unit": unit,
                "unit_cost": 1.0, "cost_type": "material"}
    S.append({
        "name": "materials, a long list and a shared item", "pageCount": 3,
        "metadata": {
            "page_labels": ["M1", "M2", "M3"],
            "revisions": [_rev("r-m", "10/05/2026", "ASI 5", 2,
                               match={"0": 0, "1": 1})],
        },
        "measurements": {
            "0": [_area("Slab", 300, associated_items=[
                      _mat("Dumpster 20yd", 1, "total", "each"),
                      _mat("Rebar #4", 1.1, "per_unit", "LF")]),
                  _area("Footing", 120), _area("Stem Wall", 90),
                  _area("Garage Slab", 250), _area("Porch", 60),
                  _area("Walk", 40, associated_items=[
                      _mat("Gravel", 0.05, "per_unit", "CY")]),
                  _area("Driveway", 200, associated_items=[
                      _mat("Base", 0.1, "per_unit", "CY"),
                      _mat("Forms", 60, "total", "LF"),
                      _mat("Pump", 1, "total", "each")])],
            "1": [_area("Wall", 13, own_value=4.0, group_id="g-w",
                        group_count=2, rev_id="r-m", rev_page=1,
                        associated_items=[
                            _mat("Studs", 0.75, "per_unit", "EA"),
                            _mat("Nails", 2, "total", "box")])],
            "2": [_area("Wall", 9, group_id="g-w", group_child=True)],
        },
    })

    # 11. Delete takes what was asked (3.07 round 1 of the browser port):
    #     a multi-sheet wall with its main shape on one sheet and runs on two
    #     others (one of them on a revision nothing counts from, so it is in
    #     no total), an item with two shapes on ONE sheet, a sloped roof and a
    #     post run whose totals carry perimeter / flat area / feet, a Group
    #     container with members on two sheets, window and door pins, a lone
    #     count, a job-wide item, and runs whose main shape is gone.
    def _slope(name, value, **kw):
        m = _area(name, value, type="slope_area", pitch=6.0, **kw)
        return m
    S.append({
        "name": "what a delete takes", "pageCount": 4,
        "metadata": {
            "page_labels": ["A1.0", "A1.1", "A2.0", "A3.0"],
            "revisions": [_rev("r-d", "11/01/2026", "ASI 2", 1,
                               match={"2": 0})],
        },
        "measurements": {
            "0": [_area("Wall M", 65, own_value=10.0, group_id="g-m",
                        group_count=5, perimeter=40.0, own_perimeter=8.0,
                        associated_items=[{"name": "Studs", "qty": 0.75,
                                           "qty_mode": "per_unit",
                                           "unit": "EA"}],
                        notes="main", in_group="grp-1"),
                  {"type": "window", "name": "Window 1", "label": "Window 1",
                   "points": [[3, 3]], "value": 1, "visible": True,
                   "win_seq": 1},
                  {"type": "count", "name": "Outlets", "label": "Outlets",
                   "points": [[1, 1], [2, 2]], "value": 2, "visible": True}],
            "1": [_area("Wall M", 20, group_id="g-m", group_child=True,
                        perimeter=12.0),
                  _area("Deck", 30, own_value=18.0, group_id="g-d",
                        group_count=2),
                  _area("Wall M", 15, group_id="g-m", group_child=True,
                        perimeter=10.0),
                  _area("Deck", 12, group_id="g-d", group_child=True),
                  {"type": "door", "name": "Door 1", "label": "Door 1",
                   "points": [[4, 4]], "value": 1, "visible": True,
                   "door_seq": 1}],
            "2": [_area("Wall M", 20, group_id="g-m", group_child=True,
                        perimeter=10.0),
                  _area("Wall M", 9, group_id="g-m", group_child=True,
                        perimeter=6.0, rev_id="r-d", rev_page=0),
                  _slope("Roof", 150, own_value=100.0, group_id="g-r",
                         group_count=2, perimeter=50.0, own_perimeter=40.0,
                         flat_area=134.0, own_flat=89.4, in_group="grp-1"),
                  _line("Ghost", 7.0, group_id="g-gone", group_child=True),
                  # the main shape and the FIRST run on one sheet, a second
                  # run on the next: deleting both here, the item must pass
                  # once, straight to the second run -- never through the
                  # first, whose own notes and colour it would then carry
                  _line("Beam", 30.0, own_value=12.0, group_id="g-b",
                        group_count=3),
                  _line("Beam", 10.0, group_id="g-b", group_child=True,
                        notes="run note", color=[0.0, 0.0, 1.0, 1.0])],
            "3": [_slope("Roof", 50, group_id="g-r", group_child=True,
                         perimeter=10.0, flat_area=44.6),
                  {"type": "linear_count", "name": "Posts", "label": "Posts",
                   "points": [[0, 0], [30, 0]], "value": 6, "own_value": 4,
                   "total_ft": 50.0, "own_total_ft": 30.0, "spacing_in": 60,
                   "group_id": "g-p", "group_count": 2, "visible": True},
                  {"type": "linear_count", "name": "Posts", "label": "Posts",
                   "points": [[0, 5], [20, 5]], "value": 2, "total_ft": 20.0,
                   "spacing_in": 60, "group_id": "g-p", "group_child": True,
                   "visible": True},
                  _line("Ghost", 5.0, group_id="g-gone", group_child=True),
                  _line("Beam", 8.0, group_id="g-b", group_child=True)],
            "-1000": [{"type": "group", "name": "Garage", "label": "Garage",
                       "group_item_id": "grp-1", "visible": True},
                      {"type": "standalone", "name": "Nails", "qty": 5,
                       "unit": "box", "visible": True}],
        },
    })

    # Every scenario in both orders: the order setting changes which drawing
    # is newest, never what counts.
    out = []
    for s in S:
        for order in ("date", "column"):
            t = copy.deepcopy(s)
            t["order"] = order
            t["name"] = "%s (%s)" % (s["name"], order)
            out.append(t)
    return out


# ── a real project, read without its pixels ──────────────────────────────

MAGIC, REVS = b"PDFCACHE1", b"TKREVS01"


def read_project(path):
    """Header, metadata and the revision tail's blob COUNTS -- no images."""
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
            (nrev,) = struct.unpack("<I", f.read(4))
            for _ in range(nrev):
                (c,) = struct.unpack("<I", f.read(4))
                f.read(4 * c)
                counts.append(c)
    return meta, page_count, counts


def scenario_from_file(path, index):
    meta, page_count, counts = read_project(path)
    meas = meta.pop("measurements", {}) or {}
    meta.pop("annotations", None)
    revs = []
    for i, r in enumerate(meta.get("revisions") or []):
        r = dict(r)
        r["pages"] = counts[i] if i < len(counts) else 0
        revs.append(r)
    meta["revisions"] = revs
    return {"name": "library project %d" % (index + 1),
            "pageCount": page_count, "metadata": meta,
            "measurements": meas, "order": "date"}


def reopen(req):
    """The desktop OPENING what the browser saved: every multi-shape item is
    re-added from its runs on every open (_resync_group_totals), and any
    total that comes out different at all is announced as re-added. Each
    job is the browser's own JSON text, so a whole number it wrote as `180`
    is an int here, as it is to the desktop. Returns, per job, the items
    whose total moved: [group_id, was, now]. And Python's own sum() of each
    list in `sums`, read the same way."""
    moved = []
    for job in req.get("jobs") or []:
        w = Win(job)
        gl = w.gl_widget
        was = {}
        for lst in gl._measurements.values():
            for m in lst or []:
                if m.get("group_id") and not m.get("group_child"):
                    was[id(m)] = m.get("value")
        w._resync_group_totals()
        out = []
        for lst in gl._measurements.values():
            for m in lst or []:
                if id(m) in was and m.get("value") != was[id(m)]:
                    out.append([m.get("group_id"), was[id(m)], m.get("value")])
        moved.append(out)
    # and what a main shape's heir takes over from it (_promote_child)
    heirs = []
    for doomed, heir in req.get("promote") or []:
        Win({"metadata": {}, "pageCount": 1, "measurements": {}}) \
            .gl_widget._promote_child(doomed, heir)
        heirs.append(heir)
    return {"moved": moved, "sums": [sum(v) for v in req.get("sums") or []],
            "heirs": heirs}


if __name__ == "__main__":
    args = sys.argv[1:]
    if args == ["--reopen"]:
        print(json.dumps(reopen(json.loads(sys.stdin.read()))))
        sys.stdout.flush()
        sys.exit(0)
    if args == ["--scenarios"]:
        scns = scenarios()
        print(json.dumps({"lifted": sorted(MODULE_NAMES),
                          "scenarios": [{"input": s, "truth": truth(s)}
                                        for s in scns],
                          "jobSwitch": job_switch()}, indent=1))
    else:
        res = []
        for i, p in enumerate(args):
            s = scenario_from_file(p, i)
            res.append({"input": s, "truth": truth(s)})
        print(json.dumps({"lifted": sorted(MODULE_NAMES), "scenarios": res}))
