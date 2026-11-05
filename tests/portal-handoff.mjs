// Portal 2 hands a plan over, window to window: js/core/portal-handoff.js.
//
// Portal 2 (portal.dcrframing.com) is another site, so it opens this app at
// index.html#portal=<nonce> and the two windows talk: this tab says it is
// ready (to the portal's address only), the portal posts the plan — a copy
// its Plans Library keeps on the device, or a OneDrive link — and this tab
// asks it for a fresh link when one expires. Inside the portal (a phone or a
// tablet) the peer is the page this one is framed in, of its own site; and a
// save of a plan the portal said it will take goes back to it (ptt-save),
// saved only when it answers "kept". What counts as the portal's message is
// decided here, and driven here with made-up messages, windows and clocks.
// No browser, no network.
//
// Run: node tests/portal-handoff.mjs
import {
  PORTAL_ORIGINS, HANDOFF_VERSION, HANDOFF_WAIT_MS, parsePortalHash, isPortalOrigin, readyMessage, renewMessage, offlineMessage,
  linkOk, openFromMessage, linkFromMessage,
  SAVE_WAIT_MS, SAVE_ENDINGS, SAVE_PROGRESS, SAVE_NEWS, framedBySameSite, portalPeer, fromPeer, peerTargets, newSaveReq, saveMessage,
  saveStateFromMessage, askPortalToKeep, WHO_RE, PLAN_RE,
} from '../js/core/portal-handoff.js';
import { parsePlansLink } from '../js/core/plans-folder.js';

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

const NONCE = 'Zk3pQ9_x-7LmN2aBcD4e';
const LINK = 'https://made-up-tenant-my.sharepoint.com/personal/someone_example_test/_layouts/15/download.aspx?UniqueId=abc&tempauth=xyz';

// ── the address ──────────────────────────────────────────────────────────
eq('the nonce', parsePortalHash(`#portal=${NONCE}`), NONCE);
eq('among other hash parts', parsePortalHash(`#x=1&portal=${NONCE}&y=2`), NONCE);
for (const h of ['', '#', '#portal=', '#portal=short', `#portal=${NONCE}!`, `#portal=${'a'.repeat(65)}`, `#xportal=${NONCE}`,
  `#portal=${NONCE}%2F`, '#plans=A274', '#open=abc']) {
  eq(`not a hand-over: ${h}`, parsePortalHash(h), null);
}
eq('no hash at all', parsePortalHash(undefined), null);
eq('a #plans link is not a hand-over, nor the other way round', [parsePortalHash('#plans=A274'), parsePlansLink(`#portal=${NONCE}`)],
  [null, null]);

// ── who is the portal ────────────────────────────────────────────────────
eq('the portal lives at one address', [...PORTAL_ORIGINS], ['https://portal.dcrframing.com']);
ok('the portal', isPortalOrigin('https://portal.dcrframing.com'));
for (const o of ['http://portal.dcrframing.com', 'https://portal.dcrframing.com:8443', 'https://portal.dcrframing.com.evil.test',
  'https://evil.test', 'https://barajas545.github.io', 'null', '', undefined, null]) {
  eq(`not the portal: ${o}`, isPortalOrigin(o), false);
}
eq('the ready word', readyMessage(NONCE), { type: 'ptt-ready', v: HANDOFF_VERSION, nonce: NONCE });
eq('the renew word', renewMessage(NONCE, 'r1'), { type: 'ptt-renew', v: HANDOFF_VERSION, nonce: NONCE, req: 'r1' });
eq('the offline word', offlineMessage(NONCE), { type: 'ptt-offline', v: HANDOFF_VERSION, nonce: NONCE });
ok('the tab waits longer for the plan than the portal waits for the tab (90 s)', HANDOFF_WAIT_MS > 90 * 1000);

// ── links ────────────────────────────────────────────────────────────────
ok('a OneDrive download link', linkOk(LINK));
for (const u of ['http://made-up-tenant-my.sharepoint.com/x', 'https://evil.test/x', 'https://sharepoint.com.evil.test/x',
  'https://user:pw@made-up-tenant-my.sharepoint.com/x', 'https://made-up-tenant-my.sharepoint.com:444/x', 'javascript:alert(1)',
  'blob:https://portal.dcrframing.com/abc', '', 'x'.repeat(10), `https://a.sharepoint.com/${'x'.repeat(5000)}`, 42, null]) {
  eq(`not a link: ${String(u).slice(0, 60)}`, linkOk(u), false);
}

// ── the plan ─────────────────────────────────────────────────────────────
const bytes = new Blob([new Uint8Array(1234)]);
const fileMsg = {
  type: 'ptt-open', v: HANDOFF_VERSION, nonce: NONCE, kind: 'file', file: bytes, name: 'A274 Main.takeoff', size: 1234,
  lastModified: 1761500000000, number: ' A274 ', updateAvailable: true,
};
const gotFile = openFromMessage(fileMsg, NONCE);
eq('a saved copy', gotFile && { ...gotFile, file: gotFile.file === bytes },
  { kind: 'file', file: true, name: 'A274 Main.takeoff', size: 1234, number: 'A274', lastModified: 1761500000000, updateAvailable: true,
    canSave: false });
eq('updateAvailable only when true', openFromMessage({ ...fileMsg, updateAvailable: 'yes' }, NONCE).updateAvailable, false);
// C2: ptt-open gains an optional canSave: true — the portal will take a save of THIS plan (a copy on this device only).
eq('canSave when the portal says exactly true', openFromMessage({ ...fileMsg, canSave: true }, NONCE).canSave, true);
eq('… never for anything else it says', ['true', 1, {}, null, undefined, false].map(v => openFromMessage({ ...fileMsg, canSave: v }, NONCE).canSave),
  [false, false, false, false, false, false]);
