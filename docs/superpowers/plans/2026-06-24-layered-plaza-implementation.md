# Layered Plaza (Object Taxonomy Phase 2) — Implementation Plan

> **For agentic workers:** Execute stage-by-stage. Each STAGE is independently shippable and visually verifiable — commit + eyeball in dev before the next. Steps use `- [ ]` checkboxes.

**Goal:** Turn the single-plane plaza into a depth-layered little town: time-of-day atmosphere, a back skyline, aerial drifters, topic-grown buildings in the back band, and a portal — per the 2026-06-23 taxonomy spec (§3 layer order, §11 rollout steps 4–6).

**Architecture:** Keep 0–100% x/y coords and the existing y-sort + `perspectiveScale(y)` in `PlazaCanvas`. Add render layers *behind* the floor (atmosphere → skyline → drifters) and *in front* (portal overlay). Placement gains category depth-bands so buildings land at the back (y 30–55) and render behind characters automatically via the existing y-sort. Assets (skyline strip, drifter sprites, portal) come from the existing gpt-image-1 pipeline or CSS where possible.

**Tech Stack:** Next 14 client components, framer-motion, Supabase (`object_types`/`plaza_objects`), `time-of-day.ts` buckets, gpt-image-1 via `dynamic-object-gen` / `scripts/gen-*.mjs`.

**Depth bands (y%):** sky 0–34 · skyline 30–46 · building (back) 30–55 · landmark (mid) 50–66 · prop/pet/people (front) 66–94. Layer paint order (back→front): bg gradient + atmosphere → skyline → drifters → building → landmark → prop/pet/people → portal.

---

## STAGE A — Depth-band placement + building tier + gate (rollout §4)

Zero render risk: `PlazaCanvas` already sorts items by `y` and scales by depth, so a building placed at y≈40 renders behind characters with no canvas change.

**Files:**
- Modify: `src/lib/plaza-grow.ts` (Milestone type, milestone coords, building tier + gate)
- Modify: `src/lib/plaza-objects.ts` (confirm category bands; add a static `building` fallback type if needed)
- Reference: `src/lib/object-catalog.ts` (`selectCuratedForSlot` already filters by category)
- Verify: schema `object_types.category` is applied (migration `20260623000001`)

- [ ] **A1 — Add `band`/`tier` to `Milestone`** and a band→y-range helper:
```ts
type Band = "back" | "mid" | "front";
type Tier = "prop" | "landmark" | "building";
type Milestone = { stage; daysMin; messagesMin; band: Band; tier: Tier; place: { x; y; scale? }; alternates?: PlazaObjectType[] };
const BAND_Y: Record<Band, [number, number]> = { back: [30, 55], mid: [50, 66], front: [66, 94] };
function clampToBand(y: number, band: Band): number { const [lo, hi] = BAND_Y[band]; return Math.min(hi, Math.max(lo, y)); }
```
- [ ] **A2 — Retune existing milestones into bands.** Landmarks (fountain/tree/lamp) → `band:"mid"`, move y into 50–66. Props (planter) → `front`. Pets (dogs) → `front` (unchanged y 73–78). Run `clampToBand(place.y, band)` at insert so coords can't escape the band.
- [ ] **A3 — Add a `building` tier milestone** at the back band, e.g. `{ stage: 10, daysMin: 21, messagesMin: 650, band:"back", tier:"building", place:{ x: 28, y: 42, scale: 1.0 } }`. No static building default — building slots fill only from catalog/gen (gate below).
- [ ] **A4 — Building gate.** Helper `passesBuildingGate(implicit)`: top implicit topic `weight ≥ T_BUILDING` (start `T_BUILDING = 3`) AND topic is place-ish (reuse catalog topic match for any `category==="building"` object). If the slot's `tier==="building"` and gate fails → skip this tick (do NOT advance stage), leaving it empty for later. Log the skip.
- [ ] **A5 — Generalize slot fill by tier.** Replace the `OBJECT_CATALOG[m.place.type]`-derived `slotMeta` with `{ category: m.tier, heightPct: HEIGHT_BY_TIER[m.tier] }` so `selectCuratedForSlot` + `tryGenerateDynamicType` use the milestone's tier (not a static type). `HEIGHT_BY_TIER = { prop: 14, landmark: 32, building: 60 }`.
- [ ] **A6 — Verify** with a script (`scripts/test-plaza-bands.mjs` or extend regression): for each milestone, assert `place.y ∈ BAND_Y[band]`; assert building milestone is skipped when implicit weight < T_BUILDING; assert a building catalog object with a strong topic gets selected. `npm run typecheck`.
- [ ] **A7 — Commit:** `feat(plaza): depth-band placement + building tier with topic gate`

---

## STAGE B — Atmosphere layer (time-of-day, pure CSS/SVG, no assets)

**Files:** Create `src/components/plaza/AtmosphereLayer.tsx`; modify `src/components/PlazaCanvas.tsx` (mount as backmost layer).

