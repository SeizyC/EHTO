"use client";

import { useCharacter } from "@/lib/character-store";

// Dummy AI members — small set of pre-generated sprites from /public/sprites/hero.
// In V1 the members are static; later they become dynamic World.activeMembers.
const MEMBERS = [
  { id: "mina", name: "민아",  src: "/sprites/hero/test_05.png", x: 18, y: 8,  delay: "0.3s" },
  { id: "joon", name: "준",    src: "/sprites/hero/test_04.png", x: 72, y: 14, delay: "0.7s" },
  { id: "sora", name: "소라",  src: "/sprites/hero/test_02.png", x: 86, y: 4,  delay: "0.0s" },
];

type Props = {
  bubble?: { speakerId: string; text: string };
};

export function SpatialRoom({ bubble }: Props) {
  const me = useCharacter();

  return (
    <div className="spotlight relative h-full w-full overflow-hidden rounded-lg">
      {/* Floor */}
      <div className="bg-accent/25 pointer-events-none absolute bottom-[18%] left-[6%] right-[6%] h-px" />
      <div className="floor-glow pointer-events-none absolute bottom-[14%] left-1/2 h-[24px] w-[80%] -translate-x-1/2 opacity-60" />

      {/* AI Members */}
      {MEMBERS.map((m) => (
        <Figure key={m.id} src={m.src} x={m.x} y={m.y} scale={0.78} delay={m.delay}
                bubble={bubble?.speakerId === m.id ? bubble.text : undefined} name={m.name} />
      ))}

      {/* User character — slightly forward (larger scale) in center-left */}
      {me?.imageUrl ? (
        <Figure src={me.imageUrl} x={44} y={0} scale={1.02} delay="0.4s" name="나" />
      ) : null}
    </div>
  );
}

function Figure({
  src,
  x,
  y,
  scale,
  delay,
  bubble,
  name,
}: {
  src: string;
  x: number;
  y: number;
  scale: number;
  delay: string;
  bubble?: string;
  name?: string;
}) {
  const h = Math.round(240 * scale);
  const w = Math.round(120 * scale);
  return (
    <div
      className="absolute"
      style={{ left: `${x}%`, bottom: `${20 + y}px`, height: h, width: w, animationDelay: delay }}
    >
      <div className="animate-sway relative h-full w-full" style={{ animationDelay: delay }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={name ?? ""}
          className="pixelated h-full w-full object-contain object-bottom"
          draggable={false}
        />
        {bubble && (
          <div className="border-line bg-surface text-ink animate-fade-up absolute -top-2 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-2xl border px-3 py-1.5 text-[12px] shadow-[0_4px_18px_-6px_rgba(0,0,0,0.6)]">
            {bubble}
          </div>
        )}
      </div>
    </div>
  );
}
