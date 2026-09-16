// Scheduled backstop for the sign-in path. Runs the same probes as
// /api/health and emails when any of them fail.
//
// This is the second line of defence, not the first: an external uptime
// monitor watching /api/health reacts in minutes and survives Vercel
// itself going down. This cron exists so that there is still an owned,
// in-repo alarm if that monitor is ever removed or its account lapses.
//
// ── Wiring ────────────────────────────────────────────────────────────────
//   Schedule (vercel.json):  { "path": "/api/cron/healthcheck",
//                              "schedule": "0 7 * * *" }   // 07:00 UTC daily
//
//   Vercel Hobby only permits once-a-day crons. On Pro, tighten this to
//   "*/15 * * * *" — but note there is no alert throttling, so a long
//   outage then sends one email per run.
//
//   Required env vars:
//     SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
//     RESEND_API_KEY
//     CRON_SECRET                 (Vercel sets the Authorization header)
//
//   Optional:
//     HEALTHCHECK_ALERT_TO        default: info@biostatquest.com
//     HEALTHCHECK_FROM            default: "BioStat Quest <info@biostatquest.com>"
//
// The alert path deliberately touches nothing but Resend — Supabase is
// assumed broken whenever this fires.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runHealthChecks, type HealthReport } from "../_lib/health.js";

const DEFAULT_TO = "info@biostatquest.com";
const DEFAULT_FROM = "BioStat Quest <info@biostatquest.com>";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` automatically.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const report = await runHealthChecks();

  if (report.ok) {
    return res.status(200).json({ ok: true, alerted: false, checks: report.checks });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.error("[healthcheck] backend is DOWN and RESEND_API_KEY is missing — cannot alert", report);
    return res.status(503).json({ ok: false, alerted: false, error: "missing RESEND_API_KEY", checks: report.checks });
  }

  const to = process.env.HEALTHCHECK_ALERT_TO || DEFAULT_TO;
  const from = process.env.HEALTHCHECK_FROM || DEFAULT_FROM;
  const failed = report.checks.filter((c) => !c.ok).map((c) => c.name).join(", ");

  let alerted = false;
  let alertError: string | undefined;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from,
        to,
        subject: `[BioStat Quest] Sign-in is DOWN — ${failed}`,
        text: alertText(report),
      }),
    });
    if (!r.ok) {
      alertError = `resend ${r.status}: ${(await r.text()).slice(0, 200)}`;
    } else {
      alerted = true;
    }
  } catch (e: any) {
    alertError = e?.message || String(e);
  }

  // Non-2xx so the run also shows red in Vercel's cron log, independent
  // of whether the email made it out.
  console.error("[healthcheck] backend unhealthy", { failed, alerted, alertError });
  return res.status(503).json({ ok: false, alerted, alertError, checks: report.checks });
}

function alertText(report: HealthReport): string {
  const lines = [
    "BioStat Quest backend health check FAILED.",
    "",
    `Time: ${report.ts}`,
    "",
    "Checks:",
    ...report.checks.map(
      (c) => `  [${c.ok ? "OK  " : "FAIL"}] ${c.name} (${c.ms}ms)${c.detail ? ` — ${c.detail}` : ""}`,
    ),
    "",
    "Users cannot sign in while auth_service or database_read are failing.",
    "",
    "First things to check:",
    "  1. Supabase dashboard — is the project paused or suspended?",
    "  2. Supabase → Authentication → Providers — are email and Google still on?",
    "  3. Vercel env vars — SUPABASE_URL / keys still present on production?",
    "",
    "Full report: https://www.biostatquest.com/api/health?token=<CRON_SECRET>",
  ];
  return lines.join("\n");
}
