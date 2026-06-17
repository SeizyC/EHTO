import { resolveUserLanguage, LANGUAGE_NAMES } from "../src/lib/language";

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

console.log("verify-language OK");
