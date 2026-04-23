// GET /api/classes/insights?class_id=X
//
// Cohort analytics for a class. Returns a pre-aggregated rollup of every
// consented member's progress + accuracy data, plus cohort-wide attempt
// counts per method and per case. The client derives per-branch accuracy
// from the per-case rollup (branch metadata lives in src/data/cases.ts).
//
// Only instructors and co-instructors can call this. Non-consented members
// are still included in the roster (as a count / chip) but their progress
// data is zeroed so the instructor knows they exist without seeing their
// work — matches the consent promise we make at /join and in the UI.
//
// Uses service-role: we cross-query user_progress + events across multiple
// students, and the "user_progress instructor read students" RLS policy
// already enforces consent at the row level — but we want the endpoint to
// be the single place that decides what goes out. Centralizing keeps the
// privacy invariants auditable.
//
// Payload shape is intentionally small: one row per (member × method)
// rather than a full events dump. For a 50-student class touching all 42
// methods, that's ≤2100 rows — well under 100KB.
//
// Response 200:
// {
//   summary: {
//     total_members, consented_members, active_7d, inactive_14d
//   },
//   members: [{
//     user_id, email, role, consented,
//     cases_completed, xp, current_streak, last_active,
//     accuracy_pct, attempts
//   }],
//   per_method: [{ method, attempts, correct }],
//   per_case:   [{ case_id, attempts, correct }],
//   per_member_method: [{ user_id, method, attempts, correct }]
// }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authedClient, isAuthedErr } from "../_lib/authed.js";
import { supabaseAdmin } from "../_lib/supabaseAdmin.js";

