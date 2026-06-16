// Server-side ticket balance ops. Reads can use the caller's client; grants
// and consumes go through the service role (RLS exposes only self-read).

import type { SupabaseClient } from "@supabase/supabase-js";
import { TICKET_KINDS, type TicketKind } from "@/lib/tickets";

export type Balances = Record<TicketKind, number>;

function zero(): Balances {
  return Object.fromEntries(TICKET_KINDS.map((k) => [k, 0])) as Balances;
}

/** All ticket balances for a user, every kind present (0 when unset). */
export async function getBalances(
  sb: SupabaseClient,
  userId: string,
): Promise<Balances> {
  const out = zero();
  const { data } = await sb
    .from("ticket_balances")
    .select("kind, balance")
    .eq("user_id", userId);
  for (const row of (data ?? []) as { kind: string; balance: number }[]) {
    if (row.kind in out) out[row.kind as TicketKind] = row.balance;
  }
  return out;
}

/** Grant n tickets (service role). Read-modify-write is fine here — grants
 *  are admin/bundle-driven and not concurrent per (user, kind). Returns the
 *  new balance. */
export async function grant(
  svc: SupabaseClient,
  userId: string,
  kind: TicketKind,
  n: number,
): Promise<number> {
  const { data: existing } = await svc
    .from("ticket_balances")
    .select("balance")
    .eq("user_id", userId)
    .eq("kind", kind)
    .maybeSingle();
  const next = Math.max(0, (existing?.balance ?? 0) + n);
  const { error } = await svc.from("ticket_balances").upsert({
    user_id: userId,
    kind,
    balance: next,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`grant: ${error.message}`);
  return next;
}

/** Atomically spend one ticket. Returns the new balance, or null if the user
 *  had none (caller treats null as "insufficient"). */
export async function consumeOne(
  svc: SupabaseClient,
  userId: string,
  kind: TicketKind,
): Promise<number | null> {
  const { data, error } = await svc.rpc("consume_ticket", {
    p_user: userId,
    p_kind: kind,
  });
  if (error) throw new Error(`consume: ${error.message}`);
  // rpc returns the new balance, or null/undefined when nothing was spent.
  return typeof data === "number" ? data : null;
}
