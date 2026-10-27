// A #plans link where no folder can be opened: js/core/plans-link.js.
//
// The portal's plan button opens this app at index.html#plans=<number> for
// everyone who can see the project — field crews on phones included. Chrome
// and Edge on a computer open the Plans Archive folder there; everywhere else
// the link shows a panel: that job's plans already kept on this device, the
// way to open a plan file, and on a computer the link to copy into Edge or
// Chrome. What the panel says and lists is decided here, and driven here with
// made-up browsers, made-up kept plans (in the app's own storage format) and
// made-up projects. No browser, no network.
//
// Run: node tests/plans-link.mjs
import {
  INVALID_LINK, HANDHELD_HINT, COMPUTER_HINT, isPhoneOrTablet, canOpenArchiveFolder, keptCode, portalCode,
  plansForProject, plansLinkHref, copyText, linkPanelModel, openAfterAsking,
} from '../js/core/plans-link.js';
import { parsePlansLink } from '../js/core/plans-folder.js';
import {
  KEPT_INDEX_KEY, PORTAL_INDEX_KEY, PORTAL_TOKEN_KEY, keptCopies, portalCopies, libraryOwner,
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

// ── which device ─────────────────────────────────────────────────────────
// Made-up browsers: a user agent, maybe userAgentData, touch points, and what
// the (pointer: coarse) query answers.
const UA = {
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  androidTablet: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
  ipadOld: 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
  winFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
  winEdge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
  linuxChrome: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  chromebook: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  odd: 'SomethingElse/1.0',
};
// An Android tablet asking for the desktop site — Chrome's default on a big
// tablet, Samsung Internet's and Firefox's when ticked — sends the desktop
// Linux user agent: no "Android", userAgentData.mobile false.
UA.tabletDesktopSite = UA.linuxChrome;
UA.tabletDesktopFirefox = UA.linuxFirefox;
const browser = ({ ua = '', mobile, touch = 0, coarse = false, mm = true, folders = false } = {}) => ({
  navigator: {
    userAgent: ua, maxTouchPoints: touch,
    ...(mobile === undefined ? {} : { userAgentData: { mobile, brands: [] } }),
  },
  ...(mm ? { matchMedia: q => ({ matches: q === '(pointer: coarse)' ? coarse : false }) } : {}),
  ...(folders ? { showDirectoryPicker: async () => { throw new Error('made up'); } } : {}),
});
for (const [label, b, want] of [
  ['Chrome on an Android phone (userAgentData says mobile)', browser({ ua: UA.androidChrome, mobile: true, touch: 5, coarse: true }), true],
  ['Chrome on an Android tablet (userAgentData says not mobile)', browser({ ua: UA.androidTablet, mobile: false, touch: 10, coarse: true }), true],
  ['Firefox on an Android phone (no userAgentData)', browser({ ua: UA.androidFirefox, touch: 5, coarse: true }), true],
  ['Safari on an iPhone', browser({ ua: UA.iphone, touch: 5, coarse: true }), true],
  ['an older iPad that still says iPad', browser({ ua: UA.ipadOld, touch: 5, coarse: true }), true],
  ['an iPad asking for the desktop site (a "Mac" with touch points)', browser({ ua: UA.mac, touch: 5, coarse: true }), true],
  ['Safari on a Mac', browser({ ua: UA.mac, touch: 0 }), false],
  ['Firefox on Windows', browser({ ua: UA.winFirefox }), false],
  ['Firefox on a Windows touch laptop folded into a tablet', browser({ ua: UA.winFirefox, touch: 10, coarse: true }), false],
  ['Edge on Windows (userAgentData says not mobile)', browser({ ua: UA.winEdge, mobile: false }), false],
  ['Firefox on Linux', browser({ ua: UA.linuxFirefox }), false],
  ['Chrome on Linux with a mouse', browser({ ua: UA.linuxChrome, mobile: false }), false],
  ['a Linux computer with a touch screen and a mouse (fine pointer)', browser({ ua: UA.linuxChrome, mobile: false, touch: 10, coarse: false }), false],
  ['a Linux computer with a touch screen and no matchMedia', browser({ ua: UA.linuxFirefox, touch: 10, mm: false }), false],
  ['Chrome on an Android tablet asking for the desktop site (Linux UA, mobile:false, touch, coarse)',
    browser({ ua: UA.tabletDesktopSite, mobile: false, touch: 10, coarse: true }), true],
  ['Firefox on an Android tablet in desktop mode (Linux UA, touch, coarse)',
    browser({ ua: UA.tabletDesktopFirefox, touch: 5, coarse: true }), true],
  ['a Chromebook with a touch screen', browser({ ua: UA.chromebook, mobile: false, touch: 10, coarse: true }), false],
  ['an unknown browser with touch and a coarse pointer', browser({ ua: UA.odd, touch: 5, coarse: true }), true],
  ['an unknown browser with touch and a mouse', browser({ ua: UA.odd, touch: 5, coarse: false }), false],
  ['an unknown browser with no matchMedia', browser({ ua: UA.odd, touch: 5, mm: false }), false],
  ['nothing to go on', {}, false],
  ['no window at all', null, false],
]) eq(`isPhoneOrTablet: ${label}`, isPhoneOrTablet(b), want);
eq('isPhoneOrTablet: a matchMedia that throws is a fine pointer',
  isPhoneOrTablet({ navigator: { userAgent: UA.odd, maxTouchPoints: 2 }, matchMedia() { throw new Error('made up'); } }), false);

// ── where the Plans Archive folder is opened ─────────────────────────────
// Chrome and Edge on a computer. Chrome for Android has had
// showDirectoryPicker since 132, but a phone or a tablet still gets the
// panel (and the start screen's phone note), never the folder path.
for (const [label, b, want] of [
  ['Edge on Windows', browser({ ua: UA.winEdge, mobile: false, folders: true }), true],
  ['Edge on a Windows touch laptop', browser({ ua: UA.winEdge, mobile: false, touch: 10, coarse: true, folders: true }), true],
  ['Chrome on a Chromebook with a touch screen', browser({ ua: UA.chromebook, mobile: false, touch: 10, coarse: true, folders: true }), true],
  ['Chrome on Linux with a mouse', browser({ ua: UA.linuxChrome, mobile: false, folders: true }), true],
  ['Firefox on Windows (no showDirectoryPicker)', browser({ ua: UA.winFirefox }), false],
  ['Safari on a Mac (no showDirectoryPicker)', browser({ ua: UA.mac }), false],
  ['Chrome on an Android phone WITH showDirectoryPicker (132+)', browser({ ua: UA.androidChrome, mobile: true, touch: 5, coarse: true, folders: true }), false],
  ['Chrome on an Android tablet WITH showDirectoryPicker', browser({ ua: UA.androidTablet, mobile: false, touch: 10, coarse: true, folders: true }), false],
  ['Chrome on an Android tablet on the desktop site WITH showDirectoryPicker',
    browser({ ua: UA.tabletDesktopSite, mobile: false, touch: 10, coarse: true, folders: true }), false],
  ['Safari on an iPhone', browser({ ua: UA.iphone, touch: 5, coarse: true }), false],
  ['no window at all', null, false],
]) eq(`canOpenArchiveFolder: ${label}`, canOpenArchiveFolder(b), want);

// ── opening from a list: "Unsaved changes" before the panel closes ───────
{
  const run = async ({ dirty, answer }) => {
    const calls = [];
    const p = openAfterAsking({
      dirty,
      confirmDiscard: async () => { calls.push('ask'); return answer; },
      beforeOpen: () => calls.push('close panel'),
      open: async () => { calls.push('open'); },
    });
    const sync = [...calls];
    return { sync, result: await p, calls };
  };
  const clean = await run({ dirty: false });
  eq('nothing unsaved: no question, the panel closes, the plan opens', [clean.result, clean.calls], [true, ['close panel', 'open']]);
  eq('… all inside the tap (no await before open)', clean.sync, ['close panel', 'open']);
  const stay = await run({ dirty: true, answer: false });
  eq('unsaved, Cancel: asked, the panel stays, nothing opens', [stay.result, stay.calls], [false, ['ask']]);
  const gone = await run({ dirty: true, answer: true });
  eq('unsaved, Discard and open: asked first, then the panel closes and the plan opens', [gone.result, gone.calls], [true, ['ask', 'close panel', 'open']]);
  const plain = [];
  eq('no beforeOpen (the start screen\'s own list): asked, then opened',
    await openAfterAsking({ dirty: true, confirmDiscard: async () => { plain.push('ask'); return true; }, open: async () => { plain.push('open'); } })
      && plain, ['ask', 'open']);
}

// ── which plans: the project-number rule ────────────────────────────────
// What a kept copy's line in the app's own index looks like (keepFile writes
// it), and one of the old portal's saved copies (its published index).
const kept = (id, o) => ({ id, file: `k${id}-made.takeoff`, name: 'Main set.takeoff', size: 1000, lastModified: 5, code: '',
  project: '', path: '', from: 'Plans Archive', keptAt: 42, ...o });
const KEPT = [
  kept('a1', { code: 'A024', name: 'Main set.takeoff' }),
  kept('a2', { code: 'a024-b', name: 'Follow-up.takeoff' }),
  kept('a3', { project: 'A0245 - Made-up Rd', name: 'Other job.takeoff' }),
  kept('a4', { name: 'A024 Roof.takeoff', from: 'a file on this device' }),
  kept('a5', { code: 'A024–B', name: 'Dash typed.takeoff' }),
  kept('a6', { code: 'A274', project: 'A274 - Made-up St', name: 'Plans.takeoff' }),
  kept('a7', { name: 'Untitled.takeoff' }),
  kept('a8', { project: 'A024-B - Made-up Rd', name: 'Backup.takeoff' }),
];
const portal = (id, o) => ({ id, owner: '9', file: `p9-${id}-abc.takeoff`, name: 'Main.takeoff', size: 10, status: 'ready',
  projectCode: '', projectTitle: 'Made-up job', lastModified: 5, ...o });
const PORTAL = [
  portal('1', { projectCode: 'A024' }),
  portal('2', { projectCode: 'A024-B' }),
  portal('3', { projectCode: ' a274 ' }),
  portal('4', { name: 'A274 - old.takeoff' }),
  portal('5', { projectCode: 'A02' }),
  portal('6', { projectCode: 'A0240' }),
];
eq('keptCode: the code kept with it, normalised', KEPT.map(keptCode),
  ['A024', 'A024-B', 'A0245', 'A024', 'A024-B', 'A274', '', 'A024-B']);
eq('portalCode: the portal\'s project number, normalised', PORTAL.map(portalCode),
  ['A024', 'A024-B', 'A274', 'A274', '', 'A0240']);
eq('keptCode / portalCode of nothing', [keptCode(null), keptCode('A024'), portalCode(undefined)], ['', '', '']);

const ids = r => [r.kept.map(e => e.id), r.portal.map(e => e.id)];
const both = { kept: KEPT, portal: PORTAL };
eq('A024 is A024 only — never A024-B, A0245 or A0240', ids(plansForProject('A024', both)), [['a1', 'a4'], ['1']]);
eq('… whatever its case', ids(plansForProject(' a024 ', both)), [['a1', 'a4'], ['1']]);
eq('A024-B is its own job (en dash and all)', ids(plansForProject('A024-B', both)), [['a2', 'a5', 'a8'], ['2']]);
eq('A0245 is its own job', ids(plansForProject('A0245', both)), [['a3'], []]);
eq('A274: the kept copy and both portal copies', ids(plansForProject('A274', both)), [['a6'], ['3', '4']]);
eq('a job with nothing kept: nothing', ids(plansForProject('A999', both)), [[], []]);
eq('no number (a bare #plans): every plan on the device, in order', ids(plansForProject('', both)),
  [KEPT.map(e => e.id), PORTAL.map(e => e.id)]);
eq('… null too', ids(plansForProject(null, both)), [KEPT.map(e => e.id), PORTAL.map(e => e.id)]);
eq('a number that is not one lists nothing', [ids(plansForProject('Smith', both)), ids(plansForProject('../A024', both))],
  [[[], []], [[], []]]);
eq('lists that are not lists are empty', ids(plansForProject('A024', { kept: 'x', portal: null })), [[], []]);
ok('the lists given are not changed', plansForProject('', both).kept !== KEPT && KEPT.length === 8);

// The same, read back from the app's own storage the way the start screen
// reads it: keptCopies (File › Keep on This Device's index) and the portal's
// copies for this device's person (libraryOwner → portalCopies).
const b64url = obj => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const store = (() => {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } };
})();
store.setItem(KEPT_INDEX_KEY, JSON.stringify({ v: 1, entries: KEPT }));
store.setItem(PORTAL_INDEX_KEY, JSON.stringify({ v: 1, entries: [...PORTAL, portal('7', { owner: '7', projectCode: 'A024' })] }));
store.setItem(PORTAL_TOKEN_KEY, `${b64url({ alg: 'HS256' })}.${b64url({ sub: '9' })}.made-up-signature`);
const onDevice = { kept: keptCopies(store), portal: portalCopies(store, libraryOwner(store).owner) };
// (in the start screen's order: keptCopies sorts by the code kept with each)
eq('from storage: A024 only, and only this person\'s portal copies', ids(plansForProject('A024', onDevice)), [['a4', 'a1'], ['1']]);
eq('from storage: A024-B', ids(plansForProject('A024-B', onDevice)), [['a8', 'a2', 'a5'], ['2']]);

