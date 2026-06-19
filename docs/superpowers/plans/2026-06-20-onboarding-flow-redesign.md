# 시작 흐름 개편 (Onboarding Redesign) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 신규 사용자를 `시작하기 → 초대코드 → 방이름 → 인증 모달(구글/이메일) → 캐릭터` 순서로 온보딩하고, 유저당 일회용 초대코드 3개 + 친구 3명 가입 완료 시 보너스 초대 티켓을 지급한다.

**Architecture:** 인증 전 입력(코드·방이름)은 localStorage 드래프트로 들고, 인증 성공 후 단일 `finalize` 엔드포인트가 원자적으로 코드 소진 + 초대 보상 체크 + 월드 생성 + 본인 코드 3개 발급을 처리한다(spec Approach A). 백엔드(마이그레이션·lib·엔드포인트)를 먼저 세우고 위저드/인증 UI, 마지막으로 정리·프로필 UI를 얹는다.

**Tech Stack:** Next.js 14 (App Router) / Supabase (auth + Postgres) / TypeScript. 단위 테스트 프레임워크 없음 — 순수 로직은 `npx tsx scripts/test-*.ts` + `node:assert/strict`(기존 `scripts/test-topic-steer.ts` 패턴), 통합은 `npm run typecheck` + 수동.

**Spec:** docs/superpowers/specs/2026-06-20-onboarding-flow-redesign-design.md

---

## File Structure

**Phase A — 데이터 + 백엔드**
- Create `supabase/migrations/20260620000001_beta_codes.sql` — `beta_codes` 테이블 + RLS + `profiles.invite_reward_granted_at` 컬럼.
- Create `src/lib/beta-codes.ts` — 순수 코드 생성(`generateCode`/`generateCodes`) + DB 헬퍼(`validateCode`, `consumeCodeAndReward`, `issueCodesForUser`, `listUserCodes`).
- Create `src/app/api/beta/validate/route.ts` — `POST` 코드 검증(공개, 소진 X).
- Create `src/app/api/beta/my-codes/route.ts` — `GET` 본인 코드 목록(인증).
- Create `src/app/api/onboarding/finalize/route.ts` — `POST` 원자적 확정(인증).
- Create `scripts/test-beta-codes.ts` — `generateCode` 순수 테스트.

**Phase B — 위저드 + 인증**
- Create `src/lib/onboarding-draft.ts` — 순수 localStorage 드래프트 read/write/clear.
- Create `src/components/AuthModal.tsx` — 구글 OAuth + 이메일/비번 모달.
- Create `src/app/start/page.tsx` — 위저드(코드 → 방이름 → 인증 모달).
- Create `src/app/auth/callback/page.tsx` — OAuth 리다이렉트 수신 → 드래프트 → finalize.
- Create `scripts/test-onboarding-draft.ts` — 드래프트 직렬화 테스트.
- Modify `src/components/LandingClient.tsx` — CTA `/signup` → `/start`.

**Phase C — 정리 + 프로필 UI**
- Modify `src/app/character/page.tsx` — `room-naming` 스텝 제거.
- Create `src/components/InvitePanel.tsx` — 내 코드 3개 + n/3 현황 + 복사.
- Modify `src/components/RoomInfoSheet.tsx` — owner 전용 `InvitePanel` 추가.

---

## Phase A — 데이터 + 백엔드

### Task 1: 마이그레이션 — beta_codes + reward 기록

**Files:**
- Create: `supabase/migrations/20260620000001_beta_codes.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260620000001_beta_codes.sql`:

```sql
-- Beta invite codes (invite-only gate + per-user viral growth).
--
-- Bootstrap codes are admin-seeded (owner_user_id null). On signup each user
-- is issued 3 one-time codes they own. A code is consumed (used_by set) at
-- onboarding finalize; when all of an owner's codes are consumed the owner
-- earns a bonus 'invite' ticket. Reads are self-scoped to codes you own;
-- all writes go through the service role (server), which bypasses RLS.
-- Validation of an arbitrary code at the gate is done server-side (service
-- role), never by a client read, so codes aren't enumerable.

create table if not exists public.beta_codes (
  code          text primary key,
  owner_user_id uuid references auth.users(id) on delete set null,
  used_by       uuid references auth.users(id) on delete set null,
  used_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists beta_codes_owner_idx on public.beta_codes(owner_user_id);

alter table public.beta_codes enable row level security;

-- Owners may read their own codes (for the profile "초대" panel). Gate
-- validation + all writes happen via the service role server-side.
create policy "beta_codes: owner-read"
  on public.beta_codes for select using (auth.uid() = owner_user_id);

-- One-time completion-reward marker on profiles.
alter table public.profiles
  add column if not exists invite_reward_granted_at timestamptz;
```

