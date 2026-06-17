// Server-side: generate one member's reply via Claude.
//
// Architecture note (2026-05-27 migration): chat engine moved from
// OpenAI (gpt-5.3-chat-latest via CF AI Gateway compat mode) to Claude
// (claude-opus-4-7 via the Anthropic SDK, routed through the same
// gateway's /anthropic path). The prior rewrite stripped the prompts to
// the bone trusting a capable model — that posture transfers cleanly:
// Claude follows the persona + minimal intent hints without the do/don't
// scaffolding we used to need for mini-class models.

import type { SupabaseClient } from "@supabase/supabase-js";
import { chatComplete, chatCompleteWithVideo, CHAT_MODEL, FILLER_CHAT_MODEL } from "@/lib/claude";
import type { Locale } from "@/lib/language";
import { PROMPT_FRAME, languageDirective, joinedAgoLabel } from "@/lib/prompt-i18n";
import { inWheelhouse } from "@/lib/wheelhouse";

type Member = {
  id: string;
  name: string;
  persona: { affinity?: string[]; speech_style?: string };
  backstory: string | null;
  activity_weight: number;
};

// Claude lives in src/lib/claude.ts (CHAT_MODEL = claude-opus-4-7). The
// output is short Korean chat (12~30자 per turn), so adaptive thinking
// stays off (Opus 4.7's default). max_tokens headroom is generous —
// 4.7 counts tokens slightly differently from prior models and chat
// replies are still well within budget; the prompt's "30자 넘지 말 것"
// rule does the real shaping.
const MAX_TOKENS = 300;

// Korean duration string from a timestamp. Surfaced in the system
// prompt as a fact ("이 광장에 들어온 시기: 어제") so questions like
// "언제 왔어?" get a real answer instead of a hallucinated one.
export function formatJoinedAgo(
  activatedAt: string | Date | null | undefined,
  language: Locale = "ko",
): string | null {
  if (!activatedAt) return null;
  const at = typeof activatedAt === "string" ? new Date(activatedAt) : activatedAt;
  const ms = Date.now() - at.getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const min = Math.floor(ms / 60_000);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  const weeks = Math.round(day / 7);
  const months = Math.round(day / 30);
  if (language === "en") {
    if (min < 5) return "just now";
    if (min < 60) return `${min}m ago`;
    if (hr < 3) return `${hr}h ago`;
    if (day === 0) return "today";
    if (day === 1) return "yesterday";
    if (day < 7) return `${day} days ago`;
    if (day < 21) return `~${weeks} weeks ago`;
    if (day < 60) return `~${months} months ago`;
    return `~${months} months ago`;
  }
  if (language === "ja") {
    if (min < 5) return "さっき";
    if (min < 60) return `${min}分前`;
    if (hr < 3) return `${hr}時間前`;
    if (day === 0) return "今日";
    if (day === 1) return "昨日";
    if (day < 7) return `${day}日前`;
    if (day < 21) return `約${weeks}週間前`;
    if (day < 60) return `約${months}ヶ月前`;
    return `約${months}ヶ月前`;
  }
  // ko (default) — verbatim original strings.
  if (min < 5) return "방금";
  if (min < 60) return `${min}분 전`;
  if (hr < 3) return `${hr}시간 전`;
  if (day === 0) return "오늘";
  if (day === 1) return "어제";
  if (day < 7) return `${day}일 전`;
  if (day < 21) return `약 ${weeks}주 전`;
  if (day < 60) return `약 ${months}달 전`;
  return `${months}달 전`;
}

