"use client";

import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";

type UserRow = {
  id: string;
  email: string | null;
  signupAt: string;
  confirmedAt: string | null;
  country: string | null;
  handle: string | null;
  language: string | null;
};
type UsersData = { users: UserRow[]; total: number };

// ISO-2 country code → flag emoji (regional indicator letters).
function flag(cc: string | null): string {
  if (!cc || cc.length !== 2 || !/^[A-Za-z]{2}$/.test(cc)) return "";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

function fmtDate(iso: string): string {
  // YY.MM.DD HH:mm (KST)
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "2-digit", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${p("year")}.${p("month")}.${p("day")} ${p("hour")}:${p("minute")}`;
}

export default function UsersPage() {
  const [data, setData] = useState<UsersData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = browserClient();
    const { data: sess } = await sb.auth.getSession();
    if (!sess.session) return;
    const r = await fetch("/api/admin/users", {
      headers: { Authorization: `Bearer ${sess.session.access_token}` },
    });
    const j = await r.json();
    if (!r.ok) { setErr(j.error ?? "불러오기 실패"); return; }
    setData(j as UsersData);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h2 className="text-ink text-[18px] font-medium">사용자 현황</h2>
          <p className="text-sub mt-1 text-[12px]">
            {data ? `가입자 ${data.total.toLocaleString()}명` : "가입일 · 국가 · 이메일"}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="border-line text-sub hover:border-dim hover:text-ink rounded-md border px-2.5 py-1 text-[11px] transition"
        >
          새로고침
        </button>
      </header>

      {err && <p className="text-accent mb-4 text-[12px]">{err}</p>}

      {!data ? (
        <p className="text-sub text-[12px]">불러오는 중…</p>
      ) : data.users.length === 0 ? (
        <p className="text-dim text-[12px]">가입자가 없습니다.</p>
      ) : (
        <div className="border-line bg-surface overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr className="border-line text-dim border-b text-[10.5px]">
                <th className="px-3 py-2 font-normal">가입일 (KST)</th>
                <th className="px-3 py-2 font-normal">이메일</th>
                <th className="px-3 py-2 font-normal">국가</th>
                <th className="px-3 py-2 font-normal">핸들</th>
                <th className="px-3 py-2 font-normal">언어</th>
                <th className="px-3 py-2 font-normal">확인</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr key={u.id} className="border-line/60 border-b last:border-0">
                  <td className="text-sub px-3 py-2 text-[12px] tabular-nums whitespace-nowrap">{fmtDate(u.signupAt)}</td>
                  <td className="text-ink px-3 py-2 text-[12px]">{u.email ?? "—"}</td>
                  <td className="text-sub px-3 py-2 text-[12px] whitespace-nowrap">
                    {u.country ? `${flag(u.country)} ${u.country}` : "—"}
                  </td>
                  <td className="text-sub px-3 py-2 text-[12px]">{u.handle ?? "—"}</td>
                  <td className="text-dim px-3 py-2 text-[11px] uppercase">{u.language ?? "—"}</td>
                  <td className="px-3 py-2 text-[11px]">
                    {u.confirmedAt
                      ? <span className="text-emerald-400">확인됨</span>
                      : <span className="text-amber-400">대기</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
