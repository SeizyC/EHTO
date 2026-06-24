"use client";

import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { OBJECT_CATALOG, type PlazaObjectType, type PlazaState } from "@/lib/plaza-objects";
import { currentBucket, type TimeBucket } from "@/lib/time-of-day";
import { hasEmbed, renderMessage } from "@/lib/message-render";
import { CelestialLayer } from "@/components/plaza/CelestialLayer";

// Shell that adds the downward-pointing triangle tail under any bubble.
// Used by both the idle name tag and the active message bubble so the
// transition between them feels continuous.
function BubbleShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      {children}
      {/* outline triangle */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "100%",
          marginTop: -1,
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "5px solid transparent",
          borderRight: "5px solid transparent",
          borderTop: "6px solid #2A2530",
          pointerEvents: "none",
        }}
      />
      {/* fill triangle (sits 1px above to leave a 1px outline edge) */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "100%",
          marginTop: -2,
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "4px solid transparent",
          borderRight: "4px solid transparent",
          borderTop: "5px solid #1A1720",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

// Cheap stable hash of a character key, used to give each sprite its own
// sway phase so they don't all bob in unison.
function hashKey(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h;
}

// Subtle idle name tag — no border, very low-opacity dark backdrop, faint
// matching tail. The goal: a glance-readable hint that doesn't fight the
// character for attention. Switches to the loud message bubble only when
// the character actually speaks.
function IdleNameTag({ name }: { name: string }) {
  return (
    <div style={{ position: "relative", display: "inline-block", opacity: 0.78 }}>
      <div
        className="rounded-full px-1.5 py-[1px] text-[9px] leading-tight text-white/90"
        style={{
          background: "rgba(0,0,0,0.42)",
          whiteSpace: "nowrap",
          letterSpacing: "0.01em",
        }}
      >
        {name}
      </div>
      {/* Tiny matching tail — same translucent dark. */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "100%",
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "3px solid transparent",
          borderRight: "3px solid transparent",
          borderTop: "4px solid rgba(0,0,0,0.42)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

// Plaza floor band — clicks outside this zone are ignored (no walking off-floor).
// Re-widened 2026-05-31 to match position-drift's 5-95 / 32-82 so the
// user can walk to any spot an AI member might stand. Y_MAX bumped 78
// → 82 (more room at the front edge), X widened 8 → 5 / 92 → 95.
const FLOOR_X_MIN = 5;
const FLOOR_X_MAX = 95;
// Ground band: characters/props stay between these. MIN raised to 42 so the
// top (sky-fade) band is reserved for sky/aerial objects + the back skyline
// of buildings, not roaming people.
const FLOOR_Y_MIN = 42;
const FLOOR_Y_MAX = 88;

// Empty plaza bgs (objects layer on top cleanly) — used in /world and demo.
function emptyBgPath(bucket: TimeBucket): string {
  return `/sprites/rooms/states/empty_${bucket}.png`;
}

// Top-edge sky fade. A time-of-day tint fading down into the floor — gives a
// "sky" region at the top (where the aerial objects live) without new scene
// art. SKY_FADE_PCT is how far down it reaches.
const SKY_FADE_PCT = 40;
// Objects above this y are "aerial" (clouds/balloon/plane/birds) and get a
// slow horizontal drift instead of sitting still.
const SKY_DRIFT_Y = 35;
function skyTopColor(bucket: TimeBucket): string {
  switch (bucket) {
    case "dawn":      return "40, 48, 86";
    case "morning":   return "150, 195, 225";
    case "afternoon": return "132, 182, 214";
    case "evening":   return "52, 40, 64";
    case "night":     return "8, 12, 34";
  }
}

// Lighting filter applied to character/object sprites so they match
// the bg time-of-day. (Sprites are generated under afternoon lighting.)
function lightingFilter(bucket: TimeBucket): string | undefined {
  switch (bucket) {
    case "night":     return "brightness(0.62) saturate(0.85) contrast(1.05)";
    case "evening":   return "brightness(0.88) saturate(1.05)";
    case "dawn":      return "brightness(0.90) saturate(0.95)";
    case "morning":   return undefined;
    case "afternoon": return undefined;
  }
}

// Characters get a *slightly brighter* filter than other plaza objects
// at dim times. Reason: faces become unreadable when objects + characters
// share the same heavy night dimming — but we still want the room to read
// as night. So we push character brightness ~15% higher than the
// environmental dimming while keeping objects deeply lit-for-night.
function characterLightingFilter(bucket: TimeBucket): string | undefined {
  switch (bucket) {
    case "night":     return "brightness(0.78) saturate(0.90) contrast(1.05)";
    case "evening":   return "brightness(0.94) saturate(1.05)";
    case "dawn":      return "brightness(0.96) saturate(0.95)";
    case "morning":   return undefined;
    case "afternoon": return undefined;
  }
}

// Plaza characters use a small fixed % of container height so they
// don't dominate the scene (Habbo-like proportions). Lowered from 18→15
// so 10+ residents fit without overlapping at the new 1200×800 canvas.
//
// This is the "frontmost" baseline — actual rendered height is multiplied
// by perspectiveScale(y) so characters further back appear smaller.
// Character height in % of canvas height. 15 → 12 → 9 → 12
// (2026-05-31): 9% lost too much sprite detail (face/outfit pixels
// crushed). Bumping back to 12% restores legibility while still
// fitting ~34 members in the floor band (target was 30). Object
// catalog gets a paired ×1.33 bump so relative proportions hold.
const CHARACTER_HEIGHT_PCT = 7.5;
// The logical plaza grew ×1.6 (see PLAZA_W/H in world page) to give a larger
// floor to roam; objects are scaled by 1/1.6 so they keep their real size on
// the bigger canvas instead of magnifying with it.
const WORLD_OBJECT_SCALE = 0.625;

// Iso depth cue: items higher up the screen (lower y%) are "further
// away" and render smaller. The floor band is y 40–78 (FLOOR_Y_MIN..MAX),
// so we ramp the multiplier from 0.70 at the back of the floor to 1.00
// at the front. Off-floor items clamp to the nearest band edge.
function perspectiveScale(y: number): number {
  const t = (Math.min(FLOOR_Y_MAX, Math.max(FLOOR_Y_MIN, y)) - FLOOR_Y_MIN) /
            (FLOOR_Y_MAX - FLOOR_Y_MIN);
  return 0.70 + 0.30 * t;
}

export type PlazaCharacter = {
  id: string;
  src: string;
  x: number;     // 0..100 (% of container width)
  y: number;     // 0..100 (% of container height, anchor = bottom-center)
  scale?: number;
  name?: string;
  /** When true, sprite is mirrored horizontally — character faces the other way. */
  flip?: boolean;
  /** Active bubble above the head (only one at a time; older ones go to feed). */
  bubble?: {
    id: string;
    text: string;
    layoutId?: string;
    speakerName?: string;
    /** ms timestamp so the bubble layer can sort newest-on-top. */
    createdAt?: number;
  };
};

type Props = {
  state: PlazaState;
  bgOverride?: string;
  /** Optional override for lighting; defaults to currentBucket() */
  bucket?: TimeBucket;
  characters?: PlazaCharacter[];
  /**
   * Tap-to-move on floor. Receives clamped (x, y) in % of plaza.
   * Clicks outside the floor band are ignored (no callback).
   */
  onFloorClick?: (x: number, y: number) => void;
  /**
   * Tap on a character sprite. Receives the character id. World page
   * uses this to prefill the composer with "@{name} " for @-summon. The
   * character's own click handler calls stopPropagation so the floor
   * tap-to-move never fires when the user actually meant the character.
   */
  onCharacterClick?: (id: string) => void;
  /**
   * Tap on a head bubble — invoked with the speaker's character id so
   * the caller can dismiss that speaker's active bubble. The bubble
   * plays a brief burst animation on exit.
   */
  onBubbleDismiss?: (charId: string) => void;
  /**
   * If omitted, plaza fills its parent's width with aspect 3:2 (height auto).
   * Pass explicit width/height (or aspect-ratio) to override — useful when
   * parent needs the plaza to be larger than the visible scroll container,
   * enabling both-axis swipe scroll.
   */
  style?: React.CSSProperties;
  /**
   * Multiplier applied to all character sizes. PC uses 1.0 (default).
   * Mobile passes ~0.65 because its plaza container is taller (800px
   * fixed) than the PC fluid container (~500-600px), so the same %-based
   * character height produces visibly bigger characters on mobile. The
   * scale lets us normalize the absolute pixel size across devices.
   */
  characterScale?: number;
};

// Layered plaza scene:
//   [bg] (time-of-day or override)
//   [objects] from state.objects, anchored bottom-center, sized by catalog
//   [characters] sized small (CHARACTER_HEIGHT_PCT) to keep Habbo-like proportions
//
// Aspect 3:2 matches generated 1536×1024 backgrounds.
export function PlazaCanvas({
  state,
  bgOverride,
  bucket: bucketProp,
  characters,
  characterScale = 1,
  onFloorClick,
  onCharacterClick,
  onBubbleDismiss,
  style,
}: Props) {
  const bucket = bucketProp ?? currentBucket().id;
  const bg = bgOverride ?? emptyBgPath(bucket);
  const objectFilter = lightingFilter(bucket);
  const charFilter = characterLightingFilter(bucket);
  const [ripple, setRipple] = useState<{ x: number; y: number; key: number } | null>(null);

  // ── Dog wander (client-side drift) ──
  // Dogs are living scenery — stationary placements read as taxidermy.
  // Each wanderable dog gets a small (±~4% x, ±~1.5% y) offset that
  // changes every 8-15s, tweened by CSS transitions on the sprite
  // container. Sleeping retriever stays put (curled up).
  //
  // Client-only state: no DB writes (different clients seeing slightly
  // different dog positions is fine for scenery; the DB row is the
  // canonical "home base"). Cleared on dog list change.
  const wanderableDogs = new Set<PlazaObjectType>([
    "dog_shiba",
    "dog_maltese",
    "dog_dachshund",
  ]);
  const dogIds = state.objects.filter((o) => wanderableDogs.has(o.type as PlazaObjectType)).map((o) => o.id);
  const dogKey = dogIds.join(",");
  const [dogOffsets, setDogOffsets] = useState<Record<string, { dx: number; dy: number }>>({});
  useEffect(() => {
    if (dogIds.length === 0) return;
    const timers: number[] = [];
    const wander = (id: string) => {
      setDogOffsets((prev) => ({
        ...prev,
        [id]: {
          dx: (Math.random() - 0.5) * 8,
          dy: (Math.random() - 0.5) * 3,
        },
      }));
      timers.push(
        window.setTimeout(() => wander(id), 8000 + Math.random() * 7000),
      );
    };
    for (const id of dogIds) {
      timers.push(
        window.setTimeout(() => wander(id), 2000 + Math.random() * 5000),
      );
    }
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dogKey]);

  function handleClick(e: ReactMouseEvent<HTMLDivElement>) {
    if (!onFloorClick) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const x = (px / rect.width) * 100;
    const y = (py / rect.height) * 100;
    if (x < FLOOR_X_MIN || x > FLOOR_X_MAX) return;
    if (y < FLOOR_Y_MIN || y > FLOOR_Y_MAX) return;
    setRipple({ x, y, key: Date.now() });
    window.setTimeout(() => setRipple(null), 650);
    onFloorClick(x, y);
  }

  // Composite render order matters for depth: sort all things by y ascending
  // so items further "back" draw first, closer items overlap on top.
  //
  // Bubbles are NOT in the y-sort. Each character wrapper applies a
  // `transform`, which creates a new CSS stacking context — so a bubble
  // rendered inside the character div can NEVER paint above siblings
  // (like a tall lamp at a closer y) no matter how high its z-index. To
  // keep "most recent speech is always visible" we hoist bubbles into a
  // separate layer rendered AFTER the y-sorted items, positioning each
  // bubble at its speaker's coordinates.
  type Item =
    | { kind: "obj"; key: string; src: string; x: number; y: number; h: number; wandering?: boolean; motion?: "drift" | "fly-bird" | "fly-plane" }
    | {
        kind: "char";
        key: string;
        charId: string;
        src: string;
        x: number; y: number; h: number;
        name?: string;
        flip?: boolean;
        bubble?: { id: string; text: string; layoutId?: string; speakerName?: string; createdAt?: number };
      };

  const items: Item[] = [];
  for (const o of state.objects) {
    // Prefer the enriched fields the API sends (lib/object-catalog DB
    // lookup). For realtime INSERT events the raw row arrives without
    // enrichment — fall back to the OBJECT_CATALOG TS constant which
    // still has every static type. Dynamic types that arrive via
    // realtime before a poll re-enriches are skipped this frame; the
    // 60s safety poll will pull the full payload shortly.
    const meta = OBJECT_CATALOG[o.type as PlazaObjectType];
    const src = o.spriteUrl ?? meta?.src ?? null;
    const nativeH = o.nativeHeightPct ?? meta?.nativeHeightPct ?? null;
    if (!src || nativeH == null) continue;
    // Apply client-side wander offset for wanderable dogs. y also shifts
    // the perspective scale, so we re-derive h from the offset y too.
    const off = dogOffsets[o.id];
    const x = off ? o.x + off.dx : o.x;
    const y = off ? o.y + off.dy : o.y;
    // Aerial motion: birds + planes fly one-way across the sky; clouds +
    // balloons just drift. Classified by label since these live in the sky band.
    let motion: "drift" | "fly-bird" | "fly-plane" | undefined;
    if (y < SKY_DRIFT_Y) {
      const lbl = o.labelKo ?? "";
      motion = /새/.test(lbl) ? "fly-bird" : /비행기|plane/i.test(lbl) ? "fly-plane" : "drift";
    }
    // Pets (dogs/cats) read a touch small at the enlarged plaza scale — give
    // them a gentle size bump. Static pets carry category in OBJECT_CATALOG;
    // curated ones fall back to a label check.
    const isPet =
      OBJECT_CATALOG[o.type as PlazaObjectType]?.category === "pet" ||
      /강아지|고양이|개|냥이|시바|말티즈|리트리버|닥스훈트/.test(o.labelKo ?? "");
    items.push({
      kind: "obj",
      key: `o-${o.id}`,
      src,
      x,
      y,
      // Birds read as a distant flock — a touch smaller than other sky objects.
      h: nativeH * (o.scale ?? 1) * perspectiveScale(y) * WORLD_OBJECT_SCALE * (motion === "fly-bird" ? 0.85 : 1) * (isPet ? 1.4 : 1),
      wandering: !!off,
      motion,
    });
  }
  if (characters) {
    for (const c of characters) {
      items.push({
        kind: "char",
        key: `c-${c.id}`,
        charId: c.id,
        src: c.src,
        x: c.x,
        y: c.y,
        h: CHARACTER_HEIGHT_PCT * (c.scale ?? 1) * perspectiveScale(c.y) * characterScale,
        name: c.name,
        flip: c.flip,
        bubble: c.bubble,
      });
    }
  }
  items.sort((a, b) => a.y - b.y);
  // Sort speaking characters by bubble createdAt ASC — newest last in
  // DOM means newest paints on top when two bubbles visually overlap.
  // Falls back to 0 when the caller didn't set createdAt (legacy).
  const speakingChars = (characters ?? [])
    .filter((c) => c.bubble)
    .sort((a, b) => (a.bubble!.createdAt ?? 0) - (b.bubble!.createdAt ?? 0));

  // ── Bubble anti-overlap stacking ──
  // When two characters stand near each other, their bubbles naturally
  // overlap above their heads and only the topmost (newest) one catches
  // clicks — older bubbles become un-dismissable. We pre-compute each
  // bubble's vertical position with overlap detection: if a bubble's
  // anchor point is too close to a previously-placed bubble (in % of
  // plaza), shift it up enough that the rectangles don't intersect.
  // The result is a small cascading column when characters cluster.
  const BUBBLE_W_PCT = 18;  // approximate bubble width as % of plaza width
  const BUBBLE_H_PCT = 5;   // approximate bubble height as % of plaza height
  const placed: Array<{ x: number; topPct: number }> = [];
  const bubbleTops = new Map<string, number>();
  for (const c of speakingChars) {
    const charH = CHARACTER_HEIGHT_PCT * (c.scale ?? 1) * perspectiveScale(c.y) * characterScale;
    let topPct = c.y - charH; // natural top — above the character's head
    // Keep nudging up until no overlap with already-placed bubbles. The
    // x-distance check uses half-widths from both sides (so total
    // horizontal overlap window = BUBBLE_W_PCT). Cap shifts so a bubble
    // can't escape the plaza ceiling.
    let safety = 8;
    while (safety-- > 0 && placed.some((p) =>
      Math.abs(p.x - c.x) < BUBBLE_W_PCT &&
      Math.abs(p.topPct - topPct) < BUBBLE_H_PCT,
    )) {
      topPct -= BUBBLE_H_PCT;
      if (topPct < 2) break;
    }
    placed.push({ x: c.x, topPct });
    bubbleTops.set(c.id, topPct);
  }

  // Default sizing: fill parent width, aspect 3:2. Caller may override via style.
  const defaultStyle: React.CSSProperties = { width: "100%", aspectRatio: "3 / 2" };

  return (
    <div
      className="relative"
      style={{ ...defaultStyle, ...style, cursor: onFloorClick ? "pointer" : undefined }}
      onClick={handleClick}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={bg}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />

      {/* Top sky fade — tints the upper band into a "sky" the aerial objects
          sit in, fading into the floor below. Above the floor, below items. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0"
        style={{
          height: `${SKY_FADE_PCT}%`,
          background: `linear-gradient(to bottom, rgba(${skyTopColor(bucket)},0.92) 0%, rgba(${skyTopColor(bucket)},0.55) 45%, rgba(${skyTopColor(bucket)},0) 100%)`,
        }}
      >
        {/* Moon (with phase) + occasional shooting star — night/evening. */}
        <CelestialLayer bucket={bucket} />
      </div>

      {/* click ripple feedback */}
      {ripple && (
        <div
          key={ripple.key}
          className="click-ripple absolute"
          style={{ left: `${ripple.x}%`, top: `${ripple.y}%` }}
        />
      )}

        {items.map((it) => (
          <div
            key={it.key}
            onClick={
              it.kind === "char" && onCharacterClick
                ? (e) => {
                    // The user's own avatar must let clicks fall through
                    // to the floor — otherwise clicking on or near your
                    // own character eats the click and you can't move
                    // to that spot. Other characters absorb the click
                    // so floor tap-to-move doesn't double-fire.
                    if (it.charId === "me") return;
                    e.stopPropagation();
                    onCharacterClick(it.charId);
                  }
                : undefined
            }
            style={{
              position: "absolute",
              // Flyers traverse the whole width (driven by margin-left in the
              // plaza-fly keyframe), so they start anchored at the left edge.
              left:
                it.kind === "obj" && (it.motion === "fly-bird" || it.motion === "fly-plane")
                  ? "0%"
                  : `${it.x}%`,
              top: `${it.y}%`,
              height: `${it.h}%`,
              transform: "translate(-50%, -100%)",
              cursor: it.kind === "char" && onCharacterClick ? "pointer" : undefined,
              // Smooth slide when position changes. Characters: 1.2s
              // ease-out (deliberate walk). Wandering dogs: 1.8s ease-
              // in-out (slower, smoother — feels like a relaxed amble).
              transition:
                it.kind === "char"
                  ? "left 1.2s ease-out, top 1.2s ease-out"
                  : it.kind === "obj" && it.wandering
                    ? "left 1.8s ease-in-out, top 1.8s ease-in-out, height 1.8s ease-in-out"
                    : undefined,
              // Aerial motion (margin-left, so it doesn't fight the anchor
              // transform). Birds + planes fly one-way across (plaza-fly);
              // clouds + balloons gently oscillate (plaza-drift). Per-object
              // duration/delay from the key so they don't move in unison.
              animation:
                it.kind !== "obj"
                  ? undefined
                  : it.motion === "fly-bird"
                    ? `plaza-fly ${26000 + (hashKey(it.key) % 6000)}ms linear ${hashKey(it.key) % 6000}ms infinite`
                    : it.motion === "fly-plane"
                      ? `plaza-fly ${36000 + (hashKey(it.key) % 8000)}ms linear ${hashKey(it.key) % 12000}ms infinite`
                      : it.motion === "drift"
                        ? `plaza-drift ${42000 + (hashKey(it.key) % 30000)}ms ease-in-out ${hashKey(it.key) % 9000}ms infinite`
                        : undefined,
            }}
          >
            {/* foot shadow — only for characters, anchors them to the floor */}
            {it.kind === "char" && (
              <div
                className="foot-shadow pointer-events-none absolute"
                style={{
                  left: "50%",
                  bottom: "-4%",
                  width: "75%",
                  height: "10%",
                  transform: "translateX(-50%)",
                }}
              />
            )}

            {/* sprite: sway only for characters, lighting filter matches time bucket.
                Per-character random delay + duration desyncs the bobbing so a
                row of characters doesn't move as a single tide. */}
            <div
              className={(it.kind === "char" ? "animate-sway " : "") + "relative h-full w-full"}
              style={
                it.kind === "char"
                  ? (() => {
                      const h = hashKey(it.key);
                      return {
                        animationDelay: `${h % 2400}ms`,
                        animationDuration: `${2100 + (h % 1300)}ms`,
                      };
                    })()
                  : undefined
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={it.src}
                alt=""
                className="pixelated h-full w-auto"
                style={{
                  imageRendering: "pixelated",
                  objectFit: "contain",
                  // Characters get a slightly brighter filter than objects
                  // at dim times — faces need to stay readable even when
                  // the room reads as night.
                  filter: it.kind === "char" ? charFilter : objectFilter,
                  transform: it.kind === "char" && it.flip ? "scaleX(-1)" : undefined,
                }}
                draggable={false}
              />
              {/* Idle-only label: the active bubble is rendered in the
                  separate top-layer below so it can't be covered by
                  taller foreground items (lamps, trees). */}
              {it.kind === "char" && !it.bubble && it.name && (
                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    bottom: "100%",
                    marginBottom: 8,
                    transform: "translateX(-50%)",
                    pointerEvents: "none",
                  }}
                >
                  <IdleNameTag name={it.name} />
                </div>
              )}
            </div>
        </div>
      ))}

      {/* Bubble layer — rendered AFTER all positional items so it sits at
          the top of the plaza's stacking order regardless of where each
          speaker is on the floor. Within this layer, newer bubbles paint
          last (already sorted) so they sit on top when two overlap.
          AnimatePresence keeps the burst exit alive after the bubble is
          removed from speakingChars. */}
      <AnimatePresence>
        {speakingChars.map((c) => {
          // Use the pre-computed top from the anti-overlap pass above,
          // not the raw "above character head" coordinate. This makes
          // clustered bubbles cascade vertically instead of stacking
          // exactly on top of each other (which made only the newest
          // clickable).
          const topPct = bubbleTops.get(c.id) ?? (c.y - CHARACTER_HEIGHT_PCT);
          const embed = hasEmbed(c.bubble!.text);
          return (
            <motion.div
              key={`bubble-${c.id}`}
              style={{
                position: "absolute",
                left: `${c.x}%`,
                top: `${topPct}%`,
                marginTop: -8,
                zIndex: 50,
                cursor: onBubbleDismiss ? "pointer" : undefined,
              }}
              // x/y as framer-motion props (NOT CSS `transform`) so the
              // -50%/-100% anchor offset composes cleanly with scale +
              // rotate during enter/exit. With a CSS transform string
              // framer-motion would clobber it once the animated scale
              // kicks in, dropping the bubble at the wrong spot.
              initial={{ x: "-50%", y: "-100%", opacity: 0, scale: 0.92 }}
              animate={{ x: "-50%", y: "-100%", opacity: 1, scale: 1 }}
              // Burst exit: scale up + rotate + fade. Quick (~0.28s) so
              // the click feels responsive, not slow.
              exit={{ x: "-50%", y: "-100%", opacity: 0, scale: 1.55, rotate: -3 }}
              transition={{
                duration: 0.2,
                exit: { duration: 0.28, ease: [0.4, 0, 0.2, 1] },
              }}
              onClick={
                onBubbleDismiss
                  ? (e) => {
                      e.stopPropagation();
                      onBubbleDismiss(c.id);
                    }
                  : undefined
              }
            >
              <BubbleShell>
                <motion.div
                  layoutId={c.bubble!.layoutId}
                  className={
                    "border-line bg-surface text-ink rounded-2xl border shadow-[0_4px_14px_-6px_rgba(0,0,0,0.5)] " +
                    (embed ? "p-1.5" : "px-3 py-1.5")
                  }
                  style={{
                    width: embed ? 260 : "max-content",
                    maxWidth: embed ? 280 : 200,
                    whiteSpace: "pre-wrap",
                    wordBreak: "keep-all",
                  }}
                  transition={{
                    layout: { duration: 0.9, ease: [0.22, 1, 0.36, 1] },
                  }}
                >
                  {c.bubble!.speakerName && (
                    <div className="text-sub mb-0.5 text-[10px] font-medium leading-none">
                      {c.bubble!.speakerName}
                    </div>
                  )}
                  <div className="text-ink text-[11.5px] leading-snug">
                    {renderMessage(c.bubble!.text)}
                  </div>
                </motion.div>
              </BubbleShell>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
