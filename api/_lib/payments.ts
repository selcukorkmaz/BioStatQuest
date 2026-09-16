// Server-side payments kill switch. Mirrors PAYMENTS_ENABLED in
// src/lib/launchFlags.ts — keep the two in sync.
//
// Withdrawn on 2026-09-17: paid Pro plans and the institutional
// (per-seat) offer were taken off the product. The client no longer
// renders any checkout affordance, but the UI is not an enforcement
// boundary: a stale tab, a cached bundle or a hand-rolled POST could
// still reach these routes. So every money-moving endpoint short-circuits
// here instead.
//
// Deliberately NOT applied to the webhook handlers: they're inbound-only,
// carry no purchase intent, and staying live means a late provider retry
// still reconciles correctly rather than being lost.
//
// To re-open sales: flip this to `true` AND PAYMENTS_ENABLED in
// src/lib/launchFlags.ts.
import type { VercelRequest, VercelResponse } from "@vercel/node";

export const PAYMENTS_ENABLED = false;

/**
 * Call at the top of any billing endpoint. Returns true when the request
 * was already answered (payments are off) and the caller must return
 * immediately.
 *
 * 410 Gone rather than 404 (the route exists) or 403 (this isn't about
 * the caller's permissions) — the resource is intentionally withdrawn.
 */
export function rejectIfPaymentsDisabled(
  _req: VercelRequest,
  res: VercelResponse,
): boolean {
  if (PAYMENTS_ENABLED) return false;
  res.status(410).json({
    error:
      "Paid plans have been withdrawn — BioStat Quest is free for everyone. No purchase is required or possible.",
  });
  return true;
}
