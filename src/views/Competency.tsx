// @ts-nocheck
// F16 — Competency map + Statement of Competency. Two views in one
// component, switched by `mode`:
//   • screen     — interactive ladder per branch (free + Pro)
//   • statement  — print-ready full-page certificate (Pro only)
//
// We don't generate a server-side PDF: the print view uses @media print
// CSS so the user's browser saves it as a PDF via the system print
// dialog. Zero new dependencies, works on every device, and the user's
// name (from auth.user.email or display_name) is rendered into the
// document client-side.

import * as React from "react";
import { useMemo, useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  overviewFromSrs,
  TIER_META,
  TIER_ORDER,
  type Tier,
} from "../lib/competency";
import { effectivelyPro } from "../lib/launchFlags";

// Best-effort access-token reader — same pattern as CasePlay's helper.
// Returns null if the user isn't signed in or the env isn't configured.
async function getAccessToken(): Promise<string | null> {
  try {
    const w = window as any;
    const url = (import.meta as any).env?.VITE_SUPABASE_URL || w.__SUPABASE_URL || "";
    const key = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || w.__SUPABASE_ANON_KEY || "";
    if (!url || !key) return null;
    const c = createClient(url, key);
    const { data } = await c.auth.getSession();
    return data.session?.access_token ?? null;
  } catch { return null; }
}

function tierBadge(tier: Tier) {
  const meta = TIER_META[tier];
  return (
    <span className="chip text-[10px] inline-flex items-center gap-1" style={{ background: meta.color + "25", color: meta.color }}>
      {meta.label}
    </span>
  );
}

