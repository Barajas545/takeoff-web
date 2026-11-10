"""Ground truth for TAKEOFF LISTS (desktop 3.08), taken from the desktop app.

A job can hold several takeoffs: an item filed in one other than Main
carries the tag `takeoff_list`, and the job's list of them is its metadata
(takeoff_lists, takeoff_list_active, takeoff_main_label). The web reads both
with js/core/takeoff-lists.js, and a reading that differs from the desktop's
by one character -- a tag padded with a character one side calls whitespace,
a name one side cuts at 60 UTF-16 units and the other at 60 code points --
puts an item in a different takeoff on the two screens.

So the readings are not re-typed here. The desktop's own definitions are
lifted out of pdf_fast_viewer.py BY TEXT (through `ast`, so a definition is
exactly its own lines) and run on a corpus of edge cases:

  * the module's takeoff_list_scoped, takeoff_list_of, in_takeoff_list,
    _set_takeoff_list, clean_takeoff_name, free_takeoff_name,
    takeoff_where_words, takeoff_others_moved_words and set_takeoff_naming
    (and everything they reach: the closure walk finds it);
  * PDFCacheViewer's takeoff_lists, takeoff_list_label, has_takeoff_lists,
    _takeoff_naming_now, _takeoff_items and active_takeoff_list, as the
    methods of a stand-in window holding `metadata`;
  * GLPageWidget's active_takeoff_list, set_active_takeoff_list and
    in_active_list, as the methods of a stand-in canvas holding the store.

THE LIFTED SET MUST BE A CLOSURE, checked before anything runs: every
module name a lifted body reads is lifted too (defs AND assignments,
breadth first, exec'd in source order), and every `self.<x>` a lifted
method reads is a lifted method or a declared stub.

These names exist only in the 3.08 desktop. Against an older source this
stops with one line saying so -- not with "could not find".

tests/takeoff-lists-parity.mjs runs js/core/takeoff-lists.js on the same
corpus, from the committed tests/data/takeoff-lists-truth.json on a fresh
clone and live against this script when the desktop source is here.

Usage:
  python -B tests/takeoff-lists-python-truth.py [pdf_fast_viewer.py]          JSON to stdout
  python -B tests/takeoff-lists-python-truth.py [pdf_fast_viewer.py] --write  rewrite the snapshot
(PTT_DESKTOP_SRC when no path is given.)
"""
import ast
import builtins
import copy
import json
import os
import sys
import textwrap

ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
WRITE = "--write" in sys.argv[1:]
SRC = ARGS[0] if ARGS else os.environ.get("PTT_DESKTOP_SRC", "")
if not SRC or not os.path.exists(SRC):
    raise SystemExit("Give pdf_fast_viewer.py (argument or PTT_DESKTOP_SRC).")
SNAPSHOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data",
                        "takeoff-lists-truth.json")

MODULE_SEED = ["takeoff_list_scoped", "takeoff_list_of", "in_takeoff_list",
               "_set_takeoff_list", "clean_takeoff_name", "free_takeoff_name",
               "takeoff_where_words", "takeoff_others_moved_words",
               "set_takeoff_naming", "TAKEOFF_LIST_KEY",
               "MAIN_TAKEOFF_LABEL", "TAKEOFF_NAME_MAX"]
WIN_METHODS = ["takeoff_lists", "takeoff_list_label", "has_takeoff_lists",
               "_takeoff_naming_now", "_takeoff_items", "active_takeoff_list"]
WIN_STUBS = {"metadata", "gl_widget"}
GL_METHODS = ["active_takeoff_list", "set_active_takeoff_list",
              "in_active_list"]
GL_STUBS = {"_measurements", "_takeoff_list_active"}

with open(SRC, "r", encoding="utf-8") as fh:
    DESK = fh.read()
TREE = ast.parse(DESK)
LINES = DESK.splitlines(True)

TOP = {}
ORDER = {}
for _i, _n in enumerate(TREE.body):
    if isinstance(_n, (ast.FunctionDef, ast.ClassDef)):
        TOP.setdefault(_n.name, _n)
        ORDER.setdefault(_n.name, _i)
    elif isinstance(_n, ast.Assign):
        for _t in _n.targets:
            if isinstance(_t, ast.Name):
                TOP.setdefault(_t.id, _n)
                ORDER.setdefault(_t.id, _i)


def _class(name):
    node = TOP.get(name)
    return node if isinstance(node, ast.ClassDef) else None


