/**
 * Service worker — so the app runs with no signal.
 *
 * A takeoff happens in a site trailer, in a truck, or in a house with no
 * roof on it yet. The whole app is about 4 MB including pdf.js, which is
 * small enough to keep entirely, so after one visit on a connection it
 * opens and works offline for good.
 *
 * Project files are NOT cached and never could be: they are the estimator's
 * own documents, they reach the app through a file picker, and they run to
 * gigabytes. Only the program is cached.
 *
 * Bump CACHE whenever the app changes, or an installed copy will keep
 * serving the old one.
 */
const CACHE = 'ptt-web-v3';

/**
 * The shell, precached on install so the very first offline load works even
 * if the estimator never happened to open the Reports dialog while online.
 * Everything else — the rest of the modules, pdf.js, the catalog — is cached
 * as it is first used, which is what the fetch handler below is for.
 *
 * Relative, every one of them: this app is served from a project subpath on
 * GitHub Pages, not from a domain root.
 */
const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'js/main.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', ev => {
  ev.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // One at a time and forgiving: addAll rejects the whole install if any
    // single entry 404s, which would leave the app with no worker at all.
    // And revalidating rather than cache.add, because the browser's HTTP
    // cache would otherwise hand the installer the very copy this new
    // version exists to replace.
    await Promise.all(SHELL.map(async u => {
      try {
        const res = await fetch(u, { cache: 'no-cache' });
        if (res && res.ok) await cache.put(u, res);
      } catch { /* a shell entry that will not load must not fail install */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', ev => {
  ev.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', ev => {
  if (ev.data === 'skip-waiting') self.skipWaiting();
});

/**
 * The program is fetched fresh when there is a network; everything else is
 * served from the cache.
 *
 * Cache-first for everything was the obvious choice and it is wrong here.
 * The HTML, the CSS and the modules have to agree with each other: serve a
 * new index.html beside a cached stylesheet from the previous version and
 * you get a broken app with nothing in the console to explain it. That is
 * not hypothetical — it happened during development, and the symptom was a
 * page where no button could be clicked.
 *
 * So the shell is network-first with a short timeout, falling back to cache
 * the moment the network is slow or absent. Offline still works; a stale
 * mixture cannot happen. Assets that never change without changing their
 * name — pdf.js, the icons, the catalog — stay cache-first, which is where
 * nearly all the bytes are anyway.
 */
const SHELL_RE = /\.(?:html|css|js|webmanifest)$|\/$/;
const NET_TIMEOUT_MS = 2500;

function withTimeout(promise, ms) {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve(null), ms);
    promise.then(v => { clearTimeout(t); resolve(v); },
                 () => { clearTimeout(t); resolve(null); });
  });
}

self.addEventListener('fetch', ev => {
  const req = ev.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // never proxy elsewhere
  // A range request is how a media element asks for part of a file; the
  // Cache API cannot answer one, and answering it wrong breaks playback.
  if (req.headers.has('range')) return;

  ev.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: false });

    // vendor/ is a pinned third-party release: its contents never change
    // without the version in the path changing, so it stays cache-first
    // and 1.4 MB of pdf.js is not re-fetched on every launch.
    const isShell = req.mode === 'navigate'
      || (SHELL_RE.test(url.pathname) && !url.pathname.includes('/vendor/'));

    // The browser's own HTTP cache sits UNDERNEATH this worker, and GitHub
    // Pages serves with a max-age. So a plain fetch() can hand back the very
    // copy we are trying to replace, and "network first" quietly means "HTTP
    // cache first" — which is exactly how a stale stylesheet survived a
    // redeploy and left the app with no clickable buttons. Shell requests
    // revalidate against the server; a 304 makes that nearly free.
    const go = () => fetch(req, isShell ? { cache: 'no-cache' } : undefined)
      .then(res => {
        if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      })
      .catch(() => null);

    if (isShell) {
      const fresh = await withTimeout(go(), NET_TIMEOUT_MS);
      if (fresh) return fresh;
      if (hit) return hit;
    } else if (hit) {
      ev.waitUntil(go());                 // refresh for next time
      return hit;
    }
    const res = await go();
    if (res) return res;

    // Offline and never cached. A navigation still has somewhere to go.
    if (req.mode === 'navigate') {
      const shell = await cache.match('index.html') || await cache.match('./');
      if (shell) return shell;
    }
    return new Response('Offline, and this part of the app was never cached.',
                        { status: 503, headers: { 'Content-Type': 'text/plain' } });
  })());
});
