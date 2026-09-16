// Plan block inside the account card.
//
// This used to show the current plan, the next billing date, and the
// Upgrade / Manage billing / Cancel affordances. Paid plans were withdrawn
// on 2026-09-17 (PAYMENTS_ENABLED=false in ../lib/launchFlags.ts), so there
// is no plan to display and nothing to bill: the panel is now a one-line
// reassurance that everything is unlocked, with no money-moving controls.
//
// `useSubscription` below is unchanged and still used elsewhere
// (SkillTree) — the user_progress row carries more than plan.

import * as React from "react";
import { type BillingProvider } from "../lib/billing";
import { PAYMENTS_ENABLED } from "../lib/launchFlags";

type Sub = {
  user_type?: "free" | "pro" | "institutional";
  status?: string;
  currentPeriodEnd?: string | number | Date | null;
  provider?: BillingProvider | null;
} | null;

export function useSubscription() {
  const [sub, setSub] = React.useState<Sub>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    const BQ = (window as any).BQAuth;
    if (!BQ?.getUser?.()) {
      setSub(null); setLoading(false);
      return;
    }
    try {
      const s = await BQ.fetchSubscription();
      setSub(s);
    } catch {
      setSub(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    const BQ = (window as any).BQAuth;
    const unsub = BQ?.onAuthChange?.(() => load());
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      if (typeof unsub === "function") unsub();
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  return { sub, loading, reload: load };
}

export function SubscriptionPanel() {
  const { loading } = useSubscription();

  if (loading) {
    return (
      <div className="rounded-xl bg-slate-800/40 border border-slate-700 p-4 mb-4 text-sm text-slate-500">
        Loading plan…
      </div>
    );
  }

  // Defensive: if payments are ever switched back on, this panel is one of
  // the surfaces that must be rebuilt first. Fail loud in dev rather than
  // silently telling a paying customer their subscription doesn't exist.
  if (PAYMENTS_ENABLED) {
    return (
      <div className="rounded-xl bg-slate-800/40 border border-slate-700 p-4 mb-4 text-sm text-slate-400">
        Billing is enabled but this panel has not been restored — see
        git history for the paid version of SubscriptionPanel.
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-emerald-950/30 border border-emerald-700/40 p-4 mb-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="font-semibold text-white text-sm">Plan</div>
        <span className="chip text-[10px] bg-emerald-900/40 text-emerald-200">Free · everything unlocked</span>
      </div>
      <p className="text-xs text-slate-400 leading-relaxed">
        BioStat Quest is free. Every case, the full hint ladder, unlimited
        exams, the AI tutor and the Statement of Competency are open to all
        accounts — there's nothing to buy and no card on file.
      </p>
    </div>
  );
}
