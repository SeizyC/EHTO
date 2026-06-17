# Implicit Preference Learning — Design Spec

**Date**: 2026-05-31
**Status**: Draft → approved by user, ready for implementation plan
**Tagline**: "내 광장은 나를 알아간다"

---

## 1. 목표와 스코프

### 목표
사용자가 명시적 설정 없이도 광장 분위기가 그 사람의 관심사 결로 천천히 수렴하는 감각을 만든다. K-pop 같이 명시 bias를 켜지 않은 광장에서도, 사용자가 게임 얘기를 자주 하면 며칠 후 광장이 게임 결로 물든다.

### 포함
- **시그널 캡처**: 사용자가 직접 보낸 메시지(chat) + @-멘션(mention)
- **토픽 형식**: 자유 양식 키워드 (Haiku로 메시지당 1-2개 추출 — 기존 `extractTopic` 패턴 재사용)
- **시간 감쇠**: half-life 7일
- **Cold-start**: 사용자 계정 ≥ 3일 후부터 적용 시작
- **적용 강도**: soft nudge (명시 bias의 절반 정도)
- **적용 지점 5곳**:
  - A. ambient-loop 인텐트 픽커 + 프롬프트 한 줄
  - B. Naver 뉴스 쿼리 prepend
  - C. plaza-grow 오브제 선택 가중
  - D. 멤버 persona affinity drift (일 1회)
  - E. YouTube share 슬롯의 쿼리 fallback
- **투명성**: RoomInfoSheet 안에 상위 5 키워드 + 'X' (mute) 버튼 패널

### 미포함 (별도 후속)
- 말풍선 dismiss / 체류시간 시그널 — YAGNI
- 카테고리 분류 / 동의어 머지 — 자유 키워드만으로 시작
- 멤버↔멤버 학습 — 이미 `member_relations` 가 따로 다룸
- **Music share (Spotify) 토픽 적용** — 별도 sub-spec. Spotify Search API 통합이 본 스펙 범위 벗어남
- 건물(building) 카탈로그 — 별도 작업
- mute 해제 UI — 일단 영구 mute. 향후 필요해지면 UI 추가

---

## 2. 아키텍처 — 3 레이어

```
┌─────────────────────────────────────────────────────────┐
│ 1. CAPTURE  (POST /api/messages 후크)                    │
│    user 발화 도착 → 백그라운드 토픽 추출 (Haiku 1줄)        │
│    user_signals 행 INSERT (kind='chat' 또는 'mention')   │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 2. AGGREGATE (lib/implicit-pref.ts)                     │
│    user_signals(world_id, kind='chat')                  │
│      → time-decay (half-life 7d)                        │
│      → mute 필터 (user_topic_mutes)                      │
│      → 상위 N 토픽 + weight Map                          │
│    user_signals(world_id, kind='mention')               │
│      → 멤버별 호감 score Map                              │
│    캐시: 5분 (world_id 키, in-process Map)              │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 3. APPLY                                                 │
│   A. ambient-loop pickAmbientIntent                     │
│      → 상위 토픽 있을 때 new-topic 가중치 +30%            │
│      → 시스템 프롬프트 끝에 한 줄 추가                     │
│   B. news-fetch getNewsHeadlines                        │
│      → 상위 1 토픽을 bias 쿼리 다음 자리에 추가            │
│   C. plaza-grow tickPlazaGrowth                         │
│      → 다음 객체 선택 시 catalog topics[] 매칭 가중치     │
│   D. persona-drift.ts (slow, 일 1회)                    │
│      → 멘션된 멤버부터 affinity에 상위 토픽 천천히 흡수    │
│   E. youtube-share pickQuery                            │
│      → bias 없을 때 top topic 으로 쿼리 ("topic stage")  │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ TRANSPARENCY (RoomInfoSheet 안 새 섹션)                  │
│   "광장이 자주 떠올리는 결" 패널                            │
│   상위 5 키워드 + weight bar + X(mute)                    │
└─────────────────────────────────────────────────────────┘
```

