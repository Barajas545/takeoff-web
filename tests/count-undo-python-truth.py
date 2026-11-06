"""Ground truth for the COUNT TOOL across a Ctrl+Z, taken from the desktop app.

Desktop 3.07 keeps the count when a Ctrl+Z or Ctrl+Y lands in the middle of
one. Two parts of that write the file and are lifted here BY TEXT (through
`ast`, so a method is exactly its own lines) and run as the methods of a
small stand-in class, so the browser port is held to the desktop's own code
rather than to a transcription of it:

  * GLPageWidget._rearm_count, with _COUNT_TEMPLATE and CLASS_FIELDS: what
    the next tap makes a count again from once a step took it off the sheet
    -- the answers it was armed with, or, carried on, its own fields, filed
    where the item was filed last, with its framing answers;
  * GLPageWidget.arm_count and forget_armed_count: what a new choice, and a
    job switch, leave of the tool's state (the answers, the name it showed,
    the counts held on other sheets);
  * GLPageWidget._inherit_count_framing (with item_rev_id and the module's
    page_sort_key): which counts the desktop hands Posts/Hardware framing
    over FROM when a new count is made -- the web, which cannot hand it
    over, asks or says so on exactly those (ToolController._framedSource).
    Whether a count is on a drawing the job is priced from is the web's own
    CountingModel.itemCountsTowards, handed in (revision-counting holds that
    to the desktop); the rule here is everything else: the name, the
    framing, this drawing or another, the order the sheets are asked in.

Not lifted: _count_found_again and its likeness ranking. The web finds the
count again by its runtime _uid, which a restore keeps and no other item
carries; the stand-in answers "not found", which is the branch that writes.

THE LIFTED SET MUST BE A CLOSURE, checked BEFORE anything runs: every
`self.<name>` a lifted method touches is another lifted method, a lifted
class attribute or a DECLARED stub, and every free name it reads is a
builtin, a lifted module function (page_sort_key) or a DECLARED stand-in
(_framing: the framing engine, present).

And the SECTIONS of the desktop's own tests/test_count_undo.py, read by text
(the same `ast`), so tests/count-undo.mjs can refuse a section it has
neither ported nor said why it cannot.

Usage: python -B count-undo-python-truth.py [pdf_fast_viewer.py] < cases.json
(PTT_DESKTOP_SRC when no path is given). Prints JSON.
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
METHODS = ["_rearm_count", "arm_count", "forget_armed_count",
           "_inherit_count_framing", "item_rev_id"]
ATTRS = ["_COUNT_TEMPLATE", "CLASS_FIELDS"]
MODULE_FUNCS = ["page_sort_key"]
# The stand-in's data, and the things that are not this file's to run: the
# likeness ranking (the web uses _uid), the Item box (recorded), the window
# (it answers "is this priced?" with the web's own answer), the framing
# engine and the status line (recorded).
STUBS = {"_count_target", "_count_spec", "_count_answers", "_count_category",
         "_count_named", "_count_left", "_count_found_again",
         "_sync_tool_name", "_current_page", "_measurements", "_main_window",
         "recompute_framing", "_sheet_name", "_framing_status"}


class _FramingEngine:
    """framing.py, present: _inherit_count_framing hands nothing over without it."""


STAND_INS = {"_framing": _FramingEngine()}

text = open(SRC, encoding="utf-8").read()
lines = text.splitlines(True)
tree = ast.parse(text)
cls = next((n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == CLASS), None)
if cls is None:
    raise SystemExit("no class %s in %s" % (CLASS, SRC))


def segment(node, where):
    """A function's own lines, with its decorators -- builtin ones only
    (item_rev_id is a staticmethod), which need nothing else lifted."""
    for d in node.decorator_list:
        if not (isinstance(d, ast.Name) and d.id in ("staticmethod", "classmethod", "property")):
            raise SystemExit("%s.%s has a decorator this cannot lift" % (where, node.name))
    first = node.decorator_list[0].lineno if node.decorator_list else node.lineno
    return textwrap.dedent("".join(lines[first - 1:node.end_lineno]))


bodies, attrs, funcs = {}, {}, {}
for node in cls.body:
    if isinstance(node, ast.FunctionDef) and node.name in METHODS:
        bodies[node.name] = segment(node, CLASS)
    if (isinstance(node, ast.Assign) and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Name)
            and node.targets[0].id in ATTRS):
        attrs[node.targets[0].id] = ast.literal_eval(node.value)
for node in tree.body:
    if isinstance(node, ast.FunctionDef) and node.name in MODULE_FUNCS:
        funcs[node.name] = segment(node, "module")
missing = (sorted(set(METHODS) - set(bodies)) + sorted(set(ATTRS) - set(attrs))
           + sorted(set(MODULE_FUNCS) - set(funcs)))
if missing:
    raise SystemExit("not found in %s.%s: %s" % (SRC, CLASS, ", ".join(missing)))

# ── the closure check ─────────────────────────────────────────────────────
allowed_self = set(METHODS) | set(ATTRS) | STUBS
allowed_free = set(MODULE_FUNCS) | set(STAND_INS)
problems = []
for name, body in list(bodies.items()) + list(funcs.items()):
    fn = ast.parse(body).body[0]
    touched = {n.attr for n in ast.walk(fn)
               if isinstance(n, ast.Attribute) and isinstance(n.value, ast.Name)
               and n.value.id == "self"}
    for t in sorted(touched - allowed_self):
        problems.append("%s reaches self.%s, which is neither lifted nor a "
                        "declared stub" % (name, t))
    bound = {a.arg for a in fn.args.args + fn.args.kwonlyargs}
    for n in ast.walk(fn):
        if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store):
            bound.add(n.id)
        elif isinstance(n, (ast.Import, ast.ImportFrom)):
            for a in n.names:
                bound.add((a.asname or a.name).split(".")[0])
        elif isinstance(n, ast.comprehension):
            for m in ast.walk(n.target):
                if isinstance(m, ast.Name):
                    bound.add(m.id)
        elif isinstance(n, ast.Lambda):          # key=lambda o: ...
            bound.update(a.arg for a in n.args.args + n.args.kwonlyargs)
        elif isinstance(n, ast.ExceptHandler) and n.name:
            bound.add(n.name)
    free = {n.id for n in ast.walk(fn) if isinstance(n, ast.Name)
            and isinstance(n.ctx, ast.Load)} - bound - {"self"}
    # a module function may read only builtins: it is lifted on its own
    for f in sorted(free):
        if not hasattr(builtins, f) and (name in funcs or f not in allowed_free):
            problems.append("%s reads the module-level name %s, which is not "
                            "lifted" % (name, f))
if problems:
    raise SystemExit("the lifted set is not a closure:\n  " + "\n  ".join(problems))

# One globals for everything lifted: the module functions and the declared
# stand-ins, and nothing else of the desktop's module.
G = dict(STAND_INS)
for body in funcs.values():
    exec(compile(body, "<module.lifted>", "exec"), G)
ns = {}
for body in bodies.values():
    exec(compile(body, "<%s.%s>" % (CLASS, "lifted"), "exec"), G, ns)


class Stand:
    """The count tool's state, and nothing else."""

    def __init__(self):
        self._count_target = None
        self._count_spec = None
        self._count_answers = None
        self._count_category = ""
        self._count_named = ""
        self._count_left = []
        self.synced = []

    def _count_found_again(self, place):
        return None                  # the web finds it by _uid instead

    def _sync_tool_name(self, name):
        self.synced.append(name)

    # _inherit_count_framing's world: the store, the sheet on screen, the
    # window that says what is priced, the engine and the status bar.
    _current_page = 0
    _measurements = {}
    win = None
    said = None

    def _main_window(self):
        return self.win

    def recompute_framing(self, m):
        pass                         # the engine's arithmetic: not the rule

    def _sheet_name(self, pg):
        return "sheet %s" % (pg + 1)

    def _framing_status(self, text):
        self.said = text


