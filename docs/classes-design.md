# Classes / Institutional feature — schema & API design doc

> **Status:** design draft, **unreviewed & not yet implemented**. No production SQL runs from this file until sign-off. Ship Phase A.1 code only after explicit "approved" on this doc.
>
> **Scope:** Phase A.1 only — the data model, RLS policies, and API contracts required to let an instructor create a class, invite students (magic link + class code), and see a roster with per-student progress.

## Goals

1. Instructors can create a class and invite students by email link OR by a short join code.
2. A class can have multiple instructors (co-instructors) from day one; a user can be an instructor in one class and a student in another.
3. Instructors can see per-student progress for students **who have explicitly consented** to that visibility on invite acceptance.
4. RLS policies enforce all of the above at the database layer — no trust in app code.
5. Schema supports multi-class institutions without migration, but the UI doesn't expose institutions in this phase.
6. Lapsed subscription puts a class in read-only mode without destroying historical data.

## Non-goals (deferred to later phases)

- Assignments (Phase B)
- Cohort aggregate dashboard with per-branch accuracy (Phase B)
- Stripe billing / automated seat provisioning (Phase C)
- Curated case collections (Phase D)
- Bulk CSV invite, DPA template, co-instructor invite UI (Phase E)
- Institution admin UI (deferred — for MVP, a class's `institution_name` is free-text for display only)

## Decisions (using recommended defaults)

| # | Decision | Chosen |
|---|---|---|
| 1 | Ownership model | Classes can have multiple instructors via `class_members.role`. A user can hold different roles in different classes. |
| 2 | Student onboarding | Dual-path: magic-link invite (default) + 6-char class code for self-join. |
| 3 | Role system | Soft roles via a `role` column: `'instructor' \| 'co-instructor' \| 'student'`. Instructors can also be learners in the same app. |
| 4 | Billing model | Deferred to Phase C. For MVP, `user_type = 'institutional'` is set manually by admin for early pilots. |
| 5 | Instructor UX | Same app + new "Teach" nav item, shown only to users with ≥1 class where they're an instructor or co-instructor. |
| 6 | Class naming | Free text `name` field + optional `institution_name` text for attribution. No structured fields yet. |
| 7 | Student peer visibility | Students see class name + their own stats only. Instructor has full visibility. A `peer_visibility` toggle can be added later if requested. |
| 8 | Instructors as learners | Allowed. An instructor's own XP counts in class aggregate. |
| 9 | Lapsed subscription | Class becomes read-only; student progress preserved; instructor can re-subscribe to regain write access. |
| 10 | Consent | Students explicitly consent at invite acceptance ("Prof Smith will see your case completion and accuracy data"). Stored on `class_members.consented_to_instructor_visibility`. Without consent, `user_progress` is invisible to the instructor. |

## Data model

Four new tables. All use `uuid` PKs, all have RLS enabled, all use existing `public` schema.

### `public.institutions`

Nullable parent for multi-class programs. Empty in MVP — included so the FK column on `classes` is usable later without a migration.

```sql
create table if not exists public.institutions (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  billing_email text,
  created_by    uuid references auth.users(id) on delete set null,   -- nullable: survive user deletion as orphan
  created_at    timestamptz not null default now()
);
```

> **FK design note:** every `created_by` column is `nullable + on delete set null`. If a user is deleted, the row survives with `created_by = NULL` rather than cascading or blocking. Previous doc draft had `not null + on delete set null`, which is internally inconsistent (the SET NULL action would fail the NOT NULL constraint). Same fix applied to `classes.created_by` and `class_invites.created_by` below.

### `public.classes`

```sql
create table if not exists public.classes (
  id                   uuid primary key default gen_random_uuid(),
  institution_id       uuid references public.institutions(id) on delete set null,
  name                 text not null,                                  -- free text, e.g., "MPH703 Spring 2026"
  institution_name     text,                                           -- free-text attribution when no institutions row
  description          text,
  code                 text not null unique,                           -- 6-char uppercase, e.g., "BQ7K2F"
  created_by           uuid references auth.users(id) on delete set null,   -- nullable: survive user deletion
  created_at           timestamptz not null default now(),
  archived_at          timestamptz,                                    -- soft-delete
  subscription_status  text not null default 'active'                  -- 'active' | 'lapsed' | 'trialing'
    check (subscription_status in ('active', 'lapsed', 'trialing'))
);

create index if not exists classes_code_idx on public.classes(code);
create index if not exists classes_created_by_idx on public.classes(created_by);
```

**Class-code collision risk:** 6 uppercase-alphanumeric chars (36⁶ ≈ 2.17 billion combinations). At 10,000 active classes the birthday-problem collision probability is ~2×10⁻⁵. We handle it with the UNIQUE constraint + retry-on-insert in the API.

### `public.class_members`

```sql
create table if not exists public.class_members (
  class_id                              uuid not null references public.classes(id) on delete cascade,
  user_id                               uuid not null references auth.users(id) on delete cascade,
  role                                  text not null default 'student'
    check (role in ('instructor', 'co-instructor', 'student')),
  joined_at                             timestamptz not null default now(),
  left_at                               timestamptz,                      -- soft-leave: preserve history, filter active
  consented_to_instructor_visibility    boolean not null default false,   -- set true at invite acceptance / join
  primary key (class_id, user_id)
);

create index if not exists class_members_user_idx on public.class_members(user_id)
  where left_at is null;
create index if not exists class_members_class_role_idx on public.class_members(class_id, role)
  where left_at is null;
```

### `public.class_invites`

```sql
create table if not exists public.class_invites (
  id             uuid primary key default gen_random_uuid(),
  class_id       uuid not null references public.classes(id) on delete cascade,
  invited_email  text not null,
  role           text not null default 'student'
    check (role in ('instructor', 'co-instructor', 'student')),
  token          text not null unique,                               -- 32-char URL-safe random
  expires_at     timestamptz not null default now() + interval '14 days',
  accepted_at    timestamptz,
  accepted_by    uuid references auth.users(id) on delete set null,
  created_by     uuid references auth.users(id) on delete set null,   -- nullable: survive user deletion
  created_at     timestamptz not null default now()
);

create index if not exists class_invites_class_idx on public.class_invites(class_id);
create index if not exists class_invites_email_idx on public.class_invites(invited_email);

-- Dedup guard: at most one OPEN (unaccepted) invite per (class, email) pair.
-- Prevents instructors from accidentally issuing multiple pending tokens for
-- the same person. Expired-but-unaccepted rows still count; API handles
-- "resend" by flipping expires_at forward rather than inserting a duplicate.
create unique index if not exists class_invites_open_unique
  on public.class_invites (class_id, invited_email)
  where accepted_at is null;
```

## Row-Level Security policies

RLS is enabled on **all four tables**. Service-role access (Vercel functions that need to bypass RLS, e.g. accept-invite by token) uses `supabaseAdmin()` explicitly.

### `institutions`

```sql
alter table public.institutions enable row level security;

-- Creator can select / update; nobody else. (Multi-admin comes later.)
create policy "institutions creator read"
  on public.institutions for select to authenticated
  using (created_by = auth.uid());

create policy "institutions creator update"
  on public.institutions for update to authenticated
  using (created_by = auth.uid());

create policy "institutions insert self"
  on public.institutions for insert to authenticated
  with check (created_by = auth.uid());
```

### `classes`

**Chicken-and-egg problem:** inserting a class requires an instructor `class_members` row to exist for the RLS instructor-check to pass, but the class doesn't exist yet to have members. **Solution:** class creation goes through a `SECURITY DEFINER` RPC that atomically creates the `classes` row + the `class_members` row for the creator.

```sql
alter table public.classes enable row level security;

-- Members read classes they're in (includes instructors, co-instructors, and students).
create policy "classes members read"
  on public.classes for select to authenticated
  using (exists (
    select 1 from public.class_members cm
    where cm.class_id = classes.id
      and cm.user_id = auth.uid()
      and cm.left_at is null
  ));

-- Instructors and co-instructors update their classes — but only when the
-- class is active (not archived, not lapsed). Lapsed and archived classes
-- are read-only; an instructor who wants to update them must first
-- reactivate (re-subscribe in Phase C, or un-archive).
create policy "classes instructors update"
  on public.classes for update to authenticated
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

-- No public INSERT policy: all class creation goes through the SECURITY DEFINER
-- create_class RPC below, which atomically creates the class + instructor row.

-- Admin (email-gated) full read for the in-app admin dashboard.
create policy "classes admin read"
  on public.classes for select to authenticated
  using (auth.jwt() ->> 'email' = 'selcukorkmaz@gmail.com');
```

### `class_members`

```sql
alter table public.class_members enable row level security;

-- User reads own membership row.
create policy "class_members read own"
  on public.class_members for select to authenticated
  using (user_id = auth.uid());

-- Instructors read all members of their classes (for the roster / cohort view).
create policy "class_members instructors read all in class"
  on public.class_members for select to authenticated
  using (exists (
    select 1 from public.class_members cm2
    where cm2.class_id = class_members.class_id
      and cm2.user_id = auth.uid()
      and cm2.role in ('instructor', 'co-instructor')
      and cm2.left_at is null
  ));

-- Users update their own membership (to set left_at, or flip consent).
create policy "class_members update own"
  on public.class_members for update to authenticated
  using (user_id = auth.uid());

-- Instructors update members in their classes (promote to co-instructor,
-- soft-remove). Blocked when the class is archived or lapsed — read-only
-- means the roster can't change either.
create policy "class_members instructors update all in class"
  on public.class_members for update to authenticated
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

-- No public INSERT policy: all memberships are created by RPC
-- (create_class, accept_class_invite, join_class_by_code).
```

### `class_invites`

Invites require careful policy: the creator reads them (to see pending invites in the UI), and anyone holding a valid token can consume it — but token-based access bypasses RLS via the service-role Vercel function, so the RLS layer doesn't need a policy for consumption.

```sql
alter table public.class_invites enable row level security;

-- Instructors in the class read invites.
create policy "class_invites instructors read"
  on public.class_invites for select to authenticated
  using (exists (
    select 1 from public.class_members cm
    where cm.class_id = class_invites.class_id
      and cm.user_id = auth.uid()
      and cm.role in ('instructor', 'co-instructor')
      and cm.left_at is null
  ));

-- Instructors create invites for their classes. Blocked when the class
-- is archived or lapsed — a lapsed class cannot add new members.
create policy "class_invites instructors insert"
  on public.class_invites for insert to authenticated
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
```

### Critical new policy on `user_progress`

Instructors must be able to see student progress **only if the student has consented**. This is the most sensitive policy in the whole feature.

```sql
-- Instructor can read student progress when consent is granted AND both parties
-- are active members of the same class AND student's role is 'student'.
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
```

This **augments** the existing `user_progress` policies; the existing "own row select" still holds. A student's own access is unchanged.

## RPC: `create_class` (SECURITY DEFINER)

Atomically creates the class row + the creator's instructor membership. Avoids the chicken-and-egg RLS problem.

```sql
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

  -- Generate a 6-char uppercase alphanumeric code, retry on collision.
  loop
    new_code := upper(substring(encode(gen_random_bytes(6), 'base64'), 1, 6));
    -- Strip non-alphanumeric to keep codes typeable.
    new_code := regexp_replace(new_code, '[^A-Z0-9]', '', 'g');
    if length(new_code) = 6 and not exists (select 1 from public.classes where code = new_code) then
      exit;
    end if;
    attempts := attempts + 1;
    if attempts > 10 then
      raise exception 'Could not generate unique class code';
    end if;
  end loop;

  insert into public.classes (name, institution_name, description, code, created_by)
  values (class_name, institution_name_in, description_in, new_code, auth.uid())
  returning id into new_id;

  insert into public.class_members (class_id, user_id, role, consented_to_instructor_visibility)
  values (new_id, auth.uid(), 'instructor', true);  -- creator consents to their own visibility

  return new_id;
end;
$$;

revoke all on function public.create_class(text, text, text) from public;
grant execute on function public.create_class(text, text, text) to authenticated;
```

## API endpoints (Vercel serverless functions)

All under `/api/classes/*`. Auth via Supabase JWT (same pattern as existing `api/stripe/webhook.ts`).

### `POST /api/classes/create`

Request body: `{ name: string, institution_name?: string, description?: string }`
Auth: signed-in user.
Behavior: calls `supabase.rpc('create_class', {...})`.
Response: `{ id: string, code: string, name: string }`.

### `POST /api/classes/invite`

Request body: `{ class_id: string, email: string, role?: 'student' | 'co-instructor' }`
Auth: must be instructor of `class_id` (RLS enforces).
Behavior:
1. Generate 32-char URL-safe token.
2. Insert `class_invites` row. If a unique-index conflict fires (an open invite already exists for this `(class_id, email)` pair), UPDATE the existing row with a fresh token + new `expires_at` rather than returning an error — this is what instructors expect when they click "invite" on a name that's already pending.
3. Send email via Resend with invite link: `https://biostatquest.com/join?token=XXX`.
4. If email send fails, DO NOT roll back the invite row. Return the join URL in the response so the instructor has a copy-paste fallback (see below).

Response: `{ invite_id: string, expires_at: timestamptz, join_url: string, email_sent: boolean }`.

`join_url` is always returned so instructors can share it manually (Slack, LMS embed, verbal). `email_sent = false` signals the instructor that they need to use the copy-paste path because Resend failed silently.

### `POST /api/classes/accept-invite`

Request body: `{ token: string, consent: true }`
Auth: signed-in user.
Behavior (**uses service-role client** to bypass RLS for token lookup):
1. Resolve token → class_invites row. If missing / expired / accepted, 404.
2. Verify `consent === true` (no implicit consent).
3. Insert `class_members` row: `(class_id, user_id=auth.uid(), role=invites.role, consented_to_instructor_visibility=true)`.
4. Mark invite as accepted.
Response: `{ class_id: string, class_name: string, role: string }`.

### `POST /api/classes/join-by-code`

Request body: `{ code: string, consent: true }`
Auth: signed-in user.
Behavior (**uses service-role client** to bypass RLS for code lookup):
1. Resolve code → classes row. If missing → `404 class not found`. If `archived_at is not null` OR `subscription_status = 'lapsed'` → `409 class unavailable`.
2. Verify `consent === true`.
3. Upsert into `class_members`. A previously-left student rejoining should be reactivated cleanly, not silently no-op'd. Use:
   ```sql
   insert into class_members (class_id, user_id, role, consented_to_instructor_visibility)
   values ($1, auth.uid(), 'student', true)
   on conflict (class_id, user_id) do update
     set left_at = null,
         consented_to_instructor_visibility = true;
   -- joined_at intentionally preserved from the original row so the
   -- "when did they first enroll" timestamp survives a leave/rejoin.
   ```
Response: `{ class_id: string, class_name: string }`.

### `GET /api/classes/mine`

Auth: signed-in user.
Behavior: query `class_members` for active memberships, join to `classes`.
Response: `{ classes: [{ id, name, institution_name, role, code?, member_count }] }`. `code` only included for instructor/co-instructor roles.

### `GET /api/classes/:id/members`

Auth: must be instructor of `:id` (RLS enforces).
Behavior: query `class_members` joined to `user_progress` for per-student summaries.
Response: `{ members: [{ user_id, email, role, joined_at, xp, cases_completed, last_active, consented: boolean }] }`.

## Phase A.1 migration script

Complete SQL, idempotent via `IF NOT EXISTS` / `OR REPLACE`. Runs from the Supabase SQL editor OR as a new file under `supabase_schema.sql` appended to the existing schema.

> See the accompanying `docs/classes-migration.sql` (to be written in Phase A.1.1) for the final runnable script that bundles all DDL above + grants + seed data.

## Test plan (before Phase A.1 closes)

**Ten** tests, all run manually from the Supabase SQL editor as different auth identities. No policy goes unverified.

1. **Create class as instructor.** `supabase.rpc('create_class', {class_name: 'Test'})` returns an ID; `classes` has the row; `class_members` has the instructor row with `consented_to_instructor_visibility = true`.
2. **Non-member cannot read class.** A second user queries `classes` by ID → 0 rows (RLS correctly filters).
3. **Student joins via code.** Second user calls `/api/classes/join-by-code` with the class's code + `consent:true`; `class_members` has their row; they can now see the class in `/api/classes/mine`.
4. **Student joins without consent is rejected.** `consent:false` → API returns 400, no row inserted.
5. **Instructor reads student progress.** Instructor queries `user_progress` for the student's `user_id` → row returned (new policy works).
6. **Non-instructor cannot read student progress.** Another user (not in any shared class) queries the same `user_id` → 0 rows. Another student in the same class queries → 0 rows (not an instructor).
7. **Instructor with `left_at` set loses access.** Set `class_members.left_at = now()` for the instructor row. Re-query `user_progress` for the student → 0 rows. Exercises the `cm_instr.left_at is null` conjunct on the user_progress policy.
8. **Student flipping consent off cuts the instructor's read.** Set `class_members.consented_to_instructor_visibility = false` on the student row. Instructor re-queries `user_progress` → 0 rows. Exercises the `cm_student.consented_to_instructor_visibility = true` conjunct.
9. **Accepted invite token reused → 404.** Call `/api/classes/accept-invite` twice with the same token. First call succeeds; second returns `404 invite not found or already accepted`. Exercises the dedup check in the accept-invite function (service-role client filters on `accepted_at is null` when looking up the token).
10. **Archived or lapsed class rejects new joins.** Set `classes.archived_at = now()` (or `subscription_status = 'lapsed'`) on a class. Call `/api/classes/join-by-code` with its code → API returns `409 class unavailable`. Also confirms the `classes instructors update` policy now blocks instructor writes (test #10b: try to update the class's `name` field — should fail at RLS).

Each test produces a clear pass/fail. If any fails, Phase A.1 does not ship. Tests are also documented as SQL snippets in `docs/classes-migration.sql` (to be written during A.1) so they can be re-run after any schema change.

## Risks & open questions

1. **RLS policy correctness.** The `user_progress instructor read students` policy is the most sensitive single piece of SQL in this feature. One wrong conjunct = cross-class data leak. Test #5 and #6 above specifically exercise it; I'll also run a negative test with a user who IS in a class but left (`left_at` set) to confirm they lose access.

2. **Class code generation entropy.** `gen_random_bytes(6)` + base64 strip + uppercase may produce codes shorter than 6 chars after stripping non-alphanumeric. The retry loop handles this, but if `gen_random_bytes` isn't available on this Supabase plan we'll need to use `md5(random()::text)` as a fallback.

3. **Invite email deliverability.** Resend requires `info@biostatquest.com` sender domain to be verified. We scaffolded this for the re-engagement cron; needs to be confirmed before Phase A.1 ships.

4. **Consent UX.** A student accepting an invite sees a single checkbox. Text: *"I agree that instructors of this class can see my case-completion and accuracy data for BioStat Quest."* Required to proceed. An unchecked submit is rejected client-side AND API-side.

5. **`create_class` as SECURITY DEFINER.** This function bypasses RLS by design. It must validate `auth.uid() is not null` (we do) and not accept a user_id from the caller (it uses `auth.uid()` directly). Reviewed and seems tight, but worth a second pair of eyes before deploy.

6. **Rate limiting.** A bad actor could call `create_class` in a loop to consume codes. For MVP, not a concern at our traffic; add a per-user-per-hour rate limit in Phase B or when traffic justifies it.

7. **Instructor discovery.** How does a user find out they can teach a class? For MVP: they have to know about the Teach tab. We'll add it conditionally based on `class_members.role` — visible only to users who are already instructors. A user's first class is therefore created by Selçuk on their behalf, or via a future "Request instructor access" flow. For pilots this is fine; for scale it's not.

8. **Hardcoded admin email is technical debt.** The `classes admin read` policy (and the identical pattern on five other tables in the existing schema) uses `auth.jwt() ->> 'email' = 'selcukorkmaz@gmail.com'`. This is acceptable at 33 users and 1 admin, but drifts dangerously once (a) the admin email changes, (b) a second admin is added, or (c) the email string is changed in one SQL policy and forgotten in another. A dedicated `public.admins` table with a single row — referenced by every admin policy via `exists (select 1 from admins where user_id = auth.uid())` — is one migration away and removes all future drift. Defer to Phase E or the day a second admin is needed, whichever is first.

## Sign-off checklist

Before any Phase A.1 SQL or API code is committed:

- [ ] Data model reviewed and approved by @selcukorkmaz
- [ ] RLS policies reviewed — especially `user_progress instructor read students`
- [ ] `create_class` RPC security-definer pattern approved
- [ ] API contracts (input/output shapes) approved
- [ ] Resend sender domain verification confirmed
- [ ] Test plan understood — all 6 tests will run before code ships

Once all six boxes are ticked, Phase A.1 ships as one commit: migration SQL + RPC + API endpoints. No UI yet.

## Phase A.2 preview (UI — next session after A.1)

- "Teach" nav item (conditional)
- `/classes` — instructor's class list
- `/classes/new` — create class flow
- `/classes/:id` — class dashboard (roster + per-student progress cards)
- `/classes/:id/invite` — invite UI (email + copy class code)

## Phase A.3 preview (student UI — session after A.2)

- `/join?token=XXX` — invite acceptance page with consent checkbox
- "Join by code" entry on home screen (for signed-in students not yet in any class)
- "My classes" chip on the authed home screen

## Appendix: example cohort query (Phase B preview)

Not implemented in Phase A. Shown here to verify the data model supports it:

```sql
-- Per-student summary for an instructor's cohort view
select
  cm.user_id,
  up.email,
  coalesce((up.state->>'xp')::int, 0)                as xp,
  coalesce(jsonb_array_length(up.state->'completed'), 0) as cases_completed,
  coalesce((up.state->>'currentStreak')::int, 0)     as streak,
  up.updated_at                                      as last_active
from public.class_members cm
join public.user_progress up on up.user_id = cm.user_id
where cm.class_id = $1
  and cm.role = 'student'
  and cm.left_at is null
  and cm.consented_to_instructor_visibility = true
order by up.updated_at desc;
```

Works given the new `user_progress instructor read students` policy.

---

**This doc is the gate.** Once you sign off (or push back), I'll implement Phase A.1 as a single commit: the migration SQL, the `create_class` RPC, the four API endpoints, plus the test harness. No UI yet — that's Phase A.2.
