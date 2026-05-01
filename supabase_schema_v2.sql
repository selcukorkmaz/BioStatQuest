-- ============================================================
-- BiostatQuest v2.0 schema additions
-- ============================================================
-- Run this in the Supabase SQL editor AFTER applying supabase_schema.sql
-- and supabase_schema_classes.sql. Idempotent — safe to re-run.
--
-- Adds:
--   1. F2 — per-attempt telemetry table (question_attempts) for adaptive
--      engine, IRT calibration, item analysis, and misconception ledger.
--   2. Provider-agnostic billing_provider column on user_progress so
--      Lemon Squeezy and (legacy) Stripe can coexist during migration.
-- ============================================================


-- ============================================================
-- F2 — QUESTION ATTEMPTS (per-answer telemetry)
-- ============================================================
-- One row per learner submission. The atomic unit IRT, adaptive item
-- selection (F4), misconception ledger (F8), and instructor item analysis
-- (F10) all read from. Keep the columns lean — anything derived (mastery
-- theta, IRT b/a) lives elsewhere.
create table if not exists public.question_attempts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  qid             text not null,                       -- e.g. "f1_5"
  case_id         text not null,                       -- e.g. "f1"
  q_type          text not null,                       -- 'mcq' | 'multi' | 'numeric'
  chosen          jsonb not null,                      -- number for mcq, number[] for multi, string for numeric
  correct         boolean not null,
  ms_to_answer    integer,                             -- wall-clock from question shown to submit; null on timeout
  timed_out       boolean not null default false,
  hint_used       boolean not null default false,      -- F3 hook (always false in F2 phase 0)
  deep_dive_opened boolean not null default false,     -- whether learner expanded DeepDive
  misconception_tag text,                              -- copied from step.misconceptionTag[chosen] when applicable
  difficulty      text,                                -- 'intern' | 'resident' | 'fellow' | 'pi' | 'review'
  run_id          uuid,                                -- groups attempts within a single case run
  created_at      timestamptz not null default now()
);

-- Indexes for the read patterns we care about.
-- (qid, created_at) — IRT batch and per-question item analysis.
-- (user_id, created_at) — learner history + misconception ledger.
-- (run_id) — per-run summary.
-- (case_id, created_at) — case-level analytics.
create index if not exists question_attempts_qid_created_idx
  on public.question_attempts(qid, created_at desc);
create index if not exists question_attempts_user_created_idx
  on public.question_attempts(user_id, created_at desc);
create index if not exists question_attempts_run_idx
  on public.question_attempts(run_id) where run_id is not null;
create index if not exists question_attempts_case_created_idx
  on public.question_attempts(case_id, created_at desc);
create index if not exists question_attempts_misconception_idx
  on public.question_attempts(user_id, misconception_tag, created_at desc)
  where misconception_tag is not null;

-- RLS: users can only insert and read THEIR OWN attempts. The IRT job and
-- instructor analytics use the service role and bypass RLS.
alter table public.question_attempts enable row level security;

drop policy if exists question_attempts_insert_own on public.question_attempts;
create policy question_attempts_insert_own on public.question_attempts
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists question_attempts_select_own on public.question_attempts;
create policy question_attempts_select_own on public.question_attempts
  for select
  to authenticated
  using (user_id = auth.uid());

-- No update / delete policies — attempts are immutable from the client.
-- Service role can do anything (RLS bypassed for service_role automatically).


-- ============================================================
-- BILLING — ensure subscription columns exist + add provider flag
-- ============================================================
-- The original supabase_schema.sql added these stripe_* columns, but on
-- some live DBs that migration never ran (it's idempotent and safe to
-- repeat here). Without them the fetchSubscription query 400s. So this
-- block is the SOURCE OF TRUTH for the billing columns now.
--
-- Strategy: keep the historical stripe_* names (they're text columns and
-- accept any provider's IDs), and add a `billing_provider` column to
-- record which provider issued the active subscription. Avoids a wide
-- rename and lets Stripe + Lemon Squeezy coexist during cutover.
alter table public.user_progress
  add column if not exists stripe_customer_id          text,
  add column if not exists stripe_subscription_id      text,
  add column if not exists stripe_subscription_status  text,
  add column if not exists stripe_price_id             text,
  add column if not exists stripe_current_period_end   timestamptz,
  add column if not exists billing_provider            text;       -- 'stripe' | 'lemonsqueezy' | null

create index if not exists user_progress_stripe_customer_idx
  on public.user_progress(stripe_customer_id) where stripe_customer_id is not null;

comment on column public.user_progress.billing_provider is
  'Which provider issued the active subscription. Null = no active sub. The stripe_* columns are reused for Lemon Squeezy IDs (text fields, name is historical).';

-- Backfill: anyone with a stripe_customer_id but no billing_provider gets
-- tagged as 'stripe' so existing Stripe customers keep working when the
-- code starts checking the provider field.
update public.user_progress
   set billing_provider = 'stripe'
 where stripe_customer_id is not null
   and billing_provider is null;


-- ============================================================
-- DONE
-- ============================================================
-- Sanity-check after applying:
--   select count(*) from public.question_attempts;                    -- 0
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'user_progress'
--      and column_name = 'billing_provider';                          -- 1 row