type Row<T> = T;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "method not allowed" });

  const a = await authedClient(req);
  if (isAuthedErr(a)) return res.status(a.status).json({ error: a.error });
  const { user } = a;

  const classId = typeof req.query.class_id === "string" ? req.query.class_id : "";
  if (!classId) return res.status(400).json({ error: "class_id required" });

  const admin = supabaseAdmin();

  // 1. Caller must be an active instructor or co-instructor of the class.
  const { data: callerRow, error: callerErr } = await admin
    .from("class_members")
    .select("role, left_at")
    .eq("class_id", classId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (callerErr) return res.status(500).json({ error: callerErr.message });
  if (!callerRow || callerRow.left_at) {
    return res.status(403).json({ error: "not a member of this class" });
  }
  if (callerRow.role !== "instructor" && callerRow.role !== "co-instructor") {
    return res.status(403).json({ error: "only instructors can view insights" });
  }

  // 2. Fetch active members with their roles + consent flag.
  const { data: memberRows, error: memErr } = await admin
    .from("class_members")
    .select("user_id, role, consented_to_instructor_visibility")
    .eq("class_id", classId)
    .is("left_at", null);
  if (memErr) return res.status(500).json({ error: memErr.message });

  const members = memberRows || [];
  const consentedIds = members
    .filter((m) => m.consented_to_instructor_visibility)
    .map((m) => m.user_id);

  // 3. Pull user_progress for consented members. We need state (for XP,
  // streak, completed cases, email, display_name) + updated_at (proxy
  // for last_active).
  const progressById = new Map<string, {
    email: string | null;
    xp: number;
    current_streak: number;
    cases_completed: number;
    last_active: string | null;
  }>();

  if (consentedIds.length > 0) {
    const { data: progRows, error: progErr } = await admin
      .from("user_progress")
      .select("user_id, email, state, updated_at")
      .in("user_id", consentedIds);
    if (progErr) return res.status(500).json({ error: progErr.message });

    for (const p of progRows || []) {
      const state = (p.state || {}) as any;
      progressById.set(p.user_id, {
        email: p.email || null,
        xp: Number(state.xp || 0),
        current_streak: Number(state.currentStreak || 0),
        cases_completed: Array.isArray(state.completed) ? state.completed.length : 0,
        last_active: p.updated_at || null,
      });
    }
  }

  // Fallback: non-consented members still need an email label for the
  // roster. Grab the email column only (no state, no progress).
  const nonConsentedIds = members
    .filter((m) => !m.consented_to_instructor_visibility)
    .map((m) => m.user_id);
  const emailById = new Map<string, string | null>();
  if (nonConsentedIds.length > 0) {
    const { data: emailRows } = await admin
      .from("user_progress")
      .select("user_id, email")
      .in("user_id", nonConsentedIds);
    for (const r of emailRows || []) emailById.set(r.user_id, r.email || null);
  }

  // 4. Pull answer events for consented members. We page to avoid the
  // default PostgREST 1000-row cap biting on large cohorts — in practice
  // a semester-long class is well under this, but explicit pagination
  // makes the endpoint safe to run indefinitely.
  type AnswerEvent = { user_id: string | null; case_id: string | null; method: string | null; type: string };
  const events: AnswerEvent[] = [];
  if (consentedIds.length > 0) {
    const PAGE = 1000;
    let offset = 0;
    // cap at 20k rows (20 pages) so a pathological outlier can't stall us
    while (offset < 20000) {
      const { data: page, error: evErr } = await admin
        .from("events")
        .select("user_id, case_id, method, type")
        .in("user_id", consentedIds)
        .in("type", ["answer_correct", "answer_wrong"])
        .range(offset, offset + PAGE - 1);
      if (evErr) return res.status(500).json({ error: evErr.message });
      if (!page || page.length === 0) break;
      events.push(...(page as AnswerEvent[]));
      if (page.length < PAGE) break;
      offset += PAGE;
    }
  }

  // 5. Roll up. Three aggregate maps + one per-member table.
  const perMethod = new Map<string, { attempts: number; correct: number }>();
  const perCase = new Map<string, { attempts: number; correct: number }>();
  const perMemberMethod = new Map<string, Map<string, { attempts: number; correct: number }>>();
  const perMember = new Map<string, { attempts: number; correct: number }>();

  for (const ev of events) {
    if (!ev.user_id) continue;
    const correct = ev.type === "answer_correct" ? 1 : 0;

    if (ev.method) {
      const m = perMethod.get(ev.method) || { attempts: 0, correct: 0 };
      m.attempts++;
      m.correct += correct;
      perMethod.set(ev.method, m);

      let byMember = perMemberMethod.get(ev.user_id);
      if (!byMember) { byMember = new Map(); perMemberMethod.set(ev.user_id, byMember); }
      const cell = byMember.get(ev.method) || { attempts: 0, correct: 0 };
      cell.attempts++;
      cell.correct += correct;
      byMember.set(ev.method, cell);
    }

    if (ev.case_id) {
      const c = perCase.get(ev.case_id) || { attempts: 0, correct: 0 };
      c.attempts++;
      c.correct += correct;
      perCase.set(ev.case_id, c);
    }

    const mem = perMember.get(ev.user_id) || { attempts: 0, correct: 0 };
    mem.attempts++;
    mem.correct += correct;
    perMember.set(ev.user_id, mem);
  }

  // 6. Shape the response. Sort members alphabetically by email so the
  // order is stable in the UI. Consented students with no activity and
  // non-consented students both get null accuracy.
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  let active7 = 0;
  let inactive14 = 0;

  const memberList = members.map((m) => {
    const prog = progressById.get(m.user_id);
    const stats = perMember.get(m.user_id);
    const lastActive = prog?.last_active || null;

    if (prog && lastActive) {
      const age = now - new Date(lastActive).getTime();
      if (age <= 7 * DAY) active7++;
      else if (age > 14 * DAY) inactive14++;
    }

    return {
      user_id: m.user_id,
      email: prog?.email ?? emailById.get(m.user_id) ?? null,
      role: m.role as "instructor" | "co-instructor" | "student",
      consented: !!m.consented_to_instructor_visibility,
      cases_completed: prog?.cases_completed ?? 0,
      xp: prog?.xp ?? 0,
      current_streak: prog?.current_streak ?? 0,
      last_active: lastActive,
      attempts: stats?.attempts ?? 0,
      accuracy_pct: stats && stats.attempts > 0
        ? Math.round((stats.correct / stats.attempts) * 100)
        : null,
    };
  });
  memberList.sort((a, b) => (a.email || "").localeCompare(b.email || ""));

  const perMethodArr = Array.from(perMethod.entries())
    .map(([method, v]) => ({ method, attempts: v.attempts, correct: v.correct }))
    .sort((a, b) => b.attempts - a.attempts);

  const perCaseArr = Array.from(perCase.entries())
    .map(([case_id, v]) => ({ case_id, attempts: v.attempts, correct: v.correct }));

  const perMemberMethodArr: Array<{ user_id: string; method: string; attempts: number; correct: number }> = [];
  for (const [uid, byMethod] of perMemberMethod.entries()) {
    for (const [method, v] of byMethod.entries()) {
      perMemberMethodArr.push({ user_id: uid, method, attempts: v.attempts, correct: v.correct });
    }
  }

  return res.status(200).json({
    summary: {
      total_members: members.length,
      consented_members: consentedIds.length,
      active_7d: active7,
      inactive_14d: inactive14,
    },
    members: memberList,
    per_method: perMethodArr,
    per_case: perCaseArr,
    per_member_method: perMemberMethodArr,
  });
}
