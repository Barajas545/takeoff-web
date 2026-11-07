"""Ground truth for HOW A NUMBER READS, taken from the desktop app itself.

The user's decision of 2026-11-07: "match the desktop rounding". The desktop
formats with Python -- format(x, '.1f'), f'{x:,.2f}', '%g', round(x, n),
int(x) -- and Python rounds an exact binary tie half to EVEN (12.25 sq ft is
'12.2 sq ft', $0.125 is '$0.12', 22.5 inches is 1'-10"), where JavaScript's
toFixed / toLocaleString round it away from zero. Real takeoff makes those
ties (a 3.5 ft x 3.5 ft square is exactly 12.25 sq ft), so every text the web
writes or shows has to come out of the same rounding as its counterpart here.

So the producers are not re-typed. They are lifted out of pdf_fast_viewer.py
BY TEXT -- through `ast`, so a function is exactly its own lines -- and run
on a corpus of exact ties, near-ties, negatives, zero and -0.0, large values
with commas and 1e21:

  * whole module functions: format_ft, format_distance_precision,
    format_ft_in, _pitch_label, scale_label_for, _catalog_price, shape_own,
    shape_tag, ref_scale_words, ... (and every module name they reach, by a
    closure walk);
  * static methods: TakeoffItemsPanel._value_str (a row's quantity),
    ReportCenterDialog._fmt_qty / _unit_totals (a report's quantities);
  * methods on stand-ins that record what they would paint or say:
    GLPageWidget._gl_draw_measurement_label (every canvas label),
    _gl_draw_preview_label (the live read-outs while a tool draws),
    _size_refusal, PDFCacheViewer.update_zoom_label (the zoom readout: it
    TRUNCATES), SlopeRoofDialog._update_pitch_display, and
    TakeoffReportDialog._collect_items with the iterator and Sheet cell it
    reads (the export's rows, for the CSV of a whole job),
    GLPageWidget._recalc_value (the reshape: what a drag writes into a grid
    or a pitch line, then drawn by the canvas label above), and
    ReportCenterDialog._collect (the report's rows: each item's quantity,
    rate and cost and its materials' -- the money the Items footer adds);
  * nested defs: _export_excel's value_and_unit (the workbook's Takeoff
    sheet quantity), beside its material f-strings;
  * SLICES: one expression of a method -- an f-string, the value of one
    assignment, one call -- found by its own text (ast.unparse) and run as a
    function of the names it reads: the finished shapes' labels and suggested
    names (_finalize_area, _finalize_slope_area, _finalize_polyline,
    _finalize_grid_poly, _finalize_tile_poly, _finalize_linear_count), the
    reshape's labels (_recalc_value: an area's, a grid's, a Measure line's
    named or not, a pitch line's), the export's rounding and descriptions
    (TakeoffReportDialog._collect_items: round(v, 4), round(qty * rate, 2),
    the tile and spacing words) and the CSV writer's row (_export_csv), the
    report's money (_grouped_html), the scale readout (_update_scale_label),
    the calibration's two sentences (_finish_calibration), the tile form's
    estimate (ItemPropertiesDialog._tile_refresh), the catalog's table cell
    (MaterialsCatalogDialog._fill_row) and pick-list price
    (_CatalogNameSearch._mcat_on_typed), the materials' quantities.

THE LIFTED SET MUST BE A CLOSURE, checked BEFORE anything runs: every
`self.<name>` a lifted method touches is a DECLARED stub of its stand-in;
every free name a lifted body or slice reads is a builtin, a parameter the
corpus provides, a lifted module name (walked breadth first, constants
included) or a DECLARED stand-in. A gap fails with the missing names.

Python's own format() on a generated set of ties for nd 0..6 and 'g' (and
',', round(), int(), str()) rides along, so tests/rounding-parity.mjs can
hold the web's helpers (js/core/pyformat.js) to Python itself.

Usage:
  python -B tests/rounding-python-truth.py [pdf_fast_viewer.py]          JSON to stdout
  python -B tests/rounding-python-truth.py [pdf_fast_viewer.py] --write  rewrite the snapshot
(PTT_DESKTOP_SRC when no path is given.) tests/rounding-parity.mjs reads the
committed tests/data/rounding-truth.json on a fresh clone and runs this
script live when the desktop source is here, which also fails a stale
snapshot.
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
if not SRC:
    raise SystemExit("Give pdf_fast_viewer.py (or set PTT_DESKTOP_SRC): this "
                     "script runs the desktop app's own text producers.")
SNAPSHOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data",
                        "rounding-truth.json")

with open(SRC, "r", encoding="utf-8") as fh:
    DESK = fh.read()
TREE = ast.parse(DESK)
LINES = DESK.splitlines(True)

# ── what is lifted ────────────────────────────────────────────────────────

# Module functions the corpus calls by name. What they reach is walked.
MODULE_SEED = ["format_ft", "format_distance_precision", "format_ft_in",
               "_pitch_label", "_pitch_from_points", "scale_label_for",
               "_catalog_price", "_tile_pattern_label", "shape_own",
               "shape_tag", "compute_pixels_per_foot"]

# Static methods, lifted into stand-ins that carry the class's own name
# (ReportCenterDialog._unit_totals calls ReportCenterDialog._fmt_qty).
STATICS = {"TakeoffItemsPanel": ["_value_str"],
           "ReportCenterDialog": ["_fmt_qty", "_unit_totals"]}

# Methods run on a stand-in `self`, and the DECLARED stubs each may read:
# the data a corpus case sets, and the recorders of what would be painted
# or said. Nothing else.
METHODS = {
    # ...and the reshape, _recalc_value: what a drag writes into the file (a
    # grid's cols, rows and label; a pitch line's rise, angle and words)
    "GLPageWidget": ["_gl_draw_measurement_label", "_gl_draw_preview_label",
                     "_size_refusal", "_recalc_value"],
    "PDFCacheViewer": ["update_zoom_label"],
    "SlopeRoofDialog": ["_update_pitch_display"],
    # the export's rows (the CSV and the workbook's All Items), with the
    # iterator and the Sheet cell they come through
    "TakeoffReportDialog": ["_collect_items", "_iter_measurements",
                            "_sheet_disp", "_item_rev"],
    # the Report Center's rows: each item's quantity, rate and cost and its
    # materials' -- the money every report and the Items footer add
    "ReportCenterDialog": ["_collect"],
}
STUBS = {
    "GLPageWidget": {
        # where a label goes, and the label itself: recorded
        "_page_to_screen", "_gl_blit_label", "_gl_blit_line_label",
        "_gl_blit_callout", "marker_scale", "_cached_texture",
        "_draw_tex_quad", "_note_font_size", "_project_dpi",
        # the live tool's state
        "_current_measurement", "_mode", "_cursor_page_pt",
        "_shift_constrained_pt", "_tile_w_in", "_tile_h_in",
        "_tile_grout_in", "_linear_count_spacing_in", "ref_scale_armed",
        "_sheet_scale_label", "_scale_phrase",
        # _size_refusal's sizes
        "_page_sizes", "_current_page", "_preview_size",
        # _recalc_value's: the shape's own scale (every corpus item carries
        # its `ppf`), and what only other kinds than a grid or a pitch line
        # reach (stubs that refuse to run)
        "_shape_ppf", "_drag_active", "_group_master", "_sync_group",
        "_ref_own_ppf", "_shape_count_dots", "_tile_compute"},
    "PDFCacheViewer": {"gl_widget", "zoom_label"},
    "SlopeRoofDialog": {"_pitch_spin", "_flat_area", "_factor_lbl",
                        "_area_lbl"},
    "TakeoffReportDialog": {"_measurements", "_page_labels", "_filter_rev",
                            "_counted", "_include_dims", "_filter_floor",
                            "_filter_cat", "_filter_ctype", "_rev_name"},
    # the two class constants come from the class's own lines (CLASS_CONSTS)
    "ReportCenterDialog": {"_floor_combo", "_trade_combo", "_meas",
                           "_counted", "_label_fn", "_rev_suffix", "_cb_dims",
                           "NON_ITEM_TYPES", "DIMENSION_TYPE"},
}

# Class-level constants a lifted method reads off `self`, taken from the
# class's own assignment (its value evaluated among the lifted module names).
CLASS_CONSTS = {"ReportCenterDialog": ["NON_ITEM_TYPES", "DIMENSION_TYPE"]}

# Slices: (name, class, method, how, key, params). `how` is 'expr' (the one
# expression whose ast.unparse is exactly `key`) or 'assign' (the value of
# the first assignment to the name `key`) or 'stmts' ('name:n': that
# assignment and the n - 1 statements after it, returning the name -- the
# tile words and the `if` that adds the boxes) or 'def' (a function defined
# inside the method, by its name: its own lines, called with its own
# parameters). `params` are the names the corpus
# hands it; every other free name must be a builtin or a lifted module name.
SLICES = [
    # a finished Area: the form's suggested name and the label it writes
    ("area_suggest", "GLPageWidget", "_finalize_area", "expr",
     "f'Area {area_ft2:.0f} sq ft'", ["area_ft2"]),
    ("area_label", "GLPageWidget", "_finalize_area", "assign", "label",
     ["name", "area_ft2"]),
    # a finished Slope Roof
    ("slope_pitch_str", "GLPageWidget", "_finalize_slope_area", "assign",
     "pitch_str", ["pitch"]),
    ("slope_label", "GLPageWidget", "_finalize_slope_area", "assign",
     "label", ["name", "sloped_ft2", "pitch_str"]),
    # a finished Polyline
    ("run_suggest", "GLPageWidget", "_finalize_polyline", "expr",
     "f'Run {ft:.1f} ft'", ["ft"]),
    ("run_label", "GLPageWidget", "_finalize_polyline", "assign", "label",
     ["name", "ft"]),
    # a finished Grid: the suggested name
    ("grid_suggest", "GLPageWidget", "_finalize_grid_poly", "assign",
     "suggested", ["cols", "rows", "self"]),
    # a finished Tile run: its label
    ("tile_label", "GLPageWidget", "_finalize_tile_poly", "expr",
     "f\"Tile {m['tile_count']:,} ({_tile_pattern_label(pat)})\"",
     ["m", "pat"]),
    # a finished array (linear count)
    ("array_sp_str", "GLPageWidget", "_finalize_linear_count", "assign",
     "sp_str", ["spacing_in"]),
    ("array_suggest", "GLPageWidget", "_finalize_linear_count", "expr",
     "f'{count} items @ {sp_str}'", ["count", "sp_str"]),
    # the reshape's labels (_recalc_value), written into the file
    ("recalc_area", "GLPageWidget", "_recalc_value", "expr",
     "f'{area_ft2:.1f} sq ft'", ["area_ft2"]),
    ("recalc_slope", "GLPageWidget", "_recalc_value", "expr",
     "f'{sloped:.1f} sq ft ({pitch_str})'", ["sloped", "pitch_str"]),
    ("recalc_pitch_str", "GLPageWidget", "_recalc_value", "expr",
     "f'{pitch:g}:12'", ["pitch"]),
    ("recalc_tile", "GLPageWidget", "_recalc_value", "expr",
     "f\"Tile {m.get('tile_count', 0):,} "
     "({_tile_pattern_label(m.get('pattern', 'grid'))})\"", ["m"]),
    ("recalc_array", "GLPageWidget", "_recalc_value", "expr",
     "f'{count} items'", ["count"]),
    # ...a Measure line's (named or not), a grid's, a pitch line's
    ("recalc_dist_prec", "GLPageWidget", "_recalc_value", "assign", "prec",
     ["m"]),
    ("recalc_distance", "GLPageWidget", "_recalc_value", "expr",
     "format_distance_precision(ft, prec)", ["ft", "prec"]),
    ("recalc_grid", "GLPageWidget", "_recalc_value", "expr",
     "name if name else f'Grid {cols}×{rows}'", ["name", "cols", "rows"]),
    ("recalc_pitch", "GLPageWidget", "_recalc_value", "expr",
     "name if name else _pitch_label(rise12)", ["name", "rise12"]),
    # the tile form's estimate (Properties of a tile item)
    ("tile_form_area", "ItemPropertiesDialog", "_tile_refresh", "expr",
     "f'Area {area_ft2:,.1f} sq ft'", ["area_ft2"]),
    ("tile_form_needed", "ItemPropertiesDialog", "_tile_refresh", "expr",
     "f'+{waste:g}% waste → {needed:,} tiles'", ["waste", "needed"]),
    ("tile_form_boxes", "ItemPropertiesDialog", "_tile_refresh", "expr",
     "f'{int(math.ceil(needed / per_box)):,} boxes'", ["needed", "per_box"]),
    # the catalog: its table's price cell, and the price a pick list shows
    ("catalog_table_price_in", "MaterialsCatalogDialog", "_fill_row",
     "assign", "price", ["it"]),
    ("catalog_table_price", "MaterialsCatalogDialog", "_fill_row", "expr",
     "f'{price:.2f}' if price else ''", ["price"]),
    ("catalog_pick_price_in", "_CatalogNameSearch", "_mcat_on_typed",
     "assign", "price", ["it"]),
    ("catalog_pick_price", "_CatalogNameSearch", "_mcat_on_typed", "expr",
     "f'${price:,.2f}/{unit}' if price else ''", ["price", "unit"]),
    # the CSV: its columns, and the row it writes of each export row
    ("csv_fields", "TakeoffReportDialog", "_export_csv", "assign", "fields",
     []),
    ("csv_row", "TakeoffReportDialog", "_export_csv", "expr",
     "[row.get(k, '') for k in fields]", ["row", "fields"]),
    # the calibration: the question's first line, and the answer
    ("calib_line", "GLPageWidget", "_finish_calibration", "expr",
     "f'Line drawn: {dist_px:.1f} pixels\\n\\nEnter the real-world length "
     "(e.g. 10 for 10 feet, or 10.5):'", ["dist_px"]),
    ("calib_set", "GLPageWidget", "_finish_calibration", "expr",
     "f'Scale set: {new_ppf:.2f} pixels per foot\\n({dist_px:.1f} px = "
     "{real_ft} ft)'", ["new_ppf", "dist_px", "real_ft"]),
    # the scale readout on the status bar
    ("scale_readout", "PDFCacheViewer", "_update_scale_label", "expr",
     "f'{ppf:.2f} px/ft'", ["ppf"]),
    # the export (CSV, workbook): a quantity rounded to 4, a cost to the cent
    ("export_round4", "TakeoffReportDialog", "_collect_items", "expr",
     "round(m.get('value', 0.0), 4)", ["m"]),
    ("export_cost", "TakeoffReportDialog", "_collect_items", "expr",
     "round(qty * rate, 2)", ["qty", "rate"]),
    ("export_tile", "TakeoffReportDialog", "_collect_items", "stmts",
     "t_desc:2", ["m"]),
    ("export_spacing", "TakeoffReportDialog", "_collect_items", "expr",
     "f\"@ {m.get('spacing_in', 12):g}″ spacing\"", ["m"]),
    # the workbook (_export_excel): the Takeoff sheet's 'Qty / Value' of an
    # item (its nested value_and_unit, the whole def), a material's quantity
    # there, and the Materials sheet's 'Total Qty'
    ("xlsx_value_and_unit", "TakeoffReportDialog", "_export_excel", "def",
     "value_and_unit", []),
    ("xlsx_mat_qty", "TakeoffReportDialog", "_export_excel", "expr",
     "f'{total:g}'", ["total"]),
    ("xlsx_mats_total", "TakeoffReportDialog", "_export_excel", "expr",
     "f\"{rec['total']:g}\"", ["rec"]),
    # the printed report's money
    ("report_money", "ReportCenterDialog", "_grouped_html", "expr",
     "f'${rt:,.2f}'", ["rt"]),
    # the materials of an item: a line's quantity, the parent's measurement
    ("mat_total", "AssociatedItemsManagerDialog", "_item_row", "expr",
     "f'{qty:g} {unit} (total)'", ["qty", "unit"]),
    ("mat_parent", "AssociatedItemsManagerDialog", "__init__", "expr",
     "f'Parent: {parent_name}   |   Measurement: {self._parent_val:g} "
     "{unit_hint}'", ["parent_name", "self", "unit_hint"]),
]

# Module-level DEFS a lifted body reaches that are stood in for, not lifted:
# the note texture is Qt painting (a note's label is its own text, no number).
MODULE_STUBS = {"_make_note_texture": lambda *a, **k: None}


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
        for _s in ast.walk(_n):
            if isinstance(_s, (ast.Import, ast.ImportFrom)):
                for _a in _s.names:
                    IMPORTED.add((_a.asname or _a.name).split(".")[0])
            elif isinstance(_s, ast.Assign):
                for _t in _s.targets:
                    if isinstance(_t, ast.Name):
                        IMPORTED.add(_t.id)

PROVIDED_IMPORTS = {"math": math, "json": json}


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


def _class_const(cname, name):
    """The value of a class-level `name = ...` in class `cname`'s own body."""
    for n in _class(cname).body:
        if isinstance(n, ast.Assign) and len(n.targets) == 1 \
                and isinstance(n.targets[0], ast.Name) \
                and n.targets[0].id == name:
            return n.value
    raise SystemExit("class %s has no %s any more -- the desktop source has "
                     "moved" % (cname, name))


