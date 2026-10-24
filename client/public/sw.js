/* Rune service worker (works at "/" and under a sub-path such as GitHub Pages "/rune/")
 * - App shell + built assets: cache-first, so the UI loads offline
 * - Navigations: network-first, falling back to the cached shell
 * - /api GET JSON & cover art (server build only): network-first with cache fallback
 * - /api/stream & /api/proxy: never cached here (Range/206 responses). Audio for offline use is stored
 *   in IndexedDB by the app ("Save for offline" / Device files).
 */
const VERSION = 'v3';
const SHELL = `rune-shell-${VERSION}`;
const DATA = `rune-data-${VERSION}`;
const BASE = new URL(self.registration.scope).pathname; // "/" or "/rune/"
const API = `${BASE}api/`;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL)
      .then((c) => c.addAll([BASE, `${BASE}icon.svg`, `${BASE}manifest.webmanifest`]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, DATA].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  if (url.pathname.startsWith(API)) {
    const rest = url.pathname.slice(API.length);
    if (/^(stream|proxy|auth|me|health)/.test(rest)) return; // never cache these
    e.respondWith(networkFirst(req, DATA));
    return;
  }
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(SHELL).then((c) => c.put(BASE, res.clone()));
          return res;
        })
        .catch(() => caches.match(BASE))
    );
    return;
  }
  e.respondWith(cacheFirst(req, SHELL));
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req);
    if (hit) return hit;
    return new Response(JSON.stringify({ error: 'You are offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}
