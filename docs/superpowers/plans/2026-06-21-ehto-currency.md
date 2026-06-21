# EHTO 통합 재화 + 캐릭터 1회 생성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 파편화된 "티켓"을 단일 통화 **EHTO**로 통합하고(에너지와 분리), 캐릭터를 원샷 생성(강한 경고)으로 바꾸며, 첫 진입 환영 모달에서 시작 EHTO 지급·용도를 안내한다.

**Architecture:** 통화는 기존 `ticket_balances`를 단일 `kind='ehto'`로 재활용한다. 액션(멤버 초대·곁에 더·다시 부르기·닮은 곳·에너지 충전·캐릭터 변경)은 EHTO를 가격만큼 원자적으로 차감(`spend_ehto` RPC)한 뒤 수행한다. 에너지(일일 moment)는 활동 미터로 유지하되 EHTO로 top-up 가능. 캐릭터 생성은 재롤 없이 1회, 확정 게이트 모달로 신중을 강제한다.

**Tech Stack:** Next.js 14 / Supabase / TypeScript. 순수 로직은 `npx tsx scripts/test-*.ts` + `node:assert/strict`. 통합은 `npm run typecheck`. **dev 서버가 켜져 있으면 `npm run build` 금지**(.next 손상 → CSS 깨짐). UI는 framer-motion + PixelButton + 토큰(accent #E89B6C), i18n은 `ONBOARDING[locale]`(EHTO 단어는 현지화 안 함).

**Spec:** docs/superpowers/specs/2026-06-21-ehto-currency-design.md

---

## File Structure

**Phase A — 통화 코어**
- Create `supabase/migrations/20260621000003_ehto_currency.sql` — `spend_ehto` RPC + `grant_starter_tickets` 트리거 제거 + 기존 사용자 EHTO 백필.
- Create `src/lib/ehto.ts` — 통화 상수(`EHTO_KIND`, `START_GRANT`), 액션 가격표(`EHTO_ACTIONS`), `grantEhto`/`spendEhto`/`getEhtoBalance`.
- Create `scripts/test-ehto.ts` — 가격표/순수 로직 테스트.
- Modify `src/app/api/onboarding/finalize/route.ts` — 가입 시작 지급(멱등).
- Modify `src/lib/beta-codes.ts` — 초대 보상 `invite 티켓` → `EHTO`.

**Phase B — 소비 엔드포인트**
- Create `src/app/api/ehto/spend/route.ts` — `{ action }` → 가격 차감 + 액션 수행(invite/refill), 실패 환불.
- Create `src/app/api/ehto/balance/route.ts` — 잔액 조회.
- (기존 `src/app/api/tickets/use/route.ts`의 invite/refill 로직을 이관, 라우트는 EHTO로 대체.)

**Phase C — 캐릭터 원샷**
- Modify `src/app/character/page.tsx` — `MAX_ROLLS`/재롤/`TicketChip`/"티켓" 제거, 확정 게이트(강한 경고) 모달.
- Create `src/components/CharacterCommitDialog.tsx` — 원샷 확정 경고 모달.
- Modify `src/lib/onboarding-content.ts` — 경고/환영/EHTO 카피.

**Phase D — 환영 모달 + 잔액 표시**
- Create `src/components/WelcomeDialog.tsx` — 첫 진입 환영 + 시작 EHTO + 용도.
- Modify `src/app/world/page.tsx` — 첫 진입 1회 표시.
- Modify `src/components/MeSheet.tsx` — EHTO 잔액 표시(토큰 글리프 동반).

---

## Phase A — 통화 코어

### Task 1: 마이그레이션 — spend_ehto RPC + 정리 + 백필

**Files:**
- Create: `supabase/migrations/20260621000003_ehto_currency.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260621000003_ehto_currency.sql`:

```sql
-- Unified currency "EHTO" on top of ticket_balances (kind='ehto').
--
-- spend_ehto: atomic multi-unit debit (decrement by p_amount only when the
-- balance covers it), mirroring consume_ticket but parameterized by amount.
-- Also retires the legacy starter-tickets trigger (profiles.tickets is now
-- deprecated) and backfills a starting EHTO grant for existing users.

create or replace function public.spend_ehto(p_user uuid, p_amount integer)
returns integer
language sql
as $$
  update public.ticket_balances
     set balance = balance - p_amount, updated_at = now()
   where user_id = p_user and kind = 'ehto' and balance >= p_amount
  returning balance;
$$;

-- Legacy starter tickets (profiles.tickets) are deprecated — stop the trigger.
drop trigger if exists profiles_starter_tickets on public.profiles;
drop function if exists public.grant_starter_tickets();

-- Backfill: every existing profile gets the starting EHTO grant once (beta is
-- small). New users get it at onboarding finalize instead.
insert into public.ticket_balances (user_id, kind, balance, updated_at)
select id, 'ehto', 10, now() from public.profiles
on conflict (user_id, kind) do nothing;
```

- [ ] **Step 2: Sanity-check the file**

Run: `node -e "const s=require('fs').readFileSync('supabase/migrations/20260621000003_ehto_currency.sql','utf8'); if(!/spend_ehto/.test(s)||!/drop trigger/.test(s)) throw new Error('bad'); console.log('migration ok')"`
Expected: prints `migration ok`

(Apply against the live DB via the project's deploy path / management API at integration time — there is no local DB.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260621000003_ehto_currency.sql
git commit -m "feat(ehto): spend_ehto RPC + retire legacy starter tickets + backfill

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 통화 lib + 가격표 + 테스트

**Files:**
- Create: `src/lib/ehto.ts`
- Test: `scripts/test-ehto.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/test-ehto.ts`:

```ts
import assert from "node:assert/strict";
import { EHTO_ACTIONS, priceOf, START_GRANT, EHTO_KIND } from "../src/lib/ehto";

assert.equal(EHTO_KIND, "ehto");
assert.equal(START_GRANT, 10);

// Every action has a positive integer price + copy.
for (const a of EHTO_ACTIONS) {
  assert.ok(Number.isInteger(a.price) && a.price > 0, `price: ${a.action}`);
  assert.ok(a.label.length > 0 && a.desc.length > 0, `copy: ${a.action}`);
}

// priceOf returns the price for a known action, null for unknown.
assert.equal(priceOf("character_change"), 5);
assert.equal(priceOf("member_invite"), 2);
assert.equal(priceOf("energy_refill"), 1);
assert.equal(priceOf("nope" as never), null);

console.log("ehto: all assertions passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test-ehto.ts`
Expected: FAIL — `Cannot find module '../src/lib/ehto'`

- [ ] **Step 3: Write the module**

Create `src/lib/ehto.ts`:

```ts
// EHTO — the single in-app currency. Stored on ticket_balances under the
// fixed kind 'ehto'. Each spendable action has a price here; the spend API
// debits EHTO atomically (spend_ehto RPC) then performs the action.
//
// Energy (daily moments) stays separate; energy_refill is the bridge that
// lets EHTO top up a rested plaza.

import type { SupabaseClient } from "@supabase/supabase-js";

export const EHTO_KIND = "ehto" as const;
export const START_GRANT = 10; // EHTO granted once at onboarding finalize

export type EhtoAction =
  | "character_change"
  | "member_invite"
  | "member_keep"
  | "member_recall"
  | "plaza_recommend"
  | "energy_refill";

export type EhtoActionMeta = {
  action: EhtoAction;
  price: number;       // EHTO cost (hypothesis — tunable)
  label: string;
  desc: string;
  actionable: boolean; // whether the underlying action is wired yet
};

export const EHTO_ACTIONS: EhtoActionMeta[] = [
  { action: "character_change", price: 5, label: "캐릭터 변경", desc: "새로운 모습으로 다시 생성해요.", actionable: true },
  { action: "member_invite",    price: 2, label: "초대",        desc: "기다리던 친구 한 명을 지금 광장으로.", actionable: true },
  { action: "energy_refill",    price: 1, label: "이어서 보기", desc: "쉬고 있는 광장을 오늘 다시 깨워요.", actionable: true },
  { action: "member_keep",      price: 1, label: "조금 더 곁에", desc: "떠나려는 친구를 붙잡아요.", actionable: false },
  { action: "member_recall",    price: 2, label: "다시 부르기", desc: "떠난 친구를 다시 불러요.", actionable: false },
  { action: "plaza_recommend",  price: 1, label: "닮은 곳",     desc: "내 광장과 닮은 곳을 찾아요.", actionable: false },
];

const _byAction = new Map(EHTO_ACTIONS.map((a) => [a.action, a]));

/** Price for an action, or null if unknown. */
export function priceOf(action: EhtoAction): number | null {
  return _byAction.get(action)?.price ?? null;
}

export function isEhtoAction(v: string): v is EhtoAction {
  return _byAction.has(v as EhtoAction);
}

/** Current EHTO balance (0 when unset). Service-role read. */
export async function getEhtoBalance(svc: SupabaseClient, userId: string): Promise<number> {
  const { data } = await svc
    .from("ticket_balances")
    .select("balance")
    .eq("user_id", userId)
    .eq("kind", EHTO_KIND)
    .maybeSingle();
  return (data?.balance as number | undefined) ?? 0;
}

/** Grant n EHTO (service role). Read-modify-write is fine (grants aren't
 *  concurrent per user). Returns the new balance. */
export async function grantEhto(svc: SupabaseClient, userId: string, n: number): Promise<number> {
  const { data: existing } = await svc
    .from("ticket_balances")
    .select("balance")
    .eq("user_id", userId)
    .eq("kind", EHTO_KIND)
    .maybeSingle();
  const next = Math.max(0, ((existing?.balance as number | undefined) ?? 0) + n);
  const { error } = await svc.from("ticket_balances").upsert({
    user_id: userId, kind: EHTO_KIND, balance: next, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`grantEhto: ${error.message}`);
  return next;
}

/** Atomically spend `amount` EHTO. Returns the new balance, or null when the
 *  balance was insufficient (caller treats null as "not enough EHTO"). */
export async function spendEhto(svc: SupabaseClient, userId: string, amount: number): Promise<number | null> {
  const { data, error } = await svc.rpc("spend_ehto", { p_user: userId, p_amount: amount });
  if (error) throw new Error(`spendEhto: ${error.message}`);
  return typeof data === "number" ? data : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test-ehto.ts`
Expected: PASS — `ehto: all assertions passed`

- [ ] **Step 5: Verify typecheck + commit**

Run: `npm run typecheck` → expect clean.
```bash
git add src/lib/ehto.ts scripts/test-ehto.ts
git commit -m "feat(ehto): currency lib — prices, grant/spend/balance

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 가입 시작 지급 (finalize, 멱등)

**Files:**
- Modify: `src/app/api/onboarding/finalize/route.ts`

**Context:** finalize는 신규 가입의 원자적 확정 지점. 여기서 시작 EHTO를 1회 지급한다. 멱등: 백필/재진입과 겹치지 않도록 "잔액이 0이고 아직 지급 표시가 없을 때만" 지급하는 대신, 간단히 **현재 잔액이 0일 때만** START_GRANT 지급(백필이 이미 채웠으면 스킵; 신규는 0이라 지급). 베타 규모에서 충분히 안전.

- [ ] **Step 1: Add the grant**

In `src/app/api/onboarding/finalize/route.ts`, add the import near the other lib imports:
```ts
import { getEhtoBalance, grantEhto, START_GRANT } from "@/lib/ehto";
```

Then, after the world is created + codes are issued (after the `issueCodesForUser(svc, uid)` call, before the final `return`), add:
```ts
  // Starting EHTO — granted once. New users have a 0 balance here (the backfill
  // only touched pre-existing profiles), so this is effectively idempotent.
  if ((await getEhtoBalance(svc, uid)) === 0) {
    await grantEhto(svc, uid, START_GRANT);
  }
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck` → expect clean.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/onboarding/finalize/route.ts
git commit -m "feat(ehto): grant starting EHTO at onboarding finalize

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 초대 보상 → EHTO

**Files:**
- Modify: `src/lib/beta-codes.ts`

**Context:** `maybeGrantInviteReward`는 현재 `grant(svc, ownerId, "invite", 1)`로 invite 티켓을 준다. 통화 통일에 맞춰 EHTO를 준다(가설 3).

- [ ] **Step 1: Swap the grant**

In `src/lib/beta-codes.ts`:

Change the import line `import { grant } from "@/lib/ticket-balance";` to:
```ts
import { grantEhto } from "@/lib/ehto";
```

In `maybeGrantInviteReward`, change `await grant(svc, ownerId, "invite", 1);` to:
```ts
  await grantEhto(svc, ownerId, 3); // invite-completion reward, in EHTO
```

- [ ] **Step 2: Verify typecheck + pure test still green**

Run: `npm run typecheck` → expect clean.
Run: `npx tsx scripts/test-beta-codes.ts` → expect `beta-codes: all assertions passed`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/beta-codes.ts
git commit -m "feat(ehto): invite-completion reward pays EHTO (was an invite ticket)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase B — 소비 엔드포인트

### Task 5: GET /api/ehto/balance

**Files:**
- Create: `src/app/api/ehto/balance/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/ehto/balance/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { userClient, serviceClient } from "@/lib/supabase";
import { getEhtoBalance } from "@/lib/ehto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ehto/balance → { balance }
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "missing auth" }, { status: 401 });
  const sb = userClient(token);
  const { data: userData, error } = await sb.auth.getUser();
  if (error || !userData.user) return NextResponse.json({ error: "invalid session" }, { status: 401 });
  const balance = await getEhtoBalance(serviceClient(), userData.user.id);
  return NextResponse.json({ balance });
}
```

- [ ] **Step 2: typecheck + commit**

Run: `npm run typecheck` → expect clean.
```bash
git add src/app/api/ehto/balance/route.ts
git commit -m "feat(ehto): GET /api/ehto/balance

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: POST /api/ehto/spend (invite + energy_refill)

