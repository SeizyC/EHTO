// Naver Search API → TODAY's news headlines, injected into the ambient
// system prompt as an "오늘 화제" block so AIs can reference current
// events naturally. Each AI sees the same headlines; their persona picks
// which ones (if any) feel like something they'd actually mention.
//
// Endpoint:  GET https://openapi.naver.com/v1/search/news.json
// Headers:   X-Naver-Client-Id, X-Naver-Client-Secret
// Params:    query, display (1-100), start, sort (sim|date)
// Returns:   items[] with title, link, description, pubDate (RFC 2822)
//
// Filter: only items with pubDate >= today's KST-09:00 start make it
// through. The earlier version used sort=sim which surfaced popular
// articles from any date — AIs ended up quoting week-old stories as
// "today's news". Now we sort by date and bound by today's window.
//
// If nothing today qualifies, returns []. The system prompt skips the
// whole "오늘 화제" block in that case rather than serving stale items.
//
// Cache: 30 min in-memory.

import { dayStart } from "@/lib/day-rollover";
import { biasNewsQueries, type WorldBias } from "@/lib/world-bias";
import { topImplicitTopic, type ImplicitState } from "@/lib/implicit-pref";
import { fetchGoogleNews } from "@/lib/news-google";
import type { Locale } from "@/lib/language";

const CACHE_TTL_MS = 30 * 60_000;
const TOP_N = 12;
// Per-category cap during selection — guarantees each category gets at
// least N items in the final list even when one query (usually 사건사고)
// dominates by recency. Without this, entertainment headlines kept
// getting pushed out by news-cycle-active incidents.
const PER_CATEGORY_CAP = 3;

// Curated whitelist of major Korean outlets. Naver Search News returns
// titles from a long tail of small/affiliate blogs that we don't want
// AIs treating as "today's news" — sticking to majors keeps the room
// from quoting random aggregators or trash sites.
//
// We match against `originallink` (the source URL Naver crawled), not
// `link` (which is always naver.com). Includes broadcast, dailies,
// majors of economy & entertainment.
const MAJOR_OUTLETS = [
  "yna.co.kr", "yonhapnews.co.kr",
  "chosun.com", "joongang.co.kr", "joins.com",
  "hani.co.kr", "donga.com", "khan.co.kr", "hankookilbo.com",
  "kbs.co.kr", "mbc.co.kr", "sbs.co.kr", "jtbc.co.kr",
  "ytn.co.kr", "mbn.co.kr", "tvchosun.com", "channela.co.kr",
  "mk.co.kr", "hankyung.com", "edaily.co.kr", "fnnews.com",
  "newsis.com", "nocutnews.co.kr", "ohmynews.com",
  // Entertainment majors
  "tenasia.hankyung.com", "starnews.com", "osen.co.kr",
  "xportsnews.com", "newsen.com", "isplus.com",
];

// Search queries — light, human-interest topics. We fire all in parallel
// + merge so the AIs see a mix of stuff they'd naturally bring up rather
// than tech/economy headlines. The "사건사고" (incidents/accidents) query
// was DROPPED (2026-07-01): it flooded the room with 부고/사망/충돌 and
// dragged this cozy loneliness-relief plaza dark. Replaced with "라이프"
// (lifestyle). A HEAVY_RX filter (below) still catches grim items that
// slip through the remaining queries.
const QUERIES = ["이슈", "연예", "K-pop", "드라마", "라이프"] as const;
type Query = (typeof QUERIES)[number];

// Grim/heavy register — death, accidents, crime, disaster, courts, war.
// Dropped at the source so the AIs never fixate on them and pull the whole
// room's mood down. Applied to every tier (even a bias/theme query's
// results) since heavy K-pop/celeb news is just as tone-breaking here.
const HEAVY_RX =
  /(사망|숨져|숨진|숨졌|별세|부고|빈소|영결|참사|참변|사고|충돌|추락|붕괴|화재|폭발|실종|익사|압사|피살|살해|살인|자살|극단적|시신|사체|부상|중상|중태|테러|성폭|성범|강간|폭행|음주운전|마약|유죄|무죄|기소|구속|체포|징역|재판|판결|법정|고소|고발|사기|횡령|전쟁|공습|미사일|포격|지진|태풍|홍수|산불)/;
