"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase";
import { EHTO_ACTIONS } from "@/lib/ehto";
import type { EhtoAction } from "@/lib/ehto";

// EHTO currency wallet for the /me sheet. Lists the EHTO action catalog with
// the user's current balance. Tappable rows spend EHTO via the spend API.
// Mirrors TicketWallet's row idiom: label + desc on left, price + chevron on right.
export function EhtoWallet() {
  const router = useRouter();
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState<EhtoAction | null>(null);

  async function fetchBalance() {
    try {
      const sb = browserClient();
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) return;
      const r = await fetch("/api/ehto/balance", {
        headers: { Authorization: `Bearer ${sess.session.access_token}` },
      });
      if (!r.ok) return;
      const j = await r.json();
      setBalance(j.balance);
    } catch {
      /* best-effort */
    }
  }

  useEffect(() => {
    fetchBalance();
  }, []);

  async function spend(action: EhtoAction, label: string, price: number) {
    if (busy) return;
    if (!window.confirm(`'${label}' · EHTO ${price} 쓸까요?`)) return;
    setBusy(action);
    try {
      const sb = browserClient();
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) {
        alert("세션이 만료됐어요. 다시 로그인해주세요.");
        setBusy(null);
        return;
      }
      const r = await fetch("/api/ehto/spend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sess.session.access_token}`,
        },
        body: JSON.stringify({ action }),
      });
      const j = await r.json();
      if (r.ok && j.ok) {
        setBalance(j.balance);
      } else {
        alert(j.error ?? "오류가 생겼어요. 잠시 후 다시 시도해주세요.");
        // Refetch to get accurate balance (server may have refunded)
        await fetchBalance();
      }
    } catch {
      alert("요청 중 오류가 생겼어요.");
      await fetchBalance();
    } finally {
      setBusy(null);
    }
  }

  // Actions that the spend API currently handles server-side
  const TAPPABLE: Set<EhtoAction> = new Set(["member_invite", "energy_refill"]);

  // Actions that navigate to a page (charge happens server-side there)
  function handleCharacterChange(label: string, price: number) {
    if (busy) return;
    if (!window.confirm(`'${label}' · EHTO ${price} 쓸까요?`)) return;
    router.push("/character?change=1");
  }

  return (
    <div className="mt-6 px-6">
      {/* Header: label + balance */}
      <div className="mb-1 flex items-center justify-between">
        <p className="text-sub text-[11.5px]">EHTO</p>
        {balance !== null && (
          <span
            className="tabular-nums text-[13px] font-semibold"
            style={balance > 0 ? { color: "#E89B6C" } : undefined}
          >
            {balance > 0 ? (
              <span style={{ color: "#E89B6C" }}>◆ {balance}</span>
            ) : (
              <span className="text-dim">◆ {balance}</span>
            )}
          </span>
        )}
      </div>

      <ul className="flex flex-col">
        {EHTO_ACTIONS.map((a) => {
          // An action is tappable only if:
          // 1. The spend API handles it (TAPPABLE set)
          // 2. The catalog marks it actionable
          // 3. User has enough balance
          const isTappable =
            TAPPABLE.has(a.action) &&
            a.actionable &&
            balance !== null &&
            balance >= a.price;

          // character_change navigates to /character?change=1 (charge is server-side)
          const isNavAction = a.action === "character_change";
          const isNavTappable =
            isNavAction &&
            a.actionable &&
            balance !== null &&
            balance >= a.price;

          // Non-spend, non-nav actionable rows show "곧"
          const isSoon = a.actionable && !TAPPABLE.has(a.action) && !isNavAction;

          const subtext = !a.actionable
            ? "준비 중"
            : isSoon
            ? "곧"
            : a.desc;

          const isAnyTappable = isTappable || isNavTappable;

          const priceEl = (
            <span className="flex items-center gap-3">
              <span
                className="tabular-nums text-[13px]"
                style={
                  balance !== null && balance >= a.price && a.actionable && !isSoon
                    ? { color: "#E89B6C" }
                    : undefined
                }
              >
                {isAnyTappable ? (
                  <span style={{ color: "#E89B6C" }}>◆ {a.price}</span>
                ) : (
                  <span className="text-dim">◆ {a.price}</span>
                )}
              </span>
              {isAnyTappable && (
                <span className="text-sub group-active:text-ink text-[14px]">
                  {busy === a.action ? "…" : "›"}
                </span>
              )}
            </span>
          );

          const body = (
            <>
              <span className="flex flex-col items-start gap-0.5">
                <span className="text-ink text-[14px]">{a.label}</span>
                <span className="text-sub text-[11.5px]">{subtext}</span>
              </span>
              {priceEl}
            </>
          );

          const cls =
            "border-line flex items-center justify-between border-b py-3.5 text-[14px]";

          return (
            <li key={a.action}>
              {isTappable ? (
                <button
                  onClick={() => spend(a.action, a.label, a.price)}
                  disabled={busy === a.action}
                  className={`group ${cls} active:bg-panel w-full text-left transition disabled:opacity-60`}
                >
                  {body}
                </button>
              ) : isNavTappable ? (
                <button
                  onClick={() => handleCharacterChange(a.label, a.price)}
                  disabled={busy === a.action}
                  className={`group ${cls} active:bg-panel w-full text-left transition disabled:opacity-60`}
                >
                  {body}
                </button>
              ) : (
                <div
                  className={`${cls} ${a.actionable && !isSoon ? "" : "opacity-60"}`}
                >
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
