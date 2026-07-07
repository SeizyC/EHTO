// Admin notification email via Resend (HTTP API — the only mail path that
// works on Cloudflare Workers, which have no SMTP).
//
// SAFE TO SHIP WITHOUT SETUP: every send is a no-op unless RESEND_API_KEY is
// present, so wiring this in never breaks a flow before the key is provisioned.
//
// To enable:
//   1. Create a free Resend account → API key (resend.com, 3k emails/mo free).
//   2. Set the secret (NOT committed — the repo is public):
//        npx wrangler secret put RESEND_API_KEY
//      and add RESEND_API_KEY=... to .env.local for local dev.
//   3. (optional) NOTIFY_EMAIL_TO / NOTIFY_EMAIL_FROM env overrides.
// Default `from` uses Resend's shared onboarding@resend.dev (deliverable to the
// account owner without domain verification). For a branded sender, verify
// ehto.world in Resend and set NOTIFY_EMAIL_FROM="EHTO <hello@ehto.world>".

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_TO = "hans1329@gmail.com";
const DEFAULT_FROM = "EHTO <onboarding@resend.dev>";

/** Send a plain-text admin email. Never throws; returns whether it was sent. */
export async function sendAdminEmail(subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false; // not configured yet — silently skip

  const to = process.env.NOTIFY_EMAIL_TO || DEFAULT_TO;
  const from = process.env.NOTIFY_EMAIL_FROM || DEFAULT_FROM;
  try {
    const r = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, text }),
    });
    if (!r.ok) {
      console.warn("[notify-email] resend failed:", r.status, (await r.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[notify-email] error:", e instanceof Error ? e.message : e);
    return false;
  }
}
