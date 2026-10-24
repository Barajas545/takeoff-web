// The Plans Archive: plan files from a folder on this computer.
//
// Everything in js/core/plans-folder.js is driven here through made-up
// File System Access handles — directories and files that exist only in this
// process, with made-up projects in them — so it runs anywhere, with no
// browser and no real plans. The handles count what is asked of them, which
// is how "Photos is never walked" and "a listing reads no file" are measured
// rather than assumed.
//
// One real file is involved: a tiny .takeoff written by the app's own writer
// (js/core/takeoff-file.js), so the file a walk hands over is shown to open
// in the app's own reader, and a save written back through the handle is
// shown to be told apart from somebody else's.
//
// Run: node tests/plans-folder.mjs
import {
  PROJECT_NUMBER, normDashes, projectCodeOf, parseProjectCode, compareCodes, fileKind,
  isHiddenName, isOlderCopiesFolder, listTopFolders, matchProject, describeChosenFolder,
  walkPlans, filesOf, fileStamp, changedSince, resolvePlansSource, parsePlansLink,
  permissionOf, askPermission, canPickFolders, PlansFolders, memoryBackend, PLANS_DIR, restOfName,
  ARCHIVE_MARKER, isOneDriveArchive,
} from '../js/core/plans-folder.js';
import { PLANS_SOURCE } from '../js/site-config.js';
import { writeProject, openProject } from '../js/core/takeoff-file.js';

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
const ok = (label, cond) => eq(label, !!cond, true);
async function rejects(label, fn, re) {
  try { await fn(); } catch (err) { return ok(`${label} (${err.message})`, re.test(err.message)); }
  return ok(`${label} — expected a refusal`, false);
}

// ── made-up handles ──────────────────────────────────────────────────────
const stats = { listings: new Map(), getFile: 0 };
const notFound = name => Object.assign(new Error(`${name} is not there`), { name: 'NotFoundError' });

class FakeFile {
  constructor(name, data = new Uint8Array(0), lastModified = 1_000) {
    this.kind = 'file';
    this.name = name;
    this.data = data;
    this.lastModified = lastModified;
    this.gone = false;
    this.perm = 'granted';
  }
  async getFile() {
    stats.getFile += 1;
    if (this.gone) throw notFound(this.name);
    return new File([this.data], this.name, { lastModified: this.lastModified });
  }
  async createWritable() {
    const parts = [];
    return {
      write: async b => { parts.push(b instanceof Blob ? new Uint8Array(await b.arrayBuffer()) : b); },
      close: async () => {
        const all = new Blob(parts);
        this.data = new Uint8Array(await all.arrayBuffer());
        this.lastModified = ++clock;
      },
    };
  }
  async isSameEntry(o) { return o === this; }
  async queryPermission() { return this.perm; }
  async requestPermission() { return this.perm === 'denied' ? 'denied' : (this.perm = 'granted'); }
}
let clock = 50_000;

class FakeDir {
  constructor(name, kids = []) {
    this.kind = 'directory';
    this.name = name;
    this.kids = new Map();
    this.parent = null;
    this.perm = 'granted';
    for (const k of kids) this.add(k);
  }
  add(h) { h.parent = this; this.kids.set(h.name, h); return h; }
  async *values() {
    stats.listings.set(this, (stats.listings.get(this) || 0) + 1);
    for (const h of this.kids.values()) yield h;
  }
  async getDirectoryHandle(name) {
    const h = this.kids.get(name);
    if (!h || h.kind !== 'directory') throw notFound(name);
    return h;
  }
  async getFileHandle(name) {
    const h = this.kids.get(name);
    if (!h || h.kind !== 'file') throw notFound(name);
    return h;
  }
  async isSameEntry(o) { return o === this; }
  async resolve(h) {
    const parts = [];
    for (let n = h; n; n = n.parent) {
      if (n === this) return parts.reverse();
      parts.push(n.name);
    }
    return null;
  }
  async queryPermission() { return this.perm; }
  async requestPermission() { return this.perm === 'denied' ? 'denied' : (this.perm = 'granted'); }
}

/** { 'name/': {…} is a folder, 'name': [lastModified, bytes?] is a file } */
function tree(name, spec) {
  const d = new FakeDir(name);
  for (const [k, v] of Object.entries(spec)) {
    if (k.endsWith('/')) d.add(tree(k.slice(0, -1), v));
    else d.add(new FakeFile(k, v[1] || new Uint8Array(4), v[0]));
  }
  return d;
}
const listed = d => stats.listings.get(d) || 0;

