"use client";

import { useEffect, useState } from "react";
import { browserClient } from "@/lib/supabase";
import { subscribeMessages } from "@/lib/realtime";

// Chat persistence model:
//   - Server (DB) stores text + sender (user uuid OR member uuid) + timestamp.
//   - Client overlays a "display state" (bubble | landed). The latest msg
//     per speaker stays "bubble" — rendered above their head. Older msgs
//     are "landed". The FEED shows EVERY message (both states) — the
//     head-bubble is just a parallel "what they last said" indicator, the
//     feed is the permanent log.
//   - On a new line, the FEED entry visibly drops in from above so it
//     feels like a copy descending from the head. The head-bubble itself
//     stays put; no morph between the two.
//   - When the same speaker speaks again, the prior msg flips to landed
//     (still in feed, just no longer above their head).
//   - Hydrated history loads silently as landed.

export const FEED_RETAIN_MAX = 50;
// Pause between the head-bubble revealing the text and the feed copy
// starting its fall — so the user clearly sees the bubble first, then a
// copy descends to the log.
export const FEED_REVEAL_DELAY_MS = 450;

// Owner-dismissed bubble IDs. A head bubble stays up forever (across
// reloads) until either (a) a newer message from the same speaker
// replaces it, or (b) the owner explicitly taps the bubble closed. We
// persist (b) here so a refresh doesn't resurrect bubbles the owner
// already swiped away.
const CHAT_DISMISS_LS_KEY = "ehto:chat-dismissed-ids:v1";
const CHAT_DISMISS_LIMIT = 500;

function _loadChatDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(CHAT_DISMISS_LS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}

function _saveChatDismissed(set: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    // Bound the set so the key doesn't grow forever. Keeping the
    // most-recent N IDs (insertion order via Array.from) is enough —
    // very old messages have already been replaced by newer per-speaker
    // bubbles, so their dismissal status no longer matters.
    let arr = Array.from(set);
    if (arr.length > CHAT_DISMISS_LIMIT) arr = arr.slice(-CHAT_DISMISS_LIMIT);
    localStorage.setItem(CHAT_DISMISS_LS_KEY, JSON.stringify(arr));
  } catch { /* quota / private mode — ignore */ }
}

let _dismissedIds: Set<string> | null = null;
function _getDismissed(): Set<string> {
  if (_dismissedIds === null) _dismissedIds = _loadChatDismissed();
  return _dismissedIds;
}

export type ChatMsg = {
  id: string;
  text: string;
  /** "chat" = normal speech bubble. "system" = neutral notice
   *  ("○○ 님이 입장하셨어요"). "recap" = absence summary inserted
   *  when the owner returns after being away for ≥5 min. All three
   *  are rendered without owner/speaker labels; the latter two render
   *  centered with different styling treatments. */
  kind?: "chat" | "system" | "recap";
  fromCharId: string;       // "me" or member uuid (empty for system)
  /** Carried with the message so the feed can render the speaker name
   *  even before/without the members-store list being loaded. */
  speakerName?: string;
  state: "bubble" | "landed";
  createdAt: number;
  landedAt?: number;
  /** true when landed because a newer msg replaced it — skip the morph
   *  so it doesn't fight the new bubble's animation. */
  silentPromote?: boolean;
  /** Wall-clock ms until which the bubble should render "..." instead of
   *  text. Used to fake a brief typing phase when an AI line arrives via
   *  polling, so the speaker visibly composes before the message reveals. */
  typingUntil?: number;
  /** Wall-clock ms until which the feed line stays hidden, so the
   *  head-bubble reveals first and the feed copy then drops in shortly. */
  feedRevealAt?: number;
};

// ───── shared cache + pub/sub ─────
let _msgs: ChatMsg[] = [];
let _hydrated = false;
let _hydrating: Promise<void> | null = null;
const _listeners = new Set<() => void>();
function _notify() { for (const fn of _listeners) fn(); }
function _setMsgs(next: ChatMsg[]) { _msgs = next; _notify(); }

// Set of charIds currently composing a message (just the user for now, but
// the data model would extend to AIs that "started typing" via cron).
const _typing = new Set<string>();
const _typingListeners = new Set<() => void>();
function _notifyTyping() { for (const fn of _typingListeners) fn(); }

