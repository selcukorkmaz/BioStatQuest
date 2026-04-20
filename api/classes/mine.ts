// GET /api/classes/mine
//
// Lists all classes the authenticated user is an active member of
// (role = instructor | co-instructor | student, left_at IS NULL).
// Member counts and the class code are included only when the caller
// is an instructor or co-instructor in that class — students see the
// class name but not the join code (preventing a curious student from
// forwarding it to a non-enrolled friend).
//
// Response 200:  { classes: Array<{
//                    id, name, institution_name?, role, member_count?, code?,
//                    subscription_status, archived_at
//                  }> }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authedClient, isAuthedErr } from "../_lib/authed";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "method not allowed" });

  const a = await authedClient(req);
  if (isAuthedErr(a)) return res.status(a.status).json({ error: a.error });
  const { supa, user } = a;

  // All active memberships for this user, joined to class details.
  const { data: rows, error } = await supa
    .from("class_members")
    .select("role, class_id, classes!inner(id, name, institution_name, code, subscription_status, archived_at)")
    .eq("user_id", user.id)
    .is("left_at", null);

  if (error) return res.status(500).json({ error: error.message });

  // Attach member_count for instructor/co-instructor roles. Run these
  // counts in parallel to avoid N+1 latency. RLS on class_members
  // enforces the same instructor-can-see-roster policy.
  const classes = await Promise.all(
    (rows || []).map(async (row: any) => {
      const c = row.classes;
      const isInstructor = row.role === "instructor" || row.role === "co-instructor";
      let member_count: number | undefined;
      if (isInstructor) {
        const { count } = await supa
          .from("class_members")
          .select("user_id", { count: "exact", head: true })
          .eq("class_id", c.id)
          .is("left_at", null);
        member_count = count ?? undefined;
      }
      return {
        id: c.id,
        name: c.name,
        institution_name: c.institution_name || undefined,
        role: row.role,
        subscription_status: c.subscription_status,
        archived_at: c.archived_at,
        // Code is shared only with instructors — students see the name
        // but not the key that unlocks additional enrollment.
        ...(isInstructor ? { code: c.code, member_count } : {}),
      };
    })
  );

  return res.status(200).json({ classes });
}
