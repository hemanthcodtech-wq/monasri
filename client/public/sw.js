// Mona Sri Enterprises PWA Service Worker
const CACHE_NAME = 'mona-sri-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never intercept API routes, Socket.IO, Vite dev resources, or non-HTTP schemes
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/socket.io') ||
    url.pathname.startsWith('/@') ||
    url.pathname.includes('node_modules') ||
    !url.protocol.startsWith('http')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Cache static assets if valid 200 response
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache).catch(() => {});
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        // Check cache on network failure
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        // For navigation requests, provide fallback HTML
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return new Response(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Mona Sri Enterprises</title></head><body style="font-family:sans-serif;text-align:center;padding:40px;"><h2>Offline</h2><p>Unable to connect to Mona Sri platform. Please check your network and refresh.</p></body></html>',
            { headers: { 'Content-Type': 'text/html' }, status: 503 }
          );
        }

        // Must always return a valid Response object (never undefined)
        return new Response(null, { status: 504, statusText: 'Gateway Timeout' });
      })
  );
});
