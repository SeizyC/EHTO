// Anthropic Claude client — the project's primary chat engine.
//
// We previously routed all chat completions through OpenAI via the CF AI
// Gateway compat endpoint. After hitting an `insufficient_quota` wall on
// the OpenAI key (silenced all ambient NPC chatter), the chat path moved
// to Claude. Image generation (gpt-image-1) still uses OpenAI directly —
// see src/lib/openai-urls.ts.
//
// Gateway routing: when CF_AI_GATEWAY_BASE is set, the SDK's baseURL is
// pointed at `${GATEWAY_BASE}/anthropic` so we keep the same gateway-side
// observability/retry we had for OpenAI. Without the env var the SDK
// hits api.anthropic.com directly (dev fallback).

import Anthropic from "@anthropic-ai/sdk";
import { searchYoutubeVideo, type DiscoveredVideo } from "@/lib/youtube-share";

const GATEWAY_BASE = process.env.CF_AI_GATEWAY_BASE
  ?? "https://gateway.ai.cloudflare.com/v1/REDACTED_CF_ACCOUNT_ID/ehto";

let _client: Anthropic | null = null;

/** Primary chat model. */
export const CHAT_MODEL = "claude-opus-4-7";

/** Fallback model — used when the primary returns 529 overloaded_error.
 *  Sonnet 4.6 has separate capacity and is rarely overloaded at the
 *  same time as Opus 4.7. Quality for short Korean chat replies is
 *  effectively indistinguishable for our use case. */
export const FALLBACK_CHAT_MODEL = "claude-sonnet-4-6";

/** AI↔AI ambient filler model. Sonnet 4.6 — the cost note above applies:
 *  quality is effectively indistinguishable from Opus for short Korean
 *  chat, so routing filler here is a cost cut, not a quality cut. */
export const FILLER_CHAT_MODEL = "claude-sonnet-4-6";

/** Is this error a transient overload that fallback should retry? */
function isOverloaded(e: unknown): boolean {
  return e instanceof Anthropic.APIError && (e.status === 529 || e.status === 503);
}

export function claudeClient(): Anthropic | null {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  _client = new Anthropic({
    apiKey,
    baseURL: GATEWAY_BASE ? `${GATEWAY_BASE}/anthropic` : undefined,
  });
  return _client;
}

/** YouTube share tool — given to Claude in chat reply turns so it can
 *  fetch a real, currently-watchable video when a peer/owner asks for
 *  one ("@야근파 영상 공유해줘"). The text path used to hallucinate
 *  `https://youtu.be/` with no ID; with this tool the model gets a real
 *  videoId + caption back and the server appends the verified URL —
 *  inline-iframe player in message-render handles playback. */
const SHARE_YOUTUBE_TOOL: Anthropic.Tool = {
  name: "share_youtube_video",
  description:
    "현재 시청 가능한 YouTube 영상을 검색해서 한 개 가져옵니다. 누군가 *명시적으로* 영상이나 무대 공유를 요청했을 때만 호출하세요 (예: '영상 공유해줘', '무대 보여줘'). 일상 채팅에서 영상을 *언급*만 하는 경우엔 호출하지 마세요. 가수·곡명·키워드를 그대로 query로 넘기면 됩니다.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "YouTube 검색어. 한국어/영어 모두 OK. 예: '제니 You & Me 무대', 'SEVENTEEN Super MV', '10분 요가'.",
      },
    },
    required: ["query"],
  },
};

/** Single short text completion — used by every chat call site in the
 *  project (member-reply, music/youtube captions, memory summarization,
 *  world-seed prompts). Returns null on any failure (auth, rate limit,
 *  parse error) so callers can fall back without try/catch noise.
 *
 *  Auto-fallback: if the primary model returns 529 overloaded_error,
 *  the call retries once on FALLBACK_CHAT_MODEL. Quality difference is
 *  negligible for short Korean chat; availability matters more. */
