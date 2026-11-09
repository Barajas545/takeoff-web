"""Ground truth for THE DESKTOP'S JSON: what Python's json module writes and reads.

The desktop saves a project's metadata block with

    json.dumps(self._build_save_metadata())          (_do_save_to_path)

and reads it with json.loads (load_cache_to_ram, read_cache_header). No
keyword argument on any of them, so allow_nan is on -- Python's default -- and
a float that is not finite is written as a bare word: Infinity, -Infinity,
NaN. The desktop makes one: a vertical pitch line's rise, float("inf")
(_pitch_from_points), saved as `"value": Infinity`.

This script checks that BY TEXT, through `ast`: the three calls are found in
pdf_fast_viewer.py and must be exactly those, with no keyword. It lifts
_pitch_from_points and _pitch_label out of the source by text (their free
names must be builtins or `math` -- the closure check) and runs them on a
vertical line, so the pitch item in the cases below is the desktop's own
item. Then it writes, for synthetic metadata covering the top level, nested
values, arrays, -Infinity, NaN, the words inside strings and keys, and a key
json.dumps writes twice (the int 0 and the str "0") with a NaN under the
first:

  * `desktop`: json.dumps(value) -- the desktop's own call, its spacing and
    its ASCII escapes;
  * `web`: what the web's writer must write byte for byte --
    json.dumps(value, separators=(",", ":"), ensure_ascii=False) of the value
    as JavaScript holds it (a whole float is a whole number there, so 90.0 is
    written 90, as JSON.stringify writes it);
  * `loads`: json.loads(desktop) as a tagged tree (every number, string, list
    and dict tagged; a non-finite number as "inf", "-inf" or "nan"), which
    the web's reader must reproduce exactly;

and `canvas`: the words the desktop's canvas draws for its own pitch lines
(a vertical one, a zero-length one -- two clicks on one point: rise Infinity,
angle 0 -- a sloped and a level one), from the pitch branch of
GLPageWidget._gl_draw_measurement_label lifted by text (closure-checked: it
reads only `m` and _pitch_label), each beside the item as json.dumps writes
it;

and Python's verdict on texts where the words stand where json.loads refuses
them ({NaN: 1}, 1Infinity, -NaN, ...) or accepts them ([ NaN ], 1e999).

tests/py-json.mjs holds js/core/py-json.js to it, from the committed
tests/data/py-json-truth.json on a fresh clone and live against this script
when the desktop source is here.

Usage:
  python -B tests/py-json-python-truth.py [pdf_fast_viewer.py]          JSON to stdout
  python -B tests/py-json-python-truth.py [pdf_fast_viewer.py] --write  rewrite the snapshot
  python -B tests/py-json-python-truth.py --loads   < texts.json       json.loads of each text, tagged
  python -B tests/py-json-python-truth.py [pdf_fast_viewer.py] --canvas < texts.json
      the desktop's canvas words for each text (a pitch item, read by json.loads)
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
LOADS = "--loads" in sys.argv[1:]
CANVAS_MODE = "--canvas" in sys.argv[1:]
SNAPSHOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data",
                        "py-json-truth.json")


def tag(v):
    """A value as a tree of finite JSON: every node says what it is."""
    if isinstance(v, bool):
        return {"b": v}
    if v is None:
        return {"z": 1}
    if isinstance(v, (int, float)):
        if v != v:
            return {"n": "nan"}
        if v in (float("inf"), float("-inf")):
            return {"n": "inf" if v > 0 else "-inf"}
        return {"n": v}
    if isinstance(v, str):
        return {"s": v}
    if isinstance(v, list):
        return {"a": [tag(x) for x in v]}
    if isinstance(v, dict):
        return {"o": [[k, tag(x)] for k, x in v.items()]}
    raise TypeError(type(v))


def loads_verdict(text):
    try:
        return {"ok": True, "value": tag(json.loads(text))}
    except ValueError as e:
        return {"ok": False, "error": type(e).__name__}


if LOADS:
    texts = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    sys.stdout.write(json.dumps([loads_verdict(t) for t in texts],
                                ensure_ascii=True, allow_nan=False) + "\n")
    sys.exit(0)

SRC = ARGS[0] if ARGS else os.environ.get("PTT_DESKTOP_SRC", "")
if not SRC or not os.path.exists(SRC):
    raise SystemExit("Give pdf_fast_viewer.py (argument or PTT_DESKTOP_SRC).")

DESK = open(SRC, "r", encoding="utf-8").read()
TREE = ast.parse(DESK)


def _find_def(name, cls=None):
    body = TREE.body
    if cls:
        c = next(n for n in body if isinstance(n, ast.ClassDef) and n.name == cls)
        body = c.body
    return next(n for n in body
                if isinstance(n, ast.FunctionDef) and n.name == name)


def _json_calls(fn, attr):
    out = []
    for n in ast.walk(fn):
        if (isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
                and n.func.attr == attr and isinstance(n.func.value, ast.Name)
                and n.func.value.id == "json"):
            out.append(n)
    return out


def calls():
    """The desktop's own save and load calls, as written, keywords and all."""
    save = _find_def("_do_save_to_path", "PDFCacheViewer")
    found = [c for c in _json_calls(save, "dumps")
             if ast.unparse(c.args[0]) == "self._build_save_metadata()"]
    assert len(found) == 1, "the save's json.dumps(self._build_save_metadata()) is not there"
    out = {"save": {"in": "PDFCacheViewer._do_save_to_path",
                    "call": ast.unparse(found[0]),
                    "keywords": [k.arg for k in found[0].keywords]}}
    for fn in ("load_cache_to_ram", "read_cache_header"):
        cs = _json_calls(_find_def(fn), "loads")
        assert len(cs) == 1, "%s reads its metadata with one json.loads" % fn
        out[fn] = {"call": ast.unparse(cs[0]),
                   "keywords": [k.arg for k in cs[0].keywords]}
    return out


