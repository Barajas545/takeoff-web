// Portal 2 hands a plan over, window to window: js/core/portal-handoff.js.
//
// Portal 2 (portal.dcrframing.com) is another site, so it opens this app at
// index.html#portal=<nonce> and the two windows talk: this tab says it is
// ready (to the portal's address only), the portal posts the plan — a copy
// its Plans Library keeps on the device, or a OneDrive link — and this tab
// asks it for a fresh link when one expires. What counts as the portal's
// message is decided here, and driven here with made-up messages. No
// browser, no network.
//
// Run: node tests/portal-handoff.mjs
import {
  PORTAL_ORIGINS, HANDOFF_VERSION, HANDOFF_WAIT_MS, parsePortalHash, isPortalOrigin, readyMessage, renewMessage, offlineMessage,
  linkOk, openFromMessage, linkFromMessage,
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
  { kind: 'file', file: true, name: 'A274 Main.takeoff', size: 1234, number: 'A274', lastModified: 1761500000000, updateAvailable: true });
eq('updateAvailable only when true', openFromMessage({ ...fileMsg, updateAvailable: 'yes' }, NONCE).updateAvailable, false);
const linkMsg = { type: 'ptt-open', v: HANDOFF_VERSION, nonce: NONCE, kind: 'link', url: LINK, name: 'Roof.TAKEOFF', size: 99, number: 'A024-B' };
eq('a OneDrive link', openFromMessage(linkMsg, NONCE),
  { kind: 'link', url: LINK, name: 'Roof.TAKEOFF', size: 99, number: 'A024-B', lastModified: 0 });

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

console.log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass — only the portal's own window hands a plan over, and only in its shape`);
process.exit(fails ? 1 : 0);
