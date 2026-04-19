// BiostatQuest — Supabase auth + progress sync (TypeScript module).
// Migrated from auth.js. Still exposes window.BQAuth for compatibility with
// the legacy App.tsx component code, which accesses auth as a global.

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { __SRS } from "./srs";
import type { Grade } from "ts-fsrs";
import { CASES } from "../data/cases";

const SUPABASE_URL =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) ||
  (typeof window !== "undefined" ? (window as any).__SUPABASE_URL : "") ||
  "";
const SUPABASE_ANON_KEY =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  (typeof window !== "undefined" ? (window as any).__SUPABASE_ANON_KEY : "") ||
  "";

type StateSnapshot = Record<string, unknown>;
type AuthSub = (user: User | null) => void;

const enabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
let client: SupabaseClient | null = null;
let currentUser: User | null = null;
const subscribers: AuthSub[] = [];

function notify() {
  subscribers.forEach((cb) => {
    try {
      cb(currentUser);
    } catch (e) {
      console.warn(e);
    }
  });
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingState: StateSnapshot | null = null;

async function init() {
  if (!enabled) {
    console.info("[BQAuth] Supabase not configured — guest mode only.");
    notify();
    return;
  }
  client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const {
    data: { session },
  } = await client.auth.getSession();
  currentUser = session?.user ?? null;

  client.auth.onAuthStateChange((event, session) => {
    const prevUserId = currentUser?.id;
    currentUser = session?.user ?? null;
    notify();
    // Telemetry: distinguish SIGNED_IN (brand-new session), TOKEN_REFRESHED
    // (silent), etc. Fire a session_start on any meaningful transition so the
    // admin activity feed reflects active sessions, not just new signups.
    if (currentUser && currentUser.id !== prevUserId) {
      void logEvent("session_start", { data: { event } });
    }
  });

  // Read landing variant + ref param so we can attribute this session to a
  // marketing surface (referrer-aware hero in index.html stashed the variant
  // in localStorage + appends ?ref=<variant> to outbound CTAs).
  let ref: string | null = null;
  let landingVariant: string | null = null;
  try {
    const qs = new URLSearchParams(window.location.search);
    ref = qs.get("ref");
    landingVariant = window.localStorage.getItem("bq_landing_variant");
  } catch {}

  // Initial load: log either a session_start (signed in) or guest_visit
  // (anonymous). guest_visit deduplicates to at most one per browser per day
  // via a localStorage timestamp so we don't spam on every reload.
  if (currentUser) {
    void logEvent("session_start", {
      data: { event: "INITIAL", ref, landingVariant },
    });
  } else {
    try {
      const DAY = 24 * 3600e3;
      const last = Number(window.localStorage.getItem("bq_last_guest_visit") || 0);
      if (!last || Date.now() - last > DAY) {
        window.localStorage.setItem("bq_last_guest_visit", String(Date.now()));
        void logEvent("guest_visit", {
          data: {
            referrer: document.referrer || null,
            path: window.location.pathname,
            ref,
            landingVariant,
          },
        });
      }
    } catch {}
  }

  notify();
}

async function signInWithEmail(email: string) {
  if (!enabled || !client) throw new Error("Auth not configured");
  const redirect = window.location.origin + window.location.pathname;
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirect },
  });
  if (error) throw error;
  return true;
}

// Same-tab OTP flow: user types the 6-digit code from the email instead of
// clicking the link. Works because Supabase's default magic-link template
// includes `{{ .Token }}` alongside the confirmation URL.
async function verifyEmailCode(email: string, token: string) {
  if (!enabled || !client) throw new Error("Auth not configured");
  const { data, error } = await client.auth.verifyOtp({
    email,
    token: token.replace(/\s+/g, ""),
    type: "email",
  });
  if (error) throw error;
  return data;
}

async function signInWithGoogle() {
  if (!enabled || !client) throw new Error("Auth not configured");
  const redirect = window.location.origin + window.location.pathname;
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: redirect },
  });
  if (error) throw error;
  return true;
}

async function signOut() {
  if (!enabled || !client) return;
  await client.auth.signOut();
}

function getUser() {
  return currentUser;
}

function onAuthChange(cb: AuthSub) {
  subscribers.push(cb);
  try {
    cb(currentUser);
  } catch {
    // swallow — subscriber errors shouldn't break subscribe
  }
  return () => {
    const i = subscribers.indexOf(cb);
    if (i >= 0) subscribers.splice(i, 1);
  };
}

