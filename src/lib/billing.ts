// DORMANT as of 2026-09-17. Paid plans were withdrawn (PAYMENTS_ENABLED
// =false in ./launchFlags.ts): nothing in the UI calls these functions any
// more. The provider-scoped paths below no longer have their own handlers —
// vercel.json rewrites each one to api/billing/[action].ts, which answers
// 410. The paths are left as-is so the provider-routing contract (and its
// tests) stay intact for a restore.
// The module and its tests are kept intact — the provider-routing contract
// is the fiddly part to rebuild, and deleting it would cost more than
// leaving it dormant. Do not wire it back into the UI without flipping
// PAYMENTS_ENABLED on both sides first.
//
// Client-side billing helpers. Routes to either /api/stripe/* (legacy
// customers) or /api/lemonsqueezy/* (new buyers, default) depending on
// the `provider` argument. Keys live server-side, not here.
//
// Usage:
//   await billing.startCheckout("monthly");                 // → Lemon Squeezy
//   await billing.startCheckout("monthly", "stripe");       // → Stripe
//   await billing.openPortal("lemonsqueezy");               // route by provider
//   await billing.openPortal("stripe");                     // legacy customers
//
// New purchases default to Lemon Squeezy as part of the v2.0 cutover; the
// Stripe rail remains available for existing customers via webhook-driven
// state. The `billing_provider` column on user_progress tells SubscriptionPanel
// which portal to open for any given user.

import { createClient } from "@supabase/supabase-js";

export type BillingProvider = "stripe" | "lemonsqueezy";

// Default provider for net-new buyers. Change to "stripe" if you ever
// need to roll back the Lemon Squeezy migration.
export const DEFAULT_PROVIDER: BillingProvider = "lemonsqueezy";

async function getAccessToken(): Promise<string | null> {
  const anyWin = window as any;
  const BQ = anyWin?.BQAuth;
  if (!BQ || !BQ.enabled) return null;
  try {
    const url = (import.meta as any).env.VITE_SUPABASE_URL || anyWin.__SUPABASE_URL || "";
    const anonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || anyWin.__SUPABASE_ANON_KEY || "";
    if (!url || !anonKey) return null;
    const c = createClient(url, anonKey);
    const { data } = await c.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function post(path: string, body?: Record<string, unknown>) {
  const token = await getAccessToken();
  if (!token) throw new Error("Please sign in first.");
  const resp = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body || {}),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.error || `Request failed (${resp.status})`);
  return json;
}

function checkoutPath(provider: BillingProvider): string {
  return provider === "lemonsqueezy"
    ? "/api/lemonsqueezy/checkout"
    : "/api/stripe/checkout";
}

function portalPath(provider: BillingProvider): string {
  return provider === "lemonsqueezy"
    ? "/api/lemonsqueezy/portal"
    : "/api/stripe/portal";
}

function cancelPath(provider: BillingProvider): string {
  return provider === "lemonsqueezy"
    ? "/api/lemonsqueezy/cancel"
    : "/api/stripe/cancel"; // Stripe cancel endpoint not yet shipped — caller
                            // should route by billing_provider so this branch
                            // only fires for legacy Stripe customers once we
                            // build the equivalent endpoint there.
}

async function startCheckout(
  plan: "monthly" | "yearly",
  provider: BillingProvider = DEFAULT_PROVIDER,
): Promise<void> {
  const { url } = await post(checkoutPath(provider), { plan });
  if (!url) throw new Error("No checkout URL returned");
  window.location.href = url;
}

// `provider` defaults to DEFAULT_PROVIDER but the SubscriptionPanel always
// passes the value read from the user's billing_provider column, so legacy
// Stripe customers reliably land on the Stripe portal.
async function openPortal(
  provider: BillingProvider = DEFAULT_PROVIDER,
): Promise<void> {
  const { url } = await post(portalPath(provider), {});
  if (!url) throw new Error("No portal URL returned");
  window.location.href = url;
}

// In-app cancel — bypasses the LS hosted portal entirely. Server-side
// calls LS's DELETE /v1/subscriptions/{id}; the subscription is marked
// cancelled but the user keeps Pro until the period they've paid for
// expires. The subsequent `subscription_updated` / `subscription_expired`
// webhook drives the user_type flip in our DB; the UI just shows a
// confirmation immediately so the user knows the action took effect.
//
// Returns the LS endsAt timestamp so SubscriptionPanel can render
// "Cancelled — access until <date>". Throws on network / auth / LS
// errors; callers should catch and render the message.
async function cancelSubscription(
  provider: BillingProvider = DEFAULT_PROVIDER,
): Promise<{ endsAt: string | null; alreadyCancelled?: boolean }> {
  const json = await post(cancelPath(provider), {});
  return {
    endsAt: json?.endsAt ?? null,
    alreadyCancelled: !!json?.alreadyCancelled,
  };
}

export const billing = { startCheckout, openPortal, cancelSubscription, DEFAULT_PROVIDER };
