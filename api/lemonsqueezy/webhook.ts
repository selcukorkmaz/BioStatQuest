// POST /api/lemonsqueezy/webhook
//
// Lemon Squeezy webhook handler — source of truth for LS subscription state.
// Verifies the X-Signature header (HMAC SHA256 of the raw body, keyed by
// LEMONSQUEEZY_WEBHOOK_SECRET), then upserts user_progress columns. Mirrors
// api/stripe/webhook.ts in shape; the columns reused are the same
// `stripe_*` text fields plus a `billing_provider='lemonsqueezy'` flag.
//
// Critical: must receive the RAW request body for signature check; we
// disable Vercel's default body parser via `config.api.bodyParser`.
//
// Configure in Lemon Squeezy dashboard:
//   1. Settings → Webhooks → Add endpoint
//   2. Endpoint URL: https://www.biostatquest.com/api/lemonsqueezy/webhook
//   3. Events:
//       - subscription_created
//       - subscription_updated
//       - subscription_cancelled
//       - subscription_resumed
//       - subscription_expired
//       - subscription_paused
//       - subscription_unpaused
//       - subscription_payment_success
//       - subscription_payment_failed
//   4. Signing secret → Vercel env LEMONSQUEEZY_WEBHOOK_SECRET
//
// Env: LEMONSQUEEZY_WEBHOOK_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "node:crypto";
import { LS_WEBHOOK_SECRET } from "../_lib/lemonsqueezy";
import { supabaseAdmin } from "../_lib/supabaseAdmin";

export const config = {
  api: { bodyParser: false },
};

async function readRawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req as any) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

// LS webhook docs: header is `X-Signature`, value is hex-encoded HMAC-SHA256
// of the raw body using the signing secret. Compare with timingSafeEqual.
function verifySignature(raw: Buffer, signature: string, secret: string): boolean {
  const computed = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(computed, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Map LS subscription status → our internal user_type. LS statuses:
// 'on_trial' | 'active' | 'paused' | 'past_due' | 'unpaid' | 'cancelled' | 'expired'
// Treat active / on_trial / past_due as Pro (grace period); everything else free.
function planFromStatus(status?: string | null): "pro" | "free" {
  if (status === "active" || status === "on_trial" || status === "past_due") return "pro";
  return "free";
}

type LsSubscriptionAttributes = {
  status?: string;
  variant_id?: number | string;
  customer_id?: number | string;
  user_email?: string;
  renews_at?: string | null;
  ends_at?: string | null;
  trial_ends_at?: string | null;
};

async function applySubscription(
  subscriptionId: string | number,
  attrs: LsSubscriptionAttributes,
  supabaseUserId?: string | null,
) {
  const admin = supabaseAdmin();
  // The "current period end" is renews_at while active, or ends_at when
  // canceled/expired. Fall back to either.
  const periodEnd = attrs.renews_at ?? attrs.ends_at ?? null;
  const update = {
    stripe_customer_id:         attrs.customer_id ? String(attrs.customer_id) : null,
    stripe_subscription_id:     String(subscriptionId),
    stripe_subscription_status: attrs.status ?? null,
    stripe_price_id:            attrs.variant_id ? String(attrs.variant_id) : null,
    stripe_current_period_end:  periodEnd,
    user_type:                  planFromStatus(attrs.status),
    billing_provider:           "lemonsqueezy" as const,
  };

  if (supabaseUserId) {
    const { error } = await admin.from("user_progress").update(update).eq("user_id", supabaseUserId);
    if (error) console.warn("[ls/webhook] update by user_id failed", error);
    return;
  }
  // Fallback chain: by stripe_customer_id (which here holds LS customer id),
  // then by user_email if we still can't find a row.
  if (attrs.customer_id) {
    const { error, count } = await admin
      .from("user_progress")
      .update(update, { count: "exact" })
      .eq("stripe_customer_id", String(attrs.customer_id))
      .select("user_id", { count: "exact", head: true });
    if (!error && (count ?? 0) > 0) return;
  }
  if (attrs.user_email) {
    const { error } = await admin
      .from("user_progress")
      .update(update)
      .eq("email", attrs.user_email);
    if (error) console.warn("[ls/webhook] update by email failed", error);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const sig = (req.headers["x-signature"] as string | undefined) || "";
  if (!sig) return res.status(400).json({ error: "Missing X-Signature" });
  const secret = LS_WEBHOOK_SECRET();
  if (!secret) return res.status(500).json({ error: "LEMONSQUEEZY_WEBHOOK_SECRET not set" });

  let raw: Buffer;
  try { raw = await readRawBody(req); }
  catch (e: any) { return res.status(400).json({ error: `Cannot read body: ${e?.message}` }); }

  if (!verifySignature(raw, sig, secret)) {
    return res.status(400).json({ error: "Invalid signature" });
  }

  let event: any;
  try { event = JSON.parse(raw.toString("utf8")); }
  catch (e: any) { return res.status(400).json({ error: `Bad JSON: ${e?.message}` }); }

  const eventName: string = event?.meta?.event_name || "";
  const customData = event?.meta?.custom_data || {};
  const supabaseUserId: string | null = customData?.supabase_user_id ?? null;
  const data = event?.data;
  const attrs: LsSubscriptionAttributes = data?.attributes || {};
  const subscriptionId = data?.id;

  try {
    switch (eventName) {
      case "subscription_created":
      case "subscription_updated":
      case "subscription_resumed":
      case "subscription_unpaused":
      case "subscription_paused":
      case "subscription_cancelled":
      case "subscription_expired":
      case "subscription_payment_success":
      case "subscription_payment_failed": {
        if (subscriptionId) {
          await applySubscription(subscriptionId, attrs, supabaseUserId);
        }
        break;
      }
      // order_created fires for one-off purchases — ignore for now (we only
      // sell subscriptions). Add a branch here when we ship one-time products.
      default:
        break;
    }
    return res.status(200).json({ received: true });
  } catch (e: any) {
    console.error("[ls/webhook] handler error", e);
    return res.status(500).json({ error: e?.message || "webhook handler error" });
  }
}
