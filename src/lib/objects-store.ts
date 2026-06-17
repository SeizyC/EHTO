"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { subscribePlazaObjects } from "@/lib/realtime";
import type { PlazaObject, PlazaObjectType } from "@/lib/plaza-objects";

// Live plaza placements for the authed user's world. Mirrors the shape
// of members-store: hydrate via REST once, then keep current via the
// Realtime stream. The world page renders state.objects from this hook
// instead of the old PLAZA_PRESETS.empty hardcode.

let _objects: PlazaObject[] = [];
let _loading = false;
let _rtBoundWorldId: string | null = null;
let _rtUnsub: (() => void) | null = null;
const _listeners = new Set<() => void>();
function _notify() { for (const fn of _listeners) fn(); }

export function clearPlazaObjects() {
  _objects = [];
  _rtBoundWorldId = null;
  _rtUnsub?.();
  _rtUnsub = null;
  _notify();
}

// API rows (enriched by /api/world/objects) include catalog metadata.
// Realtime rows from supabase come in raw — those get the enrichment
// columns filled with null and fall back to whatever the next /api
// poll returns. PlazaCanvas tolerates null spriteUrl (renders nothing
// for that one object until enrichment arrives).
type DbObject = {
  id: string;
  type: string;
  x: number;
  y: number;
  scale: number;
  variant_id?: string | null;
  // enriched-only fields:
  typeId?: string | null;
  variantId?: string | null;
  spriteUrl?: string | null;
  nativeHeightPct?: number | null;
  labelKo?: string | null;
};

function fromDb(row: DbObject): PlazaObject {
  return {
    id: row.id,
    type: (row.type as PlazaObjectType) || "fountain", // realtime payload fallback
    x: row.x,
    y: row.y,
    scale: row.scale,
    typeId: row.typeId ?? null,
    variantId: row.variantId ?? row.variant_id ?? null,
    spriteUrl: row.spriteUrl ?? null,
    nativeHeightPct: row.nativeHeightPct ?? null,
    labelKo: row.labelKo ?? null,
  };
}

async function bindObjectsRealtime(worldId: string): Promise<void> {
  if (_rtBoundWorldId === worldId) return;
  _rtUnsub?.();
  _rtBoundWorldId = worldId;
  _rtUnsub = await subscribePlazaObjects(worldId, (evt) => {
    if (evt.eventType === "DELETE") {
      const oldId = (evt.old as { id?: string } | null)?.id;
      if (!oldId) return;
      if (!_objects.some((o) => o.id === oldId)) return;
      _objects = _objects.filter((o) => o.id !== oldId);
      _notify();
      return;
    }
    const row = evt.new as DbObject;
    const next = fromDb(row);
    const idx = _objects.findIndex((o) => o.id === row.id);
    if (idx >= 0) {
      const arr = _objects.slice();
      arr[idx] = next;
      _objects = arr;
    } else {
      _objects = [..._objects, next];
    }
    _notify();
  });
}

export async function refreshPlazaObjects(): Promise<void> {
  if (_loading) return;
  _loading = true;
  try {
    const sb = browserClient();
    const { data: sess } = await sb.auth.getSession();
    if (!sess.session) { _objects = []; _notify(); return; }
    const r = await fetch("/api/world/objects", {
      headers: { Authorization: `Bearer ${sess.session.access_token}` },
    });
    if (!r.ok) return;
    const j = await r.json();
    _objects = (j.objects ?? []).map(fromDb);
    if (j.worldId) {
      bindObjectsRealtime(j.worldId).catch((e) =>
        console.warn("[objects] realtime bind failed", e),
      );
    }
    _notify();
  } finally {
    _loading = false;
  }
}

export function usePlazaObjects(): PlazaObject[] {
  const [snap, setSnap] = useState<PlazaObject[]>(_objects);
  useEffect(() => {
    const sync = () => setSnap(_objects.slice());
    sync();
    _listeners.add(sync);
    if (_objects.length === 0) refreshPlazaObjects();
    return () => { _listeners.delete(sync); };
  }, []);
  return snap;
}
