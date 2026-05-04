-- ============================================================
-- v3 — Issued Statements of Competency (F16 verify)
-- ============================================================
-- Backs the Doc ID printed on each Statement of Competency with a
-- server-side record so a third-party (CV reviewer, employer) can
-- independently verify the document via /verify.
--
-- Apply once via the Supabase SQL editor.
-- ============================================================

create table if not exists public.statements (
  doc_id      text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  email       text not null,
  issued_at   timestamptz not null default now(),
  -- Snapshot of per-tier counts and branch summary at issue time, so the
  -- verify response can describe what the statement claims without
  -- exposing the user's full activity history.
  payload     jsonb not null
);

create index if not exists statements_user_issued_idx
  on public.statements(user_id, issued_at desc);

alter table public.statements enable row level security;

-- Issuers (the user themselves) can read their own records.
drop policy if exists statements_select_own on public.statements;
create policy statements_select_own on public.statements
  for select to authenticated using (user_id = auth.uid());

-- Issuers can insert their own; the API still enforces email matches the
-- caller's identity, but the policy is a backstop.
drop policy if exists statements_insert_own on public.statements;
create policy statements_insert_own on public.statements
  for insert to authenticated with check (user_id = auth.uid());

-- Public verification path uses the service role via /api/verify; no
-- anon SELECT policy is exposed (verifier must call the endpoint, not
-- the table directly).
