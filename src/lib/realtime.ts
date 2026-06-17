"use client";

// Supabase Realtime wiring. One shared channel per (worldId × table) so a
// chat-store consumer and a members-store consumer don't open redundant
// websockets. Subscribers register handlers and get fan-out per event.
//
// Auth: realtime applies RLS against the JWT registered with
// `supabase.realtime.setAuth(token)`. Without that the websocket connects
// as anon and RLS strips every payload. We re-auth on every session
// refresh so a token rotation doesn't silently mute pushes.

import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { browserClient } from "@/lib/supabase";

type AnyRow = Record<string, unknown>;
type Handler<T extends AnyRow = AnyRow> = (evt: RealtimePostgresChangesPayload<T>) => void;

type ChannelKey = string;
const _channels = new Map<ChannelKey, RealtimeChannel>();
const _handlers = new Map<ChannelKey, Set<Handler>>();

let _authBound = false;

async function bindAuth(): Promise<void> {
  if (_authBound) return;
  _authBound = true;
  const sb = browserClient();
  const { data: sess } = await sb.auth.getSession();
  if (sess.session?.access_token) {
    sb.realtime.setAuth(sess.session.access_token);
  }
  // Token refresh / sign-in / sign-out — keep the websocket's auth current
  // so RLS-filtered streams don't silently go dark.
  sb.auth.onAuthStateChange((_evt, session) => {
    if (session?.access_token) sb.realtime.setAuth(session.access_token);
  });
}

function ensureChannel(
  key: ChannelKey,
  table: "messages" | "members" | "plaza_objects",
  events: Array<"INSERT" | "UPDATE" | "DELETE">,
  worldIdColumn: "world_id" | "current_location_world_id",
  worldId: string,
): RealtimeChannel {
  let ch = _channels.get(key);
  if (ch) return ch;
  const sb = browserClient();
  ch = sb.channel(key);
  for (const evt of events) {
    ch = ch.on(
      // The supabase-js Realtime channel.on overloads make this string
      // literal hard to type without pulling in their internal types;
      // narrow `as any` is the pragmatic path here.
      // eslint-disable-next-line
      "postgres_changes" as any,
      {
        event: evt,
        schema: "public",
        table,
        filter: `${worldIdColumn}=eq.${worldId}`,
      },
      (payload: RealtimePostgresChangesPayload<AnyRow>) => {
        const fns = _handlers.get(key);
        if (!fns) return;
        for (const fn of fns) {
          try { fn(payload); } catch (e) { console.warn(`[realtime:${key}] handler threw`, e); }
        }
      },
    );
  }
  ch.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      console.debug(`[realtime] ${key} subscribed`);
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      console.warn(`[realtime] ${key} status=${status}`);
    }
  });
  _channels.set(key, ch);
  return ch;
}

export async function subscribeMessages(
  worldId: string,
  handler: Handler,
): Promise<() => void> {
  await bindAuth();
  const key = `messages:${worldId}`;
  ensureChannel(key, "messages", ["INSERT", "DELETE"], "world_id", worldId);
  let set = _handlers.get(key);
  if (!set) { set = new Set(); _handlers.set(key, set); }
  set.add(handler);
  return () => {
    set!.delete(handler);
    // Don't tear down the channel — other consumers may still need it,
    // and reconnecting on every component unmount thrashes the websocket.
  };
}

export async function subscribePlazaObjects(
  worldId: string,
  handler: Handler,
): Promise<() => void> {
  await bindAuth();
  const key = `plaza_objects:${worldId}`;
  ensureChannel(key, "plaza_objects", ["INSERT", "UPDATE", "DELETE"], "world_id", worldId);
  let set = _handlers.get(key);
  if (!set) { set = new Set(); _handlers.set(key, set); }
  set.add(handler);
  return () => { set!.delete(handler); };
}

export async function subscribeMembers(
  worldId: string,
  handler: Handler,
): Promise<() => void> {
  await bindAuth();
  const key = `members:${worldId}`;
  ensureChannel(key, "members", ["INSERT", "UPDATE", "DELETE"], "current_location_world_id", worldId);
  let set = _handlers.get(key);
  if (!set) { set = new Set(); _handlers.set(key, set); }
  set.add(handler);
  return () => { set!.delete(handler); };
}

/** Tear down ALL channels — call on sign-out so the next user's session
 *  doesn't inherit the previous user's subscriptions. */
export function clearRealtime(): void {
  const sb = browserClient();
  for (const [, ch] of _channels) {
    try { sb.removeChannel(ch); } catch { /* ignore */ }
  }
  _channels.clear();
  _handlers.clear();
}
