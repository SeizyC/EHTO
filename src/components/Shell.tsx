import Link from "next/link";
import type { ReactNode } from "react";

export function TopBar({ title, left, right }: { title: string; left?: ReactNode; right?: ReactNode }) {
  return (
    <header className="relative flex h-12 items-center justify-between bg-black/70 px-3 backdrop-blur-sm">
      <div className="flex-1">{left ?? <BuildingIcon />}</div>
      <h1 className="absolute left-1/2 -translate-x-1/2 text-[15px] font-medium text-white/95 tracking-wide">
        {title}
      </h1>
      <div className="flex flex-1 justify-end">{right ?? <GearIcon />}</div>
    </header>
  );
}

function BuildingIcon() {
  return (
    <Link href="/mockups" aria-label="explore" className="block">
      <svg width="26" height="26" viewBox="0 0 12 12" shapeRendering="crispEdges" className="pixelated">
        <rect x="1" y="2" width="4" height="9" fill="#e89844" />
        <rect x="6" y="4" width="5" height="7" fill="#f4ad55" />
        <rect x="2" y="3" width="1" height="1" fill="#fff5d0" />
        <rect x="4" y="3" width="1" height="1" fill="#fff5d0" />
        <rect x="2" y="5" width="1" height="1" fill="#fff5d0" />
        <rect x="4" y="5" width="1" height="1" fill="#fff5d0" />
        <rect x="2" y="7" width="1" height="1" fill="#fff5d0" />
        <rect x="4" y="7" width="1" height="1" fill="#fff5d0" />
        <rect x="7" y="5" width="1" height="1" fill="#fff5d0" />
        <rect x="9" y="5" width="1" height="1" fill="#fff5d0" />
        <rect x="7" y="7" width="1" height="1" fill="#fff5d0" />
        <rect x="9" y="7" width="1" height="1" fill="#fff5d0" />
        <rect x="7" y="9" width="1" height="1" fill="#fff5d0" />
        <rect x="9" y="9" width="1" height="1" fill="#fff5d0" />
      </svg>
    </Link>
  );
}

function GearIcon() {
  return (
    <Link href="/identity" aria-label="settings" className="block text-white/70 hover:text-white">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1c0 .7.4 1.3 1 1.5a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 19.4 9c.2.6.8 1 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </svg>
    </Link>
  );
}

const TABS = [
  { id: "explore", label: "Explore", href: "/", Icon: ExploreIcon },
  { id: "chat", label: "Chat history", href: "/identity", Icon: ChatIcon },
  { id: "people", label: "People", href: "/mockups", Icon: PeopleIcon },
  { id: "messages", label: "Messages", href: "/identity", Icon: MessagesIcon },
] as const;

export function BottomTabs({ active }: { active: (typeof TABS)[number]["id"] }) {
  return (
    <nav className="grid grid-cols-4 border-t border-white/10 bg-black/85 backdrop-blur-sm">
      {TABS.map((t) => {
        const isActive = t.id === active;
        return (
          <Link
            key={t.id}
            href={t.href}
            className={
              "flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] " +
              (isActive ? "text-sky-300" : "text-white/55 hover:text-white/85")
            }
          >
            <t.Icon active={isActive} />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function ExploreIcon({ active }: { active?: boolean }) {
  const color = active ? "#7dd3fc" : "currentColor";
  return (
    <svg width="22" height="22" viewBox="0 0 12 12" shapeRendering="crispEdges">
      <rect x="2" y="2" width="3" height="3" fill={color} />
      <rect x="7" y="2" width="3" height="3" fill={color} />
      <rect x="2" y="7" width="3" height="3" fill={color} />
      <rect x="7" y="7" width="3" height="3" fill={color} />
    </svg>
  );
}
function ChatIcon({ active }: { active?: boolean }) {
  const c = active ? "#7dd3fc" : "currentColor";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7">
      <path d="M21 11.5a8.4 8.4 0 0 1-8.4 8.4 8.4 8.4 0 0 1-3.9-.9L3 21l1.9-5.4a8.4 8.4 0 0 1-.8-3.6c0-4.6 3.8-8.4 8.4-8.4S21 6.9 21 11.5z" />
      <path d="M16 11.5a8.4 8.4 0 0 1-7.6 8.4" opacity="0.5" />
    </svg>
  );
}
function PeopleIcon({ active }: { active?: boolean }) {
  const c = active ? "#7dd3fc" : "currentColor";
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7">
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M15 20c0-2.4 1.7-4.4 4-4.9" />
    </svg>
  );
}
function MessagesIcon({ active }: { active?: boolean }) {
  const c = active ? "#7dd3fc" : "currentColor";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.7">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}
