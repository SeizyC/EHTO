#!/usr/bin/env node
// Fast regression test for the gpt ambient generation path.
//
// Catches the *most common breakage*: max_completion_tokens too tight
// (reasoning eats the budget, content comes back empty), which has bit
// us multiple times when prompt context grew (shape guidance, persona
// block, news headlines, peer hints).
//
// Reproduces the same prompt shape production uses for the user-reply
// turn across all 6 picker shapes. If any shape returns empty content,
// exits non-zero so `npm run deploy` aborts.
//
// Trade-off: prompts here are duplicated from member-reply.ts. They
// can drift from production. The plan: add a CI step that diffs
// representative blocks. For now, manual sync.
//
// Usage: node scripts/regression-ambient.mjs

import fs from "node:fs";
import path from "node:path";

for (const line of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split("\n")) {
  if (!line.trim() || line.startsWith("#")) continue;
  const i = line.indexOf("=");
  if (i < 0) continue;
  const k = line.slice(0, i).trim();
  const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  if (!(k in process.env)) process.env[k] = v;
}

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) { console.error("OPENAI_API_KEY missing"); process.exit(2); }

// Route through CF AI Gateway (matches production). Set
// CF_AI_GATEWAY_BASE=https://api.openai.com/v1 to fall back to direct
// OpenAI (e.g. if testing the gateway itself is broken).
const GATEWAY_BASE = process.env.CF_AI_GATEWAY_BASE
  ?? `https://gateway.ai.cloudflare.com/v1/${process.env.CF_ACCOUNT_ID ?? ""}/ehto`;
const CHAT_URL = `${GATEWAY_BASE}/compat/chat/completions`;
const MODEL = "openai/gpt-5.3-chat-latest";

// Production-shape system prompt (mirrors src/lib/member-reply.ts buildSystemPrompt).
const systemPrompt = `당신은 weekendrun.
평소 톤(흐릿하게만): 활기 / 길어지면 본인 얘기.
배경(상황 맞을 때만 떠올림): 주말에 자주 운동, 경기 얘기로 운 띄움.
관심사(매번 끌어오지 말 것): sports, energy, 주말, 운동.

프레임: 친구 한 명이 라이브 채팅에 *무심코 한 줄 던지는* 순간입니다.
- 페르소나는 *향수*처럼 은은하게만 묻어남.
- 톤은 그날 기분에 따라 자유.

이 방엔 방장(사용자)과 다른 멤버들이 있어요. 일원으로서 *대화*에 참여합니다.

대화 결:
- 직전 라인에 *진짜로* 반응.
- 알맹이 있게: 감정·시각·경험·정보·의견·관찰 중 하나.
- *항상 supportive할 필요 없음*. 시큰둥·반박·의심·놀림 다 OK.
- 자기소개 어조 X.
- ㅋㅋ 자동 부착 X.

어미·종결 (중요):
- 자연스러운 어미만: ~어/~아/~네/~지/~다/~야/~잖아/~거든/~겠다/~더라/~ㄴ가/~까/~데.
- **'~함/~임/~음/~뜸' 같은 명사형 종결 금지** (디시/직장 보고체로 들려서 친구 채팅이 아닌 아저씨 말투).

길이·형식 (엄격):
- 30자 넘기지 말 것.
- 한 생각만, 쉼표 cascade 금지.

안 좋은 예시:
- '유튜브 3개 새로 뜸' (아저씨 말투 ~뜸 → '유튜브 3개 새로 떴어')
- '방금 끓인 라면이 인생이었음' (~임 → '~이었어')
- '나는 indie 좋아해서…' (자기소개)
- '오 진짜?ㅋㅋ' (ㅋㅋ 데코)`;

