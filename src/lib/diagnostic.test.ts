import { describe, it, expect } from "vitest";
import {
  scoreDiagnostic,
  buildStudyPath,
  recommendedDifficultyFromBand,
  bandLabel,
  type DiagnosticAnswer,
} from "./diagnostic";

// Tiny synthetic case bank — keeps the tests independent of changes to
// the real CASES file. buildStudyPath accepts an injected bank.
const TEST_CASES = [
  { id: "f1", branch: "foundations" },
  { id: "f2", branch: "foundations" },
  { id: "p1", branch: "probability" },
  { id: "r1", branch: "regression" },
  { id: "r2", branch: "regression" },
  { id: "c1", branch: "causal" },
];

const a = (branch: string, correct: boolean): DiagnosticAnswer => ({ branch, correct });

describe("scoreDiagnostic", () => {
  it("computes per-branch correct/total", () => {
    const profile = scoreDiagnostic([
      a("foundations", true),
      a("foundations", false),
      a("regression", true),
    ]);
    expect(profile.byBranch.foundations).toEqual({ correct: 1, total: 2 });
    expect(profile.byBranch.regression).toEqual({ correct: 1, total: 1 });
    expect(profile.totalAnswered).toBe(3);
    expect(profile.totalCorrect).toBe(2);
  });

  it("classifies bands at the documented thresholds", () => {
    // <40% → emerging
    expect(scoreDiagnostic([a("x", false), a("x", false), a("x", false)]).band).toBe("emerging");
    // exactly 40% (2/5) — boundary lands above 0.4 due to <0.4 cutoff
    expect(scoreDiagnostic([a("x", true), a("x", true), a("x", false), a("x", false), a("x", false)]).band).toBe("developing");
    // 60% → developing
    expect(scoreDiagnostic([a("x", true), a("x", true), a("x", true), a("x", false), a("x", false)]).band).toBe("developing");
    // 70% → strong
    expect(scoreDiagnostic([a("x", true), a("x", true), a("x", true), a("x", true), a("x", true), a("x", true), a("x", true), a("x", false), a("x", false), a("x", false)]).band).toBe("strong");
  });

  it("returns 0% / emerging for empty input", () => {
    const profile = scoreDiagnostic([]);
    expect(profile.overallPct).toBe(0);
    expect(profile.band).toBe("emerging");
    expect(profile.totalAnswered).toBe(0);
  });
});

describe("buildStudyPath", () => {
  it("returns empty path when no profile or no scored branches", () => {
    expect(buildStudyPath(null, null, TEST_CASES)).toEqual([]);
    expect(buildStudyPath(undefined as any, null, TEST_CASES)).toEqual([]);
    const emptyProfile = scoreDiagnostic([]);
    expect(buildStudyPath(emptyProfile, null, TEST_CASES)).toEqual([]);
  });

  it("recommends the two weakest branches as 'gap' steps", () => {
    // foundations 0/3, regression 1/3, causal 3/3
    const profile = scoreDiagnostic([
      a("foundations", false), a("foundations", false), a("foundations", false),
      a("regression", true), a("regression", false), a("regression", false),
      a("causal", true), a("causal", true), a("causal", true),
    ]);
    const path = buildStudyPath(profile, { completed: [] }, TEST_CASES);

    // Two weakest → gap; strongest → strength
    expect(path.length).toBe(3);
    expect(path[0].branch).toBe("foundations");
    expect(path[0].kind).toBe("gap");
    expect(path[1].branch).toBe("regression");
    expect(path[1].kind).toBe("gap");
    expect(path[2].branch).toBe("causal");
    expect(path[2].kind).toBe("strength");
  });

  it("prefers cases the user has not completed yet", () => {
    const profile = scoreDiagnostic([
      a("foundations", false), a("foundations", false),
    ]);
    // f1 already done — should pick f2 instead
    const path = buildStudyPath(profile, { completed: ["f1"] }, TEST_CASES);
    expect(path[0].caseId).toBe("f2");
  });

  it("falls back to first case in branch when all are completed", () => {
    const profile = scoreDiagnostic([a("foundations", false)]);
    const path = buildStudyPath(profile, { completed: ["f1", "f2"] }, TEST_CASES);
    // Both completed — falls back to first-in-branch (f1)
    expect(path[0].caseId).toBe("f1");
  });

  it("does not duplicate a case across gap + strength when the same branch ranks both", () => {
    // Only one branch scored — it's both weakest and strongest.
    const profile = scoreDiagnostic([a("foundations", true), a("foundations", false)]);
    const path = buildStudyPath(profile, { completed: [] }, TEST_CASES);
    const ids = path.map((p) => p.caseId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is deterministic — same profile + state yields the same path", () => {
    const profile = scoreDiagnostic([
      a("foundations", false), a("regression", true), a("causal", true), a("causal", true),
    ]);
    const p1 = buildStudyPath(profile, { completed: [] }, TEST_CASES);
    const p2 = buildStudyPath(profile, { completed: [] }, TEST_CASES);
    expect(p1).toEqual(p2);
  });
});

describe("recommendedDifficultyFromBand", () => {
  it("strong band → resident, others → intern", () => {
    expect(recommendedDifficultyFromBand("strong")).toBe("resident");
    expect(recommendedDifficultyFromBand("developing")).toBe("intern");
    expect(recommendedDifficultyFromBand("emerging")).toBe("intern");
  });
});

describe("bandLabel", () => {
  it("returns capitalized band labels", () => {
    expect(bandLabel("strong")).toBe("Strong");
    expect(bandLabel("developing")).toBe("Developing");
    expect(bandLabel("emerging")).toBe("Emerging");
  });
});
