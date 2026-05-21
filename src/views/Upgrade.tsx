// @ts-nocheck
// In-app Pro upsell. Premium-feel rewrite: hero with gradient backdrop +
// star-medallion mark, pricing cards above the fold with the annual plan
// emphasised via the gradient premium-border, pillars in a two-column
// grid below for buyers who scroll. Lists the pillars actually shipped
// (so the page reflects reality, not a wishlist) and routes to Lemon
// Squeezy via billing.startCheckout. Hidden from Pro/institutional
// users — they get a "you're already in" treatment instead.

import * as React from "react";
import { useEffect, useState } from "react";
import { billing } from "../lib/billing";
import { effectivelyPro, OPEN_BETA_PRO } from "../lib/launchFlags";
import { CASES } from "../data/cases";
import { freeCaseCount, FREE_CASES_PER_BRANCH } from "../lib/access";

const TOTAL_CASES = CASES.length;
const FREE_CATALOG_LABEL = `First ${freeCaseCount()} cases (${FREE_CASES_PER_BRANCH} per branch)`;
const PRO_CATALOG_LABEL = `All ${TOTAL_CASES}+ cases + day-one access`;

const PRICE_MONTHLY = 9;
const PRICE_YEARLY = 60;
const YEARLY_MONTHLY_EQUIVALENT = (PRICE_YEARLY / 12).toFixed(2); // "5.00"
const YEARLY_SAVINGS = (PRICE_MONTHLY * 12) - PRICE_YEARLY;       // 48

