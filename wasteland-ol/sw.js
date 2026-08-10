// Wasteland SW — BUILD: 1786401658
const BUILD = '1786401658';
const CACHE = 'wol-' + BUILD;
const STATIC = [
  './manifest.json',
  './assets/css/main.css?v=' + BUILD,
  './assets/js/version.js?v=' + BUILD,
  './assets/js/rules.js?v=' + BUILD,
  './assets/js/state.js?v=' + BUILD,
  './assets/js/time.js?v=' + BUILD,
  './assets/js/explore.js?v=' + BUILD,
  './assets/js/combat.js?v=' + BUILD,
  './assets/js/content.js?v=' + BUILD,
  './assets/js/storage.js?v=' + BUILD,
  './assets/js/ui.js?v=' + BUILD,
  './assets/js/pages.js?v=' + BUILD,
  './assets/js/app.js?v=' + BUILD
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== 'wol-fonts').map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // 字型執行期快取：首載後離線可用；獨立 cache 不隨版本清除
  if (url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
    e.respondWith(
      caches.open('wol-fonts').then(c =>
        c.match(e.request).then(hit => hit || fetch(e.request).then(r => {
          if (r.ok) c.put(e.request, r.clone());
          return r;
        }))
      ).catch(() => fetch(e.request))
    );
    return;
  }

  // 永不快取：API、遊戲資料、存檔、index.html、根路徑
  if (url.includes('/api/') || url.includes('/assets/data/') || url.includes('/save/') ||
      url.endsWith('index.html') || url.endsWith('/') || url.match(/:\d+\/?$/)) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(() => new Response('', { status: 404 })));
    return;
  }

  // 更新日誌走網路優先（保持最新）
  if (url.includes('changelog.json')) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request)));
    return;
  }

  // 其餘靜態資源快取優先
  e.respondWith(caches.match(e.request).then(cached =>
    cached || fetch(e.request).then(res => {
      if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      return res;
    })
  ));
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
