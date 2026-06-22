import { headers } from "next/headers";
import { LandingClient } from "@/components/LandingClient";
import { countryToLocale } from "@/lib/about-content";
import { sceneForCountry } from "@/lib/plaza-scene";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // reads cf-ipcountry per request

export default function Home() {
  const country = headers().get("cf-ipcountry");
  const initialLocale = countryToLocale(country);
  // Pick the time-of-day scene from the visitor's country so SSR paints the
  // correct background immediately (avoids a post-hydration image swap = LCP).
  const initialScene = sceneForCountry(country);
  return <LandingClient initialLocale={initialLocale} initialScene={initialScene} />;
}
