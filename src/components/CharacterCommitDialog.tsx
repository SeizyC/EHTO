"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PixelButton } from "@/components/PixelButton";
import type { ONBOARDING } from "@/lib/onboarding-content";

type CharCopy = (typeof ONBOARDING)["ko"]["character"];

// One-shot character creation gate. Generation is irreversible (no re-roll),
// so this forces a deliberate confirm with a clear warning that later changes
// cost EHTO.
export function CharacterCommitDialog(props: {
  open: boolean;
  copy: CharCopy;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { open, copy } = props;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") props.onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, props]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }} onClick={props.onCancel}
            className="absolute inset-0 bg-black/55"
          />
          <motion.div
            role="dialog" aria-modal="true"
            initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ type: "tween", duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="border-line bg-surface relative w-full max-w-sm rounded-2xl border p-7 text-center shadow-[0_24px_70px_-24px_rgba(0,0,0,0.75)]"
          >
            <div className="border-accent text-accent mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border-2 text-[24px]">!</div>
            <h2 className="text-ink text-[20px] font-semibold tracking-[-0.01em]">{copy.commitTitle}</h2>
            <p className="text-sub mt-2 text-[14px] leading-relaxed">{copy.commitBody}</p>
            <p className="text-sub mt-2 text-[13px] leading-relaxed">{copy.commitNote}</p>
            <div className="mt-7 flex flex-col gap-3">
              <PixelButton variant="primary" size="lg" block onClick={props.onConfirm}>{copy.commitConfirm}</PixelButton>
              <button onClick={props.onCancel} className="text-sub text-center text-[13px] active:opacity-70">{copy.commitCancel}</button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
