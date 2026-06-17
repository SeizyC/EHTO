import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import { dayStart, dayEnd } from "@/lib/day-rollover";
import { catalogByVariantId, catalogByTypeKey } from "@/lib/object-catalog";

// GET /api/plaza/[id]
//
// Returns enough data to render a visitor view of a public plaza:
// world meta, active members, today's messages, plaza objects. The
// id parameter must reference a world where is_public=true. Private
// worlds 404 — never reveal their existence.
//
// No auth required. The data path mirrors what /world bootstraps for
// the owner, minus owner-only stamps (heartbeat etc).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const svc = serviceClient();

  const { data: world } = await svc
    .from("worlds")
    .select("id, name, owner_id, created_at, is_public, tags, owner_x, owner_y, owner_flip")
    .eq("id", id)
    .eq("is_public", true)
    .maybeSingle();
  if (!world) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Owner handle
  const { data: prof } = await svc
    .from("profiles")
    .select("handle")
    .eq("id", world.owner_id)
    .maybeSingle();
  const ownerHandle = prof?.handle ?? "익명";

  // Active members (mirror what /api/world/members returns)
  const { data: allMembers } = await svc
    .from("members")
    .select("id, name, persona, activity_weight, status, activated_at, x, y, flip")
    .eq("current_location_world_id", world.id);
  const members = (allMembers ?? [])
    .filter((m) => m.activated_at !== null && m.status === "active")
    .sort((a, b) => b.activity_weight - a.activity_weight);

  // Today's messages (KST 09:00 window) — same shape /api/messages returns
  const start = dayStart();
  const end = dayEnd(start);
  const { data: msgData } = await svc
    .from("messages")
    .select("id, owner_user_id, owner_member_id, text, kind, created_at, members(name)")
    .eq("world_id", world.id)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at", { ascending: false })
    .limit(300);
  type Row = {
    id: string;
    owner_user_id: string | null;
    owner_member_id: string | null;
    text: string;
    kind: string | null;
    created_at: string;
    members?: { name: string }[] | { name: string } | null;
  };
  const messages = ((msgData ?? []) as unknown as Row[])
    .slice()
    .reverse()
    .map((r) => {
      const speaker = Array.isArray(r.members) ? r.members[0]?.name : r.members?.name;
      return {
        id: r.id,
        owner_user_id: r.owner_user_id,
        owner_member_id: r.owner_member_id,
        text: r.text,
        kind: r.kind ?? "chat",
        created_at: r.created_at,
        speaker_name: speaker ?? null,
      };
    });

  // Plaza objects (enriched with catalog metadata — same shape as
  // /api/world/objects so PlazaCanvas can render visitor and owner
  // views from the same payload).
  const { data: rawObjects } = await svc
    .from("plaza_objects")
    .select("id, type, variant_id, x, y, scale")
    .eq("world_id", world.id);
  const objects = await Promise.all((rawObjects ?? []).map(async (r) => {
    const variantId = (r as { variant_id?: string | null }).variant_id ?? null;
    const typeKey = (r as { type?: string | null }).type ?? null;
    let type = variantId ? await catalogByVariantId(svc, variantId) : null;
    if (!type && typeKey) type = await catalogByTypeKey(svc, typeKey);
    const variant = type && variantId
      ? type.variants.find((v) => v.id === variantId) ?? type.variants[0] ?? null
      : type?.variants[0] ?? null;
    return {
      id: r.id,
      type: type?.typeKey ?? typeKey ?? "unknown",
      typeId: type?.id ?? null,
      variantId: variant?.id ?? null,
      x: r.x, y: r.y, scale: r.scale,
      spriteUrl: variant?.spriteUrl ?? null,
      nativeHeightPct: type?.nativeHeightPct ?? null,
      labelKo: type?.labelKo ?? null,
    };
  }));

  return NextResponse.json({
    world: {
      id: world.id,
      name: world.name,
      createdAt: world.created_at,
      tags: world.tags ?? [],
      owner: { handle: ownerHandle },
      ownerPos: {
        x: (world as { owner_x?: number }).owner_x ?? 50,
        y: (world as { owner_y?: number }).owner_y ?? 60,
        flip: !!(world as { owner_flip?: boolean }).owner_flip,
      },
    },
    members,
    messages,
    objects: objects ?? [],
  });
}
