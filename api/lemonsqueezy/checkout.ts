// POST /api/lemonsqueezy/checkout
//
// Mirror of api/stripe/checkout.ts but for Lemon Squeezy. Verifies the
// caller via Supabase, then creates a hosted LS checkout and returns the
// redirect URL.
//
// Body: { plan: "monthly" | "yearly" }
// Headers: Authorization: Bearer <supabase_access_token>
// Response: { url: "https://<store>.lemonsqueezy.com/checkout/buy/..." }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import {
  LS_STORE_ID,
  LS_VARIANT_MONTHLY,
  LS_VARIANT_YEARLY,
  lsCreateCheckout,
} from "../_lib/ls.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const authHeader = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!authHeader) return res.status(401).json({ error: "Missing auth token" });

    const admin = supabaseAdmin();
    const { data: userData, error: userErr } = await admin.auth.getUser(authHeader);
    if (userErr || !userData?.user) return res.status(401).json({ error: "Invalid token" });
    const user = userData.user;
    if (!user.email) return res.status(400).json({ error: "User has no email" });

    const body = (req.body && typeof req.body === "object") ? req.body : JSON.parse(req.body || "{}");
    const plan = String(body.plan || "monthly").toLowerCase();
    const variantId = plan === "yearly" ? LS_VARIANT_YEARLY() : LS_VARIANT_MONTHLY();
    const storeId = LS_STORE_ID();
    if (!variantId) return res.status(500).json({ error: "Lemon Squeezy variant not configured" });
    if (!storeId)   return res.status(500).json({ error: "LEMONSQUEEZY_STORE_ID not set" });

    const origin = (req.headers.origin as string) || `https://${req.headers.host}`;
    const url = await lsCreateCheckout({
      variantId,
      storeId,
      userId: user.id,
      email: user.email,
      successUrl: `${origin}/biostat-quest.html?billing=success&provider=lemonsqueezy`,
    });

    return res.status(200).json({ url });
  } catch (e: any) {
    console.error("[ls/checkout] failed", e);
    return res.status(500).json({ error: e?.message || "Checkout failed" });
  }
}
