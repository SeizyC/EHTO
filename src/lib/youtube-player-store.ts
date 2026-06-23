// Tiny singleton store for the global YouTube player overlay.
//
// Clicking a YouTube thumbnail anywhere (floating speech bubble, side feed,
// history sheet) opens ONE shared centered player instead of trying to
// mount an iframe inside the doomed/tiny floating bubble — bubbles are
// ephemeral (they expire / get replaced on poll), so an inline player there
// vanishes mid-watch. A single overlay sidesteps that entirely.

import { useEffect, useState } from "react";

let _videoId: string | null = null;
const _listeners = new Set<() => void>();

function _emit() {
  for (const l of _listeners) l();
}

/** Open the shared player on a given 11-char video id. */
export function openYoutube(videoId: string): void {
  _videoId = videoId;
  _emit();
}

/** Close the shared player. */
export function closeYoutube(): void {
  if (_videoId === null) return;
  _videoId = null;
  _emit();
}

/** Subscribe to the currently-open video id (null when closed). */
export function useYoutubePlayer(): string | null {
  const [id, setId] = useState<string | null>(_videoId);
  useEffect(() => {
    const sync = () => setId(_videoId);
    _listeners.add(sync);
    sync();
    return () => { _listeners.delete(sync); };
  }, []);
  return id;
}
