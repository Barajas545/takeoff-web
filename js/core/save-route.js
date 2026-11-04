/**
 * Where a finished project goes on a browser with no file handles — an iPad,
 * an iPhone, Firefox, Safari — and what the app may then say about it.
 *
 * Chrome and Edge on a computer write the project back into the file it came
 * from, and the browser says when that is done. Everywhere else the project
 * leaves as a NEW file, one of two ways, and neither of them is a write the
 * app can watch finish:
 *
 *   · the share sheet (navigator.share with the file). The estimator picks
 *     where it goes — Save to Files, OneDrive, Mail — and share() resolves
 *     only once they have. That is the one answer on an iPad that says the
 *     file went somewhere. But WebKit reads the WHOLE file into memory before
 *     the sheet even opens (ShareDataReader: every byte into an ArrayBuffer,
 *     then copied for the system's side), and it will only open the sheet
 *     within about five seconds of a tap (transient activation, consumed by
 *     share()). A read that fails is reported as AbortError — the very name a
 *     person dismissing the sheet gets;
 *
 *   · an <a download> of the file. The browser streams it to Downloads from
 *     the parts it is made of, half a megabyte at a time, so it works at any
 *     size — but on an iPad nothing comes back to the page: not whether
 *     Safari asked "Do you want to download?", not whether the person said
 *     yes, not whether an app opened from the home-screen icon downloaded
 *     anything at all. On a computer it is the save, and always has been: a
 *     Firefox download lands in Downloads and that is the whole story there.
 *
 * Until now every one of those endings was called "Saved", the project was
 * marked saved, and the unsaved-work draft was thrown away — including the
 * ending where nothing at all had happened. On a phone that is how an hour of
 * takeoff disappears with a cheerful message. So the rules here:
 *
 *   1. Only a CONFIRMED ending marks the project saved and drops the draft:
 *      a write through a handle, a share that resolved, or a download on a
 *      computer.
 *   2. A download on a phone or a tablet is "started", never "saved": the
 *      project stays unsaved, the draft stays, and the person is told where to
 *      look and what to do if nothing came.
 *   3. When it is not clear whether the person said no or the browser failed,
 *      the answer that keeps the work wins — and the work is kept either way,
 *      because a draft is written before the save begins.
 *
 * Everything here is pure — no DOM, no navigator — so tests/save-route.mjs
 * drives every ending with made-up browsers. main.js supplies the real share,
 * the real download and the real "Your file is ready" dialog.
 */

/**
 * Above this the share sheet is not offered at all: the file downloads.
 *
 * 150 MB, because of what share() does with it (ipad-web.md §b, §e): the whole
 * file is read into one ArrayBuffer in the page's own process and copied
 * again for the share sheet — two to three copies of it in memory at once, on
 * top of the decoded sheets the app is already holding. The page's process is
 * killed somewhere around 1.5 GB on most iPhones (more on an 8 GB iPad, less
 * on the older ones crews carry), and a single typed array could not pass
 * about 2 GB on iOS at all until 2024. Measured advice is "tens to low
 * hundreds of megabytes". At 150 MB the copies are about 450 MB at worst,
 * which leaves a smaller iPad room for the app itself; past it the download
 * — which streams from the file and costs nothing — is the safer way out.
 * Most estimates are well under it; the big plan sets (500 MB to 2.3 GB) are
 * far over it either way.
 */
export const SHARE_CAP_BYTES = 150 * 1024 * 1024;

/**
 * How soon after share() is called a person could have seen the sheet and
 * dismissed it. The sheet slides in for about a third of a second and a tap
 * to close it comes after that; an AbortError sooner than this is the
 * browser failing to read the file, not a person saying no.
 */
export const SHEET_MIN_MS = 700;

/**
 * How long a download's blob: address is kept. On a computer the download
 * has the file well inside ten seconds (unchanged). On a phone or a tablet
 * Safari may first ask "Do you want to download …?" and the address must
 * still be there when the person says yes — so it is kept for minutes, and
 * the next download (or the page going away) lets the old one go.
 */
export function downloadUrlKeepMs({ touch = false } = {}) {
  return touch ? 5 * 60 * 1000 : 10 * 1000;
}

/**
 * Which way the file leaves:
 *
 *   { how: 'share' }                    open the share sheet now
 *   { how: 'ask', why: 'no-activation' } the tap that started the save has
 *                                        run out (the save took longer than
 *                                        the browser lets a tap count): say
 *                                        "Your file is ready" and share from
 *                                        a fresh tap on its Save button
 *   { how: 'download', why }             'no-share' (the browser cannot
 *                                        share a file: Chrome or Firefox on a
 *                                        computer) or 'too-big' (over the cap)
 *
 * plus `confirms`: whether a download, if it comes to one, is a finished save
 * (a computer) or only a started one (a phone or a tablet). `standalone` (an
 * app opened from the home-screen icon) changes no route — the share sheet is
 * the better way out there too, and a download the only one past the cap —
 * but it is carried for the words: a home-screen app may not download at all.
 *
 *   size        the file's bytes
 *   canShare    navigator.canShare({ files }) said yes, and share exists
 *   activation  navigator.userActivation.isActive — null where the browser
 *               cannot say (then share() itself is asked, and a refusal for
 *               want of a tap comes back as 'ask' from deliverFile)
 *   touch       a phone or a tablet (js/core/plans-link.js isPhoneOrTablet)
 */