def _text(node):
    """The node's own lines, decorators included, dedented."""
    first = min([node.lineno] + [d.lineno for d in
                                 getattr(node, "decorator_list", [])])
    return textwrap.dedent("".join(LINES[first - 1:node.end_lineno]))


def _bound(node):
    """Names bound inside a function or a comprehension: never a reference
    to a module name."""
    out = set()
    for s in ast.walk(node):
        if isinstance(s, ast.Name) and isinstance(s.ctx, (ast.Store, ast.Del)):
            out.add(s.id)
        elif isinstance(s, (ast.FunctionDef, ast.AsyncFunctionDef,
                            ast.ClassDef, ast.Lambda)):
            if not isinstance(s, ast.Lambda):
                out.add(s.name)
            a = s.args
            for arg in a.args + a.kwonlyargs + getattr(a, "posonlyargs", []):
                out.add(arg.arg)
            if a.vararg:
                out.add(a.vararg.arg)
            if a.kwarg:
                out.add(a.kwarg.arg)
        elif isinstance(s, ast.ExceptHandler) and s.name:
            out.add(s.name)
        elif isinstance(s, (ast.Import, ast.ImportFrom)):
            for al in s.names:
                out.add((al.asname or al.name).split(".")[0])
    return out


def _free_names(node):
    """Names a def, an assignment or an expression reads from outside."""
    local = _bound(node)
    return {s.id for s in ast.walk(node)
            if isinstance(s, ast.Name) and isinstance(s.ctx, ast.Load)
            and s.id not in local}


