// Pure-logic tests for the F9 exam library. The UI runs on top of these
// primitives; if these are right, the view's job is just rendering.

import { describe, it, expect, beforeEach } from "vitest";
import {
  buildExamPool,
  pickExamQuestions,
  gradeAnswer,
  scoreExam,
  getBranchBreakdown,
  getExamHistory,
  recordExamStart,
  examsTakenInLast30Days,
  getExamQuota,
  makeMemoryStorage,
  type ExamQuestion,
  type ExamAnswer,
  type StorageLike,
} from "./exam";

let store: StorageLike;

beforeEach(() => {
  store = makeMemoryStorage();
});

describe("exam — buildExamPool", () => {
  it("returns a non-empty list spanning multiple branches", () => {
    const pool = buildExamPool();
    expect(pool.length).toBeGreaterThan(50);
    const branches = new Set(pool.map((p) => p.branch));
    expect(branches.size).toBeGreaterThan(1);
  });

  it("filters by branch when requested", () => {
    const pool = buildExamPool({ branches: ["foundations"] });
    expect(pool.length).toBeGreaterThan(0);
    for (const p of pool) expect(p.branch).toBe("foundations");
  });

  it("returns empty when filter matches no branch", () => {
    const pool = buildExamPool({ branches: ["__no_such_branch__"] });
    expect(pool).toEqual([]);
  });
});

