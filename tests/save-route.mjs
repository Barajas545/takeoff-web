// Where Save sends a project on a browser with no file handles, and what the
// app may say about it afterwards: js/core/save-route.js.
//
// On an iPad every save is a new file — the share sheet, or a download — and
// until now every ending was called "Saved": the project marked saved and
// its unsaved-work draft thrown away, the ending where nothing happened at all
// included. These drive every ending with made-up browsers: an iPad in
// Safari, one opened from the home-screen icon, Firefox and Chrome on a
// computer, Safari on a Mac. The rule under test is the one the module is
// for: ONLY a confirmed save marks the project saved and drops the draft.
//
// Then a few pins on js/main.js itself (browser-only, so read as text, not
// run): the draft is written before the heavy part of a save, the outcome
// decides, and the file picker no longer turns a slow file into a cancel.
//
// Run: node tests/save-route.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SHARE_CAP_BYTES, SHEET_MIN_MS, downloadUrlKeepMs, saveRoute, shareErrorKind, deliverFile, afterSave,
  saveFileName, isStandalone, lateArrival, STILL_COMING,
} from '../js/core/save-route.js';

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

const MB = 1024 * 1024;
const err = (name, message = '') => Object.assign(new Error(message), { name });
// WebKit's own words (Source/WebCore/page/Navigator.cpp, ShareDataReader.cpp).
const WEBKIT_CANCEL = err('AbortError', 'Abort due to cancellation of share.');
const WEBKIT_READ = err('AbortError', 'Abort due to error while reading files.');
const NO_TAP = err('NotAllowedError', 'The request is not allowed by the user agent or the platform in the current context.');

// ── the cap ──────────────────────────────────────────────────────────────
eq('the share cap is 150 MB', SHARE_CAP_BYTES, 150 * MB);
ok('a person cannot have closed the sheet in under half a second', SHEET_MIN_MS >= 500 && SHEET_MIN_MS <= 1500);

// ── which way the file leaves ────────────────────────────────────────────
const pick = o => { const r = saveRoute(o); return [r.how, r.why, r.confirms]; };
const IPAD = { canShare: true, touch: true };
eq('iPad, a small plan, the tap still live: the share sheet', pick({ ...IPAD, size: 20 * MB, activation: true }), ['share', 'ok', false]);
eq('iPad, the browser cannot say about the tap: ask share() itself', pick({ ...IPAD, size: 20 * MB, activation: null }), ['share', 'ok', false]);
eq('iPad, the save outlasted the tap: "Your file is ready"', pick({ ...IPAD, size: 20 * MB, activation: false }), ['ask', 'no-activation', false]);
eq('iPad, exactly the cap: still shared', pick({ ...IPAD, size: SHARE_CAP_BYTES, activation: true }), ['share', 'ok', false]);
eq('iPad, one byte over: downloaded, and the download is unconfirmed', pick({ ...IPAD, size: SHARE_CAP_BYTES + 1, activation: true }), ['download', 'too-big', false]);
eq('iPad, the 2.3 GB job, even with no tap left: a download, never the sheet', pick({ ...IPAD, size: 2300 * MB, activation: false }), ['download', 'too-big', false]);
eq('a size that is not a number is not shared', pick({ ...IPAD, size: NaN, activation: true }), ['download', 'too-big', false]);
eq('Firefox on a computer: no share — the download, which is the save there', pick({ canShare: false, touch: false, size: 20 * MB }), ['download', 'no-share', true]);
eq('Chrome with ?nofsapi: canShare says no to a .takeoff — the download, the save', pick({ canShare: false, touch: false, size: 900 * MB }), ['download', 'no-share', true]);
eq('Safari on a Mac, small: the share sheet, as before', pick({ canShare: true, touch: false, size: 5 * MB, activation: true }), ['share', 'ok', true]);
eq('Safari on a Mac, big: the download — a finished save on a computer', pick({ canShare: true, touch: false, size: 400 * MB }), ['download', 'too-big', true]);
eq('Android Chrome (no file share for .takeoff): an unconfirmed download', pick({ canShare: false, touch: true, size: 5 * MB }), ['download', 'no-share', false]);
eq('a home-screen app takes the same routes, and says it is one',
  [saveRoute({ ...IPAD, size: 5 * MB, activation: true, standalone: true }).how, saveRoute({ ...IPAD, size: 5 * MB, standalone: true }).standalone],
  ['share', true]);
eq('no arguments: a download (nothing to share with)', saveRoute().how, 'download');

