// Plans kept on this device: js/core/device-plans.js.
//
// The Plans Library's job once plans come from the OneDrive Plans Archive
// (the owner's Q20): keep a plan on the device so it opens with no signal —
// on a phone, from a file picked in the OneDrive app — list and remove the
// kept copies, and keep the old portal's saved copies listed and removable
// after the portal's own page and sign-in are gone.
//
// Driven through made-up handles: an origin-private file system that exists
// only in this process, a localStorage stand-in and Web Locks that say which
// copy is open. Made-up projects and accounts; no browser, no network.
//
// And a second one shaped like Safari before 26 — an iPad on iPadOS 16.4 to
// 18 — whose file handles have no createWritable(), only the worker-only
// synchronous access handle. There the copy is written by the real
// js/core/opfs-write-worker.js, run here against that made-up file system.
//
// Run: node tests/device-plans.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PORTAL_INDEX_KEY, PORTAL_DIR, PORTAL_TOKEN_KEY, OWNER_KEY, KEPT_INDEX_KEY, KEPT_DIR, OPEN_LOCK, KEPT_FILE_RE,
  tokenSub, libraryOwner, portalCopies, keptCopies, keepFile, keptFile, removeKept, removePortalCopy, copyInUse, sizeText,
  keepWriterFor, workerWriter, CANNOT_KEEP, KEEP_SLICE,
} from '../js/core/device-plans.js';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

// ── made-up storage ──────────────────────────────────────────────────────
const notFound = name => Object.assign(new Error(`${name} is not there`), { name: 'NotFoundError' });

class OpfsFile {
  constructor(name) { this.kind = 'file'; this.name = name; this.data = new Uint8Array(0); this.lastModified = 1; this.failAfter = null; this.dropLast = false; }
  async getFile() { return new File([this.data], this.name, { lastModified: this.lastModified }); }
  async createWritable() {
    const parts = [];
    let written = 0;
    const self = this;
    return {
      async write(chunk) {
        const u = chunk instanceof Uint8Array ? chunk : new Uint8Array(await new Blob([chunk]).arrayBuffer());
        written += u.length;
        if (self.failAfter !== null && written > self.failAfter) throw new Error('disk went away (made up)');
        parts.push(u);
      },
      async close() {
        let all = new Uint8Array(await new Blob(parts).arrayBuffer());
        if (self.dropLast && all.length) all = all.subarray(0, all.length - 1);
        self.data = all;
      },
      async abort() { /* the swap file goes; the file keeps what it had */ },
    };
  }
}

class OpfsDir {
  constructor(name, FileKind = OpfsFile) { this.kind = 'directory'; this.name = name; this.kids = new Map(); this.onCreateFile = null; this.FileKind = FileKind; }
  async getDirectoryHandle(name, { create = false } = {}) {
    let h = this.kids.get(name);
    if (!h && create) { h = new OpfsDir(name, this.FileKind); this.kids.set(name, h); }
    if (!h || h.kind !== 'directory') throw notFound(name);
    return h;
  }
  async getFileHandle(name, { create = false } = {}) {
    let h = this.kids.get(name);
    if (!h && create) { h = new this.FileKind(name); if (this.onCreateFile) this.onCreateFile(h); this.kids.set(name, h); }
    if (!h || h.kind !== 'file') throw notFound(name);
    return h;
  }
  async removeEntry(name) {
    if (!this.kids.has(name)) throw notFound(name);
    // OPFS will not remove a file a worker still holds open.
    if (this.kids.get(name).openHandle) throw Object.assign(new Error(`${name} is open`), { name: 'NoModificationAllowedError' });
    this.kids.delete(name);
  }
}

function memoryStore(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
    map: m,
  };
}

const b64url = obj => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const tokenFor = sub => `${b64url({ alg: 'HS256' })}.${b64url({ sub, name: 'Pat Example' })}.made-up-signature`;
const locksHolding = (...files) => ({ query: async () => ({ held: files.map(f => ({ name: OPEN_LOCK + f })), pending: [] }) });
const NO_LOCKS = locksHolding();