eq('… an old portal that never says it: no save back', openFromMessage(fileMsg, NONCE).canSave, false);
const linkMsg = { type: 'ptt-open', v: HANDOFF_VERSION, nonce: NONCE, kind: 'link', url: LINK, name: 'Roof.TAKEOFF', size: 99, number: 'A024-B' };
eq('a OneDrive link', openFromMessage(linkMsg, NONCE),
  { kind: 'link', url: LINK, name: 'Roof.TAKEOFF', size: 99, number: 'A024-B', lastModified: 0 });
eq('a link is never given a save back, whatever the message says', 'canSave' in openFromMessage({ ...linkMsg, canSave: true }, NONCE), false);
// Contract addendum 2 C2b (review PRICE-4): ptt-open gains an optional `who`, the portal's opaque word for the person
// signed in — base64url of 9 bytes: exactly 12 of A-Z a-z 0-9 - _. Inside the portal drafts are kept per person.
eq('the person\'s word: exactly the portal\'s shape', WHO_RE.source, '^[A-Za-z0-9_-]{12}$');
eq('who, for a copy on the device and for a link', [openFromMessage({ ...fileMsg, who: 'AbCdEfGhIj-_' }, NONCE).who,
  openFromMessage({ ...linkMsg, who: 'Zz9_-0aB1cD2' }, NONCE).who], ['AbCdEfGhIj-_', 'Zz9_-0aB1cD2']);
eq('… and nothing else is one (too short, too long, padded, base64 not base64url, an e-mail, not a string): no who at all',
  ['AbCdEfGhIjK', 'AbCdEfGhIjKlM', 'AbCdEfGhIj==', 'AbCdEfGhIj+/', 'a@example.com', 'AbCdEfGhIj\nl', 42, null, {}]
    .map(w => 'who' in openFromMessage({ ...fileMsg, who: w }, NONCE)), Array(9).fill(false));
eq('… an old portal that never says it: no who, the plan as before', [ 'who' in openFromMessage(fileMsg, NONCE), 'who' in openFromMessage(linkMsg, NONCE)],
  [false, false]);
eq('… and a word never makes a message the plan\'s that is not', openFromMessage({ ...fileMsg, who: 'AbCdEfGhIjKl', nonce: 'Another_tab_nonce_123' }, NONCE), null);
// Contract addendum 4 E4: ptt-open gains an optional `plan`, the portal's opaque word for the plan — base64url of 9
// bytes of a sha256 of its number, folder and name: exactly 12 of A-Z a-z 0-9 - _. Inside the portal drafts are kept
// per plan (two lots' folders can hold one house model's plan: the same name, the same bytes).
eq('the plan\'s word: exactly the portal\'s shape', PLAN_RE.source, '^[A-Za-z0-9_-]{12}$');
eq('plan, for a copy on the device and for a link', [openFromMessage({ ...fileMsg, plan: 'pLaN_A274-x9' }, NONCE).plan,
  openFromMessage({ ...linkMsg, plan: 'Qq_other-lot' }, NONCE).plan], ['pLaN_A274-x9', 'Qq_other-lot']);
eq('… with the person\'s word beside it, each its own', (({ who, plan }) => [who, plan])(openFromMessage({ ...fileMsg, who: 'AbCdEfGhIjKl', plan: 'pLaN_A274-x9' }, NONCE)),
  ['AbCdEfGhIjKl', 'pLaN_A274-x9']);
eq('… and nothing else is one (too short, too long, padded, base64 not base64url, a name or a number in the clear, not a string): no plan at all',
  ['pLaN_A274-x', 'pLaN_A274-x9Z', 'pLaN_A274x==', 'pLaN_A274x+/', 'A274/Plans/Main.takeoff', 'A274', 'pLaN_A274-\n9', 42, null, {}]
    .map(w => 'plan' in openFromMessage({ ...fileMsg, plan: w }, NONCE)), Array(10).fill(false));
eq('… an old portal that never says it: no plan, the plan as before', ['plan' in openFromMessage(fileMsg, NONCE), 'plan' in openFromMessage(linkMsg, NONCE)],
  [false, false]);
eq('… and a plan word never makes a message the plan\'s that is not', [openFromMessage({ ...fileMsg, plan: 'pLaN_A274-x9', nonce: 'Another_tab_nonce_123' }, NONCE),
  openFromMessage({ ...linkMsg, plan: 'pLaN_A274-x9', url: 'https://evil.test/x' }, NONCE)], [null, null]);

const refused = [
  ['another tab\'s nonce', { ...fileMsg, nonce: 'Another_tab_nonce_123' }],
  ['no nonce', { ...fileMsg, nonce: undefined }],
  ['another version', { ...fileMsg, v: 2 }],
  ['another type', { ...fileMsg, type: 'ptt-ready' }],
  ['another kind', { ...fileMsg, kind: 'folder' }],
  ['no file', { ...fileMsg, file: null }],
  ['a file that is not a Blob', { ...fileMsg, file: { size: 1234 } }],
  ['a file of another size', { ...fileMsg, size: 1235 }],
  ['a path for a name', { ...fileMsg, name: '../A274.takeoff' }],
  ['a Windows path for a name', { ...fileMsg, name: 'C:\\x\\A274.takeoff' }],
  ['not a plan file', { ...fileMsg, name: 'A274.pdf' }],
  ['an autosave', { ...fileMsg, name: 'A274.takeoff.autosave' }],
  ['a control character', { ...fileMsg, name: 'A274\n.takeoff' }],
  ['no size', { ...linkMsg, size: 0 }],
  ['a size that is not a whole number', { ...linkMsg, size: 1.5 }],
  ['a link to another site', { ...linkMsg, url: 'https://evil.test/plan.takeoff' }],
  ['no link', { ...linkMsg, url: '' }],
  ['a string', 'ptt-open'],
  ['nothing', null],
];
for (const [why, msg] of refused) eq(`refused: ${why}`, openFromMessage(msg, NONCE), null);
eq('refused: this tab has no proper nonce', openFromMessage({ ...fileMsg, nonce: 'short' }, 'short'), null);
eq('a bad project number is dropped, the plan kept', openFromMessage({ ...linkMsg, number: 'A\u0000' }, NONCE).number, '');
eq('a time that is not one is 0', openFromMessage({ ...linkMsg, lastModified: -5 }, NONCE).lastModified, 0);