// ── what a share() refusal means ─────────────────────────────────────────
eq('NotAllowedError: the tap had run out', shareErrorKind(NO_TAP), 'no-activation');
eq('WebKit, the person closed the sheet', shareErrorKind(WEBKIT_CANCEL, { elapsedMs: 3000 }), 'cancelled');
eq('WebKit, it could not read the file — NOT a cancel, whenever it came', [shareErrorKind(WEBKIT_READ, { elapsedMs: 50 }), shareErrorKind(WEBKIT_READ, { elapsedMs: 9000 })], ['failed', 'failed']);
eq('Chrome\'s words for a cancel', shareErrorKind(err('AbortError', 'Share canceled'), { elapsedMs: 2000 }), 'cancelled');
eq('an AbortError with no words, late enough for the sheet to have shown: a person', shareErrorKind(err('AbortError'), { elapsedMs: SHEET_MIN_MS + 1 }), 'cancelled');
eq('… too soon for any sheet: the browser failed', shareErrorKind(err('AbortError'), { elapsedMs: 40 }), 'failed');
eq('anything else fails over to the download', [shareErrorKind(err('TypeError', 'x')), shareErrorKind(err('DataError')), shareErrorKind(err('InvalidStateError')), shareErrorKind(null)], ['failed', 'failed', 'failed', 'failed']);

// ── deliverFile, with made-up browsers ───────────────────────────────────
/**
 * A browser for deliverFile. `shares` is what each share() call does, in
 * order ('ok' resolves; an Error rejects); `asks` what each "Your file is
 * ready" answer is (null, 'download', or 'save', which calls share() as the
 * dialog's own tap does). `clock` moves on by `took` ms per share.
 */
function browser({ canShare = true, activation = true, touch = true, standalone = false, shares = [], asks = [], took = 2000 } = {}) {
  const log = [];
  let clock = 1000;
  const share = () => {
    const what = shares.shift();
    log.push('share');
    clock += took;
    return what === 'ok' || what === undefined ? Promise.resolve() : Promise.reject(what);
  };
  return {
    log,
    env: {
      canShare: () => canShare,
      activation: () => activation,
      touch, standalone,
      now: () => clock,
      share,
      ask: async () => {
        log.push('ask');
        const a = asks.shift();
        if (a === 'save') { const at = clock; return { share: share(), at }; }
        return a ?? null;
      },
      download: () => { log.push('download'); },
    },
  };
}
async function run(size, o) {
  const b = browser(o);
  const r = await deliverFile({ size }, b.env);
  return [r.outcome, r.why, b.log];
}

eq('iPad: shared — and nothing else was tried', await run(20 * MB, { shares: ['ok'] }), ['shared', 'ok', ['share']]);
eq('iPad: the person closed the sheet — cancelled, NO download behind their back', await run(20 * MB, { shares: [WEBKIT_CANCEL] }), ['cancelled', 'sheet', ['share']]);
eq('iPad: the sheet could not read the file — downloaded instead, unconfirmed', await run(20 * MB, { shares: [WEBKIT_READ] }), ['download-started', 'share-failed', ['share', 'download']]);
eq('iPad: the tap ran out during the save — "Your file is ready", its Save shares', await run(20 * MB, { shares: [NO_TAP, 'ok'], asks: ['save'] }), ['shared', 'ok', ['share', 'ask', 'share']]);
eq('iPad: the browser SAYS the tap is gone — the dialog first, no doomed share()', await run(20 * MB, { activation: false, asks: ['save'] }), ['shared', 'ok', ['ask', 'share']]);
eq('… Cancel in the dialog: cancelled, nothing downloaded', await run(20 * MB, { activation: false, asks: [null] }), ['cancelled', 'dialog', ['ask']]);
eq('… Download instead: an unconfirmed download', await run(20 * MB, { activation: false, asks: ['download'] }), ['download-started', 'chosen', ['ask', 'download']]);
eq('… the sheet closed from the dialog\'s Save: cancelled', await run(20 * MB, { activation: false, asks: ['save'], shares: [WEBKIT_CANCEL] }), ['cancelled', 'sheet', ['ask', 'share']]);
eq('… a fresh tap refused all the same: the download, not nothing', await run(20 * MB, { activation: false, asks: ['save'], shares: [NO_TAP] }), ['download-started', 'no-activation', ['ask', 'share', 'download']]);
eq('… the sheet failed to read it from the dialog: the download', await run(20 * MB, { activation: false, asks: ['save'], shares: [WEBKIT_READ] }), ['download-started', 'share-failed', ['ask', 'share', 'download']]);
eq('iPad: the 2.3 GB job goes straight to the download, never into the sheet', await run(2300 * MB, { shares: ['ok'] }), ['download-started', 'too-big', ['download']]);
eq('Firefox on a computer: the download, and that is the save', await run(20 * MB, { canShare: false, touch: false }), ['downloaded', 'no-share', ['download']]);
eq('Safari on a Mac, the sheet failed: the download is the save there', await run(20 * MB, { touch: false, shares: [WEBKIT_READ] }), ['downloaded', 'share-failed', ['share', 'download']]);
eq('a cancel that came too fast to be a person: the download, unconfirmed', await run(20 * MB, { shares: [err('AbortError')], took: 30 }), ['download-started', 'share-failed', ['share', 'download']]);

