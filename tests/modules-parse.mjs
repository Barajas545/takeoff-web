// Every module must parse AS A MODULE, and every import must resolve.
//
// `node --check foo.js` parses a .js file as a CommonJS script and is lenient
// about things a module parser rejects — it happily accepted a literal newline
// inside a single-quoted string that broke the whole app in the browser, with
// nothing but "Invalid or unexpected token" and no file name.
//
// So: copy each file to .mjs to force module parsing, then actually import the
// graph, which also catches a missing or misspelled export.
import { readdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = new URL('../js/', import.meta.url);

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.js')) yield p;
  }
}

const jsDir = path.resolve(ROOT.pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const tmp = await mkdtemp(path.join(tmpdir(), 'ptt-parse-'));
let fails = 0;
let n = 0;

for await (const file of walk(jsDir)) {
  n += 1;
  const rel = path.relative(jsDir, file);
  const probe = path.join(tmp, rel.replace(/[\\/]/g, '_') + '.mjs');
  await writeFile(probe, await readFile(file));
  try {
    await run(process.execPath, ['--check', probe]);
  } catch (err) {
    fails += 1;
    const msg = String(err.stderr || err.message)
      .split('\n').filter(l => l.trim()).slice(0, 4).join('\n    ');
    console.log(`FAIL ${rel}\n    ${msg}`);
  }
}
await rm(tmp, { recursive: true, force: true });

// The import graph. A module that parses can still reference an export that
// does not exist — that only shows up when something imports it.
//
// Anything touching the DOM at module scope cannot be imported here; those are
// covered by the browser smoke test instead.
const BROWSER_ONLY = new Set(['main.js', 'settings.js', 'dialogs.js', 'catalog.js',
  'assemblies.js', 'items-panel.js', 'reports.js', 'thumbnails.js']);
const IMPORTABLE = [
  'core/takeoff-file.js', 'core/zlib.js', 'core/page-store.js', 'core/project.js',
  'core/geom.js', 'core/units.js', 'core/measure.js', 'core/xlsx.js',
  'core/revisions.js',
  'core/scratch.js',
  'render/viewport.js', 'render/theme.js', 'render/markers.js', 'render/callouts.js',
  'tools/markup.js', 'tools/controller.js',
];
for (const rel of IMPORTABLE) {
  try {
    await import(new URL(rel, ROOT).href);
  } catch (err) {
    fails += 1;
    console.log(`FAIL import ${rel}\n    ${err.message}`);
  }
}

console.log(fails
  ? `\n${fails} MODULE(S) FAILED`
  : `\nAll ${n} modules parse as modules; ${IMPORTABLE.length} import cleanly`
    + `\n(${BROWSER_ONLY.size} DOM-bound modules are covered by the browser smoke test)`);
process.exit(fails ? 1 : 0);
