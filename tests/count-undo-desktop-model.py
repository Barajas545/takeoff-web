"""The desktop's RULES of a count tap, run on the same sessions as the web.

tests/count-undo-python-truth.py holds the web to the desktop's own answer-
building (_rearm_count). This holds it to the rest of the count tool: what a
tap goes onto, in the desktop's own order -- a typed name that puts the armed
count down, the count held on a drawing gone back to, the armed count, the
armed answers, the name in the box, the form -- what a choice and a job
switch leave behind, and the armed and held counts found again after an undo
or a redo. The desktop's own GLPageWidget methods are lifted BY TEXT (through
`ast`, so a method is exactly its own lines) and run on a stub canvas:

  _add_count_point, arm_count, forget_armed_count, armed_count,
  _armed_count_place, _count_place_now, _rearm_count, _count_found_again
  (its likeness ranking: the web finds counts by _uid, and the two must
  agree on every session here), _pending_name, _sync_tool_name,
  item_rev_id, on_this_version, _mark_drawing, viewing_rev_id,
  version_items, _next_sort_order, _dialog_extra_fields; with _COUNT_LIKENESS,
  _COUNT_UNDOLESS, _COUNT_TEMPLATE and CLASS_FIELDS.

Not lifted, and written out below from the desktop's own lines: the count
part of _restore_state (33907-34002 in 3.07: where the armed and held counts
are, read before the swap; _rearm_count; the held ones found again, never
the armed one, never twice) and the window around the canvas (set_mode's
arming form, _sync_tool_options emptying the box on a tool change, the box's
clear button) -- each a few lines.

The web's agreed differences are modelled, not reported:
  * the count form never becomes the last floor, trade, sub-category or
    cost type (declined by the user, 2026-11-05): the stub drops the writes;
  * emptying the Item box by hand is its clear button (the web has no x);
  * no framing engine (the web has none): framing calls do nothing.

THE LIFTED SET MUST BE A CLOSURE, checked BEFORE anything runs: every
`self.<name>` a lifted method touches is lifted, a lifted class attribute,
or a stub the canvas below declares; every free name it reads is a builtin
or a declared stand-in.

Usage: python -B count-undo-desktop-model.py [pdf_fast_viewer.py] < sessions.json
(PTT_DESKTOP_SRC when no path is given). Prints, per session, the state
after every step as JSON.
"""
import ast
import builtins
import copy
import json
import os
import sys
import textwrap

SRC = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("PTT_DESKTOP_SRC", "")
if not SRC or not os.path.exists(SRC):
    raise SystemExit("Give pdf_fast_viewer.py (argument or PTT_DESKTOP_SRC).")

CLASS = "GLPageWidget"
METHODS = ["arm_count", "forget_armed_count", "armed_count", "_armed_count_place",
           "_count_place_now", "_rearm_count", "_count_found_again", "_add_count_point",
           "_pending_name", "_sync_tool_name", "item_rev_id", "on_this_version",
           "viewing_rev_id", "version_items", "_next_sort_order", "_dialog_extra_fields",
           "_mark_drawing",
           # 3.08: version_items keeps only the takeoff he is in
           "in_active_list", "active_takeoff_list"]
ATTRS = ["_COUNT_LIKENESS", "_COUNT_UNDOLESS", "_COUNT_TEMPLATE", "CLASS_FIELDS"]

text = open(SRC, encoding="utf-8").read()
lines = text.splitlines(True)
tree = ast.parse(text)
cls = next((n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == CLASS), None)
if cls is None:
    raise SystemExit("no class %s in %s" % (CLASS, SRC))
bodies, attrs = {}, {}
for node in cls.body:
    if isinstance(node, ast.FunctionDef) and node.name in METHODS:
        # A method with its decorator lines (item_rev_id is a staticmethod);
        # only the builtin ones, which need nothing else lifted.
        for d in node.decorator_list:
            if not (isinstance(d, ast.Name) and d.id in ("staticmethod", "classmethod", "property")):
                raise SystemExit("%s.%s has a decorator this cannot lift" % (CLASS, node.name))
        first = node.decorator_list[0].lineno if node.decorator_list else node.lineno
        bodies[node.name] = textwrap.dedent("".join(lines[first - 1:node.end_lineno]))
    elif (isinstance(node, ast.Assign) and len(node.targets) == 1
          and isinstance(node.targets[0], ast.Name) and node.targets[0].id in ATTRS):
        attrs[node.targets[0].id] = ast.literal_eval(node.value)
missing = sorted(set(METHODS) - set(bodies)) + sorted(set(ATTRS) - set(attrs))
if missing:
    raise SystemExit("not found in %s.%s: %s" % (SRC, CLASS, ", ".join(missing)))