async function loadRemoteState(): Promise<StateSnapshot | null> {
  if (!enabled || !client || !currentUser) return null;
  const { data, error } = await client
    .from("user_progress")
    .select("state")
    .eq("user_id", currentUser.id)
    .maybeSingle();
  if (error) {
    console.warn("[BQAuth] load failed", error);
    return null;
  }
  return (data?.state as StateSnapshot) ?? null;
}

async function saveRemoteStateNow(state: StateSnapshot | null) {
  if (!enabled || !client || !currentUser || !state) return;
  // Detect first-time save (signup event) by probing for an existing row.
  let firstTime = false;
  {
    const { data } = await client
      .from("user_progress")
      .select("user_id")
      .eq("user_id", currentUser.id)
      .maybeSingle();
    firstTime = !data;
  }
  const { error } = await client
    .from("user_progress")
    .upsert(
      { user_id: currentUser.id, state, email: currentUser.email ?? null },
      { onConflict: "user_id" }
    );
  if (error) console.warn("[BQAuth] save failed", error);
  else if (firstTime) void logEvent("signup");
}

function saveRemoteState(state: StateSnapshot) {
  if (!enabled || !currentUser) return;
  pendingState = state;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void saveRemoteStateNow(pendingState);
    pendingState = null;
    saveTimer = null;
  }, 1500);
}

window.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && pendingState) {
    void saveRemoteStateNow(pendingState);
    pendingState = null;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  }
});

async function mergeLocalIntoRemote(localState: StateSnapshot | null) {
  if (!enabled || !currentUser || !localState) return null;
  const remote = await loadRemoteState();
  if (!remote) {
    await saveRemoteStateNow(localState);
    return localState;
  }
  const merged =
    ((localState as any).xp ?? 0) > ((remote as any).xp ?? 0)
      ? localState
      : remote;
  await saveRemoteStateNow(merged);
  return merged;
}

// ============================================================
// Question reports — Phase 0 correctness loop
// Any signed-in user can flag a question; admin reviews via /admin/reports.
// ============================================================

export type ReportReason =
  | "wrong_answer"
  | "wrong_explain"
  | "typo"
  | "ambiguous"
  | "other";

async function submitQuestionReport(opts: {
  qid: string;
  caseId?: string;
  reason: ReportReason;
  comment?: string;
}) {
  if (!enabled || !client) throw new Error("Auth not configured");
  if (!currentUser) throw new Error("Must be signed in to report");
  const comment = (opts.comment || "").slice(0, 1000);
  const { error } = await client.from("question_reports").insert({
    qid: opts.qid,
    case_id: opts.caseId ?? null,
    reason: opts.reason,
    comment: comment || null,
    user_id: currentUser.id,
    user_email: currentUser.email ?? null,
  });
  if (error) throw error;
  return true;
}

const ADMIN_EMAIL = "selcukorkmaz@gmail.com";

function isAdmin() {
  return Boolean(currentUser && currentUser.email === ADMIN_EMAIL);
}

// Fire-and-forget event log. Always fires (signed-in AND anonymous), so the
// admin dashboard can see guest activity and the guest→signup funnel.
// Safe on failure (swallows errors) — telemetry must not break user flow.
export type EventType =
  | "signup"
  | "session_start"
  | "case_start"
  | "case_complete"
  | "answer_correct"
  | "answer_wrong"
  | "report_filed"
  | "diagnostic_complete"
  | "diagnostic_skipped"
  | "guest_visit";

const VISITOR_KEY = "bq_visitor_id";

// GDPR gate — analytics events (incl. visitor_id, event log, guest_visit,
// landing_variant) are gated on explicit opt-in via the cookie-consent
// banner. Essential writes (Supabase session, guest progress, last email)
// are NOT gated — those are strictly necessary.
//
// Reads the banner's choice from window.bqConsent when available, or falls
// back to the raw localStorage key for early-boot timing before the consent
// script runs. Default: no consent ⇒ no analytics.
function hasAnalyticsConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const w = window as unknown as { bqConsent?: { hasAnalytics: () => boolean } };
    if (w.bqConsent && typeof w.bqConsent.hasAnalytics === "function") {
      return w.bqConsent.hasAnalytics();
    }
    const raw = window.localStorage.getItem("bq_cookie_consent");
    if (!raw) return false;
    const obj = JSON.parse(raw);
    return !!obj && obj.status === "all";
  } catch {
    return false;
  }
}

