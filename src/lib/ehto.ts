// EHTO — the single in-app currency. Stored on ticket_balances under the
// fixed kind 'ehto'. Each spendable action has a price here; the spend API
// debits EHTO atomically (spend_ehto RPC) then performs the action.
//
// Energy (daily moments) stays separate; energy_refill is the bridge that
// lets EHTO top up a rested plaza.

import type { SupabaseClient } from "@supabase/supabase-js";

export const EHTO_KIND = "ehto" as const;
export const START_GRANT = 10; // EHTO granted once at onboarding finalize

export type EhtoAction =
  | "character_change"
  | "member_invite"
  | "member_keep"
  | "member_recall"
  | "plaza_recommend"
  | "energy_refill";

export type EhtoActionMeta = {
  action: EhtoAction;
  price: number;
  label: string;
  desc: string;
  actionable: boolean;
};

export const EHTO_ACTIONS: EhtoActionMeta[] = [
  { action: "character_change", price: 5, label: "캐릭터 변경", desc: "새로운 모습으로 다시 생성해요.", actionable: true },
  { action: "member_invite",    price: 2, label: "초대",        desc: "기다리던 친구 한 명을 지금 광장으로.", actionable: true },
  { action: "energy_refill",    price: 1, label: "이어서 보기", desc: "쉬고 있는 광장을 오늘 다시 깨워요.", actionable: true },
  { action: "member_keep",      price: 1, label: "조금 더 곁에", desc: "떠나려는 친구를 붙잡아요.", actionable: false },
  { action: "member_recall",    price: 2, label: "다시 부르기", desc: "떠난 친구를 다시 불러요.", actionable: false },
  { action: "plaza_recommend",  price: 1, label: "닮은 곳",     desc: "내 광장과 닮은 곳을 찾아요.", actionable: false },
];

const _byAction = new Map(EHTO_ACTIONS.map((a) => [a.action, a]));

export function priceOf(action: EhtoAction): number | null {
  return _byAction.get(action)?.price ?? null;
}

export function isEhtoAction(v: string): v is EhtoAction {
  return _byAction.has(v as EhtoAction);
}

export async function getEhtoBalance(svc: SupabaseClient, userId: string): Promise<number> {
  const { data } = await svc
    .from("ticket_balances")
    .select("balance")
    .eq("user_id", userId)
    .eq("kind", EHTO_KIND)
    .maybeSingle();
  return (data?.balance as number | undefined) ?? 0;
}

export async function grantEhto(svc: SupabaseClient, userId: string, n: number): Promise<number> {
  const { data: existing } = await svc
    .from("ticket_balances")
    .select("balance")
    .eq("user_id", userId)
    .eq("kind", EHTO_KIND)
    .maybeSingle();
  const next = Math.max(0, ((existing?.balance as number | undefined) ?? 0) + n);
  const { error } = await svc.from("ticket_balances").upsert({
    user_id: userId, kind: EHTO_KIND, balance: next, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`grantEhto: ${error.message}`);
  return next;
}

export async function spendEhto(svc: SupabaseClient, userId: string, amount: number): Promise<number | null> {
  const { data, error } = await svc.rpc("spend_ehto", { p_user: userId, p_amount: amount });
  if (error) throw new Error(`spendEhto: ${error.message}`);
  return typeof data === "number" ? data : null;
}
