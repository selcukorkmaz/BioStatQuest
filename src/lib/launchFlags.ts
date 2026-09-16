// Launch-time feature flags. Single source of truth for "are we in
// open-beta mode where every signed-in user temporarily has Pro?"
//
// Why: during the window between code-shipping Pro features and the
// payments processor (Lemon Squeezy) finishing its activation review,
// users would see locked features they have no way to unlock — the
// worst possible product state. Open beta gives them full access during
// that window with a clear banner explaining it's temporary.
//
// To activate: set VITE_OPEN_BETA_PRO=true (client) and OPEN_BETA_PRO=
// true (server) in Vercel env vars. To turn off: flip both to false (or
// remove) and redeploy. The DB state never changes; this is purely a
// client/server gate override.

// ============================================================
// PAYMENTS KILL SWITCH — single source of truth.
//
// Flipped to `false` on 2026-09-17: paid Pro plans, every checkout /
// pricing surface, and the institutional (per-seat) offer were withdrawn
// from the product. Nobody had an active paid subscription at the time,
// so there was no migration to run.
//
// While this is `false`:
//   • `effectivelyPro()` returns true for everyone — no case, hint layer,
//     exam, AI-tutor quota, competency statement or misconception tag is
//     gated. There is no paywall, because there is nothing to buy.
//   • The Upgrade page, the paywall modal and the TopBar upgrade/Pro
//     affordances are not rendered or routed.
//   • /api/{stripe,lemonsqueezy}/{checkout,portal,cancel} answer 410
//     (see api/_lib/payments.ts — the server is the real enforcement
//     point; the UI removal is convenience, not security).
//
// To re-open sales: flip this to `true`, flip PAYMENTS_ENABLED in
// api/_lib/payments.ts to match, restore the pricing sections in
// index.html / for-educators.html from git history, and re-add the
// "upgrade" route in src/lib/viewRoutes.ts + App.tsx.
// ============================================================
export const PAYMENTS_ENABLED: boolean = false;

// Hardcoded for the launch window. Flipped to `false` on 2026-05-21
// when paid plans went live via Lemon Squeezy. Existing engaged beta
// users were grandfathered to 6 months of Pro via SQL backfill (see
// docs/grandfather-beta-users.sql) so the cutover wasn't a hostile
// rug-pull. Net effect: anyone who signed up + did work pre-live
// keeps Pro for free until 2026-11-21; everyone else (zero-progress
// stale accounts + new signups) hits the paywall like normal.
//
// To re-enable open beta later (unlikely): flip back to `true` and
// redeploy. Existing paid subscriptions are unaffected.
export const OPEN_BETA_PRO: boolean = false;

// Sentinel user_type that opts a specific account OUT of the open-beta
// override. Used to test the paywall + Lemon Squeezy purchase flow
// against a real account without affecting any other beta user. After
// a successful test purchase, the LS webhook flips user_type to 'pro';
// on cancellation it flips back to 'free' — at which point the
// sentinel is lost and must be re-applied for another test round.
//
// Apply manually in Supabase SQL editor:
//   update public.user_progress
//     set user_type='force_free_test'
//     where email='<your-test-email>';
//
// Remove when no longer needed (just set back to 'free' or 'pro' as
// appropriate) — there's nothing else in the system that consumes this
// value other than the short-circuit below.
export const FORCE_FREE_TEST_USER_TYPE = "force_free_test";

// "Effectively Pro" — the truth source for client-side feature gating.
// Centralises the check so future tier additions (e.g. educator)
// land in one file. During open beta, ANY signed-in user is treated as
// Pro (callers must still verify the user is signed in before relying
// on this — anonymous users get nothing regardless of beta).
//
// The sentinel `force_free_test` short-circuits BEFORE the open-beta
// override so a test account can hit the paywall while everyone else
// keeps full beta access. Order matters here.
export function effectivelyPro(userType: string | undefined | null): boolean {
  // Payments withdrawn → every feature is free for everyone. This check
  // comes first, ahead of even the force_free_test sentinel: with no
  // checkout to reach, a "locked" user would be stuck with no way out,
  // which is exactly the state this flag exists to prevent.
  if (!PAYMENTS_ENABLED) return true;
  if (userType === FORCE_FREE_TEST_USER_TYPE) return false;
  if (userType === "pro" || userType === "institutional") return true;
  if (OPEN_BETA_PRO) return true;
  return false;
}
