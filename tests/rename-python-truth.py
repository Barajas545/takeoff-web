"""Ground truth for the Items list's HEADINGS and the forms' NAME LISTS, from
the desktop app itself (3.07).

A heading in the Items list -- a floor level, a category, a sub-category --
is the string its rows share. Desktop 3.07 gives every heading a right-click
menu (Rename... / Set ... for these N items... / Rename group..., then
Collapse all and Expand all) and a tooltip worked out from the SAME answer as
the menu, so the tooltip never offers what the menu lacks. And every item
form's Floor and Trade box lists THIS job's own names first, then the stock
list without their look-alikes. The web port (js/core/classify.js,
js/ui/items-panel.js, js/ui/dialogs.js) is held to the desktop's own code,
not to a transcription of it: the members are lifted out of
pdf_fast_viewer.py BY TEXT (through `ast`, so a member is exactly its own
lines) and run as the members of small stand-ins.

  * TakeoffItemsPanel: _HDR_FIELD, _HDR_WHAT, _SOLO, _MENU_CSS, _header_act,
    _header_tip, _rows_under and _show_header_menu -- the menu itself, on a
    stand-in QMenu that records what it was given and answers the entry a
    scenario picks (Collapse all, Expand all, the act's own); and
    highlight_measurement -- a selection on the drawing opens the sections
    its row is folded away in (after a Collapse all, every one) -- with
    _apply_selection, which lights the row and scrolls to it: the row of
    the shape itself, or the row of the item a RUN belongs to (a shape of
    a multi-sheet item shares its group_id), on a stand-in list of the rows
    one refresh lists (_ClickableRow a stand-in that records set_selected);
  * GLPageWidget: CLASS_FIELDS, _class_val, project_values;
  * the module's _fill_class_combo, _project_values_near, the presets, and
    the _class_* helpers they reach (found by the closure walk).

Round 7 (rename-heading, assign-blank-heading; the "rename" key):

  * TakeoffItemsPanel: _n, _amount, _existing_spelling, _rename_from_header,
    _follow_rename, _assign_from_header -- the Rename and Set forms as he
    drives them: on the desktop's own fixture (test_classification_rename.py
    build(), its framed wall made by framing.py's own extra_lines and
    material, lifted the same way), through a stand-in form whose OK and
    sentence ARE the desktop's (ClassificationDialog chosen_name /
    chosen_option / what_text / _update_what / _on_ok, lifted), a stand-in
    question, and a stand-in undo stack that hands each class_tool tag to
    the lifted _undo_class_tool;
  * GLPageWidget: _class_is_row, classification_plan, _plan_counts,
    rename_classification, _follow_classification, _follow_pin_filing,
    _class_tool_now, _class_tool_moved, _undo_class_tool, unfiled_items,
    assign_classification, _pin_filing, _pin_stock, _pin_files,
    _set_pin_filing, _FRAMING_PIN_SPEC;
  * the module's CLASS_RESERVED, ENGINE_CATEGORIES, _class_name_problem,
    PIN_KINDS, page_sort_key, is_takeoff_item, is_group (by the walk).
The web has no item clipboard: _follow_classification_clip finds nothing and
_class_clip_again is never reached (declared stubs); and no Report presets
(_preset_notes answers none: the user's decision 3). The web keeps no last
category, so the canvas's is '' throughout -- the web's state.
tests/classification-rename.mjs replays all of it on the web.

THE LIFTED SET MUST BE A CLOSURE, checked BEFORE anything runs: every
`self.<name>` a lifted member touches is another lifted member or a DECLARED
stub, every name it reads is a builtin, a lifted module name or a DECLARED
stand-in (re, QTimer, _ClickableRow, and for Round 7 GLPageWidget's clipboard
attributes, the framing module, the crash log -- a stand-in that RAISES --
QDialog, QMessageBox and ClassificationDialog), and the one import inside a
lifted body is the one declared (PyQt5.QtWidgets.QMenu, a stand-in put in
sys.modules first, so no real Qt is ever loaded; re and uuid in framing.py).

The stores and the list's rows are given as [page, items] pairs IN THE ORDER
the web walks them (its sheets in order, then the items on no sheet), so a
tie in the sort (a name and its look-alike) is broken the same way on both
sides -- except in r7_page_order, the one case run on the desktop's own file
order (page 2 first), which records the declared divergence: on a file the
desktop wrote with its sheets out of page order, a merge into one of two
look-alikes can go into the other one on the web.

Also declared, not lifted: the desktop's refresh of the list's filters after
every step (FlowPanel.refreshed: a filter on a name no row carries falls
back to All), one sheet's drawing on screen with no revision raised
(FlowGL.on_this_version) and no page waiting (_waiting_why), for the flows
with the SHEET chip on; the lifted _sheet_rows decides what that sheet lists.
r7_text runs the lifted _class_norm and _class_sort_key over every character
this Python's Unicode table assigns. tests/heading-menu.mjs replays every heading scenario on the web and
diffs it, from the committed tests/data/rename-truth.json on a fresh clone
and live against this script when the desktop source is here.

Usage:
  python -B tests/rename-python-truth.py [pdf_fast_viewer.py]          JSON to stdout
  python -B tests/rename-python-truth.py [pdf_fast_viewer.py] --write  rewrite the snapshot
(PTT_DESKTOP_SRC when no path is given.)
"""
import ast
import builtins
import json
import os
import re
import sys
import textwrap
import types
from collections import defaultdict

ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
WRITE = "--write" in sys.argv[1:]
SRC = ARGS[0] if ARGS else os.environ.get("PTT_DESKTOP_SRC", "")
if not SRC or not os.path.exists(SRC):
    raise SystemExit("Give pdf_fast_viewer.py (argument or PTT_DESKTOP_SRC).")
SNAPSHOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data",
                        "rename-truth.json")

PANEL_MEMBERS = ["_HDR_FIELD", "_HDR_WHAT", "_SOLO", "_MENU_CSS",
                 "_header_act", "_header_tip", "_rows_under",
                 "_show_header_menu", "highlight_measurement",
                 "_apply_selection",
                 # Round 7: the Rename and Set forms, their words, and the
                 # list's own state that follows a rename
                 "_n", "_amount", "_existing_spelling", "_rename_from_header",
                 "_follow_rename", "_assign_from_header",
                 # ...and what one sheet lists (the SHEET chip): the rename
                 # form's 'hidden by the list's filters' counts from it
                 "_NOT_ROWS", "_sheet_rows"]
# The panel's data and the things its menu hands work to: the canvas, the
# collapse set, the rebuild, the Group's form; what a selection on the
# drawing lights (highlight_measurement, _apply_selection): the selected
# shape, the rows one refresh listed and the widgets that show them, and the
# scroll area's ensureWidgetVisible; and what the Rename and Set forms read
# and say through: the window, the status line, the saved Report presets
# (the web cannot see them: the user's decision 3), the rows the last
# refresh listed, the three filters, the SHEET chip, the form's parent; and
# for one sheet's rows, why a shape waits on no drawing (no page waits here).
PANEL_STUBS = {"_gl_widget", "_collapsed", "refresh", "item_properties_req",
               "_sel_m", "_row_meta", "_items_vbox", "ensureWidgetVisible",
               "_class_window", "_say", "_preset_notes", "_listed_ids",
               "_floor_filter", "_group_filter", "_cost_filter", "_sheet_on",
               "window", "_waiting_why"}
GL_MEMBERS = ["CLASS_FIELDS", "_class_val", "project_values",
              # Round 7: the plan, the two writes, what follows a rename in
              # the tool, its undo, and where new pins are filed
              "_class_is_row", "classification_plan", "_plan_counts",
              "rename_classification", "_follow_classification",
              "_follow_pin_filing", "_class_tool_now", "_class_tool_moved",
              "_undo_class_tool", "unfiled_items", "assign_classification",
              "_pin_filing", "_pin_stock", "_pin_files", "_set_pin_filing",
              "_FRAMING_PIN_SPEC"]
# ...and the canvas's own: the store, the window that holds the metadata,
# the undo stack and its tags, the repaint, the item clipboard (the web has
# none: _follow_classification_clip finds nothing, _class_clip_again is
# never reached), the last category the next item is given; and the sheet
# on screen, and whether a shape is on the drawing shown there.
GL_STUBS = {"_measurements", "all_group_items", "_main_window", "_push_undo",
            "measurement_changed", "update", "tag_undo_top",
            "_follow_classification_clip", "_class_clip_again",
            "_last_category", "_current_page", "on_this_version"}
# ClassificationDialog: what its OK and its sentence do, lifted; the form
# itself (Qt widgets) is a stand-in that records what it was given.
DLG_MEMBERS = ["chosen_name", "chosen_option", "what_text", "_update_what",
               "_on_ok"]
DLG_STUBS = {"_name", "_opts", "_what", "_err", "_describe", "_old", "accept"}
MODULE_SEED = ["_fill_class_combo", "_project_values_near",
               "FLOOR_LEVEL_PRESETS", "CATEGORY_PRESETS"]
# The one import a lifted body makes, and what answers it.
DECLARED_IMPORTS = {("PyQt5.QtWidgets", "QMenu")}
# The framing engine's own functions the fixture's framed wall is made with
# (framing.py, beside pdf_fast_viewer.py), lifted the same way; and the two
# imports inside their bodies (re, and uuid for an extra with no id -- the
# fixture's all have one).
FRAMING_SEED = ["extra_lines", "material", "refresh_materials", "extras_of",
                "EXTRAS_KEY"]
FRAMING_IMPORTS = {("re", None), ("uuid", None)}


class _QTimer:
    """singleShot(0, fn): the menu's rebuild, recorded, not run."""
    shots = []

    @staticmethod
    def singleShot(ms, fn):
        _QTimer.shots.append((ms, getattr(fn, "__name__", "?")))


class _Action:
    def __init__(self, text):
        self.text = text


class _QMenu:
    """What a menu was given, in order ('-' a separator), and the entry the
    scenario picks (None: he pressed Escape)."""
    pick = None
    seen = []

    def __init__(self, parent=None):
        self.items = []
        _QMenu.seen.append(self.items)

    def setStyleSheet(self, css):
        pass

    def addAction(self, text):
        a = _Action(text)
        self.items.append(a)
        return a

    def addSeparator(self):
        self.items.append("-")

    def exec_(self, gpos):
        for a in self.items:
            if a != "-" and a.text == _QMenu.pick:
                return a
        return None


class _Row:
    """An item's row (_ClickableRow, whose set_selected is the highlight):
    what the last _apply_selection left it."""

    def __init__(self, m):
        self.m = m
        self.selected = False

    def set_selected(self, sel):
        self.selected = sel


class _Heading:
    """A heading's widget: not a _ClickableRow, so never lit."""


class _LayoutItem:
    def __init__(self, w):
        self._w = w

    def widget(self):
        return self._w


class _VBox:
    """The list's QVBoxLayout: itemAt(i) is the i-th row's widget."""

    def __init__(self, widgets):
        self.widgets = widgets

    def itemAt(self, i):
        return _LayoutItem(self.widgets[i]) if 0 <= i < len(self.widgets) else None


PROVIDED = {"re": re, "QTimer": _QTimer, "_ClickableRow": _Row}
# Names the lifted Round 7 members read that are stand-ins, filled in below
# once the lifted classes they build on exist: GLPageWidget (its item
# clipboard's class attributes), the framing module, the crash log (a
# stand-in that RAISES: a failure inside a lifted member must not be
# swallowed into a log here), and the Qt dialog, question and form.
PROVIDED_LATER = {"GLPageWidget", "_framing", "_log_exception",
                  "ClassificationDialog", "QDialog", "QMessageBox"}

DESK = open(SRC, "r", encoding="utf-8").read()
TREE = ast.parse(DESK)
LINES = DESK.splitlines(True)


def _tops(tree):
    top = {}
    for n in tree.body:
        if isinstance(n, (ast.FunctionDef, ast.ClassDef)):
            top.setdefault(n.name, n)
        elif isinstance(n, ast.Assign):
            for t in n.targets:
                if isinstance(t, ast.Name):
                    top.setdefault(t.id, n)
    return top


