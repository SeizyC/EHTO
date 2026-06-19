"use client";

import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { TICKETS, type TicketKind, type TicketMeta } from "@/lib/tickets";

// Client store for the consumable ticket wallet. Mirrors the lightweight
// shared-cache + pub/sub pattern used by members-store / world-store.

export type Balances = Record<TicketKind, number>;

let _balances: Balances | null = null;
let _loading = false;
const _listeners = new Set<() => void>();
function _notify() { for (const fn of _listeners) fn(); }

export function clearTickets() {
  _balances = null;
  _notify();
}

async function fetchTickets(): Promise<void> {
  if (_loading) return;
  _loading = true;
  try {
    const sb = browserClient();
    const { data: sess } = await sb.auth.getSession();
    if (!sess.session) { _balances = null; _notify(); return; }
    const r = await fetch("/api/tickets", {
      headers: { Authorization: `Bearer ${sess.session.access_token}` },
    });
    if (!r.ok) return; // keep cache on transient failure
    const j = await r.json();
    _balances = (j.balances ?? null) as Balances | null;
    _notify();
  } catch (e) {
    // Transient network failure — keep cached balances, retry next poll.
    console.warn("[tickets] refresh failed", e instanceof Error ? e.message : e);
  } finally {
    _loading = false;
  }
}

/** Spend one ticket of `kind` and run its action. Returns an error string on
 *  failure (already-localized server message), or null on success. Refreshes
 *  balances either way so the wallet reflects the new count. */
export async function spendTicket(kind: TicketKind): Promise<string | null> {
  const sb = browserClient();
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) return "로그인이 필요해요";
  const r = await fetch("/api/tickets/use", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sess.session.access_token}`,
    },
    body: JSON.stringify({ kind }),
  });
  const j = await r.json().catch(() => ({}));
  await fetchTickets();
  return r.ok ? null : (j.error ?? `오류 (${r.status})`);
}

export type CatalogEntry = TicketMeta & { kind: TicketKind; balance: number };

export function useTickets() {
  const [balances, setBalances] = useState<Balances | null>(_balances);

  useEffect(() => {
    const sync = () => setBalances(_balances);
    _listeners.add(sync);
    sync();
    if (_balances === null) fetchTickets();
    return () => { _listeners.delete(sync); };
  }, []);

  const refresh = useCallback(() => fetchTickets(), []);

  // Catalog joined with balances, in declaration order.
  const entries: CatalogEntry[] = (Object.keys(TICKETS) as TicketKind[]).map((k) => ({
    ...TICKETS[k],
    kind: k,
    balance: balances?.[k] ?? 0,
  }));

  return { balances, entries, refresh };
}