### Cold-start 게이트
`auth.users.created_at` 기준 사용자 계정 나이가 3일 미만이면 `aggregateImplicit(worldId)` 가 **빈 결과**를 반환해 5개 적용 지점이 모두 자동 패스. 3일 이후부터 정상 작동. 반환 표면이 통일되어 있어 적용 지점들은 cold-start를 의식할 필요 없음.

---

## 3. 데이터 스키마

### 신규 테이블 (마이그레이션 `20260601000001_implicit_preference.sql`)

```sql
-- 매 신호 raw 보관. 시간 감쇠 + mute 필터는 read time 계산.
create table public.user_signals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  world_id          uuid not null references public.worlds(id) on delete cascade,
  kind              text not null check (kind in ('chat', 'mention')),
  topic_keyword     text,        -- chat 신호일 때 채워짐 (Haiku 추출)
  target_member_id  uuid references public.members(id) on delete set null,
  -- chat: 1.0 / mention: 0.8 (구현부 상수, 미래 신호 가중치 추가 여지)
  weight            real not null default 1.0,
  created_at        timestamptz not null default now()
);

create index user_signals_world_recent_idx
  on public.user_signals(world_id, created_at desc);
create index user_signals_world_topic_idx
  on public.user_signals(world_id, topic_keyword)
  where topic_keyword is not null;

alter table public.user_signals enable row level security;

-- 본인만 자기 신호 SELECT (투명성 패널용).
-- INSERT/UPDATE/DELETE 는 service role 전용 — 클라이언트가 조작 못함.
create policy "user_signals: owner read"
  on public.user_signals for select
  using (auth.uid() = user_id);


-- 사용자가 "그건 아니야" X 누른 키워드. 영구 mute.
create table public.user_topic_mutes (
  user_id        uuid not null references auth.users(id) on delete cascade,
  world_id       uuid not null references public.worlds(id) on delete cascade,
  topic_keyword  text not null,
  muted_at       timestamptz not null default now(),
  primary key (user_id, world_id, topic_keyword)
);

alter table public.user_topic_mutes enable row level security;
create policy "user_topic_mutes: owner read"
  on public.user_topic_mutes for select
  using (auth.uid() = user_id);
create policy "user_topic_mutes: owner insert"
  on public.user_topic_mutes for insert
  with check (auth.uid() = user_id);
create policy "user_topic_mutes: owner delete"
  on public.user_topic_mutes for delete
  using (auth.uid() = user_id);
```

### 스키마 변경 없는 보조 변경
- [`OBJECT_CATALOG`](../../src/lib/plaza-objects.ts) 각 엔트리에 `topics?: string[]` 코드 상수로 추가 (DB 변경 없음).
- `worlds.last_persona_drift_at timestamptz` 컬럼 추가 — D번 일 1회 게이트.

### 용량 가정
사용자당 일평균 발화 ~30개 × 신호 1.x 배 ≈ 50/일. 1년 ~18k 행. 인덱스 두 개로 read 빠름. 90일 지난 행은 nightly purge 옵션 (decay로 weight 0.0002 수준이라 의미 없음).

---

## 4. 적용 지점 디테일

### A. Intent picker — ambient-loop.ts

현재 [`pickAmbientIntent`](../../src/lib/ambient-loop.ts) 가 `reply-peer / new-topic / persona-share / mood / object-interaction / check-in` 중 weighted random.

**변경**:
- `topImplicitTopic.weight > 0.5` 이면 `new-topic` 가중치 `× 1.3`
- 시스템 프롬프트 끝에 `biasPromptLine` 옆에 새 한 줄 (bias가 있어도 추가):
  ```
  [최근 자주 떠올랐던 결]
  {top1}, {top2} — 매번 강요는 아니지만 결이 그쪽으로 자연스럽게 흐를 때 한 줄 흘려도 좋아.
  ```
