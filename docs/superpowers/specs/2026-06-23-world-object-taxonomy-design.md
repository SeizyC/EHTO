# World Object Taxonomy & Layered Plaza — Design Spec

**Date**: 2026-06-23
**Status**: Draft → ready for spec review
**Tagline**: "내 결이 자라 작은 동네(세계)가 된다 — 살아있는 하늘까지"
**Extends**: [2026-05-31-dynamic-object-generation-design.md](./2026-05-31-dynamic-object-generation-design.md) (생성 파이프라인 / 카탈로그 DB / dismissal) and [2026-05-31-implicit-preference-design.md](./2026-05-31-implicit-preference-design.md) (토픽 신호).

이 스펙은 "광장에 무엇이 등장할 수 있는가(구조물 종류 = schema)"를 정의하고, 기존 단일-평면 광장을 **깊이 레이어를 가진 작은 동네**로 확장한다. 생성 메커니즘 자체는 기존 dynamic-object-gen 스펙을 재사용·확장한다.

---

## 1. 결정 요약 (브레인스토밍 확정)

- **범위**: 소품 + 랜드마크 + **건물** + **하늘/공중** + 포털. 광장 캔버스를 더 넓게.
- **건물 처리**: (A) 뒤편 스카이라인을 배경층으로 항상 깔고 + (B) **특별 건물**(토픽으로 자라는 큰 오브제)을 뒤줄 슬롯에 얹는 절충.
- **티어 결정 규칙(D, 하이브리드)**: milestone(시간+메시지 게이트)이 "이번 슬롯의 티어·위치·크기"를 열고, **토픽 강도 + 의미**가 그 슬롯을 "무엇으로" 채울지 결정. 특별 건물은 *매우 강한 토픽*이 *뒤줄 큰 슬롯*을 만났을 때만.
- **생성**: 어드민 큐레이션 카탈로그 우선(토픽 매칭) → 없으면 런타임 생성 폴백 → 승인 오브제의 description이 **티어별 few-shot 가이드**가 되어 새 생성이 같은 톤으로 수렴.
- **하늘/공중(C)**: 대기(구름·별·달/해)는 시간대 자동·공통 앰비언트(카탈로그 아님). 공중 드리프터(기구·비행기·새)는 평소 랜덤이되 강한 토픽이 있으면 그쪽으로 가중. 드문 이벤트(별똥별·불꽃)는 milestone 보상.
- **포털(A 모델)**: 고정 자리, 평소 닫힘. 도착/퇴장=쿨톤(클릭 불가), 이동가능=액센트톤(클릭→**기존 visit 로직 재사용**). 카탈로그와 분리된 특수 요소.
- **캔버스 렌더 기본값**: (가) 스케일 핏(전체를 한 화면에 축소). (나) 가로 팬은 Phase 2.
- **미포함(이번 스코프 제외)**: 날씨/FX(지역 날씨 연동 부담), 바닥/지형 레이어, 포털 B(이동 조작 주체), 캔버스 팬.

---

## 2. Taxonomy — 카탈로그 카테고리(= schema)

`object_types`에 `category`를 추가해 토픽-생성 카탈로그 오브제를 분류한다. 카테고리가 **크기대(native_height_pct 범위) · 깊이밴드 · 생성 프롬프트 가이드**를 함께 결정한다.

| category | 깊이밴드 | 크기대(나tive_height_pct) | 예시 | 토픽 생성 |
|---|---|---|---|---|
| `prop` | front | 8–22% | 벤치·램프·화분·소형 소품 | ✅ |
| `landmark` | mid | 24–40% | 분수·가제보·네온 간판·푸드카트·조형물 | ✅ |
| `building` | back | 45–80% | PC방·서점·카페(특별 토픽) | ✅ (특별) |
| `sky` | sky | (별도 스케일) | 기구·비행기·새·블림프 | ✅ (드리프터) |
| `pet` | front(로밍) | 8–14% | 강아지 등 | 기존 정적 |

