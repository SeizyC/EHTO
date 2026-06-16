import { headers } from "next/headers";
import { LandingClient } from "@/components/LandingClient";
import { countryToLocale } from "@/lib/about-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // reads cf-ipcountry per request

export default function Home() {
  const initialLocale = countryToLocale(headers().get("cf-ipcountry"));
  return <LandingClient initialLocale={initialLocale} />;
}
