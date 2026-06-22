"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { Locale } from "@/lib/about-content";
import { type Scene, sceneForHour, sceneSrc } from "@/lib/plaza-scene";

// Landing hero: a layered, living plaza built from sprites (no buildings).
// Empty tiled floor (time-of-day by local hour) + furniture sprites
// (fountain / trees / benches / lamp) + roaming residents + a dog, painted in
// feet-depth order so residents pass IN FRONT of nearer objects and are
// OCCLUDED behind further ones (e.g. the fountain). Daytime scenes get soft
// ground shadows.
//
// PERF: only the STATIC layer here (scene image = LCP + furniture) is rendered
// up front. The animated residents/dog/bubbles (framer-motion, per-frame work)
// live in LivingPlazaActors, dynamically imported and mounted only once the
// page is idle — keeping framer-motion out of the hydration / TBT window.

const LivingPlazaActors = dynamic(() => import("@/components/LivingPlazaActors"), { ssr: false });

const ROOM = "/sprites/rooms";
function shadowFor(scene: Scene): number {
  if (scene === "night") return 0;
  if (scene === "evening") return 0.13;
  return 0.24; // morning / afternoon
}

// Depth: larger feet-bottom% = further away = lower z-index (painted behind).
// Shared scheme with LivingPlazaActors so furniture and residents interleave.
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

type Obj = { key: string; src: string; x: number; y: number; h: number; flip?: boolean };
const OBJECTS: Obj[] = [
  { key: "tree-l", src: `${ROOM}/objects/tree.land.webp`, x: 14, y: 52, h: 27 },
  { key: "tree-r", src: `${ROOM}/objects/tree.land.webp`, x: 87, y: 50, h: 27, flip: true },
  { key: "lamp", src: `${ROOM}/objects/lamp.land.webp`, x: 72, y: 45, h: 26 },
  { key: "fountain", src: `${ROOM}/objects/fountain.land.webp`, x: 50, y: 31, h: 28 },
  { key: "bench-l", src: `${ROOM}/objects/bench.land.webp`, x: 13, y: 13, h: 13 },
  { key: "bench-r", src: `${ROOM}/objects/bench.land.webp`, x: 88, y: 12, h: 13, flip: true },
];

function PlazaObject({ o, shadow }: { o: Obj; shadow: number }) {
  return (
    <div
      className="absolute"
      style={{ left: `${o.x}%`, bottom: `${o.y}%`, height: `${o.h}%`, transform: "translateX(-50%)", zIndex: zFor(o.y) }}
    >
      <Shadow opacity={shadow} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={o.src}
        alt=""
        draggable={false}
        // decorative — keep off the LCP preload flood so the scene image wins
        loading="lazy"
        className="pixelated h-full w-auto object-contain object-bottom"
        style={o.flip ? { transform: "scaleX(-1)" } : undefined}
      />
    </div>
  );
}

const MUSIC: Record<Locale, { who: string; track: string }> = {
  ko: { who: "하루", track: "밤 산책하기 좋은 곡" },
  en: { who: "Haru", track: "perfect for a night walk" },
  ja: { who: "ハル", track: "夜の散歩に合う曲" },
};

function MusicCard({ locale }: { locale: Locale }) {
  const m = MUSIC[locale];
  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-[120]">
      <div className="border-line overflow-hidden rounded-2xl border shadow-md" style={{ background: "#141014", maxWidth: 230 }}>
        <div className="flex items-center gap-2 px-2.5 py-1.5">
          <span aria-hidden style={{ color: "#E8C067" }} className="text-[12px] leading-none">♪</span>
          <span className="text-ink shrink-0 text-[11px] font-medium leading-none">{m.who}</span>
          <span className="text-dim text-[10px] leading-none">·</span>
          <span className="text-sub truncate text-[11px] leading-none">{m.track}</span>
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

export function LivingPlaza({ locale, initialScene = "afternoon" }: { locale: Locale; initialScene?: Scene }) {
  // Server picks the scene from the visitor's country so SSR renders the right
  // background up front. The client then corrects to the device's real local
  // hour — but only AFTER the page is idle (below), never on mount: an early
  // swap changes the LCP background <img> src and added ~1.5s of LCP render
  // delay whenever the SSR country guess differed from the device's hour.
  const [scene, setScene] = useState<Scene>(initialScene);
  const shadow = shadowFor(scene);

  // Once the page is idle (past the LCP / interactivity window): correct the
  // scene to the device's local hour AND bring the plaza to life (framer-motion
  // residents). Both are deferred so neither touches the critical render path.
  const [live, setLive] = useState(false);
  useEffect(() => {
    const wake = () => {
      setScene(sceneForHour(new Date().getHours()));
      setLive(true);
    };
    const ric = (window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }).requestIdleCallback;
    if (ric) {
      const id = ric(wake, { timeout: 2500 });
      return () => (window as typeof window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(wake, 1200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-[680px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={sceneSrc(scene)}
        alt=""
        width={768}
        height={512}
        className="pixelated block h-auto w-full"
        draggable={false}
        // LCP element — prioritize so it isn't queued behind sprites/JS.
        fetchPriority="high"
      />

      {OBJECTS.map((o) => (
        <PlazaObject key={o.key} o={o} shadow={shadow} />
      ))}

      {live && <LivingPlazaActors locale={locale} shadow={shadow} />}

      <MusicCard locale={locale} />

      <div className="from-bg pointer-events-none absolute inset-x-0 bottom-0 z-[110] h-[8%] bg-gradient-to-t to-transparent" />
    </div>
  );
}
