"use client";

import { motion } from "framer-motion";

// One-time onboarding coachmark: a 3D-ish cylindrical arrow bobbing above the
// first friend's head with a "tap to chat" nudge. Rendered by PlazaCanvas at
// the friend's position; dismissed once the user taps a friend. Pointer-events
// are off so it never eats the tap it's encouraging.
export function FirstFriendPointer({ label }: { label: string }) {
  return (
    <motion.div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        pointerEvents: "none",
      }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1, y: [0, 7, 0] }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{
        opacity: { duration: 0.4 },
        scale: { duration: 0.4 },
        y: { repeat: Infinity, duration: 1.3, ease: "easeInOut" },
      }}
    >
      {/* Nudge pill */}
      <div className="border-line bg-surface text-ink mb-1 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-[0_4px_14px_-6px_rgba(0,0,0,0.55)]">
        {label}
      </div>

      {/* 3D cylindrical down-arrow: a shaded tube (left-light → right-dark
          gradient fakes the round body) capped by a wide arrowhead. */}
      <div style={{ position: "relative", width: 22, height: 30 }}>
        {/* shaft / cylinder */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: 0,
            transform: "translateX(-50%)",
            width: 13,
            height: 18,
            borderRadius: 7,
            background: "linear-gradient(90deg, #ffe2b0 0%, #ff9d3c 48%, #cf6a16 100%)",
            boxShadow: "0 2px 5px rgba(0,0,0,0.35)",
          }}
        />
        {/* arrowhead */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 0,
            transform: "translateX(-50%)",
            width: 0,
            height: 0,
            borderLeft: "11px solid transparent",
            borderRight: "11px solid transparent",
            borderTop: "13px solid #ff9d3c",
            filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.35))",
          }}
        />
        {/* highlight sliver for extra roundness */}
        <div
          style={{
            position: "absolute",
            left: "calc(50% - 4px)",
            top: 2,
            width: 3,
            height: 13,
            borderRadius: 3,
            background: "rgba(255,255,255,0.55)",
            filter: "blur(0.5px)",
          }}
        />
      </div>
    </motion.div>
  );
}
