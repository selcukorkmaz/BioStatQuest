// GET /api/health
//
// Public liveness endpoint for an external uptime monitor (UptimeRobot,
// BetterStack, Pingdom — anything that can watch a URL and alert on a
// non-200). Point the monitor here, NOT at the homepage: the homepage is
// static and stays green even when the whole backend is suspended, which
// is exactly how the September 2026 outage went unnoticed for 15 days.
//
//   200 { ok: true,  ... }  → sign-in and the database are working
//   503 { ok: false, ... }  → something on the sign-in path is broken
//
// Detail is withheld from anonymous callers so the endpoint doesn't hand
// out row counts or internal error strings. Add the CRON_SECRET to see
// the full report:
//
//   curl "https://www.biostatquest.com/api/health?token=$CRON_SECRET"

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runHealthChecks } from "./_lib/health.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).json({ error: "method not allowed" });
  }

  const report = await runHealthChecks();

  const secret = process.env.CRON_SECRET;
  const token = String(req.query.token || "") || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const verbose = Boolean(secret && token && token === secret);

  // Never cache a health check — a cached 200 is worse than no monitor.
  res.setHeader("Cache-Control", "no-store, max-age=0");

  const body = verbose
    ? report
    : {
        ok: report.ok,
        ts: report.ts,
        checks: report.checks.map((c) => ({ name: c.name, ok: c.ok })),
      };

  return res.status(report.ok ? 200 : 503).json(body);
}
