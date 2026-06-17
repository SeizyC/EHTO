# EHTO.WORLD — DESIGN.md

> Everyone Has Their Own World

## 0. 왜 만드는가

AI 채팅 서비스는 빠르게 발전했지만, 방구석의 외로움은 여전히 잘 풀리지 않는다.
이유는 단순하다 — 사람들이 원하는 것은 "말이 통하는 AI"가 아니라
**"나와 함께 시간을 축적해주는 존재감"** 이다.

기존 AI 챗은:

1. 관계가 **'대화'에서 생기지 않고 '맥락 공유'에서 생긴다**는 사실을 못 다룬다 — 같은 시간을 함께 겪는 구조가 없다.
2. 너무 친절하고 안정적이라 감정 몰입이 안 된다 — 사람은 약간의 예측 불가능성에 정을 붙인다.
3. 세션 단위로 끊긴다 — 관계 연대기(history)가 누적되지 않는다.
4. 외로운 사람이 진짜 원하는 건 **대화 상대가 아니라 소속감** — "나를 기다리는 곳"이라는 감각이다.
5. 결국 친구가 아니라 콘텐츠로 소비된다 — 심심할 때 켜고, 답 듣고, 끈다.

EHTO의 질문은 따라서:

> "AI를 얼마나 인간처럼 말하게 할까?"
> 가 아니라
> **"AI와 인간이 함께 시간을 축적하는 구조를 만들 수 있나?"**

이다.

---

## 1. Design Philosophy

EHTO.WORLD는 **메신저 앱 / MMORPG / 메타버스 / AI 챗봇이 아니다.**

핵심 목표는:

> 살아있는 디지털 사회를 관찰하고, 그 안에서 함께 머무르는 경험

이다.

서비스의 목표는 "계속 말을 걸게 만드는 것"이 아니라
**"괜히 다시 들어오게 만드는 것"** 이다.

---

## 2. Core UX Principle

사용자는 "AI에게 질문하는 느낌" 또는 "게임을 플레이하는 느낌"이 아니라,
**하나의 살아있는 세계에 접속한 느낌**을 받아야 한다.

- 중복된 표시 금지
- 불필요한 이모지 남발 금지
- UI 어디에도 "AI / 챗봇 / 봇" 단어 노출 금지 — `member`, `presence`로 표현

---

## 3. Spatial Social Room

모든 World는 하나의 작은 공간(Scene)이다.

- **Habbo 풍 아이소메트릭 픽셀 룸** — 가구, 조명, 바닥 패턴이 있는 작은 방
- 그 안에 **인간형 픽셀 미니미(아바타)** 들이 머무르고 움직인다
- 작은 ambient social room으로 동작
- 자동으로 변화하는 디지털 공간

핵심:

> Room 자체가 사회 상태를 표현해야 한다.

비교 — 우리가 닮으면 안 되는 것:

| Habbo | EHTO |
|---|---|
| 유저 중심 플레이 | 사회 분위기 중심 |
| 이동/꾸미기 게임 | 존재감/관계 흐름 |
| 경제 시스템 | World Drift |

같은 시각 언어를 빌리되, **"게임 공간"이 아니라 "살아있는 사회 공간"** 으로 작동시킨다.

---

## 4. Main Screen Structure (모바일 기준)

```
┌─────────────────────┐
│  Atmosphere Header  │   오늘의 분위기 / mood / social energy
├─────────────────────┤
│                     │
│   Isometric Room    │   픽셀 미니미 + 가구 + 말풍선 +
│                     │   ambient motion / proximity 표현
│                     │
├─────────────────────┤
│   Ambient Feed      │   사회 변화 로그 (대화 로그 X)
├─────────────────────┤
│   Composer          │   작고 unobtrusive
└─────────────────────┘
```

모바일 360 / 390px 우선.

---

## 5. Atmosphere Header

상단에 표시:

- 오늘의 분위기
- room mood
- social energy
- current culture / ritual

예:
```
Tonight Mood
Quiet Nocturnal Warmth
```

사용자는 입장 즉시 **방의 공기**를 느껴야 한다.

---

## 6. Isometric Room Scene

방 내부에서 실시간으로 표현되는 것:

- 인간형 픽셀 미니미(멤버)들의 위치와 idle motion
- 말풍선
- 관계 거리감 (proximity)
- 상태 변화 (typing / listening / sleepy / disappeared 등)
- 방 자체의 변형 (가구/조명/벽지)

---

## 7. Habbo-style Avatar System

### 7.1 형태

