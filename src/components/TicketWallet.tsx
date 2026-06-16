"use client";

import { useState } from "react";
import { useTickets, spendTicket } from "@/lib/tickets-store";
import type { TicketKind } from "@/lib/tickets";

// Ticket wallet for the /me sheet. Lists the catalog with owned counts.
// Owned + actionable tickets are tappable rows (MeSheet's idiom: text +
// chevron, no labelled buttons) that spend one ticket on tap.
export function TicketWallet() {
  const { entries } = useTickets();
  const [busy, setBusy] = useState<TicketKind | null>(null);

  async function spend(kind: TicketKind, label: string) {
    if (busy) return;
    if (!window.confirm(`'${label}' 한 장 쓸까요?`)) return;
    setBusy(kind);
    const err = await spendTicket(kind);
    setBusy(null);
    if (err) alert(err);
  }

  return (
    <div className="mt-6 px-6">
      <p className="text-sub mb-1 text-[11.5px]">티켓</p>
      <ul className="flex flex-col">
        {entries.map((e) => {
          const usable = e.actionable && e.balance > 0;
          const count = (
            <span
              className="tabular-nums text-[13px]"
              style={e.balance > 0 ? { color: "#E8C067" } : undefined}
            >
              <span className={e.balance > 0 ? "" : "text-dim"}>{e.balance}</span>
            </span>
          );
          const body = (
            <>
              <span className="flex flex-col items-start gap-0.5">
                <span className="text-ink text-[14px]">{e.label}</span>
                <span className="text-sub text-[11.5px]">
                  {e.actionable ? e.desc : "준비 중"}
                </span>
              </span>
              <span className="flex items-center gap-3">
                {count}
                {usable && (
                  <span className="text-sub group-active:text-ink text-[14px]">
                    {busy === e.kind ? "…" : "›"}
                  </span>
                )}
              </span>
            </>
          );
          const cls =
            "border-line flex items-center justify-between border-b py-3.5 text-[14px]";
          return (
            <li key={e.kind}>
              {usable ? (
                <button
                  onClick={() => spend(e.kind, e.label)}
                  disabled={busy === e.kind}
                  className={`group ${cls} active:bg-panel w-full text-left transition disabled:opacity-60`}
                >
                  {body}
                </button>
              ) : (
                <div className={`${cls} ${e.actionable ? "" : "opacity-60"}`}>
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