// ── a fresh link ─────────────────────────────────────────────────────────
const ans = { type: 'ptt-link', v: HANDOFF_VERSION, nonce: NONCE, req: 'r2', url: LINK };
eq('the fresh link', linkFromMessage(ans, NONCE, 'r2'), LINK);
eq('none to be had', linkFromMessage({ ...ans, url: '' }, NONCE, 'r2'), '');
eq('another request\'s answer', linkFromMessage(ans, NONCE, 'r3'), null);
eq('another tab\'s answer', linkFromMessage({ ...ans, nonce: 'Another_tab_nonce_123' }, NONCE, 'r2'), null);
eq('a link to another site', linkFromMessage({ ...ans, url: 'https://evil.test/x' }, NONCE, 'r2'), null);
eq('not an answer', linkFromMessage({ ...ans, type: 'ptt-open' }, NONCE, 'r2'), null);

// ── the peer: the opener, or the page of this site it is framed in ───────
// Made-up windows. Another site's page cannot be read: its location throws, as a browser's does.
const SITE = 'https://portal.dcrframing.com';
const page = (origin, extra = {}) => ({ location: { origin, hash: '' }, ...extra });
function framed(childOrigin, parentOrigin, { readable = true } = {}) {
  const parent = readable ? page(parentOrigin) : { get location() { throw new Error('SecurityError: cross-origin'); } };
  const child = page(childOrigin, { parent, opener: null });
  return { child, parent };
}
const topTab = (origin, opener = null) => { const w = page(origin, { opener }); w.parent = w; return w; };
{
  const same = framed(SITE, SITE);
  ok('framed by a page of its own site', framedBySameSite(same.child));
  eq('not framed (a tab of its own)', framedBySameSite(topTab(SITE)), false);
  eq('framed by another site (its address cannot be read)', framedBySameSite(framed(SITE, 'https://evil.test', { readable: false }).child), false);
  eq('framed by another site whose address could be read', framedBySameSite(framed(SITE, 'https://evil.test').child), false);
  eq('an opaque origin is nobody\'s site (a sandboxed frame)', framedBySameSite(framed('null', 'null').child), false);
  eq('nothing to ask', [framedBySameSite(null), framedBySameSite({})], [false, false]);

  const p = portalPeer(same.child);
  eq('framed: the peer is the parent, at this page\'s own address', [p.via, p.win === same.parent, p.origin], ['frame', true, SITE]);
  const opener = { closed: false };
  const q = portalPeer(topTab('https://barajas545.github.io', opener));
  eq('a tab the portal opened: the opener, its address learnt from the plan (unchanged)', [q.via, q.win === opener, q.origin], ['opener', true, '']);
  eq('neither: no peer (a home-screen app\'s tab, a reload)', portalPeer(topTab('https://barajas545.github.io')), null);
  const evilFrame = framed('https://barajas545.github.io', 'https://evil.test', { readable: false });
  eq('framed by another site, no opener: no peer — the frame is never another site\'s', portalPeer(evilFrame.child), null);
  evilFrame.child.opener = opener;
  eq('… with an opener: the opener, as a tab always was', portalPeer(evilFrame.child)?.via, 'opener');

  // whose messages count
  const ev = (source, origin) => ({ source, origin, data: {} });
  ok('the frame\'s parent, from this site', fromPeer(ev(same.parent, SITE), p));
  eq('… another window of this site (a second frame, the page\'s own opener)', fromPeer(ev({}, SITE), p), false);
  eq('… the parent\'s window, from another address', fromPeer(ev(same.parent, 'https://evil.test'), p), false);
  eq('… from an opaque origin', fromPeer(ev(same.parent, 'null'), p), false);
  ok('the opener, from a portal address, before the plan came', fromPeer(ev(opener, SITE), q));
  eq('… the opener, from anywhere else', fromPeer(ev(opener, 'https://barajas545.github.io'), q), false);
  eq('… another window from the portal\'s address', fromPeer(ev({}, SITE), q), false);
  const pinned = { ...q, origin: SITE };
  ok('the opener, pinned to the plan\'s address', fromPeer(ev(opener, SITE), pinned));
  eq('… a different portal address after that', fromPeer(ev(opener, 'https://other.dcrframing.com'), pinned, [SITE, 'https://other.dcrframing.com']), false);
  eq('no peer, no event', [fromPeer(null, p), fromPeer(ev(same.parent, SITE), null)], [false, false]);

  eq('words to the frame go to this site only', peerTargets(p), [SITE]);
  eq('words to an opener before the plan: each portal address, never "*"', peerTargets(q), [...PORTAL_ORIGINS]);
  eq('… after it: the plan\'s address only', peerTargets(pinned), [SITE]);
  eq('no peer: nowhere', peerTargets(null), []);
}

