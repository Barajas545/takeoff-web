// Where Save sends a project on a browser with no file handles, and what the
// app may say about it afterwards: js/core/save-route.js.
//
// On an iPad every save is a new file — the share sheet, or a download — and
// until now every ending was called "Saved": the project marked saved and
// its unsaved-work draft thrown away, the ending where nothing happened at all
// included. These drive every ending with made-up browsers: an iPad in
// Safari, one opened from the home-screen icon, Firefox and Chrome on a
// computer, Safari on a Mac. The rule under test is the one the module is
// for: ONLY a confirmed save marks the project saved, only for the project as
// it was composed, and the work is said to be "kept" only where a draft of it
// can really be offered back.
//
// Inside the portal a plan it said it would take a save of goes back to it
// (C2): saved only when the portal answers "kept"; refused, no room, failed,
// two minutes of silence or a closed portal page keep the draft and say so.
// Those are driven end to end here out of the same pure pieces main.js
// joins, with a made-up portal and clock.
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
  saveFileName, isStandalone, lateArrival, STILL_COMING, savedStill, nextDraftHomes, draftHomeFor,
  HANDHELD_SAVE, REPLACE_WARNING, savesToPortal, portalNewsWords, draftFate, DRAFT_DATE_SLACK_MS, planOfPortalCopy,
  afterLateKept, portalCopyKind, portalCopyDraftKey, COPY_ROOM_MIN, findDraft, draftKeptNow, portalRefusedWords, earlierDraftWords,
  EARLIER_DRAFT_ASK, draftTwins,
  REMOTE_SAVE_CAP_BYTES, remoteSaveBytes, remoteSaveRefused, remoteSaveWords, handheldSaveWords, remoteSaveRefusedWords,
} from '../js/core/save-route.js';
import { RemoteFile } from '../js/core/remote-file.js';
import { draftKey, draftKeyTail, draftWho, draftPlan } from '../js/core/drafts.js';
import { Project } from '../js/core/project.js';
import { HANDHELD_HINT } from '../js/core/plans-link.js';
import { askPortalToKeep, SAVE_WAIT_MS } from '../js/core/portal-handoff.js';
import { writeProject } from '../js/core/takeoff-file.js';

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
eq('Safari on a Mac, the tap ran out: the download it always was, never "Save to Files" (a Mac has none)',
  pick({ canShare: true, touch: false, size: 5 * MB, activation: false }), ['download', 'no-activation', true]);
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
 * order ('ok' resolves; an Error rejects); `asks` what each dialog answer is
 * (null, 'download', or 'save', which calls share() as the dialog's own tap
 * does). The log records 'ask:<kind>'. `clock` moves on by `took` ms per share.
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
      ask: async ({ kind } = {}) => {
        log.push(`ask:${kind}`);
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
eq('iPad: the tap ran out during the save — "Your file is ready", its Save shares', await run(20 * MB, { shares: [NO_TAP, 'ok'], asks: ['save'] }), ['shared', 'ok', ['share', 'ask:ready', 'share']]);
eq('iPad: the browser SAYS the tap is gone — the dialog first, no doomed share()', await run(20 * MB, { activation: false, asks: ['save'] }), ['shared', 'ok', ['ask:ready', 'share']]);
eq('… Cancel in the dialog: cancelled, nothing downloaded', await run(20 * MB, { activation: false, asks: [null] }), ['cancelled', 'dialog', ['ask:ready']]);
eq('… Download instead: an unconfirmed download', await run(20 * MB, { activation: false, asks: ['download'] }), ['download-started', 'chosen', ['ask:ready', 'download']]);
eq('… the sheet closed from the dialog\'s Save: cancelled', await run(20 * MB, { activation: false, asks: ['save'], shares: [WEBKIT_CANCEL] }), ['cancelled', 'sheet', ['ask:ready', 'share']]);
eq('… a fresh tap refused all the same: the download, not nothing', await run(20 * MB, { activation: false, asks: ['save'], shares: [NO_TAP] }), ['download-started', 'no-activation', ['ask:ready', 'share', 'download']]);
eq('… the sheet failed to read it from the dialog: the download', await run(20 * MB, { activation: false, asks: ['save'], shares: [WEBKIT_READ] }), ['download-started', 'share-failed', ['ask:ready', 'share', 'download']]);
eq('iPad: the 2.3 GB job goes straight to the download, never into the sheet', await run(2300 * MB, { shares: ['ok'] }), ['download-started', 'too-big', ['download']]);
eq('Firefox on a computer: the download, and that is the save', await run(20 * MB, { canShare: false, touch: false }), ['downloaded', 'no-share', ['download']]);
// Review fix: the sheet could not READ the file (OneDrive replaced it on disk after it was opened). The download
// reads the same bytes and fails the same way, silently — so on a Mac too it is only started, never "Saved".
eq('Safari on a Mac, the sheet could not read the file: the download is only started — the work is not let go',
  await run(20 * MB, { touch: false, shares: [WEBKIT_READ] }), ['download-started', 'share-failed', ['share', 'download']]);
eq('… nor after an AbortError too fast to be a person', await run(20 * MB, { touch: false, shares: [err('AbortError')], took: 30 }), ['download-started', 'share-failed', ['share', 'download']]);
eq('a cancel that came too fast to be a person: the download, unconfirmed', await run(20 * MB, { shares: [err('AbortError')], took: 30 }), ['download-started', 'share-failed', ['share', 'download']]);
// Review fix: a Mac whose tap ran out downloads, as before P1 — no iPad "Save to Files" dialog.
eq('Safari on a Mac, the browser says the tap is gone: the download, the save — no dialog',
  await run(5 * MB, { touch: false, activation: false, asks: ['save'] }), ['downloaded', 'no-activation', ['download']]);
eq('Safari on a Mac, share() refused for want of a tap: the download, the save — no dialog',
  await run(5 * MB, { touch: false, activation: null, shares: [NO_TAP], asks: ['save'] }), ['downloaded', 'no-activation', ['share', 'download']]);
// Review fix: a home-screen app over the cap. Its download may do nothing, and Save again would only repeat
// it — so the share sheet is offered beside it, as the person's own choice.
eq('home-screen app, over the cap: the download, then the share sheet offered beside it — and taken',
  await run(300 * MB, { standalone: true, asks: ['save'], shares: ['ok'] }), ['shared', 'ok', ['download', 'ask:big', 'share']]);
eq('… OK instead: the download, unconfirmed', await run(300 * MB, { standalone: true, asks: [null] }), ['download-started', 'too-big', ['download', 'ask:big']]);
eq('… the sheet closed or failed: still the download, unconfirmed', [
  (await run(300 * MB, { standalone: true, asks: ['save'], shares: [WEBKIT_CANCEL] }))[0],
  (await run(300 * MB, { standalone: true, asks: ['save'], shares: [WEBKIT_READ] }))[0],
], ['download-started', 'download-started']);
{
  const b = browser({ standalone: true, asks: [null] });
  eq('… and says its dialog has already told the person', (await deliverFile({ size: 300 * MB }, b.env)).asked, true);
}
eq('Safari (a tab, not the home-screen app) over the cap: the download alone, nothing offered',
  await run(300 * MB, { standalone: false, asks: ['save'] }), ['download-started', 'too-big', ['download']]);
eq('a home-screen app on Android (no file share): the download alone',
  await run(300 * MB, { standalone: true, canShare: false, asks: ['save'] }), ['download-started', 'no-share', ['download']]);

// ── afterSave: saved, draft, and the words ───────────────────────────────
const SAVED = ['written', 'downloaded', 'shared'];
const DROPS = ['written', 'shared'];
const ALL = [...SAVED, 'download-started', 'cancelled', 'something new', '', undefined];
for (const o of ALL) {
  const r = afterSave(o, { name: 'A249 Main.takeoff' });
  eq(`${String(o)}: saved only when confirmed; draft dropped only for a write or a share`,
    [r.markSaved, r.dropDraft, r.confirmed], [SAVED.includes(o), DROPS.includes(o), SAVED.includes(o)]);
  ok(`${String(o)}: something is always said`, typeof r.status === 'string' && r.status.length > 10);
}
eq('written / downloaded: "Saved <name>", the words a computer always had',
  [afterSave('written', { name: 'X.takeoff' }).status, afterSave('downloaded', { name: 'X.takeoff' }).status], ['Saved X.takeoff', 'Saved X.takeoff']);
// Review fix: a computer's download is the save there, but the browser may have asked where to put it and
// been told no — so the draft stays behind it (offerDraftRestore drops it once a newer file is opened).
eq('a computer\'s download: saved, but the draft stays', [afterSave('downloaded').markSaved, afterSave('downloaded').dropDraft], [true, false]);
ok('shared: says it went where they chose', /^Saved X\.takeoff — .*share sheet/.test(afterSave('shared', { name: 'X.takeoff' }).status));
{
  const s = afterSave('download-started', { name: 'A104 Full set.takeoff', why: 'too-big', keptIn: 'A104 Full set.takeoff' }).status;
  ok('a started download: why (over 150 MB)', s.includes('A104 Full set.takeoff') && /over 150 MB/.test(s));
  ok('… where to look', /Files › Downloads/.test(s));
  ok('… that it is NOT marked saved, and where the work is kept', /cannot be confirmed/.test(s) && /unsaved changes/.test(s)
    && /kept on this device: opening A104 Full set\.takeoff again offers it back/.test(s));
  ok('… and what to do if nothing came', /Save again/.test(s));
  eq('… said in a dialog too (the status line clears itself); nothing else is',
    ALL.map(o => afterSave(o).tell), ALL.map(o => o === 'download-started'));
  ok('… a browser tab is not told about home-screen apps', !/home-screen/.test(s));
  ok('… a home-screen app is told it may not download', /home-screen icon may not download/.test(afterSave('download-started', { name: 'x', standalone: true }).status));
  ok('… the sheet failing is said as that', /share sheet could not take/.test(afterSave('download-started', { name: 'x', why: 'share-failed' }).status));
}
// Review fix: the work is said to be "kept" only when a draft of it can be offered back.
{
  const pdf = afterSave('download-started', { name: 'Vista Buena.takeoff', why: 'too-big', keptIn: '' }).status;
  ok('a takeoff with no file to offer its draft back from is NOT told its work is kept on this device',
    !/kept on this device/.test(pdf) && !/stays kept/.test(pdf));
  ok('… it is told the page is the only place it is, and to keep it open until the file is in Downloads',
    /cannot be brought back from this device/.test(pdf) && /keep this page open until the file is in Files › Downloads/.test(pdf));
  ok('… the default is that honest one (a caller that forgets claims nothing)', !/kept on this device/.test(afterSave('download-started', { name: 'x' }).status));
  ok('… nor in the catch-all words', !/kept on this device/.test(afterSave('something new').status)
    && /kept on this device/.test(afterSave('something new', { keptIn: 'P.takeoff' }).status));
  const clean = afterSave('download-started', { name: 'x', dirty: false }).status;
  ok('… with nothing unsaved, that nothing is lost — and not that it still shows unsaved changes', /nothing is lost/.test(clean) && !/still shows unsaved changes/.test(clean));
  const mac = afterSave('download-started', { name: 'x', why: 'share-failed', touch: false, keptIn: 'x' }).status;
  ok('… a computer is sent to its Downloads folder, not to the Files app', /your Downloads folder/.test(mac) && !/Files ›/.test(mac));
  const big = afterSave('download-started', { name: 'x', why: 'too-big', standalone: true, offerShare: true, keptIn: 'x' }).status;
  ok('… a home-screen app over the cap is offered the share sheet, warned it may close the app',
    /try the share sheet/.test(big) && /Save again offers it/.test(big) && /may close/.test(big));
}
ok('cancelled: said plainly, and the work is still there', /^Save cancelled — nothing was saved/.test(afterSave('cancelled').status) && /still here/.test(afterSave('cancelled').status));

// ── only the project as it was composed is marked saved ──────────────────
eq('nothing done since the file was composed: the same', savedStill({ epochAtSave: 2, epochNow: 2, changesAtCompose: 9, changesNow: 9 }), 'same');
eq('a count put down while the share sheet read the file: edited', savedStill({ epochAtSave: 2, epochNow: 2, changesAtCompose: 9, changesNow: 10 }), 'edited');
eq('another project opened meanwhile: replaced, whatever the count', [
  savedStill({ epochAtSave: 2, epochNow: 3, changesAtCompose: 9, changesNow: 9 }),
  savedStill({ epochAtSave: 2, epochNow: 3, changesAtCompose: 9, changesNow: 1 }),
], ['replaced', 'replaced']);
eq('a count not known: edited (never a guess that marks it saved)', savedStill({ epochAtSave: 1, epochNow: 1 }), 'edited');
for (const o of SAVED) {
  const e = afterSave(o, { name: 'P.takeoff', moved: 'edited' });
  eq(`${o}, edited meanwhile: NOT marked saved, the draft kept, the file still recorded`, [e.markSaved, e.dropDraft, e.confirmed], [false, false, true]);
  ok(`… and told the new work is not in it`, /not in it/.test(e.status) && /Save again/.test(e.status));
  const r = afterSave(o, { name: 'P1.takeoff', moved: 'replaced' });
  eq(`${o}, another project open now: not marked saved; the saved one's draft may go unless it was a computer's download`,
    [r.markSaved, r.dropDraft], [false, o !== 'downloaded']);
  ok('… and told the open one is not changed', /open now is not changed/.test(r.status));
}
eq('an unconfirmed ending is the same whether or not anything moved',
  [afterSave('download-started', { moved: 'edited' }).markSaved, afterSave('cancelled', { moved: 'replaced' }).markSaved], [false, false]);

{
  // The count itself: js/core/project.js.
  const p = new Project();
  const c0 = p.changeCount;
  p.markDirty();
  const c1 = p.changeCount;
  p.markDirty();
  p.transact('a count', () => {});
  const c3 = p.changeCount;
  ok('Project.changeCount moves on with EVERY edit, not only the first (the dirty flag does not)', c1 > c0 && c3 > c1 && p.dirty);
  p.markSaved();
  eq('… marking it saved does not move it back', p.changeCount, c3);
  p.loadFrom({ metadata: {}, annotations: {}, measurements: {}, pageCount: 1 });
  ok('… and another project loaded moves it on', p.changeCount > c3 && !p.dirty);
}

// ── where a draft can come back from ─────────────────────────────────────
const P0 = { name: 'P.takeoff', size: 1000, pages: 12 };
eq('opened: the file it came from', nextDraftHomes([], P0), [P0]);
// Review fix: after Save to Files › Replace on an iPad the plan IS the saved file, at a new size.
eq('shared or downloaded: the file it came from AND the one just saved (Replace may have made it the plan)',
  nextDraftHomes([P0], { name: 'P.takeoff', size: 1400, pages: 12 }), [P0, { name: 'P.takeoff', size: 1400, pages: 12 }]);
eq('… only the newest save beside the first, never a growing list',
  nextDraftHomes([P0, { name: 'P.takeoff', size: 1400, pages: 12 }], { name: 'P.takeoff', size: 1500, pages: 12 }),
  [P0, { name: 'P.takeoff', size: 1500, pages: 12 }]);
eq('written through a handle: the project IS the file now, and only that', nextDraftHomes([P0], { name: 'P.takeoff', size: 1400, pages: 13 }, { replaces: true }),
  [{ name: 'P.takeoff', size: 1400, pages: 13 }]);
eq('the same file twice is one home', nextDraftHomes([P0], { ...P0 }), [P0]);
eq('a takeoff started from a PDF: its first saved file is its first home', nextDraftHomes([], { name: 'Vista.takeoff', size: 5, pages: 3 }), [{ name: 'Vista.takeoff', size: 5, pages: 3 }]);
eq('nothing to record: unchanged', [nextDraftHomes([P0], null), nextDraftHomes([P0], { name: '', size: 3 }), nextDraftHomes([P0], { name: 'x', size: 0 })], [[P0], [P0], [P0]]);
eq('restorable from the file it was opened from, sheets as they were', draftHomeFor([P0], 12), 'P.takeoff');
eq('… not once sheets were added (import-more): the draft would be refused', draftHomeFor([P0], 14), '');
eq('… not for a takeoff started from a PDF (no file at all)', draftHomeFor([], 12), '');
eq('… from the file last saved, when that is the one with these sheets', draftHomeFor([P0, { name: 'P2.takeoff', size: 9, pages: 14 }], 14), 'P2.takeoff');
// Review LW-5: a save handed to the portal whose "kept" came after the wait ran out and the frame was closed. The
// portal keeps exactly the bytes posted, and hands that file over when the plan is reopened: work done after the
// timeout must be found from it — so the file posted is a home from the moment it is posted (pending), not only once
// a "kept" is heard by a page that may be gone by then.
{
  const S1 = { name: 'P.takeoff', size: 1400, pages: 12 };
  const S2 = { name: 'P.takeoff', size: 1500, pages: 12 };
  const S3 = { name: 'P.takeoff', size: 1600, pages: 12 };
  const posted = nextDraftHomes([P0], S1, { pending: true });
  eq('posted to the portal: the file it came from, and the posted one as a pending home', posted, [P0, { ...S1, pending: true }]);
  // the wait runs out ("not saved"), the person carries on: the drafts go under every home (main.js draftKeysNow)
  const keys = posted.map(h => draftKey(h.name, h.size));
  ok('… so the work done after the timeout is drafted under the posted file too', keys.includes(draftKey(S1.name, S1.size)));
  ok('… and found when the portal, having kept it after the frame closed, hands that file back', keys.includes(draftKey('P.takeoff', 1400)));
  eq('… still found from the file it was opened from (the portal may yet have refused it)', keys[0], draftKey(P0.name, P0.size));
  eq('kept after all (in time, or late and heard): the posted file is a home like any saved one', nextDraftHomes(posted, S1), [P0, S1]);
  eq('the next save posted: the newest saved file stays a home (the portal holds it while this one may be refused)',
    nextDraftHomes([P0, S1], S2, { pending: true }), [P0, S1, { ...S2, pending: true }]);
  eq('… one pending home at a time, never a growing list (only the latest save handed over is heard)',
    nextDraftHomes([P0, S1, { ...S2, pending: true }], S3, { pending: true }), [P0, S1, { ...S3, pending: true }]);
  eq('… and a save confirmed after it leaves no pending one', nextDraftHomes([P0, S1, { ...S2, pending: true }], S3), [P0, S3]);
  eq('a posted file the same as a saved one stays a saved home', nextDraftHomes([P0, S1], { ...S1 }, { pending: true }), [P0, S1]);
  eq('the portal\'s "copy" news: the copy is the home, not the plan at the kept size (no file of that name holds it)',
    nextDraftHomes(posted, { name: 'P - iPad 2026-11-04 1415.takeoff', size: 1400, pages: 12 }),
    [P0, { name: 'P - iPad 2026-11-04 1415.takeoff', size: 1400, pages: 12 }]);
  eq('a pending home is never the one a confirmed save keeps as "the file it came from"',
    nextDraftHomes([{ ...S1, pending: true }], S2), [S2]);
  eq('… and the words still name a home with these sheets', draftHomeFor(posted, 12), 'P.takeoff');
}
// Review FRAME-1 (contract addendum 2 C2b): window.TakeoffApp.saveDraftNow() — the portal's Close awaits it (up to
// 3 s) before it removes the frame. true once the draft is kept or nothing needed keeping; false only when work could
// not be kept; never a rejection (the portal must be able to close the frame whatever happens here).
{
  const calls = [];
  const write = answer => () => { calls.push('write'); return typeof answer === 'function' ? answer() : Promise.resolve(answer); };
  eq('no unsaved changes: nothing needed keeping — true, and nothing written',
    [await draftKeptNow({ dirty: false, hasWork: true, write: write(true) }), calls.length], [true, 0]);
  eq('… nothing to keep (no sheet, no item): true, nothing written', [await draftKeptNow({ dirty: true, hasWork: false, write: write(true) }), calls.length], [true, 0]);
  eq('unsaved work, kept: true', [await draftKeptNow({ dirty: true, hasWork: true, write: write(true) }), calls.length], [true, 1]);
  eq('unsaved work the store would not take (full, blocked): false — the portal can still ask before closing',
    [await draftKeptNow({ dirty: true, hasWork: true, write: write(false) }),
      await draftKeptNow({ dirty: true, hasWork: true, write: write(() => Promise.reject(new Error('blocked'))) }),
      await draftKeptNow({ dirty: true, hasWork: true, write: write(() => { throw new Error('gone'); }) }),
      await draftKeptNow({ dirty: true, hasWork: true, write: write(undefined) })], [false, false, false, false]);
  eq('… nothing given: nothing needed keeping', await draftKeptNow(), true);
  // it resolves only once the write has: the portal may remove the frame the moment it does
  let land = null;
  let settled = 'not yet';
  const p = draftKeptNow({ dirty: true, hasWork: true, write: () => new Promise(r => { land = r; }) }).then(v => { settled = v; });
  await new Promise(r => setImmediate(r));
  eq('… and not before the draft has landed', settled, 'not yet');
  land(true);
  await p;
  eq('… then true', settled, true);
}

// ── a draft and the date of the file it is found for (review fix) ────────
// The portal hands a plan over dated by the portal: after its send of a kept save, by OneDrive's upload. So work
// done after the save was kept, drafted when the page was hidden, is OLDER than the file the portal then hands over
// — and the desktop rule ("older than the file: already saved into it") dropped it unasked.
{
  const at = hhmm => Date.UTC(2026, 10, 4, Number(hhmm.slice(0, 2)), Number(hhmm.slice(3)));
  const kept = at('10:00');          // Save: the portal answers 'kept'; the drafts are dropped
  const drafted = at('10:05');       // measuring on, the page hidden: a draft under plan|S1
  const adopted = at('11:02');       // the portal's send ends on the next visit; the plan is adopted, dated by OneDrive
  ok('(the case: the draft is newer than the save, older than the date the plan comes back with)', kept < drafted && drafted < adopted);
  eq('a plan the portal hands over: a draft newer than "kept" but older than the adopted file\'s date is OFFERED',
    draftFate({ savedAt: drafted, fileModified: adopted, byDate: false }), 'offer');
  eq('… any draft of it, however old: the portal\'s date says nothing about this app\'s saves',
    [draftFate({ savedAt: at('09:00'), fileModified: adopted, byDate: false }), draftFate({ savedAt: drafted, fileModified: 0, byDate: false })],
    ['offer', 'offer']);
  eq('a file this app saved (a computer\'s, or one picked in Files): older than the file is saved into it, as ever',
    [draftFate({ savedAt: drafted, fileModified: adopted }), draftFate({ savedAt: adopted + DRAFT_DATE_SLACK_MS, fileModified: adopted }),
      draftFate({ savedAt: adopted + DRAFT_DATE_SLACK_MS + 1, fileModified: adopted })],
    ['drop', 'drop', 'offer']);
  eq('… no date, or no draft time: nothing is judged by it', [draftFate({ savedAt: drafted, fileModified: 0 }), draftFate({ savedAt: drafted }),
    draftFate({ fileModified: adopted }), draftFate()], ['offer', 'offer', 'offer', 'offer']);
  eq('the slack is the 1.5 s it always was', DRAFT_DATE_SLACK_MS, 1500);
}
// A kept save the portal files as a separate copy (the plan changed in the office meanwhile): the copy holds the kept
// bytes, so the work after the save — drafted under the plan's name at the kept size — must be found from the copy.
{
  const S0 = { name: 'A000T1 - Made up plan.takeoff', size: 1000, pages: 3 };
  const S1 = { name: S0.name, size: 1400, pages: 3 };
  const COPY = { name: 'A000T1 - Made up plan - iPad 2026-11-04 1415.takeoff', size: 1400, pages: 3 };
  const afterKept = nextDraftHomes([S0], S1);
  eq('after kept: the plan as opened and as kept', afterKept, [S0, S1]);
  eq('the portal\'s "copy" news while the frame is open: the copy becomes a home (followPortalCopy), the opened file stays one',
    nextDraftHomes(afterKept, COPY), [S0, COPY]);
  eq('… and a draft written now is offered back from the copy (its sheets as they are)', draftHomeFor(nextDraftHomes(afterKept, COPY), 3), S0.name);
  eq('the copy\'s plan, by the portal\'s naming: "<stem> - iPad YYYY-MM-DD HHMM.takeoff" (and " (2)" on) → "<stem>.takeoff"', [
    planOfPortalCopy(COPY.name),
    planOfPortalCopy('A000T1 - Made up plan - iPad 2026-11-04 1415 (2).takeoff'),
    planOfPortalCopy('A000T1 - Made up plan - iPad 2026-11-04 1415 (9).TAKEOFF'),
    planOfPortalCopy('A000T1 - Made up plan - iPad 2026-11-04 1415 - iPad 2026-11-05 0910.takeoff'),
  ], [S0.name, S0.name, S0.name, 'A000T1 - Made up plan - iPad 2026-11-04 1415.takeoff']);
  eq('… any other name is no copy', [planOfPortalCopy(S0.name), planOfPortalCopy('Plan - iPad.takeoff'),
    planOfPortalCopy('Plan - iPad 2026-11-04.takeoff'), planOfPortalCopy(' - iPad 2026-11-04 1415.takeoff'),
    planOfPortalCopy('Plan - iPad 2026-11-04 1415.pdf'), planOfPortalCopy(null), planOfPortalCopy(42)], ['', '', '', '', '', '', '']);
}

// The broker CUTS a long plan name so the copy's name fits (handler.ts copyName: 200 characters, fewer in a project
// folder with a long name), and tidies an end of spaces and dots: planOfPortalCopy cannot give such a plan's name back,
// so a copy opened after the frame closed found no draft. The broker's rule, redone here (2026-11-04):
function brokerCopy(planName, stamp, n = 1, room = 200) {
  const stem = planName.normalize('NFC').replace(/\.takeoff$/i, '');
  const tail = ` - iPad ${stamp}${n > 1 ? ` (${n})` : ''}.takeoff`;
  const fits = Math.min(room, 200) - Array.from(tail).length;
  const cut = Array.from(stem).slice(0, fits).join('').replace(/[\s.]+$/u, '');
  return `${cut || 'Plan'}${tail}`;
}
{
  const STAMP = '2026-11-04 1415';
  const LONG = `A000T1 - ${'Made up plan of a long made-up job, '.repeat(6)}full set.takeoff`;      // 226 characters
  const cutCopy = brokerCopy(LONG, STAMP);
  eq('the broker\'s cut: the stem is cut, never the " - iPad <time>" part, to 200 characters (less the space it dropped)',
    [Array.from(cutCopy).length <= 200, cutCopy.endsWith(` - iPad ${STAMP}.takeoff`), LONG.startsWith(cutCopy.slice(0, -31))], [true, true, true]);
  eq('… so the copy\'s name no longer gives its plan\'s back', planOfPortalCopy(cutCopy) === LONG, false);
  const roomy = brokerCopy(LONG, STAMP, 3, COPY_ROOM_MIN);
  eq('the fewest characters a copy gets: 326 - 255 - 1 (a OneDrive folder of the longest name)', [COPY_ROOM_MIN, Array.from(roomy).length], [70, 70]);
  const kinds = [
    ['a whole name', brokerCopy('A000T1 - Made up plan.takeoff', STAMP), 'A000T1 - Made up plan.takeoff', 'whole'],
    ['… in capitals', brokerCopy('Main Level.TAKEOFF', STAMP, 9), 'Main Level.TAKEOFF', 'whole'],
    ['… its end\'s dots and spaces dropped', brokerCopy('Plan v2. .takeoff', STAMP), 'Plan v2. .takeoff', 'whole'],
    ['… a name of dots only ("Plan")', brokerCopy('. ..takeoff', STAMP), '. ..takeoff', 'whole'],
    ['… NFD in the drafts, NFC in the copy', brokerCopy('Cafe\u0301 level.takeoff', STAMP), 'Cafe\u0301 level.takeoff', 'whole'],
    ['cut to 200', cutCopy, LONG, 'cut'],
    ['cut in a long folder\'s room', roomy, LONG, 'cut'],
    ['cut where spaces were dropped', brokerCopy(`${'x'.repeat(100)}     ${'y'.repeat(100)}.takeoff`, STAMP, 1, 130),
      `${'x'.repeat(100)}     ${'y'.repeat(100)}.takeoff`, 'cut'],
    ['a copy of a copy, by its whole name', brokerCopy(brokerCopy('L1.takeoff', STAMP), '2026-11-05 0910'), brokerCopy('L1.takeoff', STAMP), 'whole'],
    ['not: a short copy is never a cut one ("L1" does not begin "L1 Revised" here)', brokerCopy('L1.takeoff', STAMP), 'L1 Revised.takeoff', ''],
    ['not: a sibling copy of the same plan', brokerCopy('L1.takeoff', STAMP), brokerCopy('L1.takeoff', STAMP, 2), ''],
    ['not: a sibling of a cut one', cutCopy, brokerCopy(LONG, '2026-11-03 0900'), ''],
    ['not: another plan', brokerCopy('A000T1 - Made up plan.takeoff', STAMP), 'A000T2 - Made up plan.takeoff', ''],
    ['not: a plan that is no takeoff', cutCopy, LONG.replace(/\.takeoff$/, '.pdf'), ''],
    ['not: a name that is no copy', 'A000T1 - Made up plan.takeoff', 'A000T1 - Made up plan.takeoff', ''],
    ['not: nothing', null, LONG, ''],
  ];
  for (const [why, copy, plan, want] of kinds) eq(`portalCopyKind — ${why}`, portalCopyKind(copy, plan), want);
  eq('… and a copy\'s own stem never ends in a space or a dot, so one that does is no cut', portalCopyKind(`${'z'.repeat(80)}. - iPad ${STAMP}.takeoff`, `${'z'.repeat(80)}. more.takeoff`), '');

  const N = 43853;
  const K = (name, size = N) => draftKey(name, size);
  eq('the draft of a cut copy\'s plan, at the copy\'s size', portalCopyDraftKey(cutCopy, N, [K('A000T2 other.takeoff'), K(LONG, 43340), K(LONG)]), K(LONG));
  eq('… in a long folder\'s room too', portalCopyDraftKey(roomy, N, [K(LONG)]), K(LONG));
  eq('… a plan in capitals, a tidied end, NFD', [
    portalCopyDraftKey(brokerCopy('Main Level.TAKEOFF', STAMP), N, [K('Main Level.TAKEOFF')]),
    portalCopyDraftKey(brokerCopy('Plan v2. .takeoff', STAMP), N, [K('Plan v2. .takeoff')]),
    portalCopyDraftKey(brokerCopy('Cafe\u0301 level.takeoff', STAMP), N, [K('Cafe\u0301 level.takeoff')]),
  ], [K('Main Level.TAKEOFF'), K('Plan v2. .takeoff'), K('Cafe\u0301 level.takeoff')]);
  eq('… the plan\'s whole name before one it only begins', portalCopyDraftKey(brokerCopy('L1.takeoff', STAMP), N, [K('L1 Revised.takeoff'), K('L1.takeoff')]), K('L1.takeoff'));
  {
    // a long name the broker did not cut (it fits), beside a longer plan it begins: the whole one, not the "cut" one
    const P = `A000T1 - ${'made up level '.repeat(6)}plan.takeoff`;
    const Q = P.replace(/\.takeoff$/, ' rev B.takeoff');
    const copy = brokerCopy(P, STAMP);
    eq('… also when the copy is long enough to have been cut', [Array.from(copy).length >= COPY_ROOM_MIN, portalCopyKind(copy, Q),
      portalCopyDraftKey(copy, N, [K(Q), K(P)]), portalCopyDraftKey(copy, N, [K(Q)])], [true, 'cut', K(P), K(Q)]);
  }
  eq('… none at another size (not those bytes)', portalCopyDraftKey(cutCopy, N, [K(LONG, N + 1), K(LONG, 1)]), '');
  eq('… two plans it could be: none, never a guess', portalCopyDraftKey(cutCopy, N, [K(LONG), K(`${LONG.slice(0, -8)} rev B.takeoff`)]), '');
  eq('… its own key and a sibling\'s are not its plan\'s', portalCopyDraftKey(cutCopy, N, [K(cutCopy), K(brokerCopy(LONG, STAMP, 2))]), '');
  eq('… nothing to go on: none', [portalCopyDraftKey(cutCopy, 0, [K(LONG)]), portalCopyDraftKey(cutCopy, N, null), portalCopyDraftKey(LONG, N, [K(LONG)]),
    portalCopyDraftKey(cutCopy, N, [42, null, `${LONG}`])], ['', '', '', '']);
  eq('… the keys are draftKey\'s own ("<name>|<size>")', draftKey(LONG, N), `${LONG}|${N}`);
}

// Review PRICE-4: two people who both see prices share an iPad. A leaves "Main Level" unsaved in the frame; B opens
// the same version of it (B's own record in the portal, the same name and size) and was offered A's measurements —
// to restore and Save under B's account, or to decline, which dropped A's work. Inside the portal the drafts are the
// signed-in person's now (ptt-open's `who`: the portal's opaque word for them, never an id or an e-mail).
{
  const A = 'AbCdEfGhIjKl';
  const B = 'Zz9_-0aB1cD2';
  const PLAN = 'A000T1 - Main Level.takeoff';
  const S = 43853;
  eq('a person\'s key: the name, the size and their word', draftKey(PLAN, S, A), `${PLAN}|${S}|@${A}`);
  ok('… another person\'s is another key, and neither is the key of no person',
    new Set([draftKey(PLAN, S, A), draftKey(PLAN, S, B), draftKey(PLAN, S)]).size === 3);
  eq('a word not of the portal\'s shape is no word (12 of A-Z a-z 0-9 - _)',
    [draftKey(PLAN, 1, 'AbCdEfGhIjK'), draftKey(PLAN, 1, `${A}x`), draftKey(PLAN, 1, 'AbCdEfGhIj+/'), draftKey(PLAN, 1, 'AbCdEfGhIj=='),
      draftKey(PLAN, 1, 42), draftKey(PLAN, 1, null), draftKey(PLAN, 1, '')], Array(7).fill(`${PLAN}|1`));
  eq('draftWho: the word, or nothing', [draftWho(A), draftWho('nope'), draftWho(undefined)], [A, '', '']);
  eq('the end of a key is the person\'s too', [draftKeyTail(S, A), draftKeyTail(S), draftKeyTail(S, 'nope')], [`|${S}|@${A}`, `|${S}`, `|${S}`]);
  ok('a person\'s key never ends in a number, so it can never be one of no person (whatever the file is called)',
    !/\|\d+$/.test(draftKey(`${PLAN}|${S}`, S, '123456789012')) && /\|@123456789012$/.test(draftKey(PLAN, S, '123456789012')));

  // a made-up drafts store: what was asked of it, and what it holds
  const store = entries => {
    const m = new Map(entries.map(([k, v]) => [k, { payload: { v }, savedAt: 1, pageCount: 3 }]));
    const log = [];
    return { log, get: async k => { log.push('get'); return m.get(k) || null; }, keys: async () => { log.push('keys'); return [...m.keys()]; } };
  };
  const v = f => (f ? [f.draft.payload.v, f.legacy, f.key] : null);
  {
    const st = store([[draftKey(PLAN, S, A), 'A\'s work']]);
    eq('B opens the plan A left unsaved: A\'s draft is not found — not offered, so not dropped by B\'s "no" either',
      await findDraft({ name: PLAN, size: S, portal: true, who: B }, st), null);
    const f = await findDraft({ name: PLAN, size: S, portal: true, who: A }, st);
    eq('… A opens it: A\'s own, offered as ever', f && [...v(f), f.own], ['A\'s work', false, draftKey(PLAN, S, A), draftKey(PLAN, S, A)]);
    eq('… each by its key alone: no list of keys read for a plan that is no copy', st.log, ['get', 'get', 'get']);
  }
  {
    const st = store([[draftKey(PLAN, S), 'from before the word']]);
    const f = await findDraft({ name: PLAN, size: S, portal: true, who: B }, st);
    eq('a draft kept before the portal said who: still found, but as one of no person (offered, never dropped)',
      f && [...v(f), f.own], ['from before the word', true, draftKey(PLAN, S), draftKey(PLAN, S, B)]);
    const mine = store([[draftKey(PLAN, S), 'old'], [draftKey(PLAN, S, B), 'mine']]);
    eq('… the person\'s own comes before it', v(await findDraft({ name: PLAN, size: S, portal: true, who: B }, mine)),
      ['mine', false, draftKey(PLAN, S, B)]);
    eq('a tab of its own (no word): the drafts of no person, as ever — never legacy there',
      v(await findDraft({ name: PLAN, size: S }, st)), ['from before the word', false, draftKey(PLAN, S)]);
    eq('… and a person\'s draft is never found without their word', await findDraft({ name: PLAN, size: S, portal: true },
      store([[draftKey(PLAN, S, A), 'A']])), null);
    eq('… nor with a word not of the portal\'s shape (that is no word)', v(await findDraft({ name: PLAN, size: S, portal: true, who: 'nope' }, st)),
      ['from before the word', false, draftKey(PLAN, S)]);
  }
  {
    // a separate copy the portal made of a save, found from the plan's draft — this person's only
    const COPY = 'A000T1 - Main Level - iPad 2026-11-04 1415.takeoff';
    const both = store([[draftKey(PLAN, S, A), 'A'], [draftKey(PLAN, S, B), 'B']]);
    eq('a copy the portal made: the draft of its plan that is THIS person\'s', [
      v(await findDraft({ name: COPY, size: S, portal: true, who: A }, both)),
      v(await findDraft({ name: COPY, size: S, portal: true, who: B }, both)),
    ], [['A', false, draftKey(PLAN, S, A)], ['B', false, draftKey(PLAN, S, B)]]);
    eq('… the copy\'s own draft first', v(await findDraft({ name: COPY, size: S, portal: true, who: A },
      store([[draftKey(PLAN, S, A), 'plan'], [draftKey(COPY, S, A), 'copy']]))), ['copy', false, draftKey(COPY, S, A)]);
    eq('… one of no person, as legacy', v(await findDraft({ name: COPY, size: S, portal: true, who: A }, store([[draftKey(PLAN, S), 'old']]))),
      ['old', true, draftKey(PLAN, S)]);
    // the broker cut a long name: looked for among the keys, this person's only
    const LONG = `A000T1 - ${'Made up plan of a long made-up job, '.repeat(6)}full set.takeoff`;
    const cut = brokerCopy(LONG, '2026-11-04 1415');
    const keys = [draftKey(LONG, S, A), draftKey(LONG, S, B)];
    eq('a cut copy\'s plan, among the keys: this person\'s key only (two people\'s drafts of it are not "two plans")',
      [portalCopyDraftKey(cut, S, keys, A), portalCopyDraftKey(cut, S, keys, B), portalCopyDraftKey(cut, S, keys)], [keys[0], keys[1], '']);
    const st = store([[keys[0], 'A'], [keys[1], 'B']]);
    eq('… found so by findDraft', v(await findDraft({ name: cut, size: S, portal: true, who: B }, st)), ['B', false, keys[1]]);
    eq('… one of no person of a cut copy\'s plan, as legacy', v(await findDraft({ name: cut, size: S, portal: true, who: B },
      store([[draftKey(LONG, S), 'old']]))), ['old', true, draftKey(LONG, S)]);
    const none = store([]);
    eq('… and a plan that is no copy is never looked for among the keys (its own key and the one of no person only)',
      [await findDraft({ name: PLAN, size: S, portal: true, who: A }, none), none.log], [null, ['get', 'get']]);
  }
  {
    // the whole case, out of the pieces main.js joins: A's homes drafted under A's word; B opens; A opens
    const homes = nextDraftHomes([], { name: PLAN, size: S, pages: 3 });
    const st = store(homes.map(h => [draftKey(h.name, h.size, A), 'A\'s hour']));
    eq('end to end — A\'s hour of takeoff on a shared iPad: B is offered nothing, A gets it back', [
      await findDraft({ name: PLAN, size: S, portal: true, who: B }, st),
      v(await findDraft({ name: PLAN, size: S, portal: true, who: A }, st)),
    ], [null, ['A\'s hour', false, draftKey(PLAN, S, A)]]);
  }
}

// Contract addendum 3 D7: inside the portal, with no draft of this person's for the file (name, size, who, plan), their
// newest draft of the same plan at ANOTHER size is offered — said to be of an earlier version, never dropped
// unasked. The same plan: its name AND the portal's word for it (ptt-open's `plan`, contract addendum 4 E4), which is
// in the key: "<name>|<size>|@<who>|#<plan>". Picked from the keys: no other person's draft, no other plan name's and
// no other plan word's is ever read.
{
  const A = 'AbCdEfGhIjKl';
  const B = 'Zz9_-0aB1cD2';
  const PLAN = 'A000T1 - Main Level.takeoff';
  const P = 'pLaN_A000T1-';           // the portal's word for this plan (made up)
  const Q = 'Qq_other-lot';           // another plan's: the same name in another folder or job
  const S0 = 43853, S1 = 44120, SB = 45002;
  const K = (n, w = A, p = P) => draftKey(PLAN, n, w, p);
  // a made-up drafts store: [key, what, savedAt]; which keys were read, and how often the keys were listed
  const store = entries => {
    const m = new Map(entries.map(([k, v, at = 1]) => [k, { payload: { v }, savedAt: at, pageCount: 3 }]));
    const read = [];
    let listed = 0;
    return {
      read, get listed() { return listed; },
      get: async k => { read.push(k); return m.get(k) || null; },
      keys: async () => { listed += 1; return [...m.keys()]; },
    };
  };
  const at = (o, st) => findDraft({ name: PLAN, portal: true, embedded: true, plan: P, ...o }, st);
  const v = f => (f ? [f.draft.payload.v, f.key, f.legacy, f.earlier] : null);
  eq('a person\'s key of a plan the portal named: "<name>|<size>|@<who>|#<plan>"', [K(S0), draftKeyTail(S0, A, P)],
    [`${PLAN}|${S0}|@${A}|#${P}`, `|${S0}|@${A}|#${P}`]);
  eq('… never a plan without a person, and a word not of the portal\'s shape is no word',
    [draftKey(PLAN, S0, '', P), draftKeyTail(S0, 'nope', P), ...['pLaN_A000T1', `${P}x`, 'pLaN_A000T=', 'pLaN_A000T1/', 42, null, ''].map(p => draftKey(PLAN, S0, A, p))],
    [`${PLAN}|${S0}`, `|${S0}`, ...Array(7).fill(`${PLAN}|${S0}|@${A}`)]);
  ok('… two plans\' words are two keys, and neither is the key of no plan', new Set([K(S0), K(S0, A, Q), draftKey(PLAN, S0, A)]).size === 3);
  eq('draftPlan: the portal\'s word, or nothing', [draftPlan(P), draftPlan(Q), draftPlan('pLaN_A000T1'), draftPlan(`${P}x`), draftPlan('AbCdEfGhIj+/'),
    draftPlan('AbCdEfGhIj=='), draftPlan('A000T1'), draftPlan(42), draftPlan(null), draftPlan('')], [P, Q, '', '', '', '', '', '', '', '']);
  {
    const st = store([[K(S0), 'A at S0']]);
    const f = await at({ size: SB, who: A }, st);
    eq('the plan handed at another size: A\'s draft of it is found, as an earlier version (not legacy)', v(f),
      ['A at S0', K(S0), false, true]);
    eq('… its own key is the file\'s, with the plan\'s word, for the draft from now on', f && f.own, K(SB));
    eq('… the file\'s own draft comes first, as ever (not an earlier one)', v(await at({ size: SB, who: A },
      store([[K(S0), 'old', 9], [K(SB), 'own', 1]]))), ['own', K(SB), false, false]);
    eq('… a tab of its own (not inside the portal): never at another size, and no plan in its keys', [
      await findDraft({ name: PLAN, size: SB, portal: true, who: A, plan: P }, st),
      v(await findDraft({ name: PLAN, size: S0, portal: true, who: A, plan: P }, store([[draftKey(PLAN, S0, A), 'a tab']])))],
    [null, ['a tab', draftKey(PLAN, S0, A), false, false]]);
    eq('… no word for the person: none (only a person\'s own drafts are ever looked for at another size)',
      [await at({ size: SB }, st), await at({ size: SB, who: 'nope' }, st)], [null, null]);
  }
  {
    const st = store([[K(S0), 'A at S0', 5], [K(S1), 'A at S1', 7], [K(S0, B), 'B', 99],
      [draftKey(PLAN, S1), 'no person', 99], [draftKey('A000T1 - Roof.takeoff', S0, A, P), 'another plan name', 99],
      [K(44600, A, Q), 'another plan word', 99], [draftKey(PLAN, 44700, A), 'no plan word', 99],
      [draftKey(`${PLAN}|${S0}`, S1, A, P), 'a plan named like a key', 99], [K(0), 'no file', 99]]);
    const f = await at({ size: SB, who: A }, st);
    eq('several: the newest of THIS person\'s, of THIS plan (its name and its word)', v(f), ['A at S1', K(S1), false, true]);
    eq('… the keys listed once, and only this person\'s drafts of this plan read (never B\'s, one of no person, another plan name\'s, another plan word\'s, one of no plan word)',
      [st.listed, [...new Set(st.read.filter(k => k !== K(SB) && k !== draftKey(PLAN, SB)))].sort()],
      [1, [K(S0), K(S1)].sort()]);
    eq('B: never A\'s — B\'s own earlier one', v(await at({ size: SB, who: B }, st)), ['B', K(S0, B), false, true]);
    eq('… a person with no draft of the plan: nothing (not another person\'s, not one of no person at another size)',
      await at({ size: SB, who: 'Qq1_-Qq1_-Qq' }, st), null);
  }
  {
    eq('one of no person keeps CONTRACT-2\'s rule: at the file\'s own size only (offered as legacy)', [
      await at({ size: SB, who: A }, store([[draftKey(PLAN, S0), 'no person at S0']])),
      v(await at({ size: SB, who: A }, store([[draftKey(PLAN, SB), 'no person at SB']]))),
    ], [null, ['no person at SB', draftKey(PLAN, SB), true, false]]);
    eq('… the person\'s own earlier one before it (theirs for certain)', v(await at({ size: SB, who: A },
      store([[draftKey(PLAN, SB), 'no person at SB'], [K(S0), 'A at S0']]))), ['A at S0', K(S0), false, true]);
    const empty = { get: async k => (k === K(S0) ? { savedAt: 9, pageCount: 3 } : null), keys: async () => [K(S0)] };
    eq('… a draft with nothing in it is no draft', await at({ size: SB, who: A }, empty), null);
  }
  {
    // contract addendum 4 E4: another plan's word is another plan, whatever its name and size
    const st = store([[K(S0, A, Q), 'the other lot\'s work', 9], [K(S1, A, Q), 'the other lot\'s, later', 10], [draftKey(PLAN, S1, A), 'no word', 8]]);
    eq('another plan\'s word: never offered, at its very name and size or at another (nor one written with no word)',
      [await at({ size: S0, who: A }, st), await at({ size: SB, who: A }, st)], [null, null]);
    eq('… and never read: only this plan\'s own keys (and the ones of no person) are asked for', [...new Set(st.read)].sort(),
      [K(S0), K(SB), draftKey(PLAN, S0), draftKey(PLAN, SB)].sort());
    eq('… that plan\'s own word finds it (the other lot\'s own file)',
      v(await at({ size: S0, who: A, plan: Q }, st)), ['the other lot\'s work', K(S0, A, Q), false, false]);
    const none = store([[draftKey(PLAN, S0, A), 'no word at S0'], [draftKey(PLAN, SB, A), 'no word at SB'], [K(S0), 'P at S0'], [K(SB), 'P at SB']]);
    const words = ['', undefined, 'pLaN_A000T1', `${P}x`, 'AbCdEfGhIj+/', 'AbCdEfGhIj==', 42];
    eq('a plan handed with no word (or one not of the portal\'s shape): the file\'s own "<name>|<size>|@<who>" draft only, under that key',
      await Promise.all(words.map(async p => v(await at({ size: SB, who: A, plan: p }, none)))),
      Array(words.length).fill(['no word at SB', draftKey(PLAN, SB, A), false, false]));
    none.read.length = 0;
    eq('… and no earlier version: no key listed, nothing read but that key and the one of no person (never a plan\'s draft)', [
      await Promise.all(words.map(p => at({ size: S1, who: A, plan: p }, none))), none.listed, [...new Set(none.read)].sort()],
    [Array(words.length).fill(null), 0, [draftKey(PLAN, S1, A), draftKey(PLAN, S1)].sort()]);
    eq('… and its own key is the one of no plan', (await at({ size: SB, who: A, plan: '' }, none) || {}).own, draftKey(PLAN, SB, A));
    // read one at a time, and only the newest kept (a draft can be megabytes of takeoff)
    let now = 0, most = 0;
    const m = new Map([S0, S1, 44500, 44600].map((n, i) => [K(n), { payload: { v: n }, savedAt: [3, 9, 1, 5][i], pageCount: 3 }]));
    const slow = { keys: async () => [...m.keys()],
      get: async k => { now += 1; most = Math.max(most, now); await new Promise(r => setTimeout(r, 2)); now -= 1; return m.get(k) || null; } };
    eq('… read one at a time, the newest taken', [v(await at({ size: SB, who: A }, slow)), most], [[S1, K(S1), false, true], 1]);
  }
  {
    // a separate copy the portal made of a save finds the draft of its plan at the copy's size — inside the word the
    // portal handed the copy with, never another plan word's
    const COPY = 'A000T1 - Main Level - iPad 2026-11-05 1010.takeoff';
    const st = store([[K(S0), 'P\'s', 2], [K(S0, A, Q), 'Q\'s', 9], [draftKey(PLAN, S0, A), 'no word', 99]]);
    eq('a copy the portal made: the draft of its plan under the same word only (never another word\'s, nor one of no word)', [
      v(await at({ name: COPY, size: S0, who: A }, st)), v(await at({ name: COPY, size: S0, who: A, plan: Q }, st)),
      await at({ name: COPY, size: S0, who: A, plan: 'Rr_third-lot' }, st)],
    [['P\'s', K(S0), false, false], ['Q\'s', K(S0, A, Q), false, false], null]);
    const LONG = `A000T1 - ${'Made up plan of a long made-up job, '.repeat(6)}full set.takeoff`;
    const cut = brokerCopy(LONG, '2026-11-05 1010');
    const keys = [draftKey(LONG, S0, A, P), draftKey(LONG, S0, A, Q), draftKey(LONG, S0, A)];
    eq('… a cut copy\'s plan among the keys: that word\'s key only, or with no word the key of no word',
      [portalCopyDraftKey(cut, S0, keys, A, P), portalCopyDraftKey(cut, S0, keys, A, Q), portalCopyDraftKey(cut, S0, keys, A),
        portalCopyDraftKey(cut, S0, keys.slice(1), A, P)], [keys[0], keys[1], keys[2], '']);
  }
  {
    // one opening drafts the same work under every file it may come back from: those keys are its twins, and go with
    // it by the person's answer — never a key that holds anything else. Found only after the answer (draftTwins).
    const S2 = 44500;
    const m = new Map([
      [K(S0), { payload: { v: 'the same work' }, savedAt: 5, pageCount: 3 }],
      [K(S1), { payload: { v: 'the same work' }, savedAt: 7, pageCount: 3 }],
      [K(S2), { payload: { v: 'other work' }, savedAt: 3, pageCount: 3 }],
      [K(44600), { payload: { v: 'the same work' }, savedAt: 2, pageCount: 4 }],
      [K(44700, A, Q), { payload: { v: 'the same work' }, savedAt: 2, pageCount: 3 }],
      [draftKey(PLAN, 44750, A), { payload: { v: 'the same work' }, savedAt: 2, pageCount: 3 }],
      [draftKey(PLAN, 44760, A), { payload: { v: 'the same work' }, savedAt: 2, pageCount: 3 }],
      [K(S0, B), { payload: { v: 'the same work' }, savedAt: 1, pageCount: 3 }],
      [draftKey(PLAN, 44800), { payload: { v: 'the same work' }, savedAt: 1, pageCount: 3 }],
      [draftKey('A000T1 - Roof.takeoff', S0, A, P), { payload: { v: 'the same work' }, savedAt: 1, pageCount: 3 }],
    ]);
    const read = [];
    const st = { get: async k => { read.push(k); return m.get(k) || null; }, keys: async () => [...m.keys()] };
    const f = await at({ size: SB, who: A }, st);
    eq('findDraft gives no twins (they are looked for after the answer)', f && [f.key, 'twins' in f], [K(S1), false]);
    read.length = 0;
    eq('twins: the other keys of THIS person\'s that hold exactly the same work of the same plan (not other work, other sheets, another plan word, no plan word, another person)',
      await draftTwins(f, st, A, P), [K(S0)]);
    eq('… reading only this person\'s drafts of this plan (its name and its word)', [...new Set(read)].sort(),
      [S0, S2, 44600].map(n => K(n)).sort());
    const own = await at({ size: S0, who: A }, st);
    eq('… an own draft has them too (the re-check: the posted file of a save that was not kept)',
      own && [own.key, own.earlier, await draftTwins(own, st, A, P)], [K(S0), false, [K(S1)]]);
    eq('… never the file\'s own key', await draftTwins({ ...f, own: K(S0) }, st, A, P), []);
    eq('… none for one of no person, for another person\'s word or none, for another plan\'s word, for nothing', [
      await draftTwins({ key: draftKey(PLAN, 44800), draft: m.get(draftKey(PLAN, 44800)), own: draftKey(PLAN, SB), legacy: true }, st, A, P),
      await draftTwins({ key: draftKey(PLAN, 44800), draft: m.get(draftKey(PLAN, 44800)), own: draftKey(PLAN, SB), legacy: false }, st, A, P),
      await draftTwins(f, st, B, P), await draftTwins(f, st, '', P), await draftTwins(f, st, A, Q), await draftTwins(null, st, A, P)],
    [[], [], [], [], [], []]);
    const noWord = { key: draftKey(PLAN, 44750, A), draft: m.get(draftKey(PLAN, 44750, A)), own: draftKey(PLAN, 44750, A), legacy: false, earlier: false };
    read.length = 0;
    eq('… and none at all when the portal named no plan (another job\'s plan may have the name): nothing read', [
      await draftTwins(noWord, st, A, ''), await draftTwins(noWord, st, A), await draftTwins(noWord, st, A, 'nope'), read], [[], [], [], []]);
  }
  eq('the words for it are the contract\'s', earlierDraftWords('11/4/2026, 3:15:00 PM'),
    'These are your unsaved changes from an earlier version of this plan (11/4/2026, 3:15:00 PM). Restoring them replaces what is open now.');
  ok('… and the question after them says what each answer does (Not now keeps them; Discard throws them away)',
    /^Restore them\? “Not now” keeps them on this device, and opening this plan offers them again; “Discard them” throws them away\.$/.test(EARLIER_DRAFT_ASK));
}

// The re-check's scenario (contract addendum 3 D7), walked out of the pieces main.js joins: one person, one iPad, two
// openings W1 and W2 of plan P, both handed the portal's file F1 (size S0). W2 saves first: the portal keeps it. W1
// saves: refused (another opening's save waits). W1 is closed (its draft kept under every home first: saveDraftNow), and
// reopened later — handed W2's save, now the plan, at its own size. W1's work is offered, as an earlier version.
{
  const A = 'AbCdEfGhIjKl';
  const B = 'Zz9_-0aB1cD2';
  const P = 'A000T1 - Main Level.takeoff';
  const WP = 'pLaN_A000T1-';                     // the portal's word for P
  const S0 = 43853;
  const WORD = 'Zk3pQ9_x-7LmN2aBcD4e';           // the hand-over's nonce
  const drafts = new Map();
  const keysOf = homes => homes.map(h => draftKey(h.name, h.size, A, WP));
  const write = (homes, work, savedAt) => { for (const k of keysOf(homes)) drafts.set(k, { payload: { v: work }, savedAt, pageCount: 3 }); };
  const read = [];
  const st = { get: async k => { read.push(k); return drafts.get(k) || null; }, keys: async () => [...drafts.keys()] };
  // what the portal answers W's save (the hand-over itself, made-up portal and clock)
  const handOver = async (file, answer, why) => {
    const c = fakeClock();
    const win = { closed: false };
    const handlers = new Set();
    const peer = { via: 'frame', win, origin: 'https://portal.dcrframing.com' };
    const waiting = askPortalToKeep({ peer, nonce: WORD, req: 'w1', name: P, size: file.size, file }, {
      ...c, waitMs: SAVE_WAIT_MS, pollMs: 2000, doc: null,
      listen: fn => { handlers.add(fn); return () => handlers.delete(fn); }, post: () => {}, peerGone: () => win.closed,
    });
    for (const h of [...handlers]) h({ source: win, origin: peer.origin, data: { type: 'ptt-save-state', v: 1, nonce: WORD, req: 'w1', state: answer, why } });
    return waiting;
  };
  let w1 = nextDraftHomes([], { name: P, size: S0, pages: 3 });
  let w2 = nextDraftHomes([], { name: P, size: S0, pages: 3 });
  // W1 has been working (its page hidden once), so has W2
  write(w1, 'W1 work', 100);
  write(w2, 'W2 work', 110);
  // W2 saves first: drafted, posted (a pending home), kept — its drafts go
  const fileB = new Blob([new Uint8Array(45002)]);
  {
    const before = keysOf(w2);
    write(w2, 'W2 work', 200);
    w2 = nextDraftHomes(w2, { name: P, size: fileB.size, pages: 3 }, { pending: true });
    const { ending } = await handOver(fileB, 'kept', '');
    const next = afterSave(ending === 'kept' ? 'kept' : 'not-kept', { name: P, why: ending, keptIn: P, dirty: true, device: 'iPad' });
    if (next.confirmed) w2 = nextDraftHomes(w2, { name: P, size: fileB.size, pages: 3 });
    if (next.dropDraft) for (const k of new Set([...before, ...keysOf(w2)])) drafts.delete(k);
  }
  // W1 saves: drafted, posted, refused — the draft is kept, and the words promise no reopen offer
  const file1 = new Blob([new Uint8Array(44120)]);
  let words;
  {
    write(w1, 'W1 work', 300);
    w1 = nextDraftHomes(w1, { name: P, size: file1.size, pages: 3 }, { pending: true });
    const { ending, why } = await handOver(file1, 'refused', 'This plan has a save from another window or tab on this iPad that is not in OneDrive yet.');
    const next = afterSave(ending === 'kept' ? 'kept' : 'not-kept', { name: P, why: ending, portalWhy: why, keptIn: draftHomeFor(w1, 3), dirty: true, device: 'iPad' });
    eq('walk — W1\'s save is refused: not saved, the draft kept', [ending, next.markSaved, next.dropDraft], ['refused', false, false]);
    words = next.status;
    // Close: the portal asks for the draft first (TakeoffApp.saveDraftNow), under every home
    write(w1, 'W1 work', 400);
  }
  ok('walk — W1\'s status line promises no reopen offer, and says Save a copy to Files', /^Not saved: the portal did not take this save \(/.test(words)
    && /Your changes are still in this window - use Save a copy to Files to keep them\.$/.test(words) && !/offers them back|again offers/.test(words));
  eq('walk — W1\'s work is under W1\'s files only (the plan\'s first file, and the one refused); W2\'s went with its kept save',
    [...drafts.keys()].sort(), [draftKey(P, S0, A, WP), draftKey(P, file1.size, A, WP)].sort());
  // later: W2's save was sent and adopted, so reopening P hands W2's file, at ITS size, with P's word
  const f = await findDraft({ name: P, size: fileB.size, portal: true, who: A, embedded: true, plan: WP }, st);
  eq('walk — W1 reopens P (handed at W2\'s size): W1\'s work is offered, as an earlier version, nothing dropped',
    f && [f.draft.payload.v, f.earlier, f.legacy, f.own, drafts.size], ['W1 work', true, false, draftKey(P, fileB.size, A, WP), 2]);
  ok('walk — … with the contract\'s words, and its date', f && earlierDraftWords(new Date(f.draft.savedAt).toLocaleString())
    === `These are your unsaved changes from an earlier version of this plan (${new Date(400).toLocaleString()}). Restoring them replaces what is open now.`);
  read.length = 0;
  eq('walk — another person on this iPad opens P: offered nothing, and none of A\'s drafts read',
    [await findDraft({ name: P, size: fileB.size, portal: true, who: B, embedded: true, plan: WP }, st), read.filter(k => k.includes(`|@${A}`))], [null, []]);
  // "Not now" leaves it (main.js offerDraftRestore: 'later' returns before anything is looked for or dropped)
  eq('walk — Not now: it is offered again at the next open', (await findDraft({ name: P, size: fileB.size, portal: true, who: A, embedded: true, plan: WP }, st) || {}).key, f.key);
  // A answers Restore or Discard: the offered key and its twin (the same work under W1's other file) go together — so
  // the same work is never offered a second time, whichever way A answered
  const twins = await draftTwins(f, st, A, WP);
  eq('walk — the twin is W1\'s other file\'s key', f && [[f.key, ...twins].sort()], [[draftKey(P, S0, A, WP), draftKey(P, file1.size, A, WP)].sort()]);
  for (const k of [f.key, ...twins]) drafts.delete(k);
  eq('walk — once A has answered, nothing of that work is offered again', await findDraft({ name: P, size: fileB.size, portal: true, who: A, embedded: true, plan: WP }, st), null);
}

// The final check of contract addendum 3 (its probe's three cases), and contract addendum 4 E4: one person, two jobs or
// two lots whose plans share a file name and a sheet count — the office copied one house model's "Roof.takeoff" into
// A267's folder and A268's, so the two files have the same bytes. The portal names each plan by its own word. Work on
// A267's is left unsaved, kept under the plan's file and the file a 'no-room' save posted (the portal's Close keeps
// the draft). Opening A268's plan — at another size, or at the very same size — offers nothing, reads nothing of
// A267's, drops nothing, and its own drafts never write over A267's; A267's plan still offers its work, as its own.
{
  const A = 'AbCdEfGhIjKl';
  const NAME = 'Roof.takeoff';
  const P267 = 'lot-A267_Rf1', P268 = 'lot-A268_Rf1';   // the portal's words for the two lots' plans (made up)
  const drafts = new Map();
  const read = [];
  const st = { get: async k => { read.push(k); return drafts.get(k) || null; }, keys: async () => [...drafts.keys()] };
  const keysOf = (homes, word) => homes.map(h => draftKey(h.name, h.size, A, word));
  // what main.js writes (draftInfo): the work, the sheet count and the file's name — under every home's key
  const write = (homes, word, work, savedAt) => { for (const k of keysOf(homes, word)) drafts.set(k, { payload: { measurements: work }, savedAt, pageCount: 4, name: NAME }); };
  let a267 = nextDraftHomes([], { name: NAME, size: 5000000, pages: 4 });
  write(a267, P267, ['A267 wall 1', 'A267 wall 2'], 1000);
  a267 = nextDraftHomes(a267, { name: NAME, size: 6000000, pages: 4 }, { pending: true });
  const next = afterSave('not-kept', { name: NAME, why: 'no-room', keptIn: draftHomeFor(a267, 4), dirty: true, device: 'iPad' });
  eq('two lots — A267\'s save gets no room: not saved, the draft kept', [next.markSaved, next.dropDraft], [false, false]);
  write(a267, P267, ['A267 wall 1', 'A267 wall 2'], 2000);       // Close: under every home
  const a267Keys = [...drafts.keys()].sort();
  eq('two lots — A267\'s work is under A267\'s plan word only', a267Keys, [draftKey(NAME, 5000000, A, P267), draftKey(NAME, 6000000, A, P267)].sort());
  const snapshot = () => JSON.stringify([...drafts.entries()].sort());
  const before = snapshot();
  const open268 = size => findDraft({ name: NAME, size, portal: true, who: A, embedded: true, plan: P268 }, st);
  eq('two lots — A268\'s plan at another size: offered nothing (not as an earlier version either)', await open268(7200000), null);
  eq('two lots — A268\'s plan at the SAME size (byte-identical): offered nothing, so nothing to restore onto it or to decline', await open268(5000000), null);
  eq('… and at the size A267\'s save was posted at: nothing', await open268(6000000), null);
  eq('… nothing of A267\'s was read, and nothing dropped or changed', [read.filter(k => k.endsWith(`|#${P267}`)), snapshot() === before], [[], true]);
  // A268 works on its plan, and its page is hidden: its draft goes under ITS keys, never over A267's
  write(nextDraftHomes([], { name: NAME, size: 5000000, pages: 4 }), P268, ['A268 wall 9'], 3000);
  eq('two lots — A268\'s own draft is its own key; A267\'s keys still hold A267\'s work', [
    drafts.get(draftKey(NAME, 5000000, A, P268)).payload.measurements,
    a267Keys.map(k => drafts.get(k).payload.measurements)],
  [['A268 wall 9'], [['A267 wall 1', 'A267 wall 2'], ['A267 wall 1', 'A267 wall 2']]]);
  const back = await findDraft({ name: NAME, size: 5000000, portal: true, who: A, embedded: true, plan: P267 }, st);
  eq('two lots — A267\'s plan offers A267\'s work back, as its own', back && [back.key, back.earlier, back.draft.payload.measurements],
    [draftKey(NAME, 5000000, A, P267), false, ['A267 wall 1', 'A267 wall 2']]);
  const twins = await draftTwins(back, st, A, P267);
  eq('… its twin is A267\'s posted file only (never A268\'s, which holds other work under another word)', twins, [draftKey(NAME, 6000000, A, P267)]);
  for (const k of [back.key, ...twins]) drafts.delete(k);       // Cancel: the offered key and its twins go
  eq('… and declining it leaves A268\'s draft where it was', [...drafts.keys()], [draftKey(NAME, 5000000, A, P268)]);
  const later = await findDraft({ name: NAME, size: 5100000, portal: true, who: A, embedded: true, plan: P268 }, st);
  eq('two lots — A268\'s plan at a later size offers A268\'s work as an earlier version of that plan', later && [later.key, later.earlier],
    [draftKey(NAME, 5000000, A, P268), true]);
}

// The re-check of D7: one opening, one plan, canSave. Save is answered 'no-room' (the same for refused, failed or the
// two-minute wait): the draft stays under the plan's file AND the file posted (its pending home). Reopening the same,
// unchanged plan offers the own draft; Cancel. The next reopening offers nothing — not the declined work again as
// "an earlier version of this plan".
{
  const A = 'AbCdEfGhIjKl';
  const P = 'Framing.takeoff';
  const WP = 'pLaN_A024_Fr';
  const drafts = new Map();
  const st = { get: async k => drafts.get(k) || null, keys: async () => [...drafts.keys()] };
  let homes = nextDraftHomes([], { name: P, size: 51551, pages: 2 });
  const write = (work, savedAt) => { for (const h of homes) drafts.set(draftKey(h.name, h.size, A, WP), { payload: { v: work }, savedAt, pageCount: 2 }); };
  write('work they will throw away', 10);
  homes = nextDraftHomes(homes, { name: P, size: 52088, pages: 2 }, { pending: true });
  for (const why of ['no-room', 'refused', 'failed', 'timeout']) {
    const next = afterSave('not-kept', { name: P, why, keptIn: draftHomeFor(homes, 2), dirty: true, device: 'iPad' });
    eq(`own decline — ${why}: not saved, the draft kept`, [next.markSaved, next.dropDraft], [false, false]);
  }
  write('work they will throw away', 20);       // Close: under every home
  eq('own decline — the draft is under the plan\'s file and the one posted', [...drafts.keys()].sort(), [draftKey(P, 51551, A, WP), draftKey(P, 52088, A, WP)].sort());
  const f = await findDraft({ name: P, size: 51551, portal: true, who: A, embedded: true, plan: WP }, st);
  eq('own decline — reopened: its own draft offered', f && [f.key, f.earlier], [draftKey(P, 51551, A, WP), false]);
  // Cancel (main.js offerDraftRestore: 'discard' for an own draft): the offered key and its twins go
  for (const k of [f.key, ...await draftTwins(f, st, A, WP)]) drafts.delete(k);
  eq('own decline — after Cancel, nothing of that work is left', [...drafts.keys()], []);
  eq('own decline — and the next reopening of the same plan offers nothing', await findDraft({ name: P, size: 51551, portal: true, who: A, embedded: true, plan: WP }, st), null);
}

// listDraftKeys reads the keys only — never a draft (a draft can be megabytes of takeoff).
{
  const drafts = await import(new URL('../js/core/drafts.js?no-store', import.meta.url));
  eq('no IndexedDB at all: no keys, and no throw', await drafts.listDraftKeys(), []);
  const calls = [];
  const store = {
    getAllKeys() { calls.push('getAllKeys'); return { result: ['A000T1 - Made up plan.takeoff|43853', 7, 'B.takeoff|1'] }; },
    getAll() { calls.push('getAll'); return { result: [] }; },
    get() { calls.push('get'); return { result: null }; },
  };
  const db = {
    objectStoreNames: { contains: () => true },
    transaction() { const tr = { objectStore: () => store }; setTimeout(() => tr.oncomplete && tr.oncomplete()); return tr; },
  };
  const had = globalThis.indexedDB;
  globalThis.indexedDB = { open() { const r = { result: db }; setTimeout(() => r.onsuccess && r.onsuccess()); return r; } };
  try {
    const fresh = await import(new URL('../js/core/drafts.js?made-up-store', import.meta.url));
    eq('the keys, strings only, out of getAllKeys alone', [await fresh.listDraftKeys(), calls], [['A000T1 - Made up plan.takeoff|43853', 'B.takeoff|1'], ['getAllKeys']]);
  } finally {
    if (had === undefined) delete globalThis.indexedDB; else globalThis.indexedDB = had;
  }
}

// ── the file's name ──────────────────────────────────────────────────────
eq('an opened plan keeps its own name',
  saveFileName({ openedName: 'A249 - Vista Buena - FULL SET.takeoff', projectName: 'Vista Buena' }), 'A249 - Vista Buena - FULL SET.takeoff');
eq('an old .pdfcache comes back as .takeoff', saveFileName({ openedName: 'Old job.pdfcache', projectName: 'Old' }), 'Old job.takeoff');
eq('a .TAKEOFF in capitals is still the extension', saveFileName({ openedName: 'Loud.TAKEOFF' }), 'Loud.takeoff');
eq('only the name, never a path', saveFileName({ openedName: 'C:\\Users\\x\\A100 Roof.takeoff' }), 'A100 Roof.takeoff');
eq('characters no file system takes are replaced', saveFileName({ openedName: 'A1: "new" <set>?.takeoff' }), 'A1_ _new_ _set_.takeoff');
eq('a new project (no file yet) is named after the project, as before', saveFileName({ openedName: '', projectName: '  Vista Buena  ' }), 'Vista Buena.takeoff');
eq('… a bad project name is cleaned', saveFileName({ projectName: 'A/B' }), 'A_B.takeoff');
eq('… nothing at all: Takeoff', saveFileName({}), 'Takeoff.takeoff');
eq('a name that is only the extension falls back to the project', saveFileName({ openedName: '.takeoff', projectName: 'P' }), 'P.takeoff');
ok('what replacing the plan in Files does is said in words', /replace/.test(REPLACE_WARNING) && /elsewhere since you opened it/.test(REPLACE_WARNING));

// ── the words for what Save does on a phone ──────────────────────────────
// Review fix: most real plan sets are over the cap and never see a share sheet; the words are built from it.
ok('the handheld words name the cap itself, from SHARE_CAP_BYTES', HANDHELD_SAVE.includes(`${SHARE_CAP_BYTES / MB} MB`));
ok('… the share sheet up to it, and a download into Downloads above it or with no share',
  /share sheet up to/.test(HANDHELD_SAVE) && /Save to Files/.test(HANDHELD_SAVE) && /above that/.test(HANDHELD_SAVE)
  && /cannot share a file/.test(HANDHELD_SAVE) && /Files › Downloads/.test(HANDHELD_SAVE));
ok('the #plans link\'s phone hint says it, and what replacing does', HANDHELD_HINT.includes(HANDHELD_SAVE) && HANDHELD_HINT.includes(REPLACE_WARNING));

// ── a big plan opened over the internet, on a phone or a tablet (review MEM-1) ──
// A handheld with no room for a 2 GB plan opens it over the internet. Its Save composed the file — every sheet read
// whole into memory (RemoteSlice.blob) before the share sheet or the download — and the page's process (inside the
// portal, the portal's page) was killed; Save could never succeed, and the words promised a new file.
{
  const remote = new RemoteFile({ url: 'https://made-up.test/plan', name: 'A000T1 - Big.takeoff', size: 2300 * MB });
  const sheet = (a, b) => ({ kind: 'slice', data: remote.slice(a, b) });
  const onDevice = new Blob([new Uint8Array(4096)]);
  ok('(a sheet of a plan over the internet is a slice that is no Blob: the one encodePageSource reads whole)',
    !(remote.slice(0, 10) instanceof Blob) && remote.slice(0, 10).size === 10);
  eq('the bytes a save would bring down whole: every remote sheet and revision sheet, nothing on the device or in memory',
    remoteSaveBytes([sheet(0, 700 * MB), sheet(700 * MB, 1400 * MB), { kind: 'slice', data: onDevice }, { kind: 'png', data: new Uint8Array(9) }],
      [[sheet(1400 * MB, 1500 * MB)], [], [{ kind: 'slice', data: onDevice.slice(0, 100) }]]), 1500 * MB);
  eq('… a plan on the device: none', remoteSaveBytes([{ kind: 'slice', data: onDevice }], [[{ kind: 'slice', data: onDevice }]]), 0);
  eq('… nothing to count: none', [remoteSaveBytes(), remoteSaveBytes(null, null), remoteSaveBytes([null, {}, { kind: 'slice' }], [null])], [0, 0, 0]);
  eq('the cap: 300 MB', REMOTE_SAVE_CAP_BYTES, 300 * MB);
  eq('refused on a phone or a tablet over the cap only — never on a computer, never at or under it',
    [remoteSaveRefused({ handheld: true, remoteBytes: 2300 * MB }), remoteSaveRefused({ handheld: true, remoteBytes: REMOTE_SAVE_CAP_BYTES + 1 }),
      remoteSaveRefused({ handheld: true, remoteBytes: REMOTE_SAVE_CAP_BYTES }), remoteSaveRefused({ handheld: true, remoteBytes: 0 }),
      remoteSaveRefused({ handheld: false, remoteBytes: 2300 * MB }), remoteSaveRefused({ remoteBytes: 2300 * MB })],
    [true, true, false, false, false, false]);
  // the words at open: never a promise of a file that cannot come
  const big = handheldSaveWords({ remoteBytes: 2300 * MB, device: 'iPad' });
  eq('what Save does, for a plan that is not refused: HANDHELD_SAVE, as ever',
    [handheldSaveWords({ remoteBytes: 100 * MB, device: 'iPad' }), handheldSaveWords({ remoteBytes: 2300 * MB, handheld: false })], [HANDHELD_SAVE, HANDHELD_SAVE]);
  ok('… for a refused one: that it cannot make a file here, why, and that it keeps the changes — no share sheet, no download promised',
    big === remoteSaveWords({ remoteBytes: 2300 * MB, device: 'iPad' }) && /^Save cannot make a file of this plan on this iPad/.test(big)
    && /opened over the internet/.test(big) && /2300 MB/.test(big) && /memory/.test(big) && /keeps your changes on this iPad/.test(big)
    && !/share sheet|download|new file/i.test(big));
  // the words when Save refuses
  const w = o => remoteSaveRefusedWords({ name: 'A000T1 - Big.takeoff', remoteBytes: 2300 * MB, device: 'iPad', ...o });
  const inPortal = w({ embedded: true, keptIn: 'A000T1 - Big.takeoff', dirty: true });
  ok('refused inside the portal: not saved, why, the work kept and where it comes back, and the way to save it',
    /^Not saved: A000T1 - Big\.takeoff was opened over the internet, and Save cannot make a file of it on this iPad/.test(inPortal)
    && /2300 MB of its drawings would have to come into the iPad's memory at once, which closes the app\./.test(inPortal)
    && /Your changes are kept on this iPad: opening A000T1 - Big\.takeoff again offers them back\./.test(inPortal)
    && /free some room on this iPad \(the portal's Plans Library can remove plans you no longer need\), open the plan again from 📐 so the portal keeps it on this iPad, choose “Restore it” when it offers your changes, then Save\.$/.test(inPortal));
  const inTab = w({ embedded: false, keptIn: 'A000T1 - Big.takeoff', dirty: true });
  ok('… in a tab of its own: a copy on the device from the Files app, never the portal\'s 📐 here',
    /open the plan from a copy on this iPad instead — pick it in the Files app \(the OneDrive app's files\), choose “Restore it” if it offers your changes — then Save\.$/.test(inTab)
    && !/📐/.test(inTab));
  ok('… with no unsaved changes: nothing is lost, and no restoring', /There were no unsaved changes, so nothing is lost\./.test(w({ embedded: true, dirty: false }))
    && !/Restore it/.test(w({ embedded: true, dirty: false })) && !/Restore it/.test(w({ embedded: false, dirty: false })));
  ok('… with no file to bring the work back from: never said to be kept — keep the page open',
    /Your changes are still here, in this page only: keep it open\.$/.test(w({ embedded: true, dirty: true, keptIn: '' }))
    && !/kept on this|Restore it/.test(w({ embedded: true, dirty: true, keptIn: '' })));
}

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
eq('it came at once, nothing open: open', lateArrival({ epochAtPick: 3, epochNow: 3, changesAtPick: 5, changesNow: 5 }), 'open');
eq('something else was opened meanwhile: ignored, whatever else', [
  lateArrival({ epochAtPick: 3, epochNow: 4 }),
  lateArrival({ epochAtPick: 3, epochNow: 4, dirtyNow: true, changesAtPick: 1, changesNow: 9 }),
], ['ignore', 'ignore']);
eq('work started on the open project while it came: ask first', lateArrival({ epochAtPick: 3, epochNow: 3, changesAtPick: 5, changesNow: 6, dirtyNow: true }), 'ask');
eq('already said "discard", nothing done since: open', lateArrival({ epochAtPick: 3, epochNow: 3, changesAtPick: 5, changesNow: 5, dirtyNow: true }), 'open');
// Review fix: the decision is what was done since the pick, not a timer that a missing focus event never starts.
eq('already said "discard", then ten minutes of work while it came — with no focus event, no "slow": ask again',
  lateArrival({ epochAtPick: 3, epochNow: 3, changesAtPick: 5, changesNow: 41, dirtyNow: true }), 'ask');
eq('… even one edit in the first seconds: ask again', lateArrival({ epochAtPick: 3, epochNow: 3, changesAtPick: 5, changesNow: 6, dirtyNow: true }), 'ask');
eq('a long wait with nothing unsaved: open', lateArrival({ epochAtPick: 3, epochNow: 3, changesAtPick: 5, changesNow: 5 }), 'open');
eq('counts not known and unsaved work there: asked about', lateArrival({ epochAtPick: 3, epochNow: 3, dirtyNow: true }), 'ask');
eq('a PDF\'s check (only the epoch): open', lateArrival({ epochAtPick: 3, epochNow: 3 }), 'open');
ok('the waiting words say it opens when it arrives', /opens when it arrives/.test(STILL_COMING) && /OneDrive/.test(STILL_COMING));

// ── a save handed back to the portal (inside it: C2) ─────────────────────
{
  const hold = { name: 'A000T1 Made up plan.takeoff', portal: true };
  const portal = { canSave: true, hold, kind: 'file' };
  ok('the portal said it takes a save of this plan, and it is the one open: to the portal', savesToPortal({ portal, libraryCopy: hold }));
  eq('… not a Save As (a new file, as on any phone)', savesToPortal({ portal, libraryCopy: hold, saveAs: true }), false);
  eq('… not once another project is open (its copy is not what is open now)', savesToPortal({ portal, libraryCopy: { portal: true } }), false);
  eq('… not after New Project (no copy open)', savesToPortal({ portal, libraryCopy: null }), false);
  eq('… not without the portal\'s say-so', savesToPortal({ portal: { ...portal, canSave: false }, libraryCopy: hold }), false);
  eq('… not for a "true" that is not true', savesToPortal({ portal: { ...portal, canSave: 'true' }, libraryCopy: hold }), false);
  eq('… not for a plan opened over the internet (no copy, no hold)', savesToPortal({ portal: { canSave: false, hold: null, kind: 'link' }, libraryCopy: null }), false);
  eq('… not with no portal at all', savesToPortal({ libraryCopy: hold }), false);
}
{
  const kept = afterSave('kept', { name: 'A000T1 Made up plan.takeoff', device: 'iPad', keptIn: 'A000T1 Made up plan.takeoff' });
  eq('kept: saved, the draft goes, confirmed, nothing to tell', [kept.markSaved, kept.dropDraft, kept.confirmed, kept.tell], [true, true, true, false]);
  eq('… and the words (C2)', kept.status, 'Saved on this iPad — the portal sends it to OneDrive.');
  eq('… on an iPhone it says so', afterSave('kept', { device: 'iPhone' }).status, 'Saved on this iPhone — the portal sends it to OneDrive.');
  const not = why => afterSave('not-kept', { why, keptIn: 'A000T1 Made up plan.takeoff', device: 'iPad' });
  for (const why of ['refused', 'no-room', 'failed', 'timeout', 'gone', 'not-sent', '']) {
    const n = not(why);
    eq(`not kept (${why || 'no reason'}): NOT saved, the draft stays, it is told, nothing confirmed`, [n.markSaved, n.dropDraft, n.tell, n.confirmed], [false, false, true, false]);
    if (why === 'refused') continue;               // its own words: below (contract addendum 3 D7)
    ok(`… (${why || 'no reason'}) it says nothing reached the portal or OneDrive, that the work is kept, and what to do`,
      /^Not saved to the portal or OneDrive\./.test(n.status) && /kept on this device: opening A000T1 Made up plan\.takeoff again offers them back/.test(n.status)
      && /Save again, or save a copy to Files\./.test(n.status));
  }
  // Contract addendum 3 D7 (the re-check's LW-1 problem): the portal refuses a save when another window or tab of the
  // plan has a save waiting there, and reopening then hands THAT save, at another size, so the promise "opening it
  // again offers them back" was false. The refusal says the contract's words, with no promise, the draft kept.
  {
    const WHY = 'This plan has a save from another window or tab on this iPad that is not in OneDrive yet.';
    const r = afterSave('not-kept', { why: 'refused', portalWhy: WHY, keptIn: 'A000T1 Made up plan.takeoff', dirty: true, device: 'iPad' });
    eq('refused (D7): the contract\'s words exactly, the portal\'s why in them',
      r.status, 'Not saved: the portal did not take this save (This plan has a save from another window or tab on this iPad that is not '
        + 'in OneDrive yet). Your changes are still in this window - use Save a copy to Files to keep them.');
    eq('… not saved, the draft kept (never dropped), told in a dialog, nothing confirmed', [r.markSaved, r.dropDraft, r.tell, r.confirmed],
      [false, false, true, false]);
    ok('… and never a promise that reopening offers the changes back, even with a draft home',
      !/offers? (them|it) back|again offers|kept on this device|Restore/.test(r.status));
    eq('… the words are portalRefusedWords\'s', r.status, portalRefusedWords({ portalWhy: WHY, dirty: true }));
    eq('refused with no words of the portal\'s: no brackets', afterSave('not-kept', { why: 'refused', keptIn: 'A.takeoff' }).status,
      'Not saved: the portal did not take this save. Your changes are still in this window - use Save a copy to Files to keep them.');
    eq('… nothing was unsaved: nothing is lost', afterSave('not-kept', { why: 'refused', portalWhy: 'Not allowed.', dirty: false }).status,
      'Not saved: the portal did not take this save (Not allowed). There were no unsaved changes, so nothing is lost.');
    eq('… no draft home: the same words (the window is the place either way)', afterSave('not-kept', { why: 'refused', keptIn: '' }).status,
      portalRefusedWords({}));
  }
  ok('no room: says the device is full, and what frees room', /no room for the portal to keep the save/.test(not('no-room').status) && /Plans Library can remove/.test(not('no-room').status));
  ok('failed with no words: says it gave none', /could not keep the save: it did not say why\./.test(not('failed').status));
  ok('failed: the portal\'s own words', /could not keep the save: The copy did not check out\./.test(
    afterSave('not-kept', { why: 'failed', portalWhy: 'The copy did not check out.' }).status));
  ok('timeout: the two minutes', /did not answer within 2 minutes/.test(not('timeout').status));
  ok('gone: the portal page closed', /has closed/.test(not('gone').status));
  ok('no draft home (sheets added since it opened): never "kept", the page is the only place',
    /in this page only: keep it open/.test(afterSave('not-kept', { why: 'failed', keptIn: '' }).status)
    && !/kept on this device/.test(afterSave('not-kept', { why: 'failed', keptIn: '' }).status));
  ok('nothing unsaved: nothing is lost', /no unsaved changes, so nothing is lost/.test(afterSave('not-kept', { why: 'timeout', dirty: false }).status));
  // edited while the portal was keeping it, or another project opened meanwhile: P1's rules, for 'kept' too
  const edited = afterSave('kept', { device: 'iPad', moved: 'edited' });
  eq('kept, but edited while it was on its way: not marked saved, the draft stays, the file is one', [edited.markSaved, edited.dropDraft, edited.confirmed],
    [false, false, true]);
  ok('… and says the later changes are not in it', /^Saved on this iPad — the portal sends it to OneDrive — but changes made while it was being saved are not in it/.test(edited.status));
  const replaced = afterSave('kept', { device: 'iPad', moved: 'replaced' });
  eq('kept, but another project opened meanwhile: that project\'s draft goes, the open one is untouched',
    [replaced.markSaved, replaced.dropDraft, replaced.confirmed], [false, true, true]);
  eq('not kept and edited: still nothing saved, nothing dropped', [afterSave('not-kept', { why: 'refused', moved: 'edited' }).markSaved,
    afterSave('not-kept', { why: 'refused', moved: 'edited' }).dropDraft], [false, false]);
}
{
  eq('news: sending, how far', portalNewsWords({ state: 'sending', pct: 45 }, { name: 'A.takeoff', device: 'iPad' }),
    'The portal is sending A.takeoff to OneDrive — 45%. It is saved on this iPad.');
  eq('news: sending, no number', portalNewsWords({ state: 'sending', pct: null }, { name: 'A.takeoff', device: 'iPad' }),
    'The portal is sending A.takeoff to OneDrive. It is saved on this iPad.');
  eq('news: sent', portalNewsWords({ state: 'sent' }, { name: 'A.takeoff' }), 'The portal sent A.takeoff to OneDrive.');
  ok('news: a separate file, named, nothing overwritten (C3\'s words)', /saved as “A - iPad 2026-11-04 1415\.takeoff” next to it — nothing was overwritten/.test(
    portalNewsWords({ state: 'copy', name: 'A - iPad 2026-11-04 1415.takeoff' }, { device: 'iPad' })));
  ok('… with no name: a separate file', /saved as a separate file next to it/.test(portalNewsWords({ state: 'copy', name: '' })));
  ok('news: a send that failed after kept says it is still saved here', /could not send A\.takeoff to OneDrive yet: no signal\. It is saved on this iPad/.test(
    portalNewsWords({ state: 'failed', why: 'no signal.' }, { name: 'A.takeoff', device: 'iPad' })));
  eq('news: anything else says nothing', [portalNewsWords({ state: 'kept' }), portalNewsWords(null)], ['', '']);
}

// A save end to end, out of the same pieces main.js puts together — a made-up
// portal and clock, a real Project and its change count, the drafts as a set:
// compose, hand over, wait, judge (savedStill), conclude (afterSave), apply.
function fakeClock() {
  let now = 0, id = 0;
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
  };
}
const NONCE = 'Zk3pQ9_x-7LmN2aBcD4e';
const PLAN_NAME = 'A000T1 Made up plan.takeoff';
async function portalSave({ answer = 'kept', why = '', editWhileWaiting = false, openAnother = false } = {}) {
  const project = new Project();
  project.markDirty();                                   // an hour of takeoff, not saved
  const drafts = new Set([`${PLAN_NAME}|4321`]);         // written before the save (saveDraftNow)
  let epoch = 1;
  const epochAtSave = epoch;
  const changesAtCompose = project.changeCount;
  const file = new Blob([new Uint8Array(4321)]);
  const c = fakeClock();
  const win = { closed: false };
  const handlers = new Set();
  const posted = [];
  const peer = { via: 'frame', win, origin: 'https://portal.dcrframing.com' };
  const waiting = askPortalToKeep({ peer, nonce: NONCE, req: 's123', name: PLAN_NAME, size: file.size, file }, {
    ...c, waitMs: SAVE_WAIT_MS, pollMs: 2000,
    listen: fn => { handlers.add(fn); return () => handlers.delete(fn); },
    post: (w, msg, origin) => posted.push({ w, msg, origin }),
    peerGone: () => win.closed,
  });
  if (editWhileWaiting) project.markDirty();             // a keyboard undo works under the bar
  if (openAnother) epoch += 1;
  if (answer === 'timeout') c.advance(SAVE_WAIT_MS);
  else if (answer === 'gone') { win.closed = true; c.advance(2000); }
  else for (const h of [...handlers]) h({ source: win, origin: peer.origin, data: { type: 'ptt-save-state', v: 1, nonce: NONCE, req: 's123', state: answer, why } });
  const { ending, why: portalWhy } = await waiting;
  const outcome = ending === 'kept' ? 'kept' : 'not-kept';
  const moved = savedStill({ epochAtSave, epochNow: epoch, changesAtCompose, changesNow: project.changeCount });
  const next = afterSave(outcome, {
    name: PLAN_NAME, why: ending, portalWhy, keptIn: PLAN_NAME, dirty: true, device: 'iPad', moved: moved === 'same' ? '' : moved,
  });
  if (moved !== 'replaced' && next.markSaved) project.markSaved();
  if (next.dropDraft) drafts.clear();
  return { posted: posted.length, dirty: project.dirty, drafts: drafts.size, status: next.status, tell: next.tell };
}
{
  const k = await portalSave({ answer: 'kept' });
  eq('end to end — kept: posted once, the project saved, its draft dropped', [k.posted, k.dirty, k.drafts, k.tell], [1, false, 0, false]);
  for (const [answer, why] of [['refused', 'Not allowed.'], ['no-room', ''], ['failed', 'The copy did not check out.'], ['timeout', ''], ['gone', '']]) {
    const r = await portalSave({ answer, why });
    eq(`end to end — ${answer}: the project stays unsaved, the draft stays, and it is told`, [r.dirty, r.drafts, r.tell], [true, 1, true]);
    if (answer === 'refused') {
      eq('end to end — refused: the contract\'s words (D7), the portal\'s why in them, no promise of a reopen offer', r.status,
        'Not saved: the portal did not take this save (Not allowed). Your changes are still in this window - use Save a copy to Files to keep them.');
    }
  }
  const e = await portalSave({ answer: 'kept', editWhileWaiting: true });
  eq('end to end — kept, but edited while waiting: still unsaved, the draft stays', [e.dirty, e.drafts], [true, 1]);
  ok('… and it says so', /changes made while it was being saved are not in it/.test(e.status));
  const o = await portalSave({ answer: 'kept', openAnother: true });
  eq('end to end — kept, but another project opened meanwhile: the saved one\'s draft goes, the open one is not marked', [o.drafts, o.dirty], [0, true]);
}

// A LATE "kept": no answer within the 2 minutes (told "not saved", the draft kept), then the portal's "kept" — saved
// then only if nothing was done since the file was composed, and only for the latest save handed over.
eq('afterLateKept — nothing done since: saved now, the drafts go, the kept file a home, its news still heard',
  afterLateKept({ moved: 'same', device: 'iPad' }),
  { markSaved: true, dropDraft: true, home: true, listen: true,
    status: 'The portal kept the save after all: saved on this iPad — the portal sends it to OneDrive.' });
{
  const e = afterLateKept({ moved: 'edited', device: 'iPad' });
  eq('afterLateKept — work done since: still unsaved, the drafts stay, the kept file a home of them', [e.markSaved, e.dropDraft, e.home, e.listen],
    [false, false, true, true]);
  ok('… and it says the later work is not in it, and to save again', /changes made since you tapped Save are not in it/.test(e.status) && /use Save again/.test(e.status));
}
eq('afterLateKept — another project open now (or anything else): nothing at all, nothing more heard',
  [afterLateKept({ moved: 'replaced' }), afterLateKept({})],
  [{ markSaved: false, dropDraft: false, home: false, listen: false, status: '' }, { markSaved: false, dropDraft: false, home: false, listen: false, status: '' }]);
async function lateSave({ late = 'kept', editAfter = false, openAnother = false, nextSave = false } = {}) {
  const project = new Project();
  project.markDirty();
  const drafts = new Set([`${PLAN_NAME}|4000`]);
  let epoch = 1;
  const epochAtSave = epoch;
  const changesAtCompose = project.changeCount;
  const file = new Blob([new Uint8Array(4321)]);
  const c = fakeClock();
  const win = { closed: false };
  const handlers = new Set();
  const peer = { via: 'frame', win, origin: 'https://portal.dcrframing.com' };
  const say = (state, req = 's123') => {
    for (const h of [...handlers]) h({ source: win, origin: peer.origin, data: { type: 'ptt-save-state', v: 1, nonce: NONCE, req, state } });
  };
  const waiting = askPortalToKeep({ peer, nonce: NONCE, req: 's123', name: PLAN_NAME, size: file.size, file }, {
    ...c, waitMs: SAVE_WAIT_MS, pollMs: 2000, doc: null,
    listen: fn => { handlers.add(fn); return () => handlers.delete(fn); },
    post: () => {},
    peerGone: () => win.closed,
  });
  c.advance(SAVE_WAIT_MS);
  const r = await waiting;
  const first = afterSave('not-kept', { why: r.ending, keptIn: PLAN_NAME, dirty: true, device: 'iPad' });
  if (editAfter) project.markDirty();                    // carried on after "not saved"
  if (openAnother) epoch += 1;
  if (nextSave) r.stop();                                // handToPortal: the next save is handed over first
  say(late);
  const word = await Promise.race([r.late, new Promise(res => setImmediate(() => res('nothing')))]);
  let homes = [{ name: PLAN_NAME, size: 4000, pages: 3 }];
  let status = first.status;
  if (word && word.state === 'kept') {
    const moved = savedStill({ epochAtSave, epochNow: epoch, changesAtCompose, changesNow: project.changeCount });
    const next = afterLateKept({ moved, device: 'iPad' });
    if (!next.listen) r.stop();
    if (next.home) homes = nextDraftHomes(homes, { name: PLAN_NAME, size: file.size, pages: 3 });
    if (next.markSaved) project.markSaved();
    if (next.dropDraft) drafts.clear();
    if (next.status) status = next.status;
  }
  return { ending: r.ending, firstSaved: first.markSaved, word, dirty: project.dirty, drafts: drafts.size, homes: homes.map(h => h.size),
    status, listening: handlers.size };
}
{
  const s = await lateSave();
  eq('late kept, nothing done since: the wait had timed out ("not saved"), then saved, the draft gone, the kept file a home',
    [s.ending, s.firstSaved, s.word, s.dirty, s.drafts, s.homes], ['timeout', false, { state: 'kept', why: '' }, false, 0, [4000, 4321]]);
  ok('… said on the status line', /^The portal kept the save after all: saved on this iPad/.test(s.status));
  eq('… and the news of its send still heard', s.listening, 1);
  const e = await lateSave({ editAfter: true });
  eq('late kept after more work: still unsaved, the draft kept — and kept under the kept file too', [e.dirty, e.drafts, e.homes, e.listening],
    [true, 1, [4000, 4321], 1]);
  ok('… said so', /not in it/.test(e.status));
  const o = await lateSave({ openAnother: true });
  eq('late kept with another project open: nothing changes, nothing is said, nothing more heard', [o.drafts, o.homes, o.listening, /^Not saved/.test(o.status)],
    [1, [4000], 0, true]);
  const n = await lateSave({ nextSave: true });
  eq('late kept for an OLDER save (the next one already handed over): never heard, nothing marked', [n.word, n.dirty, n.drafts, n.listening],
    [null, true, 1, 0]);
  const f = await lateSave({ late: 'refused' });
  eq('a late refusal: nothing new — unsaved, the draft kept, nothing listening', [f.word && f.word.state, f.dirty, f.drafts, f.listening],
    ['refused', true, 1, 0]);
  const k = await lateSave({ late: 'keeping' });
  eq('a "keeping" after the wait ran out is no answer: nothing changes, still listening for one', [k.word, k.dirty, k.drafts, k.listening],
    ['nothing', true, 1, 1]);
}

// A file-kind plan is composed without reading a sheet: every untouched sheet
// (and revision sheet) is a slice of the portal's own File, passed through.
{
  let reads = 0;
  class NoRead extends Blob {
    arrayBuffer() { reads += 1; return Promise.reject(new Error('read')); }
    text() { reads += 1; return Promise.reject(new Error('read')); }
    stream() { reads += 1; throw new Error('read'); }
    bytes() { reads += 1; return Promise.reject(new Error('read')); }
  }
  const sheet = n => ({ kind: 'slice', data: new NoRead([new Uint8Array(n)]) });
  const pageSources = [sheet(3000), sheet(5000), sheet(7000)];
  const revisionSources = [[{ kind: 'slice', data: new NoRead([new Uint8Array(2000)]) }]];
  const blob = await writeProject({ metadata: { project_name: 'Made up' }, pageSources, revisionSources });
  eq('composing a file-kind plan reads no sheet (slices pass through)', reads, 0);
  ok('… and the file holds every sheet\'s bytes', blob.size > 3000 + 5000 + 7000 + 2000);
}

// ── js/main.js, read as text ─────────────────────────────────────────────
const main = readFileSync(path.join(APP, 'js', 'main.js'), 'utf8');
const body = (name) => {
  const at = main.indexOf(`function ${name}(`);
  if (at < 0) return '';
  const next = main.slice(at + 10).search(/\n(?:async )?function /);
  return next < 0 ? main.slice(at) : main.slice(at, at + 10 + next);
};
const guard = body('saveProject');
const save = body('saveProjectOnce');
ok('saveProject is there to read', save.length > 1000);
ok('one save at a time: a second tap while one is on its way is told, not started',
  /if \(saving\) \{[^}]*setStatus\([^}]*return;/.test(guard) && /saving = true;[\s\S]*saveProjectOnce\(opts\)[\s\S]*finally \{\s*saving = false;/.test(guard));
const draftAt = save.indexOf('Promise.race([saveDraftNow()');
ok('saveProjectOnce writes the draft BEFORE composing the file', draftAt > 0 && draftAt < save.indexOf('await writeProject('));
ok('… with the bar up first, and a time limit on the draft store',
  save.indexOf("showProgress('Saving…'") >= 0 && save.indexOf("showProgress('Saving…'") < draftAt
  && /Promise\.race\(\[saveDraftNow\(\), new Promise\(r => setTimeout\(\(\) => r\(false\), \d+\)\)\]\)/.test(save));
ok('… the count is taken just before the file is composed', save.indexOf('const changesAtCompose = app.project.changeCount') > 0
  && save.indexOf('const changesAtCompose = app.project.changeCount') < save.indexOf('await writeProject('));
ok('… and judged with the epoch afterwards (savedStill)', /savedStill\(\{\s*epochAtSave, epochNow: openEpoch, changesAtCompose, changesNow: app\.project\.changeCount/.test(save));
ok('… and marks saved only when afterSave says so, and only the project that was saved',
  (save.match(/app\.project\.markSaved\(\)/g) || []).length === 1
  && /if \(moved !== 'replaced'\) \{[\s\S]*if \(next\.markSaved\) \{\s*app\.project\.markSaved\(\)/.test(save));
ok('… and drops only the saved project\'s drafts, and only when afterSave says so',
  /if \(next\.dropDraft\) \{[\s\S]*new Set\(draftBefore\)[\s\S]*if \(moved === 'same'\)[\s\S]*dropDraft\(k\)/.test(save)
  && (save.match(/dropDraft\(/g) || []).length === 1);
ok('… and records the saved file as a home for later drafts, on a confirmed save', /if \(next\.confirmed\) \{[\s\S]*nextDraftHomes\(app\.draftHomes, \{ name: savedName, size: blob\.size/.test(save));
ok('… a handle write into another project opened meanwhile changes nothing of it', /if \(openEpoch === epochAtSave\) \{\s*app\.fileHandle = handle;/.test(save));
ok('… and shows an unconfirmed download in a dialog, once', /if \(next\.tell && !asked\) await D\.alertDialog\(/.test(save));
ok('the old unconditional "downloaded" is gone', !/return 'downloaded'/.test(main) && !/function downloadBlob\(/.test(main));
ok('the draft is written under every home\'s key, all at once', /Promise\.all\(draftKeysNow\(\)\.map\(key => putDraft\(key, work, info\)\)\)/.test(body('saveDraftNow')) && !/currentDraftKey/.test(main));
const deliver = body('deliverBlob');
ok('the bar is up while the share sheet reads the file, and down for a dialog',
  /const share = \(\) => \{\s*showProgress\(/.test(deliver) && /ask: \([^)]*\) => \{\s*hideProgress\(\);/.test(deliver));
const ask = body('askFileReady');
ok('"Your file is ready" calls share() inside its Save tap, before the dialog closes',
  /const shareNow = \(\) => \{[\s\S]*?share\(\)[\s\S]*?close\(/.test(ask) && /D\.button\('Save', 'primary', shareNow\)/.test(ask));
ok('… and a home-screen app\'s big download offers the share sheet the same way', /D\.button\('Try the share sheet', '', shareNow\)/.test(ask));
ok('… the dialogs say what replacing a file does, and no longer suggest "beside the plan it came from"',
  /REPLACE_WARNING/.test(ask) && !/beside the plan it came from/.test(main));
ok('the handheld words come from HANDHELD_SAVE, with no cap written out by hand',
  /handheld\s*\?\s*`Open a \.takeoff project, or start from a PDF\.  ·  \$\{HANDHELD_SAVE\}`/.test(main)
  && /\$\{HANDHELD_SAVE\} The portal's copy is not changed\./.test(main) && !/150 MB/.test(main));
const archiveUi = readFileSync(path.join(APP, 'js', 'ui', 'plans-archive.js'), 'utf8');
ok('… the Plans Archive note on a phone too', /\$\{HANDHELD_SAVE\} \$\{REPLACE_WARNING\}/.test(archiveUi) && !/150 MB/.test(archiveUi)
  && !/new file through '\s*\+\s*'the share sheet: choose Save to Files/.test(archiveUi));
const open = body('openProjectFile');
ok('a late file is judged by what was done since the pick, and the work is drafted before it is replaced',
  /const changesAtPick = app\.project\.changeCount/.test(open) && /changesAtPick, changesNow: app\.project\.changeCount/.test(open)
  && /if \(app\.project\.dirty\) await saveDraftNow\(\);/.test(open) && !/\bslow\b/.test(open));
const picker = body('pickFileFallback');
ok('the picker settles on change and on cancel', /addEventListener\('change'/.test(picker) && /addEventListener\('cancel'/.test(picker));
{
  const deadline = picker.slice(picker.indexOf('Date.now() >= deadline'), picker.indexOf('setTimeout(tick, 250)'));
  ok('… and the focus deadline no longer settles it to nothing', deadline.length > 0 && !/done\(/.test(deadline) && /onSlow/.test(deadline));
}
ok('… the wait is said when the page is touched again too, not only on a focus event',
  /addEventListener\('pointerdown', onBack/.test(picker) && /addEventListener\('focus', onBack/.test(picker));
ok('a newer pick settles an older one still waiting', /currentPick\.abandon\(\)/.test(picker));
// The portal route (C2), in main.js.
{
  const toAt = save.indexOf('const toPortal = savesToPortal({ portal: app.portal, libraryCopy: app.libraryCopy, saveAs });');
  ok('saveProjectOnce decides the portal route before any picker, and a portal save opens none',
    toAt > 0 && toAt < save.indexOf('if (!toPortal && (saveAs || !handle)) {'));
  const branch = save.slice(save.indexOf('} else if (toPortal) {'), save.indexOf('// The file leaves as a new one'));
  ok('… composed like any save (the draft first, then writeProject), then handed to the portal under the opened plan\'s name',
    save.indexOf('} else if (toPortal) {') > save.indexOf('await writeProject(') && /savedName = app\.portal\.name;/.test(branch)
    && /await handToPortal\(blob, savedName[,)]/.test(branch));
  ok('… anything but kept: the bar down, the words said, and a copy to Files offered',
    /if \(outcome !== 'kept'\) \{\s*hideProgress\(\);[\s\S]*afterSave\('not-kept'[\s\S]*await offerCopyToFiles\(blob, copyName, words/.test(branch));
  ok('… a copy, if taken, is judged as any phone\'s save; none taken, the dialog has said it', /\(\{ outcome, why, asked = false \} = copy\)/.test(branch)
    && /asked = true;/.test(branch));
  const hand = body('handToPortal');
  ok('handToPortal waits for askPortalToKeep, 120 s, with "Saving to the portal…" up and the update reload held',
    /showPortalSaving\(name\);\s*portalSaving = true;/.test(hand) && /portalSaving = true;[\s\S]*await askPortalToKeep\([\s\S]*waitMs: SAVE_WAIT_MS[\s\S]*finally \{\s*portalSaving = false;/.test(hand)
    && /showProgress\(known \? `Saving to the portal… \$\{pct\}%` : 'Saving to the portal…', 0, 1, name\);/.test(body('showPortalSaving')));
  ok('… a fresh req for every save, the peer and nonce kept on app.portal', /req: newSaveReq\(\)/.test(hand) && /peer: p\.peer, nonce: p\.nonce/.test(hand));
  {
    const at = hand.indexOf('app.draftHomes = nextDraftHomes(app.draftHomes, { name, size: file.size, pages }, { pending: true });');
    ok('… the file posted is a pending home of the drafts BEFORE it is posted, for the project the save is for (review LW-5)',
      at > 0 && at < hand.indexOf('await askPortalToKeep(')
      && /if \(epoch === openEpoch\) \{\s*app\.draftHomes = nextDraftHomes\(app\.draftHomes, \{ name, size: file\.size, pages \}, \{ pending: true \}\);\s*\}/.test(hand));
  }
  ok('… the news of the send only on the status line', /onNews: news => \{[\s\S]*portalNewsWords\(news[\s\S]*setStatus\(words\)/.test(hand));
  ok('… and only kept is a save', /if \(ending === 'kept'\) \{[\s\S]*return \{ outcome: 'kept', why: '', portalWhy: '', late: null \}/.test(hand)
    && /if \(ending !== 'timeout'\) return \{ outcome: 'not-kept', why: ending, portalWhy: why, late: null \};/.test(hand)
    && /return \{ outcome: 'not-kept', why: ending, portalWhy: why, late: \{ answer: late, stop, after, name, size: file\.size \} \};/.test(hand));
  // The heartbeat (C2 v1, optional): "keeping" with how far goes on the bar, and on the bar only.
  ok('… the portal\'s "keeping" shows how far on the bar while it waits, and is never a status line',
    /if \(news\.state === 'keeping'\) \{\s*if \(portalSaving\) showPortalSaving\(name, news\.pct\);\s*return;\s*\}/.test(hand)
    && hand.indexOf("news.state === 'keeping'") < hand.indexOf('portalNewsWords(news'));
  // A late 'kept': heard until the next save is handed over, judged when all else is said.
  ok('… a timed-out save is still heard — until the next save is handed over, which stops it first',
    /if \(ending !== 'timeout'\)[\s\S]*portalNewsStop = stop;\s*return \{ outcome: 'not-kept'/.test(hand)
    && /^function handToPortal[^\n]*\n\s*const p = app\.portal;\s*if \(portalNewsStop\) \{ portalNewsStop\(\); portalNewsStop = null; \}/.test(hand));
  const offer = body('offerCopyToFiles');
  ok('"Save a copy to Files" starts the phone\'s save INSIDE its tap (the share sheet needs it)',
    /D\.button\(COPY_TO_FILES, 'primary', \(\) => close\(deliverBlob\(blob, name, \{ bigWords \}\)\)\)/.test(offer));
  ok('an update never reloads the page under a save the portal is keeping', /!portalWaiting && !portalSaving/.test(body('reloadForUpdateIfIdle')));
  const recv = body('receiveFromPortal');
  ok('the hand-over talks to the peer (the opener, or the same-site parent) and only hears it',
    /const peer = portalPeer\(window\);/.test(recv) && /if \(!fromPeer\(ev, peer\)\) return;/.test(recv) && /for \(const origin of peerTargets\(peer\)\)/.test(recv));
  ok('… the peer pinned to the plan\'s address, kept on app.portal with the nonce, for both kinds',
    /const pinned = \{ \.\.\.peer, origin \};/.test(recv)
    && /app\.portal = \{ peer: pinned, nonce, kind: 'file', name: plan\.name, canSave: !!plan\.canSave, hold, epoch: openEpoch \};/.test(recv)
    && /app\.portal = \{ peer: pinned, nonce, kind: 'link', name: plan\.name, canSave: false, hold: null, epoch: openEpoch \};/.test(recv));
  ok('… a fresh link and "offline" go to that peer too', /portalRenewer\(pinned, nonce\)/.test(recv) && /tellPortalOffline\(pinned, nonce\)/.test(recv)
    && /if \(!fromPeer\(ev, peer\)\) return;/.test(body('portalRenewer')));
  ok('main.js never reaches for window.opener itself, and never posts to "*"', !/window\.opener/.test(main) && !/postMessage\([^)]*['"]\*['"]/.test(main));
  ok('a plan over the internet inside the portal is told how its work may reach OneDrive — inside the portal only (review fix)',
    /else if \(!toPortal && embedded && moved === 'same' && portalLinkOpen\(\)\) words \+= ` \$\{TO_ONEDRIVE_HINT\}`/.test(save)
    && /if \(embedded\) \{\s*const remoteBytes = remoteSaveBytes\(app\.pages\.saveSources\(\), app\.pages\.saveRevisionSources\(\)\);\s*setStatus\(`Opened \$\{plan\.name\} from OneDrive, over the internet\. \$\{noSaveBackWords\(\{ remoteBytes, device, handheld \}\)\}`\);/.test(recv)
    && !/handheld\)? ?setStatus\(`Opened \$\{plan\.name\} from OneDrive/.test(recv) && !/NO_SAVE_BACK/.test(main));
  // Review MEM-1: a big plan opened over the internet on a phone or a tablet is never composed for Save.
  {
    const refuse = body('refuseBigRemoteSave');
    ok('Save asks refuseBigRemoteSave first — before any picker, any draft or bar, and before the file is composed',
      /if \(await refuseBigRemoteSave\(\)\) return;/.test(save)
      && save.indexOf('await refuseBigRemoteSave()') < save.indexOf("showProgress('Saving…'")
      && save.indexOf('await refuseBigRemoteSave()') < save.indexOf('await writeProject(')
      && save.indexOf('await refuseBigRemoteSave()') < save.indexOf('showSaveFilePicker'));
    ok('… which counts the sheets on the server, and refuses on a phone or a tablet over the cap only',
      /const remoteBytes = remoteSaveBytes\(app\.pages\.saveSources\(\), app\.pages\.saveRevisionSources\(\)\);\s*if \(!remoteSaveRefused\(\{ handheld, remoteBytes \}\)\) return false;/.test(refuse));
    ok('… keeps the draft (a few seconds at most), says why and what to do — on the status line and in a dialog — composes nothing',
      /const drafted = await Promise\.race\(\[saveDraftNow\(\), new Promise\(r => setTimeout\(\(\) => r\(false\), 4000\)\)\]\);/.test(refuse)
      && /remoteSaveRefusedWords\(\{\s*name: app\.fileName \|\| suggestedFileName\(\), remoteBytes, device, embedded, dirty,\s*keptIn: drafted \? draftHomeFor\(app\.draftHomes, app\.pages\.pageCount\) : '',\s*\}\);/.test(refuse)
      && /setStatus\(words\);\s*await D\.alertDialog\('Not saved', words\);\s*return true;/.test(refuse)
      && !/writeProject|markSaved|dropDraft|deliverBlob|handToPortal/.test(refuse));
  }
  // Review fix: a draft of a plan the portal handed over is never dropped by the file's date.
  const restore = body('offerDraftRestore');
  ok('offerDraftRestore judges a draft by draftFate, by the date only when the plan is not the portal\'s',
    /draftFate\(\{ savedAt: draft\.savedAt, fileModified: file\.lastModified, byDate: !portal \}\) === 'drop'/.test(restore)
    && !/draft\.savedAt <= file\.lastModified/.test(main));
  ok('… told so by loadProjectFile: inside the portal, or a plan it handed over',
    /async function loadProjectFile\(file, handle = null, \{ library = null, archive = null, fromPortal = false, plan = '' \} = \{\}\)/.test(main)
    && /await offerDraftRestore\(file, \{ portal: embedded \|\| fromPortal \}\);/.test(body('loadProjectFile')));
  ok('… and the hand-over says it for both kinds: a copy on the device and a link — with the portal\'s word for the plan (E4)',
    /loadProjectFile\(file, null, \{ library: hold, fromPortal: true, plan: plan\.plan \}\)/.test(recv)
    && /\}\), null, \{ fromPortal: true, plan: plan\.plan \}\);/.test(recv)
    && (recv.match(/loadProjectFile\(/g) || []).length === 2);
  ok('the plan\'s word (contract addendum 4 E4): kept with the file inside the portal only, before its draft is looked for; none for a new project',
    /app\.draftHomes = nextDraftHomes\(\[\], \{ name: file\.name, size: file\.size, pages: opened\.pageCount \}\);\s*app\.draftPlan = embedded \? draftPlan\(plan\) : '';/.test(body('loadProjectFile'))
    && body('loadProjectFile').indexOf('app.draftPlan = ') < body('loadProjectFile').indexOf('await offerDraftRestore(')
    && /app\.draftHomes = \[\];\s*app\.draftPlan = '';/.test(body('newProject'))
    && (main.match(/app\.draftPlan = /g) || []).length === 2);
  ok('… round 2\'s number tie is gone: a draft carries its sheets and its file\'s name, the plan is in its key',
    /return \{ pageCount: app\.pages\.pageCount, name: app\.fileName \|\| '' \};/.test(body('draftInfo'))
    && /const info = draftInfo\(\);[\s\S]*draftKeysNow\(\)\.map\(key => putDraft\(key, work, info\)\)/.test(body('saveDraftNow'))
    && /const info = draftInfo\(\);\s*for \(const key of draftKeysNow\(\)\) await putDraft\(key, work, info\);/.test(body('keepChangesAsDraft'))
    && (main.match(/putDraft\(/g) || []).length === 3 && (main.match(/const info = draftInfo\(\);/g) || []).length === 2
    && !/draftNumber|number: plan\.number \}\);/.test(main));
  ok('… the draft is found by findDraft (a copy\'s plan, a cut name, the person, the plan: tested above), from the drafts store',
    /const store = \{ get: getDraft, keys: listDraftKeys \};\s*const found = await findDraft\(\{ name: file\.name, size: file\.size, portal, who: app\.draftWho, embedded, plan: app\.draftPlan \},\s*store\);\s*if \(!found\) return;\s*const \{ key, draft, own, legacy, earlier \} = found;/.test(restore)
    && !/planOfPortalCopy|portalCopyDraftKey|draftKey\(/.test(restore));
  const askEarlier = body('askEarlierDraft');
  ok('… inside the portal only, an earlier version\'s draft (D7): never dropped by the date, asked in the contract\'s words, never as anyone\'s',
    /if \(!legacy && !earlier && draftFate\(/.test(restore)
    && /const answer = earlier\s*\?\s*await askEarlierDraft\(when\)\s*:\s*await D\.confirmDialog\(\s*'Unsaved work found',\s*`There is takeoff for/.test(restore)
    && /\{ okLabel: 'Restore it' \}\) \? 'restore' : 'discard';/.test(restore)
    && restore.indexOf('DRAFT_OF_ANYONE') > restore.indexOf('`There is takeoff for')
    && /body\.textContent = `\$\{earlierDraftWords\(when\)\}\\n\\n\$\{EARLIER_DRAFT_ASK\}`;/.test(askEarlier)
    && /title: 'Unsaved work found'/.test(askEarlier));
  ok('… three answers (the re-check of D7): Not now and a closed dialog leave it, only "Discard them" throws it away',
    /D\.button\('Not now', '', \(\) => close\('later'\)\),\s*D\.button\('Discard them', 'danger', \(\) => close\('discard'\)\),\s*D\.button\('Restore it', 'primary', \(\) => close\('restore'\)\),/.test(askEarlier)
    && /\.then\(v => \(v === 'restore' \|\| v === 'discard' \? v : 'later'\)\)/.test(askEarlier)
    && /if \(answer === 'later'\) return;/.test(restore)
    && restore.indexOf("if (answer === 'later') return;") < restore.indexOf('draftTwins(')
    && restore.indexOf("if (answer === 'later') return;") < restore.indexOf('dropDraft(k)'));
  ok('… the same work under the person\'s other files is looked for only after the answer, and goes with the one offered (own drafts too)',
    /const twins = legacy \? \[\] : await draftTwins\(found, store, app\.draftWho, app\.draftPlan\);\s*if \(answer !== 'restore'\) \{/.test(restore));
  ok('… a copy the portal made keeps the draft under its own keys once restored — and one of no person is left where it was; the file\'s own stays, its twins go',
    /if \(key === own\) for \(const k of twins\) await dropDraft\(k\);\s*else if \(await saveDraftNow\(\) && !legacy\) for \(const k of \[key, \.\.\.twins\]\) await dropDraft\(k\);/.test(restore));
  ok('… "no" drops the draft — never one of no person, which may be someone else\'s (review PRICE-4)',
    /if \(answer !== 'restore'\) \{\s*if \(!legacy\) for \(const k of \[key, \.\.\.twins\]\) await dropDraft\(k\);\s*return;\s*\}/.test(restore)
    && /if \(!legacy && (?:!earlier && )?draftFate\(/.test(restore)
    && (restore.match(/dropDraft\(/g) || []).length === 4
    && /\(legacy \? `\\n\\n\$\{DRAFT_OF_ANYONE\}` : ''\)/.test(restore));
  ok('the drafts are written under the person\'s word and the plan\'s, for every key (review PRICE-4, contract addendum 4 E4)',
    /homes\.map\(h => draftKey\(h\.name, h\.size, app\.draftWho, app\.draftPlan\)\)/.test(body('draftKeysNow'))
    && /\[draftKey\(app\.fileName \|\| suggestedFileName\(\), app\.fileSize \|\| 0, app\.draftWho, app\.draftPlan\)\]/.test(body('draftKeysNow'))
    && /putDraft\(draftKey\(app\.fileName, now\.size, app\.draftWho, app\.draftPlan\), work, info\)/.test(body('keepChangesAsDraft'))
    && (main.match(/draftKey\(/g) || []).length === 3);
  ok('… the word is the portal\'s, set inside the portal only, before the plan opens (either kind)',
    /if \(embedded\) app\.draftWho = plan\.who \|\| '';\s*if \(plan\.kind === 'file'\) \{/.test(recv)
    && (main.match(/app\.draftWho = /g) || []).length === 1);
  // Review fix: the portal's "copy" news makes the copy a home of the drafts.
  ok('the save tells handToPortal the sheets composed and the project it is for',
    /await handToPortal\(blob, savedName, \{ pages: pagesAtCompose, epoch: epochAtSave \}\)/.test(branch));
  ok('… whose "copy" news (with its name) makes the copy a home of the drafts',
    /if \(news\.state === 'copy' && news\.name\) \{\s*after\.copy = true;\s*followPortalCopy\(\{ name: news\.name, size: file\.size, pages, epoch \}\);/.test(hand));
  ok('saveProjectOnce takes the late answer from handToPortal, and judges it only after everything else is said, never awaited',
    /\(\{ outcome, why, portalWhy, late \} = await handToPortal\(blob, savedName/.test(branch)
    && /if \(late\) \{\s*void late\.answer\.then\(word => settleLateKept\(word, \{\s*\.\.\.late, pages: pagesAtCompose, epochAtSave, changesAtCompose, draftBefore,\s*\}\)\)/.test(save)
    && save.indexOf('if (late) {') > save.indexOf('if (next.tell && !asked) await D.alertDialog(')
    && !/await late\.answer/.test(save));
  const lateBody = body('settleLateKept');
  ok('… settleLateKept: only a late "kept", judged by savedStill and afterLateKept for the project as composed',
    /if \(!word \|\| word\.state !== 'kept'\) return;/.test(lateBody)
    && /savedStill\(\{ epochAtSave, epochNow: openEpoch, changesAtCompose, changesNow: app\.project\.changeCount \}\)/.test(lateBody)
    && /const next = afterLateKept\(\{ moved, device \}\);/.test(lateBody));
  ok('… marks saved and drops drafts only when afterLateKept says so; stops hearing when it says to',
    /if \(!next\.listen\) stop\(\);/.test(lateBody)
    && (lateBody.match(/app\.project\.markSaved\(\)/g) || []).length === 1 && /if \(next\.markSaved\) \{\s*app\.project\.markSaved\(\);/.test(lateBody)
    && (lateBody.match(/dropDraft\(/g) || []).length === 1 && /if \(next\.dropDraft\) \{[\s\S]*new Set\(draftBefore\)[\s\S]*draftKeysNow\(\)[\s\S]*dropDraft\(k\)/.test(lateBody));
  ok('… the kept file a home of the drafts, unless the save was filed as a copy (that copy is the home already)',
    /if \(next\.home && !after\.copy\) app\.draftHomes = nextDraftHomes\(app\.draftHomes, \{ name, size, pages \}\);/.test(lateBody));
  const follow = body('followPortalCopy');
  ok('… only while that project is still the one open, and the work so far drafted there at once',
    /if \(epoch !== openEpoch\) return;\s*app\.draftHomes = nextDraftHomes\(app\.draftHomes, \{ name, size, pages \}\);\s*void saveDraftNow\(\);/.test(follow));
}
// Found in the browser: the start screen draws its lists (and sweeps) while main.js is still being evaluated,
// so a module-level `let` the sweep reads must come before that first top-level call, or the module throws.
{
  const firstDraw = main.indexOf('\nonSettingsChanged();\n');
  ok('module-level state the start screen reads exists before main.js first draws it',
    firstDraw > 0 && ['let sweepingKept', 'let saving', 'let openEpoch'].every(d => main.indexOf(d) >= 0 && main.indexOf(d) < firstDraw));
}

console.log(fails
  ? `\n${fails} of ${checks} checks FAILED`
  : `\nAll ${checks} checks pass — only a confirmed save of the project as composed marks it saved; big files download, slow taps get a fresh one`);
process.exit(fails ? 1 : 0);
