"use client";

import { useWorld, setWorldPaused } from "@/lib/world-store";

// Small toggle beside the energy meter: pause the plaza's ambient life (no
// AI chatter, no energy drain) and resume it. Icon-only, owner-controlled —
// an explicit alternative to the implicit "owner went away" mute.
export function PausePlayButton() {
  const { world } = useWorld();
  if (!world) return null;
  const paused = world.paused;

  return (
    <button
      type="button"
      onClick={() => void setWorldPaused(!paused)}
      aria-label={paused ? "광장 다시 재생" : "광장 일시정지"}
      title={paused ? "다시 재생 — 멤버들이 다시 움직여요" : "일시정지 — 에너지 아끼기"}
      className="text-sub hover:text-ink shrink-0 transition"
    >
      {paused ? (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M4.5 3.2 L12.5 8 L4.5 12.8 Z" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <rect x="4" y="3" width="3" height="10" rx="1" />
          <rect x="9" y="3" width="3" height="10" rx="1" />
        </svg>
      )}
    </button>
  );
}