// English counterpart for the Google-News (non-ko) path.
const HEAVY_RX_EN =
  /\b(dead|death|dies|died|killed|kill|murder|suicide|crash|collision|fatal|injur|wounded|shooting|shoot|stabb|assault|rape|arrest|indict|convict|court|trial|verdict|lawsuit|fraud|scandal|war|missile|bomb|explosion|earthquake|wildfire|flood|disaster|victim|corpse|funeral|obituary)\b/i;
function isHeavy(title: string): boolean {
  return HEAVY_RX.test(title) || HEAVY_RX_EN.test(title);
}

type CacheEntry = { headlines: string[]; at: number };
// Per-bias cache. Key: stable JSON of the bias object (or "_none" for
// no bias). Different worlds with different biases each get their own
// 30min cache slot; the un-biased general slot serves the majority.
const _caches = new Map<string, CacheEntry>();
const _inFlightByKey = new Map<string, Promise<string[]>>();

function biasKey(bias: WorldBias | null | undefined): string {
  if (!bias) return "_none";
  return JSON.stringify(bias);
}

function clean(s: string): string {
  return s
    .replace(/<\/?b>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isMajorOutlet(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    return MAJOR_OUTLETS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

type NaverItem = {
  title: string;
  originallink: string;
  link: string;
  pubDate?: string;
};

async function _fetchOne(query: string, clientId: string, clientSecret: string): Promise<NaverItem[]> {
  // sort=date returns newest articles first — paired with the
  // today-only pubDate filter below, this gives us a fresh slice.
  // display=100 (max) so we have enough headroom for today-only
  // filtering to still yield TOP_N after pruning older items.
  const url =
    "https://openapi.naver.com/v1/search/news.json?" +
    `query=${encodeURIComponent(query)}&display=100&sort=date`;
  try {
    const r = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    });
    if (!r.ok) return [];
    const j = (await r.json()) as { items?: NaverItem[] };
    return j.items ?? [];
  } catch {
    return [];
  }
}

async function _fetch(
  bias: WorldBias | null | undefined,
  implicitTopTopic: string | null,
): Promise<string[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.warn("[news] NAVER_CLIENT_ID/SECRET missing");
    return [];
  }

  // Today window: KST-09:00 rollover. An item only counts as "today's
  // news" if its pubDate is on or after this moment. Naver's pubDate
  // is RFC 2822 format ("Wed, 21 May 2026 12:34:00 +0900") which
  // Date.parse handles natively.
  const todayStartMs = dayStart().getTime();

  // Compose the query set:
  //   1. bias-specific queries (explicit "this plaza is a K-pop fandom")
  //   2. implicit-top queries (the user's recent thread — soft signal)
  //   3. general mix
  // Per-category caps escalate accordingly (bias +4, implicit +2,
  // general baseline) so themed-and-or-watched plazas surface their
  // theme/thread headlines first.
  const biasQs = biasNewsQueries(bias);
  const implicitQs = implicitTopTopic ? [implicitTopTopic] : [];
  const allQueries: string[] = [...biasQs, ...implicitQs, ...QUERIES];
  const biasEnd = biasQs.length;
  const implicitEnd = biasEnd + implicitQs.length;

  const buckets = await Promise.all(
    allQueries.map((q) => _fetchOne(q, clientId, clientSecret)),
  );

  // Per-category filter & rank.
  const seen = new Set<string>();
  type Cat = { query: string; titles: string[]; tier: "bias" | "implicit" | "general" };
  const perCategory: Cat[] = [];
  for (let qi = 0; qi < allQueries.length; qi++) {
    const query = allQueries[qi];
    const tier: Cat["tier"] =
      qi < biasEnd ? "bias" : qi < implicitEnd ? "implicit" : "general";
    const items = buckets[qi]
      .map((it) => ({ it, t: Date.parse(it.pubDate ?? "") }))
      .filter((x) => Number.isFinite(x.t) && x.t >= todayStartMs)
      .sort((a, b) => b.t - a.t);
    const titles: string[] = [];
    // Tiered caps: explicit bias dominates, implicit is a step softer,
    // general is the baseline. Implicit gets +2 (was the prior bias cap)
    // — strong enough to actually feature, soft enough not to overpower
    // a fully bias'd plaza.
    const cap =
      tier === "bias" ? PER_CATEGORY_CAP + 4
      : tier === "implicit" ? PER_CATEGORY_CAP + 2
      : PER_CATEGORY_CAP;
    for (const { it } of items) {
      if (!isMajorOutlet(it.originallink)) continue;
      const title = clean(it.title);
      if (!title) continue;
      if (isHeavy(title)) continue; // drop grim headlines at the source
      const key = title.slice(0, 24);
      if (seen.has(key)) continue;
      seen.add(key);
      titles.push(title);
      if (titles.length >= cap) break;
    }
    perCategory.push({ query, titles, tier });
  }

  // Interleave order: bias → implicit → general (entertainment first,
  // then 사건사고/이슈). Preserves bias and implicit input order.
  const generalOrder: Query[] = ["연예", "K-pop", "드라마", "라이프", "이슈"];
  const tierRank = { bias: 0, implicit: 1, general: 2 } as const;
  const sorted = perCategory.sort((a, b) => {
    if (tierRank[a.tier] !== tierRank[b.tier]) return tierRank[a.tier] - tierRank[b.tier];
    if (a.tier === "general") {
      return generalOrder.indexOf(a.query as Query) - generalOrder.indexOf(b.query as Query);
    }
    return 0; // preserve input order within bias/implicit tiers
  });
  const interleaved: string[] = [];
  let idx = 0;
  while (interleaved.length < TOP_N) {
    let added = false;
    for (const cat of sorted) {
      if (idx < cat.titles.length) {
        interleaved.push(cat.titles[idx]);
        added = true;
        if (interleaved.length >= TOP_N) break;
      }
    }
    if (!added) break;
    idx++;
  }
  return interleaved;
}