# The one module-level name the lifted code reads that is a value: which
# marks are kept apart from the takeoff (version_items).
KEPT = None
for node in tree.body:
    if (isinstance(node, ast.Assign)
            and any(isinstance(t, ast.Name) and t.id == "KEPT_MARK_TYPES" for t in node.targets)):
        KEPT = ast.literal_eval(node.value)
if KEPT is None:
    raise SystemExit("no KEPT_MARK_TYPES in %s" % SRC)

# 3.08: which takeoff an item is in (_count_found_again's stamp, the view
# test, the stamp a new item gets), lifted WITH its module closure -- the
# type constants included -- by a walk, never listed by hand.
TOP = {}
for node in tree.body:
    if isinstance(node, ast.FunctionDef):
        TOP.setdefault(node.name, node)
    elif isinstance(node, ast.Assign):
        for _t in node.targets:
            if isinstance(_t, ast.Name):
                TOP.setdefault(_t.id, node)


def _free_of(node):
    loc = set()
    if isinstance(node, ast.FunctionDef):
        loc = {a.arg for a in node.args.args + node.args.kwonlyargs}
    for n in ast.walk(node):
        if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store):
            loc.add(n.id)
        elif isinstance(n, ast.arg):
            loc.add(n.arg)
        elif isinstance(n, (ast.Import, ast.ImportFrom)):
            loc.update((a.asname or a.name).split(".")[0] for a in n.names)
    return {n.id for n in ast.walk(node) if isinstance(n, ast.Name)
            and isinstance(n.ctx, ast.Load)} - loc


MODULE_SEED = ["in_takeoff_list", "takeoff_list_of", "_set_takeoff_list"]
_queue, _nodes = list(MODULE_SEED), {}
while _queue:
    _nm = _queue.pop(0)
    if _nm in _nodes or _nm not in TOP:
        continue
    _nodes[_nm] = TOP[_nm]
    _queue += sorted(n for n in _free_of(TOP[_nm]) if n in TOP)
_mod_missing = sorted(set(MODULE_SEED) - set(_nodes))
if _mod_missing:
    raise SystemExit("not found in %s: %s" % (SRC, ", ".join(_mod_missing)))
_mod_problems = []
for _nm, node in _nodes.items():
    for f in sorted(_free_of(node) - set(_nodes)):
        if not hasattr(builtins, f):
            _mod_problems.append("%s reads %s, which is not lifted" % (_nm, f))
if _mod_problems:
    raise SystemExit("the module closure is not whole:\n  " + "\n  ".join(_mod_problems))
MODULE_NS = {}
exec(compile("\n".join("".join(lines[n.lineno - 1:n.end_lineno])
                       for n in sorted(_nodes.values(), key=lambda n: n.lineno)),
             "<module.lifted>", "exec"), MODULE_NS)
MODULE_LIFTED = sorted(_nodes)
_set_takeoff_list = MODULE_NS["_set_takeoff_list"]   # the stub _add_measurement's stamp
takeoff_list_of = MODULE_NS["takeoff_list_of"]       # a row's takeoff, in snap()

FORM = {"asked": 0, "answer": None}


class _Pt:
    def __sub__(self, o): return self
    def center(self): return self


class QDialog:
    Accepted = 1
    Rejected = 0


class ItemPropertiesDialog:
    """The count form a tap asks: answered by the session, counted."""

    def __init__(self, kind, name, color, parent=None, **kw):
        self._color = color

    def preset_catalog(self, sel): pass
    def move(self, p): pass
    def rect(self): return _Pt()

    def exec_(self):
        FORM["asked"] += 1
        return QDialog.Accepted if FORM["answer"] else QDialog.Rejected

    def get_result(self):
        a = FORM["answer"]
        return (a["name"], "", self._color, a["floor"], a.get("cat", "Electrical"), "",
                "material", 0.0)

    def get_purpose(self): return ""
    def get_catalog_selection(self): return None
    def get_rate_unit(self): return ""


# Every module-level name the lifted code may read: declared here, or the
# closure check refuses to run.
STAND_INS = {"ItemPropertiesDialog": ItemPropertiesDialog, "QDialog": QDialog,
             "KEPT_MARK_TYPES": KEPT, "_framing": None,
             "catalog_rate_for": lambda *a: (None, False), "REPORT_UNIT_BY_TYPE": {}}
STAND_INS.update({k: v for k, v in MODULE_NS.items() if k in MODULE_LIFTED})


class _Sig:
    def emit(self, *a): pass


class _Win:
    def _flash_status(self, *a): pass


