// Client-side Stripe helpers. All network calls hit /api/stripe/* routes
// which are Vercel serverless functions — keys live there, not here.
//
// Usage:
//   await billing.startCheckout("monthly");   // redirects to Stripe Checkout
//   await billing.openPortal();               // redirects to Stripe Billing Portal

async function getAccessToken(): Promise<string | null> {
  const anyWin = window as any;
  const BQ = anyWin?.BQAuth;
  if (!BQ || !BQ.enabled) return null;
  // There's no public API for the session token, so pull it from the Supabase
  // client cache. We keep BQAuth small; here we dig into its internals safely.
  try {
    // Use the global supabase client by reaching through BQAuth.
    // BQAuth exposes .getUser() but we need the session; call the underlying
    // createClient again (it will read the existing localStorage session).
    const { createClient } = await import("@supabase/supabase-js");
    const url = (import.meta as any).env.VITE_SUPABASE_URL || anyWin.__SUPABASE_URL || "";
    const anonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY || anyWin.__SUPABASE_ANON_KEY || "";
    if (!url || !anonKey) return null;
    const c = createClient(url, anonKey);
    const { data } = await c.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

async function post(path: string, body?: Record<string, unknown>) {
  const token = await getAccessToken();
  if (!token) throw new Error("Please sign in first.");
  const resp = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body || {}),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.error || `Request failed (${resp.status})`);
  return json;
}

async function startCheckout(plan: "monthly" | "yearly"): Promise<void> {
  const { url } = await post("/api/stripe/checkout", { plan });
  if (!url) throw new Error("No checkout URL returned");
  window.location.href = url;
}

async function openPortal(): Promise<void> {
  const { url } = await post("/api/stripe/portal", {});
  if (!url) throw new Error("No portal URL returned");
  window.location.href = url;
}

export const billing = { startCheckout, openPortal };
