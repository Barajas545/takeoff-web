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
    # with the list not on one sheet, or every shape of the item on screen,
    # it answers None and the plain question is asked.
    "_on_item_delete", "_ask_delete_here", "_shapes_on_screen",
    # A job switch: the count held for the last job is put down.
    "_drop_per_project_reads",
    # A double-click on a row (a tap in the browser) and Properties... from
    # it: with the SHEET chip on, the item's shapes on the drawing on
    # screen, one per activation, and the form opened on one of them --
    # never a page turn; with it off, the item's shapes across sheets.
    "_on_item_activated", "_activate_on_this_sheet",
    "_on_item_properties", "_properties_on_this_sheet",
    # 3.08: the job's takeoffs, what a money sentence calls them
    # (_takeoff_naming_now, installed per scenario of several takeoffs as
    # the window installs it), what "Back on this sheet's own drawing" counts
    # of the others, and what Delete Page owes about them.
    "takeoff_lists", "takeoff_list_label", "has_takeoff_lists",
    "_takeoff_naming_now", "_other_takeoffs_here", "_hidden_takeoffs_words",
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
    # What a job switch forgets that is not the count: a marking run, the
    # source PDF, the vision readings. None of it moves a number, and the
    # stand-ins record nothing. The Item box is the window's.
    "_detail_next", "_end_manual_details", "_source_pdf_path",
    "_vision_callouts", "tool_name_box",
    # A row's activation: the cycle it remembers (which item, which shape),
    # and where it goes -- recorded, never moving anything: the page turn
    # (go_to_item), the forms of a Group and an item on no sheet, and the
    # labels it refreshes.
    "_shape_cycle_gid", "_shape_cycle_idx", "go_to_item",
    "_edit_group_item", "_edit_standalone_item", "_update_page_label",
    "update_zoom_label",
    # 3.08: the takeoff a Ctrl+Z is to follow, forgotten on a job switch
    # (a view switch the web never makes: it is always in Main)
    "_undo_takeoff_to",
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
              "forget_armed_count", "_pending_name",
              # What is painted on the drawing on screen: the SHEET chip's
              # one question, asked of the revision up (_preview_key) --
              # and of the drawing a pin or a note is shown on.
              "on_this_version", "viewing_rev_id", "_mark_drawing",
              "preview_key",
              # 3.08: the takeoff he is in -- the VIEW test (the SHEET
              # chip's rows, the solo form, refresh's walk). Lifted, not a
              # True stub: a Deck item then answers False, as it does on
              # the desktop. The web is in Main, always: the stand-in
              # starts at "".
              "in_active_list", "active_takeoff_list",
              "set_active_takeoff_list"]
# Class-level names lifted with the methods (assignments, not defs).
GL_ATTRS = ["_PROMOTE_KEYS"]
GL_STUBS = {"_measurements", "_current_page", "_main_window", "_undo_stack",
            "current_page", "_preview_key", "_images",
            # what a row's activation does on the canvas: recorded
            "zoom_to_measurement", "select_measurement",
            "_edit_selected_properties",
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
            "_last_floor", "_last_category", "_last_sub", "_last_cost_type",
            # 3.08: the takeoff he is in ("" = Main; the web's, always)
            "_takeoff_list_active"}

# TakeoffItemsPanel: the SHEET chip (3.06) -- which rows a list on one sheet
# shows, what it says is left out, its title, a row's words (this sheet's
# quantity, the whole item's, the other sheets), the chip remembered and
# folding NOT ON A SHEET, and following a page turn once.
PANEL_METHODS = ["_page_disp", "_counts", "_waiting_why", "_rev_disp",
                 "sheet_only", "_sheet_on", "_sheet_now", "_on_sheet_chip",
                 "set_settings", "on_sheet_shown", "_sheet_turned",
                 "_sheet_rows", "_hidden_words", "_note_meta", "_title_for",
                 "_open_solo_on_add", "_counts_here", "_total_of",
                 "_qty_words", "_sheet_value_str", "_also_on", "_value_str",
                 "_n"]
PANEL_ATTRS = ["_SOLO", "_NOT_ROWS"]
# The panel's data, the window's functions it is handed (set_*_fn), the
# chip's button and Settings, the 80 ms timer, and the widgets refresh
# makes -- recorded, no number.
PANEL_STUBS = {"_gl_widget", "_page_label_fn", "_counted_fn", "_waiting_fn",
               "_rev_label_fn", "_run_counted_fn", "_total_fn", "_settings",
               "_sheet_btn", "_sheet_only", "_collapsed", "_solo_count",
               "_here", "_sheet_pages", "_sheet_shapes", "_sheet_key",
               "_sheet_timer", "_dragging", "refresh", "_sheet_note", "_ttl",
               "_cost_filter", "_floor_filter", "_group_filter"}
# Pieces of two methods that build widgets (refresh, _item_row), lifted BY
# TEXT as a run of their own statements -- from the first matching statement
# to the last -- and run as a function of the names they read. Everything
# around them is a Qt widget; these are the decisions and the words:
#   all_m      refresh's walk: the rows the cost, floor and group filters leave
#   title      refresh: the title, its tooltip, the (page, drawing) remembered
#   notes      refresh: what the chip leaves out, on top or as 'Not shown:'
#   row_value  _item_row: the shapes here, counted here, the row's quantity
#   row_page   _item_row: the sheet label, '+N', the tooltip, the ⊘ chip
def _is_assign(*names):
    return lambda s: isinstance(s, ast.Assign) and any(
        isinstance(t, ast.Name) and t.id in names
        or isinstance(t, ast.Tuple) and any(isinstance(e, ast.Name)
                                            and e.id in names for e in t.elts)
        for t in s.targets)


def _is_self_assign(attr):
    return lambda s: isinstance(s, ast.Assign) and any(
        isinstance(t, ast.Attribute) and t.attr == attr for t in s.targets)


def _is_for_over(attr):
    return lambda s: isinstance(s, ast.For) and attr in ast.dump(s.iter)


def _is_if(text):
    return lambda s: isinstance(s, ast.If) and ast.unparse(s.test) == text


def _is_call(text):
    return lambda s: isinstance(s, ast.Expr) and \
        ast.unparse(s.value).startswith(text)


