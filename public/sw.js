/*
 * Offline helper for 6IX DEGREES.
 *
 * Your network lives in the browser's storage, so once these files are cached
 * the whole app keeps working with no internet connection.
 *
 * - Pages: try the network first (so updates arrive), fall back to the cache.
 * - Built files under /_next/static: cache first (their names change on update).
 */
const VERSION = "6ix-v1";
const PAGES = ["/", "/circle", "/map", "/memory", "/discover", "/ask"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll([...PAGES, "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(VERSION)).put(request, response.clone());
  return response;
}

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = (await cache.match(request)) || (fallbackUrl && (await cache.match(fallbackUrl, { ignoreSearch: true })));
    if (cached) return cached;
    throw new Error("offline and not cached");
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || /\.(png|ico|svg|woff2?)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  } else if (request.mode === "navigate") {
    // Open the saved copy of the page; if it was never visited, open Home.
    event.respondWith(networkFirst(request, url.pathname).catch(() => caches.match("/")));
  } else {
    // In-app page data (React Server Component payloads) and anything else.
    event.respondWith(networkFirst(request));
  }
});
