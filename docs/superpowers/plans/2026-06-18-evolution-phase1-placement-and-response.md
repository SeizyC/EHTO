# Evolution Phase 1 — 오브제-인식 배치 + 응답 품질 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 진화 설계(2026-06-18 spec)의 Phase 1 — 캐릭터가 키 큰 오브제 뒤에 매장되는 버그(E)를 오브제-인식 배치로 고치고, 멤버가 사용자 말에 "그게 뭐야?"로만 회피하지 않고 알맹이로 받게(G) 만든다.

**Architecture:** 두 변경은 독립적이며 스키마 변경이 없다. (E) `position-drift`의 멤버 배치 충돌 회피 집합에 오브제 footprint를 height-비례 keep-out 반경으로 추가 — 깊이 정렬(렌더)은 불변. (G) reply 경로에서 멤버 affinity가 사용자 발화와 겹치면("wheelhouse") 알맹이 응답을 강하게 유도하고, 무지 회피 라이선스를 "정말 생소할 때만"으로 좁힌다.

**Tech Stack:** Next.js 14 / TypeScript / Supabase. 단위 테스트 프레임워크 없음 — 순수 로직은 `tsx scripts/*.ts` + `node:assert/strict`(기존 `scripts/test-energy.ts` 패턴), 검증은 `npm run typecheck`.

---

## File Structure

- **Create** `src/lib/plaza-obstacles.ts` — 오브제 footprint → keep-out 장애물 순수 계산(높이→반경, iso 가중 거리, 클리어 판정). position-drift가 의존.
- **Create** `src/lib/wheelhouse.ts` — 멤버 affinity ∩ 사용자 발화 겹침 판정 순수 함수. member-reply가 의존. (member-reply.ts에 직접 넣지 않는 이유: 그 파일은 supabase/anthropic을 import해 tsx 단위 테스트가 무거워짐. 순수 모듈로 분리해 가볍게 테스트.)
- **Modify** `src/lib/position-drift.ts` — 로컬 `dist`를 `plaza-obstacles`의 `isoDist`로 대체, `pickClearSpot`에 장애물 회피 추가, 드리프트 루프에 장애물 회피 추가, `tickMemberPositions`에서 `plaza_objects` 조회 → 장애물 구성.
- **Modify** `src/lib/member-reply.ts` — `generateAmbientLine`에서 wheelhouse 계산, `reply-user`/`reply-user-mention` situation 텍스트에 알맹이-참여 지시 주입 + 무지 회피 라이선스 축소, quip 예시에서 회피 모델("음 모르겠다") 제거.
- **Create** `scripts/test-plaza-obstacles.ts`, `scripts/test-wheelhouse.ts` — 순수 로직 assert 테스트.

---

## Task 1: E — 오브제 장애물 순수 계산 모듈

**Files:**
- Create: `src/lib/plaza-obstacles.ts`
- Test: `scripts/test-plaza-obstacles.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/test-plaza-obstacles.ts`:

```ts
import assert from "node:assert/strict";
import { obstacleRadius, isoDist, clearOfObstacles } from "../src/lib/plaza-obstacles";

// obstacleRadius: short objects cast no keep-out, tall ones scale up.
assert.equal(obstacleRadius(4.5), 0);   // dog
assert.equal(obstacleRadius(8.5), 0);   // planter
assert.equal(obstacleRadius(10), 0);    // threshold
assert.ok(Math.abs(obstacleRadius(24) - 5.6) < 1e-9);   // fountain (24-10)*0.4
assert.ok(Math.abs(obstacleRadius(44) - 13.6) < 1e-9);  // tree (44-10)*0.4

// isoDist: depth (y) axis compressed ×1.4.
assert.equal(isoDist({ x: 0, y: 0 }, { x: 3, y: 0 }), 3);              // pure horizontal
assert.ok(Math.abs(isoDist({ x: 0, y: 0 }, { x: 0, y: 2 }) - 2.8) < 1e-9); // 2*1.4

// clearOfObstacles: directly behind a fountain base = buried → not clear.
const fountain = { x: 50, y: 60, radius: obstacleRadius(24) }; // r≈5.6
assert.equal(clearOfObstacles({ x: 50, y: 58 }, [fountain]), false); // dy 2 → 2.8 < 5.6
assert.equal(clearOfObstacles({ x: 57, y: 60 }, [fountain]), true);  // dx 7 > 5.6
assert.equal(clearOfObstacles({ x: 50, y: 60 }, []), true);          // no obstacles

console.log("plaza-obstacles: all assertions passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test-plaza-obstacles.ts`
Expected: FAIL — `Cannot find module '../src/lib/plaza-obstacles'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/plaza-obstacles.ts`:

