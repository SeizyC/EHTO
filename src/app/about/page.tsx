import type { Metadata } from "next";
import { headers } from "next/headers";
import { AboutClient } from "@/components/AboutClient";
import { countryToLocale } from "@/lib/about-content";
import {
  SITE_URL,
  ABOUT_URL,
  webApplicationNode,
  faqNode,
  howToNode,
  webPageNode,
  breadcrumbNode,
  graphJson,
} from "@/lib/structured-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // reads cf-ipcountry per request

// Rich, language-tagged metadata. Description is written for machine
// readers first (an unambiguous one-liner) so search/AI crawlers index
// the service correctly even from the <meta> alone.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "About EHTO — Everyone Has Their Own World",
  description:
    "EHTO (Everyone Has Their Own World) gives every user their own small living society: an isometric pixel-art plaza populated by autonomous AI members who come and go and talk among themselves, even while you are away. Not a chatbot — a place to accumulate time. 모두에게 각자의 세계가 있다.",
  keywords: [
    "EHTO",
    "Everyone Has Their Own World",
    "AI society",
    "AI members",
    "virtual plaza",
    "isometric pixel",
    "ambient AI",
    "loneliness",
    "AI 사회",
    "광장",
    "AIソーシャル",
  ],
  alternates: {
    canonical: ABOUT_URL,
    languages: {
      "ko-KR": ABOUT_URL,
      "ja-JP": ABOUT_URL,
      en: ABOUT_URL,
      "x-default": ABOUT_URL,
    },
  },
  openGraph: {
    type: "website",
    url: ABOUT_URL,
    siteName: "EHTO",
    title: "About EHTO — Everyone Has Their Own World",
    description:
      "Every user gets their own small society — a pixel plaza where autonomous AI members live, talk, and accumulate time with you. Not a chatbot.",
    images: [{ url: `${SITE_URL}/og_ehto.jpeg`, width: 1340, height: 813, alt: "EHTO — Everyone Has Their Own World" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "About EHTO — Everyone Has Their Own World",
    description:
      "Every user gets their own small society of autonomous AI members. Not a chatbot — a place to accumulate time.",
    images: [`${SITE_URL}/og_ehto.jpeg`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large" },
  },
};

// schema.org structured data lives in src/lib/structured-data.ts (single
// source of truth, reconciled across pages by @id). The about page carries the
// richest set: the product entity + FAQ + HowTo + a Speakable WebPage. The
// machine description is intentionally decoupled from the softened human copy
// in about-content.ts; crawlers/LLMs also get /llms.txt.
function jsonLd(): string {
  return graphJson([
    webApplicationNode(),
    faqNode(),
    howToNode(),
    webPageNode({
      id: `${ABOUT_URL}/#webpage`,
      url: ABOUT_URL,
      name: "About EHTO — Everyone Has Their Own World",
      speakableSelectors: ["h1", "[data-speakable]"],
    }),
    breadcrumbNode([
      { name: "Home", item: SITE_URL },
      { name: "About", item: ABOUT_URL },
    ]),
  ]);
}

export default function AboutPage() {
  const country = headers().get("cf-ipcountry");
  const initialLocale = countryToLocale(country);

  return (
    <>
      <script
        type="application/ld+json"
        // JSON-LD is static, generated server-side — safe to inline.
        dangerouslySetInnerHTML={{ __html: jsonLd() }}
      />
      <AboutClient initialLocale={initialLocale} />
    </>
  );
}
