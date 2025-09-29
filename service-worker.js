/* AadhyaPath service worker
 * - Precache app shell and critical assets
 * - Runtime cache for icons, CSS/JS, and map tiles
 * - Offline fallback for navigation requests
 */
const VERSION = 'v1.1.0';
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
  'assets/supabase.js',
  'assets/config.js',
  'assets/styles.css',
  'assets/app.js',
  'assets/i18n.js',
  'assets/icons/app-mark.svg',
  'assets/icons/app-mark-192.png',
  'assets/icons/bell.svg',
  'assets/icons/hazard-cold.svg',
  'assets/icons/hazard-cyclone.svg',
  'assets/icons/hazard-drought.svg',
  'assets/icons/hazard-earthquake.svg',
  'assets/icons/hazard-fire.svg',
  'assets/icons/hazard-flood.svg',
  'assets/icons/hazard-forest-fire.svg',
  'assets/icons/hazard-health.svg',
  'assets/icons/hazard-heat.svg',
  'assets/icons/hazard-landslide.svg',
  'assets/icons/hazard-lightning.svg',
  'assets/icons/hazard-multi.svg',
  'assets/icons/hazard-rain.svg',
  'assets/icons/hazard-storm.svg',
  'assets/icons/hazard-tsunami.svg',
  'assets/icons/map.svg',
  'assets/icons/profile.svg',
  'assets/icons/video.svg',
  'assets/map_icon/drought.png',
  'assets/map_icon/earthquake.png',
  'assets/map_icon/flood.png',
  'assets/map_icon/food.png',
  'assets/map_icon/hospital.png',
  'assets/map_icon/location.png',
  'assets/map_icon/school.png',
  'assets/map_icon/shelter.png'
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

  // API calls: stale-while-revalidate
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Video files: cache-first
  if (req.url.endsWith('.mp4')) {
    event.respondWith(
      caches.match(req).then((cached) => cached || networkFirst(req))
    );
    return;
  }

  // Navigation requests: network-first -> offline
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }

  // All other assets: cache-first, then network
  event.respondWith(
    caches.match(req).then((cached) => cached || networkFirst(req))
  );
});