def _member(cls, name):
    for n in (cls.body if cls is not None else []):
        if isinstance(n, ast.FunctionDef) and n.name == name:
            return n
    return None


# ── 3.08 or nothing: one line, not "could not find" ──────────────────────
_GL, _WIN = _class("GLPageWidget"), _class("PDFCacheViewer")
_absent = ([n for n in MODULE_SEED if n not in TOP]
           + ["PDFCacheViewer." + n for n in WIN_METHODS
              if _member(_WIN, n) is None]
           + ["GLPageWidget." + n for n in GL_METHODS
              if _member(_GL, n) is None])
if _absent:
    raise SystemExit(
        "tests/takeoff-lists-python-truth.py needs the desktop 3.08 source "
        "(PTT_DESKTOP_SRC): %s has no takeoff lists (missing %s)"
        % (SRC, ", ".join(_absent[:3]) + (" ..." if len(_absent) > 3 else "")))


def _text(node):
    first = min([node.lineno] + [d.lineno for d in
                                 getattr(node, "decorator_list", [])])
    return textwrap.dedent("".join(LINES[first - 1:node.end_lineno]))


def _locals(fn):
    out = {a.arg for a in fn.args.args + fn.args.kwonlyargs
           + fn.args.posonlyargs}
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
    """self.<x>, and the canvas's through self.gl_widget.<x> / gl.<x>."""
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
                and isinstance(s.args[1], ast.Constant):
            tgt = s.args[0]
            if isinstance(tgt, ast.Name) and tgt.id == "self":
                out_self.add(s.args[1].value)
            elif isinstance(tgt, ast.Name) and tgt.id == "gl":
                out_gl.add(s.args[1].value)
    return out_self, out_gl


def closure():
    problems, want = [], set(MODULE_SEED)
    gl_known = set(GL_METHODS) | GL_STUBS
    for name in GL_METHODS:
        fn = _member(_GL, name)
        s, _g = _self_attrs(fn)
        for a in sorted(s - gl_known):
            problems.append("GLPageWidget.%s reads self.%s" % (name, a))
        want |= _free(fn)
    for name in WIN_METHODS:
        fn = _member(_WIN, name)
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
        node = TOP.get(nm)
        if node is None:
            if not hasattr(builtins, nm):
                problems.append("a lifted body reads %s, which is neither "
                                "a module name nor a builtin" % nm)
            continue
        if isinstance(node, ast.ClassDef):
            problems.append("a lifted body reads the class %s" % nm)
            continue
        lifted.append(nm)
        for sub in sorted(_free(node)):
            if sub not in seen:
                queue.append(sub)
    if problems:
        raise SystemExit("the lifted set is not a closure:\n  "
                         + "\n  ".join(problems))
    return lifted


LIFTED = closure()
NS = {"__builtins__": builtins}
_done = set()
for _nm in sorted(LIFTED, key=lambda n: ORDER[n]):
    _node = TOP[_nm]
    if id(_node) in _done:
        continue
    _done.add(id(_node))
    exec(compile(_text(_node), "<%s>" % _nm, "exec"), NS)


def _as_methods(cls, names):
    out = {}
    for name in names:
        ns = dict(NS)
        exec(compile(_text(_member(cls, name)), "<%s.%s>" % (cls.name, name),
                     "exec"), ns)
        out[name] = ns[name]
    return out


GL = type("GL", (), _as_methods(_GL, GL_METHODS))
Win = type("Win", (), _as_methods(_WIN, WIN_METHODS))


def canvas(store=None, active=""):
    g = GL()
    g._measurements = store if store is not None else {}
    g._takeoff_list_active = ""
    g.set_active_takeoff_list(active)
    return g


def window(md, store=None, active=""):
    w = Win()
    w.metadata = md
    w.gl_widget = canvas(store, active)
    return w


# ── the corpus ────────────────────────────────────────────────────────────

DECK, PATIO = "tl-1a2b3c4d", "tl-0000beef"
PADS = ["", " ", "\t", "\n", "\x1c", "\x1f", "\xa0", "　", " ",
        "\x85", "﻿", "​"]
TAGS = ([DECK, " %s " % DECK, "%s\n" % DECK, PATIO, "Deck", "tl-9", "5x"]
        + [p + DECK + p for p in PADS[2:]]
        + ["", " ", "\x1c\x1f", "\xa0", "﻿", "​", 0, False, None,
           5, 1.5, -2])
