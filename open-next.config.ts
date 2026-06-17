// OpenNext config for Cloudflare. Keeps defaults — no R2 incremental
// cache yet (we'll add if ISR becomes a real concern; right now every
// API route is `dynamic = "force-dynamic"` so caching isn't doing
// much anyway).

import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
