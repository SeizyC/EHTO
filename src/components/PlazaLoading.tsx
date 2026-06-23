"use client";

// Fills the plaza viewport while the owner's world (state/members/objects)
// is still being fetched on first load — so the canvas doesn't flash an
// empty floor before the cached/live data arrives. Shown on /world until
// useWorld() resolves; the visitor page (/plaza/[id]) has its own gate.
export function PlazaLoading() {
  return (
    <div className="flex h-full min-h-[280px] w-full flex-col items-center justify-center gap-4">
      <div className="relative h-14 w-14">
        <div className="border-line absolute inset-0 rounded-full border" />
        <div className="border-accent absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-current" />
      </div>
      <p className="text-sub animate-pulse text-[12px]">광장을 불러오는 중…</p>
    </div>
  );
}