**카탈로그가 아닌 특수/배경 요소(분리 관리):**
- **대기(atmosphere)**: 구름·별·달·해 — 시간대 렌더 레이어(배경)에서 처리. `object_types` 아님.
- **스카이라인(skyline)**: 뒤편 배경 건물 띠 — 큐레이트 배경 에셋 세트(전역, 가벼운 무드 테마). 토픽으로 자라지 않음. `object_types` 아님(배경 자산).
- **포털**: §8. `object_types` 아님.

기존 정적 9종 backfill: bench/lamp/planter → `prop`, fountain/tree → `landmark`, dog_* → `pet`.

---

## 3. 렌더 레이어 & 캔버스

**레이어 순서(뒤→앞)**:
1. 배경 그라데이션 + **대기**(시간대: 낮 구름 / 밤 별·달)
2. **스카이라인**(배경 건물 띠)
3. **공중 드리프터**(기구·비행기·새 — 가로 드리프트)
4. **building** 밴드(back floor 슬롯)
5. **landmark** 밴드(mid)
6. **prop** + **pet** + 사람(front, 로밍)
7. **포털**(고정 자리, 이벤트 시 오버레이)

**캔버스**: 좌표는 지금처럼 0–100% x/y. 화면을 넓혀(가로 종횡비↑) 더 많은 슬롯을 수용하되 **스케일 핏**으로 전체를 한 화면에 표시(기본값). 깊이밴드는 y% 구간으로 정의:
- sky: y 0–34, skyline: 30–46, back(building): 30–55, mid(landmark): 50–66, front(prop/pet/people): 66–94.
(정확한 구간은 구현 시 튜닝. perspectiveScale(y)는 기존 로직 유지.)

---

## 4. 성장·선택 규칙 (D 하이브리드)

기존 `plaza-grow`의 milestone 골격을 유지하되, milestone에 **band/tier**를 부여한다.

```ts
type Milestone = {
  stage; daysMin; messagesMin;
  band: "back" | "mid" | "front";          // 깊이밴드(렌더 + 후보 필터)
  tier: "prop" | "landmark" | "building";  // 이 슬롯이 받는 카테고리
  place: { x; y; scale? };                  // 위치(밴드 안)
  // 'building' tier 슬롯은 special-gate 통과 시에만 채워짐(아래)
};
```

**슬롯을 무엇으로 채우나** (slot tier 고정 후):
1. **큐레이션 카탈로그 매칭**: `catalogAll` 중 `category===tier`, 크기대 적합, **토픽 overlap > 0**(implicit weight), muted 아님 → 최고 점수 선택.
2. 매칭 없음 + 신호 있음 + 일일 quota 잔여 → **런타임 생성**(tier 가이드 적용, §6).
3. 둘 다 실패 → 정적 기본(tier에 맞는 기본 오브제)로 폴백.

**특별 건물(building tier) 게이트**: building 슬롯은 비싸고 큰 만큼, 채우려면
- 사용자 implicit 최상위 토픽의 **강도/지속성이 임계 이상**(예: weight ≥ T_building, 다회 등장),
- 그리고 의미상 "장소"성에 부합(가게/공간 계열) — composeObject가 building 프롬프트로 장소형 사물을 만들도록 유도.
임계 미달이면 building 슬롯은 **이번 tick에 비워두고**(스카이라인이 뒤를 채우므로 빈 느낌 없음) 다음 기회로 미룬다.

선택 점수는 기존 `pickByTopicOverlap`을 카탈로그(카테고리·크기 필터 포함)로 일반화한다.

---

## 5. 하늘/공중 (C)

