"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { browserClient } from "@/lib/supabase";
import type { ObjectType } from "@/lib/object-catalog";

const CARD_PX = 160;

export default function AdminObjectsPage() {
  const [types, setTypes] = useState<ObjectType[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

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
        <div className="flex items-center gap-2">
          <span className="text-dim text-[11px] tabular-nums">
            {types?.length ?? "—"}종
          </span>
          <button
            onClick={() => setAdding(true)}
            className="border-line text-sub hover:text-ink rounded-md border px-3 py-1.5 text-[12px] transition"
            aria-label="오브제 추가"
          >＋ 오브제 추가</button>
        </div>
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
            <ObjectCard key={t.id} type={t} onDelete={load} />
          ))}
        </div>
      )}

      {adding && <AddObjectModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </div>
  );
}

function ObjectCard({ type: t, onDelete }: { type: ObjectType; onDelete?: () => void }) {
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
        {t.origin === "dynamic" && (
          <button
            onClick={async () => {
              if (!confirm(`"${t.labelKo}" 삭제?`)) return;
              const sb = browserClient();
              const { data } = await sb.auth.getSession();
              await fetch(`/api/admin/objects?id=${t.id}`, {
                method: "DELETE",
                headers: data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {},
              });
              onDelete?.();
            }}
            className="text-dim hover:text-accent mt-1 text-[10px] transition"
          >삭제</button>
        )}
      </div>
    </div>
  );
}

// Default render heights (% of plaza). Reference: character ≈12%, static
// fountain 24 / lamp 33 / tree 44. Conservative so curated objects don't dwarf
// the scene — fine-tune per object via the 높이% field.
const CATEGORIES: Array<{ key: "prop" | "landmark" | "building" | "sky" | "pet"; label: string; h: number }> = [
  { key: "prop", label: "소품", h: 13 },
  { key: "landmark", label: "랜드마크", h: 22 },
  { key: "building", label: "건물", h: 38 },
  { key: "sky", label: "하늘/공중", h: 10 },
  { key: "pet", label: "펫", h: 6 },
];

/** Strip gpt-image-1's occasional thin edge frame: clear a small transparent
 *  border ring via canvas. The object is centered with margin, so a ~6px ring
 *  (of a 1024px sprite) is imperceptible. Browser-only — runs before save. */