// ── whose copies: the token, then the remembered account ─────────────────
eq('tokenSub reads the subject', [tokenSub(tokenFor('7')), tokenSub(tokenFor(12)), tokenSub('not a token'), tokenSub('')], ['7', '12', '', '']);
const store = memoryStore();
eq('nobody ever signed in: no owner', libraryOwner(store), { owner: '', remembered: false });
store.setItem(PORTAL_TOKEN_KEY, tokenFor('7'));
eq('signed in: that account, and it is remembered', [libraryOwner(store), store.getItem(OWNER_KEY)], [{ owner: '7', remembered: false }, '7']);
// the old portal clears its token on any 401 (and after 5d nobody can sign in again)
store.removeItem(PORTAL_TOKEN_KEY);
eq('the session gone: the last account seen on this device', libraryOwner(store), { owner: '7', remembered: true });
store.setItem(PORTAL_TOKEN_KEY, tokenFor('9'));
eq('another person signs in: their account from then on', [libraryOwner(store).owner, store.getItem(OWNER_KEY)], ['9', '9']);
store.removeItem(PORTAL_TOKEN_KEY);

// ── the portal's saved copies ────────────────────────────────────────────
const portalEntry = (o) => ({ id: 'x', owner: '9', file: 'p9-1-abc.takeoff', name: 'Main.takeoff', size: 10, status: 'ready',
  projectCode: 'A249', projectTitle: 'Made-up job', lastModified: 5, ...o });
store.setItem(PORTAL_INDEX_KEY, JSON.stringify({ v: 1, entries: [
  portalEntry({ id: 'a', file: 'p9-1-abc.takeoff', projectCode: 'A250' }),
  portalEntry({ id: 'b', file: 'p9-2-abc.takeoff', projectCode: 'A249' }),
  portalEntry({ id: 'c', file: 'p7-3-abc.takeoff', owner: '7' }),
  portalEntry({ id: 'd', file: 'p9-4-abc.takeoff', status: 'downloading' }),
  portalEntry({ id: 'e', file: '../../evil.takeoff' }),
] }));
eq('the remembered account\'s finished copies, by project number', portalCopies(store, libraryOwner(store).owner).map(e => e.id), ['b', 'a']);
eq('nobody: nothing', portalCopies(store, ''), []);
eq('an unreadable index lists nothing', portalCopies(memoryStore({ [PORTAL_INDEX_KEY]: '{oops' }), '9'), []);

// ── keep a plan on this device ───────────────────────────────────────────
const root = new OpfsDir('opfs');
const bytes = n => Uint8Array.from({ length: n }, (_, i) => (i * 7) % 251);
const planFile = (name, n, lastModified = 1000) => new File([bytes(n)], name, { lastModified });
let ids = 0;
const makeId = () => `kt${++ids}-made`;
const kstore = memoryStore();
const a249 = planFile('Main set.takeoff', 300_000);
const first = await keepFile({ root, store: kstore, file: a249, meta: { code: 'A249', project: 'A249 - Made-up job', path: '', from: 'Plans Archive' }, makeId, now: () => 42 });
eq('kept: a new copy, named by its id, outside any project folder', [first.existed, first.entry.file, KEPT_FILE_RE.test(first.entry.file)], [false, 'kt1-made.takeoff', true]);
const stored = (await (await root.getDirectoryHandle(KEPT_DIR)).getFileHandle(first.entry.file)).data;
ok('the kept bytes are the plan\'s bytes', stored.length === 300_000 && stored.every((v, i) => v === (i * 7) % 251));
eq('the list shows it', keptCopies(kstore).map(e => [e.code, e.name, e.size, e.from, e.keptAt]), [['A249', 'Main set.takeoff', 300_000, 'Plans Archive', 42]]);
const again = await keepFile({ root, store: kstore, file: a249, meta: { code: 'A249' }, makeId });
eq('the same version again is the one copy', [again.existed, again.entry.id, (await root.getDirectoryHandle(KEPT_DIR)).kids.size], [true, first.entry.id, 1]);
const newer = await keepFile({ root, store: kstore, file: planFile('Main set.takeoff', 300_001, 2000), meta: { code: 'A249' }, makeId });
eq('a newer version is kept beside it', [newer.existed, keptCopies(kstore).length], [false, 2]);
const fromPhone = await keepFile({ root, store: kstore, file: planFile('A100 Roof.takeoff', 50), meta: { code: 'A100', from: 'a file on this device' }, makeId });
eq('a file picked in the OneDrive app on a phone is kept too; the list sorts by project', keptCopies(kstore).map(e => e.code), ['A100', 'A249', 'A249']);
eq('keptFile opens it', (await keptFile(root, fromPhone.entry)).size, 50);
eq('keptFile: a copy the browser cleared is null', await keptFile(root, { file: 'kzz-gone.takeoff' }), null);
eq('keptFile: never a name outside the rule', await keptFile(root, { file: '../plans-library/p9-1-abc.takeoff' }), null);

