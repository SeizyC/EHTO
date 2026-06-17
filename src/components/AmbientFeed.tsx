"use client";

import { motion, AnimatePresence } from "framer-motion";
import { deleteMessage, useChatMessages, type ChatMsg } from "@/lib/chat-store";
import { useMembers } from "@/lib/members-store";
import { useCharacter } from "@/lib/character-store";
import { renderMessage } from "@/lib/message-render";

// Feed = the permanent chat log. EVERY message lives here, in parallel
// with whatever's currently above each speaker's head. The head-bubble
// stays mounted forever; this list separately receives a copy that
// VISIBLY drops from ABOVE (large negative y) into its slot once the
// short reveal delay elapses. There's no layoutId morph — we don't want
// the bubble to teleport here, we want a copy to fall.

export function AmbientFeed() {
  const all = useChatMessages();
  const members = useMembers();
  const me = useCharacter();

  // Prefer the speaker name baked into the message itself (server-joined
  // from members). Fall back to a lookup in members-store if it's loaded,
  // and finally to a generic label so a row is never left nameless.
  const nameOf = (m: ChatMsg): string => {
    if (m.fromCharId === "me") return me?.handle ?? "나";
    if (m.speakerName) return m.speakerName;
    return members.find((mm) => mm.id === m.fromCharId)?.name ?? "누군가";
  };

  // Speaker-on-plaza sync: only show messages from members who are
  // ACTUALLY rendered on the plaza right now. Must mirror the plaza's
  // `visibleMembers` filter exactly (world/page.tsx), not just the
  // members-store output — those differ when activity_weight < 0.3 or
  // status is something other than "active" but not "ghost". System
  // lines and the owner's own lines always pass.
  const plazaIds = new Set(
    members
      .filter((m) => m.activity_weight >= 0.3 && m.status !== "ghost")
      .map((m) => m.id),
  );
  const now = Date.now();
  const visible = all.filter((m) => {
    if (m.typingUntil && m.typingUntil > now) return false;
    if (m.feedRevealAt && m.feedRevealAt > now) return false;
    if (m.kind === "system" || m.kind === "recap") return true;
    if (m.fromCharId === "me") return true;
    return plazaIds.has(m.fromCharId);
  });

  return (
    // overflow-visible + a stacking context so the dropping line shows
    // ABOVE the plaza/composer while it's mid-flight.
    <ul className="relative z-10 flex flex-col gap-2.5">
      <AnimatePresence>
        {visible.slice().reverse().map((m) => (
          <ChatLine key={m.id} m={m} speakerName={nameOf(m)} />
        ))}
      </AnimatePresence>
    </ul>
  );
}

// Local-time chat timestamp:
//   today  → h:MM AM/PM (e.g. 2:23 PM)
//   older  → M/D
// Uses the user's browser timezone; AM/PM forced regardless of locale.
function formatLocalTime(ms: number): string {
  const d = new Date(ms);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  }
  return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
}

function ChatLine({ m, speakerName }: { m: ChatMsg; speakerName: string }) {
  // Hydrated history rows mount silently. Fresh ones drop in from a big
  // negative y — far enough that it clearly originates above the feed
  // area (i.e. from the plaza). Slightly scaled-up start adds to the
  // "falling from afar" cue.
  const isFresh = !m.silentPromote;

  // System notices ("X 님이 입장하셨어요") = important plaza events.
  // Centered, mint accent so they read as quietly notable against the
  // neutral chat log instead of fading into background noise.
  if (m.kind === "system") {
    return (
      <motion.li
        initial={isFresh ? { opacity: 0, y: -10 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="group my-1 flex items-center justify-center gap-1.5 text-[11.5px] font-medium"
        style={{ color: "#7CDFC0" }}
      >
        <span>{m.text}</span>
        <button
          type="button"
          onClick={() => deleteMessage(m.id)}
          aria-label="메시지 삭제"
          className="text-dim hover:text-ink text-[10.5px] leading-none transition"
        >
          ×
        </button>
      </motion.li>
    );
  }

  // Absence recap ("부재 시 요약"). Distinct from system events — softer
  // pill with a leading dot, centered, dim-warm so the eye reads it as
  // "이전에 있었던 일" not "방금 일어난 사건". The dot + pill shape sets
  // it apart from both system notices (mint, no chrome) and chat lines.
  if (m.kind === "recap") {
    return (
      <motion.li
        initial={isFresh ? { opacity: 0, y: -10 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="group my-2 flex items-center justify-center gap-1.5"
      >
        <span
          className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11.5px] leading-none"
          style={{
            color: "#C6B68A",
            borderColor: "rgba(232, 192, 103, 0.28)",
            background: "rgba(232, 192, 103, 0.06)",
          }}
        >
          <span
            aria-hidden
            className="inline-block h-1 w-1 rounded-full"
            style={{ background: "#E8C067" }}
          />
          <span>{m.text}</span>
        </span>
        <button
          type="button"
          onClick={() => deleteMessage(m.id)}
          aria-label="메시지 삭제"
          className="text-dim hover:text-ink text-[10.5px] leading-none transition"
        >
          ×
        </button>
      </motion.li>
    );
  }

  return (
    <motion.li
      initial={isFresh ? { opacity: 0, y: -280, scale: 0.85 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 1.0, ease: [0.22, 1, 0.36, 1] }}
      style={{ willChange: "transform, opacity" }}
      className="text-ink group text-[13px] leading-snug"
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          {speakerName && (
            <span
              className="mr-1.5 text-[12px] font-medium"
              // Owner = soft lavender; AI peers = desaturated neutral gray
              // so the owner's name pops against everyone else's.
              style={{
                color: m.fromCharId === "me" ? "#B5A8D8" : "#8A8A8A",
              }}
            >
              {speakerName}
            </span>
          )}
          <span className="break-words">{renderMessage(m.text)}</span>
        </div>
        <div className="flex shrink-0 items-baseline gap-2">
          <span className="text-dim tabular-nums text-[10.5px]">{formatLocalTime(m.createdAt)}</span>
          {/* Owner is viewing /world (only mount point for AmbientFeed), so
              every chat line — own + AI/NPC — is deletable. RLS policy
              "messages: world owner delete any" enforces server-side. */}
          <button
            type="button"
            onClick={() => deleteMessage(m.id)}
            aria-label="메시지 삭제"
            className="text-dim hover:text-ink text-[10.5px] leading-none transition"
          >
            ×
          </button>
        </div>
      </div>
    </motion.li>
  );
}
