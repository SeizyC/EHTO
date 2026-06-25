# EHTO

**Everyone Has Their Own World** — 모두에게 각자의 세계가 있다.

> 당신만의 작은 광장. 그 안에선 저마다 결이 다른 사람들이 오가며 하루를 보냅니다.
> 답할 의무 없이, 그저 머무는 것만으로 곁이 느껴지는 공간.

EHTO는 사용자 한 명마다 자신만의 아이소메트릭 픽셀 **광장(plaza)** 을 주는 웹 앱입니다.
광장 안에서는 저마다 페르소나를 가진 AI 멤버들이 들고 나며 **자기들끼리** 대화하고,
사용자가 자리를 비운 사이에도 세계는 계속 흘러갑니다. 1:1 챗봇이 아니라, **시간이
쌓이는 장소**입니다.

## 왜

AI 챗봇은 발전했지만 외로움은 못 풀었다. 사람은 "말이 통하는 AI"가 아니라
**"함께 시간을 축적해주는 존재감"** 을 원하기 때문.

EHTO의 질문은:

> "AI를 얼마나 인간처럼 말하게 할까?" 가 아니라,
> **"AI와 인간이 함께 시간을 축적하는 구조를 만들 수 있나?"**

---

## 핵심 개념

| 개념 | 설명 |
|------|------|
| **광장 (plaza / world)** | 사용자 1명당 하나. 아이소메트릭 픽셀 공간. 무료 6명 / Plus 12명까지 거주. |
| **멤버 (member)** | 광장에 사는 AI. 마스터 페르소나(`ai_characters`) → 광장별 인스턴스(`members`). dormant로 시드되어 시간차로 활성화. |
| **Ambient 대화** | 사용자가 광장에 있는 동안 일정 간격마다 침묵·시간대·맥락을 보고 누가 말할지 정하는 엔진. AI↔AI가 기본. |
| **지속성 (persistence)** | 위치·말풍선·관계·분위기가 방문 사이에 그대로 이어짐. 부재 중엔 흐른 시간의 흔적이 남음. |
| **에너지 (energy)** | 일일 무료 한도(관람 ~1시간 분량). KST 자정 리셋. |
| **EHTO (재화)** | 유일한 인앱 통화. 온보딩 지급 + Stripe로 구매. 캐릭터 변경·멤버 먼저 부르기·에너지 리필 등에 소비. |
| **바이어스 (bias)** | 광장에 정체성(예: K-pop 팬덤)을 부여하면 대화·뉴스·음악/영상 공유가 그 결로 기움. |

---

## 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 14 (App Router, RSC) · TypeScript |
| 호스팅 | Cloudflare Workers (`@opennextjs/cloudflare`) |
| DB / Auth / Realtime | Supabase (Postgres + RLS + Realtime) |
| 대화 LLM | Anthropic Claude (Haiku / Sonnet / Opus, prompt caching) |
| 캐릭터·오브젝트 아트 | 이미지 생성 모델(스프라이트) |
| 결제 | Stripe (Checkout + Webhook) |
| 콘텐츠 소스 | Naver Search API(뉴스) · Google News RSS · YouTube Data API · Spotify 임베드 |
| 상태관리 | Zustand (클라이언트 스토어) |
| 스타일 | Tailwind CSS · Pretendard / Galmuri(픽셀) |
| 애니메이션 | Framer Motion |

요구 버전: **Node 22+**, npm 10+.

---

## 아키텍처 개요

```
방문자
  │
  ▼
worker-entry.js   ── 랜딩(/) 만 cf-ipcountry(국가→시간대) 기준 SSR을
  │                  Cloudflare Cache API에 국가별 5분 캐시 (HIT 시 Next 렌더 스킵).
  │                  그 외 경로는 그대로 OpenNext 통과.
  ▼
OpenNext Worker (Next.js)
  ├─ 페이지 (App Router): 랜딩 · /about · /home · /world · /plaza/[id] · 온보딩 · /admin …
  ├─ API 라우트 (force-dynamic): /api/world/* · /api/ehto/* · /api/messages · /api/cron/* …
  └─ 라이브러리 (src/lib): ambient-loop · world-seed · energy · ehto · beta-codes …
         │
         ├─ Supabase (Postgres / RLS / Realtime)
         ├─ Anthropic Claude (멤버 발화 생성)
         ├─ Stripe (EHTO 결제)
         └─ Naver · Google News · YouTube (콘텐츠 주입)
```

핵심 흐름 몇 가지:

- **Ambient 대화**: `src/lib/ambient-loop.ts` 가 침묵 길이·시간대(KST)·최근 메시지 맥락으로
  발화 여부와 다음 화자를 확률적으로 고르고, `member-reply.ts`(Claude)로 한 줄을 생성한다.
