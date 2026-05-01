# Lemon Squeezy — setup guide

Step-by-step to wire BioStatQuest's Pro tier to Lemon Squeezy. Stripe stays
in the codebase as a parallel rail; new individual purchases go through LS,
institutional/PO sales stay on Stripe Invoicing or a manual channel.

## 1. Lemon Squeezy account + store

1. Sign up at <https://app.lemonsqueezy.com>. Verify the email.
2. Create a **store**: dashboard → top-left switcher → "New store". Name it
   "BioStatQuest" (or whatever — only shown to you).
3. Activate the store: complete the W-8/W-9 + payout details. Until the
   store is activated LS runs in **test mode** only (which is exactly what
   we want for first wiring).

## 2. Products + variants

For each Pro tier we sell, create a **subscription product** with one or
more **variants** (price × interval):

| Product | Variant | Price | Interval | Variant ID env var |
|---|---|---|---|---|
| Pro    | Monthly  | TBD/mo | 1 month  | `LEMONSQUEEZY_VARIANT_PRO_MONTHLY` |
| Pro    | Yearly   | TBD/yr | 12 month | `LEMONSQUEEZY_VARIANT_PRO_YEARLY`  |

Find each variant's numeric ID under **Store → Products → [product] → Variants**.
Copy the integer (visible in URL or row).

## 3. API key

Dashboard → **Settings → API**. Create a key with default scopes (read +
write). Copy once — it's hidden after.

## 4. Webhook

Dashboard → **Settings → Webhooks → New webhook**.

- **Callback URL**: `https://www.biostatquest.com/api/lemonsqueezy/webhook`
  (and a second one pointing to your preview/Vercel deploy URL while testing).
- **Signing secret**: generate one (LS shows you a textarea — paste a long
  random string or click Generate). Copy it.
- **Events to subscribe**: tick at least
  - subscription_created
  - subscription_updated
  - subscription_cancelled
  - subscription_resumed
  - subscription_expired
  - subscription_paused
  - subscription_unpaused
  - subscription_payment_success
  - subscription_payment_failed

## 5. Required Vercel env vars

Set in **Vercel Project → Settings → Environment Variables** for both
**Production** and **Preview** (Development is local; use `.env.local`).

```
LEMONSQUEEZY_API_KEY                  <api key from step 3>
LEMONSQUEEZY_STORE_ID                 <store id, integer; visible in dashboard URL>
LEMONSQUEEZY_WEBHOOK_SECRET           <signing secret from step 4>
LEMONSQUEEZY_VARIANT_PRO_MONTHLY      <variant id from step 2>
LEMONSQUEEZY_VARIANT_PRO_YEARLY       <variant id from step 2>
```

After saving, **redeploy** (Vercel only injects env vars on deploy, not on
existing serverless function instances).

## 6. Database migration

Apply `supabase_schema_v2.sql` in the Supabase SQL editor. Adds:
- `billing_provider` text column on `user_progress` (so we can tell Stripe
  vs LS subscriptions apart).
- F2 telemetry tables (unrelated, see header).

Already-existing Stripe customers get `billing_provider='stripe'`
backfilled. New LS purchases will set `billing_provider='lemonsqueezy'`
via the webhook.

## 7. End-to-end test (LS test mode)

1. With the store still in test mode, buy a Pro subscription using LS's
   built-in test card (`4242 4242 4242 4242`).
2. Watch Vercel logs: `[ls/webhook] ...` should fire.
3. In Supabase SQL editor:
   ```sql
   select user_id, user_type, billing_provider, stripe_subscription_status,
          stripe_current_period_end
     from public.user_progress
    where billing_provider = 'lemonsqueezy';
   ```
   Expect a row for the test user with `user_type='pro'` and a
   `stripe_subscription_status` of `'active'` or `'on_trial'`.
4. Cancel the test subscription via the customer portal, wait for
   `subscription_cancelled` webhook, re-query — `user_type` should drop to
   `'free'` once the period ends (LS sends an `expired` event then).

## 8. Activate live mode

Once the test happy-path works:
1. LS dashboard: activate the store (W-8/W-9 + payout). Live products go
   public.
2. Switch the live webhook secret env var if LS issues a different one for
   live mode (most stores use the same; double-check).
3. Smoke-test with a real card on a low-priced variant or use LS's "issue
   test order" tool.

## Ops notes

- **Refunds**: handled in LS dashboard. Webhook fires
  `subscription_payment_refunded` (not currently subscribed; add when
  needed).
- **Tax**: LS is the Merchant of Record — they remit VAT/sales tax on our
  behalf. We don't owe anything country-by-country.
- **Invoices**: LS auto-emails users; PDF available in the customer portal.
  Educator/Institution buyers needing PO/wire transfer should NOT use LS —
  route them to Stripe Invoicing or a manual contract.
- **Coexistence with Stripe**: existing Stripe subscribers stay on Stripe
  forever; we only route new buyers to LS. The `billing_provider` column
  routes the customer-portal request to the right `/api/<provider>/portal`.

## Code touchpoints

| File | What it does |
|---|---|
| `api/_lib/lemonsqueezy.ts` | LS REST client + env-backed config |
| `api/lemonsqueezy/checkout.ts` | Creates hosted checkout link |
| `api/lemonsqueezy/webhook.ts` | Verifies signature + applies subscription |
| `api/lemonsqueezy/portal.ts`  | Returns LS customer-portal URL |
| `supabase_schema_v2.sql`      | Adds `billing_provider` column |

The frontend `SubscriptionPanel.tsx` still POSTs to `/api/stripe/checkout`
today. The cutover slice (next): branch on a `provider` form field or
flip the default to LS once env vars are live. Until cutover, both rails
work; existing Stripe customers are unaffected.
