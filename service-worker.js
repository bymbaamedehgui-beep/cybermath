// v2 — 2026-07-17 rollback дараах cache clear
const CACHE = 'cybermath-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/admin.html',
  '/mathlive.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // API дуудалтыг cache хийхгүй
  if (e.request.url.includes('/api/')) return;
  // Network-first for HTML — хуучин cache-ийг үзүүлэхээс сэргийлж, шинэ хувилбарыг татна
  var url = e.request.url;
  var isHtml = url.endsWith('/') || url.endsWith('.html') || e.request.destination === 'document';
  if (isHtml) {
    e.respondWith(
      fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // Бусад assets — cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, clone));
        return res;
      }).catch(() => cached);
    })
  );
});
