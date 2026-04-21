// Daily re-engagement cron. Scans for users who have made progress (XP > 0)
// but have been inactive for N days, and sends them a one-off "your lab is
// waiting" email via Resend. Dedup'd through public.email_sends so a user
// only ever receives a given campaign once.
//
// ── Wiring ────────────────────────────────────────────────────────────────
//   Schedule (vercel.json):   { "path": "/api/cron/reengagement",
//                               "schedule": "0 10 * * *" }   // 10:00 UTC daily
//
//   Required env vars (Vercel project settings):
//     SUPABASE_URL                (or VITE_SUPABASE_URL)
//     SUPABASE_SERVICE_ROLE_KEY   (service role, server-only)
//     RESEND_API_KEY              (https://resend.com/api-keys)
//     CRON_SECRET                 (random 32+ char token; Vercel sets the
//                                  Authorization: Bearer header automatically
//                                  when the cron fires)
//
//   Optional:
//     REENGAGEMENT_FROM           default: "BioStat Quest <info@biostatquest.com>"
//     REENGAGEMENT_DRY_RUN        "1" to log recipients without sending
//     REENGAGEMENT_DORMANT_DAYS   default: 7
//     REENGAGEMENT_MAX_PER_RUN    default: 50  (protects Resend free tier)
//     REENGAGEMENT_CAMPAIGN       default: "reengage_v1"  (dedup key)
//
// ── Dedup ─────────────────────────────────────────────────────────────────
//   Each send writes a row into public.email_sends (user_id, campaign). We
//   skip anyone with an existing row for the active campaign. To re-send to
//   the same cohort, bump REENGAGEMENT_CAMPAIGN (or run the SQL migration).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";

const DEFAULT_FROM = "BioStat Quest <info@biostatquest.com>";
const DEFAULT_CAMPAIGN = "reengage_v1";
const DEFAULT_DORMANT_DAYS = 7;
const DEFAULT_MAX_PER_RUN = 50;

type Candidate = {
  user_id: string;
  email: string;
  xp: number;
  last_seen: string | null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` automatically.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const dryRun = process.env.REENGAGEMENT_DRY_RUN === "1";
  const dormantDays = Number(process.env.REENGAGEMENT_DORMANT_DAYS) || DEFAULT_DORMANT_DAYS;
  const maxPerRun = Number(process.env.REENGAGEMENT_MAX_PER_RUN) || DEFAULT_MAX_PER_RUN;
  const campaign = process.env.REENGAGEMENT_CAMPAIGN || DEFAULT_CAMPAIGN;
  const from = process.env.REENGAGEMENT_FROM || DEFAULT_FROM;
  const resendKey = process.env.RESEND_API_KEY;

  if (!dryRun && !resendKey) {
    return res.status(500).json({ error: "missing RESEND_API_KEY" });
  }

  const db = supabaseAdmin();
  const cutoff = new Date(Date.now() - dormantDays * 86_400_000).toISOString();

  // 1) Pull users with progress + an email on file, updated_at older than cutoff.
  //    updated_at is touched whenever state saves, so it's a good proxy for
  //    "last seen". XP > 0 filters out anyone who has never answered anything.
  const { data: rows, error: qErr } = await db
    .from("user_progress")
    .select("user_id, email, updated_at, state")
    .lt("updated_at", cutoff)
    .not("email", "is", null)
    .limit(500);
  if (qErr) return res.status(500).json({ error: qErr.message });

  const candidates: Candidate[] = [];
  for (const r of rows || []) {
    const email = (r as any).email as string | null;
    if (!email) continue;
    const xp = Number(((r as any).state || {}).xp) || 0;
    if (xp <= 0) continue;
    candidates.push({
      user_id: (r as any).user_id,
      email,
      xp,
      last_seen: (r as any).updated_at,
    });
  }

  if (candidates.length === 0) {
    return res.status(200).json({ ok: true, scanned: rows?.length || 0, sent: 0, reason: "no dormant users with progress" });
  }

  // 2) Filter out anyone who already received this campaign.
  const ids = candidates.map((c) => c.user_id);
  const { data: sent, error: sErr } = await db
    .from("email_sends")
    .select("user_id")
    .eq("campaign", campaign)
    .in("user_id", ids);
  if (sErr) return res.status(500).json({ error: sErr.message });
  const already = new Set((sent || []).map((r: any) => r.user_id));
  const queue = candidates.filter((c) => !already.has(c.user_id)).slice(0, maxPerRun);

  if (queue.length === 0) {
    return res.status(200).json({ ok: true, scanned: candidates.length, sent: 0, reason: "all already received campaign" });
  }

  if (dryRun) {
    return res.status(200).json({
      ok: true,
      dryRun: true,
      campaign,
      would_send: queue.map((c) => ({ email: c.email, xp: c.xp, last_seen: c.last_seen })),
    });
  }

  // 3) Load template once. Keep it in repo so a template change ships with a
  //    deploy, no separate migration needed.
  const template = loadTemplate();

  // 4) Send + log one at a time. Resend's free tier throttles at ~2 req/sec;
  //    for maxPerRun=50 this is a ~25s invocation, well under the 300s limit.
  const results: { email: string; ok: boolean; error?: string }[] = [];
  for (const c of queue) {
    const html = renderTemplate(template, { xp: c.xp });
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from,
          to: c.email,
          subject: "Your lab is waiting — pick up where you left off",
          html,
        }),
      });
      if (!r.ok) {
        const body = await r.text();
        results.push({ email: c.email, ok: false, error: `resend ${r.status}: ${body.slice(0, 200)}` });
        continue;
      }
      await db.from("email_sends").insert({
        user_id: c.user_id,
        email: c.email,
        campaign,
      });
      results.push({ email: c.email, ok: true });
    } catch (e: any) {
      results.push({ email: c.email, ok: false, error: e?.message || String(e) });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  return res.status(200).json({
    ok: true,
    campaign,
    scanned: candidates.length,
    sent: okCount,
    failed: results.length - okCount,
    results,
  });
}

function loadTemplate(): string {
  // Vercel bundles the function's directory; the template lives at
  // <repo>/email-templates/reengagement.html. Resolve relative to this file.
  const path = join(process.cwd(), "email-templates", "reengagement.html");
  return readFileSync(path, "utf8");
}

function renderTemplate(tpl: string, vars: { xp: number }): string {
  return tpl.replace(/\{\{\s*xp\s*\}\}/g, String(vars.xp));
}
