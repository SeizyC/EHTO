import { dummyWorld } from "@/data/dummyWorld";

export default function IdentityPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col bg-black px-5 py-8 text-white/80">
      <p className="text-[10px] tracking-[0.3em] text-white/35 uppercase">World Identity</p>
      <h1 className="mt-1 text-xl">{dummyWorld.title}</h1>
      <dl className="mt-6 grid grid-cols-2 gap-y-3 text-[12px]">
        <dt className="text-white/40">mood</dt>
        <dd>{dummyWorld.mood}</dd>
        <dt className="text-white/40">social energy</dt>
        <dd>{Math.round(dummyWorld.socialEnergy * 100)}%</dd>
        <dt className="text-white/40">repetition risk</dt>
        <dd>{Math.round(dummyWorld.repetitionRisk * 100)}%</dd>
        <dt className="text-white/40">drift</dt>
        <dd>{dummyWorld.worldDrift.join(" · ")}</dd>
      </dl>
    </main>
  );
}
