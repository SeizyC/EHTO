"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useWorld, updateWorldName, updateWorldSettings } from "@/lib/world-store";
import { worldAge } from "@/lib/age";
import { banMember, useMembers } from "@/lib/members-store";
import { CURATED_KPOP_ARTISTS, type WorldBias } from "@/lib/world-bias";
import { browserClient } from "@/lib/supabase";
import { LOCALES, LOCALE_LABEL, type Locale } from "@/lib/about-content";
import { InvitePanel } from "@/components/InvitePanel";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function RoomInfoSheet({ open, onClose }: Props) {
  const { world, refresh } = useWorld();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/55"
          />
          <motion.aside
            role="dialog"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="bg-surface fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] min-h-[55dvh] max-w-[420px] flex-col rounded-t-2xl pb-8 shadow-[0_-12px_40px_-8px_rgba(0,0,0,0.6)]"
          >
            <button onClick={onClose} aria-label="닫기" className="self-center pt-3">
              <span className="bg-line block h-1 w-12 rounded-full" />
            </button>

            <div className="overflow-y-auto px-6 pt-4">
              {/* Room Name — inline editable */}
              <section className="mb-6">
                <NameEditor initial={world?.name ?? null} onSaved={refresh} />
                {world?.createdAt && (
                  <p className="text-sub mt-2 text-[12px]">
                    {(() => {
                      const a = worldAge(new Date(world.createdAt).getTime());
                      return a.days === 0 ? "오늘 시작" : `${a.days}일째 · ${a.texture}`;
                    })()}
                  </p>
                )}
              </section>

              {/* 머무는 사람 — owner는 항상 +1 (본인). Dormant count
                  intentionally hidden — surprise of who arrives next. */}
              <section className="mb-6">
                <SectionLabel>머무는 사람</SectionLabel>
                <p className="text-ink mt-1 text-[13px]">
                  지금 {(world?.members.active ?? 0) + (world?.owner ? 1 : 0)}명 머무름
                </p>
              </section>

              {/* Owner-only: 공개 토글 + 태그 편집 */}
              {world?.owner && (
                <PublishSettings
                  isPublic={world.isPublic}
                  tags={world.tags ?? []}
                />
              )}

              {world?.owner && <InvitePanel open={open} />}

              {/* Owner-only: 세계 정체성 (bias). v1 supports K-pop +
                  artist; planted in the system prompt and as extra news
                  queries so the plaza's chatter tilts toward the theme. */}
              {world?.owner && <BiasSettings bias={world.bias ?? null} />}

              {/* Owner-only: 광장 언어. Single source of truth (worlds.language)
                  for native member generation, ambient + news language. */}
              {world?.owner && <LanguageSettings language={world.language} />}

              {/* Owner-only: implicit preference transparency panel.
                  Surfaces the top topics the system has captured from
                  the user's own chat + @-mentions, with a per-topic
                  mute button so they can correct misreads. */}
              {world?.owner && <ImplicitPanel open={open} />}

              {/* Owner-only: catalog-resolved object list. Dynamic
                  types get a [제거] button — static set is protected. */}
              {world?.owner && <PlazaObjectsPanel open={open} />}

              {/* 멤버 관리 — owner-only. Active members listed with an
                  expel button. Tapping it asks for confirmation, then
                  POSTs to /api/world/members/:id/ban which marks the
                  member status='banned' (excluded from ambient + plaza
                  + rotation refill) and drops a "X 님이 광장을 떠났어요"
                  system line into the feed. */}
              {world?.owner && <MemberManagement />}

              {/* Owner stats */}
              {world?.owner && (
                <section className="mb-6">
                  <SectionLabel>방장 통계</SectionLabel>
                  <div className="text-ink mt-2 grid grid-cols-2 gap-y-2 text-[13px]">
                    <span className="text-sub">오늘 방문</span>
                    <span className="tabular-nums">{world.visits.today}회</span>
                    <span className="text-sub">이번 주 방문</span>
                    <span className="tabular-nums">{world.visits.week}회</span>
                    <span className="text-sub">누적 방문</span>
                    <span className="tabular-nums">{world.visits.total ?? 0}회</span>
                    <span className="text-sub">현재 멤버</span>
                    <span className="tabular-nums">
                      {(world.members.active ?? 0) + (world.owner ? 1 : 0)}명
                    </span>
                  </div>
                </section>
              )}

              {/* History */}
              {world?.history && world.history.length > 0 && (
                <section className="mb-6">
                  <SectionLabel>이름 변경 이력</SectionLabel>
                  <ul className="border-line mt-2 divide-y divide-[#2A2530]">
                    {world.history.map((h, i) => (
                      <li
                        key={i}
                        className="flex items-baseline justify-between py-2.5"
                      >
                        <span className="text-ink text-[13px]">{h.name}</span>
                        <span className="text-dim text-[10.5px] tabular-nums">
                          {fmtDate(h.set_at)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-sub text-[10px] uppercase tracking-[0.22em]">
      {children}
    </div>
  );
}

function PublishSettings({ isPublic, tags }: { isPublic: boolean; tags: string[] }) {
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [editingTags, setEditingTags] = useState(false);

  async function toggleVisibility() {
    setSaving(true);
    setErr(null);
    const { error } = await updateWorldSettings({ isPublic: !isPublic });
    setSaving(false);
    if (error) setErr(error);
  }

  async function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    if (tags.includes(t)) { setTagInput(""); return; }
    if (tags.length >= 3) { setErr("최대 3개 태그"); return; }
    setSaving(true);
    setErr(null);
    const { error } = await updateWorldSettings({ tags: [...tags, t] });
    setSaving(false);
    if (error) { setErr(error); return; }
    setTagInput("");
  }

  async function removeTag(t: string) {
    setSaving(true);
    setErr(null);
    const { error } = await updateWorldSettings({ tags: tags.filter((x) => x !== t) });
    setSaving(false);
    if (error) setErr(error);
  }

  return (
    <section className="mb-6">
      <SectionLabel>광장 공개</SectionLabel>

      {/* visibility toggle row */}
      <div className="mt-2 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-ink text-[13px]">
            {isPublic ? "공개 광장" : "비공개 광장"}
          </span>
          <span className="text-sub text-[10.5px]">
            {isPublic
              ? "광장 홈에 노출 · 누구나 읽기 전용 방문"
              : "나만 들어올 수 있음"}
          </span>
        </div>
        <button
          type="button"
          onClick={toggleVisibility}
          disabled={saving}
          role="switch"
          aria-checked={isPublic}
          className="relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50"
          style={{
            background: isPublic ? "#7CDFC0" : "#2A2530",
          }}
        >
          <span
            className="absolute top-0.5 h-5 w-5 rounded-full transition-all"
            style={{
              background: "#ECE4DE",
              left: isPublic ? 22 : 2,
            }}
          />
        </button>
      </div>

      {/* tags section — only meaningful when public */}
      <div className="mt-4">
        <div className="text-sub text-[10.5px] flex items-center justify-between">
          <span>태그 (최대 3개)</span>
          {!editingTags && tags.length < 3 && (
            <button
              type="button"
              onClick={() => setEditingTags(true)}
              className="text-sub hover:text-ink text-[10.5px] transition"
            >
              + 추가
            </button>
          )}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="border-line text-ink inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-[11px]"
            >
              {t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                disabled={saving}
                aria-label={`${t} 삭제`}
                className="text-dim hover:text-accent text-[10px] leading-none transition"
              >
                ×
              </button>
            </span>
          ))}
          {editingTags && (
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); addTag(); }
                if (e.key === "Escape") { setEditingTags(false); setTagInput(""); }
              }}
              onBlur={() => {
                if (tagInput.trim()) addTag();
                else setEditingTags(false);
              }}
              autoFocus
              maxLength={12}
              placeholder="태그…"
              className="border-line bg-bg text-ink placeholder:text-dim rounded-full border px-2 py-[2px] text-[11px] outline-none"
              style={{ width: 80 }}
            />
          )}
          {tags.length === 0 && !editingTags && (
            <span className="text-dim text-[10.5px]">태그 없음</span>
          )}
        </div>
      </div>

      {err && <p className="text-accent mt-2 text-[11px]">{err}</p>}
    </section>
  );
}