- 작은 인간형 픽셀 미니미 (Habbo / 싸이월드 미니미 계열)
- 32×56 그리드 기준, 3/4 turn stance
- body type / outfit / hair / accessory 모듈식 조합
- 얼굴은 사람형 — 단, 과한 캐릭터성/외모 비교를 유발하지 않는 단순한 face preset 사용

### 7.2 역할

아바타는 "꾸미기 대상"이 아니라 **"사회적 존재 상태를 시각화하는 매체"** 다.

| 상태 | 표현 |
|---|---|
| typing | 흔들림 |
| listening | 헤드폰 |
| sleepy | 느린 blinking |
| chaotic | 빠른 움직임 |
| exploring | 흐릿한 상태 |

### 7.3 Dynamic Avatar Mutation

아바타는 고정되지 않는다. 시간이 흐르며 mood / relationship / room culture / ritual의 영향을 받아 조금씩 변한다.

- 음악방 → 헤드폰 등장
- 새벽방 → sleepy idle 증가
- chaotic방 → restless motion 증가

### 7.4 디자인 원칙

- 작은 크기 / low-detail
- silhouette readability 확보
- 멤버 간 visual identity 중복 최소화
- 외모 비교 / 꾸미기 압박을 유발하지 않는 수준의 커스터마이즈

---

## 8. Social State Visualization

사회 상태는 **텍스트가 아니라 공간 자체**로 느껴져야 한다.

### 8.1 Character Positioning (관계 → 위치)

| 상태 | 표현 |
|---|---|
| 친함 | 가까이 위치 |
| awkward | 멀리 위치 |
| outsider | 혼자 위치 |
| active duo | 반복 proximity |

### 8.2 Movement Density (사회 에너지 → 움직임)

| 상태 | 움직임 |
|---|---|
| sleepy | 거의 안 움직임 |
| cozy | 느린 이동 |
| chaotic | 빠른 이동 |
| awkward | 거리 유지 |

### 8.3 Bubble Density (분위기 → 말풍선)

| 상태 | 특징 |
|---|---|
| hype | 연속 bubble |
| emotional | 긴 문장 |
| meme mode | 짧은 연타 |
| tension | 긴 silence |

### 8.4 Ambient Room Mood (mood → 방 자체)

| mood | 시각 효과 |
|---|---|
| cozy | warm lighting |
| rainy | blue tone |
| chaotic | clutter 증가 |
| lonely | 빈 공간 강조 |

---

## 9. Room Mutation System

Room은 사용자 행동 / 링크 문화 / social energy / ritual / relationship drift 에 따라 **자동으로** 변화한다.

> 사용자가 직접 꾸미는 것이 아니라, 세계가 스스로 변화한다.

예:

- **음악 중심 세계** → 스피커, LP 포스터, playlist wall, 음악 조명 자동 생성
- **chaotic 밈 세계** → 어지러운 포스터, weird object, clutter, 빠른 ambient motion
- **cozy 세계** → 따뜻한 조명, 비오는 창문, 식물

---

## 10. Ambient Feed

방 아래에 흐르는 **사회 변화 로그**.

```
Mina shared a playlist
Joon reacted 😂
Sora stayed unusually late tonight
```

핵심:

- 채팅 로그 ❌
- 사회 변화 로그 ⭕

---

## 11. Composer

입력창은:

- 작고 unobtrusive
- 화면의 주인공이 아님
- 자연스럽게 끼어드는 느낌

사용자는 "AI에게 질문하는" 것이 아니라, 살아있는 세계에 끼어든다.

---

## 12. Presence Philosophy

> 말하지 않아도 존재감이 느껴져야 한다.

- 계속 방에 머무름
- 특정 멤버와 자주 proximity 발생
- 특정 시간대 반복 출현
- 긴 silence 유지

이런 것들이 위치 / 움직임 / 상태 / bubble pacing 으로 표현된다.

---

## 13. World Identity Drift

각 세계는 시간이 지날수록 분위기 / 말투 / 관계 구조 / 링크 문화 / 밈 / 활동 시간 / 감정 기후가 누적적으로 변한다. 이를 **World Identity Drift** 라 부른다.

예시:

- **새벽 음악 유저** → "새벽 감성방" 으로 정체성 이동
- **밈 중독 유저** → "인터넷 폐인방" 으로 변화
- **관찰자형 유저** → "조용히 머무르는 사회" 형태로 발전

---

## 14. Final UX Goal

사용자가 느껴야 하는 것은:

> "AI가 답변한다"

가 아니라:

> **"오늘도 저 세계가 살아있다"**

이다.
