-- Grandfather existing beta users at the OPEN_BETA_PRO cutover.
-- Run ONCE in the Supabase SQL editor on the same day you flip
-- OPEN_BETA_PRO to false in src/lib/launchFlags.ts.
--
-- Strategy (Option B from the cutover plan):
-- Anyone who actually engaged with the product during the beta gets 6
-- months of Pro for free as a thank-you. "Engaged" means at least one
-- of:
--   • non-zero XP (they completed at least one question), OR
--   • at least one case in state.completed
--
-- Pure tire-kickers (signed up, did nothing) are not grandfathered —
-- they'll hit the paywall like brand-new signups, which is the right
-- behavior (they didn't actually use the product, they're indistinct
-- from a brand-new visitor).
--
-- After this runs:
--   • Engaged beta users: user_type='pro', billing_provider='open_beta_grandfather',
--     stripe_subscription_status='active', stripe_current_period_end=now()+6mo
--   • Stale beta users (zero XP, no completed cases): unchanged (still 'free')
--   • Already-paid users: unchanged (don't touch them)
--
-- Reversibility: if the grandfather window proves wrong, you can roll
-- it back with:
--   update public.user_progress
--     set user_type='free',
--         billing_provider=null,
--         stripe_subscription_status=null,
--         stripe_current_period_end=null
--     where billing_provider='open_beta_grandfather';

begin;

with engaged as (
  select user_id
  from public.user_progress
  where user_type = 'free'
    and billing_provider is null
    and (
         coalesce((state->>'xp')::int, 0) > 0
      or jsonb_array_length(coalesce(state->'completed', '[]'::jsonb)) > 0
    )
)
update public.user_progress p
set
  user_type = 'pro',
  billing_provider = 'open_beta_grandfather',
  stripe_subscription_status = 'active',
  stripe_current_period_end = (now() + interval '6 months')::timestamptz
from engaged
where p.user_id = engaged.user_id
returning p.user_id, p.email, p.user_type, p.stripe_current_period_end;

-- Verify counts before commit. If the number looks wildly off, ROLLBACK
-- and inspect. Realistic order of magnitude: tens-to-low-hundreds.
-- (The returned rows from the UPDATE above are shown in the editor;
-- additional sanity-check queries below.)

select
  count(*) filter (where billing_provider = 'open_beta_grandfather') as grandfathered,
  count(*) filter (where user_type = 'pro' and billing_provider = 'lemonsqueezy') as ls_paying,
  count(*) filter (where user_type = 'free') as still_free,
  count(*) as total_users
from public.user_progress;

commit;
