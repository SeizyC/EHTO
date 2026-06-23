// One-off end-to-end verification of the dynamic object generation pipeline.
// Generates ONE sprite for a throwaway topic, verifies the returned ObjectType
// + that the sprite URL is a real PNG, then cleans up (DB row + storage file)
// so nothing leaks into real worlds.
//
// Run: node --env-file=.env.local --import tsx scripts/test-dyn-obj.ts

import { serviceClient } from "@/lib/supabase";
import { tryGenerateDynamicType } from "@/lib/dynamic-object-gen";

async function main() {
  const sb = serviceClient();
  const topic = "테스트_레트로게임_zzz"; // throwaway; cleaned up below
  console.log("→ generating for topic:", topic);
  const t0 = Date.now();
  const res = await tryGenerateDynamicType(sb, {
    topic,
    slotHeightPct: 24,
    slotTopics: ["게임", "retro", "arcade"],
  });
  console.log(`← returned in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(JSON.stringify(res, null, 2));

  if (!res) {
    console.error("FAIL: tryGenerateDynamicType returned null");
    process.exit(1);
  }

  const url = res.variants[0]?.spriteUrl;
  let ok = false;
  if (url) {
    const r = await fetch(url);
    const buf = Buffer.from(await r.arrayBuffer());
    const isPng = buf.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
    console.log("sprite:", r.status, r.headers.get("content-type"), buf.length, "bytes", "validPNG=", isPng);
    ok = r.ok && isPng && buf.length > 1000;
  }

  // Cleanup: storage file + type (cascade deletes the variant).
  if (url && url.includes("/characters/")) {
    const path = url.split("/characters/")[1];
    await sb.storage.from("characters").remove([path]);
    console.log("cleaned storage:", path);
  }
  await sb.from("object_types").delete().eq("id", res.id);
  console.log("cleaned object_types:", res.id);

  console.log(ok ? "\n✅ PASS — full pipeline works (desc → image → upload → insert)" : "\n❌ FAIL — sprite not a valid PNG");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error("error:", e);
  process.exit(1);
});
