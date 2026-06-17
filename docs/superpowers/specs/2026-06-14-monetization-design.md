# EHTO Monetization & Cost Strategy — Design (V1)

> Status: design approved in brainstorming 2026-06-14. Numbers marked
> "(hypothesis)" are starting values to validate against measured cost.

## 1. Goal

Make EHTO economically sustainable without breaking its core promise — "a
world that keeps living even when you're away." Two coupled problems:

1. **Cost** is dominated by the conversation LLM and scales with *engagement
   time*, not with users — the classic "your best users cost the most."
2. **Revenue** must be recurring (to match the recurring cost) and must fit a
   presence/belonging product, not a utility.

## 2. Cost reality (measured from code, 2026-06-14)

The ambient engine (`src/lib/ambient-loop.ts`) is called on each `/world`
poll (~every 8s while the owner is present). Per tick that passes the silence
gate (18% / 35% / 60% by silence length) it makes **one Claude call** — one
member line. So:

- Cost ∝ (time owner spends in `/world`) × (gate pass rate) ≈ ~2–3 calls/min.
- **Member count and plaza count do NOT change calls-per-minute** (one speaker
  per tick). They affect richness and image-gen cost only.
- Current model is **Opus 4.7** for every tick (`CHAT_MODEL` in
  `src/lib/claude.ts`), ≈ $0.03–0.04/call ⇒ ~$6–7 per heavy viewing hour.
  Unsustainable for any free tier as-is.
- There is **no usage/quota/billing tracking** in the codebase today.

**Conclusion:** the unit cost of one "moment" (one ambient call) must come
down *before* a free tier is viable. Quantity caps are the ceiling; unit-cost
reduction is what makes the floor affordable.

## 3. Constraints (from the founder)

- **Quality must never visibly drop.** No shorter/blander replies, no dumber
  model where the user would notice. Control by **quantity**, not quality.
- **Create desirable scarcity ("아쉬움").** The free tier should satisfy yet
  leave the user wanting more — driving daily return and upgrade.
- **The world must not die.** Limits make a plaza *rest*, never go permanently
  dark.
- Honors existing product guardrails (`PRD.md` §9): the in-world UI never says
  "AI/bot"; the user is part of the world, not its protagonist.

## 4. Strategy overview — three layers

```
Layer 1  Cost reduction      (independent; pure upside; ship FIRST)
Layer 2  Quantity metering    (the tiers; runs on a manual plan flag first)
Layer 3  Payments             (subscription lifecycle; separate integration)
```

Each layer is its own implementation cycle. Layer 1 lowers burn-rate with no
dependency on the others and de-risks everything, so it ships first.

## 5. Layer 1 — Cost reduction (no quality change)

### 5.1 Prompt caching
Cache the static prefix of the ambient call — system rules + persona + bias
line + news block (the large, stable part). Ticks are ~8–20s apart, inside
Anthropic's 5-minute cache TTL, so cache hits are near-constant. Expected
input-cost reduction ~70–90%, output identical, **zero quality change**.
(See the `claude-api` skill for the caching pattern.)

### 5.2 Model tiering (approved)
- **Filler (AI ↔ AI ambient): Sonnet 4.6.** The code's own note in
  `src/lib/claude.ts` states quality is "effectively indistinguishable" from
  Opus for short Korean chat. This is a cost cut, not a quality cut.
