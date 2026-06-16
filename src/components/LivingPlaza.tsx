"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

// Landing hero: a plaza "window" that is already alive when you arrive.
// Natural aspect (no cover-zoom), bright. Residents wander the floor (stroll
// to random spots, flipping to face their heading) with an idle bob; a dog
// hangs out; sample text bubbles + the occasional YouTube-share bubble
// surface and fade; a music-share card sits bottom-right like in /world.
// Time-of-day art follows the visitor's local hour.

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

type Fig = {
  src: string;
  y: number; // bottom %, the floor line
  h: number; // height % of the stage
  dur: number; // idle-bob period
  start: number;
  min: number;
  max: number; // roam band (left %)
};
const FIGURES: Fig[] = [
  { src: "/sprites/hero/test_02.png", y: 20, h: 13, dur: 2.6, start: 16, min: 8, max: 34 },
  { src: "/sprites/hero/test_04.png", y: 19, h: 14, dur: 2.9, start: 82, min: 62, max: 92 },
  { src: "/sprites/hero/test_01.png", y: 11, h: 17, dur: 2.3, start: 33, min: 14, max: 48 },
  { src: "/sprites/hero/test_05.png", y: 10, h: 18, dur: 2.7, start: 65, min: 52, max: 86 },
  { src: "/sprites/hero/test_03.png", y: 5, h: 21, dur: 2.4, start: 49, min: 30, max: 70 },
];

const DOG = { src: "/sprites/rooms/objects/dog_maltese_wagging.png", x: 41, y: 3, h: 9 };

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
const VIDEO_TITLES = ["이 무대 미쳤다 🔥", "요즘 이거 무한반복", "이 영상 봐봐 ㅋㅋ", "라이브 미쳤음"];
// figures central enough that a wider video bubble won't overflow the edges
const VIDEO_FIGS = [2, 3, 4];

type Bubble = { id: number; fig: number; kind: "text" | "video"; text: string };

