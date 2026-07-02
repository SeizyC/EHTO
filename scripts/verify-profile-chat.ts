// Verify the locale-aware identity actually changes generation:
//   node --env-file=.env.local --import tsx scripts/verify-profile-chat.ts
// Pulls 준 (with the backfilled profile) and generates replies to factual
// questions — checking answers are CONSISTENT with the profile (신림동 / 밈
// 페이지+배달) and NOT a profile-dump. Also generates an empty-plaza greeting.

import { serviceClient } from "@/lib/supabase";
import { generateAmbientLine, generateGreeting, type ConvoTurn } from "@/lib/member-reply";

async function main() {
  const sb = serviceClient();
  const { data } = await sb.from("members").select("id, name, persona, backstory, activity_weight").eq("name", "준").limit(1);
  const jun = data?.[0];
  if (!jun) throw new Error("준 member not found");
  console.log("준 profile:", JSON.stringify((jun.persona as { profile?: unknown }).profile));
  console.log("준 region:", (jun.persona as { region?: string }).region);
  console.log("─".repeat(60));

  const ask = async (label: string, q: string) => {
    const recent: ConvoTurn[] = [{ speaker: "방장", text: q }];
    const text = await generateAmbientLine(jun as Parameters<typeof generateAmbientLine>[0], recent, {
      language: "ko",
      intent: { type: "reply-user", userName: "방장" },
      shape: "share",
      timezone: "Asia/Seoul",
    });
    console.log(`Q(${label}): ${q}\nA: ${text}\n`);
  };

  await ask("origin-1", "어디서 왔어?");
  await ask("origin-2", "너 어디 살아?");
  await ask("job", "직업이 뭐야?");
  await ask("age", "몇 살이야?");
  // consistency: ask job twice in one convo to catch self-contradiction
  {
    const recent: ConvoTurn[] = [
      { speaker: "방장", text: "직업이 뭐야?" },
      { speaker: "준", text: "(방금 답함)", isSelf: true },
      { speaker: "방장", text: "그럼 백수는 아니고?" },
    ];
    const text = await generateAmbientLine(jun as Parameters<typeof generateAmbientLine>[0], recent, {
      language: "ko", intent: { type: "reply-user", userName: "방장" }, shape: "quip", timezone: "Asia/Seoul",
    });
    console.log(`Q(job-consistency): 그럼 백수는 아니고?\nA: ${text}\n`);
  }

  // Empty-plaza greeting (first friend): should be a warm hello, not "왜 조용해".
  const greet = await generateGreeting(jun as Parameters<typeof generateGreeting>[0], {
    peers: [], transcript: [], language: "ko", timezone: "Asia/Seoul",
  });
  console.log(`Empty-plaza greeting: ${greet}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
