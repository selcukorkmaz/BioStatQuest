# Stripe setup — one-time

The app ships with the billing code wired up, but it won't accept payments
until you complete these five steps. Budget 30 minutes.

## 1. Create a Stripe account

- Go to https://stripe.com and sign up (or sign in if you already have an account).
- Finish the business profile. You can start in **Test mode** (orange banner at
  top) and flip to live later — all the URLs and keys are distinct between modes.

## 2. Create the Pro product + two prices

- Dashboard → **Products** → **+ Add product**
- Name: `BioStat Quest Pro`
- Description (optional): `All 50 cases + FSRS-6 scheduling + per-method mastery analytics`
- Pricing model: **Standard pricing** → **Recurring**
- Add the first price:
  - Amount: **$9.00 USD**, Billing period: **Monthly**
  - Click **Save product** — you'll see a Price ID like `price_1Abc...`
- On the product page, click **+ Add another price**:
  - Amount: **$60.00 USD**, Billing period: **Yearly**
  - Save. A second Price ID appears.

Copy both Price IDs — you'll paste them into Vercel env vars in step 4.

## 3. Create the webhook endpoint

- Dashboard → **Developers → Webhooks** → **+ Add endpoint**
- Endpoint URL: `https://www.biostatquest.com/api/stripe/webhook`
  (or whatever your production domain is)
- Version: latest API version (default is fine).
- Events to send — select these six:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
- Click **Add endpoint**
- On the resulting page, click **Signing secret → Reveal** and copy the
  value (starts with `whsec_...`).

## 4. Add env vars in Vercel

Go to https://vercel.com → your BiostatQuest project → **Settings → Environment Variables**.

Add the following (all three environments: Production / Preview / Development):

| Key | Value |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_...` (test) or `sk_live_...` (live) from Stripe → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` from step 3 |
| `STRIPE_PRICE_ID_MONTHLY` | `price_...` from step 2 (monthly) |
| `STRIPE_PRICE_ID_YEARLY` | `price_...` from step 2 (yearly) |
| `SUPABASE_URL` | Same as your `VITE_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key (⚠️ server-side only) |

**Important:** `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS. It is only read by the
webhook handler running in a Vercel Function, and is never shipped to the
browser. Never commit this value to git.

## 5. Run the Supabase migration

If you haven't already, run the Stripe-columns migration in Supabase → SQL Editor:

```sql
-- From supabase_schema.sql — Stripe billing columns (Phase 3a)
alter table public.user_progress add column if not exists stripe_customer_id         text;
alter table public.user_progress add column if not exists stripe_subscription_id     text;
alter table public.user_progress add column if not exists stripe_subscription_status text;
alter table public.user_progress add column if not exists stripe_price_id            text;
alter table public.user_progress add column if not exists stripe_current_period_end  timestamptz;
create index if not exists user_progress_stripe_customer_idx
  on public.user_progress(stripe_customer_id) where stripe_customer_id is not null;
```

## 6. Redeploy Vercel

Env var changes don't take effect until the next deploy:
```bash
vercel --prod
```

Or push to `main` and let CI redeploy.

---

## End-to-end test (Stripe Test mode)

1. Sign in to the app on your production URL (or a Vercel preview URL).
2. Click **Account → Upgrade to Pro** (or click any Pro-locked case → "Unlock").
3. Pick a plan → "Subscribe".
4. You'll land on Stripe Checkout. Use a test card:
   - Card: `4242 4242 4242 4242`
   - Exp: any future date
   - CVC: any 3 digits
   - ZIP: any 5 digits
5. After success, you'll be redirected back with `?billing=success`.
6. Within a few seconds:
   - The welcome toast appears.
   - All 50 cases unlock.
   - Account → subscription panel switches to "Pro" with the next billing date.
   - Admin → Users shows your account with `user_type: pro`.

If it doesn't work, the webhook event is the thing to check first:

- Stripe → Developers → Webhooks → click your endpoint → **Recent events** tab.
- Any event with a non-2xx response will show the error body — usually an env
  var that wasn't set, or the Supabase service-role key not being found.

## Switching to Live mode

When you're ready:

1. Stripe Dashboard → toggle from **Test** to **Live** mode.
2. Re-create the product + two prices in Live mode. They get new Price IDs.
3. Re-create the webhook endpoint in Live mode. New signing secret.
4. Update all four Stripe env vars in Vercel to their Live counterparts:
   - `STRIPE_SECRET_KEY` → `sk_live_...`
   - `STRIPE_WEBHOOK_SECRET` → new `whsec_...`
   - `STRIPE_PRICE_ID_MONTHLY` / `_YEARLY` → the live Price IDs
5. Redeploy.

Supabase URL and service-role key don't change.

## Pricing changes later

If you want to change the monthly or yearly price:

- Don't edit a live Price — Stripe's model is append-only. Instead, archive the
  old Price and create a new one.
- Update `STRIPE_PRICE_ID_MONTHLY` / `_YEARLY` in Vercel.
- Existing subscribers keep paying their original price unless you migrate them
  individually via the Customer Portal.

Cosmetic copy ($9/mo, $60/yr) is in `src/App.tsx` — look for
`PRO_PRICE_MONTHLY_USD` and `PRO_PRICE_YEARLY_USD`. Update those to match.
