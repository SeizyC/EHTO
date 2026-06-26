"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PixelButton } from "@/components/PixelButton";
import type { ONBOARDING } from "@/lib/onboarding-content";

// Centered result dialog for the /start invite-code step.
//  · success → a warm welcome ("이제 당신만의 광장을 만들어 봅시다") that
//    announces the start; the CTA carries the user into naming their plaza.
//  · fail → a calm "check your code" prompt that returns them to the input.
// Uses the app's motion idiom (backdrop fade 0.18s + dialog ease
// [0.22,1,0.36,1]) and the accent (#E89B6C, "생명의 색") for the success glow.

type StartCopy = (typeof ONBOARDING)["ko"]["start"];

export function StartResultDialog(props: {
  kind: "success" | "fail" | null;
  copy: StartCopy;
  onConfirm: () => void; // success CTA — proceed to plaza naming
  onClose: () => void; // fail dismiss / backdrop
}) {
  const { kind, copy } = props;
  const success = kind === "success";

  // Esc closes (success → proceed, since it's the only forward action).
  useEffect(() => {
    if (!kind) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") (success ? props.onConfirm : props.onClose)();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kind, success, props]);

  return (
    <AnimatePresence>
      {kind && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={success ? undefined : props.onClose}
            className="absolute inset-0 bg-black/55"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ type: "tween", duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            className="border-line bg-surface relative w-full max-w-sm rounded-2xl border p-7 text-center shadow-[0_24px_70px_-24px_rgba(0,0,0,0.75)]"
          >
            {success ? (
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.08, type: "spring", stiffness: 240, damping: 16 }}
                className="border-line mx-auto mb-5 h-24 w-full max-w-[220px] overflow-hidden rounded-xl border shadow-[0_0_30px_-4px_rgba(232,155,108,0.45)]"
              >
                {/* A small plaza sample — a glimpse of the place they're about to build. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/sprites/rooms/plaza_afternoon_thumb.webp"
                  alt=""
                  width={480}
                  height={320}
                  loading="eager"
                  className="pixelated h-full w-full object-cover"
                  draggable={false}
                />
              </motion.div>
            ) : (
              <div className="border-line text-sub mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border text-[22px]">
                !
              </div>
            )}

            <h2 className="text-ink text-[20px] font-semibold tracking-[-0.01em]">
              {success ? copy.okTitle : copy.failTitle}
            </h2>
            <p className="text-sub mt-2 text-[14px] leading-relaxed">
              {success ? copy.okBody : copy.failBody}
            </p>

            <div className="mt-7">
              <PixelButton
                variant={success ? "primary" : "muted"}
                size="lg"
                block
                onClick={success ? props.onConfirm : props.onClose}
              >
                {success ? copy.okCta : copy.failCta}
              </PixelButton>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
