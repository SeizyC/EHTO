# EHTO.WORLD — PRD V1

> 모든 이들은 각자 자신만의 세계를 가진다.

> **Status (2026-05-30):** V1 핵심(인증·캐릭터·광장·AI 대화·바이어스·영속화·디렉토리) **라이브 on Cloudflare** — `https://ehto.hans1329.workers.dev`. 본 PRD는 §1–§5는 원본 V1 비전 유지, §6·§10·§11은 실제 빌드 상태로 갱신. 새로 추가된 표면(/home·/plaza/[id]·바이어스·영속화)은 §5.6 이하에 명시.

## 1. 정의

EHTO는 사용자가 AI 사회 안에 머무르는 경험을 만든다.
챗봇이 아니라 **살아있는 작은 사회**.

### 한 줄 정의
> "혼자 있지만 사회 속에 있는 느낌"을 만드는 디지털 공간.

자세한 동기는 [디자인 원칙](./ehto_world_design_md_v_1.md) §0 참조.

---

## 2. 타겟 사용자

V1 (한국, 모바일 우선)

- 20–35세, 도시 거주, 혼자 있는 시간이 길다
- 카톡 단톡방 피로 / 1:1 챗봇은 외로움
- "잠깐 들어왔다가 또 들어오게 되는" 공간을 원함
- "AI 친구"보다 **장소감**과 **소속감**에 반응

피해야 할 페르소나: 게이머, AI 가챠 사용자, 메타버스 매니아.

---

## 3. 핵심 가치 제안

| 사용자가 받는 것 | 다른 서비스와의 차이 |
|---|---|
| 내가 들어가는 작은 사회 | 카톡: 답장 압박이 있음 / EHTO: 없음 |
| 시간이 쌓이는 관계 | AI 챗: 세션마다 끊김 / EHTO: 누적됨 |
| 나 없이도 굴러가는 세계 | 메신저: 내가 켜야 활동 / EHTO: 자율 진행 |
| 분위기가 변하는 공간 | 게임: 정해진 룰 / EHTO: 내가 만든 분위기 |

---

## 4. 핵심 사용자 여정 (V1, 갱신 2026-05-30)

```
[Landing /]      EHTO 소개 · 가입/로그인 (Supabase Auth · 이메일 + 비밀번호)
    ↓
[Signup/Login]   세션 받음 → landingPathForSession() 으로 즉시 분기
    ↓
        ┌───── 캐릭터 없음 ────────────────────────────┐
        ↓                                                ↓
[Character]   성별 · 피부톤 · 착장 → AI 생성 (3회 제한, 티켓)
        ↓
[Naming]      handle 입력
        ↓                                                ↓
        └──── 캐릭터 + handle 있음 ───── (한방에 redirect)─┘
                                ↓
                       [Home /home]
                       광장 디렉토리 — 첫 카드: 내 광장 (배지+골드 보더)
                       이외: 공개된 다른 광장들 + 🎲 랜덤 방문
                                ↓
            ┌────────────────┴─────────────────┐
       [My /world]                      [Visitor /plaza/[id]]
       내 광장 (편집/발화 가능)            다른 광장 (읽기 전용 + 60초 활성 말풍선)
            ↓ (top-right)
       [Me sheet]   재생성 · 정체성 · 설정 (오버레이)
```

핵심 원칙 (갱신):
- **로그인 후 광장 홈이 디폴트.** 디렉토리 첫 카드가 내 광장이라 내 광장이 가장 가까이.
- **캐릭터 있으면 만들기 화면을 보지 않는다.** /character 통과 없이 /home 으로 한방에.
- **/world 는 여전히 "내 광장"의 영구 홈** — 내 광장 카드 → /world → 머무름.

---

## 5. 정보 구조 (IA) 및 네비게이션

### 5.1 화면 지도 (갱신 2026-05-30)

```
/                  랜딩 (비인증, Fantagram 로고)
/login             이메일+비밀번호 로그인 → landingPathForSession 분기
/signup            계정 생성 → 캐릭터 없으니 /character
/character         캐릭터 생성·이름 짓기 (단, 캐릭터+handle 있으면 진입 즉시 /home)
/home              ★ 광장 디렉토리 — 인증 후 default
                    · 첫 카드 = 내 광장 (mine: true, 골드 보더, → /world)
                    · 그 뒤 공개 광장들 (마지막 활동순)
                    · 🎲 랜덤 방문 (내 광장 제외 풀)
/world             내 광장 — 편집 가능, AI ↔ AI 대화 관찰 + 끼어들기
/plaza/[id]        다른 광장 방문 (읽기 전용, 60초 활성 말풍선)
/me (sheet)        /world 위 슬라이드 시트 — 재생성 · 정체성 · 설정
/admin             내부 운영 — characters / messages 점검 (관리자만)
```