TOP = _tops(TREE)
FR_SRC = os.path.join(os.path.dirname(os.path.abspath(SRC)), "framing.py")
FR_TEXT = open(FR_SRC, "r", encoding="utf-8").read()
FR_TREE = ast.parse(FR_TEXT)
FR_LINES = FR_TEXT.splitlines(True)
FR_TOP = _tops(FR_TREE)


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


def _text(node, lines=None):
    for d in getattr(node, "decorator_list", []):
        if not (isinstance(d, ast.Name) and d.id in ("staticmethod", "classmethod")):
            raise SystemExit("%s has a decorator this cannot lift" % node.name)
    first = min([node.lineno] + [d.lineno for d in
                                 getattr(node, "decorator_list", [])])
    return textwrap.dedent("".join((lines or LINES)[first - 1:node.end_lineno]))


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
        elif isinstance(s, (ast.FunctionDef, ast.AsyncFunctionDef)) and s is not fn:
            out.add(s.name)          # a helper defined inside (the menu's _these)
        elif isinstance(s, (ast.Import, ast.ImportFrom)):
            for a in s.names:
                out.add((a.asname or a.name).split(".")[0])
    return out


def _free(node):
    loc = _locals(node) if isinstance(node, ast.FunctionDef) else set()
    return {s.id for s in ast.walk(node)
            if isinstance(s, ast.Name) and isinstance(s.ctx, ast.Load)
            and s.id not in loc}


def _imports(node):
    out = set()
    for s in ast.walk(node):
        if isinstance(s, ast.ImportFrom):
            for a in s.names:
                out.add((s.module, a.name))
        elif isinstance(s, ast.Import):
            for a in s.names:
                out.add((a.name, None))
    return out


def _self_attrs(fn):
    """self.<x>, and gl.<x> where `gl = self._gl_widget`."""
    out_self, out_gl = set(), set()
    for s in ast.walk(fn):
        if not isinstance(s, ast.Attribute):
            continue
        v = s.value
        if isinstance(v, ast.Name) and v.id == "self":
            out_self.add(s.attr)
        elif isinstance(v, ast.Name) and v.id == "gl":
            out_gl.add(s.attr)
    return out_self, out_gl


def closure():
    panel, gl_cls = _class("TakeoffItemsPanel"), _class("GLPageWidget")
    dlg_cls = _class("ClassificationDialog")
    problems, want = [], set(MODULE_SEED)
    for cls, members, stubs, other in (
            (panel, PANEL_MEMBERS, PANEL_STUBS, set(GL_MEMBERS) | GL_STUBS),
            (gl_cls, GL_MEMBERS, GL_STUBS, set()),
            (dlg_cls, DLG_MEMBERS, DLG_STUBS, set())):
        for name in members:
            node = _member(cls, name)
            for imp in sorted(_imports(node) - DECLARED_IMPORTS, key=str):
                problems.append("%s.%s imports %s" % (cls.name, name, imp))
            if isinstance(node, ast.FunctionDef):
                s, g = _self_attrs(node)
                for a in sorted(s - set(members) - stubs):
                    problems.append("%s.%s reads self.%s" % (cls.name, name, a))
                for a in sorted(g - other):
                    problems.append("%s.%s reads gl.%s" % (cls.name, name, a))
            want |= _free(node)
    seen, queue, lifted = set(), sorted(want), []
    while queue:
        nm = queue.pop(0)
        if nm in seen:
            continue
        seen.add(nm)
        if (nm == "self" or hasattr(builtins, nm) or nm in PROVIDED
                or nm in PROVIDED_LATER):
            continue
        node = TOP.get(nm)
        if node is None:
            problems.append("reads %r, which is neither lifted, a builtin nor "
                            "a declared stand-in" % nm)
            continue
        if isinstance(node, ast.ClassDef):
            problems.append("reaches class %s" % nm)
            continue
        for imp in sorted(_imports(node) - DECLARED_IMPORTS, key=str):
            problems.append("%s imports %s" % (nm, imp))
        lifted.append(nm)
        queue.extend(sorted(_free(node) - seen))
    return problems, lifted


def framing_closure():
    """The framing functions the fixture is built with, walked the same way
    over framing.py's own top level."""
    problems, lifted, seen, queue = [], [], set(), sorted(FRAMING_SEED)
    while queue:
        nm = queue.pop(0)
        if nm in seen:
            continue
        seen.add(nm)
        if hasattr(builtins, nm):
            continue
        node = FR_TOP.get(nm)
        if node is None:
            problems.append("framing reads %r, which is neither lifted nor a builtin" % nm)
            continue
        if isinstance(node, ast.ClassDef):
            problems.append("framing reaches class %s" % nm)
            continue
        for imp in sorted(_imports(node) - FRAMING_IMPORTS, key=str):
            problems.append("framing %s imports %s" % (nm, imp))
        lifted.append(nm)
        queue.extend(sorted(_free(node) - seen))
    return problems, lifted


PROBLEMS, MODNAMES = closure()
FR_PROBLEMS, FRNAMES = framing_closure()
if PROBLEMS or FR_PROBLEMS:
    raise SystemExit("the lifted set is not a closure:\n  "
                     + "\n  ".join(PROBLEMS + FR_PROBLEMS))

# The menu's `from PyQt5.QtWidgets import QMenu` finds the stand-in: no real
# Qt is loaded, whether or not one is installed.
_qtw = types.ModuleType("PyQt5.QtWidgets")
_qtw.QMenu = _QMenu
_pyqt = types.ModuleType("PyQt5")
_pyqt.QtWidgets = _qtw
sys.modules["PyQt5"] = _pyqt
sys.modules["PyQt5.QtWidgets"] = _qtw

NS = dict(PROVIDED)
mod_nodes = sorted({id(TOP[n]): TOP[n] for n in MODNAMES}.values(),
                   key=lambda n: n.lineno)
exec(compile("\n".join(_text(n) for n in mod_nodes), "<module.lifted>", "exec"), NS)


def _cls_src(name, cls, members):
    body = ["class %s:" % name, "    pass"]
    for m in members:
        body.append(textwrap.indent(_text(_member(cls, m)), "    "))
    return "\n".join(body)


exec(compile(_cls_src("PanelBase", _class("TakeoffItemsPanel"), PANEL_MEMBERS),
             "<TakeoffItemsPanel.lifted>", "exec"), NS)
exec(compile(_cls_src("GLBase", _class("GLPageWidget"), GL_MEMBERS),
             "<GLPageWidget.lifted>", "exec"), NS)
exec(compile(_cls_src("DlgBase", _class("ClassificationDialog"), DLG_MEMBERS),
             "<ClassificationDialog.lifted>", "exec"), NS)
FR = {}
fr_nodes = sorted({id(FR_TOP[n]): FR_TOP[n] for n in FRNAMES}.values(),
                  key=lambda n: n.lineno)
exec(compile("\n".join(_text(n, FR_LINES) for n in fr_nodes), "<framing.lifted>",
             "exec"), FR)


# ── stand-ins ────────────────────────────────────────────────────────────
class _Signal:
    def __init__(self, log, name):
        self.log, self.name = log, name

    def emit(self, *a):
        self.log.append([self.name] + [x.get("name") if isinstance(x, dict) else x
                                       for x in a])


class GL(NS["GLBase"]):
    def __init__(self, store, groups=()):
        self._measurements = store
        self._groups = list(groups)

    def all_group_items(self):
        return list(self._groups)


class Panel(NS["PanelBase"]):
    """The panel; `force` answers _header_act instead of the lifted one -- the
    desktop's own tooltip and menu for an act its heading would not have
    (the web's '' this round, every act for Round 7)."""

    def __init__(self, gl=None, force=None, rows=()):
        self._gl_widget = gl
        self._collapsed = set()
        self.log = []
        self.item_properties_req = _Signal(self.log, "item_properties")
        self._force = force
        self._rows = list(rows)
        self._target = None
        self._relist()

    def _header_act(self, meta):
        if self._force is not None:
            return self._force
        return NS["PanelBase"]._header_act(self, meta)

    def _relist(self):
        """The rows one refresh lists (TakeoffItemsPanel.refresh, declared
        here, not lifted: it builds Qt widgets): a heading for each floor,
        category and sub-category met, and under the ones not folded the
        item rows. `_rows` are the listed items IN THE LIST'S ORDER (each
        floor's, category's and sub-category's together) -- a run of a
        multi-sheet item is never one (refresh skips group_child)."""
        metas, widgets, seen = [], [], set()
        for _pg, m in self._rows:
            fl = (m.get("floor_level") or "").strip()
            cat = (m.get("category") or "").strip()
            sub = (m.get("sub_category") or "").strip()
            path = [("floor", ("fl", fl)), ("cat", ("cat", fl, cat))]
            if sub:
                path.append(("sub", ("sub", fl, cat, sub)))
            shown = True
            for typ, key in path:
                if key not in seen:
                    seen.add(key)
                    metas.append({"type": typ, "fl": fl,
                                  "cat": key[2] if len(key) > 2 else None,
                                  "sub": key[3] if len(key) > 3 else None,
                                  "m": None})
                    widgets.append(_Heading())
                if key in self._collapsed:
                    shown = False
                    break
            if shown:
                metas.append({"type": "item", "fl": fl, "cat": cat, "sub": sub, "m": m})
                widgets.append(_Row(m))
        self._row_meta = metas
        self._items_vbox = _VBox(widgets)

    def refresh(self):
        self.log.append(["refresh"])
        self._relist()
        # refresh's last line: "Keep the canvas-selected row highlighted
        # across rebuilds".
        self._apply_selection(scroll=False)

    def _apply_selection(self, scroll=False):
        self.log.append(["apply_selection", scroll])
        return NS["PanelBase"]._apply_selection(self, scroll=scroll)

    def ensureWidgetVisible(self, w, xmargin=50, ymargin=50):
        self._target = [w.m.get("name"), xmargin, ymargin]

    def lit(self):
        return [w.m.get("name") for w in self._items_vbox.widgets
                if isinstance(w, _Row) and w.selected]

    def _rename_from_header(self, meta):
        self.log.append(["rename", meta.get("type"), meta.get("fl"),
                         meta.get("cat"), meta.get("sub")])

    def _assign_from_header(self, meta, rows):
        self.log.append(["assign", meta.get("type"), [m.get("name") for m in rows]])


class Combo:
    """A QComboBox as _fill_class_combo uses it: '-' is a separator."""

    def __init__(self):
        self.items = []

    def addItem(self, text):
        self.items.append(text)

    def insertSeparator(self, index):
        self.items.insert(index, "-")

    def count(self):
        return len(self.items)


class Owner:
    """A form, found through its parent chain the way the desktop's are."""

    def __init__(self, parent=None, **kw):
        self._parent = parent
        for k, v in kw.items():
            setattr(self, k, v)

    def parent(self):
        return self._parent


class Broken:
    def project_values(self, field):
        raise RuntimeError("no job")


SOLO = NS["PanelBase"]._SOLO


def store_of(pairs):
    """A store in the order the web walks it."""
    return {int(pg): items for pg, items in pairs}


def tree_of(rows):
    """The desktop's tree (refresh): top -> category -> sub -> [(pg, m)]."""
    tree = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    for pg, m in rows:
        fl = m.get("top", (m.get("floor_level") or "").strip())
        cat = (m.get("category") or "").strip()
        sub = (m.get("sub_category") or "").strip()
        tree[fl][cat][sub].append((pg, m))
    return tree


# ── scenarios ────────────────────────────────────────────────────────────
def it(name, fl="", cat="", sub="", **kw):
    m = {"type": kw.pop("type", "area"), "name": name, "floor_level": fl,
         "category": cat, "sub_category": sub}
    m.update(kw)
    return m


