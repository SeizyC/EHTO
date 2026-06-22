"use client";

import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";

type StatsData = {
  signups: number;
  profiles: number;
  activeVisitors7d: number;
  pageviewsTotal: number;
  pageviews7d: number;
  topPaths: { path: string; count: number }[];
  byCountry: { country: string; count: number }[];
};

export default function StatsPage() {
  const [data, setData] = useState<StatsData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = browserClient();
    const { data: sess } = await sb.auth.getSession();
    if (!sess.session) return;
    const r = await fetch("/api/admin/stats", {
      headers: { Authorization: `Bearer ${sess.session.access_token}` },
    });
    const j = await r.json();
    if (!r.ok) {
      setErr(j.error ?? "불러오기 실패");
      return;
    }
    setData(j as StatsData);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h2 className="text-ink text-[18px] font-medium">통계</h2>
          <p className="text-sub mt-1 text-[12px]">가입자 · 방문자 · 페이지뷰 현황</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="border-line text-sub hover:border-dim hover:text-ink rounded-md border px-2.5 py-1 text-[11px] transition"
        >
          새로고침
        </button>
      </header>

      {err && (
        <p className="text-accent mb-4 text-[12px]">{err}</p>
      )}

      {!data ? (
        <p className="text-sub text-[12px]">불러오는 중…</p>
      ) : (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard label="가입자" value={data.signups} />
            <StatCard label="프로필" value={data.profiles} />
            <StatCard label="7일 활성 방문자" value={data.activeVisitors7d} />
            <StatCard label="총 페이지뷰" value={data.pageviewsTotal} />
            <StatCard label="7일 페이지뷰" value={data.pageviews7d} />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Top paths */}
            <div className="border-line bg-surface rounded-lg border p-4">
              <h3 className="text-ink mb-3 text-[13px] font-medium">인기 경로 (7일)</h3>
              {data.topPaths.length === 0 ? (
                <p className="text-dim text-[12px]">데이터 없음</p>
              ) : (
                <ol className="space-y-1.5">
                  {data.topPaths.map(({ path, count }, i) => (
                    <li key={path} className="flex items-baseline justify-between gap-2">
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span className="text-dim w-4 shrink-0 text-right text-[10.5px] tabular-nums">
                          {i + 1}
                        </span>
                        <span className="text-ink truncate text-[12px]">{path}</span>
                      </div>
                      <span className="text-sub shrink-0 text-[11.5px] tabular-nums">
                        {count.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* Country breakdown */}
            <div className="border-line bg-surface rounded-lg border p-4">
              <h3 className="text-ink mb-3 text-[13px] font-medium">접속 국가 (7일)</h3>
              {data.byCountry.length === 0 ? (
                <p className="text-dim text-[12px]">데이터 없음</p>
              ) : (
                <ol className="space-y-1.5">
                  {data.byCountry.map(({ country, count }, i) => (
                    <li key={country} className="flex items-baseline justify-between gap-2">
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span className="text-dim w-4 shrink-0 text-right text-[10.5px] tabular-nums">
                          {i + 1}
                        </span>
                        <span className="text-ink text-[12px]">{country}</span>
                      </div>
                      <span className="text-sub shrink-0 text-[11.5px] tabular-nums">
                        {count.toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-line bg-surface rounded-lg border p-3">
      <p className="text-sub text-[10.5px]">{label}</p>
      <p className="text-ink mt-1 text-[22px] font-medium tabular-nums">
        {value.toLocaleString()}
      </p>
    </div>
  );
}
