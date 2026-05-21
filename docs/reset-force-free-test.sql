-- Reset the force_free_test sentinel after smoke-testing the LS purchase
-- flow. Run ONCE in the Supabase SQL editor after live mode is verified.
--
-- During smoke testing, `selcukkorkmaz@trakya.edu.tr` was marked with
-- user_type='force_free_test' so the paywall would fire for that single
-- account while OPEN_BETA_PRO=true. With the beta flag now off, the
-- sentinel is no longer needed.
--
-- This row currently holds the residue of the last cancelled test
-- subscription (billing_provider='lemonsqueezy', status='cancelled').
-- That's accurate history — leave it. The user_type change here just
-- moves them back to the post-beta tier.

update public.user_progress
set user_type = 'free'
where email = 'selcukkorkmaz@trakya.edu.tr'
  and user_type = 'force_free_test'
returning email, user_type, billing_provider, stripe_subscription_status;
