// POST /api/classes/update-member
//
// Instructor / co-instructor management actions against a member row:
//   "promote" — student → co-instructor
//   "demote"  — co-instructor → student
//   "remove"  — mark the member as left (soft delete via left_at)
//
// Uses the service-role client so guard logic lives here rather than
// being split between RLS USING clauses and app-side checks. Consolidating
// in one place makes the rules auditable and matches how accept-invite /
// join-by-code handle their own membership writes.
//
// Guards (enforced in this order):
//   1. Caller must be an active instructor or co-instructor of the class.
//   2. Class must be writable (not archived, not lapsed).
//   3. Target must be an active member (left_at IS NULL) of the class.
//   4. Target role must NOT be 'instructor' — the creator is protected
//      and cannot be demoted/removed via this endpoint. (An "instructor
//      leaves their own class" flow would be a separate, confirm-heavy
//      surface; Phase A.2.c doesn't cover it.)
//   5. Caller cannot act on their own row via this endpoint — there is
//      no self-demote / self-remove here. Same reasoning as (4).
//   6. The requested action must be legal for the target's current role.
//
// Request body:  { class_id: string, user_id: string, action: "promote"|"demote"|"remove" }
// Response 200:  { ok: true, role: "student"|"co-instructor"|null }
//                (role is null when action=remove — the row is now inactive)
// Response 4xx:  { error: string }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authedClient, isAuthedErr } from "../_lib/authed.js";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";

type Action = "promote" | "demote" | "remove";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method not allowed" });

  const a = await authedClient(req);
  if (isAuthedErr(a)) return res.status(a.status).json({ error: a.error });
  const { user } = a;

  const { class_id, user_id, action } = (req.body ?? {}) as {
    class_id?: string;
    user_id?: string;
    action?: Action;
  };

  if (typeof class_id !== "string" || !class_id) {
    return res.status(400).json({ error: "class_id required" });
  }
  if (typeof user_id !== "string" || !user_id) {
    return res.status(400).json({ error: "user_id required" });
  }
  if (action !== "promote" && action !== "demote" && action !== "remove") {
    return res.status(400).json({ error: "action must be promote | demote | remove" });
  }
  if (user_id === user.id) {
    return res.status(400).json({ error: "cannot modify your own membership here" });
  }

  const admin = supabaseAdmin();

  // Guard 1+2: caller is instructor/co-instructor, class is writable.
  const { data: callerRow, error: callerErr } = await admin
    .from("class_members")
    .select("role, left_at")
    .eq("class_id", class_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (callerErr) return res.status(500).json({ error: callerErr.message });
  if (!callerRow || callerRow.left_at) {
    return res.status(403).json({ error: "not a member of this class" });
  }
  if (callerRow.role !== "instructor" && callerRow.role !== "co-instructor") {
    return res.status(403).json({ error: "only instructors can manage members" });
  }

  const { data: cls, error: clsErr } = await admin
    .from("classes")
    .select("id, archived_at, subscription_status")
    .eq("id", class_id)
    .single();
  if (clsErr || !cls) return res.status(404).json({ error: "class not found" });
  if (cls.archived_at) return res.status(409).json({ error: "class is archived" });
  if (cls.subscription_status === "lapsed") {
    return res.status(409).json({ error: "class is read-only (subscription lapsed)" });
  }

  // Guard 3+4: target is an active member, not the class's primary instructor.
  const { data: targetRow, error: targetErr } = await admin
    .from("class_members")
    .select("role, left_at")
    .eq("class_id", class_id)
    .eq("user_id", user_id)
    .maybeSingle();
  if (targetErr) return res.status(500).json({ error: targetErr.message });
  if (!targetRow || targetRow.left_at) {
    return res.status(404).json({ error: "member not found in this class" });
  }
  if (targetRow.role === "instructor") {
    return res.status(403).json({ error: "cannot modify the class's primary instructor" });
  }

  // Guard 6: role transition must be legal.
  let newRole: "student" | "co-instructor" | null;
  if (action === "promote") {
    if (targetRow.role !== "student") {
      return res.status(400).json({ error: "can only promote students" });
    }
    newRole = "co-instructor";
  } else if (action === "demote") {
    if (targetRow.role !== "co-instructor") {
      return res.status(400).json({ error: "can only demote co-instructors" });
    }
    newRole = "student";
  } else {
    // action === "remove"
    newRole = null;
  }

  // Apply the change.
  if (action === "remove") {
    const { error } = await admin
      .from("class_members")
      .update({ left_at: new Date().toISOString() })
      .eq("class_id", class_id)
      .eq("user_id", user_id);
    if (error) return res.status(500).json({ error: error.message });
  } else {
    const { error } = await admin
      .from("class_members")
      .update({ role: newRole })
      .eq("class_id", class_id)
      .eq("user_id", user_id);
    if (error) return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({ ok: true, role: newRole });
}
