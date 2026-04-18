-- BiostatQuest Supabase schema
-- Run this in the Supabase SQL editor AFTER creating a new project.
-- Auth is handled by Supabase's built-in auth.users table (email + magic link).

-- ============================================================
-- USER PROGRESS
-- One row per user; their entire game state is stored as JSONB.
-- Simpler than normalizing; the client loads/saves the whole blob.
-- ============================================================

create table if not exists public.user_progress (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  state          jsonb not null default '{}'::jsonb,
  user_type      text not null default 'free',   -- 'free' | 'pro' | 'institutional' (for future monetization)
  email          text,                            -- denormalized from auth.users for admin UI (populated on upsert)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Backfill the email column on existing rows; harmless if empty.
alter table public.user_progress add column if not exists email text;

-- ============================================================
-- STRIPE BILLING COLUMNS (Phase 3a — consumer Pro tier)
-- Webhook-managed. Read policy lets the user read their own state;
-- updates go through the server-side webhook handler using the service
-- role key, so we DON'T grant user update access to these columns.
-- ============================================================
alter table public.user_progress add column if not exists stripe_customer_id         text;
alter table public.user_progress add column if not exists stripe_subscription_id     text;
alter table public.user_progress add column if not exists stripe_subscription_status text; -- 'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | null
alter table public.user_progress add column if not exists stripe_price_id            text;
alter table public.user_progress add column if not exists stripe_current_period_end  timestamptz;
create index if not exists user_progress_stripe_customer_idx on public.user_progress(stripe_customer_id) where stripe_customer_id is not null;

create index if not exists user_progress_updated_idx on public.user_progress(updated_at desc);

-- Update trigger for updated_at
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists user_progress_touch on public.user_progress;
create trigger user_progress_touch before update on public.user_progress
  for each row execute function public.touch_updated_at();

-- ============================================================
-- ROW-LEVEL SECURITY
-- Users can only read/write their own row.
-- ============================================================

alter table public.user_progress enable row level security;

drop policy if exists "own row select" on public.user_progress;
create policy "own row select" on public.user_progress
  for select using (auth.uid() = user_id);

drop policy if exists "own row insert" on public.user_progress;
create policy "own row insert" on public.user_progress
  for insert with check (auth.uid() = user_id);

drop policy if exists "own row update" on public.user_progress;
create policy "own row update" on public.user_progress
  for update using (auth.uid() = user_id);

-- Admin read-all (email-gated). Lets the in-app /admin dashboard list users
-- and their activity without needing a service-role key in the browser.
drop policy if exists "admin user_progress select" on public.user_progress;
create policy "admin user_progress select" on public.user_progress
  for select to authenticated
  using (auth.jwt() ->> 'email' = 'selcukorkmaz@gmail.com');

-- ============================================================
-- LEADERBOARD VIEW (public read, opt-in only)
-- Exposes XP, streak, and a truncated display name. Users must
-- (a) set a display_name AND (b) flip showOnLeaderboard=true to appear.
-- Anyone else is invisible to the public.
--
-- `security_invoker = false` runs the view with the *definer's* permissions
-- (the Supabase postgres role), which bypasses RLS on user_progress. Without
-- this, PG 15+ applies the caller's RLS ("only your own row"), so you'd only
-- ever see yourself on the board. The view's WHERE clause is the single
-- source of truth for who gets exposed publicly.
-- ============================================================

drop view if exists public.leaderboard;

create view public.leaderboard
  with (security_invoker = false) as
  select
    substring((state->>'display_name') from 1 for 24) as name,
    greatest((state->>'xp')::int, 0) as xp,
    coalesce((state->>'currentStreak')::int, 0) as streak,
    coalesce((state->>'bestStreak')::int, 0) as best_streak,
    coalesce(jsonb_array_length(state->'completed'), 0) as cases,
    coalesce(jsonb_array_length(state->'badges'), 0) as badges,
    (floor(sqrt(greatest((state->>'xp')::int, 0) / 50.0)) + 1)::int as level,
    updated_at
  from public.user_progress
  where (state->>'showOnLeaderboard')::boolean = true
    and coalesce(length(state->>'display_name'), 0) > 0
    and coalesce((state->>'xp')::int, 0) > 0
  order by xp desc
  limit 100;

grant select on public.leaderboard to anon, authenticated;

-- ============================================================
-- EMAIL SIGNUP (pre-launch waitlist, newsletter)
-- Public insert, no read.
-- ============================================================

create table if not exists public.email_signups (
  id         bigint generated always as identity primary key,
  email      text not null unique,
  source     text,           -- 'landing' | 'end-of-case' | etc
  created_at timestamptz not null default now()
);

alter table public.email_signups enable row level security;

drop policy if exists "anyone can insert" on public.email_signups;
create policy "anyone can insert" on public.email_signups
  for insert to anon, authenticated with check (true);

-- Admin (email-gated) can read the waitlist for the in-app dashboard.
drop policy if exists "admin email_signups select" on public.email_signups;
create policy "admin email_signups select" on public.email_signups
  for select to authenticated
  using (auth.jwt() ->> 'email' = 'selcukorkmaz@gmail.com');

-- ============================================================
-- EVENT LOG — operational activity stream
-- Fine-grained, append-only log of things that happen: signups,
-- case completions, answers, reports. Source of truth for the admin
-- Activity feed, per-question accuracy, retention cohorts.
-- Users can write their own events; only admin can read everyone's.
-- ============================================================

create table if not exists public.events (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users(id) on delete set null,
  user_email  text,
  visitor_id  text,               -- persistent browser UUID for anon + linkage
  type        text not null,      -- 'signup' | 'session_start' | 'case_start' | 'case_complete'
                                  -- | 'answer_correct' | 'answer_wrong' | 'report_filed'
                                  -- | 'diagnostic_complete' | 'diagnostic_skipped' | 'guest_visit'
  qid         text,
  case_id     text,
  method      text,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- Backfill for existing deployments.
alter table public.events add column if not exists visitor_id text;

create index if not exists events_created_idx on public.events(created_at desc);
create index if not exists events_user_idx on public.events(user_id, created_at desc);
create index if not exists events_type_idx on public.events(type, created_at desc);
create index if not exists events_qid_idx on public.events(qid) where qid is not null;
create index if not exists events_case_idx on public.events(case_id) where case_id is not null;
create index if not exists events_visitor_idx on public.events(visitor_id) where visitor_id is not null;

alter table public.events enable row level security;

-- Unified insert policy: allow both anon and signed-in writes.
-- Anonymous rows MUST have visitor_id + user_id=null; signed-in rows MUST
-- attribute to the caller's own user_id. This means a signed-in user cannot
-- fabricate anon rows, and anon users cannot forge signed-in rows.
drop policy if exists "own events insert" on public.events;
drop policy if exists "events insert" on public.events;
create policy "events insert" on public.events
  for insert to anon, authenticated
  with check (
    (auth.uid() is null and user_id is null and visitor_id is not null)
    or (auth.uid() is not null and user_id = auth.uid())
  );

drop policy if exists "own events select" on public.events;
create policy "own events select" on public.events
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "admin events select" on public.events;
create policy "admin events select" on public.events
  for select to authenticated
  using (auth.jwt() ->> 'email' = 'selcukorkmaz@gmail.com');

-- ============================================================
-- ADMIN RPC — change a user's plan (user_type)
-- Using a SECURITY DEFINER function lets the admin update a specific
-- column without granting a broad RLS update policy on user_progress.
-- ============================================================

create or replace function public.admin_set_user_type(target_user_id uuid, new_type text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.jwt() ->> 'email' <> 'selcukorkmaz@gmail.com' then
    raise exception 'Admin only';
  end if;
  if new_type not in ('free', 'pro', 'institutional') then
    raise exception 'Invalid user_type: %', new_type;
  end if;
  update public.user_progress
    set user_type = new_type
    where user_id = target_user_id;
end;
$$;

revoke all on function public.admin_set_user_type(uuid, text) from public;
grant execute on function public.admin_set_user_type(uuid, text) to authenticated;

-- ============================================================
-- QUESTION REPORTS (Phase 0 — content correctness loop)
-- Any signed-in user can report an issue on a specific question.
-- Admin (Selçuk) reviews via /admin/reports; resolution logged here.
-- ============================================================

create table if not exists public.question_reports (
  id            bigint generated always as identity primary key,
  qid           text not null,                       -- e.g. "p1_3", "ci5_12"
  case_id       text,                                -- parent case id, denormalized for fast filtering
  reason        text not null,                       -- 'wrong_answer' | 'wrong_explain' | 'typo' | 'ambiguous' | 'other'
  comment       text,                                -- optional free-text from reporter (<= 1000 chars enforced client-side)
  user_id       uuid references auth.users(id) on delete set null,
  user_email    text,                                -- snapshot at report time, survives user deletion
  status        text not null default 'open',        -- 'open' | 'triaged' | 'fixed' | 'wontfix' | 'duplicate'
  resolution    text,                                -- admin note on how it was resolved
  resolved_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists question_reports_qid_idx on public.question_reports(qid);
create index if not exists question_reports_status_idx on public.question_reports(status) where status = 'open';
create index if not exists question_reports_created_idx on public.question_reports(created_at desc);

drop trigger if exists question_reports_touch on public.question_reports;
create trigger question_reports_touch before update on public.question_reports
  for each row execute function public.touch_updated_at();

alter table public.question_reports enable row level security;

-- Any authenticated user can file a report; they can only see their own reports.
drop policy if exists "auth insert reports" on public.question_reports;
create policy "auth insert reports" on public.question_reports
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "own reports select" on public.question_reports;
create policy "own reports select" on public.question_reports
  for select to authenticated using (auth.uid() = user_id);

-- Admin (email-gated) can read and update all reports, so the in-app /admin
-- triage queue works without needing a service-role key in the browser. RLS
-- still protects the table from any other signed-in user.
drop policy if exists "admin reports select" on public.question_reports;
create policy "admin reports select" on public.question_reports
  for select to authenticated
  using (auth.jwt() ->> 'email' = 'selcukorkmaz@gmail.com');

drop policy if exists "admin reports update" on public.question_reports;
create policy "admin reports update" on public.question_reports
  for update to authenticated
  using (auth.jwt() ->> 'email' = 'selcukorkmaz@gmail.com');

-- ============================================================
-- FSRS REVIEWS (Phase 1 — spaced repetition)
-- One row per (user, qid). Stores FSRS-6 scheduler state.
-- Using ts-fsrs defaults; fields map to FSRS Card state.
-- ============================================================

create table if not exists public.reviews (
  user_id       uuid not null references auth.users(id) on delete cascade,
  qid           text not null,
  -- FSRS-6 card state
  stability     double precision not null default 0,   -- memory stability (days)
  difficulty    double precision not null default 0,   -- 1-10
  elapsed_days  double precision not null default 0,
  scheduled_days double precision not null default 0,
  learning_steps integer not null default 0,
  reps          integer not null default 0,            -- total reviews
  lapses        integer not null default 0,            -- times graded "Again" after learning
  state         smallint not null default 0,           -- 0=New, 1=Learning, 2=Review, 3=Relearning
  last_grade    smallint,                              -- last Rating: 1=Again, 2=Hard, 3=Good, 4=Easy
  last_reviewed timestamptz,
  due_at        timestamptz not null default now(),    -- when this card is next due
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (user_id, qid)
);

create index if not exists reviews_due_idx on public.reviews(user_id, due_at);
create index if not exists reviews_qid_idx on public.reviews(qid);

drop trigger if exists reviews_touch on public.reviews;
create trigger reviews_touch before update on public.reviews
  for each row execute function public.touch_updated_at();

alter table public.reviews enable row level security;

drop policy if exists "own reviews select" on public.reviews;
create policy "own reviews select" on public.reviews
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "own reviews insert" on public.reviews;
create policy "own reviews insert" on public.reviews
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "own reviews update" on public.reviews;
create policy "own reviews update" on public.reviews
  for update to authenticated using (auth.uid() = user_id);

drop policy if exists "own reviews delete" on public.reviews;
create policy "own reviews delete" on public.reviews
  for delete to authenticated using (auth.uid() = user_id);

-- Convenience: "how many cards are due for user X right now?"
-- Use from client: select count(*) from reviews_due where user_id = auth.uid();
create or replace view public.reviews_due
  with (security_invoker = true) as
  select user_id, qid, due_at, difficulty, stability
  from public.reviews
  where due_at <= now();

grant select on public.reviews_due to authenticated;

-- ============================================================
-- EMAIL SENDS (Phase 6 — re-engagement cron dedup log)
-- One row per (user, campaign) each time we send a transactional email
-- from a scheduled job. The cron checks this table before sending so
-- nobody gets the same campaign twice. Service-role writes only; no RLS
-- policies are needed because the table is never exposed to anon/auth.
-- ============================================================

create table if not exists public.email_sends (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users(id) on delete cascade,
  email      text not null,
  campaign   text not null,
  sent_at    timestamptz not null default now(),
  unique (user_id, campaign)
);

create index if not exists email_sends_campaign_idx on public.email_sends(campaign, sent_at desc);

alter table public.email_sends enable row level security;
-- No policies: only the service role (cron) writes/reads. RLS enabled so
-- that anon/auth clients can't read the table even by accident.