// a copy that cannot be finished leaves nothing behind
const kdir = await root.getDirectoryHandle(KEPT_DIR);
const before = [kdir.kids.size, keptCopies(kstore).length];
kdir.onCreateFile = h => { h.failAfter = 100; };
await rejects('a write that breaks part-way', () => keepFile({ root, store: kstore, file: planFile('Big.takeoff', 5000), makeId }), /disk went away/);
kdir.onCreateFile = h => { h.dropLast = true; };
await rejects('a copy that is not whole', () => keepFile({ root, store: kstore, file: planFile('Short.takeoff', 5000), makeId }), /did not come out whole/);
kdir.onCreateFile = null;
eq('… and neither left a file or a list entry', [kdir.kids.size, keptCopies(kstore).length], before);
await rejects('no room: refused before anything is written',
  () => keepFile({ root, store: kstore, file: planFile('Huge.takeoff', 1000), estimate: async () => ({ quota: 100 * 1048576, usage: 99 * 1048576 }), makeId }), /does not have room/);
eq('… nothing written', [kdir.kids.size, keptCopies(kstore).length], before);
await rejects('an empty file is not kept', () => keepFile({ root, store: kstore, file: planFile('Empty.takeoff', 0), makeId }), /empty/);
const full = memoryStore();
full.setItem = (k) => { if (k === KEPT_INDEX_KEY) throw new Error('QuotaExceededError (made up)'); };
await rejects('the list cannot be written: the copy goes again', () => keepFile({ root, store: full, file: planFile('X.takeoff', 10), makeId }), /QuotaExceeded/);
eq('… no file left of it', kdir.kids.size, before[0]);

// ── remove a kept copy ───────────────────────────────────────────────────
await rejects('open in a window: refused', () => removeKept({ root, store: kstore, id: fromPhone.entry.id, locks: locksHolding(fromPhone.entry.file) }), /open in Professional Takeoff Tools/);
ok('copyInUse says so', await copyInUse(locksHolding(fromPhone.entry.file), fromPhone.entry.file));
eq('… and it is still there', keptCopies(kstore).some(e => e.id === fromPhone.entry.id), true);
eq('removed', await removeKept({ root, store: kstore, id: fromPhone.entry.id, locks: NO_LOCKS }), { removed: true });
eq('… file and line gone, the others kept', [kdir.kids.has(fromPhone.entry.file), keptCopies(kstore).map(e => e.code)], [false, ['A249', 'A249']]);
eq('an unknown id removes nothing', await removeKept({ root, store: kstore, id: 'nope', locks: NO_LOCKS }), { removed: false });
eq('a browser without Web Locks still removes', await removeKept({ root, store: kstore, id: newer.entry.id, locks: null }), { removed: true });

// ── the old portal's copies, after the move ──────────────────────────────
const pdir = await root.getDirectoryHandle(PORTAL_DIR, { create: true });
for (const f of ['p9-1-abc.takeoff', 'p9-2-abc.takeoff', 'p7-3-abc.takeoff']) {
  const h = await pdir.getFileHandle(f, { create: true });
  h.data = bytes(10);
}
const dropped = [];
const entryA = portalCopies(store, '9').find(e => e.id === 'a');
await rejects('a portal copy open in a window: refused', () => removePortalCopy({ root, store, entry: entryA, locks: locksHolding(entryA.file) }), /open in Professional Takeoff Tools/);
eq('removed: the file, its line and its record', await removePortalCopy({ root, store, entry: entryA, locks: NO_LOCKS, dropRecords: async f => { dropped.push(f); } }), { removed: true });
eq('… the file is gone, the other people\'s and the other copies stay', [...pdir.kids.keys()].sort(), ['p7-3-abc.takeoff', 'p9-2-abc.takeoff']);
eq('… the portal\'s index lost that line only', JSON.parse(store.getItem(PORTAL_INDEX_KEY)).entries.map(e => e.id), ['b', 'c', 'd', 'e']);
eq('… and its IndexedDB record was asked to go', dropped, ['p9-1-abc.takeoff']);
eq('a name outside the rule is never looked up', await removePortalCopy({ root, store, entry: { file: '../../evil.takeoff' }, locks: NO_LOCKS }), { removed: false });
eq('a copy already gone is still removed from the list', await removePortalCopy({ root, store, entry: { file: 'p9-9-gone.takeoff' }, locks: NO_LOCKS }), { removed: true });
eq('a failing record drop does not stop the removal',
  await removePortalCopy({ root, store, entry: portalCopies(store, '9')[0], locks: NO_LOCKS, dropRecords: async () => { throw new Error('blocked'); } }), { removed: true });
