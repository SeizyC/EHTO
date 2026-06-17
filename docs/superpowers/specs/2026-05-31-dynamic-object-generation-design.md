# Dynamic Object Generation & Variant Catalog — Design Spec

**Date**: 2026-05-31
**Status**: Draft → approved by user, ready for implementation plan
**Tagline**: "사용자 토픽이 광장 가구가 된다 — 단조롭지 않게"
**Related**: extends [2026-05-31-implicit-preference-design.md](./2026-05-31-implicit-preference-design.md) Apply C
**Blocker**: OpenAI quota restoration (gen-object pipeline is operational, just paused)

---

## 1. 목표와 스코프

### 목표
1. 사용자가 implicit 토픽으로 잡힌 결을 광장 가구로 구체화 — 게임 얘기 자주 하면 며칠 뒤 광장에 게이밍 의자가 생긴다.
2. 같은 종류(type)가 여러 광장에 쓰일수록 자동으로 시각적 베리에이션 (`lamp_v1`, `lamp_v2`, …) 추가 — 1000명이 같은 가로등 보는 단조로움 회피.
3. 사용자가 안 어울리는 동적 오브제는 광장 설정에서 제거.

### 포함
- **공유 카탈로그 DB화**: 기존 정적 9종을 `object_types` + `object_variants` 테이블로 이행. 향후 추가는 정적/동적 모두 동일 모델.
- **Variant 자동 생성**: usage_count 누적되면 백그라운드로 다음 variant 생성 (CAP 5).
- **동적 type 생성**: plaza-grow milestone 트리거 + 동적 가드 통과 시 (topic, desc) → 새 type. 전역 카탈로그라 다른 광장이 같은 토픽으로 도달하면 재사용.
- **이행 자동화**: 한 번의 마이그레이션 + bootstrap 스크립트로 기존 9종이 DB 옮겨감.
- **dismiss UI**: RoomInfoSheet 안의 "광장 오브제" 섹션. 동적/사용자 추가 type 에 [제거] 버튼.

### 미포함 (Phase 2+)
- A/B 다른 description 비교
- LLM vision으로 생성 sprite 자동 품질 체크
- 운영자 admin 페이지
- 부서진 sprite 자동 재생성
- 사용자가 직접 "이거 만들어줘" 명시 요청 (current flow는 implicit-driven)
- Variant rotation in same plaza (광장 안에서 같은 type 인스턴스 2+ 일 때 다른 variant 강제) — 자연 random pick으로 충분

### 의존성
- OpenAI 크레딧 복구 (현재 quota 만료)
- 기존 [`sprite-gen/gen-object.sh`](../../sprite-gen/gen-object.sh) 파이프라인 그대로 활용
- [`chroma.py`](../../sprite-gen/chroma.py) 후처리 + Supabase Storage 업로드 (스크립트 추가)

---

## 2. 아키텍처 — 4 레이어

```
┌─────────────────────────────────────────────────────────┐
│ 1. TRIGGER  (plaza-grow tickPlazaGrowth)                │
│    milestone 도달 + slot 의 implicit overlap 약함        │
│    + implicit top topic 있음 + 광장 일 1회 quota 잔여    │
│    → tryGenerateDynamicType(...)                        │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 2. CATALOG LOOKUP/GEN (lib/dynamic-object-gen.ts)       │
│    (a) (topic, desc_key) 룩업 — 있으면 type 즉시 반환    │
│    (b) 없으면 Haiku 1 호출로 description 작성            │
│        sha256(description)[0..16] = desc_key            │
│    (c) gpt-image-1 으로 v1 생성 → chroma 처리            │
│        → Supabase Storage 업로드                         │
│    (d) object_types + object_variants(idx=1) INSERT      │
│    실패 시 1회 재시도 → 그래도 실패 → null               │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 3. VARIANT GROWER (background fire-and-forget)          │
│    usage_count_per_variant > 5 AND variant_count < 5    │
│    → generateVariant(type) (lazy, 다음 광장이 받아씀)   │
└─────────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────┐
│ 4. PLACEMENT (plaza-grow의 기존 자리)                    │
│    variants[] random pick                               │
│    plaza_objects INSERT (variant_id, x, y, scale)        │
│    object_types.usage_count atomic increment            │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ DISMISSAL (RoomInfoSheet "광장 오브제" 섹션)             │
│   광장에 놓인 type 목록 — 동적/사용자 추가 type 에 [제거] │
│   클릭 → user_object_mutes INSERT + 광장의 모든          │
│   해당 type placement DELETE                             │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 데이터 스키마

### 마이그레이션 `20260601000002_object_catalog_dynamic.sql`

```sql
-- 논리 type (정적 + 동적 통합).
create table public.object_types (
  id                uuid primary key default gen_random_uuid(),
  type_key          text unique not null,        -- 'lamp', 'gaming_chair'
  label_ko          text not null,
  native_height_pct real not null,
  topics            text[] not null default '{}',
  origin            text not null check (origin in ('static', 'dynamic')),
  origin_topic      text,                        -- dynamic만
  origin_desc_key   text,                        -- dynamic만 (sha256 prefix)
  usage_count       int not null default 0,
  created_at        timestamptz not null default now(),
  unique (origin_topic, origin_desc_key)         -- 동적 dedup; static은 둘 다 null이라 OK
);

