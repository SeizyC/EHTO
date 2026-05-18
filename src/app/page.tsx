"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useProfile } from "@/lib/profileStore";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    const profile = useProfile.getState().profile;
    router.replace(profile ? "/world" : "/signup");
  }, [router]);
  return (
    <main className="grid min-h-dvh place-items-center bg-black text-[11px] tracking-widest text-white/40">
      ehto.world …
    </main>
  );
}
