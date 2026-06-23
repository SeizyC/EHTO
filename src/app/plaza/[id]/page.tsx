"use client";

// Visitor view of a public plaza.
//
// Read-only: shows the plaza scene + active members + today's chat as
// it unfolds (Realtime). No composer, no @mention, no message
// dismissal. The visitor sees what the owner sees minus the ability
// to participate.
//
// Hits GET /api/plaza/[id] for the initial bootstrap; reuses the chat-
// store realtime channel for live updates (works because the plaza is
// public).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { PlazaCanvas, type PlazaCharacter } from "@/components/PlazaCanvas";
import { renderMessage } from "@/lib/message-render";
import { YoutubePlayerModal } from "@/components/YoutubePlayerModal";
import type { PlazaObject } from "@/lib/plaza-objects";
import { currentBucket } from "@/lib/time-of-day";

type VisitorMsg = {
  id: string;
  owner_user_id: string | null;
  owner_member_id: string | null;
  text: string;
  kind: string;
  created_at: string;
  speaker_name: string | null;
};

type VisitorPayload = {
  world: {
    id: string;
    name: string;
    createdAt: string;
    tags: string[];
    owner: { handle: string };
    ownerPos: { x: number; y: number; flip: boolean };
  };
  members: Array<{
    id: string;
    name: string;
    persona: { sprite?: string };
    activity_weight: number;
    x: number;
    y: number;
    flip: boolean;
  }>;
  messages: VisitorMsg[];
  objects: PlazaObject[];
};

const PLAZA_W = 2400;
const PLAZA_H = 1600;

export default function VisitorPage({
  params,
}: {
  params: { id: string };
}) {
  const { id } = params;
  const [data, setData] = useState<VisitorPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch(`/api/plaza/${id}`);
        if (!r.ok) {
          if (cancelled) return;
          setErr(r.status === 404 ? "광장을 찾을 수 없거나 비공개입니다" : `오류: ${r.status}`);
          return;
        }
        const j = (await r.json()) as VisitorPayload;
        if (cancelled) return;
        setData(j);
      } catch (e) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : "fetch failed");
      }
    }
    load();
    // Light poll every 20s for new messages + member changes
    const poll = window.setInterval(load, 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
    };
  }, [id]);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollLeft = Math.max(0, PLAZA_W * 0.5 - el.clientWidth / 2);
      el.scrollTop = Math.max(0, PLAZA_H * 0.6 - el.clientHeight / 2);
    });
  }, [data?.world.id]);

  if (err) {
    return (
      <main className="bg-bg text-ink mx-auto flex min-h-dvh max-w-[420px] flex-col items-center justify-center px-5 py-8">
        <p className="text-sub text-[13px]">{err}</p>
        <Link href="/home" className="text-accent mt-4 text-[12px] underline">
          광장 홈으로
        </Link>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="bg-bg text-ink mx-auto flex min-h-dvh max-w-[420px] flex-col items-center justify-center px-5 py-8">
        <p className="text-dim text-[12px]">불러오는 중…</p>
      </main>
    );
  }

  const characters: PlazaCharacter[] = data.members.map((m) => ({
    id: m.id,
    src: m.persona?.sprite ?? "",
    x: m.x,
    y: m.y,
    scale: 1,
    name: m.name,
    flip: m.flip,
  }));

  // Latest active bubbles — show the last message per speaker as a head
  // bubble, for the last 60s. Visitors can't dismiss them.
  const now = Date.now();
  const latestPerSpeaker = new Map<string, VisitorMsg>();
  for (const m of data.messages.slice().reverse()) {
    if (!m.owner_member_id) continue;
    if (now - new Date(m.created_at).getTime() > 60_000) continue;
    if (!latestPerSpeaker.has(m.owner_member_id)) {
      latestPerSpeaker.set(m.owner_member_id, m);
    }
  }
  for (const c of characters) {
    const m = latestPerSpeaker.get(c.id);
    if (m) {
      c.bubble = {
        id: m.id,
        text: m.text,
        speakerName: c.name,
        createdAt: new Date(m.created_at).getTime(),
      };
    }
  }

  const bucket = currentBucket();
  const mood = bucket.label;

  return (
    <>
      <YoutubePlayerModal />
      <main
        className={
          "grain mx-auto flex min-h-dvh max-w-[420px] flex-col pb-[24px] " +
          "md:max-w-[760px] lg:max-w-[1280px] lg:px-6"
        }
      >
        <header className="flex items-start justify-between px-5 pb-3 pt-5 lg:px-0">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="text-ink text-[18px] font-medium leading-none">
                {data.world.name}
              </h1>
              <span className="text-sub text-[11px]">
                / {data.world.owner.handle}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-sub">{mood}</span>
              {data.world.tags.length > 0 && (
                <>
                  <span className="text-dim">·</span>
                  <span className="text-sub">{data.world.tags.join(" · ")}</span>
                </>
              )}
            </div>
          </div>
          <Link
            href="/home"
            className="text-sub hover:text-ink text-[12px] transition"
          >
            ← 광장 홈
          </Link>
        </header>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="lg:min-w-0 lg:flex-1">
            {/* Mobile plaza */}
            <section className="relative lg:hidden">
              <div
                ref={scrollerRef}
                className="no-scrollbar overflow-auto"
                style={{ height: "min(58dvh, 520px)", WebkitOverflowScrolling: "touch" }}
              >
                <PlazaCanvas
                  state={{ objects: data.objects }}
                  characters={characters}
                  characterScale={0.65}
                  style={{ width: PLAZA_W, height: PLAZA_H, aspectRatio: "auto" }}
                />
              </div>
              <div className="from-bg pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r to-transparent" />
              <div className="to-bg pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-r from-transparent" />
            </section>

            {/* PC plaza */}
            <section className="hidden lg:block">
              <div className="border-line relative overflow-hidden rounded-xl border">
                <PlazaCanvas
                  state={{ objects: data.objects }}
                  characters={characters}
                  style={{ width: "100%", aspectRatio: "3 / 2" }}
                />
              </div>
            </section>

            {/* Read-only feed */}
            <section className="px-5 pb-3 pt-3 lg:px-0">
              <p className="text-dim mb-2 text-[10.5px]">
                읽기 전용 · 메시지를 보낼 수 없어요
              </p>
              <ul className="flex flex-col gap-2.5">
                <AnimatePresence>
                  {data.messages.slice().reverse().map((m) => (
                    <VisitorLine key={m.id} m={m} />
                  ))}
                </AnimatePresence>
              </ul>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

function VisitorLine({ m }: { m: VisitorMsg }) {
  if (m.kind === "system") {
    return (
      <motion.li
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="my-1 text-center text-[11.5px] font-medium"
        style={{ color: "#7CDFC0" }}
      >
        {m.text}
      </motion.li>
    );
  }
  const speakerName = m.speaker_name ?? (m.owner_user_id ? "방장" : "?");
  return (
    <motion.li
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="text-ink text-[13px] leading-snug"
    >
      <div className="flex items-baseline gap-2">
        <span
          className="shrink-0 text-[12px] font-medium"
          style={{ color: m.owner_user_id ? "#B5A8D8" : "#8A8A8A" }}
        >
          {speakerName}
        </span>
        <span className="min-w-0 break-words">{renderMessage(m.text)}</span>
      </div>
    </motion.li>
  );
}
