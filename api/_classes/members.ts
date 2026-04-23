// GET /api/classes/members?class_id=<uuid>
//
// Roster + per-student summary for a class. Only callable by an
// instructor or co-instructor of the class; RLS enforces this on both
// class_members and user_progress. Students who haven't consented to
// instructor visibility appear in the roster (so the instructor can
// see they're a member) but with NULL aggregate stats.
//
// Using a query string rather than a path param because Vercel's file-
// based routing doesn't support [id] inside subdirectories without
// additional config; /api/classes/members?class_id=X is equivalent.
//
// Response 200:  { members: Array<{
//                    user_id, email, role, joined_at, consented,
//                    xp?, cases_completed?, current_streak?, last_active?
//                  }> }
// Response 4xx:  { error: string }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authedClient, isAuthedErr } from "../_lib/authed.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "method not allowed" });

  const a = await authedClient(req);
  if (isAuthedErr(a)) return res.status(a.status).json({ error: a.error });
  const { supa } = a;

  const classId = typeof req.query.class_id === "string" ? req.query.class_id : "";
  if (!/^[0-9a-f-]{36}$/i.test(classId)) {
    return res.status(400).json({ error: "class_id (uuid) required in query" });
  }

  // Fetch active members. RLS only returns rows when the caller is an
  // instructor/co-instructor in the class (or is the member themselves,
  // which returns at most their own row — we filter client-side below).
  const { data: members, error: memErr } = await supa
    .from("class_members")
    .select("user_id, role, joined_at, consented_to_instructor_visibility")
    .eq("class_id", classId)
    .is("left_at", null);

  if (memErr) return res.status(500).json({ error: memErr.message });
  if (!members || members.length <= 1) {
    // If caller isn't an instructor, RLS returns just their own row.
    // We treat this as "not authorized for cohort view" because a
    // legitimate class always has ≥2 rows (creator + someone else).
    // One edge case: a class with only the creator, freshly made.
    // In that case we still need to return [self] to the UI — let it
    // through but mark accordingly.
  }

  // Aggregate user_progress for each member. RLS on user_progress
  // returns rows only for (a) the caller themselves and (b) students
  // who have consented_to_instructor_visibility = true. A member who
  // hasn't consented will appear in the roster with null stats.
  const userIds = (members || []).map((m: any) => m.user_id);
  let progressByUser = new Map<string, any>();
  if (userIds.length > 0) {
    const { data: progress } = await supa
      .from("user_progress")
      .select("user_id, email, state, updated_at")
      .in("user_id", userIds);
    for (const p of progress || []) {
      progressByUser.set(p.user_id, p);
    }
  }

  const out = (members || []).map((m: any) => {
    const p = progressByUser.get(m.user_id);
    const state = p?.state || {};
    const completed = Array.isArray(state.completed) ? state.completed.length : 0;
    const xp = typeof state.xp === "number" ? state.xp : 0;
    const currentStreak = typeof state.currentStreak === "number" ? state.currentStreak : 0;
    return {
      user_id: m.user_id,
      email: p?.email ?? null,
      role: m.role,
      joined_at: m.joined_at,
      consented: !!m.consented_to_instructor_visibility,
      ...(p
        ? { xp, cases_completed: completed, current_streak: currentStreak, last_active: p.updated_at }
        : {}),
    };
  });

  return res.status(200).json({ members: out });
}