def _self_attrs(fn):
    """What a method reads off `self` (getattr(self, 'x') included)."""
    out = set()
    for s in ast.walk(fn):
        if isinstance(s, ast.Attribute) and isinstance(s.value, ast.Name) \
                and s.value.id == "self":
            out.add(s.attr)
        elif isinstance(s, ast.Call) and isinstance(s.func, ast.Name) \
                and s.func.id in ("getattr", "hasattr") and len(s.args) >= 2 \
                and isinstance(s.args[0], ast.Name) \
                and s.args[0].id == "self" \
                and isinstance(s.args[1], ast.Constant):
            out.add(s.args[1].value)
    return out


def _slice_stmts(cls, meth, key):
    """'name:n' -- the first assignment to `name` and the n - 1 statements
    after it in the same block (t_desc and the `if` that adds the boxes)."""
    name, n = key.split(":")
    n = int(n)
    fn = _method(_class(cls), meth)
    for s in ast.walk(fn):
        for field in ("body", "orelse"):
            block = getattr(s, field, None)
            if not isinstance(block, list):
                continue
            for i, st in enumerate(block):
                if isinstance(st, ast.Assign) and len(st.targets) == 1 \
                        and isinstance(st.targets[0], ast.Name) \
                        and st.targets[0].id == name:
                    run = block[i:i + n]
                    if len(run) != n:
                        break
                    return run
    raise SystemExit("%s.%s has no run of %s statements from %r any more -- "
                     "the desktop source has moved" % (cls, meth, n, name))


def _slice_node(cls, meth, how, key):
    """The one node a SLICES entry names, found by its own text."""
    if how == "stmts":
        return ast.Module(body=_slice_stmts(cls, meth, key), type_ignores=[])
    fn = _method(_class(cls), meth)
    hits = []
    for s in ast.walk(fn):
        if how == "def" and isinstance(s, ast.FunctionDef) and s is not fn \
                and s.name == key:
            hits.append(s)
        elif how == "expr" and isinstance(s, ast.expr) \
                and ast.unparse(s) == key:
            hits.append(s)
        elif how == "assign" and isinstance(s, ast.Assign) \
                and len(s.targets) == 1 and isinstance(s.targets[0], ast.Name) \
                and s.targets[0].id == key:
            hits.append(s.value)
    if not hits:
        raise SystemExit("%s.%s has no %s %r any more -- the desktop source "
                         "has moved" % (cls, meth, how, key))
    texts = {ast.unparse(h) for h in hits}
    if len(texts) > 1:
        raise SystemExit("%s.%s: %s %r is not one expression: %s"
                         % (cls, meth, how, key, sorted(texts)))
    return hits[0]


BUILTINS = set(dir(builtins))


def closure_problems():
    problems = []
    want = set(MODULE_SEED)
    for cname, names in STATICS.items():
        for n in names:
            fn = _method(_class(cname), n)
            want |= _free_names(fn)
            if "self" in _free_names(fn) or _self_attrs(fn):
                problems.append("%s.%s reads self, but is lifted as a static "
                                "method" % (cname, n))
    for cname, names in METHODS.items():
        for n in names:
            fn = _method(_class(cname), n)
            for a in sorted(_self_attrs(fn) - STUBS[cname] - set(names)):
                problems.append("%s.%s reads self.%s, which is neither lifted "
                                "nor a declared stub" % (cname, n, a))
            want |= _free_names(fn)
    for name, cname, meth, how, key, params in SLICES:
        node = _slice_node(cname, meth, how, key)
        free = _free_names(node) - set(params)
        want |= free
    for cname, names in CLASS_CONSTS.items():
        for n in names:
            want |= _free_names(_class_const(cname, n))
    seen, queue, lifted = set(), sorted(want), []
    while queue:
        nm = queue.pop(0)
        if nm in seen:
            continue
        seen.add(nm)
        if nm in STATICS or nm in MODULE_STUBS:
            continue
        node = TOP.get(nm)
        if node is None:
            if nm in IMPORTED and nm not in PROVIDED_IMPORTS:
                problems.append("a lifted body reaches the import %r, which "
                                "this script does not provide" % nm)
            elif nm not in IMPORTED and nm not in BUILTINS:
                problems.append("a lifted body reads %r, which is no module "
                                "name, no builtin and no parameter" % nm)
            continue
        if isinstance(node, ast.ClassDef):
            problems.append("a lifted body reaches class %s, which cannot be "
                            "lifted" % nm)
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

NS = dict(PROVIDED_IMPORTS)
NS.update(MODULE_STUBS)
_nodes = sorted({id(TOP[n]): TOP[n] for n in MODULE_NAMES}.values(),
                key=lambda n: n.lineno)
exec(compile("\n".join(_text(n) for n in _nodes), "<extracted module names>",
             "exec"), NS)
for _cname, _names in STATICS.items():
    _cls = _class(_cname)
    _body = ["class %s:" % _cname, "    'lifted static methods'"]
    for _m in _names:
        _body.append(textwrap.indent(_text(_method(_cls, _m)), "    "))
    exec(compile("\n".join(_body), "<extracted %s>" % _cname, "exec"), NS)
for _cname, _names in METHODS.items():
    _cls = _class(_cname)
    _body = ["class %sBase:" % _cname, "    'lifted methods; the stand-in "
             "below sets the declared stubs'"]
    for _m in _names:
        _body.append(textwrap.indent(_text(_method(_cls, _m)), "    "))
    exec(compile("\n".join(_body), "<extracted %s>" % _cname, "exec"), NS)

CONSTS = {}
for _cname, _names in CLASS_CONSTS.items():
    for _n in _names:
        CONSTS[(_cname, _n)] = eval(compile(
            ast.Expression(_class_const(_cname, _n)),
            "<%s.%s>" % (_cname, _n), "eval"), NS)

SLICE_FNS = {}
for _name, _cname, _meth, _how, _key, _params in SLICES:
    _node = _slice_node(_cname, _meth, _how, _key)
    if _how == "def":
        # the nested def's own lines, under its own name
        exec(compile(_text(_node), "<def %s.%s %s>" % (_cname, _meth, _key),
                     "exec"), NS)
        SLICE_FNS[_name] = NS[_key]
        continue
    if _how == "stmts":
        _src = ("def %s(%s):\n" % (_name, ", ".join(_params))
                + textwrap.indent(ast.unparse(_node), "    ")
                + "\n    return %s\n" % _key.split(":")[0])
    else:
        _src = "def %s(%s):\n    return %s\n" % (_name, ", ".join(_params),
                                                 ast.unparse(_node))
    exec(compile(_src, "<slice %s.%s %s>" % (_cname, _meth, _name), "exec"),
         NS)
    SLICE_FNS[_name] = NS[_name]


# ── the stand-ins ─────────────────────────────────────────────────────────

class Obj:
    """A bag of attributes (a stand-in `self` for a slice)."""
    def __init__(self, **kw):
        self.__dict__.update(kw)


