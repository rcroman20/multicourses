const CACHE_NAME = "socrattica-v3";
const PLATFORM_NAME_CACHE_URL = "/__platform-name";
const APP_SHELL = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/brand-mark.svg",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestURL = new URL(event.request.url);
  const isHTMLRequest = event.request.mode === "navigate" || event.request.headers.get("accept")?.includes("text/html");

  if (requestURL.origin !== self.location.origin) return;

  if (isHTMLRequest) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          return cached || caches.match("/offline.html");
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match("/offline.html"));
    })
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;

  if (data.type === "SET_PLATFORM_NAME") {
    const platformName =
      typeof data.platformName === "string" && data.platformName.trim()
        ? data.platformName.trim()
        : "";
    if (!platformName) return;

    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) =>
        cache.put(
          PLATFORM_NAME_CACHE_URL,
          new Response(JSON.stringify({ platformName }), {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            },
          }),
        ),
      ),
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const rawLink = event.notification?.data?.link;
  const targetLink = typeof rawLink === "string" && rawLink.trim() ? rawLink.trim() : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          if (client.url.includes(targetLink)) {
            return client.focus();
          }
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetLink);
      }

      return undefined;
    })
  );
});
