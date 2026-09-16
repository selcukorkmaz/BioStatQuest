// POST /api/stripe/portal
//
// Opens the Stripe Billing Portal — Stripe-hosted UI where the user can
// update payment method, cancel, download invoices. No UI for us to build.
//
// Requires the user already has a stripe_customer_id (set on first
// checkout.session.completed webhook). Returns { url } on success.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { rejectIfPaymentsDisabled } from "../_lib/payments";
import { stripe } from "../_lib/stripe";
import { supabaseAdmin } from "../_lib/supabaseAdmin";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Paid plans withdrawn — this route is intentionally gone.
  if (rejectIfPaymentsDisabled(req, res)) return;
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
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    const customerId = row?.stripe_customer_id;
    if (!customerId) return res.status(400).json({ error: "No active subscription" });

    const origin = (req.headers.origin as string) || `https://${req.headers.host}`;
    const session = await stripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/biostat-quest.html?billing=portal-return`,
    });
    return res.status(200).json({ url: session.url });
  } catch (e: any) {
    console.error("[portal] failed", e);
    return res.status(500).json({ error: e?.message || "Portal creation failed" });
  }
}
