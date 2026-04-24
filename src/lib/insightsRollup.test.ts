import { describe, it, expect } from "vitest";
import { rollupBranches } from "./insightsRollup";

describe("rollupBranches (Phase 3 branch attribution fix)", () => {
  it("attributes a method to its branch via METHOD_BRANCH", () => {
    const out = rollupBranches([
      { method: "cox_ph", attempts: 10, correct: 7 },
    ]);
    expect(out.get("regression")).toEqual({ attempts: 10, correct: 7 });
  });

  it("sums multiple methods within the same branch", () => {
    const out = rollupBranches([
      { method: "lm", attempts: 10, correct: 8 },
      { method: "logistic", attempts: 5, correct: 3 },
      { method: "cox_ph", attempts: 4, correct: 1 },
    ]);
    expect(out.get("regression")).toEqual({ attempts: 19, correct: 12 });
  });

  // The bug Phase 3 fixes: methods naturally belonging to a different
  // branch must NOT be attributed to whatever branch their host case
  // happens to be in. With per-method attribution this is automatic —
  // we never see the case_id at all.
  it("attributes cox_ph answers to regression even when surfaced inside an advanced_bayesian case", () => {
    // Imagine the live data has 3 answer events: all on cox_ph questions,
    // all in cases tagged advanced_bayesian. Old per-case attribution
    // would have summed these under advanced_bayesian. New per-method
    // attribution puts them under regression.
    const out = rollupBranches([
      { method: "cox_ph", attempts: 3, correct: 1 },
    ]);
    expect(out.get("regression")?.attempts).toBe(3);
    expect(out.get("advanced_bayesian")).toBeUndefined();
  });

  it("silently drops unknown methods (defensive)", () => {
    const out = rollupBranches([
      { method: "lm", attempts: 5, correct: 4 },
      { method: "unknown_method_added_in_data_drift", attempts: 99, correct: 99 },
    ]);
    expect(out.get("regression")).toEqual({ attempts: 5, correct: 4 });
    // Total attempts in any bucket should NOT include the unknown row.
    let total = 0;
    for (const v of out.values()) total += v.attempts;
    expect(total).toBe(5);
  });

  it("handles empty input", () => {
    expect(rollupBranches([]).size).toBe(0);
  });
});