function buildSystemPrompt(
  m: Member,
  opts: {
    /** Plaza language — selects which PROMPT_FRAME composition to use and
     *  which output-language directive to append. */
    language: Locale;
    memory?: string[];
    joinedAgo?: string | null;
    newsHeadlines?: string[];
    peerHints?: string[];
    /** One-line scene-of-day vibe (KST 시간대별). Bends average flavor;
     *  not a topic mandate. */
    sceneHint?: string;
    /** Optional world-identity hint (e.g. K-pop fandom + artist). When
     *  present, nudges all members of that plaza to weave the theme
     *  into conversation organically. */
    biasHint?: string | null;
    /** Implicit preference nudge — top 1-2 topics the user has been
     *  talking about. Softer than biasHint (no "팬덤" framing, no
     *  obligation), surfaced only when worth mentioning. */
    implicitHint?: string | null;
    /** True only when the caller is going through chatCompleteWithVideo
     *  (user-driven replies). When false — i.e. ambient AI-to-AI turns
     *  with NO tools wired in — we must NOT instruct the model to "call
     *  the share_youtube_video tool", because the model will dutifully
     *  emit `[share_youtube_video(query="…")]` as plain text, and that
     *  ugly tool-call syntax lands in the message. */
    allowVideoTool?: boolean;
  },
): string {
  const affinity = m.persona.affinity?.join(", ") ?? "";
  const style = m.persona.speech_style ?? "";
  const backstory = m.backstory ?? "";

  const factLines: string[] = [];
  if (opts?.joinedAgo) factLines.push(`- ${joinedAgoLabel(opts.language)}: ${opts.joinedAgo}`);

  const memoryLines = (opts?.memory ?? []).map((m) => `- ${m}`);
  const newsLines = (opts?.newsHeadlines ?? []).slice(0, 6).map((h) => `- ${h}`);
  const peerLines = (opts?.peerHints ?? []).slice(0, 4);

  // PERSONA AS PERFUME, NOT BRAND.
  //
  // Earlier this prompt told the model "위 페르소나가 이번 줄에서도 드러나야
  // 합니다" + "자기 페르소나가 받는 방식으로". Result: every line read
  // like the member's name tag was stitched on it — "내가 indie 좋아해서
  // 새벽 음악…" style brand statements. Real people don't audition their
  // personality every sentence; their tone just leaks through.
  //
  // The frame now: persona is a background hum. The line should feel
  // like a friend casually typing in a live chat, not a character
  // proving their archetype. Variety > consistency at the sentence level.
  //
  // The frame BODY (persona lines + behavioral guidance + all conditional
  // hint blocks) lives in src/lib/prompt-i18n.ts, keyed by language, so
  // the same prompt can be composed in any Locale. The `ko` frame is a
  // verbatim port — its output is byte-identical to the array this
  // function used to build inline. We only pre-compute the same hint
  // inputs here and hand them to the frame.
  const lines = PROMPT_FRAME[opts.language]({
    name: m.name,
    style,
    backstory,
    affinity,
    factLines,
    biasHint: opts.biasHint,
    implicitHint: opts.implicitHint,
    sceneHint: opts.sceneHint,
    memoryLines,
    peerLines,
    newsLines,
    allowVideoTool: opts.allowVideoTool,
  });

  // Output-language directive. The ko frame already implies Korean (it's
  // written in Korean and ends with the ko bad-output examples), so to
  // keep ko byte-identical to today's prompt we append the directive only
  // for non-ko languages.
  if (opts.language !== "ko") {
    lines.push("", languageDirective(opts.language));
  }

  return lines.filter(Boolean).join("\n");
}

