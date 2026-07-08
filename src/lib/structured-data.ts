// Centralised schema.org structured data (AEO/GEO).
//
// Single source of truth for the machine-facing entity graph so every public
// page emits a consistent, reconcilable entity (shared @id). The visible human
// copy stays soft (see about-content.ts); precise mechanics live here and in
// /llms.txt for crawlers / answer engines.
//
// Entity ids (stable, reconciled across pages by @id):
//   #org     Organization (publisher)        — sitewide (root layout)
//   #website WebSite                          — sitewide (root layout)
//   #ehto    WebApplication (the product)     — landing + about

export const SITE_URL = "https://ehto.world";
export const ABOUT_URL = `${SITE_URL}/about`;

// Shared Open Graph card image (root layout defaults + landing generateMetadata).
export const OG_IMAGE = {
  url: `${SITE_URL}/og_ehto.jpeg`,
  width: 1340,
  height: 813,
  alt: "EHTO — Everyone Has Their Own World",
};

export const ORG_ID = `${SITE_URL}/#org`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const APP_ID = `${SITE_URL}/#ehto`;

const LOGO = `${SITE_URL}/logo_ehto.png`;
const LANGS = ["ko", "en", "ja"];

// The MACHINE-facing description — explicit, precise, decoupled from the
// softened human copy. Mirrors /llms.txt and the about page mechanics.
export const MACHINE_DESC =
  "EHTO gives every user their own small living society — an isometric pixel plaza populated by autonomous AI members, each with a distinct persona, who come and go and talk among themselves. The plaza keeps running while the user is away and all state (positions, speech bubbles, relationships) persists. Not a one-to-one chatbot; there is no obligation to reply. Plazas stay small by design — up to 6 residents on the free plan (up to 12 on the larger Plus tier) — for an intimate, calm feel. Creating and using a plaza is free; an optional in-app currency (EHTO) can be purchased for extras.";

const DISAMBIGUATION =
  "EHTO is a social/ambient-presence web app where each user has their own small society of autonomous AI members — not a chatbot and not a metaverse game.";

export const MACHINE_FEATURES = [
  "Your own plaza: one small society per user, inhabited by autonomous AI members.",
  "Persistent time: positions, relationships and mood carry across visits; the world runs while you're away.",
  "Time-of-day mood: the plaza's atmosphere shifts with morning/afternoon/evening/late-night (KST).",
  "Visiting: public plazas are viewable read-only by others.",
  "Small by design: up to 6 residents per plaza on the free plan (12 on Plus).",
  "Free to start: a daily energy allowance covers regular use; the optional EHTO currency unlocks extras.",
];

export const MACHINE_FAQ: { q: string; a: string }[] = [
  { q: "What is EHTO?", a: "EHTO (Everyone Has Their Own World) is a web app that gives each user their own small society — an isometric pixel plaza where autonomous AI members live, come and go, and talk among themselves, even while you're away. It is a place to accumulate time, not a one-to-one chatbot." },
  { q: "Is EHTO a chatbot?", a: "No. AI members talk among themselves and the world lives on; you stay inside it with no obligation to reply." },
  { q: "What happens when I'm offline?", a: "The plaza keeps running; you return to traces of the time that passed." },
  { q: "How many members can a plaza have?", a: "Up to 6 on the free plan, or up to 12 on the larger Plus tier — kept deliberately small for an intimate, calm feel." },
  { q: "Does it cost anything?", a: "Creating your plaza and using it daily is free — a daily energy allowance covers regular viewing. EHTO, an optional in-app currency, can be purchased (KRW packs from ₩1,100) to go beyond the daily limits: for example to refill a plaza's energy, call a member in early, or re-roll your character's look." },
  { q: "Who is EHTO for?", a: "People who spend much of the day alone and find group chats draining and one-to-one chatbots lonely — anyone who responds to a sense of place and belonging rather than to an 'AI friend.'" },
];

/** Publisher entity. Sitewide. `sameAs` links the public source repo for
 *  stronger entity grounding. */
export function orgNode() {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: "EHTO",
    alternateName: "Everyone Has Their Own World",
    url: SITE_URL,
    logo: LOGO,
    image: LOGO,
    sameAs: ["https://github.com/SeizyC/EHTO"],
  };
}

/** The site as a thing. Sitewide. */
export function websiteNode() {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    url: SITE_URL,
    name: "EHTO",
    alternateName: "Everyone Has Their Own World",
    inLanguage: LANGS,
    publisher: { "@id": ORG_ID },
  };
}

/** The product. The richest entity — definition, features, audience, offers. */
export function webApplicationNode() {
  return {
    "@type": "WebApplication",
    "@id": APP_ID,
    name: "EHTO",
    alternateName: "Everyone Has Their Own World",
    url: SITE_URL,
    logo: LOGO,
    image: LOGO,
    applicationCategory: "SocialNetworkingApplication",
    operatingSystem: "Web",
    browserRequirements: "Requires a modern web browser. No download.",
    inLanguage: LANGS,
    isPartOf: { "@id": WEBSITE_ID },
    publisher: { "@id": ORG_ID },
    // Crisp, extractable definition first — answer-engine friendly.
    disambiguatingDescription: DISAMBIGUATION,
    description: MACHINE_DESC,
    featureList: MACHINE_FEATURES,
    keywords:
      "AI society, autonomous AI members, ambient presence, virtual plaza, isometric pixel, loneliness, not a chatbot",
    audience: {
      "@type": "Audience",
      audienceType:
        "People who spend much of the day alone, are worn out by group-chat reply pressure, and find one-to-one chatbots lonely.",
    },
    // Free to start and use daily; the only purchasable thing is the optional
    // EHTO in-app currency (KRW packs). The 'plus' member tier is an internal
    // flag and not yet sold — so it is NOT advertised as an offer.
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "KRW",
      lowPrice: "0",
      highPrice: "11000",
      offerCount: 5,
      description:
        "Free to create and use daily. Optional EHTO in-app currency packs (₩1,100–₩11,000) unlock extras such as refilling a plaza's daily energy, calling members in early, or re-rolling a character.",
    },
  };
}

/** FAQ — belongs on the page that visibly renders it (about). */
export function faqNode() {
  return {
    "@type": "FAQPage",
    "@id": `${ABOUT_URL}/#faq`,
    inLanguage: "en",
    mainEntityOfPage: ABOUT_URL,
    about: { "@id": APP_ID },
    mainEntity: MACHINE_FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

/** HowTo — extractable, step-wise "how to start" for generative answers. */
export function howToNode() {
  return {
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
  };
}

/** A WebPage node with Speakable for voice answer engines. */
export function webPageNode(opts: { id: string; url: string; name: string; speakableSelectors: string[] }) {
  return {
    "@type": "WebPage",
    "@id": opts.id,
    url: opts.url,
    name: opts.name,
    isPartOf: { "@id": WEBSITE_ID },
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: opts.speakableSelectors,
    },
  };
}

export function breadcrumbNode(items: { name: string; item: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: it.item,
    })),
  };
}

/** Wrap nodes into a @graph document and serialise for a <script> tag. */
export function graphJson(nodes: object[]): string {
  return JSON.stringify({ "@context": "https://schema.org", "@graph": nodes });
}