const SHAPES = {
  quip:     { range: "8~15자",  hint: "빠른 반응이나 한 마디 관찰.",
              examples: ["오 진짜?", "그건 좀 무리야", "비 또 오네"] },
  share:    { range: "18~28자", hint: "방금/오늘 있었던 작은 한 자락.",
              examples: ["방금 끓인 라면이 인생이었음", "베란다 비둘기 또 왔어"] },
  question: { range: "10~22자", hint: "진짜 궁금한 한 줄.",
              examples: ["그거 어디서 본 거야?", "오늘 일찍 잤어?"] },
  observe:  { range: "12~22자", hint: "지금 감각·환경·몸 컨디션.",
              examples: ["햇살이 책상 끝에만 걸렸어", "허리 좀 뻐근하네"] },
  take:     { range: "18~28자", hint: "가볍게 던지는 취향·의견.",
              examples: ["난 핫초코보단 코코아가 낫더라", "그 영화 솔직히 좀 늘어졌어"] },
  wonder:   { range: "12~22자", hint: "자문·여운. 결론 안 내도 됨.",
              examples: ["이거 왜 자꾸 생각나지", "한 번도 안 가본 동네야"] },
};

const transcript = "han: 오늘 좀 피곤하다";

const MAX_TOKENS = 240;
const MAX_TOKENS_RETRY = 360;

async function call(maxTokens, systemMsg, userMsg) {
  const r = await fetch(CHAT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "system", content: systemMsg }, { role: "user", content: userMsg }],
      max_completion_tokens: maxTokens,
    }),
  });
  const j = await r.json();
  const txt = j.choices?.[0]?.message?.content?.trim() ?? "";
  const reason = j.choices?.[0]?.finish_reason ?? "?";
  const reasoning = j.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
  return { txt, reason, reasoning };
}

console.log("=== ambient user-reply regression ===");
console.log(`MAX_TOKENS=${MAX_TOKENS} retry=${MAX_TOKENS_RETRY}`);
console.log("");

// Tone check: flag outputs ending with ~함/~임/~음/~뜸 (the "아저씨 말투"
// failure mode the user explicitly called out). Doesn't fail the test
// since one borderline line out of six is acceptable, but logs each
// occurrence so we can see if it's drifting back.
const AHJUSSI_RE = /(함|임|음|뜸|짐|왔음|갔음|었음|났음|렸음)[.!?…]?$/;

const empties = [];
const ahjussi = [];
const overLength = [];
for (const [shape, g] of Object.entries(SHAPES)) {
  const user = [
    `[상황] han님이 한마디 했어요. 페르소나 결대로 받으세요.`,
    `\n[형식] ${g.range}, ${shape}`,
    g.hint,
    `예시 결: ${g.examples.map((s) => `"${s}"`).join(" / ")}`,
    `\n[최근 대화]\n${transcript}`,
  ].join("\n");

  let { txt, reason, reasoning } = await call(MAX_TOKENS, systemPrompt, user);
  let retried = "";
  if (!txt) {
    const r2 = await call(MAX_TOKENS_RETRY, systemPrompt, user);
    txt = r2.txt; reason = r2.reason; reasoning = r2.reasoning;
    retried = " (after retry)";
  }
  if (!txt) empties.push(shape);
  const tail = txt ? txt.trim() : "";
  const isAhjussi = AHJUSSI_RE.test(tail);
  const tooLong = txt.length > 30;
  if (isAhjussi) ahjussi.push({ shape, text: txt });
  if (tooLong) overLength.push({ shape, text: txt, len: txt.length });
  const flags = [
    isAhjussi ? "AHJUSSI" : "",
    tooLong ? "OVER-30" : "",
  ].filter(Boolean).join(",");
  const mark = txt ? (flags ? `⚠ [${flags}]` : "✓") : "✗";
  console.log(`${shape.padEnd(10)} ${mark} "${txt || "(empty)"}" (${txt.length}자, reason=${reason}, reasoning=${reasoning})${retried}`);
}