PANEL_SLICES = {
    "_lift_all_m": ("refresh", _is_assign("all_m"),
                    _is_for_over("_measurements"), [], ["all_m"]),
    "_lift_title": ("refresh", _is_assign("sheet_lbl"),
                    _is_self_assign("_sheet_key"), [], ["sheet_lbl"]),
    "_lift_notes": ("refresh", _is_assign("footer"),
                    _is_if("sheet is not None"),
                    ["sheet", "sheet_lbl", "tree", "emit"], ["footer"]),
    "_lift_row_value": ("_item_row", _is_assign("here"), _is_assign("val"),
                        ["page_idx", "m", "solo"],
                        ["here", "counted_here", "val"]),
    "_lift_row_page": ("_item_row", _is_assign("pg_txt"),
                       _is_if("rev_txt or not counts"),
                       ["page_idx", "m", "solo", "here", "counted_here"],
                       ["pg_txt", "also", "also_tip", "page_hint", "rev_txt",
                        "counts", "chip", "_why"]),
}

# Module-level names the TEST itself calls. Everything they and the methods
# reach is found by the closure walk below, not listed by hand.
MODULE_SEED = ["is_takeoff_item", "takeoff_qty", "takeoff_quantity_words",
               "takeoff_move_words", "resolve_latest_sheets",
               # 3.08: the naming hook every money sentence asks
               "set_takeoff_naming", "takeoff_others_moved_words",
               "revision_short_name", "parse_revision_date", "revision_rank",
               "_ORIGINAL_RANK", "STANDALONE_PAGE", "KEPT_MARK_TYPES",
               "NON_TAKEOFF_TYPES", "READING_TYPES", "REF_DIST_TYPE",
               "PIN_TYPES"]

# Classes a lifted body names, and the stand-in each one becomes.
CLASS_ALIASES = {"GLPageWidget": "GL", "TakeoffItemsPanel": "PanelBase"}

# Module-level imports a lifted body may reach, and what provides them.
class _QMessageBox:
    """The one Qt name the questions reach: what was asked is recorded --
    title, text, the buttons and the default one -- and the answer is
    whatever the scenario says. Qt's own values, so `Yes | No` is a set of
    two buttons that can be told from `Yes` alone.

    Made as a box of its own (the SHEET chip's three-way question,
    _ask_delete_here): its title, text, informative text, buttons in order
    and the default one are recorded in `boxes`, and the button at index
    `pick` is the one clicked."""
    Yes, No = 0x4000, 0x10000
    Question, AcceptRole, DestructiveRole, RejectRole = 4, 0, 2, 1
    asked = []
    answer = No
    boxes = []
    pick = 2

    def __init__(self, parent=None):
        self.said = {"title": "", "text": "", "info": "", "buttons": [],
                     "default": None}
        self._btns = []
        _QMessageBox.boxes.append(self.said)

    def setWindowTitle(self, t):
        self.said["title"] = str(t)

    def setIcon(self, icon):
        pass

    def setText(self, t):
        self.said["text"] = str(t)

    def setInformativeText(self, t):
        self.said["info"] = str(t)

    def addButton(self, label, role):
        b = object()
        self._btns.append(b)
        self.said["buttons"].append(str(label))
        return b

    def setDefaultButton(self, b):
        self.said["default"] = self._btns.index(b)

    def exec_(self):
        pass

    def clickedButton(self):
        return self._btns[_QMessageBox.pick]

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

class _QLabel:
    """The sheet label a row slice makes: its text and tooltip, as set."""
    def __init__(self, text=""):
        self.text = str(text)
        self.first = self.text
        self.tip = ""

    def setText(self, t):
        self.text = str(t)

    def setToolTip(self, t):
        self.tip = str(t)


PROVIDED_IMPORTS = {"re": re, "math": math, "json": json, "os": os,
                    "QMessageBox": _QMessageBox, "QLabel": _QLabel,
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


# Desktop 3.08 (takeoff lists) is the source this harness lifts: against an
# older one it stops here with one line, not with "could not find".
NEEDS_308 = [("GLPageWidget", n) for n in ("in_active_list",
                                           "active_takeoff_list",
                                           "set_active_takeoff_list")]
_missing_308 = [
    "%s.%s" % (c, n) for c, n in NEEDS_308
    if not any(isinstance(x, (ast.FunctionDef, ast.AsyncFunctionDef))
               and x.name == n for x in getattr(TOP.get(c), "body", []))]
if _missing_308:
    raise SystemExit(
        "tests/counting-python-truth.py needs the desktop 3.08 source "
        "(PTT_DESKTOP_SRC): %s has no takeoff lists (no %s)"
        % (SRC, ", ".join(_missing_308)))


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


CANVAS_ATTRS = ("gl_widget", "_gl_widget")   # the window's, the panel's


def _self_attrs(fn):
    """{'win': {...}, 'gl': {...}} -- what a method reads off `self`, and off
    the canvas it reaches through `self.gl_widget` (the panel's
    `self._gl_widget`), or a local alias of it."""
    gl_alias = set()
    for s in ast.walk(fn):
        if isinstance(s, ast.Assign) and len(s.targets) == 1 \
                and isinstance(s.targets[0], ast.Name) \
                and isinstance(s.value, ast.Attribute) \
                and isinstance(s.value.value, ast.Name) \
                and s.value.value.id == "self" \
                and s.value.attr in CANVAS_ATTRS:
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
                and v.value.id == "self" and v.attr in CANVAS_ATTRS:
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


def _slice_source(name):
    """The def a PANEL_SLICES entry becomes: the method's own statements,
    from the first that matches to the last, as a function of the names
    they read, returning the ones asked for (those it set)."""
    meth, first, last, params, returns = PANEL_SLICES[name]
    fn = _method(_class("TakeoffItemsPanel"), meth)
    body = fn.body
    i = next((k for k, s in enumerate(body) if first(s)), None)
    j = None if i is None else next(
        (k for k in range(i, len(body)) if last(body[k])), None)
    if i is None or j is None:
        raise SystemExit("could not find the %s statements of "
                         "TakeoffItemsPanel.%s in %s -- the desktop source "
                         "has moved" % (name, meth, SRC))
    text = textwrap.dedent("".join(
        LINES[body[i].lineno - 1:body[j].end_lineno]))
    want = ", ".join(repr(r) for r in returns)
    return ("def %s(self%s):\n" % (name, "".join(", " + p for p in params))
            + textwrap.indent(text, "    ")
            + "    return {k: v for k, v in locals().items() if k in (%s,)}\n"
            % want)


def _slice_fn(name):
    return ast.parse(_slice_source(name)).body[0]


def closure_problems():
    """Everything the lifted set reaches and does not carry. [] is a
    closure; anything else is said by name before a line is executed."""
    win_cls, gl_cls = _class("PDFCacheViewer"), _class("GLPageWidget")
    panel_cls = _class("TakeoffItemsPanel")
    methods = [("win", _method(win_cls, n)) for n in WIN_METHODS] \
        + [("gl", _method(gl_cls, n)) for n in GL_METHODS] \
        + [("panel", _method(panel_cls, n)) for n in PANEL_METHODS] \
        + [("panel", _slice_fn(n)) for n in PANEL_SLICES]
    problems = []
    want = set(MODULE_SEED)
    for kind, fn in methods:
        win, gl = _self_attrs(fn)
        if kind == "panel":
            # the panel's own `self`, and the canvas it holds
            gl_self = set()
            for a in sorted(win - set(PANEL_METHODS) - set(PANEL_ATTRS)
                            - set(PANEL_SLICES) - PANEL_STUBS):
                problems.append("TakeoffItemsPanel.%s reads self.%s, which "
                                "is neither lifted nor a declared stub"
                                % (fn.name, a))
            win = set()
        elif kind == "win":
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
                            % ({"win": "PDFCacheViewer",
                                "panel": "TakeoffItemsPanel"}.get(
                                    kind, "GLPageWidget"), fn.name, a))
        want |= _free_names(fn)
    for n in GL_ATTRS:
        want |= _free_names(_attr(gl_cls, n))
    for n in PANEL_ATTRS:
        want |= _free_names(_attr(panel_cls, n))
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
exec(compile(_class_source("PanelBase", _class("TakeoffItemsPanel"),
                           PANEL_METHODS,
                           "the Items list: lifted methods + declared stubs",
                           attrs=PANEL_ATTRS)
             + "\n" + "\n".join(textwrap.indent(_slice_source(n), "    ")
                                for n in PANEL_SLICES),
             "<extracted TakeoffItemsPanel>", "exec"), NS)