class Recorder:
    def __init__(self):
        self.said = []

    def setText(self, t):
        self.said.append(str(t))


class Spin:
    def __init__(self, v):
        self.v = v

    def value(self):
        return self.v


class Canvas(NS["GLPageWidgetBase"]):
    """The canvas, for its labels: every blit recorded (text first), every
    point on screen at (0, 0)."""
    def __init__(self, **kw):
        self.blits = []
        self._note_font_size = 12
        self._current_measurement = []
        self._mode = "pan"
        self._cursor_page_pt = None
        self._shift_constrained_pt = None
        self._tile_w_in = 12.0
        self._tile_h_in = 12.0
        self._tile_grout_in = 0.0
        self._linear_count_spacing_in = 12.0
        self._page_sizes = {}
        self._current_page = 0
        self._preview_size = None
        self.__dict__.update(kw)

    def _page_to_screen(self, *a):
        return (0.0, 0.0)

    def _gl_blit_label(self, text, *a, **k):
        self.blits.append(str(text))

    def _gl_blit_line_label(self, text, *a, **k):
        self.blits.append(str(text))

    def _gl_blit_callout(self, *a, **k):
        self.blits.append("callout")

    def marker_scale(self):
        return 1.0

    def _cached_texture(self, key, make):
        return (None, 0, 0)

    def _draw_tex_quad(self, *a):
        pass

    def _project_dpi(self):
        return 150.0

    def ref_scale_armed(self):
        return (0.0, "")

    def _sheet_scale_label(self):
        return ""

    def _scale_phrase(self, lab):
        return lab


class Gl:
    def __init__(self, zoom, floor):
        self.z, self.f = zoom, floor

    def get_zoom(self):
        return self.z

    def at_zoom_floor(self):
        return self.f


class Window(NS["PDFCacheViewerBase"]):
    def __init__(self, zoom, floor):
        self.gl_widget = Gl(zoom, floor)
        self.zoom_label = Recorder()


class Slope(NS["SlopeRoofDialogBase"]):
    def __init__(self, flat, pitch):
        self._flat_area = flat
        self._pitch_spin = Spin(pitch)
        self._factor_lbl = Recorder()
        self._area_lbl = Recorder()


class Export(NS["TakeoffReportDialogBase"]):
    """The export dialog with nothing filtered: what counts is everything
    (no revisions in the corpus), Measure lines included, sheet i is X<i+1>.0."""
    def __init__(self, measurements):
        self._measurements = measurements
        self._page_labels = lambda i: "X%d.0" % (i + 1)
        self._filter_rev = "__all__"
        self._counted = None
        self._include_dims = True
        self._filter_floor = "All Floors"
        self._filter_cat = "All Categories"
        self._filter_ctype = "all"

    def _rev_name(self, rid):
        return "revision"


class Reshape(NS["GLPageWidgetBase"]):
    """The canvas, for its reshape (_recalc_value): a shape measured at its
    own stamped `ppf`, in no group, no drag under way."""
    _drag_active = False

    def _shape_ppf(self, m):
        return float(m["ppf"])

    def _group_master(self, gid):
        return None

    def _refuse(self, *a, **k):
        raise AssertionError("the reshape corpus is grids and pitch lines")

    _sync_group = _ref_own_ppf = _shape_count_dots = _tile_compute = _refuse


class Combo:
    def __init__(self, v):
        self.v = v

    def currentData(self):
        return self.v


class Box:
    def __init__(self, on):
        self.on = on

    def isChecked(self):
        return self.on


class Center(NS["ReportCenterDialogBase"]):
    """The Report Center with nothing filtered and dimensions ticked (as the
    web's report with no filters lists Measure lines), every version
    counted, sheet i is X<i+1>.0; its two class constants its own."""
    NON_ITEM_TYPES = CONSTS[("ReportCenterDialog", "NON_ITEM_TYPES")]
    DIMENSION_TYPE = CONSTS[("ReportCenterDialog", "DIMENSION_TYPE")]

    def __init__(self, measurements):
        self._meas = measurements
        self._counted = None
        self._floor_combo = Combo(None)
        self._trade_combo = Combo(None)
        self._cb_dims = Box(True)
        self._label_fn = lambda i: "X%d.0" % (i + 1)

    def _rev_suffix(self, m):
        return ""


# ── the corpus ────────────────────────────────────────────────────────────

def nxt(x, k=1):
    for _ in range(k):
        x = math.nextafter(x, math.inf)
    return x


def prv(x, k=1):
    for _ in range(k):
        x = math.nextafter(x, -math.inf)
    return x


# Ties at one place (x.25, x.75), two (x.125), none (x.5), and the doubles
# either side of a tie, which must round the ordinary way.
T1 = [12.25, 0.25, 0.75, 2.25, 10.25, 100.75, 1234.25, 1000000.25,
      123456789.75, -12.25, -0.25]
T2 = [0.125, 3.125, 0.375, 1234.625, 1234567.125, -0.125, -3.125]
T0 = [0.5, 1.5, 2.5, 3.5, 12.5, 1e15 + 0.5, -0.5, -2.5, -3.5]
NEAR = [nxt(12.25), prv(12.25), nxt(0.125), prv(0.125), nxt(2.5), prv(2.5),
        2.675, 1.005, 1318.65, 99.995]
EDGE = [0.0, -0.0, 1e21, -1e21, 1.5e21, 123456.5, 1234565.0, 12345.25,
        1e-05, 0.0001, 7.0, 100.0]
CORPUS = T1 + T2 + T0 + NEAR + EDGE


def ties_for(scale, n_max=400, keep=10):
    """Doubles ft for which ft * scale lands EXACTLY on a half: the case
    round() decides by evenness. The desktop's own arithmetic order."""
    out = []
    for n in range(n_max):
        ft = (n + 0.5) / scale
        if ft * scale == n + 0.5:
            out.append(ft)
        if len(out) >= keep:
            break
    return out


def ties_for2(a, b, n_max=600, keep=10):
    """...for (ft * a) * b, as format_distance_precision and format_ft_in
    multiply."""
    out = []
    for n in range(n_max):
        ft = (n + 0.5) / (a * b)
        if (ft * a) * b == n + 0.5:
            out.append(ft)
        if len(out) >= keep:
            break
    return out


def r(x):
    """A float as JSON can carry it: repr, so -0.0, 1e21 and the bits stay."""
    return repr(float(x))


def _pts(n):
    return [[10 * i, 5] for i in range(n)]


# A job as this app writes it -- JSON.stringify writes a whole number with no
# point, so the desktop reads it back as an int -- for the CSV: whole and tie
# quantities and rates, a count (float(len(points)) there), materials whose
# count is an int (a whole qty) or a float (a fractional factor, or no qty at
# all: 0.0), an item on no sheet, a window, a tile run, an array.
CSV_JOB = json.dumps({
    "-1000": [
        {"type": "standalone", "name": "Spare", "qty": 2.5, "unit": "EA",
         "unit_cost": 0.25, "floor_level": "Level 1", "category": "Framing"},
        {"type": "standalone", "name": "Permit", "qty": 3, "unit": "EA",
         "unit_cost": 40},
    ],
    "0": [
        {"type": "area", "name": "Pad", "value": 12.25, "unit_cost": 0.5,
         "floor_level": "Level 1", "category": "Framing",
         "points": [[0, 0], [10, 0], [10, 10]],
         "associated_items": [
             {"name": "Mesh", "qty": 0.5, "qty_mode": "per_unit", "unit": "sq ft",
              "unit_cost": 1},
             {"name": "Tie Wire", "qty": 2, "qty_mode": "total", "unit": "each",
              "unit_cost": 0.25}]},
        {"type": "area", "name": "Slab", "value": 20, "unit_cost": 1,
         "points": [[0, 0], [10, 0], [10, 10]],
         "associated_items": [
             {"name": "Rebar", "qty": 0.5, "qty_mode": "per_unit", "unit_cost": 2},
             {"name": "Chairs", "qty": 2, "qty_mode": "per_unit", "unit_cost": 0.125},
             {"name": "Spacers", "qty": 3, "qty_mode": "total"},
             {"name": "Wire", "qty_mode": "total", "unit_cost": 1}]},
        {"type": "distance", "name": "", "label": "3'-1-1/2\"", "value": 3.125,
         "precision": "1/2", "points": [[0, 0], [50, 0]]},
        {"type": "polyline", "name": "Run", "value": 2.5, "unit_cost": 0.25,
         "points": [[0, 0], [10, 0]]},
        {"type": "polyline", "name": "Fence", "value": 30, "unit_cost": 1.5,
         "points": [[0, 0], [10, 0]]},
        {"type": "count", "name": "Bolts", "value": 20, "unit_cost": 0.125,
         "points": _pts(20)},
        {"type": "count", "name": "Post", "value": 1, "unit_cost": 0.125,
         "points": _pts(1)},
        {"type": "linear_count", "name": "Studs", "value": 12,
         "spacing_in": 16.25, "points": [[0, 0], [100, 0]]},
        {"type": "window", "name": "W1", "win_width": "36", "win_height": "48",
         "points": [[5, 5]]},
        {"type": "tile", "name": "Tile", "value": 1250.25, "tiles_needed": 1389,
         "tile_w_in": 12, "tile_h_in": 12, "pattern": "grid",
         "waste_pct": 12.5, "boxes": 139, "unit_cost": 2,
         "points": [[0, 0], [10, 0], [10, 10]]},
        {"type": "slope_area", "name": "Roof", "value": 12.25, "pitch": 4.25,
         "points": [[0, 0], [10, 0], [10, 10]]},
        {"type": "grid", "name": "", "label": "Grid 2×1", "value": 12.5,
         "cols": 2, "rows": 1, "points": [[0, 0], [10, 0], [10, 10], [0, 10]]},
        # every pin is one in the export, a header by its size and span
        {"type": "partition", "name": "P1", "part_number": "P1",
         "part_width": "4'", "value": 1, "unit_cost": 12.5,
         "points": [[6, 6]]},
        {"type": "header", "name": "Hdr H1", "hdr_number": "H1",
         "hdr_size": "4x12", "hdr_width": "6'", "value": 1, "unit_cost": 85,
         "points": [[7, 7]],
         "associated_items": [
             {"name": "Hanger", "qty": 2, "qty_mode": "total", "unit": "each",
              "unit_cost": 0.125}]},
    ],
}, ensure_ascii=True, separators=(",", ":"))

