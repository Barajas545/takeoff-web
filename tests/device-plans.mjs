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
// Run: node tests/device-plans.mjs
import {
  PORTAL_INDEX_KEY, PORTAL_DIR, PORTAL_TOKEN_KEY, OWNER_KEY, KEPT_INDEX_KEY, KEPT_DIR, OPEN_LOCK, KEPT_FILE_RE,
  tokenSub, libraryOwner, portalCopies, keptCopies, keepFile, keptFile, removeKept, removePortalCopy, copyInUse, sizeText,
} from '../js/core/device-plans.js';

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
  constructor(name) { this.kind = 'directory'; this.name = name; this.kids = new Map(); this.onCreateFile = null; }
  async getDirectoryHandle(name, { create = false } = {}) {
    let h = this.kids.get(name);
    if (!h && create) { h = new OpfsDir(name); this.kids.set(name, h); }
    if (!h || h.kind !== 'directory') throw notFound(name);
    return h;
  }
  async getFileHandle(name, { create = false } = {}) {
    let h = this.kids.get(name);
    if (!h && create) { h = new OpfsFile(name); if (this.onCreateFile) this.onCreateFile(h); this.kids.set(name, h); }
    if (!h || h.kind !== 'file') throw notFound(name);
    return h;
  }
  async removeEntry(name) {
    if (!this.kids.has(name)) throw notFound(name);
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

console.log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass — plans are kept, listed and removed on this device, the portal's copies too`);
process.exit(fails ? 1 : 0);
