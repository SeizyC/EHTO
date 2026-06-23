// Inline message renderer.
//
// Spotify URLs render as a compact pill that opens Spotify in a new tab —
// playback for music shares lives in the persistent MusicShareStack overlay
// (bottom-right of plaza), so the inline pill is just a marker/fallback.
//
// YouTube URLs render as a click-to-play card: thumbnail until clicked,
// then an inline iframe replaces it (autoplay) so the video plays right
// inside the bubble/feed without sending the user out to youtube.com.
// We use the youtube-nocookie embed host for lighter tracking.
//
// Everything else stays as plain text.

"use client";

import React, { useState } from "react";

const SPOTIFY_RE =
  /https?:\/\/open\.spotify\.com\/(track|album|playlist|episode)\/([a-zA-Z0-9]+)(?:\?[^\s]*)?/g;

// Match both youtube.com/watch?v=ID and youtu.be/ID forms. Captures the
// 11-char video id in group 1 OR 2 depending on which form matched.
const YOUTUBE_RE =
  /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=([\w-]{11})|youtu\.be\/([\w-]{11}))(?:[?&][^\s]*)?/g;

export function hasEmbed(text: string): boolean {
  SPOTIFY_RE.lastIndex = 0;
  if (SPOTIFY_RE.test(text)) return true;
  YOUTUBE_RE.lastIndex = 0;
  return YOUTUBE_RE.test(text);
}

export function renderMessage(text: string): React.ReactNode {
  // Walk both regex patterns in order of appearance. We resolve all
  // match positions up-front so URLs from different platforms are
  // interleaved correctly with surrounding text.
  type Match = { start: number; end: number; kind: "spotify" | "youtube"; url: string; id?: string };
  const matches: Match[] = [];
  SPOTIFY_RE.lastIndex = 0;
  let sm: RegExpExecArray | null;
  while ((sm = SPOTIFY_RE.exec(text)) !== null) {
    matches.push({ start: sm.index, end: sm.index + sm[0].length, kind: "spotify", url: sm[0] });
  }
  YOUTUBE_RE.lastIndex = 0;
  let ym: RegExpExecArray | null;
  while ((ym = YOUTUBE_RE.exec(text)) !== null) {
    const videoId = ym[1] ?? ym[2];
    matches.push({ start: ym.index, end: ym.index + ym[0].length, kind: "youtube", url: ym[0], id: videoId });
  }
  matches.sort((a, b) => a.start - b.start);

  if (matches.length === 0) return text;

  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let key = 0;
  for (const m of matches) {
    if (m.start < lastIdx) continue; // overlapping match (shouldn't happen)
    if (m.start > lastIdx) {
      parts.push(<span key={`t${key++}`}>{text.slice(lastIdx, m.start)}</span>);
    }
    if (m.kind === "spotify") {
      parts.push(<SpotifyPill key={`s${key++}`} url={m.url} />);
    } else {
      parts.push(<YoutubeThumb key={`y${key++}`} url={m.url} videoId={m.id!} />);
    }
    lastIdx = m.end;
  }
  if (lastIdx < text.length) {
    parts.push(<span key={`t${key++}`}>{text.slice(lastIdx)}</span>);
  }
  return <>{parts}</>;
}

function YoutubeThumb({ url, videoId }: { url: string; videoId: string }) {
  // Click-to-play. We start with a lightweight thumbnail (no iframe load
  // cost up-front, especially important when many cards appear in the
  // feed at once) and swap to an autoplaying iframe on click. The
  // outbound link only fires if the user middle/cmd-clicks — primary
  // left-click is intercepted to mount the player.
  //
  // hqdefault gotcha: YouTube serves a 120×90 gray "video unavailable"
  // placeholder with 200 OK for deleted/private videos. We detect via
  // naturalWidth (real hqdefault is 480×360) and hide it.
  const [playing, setPlaying] = useState(false);
  const thumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  if (playing) {
    return (
      <div
        className="border-line relative my-1.5 block overflow-hidden rounded-lg border"
        style={{ width: 240, aspectRatio: "16 / 9", background: "#000" }}
        onClick={(e) => e.stopPropagation()}
      >
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&playsinline=1`}
          title="YouTube 영상"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
          style={{ border: 0 }}
        />
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        // Modifier-clicks / middle-click → let the browser open YouTube.
        // Plain left-click → play inline.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        setPlaying(true);
      }}
      className="border-line hover:bg-panel relative my-1.5 block overflow-hidden rounded-lg border transition"
      style={{ width: 240, background: "#0a0a0a" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={thumb}
        alt="YouTube 영상 썸네일"
        loading="lazy"
        className="block w-full"
        style={{ aspectRatio: "16 / 9", objectFit: "cover" }}
        onLoad={(e) => {
          const img = e.currentTarget as HTMLImageElement;
          if (img.naturalWidth > 0 && img.naturalWidth <= 120) {
            img.style.visibility = "hidden";
          }
        }}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <span
          className="flex h-9 w-9 items-center justify-center rounded-full"
          style={{ background: "rgba(255, 0, 0, 0.92)" }}
        >
          <svg viewBox="0 0 12 12" width="11" height="11" fill="#fff" aria-hidden>
            <path d="M3 1.5 L3 10.5 L10 6 Z" />
          </svg>
        </span>
      </span>
      <span
        className="absolute right-1.5 bottom-1.5 rounded-sm px-1 py-[1px] text-[9px] font-medium"
        style={{ background: "rgba(0,0,0,0.7)", color: "#fff" }}
        aria-hidden
      >
        YouTube
      </span>
    </a>
  );
}

function SpotifyPill({ url }: { url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="border-line bg-surface/60 hover:bg-surface text-sub hover:text-ink ml-1 inline-flex items-center gap-1 rounded-full border px-2 py-[1px] text-[10.5px] leading-none transition"
      style={{ verticalAlign: "1px" }}
      onClick={(e) => e.stopPropagation()}
    >
      <span aria-hidden style={{ color: "#1DB954" }}>♪</span>
      <span>Spotify</span>
    </a>
  );
}