TYPES = ["area", "polyline", "count", "linear_count", "standalone",
         "window", "door", "partition", "header", "distance", "textnote",
         "page_ref", "pitch", "group", "ref_distance", "", None, "custom"]

items = []
for t in TYPES:
    items.append({"type": t})
    for tag in TAGS:
        items.append({"type": t, "takeoff_list": tag})
items += [{}, {"takeoff_list": DECK}, {"type": "area", "group_child": True,
                                       "takeoff_list": DECK}]
NOT_DICTS = [None, [], [{"type": "area", "takeoff_list": DECK}], "area", 0,
             5, True]
IDS = ["", " ", "\x1c", "﻿", DECK, " %s " % DECK, "\xa0%s" % DECK,
       "﻿%s" % DECK, PATIO, None, 0, False, 5, "5"]

predicates = []
for m in items + NOT_DICTS:
    predicates.append({
        "m": m,
        "scoped": NS["takeoff_list_scoped"](m),
        "of": NS["takeoff_list_of"](m),
        "in": [NS["in_takeoff_list"](m, i) for i in IDS],
        # the canvas's own view test, in each takeoff he could be in
        "view": [canvas(active=i).in_active_list(m) for i in IDS],
    })

setters = []
for t in ["area", "standalone", "group", "textnote", "distance", "page_ref"]:
    for start in [None, DECK, " %s " % DECK]:
        for i in IDS:
            d = {"type": t, "name": "x"}
            if start is not None:
                d["takeoff_list"] = start
            before = copy.deepcopy(d)
            NS["_set_takeoff_list"](d, i)
            setters.append({"d": before, "id": i, "after": d})
for nd in [None, [], "area", 5]:
    for i in [DECK, ""]:
        before = copy.deepcopy(nd)
        NS["_set_takeoff_list"](nd, i)
        setters.append({"d": before, "id": i, "after": nd})

NAMES = ["Deck", "  Deck  ", "Deck\n2", "Deck  2", "Deck\t\t2", "", " ",
         None, 0, False, 5, 1.5, "///", "?", "—", "-", "_", "x" * 59,
         "x" * 60, "x" * 61, "x" * 70, "a" * 59 + " b", "a" * 58 + "  bc",
         "Déck", "Straße", "\U0001d507eck", "\U0001d507" * 61,
         "\U0001d507" * 59 + " x", "\U0001f3e0", "\U0001f3e0 Deck",
         "Deck\xa0Two", "　Deck　", "\x1cDeck\x1f", "﻿Deck",
         "﻿", "\x85", "٢", "Ⅻ", "½", "é",
         "́", "​", "​Deck", "Main", "main", "MAIN", "House",
         "İstanbul", "Σας", "ﬃce", "Patio  (2)",
         "Patio (2)"]
cleaned = [{"s": s, "out": NS["clean_takeoff_name"](s)} for s in NAMES]

FREE = [("Deck", []), ("Deck", ["deck"]), ("Deck", ["DECK", "Deck (2)"]),
        ("Deck", ["deck", "deck (2)", "DECK (3)"]), ("Deck 2", ["Deck  2"]),
        ("Deck  2", ["Deck 2"]), ("Deck", [" deck "]),
        ("Deck", ["\xa0deck\xa0"]), ("Deck", ["﻿deck"]),
        ("Deck", [None, 0, "", "deck"]), ("x" * 60, ["x" * 60]),
        ("x" * 60, ["x" * 60, "x" * 56 + " (2)"]),
        ("x" * 57 + " y", ["x" * 57 + " y"]),
        # the cut for " (2)" lands on a space: rstrip()ped before the tail
        ("x" * 55 + " yyyy", ["x" * 55 + " yyyy"]),
        ("\U0001d507" * 55 + " yyyy", ["\U0001d507" * 55 + " yyyy"]),
        ("", ["Takeoff"]),
        (None, []), ("///", ["takeoff"]), ("Straße", ["STRASSE"]),
        ("Main", ["main"]), ("\U0001d507" * 60, ["\U0001d507" * 60]),
        ("Σας", ["σασ"]),
        ("ﬃce", ["FFICE"]), ("Office", ["oﬃce"]),
        ("Deck", ("deck",)), ("Deck", [])]
free = [{"s": s, "taken": list(t), "out": NS["free_takeoff_name"](s, t)}
        for s, t in FREE]