class Window:
    """The window around the canvas, as far as _inherit_count_framing asks:
    is this count on a drawing the job is priced from (the web's answer,
    handed in by page and list position), and a revision's name."""

    def __init__(self, store, priced):
        self._at = {id(m): (pg, i) for pg, lst in store.items() for i, m in enumerate(lst)}
        self._priced = priced

    def item_counts_towards(self, pg, m):
        p, i = self._at[id(m)]
        return bool(self._priced[str(p)][i])

    def revision_label(self, rid):
        return "REV " + str(rid)


for k, v in attrs.items():
    setattr(Stand, k, v)
for k in METHODS:
    setattr(Stand, k, ns[k])


def state(g, target=None, spec=None):
    """The tool's state, in words the web can be compared with."""
    return {
        "target": ("the target" if g._count_target is target and target is not None
                   else None if g._count_target is None else "another"),
        "spec": g._count_spec,
        "specIsGiven": spec is not None and g._count_spec is spec,
        "answers": g._count_answers,
        "answersAreSpec": g._count_answers is g._count_spec,
        "category": g._count_category,
        "named": g._count_named,
        "left": len(g._count_left or []),
        "synced": list(g.synced),
    }


cases = json.loads(sys.stdin.read() or "{}")
out = {"COUNT_TEMPLATE": list(attrs["_COUNT_TEMPLATE"]),
       "CLASS_FIELDS": list(attrs["CLASS_FIELDS"]),
       "lifted": METHODS + ATTRS + MODULE_FUNCS, "rearm": [], "arm": [], "forget": None,
       "inherit": []}

