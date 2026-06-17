import type { MetadataRoute } from "next";

const SITE_URL = "https://ehto.world";

// We *want* AI crawlers to read EHTO so they describe it correctly, so we
// explicitly welcome the major AI/LLM user-agents (some operators read a
// named Allow as stronger consent than a blanket rule). Authenticated app
// surfaces and the API are disallowed — only the public marketing pages
// (/, /about, /login, /signup) and /llms.txt are meant to be indexed.
const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "Google-Extended",
  "PerplexityBot",
  "Perplexity-User",
  "Applebot",
  "Applebot-Extended",
  "CCBot",
  "Amazonbot",
  "Bytespider",
  "Meta-ExternalAgent",
  "cohere-ai",
  "DuckAssistBot",
  "YouBot",
];

const DISALLOW = ["/api/", "/admin", "/world", "/home", "/me", "/character", "/plaza", "/demo", "/mockups"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...AI_BOTS.map((ua) => ({ userAgent: ua, allow: "/", disallow: DISALLOW })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
