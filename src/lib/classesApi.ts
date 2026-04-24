// Typed wrappers for the /api/classes/* endpoints. Handles JWT extraction
// from Supabase's localStorage entry and funnels responses through a
// consistent error path so components don't each re-implement try/catch
// around fetch.
//
// Each function returns { ok: true, data } on success or { ok: false, error }
// on any failure — network, 4xx, 5xx, JSON-parse. Components render the
// error string; we don't throw.

export type ClassSummary = {
  id: string;
  name: string;
  institution_name?: string;
  role: "instructor" | "co-instructor" | "student";
  subscription_status: "active" | "lapsed" | "trialing";
  archived_at: string | null;
  code?: string;              // only present for instructor / co-instructor
  member_count?: number;      // only present for instructor / co-instructor
};

export type ClassMember = {
  user_id: string;
  email: string | null;
  role: "instructor" | "co-instructor" | "student";
  joined_at: string;
  consented: boolean;
  xp?: number;
  cases_completed?: number;
  current_streak?: number;
  last_active?: string;
};

export type InviteResult = {
  invite_id: string;
  expires_at: string;
  join_url: string;
  email_sent: boolean;
};

export type Ok<T> = { ok: true; data: T };
export type Err = { ok: false; error: string; status?: number };
export type Result<T> = Ok<T> | Err;

// ------- JWT plumbing -------
// Pulls the freshest access_token out of Supabase's localStorage row. No
// SDK dependency — the app is already using Supabase JS elsewhere; we
// just read the same storage key here so our plain-fetch calls can piggy-
// back on the active session.
function getJwt(): string | null {
  if (typeof window === "undefined") return null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || "";
      if (k.startsWith("sb-") && k.endsWith("-auth-token")) {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        return parsed?.access_token || parsed?.currentSession?.access_token || null;
      }
    }
  } catch {
    // localStorage access can throw in incognito / sandboxed contexts;
    // just treat as unauthenticated.
  }
  return null;
}

async function call<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown
): Promise<Result<T>> {
  const jwt = getJwt();
  if (!jwt) return { ok: false, error: "not signed in" };

  try {
    const r = await fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${jwt}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let json: any = null;
    try { json = await r.json(); } catch { /* non-JSON response */ }
    if (!r.ok) {
      return {
        ok: false,
        status: r.status,
        error: json?.error || `HTTP ${r.status}`,
      };
    }
    return { ok: true, data: json as T };
  } catch (e: any) {
    return { ok: false, error: e?.message || "network error" };
  }
}

// ------- Endpoint wrappers -------

export function createClass(input: {
  name: string;
  institution_name?: string;
  description?: string;
}): Promise<Result<{ id: string; code: string; name: string }>> {
  return call("POST", "/api/classes/create", input);
}

export function inviteToClass(input: {
  class_id: string;
  email: string;
  role?: "student" | "co-instructor";
}): Promise<Result<InviteResult>> {
  return call("POST", "/api/classes/invite", input);
}

export function listMyClasses(): Promise<Result<{ classes: ClassSummary[] }>> {
  return call("GET", "/api/classes/mine");
}

export function listClassMembers(classId: string): Promise<Result<{ members: ClassMember[] }>> {
  return call("GET", `/api/classes/members?class_id=${encodeURIComponent(classId)}`);
}

export function acceptInvite(input: {
  token: string;
  consent: boolean;
}): Promise<Result<{ class_id: string; class_name: string; role: string }>> {
  return call("POST", "/api/classes/accept-invite", input);
}

export function joinByCode(input: {
  code: string;
  consent: boolean;
}): Promise<Result<{ class_id: string; class_name: string }>> {
  return call("POST", "/api/classes/join-by-code", input);
}

// Member management — promote student → co-instructor, demote co-instructor
// → student, or remove a member entirely (soft-delete via left_at).
// Server-side guards block acting on 'instructor' rows, acting on your own
// row, and acting in a non-writable class.
export function updateMember(input: {
  class_id: string;
  user_id: string;
  action: "promote" | "demote" | "remove";
}): Promise<Result<{ ok: true; role: "student" | "co-instructor" | null }>> {
  return call("POST", "/api/classes/update-member", input);
}

// Archive or unarchive a class. Only the primary instructor can flip this.
// Archived classes stay visible but are frozen — no invites, no roster
// writes, roster still readable.
export function setClassArchived(input: {
  class_id: string;
  archived: boolean;
}): Promise<Result<{ ok: true; archived_at: string | null }>> {
  return call("POST", "/api/classes/archive", input);
}

// Cohort-level analytics for a class. Aggregates completion + accuracy
// from events + user_progress across all consented members. Non-consented
// students appear in the roster but with zeroed progress fields, so the
// instructor can see who hasn't opted in without seeing their work.
export type InsightsMember = {
  user_id: string;
  email: string | null;
  role: "instructor" | "co-instructor" | "student";
  consented: boolean;
  cases_completed: number;
  xp: number;
  current_streak: number;
  last_active: string | null;
  attempts: number;
  accuracy_pct: number | null;
};
export type InsightsPayload = {
  summary: {
    total_members: number;
    consented_members: number;
    active_7d: number;
    inactive_14d: number;
  };
  members: InsightsMember[];
  per_method: Array<{ method: string; attempts: number; correct: number }>;
  per_case: Array<{ case_id: string; attempts: number; correct: number }>;
  per_member_method: Array<{ user_id: string; method: string; attempts: number; correct: number }>;
};
export function getClassInsights(classId: string): Promise<Result<InsightsPayload>> {
  return call("GET", `/api/classes/insights?class_id=${encodeURIComponent(classId)}`);
}

// Convenience: is the caller an instructor or co-instructor anywhere?
// Used by App to decide whether to show the "Teach" nav item. Resolves
// to false on any error so a failed network call doesn't show the tab
// to a non-instructor.
export async function hasAnyInstructorRole(): Promise<boolean> {
  const r = await listMyClasses();
  if (!r.ok) return false;
  return r.data.classes.some(
    (c) => c.role === "instructor" || c.role === "co-instructor"
  );
}
