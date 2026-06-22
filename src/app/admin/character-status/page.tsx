"use client";

import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";

type Instance = {
  worldName: string;
  worldLanguage: string;
  memberName: string;
  status: string;
  activityWeight: number;
};

type CharacterStatus = {
  id: string;
  name: string;
  sprite: string;
  name_i18n: { ko?: string; en?: string; ja?: string } | null;
  maxConcurrentRooms: number;
  activeCount: number;
  instances: Instance[];
};

const LANG_FLAG: Record<string, string> = { ko: "KO", en: "EN", ja: "JA" };

function StatusBadge({ status }: { status: string }) {
  const isActive = status === "active";
  return (
    <span
      className={
        "shrink-0 rounded px-1.5 py-0.5 text-[10px] leading-none tabular-nums " +
        (isActive
          ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
          : "border-line bg-bg text-dim border text-[10px]")
      }
    >
      {status}
    </span>
  );
}

export default function CharacterStatusPage() {
  const [chars, setChars] = useState<CharacterStatus[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = browserClient();
    const { data: sess } = await sb.auth.getSession();
    if (!sess.session) return;
    const r = await fetch("/api/admin/character-status", {
      headers: { Authorization: `Bearer ${sess.session.access_token}` },
    });
    const j = await r.json();
    if (!r.ok) { setErr(j.error ?? "불러오기 실패"); return; }
    setChars(j.characters ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <header className="mb-5 flex items-baseline justify-between">
        <div>
          <h2 className="text-ink text-[18px] font-medium">캐릭터 현황</h2>
          <p className="text-sub mt-1 text-[12px]">
            원본 AI 캐릭터별 정규 이름(ko/en/ja)과 현재 투입된 광장 목록.
          </p>
        </div>
        <span className="text-dim text-[11px] tabular-nums">
          {chars === null ? "—" : `${chars.length}명`}
        </span>
      </header>

      {err && <p className="text-accent mb-4 text-[12px]">{err}</p>}

      {chars === null ? (
        <p className="text-sub text-[12px]">불러오는 중…</p>
      ) : chars.length === 0 ? (
        <p className="text-sub text-[12px]">등록된 캐릭터가 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {chars.map((c) => {
            const ko = c.name_i18n?.ko ?? c.name;
            const en = c.name_i18n?.en;
            const ja = c.name_i18n?.ja;

            const capacityFull = c.activeCount >= c.maxConcurrentRooms;

            return (
              <li
                key={c.id}
                className="border-line bg-surface rounded-lg border p-4"
              >
                {/* ── header row ── */}
                <div className="flex items-start gap-3">
                  {/* sprite */}
                  <div className="border-line bg-bg flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border">
                    {c.sprite ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.sprite}
                        alt={c.name}
                        className="h-full w-auto object-contain"
                        style={{ imageRendering: "pixelated" }}
                      />
                    ) : (
                      <span className="text-dim text-[10px]">∅</span>
                    )}
                  </div>

                  {/* names + capacity */}
                  <div className="min-w-0 flex-1">
                    {/* canonical names */}
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="text-ink text-[14.5px] font-medium leading-snug">{ko}</span>
                      {en && (
                        <span className="text-sub text-[12px]">{en}</span>
                      )}
                      {ja && (
                        <span className="text-sub text-[12px]">{ja}</span>
                      )}
                    </div>

                    {/* locale tags row */}
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(["ko", "en", "ja"] as const).map((lang) => {
                        const val = c.name_i18n?.[lang];
                        return (
                          <span
                            key={lang}
                            className={
                              "rounded border px-1 text-[9.5px] leading-[14px] tabular-nums " +
                              (val
                                ? "border-line text-sub"
                                : "border-line/40 text-dim opacity-40")
                            }
                          >
                            {LANG_FLAG[lang]}
                            {val ? ` · ${val}` : " · —"}
                          </span>
                        );
                      })}
                    </div>

                    {/* capacity */}
                    <p
                      className={
                        "mt-1.5 text-[11px] tabular-nums " +
                        (capacityFull ? "text-accent" : "text-sub")
                      }
                    >
                      투입{" "}
                      <span className="font-medium">{c.activeCount}</span>
                      <span className="text-dim">/{c.maxConcurrentRooms}</span>
                      {capacityFull && (
                        <span className="ml-1.5 text-[10px]">(한도 도달)</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* ── instances list ── */}
                <div className="mt-3">
                  {c.instances.length === 0 ? (
                    <p className="text-dim text-[11.5px]">투입 없음</p>
                  ) : (
                    <ul className="border-line divide-line divide-y rounded-md border">
                      {c.instances.map((inst, idx) => (
                        <li
                          key={idx}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
                        >
                          {/* world */}
                          <div className="flex min-w-0 items-baseline gap-1.5">
                            <span className="text-ink text-[12.5px] font-medium">
                              {inst.worldName}
                            </span>
                            <span className="text-dim text-[10px] tabular-nums">
                              ({inst.worldLanguage.toUpperCase()})
                            </span>
                          </div>

                          {/* member name in that world */}
                          <span className="text-sub text-[11.5px]">
                            as{" "}
                            <span className="text-ink">{inst.memberName}</span>
                          </span>

                          <div className="ml-auto flex items-center gap-2">
                            {/* activity weight */}
                            <span className="text-dim text-[10.5px] tabular-nums">
                              가중 {inst.activityWeight.toFixed(2)}
                            </span>
                            <StatusBadge status={inst.status} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
