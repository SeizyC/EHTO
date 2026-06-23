import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { serviceClient } from "@/lib/supabase";
import { grantEhto } from "@/lib/ehto";
import { stripeClient, stripeCryptoProvider } from "@/lib/stripe";

// POST /api/stripe/webhook — Stripe payment events. PUBLIC (no auth); trust is
// established by verifying the Stripe signature against STRIPE_WEBHOOK_SECRET.
// On checkout.session.completed we grant EHTO exactly once (idempotent by the
// Checkout session id, recorded in ehto_purchases).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(req: NextRequest) {
  const stripe = stripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) return NextResponse.json({ error: "not configured" }, { status: 500 });

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "no signature" }, { status: 400 });

  const raw = await req.text(); // raw body required for signature verification
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, secret, undefined, stripeCryptoProvider());
  } catch (e) {
    console.warn("[stripe/webhook] bad signature:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object as Stripe.Checkout.Session;
    const userId = s.metadata?.userId;
    const ehto = Number(s.metadata?.ehto ?? 0);
    if (s.payment_status === "paid" && userId && ehto > 0) {
      const svc = serviceClient();
      // Record the purchase keyed by session id; only grant when THIS call is
      // the one that inserted the row (ignoreDuplicates → empty on retry).
      const { data: inserted, error } = await svc
        .from("ehto_purchases")
        .upsert(
          {
            id: s.id,
            user_id: userId,
            ehto,
            amount_krw: s.amount_total ?? null,
            pack_id: s.metadata?.packId ?? null,
          },
          { onConflict: "id", ignoreDuplicates: true },
        )
        .select("id");
      if (error) {
        console.warn("[stripe/webhook] purchase insert failed:", error.message);
        return NextResponse.json({ error: "record failed" }, { status: 500 }); // let Stripe retry
      }
      if (inserted && inserted.length > 0) {
        await grantEhto(svc, userId, ehto).catch((e) =>
          console.warn("[stripe/webhook] grant failed:", e instanceof Error ? e.message : e),
        );
      }
    }
  }

  return NextResponse.json({ received: true });
}