// ── a save handed back: ptt-save ─────────────────────────────────────────
eq('Save waits 120 s for the portal\'s answer (C2)', SAVE_WAIT_MS, 120 * 1000);
eq('the answers that end the wait', [...SAVE_ENDINGS], ['kept', 'refused', 'no-room', 'failed']);
eq('what the portal may say while it keeps the file (each word starts the wait again)', [...SAVE_PROGRESS], ['keeping']);
eq('the news after it', [...SAVE_NEWS], ['sending', 'sent', 'copy']);
{
  const reqs = new Set();
  let seed = 7;
  for (let i = 0; i < 200; i++) {
    reqs.add(newSaveReq(a => { for (let j = 0; j < a.length; j++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; a[j] = (seed >>> 24) & 255; } }));
  }
  ok('a save\'s word: at most 20 characters of the nonce\'s alphabet', [...reqs].every(r => /^[A-Za-z0-9_-]{1,20}$/.test(r) && r.length <= 20));
  eq('… different every time', reqs.size, 200);
  ok('… from the browser\'s own random numbers by default', /^s[A-Za-z0-9_-]{9}$/.test(newSaveReq()));
}
const plan = new Blob([new Uint8Array(4321)]);
const SAVE = { nonce: NONCE, req: 's1Ab_-9xyz', name: 'A000T1 Made up plan.takeoff', size: 4321, file: plan };
{
  const m = saveMessage(SAVE);
  eq('the save, as the portal is handed it', m && { ...m, file: m.file === plan },
    { type: 'ptt-save', v: HANDOFF_VERSION, nonce: NONCE, req: 's1Ab_-9xyz', name: 'A000T1 Made up plan.takeoff', size: 4321, file: true });
  ok('… the file passed as it is (no copy, no read)', m.file === plan);
  ok('… a File will do as well as a Blob', !!saveMessage({ ...SAVE, file: new File([plan], SAVE.name) }));
  ok('… a word of exactly 20 characters', !!saveMessage({ ...SAVE, req: 'a'.repeat(20) }));
  const notSent = [
    ['no nonce', { ...SAVE, nonce: '' }],
    ['a nonce that is not one', { ...SAVE, nonce: 'short' }],
    ['no req', { ...SAVE, req: '' }],
    ['a req of 21 characters', { ...SAVE, req: 'a'.repeat(21) }],
    ['a req with a space', { ...SAVE, req: 's 1' }],
    ['a req that is a number', { ...SAVE, req: 5 }],
    ['a path for a name', { ...SAVE, name: '../A000T1.takeoff' }],
    ['a name that is not a plan', { ...SAVE, name: 'A000T1.pdf' }],
    ['a control character in the name', { ...SAVE, name: 'A000T1\u0007.takeoff' }],
    ['a size that is not the file\'s', { ...SAVE, size: 4320 }],
    ['no size', { ...SAVE, size: 0 }],
    ['a size that is not a whole number', { ...SAVE, size: 4321.5 }],
    ['no file', { ...SAVE, file: null }],
    ['a file that is not a Blob', { ...SAVE, file: { size: 4321 } }],
  ];
  for (const [why, s] of notSent) eq(`not sent: ${why}`, saveMessage(s), null);
  eq('not sent: nothing', saveMessage(), null);
}

// ── the portal's word: ptt-save-state ────────────────────────────────────
{
  const st = (o = {}) => ({ type: 'ptt-save-state', v: HANDOFF_VERSION, nonce: NONCE, req: SAVE.req, state: 'kept', ...o });
  eq('kept', saveStateFromMessage(st(), NONCE, SAVE.req), { state: 'kept', final: true, why: '' });
  eq('refused, with its words', saveStateFromMessage(st({ state: 'refused', why: 'Not allowed for you.' }), NONCE, SAVE.req),
    { state: 'refused', final: true, why: 'Not allowed for you.' });
  eq('no room', saveStateFromMessage(st({ state: 'no-room' }), NONCE, SAVE.req).state, 'no-room');
  eq('failed, its words made plain (no control characters, one line)', saveStateFromMessage(st({ state: 'failed', why: ' Disk\u0000 said\n\tno ' }), NONCE, SAVE.req),
    { state: 'failed', final: true, why: 'Disk said no' });
  eq('… and short', saveStateFromMessage(st({ state: 'failed', why: 'x'.repeat(5000) }), NONCE, SAVE.req).why.length, 300);
  eq('… words that are not words: none', saveStateFromMessage(st({ state: 'failed', why: { evil: 1 } }), NONCE, SAVE.req).why, '');
  eq('sending, with how far', saveStateFromMessage(st({ state: 'sending', pct: 45.4 }), NONCE, SAVE.req), { state: 'sending', final: false, why: '', pct: 45 });
  eq('… clamped', [saveStateFromMessage(st({ state: 'sending', pct: 140 }), NONCE, SAVE.req).pct,
    saveStateFromMessage(st({ state: 'sending', pct: -3 }), NONCE, SAVE.req).pct], [100, 0]);
  eq('… no number: none', [saveStateFromMessage(st({ state: 'sending' }), NONCE, SAVE.req).pct,
    saveStateFromMessage(st({ state: 'sending', pct: '45' }), NONCE, SAVE.req).pct,
    saveStateFromMessage(st({ state: 'sending', pct: NaN }), NONCE, SAVE.req).pct], [null, null, null]);
  // The portal's word while it copies the file into its own storage (C2 v1, optional): not an answer.
  eq('keeping, with how far', saveStateFromMessage(st({ state: 'keeping', pct: 44.6 }), NONCE, SAVE.req), { state: 'keeping', final: false, why: '', pct: 45 });
  eq('… clamped', [saveStateFromMessage(st({ state: 'keeping', pct: 101 }), NONCE, SAVE.req).pct,
    saveStateFromMessage(st({ state: 'keeping', pct: -1 }), NONCE, SAVE.req).pct], [100, 0]);
  eq('… no number: none (it is a word all the same)', [saveStateFromMessage(st({ state: 'keeping' }), NONCE, SAVE.req),
    saveStateFromMessage(st({ state: 'keeping', pct: '45' }), NONCE, SAVE.req).pct,
    saveStateFromMessage(st({ state: 'keeping', pct: Infinity }), NONCE, SAVE.req).pct], [{ state: 'keeping', final: false, why: '', pct: null }, null, null]);
  eq('… for another save, another tab, another version: nothing', [saveStateFromMessage(st({ state: 'keeping', req: 's2' }), NONCE, SAVE.req),
    saveStateFromMessage(st({ state: 'keeping', nonce: 'Another_tab_nonce_123' }), NONCE, SAVE.req),
    saveStateFromMessage(st({ state: 'keeping', v: 2 }), NONCE, SAVE.req)], [null, null, null]);
  eq('sent', saveStateFromMessage(st({ state: 'sent' }), NONCE, SAVE.req), { state: 'sent', final: false, why: '' });
  eq('copy, with the copy\'s name', saveStateFromMessage(st({ state: 'copy', name: 'A000T1 Made up plan - iPad 2026-11-04 1415.takeoff' }), NONCE, SAVE.req),
    { state: 'copy', final: false, why: '', name: 'A000T1 Made up plan - iPad 2026-11-04 1415.takeoff' });
  eq('… a name that is not a plan\'s: none', saveStateFromMessage(st({ state: 'copy', name: '../x.takeoff' }), NONCE, SAVE.req).name, '');
  const ignored = [
    ['another save\'s answer', st({ req: 's2' })],
    ['another tab\'s answer', st({ nonce: 'Another_tab_nonce_123' })],
    ['another version', st({ v: 2 })],
    ['another type', st({ type: 'ptt-link' })],
    ['a state there is not', st({ state: 'saved' })],
    ['no state', st({ state: undefined })],
    ['a string', 'ptt-save-state'],
    ['nothing', null],
  ];
  for (const [why, m] of ignored) eq(`ignored: ${why}`, saveStateFromMessage(m, NONCE, SAVE.req), null);
  eq('ignored: this tab has no proper nonce', saveStateFromMessage(st({ nonce: 'short' }), 'short', SAVE.req), null);
  eq('ignored: waiting on no proper req', saveStateFromMessage(st({ req: 'a'.repeat(21) }), NONCE, 'a'.repeat(21)), null);
}

