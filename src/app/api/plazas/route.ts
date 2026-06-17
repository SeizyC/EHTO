import { NextRequest, NextResponse } from "next/server";
import { serviceClient, userClient, publicSpriteUrl } from "@/lib/supabase";
import type { WorldBias } from "@/lib/world-bias";

// GET /api/plazas
//
// Returns a list of plaza cards for the /home discovery grid.
//
// · Public worlds (is_public=true) are listed for everyone, anon or auth.
// · When the request carries a valid Bearer token, the caller's OWN world
//   is *prepended* as the first card and tagged `mine: true` — even if it
//   is currently private. The owner always sees their own plaza first so
//   they can re-enter it directly from the directory.
//
// Each card payload:
//   - id, name, ageDays, tags, mine (true if it's the requester's world)
//   - owner.handle, owner.online (heartbeat within 5min)
//   - active members count + first 5 sprites for the visual row
//   - vitality 1-5 (recent 60min message frequency)
//   - lastLine (latest non-system message text, first 40 chars)
//   - music: { caption, url } if a Spotify URL was shared in last 30min
//
// Heavy reads are done server-side with the service role; the only RLS-
// gated read is the auth-token check that identifies the requester.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type WorldRow = {
  id: string;
  name: string | null;
  owner_id: string;
  created_at: string;
  last_owner_active_at: string | null;
  tags: string[];
  bias: WorldBias | null;
  is_public: boolean;
};

type MemberRow = {
  activity_weight: number;
  status: string;
  current_location_world_id: string;
};

type MessageRow = {
  world_id: string;
  text: string;
  created_at: string;
  owner_user_id: string | null;
  kind: string | null;
};

const SPOTIFY_RE = /https?:\/\/open\.spotify\.com\/(track|album|playlist|episode)\/[a-zA-Z0-9]+(?:\?[^\s]*)?/;
const OWNER_ONLINE_WINDOW_MS = 5 * 60_000;
const MUSIC_RECENT_WINDOW_MS = 30 * 60_000;
const VITALITY_WINDOW_MS = 60 * 60_000;