create index object_types_origin_idx on public.object_types(origin);
create index object_types_topics_idx on public.object_types using gin (topics);

-- 같은 type의 다른 룩 (variants[idx=1..5])
create table public.object_variants (
  id           uuid primary key default gen_random_uuid(),
  type_id      uuid not null references public.object_types(id) on delete cascade,
  variant_idx  int  not null,
  sprite_url   text not null,
  created_at   timestamptz not null default now(),
  unique (type_id, variant_idx)
);

create index object_variants_type_idx on public.object_variants(type_id);

-- 사용자별 광장별 type mute
create table public.user_object_mutes (
  user_id  uuid not null references auth.users(id) on delete cascade,
  world_id uuid not null references public.worlds(id) on delete cascade,
  type_id  uuid not null references public.object_types(id) on delete cascade,
  muted_at timestamptz not null default now(),
  primary key (user_id, world_id, type_id)
);

alter table public.user_object_mutes enable row level security;
create policy "user_object_mutes: owner read"
  on public.user_object_mutes for select using (auth.uid() = user_id);
create policy "user_object_mutes: owner insert"
  on public.user_object_mutes for insert with check (auth.uid() = user_id);
create policy "user_object_mutes: owner delete"
  on public.user_object_mutes for delete using (auth.uid() = user_id);

-- 광장 일일 동적 gen 가드
alter table public.worlds
  add column if not exists last_dynamic_gen_at timestamptz;

-- 기존 plaza_objects에 variant_id 추가. type 컬럼은 deprecate (Phase 1 dual-write).
alter table public.plaza_objects
  add column if not exists variant_id uuid
    references public.object_variants(id) on delete set null;
```

### Bootstrap 스크립트 `scripts/bootstrap-object-catalog.mjs`

기존 9종 + 각각의 첫 variant를 DB로 옮긴다. 1회 실행, 멱등.

```js
// for each entry in OBJECT_CATALOG (code constant):
//   1. INSERT object_types (origin='static', type_key, label_ko, native_height_pct, topics)
//   2. INSERT object_variants (variant_idx=1, sprite_url=existing public PNG path)
// idempotent via ON CONFLICT DO NOTHING on (type_key)
```

기존 `plaza_objects` 행도 backfill: 각 행의 `type` 텍스트로 `object_types` 룩업해서 v1 `variant_id` 채움. 마이그레이션과 함께 1회.

### 데이터 정합성 메모

- 동시성: `object_types.usage_count` 증분은 `update ... set usage_count = usage_count + 1`로 atomic.
- 베리에이션 생성 충돌: 같은 type에 동시에 v2를 만들려는 경우 unique(type_id, variant_idx)로 한 쪽만 성공. 실패 쪽은 silent drop.
- 동적 type dedup: `unique (origin_topic, origin_desc_key)` — 1000광장에서 같은 토픽이 잡혀도 첫 한 광장만 GEN 실행, 나머지는 catalog 룩업.

---

## 4. 적용 흐름 디테일

### 4.1 Trigger 조건 (plaza-grow)

```ts
const shouldTryDynamic =
  staticPick === milestone.place.type &&   // alternate가 약했음 (overlap 0)
  implicit.topics.length > 0 &&            // 사용자 신호 있음
  !world.last_dynamic_gen_at ||            // 광장 일 1회 가드 ↓
    (Date.now() - new Date(world.last_dynamic_gen_at).getTime() > 24h);