- [ ] **Step 2: Verify the SQL parses (lint)**

Run: `node -e "const s=require('fs').readFileSync('supabase/migrations/20260620000001_beta_codes.sql','utf8'); if(!/create table/.test(s)||!/beta_codes/.test(s)) throw new Error('migration malformed'); console.log('migration ok')"`
Expected: prints `migration ok`

(Migrations apply against the live Supabase project via the project's normal deploy path — there is no local DB in this repo. This step only sanity-checks the file exists and is well-formed.)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260620000001_beta_codes.sql
git commit -m "feat(beta): beta_codes table + invite reward marker

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 코드 생성 순수 로직 + 테스트

**Files:**
- Create: `src/lib/beta-codes.ts`
- Test: `scripts/test-beta-codes.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/test-beta-codes.ts`:

```ts
import assert from "node:assert/strict";
import { generateCode, generateCodes, CODE_RE } from "../src/lib/beta-codes";

// generateCode: 8 chars from the unambiguous alphabet, matches CODE_RE.
for (let i = 0; i < 500; i++) {
  const c = generateCode();
  assert.equal(c.length, 8, `length: ${c}`);
  assert.ok(CODE_RE.test(c), `shape: ${c}`);
  // No ambiguous characters (0/O/1/I/L) by construction.
  assert.ok(!/[01OIL]/.test(c), `ambiguous char in ${c}`);
}

// generateCodes(n): n distinct codes.
const codes = generateCodes(3);
assert.equal(codes.length, 3);
assert.equal(new Set(codes).size, 3, "codes must be distinct");

console.log("beta-codes: all assertions passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test-beta-codes.ts`
Expected: FAIL — `Cannot find module '../src/lib/beta-codes'`

- [ ] **Step 3: Write minimal implementation (pure part only)**

Create `src/lib/beta-codes.ts`:

```ts
// Beta invite codes — pure generation helpers + DB operations.
//
// Codes are 8 chars from an unambiguous alphabet (no 0/O/1/I/L) so they're
// easy to read aloud / type. Generation is pure + tested; the DB helpers
// (validate / consume+reward / issue / list) run with the service role.

import type { SupabaseClient } from "@supabase/supabase-js";
import { grant } from "@/lib/ticket-balance";

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0 O 1 I L
export const CODE_RE = /^[2-9A-HJ-NP-Z]{8}$/;
const CODE_LEN = 8;
const CODES_PER_USER = 3;

/** A single random code. Uses Math.random — fine for non-secret invite
 *  codes (uniqueness is enforced by the DB primary key + retry on insert). */
export function generateCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/** n distinct codes. */
export function generateCodes(n: number): string[] {
  const set = new Set<string>();
  while (set.size < n) set.add(generateCode());
  return Array.from(set);
}

export const PER_USER = CODES_PER_USER;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test-beta-codes.ts`
Expected: PASS — prints `beta-codes: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/beta-codes.ts scripts/test-beta-codes.ts
git commit -m "feat(beta): code generation helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 코드 DB 헬퍼 (validate / consume+reward / issue / list)

**Files:**
- Modify: `src/lib/beta-codes.ts`

- [ ] **Step 1: Append the DB helpers**

Append to `src/lib/beta-codes.ts`:

```ts
/** True if the code exists and is unused. Service-role read (codes are not
 *  client-readable except your own). */
export async function validateCode(svc: SupabaseClient, code: string): Promise<boolean> {
  if (!CODE_RE.test(code)) return false;
  const { data } = await svc
    .from("beta_codes")
    .select("code")
    .eq("code", code)
    .is("used_by", null)
    .maybeSingle();
  return !!data;
}

/** Atomically consume `code` for `uid`. Returns:
 *   - { ok: true, alreadyMine: true } if this user already consumed it (idempotent)
 *   - { ok: true } on a fresh consume (and grants the owner's reward if their pool is now exhausted)
 *   - { ok: false } if the code is missing / already used by someone else. */
export async function consumeCodeAndReward(
  svc: SupabaseClient,
  uid: string,
  code: string,
): Promise<{ ok: boolean; alreadyMine?: boolean }> {
  if (!CODE_RE.test(code)) return { ok: false };
  // Atomic claim: only succeeds while used_by is null.
  const { data: claimed } = await svc
    .from("beta_codes")
    .update({ used_by: uid, used_at: new Date().toISOString() })
    .eq("code", code)
    .is("used_by", null)
    .select("owner_user_id")
    .maybeSingle();

  if (!claimed) {
    // Either missing, or already used. If THIS user used it before, treat as ok.
    const { data: mine } = await svc
      .from("beta_codes")
      .select("code")
      .eq("code", code)
      .eq("used_by", uid)
      .maybeSingle();
    return mine ? { ok: true, alreadyMine: true } : { ok: false };
  }

  // Fresh consume — check if the code's owner has now used up all their codes.
  const ownerId = (claimed as { owner_user_id: string | null }).owner_user_id;
  if (ownerId) await maybeGrantInviteReward(svc, ownerId);
  return { ok: true };
}

/** If `ownerId` has codes and ALL are consumed and the reward hasn't been
 *  granted yet, grant one bonus 'invite' ticket and stamp the marker. */
async function maybeGrantInviteReward(svc: SupabaseClient, ownerId: string): Promise<void> {
  const { data: owned } = await svc
    .from("beta_codes")
    .select("used_by")
    .eq("owner_user_id", ownerId);
  const codes = owned ?? [];
  if (codes.length === 0) return;
  const allUsed = codes.every((c) => (c as { used_by: string | null }).used_by !== null);
  if (!allUsed) return;

  // Idempotent: only grant if the marker is still null.
  const { data: prof } = await svc
    .from("profiles")
    .select("invite_reward_granted_at")
    .eq("id", ownerId)
    .maybeSingle();
  if (prof && (prof as { invite_reward_granted_at: string | null }).invite_reward_granted_at) return;

  await grant(svc, ownerId, "invite", 1);
  await svc
    .from("profiles")
    .update({ invite_reward_granted_at: new Date().toISOString() })
    .eq("id", ownerId);
}

/** Ensure `uid` owns PER_USER codes — issue the difference. Idempotent. */
export async function issueCodesForUser(svc: SupabaseClient, uid: string): Promise<void> {
  const { count } = await svc
    .from("beta_codes")
    .select("code", { count: "exact", head: true })
    .eq("owner_user_id", uid);
  const have = count ?? 0;
  if (have >= PER_USER) return;
  // Insert one at a time; on a PK collision (rare) just try another code.
  let issued = have;
  let guard = 0;
  while (issued < PER_USER && guard++ < 50) {
    const { error } = await svc
      .from("beta_codes")
      .insert({ code: generateCode(), owner_user_id: uid });
    if (!error) issued++;
  }
}

export type MyCode = { code: string; used: boolean };

/** This user's owned codes + used/unused state. */
export async function listUserCodes(svc: SupabaseClient, uid: string): Promise<MyCode[]> {
  const { data } = await svc
    .from("beta_codes")
    .select("code, used_by")
    .eq("owner_user_id", uid)
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => ({
    code: (r as { code: string }).code,
    used: (r as { used_by: string | null }).used_by !== null,
  }));
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS — no errors. (`grant` is imported from `@/lib/ticket-balance` which exports `grant(svc, userId, kind, n)`.)

- [ ] **Step 3: Re-run the pure test (still green)**

Run: `npx tsx scripts/test-beta-codes.ts`
Expected: PASS — `beta-codes: all assertions passed`

- [ ] **Step 4: Commit**

```bash
git add src/lib/beta-codes.ts
git commit -m "feat(beta): code validate/consume+reward/issue/list DB helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `POST /api/beta/validate`

**Files:**
- Create: `src/app/api/beta/validate/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/beta/validate/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase";
import { validateCode } from "@/lib/beta-codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/beta/validate { code } → { ok: boolean }
// Public (no auth): checks a code exists and is unused, WITHOUT consuming it.
// Consumption happens later in /api/onboarding/finalize after auth.
export async function POST(req: NextRequest) {
  let body: { code?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }
  const code = (body.code ?? "").trim().toUpperCase();
  if (!code) return NextResponse.json({ ok: false });
  const ok = await validateCode(serviceClient(), code);
  return NextResponse.json({ ok });
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS — no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/beta/validate/route.ts
git commit -m "feat(beta): POST /api/beta/validate (no-consume gate check)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `POST /api/onboarding/finalize`

**Files:**
- Create: `src/app/api/onboarding/finalize/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/onboarding/finalize/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { userClient, serviceClient } from "@/lib/supabase";
import { ensureWorld, seedMembersIfEmpty } from "@/lib/world-seed";
import { consumeCodeAndReward, issueCodesForUser } from "@/lib/beta-codes";
import type { Locale } from "@/lib/language";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/onboarding/finalize { code, roomName }
// Auth required. Atomically: consume the code (+ reward its owner if their
// pool is exhausted) → create the world with the chosen name → issue this
// user's 3 codes. Idempotent on re-entry.
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "missing auth" }, { status: 401 });

  let body: { code?: string; roomName?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const code = (body.code ?? "").trim().toUpperCase();
  const roomName = (body.roomName ?? "").trim();
  if (!code) return NextResponse.json({ error: "missing code" }, { status: 400 });
  if (roomName.length < 1 || roomName.length > 16) {
    return NextResponse.json({ error: "invalid room name" }, { status: 400 });
  }

  const sb = userClient(token);
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }
  const uid = userData.user.id;
  const svc = serviceClient();

  // 1. Consume the code (atomic) + reward the inviter if applicable.
  const consumed = await consumeCodeAndReward(svc, uid, code);
  if (!consumed.ok) {
    return NextResponse.json({ error: "code already used or invalid" }, { status: 409 });
  }

  // 2. Create the world with the chosen name (+ seed members). Idempotent.
  //    Language follows the request locale (IP→locale handled upstream by the
  //    landing/wizard; default ko). We pass the world's existing/seed default.
  const language = ((req.headers.get("x-locale") ?? "ko") as Locale);
  const worldId = await ensureWorld(svc, uid, roomName, language);
  await seedMembersIfEmpty(svc, worldId);

  // 3. Issue this user's own 3 invite codes (idempotent).
  await issueCodesForUser(svc, uid);

  return NextResponse.json({ ok: true, worldId });
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS — no errors. (`ensureWorld(svc, uid, name, language)` and `seedMembersIfEmpty(svc, worldId)` signatures per world-seed.ts.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/onboarding/finalize/route.ts
git commit -m "feat(onboarding): POST /api/onboarding/finalize (consume+reward+world+issue)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `GET /api/beta/my-codes`

**Files:**
- Create: `src/app/api/beta/my-codes/route.ts`

- [ ] **Step 1: Write the route**

Create `src/app/api/beta/my-codes/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { userClient, serviceClient } from "@/lib/supabase";
import { listUserCodes } from "@/lib/beta-codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/beta/my-codes → { codes: { code, used }[] }
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "missing auth" }, { status: 401 });

  const sb = userClient(token);
  const { data: userData, error: userErr } = await sb.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }
  const codes = await listUserCodes(serviceClient(), userData.user.id);
  return NextResponse.json({ codes });
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS — no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/beta/my-codes/route.ts
git commit -m "feat(beta): GET /api/beta/my-codes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase B — 위저드 + 인증

