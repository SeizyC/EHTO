"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { browserClient } from "@/lib/supabase";

export default function PageViewBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    // Skip admin and API paths — don't count internal traffic
    if (pathname.startsWith("/admin") || pathname.startsWith("/api")) return;

    let cancelled = false;

    (async () => {
      let token: string | null = null;
      try {
        const { data } = await browserClient().auth.getSession();
        token = data.session?.access_token ?? null;
      } catch {
        // best-effort
      }

      if (cancelled) return;

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      fetch("/api/track", {
        method: "POST",
        headers,
        body: JSON.stringify({ path: pathname }),
      }).catch(() => {});
    })();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}