# The list's rows, as one refresh built them (filters already applied). A
# Group's section and the items on no sheet have a `top` of their own, as
# the desktop's _top_of gives them; the web lists neither yet.
ROWS = [
    [0, it("Slab", "Level 1", "Concrete")],
    [0, it("Wall A", "Level 1", "Walls", "Exterior")],
    [0, it("Wall B", "Level 1", "Walls", "Exterior")],
    [0, it("Wall C", "Level 1", "Walls", "Interior")],
    [0, it("Loose", "Level 1", "")],
    [0, it("Loose 2", "Level 1", "")],
    [1, it("Patio", "", "Concrete")],
    [1, it("Joists", "Level 2", "Framing", "Floor")],
    [1, it("Roof deck", "", "Roofing")],
    [1, it("Outlets", "", "")],
    [-1000, it("Nails", "Level 1", "Hardware", type="standalone",
               top="\x00g:gi1")],
    [-1000, it("Glue", "Level 2", "", type="standalone", top=SOLO)],
]
ONE_BLANK = [[0, it("Stair", "Level 3", "Framing")], [1, it("Lone", "", "Framing")]]
GROUPS = [{"type": "group", "name": "Garage", "group_item_id": "gi1"}]


def metas(tree):
    m = lambda **kw: dict({"cat": None, "sub": None, "m": None, "bucket": None,
                           "tree": tree}, **kw)
    return [
        ("a named floor", m(type="floor", fl="Level 1")),
        ("NO FLOOR LEVEL", m(type="floor", fl="")),
        ("a floor of None", m(type="floor", fl=None)),
        ("a Group's section", m(type="floor", fl="\x00g:gi1")),
        ("NOT ON A SHEET", m(type="floor", fl=SOLO)),
        ("a floor the tree no longer has", m(type="floor", fl="Level 9")),
        ("a category", m(type="cat", fl="Level 1", cat="Walls")),
        ("Uncategorized", m(type="cat", fl="Level 1", cat="")),
        ("Uncategorized under NO FLOOR LEVEL", m(type="cat", fl="", cat="")),
        ("a category of None", m(type="cat", fl="Level 1", cat=None)),
        ("a category in a Group's section", m(type="cat", fl="\x00g:gi1", cat="Hardware")),
        ("a sub-category", m(type="sub", fl="Level 1", cat="Walls", sub="Exterior")),
        ("a blank sub-category", m(type="sub", fl="Level 1", cat="Walls", sub="")),
        ("a sub-category under NO FLOOR LEVEL", m(type="sub", fl="", cat="", sub="Gone")),
    ]


def plain(meta):
    return {k: meta[k] for k in ("type", "fl", "cat", "sub")}


def menu_of(panel, meta, pick=None):
    _QMenu.pick = pick
    _QTimer.shots = []
    n = len(_QMenu.seen)
    panel._show_header_menu(None, meta)
    items = _QMenu.seen[n] if len(_QMenu.seen) > n else []
    return [x if x == "-" else x.text for x in items]


def keys(collapsed):
    return sorted([list(k) for k in collapsed], key=json.dumps)


def headers():
    out = []
    for rows in (ROWS, ONE_BLANK):
        tree = tree_of([(pg, m) for pg, m in rows])
        for label, meta in metas(tree):
            p = Panel(GL({}, GROUPS))
            rec = {"label": label, "rows": "one blank" if rows is ONE_BLANK else "list",
                   "meta": plain(meta), "act": p._header_act(meta),
                   "tip": p._header_tip(meta),
                   "under": [m.get("name") for m in p._rows_under(meta)],
                   "menu": menu_of(p, meta), "forced": {}}
            for act in ("", "rename", "assign", "group"):
                f = Panel(GL({}, GROUPS), force=act)
                rec["forced"][act or "none"] = {"tip": f._header_tip(meta),
                                                "menu": menu_of(f, meta)}
            out.append(rec)
    return out


def choices():
    """What each entry does: Collapse all, Expand all, the act's own."""
    tree = tree_of(ROWS)
    out = []
    before = [("cat", "Level 1", "Walls"), ("sub", "Level 1", "Walls", "Interior"),
              ("fl", "Level 2")]
    for label, meta in metas(tree):
        for pick in ("Collapse all", "Expand all", "main"):
            p = Panel(GL({}, GROUPS))
            p._collapsed = set(before)
            items = menu_of(p, meta)
            want = pick if pick != "main" else next(
                (x for x in items if x not in ("-", "Collapse all", "Expand all")), None)
            if want is None:
                continue
            menu_of(p, meta, want)
            out.append({"label": label, "meta": plain(meta), "pick": pick, "entry": want,
                        "before": keys(before), "after": keys(p._collapsed),
                        "shots": [list(s) for s in _QTimer.shots], "log": p.log})
    return out


def reveal(flabel, before, store, pick):
    """One selection on the drawing: `store` is every shape, [page, m] in the
    order the web walks them; `pick` the index of the one selected (None:
    nothing). The list lists the store's items -- not a run (group_child),
    which rolls up into its item's row -- folded as `before` says."""
    rows = [(pg, m) for pg, m in store if not m.get("group_child")]
    p = Panel(GL({}, GROUPS), rows=rows)
    p._collapsed = set(before)
    p._relist()
    m = store[pick][1] if pick is not None else None
    p.highlight_measurement(m)
    return {"folded": flabel, "store": store, "pick": pick, "before": keys(before),
            "after": keys(p._collapsed), "log": p.log,
            "selected": (p._sel_m or {}).get("name"),
            "lit": p.lit(), "target": p._target}


def group_store():
    """A multi-sheet item: its main shape on the first sheet and a run on the
    second, as _append_shape writes one (the master's group_id, floor,
    category and sub-category, group_child). Around it: a plain item beside
    it, a second multi-sheet item whose run is on the FIRST sheet, a run
    whose item has been moved to another floor since, a run whose item is
    gone, and two main shapes sharing one group_id (a file the open-time
    heal has not seen). Listed in the web's order (sort_order)."""
    return [
        [0, it("Multi wall", "Level 1", "Wood Framing", "Exterior", group_id="g1", sort_order=100)],
        [0, it("Other wall", "Level 1", "Wood Framing", "Exterior", sort_order=200)],
        [0, it("Slab big (run)", "Level 2", "Concrete", "", group_id="g2", group_child=True)],
        [0, it("Moved wall (run)", "Level 1", "Wood Framing", "Exterior", group_id="g4",
               group_child=True)],
        [1, it("Multi wall (run)", "Level 1", "Wood Framing", "Exterior", group_id="g1",
               group_child=True)],
        [1, it("Slab big", "Level 2", "Concrete", "", group_id="g2", sort_order=300)],
        [1, it("Moved wall", "Level 2", "Framing", "", group_id="g4", sort_order=400)],
        [1, it("Lone run", "Level 1", "Wood Framing", "", group_id="g9", group_child=True)],
        [1, it("Twin A", "Level 3", "Framing", "", group_id="g3", sort_order=500)],
        [1, it("Twin B", "Level 3", "Framing", "", group_id="g3", sort_order=600)],
    ]


def reveals():
    """highlight_measurement: an item selected on the drawing, against what
    the list has folded -- which keys it opens, whether the list is rebuilt,
    which row is lit and which one is scrolled to (_apply_selection)."""
    every = [("fl", "Level 1"), ("cat", "Level 1", "Walls"),
             ("sub", "Level 1", "Walls", "Exterior"), ("cat", "Level 1", "Concrete"),
             ("fl", ""), ("cat", "", ""), ("fl", "Level 2"),
             ("cat", "Level 2", "Framing"), ("sub", "Level 2", "Framing", "Floor")]
    folds = [("everything folded", every),
             ("only its category folded", [("cat", "Level 1", "Walls")]),
             ("only its sub-category folded", [("sub", "Level 1", "Walls", "Exterior")]),
             ("another floor folded", [("fl", "Level 2")]),
             ("nothing folded", [])]
    picks = [it("Wall A", "Level 1", "Walls", "Exterior"),
             it("Slab", " Level 1 ", "Concrete "),
             it("Outlets", "", ""),
             it("Joists", "Level 2", "Framing", "Floor"),
             it("Loose", "Level 1", "", "  "),
             it("Nowhere", "Level 9", "Other", "Deep"),
             None]
    out = []
    for flabel, before in folds:
        for m in picks:
            out.append(reveal(flabel, before, [[0, m]] if m else [], 0 if m else None))
    # A shape of a multi-sheet item selected on its sheet: its row is the
    # item's (they share a group_id), whichever sheet the shape is on.
    gfolds = [("everything folded (Collapse all)",
               [("fl", "Level 1"), ("fl", "Level 2"), ("fl", "Level 3")]),
              ("its sub-category folded", [("sub", "Level 1", "Wood Framing", "Exterior")]),
              ("the second sheet's item's floor folded", [("fl", "Level 2")]),
              ("nothing folded", [])]
    gpicks = ["Multi wall (run)", "Multi wall", "Other wall", "Slab big (run)",
              "Moved wall (run)", "Lone run", "Twin A"]
    for flabel, before in gfolds:
        for name in gpicks:
            store = group_store()
            pick = next(i for i, (_pg, m) in enumerate(store) if m["name"] == name)
            out.append(reveal(flabel, before, store, pick))
    return out


STORES = [
    ("a job with its own names", [
        [0, [it("Slab", "Level 1", "Concrete", associated_items=[
                {"name": "Rebar", "floor_level": "Mezz", "category": "Concrete"},
                {"name": "Chairs", "floor_level": "", "category": ""},
                None, "junk",
                {"name": "Form oil", "floor_level": " Level 2 ", "category": "", "sub_category": "Forms"}]),
             it("Wall", "Level 10", "Wood Framing", "Exterior"),
             {"type": "distance", "floor_level": "Level 9", "category": "Rulers"},
             None, "junk",
             it("Deck", " Level 2 ", " wood  framing ", "Decking")]],
        [1, [it("Outlets", "Level 2", "Electrical", "Devices", type="count"),
             it("Copy", "level 2", "ELECTRICAL", "devices"),
             it("Stairs", "Level  3", "Framing", "Stairs"),
             it("Ramp", "B2", "", ""),
             it("Ramp 2", "Level 02", "Concrete", "", associated_items=[
                 {"name": "Bolts", "category": "Hardware", "sub_category": "Anchors"},
                 {"name": "Bolts 2", "sub_category": "Inherited"}])]],
        [-1000, [it("Nails", "Ground", "Hardware", "Fasteners", type="standalone")]],
    ]),
    ("a job renamed off the stock names", [
        [0, [it("Slab", "First Floor", "Carpentry"), it("Wall", "Second Floor", "Carpentry")]],
        [2, [it("Beam", "Roof", "Structural Steel")]],
    ]),
    ("an empty job", []),
    ("names that are all blank", [
        [0, [it("A", "", ""), it("B", "   ", " "), it("C", None, None), {"type": "area", "name": "D"}]],
    ]),
    ("a job that has every stock floor, in other capitals", [
        [0, [it(f, f.upper(), c.lower()) for f, c in zip(
            ["Level 1", "Level 2", "Level 3", "Level 4", "Roof", "Basement",
             "Foundation", "Mezzanine", "Penthouse"],
            ["Framing", "Concrete", "Masonry", "Structural Steel", "Wood Framing",
             "MEP", "Electrical", "Plumbing", "HVAC"])]],
    ]),
]


def owners(gl):
    return [("the form's window has the canvas", Owner(Owner(None, gl_widget=gl))),
            ("the form is two deep, the canvas private", Owner(Owner(Owner(None, _gl_widget=gl)))),
            ("no job anywhere", Owner(Owner(None))),
            ("the job cannot answer", Owner(None, gl_widget=Broken()))]


def values():
    out = []
    for label, pairs in STORES:
        gl = GL(store_of(pairs))
        rec = {"label": label, "store": pairs, "values": {}, "combos": []}
        for field in ("floor_level", "category", "sub_category", "nonsense"):
            rec["values"][field] = gl.project_values(field)
        rec["subsOf"] = {c: gl.project_values("sub_category", category=c)
                         for c in ("Concrete", "Hardware", "", "Electrical", " Framing ")}
        for olabel, owner in owners(gl):
            for field in ("floor_level", "category"):
                c = Combo()
                NS["_fill_class_combo"](c, field, owner)
                rec["combos"].append({"owner": olabel, "field": field, "items": c.items})
        out.append(rec)
    return out


