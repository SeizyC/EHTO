"use client";

import type { Locale } from "@/lib/about-content";

// Real in-app visuals for the /about page. Uses the shipped plaza art +
// character sprites (not a screenshot — none can be captured here) to show
// what a plaza actually looks like: a hero scene with a few residents, and a
// time-of-day strip tying to the "the day's texture" copy.

const HEROES = [
  { src: "/sprites/hero/test_03.png", left: "34%", h: "30%" },
  { src: "/sprites/hero/test_01.png", left: "18%", h: "24%" },
  { src: "/sprites/hero/test_05.png", left: "64%", h: "25%" },
];

const TIME_ROW: Array<{ src: string; label: Record<Locale, string> }> = [
  { src: "/sprites/rooms/plaza_morning.png", label: { ko: "아침", en: "Morning", ja: "朝" } },
  { src: "/sprites/rooms/plaza_afternoon.png", label: { ko: "낮", en: "Afternoon", ja: "昼" } },
  { src: "/sprites/rooms/plaza_evening.png", label: { ko: "저녁", en: "Evening", ja: "夕" } },
  { src: "/sprites/rooms/plaza_night.png", label: { ko: "밤", en: "Night", ja: "夜" } },
];

const BUBBLE: Record<Locale, string> = {
  ko: "오늘 좀 선선하다",
  en: "bit cool today",
  ja: "今日は涼しいね",
};

export function PlazaShowcase({ locale }: { locale: Locale }) {
  return (
    <div className="animate-fade-up mb-12">
      {/* Hero scene — a populated plaza */}
      <div
        className="border-line relative w-full overflow-hidden rounded-xl border"
        style={{ aspectRatio: "3 / 2" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/sprites/rooms/plaza_afternoon.png"
          alt="당신의 광장"
          className="pixelated absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />
        {HEROES.map((h, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={h.src}
            alt=""
            draggable={false}
            className="pixelated absolute object-contain object-bottom"
            style={{ left: h.left, bottom: "9%", height: h.h }}
          />
        ))}
        {/* a single sample speech bubble for life */}
        <div
          className="border-line bg-panel/95 text-ink absolute rounded-xl border px-2.5 py-1 text-[11px] shadow-[0_4px_14px_-4px_rgba(0,0,0,0.5)]"
          style={{ left: "40%", bottom: "44%" }}
        >
          {BUBBLE[locale]}
        </div>
      </div>

      {/* Time-of-day strip */}
      <div className="mt-3 grid grid-cols-4 gap-2">
        {TIME_ROW.map((t) => (
          <figure key={t.src}>
            <div
              className="border-line overflow-hidden rounded-md border"
              style={{ aspectRatio: "3 / 2" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={t.src}
                alt=""
                className="pixelated h-full w-full object-cover"
                draggable={false}
              />
            </div>
            <figcaption className="text-dim mt-1 text-center text-[10.5px]">
              {t.label[locale]}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
