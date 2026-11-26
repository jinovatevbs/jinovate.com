/* Jinovate OS service worker: app shell works offline, always tries network first so updates land at once. API calls (script.google.com) are never cached. */
var C = 'jos-v4';
var SHELL = ['./', 'index.html', 'app.css?v=4', 'app.js?v=4', 'icon-192.png', 'manifest.webmanifest'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(C).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (k) { return Promise.all(k.filter(function (x) { return x !== C; }).map(function (x) { return caches.delete(x); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== self.location.origin || u.pathname.indexOf('/ops/') !== 0) return;
  e.respondWith(fetch(e.request).then(function (r) { var cp = r.clone(); if (r.ok) caches.open(C).then(function (c) { c.put(e.request, cp); }); return r; })
    .catch(function () { return caches.match(e.request).then(function (m) { return m || caches.match('index.html'); }); }));
});