// ── askPortalToKeep: the wait, with made-up windows and a made-up clock ──
function clock() {
  let now = 0;
  let id = 0;
  const timers = new Map();
  return {
    setTimeout: (fn, ms) => { timers.set(++id, { fn, at: now + ms, every: 0 }); return id; },
    clearTimeout: i => { timers.delete(i); },
    setInterval: (fn, ms) => { timers.set(++id, { fn, at: now + ms, every: ms }); return id; },
    clearInterval: i => { timers.delete(i); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const [k, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [k, t];
        if (!next) break;
        now = next[1].at;
        if (next[1].every) next[1].at += next[1].every; else timers.delete(next[0]);
        next[1].fn();
      }
      now = end;
    },
    pending: () => timers.size,
  };
}
const portalWin = { closed: false };
const PEER = { via: 'frame', win: portalWin, origin: SITE };
function world({ peer = PEER, postThrows = false } = {}) {
  const c = clock();
  const handlers = new Set();
  const posted = [];
  const news = [];
  let gone = false;
  const env = {
    setTimeout: c.setTimeout, clearTimeout: c.clearTimeout, setInterval: c.setInterval, clearInterval: c.clearInterval,
    listen: fn => { handlers.add(fn); return () => handlers.delete(fn); },
    post: (win, msg, origin) => { if (postThrows) throw new Error('DataCloneError'); posted.push({ win, msg, origin }); },
    peerGone: () => gone,
    onNews: n => news.push(n),
    waitMs: SAVE_WAIT_MS,
    pollMs: 2000,
  };
  const say = (state, extra = {}, { source = peer.win, origin = peer.origin, req = SAVE.req, nonce = NONCE } = {}) => {
    for (const h of [...handlers]) h({ source, origin, data: { type: 'ptt-save-state', v: 1, nonce, req, state, ...extra } });
  };
  return { c, env, handlers, posted, news, say, close: () => { gone = true; } };
}
const keep = (w, save = {}) => askPortalToKeep({ peer: PEER, ...SAVE, ...save }, w.env);
let settledAs = null;
const watch = p => { settledAs = null; p.then(r => { settledAs = r.ending; }); return p; };
const tick = () => new Promise(r => setImmediate(r));
{
  const w = world();
  const p = watch(keep(w));
  eq('the save is posted once, to the portal\'s window, at its address only', w.posted.map(x => [x.win === portalWin, x.origin, x.msg.type, x.msg.req]),
    [[true, SITE, 'ptt-save', SAVE.req]]);
  ok('… the file itself, by reference', w.posted[0].msg.file === plan && w.posted[0].msg.size === plan.size);
  w.say('sending', { pct: 10 });
  w.say('kept', {}, { source: {} });                         // another window
  w.say('kept', {}, { origin: 'https://evil.test' });        // another address
  w.say('kept', {}, { req: 's-other' });                     // another save
  w.say('kept', {}, { nonce: 'Another_tab_nonce_123' });     // another tab
  w.c.advance(60 * 1000);
  await tick();
  eq('nothing but the portal\'s own answer to THIS save ends the wait', settledAs, null);
  eq('… a word of news before it is passed on', w.news.map(n => [n.state, n.pct]), [['sending', 10]]);
  w.say('kept');
  const r = await p;
  eq('kept: the one answer that is a save', [r.ending, r.why], ['kept', '']);
  eq('… and the clock is stopped (no timeout, no poll)', w.c.pending(), 0);
  ok('… but the news of the send is still heard', w.handlers.size === 1);
  w.say('kept');
  w.say('sending', { pct: 50 });
  w.say('copy', { name: 'A000T1 Made up plan - iPad 2026-11-04 1415.takeoff' });
  eq('after kept: news only (a second "kept" is nothing new)', w.news.map(n => n.state), ['sending', 'sending', 'copy']);
  eq('… and the listener goes once the send is over', w.handlers.size, 0);
}
{
  const w = world();
  const p = keep(w);
  w.say('kept');
  const r = await p;
  r.stop();
  eq('stop(): no more listening (the next save, or the frame closing)', w.handlers.size, 0);
  w.say('sent');
  eq('… and nothing more is heard', w.news.length, 0);
}
for (const [state, why] of [['refused', 'Not a plan the portal handed over.'], ['no-room', ''], ['failed', 'OPFS write failed']]) {
  const w = world();
  const p = keep(w);
  w.say(state, why ? { why } : {});
  const r = await p;
  eq(`${state}: the portal's answer, its words`, [r.ending, r.why], [state, why]);
  eq(`… and nothing listens any more`, [w.handlers.size, w.c.pending()], [0, 0]);
  w.say('kept');
  eq(`… a late "kept" changes nothing`, w.news.length, 0);
}
{
  const w = world();
  const p = watch(keep(w));
  w.c.advance(SAVE_WAIT_MS - 1);
  await tick();
  eq('no answer for just under 120 s: still waiting', settledAs, null);
  w.c.advance(1);
  const r = await p;
  eq('no answer in 120 s: timeout', r.ending, 'timeout');
  eq('… nothing left ticking; one listener stays, for a late answer', [w.handlers.size, w.c.pending()], [1, 0]);
  w.say('kept');
  eq('… so a "kept" after it is not the wait\'s answer, nor news: it is the late answer', [w.news.length, await r.late],
    [0, { state: 'kept', why: '' }]);
  r.stop();
}
{
  const w = world();
  const p = watch(keep(w));
  w.c.advance(5000);
  w.close();
  w.c.advance(2000);
  const r = await p;
  eq('the portal\'s page closed while waiting: gone (seen within a poll)', r.ending, 'gone');
}
{
  const w = world();
  w.close();
  eq('the portal\'s page already gone: not even posted', [(await keep(w)).ending, w.posted.length], ['gone', 0]);
}
{
  const w = world({ postThrows: true });
  eq('the save could not be posted: not sent', (await keep(w)).ending, 'not-sent');
  eq('… nothing left behind', [w.handlers.size, w.c.pending()], [0, 0]);
}
{
  const w = world();
  eq('a save that is not one (a size that is not the file\'s): not sent, never posted', [(await keep(w, { size: 1 })).ending, w.posted.length], ['not-sent', 0]);
  eq('… nor to an opener whose address was never pinned (a save goes to one address)',
    (await askPortalToKeep({ peer: { via: 'opener', win: portalWin, origin: '' }, ...SAVE }, world().env)).ending, 'not-sent');
  eq('… nor with no peer', (await askPortalToKeep({ peer: null, ...SAVE }, world().env)).ending, 'not-sent');
}
{
  // Found in the browser: with no timers of its own the wait used the page's, called as T.setTimeout(...) — and a
  // window's timers called with any other `this` throw "Illegal invocation". The page's timers here insist, as a
  // browser's do.
  const real = { setTimeout, clearTimeout, setInterval, clearInterval };
  const strict = name => function (...args) {
    if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
    return real[name](...args);
  };
  for (const name of Object.keys(real)) globalThis[name] = strict(name);
  try {
    const w = world();
    const { setTimeout: a, clearTimeout: b, setInterval: c, clearInterval: d, ...env } = w.env;
    let threw = null;
    const p = askPortalToKeep({ peer: PEER, ...SAVE }, env).catch(e => { threw = e; return { ending: 'threw' }; });
    w.say('kept');
    const r = await p;
    eq('with the page\'s own timers (a browser\'s rules for `this`): it waits, and kept is kept', [r.ending, threw && threw.message], ['kept', null]);
    r.stop && r.stop();
  } finally {
    Object.assign(globalThis, real);
  }
}
// Time the page spends hidden is not counted. Switching apps while the portal spools a big plan suspends the
// portal's page and this frame together; on the way back this page's timer is overdue at once — and once
// ended the wait with "not saved" a moment before the portal's 'kept', which then went unheard while the
// portal sent the file anyway. A made-up document says whether the page is in front.
function fakeDoc(state = 'visible') {
  const fns = new Set();
  return {
    get visibilityState() { return state; },
    addEventListener: (type, fn) => { if (type === 'visibilitychange') fns.add(fn); },
    removeEventListener: (type, fn) => { if (type === 'visibilitychange') fns.delete(fn); },
    set(s) { state = s; for (const fn of [...fns]) fn(); },
    listeners: () => fns.size,
  };
}
{
  // hidden at 10 s, away for three minutes (the wait comes due while hidden), back, then the portal's 'kept'
  const w = world();
  const doc = fakeDoc();
  const p = watch(askPortalToKeep({ peer: PEER, ...SAVE }, { ...w.env, doc }));
  w.c.advance(10 * 1000);
  doc.set('hidden');
  w.c.advance(180 * 1000);
  doc.set('visible');
  w.c.advance(5 * 1000);
  await tick();
  eq('hidden past the 2 minutes, then back: still waiting (the portal was put away too)', settledAs, null);
  w.say('kept');
  eq('… and the portal\'s "kept" is heard: saved', (await p).ending, 'kept');
  eq('… the page\'s visibility no longer watched', doc.listeners(), 0);
}
{
  // suspended with the frame: no timer runs while away, and the overdue one fires the moment the page is back
  const w = world();
  const doc = fakeDoc();
  const p = watch(askPortalToKeep({ peer: PEER, ...SAVE }, { ...w.env, doc }));
  w.c.advance(10 * 1000);
  doc.set('hidden');
  doc.set('visible');                      // back — and the clock jumps past the window at once
  w.c.advance(SAVE_WAIT_MS);
  await tick();
  eq('the wait comes due just after the page is back (hidden since the post): it starts again', settledAs, null);
  w.c.advance(SAVE_WAIT_MS - 20 * 1000);
  await tick();
  eq('… for the whole window, not the rest of it', settledAs, null);
  w.c.advance(20 * 1000);
  const r = await p;
  eq('… and a whole window in front with no answer is a timeout all the same', r.ending, 'timeout');
  eq('… nothing left ticking or watching (the late answer\'s listener aside)', [w.handlers.size, w.c.pending(), doc.listeners()], [1, 0, 0]);
  r.stop();
  eq('… and stop() takes that too', w.handlers.size, 0);
}
{
  const w = world();
  const doc = fakeDoc();
  const p = watch(askPortalToKeep({ peer: PEER, ...SAVE }, { ...w.env, doc }));
  w.c.advance(SAVE_WAIT_MS);
  eq('never hidden: a timeout at 120 s, as ever', (await p).ending, 'timeout');
  eq('… its watch gone too', doc.listeners(), 0);
}
{
  const w = world();
  const doc = fakeDoc('hidden');
  const p = watch(askPortalToKeep({ peer: PEER, ...SAVE }, { ...w.env, doc }));
  w.c.advance(3 * SAVE_WAIT_MS);
  await tick();
  eq('a save posted from a hidden page waits while it stays hidden', settledAs, null);
  w.say('refused', { why: 'Not allowed.' });
  eq('… and still hears the portal\'s answer', (await p).ending, 'refused');
  eq('… then stops watching', doc.listeners(), 0);
}
{
  // a computer's tab (the opener), pinned to the plan's address: the same rules
  const opener = { closed: false };
  const peer = { via: 'opener', win: opener, origin: SITE };
  const w = world({ peer });
  const p = askPortalToKeep({ peer, ...SAVE }, w.env);
  eq('an opener\'s save goes to the plan\'s address', w.posted[0].origin, SITE);
  w.say('kept', {}, { origin: 'https://evil.test' });
  w.say('kept');
  eq('… and only its answer from there counts', (await p).ending, 'kept');
}

