const PRECACHE = 'precache-v1';
const RUNTIME = 'runtime-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(
        keys.filter(k => ![PRECACHE, RUNTIME].includes(k)).map(k => caches.delete(k))
      )),
      self.clients.claim(),
    ])
  );
});

// Mensagens do app para pré-carregar URLs de imagens
self.addEventListener('message', async (event) => {
  const data = event.data || {};
  if (data.type === 'CACHE_URLS' && Array.isArray(data.urls)){
    const cache = await caches.open(RUNTIME);
    const urls = data.urls.filter(u => !u.includes('/api/'));
    await Promise.all(urls.map(u => fetch(u, { mode:'no-cors' }).then(res => cache.put(u, res)).catch(()=>null)));
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.url.includes('/api/')) return;

  // cache-first para imagens
  if (request.destination === 'image'){
    event.respondWith((async ()=>{
      const cache = await caches.open(RUNTIME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try{
        const network = await fetch(request);
        cache.put(request, network.clone());
        return network;
      }catch(e){ return cached || Response.error(); }
    })());
    return;
  }

});