function BiasSettings({ bias }: { bias: WorldBias | null }) {
  const enabled = bias?.kind === "kpop";
  const currentArtist = bias?.kind === "kpop" ? bias.artist : "";
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(currentArtist);

  useEffect(() => {
    if (!editing) setDraft(currentArtist);
  }, [currentArtist, editing]);

  async function toggle() {
    setSaving(true);
    setErr(null);
    const next: WorldBias | null = enabled
      ? null
      : { kind: "kpop", artist: currentArtist || "" };
    const { error } = await updateWorldSettings({ bias: next });
    setSaving(false);
    if (error) setErr(error);
  }

  async function setArtist(name: string) {
    const a = name.trim();
    setSaving(true);
    setErr(null);
    const { error } = await updateWorldSettings({ bias: { kind: "kpop", artist: a } });
    setSaving(false);
    if (error) { setErr(error); return; }
    setEditing(false);
  }

  return (
    <section className="mb-6">
      <SectionLabel>세계 정체성</SectionLabel>

      <div className="mt-2 flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-ink text-[13px]">
            {enabled ? "K-pop 팬덤 광장" : "테마 없음"}
          </span>
          <span className="text-sub text-[10.5px]">
            {enabled
              ? "관련 뉴스와 화제가 자연스럽게 더 자주 흐름"
              : "기본 — 모든 일상 화제 균등"}
          </span>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={saving}
          role="switch"
          aria-checked={enabled}
          className="relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50"
          style={{ background: enabled ? "#E89B6C" : "#2A2530" }}
        >
          <span
            className="absolute top-0.5 h-5 w-5 rounded-full transition-all"
            style={{ background: "#ECE4DE", left: enabled ? 22 : 2 }}
          />
        </button>
      </div>

      {enabled && (
        <div className="mt-4">
          <div className="text-sub text-[10.5px]">아티스트</div>
          <div className="mt-1.5">
            {!editing ? (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="border-line bg-bg text-ink hover:bg-panel inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-[12.5px] transition"
              >
                <span>{currentArtist || "선택 안 됨"}</span>
                <span className="text-sub text-[11px]">✎</span>
              </button>
            ) : (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); setArtist(draft); }
                    if (e.key === "Escape") { setEditing(false); setDraft(currentArtist); }
                  }}
                  autoFocus
                  maxLength={40}
                  placeholder="아티스트 이름 (예: NewJeans)"
                  className="border-line bg-bg text-ink placeholder:text-dim rounded-md border px-3 py-2 text-[13px] outline-none"
                />
                <div className="flex flex-wrap gap-1.5">
                  {CURATED_KPOP_ARTISTS.map((a) => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setArtist(a)}
                      disabled={saving}
                      className={
                        "border-line rounded-full border px-2 py-[2px] text-[11px] transition disabled:opacity-50 " +
                        (a === draft ? "bg-accent text-ink" : "text-sub hover:text-ink hover:bg-panel")
                      }
                    >
                      {a}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setArtist(draft)}
                    disabled={saving || !draft.trim()}
                    className="rounded-md px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
                    style={{ background: "#E89B6C", color: "#1A1720" }}
                  >
                    {saving ? "저장 중…" : "저장"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditing(false); setDraft(currentArtist); }}
                    disabled={saving}
                    className="text-sub hover:text-ink rounded-md px-2.5 py-1 text-[11px] transition"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {err && <p className="text-accent mt-2 text-[11px]">{err}</p>}
    </section>
  );
}

