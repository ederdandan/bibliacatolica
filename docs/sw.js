// Service worker: app offline.
// Ao publicar mudanças no app, aumente VERSION. Ao regenerar os dados (docs/data/books), aumente DATA_VERSION.
const VERSION = '1.1.0';
const DATA_VERSION = '1';
const SHELL = `shell-${VERSION}`;
const DATA = `data-${DATA_VERSION}`;
const FONTS = 'fonts-1';
const FONT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com']);

const SHELL_FILES = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/bible.js',
  'js/store.js',
  'js/plans.js',
  'js/tts.js',
  'js/liturgy.js',
  'manifest.webmanifest',
  'data/index.json',
  'icons/favicon-32.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png',
];

const scoped = (p) => new URL(p, self.registration.scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES.map(scoped))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, DATA, FONTS]);
      for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreSearch: true });
  const net = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return hit || (await net) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Fontes do Google: cache permanente para funcionar offline.
  if (FONT_HOSTS.has(url.hostname)) {
    event.respondWith(cacheFirst(req, FONTS));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (url.pathname.includes('/data/books/')) {
    event.respondWith(cacheFirst(req, DATA));
    return;
  }
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) (await caches.open(SHELL)).put(scoped('./'), res.clone());
          return res;
        } catch {
          return (await caches.match(scoped('./'))) || (await caches.match(scoped('index.html'))) || Response.error();
        }
      })(),
    );
    return;
  }
  event.respondWith(staleWhileRevalidate(req, SHELL));
});
