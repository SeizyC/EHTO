import Link from "next/link";
import { SpatialRoom } from "@/components/SpatialRoom";
import { mockupGroups } from "@/data/mockups";

export const metadata = { title: "Mockups · ehto.world" };

export default function MockupsIndex() {
  return (
    <main className="mx-auto min-h-dvh max-w-[420px] bg-black px-4 pb-12 pt-6 text-white/85">
      <header className="mb-6">
        <p className="text-[10px] tracking-[0.3em] text-white/35 uppercase">Design Mockups</p>
        <h1 className="mt-1 text-lg">방의 공기 변형 카탈로그</h1>
        <p className="mt-1 text-[11px] text-white/40">
          공간이 사회 상태를 표현하는지 시각적으로 검증하기 위한 정적 fixture
        </p>
      </header>

      <Section title="Mood 4종" items={mockupGroups.mood} />
      <Section title="Social state 4종" items={mockupGroups.social} />
    </main>
  );
}

function Section({
  title,
  items,
}: {
  title: string;
  items: { id: string; title: string; subtitle: string; mood: any; members: any; bubbles: any; ambient?: any }[];
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-[11px] tracking-[0.2em] text-white/40 uppercase">{title}</h2>
      <div className="grid grid-cols-2 gap-3">
        {items.map((s) => (
          <Link
            key={s.id}
            href={`/mockups/${s.id}`}
            className="group relative overflow-hidden rounded-md border border-white/10 transition hover:border-white/30"
          >
            <div className="aspect-square w-full overflow-hidden">
              <div className="origin-top-left scale-[0.52]" style={{ width: "192%", height: "192%" }}>
                <SpatialRoom
                  mood={s.mood}
                  members={s.members}
                  bubbles={s.bubbles}
                  ambient={s.ambient}
                />
              </div>
            </div>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 py-2">
              <p className="text-[12px] text-white/90">{s.title}</p>
              <p className="text-[10px] text-white/45">{s.subtitle}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
