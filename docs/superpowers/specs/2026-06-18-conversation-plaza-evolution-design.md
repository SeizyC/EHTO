# 대화 → 광장 진화 — Design Spec

**Date**: 2026-06-18
**Status**: Draft → 사용자 리뷰 대기
**Tagline**: "내 대화가 이 세계를 빚는다 (그리고 그게 보인다)"

---

## 1. 배경과 문제

`implicit-preference`(2026-05-31)로 사용자 신호(chat/mention)는 수집되어 affinity drift·뉴스·강아지 variant 등에 **미세하게** 반영된다. 그러나 felt-payoff("내가 이 세계를 빚었다")가 사는 세 곳이 모두 약하다:

1. **광장 정체성 자동 형성 없음** — implicit topics가 흘러들 "광장의 공기" 저수지가 없다. `worlds.bias`는 수동 K-pop artist만, mood는 시간대 bucket과 분리.
2. **눈에 보이는 구성이 안 따라옴** — 오브제는 `days+messages` 마일스톤으로만 해금(강아지 variant만 관심사 미세 반영), 멤버 refill은 순수 load-balance 랜덤.
3. **변화가 안 보임** — affinity 변화는 사이드바에만, 분위기는 점수 표시 없음.

추가로 조사 중 발견된 두 가지 **기반 결함**:

4. **캐릭터가 오브제에 매장됨** — `position-drift`가 오브제 footprint를 모른 채 멤버를 흩뿌려, 키 큰 오브제(분수 등) 뒤에 멤버가 박혀 말풍선만 보인다. 오브제가 늘어나는 본 설계에서 필연적으로 악화.
5. **멤버가 사용자 말의 내용에 반응 못 함** — niche 레퍼런스("불교재즈")에 전원이 "그게 뭐야?"로 회피. 페르소나 프레임이 "지식 발현 = 자기소개/명함"으로 취급해 알맹이 응답을 억누른다.

### 설계 철학 (사용자 확정)

**메커니즘은 미세하게 유지, felt-payoff는 "변화의 극적임"이 아니라 "변화의 인지"에서 찾는다.** 드리프트 속도·폭은 보수적으로 두되, 누적된 미세 변화를 단일 허브(`worlds.identity`)로 모으고 별도 채널로 보이게 한다. "개입하는 신"이 아니라 "관찰하는 정원사" 톤을 깨지 않는다.

---

## 2. 아키텍처 — 정체성 허브 모델

```
  사용자/AI 대화
     │  extractTopic + 극성(±)                      ← [A] 극성 도입
     ▼
  user_signals (topic, ±weight)
     │  aggregateImplicit (7일 반감기)
     ▼
  worlds.identity  ─────────────────────────────── [B] 광장 누적 정체성 (느린 EMA, 허브)
     ├──▶ 오브제   : 주제 누적치가 임계 넘으면 그 주제 오브제 해금   [C]
     ├──▶ 멤버 영입 : refill 시 정체성에 맞는 character 우선         [D]
     ├──▶ 발화/분위기: identity가 시스템 프롬프트 hint로 반영
     └──▶ 체감     : 회고·ambient·타임라인이 identity 변화를 읽어 보여줌  [F]

  [E] 오브제-인식 배치 — position-drift가 오브제 footprint를 피함 (버그 + 진화 대비)
  [G] 응답 품질 — affinity가 맞는 멤버는 "아는 티 내며" 알맹이로 받음
```

핵심: **정체성은 implicit topics보다 한 단계 더 느리게 움직인다.** implicit(7일 반감기)이 비교적 빨리 흔들리는 위에서, identity는 EMA로 한 번 더 완만하게 누적돼 — 하루이틀 화제로는 안 기울고 **2주쯤 누적돼야 광장의 "공기"가 바뀐다.**

---

## 3. 구성요소

### A. 극성(sentiment) 신호 도입

**목적**: "게임 좋아"와 "게임 별로"가 둘 다 +1.0으로 정체성을 키우는 결함 제거.

- `extractTopic`(member-relations.ts) 확장: **같은 LLM 호출**에서 `{ topic, sentiment }` 추출. sentiment ∈ { +1 호, 0 중립, −1 불호 }. (호출 수 증가 없음)
- `user_signals`에 부호 있는 weight 저장:
  - chat 호 → **+1.0**, chat 중립 → **+1.0**(기존 유지), chat 불호 → **−0.5**(약하게 밀어냄)
  - mention → 기존 +0.8 유지
  - 스키마: 기존 `weight real`에 음수 허용(부호로 극성 표현). 별도 `sentiment` 컬럼은 두지 않는다(부호 있는 weight로 충분, YAGNI).
- `aggregateImplicit`: 부호 합산. 싫다고 말한 주제는 정체성·implicit 기여를 **0쪽으로 약하게** 끌어내림. anti-identity(음수 정체성)는 만들지 않는다 — 바닥은 0.

**튜닝값**: 불호 weight −0.5 (조정 가능)

### B. 허브 — `worlds.identity` (느린 EMA)