### Task 7: 온보딩 드래프트 (localStorage) 순수 모듈 + 테스트

**Files:**
- Create: `src/lib/onboarding-draft.ts`
- Test: `scripts/test-onboarding-draft.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/test-onboarding-draft.ts`:

```ts
import assert from "node:assert/strict";
import { parseDraft, serializeDraft, EMPTY_DRAFT } from "../src/lib/onboarding-draft";

// round-trip
const d = { code: "ABCD2345", roomName: "내 광장" };
assert.deepEqual(parseDraft(serializeDraft(d)), d);

// partial / missing fields default to empty strings
assert.deepEqual(parseDraft('{"code":"X"}'), { code: "X", roomName: "" });
assert.deepEqual(parseDraft("not json"), EMPTY_DRAFT);
assert.deepEqual(parseDraft(null), EMPTY_DRAFT);

console.log("onboarding-draft: all assertions passed");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx scripts/test-onboarding-draft.ts`
Expected: FAIL — `Cannot find module '../src/lib/onboarding-draft'`

- [ ] **Step 3: Write the module**

Create `src/lib/onboarding-draft.ts`:

```ts
// Pre-auth onboarding draft (invite code + room name) held in localStorage
// so it survives the Google OAuth redirect round-trip. The serialize/parse
// pair is pure + tested; the load/save/clear wrappers touch localStorage and
// are guarded for SSR.

export type OnboardingDraft = { code: string; roomName: string };
export const EMPTY_DRAFT: OnboardingDraft = { code: "", roomName: "" };
const KEY = "ehto:onboarding:v1";

export function serializeDraft(d: OnboardingDraft): string {
  return JSON.stringify({ code: d.code, roomName: d.roomName });
}

export function parseDraft(raw: string | null): OnboardingDraft {
  if (!raw) return EMPTY_DRAFT;
  try {
    const o = JSON.parse(raw) as Partial<OnboardingDraft>;
    return {
      code: typeof o.code === "string" ? o.code : "",
      roomName: typeof o.roomName === "string" ? o.roomName : "",
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

export function loadDraft(): OnboardingDraft {
  if (typeof window === "undefined") return EMPTY_DRAFT;
  try { return parseDraft(window.localStorage.getItem(KEY)); }
  catch { return EMPTY_DRAFT; }
}

export function saveDraft(d: OnboardingDraft): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, serializeDraft(d)); } catch { /* private mode */ }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx scripts/test-onboarding-draft.ts`
Expected: PASS — `onboarding-draft: all assertions passed`

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboarding-draft.ts scripts/test-onboarding-draft.ts
git commit -m "feat(onboarding): localStorage draft (survives OAuth redirect)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: 인증 모달 (구글 OAuth + 이메일/비번)

