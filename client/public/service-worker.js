const CACHE_NAME = "astrododge-shell-v1";

function scopedUrl(path) {
  return new URL(path, self.registration.scope).toString();
}

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const appUrl = scopedUrl("./");
  const response = await fetch(appUrl, { cache: "reload" });
  if (!response.ok) throw new Error(`App shell request failed: ${response.status}`);
  await cache.put(appUrl, response.clone());

  const html = await response.text();
  const referencedUrls = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => new URL(match[1], appUrl))
    .filter((url) => url.origin === self.location.origin)
    .map((url) => url.toString());
  const shellUrls = [
    appUrl,
    scopedUrl("./manifest.webmanifest"),
    scopedUrl("./favicon.png"),
    scopedUrl("./pwa-192.png"),
    ...referencedUrls,
  ];

  await Promise.all([...new Set(shellUrls)].map(async (url) => {
    try {
      const assetResponse = await fetch(url, { cache: "reload" });
      if (assetResponse.ok) await cache.put(url, assetResponse);
    } catch {
      // Optional icons and cached bundles may be unavailable on a constrained connection.
    }
  }));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    cacheAppShell()
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names
          .filter((name) => name.startsWith("astrododge-shell-") && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const requestUrl = new URL(request.url);
  if (request.method !== "GET" || requestUrl.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(async () => (await caches.match(scopedUrl("./"))) || Response.error()),
    );
    return;
  }

  if (!["script", "style", "image", "font"].includes(request.destination)) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => (await caches.match(request)) || Response.error()),
  );
});
