// A real project, opened over a Range server instead of from disk, then saved.
// The bytes must match what the same project saves to from a local File —
// otherwise the network path writes a file the desktop app cannot open.
import fs from 'node:fs';
import path from 'node:path';
import { openProject, writeProject } from '../js/core/takeoff-file.js';
import { pageBlob } from '../js/core/takeoff-file.js';
import { RemoteFile } from '../js/core/remote-file.js';
import { LIBRARY, haveLibrary, skip } from './config.mjs';

const LIB = LIBRARY;
// This one runs against the real project library. Without one it SKIPS rather
// than fails — see tests/config.mjs.
if (!await haveLibrary()) skip('no project library at ' + LIBRARY);

let fails = 0;
const ok = (name, cond) => { if (!cond) { fails++; console.log(`FAIL ${name}`); } else console.log(`ok   ${name}`); };

// smallest real project, so the test is quick
function* walk(dir, d = 0) {
  if (d > 3) return;
  let es; try { es = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of es) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'Backups') yield* walk(p, d + 1); }
    else if (e.name.toLowerCase().endsWith('.takeoff')) yield p;
  }
}
const files = [...walk(LIB)].map(p => ({ p, size: fs.statSync(p).size }))
  .filter(r => r.size > 0).sort((a, b) => a.size - b.size);
if (!files.length) { console.log('no projects in the library — skipped'); process.exit(0); }
const pick = files[0];
const bytes = new Uint8Array(fs.readFileSync(pick.p));
console.log(`using ${path.basename(pick.p)} (${(pick.size / 1048576).toFixed(1)} MB)`);

// a Range server over those bytes
let reqs = 0, wire = 0;
const real = globalThis.fetch;
globalThis.fetch = async (url, opts) => {
  reqs++;
  const m = /bytes=(\d+)-(\d+)/.exec((opts.headers || {}).Range || '');
  const a = Number(m[1]), z = Math.min(Number(m[2]) + 1, bytes.length);
  wire += z - a;
  return { ok: true, status: 206, arrayBuffer: async () => bytes.slice(a, z).buffer };
};

const localFile = new Blob([bytes]);

const remoteFile = new RemoteFile({ url: 'x', name: path.basename(pick.p), size: bytes.length });

const A = await openProject(localFile);
const B = await openProject(remoteFile);
globalThis.fetch = real;

ok('same sheet count',   A.pageCount === B.pageCount);
ok('same page index',    JSON.stringify(A.pages) === JSON.stringify(B.pages));
ok('same revision index',JSON.stringify(A.revisions) === JSON.stringify(B.revisions));
ok('same metadata',      JSON.stringify(A.metadata) === JSON.stringify(B.metadata));
ok('same measurements',  JSON.stringify(A.measurements) === JSON.stringify(B.measurements));
console.log(`     opened ${A.pageCount} sheets on ${wire.toLocaleString()} bytes in ${reqs} requests`);

// save both and compare
globalThis.fetch = async (url, opts) => {
  const m = /bytes=(\d+)-(\d+)/.exec((opts.headers || {}).Range || '');
  const a = Number(m[1]), z = Math.min(Number(m[2]) + 1, bytes.length);
  return { ok: true, status: 206, arrayBuffer: async () => bytes.slice(a, z).buffer };
};
const meta = { ...A.metadata, annotations: {}, measurements: {} };
const src = o => ({
  metadata: meta,
  pageSources: o.pages.map(e => ({ kind: 'slice', data: pageBlob(o.file, e) })),
  revisionSources: o.revisions.map(set => set.map(e => ({ kind: 'slice', data: pageBlob(o.file, e) }))),
});
const outA = new Uint8Array(await (await writeProject(src(A))).arrayBuffer());
const outB = new Uint8Array(await (await writeProject(src(B))).arrayBuffer());
globalThis.fetch = real;

ok('remote save is the same length as local', outA.length === outB.length);
let diff = -1;
for (let i = 0; i < Math.min(outA.length, outB.length); i++) {
  if (outA[i] !== outB[i]) { diff = i; break; }
}
ok('remote save is byte-identical to local', diff === -1);
if (diff >= 0) console.log(`   first difference at byte ${diff}`);

// and it still reopens
const back = await openProject(new Blob([outB]));
ok('the file written from a remote project reopens', back.pageCount === A.pageCount);

console.log(fails ? `\n${fails} FAILED` : '\nremote-round-trip: all checks passed');
process.exit(fails ? 1 : 0);
