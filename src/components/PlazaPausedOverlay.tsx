"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useWorld, setWorldPaused } from "@/lib/world-store";

// Covers the plaza viewport while ambient life is paused: dims the scene and
// shows a calm "잠시 쉬는 중" note. Tapping anywhere resumes (and stops the
// energy from sitting idle behind a frozen plaza).
export function PlazaPausedOverlay() {
  const { world } = useWorld();
  const paused = !!world?.paused;

  return (
    <AnimatePresence>
      {paused && (
        <motion.button
          type="button"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={() => void setWorldPaused(false)}
          aria-label="광장 다시 깨우기"
          className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-2.5 bg-black/55 backdrop-blur-[1.5px]"
        >
          <span className="border-line/60 flex h-12 w-12 items-center justify-center rounded-full border bg-white/10">
            <svg viewBox="0 0 16 16" width="18" height="18" fill="#fff" aria-hidden>
              <path d="M5 3.2 L13 8 L5 12.8 Z" />
            </svg>
          </span>
          <span className="text-ink text-[14px] font-medium">잠시 쉬는 중</span>
          <span className="text-sub text-[11.5px]">탭하면 다시 깨어나요</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
