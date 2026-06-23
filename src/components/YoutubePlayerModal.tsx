"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { closeYoutube, useYoutubePlayer } from "@/lib/youtube-player-store";

// Centered, persistent YouTube player. Mounted ONCE per page (world / plaza)
// at the page root — not inside PlazaCanvas (which can render twice for
// responsive layouts). Opening is driven by the youtube-player-store, so a
// thumbnail click anywhere routes here instead of mounting a doomed iframe
// inside an ephemeral speech bubble. Portals to <body> so it overlays the
// whole viewport regardless of where it's mounted.
export function YoutubePlayerModal() {
  const videoId = useYoutubePlayer();

  // Esc to close.
  useEffect(() => {
    if (!videoId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeYoutube(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [videoId]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {videoId && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeYoutube}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4"
        >
          <motion.div
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.94, opacity: 0 }}
            transition={{ type: "tween", duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-[720px]"
            style={{ aspectRatio: "16 / 9" }}
          >
            <iframe
              key={videoId}
              src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
              title="YouTube"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              className="absolute inset-0 h-full w-full rounded-xl"
              style={{ border: 0, background: "#000" }}
            />
            <button
              onClick={closeYoutube}
              aria-label="닫기"
              className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white text-black shadow-lg"
            >
              <svg viewBox="0 0 14 14" width="13" height="13" aria-hidden>
                <path d="M2 2 L12 12 M12 2 L2 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