class Stubs:
    """What the lifted methods reach that is not theirs to run here."""

    # the user's decision: the count form is not remembered as the last
    # floor / trade / sub-category / cost type
    _last_floor = property(lambda s: "", lambda s, v: None)
    _last_category = property(lambda s: "", lambda s, v: None)
    _last_sub = property(lambda s: "", lambda s, v: None)
    _last_cost_type = property(lambda s: "material", lambda s, v: None)

    def layer_items(self, page=None): return self.version_items(page)
    def measurements_with_baseline_visibility(self): return self._measurements
    def window(self): return _Win()
    def _main_window(self): return None
    def geometry(self): return _Pt()
    def mapToGlobal(self, p): return _Pt()
    def update(self): pass
    def _recalc_measurement(self, m): pass
    # no framing engine on the web
    def _apply_pending_framing(self, m): pass
    def _inherit_count_framing(self, m): return False
    def recompute_framing(self, m): pass
    def _disarm_framing(self): pass

    def _next_palette_color(self):
        self._palette_index += 1
        return [0.1 * (self._palette_index % 9), 0.5, 0.5]

    def peek_palette_color(self): return [0.0, 0.5, 0.5]

    def _push_undo(self):
        self._undo.append(copy.deepcopy(self._measurements))
        self._redo.clear()

    def _add_measurement(self, m, page=None):
        rid = self.viewing_rev_id()
        if rid:
            m["rev_id"] = rid
            m["rev_page"] = int(self._preview_key[1])
        else:
            m.pop("rev_id", None)
            m.pop("rev_page", None)
        # ...and the takeoff he is in, as the desktop's _add_measurement
        # stamps it (the web: Main, so the key is popped)
        _set_takeoff_list(m, self._takeoff_list_active)
        self._measurements.setdefault(self._current_page, []).append(m)
        return m


# The canvas's own data (set in __init__ below), which the lifted code reads
# and writes.
DATA = {"_measurements", "_current_page", "_preview_key", "_palette_index",
        "_pending_item_name", "_pending_catalog", "_pending_framing", "_count_target",
        "_count_spec", "_count_answers", "_count_category", "_count_named", "_count_left",
        "_undo", "_redo", "measurement_changed", "_last_dialog_purpose",
        "_last_dialog_catalog", "_last_dialog_rate_unit",
        # 3.08: the takeoff he is in ("" = Main: the web's, always)
        "_takeoff_list_active"}

# ── the closure check ─────────────────────────────────────────────────────
allowed_self = (set(METHODS) | set(ATTRS) | DATA
                | {k for k in vars(Stubs) if not k.startswith("__")})
problems = []
for name, body in bodies.items():
    fn = ast.parse(body).body[0]
    touched = {n.attr for n in ast.walk(fn)
               if isinstance(n, ast.Attribute) and isinstance(n.value, ast.Name)
               and n.value.id == "self"}
    for t in sorted(touched - allowed_self):
        problems.append("%s reaches self.%s, which is neither lifted nor a declared stub"
                        % (name, t))
    bound = {a.arg for a in fn.args.args + fn.args.kwonlyargs}
    if fn.args.vararg:
        bound.add(fn.args.vararg.arg)
    if fn.args.kwarg:
        bound.add(fn.args.kwarg.arg)
    for n in ast.walk(fn):
        if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store):
            bound.add(n.id)
        elif isinstance(n, (ast.Import, ast.ImportFrom)):
            for a in n.names:
                bound.add((a.asname or a.name).split(".")[0])
        elif isinstance(n, ast.arg):
            bound.add(n.arg)
        elif isinstance(n, (ast.FunctionDef, ast.Lambda)) and n is not fn:
            if isinstance(n, ast.FunctionDef):
                bound.add(n.name)            # a helper defined inside the method
    free = {n.id for n in ast.walk(fn) if isinstance(n, ast.Name)
            and isinstance(n.ctx, ast.Load)} - bound - {"self"}
    for f in sorted(free):
        if not hasattr(builtins, f) and f not in STAND_INS:
            problems.append("%s reads the module-level name %s, which is not declared" % (name, f))
if problems:
    raise SystemExit("the lifted set is not a closure:\n  " + "\n  ".join(problems))

ns = dict(STAND_INS)
exec(compile("class _Lifted:\n" + "".join(textwrap.indent(b, "    ") + "\n" for b in bodies.values()),
             "<%s lifted>" % CLASS, "exec"), ns)
Lifted = ns["_Lifted"]
for k, v in attrs.items():
    setattr(Lifted, k, v)