export async function chatComplete(opts: {
  system: string;
  user: string;
  maxTokens: number;
  model?: string;
}): Promise<string | null> {
  const client = claudeClient();
  if (!client) {
    console.warn("[claude] ANTHROPIC_API_KEY missing — skipping");
    return null;
  }
  const tryOnce = async (model: string): Promise<string | null> => {
    const resp = await client.messages.create({
      model,
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    });
    for (const block of resp.content) {
      if (block.type === "text") {
        const text = block.text.trim();
        if (text.length > 0) return text;
      }
    }
    return null;
  };
  const primary = opts.model ?? CHAT_MODEL;
  try {
    return await tryOnce(primary);
  } catch (e) {
    if (isOverloaded(e) && primary !== FALLBACK_CHAT_MODEL) {
      console.warn(`[claude] ${primary} overloaded → fallback to ${FALLBACK_CHAT_MODEL}`);
      try {
        return await tryOnce(FALLBACK_CHAT_MODEL);
      } catch (e2) {
        if (e2 instanceof Anthropic.APIError) {
          console.warn(`[claude/fallback] HTTP ${e2.status}: ${e2.message.slice(0, 300)}`);
        } else {
          console.warn("[claude/fallback] failed:", e2 instanceof Error ? e2.message : e2);
        }
        return null;
      }
    }
    if (e instanceof Anthropic.APIError) {
      console.warn(`[claude] HTTP ${e.status}: ${e.message.slice(0, 300)}`);
    } else {
      console.warn("[claude] failed:", e instanceof Error ? e.message : e);
    }
    return null;
  }
}

/** Chat completion with the YouTube share tool available. Used by the
 *  ambient reply path so members can fulfil "@야근파 영상 공유해줘" by
 *  fetching a real, verified video instead of hallucinating a URL.
 *
 *  Returns the model's final text plus (optionally) the video it picked.
 *  The caller is responsible for combining them into the message body
 *  (so the URL goes through one verified channel — no string formatting
 *  inside the model's output). */
export async function chatCompleteWithVideo(opts: {
  system: string;
  user: string;
  maxTokens: number;
  model?: string;
}): Promise<{ text: string; video: DiscoveredVideo | null } | null> {
  const client = claudeClient();
  if (!client) {
    console.warn("[claude] ANTHROPIC_API_KEY missing — skipping");
    return null;
  }
  const primary = opts.model ?? CHAT_MODEL;

  // Runs the full tool-use loop against one model. Throws on overload
  // so the caller can swap to the fallback and restart; returns the
  // final {text, video} on any other completion (including non-overload
  // API errors, which are turned into null by the outer handler).
  const runLoop = async (
    model: string,
  ): Promise<{ text: string; video: DiscoveredVideo | null }> => {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: opts.user },
    ];
    let chosenVideo: DiscoveredVideo | null = null;
    for (let turn = 0; turn < 3; turn++) {
      const resp = await client.messages.create({
        model,
        max_tokens: opts.maxTokens,
        system: opts.system,
        tools: [SHARE_YOUTUBE_TOOL],
        messages,
      });
      if (resp.stop_reason !== "tool_use") {
        const text = resp.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text.trim())
          .filter((s) => s.length > 0)
          .join(" ");
        return { text, video: chosenVideo };
      }
      messages.push({ role: "assistant", content: resp.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of resp.content) {
        if (block.type !== "tool_use") continue;
        if (block.name === "share_youtube_video") {
          const input = block.input as { query?: string };
          const query = (input.query ?? "").trim();
          const video = query ? await searchYoutubeVideo(query) : null;
          if (video) chosenVideo = video;
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: video
              ? `videoTitle: ${video.caption}\nvideoUrl: ${video.url}\n\n위 영상이 검색됐어요. 이 영상을 공유하는 짧은 한 줄 캡션만 작성해주세요. URL이나 영상 제목은 다시 적지 마세요 — 시스템이 자동으로 붙입니다.`
              : `검색 결과 없음. 사용자에게 적당한 한 줄로 알려주세요. URL 만들지 마세요.`,
            is_error: !video,
          });
        } else {
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Unknown tool: ${block.name}`,
            is_error: true,
          });
        }
      }
      messages.push({ role: "user", content: toolResults });
    }
    console.warn("[claude/tool] hit turn cap without final answer");
    return { text: "", video: chosenVideo };
  };

  try {
    return await runLoop(primary);
  } catch (e) {
    if (isOverloaded(e) && primary !== FALLBACK_CHAT_MODEL) {
      console.warn(`[claude/tool] ${primary} overloaded → fallback to ${FALLBACK_CHAT_MODEL}`);
      try {
        return await runLoop(FALLBACK_CHAT_MODEL);
      } catch (e2) {
        if (e2 instanceof Anthropic.APIError) {
          console.warn(`[claude/tool/fallback] HTTP ${e2.status}: ${e2.message.slice(0, 300)}`);
        } else {
          console.warn("[claude/tool/fallback] failed:", e2 instanceof Error ? e2.message : e2);
        }
        return null;
      }
    }
    if (e instanceof Anthropic.APIError) {
      console.warn(`[claude/tool] HTTP ${e.status}: ${e.message.slice(0, 300)}`);
    } else {
      console.warn("[claude/tool] failed:", e instanceof Error ? e.message : e);
    }
    return null;
  }
}
