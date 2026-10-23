var CACHE_NAME = 'rill-shell-v9';
var SHELL_FILES = ['./', './index.html', './styles.css?v=7', './apple-mobile.css?v=7', './app.js?v=7', './playlist-import.js?v=5', './auth-config.js', './manifest.webmanifest', './rill-icon.svg'];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(SHELL_FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) { return Promise.all(keys.filter(function (key) { return key.indexOf('rill-shell-') === 0 && key !== CACHE_NAME; }).map(function (key) { return caches.delete(key); })); }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(function (response) {
      var copy = response.clone();
      caches.open(CACHE_NAME).then(function (cache) { cache.put('./index.html', copy); });
      return response;
    }).catch(function () { return caches.match('./index.html').then(function (cached) { return cached || caches.match('./'); }); }));
    return;
  }
  event.respondWith(caches.match(request).then(function (cached) {
    if (cached) return cached;
    return fetch(request).then(function (response) {
      if (response.ok) { var copy = response.clone(); caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); }); }
      return response;
    });
  }));
});
