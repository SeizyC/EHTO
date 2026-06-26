import type { Metadata } from "next";
import { headers } from "next/headers";
import { LegalClient } from "@/components/LegalClient";
import { countryToLocale } from "@/lib/about-content";
import { PRIVACY } from "@/lib/legal-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // reads cf-ipcountry per request

export const metadata: Metadata = {
  title: "Privacy Policy — EHTO",
  description: "EHTO privacy policy.",
  alternates: { canonical: "https://ehto.world/privacy" },
};

export default function PrivacyPage() {
  const initialLocale = countryToLocale(headers().get("cf-ipcountry"));
  return <LegalClient initialLocale={initialLocale} doc={PRIVACY} />;
}
