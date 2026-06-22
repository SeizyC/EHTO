"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { browserClient } from "@/lib/supabase";

type BetaCode = {
  code: string;
  owner_user_id: string | null;
  used_by: string | null;
  used_at: string | null;
  created_at: string;
};

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export default function AdminCodesPage() {
  const [codes, setCodes] = useState<BetaCode[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [count, setCount] = useState(10);
  const [minting, setMinting] = useState(false);
  const [newCodes, setNewCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getToken = useCallback(async (): Promise<string | null> => {
    const sb = browserClient();
    const { data: sess } = await sb.auth.getSession();
    return sess.session?.access_token ?? null;
  }, []);

  const load = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    const r = await fetch("/api/admin/beta-codes", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const j = await r.json();
    if (!r.ok) {
      setErr(j.error ?? "불러오기 실패");
      setCodes([]);
      return;
    }
    setCodes(j.codes ?? []);
    setErr(null);
  }, [getToken]);

  useEffect(() => {
    load();
  }, [load]);

  async function mint() {
    if (minting) return;
    setMinting(true);
    setErr(null);
    setNewCodes([]);
    try {
      const token = await getToken();
      if (!token) return;
      const r = await fetch("/api/admin/beta-codes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ count }),
      });
      const j = await r.json();
      if (!r.ok) {
        setErr(j.error ?? "코드 생성 실패");
        return;
      }
      setNewCodes(j.created ?? []);
      await load();
    } finally {
      setMinting(false);
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(code);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div>
      <header className="mb-5 flex items-baseline justify-between">
        <div>
          <h2 className="text-ink text-[18px] font-medium">초대코드</h2>
          <p className="text-sub mt-1 text-[12px]">
            부트스트랩 코드 발급 및 전체 코드 현황 조회 (최대 500건)
          </p>
        </div>
        <span className="text-dim text-[11px] tabular-nums">
          {codes == null ? "—" : `${codes.length}건`}
        </span>
      </header>

      {/* Mint control row */}
      <div className="border-line bg-surface mb-5 flex items-center gap-3 rounded-lg border p-3">
        <input
          type="number"
          min={1}
          max={50}
          value={count}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (Number.isFinite(v)) setCount(Math.max(1, Math.min(50, v)));
          }}
          className="border-line bg-bg text-ink w-16 rounded-md border px-2 py-1.5 text-center text-[13px] tabular-nums"
        />
        <span className="text-sub text-[12px]">개</span>
        <button
          type="button"
          onClick={mint}
          disabled={minting}
          className="bg-accent text-bg rounded-md px-3 py-1.5 text-[12.5px] font-medium transition hover:opacity-90 disabled:opacity-50"
        >
          {minting ? "생성 중…" : "코드 생성"}
        </button>
        {newCodes.length > 0 && (
          <span className="text-sub text-[11.5px]">
            <span className="text-ink tabular-nums">{newCodes.length}개</span> 생성됨
          </span>
        )}
      </div>

      {/* Newly minted highlight */}
      {newCodes.length > 0 && (
        <div className="border-line bg-surface mb-4 rounded-lg border p-3">
          <p className="text-sub mb-2 text-[11px]">방금 생성된 코드</p>
          <div className="flex flex-wrap gap-2">
            {newCodes.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => copyCode(c)}
                title="클립보드에 복사"
                className="border-line hover:border-dim font-mono rounded border px-2 py-1 text-[12px] transition"
                style={{ color: copied === c ? "var(--color-accent)" : "var(--color-ink)" }}
              >
                {copied === c ? "복사됨!" : c}
              </button>
            ))}
          </div>
        </div>
      )}

      {err && (
        <p className="text-accent mb-4 text-[12px]">
          {err}
          {err.includes("테이블") || err.includes("exist") ? "" : ""}
        </p>
      )}

      {/* Table */}
      {codes == null ? (
        <p className="text-sub text-[12px]">불러오는 중…</p>
      ) : codes.length === 0 ? (
        <p className="text-sub text-[12px]">
          아직 코드가 없거나 테이블 미적용 상태입니다.
        </p>
      ) : (
        <div className="border-line overflow-hidden rounded-lg border">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-surface border-line border-b">
                <th className="text-sub px-3 py-2 text-left font-medium">코드</th>
                <th className="text-sub px-3 py-2 text-left font-medium">구분</th>
                <th className="text-sub px-3 py-2 text-left font-medium">상태</th>
                <th className="text-sub px-3 py-2 text-left font-medium">생성일</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {codes.map((row) => {
                const isBootstrap = row.owner_user_id === null;
                const isUsed = row.used_by !== null;
                const isNew = newCodes.includes(row.code);
                return (
                  <tr
                    key={row.code}
                    className={
                      "border-line border-b last:border-b-0 " +
                      (isNew ? "bg-surface/60" : "")
                    }
                  >
                    <td className="px-3 py-2">
                      <span className="text-ink font-mono tracking-wide">{row.code}</span>
                    </td>
                    <td className="px-3 py-2">
                      {isBootstrap ? (
                        <span
                          className="rounded border px-1.5 py-0.5 text-[10px]"
                          style={{ color: "#7B9EE8", borderColor: "rgba(123,158,232,0.35)" }}
                        >
                          부트스트랩
                        </span>
                      ) : (
                        <span className="text-sub rounded border border-line px-1.5 py-0.5 text-[10px]">
                          유저발급
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {isUsed ? (
                        <span
                          className="rounded border px-1.5 py-0.5 text-[10px]"
                          style={{ color: "#888", borderColor: "rgba(136,136,136,0.3)" }}
                        >
                          사용됨
                        </span>
                      ) : (
                        <span
                          className="rounded border px-1.5 py-0.5 text-[10px]"
                          style={{ color: "#6DBF82", borderColor: "rgba(109,191,130,0.35)" }}
                        >
                          미사용
                        </span>
                      )}
                    </td>
                    <td className="text-sub px-3 py-2 tabular-nums">
                      {shortDate(row.created_at)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {!isUsed && isBootstrap && (
                        <button
                          type="button"
                          onClick={() => copyCode(row.code)}
                          title="클립보드에 복사"
                          className="text-sub hover:text-ink rounded p-1 transition"
                          aria-label="코드 복사"
                        >
                          {copied === row.code ? (
                            /* checkmark */
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                              <path d="M2 7l4 4 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : (
                            /* clipboard */
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                              <rect x="3" y="4" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
                              <path d="M5 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                            </svg>
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