```

### 4.2 `tryGenerateDynamicType` (lib/dynamic-object-gen.ts)

```ts
export async function tryGenerateDynamicType(opts: {
  topic: string;
  slotHeightPct: number;
  slotTopics: string[];
}): Promise<ObjectType | null> {
  // 1. Description 생성 (Haiku)
  const description = await composeObjectDescription(opts.topic, opts.slotTopics);
  if (!description) return null;
  // desc_key 정규화: trim + 소문자 + 공백 단일화 → sha256 prefix 16자.
  // 같은 의미의 description (대소문자/공백 차이)도 같은 key가 되도록.
  const normalized = description.trim().toLowerCase().replace(/\s+/g, " ");
  const descKey = sha256(normalized).slice(0, 16);

  // 2. Catalog 룩업 (전역 dedup)
  const existing = await fetchTypeByOriginKey(opts.topic, descKey);
  if (existing) return existing;

  // 3. Sprite 생성 (1회 재시도)
  let spriteUrl: string | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    spriteUrl = await generateAndUploadSprite(description);
    if (spriteUrl) break;
  }
  if (!spriteUrl) return null;

  // 4. Type + 첫 variant INSERT
  const typeKey = `dyn_${descKey}`;
  const labelKo = await composeKoreanLabel(description) || opts.topic;
  return await insertType({
    type_key: typeKey,
    label_ko: labelKo,
    native_height_pct: opts.slotHeightPct,
    topics: [opts.topic, ...opts.slotTopics],
    origin: "dynamic",
    origin_topic: opts.topic,
    origin_desc_key: descKey,
    initialVariantUrl: spriteUrl,
  });
}
```

### 4.3 Description 작성 (Haiku 프롬프트)

```
[system]
당신은 광장 오브제의 시각 description 한 줄을 작성합니다.

규칙:
- 토픽: {topic}
- 슬롯 톤(참고): {slotTopics.join(", ")}
- 결과는 영어 10-20단어. 구체적 단일 사물 (categorical X — "a guitar"가 아니라 "a worn black classical guitar leaning against a wooden stand").
- 시점: isometric pixel art, 3/4 front view
- 분위기: contemporary urban small plaza, not fantasy
- 결과만 출력. "Description:" 같은 접두사 X.

[user]
{topic} 결의 광장 가구 한 줄.
```

### 4.4 Sprite 생성 (기존 gen-object.sh 로직 재사용)

`sprite-gen/gen-object.sh` 의 본문을 TypeScript로 포팅. 핵심:

```ts
async function generateAndUploadSprite(description: string): Promise<string | null> {
  const prompt = buildObjectPrompt(description); // gen-object.sh의 prompt template
  const png = await openAI.images.generate({
    model: "gpt-image-1",
    prompt,
    n: 1,
    size: "1024x1024",
    quality: "high",
  });
  const chromaed = await chromaKey(png);         // chroma.py 로직 포팅
  // Supabase Storage bucket 'plaza-objects' (public read).
  // 경로: dynamic/{uuid}.png. 기존 정적 sprite는 public/sprites/.. 그대로
  // 유지하므로 path collision 없음.
  const url = await uploadToStorage("plaza-objects", `dynamic/${crypto.randomUUID()}.png`, chromaed);
  return url;
}
```

`chroma.py` 도 Node 환경으로 포팅 가능 (Sharp + Pixel scan). 코드량 적음 (~50줄).

### 4.5 Variant 생성 (background lazy)

placement 직후 fire-and-forget:

```ts
const variantsPerUsage = type.usage_count / variants.length;
if (variantsPerUsage > 5 && variants.length < VARIANT_CAP /* 5 */) {
  void generateVariantBackground(type);
}

