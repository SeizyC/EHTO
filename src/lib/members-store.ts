"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { subscribeMembers } from "@/lib/realtime";
import type { EnergyView } from "@/lib/energy";

export type Member = {
  id: string;
  name: string;
  persona: {
    sprite: string;
    affinity?: string[];
    speech_style?: string;
  };
  activity_weight: number;
  status: "active" | "fading" | "ghost" | "away" | "banned";
  /** Plaza coordinates in percent (0-100). Set by server drift. */
  x: number;
  y: number;
  flip: boolean;
};

/** Owner-only: ban a member from the current world. Updates server +
 *  optimistically removes from local cache. The server inserts a system
 *  "X 님이 광장을 떠났어요" message which arrives via Realtime. */
export async function banMember(memberId: string): Promise<{ ok: boolean; error?: string }> {
  const sb = browserClient();
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) return { ok: false, error: "no session" };
  const r = await fetch(`/api/world/members/${memberId}/ban`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sess.session.access_token}` },
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    return { ok: false, error: j.error ?? `HTTP ${r.status}` };
  }
  // Optimistic local removal so the UI feels immediate; realtime UPDATE
  // would catch this too but it's worth not waiting.
  _members = _members.filter((m) => m.id !== memberId);
  _notify();
  return { ok: true };
}

// shared cache + pub/sub so any consumer auto-refreshes when state changes
let _members: Member[] = [];
let _loading = false;
let _worldId: string | null = null;
let _energy: EnergyView | null = null;
let _rtBoundWorldId: string | null = null;
let _rtUnsub: (() => void) | null = null;
const _listeners = new Set<() => void>();
function _notify() { for (const fn of _listeners) fn(); }

/** Wipe in-memory members cache (e.g. on sign-out or account switch). */
export function clearMembers() {
  _members = [];
  _energy = null;
  _worldId = null;
  _rtBoundWorldId = null;
  _rtUnsub?.();
  _rtUnsub = null;
  _notify();
}

/** Read-only accessor for whichever world we've most recently fetched.
 *  Used by chat-store to bind its realtime channel without re-deriving
 *  the worldId from the server. */
export function getCachedWorldId(): string | null {
  return _worldId;
}

// Realtime: any insert/update/delete on `members` filtered to my world.
// Replaces the bulk-replace done by refreshMembers — we mutate in place
// so a status flip doesn't re-create every Character object and trigger
// the heavy re-render of plaza sprites.
async function bindMembersRealtime(worldId: string): Promise<void> {
  if (_rtBoundWorldId === worldId) return;
  _rtUnsub?.();
  _rtBoundWorldId = worldId;
  _rtUnsub = await subscribeMembers(worldId, (evt) => {
    if (evt.eventType === "DELETE") {
      const oldId = (evt.old as { id?: string } | null)?.id;
      if (!oldId) return;
      const idx = _members.findIndex((m) => m.id === oldId);
      if (idx < 0) return;
      _members = _members.filter((m) => m.id !== oldId);
      _notify();
      return;
    }
    const row = evt.new as {
      id: string;
      name: string;
      persona: Member["persona"];
      activity_weight: number;
      status: string;
      activated_at: string | null;
      x: number | null;
      y: number | null;
      flip: boolean | null;
    };
    // Mirror the GET filter: only show activated + active members in the
    // plaza roster. A row that doesn't yet meet the gate is dropped (and
    // a row that just left the gate via UPDATE is removed below).
    const eligible = row.activated_at !== null && row.status === "active";
    const existing = _members.findIndex((m) => m.id === row.id);
    if (!eligible) {
      if (existing >= 0) {
        _members = _members.filter((m) => m.id !== row.id);
        _notify();
      }
      return;
    }
    const m: Member = {
      id: row.id,
      name: row.name,
      persona: row.persona ?? { sprite: "" },
      activity_weight: row.activity_weight,
      status: row.status as Member["status"],
      x: typeof row.x === "number" ? row.x : 50,
      y: typeof row.y === "number" ? row.y : 60,
      flip: !!row.flip,
    };
    if (existing >= 0) {
      const next = _members.slice();
      next[existing] = m;
      _members = next.sort((a, b) => b.activity_weight - a.activity_weight);
    } else {
      _members = [..._members, m].sort((a, b) => b.activity_weight - a.activity_weight);
    }
    _notify();
  });
}

export async function refreshMembers(): Promise<void> {
  if (_loading) return;
  _loading = true;
  try {
    const sb = browserClient();
    const { data: sess } = await sb.auth.getSession();
    if (!sess.session) {
      console.debug("[members] no session");
      _members = []; _notify(); return;
    }
    const r = await fetch("/api/world/members", {
      headers: { Authorization: `Bearer ${sess.session.access_token}` },
    });
    if (!r.ok) {
      console.warn("[members] fetch failed", r.status, await r.text());
      return;
    }
    const j = await r.json();
    console.debug("[members] got", j.members?.length, "members");
    _members = j.members ?? [];
    _energy = (j.energy ?? null) as EnergyView | null;
    if (j.worldId) {
      _worldId = j.worldId;
      // Lazily bind both realtime channels once we know the world.
      bindMembersRealtime(j.worldId).catch((e) =>
        console.warn("[members] realtime bind failed", e),
      );
      import("./chat-store").then(async ({ bindChatRealtime }) => {
        const me = (await sb.auth.getUser()).data.user;
        bindChatRealtime(j.worldId, me?.id ?? null).catch((e) =>
          console.warn("[chat] realtime bind failed", e),
        );
      });
    }
    _notify();
  } finally {
    _loading = false;
  }
}

export function useMembers(): Member[] {
  const [snap, setSnap] = useState<Member[]>(_members);
  useEffect(() => {
    const sync = () => setSnap(_members.slice());
    sync();
    _listeners.add(sync);
    if (_members.length === 0) refreshMembers();
    return () => { _listeners.delete(sync); };
  }, []);
  return snap;
}

export function useEnergy(): EnergyView | null {
  const [snap, setSnap] = useState<EnergyView | null>(_energy);
  useEffect(() => {
    const sync = () => setSnap(_energy);
    sync();
    _listeners.add(sync);
    if (_members.length === 0) refreshMembers();
    return () => { _listeners.delete(sync); };
  }, []);
  return snap;
}
