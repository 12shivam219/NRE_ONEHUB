/* Service Worker for NRETech OneHub
   - Caches app shell for offline load
   - Replies to fetches from cache-first then network
   - Listens for `sync` events and posts a message to clients to trigger sync
   - Supports a simple message protocol from clients
*/

const CACHE_NAME = 'nre-onehub-shell-v2';
const RUNTIME_CACHE_NAME = 'nre-onehub-runtime-v2';
const OFFLINE_URLS = ['/', '/index.html'];

const isApiRequest = (requestUrl) => {
  try {
    const url = new URL(requestUrl);
    const isSameOrigin = url.origin === self.location.origin;
    if (!isSameOrigin) return true;
    // Treat Supabase / any backend endpoints as API; do not cache.
    if (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/realtime/')) {
      return true;
    }
    return false;
  } catch {
    return true;
  }
};

const isStaticAsset = (requestUrl) => {
  try {
    const url = new URL(requestUrl);
    if (url.origin !== self.location.origin) return false;
    // Cache common static assets only.
    return (
      url.pathname.startsWith('/assets/') ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.woff2') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.jpg') ||
      url.pathname.endsWith('.jpeg') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.webp')
    );
  } catch {
    return false;
  }
};

// Placeholder for workbox injection. The build step (injectManifest)
// will replace `self.__WB_MANIFEST` with an array of assets to precache.
// Keep this exact identifier so workbox can find and inject it.
self.__WB_MANIFEST = self.__WB_MANIFEST || [];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Cleanup old caches
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== RUNTIME_CACHE_NAME)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = event.request.url;

  // Navigation requests (SPA routing) should return the cached index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // Network-first for navigations; fallback to cached shell.
          const res = await fetch('/index.html', { cache: 'no-store' });
          const cache = await caches.open(CACHE_NAME);
          cache.put('/index.html', res.clone());
          return res;
        } catch {
          const cached = await caches.match('/index.html');
          return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
        }
      })()
    );
    return;
  }

  // Never cache API-ish requests (avoids stale data and reduces cache churn)
  if (isApiRequest(requestUrl)) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(event.request);
        } catch {
          // No cached API fallback (app uses IndexedDB for offline data)
          return new Response('Offline', { status: 503, statusText: 'Offline' });
        }
      })()
    );
    return;
  }

  // App shell static assets: cache-first
  if (isStaticAsset(requestUrl)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        const res = await fetch(event.request);
        try {
          const cache = await caches.open(RUNTIME_CACHE_NAME);
          if (res.status >= 200 && res.status < 300) {
            cache.put(event.request, res.clone());
          }
        } catch {
          // Ignore caching errors
        }
        return res;
      })()
    );
    return;
  }

  // Default: network-first with safe fallback
  event.respondWith(
    (async () => {
      try {
        return await fetch(event.request);
      } catch {
        const cached = await caches.match(event.request);
        return cached || new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })()
  );
});

// Background sync event handler
// Instead of processing sync in service worker, notify main app to handle it
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-offline-queue') {
    event.waitUntil(
      (async () => {
        // Notify all clients to trigger sync in main app
        const clients = await self.clients.matchAll({ includeUncontrolled: true });
        clients.forEach((client) => {
          client.postMessage({ type: 'background-sync' });
        });
      })()
    );
  }
});

// Message protocol for client -> service worker
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || !data.type) return;

  if (data.type === 'trigger-sync') {
    // Immediate message to clients to trigger sync logic in page
    self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: 'background-sync' }));
    });
  }
  // Fallback registration request from page
  if (data.type === 'register-sync-fallback') {
    // Notify clients to trigger sync
    self.clients.matchAll({ includeUncontrolled: true }).then((clients) => {
      clients.forEach((client) => client.postMessage({ type: 'background-sync' }));
    });
  }
});
