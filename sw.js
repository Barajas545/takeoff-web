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
const CACHE = 'ptt-web-v1';

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
    await Promise.all(SHELL.map(u => cache.add(u).catch(() => {})));
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
 * Cache first, then refresh in the background.
 *
 * Cache first because the point is to work with no signal, and because a
 * plan sheet being drawn must never wait on a network round trip. The
 * background refresh is what picks up a new version: the next launch gets
 * it, which for a tool used in the field is the right trade.
 */
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

    const fromNetwork = fetch(req).then(res => {
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    }).catch(() => null);

    if (hit) {
      ev.waitUntil(fromNetwork);          // refresh for next time
      return hit;
    }
    const res = await fromNetwork;
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
