"use client";

import { motion } from "framer-motion";

// A wormhole that lies FLAT on the plaza floor, foreshortened to match the
// tiled ground plane (a circle on the ground reads as a wide, short ellipse
// from the plaza's low camera). Direction carries meaning via a cool↔warm
// tone:  left = arrival (cool cyan) · right = departure (warm amber).
//
// Creation reads in two beats so you SEE the rift being made before anyone
// uses it:  (1) a small ring warms up / charges in place, then (2) the circle
// grows to full size, punctuated by a flash + one outward wave. Pure framer-
// motion + CSS. Mount/unmount inside <AnimatePresence> for create/collapse.
export type PortalSide = "left" | "right";

const TONE = {
  left: { mid: "#6fc4e8", glow: "110,200,236" },
  right: { mid: "#e8a766", glow: "236,172,108" },
} as const;

// Beat timing (seconds): warm-up charge, then the grow.
const WARM = 1.4;
const GROW = 0.6;

export function Portal({
  side,
  x,
  y,
  widthPct = 18,
}: {
  /** Cool (left/arrival) vs warm (right/departure) tone. */
  side: PortalSide;
  /** Center x of the floor ellipse, as % of plaza width. */
  x: number;
  /** Floor-contact y (hole center), as % of plaza height. */
  y: number;
  /** Hole width as % of plaza width. Height follows a ~3:1 foreshorten. */
  widthPct?: number;
}) {
  const t = TONE[side];
  const g = (a: number) => `rgba(${t.glow},${a})`;
  return (
    <motion.div
      className="pointer-events-none absolute"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        width: `${widthPct}%`,
        aspectRatio: "3 / 1", // foreshortened floor ellipse — wide and short
        zIndex: 40,
      }}
      // Root only fades in and, on unmount, collapses the whole rift to a point.
      initial={{ x: "-50%", y: "-50%", opacity: 0 }}
      animate={{ x: "-50%", y: "-50%", opacity: 1 }}
      exit={{ x: "-50%", y: "-50%", opacity: 0, scale: 0.35 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Formation wrapper — holds SMALL while it warms up, then grows to full.
          Scaling here drives the whole rift's two-beat creation. */}
      <motion.div
        className="absolute inset-0"
        style={{ transformOrigin: "50% 50%" }}
        initial={{ scale: 0.05 }}
        animate={{ scale: [0.05, 0.24, 0.24, 1] }}
        transition={{
          duration: WARM + GROW,
          times: [0, 0.08, WARM / (WARM + GROW), 1],
          ease: "easeOut",
        }}
      >
        {/* Caustic spill — soft wash of light on the tiles. */}
        <motion.div
          className="absolute rounded-[50%]"
          style={{
            inset: "-40% -14%",
            background: `radial-gradient(50% 50% at 50% 50%, ${g(0.22)}, ${g(0)} 72%)`,
            filter: "blur(10px)",
          }}
          animate={{ opacity: [0.3, 0.5, 0.3] }}
          transition={{ repeat: Infinity, duration: 3.4, ease: "easeInOut" }}
        />

        {/* Dark throat — the hole punched into the ground, soft-edged. */}
        <div
          className="absolute left-1/2 top-1/2 rounded-[50%]"
          style={{
            width: "66%",
            height: "84%",
            transform: "translate(-50%, -50%)",
            background:
              "radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.64) 48%, rgba(0,0,0,0.26) 72%, transparent 88%)",
          }}
        />

        {/* Rim light — thin highlight on the lip, brighter on the FAR edge. */}
        <div
          className="absolute left-1/2 top-1/2 rounded-[50%]"
          style={{
            width: "70%",
            height: "88%",
            transform: "translate(-50%, -50%)",
            background: `radial-gradient(50% 46% at 50% 42%, transparent 60%, ${g(0.45)} 73%, ${g(0)} 85%)`,
            mixBlendMode: "screen",
          }}
        />

        {/* Beat 1 — warming charge: a ring pulsing while the rift gathers,
            before it grows. */}
        <motion.div
          className="absolute left-1/2 top-1/2 rounded-[50%]"
          style={{
            width: "70%",
            height: "86%",
            border: `2px solid ${g(0.9)}`,
            boxShadow: `0 0 10px ${g(0.6)}`,
          }}
          initial={{ x: "-50%", y: "-50%", opacity: 0, scale: 0.9 }}
          animate={{
            x: "-50%",
            y: "-50%",
            opacity: [0, 0.9, 0.3, 0.9, 0.3, 0.95, 0],
            scale: [0.85, 1, 0.94, 1, 0.94, 1.02, 1.05],
          }}
          transition={{ duration: WARM, times: [0, 0.1, 0.28, 0.46, 0.64, 0.84, 1], ease: "easeInOut" }}
        />

        {/* Beat 2 — a single wave rippling outward once the circle is full. */}
        <motion.div
          className="absolute left-1/2 top-1/2 rounded-[50%]"
          style={{
            width: "66%",
            height: "84%",
            border: `2px solid ${g(0.8)}`,
            boxShadow: `0 0 8px ${g(0.5)}`,
          }}
          initial={{ x: "-50%", y: "-50%", scale: 1, opacity: 0 }}
          animate={{ x: "-50%", y: "-50%", scale: 2.3, opacity: [0, 0.7, 0] }}
          transition={{ duration: 1.5, delay: WARM + GROW * 0.7, ease: "easeOut", times: [0, 0.15, 1] }}
        />

        {/* Beat 2 — flash bloom at the moment the rift snaps to full size. */}
        <motion.div
          className="absolute left-1/2 top-1/2 rounded-[50%]"
          style={{
            width: "54%",
            height: "64%",
            background: `radial-gradient(50% 50% at 50% 50%, ${g(0.95)}, ${g(0.3)} 45%, ${g(0)} 72%)`,
            filter: "blur(4px)",
            mixBlendMode: "screen",
          }}
          initial={{ x: "-50%", y: "-50%", scale: 0.5, opacity: 0 }}
          animate={{ x: "-50%", y: "-50%", scale: [0.5, 1.1, 0.9], opacity: [0, 0.95, 0] }}
          transition={{ duration: 0.7, delay: WARM + GROW * 0.55, ease: "easeOut", times: [0, 0.3, 1] }}
        />
      </motion.div>
    </motion.div>
  );
}
