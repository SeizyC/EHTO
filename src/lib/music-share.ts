// Director: 3x daily ambient music share. One member per slot drops a
// Spotify URL with a one-liner about why they're listening. The feed
// renders it as an inline Spotify iframe via lib/message-render.
//
// Slots (KST): morning 08–11, lunch 12–14, evening 19–22. Each slot
// fires at most once per world per day via `worlds.last_music_<slot>_at`
// stamps. The window itself is permissive (3-4 hours) so the share
// lands at an organic moment within the slot rather than on a clocklike
// minute.
//
// Track pool is curated + tagged by mood/persona. We pick from tracks
// whose tags overlap the chosen speaker's affinity — so lofi.library
// shares lo-fi, weekendrun shares running playlists, kidmood shares
// upbeat tunes, etc. Without persona match we fall back to "anyone"
// tracks (general indie/pop).

import type { SupabaseClient } from "@supabase/supabase-js";
import { chatComplete } from "@/lib/claude";
import type { WorldBias } from "@/lib/world-bias";

type Slot = "morning" | "lunch" | "evening";

type Track = {
  /** Spotify open.spotify.com URL (track / playlist / album / episode). */
  url: string;
  /** Short title fragment for the speaker's caption ("Beach House - Space Song"). */
  caption: string;
  /** Mood tags that overlap with member affinity arrays. */
  tags: string[];
};

// Curated pool. Add/remove freely. Mix of internationally known tracks
// + Korean indie/lo-fi so persona matching has room. URLs are real
// open.spotify.com IDs that resolve in the embed iframe.
const TRACKS: Track[] = [
  // Lo-fi / chill
  { url: "https://open.spotify.com/track/2QjOHCTQ1Jl3zawyYOpxh6", caption: "Sweater Weather — The Neighbourhood",
    tags: ["lofi","chill","indie","calm","음악","새벽","cozy"] },
  { url: "https://open.spotify.com/track/0ct6r3EGTcMLPtrXHDvVjc", caption: "The Less I Know The Better — Tame Impala",
    tags: ["indie","chill","감성","음악"] },
  { url: "https://open.spotify.com/track/3JOVTQ5h8HGFnDdp4VT3MP", caption: "Space Song — Beach House",
    tags: ["lofi","chill","새벽","감성","indie"] },
  // Korean indie / 인디
  { url: "https://open.spotify.com/track/0vLNvtJWvX1okp76lkmYWh", caption: "밤편지 — 아이유",
    tags: ["감성","따뜻","새벽","calm","공감"] },
  { url: "https://open.spotify.com/track/1HNkqx9Ahdgi1Ixy2xkKkL", caption: "사랑하긴 했었나요 스쳐가는 인연이었나요 짧지만 영원했던 그 기억 속에서 — 잔나비",
    tags: ["감성","우울","indie","감성","음악"] },
  { url: "https://open.spotify.com/track/7iN1s7xHE4ifF5povM6A48", caption: "Lovely — Billie Eilish, Khalid",
    tags: ["우울","calm","감성","새벽"] },
  // Upbeat / 운동
  { url: "https://open.spotify.com/track/5HCyWlXZPP0y6Gqq8TgA20", caption: "STAY — Justin Bieber, Kid LAROI",
    tags: ["energy","upbeat","주말","운동","sports"] },
  { url: "https://open.spotify.com/track/1zi7xx7UVEFkmKfv06H8x0", caption: "ONE DANCE — Drake",
    tags: ["energy","주말","upbeat","음악"] },
  { url: "https://open.spotify.com/track/463CkQjx2Zk1yXoBuierM9", caption: "Levitating — Dua Lipa",
    tags: ["energy","upbeat","주말","운동","sports","playful"] },
  // Playful / 밈
  { url: "https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh", caption: "good 4 u — Olivia Rodrigo",
    tags: ["chaotic","playful","밈","upbeat","energy"] },
  { url: "https://open.spotify.com/track/3rmo8F54jFF8OgYsqLxm5F", caption: "Lavender Haze — Taylor Swift",
    tags: ["playful","감성","따뜻","주말"] },
  // Work / 야근
  { url: "https://open.spotify.com/track/4PTG3Z6ehGkBFwjybzWkR8", caption: "Never Gonna Give You Up — Rick Astley",
    tags: ["work","야근","밈","playful"] },
  // Book / 사색
  { url: "https://open.spotify.com/track/3LzKUdUTdJb6P7xGN6SotC", caption: "Clair de Lune — Debussy",
    tags: ["책","독서","사색","calm","심야","minimal"] },
  { url: "https://open.spotify.com/track/2FvDLnt2EBeXpkfPiU3xz4", caption: "River Flows in You — Yiruma",
    tags: ["calm","사색","minimal","따뜻","심야"] },
  // ── K-pop (bias-friendly) ──
  // Using Spotify's curated K-Pop playlists for stability — playlist
  // IDs are far more stable than individual track IDs (artists release
  // singles that get pulled, but playlist URIs from Spotify's editorial
  // team rarely break). Each is tagged with both general 'kpop' and
  // 'music' so non-bias selectors still see them in the general pool.
  { url: "https://open.spotify.com/playlist/37i9dQZF1DX9tPFwDMOaN1", caption: "K-Pop ON! (온) — Spotify",
    tags: ["kpop","music","energy","upbeat"] },
  { url: "https://open.spotify.com/playlist/37i9dQZF1DWUoY6Ih7vsxr", caption: "K-Pop Rising — Spotify",
    tags: ["kpop","music","energy"] },
  { url: "https://open.spotify.com/playlist/37i9dQZF1DX14CevphCnEy", caption: "Best of K-Pop — Spotify",
    tags: ["kpop","music","energy","upbeat","주말"] },
  { url: "https://open.spotify.com/playlist/37i9dQZF1DX2zRbiQAcCY7", caption: "K-Pop Ballads — Spotify",
    tags: ["kpop","music","감성","calm","사색"] },
];