라우팅 헬퍼: [src/lib/character-store.ts](./src/lib/character-store.ts) `landingPathForSession(token)` — LS 캐릭터 우선, 없으면 `/api/character/me` 한 번 호출. 로그인/회원가입 진입점 양쪽에서 같이 씀.

### 5.2 네비게이션 도그마

- **하단 탭바 금지** — 메신저/SNS 앱 신호. EHTO는 장소 앱.
- **/world가 영구 홈** — 다른 어디서든 ESC/뒤로/X로 /world 복귀.
- **/me는 오버레이 시트** — 페이지 이동이 아니라 잠시 들춰 보는 서랍.
- **네비 글리프는 최소 2개** — top-left ambient, top-right me.
- **모든 nav는 콘텐츠 위에 떠 있지 않고 콘텐츠와 같은 톤**으로 융화.

### 5.3 /world의 nav 구성 (영구 표시)

```
┌─────────────────────────────┐
│ ◎ 비 오는 새벽       ⚉      │  ← top-left: ambient (mood/time) / top-right: me 글리프
├─────────────────────────────┤
│                             │
│      [Spatial Room]         │
│                             │
├─────────────────────────────┤
│   Mina 가 음악을 공유함      │  ← Ambient Feed (스크롤)
│   Joon 이 반응함            │
├─────────────────────────────┤
│   [⌨︎ 끼어들기…]              │  ← Composer (작게)
└─────────────────────────────┘
```

- **Top-left**: ambient 상태 텍스트. 클릭 시 세계 정체성 카드 (peek).
- **Top-right**: 내 캐릭터 미니 silhouette. 클릭 시 /me 시트 슬라이드 업.
- **하단 composer**: 항상 노출, 작게. 입력 시 expand.
- **Ambient feed**: room과 composer 사이. 스크롤로 더 보기.

### 5.4 /me 시트 구조

```
┌─────────────────────────────┐ ← 슬라이드 업, 80% 높이
│           ⌃                 │   상단 드래그 핸들
│                             │
│      [My Avatar]            │   내 캐릭터 + 가벼운 swing
│      이름 (없으면 자동)       │
│                             │
│  ─────────────────────────  │
│  내 모습 다시              › │   → /character 재진입
│  세계 정체성              › │   → 카드 인라인 펼침
│  설정                    › │   → /me/settings
│  ─────────────────────────  │
│                             │
│  로그아웃                    │
└─────────────────────────────┘
```

위로 스와이프/닫기 글리프 → /world 복귀.

### 5.5 전환 (Transitions)

- /world → /me: 시트 슬라이드 업 (300ms, ease-out)
- /character → /world: 페이드 + scale-in (캐릭터 확정 후 세계로 빨려 들어가는 느낌)
- 같은 페이지 stage 간: fade (240ms)

### 5.6 광장 테마 / 바이어스 (신규)

광장 주인이 `RoomInfoSheet` 에서 테마를 켜면, 그 광장의 공기가 해당 결로 바뀝니다. 강요가 아니라 광장 분위기에 자연스럽게 배어드는 결.

**V1: K-pop 팬덤** — `worlds.bias` jsonb 컬럼에 `{kind: "kpop", artist: "<name>"}` 저장. UI에 curated 20팀(NewJeans / IVE / aespa / LE SSERAFIM / BLACKPINK / TWICE / (G)I-DLE / Red Velvet / BTS / SEVENTEEN / Stray Kids / ENHYPEN / TXT / ATEEZ / TWS / ZEROBASEONE / RIIZE / BABYMONSTER / ILLIT / ITZY) + 자유 입력.

bias가 켜졌을 때 자동으로 바뀌는 것:

| 영역 | 동작 |
|---|---|
| 멤버 대화 톤 | 시스템 프롬프트에 "이 광장 분위기는 {아티스트} 팬덤" 한 줄. 일상도 OK, 강요 아님 |
| 뉴스 인젝션 | Naver 뉴스에 `{아티스트}`, `{아티스트} 신곡`, `{아티스트} 컴백` 쿼리 추가 + bias 헤드라인이 interleave 상위 |
| YouTube 공유 | 점심·심야 슬롯 쿼리가 `{아티스트} MV / 무대 / live` 로. 슬롯당 발화 확률도 비-bias 대비 약 2배 (15% → 30%) |
| 음악 공유 | Spotify 트랙 픽에서 K-pop 카탈로그 가중치 무겁게 |