async function generateVariantBackground(type: ObjectType) {
  // 같은 description + "variation N" 부재
  // 또는 description 살짝 변형 ("alternate color palette", "different angle")
  // → v(N+1) 생성 → object_variants INSERT
  // 실패해도 silent — 다음 placement가 다시 trigger
}
```

CAP 5 이유: 5개 이상은 다양성이 의미가 없어짐, 비용도 무한 누적 막음.

### 4.6 Placement + 렌더

`plaza-grow` 가 variant 결정 후 INSERT:

```ts
const chosenVariant = variants[Math.floor(Math.random() * variants.length)];
await sb.from("plaza_objects").insert({
  world_id: worldId,
  variant_id: chosenVariant.id,
  x: milestone.x,
  y: milestone.y,
  scale: milestone.scale ?? 1,
});
await sb.rpc("increment_usage_count", { type_id: type.id });
```

API 응답 (`/api/world/objects`, `/api/plaza/[id]`) 가 placement를 enrich:

```jsonc
{
  "id": "<plaza_objects.id>",
  "x": 50, "y": 60, "scale": 1.0,
  "spriteUrl": "<object_variants.sprite_url>",
  "nativeHeightPct": 24,
  "labelKo": "분수대"
}
```

PlazaCanvas는 OBJECT_CATALOG 상수 의존 제거 — API가 모든 렌더 메타를 줌. 기존 정적 카탈로그 코드 제거 (Bootstrap 스크립트로 DB에 있음).

### 4.7 Dismissal (RoomInfoSheet)

광장 설정 시트에 새 섹션:

```
┌──────────────────────────────────────┐
│ 광장 오브제                            │
│                                        │
│  분수대   v1                          │
│  벤치    v1, v2                       │
│  가로등  v2                           │
│  나무    v1, v2                       │
│  ─────                                │
│  게이밍 의자 (자동 추가)        [제거]  │
│  네온 사인  (자동 추가)         [제거]  │
│                                        │
│  · 자동 추가된 결만 제거할 수 있어요.   │
│    제거하면 같은 결이 다시 안 나와요.   │
└──────────────────────────────────────┘
```

- 광장 안 모든 placement → type 단위로 그루핑 + variant_idx 리스트
- `origin='static'` type은 [제거] 버튼 없음 (기본 광장 구성 보호)
- `origin='dynamic'` type은 버튼 노출
- 클릭 → `POST /api/world/objects/types/:typeId/mute` →
  1. `plaza_objects` 행들 DELETE (해당 type의 모든 variants)
  2. `user_object_mutes` INSERT
  3. 다음 plaza-grow tick에서 같은 type 제외

---

## 5. 비용·안전 가드 (3중)

| 가드 | 메커니즘 | 효과 |
|---|---|---|
| 광장당 일 1회 | `worlds.last_dynamic_gen_at` 24h check | 한 광장이 비용 폭주 X |
| 전역 (topic, desc_key) 1회 | `object_types.unique(origin_topic, origin_desc_key)` | 같은 결은 전 광장 합쳐 1회 GEN |
| Variant CAP 5 | `object_types.usage_count / variants.length > 5` AND `variants.length < 5` | 한 type 최대 5개 룩, 무한 증가 차단 |

### 콘텐츠 안전
- topic length ≤ 40 chars (capture 단에서 이미 cap)
- Haiku description 프롬프트에 "contemporary urban small plaza style, not fantasy" 강제 → fantasy/폭력 reduction
- gpt-image-1 자체 content policy
- 그래도 부적절하게 보이면 사용자 dismissal로 mute

### Worst-case 비용 시나리오
- 1000 광장 × 모두 다른 토픽 × 일 1회 GEN = 1000건/일 = ~$200/일 = $6k/월
- 실제: 토픽 overlap 큼 (K-pop, 게임, 책 등 인기 topic 집중) → 보통 첫 1주에 100-200 종류만 생성, 이후 dedup 캐시 hit
- Variant lazy gen: usage 임계점 도달한 인기 type만 → 월 ~$50 추가

---

## 6. 컴포넌트와 인터페이스

| 단위 | 책임 | 입력 | 출력 |
|---|---|---|---|
| `lib/dynamic-object-gen.ts` | description → sprite → Storage → catalog | `{topic, slotHeightPct, slotTopics}` | `ObjectType \| null` |
| `lib/object-catalog.ts` | DB-backed catalog 룩업 (객체 type/variants 조회) | `worldId` | API용 enriched object payload |
| `lib/sprite-pipeline.ts` | gpt-image-1 호출 + chroma + 업로드 | `description: string` | `spriteUrl: string \| null` |
| `lib/persona-drift.ts` 인접 — `lib/variant-grow.ts` | usage 임계점 시 variant N+1 gen | `typeId` | (side effect) |
| `app/api/world/objects/route.ts` (수정) | API 응답 enrich | (auth) | enriched objects |
| `app/api/world/objects/types/[id]/mute/route.ts` (신규) | type mute | `(typeId)` | `{ok}` |
| `components/RoomInfoSheet` (수정) | "광장 오브제" 섹션 + 제거 버튼 | (props) | UI |
| `components/PlazaCanvas` (수정) | OBJECT_CATALOG 의존 제거 → props.objects 의 spriteUrl/nativeHeightPct 사용 | (props) | UI |
| `scripts/bootstrap-object-catalog.mjs` (신규) | 정적 9종 + 기존 plaza_objects backfill | — | (1회 실행) |

### `ObjectType` 클라이언트 타입
```ts
type ObjectType = {
  id: string;
  type_key: string;
  label_ko: string;
  native_height_pct: number;
  topics: string[];
  origin: "static" | "dynamic";
  origin_topic?: string;
  origin_desc_key?: string;
  usage_count: number;
  variants: Array<{ id: string; variant_idx: number; sprite_url: string }>;
};
```

---

## 7. 마이그레이션 + 롤아웃

1. **마이그레이션 적용**: `20260601000002_object_catalog_dynamic.sql` → 새 테이블 + 컬럼.
2. **Bootstrap 실행**: `node scripts/bootstrap-object-catalog.mjs` → 정적 9종 + 기존 plaza_objects의 `variant_id` backfill.
3. **API 응답 enrich 배포**: `/api/world/objects`, `/api/plaza/[id]` 가 spriteUrl/nativeHeightPct 포함. PlazaCanvas 측 OBJECT_CATALOG 의존 제거.
4. **plaza-grow 동적 라인 활성화**: implicit-pref 와 연동. (OpenAI 크레딧 복구 전엔 `tryGenerateDynamicType` 가 즉시 null 반환하도록 가드 → 안전 fallback)
5. **OpenAI 복구 후**: 가드 해제. 자연 트리거 시작.
6. **1주 후 모니터링**: 어떤 토픽이 가장 많이 GEN됐는지, 어떤 type가 인기인지, 사용자 dismiss 패턴 확인. 인기 type의 variant lazy gen 정상 동작 확인.

### 정적 카탈로그 추가 작업 (선택)
이 spec 외 별도 작업으로, 기존 9종 각각에 v2 ~ v3 미리 hand-bake (gen-object.sh 직접 호출). 단조로움 즉시 해소. ~$5 1회 비용.

### 롤백
- `tryGenerateDynamicType` 가드 해제만 다시 켜면 동적 생성 stop. 기존 placement는 그대로 유지.
- variant lazy gen 만 끄려면 background trigger 한 줄 비활성화.
- 마이그레이션은 rollback 어려움 (테이블 추가 + 컬럼 추가). 별도 down migration 필요 시 따로 작성.

---

## 8. 테스트 전략

### 단위
- `composeObjectDescription`: 다양한 토픽에 영어 single-noun 결과 검증
- `chromaKey`: 알려진 입력 PNG → transparent 출력
- `desc_key`: 같은 description → 같은 키, 다른 description → 다른 키
- `pickByTopicOverlap`: variant 분기 이전과 동일하게 type 선택

### 통합
- 마이그레이션 적용 → bootstrap → 기존 9종이 `object_types` + `object_variants` 1개씩 있는지
- 기존 plaza_objects 행이 `variant_id` 로 backfill 됐는지
- `/api/world/objects` 응답에 spriteUrl/nativeHeightPct 포함되는지
- `tryGenerateDynamicType` mock: OpenAI 모킹 → catalog 룩업 캐시 hit/miss 흐름

### 회귀
- OpenAI 가드가 켜진 상태: implicit 토픽 있어도 plaza-grow는 정적 alternate로만 동작 (기존과 동일)
- mute 후 같은 type 안 등장하는지

---

## 9. 미래 확장 (스코프 외)

- **자동 품질 체크**: 생성 후 Claude vision으로 "이게 isometric urban object 같나?" 검증, 실패 시 재생성
- **운영자 admin**: 토픽별 GEN 통계 / 인기 type 분포 / mute 패턴 분석
- **부서진 sprite 자동 재생성**: 사용자 dismiss 비율 ≥ 임계 → 자동 v2 생성으로 교체
- **Cross-world variant rotation**: 같은 광장에 같은 type 인스턴스 2+ 일 때 다른 variant 강제
- **사용자 명시 요청**: RoomInfoSheet에 "광장에 추가하고 싶은 결" 입력 → 즉시 GEN
- **Animated variants**: 가벼운 idle 애니메이션 sprite sheet
- **계절·시간대 별 sprite 변종**: 겨울 가로등, 밤 깜빡이는 lamp
- **Static catalog v2/v3 자동화**: 정적 종류도 lazy variant gen에 흡수 (현재는 hand-bake 옵션)