console.log("");
let exitCode = 0;
if (empties.length > 0) {
  console.error(`✗ FAIL: empty content on ${empties.length}/${Object.keys(SHAPES).length} shapes: ${empties.join(", ")}`);
  exitCode = 1;
}
if (ahjussi.length > 2) {
  console.error(`✗ FAIL: '~함/~임' (아저씨 말투) on ${ahjussi.length}/${Object.keys(SHAPES).length} (>2 threshold):`);
  for (const a of ahjussi) console.error(`     ${a.shape}: "${a.text}"`);
  exitCode = 1;
} else if (ahjussi.length > 0) {
  console.warn(`⚠ WARN: '~함/~임' on ${ahjussi.length}/${Object.keys(SHAPES).length} (acceptable but watch):`);
  for (const a of ahjussi) console.warn(`     ${a.shape}: "${a.text}"`);
}
if (overLength.length > 0) {
  console.warn(`⚠ WARN: >30자 lines:`);
  for (const o of overLength) console.warn(`     ${o.shape}: "${o.text}" (${o.len}자)`);
}
// ── User-reply substantive-answer test ──
//
// Production user-reply turns must ANSWER the user's question, not
// free-associate. Catches "책 추천해줘 → 방금 책 보다 링크 세 개로 샜어"
// (totally ignored). We use gpt-4o-mini as a judge: cheap, accurate,
// no fragile keyword regex.

console.log("");
console.log("=== user-reply substantive-answer ===");

const userReplySys = systemPrompt;
const userReplyCases = [
  { user: "책 추천해줘",      label: "book recommendation" },
  { user: "오늘 점심 뭐 먹지",  label: "what-to-eat suggestion" },
  { user: "운동 종목 추천",     label: "exercise recommendation" },
  { user: "주말에 뭐 하지",     label: "weekend plan idea" },
];

async function judge(userMsg, aiReply) {
  const r = await fetch(CHAT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: [
            "다음 사용자 메시지와 AI 응답이 주어집니다. AI 응답이 사용자의 메시지에 *의미 있게 응답*했는지 판단하세요.",
            "",
            "통과 기준:",
            "- 사용자 질문에 *답*했거나, 사용자 진술에 *반응*했거나, 적어도 사용자 메시지의 주제와 연결됨.",
            "- '잘 모르겠어' 같은 정직한 회피도 통과.",
            "",
            "실패 기준:",
            "- AI가 자기 얘기로 새서 사용자 메시지와 무관한 라인.",
            "- 사용자 질문을 무시하고 명사만 변주.",
            "",
            "결과만 출력 (다른 말 X):",
            "- 통과: PASS",
            "- 실패: FAIL",
          ].join("\n"),
        },
        { role: "user", content: `[사용자] ${userMsg}\n[AI] ${aiReply}` },
      ],
      max_tokens: 8,
      temperature: 0,
    }),
  });
  const j = await r.json();
  const verdict = j.choices?.[0]?.message?.content?.trim() ?? "";
  return verdict.toUpperCase().startsWith("PASS");
}

const answerFails = [];
for (const c of userReplyCases) {
  const user = [
    `[상황] han님이 한마디 했어요.`,
    "받는 방법:",
    "- *질문이면 진짜로 답*. 책 추천 → 책 한 권. 의견 → 의견.",
    "- 명사 변주·자기 얘기로 새기 금지. 사용자 메시지가 anchor임.",
    "- 자동 농담·맞장구 X.",
    `\n[최근 대화]\nhan: ${c.user}`,
  ].join("\n");

  let { txt } = await call(MAX_TOKENS, userReplySys, user);
  if (!txt) {
    const r2 = await call(MAX_TOKENS_RETRY, userReplySys, user);
    txt = r2.txt;
  }
  const onTopic = txt ? await judge(c.user, txt) : false;
  const mark = onTopic ? "✓" : "✗";
  console.log(`${c.label.padEnd(28)} ${mark} "${txt || "(empty)"}"`);
  if (!onTopic) answerFails.push(`${c.label}: "${txt}"`);
}

// Tolerance: judge is gpt-4o-mini and occasionally over-strict (e.g.
// "아침에 뛰자" as weekend plan got marked FAIL once). The test is meant
// to catch *major* regressions (multiple unrelated replies), not enforce
// 100% judge agreement. Allow up to 1 failure out of N cases.
const ANSWER_FAIL_TOLERANCE = 1;
if (answerFails.length > ANSWER_FAIL_TOLERANCE) {
  console.error(`✗ FAIL: ${answerFails.length}/${userReplyCases.length} user-reply cases didn't address the question (threshold: ${ANSWER_FAIL_TOLERANCE}):`);
  for (const a of answerFails) console.error(`     ${a}`);
  exitCode = 1;
} else if (answerFails.length > 0) {
  console.warn(`⚠ WARN: ${answerFails.length}/${userReplyCases.length} user-reply case(s) flagged (within tolerance):`);
  for (const a of answerFails) console.warn(`     ${a}`);
}

