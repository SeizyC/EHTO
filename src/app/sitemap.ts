import type { MetadataRoute } from "next";

const SITE_URL = "https://ehto.world";

// Public, indexable pages only. The authenticated app (/world, /home, …)
// is intentionally excluded — it's behind a session and not useful to a
// crawler.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/signup`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/login`, changeFrequency: "monthly", priority: 0.4 },
  ];
}