function LanguageSettings({ language }: { language: Locale }) {
  const [saving, setSaving] = useState<Locale | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function pick(next: Locale) {
    if (next === language || saving) return;
    setSaving(next);
    setErr(null);
    const { error } = await updateWorldSettings({ language: next });
    setSaving(null);
    if (error) setErr(error);
  }

  return (
    <section className="mb-6">
      <SectionLabel>광장 언어</SectionLabel>
      <p className="text-sub mt-1 text-[10.5px]">
        머무는 사람들과 흐르는 화제의 언어
      </p>
      <div
        role="group"
        aria-label="광장 언어"
        className="mt-2.5 flex flex-wrap gap-1.5"
      >
        {LOCALES.map((l) => {
          const active = l === language;
          return (
            <button
              key={l}
              type="button"
              onClick={() => pick(l)}
              disabled={saving !== null}
              aria-pressed={active}
              className={
                "rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition disabled:opacity-50 " +
                (active
                  ? "border-ink bg-ink text-bg"
                  : "border-line text-sub hover:border-dim hover:bg-panel")
              }
            >
              {LOCALE_LABEL[l]}
            </button>
          );
        })}
      </div>
      {err && <p className="text-accent mt-2 text-[11px]">{err}</p>}
    </section>
  );
}

function MemberManagement() {
  const members = useMembers();
  const visible = members.filter(
    (m) => m.activity_weight >= 0.3 && m.status !== "ghost" && m.status !== "banned",
  );
  // Collapsed by default — the row count + a caret. Tap to expand the
  // member list with avatars + ban buttons. This keeps RoomInfoSheet
  // visually quiet on first open (most visits won't need to manage
  // members), while the management UI is one tap away when needed.
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);  // member id awaiting confirm
  const [working, setWorking] = useState<string | null>(null);  // member id mid-request
  const [err, setErr] = useState<string | null>(null);

  if (visible.length === 0) return null;

  async function confirmBan(id: string) {
    setWorking(id);
    setErr(null);
    const res = await banMember(id);
    setWorking(null);
    if (!res.ok) {
      setErr(res.error ?? "추방 실패");
      return;
    }
    setPending(null);
  }

  return (
    <section className="mb-6">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (open) { setPending(null); setErr(null); }
        }}
        aria-expanded={open}
        className="hover:opacity-90 group flex w-full items-center justify-between text-left transition"
      >
        <div className="flex items-baseline gap-2">
          <SectionLabel>멤버 관리</SectionLabel>
          <span className="text-dim tabular-nums text-[10px]">{visible.length}</span>
        </div>
        <span
          className="text-sub group-hover:text-ink text-[11px] transition"
          style={{
            display: "inline-block",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            transformOrigin: "center",
            transition: "transform 0.18s ease-out",
          }}
          aria-hidden
        >
          ›
        </span>
      </button>
      {open && (
        <>
          <ul className="border-line mt-2 divide-y divide-[#2A2530]">
            {visible.map((m) => (
              <li key={m.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.persona.sprite}
                    alt=""
                    className="pixelated h-7 w-7 shrink-0 rounded-md object-contain"
                    style={{ imageRendering: "pixelated" }}
                  />
                  <span className="text-ink truncate text-[13px]">{m.name}</span>
                </div>
                {pending === m.id ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => confirmBan(m.id)}
                      disabled={working === m.id}
                      className="rounded-md px-2 py-1 text-[11px] font-medium disabled:opacity-50"
                      style={{ background: "#A66F4F", color: "#ECE4DE" }}
                    >
                      {working === m.id ? "처리 중…" : "확인"}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPending(null); setErr(null); }}
                      disabled={working === m.id}
                      className="text-sub hover:text-ink rounded-md px-2 py-1 text-[11px] transition disabled:opacity-50"
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPending(m.id)}
                    aria-label={`${m.name} 추방`}
                    className="text-dim hover:text-accent rounded-md px-2 py-1 text-[11px] transition"
                  >
                    추방
                  </button>
                )}
              </li>
            ))}
          </ul>
          {err && <p className="text-accent mt-2 text-[11px]">{err}</p>}
          {pending && (
            <p className="text-sub mt-2 text-[10.5px]">
              확인을 누르면 광장에서 영구 제외됩니다. 메시지 히스토리는 유지돼요.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function NameEditor({ initial, onSaved }: { initial: string | null; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setValue(initial ?? "");
  }, [initial, editing]);

  async function commit() {
    const v = value.trim();
    if (!v) { setEditing(false); setValue(initial ?? ""); return; }
    if (v.length > 16) { setErr("16자 이내"); return; }
    if (v === initial) { setEditing(false); return; }
    setSaving(true); setErr(null);
    const { error } = await updateWorldName(v);
    setSaving(false);
    if (error) { setErr(error); return; }
    setEditing(false);
    onSaved();
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5">
        <input
          ref={ref}
          value={value}
          maxLength={16}
          disabled={saving}
          onChange={(e) => { setValue(e.target.value.slice(0, 16)); setErr(null); }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") { setEditing(false); setValue(initial ?? ""); }
          }}
          autoFocus
          placeholder="이 세계의 이름…"
          className="border-line bg-bg text-ink placeholder:text-dim w-full rounded-md border px-3 py-2 text-[18px] font-medium outline-none focus:border-accent"
        />
        <p className={["text-[10.5px]", err ? "text-accent" : "text-sub"].join(" ")}>
          {err ?? (saving ? "저장 중…" : "Enter로 저장 · Esc 취소")}
        </p>
      </div>
    );
  }

  return (
    <button
      onClick={() => { setEditing(true); queueMicrotask(() => ref.current?.focus()); }}
      className="group text-ink flex items-center gap-2 text-[20px] font-medium hover:opacity-90"
    >
      <span>{initial ?? <span className="text-sub font-normal">이름 없음</span>}</span>
      <span className="text-sub group-hover:text-ink text-[13px] transition">✎</span>
    </button>
  );
}

