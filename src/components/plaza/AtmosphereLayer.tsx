"use client";

import { motion } from "framer-motion";
import type { TimeBucket } from "@/lib/time-of-day";

// Time-of-day atmosphere drawn ONLY inside the sky band at the very top of
// the canvas, behind every plaza item, pointer-events-none. The band is
// clipped (overflow hidden) and sits well above the floor (FLOOR_Y_MIN=32),
// so clouds/stars/moon can never drape down onto the ground. Day → slow
// clouds; evening/night → stars + moon. Positions are FIXED (no Math.random)
// so SSR markup matches the client — no hydration flicker.

// Height of the sky band as % of the full canvas. Kept under the floor's
// back edge (32%) so nothing overlaps the ground.
const SKY_BAND_PCT = 26;

// Cloud slots — top/left/width as % of the SKY BAND, drift duration (s).
const CLOUDS = [
  { top: 22, left: 12, w: 26, dur: 90 },
  { top: 48, left: 56, w: 20, dur: 70 },
  { top: 14, left: 78, w: 16, dur: 110 },
];

// Star field — [left%, top%] within the sky band. Twinkle with staggered delay.
const STARS = [
  [10, 18], [22, 10], [31, 36], [44, 8], [55, 28], [63, 14], [72, 40],
  [80, 9], [88, 30], [16, 52], [38, 60], [50, 70], [68, 64], [84, 50],
] as const;

export function AtmosphereLayer({ bucket }: { bucket: TimeBucket }) {
  const day = bucket === "morning" || bucket === "afternoon" || bucket === "dawn";
  const night = bucket === "night" || bucket === "evening";

  return (
    <div
      className="pointer-events-none absolute left-0 right-0 top-0 overflow-hidden"
      style={{ height: `${SKY_BAND_PCT}%` }}
      aria-hidden
    >
      {day &&
        CLOUDS.map((c, i) => (
          <motion.div
            key={`cloud-${i}`}
            initial={{ x: 0 }}
            animate={{ x: ["0%", "60%", "0%"] }}
            transition={{ duration: c.dur, repeat: Infinity, ease: "easeInOut" }}
            style={{
              position: "absolute",
              top: `${c.top}%`,
              left: `${c.left}%`,
              width: `${c.w}%`,
              height: `${c.w * 0.5}%`,
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
          {/* Moon — warmer at evening, cool white at deep night. */}
          <div
            style={{
              position: "absolute",
              top: "20%",
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
