import { NextRequest, NextResponse } from "next/server";
import { userClient } from "@/lib/supabase";
import { packById } from "@/lib/ehto-packs";
import { stripeClient } from "@/lib/stripe";

// POST /api/ehto/checkout { packId } → { url }
// Creates a Stripe Checkout session for an EHTO pack. The client redirects to
// `url`; EHTO is granted by the webhook on payment success (not here).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return NextResponse.json({ error: "missing auth" }, { status: 401 });

  const { data: u, error } = await userClient(token).auth.getUser();
  if (error || !u.user) return NextResponse.json({ error: "invalid session" }, { status: 401 });

  const stripe = stripeClient();
  if (!stripe) return NextResponse.json({ error: "결제가 아직 설정되지 않았어요" }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as { packId?: string };
  const pack = packById(String(body.packId ?? ""));
  if (!pack) return NextResponse.json({ error: "잘못된 상품" }, { status: 400 });

  const origin = req.headers.get("origin") || "https://ehto.world";
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "krw",
            product_data: { name: `EHTO ${pack.ehto} · ${pack.label}` },
            unit_amount: pack.priceKrw, // KRW is zero-decimal: 3300 == ₩3,300
          },
          quantity: 1,
        },
      ],
      client_reference_id: u.user.id,
      // Metadata drives the webhook grant. Keep it minimal + stringly-typed.
      metadata: { userId: u.user.id, ehto: String(pack.ehto), packId: pack.id },
      success_url: `${origin}/world?ehto=success`,
      cancel_url: `${origin}/world?ehto=cancel`,
    });
    return NextResponse.json({ url: session.url });
  } catch (e) {
    console.warn("[ehto/checkout]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "결제 시작에 실패했어요" }, { status: 502 });
  }
}
