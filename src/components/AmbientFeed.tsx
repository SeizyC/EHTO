import type { FeedItem, Member } from "@/types/world";

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  return `${h}시간 전`;
}

const TYPE_TINT: Record<FeedItem["type"], string> = {
  conversation: "text-white/85",
  presence: "text-white/55",
  event: "text-amber-200/80",
  drift: "text-sky-200/70 italic",
  media: "text-fuchsia-200/75",
};

export function AmbientFeed({
  items,
  members,
}: {
  items: FeedItem[];
  members: Member[];
}) {
  const byId = Object.fromEntries(members.map((m) => [m.id, m] as const));
  const ordered = [...items].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  return (
    <section className="border-t border-white/5 px-5 py-3 max-h-44 overflow-y-auto">
      <p className="text-[10px] tracking-[0.3em] text-white/35 uppercase mb-2">Ambient Feed</p>
      <ul className="space-y-1.5 text-[12px]">
        {ordered.map((item) => {
          const actor = item.actorId ? byId[item.actorId] : null;
          return (
            <li key={item.id} className="flex items-baseline gap-2">
              <span className="text-[10px] text-white/25 w-12 shrink-0">{relTime(item.createdAt)}</span>
              <span className={TYPE_TINT[item.type]}>
                {actor && item.type === "conversation" ? (
                  <>
                    <span className="text-white/45">{actor.name}: </span>
                    {item.content}
                  </>
                ) : (
                  item.content
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
