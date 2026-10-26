const CACHE = 'dron-espana-v2';
const SHELL = ['./', './index.html', './styles.css', './app.js', './ui.js', './data.js', './rules.json', './manifest.webmanifest', './icon.svg',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Shell: red primero (así siempre ves la última versión y noticias) y caché solo si no hay conexión.
// Datos de ENAIRE, tiempo y mapas: nunca se cachean (no se sirven zonas caducadas).
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  const isShell = u.origin === location.origin || u.hostname === 'cdnjs.cloudflare.com';
  if (!isShell) return;
  e.respondWith(fetch(e.request).then(res => {
    if (res.ok && !u.pathname.endsWith('news.json')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request)));
});
