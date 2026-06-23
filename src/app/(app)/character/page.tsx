"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CharacterCommitDialog } from "@/components/CharacterCommitDialog";
import {
  GENDERS,
  SKINS,
  OUTFITS,
  HAIR_STYLES,
  HAIR_COLORS,
  ACCESSORIES,
  type GenderId,
  type SkinId,
  type OutfitId,
  type HairStyleId,
  type HairColorId,
  type AccessoryId,
} from "@/lib/prompts";
import { saveCharacter, loadCharacter, saveHandle } from "@/lib/character-store";
import { browserClient } from "@/lib/supabase";
import { PixelButton } from "@/components/PixelButton";
import { MeGlyph } from "@/components/MeGlyph";
import { EhtoBadge } from "@/components/EhtoBadge";
import { MeSheet } from "@/components/MeSheet";
import { useRequireSession } from "@/lib/use-require-session";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/about-content";
import { useLocale } from "@/lib/use-locale";
import { ONBOARDING, OPTION_LABELS } from "@/lib/onboarding-content";
import { AnimatePresence, motion } from "framer-motion";

type Stage = "select" | "generating" | "result" | "naming" | "error";

// Wrap in Suspense: useSearchParams() requires a Suspense boundary or the
// page must be dynamically rendered (Next 14 App Router build requirement).
export default function CharacterPage() {
  return (
    <Suspense fallback={null}>
      <CharacterPageInner />
    </Suspense>
  );
}

