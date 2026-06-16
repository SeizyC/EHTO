"use client";

import { useEffect, useState } from "react";
import { isLocale, LOCALE_BCP47, type Locale } from "@/lib/about-content";

// Shared locale state for public pages (landing / about). Initial locale comes
// from the server (IP), a stored override wins on next load, and the choice
// persists across pages via one localStorage key.
const LS_KEY = "ehto:locale";

export function useLocale(initial: Locale) {
  const [locale, setLocale] = useState<Locale>(initial);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LS_KEY);
      if (isLocale(saved) && saved !== initial) setLocale(saved);
    } catch {
      /* private mode — ignore */
    }
  }, [initial]);

  useEffect(() => {
    document.documentElement.lang = LOCALE_BCP47[locale];
  }, [locale]);

  function pick(next: Locale) {
    setLocale(next);
    try {
      localStorage.setItem(LS_KEY, next);
    } catch {
      /* ignore */
    }
  }

  return { locale, pick };
}