type ActiveMember = {
  id: string;
  name: string;
  persona: { affinity?: string[]; speech_style?: string };
  activity_weight: number;
};

/** Resolve KST hour 0–23 from now. */
function kstHour(): number {
  const kst = new Date(Date.now() + 9 * 3600_000);
  return kst.getUTCHours();
}

/** Which slot (if any) we are currently inside. */
function currentSlot(): Slot | null {
  const h = kstHour();
  if (h >= 8 && h < 11) return "morning";
  if (h >= 12 && h < 14) return "lunch";
  if (h >= 19 && h < 22) return "evening";
  return null;
}

/** Pick a track biased toward the speaker's affinity. World bias (e.g.
 *  K-pop fandom) gets a heavy multiplier so themed plazas mostly play
 *  themed music; the artist name in the caption gets an even higher
 *  boost when present. */
function pickTrackFor(member: ActiveMember, bias: WorldBias | null): Track {
  const aff = (member.persona.affinity ?? []).map((a) => a.toLowerCase());
  const biasArtist = bias?.kind === "kpop" ? bias.artist.toLowerCase() : null;
  const scored = TRACKS.map((t) => {
    const overlap = t.tags.filter((tag) => aff.includes(tag.toLowerCase())).length;
    let score = overlap;
    if (bias?.kind === "kpop") {
      if (t.tags.includes("kpop")) score += 4;
      if (biasArtist && t.caption.toLowerCase().includes(biasArtist)) score += 6;
    }
    return { t, score };
  });
  const matches = scored.filter((s) => s.score > 0);
  if (matches.length > 0) {
    // Weight by score so more overlap = higher chance.
    const total = matches.reduce((s, x) => s + x.score, 0);
    let pick = Math.random() * total;
    for (const m of matches) {
      pick -= m.score;
      if (pick <= 0) return m.t;
    }
    return matches[0].t;
  }
  return TRACKS[Math.floor(Math.random() * TRACKS.length)];
}

/** Affinity-based speaker pick: heavier weight to music-aligned personas
 *  so the share feels in-character. K-pop bias adds extra weight to
 *  members whose affinity already includes music/kpop so the chosen
 *  speaker reads as "this person actually listens to this stuff". */
function pickSpeaker(members: ActiveMember[], bias: WorldBias | null): ActiveMember | null {
  if (members.length === 0) return null;
  const MUSIC_TAGS = ["음악","indie","lofi","감성","새벽","calm","사색","운동","주말","책","독서"];
  const isKpopBias = bias?.kind === "kpop";
  const weighted = members.map((m) => {
    const aff = (m.persona.affinity ?? []).map((a) => a.toLowerCase());
    const overlap = MUSIC_TAGS.filter((t) => aff.includes(t)).length;
    const biasBoost = isKpopBias && aff.some((a) => ["music", "음악", "kpop"].includes(a)) ? 2 : 0;
    return { m, w: (m.activity_weight || 0.3) * (1 + overlap + biasBoost) };
  });
  const total = weighted.reduce((s, x) => s + x.w, 0);
  let pick = Math.random() * total;
  for (const w of weighted) {
    pick -= w.w;
    if (pick <= 0) return w.m;
  }
  return weighted[0].m;
}

