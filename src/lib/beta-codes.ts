// Beta invite codes — pure generation helpers + DB operations.
//
// Codes are 8 chars from an unambiguous alphabet (no 0/O/1/I/L) so they're
// easy to read aloud / type. Generation is pure + tested; the DB helpers
// (validate / consume+reward / issue / list) run with the service role.

import type { SupabaseClient } from "@supabase/supabase-js";
import { grantEhto } from "@/lib/ehto";

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0 O 1 I L
export const CODE_RE = /^[2-9A-HJ-NP-Z]{8}$/;
const CODE_LEN = 8;
const CODES_PER_USER = 3;

/** A single random code. Uses Math.random — fine for non-secret invite
 *  codes (uniqueness is enforced by the DB primary key + retry on insert). */
export function generateCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

/** n distinct codes. */
export function generateCodes(n: number): string[] {
  const set = new Set<string>();
  while (set.size < n) set.add(generateCode());
  return Array.from(set);
}

export const PER_USER = CODES_PER_USER;

/** True if the code exists and is unused. Service-role read (codes are not
 *  client-readable except your own). */
export async function validateCode(svc: SupabaseClient, code: string): Promise<boolean> {
  if (!CODE_RE.test(code)) return false;
  const { data } = await svc
    .from("beta_codes")
    .select("code")
    .eq("code", code)
    .is("used_by", null)
    .maybeSingle();
  return !!data;
}

/** Atomically consume `code` for `uid`. Returns:
 *   - { ok: true, alreadyMine: true } if this user already consumed it (idempotent)
 *   - { ok: true } on a fresh consume (and grants the owner's reward if their pool is now exhausted)
 *   - { ok: false } if the code is missing / already used by someone else. */
export async function consumeCodeAndReward(
  svc: SupabaseClient,
  uid: string,
  code: string,
): Promise<{ ok: boolean; alreadyMine?: boolean }> {
  if (!CODE_RE.test(code)) return { ok: false };
  // Atomic claim: only succeeds while used_by is null.
  const { data: claimed } = await svc
    .from("beta_codes")
    .update({ used_by: uid, used_at: new Date().toISOString() })
    .eq("code", code)
    .is("used_by", null)
    .select("owner_user_id")
    .maybeSingle();

  if (!claimed) {
    // Either missing, or already used. If THIS user used it before, treat as ok.
    const { data: mine } = await svc
      .from("beta_codes")
      .select("code")
      .eq("code", code)
      .eq("used_by", uid)
      .maybeSingle();
    return mine ? { ok: true, alreadyMine: true } : { ok: false };
  }

  // Fresh consume — check if the code's owner has now used up all their codes.
  const ownerId = (claimed as { owner_user_id: string | null }).owner_user_id;
  if (ownerId) await maybeGrantInviteReward(svc, ownerId);
  return { ok: true };
}

/** If `ownerId` has codes and ALL are consumed and the reward hasn't been
 *  granted yet, grant one bonus 'invite' ticket and stamp the marker. */
async function maybeGrantInviteReward(svc: SupabaseClient, ownerId: string): Promise<void> {
  const { data: owned } = await svc
    .from("beta_codes")
    .select("used_by")
    .eq("owner_user_id", ownerId);
  const codes = owned ?? [];
  if (codes.length === 0) return;
  const allUsed = codes.every((c) => (c as { used_by: string | null }).used_by !== null);
  if (!allUsed) return;

  // Atomically claim the one-time reward: stamp the marker only while it is
  // still null. `update ... where invite_reward_granted_at is null` is a
  // single statement, so exactly one concurrent caller wins the row — this
  // prevents a double-grant when the owner's last two codes are consumed at
  // nearly the same moment (the prior read-then-write had a race window).
  const { data: claimed } = await svc
    .from("profiles")
    .update({ invite_reward_granted_at: new Date().toISOString() })
    .eq("id", ownerId)
    .is("invite_reward_granted_at", null)
    .select("id")
    .maybeSingle();
  if (!claimed) return; // already claimed/granted by another path

  await grantEhto(svc, ownerId, 3); // invite-completion reward, in EHTO
}

/** Ensure `uid` owns PER_USER codes — issue the difference. Idempotent. */
export async function issueCodesForUser(svc: SupabaseClient, uid: string): Promise<void> {
  const { count } = await svc
    .from("beta_codes")
    .select("code", { count: "exact", head: true })
    .eq("owner_user_id", uid);
  const have = count ?? 0;
  if (have >= PER_USER) return;
  // Insert one at a time; on a PK collision (rare) just try another code.
  let issued = have;
  let guard = 0;
  while (issued < PER_USER && guard++ < 50) {
    const { error } = await svc
      .from("beta_codes")
      .insert({ code: generateCode(), owner_user_id: uid });
    if (!error) issued++;
  }
}

export type MyCode = { code: string; used: boolean };

/** This user's owned codes + used/unused state. */
export async function listUserCodes(svc: SupabaseClient, uid: string): Promise<MyCode[]> {
  const { data } = await svc
    .from("beta_codes")
    .select("code, used_by")
    .eq("owner_user_id", uid)
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => ({
    code: (r as { code: string }).code,
    used: (r as { used_by: string | null }).used_by !== null,
  }));
}
