"use client";

import { useCallback, useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";
import type { ObjectType } from "@/lib/object-catalog";

const CARD_PX = 160;

export default function AdminObjectsPage() {
  const [types, setTypes] = useState<ObjectType[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = browserClient();
    const { data: sess } = await sb.auth.getSession();
    if (!sess.session) return;
    const r = await fetch("/api/admin/objects", {
      headers: { Authorization: `Bearer ${sess.session.access_token}` },
    });
    const j = await r.json();
    if (!r.ok) { setErr(j.error ?? "불러오기 실패"); return; }
    // Sort: static first, then by typeKey alphabetically
    const sorted = (j.types as ObjectType[]).slice().sort((a, b) => {
      if (a.origin !== b.origin) return a.origin === "static" ? -1 : 1;
      return a.typeKey.localeCompare(b.typeKey);
    });
    setTypes(sorted);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <header className="mb-4 flex items-baseline justify-between">
        <div>
          <h2 className="text-ink text-[18px] font-medium">오브제 카탈로그</h2>
          <p className="text-sub mt-1 text-[12px]">
            DB에 등록된 모든 오브제 타입 · 스프라이트 · 메타데이터
          </p>
        </div>
        <span className="text-dim text-[11px] tabular-nums">
          {types?.length ?? "—"}종
        </span>
      </header>

      {err && (
        <p className="text-accent mb-4 text-[12px]">{err}</p>
      )}

      {!types ? (
        <p className="text-sub text-[12px]">불러오는 중…</p>
      ) : types.length === 0 ? (
        <p className="text-sub text-[12px]">등록된 오브제가 없어요.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {types.map((t) => (
            <ObjectCard key={t.id} type={t} />
          ))}
        </div>
      )}
    </div>
  );
}

function ObjectCard({ type: t }: { type: ObjectType }) {
  const firstVariant = t.variants[0] ?? null;

  return (
    <div className="border-line bg-surface overflow-hidden rounded-xl border">
      {/* Sprite area with checkerboard backdrop */}
      <div
        className="relative"
        style={{ height: CARD_PX }}
      >
        {/* Checkerboard reveals transparency */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(45deg, #1f1b25 25%, transparent 25%),
              linear-gradient(-45deg, #1f1b25 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #1f1b25 75%),
              linear-gradient(-45deg, transparent 75%, #1f1b25 75%)
            `,
            backgroundSize: "16px 16px",
            backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0",
            backgroundColor: "#26222d",
          }}
        />

        {t.variants.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-dim text-[11px]">스프라이트 없음</span>
          </div>
        ) : t.variants.length === 1 ? (
          /* Single variant: centered, fills the card area */
          <div className="absolute inset-0 flex items-end justify-center pb-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={firstVariant!.spriteUrl}
              alt={t.labelKo}
              style={{
                imageRendering: "pixelated",
                maxHeight: CARD_PX - 12,
                maxWidth: CARD_PX - 12,
                objectFit: "contain",
              }}
              draggable={false}
            />
          </div>
        ) : (
          /* Multiple variants: show all as a row of thumbnails */
          <div className="absolute inset-0 flex items-end justify-center gap-1 overflow-x-auto pb-2 px-1">
            {t.variants.map((v) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={v.id}
                src={v.spriteUrl}
                alt={`${t.labelKo} v${v.variantIdx}`}
                title={`v${v.variantIdx}`}
                style={{
                  imageRendering: "pixelated",
                  height: Math.floor((CARD_PX - 16) / Math.min(t.variants.length, 3)),
                  width: "auto",
                  objectFit: "contain",
                  flexShrink: 0,
                }}
                draggable={false}
              />
            ))}
          </div>
        )}

        {/* Variant count badge */}
        {t.variants.length > 1 && (
          <div
            className="absolute right-1.5 top-1.5 rounded border px-1 text-[9px] leading-[14px]"
            style={{
              background: "rgba(0,0,0,0.55)",
              borderColor: "rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.65)",
            }}
          >
            {t.variants.length}종
          </div>
        )}

        {/* Origin badge */}
        <div
          className="absolute left-1.5 top-1.5 rounded border px-1 text-[9px] leading-[14px]"
          style={{
            background: "rgba(0,0,0,0.55)",
            borderColor: t.origin === "dynamic" ? "rgba(232,155,108,0.5)" : "rgba(255,255,255,0.12)",
            color: t.origin === "dynamic" ? "#E89B6C" : "rgba(255,255,255,0.5)",
          }}
        >
          {t.origin === "dynamic" ? "다이나믹" : "정적"}
        </div>
      </div>

      {/* Meta strip */}
      <div className="px-3 py-2">
        <div className="flex items-baseline justify-between gap-1">
          <span className="text-ink truncate text-[13px] font-medium">{t.labelKo}</span>
          <span className="text-dim shrink-0 text-[10px] tabular-nums">{t.nativeHeightPct}%</span>
        </div>
        <div className="text-sub mt-0.5 flex items-center gap-1.5 text-[10.5px]">
          <span className="font-mono truncate">{t.typeKey}</span>
        </div>
        {t.topics.length > 0 && (
          <p className="text-dim mt-1 truncate text-[10px]">
            {t.topics.join(" · ")}
          </p>
        )}
        <div className="mt-1.5 flex items-center justify-between">
          <span className="text-dim text-[10px]">
            사용 <span className="tabular-nums font-medium text-sub">{t.usageCount}</span>회
          </span>
          {t.originTopic && (
            <span className="text-dim truncate text-[9.5px]">#{t.originTopic}</span>
          )}
        </div>
      </div>
    </div>
  );
}
