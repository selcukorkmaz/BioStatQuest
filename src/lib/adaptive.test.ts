// Pure-logic tests for the F4 adaptive picker. Two contracts to lock:
//   1. weakness scores reflect the bank passed in (not the global catalog)
//      and are bounded in [0, 1].
//   2. weighted shuffle reliably surfaces weaker-method questions FIRST
//      across many trials, while still giving stronger ones a non-zero
//      chance (we don't want deterministic loops).

import { describe, it, expect } from "vitest";
import {
  methodWeaknessFromBank,
  weightedShuffle,
  adaptiveOrder,
  type AdaptiveQuestion,
} from "./adaptive";

const bank: AdaptiveQuestion[] = [
  { qid: "f1_0", method: "ci" },
  { qid: "f1_1", method: "ci" },
  { qid: "f1_2", method: "ci" },
  { qid: "f1_3", method: "ci" },     // 4 ci questions
  { qid: "f1_4", method: "lm" },
  { qid: "f1_5", method: "lm" },     // 2 lm questions
];

describe("adaptive — methodWeaknessFromBank", () => {
  it("returns 1.0 for every method when SRS is empty (full attention everywhere)", () => {
    const w = methodWeaknessFromBank(bank, {});
    expect(w.ci).toBeCloseTo(1, 5);
    expect(w.lm).toBeCloseTo(1, 5);
  });

  it("decreases weakness as more questions in a method are mastered", () => {
    // 2 of 4 ci items mastered → weakness 0.5; lm untouched → weakness 1
    const srs = {
      f1_0: { reps: 5, interval: 30 },
      f1_1: { reps: 5, interval: 60 },
    };
    const w = methodWeaknessFromBank(bank, srs);
    expect(w.ci).toBeCloseTo(0.5, 5);
    expect(w.lm).toBeCloseTo(1, 5);
  });

  it("does not credit non-mastered SRS entries (reps<4 or interval<21)", () => {
    const srs = {
      f1_0: { reps: 4, interval: 20 },     // interval too short
      f1_1: { reps: 3, interval: 30 },     // reps too few
    };
    const w = methodWeaknessFromBank(bank, srs);
    expect(w.ci).toBeCloseTo(1, 5);
  });

  it("treats methodless questions under '_unknown'", () => {
    const b: AdaptiveQuestion[] = [{ qid: "x", method: undefined }];
    const w = methodWeaknessFromBank(b, {});
    expect(w._unknown).toBe(1);
  });
});

describe("adaptive — weightedShuffle determinism", () => {
  it("returns a permutation of the input", () => {
    const items = ["a", "b", "c", "d"];
    const out = weightedShuffle(items, () => 1, () => 0.5);
    expect(out.slice().sort()).toEqual(items.slice().sort());
    expect(out).toHaveLength(items.length);
  });

  it("is deterministic given the same RNG sequence", () => {
    const seq = [0.1, 0.9, 0.5, 0.7];
    const mkRng = () => { let i = 0; return () => seq[i++ % seq.length]; };
    const items = ["a", "b", "c", "d"];
    const a = weightedShuffle(items, () => 1, mkRng());
    const b = weightedShuffle(items, () => 1, mkRng());
    expect(a).toEqual(b);
  });

  it("places higher-weight items earlier on average over many trials", () => {
    const items = ["heavy", "light"];
    let heavyEarlier = 0;
    for (let i = 0; i < 1000; i++) {
      const out = weightedShuffle(items, (it) => (it === "heavy" ? 5 : 1));
      if (out[0] === "heavy") heavyEarlier++;
    }
    // 5× weight ratio → heavy should win the front slot well over half the
    // trials. 700/1000 is a comfortable lower bound (true ratio ≈ 5/6 ≈ 83%).
    expect(heavyEarlier).toBeGreaterThan(700);
  });

  it("still gives low-weight items a non-zero chance (no deterministic loops)", () => {
    const items = ["heavy", "light"];
    let lightFirst = 0;
    for (let i = 0; i < 1000; i++) {
      const out = weightedShuffle(items, (it) => (it === "heavy" ? 5 : 1));
      if (out[0] === "light") lightFirst++;
    }
    expect(lightFirst).toBeGreaterThan(20);    // very loose lower bound
  });
});

describe("adaptive — adaptiveOrder integration", () => {
  it("biases the head of the order toward weaker-method questions", () => {
    // Make ci 'mastered' (weakness 0) and lm completely untouched (weakness 1).
    const srs = {
      f1_0: { reps: 5, interval: 30 }, f1_1: { reps: 5, interval: 30 },
      f1_2: { reps: 5, interval: 30 }, f1_3: { reps: 5, interval: 30 },
    };
    let lmInTopTwo = 0;
    for (let i = 0; i < 500; i++) {
      const out = adaptiveOrder(bank, srs);
      if (out[0].method === "lm" || out[1].method === "lm") lmInTopTwo++;
    }
    // lm questions (weakness 1) vs ci (weakness 0 floored to 0.05) — the
    // top 2 spots should hit lm in well over half of trials.
    expect(lmInTopTwo).toBeGreaterThan(400);
  });

  it("falls back to a uniform-ish order when SRS is empty", () => {
    // With every method at weakness 1, weighted shuffle behaves like
    // ordinary shuffle. Each item should land in slot 0 roughly evenly
    // over many trials.
    const counts: Record<string, number> = {};
    for (let i = 0; i < 6000; i++) {
      const out = adaptiveOrder(bank, {});
      counts[out[0].qid!] = (counts[out[0].qid!] || 0) + 1;
    }
    // 6 items × 1000 expected per item; each should be at least 700 hits.
    for (const q of bank) {
      expect(counts[q.qid!] || 0).toBeGreaterThan(700);
    }
  });
});
