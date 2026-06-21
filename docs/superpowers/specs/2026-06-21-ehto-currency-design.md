# 통합 재화(EHTO) + 캐릭터 1회 생성 — Design Spec

**Date**: 2026-06-21
**Status**: Draft → 사용자 리뷰 대기
**Tagline**: "광장에 온기를 더하는 단 하나의 재화"

---

## 1. 배경과 목표

현재 "티켓"이라는 말이 **세 가지 다른 개념**에 섞여 있고 재화 그림이 파편화돼 있다([2026-06-14-monetization-design.md](2026-06-14-monetization-design.md) 참고):

- **에너지**(moment/interject/정원) — 활동 미터. 모네타이제이션 스펙에서 제대로 설계·구현됨.
- **`ticket_balances`**(invite/refill/keep/recall/recommend 5종) — 일회성 액션 인프라만 있고 경제 설계 없음("포석").
- **레거시 `profiles.tickets`**(generic int, 가입 시 3) — 사실상 방치.
- **캐릭터 생성 "티켓"**(`MAX_ROLLS=3`) — 통화가 아니라 생성 시도 횟수인데 같은 단어를 써서 혼동.

### 목표
파편을 정리해 **단일 통합 재화**로 통일하고, **에너지(활동)와 재화(일회성 액션)를 명확히 분리**한다. 캐릭터는 **1회 생성(원샷) + 강한 노티**로 만들고, 이후 변경은 재화로 소비한다.

### 사용자 확정 결정
- 통화: **단일 통합 재화, 이름 `EHTO`** (영문 그대로, 현지화/번역 없이 모든 로케일 동일).
- 소비 범위: **캐릭터 변경 + 멤버 액션 + 에너지 충전**.
- 획득: **가입 지급 + 구매**(결제는 Layer 3로 분리).
- 캐릭터 첫 생성: **완전 원샷(재롤 없음)**, 강한 노티 + "나중에 변경 가능(재화 소비)" 안내.
- 에너지: 활동 미터로 **별도 관리**, 소진 시 재화로 충전 가능.

---

## 2. 통화 모델 — 단일 `EHTO`

- 사용자당 **단일 잔액**.
- **저장**: 기존 `ticket_balances`를 단일 종류(`kind = 'ehto'`)로 재활용 → 새 테이블 없이 기존 인프라 재사용. 5종 잔량은 마이그레이션으로 통합/폐지, 레거시 `profiles.tickets`는 정리(컬럼은 남겨두되 미사용, 또는 드롭 — 구현 시 결정).
- **원자적 차감**: 기존 `consume_ticket(p_user, p_kind)` RPC를 **`spend_ehto(p_user, p_amount)`** 로 확장 — `update ticket_balances set balance = balance - p_amount where user_id = p_user and kind = 'ehto' and balance >= p_amount returning balance`. 0행이면 잔액 부족.
- **지급**: 기존 `grant(svc, userId, 'ehto', n)` 재사용.
- 코드상 종류 상수는 `tickets.ts`를 단일 `EHTO` 메타로 축소.

---

## 3. 소비 메뉴 (가격 = 튜닝 하이퍼파라미터)

각 액션은 "EHTO를 N 소비 → 액션 수행"으로 통일. 가격은 시작 가설(측정 후 조정):

| 액션 | 설명 | 가격(가설) |
|------|------|-----------|
| **캐릭터 변경** | 아바타 재생성(원샷, 새 1장) | **5** |
| 멤버 초대(invite) | 대기 멤버 1명 즉시 입장 | 2 |
| 곁에 더(keep) | 멤버 체류 연장 | 1 |
| 다시 부르기(recall) | 떠난 멤버 복귀 | 2 |
| 닮은 곳(recommend) | 유사 광장 발견 | 1 |
| 에너지 충전(refill) | moment 소진 시 이어보기 | 1 → +30 moment |

- 공통 흐름: `spend_ehto(user, price)` 성공 시에만 액션 실행, 실패 시 잔액 부족 응답. 액션 실행이 실패하면 환불(`grant`).
- 기존 `/api/tickets/use`(kind별)는 **`/api/ehto/spend { action }`** 형태로 재편(액션→가격 매핑은 서버 상수).

---

## 4. 획득

- **가입 시작 지급**: 첫 온보딩 완료 시 `grant(user, 'ehto', START_GRANT)` (가설 **10**). 멱등(중복 지급 방지 마커).
- **구매(EHTO 팩)**: 결제(PortOne) 연동 = **Layer 3 별도 서브프로젝트**. 지금은 인프라(grant)만, 구매 UI/결제는 후속.
- **플러스 구독 월 스티펜드**: 플러스 플랜에 월 N EHTO(가설) — Layer 3와 함께.
- **관리자 지급**: 기존 `/api/admin/tickets`를 EHTO 지급으로 재편 + 어드민 페이지(후속, 선택).