REG = [{"list_id": DECK, "label": "Deck"},
       {"list_id": PATIO, "label": "Patio"}]
METAS = [
    {},
    {"takeoff_lists": []},
    {"takeoff_lists": {}},
    {"takeoff_lists": REG},
    {"takeoff_lists": REG, "takeoff_main_label": "House"},
    {"takeoff_lists": REG, "takeoff_main_label": "  House  "},
    {"takeoff_lists": REG, "takeoff_main_label": "///"},
    {"takeoff_lists": REG, "takeoff_main_label": ""},
    {"takeoff_lists": REG, "takeoff_main_label": None},
    {"takeoff_lists": REG, "takeoff_main_label": "x" * 70},
    {"takeoff_lists": REG, "takeoff_main_label": "deck"},
    {"takeoff_main_label": "House"},
    {"takeoff_lists": {DECK: "Deck", PATIO: "Patio"}},
    {"takeoff_lists": {DECK: {"label": "Deck", "color": [1, 0, 0]},
                       PATIO: {"label": "Patio", "list_id": "ignored"}}},
    {"takeoff_lists": {DECK: None, PATIO: 5}},
    {"takeoff_lists": [{"list_id": DECK, "label": "Deck"},
                       {"list_id": DECK, "label": "Again"},
                       {"list_id": " %s " % DECK, "label": "Padded"}]},
    {"takeoff_lists": [{"list_id": "", "label": "No id"},
                       {"list_id": None, "label": "Null id"},
                       {"label": "Missing id"}, {"list_id": " ", "label": "x"},
                       {"list_id": DECK, "label": "Deck"}]},
    {"takeoff_lists": [{"list_id": DECK, "label": ""},
                       {"list_id": PATIO},
                       {"list_id": "tl-3", "label": "///"},
                       {"list_id": "tl-4", "label": None}]},
    {"takeoff_lists": [{"list_id": DECK, "label": "main"}]},
    {"takeoff_lists": [{"list_id": DECK, "label": "house"}],
     "takeoff_main_label": "House"},
    {"takeoff_lists": [{"list_id": DECK, "label": "Deck  2"},
                       {"list_id": PATIO, "label": "Deck 2"}]},
    {"takeoff_lists": [{"list_id": DECK, "label": "Deck"},
                       {"list_id": PATIO, "label": "deck"},
                       {"list_id": "tl-3", "label": "DECK"},
                       {"list_id": "tl-4", "label": "Deck (2)"}]},
    {"takeoff_lists": [{"list_id": DECK, "label": "y" * 80},
                       {"list_id": PATIO, "label": "y" * 61}]},
    {"takeoff_lists": [{"list_id": DECK, "label": "\U0001d507eck \U0001f3e0"},
                       {"list_id": PATIO, "label": "\U0001f3e0"}]},
    {"takeoff_lists": [{"list_id": DECK, "label": "Deck", "made": "x",
                        "n": 3}]},
    {"takeoff_lists": ["Deck", 5, None, [DECK, "Deck"],
                       {"list_id": PATIO, "label": "Patio"}]},
    {"takeoff_lists": [{"list_id": 5, "label": "Five"},
                       {"list_id": 1.5, "label": "One and a half"},
                       {"list_id": 0, "label": "Zero"},
                       {"list_id": False, "label": "False"}]},
    {"takeoff_lists": [{"list_id": "﻿" + DECK, "label": "Feff"},
                       {"list_id": "\xa0" + DECK + "\x1c", "label": "Nbsp"}]},
    {"takeoff_lists": "Deck"},
    {"takeoff_lists": 5},
    {"takeoff_lists": None},
    {"takeoff_lists": REG, "takeoff_list_active": DECK},
    {"takeoff_lists": REG, "takeoff_list_active": " %s " % DECK},
    {"takeoff_lists": REG, "takeoff_list_active": "tl-gone"},
]
LABEL_IDS = ["", " ", DECK, " %s " % DECK, "﻿" + DECK, PATIO, "tl-3",
             "tl-4", "5", "1.5", "0", "tl-gone", None, 0, 5]

