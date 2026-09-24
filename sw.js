/* Service worker: guarda tudo no aparelho para o jogo abrir sem internet.
   Ao mudar qualquer arquivo, suba a versão do CACHE. */
const CACHE = 'oval500-v1';
const ASSETS = [
  './', './index.html', './style.css?v=1', './manifest.webmanifest',
  './js/main.js?v=1', './js/data.js', './js/track.js', './js/cars.js', './js/sim.js',
  './js/view.js', './js/hud.js', './js/input.js', './js/audio.js',
  './js/vendor/three.module.min.js', './js/vendor/BufferGeometryUtils.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
/* rede primeiro (pega atualizações), cache se estiver offline */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req, { cache: 'no-cache' }).then(res => {
      if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: false }).then(hit => hit || caches.match(req, { ignoreSearch: true })))
  );
});