export function setTyping(charId: string, typing: boolean): void {
  const had = _typing.has(charId);
  if (typing) _typing.add(charId);
  else _typing.delete(charId);
  if (had === typing) return;

  // Entering the typing state demotes the speaker's prior live bubble — it
  // flies down to the feed immediately (animated via shared layoutId) so
  // the "…" placeholder can take over above their head without overlap.
  if (typing) {
    const now = Date.now();
    let mutated = false;
    const next = _msgs.map<ChatMsg>((m) => {
      if (m.fromCharId === charId && m.state === "bubble") {
        mutated = true;
        return { ...m, state: "landed" as const, landedAt: now };
      }
      return m;
    });
    if (mutated) _setMsgs(next);
  }
  _notifyTyping();
}

export function useTyping(charId: string): boolean {
  const [v, setV] = useState(_typing.has(charId));
  useEffect(() => {
    const sync = () => setV(_typing.has(charId));
    _typingListeners.add(sync);
    sync();
    return () => { _typingListeners.delete(sync); };
  }, [charId]);
  return v;
}

/** Fetch a past day's full transcript (does NOT touch the live feed). */
export async function fetchHistoryDay(date: string): Promise<ChatMsg[]> {
  const sb = browserClient();
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) return [];
  const r = await fetch(`/api/messages?date=${encodeURIComponent(date)}&limit=500`, {
    headers: { Authorization: `Bearer ${sess.session.access_token}` },
  });
  if (!r.ok) return [];
  const j = await r.json();
  const rows: DbMessage[] = j.messages ?? [];
  return rows.map(fromDb);
}

export type HistoryDay = { date: string; count: number };
export async function fetchHistoryDays(): Promise<HistoryDay[]> {
  const sb = browserClient();
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) return [];
  const r = await fetch("/api/messages/days", {
    headers: { Authorization: `Bearer ${sess.session.access_token}` },
  });
  if (!r.ok) return [];
  const j = await r.json();
  return (j.days ?? []) as HistoryDay[];
}

/** Wipe in-memory chat cache (e.g. on sign-out or account switch). */
export function clearChat() {
  _msgs = [];
  _hydrated = false;
  _hydrating = null;
  _rtBoundWorldId = null;
  _rtUnsub?.();
  _rtUnsub = null;
  _notify();
}

// ───── Realtime subscription ─────
// Bound lazily once we learn the worldId (passed by the world page after
// it boots, or by the first refreshChat that has it). Re-binding is a
// no-op unless worldId changes. The handler mirrors the same fresh-row
// logic as refreshChat below: dedup by id, animate as a bubble + feed
// reveal so realtime arrivals look identical to poll arrivals.
let _rtBoundWorldId: string | null = null;
let _rtUnsub: (() => void) | null = null;

export async function bindChatRealtime(worldId: string, myUserId: string | null): Promise<void> {
  if (_rtBoundWorldId === worldId) return;
  _rtUnsub?.();
  _rtBoundWorldId = worldId;
  _rtUnsub = await subscribeMessages(worldId, (evt) => {
    if (evt.eventType === "DELETE") {
      const oldId = (evt.old as { id?: string } | null)?.id;
      if (!oldId) return;
      if (!_msgs.some((m) => m.id === oldId)) return;
      _setMsgs(_msgs.filter((m) => m.id !== oldId));
      return;
    }
    if (evt.eventType !== "INSERT") return;
    const row = evt.new as {
      id: string;
      world_id: string;
      owner_user_id: string | null;
      owner_member_id: string | null;
      text: string;
      created_at: string;
      kind: string | null;
    };
    // Self-echo: ignore inserts whose owner_user_id is me — sendMessage
    // already placed an optimistic bubble with the same id from the POST
    // response. The dedup-by-id below would catch it anyway, this is just
    // a fast-path skip.
    if (myUserId && row.owner_user_id === myUserId) return;
    if (_msgs.some((m) => m.id === row.id)) return;
    _appendFreshMessage({
      id: row.id,
      owner_user_id: row.owner_user_id,
      owner_member_id: row.owner_member_id,
      text: row.text,
      created_at: row.created_at,
      kind: row.kind ?? "chat",
      speaker_name: null,
    });
  });
}

type DbMessage = {
  id: string;
  owner_user_id: string | null;
  owner_member_id: string | null;
  text: string;
  created_at: string;
  speaker_name?: string | null;
  kind?: string | null;
};

