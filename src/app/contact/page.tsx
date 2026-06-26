import type { Metadata } from "next";
import { headers } from "next/headers";
import { LegalClient } from "@/components/LegalClient";
import { countryToLocale } from "@/lib/about-content";
import { CONTACT } from "@/lib/legal-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // reads cf-ipcountry per request

export const metadata: Metadata = {
  title: "Contact — EHTO",
  description: "Get in touch with EHTO.",
  alternates: { canonical: "https://ehto.world/contact" },
};

export default function ContactPage() {
  const initialLocale = countryToLocale(headers().get("cf-ipcountry"));
  return <LegalClient initialLocale={initialLocale} doc={CONTACT} />;
}