NS["TakeoffItemsPanel"] = NS["PanelBase"]
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


class _Button:
    """The SHEET chip's QPushButton: checked or not."""
    def __init__(self):
        self.checked = False

    def isChecked(self):
        return self.checked

    def setChecked(self, on):
        self.checked = bool(on)

    def blockSignals(self, on):
        pass


class _Timer:
    """The panel's 80 ms single-shot timer: how often it was (re)started."""
    def __init__(self):
        self.starts = 0

    def start(self):
        self.starts += 1


class _Settings:
    """The window's Settings, as the chip reads and writes them."""
    def __init__(self, values=None):
        self.values = dict(values or {})
        self.saves = 0

    def get(self, key):
        return self.values.get(key)

    def set(self, key, value):
        self.values[key] = value

    def save(self):
        self.saves += 1


class Panel(NS["PanelBase"]):
    """The Items list, wired to the window the way PDFCacheViewer wires it
    (set_page_label_fn / set_rev_label_fn / set_counted_fn / set_waiting_fn
    / set_run_counted_fn / set_total_fn: the window's own lifted methods).
    The chip starts off, as it does on the desktop. refresh() is the widget
    rebuild: here it only counts, and remembers the (page, drawing) it was
    built for, as refresh does (_lift_title runs those very lines)."""
    def __init__(self, win):
        self._gl_widget = win.gl_widget
        self._page_label_fn = win._page_final_label
        self._rev_label_fn = win.revision_label
        self._counted_fn = win.item_counts_towards
        self._waiting_fn = win.waiting_reason
        self._run_counted_fn = win.run_counts_towards
        self._total_fn = win._counted_qty
        self._sheet_only = False
        self._settings = None
        self._sheet_btn = _Button()
        self._sheet_timer = _Timer()
        self._dragging = False
        self._collapsed = set()
        self._solo_count = None
        self._here, self._sheet_pages, self._sheet_shapes = {}, {}, {}
        self._sheet_key = None
        self._ttl = _QLabel("PROJECT ITEMS")
        self._cost_filter, self._floor_filter, self._group_filter = \
            "all", None, None
        self.rebuilds = 0

    def refresh(self):
        self.rebuilds += 1
        self._lift_title()

    @staticmethod
    def _sheet_note(text, empty=False):
        return [str(text), bool(empty)]

    def __getattr__(self, name):
        raise AttributeError("TakeoffItemsPanel stand-in has no %r -- "
                             "declare it or lift it" % name)


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
        # the takeoff he is in: Main, as the web always is
        self._takeoff_list_active = ""
        # The drawing on screen: None is the sheet's own, (rev_id, rev_page)
        # a revision of it (set_preview_texture's key); and the sheets.
        self._preview_key = None
        self._images = win.images
        # what a row's activation did on the canvas
        self.zoomed = []
        self.selected = []
        self.edited = []

    def zoom_to_measurement(self, m, max_zoom=8.0):
        self.zoomed.append(m)

    def select_measurement(self, m):
        # The desktop selects only what is painted on the drawing on screen
        # (on_this_version); recorded as asked, the guard is the canvas's.
        self.selected.append(m)
        self._sel_meas = m

    def _edit_selected_properties(self):
        self.edited.append(self._sel_meas)

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
        self.items_panel = Panel(self)
        self._unsaved = False
        self.announced = []
        # what a job switch forgets besides the count
        self._detail_next = ""
        self._source_pdf_path = "last-job.pdf"
        self._vision_callouts = {"0": []}
        self.tool_name_box = None
        self.went = []

    # Where a row's activation goes, recorded and never moving: the page
    # turn, a Group's form and an item on no sheet's form, the labels.
    def go_to_item(self, page_idx, m):
        self.went.append((page_idx, m))

    def _edit_group_item(self, m):
        self.went.append(("group", m))

    def _edit_standalone_item(self, m):
        self.went.append(("standalone", m))

    def _update_page_label(self):
        pass

    def update_zoom_label(self):
        pass

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