# ── the desktop's pitch functions, lifted by text and closure-checked ──────
LIFT = ["_pitch_from_points", "_pitch_label"]
PROVIDED = {"math": math}


def lift():
    lines = DESK.splitlines(True)
    ns = dict(PROVIDED)
    for name in LIFT:
        node = _find_def(name)
        text = textwrap.dedent("".join(lines[node.lineno - 1:node.end_lineno]))
        tree = ast.parse(text)
        args = {a.arg for a in tree.body[0].args.args}
        assigned = {t.id for n in ast.walk(tree) if isinstance(n, ast.Assign)
                    for t in n.targets if isinstance(t, ast.Name)}
        assigned |= {e.id for n in ast.walk(tree) if isinstance(n, ast.Assign)
                     for t in n.targets if isinstance(t, ast.Tuple)
                     for e in t.elts if isinstance(e, ast.Name)}
        free = {n.id for n in ast.walk(tree) if isinstance(n, ast.Name)
                and isinstance(n.ctx, ast.Load)} - args - assigned
        stray = sorted(f for f in free if not hasattr(builtins, f)
                       and f not in PROVIDED and f not in LIFT)
        assert not stray, "%s reads %s, which the lift does not carry" % (name, stray)
        exec(compile(text, SRC + ":" + name, "exec"), ns)
    return ns


NS = lift()


# ── the desktop's canvas words for a pitch line, lifted by text ────────────
# GLPageWidget._gl_draw_measurement_label: its `name` and `notes_hint`, and
# its pitch branch up to the text it draws (`disp`). Free names: `m` and
# _pitch_label (lifted above) -- the closure check.
def lift_canvas():
    cls = next(n for n in TREE.body
               if isinstance(n, ast.ClassDef) and n.name == "GLPageWidget")
    fn = next(n for n in cls.body if isinstance(n, ast.FunctionDef)
              and n.name == "_gl_draw_measurement_label")
    lines = DESK.splitlines(True)
    seg = lambda n: textwrap.dedent("".join(lines[n.lineno - 1:n.end_lineno]))
    target = lambda s: (s.targets[0].id if isinstance(s, ast.Assign)
                        and len(s.targets) == 1
                        and isinstance(s.targets[0], ast.Name) else None)
    head = [s for s in fn.body if target(s) in ("name", "notes_hint")]
    assert [target(s) for s in head] == ["name", "notes_hint"], \
        "_gl_draw_measurement_label no longer sets name and notes_hint once each"
    branch = None
    for top in fn.body:
        node = top
        while isinstance(node, ast.If):
            if ast.unparse(node.test) == "mtype == 'pitch' and len(points) >= 2":
                branch = node
                break
            node = node.orelse[0] if len(node.orelse) == 1 else None
        if branch:
            break
    assert branch, "the pitch branch of _gl_draw_measurement_label is not there"
    names = [target(s) for s in branch.body]
    assert "disp" in names, "the pitch branch no longer builds `disp`"
    stmts = head + branch.body[:names.index("disp") + 1]
    assert [target(s) for s in stmts] == ["name", "notes_hint", "pstr", "ang",
                                          "body", "disp"], [target(s) for s in stmts]
    text = "".join(seg(s) for s in stmts)
    tree = ast.parse(text)
    assigned = {target(s) for s in tree.body}
    free = {n.id for n in ast.walk(tree) if isinstance(n, ast.Name)
            and isinstance(n.ctx, ast.Load)} - assigned
    stray = sorted(f for f in free
                   if not hasattr(builtins, f) and f not in ("m", "_pitch_label"))
    assert not stray, "the pitch label reads %s, which the lift does not carry" % stray
    code = compile(text, SRC + ":_gl_draw_measurement_label(pitch)", "exec")

    def canvas(m):
        ns = {"m": m, "_pitch_label": NS["_pitch_label"]}
        exec(code, ns)
        return ns["disp"]
    return canvas, {"in": "GLPageWidget._gl_draw_measurement_label",
                    "assigns": [target(s) for s in stmts]}