- 멘션 호감 상위 멤버는 발화자 weighted pick에서 부드러운 부스트:
  ```
  // mentionScoreNorm = state.mentions.get(m.id) / max(mentions.values()),
  //                    범위 0..1 (없으면 0)
  effectiveWeight = activity_weight × (1 + 0.5 × mentionScoreNorm)
  ```
  최대 부스트 1.5×. soft-nudge 원칙 — 멘션 많이 받은 멤버가 발화 빈도가 두 배가 되진 않는다.

**호출**: 매 ambient tick 시작에 `aggregateImplicit(worldId)` 1회 — 5분 캐시 덕에 보통 cache-hit.

### B. News fetch — news-fetch.ts

현재 bias 쿼리 + 일반 6개 (`연예 / K-pop / 드라마 / 이슈 / 사건사고`).

**변경**:
- 상위 토픽 1개를 bias 쿼리 다음, 일반 쿼리 앞에 prepend: `[...biasQs, ...topTopicQs, ...QUERIES]`
- topTopicQs cap: 1개 (top1 만 — 너무 많으면 일반 카테고리 밀려남)
- `cap = PER_CATEGORY_CAP + 2` (bias는 `+4`, implicit은 한 단계 아래 — soft-nudge 원칙)
- interleave 순서: bias → implicit → 일반

**Cache key 영향**: 기존 `biasKey(bias)` → `biasKey(bias) + ":" + topImplicitTopic` (`topImplicitTopic = state.topics[0]?.topic ?? ""`). 다른 implicit 토픽이면 다른 캐시 버킷.

### C. Object spawn — plaza-grow.ts

현재 milestone 도달 시 카탈로그 고정 enum (Day 2: planter, Week 1: fountain+bench, Week 2+: lamp, tree, dog 등).

**변경**:
1. [OBJECT_CATALOG](../../src/lib/plaza-objects.ts) 각 엔트리에 `topics?: string[]` 코드 상수 추가:
   ```ts
   bench:         { ..., topics: ['휴식', '독서', '대화'] }
   lamp:          { ..., topics: ['밤', '분위기', '거리'] }
   tree:          { ..., topics: ['자연', '계절', '쉼'] }
   fountain:      { ..., topics: ['중앙', '공공', '클래식'] }
   planter:       { ..., topics: ['식물', '소소함'] }
   dog_shiba:     { ..., topics: ['반려', '활기', '귀여움'] }
   dog_maltese:   { ..., topics: ['반려', '귀여움'] }
   dog_retriever: { ..., topics: ['반려', '쉼'] }
   dog_dachshund: { ..., topics: ['반려', '귀여움'] }
   ```
2. plaza-grow가 다음 milestone에서 객체 선택할 때 후보 풀에서 카탈로그 `topics` 와 implicit top-K (K=3) overlap 많은 것 우선 weighted pick
3. overlap 없으면 기존 milestone 룰 그대로 (fallback)

### D. Persona drift — lib/persona-drift.ts (신규)

```ts
export async function tickPersonaDrift(sb, worldId): Promise<{ drifted: string | null }>
```

- 일 1회 게이트: `worlds.last_persona_drift_at` IS NULL OR < now() - 24h
- 멤버 풀: status='active', activity_weight ≥ 0.3
- 가중치 pick: 멘션 호감 ≥ 0.5 인 멤버는 `× 2` 보정, 나머지는 baseline
- 선택된 멤버의 `persona.affinity` 길이 < 5 AND 상위 토픽이 affinity에 없으면 1개 append
- `worlds.last_persona_drift_at = now()` 갱신
- `/api/world/members` 폴 중간에 `tickPlazaGrowth` 뒤에 호출 (다른 daily 틱과 같은 자리)

**예시**:
```
우 affinity ['minimal', '심플', '짧음']
+ implicit top1 = '게임'
→ ['minimal', '심플', '짧음', '게임']
```

