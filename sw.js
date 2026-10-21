importScripts('./offline-manifest.js');
const CACHE_NAME = "osistec-app-v21";
const APP_FILES = [
  "./",
  "./index.html",
  "./style.css?v=20",
  "./auth.js?v=20",
  "./app.js?v=20",
  "./offline-pack.js",
  "./direct-runtime.js",
  "./manifest.webmanifest?v=16",
  "./assets/osistec-logo.jpeg",
  "./assets/icon-192.png",
  "./assets/icon-512.png",
  ...self.OSISTEC_OFFLINE_FILES.map((file) => './' + file),
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (let i = 0; i < APP_FILES.length; i += 4) {
      await cache.addAll(APP_FILES.slice(i, i + 4));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const hadPreviousVersion = keys.some((key) => key.startsWith("osistec-app-") && key !== CACHE_NAME);
      await Promise.all(keys.filter((key) => key.startsWith("osistec-app-") && key !== CACHE_NAME).map((key) => caches.delete(key)));
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
  if (new URL(request.url).pathname.endsWith('/sw.js')) return;
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      if (cached && !isNavigation) return cached;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      try {
        const response = await fetch(request, { cache: "no-cache", signal: controller.signal });
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        if (!response.ok && isNavigation) return (await caches.match("./index.html")) || response;
        return response;
      } catch {
        return cached || (isNavigation ? (await caches.match("./index.html")) || Response.error() : Response.error());
      } finally {
        clearTimeout(timeout);
      }
    })(),
  );
});
