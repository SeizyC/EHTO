"use client";

// The *animated* layer of the living plaza — roaming residents, the dog, and
// their speech / video bubbles. Split out of LivingPlaza and loaded lazily
// (dynamic import, ssr:false) only after the page is idle, so framer-motion
// and its per-frame main-thread work stay OUT of the landing's hydration / TBT
// window. The static scene + furniture (the LCP content) live in LivingPlaza
// and paint immediately; the plaza "comes alive" a beat later.

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Locale } from "@/lib/about-content";

// Depth: larger feet-bottom% = further away = lower z-index (painted behind).
// Mirrors the old DOM paint order so residents still pass IN FRONT of nearer
// objects and are OCCLUDED behind further ones (e.g. the fountain), even though
// the actors now mount after — and separately from — the static furniture.
function zFor(y: number): number {
  return Math.round(100 - y);
}

function Shadow({ opacity }: { opacity: number }) {
  if (opacity <= 0) return null;
  return (
    <span
      aria-hidden
      className="absolute bottom-0 left-1/2 -z-10 rounded-[50%]"
      style={{
        width: "66%",
        height: "15%",
        transform: "translate(-50%, 38%)",
        background: "radial-gradient(ellipse at center, rgba(0,0,0,0.5), rgba(0,0,0,0) 70%)",
        opacity,
      }}
    />
  );
}

type Fig = { src: string; y: number; h: number; dur: number; start: number; min: number; max: number };
// Two far-back residents cross the rear walkway (their lanes span the centre
// so they pass BEHIND the fountain via depth order). Rest are mid/front.
const FIGURES: Fig[] = [
  { src: "/sprites/hero/test_01.land.webp", y: 43, h: 11, dur: 3.2, start: 30, min: 18, max: 52 }, // far-back (behind fountain)
  { src: "/sprites/hero/test_05.land.webp", y: 41, h: 11, dur: 3.4, start: 64, min: 48, max: 82 }, // far-back (behind fountain)
  { src: "/sprites/hero/test_02.land.webp", y: 16, h: 14, dur: 2.6, start: 22, min: 16, max: 40 }, // mid-left
  { src: "/sprites/hero/test_04.land.webp", y: 15, h: 14, dur: 2.9, start: 64, min: 56, max: 80 }, // mid-right
  { src: "/sprites/hero/test_03.land.webp", y: 5, h: 17, dur: 2.4, start: 44, min: 34, max: 52 }, // front-left
  { src: "/sprites/hero/test_01.land.webp", y: 4, h: 17, dur: 2.6, start: 64, min: 56, max: 74 }, // front-right
];

const DOG = { src: "/sprites/rooms/objects/dog_maltese_wagging.land.webp", x: 24, y: 3, h: 8 };

// Ambient chat lines + video shares, localized to the visitor's locale so the
// living plaza speaks the same language as the rest of the landing.
const LINES: Record<Locale, string[]> = {
  ko: [
    "오늘 비 올 것 같지 않아?", "그 책 마지막이 진짜야", "커피 한 잔 더?",
    "어제 그 영화 별로였어", "산책 갈 사람?", "오 그거 좋더라",
    "오늘따라 조용하네", "그 노래 다시 듣는 중", "배고프다 진짜",
    "주말에 뭐 해?", "방금 그거 봤어?", "날씨 미쳤다",
    "이 동네 빵집 어디가 맛있지", "고양이 영상 보다 시간 다 감", "다들 점심 뭐 먹음?",
    "그 사람 요즘 잘 지내나", "새 플레이리스트 만들었어", "운동 가야 하는데",
    "ㅋㅋㅋ 그건 좀", "그거 어디서 샀어?",
  ],
  en: [
    "think it's gonna rain?", "that book's ending though", "one more coffee?",
    "that movie last night was meh", "anyone up for a walk?", "oh that was nice",
    "kinda quiet today", "replaying that song again", "i'm so hungry",
    "any plans this weekend?", "did you just see that?", "this weather is insane",
    "best bakery around here?", "lost an hour to cat videos", "what's everyone having for lunch?",
    "wonder how they're doing", "made a new playlist", "i really should work out",
    "lol that's a bit much", "where'd you get that?",
  ],
  ja: [
    "雨降りそうじゃない？", "あの本の結末ガチだった", "コーヒーもう一杯？",
    "昨日のあの映画イマイチ", "散歩行く人？", "あれ良かったよ",
    "今日は静かだね", "あの曲またリピートしてる", "お腹すいた〜",
    "週末なにする？", "今の見た？", "天気やばい",
    "この辺のパン屋どこがいい？", "猫動画で時間溶けた", "みんなお昼なに食べる？",
    "あの人元気かな", "新しいプレイリスト作った", "運動行かなきゃ",
    "www それはちょっと", "それどこで買った？",
  ],
};

