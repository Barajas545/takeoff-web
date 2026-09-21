// RemoteFile against a fake server, for the cases a real one is not obliging
// enough to produce on demand: an expired link, and a server that ignores
// Range. Both would corrupt a read silently rather than fail loudly.
import { RemoteFile } from '../js/core/remote-file.js';

let fails = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FAIL ${name}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
};
const ok = (name, cond) => { if (!cond) { fails++; console.log(`FAIL ${name}`); } };

// a 1000-byte file: byte i has value i % 251
const BODY = new Uint8Array(1000).map((_, i) => i % 251);
const txt = b => Array.from(new Uint8Array(b)).join(',');
const want = (a, z) => Array.from(BODY.slice(a, z)).join(',');

/** A server. `mode` decides how badly it behaves. */
function server({ mode = 'ranges', validUrl = 'u1' } = {}) {
  const log = { reqs: 0, ranges: [], bodyBytes: 0 };
  const fetch = async (url, opts) => {
    log.reqs++;
    const m = /bytes=(\d+)-(\d+)/.exec((opts.headers || {}).Range || '');
    log.ranges.push(m ? `${m[1]}-${m[2]}` : 'none');
    if (mode === 'expires' && url !== validUrl) {
      return { ok: false, status: 403, headers: new Map(), arrayBuffer: async () => new ArrayBuffer(0) };
    }
    if (mode === 'norange') {
      log.bodyBytes += BODY.length;
      return { ok: true, status: 200, arrayBuffer: async () => BODY.slice().buffer };
    }
    const a = Number(m[1]), z = Number(m[2]) + 1;
    log.bodyBytes += z - a;
    return { ok: true, status: 206, arrayBuffer: async () => BODY.slice(a, z).buffer };
  };
  return { fetch, log };
}

const real = globalThis.fetch;
const withServer = async (s, fn) => {
  globalThis.fetch = s.fetch;
  try { return await fn(); } finally { globalThis.fetch = real; }
};

// ── ordinary ranges ──────────────────────────────────────────────────────
{
  const s = server();
  await withServer(s, async () => {
    const f = new RemoteFile({ url: 'u1', name: 'a.takeoff', size: 1000 });
    eq('head 16 bytes', txt(await f.slice(0, 16).arrayBuffer()), want(0, 16));
    eq('middle slice', txt(await f.slice(400, 480).arrayBuffer()), want(400, 480));
    eq('tail slice', txt(await f.slice(990, 1000).arrayBuffer()), want(990, 1000));
    eq('range headers inclusive', s.log.ranges, ['0-15', '400-479', '990-999']);
    eq('only what was asked for crossed the wire', s.log.bodyBytes, 16 + 80 + 10);
  });
}

// ── the reader's own habits ──────────────────────────────────────────────
{
  const s = server();
  await withServer(s, async () => {
    const f = new RemoteFile({ url: 'u1', size: 1000 });
    eq('slice() defaults to the whole file', f.slice().size, 1000);
    eq('empty slice reads nothing', txt(await f.slice(50, 50).arrayBuffer()), '');
    eq('empty slice makes no request', s.log.reqs, 0);
    eq('past the end clamps', f.slice(900, 5000).size, 100);
    eq('start past the end is empty', f.slice(2000, 3000).size, 0);
    eq('negative start clamps to 0', f.slice(-10, 20).size, 20);
    eq('nested slice offsets from the parent',
       txt(await f.slice(400, 500).slice(10, 20).arrayBuffer()), want(410, 420));
    eq('name defaults', new RemoteFile({ url: 'u', size: 1 }).name, 'project.takeoff');
    ok('a missing url is refused', (() => {
      try { new RemoteFile({ size: 1 }); return false; } catch { return true; }
    })());
  });
}

// ── an expired pre-authed link ───────────────────────────────────────────
{
  const s = server({ mode: 'expires', validUrl: 'fresh' });
  await withServer(s, async () => {
    let mints = 0;
    const f = new RemoteFile({
      url: 'stale', size: 1000,
      renew: async () => { mints++; return 'fresh'; },
    });
    eq('403 is retried on a fresh link', txt(await f.slice(0, 8).arrayBuffer()), want(0, 8));
    eq('minted once', mints, 1);
    eq('later reads use the new link without minting again',
       txt(await f.slice(8, 16).arrayBuffer()), want(8, 16));
    eq('still one mint', mints, 1);
  });
}
{
  // Several sheets in flight when the link expires must share one renewal.
  const s = server({ mode: 'expires', validUrl: 'fresh' });
  await withServer(s, async () => {
    let mints = 0;
    const f = new RemoteFile({
      url: 'stale', size: 1000,
      renew: async () => { mints++; await new Promise(r => setTimeout(r, 5)); return 'fresh'; },
    });
    const got = await Promise.all([0, 100, 200, 300].map(a => f.slice(a, a + 8).arrayBuffer()));
    eq('every concurrent slice is correct', got.map(txt),
       [0, 100, 200, 300].map(a => want(a, a + 8)));
    eq('four simultaneous failures mint one link', mints, 1);
  });
}
{
  const s = server({ mode: 'expires', validUrl: 'never' });
  await withServer(s, async () => {
    const f = new RemoteFile({ url: 'stale', size: 1000, renew: async () => 'still-bad' });
    let msg = '';
    try { await f.slice(0, 8).arrayBuffer(); } catch (e) { msg = e.message; }
    ok('a link that cannot be renewed fails loudly', /403/.test(msg) && /expired/i.test(msg));
  });
}
{
  const s = server({ mode: 'expires', validUrl: 'never' });
  await withServer(s, async () => {
    const f = new RemoteFile({ url: 'stale', size: 1000 });   // no renewer
    let threw = false;
    try { await f.slice(0, 8).arrayBuffer(); } catch { threw = true; }
    ok('without a renewer it still fails rather than returning junk', threw);
    eq('and does not retry pointlessly', s.log.reqs, 1);
  });
}

// ── a server that ignores Range ──────────────────────────────────────────
{
  const s = server({ mode: 'norange' });
  await withServer(s, async () => {
    const f = new RemoteFile({ url: 'u1', size: 1000 });
    eq('200 body is cut to the slice, not trusted whole',
       txt(await f.slice(400, 480).arrayBuffer()), want(400, 480));
    eq('a second slice is served locally', txt(await f.slice(0, 16).arrayBuffer()), want(0, 16));
    eq('the file is downloaded once, not once per sheet', s.log.reqs, 1);
    eq('a third slice, still one download', txt(await f.slice(990, 1000).arrayBuffer()), want(990, 1000));
    eq('still one', s.log.reqs, 1);
  });
}

console.log(fails ? `\n${fails} FAILED` : 'remote-file: all checks passed');
process.exit(fails ? 1 : 0);
