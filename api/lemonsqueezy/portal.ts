// POST /api/lemonsqueezy/portal
//
// Returns the Lemon Squeezy customer-portal URL so the user can update
// payment, cancel, or download invoices. Mirror of api/stripe/portal.ts.
// Requires the user already has an LS customer id stored in
// user_progress.stripe_customer_id (we reuse the column for any provider;
// billing_provider tells us which one).
//
// Response: { url: "https://<store>.lemonsqueezy.com/billing?expires=..." }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../_lib/supabaseAdmin";
import { lsCustomerPortalUrl } from "../_lib/ls";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const authHeader = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!authHeader) return res.status(401).json({ error: "Missing auth token" });

    const admin = supabaseAdmin();
    const { data: userData, error: userErr } = await admin.auth.getUser(authHeader);
    if (userErr || !userData?.user) return res.status(401).json({ error: "Invalid token" });
    const user = userData.user;

    const { data: row } = await admin
      .from("user_progress")
      .select("stripe_customer_id, billing_provider")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!row?.stripe_customer_id) return res.status(400).json({ error: "No active subscription" });
    if (row.billing_provider && row.billing_provider !== "lemonsqueezy") {
      // Caller hit the wrong portal for their provider. Tell them so the
      // client can route to /api/stripe/portal instead.
      return res.status(409).json({ error: "Subscription is not Lemon Squeezy", provider: row.billing_provider });
    }

    const url = await lsCustomerPortalUrl(String(row.stripe_customer_id));
    return res.status(200).json({ url });
  } catch (e: any) {
    console.error("[ls/portal] failed", e);
    return res.status(500).json({ error: e?.message || "Portal lookup failed" });
  }
}
