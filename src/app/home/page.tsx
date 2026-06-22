"use client";

// 광장 홈 — public plaza directory.
//
// Browse all opted-in public plazas. Tap a card to visit (read-only).
// "랜덤 방문" rolls to one at random for serendipity.
//
// Data: GET /api/plazas returns summary cards. No auth required.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase";
import { MeGlyph } from "@/components/MeGlyph";
import { EhtoBadge } from "@/components/EhtoBadge";
import { MeSheet } from "@/components/MeSheet";

type Plaza = {
  id: string;
  name: string;
  ageDays: number;
  tags: string[];
  /** True when this card is the requester's own plaza. Server prepends
   *  it as the first card (even if private). Used here for visual badge
   *  + routing the card to /world instead of the visitor /plaza/[id]. */
  mine?: boolean;
  isPublic: boolean;
  owner: { handle: string; online: boolean; sprite: string | null };
  memberCount: number;
  vitality: number;        // 1-5
  vibe: string;            // "지금은 조용" | "느슨한 흐름" | "이야기 무르익는 중" | "활발한 대화" | "북적이는 광장"
  biasLabel: string | null; // e.g. "BLACKPINK 팬덤"
  lastLine: string | null;
  hasMusic: boolean;       // shows the green music note icon when true
  music: { caption: string; url: string } | null;
};

