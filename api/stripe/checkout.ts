// POST /api/stripe/checkout
//
// Creates a Stripe Checkout session for a Pro subscription and returns the
// redirect URL. The client calls this with the user's auth token; we verify
// it server-side (so a malicious caller can't check-out as someone else).
//
// Body: { plan: "monthly" | "yearly" }
// Headers: Authorization: Bearer <supabase_access_token>
// Response: { url: "https://checkout.stripe.com/..." }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { stripe, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY } from "../_lib/stripe";
import { supabaseAdmin } from "../_lib/supabaseAdmin";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const authHeader = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!authHeader) return res.status(401).json({ error: "Missing auth token" });

    // Verify the caller via Supabase — never trust a client-supplied user_id.
    const admin = supabaseAdmin();
    const { data: userData, error: userErr } = await admin.auth.getUser(authHeader);
    if (userErr || !userData?.user) return res.status(401).json({ error: "Invalid token" });
    const user = userData.user;
    if (!user.email) return res.status(400).json({ error: "User has no email" });

    const body = (req.body && typeof req.body === "object") ? req.body : JSON.parse(req.body || "{}");
    const plan = String(body.plan || "monthly").toLowerCase();
    const price = plan === "yearly" ? STRIPE_PRICE_YEARLY() : STRIPE_PRICE_MONTHLY();
    if (!price) return res.status(500).json({ error: "Stripe price not configured" });

    // Reuse existing Stripe customer id if we have one, else let Checkout
    // create a new one and capture it via the webhook on completion.
    const { data: progressRow } = await admin
      .from("user_progress")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const origin = (req.headers.origin as string) || `https://${req.headers.host}`;
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      customer: progressRow?.stripe_customer_id || undefined,
      customer_email: progressRow?.stripe_customer_id ? undefined : user.email,
      client_reference_id: user.id,       // we read this in the webhook
      allow_promotion_codes: true,
      success_url: `${origin}/biostat-quest.html?billing=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/biostat-quest.html?billing=cancelled`,
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
      metadata: { supabase_user_id: user.id },
    });

    return res.status(200).json({ url: session.url });
  } catch (e: any) {
    console.error("[checkout] failed", e);
    return res.status(500).json({ error: e?.message || "Checkout failed" });
  }
}
