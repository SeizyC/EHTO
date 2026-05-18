"use client";

import { useState } from "react";
import { Character } from "./Character";
import type { CreatureKind, Outfit } from "@/types/world";

export function RoomChatInput({
  kind,
  outfit,
}: {
  kind: CreatureKind;
  outfit: Outfit;
}) {
  const [value, setValue] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        setValue("");
      }}
      className="flex items-center gap-2 border-t border-white/10 bg-black/85 px-3 py-2"
    >
      <div className="grid h-9 w-9 shrink-0 place-items-end overflow-hidden rounded bg-white/10">
        <div className="scale-[0.5] origin-bottom translate-y-1">
          <Character kind={kind} presence="active" outfit={outfit} size={3} />
        </div>
      </div>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="조용히 끼어들기…"
        className="min-w-0 flex-1 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-[13px] text-white placeholder:text-white/30 outline-none focus:border-white/40"
      />
      <button
        type="submit"
        className="grid h-9 w-9 place-items-center rounded-md border border-white/15 bg-white/5 text-white/70 hover:text-white"
        aria-label="send"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </form>
  );
}