NAMES = ["Level 10", "Level 2", "level 1", "Roof", "B2", "Level 02", "Level 2A",
         "Level  2", "", "2", "10", "a1b2", "A1B10", "Straße", "STRASSE",
         " Level 2 ", "Level\x1f2", "Level 007", "Level 7",
         "Level 99999999999999999999", "Level 99999999999999999998"]


# ══ Round 7: rename a heading, file the items under a blank one ══════════
#
# The desktop's own classification_plan, rename_classification,
# assign_classification, _follow_classification, _undo_class_tool, the pin
# filing and the panel's _rename_from_header / _follow_rename /
# _assign_from_header, run on the fixture of the desktop's own
# tests/test_classification_rename.py (build(), L104-187: its names are
# generic), through stand-ins for what is Qt: the form (its OK and its
# sentence are the desktop's, lifted), the question, the undo stack.
import copy  # noqa: E402

SA = NS["STANDALONE_PAGE"]


class _GLClassAttrs:
    """GLPageWidget's class attributes a rename reads: the item clipboard.
    The web has none -- it is empty and never copied to."""
    _item_clip = []
    _item_clip_pid = None
    _item_clip_serial = 0


def _raise_logged(where=""):
    raise                       # the exception being handled, not swallowed


class _QDialog:
    Accepted = 1
    Rejected = 0


class _QMessageBox:
    """QMessageBox.question: what was asked, and the scenario's answer."""
    Yes = 0x4000
    No = 0x10000
    asked = []
    answer = [0x10000]

    @staticmethod
    def question(parent, title, text, *a, **k):
        _QMessageBox.asked.append([title, text])
        return _QMessageBox.answer[0]


class _Text:
    def __init__(self, t=""):
        self._t, self._hidden = t, False

    def setText(self, t):
        self._t = t

    def text(self):
        return self._t

    def show(self):
        self._hidden = False

    def hide(self):
        self._hidden = True

    def isHidden(self):
        return self._hidden


class _NameBox:
    def __init__(self):
        self.items, self._cur = [], ""

    def currentText(self):
        return self._cur

    def setCurrentText(self, t):
        self._cur = t


class _Radio:
    def __init__(self, on):
        self._on = on

    def isChecked(self):
        return self._on

    def setChecked(self, on):
        self._on = on


ANY = object()
DLG = {"name": None, "opt": ANY, "seen": []}


class _ClassDlg(NS["DlgBase"]):
    """ClassificationDialog: its __init__ builds Qt widgets, so this one
    keeps what it was given in stand-ins -- in the same order, with the
    same first radio picked and the same first sentence -- and its exec_
    answers the way the desktop's test does (_dlg_exec): the option, the
    name, the REAL OK (the lifted _on_ok and its refusals)."""

    def __init__(self, title, label, current, choices, describe,
                 options=None, notes=(), old=None, parent=None):
        self._describe, self._old = describe, old
        own, rest = choices
        self._name = _NameBox()
        self._name.items = list(own) + (["-"] if own and rest else []) + list(rest)
        self._name.setCurrentText(current or "")
        self._opts = [(_Radio(i == 0), v) for i, (_t, v) in enumerate(options or [])]
        self._what, self._err = _Text(), _Text()
        self._err.hide()
        self._result = _QDialog.Rejected
        self.info = {"title": title, "label": label, "current": current,
                     "own": list(own), "rest": list(rest),
                     "opts": [t for t, _v in options or []],
                     "notes": list(notes or ())}
        self._update_what()

    def accept(self):
        self._result = _QDialog.Accepted

    def exec_(self):
        info = self.info
        info["what"] = self.what_text()
        DLG["seen"].append(info)
        if DLG["name"] is None:
            return _QDialog.Rejected
        if DLG["opt"] is not ANY:
            for rb, v in self._opts:
                rb.setChecked(v == DLG["opt"])
            self._update_what()             # the radio's toggled signal
            info["what_opt"] = self.what_text()
        self._name.setCurrentText(DLG["name"])
        self._on_ok()
        info["err"] = self._err.text() if not self._err.isHidden() else ""
        return self._result


NS.update({"GLPageWidget": _GLClassAttrs,
           "_framing": types.SimpleNamespace(**{n: FR[n] for n in FRNAMES}),
           "_log_exception": _raise_logged, "ClassificationDialog": _ClassDlg,
           "QDialog": _QDialog, "QMessageBox": _QMessageBox})


class _Emit:
    def __init__(self):
        self.n = 0

    def emit(self, *a):
        self.n += 1


class FlowGL(NS["GLBase"]):
    """The canvas, for the Round 7 flows: the store, the window's metadata,
    an undo stack of snapshots with their tags. undo()/redo() are the
    desktop's _restore_state + _fire_undo_tags_inner reduced to what a
    rename's level holds (declared here, not lifted: they are the canvas's
    whole history machinery): the store put back as a copy of its picture,
    then each class_tool tag handed to the lifted _undo_class_tool, and
    what it returns hung on the level that reverses this one. The web
    keeps no last category (its next item is filed under none), so this
    canvas's is '' -- the web's state."""

    def __init__(self, store, meta):
        self._measurements = store
        self._win = types.SimpleNamespace(metadata=meta)
        self.measurement_changed = _Emit()
        self.levels, self.redos = [], []
        self._last_floor = self._last_category = self._last_sub = ""
        self._count_spec = None
        self._current_page = 0

    def _main_window(self):
        return self._win

    def on_this_version(self, m, page=None):
        """The sheet's own drawing on screen, no revision raised: a shape
        is on it when it was traced on no revision (the flows' sheets have
        none -- r7_flow checks)."""
        return not (m or {}).get("rev_id")

    def _push_undo(self):
        self.levels.append([copy.deepcopy(self._measurements), []])
        self.redos = []

    def tag_undo_top(self, tag):
        if not self.levels:
            return False
        self.levels[-1][1].append(tag)
        return True

    def update(self):
        pass

    def all_group_items(self):
        return [m for lst in self._measurements.values() for m in lst
                if isinstance(m, dict) and m.get("type") == "group"]

    def _follow_classification_clip(self, field, old, new, scope=None):
        return None

    def _class_clip_again(self, ren, back):
        return None

    def _step(self, frm, to, direction):
        snap, tags = frm.pop()
        now = copy.deepcopy(self._measurements)
        self._measurements = copy.deepcopy(snap)
        again = []
        for t in tags:
            if isinstance(t, dict) and t.get("kind") == "class_tool":
                b = self._undo_class_tool(t, direction)
                if b:
                    again.append(b)
        to.append([now, again])

    def undo(self):
        self._step(self.levels, self.redos, "undo")

    def redo(self):
        self._step(self.redos, self.levels, "redo")


def listed_ids(store, cost, floor, group):
    """What the desktop's refresh lists (TakeoffItemsPanel.refresh, Qt, so
    declared: its loop up to _listed_ids, the chip off): every row the three
    filters let through, a Group container among them."""
    out = set()
    for _pg, lst in store.items():
        for m in lst:
            if m.get("type") in ("distance", "textnote", "page_ref", "pitch",
                                 "ref_distance"):
                continue
            if m.get("group_child"):
                continue
            fl = (m.get("floor_level") or "").strip()
            cat = (m.get("category") or "").strip()
            if cost != "all" and m.get("cost_type", "material") != cost:
                continue
            if floor is not None and fl != floor:
                continue
            if group is not None and cat != group:
                continue
            out.add(id(m))
    return out


def web_rows(store, ids):
    """The rows the WEB's list shows of what the desktop's lists: not a
    Group container (the web lists no Group section), every item under its
    own floor -- in the store's order, as the web's tree holds them."""
    return [(pg, m) for pg, lst in store.items() for m in lst
            if id(m) in ids and m.get("type") != "group"]


def filter_values(store):
    """The values the desktop's refresh fills its floor and group filters
    with (floors_all / cats_all: every row, the filters not applied)."""
    floors, cats = set(), set()
    for _pg, lst in store.items():
        for m in lst:
            if m.get("type") in ("distance", "textnote", "page_ref", "pitch",
                                 "ref_distance") or m.get("group_child"):
                continue
            floors.add((m.get("floor_level") or "").strip())
            cats.add((m.get("category") or "").strip())
    return floors, cats


class FlowPanel(NS["PanelBase"]):
    """The panel, for the Round 7 flows: its three filters, its folded
    headings, the rows its last refresh listed; the window, the status
    line, the SHEET chip (off, or on with the sheet `sheet` on screen: the
    rows listed are then the lifted _sheet_rows' rows and the items on no
    sheet), no Report presets (decision 3)."""

    def __init__(self, gl, cost="all", floor=None, group=None, collapsed=(),
                 sheet=None):
        self._gl_widget = gl
        self._cost_filter, self._floor_filter, self._group_filter = cost, floor, group
        self._collapsed = {tuple(k) for k in collapsed}
        self.said = []
        self._sheet = sheet
        if sheet is not None:
            gl._current_page = sheet
        self.relist()

    def relist(self):
        """The rows the desktop's refresh lists (_listed_ids), by the three
        filters as they stand; with the chip on, the lifted _sheet_rows'."""
        gl = self._gl_widget
        self._listed_ids = listed_ids(gl._measurements, self._cost_filter,
                                      self._floor_filter, self._group_filter)
        self.sheet_rows = None
        if self._sheet is not None:
            all_m = [(pg, m) for pg, lst in gl._measurements.items() for m in lst
                     if id(m) in self._listed_ids]
            got = self._sheet_rows(all_m)
            self._listed_ids = {id(m) for _pg, m in got["rows"] + got["solo"]}
            self.sheet_rows = got

    def _class_window(self):
        return self._gl_widget._win

    def _say(self, text):
        self.said.append(text)

    def _preset_notes(self, field, old):
        return []

    def _sheet_on(self):
        return self._sheet is not None

    def _waiting_why(self, page_idx, m):
        return ""

    def window(self):
        return None

    def refreshed(self):
        """What the desktop's refresh does after a step: it lists the rows
        by the filters as they stand (relist), then refills the filters
        (_repopulate_tree_filters, declared: Qt combos), and a filter whose
        value no row carries any more falls back to All (None), without a
        word."""
        self.relist()
        floors, cats = filter_values(self._gl_widget._measurements)
        if self._floor_filter is not None and self._floor_filter not in floors:
            self._floor_filter = None
        if self._group_filter is not None and self._group_filter not in cats:
            self._group_filter = None


def r7_item(t, name, fl, cat, sub="", order=0, **kw):
    """test_classification_rename.py item()."""
    m = {"type": t, "name": name, "label": name, "floor_level": fl,
         "category": cat, "sub_category": sub, "visible": True,
         "color": [0.2, 0.5, 0.9, 0.5], "cost_type": "material",
         "sort_order": order, "points": [[10.0, 10.0], [90.0, 10.0],
                                         [90.0, 60.0]], "value": 10.0}
    m.update(kw)
    return m


