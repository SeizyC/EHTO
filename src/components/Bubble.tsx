export function Bubble({ text }: { text: string }) {
  return (
    <div className="animate-bubble pointer-events-none">
      <div className="relative max-w-[180px] rounded-md border border-white/10 bg-black/70 px-2 py-1 text-[11px] leading-tight text-white/85 backdrop-blur-sm">
        {text}
        <span className="absolute -bottom-1 left-3 h-2 w-2 rotate-45 border-b border-r border-white/10 bg-black/70" />
      </div>
    </div>
  );
}
