// Minimal offline-shell service worker for the Alpha Firm PWA.
// App shell is cached so the app opens instantly / offline; /api calls always go
// to the network (and fall back to nothing — the UI shows its own loading state).
const CACHE = "alpha-firm-v1";
const SHELL = ["/app.html", "/app-icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // Never cache the API — always hit the live server.
  if (url.pathname.startsWith("/api/")) return;
  // App shell + static assets: cache-first, fall back to network.
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match("/app.html")))
  );
});
