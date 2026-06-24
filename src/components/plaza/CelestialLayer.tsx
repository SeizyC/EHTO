"use client";

import { useEffect, useState } from "react";
import type { TimeBucket } from "@/lib/time-of-day";

// Night/evening celestial extras drawn INSIDE the sky band (its parent),
// pointer-events-none: a real moon with the current phase (crescent → half →
// full, waxing/waning) and an occasional shooting star. Confined to the sky
// band, so nothing touches the floor. Phase + star scheduling run client-only
// (useEffect) to avoid SSR hydration mismatch.

const SYNODIC = 29.530588853; // days per lunar cycle
function moonPhase(nowMs: number): { illum: number; waxing: boolean } {
  const refDays = Date.UTC(2000, 0, 6, 18, 14) / 86_400_000; // a known new moon
  const frac = (((nowMs / 86_400_000 - refDays) / SYNODIC) % 1 + 1) % 1;
  return { illum: (1 - Math.cos(2 * Math.PI * frac)) / 2, waxing: frac < 0.5 };
}

export function CelestialLayer({ bucket }: { bucket: TimeBucket }) {
  const night = bucket === "night" || bucket === "evening";
  const [phase, setPhase] = useState<{ illum: number; waxing: boolean } | null>(null);
  const [starKey, setStarKey] = useState(0);

  // Resolve the moon phase on the client (date-based).
  useEffect(() => {
    if (!night) { setPhase(null); return; }
    setPhase(moonPhase(Date.now()));
  }, [night]);

  // Schedule occasional shooting stars (re-key to retrigger the CSS streak).
  useEffect(() => {
    if (!night) return;
    let t: number;
    const tick = () => {
      t = window.setTimeout(() => { setStarKey((k) => k + 1); tick(); }, 9000 + Math.random() * 24000);
    };
    tick();
    return () => window.clearTimeout(t);
  }, [night]);

  if (!night || !phase) return null;

  const size = 48;
  const R = size / 2;
  const lit = bucket === "evening" ? "#e3c489" : "#aeb6cf";
  // Carve the shadow as a TRANSPARENT cut (same-size circle) so the dark side
  // shows the sky behind it instead of a dark disc with a visible outline.
  // cutCx: illum 0 → centered (all cut = new); illum 1 → off the disc (full).
  const dir = phase.waxing ? -1 : 1;
  const cutCx = R + dir * phase.illum * 2 * R;
  const mask = `radial-gradient(circle ${R}px at ${cutCx}px ${R}px, transparent 0 ${R - 0.5}px, #000 ${R}px)`;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Moon — lit disc with the shadow masked out (transparent), glow hugs
          the visible crescent via drop-shadow (no full-circle ring). */}
      <div
        style={{
          position: "absolute",
          top: "16%",
          right: "12%",
          width: size,
          height: size,
          borderRadius: "50%",
          background: lit,
          WebkitMaskImage: mask,
          maskImage: mask,
          filter: "drop-shadow(0 0 5px rgba(180,190,225,0.32))",
          opacity: 0.82,
        }}
      />

      {/* Shooting star — re-mounts on key change to replay the streak. */}
      <span
        key={starKey}
        className="plaza-shooting-star"
        style={{ top: `${8 + ((starKey * 17) % 22)}%`, left: `${12 + ((starKey * 31) % 46)}%` }}
      />
    </div>
  );
}
