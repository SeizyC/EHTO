"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_OUTFIT, useProfile } from "@/lib/profileStore";

export default function SignupPage() {
  const router = useRouter();
  const setProfile = useProfile((s) => s.setProfile);
  const [email, setEmail] = useState("");
  const [handle, setHandle] = useState("");
  const [agreed, setAgreed] = useState(false);

  const valid = /\S+@\S+\.\S+/.test(email) && handle.trim().length >= 2 && agreed;

  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col bg-black px-6 py-10 text-white/85">
      <div className="mb-10 text-center">
        <p className="text-[10px] tracking-[0.4em] text-white/40 uppercase">ehto.world</p>
        <h1 className="mt-3 text-2xl">
          Everyone Has<br />Their Own World
        </h1>
      </div>

      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          setProfile({
            email: email.trim(),
            handle: handle.trim(),
            creature: "cozy_spirit",
            outfit: DEFAULT_OUTFIT,
            createdAt: new Date().toISOString(),
          });
          router.push("/character");
        }}
      >
        <Field label="email">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@somewhere"
            className="w-full bg-transparent border-b border-white/15 py-2 text-[14px] text-white outline-none focus:border-white/45"
          />
        </Field>
        <Field label="handle">
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="moss"
            maxLength={16}
            className="w-full bg-transparent border-b border-white/15 py-2 text-[14px] text-white outline-none focus:border-white/45"
          />
        </Field>

        <label className="flex cursor-pointer items-start gap-3 pt-3 text-[12px] text-white/55">
          <span
            onClick={() => setAgreed((v) => !v)}
            className={
              "mt-0.5 inline-block h-4 w-4 shrink-0 border " +
              (agreed ? "border-sky-300 bg-sky-300/40" : "border-white/30")
            }
          />
          <span>
            관찰하는 공간에서 머무는 것에 동의합니다.<br />
            <span className="text-white/30">소셜 신호와 분위기는 이 계정에 누적됩니다.</span>
          </span>
        </label>

        <button
          type="submit"
          disabled={!valid}
          className="mt-8 w-full border border-white/20 bg-white/5 py-3 text-[13px] tracking-widest text-white/90 transition disabled:opacity-30 enabled:hover:bg-white/10"
        >
          ENTER
        </button>
      </form>

      <p className="mt-auto pt-12 text-center text-[10px] text-white/25">
        v0 prototype · no auth backend yet
      </p>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] tracking-[0.3em] text-white/35 uppercase">{label}</span>
      {children}
    </label>
  );
}