// ── the portal's heartbeat: a "keeping" that got further starts the wait again ──
// On an iPad, copying a 2 GB File into the portal's own storage can take longer than the 2 minutes: a save the portal
// was about to keep was reported as not saved. A portal that says it is at it is waited for; one that says nothing
// is waited for as ever (the tests above).
{
  const w = world();
  const p = watch(keep(w));
  w.c.advance(100 * 1000);
  w.say('keeping', { pct: 45 });
  w.c.advance(SAVE_WAIT_MS - 1);
  await tick();
  eq('"keeping" at 100 s: still waiting 120 s after it (220 s in all)', settledAs, null);
  eq('… and its how-far is passed on, for the bar', w.news.map(n => [n.state, n.pct]), [['keeping', 45]]);
  w.c.advance(1);
  const r = await p;
  eq('… then a whole window with no word: a timeout, 120 s after the last word', r.ending, 'timeout');
  r.stop();
}
{
  // ten minutes of a slow copy, a word every 30 s, then the answer
  const w = world();
  const p = watch(keep(w));
  for (let i = 1; i <= 20; i++) { w.c.advance(30 * 1000); w.say('keeping', { pct: i * 5 }); }
  await tick();
  eq('a word every 30 s for 10 minutes: still waiting', settledAs, null);
  w.c.advance(SAVE_WAIT_MS - 1000);
  await tick();
  eq('… and still, just under 120 s after the last one', settledAs, null);
  w.say('kept');
  const r = await p;
  eq('… and its "kept" is a save, as ever', [r.ending, w.news.length, w.news[19].pct], ['kept', 20, 100]);
  eq('… nothing ticking after it', w.c.pending(), 0);
  w.say('keeping', { pct: 100 });
  eq('… a "keeping" after the answer is not news', w.news.length, 20);
  r.stop();
}
// Only a word that the portal got further starts the wait again (review LW-6, contract addendum 2 C2b). A copy whose
// read never comes back was still told every 10 s by the portal's worker, at the same how-far: each one started the
// 2 minutes again, Save never ended, and every later Save was "Still saving" until the frame was closed.
// (`now`: the ending if the wait has ended by now, never waiting for one that has not — so a wait that never ends
// fails here instead of hanging the run.)
const now = p => Promise.race([p, tick().then(() => ({ ending: 'still waiting', stop() {}, late: null }))]);
{
  // the reviewer's stall: the second slice never comes back, "keeping" at 40% every 10 s for ever
  const w = world();
  const p = watch(keep(w));
  w.say('keeping', { pct: 40 });
  for (let t = 10; t < 120; t += 10) { w.c.advance(10 * 1000); w.say('keeping', { pct: 40 }); }
  w.c.advance(10 * 1000 - 1);
  await tick();
  eq('a copy stuck at 40% and told every 10 s: still waiting just under 120 s after it got to 40%', settledAs, null);
  w.c.advance(1);
  const r = await now(p);
  eq('… then the wait ends, 120 s after the last time it got further — not for ever', r.ending, 'timeout');
  eq('… every beat still shown on the bar', w.news.filter(n => n.state === 'keeping' && n.pct === 40).length, 12);
  eq('… and a late answer is still heard after it', [w.handlers.size, typeof (r.late && r.late.then)], [1, 'function']);
  r.stop();
}
{
  const w = world();
  const p = watch(keep(w));
  w.c.advance(100 * 1000);
  w.say('keeping', { pct: 40 });
  w.c.advance(100 * 1000);
  w.say('keeping', { pct: 40 });
  w.say('keeping', { pct: 39 });
  w.c.advance(19 * 1000);
  w.say('keeping', { pct: 41 });
  w.c.advance(SAVE_WAIT_MS - 1);
  await tick();
  eq('the same how-far, or less, does not start the wait again; further does (41% at 219 s: waiting until 339 s)', settledAs, null);
  w.c.advance(1);
  eq('… and 120 s after it with nothing further: a timeout', (await now(p)).ending, 'timeout');
}
{
  const w = world();
  const p = watch(keep(w));
  w.c.advance(110 * 1000);
  w.say('keeping');
  w.c.advance(10 * 1000 - 1);
  await tick();
  eq('"keeping" with no number is shown (the bar) …', [settledAs, w.news.map(n => [n.state, n.pct])], [null, [['keeping', null]]]);
  w.c.advance(1);
  const r = await now(p);
  eq('… but says nothing got further: the wait ends 120 s after the post, as ever', r.ending, 'timeout');
  r.stop();
}
{
  // a save queued behind another in the portal hears "keeping" with no number while the other one is kept
  const w = world();
  const p = watch(keep(w));
  for (let t = 0; t < 115; t += 5) { w.c.advance(5 * 1000); w.say('keeping'); }
  w.say('keeping', { pct: 0 });
  w.c.advance(SAVE_WAIT_MS - 1);
  await tick();
  eq('queued (no number, for nearly 2 minutes), then its own copy starts at 0%: waited for 120 s from that', settledAs, null);
  w.say('kept');
  eq('… and its "kept" is a save', (await p).ending, 'kept');
}
for (const state of ['sending', 'sent', 'copy']) {
  // C2 lets any word that is not an answer come; before the answer it is shown, but it is not "the portal got further"
  const w = world();
  const p = watch(keep(w));
  w.c.advance(100 * 1000);
  w.say(state, state === 'copy' ? { name: 'A000T1 Made up plan - iPad 2026-11-04 1415.takeoff' } : {});
  w.c.advance(20 * 1000 - 1);
  await tick();
  eq(`"${state}" before the answer is passed on, and the wait goes on from where it was`, [settledAs, w.news.map(n => n.state)], [null, [state]]);
  w.say('kept');
  eq(`… and only "kept" after it is a save`, (await p).ending, 'kept');
}
{
  const w = world();
  const p = watch(keep(w));
  w.c.advance(100 * 1000);
  w.say('sending', { pct: 10 });
  w.c.advance(20 * 1000);
  eq('"sending" before the answer does not start the wait again: a timeout 120 s after the post', (await now(p)).ending, 'timeout');
}
{
  const w = world();
  const p = watch(keep(w));
  w.c.advance(100 * 1000);
  w.say('keeping', { pct: 10 }, { source: {} });                       // another window
  w.say('keeping', { pct: 10 }, { origin: 'https://evil.test' });      // another address
  w.say('keeping', { pct: 10 }, { req: 's-older' });                   // another save (an earlier, timed-out one)
  w.say('keeping', { pct: 10 }, { nonce: 'Another_tab_nonce_123' });   // another tab
  w.say('spooling', { pct: 10 });                                      // a word there is not
  w.c.advance(20 * 1000);
  const r = await p;
  eq('a word from anyone else, about another save, or a word there is not: the wait is not started again', [r.ending, w.news.length], ['timeout', 0]);
  r.stop();
}
{
  // hidden since the post, then the portal's word while in front: the window from that word, in front all of it
  const w = world();
  const doc = fakeDoc();
  const p = watch(askPortalToKeep({ peer: PEER, ...SAVE }, { ...w.env, doc }));
  doc.set('hidden');
  w.c.advance(30 * 1000);
  doc.set('visible');
  w.say('keeping', { pct: 20 });
  w.c.advance(SAVE_WAIT_MS);
  const r = await p;
  eq('a word after the page was hidden starts the wait from it; a whole window in front after it is a timeout', r.ending, 'timeout');
  r.stop();
}

