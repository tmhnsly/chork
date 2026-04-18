/// <reference lib="webworker" />

// Bumping this name evicts the old cache on activate. Bump whenever
// the SW logic or pre-cache shape changes so users get the new
// behaviour on next visit.
const CACHE_NAME = "chork-v4";

// App shell — public pages that are safe to cache + serve to any
// user. Explicitly DOES NOT include authed surfaces (profile, wall,
// board, jam, crew, admin) — those render per-user HTML that must
// never be replayed from cache after signout. See `fetch` below.
//
// `/login` is NOT on the shell. Caching it and serving stale HTML
// to an authed user would render the login form for a split second
// before middleware's redirect-to-`/` arrives from the revalidation
// fetch — confusing UX and a subtle signal that the session cookie
// hadn't actually cleared yet. Logging-in is rare enough that a
// plain network fetch is fine.
const SHELL_URLS = ["/", "/privacy", "/terms", "/gyms"];

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

// Signout flush channel — the signOut flow posts `{ type: "clear-cache" }`
// via the registration's active controller before navigating. Wipes
// every named cache so the post-signout shell + static assets get
// re-fetched from the network instead of being re-served with a
// previous session's shape baked in (avatars, nav hints, etc).
self.addEventListener("message", (event) => {
  if (event.data?.type === "clear-cache") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
    );
  }
});

// ── Push notifications ──────────────────────────────────────────
// Server dispatches JSON payloads shaped `{ title, body, url?, tag? }`.
// `url` is the same-origin path we open when the climber taps the
// notification. Validated here to reject anything that isn't a
// leading-slash path — defense-in-depth against open-redirect /
// javascript:-URI shenanigans if the push channel is ever abused.
function safeTargetUrl(url) {
  if (typeof url !== "string") return "/";
  // Reject protocol-relative (//host/...) and anything not starting
  // with a single slash. Reject trailing backslash tricks too.
  if (!url.startsWith("/") || url.startsWith("//") || url.includes("\\")) {
    return "/";
  }
  return url;
}

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Chork", body: event.data.text() };
  }
  const title = typeof payload.title === "string" && payload.title
    ? payload.title
    : "Chork";
  const url = safeTargetUrl(payload.url);
  // `tag` coalesces related notifications so a burst of invites
  // doesn't stack up in the tray. Fall back to a generic tag when
  // the server doesn't set one.
  const tag = typeof payload.tag === "string" && payload.tag
    ? payload.tag
    : "chork-notification";
  const options = {
    body: typeof payload.body === "string" ? payload.body : "",
    icon: "/notification-icon.svg",
    badge: "/notification-icon.svg",
    tag,
    data: { url },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = safeTargetUrl(event.notification.data?.url);
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

  // Skip non-GET requests and cross-origin calls (Supabase, CDNs).
  if (request.method !== "GET") return;
  if (url.hostname !== self.location.hostname) return;

  // ── HTML caching — STRICTLY the public shell ─────────────
  // Authed pages (profile, wall, board, jam, crew, admin, /u/*)
  // render per-user HTML that MUST NOT be replayed after signout
  // or served to a different user on the same browser. Only the
  // explicit `SHELL_URLS` allowlist goes through the stale-while-
  // revalidate path; everything else HTML falls straight through
  // to `return` below so the browser performs a normal network
  // request, middleware runs, and the cookieless response is what
  // the user actually sees.
  if (request.headers.get("accept")?.includes("text/html")) {
    // Normalise trailing slash so "/login/" hits the same entry
    // as "/login".
    const path = url.pathname.replace(/\/$/, "") || "/";
    if (!SHELL_URLS.includes(path)) {
      return;
    }
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
