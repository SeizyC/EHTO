"use client";

// Top-left ambient indicator — mood/time of the world. Tap to peek world id.
// Dummy text for now; later wired to WorldState.

type Props = {
  mood: string;
  onPeek?: () => void;
};

export function AmbientHeader({ mood, onPeek }: Props) {
  return (
    <button
      onClick={onPeek}
      className="text-sub group flex items-center gap-1.5 text-left"
    >
      <span className="bg-accent group-active:bg-accent/60 inline-block h-1.5 w-1.5 rounded-full" />
      <span className="text-[12px] tracking-wide">{mood}</span>
    </button>
  );
}