# _rearm_count: `place` as _armed_count_place reads it before the swap.
# where: "taken" (it was on page 0, the step took it off), "gone" (in no page
# list before this step either), "none" (nothing armed).
for c in cases.get("rearm", []):
    g = Stand()
    t = copy.deepcopy(c["target"])
    g._count_target = None if c["where"] == "none" else t
    g._count_spec = copy.deepcopy(c.get("spec"))
    g._count_answers = copy.deepcopy(c["answers"])
    place = (None if c["where"] == "none"
             else (t, 0, 0, [t]) if c["where"] == "taken"
             else (t, None, None, None))
    g._rearm_count(place)
    out["rearm"].append({"spec": g._count_spec, "answers": g._count_answers,
                         "specIsAnswers": g._count_spec is not None
                         and g._count_spec is g._count_answers,
                         "target": g._count_target is t})

for c in cases.get("arm", []):
    g = Stand()
    g._count_left = [{"type": "count", "name": "held"}]
    target = copy.deepcopy(c.get("target"))
    spec = copy.deepcopy(c.get("spec"))
    g.arm_count(target, spec)
    out["arm"].append(state(g, target, spec))

g = Stand()
g._count_target = {"type": "count", "name": "Outlets"}
g._count_spec = {"name": "Outlets"}
g._count_answers = g._count_spec
g._count_category = "Outlets"
g._count_named = "Outlets"
g._count_left = [{"type": "count", "name": "Switches"}]
g.forget_armed_count()
out["forget"] = state(g)

# _inherit_count_framing: a NEW count called `name` made on sheet `cur`, on
# the drawing `rid` ('' = the sheet's own), put on the store first as
# _add_count_point does. Which count hands its framing over, if any: every
# framed count in a case carries its own place in framing["src"].
for c in cases.get("inherit", []):
    g = Stand()
    store = {int(k): copy.deepcopy(v) for k, v in c["store"].items()}
    item = {"type": "count", "name": c["name"], "points": [[1.0, 1.0]], "value": 1}
    if c["rid"]:
        item["rev_id"] = c["rid"]
    store.setdefault(c["cur"], []).append(item)
    g._measurements = store
    g._current_page = c["cur"]
    g.win = Window(store, c["priced"])     # the new count itself is never asked
    got = g._inherit_count_framing(item)
    out["inherit"].append({"inherited": bool(got),
                           "from": (item.get("framing") or {}).get("src") if got else None,
                           "said": g.said})

# ── the desktop's own test sections, by text ──────────────────────────────
tests = os.path.join(os.path.dirname(os.path.abspath(SRC)), "tests",
                     "test_count_undo.py")
out["sections"] = None
if os.path.exists(tests):
    ttree = ast.parse(open(tests, encoding="utf-8").read())
    for node in ttree.body:
        if (isinstance(node, ast.Assign) and len(node.targets) == 1
                and isinstance(node.targets[0], ast.Name)
                and node.targets[0].id == "SECTIONS"):
            out["sections"] = [e.elts[0].value for e in node.value.elts
                               if isinstance(e, ast.Tuple) and e.elts
                               and isinstance(e.elts[0], ast.Constant)]
print(json.dumps(out))
