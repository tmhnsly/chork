/// <reference lib="webworker" />

// Bumping this name evicts the old cache on activate. Bump whenever
// the SW logic or pre-cache shape changes so users get the new
// behaviour on next visit.
const CACHE_NAME = "chork-v2";

// App shell — cached on install for instant loads
const SHELL_URLS = ["/", "/login", "/onboarding", "/leaderboard", "/privacy"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Clean up old caches
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Push notifications ──────────────────────────────────────────
// Server dispatches JSON payloads shaped `{ title, body, url? }`.
// `url` is the path we open when the climber taps the notification.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Chork", body: event.data.text() };
  }
  const title = payload.title || "Chork";
  const options = {
    body: payload.body || "",
    icon: "/notification-icon.svg",
    badge: "/notification-icon.svg",
    data: { url: payload.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // If the app is already open, focus that tab and navigate.
      for (const client of all) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          if ("navigate" in client) {
            try { await client.navigate(targetUrl); } catch { /* cross-origin guard */ }
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and Supabase API calls
  if (request.method !== "GET") return;
  if (url.hostname !== self.location.hostname) return;

  // Stale-while-revalidate for HTML pages: paint cached shell
  // *immediately* on cold open + refresh the cache in the background.
  // The user sees an instant first paint, then the layout streams
  // fresher RSC data when the network catches up. Falls back to
  // network-first when no cached entry exists.
  if (request.headers.get("accept")?.includes("text/html")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((response) => {
            // Only cache successful, non-opaque responses to avoid
            // poisoning the shell cache with 404s or auth redirects.
            if (response.ok) {
              cache.put(request, response.clone()).catch(() => {});
            }
            return response;
          })
          .catch(() => null);
        if (cached) {
          // Kick off background refresh but don't wait on it.
          event.waitUntil(networkPromise);
          return cached;
        }
        const network = await networkPromise;
        return network ?? cached ?? new Response("Offline", { status: 503 });
      })
    );
    return;
  }

  // Cache-first for static assets (JS, CSS, images, fonts).
  // Hashed filenames mean the cache entry is content-addressed —
  // revalidation isn't needed.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icon-") ||
    url.pathname.startsWith("/apple-splash-") ||
    url.pathname.endsWith(".woff2")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
    return;
  }
});
