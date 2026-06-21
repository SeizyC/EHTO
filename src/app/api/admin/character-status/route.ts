import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { serviceClient } from "@/lib/supabase";

// GET /api/admin/character-status
// Returns each master AI character with its canonical names and all live
// deployed instances (members rows where ai_character_id is set and
// activated_at is not null and status != 'ghost').

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type NameI18n = { ko?: string; en?: string; ja?: string } | null;

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

  const svc = serviceClient();

  // 1. All master characters
  const { data: chars, error: charsErr } = await svc
    .from("ai_characters")
    .select("id, name, sprite, name_i18n, max_concurrent_rooms")
    .order("name", { ascending: true });
  if (charsErr) return NextResponse.json({ error: charsErr.message }, { status: 500 });

  // 2. Deployed instances (non-ghost, activated_at not null, ai_character_id not null)
  const { data: members, error: membersErr } = await svc
    .from("members")
    .select("id, name, status, ai_character_id, current_location_world_id, activity_weight")
    .not("ai_character_id", "is", null)
    .not("activated_at", "is", null)
    .neq("status", "ghost");
  if (membersErr) return NextResponse.json({ error: membersErr.message }, { status: 500 });

  // 3. Worlds referenced — load all then build a map
  const { data: worlds, error: worldsErr } = await svc
    .from("worlds")
    .select("id, name, language");
  if (worldsErr) return NextResponse.json({ error: worldsErr.message }, { status: 500 });

  const worldMap = new Map<string, { name: string | null; language: string }>();
  for (const w of worlds ?? []) {
    worldMap.set(w.id, { name: w.name ?? null, language: w.language ?? "ko" });
  }

  // 4. Group members by ai_character_id
  type Instance = {
    worldName: string;
    worldLanguage: string;
    memberName: string;
    status: string;
    activityWeight: number;
  };
  const instanceMap = new Map<string, Instance[]>();
  for (const m of members ?? []) {
    if (!m.ai_character_id) continue;
    const world = m.current_location_world_id
      ? worldMap.get(m.current_location_world_id)
      : undefined;
    const worldName =
      world?.name
        ? world.name
        : m.current_location_world_id
        ? m.current_location_world_id.slice(0, 8)
        : "(이름 없음)";
    const worldLanguage = world?.language ?? "ko";

    const inst: Instance = {
      worldName,
      worldLanguage,
      memberName: m.name ?? "(이름 없음)",
      status: m.status ?? "unknown",
      activityWeight: m.activity_weight ?? 0,
    };
    const list = instanceMap.get(m.ai_character_id) ?? [];
    list.push(inst);
    instanceMap.set(m.ai_character_id, list);
  }

  // 5. Build response — already sorted by name from query
  const characters = (chars ?? []).map((c) => {
    const instances = instanceMap.get(c.id) ?? [];
    return {
      id: c.id,
      name: c.name,
      sprite: c.sprite,
      name_i18n: (c.name_i18n ?? {}) as NameI18n,
      maxConcurrentRooms: c.max_concurrent_rooms,
      activeCount: instances.length,
      instances,
    };
  });

  return NextResponse.json({ characters });
}
