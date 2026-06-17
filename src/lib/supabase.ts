// Supabase clients — three contexts:
//   browserClient()   : client components; uses anon key, persists session in browser
//   serviceClient()   : server routes; service role, bypasses RLS (use carefully)
//   userClient(token) : server routes; runs as a specific user (RLS enforced)

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let _browser: SupabaseClient | null = null;
let _service: SupabaseClient | null = null;

export function browserClient(): SupabaseClient {
  if (_browser) return _browser;
  if (!URL || !ANON) throw new Error("Supabase URL or ANON key missing");
  _browser = createClient(URL, ANON, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return _browser;
}

export function serviceClient(): SupabaseClient {
  if (_service) return _service;
  if (!URL || !SERVICE) throw new Error("Supabase URL or SERVICE key missing");
  _service = createClient(URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _service;
}

export function userClient(accessToken: string): SupabaseClient {
  if (!URL || !ANON) throw new Error("Supabase URL or ANON key missing");
  return createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

export function publicSpriteUrl(path: string): string {
  return `${URL}/storage/v1/object/public/characters/${path}`;
}

export function hasSupabase(): boolean {
  return Boolean(URL && ANON);
}
