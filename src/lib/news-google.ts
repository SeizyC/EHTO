import type { Locale } from "@/lib/language";
import { NEWS_LOCALE } from "@/lib/language";

// Parse <item><title>…</title> entries from a Google News RSS feed.
// Titles look like "Headline - Source"; we keep the headline portion.
export function parseGoogleNewsRss(xml: string, max = 8): string[] {
  const items = xml.split(/<item>/i).slice(1);
  const out: string[] = [];
  for (const it of items) {
    const m = it.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/is);
    if (!m) continue;
    const decoded = m[1]
      .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim();
    const headline = decoded.replace(/\s+-\s+[^-]+$/, "").trim(); // drop trailing " - Source"
    if (headline) out.push(headline);
    if (out.length >= max) break;
  }
  return out;
}

export async function fetchGoogleNews(queries: string[], language: Locale, max = 8): Promise<string[]> {
  const { hl, gl } = NEWS_LOCALE[language];
  const q = encodeURIComponent(queries.length ? queries.join(" OR ") : "top stories");
  const url = `https://news.google.com/rss/search?q=${q}&hl=${hl}&gl=${gl}&ceid=${gl}:${hl.split("-")[0]}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 EHTO/1.0" } });
    if (!r.ok) return [];
    return parseGoogleNewsRss(await r.text(), max);
  } catch { return []; }
}
