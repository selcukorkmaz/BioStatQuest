// GET /api/verify?id=DOC_ID&email=EMAIL
//
// Public verification endpoint for Statements of Competency. A CV
// reviewer or employer pastes the printed Doc ID + the issuer's email
// and the endpoint confirms the statement was actually issued by that
// learner.
//
// We do NOT echo the full payload back — only what's necessary to
// satisfy "this Statement is authentic":
//   • verified: boolean
//   • issuedAt: ISO timestamp (when verified)
//   • learnerInitials: e.g. "S.K." (from email local part)
//   • engagedBranches: count (so the verifier can sanity-check what the
//     printed PDF claims)
//
// Rate-limited at the network layer (Vercel default). Email mismatch
// returns the same shape with verified:false to avoid revealing whether
// a particular Doc ID exists for a different account.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabaseAdmin } from "./_lib/supabaseAdmin.js";

function initialsFromEmail(email: string): string {
  const local = (email.split("@")[0] || "").replace(/[^a-zA-Z]/g, " ").trim();
  if (!local) return "—";
  const parts = local.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}.${parts[parts.length - 1][0]}.`.toUpperCase();
  return `${parts[0][0]}.`.toUpperCase();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Allow GET only — verifiers will paste this into a browser.
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method not allowed" });
  }

  const id = String(req.query.id || "").trim().toUpperCase();
  const email = String(req.query.email || "").trim().toLowerCase();
  if (!id || !email) {
    return res.status(400).json({ error: "id and email are required" });
  }
  if (id.length < 4 || id.length > 32) {
    return res.status(400).json({ error: "invalid id" });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("statements")
    .select("doc_id, email, issued_at, payload")
    .eq("doc_id", id)
    .maybeSingle();

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Same shape for "not found" and "wrong email" — don't disclose existence.
  if (!data || data.email.toLowerCase() !== email) {
    return res.status(200).json({
      verified: false,
      message:
        "Could not verify. Check that the Doc ID and email exactly match what's printed on the document.",
    });
  }

  const branches = Array.isArray((data.payload as any)?.branches)
    ? (data.payload as any).branches.length
    : null;

  return res.status(200).json({
    verified: true,
    docId: data.doc_id,
    issuedAt: data.issued_at,
    learnerInitials: initialsFromEmail(data.email),
    engagedBranches: branches,
  });
}