# A job for the Report Center's rows (ReportCenterDialog._collect): what each
# item costs and what its materials cost -- the money every report and the
# Items list's footer add. Every pin is one EA, a partition with no `value`
# too; an array is priced by its whole dots; a pitch line and a text note are
# no item, and neither is any material hung off them.
PIN_JOB = json.dumps({
    "-1000": [
        {"type": "standalone", "name": "Permit", "qty": 1, "unit": "EA",
         "unit_cost": 40}],
    "0": [
        {"type": "area", "name": "Deck", "value": 12.25, "unit_cost": 2,
         "points": [[0, 0], [35, 0], [35, 35], [0, 35]]},
        {"type": "header", "name": "Hdr H1", "hdr_number": "H1", "value": 1,
         "unit_cost": 85, "points": [[5, 5]],
         "associated_items": [
             {"name": "Hanger", "qty": 2, "qty_mode": "total", "unit": "each",
              "unit_cost": 5}]},
        {"type": "partition", "name": "Part P1", "part_number": "P1",
         "unit_cost": 12.5, "points": [[6, 6]],
         "associated_items": [
             {"name": "Clip", "qty": 3, "qty_mode": "per_unit", "unit": "each",
              "unit_cost": 0.125}]},
        {"type": "window", "name": "W1", "value": 1, "unit_cost": 0.125,
         "points": [[7, 7]]},
        {"type": "door", "name": "D1", "value": 1, "unit_cost": 300,
         "points": [[8, 8]],
         "associated_items": [
             {"name": "Hinge", "qty": 3, "qty_mode": "total", "unit": "each",
              "unit_cost": 4}]},
        {"type": "count", "name": "Bolts", "value": 3, "unit_cost": 0.125,
         "points": [[1, 1], [2, 2], [3, 3]]},
        {"type": "linear_count", "name": "Studs", "value": 12.9,
         "unit_cost": 2, "spacing_in": 16, "points": [[0, 0], [100, 0]]},
        {"type": "grid", "name": "Grid", "value": 75, "cols": 3, "rows": 3,
         "points": [[0, 0], [10, 0], [10, 10]]},
        {"type": "distance", "name": "Ruler", "value": 3.125,
         "points": [[0, 0], [10, 0]]},
        {"type": "pitch", "name": "Eave", "value": 6.25, "unit_cost": 3,
         "points": [[0, 0], [48, 25]],
         "associated_items": [
             {"name": "Flashing", "qty": 2, "qty_mode": "total",
              "unit_cost": 1.5}]},
        {"type": "textnote", "name": "Note", "unit_cost": 9,
         "points": [[0, 0]],
         "associated_items": [
             {"name": "Glue", "qty": 1, "qty_mode": "total",
              "unit_cost": 2}]},
    ],
}, ensure_ascii=True, separators=(",", ":"))


def report_collect(text):
    """The Report Center's rows of a job: [name, qty, unit, rate, cost,
    [[material, qty, rate, cost], ...]] each, floats by repr."""
    ms = {int(k): v for k, v in json.loads(text).items()}
    rows, _wins, _doors = Center(ms)._collect()
    return [[row["name"], r(row["qty"]), row["unit"], r(row["rate"]),
             r(row["cost"]),
             [[a["name"], r(a["qty"]), r(a["rate"]), r(a["cost"])]
              for a in row["mats"]]] for row in rows]


# The workbook's quantities, item by item (page key, item): what the
# desktop's Takeoff sheet writes in its 'Qty / Value' column, and of each
# material its quantity there and its 'Total Qty' on the Materials sheet.
_SQ = [[0, 0], [10, 0], [10, 10]]
WB_ITEMS = [
    ("0", {"type": "area", "name": "Roof", "value": 243.51724, "unit_cost": 2,
           "points": _SQ, "associated_items": [
               {"name": "Sheathing", "qty": 0.03125, "qty_mode": "per_unit",
                "unit": "sheet", "unit_cost": 30}]}),
    ("0", {"type": "area", "name": "Pad", "value": 12.25, "points": _SQ}),
    ("0", {"type": "area", "name": "Slab", "value": 1234.625, "points": _SQ}),
    ("0", {"type": "area", "name": "Patch", "value": 2.675, "points": _SQ}),
    ("0", {"type": "slope_area", "name": "Hip", "value": 12.25, "pitch": 4.25,
           "points": _SQ}),
    ("0", {"type": "grid", "name": "Joists", "value": 12.5, "cols": 2,
           "rows": 1, "points": _SQ + [[0, 10]]}),
    ("0", {"type": "tile", "name": "Tile", "value": 1250.25,
           "tiles_needed": 1389, "points": _SQ}),
    ("0", {"type": "polyline", "name": "Run", "value": 3.125,
           "points": [[0, 0], [10, 0]]}),
    ("0", {"type": "distance", "name": "Ruler", "value": 0.125,
           "points": [[0, 0], [10, 0]]}),
    ("0", {"type": "count", "name": "Bolts", "value": 3,
           "points": [[1, 1], [2, 2], [3, 3]], "associated_items": [
               {"name": "Washer", "qty": 12345.25, "qty_mode": "total",
                "unit": "each"},
               {"name": "Nut", "qty": 0.0001, "qty_mode": "total"},
               {"name": "Pin", "qty": 1234565.0, "qty_mode": "total"},
               {"name": "Shim", "qty": 1e-05, "qty_mode": "total"}]}),
    ("0", {"type": "linear_count", "name": "Studs", "value": 12.9,
           "spacing_in": 16, "points": [[0, 0], [100, 0]]}),
    ("0", {"type": "window", "name": "W1", "value": 1, "points": [[5, 5]]}),
    ("0", {"type": "door", "name": "D1", "value": 1, "points": [[5, 5]]}),
    ("0", {"type": "partition", "name": "P1", "points": [[5, 5]]}),
    ("0", {"type": "header", "name": "H1", "value": 1, "points": [[5, 5]]}),
    ("-1000", {"type": "standalone", "name": "Spare", "qty": 2.5,
               "unit": "EA"}),
    ("-1000", {"type": "standalone", "name": "Lot", "qty": 12.25,
               "unit": "EA"}),
    ("-1000", {"type": "standalone", "name": "Bulk", "qty": 1234565.0,
               "unit": "EA"}),
    ("-1000", {"type": "standalone", "name": "Fee", "qty": 100.0,
               "unit": "EA"}),
]


def workbook_qty(m):
    """[the Takeoff sheet's Qty / Value of `m`, [its materials' quantity
    there], [their Total Qty on the Materials sheet]] -- the desktop's
    _export_excel, its own value_and_unit and f-strings."""
    pv = m.get("value") or 0
    totals = [NS["_ai_total"](ai, pv) for ai in m.get("associated_items") or []]
    return [SLICE_FNS["xlsx_value_and_unit"](m)[0],
            [SLICE_FNS["xlsx_mat_qty"](t) for t in totals],
            [SLICE_FNS["xlsx_mats_total"]({"total": t}) for t in totals]]


