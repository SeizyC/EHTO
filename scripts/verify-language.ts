import { resolveUserLanguage, LANGUAGE_NAMES } from "../src/lib/language";
import { localizeIdentity } from "../src/lib/member-identity";

function assert(cond: boolean, msg: string) {
  if (!cond) { console.error("FAIL:", msg); process.exit(1); }
}

// saved wins over country
assert(resolveUserLanguage({ saved: "ja", country: "KR" }) === "ja", "saved overrides country");
// invalid saved falls through to country
assert(resolveUserLanguage({ saved: "zz", country: "JP" }) === "ja", "country used when saved invalid");
// no saved, no country -> default ko
assert(resolveUserLanguage({}) === "ko", "default ko");
// US -> en
assert(resolveUserLanguage({ country: "US" }) === "en", "US -> en");
assert(LANGUAGE_NAMES.en === "English", "language names");

// Gated live check: only run if ANTHROPIC_API_KEY is set
async function runGatedChecks() {
  if (!process.env.ANTHROPIC_API_KEY) {
    return;
  }
  const identity = await localizeIdentity(
    {
      affinity: ["indie", "music"],
      speechSeed: "quiet, shares music",
      backstorySeed: "up late, indie music"
    },
    "en"
  );
  assert(identity !== null, "localizeIdentity returned a result");
  assert(typeof identity!.name === "string" && identity!.name.length > 0, "name is non-empty string");
  assert(typeof identity!.speech_style === "string" && identity!.speech_style.length > 0, "speech_style is non-empty string");
  assert(typeof identity!.backstory === "string" && identity!.backstory.length > 0, "backstory is non-empty string");
}

runGatedChecks().then(() => {
  console.log("verify-language OK");
}).catch((e) => {
  console.error("FAIL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
