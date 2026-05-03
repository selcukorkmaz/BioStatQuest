// @ts-nocheck
// F8 — "My Misconceptions" view. The learner-facing counterpart to the
// admin telemetry tab: shows each misconception_tag the signed-in user
// has matched in the last 60 days, sorted by frequency, with a card per
// tag showing a humanized label, count, last-seen relative time, the
// example question + distractor that earned the tag, and the distractor's
// pedagogical correction. Driven by:
//
//   - BQAuth.fetchMyMisconceptions() → tag→{count, lastSeen}
//   - getMisconceptionMeta(tag)      → humanized label + example + remediation
//
// Empty states: signed-out (CTA to sign in) vs signed-in-no-history
// (encourage practice). Read-only for v0; "Practice this" deep links land
// in a later iteration.

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { getMisconceptionMeta } from "../lib/misconceptions";
import { effectivelyPro } from "../lib/launchFlags";

// Free tier sees only the top N tags. Pro removes the cap and unlocks the
// per-tag drill-down. Threshold is generous enough to be useful but tight
// enough to make Pro a real upgrade for serious learners.
const FREE_TAG_LIMIT = 3;

function relativeTime(iso) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diffMs = Date.now() - t;
  const day = 24 * 60 * 60 * 1000;
  const days = Math.round(diffMs / day);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

function formatChosen(chosen) {
  if (chosen == null) return "—";
  if (typeof chosen === "number") return `option ${String.fromCharCode(65 + chosen)}`;
  if (Array.isArray(chosen)) return chosen.map((i) => String.fromCharCode(65 + i)).join(", ");
  return String(chosen);
}

