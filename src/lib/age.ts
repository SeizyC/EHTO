// 세계 나이 + 머무름 결 (texture).
//
// EHTO 등급/경험치 비-도입 결정 (PRD §9 가드레일):
//   - "유저는 세계의 주인공이 아니라 일부"
//   - "관찰자형 유저도 가치 있다"
//   - 비교/꾸미기 압박 금지
//
// 그래서 수치 progression 대신 시간의 흐름을 정성적으로 표현한다.
// 1) 세계 나이 = 캐릭터 생성 후 경과 일수 (자랑거리가 아니라 시간 기록)
// 2) 머무름 결 = 나이에 따라 자연 변화하는 정성 라벨
// 3) Phase 2 탐험 자격은 시간 게이트로 (>= 3일). exp 게이트 아님.

export type AgeInfo = {
  days: number;
  texture: string;     // 머무름 결 label
};

const TEXTURES: { upTo: number; label: string }[] = [
  { upTo: 0,   label: "갓 도착" },
  { upTo: 6,   label: "자주 들름" },
  { upTo: 29,  label: "오래 머무는" },
  { upTo: 89,  label: "토박이" },
  { upTo: Infinity, label: "오랜 토박이" },
];

export function worldAge(createdAtMs: number, nowMs: number = Date.now()): AgeInfo {
  const days = Math.max(0, Math.floor((nowMs - createdAtMs) / (1000 * 60 * 60 * 24)));
  const texture = TEXTURES.find((t) => days <= t.upTo)?.label ?? "토박이";
  return { days, texture };
}

// Phase 2 — 타 유저 세계 탐험 자격
export const EXPLORATION_AGE_GATE_DAYS = 3;

export function canExplore(createdAtMs: number, nowMs: number = Date.now()): boolean {
  return worldAge(createdAtMs, nowMs).days >= EXPLORATION_AGE_GATE_DAYS;
}
