// Plaza object catalog + state model.
//
// Layered render: background (time-of-day) + objects[] + characters.
// Objects are transparent PNG sprites in /public/sprites/rooms/objects/.
//
// Each placement = { type, x, y, scale }:
//   x, y are % of container (anchor = object's bottom-center at this point)
//   nativeH (in catalog) = object's display height as % of container

export type PlazaObjectType =
  | "fountain"
  | "bench"
  | "planter"
  | "lamp"
  | "tree"
  | "dog_shiba"
  | "dog_maltese"
  | "dog_retriever"
  | "dog_dachshund";

export type PlazaObject = {
  id: string;       // unique placement id
  type: PlazaObjectType | string;  // PlazaObjectType for legacy enum, string ('dyn_…') for catalog types
  x: number;        // 0..100 (% of bg width, anchor=bottom-center)
  y: number;        // 0..100 (% of bg height, anchor=bottom-center)
  scale?: number;   // multiplier (default 1)
  // Catalog-resolved render metadata. Server fills these from
  // object_types + object_variants (lib/object-catalog.ts) so the
  // client doesn't need OBJECT_CATALOG at runtime — that constant is
  // kept only as the bootstrap source of truth.
  spriteUrl?: string | null;
  nativeHeightPct?: number | null;
  labelKo?: string | null;
  typeId?: string | null;
  variantId?: string | null;
};

type CatalogEntry = {
  src: string;
  nativeHeightPct: number; // display height as % of container
  label: string;
  /** Free-form topic tags. Used by plaza-grow when choosing among
   *  similarly-sized alternates to bias toward items aligned with the
   *  user's implicit preferences. Empty means "no signal" — falls
   *  through to milestone default. */
  topics?: string[];
};

// nativeHeightPct = display height as % of plaza container, measured at
// the FRONTMOST y position (perspectiveScale=1.0). Items placed further
// back scale down via perspectiveScale(y) in PlazaCanvas.
//
// Tuned for Habbo-style CHUNKY proportions — props should read as
// substantial pieces of the room, not realistic-tiny garden furniture.
// Relative to the current 12%-tall character at the same y (latest
// pass 2026-05-31: char 9 → 12 to restore sprite detail, objects got
// ×1.33 paired bump so prior ratios hold):
//   bench    ~1.0× char  →  visible enough to sit on, not towering
//   planter  ~0.7× char  →  chunky decorative pot, knee/hip height
//   fountain ~2.0× char  →  focal feature, taller than people
//   lamp     ~2.8× char  →  street lamp towers
//   tree     ~3.7× char  →  tallest thing in the plaza
export const OBJECT_CATALOG: Record<PlazaObjectType, CatalogEntry> = {
  fountain: { src: "/sprites/rooms/objects/fountain.png", nativeHeightPct: 24,  label: "분수대", topics: ["중앙", "공공", "클래식"] },
  bench:    { src: "/sprites/rooms/objects/bench.png",    nativeHeightPct: 12,  label: "벤치",   topics: ["휴식", "독서", "대화"] },
  planter:  { src: "/sprites/rooms/objects/planter.png",  nativeHeightPct: 8.5, label: "화분",   topics: ["식물", "소소함"] },
  lamp:     { src: "/sprites/rooms/objects/lamp.png",     nativeHeightPct: 33,  label: "가로등", topics: ["밤", "분위기", "거리"] },
  tree:     { src: "/sprites/rooms/objects/tree.png",     nativeHeightPct: 44,  label: "나무",   topics: ["자연", "계절", "쉼"] },
  // Dogs — ~0.35× character (was 0.55× — felt "huge dog" 2026-05-31).
  // Sleeping retriever stays a tick shorter (curled up posture).
  dog_shiba:     { src: "/sprites/rooms/objects/dog_shiba_sitting.png",      nativeHeightPct: 4.5, label: "시바",     topics: ["반려", "활기", "귀여움"] },
  dog_maltese:   { src: "/sprites/rooms/objects/dog_maltese_wagging.png",    nativeHeightPct: 4.5, label: "말티즈",   topics: ["반려", "귀여움"] },
  dog_retriever: { src: "/sprites/rooms/objects/dog_retriever_sleeping.png", nativeHeightPct: 3,   label: "리트리버", topics: ["반려", "쉼"] },
  dog_dachshund: { src: "/sprites/rooms/objects/dog_dachshund_standing.png", nativeHeightPct: 4.5, label: "닥스훈트", topics: ["반려", "귀여움"] },
};

export type PlazaState = {
  objects: PlazaObject[];
};

// Demo / fixture presets — used until chat accumulation drives state for real.
export const PLAZA_PRESETS: Record<string, { label: string; state: PlazaState }> = {
  empty: {
    label: "빈 광장 (Day 1)",
    state: { objects: [] },
  },
  trickle: {
    label: "첫 화분 (Day 2~3)",
    state: {
      objects: [
        { id: "p1", type: "planter", x: 28, y: 80 },
      ],
    },
  },
  social: {
    label: "분수대 + 벤치 (Week 1)",
    state: {
      objects: [
        { id: "f1", type: "fountain", x: 50, y: 70 },
        { id: "b1", type: "bench",    x: 28, y: 82, scale: 0.95 },
        { id: "b2", type: "bench",    x: 72, y: 82, scale: 0.95 },
        { id: "p1", type: "planter",  x: 14, y: 76 },
        { id: "p2", type: "planter",  x: 86, y: 76 },
      ],
    },
  },
  rich: {
    label: "풍성한 광장 (Month 1+)",
    state: {
      objects: [
        { id: "f1", type: "fountain", x: 50, y: 70 },
        { id: "b1", type: "bench",    x: 22, y: 82, scale: 0.95 },
        { id: "b2", type: "bench",    x: 78, y: 82, scale: 0.95 },
        { id: "p1", type: "planter",  x: 12, y: 78 },
        { id: "p2", type: "planter",  x: 88, y: 78 },
        { id: "t1", type: "tree",     x: 18, y: 62, scale: 0.95 },
        { id: "t2", type: "tree",     x: 82, y: 62, scale: 0.95 },
        { id: "l1", type: "lamp",     x: 34, y: 76 },
        { id: "l2", type: "lamp",     x: 66, y: 76 },
      ],
    },
  },
};