registries = []
for md in METAS:
    before = copy.deepcopy(md)
    w = window(md)
    naming = w._takeoff_naming_now()
    out = {
        "md": before,
        "lists": w.takeoff_lists(),
        "labels": [w.takeoff_list_label(i) for i in LABEL_IDS],
        "has": w.has_takeoff_lists(),
        # (the takeoff he is in, {id: name}) as pairs: an object's
        # integer-like keys would sort first in JavaScript
        "naming": (None if naming is None
                   else [naming[0], [[k, v] for k, v in naming[1].items()]]),
        "naming_in_deck": None,
    }
    nd = window(md, active=DECK)._takeoff_naming_now()
    if nd is not None:
        out["naming_in_deck"] = [nd[0], [[k, v] for k, v in nd[1].items()]]
    # the desktop reads metadata; it never writes it while reading
    assert md == before, md
    registries.append(out)


# Values str() spells its own way, which py-json reads out of a file (bare
# NaN / Infinity / -Infinity, true) and JSON cannot carry: recorded by NAME
# and made again on each side. NaN is the one that moves an item: Python
# calls float('nan') TRUE, so str(x or "") reads 'nan' -- another takeoff,
# never Main.
SPECIALS = {"nan": float("nan"), "inf": float("inf"),
            "-inf": float("-inf"), "True": True}
specials = []
for name, v in SPECIALS.items():
    for t in ["area", "standalone", "group", "textnote", "page_ref"]:
        m = {"type": t, "takeoff_list": v}
        d = {"type": t, "name": "x", "takeoff_list": DECK}
        NS["_set_takeoff_list"](d, v)
        asked = [{"type": t}, {"type": t, "takeoff_list": "nan"},
                 {"type": t, "takeoff_list": "True"},
                 {"type": t, "takeoff_list": DECK}]
        specials.append({
            "value": name, "type": t,
            "of": NS["takeoff_list_of"](m),
            "in": [NS["in_takeoff_list"](m, i) for i in IDS],
            "view": [canvas(active=i).in_active_list(m) for i in IDS],
            # the special as the takeoff asked about
            "asked": [NS["in_takeoff_list"](x, v) for x in asked],
            "set": d,
        })
    md = {"takeoff_lists": [{"list_id": v, "label": "Odd"},
                            {"list_id": DECK, "label": "Deck"}],
          "takeoff_list_active": v}
    w = window(md)
    nm = w._takeoff_naming_now()
    specials.append({
        "value": name, "type": "registry",
        "lists": w.takeoff_lists(),
        "labels": [w.takeoff_list_label(i) for i in [v, "nan", "True", DECK]],
        "naming": [nm[0], [[k, x] for k, x in nm[1].items()]],
        "naming_in": (lambda n: [n[0], [[k, x] for k, x in n[1].items()]])(
            window(md, active=v)._takeoff_naming_now()),
    })


# ...and as NAMES (review2): clean_takeoff_name reads str(name or ""), so a
# NaN / Infinity / true Main's name or label is 'nan', 'inf', 'True' there --
# never 'Main' or 'Takeoff 2'.
special_names = []
for name, v in SPECIALS.items():
    md = {"takeoff_lists": [{"list_id": DECK, "label": v},
                            {"list_id": PATIO, "label": v}],
          "takeoff_main_label": v}
    w = window(md)
    nm = w._takeoff_naming_now()
    special_names.append({
        "value": name,
        "clean": NS["clean_takeoff_name"](v),
        # free_takeoff_name(name, taken), the special as each
        "free": [NS["free_takeoff_name"](v, []),
                 NS["free_takeoff_name"](v, [v]),
                 NS["free_takeoff_name"]("nan", [v]),
                 NS["free_takeoff_name"]("True", [v]),
                 NS["free_takeoff_name"]("inf", [v])],
        "lists": w.takeoff_lists(),
        "labels": [w.takeoff_list_label(i) for i in ["", DECK, PATIO]],
        "naming": [nm[0], [[k, x] for k, x in nm[1].items()]],
    })


