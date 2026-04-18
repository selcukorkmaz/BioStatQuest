// POST /api/stripe/webhook
//
// Stripe webhook handler — the source of truth for subscription state.
// Verifies the event signature, then upserts user_progress columns.
//
// Critical: this endpoint MUST receive the raw request body (not a parsed
// JSON object) so Stripe's signature check can validate it. We disable
// Vercel's default body parsing via `config.api.bodyParser`.
//
// Configure in Stripe dashboard:
//   1. Developers → Webhooks → Add endpoint
//   2. Endpoint URL: https://www.biostatquest.com/api/stripe/webhook
//   3. Events:
//       - checkout.session.completed
//       - customer.subscription.created
//       - customer.subscription.updated
//       - customer.subscription.deleted
//       - invoice.payment_succeeded    (optional — keeps period_end fresh)
//       - invoice.payment_failed       (optional — moves to past_due)
//   4. Copy the "Signing secret" → Vercel env STRIPE_WEBHOOK_SECRET
//
// Env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import type { VercelRequest, VercelResponse } from "@vercel/node";
import type Stripe from "stripe";
import { stripe, STRIPE_WEBHOOK_SECRET } from "../_lib/stripe";
import { supabaseAdmin } from "../_lib/supabaseAdmin";

export const config = {
  api: { bodyParser: false },   // hand Stripe the raw body for signature check
};

// Vercel gives us a Readable stream on req when bodyParser is off.
async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req as any) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

function planFromStatus(status?: string | null): "pro" | "free" {
  // We keep user_type='pro' for active + trialing + past_due (grace period);
  // anything else (canceled / incomplete / unpaid) flips back to free.
  if (status === "active" || status === "trialing" || status === "past_due") return "pro";
  return "free";
}

async function applySubscription(sub: Stripe.Subscription, supabaseUserId?: string | null) {
  const admin = supabaseAdmin();
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const userId = supabaseUserId || sub.metadata?.supabase_user_id;

  const priceId = sub.items?.data?.[0]?.price?.id || null;
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;

  const update = {
    stripe_customer_id: customerId,
    stripe_subscription_id: sub.id,
    stripe_subscription_status: sub.status,
    stripe_price_id: priceId,
    stripe_current_period_end: periodEnd,
    user_type: planFromStatus(sub.status),
  };

  if (userId) {
    // Update by user_id when we have it (reliable on first-ever event).
    const { error } = await admin.from("user_progress").update(update).eq("user_id", userId);
    if (error) console.warn("[webhook] update by user_id failed", error);
  } else {
    // Fallback: match existing row by stripe_customer_id (for legacy / later events).
    const { error } = await admin.from("user_progress").update(update).eq("stripe_customer_id", customerId);
    if (error) console.warn("[webhook] update by customer_id failed", error);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const sig = req.headers["stripe-signature"] as string | undefined;
  if (!sig) return res.status(400).json({ error: "Missing stripe-signature" });
  const secret = STRIPE_WEBHOOK_SECRET();
  if (!secret) return res.status(500).json({ error: "STRIPE_WEBHOOK_SECRET not set" });

  let event: Stripe.Event;
  try {
    const raw = await readRawBody(req);
    event = stripe().webhooks.constructEvent(raw, sig, secret);
  } catch (err: any) {
    console.warn("[webhook] signature check failed:", err?.message);
    return res.status(400).json({ error: `Webhook Error: ${err?.message}` });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id || session.metadata?.supabase_user_id;
        if (session.mode === "subscription" && session.subscription) {
          const sub = await stripe().subscriptions.retrieve(session.subscription as string);
          await applySubscription(sub, userId);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await applySubscription(sub, null);
        break;
      }
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        if (inv.subscription) {
          const sub = await stripe().subscriptions.retrieve(inv.subscription as string);
          await applySubscription(sub, null);
        }
        break;
      }
      default:
        // Ignore unrelated events without failing the delivery.
        break;
    }
    return res.status(200).json({ received: true });
  } catch (e: any) {
    console.error("[webhook] handler error", e);
    return res.status(500).json({ error: e?.message || "webhook handler error" });
  }
}
