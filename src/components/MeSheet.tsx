"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCharacter, saveHandle, clearCharacter } from "@/lib/character-store";
import { TicketWallet } from "@/components/TicketWallet";
import { worldAge } from "@/lib/age";
import { useSession } from "@/components/AuthProvider";
import { browserClient } from "@/lib/supabase";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function MeSheet({ open, onClose }: Props) {
  const character = useCharacter();
  const { signOut, user } = useSession();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [ehto, setEhto] = useState<number | null>(null);

  // Probe admin status once on open. Server-side ADMIN_EMAILS env is the
  // source of truth; we just ask /api/admin/me and show the entry point
  // if it answers `admin: true`.
  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      const sb = browserClient();
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) return;
      const r = await fetch("/api/admin/me", {
        headers: { Authorization: `Bearer ${sess.session.access_token}` },
      });
      if (cancelled) return;
      setIsAdmin(r.ok);
    })();
    return () => { cancelled = true; };
  }, [open, user]);

  // Fetch EHTO balance on open (best-effort; leaves null on failure).
  useEffect(() => {
    if (!open || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const sb = browserClient();
        const { data: sess } = await sb.auth.getSession();
        if (!sess.session) return;
        const r = await fetch("/api/ehto/balance", {
          headers: { Authorization: `Bearer ${sess.session.access_token}` },
        });
        if (cancelled || !r.ok) return;
        const j = await r.json();
        if (!cancelled) setEhto(j.balance);
      } catch { /* best-effort */ }
    })();
    return () => { cancelled = true; };
  }, [open, user]);

  async function handleSignOut() {
    onClose();
    await signOut();
    clearCharacter();
    router.replace("/login");
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/55"
          />
          <motion.aside
            role="dialog"
            aria-label="나"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="bg-surface fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] min-h-[60dvh] max-w-[420px] flex-col rounded-t-2xl pb-8 shadow-[0_-12px_40px_-8px_rgba(0,0,0,0.6)]"
          >
            <button
              onClick={onClose}
              aria-label="닫기"
              className="self-center pt-3"
            >
              <span className="bg-line block h-1 w-12 rounded-full" />
            </button>

            <section className="spotlight relative flex flex-col items-center px-6 pb-4 pt-2">
              <div className="relative h-[180px] w-[140px]">
                {character?.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={character.imageUrl}
                    alt=""
                    className="pixelated animate-sway absolute inset-0 h-full w-full object-contain"
                    draggable={false}
                  />
                ) : (
                  <div className="text-dim flex h-full w-full items-center justify-center text-[12px]">
                    아직 모습 없음
                  </div>
                )}
              </div>
              {/* 세계 나이 + 머무름 결 — Lv 비교 압박 없는 시간 기록 */}
              {character?.createdAt && (
                <AgeStrip createdAt={character.createdAt} />
              )}
              {/* Handle (editable) */}
              <HandleEditor initial={character?.handle ?? null} />
              {/* Tickets — gold ticket icon + count. Gold reads as the
                  "earned currency" accent, distinct from the warm orange
                  used for primary actions. */}
              {(character?.tickets ?? 0) > 0 && (
                <span
                  className="mt-3 inline-flex items-center gap-1.5 text-[13px] tracking-wide"
                  style={{ color: "#E8C067" }}
                  aria-label={`티켓 ${character?.tickets}장`}
                >
                  <TicketIcon className="h-4 w-4" />
                  <span className="tabular-nums font-medium">
                    {character?.tickets}
                  </span>
                </span>
              )}
            </section>

            {/* Ticket wallet — owned tickets + spend (초대 / 이어서 보기) */}
            <TicketWallet />

            {/* EHTO balance */}
            {ehto !== null && (
              <div className="border-line flex items-center justify-between rounded-xl border px-4 py-3">
                <span className="text-sub text-[13px]">EHTO</span>
                <span className="text-ink text-[15px] font-semibold tabular-nums">◆ {ehto}</span>
              </div>
            )}

            {/* Menu — PRD §5.4 aligned */}
            <nav className="mt-6 flex flex-col px-6">
              <MenuRow href="/world" label="내 세계" onClick={onClose} />
              <MenuRow
                onClick={() => alert("곧 Plus에서 만나요.")}
                label="더 많은 친구들과 함께 하기"
                hint="최대 12명"
              />
              <MenuRow
                onClick={() => alert("V1.5 · 캐릭터 꾸미기 (옷/머리/장신구)")}
                label="캐릭터 꾸미기"
                hint="옷 · 머리 · 장신구"
              />
              <MenuRow
                onClick={() => alert("V1.5 · 세계 정체성 카드")}
                label="세계 정체성"
              />
              <MenuRow
                onClick={() => alert("V1.5 · 설정")}
                label="설정"
              />
              {isAdmin && (
                <MenuRow
                  href="/admin"
                  onClick={onClose}
                  label="관리자"
                  hint="AI 캐릭터 · 풀 관리"
                />
              )}
            </nav>

            <footer className="mt-auto flex flex-col gap-2 px-6 pt-6">
              {user?.email && (
                <p className="text-dim text-center text-[11px] leading-none">
                  {user.email}
                </p>
              )}
              <button
                onClick={handleSignOut}
                className="text-sub hover:text-ink w-full py-2 text-[13px] transition"
              >
                로그아웃
              </button>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// 세계 나이 + 머무름 결 strip — 비교/경쟁 없는 시간 표현