export default function HomePage() {
  const [plazas, setPlazas] = useState<Plaza[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [meOpen, setMeOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Pass the session token (if any) so the API can surface the
      // requester's own plaza as the first card. Anonymous visitors
      // see only public plazas.
      const sb = browserClient();
      const { data: sess } = await sb.auth.getSession();
      const headers: HeadersInit = sess.session
        ? { Authorization: `Bearer ${sess.session.access_token}` }
        : {};
      try {
        const r = await fetch("/api/plazas", { headers });
        const j = await r.json();
        if (cancelled) return;
        setPlazas(j.plazas ?? []);
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : "fetch failed");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function randomVisit() {
    if (!plazas || plazas.length === 0) return;
    // Exclude the user's own plaza — "random VISIT" means somewhere new.
    const others = plazas.filter((p) => !p.mine);
    const pool = others.length > 0 ? others : plazas;
    const p = pool[Math.floor(Math.random() * pool.length)];
    router.push(`/plaza/${p.id}`);
  }

  return (
    <>
      <main className="grain bg-bg text-ink mx-auto min-h-dvh max-w-[1280px] px-5 pb-20 pt-6 lg:px-8">
        {/* Header — same nav primitives as /world for consistency:
            top-left identity, top-right me glyph (opens MeSheet for
            character/settings/logout). Without these the user had no
            way to reach their own profile from the directory. */}
        <header className="mb-6 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[22px] font-medium">광장 홈</h1>
            <p className="text-sub mt-1 text-[12px]">
              다른 사람의 광장을 둘러보세요
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <button
              type="button"
              onClick={randomVisit}
              disabled={!plazas || plazas.length === 0}
              aria-label="랜덤 방문"
              title="랜덤 방문"
              className="text-[26px] leading-none transition hover:opacity-100 opacity-90 disabled:opacity-40"
            >
              🎲
            </button>
            <Link
              href="/world"
              aria-label="내 광장"
              title="내 광장"
              className="text-[26px] leading-none transition hover:opacity-100 opacity-90"
            >
              🌐
            </Link>
            <EhtoBadge />
            <MeGlyph onOpen={() => setMeOpen(true)} />
          </div>
        </header>

        {err && <p className="text-accent text-[12px]">{err}</p>}

        {plazas === null && (
          <p className="text-dim text-[12px]">불러오는 중…</p>
        )}

        {plazas !== null && plazas.length === 0 && (
          <div className="border-line bg-surface/60 rounded-xl border p-6 text-center">
            <p className="text-ink text-[14px]">아직 공개된 광장이 없어요</p>
            <p className="text-sub mt-2 text-[12px]">
              내 광장에서 공개로 토글하면 여기 첫 광장이 됩니다
            </p>
          </div>
        )}

        {plazas !== null && plazas.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {plazas.map((p) => (
              <PlazaCard key={p.id} p={p} />
            ))}
          </div>
        )}
      </main>

      <MeSheet open={meOpen} onClose={() => setMeOpen(false)} />
    </>
  );
}

function PlazaCard({ p }: { p: Plaza }) {
  // Own-plaza card routes to /world (the owner's editable view) instead
  // of /plaza/[id] (the read-only visitor view). Visually marked with a
  // gold border + a small "내 광장" pill so it's obviously yours.
  const href = p.mine ? "/world" : `/plaza/${p.id}`;
  const borderClass = p.mine ? "border-gold/60" : "border-line";

  return (
    <Link
      href={href}
      className={`${borderClass} bg-surface hover:bg-panel/90 group relative flex gap-3 overflow-hidden rounded-xl border p-3.5 transition`}
    >
      {/* Owner avatar — upper-body crop. Replaces the old anonymous
          member sprite row; one face is more recognisable than a stack
          of strangers, and the avatar belongs to the person whose
          plaza this is. */}
      <div
        className="border-line bg-bg/60 relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border"
        aria-hidden
      >
        {p.owner.sprite ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={p.owner.sprite}
            alt=""
            className="pixelated absolute inset-0 h-[160%] w-[160%]"
            style={{
              imageRendering: "pixelated",
              // Upper-body crop: scale up + anchor near the head/torso
              // (~25% from top). Same trick as the member sprite ring
              // used before but tighter so the face fills the box.
              objectFit: "cover",
              objectPosition: "center 20%",
              left: "-30%",
              top: "-15%",
            }}
          />
        ) : (
          <div className="text-dim flex h-full w-full items-center justify-center text-[10px]">
            no avatar
          </div>
        )}
        {/* live dot — overlay on the avatar so it reads as "this owner
            is here right now". Mirrors the green presence dot used in
            messengers; not used on own-plaza card (the user IS live). */}
        {p.owner.online && !p.mine && (
          <span
            aria-label="방장 라이브"
            title="방장 라이브"
            className="absolute right-1 top-1 inline-block h-2 w-2 rounded-full ring-2 ring-[color:var(--surface,#1a1820)]"
            style={{ background: "#7CDFC0" }}
          />
        )}
      </div>

      {/* Right column: name / status / vibe / footer */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {/* name + mine badge */}
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-ink min-w-0 truncate text-[15.5px] font-medium leading-tight">
            {p.name}
          </h2>
          {p.mine ? (
            <span
              className="text-gold shrink-0 rounded-full border border-current px-1.5 py-[1px] text-[9.5px] leading-none"
              aria-label="내 광장"
            >
              내 광장
            </span>
          ) : (
            <span
              className="text-sub shrink-0 text-[10.5px]"
              title={`방장 ${p.owner.handle}`}
            >
              {p.owner.handle}
            </span>
          )}
        </div>

        {/* status pills row: live • bias • vibe • visibility (mine only) • music */}
        <div className="flex flex-wrap items-center gap-1.5">
          {p.owner.online && (
            <span
              className="inline-flex items-center gap-1 rounded-full border border-current px-1.5 py-[1px] text-[10px] leading-none"
              style={{ color: "#7CDFC0" }}
              title="방장이 지금 광장에 있음"
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 animate-pulse rounded-full"
                style={{ background: "#7CDFC0" }}
              />
              라이브
            </span>
          )}
          {p.biasLabel && (
            <span
              className="text-gold border-gold/40 rounded-full border bg-transparent px-1.5 py-[1px] text-[10px] leading-none"
              title="광장 테마"
            >
              {p.biasLabel}
            </span>
          )}
          <span
            className="text-sub border-line rounded-full border px-1.5 py-[1px] text-[10px] leading-none"
            title={`최근 60분 활기 ${p.vitality}/5`}
          >
            {p.vibe}
          </span>
          {/* Visibility — only meaningful on own card. Other plazas are
              always public in this directory, so showing 공개 there
              would be noise. */}
          {p.mine && (
            <span
              className={
                "border-line rounded-full border px-1.5 py-[1px] text-[10px] leading-none " +
                (p.isPublic ? "text-gold border-gold/40" : "text-sub")
              }
              title={p.isPublic ? "다른 사용자들이 방문할 수 있음" : "나만 보이는 광장"}
            >
              {p.isPublic ? "공개" : "비공개"}
            </span>
          )}
          {/* Music indicator — compact icon. Presence alone signals
              "누가 음악을 공유했음"; the title carries the track. */}
          {p.hasMusic && (
            <span
              aria-label="음악 공유됨"
              title={p.music?.caption ?? "음악 공유 중"}
              className="inline-flex items-center gap-1 rounded-full border px-1.5 py-[1px] text-[10px] leading-none"
              style={{ color: "#1DB954", borderColor: "#1DB95455" }}
            >
              <svg
                width="9"
                height="9"
                viewBox="0 0 16 16"
                fill="currentColor"
                aria-hidden
              >
                <path d="M13 2v9.18A3 3 0 1 0 14 13V4l-7 1.5V12.18A3 3 0 1 0 8 14V6.6L13 5.5V2z" />
              </svg>
              <span
                aria-hidden
                className="h-1 w-1 animate-pulse rounded-full"
                style={{ background: "#1DB954" }}
              />
            </span>
          )}
        </div>

        {/* topic preview — most recent line, kept short so the card
            reads as a vibe-check, not a transcript */}
        {p.lastLine && (
          <p className="text-sub line-clamp-1 text-[11.5px] leading-snug opacity-85">
            &ldquo;{p.lastLine}&rdquo;
          </p>
        )}

        {/* footer: age + member count (vitality is already conveyed by
            the vibe pill above — no need for the ⚡ dots row). */}
        <div className="mt-auto flex items-center justify-end pt-1">
          <span className="text-dim tabular-nums text-[10.5px]">
            Day {Math.max(1, p.ageDays + 1)} · {p.memberCount}명
          </span>
        </div>
      </div>
    </Link>
  );
}