// ── afterSave: saved, draft, and the words ───────────────────────────────
const CONFIRMED = ['written', 'downloaded', 'shared'];
const ALL = [...CONFIRMED, 'download-started', 'cancelled', 'something new', '', undefined];
for (const o of ALL) {
  const r = afterSave(o, { name: 'A249 Main.takeoff' });
  eq(`${String(o)}: saved and draft dropped only when confirmed`, [r.markSaved, r.dropDraft], [CONFIRMED.includes(o), CONFIRMED.includes(o)]);
  ok(`${String(o)}: something is always said`, typeof r.status === 'string' && r.status.length > 10);
}
eq('written / downloaded: "Saved <name>", the words a computer always had',
  [afterSave('written', { name: 'X.takeoff' }).status, afterSave('downloaded', { name: 'X.takeoff' }).status], ['Saved X.takeoff', 'Saved X.takeoff']);
ok('shared: says it went where they chose', /^Saved X\.takeoff — .*share sheet/.test(afterSave('shared', { name: 'X.takeoff' }).status));
{
  const s = afterSave('download-started', { name: 'A104 Full set.takeoff', why: 'too-big' }).status;
  ok('a started download: why (over 150 MB)', s.includes('A104 Full set.takeoff') && /over 150 MB/.test(s));
  ok('… where to look', /Files › Downloads/.test(s));
  ok('… that it is NOT marked saved, and the work is kept', /cannot be confirmed/.test(s) && /unsaved changes/.test(s) && /kept on this device/.test(s));
  ok('… and what to do if nothing came', /Save again/.test(s));
  eq('… said in a dialog too (the status line clears itself); nothing else is',
    ALL.map(o => afterSave(o).tell), ALL.map(o => o === 'download-started'));
  ok('… a browser tab is not told about home-screen apps', !/home-screen/.test(s));
  ok('… a home-screen app is told it may not download', /home-screen icon may not download/.test(afterSave('download-started', { name: 'x', standalone: true }).status));
  ok('… the sheet failing is said as that', /share sheet could not take/.test(afterSave('download-started', { name: 'x', why: 'share-failed' }).status));
}
ok('cancelled: said plainly, and the work is still there', /^Save cancelled — nothing was saved/.test(afterSave('cancelled').status) && /still here/.test(afterSave('cancelled').status));

// ── the file's name ──────────────────────────────────────────────────────
eq('an opened plan keeps its own name (Save to Files can replace it)',
  saveFileName({ openedName: 'A249 - Vista Buena - FULL SET.takeoff', projectName: 'Vista Buena' }), 'A249 - Vista Buena - FULL SET.takeoff');
eq('an old .pdfcache comes back as .takeoff', saveFileName({ openedName: 'Old job.pdfcache', projectName: 'Old' }), 'Old job.takeoff');
eq('a .TAKEOFF in capitals is still the extension', saveFileName({ openedName: 'Loud.TAKEOFF' }), 'Loud.takeoff');
eq('only the name, never a path', saveFileName({ openedName: 'C:\\Users\\x\\A100 Roof.takeoff' }), 'A100 Roof.takeoff');
eq('characters no file system takes are replaced', saveFileName({ openedName: 'A1: "new" <set>?.takeoff' }), 'A1_ _new_ _set_.takeoff');
eq('a new project (no file yet) is named after the project, as before', saveFileName({ openedName: '', projectName: '  Vista Buena  ' }), 'Vista Buena.takeoff');
eq('… a bad project name is cleaned', saveFileName({ projectName: 'A/B' }), 'A_B.takeoff');
eq('… nothing at all: Takeoff', saveFileName({}), 'Takeoff.takeoff');
eq('a name that is only the extension falls back to the project', saveFileName({ openedName: '.takeoff', projectName: 'P' }), 'P.takeoff');