**Files:**
- Create: `src/components/AuthModal.tsx`

**Context:** Mirrors the existing email/password calls in `login/page.tsx:39` (`signInWithPassword`) and `signup/page.tsx:51` (`signUp`). Adds Google OAuth via `signInWithOAuth`. On a successful *session* (email login, or signup with no email-confirm), it calls `onAuthed()`; the caller (wizard) then runs finalize. Google OAuth leaves the page and returns via `/auth/callback` (Task 10), so this component only kicks it off.

- [ ] **Step 1: Write the component**

Create `src/components/AuthModal.tsx`:

```tsx
"use client";

import { useState } from "react";
import { browserClient } from "@/lib/supabase";

// Auth modal for the /start wizard. Google OAuth + email/password.
// onAuthed fires only when a live session exists in THIS page (email path).
// The Google path redirects to /auth/callback which resumes finalize there.
export function AuthModal(props: {
  open: boolean;
  onClose: () => void;
  onAuthed: () => void;
}) {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!props.open) return null;

  async function google() {
    const sb = browserClient();
    setMsg(null);
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setMsg(error.message);
  }

  async function emailSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setMsg(null);
    try {
      const sb = browserClient();
      if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email: email.trim(), password });
        if (error) { setMsg(error.message); return; }
        if (data.session) { props.onAuthed(); return; }
        setMsg("이메일 확인 메일을 보냈어. 링크 클릭 후 로그인하면 이어집니다.");
      } else {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) { setMsg(error.message); return; }
        props.onAuthed();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit = email.includes("@") && password.length >= 6 && !submitting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={props.onClose}
    >
      <div
        className="border-line bg-surface w-full max-w-sm rounded-2xl border p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-ink mb-4 text-lg font-medium">
          {mode === "signup" ? "가입하고 시작하기" : "로그인"}
        </h2>

        <button
          onClick={google}
          className="border-line text-ink mb-3 flex w-full items-center justify-center gap-2 rounded-xl border py-2.5"
        >
          Google로 계속하기
        </button>

        <div className="my-3 flex flex-col gap-2">
          <input
            type="email"
            placeholder="이메일"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border-line bg-bg text-ink rounded-xl border px-3 py-2"
          />
          <input
            type="password"
            placeholder="비밀번호 (6자 이상)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border-line bg-bg text-ink rounded-xl border px-3 py-2"
          />
        </div>

        {msg && <p className="text-muted mb-2 text-sm">{msg}</p>}

        <button
          disabled={!canSubmit}
          onClick={emailSubmit}
          className="bg-ink text-bg w-full rounded-xl py-2.5 font-medium disabled:opacity-40"
        >
          {mode === "signup" ? "가입" : "로그인"}
        </button>

        <button
          onClick={() => setMode(mode === "signup" ? "login" : "signup")}
          className="text-muted mt-3 w-full text-center text-sm"
        >
          {mode === "signup" ? "이미 계정이 있어요" : "처음이에요 — 가입"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS — no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/AuthModal.tsx
git commit -m "feat(auth): AuthModal — Google OAuth + email/password

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: `/start` 위저드 (코드 → 방이름 → 인증)

**Files:**
- Create: `src/app/start/page.tsx`

**Context:** Three steps driven by local state + the draft (Task 7). Step "code" calls `POST /api/beta/validate`; on ok, saves draft and advances. Step "name" validates 1–16 chars (mirrors `RoomNamingView`), saves draft, advances. Step "auth" renders `AuthModal`; `onAuthed` runs finalize then routes to `/character`.

- [ ] **Step 1: Write the page**

Create `src/app/start/page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase";
import { AuthModal } from "@/components/AuthModal";
import { loadDraft, saveDraft, clearDraft } from "@/lib/onboarding-draft";

