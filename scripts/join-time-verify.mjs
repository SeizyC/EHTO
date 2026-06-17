import { createClient } from "@supabase/supabase-js";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const apiKey = process.env.OPENAI_API_KEY;
const sb = createClient(URL, SERVICE, { auth: { persistSession: false } });
const { data: user } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
const me = user.users.find((u) => u.email === "1@1.com");
const { data: world } = await sb.from("worlds").select("id").eq("owner_id", me.id).maybeSingle();

const { data: members } = await sb.from("members")
  .select("id, name, persona, backstory, activated_at")
  .eq("current_location_world_id", world.id)
  .eq("status", "active")
  .not("activated_at", "is", null)
  .order("activated_at", { ascending: false })
  .limit(6);

function formatJoinedAgo(activatedAt) {
  if (!activatedAt) return null;
  const at = new Date(activatedAt);
  const ms = Date.now() - at.getTime();
  if (!isFinite(ms) || ms < 0) return null;
  const min = Math.floor(ms / 60_000);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (min < 5) return "방금";
  if (min < 60) return `${min}분 전`;
  if (hr < 3) return `${hr}시간 전`;
  if (day === 0) return "오늘";
  if (day === 1) return "어제";
  if (day < 7) return `${day}일 전`;
  if (day < 21) return `약 ${Math.round(day / 7)}주 전`;
  if (day < 60) return `약 ${Math.round(day / 30)}달 전`;
  return `${Math.round(day / 30)}달 전`;
}

function buildSystem(m, joinedAgo) {
  const aff = m.persona?.affinity?.join(", ") ?? "";
  const style = m.persona?.speech_style ?? "";
  const factBlock = joinedAgo
    ? `\n\n사실 정보 (질문 받으면 이대로 답해. 거짓말 X):\n- 이 광장에 들어온 시기: ${joinedAgo}`
    : "";
  return [
    "당신은 한 작은 디지털 광장에 사는 한 명의 *사람*입니다.",
    `이름: ${m.name}`,
    aff ? `관심사·성향: ${aff}` : "",
    style ? `말투: ${style}` : "",
    m.backstory ? `배경: ${m.backstory}` : "",
    factBlock,
    "",
    "톤: 친구 톤, 1-2문장.",
    "",
    "평범한 입력엔 따뜻하거나 가볍게 응대. 질문은 진지하게 답함.",
  ].filter(Boolean).join("\n");
}

const userName = "1@1";
for (const m of members) {
  const joinedAgo = formatJoinedAgo(m.activated_at);
  const userPrompt = [
    `[상황: ${userName}가 당신 이름을 부르며 말을 걸었어요.]`,
    `${userName}: @${m.name} 너 여기 언제 왔어?`,
    "",
    "필수:",
    "- 시스템의 '사실 정보' 블록이 답을 알려주면 그대로 사용. 정확히 모르는 영역이면 두루뭉술하게.",
    "- 살짝 재치 있게.",
    "금지:",
    "- '사실 정보'와 모순되는 답 — 절대 금지.",
    "- 회피·premise 부정.",
    "- 1~2문장.",
  ].join("\n");
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: buildSystem(m, joinedAgo) }, { role: "user", content: userPrompt }],
      max_tokens: 90, temperature: 0.9,
    }),
  });
  const j = await r.json();
  const reply = j.choices?.[0]?.message?.content?.trim();
  console.log(`[${m.name}] activated=${joinedAgo}\n  → ${reply}\n`);
}
