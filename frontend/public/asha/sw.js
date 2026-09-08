// Retire the old standalone ASHA shell. The current portal is React and is
// served by the root Vite app at /asha/.
const CACHE_NAME = "asha-react-shell-v3";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
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
  if (event.request.method !== "GET" || url.origin.includes("firebaseio.com") || url.origin.includes("open-meteo.com")) {
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(fetch(event.request).catch(() => caches.match("/index.html")));
  }
});