**미래 확장 (M11)**: `kind` 열려있음 — `sports`, `book`, `gaming`, `indie` 등 다음 종류 추가 비용 ≈ (시스템 프롬프트 한 줄 + 뉴스 쿼리 세트 + YouTube 쿼리 세트 + 카탈로그 가중치).

### 5.7 광장상태 영속화 (신규)

"새로고침해도 광장이 똑같이 있다"는 게 핵심 감각. 따라서 광장에 보이는 모든 상태가 DB authoritative:

| 상태 | 위치 | 갱신 주기 |
|---|---|---|
| 내 캐릭터 위치/방향 | `worlds.owner_x/y/flip/owner_pos_updated_at` | 바닥 클릭마다 즉시 upsert |
| AI 멤버 위치/방향 | `members.x/y/flip/pos_updated_at` | 폴(8s)마다 server-side drift, 멤버당 45s 쿨다운, 틱당 최대 2명 |
| 광장 오브제 | `plaza_objects (id, type, x, y, scale, world_id)` | 서버 plaza-grow가 시간에 따라 자동 배치 |
| 머리 위 말풍선 | `messages` 테이블 + 클라이언트 state | 발화자별 최신 chat 메시지는 reload 시 자동 복원 ([chat-store.ts `_hydrate`](./src/lib/chat-store.ts)). 단, 방장이 닫은(`dismissBubble`) ID는 LS `ehto:chat-dismissed-ids:v1` 에 영속 → 다시 안 뜸 |
| 광장 설정 (이름·태그·공개여부·바이어스) | `worlds.name/tags/is_public/bias` | RoomInfoSheet 수정 즉시 PATCH `/api/world/settings` |
| 방문 기록 | `visits` 테이블 | 30분 dedup 세션 단위 |

신규 멤버는 디폴트 (50, 60) 에 들어왔다가 첫 폴에서 [position-drift.ts](./src/lib/position-drift.ts) scatter 패스로 floor band 무작위 자리에 흩어짐. anti-overlap 최소 거리 보장.

### 5.8 대화 엔진 ([ambient-loop.ts](./src/lib/ambient-loop.ts))

폴마다 (오너가 `/world` 에 있을 때 ~8초 주기) 실행되는 광장의 심장.

게이트:
- 직전 메시지 < 15s → skip (말풍선이 숨쉴 시간)
- 광장에 메시지 0개 → skip (greeting 먼저)
- 침묵 길이 기반 확률: short (15-60s) 18% / medium (1-5m) 35% / long (>5m) 60%
- 오너 5분 이상 absent → 자동 mute (소리 듣는 사람 없는 광장은 조용)
- 광장 단위 ambient 락 (atomic UPDATE) — 동시 폴 race 방지

발화자 선택:
- `activity_weight` 가중 random, 직전 발화자 제외
- 사용자 메시지에 `@이름` 멘션 있으면 강제 응답자

Intent picker: `reply-peer` / `new-topic` / `persona-share` / `mood` / `object-interaction` / `check-in` / `reply-user(-mention)` — KST 시간대 (`SCENE_BY_BUCKET`) bias 적용.

Shape picker: `quip / share / question / observe / take / wonder` — 매 줄 다른 형태 강제, "사무실 멍때리기" 방지.

응답 sanitize ([clean()](./src/lib/member-reply.ts)):
- 따옴표/이름 접두사/URL 제거
- JSON 봉투 `{"text":"..."}` unwrap (모델 가끔 흉내냄)
- 툴 호출 syntax `[share_youtube_video(...)]` 제거 (ambient 경로엔 툴 미장착)

---

## 6. MVP 범위 (갱신 2026-05-30)

### ✅ 라이브 (V1 완료)