// ── a late answer: the wait ran out, then the portal answered ────────────
{
  const w = world();
  const p = keep(w);
  w.c.advance(SAVE_WAIT_MS);
  const r = await p;
  let lateWord = 'none yet';
  r.late.then(v => { lateWord = v; });
  w.say('keeping', { pct: 99 });
  await tick();
  eq('timed out: a "keeping" after it is neither news nor the late answer', [r.ending, w.news.length, lateWord], ['timeout', 0, 'none yet']);
  w.say('kept', {}, { req: 's-older' });
  w.say('kept', {}, { source: {} });
  await tick();
  eq('… nor another save\'s "kept", nor another window\'s', lateWord, 'none yet');
  w.say('kept');
  await tick();
  eq('… the portal\'s own late "kept" is the late answer', lateWord, { state: 'kept', why: '' });
  ok('… and the news of the send is heard after it', w.handlers.size === 1);
  w.say('kept');
  w.say('sending', { pct: 30 });
  w.say('copy', { name: 'A000T1 Made up plan - iPad 2026-11-04 1415.takeoff' });
  eq('… as after a "kept" in time: news only, until the send is over', [w.news.map(n => n.state), w.handlers.size], [['sending', 'copy'], 0]);
}
for (const [state, why] of [['refused', 'Not a plan the portal handed over.'], ['no-room', ''], ['failed', 'The copy did not check out.']]) {
  const w = world();
  const p = keep(w);
  w.c.advance(SAVE_WAIT_MS);
  const r = await p;
  w.say(state, why ? { why } : {});
  eq(`timed out, then "${state}": the late answer, its words — and nothing listens any more`, [await r.late, w.handlers.size],
    [{ state, why }, 0]);
  w.say('kept');
  eq('… a "kept" after that changes nothing', w.news.length, 0);
}
{
  const w = world();
  const p = keep(w);
  w.c.advance(SAVE_WAIT_MS);
  const r = await p;
  r.stop();
  eq('timed out, then stop() (the next save is handed over): the late answer is none', [await r.late, w.handlers.size], [null, 0]);
  w.say('kept');
  eq('… so this save\'s "kept" is never heard after it', w.news.length, 0);
}
{
  const endings = [];
  for (const answer of ['kept', 'refused']) {
    const w = world();
    const p = keep(w);
    w.say(answer);
    const r = await p;
    endings.push([r.ending, await r.late]);
    r.stop();
  }
  const g = world();
  const gp = keep(g);
  g.close();
  g.c.advance(2000);
  const gr = await gp;
  endings.push([gr.ending, await gr.late]);
  const n = await keep(world(), { size: 1 });
  endings.push([n.ending, await n.late]);
  eq('only a timeout has a late answer: none for kept, an answer, gone or not sent', endings,
    [['kept', null], ['refused', null], ['gone', null], ['not-sent', null]]);
}

console.log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass — only the portal's own window hands a plan over, in its shape, and only its 'kept' is a save`);
process.exit(fails ? 1 : 0);
