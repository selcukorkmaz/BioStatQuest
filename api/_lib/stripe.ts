// Server-side Stripe client — never imported from the browser bundle.
// Env: STRIPE_SECRET_KEY — Stripe dashboard → Developers → API keys

import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_SECRET_KEY env");
  _stripe = new Stripe(key, { apiVersion: "2024-06-20" as any });
  return _stripe;
}

export const STRIPE_PRICE_MONTHLY = () => process.env.STRIPE_PRICE_ID_MONTHLY || "";
export const STRIPE_PRICE_YEARLY  = () => process.env.STRIPE_PRICE_ID_YEARLY  || "";
export const STRIPE_WEBHOOK_SECRET = () => process.env.STRIPE_WEBHOOK_SECRET   || "";
