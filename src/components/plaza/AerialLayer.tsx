"use client";

import { useEffect, useState } from "react";

// Intermittent aerial traffic: each type (bird/plane/balloon/cloud) flies
// across ONCE, then can't reappear for ≥12h (persisted per browser). Types
// have different speeds and staggered entry times, so the sky stays calm and
// each pass feels like an event rather than a constant loop. Each pass also
// gets a small random size, so no two crossings look identical.

export type AerialDef = { type: AerialType; sprite: string; heightPct: number };
type AerialType = "bird" | "plane" | "balloon" | "cloud";

// Per-type one-way crossing duration (ms) — different speeds — and sky y%.
const CFG: Record<AerialType, { dur: number; y: number; flock?: boolean }> = {
  bird:    { dur: 16000, y: 12, flock: true }, // quickest
  plane:   { dur: 30000, y: 9 },
  balloon: { dur: 52000, y: 16 },              // slowest, lazy
  cloud:   { dur: 60000, y: 14 },
};
const COOLDOWN_MS = 12 * 3600 * 1000; // ≥12h between passes of the same type

export function classifyAerial(labelKo: string | null | undefined): AerialType | null {
  const l = labelKo ?? "";
  if (/새/.test(l)) return "bird";
  if (/비행기|plane/i.test(l)) return "plane";
  if (/기구/.test(l)) return "balloon";
  if (/구름/.test(l)) return "cloud";
  return null;
}

type Pass = { key: number; scale: number };

export function AerialLayer({ items }: { items: AerialDef[] }) {
  // type → current in-flight pass (null when absent).
  const [flying, setFlying] = useState<Partial<Record<AerialType, Pass>>>({});

  // Key the scheduler on the set of available types so it re-runs only when
  // the catalog actually changes, not on every render.
  const typesKey = items.map((i) => i.type).sort().join(",");

  useEffect(() => {
    const timers: number[] = [];
    for (const it of items) {
      const cfg = CFG[it.type];
      if (!cfg) continue;
      const lsKey = `ehto:aerial:${it.type}`;
      let last = 0;
      try { last = Number(window.localStorage.getItem(lsKey)) || 0; } catch { /* ignore */ }
      if (Date.now() - last < COOLDOWN_MS) continue; // still on cooldown

      // Staggered entry so types don't all arrive together.
      const delay = 8000 + Math.random() * 80000;
      const t = window.setTimeout(() => {
        try { window.localStorage.setItem(lsKey, String(Date.now())); } catch { /* ignore */ }
        const pass: Pass = { key: Date.now(), scale: 0.82 + Math.random() * 0.45 };
        setFlying((f) => ({ ...f, [it.type]: pass }));
        // Remove after the crossing finishes (+ small buffer).
        const clear = window.setTimeout(() => {
          setFlying((f) => { const n = { ...f }; delete n[it.type]; return n; });
        }, cfg.dur + 600);
        timers.push(clear);
      }, delay);
      timers.push(t);
    }
    return () => { for (const t of timers) window.clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typesKey]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {items.map((it) => {
        const pass = flying[it.type];
        if (!pass) return null;
        const cfg = CFG[it.type];
        const h = it.heightPct * 0.625 * 0.7 * pass.scale * (cfg.flock ? 0.85 : 1);
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${it.type}-${pass.key}`}
            src={it.sprite}
            alt=""
            className="pixelated absolute"
            style={{
              top: `${cfg.y}%`,
              left: 0,
              height: `${h}%`,
              width: "auto",
              imageRendering: "pixelated",
              transform: "translate(-50%, -50%)",
              animation: `plaza-fly ${cfg.dur}ms linear forwards`,
            }}
          />
        );
      })}
    </div>
  );
}
