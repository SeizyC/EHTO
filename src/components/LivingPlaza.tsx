"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

// Landing hero: the complete plaza art (with buildings, fountain, benches —
// time-of-day by the visitor's local hour) as the backdrop, with residents
// strolling the OPEN foreground in front of it. Keeping them in the front
// band means they never tunnel through the painted furniture (they're simply
// in front of the whole scene). Depth among residents is by feet-y z-order.
//
// Note: true "walk behind the fountain" occlusion isn't done here — the
// fountain is baked into the backdrop. It would need the fountain overlaid as
// a separate foreground sprite aligned to the baked one.

const ROOM = "/sprites/rooms";
const SCENES = {
  morning: `${ROOM}/plaza_morning.png`,
  afternoon: `${ROOM}/plaza_afternoon.png`,
  evening: `${ROOM}/plaza_evening.png`,
  night: `${ROOM}/plaza_night.png`,
} as const;
type Scene = keyof typeof SCENES;

function sceneForHour(h: number): Scene {
  if (h >= 5 && h < 10) return "morning";
  if (h >= 10 && h < 17) return "afternoon";
  if (h >= 17 && h < 20) return "evening";
  return "night";
}

type Fig = { src: string; y: number; h: number; dur: number; start: number; min: number; max: number };
// All residents live in the open FOREGROUND (low feet-y, central x) so they
// stay in front of the baked fountain/benches and never clip them. Lanes are
// separated within each depth row. Sizes are gently compressed so the nearest
// isn't huge and the farthest isn't tiny.
const FIGURES: Fig[] = [
  { src: "/sprites/hero/test_01.png", y: 22, h: 13, dur: 3.0, start: 34, min: 26, max: 42 }, // far row L
  { src: "/sprites/hero/test_04.png", y: 21, h: 13, dur: 2.9, start: 66, min: 58, max: 74 }, // far row R
  { src: "/sprites/hero/test_02.png", y: 13, h: 15, dur: 2.6, start: 32, min: 24, max: 42 }, // mid row L
  { src: "/sprites/hero/test_05.png", y: 12, h: 15, dur: 2.7, start: 62, min: 54, max: 72 }, // mid row R
  { src: "/sprites/hero/test_03.png", y: 5, h: 17, dur: 2.4, start: 44, min: 36, max: 52 }, // front L
  { src: "/sprites/hero/test_01.png", y: 4, h: 17, dur: 2.5, start: 66, min: 58, max: 74 }, // front R
];

const DOG = { src: `${ROOM}/objects/dog_maltese_wagging.png`, x: 16, y: 2, h: 8 };

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
const VIDEO_FIGS = [3, 4, 5]; // central figures — wider video bubble won't overflow

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
      const t = Math.max(2.5, Math.abs(target - cur) * 0.3);
      setFacing(target >= cur ? 1 : -1);
      setTravel(t);
      setX(target);
      xRef.current = target;
      timer = window.setTimeout(step, t * 1000 + 4500 + Math.random() * 6000);
    };
    timer = window.setTimeout(step, 800 + Math.random() * 3500);
    return () => clearTimeout(timer);
  }, [fig]);

  return (
    <motion.div
      className="absolute"
      style={{ bottom: `${fig.y}%`, height: `${fig.h}%`, x: "-50%" }}
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
          className="pixelated h-full w-auto object-contain object-bottom drop-shadow-[0_3px_6px_rgba(0,0,0,0.4)]"
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
                      <span className="flex h-5 w-7 items-center justify-center rounded-md" style={{ background: "#FF0033" }}>
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

function Dog() {
  return (
    <motion.div
      className="absolute"
      style={{ left: `${DOG.x}%`, bottom: `${DOG.y}%`, height: `${DOG.h}%`, x: "-50%" }}
      animate={{ y: [0, -2, 0] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={DOG.src}
        alt=""
        draggable={false}
        className="pixelated h-full w-auto object-contain object-bottom drop-shadow-[0_2px_5px_rgba(0,0,0,0.4)]"
      />
    </motion.div>
  );
}

function MusicCard() {
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-20">
      <div className="border-line overflow-hidden rounded-2xl border shadow-md" style={{ background: "#141014", maxWidth: 230 }}>
        <div className="flex items-center gap-2 px-2.5 py-1.5">
          <span aria-hidden style={{ color: "#E8C067" }} className="text-[12px] leading-none">♪</span>
          <span className="text-ink shrink-0 text-[11px] font-medium leading-none">하루</span>
          <span className="text-dim text-[10px] leading-none">·</span>
          <span className="text-sub truncate text-[11px] leading-none">밤 산책하기 좋은 곡</span>
          <span className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: "#1DB954" }} aria-hidden>
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
    const allFigs = FIGURES.map((_, i) => i);
    const spawnText = () =>
      setBubbles((prev) => {
        if (prev.length >= 3) return prev;
        const free = allFigs.filter((f) => !prev.some((b) => b.fig === f));
        if (free.length === 0) return prev;
        const fig = free[Math.floor(Math.random() * free.length)];
        const id = ++seq;
        window.setTimeout(() => setBubbles((p) => p.filter((b) => b.id !== id)), 3200);
        return [...prev, { id, fig, kind: "text", text: LINES[Math.floor(Math.random() * LINES.length)] }];
      });
    const spawnVideo = () =>
      setBubbles((prev) => {
        const fig = VIDEO_FIGS[Math.floor(Math.random() * VIDEO_FIGS.length)];
        const id = ++seq;
        window.setTimeout(() => setBubbles((p) => p.filter((b) => b.id !== id)), 5200);
        return [...prev.filter((b) => b.fig !== fig), { id, fig, kind: "video", text: VIDEO_TITLES[Math.floor(Math.random() * VIDEO_TITLES.length)] }];
      });
    const textIv = setInterval(spawnText, 1600);
    const vidIv = setInterval(spawnVideo, 8000);
    const firstVid = setTimeout(spawnVideo, 3500);
    return () => {
      clearInterval(textIv);
      clearInterval(vidIv);
      clearTimeout(firstVid);
    };
  }, []);

  // Residents + dog painted in feet-depth order (further back first).
  const entities = [
    ...FIGURES.map((f, i) => ({
      key: `fig-${i}`,
      y: f.y,
      el: <Resident key={`fig-${i}`} fig={f} bubbles={bubbles.filter((b) => b.fig === i)} />,
    })),
    { key: "dog", y: DOG.y, el: <Dog key="dog" /> },
  ].sort((a, b) => b.y - a.y);

  return (
    <div className="relative mx-auto w-full max-w-[680px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={SCENES[scene]} alt="" className="pixelated block h-auto w-full" draggable={false} />

      {entities.map((e) => e.el)}

      <MusicCard />

      <div className="from-bg pointer-events-none absolute inset-x-0 bottom-0 h-[8%] bg-gradient-to-t to-transparent" />
    </div>
  );
}