eq('the remembered account\'s list follows', portalCopies(store, libraryOwner(store).owner).map(e => e.id), []);

eq('sizes', [sizeText(0), sizeText(900), sizeText(5 * 1048576), sizeText(2.5 * 1073741824)], ['', '1 KB', '5.0 MB', '2.5 GB']);

// ── which writer this browser has ────────────────────────────────────────
const storage = { getDirectory: async () => null };
class WithWritable { createWritable() {} }
class WithoutWritable { createSyncAccessHandle() {} }   // what the PAGE sees in Safari 16.4-18: no createWritable
function Worker() {}
eq('Chrome, Edge, Firefox, Safari 26+: the page writes', keepWriterFor({ navigator: { storage }, FileSystemFileHandle: WithWritable, Worker }), 'stream');
eq('Safari 16.4 to 18 (an iPad on iPadOS 16.4-18): the worker writes', keepWriterFor({ navigator: { storage }, FileSystemFileHandle: WithoutWritable, Worker }), 'worker');
eq('… and with no FileSystemFileHandle to look at, the worker still decides', keepWriterFor({ navigator: { storage }, Worker }), 'worker');
eq('no workers either: cannot keep here', keepWriterFor({ navigator: { storage }, FileSystemFileHandle: WithoutWritable }), null);
eq('no private file system: cannot keep here', [keepWriterFor({ navigator: {}, Worker }), keepWriterFor({ navigator: { storage: {} }, Worker }), keepWriterFor(null)], [null, null, null]);
ok('the refusal names the real minimum, Safari 16.4', /Safari 16\.4/.test(CANNOT_KEEP));

// ── Safari before 26: the worker and its synchronous access handle ───────
const quotaError = () => Object.assign(new Error('The quota has been exceeded (made up).'), { name: 'QuotaExceededError' });

/** A file whose handle has NO createWritable, only createSyncAccessHandle — and that, only in a worker. */
class SafariFile {
  constructor(name) {
    this.kind = 'file'; this.name = name; this.data = new Uint8Array(0); this.lastModified = 1;
    this.openHandle = null; this.closed = 0;
    this.room = Infinity;          // bytes the device can still take
    this.oldSafari = false;        // 15.2-16.3: the handle's methods answer with Promises
    this.shortWrites = false;      // write() takes fewer bytes than it was given
  }
  async getFile() { return new File([this.data], this.name, { lastModified: this.lastModified }); }
  async createSyncAccessHandle() {
    if (this.openHandle) throw Object.assign(new Error('already open'), { name: 'NoModificationAllowedError' });
    const f = this;
    let buf = new Uint8Array(Math.max(1024, f.data.length));
    buf.set(f.data);
    let len = f.data.length;
    const sync = {
      getSize: () => len,
      truncate: n => { len = n; },
      write: (bytes, { at = 0 } = {}) => {
        const view = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        if (at + view.length > f.room) throw quotaError();
        if (at + view.length > buf.length) {
          const bigger = new Uint8Array(Math.max(buf.length * 2, at + view.length));
          bigger.set(buf.subarray(0, len));
          buf = bigger;
        }
        const n = f.shortWrites ? Math.max(0, view.length - 1) : view.length;
        buf.set(view.subarray(0, n), at);
        len = Math.max(len, at + n);
        return n;
      },
      flush: () => { f.data = buf.slice(0, len); },
      close: () => { f.data = buf.slice(0, len); f.openHandle = null; f.closed += 1; },
    };
    const handle = f.oldSafari
      ? Object.fromEntries(Object.entries(sync).map(([k, fn]) => [k, async (...a) => fn(...a)]))
      : sync;
    f.openHandle = handle;
    return handle;
  }
}

const WORKER_SRC = readFileSync(path.join(APP, 'js', 'core', 'opfs-write-worker.js'), 'utf8');

/**
 * The real worker script, run in this process: its `self` and `navigator` are
 * made up, messages cross with a turn of the event loop between, as they do
 * between a page and a worker. (A File crosses into a real worker by
 * reference, so handing over the same object is what a browser does.)
 */
