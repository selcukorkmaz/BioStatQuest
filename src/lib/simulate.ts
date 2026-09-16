// Seeded simulations for predict-then-see items.
//
// A learner predicts what will happen, submits, and only THEN does the app run
// the experiment and draw the result. That ordering is the whole point: a
// picture shown before the prediction is a diagram, a picture shown after one
// is feedback on your own intuition.
//
// Everything here is pure and deterministic given the seed: no DOM, no
// Math.random, no React. That is what lets the test suite check the PEDAGOGY —
// that CI coverage really lands near 95%, that the sampling distribution really
// narrows by √n, that conditioning on a collider really manufactures a
// correlation — rather than merely checking that the code runs.

import { makeRng, type RNG } from "../data/generators/core";

export type SimSpec =
  | { kind: "clt"; seed: number; population: PopulationKind; n: number; reps: number }
  | { kind: "ci_coverage"; seed: number; n: number; reps: number; mu: number; sigma: number }
  | { kind: "multiplicity"; seed: number; m: number; alpha: number }
  | { kind: "collider"; seed: number; n: number };

export type PopulationKind = "skewed" | "bimodal" | "uniform";

export type Bin = { x0: number; x1: number; count: number };

export type CltResult = {
  kind: "clt";
  population: PopulationKind;
  n: number;
  popBins: Bin[];
  meanBins: Bin[];
  popSd: number;
  /** Observed SD of the sample means — what σ/√n predicts. */
  meanSd: number;
  predictedSe: number;
  popSkew: number;
  meanSkew: number;
};

export type CoverageResult = {
  kind: "ci_coverage";
  mu: number;
  intervals: { lo: number; hi: number; covers: boolean }[];
  missed: number;
  /** Plot bounds wide enough for every interval drawn. */
  range: [number, number];
};

export type MultiplicityResult = {
  kind: "multiplicity";
  alpha: number;
  pvals: number[];
  hits: number;
  expected: number;
};

export type ColliderResult = {
  kind: "collider";
  points: { x: number; y: number; sel: boolean }[];
  rAll: number;
  rSel: number;
  selectedCount: number;
};

export type SimResult = CltResult | CoverageResult | MultiplicityResult | ColliderResult;

// ------------------------------------------------------------
// Small numeric helpers
// ------------------------------------------------------------
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

function sd(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Fisher–Pearson skewness. Near 0 for a symmetric shape, clearly positive for a right tail. */
function skewness(xs: number[]): number {
  const m = mean(xs), s = sd(xs);
  if (s === 0) return 0;
  return xs.reduce((acc, x) => acc + ((x - m) / s) ** 3, 0) / xs.length;
}

function pearson(xs: number[], ys: number[]): number {
  const mx = mean(xs), my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
}

export function histogram(values: number[], bins: number): Bin[] {
  const lo = Math.min(...values), hi = Math.max(...values);
  const width = (hi - lo) / bins || 1;
  const out: Bin[] = Array.from({ length: bins }, (_, i) => ({
    x0: lo + i * width, x1: lo + (i + 1) * width, count: 0,
  }));
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / width)));
    out[idx].count++;
  }
  return out;
}

/** Box–Muller, driven by the seeded RNG so the whole simulation is reproducible. */
function gauss(rng: RNG): number {
  let u = rng.next();
  if (u < 1e-12) u = 1e-12;
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
}

/** Populations chosen to be obviously non-normal, so the CLT has visible work to do. */
function drawFromPopulation(rng: RNG, kind: PopulationKind): number {
  switch (kind) {
    case "skewed": {
      // Exponential(1): mean 1, SD 1, skewness 2 — a long right tail.
      let u = rng.next();
      if (u > 1 - 1e-12) u = 1 - 1e-12;
      return -Math.log(1 - u);
    }
    case "bimodal":
      return rng.next() < 0.5 ? 0.2 + 0.08 * gauss(rng) : 0.8 + 0.08 * gauss(rng);
    case "uniform":
      return rng.next();
  }
}

const POP_SAMPLE = 1500;
const HIST_BINS = 26;

// ------------------------------------------------------------
// The simulations
// ------------------------------------------------------------
export function runSimulation(spec: SimSpec): SimResult {
  const rng = makeRng(spec.seed);

  if (spec.kind === "clt") {
    const pop = Array.from({ length: POP_SAMPLE }, () => drawFromPopulation(rng, spec.population));
    const means = Array.from({ length: spec.reps }, () => {
      let total = 0;
      for (let i = 0; i < spec.n; i++) total += drawFromPopulation(rng, spec.population);
      return total / spec.n;
    });
    const popSd = sd(pop);
    return {
      kind: "clt",
      population: spec.population,
      n: spec.n,
      popBins: histogram(pop, HIST_BINS),
      meanBins: histogram(means, HIST_BINS),
      popSd,
      meanSd: sd(means),
      predictedSe: popSd / Math.sqrt(spec.n),
      popSkew: skewness(pop),
      meanSkew: skewness(means),
    };
  }

  if (spec.kind === "ci_coverage") {
    // Every interval below comes from a population whose true mean we KNOW,
    // which is the only setting in which "did it cover?" is even answerable —
    // and precisely the setting a real study never has.
    const intervals = Array.from({ length: spec.reps }, () => {
      const sample = Array.from({ length: spec.n }, () => spec.mu + spec.sigma * gauss(rng));
      const half = 1.96 * (sd(sample) / Math.sqrt(spec.n));
      const m = mean(sample);
      const lo = m - half, hi = m + half;
      return { lo, hi, covers: lo <= spec.mu && spec.mu <= hi };
    });
    const pad = spec.sigma / Math.sqrt(spec.n) * 3;
    return {
      kind: "ci_coverage",
      mu: spec.mu,
      intervals,
      missed: intervals.filter((i) => !i.covers).length,
      range: [
        Math.min(...intervals.map((i) => i.lo), spec.mu - pad),
        Math.max(...intervals.map((i) => i.hi), spec.mu + pad),
      ],
    };
  }

  if (spec.kind === "multiplicity") {
    // Under a true null the p-value is Uniform(0,1) by construction, so the
    // "experiment" needs no data at all — which is itself the lesson.
    const pvals = Array.from({ length: spec.m }, () => rng.next());
    return {
      kind: "multiplicity",
      alpha: spec.alpha,
      pvals,
      hits: pvals.filter((p) => p < spec.alpha).length,
      expected: spec.m * spec.alpha,
    };
  }

  // collider: x and y are generated INDEPENDENTLY, then we keep only the cases
  // where their common effect is large. The correlation appears out of nothing.
  const xs: number[] = [], ys: number[] = [], cs: number[] = [];
  for (let i = 0; i < spec.n; i++) {
    const x = gauss(rng), y = gauss(rng);
    xs.push(x); ys.push(y); cs.push(x + y + 0.4 * gauss(rng));
  }
  const threshold = [...cs].sort((a, b) => a - b)[Math.floor(spec.n * 0.62)];
  const sel = cs.map((c) => c > threshold);
  const selX = xs.filter((_, i) => sel[i]);
  const selY = ys.filter((_, i) => sel[i]);
  return {
    kind: "collider",
    points: xs.map((x, i) => ({ x, y: ys[i], sel: sel[i] })),
    rAll: pearson(xs, ys),
    rSel: pearson(selX, selY),
    selectedCount: selX.length,
  };
}
