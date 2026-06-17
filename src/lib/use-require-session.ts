"use client";

// Client-side route gate: if the initial getSession resolves without a
// session, redirect to /login. Returns the auth context so callers can also
// render a skeleton while loading.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/AuthProvider";

export function useRequireSession() {
  const auth = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!auth.loading && !auth.session) router.replace("/login");
  }, [auth.loading, auth.session, router]);

  return auth;
}