class MadeUpWorker {
  constructor(root) {
    this.onmessage = null; this.onerror = null; this.ended = false;
    this.inside = { postMessage: m => { setTimeout(() => { if (!this.ended && this.onmessage) this.onmessage({ data: m }); }, 0); } };
    new Function('self', 'navigator', WORKER_SRC)(this.inside, { storage: { getDirectory: async () => root } });
  }
  postMessage(m) { setTimeout(() => this.inside.onmessage({ data: m }), 0); }
  terminate() { this.ended = true; }
}

/** A plan File that records how it is read: slice sizes, and any read of the whole thing. */
function watched(file, { breakAt = null } = {}) {
  const reads = [];
  return {
    reads,
    file: {
      name: file.name, size: file.size, lastModified: file.lastModified, type: '',
      slice: (a, b) => {
        reads.push(b - a);
        if (breakAt !== null && a >= breakAt) {
          return { arrayBuffer: async () => { throw Object.assign(new Error('the file changed (made up)'), { name: 'NotReadableError' }); } };
        }
        return file.slice(a, b);
      },
      arrayBuffer: () => { reads.push('WHOLE FILE'); return file.arrayBuffer(); },
      stream: () => { reads.push('STREAM'); return file.stream(); },
    },
  };
}

const sroot = new OpfsDir('opfs', SafariFile);
const sstore = memoryStore();
const viaWorker = (o = {}) => workerWriter(() => new MadeUpWorker(sroot), o);
const big = planFile('A104 Full set.takeoff', 17 * 1048576 + 12345, 3000);   // three slices: 8 + 8 + a bit
const bigWatch = watched(big);
const progress = [];
const kept = await keepFile({ root: sroot, store: sstore, file: bigWatch.file, meta: { code: 'A104', from: 'a file on this device' },
  makeId, now: () => 77, syncWrite: viaWorker({ onProgress: (done, size) => progress.push([done, size]) }) });
const sdir = await sroot.getDirectoryHandle(KEPT_DIR);
const skept = sdir.kids.get(kept.entry.file);
eq('Safari before 26: kept, through the worker', [kept.existed, KEPT_FILE_RE.test(kept.entry.file), kept.entry.size, kept.entry.keptAt], [false, true, big.size, 77]);
ok('… the kept bytes are the plan\'s bytes', skept.data.length === big.size && skept.data.every((v, i) => v === (i * 7) % 251));
eq('… read a slice at a time, never the whole plan at once', bigWatch.reads, [KEEP_SLICE, KEEP_SLICE, big.size - 2 * KEEP_SLICE]);
eq('… progress after every slice, to the last byte', progress.map(p => p[0]), [KEEP_SLICE, 2 * KEEP_SLICE, big.size]);
eq('… and the worker closed its handle', [skept.closed, skept.openHandle], [1, null]);
eq('… listed like any kept plan', keptCopies(sstore).map(e => [e.code, e.name, e.size]), [['A104', 'A104 Full set.takeoff', big.size]]);
const sagain = await keepFile({ root: sroot, store: sstore, file: big, meta: { code: 'A104' }, makeId, syncWrite: () => { throw new Error('not needed'); } });
eq('… the same version again is the one copy, with no second write', [sagain.existed, sdir.kids.size], [true, 1]);

const sBefore = () => [sdir.kids.size, keptCopies(sstore).length];
const was = sBefore();
await rejects('no createWritable and no worker to write: refused in plain words',
  () => keepFile({ root: sroot, store: sstore, file: planFile('B.takeoff', 100), makeId }), /cannot keep plan files on the device/);
eq('… nothing left behind', sBefore(), was);

sdir.onCreateFile = h => { h.createSyncAccessHandle = undefined; };
await rejects('a browser with no access handle in its workers either: refused, naming Safari 16.4',
  () => keepFile({ root: sroot, store: sstore, file: planFile('C.takeoff', 100), makeId, syncWrite: viaWorker() }), /Safari 16\.4/);
eq('… nothing left behind', sBefore(), was);

sdir.onCreateFile = h => { h.oldSafari = true; };
await rejects('Safari 15.2-16.3 (the handle answers with Promises): not used — it would write nothing',
  () => keepFile({ root: sroot, store: sstore, file: planFile('D.takeoff', 100), makeId, syncWrite: viaWorker() }), /Safari 16\.4/);
