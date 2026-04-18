// Subscription block inside the account card. Shows current plan, next
// billing date (if Pro), and the right affordance (Upgrade / Manage billing).
// Deliberately separate from the auth UI — keeps the panel single-purpose.

import * as React from "react";
import { billing } from "../lib/billing";

type Sub = {
  user_type?: "free" | "pro" | "institutional";
  status?: string;
  currentPeriodEnd?: string | number | Date | null;
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
    try { await billing.openPortal(); }
    catch (e: any) { setErr(e?.message || "Could not open billing portal."); setBusy(false); }
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
            <span className="text-slate-200">{periodEnd.toLocaleDateString()}</span>
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
