"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { MeSheet } from "@/components/MeSheet";
import { useRequireSession } from "@/lib/use-require-session";
import { LOCALES, LOCALE_LABEL, DEFAULT_LOCALE, isLocale, type Locale } from "@/lib/about-content";

const MAX_ROLLS = 3;

type Stage = "select" | "generating" | "result" | "naming" | "error";

export default function CharacterPage() {
  useRequireSession();
  const router = useRouter();
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
  const [rollsUsed, setRollsUsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [meOpen, setMeOpen] = useState(false);

  const remaining = MAX_ROLLS - rollsUsed;
  const canRoll = remaining > 0;

  // Entry guard — character identity is locked once created.
  //   ・ character + handle → /home (returning users land in the plaza
  //                          directory, NOT their own /world — gives them
  //                          discovery as the default. Their own plaza is
  //                          surfaced as the first card by /api/plazas.)
  //   ・ character only     → jump to naming
  //   ・ neither in LS      → fetch from server (fresh-browser returning user);
  //                          if server also has nothing, stay in select flow
  useEffect(() => {
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
  }, [router]);

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
    // Hard cap — same counter for first-make, re-roll, and re-select paths.
    if (rollsUsed >= MAX_ROLLS) {
      setErrorMsg("이번 라운드 티켓을 다 썼어요. 결과 중에서 골라주세요.");
      setStage("error");
      return;
    }
    setStage("generating");
    setErrorMsg("");
    try {
      // 1. Session must already exist — useRequireSession guards this page.
      const sb = browserClient();
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) throw new Error("세션 없음 — 다시 로그인해줘");

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
      setRollsUsed((n) => n + 1);
      setStage("result");
    } catch (e: unknown) {
      setErrorMsg(e instanceof Error ? e.message : "오류");
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
          {(stage === "select" || stage === "result") && (
            <TicketChip remaining={remaining} max={MAX_ROLLS} />
          )}
          <MeGlyph onOpen={() => setMeOpen(true)} />
        </div>
      </header>

      {stage === "select" && (
        <SelectView
          gender={gender} skin={skin} outfit={outfit}
          hairStyle={hairStyle} hairColor={hairColor} accessory={accessory}
          language={language}
          onGender={setGender} onSkin={setSkin} onOutfit={setOutfit}
          onHairStyle={setHairStyle} onHairColor={setHairColor} onAccessory={setAccessory}
          onLanguage={setLanguage}
          onGenerate={generate}
          canGenerate={canRoll}
          remaining={remaining}
        />
      )}

      {stage === "generating" && <GeneratingView />}

      {stage === "result" && imageUrl && (
        <ResultView
          imageUrl={imageUrl}
          remaining={remaining}
          canRoll={canRoll}
          onReroll={generate}
          onBackToSelect={() => setStage("select")}
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

      <MeSheet open={meOpen} onClose={() => setMeOpen(false)} />
    </main>
  );
}

/* ---------- Stages ---------- */

function SelectView(props: {
  gender: GenderId; skin: SkinId; outfit: OutfitId;
  hairStyle: HairStyleId; hairColor: HairColorId; accessory: AccessoryId;
  language: Locale;
  onGender: (g: GenderId) => void;
  onSkin: (s: SkinId) => void;
  onOutfit: (o: OutfitId) => void;
  onHairStyle: (h: HairStyleId) => void;
  onHairColor: (c: HairColorId) => void;
  onAccessory: (a: AccessoryId) => void;
  onLanguage: (l: Locale) => void;
  onGenerate: () => void;
  canGenerate: boolean;
  remaining: number;
}) {
  return (
    <div className="animate-fade-in flex flex-1 flex-col">
      <section className="mb-7">
        <h2 className="text-[20px] font-medium leading-[1.4]">
          어떤 모습으로 머무를까요
        </h2>
        <p className="text-sub mt-2 text-[13px] leading-[1.7]">
          여섯 가지 항목으로 결을 잡아요.
        </p>
      </section>

      <section className="flex flex-1 flex-col gap-7">
        <PillRow label="성별"   options={GENDERS}     value={props.gender}    onChange={props.onGender} />
        <PillRow label="피부톤" options={SKINS}       value={props.skin}      onChange={props.onSkin} />
        <PillRow label="머리"   options={HAIR_STYLES} value={props.hairStyle} onChange={props.onHairStyle} />
        <PillRow label="머리색" options={HAIR_COLORS} value={props.hairColor} onChange={props.onHairColor} />
        <PillRow label="착장"   options={OUTFITS}     value={props.outfit}    onChange={props.onOutfit} />
        <PillRow label="장신구" options={ACCESSORIES} value={props.accessory} onChange={props.onAccessory} />

        {/* Plaza language — sets worlds.language for the world this character
            founds. Defaults to the user's UI locale; drives native member
            generation + ambient language. Same pill style as the rows above. */}
        <div>
          <div className="text-sub mb-2.5 text-[10px] uppercase tracking-[0.22em]">
            광장 언어
          </div>
          <div className="flex flex-wrap gap-2">
            {LOCALES.map((l) => {
              const active = l === props.language;
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => props.onLanguage(l)}
                  aria-pressed={active}
                  className={[
                    "rounded-full border px-4 py-2 text-[13px] font-semibold transition",
                    active
                      ? "border-ink bg-ink text-bg"
                      : "border-line text-sub active:bg-panel hover:border-dim",
                  ].join(" ")}
                >
                  {LOCALE_LABEL[l]}
                </button>
              );
            })}
          </div>
          <p className="text-sub mt-2 text-[11px] leading-relaxed">
            머무는 사람들의 언어 · 나중에 광장 설정에서 바꿀 수 있어요
          </p>
        </div>
      </section>

      <footer className="mt-7 flex flex-col gap-3">
        <PixelButton
          block
          size="lg"
          onClick={props.onGenerate}
          disabled={!props.canGenerate}
        >
          {props.canGenerate
            ? `내 캐릭터 만들기 · 티켓 ${props.remaining}장`
            : "티켓 소진 (결과 중 하나 선택)"}
        </PixelButton>
        <p className="text-sub text-center text-[11px] leading-relaxed">
          이미지 생성엔 약 30초 · 다시 고르기 포함 총 3번까지 시도
        </p>
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
  if (stage === "generating") return <span />; // reserve header space, no action
  const label = stage === "select" ? "← 홈으로" : "← 뒤로";
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

// Small ticket counter shown in the page header during select/result stages.
// Three dots: filled = unused tickets, empty = spent.
function TicketChip({ remaining, max }: { remaining: number; max: number }) {
  return (
    <div
      aria-label={`남은 티켓 ${remaining}장 / ${max}`}
      className="border-line bg-surface flex items-center gap-1.5 rounded-full border px-2.5 py-1"
    >
      <span className="text-sub text-[10px] tracking-wide">티켓</span>
      <span className="flex items-center gap-1">
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className={
              "block h-1.5 w-1.5 rounded-full " +
              (i < remaining ? "bg-accent" : "bg-line")
            }
          />
        ))}
      </span>
      <span className="text-ink ml-0.5 text-[10px] tabular-nums">
        {remaining}/{max}
      </span>
    </div>
  );
}

