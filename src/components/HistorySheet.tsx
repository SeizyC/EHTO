"use client";

// Browse past days' transcripts via a month-by-month calendar grid.
// Each cell = one day-bucket (KST-09:00 rollover). Cells with at least
// one message are tappable and dotted; tap → load that day's transcript
// below. Months navigate via ← / → in the header so the same UI scales
// to a month or a full year of usage without growing horizontally.

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  fetchHistoryDay,
  fetchHistoryDays,
  type ChatMsg,
  type HistoryDay,
} from "@/lib/chat-store";
import { useMembers } from "@/lib/members-store";
import { useCharacter } from "@/lib/character-store";
import { renderMessage } from "@/lib/message-render";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function HistorySheet({ open, onClose }: Props) {
  const [days, setDays] = useState<HistoryDay[]>([]);
  // Currently viewed month, as a Date pointing to its 1st day (UTC midnight).
  const [cursor, setCursor] = useState<Date>(() => firstOfMonthKst(new Date()));
  const [selected, setSelected] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [loading, setLoading] = useState(false);

  const members = useMembers();
  const me = useCharacter();
  const nameOf = (m: ChatMsg): string => {
    if (m.fromCharId === "me") return me?.handle ?? "나";
    if (m.speakerName) return m.speakerName;
    return members.find((mm) => mm.id === m.fromCharId)?.name ?? "누군가";
  };

  // Load day list when sheet opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const list = await fetchHistoryDays();
      if (cancelled) return;
      setDays(list);
      if (!selected && list.length > 0) {
        setSelected(list[0].date);
        // Jump cursor to the month of the most recent day.
        setCursor(firstOfMonthFromLabel(list[0].date));
      }
    })();
    return () => { cancelled = true; };
  }, [open, selected]);

  // Load selected day's transcript.
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const m = await fetchHistoryDay(selected);
      if (cancelled) return;
      setMsgs(m);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selected]);

  const countByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of days) m.set(d.date, d.count);
    return m;
  }, [days]);

  const monthGrid = useMemo(() => buildMonthGrid(cursor), [cursor]);

  function shiftMonth(delta: number) {
    const next = new Date(cursor);
    next.setUTCMonth(next.getUTCMonth() + delta);
    setCursor(next);
  }

  const today = todayLabel();
  const earliestDay = days.length > 0 ? days[days.length - 1].date : today;
  const latestDay = days.length > 0 ? days[0].date : today;

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
            role="dialog" aria-label="히스토리"
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
            transition={{ type: "tween", duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="bg-surface fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[88dvh] min-h-[70dvh] max-w-[420px] flex-col rounded-t-2xl pb-6 shadow-[0_-12px_40px_-8px_rgba(0,0,0,0.6)]"
          >
            <button onClick={onClose} aria-label="닫기" className="shrink-0 self-center pt-3">
              <span className="bg-line block h-1 w-12 rounded-full" />
            </button>

            {/* Month nav header */}
            <header className="shrink-0 flex items-center justify-between px-5 pb-3 pt-4">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="이전 달"
                className="text-sub hover:text-ink p-1 transition"
                disabled={isBeforeEarliest(cursor, earliestDay)}
              >
                <IconChevron dir="left" />
              </button>
              <h2 className="text-ink text-[15px] font-medium tabular-nums">
                {monthHeading(cursor)}
              </h2>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="다음 달"
                className="text-sub hover:text-ink p-1 transition"
                disabled={isAfterLatest(cursor, latestDay)}
              >
                <IconChevron dir="right" />
              </button>
            </header>

            {/* Weekday header */}
            <div className="shrink-0 grid grid-cols-7 gap-1 px-5 pb-1">
              {["일", "월", "화", "수", "목", "금", "토"].map((w, i) => (
                <div key={w} className={`text-center text-[10.5px] ${i === 0 ? "text-accent/70" : "text-dim"}`}>
                  {w}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="shrink-0 grid grid-cols-7 gap-1 px-5 pb-3">
              {monthGrid.map((cell, idx) => {
                if (!cell) return <div key={`pad-${idx}`} className="h-9" />;
                const count = countByDate.get(cell.label) ?? 0;
                const isToday = cell.label === today;
                const isSelected = cell.label === selected;
                const isInteractive = count > 0;
                return (
                  <button
                    key={cell.label}
                    onClick={() => isInteractive && setSelected(cell.label)}
                    disabled={!isInteractive}
                    aria-label={`${cell.label} ${count}개`}
                    className={[
                      "relative flex h-9 flex-col items-center justify-center rounded-md text-[12px] tabular-nums transition",
                      isSelected
                        ? "bg-ink text-bg"
                        : isInteractive
                          ? "text-ink hover:bg-line/60"
                          : "text-dim",
                      isToday && !isSelected ? "ring-1 ring-accent/60" : "",
                    ].join(" ")}
                  >
                    <span>{cell.day}</span>
                    {count > 0 && !isSelected && (
                      <span
                        className="absolute bottom-1 h-1 w-1 rounded-full"
                        style={{ background: "#E8C067" }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Transcript area */}
            <section className="min-h-0 flex-1 overflow-y-auto border-t border-line/50 px-5 pt-3">
              {!selected ? (
                <p className="text-sub py-4 text-[12px]">날짜를 골라봐.</p>
              ) : loading ? (
                <p className="text-sub py-4 text-[12px]">불러오는 중…</p>
              ) : msgs.length === 0 ? (
                <p className="text-sub py-4 text-[12px]">{formatDayLabel(selected)}엔 메시지가 없어요.</p>
              ) : (
                <>
                  <div className="text-sub mb-2 text-[11px]">{formatDayLabel(selected)} · {msgs.length}개</div>
                  <ul className="flex flex-col gap-2 pb-4">
                    {msgs.map((m) => (
                      <li key={m.id} className="text-ink text-[13px] leading-snug">
                        <div className="flex items-baseline gap-2">
                          <span className="text-dim tabular-nums shrink-0 text-[10.5px]">
                            {formatTime(m.createdAt)}
                          </span>
                          <span
                            className="shrink-0 text-[12px] font-medium"
                            style={{
                              color: m.fromCharId === "me" ? "#B5A8D8" : "#8A8A8A",
                            }}
                          >
                            {nameOf(m)}
                          </span>
                          <span className="break-words">{renderMessage(m.text)}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function IconChevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none"
      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {dir === "left" ? <path d="M10 3 5 8l5 5" /> : <path d="M6 3l5 5-5 5" />}
    </svg>
  );
}

// ─── date helpers (KST 09:00 rollover labels) ────────────────────────

const KST_OFFSET_MS = 9 * 3600_000;
const ROLLOVER_HOUR = 9;

function firstOfMonthKst(d: Date): Date {
  // First moment of the month in KST, then store the UTC instant of
  // 00:00 KST of that first day.
  const kst = new Date(d.getTime() + KST_OFFSET_MS);
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1));
}

function firstOfMonthFromLabel(label: string): Date {
  const [y, m] = label.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, 1));
}

function monthHeading(cursor: Date): string {
  return `${cursor.getUTCFullYear()}년 ${cursor.getUTCMonth() + 1}월`;
}

type Cell = { day: number; label: string };

function buildMonthGrid(cursor: Date): (Cell | null)[] {
  const year = cursor.getUTCFullYear();
  const month = cursor.getUTCMonth();
  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay(); // 0=Sun
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (Cell | null)[] = [];
  // Leading padding
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const label = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    cells.push({ day, label });
  }
  // Pad to multiple of 7
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function isBeforeEarliest(cursor: Date, earliestLabel: string): boolean {
  const [y, m] = earliestLabel.split("-").map(Number);
  const earliestMonth = new Date(Date.UTC(y, (m ?? 1) - 1, 1));
  return cursor.getTime() <= earliestMonth.getTime();
}
function isAfterLatest(cursor: Date, latestLabel: string): boolean {
  const [y, m] = latestLabel.split("-").map(Number);
  const latestMonth = new Date(Date.UTC(y, (m ?? 1) - 1, 1));
  return cursor.getTime() >= latestMonth.getTime();
}

function todayLabel(): string {
  const now = new Date();
  const shifted = now.getTime() + KST_OFFSET_MS - ROLLOVER_HOUR * 3600_000;
  const d = new Date(shifted);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDayLabel(yyyyMmDd: string): string {
  const today = todayLabel();
  if (yyyyMmDd === today) return "오늘";
  const [, m, d] = yyyyMmDd.split("-");
  return `${Number(m)}월 ${Number(d)}일`;
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}
