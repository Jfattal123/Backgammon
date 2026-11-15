/* Offline support for the installed app. Built by tools/build.py, which fills in VERSION and PRECACHE.
   The page (index.html) is fetched fresh when there's a connection and served from the cache when not;
   everything else (engine, nets, scripts, icons) comes from the cache, refreshed whenever a new version ships. */
const VERSION = 'a649fa2bc532';
const CACHE = 'prime-' + VERSION, FONTS = 'prime-fonts';
const PRECACHE = ["./", "index.html", "manifest.webmanifest", "engine-worker.js", "engine-api.js", "gnubg-engine.js", "gnubg-engine.wasm", "gnubg-engine-nosimd.js", "gnubg-engine-nosimd.wasm", "gnubg-engine-data.bin", "vendor/firebase-app-compat.js", "vendor/firebase-auth-compat.js", "vendor/firebase-database-compat.js", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('prime-') && k !== CACHE && k !== FONTS).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname === new URL('./', location).pathname) {
      // the page: fresh when online (so updates arrive), cached when not
      e.respondWith((async () => {
        const c = await caches.open(CACHE);
        try {
          const res = await Promise.race([fetch(req, { cache: 'no-cache' }), timeout(4000)]);
          if (res.ok) c.put('./', res.clone());
          return res;
        } catch (err) {
          return (await c.match('./')) || (await c.match('index.html')) || Response.error();
        }
      })());
      return;
    }
    // everything else on this site: cache first, then the network (and keep a copy)
    e.respondWith((async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone());
      return res;
    })());
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    // fonts: use the saved copy straight away, refresh it in the background
    e.respondWith((async () => {
      const c = await caches.open(FONTS);
      const hit = await c.match(req);
      const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
  }
  // anything else (the friend-play database) goes straight to the network
});