// Per-step duration (ms). Tuned so total ≈ 18–20s, matching typical
// gpt-image-1 high-quality round-trip. Later steps take longer to feel
// natural ("polish" is slow). If gen finishes early, stage transitions
// out anyway. If it's still running on the last step, the bar keeps
// crawling toward 100% instead of standing still.
const GEN_STEPS: { label: string; ms: number }[] = [
  { label: "캔버스에 자리를 잡는 중",        ms: 2800 },
  { label: "전체 골격을 세우는 중",          ms: 3000 },
  { label: "피부 톤을 입히는 중",            ms: 3200 },
  { label: "어울리는 옷을 골라 입히는 중",   ms: 3400 },
  { label: "머리 모양을 정하는 중",          ms: 3600 },
  { label: "마지막 디테일을 다듬는 중",      ms: 21000 },
];

function GeneratingView() {
  const [step, setStep] = useState(0);

  // Advance through steps one-by-one using the per-step duration.
  useEffect(() => {
    if (step >= GEN_STEPS.length - 1) return; // stay on last step
    const t = setTimeout(() => setStep((s) => s + 1), GEN_STEPS[step].ms);
    return () => clearTimeout(t);
  }, [step]);

  const { label, ms } = GEN_STEPS[step];

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
            {step + 1} / {GEN_STEPS.length}
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
      </div>
    </section>
  );
}

function ResultView(props: {
  imageUrl: string;
  remaining: number;
  canRoll: boolean;
  onReroll: () => void;
  onBackToSelect: () => void;
  onConfirm: () => void;
}) {
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
        <PixelButton block size="lg" onClick={props.onConfirm}>
          이 모습으로 들어가기
        </PixelButton>

        {props.canRoll ? (
          <PixelButton block variant="muted" onClick={props.onReroll}>
            다시 만들기 · {props.remaining}번 남음
          </PixelButton>
        ) : (
          <PixelButton block variant="muted" disabled>
            티켓으로 한 번 더 (잠금)
          </PixelButton>
        )}

        <button
          onClick={props.onBackToSelect}
          className="text-sub hover:text-ink mt-1 text-center text-[11px] underline-offset-4 transition hover:underline"
        >
          다시 고르기
        </button>
      </footer>
    </div>
  );
}

function NamingView(props: { imageUrl: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
          ? "이미 누군가 쓰고 있어요"
          : "지금은 저장이 어려워요",
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
            어떻게 불릴까요
          </h2>
          <p className="text-sub text-[12.5px] leading-relaxed">
            세계에서 당신을 부르는 이름. 1–12자.
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
            placeholder="이름…"
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
          {submitting ? "들어가는 중…" : "이 이름으로 들어가기"}
        </PixelButton>
        <p className="text-sub text-center text-[11px]">
          이름은 나중에 설정에서 바꿀 수 있어요
        </p>
      </footer>
    </div>
  );
}

function ErrorView(props: { message: string; onRetry: () => void; onBack: () => void }) {
  return (
    <section className="animate-fade-in flex flex-1 flex-col items-center justify-center gap-5">
      <p className="text-sub text-center text-[14px] leading-[1.7]">
        지금은 잘 안 만들어져요.
        <br />
        <span className="text-dim mt-1 inline-block text-[11px]">{props.message}</span>
      </p>
      <div className="flex gap-3">
        <PixelButton onClick={props.onRetry}>다시 시도</PixelButton>
        <PixelButton variant="muted" onClick={props.onBack}>돌아가기</PixelButton>
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
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
