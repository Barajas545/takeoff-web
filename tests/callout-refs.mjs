// callout-refs.mjs — a callout's target has to move with the sheets.
//
// `ref_page` is an index INTO the set, not a property of the page the pin
// sits on, so none of the per-page bucket shuffling touches it. Nothing read
// it until the preview did, so an off-by-one here would not crash — it would
// quietly show the wrong detail, which is worse.
//
// Run: node tests/callout-refs.mjs
import { Project } from '../js/core/project.js';

let failed = 0;
const ok = (cond, msg) => {
  if (cond) { console.log('  ok   ' + msg); return; }
  failed++;
  console.log('  FAIL ' + msg);
};

function build(pageCount, pins) {
  const p = new Project();
  p.loadFrom({ metadata: { page_labels: Array.from({ length: pageCount }, (_, i) => `S${i}`) },
               annotations: {}, measurements: {}, pageCount });
  for (const [onPage, refPage] of pins) {
    (p.measurements[onPage] ||= []).push({
      type: 'page_ref', points: [[10, 10]], ref_page: refPage,
      ref_zone: [0.1, 0.1, 0.2, 0.2], ref_page_label: `S${refPage}`, visible: true,
    });
  }
  return p;
}

const refs = p => Object.values(p.measurements).flat()
  .filter(m => m.type === 'page_ref')
  .map(m => (Object.prototype.hasOwnProperty.call(m, 'ref_page') ? m.ref_page : 'gone'));

console.log('-- inserting a sheet --');
{
  // pins on page 0 pointing at 0, 2, 4 of a 5-sheet set
  const p = build(5, [[0, 0], [0, 2], [0, 4]]);
  p.notePagesInserted(2, 1);            // a new sheet becomes index 2
  ok(JSON.stringify(refs(p)) === JSON.stringify([0, 3, 5]),
     `targets at/after the insert shift, earlier ones do not — got ${JSON.stringify(refs(p))}`);
  ok(p.pageCount === 6, 'page count grew');
}

console.log('\n-- inserting several --');
{
  const p = build(5, [[0, 1], [0, 3]]);
  p.notePagesInserted(1, 3);
  ok(JSON.stringify(refs(p)) === JSON.stringify([4, 6]),
     `both shift by the count — got ${JSON.stringify(refs(p))}`);
}

console.log('\n-- inserting at the very end --');
{
  const p = build(3, [[0, 0], [0, 2]]);
  p.notePagesInserted(3, 1);
  ok(JSON.stringify(refs(p)) === JSON.stringify([0, 2]),
     `nothing before the end moves — got ${JSON.stringify(refs(p))}`);
}

console.log('\n-- removing a sheet --');
{
  const p = build(5, [[0, 1], [0, 3], [0, 4]]);
  p.notePageRemoved(3);
  ok(JSON.stringify(refs(p)) === JSON.stringify([1, 'gone', 3]),
     `the pin AT the removed sheet loses its target rather than sliding onto `
     + `whatever took its place; later ones shift down — got ${JSON.stringify(refs(p))}`);
}

console.log('\n-- removing the sheet a pin lives on --');
{
  const p = build(4, [[2, 0], [0, 3]]);
  p.notePageRemoved(2);                 // takes its own pin with it
  ok(JSON.stringify(refs(p)) === JSON.stringify([2]),
     `the surviving pin's target shifted — got ${JSON.stringify(refs(p))}`);
}

console.log('\n-- a pin with no ref_page is left alone --');
{
  const p = new Project();
  p.loadFrom({ metadata: { page_labels: ['A', 'B', 'C'] }, annotations: {},
               measurements: {}, pageCount: 3 });
  p.measurements[0] = [{ type: 'page_ref', points: [[1, 1]], ref_page_label: 'C' }];
  p.notePagesInserted(1, 1);
  const m = p.measurements[0][0];
  ok(!('ref_page' in m) && m.ref_page_label === 'C',
     'a label-only pin is untouched');
}

console.log('\n-- other item types are never touched --');
{
  const p = build(4, []);
  p.measurements[0] = [{ type: 'area', points: [[0, 0]], ref_page: 99 }];
  p.notePagesInserted(0, 2);
  ok(p.measurements[2][0].ref_page === 99,
     'a stray ref_page on a non-callout is not rewritten');
}

console.log(failed ? `\n${failed} CHECK(S) FAILED` : '\nAll callout-reference checks passed');
process.exit(failed ? 1 : 0);
