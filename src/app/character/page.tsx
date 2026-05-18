"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Character, CreatureFace } from "@/components/Character";
import { Pedestal } from "@/components/Pedestal";
import { useProfile } from "@/lib/profileStore";
import type { CreatureKind, Outfit } from "@/types/world";

const CREATURES: { kind: CreatureKind; label: string }[] = [
  { kind: "cozy_spirit", label: "spirit" },
  { kind: "glitch_robot", label: "glitch" },
  { kind: "floating_ghost", label: "ghost" },
  { kind: "sleepy_blob", label: "blob" },
  { kind: "tiny_monster", label: "monster" },
];

const SHIRTS = ["#2a4ac8", "#c8385a", "#7a4a2a", "#5a7a4a", "#6a3aa8", "#d4a83a", "#3a3a4a"];
const PANTS = ["#1a1f3a", "#3a1a26", "#3a2418", "#2c3a22", "#2c1858", "#5a3e15", "#1a1a26"];
const HATS: { hat: Outfit["hat"]; label: string }[] = [
  { hat: { kind: "none" }, label: "없음" },
  { hat: { kind: "cap", color: "#d4385a" }, label: "cap" },
  { hat: { kind: "beanie", color: "#3a3a4a" }, label: "beanie" },
  { hat: { kind: "halo" }, label: "halo" },
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
    router.replace("/signup");
    return null;
  }

  return (
    <main
      className="mx-auto flex min-h-dvh max-w-[420px] flex-col text-white"
      style={{
        background:
          "linear-gradient(180deg, #ff8a3d 0%, #d96528 38%, #1f1108 56%, #0a0506 100%)",
      }}
    >
      {/* header */}
      <header className="px-5 pt-6 pb-3 text-center">
        <p className="text-[10px] tracking-[0.35em] text-white/75 uppercase">Step 2 / 3</p>
        <h1 className="mt-2 text-[20px] font-semibold drop-shadow-md">
          당신의 모습을 선택하세요
        </h1>
      </header>

      {/* preview stage — fixed height, character on pedestal */}
      <div className="relative mx-auto flex h-[280px] w-full items-end justify-center">
        <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: 38 }}>
          <Character kind={kind} presence="active" outfit={outfit} size={5} />
        </div>
        <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: 4 }}>
          <Pedestal width={180} />
        </div>
      </div>

      {/* bottom control card */}
      <div className="rounded-t-2xl bg-black/65 px-5 pt-5 pb-6 backdrop-blur-sm">
        <Section label="얼굴">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {CREATURES.map((c) => {
              const active = c.kind === kind;
              return (
                <button
                  key={c.kind}
                  type="button"
                  onClick={() => setKind(c.kind)}
                  className={
                    "flex h-[78px] w-[64px] shrink-0 flex-col items-center justify-between rounded-md border px-1 py-1.5 text-[10px] transition " +
                    (active
                      ? "border-sky-300 bg-sky-300/15 text-white"
                      : "border-white/15 bg-white/5 text-white/65 hover:border-white/35")
                  }
                >
                  <div className="grid h-12 w-12 place-items-center">
                    <CreatureFace kind={c.kind} size={3} />
                  </div>
                  <span className="leading-none">{c.label}</span>
                </button>
              );
            })}
          </div>
        </Section>

        <Section label="상의">
          <Swatch values={SHIRTS} value={shirt} onChange={setShirt} />
        </Section>

        <Section label="하의">
          <Swatch values={PANTS} value={pants} onChange={setPants} />
        </Section>

        <Section label="머리 위">
          <div className="grid grid-cols-4 gap-2">
            {HATS.map((h, i) => {
              const active = JSON.stringify(h.hat) === JSON.stringify(hat);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setHat(h.hat)}
                  className={
                    "rounded-md border py-2 text-[11px] transition " +
                    (active
                      ? "border-sky-300 bg-sky-300/15 text-white"
                      : "border-white/15 bg-white/5 text-white/65 hover:border-white/35")
                  }
                >
                  {h.label}
                </button>
              );
            })}
          </div>
        </Section>

        <button
          type="button"
          onClick={() => {
            patch({ creature: kind, outfit });
            router.push("/world");
          }}
          className="mt-6 w-full rounded-md bg-emerald-500 py-3 text-[14px] font-medium tracking-wider text-white shadow-lg shadow-emerald-900/40 transition hover:bg-emerald-400"
        >
          내 세상으로 →
        </button>
      </div>
    </main>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h2 className="mb-2 text-[10px] tracking-[0.3em] text-white/55 uppercase">{label}</h2>
      {children}
    </section>
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
    <div className="flex flex-wrap gap-2">
      {values.map((v) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={
              "h-8 w-8 rounded-md border-2 transition " +
              (active ? "border-white scale-110 shadow-md" : "border-white/15 hover:border-white/50")
            }
            style={{ background: v }}
            aria-label={v}
          />
        );
      })}
    </div>
  );
}