def r7_build():
    """test_classification_rename.py build() (L104-187), word for word, its
    lines made by the framing engine's own extra_lines and material."""
    F = NS["_framing"]
    item = r7_item
    extras = [
        {"id": "e1", "name": "Strap", "qty": 2, "floor_level": "Level 1",
         "category": "Framing"},
        {"id": "e2", "name": "Shims", "qty": 1, "floor_level": "",
         "category": ""},
        {"id": "e3", "name": "Crane", "qty": 1, "floor_level": "Level 1",
         "category": "Framing"},
    ]
    lines = F.extra_lines(extras) + [F.material("2x6 stud", 10, "each")]
    for ln in lines:
        if ln.get("framing_extra") == "e3":
            ln["category"] = "Hardware"     # he re-filed this one himself
    framed = item("polyline", "Wall B", "Level 2", "Framing", "Exterior", 900,
                  value=12.0, associated_items=lines,
                  framing={"assembly": "wall", "params": {"_extras": extras}})
    return {
        0: [
            item("area", "Slab", "Level 1", "Concrete", "", 100, value=100.0,
                 associated_items=[
                     {"name": "Rebar", "qty": 10.0, "unit": "each",
                      "floor_level": "Level 1", "category": "Concrete"},
                     {"name": "Chairs", "qty": 4.0, "unit": "each",
                      "floor_level": "", "category": ""},
                     {"name": "Form oil", "qty": 1.0, "unit": "each",
                      "floor_level": "Level 2", "category": "Concrete"}]),
            item("polyline", "Wall A", "Level 1", "Walls", "Exterior", 200,
                 value=50.0, own_value=20.0, group_id="g-wall"),
            item("area", "Wall labor", "Level 1", "Walls", "", 250,
                 cost_type="labor", value=7.0),
            item("area", "Patio", "", "", "", 300, value=30.0,
                 associated_items=[{"name": "Sand", "qty": 1.0,
                                    "unit": "each", "floor_level": "",
                                    "category": ""}]),
            item("area", "Roof", "", "Roofing", "", 400, value=33.0,
                 own_value=11.0, group_id="g-roof"),
            {"type": "distance", "points": [[0.0, 0.0], [50.0, 0.0]],
             "value": 5.0, "floor_level": "Level 1", "visible": True},
            {"type": "textnote", "points": [[5.0, 5.0]], "text": "check",
             "floor_level": "", "category": "", "visible": True},
        ],
        1: [
            item("polyline", "Wall A", "Level 1", "Walls", "Exterior", 200,
                 value=30.0, group_id="g-wall", group_child=True),
            item("count", "Windows", "Level 1", "Doors", "Exterior", 500,
                 value=3, points=[[1.0, 1.0], [2.0, 2.0], [3.0, 3.0]]),
            item("count", "Outlets", "", "Electrical", "", 600,
                 cost_type="labor", value=2, points=[[4.0, 4.0], [5.0, 5.0]]),
            item("area", "Deck", "Level 1", "Walls", "", 700, value=9.0,
                 rev_id="r-gone", rev_page=0),
        ],
        2: [
            item("area", "Garage slab", "Level 1", "Walls", "Interior", 800,
                 value=40.0, in_group="gi-garage"),
            framed,
            item("area", "Beam", "level 2", "Framing", "", 950, value=6.0),
            item("area", "Roof", "", "Roofing", "", 400, value=22.0,
                 group_id="g-roof", group_child=True),
        ],
        SA: [
            item("standalone", "Nails", "Level 1", "Hardware", "", 1000,
                 qty=5.0, unit="box", value=5.0, points=[]),
            item("group", "Garage", "Level 1", "Walls", "", 50,
                 group_item_id="gi-garage", value=0, points=[]),
            item("standalone", "Misc", "Level 1", "", "", 1100, qty=1.0,
                 unit="each", value=1.0, points=[]),
        ],
    }


def r7_pin(kind, seq, fl, cat, sub, x):
    """A pin as the desktop drops one (_add_window_pin / _add_door_pin /
    _add_framing_pin), with no form."""
    pre = NS["PIN_KINDS"][kind]
    lab = {"window": "Window", "door": "Door", "partition": "Partition",
           "header": "Header"}[kind]
    return {"type": kind, "points": [[float(x), 120.0]], pre + "seq": seq,
            pre + "number": "", pre + "width": "", pre + "height": "",
            "label": "%s %d" % (lab, seq), "name": "%s %d" % (lab, seq),
            "notes": "", "color": [0.2, 0.55, 1.0, 1.0], "value": 1,
            "visible": True, "floor_level": fl, "category": cat,
            "sub_category": sub, "cost_type": "material", "unit_cost": 0.0,
            "sort_order": 2000 + 10 * seq + len(kind)}


def r7_with(extra, pg=0):
    s = r7_build()
    s[pg] = s[pg] + extra
    return s


def r7_pins():
    return r7_with([r7_pin("window", 1, "Level 1", "Doors & Windows", "", 100),
                    r7_pin("window", 2, "Level 1", "Doors & Windows", "", 140),
                    r7_pin("partition", 1, "Level 1", "Wood Framing", "Partitions", 220)])


def pairs(store):
    return [[pg, lst] for pg, lst in store.items()]


def index(store):
    """Where every dict a plan can name sits, as a path from the store."""
    ix = {}
    for pg, lst in store.items():
        for i, m in enumerate(lst or []):
            if not isinstance(m, dict):
                continue
            ix.setdefault(id(m), [pg, i])
            for j, ai in enumerate(m.get("associated_items") or []):
                if isinstance(ai, dict):
                    ix.setdefault(id(ai), [pg, i, "associated_items", j])
                    fs = ai.get("framing_spec")
                    if isinstance(fs, dict):
                        ix.setdefault(id(fs), [pg, i, "associated_items", j,
                                               "framing_spec"])
            fr = m.get("framing")
            params = fr.get("params") if isinstance(fr, dict) else None
            ex = params.get("_extras") if isinstance(params, dict) else None
            for j, sp in enumerate(ex if isinstance(ex, list) else []):
                if isinstance(sp, dict):
                    ix.setdefault(id(sp), [pg, i, "framing", "params", "_extras", j])
    return ix


def plan_paths(store, plan):
    ix = index(store)
    return [[ix.get(id(d)), k, kind] for d, k, kind in plan]


def web_key(k):
    return "\x00".join(k)


def move_json(gl, panel, mv):
    where, holder, name, was, now = mv
    who = (None if holder is None else "tool" if holder is gl
           else "panel" if holder is panel else "spec" if where == "spec" else None)
    return [where, who, name, list(was) if isinstance(was, tuple) else was,
            list(now) if isinstance(now, tuple) else now]


R7_PLANS = [
    ("floor_level", ["Level 1", "Level 2", "level 2", " Level 1 ", "Nowhere", ""],
     [None, {"category": "Walls"}, {"group": "gi-garage"}]),
    ("category", ["Walls", "Framing", "Hardware", "Concrete", "Doors", "Roofing",
                  "Electrical", ""],
     [None, {"category": "Framing"}, {"group": "gi-garage"}]),
    ("sub_category", ["Exterior", "Interior", "Nope"],
     [None, {"category": "Walls"}, {"category": "Doors"}, {"category": "Framing"},
      {"category": " Walls "}, {"category": ""}, {"group": "gi-garage"}]),
    ("nonsense", ["Level 1"], [None]),
]


def r7_plans():
    out = []
    for field, olds, scopes in R7_PLANS:
        for old in olds:
            for scope in scopes:
                store = r7_build()
                gl = FlowGL(store, {})
                plan = gl.classification_plan(field, old, scope)
                out.append({"field": field, "old": old, "scope": scope,
                            "plan": plan_paths(store, plan),
                            "counts": gl._plan_counts(plan)})
    # A list two items share is renamed once; a line with no dict, junk.
    store = r7_build()
    shared = {"name": "Shared", "floor_level": "Level 1", "category": "Walls"}
    store[0][0]["associated_items"].append(shared)
    store[0][1]["associated_items"] = [shared, None, "junk", 7]
    store[1].append("junk")
    store[1].append(None)
    store[2][1]["framing"]["params"]["_extras"].append(None)
    store[2][1]["framing"]["params"]["_extras"].append({"id": "e9", "name": "Bare"})
    gl = FlowGL(store, {})
    for field, old in (("floor_level", "Level 1"), ("category", "Framing"),
                       ("category", "Walls")):
        plan = gl.classification_plan(field, old, None)
        out.append({"field": field, "old": old, "scope": None, "odd": True,
                    "plan": plan_paths(store, plan), "counts": gl._plan_counts(plan)})
    return out


def r7_assign():
    out = []
    for field in ("floor_level", "category", "sub_category"):
        store = r7_build()
        gl = FlowGL(store, {})
        ix = index(store)
        out.append({"field": field, "unfiled": [ix[id(m)] for m in gl.unfiled_items(field)]})
    picks = [
        ("the blank rows", lambda s: [s[0][3], s[0][4], s[1][2]]),
        ("a run of one (its master is what is filed)", lambda s: [s[2][3]]),
        ("a row twice, a filed one, a note", lambda s: [s[0][3], s[0][3], s[0][0], s[0][6]]),
        ("a row from before an undo", lambda s: [copy.deepcopy(s[0][3]), s[0][4]]),
        ("the Group container, filed", lambda s: [s[SA][1]]),
        ("nothing", lambda s: []),
    ]
    for label, pick in picks:
        for field in ("floor_level", "category"):
            for value in ("Level 3", "  level   3 ", "All Floors", ""):
                store = r7_build()
                gl = FlowGL(store, {})
                items = pick(store)
                ix = index(store)
                got = gl.assign_classification(field, value, items)
                out.append({"label": label, "field": field, "value": value,
                            "items": [ix.get(id(m)) for m in items],
                            "counts": got, "changes": leaf_diff(store_json(r7_build()), store_json(gl._measurements)),
                            "levels": len(gl.levels)})
    return out


PIN_METAS = [
    ("no key", {}),
    ("windows and doors renamed", {"pin_filing": {"window": {"category": "Openings"},
                                                  "door": {"category": "Openings"}}}),
    ("framing pins renamed", {"pin_filing": {
        "partition": {"category": "Framing Labor", "sub_category": "Interior Walls"},
        "header": {"category": "Framing Labor", "sub_category": ""}}}),
    ("junk records", {"pin_filing": {"window": {"category": "  "}, "door": "Openings",
                                     "skylight": {"category": "Glass"},
                                     "header": {"category": " Beams ", "sub_category": None}}}),
    ("not a dict", {"pin_filing": ["window"]}),
]


def r7_pin_cases():
    out = []
    for label, meta in PIN_METAS:
        gl = FlowGL({}, copy.deepcopy(meta))
        rec = {"label": label, "meta": meta,
               "stock": {k: gl._pin_stock(k) for k in ("window", "door", "partition",
                                                       "header", "skylight")},
               "files": gl._pin_files(),
               "filing": {k: gl._pin_filing(k) for k in ("window", "door", "partition",
                                                         "header")},
               "sets": [], "follows": []}
        for kind, filing in (("window", ("Openings", None)), ("door", ("Doors & Windows", None)),
                             ("partition", ("Wood Framing", "Partitions")),
                             ("header", ("Framing Labor", "Headers")),
                             ("skylight", ("Glass", None))):
            g2 = FlowGL({}, copy.deepcopy(meta))
            ok = g2._set_pin_filing(kind, filing)
            rec["sets"].append({"kind": kind, "filing": list(filing), "ok": ok,
                                "meta": g2._win.metadata})
        for field, old, new, scope in (
                ("category", "Doors & Windows", "Openings", None),
                ("category", "Openings", "Doors & Windows", None),
                ("category", "Wood Framing", "Framing Labor", None),
                ("category", "Framing Labor", "Wood Framing", None),
                ("category", "Doors & Windows", "Openings", {"group": "gi-garage"}),
                ("sub_category", "Partitions", "Interior Walls", {"category": "Wood Framing"}),
                ("sub_category", "Partitions", "Interior Walls", {"category": "Walls"}),
                ("sub_category", "Interior Walls", "Partitions", {"category": "Framing Labor"}),
                ("sub_category", "Headers", "Beams", None),
                ("floor_level", "Level 1", "Level 2", None)):
            g3 = FlowGL({}, copy.deepcopy(meta))
            moves = g3._follow_pin_filing(field, old, new, scope)
            rec["follows"].append({"field": field, "old": old, "new": new, "scope": scope,
                                   "moves": [move_json(g3, None, mv) for mv in moves],
                                   "meta": g3._win.metadata})
        out.append(rec)
    # No job to keep it in: nothing recorded.
    g4 = FlowGL({}, {})
    g4._win = None
    out.append({"label": "no window", "set": g4._set_pin_filing("window", ("X", None)),
                "filing": g4._pin_filing("window")})
    return out


TOOL_STATES = [
    ("nothing", {}),
    ("a floor and a sub", {"floor": "Level 1", "sub": "Exterior"}),
    ("padded", {"floor": " Level 1 ", "sub": " Exterior "}),
    ("an armed count", {"floor": "Level 2", "sub": "",
                        "spec": {"name": "Outlets", "floor_level": "Level 1",
                                 "category": "Electrical", "sub_category": "Devices"}}),
    ("an armed count, blank", {"spec": {"name": "Posts", "floor_level": "",
                                        "category": "", "sub_category": "Exterior"}}),
]
TOOL_RENAMES = [
    ("floor_level", "Level 1", "1st Floor", None),
    ("floor_level", "Level 1", "1st Floor", {"group": "gi-garage"}),
    ("category", "Electrical", "Power", None),
    ("sub_category", "Exterior", "Outside", {"category": "Walls"}),
    ("sub_category", "Exterior", "Outside", {"category": ""}),
    ("sub_category", "Devices", "Boxes", {"category": "Electrical"}),
    ("sub_category", "Exterior", "Outside", None),
]


