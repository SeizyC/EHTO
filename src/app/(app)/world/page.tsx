"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AmbientHeader } from "@/components/AmbientHeader";
import { EnergyMeter } from "@/components/EnergyMeter";
import { MeGlyph } from "@/components/MeGlyph";
import { EhtoBadge } from "@/components/EhtoBadge";
import { RandomPlazaDice } from "@/components/RandomPlazaDice";
import { PlazaCanvas, type PlazaCharacter } from "@/components/PlazaCanvas";
import { AmbientFeed } from "@/components/AmbientFeed";
import { Composer } from "@/components/Composer";
import { MeSheet } from "@/components/MeSheet";
import { RoomInfoSheet } from "@/components/RoomInfoSheet";
import { ParticipantList } from "@/components/ParticipantList";
import { HistorySheet } from "@/components/HistorySheet";
import { MusicShareStack } from "@/components/MusicShareStack";
import { useCharacter, loadCharacter } from "@/lib/character-store";
import { useSession } from "@/components/AuthProvider";
import { useMembers, refreshMembers, type Member } from "@/lib/members-store";
import { useWorld, updateMyPosition } from "@/lib/world-store";
import { usePlazaObjects, refreshPlazaObjects } from "@/lib/objects-store";
import { currentBucket } from "@/lib/time-of-day";
import { activeBubbleOf, dismissBubble, refreshChat, useChatMessages, useTyping } from "@/lib/chat-store";
import { useRequireSession } from "@/lib/use-require-session";
import { summonInComposer } from "@/lib/composer-store";
import { WelcomeDialog } from "@/components/WelcomeDialog";
import { ONBOARDING } from "@/lib/onboarding-content";
import { useLocale } from "@/lib/use-locale";
import { DEFAULT_LOCALE } from "@/lib/about-content";

// Plaza geometry — bg image floor band ≈ y 50 (back) to y 78 (front).
// User character default placement (~60%) before any persisted owner
// position is loaded. Once world.ownerPos arrives we follow that.
const ME_X = 50;
const ME_Y = 60;
// Plaza canvas dimensions. Stay on 3:2 so the 1536×1024 bg renders
// without distortion (object-cover just upscales). Sequence so far:
//   · 900×600 → 1200×800:  room for 10+ characters
//   · 1200×800 → 1500×1000 (2026-05-31): still felt cramped
//   · 1500×1000 → 2400×1600 (2026-05-31, evening): 30-member target.
//     Mobile scroll-area is already accepted by the user, so we lean
//     into a bigger absolute canvas + smaller CHARACTER_HEIGHT_PCT (9)
//     so each mini stays a reasonable pixel size while 30 of them have
//     real estate to spread.
const PLAZA_W = 2400;
const PLAZA_H = 1600;

// Mobile zoom steps + LS key — module-level so the useEffect dep array
// stays stable.
const ZOOM_STEPS = [0.5, 0.65, 0.8, 1.0, 1.2, 1.5];
const ZOOM_LS_KEY = "ehto:plaza-zoom:v1";

// "오늘"의 라벨은 KST-09:00 롤오버 기준이지만, 헤더 표시용으론 직관적
// 인 일반 달력 날짜를 쓴다 ("2026년 5월 20일 (수)" 식). 9시 전이라면
// 어제 날짜를 표시해 피드 콘텐츠와 일치시킴.
function todayDateLabel(): string {
  const now = new Date();
  const KST = new Date(now.getTime() + 9 * 3600_000);
  const hour = KST.getUTCHours();
  if (hour < 9) KST.setUTCDate(KST.getUTCDate() - 1);
  const m = KST.getUTCMonth() + 1;
  const d = KST.getUTCDate();
  const wd = ["일", "월", "화", "수", "목", "금", "토"][KST.getUTCDay()];
  return `${m}월 ${d}일 (${wd})`;
}

