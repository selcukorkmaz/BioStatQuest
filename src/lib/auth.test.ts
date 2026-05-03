// @vitest-environment jsdom
// Smoke tests for the auth module's public surface — specifically the F2
// telemetry hook. The full Supabase round-trip is integration-tested in
// the live app; here we lock in the contract that:
//
//   1. logQuestionAttempt is exported and callable.
//   2. It returns a Promise (caller always awaits or `void`s it).
//   3. With no Supabase configured (no env vars in test env), it is a
//      silent no-op — never throws, never blocks the play loop.
//
// The play-loop instrumentation in CasePlay.tsx assumes (3): if telemetry
// can throw, every wrong answer breaks the reveal. Guard that.

import { describe, it, expect } from "vitest";
import { BQAuth } from "./auth";

describe("BQAuth.logQuestionAttempt (F2 telemetry hook)", () => {
  it("is exported on BQAuth", () => {
    expect(typeof BQAuth.logQuestionAttempt).toBe("function");
  });

  it("returns a Promise that resolves (no throw) when Supabase is not configured", async () => {
    // No VITE_SUPABASE_URL in test env → enabled=false → fast no-op path.
    const p = BQAuth.logQuestionAttempt({
      qid: "f1_0",
      caseId: "f1",
      qType: "mcq",
      chosen: 2,
      correct: false,
      msToAnswer: 1234,
      timedOut: false,
      misconceptionTag: "ordered_integers_treated_as_continuous",
      difficulty: "intern",
      runId: "test-run",
    });
    expect(p).toBeInstanceOf(Promise);
    await expect(p).resolves.toBeUndefined();
  });

  it("tolerates the timeout path (chosen=null, correct=false, timedOut=true)", async () => {
    await expect(
      BQAuth.logQuestionAttempt({
        qid: "f1_3",
        caseId: "f1",
        qType: "numeric",
        chosen: null,
        correct: false,
        timedOut: true,
        msToAnswer: null,
        difficulty: "intern",
        runId: "test-run",
      })
    ).resolves.toBeUndefined();
  });

  it("tolerates a multi-select payload (chosen as number[])", async () => {
    await expect(
      BQAuth.logQuestionAttempt({
        qid: "f2_5",
        caseId: "f2",
        qType: "multi",
        chosen: [0, 2, 3],
        correct: false,
        msToAnswer: 8000,
        timedOut: false,
        difficulty: "resident",
        runId: "test-run",
      })
    ).resolves.toBeUndefined();
  });

  it("never throws even with an empty/invalid payload", async () => {
    // Defensive: telemetry must not break the play loop, period.
    await expect(
      BQAuth.logQuestionAttempt({
        qid: "",
        caseId: "",
        qType: "mcq",
        chosen: 0,
        correct: true,
      } as any)
    ).resolves.toBeUndefined();
  });
});

describe("BQAuth.fetchMyMisconceptions (F8 ledger API)", () => {
  it("is exported on BQAuth", () => {
    expect(typeof BQAuth.fetchMyMisconceptions).toBe("function");
  });

  it("returns an empty object when Supabase is not configured", async () => {
    const result = await BQAuth.fetchMyMisconceptions();
    expect(result).toEqual({});
  });

  it("never throws — repeat-chip lookup must degrade silently", async () => {
    await expect(BQAuth.fetchMyMisconceptions()).resolves.toBeDefined();
  });
});

describe("BQAuth.fetchMyMisconceptionHistory (F8 Pro per-tag drill-down)", () => {
  it("is exported on BQAuth", () => {
    expect(typeof BQAuth.fetchMyMisconceptionHistory).toBe("function");
  });

  it("returns an empty array when Supabase is not configured", async () => {
    await expect(BQAuth.fetchMyMisconceptionHistory("any_tag")).resolves.toEqual([]);
  });

  it("returns an empty array when called with empty tag", async () => {
    await expect(BQAuth.fetchMyMisconceptionHistory("")).resolves.toEqual([]);
  });

  it("never throws — drill-down expand must degrade silently", async () => {
    await expect(BQAuth.fetchMyMisconceptionHistory("any_tag", 50)).resolves.toBeDefined();
    await expect(BQAuth.fetchMyMisconceptionHistory("any_tag", 9999)).resolves.toBeDefined();
  });
});

describe("BQAuth admin telemetry APIs (S — admin dashboard)", () => {
  it("exports adminFetchTopMisconceptions and adminFetchQuestionStats", () => {
    expect(typeof BQAuth.adminFetchTopMisconceptions).toBe("function");
    expect(typeof BQAuth.adminFetchQuestionStats).toBe("function");
  });

  it("returns an empty array when Supabase is not configured (no admin gate triggered)", async () => {
    // With no client, both functions return [] before reaching the isAdmin gate.
    // This means a misconfigured deploy degrades silently to empty tables in
    // the admin UI rather than throwing.
    const tags = await BQAuth.adminFetchTopMisconceptions(30);
    const stats = await BQAuth.adminFetchQuestionStats(30, 5);
    expect(tags).toEqual([]);
    expect(stats).toEqual([]);
  });
});
