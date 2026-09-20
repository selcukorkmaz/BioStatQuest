-- ============================================================================
-- Admin analytics RPCs — server-side aggregation over the full events table.
--
-- WHY: the dashboard used to derive every "7d"/"30d" number from
-- fetchRecentEvents(500) on the client. That silently truncates: the labels
-- said 30 days but the data was "the most recent 500 rows", so the busier the
-- site got, the shorter the window became — with nothing on screen to say so.
-- These functions aggregate in Postgres over a real time window instead.
--
-- Same convention as admin_top_misconceptions / admin_question_stats in
-- supabase_schema_v2.sql: SECURITY DEFINER (so the aggregation isn't clipped
-- by the caller's RLS) + an explicit admin check at the top.
--
-- Apply with: Supabase dashboard → SQL Editor → paste → Run. Re-runnable.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Admin allow-list, in one place.
--
-- IMPORTANT: this MUST be kept in sync with VITE_BQ_ADMIN_EMAILS in Vercel.
-- The client list is a UX gate; this one is the security boundary. Seeded with
-- the single email the v2 schema already hardcoded — add the rest here.
-- ---------------------------------------------------------------------------
create or replace function public.admin_emails()
returns text[]
language sql
immutable
as $$ select array['selcukorkmaz@gmail.com']::text[] $$;

revoke all on function public.admin_emails() from public;
grant execute on function public.admin_emails() to authenticated;


-- ---------------------------------------------------------------------------
-- Traffic summary for a window.
--
-- p_exclude_admin drops the admin's own sessions — both events carrying an
-- admin user_email and events from any visitor_id that has ever been seen
-- with an admin email (i.e. the admin's browser before it signed in). On a
-- site with ~1 active user/day, the owner's own testing otherwise dominates
-- every number on the page.
--
-- Definitions that differ deliberately from the old client-side versions:
--   guest_visitors      browsers with NO signed-in event in the window
--   converted_visitors  browsers that fired an actual `signup` event in the
--                       window. The old code counted any browser seen with a
--                       user_id, so a user who signed up months ago and simply
--                       logged in today was scored as a fresh conversion.
--   first_event_at      earliest row in the whole table, so the UI can say
--                       when analytics coverage actually begins instead of
--                       implying a 30-day window it may not have data for.
-- ---------------------------------------------------------------------------
create or replace function public.admin_analytics_summary(
  p_days int default 30,
  p_exclude_admin boolean default true
)
returns table (
  visitors           int,
  guest_visitors     int,
  signups            int,
  converted_visitors int,
  events_total       int,
  first_event_at     timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(auth.jwt() ->> 'email', '') = any(public.admin_emails())) then
    raise exception 'Admin only';
  end if;

  return query
  with admin_visitors as (
    select distinct e.visitor_id
      from public.events e
     where e.visitor_id is not null
       and lower(coalesce(e.user_email, '')) = any(public.admin_emails())
  ),
  scoped as (
    select e.*
      from public.events e
     where e.created_at > now() - make_interval(days => p_days)
       and (
         not p_exclude_admin
         or (
           lower(coalesce(e.user_email, '')) <> all(public.admin_emails())
           and (e.visitor_id is null
                or e.visitor_id not in (select av.visitor_id from admin_visitors av))
         )
       )
  ),
  signed_in_visitors as (
    select distinct s.visitor_id from scoped s
     where s.user_id is not null and s.visitor_id is not null
  )
  select
    (select count(distinct s.visitor_id)::int from scoped s where s.visitor_id is not null),
    (select count(*)::int from (
       select distinct s.visitor_id from scoped s
        where s.visitor_id is not null
          and s.visitor_id not in (select v.visitor_id from signed_in_visitors v)
     ) g),
    (select count(distinct s.user_id)::int from scoped s where s.type = 'signup' and s.user_id is not null),
    (select count(distinct s.visitor_id)::int from scoped s where s.type = 'signup' and s.visitor_id is not null),
    (select count(*)::int from scoped s),
    (select min(e.created_at) from public.events e);
end;
$$;

revoke all on function public.admin_analytics_summary(int, boolean) from public;
grant execute on function public.admin_analytics_summary(int, boolean) to authenticated;


-- ---------------------------------------------------------------------------
-- Landing-variant breakdown.
--
-- Signups are attributed to a variant only via a real `signup` event from the
-- same browser inside the window — the old client version credited a variant
-- whenever any event from that browser carried a user_id, which inflated
-- conversion with returning logins.
-- ---------------------------------------------------------------------------
create or replace function public.admin_variant_stats(
  p_days int default 30,
  p_exclude_admin boolean default true
)
returns table (variant text, visitors int, signups int)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(auth.jwt() ->> 'email', '') = any(public.admin_emails())) then
    raise exception 'Admin only';
  end if;

  return query
  with admin_visitors as (
    select distinct e.visitor_id
      from public.events e
     where e.visitor_id is not null
       and lower(coalesce(e.user_email, '')) = any(public.admin_emails())
  ),
  scoped as (
    select e.visitor_id,
           e.type,
           e.created_at,
           coalesce(e.data::jsonb ->> 'landingVariant', e.data::jsonb ->> 'ref') as variant
      from public.events e
     where e.created_at > now() - make_interval(days => p_days)
       and e.visitor_id is not null
       and (
         not p_exclude_admin
         or (
           lower(coalesce(e.user_email, '')) <> all(public.admin_emails())
           and e.visitor_id not in (select av.visitor_id from admin_visitors av)
         )
       )
  ),
  -- One variant per browser: the EARLIEST one it was tagged with, which is the
  -- landing that actually won the click. Without this a visitor who reloads
  -- under a different ref is counted under two variants.
  tagged as (
    select distinct on (s.visitor_id) s.visitor_id, s.variant
      from scoped s
     where s.variant is not null
     order by s.visitor_id, s.created_at asc
  ),
  converted as (
    select distinct s.visitor_id from scoped s where s.type = 'signup'
  )
  select t.variant,
         count(*)::int,
         count(*) filter (where c.visitor_id is not null)::int
    from tagged t
    left join converted c on c.visitor_id = t.visitor_id
   group by t.variant
   order by count(*) desc;
end;
$$;

revoke all on function public.admin_variant_stats(int, boolean) from public;
grant execute on function public.admin_variant_stats(int, boolean) to authenticated;


-- ---------------------------------------------------------------------------
-- Per-case start → complete funnel, over the full window rather than whatever
-- fit in the client's 500-row buffer.
-- ---------------------------------------------------------------------------
create or replace function public.admin_case_funnel(
  p_days int default 30,
  p_exclude_admin boolean default true
)
returns table (case_id text, starts int, completes int)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(auth.jwt() ->> 'email', '') = any(public.admin_emails())) then
    raise exception 'Admin only';
  end if;

  return query
  with admin_visitors as (
    select distinct e.visitor_id
      from public.events e
     where e.visitor_id is not null
       and lower(coalesce(e.user_email, '')) = any(public.admin_emails())
  ),
  scoped as (
    select e.case_id, e.type
      from public.events e
     where e.created_at > now() - make_interval(days => p_days)
       and e.case_id is not null
       and e.type in ('case_start', 'case_complete')
       and (
         not p_exclude_admin
         or (
           lower(coalesce(e.user_email, '')) <> all(public.admin_emails())
           and (e.visitor_id is null
                or e.visitor_id not in (select av.visitor_id from admin_visitors av))
         )
       )
  )
  select s.case_id,
         count(*) filter (where s.type = 'case_start')::int,
         count(*) filter (where s.type = 'case_complete')::int
    from scoped s
   group by s.case_id
   order by count(*) filter (where s.type = 'case_start') desc;
