/* MTC POS service worker.
 *
 * THE ONE RULE: /api is NEVER cached.
 *
 * This runs a shop. Stock levels, prices, customer balances and invoice numbers
 * must be the live truth or someone sells stock that is gone, or bills the wrong
 * price. A cached API response is a wrong number wearing a convincing face — far
 * more dangerous than an honest error. So every /api request goes to the network
 * and is allowed to fail if the network is down.
 *
 * What IS cached is the shell — the JavaScript, CSS and icons. Those are content
 * hashed by the build, so a new deploy produces new filenames and can never be
 * served stale. Caching them means the app opens instantly and, if the connection
 * drops, still opens far enough to say so properly instead of showing a browser
 * error page.
 */

const VERSION = "mtc-v1";
const SHELL = `${VERSION}-shell`;
const OFFLINE_URL = "/offline.html";

// The minimum needed to render something sensible with no network.
const PRECACHE = ["/", OFFLINE_URL, "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL)
      // Individually, so one 404 cannot fail the whole install.
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only GET is ever cacheable. A POST is someone changing the business.
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Cross-origin (Google Fonts and friends) — leave the browser to it.
  if (url.origin !== self.location.origin) return;

  // ── Live data. Never cached, never served stale. ──
  if (url.pathname.startsWith("/api/")) return;

  // ── Page loads: network first, fall back to the shell so the app still opens. ──
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put("/", copy)).catch(() => {});
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(SHELL);
          return (await cache.match("/")) || (await cache.match(OFFLINE_URL)) ||
            new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        }),
    );
    return;
  }

  // ── Build assets: cache first. Filenames are content hashed, so this is safe. ──
  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    }),
  );
});
