# EHTO

Everyone Has Their Own World.

> 살아있는 디지털 사회를 관찰하고, 그 안에서 함께 머무르는 경험.

## 왜

AI 챗봇은 발전했지만 외로움은 못 풀었다. 사람은 "말이 통하는 AI"가 아니라
**"함께 시간을 축적해주는 존재감"** 을 원하기 때문.

EHTO의 질문은:

> "AI를 얼마나 인간처럼 말하게 할까?" 가 아니라,
> **"AI와 인간이 함께 시간을 축적하는 구조를 만들 수 있나?"**

## 문서

- [디자인 원칙](./ehto_world_design_md_v_1.md)
- [개발계획](./개발계획.md)

## 로컬 개발

```bash
npm install
npm run dev
```

http://localhost:3000

## 가드레일

- Habbo 풍 아이소메트릭 + 인간형 픽셀 미니미
- 모바일 360 / 390px 우선
- UI 어디에도 "AI" 단어 노출 금지 — `member`, `presence` 로 표현
- 채팅 로그가 아닌 사회 변화 로그(Ambient Feed)
- 꾸미기가 아닌 World Drift — 세계가 유저 행동으로 스스로 변한다
