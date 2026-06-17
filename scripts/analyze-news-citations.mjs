#!/usr/bin/env node
// Analyze news citation patterns in prod.
//
// 1. Pull current today's news headlines from Naver (same query mix
//    production uses: 사건사고 / 연예 / 이슈)
// 2. Pull recent ambient messages from Supabase (last 24h, AI-spoken)
// 3. For each message, classify via gpt-4o-mini:
//    - did it cite any current headline?
//    - if so, which category? (incident / entertainment / general issue)
// 4. Report distribution
//
// Usage:  node scripts/analyze-news-citations.mjs [limit=100]

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

const NAVER_ID = process.env.NAVER_CLIENT_ID;
const NAVER_SECRET = process.env.NAVER_CLIENT_SECRET;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const SUPA_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!NAVER_ID || !NAVER_SECRET) { console.error("NAVER creds missing"); process.exit(2); }
if (!OPENAI_KEY) { console.error("OPENAI_API_KEY missing"); process.exit(2); }
if (!SUPA_URL || !SUPA_KEY) { console.error("Supabase creds missing"); process.exit(2); }

const N = parseInt(process.argv[2] ?? "100", 10);
const GATEWAY = "https://gateway.ai.cloudflare.com/v1/REDACTED_CF_ACCOUNT_ID/ehto/compat/chat/completions";

const QUERIES = ["사건사고", "연예", "이슈"];

// ── Fetch today's headlines per category ──
function kstHour() { return new Date(Date.now() + 9 * 3600_000).getUTCHours(); }
function dayStartKst() {
  const now = new Date();
  const k = new Date(now.getTime() + 9 * 3600_000);
  k.setUTCHours(9, 0, 0, 0);
  if (kstHour() < 9) k.setUTCDate(k.getUTCDate() - 1);
  return k.getTime() - 9 * 3600_000;
}

async function fetchCategoryHeadlines(q) {
  const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(q)}&display=30&sort=date`;
  const r = await fetch(url, {
    headers: { "X-Naver-Client-Id": NAVER_ID, "X-Naver-Client-Secret": NAVER_SECRET },
  });
  if (!r.ok) return [];
  const j = await r.json();
  const start = dayStartKst();
  return (j.items ?? [])
    .filter((it) => Date.parse(it.pubDate ?? "") >= start)
    .map((it) => it.title.replace(/<\/?b>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim());
}

console.log(`=== news category usage analysis ===`);
console.log(`fetching today's headlines per category...`);
const byCategory = {};
for (const q of QUERIES) {
  byCategory[q] = await fetchCategoryHeadlines(q);
  console.log(`  ${q}: ${byCategory[q].length}건`);
}
console.log("");

// ── Pull recent AI messages ──
console.log(`fetching last ${N} AI messages...`);
const sinceIso = new Date(Date.now() - 24 * 3600_000).toISOString();
const msgsResp = await fetch(
  `${SUPA_URL}/rest/v1/messages?select=text,created_at,members(name)&owner_member_id=not.is.null&created_at=gte.${encodeURIComponent(sinceIso)}&order=created_at.desc&limit=${N}`,
  { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } },
);
const msgs = await msgsResp.json();
// Skip music share messages (they contain a Spotify URL — not news)
const ambientMsgs = msgs.filter((m) => !/open\.spotify\.com/.test(m.text));
console.log(`  ${ambientMsgs.length}건 (음악 공유 제외)`);
console.log("");

// ── Classify each message ──
async function classify(line) {
  const allHeadlines = Object.entries(byCategory)
    .map(([cat, arr]) => arr.slice(0, 8).map((h) => `[${cat}] ${h}`))
    .flat()
    .join("\n");

  const body = {
    model: "openai/gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: [
          "주어진 한 줄 채팅 메시지가 아래 뉴스 헤드라인 중 하나를 *언급/인용*하는지 분류하세요.",
          "",
          "헤드라인은 카테고리 태그가 붙어 있습니다: [사건사고], [연예], [이슈].",
          "",
          "결과는 한 줄, 다음 형식:",
          "- 인용 안 함: NONE",
          "- 사건사고 인용: 사건사고",
          "- 연예 인용: 연예",
          "- 이슈 인용: 이슈",
          "",
          "기준: 메시지의 명사·인물·사건이 헤드라인의 명사·인물·사건과 직접 매칭되어야 인용 인정. 단순 일반 단어(오늘/사고/뉴스)는 인용 아님. 추측·우연 일치도 NONE.",
          "",
          "오늘의 헤드라인:",
          allHeadlines,
        ].join("\n"),
      },
      { role: "user", content: line },
    ],
    max_tokens: 8,
    temperature: 0,
  };
  const r = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) return "NONE";
  const j = await r.json();
  const v = (j.choices?.[0]?.message?.content?.trim() ?? "").toUpperCase();
  if (v.includes("사건사고") || v.includes("INCIDENT")) return "사건사고";
  if (v.includes("연예") || v.includes("ENTERTAINMENT")) return "연예";
  if (v.includes("이슈") || v.includes("ISSUE")) return "이슈";
  return "NONE";
}

console.log("classifying (this takes a moment)...");
const verdicts = await Promise.all(ambientMsgs.map((m) => classify(m.text)));

const counts = { 사건사고: 0, 연예: 0, 이슈: 0, NONE: 0 };
const samples = { 사건사고: [], 연예: [], 이슈: [] };
for (let i = 0; i < ambientMsgs.length; i++) {
  const cat = verdicts[i];
  counts[cat]++;
  if (cat !== "NONE" && samples[cat].length < 5) {
    samples[cat].push({ text: ambientMsgs[i].text, name: (ambientMsgs[i].members ?? {}).name ?? "?" });
  }
}

const cited = ambientMsgs.length - counts.NONE;
const citedPct = ambientMsgs.length > 0 ? (cited / ambientMsgs.length * 100).toFixed(1) : "0";
console.log("");
console.log(`전체 ${ambientMsgs.length}건 중 뉴스 인용 ${cited}건 (${citedPct}%)`);
console.log("");
console.log("카테고리별 인용:");
for (const cat of QUERIES) {
  const pct = ambientMsgs.length > 0 ? (counts[cat] / ambientMsgs.length * 100).toFixed(1) : "0";
  console.log(`  ${cat}: ${counts[cat]}건 (${pct}%)`);
}
console.log("");
for (const cat of QUERIES) {
  if (samples[cat].length === 0) continue;
  console.log(`[${cat}] 인용 예시:`);
  for (const s of samples[cat]) console.log(`  · ${s.name}: ${s.text}`);
  console.log("");
}
