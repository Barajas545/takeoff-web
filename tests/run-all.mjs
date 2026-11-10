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
  'callout-view',       // the detail preview's window: fit, pan, zoom, decode
  'page-store-cache',   // the byte cache cannot answer for another sheet
  'scratch-store',      // temporary dimensions cannot reach a saved file
  'remote-file',        // HTTP-range reads, against a stub server
  'sw-precache',        // the worker precaches every module main.js can load
  'catalog-search',     // the matcher (differential part needs its truth file)
  'revisions-logic',    // edge cases + the committed snapshot; live diff opt-in
  'ref-distance',       // it is drawn, distinctly, and keeps its own scale
  'revision-counting',  // what counts == the desktop's own methods (closure-checked)
  'revision-web-flow',  // origins follow their sheets; stamp, book, undo; reports
  'count-undo',         // Ctrl+Z keeps the count: the desktop's sections; diff + tag check need its source
  'zoom-floor',         // zooming out stops at Fit == the desktop's own methods; touch, resize, Settings, pictures
  'rounding-parity',    // every number reads as the desktop writes it (Python's rounding); no display toFixed left
  'py-json',            // the desktop's Infinity / -Infinity / NaN read and written as Python's json does; nothing else changes
  'tile-form-browser',  // the tile form's sizes are the desktop's presets, picked by real keys (skips without Chrome)
  'menu-touch',         // every menu entry can be tapped by finger at a phone's and a tablet's width; File › Save is a Save (skips without Chrome)
  'heading-menu',       // a finger's hold and the heading menu == the desktop's; forms list the job's names first
  'classification-rename', // rename a heading / set the blank ones == the desktop's plan, writes, follows and undo
  'picture-overlay-format', // a save keeps the 3.06 overlay; undo keeps one copy of its picture
  'overlay-look',       // the saved overlay on arrival == the desktop's look and restore rule; never the wrong sheet; writes nothing
  'overlay-browser',    // ...its mask as headless Chrome builds it == the desktop's, however the source is read (skips without Chrome)
  'phone-layout-browser', // real taps, phone to desktop: Infinity opens, the toast clears the strip and an open menu, every tool bar on screen, the toolbars grown too (skips without Chrome)
  'update-line-browser',  // two versions served in turn: "a new version is ready" only when the page is behind, behind a v28/v29 worker too (skips without Chrome)
  'plans-folder',       // the Plans Archive: projects, plan files, save guard, made-up folders
  'device-plans',       // plans kept on this device: keep, list, remove, the portal's copies after the move
  'plans-link',         // a #plans link where no folder opens: that job's plans here, the link to copy
  'portal-handoff',     // Portal 2 hands a plan over window to window: only from it, only in its shape
  'save-route',         // where Save sends a file with no handle, and only a confirmed save drops the draft
  'embedded',           // inside the portal: only in a frame of its own site, the portal's ways, a page with no inline script
  'takeoff-lists-parity', // which takeoff an item is in, and what a takeoff is called == the desktop 3.08's own functions
  'takeoff-lists-persist', // a web edit and save keeps every takeoff's tags and keys; new work is Main's; Main-only saves as v31
  'takeoff-lists-view',  // what is painted is what is tapped, deleted, listed, badged and counted onto: Main's
  'takeoff-lists-outputs', // every report, table and export is Main's and names it; Main-only reports and writes as v31
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
  // needs the desktop app itself, run offscreen: desktop -> web -> desktop
  'desktop-round-trip',
  // needs a checkout of the employee portal (PTT_PORTAL): its plan links
  // and this app's Plans Archive agree on the #plans link and the switch
  'portal-plans-link',
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