export function MyMisconceptions({ onExit, onOpenGlossary = null }) {
  const [counts, setCounts] = useState(null); // null = loading, {} = loaded
  const [err, setErr] = useState("");
  const [signedIn, setSignedIn] = useState(
    () => !!(typeof window !== "undefined" && window.BQAuth?.getUser?.()),
  );
  const [isPro, setIsPro] = useState(() => effectivelyPro(undefined));

  // Per-tag drill-down state (Pro). { tag: { loading, history, error } }.
  const [drilldowns, setDrilldowns] = useState({});

  useEffect(() => {
    let alive = true;
    const auth = (typeof window !== "undefined" && window.BQAuth) || null;
    setSignedIn(!!auth?.getUser?.());
    if (!auth?.fetchMyMisconceptions) {
      setCounts({});
      return;
    }
    auth.fetchMyMisconceptions()
      .then((m) => { if (alive) setCounts(m || {}); })
      .catch((e) => { if (alive) { setErr((e && e.message) || "Could not load."); setCounts({}); } });
    if (auth.fetchSubscription) {
      auth.fetchSubscription().then((s) => {
        if (alive) setIsPro(effectivelyPro(s?.user_type));
      }).catch(() => {});
    }
    const off = auth.onAuthChange?.(() => {
      setSignedIn(!!auth.getUser?.());
      auth.fetchMyMisconceptions().then((m) => { if (alive) setCounts(m || {}); }).catch(() => {});
      auth.fetchSubscription?.().then((s) => {
        if (alive) setIsPro(effectivelyPro(s?.user_type));
      }).catch(() => {});
    });
    return () => { alive = false; if (typeof off === "function") off(); };
  }, []);

  function toggleDrilldown(tag) {
    setDrilldowns((prev) => {
      const cur = prev[tag];
      if (cur && (cur.history || cur.error || cur.loading)) {
        // Toggle close → discard cached state so re-open re-fetches fresh.
        const { [tag]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [tag]: { loading: true, history: null, error: null } };
    });
    // Fire-and-forget fetch when expanding.
    const auth = (window as any).BQAuth;
    if (!auth?.fetchMyMisconceptionHistory) return;
    setTimeout(async () => {
      try {
        const history = await auth.fetchMyMisconceptionHistory(tag, 50);
        setDrilldowns((prev) => prev[tag]
          ? { ...prev, [tag]: { loading: false, history, error: null } }
          : prev);
      } catch (e) {
        setDrilldowns((prev) => prev[tag]
          ? { ...prev, [tag]: { loading: false, history: null, error: (e && (e as any).message) || "Could not load." } }
          : prev);
      }
    }, 0);
  }

  // Build a sorted array of {tag, count, lastSeen, meta?}
  const allRows = useMemo(() => {
    if (!counts) return [];
    return Object.entries(counts)
      .map(([tag, v]) => ({ tag, count: v.count || 0, lastSeen: v.lastSeen || "", meta: getMisconceptionMeta(tag) }))
      .sort((a, b) => b.count - a.count || (b.lastSeen > a.lastSeen ? 1 : -1));
  }, [counts]);

  const visibleRows = isPro ? allRows : allRows.slice(0, FREE_TAG_LIMIT);
  const hiddenCount = isPro ? 0 : Math.max(0, allRows.length - FREE_TAG_LIMIT);
  const totalHits = allRows.reduce((s, r) => s + r.count, 0);

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 fade-in">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="t-title mb-1">My Misconceptions</h2>
          <p className="t-body text-slate-400 text-sm">
            Patterns the system has noticed in your wrong answers — last 60 days.
          </p>
        </div>
        <button onClick={onExit} className="btn btn-ghost px-3 py-2 rounded-lg text-sm">← Back</button>
      </div>

      {err && <div className="card rounded-xl p-4 mb-4 text-sm text-red-400">{err}</div>}

      {!signedIn ? (
        <div className="card rounded-2xl p-8 text-center">
          <h3 className="text-lg font-semibold text-white mb-2">Sign in to track your misconceptions</h3>
          <p className="t-body text-slate-400 mb-4">
            We notice patterns in the wrong answers you pick — like confusing the null value
            for ratio measures, or treating frequentist CIs as Bayesian probabilities — and
            surface them here so you can spot and fix them.
          </p>
        </div>
      ) : counts === null ? (
        <div className="card rounded-xl p-6 text-slate-500 text-sm">Loading…</div>
      ) : allRows.length === 0 ? (
        <div className="card rounded-2xl p-8 text-center">
          <h3 className="text-lg font-semibold text-white mb-2">Nothing to surface yet</h3>
          <p className="t-body text-slate-400">
            Once you've worked through a few cases, repeated misconceptions will appear here
            with a quick refresher for each one. Wrong answers are good — they're how we
            learn what to teach you next.
          </p>
        </div>
      ) : (
        <>
          <div className="text-xs text-slate-500 mono mb-3">
            {visibleRows.length}{!isPro && hiddenCount > 0 ? `/${allRows.length}` : ""} misconception{allRows.length === 1 ? "" : "s"} shown
            {" · "}
            {totalHits} total hit{totalHits === 1 ? "" : "s"}
            {!isPro && (
              <span className="ml-2 text-amber-300/90">· Free tier shows top {FREE_TAG_LIMIT}</span>
            )}
          </div>
          <div className="space-y-3">
            {visibleRows.map((r) => {
              const drill = drilldowns[r.tag];
              const drillOpen = !!drill;
              return (
                <article key={r.tag} className="card rounded-xl p-4">
                  <header className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
                    <h3 className="text-base font-semibold text-white">
                      {r.meta?.label ?? r.tag}
                    </h3>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mono">
                      <span className="chip bg-rose-900/40 text-rose-200 text-[10px]">× {r.count}</span>
                      <span>{relativeTime(r.lastSeen)}</span>
                    </div>
                  </header>
                  {r.meta ? (
                    <>
                      <div className="text-xs text-slate-500 italic mb-2 leading-relaxed">
                        Example · case <span className="mono text-slate-400">{r.meta.caseId}</span>
                        {r.meta.method ? <> · method <span className="mono text-slate-400">{r.meta.method}</span></> : null}
                      </div>
                      <p className="text-sm text-slate-300 mb-2 leading-relaxed">
                        <span className="text-slate-400">Q. </span>{r.meta.exampleStem}
                      </p>
                      <p className="text-sm text-slate-300 mb-2 leading-relaxed">
                        <span className="text-rose-300/80 text-xs uppercase tracking-widest mr-1">You picked</span>
                        <span className="text-slate-200">{r.meta.exampleOption}</span>
                      </p>
                      <p className="text-sm text-amber-100/90 leading-relaxed">
                        <span className="text-amber-300 text-xs uppercase tracking-widest mr-1">Why it's wrong</span>
                        {r.meta.whyWrong}
                      </p>
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        {r.meta.method && onOpenGlossary && (
                          <button
                            onClick={() => onOpenGlossary(r.meta.method)}
                            className="btn btn-ghost px-3 py-1.5 rounded-lg text-xs">
                            Open in glossary →
                          </button>
                        )}
                        {isPro ? (
                          <button
                            onClick={() => toggleDrilldown(r.tag)}
                            className="btn btn-ghost px-3 py-1.5 rounded-lg text-xs">
                            {drillOpen ? "Hide history" : "Show all my hits →"}
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-500 italic">
                            Pro unlocks per-tag history (every time you matched this).
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-slate-500 italic">
                      No example available — the source question may have changed since this tag was recorded.
                    </p>
                  )}

                  {/* Pro per-tag drill-down: timeline of every match for this tag */}
                  {drillOpen && (
                    <div className="mt-3 rounded-lg border border-slate-700/60 bg-slate-950/40 p-3">
                      <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">
                        History (last 50 matches)
                      </div>
                      {drill.loading ? (
                        <div className="text-xs text-slate-500">Loading…</div>
                      ) : drill.error ? (
                        <div className="text-xs text-red-400">{drill.error}</div>
                      ) : !drill.history || drill.history.length === 0 ? (
                        <div className="text-xs text-slate-500">No detailed history found.</div>
                      ) : (
                        <ul className="space-y-1 text-xs">
                          {drill.history.map((h, i) => (
                            <li key={`${h.qid}-${h.createdAt}-${i}`} className="flex items-center justify-between gap-2 py-0.5 border-b border-slate-800/40 last:border-0">
                              <span className="text-slate-400 mono">{new Date(h.createdAt).toISOString().slice(0, 10)}</span>
                              <span className="text-slate-300 mono">{h.qid}</span>
                              <span className="text-slate-500">{formatChosen(h.chosen)}</span>
                              <span className="text-slate-600 text-[10px] mono">
                                {h.msToAnswer ? `${(h.msToAnswer / 1000).toFixed(1)}s` : "—"}
                                {h.difficulty ? ` · ${h.difficulty}` : ""}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {!isPro && hiddenCount > 0 && (
            <div className="card rounded-xl p-4 mt-3 border border-amber-700/40 bg-amber-950/20">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h4 className="text-sm font-semibold text-amber-200 mb-1">
                    {hiddenCount} more misconception{hiddenCount === 1 ? "" : "s"} hidden
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Pro shows your full ledger plus per-tag history (every time you matched a misconception, with date, question, and what you picked).
                  </p>
                </div>
                <a href="/upgrade" className="btn btn-primary px-4 py-2 rounded-lg text-xs shrink-0">
                  See Pro →
                </a>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default MyMisconceptions;
