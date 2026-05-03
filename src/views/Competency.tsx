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
import {
  overviewFromSrs,
  TIER_META,
  TIER_ORDER,
  type Tier,
} from "../lib/competency";
import { effectivelyPro } from "../lib/launchFlags";

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
  const [isPro, setIsPro] = useState(false);

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
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
          .print-page { background: white !important; color: black !important; padding: 24px !important; }
          .print-page * { color: black !important; }
          .print-tier-bar { border-color: #888 !important; }
        }
      `}</style>
      <div className="no-print max-w-4xl mx-auto p-4 sm:p-6 flex items-center justify-between gap-3 flex-wrap">
        <button onClick={onBack} className="btn btn-ghost px-3 py-2 rounded-lg text-sm">← Back</button>
        <button onClick={() => { try { window.print(); } catch {} }} className="btn btn-primary px-4 py-2 rounded-lg text-sm">Print / Save as PDF</button>
      </div>

      <div className="print-page max-w-4xl mx-auto p-8 bg-slate-950 text-slate-100" style={{ minHeight: "11in" }}>
        <header className="border-b border-slate-700 pb-4 mb-6 flex items-end justify-between">
          <div>
            <div className="text-xs uppercase tracking-widest text-slate-400 mb-1">BioStat Quest</div>
            <h1 className="text-2xl font-bold">Statement of Competency</h1>
          </div>
          <div className="text-right text-xs text-slate-400">
            <div>Issued {today}</div>
            <div className="mono">biostatquest.com</div>
          </div>
        </header>

        <section className="mb-6">
          <div className="text-xs uppercase tracking-widest text-slate-400 mb-1">Issued to</div>
          <div className="text-lg font-semibold">{learner}</div>
        </section>

        <section className="mb-6">
          <div className="text-xs uppercase tracking-widest text-slate-400 mb-2">Summary</div>
          <div className="grid grid-cols-5 gap-2 text-center">
            {TIER_ORDER.map((t) => (
              <div key={t} className="rounded border border-slate-700 print-tier-bar p-2">
                <div className="text-[10px] uppercase tracking-widest" style={{ color: TIER_META[t].color }}>{TIER_META[t].label}</div>
                <div className="text-2xl font-bold mt-1">{overview.byTier[t]}</div>
              </div>
            ))}
          </div>
        </section>

        {branchesWithProgress.map((b) => (
          <section key={b.branch} className="mb-5">
            <h3 className="text-base font-semibold mb-2 inline-flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: b.branchColor }}/>
              {b.branchName}
            </h3>
            <table className="w-full text-sm">
              <tbody>
                {b.methods.map((m) => (
                  <tr key={m.methodId} className="border-b border-slate-800/50">
                    <td className="py-1 pr-3">{m.title}</td>
                    <td className="py-1 pr-3 mono text-xs text-slate-400 text-right">{m.stats.attempted}/{m.stats.total}</td>
                    <td className="py-1 text-right text-xs font-semibold" style={{ color: TIER_META[m.tier].color }}>{TIER_META[m.tier].label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

        <footer className="border-t border-slate-700 pt-4 mt-6 text-xs text-slate-400 leading-relaxed">
          Tiers are derived from spaced-repetition data on the BioStat Quest platform.
          "Mastered" requires ≥60% of a method's question bank to be held at long-interval recall (≥4 reviews, ≥21-day interval).
          This statement reflects platform activity through {today}; it is not a clinical credential and does not substitute for accredited training or board certification.
        </footer>
      </div>
    </>
  );
}

export default Competency;
