"use client";

// Visual catalog of every plaza object sprite. Used to eyeball:
//   · sprite quality + style consistency across object types
//   · transparent-background correctness (checkered backdrop reveals
//     leftover green or opaque artifacts)
//   · approximate relative sizing (tree should tower; dogs should sit
//     well below a standing character's knee line)
//
// Lives at /demo/objects. Server-side render OK — purely static.

import Link from "next/link";
import { OBJECT_CATALOG, type PlazaObjectType } from "@/lib/plaza-objects";
import { slotsFor } from "@/lib/object-occupy";

// Approximate character height for reference (matches PlazaCanvas's
// CHARACTER_HEIGHT_PCT). Used to scale the demo cards so the relative
// sizes match what the iso plaza actually shows.
const REF_CHAR_HEIGHT_PCT = 15;
const CARD_PX = 200; // each demo card is 200×200

export default function DemoObjectsPage() {
  const types = Object.keys(OBJECT_CATALOG) as PlazaObjectType[];
  return (
    <main className="bg-bg text-ink min-h-dvh px-6 py-8">
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-[22px] font-medium">광장 오브제 카탈로그</h1>
          <p className="text-sub mt-1 text-[12.5px]">
            모든 sprite + 점유 슬롯 개수 + 캐릭터 대비 크기 비교 (15% 기준선)
          </p>
        </div>
        <nav className="flex gap-3 text-[12px]">
          <Link href="/demo/plaza" className="text-sub hover:text-ink transition">
            /demo/plaza
          </Link>
          <Link href="/world" className="text-sub hover:text-ink transition">
            /world
          </Link>
        </nav>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {types.map((type) => {
          const meta = OBJECT_CATALOG[type];
          // Slot count: how many members can park next to this object.
          // slotsFor expects a PlazaObject; pass a stub with placeholder x/y.
          const slotCount = slotsFor({ id: "demo", type, x: 50, y: 50 }).length;
          // The sprite's drawn height inside the card, scaled so a 15%-tall
          // character would appear at half card height (=100px).
          const refPx = CARD_PX * 0.5; // = character render baseline
          const spriteHeight = (refPx * meta.nativeHeightPct) / REF_CHAR_HEIGHT_PCT;
          return (
            <div
              key={type}
              className="border-line bg-surface relative overflow-hidden rounded-xl border"
              style={{ width: CARD_PX, height: CARD_PX + 56 }}
            >
              {/* checkerboard backdrop reveals transparency */}
              <div
                className="absolute"
                style={{
                  inset: 0,
                  height: CARD_PX,
                  backgroundImage: `
                    linear-gradient(45deg, #1f1b25 25%, transparent 25%),
                    linear-gradient(-45deg, #1f1b25 25%, transparent 25%),
                    linear-gradient(45deg, transparent 75%, #1f1b25 75%),
                    linear-gradient(-45deg, transparent 75%, #1f1b25 75%)
                  `,
                  backgroundSize: "16px 16px",
                  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
                  backgroundColor: "#26222d",
                }}
              />
              {/* Reference character height bar — half-card line so eye can
                  judge object size vs a standing character. */}
              <div
                className="pointer-events-none absolute left-2 right-2"
                style={{
                  bottom: 60 + (CARD_PX - refPx) / 2,
                  height: 1,
                  background: "rgba(232, 192, 103, 0.25)",
                }}
              />
              <div
                className="pointer-events-none absolute"
                style={{
                  bottom: 60 + (CARD_PX - refPx) / 2,
                  left: 6,
                  color: "#E8C067",
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  opacity: 0.55,
                }}
              >
                15% (캐릭터 기준)
              </div>
              {/* sprite — bottom-aligned so heights feel grounded */}
              <div
                className="absolute left-1/2 -translate-x-1/2"
                style={{
                  bottom: 56,
                  width: spriteHeight,
                  height: spriteHeight,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={meta.src}
                  alt={meta.label}
                  className="pixelated h-full w-full"
                  style={{
                    imageRendering: "pixelated",
                    objectFit: "contain",
                  }}
                  draggable={false}
                />
              </div>
              {/* meta strip */}
              <div className="absolute inset-x-0 bottom-0 px-3 py-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-ink text-[13px] font-medium">{meta.label}</span>
                  <span className="text-dim text-[10px]">{meta.nativeHeightPct}%</span>
                </div>
                <div className="text-sub mt-0.5 flex items-center gap-2 text-[10.5px]">
                  <span className="font-mono">{type}</span>
                  <span aria-hidden>·</span>
                  <span>slot {slotCount}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <footer className="text-dim mt-8 text-[11px]">
        총 {types.length}종 · 슬롯 = 멤버가 점유할 수 있는 자리 수
      </footer>
    </main>
  );
}
