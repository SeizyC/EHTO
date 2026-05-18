"use client";

import { useState } from "react";

export function Composer() {
  const [value, setValue] = useState("");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return;
        // wired in Phase 2
        setValue("");
      }}
      className="border-t border-white/5 px-4 py-3"
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="조용히 끼어들기…"
        className="w-full bg-transparent text-[13px] text-white/85 placeholder:text-white/25 outline-none"
      />
    </form>
  );
}