function ImplicitPanel({ open }: { open: boolean }) {
  type Topic = { topic: string; weight: number };
  const [topics, setTopics] = useState<Topic[] | null>(null);
  const [coldStart, setColdStart] = useState(false);
  const [muting, setMuting] = useState<string | null>(null);

  // Refetch every time the sheet opens so a fresh message → signal
  // capture round-trip shows up immediately.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const sb = browserClient();
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) return;
      try {
        const r = await fetch("/api/world/topics", {
          headers: { Authorization: `Bearer ${sess.session.access_token}` },
        });
        if (!r.ok) return;
        const j = await r.json() as { topics: Topic[]; coldStart: boolean };
        if (cancelled) return;
        setTopics(j.topics ?? []);
        setColdStart(!!j.coldStart);
      } catch { /* fail silent — panel just won't render data */ }
    })();
    return () => { cancelled = true; };
  }, [open]);

  async function mute(topic: string) {
    setMuting(topic);
    const sb = browserClient();
    const { data: sess } = await sb.auth.getSession();
    if (!sess.session) { setMuting(null); return; }
    try {
      const r = await fetch("/api/world/topics/mute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sess.session.access_token}`,
        },
        body: JSON.stringify({ topic }),
      });
      if (r.ok) {
        // Optimistic remove + drop into the same blank state the
        // server will return next time.
        setTopics((prev) => (prev ?? []).filter((t) => t.topic !== topic));
      }
    } finally {
      setMuting(null);
    }
  }

  if (topics === null) return null; // initial load, render nothing
  if (coldStart) {
    return (
      <section className="mb-6">
        <SectionLabel>광장이 자주 떠올리는 결</SectionLabel>
        <p className="text-sub mt-2 text-[12px] leading-relaxed">
          아직 광장이 결을 찾는 중이에요. 며칠 더 같이 보내면 자주
          떠오르는 키워드들이 여기 모입니다.
        </p>
      </section>
    );
  }
  if (topics.length === 0) {
    return (
      <section className="mb-6">
        <SectionLabel>광장이 자주 떠올리는 결</SectionLabel>
        <p className="text-sub mt-2 text-[12px] leading-relaxed">
          아직 잡힌 결이 없어요. 이야기가 쌓이면 여기에 자동으로 떠올라요.
        </p>
      </section>
    );
  }
  const maxWeight = Math.max(...topics.map((t) => t.weight));
  return (
    <section className="mb-6">
      <SectionLabel>광장이 자주 떠올리는 결</SectionLabel>
      <ul className="mt-2 flex flex-col gap-2">
        {topics.map((t) => {
          const pct = maxWeight > 0 ? Math.round((t.weight / maxWeight) * 100) : 0;
          return (
            <li key={t.topic} className="flex items-center gap-2">
              <span className="text-ink min-w-[64px] truncate text-[12.5px]">
                {t.topic}
              </span>
              <span className="border-line bg-bg/40 relative h-2 flex-1 overflow-hidden rounded-full border">
                <span
                  className="bg-gold absolute inset-y-0 left-0 rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </span>
              <button
                type="button"
                onClick={() => mute(t.topic)}
                disabled={muting === t.topic}
                aria-label={`${t.topic} 거부`}
                title="이 결은 안 맞아"
                className="text-sub hover:text-ink shrink-0 rounded-md px-1.5 py-0.5 text-[12px] transition disabled:opacity-40"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-sub mt-3 text-[11px] leading-relaxed">
        광장에서 한 얘기를 보고 자동으로 잡힌 결이에요. 안 맞으면 X 누르세요.
      </p>
    </section>
  );
}

function PlazaObjectsPanel({ open }: { open: boolean }) {
  type ObjItem = {
    typeId: string | null;
    typeKey: string;
    labelKo: string | null;
    origin: "static" | "dynamic";
    placements: number;     // how many of this type are placed
    variantIdxs: number[];  // which variants
  };
  const [items, setItems] = useState<ObjItem[] | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const sb = browserClient();
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) return;
      try {
        // Re-uses the enriched /api/world/objects payload — same
        // shape PlazaCanvas consumes — so the panel and the canvas
        // stay in sync without an extra endpoint.
        const r = await fetch("/api/world/objects", {
          headers: { Authorization: `Bearer ${sess.session.access_token}` },
        });
        if (!r.ok) return;
        const j = await r.json() as { objects: Array<{
          typeId: string | null; type: string; labelKo: string | null;
          variantId: string | null;
        }> };
        if (cancelled) return;
        // Group by typeId. variantIdxs is fetched separately if we
        // want exact "v1/v2" — for the panel a count is enough.
        const byType = new Map<string, ObjItem>();
        for (const o of j.objects ?? []) {
          const key = o.typeId ?? `legacy:${o.type}`;
          const cur = byType.get(key) ?? {
            typeId: o.typeId,
            typeKey: o.type,
            labelKo: o.labelKo,
            // Until origin is in the API response we infer: anything
            // with typeKey starting "dyn_" is dynamic; everything else
            // (the legacy static set + future static additions) is
            // protected. Cheap, no extra round-trip.
            origin: (o.type ?? "").startsWith("dyn_") ? "dynamic" : "static",
            placements: 0,
            variantIdxs: [],
          };
          cur.placements += 1;
          byType.set(key, cur);
        }
        setItems(Array.from(byType.values())
          .sort((a, b) => Number(a.origin === "static") - Number(b.origin === "static")));
      } catch { /* fail silent */ }
    })();
    return () => { cancelled = true; };
  }, [open]);

  async function remove(typeId: string | null) {
    if (!typeId) return;
    const ok = window.confirm("이 결의 오브제를 광장에서 모두 빼고, 같은 결이 다시 안 나오게 할까요?");
    if (!ok) return;
    setRemoving(typeId);
    try {
      const sb = browserClient();
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) return;
      const r = await fetch(`/api/world/objects/types/${typeId}/mute`, {
        method: "POST",
        headers: { Authorization: `Bearer ${sess.session.access_token}` },
      });
      if (r.ok) {
        setItems((prev) => (prev ?? []).filter((p) => p.typeId !== typeId));
      }
    } finally {
      setRemoving(null);
    }
  }

  if (items === null) return null;
  if (items.length === 0) {
    return (
      <section className="mb-6">
        <SectionLabel>광장 오브제</SectionLabel>
        <p className="text-sub mt-2 text-[12px]">광장에 아직 오브제가 없어요.</p>
      </section>
    );
  }

  return (
    <section className="mb-6">
      <SectionLabel>광장 오브제</SectionLabel>
      <ul className="mt-2 flex flex-col gap-1.5">
        {items.map((it) => (
          <li key={(it.typeId ?? it.typeKey) + ":" + it.origin} className="flex items-center gap-2">
            <span className="text-ink min-w-[80px] truncate text-[12.5px]">
              {it.labelKo ?? it.typeKey}
            </span>
            <span className="text-sub flex-1 text-[11.5px]">
              {it.placements}개
            </span>
            {it.origin === "dynamic" && it.typeId && (
              <button
                type="button"
                onClick={() => remove(it.typeId)}
                disabled={removing === it.typeId}
                aria-label="이 결의 오브제 제거"
                className="text-sub hover:text-ink border-line rounded-md border px-2 py-0.5 text-[11.5px] transition disabled:opacity-40"
              >
                제거
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="text-sub mt-3 text-[11px] leading-relaxed">
        자동 추가된 결만 제거할 수 있어요. 제거하면 같은 결이 다시 안 나옵니다.
      </p>
    </section>
  );
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" });
  } catch { return iso; }
}
