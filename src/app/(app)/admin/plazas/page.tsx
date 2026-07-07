"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { browserClient } from "@/lib/supabase";

type Plaza = {
  id: string;
  name: string | null;
  owner: string | null;
  createdAt: string;
  language: string;
  region: string;
  plan: string;
  paused: boolean;
  ownerActiveAt: string | null;
  members: number;
  todayMessages: number;
  lastMessageAt: string | null;
};
type PlazasData = { plazas: Plaza[]; total: number };

// "3분 전" / "2시간 전" / "07.06" style relative time (KST-agnostic — just elapsed).
function ago(iso: string | null): string {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  const d = Math.floor(s / 86400);
  if (d < 7) return `${d}일 전`;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const p = (t: string) => parts.find((x) => x.type === t)?.value ?? "";
  return `${p("month")}.${p("day")}`;
}

export default function PlazasPage() {
  const [data, setData] = useState<PlazasData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = browserClient();
    const { data: sess } = await sb.auth.getSession();
    if (!sess.session) return;
    const r = await fetch("/api/admin/plazas", {
      headers: { Authorization: `Bearer ${sess.session.access_token}` },
    });
    const j = await r.json();
    if (!r.ok) { setErr(j.error ?? "불러오기 실패"); return; }
    setData(j as PlazasData);
  }, []);

  useEffect(() => { load(); }, [load]);

  const liveCount = data ? data.plazas.filter((p) => !p.paused && p.members > 0).length : 0;

  return (
    <div>
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h2 className="text-ink text-[18px] font-medium">광장 현황</h2>
          <p className="text-sub mt-1 text-[12px]">
            {data ? `광장 ${data.total}개 · 활성 ${liveCount}개` : "각 광장의 멤버 · 대화 · 최근 활동"}
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
      ) : data.plazas.length === 0 ? (
        <p className="text-dim text-[12px]">광장이 없습니다.</p>
      ) : (
        <div className="border-line bg-surface overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] text-left">
            <thead>
              <tr className="border-line text-dim border-b text-[10.5px]">
                <th className="px-3 py-2 font-normal">광장 / 방장</th>
                <th className="px-3 py-2 text-right font-normal">멤버</th>
                <th className="px-3 py-2 text-right font-normal">오늘 대화</th>
                <th className="px-3 py-2 text-right font-normal">최근 활동</th>
                <th className="px-3 py-2 font-normal">지역·언어</th>
                <th className="px-3 py-2 font-normal">상태</th>
              </tr>
            </thead>
            <tbody>
              {data.plazas.map((p) => (
                <tr key={p.id} className="border-line/60 border-b last:border-0">
                  <td className="px-3 py-2">
                    <Link href={`/plaza/${p.id}`} className="text-ink hover:text-accent text-[12px] transition">
                      {p.name || "(이름 없음)"}
                    </Link>
                    <span className="text-dim ml-1.5 text-[11px]">/ {p.owner ?? "—"}</span>
                  </td>
                  <td className="text-ink px-3 py-2 text-right text-[12px] tabular-nums">{p.members}</td>
                  <td className="text-sub px-3 py-2 text-right text-[12px] tabular-nums">{p.todayMessages}</td>
                  <td className="text-sub px-3 py-2 text-right text-[11px] tabular-nums whitespace-nowrap">{ago(p.lastMessageAt)}</td>
                  <td className="text-dim px-3 py-2 text-[11px] whitespace-nowrap">
                    {p.region} · <span className="uppercase">{p.language}</span>
                    {p.plan !== "free" && <span className="text-accent ml-1">{p.plan}</span>}
                  </td>
                  <td className="px-3 py-2 text-[11px] whitespace-nowrap">
                    {p.paused
                      ? <span className="text-amber-400">일시정지</span>
                      : p.members > 0
                        ? <span className="text-emerald-400">활성</span>
                        : <span className="text-dim">대기</span>}
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
