// Deixa o app abrir sem internet. Ao publicar uma versão nova, mude o número abaixo.
const CACHE = 'financas-v3';
const ARQUIVOS = ['./', 'index.html', 'app.js', 'parser.js', 'config.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin === location.origin) {
    // arquivos do app: tenta a internet (para pegar atualizações) e cai no cache se estiver offline
    e.respondWith(fetch(e.request.url, { cache: 'no-cache' }).then((r) => {
      if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))));
  } else if (url.hostname === 'www.gstatic.com') {
    // biblioteca do Firebase: guarda na primeira vez
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((resp) => {
      if (resp.ok) { const copia = resp.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); }
      return resp;
    })));
  }
});
