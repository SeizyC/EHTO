"use client";

import { useEffect, useState } from "react";
import type { GenderId, SkinId, OutfitId } from "@/lib/prompts";
import { browserClient, publicSpriteUrl } from "@/lib/supabase";

const KEY = "ehto:character:v3";

export type SavedCharacter = {
  id: string;
  userId?: string;        // owner — the auth user this cache belongs to
  imageUrl: string;       // public URL from Supabase Storage
  gender: GenderId;
  skin: SkinId;
  outfit: OutfitId;
  rolledHair?: string;
  handle?: string;        // user's chosen name (from profiles.handle)
  activityPoints?: number;
  tickets?: number;
  createdAt: number;
};

/** Auth user id (sub) from a Supabase access token, decoded locally (no
 *  network). Used to verify a cached character actually belongs to the
 *  currently signed-in user — a different account (or a legacy cache with no
 *  userId) must not be trusted. Returns null if the token can't be parsed. */
export function uidFromToken(token: string): string | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return (JSON.parse(json) as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
}

// ───────── reactive store via pub/sub ─────────
const listeners = new Set<() => void>();
function notify() {
  for (const fn of listeners) fn();
}

export function saveCharacter(c: SavedCharacter) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(c));
  notify();
}

export function loadCharacter(): SavedCharacter | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedCharacter;
  } catch {
    return null;
  }
}

export function patchCharacter(patch: Partial<SavedCharacter>) {
  const cur = loadCharacter();
  if (!cur) return;
  saveCharacter({ ...cur, ...patch }); // notify happens inside saveCharacter
}

/** Drop the locally cached character + world (used on logout). */
export function clearCharacter() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem("ehto:world-cache:v1");
  } catch { /* ignore */ }
  notify();
}

/** Decide where a freshly-authenticated user should land WITHOUT having
 *  to bounce through /character first. Returns "/world" (the user's OWN
 *  plaza) when they already have a character + handle (LS first, server
 *  fallback) so a returning login lands them at home base — not the
 *  public directory (/home). Otherwise returns "/character" so the
 *  creation/naming flow can take over.
 *
 *  Note: same-tab flow uses LS cache (instant). Fresh-browser flow
 *  hits /api/character/me once — adds ~1 RTT but only on first sign-in
 *  on that device, which is the right place to spend the latency. */
export async function landingPathForSession(accessToken: string): Promise<string> {
  const uid = uidFromToken(accessToken);
  const cached = loadCharacter();
  // Only trust the cache fast-path if it belongs to THIS user. A stale cache
  // from a previously signed-in account (e.g. after a Google sign-in on a
  // browser that was someone else) must not route us into their plaza.
  if (cached?.handle && uid && cached.userId === uid) return "/world";
  if (cached && cached.userId !== uid) clearCharacter(); // drop foreign/legacy cache

  try {
    const r = await fetch("/api/character/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return "/character";
    const j = await r.json();
    const ch = j.character;
    if (!ch) return "/character";
    // Hydrate LS so subsequent navigations don't re-fetch.
    saveCharacter({
      id: ch.id,
      userId: uid ?? undefined,
      imageUrl: ch.imageUrl,
      gender: ch.gender,
      skin: ch.skin,
      outfit: ch.outfit,
      rolledHair: ch.rolledHair,
      handle: ch.handle,
      createdAt: ch.createdAt,
    });
    return ch.handle ? "/world" : "/character";
  } catch {
    return "/character";
  }
}

// Persist handle to profiles table (upsert) AND update local cache.
export async function saveHandle(handle: string): Promise<{ error?: string }> {
  const sb = browserClient();
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) return { error: "no session" };
  const userId = sess.session.user.id;
  const { error } = await sb
    .from("profiles")
    .upsert({ id: userId, handle }, { onConflict: "id" });
  if (error) return { error: error.message };
  patchCharacter({ handle });
  return {};
}

// Hook: returns the user's active character. Reactive — re-renders when
// the cache changes (saveCharacter / patchCharacter / saveHandle).
export function useCharacter(): SavedCharacter | null {
  const [c, setC] = useState<SavedCharacter | null>(null);

  useEffect(() => {
    // 1) subscribe so cache changes anywhere refresh this component
    const refresh = () => setC(loadCharacter());
    refresh();
    listeners.add(refresh);

    // 2) one-shot Supabase sync on mount — server is the source of truth
    (async () => {
      const sb = browserClient();
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) return;
      const uid = sess.session.user.id;

      // Defense-in-depth: if the cached character belongs to a different (or
      // unknown/legacy) user, drop it now so we never render someone else's
      // identity while the server sync below resolves.
      const stale = loadCharacter();
      if (stale && stale.userId !== uid) clearCharacter();

      const [{ data: charRow }, { data: profRow }] = await Promise.all([
        sb.from("characters")
          .select("id,image_path,gender,skin,outfit,rolled_hair,created_at")
          .eq("owner_id", uid)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        sb.from("profiles")
          .select("handle, activity_points, tickets")
          .eq("id", uid)
          .maybeSingle(),
      ]);

      if (!charRow) return;
      const cached = loadCharacter();
      const fromServer: SavedCharacter = {
        id: charRow.id,
        userId: uid,
        imageUrl: publicSpriteUrl(charRow.image_path),
        gender: charRow.gender,
        skin: charRow.skin,
        outfit: charRow.outfit,
        rolledHair: charRow.rolled_hair ?? undefined,
        handle: profRow?.handle ?? cached?.handle,
        activityPoints: profRow?.activity_points ?? 0,
        tickets: profRow?.tickets ?? 0,
        createdAt: new Date(charRow.created_at).getTime(),
      };
      // Only write back if something actually changed
      if (
        !cached ||
        cached.id !== fromServer.id ||
        cached.handle !== fromServer.handle ||
        cached.activityPoints !== fromServer.activityPoints ||
        cached.tickets !== fromServer.tickets
      ) {
        saveCharacter(fromServer); // triggers notify → re-render
      }
    })().catch(() => {});

    return () => {
      listeners.delete(refresh);
    };
  }, []);

  return c;
}