function Resident({ fig, bubbles }: { fig: Fig; bubbles: Bubble[] }) {
  const [x, setX] = useState(fig.start);
  const [facing, setFacing] = useState(1);
  const [travel, setTravel] = useState(0);
  const xRef = useRef(fig.start);

  useEffect(() => {
    let timer: number;
    const step = () => {
      const cur = xRef.current;
      const target = fig.min + Math.random() * (fig.max - fig.min);
      const t = Math.max(2.5, Math.abs(target - cur) * 0.3); // gentle stroll
      setFacing(target >= cur ? 1 : -1);
      setTravel(t);
      setX(target);
      xRef.current = target;
      // long, varied rest between strolls so the plaza feels calm, not busy
      timer = window.setTimeout(step, t * 1000 + 4500 + Math.random() * 6000);
    };
    timer = window.setTimeout(step, 800 + Math.random() * 3500);
    return () => clearTimeout(timer);
  }, [fig]);

  return (
    <motion.div
      className="absolute"
      style={{ bottom: `${fig.y}%`, height: `${fig.h}%`, transform: "translateX(-50%)" }}
      initial={false}
      animate={{ left: `${x}%` }}
      transition={{ duration: travel, ease: "easeInOut" }}
    >
      <motion.div
        className="relative h-full"
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: fig.dur, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fig.src}
          alt=""
          draggable={false}
          className="pixelated h-full w-auto object-contain object-bottom drop-shadow-[0_3px_6px_rgba(0,0,0,0.35)]"
          style={{ transform: `scaleX(${facing})` }}
        />
        <AnimatePresence>
          {bubbles.map((b) => (
            <motion.div
              key={b.id}
              initial={{ opacity: 0, y: 6, scale: 0.92, x: "-50%" }}
              animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
              exit={{ opacity: 0, y: -4, x: "-50%" }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="border-line bg-panel text-ink absolute bottom-full left-1/2 mb-1 rounded-xl border shadow-[0_4px_14px_-4px_rgba(0,0,0,0.55)]"
            >
              {b.kind === "video" ? (
                <div className="w-[140px] p-1.5">
                  <div
                    className="relative overflow-hidden rounded-md"
                    style={{ aspectRatio: "16 / 9", background: "linear-gradient(135deg,#3b2f4d,#5a3a46)" }}
                  >
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span
                        className="flex h-5 w-7 items-center justify-center rounded-md"
                        style={{ background: "#FF0033" }}
                      >
                        <svg viewBox="0 0 12 12" width="9" height="9" fill="#fff" aria-hidden>
                          <path d="M3 2 L3 10 L10 6 Z" />
                        </svg>
                      </span>
                    </span>
                  </div>
                  <p className="text-ink mt-1 truncate px-0.5 text-[10.5px] leading-tight">{b.text}</p>
                </div>
              ) : (
                <span className="block whitespace-nowrap px-2.5 py-1 text-[11px]">{b.text}</span>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}

function MusicCard() {
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-20">
      <div
        className="border-line overflow-hidden rounded-2xl border shadow-md"
        style={{ background: "#141014", maxWidth: 230 }}
      >
        <div className="flex items-center gap-2 px-2.5 py-1.5">
          <span aria-hidden style={{ color: "#E8C067" }} className="text-[12px] leading-none">♪</span>
          <span className="text-ink shrink-0 text-[11px] font-medium leading-none">하루</span>
          <span className="text-dim text-[10px] leading-none">·</span>
          <span className="text-sub truncate text-[11px] leading-none">밤 산책하기 좋은 곡</span>
          <span
            className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
            style={{ background: "#1DB954" }}
            aria-hidden
          >
            <svg viewBox="0 0 12 12" width="9" height="9" fill="#0a0a0a">
              <path d="M2.5 1.5 L2.5 10.5 L10 6 Z" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}

export function LivingPlaza() {
  const [scene, setScene] = useState<Scene>("afternoon");
  useEffect(() => {
    setScene(sceneForHour(new Date().getHours()));
  }, []);

  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  useEffect(() => {
    let seq = 0;
    const spawn = (kind: "text" | "video", figPool: number[], life: number) =>
      setBubbles((prev) => {
        if (prev.length >= 3) return prev;
        const free = figPool.filter((f) => !prev.some((b) => b.fig === f));
        if (free.length === 0) return prev;
        const fig = free[Math.floor(Math.random() * free.length)];
        const text =
          kind === "video"
            ? VIDEO_TITLES[Math.floor(Math.random() * VIDEO_TITLES.length)]
            : LINES[Math.floor(Math.random() * LINES.length)];
        const id = ++seq;
        window.setTimeout(() => setBubbles((p) => p.filter((b) => b.id !== id)), life);
        return [...prev, { id, fig, kind, text }];
      });

    const allFigs = FIGURES.map((_, i) => i);
    const textIv = setInterval(() => spawn("text", allFigs, 3200), 1500);
    const vidIv = setInterval(() => spawn("video", VIDEO_FIGS, 5200), 9000);
    return () => {
      clearInterval(textIv);
      clearInterval(vidIv);
    };
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-[680px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={SCENES[scene]}
        alt=""
        className="pixelated block h-auto w-full"
        draggable={false}
      />

      {/* Dog — placed on the floor with a gentle idle */}
      <motion.div
        className="absolute"
        style={{ left: `${DOG.x}%`, bottom: `${DOG.y}%`, height: `${DOG.h}%`, transform: "translateX(-50%)" }}
        animate={{ y: [0, -2, 0] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={DOG.src}
          alt=""
          draggable={false}
          className="pixelated h-full w-auto object-contain object-bottom drop-shadow-[0_2px_5px_rgba(0,0,0,0.35)]"
        />
      </motion.div>

      {FIGURES.map((f, i) => (
        <Resident key={i} fig={f} bubbles={bubbles.filter((b) => b.fig === i)} />
      ))}

      <MusicCard />

      {/* Thin blend of the plaza's bottom edge into the dark bg — kept low
          so it never reaches the residents' bodies. */}
      <div className="from-bg pointer-events-none absolute inset-x-0 bottom-0 h-[9%] bg-gradient-to-t to-transparent" />
    </div>
  );
}