CANVAS, CANVAS_LIFTED = lift_canvas()
RISE, ANGLE = NS["_pitch_from_points"]((100.5, 40.25), (100.5, 300.75))
assert RISE == float("inf"), "the desktop's vertical pitch line is no longer Infinity"
SLOPED = NS["_pitch_from_points"]((10.5, 200.25), (130.5, 140.25))


def pitch_item(p0, p1, **extra):
    """The desktop's _finalize_pitch item, made by its own two functions."""
    rise12, angle = NS["_pitch_from_points"](p0, p1)
    m = {"type": "pitch", "points": [list(p0), list(p1)], "name": "",
         "notes": "", "color": [0.2, 0.6, 0.9, 1.0], "value": rise12,
         "angle_deg": angle, "label": NS["_pitch_label"](rise12),
         "floor_level": "", "category": "", "sub_category": "",
         "cost_type": "material", "unit_cost": 0.0}
    m.update(extra)
    return m


INF, NINF, NAN = float("inf"), float("-inf"), float("nan")

# The desktop's own pitch lines, and the words its canvas draws for each.
# Two clicks on one point make a line: _finalize_pitch has no minimum
# length, so its rise is Infinity and its angle atan2(0, 0), 0.0.
CANVAS_LINES = [
    ["a vertical line", pitch_item((100.5, 40.25), (100.5, 300.75))],
    ["two clicks on one point (zero length)",
     pitch_item((120.0, 80.0), (120.0, 80.0), name="Zero")],
    ["...with a note", pitch_item((60.5, 30.5), (60.5, 30.5), notes="see X2.0")],
    ["a run below the desktop's 1e-9 (still vertical)",
     pitch_item((50.0, 10.0), (50.0000000001, 90.0))],
    ["a sloped line", pitch_item((10.5, 200.25), (130.5, 140.25), name="Roof")],
    ["a level line", pitch_item((10.5, 50.5), (90.5, 50.5))],
]

CASES = [
    ["top level: Infinity", INF],
    ["top level: -Infinity", NINF],
    ["top level: NaN", NAN],
    ["a job with a vertical pitch line (the desktop's own item)", {
        "project_name": "Synthetic job", "page_labels": ["X1.0", "X2.0"],
        "page_labels_custom": {}, "page_names": {}, "dpi": 150,
        "pixels_per_foot": 50.5,
        "annotations": {},
        "measurements": {"0": [
            pitch_item((100.5, 40.25), (100.5, 300.75)),
            pitch_item((10.5, 200.25), (130.5, 140.25), name="Roof"),
            pitch_item((300.5, 20.5), (300.5, 90.5), unit_cost=12.5,
                       associated_items=[{"name": "Flashing", "qty": 2,
                                          "qty_mode": "per_unit",
                                          "unit_cost": 3.25}]),
        ]},
        "revisions": []}],
    ["nested at any depth", {
        "a": [1, [2, [NINF, {"b": NAN, "c": [[[INF]]]}]]],
        "d": {"e": {"f": {"g": INF, "h": -2.5}}}, "i": None, "j": True}],
    ["arrays", [INF, NINF, NAN, 1.5, -2, "Infinity", "NaN", "-Infinity",
                [], {}, [NAN, [NINF]]]],
    ["the words inside strings", {
        "note": "Infinity", "two": "-Infinity NaN", "esc": "a\"Infinity\\",
        "quoted": "\\\"NaN", "slash": "\\", "after": NAN,
        "uni": "é Infinity ☃", "tab": "x\tNaN\ny", "ctl": "\x01NaN"}],
    ["the words as keys", {"Infinity": 1, "NaN": "NaN", "-Infinity": [INF],
                           "x Infinity": NAN, "": NINF}],
    ["non-finite float keys (json.dumps writes their words)",
     {INF: 1, NAN: 2, NINF: 3, "k": INF}],
    ["a key __proto__", {"__proto__": NAN, "x": {"__proto__": INF}}],
    # json.dumps writes the int key 0 and the str key "0" both as "0": the
    # file holds one key twice, and json.loads keeps the last -- so the NaN
    # under the first is read by nobody, and the file still opens.
    ["a key written twice, a NaN under the first (the int 0 and the str \"0\")",
     {0: {"note": NAN}, "0": "X1.0 plan", "k": [INF, {1: NAN, "1": NINF}]}],
    ["no word at all (the ordinary file)", {
        "project_name": "Plain job", "dpi": 150, "pixels_per_foot": 33.25,
        "page_labels": ["X1.0"], "notes": "Infinity and NaN, in words only",
        "measurements": {"0": [{"type": "area", "value": 12.25,
                                "points": [[0, 0], [10.5, 0], [10.5, 10.5]],
                                "rev_id": None, "visible": True}]}}],
]