- **대기**: 시간대(이미 있는 morning/afternoon/evening/night)로 구름(낮)·별·달(밤)을 배경 레이어에서 렌더. 공통, 카탈로그 아님.
- **드리프터(`category:'sky'`)**: 화면을 가로질러 천천히 흐르는 기구·비행기·새 등. 평소 풀에서 랜덤, **강한 토픽 있으면 가중**(여행→비행기, 몽상→기구, 자유→새떼). 동시 1–2개, 저빈도.
- **드문 이벤트**: 별똥별·불꽃 등 — milestone 도달/특별 순간의 짧은 보상 연출.
- 드리프터도 큐레이션→런타임 생성 동일 파이프라인(가이드: "transparent, side view, small aerial object" 톤).

---

## 6. 생성 & 가이드 (하이브리드 + 티어별 few-shot)

기존 dynamic-object-gen 재사용(이미 구현됨: composeObject / generateObjectSpriteBytes / uploadObjectSprite / insertObjectType / tryGenerateDynamicType / tryGenerateVariant).

**확장점**:
- `composeObject`·`buildObjectPrompt`에 **category 인자** 추가 → 티어별 톤/구도/크기 지시(prop=소형 소품, landmark=중대형 설치물, building=장소형 건물 정면, sky=측면 비행물).
- **가이드(few-shot)**: 카탈로그에서 같은 category(+가능하면 인접 토픽)의 **`is_exemplar=true` 오브제 description 몇 개**를 뽑아 생성 프롬프트에 예시로 주입 → 톤 수렴, 이상치↓.
- description을 **저장**(`gen_description`)해야 가이드가 가능(현재는 해시만 저장). 어드민 생성·런타임 생성 모두 저장.
- **어드민 저작**: 어드민 오브제 페이지에서 (1) 토픽/설명 입력→미리보기 생성(커밋 전 b64 반환), (2) 재생성, (3) category·label·topics·height·예시여부 편집 후 저장, (4) 직접 스프라이트 업로드. 검수 후에만 노출.

---

## 7. 포털 (A 모델 + 색 어포던스)

- 광장의 **고정 지정 자리 1곳**. 평소 닫힘(없음).
- 열리는 계기: 멤버 등·퇴장 이벤트 + 가끔 앰비언트(이동 기회 확보).
- **색으로 역할 구분**:
  - 도착/퇴장(남이 옴·감) = **쿨톤**(블루/시안), 클릭 불가, 통과 연출만.
  - 내가 갈 수 있음 = **액센트톤**(주황/퍼플), 클릭 → **기존 visit 로직 호출** + 빨려들어가는 전환 연출.
- presence/라우팅은 기존 그대로. 포털은 그 위의 비주얼·연출 계층(읽기 전용 + 열린 포털 클릭 핸들러 1개).
- `object_types` 아님. 별도 고정 요소 + 이벤트 구독 렌더.

---

## 8. 데이터 스키마 변경

```sql
-- object_types 확장
alter table public.object_types
  add column if not exists category text not null default 'prop'
    check (category in ('prop','landmark','building','sky','pet')),
  add column if not exists gen_description text,   -- 가이드 코퍼스용 영어 description 원문
  add column if not exists is_exemplar boolean not null default false; -- 가이드에 쓸 승인 표시

create index if not exists object_types_category_idx on public.object_types(category);

-- 기존 9종 backfill (bootstrap 스크립트 또는 마이그레이션 data step)
--   bench/lamp/planter → prop, fountain/tree → landmark, dog_* → pet
```

- milestone 밴드/티어는 코드 상수(`plaza-grow`)로 표현(스키마 변경 불필요).
- 스카이라인/대기/포털 자산은 별도(공개 스토리지 + 코드 설정), `object_types` 미사용.
- `plaza_objects`는 기존 `variant_id` 그대로(밴드/티어는 variant→type→category로 도출).

---

## 9. 비용·안전 가드

