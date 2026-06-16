// Ticket catalog — consumable à la carte items (monetization "포석").
//
// Tickets are discrete *acts of intent* (vs. the membership's continuous
// entitlements). This module is the single source of truth for which ticket
// kinds exist and their copy; the server (api/tickets) grants/consumes them
// and performs the action. Copy follows the restrained voice (spec §6.4) —
// no 충전/구매/쿠폰 jargon.

export type TicketKind =
  | "refill"     // 이어서 보기 — top up today's moments (rest → awake again)
  | "invite"     // 초대 — bring one waiting friend into the plaza now
  | "keep"       // 조금 더 곁에 — keep a fading friend from leaving
  | "recall"     // 다시 부르기 — bring back a friend who left
  | "recommend"; // 닮은 곳 — surface a plaza like yours

export type TicketMeta = {
  kind: TicketKind;
  /** Short refined label shown to users. */
  label: string;
  /** One-line description. */
  desc: string;
  /** Whether the consume action is wired up yet. Catalog lists all kinds so
   *  copy/pricing can be designed; non-actionable ones are "coming soon"
   *  until their underlying feature ships. */
  actionable: boolean;
};

export const TICKETS: Record<TicketKind, TicketMeta> = {
  refill: {
    kind: "refill",
    label: "이어서 보기",
    desc: "쉬고 있는 광장을 오늘 다시 깨워요.",
    actionable: true,
  },
  invite: {
    kind: "invite",
    label: "초대",
    desc: "기다리던 친구 한 명을 지금 광장으로.",
    actionable: true,
  },
  keep: {
    kind: "keep",
    label: "조금 더 곁에",
    desc: "떠나려는 친구를 붙잡아요.",
    actionable: false,
  },
  recall: {
    kind: "recall",
    label: "다시 부르기",
    desc: "떠난 친구를 다시 불러요.",
    actionable: false,
  },
  recommend: {
    kind: "recommend",
    label: "닮은 곳",
    desc: "내 광장과 닮은 곳을 찾아요.",
    actionable: false,
  },
};

export const TICKET_KINDS = Object.keys(TICKETS) as TicketKind[];

export function isTicketKind(v: string | null | undefined): v is TicketKind {
  return v != null && Object.prototype.hasOwnProperty.call(TICKETS, v);
}