// First-arrival greeting — when a dormant member activates and joins.
// Room-aware: if peers are already chatting, the greeting can react
// to that ("다들 음악 얘기 중이구나").
export async function generateGreeting(
  member: Member,
  context?: { peers?: string[]; transcript?: string[]; language?: Locale },
): Promise<string | null> {
  const language: Locale = context?.language ?? "ko";
  // joinedAgo here is "just arrived" — localize the label so the system
  // prompt fact line reads natively. ko keeps the original "방금".
  const joinedAgo = formatJoinedAgo(new Date(), language) ?? "방금";
  const system = buildSystemPrompt(member, { language, joinedAgo });
  const peers = context?.peers ?? [];
  const transcript = context?.transcript ?? [];

  const scene: string[] = [];
  if (language === "en") {
    if (peers.length > 0) scene.push(`Already here: ${peers.join(", ")}`);
    else scene.push("Only the host is in the room.");
    if (transcript.length > 0) scene.push(`Recent chat:\n${transcript.map((t) => `  ${t}`).join("\n")}`);
    else scene.push("It's quiet right now.");
  } else if (language === "ja") {
    if (peers.length > 0) scene.push(`すでにいる人: ${peers.join(", ")}`);
    else scene.push("部屋にはホストだけ。");
    if (transcript.length > 0) scene.push(`最近の会話:\n${transcript.map((t) => `  ${t}`).join("\n")}`);
    else scene.push("今は静か。");
  } else {
    if (peers.length > 0) scene.push(`이미 있는 사람: ${peers.join(", ")}`);
    else scene.push("방엔 방장만 있음.");
    if (transcript.length > 0) scene.push(`최근 대화:\n${transcript.map((t) => `  ${t}`).join("\n")}`);
    else scene.push("최근은 조용함.");
  }

  const header =
    language === "en"
      ? "[You just entered the plaza. Say one natural line.]"
      : language === "ja"
        ? "[今プラザに入ったところ。自然にひとこと。]"
        : "[방금 광장에 들어왔어요. 자연스럽게 한마디.]";
  const footer =
    language === "en"
      ? "One short sentence. A greeting is fine, or a quick read of the room."
      : language === "ja"
        ? "1文で短く。挨拶でも、雰囲気を見たひとことでもOK。"
        : "1문장, 짧게. 인사도 좋고 분위기 보고 한마디도 좋아요.";

  const userPrompt = [header, ...scene, "", footer].join("\n");

  const text = await callChat(system, userPrompt, MAX_TOKENS);
  return text ? clean(text) : null;
}

// One-off direct reply (legacy entry point — most chats go through
// generateAmbientLine via the ambient-loop now).
export async function generateMemberReply(
  member: Member,
  userText: string,
  language: Locale = "ko",
): Promise<string | null> {
  const system = buildSystemPrompt(member, { language });
  const text = await callChat(system, userText, MAX_TOKENS);
  return text ? clean(text) : null;
}

export type ConvoTurn = { speaker: string; text: string; isSelf?: boolean };

// Speech intent picked server-side by the orchestrator. Each maps to a
// minimal one-line nudge — the model carries persona/tone from the
// system prompt and we trust it not to need do/don't lists.
export type SpeechIntent =
  | { type: "reply-user-mention"; userName: string }
  | { type: "reply-user"; userName: string }
  | { type: "reply-peer"; peerName: string }
  | { type: "new-topic" }
  | { type: "persona-share" }
  | { type: "check-in"; userName: string }
  | { type: "mood" }
  | { type: "object-interaction"; objectLabel: string };

// Shape = HOW the line is shaped (what its form is on the wire). Intent
// is WHAT this turn is about; shape is the rhetorical mode. Without
// shape variety, every ambient line came out as a flat 18-28자 단정문 —
// the room read like a wall of similar-looking statements. Picking a
// shape per turn (quip / observe / question / etc) is the highest-ROI
// lever for "feels like real chat" vs. "feels like an essay drip-feed".
export type LineShape =
  | "quip"      // 8-15자, fast reaction / one-beat observation
  | "share"     // 18-28자, small recent experience
  | "question"  // 10-22자, real curiosity
  | "observe"   // 12-22자, sensory / environmental
  | "take"      // 18-28자, small opinion / preference (no self-intro)
  | "wonder";   // 12-22자, musing / unresolved thought