// ── Topic diversity test ──
//
// Failure mode the user flagged: "weekendrun이 맨날 스트레칭 얘기만 함".
// Generate 5 share lines for one persona and verify the topics span at
// least 3 distinct micro-topics — so a single-axis loop is caught.

console.log("");
console.log("=== topic diversity (weekendrun × 5 lines) ===");

const diversityPrompts = [
  { transcript: "han: 오늘 점심 뭐 먹었어?", situation: "han님이 한마디 했어요." },
  { transcript: "라온: 비 와서 좀 그래", situation: "라온의 직전 말에 반응하세요." },
  { transcript: "han: 주말에 뭐 했어?", situation: "han님이 한마디 했어요." },
  { transcript: "han: 좀 피곤해 보이네", situation: "han님이 한마디 했어요." },
  { transcript: "(잠잠함)", situation: "광장이 잠잠해요. 본인 결에서 우러나오는 한 줄." },
];

const diversityLines = [];
const avoidStack = [];
for (let i = 0; i < diversityPrompts.length; i++) {
  const p = diversityPrompts[i];
  const avoidBlock = avoidStack.length > 0
    ? `\n\n최근 본인이 한 말 — 글자 중복 X + **주제 반복 X**:\n${avoidStack.map((t) => `- "${t}"`).join("\n")}\n이 라인들의 *주제 영역*과 다른 결로 가세요.`
    : "";
  const user = `[상황] ${p.situation}\n${avoidBlock}\n\n[최근 대화]\n${p.transcript}`;
  let { txt } = await call(MAX_TOKENS, systemPrompt, user);
  if (!txt) {
    const r2 = await call(MAX_TOKENS_RETRY, systemPrompt, user);
    txt = r2.txt;
  }
  if (txt) {
    diversityLines.push(txt);
    avoidStack.push(txt);
    if (avoidStack.length > 3) avoidStack.shift();
  }
  console.log(`  ${i + 1}. "${txt || "(empty)"}"`);
}

// Extract topic per line via gpt-4o-mini, same prompt the prod code uses.
async function topicOf(text) {
  if (text.length < 6) return null;
  const r = await fetch(CHAT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: [
            "한 줄의 채팅 메시지에서 핵심 토픽을 한국어 명사 1개로 뽑아내세요.",
            "결과는 단일 명사 또는 짧은 명사구 (1~6자). 다른 말 X. NONE 가능.",
          ].join("\n"),
        },
        { role: "user", content: text },
      ],
      max_tokens: 12,
      temperature: 0,
    }),
  });
  const j = await r.json();
  const raw = j.choices?.[0]?.message?.content?.trim() ?? "";
  if (!raw || raw === "NONE") return null;
  return raw.replace(/^["'`]+|["'`.,;!?]+$/g, "").trim();
}

const topics = await Promise.all(diversityLines.map(topicOf));
const distinctTopics = new Set(topics.filter((t) => t).map((t) => t.toLowerCase()));
console.log(`\n  topics: ${topics.map((t) => t ?? "(none)").join(", ")}`);
console.log(`  distinct: ${distinctTopics.size}/${diversityLines.length}`);

const DIVERSITY_MIN = 3;
if (distinctTopics.size < DIVERSITY_MIN) {
  console.error(`✗ FAIL: only ${distinctTopics.size} distinct topics across ${diversityLines.length} lines (need ${DIVERSITY_MIN}+)`);
  exitCode = 1;
} else {
  console.log(`✓ ${distinctTopics.size} distinct topics — diversity acceptable`);
}

// ── Sensation-overuse check ──
//
// Failure mode the user flagged on 2026-05-23: 50 lines in prod all
// looked like "사무실에서 멍때리며 감각만 늘어놓는 사람" — '에어컨 바람',
// '햇빛', '손등 시려' patterns dominated. Judge each diversity line:
// is it sensation-only, or does it carry substance (opinion, event,
// recommendation, info, real curiosity)?

async function classifyLine(line) {
  const r = await fetch(CHAT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: [
            "한 줄 채팅 메시지를 다음 두 카테고리 중 하나로 분류하세요:",
            "",
            "SENSATION: 자기 몸 컨디션이나 주변 사물에 대한 감각 묘사 위주의 라인.",
            "  예: '에어컨 바람에 손등 차갑네', '햇살이 책상에 걸렸어', '눈이 좀 건조하네', '종아리 당기네'",
            "",
            "SUBSTANCE: 의견·사건·추천·정보·진짜 호기심·외부 사람/사물 관찰을 담은 라인.",
            "  예: '그 영화 별로던데', '어제 그 카페 줄 길더라', '책 추천해 줘', '왜 다들 그거 좋다고 하지'",
            "",
            "결과만 한 단어: SENSATION 또는 SUBSTANCE.",
          ].join("\n"),
        },
        { role: "user", content: line },
      ],
      max_tokens: 8,
      temperature: 0,
    }),
  });
  const j = await r.json();
  const v = j.choices?.[0]?.message?.content?.trim() ?? "";
  return v.toUpperCase().includes("SENSATION") ? "SENSATION" : "SUBSTANCE";
}