describe("exam — pickExamQuestions (seeded determinism)", () => {
  it("returns N items (or fewer if pool is smaller)", () => {
    const got = pickExamQuestions(20, { seed: 1 });
    expect(got.length).toBe(20);
  });

  it("is deterministic given the same seed", () => {
    const a = pickExamQuestions(15, { seed: 42 });
    const b = pickExamQuestions(15, { seed: 42 });
    expect(a.map((q) => q.qid)).toEqual(b.map((q) => q.qid));
  });

  it("differs across seeds (extremely high probability)", () => {
    const a = pickExamQuestions(15, { seed: 1 });
    const b = pickExamQuestions(15, { seed: 2 });
    expect(a.map((q) => q.qid)).not.toEqual(b.map((q) => q.qid));
  });

  it("never repeats a qid within one pick", () => {
    const got = pickExamQuestions(30, { seed: 1 });
    const ids = got.map((q) => q.qid);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("respects the branch filter", () => {
    const got = pickExamQuestions(10, { seed: 1, branches: ["foundations"] });
    for (const q of got) expect(q.branch).toBe("foundations");
  });
});

describe("exam — gradeAnswer", () => {
  const mcq: ExamQuestion = { qid: "x_0", caseId: "x", branch: "foundations", type: "mcq", q: "?", options: ["a","b","c"], answer: 1, explain: "", method: "m" };
  const multi: ExamQuestion = { qid: "x_1", caseId: "x", branch: "foundations", type: "multi", q: "?", options: ["a","b","c","d"], answer: [0,2], explain: "", method: "m" };
  const num: ExamQuestion = { qid: "x_2", caseId: "x", branch: "foundations", type: "numeric", q: "?", answer: 7, tol: 0.5, explain: "", method: "m" };

  it("mcq: matches exact index", () => {
    expect(gradeAnswer(mcq, 1)).toBe(true);
    expect(gradeAnswer(mcq, 0)).toBe(false);
    expect(gradeAnswer(mcq, null)).toBe(false);
  });

  it("multi: order-insensitive set match", () => {
    expect(gradeAnswer(multi, [0, 2])).toBe(true);
    expect(gradeAnswer(multi, [2, 0])).toBe(true);
    expect(gradeAnswer(multi, [0])).toBe(false);
    expect(gradeAnswer(multi, [0, 1, 2])).toBe(false);
  });

  it("numeric: respects tolerance", () => {
    expect(gradeAnswer(num, 7)).toBe(true);
    expect(gradeAnswer(num, 7.4)).toBe(true);
    expect(gradeAnswer(num, 7.6)).toBe(false);
    expect(gradeAnswer(num, "7.2")).toBe(true);
    expect(gradeAnswer(num, "")).toBe(false);
  });
});

describe("exam — scoreExam", () => {
  it("0/0 → 0% accuracy without throwing", () => {
    expect(scoreExam([])).toEqual({ n: 0, correct: 0, accuracy: 0 });
  });

  it("all correct → 100%", () => {
    const a: ExamAnswer[] = [
      { qid: "1", branch: "x", picked: 0, correct: true },
      { qid: "2", branch: "x", picked: 0, correct: true },
    ];
    expect(scoreExam(a)).toEqual({ n: 2, correct: 2, accuracy: 1 });
  });

  it("mixed → fraction", () => {
    const a: ExamAnswer[] = [
      { qid: "1", branch: "x", picked: 0, correct: true },
      { qid: "2", branch: "x", picked: 0, correct: false },
      { qid: "3", branch: "x", picked: 0, correct: false },
      { qid: "4", branch: "x", picked: 0, correct: true },
    ];
    expect(scoreExam(a).accuracy).toBeCloseTo(0.5, 5);
  });
});

describe("exam — getBranchBreakdown", () => {
  it("groups by branch and computes per-branch accuracy", () => {
    const a: ExamAnswer[] = [
      { qid: "1", branch: "foundations", picked: 0, correct: true },
      { qid: "2", branch: "foundations", picked: 0, correct: false },
      { qid: "3", branch: "regression",  picked: 0, correct: true },
      { qid: "4", branch: "regression",  picked: 0, correct: true },
    ];
    const out = getBranchBreakdown(a);
    expect(out).toHaveLength(2);
    const f = out.find((r) => r.branch === "foundations")!;
    const r = out.find((r) => r.branch === "regression")!;
    expect(f.accuracy).toBe(0.5);
    expect(r.accuracy).toBe(1);
  });

  it("sorts weakest branch first (ascending accuracy)", () => {
    const a: ExamAnswer[] = [
      { qid: "1", branch: "foundations", picked: 0, correct: true },
      { qid: "2", branch: "foundations", picked: 0, correct: true },
      { qid: "3", branch: "regression",  picked: 0, correct: false },
    ];
    const out = getBranchBreakdown(a);
    expect(out[0].branch).toBe("regression");
    expect(out[1].branch).toBe("foundations");
  });
});

describe("exam — quota helpers (with injected in-memory storage)", () => {
  it("starts with no history", () => {
    expect(getExamHistory(store)).toEqual([]);
    expect(examsTakenInLast30Days(new Date(), store)).toBe(0);
  });

  it("recordExamStart appends to history", () => {
    recordExamStart(new Date("2026-05-01T12:00:00Z"), store);
    recordExamStart(new Date("2026-05-02T12:00:00Z"), store);
    const h = getExamHistory(store);
    expect(h).toHaveLength(2);
    expect(h[0].startedAt).toBe("2026-05-01T12:00:00.000Z");
  });

  it("examsTakenInLast30Days counts only recent entries", () => {
    recordExamStart(new Date("2025-01-01T00:00:00Z"), store); // very old
    recordExamStart(new Date(),                         store); // today
    expect(examsTakenInLast30Days(new Date(), store)).toBe(1);
  });

  it("getExamQuota: Pro users have unlimited quota", () => {
    recordExamStart(new Date(), store);
    recordExamStart(new Date(), store);
    recordExamStart(new Date(), store);
    const q = getExamQuota(true, new Date(), store);
    expect(q.blocked).toBe(false);
    expect(q.limit).toBe(Infinity);
    expect(q.remaining).toBe(Infinity);
  });

  it("getExamQuota: free users blocked after 2 in 30 days", () => {
    recordExamStart(new Date(), store);
    recordExamStart(new Date(), store);
    const q = getExamQuota(false, new Date(), store);
    expect(q.used).toBe(2);
    expect(q.limit).toBe(2);
    expect(q.remaining).toBe(0);
    expect(q.blocked).toBe(true);
  });

  it("getExamQuota: free users have remaining capacity below the limit", () => {
    recordExamStart(new Date(), store);
    const q = getExamQuota(false, new Date(), store);
    expect(q.used).toBe(1);
    expect(q.remaining).toBe(1);
    expect(q.blocked).toBe(false);
  });
});
