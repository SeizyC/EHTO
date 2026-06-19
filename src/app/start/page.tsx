"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase";
import { AuthModal } from "@/components/AuthModal";
import { loadDraft, saveDraft, clearDraft } from "@/lib/onboarding-draft";

type Step = "code" | "name" | "auth";

export default function StartPage() {
  const router = useRouter();
  const initial = loadDraft();
  const [step, setStep] = useState<Step>("code");
  const [code, setCode] = useState(initial.code);
  const [roomName, setRoomName] = useState(initial.roomName);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submitCode() {
    if (busy) return;
    const c = code.trim().toUpperCase();
    if (!c) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/beta/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: c }),
      });
      const j = await r.json();
      if (!j.ok) { setErr("초대코드가 올바르지 않거나 이미 사용됐어요."); return; }
      setCode(c);
      saveDraft({ code: c, roomName });
      setStep("name");
    } catch {
      setErr("네트워크 오류. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  function submitName() {
    const n = roomName.trim();
    if (n.length < 1 || n.length > 16) { setErr("방 이름은 1~16자."); return; }
    setErr(null);
    saveDraft({ code: code.trim().toUpperCase(), roomName: n });
    setStep("auth");
  }

  async function onAuthed() {
    setBusy(true); setErr(null);
    try {
      const sb = browserClient();
      const { data: sess } = await sb.auth.getSession();
      if (!sess.session) { setErr("세션이 없습니다."); return; }
      const r = await fetch("/api/onboarding/finalize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sess.session.access_token}`,
        },
        body: JSON.stringify({ code: code.trim().toUpperCase(), roomName: roomName.trim() }),
      });
      const j = await r.json();
      if (!r.ok) {
        if (r.status === 409) { setErr("초대코드가 방금 소진됐어요. 다른 코드로 다시 시도해주세요."); setStep("code"); return; }
        setErr(j.error ?? "확정 실패"); return;
      }
      clearDraft();
      router.replace("/character");
    } catch {
      setErr("네트워크 오류. 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 p-6">
      {step === "code" && (
        <>
          <h1 className="text-ink text-xl font-medium">초대코드</h1>
          <p className="text-muted text-sm">초대받은 코드를 입력해주세요.</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="ABCD2345"
            className="border-line bg-bg text-ink rounded-xl border px-3 py-2 tracking-widest"
          />
          {err && <p className="text-muted text-sm">{err}</p>}
          <button onClick={submitCode} disabled={busy || !code.trim()}
            className="bg-ink text-bg rounded-xl py-2.5 font-medium disabled:opacity-40">
            다음
          </button>
          <button onClick={() => router.push("/login")} className="text-muted text-center text-sm">
            이미 계정이 있어요
          </button>
        </>
      )}

      {step === "name" && (
        <>
          <h1 className="text-ink text-xl font-medium">광장 이름</h1>
          <p className="text-muted text-sm">당신의 광장을 뭐라고 부를까요? (1~16자)</p>
          <input
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            maxLength={16}
            placeholder="예: 새벽 광장"
            className="border-line bg-bg text-ink rounded-xl border px-3 py-2"
          />
          {err && <p className="text-muted text-sm">{err}</p>}
          <div className="flex gap-2">
            <button onClick={() => { setErr(null); setStep("code"); }}
              className="border-line text-ink flex-1 rounded-xl border py-2.5">뒤로</button>
            <button onClick={submitName} disabled={!roomName.trim()}
              className="bg-ink text-bg flex-1 rounded-xl py-2.5 font-medium disabled:opacity-40">다음</button>
          </div>
        </>
      )}

      <AuthModal open={step === "auth"} onClose={() => setStep("name")} onAuthed={onAuthed} />
      {step === "auth" && err && <p className="text-muted text-center text-sm">{err}</p>}
    </main>
  );
}