```ts
// Object footprint obstacles for member placement. position-drift uses
// these so members never get scattered/drifted behind a tall object
// (fountain/tree/lamp) where the y-sort depth order (PlazaCanvas) would
// bury them. Short objects (dogs, planter) get radius 0 — members are
// meant to stand beside them via occupy slots, so they're not obstacles.

export type Obstacle = { x: number; y: number; radius: number };

// Below this display height (% of plaza), an object casts no keep-out.
// Dogs (3–4.5) and planter (8.5) fall under — members stand beside them.
const SHORT_H = 10;
// Keep-out (% units) per unit of height above SHORT_H. Tuned so the
// fountain (24) → ~5.6, lamp (33) → ~9.2, tree (44) → ~13.6.
const RADIUS_K = 0.4;

/** Height-scaled keep-out radius for an object of the given *effective*
 *  display height (nativeHeightPct × scale). Short objects → 0. */
export function obstacleRadius(effectiveHeightPct: number): number {
  return Math.max(0, (effectiveHeightPct - SHORT_H) * RADIUS_K);
}

/** Iso-weighted distance: the depth (y) axis is compressed ×1.4 so
 *  "behind / in front" counts more than left/right — matches the
 *  perspective the plaza is drawn in. Mirrors the metric position-drift
 *  uses between characters. */
export function isoDist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = (a.y - b.y) * 1.4;
  return Math.sqrt(dx * dx + dy * dy);
}

/** True when `pt` sits outside every obstacle's keep-out radius. */
export function clearOfObstacles(
  pt: { x: number; y: number },
  obstacles: Obstacle[],
): boolean {
  return obstacles.every((o) => isoDist(pt, o) >= o.radius);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test-plaza-obstacles.ts`
Expected: PASS — prints `plaza-obstacles: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/plaza-obstacles.ts scripts/test-plaza-obstacles.ts
git commit -m "feat(plaza): object footprint obstacle math for member placement

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: E — position-drift가 오브제 footprint를 회피

**Files:**
- Modify: `src/lib/position-drift.ts`
- Test: `scripts/test-plaza-obstacles.ts` (Task 1, extended)

- [ ] **Step 1: Write the failing test (extend Task 1's script)**

Append to `scripts/test-plaza-obstacles.ts`, BEFORE the final `console.log`:

```ts
// pickClearSpot must avoid obstacles: with a fountain covering plaza
// center, 200 picks should ALL land clear of it (clear regions exist).
import { pickClearSpot } from "../src/lib/position-drift";
const fountainObstacle = { x: 50, y: 60, radius: obstacleRadius(24) };
for (let i = 0; i < 200; i++) {
  const spot = pickClearSpot([], [fountainObstacle]);
  assert.equal(
    clearOfObstacles(spot, [fountainObstacle]),
    true,
    `pickClearSpot returned a buried spot: ${JSON.stringify(spot)}`,
  );
}
console.log("pickClearSpot: 200/200 picks clear of obstacle");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test-plaza-obstacles.ts`
Expected: FAIL — `pickClearSpot` is not exported / does not accept an obstacles argument (TypeScript/runtime error).

- [ ] **Step 3: Modify `position-drift.ts`**

3a. Replace the imports block at the top (currently just the SupabaseClient import on line 14) with:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { OBJECT_CATALOG, type PlazaObjectType } from "@/lib/plaza-objects";
import { catalogAll } from "@/lib/object-catalog";
import {
  obstacleRadius,
  isoDist,
  clearOfObstacles,
  type Obstacle,
} from "@/lib/plaza-obstacles";
```

3b. Delete the local `dist` function (lines 63-67):

```ts
function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = a.x - b.x;
  const dy = (a.y - b.y) * 1.4;
  return Math.sqrt(dx * dx + dy * dy);
}
```

(Every `dist(` call below is replaced by `isoDist(` in the following steps.)

3c. Replace `pickClearSpot` (lines 73-100) with an exported, obstacle-aware version:

