"use client";

import { AnimatePresence, motion } from "framer-motion";
import { PixelButton } from "@/components/PixelButton";
import type { ONBOARDING } from "@/lib/onboarding-content";
import { START_GRANT } from "@/lib/ehto";

type WelcomeCopy = (typeof ONBOARDING)["ko"]["welcome"];

// One-time welcome shown on first plaza entry: celebrates, announces the
// starting EHTO grant, and previews what EHTO is for.
export function WelcomeDialog(props: { open: boolean; copy: WelcomeCopy; onClose: () => void }) {
  const { open, copy } = props;
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-5">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }} className="absolute inset-0 bg-black/55"
          />
          <motion.div
            role="dialog" aria-modal="true"
            initial={{ opacity: 0, scale: 0.94, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ type: "tween", duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            className="border-line bg-surface relative w-full max-w-sm rounded-2xl border p-7 text-center shadow-[0_24px_70px_-24px_rgba(0,0,0,0.75)]"
          >
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.08, type: "spring", stiffness: 240, damping: 16 }}
              className="bg-accent/15 text-accent mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full text-[20px] font-semibold"
            >◆</motion.div>
            <h2 className="text-ink text-[20px] font-semibold tracking-[-0.01em]">{copy.title}</h2>
            <p className="text-ink mt-2 text-[15px] leading-relaxed">
              {copy.body.replace("{n}", String(START_GRANT))}
            </p>
            <p className="text-sub mt-2 text-[13px] leading-relaxed">{copy.spendIntro}</p>
            <div className="mt-7">
              <PixelButton variant="primary" size="lg" block onClick={props.onClose}>{copy.cta}</PixelButton>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