export async function GET(req: NextRequest) {
  const svc = serviceClient();

  // 1a. Identify requester (optional). If a valid token is present, we'll
  //     surface their own world as the first card even if it's private.
  let myUserId: string | null = null;
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (token) {
    const ub = userClient(token);
    const { data: userData } = await ub.auth.getUser();
    myUserId = userData.user?.id ?? null;
  }

  // 1b. Public worlds + (if logged in) my own world even when private.
  //     `.or` would be cleaner but `is_public.eq.true,owner_id.eq.uuid`
  //     reads awkwardly in PostgREST; two queries + merge is clearer and
  //     the second query is a single-row lookup.
  const { data: publicWorlds, error: wErr } = await svc
    .from("worlds")
    .select("id, name, owner_id, created_at, last_owner_active_at, tags, bias, is_public")
    .eq("is_public", true)
    .order("last_owner_active_at", { ascending: false, nullsFirst: false });
  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });

  let myWorld: WorldRow | null = null;
  if (myUserId) {
    const { data: mw } = await svc
      .from("worlds")
      .select("id, name, owner_id, created_at, last_owner_active_at, tags, bias, is_public")
      .eq("owner_id", myUserId)
      .maybeSingle();
    if (mw) myWorld = mw as WorldRow;
  }

  // Merge: my world first (prepend), then public worlds with my world
  // dedup'd out (in case it was already public).
  const others = (publicWorlds ?? []).filter((w) => !myWorld || w.id !== myWorld.id);
  const worlds: WorldRow[] = myWorld ? [myWorld, ...(others as WorldRow[])] : (others as WorldRow[]);
  if (worlds.length === 0) return NextResponse.json({ plazas: [] });

  const worldIds = worlds.map((w) => w.id);
  const ownerIds = Array.from(new Set(worlds.map((w) => w.owner_id)));

  // 2. Owners (handle + active character image so each card can show
  //    the owner's avatar in place of the old anonymous member sprite
  //    row).
  const { data: profiles } = await svc
    .from("profiles")
    .select("id, handle")
    .in("id", ownerIds);
  const handleById = new Map<string, string>();
  for (const p of profiles ?? []) handleById.set(p.id as string, (p.handle as string) ?? "익명");

  const { data: ownerChars } = await svc
    .from("characters")
    .select("owner_id, image_path, is_active")
    .in("owner_id", ownerIds)
    .eq("is_active", true);
  const spriteByOwner = new Map<string, string>();
  for (const c of ownerChars ?? []) {
    const ip = (c as { image_path?: string }).image_path;
    const oid = (c as { owner_id?: string }).owner_id;
    if (ip && oid) spriteByOwner.set(oid, publicSpriteUrl(ip));
  }

  // 3. Active member counts per world (status='active', activity_weight>=0.3).
  //    Cards used to render the first 5 member sprites which created visual
  //    noise (random anonymous avatars). Now we only need the COUNT for
  //    the "9명" tag in the footer — drop the sprite list entirely.
  const { data: allMembers } = await svc
    .from("members")
    .select("activity_weight, status, current_location_world_id")
    .in("current_location_world_id", worldIds)
    .eq("status", "active");
  const memberCountByWorld = new Map<string, number>();
  for (const m of (allMembers ?? []) as MemberRow[]) {
    if (m.activity_weight < 0.3) continue;
    memberCountByWorld.set(
      m.current_location_world_id,
      (memberCountByWorld.get(m.current_location_world_id) ?? 0) + 1,
    );
  }

  // 4. Recent messages — pull last hour across all worlds in one query,
  //    then group + compute vitality + extract lastLine + music share.
  const sinceIso = new Date(Date.now() - VITALITY_WINDOW_MS).toISOString();
  const { data: recentMsgs } = await svc
    .from("messages")
    .select("world_id, text, created_at, owner_user_id, kind")
    .in("world_id", worldIds)
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false });
  const msgsByWorld = new Map<string, MessageRow[]>();
  for (const m of (recentMsgs ?? []) as MessageRow[]) {
    const arr = msgsByWorld.get(m.world_id) ?? [];
    arr.push(m);
    msgsByWorld.set(m.world_id, arr);
  }

  // 5. Compose cards
  const now = Date.now();
  const plazas = (worlds as WorldRow[]).map((w) => {
    const memberCount = memberCountByWorld.get(w.id) ?? 0;
    const ageDays = Math.floor((now - new Date(w.created_at).getTime()) / 86400_000);
    const lastActive = w.last_owner_active_at ? new Date(w.last_owner_active_at).getTime() : 0;
    const ownerOnline = now - lastActive < OWNER_ONLINE_WINDOW_MS;

    const msgs = msgsByWorld.get(w.id) ?? [];
    // Vitality 1-5: log-scaled message count in last 60min. 0=1, 50+=5.
    const cnt = msgs.length;
    const vitality = cnt === 0 ? 1 : Math.min(5, 1 + Math.floor(Math.log2(cnt + 1)));

    // Vibe label — derived from last-hour message count. Maps to a short
    // Korean phrase the card can render as a single status pill instead
    // of the user having to interpret a number. Tuned so plazas at the
    // bottom feel "still alive but quiet" rather than "dead".
    const vibe =
      cnt === 0 ? "지금은 조용"
      : cnt < 5 ? "느슨한 흐름"
      : cnt < 15 ? "이야기 무르익는 중"
      : cnt < 30 ? "활발한 대화"
      : "북적이는 광장";

    // lastLine: most recent non-system chat
    const lastChat = msgs.find((m) => m.kind !== "system");
    const lastLine = lastChat ? lastChat.text.slice(0, 40) : null;

    // music: latest Spotify URL share within MUSIC_RECENT_WINDOW
    const musicCutoff = now - MUSIC_RECENT_WINDOW_MS;
    const musicMsg = msgs.find(
      (m) =>
        new Date(m.created_at).getTime() >= musicCutoff &&
        SPOTIFY_RE.test(m.text),
    );
    let music: { caption: string; url: string } | null = null;
    if (musicMsg) {
      const match = musicMsg.text.match(SPOTIFY_RE);
      if (match) {
        const caption = musicMsg.text
          .replace(match[0], "")
          .replace(/\n+/g, " ")
          .trim()
          .slice(0, 40);
        music = { caption: caption || "음악 공유 중", url: match[0] };
      }
    }

    // Bias chip text — shown above the vibe pill so the card reads
    // "{theme} · {vibe}". Currently only kpop has a structured label.
    let biasLabel: string | null = null;
    if (w.bias?.kind === "kpop") {
      const artist = w.bias.artist?.trim();
      biasLabel = artist ? `${artist} 팬덤` : "K-pop 팬덤";
    }

    return {
      id: w.id,
      name: w.name ?? "이름 없음",
      ageDays,
      tags: w.tags ?? [],
      mine: !!myUserId && w.owner_id === myUserId,
      isPublic: w.is_public,
      owner: {
        handle: handleById.get(w.owner_id) ?? "익명",
        online: ownerOnline,
        sprite: spriteByOwner.get(w.owner_id) ?? null,
      },
      memberCount,
      vitality,
      vibe,
      biasLabel,
      lastLine,
      // Boolean for the icon — true if a Spotify share landed in the
      // last MUSIC_RECENT_WINDOW_MS. Full caption kept too for the
      // tooltip / future hover preview.
      hasMusic: !!music,
      music,
    };
  });

  return NextResponse.json({ plazas });
}
