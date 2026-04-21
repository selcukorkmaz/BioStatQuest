// POST /api/classes/join-by-code
//
// Student self-joins a class using the 6-char code the instructor shared
// (verbal, Slack, syllabus, LMS paste). Uses the service-role client for
// the code lookup (students are not RLS-allowed to SELECT on classes by
// code before joining). Role is always 'student'; co-instructor joins
// go through the magic-link invite flow.
//
// Request body:  { code: string, consent: true }
// Response 200:  { class_id: string, class_name: string }
// Response 4xx:  { error: string }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authedClient, isAuthedErr } from "../_lib/authed.js";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const a = await authedClient(req);
  if (isAuthedErr(a)) return res.status(a.status).json({ error: a.error });
  const { user } = a;

  const { code, consent } = req.body ?? {};
  if (typeof code !== "string" || !/^[A-Z0-9]{4,8}$/i.test(code)) {
    return res.status(400).json({ error: "class code required (alphanumeric)" });
  }
  if (consent !== true) {
    return res.status(400).json({ error: "consent required — instructor will see your progress in this class" });
  }

  const admin = supabaseAdmin();

  const { data: cls, error: clsErr } = await admin
    .from("classes")
    .select("id, name, archived_at, subscription_status")
    .eq("code", code.toUpperCase())
    .maybeSingle();

  if (clsErr) return res.status(500).json({ error: clsErr.message });
  if (!cls) return res.status(404).json({ error: "class not found" });
  if (cls.archived_at || cls.subscription_status === "lapsed") {
    return res.status(409).json({ error: "class unavailable (archived or lapsed)" });
  }

  // Upsert — a previously-left student rejoining is reactivated cleanly.
  // joined_at is preserved on conflict; we only update left_at + consent.
  const { error: memErr } = await admin
    .from("class_members")
    .upsert(
      {
        class_id: cls.id,
        user_id: user.id,
        role: "student",
        consented_to_instructor_visibility: true,
        left_at: null,
      },
      { onConflict: "class_id,user_id" }
    );

  if (memErr) return res.status(500).json({ error: memErr.message });

  return res.status(200).json({ class_id: cls.id, class_name: cls.name });
}