// ── names ────────────────────────────────────────────────────────────────
const codes = [
  ['A249', 'A249'], ['A249 - 1 Test St - Testville', 'A249'], ['a249', 'A249'],
  ['  A249   old', 'A249'], ['A249-B - Testville', 'A249-B'], ['A249–B', 'A249-B'],
  ['A249—AB', 'A249-AB'], ['A000T1', 'A000T1'], ['A1000', 'A1000'],
  ['A249B', ''], ['A2490', 'A2490'], ['A249-ABC', ''], ['A249_old', ''], ['A12', ''],
  ['Templates', ''], ['', ''], ['Backups', ''], ['249', ''],
];
for (const [name, want] of codes) eq(`projectCodeOf(${JSON.stringify(name)})`, projectCodeOf(name), want);
ok('the number rule is the desktop database\'s', PROJECT_NUMBER.source === '^[A-Z][0-9]{3,}(?:-[A-Z]{1,2}|T[0-9])?$');
eq('dashes', normDashes('A–B—C'), 'A-B-C');

// The portal's plans menu rule (lib/spfiles.js matchArchiveFolder): job A249
// is "A249" or "A249 <words>", never a sibling job.
const siblings = ['A249-B', 'A249B', 'A2490', 'A249–B', 'A249 - old name', 'A249'];
eq('A249 is only A249 and "A249 …", never a sibling job',
  siblings.filter(n => projectCodeOf(n) === 'A249'), ['A249 - old name', 'A249']);

for (const [text, want] of [
  [' a249 ', 'A249'], ['A249-b', 'A249-B'], ['A249/../x', ''], ['../A249', ''],
  ['A249\\x', ''], ['A249%2F', ''], ['A'.padEnd(40, '1'), ''], ['', ''], [null, ''],
]) eq(`parseProjectCode(${JSON.stringify(text)})`, parseProjectCode(text), want);

const order = ['A1000', 'A024-G', 'A001', 'A000T1', 'A999', 'A024', 'A000', 'A024-B', 'A025'];
eq('natural order, a suffix right after its base (the desktop\'s)',
  [...order].sort(compareCodes), ['A000', 'A000T1', 'A001', 'A024', 'A024-B', 'A024-G', 'A025', 'A999', 'A1000']);

for (const [n, k] of [['x.takeoff', 'takeoff'], ['X.TAKEOFF', 'takeoff'], ['old.pdfcache', 'takeoff'],
  ['Set.PDF', 'pdf'], ['notes.txt', null], ['x.takeoff.autosave', null], ['pdf', null]]) {
  eq(`fileKind(${n})`, fileKind(n), k);
}
for (const [n, h] of [['.hidden', true], ['~$lock.takeoff', true], ['desktop.ini', true], ['Thumbs.db', true],
  ['x.takeoff.part', true], ['x.tmp', true], ['x.takeoff.autosave', true], ['a/b.takeoff', true],
  ['a\\b.takeoff', true], ['$x', true], ['', true], ['plan.takeoff', false], ['Floor Plans', false]]) {
  eq(`isHiddenName(${JSON.stringify(n)})`, isHiddenName(n), h);
}
for (const [n, o] of [['Backups', true], ['backup', true], ['Archive', true], ['archived', true],
  ['OLD', true], ['Superseded', true], [' Backups ', true], ['Backups 2', false], ['Plans', false]]) {
  eq(`isOlderCopiesFolder(${JSON.stringify(n)})`, isOlderCopiesFolder(n), o);
}
eq('rest of a folder name after its number', [
  restOfName('A249 - 1 Test St - Testville'), restOfName('A249'), restOfName('A249– Test'),
  restOfName('Templates'),
], ['1 Test St - Testville', '', 'Test', '']);