def truth(scn, sheet="full"):
    """Every answer for one scenario. A scenario of several takeoffs
    ("takeoffs": true) is asked with the window's naming installed, as the
    desktop window installs it (set_takeoff_naming(_takeoff_naming_now)),
    and taken away after: every money sentence then names another takeoff's
    item "(in Deck)". The web is in Main, as the stand-in canvas is."""
    if not scn.get("takeoffs"):
        return _truth(scn, sheet)
    NS["set_takeoff_naming"](Win(scn)._takeoff_naming_now)
    try:
        return _truth(scn, sheet)
    finally:
        NS["set_takeoff_naming"](None)


def _truth(scn, sheet="full"):
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

    # ── 3.08: the takeoff he is in (Main) and the others ──
    # NOT ON A SHEET's count (the solo form opens on one more of HIS), what
    # the own drawing holds of the others, and what Delete Page says of them.
    w3 = Win(scn)
    w3.items_panel._solo_count = None
    w3.items_panel._open_solo_on_add()
    out["takeoffs"] = {
        "solo": w3.items_panel._solo_count,
        "otherHere": [w3._other_takeoffs_here(p) for p in range(n)],
        "hidden": [w3._hidden_takeoffs_words(p) for p in range(n)],
        "naming": (lambda nm: None if nm is None
                   else [nm[0], [[k, v] for k, v in nm[1].items()]])(
                       w3._takeoff_naming_now()),
    }
    if sheet:
        out["sheet"] = sheet_truth(scn, filters=(sheet == "full"))
        if sheet == "full":
            out["sheetActs"] = sheet_acts(scn)
    return out


# ── the SHEET chip: one sheet's list, its words, and what a row does ──────

def _pos_of(win):
    return {id(m): [pg, i] for pg, i, m in _items(win)}


def _views(win, p):
    """The drawings of sheet p: its own, then each version of it, as
    (rev_id, rev_page) -- what the canvas's _preview_key holds for it."""
    out = [("", None)]
    for v in win.sheet_versions(p):
        if v[0]:
            out.append((v[0], v[5]))
    return out


def _set_view(win, p, rid, rp):
    win.gl_widget._current_page = p
    win.gl_widget._preview_key = (rid, rp) if rid else None


def _list_rows(panel):
    """The rows refresh lists before the chip (the desktop's own walk,
    _lift_all_m) -- without Group containers: the browser lists no Group
    (items-panel.js EXCLUDED), and its list on one sheet has none either."""
    return [(pg, m) for pg, m in panel._lift_all_m()["all_m"]
            if not NS["is_group"](m)]


def _filters(win, full):
    """The cost filters, and one floor and one category: what the chip is
    asked under."""
    if not full:
        return [("all", None, None)]
    out = [("all", None, None), ("labor", None, None),
           ("material", None, None)]
    floors = [str(m.get("floor_level") or "").strip() for _p, _i, m in _items(win)]
    cats = [str(m.get("category") or "").strip() for _p, _i, m in _items(win)]
    fl = next((f for f in floors if f), None)
    cat = next((c for c in cats if c), None)
    if fl:
        out.append(("all", fl, None))
    if cat:
        out.append(("all", None, cat))
    return out


def sheet_truth(scn, filters=True):
    """Every sheet x every drawing of it x every filter, the chip on: the
    title and its tooltip, the rows (by place), the items on no sheet, what
    is left out (by item) and the sentence it is said in, and each row's
    words -- this sheet's quantity, the whole item's, the sheet label with
    '+N', its tooltip, whether what is painted here counts, the desktop's
    red chip."""
    win = Win(scn)
    pos = _pos_of(win)
    panel = win.items_panel
    out = []
    for p in range(len(win.images)):
        for rid, rp in _views(win, p):
            for cost, floor, group in _filters(win, filters):
                _set_view(win, p, rid, rp)
                panel._sheet_only = True
                panel._cost_filter, panel._floor_filter, panel._group_filter \
                    = cost, floor, group
                panel._here, panel._sheet_pages, panel._sheet_shapes = {}, {}, {}
                all_m = _list_rows(panel)
                lbl = panel._lift_title()["sheet_lbl"]
                rec = {"page": p, "rev": rid, "revPage": rp, "cost": cost,
                       "floor": floor, "group": group, "label": lbl,
                       "title": panel._ttl.text, "tip": panel._ttl.tip}
                if not all_m:
                    rec["empty"] = True     # refresh says "No items yet" first
                    out.append(rec)
                    continue
                sheet = panel._sheet_rows(all_m)
                panel._here = sheet["here"]
                panel._sheet_pages = sheet["pages"]
                panel._sheet_shapes = sheet["shapes"]
                said = []
                footer = panel._lift_notes(
                    sheet, lbl, None, lambda w, meta: said.append(w))["footer"]
                rows = []
                for pg, m in sheet["rows"]:
                    solo = m.get("type") == "standalone" or NS["is_group"](m)
                    v = panel._lift_row_value(pg, m, solo)
                    pw = panel._lift_row_page(pg, m, solo, v["here"],
                                              v["counted_here"])
                    rows.append({
                        "at": pos[id(m)],
                        "here": [pos[id(s)] for s in v["here"] or []],
                        "countedHere": v["counted_here"],
                        "value": v["val"],
                        "text": pw["pg_txt"],
                        "tip": pw["page_hint"].tip,
                        "also": [panel._page_disp(q) for q in pw["also"]],
                        "counts": bool(pw["counts"]),
                        "chip": pw.get("chip", "")})
                rows.sort(key=lambda r: r["at"])
                rec.update({
                    "rows": rows,
                    "solo": sorted(pos[id(m)] for _pg, m in sheet["solo"]),
                    "hidden": sheet["hidden"], "filtered": sheet["filtered"],
                    "words": panel._hidden_words(sheet["hidden"]),
                    "top": said, "footer": footer})
                out.append(rec)
    return out


def _act_record(win, pos, n_said):
    g = win.gl_widget
    return {"said": win.status_label.said[n_said:],
            "sel": [pos[id(m)] for m in g.selected],
            "zoom": [pos[id(m)] for m in g.zoomed],
            "edit": [pos[id(m)] for m in g.edited],
            "went": [[x[0], pos[id(x[1])]] for x in win.went]}


def _act_reset(win):
    g = win.gl_widget
    g.selected[:], g.zoomed[:], g.edited[:], win.went[:] = [], [], [], []
    return len(win.status_label.said)