# A grid reshaped (_recalc_value), and the canvas label it then draws: an L
# traced from its inner corner spans 3 x 3 cells by its bounding box, where
# cells laid from that corner need 4 x 4 to cover it.
def _grid(pts, cw, ch, angle=0.0, name="", **kw):
    m = {"type": "grid", "name": name, "points": pts, "grid_origin": pts[0],
         "angle": angle, "cell_w_px": cw, "cell_h_px": ch,
         "cell_w_ft": cw / 10.0, "cell_h_ft": ch / 10.0, "cols": 1,
         "rows": 1, "label": "Grid 1×1", "value": 0.0, "ppf": 10.0}
    m.update(kw)
    return m


_L = [[50, 50], [50, 100], [0, 100], [0, 0], [100, 0], [100, 50]]
GRID_SHAPES = [
    _grid([[0, 0], [100, 0], [100, 60], [0, 60]], 30.0, 30.0),
    _grid(_L, 40.0, 40.0),
    _grid(_L, 40.0, 40.0, name="Slab"),
    _grid(_L, 40.0, 40.0, cols=4, rows=4, label="Grid 4×4"),
    _grid([[660, 650], [660, 700], [610, 700], [610, 600], [710, 600],
           [710, 650]], 40.0, 40.0),
    _grid([[0, 0], [100, 0], [100, 60], [0, 60]], 25.0, 25.0, angle=30.0),
    _grid([[100, 0], [160, 0], [160, 30], [130, 30], [130, 90], [100, 90]],
          25.0, 20.0, angle=12.5),
]


def export_csv(text):
    """The desktop's CSV of a job: its _collect_items rows, through the
    csv.writer _export_csv writes them with (the file opened utf-8-sig, so a
    BOM leads it)."""
    import csv
    import io
    ms = {int(k): v for k, v in json.loads(text).items()}
    rows = Export(ms)._collect_items()
    fields = SLICE_FNS["csv_fields"]()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(fields)
    for row in rows:
        w.writerow(SLICE_FNS["csv_row"](row, fields))
    return buf.getvalue()


CASES = []


def case(surface, args, want):
    CASES.append({"s": surface, "a": args, "w": want})


