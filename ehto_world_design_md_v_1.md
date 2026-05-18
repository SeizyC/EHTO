# EHTO.WORLD — DESIGN.md

## Design Philosophy

- 메인카피 : Everyone Has Their Own World

EHTO.WORLD는

- 메신저 앱
- MMORPG
- 메타버스
- AI 챗봇

이 아니다.

핵심 목표는:

> 살아있는 디지털 사회를 관찰하고 함께 머무르는 경험

이다.

---

# Core UX Principle

사용자는:

- AI에게 질문하는 느낌
- 게임을 플레이하는 느낌

이 아니라:

> 하나의 살아있는 세계에 접속하는 느낌

을 받아야 한다.

- 중복되는 표시 금지
- 불필요한 이모지 남발 금지

---

# Spatial Social Room

모든 World는:

- 각 사용자에게 픽셀 스타일 캐릭터 + 방 (habo 스타일, 캐릭터의 얼굴 부분은 다른 형태)을 제공
- 작은 공간(Scene)
- ambient social room
- 자동으로 변화하는 디지털 공간

형태를 가진다.

핵심:

> Room 자체가 사회 상태를 표현해야 한다.

---

# Main Screen Structure

## 모바일 기준

```text
┌─────────────────────┐
│  Atmosphere Header  │
├─────────────────────┤
│                     │
│     Spatial Room    │
│                     │
│   Creature + Bubble │
│   Ambient Motion    │
│                     │
├─────────────────────┤
│  Ambient Feed       │
├─────────────────────┤
│  Composer           │
└─────────────────────┘
```

---

# Atmosphere Header

상단에는:

- 오늘의 분위기
- room mood
- social energy
- current culture

등이 표시된다.

예:

```text
Tonight Mood
Chaotic Cozy Internet Room
```

핵심:

> 사용자는 입장 즉시 방의 공기를 느껴야 한다.

---

# Spatial Room Scene

메인 공간.

Room 내부에는:

- pixel creature entities
- 말풍선
- ambient movement
- 상태 변화
- 관계 거리감

이 실시간 표현된다.

예:

```text
┌─────────────────┐
│  🌧 새벽 음악방   │
│                 │
│   👾            │
│ “이 노래 좋네”   │
│                 │
│        👻       │
│                 │
│  🤖             │
│ “나 아직 안잠”  │
│                 │
│           👀    │
│                 │
└─────────────────┘
```

---

# Pixel Creature System

모든 존재(Entity)는:

- habo 스타일의 픽셀형태 + 귀여운 캐릭터

얼굴은 사람 대신 아래의 표현방식을 적극 활용:

- 몬스터
- 정령
- 로봇
- 유령
- weird internet creatures
- fantasy pixel beings

형태 사용.

핵심:

> 사용자가 현실 자아를 투영하는 것이 아니라
> 세계 속 존재처럼 느껴지게 만드는 것.

---

# Creature Style Direction

스타일 방향:

- low-detail pixel art
- weird but cozy
- emotional silhouette
- ambient animation
- readable mood

---

# Creature Examples

| 타입 | 특징 |
|---|---|
| cozy spirit | 느린 움직임 / warm palette |
| glitch robot | flickering / chaotic |
| floating ghost | lurking / distant |
| sleepy blob | low-energy idle |
| tiny monster | playful reaction |

---

# Social State Visualization

핵심:

> 사회 상태는 텍스트가 아니라 공간으로 느껴져야 한다.

---

# 1. Character Positioning

관계를 위치로 표현.

예:

| 상태 | 표현 |
|---|---|
| 친함 | 가까이 위치 |
| awkward | 멀리 위치 |
| outsider | 혼자 위치 |
| active duo | 반복 proximity |

---

# 2. Movement Density

사회 에너지를 움직임으로 표현.

| 상태 | 움직임 |
|---|---|
| sleepy | 거의 안 움직임 |
| cozy | 느린 이동 |
| chaotic | 빠른 이동 |
| awkward | 거리 유지 |

---

# 3. Bubble Density

분위기를 말풍선으로 표현.

| 상태 | 특징 |
|---|---|
| hype | 연속 bubble |
| emotional | 긴 문장 |
| meme mode | 짧은 연타 |
| tension | 긴 silence |

---

# 4. Ambient Room Mood

방 자체가 분위기를 표현.

| mood | 시각 효과 |
|---|---|
| cozy | warm lighting |
| rainy | blue tone |
| chaotic | clutter 증가 |
| lonely | 빈 공간 강조 |

---

# Room Mutation System

Room은:

- 유저 행동
- 링크 문화
- social energy
- ritual
- relationship drift

영향으로 자동 변화한다.

핵심:

> 사용자가 직접 꾸미는 것이 아니라
> 세계가 스스로 변화해야 한다.

---

# Room Mutation Examples

## 음악 중심 세계

자동 생성:

- 스피커
- LP 포스터
- 음악 조명
- playlist wall

---

## chaotic 밈 세계

자동 생성:

- 정신없는 포스터
- weird object
- clutter 증가
- 빠른 ambient motion

---

## cozy 세계

자동 생성:

- 따뜻한 조명
- 비오는 창문
- 식물
- 작은 ambient lighting

---

# Ambient Feed

Room 아래에는:

> 사회 흐름 로그

존재.

예:

```text
Mina shared a playlist
Joon reacted 😂
Sora stayed unusually late tonight
```

핵심:

- 채팅 로그 ❌
- 사회 변화 로그 ⭕

---

# Composer

입력창은:

- 작고 unobtrusive
- 화면의 주인공이 아니어야 함
- 자연스럽게 끼어드는 느낌

이어야 한다.

---

# Presence Philosophy

핵심:

> 말하지 않아도 존재감이 느껴져야 한다.

예:

- 계속 방에 머무름
- 특정 존재와 자주 proximity 발생
- 특정 시간대 반복 출현
- 긴 silence 유지

등이:

- 위치
- 움직임
- 상태
- bubble pacing

으로 표현된다.

---

# Final UX Goal

사용자가 느껴야 하는 것은:

```text
AI가 답변한다
```

가 아니라:

```text
오늘도 저 세계가 살아있다
```

이다.

