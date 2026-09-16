// Shared health probe for BioStat Quest's backend.
//
// Exists because of the September 2026 outage: the Supabase project was
// suspended by the provider and nobody noticed for ~15 days. The public
// pages are static and kept serving 200s the whole time, so any monitor
// that only pings "/" would have stayed green. These checks deliberately
// exercise the paths a real sign-in depends on:
//
//   auth_service   — GoTrue is reachable and answering (the outage's
//                    first casualty; DNS for the project ref vanished)
//   auth_providers — email + Google sign-in are still switched on, so an
//                    accidental dashboard toggle also trips the alarm
//   database_read  — a service-role read against user_progress, which
//                    covers Postgres, PostgREST and the schema cache
//
// Consumed by:
//   GET /api/health           (public, for an external uptime monitor)
//   GET /api/cron/healthcheck (Vercel Cron, emails on failure)

const CHECK_TIMEOUT_MS = 8_000;

export type Check = {
  name: string;
  ok: boolean;
  ms: number;
  detail?: string;
};

export type HealthReport = {
  ok: boolean;
  ts: string;
  checks: Check[];
};

/** fetch with a hard timeout — a hung socket must not stall the function. */
async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), CHECK_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Run one named check, timing it and converting any throw into ok:false. */
async function timed(name: string, fn: () => Promise<string | void>): Promise<Check> {
  const started = Date.now();
  try {
    const detail = await fn();
    return { name, ok: true, ms: Date.now() - started, detail: detail || undefined };
  } catch (e: any) {
    const msg = e?.name === "AbortError" ? `timed out after ${CHECK_TIMEOUT_MS}ms` : e?.message || String(e);
    return { name, ok: false, ms: Date.now() - started, detail: msg };
  }
}

export async function runHealthChecks(): Promise<HealthReport> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Missing config is itself an outage — report it as one rather than
  // throwing, so the monitor sees a 503 with a readable reason.
  if (!url || !anon || !service) {
    const missing = [
      !url && "SUPABASE_URL",
      !anon && "SUPABASE_ANON_KEY",
      !service && "SUPABASE_SERVICE_ROLE_KEY",
    ].filter(Boolean).join(", ");
    return {
      ok: false,
      ts: new Date().toISOString(),
      checks: [{ name: "config", ok: false, ms: 0, detail: `missing env: ${missing}` }],
    };
  }

  const checks = await Promise.all([
    timed("auth_service", async () => {
      const r = await fetchWithTimeout(`${url}/auth/v1/health`, { headers: { apikey: anon } });
      if (!r.ok) throw new Error(`GoTrue returned ${r.status}`);
      const body: any = await r.json();
      return `GoTrue ${body?.version || "?"}`;
    }),

    timed("auth_providers", async () => {
      const r = await fetchWithTimeout(`${url}/auth/v1/settings`, { headers: { apikey: anon } });
      if (!r.ok) throw new Error(`settings returned ${r.status}`);
      const body: any = await r.json();
      const email = Boolean(body?.external?.email);
      const google = Boolean(body?.external?.google);
      // Email OTP is the primary sign-in path; without it nobody gets in.
      if (!email) throw new Error("email sign-in is disabled in Supabase");
      if (!google) throw new Error("google sign-in is disabled in Supabase");
      return "email + google enabled";
    }),

    timed("database_read", async () => {
      // HEAD + exact count: cheapest query that still proves Postgres,
      // PostgREST and the schema cache are all answering. Service role,
      // so an RLS policy change can't mask a real outage as "0 rows".
      const r = await fetchWithTimeout(
        `${url}/rest/v1/user_progress?select=user_id&limit=1`,
        {
          method: "HEAD",
          headers: {
            apikey: service,
            Authorization: `Bearer ${service}`,
            Prefer: "count=exact",
          },
        },
      );
      if (!r.ok) throw new Error(`PostgREST returned ${r.status}`);
      const range = r.headers.get("content-range") || "";
      const total = range.split("/")[1] || "?";
      return `user_progress reachable (${total} rows)`;
    }),
  ]);

  return {
    ok: checks.every((c) => c.ok),
    ts: new Date().toISOString(),
    checks,
  };
}
