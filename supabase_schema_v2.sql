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
-- F8 — MISCONCEPTION LEDGER (per-user aggregation RPC)
-- ============================================================
-- Postgres function the client calls (via Supabase RPC) to get the
-- count and most-recent timestamp for each misconception_tag the
-- learner has hit in the last 60 days. SECURITY DEFINER so the
-- function can read question_attempts on the caller's behalf without
-- needing to expose row-level GROUP BY through PostgREST. Authorization
-- is enforced inline: we filter by auth.uid().
--
-- Returned shape (one row per tag):
--   tag        text
--   cnt        integer
--   last_seen  timestamptz
create or replace function public.my_misconception_counts()
returns table (tag text, cnt integer, last_seen timestamptz)
language sql
security definer
set search_path = public
as $$
  select misconception_tag as tag,
         count(*)::int     as cnt,
         max(created_at)   as last_seen
    from public.question_attempts
   where user_id = auth.uid()
     and misconception_tag is not null
     and created_at > now() - interval '60 days'
   group by misconception_tag
   order by cnt desc, last_seen desc
$$;

revoke all on function public.my_misconception_counts() from public;
grant execute on function public.my_misconception_counts() to authenticated;


-- ============================================================
-- S — ADMIN TELEMETRY RPCs
-- ============================================================
-- Two read-only aggregation functions surfaced to the in-app admin
-- dashboard: top misconception tags fired across all learners, and
-- per-question stats (n, accuracy, dominant distractor share). Both
-- gated to a single admin email — same convention as admin_set_user_type
-- in the v1 schema. Switch to a public.admins table when there's >1
-- admin to maintain.
--
-- Both functions are SECURITY DEFINER + search_path = public so the
-- caller's RLS doesn't restrict the aggregation.

create or replace function public.admin_top_misconceptions(p_days int default 30)
returns table (tag text, cnt int, last_seen timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.jwt() ->> 'email' <> 'selcukorkmaz@gmail.com' then
    raise exception 'Admin only';
  end if;
  return query
    select misconception_tag,
           count(*)::int,
           max(created_at)
      from public.question_attempts
     where misconception_tag is not null
       and created_at > now() - (p_days || ' days')::interval
     group by misconception_tag
     order by count(*) desc, max(created_at) desc
     limit 200;
end;
$$;

revoke all on function public.admin_top_misconceptions(int) from public;
grant execute on function public.admin_top_misconceptions(int) to authenticated;


create or replace function public.admin_question_stats(p_days int default 30, p_min_n int default 5)
returns table (
  qid                 text,
  case_id             text,
  n                   int,
  accuracy            numeric,
  top_distractor      text,           -- jsonb of chosen rendered as text; numeric questions surface input
  top_distractor_pct  numeric         -- proportion of WRONG answers picking that distractor
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.jwt() ->> 'email' <> 'selcukorkmaz@gmail.com' then
    raise exception 'Admin only';
  end if;
  return query
    with attempts as (
      select qa.qid,
             qa.case_id,
             qa.correct,
             qa.chosen
        from public.question_attempts qa
       where qa.created_at > now() - (p_days || ' days')::interval
         and not qa.timed_out
    ),
    base as (
      select a.qid,
             a.case_id,
             count(*)::int                                  as n,
             avg(case when a.correct then 1.0 else 0.0 end) as accuracy
        from attempts a
       group by a.qid, a.case_id
       having count(*) >= p_min_n
    ),
    distractors as (
      select a.qid,
             a.chosen::text                                 as picked,
             count(*)::int                                  as picks
        from attempts a
       where not a.correct
       group by a.qid, a.chosen::text
    ),
    ranked as (
      select d.qid, d.picked, d.picks,
             row_number() over (partition by d.qid order by d.picks desc) as rk,
             sum(d.picks) over (partition by d.qid)         as wrong_total
        from distractors d
    )
    select b.qid,
           b.case_id,
           b.n,
           round(b.accuracy::numeric, 3)                                    as accuracy,
           r.picked                                                         as top_distractor,
           case when r.wrong_total > 0
                then round((r.picks::numeric / r.wrong_total::numeric), 3)
                else null::numeric end                                       as top_distractor_pct
      from base b
 left join ranked r on r.qid = b.qid and r.rk = 1
     order by b.accuracy asc, b.n desc
     limit 200;
end;
$$;

revoke all on function public.admin_question_stats(int, int) from public;
grant execute on function public.admin_question_stats(int, int) to authenticated;


-- ============================================================
-- F15 — AI TUTOR CHAT LOG
-- ============================================================
-- One row per AI tutor turn. Drives three things:
--   1. Per-week quota enforcement for free-tier users (Pro unlimited).
--   2. Instructor / admin transparency over what the tutor said.
--   3. Cost & abuse monitoring (token counts, suspicious patterns).
--
-- The endpoint inserts a row using the SERVICE ROLE so the same row also
-- doubles as a permission-checked audit trail. Users get SELECT on their
-- own rows for a future "history" view; INSERT/UPDATE through the client
-- is denied — only the API may write here.
create table if not exists public.ai_chats (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  qid             text not null,
  case_id         text not null,
  user_message    text not null,
  ai_reply        text,
  model           text,
  tokens_in       int,
  tokens_out      int,
  status          text not null default 'ok',     -- 'ok' | 'error' | 'blocked'
  error           text,
  created_at      timestamptz not null default now()
);

create index if not exists ai_chats_user_created_idx
  on public.ai_chats(user_id, created_at desc);
create index if not exists ai_chats_qid_created_idx
  on public.ai_chats(qid, created_at desc);

alter table public.ai_chats enable row level security;

-- Read your own; no client-side writes (the API uses service_role).
drop policy if exists ai_chats_select_own on public.ai_chats;
create policy ai_chats_select_own on public.ai_chats
  for select to authenticated using (user_id = auth.uid());


-- ============================================================
-- DONE
-- ============================================================
-- Sanity-check after applying:
--   select count(*) from public.question_attempts;                    -- 0
--   select column_name from information_schema.columns
--    where table_schema = 'public' and table_name = 'user_progress'
--      and column_name = 'billing_provider';                          -- 1 row