type Step = "code" | "name" | "auth";

export default function StartPage() {
  const router = useRouter();
  const initial = loadDraft();
  const [step, setStep] = useState<Step>("code");
  const [code, setCode] = useState(initial.code);
  const [roomName, setRoomName] = useState(initial.roomName);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submitCode() {
    if (busy) return;
    const c = code.trim().toUpperCase();
    if (!c) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/beta/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c }),
      });
      const j = await r.json();
      if (!j.ok) { setErr("초대코드가 올바르지 않거나 이미 사용됐어요."); return; }
      setCode(c);
      saveDraft({ code: c, roomName });
      setStep("name");
    } catch {
      setErr("네트워크 오류. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  function submitName() {
    const n = roomName.trim();
    if (n.length < 1 || n.length > 16) { setErr("방 이름은 1~16자."); return; }
    setErr(null);
    saveDraft({ code: code.trim().toUpperCase(), roomName: n });
    setStep("auth");
  }

  async function onAuthed() {
    setBusy(true); setErr(null);
    try {
      const sb = browserClient();
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) { setErr("세션이 없습니다."); return; }
      const r = await fetch("/api/onboarding/finalize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sess.session.access_token}`,
        },
        body: JSON.stringify({ code: code.trim().toUpperCase(), roomName: roomName.trim() }),
      });
      const j = await r.json();
      if (!r.ok) {
        if (r.status === 409) { setErr("초대코드가 방금 소진됐어요. 다른 코드로 다시 시도해주세요."); setStep("code"); return; }
        setErr(j.error ?? "확정 실패"); return;
      }
      clearDraft();
      router.replace("/character");
    } catch {
      setErr("네트워크 오류. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      {step === "code" && (
        <>
          <h1 className="text-ink text-xl font-medium">초대코드</h1>
          <p className="text-muted text-sm">초대받은 코드를 입력해주세요.</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ABCD2345"
            className="border-line bg-bg text-ink rounded-xl border px-3 py-2 tracking-widest"
          />
          {err && <p className="text-muted text-sm">{err}</p>}
          <button onClick={submitCode} disabled={busy || !code.trim()}
            className="bg-ink text-bg rounded-xl py-2.5 font-medium disabled:opacity-40">
            다음
          </button>
          <button onClick={() => router.push("/login")} className="text-muted text-center text-sm">
            이미 계정이 있어요
          </button>
        </>
      )}

      {step === "name" && (
        <>
          <h1 className="text-ink text-xl font-medium">광장 이름</h1>
          <p className="text-muted text-sm">당신의 광장을 뭐라고 부를까요? (1~16자)</p>
          <input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            maxLength={16}
            placeholder="예: 새벽 광장"
            className="border-line bg-bg text-ink rounded-xl border px-3 py-2"
          />
          {err && <p className="text-muted text-sm">{err}</p>}
          <div className="flex gap-2">
            <button onClick={() => { setErr(null); setStep("code"); }}
              className="border-line text-ink flex-1 rounded-xl border py-2.5">뒤로</button>
            <button onClick={submitName} disabled={!roomName.trim()}
              className="bg-ink text-bg flex-1 rounded-xl py-2.5 font-medium disabled:opacity-40">다음</button>
          </div>
        </>
      )}

      <AuthModal open={step === "auth"} onClose={() => setStep("name")} onAuthed={onAuthed} />
      {step === "auth" && err && <p className="text-muted text-center text-sm">{err}</p>}
    </main>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS — no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/start/page.tsx
