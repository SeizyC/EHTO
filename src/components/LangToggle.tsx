"use client";

import { LOCALES, LOCALE_LABEL, type Locale } from "@/lib/about-content";

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
            onClick={() => onPick(l)}
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
