// Pre-auth onboarding draft (invite code + room name) held in localStorage
// so it survives the Google OAuth redirect round-trip. The serialize/parse
// pair is pure + tested; the load/save/clear wrappers touch localStorage and
// are guarded for SSR.

export type OnboardingDraft = { code: string; roomName: string };
export const EMPTY_DRAFT: OnboardingDraft = { code: "", roomName: "" };
const KEY = "ehto:onboarding:v1";

export function serializeDraft(d: OnboardingDraft): string {
  return JSON.stringify({ code: d.code, roomName: d.roomName });
}

export function parseDraft(raw: string | null): OnboardingDraft {
  if (!raw) return EMPTY_DRAFT;
  try {
    const o = JSON.parse(raw) as Partial<OnboardingDraft>;
    return {
      code: typeof o.code === "string" ? o.code : "",
      roomName: typeof o.roomName === "string" ? o.roomName : "",
    };
  } catch {
    return EMPTY_DRAFT;
  }
}

export function loadDraft(): OnboardingDraft {
  if (typeof window === "undefined") return EMPTY_DRAFT;
  try { return parseDraft(window.localStorage.getItem(KEY)); }
  catch { return EMPTY_DRAFT; }
}

export function saveDraft(d: OnboardingDraft): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, serializeDraft(d)); } catch { /* private mode */ }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
}
