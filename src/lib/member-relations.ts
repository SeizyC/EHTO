// Phase 3 — per-pair "relationship" state for AI members. Reading +
// writing helpers around the `member_relations` table. The pair key is
// always (smaller_uuid, larger_uuid) so upserts target a single row
// regardless of which member is the "speaker" at any moment.

import type { SupabaseClient } from "@supabase/supabase-js";
import { chatComplete } from "@/lib/claude";
import { type Locale, LANGUAGE_NAMES } from "@/lib/language";

const TOPIC_KEEP = 5; // how many recent shared topics we remember per pair

function pair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

/** Bump the interaction count + refresh timestamp for a pair, optionally
 *  appending a short topic phrase (e.g. "야근" / "막걸리") to the rolling
 *  shared_topics list. Safe to call after any ambient tick where two
 *  members exchanged lines in the same recent window. */
export async function recordInteraction(
  sb: SupabaseClient,
  memberA: string,
  memberB: string,
  topic?: string,
): Promise<void> {
  if (memberA === memberB) return;
  const [a, b] = pair(memberA, memberB);

  // Read-then-write: PostgREST doesn't natively support jsonb append in
  // an upsert. With one tiny round-trip per relation update we keep
  // the topic list bounded and dedup-safe.
  const { data: existing } = await sb
    .from("member_relations")
    .select("interaction_count, shared_topics")
    .eq("member_a_id", a)
    .eq("member_b_id", b)
    .maybeSingle();

  const now = new Date().toISOString();
  if (!existing) {
    await sb.from("member_relations").insert({
      member_a_id: a,
      member_b_id: b,
      interaction_count: 1,
      last_interaction_at: now,
      shared_topics: topic ? [topic] : [],
      updated_at: now,
    });
    return;
  }

  let topics = Array.isArray(existing.shared_topics)
    ? (existing.shared_topics as string[])
    : [];
  if (topic && !topics.includes(topic)) {
    topics = [...topics, topic].slice(-TOPIC_KEEP);
  }
  await sb
    .from("member_relations")
    .update({
      interaction_count: (existing.interaction_count as number) + 1,
      last_interaction_at: now,
      shared_topics: topics,
      updated_at: now,
    })
    .eq("member_a_id", a)
    .eq("member_b_id", b);
}

export type PeerRelation = {
  peerId: string;
  peerName: string;
  interactionCount: number;
  lastInteractionAt: string;
  sharedTopics: string[];
};

/** Recent + most-interacted peers for a given speaker. Used by the
 *  ambient prompt to inject "이 사람들과의 결" so replies stay coherent
 *  with prior exchanges. Returns up to `limit` peers, sorted by recency
 *  with a small bonus for high interaction_count. */
export async function fetchPeerRelations(
  sb: SupabaseClient,
  memberId: string,
  limit = 4,
): Promise<PeerRelation[]> {
  // The row's "other" side could be either member_a_id or member_b_id —
  // run two cheap queries and merge. Joining `members(name)` on each
  // side avoids a separate name lookup.
  const [aSide, bSide] = await Promise.all([
    sb.from("member_relations")
      .select("member_b_id, interaction_count, last_interaction_at, shared_topics, peer:members!member_relations_member_b_id_fkey(name)")
      .eq("member_a_id", memberId)
      .order("last_interaction_at", { ascending: false })
      .limit(limit * 2),
    sb.from("member_relations")
      .select("member_a_id, interaction_count, last_interaction_at, shared_topics, peer:members!member_relations_member_a_id_fkey(name)")
      .eq("member_b_id", memberId)
      .order("last_interaction_at", { ascending: false })
      .limit(limit * 2),
  ]);

  type Row = {
    peerId: string;
    peerName: string | null;
    interaction_count: number;
    last_interaction_at: string;
    shared_topics: unknown;
  };
  const fromA: Row[] = (aSide.data ?? []).map((r: Record<string, unknown>) => ({
    peerId: r.member_b_id as string,
    peerName: getPeerName(r.peer),
    interaction_count: r.interaction_count as number,
    last_interaction_at: r.last_interaction_at as string,
    shared_topics: r.shared_topics,
  }));
  const fromB: Row[] = (bSide.data ?? []).map((r: Record<string, unknown>) => ({
    peerId: r.member_a_id as string,
    peerName: getPeerName(r.peer),
    interaction_count: r.interaction_count as number,
    last_interaction_at: r.last_interaction_at as string,
    shared_topics: r.shared_topics,
  }));

  // Score = interaction_count + recency weight (within last 14d gets a
  // small boost). Then sort and take top N.
  const now = Date.now();
  const scored = [...fromA, ...fromB]
    .filter((r) => r.peerName)
    .map((r) => {
      const ageDays = (now - new Date(r.last_interaction_at).getTime()) / 86400000;
      const recency = Math.max(0, 1 - ageDays / 14);
      return { row: r, score: r.interaction_count + recency * 3 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ row }) => ({
    peerId: row.peerId,
    peerName: row.peerName!,
    interactionCount: row.interaction_count,
    lastInteractionAt: row.last_interaction_at,
    sharedTopics: Array.isArray(row.shared_topics)
      ? (row.shared_topics as string[])
      : [],
  }));
}

