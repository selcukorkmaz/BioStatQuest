// @ts-nocheck
// In-app Pro upsell. Lists the pillars actually shipped (so the page
// reflects reality, not a wishlist) and routes to Lemon Squeezy via
// billing.startCheckout. Hidden from Pro/institutional users because
// they're already in.
//
// Free users land here either via the nav button or the
// quota/upgrade hooks scattered through the app (AskTutor 429,
// Exam quota cap, Statement gating, etc.).

import * as React from "react";
import { useEffect, useState } from "react";
import { billing } from "../lib/billing";
import { effectivelyPro, OPEN_BETA_PRO } from "../lib/launchFlags";
import { CASES } from "../data/cases";
import { freeCaseCount, FREE_CASES_PER_BRANCH } from "../lib/access";

const TOTAL_CASES = CASES.length;
const FREE_CATALOG_LABEL = `First ${freeCaseCount()} cases (${FREE_CASES_PER_BRANCH} per branch)`;
const PRO_CATALOG_LABEL = `All ${TOTAL_CASES}+ cases + day-one access`;

const PILLARS = [
  {
    title: "AI tutor",
    free: "5 questions / week",
    pro:  "Unlimited",
    body: "Scoped to one question at a time, refuses off-topic. Free quota lets you try; Pro removes it.",
  },
  {
    title: "Practice exam",
    free: "2 exams / 30 days",
    pro:  "Unlimited + branch picker",
    body: "Timed, no-reveal sit closer to a board exam than the case loop. Branch breakdown report at the end.",
  },
  {
    title: "Layered hints",
    free: "Layer 1 (orienting)",
    pro:  "Layers 1–3 (full ladder)",
    body: "Layer 2 names the structural component; Layer 3 walks you partway through. Pro unlocks the deeper layers.",
  },
  {
    title: "Statement of Competency (PDF)",
    free: "Tier ladder visible",
    pro:  "Print-ready signed statement",
    body: "A dated, single-page record of your tier per method — supplementary CV evidence. Browser-print to PDF.",
  },
  {
    title: "Misconception ledger",
    free: "Top 3 visible + repeat-chip",
    pro:  "Full history + per-tag drill-down",
    body: "Patterns the system catches in your wrong answers. Pro view exposes the long tail and trends.",
  },
  {
    title: "Catalog",
    free: FREE_CATALOG_LABEL,
    pro:  PRO_CATALOG_LABEL,
    body: "Free tier covers the foundational arc of every branch. Pro unlocks the deeper / more advanced cases plus day-one access to new content.",
  },
];

export function Upgrade({ onExit }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [signedIn, setSignedIn] = useState(
    () => !!(typeof window !== "undefined" && window.BQAuth?.getUser?.()),
  );
  const [isPro, setIsPro] = useState(() => effectivelyPro(undefined));

  useEffect(() => {
    let alive = true;
    const auth = (window as any).BQAuth;
    setSignedIn(!!auth?.getUser?.());
    if (auth?.fetchSubscription) {
      auth.fetchSubscription().then((s) => {
        if (alive) setIsPro(effectivelyPro(s?.user_type));
      }).catch(() => {});
    }
    const off = auth?.onAuthChange?.(() => setSignedIn(!!auth.getUser?.()));
    return () => { alive = false; if (typeof off === "function") off(); };
  }, []);

  async function checkout(plan) {
    if (!signedIn) {
      setErr("Sign in first to subscribe.");
      return;
    }
    setBusy(true); setErr("");
    try { await billing.startCheckout(plan); }
    catch (e) { setErr((e && e.message) || "Could not start checkout."); setBusy(false); }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 fade-in">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div>
          <h2 className="t-title mb-1">BioStat Quest Pro</h2>
          <p className="t-body text-slate-400 text-sm">
            Free teaches the fundamentals. Pro is the professional learning studio.
          </p>
        </div>
        <button onClick={onExit} className="btn btn-ghost px-3 py-2 rounded-lg text-sm">← Back</button>
      </div>

      {OPEN_BETA_PRO && !isPro && (
        <div className="card rounded-2xl p-5 mb-5 border border-emerald-700/40 bg-emerald-950/20">
          <h3 className="text-base font-semibold text-emerald-200 mb-1">🎉 Open beta — all Pro features are free for signed-in users</h3>
          <p className="t-body text-slate-300 text-sm leading-relaxed">
            Paid plans are launching shortly while our payment processor finishes activation review.
            During this window every Pro pillar (AI tutor, exam, hints, statement, full ledger, full catalog) is open to you at no cost.
            We'll email you when paid plans go live — early-beta users get a launch discount.
          </p>
        </div>
      )}

      {isPro && !OPEN_BETA_PRO && (
        <div className="card rounded-2xl p-6 mb-5 border border-amber-700/40 bg-amber-950/20">
          <h3 className="text-base font-semibold text-amber-200 mb-1">You're already on Pro.</h3>
          <p className="t-body text-slate-300 text-sm">
            All pillars are unlocked. Manage billing from your account panel.
          </p>
        </div>
      )}

      {isPro && OPEN_BETA_PRO && (
        <div className="card rounded-2xl p-6 mb-5 border border-amber-700/40 bg-amber-950/20">
          <h3 className="text-base font-semibold text-amber-200 mb-1">Pro active — open-beta window</h3>
          <p className="t-body text-slate-300 text-sm">
            All pillars unlocked. Paid plans launching shortly; we'll email when they go live.
          </p>
        </div>
      )}

      {/* Pillar comparison */}
      <div className="space-y-3 mb-6">
        {PILLARS.map((p) => (
          <article key={p.title} className="card rounded-xl p-4">
            <header className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
              <h3 className="text-base font-semibold text-white">{p.title}</h3>
              <div className="flex items-center gap-2 text-[11px] mono">
                <span className="chip bg-slate-800 text-slate-300">Free · {p.free}</span>
                <span className="chip bg-amber-900/40 text-amber-200">Pro · {p.pro}</span>
              </div>
            </header>
            <p className="text-sm text-slate-400 leading-relaxed">{p.body}</p>
          </article>
        ))}
      </div>

      {/* CTAs */}
      {!isPro && (
        <div className="card rounded-2xl p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <h3 className="text-base font-semibold text-white">Subscribe</h3>
            <span className="text-[11px] text-slate-500 mono">Billed via Lemon Squeezy · cancel anytime</span>
          </div>
          {!signedIn && (
            <p className="text-sm text-amber-300 mb-3">Sign in first, then come back to subscribe.</p>
          )}
          {err && <p className="text-sm text-red-400 mb-3">{err}</p>}
          <div className="grid sm:grid-cols-2 gap-3">
            <button
              onClick={() => checkout("monthly")}
              disabled={busy || !signedIn}
              className="btn btn-ghost px-4 py-3 rounded-xl text-sm disabled:opacity-40">
              <div className="font-semibold text-white">Monthly</div>
              <div className="text-[11px] text-slate-500 mono">cancel anytime</div>
            </button>
            <button
              onClick={() => checkout("yearly")}
              disabled={busy || !signedIn}
              className="btn btn-primary px-4 py-3 rounded-xl text-sm disabled:opacity-40">
              <div className="font-semibold">Yearly</div>
              <div className="text-[11px] opacity-80">save $48 · 44% off</div>
            </button>
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-600 text-center mt-6 leading-relaxed">
        Built and maintained by Selçuk Korkmaz, PhD. Statement-of-competency tiers are conservative by design and are not a clinical credential.
      </p>
    </div>
  );
}

export default Upgrade;
