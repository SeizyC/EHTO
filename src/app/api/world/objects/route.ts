import { NextRequest, NextResponse } from "next/server";
import { userClient, serviceClient } from "@/lib/supabase";
import { seedPlazaObjectsIfEmpty } from "@/lib/plaza-seed";
import { catalogByVariantId, catalogByTypeKey } from "@/lib/object-catalog";

// GET /api/world/objects
// · Returns the authed user's plaza placements.
// · Lazy-seeds a 2-piece starter set on a world's first read (so existing
//   worlds populate without a migration backfill).
// Realtime pushes subsequent placements directly — this endpoint is only
// for the initial bootstrap + the 60s safety poll.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "missing auth" }, { status: 401 });

  const sb = userClient(token);
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }

  const { data: world } = await sb
    .from("worlds")
    .select("id")
    .eq("owner_id", userData.user.id)
    .maybeSingle();
  if (!world) return NextResponse.json({ worldId: null, objects: [] });

  const svc = serviceClient();
  try {
    await seedPlazaObjectsIfEmpty(svc, world.id);
  } catch (e) {
    console.warn("plaza seed failed:", e instanceof Error ? e.message : e);
  }

  const { data: rows, error } = await svc
    .from("plaza_objects")
    .select("id, type, variant_id, x, y, scale")
    .eq("world_id", world.id)
    .order("placed_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich each placement with the catalog-resolved render metadata so
  // PlazaCanvas no longer needs the OBJECT_CATALOG TS constant. Falls
  // back to type-key lookup for pre-bootstrap rows that lack
  // variant_id (defensive — bootstrap should have backfilled them).
  const enriched = await Promise.all((rows ?? []).map(async (r) => {
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

  return NextResponse.json({ worldId: world.id, objects: enriched });
}
