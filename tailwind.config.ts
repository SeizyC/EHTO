import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#110E14",          // 자주 띈 깊은 어둠
        surface: "#1A1720",
        panel: "#1E1A26",
        line: "#332D3A",        // 약간 밝게 — 카드 보더 식별 ↑
        ink: "#ECE4DE",         // 따뜻한 크림 메인 텍스트 (~14.5:1)
        sub: "#C3B7AC",         // 베이지 보조 (~8.4:1) — 기존 #95897F 너무 어두워 가독성 ↓ 였음
        dim: "#8B8278",         // tertiary (~4.8:1) — WCAG AA 통과, 기존 #5A5048(2.4:1)는 사실상 안 보였음
        accent: "#E89B6C",      // 따뜻한 피치 — 생명의 색
        "accent-dim": "#C68966", // 기존 #A66F4F 보다 한 단계 ↑
        gold: "#D4B062",        // 포인트 / 강조
        "gold-dim": "#B89657",  // 기존 #9C7F3E 보다 한 단계 ↑
      },
      fontFamily: {
        sans: [
          "Pretendard Variable",
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "Apple SD Gothic Neo",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      letterSpacing: {
        ko: "-0.01em",
      },
      keyframes: {
        sway: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-2px)" },
        },
        "breathe-glow": {
          "0%,100%": { opacity: "0.85" },
          "50%": { opacity: "1" },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        sway: "sway 2.6s ease-in-out infinite",
        "breathe-glow": "breathe-glow 4s ease-in-out infinite",
        "fade-up": "fade-up 320ms ease-out",
        "fade-in": "fade-in 240ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