- 새 컬럼 `worlds.identity jsonb`: `{ topics: { [topic: string]: number /* 0..1 */ }, updated_at: string }`
- 하루 1회 틱(기존 daily cron gate 재사용): 정규화된 implicit topic weight를 EMA로 혼합
  - `identity[t] = α · identity[t] + (1−α) · normalized_implicit[t]`, **α ≈ 0.85**
  - 신규 주제는 천천히 진입, 안 나오는 주제는 서서히 감쇠(곱셈 감쇠로 0 수렴)
  - 상위 N개만 유지(예: 8개), 그 이하는 가지치기
- `world_identity_log` 신규 테이블: 일 1회 `{ world_id, date, top_topics jsonb }` append → **타임라인·회고의 재료**
- 발화 hint: 기존 `implicitHint`/`biasHint`와 별도로 identity 상위 주제를 시스템 프롬프트에 약하게 주입(분위기 결).

**튜닝값**: α 0.85, 상위 유지 8개, 임계 진입/탈락 hysteresis 검토

### C. 오브제 — 관심사 임계 트리거 (정적 카탈로그)

**자산**: gpt-image-1으로 **빌드 타임 일괄 제작**(런타임 OpenAI 의존 0). 기존 스프라이트와 스타일 일치 검증됨. 크레딧 충전 후 진행.

- 카탈로그(`object_types`)에 **구체 주제 오브제** 8~12종 추가. `topics` 태그를 실제 대화 주제와 매칭되게.
  - 후보 목록(리뷰 대상): 게임→아케이드기, 책→책장, 음악→스피커/턴테이블, 운동→농구 골대, 요리→포장마차/그릴, 식물→큰 화단, 영화→야외 스크린, 커피→커피 카트, 그림→이젤, 반려(기존 강아지 보강), 게임기, 캠핑→텐트
- 신규 트리거(`tickPlazaGrowth` 형제 로직 또는 동일 틱 내 분기):
  - 조건: `identity[topic] ≥ 임계(≈0.6)` **지속**(연속 N일 또는 hysteresis) + 해당 주제 오브제 미설치 + **광장 오브제 캡** 미만 + mute 안 됨
  - 충족 시 해당 주제 오브제를 **E의 오브제-인식 빈자리 탐색**으로 배치 + system 메시지 알림 + `world_identity_log`/타임라인 이벤트 기록
- **기존 day+message 마일스톤(건축물: 분수·가로등·나무)과 공존** — 관심사 오브제는 가산. 캡으로 과밀 방지.
- 기존 mute 목록(`user_object_mutes`) 존중.

**튜닝값**: 임계 0.6, 지속 조건, 광장 오브제 캡(예: 관심사 오브제 최대 6종)

### D. 멤버 영입 — 정체성 가중 refill (인원 유지)

- `tickRotation`의 refill에서 `pickAvailable`의 순수 load-balance 대신, 후보 `ai_character`를 **`base_persona.affinity` ∩ `worlds.identity` 상위 주제 겹침**으로 가중.
- **약한 nudge**: 겹침 점수 + 기존 load-balance를 혼합, 랜덤성 일부 유지(특정 캐릭터 고착 방지). `plaza-grow`의 `pickByTopicOverlap`과 동형의 soft-weight + fallback bonus 패턴 재사용.
- **인원수는 그대로** — "누가 오는가"만 정체성을 따른다. ("게임 결 광장에 새로 온 친구가 게임을 좋아하네")

**튜닝값**: overlap 가중 vs load-balance 혼합비, fallback bonus

### E. 오브제-인식 배치 (버그 수정 + 진화 대비)

**근본 원인**: `position-drift.tickMemberPositions`의 충돌 회피가 소유자+멤버만 고려, `plaza_objects` 미조회. 깊이 정렬(`PlazaCanvas` `items.sort(a.y-b.y)`)은 정상 — **배치가 문제.**

- `tickMemberPositions`가 `plaza_objects` + 카탈로그 높이를 조회 → 장애물 `{ x, y, radius }` 집합 구성
  - **radius는 `nativeHeightPct`에 비례**(분수·나무·가로등 = 실제 keep-out / 강아지·화분 ≈ 0, 이들은 "옆에 서기" occupy 슬롯과 공존해야 하므로)
- `pickClearSpot`·drift 후보 선정이 멤버뿐 아니라 장애물도 회피(기존 `dist()`+`MIN_GAP` 패턴 확장)
- 신규 오브제 배치(C)도 캐릭터를 피해 떨어지는 동일 clear-spot 탐색 사용
- **깊이 정렬(렌더)은 불변.** occupy "옆에 서기" 슬롯(dy>0, 앞쪽)도 불변.
- 소유자 아바타가 오브제 뒤에 서는 케이스는 사용자 클릭이므로 본 수정 범위 밖(필요 시 후속).

### F. 체감 채널 (메커니즘 뒤에 부착)

3종 모두 채택. identity·`world_identity_log`·오브제 설치·멤버 입퇴장을 재료로 사용.

