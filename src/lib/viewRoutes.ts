// Canonical view ↔ URL path mapping. Used by App.tsx to keep the URL
// in sync with the current view, and to resolve a fresh page load to
// the right starting view.
//
// Limitations of the minimum-viable implementation:
//   • Views that depend on transient state (select / play / result —
//     they need an active caseId which isn't yet in the URL) are NOT
//     in this map. They stay as in-app-only view names. Phase 6's
//     view extraction is the natural moment to add /case/:caseId.
//   • The onboarding gate is auto-resolved on mount (initial-view
//     resolver in App.tsx) and intentionally has no URL — it's not
//     a place a user navigates to.

// Keep this list in sync with App.tsx's `view` strings. Any view name
// added here must have a corresponding render arm in App.tsx, or this
// will silently route to a blank screen.
//
// IMPORTANT: "home" maps to "/biostat-quest" (not "/") because the apex
// path serves the marketing landing page (index.html). Navigating "home"
// inside the SPA must NOT take the user back to the marketing site.
// Vercel rewrites (vercel.json) make every app-side path resolve back
// to /biostat-quest so the React app handles routing on reload too.
export const PATH_TO_VIEW: Record<string, string> = {
  "/biostat-quest": "home",
  "/diagnostic": "diagnostic",
  "/diagnostic/results": "results",
  "/tree": "tree",
  "/lab": "lab",
  "/rlab": "rlab",
  "/badges": "badges",
  "/leaderboard": "board",
  "/stats": "stats",
  "/glossary": "glossary",
  "/misconceptions": "misconceptions",
  "/exam": "exam",
  "/competency": "competency",
  "/admin": "admin",
  "/teach": "teach",
  "/join": "join",
};

// Reverse map. Built lazily so changes to PATH_TO_VIEW propagate
// without manual sync.
const VIEW_TO_PATH: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [path, view] of Object.entries(PATH_TO_VIEW)) {
    // First path wins (relevant if two paths ever map to the same view).
    if (!(view in out)) out[view] = path;
  }
  return out;
})();

/** URL pathname → view name. Returns null when no mapping exists. */
export function viewFromPath(pathname: string): string | null {
  // Strip trailing slash for canonical matching, but always allow "/" itself.
  const p = pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
  return PATH_TO_VIEW[p] ?? null;
}

/** View name → canonical URL path. Returns null when the view has no URL. */
export function pathFromView(view: string): string | null {
  return VIEW_TO_PATH[view] ?? null;
}

/** True if this view is meant to live in the URL (gets back-button support). */
export function viewHasUrl(view: string): boolean {
  return view in VIEW_TO_PATH;
}