def sheet_acts(scn):
    """What a row does, the chip on, for every item with a shape on a sheet
    x every drawing of that sheet: a double-click (a tap in the browser)
    over and over -- the shape it selects and zooms to, the line it says,
    any page turn; Properties... -- the shape selected for the form; and
    Delete -- the question, word for word, and what each of its three
    answers does. And with the chip off, the double-click's walk across
    sheets. An item whose MAIN shape is filed on no sheet is a row like any
    other when its runs are drawn on sheets (the desktop's _on_item_activated
    asks _activate_on_this_sheet of every row but a standalone or a Group):
    it is walked on each sheet its runs are on, too."""
    base = Win(scn)
    not_rows = NS["PanelBase"]._NOT_ROWS
    listed = [(pg, i, m) for pg, i, m in _items(base)
              if not m.get("group_child") and m.get("type") not in not_rows
              and not NS["is_group"](m) and not NS["is_standalone"](m)
              and isinstance(pg, int)]
    out = {"activate": [], "across": [], "properties": [], "delete": [],
           "flips": []}
    for pg, i, m in listed:
        gid = m.get("group_id")
        on = sorted({p for p, s in (base.gl_widget._measurement_group(gid)
                                    if gid else [(pg, m)])
                     if isinstance(p, int) and p >= 0})
        # the chip off: the walk across sheets
        w = Win(scn)
        pos = _pos_of(w)
        mm = w.gl_widget._measurements[pg][i]
        n = len(w.gl_widget._measurement_group(gid)) if gid else 1
        seq = []
        for _k in range(max(2, n + 1)):
            k0 = _act_reset(w)
            w._on_item_activated(pg, mm)
            seq.append(_act_record(w, pos, k0))
        out["across"].append({"at": [pg, i], "seq": seq})
        for p in on:
            for rid, rp in _views(base, p):
                # a double-click, over and over
                w = Win(scn)
                pos = _pos_of(w)
                _set_view(w, p, rid, rp)
                w.items_panel._sheet_only = True
                mm = w.gl_widget._measurements[pg][i]
                local = w._shapes_on_screen(pg, mm)
                seq = []
                for _k in range(max(3, len(local) + 1)):
                    k0 = _act_reset(w)
                    w._on_item_activated(pg, mm)
                    seq.append(_act_record(w, pos, k0))
                where = {"at": [pg, i], "page": p, "rev": rid, "revPage": rp}
                out["activate"].append(dict(where, local=[pos[id(s)] for s in local],
                                            seq=seq))
                # Properties...
                k0 = _act_reset(w)
                w._on_item_properties(pg, mm)
                out["properties"].append(dict(where, **_act_record(w, pos, k0)))
                # Delete: the question, and each answer
                if not gid:
                    continue
                for pick in (0, 1, 2):
                    b = _Before(scn)
                    _set_view(b.win, p, rid, rp)
                    b.win.items_panel._sheet_only = True
                    _QMessageBox.boxes[:] = []
                    _QMessageBox.asked[:] = []
                    _QMessageBox.pick = pick
                    _QMessageBox.answer = _QMessageBox.No
                    b.win._on_item_delete(pg, b.at(pg, i))
                    rec = dict(where, pick=pick,
                               boxes=[dict(x) for x in _QMessageBox.boxes],
                               asked=[list(x) for x in _QMessageBox.asked],
                               said=list(b.win.status_label.said),
                               undo=b.gl.undo_levels)
                    rec.update(b.delta())
                    out["delete"].append(rec)
                    if not _QMessageBox.boxes:
                        break       # the plain question: one answer will do
        # One drawing of a sheet, then another, then back: the walk starts
        # again on each -- its key is the drawing (preview_key).
        for p in on:
            vs = _views(base, p)
            if len(vs) < 2:
                continue
            w = Win(scn)
            pos = _pos_of(w)
            w.items_panel._sheet_only = True
            mm = w.gl_widget._measurements[pg][i]
            seq = []
            for rid, rp in (vs[0], vs[1], vs[1], vs[0], vs[0]):
                _set_view(w, p, rid, rp)
                k0 = _act_reset(w)
                w._on_item_activated(pg, mm)
                seq.append(dict(_act_record(w, pos, k0), rev=rid, revPage=rp))
            out["flips"].append({"at": [pg, i], "page": p, "seq": seq})
    return out