- [ ] **B1 — `AtmosphereLayer({ bucket })`** absolutely-positioned, `inset-0`, `pointer-events-none`, `z-0`, behind the scene image. Day (morning/afternoon/dawn): 2–3 slow-drifting CSS cloud blobs (soft white radial gradients, `framer-motion` x-drift 60–120s loop). Night/evening: starfield (CSS box-shadow dots or a few absolutely-placed twinkling dots) + a moon (radial gradient circle). Each element keyed off `bucket` so it cross-fades on change.
- [ ] **B2 — Mount in PlazaCanvas** as the first child of the root container (before the scene `<img>`), passing the resolved `bucket`. Confirm it sits behind everything and doesn't intercept clicks.
- [ ] **B3 — Verify** in dev across buckets (temporarily force `bucket` prop): day shows clouds, night shows stars+moon, no layout shift, no click interception. `npm run typecheck`.
- [ ] **B4 — Commit:** `feat(plaza): time-of-day atmosphere layer (clouds/stars/moon)`

---

## STAGE C — Skyline band (curated background strip)

**Files:** Generate skyline asset(s) → `public/plaza/skyline/*.webp` (or storage); create `src/components/plaza/SkylineLayer.tsx`; mount in PlazaCanvas between atmosphere and floor.

- [ ] **C1 — Asset.** Generate 1–2 wide, low-rise city skyline silhouette strips (transparent PNG, muted, contemporary urban, side elevation) via gpt-image-1 (reuse `scripts/gen-*.mjs` pattern); trim + convert to webp. Place at `public/plaza/skyline/`.
- [ ] **C2 — `SkylineLayer`** absolutely positioned across the skyline band (y≈30–46), `pointer-events-none`, low opacity, tinted by `bucket` (darker at night). Repeats horizontally to cover the widened canvas.
- [ ] **C3 — Mount** behind buildings (after atmosphere, before floor/items). **Verify** visually; **Commit:** `feat(plaza): back skyline band`.

---

## STAGE D — Aerial drifters (`category:'sky'`)

**Files:** Create `src/lib/sky-layer.ts` (spawn/weight/events), `src/components/plaza/DrifterLayer.tsx`; generate drifter sprites; optional `object_types` rows category `sky`.

- [ ] **D1 — Sprites.** Generate balloon / airplane (horizontal!) / bird-flock transparent side-view sprites (gpt-image-1). Store as `sky` category objects or `public/plaza/sky/`.
- [ ] **D2 — `sky-layer.ts`:** pick 1–2 active drifters; default random, weighted by strong implicit topics (travel→airplane, 몽상→balloon, 자유→birds). Low frequency, slow horizontal drift across y 5–28.
- [ ] **D3 — `DrifterLayer`** renders active drifters with a long-duration framer-motion x-translate loop; `pointer-events-none`; behind buildings, in front of skyline.
- [ ] **D4 — (optional) rare events** (별똥별/불꽃) as milestone reward — defer if time-boxed.
- [ ] **D5 — Verify + Commit:** `feat(plaza): aerial drifters layer`.

---

## STAGE E — Portal (A-model + color affordance)

**Files:** Create `src/lib/portal.ts`, `src/components/plaza/Portal.tsx`; mount as front overlay in PlazaCanvas.

- [ ] **E1 — Portal state.** Fixed slot (e.g. x≈88, y≈64). Closed by default. Opens on member enter/exit events + occasional ambient. Cool tone (arrival/departure, non-clickable, pass-through animation) vs accent tone (you-can-go, click → reuse existing visit routing to `/plaza/[id]` or random).
- [ ] **E2 — `Portal` component** renders the ring with the tone, framer-motion open/close; click handler on the accent state only → calls the existing random-visit / visit path.
- [ ] **E3 — Verify + Commit:** `feat(plaza): portal with color affordance`.

---

## STAGE F — Canvas widening + final layer order

**Files:** modify `src/components/PlazaCanvas.tsx` + the `PLAZA_W/PLAZA_H` consts in `world/page.tsx` and `plaza/[id]/page.tsx`.

- [ ] **F1 — Widen** the canvas aspect (more horizontal room for skyline/drifters/building slots) while keeping scale-fit default so the whole plaza shows in one screen. Re-check floor band + character placement (% coords unaffected).
- [ ] **F2 — Finalize layer order** atmosphere → skyline → drifters → building → landmark → prop/pet/people → portal. Confirm y-sort still composes objects+characters correctly within the floor.
- [ ] **F3 — Regression:** LCP/layout check (per web-perf), existing placement preserved, kill-switch + mute still work, mobile + PC layouts. **Commit:** `feat(plaza): widen canvas + finalize layered render`.

---

## Sequencing & risk
- A and B are low-risk, high-visibility — do first, this session.
- C–E need generated assets (skyline/drifter/portal) — eyeball each.
- F (canvas widening) is the riskiest layout change — last, with explicit LCP/layout regression.
- Kill path: every new layer is additive + `pointer-events-none`; can be removed independently.
