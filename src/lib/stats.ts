// Pure-math primitives used by the in-browser simulators (Lab) and other
// statistical visualisations. Extracted from App.tsx so the file shrinks
// and the math is unit-testable on its own.
//
// All functions are pure and have no React/DOM dependencies. Numeric
// approximations chosen for "good enough at 60fps in a slider" — not
// research-grade. If you need higher precision, swap in jStat or a
// dedicated numerical library here and the consumers stay unchanged.

/** Error function — Abramowitz & Stegun approximation. Max error ~1.5e-7. */
export function erf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

/** Standard-normal CDF: P(Z ≤ z). */
export const pnorm = (z: number): number => 0.5 * (1 + erf(z / Math.SQRT2));

/** Normal density. Defaults to standard normal (mu=0, sd=1). */
export const dnorm = (x: number, mu = 0, sd = 1): number =>
  Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));

/** Inverse standard-normal CDF via 60-iter bisection. ~1e-18 precision. */
export function qnorm(p: number): number {
  let lo = -8;
  let hi = 8;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    if (pnorm(m) < p) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/** Log-gamma via Lanczos approximation (g=7). Good across the real line. */
export function lgamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  const t = x + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Beta density on (0, 1). Returns 0 outside the open interval. */
export const dbeta = (x: number, a: number, b: number): number => {
  if (x <= 0 || x >= 1) return 0;
  return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) + lgamma(a + b) - lgamma(a) - lgamma(b));
};