// ── the link again ───────────────────────────────────────────────────────
const SITE = 'https://example.test/takeoff-web/index.html';
eq('a job\'s link on this page\'s own address', plansLinkHref(SITE, 'A274'), `${SITE}#plans=A274`);
eq('the number as the app writes it', plansLinkHref(SITE, ' a024-b '), `${SITE}#plans=A024-B`);
eq('no number: the whole archive', [plansLinkHref(SITE, ''), plansLinkHref(SITE)], [`${SITE}#plans`, `${SITE}#plans`]);
eq('a number that is not one: the whole archive, never the text', plansLinkHref(SITE, 'Smith/../x'), `${SITE}#plans`);
eq('the query and an old hash are dropped (origin and path only)',
  plansLinkHref('https://example.test/takeoff-web/index.html?nofsapi#open=abc', 'A274'), `${SITE}#plans=A274`);
eq('a folder address gets the page name', plansLinkHref('https://example.test/takeoff-web/', 'A274'), `${SITE}#plans=A274`);
eq('a local dev server hands out its own address', plansLinkHref('http://localhost:8765/index.html', 'A274'),
  'http://localhost:8765/index.html#plans=A274');
eq('… at its root too', plansLinkHref('http://127.0.0.1:8765/', 'A024'), 'http://127.0.0.1:8765/index.html#plans=A024');
eq('an address that is not one: no link', [plansLinkHref('', 'A274'), plansLinkHref('not a url', 'A274'), plansLinkHref(null, 'A274')], ['', '', '']);
for (const code of ['A274', 'A024', 'A024-B', 'A000T1', 'A1000', 'A249-AB']) {
  eq(`the link reads back to ${code} (parsePlansLink)`, parsePlansLink(new URL(plansLinkHref(SITE, code)).hash), { code });
}
eq('the whole-archive link reads back as the whole archive', parsePlansLink(new URL(plansLinkHref(SITE, '')).hash), { code: '' });

