// Stripe client, configured for the Cloudflare Workers runtime (OpenNext).
//
// The default Node http client doesn't work in workerd, so we use Stripe's
// fetch-based client. Webhook signature verification must use the async
// constructEventAsync + SubtleCrypto provider (sync crypto isn't available).

import Stripe from "stripe";

let _stripe: Stripe | null = null;

/** Stripe client, or null if STRIPE_SECRET_KEY isn't configured. */
export function stripeClient(): Stripe | null {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  // apiVersion omitted → use the SDK's pinned default (the type is locked to it).
  _stripe = new Stripe(key, {
    httpClient: Stripe.createFetchHttpClient(),
  });
  return _stripe;
}

/** SubtleCrypto-backed provider for async webhook signature verification. */
export function stripeCryptoProvider() {
  return Stripe.createSubtleCryptoProvider();
}
