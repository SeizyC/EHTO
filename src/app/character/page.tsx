"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Character, CreatureFace } from "@/components/Character";
import { Platform } from "@/components/Platform";
import { useProfile } from "@/lib/profileStore";
import type {
  BodyType,
  CreatureKind,
  Outfit,
  OutfitStyle,
} from "@/types/world";

const CREATURES: { kind: CreatureKind; label: string }[] = [
  { kind: "cozy_spirit", label: "spirit" },
  { kind: "glitch_robot", label: "glitch" },
  { kind: "floating_ghost", label: "ghost" },
  { kind: "sleepy_blob", label: "blob" },
  { kind: "tiny_monster", label: "monster" },
];

const BODY_TYPES: { value: BodyType; label: string }[] = [
  { value: "masc", label: "masc" },
  { value: "fem", label: "fem" },
];

const STYLES: { value: OutfitStyle; label: string; emoji?: string }[] = [
  { value: "casual", label: "casual" },
  { value: "suit", label: "suit" },
  { value: "hiphop", label: "hiphop" },
  { value: "dress", label: "dress" },
];

const SHIRTS = ["#2a4ac8", "#c8385a", "#7a4a2a", "#5a7a4a", "#6a3aa8", "#d4a83a", "#3a3a4a", "#1a1a1a"];
const PANTS = ["#1a1f3a", "#3a1a26", "#3a2418", "#2c3a22", "#2c1858", "#5a3e15", "#1a1a26", "#0a0a0a"];
const HAIRS = ["#1f1814", "#3a2418", "#6a3a18", "#d4a83a", "#c8385a", "#7af0ff", "#dfe5ff", "#3a3a4a"];
const ACCENTS = ["#1a1a26", "#c8385a", "#d4a83a", "#7af0ff", "#ff5ec4", "#ffffff"];

const HATS: { hat: Outfit["hat"]; label: string }[] = [
  { hat: { kind: "none" }, label: "없음" },
  { hat: { kind: "cap", color: "#d4385a" }, label: "cap" },
  { hat: { kind: "beanie", color: "#3a3a4a" }, label: "beanie" },
  { hat: { kind: "hood", color: "#1a1a26" }, label: "hood" },
  { hat: { kind: "halo" }, label: "halo" },
];

export default function CharacterPage() {
  const router = useRouter();
  const profile = useProfile((s) => s.profile);
  const patch = useProfile((s) => s.patch);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const [kind, setKind] = useState<CreatureKind>(profile?.creature ?? "cozy_spirit");
  const [bodyType, setBodyType] = useState<BodyType>(profile?.outfit.bodyType ?? "masc");
  const [style, setStyle] = useState<OutfitStyle>(profile?.outfit.style ?? "casual");
  const [shirt, setShirt] = useState(profile?.outfit.shirt ?? SHIRTS[0]);
  const [pants, setPants] = useState(profile?.outfit.pants ?? PANTS[0]);
  const [hair, setHair] = useState<string | undefined>(profile?.outfit.hair ?? HAIRS[0]);
  const [accent, setAccent] = useState(profile?.outfit.accent ?? ACCENTS[1]);
  const [hat, setHat] = useState<Outfit["hat"]>(profile?.outfit.hat ?? { kind: "none" });

  useEffect(() => {
    if (profile) {
      setKind(profile.creature);
      setBodyType(profile.outfit.bodyType ?? "masc");
      setStyle(profile.outfit.style ?? "casual");
      setShirt(profile.outfit.shirt);
      setPants(profile.outfit.pants);
      setHair(profile.outfit.hair ?? HAIRS[0]);
      setAccent(profile.outfit.accent ?? ACCENTS[1]);
      setHat(profile.outfit.hat ?? { kind: "none" });
    }
  }, [profile]);

  // dress is fem-only — clamp
  useEffect(() => {
    if (style === "dress" && bodyType !== "fem") setBodyType("fem");
  }, [style, bodyType]);

  const outfit: Outfit = useMemo(
    () => ({ bodyType, style, shirt, pants, hair, accent, hat }),
    [bodyType, style, shirt, pants, hair, accent, hat],
  );

  if (hydrated && !profile) {
    router.replace("/signup");
    return null;
  }

  return (
    <main
      className="mx-auto flex min-h-dvh max-w-[420px] flex-col text-white"
      style={{
        background:
          "linear-gradient(180deg, #1a3a55 0%, #0e2238 30%, #08111e 60%, #050608 100%)",
      }}
    >
      <header className="px-5 pt-6 pb-3 text-center">
        <p className="text-[10px] tracking-[0.35em] text-white/65 uppercase">Step 2 / 3</p>
        <h1 className="mt-2 text-[20px] font-semibold drop-shadow-md">
          당신의 모습을 선택하세요
        </h1>
      </header>

      {/* preview: round platform + character — Platform first so it sits behind */}
      <div className="relative mx-auto flex h-[290px] w-full items-end justify-center">
        <div className="absolute left-1/2 z-0 -translate-x-1/2" style={{ bottom: -6 }}>
          <Platform width={220} />
        </div>
        <div className="absolute left-1/2 z-10 -translate-x-1/2" style={{ bottom: 28 }}>
          <Character kind={kind} presence="active" outfit={outfit} size={5} />
        </div>
      </div>

      {/* control card */}
      <div className="rounded-t-2xl bg-black/65 px-5 pt-5 pb-7 backdrop-blur-sm">
        {/* body type segmented control */}
        <Section label="체형">
          <div className="grid grid-cols-2 gap-2">
            {BODY_TYPES.map((b) => {
              const active = b.value === bodyType;
              return (
                <button
                  key={b.value}
                  type="button"
                  onClick={() => setBodyType(b.value)}
                  className={pill(active)}
                >
                  {b.label}
                </button>
              );
            })}
          </div>
        </Section>

        <Section label="스타일">
          <div className="grid grid-cols-4 gap-2">
            {STYLES.map((s) => {
              const active = s.value === style;
              const disabled = s.value === "dress" && bodyType !== "fem";
              return (
                <button
                  key={s.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => setStyle(s.value)}
                  className={
                    pill(active) +
                    (disabled ? " opacity-30 cursor-not-allowed" : "")
                  }
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </Section>

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

        <Section label="머리카락">
          <Swatch values={HAIRS} value={hair ?? "#000"} onChange={setHair} />
        </Section>

        <Section label="상의">
          <Swatch values={SHIRTS} value={shirt} onChange={setShirt} />
        </Section>

        <Section label="하의">
          <Swatch values={PANTS} value={pants} onChange={setPants} />
        </Section>

        {(style === "suit" || style === "hiphop") && (
          <Section label={style === "suit" ? "타이" : "체인"}>
            <Swatch values={ACCENTS} value={accent} onChange={setAccent} />
          </Section>
        )}

        <Section label="머리 위">
          <div className="grid grid-cols-5 gap-2">
            {HATS.map((h, i) => {
              const active = JSON.stringify(h.hat) === JSON.stringify(hat);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setHat(h.hat)}
                  className={pill(active) + " text-[10px]"}
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

function pill(active: boolean) {
  return (
    "rounded-md border py-2 text-[11px] transition " +
    (active
      ? "border-sky-300 bg-sky-300/15 text-white"
      : "border-white/15 bg-white/5 text-white/65 hover:border-white/35")
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