def r7_tool():
    out = []
    for label, st in TOOL_STATES:
        for field, old, new, scope in TOOL_RENAMES:
            gl = FlowGL({}, {})
            gl._last_floor = st.get("floor", "")
            gl._last_sub = st.get("sub", "")
            gl._count_spec = copy.deepcopy(st.get("spec"))
            was = gl._class_tool_now()
            gl._follow_classification(field, old, new, scope)
            moves = gl._class_tool_moved(was)
            rec = {"state": label, "start": st, "field": field, "old": old, "new": new,
                   "scope": scope, "moves": [move_json(gl, None, mv) for mv in moves],
                   "after": copy.deepcopy([gl._last_floor, gl._last_sub, gl._count_spec])}
            tag = {"kind": "class_tool", "moves": moves}
            back = gl._undo_class_tool(tag, "undo")
            rec["undone"] = copy.deepcopy([gl._last_floor, gl._last_sub, gl._count_spec]) + [
                             [move_json(gl, None, mv) for mv in (back or {}).get("moves", [])]]
            fwd = gl._undo_class_tool(back, "redo") if back else None
            rec["redone"] = copy.deepcopy([gl._last_floor, gl._last_sub, gl._count_spec]) + [
                             [move_json(gl, None, mv) for mv in (fwd or {}).get("moves", [])]]
            out.append(rec)
    return out


FOLLOW_STATES = [
    ("filters on Level 1 and Walls, folds", {
        "floor": "Level 1", "group": "Walls",
        "collapsed": [("fl", "Level 1"), ("cat", "Level 1", "Walls"),
                      ("sub", "Level 1", "Walls", "Exterior"), ("sub", "Level 1", "Doors", "Exterior"),
                      ("cat", "Level 2", "Walls"), ("fl", "Level 2"), ("cat", "", "Walls"),
                      ("sub", "", "", "Exterior"), ("fl", SOLO), ("cat", SOLO, "Walls"),
                      ("sub", SOLO, "Walls", "Exterior")]}),
    ("no filters, a merge of two folds", {
        "floor": None, "group": None,
        "collapsed": [("fl", "level 2"), ("fl", "Level 2"), ("cat", "level 2", "Framing"),
                      ("cat", "Level 2", "Framing")]}),
    ("the blank filters", {"floor": "", "group": "", "collapsed": [("fl", ""), ("cat", "", "")]}),
]
FOLLOW_RENAMES = [
    ("floor_level", "Level 1", "1st Floor", None),
    ("floor_level", "level 2", "Level 2", None),
    ("category", "Walls", "Partitions", None),
    ("category", "Walls", "Partitions", {"group": "gi-garage"}),
    ("sub_category", "Exterior", "Outside", {"category": "Walls"}),
    ("sub_category", "Exterior", "Outside", {"category": ""}),
    ("sub_category", "Exterior", "Outside", None),
    ("category", "Framing", "Wood Framing", None),
]


def r7_follow():
    out = []
    for label, st in FOLLOW_STATES:
        for field, old, new, scope in FOLLOW_RENAMES:
            p = FlowPanel(FlowGL({}, {}), floor=st["floor"], group=st["group"],
                          collapsed=st["collapsed"])
            p._follow_rename(field, old, new, scope)
            out.append({"state": label, "start": {"floor": st["floor"], "group": st["group"],
                                                  "collapsed": sorted(web_key(k) for k in st["collapsed"])},
                        "field": field, "old": old, "new": new, "scope": scope,
                        "floor": p._floor_filter, "group": p._group_filter,
                        "collapsed": sorted(web_key(k) for k in p._collapsed)})
    return out


def r7_words():
    p = FlowPanel(FlowGL(r7_build(), {}))
    counts = [{"items": 0, "lines": 0}, {"items": 1, "lines": 0}, {"items": 9, "lines": 3},
              {"items": 0, "lines": 1}, {"items": 2, "lines": 1, "aids": 4}]
    spell = []
    for field, new, old, cat in (
            ("floor_level", "LEVEL  2 ", "level 2", None), ("floor_level", "level 2", "Level 2", None),
            ("floor_level", "Level 2", "level 2", None), ("floor_level", "level 1", None, None),
            ("floor_level", "Level 9", "Level 1", None), ("category", "concrete", "Walls", None),
            ("category", "concrete", None, None), ("sub_category", "interior", "Exterior", "Walls"),
            ("sub_category", "interior", "Exterior", "Doors")):
        spell.append([field, new, old, cat, p._existing_spelling(field, new, old, cat)])
    names = ["All Floors", "  all   floors ", "Uncategorized", "uncategorized", "(No Floor Level)",
             "(no floor level)", "All Trades", "All Groups", "All Categories", "No Floor Level",
             "", "   ", "Level 1", "Straße", "ALL  FLOORS"]
    return {"n": [[n, w, p._n(n, w)] for n in (0, 1, 2) for w in ("item", "material line")],
            "amount": [[c, p._amount(c)] for c in counts],
            "spelling": spell,
            "problems": [[s, NS["_class_name_problem"](s)] for s in names],
            "reserved": list(NS["CLASS_RESERVED"]), "engine": list(NS["ENGINE_CATEGORIES"])}


def tree_of_web(rows, solo=()):
    """The web's tree of the rows (items-panel.js refresh), keyed by the
    names Python's strip() leaves -- the plan's own -- and, with the SHEET
    chip on, the items on no sheet under their own section."""
    tree = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    for pg, m in rows:
        fl = SOLO if id(m) in solo else (m.get("floor_level") or "").strip()
        cat = (m.get("category") or "").strip()
        sub = (m.get("sub_category") or "").strip()
        tree[fl][cat][sub].append((pg, m))
    return tree


MISSING = "<missing>"


def leaf_diff(a, b, path=()):
    """Every leaf where two stores differ, as [path, before, after] -- a key
    one of them lacks is '<missing>' on that side. What a write CHANGED,
    and nothing it did not."""
    out = []
    if isinstance(a, dict) and isinstance(b, dict):
        for k in sorted(set(a) | set(b), key=str):
            if k not in a or k not in b:
                out.append([list(path) + [k], a.get(k, MISSING), b.get(k, MISSING)])
            else:
                out += leaf_diff(a[k], b[k], path + (k,))
    elif isinstance(a, list) and isinstance(b, list) and len(a) == len(b):
        for i, (x, y) in enumerate(zip(a, b)):
            out += leaf_diff(x, y, path + (i,))
    elif a != b or type(a) is not type(b) and not (
            isinstance(a, (int, float)) and isinstance(b, (int, float))
            and not isinstance(a, bool) and not isinstance(b, bool)):
        out.append([list(path), a, b])
    return out


def key_order(a, b, path=()):
    """Where `b` holds a dict whose keys are not, IN ORDER, the keys of the
    same dict in `a` -- a key added, dropped or moved -- as [path, b's keys]:
    what leaf_diff, which walks keys sorted, cannot see. The file keeps its
    keys in order, and the desktop reopens it."""
    out = []
    if isinstance(a, dict) and isinstance(b, dict):
        if list(a) != list(b):
            out.append([list(path), [str(k) for k in b]])
        for k in b:
            if k in a:
                out += key_order(a[k], b[k], path + (k,))
    elif isinstance(a, list) and isinstance(b, list) and len(a) == len(b):
        for i, (x, y) in enumerate(zip(a, b)):
            out += key_order(x, y, path + (i,))
    return out


def store_json(store):
    """A store as the file holds it: string page keys."""
    return {str(pg): lst for pg, lst in store.items()}


def items_order(a, b):
    """key_order inside every sheet's list (the sheets' own order is the
    file's page order: see r7_page_order)."""
    out = []
    for pg, lst in b.items():
        if pg in a:
            out += key_order(a[pg], lst, (pg,))
    return out


def r7_trim():
    return r7_with([r7_item("area", "Trim", "Level 1", "", "Loose", 1200)], 1)


def r7_only():
    """Without Wall B (Level 2) and the line that names Level 2: 'level 2'
    is the only spelling, and respelling it is no merge."""
    s = r7_build()
    s[2] = [m for m in s[2] if m.get("name") != "Wall B"]
    s[0][0]["associated_items"] = [a for a in s[0][0]["associated_items"]
                                   if a.get("floor_level") != "Level 2"]
    return s


def r7_openings():
    return r7_with([r7_pin("window", 1, "Level 1", "Openings", "", 100)])


def r7_ws():
    """Names with a character at an edge that Python's strip() and JS's
    trim() disagree on: U+FEFF (JS strips it, Python keeps it), U+0085 and
    U+001C-U+001F (Python strips them, JS keeps them). The desktop's
    'Level 1' heading holds exactly what its Rename renames -- Slab, Stoop
    and Ramp -- and the BOM one is a heading of its own."""
    item = r7_item
    return {
        0: [item("area", "Slab", "Level 1", "Concrete", "", 100),
            item("area", "Curb", "﻿Level 1", "Concrete", "", 200),
            item("area", "Stoop", "Level 1\x85", "Concrete", "", 300),
            item("area", "Ramp", "Level 1\x1f", "Concrete\x1c", "", 400),
            item("area", "Deck", "Level 2", "﻿Concrete", "", 500)],
    }


def r7_order_file():
    """A desktop file whose sheets are in the order they were first drawn
    on -- page 2 before page 0 (save_project writes
    {str(k): v for k, v in measurements.items()}, open_project reads them
    back in that order) -- with two spellings of one floor."""
    item = r7_item
    return {
        2: [item("area", "Deck", "Level 2", "Decking", "", 100)],
        0: [item("area", "Slab", "level 2", "Concrete", "", 200),
            item("area", "Wall", "Level 1", "Walls", "", 300)],
    }


def r7_order():
    """The same job in the web's order (JSON.parse puts integer keys first,
    ascending), which is also how the web writes it back -- so the order
    the desktop reads once the web has saved the job."""
    s = r7_order_file()
    return {pg: s[pg] for pg in sorted(s, key=lambda k: (k == SA, k))}


def r7_bare():
    """The framed wall with a hand-added extra that names no trade at all
    (the plan counts it as 'Framing'): a rename of Framing ADDS the key to
    it -- where in the record it lands is part of the file."""
    s = r7_build()
    s[2][1]["framing"]["params"]["_extras"].append(
        {"id": "e4", "name": "Blocking", "qty": 3, "floor_level": "Level 2"})
    return s


R7_FIXTURES = {"build": r7_build, "trim": r7_trim, "only": r7_only,
               "pins": r7_pins, "openings": r7_openings, "ws": r7_ws,
               "order": r7_order, "bare": r7_bare}


def r7_state(gl, panel, start_store):
    """The job, the list and the tool as they stand -- the store as what
    changed since the start -- copied, so a later step cannot write into
    what this one recorded."""
    return copy.deepcopy({
        "changes": leaf_diff(store_json(start_store), store_json(gl._measurements)),
        "order": items_order(store_json(start_store), store_json(gl._measurements)),
        "meta": gl._win.metadata,
        "panel": {"floor": panel._floor_filter, "group": panel._group_filter,
                  "collapsed": sorted(web_key(k) for k in panel._collapsed)},
        "tool": {"floor": gl._last_floor, "sub": gl._last_sub, "spec": gl._count_spec}})