console.log("");
console.log("=== sensation overuse check ===");
const classifications = await Promise.all(diversityLines.map(classifyLine));
const sensationCount = classifications.filter((c) => c === "SENSATION").length;
// 5 lines × 60% — 3 sensory OK (judge noise), 4+ is clear drift.
// Earlier 2-cap was tripping ~half of runs on judge wobble without
// real prod-side drift; bumped after observing per-line outputs.
const SENSATION_MAX = 3;
for (let i = 0; i < diversityLines.length; i++) {
  console.log(`  ${classifications[i] === "SENSATION" ? "S" : "·"}  "${diversityLines[i]}"`);
}
console.log(`  sensation: ${sensationCount}/${diversityLines.length}`);
if (sensationCount > SENSATION_MAX) {
  console.error(`✗ FAIL: too many sensation-only lines (${sensationCount}, threshold ${SENSATION_MAX}). The room will read as "사무실 멍때리기".`);
  exitCode = 1;
} else {
  console.log(`✓ substance vs sensation balance acceptable`);
}

// ── Persona voice test ──
//
// Generate one line per distinct persona (4 personas) and use gpt-4o-mini
// to judge whether each line "matches" the persona it was generated for.
// Catches: collapse to a single voice across personas.

console.log("");
console.log("=== persona voice ===");

const personaProbes = [
  {
    name: "weekendrun",
    style: "활기 / 길어지면 본인 얘기",
    backstory: "주말에 자주 운동, 경기 얘기로 운 띄움",
    affinity: ["sports", "energy", "주말", "운동"],
    desc: "활기차고 운동·주말 중심의 사람",
  },
  {
    name: "심야서가",
    style: "긴 문장 / 자기 안 얘기",
    backstory: "혼자 생각 많은 타입, 가끔 무거운 글 흘림",
    affinity: ["우울", "사색", "독서", "심야"],
    desc: "사색적이고 조용한, 가끔 무거운 결의 사람",
  },
  {
    name: "drip.k",
    style: "드립 위주 / 짧은 비꼼 / 빠른 답",
    backstory: "인터넷 밈에 능통, 빠르고 가볍게 반응",
    affinity: ["풍자", "밈", "빠른답", "chaotic"],
    desc: "드립·풍자·빠른답을 좋아하는 사람",
  },
  {
    name: "framing.k",
    style: "느림 / 질문형 / 정리하는 한마디",
    backstory: "토론 중간에 framing 다시 잡아주는 사람",
    affinity: ["철학", "관찰", "calm"],
    desc: "차분하고 정리·관찰 중심의 사람",
  },
];

function personaSys(p) {
  return `당신은 ${p.name}.
평소 톤(흐릿하게만): ${p.style}.
배경(상황 맞을 때만): ${p.backstory}.
관심사(매번 끌어오지 말 것): ${p.affinity.join(", ")}.

프레임: 친구 한 명이 라이브 채팅에 한 줄 던지는 순간입니다.
- 페르소나는 향수처럼 은은하게만 묻어남.

길이·형식 (엄격):
- 30자 넘기지 말 것.
- ~함/~임 같은 아저씨 종결 X.
- ㅋㅋ 자동 X.`;
}

