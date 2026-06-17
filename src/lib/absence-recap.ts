// 부재 시 요약 (D). 사용자가 자리비운 사이 광장에서 AI들이 떠든 내용을
// 다음 접속 시 한 줄로 압축해 보여주는 시스템 메시지.
//
// 트리거: members 라우트가 owner-active 하트비트를 갱신할 때, 이전
// 스탬프가 ABSENCE_RECAP_MIN_MS 이상 묵었으면 (= 사용자가 충분히 오래
// 자리비웠음) 그 사이 쌓인 AI 라인을 fetch → gpt로 한 줄 요약 → kind=
// "recap" 메시지로 INSERT. 이 메시지는 AmbientFeed에서 가운데 정렬
// + 다른 시각 처리로 렌더된다.
//
// 중복 방지: 같은 부재 구간에 대해 두 번 fire되지 않도록, INSERT 직전에
// "이미 absenceStart 이후 recap 행이 있는가?" 체크. 새 부재가 시작되면
// (즉 owner가 다시 활성화 → 다시 자리비움) 자연스럽게 다음 recap을
// 받을 수 있다.

import type { SupabaseClient } from "@supabase/supabase-js";
import { chatComplete } from "@/lib/claude";
import type { Plan } from "@/lib/energy";
import { type Locale, LANGUAGE_NAMES } from "@/lib/language";

// 5분 이상 자리비웠으면 recap 대상. ambient-loop의 OWNER_OFFLINE_MUTE_MS
// 와 동일하게 맞춰 "광장이 조용해진 구간 = recap 구간" 이라는 직관에
// 부합하게 둔다.
const ABSENCE_RECAP_MIN_MS = 5 * 60_000;
// 부재 구간 안에 적어도 이 개수만큼 AI 라인이 있어야 요약을 만든다.
// 1~2개로는 "라온이 한마디 흘렸음" 수준이라 요약할 가치가 없다.
const MIN_AI_LINES_FOR_RECAP = 3;
// 요약에 넣을 최근 N개. 광장이 1시간 떠든 경우 N개만 보고 가장 핵심을
// 잡는다. 토큰 비용/품질 균형.
const RECAP_CONTEXT_LIMIT = 40;

const RECAP_MAX_TOKENS = 200;

type AiMessage = {
  text: string;
  owner_member_id: string;
  created_at: string;
  members?: { name: string }[] | { name: string } | null;
};

/** Insert a recap row if the owner was away long enough AND meaningful
 *  AI activity happened in the gap. Best-effort: any failure logs + returns.
 *  Must run BEFORE the heartbeat is refreshed so we can see the prior stamp. */
export async function maybeInsertAbsenceRecap(
  sb: SupabaseClient,
  worldId: string,
  prevActiveAtIso: string | null,
  language: Locale = "ko",
): Promise<{ inserted: boolean; reason?: string }> {
  if (!prevActiveAtIso) return { inserted: false, reason: "no-prev-stamp" };
  const prevMs = new Date(prevActiveAtIso).getTime();
  const gapMs = Date.now() - prevMs;
  if (gapMs < ABSENCE_RECAP_MIN_MS) return { inserted: false, reason: "gap-too-short" };

  // Dedup: if we already inserted a recap whose created_at falls inside
  // this same absence window, skip. The owner pings members on a 60s
  // safety poll, so without this we'd insert a recap on every poll for
  // ~5 minutes after they return.
  const { data: priorRecap } = await sb
    .from("messages")
    .select("id, created_at")
    .eq("world_id", worldId)
    .eq("kind", "recap")
    .gte("created_at", prevActiveAtIso)
    .limit(1);
  if (priorRecap && priorRecap.length > 0) {
    return { inserted: false, reason: "already-recapped" };
  }

  // Catch-up depth is a Plus entitlement (spec §6): free gets one terse
  // vibe line; Plus gets a fuller recap (more named moments + a relationship
  // beat) over more context.
  const { data: w } = await sb
    .from("worlds")
    .select("plan")
    .eq("id", worldId)
    .maybeSingle();
  const plan = (w?.plan ?? "free") as Plan;
  const contextLimit = plan === "plus" ? 80 : RECAP_CONTEXT_LIMIT;

  // Pull AI-only chatter from the absence window. owner_member_id NOT
  // NULL = a member spoke (excludes both the user's own lines and the
  // earlier "X 님이 입장하셨어요" system rows).
  const { data: rows, error } = await sb
    .from("messages")
    .select("text, owner_member_id, created_at, members(name)")
    .eq("world_id", worldId)
    .not("owner_member_id", "is", null)
    .gte("created_at", prevActiveAtIso)
    .order("created_at", { ascending: true })
    .limit(contextLimit);
  if (error) return { inserted: false, reason: `fetch-err: ${error.message}` };

  const lines = (rows ?? []) as unknown as AiMessage[];
  if (lines.length < MIN_AI_LINES_FOR_RECAP) {
    return { inserted: false, reason: `too-few (${lines.length})` };
  }

  // Build a labeled transcript ("라온: ...") for the summarizer.
  const transcript = lines
    .map((r) => {
      const m = Array.isArray(r.members) ? r.members[0] : r.members;
      return `${m?.name ?? "?"}: ${r.text}`;
    })
    .join("\n");

  if (!process.env.ANTHROPIC_API_KEY) return { inserted: false, reason: "no-api-key" };

  const summary = await summarize(transcript, plan, language);
  if (!summary) return { inserted: false, reason: "summary-empty" };

  const { error: insErr } = await sb.from("messages").insert({
    world_id: worldId,
    kind: "recap",
    text: summary,
  });
  if (insErr) return { inserted: false, reason: `insert-err: ${insErr.message}` };

  console.log(`[recap/${plan}] world=${worldId.slice(0, 8)} gap=${Math.round(gapMs / 60_000)}m lines=${lines.length} → ${summary}`);
  return { inserted: true };
}

