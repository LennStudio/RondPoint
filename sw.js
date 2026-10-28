/* Service worker — fonctionnement hors ligne */
const VERSION = 'v3';
const CACHE = `rondpointoufake-${VERSION}`;

const SHELL = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'manifest.json',
  'data/images.json',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // Pré-charge toutes les images listées dans le JSON (au mieux)
    try {
      const data = await (await fetch('data/images.json', { cache: 'no-cache' })).json();
      const srcs = [...(data.real || []), ...(data.fake || [])].map((i) => i.src);
      await Promise.allSettled(srcs.map((s) => cache.add(s)));
    } catch { /* hors ligne ou JSON absent */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isImage = url.pathname.includes('/images/');

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req, { ignoreSearch: true });

    // Images : cache d'abord
    if (isImage && cached) return cached;

    // Le reste : réponse du cache tout de suite, mise à jour en arrière-plan
    const network = fetch(req)
      .then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      })
      .catch(() => null);

    if (cached) return cached;
    const res = await network;
    if (res) return res;
    if (req.mode === 'navigate') return cache.match('index.html');
    return new Response('', { status: 504, statusText: 'Hors ligne' });
  })());
});