// Tiny perforated ticket glyph — matches the cozy/retro vibe of the rest
// of the UI without pulling in an icon library.
function TicketIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinejoin="round"
    >
      <path d="M2 5.5a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 14 5.5v.5a1.5 1.5 0 0 0 0 3v1A1.5 1.5 0 0 1 12.5 12h-9A1.5 1.5 0 0 1 2 10.5v-1a1.5 1.5 0 0 0 0-3v-1Z" />
      <path d="M6.2 5v6" strokeDasharray="1 1.4" />
    </svg>
  );
}

function AgeStrip({ createdAt }: { createdAt: number }) {
  const { days, texture } = worldAge(createdAt);
  return (
    <div className="mt-5 flex items-baseline gap-1.5 text-[12px]">
      <span className="text-ink tabular-nums font-medium">
        {days === 0 ? "오늘 도착" : `${days}일째`}
      </span>
      {days > 0 && (
        <>
          <span className="text-dim">·</span>
          <span className="text-sub">{texture}</span>
        </>
      )}
    </div>
  );
}

// Inline-editable handle. Tap the name → input. Enter or blur → save.
function HandleEditor({ initial }: { initial: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Sync external changes (e.g. after character store refresh).
  useEffect(() => {
    if (!editing) setValue(initial ?? "");
  }, [initial, editing]);

  function startEdit() {
    setEditing(true);
    setErr(null);
    queueMicrotask(() => inputRef.current?.focus());
  }

  async function commit() {
    const trimmed = value.trim();
    if (!trimmed) {
      // empty → cancel edit, no change
      setEditing(false);
      setValue(initial ?? "");
      return;
    }
    if (trimmed.length > 12) {
      setErr("12자 이내");
      return;
    }
    if (trimmed === initial) {
      setEditing(false);
      return;
    }
    setSaving(true);
    setErr(null);
    const { error } = await saveHandle(trimmed);
    setSaving(false);
    if (error) {
      setErr(
        error.toLowerCase().includes("duplicate")
          ? "이미 누군가 쓰고 있어요"
          : "지금은 저장이 어려워요",
      );
      return;
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="mt-7 flex flex-col items-center gap-1.5">
        <input
          ref={inputRef}
          type="text"
          value={value}
          maxLength={12}
          disabled={saving}
          onChange={(e) => {
            setValue(e.target.value.slice(0, 12));
            setErr(null);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setEditing(false);
              setValue(initial ?? "");
            }
          }}
          placeholder="이름…"
          className="border-line bg-bg text-ink placeholder:text-dim w-[160px] rounded-md border px-3 py-1.5 text-center text-[13px] outline-none focus:border-accent"
        />
        <p
          className={[
            "text-[10.5px]",
            err ? "text-accent" : "text-sub",
          ].join(" ")}
        >
          {err ?? (saving ? "저장 중…" : "Enter로 저장 · Esc 취소")}
        </p>
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      className="group text-ink hover:opacity-90 mt-3 flex items-center gap-2 text-[17px] font-medium transition"
      aria-label="이름 바꾸기"
    >
      <span>{initial ?? <span className="text-sub font-normal">이름 없음</span>}</span>
      <span className="text-sub group-hover:text-ink text-[12px] transition">✎</span>
    </button>
  );
}

function MenuRow(props: {
  href?: string;
  onClick?: () => void;
  label: string;
  hint?: string;
}) {
  const inner = (
    <>
      <span className="flex flex-col items-start gap-0.5">
        <span>{props.label}</span>
        {props.hint && (
          <span className="text-sub text-[11.5px]">{props.hint}</span>
        )}
      </span>
      <span className="text-sub group-active:text-ink text-[14px]">›</span>
    </>
  );
  const cls =
    "group border-line text-ink active:bg-panel flex items-center justify-between border-b py-4 text-[14px] transition";
  if (props.href) {
    return (
      <Link href={props.href} className={cls} onClick={props.onClick}>
        {inner}
      </Link>
    );
  }
  return (
    <button onClick={props.onClick} className={cls + " text-left"}>
      {inner}
    </button>
  );
}
