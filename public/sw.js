const PRECACHE = 'precache-v1';
const RUNTIME = 'runtime-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter(k => ![PRECACHE, RUNTIME].includes(k)).map(k => caches.delete(k))
    ))
  );
});

// Mensagens do app para pré-carregar URLs (imagens + /api/catalog)
self.addEventListener('message', async (event) => {
  const data = event.data || {};
  if (data.type === 'CACHE_URLS' && Array.isArray(data.urls)){
    const cache = await caches.open(RUNTIME);
    await Promise.all(data.urls.map(u => fetch(u, { mode:'no-cors' }).then(res => cache.put(u, res)).catch(()=>null)));
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

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

  // network-first para API de catálogo (com fallback ao cache)
  if (request.url.includes('/api/catalog')){
    event.respondWith((async ()=>{
      const cache = await caches.open(RUNTIME);
      try{
        const network = await fetch(request);
        cache.put(request, network.clone());
        return network;
      }catch(e){
        const cached = await cache.match(request);
        if (cached) return cached;
        return new Response(JSON.stringify({ products:[], settings:{ categoriesOrder:[] } }), { headers:{'Content-Type':'application/json'} });
      }
    })());
    return;
  }
});
