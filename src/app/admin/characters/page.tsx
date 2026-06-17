"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";

type AiCharacter = {
  id: string;
  name: string;
  sprite: string;
  affinity: string[];
  speech_style: string | null;
  backstory: string | null;
  default_activity_weight: number;
  max_concurrent_rooms: number;
  active_rooms: number;
  created_at: string;
};

export default function CharactersPage() {
  const [chars, setChars] = useState<AiCharacter[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = browserClient();
    const { data: sess } = await sb.auth.getSession();
    if (!sess.session) return;
    const r = await fetch("/api/admin/ai-characters", {
      headers: { Authorization: `Bearer ${sess.session.access_token}` },
    });
    const j = await r.json();
    if (!r.ok) { setErr(j.error ?? "load failed"); return; }
    setChars(j.characters ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function regenSprite(id: string, opts?: { silent?: boolean }) {
    if (!opts?.silent) setBusyId(id);
    setErr(null);
    try {
      const sb = browserClient();
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) return;
      const r = await fetch(`/api/admin/ai-characters/${id}/sprite`, {
        method: "POST",
        headers: { Authorization: `Bearer ${sess.session.access_token}` },
      });
      const j = await r.json();
      if (!r.ok) {
        if (!opts?.silent) setErr(j.error ?? "regen failed");
        else throw new Error(j.error ?? "regen failed");
        return;
      }
      if (!opts?.silent) await load();
    } finally {
      if (!opts?.silent) setBusyId(null);
    }
  }

  // Surface anything that needs unique-face attention:
  //   (a) legacy hero PNG path (cycled placeholder), OR
  //   (b) any sprite URL appearing on 2+ ai_character rows.
  // (b) catches future drift where, say, an upload glitched and two
  // characters ended up with the same URL — without (b) we'd only ever
  // detect the original legacy set.
  const isLegacy = (s: string) => /\/sprites\/hero\/test_/.test(s);
  const allChars = chars ?? [];
  const spriteCounts = new Map<string, number>();
  for (const c of allChars) {
    spriteCounts.set(c.sprite, (spriteCounts.get(c.sprite) ?? 0) + 1);
  }
  const isShared = (s: string) => (spriteCounts.get(s) ?? 0) > 1;
  const needsAttention = (s: string) => isLegacy(s) || isShared(s);
  const placeholderChars = allChars.filter((c) => needsAttention(c.sprite));

  // Optional "issues only" filter so the admin can collapse the list to
  // exactly the rows that still need a unique sprite — useful when
  // scrolling 30+ characters and the eye misses badges.
  const [showOnlyIssues, setShowOnlyIssues] = useState(false);
  const visibleChars = showOnlyIssues ? placeholderChars : allChars;

  // Bulk regeneration state. Sequential rather than parallel to respect
  // OpenAI rate limits and keep one task in-flight at a time.
  const [bulk, setBulk] = useState<{ idx: number; total: number; name: string } | null>(null);
  const [bulkAbort, setBulkAbort] = useState(false);

  async function regenerateAllPlaceholders() {
    const queue = placeholderChars.slice();
    setBulkAbort(false);
    for (let i = 0; i < queue.length; i++) {
      if (bulkAbort) break;
      const c = queue[i];
      setBulk({ idx: i + 1, total: queue.length, name: c.name });
      try {
        await regenSprite(c.id, { silent: true });
      } catch { /* keep going on individual failure */ }
    }
    setBulk(null);
    await load();
    // If the bulk cleared every placeholder, drop the "공유 중만" filter
    // so the admin sees the full list (otherwise they're left staring
    // at an empty grid and have to remember to untoggle).
    setShowOnlyIssues(false);
  }

  return (
    <div>
      <header className="mb-4 flex items-baseline justify-between">
        <div>
          <h2 className="text-ink text-[18px] font-medium">AI 캐릭터</h2>
          <p className="text-sub mt-1 text-[12px]">
            전역 풀의 모든 멤버 원본. 스프라이트를 새로 생성하면 다음 방 seed
            부터 자동 적용되고, 이미 활성된 방의 캐릭터는 기존 스프라이트를
            유지합니다.
          </p>
        </div>
        <span className="text-dim text-[11px] tabular-nums">
          {chars?.length ?? "—"}명
        </span>
      </header>

      {placeholderChars.length > 0 && (
        <div className="border-line bg-surface mb-4 flex items-center justify-between gap-3 rounded-md border p-3">
          <div className="min-w-0">
            <p className="text-ink text-[12.5px]">
              스프라이트가 겹치거나 기본 이미지를 쓰는 캐릭터{" "}
              <span className="tabular-nums font-medium">{placeholderChars.length}명</span>
            </p>
            {bulk ? (
              <p className="text-sub mt-1 text-[11px] tabular-nums">
                {bulk.idx} / {bulk.total} — <span className="text-ink">{bulk.name}</span> 생성 중…
              </p>
            ) : (
              <p className="text-sub mt-1 text-[11px]">
                일괄 재생성: 약 {Math.ceil(placeholderChars.length * 0.7)}분 소요 예상
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setShowOnlyIssues((v) => !v)}
              className={
                "rounded-md border px-2.5 py-1 text-[11px] transition " +
                (showOnlyIssues
                  ? "border-ink bg-ink text-bg"
                  : "border-line text-sub hover:border-dim hover:text-ink")
              }
            >
              {showOnlyIssues ? "전체 보기" : "공유 중만"}
            </button>
            {bulk ? (
              <button
                type="button"
                onClick={() => setBulkAbort(true)}
                className="border-line hover:border-dim text-sub hover:text-ink rounded-md border px-2.5 py-1 text-[11px] transition"
              >
                중단
              </button>
            ) : (
              <button
                type="button"
                onClick={regenerateAllPlaceholders}
                className="bg-accent text-bg rounded-md px-2.5 py-1 text-[11px] font-medium transition hover:opacity-90"
              >
                일괄 재생성
              </button>
            )}
          </div>
        </div>
      )}


      <CreateForm onCreated={load} />


      {err && (
        <p className="text-accent mb-4 text-[12px]">{err}</p>
      )}



      {!chars ? (
        <p className="text-sub text-[12px]">불러오는 중…</p>
      ) : chars.length === 0 ? (
        <p className="text-sub text-[12px]">아직 캐릭터가 없어요.</p>
      ) : visibleChars.length === 0 ? (
        <p className="text-sub text-[12px]">공유 중인 캐릭터가 없어요. ✓</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visibleChars.map((c) => (
            <li
              key={c.id}
              className="border-line bg-surface flex items-stretch gap-3 rounded-lg border p-3"
            >
              <div className="border-line bg-bg flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border">
                {c.sprite ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.sprite}
                    alt={c.name}
                    className="pixelated h-full w-auto object-contain"
                    style={{ imageRendering: "pixelated" }}
                  />
                ) : (
                  <span className="text-dim text-[10px]">∅</span>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="flex min-w-0 items-baseline gap-1.5">
                    <span className="text-ink truncate text-[14px] font-medium">{c.name}</span>
                    {isLegacy(c.sprite) ? (
                      <span className="text-dim shrink-0 rounded border border-dim/40 px-1 text-[9px] leading-[14px]">
                        기본
                      </span>
                    ) : isShared(c.sprite) ? (
                      <span
                        className="shrink-0 rounded border px-1 text-[9px] leading-[14px]"
                        style={{ color: "#E89B6C", borderColor: "rgba(232,155,108,0.4)" }}
                        title={`이 sprite를 ${spriteCounts.get(c.sprite)}명이 공유 중`}
                      >
                        중복×{spriteCounts.get(c.sprite)}
                      </span>
                    ) : null}
                  </div>
                  <span className="text-dim shrink-0 text-[10.5px] tabular-nums">
                    {c.active_rooms}/{c.max_concurrent_rooms}방
                  </span>
                </div>
                {c.affinity.length > 0 && (
                  <p className="text-sub mt-1 truncate text-[11.5px]">
                    {c.affinity.join(" · ")}
                  </p>
                )}
                {c.backstory && (
                  <p className="text-dim mt-0.5 line-clamp-2 text-[11px] leading-tight">
                    {c.backstory}
                  </p>
                )}
                <div className="mt-auto flex items-center justify-between pt-2">
                  <span className="text-dim text-[10.5px] tabular-nums">
                    가중 {c.default_activity_weight.toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => regenSprite(c.id)}
                    disabled={busyId === c.id}
                    className="border-line hover:border-dim text-sub hover:text-ink rounded-md border px-2.5 py-1 text-[11px] transition disabled:opacity-50"
                  >
                    {busyId === c.id ? "생성 중…" : "스프라이트 재생성"}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateForm({ onCreated }: { onCreated: () => void | Promise<void> }) {
  const [name, setName] = useState("");
  const [affinity, setAffinity] = useState("");
  const [style, setStyle] = useState("");
  const [backstory, setBackstory] = useState("");
  const [weight, setWeight] = useState("0.4");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setErr(null);
    setBusy(true);
    try {
      const sb = browserClient();
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) return;
      const r = await fetch("/api/admin/ai-characters", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sess.session.access_token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          affinity: affinity.split(",").map((s) => s.trim()).filter(Boolean),
          speech_style: style.trim(),
          backstory: backstory.trim(),
          default_activity_weight: Number(weight) || 0.4,
        }),
      });
      const j = await r.json();
      if (!r.ok) { setErr(j.error ?? "fail"); return; }
      setName(""); setAffinity(""); setStyle(""); setBackstory(""); setWeight("0.4");
      setOpen(false);
      await onCreated();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-line text-sub hover:border-dim hover:text-ink mb-4 rounded-md border border-dashed px-3 py-2 text-[12px] transition"
      >
        + 새 캐릭터
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="border-line bg-surface mb-5 grid grid-cols-1 gap-2 rounded-lg border p-4 md:grid-cols-2"
    >
      <Input label="핸들 (예: 노을_kim)" value={name} onChange={setName} required />
      <Input label="가중치 (0~1)" value={weight} onChange={setWeight} />
      <Input
        label="관심·성향 (쉼표로 구분: 음악, 새벽, indie)"
        value={affinity}
        onChange={setAffinity}
        className="md:col-span-2"
      />
      <Input
        label="말투 (예: 조용 / 짧은 문장)"
        value={style}
        onChange={setStyle}
        className="md:col-span-2"
      />
      <Textarea
        label="배경 (한두 문장)"
        value={backstory}
        onChange={setBackstory}
        className="md:col-span-2"
      />
      {err && <p className="text-accent md:col-span-2 text-[11px]">{err}</p>}
      <div className="md:col-span-2 mt-1 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sub hover:text-ink rounded-md px-3 py-1.5 text-[12px]"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={busy}
          className="bg-accent text-bg rounded-md px-3 py-1.5 text-[12px] disabled:opacity-50"
        >
          {busy ? "만드는 중…" : "추가"}
        </button>
      </div>
    </form>
  );
}

function Input(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  className?: string;
}) {
  return (
    <label className={"flex flex-col gap-1 " + (props.className ?? "")}>
      <span className="text-sub text-[10.5px]">{props.label}</span>
      <input
        type="text"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        required={props.required}
        className="border-line bg-bg text-ink rounded-md border px-2.5 py-1.5 text-[12.5px]"
      />
    </label>
  );
}
function Textarea(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <label className={"flex flex-col gap-1 " + (props.className ?? "")}>
      <span className="text-sub text-[10.5px]">{props.label}</span>
      <textarea
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        rows={2}
        className="border-line bg-bg text-ink rounded-md border px-2.5 py-1.5 text-[12.5px] resize-y"
      />
    </label>
  );
}
