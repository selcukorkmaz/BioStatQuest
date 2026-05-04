// POST /api/statements/issue
//
// Records an issued Statement of Competency so the Doc ID printed on
// the document can be independently verified later via /api/verify.
//
// Body:
//   {
//     docId:   string,    // FNV-1a hash from the client (deterministic)
//     payload: object,    // tier counts + branch summary at issue time
//   }
//
// The user_id and email are taken from the authed JWT — never trust the
// client. Idempotent: same docId from same user → upsert (no duplicates).
//
// Response: { ok: true, docId, issuedAt }
// Errors: 400 (validation), 401 (auth), 500 (db).

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authedClient } from "../_lib/authed.js";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method not allowed" });
  }

  const auth = await authedClient(req);
  if ("error" in auth) return res.status(auth.status).json({ error: auth.error });

  const { docId, payload } = (req.body || {}) as { docId?: string; payload?: unknown };
  if (typeof docId !== "string" || docId.length < 4 || docId.length > 32) {
    return res.status(400).json({ error: "invalid docId" });
  }
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "invalid payload" });
  }

  const email = auth.user.email;
  if (!email) return res.status(400).json({ error: "user has no email" });

  // service_role client — RLS would also allow this, but the admin client
  // gives us a clean upsert without round-tripping the JWT.
  const admin = supabaseAdmin();
  const { error } = await admin
    .from("statements")
    .upsert(
      { doc_id: docId, user_id: auth.user.id, email, payload },
      { onConflict: "doc_id" },
    );

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ ok: true, docId, issuedAt: new Date().toISOString() });
}