// ── the top of the archive ───────────────────────────────────────────────
const archive = tree('DCR - Floor Plans - Archive', {
  'A249/': {
    'Main set.takeoff': [3000], 'Early set.takeoff': [2000], 'notes.txt': [9000],
    '~$Main set.takeoff': [9500],
    'Backups/': { 'Main set 2026-01-02.takeoff': [1500] },
    'Archive/': { 'Bid set.pdf': [900] },
  },
  'A250 - 9 Sample Rd - Exampleton/': { 'Plans.takeoff': [5000] },
  'A249-B/': { 'Follow-up.takeoff': [4000] },
  'A1000/': { 'Big job.takeoff': [6000] },
  'A251/': { 'Backups/': {} },
  'Templates/': { 'Blank.takeoff': [100] },
  '.sync/': {},
  'Loose plan.takeoff': [700],
  'readme.txt': [10],
});
const before = stats.getFile;
const top = await listTopFolders(archive);
eq('projects, newest job first', top.projects.map(p => p.code), ['A1000', 'A251', 'A250', 'A249-B', 'A249']);
eq('other folders', top.others.map(o => o.name), ['Templates']);
eq('loose plan files at the top', top.files.map(f => f.name), ['Loose plan.takeoff']);
eq('a listing reads no file — names only', stats.getFile - before, 0);
eq('one job, exactly', matchProject(top.projects, 'a249').map(p => p.name), ['A249']);
eq('a sibling job is its own', matchProject(top.projects, 'A249-B').map(p => p.name), ['A249-B']);
eq('a number that is not one matches nothing', matchProject(top.projects, '../A249'), []);

// ── one project's plan files ─────────────────────────────────────────────
const a249 = top.projects.find(p => p.code === 'A249').handle;
const t = await walkPlans(a249);
eq('own files newest first; lock files and notes left out',
  t.files.map(f => f.name), ['Main set.takeoff', 'Early set.takeoff']);
eq('older-copies folders last, marked', t.folders.map(f => [f.name, f.older, f.count]),
  [['Archive', true, 1], ['Backups', true, 1]]);
eq('a file carries its folder handle (Save As starts there) and its path',
  [t.folders[1].files[0].dir === t.folders[1].handle, t.folders[1].files[0].path], [true, 'Backups']);
eq('size and date come from the file', [t.files[0].size, t.files[0].lastModified], [4, 3000]);
eq('count', t.count, 4);
ok('nothing cut', !t.truncated);
eq('filesOf leaves the older copies out by default', filesOf(t).map(f => f.name),
  ['Main set.takeoff', 'Early set.takeoff']);
eq('… and puts them in when asked', filesOf(t, { older: true }).map(f => f.name),
  ['Main set.takeoff', 'Early set.takeoff', 'Main set 2026-01-02.takeoff', 'Bid set.pdf']);
const empty = await walkPlans(top.projects.find(p => p.code === 'A251').handle);
eq('a folder with only an empty Backups has nothing to show', [empty.count, empty.folders.length], [0, 0]);

// A desktop project folder: PDFs are plans only under Floor Plans, and Photos
// is never read at all.
const desk = tree('A300 - 1 Test St - Testville - Sample', {
  [`${PLANS_DIR}/`]: { 'Permit set.pdf': [800], 'Level 2/': { 'L2.pdf': [810] } },
  'Photos/': { '2026-10-09/': { 'IMG_0001.jpg': [1], 'odd.takeoff': [2] } },
  'Documents/': { 'Contract.pdf': [700], 'Estimate takeoff.takeoff': [720], 'Items/': { '12 - Walls/': { 'Detail.pdf': [730] } } },
  'Site plan.pdf': [600],
});
const dt = await walkPlans(desk);
const all = filesOf(dt, { older: true }).map(f => `${f.path || '.'}|${f.name}`).sort();
eq('desktop layout: drawings from Floor Plans, takeoffs from anywhere, nothing from Photos', all,
  ['Documents|Estimate takeoff.takeoff', 'Floor Plans / Level 2|L2.pdf', 'Floor Plans|Permit set.pdf']);
eq('Photos was never listed', listed(desk.kids.get('Photos')), 0);
eq('… nor any day folder in it', listed(desk.kids.get('Photos').kids.get('2026-10-09')), 0);

// The archive layout is all plans, PDFs included, wherever they are.
const loosePdf = tree('A260', { 'Docs/': { 'Contract.pdf': [1] }, 'Photos/': { 'x.takeoff': [2] } });
eq('archive layout: every PDF and takeoff counts, Photos included',
  filesOf(await walkPlans(loosePdf), { older: true }).map(f => f.name).sort(), ['Contract.pdf', 'x.takeoff']);

// Bounded.
const big = tree('A270', Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`p${i}.takeoff`, [i]])));
const capped = await walkPlans(big, { maxFiles: 5 });
eq('maxFiles: five read, and it says the rest were not', [capped.files.length, !!capped.truncated], [5, true]);
const deep = tree('A271', { 'a/': { 'b/': { 'c/': { 'd/': { 'e/': { 'x.takeoff': [1] } } } } } });
eq('maxDepth: cut, and said', [(await walkPlans(deep, { maxDepth: 2 })).count, !!(await walkPlans(deep, { maxDepth: 2 })).truncated], [0, true]);
eq('deep enough finds it', (await walkPlans(deep, { maxDepth: 5 })).count, 1);
const wide = tree('A272', Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`f${i}/`, { 'x.takeoff': [i] }])));
const w = await walkPlans(wide, { maxFolders: 4 });
eq('maxFolders: the listings stop, and it says so', [w.count, !!w.truncated], [3, true]);