function fromDb(row: DbMessage): ChatMsg {
  const kind: "chat" | "system" | "recap" =
    row.kind === "system" ? "system" : row.kind === "recap" ? "recap" : "chat";
  return {
    id: row.id,
    text: row.text,
    kind,
    fromCharId: kind === "system"
      ? "" // no owner
      : row.owner_user_id ? "me" : (row.owner_member_id ?? "unknown"),
    speakerName: row.speaker_name ?? undefined,
    state: "landed",
    silentPromote: true,                    // hydrated msgs render directly in feed
    createdAt: new Date(row.created_at).getTime(),
    landedAt: new Date(row.created_at).getTime(),
  };
}

async function _hydrate(): Promise<void> {
  if (_hydrated) return;
  if (_hydrating) return _hydrating;
  _hydrating = (async () => {
    const sb = browserClient();
    const { data: sess } = await sb.auth.getSession();
    if (!sess.session) { _hydrated = true; return; }
    try {
      // No `?date=` → defaults to today's window (since KST 09:00). All
      // older messages are reachable via the history sheet, not the feed.
      const r = await fetch("/api/messages?limit=300", {
        headers: { Authorization: `Bearer ${sess.session.access_token}` },
      });
      if (!r.ok) return;
      const j = await r.json();
      const rows: DbMessage[] = j.messages ?? [];
      // History loads silently as landed — no morphs on page refresh.
      const msgs = rows.map(fromDb);
      // Restore head bubbles: walk newest → oldest and promote each
      // speaker's first encountered chat msg back to "bubble" UNLESS
      // the owner already dismissed it (persisted in localStorage). The
      // restoration has no time cutoff — bubbles live until the owner
      // closes them or a newer line from the same speaker replaces
      // them. Reloading the page should NOT make them disappear.
      const dismissed = _getDismissed();
      const bubbledFor = new Set<string>();
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (m.kind !== "chat") continue;
        if (!m.fromCharId) continue;
        if (bubbledFor.has(m.fromCharId)) continue;
        bubbledFor.add(m.fromCharId);
        if (dismissed.has(m.id)) continue; // owner swiped it away earlier
        msgs[i] = { ...m, state: "bubble", silentPromote: true, landedAt: undefined };
      }
      _setMsgs(msgs);
    } finally {
      _hydrated = true;
      _hydrating = null;
    }
  })();
  return _hydrating;
}

// Shared "drop a brand-new row in as a bubble with typing + feed reveal"
// path. Used by BOTH refreshChat (poll-driven dedup merge) and the
// realtime INSERT handler so on-screen behavior is identical regardless
// of which signal caught the row first. Caller is responsible for
// dedup-by-id (we still gate again here for safety in re-entrant cases).
function _appendFreshMessage(row: DbMessage): void {
  if (_msgs.some((m) => m.id === row.id)) return;
  const kind: "chat" | "system" | "recap" =
    row.kind === "system" ? "system" : row.kind === "recap" ? "recap" : "chat";
  const fromCharId = (kind === "system" || kind === "recap")
    ? ""
    : row.owner_user_id ? "me" : (row.owner_member_id ?? "unknown");
  const now = Date.now();
  const isChat = kind === "chat";
  const typingUntil =
    isChat && fromCharId !== "me"
      ? now + 1200 + Math.floor(Math.random() * 800)
      : undefined;
  const revealedAt = typingUntil ?? now;
  const feedRevealAt = isChat ? revealedAt + FEED_REVEAL_DELAY_MS : now;
  const newBubble: ChatMsg = {
    id: row.id,
    text: row.text,
    kind,
    fromCharId,
    speakerName: row.speaker_name ?? undefined,
    state: kind === "chat" ? "bubble" : "landed",
    createdAt: new Date(row.created_at).getTime(),
    typingUntil,
    feedRevealAt,
  };
  // Same-speaker prior bubble → silent-promote so we don't compete with
  // the new bubble's fly-down animation.
  const promoted = _msgs.map<ChatMsg>((m) =>
    m.fromCharId === fromCharId && fromCharId !== "" && m.state === "bubble"
      ? { ...m, state: "landed" as const, landedAt: now, silentPromote: true }
      : m,
  );
  _setMsgs([...promoted, newBubble]);

  if (typingUntil) {
    const ms = Math.max(0, typingUntil - Date.now());
    window.setTimeout(() => {
      _setMsgs(_msgs.map<ChatMsg>((m) =>
        m.id === newBubble.id ? { ...m, typingUntil: undefined } : m,
      ));
    }, ms);
  }
  if (feedRevealAt) {
    const ms = Math.max(0, feedRevealAt - Date.now());
    window.setTimeout(() => {
      _setMsgs(_msgs.map<ChatMsg>((m) =>
        m.id === newBubble.id ? { ...m, feedRevealAt: undefined } : m,
      ));
    }, ms);
  }
}