async function summarize(
  transcript: string,
  plan: Plan,
  language: Locale = "ko",
): Promise<string | null> {
  const isPlus = plan === "plus";
  // ko keeps the original Korean prompts verbatim (byte-identical to the
  // pre-i18n single-language version). Non-ko plazas get a same-intent
  // English-meta prompt that pins the *output* to the plaza language via
  // LANGUAGE_NAMES — a native recap written in-language, not a translation.
  const langName = LANGUAGE_NAMES[language];
  const system = language === "ko"
    ? (isPlus
        ? [
            "당신은 작은 디지털 광장의 부재 요약을 적는 사람입니다.",
            "",
            "역할: 사용자가 자리비운 동안 멤버들끼리 떤 대화 로그를 받아, 그 사이 *무슨 결이 흘렀는지* 한 발 떨어져 들려줍니다.",
            "",
            "톤: 친구가 슬쩍 정리해주듯. \"라온이 막걸리 얘기로 분위기 띄웠고, 야근파가 늦게 합류해서 둘이 한참 떠들었어요. 드립.k는 오늘따라 조용.\" 같은 결.",
            "",
            "규칙:",
            "- 2~3문장, 총 60~120자. 줄바꿈 1~2번으로 끊어도 OK.",
            "- 분위기 + 도드라진 순간 2~3개 + 멤버 사이의 결(누가 누구랑 어울렸는지) 한 자락.",
            "- 사건을 기계적으로 나열하지 말 것. 누가 한 말 그대로 반복 X.",
            "- 인용부호·따옴표·머리말('요약:')·자기 호명 X. 관찰자 톤.",
          ].join("\n")
        : [
            "당신은 작은 디지털 광장의 부재 요약을 적는 사람입니다.",
            "",
            "역할: 사용자가 자리비운 동안 멤버들끼리 떤 대화 로그를 받아, *한 줄*로 그 분위기를 압축해서 알려줍니다.",
            "",
            "톤: 친구가 슬쩍 알려주듯 가볍게. \"라온이 막걸리 얘기 던지고 갔어요. 야근파가 늦게 합류.\" 같은 결.",
            "",
            "규칙:",
            "- 한 줄, 25~50자. 두 토막 정도 가능 (마침표·쉼표로 끊기).",
            "- 멤버 이름은 자연스럽게 인용 OK. 모두 호명할 필요 X.",
            "- 사건을 시간 순으로 나열하지 말고, *분위기*를 잡아낼 것.",
            "- 인용부호, 따옴표, 머리말('요약:'), 자기 호명 X.",
            "- 누가 한 말을 그대로 반복하지 말 것. 한 발 떨어진 관찰자 톤.",
          ].join("\n"))
    : (isPlus
        ? [
            `You write the "while you were away" recap for a small digital plaza. Write entirely in ${langName} (a native summary, NOT a translation).`,
            "",
            "Role: you receive a log of what the members said to each other while the owner was away, and tell them — one step removed — *what mood and threads ran through it*.",
            "",
            "Tone: like a friend casually catching them up, e.g. \"Raon got everyone going on a drinks tangent, the late-shift crowd joined later and the two of them talked for a while. drip.k was quiet today.\"",
            "",
            "Rules:",
            "- 2-3 sentences, fairly short overall. One or two line breaks are fine.",
            "- The mood + 2-3 standout moments + a thread of who-clicked-with-whom.",
            "- Don't list events mechanically. Don't repeat anyone's words verbatim.",
            "- No quotes, no header ('Summary:'), no self-reference. Observer tone.",
          ].join("\n")
        : [
            `You write the "while you were away" recap for a small digital plaza. Write entirely in ${langName} (a native summary, NOT a translation).`,
            "",
            "Role: you receive a log of what the members said to each other while the owner was away, and compress the *mood* of it into a single line.",
            "",
            "Tone: light, like a friend casually catching them up, e.g. \"Raon tossed out a drinks tangent and left. The late-shift crowd joined later.\"",
            "",
            "Rules:",
            "- One line, short. Two clauses at most (split with a period or comma).",
            "- Quoting member names naturally is fine. No need to name everyone.",
            "- Don't list events in time order — capture the *mood*.",
            "- No quotes, no header ('Summary:'), no self-reference.",
            "- Don't repeat anyone's words verbatim. One step removed, observer tone.",
          ].join("\n"));
  const userPrompt = language === "ko"
    ? (isPlus
        ? `[광장 대화 로그]\n${transcript}\n\n위 대화의 결을 2~3문장으로.`
        : `[광장 대화 로그]\n${transcript}\n\n위 대화의 분위기를 한 줄로.`)
    : (isPlus
        ? `[plaza chat log]\n${transcript}\n\nSummarize the threads above in 2-3 sentences (in ${langName}).`
        : `[plaza chat log]\n${transcript}\n\nCapture the mood above in one line (in ${langName}).`);
  const raw = await chatComplete({
    system,
    user: userPrompt,
    maxTokens: isPlus ? 360 : RECAP_MAX_TOKENS,
  });
  if (!raw) return null;
  return raw.replace(/^["'`]+|["'`]+$/g, "").trim() || null;
}