def run_corpus():
    # format_ft: an inch tie (22.5 in is 1'-10")
    for ft in ties_for(12) + [1.875, -1.875, 0.0, 12.5, nxt(1.875), prv(1.875)]:
        case("format_ft", [r(ft)], NS["format_ft"](ft))
    # format_distance_precision at every precision, on its own ties
    for prec, den in (("Nearest Inch", 1), ("Inches Only", 16), ("1/2", 2),
                      ("1/8", 8), ("1/16", 16), ("", 8)):
        for ft in ties_for2(12, den) + [3.125, 0.1875, 10.0]:
            case("format_distance_precision", [r(ft), prec],
                 NS["format_distance_precision"](ft, prec))
    for ft in ties_for2(12, 16) + [12.5417, 0.0625, 3.0, -0.0078125]:
        case("format_ft_in", [r(ft)], NS["format_ft_in"](ft))
    # the pitch words: round(r, 1), a whole number within 0.05 snapped
    for p in [6.25, 0.25, 2.25, 4.75, 12.25, 2.5, 0.5, 5.95, 5.98, 6.05,
              0.05, 1e21, -6.25, -0.0, math.inf, 7.0, 1.45]:
        case("_pitch_label", [r(p)], NS["_pitch_label"](p))
    # a calibrated scale's words (and the presets)
    for ppf in [28.25, 40.75, 33.125, 12.05, 37.5, 18.75, 1234.25, 0.25,
                nxt(28.25), prv(28.25)]:
        case("scale_label_for", [r(ppf), 150], NS["scale_label_for"](ppf, 150))
    # the catalog's price, read and shown
    for v in [0.125, 0.375, 2.675, 1.005, 5.255, 1234.565, 1000000.125,
              -0.125, 0.0, 1e21, "$1,200.125", "5.125", " 3.375 ", "junk"]:
        p = NS["_catalog_price"](v)
        case("_catalog_price", [v if isinstance(v, str) else r(v)], r(p))
    # ...its table's price cell (a number: float() of a price), and the price
    # a pick list shows beside the unit
    for v in [0.125, 0.375, 2.675, 1.005, 5.255, 1234.565, 1200.125,
              1000000.125, -0.125, 0.0, 1e21, 7.0]:
        it = {"price": v, "unit": "EA"}
        case("catalog_table_price", [r(v)], SLICE_FNS["catalog_table_price"](
            SLICE_FNS["catalog_table_price_in"](it)))
        case("catalog_pick_price", [r(v)], SLICE_FNS["catalog_pick_price"](
            SLICE_FNS["catalog_pick_price_in"](it), "EA"))
    # a row's quantity (_value_str), every kind
    vs = NS["TakeoffItemsPanel"]._value_str
    for v in T1 + T2 + NEAR[:4] + [0.0, 1e21, 12.5, 1318.65]:
        for t in ("area", "grid"):
            m = {"type": t, "value": v}
            case("_value_str", [m], vs(m))
        m = {"type": "slope_area", "value": v, "pitch": 4.25}
        case("_value_str", [m], vs(m))
        m = {"type": "tile", "value": v, "tiles_needed": 1234567, "boxes": 3,
             "pattern": "half"}
        case("_value_str", [m], vs(m))
    for p in [12.5, 4.25, 1234565.0, 123456.5, 0.0001, 1e-05, 6.0]:
        m = {"type": "slope_area", "value": 12.25, "pitch": p}
        case("_value_str", [m], vs(m))
    for v in T2 + [1.005, 2.675, 0.005, nxt(0.125), 1234567.125, 1e21]:
        for t in ("distance", "polyline"):
            m = {"type": t, "value": v}
            case("_value_str", [m], vs(m))
    for v, sp in [(12.9, 16.25), (-3.7, 12.0), (1e6 + 0.5, 1234565.0),
                  (31.0, 0.125)]:
        m = {"type": "linear_count", "value": v, "spacing_in": sp}
        case("_value_str", [m], vs(m))
    for q in [2.5, 12.25, 1234565.0, 0.125, 1e21, 100.0]:
        m = {"type": "standalone", "qty": q, "unit": "EA"}
        case("_value_str", [m], vs(m))
    m = {"type": "area", "value": 12.25, "group_count": 2, "scale": '1/4"'}
    case("_value_str", [m], vs(m))
    # a report's quantity and its per-unit totals
    for q in [0.0, 12.25, 0.125, 0.005, 1234.5, 100.0, 0.0049, -0.001,
              1234567.125, 1e21, 2.675, 0.375]:
        case("_fmt_qty", [r(q)], NS["ReportCenterDialog"]._fmt_qty(q))
    ents = [{"qty": 12.25, "unit": "sq ft"}, {"qty": 0.125, "unit": "LF"},
            {"qty": 3.0, "unit": "EA"}, {"qty": 1000.375, "unit": "sq ft"}]
    case("_unit_totals", [ents], NS["ReportCenterDialog"]._unit_totals(ents))
    # money, the report's
    for v in [0.125, 0.375, 1234.625, 1.005, 2.675, -0.125, 1e21, 999999.995,
              1234567.125, 0.005, 10.0]:
        case("report_money", [r(v)], SLICE_FNS["report_money"](v))
    # the zoom readout: int(zoom * 100), and "Fit " on the floor
    for z in [0.125, 0.29, 0.335, 0.215, 1.0, 0.565, 2.675, 0.07, 10.0,
              0.0105, 0.57, 0.58, 1.15, 0.995, 0.1234, 0.055]:
        for floor in (False, True):
            w = Window(z, floor)
            w.update_zoom_label()
            case("update_zoom_label", [r(z), floor], w.zoom_label.said[-1])
    # the canvas labels
    canvas_items = []
    for v in T1[:6] + T2[:3] + NEAR[:4] + [0.0, 1e21]:
        canvas_items.append({"type": "area", "value": v,
                             "points": [[0, 0], [10, 0], [10, 10]]})
    canvas_items += [
        {"type": "area", "value": 12.25, "name": "Deck", "notes": "x",
         "points": [[0, 0], [10, 0], [10, 10]]},
        {"type": "area", "value": 48.0, "own_value": 12.25, "group_id": "g1",
         "group_count": 2, "shape_no": 1, "points": [[0, 0], [10, 0], [10, 10]]},
        {"type": "slope_area", "value": 12.25, "flat_area": 0.125,
         "pitch": 4.25, "points": [[0, 0], [10, 0], [10, 10]]},
        {"type": "slope_area", "value": 1318.65, "flat_area": 2.25,
         "pitch": 1234565.0, "name": "Roof",
         "points": [[0, 0], [10, 0], [10, 10]]},
        {"type": "pitch", "value": 6.25, "angle_deg": 27.5,
         "points": [[0, 0], [48, 25]]},
        {"type": "pitch", "value": 2.5, "angle_deg": 2.5, "name": "Eave",
         "points": [[0, 0], [48, 25]]},
        {"type": "pitch", "value": 0.25, "angle_deg": 1.5,
         "points": [[0, 0], [48, 25]]},
        {"type": "linear_count", "value": 12.9, "spacing_in": 16.25,
         "points": [[0, 0], [10, 0]]},
        {"type": "linear_count", "value": -3.7, "spacing_in": 1234565.0,
         "points": [[0, 0], [10, 0]]},
        {"type": "polyline", "value": 1.875, "points": [[0, 0], [10, 0]]},
        {"type": "polyline", "value": ties_for(12)[3], "name": "Fence",
         "points": [[0, 0], [10, 0]]},
        {"type": "grid", "value": 12.5, "cell_w_ft": 2.25, "cell_h_ft": 0.125,
         "cell_w_px": 5.0, "cell_h_px": 5.0, "angle": 0.0, "cols": 2,
         "rows": 2, "points": [[0, 0], [10, 0], [10, 10], [0, 10]]},
        {"type": "grid", "value": 1234567.5, "cell_w_ft": 1234565.0,
         "cell_h_ft": 2.5, "cell_w_px": 5.0, "cell_h_px": 5.0, "angle": 0.0,
         "cols": 2, "rows": 2, "name": "Slab",
         "points": [[0, 0], [10, 0], [10, 10], [0, 10]]},
        {"type": "tile", "value": 12.5, "tile_count": 1234567,
         "tiles_needed": 1358024, "waste_pct": 12.5, "tile_w_in": 12.25,
         "tile_h_in": 1234565.0, "pattern": "third", "boxes": 4,
         "points": [[0, 0], [10, 0], [10, 10]]},
        {"type": "ref_distance", "value": ties_for2(12, 2)[2], "ppf": 37.5,
         "scale": '1/4"', "precision": "1/2", "points": [[0, 0], [10, 0]]},
        # a Measure line: to the whole inch on the canvas (format_ft), whatever
        # its precision -- 3.125 ft is 37.5 in, an inch tie
        {"type": "distance", "value": 3.125, "precision": "1/2",
         "points": [[0, 0], [10, 0]]},
        {"type": "distance", "value": 3.1, "precision": "1/2",
         "points": [[0, 0], [10, 0]]},
        {"type": "distance", "value": ties_for(12)[5], "precision": "1/16",
         "name": "Ruler", "notes": "x", "points": [[0, 0], [10, 0]]},
        {"type": "distance", "value": 1234.5625, "points": [[0, 0], [10, 0]]},
    ]
    for m in canvas_items:
        c = Canvas()
        c._gl_draw_measurement_label(m, 37.5)
        case("canvas_label", [m], c.blits[0] if c.blits else "")
    # the live read-outs while a tool draws (pts on the desktop hold the
    # cursor as their last point; the web's are the clicks and a cursor)
    side = 131.25                     # 131.25 px at 37.5 px/ft: 3.5 ft
    sq = [[0, 0], [side, 0], [side, side]]
    for mode, clicks, cursor, extra in [
            ("area", sq, [0, side], {}),
            ("slope_area", sq, [0, side], {}),
            ("tile", sq, [0, side], {"_tile_w_in": 12.0, "_tile_h_in": 12.0,
                                     "_tile_grout_in": 0.0}),
            ("tile", sq, [0, side], {"_tile_w_in": 11.5, "_tile_h_in": 12.0,
                                     "_tile_grout_in": 0.5}),
            ("area", [[0, 0], [70.3125, 0]], None, {}),
            ("pitch", [[0, 0]], [48, 25], {}),
            ("pitch", [[0, 0]], [24, 5], {}),
            ("pitch", [[0, 0]], [0, 25], {}),
            ("distance", [[0, 0]], [70.3125, 0], {}),
            ("calibrate", [[0, 0]], [1.5, 2.0], {}),
            ("calibrate", [[0, 0]], [3.5, 0], {}),
            ("polyline", [[0, 0], [70.3125, 0]], None, {})]:
        c = Canvas(_mode=mode, **extra)
        if mode in ("pitch",):
            c._current_measurement = [list(p) for p in clicks]
            c._cursor_page_pt = tuple(cursor)
        elif mode in ("area", "slope_area", "tile"):
            c._current_measurement = [list(p) for p in clicks]
            c._cursor_page_pt = tuple(cursor) if cursor else None
        elif mode == "polyline":
            c._current_measurement = [list(p) for p in clicks]
        else:
            c._current_measurement = [list(p) for p in clicks] + [list(cursor)]
        c._gl_draw_preview_label(37.5)
        case("preview_label", [{"mode": mode, "points": clicks, "cursor": cursor,
                                "tileWIn": extra.get("_tile_w_in"),
                                "tileHIn": extra.get("_tile_h_in"),
                                "groutIn": extra.get("_tile_grout_in")}, 37.5],
             c.blits[0] if c.blits else "")
    # a reissue on other paper: its refusal's sizes, int() of each
    for rev, sheet in [((2592.7, 1728.5), (5400.2, 3600.9)),
                       ((7200.0, 4800.0), (3400.0, 2200.0))]:
        c = Canvas(_page_sizes={0: sheet}, _preview_size=rev)
        case("_size_refusal", [list(sheet), list(rev)], c._size_refusal())
    # the slope form
    for flat, pitch in [(12.25, 0.0), (0.125, 4.25), (1318.65, 12.5),
                        (2.25, 6.0)]:
        s = Slope(flat, pitch)
        s._update_pitch_display()
        case("slope_dialog", [r(flat), r(pitch)],
             [s._factor_lbl.said[-1], s._area_lbl.said[-1]])
    # the finished shapes' words, and the reshape's
    for a in T1[:4] + T2[:2] + T0[:4] + NEAR[:2] + [1e21]:
        case("area_suggest", [r(a)], SLICE_FNS["area_suggest"](a))
        case("area_label", [r(a)], SLICE_FNS["area_label"]("", a))
        case("recalc_area", [r(a)], SLICE_FNS["recalc_area"](a))
        case("run_suggest", [r(a)], SLICE_FNS["run_suggest"](a))
    for ft in ties_for(12)[:4]:
        case("run_label", [r(ft)], SLICE_FNS["run_label"]("", ft))
    # a finished slope roof: the web finds the sloped area from the flat one
    # (sqrt(1 + (pitch / 12) ** 2), the desktop's arithmetic), so the pitches
    # are ones whose factor is exact -- 0 (1) and 9 (1.25) -- and the flat
    # areas ones that land the sloped area on a tie
    for flat, pitch in [(12.25, 0.0), (0.125, 0.0), (1.0, 9.0), (3.0, 9.0),
                        (5.0, 9.0), (9.0, 9.0), (1318.65, 9.0)]:
        sloped = flat * math.sqrt(1 + (pitch / 12) ** 2)
        ps = SLICE_FNS["slope_pitch_str"](pitch)
        case("slope_label", [r(flat), r(pitch)],
             SLICE_FNS["slope_label"]("", sloped, ps))
    for sloped, pitch in [(12.25, 4.25), (0.125, 12.5), (1318.65, 1234565.0),
                          (2.5, 0.0001)]:
        case("recalc_slope", [r(sloped), r(pitch)],
             SLICE_FNS["recalc_slope"](sloped,
                                       SLICE_FNS["recalc_pitch_str"](pitch)))
    for cw, ch in [(2.25, 0.125), (1234565.0, 2.5), (2.0, 4.0), (0.35, 0.45)]:
        case("grid_suggest", [3, 4, r(cw), r(ch)],
             SLICE_FNS["grid_suggest"](3, 4, Obj(_grid_cell_w=cw,
                                                 _grid_cell_h=ch)))
    for n, pat in [(1234567, "grid"), (12, "half"), (0, "third")]:
        case("tile_label", [n, pat],
             SLICE_FNS["tile_label"]({"tile_count": n}, pat))
        case("recalc_tile", [n, pat],
             SLICE_FNS["recalc_tile"]({"tile_count": n, "pattern": pat}))
    for count, sp in [(31, 16.25), (7, 1234565.0), (12, 12.0), (3, 0.125)]:
        case("array_suggest", [count, r(sp)],
             SLICE_FNS["array_suggest"](count, SLICE_FNS["array_sp_str"](sp)))
        case("recalc_array", [count], SLICE_FNS["recalc_array"](count))
    # the reshape of a Measure line: its length words, named or not, at the
    # precision it carries ("1/2" when it carries none)
    for ft in ties_for2(12, 2)[:4] + [3.125, 5.0, ties_for2(12, 8)[1]]:
        for extra in ({}, {"precision": "1/8"}, {"precision": "Nearest Inch"},
                      {"precision": "1/2", "name": "Ruler"}):
            m = dict(extra)
            case("recalc_distance", [r(ft), m], SLICE_FNS["recalc_distance"](
                ft, SLICE_FNS["recalc_dist_prec"](m)))
    # ...of a grid: the cells it now spans, or its name
    for name, cols, rows in [("", 3, 2), ("", 1, 1), ("Slab", 4, 4),
                             ("", 12, 1)]:
        case("recalc_grid", [name, cols, rows],
             SLICE_FNS["recalc_grid"](name, cols, rows))
    # ...of a pitch line: its rise and angle from the two ends, and its words
    for p0, p1, name in [([0, 0], [78, 45], ""), ([100, 300], [178, 345], ""),
                         ([0, 0], [48, 25], ""), ([0, 0], [24, 5], ""),
                         ([0, 0], [96, 50], "Eave"), ([5, 0], [5, 30], ""),
                         ([0, 0], [10, 0], ""), ([0, 0], [120, 49.5], "")]:
        rise12, angle = NS["_pitch_from_points"](p0, p1)
        # ...and the canvas label the reshaped line then draws (a vertical
        # one's rise is inf there: 'vertical')
        m = {"type": "pitch", "points": [p0, p1], "name": name, "value": 99.0,
             "angle_deg": 1.0, "label": "stale", "ppf": 10.0}
        Reshape()._recalc_value(m)
        c = Canvas()
        c._gl_draw_measurement_label(m, 37.5)
        case("recalc_pitch", [p0, p1, name],
             [r(rise12), r(angle), SLICE_FNS["recalc_pitch"](name, rise12),
              c.blits[0] if c.blits else ""])
    # ...of a grid's outline: the cells it now spans (cols, rows, and the
    # label an unnamed one writes), its area, and its canvas label
    for m in GRID_SHAPES:
        g = json.loads(json.dumps(m))
        Reshape()._recalc_value(g)
        c = Canvas()
        c._gl_draw_measurement_label(g, 37.5)
        case("recalc_grid_shape", [m], [g["cols"], g["rows"], g["label"],
                                        r(g["value"]), c.blits[0]])
    # the canvas of a grid whose stored count is stale (a save that counted
    # another way): its label as stored above the cells it spans
    for m in [_grid(_L, 40.0, 40.0, cols=4, rows=4, label="Grid 4×4",
                    value=75.0),
              _grid(_L, 40.0, 40.0, cols=4, rows=4, label="", value=75.0)]:
        c = Canvas()
        c._gl_draw_measurement_label(m, 37.5)
        case("canvas_label", [m], c.blits[0] if c.blits else "")
    # the workbook's quantities (Takeoff sheet, a material there, the
    # Materials sheet)
    for key, m in WB_ITEMS:
        case("xlsx_qty", [key, m], workbook_qty(m))
    # the Report Center's rows: each item's money and its materials'
    case("report_collect", [PIN_JOB], report_collect(PIN_JOB))
    # the tile form's estimate: its area, the tiles with waste, the boxes
    for area, waste, needed, per_box in [(1235.25, 10.0, 1331, 1),
                                         (12.25, 12.5, 1234567, 3),
                                         (1234567.125, 0.0, 7, 0),
                                         (0.125, 2.5, 1000, 999)]:
        case("tile_form", [r(area), r(waste), needed, per_box],
             [SLICE_FNS["tile_form_area"](area),
              SLICE_FNS["tile_form_needed"](waste, needed),
              SLICE_FNS["tile_form_boxes"](needed, per_box)
              if per_box > 0 else ""])
    # the CSV of a job as this app saves it (a whole number is an int there),
    # through the desktop's own export rows and csv.writer
    case("export_csv", [CSV_JOB], export_csv(CSV_JOB))
    # the calibration
    for d, ft in [(30.25, 2.0), (1234.25, 10.0), (20.125, 1.0),
                  (500.0, 12.5)]:
        case("calib_line", [r(d)], SLICE_FNS["calib_line"](d))
        case("calib_set", [r(d), r(ft)],
             SLICE_FNS["calib_set"](d / ft, d, ft))
    for ppf in [15.125, 37.5, 28.255, 1234.125, 0.125]:
        case("scale_readout", [r(ppf)], SLICE_FNS["scale_readout"](ppf))
    # the export: what is rounded before it is written, and its words
    for v in T2 + T1[:3] + NEAR + [0.00005, 0.00015, 1e21, -0.0]:
        case("export_round4", [r(v)], r(SLICE_FNS["export_round4"]({"value": v})))
    for q, rate in [(12.25, 0.5), (0.125, 1.0), (3.0, 0.375), (1234.5, 1.25),
                    (2.0, 1.005), (1.0, 2.675), (10.0, 0.0125)]:
        case("export_cost", [r(q), r(rate)], r(SLICE_FNS["export_cost"](q, rate)))
    for m in [{"tiles_needed": 1234567.9, "tile_w_in": 12.25,
               "tile_h_in": 1234565.0, "pattern": "herringbone",
               "waste_pct": 12.5, "boxes": 3},
              {"tiles_needed": 12, "tile_w_in": 0.125, "tile_h_in": 6.0,
               "pattern": "grid", "waste_pct": 0.0001}]:
        case("export_tile", [m], SLICE_FNS["export_tile"](m))
    for sp in [16.25, 1234565.0, 12.0, 0.125]:
        case("export_spacing", [r(sp)],
             SLICE_FNS["export_spacing"]({"spacing_in": sp}))
    # the materials
    for q in [12.25, 1234565.0, 0.125, 2.5, 0.0001, 1e21]:
        case("mat_total", [r(q)], SLICE_FNS["mat_total"](q, "EA"))
        case("mat_parent", [r(q)],
             SLICE_FNS["mat_parent"]("Wall", Obj(_parent_val=q), "LF"))


