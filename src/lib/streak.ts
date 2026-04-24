// Daily-streak helpers, extracted from App.tsx for testability.
//
// Two streaks live in user state:
//   • dailyStreak — bumps on ANY activity (case complete, diagnostic, review)
//   • reviewStreak — bumps only on review sessions (Anki-style "study streak")
//
// Streak day keys are YYYY-MM-DD in **UTC** (not local time). Phase 3 of
// the master plan migrated this from local time because:
//
//   1. A user travelling east loses a streak day they earned ("today" in
//      Pacific becomes "tomorrow" in Tokyo, but their lastActivityDate
//      still says yesterday-local — the comparison fails).
//   2. A user travelling west gets an unearned bump (the reverse).
//   3. Even without travel, daylight-savings transitions silently shift
//      the day boundary by an hour twice a year.
//
// Migration: existing user state has `lastActivityDate` written in their
// then-current local TZ. After this change those values are compared
// against UTC. For most users the migration day produces at most one
// anomalous outcome (a bump that shouldn't happen, or a one-day reset),
// then converges to correct UTC behavior. We accept that one-time blip
// rather than ship a timezone-aware backfill that's even more error-prone.

export type StreakState = {
  dailyStreak?: number;
  dailyStreakBest?: number;
  lastActivityDate?: string;
  reviewStreak?: number;
  reviewStreakBest?: number;
  lastReviewDate?: string;
};

/** YYYY-MM-DD in **UTC**. Day-key for streak math. */
export function ymdToday(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
}

/** YYYY-MM-DD for "yesterday" in **UTC**. */
export function ymdYesterday(now: Date = new Date()): string {
  const d = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/**
 * Bump the all-activity streak. Idempotent within a single day. Resets to 1
 * when the gap from the last activity is more than one day.
 */
export function bumpDailyStreak<T extends StreakState>(state: T, now: Date = new Date()): T {
  const today = ymdToday(now);
  if (state.lastActivityDate === today) return state;
  const continued = state.lastActivityDate === ymdYesterday(now);
  const nextStreak = continued ? (state.dailyStreak || 0) + 1 : 1;
  return {
    ...state,
    dailyStreak: nextStreak,
    dailyStreakBest: Math.max(state.dailyStreakBest || 0, nextStreak),
    lastActivityDate: today,
  };
}

/**
 * Bump the review-only streak. Same rules as the daily streak but tracked
 * separately on `reviewStreak` / `lastReviewDate`.
 */
export function bumpReviewStreak<T extends StreakState>(state: T, now: Date = new Date()): T {
  const today = ymdToday(now);
  if (state.lastReviewDate === today) return state;
  const continued = state.lastReviewDate === ymdYesterday(now);
  const nextStreak = continued ? (state.reviewStreak || 0) + 1 : 1;
  return {
    ...state,
    reviewStreak: nextStreak,
    reviewStreakBest: Math.max(state.reviewStreakBest || 0, nextStreak),
    lastReviewDate: today,
  };
}
