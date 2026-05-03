// Subscription block inside the account card. Shows current plan, next
// billing date (if Pro), and the right affordance (Upgrade / Manage billing).
// Deliberately separate from the auth UI — keeps the panel single-purpose.

import * as React from "react";
import { billing, type BillingProvider } from "../lib/billing";
import { fmtDate } from "../lib/format";
import { OPEN_BETA_PRO } from "../lib/launchFlags";

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
  const { sub, loading } = useSubscription();
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");

  async function openPortal() {
    setBusy(true); setErr("");
    try {
      // Route to the same provider that issued this subscription so legacy
      // Stripe customers don't get sent to the Lemon Squeezy portal.
      const provider = (sub?.provider ?? billing.DEFAULT_PROVIDER) as BillingProvider;
      await billing.openPortal(provider);
    } catch (e: any) {
      setErr(e?.message || "Could not open billing portal."); setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl bg-slate-800/40 border border-slate-700 p-4 mb-4 text-sm text-slate-500">
        Loading subscription…
      </div>
    );
  }

  const userType = sub?.user_type || "free";
  const status = sub?.status;
  const periodEnd = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;

  // During open beta, free users have temporary Pro access. Surface this
  // explicitly so the account panel doesn't look empty / paid-tier
  // doesn't look hidden — both would suggest "you have nothing" when
  // they actually have everything.
  if (OPEN_BETA_PRO && userType === "free") {
    return (
      <div className="rounded-xl bg-emerald-950/30 border border-emerald-700/40 p-4 mb-4">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="font-semibold text-white text-sm">Plan</div>
          <span className="chip text-[10px] bg-emerald-900/40 text-emerald-200">Open beta · Pro</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          All Pro features are unlocked while we finish payment-processor activation.
          Paid plans launching shortly — early-beta users get a launch discount.
        </p>
      </div>
    );
  }

  if (userType === "institutional") {
    return (
      <div className="rounded-xl bg-cyan-950/30 border border-cyan-700/40 p-4 mb-4">
        <div className="flex items-center justify-between gap-3 mb-1">
          <div className="font-semibold text-white text-sm">Plan</div>
          <span className="chip text-[10px] bg-cyan-900/40 text-cyan-200">Institutional</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">All content unlocked. Managed by your institution — contact your admin for billing.</p>
      </div>
    );
  }

  if (userType === "pro") {
    return (
      <div className="rounded-xl bg-amber-950/20 border border-amber-700/30 p-4 mb-4">
        <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
          <div className="font-semibold text-white text-sm flex items-center gap-2">Plan <span className="chip text-[10px] bg-amber-900/40 text-amber-300">Pro</span></div>
          {status && <span className="text-[11px] text-slate-400 mono">status: {status}</span>}
        </div>
        {periodEnd && (
          <div className="text-xs text-slate-400 mb-3">
            {status === "canceled" ? "Access until" : "Renews on"}{" "}
            <span className="text-slate-200">{fmtDate(periodEnd)}</span>
          </div>
        )}
        {err && <div className="text-xs text-red-400 mb-2">{err}</div>}
        <button onClick={openPortal} disabled={busy} className="btn btn-ghost px-3 py-2 rounded-lg text-xs disabled:opacity-40">
          {busy ? "Opening…" : "Manage billing →"}
        </button>
      </div>
    );
  }

  return null;
}
