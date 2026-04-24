// Daily-streak helpers, extracted from App.tsx for testability.
//
// Two streaks live in user state:
//   • dailyStreak — bumps on ANY activity (case complete, diagnostic, review)
//   • reviewStreak — bumps only on review sessions (Anki-style "study streak")
//
// Both use local-date YYYY-MM-DD keys. Note: Phase 3 of the master plan
// migrates these to UTC strings to avoid timezone-change double-bumps; for
// now we preserve the existing behavior so this extraction is a pure
// no-op refactor. The streak-test suite will cover both the current
// local-date semantics and the future UTC semantics once that change lands.

export type StreakState = {
  dailyStreak?: number;
  dailyStreakBest?: number;
  lastActivityDate?: string;
  reviewStreak?: number;
  reviewStreakBest?: number;
  lastReviewDate?: string;
};

/** YYYY-MM-DD in the runtime's local timezone. */
export function ymdToday(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** YYYY-MM-DD for "yesterday" in the runtime's local timezone. */
export function ymdYesterday(now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
