// Read the persisted Supabase access token straight from localStorage,
// WITHOUT loading @supabase/supabase-js.
//
// Lightweight callers (e.g. the analytics beacon) only need the bearer
// token; importing browserClient() from "@/lib/supabase" would pull the
// ~230KB SDK into their bundle. This module touches nothing but localStorage
// so it can run on marketing pages that must stay supabase-free.
//
// supabase-js v2 persists the session under the key `sb-<project-ref>-auth-token`
// as a JSON-encoded session object ({ access_token, refresh_token, ... }).
// The token is sent best-effort; the server re-validates it, so a stale or
// malformed value simply resolves to an anonymous request.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

let cachedKey: string | null | undefined;

function storageKey(): string | null {
  if (cachedKey !== undefined) return cachedKey;
  try {
    const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
    cachedKey = ref ? `sb-${ref}-auth-token` : null;
  } catch {
    cachedKey = null;
  }
  return cachedKey;
}

/** Best-effort Supabase access token from localStorage, or null. */
export function readAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  const key = storageKey();
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const token = parsed?.access_token ?? parsed?.currentSession?.access_token;
    return typeof token === "string" ? token : null;
  } catch {
    return null;
  }
}