class Canvas(Stubs, Lifted):
    def __init__(self, sheets):
        self._measurements = {i: [] for i in range(sheets)}
        self._current_page = 0
        self._preview_key = None
        self._takeoff_list_active = ""      # Main, as the web always is
        self._palette_index = 0
        self._pending_item_name = ""
        self._pending_catalog = None
        self._pending_framing = None
        self._count_target = None
        self._count_spec = None
        self._count_answers = None
        self._count_category = ""
        self._count_named = ""
        self._count_left = []
        self._undo = []
        self._redo = []
        self.measurement_changed = _Sig()
        self.tool_opts_mode = None
        self.mode = "pan"

    # -- _restore_state's count part, as the desktop does it --
    def _restore(self, store):
        armed = self._armed_count_place()
        held_left = [self._count_place_now(m) for m in (self._count_left or [])]
        self._measurements = copy.deepcopy(store)
        self._rearm_count(armed)
        back = []
        for p in held_left:
            f = self._count_found_again(p)
            if f is not None and f is not self._count_target and not any(f is g for g in back):
                back.append(f)
        self._count_left = back

    def undo(self):
        if self._undo:
            self._redo.append(copy.deepcopy(self._measurements))
            self._restore(self._undo.pop())

    def redo(self):
        if self._redo:
            self._undo.append(copy.deepcopy(self._measurements))
            self._restore(self._redo.pop())

    # -- the window around it: ToolNameBox.clear_name, set_mode, _arm_count_item --
    def clear_name(self):
        self._pending_item_name = ""
        self._count_category = ""

    def set_mode(self, mode, answer=None, carry=None):
        if mode == "count":
            existing = [m for m in self.layer_items(self._current_page) if m.get("type") == "count"]
            FORM["asked"] += 1
            if carry is not None:
                if carry >= len(existing):
                    return False
                self.arm_count(existing[carry], None)
            elif answer:
                self.arm_count(None, {"name": answer["name"], "notes": "", "color": [0.0, 0.5, 0.5],
                                      "purpose": "", "floor_level": answer["floor"],
                                      "category": answer.get("cat", "Electrical"),
                                      "sub_category": "", "cost_type": "material",
                                      "unit_cost": 0.0, "catalog": None})
            else:
                return False
        self.mode = mode
        # _sync_tool_options: a tool picked up from another tool empties the box
        if mode == "pan":
            self.tool_opts_mode = None
            self.clear_name()
        elif self.tool_opts_mode != mode:
            self.tool_opts_mode = mode
            self.clear_name()
        return True


def snap(c):
    rows = []
    for pg, lst in sorted(c._measurements.items()):
        for m in lst:
            if m.get("type") == "count":
                # ...and its takeoff ("" = Main), as takeoff_list_of reads it
                rows.append([pg, m.get("name"), m.get("floor_level"), str(m.get("rev_id") or ""),
                             len(m.get("points") or []), takeoff_list_of(m)])
    t = c._count_target
    where = None
    if t is not None:
        for pg, lst in c._measurements.items():
            if any(x is t for x in lst):
                where = [pg, t.get("name"), t.get("floor_level"), str(t.get("rev_id") or ""),
                         len(t.get("points") or [])]
    return {"rows": rows, "asked": FORM["asked"], "target": where,
            "box": (c._pending_item_name or "").strip()}


def run(ops, sheets, items=None):
    FORM["asked"] = 0
    FORM["answer"] = None
    c = Canvas(sheets)
    for k, lst in (items or {}).items():
        c._measurements[int(k)] = copy.deepcopy(lst)
    spot = [0]
    out = []
    for op in ops:
        k = op[0]
        if k == "arm":
            c.set_mode("count", answer={"name": op[1], "floor": op[2]})
        elif k == "carry":
            c.set_mode("count", carry=op[1])
        elif k == "pan":
            c.set_mode("pan")
        elif k == "tap":
            if c.mode == "count":
                FORM["answer"] = {"name": op[1], "floor": op[2]} if len(op) > 1 and op[1] else None
                spot[0] += 1
                c._add_count_point([300.0 + spot[0] * 7, 300.0])
                FORM["answer"] = None
        elif k == "undo":
            c.undo()
        elif k == "redo":
            c.redo()
        elif k == "go":
            c._current_page = op[1]
            c._preview_key = None
        elif k == "ver":
            c._preview_key = (op[1], 0) if op[1] else None
        elif k == "type" and c.mode == "count":
            if op[1] == "":
                c.clear_name()
            else:
                c._pending_item_name = op[1]
        elif k == "rename":
            cs = [m for m in c._measurements.get(c._current_page, []) if m.get("type") == "count"]
            if op[1] < len(cs):
                c._push_undo()
                cs[op[1]]["name"] = cs[op[1]]["label"] = op[2]
        elif k == "delete":
            cs = [m for m in c._measurements.get(c._current_page, []) if m.get("type") == "count"]
            if op[1] < len(cs):
                c._push_undo()
                gone = cs[op[1]]
                c._measurements[c._current_page] = [m for m in c._measurements[c._current_page]
                                                     if m is not gone]
        out.append(snap(c))
    return out


sessions = json.load(sys.stdin)
json.dump({"lifted": METHODS + ATTRS + MODULE_LIFTED,
           "steps": [run(s["ops"], s.get("sheets", 2), s.get("items")) for s in sessions]},
          sys.stdout)
