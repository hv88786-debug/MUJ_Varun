// VARUN — minimal service worker.
// Goal: make the app installable + let the shell open once it's been
// visited before, even with a flaky connection. It deliberately does
// NOT cache API calls or Firebase requests — those must always be live.
const CACHE_NAME = "varun-shell-v1";
const APP_SHELL = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png", "/varun-logo.png"];

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

  // Never intercept API/backend or Firebase calls — those must stay live.
  if (
    event.request.method !== "GET" ||
    url.origin.includes("firebaseio.com") ||
    url.pathname.startsWith("/health") ||
    url.pathname.startsWith("/predict-now") ||
    url.pathname.startsWith("/simulate-alert")
  ) {
    return;
  }

  // Stale-while-revalidate for same-origin static assets (app shell, JS/CSS bundles).
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
