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

// Hardcoded for the launch window. Flip to `false` and redeploy when
// paid plans go live (that's the entire teardown — no DB change, no
// env-var dance). Env-driven version was tried first but Vercel's
// build pipeline didn't reliably inline VITE_ envs in our setup;
// hardcoded constant is friction-free for a flag that's meant to flip
// exactly twice in its life.
export const OPEN_BETA_PRO: boolean = true;

// "Effectively Pro" — the truth source for client-side feature gating.
// Centralises the check so future tier additions (e.g. educator)
// land in one file. During open beta, ANY signed-in user is treated as
// Pro (callers must still verify the user is signed in before relying
// on this — anonymous users get nothing regardless of beta).
export function effectivelyPro(userType: string | undefined | null): boolean {
  if (userType === "pro" || userType === "institutional") return true;
  if (OPEN_BETA_PRO) return true;
  return false;
}
