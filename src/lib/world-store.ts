"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";
import type { WorldBias } from "@/lib/world-bias";

export type WorldInfo = {
  id: string;
  name: string | null;
  createdAt: string;
  owner: boolean;
  isPublic: boolean;
  tags: string[];
  bias: WorldBias | null;
  language: import("@/lib/language").Locale;
  ownerPos: { x: number; y: number; flip: boolean };
  members: { active: number; dormant: number; total: number };
  history: { name: string; set_at: string }[];
  visits: { today: number; week: number; total: number };
};

// ─── shared cache + pub/sub so every useWorld() consumer re-renders when state changes.
// Cache is mirrored to localStorage so the world name appears INSTANTLY on
// hard refresh (stale-while-revalidate). No more "이름 없는 세계" flash while
// the network round-trip completes.

const LS_KEY = "ehto:world-cache:v1";

function _loadFromLs(): WorldInfo | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as WorldInfo) : null;
  } catch { return null; }
}
function _saveToLs(w: WorldInfo | null) {
  if (typeof window === "undefined") return;
  try {
    if (w) window.localStorage.setItem(LS_KEY, JSON.stringify(w));
    else window.localStorage.removeItem(LS_KEY);
  } catch { /* quota / private mode — ignore */ }
}

// IMPORTANT: do NOT seed `_cached` from localStorage at module load.
// Doing so causes SSR/CSR hydration mismatches (server sees null, browser
// sees the persisted world). The hook hydrates from LS inside useEffect.
let _cached: WorldInfo | null = null;
let _lsHydrated = false;
let _loading = false;
const _listeners = new Set<() => void>();
function _notify() { for (const fn of _listeners) fn(); }

function _hydrateFromLs() {
  if (_lsHydrated) return;
  _lsHydrated = true;
  const fromLs = _loadFromLs();
  if (fromLs) {
    _cached = fromLs;
    _notify();
  }
}

/** Wipe both in-memory + localStorage world cache (sign-out / account switch). */
export function clearWorld() {
  _cached = null;
  _saveToLs(null);
  _notify();
}

async function fetchWorld(): Promise<void> {
  if (_loading) return;
  _loading = true;
  try {
    const sb = browserClient();
    const { data: sess } = await sb.auth.getSession();
    if (!sess.session) { _cached = null; _saveToLs(null); _notify(); return; }
    const r = await fetch("/api/world/info", {
      headers: { Authorization: `Bearer ${sess.session.access_token}` },
    });
    if (!r.ok) return;                 // keep existing cache on transient failure
    const j = await r.json();
    const next = (j.world
      ? { ...j.world, language: j.world.language ?? "ko" }
      : null) as WorldInfo | null;
    _cached = next;
    _saveToLs(next);
    _notify();
  } finally {
    _loading = false;
  }
}

export function useWorld() {
  // Initial state is always null — matches what the server renders. We
  // hydrate from localStorage (if any) inside useEffect on the client.
  const [world, setWorld] = useState<WorldInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    _hydrateFromLs();
    const sync = () => { setWorld(_cached); setLoading(false); };
    _listeners.add(sync);
    sync();                      // pick up whatever LS gave us (or null)
    if (_cached === null) fetchWorld();
    return () => { _listeners.delete(sync); };
  }, []);

  return { world, loading, refresh: fetchWorld };
}

/** Persist the owner's plaza position. Optimistically updates the local
 *  cache so the avatar moves the instant the user clicks; the PUT
 *  follows and confirms. On failure we silently keep the optimistic
 *  state — the next /api/world/info read will reconcile, and the
 *  alternative (snapping back) feels worse than mild divergence. */
export async function updateMyPosition(
  x: number,
  y: number,
  flip: boolean,
): Promise<{ error?: string }> {
  // Optimistic local update — every useWorld() subscriber re-renders
  // with the new position before the network round-trip completes.
  if (_cached) {
    _cached = { ..._cached, ownerPos: { x, y, flip } };
    _saveToLs(_cached);
    _notify();
  }
  const sb = browserClient();
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) return { error: "no session" };
  const r = await fetch("/api/world/me/position", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sess.session.access_token}`,
    },
    body: JSON.stringify({ x, y, flip }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    return { error: j.error ?? `HTTP ${r.status}` };
  }
  return {};
}

export async function updateWorldName(name: string): Promise<{ error?: string }> {
  const sb = browserClient();
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) return { error: "no session" };
  const r = await fetch("/api/world/name", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sess.session.access_token}`,
    },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    return { error: j.error ?? `HTTP ${r.status}` };
  }
  // refresh shared cache → notifies every useWorld() subscriber
  await fetchWorld();
  return {};
}

/** Update visibility and/or tags. Refreshes shared cache on success so
 *  every subscriber re-renders with the new values. */
export async function updateWorldSettings(args: {
  isPublic?: boolean;
  tags?: string[];
  bias?: WorldBias | null;
  language?: "ko" | "en" | "ja";
}): Promise<{ error?: string }> {
  const sb = browserClient();
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) return { error: "no session" };
  const r = await fetch("/api/world/settings", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sess.session.access_token}`,
    },
    body: JSON.stringify(args),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    return { error: j.error ?? `HTTP ${r.status}` };
  }
  await fetchWorld();
  return {};
}