// A file that goes between the listing and its size being read is skipped.
const flaky = tree('A273', { 'here.takeoff': [5], 'going.takeoff': [6] });
flaky.kids.get('going.takeoff').gone = true;
eq('a vanished file is skipped, not an error', (await walkPlans(flaky)).files.map(f => f.name), ['here.takeoff']);

// ── a chosen folder that is not the archive ──────────────────────────────
eq('the archive itself', (await describeChosenFolder(archive)).projects, 5);
const parent = new FakeDir('Old portal', [archive, tree('DCR Agents 1', { 'agents.db': [1] })]);
const look = await describeChosenFolder(parent);
eq('its parent: no projects, and the folder inside that has them is offered',
  [look.projects, look.suggestion && look.suggestion.name, look.suggestion && look.suggestion.projects],
  [0, 'DCR - Floor Plans - Archive', 5]);
const one = await describeChosenFolder(a249);
eq('one project\'s own folder is recognised as such', [one.projects, one.isProjectFolder, one.suggestion], [0, true, null]);

// ── the OneDrive Plans Archive and its twin ──────────────────────────────
// A computer that synced the old SharePoint library has a folder of the same
// name there; only the OneDrive one holds the marker the documents copy writes.
eq('the marker\'s name is the one copy_documents.mjs writes', ARCHIVE_MARKER, '_DCR Plans Archive - OneDrive.txt');
const oneDrive = tree('DCR - Floor Plans - Archive', { 'A249/': { 'Main.takeoff': [1] }, [ARCHIVE_MARKER]: [1] });
const twin = tree('DCR - Floor Plans - Archive', { 'A249/': { 'Main.takeoff': [1] } });
eq('the OneDrive one holds the marker; the SharePoint twin does not',
  [await isOneDriveArchive(oneDrive), await isOneDriveArchive(twin), await isOneDriveArchive(null)], [true, false, false]);
eq('a folder named like the marker is not one',
  await isOneDriveArchive(tree('X', { [`${ARCHIVE_MARKER}/`]: {} })), false);
const lookOd = await describeChosenFolder(oneDrive);
const lookTwin = await describeChosenFolder(twin);
eq('describeChosenFolder says which is which (same name, same projects)',
  [lookOd.projects, lookOd.marker, lookTwin.projects, lookTwin.marker], [1, true, 1, false]);
eq('the marker is never listed as a plan file', (await listTopFolders(oneDrive)).files.map(x => x.name), []);
const odParent = new FakeDir('OneDrive - Made-up', [oneDrive]);
eq('a parent folder offers the archive inside, with its marker', (await describeChosenFolder(odParent)).suggestion.marker, true);

// ── what changed under an open project, with a real file ─────────────────
// A 1×1 PNG, then the app's own writer and reader: the handle a walk hands
// over opens in the app, and a save through it is told from another's.
const PNG = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg=='),
c => c.charCodeAt(0));
const metadata = { project_name: 'Made-up job', annotations: {}, measurements: {}, page_labels: ['A1'] };
const blob = await writeProject({ metadata, pageSources: [{ kind: 'png', data: PNG }] });
const bytes = new Uint8Array(await blob.arrayBuffer());
const job = tree('A900 - 1 Test St - Testville', {});
const fh = job.add(new FakeFile('Made-up job.takeoff', bytes, 10_000));
const jt = await walkPlans(job);
const opened = await openProject(await jt.files[0].handle.getFile());
eq('the walk\'s file opens in the app\'s own reader', [opened.pageCount, opened.metadata.project_name], [1, 'Made-up job']);

const stamp = fileStamp(await fh.getFile());
ok('unchanged reads as unchanged', !changedSince(stamp, await fh.getFile()));
// Another computer saves it; OneDrive brings it down.
const w2 = await fh.createWritable();
await w2.write(blob); await w2.close();
ok('a save from elsewhere (same size, new time) reads as changed', changedSince(stamp, await fh.getFile()));
const ours = fileStamp(await fh.getFile());
ok('after our own save the new stamp is the baseline', !changedSince(ours, await fh.getFile()));
ok('a different size reads as changed', changedSince(ours, new File([new Uint8Array(3)], 'x', { lastModified: ours.lastModified })));
ok('no stamp, or no file: changed (never written over blind)', changedSince(null, await fh.getFile()) && changedSince(ours, null));