// Poll-friendly refresh: fetch latest 50, merge any new rows in as fresh
// bubbles so newly-arrived AI messages (e.g. greetings from just-activated
// members) animate the same as a live reply. Existing rows keep their
// current state — we don't downgrade landed → bubble.
let _refreshing = false;
export async function refreshChat(): Promise<void> {
  if (_refreshing) return;
  _refreshing = true;
  try {
    const sb = browserClient();
    const { data: sess } = await sb.auth.getSession();
    if (!sess.session) return;
    const r = await fetch("/api/messages?limit=300", {
      headers: { Authorization: `Bearer ${sess.session.access_token}` },
    });
    if (!r.ok) return;
    const j = await r.json();
    const rows: DbMessage[] = j.messages ?? [];
    const known = new Set(_msgs.map((m) => m.id));
    for (const row of rows) {
      if (known.has(row.id)) continue;
      _appendFreshMessage(row);
    }
  } finally {
    _refreshing = false;
  }
}

// ───── public API ─────

export async function sendMessage(text: string): Promise<ChatMsg | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const sb = browserClient();
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) return null;

  // ── OPTIMISTIC INSERT with client-generated UUID ──
  //
  // Why client-side UUID: previously the optimistic msg had a tempId,
  // the server response had a different real id, and we *swapped* on
  // POST response. Between the optimistic insert and the swap, Realtime
  // INSERT and refreshChat poll could both deliver the *real id* — and
  // since neither matched the tempId in dedup, they appended duplicates.
  // The user saw the same line 2-3 times.
  //
  // Fix: client generates a UUID, sends it in the POST body, server
  // uses it as the DB row id. Then optimistic + server + realtime +
  // refresh all use the SAME id — every dedup-by-id check matches and
  // duplicates can't happen. No swap needed.
  const id = crypto.randomUUID();
  const now = Date.now();

  const replaced = _msgs.map<ChatMsg>((m) =>
    m.fromCharId === "me" && m.state === "bubble"
      ? { ...m, state: "landed" as const, landedAt: now, silentPromote: true }
      : m,
  );

  const feedRevealAt = now + FEED_REVEAL_DELAY_MS;
  const optimistic: ChatMsg = {
    id,
    text: trimmed,
    fromCharId: "me",
    state: "bubble",
    createdAt: now,
    feedRevealAt,
  };
  _setMsgs([...replaced, optimistic]);

  // Reveal the feed copy after the short delay (unchanged animation).
  window.setTimeout(() => {
    _setMsgs(_msgs.map<ChatMsg>((m) =>
      m.id === id ? { ...m, feedRevealAt: undefined } : m,
    ));
  }, FEED_REVEAL_DELAY_MS);

  // Fire the POST without awaiting it. Server uses our client-supplied
  // id, so the response is informational only — we don't need to touch
  // _msgs again on success.
  void (async () => {
    try {
      const r = await fetch("/api/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sess.session.access_token}`,
        },
        body: JSON.stringify({ id, text: trimmed }),
      });
      if (!r.ok) {
        console.warn(`[chat] send failed: HTTP ${r.status}`);
      }
    } catch (e) {
      console.warn("[chat] send err:", e instanceof Error ? e.message : e);
    }
  })();

  return optimistic;
}

/** Pop the active head bubble for a character. The message itself
 *  stays in the feed (no DB delete) — only its visual "bubble" state
 *  is demoted to "landed" with silentPromote, so the feed copy doesn't
 *  re-animate. The dismissed message id is persisted to localStorage
 *  so a page reload doesn't resurrect the bubble. */
