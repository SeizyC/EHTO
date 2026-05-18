import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        pixel: ["'DungGeunMo'", "'Press Start 2P'", "monospace"],
      },
      colors: {
        // mood palette — design.md 기반
        cozy: {
          bg: "#2a1f1a",
          tint: "#f4c98a",
          glow: "#ff8e5e",
        },
        rainy: {
          bg: "#0f1a26",
          tint: "#6fa8d6",
          glow: "#3a6fa1",
        },
        chaotic: {
          bg: "#1a0f1f",
          tint: "#ff5ec4",
          glow: "#7af0ff",
        },
        lonely: {
          bg: "#0d0d12",
          tint: "#5a5a6e",
          glow: "#262635",
        },
      },
      animation: {
        idle: "idle 4s ease-in-out infinite",
        breathe: "breathe 6s ease-in-out infinite",
        flicker: "flicker 0.18s steps(2) infinite",
        bubble: "bubble 0.4s ease-out",
      },
      keyframes: {
        idle: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-2px)" },
        },
        breathe: {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "0.95" },
        },
        flicker: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.72" },
        },
        bubble: {
          "0%": { opacity: "0", transform: "translateY(4px) scale(0.96)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
