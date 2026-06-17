// OpenAI endpoint URL — image generation only.
//
// The chat path moved to Claude (see src/lib/claude.ts) after the OpenAI
// key hit an insufficient_quota wall that silenced all ambient NPC chatter.
// Image generation (gpt-image-1) stays on OpenAI — Claude has no image
// generation surface, and the existing sprite pipeline is the only caller.
//
// Routing still goes through the Cloudflare AI Gateway so we keep
// observability/retry. The compat chat endpoint and its modelId() helper
// are gone — only the openai-specific images path remains.

const GATEWAY_BASE = process.env.CF_AI_GATEWAY_BASE
  ?? "https://gateway.ai.cloudflare.com/v1/REDACTED_CF_ACCOUNT_ID/ehto";

/** Image generations endpoint (gpt-image-1). Provider-specific path —
 *  compat mode doesn't cover images. Model name passed as-is in the
 *  request body (no provider prefix). */
export const IMAGES_GENERATIONS_URL = `${GATEWAY_BASE}/openai/v1/images/generations`;