git commit -m "feat(onboarding): /start wizard (code → name → auth)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: `/auth/callback` — OAuth 복귀 → finalize

**Files:**
- Create: `src/app/auth/callback/page.tsx`

**Context:** Google OAuth redirects here. supabase-js (browserClient) auto-detects the session from the URL; we also call `exchangeCodeForSession` defensively for the PKCE `?code=` form. Once a session exists, read the draft and run finalize, then route to `/character`. If the draft is empty (e.g., a returning user signed in with Google), fall back to `landingPathForSession`.

- [ ] **Step 1: Write the page**

Create `src/app/auth/callback/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase";
import { loadDraft, clearDraft } from "@/lib/onboarding-draft";
import { landingPathForSession } from "@/lib/character-store";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = browserClient();
      // PKCE form (?code=...) — exchange if present. Implicit/hash sessions
      // are auto-detected by the client, so this is best-effort.
      try {
        if (typeof window !== "undefined" && window.location.search.includes("code=")) {
          await sb.auth.exchangeCodeForSession(window.location.href);
        }
      } catch { /* may already be exchanged by auto-detect */ }

      const { data: sess } = await sb.auth.getSession();
      if (cancelled) return;
      if (!sess.session) { setErr("로그인을 완료하지 못했어요."); return; }
      const token = sess.session.access_token;

      const draft = loadDraft();
      if (draft.code && draft.roomName) {
        const r = await fetch("/api/onboarding/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ code: draft.code, roomName: draft.roomName }),
        });
        if (!cancelled && r.ok) {
          clearDraft();
          router.replace("/character");
          return;
        }
        if (!cancelled && r.status === 409) {
          // Code got consumed in the meantime — send back to the wizard.
          router.replace("/start");
          return;
        }
      }
      // No draft (returning user) → normal landing.
      if (!cancelled) router.replace(await landingPathForSession(token));
    })();
    return () => { cancelled = true; };
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <p className="text-muted text-sm">{err ?? "들어가는 중…"}</p>
    </main>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS — no errors. (Confirm `landingPathForSession` is exported from `@/lib/character-store`; the explore report shows it is used as `landingPathForSession(token)`.)

- [ ] **Step 3: Commit**

```bash
git add src/app/auth/callback/page.tsx
git commit -m "feat(auth): /auth/callback resumes onboarding after OAuth

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: 랜딩 CTA → `/start`

