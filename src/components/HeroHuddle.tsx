// Landing-page hero: a small crowd of characters huddled together, facing
// forward. Slight overlap and depth so they feel like a gathering, not a
// lineup. Sprites are reused (only 5 source PNGs) but scattered with
// distinct scale/position/sway delay so the repetition doesn't read.
//
// Each entry: src, scale (depth — smaller = further back), x-offset
// (in % of container), y-offset (px lift above floor), sway delay.

// 5 source sprites, used once each. Layered front-to-back so the
// composition reads as a depth-staggered group of distinct people:
// back row smaller + lifted higher (further away), front row biggest
// at the floor (closest). No repeats — duplicate sprites read as the
// same person twice and break the "small society" feel.
const FIGURES = [
  // back row (smallest, highest)
  { src: "/sprites/hero/test_02.png", scale: 0.42, x: 22, y: 110, delay: "0.0s" },
  { src: "/sprites/hero/test_04.png", scale: 0.46, x: 58, y: 100, delay: "0.7s" },
  // mid row
  { src: "/sprites/hero/test_01.png", scale: 0.68, x:  6, y:  48, delay: "0.3s" },
  { src: "/sprites/hero/test_05.png", scale: 0.72, x: 64, y:  42, delay: "0.6s" },
  // front row (biggest, lowest)
  { src: "/sprites/hero/test_03.png", scale: 1.00, x: 34, y:   0, delay: "0.4s" },
];

export function HeroHuddle() {
  return (
    <div className="spotlight relative mx-auto h-[260px] w-full max-w-[380px] overflow-hidden">
      {FIGURES.map((f, i) => (
        <div
          key={i}
          className="animate-sway absolute"
          style={{
            left: `${f.x}%`,
            bottom: `${20 + f.y}px`,
            // Base 220×110 stays; scale shrinks per-figure for the
            // new "small crowd" feel (was 0.78–1.00, now 0.36–0.68).
            height: `${Math.round(220 * f.scale)}px`,
            width: `${Math.round(110 * f.scale)}px`,
            animationDelay: f.delay,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={f.src}
            alt=""
            className="pixelated h-full w-full object-contain object-bottom"
            draggable={false}
          />
        </div>
      ))}
    </div>
  );
}
