# 지역 인지형 캐릭터 정체성 (Locale-aware Identity)

날짜: 2026-07-02
상태: 설계 승인 대기

## 문제

현재 광장 대화가 어색한 근본 원인은 **페르소나가 너무 얇음**:

- `MEMBER_TEMPLATES`의 캐릭은 `affinity`(태그 몇 개) + `speech_style`(한 줄) + `backstory_seed`(한 줄)뿐.
- 나이·사는곳·직업 같은 **구체 사실이 없어서**:
  - "어디서 왔어?" → "방금 낮잠에서" (출신 사실이 없어 등장상태로 얼버무림)
  - "직업이 뭐야?" → "프리랜서 편집자" → 2초 뒤 "백수" (직업이 안 박혀 매 턴 즉흥, 자기모순)
  - 캐릭이 다 비슷 (결이 겹침)
- **`region`(생활권) 개념이 코드에 0.** `worlds.language`(ko/en/ja)만 있고, 비-ko 광장은 한국 생활 페르소나를 그 언어로 *번역만* 함. 미국 영어 유저도 "편의점/배민/야근" 친구를 받음.
- **시간이 KST 하드코딩** (`time-of-day.ts` = Asia/Seoul). 미국 유저도 한국 시각 기준 "새벽/낮" 판정.

## 핵심 원칙: language ⊥ region

- **language** = 대화 언어 (ko/en/ja) — 이미 있음.
- **region** = 친구들이 사는 문화권 (KR/US/JP/GLOBAL) — 신규.
- 둘은 독립. "미국 접속 + 한국어" = 한국어로 말하지만 미국 생활권 친구들 ("오늘 Target 갔다가 줄 보고 나왔어").

## 데이터 모델

### 스키마 변경 (마이그레이션 1개)
```sql
-- worlds
alter table worlds add column region   text not null default 'KR'
  check (region in ('KR','US','JP','GLOBAL'));
alter table worlds add column timezone text not null default 'Asia/Seoul';

-- ai_characters (전역 원본 페르소나)
alter table ai_characters add column region text not null default 'KR'
  check (region in ('KR','US','JP','GLOBAL'));
-- profile은 스키마 변경 없이 base_persona jsonb 안에 넣음 (아래).
```

### profile (base_persona.profile 안, members.persona로 상속)
```ts
type MemberProfile = {
  age: number;            // 27
  home: string;           // "서울 성수동" (region 생활권)
  job: string;            // "소규모 출판사 편집자"
  routine: string;        // "밤에 작업, 새벽까지 깨어있음"
  hangout: string;        // 단골 장소 "성수 골목 카페"
  hook: string;           // 근황/관심사 "요즘 필사에 빠짐" — 유저중심 대화 훅 재료
  ties?: { name: string; relation: string }[]; // 다른 멤버와의 관계 (큐레이션, 선택)
};
```
`MemberTemplate`에 `region` + `profile` 필드 추가. `ensureAiPool()`이 `base_persona.profile`·`ai_characters.region`으로 upsert.

## 캐릭터 풀 (region별)

- **KR (기존 15명 리치화)**: 서울/수도권 생활권, 편의점·배민·지하철·야근·카페 — 각자 나이/사는곳/직업/루틴/단골/훅/관계 부여.
- **US (신규, 최소 5~6명)**: 도시·교외, bodega·Target·Trader Joe's·commute·rent·diner·food truck.
- **JP (신규, 최소 5~6명)**: 도쿄/오사카, コンビニ·駅前·居酒屋·終電·会社帰り.
- **GLOBAL (신규, 3~4명)**: 이주자/외국인/디지털노마드 — 어느 region에도 15~25% 섞임.

## 시딩 (world-seed.ts / rotation.ts)

- 광장 생성 시 **브라우저 timezone → region 추정** (Asia/Seoul→KR, America/*→US, Asia/Tokyo→JP, 그 외 GLOBAL). 유저 변경 가능.
- 멤버 선택: **local region 75~85% + GLOBAL 15~25%**. local 풀이 모자라면 GLOBAL로 폴백.
- `worlds.timezone` 저장 → 시간 판정에 사용.

## 프롬프트 (member-reply.ts buildSystemPrompt)

- **profile을 잠재 factLines로 주입**: "질문 받으면 이대로 답함(먼저 낭독 X)" 블록에 나이·사는곳·직업. → 동문서답·자기모순 동시 해결. 먼저 "나 27살 편집자야" 낭독 금지.
- **region 문화맥락 한 줄**: "이 친구는 {region 생활권}에 삶 — 일상 언급(장소·음식·이동)은 거기서 나옴." (KR/US/JP 예시 세트)
- routine/hangout/hook은 flavor 재료로 노출.

## 시간대 (time-of-day.ts)

- `kstHour`/`currentBucket`/`kstTimeLabel` 등에 `timezone` 파라미터 추가 (기본 Asia/Seoul 유지). world.timezone을 넘겨 그 지역 로컬 시각으로 "새벽/낮/밤" 판정.

## 백필 (일회성 스크립트)

- `ensureAiPool()` upsert가 큐레이션 캐릭의 base_persona에 profile·region 채움 (자동).
- **기존 members 인스턴스**(준/블러디앤 등): 일회성 스크립트로 자기 ai_character의 profile을 members.persona에 병합 + region 세팅. ai_character_id 없는 레거시는 이름으로 템플릿 매칭.

## 범위/비범위

- 범위: 위 전부 (풀 세트). KR 풀만 먼저 리치하게, US/JP/GLOBAL은 최소 실물로 시작(나중에 캐릭만 추가하면 확장됨).
- 비범위: region 변경 UI의 정교한 디자인(최소 동작만), 캐릭별 스프라이트 재생성.

## 리스크

- ~~마이그레이션 적용 경로 불명확~~ **해소**: `node --env-file=.env.local scripts/apply-migration.mjs <path.sql>` (Supabase Management API, 멱등 SQL, 재실행 안전). default 컬럼이라 기존 worlds는 KR/Asia/Seoul로 안전하게 채워짐.
- 퍼블릭 레포 — 시크릿 금지, 백필 스크립트에 키 하드코딩 금지 (.env.local 로드).
- profile 낭독 방지가 프롬프트로만 보장됨 → 배포 후 실제 대화로 검증 필요.

## 검증

- 마이그레이션 후 스키마 확인.
- 시딩: KR 광장 = KR 75-85% + GLOBAL; (테스트로) US region 광장 = US 풀.
- 대화: "어디서 왔어?/직업?" → 일관된 profile 답, 낭독 아님. region 광장별 생활권 어휘 확인.