export function saveRoute({
  size = 0, cap = SHARE_CAP_BYTES, canShare = false, activation = null,
  touch = false, standalone = false,
} = {}) {
  const base = { confirms: !touch, standalone: !!standalone };
  if (!canShare) return { ...base, how: 'download', why: 'no-share' };
  if (!(Number(size) <= cap)) return { ...base, how: 'download', why: 'too-big' };
  if (activation === false) return { ...base, how: 'ask', why: 'no-activation' };
  return { ...base, how: 'share', why: 'ok' };
}

/**
 * What a share() rejection means:
 *
 *   'no-activation'  NotAllowedError — the tap had run out (or was used up)
 *   'cancelled'      the person closed the sheet
 *   'failed'         anything else: the file could not be read or handed over
 *
 * The trouble is AbortError, which WebKit uses for both a person closing the
 * sheet ("Abort due to cancellation of share.") and its own failure to read
 * the file ("Abort due to error while reading files."). The words decide
 * where there are words; with none to go on, an AbortError counts as a person
 * only if it came late enough for the sheet to have been on screen
 * (SHEET_MIN_MS). Either way the work is safe — the draft was written before
 * the save and nothing is marked saved — so this decides only whether the
 * file is downloaded instead, which a person who said no would not want.
 */
export function shareErrorKind(err, { elapsedMs = 0 } = {}) {
  const name = err && err.name;
  if (name === 'NotAllowedError') return 'no-activation';
  if (name !== 'AbortError') return 'failed';
  const words = String((err && err.message) || '');
  if (/\berror\b|\bread(?:ing)?\b|\bfail/i.test(words)) return 'failed';
  if (/cancel/i.test(words)) return 'cancelled';
  return Number(elapsedMs) >= SHEET_MIN_MS ? 'cancelled' : 'failed';
}

/**
 * Take the file out of the browser by the route above, falling back the safe
 * way at each step. Resolves { outcome, why }:
 *
 *   outcome  'shared'            share() resolved: the person put it somewhere
 *            'downloaded'        a download on a computer: the save, as ever
 *            'download-started'  a download on a phone or a tablet: unconfirmed
 *            'cancelled'         the person closed the sheet or the dialog
 *   why      for a download: 'no-share', 'too-big', 'share-failed' (the sheet
 *            could not take the file), 'no-activation' (it refused even a
 *            fresh tap), 'chosen' (Download instead, in the dialog)
 *
 * `env` is the browser, so the tests can be every browser:
 *
 *   canShare()   bool — can this file go to the share sheet at all
 *   activation() bool | null — is the tap that started this still live
 *   share()      Promise — navigator.share with the file, called right now
 *   ask()        Promise of null (Cancel) | 'download' | { share, at }:
 *                the "Your file is ready" dialog, whose Save button calls
 *                share() INSIDE its own tap and hands back that promise and
 *                when it was started
 *   download()   start the <a download>
 *   now()        ms
 *   touch, standalone, cap   as for saveRoute
 */
export async function deliverFile({ size = 0 } = {}, env = {}) {
  const now = env.now || (() => Date.now());
  const route = saveRoute({
    size, cap: env.cap ?? SHARE_CAP_BYTES, canShare: !!env.canShare?.(),
    activation: env.activation ? env.activation() : null,
    touch: !!env.touch, standalone: !!env.standalone,
  });
  const download = why => {
    env.download();
    return { outcome: route.confirms ? 'downloaded' : 'download-started', why };
  };
  if (route.how === 'download') return download(route.why);

  if (route.how === 'share') {
    const at = now();
    try {
      await env.share();
      return { outcome: 'shared', why: 'ok' };
    } catch (err) {
      const kind = shareErrorKind(err, { elapsedMs: now() - at });
      if (kind === 'cancelled') return { outcome: 'cancelled', why: 'sheet' };
      if (kind === 'failed') return download('share-failed');
      // 'no-activation': the tap ran out after all — ask for a fresh one.
    }
  }

  const answer = await env.ask();
  if (!answer) return { outcome: 'cancelled', why: 'dialog' };
  if (answer === 'download') return download('chosen');
  try {
    await answer.share;
    return { outcome: 'shared', why: 'ok' };
  } catch (err) {
    const kind = shareErrorKind(err, { elapsedMs: now() - (Number(answer.at) || 0) });
    if (kind === 'cancelled') return { outcome: 'cancelled', why: 'sheet' };
    // A fresh tap refused, or the file could not be read: the download is
    // the only way left, and it is offered rather than nothing.
    return download(kind === 'no-activation' ? 'no-activation' : 'share-failed');
  }
}

