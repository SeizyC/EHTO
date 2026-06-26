"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "framer-motion";
import { PlazaCanvas, type PlazaCharacter } from "@/components/PlazaCanvas";
import { Portal } from "@/components/plaza/Portal";
import { PLAZA_PRESETS, type PlazaState, type PlazaObject } from "@/lib/plaza-objects";
import { currentBucket } from "@/lib/time-of-day";
import { browserClient } from "@/lib/supabase";
import type { ObjectType } from "@/lib/object-catalog";

const TIME_BUCKETS = [
  { id: "dawn",      label: "새벽" },
  { id: "morning",   label: "아침" },
  { id: "afternoon", label: "오후" },
  { id: "evening",   label: "저녁" },
  { id: "night",     label: "밤" },
] as const;

// 6 demo characters placed across the plaza floor with intentionally
// small height (CHARACTER_HEIGHT_PCT in PlazaCanvas).
const DEMO_CHARACTERS: PlazaCharacter[] = [
  { id: "1", src: "/sprites/hero/test_01.png", x: 40, y: 78,         name: "민" },
  { id: "2", src: "/sprites/hero/test_02.png", x: 60, y: 80,         name: "소라" },
  { id: "3", src: "/sprites/hero/test_03.png", x: 30, y: 70, scale: 0.92 },
  { id: "4", src: "/sprites/hero/test_04.png", x: 70, y: 72, scale: 0.92, bubble: { id: "demo-b1", text: "여기 분위기 좋네" } },
  { id: "5", src: "/sprites/hero/test_05.png", x: 50, y: 88, scale: 1.06 },
  { id: "6", src: "/sprites/hero/test_01.png", x: 20, y: 84, scale: 1.0 },
];

