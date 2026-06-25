import { headers } from "next/headers";
import { LandingClient } from "@/components/LandingClient";
import { countryToLocale } from "@/lib/about-content";
import { sceneForCountry, sceneSrc } from "@/lib/plaza-scene";
import type { Metadata } from "next";
import { webApplicationNode, graphJson, SITE_URL } from "@/lib/structured-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // reads cf-ipcountry per request

// The landing serves one URL for all locales (content localises by IP/​toggle),
// so canonical is the bare origin with language alternates pointing back to it.
export const metadata: Metadata = {
  alternates: {
    canonical: SITE_URL,
    languages: {
      "ko-KR": SITE_URL,
      "ja-JP": SITE_URL,
      en: SITE_URL,
      "x-default": SITE_URL,
    },
  },
};

export default function Home() {
  const country = headers().get("cf-ipcountry");
  const initialLocale = countryToLocale(country);
  // Pick the time-of-day scene from the visitor's country so SSR paints the
  // correct background immediately (avoids a post-hydration image swap = LCP).
  const initialScene = sceneForCountry(country);
  return (
    <>
      {/* Product entity on the primary landing page — the page crawlers and
          answer engines hit first. Org + WebSite come from the root layout;
          this reconciles with them by shared @id. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: graphJson([webApplicationNode()]) }}
      />
      {/* Preload the LCP scene image so it fetches at navigation start
          instead of after the CSS — kills the LCP "load delay". */}
      <link rel="preload" as="image" href={sceneSrc(initialScene)} fetchPriority="high" />
      {/* Preload the (tiny, subset) pixel font so the hero headline — the LCP
          text — paints in Galmuri11 immediately instead of waiting for the CSS
          to discover it. crossorigin is required even same-origin for fonts. */}
      <link rel="preload" as="font" type="font/woff2" href="/fonts/Galmuri11-Bold.subset.woff2" crossOrigin="anonymous" />
      <link rel="preload" as="font" type="font/woff2" href="/fonts/Galmuri11.subset.woff2" crossOrigin="anonymous" />
      <LandingClient initialLocale={initialLocale} initialScene={initialScene} />
    </>
  );
}