function CharacterPageInner() {
  useRequireSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const change = searchParams.get("change") === "1";
  const { locale } = useLocale(DEFAULT_LOCALE);
  const t = ONBOARDING[locale].character;
  const [stage, setStage] = useState<Stage>("select");
  const [gender, setGender] = useState<GenderId>("m");
  const [skin, setSkin] = useState<SkinId>("fair");
  const [outfit, setOutfit] = useState<OutfitId>("casual");
  const [hairStyle, setHairStyle] = useState<HairStyleId>("short");
  const [hairColor, setHairColor] = useState<HairColorId>("black");
  const [accessory, setAccessory] = useState<AccessoryId>("none");
  // Plaza language for the world this character founds. Defaults to the
  // user's current UI locale (the same `ehto:locale` key useLocale reads);
  // falls back to "ko". Only sent on creation; the owner can change it later
  // in world settings. SSR renders the default — reconciled on mount below.
  const [language, setLanguage] = useState<Locale>(DEFAULT_LOCALE);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [characterId, setCharacterId] = useState<string | null>(null);
  const [rolledHair, setRolledHair] = useState<string | undefined>();
  const [errorMsg, setErrorMsg] = useState("");
  const [meOpen, setMeOpen] = useState(false);

  const [confirming, setConfirming] = useState(false);

  // Entry guard — character identity is locked once created.
  //   ・ character + handle → /home (returning users land in the plaza
  //                          directory, NOT their own /world — gives them
  //                          discovery as the default. Their own plaza is
  //                          surfaced as the first card by /api/plazas.)
  //   ・ character only     → jump to naming
  //   ・ neither in LS      → fetch from server (fresh-browser returning user);
  //                          if server also has nothing, stay in select flow
  useEffect(() => {
    // change=1 mode: user is re-creating their character (costs 5 EHTO).
    // Skip all redirects that would send them away from the select stage.
    if (change) return;

    const cached = loadCharacter();
    if (cached) {
      if (cached.handle) {
        router.replace("/home");
        return;
      }
      setImageUrl(cached.imageUrl);
      setCharacterId(cached.id);
      setStage("naming");
      return;
    }

    // No LS — try to recover from server.
    let cancelled = false;
    (async () => {
      const sb = browserClient();
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) return;
      const r = await fetch("/api/character/me", {
        headers: { Authorization: `Bearer ${sess.session.access_token}` },
      });
      if (cancelled || !r.ok) return;
      const j = await r.json();
      const ch = j.character;
      if (!ch) return; // user really has no character yet → stay on select
      saveCharacter({
        id: ch.id,
        imageUrl: ch.imageUrl,
        gender: ch.gender,
        skin: ch.skin,
        outfit: ch.outfit,
        rolledHair: ch.rolledHair,
        handle: ch.handle,
        createdAt: ch.createdAt,
      });
      if (ch.handle) {
        router.replace("/home");
      } else {
        setImageUrl(ch.imageUrl);
        setCharacterId(ch.id);
        setStage("naming");
      }
    })();
    return () => { cancelled = true; };
  }, [router, change]);

  // Default the plaza language to the user's current UI locale. useLocale
  // persists the picked locale to this same localStorage key on the public
  // pages; if unset (never picked), we keep the "ko" default.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("ehto:locale");
      if (isLocale(saved)) setLanguage(saved);
    } catch {
      /* private mode — keep default */
    }
  }, []);

  async function generate() {
    setStage("generating");
    setErrorMsg("");
    try {
      // 1. Session must already exist — useRequireSession guards this page.
      const sb = browserClient();
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) throw new Error(t.genNoSession);

      // 2. Call API with token
      const r = await fetch("/api/generate-character", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sess.session!.access_token}`,
        },
        body: JSON.stringify({
          gender, skin, outfit, hairStyle, hairColor, accessory, language,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Failed");

      setImageUrl(j.publicUrl);
      setCharacterId(j.character?.id ?? null);
      setRolledHair(j.rolled?.hair);
      setStage("result");
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : t.genGeneric);
      setStage("error");
    }
  }

  function confirmEnter() {
    if (!imageUrl || !characterId) return;
    saveCharacter({
      id: characterId,
      imageUrl,
      gender,
      skin,
      outfit,
      rolledHair,
      createdAt: Date.now(),
    });
    setStage("naming");
  }

  return (
    <main className="grain mx-auto flex min-h-dvh max-w-[420px] flex-col px-5 pb-8 pt-6">
      <header className="mb-4 flex items-center justify-between">
        <BackLink stage={stage} onBack={() => goBack(stage, setStage, router)} />
        <div className="flex items-center gap-2.5">
          <EhtoBadge />
          <MeGlyph onOpen={() => setMeOpen(true)} />
        </div>
      </header>

      {stage === "select" && (
        <SelectView
          gender={gender} skin={skin} outfit={outfit}
          hairStyle={hairStyle} hairColor={hairColor} accessory={accessory}
          onGender={setGender} onSkin={setSkin} onOutfit={setOutfit}
          onHairStyle={setHairStyle} onHairColor={setHairColor} onAccessory={setAccessory}
          onRequestCreate={() => setConfirming(true)}
        />
      )}

      {stage === "generating" && <GeneratingView />}

      {stage === "result" && imageUrl && (
        <ResultView
          imageUrl={imageUrl}
          onConfirm={confirmEnter}
        />
      )}

      {stage === "naming" && imageUrl && (
        <NamingView
          imageUrl={imageUrl}
          onDone={() => router.push("/world")}
        />
      )}

      {stage === "error" && (
        <ErrorView
          message={errorMsg}
          onRetry={generate}
          onBack={() => setStage("select")}
        />
      )}

      <CharacterCommitDialog
        open={confirming}
        copy={ONBOARDING[locale].character}
        onConfirm={() => { setConfirming(false); generate(); }}
        onCancel={() => setConfirming(false)}
      />

      <MeSheet open={meOpen} onClose={() => setMeOpen(false)} />
    </main>
  );
}

/* ---------- Stages ---------- */

function SelectView(props: {
  gender: GenderId; skin: SkinId; outfit: OutfitId;
  hairStyle: HairStyleId; hairColor: HairColorId; accessory: AccessoryId;
  onGender: (g: GenderId) => void;
  onSkin: (s: SkinId) => void;
  onOutfit: (o: OutfitId) => void;
  onHairStyle: (h: HairStyleId) => void;
  onHairColor: (c: HairColorId) => void;
  onAccessory: (a: AccessoryId) => void;
  onRequestCreate: () => void;
}) {
  const { locale } = useLocale(DEFAULT_LOCALE);
  const t = ONBOARDING[locale].character;
  const nav = ONBOARDING[locale].start; // 다음 / 뒤로 labels (shared funnel copy)
  const [step, setStep] = useState(0);
  const TOTAL = 6;
  const isLast = step === TOTAL - 1;

  return (
    <div className="animate-fade-in flex flex-1 flex-col">
      <section className="mb-5 mt-8">
        <h2 className="text-[20px] font-medium leading-[1.4]">{t.selTitle}</h2>
        <p className="text-sub mt-2 text-[13px] leading-[1.7]">{t.selSub}</p>
      </section>

      {/* Step progress */}
      <div className="mb-6 flex items-center gap-1.5">
        {Array.from({ length: TOTAL }).map((_, i) => (
          <span
            key={i}
            className={[
              "h-1.5 rounded-full transition-all duration-300",
              i === step ? "bg-ink w-6" : i < step ? "bg-ink/40 w-3" : "bg-line w-3",
            ].join(" ")}
          />
        ))}
        <span className="text-sub ml-auto text-[12px] tabular-nums">{step + 1} / {TOTAL}</span>
      </div>

      {/* One attribute per step */}
      <section className="flex flex-1 flex-col">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {step === 0 && <PillRow label={t.secGender}    options={GENDERS}     value={props.gender}    onChange={props.onGender} />}
            {step === 1 && <PillRow label={t.secSkin}      options={SKINS}       value={props.skin}      onChange={props.onSkin} />}
            {step === 2 && <PillRow label={t.secHair}      options={HAIR_STYLES} value={props.hairStyle} onChange={props.onHairStyle} />}
            {step === 3 && <PillRow label={t.secHairColor} options={HAIR_COLORS} value={props.hairColor} onChange={props.onHairColor} />}
            {step === 4 && <PillRow label={t.secOutfit}    options={OUTFITS}     value={props.outfit}    onChange={props.onOutfit} />}
            {step === 5 && <PillRow label={t.secAccessory} options={ACCESSORIES} value={props.accessory} onChange={props.onAccessory} />}
          </motion.div>
        </AnimatePresence>
      </section>

      <footer className="mt-7 flex flex-col gap-3">
        <PixelButton
          variant="primary"
          size="lg"
          block
          onClick={isLast ? props.onRequestCreate : () => setStep(step + 1)}
        >
          {isLast ? t.selCreate : nav.next}
        </PixelButton>
        {step > 0 && (
          <button
            onClick={() => setStep(step - 1)}
            className="text-sub text-center text-[13px] active:opacity-70"
          >
            {nav.back}
          </button>
        )}
        <p className="text-sub text-center text-[11px] leading-relaxed">{t.selHint}</p>
      </footer>
    </div>
  );
}

// Header back link — goes back ONE step within the character-creation
// pipeline instead of bouncing all the way to "/". On the very first
// stage (select) it does still leave the flow to home; on stages mid-
// generation it hides itself entirely because canceling an in-flight
// OpenAI call cleanly isn't worth the complexity right now.
function BackLink({
  stage,
  onBack,
}: {
  stage: Stage;
  onBack: () => void;
}) {
  const { locale } = useLocale(DEFAULT_LOCALE);
  const t = ONBOARDING[locale].character;

  if (stage === "generating") return <span />; // reserve header space, no action
  const label = stage === "select" ? t.backHome : t.backStep;
  return (
    <button
      type="button"
      onClick={onBack}
      className="text-sub hover:text-ink text-[13px] transition"
    >
      {label}
    </button>
  );
}

// Decide where ← takes the user based on the current pipeline stage.
function goBack(
  stage: Stage,
  setStage: (s: Stage) => void,
  router: ReturnType<typeof useRouter>,
) {
  switch (stage) {
    case "select":      router.push("/"); return;
    case "result":      setStage("select"); return;
    case "naming":      setStage("result"); return;
    case "error":       setStage("select"); return;
    case "generating":  return; // no-op
  }
}

// Per-step duration (ms). Tuned so total ≈ 18–20s, matching typical
// gpt-image-1 high-quality round-trip. Later steps take longer to feel
// natural ("polish" is slow). If gen finishes early, stage transitions
// out anyway. If it's still running on the last step, the bar keeps
// crawling toward 100% instead of standing still.
const GEN_STEP_DURATIONS: number[] = [2800, 3000, 3200, 3400, 3600, 21000];

function GeneratingView() {
  const [step, setStep] = useState(0);
  const { locale } = useLocale(DEFAULT_LOCALE);
  const t = ONBOARDING[locale].character;

  // Advance through steps one-by-one using the per-step duration.
  useEffect(() => {
    if (step >= GEN_STEP_DURATIONS.length - 1) return; // stay on last step
    const timer = setTimeout(() => setStep((s) => s + 1), GEN_STEP_DURATIONS[step]);
    return () => clearTimeout(timer);
  }, [step]);

  const ms = GEN_STEP_DURATIONS[step];
  const label = t.genSteps[step];

  return (
    <section className="animate-fade-in spotlight relative flex flex-1 flex-col items-center justify-center gap-10 overflow-hidden px-2">
      {/* breathing focus orb */}
      <div className="relative h-[120px] w-[120px]">
        <div className="border-line absolute inset-0 rounded-full border" />
        <div className="bg-accent/15 absolute inset-3 animate-breathe-glow rounded-full blur-2xl" />
        <div className="bg-surface absolute inset-[28%] animate-pulse rounded-full" />
      </div>

      {/* Single thick bar — one label, advances with the step. */}
      <div className="w-full max-w-[280px] space-y-3">
        <div className="flex items-baseline justify-between">
          <span key={label} className="text-ink animate-fade-up text-[13.5px]">
            {label}
          </span>
          <span className="text-dim text-[10.5px] tracking-wide">
            {step + 1} / {t.genSteps.length}
          </span>
        </div>
        <div className="bg-line h-2 w-full overflow-hidden rounded-full">
          {/* key on step → animation restarts each step. The bar always
              fills over the step's ms; on the long last step it crawls
              steadily and the stage usually transitions before it hits 100. */}
          <div
            key={step}
            className="bg-accent h-full"
            style={{ animation: `barFill ${ms}ms ease-out forwards` }}
          />
        </div>
        {/* Reassurance on the final step, under the bar. */}
        {step === t.genSteps.length - 1 && (
          <p className="text-sub animate-fade-up text-center text-[12px]">{t.genAlmostDone}</p>
        )}
      </div>
    </section>
  );
}

function ResultView(props: {
  imageUrl: string;
  onConfirm: () => void;
}) {
  const { locale } = useLocale(DEFAULT_LOCALE);
  const t = ONBOARDING[locale].character;

  return (
    <div className="animate-fade-in flex flex-1 flex-col">
      {/* Stage with theatrical lighting */}
      <section className="stage-light relative my-2 flex flex-1 items-center justify-center overflow-hidden rounded-lg">
        <div className="relative h-[440px] w-[300px]">
          {/* Warm floor halo where the beam lands */}
          <div className="floor-glow pointer-events-none absolute bottom-[5%] left-1/2 h-[36px] w-[240px] -translate-x-1/2" />
          {/* Soft elliptical shadow grounding the figure */}
          <div className="foot-shadow pointer-events-none absolute bottom-[3%] left-1/2 h-[14px] w-[150px] -translate-x-1/2" />
          {/* Character with sway */}
          <div className="relative h-full w-full animate-sway">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={props.imageUrl}
              src={props.imageUrl}
              alt=""
              className="pixelated animate-fade-up absolute inset-0 h-full w-full object-contain"
              draggable={false}
            />
          </div>
        </div>
      </section>

      <footer className="mt-3 flex flex-col gap-3">
        {/* One-shot: the result is final — only proceed to naming. The
            commit dialog already gave the "go back" option before generation. */}
        <PixelButton block size="lg" onClick={props.onConfirm}>
          {t.resEnter}
        </PixelButton>
      </footer>
    </div>
  );
}

function NamingView(props: { imageUrl: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { locale } = useLocale(DEFAULT_LOCALE);
  const t = ONBOARDING[locale].character;

  const trimmed = name.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= 12;

  async function submit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    setErr(null);
    const { error } = await saveHandle(trimmed);
    setSubmitting(false);
    if (error) {
      setErr(
        error.toLowerCase().includes("duplicate")
          ? t.nameErrDup
          : t.nameErrSave,
      );
      return;
    }
    props.onDone();
  }

  return (
    <div className="animate-fade-in flex flex-1 flex-col">
      {/* Character peek — smaller, leaves room for the prompt */}
      <section className="spotlight relative my-2 flex items-center justify-center overflow-hidden rounded-lg py-4">
        <div className="relative h-[240px] w-[160px]">
          <div className="floor-glow pointer-events-none absolute bottom-[4%] left-1/2 h-[22px] w-[140px] -translate-x-1/2" />
          <div className="foot-shadow pointer-events-none absolute bottom-[2%] left-1/2 h-[10px] w-[90px] -translate-x-1/2" />
          <div className="animate-sway relative h-full w-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={props.imageUrl}
              alt=""
              className="pixelated absolute inset-0 h-full w-full object-contain"
              draggable={false}
            />
          </div>
        </div>
      </section>

      {/* Name input */}
      <section className="mt-3 space-y-4 px-1">
        <div className="space-y-1.5">
          <h2 className="text-ink text-[18px] font-medium">
            {t.nameTitle}
          </h2>
          <p className="text-sub text-[12.5px] leading-relaxed">
            {t.nameSub}
          </p>
        </div>

        <div className="border-line bg-surface flex items-center rounded-full border px-4 py-3">
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value.slice(0, 12));
              setErr(null);
            }}
            placeholder={t.namePlaceholder}
            maxLength={12}
            autoFocus
            className="text-ink placeholder:text-dim flex-1 bg-transparent text-[14px] outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && valid) submit();
            }}
          />
          <span className="text-dim ml-2 text-[10.5px] tabular-nums">
            {trimmed.length} / 12
          </span>
        </div>

        {err && <p className="text-accent text-[11.5px]">{err}</p>}
      </section>

      <footer className="mt-auto flex flex-col gap-2.5 pb-2">
        <PixelButton
          block
          size="lg"
          disabled={!valid || submitting}
          onClick={submit}
        >
          {submitting ? t.nameSubmitting : t.nameSubmit}
        </PixelButton>
        <p className="text-sub text-center text-[11px]">
          {t.nameHint}
        </p>
      </footer>
    </div>
  );
}

function ErrorView(props: { message: string; onRetry: () => void; onBack: () => void }) {
  const { locale } = useLocale(DEFAULT_LOCALE);
  const t = ONBOARDING[locale].character;

  return (
    <section className="animate-fade-in flex flex-1 flex-col items-center justify-center gap-5">
      <p className="text-sub text-center text-[14px] leading-[1.7]">
        {t.errMsg}
        <br />
        <span className="text-dim mt-1 inline-block text-[11px]">{props.message}</span>
      </p>
      <div className="flex gap-3">
        <PixelButton onClick={props.onRetry}>{t.errRetry}</PixelButton>
        <PixelButton variant="muted" onClick={props.onBack}>{t.errBack}</PixelButton>
      </div>
    </section>
  );
}

/* ---------- Bits ---------- */

function PillRow<T extends string>(props: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { locale } = useLocale(DEFAULT_LOCALE);

  return (
    <div>
      <div className="text-sub mb-2.5 text-[10px] uppercase tracking-[0.22em]">
        {props.label}
      </div>
      <div className="flex flex-wrap gap-2">
        {props.options.map((opt) => {
          const active = opt.id === props.value;
          return (
            <button
              key={opt.id}
              onClick={() => props.onChange(opt.id)}
              className={[
                "rounded-full border px-4 py-2 text-[13px] transition",
                active
                  ? "border-ink bg-ink text-bg"
                  : "border-line text-sub active:bg-panel hover:border-dim",
              ].join(" ")}
            >
              {OPTION_LABELS[locale][opt.id] ?? opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
