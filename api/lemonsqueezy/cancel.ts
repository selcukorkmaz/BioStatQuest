// POST /api/lemonsqueezy/cancel
//
// In-app subscription cancel. Bypasses the LS customer portal entirely —
// the user clicks "Cancel subscription" in BioStat Quest, we authenticate
// them via their Supabase JWT, look up their stored LS subscription id,
// and call LS's DELETE /v1/subscriptions/{id} on their behalf.
//
// Why an in-app cancel exists alongside the LS customer portal:
//   • Test mode portal access requires LS login (customer must use a
//     magic link from their receipt email). Bad UX for cancellation.
//   • Even in live mode, every browser session has its own quirks —
//     having a cancel button that never depends on LS's hosted UI is
//     a belt-and-braces win.
//   • The cancel call sets `cancelled: true` on the LS subscription
//     but `status` stays `active` until period end. So the customer
//     keeps Pro access for the time they've already paid for, then
//     gets dropped to free when subscription_expired fires. That's
//     standard SaaS UX.
//
// Response: { ok: true, endsAt: string | null }
// Errors:
//   400 — caller has no subscription on file
//   401 — bad / missing Supabase JWT
//   409 — caller's subscription is not a Lemon Squeezy subscription
//         (e.g. legacy Stripe customer who shouldn't be hitting this
//         endpoint — client should route them to /api/stripe/cancel
//         when that ships)
//   500 — LS API call failed (network, bad credentials, already
//         cancelled, etc.); error message included verbatim from LS

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";
import { lsCancelSubscription } from "../_lib/ls.js";

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

    const { data: row } = await admin
      .from("user_progress")
      .select("stripe_subscription_id, billing_provider, stripe_subscription_status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!row?.stripe_subscription_id) {
      return res.status(400).json({ error: "No active subscription on file" });
    }
    if (row.billing_provider && row.billing_provider !== "lemonsqueezy") {
      return res.status(409).json({
        error: "Subscription is not Lemon Squeezy",
        provider: row.billing_provider,
      });
    }

    // No-op short-circuit: if the row already shows cancelled / expired,
    // don't re-call LS. Stays idempotent for users who double-click the
    // cancel button while the webhook is still processing.
    const status = (row.stripe_subscription_status || "").toLowerCase();
    if (status === "cancelled" || status === "expired") {
      return res.status(200).json({ ok: true, alreadyCancelled: true });
    }

    const result = await lsCancelSubscription(String(row.stripe_subscription_id));
    return res.status(200).json({
      ok: true,
      endsAt: result.endsAt,
      // Surface the LS-side fields so the client can show the right
      // "access until <date>" copy without waiting for the webhook.
      status: result.status,
      cancelled: result.cancelled,
    });
  } catch (e: any) {
    console.error("[ls/cancel] failed", e);
    return res.status(500).json({ error: e?.message || "Cancel failed" });
  }
}