def r7_flow(label, fixture, act, *, meta=None, panel=None, tool=None, answer=None,
            merge="No", between=None, store_fn=None):
    """One heading's Rename or Set, the way he does it: the form answered,
    the question answered, then Ctrl+Z and Ctrl+Y -- each step followed by
    the desktop's refresh of the filters (FlowPanel.refreshed). `panel` may
    put the SHEET chip on ("sheet": the sheet on screen). `store_fn` gives
    the store in an order of its own (r7_page_order) instead of the
    fixture's."""
    store = (store_fn or R7_FIXTURES[fixture])()
    meta = copy.deepcopy(meta or {})
    panel = dict(panel or {})
    tool = tool or {}
    answer = answer or {}
    sheet = panel.get("sheet")
    start = {"fixture": fixture, "meta": copy.deepcopy(meta),
             "panel": {"cost": panel.get("cost", "all"), "floor": panel.get("floor"),
                       "group": panel.get("group"),
                       "collapsed": sorted(web_key(k) for k in panel.get("collapsed", ()))},
             "tool": tool}
    if sheet is not None:
        start["panel"]["sheet"] = sheet
        if any(m.get("rev_id") for m in store.get(sheet) or []):
            raise SystemExit("%s: the sheet's own drawing only -- sheet %r has a "
                             "shape on a revision" % (label, sheet))
    gl = FlowGL(copy.deepcopy(store), meta)
    gl._last_floor, gl._last_sub = tool.get("floor", ""), tool.get("sub", "")
    gl._count_spec = copy.deepcopy(tool.get("spec"))
    p = FlowPanel(gl, cost=panel.get("cost", "all"), floor=panel.get("floor"),
                  group=panel.get("group"), collapsed=panel.get("collapsed", ()),
                  sheet=sheet)
    DLG.update(name=answer.get("name"), opt=answer.get("opt", ANY))
    DLG["seen"] = []
    _QMessageBox.asked = []
    _QMessageBox.answer[0] = _QMessageBox.Yes if merge == "Yes" else _QMessageBox.No
    rows = web_rows(gl._measurements, p._listed_ids)
    solo = ({id(m) for _pg, m in p.sheet_rows["solo"]} if sheet is not None else set())
    hmeta = {"type": act["type"], "fl": act.get("fl", ""), "cat": act.get("cat"),
             "sub": act.get("sub"), "m": None, "bucket": None,
             "tree": tree_of_web(rows, solo)}
    ix = index(gl._measurements)
    under = p._rows_under(hmeta)
    rec = {"label": label, "start": start, "act": act, "answer": answer, "merge": merge,
           "between": between, "rowsUnder": [ix[id(m)] for m in under],
           "listed": sorted([ix[id(m)] for lst in gl._measurements.values()
                             for m in lst if id(m) in p._listed_ids], key=json.dumps)}
    if act["kind"] == "rename":
        p._rename_from_header(hmeta)
    else:
        p._assign_from_header(hmeta, under)
    rec["dialog"] = DLG["seen"]
    rec["asked"] = _QMessageBox.asked
    rec["said"] = p.said
    rec["levels"] = len(gl.levels)
    rec["changed"] = gl.measurement_changed.n
    if rec["changed"]:
        p.refreshed()
    rec["after"] = r7_state(gl, p, store)
    tags = gl.levels[-1][1] if gl.levels else []
    rec["moves"] = [move_json(gl, p, mv) for t in tags for mv in t.get("moves", [])]
    if gl.levels:
        if between:
            if "floor" in between:
                gl._last_floor = between["floor"]
            if "spec" in between:
                gl._count_spec = dict(between["spec"])       # arm_count's own copy
        gl.undo()
        p.refreshed()
        rec["undone"] = r7_state(gl, p, store)
        gl.redo()
        p.refreshed()
        rec["redone"] = r7_state(gl, p, store)
        if act.get("type") == "cat" and act.get("cat") == "Framing" and act["kind"] == "rename":
            rec["recompute"] = r7_recompute(gl._measurements)
    return rec


def r7_flows():
    out = []
    folds1 = [("cat", "Level 1", "Concrete"), ("fl", "Level 2")]
    spec_outlets = {"name": "Outlets", "floor_level": "Level 1", "category": "Electrical",
                    "sub_category": ""}
    out.append(r7_flow("Rename floor level: every item, shape, line and answer", "build",
                       {"kind": "rename", "type": "floor", "fl": "Level 1"},
                       panel={"cost": "material", "floor": "Level 1", "collapsed": folds1},
                       tool={"floor": "Level 1", "sub": "Exterior", "spec": spec_outlets},
                       answer={"name": "1st Floor"}))
    out.append(r7_flow("Rename category: the whole job, the group filter follows", "build",
                       {"kind": "rename", "type": "cat", "fl": "Level 1", "cat": "Walls"},
                       panel={"group": "Walls"}, answer={"name": "Partitions"}))
    out.append(r7_flow("Rename 'Framing': lines, answers, specs, and the note", "build",
                       {"kind": "rename", "type": "cat", "fl": "Level 2", "cat": "Framing"},
                       answer={"name": "Wood Framing"}))
    out.append(r7_flow("Rename 'Hardware': the note too", "build",
                       {"kind": "rename", "type": "cat", "fl": "Level 1", "cat": "Hardware"},
                       answer={"name": "Fasteners"}))
    out.append(r7_flow("Rename sub-category: only under its own category", "build",
                       {"kind": "rename", "type": "sub", "fl": "Level 1", "cat": "Walls",
                        "sub": "Exterior"},
                       panel={"collapsed": [("sub", "Level 1", "Doors", "Exterior"),
                                            ("sub", "Level 1", "Walls", "Exterior")]},
                       tool={"sub": "Exterior"}, answer={"name": "Outside"}))
    out.append(r7_flow("Rename sub-category under Uncategorized: the next item's follows", "trim",
                       {"kind": "rename", "type": "sub", "fl": "Level 1", "cat": "", "sub": "Loose"},
                       tool={"sub": "Loose"}, answer={"name": "Bits"}))
    out.append(r7_flow("Merge 'level 2' into 'Level 2': No changes nothing", "build",
                       {"kind": "rename", "type": "floor", "fl": "level 2"},
                       answer={"name": "LEVEL  2 "}, merge="No"))
    out.append(r7_flow("Merge 'level 2' into 'Level 2': Yes, the spelling that is there", "build",
                       {"kind": "rename", "type": "floor", "fl": "level 2"},
                       panel={"floor": "level 2", "collapsed": [("fl", "level 2"), ("fl", "Level 2"),
                                                                ("cat", "level 2", "Framing")]},
                       answer={"name": "LEVEL  2 "}, merge="Yes"))
    for bad in ("All Floors", "  all   floors ", "Uncategorized", "(No Floor Level)", "All Trades",
                "", "Level 1", " Level  1 "):
        out.append(r7_flow("Refused: %r" % bad, "build",
                           {"kind": "rename", "type": "floor", "fl": "Level 1"}, answer={"name": bad}))
    out.append(r7_flow("Rename: the form cancelled", "build",
                       {"kind": "rename", "type": "floor", "fl": "Level 1"}, answer={}))
    out.append(r7_flow("Respelled, not merged: the only 'level 2' as 'Level 2'", "only",
                       {"kind": "rename", "type": "floor", "fl": "level 2"}, answer={"name": "Level 2"}))
    for opt in ("listed", "job"):
        out.append(r7_flow("Set floor level for the items under NO FLOOR LEVEL (%s)" % opt, "build",
                           {"kind": "assign", "type": "floor", "fl": ""},
                           panel={"cost": "material"}, answer={"name": "Level 3", "opt": opt}))
    out.append(r7_flow("Set floor level: nothing filtered, no choice", "build",
                       {"kind": "assign", "type": "floor", "fl": ""}, answer={"name": "level 1"}))
    out.append(r7_flow("Set category for this item, the whole job: the blank filter follows",
                       "build", {"kind": "assign", "type": "cat", "fl": "", "cat": ""},
                       panel={"group": ""}, answer={"name": "concrete", "opt": "job"}))
    out.append(r7_flow("Set category, refused: a list's own word", "build",
                       {"kind": "assign", "type": "cat", "fl": "", "cat": ""},
                       answer={"name": "(Uncategorized)"}))
    out.append(r7_flow("Pins follow a rename of their trade: windows and doors together", "pins",
                       {"kind": "rename", "type": "cat", "fl": "Level 1", "cat": "Doors & Windows"},
                       answer={"name": "Openings"}))
    out.append(r7_flow("Pins: partitions and headers share their trade", "pins",
                       {"kind": "rename", "type": "cat", "fl": "Level 1", "cat": "Wood Framing"},
                       answer={"name": "Framing Labor"}))
    out.append(r7_flow("Pins: a sub-category under its trade moves its kind", "pins",
                       {"kind": "rename", "type": "sub", "fl": "Level 1", "cat": "Wood Framing",
                        "sub": "Partitions"}, answer={"name": "Interior Walls"}))
    out.append(r7_flow("Pins: the same sub-category under another trade is another one", "pins",
                       {"kind": "rename", "type": "sub", "fl": "Level 1", "cat": "Walls",
                        "sub": "Exterior"}, answer={"name": "Partitions"}))
    filed = {"pin_filing": {"window": {"category": "Openings"}, "door": {"category": "Openings"}}}
    out.append(r7_flow("Pins: a merge moves them", "openings",
                       {"kind": "rename", "type": "cat", "fl": "Level 1", "cat": "Openings"},
                       meta=filed, answer={"name": "doors"}, merge="Yes"))
    out.append(r7_flow("Pins: renamed back to stock, the key goes", "openings",
                       {"kind": "rename", "type": "cat", "fl": "Level 1", "cat": "Openings"},
                       meta=filed, answer={"name": "Doors & Windows"}))
    spec_sw = {"name": "Switches", "floor_level": "Level 1", "category": "Electrical",
               "sub_category": "", "cost_type": "material", "unit_cost": 0.0,
               "color": [1.0, 0.0, 0.0, 1.0]}
    out.append(r7_flow("Ctrl+Z of a rename: the tool, the armed count and the filter", "build",
                       {"kind": "rename", "type": "floor", "fl": "Level 1"},
                       panel={"floor": "Level 1"},
                       tool={"floor": "Level 1", "sub": "Exterior", "spec": spec_sw},
                       answer={"name": "First Floor"}))
    out.append(r7_flow("What he picked since the rename is his: Ctrl+Z leaves it", "build",
                       {"kind": "rename", "type": "floor", "fl": "Level 1"},
                       tool={"floor": "Level 1", "spec": {"name": "Switches", "floor_level": "Level 1",
                                                          "category": "Electrical", "sub_category": ""}},
                       answer={"name": "First Floor"},
                       between={"floor": "Level 3",
                                "spec": {"name": "Outlets", "floor_level": "First Floor",
                                         "category": "Electrical", "sub_category": ""}}))
    out.append(r7_flow("A merge: Ctrl+Z puts back what the merge moved", "build",
                       {"kind": "rename", "type": "cat", "fl": "Level 1", "cat": "Walls"},
                       panel={"group": "Walls"},
                       tool={"spec": {"name": "Studs", "floor_level": "Level 1", "category": "Walls",
                                      "sub_category": ""}},
                       answer={"name": "concrete"}, merge="Yes"))
    # A key the rename adds lands where the desktop puts it: last.
    out.append(r7_flow("Rename 'Framing': an extra with no trade is given one, at its end", "bare",
                       {"kind": "rename", "type": "cat", "fl": "Level 2", "cat": "Framing"},
                       answer={"name": "Carpentry"}))
    # The heading is the plan's own string: Python's strip(), never JS's trim().
    out.append(r7_flow("A heading is what its Rename renames: strip(), not trim()", "ws",
                       {"kind": "rename", "type": "floor", "fl": "Level 1"},
                       panel={"floor": "Level 1"}, answer={"name": "Ground"}))
    out.append(r7_flow("...and the BOM one is a heading of its own, renamed on its own", "ws",
                       {"kind": "rename", "type": "floor", "fl": "﻿Level 1"},
                       answer={"name": "Porch"}))
    out.append(r7_flow("...a category with \\x1c at its edge is the plain one", "ws",
                       {"kind": "rename", "type": "cat", "fl": "Level 1", "cat": "Concrete"},
                       answer={"name": "Flatwork"}))
    # Two spellings already in the job, a typed name that is neither: the
    # spelling met first wins -- in the order the web holds (and saves) the
    # sheets in. (The desktop's own file order: r7_page_order.)
    out.append(r7_flow("A merge into one of two look-alikes: the one met first", "order",
                       {"kind": "rename", "type": "floor", "fl": "Level 1"},
                       answer={"name": "LEVEL 2"}, merge="Yes"))
    # Set with the list filtered to the blank, a name the job did not have:
    # the filter follows the items; the desktop's Ctrl+Z leaves it on a name
    # that is gone, and its refresh drops it to All Floors.
    out.append(r7_flow("Set on NO FLOOR LEVEL filtered to it, a new name: the filter follows",
                       "build", {"kind": "assign", "type": "floor", "fl": ""},
                       panel={"floor": ""}, answer={"name": "Level 9"}))
    # The SHEET chip on: what one sheet lists is what the sentences count.
    out.append(r7_flow("SHEET on: a rename counts what this sheet hides (a Group listed)", "build",
                       {"kind": "rename", "type": "floor", "fl": "Level 1"},
                       panel={"sheet": 2}, answer={"name": "Ground"}))
    out.append(r7_flow("SHEET on: Set on this sheet's blank rows, or the whole job's", "build",
                       {"kind": "assign", "type": "floor", "fl": ""},
                       panel={"sheet": 0}, answer={"name": "Level 4", "opt": "listed"}))
    out.append(r7_flow("SHEET on: the whole job's", "build",
                       {"kind": "assign", "type": "cat", "fl": "", "cat": ""},
                       panel={"sheet": 0}, answer={"name": "Sitework", "opt": "job"}))
    return out


