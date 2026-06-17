// AI member memory continuity.
//
// At each KST-09:00 rollover we read each active member's messages from
// the previous day, condense them to a one-line first-person summary via
// Claude, and store that summary in `member_memory_traces` with
// trace_kind = 'event' and trace_data = { day, text }.
//
// At speech time, the system prompt is augmented with the speaker's most
// recent N traces ("어제까지의 너의 기억"), so AIs can reference what they
// did yesterday/last week — turning each room into a continuous space
// rather than a series of one-off conversations.

import type { SupabaseClient } from "@supabase/supabase-js";
import { dayLabel, dayStart, dayEnd, dayStartFromLabel } from "@/lib/day-rollover";
import { chatComplete } from "@/lib/claude";

const SUMMARY_MAX_TOKENS = 200;

type MemberRow = {
  id: string;
  name: string;
  persona: { affinity?: string[]; speech_style?: string };
  backstory: string | null;
};

type MsgRow = {
  text: string;
  owner_user_id: string | null;
  owner_member_id: string | null;
};

/** Summarize one member's day. Idempotent — checks for an existing trace
 *  with the same day label before writing. Returns the trace text or null
 *  if nothing happened (no messages, or trace already existed). */
export async function summarizeMemberDay(
  sb: SupabaseClient,
  member: MemberRow,
  worldId: string,
  dayLabelStr: string,
): Promise<string | null> {
  // Skip if trace already exists for this day.
  const { data: existing } = await sb
    .from("member_memory_traces")
    .select("id")
    .eq("member_id", member.id)
    .eq("trace_kind", "event")
    .filter("trace_data->>day", "eq", dayLabelStr)
    .limit(1);
  if (existing && existing.length > 0) return null;

  // Day window.
  const start = dayStartFromLabel(dayLabelStr);
  const end = dayEnd(start);

  // All msgs in window — both this member's and others' (for context).
  // Join the peer's display name so the transcript can show "[시연]"
  // instead of an opaque "[다른 멤버]" — without that, the summary
  // model has no way to write "시연이랑 야근 얘기 했음" and peer
  // relationships never make it into the diary.
  const { data: msgs } = await sb
    .from("messages")
    .select("text, owner_user_id, owner_member_id, members(name)")
    .eq("world_id", worldId)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at", { ascending: true })
    .limit(200);
  type MsgRowWithPeer = MsgRow & { members?: { name: string }[] | { name: string } | null };
  const rows = (msgs ?? []) as unknown as MsgRowWithPeer[];

  // Member must have at least one message in the window — otherwise
  // there's nothing to summarize.
  const ownLines = rows.filter((r) => r.owner_member_id === member.id);
  if (ownLines.length === 0) return null;

  // Names of peers (other members) who actually spoke today. Surfaced
  // to the summary prompt so the model can pick one to reference.
  const peerNames = new Set<string>();
  for (const r of rows) {
    if (!r.owner_member_id || r.owner_member_id === member.id) continue;
    const peerName = Array.isArray(r.members) ? r.members[0]?.name : r.members?.name;
    if (peerName) peerNames.add(peerName);
  }
  const peerList = [...peerNames];

  // Build a compact transcript with role markers + peer names so the
  // model can see who said what.
  const transcript = rows
    .map((r) => {
      if (r.owner_member_id === member.id) return `[나] ${r.text}`;
      if (r.owner_user_id) return `[방장] ${r.text}`;
      const peerName = Array.isArray(r.members) ? r.members[0]?.name : r.members?.name;
      return `[${peerName ?? "다른 멤버"}] ${r.text}`;
    })
    .join("\n");

  const system = [
    `당신은 ${member.name}, 가상의 광장 멤버. 페르소나:`,
    member.persona.affinity ? `- 관심사: ${member.persona.affinity.join(", ")}` : "",
    member.persona.speech_style ? `- 말투: ${member.persona.speech_style}` : "",
    member.backstory ? `- 배경: ${member.backstory}` : "",
  ].filter(Boolean).join("\n");

  const peerHint = peerList.length > 0
    ? `오늘 같이 있던 사람들: ${peerList.join(", ")}.`
    : "오늘 다른 멤버는 거의 없었음.";

  const userPrompt = [
    `[작업: 아래는 ${dayLabelStr} 하루의 광장 대화. 당신([나]) 입장에서 그 날을 한 줄로 회상해 적습니다.]`,
    peerHint,
    "",
    transcript,
    "",
    "회상 한 줄을 1인칭 평어로. 예:",
    `- "강변 따라 10km 뛰고 막걸리집 들름."`,
    `- "시연이랑 야근 얘기로 짠해했음."`,
    `- "야근파, 해리 둘이 막걸리 얘기 길게 했네."`,
    "",
    "규칙:",
    "- 한 줄. 40자 이내.",
    "- 1인칭 평어. 자기 이름 안 적음.",
    "- *다른 멤버랑 의미 있게 주고받은 게 있으면* 그 사람 이름 + 무슨 얘기였는지 짧게 포함. (없으면 굳이 X.)",
    "- 진짜 그 날의 사실만. 메타·안내 톤 X.",
  ].join("\n");

  const raw = await chatComplete({
    system,
    user: userPrompt,
    maxTokens: SUMMARY_MAX_TOKENS,
  });
  if (!raw) return null;
  const text = raw
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^[가-힣A-Za-z0-9._:]+\s*[:：]\s*/, "");
  if (!text) return null;

  const { error } = await sb.from("member_memory_traces").insert({
    member_id: member.id,
    source_world_id: worldId,
    trace_kind: "event",
    trace_data: { day: dayLabelStr, text },
    strength: 1.0,
  });
  if (error) {
    console.warn(`[memory] insert failed for ${member.name}:`, error.message);
    return null;
  }
  return text;
}

