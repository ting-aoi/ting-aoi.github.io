// Futaba SW — BUILD: 1786283490
const BUILD = '1786283490';
const CACHE = 'futaba-' + BUILD;
const STATIC = [
  './manifest.json',
  './assets/sc2tc.json',
  './assets/defaults.json',
  './assets/css/main.css?v=' + BUILD,
  './assets/js/storage.js?v=' + BUILD,
  './assets/js/search.js?v=' + BUILD,
  './assets/js/ui.js?v=' + BUILD,
  './assets/js/pages.js?v=' + BUILD,
  './assets/js/editor.js?v=' + BUILD,
  './assets/js/settings.js?v=' + BUILD,
  './assets/js/app.js?v=' + BUILD
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k!==CACHE && k!=='futaba-fonts').map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = e.request.url;
  // v3.0 字型執行期快取：Google Fonts 首載後離線可用；獨立 cache 不隨版本清除
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.open('futaba-fonts').then(c =>
        c.match(e.request).then(hit => hit || fetch(e.request).then(r => {
          if (r.ok) c.put(e.request, r.clone());
          return r;
        }))
      ).catch(() => fetch(e.request))
    );
    return;
  }
  // Never cache: API, data files, index.html, root
  if (url.includes('/api/') || url.includes('/data/') ||
      url.endsWith('index.html') || url.endsWith('/') || url.match(/:\d+\/?$/)) {
    e.respondWith(fetch(e.request, {cache:'no-store'}).catch(() => new Response('',{status:404})));
    return;
  }
  // Network-first for changelog (keep fresh)
  if (url.includes('changelog.json')) {
    e.respondWith(fetch(e.request, {cache:'no-store'}).catch(() => caches.match(e.request)));
    return;
  }
  // Cache-first for fonts and CDN
  if (url.includes('fonts.goo') || url.includes('cdnjs')) {
    e.respondWith(fetch(e.request).then(res => {
      caches.open(CACHE).then(c => c.put(e.request, res.clone())); return res;
    }).catch(() => caches.match(e.request)));
    return;
  }
  // Cache-first for static assets
  e.respondWith(caches.match(e.request).then(cached =>
    cached || fetch(e.request).then(res => {
      if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      return res;
    })
  ));
});

// Allow page to trigger skipWaiting immediately (for instant updates)
self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