export function Competency({ state, onExit }) {
  const overview = useMemo(() => overviewFromSrs(state?.srs || {}), [state?.srs]);
  const [mode, setMode] = useState<"screen" | "statement">("screen");
  const [user, setUser] = useState(() => (typeof window !== "undefined" ? window.BQAuth?.getUser?.() ?? null : null));
  const [isPro, setIsPro] = useState(() => effectivelyPro(undefined));

  useEffect(() => {
    let alive = true;
    const auth = (window as any).BQAuth;
    setUser(auth?.getUser?.() ?? null);
    if (auth?.fetchSubscription) {
      auth.fetchSubscription().then((s) => {
        if (alive) setIsPro(effectivelyPro(s?.user_type));
      }).catch(() => {});
    }
    const off = auth?.onAuthChange?.(() => setUser(auth.getUser?.() ?? null));
    return () => { alive = false; if (typeof off === "function") off(); };
  }, []);

  function generateStatement() {
    if (!isPro) return;
    setMode("statement");
    // Defer print() so the layout has a tick to apply.
    setTimeout(() => { try { window.print(); } catch {} }, 200);
  }

  if (mode === "statement") {
    return <StatementPage overview={overview} user={user} onBack={() => setMode("screen")}/>;
  }

  const total = overview.total;
  const cleared = overview.byTier.familiar + overview.byTier.practiced + overview.byTier.proficient + overview.byTier.mastered;
  const pctCleared = total > 0 ? Math.round((cleared / total) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 fade-in">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="t-title mb-1">Competency map</h2>
          <p className="t-body text-slate-400 text-sm">
            Method-by-method tier ladder, derived from your spaced-repetition history.
          </p>
        </div>
        <button onClick={onExit} className="btn btn-ghost px-3 py-2 rounded-lg text-sm">← Back</button>
      </div>

      {/* Top summary */}
      <div className="card rounded-2xl p-5 mb-4">
        <div className="flex items-baseline gap-3 flex-wrap mb-3">
          <div className="text-3xl font-extrabold text-white">{cleared}/{total}</div>
          <div className="text-sm text-slate-400">methods touched · {pctCleared}%</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {TIER_ORDER.map((t) => (
            <div key={t} className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs flex items-center gap-2" style={{ background: TIER_META[t].color + "15" }}>
              <span className="w-2 h-2 rounded-full" style={{ background: TIER_META[t].color }}/>
              <span className="text-slate-300">{TIER_META[t].label}</span>
              <span className="mono text-slate-100 font-semibold">{overview.byTier[t]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Per-branch ladders */}
      <div className="space-y-3">
        {overview.branches.map((b) => (
          <section key={b.branch} className="card rounded-xl p-4">
            <header className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
              <h3 className="text-base font-semibold text-white inline-flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: b.branchColor }}/>
                {b.branchName}
              </h3>
              <div className="flex gap-1.5 text-[10px] text-slate-500">
                {TIER_ORDER.filter((t) => b.tierCounts[t] > 0).reverse().map((t) => (
                  <span key={t} className="mono">{TIER_META[t].label.charAt(0)}{b.tierCounts[t]}</span>
                ))}
              </div>
            </header>
            <ul className="grid sm:grid-cols-2 gap-1.5 text-sm">
              {b.methods.map((m) => (
                <li key={m.methodId} className="flex items-center justify-between gap-2 py-1 border-b border-slate-800/50 last:border-0">
                  <span className="text-slate-200 truncate">{m.title}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-slate-500 mono">{m.stats.attempted}/{m.stats.total}</span>
                    {tierBadge(m.tier)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* CTA */}
      <div className="card rounded-2xl p-5 mt-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-base font-semibold text-white mb-1">Statement of Competency (PDF)</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              {isPro
                ? "Pro: generate a print-ready statement listing your tier per method. Save as PDF from your browser's print dialog."
                : "Pro feature. Unlocks a printable, dated statement listing your tier per method — useful as supplementary CV evidence."}
            </p>
          </div>
          <button
            onClick={generateStatement}
            disabled={!isPro || !user}
            className="btn btn-primary px-5 py-2.5 rounded-lg text-sm disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
            Generate statement
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Print-ready Statement page ------------------------------------------
// Inline @media print rules hide the rest of the app chrome and tighten
// the layout to a single page. We don't sign with a server-side seal in
// v0; the document carries a date + URL and the data is verifiable from
// the same competency map any visitor can reproduce. v0.1: optional
// signed verification URL embedded as a QR code.
function StatementPage({ overview, user, onBack }) {
  const today = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  const learner = user?.email || "Anonymous learner";

  // Filter to methods the learner has actually engaged with — listing
  // every untouched method on the certificate would dilute the signal.
  const branchesWithProgress = overview.branches
    .map((b) => ({ ...b, methods: b.methods.filter((m) => m.tier !== "untouched") }))
    .filter((b) => b.methods.length > 0);

  // Summary tiers exclude "untouched" — a competency document shouldn't
  // visually emphasize what the learner hasn't done.
  const summaryTiers = TIER_ORDER.filter((t) => t !== "untouched");

  // Document ID — deterministic hash of (email + ISO date + per-tier counts).
  // Stable: re-running the math on the same inputs reproduces the same ID.
  // The /api/verify endpoint looks it up against records written below.
  const isoDate = new Date().toISOString().slice(0, 10);
  const docPayload = `${learner}|${isoDate}|${summaryTiers.map((t) => `${t}:${overview.byTier[t]}`).join(",")}`;
  const docId = (() => {
    // FNV-1a 32-bit → base36, padded. Cheap, dependency-free, stable across runs.
    let h = 0x811c9dc5;
    for (let i = 0; i < docPayload.length; i++) {
      h ^= docPayload.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(36).toUpperCase().padStart(7, "0");
  })();

  // Record the issued statement server-side so /api/verify can confirm it
  // later. Idempotent (same docId → upsert), fire-and-forget — print
  // succeeds even if the network call fails. Skipped for guest sessions
  // (the empty-state guard below catches those anyway).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getAccessToken();
      if (cancelled || !token) return;
      try {
        await fetch("/api/statements/issue", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            docId,
            payload: {
              issuedAt: isoDate,
              tierCounts: Object.fromEntries(summaryTiers.map((t) => [t, overview.byTier[t]])),
              branches: branchesWithProgress.map((b) => ({
                id: b.branch,
                name: b.branchName,
                methodCount: b.methods.length,
              })),
            },
          }),
        });
      } catch {/* swallow — print still works without verification */}
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  // Empty-state guard — a Statement listing nothing is worse than no
  // Statement. Send the user back with a clear "do this first" message
  // before they print a blank page.
  const totalEngaged = branchesWithProgress.reduce((s, b) => s + b.methods.length, 0);
  if (totalEngaged === 0) {
    return (
      <div className="max-w-2xl mx-auto p-6 sm:p-10 fade-in">
        <div className="card rounded-2xl p-8 text-center">
          <h2 className="t-title mb-3">Not enough activity yet</h2>
          <p className="t-body text-slate-400 mb-4 leading-relaxed">
            A Statement of Competency only lists methods you've actually engaged with — no
            "Untouched" entries on a public-facing document. To populate it:
          </p>
          <ul className="text-sm text-slate-300 text-left max-w-md mx-auto mb-6 space-y-1.5">
            <li>• Work through a few cases (any branch).</li>
            <li>• On each reveal, use the <span className="mono text-slate-200">Good</span> / <span className="mono text-slate-200">Easy</span> grade buttons — that's what populates spaced-repetition data.</li>
            <li>• Come back here once you've graded ≥2 questions across the methods you'd like the Statement to mention.</li>
          </ul>
          <button onClick={onBack} className="btn btn-primary px-5 py-2 rounded-lg">← Back to competency map</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <style>{`
        /* Screen-only sheet presentation. Lives here rather than in a style
           prop so the no-inline-rgba guard stays green, and so it sits next
           to the @media print block that resets both of these. */
        .print-page {
          min-height: 10.5in;
          box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.4);
        }
        @media print {
          @page { margin: 0.5in; }
          .no-print { display: none !important; }
          html, body { background: white !important; }
          .print-page { background: white !important; color: #111 !important; padding: 0 !important; max-width: none !important; min-height: 0 !important; box-shadow: none !important; }
          .print-page .print-muted { color: #4b5563 !important; }
          .print-page .print-rule { border-color: #cbd5e1 !important; }
          .print-page .print-soft-rule { border-color: #e5e7eb !important; }
          .print-page table { page-break-inside: avoid; }
          .print-page section { page-break-inside: avoid; }
          /* Force colored tier labels and branch dots to render at print time
             (Chromium honors print-color-adjust). */
          .print-page * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>
      <div className="no-print max-w-4xl mx-auto p-4 sm:p-6 flex items-center justify-between gap-3 flex-wrap">
        <button onClick={onBack} className="btn btn-ghost px-3 py-2 rounded-lg text-sm">← Back</button>
        <button onClick={() => { try { window.print(); } catch {} }} className="btn btn-primary px-4 py-2 rounded-lg text-sm">Print / Save as PDF</button>
      </div>

      <div className="print-page max-w-4xl mx-auto p-8 sm:p-10 bg-white text-slate-900">
        {/* Header — name + monogram, with issue date and document ID */}
        <header className="flex items-start justify-between gap-6 pb-5 mb-7 border-b print-rule" style={{ borderColor: "#cbd5e1" }}>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center font-extrabold text-white text-lg" style={{ background: "linear-gradient(135deg, #0891b2, #6366f1)" }}>BQ</div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] print-muted text-slate-500 mb-0.5">BioStat Quest</div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Statement of Competency</h1>
            </div>
          </div>
          <div className="text-right text-[11px] print-muted text-slate-500 leading-tight">
            <div className="font-semibold text-slate-700">Issued {today}</div>
            <div className="mono mt-0.5">Doc ID · {docId}</div>
          </div>
        </header>

        {/* Issued-to + Summary side-by-side */}
        <section className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr] gap-8 mb-8">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] print-muted text-slate-500 mb-1.5">Issued to</div>
            <div className="text-lg font-semibold text-slate-900 break-words">{learner}</div>
            <p className="text-[11px] print-muted text-slate-500 leading-relaxed mt-2">
              Spaced-repetition–verified competency across {branchesWithProgress.length} {branchesWithProgress.length === 1 ? "branch" : "branches"} of biostatistics.
            </p>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] print-muted text-slate-500 mb-2">Summary</div>
            <div className="grid grid-cols-4 gap-2 text-center">
              {summaryTiers.map((t) => (
                <div key={t} className="rounded border print-soft-rule px-2 py-2.5" style={{ borderColor: "#e5e7eb" }}>
                  <div className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: TIER_META[t].color }}>{TIER_META[t].label}</div>
                  <div className="text-xl font-bold mt-1 text-slate-900">{overview.byTier[t]}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Per-branch method list */}
        <section className="mb-8">
          <div className="text-[10px] uppercase tracking-[0.2em] print-muted text-slate-500 mb-3">Method-by-method tier</div>
          {branchesWithProgress.map((b) => (
            <div key={b.branch} className="mb-5 last:mb-0">
              <h3 className="text-sm font-bold mb-1.5 inline-flex items-center gap-2 text-slate-900">
                <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: b.branchColor }}/>
                {b.branchName}
              </h3>
              <table className="w-full text-sm">
                <tbody>
                  {b.methods.map((m) => (
                    <tr key={m.methodId} className="border-b print-soft-rule" style={{ borderColor: "#f1f5f9" }}>
                      <td className="py-1.5 pr-3 text-slate-800">{m.title}</td>
                      <td className="py-1.5 pr-3 mono text-[11px] print-muted text-slate-500 text-right whitespace-nowrap">{m.stats.attempted}/{m.stats.total}</td>
                      <td className="py-1.5 text-right text-[11px] font-semibold whitespace-nowrap" style={{ color: TIER_META[m.tier].color }}>{TIER_META[m.tier].label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>

        {/* Issuer signature block */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-5 border-t print-rule mb-5" style={{ borderColor: "#cbd5e1" }}>
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] print-muted text-slate-500 mb-1.5">Issued by</div>
            <div className="text-sm font-semibold text-slate-900">Selçuk Korkmaz, PhD</div>
            <div className="text-[11px] print-muted text-slate-500">Author &amp; maintainer · BioStat Quest</div>
          </div>
          <div className="sm:text-right">
            <div className="text-[10px] uppercase tracking-[0.2em] print-muted text-slate-500 mb-1.5">Verify</div>
            <div className="text-[11px] text-slate-700 leading-relaxed">
              biostatquest.com/verify
              <div className="mono text-slate-500 mt-0.5">{docId} · {isoDate}</div>
            </div>
          </div>
        </section>

        {/* Methodology + disclaimer footer */}
        <footer className="text-[10px] print-muted text-slate-500 leading-relaxed">
          <p className="mb-1">
            <span className="font-semibold text-slate-700">Methodology.</span> Tiers are derived from FSRS-6 spaced-repetition data.
            <span className="mx-1">·</span>
            <span className="text-slate-700">Familiar</span> ≥1 graded review.
            <span className="text-slate-700"> Practiced</span> ≥3 reviews and ≥7-day interval on ≥30% of items.
            <span className="text-slate-700"> Proficient</span> ≥4 reviews, ≥14-day interval on ≥50%.
            <span className="text-slate-700"> Mastered</span> ≥4 reviews, ≥21-day interval on ≥60%.
          </p>
          <p>
            <span className="font-semibold text-slate-700">Disclaimer.</span> This statement reflects platform activity through {today}.
            It is supplementary CV evidence, not a clinical credential, and does not substitute for accredited training or board certification.
          </p>
        </footer>
      </div>
    </>
  );
}

export default Competency;
