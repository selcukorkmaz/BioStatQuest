-- BioStat Quest — Classes & Institutional schema (Phase A.1)
-- Append to supabase_schema.sql, or run standalone in the Supabase SQL editor.
-- Idempotent via IF NOT EXISTS / DROP POLICY IF EXISTS / OR REPLACE so re-runs
-- are safe. Run AFTER reviewing docs/classes-design.md.

-- ============================================================
-- INSTITUTIONS — nullable parent for multi-class programs.
-- Empty in Phase A.1; schema exists so classes.institution_id is
-- usable without migration when Phase C / D introduce the UI.
-- ============================================================
create table if not exists public.institutions (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  billing_email text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

alter table public.institutions enable row level security;

drop policy if exists "institutions creator read" on public.institutions;
create policy "institutions creator read" on public.institutions
  for select to authenticated
  using (created_by = auth.uid());

drop policy if exists "institutions creator update" on public.institutions;
create policy "institutions creator update" on public.institutions
  for update to authenticated
  using (created_by = auth.uid());

drop policy if exists "institutions insert self" on public.institutions;
create policy "institutions insert self" on public.institutions
  for insert to authenticated
  with check (created_by = auth.uid());

-- ============================================================
-- CLASSES
-- created_by is nullable: orphan survives user deletion rather
-- than blocking the delete or cascading the whole class.
-- ============================================================
create table if not exists public.classes (
  id                   uuid primary key default gen_random_uuid(),
  institution_id       uuid references public.institutions(id) on delete set null,
  name                 text not null,
  institution_name     text,                                -- free-text attribution when no institutions row
  description          text,
  code                 text not null unique,                -- 6-char uppercase alphanumeric, e.g. "BQ7K2F"
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  archived_at          timestamptz,                         -- soft-delete
  subscription_status  text not null default 'active'
    check (subscription_status in ('active', 'lapsed', 'trialing'))
);

create index if not exists classes_code_idx on public.classes(code);
create index if not exists classes_created_by_idx on public.classes(created_by);

alter table public.classes enable row level security;

-- Members read classes they're in (any role).
drop policy if exists "classes members read" on public.classes;
create policy "classes members read" on public.classes
  for select to authenticated
  using (exists (
    select 1 from public.class_members cm
    where cm.class_id = classes.id
      and cm.user_id = auth.uid()
      and cm.left_at is null
  ));

-- Instructors update the class, but only when active (not archived / not lapsed).
-- Read-only semantics: archived or lapsed classes can be SEEN but not MODIFIED.
drop policy if exists "classes instructors update" on public.classes;
create policy "classes instructors update" on public.classes
  for update to authenticated
  using (
    classes.archived_at is null
    and classes.subscription_status != 'lapsed'
    and exists (
      select 1 from public.class_members cm
      where cm.class_id = classes.id
        and cm.user_id = auth.uid()
        and cm.role in ('instructor', 'co-instructor')
        and cm.left_at is null
    )
  );

-- No public INSERT policy — all class creation goes through the
-- SECURITY DEFINER create_class RPC defined at the bottom of this file.
-- Putting an INSERT policy here would require solving the chicken-
-- and-egg problem of "instructor row must exist to create a class"
-- and would open paths to bypass the atomic (class + membership)
-- creation.

-- Admin (email-gated) full read — mirrors the pattern used on
-- user_progress, events, etc. See "Risks #8" in docs/classes-design.md
-- for the tech-debt note about replacing this with a dedicated
-- admins table when a second admin is added.
drop policy if exists "classes admin read" on public.classes;
create policy "classes admin read" on public.classes
  for select to authenticated
  using (auth.jwt() ->> 'email' = 'selcukorkmaz@gmail.com');

-- ============================================================
-- CLASS MEMBERS
-- Soft-leave via left_at preserves history for cohort aggregates
-- while filtering out of active-member queries (WHERE left_at IS NULL).
-- Consent flag is explicit — defaults to false, flipped to true
-- only at invite acceptance / code join.
-- ============================================================
create table if not exists public.class_members (
  class_id                              uuid not null references public.classes(id) on delete cascade,
  user_id                               uuid not null references auth.users(id) on delete cascade,
  role                                  text not null default 'student'
    check (role in ('instructor', 'co-instructor', 'student')),
  joined_at                             timestamptz not null default now(),
  left_at                               timestamptz,
  consented_to_instructor_visibility    boolean not null default false,
  primary key (class_id, user_id)
);

create index if not exists class_members_user_idx on public.class_members(user_id)
  where left_at is null;
create index if not exists class_members_class_role_idx on public.class_members(class_id, role)
  where left_at is null;

alter table public.class_members enable row level security;

-- Users read their own membership row.
drop policy if exists "class_members read own" on public.class_members;
create policy "class_members read own" on public.class_members
  for select to authenticated
  using (user_id = auth.uid());

-- INTENTIONAL: this policy does NOT gate on archived_at / subscription_status.
-- "Read-only" for a lapsed or archived class means the instructor can still
-- SEE the roster and history; they just can't WRITE (update/insert/invite).
-- Gating reads here would make instructors lose all visibility into their
-- historical cohorts the moment a subscription lapsed — the wrong outcome.
drop policy if exists "class_members instructors read all in class" on public.class_members;
create policy "class_members instructors read all in class" on public.class_members
  for select to authenticated
  using (exists (
    select 1 from public.class_members cm2
    where cm2.class_id = class_members.class_id
      and cm2.user_id = auth.uid()
      and cm2.role in ('instructor', 'co-instructor')
      and cm2.left_at is null
  ));

-- User updates own row (consent toggle, left_at self-remove, etc.)
drop policy if exists "class_members update own" on public.class_members;
create policy "class_members update own" on public.class_members
  for update to authenticated
  using (user_id = auth.uid());

-- Instructor updates others in their class — gated on class being active.
drop policy if exists "class_members instructors update all in class" on public.class_members;
create policy "class_members instructors update all in class" on public.class_members
  for update to authenticated
  using (exists (
    select 1 from public.class_members cm2
    join public.classes c on c.id = cm2.class_id
    where cm2.class_id = class_members.class_id
      and cm2.user_id = auth.uid()
      and cm2.role in ('instructor', 'co-instructor')
      and cm2.left_at is null
      and c.archived_at is null
      and c.subscription_status != 'lapsed'
  ));

-- No public INSERT policy — memberships are only inserted by the RPC
-- (create_class) or via service-role handlers (accept-invite, join-by-code)
-- that do their own consent + class-state validation.

-- ============================================================
-- CLASS INVITES — magic-link tokens for email-based join
-- ============================================================
create table if not exists public.class_invites (
  id             uuid primary key default gen_random_uuid(),
  class_id       uuid not null references public.classes(id) on delete cascade,
  invited_email  text not null,
  role           text not null default 'student'
    check (role in ('instructor', 'co-instructor', 'student')),
  token          text not null unique,                            -- 32-char URL-safe random
  expires_at     timestamptz not null default now() + interval '14 days',
  accepted_at    timestamptz,
  accepted_by    uuid references auth.users(id) on delete set null,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists class_invites_class_idx on public.class_invites(class_id);
create index if not exists class_invites_email_idx on public.class_invites(invited_email);

-- Dedup guard: at most one OPEN (unaccepted) invite per (class, email).
-- Instructors clicking "invite" on an already-pending address get the
-- existing token refreshed, not a duplicate row — handled by the API.
create unique index if not exists class_invites_open_unique
  on public.class_invites (class_id, invited_email)
  where accepted_at is null;

alter table public.class_invites enable row level security;

-- Instructors read invites for their classes.
drop policy if exists "class_invites instructors read" on public.class_invites;
create policy "class_invites instructors read" on public.class_invites
  for select to authenticated
  using (exists (
    select 1 from public.class_members cm
    where cm.class_id = class_invites.class_id
      and cm.user_id = auth.uid()
      and cm.role in ('instructor', 'co-instructor')
      and cm.left_at is null
  ));

-- Instructors insert invites — gated on active class + self as creator.
drop policy if exists "class_invites instructors insert" on public.class_invites;
create policy "class_invites instructors insert" on public.class_invites
  for insert to authenticated
  with check (
    exists (
      select 1 from public.class_members cm
      join public.classes c on c.id = cm.class_id
      where cm.class_id = class_invites.class_id
        and cm.user_id = auth.uid()
        and cm.role in ('instructor', 'co-instructor')
        and cm.left_at is null
        and c.archived_at is null
        and c.subscription_status != 'lapsed'
    )
    and created_by = auth.uid()
  );

-- Instructors update their invites (e.g., refresh token on re-invite).
drop policy if exists "class_invites instructors update" on public.class_invites;
create policy "class_invites instructors update" on public.class_invites
  for update to authenticated
  using (exists (
    select 1 from public.class_members cm
    join public.classes c on c.id = cm.class_id
    where cm.class_id = class_invites.class_id
      and cm.user_id = auth.uid()
      and cm.role in ('instructor', 'co-instructor')
      and cm.left_at is null
      and c.archived_at is null
      and c.subscription_status != 'lapsed'
  ));

-- Token-based acceptance bypasses RLS via the service-role Vercel handler.
-- The handler re-validates the token, expiry, consent, and class state
-- (archived_at / subscription_status) BEFORE upserting the membership.

-- ============================================================
-- USER_PROGRESS — instructor read-with-consent policy
-- AUGMENTS existing user_progress RLS. A student's own access is
-- unchanged. This is the most sensitive policy in Phase A.1 — tests
-- #5, #6, #7, #8 in classes-test-plan.sql each exercise a different
-- conjunct.
-- ============================================================
drop policy if exists "user_progress instructor read students" on public.user_progress;
create policy "user_progress instructor read students"
  on public.user_progress for select to authenticated
  using (exists (
    select 1
    from public.class_members cm_student
    join public.class_members cm_instr on cm_instr.class_id = cm_student.class_id
    where cm_student.user_id = user_progress.user_id
      and cm_student.role = 'student'
      and cm_student.left_at is null
      and cm_student.consented_to_instructor_visibility = true
      and cm_instr.user_id = auth.uid()
      and cm_instr.role in ('instructor', 'co-instructor')
      and cm_instr.left_at is null
  ));

-- ============================================================
-- RPC: create_class (SECURITY DEFINER)
-- Atomic class + instructor-membership creation. The SECURITY DEFINER
-- pattern is required because of the RLS chicken-and-egg: a public
-- INSERT policy on classes would need to check class_members (which
-- can't exist yet), and we don't want a public INSERT policy on
-- class_members either. Uses auth.uid() directly — NEVER accepts a
-- user_id parameter from the caller.
-- ============================================================
create or replace function public.create_class(
  class_name text,
  institution_name_in text default null,
  description_in text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  new_code text;
  raw text;
  attempts int := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if class_name is null or length(trim(class_name)) = 0 then
    raise exception 'Class name required';
  end if;

  -- Generate a 6-char uppercase alphanumeric code, retry on collision.
  -- base64 of 6 random bytes is 8 chars; stripping non-alnum and
  -- taking the first 6 gives us the code. If the strip leaves <6
  -- chars we loop.
  loop
    raw := upper(encode(gen_random_bytes(6), 'base64'));
    raw := regexp_replace(raw, '[^A-Z0-9]', '', 'g');
    if length(raw) >= 6 then
      new_code := substring(raw, 1, 6);
      if not exists (select 1 from public.classes where code = new_code) then
        exit;
      end if;
    end if;
    attempts := attempts + 1;
    if attempts > 10 then
      raise exception 'Could not generate unique class code after 10 attempts';
    end if;
  end loop;

  insert into public.classes (name, institution_name, description, code, created_by)
  values (class_name, institution_name_in, description_in, new_code, auth.uid())
  returning id into new_id;

  -- Creator is the first instructor and consents to their own visibility.
  insert into public.class_members (class_id, user_id, role, consented_to_instructor_visibility)
  values (new_id, auth.uid(), 'instructor', true);

  return new_id;
end;
$$;

revoke all on function public.create_class(text, text, text) from public;
grant execute on function public.create_class(text, text, text) to authenticated;