기존 3중 가드 유지 + 티어 가드 추가:
| 가드 | 메커니즘 |
|---|---|
| 광장당 일 1회 동적생성 | `worlds.last_dynamic_gen_at` 24h |
| 전역 (topic, desc_key) 1회 | `object_types.unique(origin_topic, origin_desc_key)` |
| Variant CAP 5 | usage/variants 임계 |
| **building 게이트** | 강한 토픽 임계 + 의미 부합일 때만(가장 비싼 티어 폭주 방지) |
| 킬스위치 | `DYNAMIC_OBJECTS_DISABLED=1` |
| 어드민 큐레이션 우선 | 런타임 생성 빈도·비용을 구조적으로 낮춤 |

콘텐츠 안전: 티어별 프롬프트에 "contemporary urban, not fantasy/violent" 강제 + gpt-image-1 정책 + 사용자 dismissal(mute).

---

## 10. 컴포넌트·인터페이스

| 단위 | 책임 |
|---|---|
| `lib/object-catalog.ts` | category 포함 카탈로그 조회(이미 있음, 필드 추가) |
| `lib/dynamic-object-gen.ts` | composeObject(+category)·생성·가이드 주입·insert(이미 대부분 구현) |
| `lib/plaza-grow.ts` | milestone band/tier, 카탈로그 토픽선택 일반화, building 게이트 |
| `lib/sky-layer.ts` (신규) | 대기(시간대) + 드리프터 스폰/가중 + 이벤트 |
| `lib/portal.ts` (신규) | 포털 상태·색·이벤트 구독·클릭→visit |
| `app/api/admin/objects/generate` (신규) | 미리보기 생성(b64, 비커밋) |
| `app/api/admin/objects` (POST 추가) | 큐레이션 저장(category·gen_description·is_exemplar) |
| `app/(app)/admin/objects/page.tsx` (수정) | "오브제 추가" 모달(생성/재생성/편집/업로드/예시지정) |
| `components/PlazaCanvas`(또는 월드 렌더) | 레이어 순서: 대기→스카이라인→드리프터→building→landmark→prop/pet/people→포털 |
| 마이그레이션 | object_types category/gen_description/is_exemplar + backfill |

---

## 11. 마이그레이션 · 롤아웃 (단계)

1. **스키마**: object_types에 category/gen_description/is_exemplar 추가 + 9종 backfill.
2. **생성 코어 활성**: 기존 dynamic-object-gen 배포(이미 검증). description 저장 추가.
3. **어드민 저작**: 생성/저장 API + 모달. 큐레이션으로 초기 카탈로그를 손으로 채움(가이드 씨앗).
4. **plaza-grow 티어/밴드 + 카탈로그 선택** 활성. building 게이트.
5. **렌더 확장**: 캔버스 넓힘 + 레이어(스카이라인·대기·드리프터·포털).
6. **하늘 드리프터/이벤트**, **포털 연출**.
7. 1–2주 모니터링: 티어별 생성 분포·인기·dismiss·비용.

(각 단계는 독립 배포 가능. 위험 순: 5·6 렌더 변경이 가장 큼 → 별도 검증.)

---

## 12. 테스트 전략

- 단위: category별 composeObject 결과 형식, desc_key, building 게이트 임계 로직, 드리프터 토픽 가중, 포털 색 결정.
- 통합: 마이그레이션+backfill 후 9종 category 정확, 어드민 생성→저장→카탈로그 노출, plaza-grow가 토픽으로 큐레이션 우선 선택, building 게이트 미달 시 슬롯 스킵.
- 회귀: 킬스위치 시 정적만, mute 후 미등장, 기존 광장 placement 유지, 캔버스 렌더 변경 후 LCP/레이아웃 점검.

---

## 13. 미래 확장 (스코프 외)

- 날씨/FX(무드·시간대 기반 가벼운 버전), 바닥/지형 레이어.
- 포털 B(이동 조작 주체), 캔버스 가로 팬.
- 생성 자동 품질 체크(Claude vision), 운영자 통계 admin, 계절·시간대별 변종, 애니메이션 variant.
- 스카이라인의 토픽 약테마(전체 톤 반영).