**Files:**
- Modify: `src/components/LandingClient.tsx`

- [ ] **Step 1: Change the CTA target**

In `src/components/LandingClient.tsx`, change the CTA link from `/signup` to `/start`:

```tsx
<PixelLink href="/start" size="lg" block className="font-pixel">
  {t.cta}
</PixelLink>
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS — no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/LandingClient.tsx
git commit -m "feat(onboarding): landing CTA → /start

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase C — 정리 + 프로필 UI

### Task 12: 캐릭터 페이지 `room-naming` 스텝 제거

**Files:**
- Modify: `src/app/character/page.tsx`

**Context:** Room naming now happens in `/start` (Task 9). The character flow's last step becomes `naming` (character handle), after which it routes to `/world`. Remove the `room-naming` stage type, its conditional render, and the `RoomNamingView` component. Re-point the `naming` step's completion to `/world`.

- [ ] **Step 1: Remove the stage from the type**

In `src/app/character/page.tsx`, change the `Stage` type (line ~30) from:

```ts
type Stage = "select" | "generating" | "result" | "naming" | "room-naming" | "error";
```
to:
```ts
type Stage = "select" | "generating" | "result" | "naming" | "error";
```

- [ ] **Step 2: Re-point the naming step to /world**

Find the `NamingView` usage (the `naming` stage render). Its `onDone` currently advances to `room-naming` (`setStage("room-naming")`). Change `onDone` to navigate straight to the plaza:

```tsx
{stage === "naming" && imageUrl && (
  <NamingView
    imageUrl={imageUrl}
    onDone={() => router.push("/world")}
  />
)}
```

(If `NamingView`'s `onDone` is wired differently, set it so completing the character handle routes to `/world`.)

- [ ] **Step 3: Remove the room-naming render block + RoomNamingView component**

Delete the conditional render block (lines ~224-228):

```tsx
{stage === "room-naming" && imageUrl && (
  <RoomNamingView
    imageUrl={imageUrl}
    onDone={() => router.push("/world")}
  />
)}
```

And delete the entire `function RoomNamingView(...) { ... }` definition (lines ~614-714).

- [ ] **Step 4: Verify it typechecks (catches any dangling references)**

Run: `npm run typecheck`
Expected: PASS — no errors, no unused-symbol references to `RoomNamingView` or `"room-naming"`.

- [ ] **Step 5: Commit**

```bash
git add src/app/character/page.tsx
git commit -m "refactor(character): drop room-naming step (moved to /start)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: 프로필 초대 패널 (InvitePanel)

**Files:**
- Create: `src/components/InvitePanel.tsx`

**Context:** Fetches `GET /api/beta/my-codes`, shows a simple "n/3 사용됨" line + the three codes with a copy button (unused emphasized, used dimmed). Follows the owner-panel pattern used by the other RoomInfoSheet sub-panels (client component, fetches on mount with the session token).

- [ ] **Step 1: Write the component**