function getPeerName(peer: unknown): string | null {
  if (!peer) return null;
  if (Array.isArray(peer)) {
    return (peer[0] as { name?: string } | undefined)?.name ?? null;
  }
  return (peer as { name?: string }).name ?? null;
}

// Topic extractor — single short noun phrase that captures what THIS
// ambient line is about ("막걸리", "야근", "고양이"). Returns null when
// the line is too thin to anchor on (e.g. "오 진짜?", "ㅋㅋ").
//
// Why this exists: shared_topics on member_relations was never being
// populated — recordInteraction's topic arg was unused everywhere it's
// called. Without topics, peer hints in the ambient prompt degraded to
// "X와 N회 어울림" with no semantic anchor, so cross-day continuity
// ("라온이랑 그때 막걸리 얘기") was impossible. A cheap Claude call in
// the post-insert path unlocks the relations layer.

export async function extractTopic(
  text: string,
  language: Locale = "ko",
): Promise<string | null> {
  const trimmed = text.trim();
  // Lines under ~6 chars are almost always reaction sounds ("오 진짜?",
  // "ㅋㅋ", "응", "lol", "ok") with no extractable topic — skip the API hit.
  if (trimmed.length < 6) return null;

  // ko keeps its original Korean prompt verbatim (byte-identical to the
  // pre-i18n single-language version) so its keyword behavior never
  // regresses. Non-ko plazas get an English-meta prompt that pins the
  // *output keyword* to the plaza language via LANGUAGE_NAMES — the
  // keyword is stored in user_signals in the plaza's own language, and a
  // plaza is single-language so no cross-language normalization is needed.
  const system =
    language === "ko"
      ? [
          "한 줄의 채팅 메시지에서 핵심 토픽을 한국어 명사 1개로 뽑아내세요.",
          "",
          "규칙:",
          "- 결과는 단일 명사 또는 짧은 명사구 (1~6자 정도). 동사·형용사·문장 X.",
          "- 일상 사물·활동·감정·고유명사 OK (예: '막걸리', '야근', '고양이', '비', '카페', '커피').",
          "- 추출할 만한 명확한 토픽이 없으면 'NONE' 만 출력.",
          "- 결과만 출력 (설명·따옴표·접두사 없이).",
        ].join("\n")
      : [
          `Extract ONE short interest keyword from a one-line chat message, written in ${LANGUAGE_NAMES[language]}.`,
          "",
          "Rules:",
          `- The keyword MUST be written in ${LANGUAGE_NAMES[language]}. A single noun or short noun phrase (1-3 words). No verbs, adjectives, or sentences.`,
          "- Everyday objects, activities, feelings, or proper nouns are fine (e.g. 'indie music', 'overtime', 'cats', 'rain', 'coffee').",
          "- If there is no clear extractable topic (greetings, reactions, laughter like 'lol'/'haha'/'ok'), output only 'NONE'.",
          "- Output the result only (no explanation, quotes, or prefix).",
        ].join("\n");

  const raw = await chatComplete({
    system,
    user: trimmed,
    maxTokens: 32,
  });
  if (!raw || raw === "NONE" || raw.length > 20) return null;
  const cleaned = raw.replace(/^["'`]+|["'`.,;!?]+$/g, "").trim();
  if (!cleaned || cleaned === "NONE") return null;
  return cleaned;
}
