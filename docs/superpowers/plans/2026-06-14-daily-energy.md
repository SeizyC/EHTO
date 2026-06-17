# Daily Energy Metering + Gamified Meter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each plaza a daily "life-energy" budget of full-quality ambient moments that depletes as the owner watches, refills at KST midnight, and is shown as a gamified meter at the top of `/world` — while cutting per-moment cost by routing AI↔AI filler to Sonnet and owner-directed replies to Opus.

**Architecture:** A pure accounting module (`src/lib/energy.ts`) defines plan caps, KST-day reset, and view math (unit-tested). The ambient tick (`src/lib/ambient-loop.ts`) gates generation on the right daily counter (AI↔AI → `moments`, owner replies → `interject` reserve) and consumes one unit per generated line. `/api/world/members` returns the current energy view; `members-store` exposes it; a new `EnergyMeter` component renders it in the `/world` top bar. Model routing moves to `member-reply.ts`. Real billing is out of scope — `plan` is a manual DB flag for now (per the monetization spec's Layer-2-on-manual-flag approach).

**Tech Stack:** Next.js 14 (App Router, nodejs runtime), Supabase (Postgres via Management API migrations), Anthropic Claude (`@anthropic-ai/sdk`), Tailwind. No unit-test framework exists in the repo; this plan adds `tsx` to run TS assertion scripts for the one pure module, and verifies the rest via `npm run typecheck`, `npm run build`, `./scripts/db.sh`, and manual local render.

**Spec:** `docs/superpowers/specs/2026-06-14-monetization-design.md` (§5.2 model routing, §6 metering, §6.1 meter UI, §8 data model). Out of scope here (later increments): prompt caching, society-size caps, catch-up depth tiers, payments.

---

## File Structure

- **Create** `src/lib/energy.ts` — pure life-energy accounting (caps, KST reset, view math). No I/O.
- **Create** `scripts/test-energy.ts` — node/tsx assertions for `energy.ts`.
- **Create** `src/components/EnergyMeter.tsx` — gamified top-bar meter (client).
- **Create** `supabase/migrations/20260614000001_world_daily_energy.sql` — add energy columns to `worlds`.
- **Modify** `src/lib/claude.ts` — add `FILLER_CHAT_MODEL` export.
- **Modify** `src/lib/member-reply.ts` — route model by intent (filler→Sonnet, owner-directed→Opus).
- **Modify** `src/lib/ambient-loop.ts` — load energy columns, gate before generation, consume after insert.
- **Modify** `src/app/api/world/members/route.ts` — return `energy` view in the JSON.
- **Modify** `src/lib/members-store.ts` — capture `energy` from the response, expose `useEnergy()`.
- **Modify** `src/app/world/page.tsx` — render `<EnergyMeter />` in the header.

---

## Task 1: Schema — daily energy columns on `worlds`

**Files:**
- Create: `supabase/migrations/20260614000001_world_daily_energy.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Daily life-energy metering (monetization Layer 2).
--
-- Two independent daily counters per plaza, both reset at KST midnight
-- (the app compares moments_day / interject_day against the current KST
-- date string and zeroes used when it rolls):
--   · moments_*    AI<->AI ambient chatter — the cost governor
--   · interject_*  replies to the owner's own messages — always-available reserve
-- plan: manual flag until real billing lands ('free' | 'plus').

alter table public.worlds
  add column if not exists plan            text    not null default 'free',
  add column if not exists moments_used    integer not null default 0,
  add column if not exists moments_day     text,
  add column if not exists interject_used  integer not null default 0,
  add column if not exists interject_day   text;
```

- [ ] **Step 2: Run the migration**

Run: `./scripts/db.sh -f supabase/migrations/20260614000001_world_daily_energy.sql`
Expected: success output from the Management API (no error JSON).

- [ ] **Step 3: Verify columns exist**

Run:
```bash
./scripts/db.sh -q "select column_name, data_type, column_default from information_schema.columns where table_name='worlds' and column_name in ('plan','moments_used','moments_day','interject_used','interject_day') order by column_name"
```
Expected: 5 rows — `interject_day`, `interject_used`, `moments_day`, `moments_used`, `plan`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260614000001_world_daily_energy.sql
git commit -m "feat(energy): add daily life-energy columns to worlds"
```

---

## Task 2: Pure energy accounting module + tests

**Files:**
- Create: `src/lib/energy.ts`
- Create: `scripts/test-energy.ts`
- Modify: `package.json` (add `tsx` devDependency + `test:energy` script)

- [ ] **Step 1: Add the tsx runner**

Run: `npm install -D tsx`
Expected: `tsx` appears under `devDependencies` in `package.json`.

- [ ] **Step 2: Add a test script to package.json**

In `package.json` `"scripts"`, add:
```json
"test:energy": "tsx scripts/test-energy.ts",
```

- [ ] **Step 3: Write the failing test**

Create `scripts/test-energy.ts`:
```ts
import assert from "node:assert/strict";
import {
  MOMENT_CAP, INTERJECT_CAP, planCap, kstDayLabel,
  withDailyReset, remaining, msUntilKstMidnight, energyView,
} from "../src/lib/energy.ts";

// kstDayLabel: YYYY-MM-DD in Asia/Seoul. 2026-06-14T00:00:00Z is 09:00 KST same day.
assert.equal(kstDayLabel(Date.parse("2026-06-14T00:00:00Z")), "2026-06-14");
// 2026-06-13T16:00:00Z is 2026-06-14 01:00 KST → next KST day already.
assert.equal(kstDayLabel(Date.parse("2026-06-13T16:00:00Z")), "2026-06-14");

// planCap
assert.equal(planCap("free", "moment"), MOMENT_CAP.free);
assert.equal(planCap("free", "interject"), INTERJECT_CAP.free);
assert.equal(planCap("plus", "moment"), MOMENT_CAP.plus);

// withDailyReset: same day keeps used; different day zeroes.
assert.deepEqual(withDailyReset({ used: 5, day: "2026-06-14" }, "2026-06-14"), { used: 5, day: "2026-06-14" });
assert.deepEqual(withDailyReset({ used: 5, day: "2026-06-13" }, "2026-06-14"), { used: 0, day: "2026-06-14" });
assert.deepEqual(withDailyReset({ used: 0, day: null }, "2026-06-14"), { used: 0, day: "2026-06-14" });

// remaining: floors at 0.
assert.equal(remaining(3, 80), 77);
assert.equal(remaining(90, 80), 0);

// msUntilKstMidnight: in (0, 24h].
const ms = msUntilKstMidnight(Date.parse("2026-06-14T00:00:00Z")); // 09:00 KST → 15h left
assert.equal(ms, 15 * 3600_000);

// energyView math
const v = energyView("free", 80, Date.parse("2026-06-14T00:00:00Z"));
assert.deepEqual(
  { plan: v.plan, used: v.used, cap: v.cap, remaining: v.remaining },
  { plan: "free", used: 80, cap: MOMENT_CAP.free, remaining: 0 },
);

console.log("energy: all assertions passed");
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm run test:energy`
Expected: FAIL — `Cannot find module '../src/lib/energy.ts'` (module not created yet).

- [ ] **Step 5: Write the implementation**

Create `src/lib/energy.ts`:
```ts
// Daily life-energy accounting for a plaza's ambient "moments".
//
// A *moment* = one ambient generation (one Claude call → one member line).
// The billed quantity equals the cost unit, so capping moments caps cost
// directly (see docs/superpowers/specs/2026-06-14-monetization-design.md §6).
//
// Two independent daily counters live on `worlds`, both reset at KST midnight:
//   · moments  — AI↔AI ambient chatter (the cost governor)
//   · interject — replies to the owner's own messages (always-available reserve)
//
// This module is pure (no I/O) so it can be unit-tested via scripts/test-energy.ts.

export type Plan = "free" | "plus";
export type EnergyKind = "moment" | "interject";

// Starting hypotheses (spec §6). "plus" is a large finite number rather than
// Infinity so it serializes as JSON and compares with plain `<`.
export const MOMENT_CAP: Record<Plan, number> = { free: 80, plus: 100_000 };
export const INTERJECT_CAP: Record<Plan, number> = { free: 15, plus: 100_000 };

export function planCap(plan: Plan, kind: EnergyKind): number {
  return kind === "moment" ? MOMENT_CAP[plan] : INTERJECT_CAP[plan];
}

/** KST calendar date "YYYY-MM-DD" (Asia/Seoul) — the daily-reset key. */
export function kstDayLabel(nowMs: number): string {
  // en-CA renders as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nowMs));
}

export type Counter = { used: number; day: string | null };

/** If the stored day differs from today, zero the counter (daily refill). */
export function withDailyReset(c: Counter, todayLabel: string): Counter {
  return c.day === todayLabel ? c : { used: 0, day: todayLabel };
}

/** Remaining quota, never negative. */
export function remaining(used: number, cap: number): number {
  return Math.max(0, cap - used);
}

/** ms from now until the next KST midnight — drives the "자정에 충전" copy. */
export function msUntilKstMidnight(nowMs: number): number {
  const KST_OFFSET = 9 * 3600_000;
  const dayMs = 24 * 3600_000;
  const sinceMidnight = (((nowMs + KST_OFFSET) % dayMs) + dayMs) % dayMs;
  return dayMs - sinceMidnight;
}

export type EnergyView = {
  plan: Plan;
  used: number;
  cap: number;
  remaining: number;
  resetInMs: number;
};

/** Build the client-facing view of the *moment* budget (the meter shows this). */
export function energyView(plan: Plan, used: number, nowMs: number): EnergyView {
  const cap = MOMENT_CAP[plan];
  return { plan, used, cap, remaining: remaining(used, cap), resetInMs: msUntilKstMidnight(nowMs) };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test:energy`
Expected: `energy: all assertions passed`

- [ ] **Step 7: Commit**

```bash
git add src/lib/energy.ts scripts/test-energy.ts package.json package-lock.json
git commit -m "feat(energy): pure daily-energy accounting module + tests"
```

---

## Task 3: Model routing — filler→Sonnet, owner-directed→Opus

**Files:**
- Modify: `src/lib/claude.ts` (add export near `FALLBACK_CHAT_MODEL`, ~line 29)
- Modify: `src/lib/member-reply.ts` (import + `generateAmbientLine` ~lines 306-476, `callChat` ~lines 480-490)

- [ ] **Step 1: Add the filler-model constant**

In `src/lib/claude.ts`, immediately after the `FALLBACK_CHAT_MODEL` declaration (line 29), add:
```ts
/** AI↔AI ambient filler model. Sonnet 4.6 — the cost note above applies:
 *  quality is effectively indistinguishable from Opus for short Korean
 *  chat, so routing filler here is a cost cut, not a quality cut. */
export const FILLER_CHAT_MODEL = "claude-sonnet-4-6";
```

- [ ] **Step 2: Import the models in member-reply.ts**

In `src/lib/member-reply.ts`, change the import on line 12 from:
```ts
import { chatComplete, chatCompleteWithVideo } from "@/lib/claude";
```
to:
```ts
import { chatComplete, chatCompleteWithVideo, CHAT_MODEL, FILLER_CHAT_MODEL } from "@/lib/claude";
```

- [ ] **Step 3: Choose the model in generateAmbientLine**

In `src/lib/member-reply.ts`, inside `generateAmbientLine`, the `allowVideoTool` constant is computed at lines 341-342:
```ts
  const allowVideoTool =
    opts.intent.type === "reply-user" || opts.intent.type === "reply-user-mention";
```
Immediately after it, add:
```ts
  // Model routing (spec §5.2): owner-directed turns (the moments the user
  // feels most) stay on Opus; AI↔AI filler runs on the cheaper Sonnet.
  // allowVideoTool already encodes "owner-directed" exactly.
  const model = allowVideoTool ? CHAT_MODEL : FILLER_CHAT_MODEL;
```

- [ ] **Step 4: Pass the model to both generation paths**

In `generateAmbientLine`, the video path call (line 462) is:
```ts
    const result = await chatCompleteWithVideo({ system, user: userPrompt, maxTokens: MAX_TOKENS });
```
Change to:
```ts
    const result = await chatCompleteWithVideo({ system, user: userPrompt, maxTokens: MAX_TOKENS, model });
```
And the plain path (line 474) is:
```ts
  const text = await callChat(system, userPrompt, MAX_TOKENS);
```
Change to:
```ts
  const text = await callChat(system, userPrompt, MAX_TOKENS, model);
```

- [ ] **Step 5: Thread the model through callChat**

In `src/lib/member-reply.ts`, replace the `callChat` helper (lines 480-490):
```ts
async function callChat(
  system: string,
  user: string,
  maxTokens: number,
): Promise<string | null> {
  // Thin wrapper over the shared Claude helper. The prior OpenAI path
  // needed reasoning-token gymnastics + an empty-content retry; Opus 4.7
  // doesn't burn hidden tokens for ordinary chat replies so the single
  // call is sufficient.
  return chatComplete({ system, user, maxTokens });
}
```
with:
```ts
async function callChat(
  system: string,
  user: string,
  maxTokens: number,
  model?: string,
): Promise<string | null> {
  // Thin wrapper over the shared Claude helper. `model` lets the ambient
  // path route filler to Sonnet and owner-directed replies to Opus; when
  // omitted, chatComplete falls back to CHAT_MODEL (Opus).
  return chatComplete({ system, user, maxTokens, model });
}
```

- [ ] **Step 6: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors (exit 0).

- [ ] **Step 7: Commit**

```bash
git add src/lib/claude.ts src/lib/member-reply.ts
git commit -m "feat(energy): route ambient filler to Sonnet, owner replies to Opus"
```

---

## Task 4: Gate + consume energy in the ambient tick

**Files:**
- Modify: `src/lib/ambient-loop.ts` (imports ~line 29; world select ~lines 150-154; gate after ~line 289; consume after insert ~line 395)

- [ ] **Step 1: Import the energy helpers**

In `src/lib/ambient-loop.ts`, after the existing import block (after line 29), add:
```ts
import { kstDayLabel, withDailyReset, remaining, planCap, type Plan } from "@/lib/energy";
```

- [ ] **Step 2: Load the energy columns with the world row**

In `src/lib/ambient-loop.ts`, the world fetch at lines 150-154 is:
```ts
  const { data: world } = await sb
    .from("worlds")
    .select("owner_id, last_owner_checkin_at, bias")
    .eq("id", worldId)
    .maybeSingle();
```
Change the `.select(...)` to:
```ts
    .select("owner_id, last_owner_checkin_at, bias, plan, moments_used, moments_day, interject_used, interject_day")
```

- [ ] **Step 3: Gate generation on the daily budget**

In `src/lib/ambient-loop.ts`, the line `const isOwnerCheckin = intent.type === "check-in";` (line 289) is the first point where `intent` is finalized. Immediately after it, insert:
```ts
  // Daily life-energy gate (spec §6). AI↔AI ambient draws from the moment
  // budget (the cost governor); replies to the owner draw from the separate
  // interjection reserve so a *rested* plaza can still answer when spoken to.
  // Both reset at KST midnight. We gate here — before transcript/memory/news
  // assembly and the LLM call — so an exhausted plaza burns nothing.
  const energyKind: "moment" | "interject" =
    intent.type === "reply-user" || intent.type === "reply-user-mention"
      ? "interject"
      : "moment";
  const plan = (world?.plan ?? "free") as Plan;
  const today = kstDayLabel(Date.now());
  const counter = withDailyReset(
    energyKind === "moment"
      ? { used: world?.moments_used ?? 0, day: world?.moments_day ?? null }
      : { used: world?.interject_used ?? 0, day: world?.interject_day ?? null },
    today,
  );
  if (remaining(counter.used, planCap(plan, energyKind)) <= 0) {
    return { spoke: null, reason: `quota-exhausted:${energyKind}` };
  }
```

- [ ] **Step 4: Consume one unit after a successful insert**

In `src/lib/ambient-loop.ts`, the speaker `last_seen_at` update is at lines 394-395:
```ts
  await sb.from("members").update({ last_seen_at: new Date().toISOString() })
    .eq("id", speaker.id);
```
Immediately after it, insert:
```ts
  // Consume one unit of the relevant daily budget. The reset was already
  // applied to `counter` above, so day is set to today and used is the
  // pre-increment value. The per-world ambient lock (claimed at the top of
  // this tick) serializes ticks, so a plain read-modify-write is safe here.
  const usedCol = energyKind === "moment" ? "moments_used" : "interject_used";
  const dayCol = energyKind === "moment" ? "moments_day" : "interject_day";
  await sb.from("worlds")
    .update({ [usedCol]: counter.used + 1, [dayCol]: today })
    .eq("id", worldId);
```

- [ ] **Step 5: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors (exit 0).

- [ ] **Step 6: Verify the gate with a forced-exhausted plaza**

This proves the gate end-to-end against the real DB. Pick any world id:
```bash
./scripts/db.sh -q "select id, moments_used, moments_day from public.worlds limit 1"
```
Set it exhausted for today (replace <ID> and use today's KST date):
```bash
./scripts/db.sh -q "update public.worlds set plan='free', moments_used=80, moments_day=to_char((now() at time zone 'Asia/Seoul'),'YYYY-MM-DD') where id='<ID>'"
```
Then confirm the math: a `free` plaza at 80/80 has 0 remaining, so the tick returns `quota-exhausted:moment` (no new ambient lines). Reset it afterward:
```bash
./scripts/db.sh -q "update public.worlds set moments_used=0 where id='<ID>'"
```
Expected: the update statements succeed; the count reads back as set.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ambient-loop.ts
git commit -m "feat(energy): gate + consume daily life-energy in ambient tick"
```

---

## Task 5: Return the energy view from /api/world/members

**Files:**
- Modify: `src/app/api/world/members/route.ts` (import ~line 11; after members compute ~line 104; response ~lines 106-110)

- [ ] **Step 1: Import the energy helpers**

In `src/app/api/world/members/route.ts`, after the existing imports (after line 11), add:
```ts
import { kstDayLabel, energyView, type Plan } from "@/lib/energy";
```

- [ ] **Step 2: Read the (post-tick) energy and build the view**

In `src/app/api/world/members/route.ts`, the members list is computed at lines 102-104:
```ts
  const members = (allMembers ?? [])
    .filter((m) => m.activated_at !== null && m.status === "active")
    .sort((a, b) => b.activity_weight - a.activity_weight);
```
Immediately after it, insert:
```ts
  // Energy view for the top-bar meter. Read *after* the ambient tick so a
  // moment consumed this poll is reflected. Apply the KST daily reset for
  // display so a fresh day shows full before the next tick rewrites the row.
  const { data: wEnergy } = await svc
    .from("worlds")
    .select("plan, moments_used, moments_day")
    .eq("id", world.id)
    .maybeSingle();
  const today = kstDayLabel(Date.now());
  const plan = (wEnergy?.plan ?? "free") as Plan;
  const usedToday = wEnergy?.moments_day === today ? (wEnergy?.moments_used ?? 0) : 0;
  const energy = energyView(plan, usedToday, Date.now());
```

- [ ] **Step 3: Add `energy` to the response**

In `src/app/api/world/members/route.ts`, the response at lines 106-110:
```ts
  return NextResponse.json({
    worldId: world.id,
    name: world.name,
    members,
  });
```
Change to:
```ts
  return NextResponse.json({
    worldId: world.id,
    name: world.name,
    members,
    energy,
  });
```

- [ ] **Step 4: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors (exit 0).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/world/members/route.ts
git commit -m "feat(energy): return energy view from /api/world/members"
```

---

## Task 6: Capture energy in members-store + expose useEnergy()

**Files:**
- Modify: `src/lib/members-store.ts` (import ~line 5; state ~line 48; clear ~line 56; parse ~line 152; new hook after line 182)

- [ ] **Step 1: Import the EnergyView type**

In `src/lib/members-store.ts`, after line 5, add:
```ts
import type { EnergyView } from "@/lib/energy";
```

- [ ] **Step 2: Add module state for energy**

In `src/lib/members-store.ts`, after `let _worldId: string | null = null;` (line 48), add:
```ts
let _energy: EnergyView | null = null;
```

- [ ] **Step 3: Clear energy on sign-out**

In `clearMembers()` (lines 55-62), after `_members = [];` (line 56), add:
```ts
  _energy = null;
```

- [ ] **Step 4: Parse energy from the response**

In `refreshMembers()`, after `_members = j.members ?? [];` (line 152), add:
```ts
    _energy = (j.energy ?? null) as EnergyView | null;
```

- [ ] **Step 5: Expose a useEnergy() hook**

In `src/lib/members-store.ts`, after the `useMembers()` hook (after line 182), add:
```ts
export function useEnergy(): EnergyView | null {
  const [snap, setSnap] = useState<EnergyView | null>(_energy);
  useEffect(() => {
    const sync = () => setSnap(_energy);
    sync();
    _listeners.add(sync);
    if (_members.length === 0) refreshMembers();
    return () => { _listeners.delete(sync); };
  }, []);
  return snap;
}
```

- [ ] **Step 6: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors (exit 0).

- [ ] **Step 7: Commit**

```bash
git add src/lib/members-store.ts
git commit -m "feat(energy): capture energy view in members-store + useEnergy hook"
```

---

## Task 7: Gamified EnergyMeter component in the /world top bar

**Files:**
- Create: `src/components/EnergyMeter.tsx`
- Modify: `src/app/world/page.tsx` (import near other component imports ~line 5; header right-side `<div>` ~lines 304-314)

- [ ] **Step 1: Write the EnergyMeter component**

Create `src/components/EnergyMeter.tsx`:
```tsx
"use client";

import { useEnergy } from "@/lib/members-store";

// Gamified daily life-energy meter for the /world top bar (spec §6.1).
// A small segmented pip bar that depletes as ambient "moments" are spent.
// It blends into the scene tone (no floating HUD chrome): a row of gold
// pips + a tiny count. When empty, it shifts to a calm "쉬는 중 · 자정 충전"
// state — the plaza is resting, not dead. Tapping opens the upsell (stubbed
// for this increment).
const SEGMENTS = 10;

export function EnergyMeter() {
  const e = useEnergy();
  if (!e) return null; // nothing fetched yet — render nothing (no layout jump)

  const ratio = e.cap > 0 ? e.remaining / e.cap : 0;
  const lit = Math.ceil(ratio * SEGMENTS);
  const empty = e.remaining <= 0;
  const hours = Math.max(1, Math.round(e.resetInMs / 3600_000));

  return (
    <button
      type="button"
      onClick={() => {
        // Upsell entry point — full Plus sheet lands in a later increment.
        alert("매일 자정에 충전돼요. 더 북적이는 광장은 곧 Plus에서 만나요.");
      }}
      aria-label={`오늘의 생명력 ${e.remaining}/${e.cap}`}
      title={empty ? `쉬는 중 · 약 ${hours}시간 후 충전` : `생명력 ${e.remaining}/${e.cap}`}
      className="flex items-center gap-1.5 rounded-full px-1 py-0.5"
    >
      <span className="flex items-center gap-[2px]" aria-hidden>
        {Array.from({ length: SEGMENTS }).map((_, i) => (
          <span
            key={i}
            className={[
              "h-2.5 w-[3px] rounded-full transition-colors",
              i < lit && !empty ? "bg-gold" : "bg-line",
            ].join(" ")}
            style={i < lit && !empty ? { boxShadow: "0 0 5px rgba(212,176,98,0.55)" } : undefined}
          />
        ))}
      </span>
      <span className={["text-[11px] tabular-nums", empty ? "text-dim" : "text-gold-dim"].join(" ")}>
        {empty ? `쉼 · ~${hours}h` : e.remaining}
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Import EnergyMeter in the /world page**

In `src/app/world/page.tsx`, with the other component imports near the top (e.g. after the `AmbientHeader` import on line 5), add:
```tsx
import { EnergyMeter } from "@/components/EnergyMeter";
```

- [ ] **Step 3: Render EnergyMeter in the header right cluster**

In `src/app/world/page.tsx`, the header right-side cluster (around lines 304-314) reads:
```tsx
    <div className="flex items-center gap-4">
      <a href="/home" aria-label="광장 홈" title="광장 홈" className="text-[26px] ...">
        🌐
      </a>
      <MeGlyph onOpen={() => setMeOpen(true)} />
    </div>
```
Insert `<EnergyMeter />` as the first child of that `<div>` (before the `/home` link):
```tsx
    <div className="flex items-center gap-4">
      <EnergyMeter />
      <a href="/home" aria-label="광장 홈" title="광장 홈" className="text-[26px] ...">
        🌐
      </a>
      <MeGlyph onOpen={() => setMeOpen(true)} />
    </div>
```
(Match the existing `<a>`/`className` text exactly as it appears in the file; only the added `<EnergyMeter />` line is new.)

- [ ] **Step 4: Verify typecheck + build**

Run: `npm run typecheck && npm run build`
Expected: both succeed; build output lists `/world` and compiles with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/EnergyMeter.tsx src/app/world/page.tsx
git commit -m "feat(energy): gamified daily-energy meter in /world top bar"
```

---

## Task 8: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Start a clean dev server**

Run: `NODE_ENV=development npm run dev` (note the port it prints, e.g. 3000/3100).
Expected: "Ready" with no compile errors.

- [ ] **Step 2: Verify the meter renders and reflects DB state**

Log in, open `/world`. Confirm the gold pip meter shows in the top-right with a count. Then force a low value and confirm the UI follows within ~8s (one poll):
```bash
./scripts/db.sh -q "update public.worlds set moments_used=78, moments_day=to_char((now() at time zone 'Asia/Seoul'),'YYYY-MM-DD') where owner_id=(select id from auth.users limit 1)"
```
Expected: meter drops to ~2 remaining (≈1 lit pip).

- [ ] **Step 3: Verify the rest state**

Force exhaustion:
```bash
./scripts/db.sh -q "update public.worlds set moments_used=80 where owner_id=(select id from auth.users limit 1)"
```
Expected within ~8s: meter shows the "쉼 · ~Nh" state (dim, all pips unlit), and no new ambient bubbles appear (tick returns `quota-exhausted:moment`). Owner interjection (typing in the composer) still gets a reply (interjection reserve).

- [ ] **Step 4: Reset to a normal state**

```bash
./scripts/db.sh -q "update public.worlds set moments_used=0 where owner_id=(select id from auth.users limit 1)"
```
Expected: meter refills to full on the next poll.

- [ ] **Step 5: Confirm model routing in logs**

With the dev server running and `/world` open, watch the server console. Ambient AI↔AI lines should generate (now on Sonnet); when you @-mention a member or type to the room, that reply uses Opus. Confirm `[ambient]` log lines still appear and bubbles render. (No assertion script — this is observational; the cost cut is in which model each path passes.)

- [ ] **Step 6: Final regression of the pure module**

Run: `npm run test:energy && npm run typecheck`
Expected: `energy: all assertions passed` and a clean typecheck.

---

## Self-Review

**Spec coverage:**
- §5.2 model routing → Task 3. ✓
- §6 metering (moment unit, daily reset, rest on exhaustion, interjection reserve) → Tasks 1, 2, 4. ✓
- §6.1 gamified top meter + rest state + upsell entry → Task 7. ✓
- §8 data model (plan flag, moments/interject counters) → Task 1; enforcement → Task 4. ✓
- Out-of-scope items (caching, society-size caps, catch-up depth, payments) are explicitly deferred in the header. ✓

**Placeholder scan:** No TBD/TODO. Every code step shows full code. The upsell `alert()` is an intentional, labeled stub for this increment (full Plus sheet deferred), not a placeholder gap.

**Type consistency:** `Plan`, `EnergyKind`, `Counter`, `EnergyView`, `kstDayLabel`, `withDailyReset`, `remaining`, `planCap`, `energyView` are defined in Task 2 and used with the same signatures in Tasks 4, 5, 6. `energyKind` values `"moment"|"interject"` map to column pairs `moments_*`/`interject_*` consistently in Tasks 1 and 4. `useEnergy()` (Task 6) is consumed in Task 7. Response field `energy` (Task 5) matches the parse in Task 6.

**Note on verification:** the repo has no unit-test framework, so only the pure module is unit-tested (`tsx`); the stateful pieces are verified via typecheck, build, real DB mutations through `scripts/db.sh`, and manual render. This matches the project's existing verification style (node scripts + manual/prod smoke).
