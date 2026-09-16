// /api/billing/:action — the single remaining money-endpoint, and it only
// says "no".
//
// WHY THIS FILE EXISTS: paid plans were withdrawn on 2026-09-17
// (PAYMENTS_ENABLED=false in ../_lib/payments.ts). That left five routed
// functions — stripe/checkout, stripe/portal, lemonsqueezy/checkout,
// lemonsqueezy/portal, lemonsqueezy/cancel — whose entire body had become
// "return 410". Five cold-start surfaces for one constant response, while
// scripts/check-functions-cap.sh caps routed functions at 12 (Vercel
// Hobby's limit) and the health-check endpoints had just pushed us to 14.
// Collapsing them here follows the same pattern as api/classes/[action].ts.
//
// The old URLs still resolve: vercel.json rewrites each of them to this
// route, so a stale tab or an old bookmark gets the explanatory 410 rather
// than a bare 404.
//
// NOT consolidated here: the two webhook handlers
// (api/{stripe,lemonsqueezy}/webhook.ts). They're inbound-only, carry no
// purchase intent, and stay live so a late provider retry still reconciles.
//
// To re-open sales: restore the five deleted handlers from git history
// (they were complete and working), drop their rewrites from vercel.json,
// and flip PAYMENTS_ENABLED in both ../_lib/payments.ts and
// src/lib/launchFlags.ts.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { rejectIfPaymentsDisabled } from "../_lib/payments.js";

// The actions that used to exist. Anything else is a genuine 404 — we
// don't want this route absorbing typos and reporting them as "withdrawn".
const WITHDRAWN = new Set(["checkout", "portal", "cancel"]);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = (req.query as Record<string, string | string[]>).action;
  const action = Array.isArray(raw) ? raw[0] : raw;

  if (!action || !WITHDRAWN.has(action)) {
    return res.status(404).json({ error: "Not found" });
  }

  // Always true while payments are off; if the switch is ever flipped back
  // on without restoring the real handlers, this route must not pretend to
  // work — so fall through to an explicit 501 rather than a silent 200.
  if (rejectIfPaymentsDisabled(req, res)) return;

  return res.status(501).json({
    error:
      "Billing is enabled but the checkout/portal/cancel handlers have not been restored. See git history for api/{stripe,lemonsqueezy}/*.",
  });
}
