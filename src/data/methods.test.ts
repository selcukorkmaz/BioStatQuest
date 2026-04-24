import { describe, it, expect } from "vitest";
import { METHODS, METHOD_BRANCH } from "./methods";
import { BRANCHES } from "./branches";

describe("METHOD_BRANCH attribution map", () => {
  it("covers every method in METHODS", () => {
    const missing: string[] = [];
    for (const method of Object.keys(METHODS)) {
      if (!(method in METHOD_BRANCH)) missing.push(method);
    }
    expect(missing, `methods missing from METHOD_BRANCH: ${missing.join(", ")}`).toEqual([]);
  });

  it("does not reference unknown methods", () => {
    const unknown: string[] = [];
    for (const method of Object.keys(METHOD_BRANCH)) {
      if (!(method in METHODS)) unknown.push(method);
    }
    expect(unknown, `unknown methods in METHOD_BRANCH: ${unknown.join(", ")}`).toEqual([]);
  });

  it("only assigns to known branch ids", () => {
    const validBranches = new Set(Object.keys(BRANCHES));
    const bad: string[] = [];
    for (const [method, branch] of Object.entries(METHOD_BRANCH)) {
      if (!validBranches.has(branch)) bad.push(`${method} → ${branch}`);
    }
    expect(bad, `invalid branch assignments: ${bad.join(", ")}`).toEqual([]);
  });

  it("places anchor methods in their expected branch", () => {
    // Spot checks against the BRANCHES descriptions — the moment any of
    // these starts to drift, the map is misaligned with the data model.
    expect(METHOD_BRANCH.cox_ph).toBe("regression");
    expect(METHOD_BRANCH.km_logrank).toBe("regression");
    expect(METHOD_BRANCH.t_test).toBe("estimation_inference");
    expect(METHOD_BRANCH.iptw).toBe("causal");
    expect(METHOD_BRANCH.bayes).toBe("advanced_bayesian");
    expect(METHOD_BRANCH.power).toBe("advanced_bayesian"); // BRANCHES.advanced_bayesian.desc lists power
    expect(METHOD_BRANCH.roc_auc).toBe("missing_measurement"); // BRANCHES.missing_measurement.desc lists ROC
    expect(METHOD_BRANCH.descriptive).toBe("foundations");
    expect(METHOD_BRANCH.clt_sampling).toBe("probability");
  });
});
