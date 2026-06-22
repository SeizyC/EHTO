"use client";

import { useEffect } from "react";

// Loads the Pretendard dynamic-subset stylesheet (92 unicode-range @font-face
// rules) AFTER first paint, so those rules never bloat the render-blocking
// critical CSS. font-display:swap means body text shows immediately in the
// system fallback and swaps to Pretendard once the needed chunks arrive.
export function FontLoader() {
  useEffect(() => {
    if (document.querySelector("link[data-pretendard]")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/fonts/pretendard-dynamic.css";
    link.setAttribute("data-pretendard", "");
    document.head.appendChild(link);
  }, []);
  return null;
}
