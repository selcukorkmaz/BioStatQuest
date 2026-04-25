import { describe, it, expect } from "vitest";
import { erf, pnorm, dnorm, qnorm, lgamma, dbeta } from "./stats";

// Tolerance for the closed-form approximations. erf is good to ~1e-7,
// the others depend on it transitively. We're not testing higher precision
// than the underlying algorithms claim.
const close = (a: number, b: number, eps = 1e-5) => Math.abs(a - b) < eps;

describe("erf", () => {
  it("erf(0) = 0", () => {
    expect(close(erf(0), 0)).toBe(true);
  });

  it("is odd: erf(-x) = -erf(x)", () => {
    expect(close(erf(-1.5), -erf(1.5))).toBe(true);
  });

  it("approaches 1 in the tail", () => {
    expect(erf(5)).toBeGreaterThan(0.999999);
    expect(erf(-5)).toBeLessThan(-0.999999);
  });

  it("matches known reference values", () => {
    // From standard tables: erf(0.5) ≈ 0.5205, erf(1) ≈ 0.8427
    expect(close(erf(0.5), 0.5205, 1e-3)).toBe(true);
    expect(close(erf(1.0), 0.8427, 1e-3)).toBe(true);
    expect(close(erf(2.0), 0.9953, 1e-3)).toBe(true);
  });
});

describe("pnorm (standard normal CDF)", () => {
  it("pnorm(0) = 0.5", () => {
    expect(close(pnorm(0), 0.5)).toBe(true);
  });

  it("symmetric: pnorm(-z) = 1 - pnorm(z)", () => {
    expect(close(pnorm(-1.96), 1 - pnorm(1.96))).toBe(true);
  });

  it("matches the 95% one-sided z critical value", () => {
    // pnorm(1.645) ≈ 0.95
    expect(close(pnorm(1.645), 0.95, 1e-3)).toBe(true);
  });

  it("matches the 97.5% (two-sided 95%) z critical value", () => {
    expect(close(pnorm(1.96), 0.975, 1e-3)).toBe(true);
  });
});

describe("dnorm (standard normal density)", () => {
  it("peak at zero is 1/sqrt(2π) ≈ 0.3989", () => {
    expect(close(dnorm(0), 1 / Math.sqrt(2 * Math.PI))).toBe(true);
  });

  it("integrates symmetrically: dnorm(-x) = dnorm(x)", () => {
    expect(close(dnorm(-1.7), dnorm(1.7))).toBe(true);
  });

  it("respects mu and sd parameters", () => {
    // N(5, 2): density at 5 should be 1/(2*sqrt(2π)) ≈ 0.1995
    expect(close(dnorm(5, 5, 2), 1 / (2 * Math.sqrt(2 * Math.PI)))).toBe(true);
  });
});

describe("qnorm (inverse CDF)", () => {
  it("qnorm(0.5) = 0", () => {
    expect(close(qnorm(0.5), 0, 1e-6)).toBe(true);
  });

  it("matches the canonical critical values", () => {
    expect(close(qnorm(0.975), 1.96, 1e-3)).toBe(true);
    expect(close(qnorm(0.025), -1.96, 1e-3)).toBe(true);
    expect(close(qnorm(0.95), 1.645, 1e-3)).toBe(true);
  });

  it("round-trips through pnorm", () => {
    for (const p of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      expect(close(pnorm(qnorm(p)), p, 1e-6)).toBe(true);
    }
  });
});

describe("lgamma (log-gamma)", () => {
  it("matches factorial: lgamma(n+1) = ln(n!)", () => {
    expect(close(lgamma(1), 0, 1e-6)).toBe(true);          // 0!
    expect(close(lgamma(2), 0, 1e-6)).toBe(true);          // 1!
    expect(close(lgamma(6), Math.log(120))).toBe(true);    // 5!
    expect(close(lgamma(11), Math.log(3628800), 1e-4)).toBe(true); // 10!
  });

  it("Γ(0.5) = √π ⇒ lgamma(0.5) = ln(√π) ≈ 0.5724", () => {
    expect(close(lgamma(0.5), Math.log(Math.sqrt(Math.PI)), 1e-5)).toBe(true);
  });
});

describe("dbeta (Beta density)", () => {
  it("returns 0 outside the (0, 1) interval", () => {
    expect(dbeta(0, 2, 5)).toBe(0);
    expect(dbeta(1, 2, 5)).toBe(0);
    expect(dbeta(-0.1, 2, 5)).toBe(0);
    expect(dbeta(1.5, 2, 5)).toBe(0);
  });

  it("Beta(1,1) is uniform: density = 1 everywhere in (0,1)", () => {
    expect(close(dbeta(0.1, 1, 1), 1)).toBe(true);
    expect(close(dbeta(0.5, 1, 1), 1)).toBe(true);
    expect(close(dbeta(0.9, 1, 1), 1)).toBe(true);
  });

  it("Beta(2,2) peaks at 0.5 with density 1.5", () => {
    expect(close(dbeta(0.5, 2, 2), 1.5)).toBe(true);
  });
});