// ── the clipboard ────────────────────────────────────────────────────────
const wrote = [];
eq('copied', await copyText({ clipboard: { writeText: async t => { wrote.push(t); } } }, `${SITE}#plans=A274`), true);
eq('… the whole link', wrote, [`${SITE}#plans=A274`]);
eq('the browser says no (a rejected promise): false, no throw',
  await copyText({ clipboard: { writeText: async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); } } }, 'x'), false);
eq('a writeText that throws at once: false', await copyText({ clipboard: { writeText() { throw new Error('made up'); } } }, 'x'), false);
eq('no clipboard at all: false', [await copyText({}, 'x'), await copyText(null, 'x'), await copyText({ clipboard: {} }, 'x')], [false, false, false]);
eq('a getter that throws: false',
  await copyText({ get clipboard() { throw new Error('made up'); } }, 'x'), false);

// ── the panel, as data ───────────────────────────────────────────────────
eq('the invalid-number wording is the one the app has always said', INVALID_LINK,
  'That link did not name a project number — showing the whole Plans Archive.');

const desk = linkPanelModel({ code: 'a274', handheld: false, ...both, pageHref: SITE });
eq('a computer: named, its plans, the link to copy', [desk.code, desk.title, desk.count, desk.kept.map(e => e.id), desk.portal.map(e => e.id), desk.href],
  ['A274', 'Plans for A274', 3, ['a6'], ['3', '4'], `${SITE}#plans=A274`]);
