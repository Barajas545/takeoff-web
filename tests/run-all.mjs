// Run the suite, and be honest about what actually ran.
//
// Three outcomes, not two. A harness that cannot find the project library
// exits 2 and is reported SKIPPED — because the alternatives are both worse:
// failing would make a correctly-configured red mean the same as an
// unconfigured red, and passing would report success for a check that never
// executed. The summary says how many were skipped and why, every time.
//
//   node tests/run-all.mjs            everything
//   node tests/run-all.mjs --portable only the ones that need no local data
//
// Set PTT_LIBRARY / PTT_DESKTOP_SRC to point the rest at your own machine.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LIBRARY, DESKTOP_SRC, haveLibrary, haveDesktopSource } from './config.mjs';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));

// PORTABLE: no local data of any kind. These must pass in a fresh clone, on
// any machine, in CI. If one of them starts needing the library, it belongs
// in the other list — not quietly skipping everywhere.
const PORTABLE = [
  'modules-parse',      // every file parses AS A MODULE and the graph imports
  'geom-checks',        // geometry and formatting against the Python's numbers
  'study-layout',       // the continuous-scroll layout maths
  'callout-refs',       // callout targets survive page inserts and deletes
  'scratch-store',      // temporary dimensions cannot reach a saved file
  'remote-file',        // HTTP-range reads, against a stub server
  'catalog-search',     // the matcher (differential part needs its truth file)
  'revisions-logic',    // edge cases + the committed snapshot; live diff opt-in
];

// NEEDS THE LIBRARY: these read the estimator's real projects, which is the
// point of them — hand-built fixtures test the maths and skip the wiring.
const LOCAL = [
  'read-real-projects',
  'inspect-items',
  'metadata-shapes',
  'lazy-open',
  'round-trip',
  'revisions-pixels',
  'remote-round-trip',
];

const only = process.argv.includes('--portable');
const list = only ? PORTABLE : [...PORTABLE, ...LOCAL];

const lib = await haveLibrary();
const desk = await haveDesktopSource();
console.log(`library:        ${lib ? LIBRARY : '(none — set PTT_LIBRARY)'}`);
console.log(`desktop source: ${desk ? DESKTOP_SRC : '(none — set PTT_DESKTOP_SRC)'}`);
console.log(`running ${list.length} harness${list.length === 1 ? '' : 'es'}`
  + (only ? ' (portable only)' : '') + '\n');

const results = [];
for (const name of list) {
  process.stdout.write(`${name.padEnd(20)} `);
  const started = process.hrtime.bigint();
  let code = 0;
  let out = '';
  try {
    const r = await run(process.execPath, [path.join(here, `${name}.mjs`)],
      { maxBuffer: 1 << 28, windowsHide: true });
    out = r.stdout;
  } catch (err) {
    code = typeof err.code === 'number' ? err.code : 1;
    out = `${err.stdout || ''}${err.stderr || ''}`;
  }
  const ms = Number((process.hrtime.bigint() - started) / 1000000n);
  const status = code === 0 ? 'PASS' : code === 2 ? 'SKIP' : 'FAIL';
  results.push({ name, status, ms, out });
  // The last non-empty line is each harness's own summary.
  const tail = out.trim().split('\n').filter(Boolean).pop() || '';
  console.log(`${status}  ${String(ms).padStart(6)}ms  ${tail.slice(0, 60)}`);
  if (status === 'FAIL') {
    console.log(out.trim().split('\n').slice(-14).map(l => `    ${l}`).join('\n'));
  }
}

const n = s => results.filter(r => r.status === s).length;
console.log(`\n${n('PASS')} passed, ${n('SKIP')} skipped, ${n('FAIL')} failed`);
if (n('SKIP')) {
  console.log('skipped: ' + results.filter(r => r.status === 'SKIP')
    .map(r => r.name).join(', '));
  console.log('These need the estimator\'s project library. They are not '
    + 'optional coverage — they are\nwhere the wiring bugs have been found. '
    + 'Set PTT_LIBRARY to run them.');
}
process.exit(n('FAIL') ? 1 : 0);