const SHAPE_GUIDANCE: Record<LineShape, {
  range: string;
  hint: string;
  examples: string[];
}> = {
  quip: {
    range: "8~15자",
    hint: "직전 흐름에 빠르게 한마디. 짧고 의미 있는 반응. 결론·설명 X.",
    examples: ["오 그거 별로던데", "아 진짜?", "그건 좀 무리야", "ㅇㅋ 동의", "그거 좋더라"],
  },
  share: {
    range: "18~28자",
    hint: "*오늘 일어난 외부 사건*이나 *최근 한 일* 한 자락. 감각 묘사(에어컨/햇빛/손등) X. 실제 행위·만남·발견·사건이 anchor.",
    examples: [
      "어제 본 영화 진짜 별로였어 시간 아까움",
      "친구가 추천한 빵집 가봤는데 줄 길더라",
      "그 책 다 읽었는데 마지막 챕터가 진짜야",
      "오늘 출근길에 길고양이 새끼 봤어",
    ],
  },
  question: {
    range: "10~22자",
    hint: "구체적인 것에 대한 진짜 호기심. 챗봇식 안부 X. 누구한테 한 줄 추천·의견·정보 요청.",
    examples: ["그 영화 어땠어?", "요즘 뭐 보고 있어?", "거기 가성비 어때?", "이거 들어봤어?"],
  },
  observe: {
    range: "12~22자",
    hint: "관찰 한 줄 — 단, *바깥 세상·다른 사람·작은 사건*에 대한 관찰을 우선. 자기 몸 컨디션이나 사물 감각(에어컨 바람·손 시려)은 *피할 것*.",
    examples: [
      "옆 카페 줄이 갑자기 길어졌네",
      "지나가는 사람들 다 우산 들었어",
      "엘리베이터에 모르는 강아지 한 마리",
      "버스가 오늘따라 텅 비었더라",
    ],
  },
  take: {
    range: "18~28자",
    hint: "취향·의견·관점 한 줄. 구체 사물·문화·사람에 대한 작은 입장. *자기소개 X*, 명함 X.",
    examples: [
      "그 카페 분위기는 좋은데 커피는 별로",
      "요즘 드라마 다 30분이면 끊김",
      "그건 좀 과대평가된 듯",
      "사실 그 작가 별로 안 좋아해",
    ],
  },
  wonder: {
    range: "12~22자",
    hint: "자문·여운. 결론 안 내도 됨. 단, *문화·관계·사회·삶*에 대한 작은 의문 — 자기 몸 컨디션 X.",
    examples: [
      "왜 다들 그 책 좋다는 거지",
      "그 사람 요즘 뭐 하나",
      "올해 영화는 다 비슷한 결인가",
      "그땐 왜 그렇게 마음에 들었을까",
    ],
  },
};

export function shapeGuidanceFor(shape: LineShape): string {
  const g = SHAPE_GUIDANCE[shape];
  return [
    `[형식] ${g.range}, ${shape}`,
    g.hint,
    `예시 결: ${g.examples.map((s) => `"${s}"`).join(" / ")}`,
  ].join("\n");
}

