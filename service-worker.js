/* AadhyaPath service worker
 * - Precache app shell and critical assets
 * - Runtime cache for icons, CSS/JS, and map tiles
 * - Offline fallback for navigation requests
 */
const VERSION = 'v1.0.2';
const PRECACHE = `precache-${VERSION}`;
const RUNTIME = `runtime-${VERSION}`;

// Core shell and must-have assets
const PRECACHE_URLS = [
  'index.html',
  'AadhyaPath_dashboard.html',
  'auth.html',
  'offline.html',
  'manifest.webmanifest',
  'assets/landing.css',
  'assets/landing.js',
  'assets/auth.css',
  'assets/auth.js',
  'assets/firebase.js',
  'assets/config.js',
  'assets/styles.css',
  'assets/app.js',
  'assets/i18n.js',
  'assets/icons/app-mark.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => ![PRECACHE, RUNTIME].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Utility: network-first with cache fallback
async function networkFirst(request) {
  try {
    const res = await fetch(request);
    const cache = await caches.open(RUNTIME);
    cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // For navigation, show offline page
    if (request.mode === 'navigate') {
      return caches.match('offline.html');
    }
    throw err;
  }
}

// Utility: stale-while-revalidate
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      cache.put(request, res.clone());
      return res;
    })
    .catch(() => undefined);
  return cached || network || fetch(request);
}

// Runtime routing
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Ignore non-GET
  if (req.method !== 'GET') return;

  // Same-origin navigation requests: network-first -> offline
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }

  // Static assets: CSS/JS -> stale-while-revalidate
  if (url.origin === location.origin && (/\.css$|\.js$/i.test(url.pathname))) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Icons/SVGs: cache-first with SWR update
  if (url.origin === location.origin && url.pathname.startsWith('/assets/icons/')) {
    event.respondWith(
      caches.match(req).then((cached) => cached || staleWhileRevalidate(req))
    );
    return;
  }

  // Leaflet tiles and CDN libs: tile servers and unpkg -> SWR
  if (/^https:\/\/([abc]\.)?tile\.openstreetmap\.org\//.test(req.url) || /^https:\/\/unpkg\.com\//.test(req.url)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Videos: let range requests pass through network but cache completed GETs opportunistically
  if (url.origin === location.origin && /\/assets\/videos\/.+\.mp4$/i.test(url.pathname)) {
    event.respondWith(
      (async () => {
        // If it's a range request, stream from network (browsers expect proper 206 handling)
        if (req.headers.has('range')) return fetch(req);
        const cached = await caches.match(req);
        if (cached) return cached;
        try {
          const res = await fetch(req);
          const cache = await caches.open(RUNTIME);
          cache.put(req, res.clone());
          return res;
        } catch {
          return fetch(req);
        }
      })()
    );
    return;
  }

  // Default: try cache, then network
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
