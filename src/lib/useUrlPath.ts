// Minimum-viable URL routing. Replaces nothing today; layered alongside
// the existing `view` string state in App.tsx so the back button works
// without a full router-library migration.
//
// Why no library: the master plan called for TanStack Router, but on a
// 7,797-line god component with no integration tests covering routing,
// installing a router library + rewriting every navigation call would
// be all-or-nothing risk for a benefit (deep-linking, back button) we
// can deliver in 30 lines. When App.tsx is decomposed in Phase 6 and
// integration tests are in place, we can swap this for TanStack Router
// in an afternoon.
//
// Usage:
//   const { path, navigate } = useUrlPath();
//   useEffect(() => { setView(viewFromPath(path)); }, [path]);
//   ...
//   const goTeach = () => { setView("teach"); navigate("/teach"); };

import { useEffect, useState, useCallback } from "react";

export function useUrlPath() {
  const [path, setPath] = useState<string>(() =>
    typeof window === "undefined" ? "/" : window.location.pathname
  );

  // Browser back/forward fires popstate. Update local state so the
  // app re-renders to match the new URL.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Push a new entry to history, but only if the path actually changed.
  // Otherwise we'd add identical entries and the back button would
  // appear broken (clicks "back," nothing happens, clicks again,
  // finally goes back).
  //
  // `replace` skips the history entry entirely — useful when redirecting
  // away from a one-shot URL like /?admin=1 → /admin.
  const navigate = useCallback((next: string, opts: { replace?: boolean } = {}) => {
    if (typeof window === "undefined") return;
    if (next === window.location.pathname + window.location.search + window.location.hash) return;
    if (opts.replace) {
      window.history.replaceState(null, "", next);
    } else {
      window.history.pushState(null, "", next);
    }
    setPath(window.location.pathname);
  }, []);

  return { path, navigate };
}