- **멤버 시드/활성화**: `src/lib/world-seed.ts` 가 광장 생성 시 12명을 dormant로 심고,
  플랜 캡(무료 6 / Plus 12) 안에서 시간차로 활성화한다(멱등).
- **지속성**: 메시지·위치·관계·오브젝트가 모두 Postgres에 저장되어 새로고침/재방문에 유지.
  5분 이상 비웠다 돌아오면 `absence-recap.ts` 가 그 사이의 흐름을 한 줄로 요약해 넣는다.
- **경제**: `ehto.ts`(액션별 가격) + `energy.ts`(일일 무료 한도) + Stripe(`ehto/checkout`,
  `stripe/webhook`). 단일 통화 EHTO는 `ticket_balances(kind='ehto')` 에 적립, `spend_ehto` RPC로 원자적 차감.

---

## 디렉터리 구조

```
src/
├─ app/
│  ├─ (app)/                 인증 후 화면: home · world · character · start · admin/*
│  ├─ about/                 서비스 소개(ko/en/ja) + schema.org JSON-LD
│  ├─ plaza/[id]/            남의 광장 방문(읽기 전용)
│  ├─ login · signup · auth/callback
│  ├─ (legal) terms · privacy · contact
│  ├─ sitemap.ts · robots.ts
│  └─ api/
│     ├─ world/*            광장 정보·멤버·위치·설정·오브젝트·토픽
│     ├─ ehto/*             balance · checkout · spend
│     ├─ stripe/webhook     결제 이벤트 → EHTO 지급
│     ├─ messages/*         발화 전송·삭제·날짜별 카운트
│     ├─ onboarding/finalize 캐릭터 저장 + 광장 생성 + 코드 소비 + EHTO 지급
│     ├─ plazas · plaza/[id] 공개 광장 디렉터리 / 방문 데이터
│     ├─ beta/*             초대 코드(my-codes · validate)
│     ├─ cron/*             ambient(대화 틱) · daily(메모리·공유·드리프트)
│     └─ admin/*            운영용(캐릭터 풀·코드·오브젝트·통계)
├─ components/              PlazaCanvas · AmbientFeed · Composer · MeSheet ·
│                          EhtoWallet · EnergyMeter · PixelButton(디자인 시스템) …
└─ lib/                     도메인 로직 + Zustand 스토어 + Supabase 클라이언트

supabase/migrations/        타임라인순 스키마 마이그레이션
scripts/                    테스트·검증·시드·이미지 생성 유틸 (.mjs / .ts)
public/                     스프라이트·폰트·로고·llms.txt
worker-entry.js             OpenNext 위 엣지 캐시 래퍼(랜딩 국가별 캐시)
```

---

## 데이터 모델 (주요 테이블)

| 테이블 | 핵심 컬럼 / 역할 |
|--------|------------------|
| `profiles` | 사용자 계정(`id`, `language`). auth.users 생성 시 트리거로 자동 생성. |
| `worlds` | 광장. `owner_id`, `name`, `plan(free/plus)`, 에너지 카운터, `ambient_paused`, 위치(`owner_x/y`), heartbeat·성장 단계·바이어스. |
| `ai_characters` | 글로벌 마스터 페르소나(`base_persona`, `name_i18n`, `max_concurrent_rooms`). |
| `members` | 광장별 AI 인스턴스. `status`, `activated_at`(null=dormant), 위치, 활동 가중치. |
| `messages` | 발화. `owner_user_id` XOR `owner_member_id`, `kind(chat/system)`. Realtime 발행. |
| `member_relations` | AI 쌍 친밀도(`interaction_count`, `shared_topics`). |
| `plaza_objects` / `object_types` | 광장 오브젝트 배치 + 정적/동적 카탈로그. |
| `ticket_balances` | EHTO 잔액(`kind='ehto'`). `spend_ehto` RPC로 차감. |
| `ehto_purchases` | Stripe 결제 기록(세션 id PK). |
| `beta_codes` | 초대 코드(8자, 0/O/1/I/L 제외). `owner_user_id`, `used_by`. |
| `user_signals` / `user_topic_mutes` | 암묵 선호도 신호 / 토픽 음소거. |
| `visits` · `page_views` | 방문 세션 / 페이지뷰(운영 통계). |

마이그레이션 전체 흐름은 [`supabase/migrations/`](./supabase/migrations) 의 파일명(날짜순)을 참고.

---

## 로컬 개발

### 1. 설치

```bash
npm install
```

### 2. 환경 변수

`.env.local` 에 아래 키를 설정한다(예시 파일은 없으니 직접 생성).

**필수**

| 키 | 용도 |
|----|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL (클라이언트 번들에 베이크) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon 키 (클라이언트) |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 라우트용 service role 키 (RLS 우회) |
| `ANTHROPIC_API_KEY` | Claude API (멤버 발화 생성) |

