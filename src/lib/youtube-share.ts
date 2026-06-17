// Director: daily video share — mirrors music-share architecture.
//
// Slots (KST): noon 12–14, late evening 22–24. Each slot fires at most
// once per world per day (gated by worlds.last_yt_<slot>_at), with
// 15% per-tick jitter so the share lands at a random minute.
//
// Video discovery uses the YouTube Data API v3 search.list endpoint at
// request time. We previously tried (a) a hand-curated catalog whose
// IDs rotted, and (b) Naver Video Search whose index returned stale
// YouTube IDs pointing at deleted/private videos (hqdefault then served
// the gray "video unavailable" placeholder). Querying YouTube directly
// only returns currently-watchable videos and real thumbnail URLs.
//
// Bias-aware: K-pop fandom worlds query "{artist} MV" / "{artist} 무대"
// so a BLACKPINK plaza only ever sees BLACKPINK content (no more
// "BLACKPINK bias → SEVENTEEN video" wrong-artist bug). Non-bias
// worlds rotate through a small set of general queries.
//
// Render: chat-store treats messages with a YouTube URL like any
// other chat. message-render detects watch?v= / youtu.be / ytimg
// URLs and renders an inline thumbnail card.

import type { SupabaseClient } from "@supabase/supabase-js";
import { chatComplete } from "@/lib/claude";
import type { WorldBias } from "@/lib/world-bias";
import { aggregateImplicit, topImplicitTopic } from "@/lib/implicit-pref";

type Slot = "noon" | "lateeve";

export type DiscoveredVideo = {
  url: string;        // canonical YouTube watch URL
  caption: string;    // title
  thumbnail?: string; // optional thumbnail URL from API (message-render derives from ytid anyway)
};

// Affinity tags loosely associated with "this person would share videos"
const VIDEO_AFFINITY_TAGS = ["music", "음악", "kpop", "indie", "lofi", "calm", "사색", "독서", "운동", "주말", "food", "cozy"];

// Non-bias rotation queries — broad enough to find currently-popular
// recent videos in each category. We pick one at random per share.
const GENERAL_QUERIES = [
  "힐링 영상",
  "lofi 라디오",
  "ASMR 빗소리",
  "10분 요가",
  "백종원 레시피",
  "북튜브 추천",
];

type ActiveMember = {
  id: string;
  name: string;
  persona: { affinity?: string[]; speech_style?: string };
  activity_weight: number;
};

function kstHour(): number {
  return new Date(Date.now() + 9 * 3600_000).getUTCHours();
}
function currentSlot(): Slot | null {
  const h = kstHour();
  if (h >= 12 && h < 14) return "noon";
  if (h >= 22 || h < 1) return "lateeve";
  return null;
}

/** Speaker pick — same shape as music-share's. Members whose affinity
 *  overlaps with VIDEO_AFFINITY_TAGS get higher weight (they're the
 *  ones who'd naturally drop a video link). */
function pickSpeaker(members: ActiveMember[]): ActiveMember | null {
  if (members.length === 0) return null;
  const weighted = members.map((m) => {
    const aff = (m.persona.affinity ?? []).map((a) => a.toLowerCase());
    const overlap = VIDEO_AFFINITY_TAGS.filter((t) => aff.includes(t)).length;
    return { m, w: (m.activity_weight || 0.3) * (1 + overlap) };
  });
  const total = weighted.reduce((s, x) => s + x.w, 0);
  let pick = Math.random() * total;
  for (const w of weighted) {
    pick -= w.w;
    if (pick <= 0) return w.m;
  }
  return weighted[0].m;
}

/** Pick a query for this share. Tiered:
 *    1. explicit K-pop bias → query the artist
 *    2. implicit top topic → query "{topic} {suffix}" (sports / games /
 *       movies all naturally fall out from the same suffix set)
 *    3. fallback to the rotation list
 *  We lean toward "official" qualifiers so YouTube's relevance ranking
 *  surfaces channel content ahead of fan reactions/covers. */
