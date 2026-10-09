// HabitFlow service worker: keeps the app files on the device so it opens without internet.
// Bump CACHE_VERSION only if the caching rules below change. Normal app updates need no bump:
// the page is fetched from the network first, and old built files are cleaned up on install.
const CACHE_VERSION = 'habitflow-v3';
const CACHE = CACHE_VERSION;
const CORE = ['/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/favicon.png'];
const NAV_TIMEOUT_MS = 3000; // on a bad connection, show the saved app instead of waiting forever

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // The page itself and its built files. Ask the network for fresh copies (not the browser's HTTP cache).
      const pageRes = await fetch('/', { cache: 'reload' });
      if (!pageRes.ok) throw new Error('page not available'); // keep the old worker rather than a broken one
      const html = await pageRes.clone().text();
      await cache.put('/', pageRes);
      const assets = assetsIn(html);
      // One missing icon must not stop the install, so each file is cached on its own.
      await Promise.all(
        [...CORE, ...assets].map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined)
        )
      );
      // Remove built files from older versions that the new page no longer uses.
      await pruneOldAssets(html);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function assetsIn(html) {
  return [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
}

// Delete saved built files that the newest page no longer uses (they pile up after each deploy).
async function pruneOldAssets(html) {
  const keep = new Set(assetsIn(html));
  if (keep.size === 0) return; // not our app page: do nothing
  const cache = await caches.open(CACHE);
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (path.startsWith('/assets/') && !keep.has(path)) await cache.delete(req);
  }
}

function networkFirst(req) {
  return new Promise((resolve) => {
    let settled = false;
    const fromCache = () => caches.match('/').then((hit) => hit || Response.error());
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      fromCache().then(resolve);
    }, NAV_TIMEOUT_MS);
    fetch(req)
      .then((res) => {
        // A late answer still refreshes the saved copy for next time.
        if (res.ok) {
          const copy = res.clone();
          const forPrune = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          forPrune.text().then(pruneOldAssets).catch(() => undefined);
        }
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          resolve(res);
        }
      })
      .catch(() => {
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          fromCache().then(resolve);
        }
      });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // Page loads: network first (so updates arrive), saved copy when offline or slow.
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }

  // Everything else: saved copy first, otherwise fetch and save it.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