- **주간 회고 카드**: 주 1회, identity 1주 diff → "이번 주 광장은 ~로 기울었어. 아케이드기가 생겼고, △△가 왔어." 모달/푸시.
- **멤버 ambient 언급**: identity hint를 프롬프트에 주입, 가끔 변화를 자연스럽게 입에 올림("요즘 우리 광장 게임 얘기로 가득하네", "새로 생긴 벤치 좋다"). 억지 비유 금지 규칙은 유지.
- **변화 타임라인/일지**: `world_identity_log` + 오브제 설치 + 멤버 입·퇴장을 시간순 로그 뷰로. "이 세계의 역사"를 스크롤로 되짚음.

### G. 멤버 응답 품질 — 알맹이 있는 참여 (프롬프트 + affinity 연동)

**근본 원인**: 페르소나 프레임(prompt-i18n.ts, member-reply.ts)이 "persona=향수, 증명 금지"로 튜닝돼 **지식 발현을 명함/자기소개로 오인**해 억누름. reply-user 지침이 "모르면 잘 모르겠는데"를 허용하고 되묻기를 합법 형태로 둠. 지식 가진 아키타입 0명.

- **스키마 변경 없음.** 프롬프트 수준 수정:
  - 시스템/reply-user 프레임에 추가: **"당신이 그 주제를 알 법한 사람이면, 아는 티 내며 진짜 알맹이로 받아라(그게 뭔지·비슷한 것·의견). 모른다고 되묻는 건 정말 생소할 때만."**
  - "아는 사람"의 판단 = 멤버 `persona.affinity` ∩ 사용자 메시지 토픽(또는 identity) 매칭. 매칭되면 substantive 응답을 강하게 유도.
  - "향수" 원칙과의 구분 명시: **지식 발현 ≠ 자기소개.** 음악 잘 아는 멤버가 장르를 풀어주는 건 명함이 아니라 그냥 지식 — 프레임이 이 둘을 혼동했음을 교정.
  - 회피("그게 뭐야?")는 affinity 비매칭 멤버에게로 좁힘. 매칭 멤버는 회피 금지.
- 발화 확률은 이미 affinity/mention 매칭 멤버를 띄워주므로(ambient-loop), **자연스럽게 "아는 사람이 먼저 알맹이로 답하는" 구조**가 됨.

---

## 4. 구현 단계 (로드맵)

사용자 확정 순서: **체감·품질 먼저 → 기반 → 파생 → 가시화**. 각 단계가 독립적으로 가치를 가진다.

- **Phase 1 — E + G** (즉시 체감되는 결함 수정)
  - E: 오브제-인식 배치 (캐릭터 매장 버그)
  - G: 멤버 응답 품질 (프롬프트 + affinity 연동)
  - *의존성 없음. 스키마 변경 거의 없음. 가장 빠른 체감.*
- **Phase 2 — A + B** (정체성 허브 기반)
  - A: 극성 신호
  - B: `worlds.identity` EMA + `world_identity_log`
- **Phase 3 — C + D** (구성 변화 파생)
  - C: 관심사 임계 트리거 오브제 (+ gpt-image-1 자산 배치)
  - D: 정체성 가중 멤버 refill
- **Phase 4 — F** (가시화)
  - 주간 회고 카드 · 멤버 ambient 언급 · 변화 타임라인

---

## 5. 데이터 모델 변경 요약

| 대상 | 변경 | Phase |
|------|------|-------|
| `user_signals.weight` | 음수 허용 (불호, 부호로 극성 표현) | 2 |
| `worlds.identity` | 신규 jsonb 컬럼 | 2 |
| `world_identity_log` | 신규 테이블 (date, top_topics) | 2 |
| `object_types` | 주제 오브제 8~12종 + topics 태그 (데이터 추가) | 3 |
| 스키마 변경 없음 | E(position-drift 로직), G(프롬프트), D(refill 로직) | 1, 3 |

---

## 6. 미포함 / 후속

- **런타임 동적 오브제 생성**(`dynamic-object-gen` stub) 부활 — 본 설계는 빌드 타임 정적 자산. OpenAI 크레딧 복구 시 별개로 부활 가능(현 stub 구조 유지).
- **아키타입 축**(persona에 지식/참여 성향 필드) — G는 프롬프트 수준으로 시작. 다양성 부족하면 후속.
- **정체성 임계 시 신규 멤버 영입**(인원 증가) — D는 인원 유지만. 후속 검토.
- **정체성 미터 상시 시각화** — F의 체감 채널에서 제외(회고·ambient·타임라인만).
- **소유자 아바타 오브제 회피** — E 범위 밖.

---

## 7. 튜닝 파라미터 (구현 중 조정)

| 파라미터 | 초기값 |
|----------|--------|
| 불호 weight | −0.5 |
| identity EMA α | 0.85 |
| identity 상위 유지 | 8개 |
| 오브제 해금 임계 | 0.6 (지속) |
| 광장 관심사 오브제 캡 | 6종 |
| 오브제 keep-out radius | f(nativeHeightPct) |
| 멤버 refill overlap 가중비 | overlap 0.7 : load-balance 0.3 (fallback bonus +0.3) |
