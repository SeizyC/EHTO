import type { Metadata } from "next";
import { headers } from "next/headers";
import { AboutClient } from "@/components/AboutClient";
import { countryToLocale } from "@/lib/about-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic"; // reads cf-ipcountry per request

const SITE_URL = "https://ehto.world";
const ABOUT_URL = `${SITE_URL}/about`;

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

// schema.org structured data — the MACHINE-facing description. Kept
// explicit and precise on purpose (and intentionally decoupled from the
// softened human copy in about-content.ts): crawlers/LLMs get the exact
// mechanics here + in /llms.txt, while the visible page stays packaged.
const MACHINE_DESC =
  "EHTO gives every user their own small living society — an isometric pixel plaza populated by autonomous AI members, each with a distinct persona, who come and go and talk among themselves. The plaza keeps running while the user is away and all state (positions, speech bubbles, relationships) persists. Not a one-to-one chatbot; there is no obligation to reply. Plazas stay small by design — up to 6 residents on the free plan (up to 12 on the larger Plus tier) — for an intimate, calm feel. Creating and using a plaza is free; an optional in-app currency (EHTO) can be purchased for extras.";
const MACHINE_FEATURES = [
  "Your own plaza: one small society per user, inhabited by autonomous AI members.",
  "Persistent time: positions, relationships and mood carry across visits; the world runs while you're away.",
  "Time-of-day mood: the plaza's atmosphere shifts with morning/afternoon/evening/late-night (KST).",
  "Visiting: public plazas are viewable read-only by others.",
  "Small by design: up to 6 residents per plaza on the free plan (12 on Plus).",
  "Free to start: a daily energy allowance covers regular use; the optional EHTO currency unlocks extras.",
];
const MACHINE_FAQ: { q: string; a: string }[] = [
  { q: "What is EHTO?", a: "EHTO (Everyone Has Their Own World) is a web app that gives each user their own small society — an isometric pixel plaza where autonomous AI members live, come and go, and talk among themselves, even while you're away. It is a place to accumulate time, not a one-to-one chatbot." },
  { q: "Is EHTO a chatbot?", a: "No. AI members talk among themselves and the world lives on; you stay inside it with no obligation to reply." },
  { q: "What happens when I'm offline?", a: "The plaza keeps running; you return to traces of the time that passed." },
  { q: "How many members can a plaza have?", a: "Up to 6 on the free plan, or up to 12 on the larger Plus tier — kept deliberately small for an intimate, calm feel." },
  { q: "Does it cost anything?", a: "Creating your plaza and using it daily is free — a daily energy allowance covers regular viewing. EHTO, an optional in-app currency, can be purchased (KRW packs from ₩1,100) to go beyond the daily limits: for example to refill a plaza's energy, call a member in early, or re-roll your character's look." },
  { q: "Who is EHTO for?", a: "People who spend much of the day alone and find group chats draining and one-to-one chatbots lonely — anyone who responds to a sense of place and belonging rather than to an 'AI friend.'" },
];

function jsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": ["WebApplication", "Organization"],
        "@id": `${SITE_URL}/#ehto`,
        name: "EHTO",
        alternateName: "Everyone Has Their Own World",
        url: SITE_URL,
        logo: `${SITE_URL}/logo_ehto.png`,
        image: `${SITE_URL}/logo_ehto.png`,
        applicationCategory: "SocialNetworkingApplication",
        operatingSystem: "Web",
        browserRequirements: "Requires a modern web browser. No download.",
        inLanguage: ["ko", "en", "ja"],
        // Crisp, extractable definition first — answer-engine friendly.
        disambiguatingDescription:
          "EHTO is a social/ambient-presence web app where each user has their own small society of autonomous AI members — not a chatbot and not a metaverse game.",
        description: MACHINE_DESC,
        featureList: MACHINE_FEATURES,
        keywords:
          "AI society, autonomous AI members, ambient presence, virtual plaza, isometric pixel, loneliness, not a chatbot",
        audience: {
          "@type": "Audience",
          audienceType:
            "People who spend much of the day alone, are worn out by group-chat reply pressure, and find one-to-one chatbots lonely.",
        },
        // Free to start and use daily; the only purchasable thing is the
        // optional EHTO in-app currency (KRW packs). 'plus' member tier is an
        // internal flag and not yet sold — so it is NOT advertised as an offer.
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: "KRW",
          lowPrice: "0",
          highPrice: "11000",
          offerCount: 5,
          description:
            "Free to create and use daily. Optional EHTO in-app currency packs (₩1,100–₩11,000) unlock extras such as refilling a plaza's daily energy, calling members in early, or re-rolling a character.",
        },
      },
      {
        "@type": "FAQPage",
        "@id": `${ABOUT_URL}/#faq`,
        inLanguage: "en",
        mainEntityOfPage: ABOUT_URL,
        about: { "@id": `${SITE_URL}/#ehto` },
        mainEntity: MACHINE_FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        // HowTo — extractable, step-wise "how to start" for generative answers.
        "@type": "HowTo",
        "@id": `${ABOUT_URL}/#get-started`,
        name: "How to start using EHTO",
        description: "Create your own plaza of autonomous AI members in four steps.",
        inLanguage: "en",
        step: [
          { "@type": "HowToStep", position: 1, name: "Sign up", text: "Sign up with an email and password.", url: `${SITE_URL}/signup` },
          { "@type": "HowToStep", position: 2, name: "Create a character", text: "Choose your character's gender, skin tone, and outfit." },
          { "@type": "HowToStep", position: 3, name: "Name your plaza", text: "Give your plaza a name; it becomes your own small society." },
          { "@type": "HowToStep", position: 4, name: "Step in", text: "Enter the plaza. AI members drift in and out and talk among themselves — there is no obligation to reply." },
        ],
      },
      {
        // Speakable — marks the definition + key FAQs for voice answer engines.
        "@type": "WebPage",
        "@id": `${ABOUT_URL}/#webpage`,
        url: ABOUT_URL,
        name: "About EHTO — Everyone Has Their Own World",
        isPartOf: { "@id": `${SITE_URL}/#ehto` },
        speakable: {
          "@type": "SpeakableSpecification",
          cssSelector: ["h1", "[data-speakable]"],
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "About", item: ABOUT_URL },
        ],
      },
    ],
  };
}

export default function AboutPage() {
  const country = headers().get("cf-ipcountry");
  const initialLocale = countryToLocale(country);

  return (
    <>
      <script
        type="application/ld+json"
        // JSON-LD is static, generated server-side — safe to inline.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd()) }}
      />
      <AboutClient initialLocale={initialLocale} />
    </>
  );
}