**Files:**
- Create: `src/app/api/ehto/spend/route.ts`

**Context:** `{ action }`를 받아 `priceOf(action)` 만큼 `spendEhto`로 원자 차감 후 액션 수행. 실패 시 `grantEhto`로 환불. 우선 actionable한 둘만 구현: `member_invite`(대기 멤버 1명 활성화 — 기존 `/api/tickets/use`의 invite 로직 이관), `energy_refill`(해당 월드 `moments_used`를 30 감소). 나머지(keep/recall/recommend/character_change)는 actionable=false거나 별도 흐름(character_change는 캐릭터 페이지에서 처리, Task 9)이라 여기선 400/“준비 중”.

Read `src/app/api/tickets/use/route.ts` for the existing invite precheck + activation + system message pattern, and `src/lib/system-messages.ts` (`sysMemberJoined`), `src/lib/energy.ts` (`memberCap`, `Plan`).

- [ ] **Step 1: Write the route**

Create `src/app/api/ehto/spend/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { userClient, serviceClient } from "@/lib/supabase";
import { isEhtoAction, priceOf, spendEhto, grantEhto, type EhtoAction } from "@/lib/ehto";
import { memberCap, type Plan } from "@/lib/energy";
import { sysMemberJoined } from "@/lib/system-messages";
import type { Locale } from "@/lib/language";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/ehto/spend { action } → spend EHTO and perform the action.
// Only the actionable in-plaza acts are wired here; character_change is
// handled in the character flow. Flow: precheck → atomic spend → perform →
// refund on failure.
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "missing auth" }, { status: 401 });
  const sb = userClient(token);
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) return NextResponse.json({ error: "invalid session" }, { status: 401 });
  const userId = userData.user.id;

  let body: { action?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const action = body.action;
  if (!action || !isEhtoAction(action)) {
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  }
  if (action !== "member_invite" && action !== "energy_refill") {
    return NextResponse.json({ error: "아직 준비 중이에요" }, { status: 400 });
  }
  const price = priceOf(action as EhtoAction)!;

  const svc = serviceClient();
  const { data: world } = await svc
    .from("worlds")
    .select("id, plan, language, moments_used")
    .eq("owner_id", userId)
    .maybeSingle();
  if (!world) return NextResponse.json({ error: "광장이 아직 없어요" }, { status: 400 });
  const language = ((world.language ?? "ko") as Locale);

  // ── precheck (don't spend on an action that can't run) ──
  let benchId: string | null = null;
  let benchName = "";
  if (action === "member_invite") {
    const cap = memberCap((world.plan ?? "free") as Plan);
    const { count: active } = await svc
      .from("members")
      .select("id", { count: "exact", head: true })
      .eq("current_location_world_id", world.id)
      .not("activated_at", "is", null)
      .not("status", "in", "(ghost,banned)");
    if ((active ?? 0) >= cap) return NextResponse.json({ error: "정원이 찼어요" }, { status: 409 });
    const { data: bench } = await svc
      .from("members")
      .select("id, name")
      .eq("current_location_world_id", world.id)
      .is("activated_at", null)
      .limit(1)
      .maybeSingle();
    if (!bench) return NextResponse.json({ error: "대기 중인 친구가 없어요" }, { status: 409 });
    benchId = bench.id as string;
    benchName = (bench.name as string) ?? "";
  }

  // ── atomic spend ──
  const after = await spendEhto(svc, userId, price);
  if (after === null) return NextResponse.json({ error: "EHTO가 부족해요" }, { status: 402 });

  // ── perform (refund on failure) ──
  try {
    if (action === "member_invite") {
      await svc.from("members").update({ activated_at: new Date().toISOString() }).eq("id", benchId).is("activated_at", null);
      await svc.from("messages").insert({ world_id: world.id, kind: "system", text: sysMemberJoined(language, benchName) });
    } else if (action === "energy_refill") {
      const cur = (world.moments_used as number | null) ?? 0;
      await svc.from("worlds").update({ moments_used: Math.max(0, cur - 30) }).eq("id", world.id);
    }
  } catch (e) {
    await grantEhto(svc, userId, price).catch(() => {});
    console.error("[ehto/spend] action failed, refunded:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "처리에 실패해 EHTO를 돌려드렸어요" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, balance: after });
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck` → expect clean. (Confirm `sysMemberJoined(locale, name)` signature against `src/lib/system-messages.ts`; adjust the call if its parameter order differs.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ehto/spend/route.ts
git commit -m "feat(ehto): POST /api/ehto/spend (member_invite + energy_refill)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase C — 캐릭터 원샷

### Task 7: i18n 카피 — 경고/환영/EHTO

**Files:**
- Modify: `src/lib/onboarding-content.ts`

- [ ] **Step 1: Add a `commit` + `welcome` block to OnboardingCopy.character (and welcome to a new top-level key)**

In `src/lib/onboarding-content.ts`, add to the `character` sub-type (after `genGeneric: string;`):
```ts
    commitTitle: string;
    commitBody: string;
    commitNote: string;
    commitConfirm: string;
    commitCancel: string;
```
Add a new top-level `welcome` block to the `OnboardingCopy` type (after the `character` block):
```ts
  welcome: {
    title: string;
    body: string;       // "{n}" → start grant
    spendIntro: string;
    cta: string;
  };
```

Then add the values to each locale. For `ko.character` (after `genGeneric: "오류",`):
```ts
    commitTitle: "신중하게 골라주세요",
    commitBody: "이 모습이 당신의 캐릭터가 됩니다. 지금은 한 번만 생성되고 다시 만들 수 없어요.",
    commitNote: "나중에 변경할 수 있지만, EHTO가 들어요.",
    commitConfirm: "이대로 생성",
    commitCancel: "다시 고르기",
```
For `ko.welcome` (new block):
```ts
  welcome: {
    title: "환영합니다",
    body: "시작 선물로 EHTO {n}개를 드렸어요.",
    spendIntro: "EHTO로 친구를 초대하고, 광장을 이어보고, 나중에 캐릭터도 바꿀 수 있어요.",
    cta: "광장으로",
  },
```
For `en.character`:
```ts
    commitTitle: "Choose carefully",
    commitBody: "This becomes your character. It's generated once and can't be remade right now.",
    commitNote: "You can change it later — but it costs EHTO.",
    commitConfirm: "Create as is",
    commitCancel: "Go back",
```
For `en.welcome`:
```ts
  welcome: {
    title: "Welcome",
    body: "We've given you {n} EHTO to start.",
    spendIntro: "Spend EHTO to invite friends, keep your plaza awake, and change your character later.",
    cta: "Enter the plaza",
  },
```
For `ja.character`:
```ts
    commitTitle: "慎重に選んでください",
    commitBody: "この姿があなたのキャラクターになります。生成は一度きりで、今は作り直せません。",
    commitNote: "あとで変更できますが、EHTOがかかります。",
    commitConfirm: "この姿で生成",
    commitCancel: "選び直す",
```
For `ja.welcome`:
```ts
  welcome: {
    title: "ようこそ",
    body: "はじめの贈り物として EHTO を {n} 個お渡ししました。",
    spendIntro: "EHTOで友だちを招いたり、広場を起こしたり、あとでキャラクターを変えられます。",
    cta: "広場へ",
  },
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck` → expect clean (all three locales must define `welcome` + the new `character.commit*` keys or TS errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/onboarding-content.ts
git commit -m "feat(i18n): character commit warning + welcome copy (EHTO)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 캐릭터 확정 경고 모달

**Files:**
- Create: `src/components/CharacterCommitDialog.tsx`

**Context:** 원샷 생성 직전 "신중히" 경고 게이트. `StartResultDialog.tsx`를 패턴 템플릿으로 사용(framer-motion 중앙 모달, accent, PixelButton). `kind` 대신 항상 경고 1종.

- [ ] **Step 1: Write the component**

Create `src/components/CharacterCommitDialog.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PixelButton } from "@/components/PixelButton";
import type { ONBOARDING } from "@/lib/onboarding-content";

type CharCopy = (typeof ONBOARDING)["ko"]["character"];

// One-shot character creation gate. Generation is irreversible (no re-roll),
// so this forces a deliberate confirm with a clear warning that later changes
// cost EHTO.
export function CharacterCommitDialog(props: {
  open: boolean;
  copy: CharCopy;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { open, copy } = props;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") props.onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, props]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }} onClick={props.onCancel}
            className="absolute inset-0 bg-black/55"
          />
          <motion.div
            role="dialog" aria-modal="true"
            initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ type: "tween", duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="border-line bg-surface relative w-full max-w-sm rounded-2xl border p-7 text-center shadow-[0_24px_70px_-24px_rgba(0,0,0,0.75)]"
          >
            <div className="border-accent text-accent mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border-2 text-[24px]">!</div>
            <h2 className="text-ink text-[20px] font-semibold tracking-[-0.01em]">{copy.commitTitle}</h2>
            <p className="text-sub mt-2 text-[14px] leading-relaxed">{copy.commitBody}</p>
            <p className="text-sub mt-2 text-[13px] leading-relaxed">{copy.commitNote}</p>
            <div className="mt-7 flex flex-col gap-3">
              <PixelButton variant="primary" size="lg" block onClick={props.onConfirm}>{copy.commitConfirm}</PixelButton>
              <button onClick={props.onCancel} className="text-sub text-center text-[13px] active:opacity-70">{copy.commitCancel}</button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: typecheck + commit**

Run: `npm run typecheck` → expect clean.
```bash
git add src/components/CharacterCommitDialog.tsx
git commit -m "feat(character): one-shot commit warning dialog

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 캐릭터 페이지 — 재롤/티켓 제거 + 확정 게이트

**Files:**
- Modify: `src/app/character/page.tsx`

**Context:** 원샷으로 전환. Read the file first. Current: `MAX_ROLLS=3`, `rollsUsed` state, `remaining`/`canRoll`, `TicketChip`, `GeneratingView`, `ResultView` with `onReroll`, the generate footer CTA showing `t.createBtn`/`createBtnExhausted`. Changes:

- [ ] **Step 1: Remove the roll/ticket machinery**

In `src/app/character/page.tsx`:
- Delete the `const MAX_ROLLS = 3;` line and the `rollsUsed`/`setRollsUsed` state. Replace `const remaining = MAX_ROLLS - rollsUsed; const canRoll = remaining > 0;` with `const canRoll = true;` (generation is gated by the commit dialog, not a roll count). Remove the `if (rollsUsed >= MAX_ROLLS) {...}` guard and the `setRollsUsed((n) => n + 1);` line inside `generate()`.
- Remove the `<TicketChip ... />` render in the header and the entire `TicketChip` function definition.
- In `ResultView`, remove the re-roll button (`onReroll` / "다시 만들기"), keeping only "이 모습으로 들어가기"(→ naming) and "다시 고르기"(→ back to select). Remove `remaining`/`canRoll`/`onReroll` from `ResultView`'s props + its call site.
- In `SelectView`, the last-step button currently shows `t.createBtn.replace("{n}", String(props.remaining))` / `t.createBtnExhausted`. Replace with a single label `t.selCreate` (add this key in Task 7? — to avoid scope creep, reuse: change the last-step PixelButton label to `nav.next === ... ` no). Use a plain create label: replace that ternary with `t.resEnter`? No — that's "enter as this look". Instead, the last-step button should open the COMMIT dialog. Set its label to a literal create string already in copy: use `t.createBtnExhausted`? No. **Add `t.selCreate`** in onboarding-content (do this as part of this task): add `selCreate: string;` to the character type and ko "캐릭터 생성", en "Create character", ja "キャラクターを作る". Then the last-step button label = `t.selCreate`, and its onClick opens the commit dialog (Step 2) instead of calling `props.onGenerate` directly.

- [ ] **Step 2: Wire the commit dialog**

In `CharacterPage`, add `const [confirming, setConfirming] = useState(false);` and import `CharacterCommitDialog` + (already imported) `ONBOARDING`/`useLocale`. The SelectView's create action now sets `confirming = true` (pass an `onRequestCreate` prop to SelectView that the last-step button calls). Render at the page level:
```tsx
<CharacterCommitDialog
  open={confirming}
  copy={ONBOARDING[locale].character}
  onConfirm={() => { setConfirming(false); generate(); }}
  onCancel={() => setConfirming(false)}
/>
```
(`locale` from `useLocale(DEFAULT_LOCALE)` at the CharacterPage level — add if not already present at that scope.) `generate()` runs the one-shot generation (unchanged minus the roll guard).

- [ ] **Step 3: Verify no leftover roll/ticket references + typecheck**

Run: `grep -nE "MAX_ROLLS|rollsUsed|TicketChip|onReroll|createBtnExhausted|t\\.createBtn\\b" src/app/character/page.tsx` → expect NO output.
Run: `npm run typecheck` → expect clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/character/page.tsx src/lib/onboarding-content.ts
git commit -m "feat(character): one-shot creation — drop re-rolls/ticket UI, add commit gate

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase D — 환영 모달 + 잔액 표시

### Task 10: 환영 모달

**Files:**
- Create: `src/components/WelcomeDialog.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/WelcomeDialog.tsx`:

```tsx
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { PixelButton } from "@/components/PixelButton";
import type { ONBOARDING } from "@/lib/onboarding-content";
import { START_GRANT } from "@/lib/ehto";

type WelcomeCopy = (typeof ONBOARDING)["ko"]["welcome"];

// One-time welcome shown on first plaza entry: celebrates, announces the
// starting EHTO grant, and previews what EHTO is for.
export function WelcomeDialog(props: { open: boolean; copy: WelcomeCopy; onClose: () => void }) {
  const { open, copy } = props;
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-5">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }} className="absolute inset-0 bg-black/55"
          />
          <motion.div
            role="dialog" aria-modal="true"
            initial={{ opacity: 0, scale: 0.94, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ type: "tween", duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            className="border-line bg-surface relative w-full max-w-sm rounded-2xl border p-7 text-center shadow-[0_24px_70px_-24px_rgba(0,0,0,0.75)]"
          >
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.08, type: "spring", stiffness: 240, damping: 16 }}
              className="bg-accent/15 text-accent mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full text-[20px] font-semibold"
            >◆</motion.div>
            <h2 className="text-ink text-[20px] font-semibold tracking-[-0.01em]">{copy.title}</h2>
            <p className="text-ink mt-2 text-[15px] leading-relaxed">
              {copy.body.replace("{n}", String(START_GRANT))}
            </p>
            <p className="text-sub mt-2 text-[13px] leading-relaxed">{copy.spendIntro}</p>
            <div className="mt-7">
              <PixelButton variant="primary" size="lg" block onClick={props.onClose}>{copy.cta}</PixelButton>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: typecheck + commit**

Run: `npm run typecheck` → expect clean.
```bash
git add src/components/WelcomeDialog.tsx
git commit -m "feat(ehto): first-entry welcome dialog (starting grant + uses)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: 첫 진입에 환영 모달 표시 (1회성)

**Files:**
- Modify: `src/app/world/page.tsx`

**Context:** `/world` 첫 진입 시 1회만. 멱등은 localStorage 플래그(`ehto:welcomed`)로 충분(서버 마커는 후속). `/world` is a client component with `useLocale`? It uses `world.language`/locale; add `useLocale(DEFAULT_LOCALE)` for the UI copy. Read the file to find a good mount point.

- [ ] **Step 1: Add the welcome gate**

In `src/app/world/page.tsx`:
- Imports:
```ts
import { WelcomeDialog } from "@/components/WelcomeDialog";
import { ONBOARDING } from "@/lib/onboarding-content";
import { useLocale } from "@/lib/use-locale";
import { DEFAULT_LOCALE } from "@/lib/about-content";
```
- State + effect (place with the other hooks):
```ts
  const { locale } = useLocale(DEFAULT_LOCALE);
  const [welcome, setWelcome] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem("ehto:welcomed")) setWelcome(true);
    } catch { /* private mode — skip */ }
  }, []);
```
- Render (near the end of the returned JSX, top level):
```tsx
      <WelcomeDialog
        open={welcome}
        copy={ONBOARDING[locale].welcome}
        onClose={() => {
          setWelcome(false);
          try { localStorage.setItem("ehto:welcomed", "1"); } catch { /* ignore */ }
        }}
      />
```

- [ ] **Step 2: Verify typecheck + dev loads**

Run: `npm run typecheck` → expect clean.
Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/world` → expect `200` (a dev server is assumed running on 3001; do NOT run `npm run build`).

- [ ] **Step 3: Commit**

```bash
git add src/app/world/page.tsx
git commit -m "feat(ehto): show welcome dialog once on first plaza entry

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: EHTO 잔액 표시 (MeSheet)

**Files:**
- Modify: `src/components/MeSheet.tsx`

**Context:** 프로필 시트에 EHTO 잔액 한 줄(토큰 글리프 ◆ 동반) 추가. Read `MeSheet.tsx` for its structure + how it gets the session token (mirror an existing fetch). Fetch `/api/ehto/balance` on open.

- [ ] **Step 1: Add a balance row**

In `src/components/MeSheet.tsx`, add a small client fetch of `/api/ehto/balance` (bearer token like the sheet's other calls) into state `ehto: number | null`, and render a row inside the sheet body:
```tsx
{ehto !== null && (
  <div className="border-line flex items-center justify-between rounded-xl border px-4 py-3">
    <span className="text-sub text-[13px]">EHTO</span>
    <span className="text-ink text-[15px] font-semibold tabular-nums">◆ {ehto}</span>
  </div>
)}
```
(Place it among the existing owner rows. Use the sheet's existing `open`/session pattern; fetch when the sheet opens.)

- [ ] **Step 2: Verify typecheck + commit**

Run: `npm run typecheck` → expect clean.
```bash
git add src/components/MeSheet.tsx
git commit -m "feat(ehto): show EHTO balance in profile sheet

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- §2 통화 모델(단일 ehto, spend_ehto RPC, grant/spend/balance) → Tasks 1, 2. ✓
- §3 소비 메뉴(가격표) → Task 2 (EHTO_ACTIONS) + Task 6 (invite/refill 수행). character_change → Task 9. keep/recall/recommend = actionable:false(코드상 표기, 미수행) — 스펙도 후속. ✓
- §4 획득(가입 지급/관리자/구매) → Task 3 (signup grant). 관리자/구매 = 후속(§10 미포함). ✓
- §5 캐릭터 원샷 + 강한 경고(신중) → Tasks 7, 8, 9. ✓
- §6 에너지 별도 + refill 다리 → Task 6 (energy_refill → moments_used -30). ✓
- §7 환영 모달 → Tasks 10, 11. ✓
- §8 UI/네이밍(EHTO + 글리프 ◆) → Tasks 10, 12. ✓
- §9 정리/마이그레이션(ticket_balances 단일화, 레거시 트리거 제거, 백필, 초대보상 EHTO) → Tasks 1, 4. ✓ (tickets.ts 5종 메타 완전 제거 + /api/tickets/use 폐지는 EHTO_ACTIONS/ehto-spend로 대체되며 구 라우트는 잔존해도 무해 — 정리는 후속 청소 항목으로 둠.)

**Placeholder scan:** 코드 스텝은 완전. UI/DB는 단위 테스트 불가 → typecheck + dev curl + 수동으로 검증(이 코드베이스 관례). placeholder 없음.

**Type consistency:**
- `EHTO_KIND`/`START_GRANT`/`EhtoAction`/`EHTO_ACTIONS`/`priceOf`/`isEhtoAction`/`grantEhto`/`spendEhto`/`getEhtoBalance` — Task 2 정의, Tasks 3·5·6·10에서 동일 사용. ✓
- `spend_ehto(p_user, p_amount)` RPC(Task 1) ↔ `spendEhto`(Task 2)에서 동일 인자. ✓
- `ONBOARDING[locale].character.commit*` + `.welcome.*` — Task 7 정의, Tasks 8·9·10·11에서 사용. ✓
- `CharacterCommitDialog`(Task 8) props ↔ Task 9 호출, `WelcomeDialog`(Task 10) props ↔ Task 11 호출. ✓