// Lazily create and persist a stable browser UUID. The ID survives sign-out
// and re-sign-in, which is what lets us join guest activity to the eventual
// account. Not PII on its own — but under GDPR a persistent pseudonymous
// identifier requires consent, so we gate creation and read on the consent
// flag. Returns null if the user hasn't opted in.
function getVisitorId(): string | null {
  if (typeof window === "undefined") return null;
  if (!hasAnalyticsConsent()) return null;
  try {
    let id = window.localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : `v_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
      window.localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

async function logEvent(type: EventType, opts?: {
  qid?: string;
  caseId?: string;
  method?: string;
  data?: Record<string, unknown>;
}) {
  try {
    if (!enabled || !client) return;
    // No analytics consent ⇒ no event logging, ever. We don't even leak
    // a row into the events table keyed by user_id — the consent covers
    // all activity analytics uniformly.
    if (!hasAnalyticsConsent()) return;
    const vid = getVisitorId();
    const row: Record<string, unknown> = {
      user_id: currentUser?.id ?? null,
      user_email: currentUser?.email ?? null,
      visitor_id: vid,
      type,
      qid: opts?.qid ?? null,
      case_id: opts?.caseId ?? null,
      method: opts?.method ?? null,
      data: opts?.data ?? {},
    };
    // Anon rows need visitor_id by RLS; if we couldn't produce one, skip.
    if (!currentUser && !vid) return;
    await client.from("events").insert(row);
  } catch {
    // Intentional: telemetry failures must not surface to the user.
  }
}

async function fetchRecentEvents(limit = 200) {
  if (!enabled || !client) return null;
  if (!isAdmin()) throw new Error("Admin only");
  const { data, error } = await client
    .from("events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

async function fetchEmailSignups() {
  if (!enabled || !client) return null;
  if (!isAdmin()) throw new Error("Admin only");
  const { data, error } = await client
    .from("email_signups")
    .select("id, email, source, created_at")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw error;
  return data;
}

async function setUserType(targetUserId: string, newType: "free" | "pro" | "institutional") {
  if (!enabled || !client) throw new Error("Auth not configured");
  if (!isAdmin()) throw new Error("Admin only");
  const { error } = await client.rpc("admin_set_user_type", {
    target_user_id: targetUserId,
    new_type: newType,
  });
  if (error) throw error;
  return true;
}

// ============================================================
// FSRS spaced repetition shims — called from src/lib/srs.ts
// ============================================================

// Build an in-memory method lookup once so _srsMasteryByMethod can aggregate
// stability by method without joining cases.ts at query time.
const METHOD_BY_QID: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  try {
    for (const c of CASES as any[]) {
      for (const q of c.bank || []) {
        if (q.qid && q.method) m[q.qid] = q.method;
      }
    }
  } catch {}
  return m;
})();

async function _srsGrade(qid: string, rating: Grade): Promise<Date | null> {
  if (!enabled || !client || !currentUser) return null;
  // Load any existing row
  const { data: existing } = await client
    .from("reviews")
    .select("stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state, last_reviewed, due_at")
    .eq("user_id", currentUser.id)
    .eq("qid", qid)
    .maybeSingle();
  const card = __SRS.rowToCard(existing as any);
  const now = new Date();
  const scheduling = __SRS.fsrs.repeat(card, now);
  // ts-fsrs v5 returns a RecordLog keyed by Rating (1-4); pull the picked one.
  const picked = (scheduling as any)[rating];
  const next = picked?.card as any;
  if (!next) return null;
  const row = __SRS.cardToRow(next, currentUser.id, qid, rating);
  const { error } = await client.from("reviews").upsert(row, { onConflict: "user_id,qid" });
  if (error) {
    console.warn("[srs] upsert failed", error);
    return null;
  }
  return next.due instanceof Date ? next.due : new Date(next.due);
}

async function _srsDueCount(): Promise<number> {
  if (!enabled || !client || !currentUser) return 0;
  const nowIso = new Date().toISOString();
  const { count, error } = await client
    .from("reviews")
    .select("*", { count: "exact", head: true })
    .eq("user_id", currentUser.id)
    .lte("due_at", nowIso);
  if (error) return 0;
  return count || 0;
}

async function _srsDueQids(limit = 20): Promise<string[]> {
  if (!enabled || !client || !currentUser) return [];
  const nowIso = new Date().toISOString();
  const { data, error } = await client
    .from("reviews")
    .select("qid, due_at")
    .eq("user_id", currentUser.id)
    .lte("due_at", nowIso)
    .order("due_at", { ascending: true })
    .limit(limit);
  if (error) return [];
  return (data || []).map((r: any) => r.qid);
}

async function _srsMasteryByMethod(): Promise<Record<string, { stability: number; count: number }>> {
  if (!enabled || !client || !currentUser) return {};
  const { data, error } = await client
    .from("reviews")
    .select("qid, stability")
    .eq("user_id", currentUser.id)
    .limit(5000);
  if (error || !data) return {};
  const agg: Record<string, { sum: number; count: number }> = {};
  for (const r of data as any[]) {
    const method = METHOD_BY_QID[r.qid];
    if (!method) continue;
    const bucket = agg[method] || { sum: 0, count: 0 };
    bucket.sum += Number(r.stability) || 0;
    bucket.count += 1;
    agg[method] = bucket;
  }
  const out: Record<string, { stability: number; count: number }> = {};
  for (const [m, { sum, count }] of Object.entries(agg)) {
    out[m] = { stability: count ? sum / count : 0, count };
  }
  return out;
}

async function fetchAllUsers() {
  if (!enabled || !client) return null;
  if (!isAdmin()) throw new Error("Admin only");
  const { data, error } = await client
    .from("user_progress")
    .select("user_id, email, user_type, state, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return data;
}

async function fetchReportsCount() {
  if (!enabled || !client) return null;
  if (!isAdmin()) throw new Error("Admin only");
  const { count, error } = await client
    .from("question_reports")
    .select("*", { count: "exact", head: true })
    .eq("status", "open");
  if (error) throw error;
  return count;
}

async function fetchQuestionReports(status?: string) {
  if (!enabled || !client) return null;
  if (!isAdmin()) throw new Error("Admin only");
  let query = client
    .from("question_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function updateQuestionReport(
  id: number,
  patch: { status?: string; resolution?: string }
) {
  if (!enabled || !client) throw new Error("Auth not configured");
  if (!isAdmin()) throw new Error("Admin only");
  const update: Record<string, unknown> = { ...patch };
  if (patch.status && patch.status !== "open") {
    update.resolved_at = new Date().toISOString();
  }
  const { error } = await client
    .from("question_reports")
    .update(update)
    .eq("id", id);
  if (error) throw error;
  return true;
}

// ============================================================
// Subscription state — read the user's current plan from user_progress.
// ============================================================
type Subscription = {
  user_type: "free" | "pro" | "institutional";
  status: string | null;           // 'active' | 'trialing' | 'past_due' | ...
  priceId: string | null;
  currentPeriodEnd: string | null; // ISO date
  customerId: string | null;
};

async function fetchSubscription(): Promise<Subscription | null> {
  if (!enabled || !client || !currentUser) return null;
  const { data, error } = await client
    .from("user_progress")
    .select("user_type, stripe_subscription_status, stripe_price_id, stripe_current_period_end, stripe_customer_id")
    .eq("user_id", currentUser.id)
    .maybeSingle();
  if (error || !data) return null;
  return {
    user_type: (data.user_type as any) || "free",
    status: (data as any).stripe_subscription_status ?? null,
    priceId: (data as any).stripe_price_id ?? null,
    currentPeriodEnd: (data as any).stripe_current_period_end ?? null,
    customerId: (data as any).stripe_customer_id ?? null,
  };
}

async function fetchLeaderboard(limit = 50) {
  if (!enabled || !client) return null;
  const { data, error } = await client
    .from("leaderboard")
    .select("name, xp, streak, best_streak, cases, updated_at")
    .order("xp", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[BQAuth] leaderboard fetch failed", error);
    return null;
  }
  return data || [];
}

export const BQAuth = {
  enabled,
  init,
  signInWithEmail,
  verifyEmailCode,
  signInWithGoogle,
  signOut,
  getUser,
  onAuthChange,
  loadRemoteState,
  saveRemoteState,
  saveRemoteStateNow,
  mergeLocalIntoRemote,
  fetchLeaderboard,
  submitQuestionReport,
  isAdmin,
  fetchQuestionReports,
  updateQuestionReport,
  fetchAllUsers,
  fetchReportsCount,
  fetchSubscription,
  logEvent,
  getVisitorId,
  fetchRecentEvents,
  fetchEmailSignups,
  setUserType,
  // FSRS shims — used by src/lib/srs.ts
  _srsGrade,
  _srsDueCount,
  _srsDueQids,
  _srsMasteryByMethod,
};

declare global {
  interface Window {
    BQAuth: typeof BQAuth;
    __SUPABASE_URL?: string;
    __SUPABASE_ANON_KEY?: string;
  }
}

window.BQAuth = BQAuth;