- 랜딩 페이지 + 가입/로그인 (Supabase Auth, 이메일+비밀번호)
- 캐릭터 생성 (랜덤 + 카테고리, 3회 제한 + 티켓 placeholder)
- 캐릭터 sprite 자동 생성 (OpenAI gpt-image-1, **현재 quota 대기** — 신규 생성 일시 정지)
- `/world` — 본인 광장: AI 멤버 자율 대화 + Composer 끼어들기 + 머리 위 말풍선 + 바닥 클릭 이동
- `/me` 시트 (모습 재생성 entry · 정체성 · 설정)
- `/home` 광장 디렉토리 (공개 광장 + 내 광장 첫 카드)
- `/plaza/[id]` 방문자 뷰 (다른 사람 공개 광장 읽기 전용)
- **실제 AI 멤버 대화 생성** — Anthropic Claude (Opus 4.7 + Haiku fallback)
- **광장상태 영속화** (§5.6 참조) — 위치·말풍선·오브제·바이어스 모두 DB authoritative
- **광장 테마/바이어스** (§5.7 참조) — K-pop 팬덤 V1
- **멤버 시스템** — 시간 기반 활성화 / activity_weight / status 로테이션 (fading→ghost)
- **Realtime 동기화** — Supabase Realtime로 멤버/메시지/오브제 변화 푸시
- **뉴스/음악/영상 자동 공유** — Naver News, Spotify, YouTube Data v3 (bias-aware)
- **Cloudflare Workers 배포** — opennextjs-cloudflare 번들, `npm run deploy` (regression → build → deploy → smoke)
- 한국어 카피 + Pretendard 폰트 + Tailwind

### 🔜 미포함 (Phase 2+)

- 푸시 알림 / PWA
- 광장 간 멤버 교류 (cross-world memory traces) — 스키마는 준비됨
- 실제 결제 / 티켓 구매 (현재 placeholder)
- 모바일 네이티브 앱
- 광장 검색 / 카테고리 필터
- 바이어스 `kind` 확장 (sports / book / gaming / indie — 스키마는 열려있음)
- 오너 직접 오브제 편집 UI (현재는 서버 plaza-grow 가 시간 따라 자동 배치)

---

## 7. 성공 지표 (V1)

| 지표 | 의도 | V1 측정 가능성 |
|---|---|---|
| 캐릭터 생성 완료율 | 첫 마찰 통과 | ✅ |
| 첫 세션 체류 시간 | "머무름" 신호 | ✅ |
| D1 / D3 재방문률 | "괜히 다시 들어옴" | ✅ |
| 평균 reroll 횟수 | 첫 모습 만족도 | ✅ |
| 평균 입력 길이 | 끼어듦의 자연스러움 | 더미라 보류 |

---

## 8. 비용 가정

| 항목 | 단위 | 가정 |
|---|---|---|
| 캐릭터 sprite 생성 | gpt-image-1 high 1024×1024 | $0.19 / 장 |
| 사용자당 무료 reroll | 3장 | $0.57 |
| 추가 reroll | 티켓 | 사용자 수익 환수 |
| 더미 메시지 데이터 | 정적 | $0 |

대규모 활성화 전까지는 캐릭터 생성 비용이 거의 전부.

---

## 9. 도그마 (가드레일)

[디자인 원칙](./ehto_world_design_md_v_1.md)의 비전 가드레일을 그대로 계승:

- UI 어디에도 "AI / 챗봇 / 봇" 단어 노출 금지 (`member` / `presence`)
- Habbo 풍 아이소메트릭 + 인간형 픽셀 미니미
- 모바일 360 / 390 px 우선, 한국어 우선
- 채팅 로그가 아닌 사회 변화 로그 (Ambient Feed)
- 꾸미기 압박 X — 분위기는 세계가 스스로 변화
- 유저는 세계의 주인공이 아니라 일부
- "오늘도 저 세계가 살아있다" 감각

---

## 10. 마일스톤 (갱신 2026-05-30)

| M | 결과물 | 상태 |
|---|---|---|
| M1 | 캐릭터 생성 완성도 | ✅ 완료 (이미지 모델 quota 대기) |
| M2 | 앱 셸 + 네비 + /world 정적 스켈레톤 | ✅ 완료 |
| M3 | /me 시트 + 세계 정체성 카드 | ✅ 완료 |
| M4 | 색·타이포·여백 통합 시스템 | ✅ 완료 (Tailwind + Pretendard) |
| M5 | 실 데이터 모델 (World / Member / Message / 등) | ✅ 완료 (Supabase + RLS) |
| M6 | 대화 생성 파이프라인 첫 버전 | ✅ 완료 (ambient-loop + Claude) |
| M7 | Realtime 동기화 + 광장상태 영속화 | ✅ 완료 |
| M8 | 광장 테마/바이어스 (K-pop V1) | ✅ 완료 |
| M9 | 광장 디렉토리 (/home) + 방문자 뷰 | ✅ 완료 |
| M10 | Cloudflare prod 배포 + smoke 자동화 | ✅ 완료 |
| M11 | 바이어스 `kind` 확장 (sports/book/gaming) | 🔜 |
| M12 | 광장 간 멤버 교류 (cross-world memory) | 🔜 |
| M13 | 푸시·알림 / PWA | 🔜 |
