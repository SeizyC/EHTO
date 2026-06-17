"use client";

import { useEffect, useRef, useState } from "react";
import { sendMessage, setTyping } from "@/lib/chat-store";
import {
  setComposerTextQuiet,
  useComposerSnapshot,
} from "@/lib/composer-store";

export function Composer() {
  const snap = useComposerSnapshot();
  const [v, setV] = useState(snap.text);
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastSeenFocusToken = useRef(snap.focusToken);

  // External prefill (character tap → summonInComposer): update local
  // value AND pop focus when the store's focusToken bumps. We track the
  // last token we honored so repeat taps with the same text still work.
  useEffect(() => {
    if (snap.focusToken !== lastSeenFocusToken.current) {
      lastSeenFocusToken.current = snap.focusToken;
      setV(snap.text);
      const el = inputRef.current;
      if (el) {
        el.focus();
        // Cursor at end so user can keep typing after the @mention.
        const len = snap.text.length;
        try { el.setSelectionRange(len, len); } catch { /* ignore */ }
      }
    }
  }, [snap.focusToken, snap.text]);

  // Mirror the input's "is there typed content" into the shared typing
  // state so the user's plaza bubble shows "..." while composing.
  useEffect(() => {
    setTyping("me", v.trim().length > 0);
    setComposerTextQuiet(v);
    return () => { setTyping("me", false); };
  }, [v]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = v.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setTyping("me", false);
    try {
      const msg = await sendMessage(trimmed);
      if (msg) { setV(""); setComposerTextQuiet(""); }
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="border-line bg-surface flex items-center gap-2 rounded-full border px-4 py-2.5"
    >
      <input
        ref={inputRef}
        type="text"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (!v.trim()) setTyping("me", false); }}
        placeholder="끼어들기…"
        disabled={sending}
        maxLength={500}
        className="text-ink placeholder:text-dim flex-1 bg-transparent text-[13.5px] outline-none focus:outline-none focus-visible:outline-none focus:ring-0"
        style={{ outline: "none", boxShadow: "none" }}
      />
      {v.trim() ? (
        <button
          type="submit"
          disabled={sending}
          className="bg-accent text-bg rounded-full px-3 py-1 text-[11.5px] font-medium disabled:opacity-60"
        >
          {sending ? "…" : "보내기"}
        </button>
      ) : null}
    </form>
  );
}