ok('… says this browser cannot open the folder, and to use Edge or Chrome',
  /cannot open the Plans Archive folder/.test(desk.browserNote) && /Edge or Chrome/.test(desk.browserNote) && desk.browserNote.includes('A274'));
eq('… the computer\'s hint, no invalid note', [desk.openHint, desk.invalidNote], [COMPUTER_HINT, '']);

const phone = linkPanelModel({ code: 'A274', handheld: true, ...both, pageHref: SITE });
eq('a phone: the same plans, no Copy link, no "use Edge"', [phone.title, phone.count, phone.href, phone.browserNote], ['Plans for A274', 3, '', '']);
eq('… and where to pick the plan', phone.openHint, HANDHELD_HINT);
ok('… the OneDrive app, then Keep on This Device', /OneDrive app/.test(HANDHELD_HINT) && /File › Keep on This Device/.test(HANDHELD_HINT));

const bare = linkPanelModel({ code: '', handheld: false, ...both, pageHref: SITE });
eq('a bare #plans: the Plans Archive, every plan on the device, its own link',
  [bare.title, bare.count, bare.href, bare.invalidNote], ['Plans Archive', KEPT.length + PORTAL.length, `${SITE}#plans`, '']);

const bad = linkPanelModel({ code: '', invalid: true, handheld: true, ...both, pageHref: SITE });
eq('an invalid number: said, then the whole archive', [bad.invalidNote, bad.title, bad.count], [INVALID_LINK, 'Plans Archive', KEPT.length + PORTAL.length]);

const none = linkPanelModel({ code: 'A999', handheld: true, ...both });
eq('nothing kept for the job: said plainly', [none.count, none.emptyText], [0, 'No plans for A999 are kept on this device.']);
eq('nothing kept at all', linkPanelModel({ code: '' }).emptyText, 'No plans are kept on this device.');
eq('a computer whose address cannot be read: the note, no link', [linkPanelModel({ code: 'A274' }).href, !!linkPanelModel({ code: 'A274' }).browserNote], ['', true]);
eq('no arguments at all', linkPanelModel().title, 'Plans Archive');

console.log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass — a plans link lists that job's plans on this device, and hands out the link`);
process.exit(fails ? 1 : 0);