const VIDEO_IDS = ["yebNIHKAC4A", "VGnOpZhsPk4", "ImuWa3SJulY", "gdZLi9oWNZg"];
const VIDEO_TITLES: Record<Locale, string[]> = {
  ko: ["이 영상 봐봐 ㅋㅋ", "이 무대 미쳤다 🔥", "요즘 이거 무한반복", "이건 명곡이지"],
  en: ["watch this lol", "this stage is fire 🔥", "on repeat lately", "an absolute classic"],
  ja: ["これ見てw", "このステージやばい🔥", "最近これ無限ループ", "これは名曲"],
};
const VIDEO_FIGS = [2, 3, 4, 5]; // mid/front figures

type Bubble = { id: number; fig: number; kind: "text" | "video"; text: string; thumb?: string };

function Resident({ fig, bubbles, shadow }: { fig: Fig; bubbles: Bubble[]; shadow: number }) {
  const [x, setX] = useState(fig.start);
  // Sprites face RIGHT by default (3/4 view). Heading left → mirror.
  const [faceRight, setFaceRight] = useState(true);
  const [travel, setTravel] = useState(0);
  const xRef = useRef(fig.start);

  useEffect(() => {
    let timer: number;
    const step = () => {
      const cur = xRef.current;
      const target = fig.min + Math.random() * (fig.max - fig.min);
      const t = Math.max(2.5, Math.abs(target - cur) * 0.3);
      if (Math.abs(target - cur) > 0.5) setFaceRight(target > cur); // ignore tiny nudges
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
      style={{ bottom: `${fig.y}%`, height: `${fig.h}%`, x: "-50%", zIndex: zFor(fig.y) }}
      initial={false}
      animate={{ left: `${x}%` }}
      transition={{ duration: travel, ease: "easeInOut" }}
    >
      <motion.div
        className="relative h-full"
        animate={{ y: [0, -5, 0] }}
        transition={{ duration: fig.dur, repeat: Infinity, ease: "easeInOut" }}
      >
        <Shadow opacity={shadow} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fig.src}
          alt=""
          draggable={false}
          loading="lazy"
          className="pixelated h-full w-auto object-contain object-bottom"
          // right = default sprite; left = mirrored
          style={{ transform: `scaleX(${faceRight ? 1 : -1})` }}
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
                  <div className="relative overflow-hidden rounded-md" style={{ aspectRatio: "16 / 9" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={b.thumb} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="flex h-5 w-7 items-center justify-center rounded-md shadow" style={{ background: "#FF0033" }}>
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

function Dog({ shadow }: { shadow: number }) {
  return (
    <motion.div
      className="absolute"
      style={{ left: `${DOG.x}%`, bottom: `${DOG.y}%`, height: `${DOG.h}%`, x: "-50%", zIndex: zFor(DOG.y) }}
      animate={{ y: [0, -2, 0] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
    >
      <Shadow opacity={shadow} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={DOG.src}
        alt=""
        draggable={false}
        loading="lazy"
        className="pixelated h-full w-auto object-contain object-bottom"
      />
    </motion.div>
  );
}

export default function LivingPlazaActors({ locale, shadow }: { locale: Locale; shadow: number }) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  useEffect(() => {
    const lines = LINES[locale];
    const titles = VIDEO_TITLES[locale];
    let seq = 0;
    const allFigs = FIGURES.map((_, i) => i);
    const spawnText = () =>
      setBubbles((prev) => {
        if (prev.length >= 2) return prev;
        const free = allFigs.filter((f) => !prev.some((b) => b.fig === f));
        if (free.length === 0) return prev;
        const fig = free[Math.floor(Math.random() * free.length)];
        const id = ++seq;
        window.setTimeout(() => setBubbles((p) => p.filter((b) => b.id !== id)), 4800);
        return [...prev, { id, fig, kind: "text", text: lines[Math.floor(Math.random() * lines.length)] }];
      });
    const spawnVideo = () =>
      setBubbles((prev) => {
        const fig = VIDEO_FIGS[Math.floor(Math.random() * VIDEO_FIGS.length)];
        const vi = Math.floor(Math.random() * VIDEO_IDS.length);
        const id = ++seq;
        window.setTimeout(() => setBubbles((p) => p.filter((b) => b.id !== id)), 5500);
        return [
          ...prev.filter((b) => b.fig !== fig),
          { id, fig, kind: "video", text: titles[vi], thumb: `https://img.youtube.com/vi/${VIDEO_IDS[vi]}/mqdefault.jpg` },
        ];
      });
    const textIv = setInterval(spawnText, 4000);
    const vidIv = setInterval(spawnVideo, 14000);
    const firstVid = setTimeout(spawnVideo, 6000);
    return () => {
      clearInterval(textIv);
      clearInterval(vidIv);
      clearTimeout(firstVid);
    };
  }, [locale]);

  return (
    <>
      {FIGURES.map((f, i) => (
        <Resident key={`fig-${i}`} fig={f} bubbles={bubbles.filter((b) => b.fig === i)} shadow={shadow} />
      ))}
      <Dog shadow={shadow} />
    </>
  );
}
