"use client";

// Session context + auth lifecycle.
//   · Tracks the current Supabase auth session and exposes it via useSession()
//   · No more anonymous sign-in — users must email-sign up / log in explicitly
//   · onAuthStateChange keeps the context fresh across tabs (Supabase syncs
//     storage events, so sign-out elsewhere logs us out here too)

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { browserClient } from "@/lib/supabase";
import { clearCharacter } from "@/lib/character-store";
import { clearChat } from "@/lib/chat-store";
import { clearMembers } from "@/lib/members-store";
import { clearWorld } from "@/lib/world-store";
import { clearPlazaObjects } from "@/lib/objects-store";

/** Reset every per-user cache (server-derived state + localStorage). */
function clearAllUserCaches() {
  clearCharacter();
  clearChat();
  clearMembers();
  clearWorld();
  clearPlazaObjects();
}

type AuthCtx = {
  /** true while the initial getSession() is in-flight on first mount. */
  loading: boolean;
  session: Session | null;
  user: Session["user"] | null;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  loading: true,
  session: null,
  user: null,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // Track the user id we've last "settled into" so we can detect account
  // switches (sign-in as a different user) and wipe per-user caches.
  const lastUserId = useRef<string | null>(null);

  useEffect(() => {
    const sb = browserClient();
    let cancelled = false;

    function settle(s: Session | null) {
      const newId = s?.user?.id ?? null;
      // First time we observe a session, or it changed users → flush caches.
      if (lastUserId.current !== null && lastUserId.current !== newId) {
        clearAllUserCaches();
      }
      lastUserId.current = newId;
      setSession(s);
      setLoading(false);
    }

    sb.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      lastUserId.current = data.session?.user?.id ?? null;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => settle(s));

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      signOut: async () => {
        const sb = browserClient();
        await sb.auth.signOut();
        // settle() will fire via onAuthStateChange and clear caches.
      },
    }),
    [loading, session],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  return useContext(Ctx);
}
