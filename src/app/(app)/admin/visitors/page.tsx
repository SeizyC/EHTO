"use client";

import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";

type DayStat = { date: string; pageviews: number; visitors: number };
type VisitorsData = { today: DayStat; yesterday: DayStat; daily7: DayStat[] };

// "07-08" → "07.08"
function shortDate(d: string): string {
  const [, m, day] = d.split("-");
  return `${m}.${day}`;
}

function DeltaBadge({ now, prev }: { now: number; prev: number }) {
  const diff = now - prev;
  if (prev === 0 && now === 0) return <span className="text-dim text-[11px]">–</span>;
  const pct = prev === 0 ? null : Math.round((diff / prev) * 100);
  const up = diff > 0;
  const flat = diff === 0;
  const color = flat ? "text-dim" : up ? "text-emerald-400" : "text-rose-400";
  const sign = up ? "▲" : flat ? "–" : "▼";
  return (
    <span className={`${color} text-[11px] tabular-nums`}>
      {sign} {Math.abs(diff).toLocaleString()}
      {pct !== null && ` (${up ? "+" : ""}${pct}%)`}
    </span>
  );
}

export default function VisitorsPage() {
  const [data, setData] = useState<VisitorsData | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = browserClient();
    const { data: sess } = await sb.auth.getSession();
    if (!sess.session) return;
    const r = await fetch("/api/admin/visitors", {
      headers: { Authorization: `Bearer ${sess.session.access_token}` },
    });
    const j = await r.json();
    if (!r.ok) { setErr(j.error ?? "불러오기 실패"); return; }
    setData(j as VisitorsData);
  }, []);

  useEffect(() => { load(); }, [load]);

  const maxPv = data ? Math.max(1, ...data.daily7.map((d) => d.pageviews)) : 1;

  return (
    <div>
      <header className="mb-6 flex items-baseline justify-between">
        <div>
          <h2 className="text-ink text-[18px] font-medium">방문자</h2>
          <p className="text-sub mt-1 text-[12px]">어제 · 오늘 방문 현황 (KST 기준)</p>
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
      ) : (
        <div className="space-y-6">
          {/* Today vs Yesterday */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DayCard title="오늘" stat={data.today} prev={data.yesterday} highlight />
            <DayCard title="어제" stat={data.yesterday} />
          </div>

          {/* 7-day trend */}
          <div className="border-line bg-surface rounded-lg border p-4">
            <h3 className="text-ink mb-3 text-[13px] font-medium">최근 7일</h3>
            <ul className="space-y-2">
              {data.daily7.slice().reverse().map((d) => (
                <li key={d.date} className="flex items-center gap-3">
                  <span className="text-dim w-10 shrink-0 text-[11px] tabular-nums">{shortDate(d.date)}</span>
                  <div className="bg-line/40 relative h-4 flex-1 overflow-hidden rounded">
                    <div
                      className="bg-accent/70 h-full rounded"
                      style={{ width: `${(d.pageviews / maxPv) * 100}%` }}
                    />
                  </div>
                  <span className="text-ink w-12 shrink-0 text-right text-[12px] tabular-nums">{d.pageviews.toLocaleString()}</span>
                  <span className="text-dim w-14 shrink-0 text-right text-[11px] tabular-nums">방문자 {d.visitors.toLocaleString()}</span>
                </li>
              ))}
            </ul>
            <p className="text-dim mt-3 text-[10.5px]">
              막대 = 방문(페이지뷰) · &quot;방문자&quot; = 로그인 순방문자(고유). 익명 방문은 페이지뷰로만 집계됩니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function DayCard({
  title, stat, prev, highlight,
}: {
  title: string;
  stat: DayStat;
  prev?: DayStat;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-lg border p-4 ${highlight ? "border-accent/40 bg-accent/5" : "border-line bg-surface"}`}>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sub text-[12px]">{title}</span>
        <span className="text-dim text-[10.5px] tabular-nums">{shortDate(stat.date)}</span>
      </div>
      <div className="flex items-end gap-1.5">
        <span className="text-ink text-[32px] font-medium leading-none tabular-nums">{stat.pageviews.toLocaleString()}</span>
        <span className="text-sub mb-0.5 text-[12px]">방문</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-sub text-[12px]">순방문자 {stat.visitors.toLocaleString()}</span>
        {prev && <DeltaBadge now={stat.pageviews} prev={prev.pageviews} />}
      </div>
    </div>
  );
}
