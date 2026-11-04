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
} from '../js/core/save-route.js';
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
    ok(`… (${why || 'no reason'}) it says nothing reached the portal or OneDrive, that the work is kept, and what to do`,
      /^Not saved to the portal or OneDrive\./.test(n.status) && /kept on this device: opening A000T1 Made up plan\.takeoff again offers them back/.test(n.status)
      && /Save again, or save a copy to Files\./.test(n.status));
  }
  ok('refused: the portal\'s own words', /did not take this save: Not a plan the portal handed over\./.test(
    afterSave('not-kept', { why: 'refused', portalWhy: 'Not a plan the portal handed over.' }).status));
  ok('no room: says the device is full, and what frees room', /no room for the portal to keep the save/.test(not('no-room').status) && /Plans Library can remove/.test(not('no-room').status));
  ok('failed with no words: says it gave none', /could not keep the save: it did not say why\./.test(not('failed').status));
  ok('timeout: the two minutes', /did not answer within 2 minutes/.test(not('timeout').status));
  ok('gone: the portal page closed', /has closed/.test(not('gone').status));
  ok('no draft home (sheets added since it opened): never "kept", the page is the only place',
    /in this page only: keep it open/.test(afterSave('not-kept', { why: 'refused', keptIn: '' }).status)
    && !/kept on this device/.test(afterSave('not-kept', { why: 'refused', keptIn: '' }).status));
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
  }
  const e = await portalSave({ answer: 'kept', editWhileWaiting: true });
  eq('end to end — kept, but edited while waiting: still unsaved, the draft stays', [e.dirty, e.drafts], [true, 1]);
  ok('… and it says so', /changes made while it was being saved are not in it/.test(e.status));
  const o = await portalSave({ answer: 'kept', openAnother: true });
  eq('end to end — kept, but another project opened meanwhile: the saved one\'s draft goes, the open one is not marked', [o.drafts, o.dirty], [0, true]);
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
    /showProgress\('Saving to the portal…'/.test(hand) && /portalSaving = true;[\s\S]*await askPortalToKeep\([\s\S]*waitMs: SAVE_WAIT_MS[\s\S]*finally \{\s*portalSaving = false;/.test(hand));
  ok('… a fresh req for every save, the peer and nonce kept on app.portal', /req: newSaveReq\(\)/.test(hand) && /peer: p\.peer, nonce: p\.nonce/.test(hand));
  ok('… the news of the send only on the status line', /onNews: news => \{[\s\S]*portalNewsWords\(news[\s\S]*setStatus\(words\)/.test(hand));
  ok('… and only kept is a save', /if \(ending === 'kept'\) \{[\s\S]*return \{ outcome: 'kept'/.test(hand) && /return \{ outcome: 'not-kept', why: ending, portalWhy: why \}/.test(hand));
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
    && /if \(embedded\) setStatus\(`Opened \$\{plan\.name\} from OneDrive, over the internet\. \$\{NO_SAVE_BACK\}`\);/.test(recv)
    && !/handheld\)? ?setStatus\(`Opened \$\{plan\.name\} from OneDrive/.test(recv));
  // Review fix: a draft of a plan the portal handed over is never dropped by the file's date.
  const restore = body('offerDraftRestore');
  ok('offerDraftRestore judges a draft by draftFate, by the date only when the plan is not the portal\'s',
    /draftFate\(\{ savedAt: draft\.savedAt, fileModified: file\.lastModified, byDate: !portal \}\) === 'drop'/.test(restore)
    && !/draft\.savedAt <= file\.lastModified/.test(main));
  ok('… told so by loadProjectFile: inside the portal, or a plan it handed over',
    /async function loadProjectFile\(file, handle = null, \{ library = null, archive = null, fromPortal = false \} = \{\}\)/.test(main)
    && /await offerDraftRestore\(file, \{ portal: embedded \|\| fromPortal \}\);/.test(body('loadProjectFile')));
  ok('… and the hand-over says it for both kinds: a copy on the device and a link',
    /loadProjectFile\(file, null, \{ library: hold, fromPortal: true \}\)/.test(recv) && /\}\), null, \{ fromPortal: true \}\);/.test(recv));
  ok('… a copy the portal made also finds the draft under its plan\'s name, then keeps it under its own',
    /const plan = portal \? planOfPortalCopy\(file\.name\) : '';\s*if \(plan\) keys\.push\(draftKey\(plan, file\.size\)\);/.test(restore)
    && /if \(key !== own && await saveDraftNow\(\)\) await dropDraft\(key\);/.test(restore)
    && /if \(!ok\) \{ await dropDraft\(key\); return; \}/.test(restore));
  // Review fix: the portal's "copy" news makes the copy a home of the drafts.
  ok('the save tells handToPortal the sheets composed and the project it is for',
    /await handToPortal\(blob, savedName, \{ pages: pagesAtCompose, epoch: epochAtSave \}\)/.test(branch));
  ok('… whose "copy" news (with its name) makes the copy a home of the drafts',
    /if \(news\.state === 'copy' && news\.name\) followPortalCopy\(\{ name: news\.name, size: file\.size, pages, epoch \}\);/.test(hand));
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
