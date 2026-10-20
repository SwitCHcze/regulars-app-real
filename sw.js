// Regulars: lets the installed app open without internet.
const CACHE = 'regulars-v4';
const FILES = ['./', 'index.html', 'styles.css', 'app.js', 'demo.js', 'demo-data.js', 'manifest.webmanifest', 'fonts/archivo-latin-ext.woff2', 'fonts/archivo-latin.woff2', 'fonts/figtree-latin-ext.woff2', 'fonts/figtree-latin.woff2', 'fonts/jetbrains-mono-latin-ext.woff2', 'fonts/jetbrains-mono-latin.woff2', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(m => m || caches.match('index.html'))));
});