export default function WorldPage() {
  const auth = useRequireSession();
  const router = useRouter();

  const { locale } = useLocale(DEFAULT_LOCALE);
  const [welcome, setWelcome] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem("ehto:welcomed")) setWelcome(true);
    } catch { /* private mode — skip */ }
  }, []);

  // Users who landed here without ever finishing character creation (e.g.
  // signed up but bailed before naming) end up with no LS character and
  // no DB world — the plaza renders empty and looks "stuck". Route them
  // into the creation flow as soon as we can confirm both: session ready
  // and LS still has nothing after stores have had a tick to hydrate.
  useEffect(() => {
    if (auth.loading || !auth.session) return;
    const t = window.setTimeout(() => {
      if (!loadCharacter()) router.replace("/character");
    }, 250);
    return () => window.clearTimeout(t);
  }, [auth.loading, auth.session, router]);

  // Log one visit per mount (server dedupes 30-min sessions). Counts feed
  // RoomInfoSheet's "오늘/이번 주/누적 방문".
  useEffect(() => {
    if (auth.loading || !auth.session) return;
    fetch("/api/world/visit", {
      method: "POST",
      headers: { Authorization: `Bearer ${auth.session.access_token}` },
    }).catch(() => {});
  }, [auth.loading, auth.session]);

  const [meOpen, setMeOpen] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Admin-only entry points (e.g. the 🌐 plaza-home jump is hidden from regular
  // users for now). Lightweight probe; defaults to non-admin.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (auth.loading || !auth.session) return;
    let cancelled = false;
    fetch("/api/admin/me", { headers: { Authorization: `Bearer ${auth.session.access_token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.admin) setIsAdmin(true); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [auth.loading, auth.session]);

  // Mobile plaza zoom — controls the displayed pixel dimensions of
  // the canvas while keeping internal % coords unchanged. Steps tuned
  // so "full plaza fits viewport" lives near the low end and "detail
  // mode" lives at the high end. Persisted to LS so it survives
  // reloads.
  const [zoomIdx, setZoomIdx] = useState(1); // 0.65 default
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ZOOM_LS_KEY);
      if (raw === null) return;
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 0 && n < ZOOM_STEPS.length) setZoomIdx(n);
    } catch { /* ignore */ }
  }, []);
  const zoom = ZOOM_STEPS[zoomIdx];
  function setZoomStep(next: number) {
    const clamped = Math.max(0, Math.min(ZOOM_STEPS.length - 1, next));
    setZoomIdx(clamped);
    try { window.localStorage.setItem(ZOOM_LS_KEY, String(clamped)); } catch { /* ignore */ }
  }
  const me = useCharacter();
  const members = useMembers();
  const { world } = useWorld();
  const mood = currentBucket();
  const chat = useChatMessages();
  const meTyping = useTyping("me");

  // User character's current position. Derived from the persisted
  // ownerPos on the worlds row — every reload restores the spot the
  // user last clicked. handleFloorClick fires an optimistic update
  // through world-store, which re-emits ownerPos via the cached
  // _notify() and the avatar moves on the same tick as the click.
  const mePos = world?.ownerPos ?? { x: ME_X, y: ME_Y, flip: false };
  function handleFloorClick(x: number, y: number) {
    const flip = x < mePos.x - 0.5 ? true : x > mePos.x + 0.5 ? false : mePos.flip;
    void updateMyPosition(x, y, flip);
  }

  // Live plaza state from DB (placements). PlazaCanvas expects { objects }.
  const objects = usePlazaObjects();
  const state = { objects };

  // Assemble plaza characters straight from server-derived positions.
  // Position drift now lives in src/lib/position-drift.ts, called from
  // /api/world/members on each poll — the client just renders whatever
  // (x, y, flip) Supabase last persisted. Reloads restore the same
  // layout because the layout IS the DB state.
  const visibleMembers = members
    .filter((m) => m.activity_weight >= 0.3 && m.status !== "ghost");
  const characters: PlazaCharacter[] = visibleMembers.map((m) => ({
    id: m.id,
    src: m.persona.sprite,
    x: m.x,
    y: m.y,
    // Uniform size: owner and members read as equals.
    scale: 1,
    name: m.name,
    flip: m.flip,
  }));
  const nowMs = Date.now();
  for (const c of characters) {
    const b = activeBubbleOf(c.id, chat);
    if (b) {
      const typing = b.typingUntil != null && b.typingUntil > nowMs;
      c.bubble = {
        id: b.id,
        text: typing ? "..." : b.text,
        layoutId: typing ? undefined : `msg-${b.id}`,
        speakerName: c.name,
        createdAt: b.createdAt,
      };
    }
  }
  if (me?.imageUrl) {
    const myBubble = activeBubbleOf("me", chat);
    const myName = me.handle ?? "나";
    // While composing, the user's bubble shows "..." (overrides any prior
    // landed-bubble until they actually send). Once sent, the real text
    // takes over via the normal bubble path.
    const bubble = meTyping
      ? { id: "me-typing", text: "...", layoutId: undefined, speakerName: myName }
      : myBubble
        ? { id: myBubble.id, text: myBubble.text, layoutId: `msg-${myBubble.id}`, speakerName: myName }
        : undefined;
    characters.push({
      id: "me",
      src: me.imageUrl,
      x: mePos.x,
      y: mePos.y,
      scale: 1,
      name: myName,
      flip: mePos.flip,
      bubble,
    });
  }

  // Live state arrives via Supabase Realtime (subscribeMessages /
  // subscribeMembers, wired in their stores). This effect now serves two
  // narrower purposes:
  //   1. boot fetch — get the initial roster + transcript, and learn the
  //      worldId so the realtime channels can bind.
  //   2. poll — every 30s + on tab re-visibility, re-fetch in case we missed
  //      a websocket event (sleep/wake, network blip). 30s is also the
  //      ambient-tick cadence: paired with the engine's short-silence gate
  //      it targets ~1 ambient line / 30s so the room reads as alive on
  //      first impression (the tick is a cheap no-op when gated/exhausted).
  useEffect(() => {
    const tick = () => { refreshMembers(); refreshChat(); refreshPlazaObjects(); };
    tick();
    const id = window.setInterval(tick, 30_000);
    const onVis = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  // After plaza renders, center scroll on user's character anchor.
  // pcScrollerRef tracks the PC scroll container so the "center"
  // button can drive both viewports.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pcScrollerRef = useRef<HTMLDivElement | null>(null);

  /** Drop zoom to minimum and pan the visible scroll container to the
   *  plaza's geometric center. Cheap UI escape hatch when the user
   *  has zoomed/scrolled off into a corner. */
  function recenterPlaza() {
    setZoomStep(0); // 0.5×
    // The canvas dimensions update next paint. Two rAFs gives React
    // enough time to commit + the browser to apply layout before we
    // measure and scroll.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const z = ZOOM_STEPS[0];
        const cx = (PLAZA_W * z) / 2;
        const cy = (PLAZA_H * z) / 2;
        for (const ref of [scrollerRef, pcScrollerRef]) {
          const el = ref.current;
          if (!el) continue;
          el.scrollTo({
            left: Math.max(0, cx - el.clientWidth / 2),
            top: Math.max(0, cy - el.clientHeight / 2),
            behavior: "smooth",
          });
        }
      });
    });
  }
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      const userPxX = PLAZA_W * (ME_X / 100);
      const userPxY = PLAZA_H * (ME_Y / 100);
      el.scrollLeft = Math.max(0, userPxX - el.clientWidth / 2);
      el.scrollTop  = Math.max(0, userPxY - el.clientHeight / 2);
    });
    return () => cancelAnimationFrame(id);
  }, [me?.id]);

  // When a new speaker bubble appears, smooth-scroll the visible plaza
  // viewport so the speaker sits horizontally centered. Y stays put — the
  // floor band is already in view. Drives BOTH scrollers: the mobile one
  // (scrollerRef) and the PC one (pcScrollerRef). Whichever is hidden at
  // the current breakpoint reports clientWidth 0 and is skipped, so this
  // works on desktop (lg+) as well as mobile. Coordinates use the zoomed
  // canvas size (PLAZA_W * zoom) to match the scroll content's real width.
  const lastCenteredBubbleRef = useRef<string | null>(null);
  useEffect(() => {
    // Find the newest active bubble in chat.
    let newest: { id: string; fromCharId: string } | null = null;
    for (let i = chat.length - 1; i >= 0; i--) {
      if (chat[i].state === "bubble") {
        newest = { id: chat[i].id, fromCharId: chat[i].fromCharId };
        break;
      }
    }
    if (!newest) return;
    if (newest.id === lastCenteredBubbleRef.current) return;

    const speaker = characters.find((c) => c.id === newest!.fromCharId);
    if (!speaker) return;

    const targetX = PLAZA_W * zoom * (speaker.x / 100);
    let scrolled = false;
    for (const ref of [scrollerRef, pcScrollerRef]) {
      const el = ref.current;
      if (!el || el.clientWidth === 0) continue; // hidden viewport at this breakpoint
      el.scrollTo({ left: Math.max(0, targetX - el.clientWidth / 2), behavior: "smooth" });
      scrolled = true;
    }
    if (scrolled) lastCenteredBubbleRef.current = newest.id;
  }, [chat, characters, zoom]);

  // Header — same content on every breakpoint, factored once.
  const headerNode = (
    <header className="flex items-start justify-between px-5 pb-3 pt-5 lg:px-0">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRoomOpen(true)}
            className="group text-ink hover:opacity-90 flex items-center gap-1.5 text-[18px] font-medium leading-none transition"
            aria-label="방 정보"
          >
            {world?.name ? (
              <>
                <span>{world.name}</span>
                <span className="text-sub group-hover:text-ink text-[12px] transition">›</span>
              </>
            ) : world && !world.name ? (
              <>
                <span className="text-sub font-normal">이름 짓기</span>
                <span className="text-sub group-hover:text-ink text-[12px] transition">›</span>
              </>
            ) : (
              <span className="bg-line block h-[18px] w-28 animate-pulse rounded-md" />
            )}
          </button>
          <RandomPlazaDice />
        </div>
        <AmbientHeader mood={mood.label} onPeek={() => setRoomOpen(true)} />
      </div>
      <div className="flex items-center gap-4">
        <EnergyMeter />
        {isAdmin && (
          <a
            href="/home"
            aria-label="광장 홈"
            title="광장 홈 (관리자)"
            className="text-[26px] leading-none transition hover:opacity-100 opacity-90"
          >
            🌐
          </a>
        )}
        <EhtoBadge />
        <MeGlyph onOpen={() => setMeOpen(true)} />
      </div>
    </header>
  );

  return (
    <>
      <main
        className={
          "grain mx-auto flex min-h-dvh max-w-[420px] flex-col pb-[88px] " +
          // Wider on lg+ so the plaza canvas can breathe at PC widths.
          // 1280 → 1680 (with 220px sidebar) gives ~1430px to the plaza
          // column itself, which makes the iso floor read as a room
          // instead of a postcard.
          "md:max-w-[760px] lg:max-w-[1680px] lg:px-6 lg:pb-[96px]"
        }
      >
        {headerNode}

        {/* Two-column layout on PC:
              LEFT (flex-1): plaza + date/history + chat feed — everything
                              the user's eye follows top-to-bottom.
              RIGHT (260px): participant list — independent column so it's
                              never overlapped by the feed scrolling under it.
            On mobile the right column is hidden and the whole left column
            stacks naturally. */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {/* LEFT column ─────────────────────────────────────────────── */}
          <div className="lg:min-w-0 lg:flex-1">
            {/* Mobile plaza — swipeable iso world. */}
            <section className="relative lg:hidden">
              <div
                ref={scrollerRef}
                className="no-scrollbar overflow-auto"
                style={{
                  // Taller scroll area paired with the 2400×1600 canvas
                  // so mobile users actually see most of the plaza
                  // without constant panning.
                  height: "min(72dvh, 720px)",
                  WebkitOverflowScrolling: "touch",
                }}
              >
                <PlazaCanvas
                  state={state}
                  characters={characters}
                  // Mobile plaza is fixed 1200×800 inside a scroll
                  // container (3:2 ratio kept for bg image). PC plaza
                  // is fluid, typically rendering ~500-600px tall in
                  // the left column. Same 15% character height %
                  // produces ~120px chars on mobile vs ~80-90px on PC
                  // — visibly bigger on mobile. characterScale=0.65
                  // normalizes mobile to match PC absolute size.
                  characterScale={0.65}
                  onFloorClick={handleFloorClick}
                  onCharacterClick={(id) => {
                    // Tap-to-summon: drop "@{name} " in composer + focus.
                    if (id === "me") return;
                    const m = characters.find((c) => c.id === id);
                    if (m?.name) summonInComposer(m.name);
                  }}
                  onBubbleDismiss={(id) => dismissBubble(id)}
                  // Zoom: scales the displayed pixel size of the canvas
                  // while leaving internal % coords (and therefore the
                  // floor band + character placement) intact. Default
                  // 0.65 lets ~1/3 of plaza fit in viewport; +/- below
                  // lets the user trade overview for detail.
                  style={{
                    width: PLAZA_W * zoom,
                    height: PLAZA_H * zoom,
                    aspectRatio: "auto",
                  }}
                />
              </div>
              <div className="from-bg pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r to-transparent" />
              <div className="to-bg pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-r from-transparent" />
              {/* Music share stack — sits in plaza bottom-right.
                  Mobile: positioned over the scroll viewport so it stays
                  put while plaza scrolls underneath. */}
              <MusicShareStack />
            </section>

            {/* PC plaza — same fixed-pixel + scroll model as mobile so
                the zoom controls below behave identically across
                breakpoints. The scroll viewport caps at 80vh on PC so
                the page can still show the feed + composer without
                forcing the user to scroll past a giant plaza. */}
            <section className="relative hidden lg:block">
              <div
                ref={pcScrollerRef}
                className="border-line no-scrollbar relative overflow-auto rounded-xl border"
                style={{ height: "min(80vh, 880px)" }}
              >
                <PlazaCanvas
                  state={state}
                  characters={characters}
                  onFloorClick={handleFloorClick}
                  onCharacterClick={(id) => {
                    if (id === "me") return;
                    const m = characters.find((c) => c.id === id);
                    if (m?.name) summonInComposer(m.name);
                  }}
                  onBubbleDismiss={(id) => dismissBubble(id)}
                  style={{
                    width: PLAZA_W * zoom,
                    height: PLAZA_H * zoom,
                    aspectRatio: "auto",
                  }}
                />
                {/* PC: music stack inside the bordered plaza container. */}
                <MusicShareStack />
              </div>
            </section>

            {/* Zoom controls — shared between mobile and PC, sit just
                BELOW the plaza scroll container, right-aligned, so
                they don't overlap any in-canvas affordance (music
                stack, bubbles). */}
            <section className="flex justify-end px-5 pt-1 lg:px-0">
              <div className="border-line bg-surface/85 inline-flex overflow-hidden rounded-md border">
                <button
                  type="button"
                  onClick={recenterPlaza}
                  aria-label="중앙 정렬 및 최소 배율"
                  title="가운데로"
                  className="text-sub hover:text-ink inline-flex h-7 w-9 items-center justify-center text-[16px] leading-none transition"
                >
                  <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
                </button>
                <span className="bg-line w-px self-stretch" />
                <button
                  type="button"
                  onClick={() => setZoomStep(zoomIdx - 1)}
                  disabled={zoomIdx === 0}
                  aria-label="축소"
                  className="text-gold h-7 w-9 text-[14px] leading-none transition hover:opacity-80 disabled:opacity-30"
                >
                  −
                </button>
                <span className="bg-line w-px self-stretch" />
                <button
                  type="button"
                  onClick={() => setZoomStep(zoomIdx + 1)}
                  disabled={zoomIdx === ZOOM_STEPS.length - 1}
                  aria-label="확대"
                  className="text-gold h-7 w-9 text-[14px] leading-none transition hover:opacity-80 disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </section>

            {/* Feed header row — today's date + history icon. Both gold,
                both tappable: clicking either opens the history sheet. */}
            <div className="flex items-center justify-between px-5 pt-3 lg:px-0">
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                aria-label="히스토리"
                className="tabular-nums text-[12px] transition hover:opacity-80"
                style={{ color: "#E8C067" }}
              >
                {todayDateLabel()}
              </button>
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                aria-label="히스토리"
                className="p-1 transition hover:opacity-80"
                style={{ color: "#E8C067" }}
              >
                <svg
                  viewBox="0 0 16 16"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M2.5 5.2a6 6 0 1 1-.2 4.5" />
                  <path d="M2.2 2.5v2.7h2.7" />
                  <path d="M8 5v3.4l2 1.6" />
                </svg>
              </button>
            </div>

            {/* Ambient feed — stays inside the left column on PC so it
                can never extend under the right participant rail. */}
            <section className="px-5 pb-3 pt-1 lg:px-0">
              <AmbientFeed />
            </section>
          </div>

          {/* RIGHT column ─────────────────────────────────────────────── */}
          {/* Narrowed 260 → 220 (2026-05-31): participant list is a
              vertical list of avatars + names which doesn't need 260px,
              and the reclaimed 40px goes to the plaza canvas. */}
          <div className="hidden lg:block lg:w-[220px] lg:flex-none">
            <ParticipantList me={me} members={members} />
          </div>
        </div>

        <MeSheet open={meOpen} onClose={() => setMeOpen(false)} />
        <RoomInfoSheet open={roomOpen} onClose={() => setRoomOpen(false)} />
        <HistorySheet open={historyOpen} onClose={() => setHistoryOpen(false)} />
        <WelcomeDialog
          open={welcome}
          copy={ONBOARDING[locale].welcome}
          onClose={() => {
            setWelcome(false);
            try { localStorage.setItem("ehto:welcomed", "1"); } catch { /* ignore */ }
          }}
        />
      </main>

      {/* Composer pinned to viewport bottom across breakpoints.
          On lg+, the background bar still spans full width, but the
          input itself is right-padded by (participant column 260 + gap
          16 + breathing 12 = ~288px) so it doesn't extend behind the
          right rail. */}
      <div className="fixed inset-x-0 bottom-0 z-30">
        <div className="bg-bg/92 border-line border-t backdrop-blur-md">
          <div
            className={
              "mx-auto w-full max-w-[420px] px-5 py-3 " +
              // Matches the main container's new lg:max-w-[1680px] +
              // narrower sidebar (220 + 16 gap + 12 breathing = 248).
              "md:max-w-[760px] lg:max-w-[1680px] lg:px-6 lg:pr-[248px]"
            }
          >
            <Composer />
          </div>
        </div>
      </div>
    </>
  );
}
