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

THE LIFTED SET MUST BE A CLOSURE, checked BEFORE anything runs: every
`self.<name>` a lifted member touches is another lifted member or a DECLARED
stub, every name it reads is a builtin, a lifted module name or a DECLARED
stand-in (re, QTimer, _ClickableRow), and the one import inside a lifted body is the one
declared (PyQt5.QtWidgets.QMenu, a stand-in put in sys.modules first, so no
real Qt is ever loaded).

The stores and the list's rows are given as [page, items] pairs IN THE ORDER
the web walks them (its sheets in order, then the items on no sheet), so a
tie in the sort (a name and its look-alike) is broken the same way on both
sides. tests/heading-menu.mjs replays every scenario on the web and diffs it,
from the committed tests/data/rename-truth.json on a fresh clone and live
against this script when the desktop source is here. Round 7 (rename-heading,
assign-blank-heading) extends this file with the rename and assign plans.

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
                 "_apply_selection"]
# The panel's data and the things its menu hands work to: the canvas, the
# collapse set, the rebuild, the Group's form and the two forms Round 7 ports;
# and what a selection on the drawing lights (highlight_measurement,
# _apply_selection): the selected shape, the rows one refresh listed and the
# widgets that show them, and the scroll area's ensureWidgetVisible.
PANEL_STUBS = {"_gl_widget", "_collapsed", "refresh", "item_properties_req",
               "_rename_from_header", "_assign_from_header",
               "_sel_m", "_row_meta", "_items_vbox", "ensureWidgetVisible"}
GL_MEMBERS = ["CLASS_FIELDS", "_class_val", "project_values"]
GL_STUBS = {"_measurements", "all_group_items"}
MODULE_SEED = ["_fill_class_combo", "_project_values_near",
               "FLOOR_LEVEL_PRESETS", "CATEGORY_PRESETS"]
# The one import a lifted body makes, and what answers it.
DECLARED_IMPORTS = {("PyQt5.QtWidgets", "QMenu")}


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
    problems, want = [], set(MODULE_SEED)
    for cls, members, stubs, other in (
            (panel, PANEL_MEMBERS, PANEL_STUBS, set(GL_MEMBERS) | GL_STUBS),
            (gl_cls, GL_MEMBERS, GL_STUBS, set())):
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
        for imp in sorted(_imports(node) - DECLARED_IMPORTS, key=str):
            problems.append("%s imports %s" % (nm, imp))
        lifted.append(nm)
        queue.extend(sorted(_free(node) - seen))
    return problems, lifted


PROBLEMS, MODNAMES = closure()
if PROBLEMS:
    raise SystemExit("the lifted set is not a closure:\n  " + "\n  ".join(PROBLEMS))

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