- **User-directed turns (@mention replies, the owner's 끼어들기 reply): Opus
  4.7.** These are the moments the user feels most, so they stay top-tier.
- Routing lives at the call site (ambient-loop chooses model by intent:
  `reply-user`/`reply-user-mention` → Opus, everything else → Sonnet).

### 5.3 Deferred away-simulation (catch-up)
Today the loop already mutes when the owner is absent >5 min. Extend the
principle: **do not run live AI while away at all.** On return, generate the
"while you were gone" feeling with a **single batched call** that synthesizes
N recent "moments" (events, a relationship development, an object that grew).
Cost then scales with *visits*, not with *absence duration*, while preserving
the "time passed" feeling. Catch-up depth is also a paid lever (§6).

### 5.4 Combined effect (hypothesis)
Caching + Sonnet filler ⇒ ~$0.001–0.003 per moment (down from $0.03–0.04).
Only at that unit cost does a free daily allotment become affordable.

## 6. Layer 2 — Quantity metering ("Daily Life-Energy" model)

**Unit:** a *moment* = one ambient generation (one Claude call → one member
line). The billed quantity equals the cost unit 1:1, so capping quantity
caps cost directly.

**Daily life-energy:** each plaza has a daily moment budget that refills at
KST midnight. Every moment inside the budget is full quality. When the budget
is spent, the plaza enters a **"rest" (쉼)** state — members idle, the scene
softly dims, copy frames it as natural rest ("내일 다시 깨어나요" / night
narrative), and it auto-refills next day. The world rests; it never dies.

**Levers (all quantity, none touch quality):**

| Lever | Free | Plus | Cost role |
|---|---|---|---|
| **Plaza capacity (residents)** | **6** | **up to 12 (the cap)** | headline value anchor; conversion led by moments, not capacity — see §6.2 |
| Daily moments | **120** (≈60 min/day at ~30s per line) | very high / fair-use unlimited | primary cost governor (mostly invisible) |
| Plazas | 1 | 3 | quantity |
| Catch-up depth | short (3 events) | rich (10+ with relationship changes) | quantity |
| Interjection (끼어들기) replies | small separate reserve (~15/day) | generous | keeps the user *always* able to poke, even at rest |

Rationale for the visible lever: a free plaza of 6 members reads clearly as a
small *society* (enough pairs for real cross-talk) while sitting exactly
half-full against the 12 cap — a clean "unlock the other half" story.
Conversion is led primarily by the daily-moments rest-wall and catch-up depth,
not by capacity; capacity is the value anchor, moments the conversion engine. Crucially, member count does **not** raise per-minute
LLM cost (one speaker per tick regardless of cast size) — it only adds
one-time sprite cost. So capacity is a high-willingness-to-pay value anchor
that is cheap to serve recurring-wise; the daily-moments budget remains the
real recurring-cost governor underneath every tier.

**Interjection reserve:** user-directed replies draw from a small dedicated
daily pool separate from the moment budget, so a rested plaza can still answer
when the owner speaks to it. The user is never fully walled off from
interacting with their own world.

### 6.2 Plaza capacity — the promoted promise (decided 2026-06-14)

**Hard cap: 12 residents per plaza.** This number is fixed and nailed into
marketing/promo copy ("최대 12명이 사는 당신만의 작은 사회"), inspired by
Abeto's *Messenger*, which capped its worlds at 10 *for calm* even though the
tech could hold thousands — small society = the feeling, not a limitation.

- **Free = 6 residents · Plus = up to 12.** Capacity is the visible value the
  pricing ladder is built on; free sits half-full to feel alive yet leave room.
- **Why a hard public cap (not "12+"):** it's a brand promise about *calm and
  intimacy*, not a number to inflate later. Going past 12 would dilute the
  "작은 사회" identity. (Note: the plaza canvas was previously sized for a
  ~30-member target — that is now over-built relative to this decision and
  should be treated as headroom, not a goal.)
- **Cost note:** capacity does not move recurring LLM cost (one speaker per
  tick); it only adds one-time sprite cost per resident. So a 12-cap is cheap
  to serve recurring-wise — the daily-moments budget (§6) is what bounds spend.

**Gradual seeding (initial ramp):** a new plaza does NOT spawn its full tier
capacity at once. It starts with a few residents (≈2–3 active) and grows toward
the tier cap over days via the existing time-based activation system
(`world-seed` / `tickMemberActivations`). This: (1) defers one-time sprite cost,
(2) makes the society feel like it *grows around you* rather than arriving
pre-built, and (3) reinforces the calm, unhurried tone. The tier cap (6 free /
12 Plus) is the ceiling the ramp climbs toward, not the day-one count.

### 6.1 Daily-energy display (UI, approved 2026-06-14)
The daily life-energy is surfaced **at the top of `/world` as a gamified
meter** — a small battery/orb-style energy bar (with the remaining count)
sitting in the top bar alongside the existing ambient (top-left) and me-glyph
(top-right) glyphs. It **depletes visibly** as moments are spent (subtle drain
animation per moment) and shows the refill timing as it nears empty
("자정에 다시 충전"). Reaching empty transitions the plaza into the rest (쉼)
state (§6). The meter is the user-facing embodiment of the "아쉬움" mechanic
and the primary upgrade prompt (tapping it → Plus upsell). Exact placement and
visual treatment are finalized in the implementation plan; it must respect the
guardrail of blending into the scene tone, not floating as a HUD overlay.

### 6.3 Liveliness cadence (decided 2026-06-16)

Target **≈1 ambient line / 30s** while the owner watches — 60s felt too quiet
(a new user's first 1–2 min reads as empty), 30s feels alive without breaking
calm (Abeto *Messenger*'s viral hook was "something is already happening" on
entry). Implemented by pairing TWO knobs (they must move together):

- `/world` poll cadence → **30s** (`src/app/world/page.tsx`).
- ambient short-silence gate → **0.85** (`src/lib/ambient-loop.ts`; was 0.50 —
  at 30s ticks, 0.50 only yields ~50–60s/line).

The moments cap follows from this: free **120** moments ≈ 120 × 30s = **60 min/
day** of viewing — the chosen sweet spot between churn (too-early rest) and weak
conversion pressure (never rests). This is the #1 beta-tuning number; instrument
real moments/session before locking.

### 6.4 Copy voice (decided 2026-06-16)

Monetization surfaces speak in a **restrained, refined** register — neither
SaaS-clichéd (정원 늘리기 / 충전 / 구독) nor overwrought-poetic (깃들다 / 숨을
고르다). Let numbers and plain phrasing carry it. Decided strings:

- Capacity upsell (free 6 → 12): **"더 많은 친구들과 함께 하기"**
- Rest state (moments spent): **"오늘은 여기까지"** (tap → "자정에 다시 이어져요");
  meter inline label "쉼".
- Membership name: **"Plus"** (kept as-is, avoids 프리미엄/구독 baggage).

## 7. Layer 3 — Payments (separate sub-project)

- **Provider:** PortOne (formerly 아임포트) / Toss Payments — Korea-first
  audience, supports domestic cards + recurring billing. (Stripe revisited if/
  when the audience goes global.)
- **Price (working hypothesis):** ₩7,900 / month for "Plus", revisited after
  Layer-1 cost measurement.
- **Lifecycle:** subscribe → webhook sets `plan='plus'` + `current_period_end`
  → renewal webhook extends → cancel/expiry reverts to `free` at period end.
- Until this layer lands, Layer 2 runs on a **manually set plan flag** so
  tiering behavior can be built and tested without live billing.

## 8. Data model & enforcement

- **Plan:** `plan` on the user (or `worlds`): `'free' | 'plus'`, plus
  `plan_status` and `current_period_end` (null for free).
- **Usage counter (per plaza):** `worlds.moments_used INT`,
  `worlds.moments_day DATE` (KST). In the ambient tick, atomically: if
  `moments_day != today` reset to 0 + set today; if `moments_used >= cap(plan)`
  return `{ spoke: null, reason: 'quota-exhausted' }` → triggers rest state;
  else increment and proceed. Reuses the existing atomic-UPDATE pattern the
  per-world ambient lock already uses.
- **Interjection reserve:** analogous `interject_used` / `interject_day`
  counters, checked on the user-reply path in `POST /api/messages`.
- **Society size:** member activation/rotation logic caps active (non-ghost)
  members at `memberCap(plan)`.
- **Rest state:** when the tick returns `quota-exhausted`, the client renders
  the dimmed "쉬는 중" treatment instead of new bubbles; existing persisted
  bubbles remain (consistent with current persistence model).

## 9. Decomposition & sequencing

1. **Sub-project 1 — Cost reduction (§5).** No payment dependency, immediate
   burn-rate cut, no user-visible change beyond cheaper operation. **Do first.**
   Includes a lightweight per-call cost log so §6 numbers can be tuned on real
   data.
2. **Sub-project 2 — Metering & tiers (§6, §8)** on a manual plan flag: usage
   counters, rest state + copy/visual, society-size caps, catch-up depth tiers.
3. **Sub-project 3 — Payments (§7):** PortOne subscription + webhooks wiring
   the plan flag to real billing.

Each gets its own spec → plan → implementation cycle. This document is the
umbrella strategy; the first implementation plan covers Sub-project 1.

## 10. Numbers to validate (after Layer 1 ships cost logging)

- Real per-moment cost with caching + Sonnet filler.
- Distribution of daily viewing minutes → set the free moment cap so the median
  engaged session fits but heavy bingeing hits "아쉬움".
- Free member cap (4?) vs perceived liveliness.
- Price point vs willingness to pay (₩7,900 hypothesis).

## 11. Guardrail alignment

- Quality constant across tiers — only quantity differs. ✓ founder constraint
- World rests, never dies. ✓ product promise
- "Rest" copy and the catch-up feed keep the in-world UI free of "AI/bot"
  language. ✓ `PRD.md` §9
- Recurring revenue covers recurring (LLM) cost; the metered quantity *is* the
  cost unit. ✓ goal
