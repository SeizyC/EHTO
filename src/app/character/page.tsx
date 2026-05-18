"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Character } from "@/components/Character";
import { useProfile } from "@/lib/profileStore";
import type { CreatureKind, Outfit } from "@/types/world";

const CREATURES: { kind: CreatureKind; label: string; hint: string }[] = [
  { kind: "cozy_spirit", label: "spirit", hint: "느린 온기" },
  { kind: "glitch_robot", label: "glitch", hint: "깜빡이는 신호" },
  { kind: "floating_ghost", label: "ghost", hint: "조용한 관찰" },
  { kind: "sleepy_blob", label: "blob", hint: "낮은 에너지" },
  { kind: "tiny_monster", label: "monster", hint: "리액션 많음" },
];

const SHIRTS = ["#2a4ac8", "#c8385a", "#7a4a2a", "#5a7a4a", "#6a3aa8", "#d4a83a", "#3a3a4a"];
const PANTS = ["#1a1f3a", "#3a1a26", "#3a2418", "#2c3a22", "#2c1858", "#5a3e15", "#1a1a26"];
const HATS: Outfit["hat"][] = [
  { kind: "none" },
  { kind: "cap", color: "#ffd55a" },
  { kind: "beanie", color: "#d09060" },
  { kind: "halo" },
];

export default function CharacterPage() {
  const router = useRouter();
  const profile = useProfile((s) => s.profile);
  const patch = useProfile((s) => s.patch);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const [kind, setKind] = useState<CreatureKind>(profile?.creature ?? "cozy_spirit");
  const [shirt, setShirt] = useState(profile?.outfit.shirt ?? SHIRTS[0]);
  const [pants, setPants] = useState(profile?.outfit.pants ?? PANTS[0]);
  const [hat, setHat] = useState<Outfit["hat"]>(profile?.outfit.hat ?? { kind: "none" });

  // hydrate from store once on mount
  useEffect(() => {
    if (profile) {
      setKind(profile.creature);
      setShirt(profile.outfit.shirt);
      setPants(profile.outfit.pants);
      setHat(profile.outfit.hat ?? { kind: "none" });
    }
  }, [profile]);

  const outfit: Outfit = useMemo(() => ({ shirt, pants, hat }), [shirt, pants, hat]);

  if (hydrated && !profile) {
    // came here without signup — redirect
    router.replace("/signup");
    return null;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col bg-black text-white/85">
      <header className="px-5 pt-6 pb-3">
        <p className="text-[10px] tracking-[0.3em] text-white/35 uppercase">Step 2 / 3</p>
        <h1 className="mt-1 text-lg">너의 모습을 정해</h1>
        <p className="mt-1 text-[11px] text-white/40">사람 얼굴은 없어. 너는 이 세계 속 존재야.</p>
      </header>

      {/* preview */}
      <div className="relative mx-5 my-3 flex h-52 items-end justify-center overflow-hidden rounded-md border border-white/10 bg-gradient-to-b from-slate-900 to-black">
        <div
          className="absolute inset-x-0 bottom-0 h-16"
          style={{
            background:
              "linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.05) 50%, rgba(0,0,0,0.6) 100%)",
          }}
        />
        <div className="relative pb-4">
          <Character kind={kind} presence="active" outfit={outfit} size={5} ringColor="#7dd3fc" />
        </div>
      </div>

      <section className="px-5 mt-1">
        <h2 className="mb-2 text-[10px] tracking-[0.3em] text-white/40 uppercase">얼굴</h2>
        <div className="grid grid-cols-5 gap-2">
          {CREATURES.map((c) => {
            const active = c.kind === kind;
            return (
              <button
                key={c.kind}
                onClick={() => setKind(c.kind)}
                className={
                  "flex flex-col items-center gap-1 rounded border px-1 py-2 text-[10px] " +
                  (active
                    ? "border-sky-300 bg-sky-300/10 text-white"
                    : "border-white/10 text-white/55 hover:border-white/30")
                }
              >
                <div className="h-10 w-10 flex items-end justify-center">
                  <Character kind={c.kind} presence="active" outfit={outfit} size={2} />
                </div>
                <span>{c.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="px-5 mt-5">
        <h2 className="mb-2 text-[10px] tracking-[0.3em] text-white/40 uppercase">상의</h2>
        <Swatch values={SHIRTS} value={shirt} onChange={setShirt} />
      </section>

      <section className="px-5 mt-4">
        <h2 className="mb-2 text-[10px] tracking-[0.3em] text-white/40 uppercase">하의</h2>
        <Swatch values={PANTS} value={pants} onChange={setPants} />
      </section>

      <section className="px-5 mt-4">
        <h2 className="mb-2 text-[10px] tracking-[0.3em] text-white/40 uppercase">머리 위</h2>
        <div className="flex gap-2">
          {HATS.map((h, i) => {
            const active = JSON.stringify(h) === JSON.stringify(hat);
            return (
              <button
                key={i}
                onClick={() => setHat(h)}
                className={
                  "rounded border px-3 py-2 text-[11px] " +
                  (active ? "border-sky-300 bg-sky-300/10" : "border-white/10 text-white/55")
                }
              >
                {h?.kind === "none" ? "없음" : h?.kind}
              </button>
            );
          })}
        </div>
      </section>

      <div className="px-5 mt-auto pb-8 pt-8">
        <button
          onClick={() => {
            patch({ creature: kind, outfit });
            router.push("/world");
          }}
          className="w-full border border-white/20 bg-white/5 py-3 text-[13px] tracking-widest text-white/90 hover:bg-white/10"
        >
          내 세상으로 →
        </button>
      </div>
    </main>
  );
}

function Swatch({
  values,
  value,
  onChange,
}: {
  values: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex gap-2">
      {values.map((v) => {
        const active = v === value;
        return (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={
              "h-7 w-7 rounded-sm border-2 " +
              (active ? "border-white" : "border-white/15 hover:border-white/40")
            }
            style={{ background: v }}
            aria-label={v}
          />
        );
      })}
    </div>
  );
}
