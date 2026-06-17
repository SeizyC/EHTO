"use client";

import { useCharacter } from "@/lib/character-store";

type Props = {
  onOpen: () => void;
};

// Tiny portrait of the user's character. Tap → MeSheet.
// background-image gives pixel-perfect control over zoom + focal point.
// The soft gold halo lives in box-shadow directly on the button —
// `overflow-hidden` only clips inner content, not the outer shadow.
export function MeGlyph({ onOpen }: Props) {
  const c = useCharacter();
  return (
    <button
      onClick={onOpen}
      aria-label="나"
      className="border-line bg-panel active:bg-surface relative h-9 w-9 overflow-hidden rounded-full border transition"
      style={{
        ...(c?.imageUrl
          ? {
              backgroundImage: `url(${c.imageUrl})`,
              backgroundRepeat: "no-repeat",
              // Loose head crop: render the source about 2.2× the
              // container's height — enough zoom that the body isn't in
              // the disc, but the WHOLE head (hair + face) still fits.
              backgroundSize: "auto 220%",
              backgroundPosition: "50% 12%",
              imageRendering: "pixelated",
            }
          : null),
        // Soft warm-gold bloom only — no inner rim. Earned/owned currency
        // vibe; matches the ticket accent.
        boxShadow: "0 0 14px 3px rgba(232,192,103,0.30)",
      }}
    >
      {!c?.imageUrl && (
        <span className="text-dim flex h-full w-full items-center justify-center text-[14px]">
          ◯
        </span>
      )}
    </button>
  );
}