async function trimFrame(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0);
      const ring = Math.max(4, Math.round(img.width * 0.006));
      ctx.clearRect(0, 0, c.width, ring);
      ctx.clearRect(0, c.height - ring, c.width, ring);
      ctx.clearRect(0, 0, ring, c.height);
      ctx.clearRect(c.width - ring, 0, ring, c.height);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function AddObjectModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["key"]>("landmark");
  const [topic, setTopic] = useState("");
  const [desc, setDesc] = useState("");
  const [label, setLabel] = useState("");
  const [topics, setTopics] = useState("");
  const [height, setHeight] = useState(28);
  const [exemplar, setExemplar] = useState(true);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<"gen" | "save" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function authHeader(): Promise<Record<string, string>> {
    const sb = browserClient();
    const { data } = await sb.auth.getSession();
    return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
  }

  async function generate() {
    setBusy("gen"); setErr(null);
    try {
      const r = await fetch("/api/admin/objects/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({ category, topic: topic || undefined, description: desc || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "생성 실패");
      setDataUrl(await trimFrame(j.dataUrl)); setDesc(j.desc);
      if (!label) setLabel(j.label);
      if (!topics && topic) setTopics(topic);
    } catch (e) { setErr(e instanceof Error ? e.message : "생성 실패"); }
    finally { setBusy(null); }
  }

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setDataUrl(String(reader.result));
    reader.readAsDataURL(f);
  }

  async function save() {
    if (!dataUrl) { setErr("먼저 생성하거나 업로드하세요"); return; }
    setBusy("save"); setErr(null);
    try {
      // Trim again at save so a stale/pre-trim preview or an uploaded file with
      // a frame is cleaned too. The extra ring on an already-trimmed sprite is
      // a couple of imperceptible pixels.
      const finalUrl = await trimFrame(dataUrl);
      const r = await fetch("/api/admin/objects", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeader()) },
        body: JSON.stringify({
          label, category, nativeHeightPct: height,
          topics: topics.split(",").map((s) => s.trim()).filter(Boolean),
          genDescription: desc || null, isExemplar: exemplar, dataUrl: finalUrl,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "저장 실패");
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : "저장 실패"); }
    finally { setBusy(null); }
  }

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="fixed inset-0 z-50 bg-black/60 p-4 flex items-center justify-center">
        <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-surface border-line w-full max-w-[460px] max-h-[88dvh] overflow-y-auto no-scrollbar rounded-2xl border p-5">
          <h3 className="text-ink text-[15px] font-medium">오브제 추가</h3>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button key={c.key}
                onClick={() => { setCategory(c.key); setHeight(c.h); }}
                className={"rounded-md px-2.5 py-1 text-[12px] transition " +
                  (category === c.key ? "bg-accent text-bg" : "border-line text-sub border")}>{c.label}</button>
            ))}
          </div>

          <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="토픽 (예: 게임)"
            className="border-line bg-bg text-ink mt-3 w-full rounded-md border px-3 py-2 text-[13px]" />
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2}
            placeholder="영어 description (비우면 토픽으로 자동 생성)"
            className="border-line bg-bg text-ink mt-2 w-full rounded-md border px-3 py-2 text-[12px]" />

          <div className="mt-2 flex gap-2">
            <button onClick={generate} disabled={busy !== null}
              className="bg-accent text-bg rounded-md px-3 py-2 text-[12px] disabled:opacity-50">
              {busy === "gen" ? "생성 중…" : "생성/미리보기"}</button>
            <label className="border-line text-sub flex cursor-pointer items-center rounded-md border px-3 py-2 text-[12px]">
              업로드<input type="file" accept="image/png" onChange={onUpload} className="hidden" /></label>
          </div>

          <div className="mt-3 flex items-center justify-center rounded-lg" style={{ minHeight: 140, background: "#26222d" }}>
            {dataUrl
              ? /* eslint-disable-next-line @next/next/no-img-element */ (
                <img src={dataUrl} alt="" style={{ imageRendering: "pixelated", maxHeight: 132, maxWidth: 200, objectFit: "contain" }} />
              )
              : <span className="text-dim text-[11px]">미리보기 없음</span>}
          </div>

          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="한글 라벨"
            className="border-line bg-bg text-ink mt-3 w-full rounded-md border px-3 py-2 text-[13px]" />
          <input value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="토픽들 (쉼표로 구분)"
            className="border-line bg-bg text-ink mt-2 w-full rounded-md border px-3 py-2 text-[12px]" />
          <div className="mt-2 flex items-center gap-3">
            <label className="text-sub flex items-center gap-1.5 text-[12px]">높이%
              <input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))}
                className="border-line bg-bg text-ink w-16 rounded-md border px-2 py-1 text-[12px]" /></label>
            <label className="text-sub flex items-center gap-1.5 text-[12px]">
              <input type="checkbox" checked={exemplar} onChange={(e) => setExemplar(e.target.checked)} /> 가이드 예시로</label>
          </div>

          {err && <p className="text-accent mt-2 text-[12px]">{err}</p>}

          <div className="mt-4 flex justify-end gap-2">
            <button onClick={onClose} className="text-sub px-3 py-2 text-[12px]">취소</button>
            <button onClick={save} disabled={busy !== null || !dataUrl}
              className="bg-accent text-bg rounded-md px-4 py-2 text-[12px] disabled:opacity-50">
              {busy === "save" ? "저장 중…" : "저장"}</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
