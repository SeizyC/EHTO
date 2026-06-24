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
  const lit = bucket === "evening" ? "#f3d9a6" : "#dfe6fb";
  const shadow = bucket === "evening" ? "#2c2238" : "#0e1738";
  // Shadow disc (same size) slid off the lit disc by illum × size; direction
  // by waxing/waning. illum 1 → fully off (full moon); 0 → covers all (new).
  const shadowDx = (phase.waxing ? -1 : 1) * phase.illum * size;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {/* Moon */}
      <div
        style={{
          position: "absolute",
          top: "16%",
          right: "12%",
          width: size,
          height: size,
          borderRadius: "50%",
          background: lit,
          overflow: "hidden",
          boxShadow: "0 0 20px rgba(220,225,255,0.35)",
          opacity: 0.92,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: shadow,
            transform: `translateX(${shadowDx}px)`,
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
