const CACHE = 'afya-toto-shell-v1'
const SHELL = ['/', '/index.html']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return
  event.respondWith(fetch(request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()))
    return response
  }).catch(async () => (await caches.match(request)) || caches.match('/index.html')))
})