### E. YouTube share — youtube-share.ts

현재 [`pickQuery`](../../src/lib/youtube-share.ts#L89):
```ts
if (bias?.kind === "kpop" && bias.artist.trim()) {
  return `${bias.artist} ${randomSuffix}`;
}
return GENERAL_QUERIES[random];
```

**변경**:
```ts
if (bias?.kind === "kpop" && bias.artist.trim()) {
  return `${bias.artist} ${randomSuffix}`;
}
if (topImplicitTopic) {
  return `${topImplicitTopic} ${randomSuffix}`;
}
return GENERAL_QUERIES[random];
```

`pickQuery(bias, topImplicitTopic)` 시그니처로 확장. caller (`tickYoutubeShare`) 가 aggregate 한 번 부르고 넘김.

Per-tick share roll:
- bias 있음: 30% (기존)
- implicit 있음 + bias 없음: **20%** (중간값)
- 둘 다 없음: 15% (기존)

---

## 5. Cold-start (≥ 3일 게이트)

- `auth.users.created_at` 으로 계정 나이 계산.
- `aggregateImplicit(worldId)` 가 빈 결과 (`{ topics: [], mentions: new Map() }`) 반환.
- 5개 적용 지점이 모두 자동 패스 — fall-through 로 기존 동작 유지.
- 이유: 처음 며칠은 "광장이 다양한 결을 흘려주는 시기". 너무 빨리 수렴하면 사용자가 "이게 다인가" 느낌.
- 7-day half-life + 3-day cold-start = 첫 적용 시점에 누적 신호의 무게가 충분.

---

## 6. 투명성 패널 (RoomInfoSheet)

광장 설정 시트 안에 새 섹션:

```
┌────────────────────────────────────┐
│ 광장이 자주 떠올리는 결                │
│                                      │
│  롤     ████████░░░  ✕              │
│  떡볶이  ██████░░░░░  ✕              │
│  새벽    ████░░░░░░░  ✕              │
│  비    ███░░░░░░░░  ✕              │
│  손흥민  ██░░░░░░░░░  ✕              │
│                                      │
│  · 광장에서 한 얘기를 보고 자동으로     │
│    잡힌 결이에요. 안 맞으면 X 누르세요. │
└────────────────────────────────────┘
```

- 상위 5개 토픽, decayed weight를 normalize한 막대로 시각화.
- X 클릭 → `POST /api/world/topics/mute` → `user_topic_mutes` INSERT → 즉시 패널에서 제거 + 향후 영원히 weight 0.
- Cold-start 기간 (계정 < 3일) 엔 패널 자체를 "아직 광장이 결을 찾는 중..." 안내로 대체.

---

## 7. 컴포넌트와 인터페이스

| 단위 | 책임 | 입력 | 출력 |
|---|---|---|---|
| `lib/implicit-pref.ts` | aggregate, cache, topic-extraction | `(sb, worldId, userId)` | `{ topics: TopicEntry[]; mentions: Map<memberId, score>; coldStart: boolean }` |
| `lib/topic-extract.ts` | 메시지 텍스트 → 키워드 0-2개 (Haiku) | `text: string` | `string[]` |
| `lib/persona-drift.ts` | 일 1회 멤버 affinity 드리프트 | `(sb, worldId)` | `{ drifted: memberId \| null }` |
| `app/api/messages/route.ts` POST | 시그널 capture 호출 | `(text, mentionedMemberId?)` | (side effect) |
| `app/api/world/topics/mute/route.ts` POST | 토픽 mute | `{ topic }` | `{ ok }` |
| `app/api/world/topics/route.ts` GET | 패널용 상위 5 + cold-start 플래그 | (auth) | `{ topics, coldStart }` |
| `components/RoomInfoSheet` | 투명성 섹션 렌더 + mute 클릭 | (props) | (UI) |

### `aggregateImplicit` 시그니처
```ts
type TopicEntry = { topic: string; weight: number };
type ImplicitState = {
  topics: TopicEntry[];     // decayed, mute 제외, weight desc
  mentions: Map<string, number>;  // memberId → mention score
  coldStart: boolean;       // 계정 < 3일이면 true (consumer는 무시해도 됨, 빈 결과)
};
export async function aggregateImplicit(
  sb: SupabaseClient, worldId: string,
): Promise<ImplicitState>;
```

In-process 캐시 키 = `worldId`, TTL 5분. 캐시 hit이면 DB read 없음.

### 토픽 추출 (capture 후크)
- POST `/api/messages` 가 user 메시지 INSERT 직후, fire-and-forget로 `extractTopicsForSignal(text)` 호출.
- Haiku 1회 호출 (저렴) — "이 한 줄에서 가장 두드러진 명사 0-2개를 골라줘. 일상 단어는 빼고."
- 결과 ≥ 1개면 `user_signals` 행 INSERT (kind='chat').
- 멘션은 텍스트 파싱 ( `@이름` ) 으로 별도 행 INSERT (kind='mention', target_member_id 채움, topic 비움).

### 에러 처리
- Haiku 실패 / 빈 응답 → INSERT 패스 (시그널 안 쌓임). 사용자 영향 없음.
- aggregate read 실패 → 빈 ImplicitState 반환. 5개 적용 지점이 자동 패스.
- mute API 실패 → 토스트로 "다시 시도해주세요" 표시, UI 상태 롤백.

---

## 8. 테스트 전략

### 단위
- `aggregateImplicit` 의 시간 감쇠 — 7일 전 신호 weight 0.5, 14일 전 0.25 검증.
- mute 필터 — muted 토픽은 결과에 없음.
- cold-start — 계정 1일이면 빈 결과.
- 토픽 추출 — 일상 단어 ("그래", "맞아") 는 0개 반환.

### 통합
- POST /api/messages → user_signals 행 생기는지.
- /api/world/topics GET → 상위 5 + cold-start 플래그 응답.
- /api/world/topics/mute → user_topic_mutes 행 + 다음 aggregate 결과에서 제외.

### 회귀
- 기존 ambient-loop / news-fetch / plaza-grow / youtube-share — implicit 없을 때 (빈 결과) 동작 기존과 동일한지 ( fall-through 경로 ).

---

## 9. 마이그레이션 계획

1. Migration `20260601000001_implicit_preference.sql` — 두 테이블 + RLS + `worlds.last_persona_drift_at` 컬럼.
2. 코드 배포 — 시그널 캡처 활성화. 기존 사용자에 대해 신호 누적 시작.
3. 누적 후 3일 지난 사용자부터 자동으로 5개 적용 지점 켜짐 (cold-start 게이트).
4. 1주일 후 RoomInfoSheet 패널 검증 — 토픽 분포가 의미있게 나오는지 확인. 무의미한 토픽 ("그", "거") 가 자주 잡히면 토픽 추출 프롬프트 보강.

롤백 — 5개 적용 지점은 모두 fall-through (빈 결과면 기존 동작). 문제 발견 시 capture만 끄면 (POST hook 주석) 전체 시스템이 자연스럽게 기존 동작으로 회귀.

---

## 10. 미래 확장 (스코프 외)

- **Music share (Spotify) implicit 적용** — 별도 sub-spec. Spotify Search API 통합.
- **건물 카탈로그** — 별도 카탈로그 + isometric 통합 작업.
- **Cross-world memory** — 한 사용자가 여러 광장 다니는 시나리오 가정. 현재는 광장당 독립.
- **카테고리 분류 / 동의어 머지** — 토픽 수가 100+ 되면 의미 있을 수 있음. 현재는 raw keyword 만으로 충분.
- **사용자 신호 export / 삭제** — 개인정보 측면. GDPR 같은 요구 생기면.
- **mute 해제 UI** — 영구 mute가 답답해지면 패널에 "다시 듣기" 토글.