export function dismissBubble(charId: string): void {
  if (!charId) return;
  const now = Date.now();
  let mutated = false;
  const dismissed = _getDismissed();
  const newlyDismissed: string[] = [];
  const next = _msgs.map<ChatMsg>((m) => {
    if (m.fromCharId === charId && m.state === "bubble") {
      mutated = true;
      newlyDismissed.push(m.id);
      return { ...m, state: "landed" as const, landedAt: now, silentPromote: true };
    }
    return m;
  });
  if (mutated) {
    _setMsgs(next);
    for (const id of newlyDismissed) dismissed.add(id);
    _saveChatDismissed(dismissed);
  }
}

export async function deleteMessage(id: string): Promise<boolean> {
  const sb = browserClient();
  const { data: sess } = await sb.auth.getSession();
  if (!sess.session) return false;

  // Optimistic: drop locally first, restore on failure.
  const prev = _msgs;
  _setMsgs(_msgs.filter((m) => m.id !== id));

  const r = await fetch(`/api/messages/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${sess.session.access_token}` },
  });
  if (!r.ok) {
    _setMsgs(prev);
    return false;
  }
  return true;
}

export function useChatMessages(): ChatMsg[] {
  const [snap, setSnap] = useState<ChatMsg[]>(_msgs);
  useEffect(() => {
    const sync = () => setSnap(_msgs.slice());
    sync();
    _listeners.add(sync);
    _hydrate();
    return () => { _listeners.delete(sync); };
  }, []);
  return snap;
}

// Helpers
export function activeBubbleOf(charId: string, all: ChatMsg[]): ChatMsg | undefined {
  for (let i = all.length - 1; i >= 0; i--) {
    if (all[i].fromCharId === charId && all[i].state === "bubble") return all[i];
  }
  return undefined;
}

export function landedMessages(all: ChatMsg[]): ChatMsg[] {
  return all.filter((m) => m.state === "landed").slice(-FEED_RETAIN_MAX);
}

// ───── Music share stack (plaza bottom-right) ─────
//
// When a member shares a Spotify track, we want a *persistent* playable
// card overlaying the plaza bottom-right (not just an inline feed
// embed that scrolls away). Multiple shares stack with newest on top;
// each is independently dismissable via X.
//
// Dismissal state lives in localStorage so closing a card sticks across
// reloads. A new share (different message id) appears fresh on top even
// if older ones were dismissed.

const SPOTIFY_RE_TEST = /open\.spotify\.com\/(track|album|playlist|episode)\/[a-zA-Z0-9]+/;
const MUSIC_CARD_LOOKBACK_MS = 12 * 3600_000;
const MUSIC_CARD_MAX = 3;
const DISMISS_LS_KEY = "ehto:music-dismissed-ids";

function _loadDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DISMISS_LS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function _saveDismissed(set: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DISMISS_LS_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // LS full / disabled — fine, dismissal just won't persist
  }
}

let _dismissed: Set<string> | null = null;
const _dismissListeners = new Set<() => void>();
function _notifyDismiss() { for (const fn of _dismissListeners) fn(); }

export function dismissMusicShare(id: string): void {
  if (!_dismissed) _dismissed = _loadDismissed();
  if (_dismissed.has(id)) return;
  _dismissed.add(id);
  _saveDismissed(_dismissed);
  _notifyDismiss();
}

/** Returns the active (non-dismissed) music shares from the last 12h,
 *  newest first, capped at MUSIC_CARD_MAX. Reactive to both message
 *  inserts and dismissals. */
export function useActiveMusicShares(): ChatMsg[] {
  const all = useChatMessages();
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!_dismissed) _dismissed = _loadDismissed();
    const onChange = () => setVersion((v) => v + 1);
    _dismissListeners.add(onChange);
    return () => { _dismissListeners.delete(onChange); };
  }, []);
  // version is intentionally read so the memo recomputes when dismissed set changes
  void version;

  const cutoff = Date.now() - MUSIC_CARD_LOOKBACK_MS;
  const dismissed = _dismissed ?? new Set();
  return all
    .filter((m) => m.kind === "chat" && SPOTIFY_RE_TEST.test(m.text))
    .filter((m) => m.createdAt >= cutoff)
    .filter((m) => !dismissed.has(m.id))
    .sort((a, b) => b.createdAt - a.createdAt) // newest first
    .slice(0, MUSIC_CARD_MAX);
}
