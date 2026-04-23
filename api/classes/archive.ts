// POST /api/classes/archive
//
// Archive or unarchive a class. Archiving is destructive-adjacent — after
// archiving:
//   • The class still appears in member rosters (students keep access to
//     their own progress history)
//   • Instructors still see the class in Teach, rendered with a muted
//     "Archived" chip
//   • No new invites, no role changes, no roster writes (RLS blocks via
//     is_class_writable) — the class is effectively frozen
//   • Unarchiving restores full write access
//
// Only the primary instructor (role = 'instructor') can archive/unarchive.
// Co-instructors cannot — archive is a class-owner decision.
//
// Bypasses RLS via service-role because the "classes instructors update"
// policy has `archived_at is null` in its USING clause, which would block
// unarchive. Centralizing the check here is simpler than maintaining a
// second update policy.
//
// Request body:  { class_id: string, archived: boolean }
// Response 200:  { ok: true, archived_at: string | null }
// Response 4xx:  { error: string }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authedClient, isAuthedErr } from "../_lib/authed.js";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const a = await authedClient(req);
  if (isAuthedErr(a)) return res.status(a.status).json({ error: a.error });
  const { user } = a;

  const { class_id, archived } = (req.body ?? {}) as {
    class_id?: string;
    archived?: boolean;
  };

  if (typeof class_id !== "string" || !class_id) {
    return res.status(400).json({ error: "class_id required" });
  }
  if (typeof archived !== "boolean") {
    return res.status(400).json({ error: "archived (boolean) required" });
  }

  const admin = supabaseAdmin();

  // Caller must be the primary instructor of this class. Co-instructors
  // can manage members but not flip the archive bit.
  const { data: callerRow, error: callerErr } = await admin
    .from("class_members")
    .select("role, left_at")
    .eq("class_id", class_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (callerErr) return res.status(500).json({ error: callerErr.message });
  if (!callerRow || callerRow.left_at || callerRow.role !== "instructor") {
    return res.status(403).json({ error: "only the class instructor can archive" });
  }

  const archivedAt = archived ? new Date().toISOString() : null;

  const { error: updErr } = await admin
    .from("classes")
    .update({ archived_at: archivedAt })
    .eq("id", class_id);
  if (updErr) return res.status(500).json({ error: updErr.message });

  return res.status(200).json({ ok: true, archived_at: archivedAt });
}
