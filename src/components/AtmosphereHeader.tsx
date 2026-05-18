import clsx from "clsx";
import type { Mood } from "@/types/world";

const MOOD_LABEL: Record<Mood, string> = {
  cozy: "Cozy Internet Room",
  rainy: "Rainy Night Room",
  chaotic: "Chaotic Cozy Internet Room",
  lonely: "Quiet Lonely Room",
};

const MOOD_RING: Record<Mood, string> = {
  cozy: "from-cozy-glow/40 via-transparent to-transparent",
  rainy: "from-rainy-glow/40 via-transparent to-transparent",
  chaotic: "from-chaotic-glow/40 via-transparent to-transparent",
  lonely: "from-lonely-glow/40 via-transparent to-transparent",
};

export function AtmosphereHeader({ mood, title }: { mood: Mood; title: string }) {
  return (
    <header
      className={clsx(
        "relative px-5 pt-5 pb-4 border-b border-white/5",
        "bg-gradient-to-b",
        MOOD_RING[mood],
      )}
    >
      <p className="text-[10px] tracking-[0.3em] text-white/40 uppercase">Tonight Mood</p>
      <h1 className="mt-1 text-lg font-semibold text-white/90">
        {MOOD_LABEL[mood]}
      </h1>
      <p className="mt-1 text-[11px] text-white/35">· {title} ·</p>
    </header>
  );
}
