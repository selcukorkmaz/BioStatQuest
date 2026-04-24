import { describe, it, expect } from "vitest";
import { ymdToday, ymdYesterday, bumpDailyStreak, bumpReviewStreak, type StreakState } from "./streak";

const empty: StreakState = {};

// Use explicit `now` arguments throughout so tests are deterministic
// regardless of the runner's clock or timezone-of-the-moment. The current
// implementation reads local-date YYYY-MM-DD; Phase 3 of the master plan
// migrates this to UTC.

describe("ymdToday / ymdYesterday", () => {
  it("formats local date as YYYY-MM-DD with zero-padded month/day", () => {
    const d = new Date(2026, 0, 5, 12, 0, 0); // Jan 5 2026
    expect(ymdToday(d)).toBe("2026-01-05");
  });

  it("ymdYesterday is one day earlier", () => {
    const d = new Date(2026, 4, 1, 12, 0, 0); // May 1 2026
    expect(ymdToday(d)).toBe("2026-05-01");
    expect(ymdYesterday(d)).toBe("2026-04-30");
  });

  it("handles year boundaries", () => {
    const d = new Date(2026, 0, 1, 12, 0, 0); // Jan 1 2026
    expect(ymdYesterday(d)).toBe("2025-12-31");
  });
});

describe("bumpDailyStreak", () => {
  const today = new Date(2026, 5, 15, 12, 0, 0); // Jun 15 2026
  const todayStr = ymdToday(today);
  const yestStr = ymdYesterday(today);

  it("starts a streak at 1 from empty state", () => {
    const next = bumpDailyStreak(empty, today);
    expect(next.dailyStreak).toBe(1);
    expect(next.dailyStreakBest).toBe(1);
    expect(next.lastActivityDate).toBe(todayStr);
  });

  it("is idempotent on the same day (no double-bump)", () => {
    // Regression test for the streak-double-bump worry. This is THE most
    // important streak invariant: if the user does two activities in one
    // day, the streak doesn't go up twice.
    const after1 = bumpDailyStreak(empty, today);
    const after2 = bumpDailyStreak(after1, today);
    expect(after2.dailyStreak).toBe(1);
    expect(after2).toBe(after1); // returns same reference when no-op
  });

  it("continues a streak when previous activity was yesterday", () => {
    const prev = { dailyStreak: 5, dailyStreakBest: 5, lastActivityDate: yestStr };
    const next = bumpDailyStreak(prev, today);
    expect(next.dailyStreak).toBe(6);
    expect(next.dailyStreakBest).toBe(6);
  });

  it("resets to 1 on a gap of more than one day", () => {
    const twoDaysAgo = "2026-06-13";
    const prev = { dailyStreak: 12, dailyStreakBest: 12, lastActivityDate: twoDaysAgo };
    const next = bumpDailyStreak(prev, today);
    expect(next.dailyStreak).toBe(1);
    expect(next.dailyStreakBest).toBe(12); // best preserved
  });

  it("preserves dailyStreakBest when current run is shorter", () => {
    const prev = { dailyStreak: 1, dailyStreakBest: 100, lastActivityDate: yestStr };
    const next = bumpDailyStreak(prev, today);
    expect(next.dailyStreak).toBe(2);
    expect(next.dailyStreakBest).toBe(100);
  });
});

describe("bumpReviewStreak", () => {
  const today = new Date(2026, 5, 15, 12, 0, 0);
  const yestStr = ymdYesterday(today);

  it("tracks reviewStreak independently of dailyStreak", () => {
    const prev = {
      dailyStreak: 9, dailyStreakBest: 9, lastActivityDate: ymdToday(today),
      reviewStreak: 3, reviewStreakBest: 3, lastReviewDate: yestStr,
    };
    const next = bumpReviewStreak(prev, today);
    expect(next.reviewStreak).toBe(4);
    expect(next.dailyStreak).toBe(9); // untouched
  });

  it("is idempotent on the same day", () => {
    const after1 = bumpReviewStreak(empty, today);
    const after2 = bumpReviewStreak(after1, today);
    expect(after2).toBe(after1);
  });
});
