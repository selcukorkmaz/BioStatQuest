// These tests check the PEDAGOGY, not just that the code runs. Each simulation
// exists to make one statistical fact visible; if the simulation stopped
// producing that fact, the item built on it would teach the wrong thing while
// still rendering perfectly.

import { describe, it, expect } from "vitest";
import { runSimulation, histogram, type SimSpec } from "./simulate";

const seeds = [1, 7, 42, 1234, 98765];

describe("runSimulation", () => {
  it("is deterministic in the seed", () => {
    const specs: SimSpec[] = [
      { kind: "clt", seed: 42, population: "skewed", n: 30, reps: 200 },
      { kind: "ci_coverage", seed: 42, n: 25, reps: 100, mu: 10, sigma: 2 },
      { kind: "multiplicity", seed: 42, m: 20, alpha: 0.05 },
      { kind: "collider", seed: 42, n: 300 },
    ];
    for (const s of specs) {
      expect(JSON.stringify(runSimulation(s))).toBe(JSON.stringify(runSimulation(s)));
    }
  });
});

describe("clt", () => {
  it("shrinks the spread of sample means by √n", () => {
    for (const seed of seeds) {
      const r = runSimulation({ kind: "clt", seed, population: "skewed", n: 36, reps: 600 });
      if (r.kind !== "clt") throw new Error("wrong kind");
      // Observed SD of the means should land near σ/√n.
      expect(Math.abs(r.meanSd - r.predictedSe) / r.predictedSe,
        `seed ${seed}: meanSd ${r.meanSd.toFixed(3)} vs predicted ${r.predictedSe.toFixed(3)}`)
        .toBeLessThan(0.15);
    }
  });

  it("leaves a skewed population skewed while the means become near-symmetric at large n", () => {
    for (const seed of seeds) {
      const big = runSimulation({ kind: "clt", seed, population: "skewed", n: 200, reps: 600 });
      if (big.kind !== "clt") throw new Error("wrong kind");
      expect(big.popSkew, `seed ${seed}: population must stay skewed`).toBeGreaterThan(1.2);
      expect(Math.abs(big.meanSkew), `seed ${seed}: means should be near-symmetric at n=200`).toBeLessThan(0.55);
    }
  });

  it("leaves the means visibly skewed at small n — the CLT has not arrived yet", () => {
    // This is the branch the "shape" item keys to when n is small. If the
    // simulation stopped showing residual skew, that item would be wrong.
    const skews = seeds.map((seed) => {
      const r = runSimulation({ kind: "clt", seed, population: "skewed", n: 5, reps: 600 });
      return r.kind === "clt" ? r.meanSkew : 0;
    });
    expect(Math.min(...skews), `small-n skews: ${skews.map((s) => s.toFixed(2)).join(", ")}`)
      .toBeGreaterThan(0.5);
  });

  it("produces histograms that account for every draw", () => {
    const r = runSimulation({ kind: "clt", seed: 3, population: "bimodal", n: 10, reps: 250 });
    if (r.kind !== "clt") throw new Error("wrong kind");
    expect(r.meanBins.reduce((s, b) => s + b.count, 0)).toBe(250);
    expect(r.popBins.reduce((s, b) => s + b.count, 0)).toBe(1500);
  });
});

