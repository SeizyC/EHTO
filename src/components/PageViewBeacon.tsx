"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { readAccessToken } from "@/lib/auth-token";

export default function PageViewBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    // Skip admin and API paths — don't count internal traffic
    if (pathname.startsWith("/admin") || pathname.startsWith("/api")) return;

    // Read the bearer token straight from localStorage instead of via the
    // Supabase SDK — this beacon runs on every page (incl. the marketing
    // landing) and must not pull @supabase/supabase-js into the bundle.
    const token = readAccessToken();

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    fetch("/api/track", {
      method: "POST",
      headers,
      body: JSON.stringify({ path: pathname }),
    }).catch(() => {});
  }, [pathname]);

  return null;
}
