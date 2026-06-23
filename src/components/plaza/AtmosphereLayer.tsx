"use client";

import { motion } from "framer-motion";
import type { TimeBucket } from "@/lib/time-of-day";

// Time-of-day atmosphere drawn over the scene's sky band (top ~38%), behind
// every plaza item. Pure CSS/gradients + framer drift — no assets, no clicks.
// Day → slow clouds; evening/night → stars + moon. Positions are FIXED
// (no Math.random) so the SSR'd markup matches the client and there's no
// hydration flicker; only the drift/twinkle animate on the client.

// Fixed cloud slots: top/left in %, scale, and a drift duration (s).
const CLOUDS = [
  { top: 8, left: 12, w: 120, dur: 90 },
  { top: 16, left: 58, w: 90, dur: 70 },
  { top: 5, left: 78, w: 70, dur: 110 },
];

// Fixed star field (top band). Each twinkles with a staggered delay.
const STARS = [
  [10, 14], [22, 8], [31, 20], [44, 6], [55, 16], [63, 10], [72, 22],
  [80, 7], [88, 18], [16, 26], [38, 28], [50, 30], [68, 30], [84, 27],
] as const;

export function AtmosphereLayer({ bucket }: { bucket: TimeBucket }) {
  const day = bucket === "morning" || bucket === "afternoon" || bucket === "dawn";
  const night = bucket === "night" || bucket === "evening";

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {day &&
        CLOUDS.map((c, i) => (
          <motion.div
            key={`cloud-${i}`}
            initial={{ x: 0 }}
            animate={{ x: [0, 26, 0] }}
            transition={{ duration: c.dur, repeat: Infinity, ease: "easeInOut" }}
            style={{
              position: "absolute",
              top: `${c.top}%`,
              left: `${c.left}%`,
              width: c.w,
              height: c.w * 0.42,
              borderRadius: "50%",
              background:
                "radial-gradient(closest-side, rgba(255,255,255,0.55), rgba(255,255,255,0.18) 60%, transparent 72%)",
              filter: "blur(2px)",
              opacity: bucket === "dawn" ? 0.5 : 0.8,
            }}
          />
        ))}

      {night && (
        <>
          {STARS.map(([left, top], i) => (
            <motion.span
              key={`star-${i}`}
              initial={{ opacity: 0.35 }}
              animate={{ opacity: [0.35, 0.95, 0.35] }}
              transition={{ duration: 3 + (i % 4), repeat: Infinity, delay: (i % 7) * 0.4, ease: "easeInOut" }}
              style={{
                position: "absolute",
                top: `${top}%`,
                left: `${left}%`,
                width: i % 3 === 0 ? 3 : 2,
                height: i % 3 === 0 ? 3 : 2,
                borderRadius: "50%",
                background: "#fff",
                boxShadow: "0 0 4px rgba(255,255,255,0.8)",
              }}
            />
          ))}
          {/* Moon — softer/warmer at evening, cool white at deep night. */}
          <div
            style={{
              position: "absolute",
              top: "9%",
              right: "12%",
              width: 46,
              height: 46,
              borderRadius: "50%",
              background:
                bucket === "evening"
                  ? "radial-gradient(circle at 38% 38%, #ffe8c4, #f3c98a 70%, transparent 74%)"
                  : "radial-gradient(circle at 38% 38%, #fdfdff, #cdd6ef 70%, transparent 74%)",
              boxShadow: "0 0 24px rgba(220,225,255,0.45)",
              opacity: 0.9,
            }}
          />
        </>
      )}
    </div>
  );
}
