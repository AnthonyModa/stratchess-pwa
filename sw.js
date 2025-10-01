
const PRECACHE = 'stratchess-precache-v1';
const PRECACHE_URLS = [
  '/', '/index.html', '/style.css', '/script.js', '/manifest.json',
  'https://unpkg.com/chess.js@1.0.0/dist/chess.umd.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    await cache.addAll(PRECACHE_URLS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k!==PRECACHE).map(k=>caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(PRECACHE);
      const cached = await cache.match('/index.html');
      try {
        const fresh = await fetch(req);
        cache.put('/index.html', fresh.clone());
        return fresh;
      } catch (e) {
        return cached;
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(PRECACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch(e){
      return cached || Response.error();
    }
  })());
});
