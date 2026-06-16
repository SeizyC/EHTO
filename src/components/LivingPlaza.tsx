"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

// Full-bleed "alive on arrival" plaza for the landing hero. Mirrors what
// makes Abeto's Messenger land: an immersive world that is already living
// when you arrive. Uses the shipped plaza art (time-of-day picked from the
// visitor's *local* hour) + character sprites with idle sway and sample
// speech bubbles that surface and fade — the room murmuring, kept calm
// (at most two bubbles at once).

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

// left/bottom in % of the hero, height in % of hero height. Back row is
// smaller + higher (further away); front is bigger + lower (closer).
const FIGURES = [
  { src: "/sprites/hero/test_02.png", x: 16, y: 24, h: 16, delay: "0s" },
  { src: "/sprites/hero/test_04.png", x: 80, y: 23, h: 17, delay: "0.7s" },
  { src: "/sprites/hero/test_01.png", x: 30, y: 15, h: 23, delay: "0.3s" },
  { src: "/sprites/hero/test_05.png", x: 66, y: 14, h: 24, delay: "0.55s" },
  { src: "/sprites/hero/test_03.png", x: 48, y: 9, h: 28, delay: "0.15s" },
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
];

type Bubble = { id: number; fig: number; text: string };

export function LivingPlaza() {
  // Default to afternoon for SSR + first paint (no hydration mismatch),
  // then swap to the visitor's local time-of-day after mount.
  const [scene, setScene] = useState<Scene>("afternoon");
  useEffect(() => {
    setScene(sceneForHour(new Date().getHours()));
  }, []);

  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  useEffect(() => {
    let seq = 0;
    const iv = setInterval(() => {
      setBubbles((prev) => {
        if (prev.length >= 2) return prev;
        const fig = Math.floor(Math.random() * FIGURES.length);
        if (prev.some((b) => b.fig === fig)) return prev;
        const text = LINES[Math.floor(Math.random() * LINES.length)];
        const id = ++seq;
        window.setTimeout(
          () => setBubbles((p) => p.filter((b) => b.id !== id)),
          3600,
        );
        return [...prev, { id, fig, text }];
      });
    }, 2200);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={SCENES[scene]}
        alt=""
        className="pixelated absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />

      {FIGURES.map((f, i) => (
        <div
          key={i}
          className="animate-sway absolute"
          style={{
            left: `${f.x}%`,
            bottom: `${f.y}%`,
            height: `${f.h}%`,
            transform: "translateX(-50%)",
            animationDelay: f.delay,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={f.src}
            alt=""
            className="pixelated h-full w-auto object-contain object-bottom"
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
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="border-line bg-panel/95 text-ink absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-xl border px-2.5 py-1 text-[11px] shadow-[0_4px_14px_-4px_rgba(0,0,0,0.5)]"
                >
                  {b.text}
                </motion.div>
              ))}
          </AnimatePresence>
        </div>
      ))}

      {/* Scrims — moody brand wash + legibility for the overlaid copy. */}
      <div className="from-bg/55 pointer-events-none absolute inset-0 bg-gradient-to-b to-transparent" />
      <div className="from-bg via-bg/55 pointer-events-none absolute inset-0 bg-gradient-to-t to-transparent" />
    </div>
  );
}
