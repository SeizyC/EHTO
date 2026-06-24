"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { dismissMusicShare, useActiveMusicShares, type ChatMsg } from "@/lib/chat-store";
import { useMembers } from "@/lib/members-store";

// Stacked overlay of recent music shares at plaza bottom-right.
//
// Each card is a compact pill with a ▶/⏸ button that plays the track
// in-place via Spotify's IFrame API (no new-tab redirect). The actual
// iframe is mounted hidden the moment the user clicks ▶ — Spotify's
// controller then accepts .play()/.pause() calls so we can drive
// playback from our own pill chrome. Free Spotify users get a 30-sec
// preview; Premium users get full tracks.
//
// Newest on top; each card has its own × dismiss. Dismissal persists in
// localStorage so closing it sticks across reloads. Cards drop out after
// 12h naturally (see useActiveMusicShares lookback).

const SPOTIFY_RE =
  /https?:\/\/open\.spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)(?:\?[^\s]*)?/;

// ── Spotify IFrame API typing + global script loader ──

type SpotifyEmbedController = {
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  destroy: () => void;
  addListener: (event: "playback_update" | "ready", cb: (e: unknown) => void) => void;
};

type SpotifyIframeAPI = {
  createController: (
    element: HTMLElement,
    options: { uri: string; width?: string | number; height?: string | number },
    cb: (controller: SpotifyEmbedController) => void,
  ) => void;
};

// We load the Spotify IFrame API script once per page. While it's loading,
// any card that needs the API queues itself via `pendingControllers`.
// Once the script fires `onSpotifyIframeApiReady`, we flush the queue.
declare global {
  interface Window {
    onSpotifyIframeApiReady?: (api: SpotifyIframeAPI) => void;
    __ehtoSpotifyApi?: SpotifyIframeAPI;
    __ehtoSpotifyApiPending?: Array<(api: SpotifyIframeAPI) => void>;
  }
}

function ensureSpotifyApi(): Promise<SpotifyIframeAPI> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return;
    if (window.__ehtoSpotifyApi) {
      resolve(window.__ehtoSpotifyApi);
      return;
    }
    if (!window.__ehtoSpotifyApiPending) window.__ehtoSpotifyApiPending = [];
    window.__ehtoSpotifyApiPending.push(resolve);
    if (document.querySelector('script[data-ehto-spotify-api]')) return;

    // First card mounting on this page — inject the script + set the
    // global ready callback. Spotify calls it exactly once when the
    // API is ready; we cache the API and flush any waiting cards.
    window.onSpotifyIframeApiReady = (api: SpotifyIframeAPI) => {
      window.__ehtoSpotifyApi = api;
      const q = window.__ehtoSpotifyApiPending ?? [];
      window.__ehtoSpotifyApiPending = [];
      for (const fn of q) fn(api);
    };
    const s = document.createElement("script");
    s.src = "https://open.spotify.com/embed/iframe-api/v1";
    s.async = true;
    s.dataset.ehtoSpotifyApi = "1";
    document.head.appendChild(s);
  });
}