eq('… nothing left behind, the handle closed', sBefore(), was);

sdir.onCreateFile = h => { h.room = 5 * 1048576; };
await rejects('the device fills up part-way', () => keepFile({ root: sroot, store: sstore, file: planFile('E.takeoff', 9 * 1048576), makeId, syncWrite: viaWorker() }), /does not have room/);
eq('… the part written is removed again (the worker let go of it first)', sBefore(), was);

sdir.onCreateFile = h => { h.shortWrites = true; };
await rejects('a write that takes less than it was given', () => keepFile({ root: sroot, store: sstore, file: planFile('F.takeoff', 1000), makeId, syncWrite: viaWorker() }), /does not have room/);
eq('… nothing left behind', sBefore(), was);
sdir.onCreateFile = null;

const changing = watched(planFile('G.takeoff', 2 * KEEP_SLICE + 10), { breakAt: KEEP_SLICE });
await rejects('the plan cannot be read part-way (changed or moved)', () => keepFile({ root: sroot, store: sstore, file: changing.file, makeId, syncWrite: viaWorker() }), /could not be read while it was being copied/);
eq('… nothing left behind', sBefore(), was);

await rejects('no worker can be started', () => keepFile({ root: sroot, store: sstore, file: planFile('H.takeoff', 10), makeId,
  syncWrite: workerWriter(() => { throw new Error('SecurityError (made up)'); }) }), /cannot keep plan files on the device/);
eq('… nothing left behind', sBefore(), was);

class NoScript { constructor() { this.onerror = null; } postMessage() { setTimeout(() => this.onerror && this.onerror({ preventDefault() {} }), 0); } terminate() {} }
await rejects('the writer\'s script will not load (offline, never cached)', () => keepFile({ root: sroot, store: sstore, file: planFile('I.takeoff', 10), makeId,
  syncWrite: workerWriter(() => new NoScript()) }), /could not start/);
eq('… nothing left behind', sBefore(), was);

class Silent { postMessage() {} terminate() { this.ended = true; } }
let silent = null;
await rejects('a worker that goes quiet (lost to memory) is given up on', () => keepFile({ root: sroot, store: sstore, file: planFile('J.takeoff', 10), makeId,
  syncWrite: workerWriter(() => (silent = new Silent()), { stallMs: 30 }) }), /stopped part-way/);
eq('… ended, and nothing left behind', [silent.ended, ...sBefore()], [true, ...was]);

// The worker itself writes nothing outside this app's own kept copies.
async function askWorker(msg) {
  const w = new MadeUpWorker(sroot);
  return new Promise(resolve => { w.onmessage = ev => { if (ev.data.type !== 'progress') resolve(ev.data); }; w.postMessage(msg); });
}
eq('the worker refuses a name that is not a kept copy', (await askWorker({ op: 'write', dir: KEPT_DIR, name: '../plans-library/p9-1-abc.takeoff', file: planFile('x', 1) })).code, 'refused');
eq('… and any folder but plans-kept', (await askWorker({ op: 'write', dir: PORTAL_DIR, name: 'kab-cd.takeoff', file: planFile('x', 1) })).code, 'refused');
eq('… and creates nothing of its own (a name the page did not make is not there)', (await askWorker({ op: 'write', dir: KEPT_DIR, name: 'kzz-none.takeoff', file: planFile('x', 1) })).type, 'error');
eq('… and still nothing extra in the folder', sdir.kids.size, was[0]);

// Where the page has createWritable it is used, worker or not.
let workerUsed = false;
const chrome = await keepFile({ root: new OpfsDir('opfs2'), store: memoryStore(), file: planFile('K.takeoff', 50), makeId,
  syncWrite: async () => { workerUsed = true; } });
eq('a browser with createWritable keeps writing on the page, as before', [chrome.existed, workerUsed], [false, false]);
// …and one with no Blob.stream reads slices too, never one whole arrayBuffer.
const noStream = watched(planFile('L.takeoff', KEEP_SLICE + 5));
delete noStream.file.stream;
const croot = new OpfsDir('opfs3');
await keepFile({ root: croot, store: memoryStore(), file: noStream.file, makeId });
eq('… a file it cannot stream is read in slices, not all at once', noStream.reads, [KEEP_SLICE, 5]);

console.log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass — plans are kept, listed and removed on this device, the portal's copies too`);
process.exit(fails ? 1 : 0);