def chip_truth():
    """The chip as a setting and a view: remembered in Settings, NOT ON A
    SHEET folded when it is turned on (and on a start with it on) and opened
    by an item added on no sheet -- never by a rebuild or a filter -- and a
    page turn or a drawing flip followed by ONE rebuild, only when the
    (page, drawing) on screen is not the one the list was built for, never
    under a drag, never with the chip off."""
    scn = {"name": "the chip", "pageCount": 2,
           "metadata": {"page_labels": ["X1.0", "X1.1"],
                        "revisions": [_rev("r-c", "11/02/2026", "ASI 6", 1,
                                           match={"1": 0})]},
           "measurements": {
               "0": [_area("Wall", 10)],
               "1": [_area("Deck", 20), _area("Deck rev", 21, rev_id="r-c",
                                              rev_page=0)],
               "-1000": [{"type": "standalone", "name": "Nails", "qty": 5,
                          "unit": "box", "visible": True}]}}
    w = Win(scn)
    p = w.items_panel
    g = w.gl_widget
    settings = _Settings({"items_panel_sheet_only": False})
    SOLO = NS["PanelBase"]._SOLO
    steps = []

    def snap(what):
        steps.append({"what": what, "on": bool(p._sheet_only),
                      "checked": p._sheet_btn.isChecked(),
                      "soloFolded": ("fl", SOLO) in p._collapsed,
                      "soloCount": p._solo_count, "rebuilds": p.rebuilds,
                      "timer": p._sheet_timer.starts,
                      "setting": settings.values.get("items_panel_sheet_only"),
                      "saves": settings.saves})
    p.set_settings(settings)
    snap("a start with the setting off")
    p._sheet_btn.setChecked(True)
    p._on_sheet_chip()
    snap("the chip on")
    p._open_solo_on_add()
    snap("the rebuild it makes")
    p._open_solo_on_add()
    snap("another rebuild, nothing added")
    g._measurements[-1000].append({"type": "standalone", "name": "Glue",
                                   "qty": 1, "unit": "each", "visible": True})
    p._open_solo_on_add()
    snap("an item added on no sheet")
    p._collapsed.add(("fl", SOLO))
    p._open_solo_on_add()
    snap("folded again by hand, nothing added")
    g._measurements[-1000].pop()
    p._open_solo_on_add()
    snap("one on no sheet deleted")
    p.on_sheet_shown()
    p._sheet_turned()
    snap("shown again, the same sheet and drawing")
    g._current_page = 1
    p.on_sheet_shown()
    p.on_sheet_shown()
    p._sheet_turned()
    snap("a page turn: the newest drawing, then the timer")
    g._preview_key = ("r-c", 0)
    p.on_sheet_shown()
    p._sheet_turned()
    snap("a flip to the revision")
    g._preview_key = None
    p._dragging = True
    p.on_sheet_shown()
    p._sheet_turned()
    snap("a flip back under a drag")
    p._dragging = False
    p._sheet_turned()
    snap("the drag over")
    p._sheet_btn.setChecked(False)
    p._on_sheet_chip()
    snap("the chip off")
    g._current_page = 0
    p.on_sheet_shown()
    snap("a page turn, the chip off")
    p._sheet_btn.setChecked(True)
    p._on_sheet_chip()
    snap("the chip on again")
    w2 = Win(scn)
    s2 = _Settings({"items_panel_sheet_only": True})
    w2.items_panel.set_settings(s2)
    restart = {"on": bool(w2.items_panel._sheet_only),
               "checked": w2.items_panel._sheet_btn.isChecked(),
               "soloFolded": ("fl", SOLO) in w2.items_panel._collapsed}
    return {"input": scn, "steps": steps, "restart": restart,
            "SOLO": SOLO, "NOT_ROWS": list(NS["PanelBase"]._NOT_ROWS),
            "titles": {s: NS["PanelBase"]._title_for(s) for s in
                       ("", "X1.0", "X12345678901", "X123456789012",
                        "Floor plan level 2", "ÄÖ1.2-über")},
            "words": [[h, NS["PanelBase"]._hidden_words(h)] for h in (
                {"drawings": 0, "waiting": 0, "sheets": 0},
                {"drawings": 1, "waiting": 0, "sheets": 1},
                {"drawings": 2, "waiting": 1, "sheets": 0},
                {"drawings": 0, "waiting": 3, "sheets": 240})],
            "qty": _qty_cases()}