export function MusicShareStack() {
  const shares = useActiveMusicShares();
  const members = useMembers();

  if (shares.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed right-3 bottom-[92px] z-40 flex flex-col-reverse gap-2"
      style={{
        maxHeight: "calc(100% - 24px)",
      }}
    >
      <AnimatePresence initial={false}>
        {shares.map((m) => (
          <MusicCard
            key={m.id}
            msg={m}
            speakerName={resolveSpeakerName(m, members)}
            onDismiss={() => dismissMusicShare(m.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function resolveSpeakerName(
  m: ChatMsg,
  members: { id: string; name: string }[],
): string {
  if (m.speakerName) return m.speakerName;
  const found = members.find((mm) => mm.id === m.fromCharId);
  return found?.name ?? "누군가";
}

function MusicCard({
  msg,
  speakerName,
  onDismiss,
}: {
  msg: ChatMsg;
  speakerName: string;
  onDismiss: () => void;
}) {
  const match = msg.text.match(SPOTIFY_RE);
  const spotifyUri = match ? `spotify:${match[1]}:${match[2]}` : null;
  const externalUrl = match ? match[0] : null;

  const beforeUrl = msg.text.replace(SPOTIFY_RE, "").trim();
  const lines = beforeUrl.split(/[\n.!?]/).map((s) => s.trim()).filter(Boolean);
  const trackTitle = lines.length > 0 ? lines[lines.length - 1] : "음악";

  // Embed slot: positioned off-screen so Spotify's iframe loads + plays
  // audio without ever showing UI on the page. All visible controls
  // live in the pill chrome; the iframe is only the audio engine.
  const embedRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<SpotifyEmbedController | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1

  // Clean up the Spotify controller when the card unmounts so audio
  // doesn't keep playing in a detached iframe.
  useEffect(() => {
    return () => {
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, []);

  async function handlePlayClick() {
    if (!spotifyUri || !embedRef.current) return;

    // If the controller already exists, just toggle.
    if (controllerRef.current) {
      controllerRef.current.togglePlay();
      // Optimistically flip — the playback_update listener will
      // reconcile if Spotify rejects (e.g. ad-supported limits).
      setPlaying((p) => !p);
      return;
    }

    setLoading(true);
    try {
      const api = await ensureSpotifyApi();
      api.createController(
        embedRef.current,
        { uri: spotifyUri, width: "100%", height: 80 },
        (controller) => {
          controllerRef.current = controller;
          controller.addListener("playback_update", (e: unknown) => {
            const payload = e as {
              data?: { isPaused?: boolean; position?: number; duration?: number };
            };
            const paused = payload?.data?.isPaused;
            if (typeof paused === "boolean") setPlaying(!paused);
            const pos = payload?.data?.position;
            const dur = payload?.data?.duration;
            if (typeof pos === "number" && typeof dur === "number" && dur > 0) {
              setProgress(Math.max(0, Math.min(1, pos / dur)));
            }
          });
          controller.play();
          setLoading(false);
        },
      );
    } catch {
      setLoading(false);
      // API load failed — degrade gracefully to opening Spotify externally.
      if (externalUrl) window.open(externalUrl, "_blank", "noopener,noreferrer");
    }
  }

  function handleDismiss() {
    controllerRef.current?.destroy();
    controllerRef.current = null;
    onDismiss();
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 40, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, scale: 0.95 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-auto border-line overflow-hidden rounded-2xl border shadow-md"
      style={{ background: "#141014", maxWidth: 300 }}
    >
      {/* Pill chrome — the only visible UI */}
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span aria-hidden style={{ color: "#E8C067" }} className="text-[12px] leading-none">♪</span>
        <span className="text-ink shrink-0 text-[11px] font-medium leading-none">{speakerName}</span>
        <span className="text-dim text-[10px] leading-none">·</span>
        <span className="text-sub truncate text-[11px] leading-none" style={{ minWidth: 0 }}>
          {trackTitle}
        </span>
        <button
          type="button"
          onClick={handlePlayClick}
          aria-label={playing ? "일시정지" : "재생"}
          disabled={loading || !spotifyUri}
          className="ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition disabled:opacity-50"
          style={{ background: "#1DB954" }}
        >
          {loading ? (
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 animate-spin rounded-full border-2 border-[#0a0a0a] border-t-transparent"
            />
          ) : playing ? (
            <svg viewBox="0 0 12 12" width="9" height="9" fill="#0a0a0a" aria-hidden>
              <rect x="2.5" y="1.5" width="2.5" height="9" />
              <rect x="7" y="1.5" width="2.5" height="9" />
            </svg>
          ) : (
            <svg viewBox="0 0 12 12" width="9" height="9" fill="#0a0a0a" aria-hidden>
              <path d="M2.5 1.5 L2.5 10.5 L10 6 Z" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="음악 카드 닫기"
          className="text-dim hover:text-ink shrink-0 leading-none text-[13px] transition"
        >
          ×
        </button>
      </div>
      {/* Progress bar — only visible during playback. Thin 2px line at
          the bottom of the pill, filled with Spotify green up to the
          current playback position. */}
      {progress > 0 && (
        <div className="h-[2px] w-full" style={{ background: "rgba(255,255,255,0.06)" }}>
          <div
            className="h-full"
            style={{
              background: "#1DB954",
              width: `${progress * 100}%`,
              transition: "width 0.4s linear",
            }}
          />
        </div>
      )}
      {/* Spotify embed slot — *always* mounted but positioned far off-
          screen so the iframe loads + plays audio without showing any
          UI. We control playback purely via the IFrame API; users only
          see the pill above. Off-screen positioning (vs display:none)
          ensures the iframe actually loads — some browsers throttle or
          skip-load hidden iframes. */}
      <div
        ref={embedRef}
        aria-hidden
        style={{
          position: "fixed",
          left: -10000,
          top: -10000,
          width: 1,
          height: 1,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      />
    </motion.div>
  );
}