def helpers():
    """Python's own format() on generated ties (and their neighbours) for
    nd 0..6 and 'g' -- what js/core/pyformat.js is held to."""
    vals = []
    for nd in range(0, 7):
        den = 2 ** (nd + 1)            # j / 2^(nd+1), j odd: a tie at nd places
        for j in (1, 3, 5, 25, 101, 1001, 12345):
            x = j / den
            vals += [x, -x, nxt(x), prv(x), x + 1e6]
    vals += CORPUS
    vals += [1e16, 1.5e16, 2.0 ** 53, 2.0 ** 53 + 2, 1e300, 5e-324, 1e-30,
             9999995.0, 99999.95, 999999.5]
    seen, out = set(), []
    for x in vals:
        key = repr(x)
        if key in seen:
            continue
        seen.add(key)
        row = {"x": key,
               "f": [format(x, ".%df" % n) for n in range(0, 7)],
               "fc": [format(x, ",.%df" % n) for n in range(0, 7)],
               "g": [format(x, ".%dg" % p) for p in range(1, 8)],
               "r": [repr(round(x, n)) for n in range(0, 7)],
               "s": str(x)}
        if abs(x) < 1e300:
            row["ri"] = str(round(x))
            row["i"] = str(int(x))
            row["ic"] = format(int(x), ",")
        out.append(row)
    return out


def main():
    run_corpus()
    out = {
        "lifted": {"module": MODULE_NAMES,
                   "static": ["%s.%s" % (c, n) for c, ns in STATICS.items()
                              for n in ns],
                   "methods": ["%s.%s" % (c, n) for c, ns in METHODS.items()
                               for n in ns],
                   "slices": ["%s.%s %s" % (c, m, n)
                              for n, c, m, _h, _k, _p in SLICES]},
        "cases": CASES,
        "helpers": helpers(),
    }
    text = json.dumps(out, ensure_ascii=True, separators=(",", ":")) + "\n"
    if WRITE:
        with open(SNAPSHOT, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
        print("wrote %s: %d cases, %d helper rows, %d bytes"
              % (os.path.basename(SNAPSHOT), len(CASES), len(out["helpers"]),
                 len(text)), flush=True)
    else:
        sys.stdout.write(text)
        sys.stdout.flush()


if __name__ == "__main__":
    main()