end;
$$;

revoke all on function public.admin_case_funnel(int, boolean) from public;
grant execute on function public.admin_case_funnel(int, boolean) to authenticated;


-- ---------------------------------------------------------------------------
-- Week-1 return rate by signup cohort.
--
-- The dashboard's old "Day-7 retention" was: of everyone who signed up 7+ days
-- ago, what share saved progress in the last 7 days. That is a current-active
-- share of all old users, not retention — it can only ever go down as the user
-- base ages, which is why it read 1%.
--
-- This is the real thing: for each weekly signup cohort, the share that came
-- back and did something between 24 hours and 7 days after signing up. Only
-- mature cohorts (signed up more than 7 days ago) are returned, since a newer
-- cohort hasn't had its week yet.
--
-- Caveat the UI surfaces: this reads the events table, so cohorts older than
-- first_event_at (see admin_analytics_summary) have no history to score and
-- will read 0%.
-- ---------------------------------------------------------------------------
create or replace function public.admin_retention_cohorts(
  p_weeks int default 8,
  p_exclude_admin boolean default true
)
returns table (cohort_start date, n int, returned int)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(auth.jwt() ->> 'email', '') = any(public.admin_emails())) then
    raise exception 'Admin only';
  end if;

  return query
  with cohort as (
    select up.user_id,
           up.created_at,
           date_trunc('week', up.created_at)::date as cohort_start
      from public.user_progress up
     where up.created_at > now() - make_interval(weeks => p_weeks)
       and up.created_at < now() - interval '7 days'
       and (not p_exclude_admin
            or lower(coalesce(up.email, '')) <> all(public.admin_emails()))
  ),
  returners as (
    select distinct c.user_id
      from cohort c
      join public.events e on e.user_id = c.user_id
     where e.created_at > c.created_at + interval '24 hours'
       and e.created_at <= c.created_at + interval '7 days'
  )
  select c.cohort_start,
         count(*)::int,
         count(*) filter (where r.user_id is not null)::int
    from cohort c
    left join returners r on r.user_id = c.user_id
   group by c.cohort_start
   order by c.cohort_start desc;
end;
$$;

revoke all on function public.admin_retention_cohorts(int, boolean) from public;
grant execute on function public.admin_retention_cohorts(int, boolean) to authenticated;
