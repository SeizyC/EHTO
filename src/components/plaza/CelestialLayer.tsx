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

  const size = 34;
  const R = size / 2;
  const lit = bucket === "evening" ? "#e3c489" : "#e4dab4";
  // Carve the shadow as a TRANSPARENT cut (same-size circle) so the dark side
  // shows the sky behind it instead of a dark disc with a visible outline.
  // cutCx: illum 0 → centered (all cut = new); illum 1 → off the disc (full).
  const dir = phase.waxing ? -1 : 1;
  const cutCx = R + dir * phase.illum * 2 * R;
  const mask = `radial-gradient(circle ${R}px at ${cutCx}px ${R}px, transparent 0 ${R - 0.5}px, #000 ${R}px)`;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Moon: a soft glow HALO behind, then the lit disc with the shadow
          masked out. The halo is its own element (a masked element clips its
          own drop-shadow, which is why the glow was invisible before). */}
      <div style={{ position: "absolute", top: "8%", right: "12%", width: size, height: size }}>
        <div
          style={{
            position: "absolute",
            inset: "-38%",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(245,232,175,0.28) 0%, rgba(242,228,165,0.12) 42%, rgba(240,225,160,0) 72%)",
            filter: "blur(2px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: lit,
            WebkitMaskImage: mask,
            maskImage: mask,
            // Tilt the terminator ~15° clockwise so the crescent sits at a
            // natural angle rather than a perfectly vertical cut.
            transform: "rotate(15deg)",
            opacity: 0.92,
          }}
        />
      </div>

      {/* Shooting star — re-mounts on key change to replay the streak. */}
      <span
        key={starKey}
        className="plaza-shooting-star"
        style={{ top: `${8 + ((starKey * 17) % 22)}%`, left: `${12 + ((starKey * 31) % 46)}%` }}
      />
    </div>
  );
}