# Tags, ids and names that are not text at all -- a list or a dict, which a
# hand or another build can leave and JSON carries as it is (review2). str()
# spells them Python's way: "['']" is another takeoff, never Main; [] and {}
# are Main; a promoted run is handed "{'a': 1}", never "[object Object]".
# Recorded as values, with the items and ids each was asked against, so the
# web side computes no Python of its own.
STRUCTURED = [
    [""], [" "], [], {}, {"a": 1}, [[]], [None], [DECK], [" %s " % DECK],
    {"b": [1, 2.5, None, True, False]}, ["it's"], ['say "hi"'],
    ["it's \"both\""], ["a\nb\tc\rd\\e"], ["\x00\x1f\x7f"],
    ["\x85\xa0\xe9\u200b\u2028\ufeff\u0378"], ["\U0001f3e0", "\U000e0001"],
    [0.1, 1e-07, 1.5e+300, -2.5, 0, -7], [{"k": [{}]}], {"x y": "z", "": None},
    ["Deck"], {"Deck": "Deck"}, [False], [0], [""] * 3,
]
structured = []
for v in STRUCTURED:
    for t in ["area", "standalone", "group", "textnote", "page_ref"]:
        m = {"type": t, "takeoff_list": copy.deepcopy(v)}
        d = {"type": t, "name": "x", "takeoff_list": DECK}
        NS["_set_takeoff_list"](d, copy.deepcopy(v))
        asked = [{"type": t}, {"type": t, "takeoff_list": copy.deepcopy(v)},
                 {"type": t, "takeoff_list": str(v)},
                 {"type": t, "takeoff_list": DECK}]
        structured.append({
            "value": v, "type": t,
            "of": NS["takeoff_list_of"](m),
            "in": [NS["in_takeoff_list"](m, i) for i in IDS],
            "view": [canvas(active=i).in_active_list(m) for i in IDS],
            "asked_items": copy.deepcopy(asked),
            "asked": [NS["in_takeoff_list"](x, v) for x in asked],
            "set": d,
        })
    md = {"takeoff_lists": [{"list_id": copy.deepcopy(v),
                             "label": copy.deepcopy(v)},
                            {"list_id": DECK, "label": "Deck"}],
          "takeoff_list_active": copy.deepcopy(v),
          "takeoff_main_label": copy.deepcopy(v)}
    before = copy.deepcopy(md)
    w = window(md)
    nm = w._takeoff_naming_now()
    nin = window(md, active=copy.deepcopy(v))._takeoff_naming_now()
    ids = [copy.deepcopy(v), str(v), DECK, ""]
    structured.append({
        "value": v, "type": "registry", "md": before,
        "clean": NS["clean_takeoff_name"](v),
        "free": NS["free_takeoff_name"](v, [str(v)]),
        "lists": w.takeoff_lists(),
        "label_ids": ids,
        "labels": [w.takeoff_list_label(i) for i in ids],
        "naming": [nm[0], [[k, x] for k, x in nm[1].items()]],
        "naming_in": [nin[0], [[k, x] for k, x in nin[1].items()]],
    })
    assert md == before, md


def _store():
    """A job of two takeoffs and a third the registry does not know,
    with every shape a count could stumble on."""
    return {
        "0": [{"type": "area", "name": "Slab"},
              {"type": "area", "name": "Wall", "group_id": "g1"},
              {"type": "area", "name": "Boards", "group_id": "g2",
               "takeoff_list": DECK},
              {"type": "count", "name": "Posts", "takeoff_list": DECK},
              {"type": "count", "name": "Posts"},
              {"type": "window", "name": "Window 2",
               "takeoff_list": " %s " % DECK},
              {"type": "distance", "takeoff_list": DECK},
              {"type": "textnote", "takeoff_list": DECK},
              {"type": "page_ref", "takeoff_list": DECK},
              {"type": "area", "name": "Odd", "takeoff_list": "tl-gone"}],
        "1": [{"type": "area", "name": "Wall", "group_id": "g1",
               "group_child": True},
              {"type": "area", "name": "Boards", "group_id": "g2",
               "group_child": True, "takeoff_list": DECK},
              {"type": "polyline", "name": "Rail", "takeoff_list": PATIO},
              {"type": "polyline", "name": "Blank", "takeoff_list": " "},
              {"type": "polyline", "name": "Feff",
               "takeoff_list": "﻿" + DECK}],
        "-1000": [{"type": "standalone", "name": "Screws",
                   "takeoff_list": DECK},
                  {"type": "standalone", "name": "Nails"},
                  {"type": "group", "name": "Stairs", "takeoff_list": DECK},
                  {"type": "group", "name": "Shed",
                   "takeoff_list": "tl-group-only"}],
    }


STORE_IDS = ["", DECK, PATIO, "tl-gone", "tl-group-only", "﻿" + DECK,
             "tl-none"]
counts = []
for md in [{}, {"takeoff_lists": REG}, {"takeoff_lists": REG,
                                        "takeoff_main_label": "House"}]:
    store = _store()
    w = window(md, store)
    counts.append({
        "md": md,
        "store": copy.deepcopy(store),
        "items": [[i, len(w._takeoff_items(i))] for i in STORE_IDS],
        "has": w.has_takeoff_lists(),
    })
    assert store == _store()