export async function generateAmbientLine(
  speaker: Member,
  recent: ConvoTurn[],
  opts: {
    /** Plaza language — threaded into the system prompt frame + output
     *  directive so the speaker replies in the room's language. */
    language: Locale;
    intent: SpeechIntent;
    /** The line's rhetorical mode — picked by the orchestrator before
     *  calling so each turn lands a *different shape*, not another flat
     *  18-28자 단정문. Without this the room degenerates to "wall of
     *  statements". */
    shape?: LineShape;
    avoid?: string[];
    memory?: string[];
    joinedAgo?: string | null;
    /** Current headlines fetched via Naver Search API. Surfaced in the
     *  system prompt as "오늘 화제" so persona-relevant ones can be
     *  picked up. */
    newsHeadlines?: string[];
    /** Recent peer relations summary (Phase 3) — pre-formatted lines
     *  like "- 라온: 같이 어울린 적 4회 (막걸리, 야근)". Injected into
     *  the system prompt so cross-session continuity is possible. */
    peerHints?: string[];
    /** One-line KST 시간대별 vibe sketch from SCENE_BY_BUCKET. */
    sceneHint?: string;
    /** World identity hint (K-pop fandom + artist, etc.). */
    biasHint?: string | null;
    /** Implicit preference top-1/2 topics — pre-formatted as a comma-
     *  joined keyword string. Surfaced as a softer parallel to biasHint
     *  so the room drifts toward the user's recent threads. */
    implicitHint?: string | null;
  },
): Promise<string | null> {
  // For user-driven turns we expose the YouTube share tool so the model
  // can fulfil "@야근파 영상 공유해줘" with a real video. Pure ambient
  // AI-to-AI turns go through the simpler tool-less path — they shouldn't
  // be spawning video shares spontaneously (that's the cron's job).
  const allowVideoTool =
    opts.intent.type === "reply-user" || opts.intent.type === "reply-user-mention";

  // Model routing (spec §5.2): owner-directed turns (the moments the user
  // feels most) stay on Opus; AI↔AI filler runs on the cheaper Sonnet.
  // allowVideoTool already encodes "owner-directed" exactly.
  const model = allowVideoTool ? CHAT_MODEL : FILLER_CHAT_MODEL;

  const system = buildSystemPrompt(speaker, {
    language: opts.language,
    memory: opts.memory,
    joinedAgo: opts.joinedAgo,
    newsHeadlines: opts.newsHeadlines,
    peerHints: opts.peerHints,
    sceneHint: opts.sceneHint,
    biasHint: opts.biasHint,
    implicitHint: opts.implicitHint,
    allowVideoTool,
  });

  const transcript = recent
    .map((t) => (t.isSelf ? `[나(${t.speaker})]: ${t.text}` : `${t.speaker}: ${t.text}`))
    .join("\n");

  // The prior version of this block ("방금 한 말 (중복 X)") only blocked
  // exact text repeats. The model happily generated 4 different stretches
  // of "스트레칭 했어" / "스트레칭 시작" / "스트레칭 풀림" — same
  // micro-topic, different wording. Now we explicitly call out the
  // micro-topic axis so the model has to *change subject*, not just
  // rephrase.
  const avoidBlock =
    opts.avoid && opts.avoid.length > 0
      ? [
          "",
          "최근 본인이 한 말 — 글자 중복 X + **주제(micro-topic) 반복 X**:",
          ...opts.avoid.map((t) => `- "${t}"`),
          "이 라인들의 *주제 영역*과 다른 결로 가세요. 페르소나는 유지하되, 그 안에서 새 각도(다른 사물·다른 활동·다른 감정·다른 관찰)로.",
        ].join("\n")
      : "";

  // Per-intent one-line nudges. Keep them minimal: the system prompt
  // already covers tone + persona + facts + memory. Trust the model.
  // (Opus 4.7 has no temperature dial — sampling variance is implicit.
  // The intent branches used to set temperature 0.85~0.95; tone is now
  // carried entirely by the situation text + shape guidance.)
  const intent = opts.intent;
  // The user's most recent line (the thing a reply-user turn answers).
  const lastUserText = recent.filter((t) => !t.isSelf).at(-1)?.text ?? "";
  const wheelhouse = inWheelhouse(speaker.persona.affinity ?? [], lastUserText);
  let situation: string;

  switch (intent.type) {
    case "reply-user-mention":
      situation = [
        `${intent.userName}님이 *당신을 직접 불러서* 한마디 했어요.`,
        "받는 방법:",
        "- 그 사람이 *물은 것에 진짜로 답*하세요. 책 추천 물으면 책 한 권 꺼내고, 의견 물으면 의견 내고, 부탁이면 부탁에 답하고.",
        wheelhouse
          ? "- **이건 네 관심사 영역이야 — 아는 티 내며 구체적으로.** '그게 뭐야?'로 빠지지 말 것."
          : "- 들어봤거나 일반 상식으로 아는 거면 아는 만큼 알맹이로. 정말 생소할 때만 솔직히 모른다고.",
        "- 형태는 자유(한 줄 추천·짧은 답·되묻기 다 OK) — 단, 사용자 메시지를 *무시한 채 자기 얘기로 새는 건 절대 X*.",
        "- 본인 결대로 답하되, '답' 자체는 사용자 의도에 정렬되어야 함.",
      ].join("\n");
      break;
    case "reply-user":
      situation = [
        `${intent.userName}님이 한마디 했어요.`,
        "받는 방법:",
        "- *알맹이로 받아라*. 질문이면 진짜 답(책 추천 → 책 한 권, 의견 → 의견, 사실 질문 → 사실). 진술/잡담이면 그 내용에 대한 진짜 반응(아는 것·의견·되묻기 중 알맹이 있는 쪽).",
        wheelhouse
          ? "- **이건 네 관심사 영역이야 — 아는 티 내며 구체적으로 받아라.** 모른 척·되묻기로 빠지지 말 것."
          : "- 들어봤거나 일반 상식으로 아는 거면 아는 만큼 알맹이로 받아라. '그게 뭐야?'식 되묻기는 *정말 생소하고 네 관심사와도 무관할 때만*.",
        "- 명사 변주·자기 얘기로 새기 금지. 사용자 메시지가 *anchor*임. 자동 농담·맞장구 X.",
      ].join("\n");
      break;
    case "reply-peer":
      // AIs bouncing off each other is the whole point of an ambient
      // room, but the failure mode is "ㅋㅋ + 명사 변주" cascades.
      // Force engagement with the *meaning* of the prior line, not
      // its surface words.
      situation = [
        `${intent.peerName}의 직전 말에 *반응*하세요.`,
        "받는 방법: 동의·반박·되묻기·공감·짧은 정보 보태기 — 본인 페르소나 결대로 하나.",
        "*절대* 상대 말에서 명사 하나 집어와 변주하는 식으로 잇지 말 것. 그건 단어 게임이지 대화가 아님.",
        "자기 화제로 갈아엎는 것도 X. 페르소나가 'topic-jump' 명시되어 있으면 가끔만 OK.",
      ].join("\n");
      break;
    case "new-topic":
      situation = [
        "광장이 잠잠해요. 본인 페르소나 결에서 우러나오는 한 줄. 오늘 본 것·생각한 것·하고 있는 일.",
        "헤드라인이 시스템 프롬프트에 있다면 자기 결에 맞을 때만 꺼냄 — 억지로 갈고리 걸지 말 것.",
      ].join("\n");
      break;
    case "persona-share":
      situation = "본인 페르소나가 특히 잘 드러나는 한 줄. 관심사·습관·취향 한 자락 — 단, 자기소개 어조 X, 그냥 흘리듯.";
      break;
    case "check-in":
      situation = `${intent.userName}님에게 슬쩍 안부를 묻거나 가벼운 한마디. 챗봇식 "어떻게 지내세요?" X — 본인 결대로.`;
      break;
    case "mood":
      situation = [
        "지금 자기 상태 한 줄 — 피곤함·집중·심란함·만족 같은 결.",
        "짧되 알맹이 있게 (예: '오늘 머리 좀 무거움', '집중 잘 되네'). '졸려ㅋㅋ' 같은 ㅋㅋ 데코 X.",
      ].join("\n");
      break;
    case "object-interaction":
      // The object-interaction intent is the single biggest source of
      // the "가로등 색이 라면스프 같네" failure mode. Lock it down hard:
      // only fire if the persona has a real angle on this object;
      // otherwise produce something normal. The picker still selects
      // this intent at low frequency for variety, but the prompt
      // refuses to manufacture a meme line.
      situation = [
        `광장에 ${intent.objectLabel}이(가) 보임.`,
        "본인 페르소나가 그 오브제와 만나는 *진짜 지점*이 있을 때만 거기서 한 줄. 없으면 그냥 일상 한 자락이나 자기 결의 한 줄로 가도 됨 — 억지로 그 오브제 비유 만들지 말 것.",
        "예시 안 좋은 결: '가로등 색이 라면스프 같네ㅋㅋ' (그냥 단어 변주). 좋은 결: 본인이 그 오브제에 대해 *느끼는 것*이 한 줄에 묻어남.",
      ].join("\n");
      break;
  }

  // Shape guidance — concrete length range + rhetorical hint + 3 example
  // lines. Forces line-shape variety so the room stops sounding like a
  // wall of 25자 단정문. Placed AFTER situation so the form is the last
  // thing the model sees before composing.
  const shapeBlock = opts.shape ? `\n${shapeGuidanceFor(opts.shape)}` : "";

  const userPrompt = [
    `[상황] ${situation}`,
    shapeBlock,
    transcript ? `\n[최근 대화]\n${transcript}` : "",
    avoidBlock,
  ].filter(Boolean).join("\n");

  if (allowVideoTool) {
    const result = await chatCompleteWithVideo({ system, user: userPrompt, maxTokens: MAX_TOKENS, model });
    if (!result) return null;
    const cleaned = clean(result.text);
    if (result.video) {
      // Mirror the cron-path message shape so message-render's YouTube
      // detector picks up the URL and renders the inline player.
      const intro = cleaned || "이거 봐";
      return `${intro} ${result.video.caption}\n${result.video.url}`;
    }
    return cleaned || null;
  }

  const text = await callChat(system, userPrompt, MAX_TOKENS, model);
  return text ? clean(text) : null;
}