# How json.loads reads text a writer never produced: the words where it
# refuses them, and where it still takes them.
TEXTS = [
    "{NaN: 1}", "{Infinity: 1}", '{"a": 1, NaN: 2}', '{"a": 1, -Infinity: 2}',
    "[1Infinity]", "[Infinity5]", "[Infinity.5]", "[Infinitye5]",
    "[-NaN]", "[+Infinity]", "[--Infinity]", "[- Infinity]", "[1-Infinity]",
    "[1e-Infinity]", "[infinity]", "[nan]", "[NaNa]", "[xNaN]", "inf", "-inf",
    '["NaN" NaN]', '["a\\\\"NaN]', '["a\\\\\\"NaN"]', "[NaN,]", "[,NaN]",
    "[ NaN ]", "NaN", " -Infinity ", "Infinity", '{"a" :Infinity}',
    "[\n-Infinity\n]", "[1e999]", "[-1e999]", '{"NaN":NaN}',
    '{"k": "Infinity", "v": Infinity}', '"Infinity"', '"\\"NaN"',
    '{"a": [1, {"b": [NaN, -Infinity]}]}', "[NaN NaN]",
    # a key written again later in the same object: json.loads keeps the
    # last value, whatever word stood under the first -- but a word AS a key
    # it refuses, even in an object a later key throws away
    '{"a": NaN, "a": 1}', '{"a": [NaN], "a": 2}', '{"a": NaN, "a": NaN}',
    '{"a": {"b": NaN}, "a": {}}', '[{"x": NaN, "x": -Infinity}]',
    '{"a": {NaN: 1}, "a": 2}', '{"a": NaN :1}', '{"a": Infinity\n:1}',
]


def jsish(v):
    """The value as JavaScript holds it: a whole float is a whole number."""
    if isinstance(v, bool) or v is None or isinstance(v, (int, str)):
        return v
    if isinstance(v, float):
        if v == v and abs(v) != INF and v.is_integer() and abs(v) < 1e21:
            return int(v)
        return v
    if isinstance(v, list):
        return [jsish(x) for x in v]
    if isinstance(v, dict):
        return {(k if isinstance(k, str) else json.dumps({k: 0})[2:-5]): jsish(x)
                for k, x in v.items()}
    raise TypeError(type(v))


def main():
    out = {
        "calls": calls(),
        "lifted": LIFT,
        "vertical": {"value": json.dumps(RISE), "angle": ANGLE,
                     "label": NS["_pitch_label"](RISE)},
        "sloped": {"value": json.dumps(SLOPED[0]),
                   "label": NS["_pitch_label"](SLOPED[0])},
        "canvas_lifted": CANVAS_LIFTED,
        "canvas": [{"name": name, "item": json.dumps(m), "disp": CANVAS(m)}
                   for name, m in CANVAS_LINES],
        "cases": [],
        "texts": [[t, loads_verdict(t)] for t in TEXTS],
    }
    for name, value in CASES:
        desktop = json.dumps(value)
        web = json.dumps(jsish(json.loads(desktop)), separators=(",", ":"),
                         ensure_ascii=False)
        out["cases"].append({"name": name, "desktop": desktop, "web": web,
                             "loads": tag(json.loads(desktop)),
                             "web_loads": tag(json.loads(web))})
    text = json.dumps(out, indent=1, ensure_ascii=True, allow_nan=False) + "\n"
    if WRITE:
        with open(SNAPSHOT, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        print("wrote %s: %d cases, %d texts" % (os.path.basename(SNAPSHOT),
              len(out["cases"]), len(out["texts"])), flush=True)
    else:
        sys.stdout.write(text)
        sys.stdout.flush()


if __name__ == "__main__":
    if CANVAS_MODE:
        items = [json.loads(t) for t in json.loads(sys.stdin.buffer.read().decode("utf-8"))]
        sys.stdout.write(json.dumps([CANVAS(m) for m in items], ensure_ascii=True))
        sys.stdout.write(chr(10))
    else:
        main()
