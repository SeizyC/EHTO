# 시작 흐름 개편 (Onboarding Redesign) — Design Spec

**Date**: 2026-06-20
**Status**: Draft → 사용자 리뷰 대기
**Tagline**: "코드 한 줄, 방 이름 하나로 내 세계가 열린다"

---

## 1. 배경과 목표

현재 온보딩은 **캐릭터 중심**이다: 랜딩 → `/signup`(이메일/비번 전체 페이지) → `/character`에서 캐릭터 선택·생성 → 캐릭터 이름 → 방 이름 → `/world`. 월드는 캐릭터 생성 시 `ensureWorld`로 자동 생성된다([generate-character/route.ts:170](src/app/api/generate-character/route.ts#L170)).

문제·목표:
- **베타 게이트가 없다** — 누구나 가입 가능. 초대제 베타로 전환하려면 코드 게이트가 필요.
- **Google 로그인이 없다** — 이메일/비번 전용([login/page.tsx](src/app/login/page.tsx), [signup/page.tsx](src/app/signup/page.tsx)).
- **인증이 전체 페이지** — 모달이 아니라 흐름이 끊김.
- **방 이름이 흐름 끝에** 묻혀 "내 세계를 연다"는 몰입이 약함.

### 새 흐름 (신규 사용자)

```
시작하기(/start) → ① 초대코드 → ② 방이름 → ③ 인증 모달(구글 / 이메일·비번)
   → [인증 후 서버 확정: 코드 소진 + 월드 생성] → ④ 캐릭터 만들기 → /world
```

**기존 사용자**(로그인): 위저드를 건너뛴다. `/start`의 "이미 계정 있어요" → 로그인 모달 → 인증 후 `landingPathForSession()`(기존 로직) 그대로 → `/home` 또는 `/world`.

### 핵심 아키텍처 결정 (Approach A)

인증 전 입력(코드·방이름)은 **클라이언트 드래프트**로 들고, 인증 성공 후 **단일 서버 엔드포인트가 원자적으로** 코드 소진 + 월드 생성을 확정한다. Google OAuth가 페이지를 떠났다 돌아오므로 드래프트는 `localStorage`에 둬 리다이렉트에도 살아남는다. 코드 소진이 계정에 정확히 묶이고(미가입 이탈 시 코드 낭비 없음), 레이스/악용을 서버에서 막는다.

---

## 2. 구성요소

### A. 위저드 라우트 `/start`

- 단일 클라이언트 라우트 `/start`에 스텝 상태(`code → name → auth`)를 둔다. 흩어져 있던 `/signup` + `/character`의 room-naming 스텝을 흡수.
- 스텝 진행은 로컬 상태 + 드래프트(B). 뒤로 가기 허용.
- "이미 계정 있어요" 링크 → 로그인 모달(D)만 띄움(코드/방이름 스킵).
- 미인증 사용자가 `/start` 진입 = 정상. 이미 로그인+월드 보유 사용자가 `/start` 진입 시 → 위저드 스킵하고 `landingPathForSession()`로 보냄(G).

### B. 인증 전 드래프트 (localStorage)

- 키 `ehto:onboarding:v1` = `{ code: string, roomName: string }`.
- 스텝마다 갱신. **OAuth 리다이렉트에도 생존**(localStorage라 도메인 내 유지).
- 인증 성공 후 콜백/모달 핸들러가 드래프트를 읽어 finalize(E) 호출. 성공 시 드래프트 삭제.

### C. 초대코드 시스템 (관리자 부트스트랩 + 유저당 3개 바이럴)

신규 테이블:
```sql
create table public.beta_codes (
  code          text primary key,
  owner_user_id uuid references auth.users(id),  -- null = 관리자 시드(부트스트랩)
  used_by       uuid references auth.users(id),  -- null = 미사용
  used_at       timestamptz,
  created_at    timestamptz default now()
);
```
- **일회용**: `used_by`가 null이면 미사용. 한 번 쓰면 소진.
- **부트스트랩**: 최초 사용자들은 관리자가 시드한 코드(`owner_user_id` null)로 가입(수동 insert / 운영 스크립트).
- **유저당 3개**: 가입 확정(E) 시 그 사용자 앞으로 무작위 유니크 코드 **3개 자동 생성**(`owner_user_id = 본인`). 이후 바이럴 성장.
- **검증 엔드포인트** `POST /api/beta/validate { code }` (공개, 소진 X): `code`가 존재하고 `used_by is null`이면 `{ ok: true }`. 코드 스텝 즉시 피드백용. 레이트리밋(간단 IP/세션 기준).
- **내 코드 조회** `GET /api/beta/my-codes` (인증): 본인 소유 코드 + 사용/미사용 상태. 설정 화면 "초대" 영역에서 복사·공유.
- **소진은 E(finalize)에서만** 원자적으로.

### D. 인증 모달 (구글 OAuth + 이메일/비번)

- 위저드 ③ 스텝 = 모달. 두 경로:
  - **Google OAuth**: `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: <앱콜백> } })`. 리다이렉트 → `/auth/callback`(신규)이 세션 확립 후 드래프트 보고 finalize → 캐릭터로.
  - **이메일/비번**: 모달 내에서 `signUp`(신규) / `signInWithPassword`(기존). 신규 가입 즉시 세션이면 그 자리에서 finalize. 이메일 확인이 필요한 설정이면 확인 후 첫 로그인 시 드래프트로 finalize(드래프트 유지).
- 기존 `/login`·`/signup` 페이지는 **유지하되** 위저드는 모달을 쓴다(기존 직접 링크/딥링크 호환). 모달과 페이지는 같은 auth 헬퍼를 공유.
- Supabase 측 Google provider 설정 필요(콘솔 + redirect URL 등록) — 운영 선행 작업으로 명시.

### E. 확정 엔드포인트 (인증 후, 원자적 1회)

`POST /api/onboarding/finalize { code, roomName }` (인증 필요):
1. **코드 소진 (원자적)**: `update beta_codes set used_by=:uid, used_at=now() where code=:code and used_by is null returning owner_user_id` → 영향 행 0이면 이미 사용/무효 → `409`(코드 스텝 복귀). 단, **이 유저가 이미 그 코드를 썼다면**(used_by=uid) 통과로 간주(재시도 idempotent).
2. **초대 보상 체크**: 소진된 코드에 `owner_user_id`(초대자)가 있으면, 그 초대자 소유 코드 3개가 **모두 소진됐는지** 확인 → 모두면 초대자에게 보상 지급(§H). 멱등(이미 지급 표시된 경우 스킵).
3. **월드 생성**: `ensureWorld(uid, roomName, language)` + `seedMembersIfEmpty`. idempotent(이미 있으면 이름만 보정).
4. **본인 코드 3개 발급**: 이 유저 앞으로 유니크 코드 3개 생성(`owner_user_id=uid`). 재진입 시 본인 소유 코드가 3개 미만일 때만 보충(idempotent).
5. 응답 `{ ok: true }` → 클라이언트가 `/character`로(캐릭터 스텝).

언어(`language`)는 finalize 요청 시점에 IP→로케일 감지(기존 랜딩과 동일 방식)로 결정해 `ensureWorld(uid, roomName, language)`에 넘긴다. 드래프트에는 싣지 않는다(인증 전 사용자 입력 대상이 아님).

### F. 캐릭터 만들기를 마지막으로

- 월드는 E에서 이미 생성·시드되므로, 기존 `/api/generate-character`의 `ensureWorld` + `seedMembersIfEmpty` 호출은 **idempotent no-op**이 된다 — 코드 변경 거의 없음. 캐릭터 스텝은 아바타 생성·핸들 입력만.
- 캐릭터 페이지의 기존 `room-naming` 스텝은 위저드(②)로 이동했으므로 **제거**한다(흐름 중복 방지).

### G. 엣지 케이스·가드

- **코드 레이스/이미 사용**: E의 원자적 update가 단일 진실 소스. 0행 → 409 → 코드 스텝.
- **중도 이탈**: 드래프트가 localStorage에 남아 재진입 시 마지막 스텝부터 재개.
- **이미 월드 보유 사용자가 `/start`/finalize 재진입**: finalize는 idempotent(코드 본인 사용분 통과 + ensureWorld 보정). 위저드 진입 시 월드 존재 감지하면 스킵.
- **이메일 확인 대기**: 확인 전엔 세션 없음 → 드래프트 유지, 확인 후 첫 로그인에서 finalize.
- **미인증 `/world` 접근**: 기존 `useRequireSession` 가드 유지.

### H. 초대 UI 위치 + 완료 보상

- **위치**: 메인/광장이 아니라 **프로필 메뉴의 "초대" 영역**(Sora식으로 눈에 띄게, 단 메인 화면은 깔끔하게 유지).
- **사용현황 (아주 간단)**: "초대 2/3 사용됨" 한 줄 + 코드 3개(복사 버튼). 미사용 코드만 강조, 사용된 건 흐리게. 데이터는 `GET /api/beta/my-codes`(§C).
- **완료 보상**: 본인 코드 3개가 **모두 소진**되면(초대 친구 3명 가입 완료) **1회성 보상** 지급. finalize의 소진 체크(§E-2)가 트리거. 멱등 위해 지급 기록(`profiles.invite_reward_granted_at` 또는 별도 테이블).
- **보상 내용**: **보너스 'invite' 티켓 1장** — 대기 중인 멤버 1명이 광장에 합류(기존 티켓 경제 [tickets.ts](src/lib/tickets.ts) 재사용). "친구를 데려왔더니 내 광장이 더 북적인다"는 테마 보상. 지급 = 해당 유저 invite 티켓 잔량 +1.

---

## 3. 데이터·라우트 변경 요약

| 대상 | 변경 |
|------|------|
| `beta_codes` | 신규 테이블(code PK, **owner_user_id**, used_by, used_at) |
| `POST /api/beta/validate` | 신규(공개, 소진 X) |
| `GET /api/beta/my-codes` | 신규(인증, 본인 코드+사용현황) |
| 초대 보상 기록 | `profiles.invite_reward_granted_at`(또는 별도 테이블) |
| 프로필 "초대" UI | 신규(코드 3개·복사·2/3 현황) |
| `POST /api/onboarding/finalize` | 신규(인증; 원자적 소진 + 보상체크 + ensureWorld+seed + 본인 코드 3개 발급) |
| `/auth/callback` | 신규(OAuth 리다이렉트 수신 → 드래프트 → finalize) |
| `/start` | 신규 위저드(코드 → 방이름 → 인증 모달) |
| 인증 모달 컴포넌트 | 신규(구글 OAuth + 이메일/비번; 기존 auth 헬퍼 공유) |
| `localStorage ehto:onboarding:v1` | 신규 드래프트 |
| `/character` | room-naming 스텝 제거(②로 이동) |
| `generate-character` | 변경 최소(ensureWorld가 idempotent no-op) |
| Supabase Google provider | 운영 설정(콘솔 + redirect URL) — 선행 작업 |
| 랜딩 "시작하기" CTA | `/signup` → `/start`로 변경 |

---

## 4. 미포함 / 후속

- **공용 코드·코드 만료·다단계 추천 보상** — 유저당 3개 일회용 코드 + 1회 완료 보상까지만. 그 외 확장은 후속.
- **남의 광장 방문/멀티플레이어** — 본 초대코드는 베타 게이트일 뿐, 방문 기능 아님.
- **코드 발급 관리자 UI** — 부트스트랩 코드는 수동 insert/스크립트. 필요 시 후속.
- **이메일 확인 비활성화 여부** — Supabase 설정 정책은 별도 결정(본 설계는 두 경우 모두 동작).

---

## 5. 미해결/튜닝

| 항목 | 기본값 |
|------|--------|
| 방이름 길이 | 기존 1–16자 재사용 |
| validate 레이트리밋 | 세션/IP당 분당 N회(구현 시 결정, 예: 20) |
| 드래프트 키 | `ehto:onboarding:v1` |
| OAuth 콜백 경로 | `/auth/callback` |
| 유저당 발급 코드 수 | 3 |
| 완료 보상 내용 | 보너스 'invite' 티켓 1장 |
