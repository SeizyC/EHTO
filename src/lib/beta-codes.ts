// Beta invite codes — pure generation helpers + DB operations.
//
// Codes are 8 chars from an unambiguous alphabet (no 0/O/1/I/L) so they're
// easy to read aloud / type. Generation is pure + tested; the DB helpers
// (validate / consume+reward / issue / list) run with the service role.

import type { SupabaseClient } from "@supabase/supabase-js";
import { grant } from "@/lib/ticket-balance";

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