// ───── helpers ─────

async function callChat(
  system: string,
  user: string,
  maxTokens: number,
  model?: string,
): Promise<string | null> {
  // Thin wrapper over the shared Claude helper. `model` lets the ambient
  // path route filler to Sonnet and owner-directed replies to Opus; when
  // omitted, chatComplete falls back to CHAT_MODEL (Opus).
  return chatComplete({ system, user, maxTokens, model });
}

// Strip wrapping quotes, accidental "이름: " prefix, and any URL the
// model might have hallucinated. Real shares (music/youtube) come from
// dedicated slot ticks with verified IDs; ambient chat lines should
// never carry a URL. A bare 'https://youtu.be/' (no ID) renders as a
// broken thumbnail and is the most common failure mode.
//
// Also unwraps `{"text":"..."}` envelopes. Observed in prod (bias world,
// 2026-05-27): the model occasionally emits a JSON object as its only
// text content — likely mimicking the structured blocks in the system
// prompt. We parse-and-unwrap so the bubble shows the actual line
// instead of the wrapper.
function clean(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object") {
        const inner = (parsed as Record<string, unknown>).text;
        if (typeof inner === "string" && inner.trim().length > 0) {
          text = inner;
        }
      }
    } catch { /* not valid JSON — fall through to plain cleanup */ }
  }
  return text
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^[가-힣A-Za-z_]+\s*[:：]\s*/, "")
    .replace(/https?:\/\/\S*/g, "")
    // Stray tool-call syntax the model sometimes emits as plain text
    // when it was nudged to "call a tool" but no tool wiring is
    // present this turn. Strip the bracketed form first (it usually
    // sits at the start of the line) and then any bare call. We only
    // target the share_youtube_video name since that's the only tool
    // mentioned anywhere in the system prompt; broadening to a
    // generic `\w+\(...\)` regex would eat legitimate Korean text
    // containing parentheses.
    .replace(/\[\s*share_youtube_video\s*\([^\])]*\)\s*\]/gi, "")
    .replace(/share_youtube_video\s*\([^)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pick one currently-active member from the world to respond. */
export async function pickResponder(
  sb: SupabaseClient,
  worldId: string,
): Promise<Member | null> {
  const { data } = await sb
    .from("members")
    .select("id, name, persona, backstory, activity_weight, status")
    .eq("current_location_world_id", worldId)
    .not("activated_at", "is", null)
    .neq("status", "ghost")
    .gte("activity_weight", 0.3);
  if (!data || data.length === 0) return null;

  const weighted = data.map((m) => ({ m, w: Math.max(0.01, m.activity_weight) }));
  const total = weighted.reduce((s, x) => s + x.w, 0);
  let pick = Math.random() * total;
  for (const x of weighted) {
    if (pick < x.w) return x.m as Member;
    pick -= x.w;
  }
  return weighted[0].m as Member;
}
