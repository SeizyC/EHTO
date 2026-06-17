#!/usr/bin/env node
// Pulls recent CF AI Gateway logs (OpenAI calls routed via gateway) and
// computes quality signals so we can spot regressions before users do.
//
// Signals computed:
//   - empty-content rate (gpt-5 reasoning starvation)
//   - aussie tone (~함/~임/~음) frequency
//   - ㅋㅋ excess (>2× in last 50 lines)
//   - average response length
//   - intent / shape distribution (parsed from worker stdout via tail)
//
// Usage:
//   node scripts/analyze-logs.mjs        # last 100 calls
//   node scripts/analyze-logs.mjs 500    # last 500 calls
//
// Requires CF_API_TOKEN with AI Gateway: Read scope. If missing, falls
// back to wrangler tail for a 60-second sample.

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

const N = parseInt(process.argv[2] ?? "100", 10);
const ACCOUNT_ID = process.env.CF_ACCOUNT_ID ?? "REDACTED_CF_ACCOUNT_ID";
const GATEWAY = process.env.CF_GATEWAY ?? "ehto";
// Renamed from CF_API_TOKEN: wrangler picks up CF_API_TOKEN as its own
// auth token, and our analyze-logs token doesn't have Workers deploy
// scope — wrangler then refused to deploy. EHTO_-prefixed namespace
// keeps wrangler away from this token.
const TOKEN = process.env.EHTO_CF_API_TOKEN ?? process.env.CF_API_TOKEN;

if (!TOKEN) {
  console.error("EHTO_CF_API_TOKEN missing in .env.local.");
  console.error("Create one at https://dash.cloudflare.com/profile/api-tokens");
  console.error("with AI Gateway: Read permission scoped to your account.");
  console.error("");
  console.error("Then add to .env.local:");
  console.error("  EHTO_CF_API_TOKEN=...");
  process.exit(2);
}

// CF caps per_page at 50, so paginate. order=desc + page index walks
// backward through history.
const PER_PAGE = 50;
const pages = Math.ceil(N / PER_PAGE);
const logs = [];
for (let p = 1; p <= pages; p++) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai-gateway/gateways/${GATEWAY}/logs?per_page=${PER_PAGE}&page=${p}&order_by=created_at&order_by_direction=desc`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    console.error(`CF logs API ${resp.status} (page ${p}):`, t.slice(0, 300));
    if (p === 1) process.exit(3);
    break;
  }
  const j = await resp.json();
  const page = j.result ?? [];
  if (page.length === 0) break;
  logs.push(...page);
  if (logs.length >= N) break;
}
logs.length = Math.min(logs.length, N);
if (logs.length === 0) {
  console.log("No logs returned. Either no recent calls, or token lacks scope.");
  process.exit(0);
}

console.log(`=== last ${logs.length} gateway calls (newest first) ===`);
console.log("");

let emptyCount = 0;
let aussieCount = 0;
let kkExcess = 0;
let lengthSum = 0;
let lengthN = 0;
let lengthMax = 0;
let modelCounts = {};
let providerErrors = 0;

const AUSSIE_RE = /(함|임|음|뜸|짐|왔음|갔음|었음|났음|렸음)[.!?…]?$/;
const samples = []; // collect a few non-empty outputs to eyeball

// CF AI Gateway's listing endpoint returns log metadata only — the
// actual request/response bodies live at /logs/{id}/response. Fetch in
// parallel batches to keep this fast.
async function fetchResponseBody(logId) {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai-gateway/gateways/${GATEWAY}/logs/${logId}/response`,
    { headers: { Authorization: `Bearer ${TOKEN}` } },
  );
  if (!r.ok) return null;
  try { return await r.json(); } catch { return null; }
}

console.log(`fetching response bodies for ${logs.length} logs...`);
const BATCH = 10;
const bodies = new Array(logs.length);
for (let i = 0; i < logs.length; i += BATCH) {
  const batch = logs.slice(i, i + BATCH);
  const results = await Promise.all(batch.map((l) => fetchResponseBody(l.id)));
  for (let j = 0; j < batch.length; j++) bodies[i + j] = results[j];
}
console.log("");

for (let idx = 0; idx < logs.length; idx++) {
  const log = logs[idx];
  const model = log.model ?? "?";
  modelCounts[model] = (modelCounts[model] ?? 0) + 1;

  if (log.status_code >= 500 || log.success === false) {
    providerErrors++;
    continue;
  }

  // Response body is JSON object from the /logs/{id}/response endpoint.
  let respText = "";
  const body = bodies[idx];
  if (body && body.choices?.[0]?.message?.content) {
    respText = String(body.choices[0].message.content).trim();
  }

  if (!respText) {
    emptyCount++;
    continue;
  }

  // Ignore short reaction-only responses (judge calls, etc.) — count
  // only outputs that look like ambient lines (Korean + meaningful len).
  if (!/[가-힣]/.test(respText) || respText.length < 4) continue;

  lengthSum += respText.length;
  lengthN++;
  if (respText.length > lengthMax) lengthMax = respText.length;

  if (AUSSIE_RE.test(respText.trim())) aussieCount++;

  const kkMatches = (respText.match(/ㅋ+/g) ?? []).length;
  if (kkMatches >= 2) kkExcess++;

  if (samples.length < 8) samples.push(respText);
}

const avgLen = lengthN > 0 ? (lengthSum / lengthN).toFixed(1) : "—";
const aussieRate = lengthN > 0 ? ((aussieCount / lengthN) * 100).toFixed(1) : "—";
const kkRate = lengthN > 0 ? ((kkExcess / lengthN) * 100).toFixed(1) : "—";
const emptyRate = logs.length > 0 ? ((emptyCount / logs.length) * 100).toFixed(1) : "—";

console.log("Model distribution:");
for (const [m, n] of Object.entries(modelCounts)) console.log(`  ${m}: ${n}`);
console.log("");
console.log("Output quality (chat lines only):");
console.log(`  total samples       : ${lengthN}`);
console.log(`  avg length          : ${avgLen}자  (max: ${lengthMax})`);
console.log(`  empty content       : ${emptyRate}%   (${emptyCount}/${logs.length})  ${Number(emptyRate) > 5 ? "⚠ HIGH" : ""}`);
console.log(`  ~함/~임 (아저씨)    : ${aussieRate}%   (${aussieCount}/${lengthN})  ${Number(aussieRate) > 15 ? "⚠ HIGH" : ""}`);
console.log(`  ㅋㅋ multi-use      : ${kkRate}%   (${kkExcess}/${lengthN})  ${Number(kkRate) > 25 ? "⚠ HIGH" : ""}`);
console.log(`  provider errors     : ${providerErrors}  ${providerErrors > 5 ? "⚠ HIGH" : ""}`);

if (samples.length > 0) {
  console.log("");
  console.log("Sample lines:");
  for (const s of samples) console.log(`  · ${s}`);
}