Create `src/components/InvitePanel.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";

type MyCode = { code: string; used: boolean };

export function InvitePanel(props: { open: boolean }) {
  const [codes, setCodes] = useState<MyCode[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!props.open) return;
    let cancelled = false;
    (async () => {
      try {
        const sb = browserClient();
        const { data: sess } = await sb.auth.getSession();
        if (!sess.session) return;
        const r = await fetch("/api/beta/my-codes", {
          headers: { Authorization: `Bearer ${sess.session.access_token}` },
        });
        if (!r.ok) return;
        const j = await r.json();
        if (!cancelled) setCodes((j.codes ?? []) as MyCode[]);
      } catch { /* transient — leave as null, reopen retries */ }
    })();
    return () => { cancelled = true; };
  }, [props.open]);

  if (!codes) return null;
  const usedCount = codes.filter((c) => c.used).length;

  async function copy(code: string) {
    try { await navigator.clipboard.writeText(code); setCopied(code); }
    catch { /* clipboard blocked — ignore */ }
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-ink text-sm font-medium">초대</h3>
        <span className="text-muted text-xs">{usedCount}/{codes.length} 사용됨</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {codes.map((c) => (
          <li key={c.code}
            className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
              c.used ? "border-line text-muted opacity-50" : "border-line text-ink"
            }`}>
            <span className="font-mono tracking-widest">{c.code}</span>
            {c.used ? (
              <span className="text-xs">사용됨</span>
            ) : (
              <button onClick={() => copy(c.code)} className="text-muted text-xs">
                {copied === c.code ? "복사됨" : "복사"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS — no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/InvitePanel.tsx
git commit -m "feat(invite): profile InvitePanel (codes + n/3 status + copy)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: RoomInfoSheet에 InvitePanel 배치

**Files:**
- Modify: `src/components/RoomInfoSheet.tsx`

**Context:** Add the owner-only `InvitePanel` alongside the other owner panels (the explore report shows owner panels rendered around lines 63-96, e.g. `PublishSettings`, `BiasSettings`, `MemberManagement`). Place it where the owner can find "초대" — directly after `PublishSettings`.

- [ ] **Step 1: Import and render the panel**

In `src/components/RoomInfoSheet.tsx`:

Add the import near the other component imports at the top:
```tsx
import { InvitePanel } from "@/components/InvitePanel";
```

Add the render right after the `PublishSettings` owner block:
```tsx
{world?.owner && <InvitePanel open={open} />}
```

(`open` is the sheet's open-state prop already passed to sibling panels like `ImplicitPanel open={open}` / `PlazaObjectsPanel open={open}` — reuse the same variable.)

- [ ] **Step 2: Verify it typechecks**

Run: `npm run typecheck`
Expected: PASS — no errors.

- [ ] **Step 3: Manual verification (UI)**

The onboarding + auth + invite UI are browser/OAuth behaviors not unit-testable here. Verify manually once running:
1. `/start`: enter a seeded valid code → name → email signup → lands on `/character` → `/world`. Invalid code shows the error and blocks.
2. Google path: choose Google → returns via `/auth/callback` → world created with the room name → `/character`.
3. Profile (RoomInfoSheet) shows "초대" with 3 codes + n/3; copy works; a redeemed code shows dimmed/"사용됨".
4. When all 3 of a user's codes are redeemed, that user's `invite` ticket balance increases by 1 (one-time).

(NOTE: requires Supabase Google provider configured in the console with `${origin}/auth/callback` as an allowed redirect, and a few bootstrap `beta_codes` rows seeded with `owner_user_id` null.)

- [ ] **Step 4: Commit**

```bash
git add src/components/RoomInfoSheet.tsx
git commit -m "feat(invite): surface InvitePanel in profile sheet (owner-only)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- §A `/start` 위저드 → Task 9. ✓
- §B 드래프트 → Task 7. ✓
- §C beta_codes(+owner_user_id), validate, my-codes, 부트스트랩, 유저당 3개 → Tasks 1, 2, 3, 4, 6 (issue in finalize). ✓
- §D 인증 모달(구글+이메일/비번) → Task 8; 콜백 → Task 10. ✓
- §E finalize(원자 소진+보상체크+world+seed+3개 발급) → Tasks 3 (`consumeCodeAndReward`, `issueCodesForUser`) + 5. ✓
- §F 캐릭터 마지막 + room-naming 제거 → Task 12 (generate-character는 ensureWorld idempotent라 무변경). ✓
- §G 엣지(409 복귀, idempotent, 미인증 가드) → Tasks 5, 9, 10. ✓
- §H 프로필 초대 UI + n/3 + 완료 보상 → Tasks 13, 14 + reward in Task 3. ✓
- 랜딩 CTA → Task 11. ✓
- 운영 선행(Supabase Google provider, 부트스트랩 코드 시드) → Task 14 manual note. ✓

**Placeholder scan:** 코드 스텝은 전부 완전한 코드. UI/OAuth는 단위 테스트 불가라 Task 14에 명시적 수동 검증 절차로 대체(이 코드베이스에 UI 테스트 프레임워크 없음). placeholder 없음.

**Type consistency:**
- `OnboardingDraft { code, roomName }` — Task 7 정의, Tasks 9/10에서 동일 사용. ✓
- `MyCode { code, used }` — `listUserCodes`(Task 3) 반환, `/api/beta/my-codes`(Task 6) 전달, `InvitePanel`(Task 13) 소비. ✓
- `consumeCodeAndReward(svc, uid, code) → { ok, alreadyMine? }`, `issueCodesForUser(svc, uid)`, `validateCode(svc, code)`, `listUserCodes(svc, uid)` — Task 3 정의, Tasks 4/5/6에서 동일 시그니처 호출. ✓
- `generateCode()`/`generateCodes(n)`/`CODE_RE`/`PER_USER` — Task 2 정의, Task 3에서 사용. ✓
- `ensureWorld(svc, uid, roomName, language)` + `seedMembersIfEmpty(svc, worldId)` — world-seed.ts 시그니처와 일치(Task 5). ✓
- `grant(svc, userId, "invite", 1)` — ticket-balance.ts 시그니처와 일치(Task 3). ✓
- `landingPathForSession(token)` — character-store.ts export(Task 10). ✓