function pickQuery(bias: WorldBias | null, implicitTopic: string | null): string {
  const suffixes = ["official MV", "MV", "performance", "stage", "live"];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
  if (bias?.kind === "kpop" && bias.artist.trim()) {
    return `${bias.artist.trim()} ${suffix}`;
  }
  if (implicitTopic) {
    return `${implicitTopic} ${suffix}`;
  }
  return GENERAL_QUERIES[Math.floor(Math.random() * GENERAL_QUERIES.length)];
}

/** Decode HTML entities YouTube returns in snippet.title (e.g. &amp;, &#39;). */
function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

type YtSearchItem = {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
    thumbnails?: {
      high?: { url?: string };
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
};

/** Query YouTube Data API v3 search.list and pick the most relevant
 *  embeddable, public video. Returns null on quota/network errors —
 *  caller handles by skipping the share.
 *
 *  - type=video filters out channels/playlists.
 *  - videoEmbeddable=true + videoSyndicated=true biases toward videos
 *    that are actually publicly watchable (no region/embed blocks).
 *  - safeSearch=moderate keeps obvious NSFW out.
 *  - We pass through the API's snippet thumbnail URL as a sanity flag,
 *    though message-render still derives the displayed thumb from the
 *    video id (hqdefault.jpg) for consistency. */
export async function searchYoutubeVideo(query: string): Promise<DiscoveredVideo | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.warn("[yt] YOUTUBE_API_KEY missing — skipping video share");
    return null;
  }
  const url =
    "https://www.googleapis.com/youtube/v3/search?" +
    new URLSearchParams({
      key: apiKey,
      q: query,
      part: "snippet",
      type: "video",
      maxResults: "10",
      order: "relevance",
      videoEmbeddable: "true",
      videoSyndicated: "true",
      safeSearch: "moderate",
      regionCode: "KR",
      relevanceLanguage: "ko",
    }).toString();
  try {
    const r = await fetch(url);
    if (!r.ok) {
      console.warn(`[yt] search.list ${r.status}: ${await r.text().catch(() => "")}`);
      return null;
    }
    const j = (await r.json()) as { items?: YtSearchItem[] };
    for (const item of j.items ?? []) {
      const vid = item.id?.videoId;
      if (!vid) continue;
      const sn = item.snippet ?? {};
      return {
        url: `https://www.youtube.com/watch?v=${vid}`,
        caption: decodeEntities(sn.title ?? "영상"),
        thumbnail:
          sn.thumbnails?.high?.url ??
          sn.thumbnails?.medium?.url ??
          sn.thumbnails?.default?.url,
      };
    }
    return null;
  } catch (e) {
    console.warn("[yt] video search failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function personaCaption(
  speaker: ActiveMember,
  video: DiscoveredVideo,
  slot: Slot,
): Promise<string | null> {
  const style = speaker.persona.speech_style ?? "";
  const aff = speaker.persona.affinity?.join(", ") ?? "";
  const slotLabel = slot === "noon" ? "낮 시간대" : "늦은 밤";
  const system = [
    `당신은 ${speaker.name}.`,
    style && `말투: ${style}`,
    aff && `관심사: ${aff}`,
    "",
    `${slotLabel}에 영상 하나를 광장 채팅에 공유하려는 참입니다.`,
    "당신 결로 *왜 이 영상을 봤는지 / 어떤 기분인지* 한 줄 자연스럽게.",
    "",
    "규칙:",
    "- 한 줄, 12~28자. 한국어 캐주얼·반말.",
    "- 영상 제목은 *포함하지 마세요* (시스템이 따로 붙임).",
    "- '봐봐!', '추천!', 챗봇 어조 X. 친구한테 무심코 던지는 톤.",
    "- ㅋㅋ 자동 부착 X. ~함/~임 명사형 종결 X.",
    "- 결과만 출력 (따옴표·접두사·제목 없이).",
  ].filter(Boolean).join("\n");
  const raw = await chatComplete({
    system,
    user: `[지금 본 영상] ${video.caption}`,
    maxTokens: 300,
  });
  if (!raw) return null;
  return raw.replace(/^["'`]+|["'`]+$/g, "").replace(/^[가-힣A-Za-z_]+\s*[:：]\s*/, "").trim() || null;
}

/** Per-slot tick. Returns the message text inserted (or null if no-op). */
export async function tickYoutubeShare(
  sb: SupabaseClient,
  worldId: string,
): Promise<{ shared: { name: string; video: string } | null; reason?: string }> {
  const slot = currentSlot();
  if (!slot) return { shared: null, reason: "outside-slot" };

  const slotColumn = `last_yt_${slot}_at` as const;
  const { data: world } = await sb
    .from("worlds")
    .select(`${slotColumn}, bias, language`)
    .eq("id", worldId)
    .maybeSingle();
  if (!world) return { shared: null, reason: "no-world" };
  // share-caption localization is a later phase; skip non-ko to avoid Korean leakage
  if (((world as { language?: string | null }).language ?? "ko") !== "ko") {
    return { shared: null, reason: "non-ko-skip" };
  }
  const lastIso = (world as Record<string, string | null>)[slotColumn];
  if (lastIso) {
    const lastKstDate = new Date(new Date(lastIso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
    const nowKstDate = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    if (lastKstDate === nowKstDate) return { shared: null, reason: `${slot}-already-shared` };
  }

  // Per-tick roll, tiered same as pickQuery:
  //   30%  explicit bias (themed plaza — user opted in)
  //   20%  implicit-only (soft signal from chat history)
  //   15%  general rotation (baseline)
  const bias = (world as { bias?: WorldBias | null }).bias ?? null;
  const implicit = await aggregateImplicit(sb, worldId);
  const implicitTopic = topImplicitTopic(implicit);
  const roll = bias ? 0.30 : implicitTopic ? 0.20 : 0.15;
  if (Math.random() > roll) return { shared: null, reason: `${slot}-jitter-skip (roll=${roll})` };

  const nowIso = new Date().toISOString();
  await sb.from("worlds").update({ [slotColumn]: nowIso }).eq("id", worldId);

  const { data: rows } = await sb
    .from("members")
    .select("id, name, persona, activity_weight, status, activated_at")
    .eq("current_location_world_id", worldId);
  const active = (rows ?? []).filter(
    (m) => m.activated_at !== null && m.status === "active",
  ) as ActiveMember[];
  if (active.length === 0) {
    await sb.from("worlds").update({ [slotColumn]: null }).eq("id", worldId);
    return { shared: null, reason: "no-active-members" };
  }

  const speaker = pickSpeaker(active);
  if (!speaker) return { shared: null, reason: "pick-failed" };

  const query = pickQuery(bias, implicitTopic);
  const video = await searchYoutubeVideo(query);
  if (!video) {
    // Roll back the stamp so we retry on next tick — the failure was
    // network/api, not "we don't want to share today".
    await sb.from("worlds").update({ [slotColumn]: null }).eq("id", worldId);
    return { shared: null, reason: `video-search-empty for "${query}"` };
  }

  const caption = process.env.ANTHROPIC_API_KEY
    ? await personaCaption(speaker, video, slot)
    : null;
  const fallback: Record<Slot, string> = {
    noon: "이거 한번 봐",
    lateeve: "자기 전에 보고 있어",
  };
  const intro = caption ?? `${fallback[slot]}.`;
  const text = `${intro} ${video.caption}\n${video.url}`;

  const { error } = await sb.from("messages").insert({
    world_id: worldId,
    owner_member_id: speaker.id,
    text,
  });
  if (error) {
    await sb.from("worlds").update({ [slotColumn]: null }).eq("id", worldId);
    return { shared: null, reason: `insert-fail: ${error.message}` };
  }

  await sb.from("members").update({ last_seen_at: nowIso }).eq("id", speaker.id);
  console.log(`[yt/${slot}] ${speaker.name} (query="${query}") → ${video.caption}`);
  return { shared: { name: speaker.name, video: video.caption } };
}
