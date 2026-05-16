-- Migration: add billing_provider column to user_progress.
-- Run once in the Supabase SQL editor.
--
-- Context: the Lemon Squeezy webhook handler (api/lemonsqueezy/webhook.ts)
-- writes 'lemonsqueezy' here when it processes an LS subscription. The
-- SubscriptionPanel reads it to know which "Manage billing" portal to
-- open — Stripe legacy customers stay on the Stripe portal; new LS
-- customers go to the LS customer portal. Without this column the
-- webhook upserts silently fail at PostgREST schema validation.
--
-- Safe to run multiple times.

alter table public.user_progress
  add column if not exists billing_provider text;

-- Defensive index — only needed if we ever need to count or filter by
-- provider in the admin panel; cheap to keep.
create index if not exists user_progress_billing_provider_idx
  on public.user_progress(billing_provider)
  where billing_provider is not null;

-- Backfill: every existing row with a non-null stripe_customer_id is, by
-- definition, a Stripe customer. Mark them so the SubscriptionPanel
-- routes their "Manage billing" link correctly post-migration.
update public.user_progress
  set billing_provider = 'stripe'
  where billing_provider is null
    and stripe_customer_id is not null;
