"use client";

import { LOCALES, LOCALE_LABEL, type Locale } from "@/lib/about-content";
import { readAccessToken } from "@/lib/auth-token";

// Fire-and-forget: persist a logged-in user's language to profiles.language
// so a saved choice beats IP detection on the next visit. Anonymous users
// (no token) are skipped — their choice lives in localStorage via pick().
//
// The token is read straight from localStorage (no Supabase SDK) so this
// component — shared by the marketing landing — never pulls ~230KB of
// @supabase/supabase-js into the landing bundle. The server re-validates the
// token, so a stale value just no-ops (localStorage still holds the choice).
function persistLanguage(next: Locale) {
  const token = readAccessToken();
  if (!token) return;
  void (async () => {
    try {
      await fetch("/api/me/language", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ language: next }),
      });
    } catch {
      /* network/quota — non-blocking, localStorage still holds the choice */
    }
  })();
}

// EN / 한 / 日 pill toggle. Shared by the landing and about pages.
export function LangToggle({
  locale,
  onPick,
}: {
  locale: Locale;
  onPick: (l: Locale) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Language"
      className="border-line bg-surface/80 flex items-center gap-0.5 rounded-full border p-0.5 backdrop-blur"
    >
      {LOCALES.map((l) => {
        const active = l === locale;
        return (
          <button
            key={l}
            onClick={() => {
              onPick(l);
              persistLanguage(l);
            }}
            aria-pressed={active}
            className={[
              "rounded-full px-2.5 py-1 text-[12px] font-semibold transition",
              active ? "bg-accent text-bg" : "text-dim active:text-ink",
            ].join(" ")}
          >
            {LOCALE_LABEL[l]}
          </button>
        );
      })}
    </div>
  );
}
