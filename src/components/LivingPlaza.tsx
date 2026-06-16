"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

// Landing hero: a plaza "window" that is already alive when you arrive.
// Shown at the image's natural aspect (no cover-zoom), bright (no heavy
// scrim), with residents that idle-move and sample bubbles that surface and
// fade. Time-of-day art is picked from the visitor's local hour.

const SCENES = {
  morning: "/sprites/rooms/plaza_morning.png",
  afternoon: "/sprites/rooms/plaza_afternoon.png",
  evening: "/sprites/rooms/plaza_evening.png",
  night: "/sprites/rooms/plaza_night.png",
} as const;
type Scene = keyof typeof SCENES;

function sceneForHour(h: number): Scene {
  if (h >= 5 && h < 10) return "morning";
  if (h >= 10 && h < 17) return "afternoon";
  if (h >= 17 && h < 20) return "evening";
  return "night";
}

// x = left %, y = bottom % (on the plaza floor), h = height % of the stage.
// dur/dx tune each resident's idle bob so motion reads organic, not synced.
const FIGURES = [
  { src: "/sprites/hero/test_02.png", x: 16, y: 20, h: 13, dur: 2.6, dx: -3 },
  { src: "/sprites/hero/test_04.png", x: 82, y: 19, h: 14, dur: 2.9, dx: 3 },
  { src: "/sprites/hero/test_01.png", x: 33, y: 11, h: 17, dur: 2.3, dx: -4 },
  { src: "/sprites/hero/test_05.png", x: 65, y: 10, h: 18, dur: 2.7, dx: 4 },
  { src: "/sprites/hero/test_03.png", x: 49, y: 5, h: 21, dur: 2.4, dx: -3 },
];

const LINES = [
  "오늘 비 올 것 같지 않아?",
  "그 책 마지막이 진짜야",
  "커피 한 잔 더?",
  "어제 그 영화 별로였어",
  "산책 갈 사람?",
  "오 그거 좋더라",
  "오늘따라 조용하네",
  "그 노래 다시 듣는 중",
  "배고프다 진짜",
  "주말에 뭐 해?",
];

type Bubble = { id: number; fig: number; text: string };

export function LivingPlaza() {
  const [scene, setScene] = useState<Scene>("afternoon");
  useEffect(() => {
    setScene(sceneForHour(new Date().getHours()));
  }, []);

  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  useEffect(() => {
    let seq = 0;
    const iv = setInterval(() => {
      setBubbles((prev) => {
        if (prev.length >= 3) return prev;
        const fig = Math.floor(Math.random() * FIGURES.length);
        if (prev.some((b) => b.fig === fig)) return prev;
        const text = LINES[Math.floor(Math.random() * LINES.length)];
        const id = ++seq;
        window.setTimeout(
          () => setBubbles((p) => p.filter((b) => b.id !== id)),
          3200,
        );
        return [...prev, { id, fig, text }];
      });
    }, 1500);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-[680px]">
      {/* Plaza shown at natural aspect — full width, never cover-zoomed. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={SCENES[scene]}
        alt=""
        className="pixelated block h-auto w-full"
        draggable={false}
      />

      {FIGURES.map((f, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: `${f.x}%`,
            bottom: `${f.y}%`,
            height: `${f.h}%`,
            transform: "translateX(-50%)",
          }}
        >
          <motion.div
            className="relative h-full"
            animate={{ y: [0, -6, 0], x: [0, f.dx, 0] }}
            transition={{ duration: f.dur, repeat: Infinity, ease: "easeInOut" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={f.src}
              alt=""
              className="pixelated h-full w-auto object-contain object-bottom drop-shadow-[0_3px_6px_rgba(0,0,0,0.35)]"
              draggable={false}
            />
            <AnimatePresence>
              {bubbles
                .filter((b) => b.fig === i)
                .map((b) => (
                  <motion.div
                    key={b.id}
                    initial={{ opacity: 0, y: 6, scale: 0.92 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.28, ease: "easeOut" }}
                    className="border-line bg-panel text-ink absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-xl border px-2.5 py-1 text-[11px] shadow-[0_4px_14px_-4px_rgba(0,0,0,0.55)]"
                  >
                    {b.text}
                  </motion.div>
                ))}
            </AnimatePresence>
          </motion.div>
        </div>
      ))}

      {/* Soft blend of the plaza's bottom edge into the page's dark bg. */}
      <div className="from-bg pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t to-transparent" />
    </div>
  );
}