```ts
// Pick a random floor-band point clear of every `taken` character AND
// every object obstacle. Prefers a spot that's both clear of obstacles
// and ≥ MIN_GAP from neighbours; falls back to the best obstacle-clear
// spot, then to the best spot overall, so dense plazas still progress.
export function pickClearSpot(
  taken: Array<{ x: number; y: number }>,
  obstacles: Obstacle[],
  yBand?: [number, number],
  attempts = 12,
): { x: number; y: number } {
  const [yMin, yMax] = yBand
    ?? DEPTH_BUCKETS[Math.floor(Math.random() * DEPTH_BUCKETS.length)];
  const sample = () => ({
    x: FLOOR_X_MIN + Math.random() * (FLOOR_X_MAX - FLOOR_X_MIN),
    y: yMin + Math.random() * (yMax - yMin),
  });
  let best = sample();
  let bestMinD = -1;
  let bestClear: { x: number; y: number } | null = null;
  let bestClearMinD = -1;
  for (let i = 0; i < attempts; i++) {
    const cand = sample();
    const clear = clearOfObstacles(cand, obstacles);
    const minD = taken.length === 0
      ? Infinity
      : Math.min(...taken.map((t) => isoDist(cand, t)));
    if (clear && minD >= MIN_GAP) return cand;
    if (clear && minD > bestClearMinD) { bestClearMinD = minD; bestClear = cand; }
    if (minD > bestMinD) { bestMinD = minD; best = cand; }
  }
  return bestClear ?? best;
}
```

3d. Add an obstacle-builder helper just above `tickMemberPositions` (after `isUninitialized`):

```ts
// Build object keep-out obstacles for a world. Static types resolve
// their display height from the TS catalog; dynamic types from the DB
// catalog (by variant id). Short objects (radius 0) are dropped.
async function buildObstacles(
  sb: SupabaseClient,
  worldId: string,
): Promise<Obstacle[]> {
  const { data: objRows } = await sb
    .from("plaza_objects")
    .select("x, y, scale, type, variant_id")
    .eq("world_id", worldId);
  if (!objRows || objRows.length === 0) return [];
  const cat = await catalogAll(sb);
  const heightByVariant = new Map<string, number>();
  for (const t of cat) for (const v of t.variants) heightByVariant.set(v.id, t.nativeHeightPct);
  const obstacles: Obstacle[] = [];
  for (const r of objRows as Array<{ x: number; y: number; scale: number | null; type: string; variant_id: string | null }>) {
    const staticH = OBJECT_CATALOG[r.type as PlazaObjectType]?.nativeHeightPct;
    const dynH = r.variant_id ? heightByVariant.get(r.variant_id) : undefined;
    const h = (staticH ?? dynH ?? 0) * (r.scale ?? 1);
    const radius = obstacleRadius(h);
    if (radius > 0) obstacles.push({ x: r.x, y: r.y, radius });
  }
  return obstacles;
}
```

3e. In `tickMemberPositions`, build obstacles once after the members query early-return. Insert immediately AFTER the `const typed = rows as Row[];` line:

```ts
  const obstacles = await buildObstacles(sb, worldId);
```

3f. In the scatter loop, pass obstacles to `pickClearSpot`. Change:

```ts
    const spot = pickClearSpot(others);
```
to:
```ts
    const spot = pickClearSpot(others, obstacles);
```

3g. In the drift loop, replace the two `dist(` calls with `isoDist(` AND reject obstacle-buried candidates. Replace the inner candidate loop (the `for (let i = 0; i < 8; i++)` block) with:

```ts
    for (let i = 0; i < 8; i++) {
      const dx = (Math.random() * 2 - 1) * MAX_DX;
      const dy = (Math.random() * 2 - 1) * MAX_DY;
      const nx = clamp(curX + dx, FLOOR_X_MIN, FLOOR_X_MAX);
      const ny = clamp(curY + dy, FLOOR_Y_MIN, FLOOR_Y_MAX);
      const cand = { x: nx, y: ny };
      if (!clearOfObstacles(cand, obstacles)) continue; // never drift into an object
      const minD = others.length === 0
        ? Infinity
        : Math.min(...others.map((o) => isoDist(cand, o)));
      if (minD >= MIN_GAP) { best = cand; bestMinD = minD; break; }
      if (minD > bestMinD) { bestMinD = minD; best = cand; }
    }
```