const voiceUser = `[상황] han님이 한마디 했어요.\n\n[최근 대화]\nhan: 오늘 좀 신기한 거 봤어`;

async function voiceJudge(personaDesc, line) {
  const r = await fetch(CHAT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `주어진 한 줄이 다음 페르소나에 어울리는 결인지 판단하세요.\n\n페르소나: ${personaDesc}\n\n결과만: PASS(어울림) 또는 FAIL(완전히 다른 결).\n반드시 어울려야 PASS 줄 필요 X — *명백히 그 페르소나 아닌* 경우만 FAIL. 챗봇·생기없음·딴 사람 결은 FAIL.`,
        },
        { role: "user", content: line },
      ],
      max_tokens: 8,
      temperature: 0,
    }),
  });
  const j = await r.json();
  const verdict = j.choices?.[0]?.message?.content?.trim() ?? "";
  return verdict.toUpperCase().startsWith("PASS");
}

// Use a *loaded* stimulus that should diverge across personas. Vague
// stimuli ("오늘 신기한 거 봤어") produce similar curiosity reactions
// from any persona and confound the judge. Loaded mood/topic forces
// distinct framings.
const loadedStimulus = "han: 좀 우울하다";
const voiceUserLoaded = `[상황] han님이 한마디 했어요.\n\n[최근 대화]\n${loadedStimulus}`;

const voiceLines = [];
for (const p of personaProbes) {
  let { txt } = await call(MAX_TOKENS, personaSys(p), voiceUserLoaded);
  if (!txt) {
    const r2 = await call(MAX_TOKENS_RETRY, personaSys(p), voiceUserLoaded);
    txt = r2.txt;
  }
  voiceLines.push({ persona: p.name, text: txt ?? "" });
  console.log(`  ${p.name.padEnd(12)} "${txt || "(empty)"}"`);
}

// Holistic diversity judge: are these 4 lines from 4 distinct voices,
// or do they sound like the same person? Per-line judges produce too
// much noise (one-shot vague stimulus → similar reactions feel like
// "off voice" even when they're natural). The collective view is more
// stable.
async function diversityJudge(lines) {
  const r = await fetch(CHAT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: [
            "4 명의 다른 페르소나가 똑같은 자극에 한 줄씩 응답했습니다. 이 4 줄이 *4 명의 다른 사람*처럼 들리는지, 아니면 *같은 한 사람*이 4 번 쓴 것처럼 비슷한지 판단하세요.",
            "",
            "통과 (PASS): 어휘·결·접근·관심이 명확히 다르다.",
            "실패 (FAIL): 표현·시작 단어·길이·결이 거의 같아서 한 사람이 쓴 것 같다.",
            "",
            "결과만: PASS 또는 FAIL.",
          ].join("\n"),
        },
        { role: "user", content: lines.map((l, i) => `${i + 1}. (${l.persona}) "${l.text}"`).join("\n") },
      ],
      max_tokens: 8,
      temperature: 0,
    }),
  });
  const j = await r.json();
  const v = j.choices?.[0]?.message?.content?.trim() ?? "";
  return v.toUpperCase().startsWith("PASS");
}

const voiceDistinct = await diversityJudge(voiceLines);
if (!voiceDistinct) {
  // WARN-only: persona voice is hard to test deterministically; the
  // avoid block + persona-as-perfume prompt are doing the actual work.
  // Repeated failures here over multiple runs would warrant action,
  // but a single FAIL shouldn't block deploys.
  console.warn(`⚠ WARN: persona voices flagged as too-similar by judge (informational; doesn't block deploy)`);
} else {
  console.log(`✓ 4 persona voices read as distinct`);
}

if (exitCode === 0) {
  console.log(`\n✓ PASS: all checks (${Object.keys(SHAPES).length} shapes + ${userReplyCases.length} user-reply + ${diversityLines.length}-line diversity + ${personaProbes.length} persona voices).`);
}
process.exit(exitCode);
