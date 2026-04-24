import { describe, it, expect } from "vitest";
import { ymdToday, ymdYesterday, bumpDailyStreak, bumpReviewStreak, type StreakState } from "./streak";

const empty: StreakState = {};

// All tests use ISO UTC timestamps (`new Date("...Z")`) so the assertions
// don't depend on the runner's local timezone. Phase 3 migrated streak
// math from local time to UTC — these tests would have been timezone-
// flaky under the old implementation.

describe("ymdToday / ymdYesterday (UTC)", () => {
  it("formats UTC date as YYYY-MM-DD with zero-padded month/day", () => {
    expect(ymdToday(new Date("2026-01-05T12:00:00Z"))).toBe("2026-01-05");
  });

  it("uses UTC date even when local time has wrapped", () => {
    // 2026-04-26 02:00 UTC. Local time in Auckland (UTC+12) is 14:00 same day;
    // local time in LA (UTC-8) is 18:00 the previous day. UTC must win.
    expect(ymdToday(new Date("2026-04-26T02:00:00Z"))).toBe("2026-04-26");
  });

  it("ymdYesterday is one calendar day earlier in UTC", () => {
    expect(ymdYesterday(new Date("2026-05-01T12:00:00Z"))).toBe("2026-04-30");
  });

  it("handles year boundaries in UTC", () => {
    expect(ymdYesterday(new Date("2026-01-01T00:30:00Z"))).toBe("2025-12-31");
    expect(ymdToday(new Date("2026-12-31T23:30:00Z"))).toBe("2026-12-31");
  });

  it("handles month boundaries in UTC", () => {
    expect(ymdYesterday(new Date("2026-03-01T12:00:00Z"))).toBe("2026-02-28");
    expect(ymdYesterday(new Date("2024-03-01T12:00:00Z"))).toBe("2024-02-29"); // leap
  });
});

describe("bumpDailyStreak", () => {
  const today = new Date("2026-06-15T12:00:00Z");
  const todayStr = "2026-06-15";
  const yestStr = "2026-06-14";

  it("starts a streak at 1 from empty state", () => {
    const next = bumpDailyStreak(empty, today);
    expect(next.dailyStreak).toBe(1);
    expect(next.dailyStreakBest).toBe(1);
    expect(next.lastActivityDate).toBe(todayStr);
  });

  it("is idempotent on the same UTC day (no double-bump)", () => {
    const after1 = bumpDailyStreak(empty, today);
    const after2 = bumpDailyStreak(after1, today);
    expect(after2.dailyStreak).toBe(1);
    expect(after2).toBe(after1);
  });

  it("continues a streak when previous activity was yesterday UTC", () => {
    const prev = { dailyStreak: 5, dailyStreakBest: 5, lastActivityDate: yestStr };
    const next = bumpDailyStreak(prev, today);
    expect(next.dailyStreak).toBe(6);
    expect(next.dailyStreakBest).toBe(6);
  });

  it("resets to 1 on a gap of more than one UTC day", () => {
    const prev = { dailyStreak: 12, dailyStreakBest: 12, lastActivityDate: "2026-06-13" };
    const next = bumpDailyStreak(prev, today);
    expect(next.dailyStreak).toBe(1);
    expect(next.dailyStreakBest).toBe(12);
  });

  it("preserves dailyStreakBest when current run is shorter", () => {
    const prev = { dailyStreak: 1, dailyStreakBest: 100, lastActivityDate: yestStr };
    const next = bumpDailyStreak(prev, today);
    expect(next.dailyStreak).toBe(2);
    expect(next.dailyStreakBest).toBe(100);
  });

  // Regression coverage for the bug Phase 3 fixed: under the old local-date
  // implementation, a user travelling between timezones could lose or
  // double-count streak days. The UTC-keyed implementation must give the
  // same result regardless of the user's wall-clock TZ.
  describe("timezone-change behavior", () => {
    it("does not double-bump when the user crosses midnight eastward", () => {
      // Day 1: 23:30 UTC on Jun 15 (afternoon in LA, late evening in NY).
      // User logs activity → streak 1 / lastActivityDate = 2026-06-15.
      // Day 1.5: 02:30 UTC on Jun 16 (still same calendar day in LA but
      // already next day in NY/UTC). User logs another activity.
      // Old (local-date) behavior in NY: lastActivityDate was the local
      // Jun 15, today-local is Jun 16 → bump (2 streak). But UTC says
      // it's already next day, so the bump is "earned." Under the new
      // UTC scheme: lastActivityDate "2026-06-15" + today UTC "2026-06-16"
      // → bump to 2. Test that it's exactly one bump, not two.
      const t1 = new Date("2026-06-15T23:30:00Z");
      const t2 = new Date("2026-06-16T02:30:00Z");
      const after1 = bumpDailyStreak(empty, t1);
      const after2 = bumpDailyStreak(after1, t2);
      const after3 = bumpDailyStreak(after2, t2); // immediate re-bump
      expect(after1.dailyStreak).toBe(1);
      expect(after2.dailyStreak).toBe(2);
      expect(after3.dailyStreak).toBe(2); // idempotent
    });

    it("does not lose a streak day when the user crosses midnight westward", () => {
      // User logs at 09:00 UTC Jun 15 → streak 5 / lastActivityDate
      // 2026-06-15. Next activity at 22:00 UTC Jun 15 (same UTC day).
      // Whether the user has flown west and their wall clock now shows
      // late evening Jun 14, UTC still says Jun 15 — no spurious reset.
      const prev = { dailyStreak: 5, dailyStreakBest: 5, lastActivityDate: "2026-06-15" };
      const sameDay = new Date("2026-06-15T22:00:00Z");
      const next = bumpDailyStreak(prev, sameDay);
      expect(next.dailyStreak).toBe(5); // idempotent — same UTC day
      expect(next).toBe(prev);
    });

    it("DST transition: bumping twice across the spring-forward hour stays idempotent", () => {
      // US spring-forward in 2026 is Mar 8. Under local-date the hour
      // 02:00–03:00 doesn't exist in Eastern Time, but UTC marches on.
      // 06:30 UTC and 08:30 UTC on Mar 8 are both still Mar 8 UTC.
      const t1 = new Date("2026-03-08T06:30:00Z");
      const t2 = new Date("2026-03-08T08:30:00Z");
      const a = bumpDailyStreak(empty, t1);
      const b = bumpDailyStreak(a, t2);
      expect(b.dailyStreak).toBe(1);
      expect(b).toBe(a);
    });
  });
});

describe("bumpReviewStreak", () => {
  const today = new Date("2026-06-15T12:00:00Z");
  const yestStr = "2026-06-14";

  it("tracks reviewStreak independently of dailyStreak", () => {
    const prev = {
      dailyStreak: 9, dailyStreakBest: 9, lastActivityDate: ymdToday(today),
      reviewStreak: 3, reviewStreakBest: 3, lastReviewDate: yestStr,
    };
    const next = bumpReviewStreak(prev, today);
    expect(next.reviewStreak).toBe(4);
    expect(next.dailyStreak).toBe(9);
  });

  it("is idempotent on the same UTC day", () => {
    const after1 = bumpReviewStreak(empty, today);
    const after2 = bumpReviewStreak(after1, today);
    expect(after2).toBe(after1);
  });
});
