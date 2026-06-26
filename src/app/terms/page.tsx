import type { Metadata } from "next";
import { headers } from "next/headers";
import { LegalClient } from "@/components/LegalClient";
import { countryToLocale } from "@/lib/about-content";
import { TERMS } from "@/lib/legal-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // reads cf-ipcountry per request

export const metadata: Metadata = {
  title: "Terms of Service — EHTO",
  description: "EHTO terms of service.",
  alternates: { canonical: "https://ehto.world/terms" },
};

export default function TermsPage() {
  const initialLocale = countryToLocale(headers().get("cf-ipcountry"));
  return <LegalClient initialLocale={initialLocale} doc={TERMS} />;
}
