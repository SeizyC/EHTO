// Apply a SQL migration to the linked Supabase project via the Management API.
//
//   node --env-file=.env.local scripts/apply-migration.mjs <path-to.sql>
//
// Uses SUPABASE_ACCESS_TOKEN (a personal access token) + the project ref derived
// from NEXT_PUBLIC_SUPABASE_URL. The /database/query endpoint runs arbitrary SQL
// (same as the dashboard SQL editor). Migrations here are written idempotent
// (IF NOT EXISTS / idempotent updates) so re-running is safe.

import { readFileSync } from "node:fs";

const file = process.argv[2];
if (!file) { console.error("usage: apply-migration.mjs <path.sql>"); process.exit(1); }

const token = process.env.SUPABASE_ACCESS_TOKEN;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const ref = new URL(url).hostname.split(".")[0];
if (!token || !ref) { console.error("missing SUPABASE_ACCESS_TOKEN or project ref"); process.exit(1); }

const sql = readFileSync(file, "utf8");

const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: sql }),
});
const text = await r.text();
console.log("HTTP", r.status);
console.log(text.slice(0, 2000));
process.exit(r.ok ? 0 : 1);