const PILLARS = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 11a3 3 0 1 1 6 0c0 2-3 3-3 5"/>
        <circle cx="12" cy="19" r=".8" fill="currentColor"/>
      </svg>
    ),
    title: "AI tutor",
    free: "5 questions / week",
    pro:  "Unlimited",
    body: "Scoped to one question at a time, refuses off-topic. Free quota lets you try; Pro removes it.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="4" y="3" width="16" height="18" rx="2"/>
        <path d="M9 8h6M9 12h6M9 16h4"/>
      </svg>
    ),
    title: "Practice exam",
    free: "2 exams / 30 days",
    pro:  "Unlimited + branch picker",
    body: "Timed, no-reveal sit closer to a board exam than the case loop. Branch breakdown report at the end.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    ),
    title: "Layered hints",
    free: "Layer 1 (orienting)",
    pro:  "Layers 1–3 (full ladder)",
    body: "Layer 2 names the structural component; Layer 3 walks you partway through. Pro unlocks the deeper layers.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="3" width="14" height="18" rx="1.5"/>
        <path d="M8 9h8M8 13h8M8 17h5"/>
        <circle cx="17" cy="17" r="2.2" fill="currentColor" stroke="none"/>
      </svg>
    ),
    title: "Statement of Competency (PDF)",
    free: "Tier ladder visible",
    pro:  "Print-ready signed statement",
    body: "A dated, single-page record of your tier per method — supplementary CV evidence. Browser-print to PDF.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 17l5-5 4 4 8-8"/>
        <path d="M14 8h6v6"/>
      </svg>
    ),
    title: "Misconception ledger",
    free: "Top 3 visible + repeat-chip",
    pro:  "Full history + per-tag drill-down",
    body: "Patterns the system catches in your wrong answers. Pro view exposes the long tail and trends.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2"/>
        <path d="M3 9h18M8 4v16"/>
      </svg>
    ),
    title: "Full catalog",
    free: FREE_CATALOG_LABEL,
    pro:  PRO_CATALOG_LABEL,
    body: "Free covers the foundational arc of every branch. Pro unlocks deeper / more advanced cases plus day-one access to new content.",
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
    <div className="max-w-5xl mx-auto p-4 sm:p-6 fade-in">
      {/* Back link in its own row so the hero gets the full canvas */}
      <div className="mb-6">
        <button onClick={onExit} className="text-sm text-slate-400 hover:text-white transition inline-flex items-center gap-1.5">
          <span aria-hidden="true">←</span> Back
        </button>
      </div>

      {/* HERO — gradient backdrop with a gold star medallion + headline.
          Renders for everyone (Pro users see it too — they get the
          "you're already in" panel beneath instead of pricing cards). */}
      <section className="relative overflow-hidden rounded-3xl mb-8 text-center px-6 py-10 sm:py-14"
               style={{
                 background: "radial-gradient(120% 80% at 50% 0%, rgba(251,191,36,0.18), rgba(139,92,246,0.10) 45%, rgba(12,16,36,0) 75%), linear-gradient(180deg, rgba(22,28,54,0.55), rgba(12,16,36,0.65))",
                 border: "1px solid rgba(251,191,36,0.18)",
                 boxShadow: "0 30px 80px -40px rgba(251,191,36,0.30), inset 0 1px 0 rgba(255,255,255,0.05)",
               }}>
        {/* Gold star medallion */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
             style={{
               background: "radial-gradient(60% 60% at 50% 35%, rgba(253,224,71,0.35), rgba(251,191,36,0.18) 60%, rgba(217,119,6,0.05))",
               border: "1px solid rgba(251,191,36,0.45)",
               boxShadow: "0 12px 36px -8px rgba(251,191,36,0.45), inset 0 1px 0 rgba(255,255,255,0.10)",
             }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="#fde68a" aria-hidden="true">
            <path d="M12 2 L 14.5 8.5 L 21.5 9.2 L 16.2 13.8 L 17.9 21 L 12 17.3 L 6.1 21 L 7.8 13.8 L 2.5 9.2 L 9.5 8.5 z"/>
          </svg>
        </div>
        <div className="t-eyebrow mb-3" style={{ color: "#fbbf24" }}>BioStat Quest Pro</div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white mb-3">
          Everything unlocked. <span className="gold-text">No friction.</span>
        </h1>
        <p className="text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
          Free teaches the fundamentals. Pro is the professional learning studio — every case, every hint layer, every method deep-dive, an unrestricted AI tutor, and a printable Statement of Competency.
        </p>
      </section>

      {/* Open-beta banner (dead branch post-cutover — guarded for safety). */}
      {OPEN_BETA_PRO && !isPro && (
        <div className="card rounded-2xl p-5 mb-6 border border-emerald-700/40 bg-emerald-950/20">
          <h3 className="text-base font-semibold text-emerald-200 mb-1">🎉 Open beta — all Pro features are free for signed-in users</h3>
          <p className="t-body text-slate-300 text-sm leading-relaxed">
            Paid plans are launching shortly while our payment processor finishes activation review.
            During this window every Pro pillar (AI tutor, exam, hints, statement, full ledger, full catalog) is open to you at no cost.
          </p>
        </div>
      )}

      {/* PRO-already states — replaces the pricing cards */}
      {isPro && (
        <div className="premium-border rounded-3xl mb-8">
          <div className="rounded-3xl p-6 sm:p-8 text-center"
               style={{ background: "linear-gradient(145deg, rgba(251,191,36,0.10), rgba(12,16,36,0.55))" }}>
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-3"
                 style={{ background: "rgba(251,191,36,0.18)", border: "1px solid rgba(251,191,36,0.45)" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#fde68a" aria-hidden="true">
                <path d="M5 12 L 10 17 L 19 7" stroke="#fde68a" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-white mb-1">You're on Pro.</h2>
            <p className="text-sm text-slate-300 mb-1">
              {OPEN_BETA_PRO
                ? "All pillars unlocked. Paid plans launch shortly; we'll email when they do."
                : "All pillars unlocked. Manage billing from your account panel."}
            </p>
          </div>
        </div>
      )}

      {/* PRICING CARDS — only for free / not-yet-Pro users */}
      {!isPro && (
        <section className="grid sm:grid-cols-2 gap-4 mb-8">
          {/* Monthly */}
          <article className="card rounded-2xl p-6 flex flex-col">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-base font-bold text-white">Monthly</h3>
              <div className="text-right">
                <span className="text-3xl font-extrabold text-slate-100">${PRICE_MONTHLY}</span>
                <span className="text-xs text-slate-500 mono ml-1">/ month</span>
              </div>
            </div>
            <p className="text-sm text-slate-400 mb-5">Try Pro for a month. Cancel anytime — your progress stays.</p>
            <ul className="space-y-1.5 text-sm text-slate-300 mb-6">
              <BulletRow>Every Pro pillar unlocked</BulletRow>
              <BulletRow>Cancel from your account · no phone tree</BulletRow>
              <BulletRow>Receipt + VAT-compliant invoice</BulletRow>
            </ul>
            <button
              onClick={() => checkout("monthly")}
              disabled={busy || !signedIn}
              className="btn btn-ghost w-full py-3 rounded-xl text-sm font-semibold mt-auto disabled:opacity-40">
              {busy ? "Opening…" : "Start monthly →"}
            </button>
          </article>

          {/* Annual — accented with the premium gradient border */}
          <article className="premium-border rounded-2xl">
            <div className="rounded-2xl p-6 flex flex-col h-full"
                 style={{ background: "linear-gradient(145deg, rgba(251,191,36,0.10), rgba(12,16,36,0.55))" }}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-bold text-white inline-flex items-center gap-2">
                  Annual
                  <span className="chip text-[10px] font-bold tracking-wider"
                        style={{ background: "rgba(251,191,36,0.25)", color: "#fde68a", border: "1px solid rgba(251,191,36,0.55)" }}>
                    BEST VALUE
                  </span>
                </h3>
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-extrabold gold-text">${PRICE_YEARLY}</span>
                <span className="text-xs text-slate-500 mono">/ year</span>
                <span className="text-xs text-slate-400 mono ml-auto">≈ ${YEARLY_MONTHLY_EQUIVALENT}/mo</span>
              </div>
              <p className="text-sm text-amber-300/90 mb-5">
                Save <span className="font-semibold">${YEARLY_SAVINGS}</span> vs. monthly · 44% off.
              </p>
              <ul className="space-y-1.5 text-sm text-slate-300 mb-6">
                <BulletRow gold>Everything in Monthly</BulletRow>
                <BulletRow gold>Priority support on questions / bugs</BulletRow>
                <BulletRow gold>Day-one access to every new case</BulletRow>
              </ul>
              <button
                onClick={() => checkout("yearly")}
                disabled={busy || !signedIn}
                className="w-full py-3 rounded-xl text-sm font-extrabold mt-auto disabled:opacity-40 transition"
                style={{
                  background: "linear-gradient(135deg, #fbbf24, #f59e0b)",
                  color: "#1a1206",
                  boxShadow: "0 10px 24px -10px rgba(251,191,36,0.55), inset 0 1px 0 rgba(255,255,255,0.25)",
                }}>
                {busy ? "Opening…" : "Get a year of Pro →"}
              </button>
            </div>
          </article>
        </section>
      )}

      {/* Sign-in nudge + error surface, shown only when relevant */}
      {!isPro && !signedIn && (
        <div className="rounded-xl bg-amber-950/30 border border-amber-700/40 p-4 mb-6 text-sm text-amber-200">
          Sign in first, then come back to subscribe. Your sign-in tab will return here automatically.
        </div>
      )}
      {!isPro && err && (
        <div className="rounded-xl bg-red-950/30 border border-red-800/40 p-4 mb-6 text-sm text-red-300">
          {err}
        </div>
      )}

      {/* TRUST STRIP — secure billing, cancel anytime, refund window */}
      {!isPro && (
        <div className="grid sm:grid-cols-3 gap-3 mb-10 text-center text-xs">
          <TrustCell icon={<LockIcon/>} title="Secured billing" body="Card data never touches our servers. Processed by Lemon Squeezy (PCI-DSS, merchant of record)." />
          <TrustCell icon={<CalendarIcon/>} title="Cancel any time" body="One-click cancel from your account. Progress, streak, and FSRS history are preserved." />
          <TrustCell icon={<RefundIcon/>} title="14-day refund" body="Refund within 14 days, no questions asked. Email selcukorkmaz@gmail.com and we'll process it." />
        </div>
      )}

      {/* PILLARS — premium two-column grid */}
      <section className="mb-10">
        <h2 className="text-2xl font-extrabold text-white mb-1">What Pro unlocks</h2>
        <p className="text-sm text-slate-400 mb-6">Six pillars, all shipped today. No "coming soon" lock screens.</p>
        <div className="grid md:grid-cols-2 gap-3">
          {PILLARS.map((p) => (
            <article key={p.title} className="card rounded-xl p-5">
              <div className="flex items-start gap-3 mb-3">
                <div className="shrink-0 w-9 h-9 rounded-lg inline-flex items-center justify-center"
                     style={{ background: "rgba(251,191,36,0.12)", color: "#fde68a", border: "1px solid rgba(251,191,36,0.30)" }}>
                  {p.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-white leading-tight">{p.title}</h3>
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10.5px] mono mb-2 flex-wrap">
                <span className="chip bg-slate-800 text-slate-400">Free · {p.free}</span>
                <span className="chip" style={{ background: "rgba(251,191,36,0.18)", color: "#fde68a", border: "1px solid rgba(251,191,36,0.30)" }}>Pro · {p.pro}</span>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">{p.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Footer attribution */}
      <p className="text-[11px] text-slate-600 text-center leading-relaxed pb-6">
        Built and maintained by Selçuk Korkmaz, PhD · Statement-of-competency tiers are conservative by design and are not a clinical credential · Billed via Lemon Squeezy (merchant of record)
      </p>
    </div>
  );
}

// ----- small leaves -----

function BulletRow({ children, gold }: { children: React.ReactNode; gold?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={gold ? "#fbbf24" : "#34d399"} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5" aria-hidden="true">
        <path d="M4 12.5l5 5 11-12"/>
      </svg>
      <span>{children}</span>
    </li>
  );
}

function TrustCell({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="card rounded-xl p-4">
      <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg mb-2"
           style={{ background: "rgba(34,211,238,0.10)", color: "#67e8f9", border: "1px solid rgba(34,211,238,0.30)" }}>
        {icon}
      </div>
      <div className="text-sm font-bold text-white mb-1">{title}</div>
      <p className="text-[11px] text-slate-400 leading-relaxed">{body}</p>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2"/>
      <path d="M8 11V7a4 4 0 0 1 8 0v4"/>
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2"/>
      <path d="M3 10h18M8 3v4M16 3v4"/>
    </svg>
  );
}
function RefundIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 3-6.7"/>
      <path d="M3 4v5h5"/>
    </svg>
  );
}

export default Upgrade;
