// Edge-cache wrapper around the OpenNext worker.
//
// The marketing landing (/) is `force-dynamic` because it reads cf-ipcountry
// to SSR the correct time-of-day scene (avoids a post-hydration background
// swap that would hurt LCP). That per-request render costs ~300ms TTFB and
// can't be cached by Next itself.
//
// Since the landing HTML varies ONLY by the visitor's country (→ timezone →
// scene/locale) and sets no cookies, we cache the rendered document in the
// Worker's own Cache API keyed by country for a short TTL. Cache hits skip the
// Next render entirely. Everything else passes straight through to OpenNext.
//
// IMPORTANT: only the copy stored in caches.default is marked `public`; the
// response handed back to the client stays `private` so no shared proxy / CDN
// ever caches `/` across countries (which would leak one country's scene to
// all). The per-country keying lives entirely in our Cache API key.
//
// Re-exports the OpenNext worker's named exports (Durable Object classes) so
// wrangler still finds them when this file is the entry point.

export * from "./.open-next/worker.js";
import openNextWorker from "./.open-next/worker.js";

const LANDING_TTL = 300; // seconds; scene buckets are hours wide, 5min staleness at a boundary is fine
const CLIENT_CC = "private, no-cache, no-store, max-age=0, must-revalidate";

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      const isLandingDoc =
        request.method === "GET" &&
        (url.pathname === "/" || url.pathname === "") &&
        // Only the full HTML document — let Next's RSC navigation/prefetch
        // payloads (which Vary by RSC headers) pass through uncached.
        !request.headers.get("RSC") &&
        !request.headers.get("Next-Router-Prefetch");

      if (!isLandingDoc) {
        return openNextWorker.fetch(request, env, ctx);
      }

      const country = request.headers.get("cf-ipcountry") || "XX";
      const cache = caches.default;
      const cacheKey = new Request(`${url.origin}/__edge-landing/${country}`, { method: "GET" });

      const hit = await cache.match(cacheKey);
      if (hit) {
        const r = new Response(hit.body, hit);
        r.headers.set("Cache-Control", CLIENT_CC); // never let the client/CDN cache cross-country
        r.headers.set("x-edge-landing-cache", "HIT");
        return r;
      }

      const res = await openNextWorker.fetch(request, env, ctx);
      const ct = res.headers.get("content-type") || "";
      if (res.status !== 200 || !ct.includes("text/html")) {
        return res;
      }

      // Store a `public` copy in our edge cache (per-country key)…
      const stored = new Response(res.body, res);
      stored.headers.set("Cache-Control", `public, s-maxage=${LANDING_TTL}`);
      stored.headers.delete("Set-Cookie");
      stored.headers.delete("Vary");
      ctx.waitUntil(cache.put(cacheKey, stored.clone()));

      // …but hand the client a `private` copy so nothing caches `/` globally.
      const out = new Response(stored.body, stored);
      out.headers.set("Cache-Control", CLIENT_CC);
      out.headers.set("x-edge-landing-cache", "MISS");
      return out;
    } catch {
      // Never let the cache layer take down the site — fall back to OpenNext.
      return openNextWorker.fetch(request, env, ctx);
    }
  },
};