/** Recent headlines, cached for 30 min. Returns [] if Naver creds are
 *  missing or the first fetch fails. Safe to call from every ambient
 *  tick — only the first miss + occasional refresh actually hit Naver.
 *
 *  Logs: [news] cache-hit/miss/empty so prod logs make it obvious whether
 *  the headline block is actually feeding into ambient prompts. The prior
 *  silent-empty path masked NAVER credential issues in production. */
export async function getNewsHeadlines(
  bias?: WorldBias | null,
  implicit?: ImplicitState,
  language: Locale = "ko",
): Promise<string[]> {
  // Implicit top-topic shares the headline pool with explicit bias.
  // Cache key includes both so different topic permutations don't
  // collide. The :implicit suffix is empty when no top topic exists,
  // preserving the prior cache key shape for non-implicit cases.
  // Language prefix namespaces the in-memory cache per plaza language:
  // ko stays on Naver (_fetch), non-ko routes to Google News RSS.
  const topicTop = implicit ? topImplicitTopic(implicit) : null;
  const key = `${language}:${biasKey(bias)}:${topicTop ?? ""}`;
  const cached = _caches.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    console.log(`[news] cache-hit key=${key} (${cached.headlines.length} headlines, age ${Math.round((Date.now() - cached.at) / 1000)}s)`);
    return cached.headlines;
  }
  const existing = _inFlightByKey.get(key);
  if (existing) return existing;
  const p = (async () => {
    const t0 = Date.now();
    let headlines: string[];
    if (language === "ko") {
      headlines = await _fetch(bias ?? null, topicTop); // Naver — UNCHANGED
      _caches.set(key, { headlines, at: Date.now() });
      _inFlightByKey.delete(key);
      if (headlines.length === 0) {
        console.warn(`[news] fetch returned 0 headlines key=${key} (${Date.now() - t0}ms) — check NAVER creds / today-window filter`);
      } else {
        console.log(`[news] fetched ${headlines.length} headlines key=${key} (${Date.now() - t0}ms)`);
      }
    } else {
      // Non-Korean plazas: Google News RSS in the plaza language.
      const queries = [...biasNewsQueries(bias, language), ...(topicTop ? [topicTop] : [])];
      headlines = (await fetchGoogleNews(queries, language)).filter((h) => !isHeavy(h));
      _caches.set(key, { headlines, at: Date.now() });
      _inFlightByKey.delete(key);
      console.log(`[news] google fetched ${headlines.length} headlines key=${key} (${Date.now() - t0}ms)`);
    }
    return headlines;
  })();
  _inFlightByKey.set(key, p);
  return p;
}
