// Where the tests find the things they cannot carry with them.
//
// Most of this suite runs against the estimator's REAL project library rather
// than against fixtures, which is the whole reason it has caught what it has:
// hand-built inputs test the maths and skip the wiring, and the wiring is
// where the wrong `self`, the missing key and the swallowed exception live.
//
// But a real library is one machine's private data. A named client's stamped
// plan set is in there, so it cannot be committed, and a path to it cannot be
// hardcoded in a public repo either. So:
//
//   · the paths come from the environment, with this machine's as defaults
//   · a harness that needs data it cannot find SKIPS, loudly, rather than
//     failing — a red suite that means "not configured" trains people to
//     ignore red, and an absent check that reports PASS is worse still
//   · every check that does NOT need the library runs everywhere, always
//
// Override with:
//   PTT_LIBRARY      the folder of .takeoff projects to test against
//   PTT_DESKTOP_SRC  pdf_fast_viewer.py, for the differential tests that run
//                    the desktop app's own functions rather than a copy of them
import { access, readdir } from 'node:fs/promises';
import path from 'node:path';

// An optional, gitignored file for a machine's own paths, so nobody has to
// export two environment variables before every run — and so no one person's
// home directory ends up hardcoded in a public repository.
//
//   // tests/config.local.mjs
//   export const LIBRARY = 'C:/Users/you/Documents/Professional Takeoff Tools';
//   export const DESKTOP_SRC = 'C:/path/to/pdf_fast_viewer.py';
let local = {};
try {
  local = await import('./config.local.mjs');
} catch {
  // There is no local config, which is the ordinary case everywhere but the
  // estimator's own machine. The environment, or nothing.
}

/** The project library to test against. Empty means "there isn't one here". */
export const LIBRARY = process.env.PTT_LIBRARY || local.LIBRARY || '';

/** The desktop app's source, for the differential tests. */
export const DESKTOP_SRC = process.env.PTT_DESKTOP_SRC || local.DESKTOP_SRC || '';

/** Fixtures that are NOT committed — real files, kept local. */
export const FIXTURES = new URL('./fixtures/', import.meta.url);

/** Snapshots that ARE committed: derived, anonymised, no client data. */
export const DATA = new URL('./data/', import.meta.url);

async function exists(p) {
  if (!p) return false;
  try { await access(p); return true; } catch { return false; }
}

/** Is there a project library to test against? */
export async function haveLibrary() {
  if (!await exists(LIBRARY)) return false;
  // A folder that exists but holds no projects is the same as no folder, and
  // saying so here saves every harness its own empty-walk.
  for await (const _ of walkProjects(LIBRARY, 0, 1)) return true;
  return false;
}

/** Is the desktop source available to diff against? */
export function haveDesktopSource() {
  return exists(DESKTOP_SRC);
}

/**
 * Every .takeoff under a folder.
 *
 * `skipCopies` leaves out Backups and Archive, which hold the same jobs again
 * — useful when a harness is counting projects rather than exercising reads.
 */
export async function* walkProjects(dir = LIBRARY, depth = 0, maxDepth = 3,
  { skipCopies = false } = {}) {
  if (depth > maxDepth) return;
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (skipCopies && (e.name === 'Backups' || e.name === 'Archive')) continue;
      yield* walkProjects(p, depth + 1, maxDepth, { skipCopies });
    } else if (e.name.toLowerCase().endsWith('.takeoff')) {
      yield p;
    }
  }
}

/**
 * Stop this harness because the data it needs is not here.
 *
 * Exit code 2, never 1: a runner can then tell "not configured" from "broken",
 * and a skipped check is never mistaken for a passing one.
 */
export function skip(what) {
  console.log(`SKIP — ${what}`);
  console.log('      set PTT_LIBRARY, or write tests/config.local.mjs, to run '
    + 'this one.');
  process.exit(2);
}

/** A fixture file, or null when this machine does not have it. */
export async function fixture(name) {
  const u = new URL(name, FIXTURES);
  return (await exists(u)) ? u : null;
}
