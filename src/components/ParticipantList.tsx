"use client";

// Right-rail participant list (desktop only). Shows every character currently
// in the plaza — the room owner first, then activated AI members sorted by
// recent activity. Each row: small sprite chip + name + a tiny vibe tag (the
// member's first affinity) + an "online" dot.

import type { Member } from "@/lib/members-store";
import type { SavedCharacter } from "@/lib/character-store";

type Props = {
  me: SavedCharacter | null;
  members: Member[];
};

export function ParticipantList({ me, members }: Props) {
  // Match plaza's visibleMembers filter exactly so the list never shows
  // a member whose sprite isn't on the plaza.
  const visible = members.filter(
    (m) => m.activity_weight >= 0.3 && m.status !== "ghost",
  );
  const count = visible.length + (me ? 1 : 0);

  return (
    <aside className="border-line bg-surface/40 flex h-full flex-col gap-3 rounded-xl border p-4">
      <header className="flex items-baseline justify-between">
        <span className="text-sub text-[10px] uppercase tracking-[0.22em]">
          지금 머무름
        </span>
        <span className="text-ink text-[11px] tabular-nums">{count}</span>
      </header>

      <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {me?.imageUrl && (
          <Row
            sprite={me.imageUrl}
            name={me.handle ?? "나"}
            tag="방장"
            highlight
          />
        )}
        {visible.map((m) => (
          <Row
            key={m.id}
            sprite={m.persona.sprite}
            name={m.name}
            tag={m.persona.affinity?.[0]}
          />
        ))}
        {visible.length === 0 && !me && (
          <li className="text-dim py-6 text-center text-[12px]">
            아직 아무도 없어요
          </li>
        )}
      </ul>
    </aside>
  );
}

function Row({
  sprite,
  name,
  tag,
  highlight,
}: {
  sprite: string;
  name: string;
  tag?: string;
  highlight?: boolean;
}) {
  return (
    <li
      className={[
        "flex items-center gap-3 rounded-md px-1.5 py-1.5",
        highlight ? "bg-ink/5" : "",
      ].join(" ")}
    >
      {/* Bust crop matched to MeGlyph (profile button) — head + shoulders
          only, no body. backgroundSize/Position values are kept in lockstep
          with MeGlyph so the user's own avatar in this list looks
          identical to the one in the world header. */}
      <div
        className="border-line bg-bg h-9 w-9 shrink-0 overflow-hidden rounded-full border"
        style={{
          backgroundImage: `url(${sprite})`,
          backgroundRepeat: "no-repeat",
          backgroundSize: "auto 220%",
          backgroundPosition: "50% 12%",
          imageRendering: "pixelated",
        }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-ink truncate text-[13px] font-medium leading-tight">
          {name}
        </div>
        {tag && (
          <div className="text-sub truncate text-[11px] leading-tight">
            {tag}
          </div>
        )}
      </div>
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: "rgba(74,222,128,0.85)" }}
        aria-label="active"
      />
    </li>
  );
}
