const CACHE_NAME = 'er-garcom-shell-v1';
const APP_SHELL = [
  '/garcom',
  '/garcom.html',
  '/garcom.css',
  '/garcom.js',
  '/garcom.webmanifest',
  '/icons/garcom-192.png',
  '/icons/garcom-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('er-garcom-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // Never cache API calls, login, or changing command data.
  if (request.method !== 'GET' || url.origin !== self.location.origin ||
      url.pathname.startsWith('/api/')) return;

  if (url.pathname === '/garcom' || url.pathname === '/garcom.html' ||
      url.pathname === '/garcom.css' || url.pathname === '/garcom.js' ||
      url.pathname === '/garcom.webmanifest' || url.pathname.startsWith('/icons/garcom-')) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response && response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, response.clone());
        }
        return response;
      } catch (_) {
        const cached = await caches.match(request);
        return cached || Response.error();
      }
    })());
  }
});