---

## 5. 캐릭터 1회 생성 (원샷)

- 흐름: 속성 스텝 위저드(이미 구현) → **확정 직전 강한 노티 모달** → **원샷 생성(재롤 없음)** → 그 모습 확정 → 이름.
- **강한 노티 모달 카피**(ko/en/ja):
  - "이 모습이 **당신의 캐릭터**가 됩니다."
  - "지금은 **다시 만들 수 없어요**(한 번 생성)."
  - "**나중에 변경할 수 있어요 — 단, EHTO가 들어요.**"
  - CTA: "이 속성으로 생성" / "뒤로".
- **제거**: `MAX_ROLLS`, 재롤(`onReroll`/"다시 만들기"), `TicketChip`, "티켓" 단어 전부. ResultView의 재생성 버튼 제거(결과는 확정/이름으로만).
- **변경(나중)**: 설정(MeSheet 등)의 "캐릭터 변경" 액션 → `spend_ehto(user, 5)` 성공 시 generate 재실행 → 활성 캐릭터 교체. (변경도 원샷)

---

## 6. 에너지 (별도 유지) + 충전 다리

- 일일 moment(free 120)/interject(15)/정원(6·12)은 [energy.ts](../../../src/lib/energy.ts) 그대로.
- 소진 시 **EHTO로 '이어보기' 충전**(§3 refill): `spend_ehto(user, 1)` → 해당 월드 `moments_used` 를 30 감소(= +30 moment 효과). 에너지는 활동 미터로 유지하되, 재화가 top-up 다리를 제공.

---

## 7. 환영 모달 (첫 진입, 1회성)

- 첫 광장 진입 시 1회: 환영 + **시작 EHTO N 지급 안내** + **EHTO로 할 수 있는 것**(소비 메뉴 요약) 소개.
- framer-motion(앱 모션 관용구), **ko/en/ja**(단 "EHTO" 단어는 현지화 안 함), 프로덕션 UX(PixelButton·토큰·accent).
- 멱등: 1회만 표시(`profiles` 플래그 또는 localStorage + 서버 마커).

---

## 8. UI / 네이밍

- 통화 표기: **`EHTO`** + **토큰 글리프(작은 아이콘)** 항상 동반 → "통화 EHTO vs 앱/세계 EHTO" 혼동 완화(예: `◆ 5 EHTO`).
- 모든 로케일에서 단어는 그대로 `EHTO`. 수량/문장만 현지화.
- 잔액 표시 위치: 헤더/프로필(MeSheet) — 에너지 미터와 시각적으로 구분.

---

## 9. 정리 / 마이그레이션

- `ticket_balances`: 단일 `kind='ehto'`로 통합. 베타 초기라 기존 5종 잔량은 **폐기**하고, 모든 기존 사용자에게 **일회성 백필로 START_GRANT(10) 지급**(신규는 가입 지급으로 동일). 데이터가 적어 안전.
- 레거시 `profiles.tickets`: **deprecated — 더 이상 읽지/쓰지 않음**(컬럼은 보존, 드롭하지 않아 데이터 리스크 없음). `grant_starter_tickets` 트리거는 제거.
- `tickets.ts` 5종 메타 → EHTO 단일로 축소(`TICKETS`/`TicketKind` 정리).
- 캐릭터 페이지 "티켓" 네이밍/재롤 인프라 제거(§5).
- 초대 보상([beta-codes.ts](../../../src/lib/beta-codes.ts) `maybeGrantInviteReward`): "invite 티켓 +1" → **"EHTO +N"** 으로 변경(통화 통일).

---

## 10. 미포함 / 후속

- **결제(구매·구독·PortOne)** — Layer 3 별도 서브프로젝트. 본 스펙은 grant/spend 인프라 + 시작 지급까지.
- **EHTO 구매 UI / 상점** — Layer 3.
- **어드민 EHTO 지급 페이지** — 선택(후속). 지금은 API.
- **에너지 모델 변경** — 본 스펙은 refill 다리만 추가, 캡/티어 변경 없음.

---

## 11. 튜닝 파라미터 (구현 중 조정)

| 항목 | 가설값 |
|------|--------|
| 가입 시작 지급 | 10 EHTO |
| 캐릭터 변경 | 5 |
| 멤버 초대 | 2 |
| keep / recommend / refill | 1 |
| recall | 2 |
| refill 효과 | +30 moment |
| 플러스 월 스티펜드 | (Layer 3에서 결정 — 본 스펙 범위 밖) |