NAMING = ["", [["", "House"], [DECK, "Deck"], [PATIO, "Patio"]]]


def _naming(n):
    return None if n is None else (n[0], dict(n[1]))


where = []
for m in items[:60] + [{"type": "area", "takeoff_list": "tl-gone"},
                       {"type": "group", "takeoff_list": DECK}] + NOT_DICTS:
    for n in [None, NAMING, [DECK, NAMING[1]], ["", []], "odd", [""]]:
        where.append({"m": m, "naming": n,
                      "out": NS["takeoff_where_words"](
                          m, _naming(n) if isinstance(n, list)
                          and len(n) == 2 else n)})

A = {"type": "area", "name": "Slab"}
D = {"type": "area", "name": "Boards", "takeoff_list": DECK}
P = {"type": "polyline", "name": "Rail", "takeoff_list": PATIO}
G = {"type": "area", "name": "Odd", "takeoff_list": "tl-gone"}
N = {"type": "textnote", "takeoff_list": DECK}
MOVES = [
    ([], []),
    ([["a", A, 10, "SF"]], [["a", A, 12, "SF"]]),
    ([["d", D, 10, "SF"]], [["d", D, 12, "SF"]]),
    ([["d", D, 10, "SF"]], []),
    ([], [["d", D, 10, "SF"]]),
    ([["d", D, 10, "SF"]], [["d", D, 10.0000001, "SF"]]),
    ([["d", D, 10, "SF"]], [["d", D, 10, "LF"]]),
    ([["d", D, 10, "SF"], ["p", P, 3, "LF"]],
     [["d", D, 11, "SF"], ["p", P, 4, "LF"]]),
    ([["p", P, 3, "LF"], ["d", D, 10, "SF"], ["g", G, 1, "SF"]],
     [["p", P, 4, "LF"], ["d", D, 11, "SF"], ["g", G, 2, "SF"]]),
    ([["n", N, 1, "EA"]], [["n", N, 2, "EA"]]),
    ([["a", A, 1, "SF"], ["d", D, 1, "SF"]], [["a", A, 2, "SF"]]),
]
moved = []
for before, after in MOVES:
    for n in [None, NAMING, [DECK, NAMING[1]]]:
        for fut in [False, True]:
            NS["set_takeoff_naming"](
                None if n is None else (lambda n=n: _naming(n)))
            try:
                out = NS["takeoff_others_moved_words"](
                    {k: (m, (q, u)) for k, m, q, u in before},
                    {k: (m, (q, u)) for k, m, q, u in after}, fut)
            finally:
                NS["set_takeoff_naming"](None)
            moved.append({"before": before, "after": after, "naming": n,
                          "future": fut, "out": out})
NS["set_takeoff_naming"](lambda: 1 / 0)
try:
    raising = NS["takeoff_others_moved_words"](
        {"d": (D, (1, "SF"))}, {"d": (D, (2, "SF"))}, False)
finally:
    NS["set_takeoff_naming"](None)

TRUTH = {
    "source": "takeoff lists, desktop 3.08",
    "lifted": sorted(LIFTED) + ["PDFCacheViewer." + n for n in WIN_METHODS]
    + ["GLPageWidget." + n for n in GL_METHODS],
    "constants": {"TAKEOFF_LIST_KEY": NS["TAKEOFF_LIST_KEY"],
                  "MAIN_TAKEOFF_LABEL": NS["MAIN_TAKEOFF_LABEL"],
                  "TAKEOFF_NAME_MAX": NS["TAKEOFF_NAME_MAX"]},
    "ids": IDS,
    "label_ids": LABEL_IDS,
    "predicates": predicates,
    "setters": setters,
    "clean": cleaned,
    "free": free,
    "registries": registries,
    "counts": counts,
    "where": where,
    "moved": moved,
    "moved_naming_raises": raising,
    "specials": specials,
    "special_names": special_names,
    "structured": structured,
}
text = json.dumps(TRUTH, indent=1, sort_keys=False) + "\n"
if WRITE:
    with open(SNAPSHOT, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    print("wrote %s (%d predicates, %d registries)"
          % (SNAPSHOT, len(predicates), len(registries)))
else:
    sys.stdout.write(text)
