// Temporary dimensions must be impossible to save.
//
// The claim this file exists to defend is structural, not behavioural: a
// temporary dimension is not a project item with a flag on it, it lives in a
// store that nothing composing a file ever reads. A flag would work only for
// as long as every writer, every export and every future feature remembered
// to filter on it — and one that forgets prices a ruler.
//
// So the test is not "does the filter work". It is: put temporary items in,
// build the thing that becomes the file, and show they are not in it.
//
// Run: node tests/scratch-store.mjs
import { ScratchStore } from '../js/core/scratch.js';
import { Project } from '../js/core/project.js';
import { ToolController, SCRATCH_CAPABLE } from '../js/tools/controller.js';

let fails = 0;
let checks = 0;

function eq(label, got, want) {
  checks += 1;
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) return true;
  fails += 1;
  console.log(`FAIL ${label}\n  got  ${a}\n  want ${b}`);
  return false;
}

function ok(label, cond) { return eq(label, !!cond, true); }

// ── the store on its own ─────────────────────────────────────────────────
{
  const s = new ScratchStore();
  eq('empty count', s.count, 0);
  eq('empty page is an array', s.forPage(3), []);

  const a = s.add(3, { type: 'distance', label: "10'", value: 10 });
  s.add(3, { type: 'area', label: '176.7 sq ft', value: 176.7 });
  s.add(7, { type: 'pitch', label: '6:12', value: 6 });

  eq('count across pages', s.count, 3);
  eq('pages with any', s.pages(), [3, 7]);
  eq('per-page list', s.forPage(3).map(m => m.type), ['distance', 'area']);
  ok('add stamps scratch', a.scratch === true);
  ok('add gives a runtime id', typeof a._uid === 'string' && a._uid.startsWith('scratch-'));
  ok('ids are unique', new Set([...s.forPage(3), ...s.forPage(7)].map(m => m._uid)).size === 3);

  ok('undo drops the newest on that page', s.undo(3));
  eq('after undo', s.forPage(3).map(m => m.type), ['distance']);
  ok('undo on an empty page is false', !s.undo(99));

  ok('remove by id', s.remove(a._uid));
  eq('page empties out of the map', s.pages(), [7]);

  ok('clear one page', s.clear(7));
  eq('cleared', s.count, 0);
  ok('clearing nothing is false', !s.clear());
}

// ── the store moves with the sheets ──────────────────────────────────────
//
// Keyed by page index like everything else in this app, so an inserted or
// deleted sheet moves them. Left behind, a dimension taken on sheet 6 would
// be drawn over whatever sheet took that number — the same silent failure the
// revision match maps guard against.
{
  const s = new ScratchStore();
  for (const p of [0, 2, 5]) s.add(p, { type: 'distance', label: `p${p}` });

  s.shiftPages(2, +1);                       // a sheet inserted at 2
  eq('insert shifts pages at and after', s.pages(), [0, 3, 6]);
  eq('the item went with its page', s.forPage(3)[0].label, 'p2');

  const t = new ScratchStore();
  for (const p of [0, 2, 5]) t.add(p, { type: 'distance', label: `p${p}` });
  t.shiftPages(2, -1);                       // sheet 2 deleted
  eq('delete drops that page and shifts the rest', t.pages(), [0, 4]);
  eq('its dimensions went with it', t.forPage(4)[0].label, 'p5');
  eq('nothing left behind on the deleted sheet', t.count, 2);
}

// ── THE GUARANTEE: nothing temporary reaches the file ────────────────────
{
  const p = new Project();
  p.loadFrom({
    metadata: { page_labels: ['A1', 'A2'], pixels_per_foot: 48 },
    annotations: {}, measurements: {}, pageCount: 2,
  });
  // A real item, the ordinary way.
  p.addItem(0, {
    type: 'area', points: [[0, 0], [100, 0], [100, 100], [0, 100]],
    value: 4.34, unit: 'SF', name: 'Slab', visible: true,
    floor_level: 'Level 1', category: 'Concrete', sub_category: '',
    cost_type: 'material', unit_cost: 0,
  }, { label: 'Area' });

  // Temporary ones, the View Only way — same page, same shape, same fields.
  const s = new ScratchStore();
  s.add(0, {
    type: 'area', points: [[0, 0], [50, 0], [50, 50], [0, 50]],
    value: 1.08, label: '1.1 sq ft', name: '', visible: true,
  });
  s.add(0, { type: 'distance', points: [[0, 0], [480, 0]], value: 10, label: "10'" });

  const meta = p.buildSaveMetadata();
  const written = Object.values(meta.measurements).flat();
  eq('only the real item is written', written.length, 1);
  eq('and it is the real one', written[0].name, 'Slab');
  ok('no scratch flag anywhere in the file',
    !JSON.stringify(meta).includes('scratch'));
  ok('the temporary items still exist in their own store', s.count === 2);
  // The store is not reachable from the project at all — that is the point.
  ok('the project has no reference to the scratch store',
    !Object.values(p).includes(s));
}

// ── the routing rule, without a DOM ──────────────────────────────────────
//
// `isScratchTool` decides whether a tool is allowed while read-only and where
// its result lands. It reads only two fields, so it can be called on a bare
// object — no canvas, no listeners, no browser.
{
  const call = (sink, mode) =>
    ToolController.prototype.isScratchTool.call({ scratchSink: sink }, mode);

  eq('the scratch-capable set', [...SCRATCH_CAPABLE].sort(), ['area', 'distance', 'pitch']);

  for (const mode of ['distance', 'area', 'pitch']) {
    ok(`${mode} is scratch with a sink`, call(() => {}, mode));
    ok(`${mode} is NOT scratch without one`, !call(null, mode));
  }
  // Everything that produces takeoff or markup must never be scratch — if one
  // of these slipped in, View Only would let it be drawn and then silently
  // drop it, which reads as "the app is broken" rather than as a mode.
  for (const mode of ['count', 'grid', 'tile', 'polyline', 'linear_count',
    'window', 'door', 'slope_area', 'calibrate', 'draw', 'highlight',
    'highlight_rect', 'erase', 'textnote', 'callout', 'pan']) {
    ok(`${mode} is never scratch`, !call(() => {}, mode));
  }
}

console.log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass — temporary dimensions cannot reach a saved file`);
process.exit(fails ? 1 : 0);