// ── home-screen app, and the download address ────────────────────────────
const mm = matches => q => ({ matches: q === '(display-mode: standalone)' && matches });
eq('iOS\'s own flag', isStandalone({ navigator: { standalone: true } }), true);
eq('the display mode', isStandalone({ navigator: {}, matchMedia: mm(true) }), true);
eq('a browser tab', isStandalone({ navigator: { standalone: false }, matchMedia: mm(false) }), false);
eq('a matchMedia that throws: not one', isStandalone({ navigator: {}, matchMedia: () => { throw new Error('x'); } }), false);
eq('nothing to ask: not one', isStandalone(null), false);
eq('a computer lets the download address go after 10 s, as before', downloadUrlKeepMs({ touch: false }), 10000);
ok('a phone keeps it for minutes (Safari may ask "Download?" first)', downloadUrlKeepMs({ touch: true }) >= 60000);

// ── a picked file that arrives late ──────────────────────────────────────
eq('it came at once, nothing open: open', lateArrival({ epochAtPick: 3, epochNow: 3 }), 'open');
eq('something else was opened meanwhile: ignored, whatever else', [
  lateArrival({ epochAtPick: 3, epochNow: 4 }),
  lateArrival({ epochAtPick: 3, epochNow: 4, dirtyNow: true, slow: true }),
], ['ignore', 'ignore']);
eq('work started on the open project while it came: ask first', lateArrival({ epochAtPick: 3, epochNow: 3, dirtyAtPick: false, dirtyNow: true }), 'ask');
eq('already said "discard" and it came at once: open', lateArrival({ epochAtPick: 3, epochNow: 3, dirtyAtPick: true, dirtyNow: true }), 'open');
eq('… but after a long wait (more work may be in it): ask again', lateArrival({ epochAtPick: 3, epochNow: 3, dirtyAtPick: true, dirtyNow: true, slow: true }), 'ask');
eq('a long wait with nothing unsaved: open', lateArrival({ epochAtPick: 3, epochNow: 3, slow: true }), 'open');
ok('the waiting words say it opens when it arrives', /opens when it arrives/.test(STILL_COMING) && /OneDrive/.test(STILL_COMING));

// ── js/main.js, read as text ─────────────────────────────────────────────
const main = readFileSync(path.join(APP, 'js', 'main.js'), 'utf8');
const body = (name) => {
  const at = main.indexOf(`function ${name}(`);
  if (at < 0) return '';
  const next = main.slice(at + 10).search(/\n(?:async )?function /);
  return next < 0 ? main.slice(at) : main.slice(at, at + 10 + next);
};
const save = body('saveProject');
ok('saveProject is there to read', save.length > 1000);
ok('saveProject writes the draft BEFORE composing the file', save.indexOf('await saveDraftNow()') > 0
  && save.indexOf('await saveDraftNow()') < save.indexOf('await writeProject('));
ok('… and marks saved only when afterSave says so', (save.match(/app\.project\.markSaved\(\)/g) || []).length === 1
  && /if \(next\.markSaved\) \{\s*app\.project\.markSaved\(\)/.test(save));
ok('… and drops the draft only when afterSave says so', /if \(next\.dropDraft\) \{[^}]*dropDraft\(/.test(save)
  && (save.match(/dropDraft\(/g) || []).length === 2);
ok('… and shows an unconfirmed download in a dialog', /if \(next\.tell\) await D\.alertDialog\(/.test(save));
ok('the old unconditional "downloaded" is gone', !/return 'downloaded'/.test(main) && !/function downloadBlob\(/.test(main));
const ask = body('askFileReady');
ok('"Your file is ready" calls share() inside its Save tap, before the dialog closes',
  /D\.button\('Save', 'primary', \(\) => \{[\s\S]*?share\(\)[\s\S]*?close\(/.test(ask));
const picker = body('pickFileFallback');
ok('the picker settles on change and on cancel', /addEventListener\('change'/.test(picker) && /addEventListener\('cancel'/.test(picker));
{
  const deadline = picker.slice(picker.indexOf('Date.now() >= deadline'), picker.indexOf('setTimeout(tick, 250)'));
  ok('… and the focus deadline no longer settles it to nothing', deadline.length > 0 && !/done\(/.test(deadline) && /onSlow/.test(deadline));
}
ok('a newer pick settles an older one still waiting', /currentPick\.abandon\(\)/.test(picker));

console.log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass — only a confirmed save marks it saved and drops the draft; big files download, slow taps get a fresh one`);
process.exit(fails ? 1 : 0);
