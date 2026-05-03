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

export const billing = { startCheckout, openPortal, DEFAULT_PROVIDER };
