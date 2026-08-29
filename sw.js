const CACHE_NAME = "osistec-app-v9";
const APP_FILES = [
  "./",
  "./index.html",
  "./style.css?v=9",
  "./auth.js?v=9",
  "./app.js?v=9",
  "./manifest.webmanifest?v=9",
  "./assets/osistec-logo.jpeg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const hadPreviousVersion = keys.some((key) => key.startsWith("osistec-app-") && key !== CACHE_NAME);
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();

      if (hadPreviousVersion) {
        const windows = await self.clients.matchAll({ type: "window" });
        await Promise.all(windows.map((client) => client.navigate(client.url)));
      }
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;

  const request = event.request;
  const isNavigation = request.mode === "navigate";
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request, { cache: "no-cache" });
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        return (await caches.match(request)) || (isNavigation ? caches.match("./index.html") : Response.error());
      }
    })(),
  );
});
