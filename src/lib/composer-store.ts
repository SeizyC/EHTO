"use client";

import { useEffect, useState } from "react";

// Tiny shared store so anything in the plaza (a character tap, a
// participant-list tap, etc.) can prefill the composer and pop focus
// without prop-drilling. focusToken increments on every set so the
// composer can re-focus + scroll cursor to end even when the new text
// equals the existing text (e.g. tapping the same character twice).

let _text = "";
let _focusToken = 0;
const _listeners = new Set<() => void>();

function _notify() { for (const fn of _listeners) fn(); }

export function getComposerText(): string { return _text; }
export function getFocusToken(): number { return _focusToken; }

/** Quietly update text (no focus pop). Used by the Composer itself on
 *  every keystroke so the shared cache stays accurate. */
export function setComposerTextQuiet(next: string): void {
  if (_text === next) return;
  _text = next;
  _notify();
}

/** Set text AND ask the composer to grab focus. Used by external
 *  triggers like character taps. */
export function setComposerText(next: string): void {
  _text = next;
  _focusToken += 1;
  _notify();
}

/** Tap-a-character helper: drop "@{name} " into the composer and focus.
 *  If the composer already starts with another @mention, replace it so
 *  rapid taps swap the target instead of stacking prefixes. */
export function summonInComposer(name: string): void {
  const stripped = _text.replace(/^@\S+\s*/, "");
  const prefix = `@${name} `;
  setComposerText(prefix + stripped);
}

export function useComposerSnapshot(): { text: string; focusToken: number } {
  const [snap, setSnap] = useState({ text: _text, focusToken: _focusToken });
  useEffect(() => {
    const sync = () => setSnap({ text: _text, focusToken: _focusToken });
    _listeners.add(sync);
    sync();
    return () => { _listeners.delete(sync); };
  }, []);
  return snap;
}