describe("ci_coverage", () => {
  it("covers the true mean close to 95% of the time", () => {
    // Pooled over seeds so the check is about the method, not one lucky run.
    let covered = 0, total = 0;
    for (const seed of seeds) {
      const r = runSimulation({ kind: "ci_coverage", seed, n: 30, reps: 400, mu: 100, sigma: 15 });
      if (r.kind !== "ci_coverage") throw new Error("wrong kind");
      covered += r.intervals.filter((i) => i.covers).length;
      total += r.intervals.length;
    }
    const rate = covered / total;
    expect(rate, `observed coverage ${(rate * 100).toFixed(1)}%`).toBeGreaterThan(0.91);
    expect(rate, `observed coverage ${(rate * 100).toFixed(1)}%`).toBeLessThan(0.98);
  });

  it("actually misses sometimes — a run with no misses would teach the opposite lesson", () => {
    const missCounts = seeds.map((seed) => {
      const r = runSimulation({ kind: "ci_coverage", seed, n: 25, reps: 100, mu: 10, sigma: 2 });
      return r.kind === "ci_coverage" ? r.missed : -1;
    });
    expect(Math.min(...missCounts), `miss counts: ${missCounts.join(", ")}`).toBeGreaterThan(0);
  });

  it("reports a range that contains every interval it drew", () => {
    const r = runSimulation({ kind: "ci_coverage", seed: 9, n: 20, reps: 60, mu: 5, sigma: 1 });
    if (r.kind !== "ci_coverage") throw new Error("wrong kind");
    for (const i of r.intervals) {
      expect(i.lo).toBeGreaterThanOrEqual(r.range[0]);
      expect(i.hi).toBeLessThanOrEqual(r.range[1]);
    }
    expect(r.missed).toBe(r.intervals.filter((i) => !i.covers).length);
  });
});

describe("multiplicity", () => {
  it("produces false positives at about the nominal rate", () => {
    let hits = 0, tests = 0;
    for (let seed = 0; seed < 60; seed++) {
      const r = runSimulation({ kind: "multiplicity", seed, m: 40, alpha: 0.05 });
      if (r.kind !== "multiplicity") throw new Error("wrong kind");
      hits += r.hits; tests += r.pvals.length;
    }
    const rate = hits / tests;
    expect(rate, `false-positive rate ${(rate * 100).toFixed(2)}%`).toBeGreaterThan(0.03);
    expect(rate, `false-positive rate ${(rate * 100).toFixed(2)}%`).toBeLessThan(0.075);
  });

  it("keeps every p-value in [0, 1)", () => {
    const r = runSimulation({ kind: "multiplicity", seed: 11, m: 200, alpha: 0.05 });
    if (r.kind !== "multiplicity") throw new Error("wrong kind");
    for (const p of r.pvals) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
    expect(r.hits).toBe(r.pvals.filter((p) => p < 0.05).length);
  });
});

describe("collider", () => {
  it("starts with two independent variables and ends with a correlation", () => {
    for (const seed of seeds) {
      const r = runSimulation({ kind: "collider", seed, n: 600 });
      if (r.kind !== "collider") throw new Error("wrong kind");
      expect(Math.abs(r.rAll), `seed ${seed}: unconditioned r = ${r.rAll.toFixed(3)} should be ~0`)
        .toBeLessThan(0.12);
      expect(r.rSel, `seed ${seed}: conditioned r = ${r.rSel.toFixed(3)} should be clearly negative`)
        .toBeLessThan(-0.2);
    }
  });

  it("selects a meaningful subset rather than almost everything or almost nothing", () => {
    const r = runSimulation({ kind: "collider", seed: 5, n: 500 });
    if (r.kind !== "collider") throw new Error("wrong kind");
    expect(r.selectedCount).toBeGreaterThan(120);
    expect(r.selectedCount).toBeLessThan(280);
    expect(r.points.filter((p) => p.sel).length).toBe(r.selectedCount);
  });
});

describe("histogram", () => {
  it("bins every value exactly once", () => {
    const vals = Array.from({ length: 500 }, (_, i) => Math.sin(i) * 10);
    const bins = histogram(vals, 20);
    expect(bins).toHaveLength(20);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(500);
    expect(bins[0].x0).toBeCloseTo(Math.min(...vals), 6);
  });

  it("survives a constant input without dividing by zero", () => {
    const bins = histogram([3, 3, 3, 3], 5);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(4);
    expect(bins.every((b) => Number.isFinite(b.x0) && Number.isFinite(b.x1))).toBe(true);
  });
});
