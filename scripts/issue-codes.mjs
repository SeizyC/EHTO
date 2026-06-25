// Issue (ensure) the per-user invite codes for a given email. Idempotent.
//   node_modules/.bin/tsx --env-file=.env.local scripts/issue-codes.mjs <email>
import { createClient } from "@supabase/supabase-js";
import { issueCodesForUser, listUserCodes } from "../src/lib/beta-codes.ts";
const email = process.argv[2] || "1@1.com";
const SUPA_URL=process.env.NEXT_PUBLIC_SUPABASE_URL, SERVICE=process.env.SUPABASE_SERVICE_ROLE_KEY, token=process.env.SUPABASE_ACCESS_TOKEN;
const ref=new URL(SUPA_URL).hostname.split(".")[0];
async function q(sql){const r=await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify({query:sql})});const j=await r.json();if(!r.ok){console.error(JSON.stringify(j));process.exit(1);}return j;}
const rows = await q(`select id, email from auth.users where email='${email.replace(/'/g,"''")}' limit 1`);
if(!rows.length){console.error("user not found:", email);process.exit(1);}
const uid = rows[0].id;
const svc = createClient(SUPA_URL, SERVICE, { auth:{ persistSession:false }});
await issueCodesForUser(svc, uid);
console.log(`${rows[0].email} →`, JSON.stringify(await listUserCodes(svc, uid)));
