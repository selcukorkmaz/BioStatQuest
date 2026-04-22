-- BioStat Quest — Classes & Institutional schema (Phase A.1)
-- Idempotent: re-running overwrites policies + helpers cleanly.
--
-- ORDER OF OPERATIONS:
--   1. All CREATE TABLE
--   2. All CREATE INDEX
--   3. ALTER TABLE ... ENABLE RLS
--   4. Helper functions (SECURITY DEFINER) — must exist before policies
--      that call them. Without these, policies like
--      "class_members instructors read all in class" recurse on
--      themselves and fail with "infinite recursion detected in policy".
--   5. DROP / CREATE POLICY
--   6. RPC create_class

-- ============================================================
-- SECTION 1 — TABLES
-- ============================================================

create table if not exists public.institutions (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  billing_email text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists public.classes (
  id                   uuid primary key default gen_random_uuid(),
  institution_id       uuid references public.institutions(id) on delete set null,
  name                 text not null,
  institution_name     text,
  description          text,
  code                 text not null unique,
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  archived_at          timestamptz,
  subscription_status  text not null default 'active'
    check (subscription_status in ('active', 'lapsed', 'trialing'))
);

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

create table if not exists public.class_invites (
  id             uuid primary key default gen_random_uuid(),
  class_id       uuid not null references public.classes(id) on delete cascade,
  invited_email  text not null,
  role           text not null default 'student'
    check (role in ('instructor', 'co-instructor', 'student')),
  token          text not null unique,
  expires_at     timestamptz not null default now() + interval '14 days',
  accepted_at    timestamptz,
  accepted_by    uuid references auth.users(id) on delete set null,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- ============================================================
-- SECTION 2 — INDEXES
-- ============================================================

create index if not exists classes_code_idx on public.classes(code);
create index if not exists classes_created_by_idx on public.classes(created_by);

create index if not exists class_members_user_idx on public.class_members(user_id)
  where left_at is null;
create index if not exists class_members_class_role_idx on public.class_members(class_id, role)
  where left_at is null;

create index if not exists class_invites_class_idx on public.class_invites(class_id);
create index if not exists class_invites_email_idx on public.class_invites(invited_email);

create unique index if not exists class_invites_open_unique
  on public.class_invites (class_id, invited_email)
  where accepted_at is null;

-- ============================================================
-- SECTION 3 — ENABLE RLS
-- ============================================================

alter table public.institutions   enable row level security;
alter table public.classes        enable row level security;
alter table public.class_members  enable row level security;
alter table public.class_invites  enable row level security;

-- ============================================================
-- SECTION 4 — HELPER FUNCTIONS (SECURITY DEFINER)
--
-- These exist solely to be called from RLS policies that would
-- otherwise self-reference the table they're defined on, causing
-- Postgres to bail with "infinite recursion detected in policy".
-- Because they run with the function owner's privileges, their
-- SELECTs on class_members bypass RLS — which is safe here because
-- each function returns only a boolean derived from auth.uid()
-- and the caller's class_id argument; no row data leaks.
-- ============================================================

create or replace function public.is_instructor_in_class(class_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.class_members
    where class_id = class_uuid
      and user_id = auth.uid()
      and role in ('instructor', 'co-instructor')
      and left_at is null
  );
$$;

create or replace function public.is_member_of_class(class_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.class_members
    where class_id = class_uuid
      and user_id = auth.uid()
      and left_at is null
  );
$$;

create or replace function public.is_class_writable(class_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.classes
    where id = class_uuid
      and archived_at is null
      and subscription_status != 'lapsed'
  );
$$;

revoke all on function public.is_instructor_in_class(uuid) from public;
revoke all on function public.is_member_of_class(uuid)     from public;
revoke all on function public.is_class_writable(uuid)      from public;

grant execute on function public.is_instructor_in_class(uuid) to authenticated;
grant execute on function public.is_member_of_class(uuid)     to authenticated;
grant execute on function public.is_class_writable(uuid)      to authenticated;

-- ============================================================
-- SECTION 5 — POLICIES (use helpers to avoid recursion)
-- ============================================================

-- 5a. institutions
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

-- 5b. classes
drop policy if exists "classes members read" on public.classes;
create policy "classes members read" on public.classes
  for select to authenticated
  using (public.is_member_of_class(id));

drop policy if exists "classes instructors update" on public.classes;
create policy "classes instructors update" on public.classes
  for update to authenticated
  using (
    archived_at is null
    and subscription_status != 'lapsed'
    and public.is_instructor_in_class(id)
  );

drop policy if exists "classes admin read" on public.classes;
create policy "classes admin read" on public.classes
  for select to authenticated
  using (auth.jwt() ->> 'email' = 'selcukorkmaz@gmail.com');

-- 5c. class_members
drop policy if exists "class_members read own" on public.class_members;
create policy "class_members read own" on public.class_members
  for select to authenticated
  using (user_id = auth.uid());

-- INTENTIONAL: does NOT gate on archived_at / subscription_status.
-- Read-only classes should still show rosters to their instructors.
drop policy if exists "class_members instructors read all in class" on public.class_members;
create policy "class_members instructors read all in class" on public.class_members
  for select to authenticated
  using (public.is_instructor_in_class(class_id));

drop policy if exists "class_members update own" on public.class_members;
create policy "class_members update own" on public.class_members
  for update to authenticated
  using (user_id = auth.uid());

drop policy if exists "class_members instructors update all in class" on public.class_members;
create policy "class_members instructors update all in class" on public.class_members
  for update to authenticated
  using (
    public.is_instructor_in_class(class_id)
    and public.is_class_writable(class_id)
  );

-- 5d. class_invites
drop policy if exists "class_invites instructors read" on public.class_invites;
create policy "class_invites instructors read" on public.class_invites
  for select to authenticated
  using (public.is_instructor_in_class(class_id));

drop policy if exists "class_invites instructors insert" on public.class_invites;
create policy "class_invites instructors insert" on public.class_invites
  for insert to authenticated
  with check (
    public.is_instructor_in_class(class_id)
    and public.is_class_writable(class_id)
    and created_by = auth.uid()
  );

drop policy if exists "class_invites instructors update" on public.class_invites;
create policy "class_invites instructors update" on public.class_invites
  for update to authenticated
  using (
    public.is_instructor_in_class(class_id)
    and public.is_class_writable(class_id)
  );

-- 5e. user_progress — instructor-with-consent read.
-- Queries class_members from within user_progress policy — but the
-- instructor check uses the helper, so no recursion.
drop policy if exists "user_progress instructor read students" on public.user_progress;
create policy "user_progress instructor read students"
  on public.user_progress for select to authenticated
  using (exists (
    select 1 from public.class_members cm_student
    where cm_student.user_id = user_progress.user_id
      and cm_student.role = 'student'
      and cm_student.left_at is null
      and cm_student.consented_to_instructor_visibility = true
      and public.is_instructor_in_class(cm_student.class_id)
  ));

-- ============================================================
-- SECTION 6 — RPC: create_class (SECURITY DEFINER)
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
  attempts int := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if class_name is null or length(trim(class_name)) = 0 then
    raise exception 'Class name required';
  end if;

  -- Generate a 6-char uppercase hex class code using Postgres built-ins
  -- (md5 of random() + clock_timestamp to avoid same-txn collisions).
  -- Yields 16^6 = ~16.7M possible codes — plenty for a join-aid code
  -- whose real security is RLS + explicit consent, not obscurity.
  -- Retry on the rare collision; bail after 10 attempts so a corrupt
  -- loop can't hang the RPC.
  loop
    new_code := upper(substring(
      md5(random()::text || clock_timestamp()::text || attempts::text),
      1, 6
    ));
    if not exists (select 1 from public.classes where code = new_code) then
      exit;
    end if;
    attempts := attempts + 1;
    if attempts > 10 then
      raise exception 'Could not generate unique class code after 10 attempts';
    end if;
  end loop;

  insert into public.classes (name, institution_name, description, code, created_by)
  values (class_name, institution_name_in, description_in, new_code, auth.uid())
  returning id into new_id;

  insert into public.class_members (class_id, user_id, role, consented_to_instructor_visibility)
  values (new_id, auth.uid(), 'instructor', true);

  return new_id;
end;
$$;

revoke all on function public.create_class(text, text, text) from public;
grant execute on function public.create_class(text, text, text) to authenticated;