// gpt-voiced caption that wraps the track. The model gets the speaker's
// persona (말투·affinity·backstory) + slot context + the track caption
// and writes a single Korean line in that persona's voice — replacing
// the prior 12-template wrap. Returns null on failure so the caller can
// fall back to a generic intro.
//
// We deliberately don't pass the speaker's *recent transcript* here:
// music shares are independent "drop a track" moments, not turn-taking
// reactions. Keeping the prompt small (system + 4 lines) keeps cost
// negligible.
async function personaCaption(
  speaker: ActiveMember,
  track: Track,
  slot: Slot,
): Promise<string | null> {
  const affinity = speaker.persona.affinity?.join(", ") ?? "";
  const style = speaker.persona.speech_style ?? "";
  const slotLabel = slot === "morning" ? "아침" : slot === "lunch" ? "점심" : "저녁";

  const system = [
    `당신은 ${speaker.name}.`,
    style && `말투: ${style}`,
    affinity && `관심사: ${affinity}`,
    "",
    `${slotLabel}에 음악 한 곡을 광장 채팅에 공유하려는 참입니다.`,
    "당신의 결로 *왜 이 곡을 듣는지·어떤 기분인지* 한 줄 자연스럽게 던지세요.",
    "",
    "규칙:",
    "- 한 줄, 12~25자. 한국어 캐주얼·반말.",
    "- 곡명은 출력에 *포함하지 마세요* (시스템이 따로 붙임).",
    "- '들어봐!', '추천!', 챗봇 어조 X. 페르소나가 친구한테 무심코 던지는 톤.",
    "- ㅋㅋ 자동 부착 X. 페르소나가 농담형이 아니면 안 씀.",
    "- 결과만 출력 (따옴표·접두사·곡명 없이).",
  ].filter(Boolean).join("\n");

  const raw = await chatComplete({
    system,
    user: `[지금 듣는 곡] ${track.caption}\n[태그] ${track.tags.join(", ")}`,
    maxTokens: 250,
  });
  if (!raw) return null;
  const cleaned = raw
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^[가-힣A-Za-z_]+\s*[:：]\s*/, "")
    .trim();
  return cleaned || null;
}

/** Per-slot tick. Returns the message text inserted (or null if no-op). */
export async function tickMusicShare(
  sb: SupabaseClient,
  worldId: string,
): Promise<{ shared: { name: string; track: string } | null; reason?: string }> {
  const slot = currentSlot();
  if (!slot) return { shared: null, reason: "outside-slot" };

  // Cooldown check: same slot already stamped today? We compare to
  // start-of-today-KST since the slot only fires once per calendar day.
  // Pull bias in the same query so themed plazas get themed tracks
  // (e.g. K-pop fandom → K-pop playlists).
  const slotColumn = `last_music_${slot}_at` as const;
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
    // Convert both to KST date strings and compare; if same calendar
    // date, we already fired today.
    const lastKstDate = new Date(new Date(lastIso).getTime() + 9 * 3600_000).toISOString().slice(0, 10);
    const nowKstDate = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
    if (lastKstDate === nowKstDate) return { shared: null, reason: `${slot}-already-shared` };
  }

  // Temporal jitter inside the slot. Without this, cron-per-minute fires
  // tickMusicShare at the very first minute of the slot and the music
  // share lands ON THE DOT (8:00:30, 12:00:30, 19:00:30) — reads as
  // scheduled, not organic. 12% per-tick probability means avg first-fire
  // ~8 minutes into the slot, with visible randomness across days.
  if (Math.random() > 0.12) return { shared: null, reason: `${slot}-jitter-skip` };

  // Atomic claim — set the slot stamp first so concurrent ticks don't
  // double-fire. If someone else just claimed it, we'll see a row
  // mismatch later.
  const nowIso = new Date().toISOString();
  await sb.from("worlds").update({ [slotColumn]: nowIso }).eq("id", worldId);

  // Active members in the world.
  const { data: rows } = await sb
    .from("members")
    .select("id, name, persona, activity_weight, status, activated_at")
    .eq("current_location_world_id", worldId);
  const active = (rows ?? []).filter(
    (m) => m.activated_at !== null && m.status === "active",
  ) as ActiveMember[];
  if (active.length === 0) {
    // Roll back the stamp so we try again later.
    await sb.from("worlds").update({ [slotColumn]: null }).eq("id", worldId);
    return { shared: null, reason: "no-active-members" };
  }

  const bias = (world as { bias?: WorldBias | null }).bias ?? null;
  const speaker = pickSpeaker(active, bias);
  if (!speaker) return { shared: null, reason: "pick-failed" };
  const track = pickTrackFor(speaker, bias);

  // Persona-voiced caption via Claude — replaces the 12-template
  // combinatorial grid that made every music share read the same. Falls
  // back to a generic intro if the model call fails so the share still
  // goes out.
  const caption = process.env.ANTHROPIC_API_KEY
    ? await personaCaption(speaker, track, slot)
    : null;
  const fallback: Record<Slot, string> = {
    morning: "아침에 듣는 거",
    lunch:   "점심에 들음",
    evening: "지금 듣는 중",
  };
  const intro = caption ?? `${fallback[slot]}.`;
  const text = `${intro} ${track.caption}\n${track.url}`;

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
  console.log(`[music/${slot}] ${speaker.name} → ${track.caption}`);
  return { shared: { name: speaker.name, track: track.caption } };
}