**기능별(해당 기능 사용 시)**

| 키 | 용도 |
|----|------|
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | EHTO 결제 / 웹훅 검증 |
| `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` | 뉴스 주입(Naver Search) |
| `YOUTUBE_API_KEY` | 영상 공유(YouTube Data API) |
| `OPENAI_API_KEY` | 스프라이트/오브젝트 이미지 생성 |
| `CRON_SECRET` | `/api/cron/*` 호출 인증 토큰 |
| `ADMIN_EMAILS` | 관리자 이메일(쉼표 구분) → `/admin` 게이트 |
| `CF_AI_GATEWAY_BASE` | (선택) Cloudflare AI Gateway 경유 |
| `DYNAMIC_OBJECTS_DISABLED` | (선택) 동적 오브젝트 생성 비활성화 |

> `scripts/db.sh` 는 `.env.local` 의 `SUPABASE_ACCESS_TOKEN`(Management API) +
> `SUPABASE_PROJECT_REF` 를 사용해 임의 SQL을 실행한다.

### 3. DB 마이그레이션

Supabase 프로젝트에 [`supabase/migrations/`](./supabase/migrations) 의 SQL을 순서대로 적용한다.

```bash
./scripts/db.sh -f supabase/migrations/<파일>.sql   # 개별 적용
./scripts/db.sh -q "select count(*) from worlds"     # 임의 쿼리
```

### 4. 개발 서버

```bash
npm run dev          # http://localhost:3000
npm run dev:clean    # .next 캐시 제거 후 시작
```

---

## 스크립트

| 명령 | 설명 |
|------|------|
| `npm run dev` / `dev:clean` | 개발 서버 (clean은 `.next` 제거 후) |
| `npm run build` | Next.js 빌드 |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm run preview` | OpenNext 빌드 + 로컬 Workers 미리보기 |
| `npm run test:regression` | ambient-loop 회귀 시뮬레이션 |
| `npm run test:energy` | 에너지 회계 유닛 테스트(KST 리셋) |
| `npm run smoke` | 프로덕션 스모크 테스트 |
| `npm run analyze:logs` / `analyze:news` | 로그 / 뉴스 인용 분석 |
| `npm run beta:energy` | 베타 에너지 시뮬레이션 |
| `npm run deploy` | `test:regression` → OpenNext 빌드 → 배포 → `smoke` |

`scripts/` 에는 그 외 시드(`seed-catalog.ts`, `bootstrap-object-catalog.mjs`),
이미지 생성(`gen-*-sprites.mjs`), 다수의 동작 검증(`*-verify.mjs`) 유틸이 있다.

---

## 배포

Cloudflare Workers에 OpenNext로 배포한다.

```bash
npm run deploy
# = test:regression && opennextjs-cloudflare build && opennextjs-cloudflare deploy && smoke
```

회귀 게이트(`test:regression`)를 건너뛰어야 할 땐 빌드·배포만 직접 실행한다:

```bash
npx opennextjs-cloudflare build && npx opennextjs-cloudflare deploy
```

- **엔트리**: `worker-entry.js`(`wrangler.jsonc` 의 `main`). 랜딩(`/`)을 국가별로 엣지 캐시하고
  나머지는 OpenNext로 통과시킨다. 클라이언트로는 항상 `private` 사본을 줘 CDN 교차 캐시를 막는다.
- **시크릿**: 서버 키는 배포 후 `wrangler secret put <KEY>` 로 주입.
  `NEXT_PUBLIC_*` 는 빌드 환경(`.env.local`/CI)에 있어야 번들에 베이크된다.
- **크론**: `/api/cron/ambient`·`/api/cron/daily` 는 `CRON_SECRET` 으로 보호되며 외부 스케줄러가 호출한다.

---

## 문서

- [디자인 원칙](./ehto_world_design_md_v_1.md) — 동기·공간 철학·세계 변화 메커닉
- [PRD](./PRD.md) — V1 전체 사양(타겟·여정·IA·경제)
- [개발계획](./개발계획.md)
- [팀 인트로](./intro.md) — 30초 온보딩
- [경제 시뮬레이션](./docs/economy-simulation-2026-06-23.md) — EHTO 유입/소모 모델
- [`public/llms.txt`](./public/llms.txt) — LLM/크롤러용 자기완결 요약

---

## 가드레일

- Habbo 풍 아이소메트릭 + 인간형 픽셀 미니미
- 모바일 360 / 390px 우선
- UI 어디에도 "AI" 단어 노출 금지 — `member`, `presence` 로 표현
- 채팅 로그가 아닌 사회 변화 로그(Ambient Feed)
- 꾸미기가 아닌 World Drift — 세계가 유저 행동으로 스스로 변한다
- 답할 의무 없음 — 사용자는 세계의 주인공이 아니라 그 안의 한 사람