(Note: `best` initialises to the member's current position, so if every sampled step is obstacle-buried the member simply stays put — correct.)

- [ ] **Step 4: Run test + typecheck to verify pass**

Run: `npx tsx scripts/test-plaza-obstacles.ts`
Expected: PASS — prints both success lines.

Run: `npm run typecheck`
Expected: PASS — no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/position-drift.ts scripts/test-plaza-obstacles.ts
git commit -m "fix(plaza): keep members clear of object footprints

position-drift only avoided other characters; tall objects (fountain/
tree/lamp) at mid-depth buried any member scattered behind them. Add
height-scaled keep-out obstacles to scatter + drift placement.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: G — wheelhouse 판정 순수 함수

**Files:**
- Create: `src/lib/wheelhouse.ts`
- Test: `scripts/test-wheelhouse.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/test-wheelhouse.ts`:

```ts
import assert from "node:assert/strict";
import { inWheelhouse } from "../src/lib/wheelhouse";

// An affinity tag surfacing in the user's text → in wheelhouse.
assert.equal(inWheelhouse(["음악", "indie"], "요즘 indie 밴드 뭐 듣냐"), true);
assert.equal(inWheelhouse(["책", "독서"], "어제 그 책 다 읽었어"), true);
// No overlap → not in wheelhouse.
assert.equal(inWheelhouse(["게임"], "주말에 등산 갔다왔어"), false);
// Degenerate inputs.
assert.equal(inWheelhouse([], "아무거나"), false);
assert.equal(inWheelhouse(["음악"], ""), false);
// Case-insensitive.
assert.equal(inWheelhouse(["EDM"], "edm 신곡 미쳤다"), true);

console.log("wheelhouse: all assertions passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test-wheelhouse.ts`
Expected: FAIL — `Cannot find module '../src/lib/wheelhouse'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/wheelhouse.ts`:

```ts
// Does this member plausibly "know about" what the user just said?
// A soft amplifier for reply quality: when any of the member's affinity
// tags surfaces in the user's text, we push them to engage with
// substance instead of deflecting with "그게 뭐야?". Kept as a pure
// module (no supabase/anthropic imports) so it stays cheap to unit-test.

/** True when any affinity tag overlaps the user text (case-insensitive
 *  substring, either direction). Empty affinity or empty text → false. */
export function inWheelhouse(affinity: string[], userText: string): boolean {
  if (!userText) return false;
  const t = userText.toLowerCase();
  return affinity.some((tag) => {
    const a = tag.trim().toLowerCase();
    return a.length > 0 && (t.includes(a) || a.includes(t));
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test-wheelhouse.ts`
Expected: PASS — prints `wheelhouse: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/wheelhouse.ts scripts/test-wheelhouse.ts
git commit -m "feat(reply): wheelhouse — member affinity vs user-message overlap

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: G — 알맹이 응답 유도 + 회피 라이선스 축소

**Files:**
- Modify: `src/lib/member-reply.ts`

- [ ] **Step 1: Add the wheelhouse import**

At the top of `src/lib/member-reply.ts`, add to the import block:

```ts
import { inWheelhouse } from "@/lib/wheelhouse";
```

- [ ] **Step 2: Compute wheelhouse before the intent switch**

In `generateAmbientLine`, immediately after `const intent = opts.intent;` (currently line 409) and before `let situation: string;`, insert:

```ts
  // The user's most recent line (the thing a reply-user turn answers).
  const lastUserText = recent.filter((t) => !t.isSelf).at(-1)?.text ?? "";
  const wheelhouse = inWheelhouse(speaker.persona.affinity ?? [], lastUserText);
```

- [ ] **Step 3: Rewrite the `reply-user` situation (substantive engagement)**

Replace the `case "reply-user":` block (currently lines 422-431) with:

```ts
    case "reply-user":
      situation = [
        `${intent.userName}님이 한마디 했어요.`,
        "받는 방법:",
        "- *알맹이로 받아라*. 질문이면 진짜 답(책 추천 → 책 한 권, 의견 → 의견, 사실 질문 → 사실). 진술/잡담이면 그 내용에 대한 진짜 반응(아는 것·의견·되묻기 중 알맹이 있는 쪽).",
        wheelhouse
          ? "- **이건 네 관심사 영역이야 — 아는 티 내며 구체적으로 받아라.** 모른 척·되묻기로 빠지지 말 것."
          : "- 들어봤거나 일반 상식으로 아는 거면 아는 만큼 알맹이로 받아라. '그게 뭐야?'식 되묻기는 *정말 생소하고 네 결과도 무관할 때만*.",
        "- 명사 변주·자기 얘기로 새기 금지. 사용자 메시지가 *anchor*임. 자동 농담·맞장구 X.",
      ].join("\n");
      break;
```

- [ ] **Step 4: Strengthen the `reply-user-mention` situation**

Replace the `case "reply-user-mention":` block (currently lines 413-421) with:

```ts
    case "reply-user-mention":
      situation = [
        `${intent.userName}님이 *당신을 직접 불러서* 한마디 했어요.`,
        "받는 방법:",
        "- 그 사람이 *물은 것에 진짜로 답*하세요. 책 추천 물으면 책 한 권 꺼내고, 의견 물으면 의견 내고, 부탁이면 부탁에 답하고.",
        wheelhouse
          ? "- **이건 네 관심사 영역이야 — 아는 티 내며 구체적으로.** '그게 뭐야?'로 빠지지 말 것."
          : "- 들어봤거나 일반 상식으로 아는 거면 아는 만큼 알맹이로. 정말 생소할 때만 솔직히 모른다고.",
        "- 형태는 자유(한 줄 추천·짧은 답·되묻기 다 OK) — 단, 사용자 메시지를 *무시한 채 자기 얘기로 새는 건 절대 X*.",
        "- 본인 결대로 답하되, '답' 자체는 사용자 의도에 정렬되어야 함.",
      ].join("\n");
      break;
```

- [ ] **Step 5: Remove the deflection model from the `quip` examples**

In `SHAPE_GUIDANCE.quip.examples` (currently line 268), replace:

```ts
    examples: ["오 그거 별로던데", "아 진짜?", "그건 좀 무리야", "ㅇㅋ 동의", "음 모르겠다"],
```
with:
```ts
    examples: ["오 그거 별로던데", "아 진짜?", "그건 좀 무리야", "ㅇㅋ 동의", "그거 좋더라"],
```

- [ ] **Step 6: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS — no errors.

- [ ] **Step 7: Manual / regression verification**

The behavioral change (members engaging substantively) is an LLM-output property — not unit-testable. Verify by:

Run: `npm run test:regression`
Expected: completes without error (NOTE: this harness makes a live model call; per project memory it may be blocked until the OpenAI credit balance is refilled — if it errors on the model call, defer this check until credits are restored and verify manually instead).

Manual check (preferred, once running locally): in `/world`, send a niche-reference line like the spec's example ("요즘 불교가 edm 틀고 난리도 아닌데 불교재즈라는 힙한 노래가 장난아냐"). Expected: at least one member engages with substance (reacts to EDM/jazz/genre) rather than every member replying "그게 뭐야?".

- [ ] **Step 8: Commit**

```bash
git add src/lib/member-reply.ts
git commit -m "feat(reply): members engage user messages with substance

Reply prompts licensed blanket deflection ('모르면 잘 모르겠는데') and
modelled it in the quip examples, so members met niche references with
'그게 뭐야?'. Push substantive engagement, amplify when the topic is in
the member's affinity wheelhouse, and narrow deflection to genuinely
unfamiliar + out-of-wheelhouse cases.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage (Phase 1 = E + G):**
- E (오브제-인식 배치) → Tasks 1-2. ✓ height-scaled keep-out, scatter + drift both avoid, depth sort untouched, occupy slots (short objects radius 0) preserved.
- G (응답 품질, 프롬프트 + affinity 연동) → Tasks 3-4. ✓ wheelhouse helper + affinity amplifier, deflection license narrowed, quip deflection example removed.
- Out of Phase 1 (A/B/C/D/F) → separate plans. ✓ not in scope.

**Placeholder scan:** No TBD/TODO. All code blocks are complete. Manual-verification step (Task 4 Step 7) is explicitly labelled and unavoidable for an LLM-output property; a pure-logic test covers the testable part (wheelhouse).

**Type consistency:**
- `Obstacle` defined in `plaza-obstacles.ts`, imported by `position-drift.ts`. ✓
- `pickClearSpot(taken, obstacles, yBand?, attempts?)` — new signature used consistently in scatter (Step 3f) and test (Task 2 Step 1). ✓
- `obstacleRadius` / `isoDist` / `clearOfObstacles` names consistent across module, test, and position-drift call sites. ✓
- `inWheelhouse(affinity, userText)` — defined in `wheelhouse.ts`, imported and called in `member-reply.ts` with `speaker.persona.affinity ?? []` and `lastUserText`. ✓
- `catalogAll` / `OBJECT_CATALOG` / `nativeHeightPct` match existing `object-catalog.ts` and `plaza-objects.ts` shapes. ✓
