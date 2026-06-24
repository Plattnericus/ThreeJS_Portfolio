// No-op service worker (kept only so /sw.js never 404s). It claims clients and
// passes every request straight through to the network — no caching.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
