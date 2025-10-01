// sw.js — GitHub Pages scope-safe
const PRECACHE = 'stratchess-precache-v4';
const PRECACHE_URLS = [
  'index.html',
  'style.css',
  'script.js',
  'manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.13.4/chess.min.js'
];

self.addEventListener('install', function(event){
  event.waitUntil((async function(){
    const cache = await caches.open(PRECACHE);
    await cache.addAll(PRECACHE_URLS);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', function(event){
  event.waitUntil((async function(){
    const keys = await caches.keys();
    await Promise.all(keys.filter(function(k){ return k !== PRECACHE; }).map(function(k){ return caches.delete(k); }));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', function(event){
  const req = event.request;
  if (req.mode === 'navigate') {
    event.respondWith((async function(){
      try { return await fetch(req); }
      catch {
        const cache = await caches.open(PRECACHE);
        const cached = await cache.match('index.html');
        return cached || Response.error();
      }
    })());
    return;
  }
  event.respondWith((async function(){
    const cache = await caches.open(PRECACHE);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch { return cached || Response.error(); }
  })());
});