// ── which way plans come in ──────────────────────────────────────────────
eq('the company default is still SharePoint (the switch is one line)', PLANS_SOURCE, 'sharepoint');
for (const [p, c, want] of [
  [null, 'sharepoint', 'sharepoint'], [null, 'folder', 'folder'], ['folder', 'sharepoint', 'folder'],
  ['sharepoint', 'folder', 'sharepoint'], ['nonsense', 'folder', 'folder'], [undefined, undefined, 'sharepoint'],
  ['', 'bogus', 'sharepoint'],
]) eq(`resolvePlansSource(${p}, ${c})`, resolvePlansSource(p, c), want);

for (const [hash, want] of [
  ['#plans', { code: '' }], ['#plans=', { code: '' }], ['#plans=A249', { code: 'A249' }],
  ['#plans=a249-b', { code: 'A249-B' }], ['#x=1&plans=A250', { code: 'A250' }],
  ['#plans=Smith', { code: '', invalid: true }], ['#plans=A249%2F..', { code: '', invalid: true }],
  ['#plans=%E0%A4%A', { code: '', invalid: true }], ['#open=abc', null], ['#plansx=A249', null], ['', null],
]) eq(`parsePlansLink(${JSON.stringify(hash)})`, parsePlansLink(hash), want);

// ── permission ───────────────────────────────────────────────────────────
eq('no permission model at all reads as granted', await permissionOf({}), 'granted');
const shy = new FakeDir('Shy'); shy.perm = 'prompt';
eq('prompt is reported', await permissionOf(shy), 'prompt');
eq('asking grants it', [await askPermission(shy), await permissionOf(shy)], ['granted', 'granted']);
const no = new FakeDir('No'); no.perm = 'denied';
eq('a refusal stays a refusal', await askPermission(no), 'denied');
eq('a handle that throws on query reads as prompt',
  await permissionOf({ queryPermission: async () => { throw new Error('x'); } }), 'prompt');
eq('folder picking needs showDirectoryPicker', [canPickFolders({}), canPickFolders({ showDirectoryPicker() {} })], [false, true]);

// ── remembered on this device ────────────────────────────────────────────
const store = new PlansFolders({ backend: memoryBackend(), max: 2, maxRecent: 3 });
const r1 = await store.add(archive);
eq('a folder is remembered', [(await store.list()).length, r1.existed, r1.record.name], [1, false, archive.name]);
eq('the same folder twice is one record', [(await store.add(archive)).existed, (await store.list()).length], [true, 1]);
const projectsRoot = tree('Projects', { 'A300 - x/': {} });
await store.add(projectsRoot);
await rejects('past the limit it is refused, not dropped', () => store.add(tree('Third', {})), /Up to 2 folders/);
await rejects('a file is not a folder', () => store.add(new FakeFile('x.takeoff')), /not a folder/);

const files = filesOf(t, { older: true });
for (const f of files) {
  await store.noteRecent({ handle: f.handle, dir: f.dir, name: f.name, folderId: r1.record.id, code: 'A249' });
}
eq('recent: newest first, capped', (await store.recent()).map(r => r.name),
  ['Bid set.pdf', 'Main set 2026-01-02.takeoff', 'Early set.takeoff']);
await store.noteRecent({ handle: files[2].handle, name: files[2].name, folderId: r1.record.id });
eq('reopening moves it to the top, once', (await store.recent()).map(r => r.name),
  ['Main set 2026-01-02.takeoff', 'Bid set.pdf', 'Early set.takeoff']);
await store.remove(r1.record.id);
eq('removing a folder forgets it and its recent files — and nothing else',
  [(await store.list()).map(r => r.name), (await store.recent()).length], [['Projects'], 0]);
ok('… and the folder itself is untouched', archive.kids.size === 9);

const blocked = new PlansFolders({ backend: { get: async () => { throw new Error('blocked'); }, set: async () => { throw new Error('blocked'); } } });
eq('blocked storage lists nothing rather than failing', [await blocked.list(), await blocked.recent()], [[], []]);
await rejects('… and says why it cannot keep a folder', () => blocked.add(archive), /storage is blocked/);

console.log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass — the Plans Archive finds, lists and guards plan files`);
process.exit(fails ? 1 : 0);