def _qty_cases():
    """_qty_words and _value_str at Python's ties and Python's %d: 12.25 and
    0.125 (exact in binary, so half to EVEN), 2.675 (just below its tie),
    a count at .5, a linear count, a pin, an unknown kind."""
    P = NS["PanelBase"]
    out = []
    kinds = [{"type": t} for t in ("count", "distance", "polyline",
                                   "linear_count", "area", "slope_area",
                                   "grid", "tile", "window", "standalone",
                                   "mystery")]
    for m in kinds:
        for q in (12.25, 0.125, 2.675, 0.5, 1.5, 2.5, 1318.65, 999.95, 0.0,
                  -0.25, 7.999):
            out.append(["qty", m, q, P._qty_words(m, q)])
    vals = [
        {"type": "area", "value": 12.25}, {"type": "area", "value": 0.125},
        {"type": "area", "value": 12.25, "group_count": 3, "scale": '1/4"'},
        {"type": "grid", "value": 1318.65},
        {"type": "slope_area", "value": 150.25, "pitch": 6.5},
        {"type": "tile", "value": 80.25, "tiles_needed": 1234,
         "pattern": "half", "boxes": 4},
        {"type": "tile", "value": 10, "tiles_needed": 9, "pattern": "odd"},
        {"type": "polyline", "value": 0.125},
        {"type": "distance", "value": 12.345},
        {"type": "count", "points": [[0, 0], [1, 1]]},
        {"type": "count", "points": []},
        {"type": "linear_count", "value": 6.9, "spacing_in": 16},
        {"type": "linear_count", "value": 4},
        {"type": "standalone", "qty": 2.5, "unit": " box "},
        {"type": "standalone", "qty": 0},
        {"type": "window", "win_number": "W1", "win_width": "3'-0\"",
         "win_height": "4'-0\""},
        {"type": "door", "door_number": "D2"},
        {"type": "door"},
        {"type": "partition"}, {"type": "partition", "part_number": "P1"},
        {"type": "header", "hdr_number": "H1", "hdr_size": "auto",
         "hdr_width": "6'"},
        {"type": "header"},
        {"type": "area", "value": 0}, {"type": "mystery", "value": 3}]
    for m in vals:
        out.append(["value", m, None, P._value_str(m)])
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

    # 12. The SHEET chip at its edges (3.06, round 6 of the browser port):
    #     a run on a revision nothing counts whose item's total happens to
    #     equal it ('9.0 sq ft · 9.0 sq ft in all' -- not counted HERE is a
    #     difference); an item on seven sheets ('... and 3 more') with shapes
    #     on two drawings of one sheet; Python's ties in a row's words (12.25,
    #     0.125, a count across sheets); and a run filed on no sheet, which is
    #     no sheet the item is 'also on'.
    def _cnt(name, pts, **kw):
        m = {"type": "count", "name": name, "label": name,
             "points": [[float(k), float(k)] for k in range(pts)],
             "value": pts, "visible": True, "category": "Framing"}
        m.update(kw)
        return m
    def _run(k, **kw):
        # each run its own line: two runs with the same points are one dict
        # to Python's list.remove, and the desktop's delete takes the first
        return _line("Long Wall", 10.0, group_id="g-l", group_child=True,
                     points=[[0.0, float(k)], [40.0, float(k)]], **kw)
    long_runs = {str(p): [_run(p)] for p in range(2, 7)}
    # ...and one on exactly five sheets: the first that is cut ('and 1 more')
    five = {str(p): _line("Five Wall", 4.0, group_id="g-5", group_child=True,
                          points=[[5.0, float(p)], [9.0, float(p)]])
            for p in range(1, 5)}
    S.append({
        "name": "the SHEET chip at its edges", "pageCount": 7,
        "metadata": {
            "page_labels": ["X1.0", "X1.1", "X1.2", "X1.3", "X1.4", "X1.5",
                            "X1.6"],
            "revisions": [_rev("r-e", "11/04/2026", "ASI 9", 1,
                               match={"1": 0})],
        },
        "measurements": dict(long_runs, **{
            "0": [_area("Edge Wall", 9.0, own_value=0.0, group_id="g-e",
                        group_count=3),
                  _area("Edge Wall", 9.0, group_id="g-e", group_child=True),
                  _line("Long Wall", 110.0, own_value=10.0, group_id="g-l",
                        group_count=11),
                  _area("Tie", 12.25), _area("Tie Wall", 15.25,
                                             own_value=12.25, group_id="g-t",
                                             group_count=2),
                  _line("Tie Line", 0.375, own_value=0.125, group_id="g-tl",
                        group_count=2),
                  _cnt("Tie Count", 3, own_value=3, group_id="g-c",
                       group_count=2)],
            "1": [_area("Edge Wall", 9.0, group_id="g-e", group_child=True,
                        rev_id="r-e", rev_page=0),
                  _run(11), _run(12),
                  _run(13, rev_id="r-e", rev_page=0),
                  _run(14, rev_id="r-e", rev_page=0),
                  _run(15, rev_id="r-e", rev_page=0),
                  _cnt("Tie Count", 2, group_id="g-c", group_child=True)],
            "2": [_area("Tie Wall", 3.0, group_id="g-t", group_child=True),
                  _line("Tie Line", 0.25, group_id="g-tl", group_child=True),
                  _run(2)],
            "3": [_area("Stray", 5.0, own_value=5.0, group_id="g-s",
                        group_count=2),
                  _run(3)],
            "-1000": [{"type": "standalone", "name": "Nails", "qty": 5,
                       "unit": "box", "visible": True, "sort_order": 1},
                      _area("Stray", 2.0, group_id="g-s", group_child=True)],
        }),
    })
    edge = S[-1]["measurements"]
    edge["0"].append(_line("Five Wall", 20.0, own_value=4.0, group_id="g-5",
                           group_count=5))
    for p, run in five.items():
        edge[p].append(run)

    # 13. An item whose MAIN shape is filed on no sheet, its runs drawn on
    #     sheets (round 6's review): listed under NOT ON A SHEET with its
    #     sheet words, and a row like any other -- a double-click (a tap)
    #     walks its two runs on X1.1, Properties... selects the run here, and
    #     Delete asks which. One more run on X1.2's reissue; a plain item
    #     beside it; nails on no sheet.
    def _sq(k):
        return [[float(k), 0.0], [k + 4.0, 0.0], [k + 4.0, 3.0]]
    S.append({
        "name": "a main shape on no sheet, its runs on sheets", "pageCount": 3,
        "metadata": {
            "page_labels": ["X1.0", "X1.1", "X1.2"],
            "revisions": [_rev("r-c", "11/05/2026", "ASI 4", 1,
                               match={"2": 0})],
        },
        "measurements": {
            "0": [_area("Post Pad", 2.0, points=_sq(0))],
            "1": [_area("Cap", 1.25, group_id="g-cap", group_child=True,
                        points=_sq(10)),
                  _area("Cap", 2.0, group_id="g-cap", group_child=True,
                        points=_sq(20))],
            "2": [_area("Cap", 0.75, group_id="g-cap", group_child=True,
                        rev_id="r-c", rev_page=0, points=_sq(30))],
            "-1000": [{"type": "standalone", "name": "Nails", "qty": 5,
                       "unit": "box", "visible": True, "sort_order": 1},
                      _area("Cap", 7.0, own_value=3.0, group_id="g-cap",
                            group_count=4, points=_sq(40))],
        },
    })

    # 3.08: a job of several takeoffs (desktop round 3). Main renamed House,
    #     Deck and Patio registered. On X1.0: Main's Joists and a Deck area
    #     of the same name on the same drawing (two items, two takeoffs), a
    #     Deck-only Boards, Patio's Rail (a multi-shape item, its run on
    #     X2.0), a Deck Siding whose main shape is on X3.0 (its run here), a
    #     tag of only a space (Main), a tag the job has no record of, and a
    #     shared note. X2.0 is reissued as Rev B: Deck's Joists and Main's
    #     Siding are traced on it, so Count this version moves both
    #     takeoffs. X3.0 holds nothing of Main's. Nails (Main) and Screws
    #     (Deck) on no sheet.
    DECK, PATIO = "tl-deck0001", "tl-patio001"
    S.append({
        "name": "several takeoffs: Main renamed House, Deck and Patio",
        "takeoffs": True, "pageCount": 3,
        "metadata": {
            "page_labels": ["X1.0", "X2.0", "X3.0"],
            "takeoff_lists": [{"list_id": DECK, "label": "Deck"},
                              {"list_id": PATIO, "label": "Patio"}],
            "takeoff_main_label": "House",
            "takeoff_list_active": DECK,
            "revisions": [_rev("r-b", "03/01/2026", "Rev B", 2,
                               match={"1": 0}, extra={"x-new": 1})],
        },
        "measurements": {
            "0": [_area("Joists", 120.0, points=_sq(0)),
                  _area("Joists", 80.0, takeoff_list=DECK, points=_sq(10)),
                  _area("Boards", 40.0, takeoff_list=DECK, points=_sq(20)),
                  _line("Rail", 50.0, own_value=30.0, group_id="g-rail",
                        group_count=2, takeoff_list=PATIO),
                  _area("Siding", 6.0, group_id="g-sid", group_child=True,
                        takeoff_list=DECK, points=_sq(30)),
                  _area("Pad", 3.0, takeoff_list=" ", points=_sq(40)),
                  _area("Odd", 5.0, takeoff_list="tl-nobody9",
                        points=_sq(50)),
                  {"type": "textnote", "text": "shared", "visible": True,
                   "points": [[1.0, 1.0], [5.0, 5.0]]}],
            "1": [_line("Rail", 20.0, group_id="g-rail", group_child=True,
                        takeoff_list=PATIO),
                  _area("Slab", 90.0, points=_sq(60)),
                  _area("Joists", 60.0, rev_id="r-b", rev_page=0,
                        takeoff_list=DECK, points=_sq(70)),
                  _area("Siding", 24.0, rev_id="r-b", rev_page=0,
                        points=_sq(80))],
            "2": [_area("Siding", 20.0, own_value=14.0, group_id="g-sid",
                        group_count=2, takeoff_list=DECK, points=_sq(90)),
                  _area("Boards", 10.0, takeoff_list=DECK, points=_sq(100))],
            "-1000": [{"type": "standalone", "name": "Nails", "qty": 5,
                       "unit": "box", "visible": True, "sort_order": 1},
                      {"type": "standalone", "name": "Screws", "qty": 2,
                       "unit": "box", "visible": True, "sort_order": 2,
                       "takeoff_list": DECK}],
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


# ── 3.08: the money words, named by takeoff (H7) ─────────────────────────
#
# The totals area's cases (WEBTL\\totals\\named_cases.json): two pictures of
# the totals, and what takeoff_move_words, takeoff_quantity_words and
# takeoff_others_moved_words say of them -- named and named=False, with the
# naming installed (the web in Main) and without it (a job with only Main).

NAMED_NAMES = [["", "House"], ["tl-0000beef", "Deck"], ["tl-0000cafe", "Patio"]]


def _pl(name, value, **kw):
    m = {"type": "polyline", "name": name, "points": [[0, 0], [10, 0]],
         "value": value}
    m.update(kw)
    return m


def _ar(name, value, **kw):
    m = {"type": "area", "name": name, "points": [[0, 0], [1, 0], [1, 1]],
         "value": value}
    m.update(kw)
    return m


def _ct(**kw):
    m = {"type": "count", "name": "Post", "points": [[1, 1], [2, 2]]}
    m.update(kw)
    return m


def named_cases():
    B, C = "tl-0000beef", "tl-0000cafe"
    boards = {"type": "area", "name": "Boards", "points": [[0, 0], [9, 0], [9, 9]]}
    return {
        "names": NAMED_NAMES,
        "cases": [
            {"id": "deck joists leave, main stays",
             "before": [["a", _pl("Joists", 40), 40, "LF"],
                        ["b", _pl("Joists", 40, takeoff_list=B), 40, "LF"]],
             "after": [["a", _pl("Joists", 40), 40, "LF"]]},
            {"id": "both joists leave",
             "before": [["a", _pl("Joists", 40), 40, "LF"],
                        ["b", _pl("Joists", 40, takeoff_list=B), 40, "LF"]],
             "after": []},
            {"id": "both change the same way",
             "before": [["a", dict(boards, value=40), 40, "sq ft"],
                        ["b", dict(boards, value=40, takeoff_list=B), 40, "sq ft"]],
             "after": [["a", dict(boards, value=30), 30, "sq ft"],
                       ["b", dict(boards, value=30, takeoff_list=B), 30, "sq ft"]]},
            {"id": "a deck copy of a main item comes in",
             "before": [["a", _ct(), 2, "EA"]],
             "after": [["a", _ct(), 2, "EA"], ["c", _ct(takeoff_list=B), 2, "EA"]]},
            {"id": "a main item restored as a deck copy (identity carries the tag)",
             "before": [["a", _ct(), 2, "EA"]],
             "after": [["c", _ct(takeoff_list=B), 2, "EA"]]},
            {"id": "unknown id",
             "before": [["a", _ar("Slab", 12, takeoff_list=" tl-dead0000 "), 12, "sq ft"]],
             "after": []},
            {"id": "past the limit, three takeoffs",
             "before": [["a1", _ar("A", 5), 5, "sq ft"],
                        ["a2", _ar("B", 6, takeoff_list=B), 6, "sq ft"],
                        ["a3", _ar("C", 7, takeoff_list=C), 7, "sq ft"],
                        ["a4", _ar("A", 8, takeoff_list=C), 8, "sq ft"],
                        ["a5", _ar("E", 9), 9, "sq ft"],
                        ["a6", _ar("F", 10, takeoff_list=B), 10, "sq ft"]],
             "after": []},
            {"id": "a note is never named",
             "before": [["n", {"type": "textnote", "name": "Note", "takeoff_list": B}, 0, ""]],
             "after": []},
        ],
        "lists": [[_pl("Joists", 40), _pl("Joists", 40, takeoff_list=B),
                   {"type": "count", "name": "Post", "points": [[1, 1]], "takeoff_list": B},
                   {"type": "textnote", "name": "Note"}]],
    }


def named_truth():
    data = named_cases()
    names = dict((k, v) for k, v in data["names"])

    def pic(rows):
        return {k: (m, (float(q), u)) for k, m, q, u in rows}
    out = []
    for active in ("", "tl-0000beef", None):
        NS["set_takeoff_naming"](None if active is None
                                 else (lambda a=active: (a, names)))
        try:
            for c in data["cases"]:
                b, a = pic(c["before"]), pic(c["after"])
                out.append({"id": c["id"], "active": active,
                            "move": NS["takeoff_move_words"](b, a),
                            "moveFuture": NS["takeoff_move_words"](b, a, True),
                            "moveUnnamed": NS["takeoff_move_words"](b, a, True, 4, False),
                            "others": NS["takeoff_others_moved_words"](b, a),
                            "othersFuture": NS["takeoff_others_moved_words"](b, a, True)})
            for i, lst in enumerate(data["lists"]):
                out.append({"id": "list %d" % i, "active": active,
                            "qty": NS["takeoff_quantity_words"](lst),
                            "qtyUnnamed": NS["takeoff_quantity_words"](lst, 4, False)})
        finally:
            NS["set_takeoff_naming"](None)
    return {"cases": data, "words": out}


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
        # The browser's JSON is UTF-8. sys.stdin decodes with the console's
        # code page (cp1252 here), which read a tag padded with U+00A0 as
        # "...\xc2\xa0" -- a padding strip() then could not take off.
        print(json.dumps(reopen(json.loads(
            sys.stdin.buffer.read().decode("utf-8")))))
        sys.stdout.flush()
        sys.exit(0)
    if args == ["--scenarios"]:
        scns = scenarios()
        print(json.dumps({"lifted": sorted(MODULE_NAMES),
                          "scenarios": [{"input": s, "truth": truth(s)}
                                        for s in scns],
                          "jobSwitch": job_switch(),
                          "sheetChip": chip_truth(),
                          "named": named_truth()}, indent=1))
    else:
        res = []
        for i, p in enumerate(args):
            s = scenario_from_file(p, i)
            # a real job's list on every sheet and drawing, under no filter;
            # what a row does is the scenarios' (a real job is too big to
            # walk item by item, sheet by sheet)
            res.append({"input": s, "truth": truth(s, sheet="rows")})
        print(json.dumps({"lifted": sorted(MODULE_NAMES), "scenarios": res}))