/** Daily roll-up: for every active member in a world, write yesterday's
 *  summary if they spoke that day and don't have one yet. Safe to call
 *  any time (idempotent via the existence check inside summarizeMemberDay).
 *  Returns the names that got a new trace this call. */
export async function tickDailySummaries(
  sb: SupabaseClient,
  worldId: string,
): Promise<{ summarized: string[] }> {
  if (!process.env.ANTHROPIC_API_KEY) return { summarized: [] };

  // "Yesterday" relative to now's day-bucket.
  const yesterdayMs = dayStart().getTime() - 1000; // any moment inside yesterday
  const yesterday = dayLabel(yesterdayMs);

  // Pull every member ever active in this world (we want to summarize
  // even members who have since gone ghost — their memory persists).
  const { data: memberRows } = await sb
    .from("members")
    .select("id, name, persona, backstory")
    .eq("current_location_world_id", worldId);
  const members = (memberRows ?? []) as MemberRow[];

  const summarized: string[] = [];
  for (const m of members) {
    try {
      const text = await summarizeMemberDay(sb, m, worldId, yesterday);
      if (text) summarized.push(m.name);
    } catch (e) {
      console.warn(`[memory] ${m.name} summary failed:`, e instanceof Error ? e.message : e);
    }
  }
  return { summarized };
}

export type MemoryTrace = { day: string; text: string };

/** Fetch the speaker's N most recent memory traces, newest first. */
export async function fetchRecentMemory(
  sb: SupabaseClient,
  memberId: string,
  limit = 3,
): Promise<MemoryTrace[]> {
  const { data } = await sb
    .from("member_memory_traces")
    .select("trace_data, acquired_at")
    .eq("member_id", memberId)
    .eq("trace_kind", "event")
    .order("acquired_at", { ascending: false })
    .limit(limit);
  return (data ?? [])
    .map((r) => r.trace_data as MemoryTrace)
    .filter((t) => t && t.day && t.text);
}