export default function DemoPlaza() {
  const [presetKey, setPresetKey] = useState<keyof typeof PLAZA_PRESETS>("empty");
  const [bucket, setBucket] = useState<string>(currentBucket().id);
  const [showChars, setShowChars] = useState(true);
  // "전체 카탈로그" mode: lay out every DB object type (static + curated) by
  // category depth band, so curated objects can be eyeballed in-scene without
  // waiting for plaza-grow milestone gates. Admin-only fetch.
  const [catalog, setCatalog] = useState<PlazaState | null>(null);
  const [loadingCat, setLoadingCat] = useState(false);

  // ── Wormhole demo ──
  // left portal = arrival (a friend walks out), right portal = departure
  // (you get swallowed travelling to another plaza). A single "event" friend
  // is driven through PlazaCanvas's normal character slide so the walk in/out
  // reads naturally; the portal sits on top at the edge to mask the spawn/pop.
  const [arrival, setArrival] = useState(false);
  const [departure, setDeparture] = useState(false);
  const [departPos, setDepartPos] = useState<{ x: number; y: number }>({ x: 50, y: 80 });
  const [eventChar, setEventChar] = useState<PlazaCharacter | null>(null);
  const timers = useRef<number[]>([]);

  function clearTimers() {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  }
  const after = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  useEffect(() => () => clearTimers(), []);

  function resetDemo() {
    clearTimers();
    setArrival(false);
    setDeparture(false);
    setEventChar(null);
  }

  // Friend arrives: left rift opens, friend spawns hidden behind it, then
  // walks out onto the floor; rift closes once they're clear.
  function playArrival() {
    clearTimers();
    setDeparture(false);
    setArrival(true);
    // the rift forms FIRST (warm-up → grow, ~2.0s) so you see the wormhole
    // being made, THEN the friend rises out and strolls off slowly.
    after(2050, () => setEventChar({ id: "evt", src: "/sprites/hero/test_02.png", x: 17, y: 77, name: "하루" }));
    after(2900, () => setEventChar((c) => (c ? { ...c, x: 38, y: 80 } : c))); // stroll off after emerging
    after(3700, () => setArrival(false)); // rift closes behind them
  }

  // You leave: a rift opens RIGHT WHERE YOU STAND and you sink into it on the
  // spot — no walking to an edge. The character's smooth exit (fade + shrink
  // to the feet) reads as being drawn down into the wormhole.
  function playDeparture() {
    clearTimers();
    setArrival(false);
    const here = eventChar ?? { id: "evt", src: "/sprites/hero/test_02.png", x: 50, y: 80, name: "하루" };
    setEventChar(here);
    setDepartPos({ x: here.x, y: here.y }); // wormhole opens at my feet
    setDeparture(true);
    // rift forms first (warm-up → grow, ~2.0s), THEN you sink into it in place
    after(2050, () => setEventChar(null));
    after(3200, () => setDeparture(false));
  }

  async function loadCatalog() {
    setLoadingCat(true);
    try {
      const sb = browserClient();
      const { data } = await sb.auth.getSession();
      const r = await fetch("/api/admin/objects", {
        headers: data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {},
      });
      const j = await r.json();
      const types: ObjectType[] = j.types ?? [];
      // Depth band per category (y = feet). Spread EVERY object across its own
      // x lane so tall objects (buildings) never sit on top of a high, small
      // sky object — PlazaCanvas paints low-y first (behind), so shared lanes
      // would hide the back items. Distinct x lanes keep all visible.
      const BAND_Y: Record<string, number> = { sky: 20, building: 58, landmark: 68, prop: 80, pet: 84 };
      const ORDER: Record<string, number> = { sky: 0, building: 1, landmark: 2, prop: 3, pet: 4 };
      const sorted = types.slice().sort((a, b) => (ORDER[a.category] ?? 9) - (ORDER[b.category] ?? 9));
      const n = sorted.length;
      const objects: PlazaObject[] = sorted.map((t, i) => ({
        id: t.id,
        type: t.typeKey,
        x: n <= 1 ? 50 : 8 + (84 * i) / (n - 1),
        y: BAND_Y[t.category] ?? 80,
        spriteUrl: t.variants[0]?.spriteUrl ?? null,
        nativeHeightPct: t.nativeHeightPct,
        labelKo: t.labelKo,
      }));
      setCatalog({ objects });
    } finally {
      setLoadingCat(false);
    }
  }

  const state: PlazaState = catalog ?? PLAZA_PRESETS[presetKey].state;
  // Empty plaza bgs per time-of-day — objects layer on top cleanly without
  // duplicating baked-in furniture (unlike the full plaza_*.png variants).
  const bgPath = `/sprites/rooms/states/empty_${bucket}.png`;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[920px] flex-col px-5 pb-10 pt-6">
      <header className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-sub hover:text-ink text-[13px] transition">
          ← 돌아가기
        </Link>
        <span className="text-sub text-[11px] tracking-[0.22em]">DEMO · PLAZA</span>
      </header>

      <section className="mb-5">
        <h1 className="text-[20px] font-medium leading-snug">광장의 진화</h1>
        <p className="text-sub mt-1 text-[12.5px] leading-relaxed">
          시간대 (bg) × 누적 오브제 (layer) × 캐릭터 시각화 PoC
        </p>
      </section>

      {/* Stage */}
      <section className="border-line overflow-hidden rounded-lg border">
        <div className="relative">
          <PlazaCanvas
            state={state}
            bgOverride={bgPath}
            bucket={bucket as "dawn" | "morning" | "afternoon" | "evening" | "night"}
            characters={[
              ...(showChars ? DEMO_CHARACTERS : []),
              ...(eventChar ? [eventChar] : []),
            ]}
            walkMs={4000}
          />
          {/* Wormhole overlay — floor portals near the left/right edges. */}
          <div className="pointer-events-none absolute inset-0">
            <AnimatePresence>
              {arrival && <Portal key="arrival" side="left" x={17} y={77} />}
              {departure && <Portal key="departure" side="right" x={departPos.x} y={departPos.y} />}
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* Controls */}
      <section className="mt-6 space-y-5">
        <ControlRow label="누적 상태">
          {Object.entries(PLAZA_PRESETS).map(([key, preset]) => (
            <Pill
              key={key}
              active={key === presetKey && !catalog}
              onClick={() => { setCatalog(null); setPresetKey(key as keyof typeof PLAZA_PRESETS); }}
            >
              {preset.label}
            </Pill>
          ))}
          <Pill active={!!catalog} onClick={loadCatalog}>
            {loadingCat ? "불러오는 중…" : "전체 카탈로그"}
          </Pill>
        </ControlRow>

        <ControlRow label="시간대">
          {TIME_BUCKETS.map((b) => (
            <Pill key={b.id} active={b.id === bucket} onClick={() => setBucket(b.id)}>
              {b.label}
            </Pill>
          ))}
        </ControlRow>

        <ControlRow label="캐릭터">
          <Pill active={showChars} onClick={() => setShowChars(true)}>표시</Pill>
          <Pill active={!showChars} onClick={() => setShowChars(false)}>숨기기</Pill>
        </ControlRow>

        <ControlRow label="웜홀">
          <Pill active={arrival} onClick={playArrival}>친구 등장 (좌·쿨)</Pill>
          <Pill active={departure} onClick={playDeparture}>내가 이동 (우·웜)</Pill>
          <Pill active={false} onClick={resetDemo}>리셋</Pill>
        </ControlRow>

        <p className="text-sub text-[11px] leading-relaxed">
          오브제 수: <span className="text-ink">{state.objects.length}</span> ·
          현재 KST bucket: <span className="text-ink">{currentBucket().id}</span> ·
          이 데모는 누적 카운트 트리거 (Tier 0) 까지의 시각화. 채팅 의미 분석 (Tier 1–3) 은 M5 이후.
        </p>
      </section>
    </main>
  );
}

function ControlRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-sub mb-2 text-[10px] uppercase tracking-[0.22em]">{label}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "rounded-full border px-4 py-2 text-[12.5px] transition",
        active
          ? "border-ink bg-ink text-bg"
          : "border-line text-sub hover:border-dim active:bg-panel",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