const MB = n => `${Math.round(Number(n) / 1048576)} MB`;

/**
 * After the file has gone (or not): whether the project is now saved, whether
 * its draft may go, and the words for the status line. Unknown outcomes keep
 * everything — the rule is that only a confirmed save loses the safety net.
 *
 * `tell` asks for the words in a dialog too: the status line clears itself
 * after a few seconds, and "your download is not confirmed — look in
 * Downloads" is not something to miss while looking for the file.
 *
 *   outcome  'written' (through a file handle) or one of deliverFile's
 *   name     the file's name, as the person will see it in Files
 */
export function afterSave(outcome, { name = 'the project', why = '', standalone = false, cap = SHARE_CAP_BYTES } = {}) {
  switch (outcome) {
    case 'written':
    case 'downloaded':
      return { markSaved: true, dropDraft: true, tell: false, status: `Saved ${name}` };
    case 'shared':
      return { markSaved: true, dropDraft: true, tell: false, status: `Saved ${name} — it went where you chose in the share sheet.` };
    case 'download-started': {
      const reason = why === 'too-big'
        ? `${name} is over ${MB(cap)}, too big for the share sheet, so it is downloading instead. `
        : why === 'share-failed' || why === 'no-activation'
          ? `The share sheet could not take ${name}, so it is downloading instead. `
          : `Downloading ${name}. `;
      return {
        markSaved: false,
        dropDraft: false,
        tell: true,
        status: `${reason}Look for it in Files › Downloads. A download cannot be confirmed here, so the project `
          + 'still shows unsaved changes and your work stays kept on this device. If no file appears'
          + (standalone ? ' (an app opened from the home-screen icon may not download)' : '')
          + ', your work is still here: use Save again.',
      };
    }
    case 'cancelled':
      return { markSaved: false, dropDraft: false, tell: false, status: 'Save cancelled — nothing was saved. Your changes are still here.' };
    default:
      return { markSaved: false, dropDraft: false, tell: false, status: 'Not saved — your changes are still here and kept on this device.' };
  }
}

/**
 * The name the saved file is offered under, on a browser that hands the
 * project over as a new file.
 *
 * The file that was opened keeps its own name: a plan picked in the Files app
 * and saved back through the share sheet's "Save to Files" then lands beside
 * — and can replace — the plan it came from, instead of making a second
 * takeoff named after the project in the job's folder, where every takeoff
 * file is one of its plans. An old .pdfcache comes back as .takeoff. A new
 * project, started from a PDF or from nothing, has no file yet and is named
 * after the project, as it always was.
 */
export function saveFileName({ openedName = '', projectName = '', ext = '.takeoff' } = {}) {
  const clean = s => s.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_');
  const opened = String(openedName || '').split(/[\\/]/).pop().trim();
  if (opened) {
    const stem = opened.replace(/\.(?:takeoff|pdfcache)$/i, '').trim();
    if (stem) return `${clean(stem)}${ext}`;
  }
  const n = String(projectName || '').trim();
  return `${clean(n || 'Takeoff')}${ext}`;
}

/** An app opened from the home-screen icon (iOS's own flag, or the display mode every browser reports). */
export function isStandalone(win = globalThis) {
  const nav = (win && win.navigator) || {};
  if (nav.standalone === true) return true;
  try {
    return !!(win && typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches);
  } catch {
    return false;
  }
}

/* ── open: a picked file that arrives late ──────────────────────────────────

   iOS copies a document picked in the Files app into the browser BEFORE it
   tells the page — and a plan the OneDrive app has not brought down yet is
   downloaded whole first: minutes, for a big one. The page meanwhile has its
   focus back and the person can do other things. So when the file finally
   arrives, the question is whether it is still wanted. */

/**
 * 'open', 'ask' (confirm discarding the open project first) or 'ignore'.
 *
 *   epochAtPick / epochNow  a count of projects opened or started; different
 *                           means something else was opened meanwhile, and a
 *                           late file must not replace it
 *   dirtyAtPick             the project had unsaved changes when the pick
 *                           began (and the person already said to discard them)
 *   dirtyNow                it has unsaved changes now
 *   slow                    the wait ran long enough to be told so — time in
 *                           which more work may have been done
 */
export function lateArrival({ epochAtPick = 0, epochNow = 0, dirtyAtPick = false, dirtyNow = false, slow = false } = {}) {
  if (epochAtPick !== epochNow) return 'ignore';
  if (dirtyNow && (slow || !dirtyAtPick)) return 'ask';
  return 'open';
}

/** Said while a picked file is still on its way (pickFileFallback in main.js). */
export const STILL_COMING =
  'Waiting for the file — a big plan from OneDrive can take a few minutes to come down to this device, '
  + 'and it opens when it arrives. If you did not pick one, carry on.';