def r7_chain(label, fixture, steps, *, panel=None, tool=None):
    """Several steps, one after the other, the way he takes them: Renames
    and Sets through the form, then Ctrl+Z and Ctrl+Y across them -- the
    state after each, each followed by the desktop's refresh."""
    store = R7_FIXTURES[fixture]()
    panel = dict(panel or {})
    tool = tool or {}
    gl = FlowGL(copy.deepcopy(store), {})
    gl._last_floor, gl._last_sub = tool.get("floor", ""), tool.get("sub", "")
    gl._count_spec = copy.deepcopy(tool.get("spec"))
    p = FlowPanel(gl, cost=panel.get("cost", "all"), floor=panel.get("floor"),
                  group=panel.get("group"), collapsed=panel.get("collapsed", ()))
    rec = {"label": label, "fixture": fixture,
           "start": {"panel": {"cost": panel.get("cost", "all"), "floor": panel.get("floor"),
                               "group": panel.get("group"), "collapsed": []},
                     "tool": tool},
           "steps": []}
    for st in steps:
        p.said = []
        n0 = gl.measurement_changed.n
        if st["do"] in ("rename", "assign"):
            act, answer = st["act"], st.get("answer") or {}
            DLG.update(name=answer.get("name"), opt=answer.get("opt", ANY))
            DLG["seen"] = []
            _QMessageBox.asked = []
            _QMessageBox.answer[0] = (_QMessageBox.Yes if st.get("merge") == "Yes"
                                      else _QMessageBox.No)
            rows = web_rows(gl._measurements, p._listed_ids)
            hmeta = {"type": act["type"], "fl": act.get("fl", ""), "cat": act.get("cat"),
                     "sub": act.get("sub"), "m": None, "bucket": None,
                     "tree": tree_of_web(rows)}
            if st["do"] == "rename":
                p._rename_from_header(hmeta)
            else:
                p._assign_from_header(hmeta, p._rows_under(hmeta))
        elif st["do"] == "filter":
            # He picks a floor in the list's filter (the combo's own
            # refresh follows).
            p._floor_filter = st["floor"]
        elif st["do"] == "undo":
            gl.undo()
        else:
            gl.redo()
        # (an undo and a redo always refresh: _restore_state emits
        # measurement_changed, which this canvas's undo() does not count)
        if gl.measurement_changed.n != n0 or st["do"] in ("filter", "undo", "redo"):
            p.refreshed()
        state = r7_state(gl, p, store)
        state.update({"said": list(p.said), "levels": len(gl.levels),
                      "redos": len(gl.redos)})
        rec["steps"].append({"step": st, "state": state})
    return rec


def r7_chains():
    spec = {"name": "Switches", "floor_level": "Level 1", "category": "Electrical",
            "sub_category": ""}
    floor = [{"do": "rename", "act": {"type": "floor", "fl": "Level 1"},
              "answer": {"name": "Ground"}},
             {"do": "rename", "act": {"type": "floor", "fl": "Ground"},
              "answer": {"name": "Main"}},
             {"do": "undo"}, {"do": "undo"}, {"do": "redo"}, {"do": "redo"},
             {"do": "undo"}]
    trade = [{"do": "rename", "act": {"type": "cat", "fl": "Level 1", "cat": "Walls"},
              "answer": {"name": "Partitions"}},
             {"do": "rename", "act": {"type": "cat", "fl": "Level 1", "cat": "Partitions"},
              "answer": {"name": "concrete"}, "merge": "Yes"},
             {"do": "undo"}, {"do": "undo"}, {"do": "redo"}, {"do": "redo"}]
    fill = [{"do": "assign", "act": {"type": "floor", "fl": ""}, "answer": {"name": "Level 9"}},
            {"do": "rename", "act": {"type": "floor", "fl": "Level 9"},
             "answer": {"name": "Level 8"}},
            {"do": "undo"}, {"do": "undo"}, {"do": "redo"}, {"do": "redo"}]
    return [r7_chain("Two renames of one floor, then Ctrl+Z, Ctrl+Z, Ctrl+Y, Ctrl+Y", "build",
                     floor, panel={"floor": "Level 1"},
                     tool={"floor": "Level 1", "spec": spec}),
            r7_chain("A rename, then a merge of the new name, across Ctrl+Z and Ctrl+Y", "build",
                     trade, panel={"group": "Walls"}),
            r7_chain("A Set on the blank, then a rename of what it set", "build",
                     fill, tool={"floor": ""}),
            # What he picks between the steps is his: an Undo that found the
            # filter changed leaves it, and the Redo after it carries only
            # what that Undo did put back -- not the filter, even once he
            # has picked the old name again.
            r7_chain("A filter he picked between Undo and Redo is his", "build",
                     [floor[0], {"do": "filter", "floor": "Level 2"}, {"do": "undo"},
                      {"do": "filter", "floor": "Level 1"}, {"do": "redo"}, {"do": "undo"}],
                     panel={"floor": "Level 1"}, tool={"floor": "Level 1", "spec": spec})]


def r7_page_order():
    """The flow above ('A merge into one of two look-alikes') on the
    desktop's own file order, page 2 first: the declared divergence. The
    web walks a job's sheets in page order (it cannot keep a JSON object's
    integer keys in any other), so a merge into one of two look-alikes
    can pick the other one than the desktop on a file the desktop wrote
    with its sheets out of page order -- never on a file the web saved."""
    fl = r7_flow("A merge into one of two look-alikes, the desktop's file order", "order",
                 {"kind": "rename", "type": "floor", "fl": "Level 1"},
                 answer={"name": "LEVEL 2"}, merge="Yes", store_fn=r7_order_file)
    gf, gw = FlowGL(r7_order_file(), {}), FlowGL(r7_order(), {})
    return {"pages": [str(k) for k in r7_order_file()],
            "values": {"file": gf.project_values("floor_level"),
                       "web": gw.project_values("floor_level")},
            "spelling": {"file": FlowPanel(gf)._existing_spelling("floor_level", "LEVEL 2", "Level 1"),
                         "web": FlowPanel(gw)._existing_spelling("floor_level", "LEVEL 2", "Level 1")},
            "said": fl["said"], "after": fl["after"]["changes"]}


# Names whose sort and sameness hang on Python's Unicode rules: decimal
# digits that are not ASCII, letters casefold() folds and lower() does not,
# a character past U+FFFF against one just under it.
R7_TEXT_NAMES = ["Level 3", "Level 10", "Level ٢", "Level ２", "Level 1２",
                 "Level ١٠", "Oﬃce", "Office", "ΟΔΟΣ",
                 "οδοσ", "ı", "I", "i", "STRAẞE", "strasse",
                 "Ꭰ", "ꭰ", "Level Ａ", "Level \U0001d400", "Level ",
                 "ᾳ", "αι"]


def r7_text():
    """The desktop's own _class_norm and _class_sort_key over every
    character this Python's Unicode table assigns (private use left out:
    no case, no digits), compactly: which ones the fold changes and to
    what, which ones are decimal digits and their value, and which ones the
    sort key cannot take (isdigit() but not a decimal digit: int() raises --
    a desktop residual). The web is held to these for every character its
    own table assigns too."""
    import unicodedata
    norm, key = NS["_class_norm"], NS["_class_sort_key"]
    ranges, fold, digits, raises = [], [], [], []
    for cp in range(0x110000):
        c = chr(cp)
        if unicodedata.category(c) in ("Cn", "Cs", "Co"):
            continue
        if ranges and ranges[-1][1] == cp - 1:
            ranges[-1][1] = cp
        else:
            ranges.append([cp, cp])
        n = norm(c)
        if n != c:
            fold.append("%x:%s" % (cp, ".".join("%x" % ord(x) for x in n)))
        try:
            k = key(c)
        except ValueError:
            raises.append("%x" % cp)
            continue
        if k and k[0][0] == 0:
            digits.append("%x:%d" % (cp, k[0][1]))
    names = R7_TEXT_NAMES
    return {"unicode": unicodedata.unidata_version,
            "assigned": " ".join("%x-%x" % (a, b) for a, b in ranges),
            "fold": " ".join(fold), "digits": " ".join(digits), "raises": " ".join(raises),
            "names": names, "sorted": sorted(names, key=key),
            "same": [[a, b] for i, a in enumerate(names) for b in names[i + 1:]
                     if norm(a) == norm(b)]}


def r7_recompute(store):
    """The engine's own merge rule (framing.refresh_materials), run on a copy
    of the framed wall as the 'Framing' rename left it: its re-attached
    lines keep the rename, and his own re-filing."""
    wb = next(m for m in store[2] if m.get("name") == "Wall B")
    cp = copy.deepcopy(wb)
    F = NS["_framing"]
    F.refresh_materials(cp, F.extra_lines(F.extras_of(cp["framing"]["params"]))
                        + [F.material("2x6 stud", 10, "each")])
    return {a["name"]: [a.get("category"), a.get("floor_level")] for a in cp["associated_items"]}


def rename_truth():
    return {
        "lifted": {"ClassificationDialog": DLG_MEMBERS, "framing": FRNAMES},
        "fixtures": {k: pairs(f()) for k, f in R7_FIXTURES.items()},
        "plans": r7_plans(),
        "assign": r7_assign(),
        "pins": r7_pin_cases(),
        "tool": r7_tool(),
        "follow": r7_follow(),
        "words": r7_words(),
        "flows": r7_flows(),
        "chains": r7_chains(),
        "page_order": r7_page_order(),
        "text": r7_text(),
    }


def main():
    out = {
        "lifted": {"module": MODNAMES, "TakeoffItemsPanel": PANEL_MEMBERS,
                   "GLPageWidget": GL_MEMBERS},
        "SOLO": SOLO,
        "HDR_FIELD": NS["PanelBase"]._HDR_FIELD,
        "HDR_WHAT": NS["PanelBase"]._HDR_WHAT,
        "presets": {"floor_level": NS["FLOOR_LEVEL_PRESETS"],
                    "category": NS["CATEGORY_PRESETS"]},
        "rows": {"list": ROWS, "one blank": ONE_BLANK},
        "headers": headers(),
        "choices": choices(),
        "reveals": reveals(),
        "values": values(),
        "sorted": sorted(NAMES, key=NS["_class_sort_key"]),
        "norm": [[s, NS["_class_clean"](s), NS["_class_norm"](s)] for s in NAMES],
        "rename": rename_truth(),
    }
    text = json.dumps(out, indent=1, ensure_ascii=True) + "\n"
    if WRITE:
        with open(SNAPSHOT, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        print("wrote %s: %d headings, %d menu choices, %d stores"
              % (os.path.basename(SNAPSHOT), len(out["headers"]),
                 len(out["choices"]), len(out["values"])), flush=True)
    else:
        sys.stdout.write(text)
        sys.stdout.flush()


if __name__ == "__main__":
    main()
