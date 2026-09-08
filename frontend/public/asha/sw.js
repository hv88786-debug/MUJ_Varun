// ASHA Worker Portal — minimal service worker scoped to /asha/.
// Makes the portal installable and lets it open offline (it already
// queues reports in IndexedDB and syncs to Firebase when back online —
// this just makes sure the page shell itself loads without a connection).
const CACHE_NAME = "asha-portal-shell-v1";
const APP_SHELL = ["/asha/index.html", "/asha/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept Firebase or weather API calls — those must stay live;
  // the page's own IndexedDB queue already handles offline writes.
  if (
    event.request.method !== "GET" ||
    url.origin.includes("firebaseio.com") ||
    url.origin.includes("open-meteo.com")
  ) {
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request)
            .then((response) => {
              if (response && response.status === 200) {
                cache.put(event.request, response.clone());
              }
              return response;
            })
            .catch(() => cached);
          return cached || fetchPromise;
        })
      )
    );
  }
});
