// Contract tests for the F3 hint registry.

import { describe, it, expect } from "vitest";
import { METHODS } from "../data/methods";
import { getHint, isHintLayerFree, listCuratedMethods } from "./methodHints";

describe("methodHints — registry shape", () => {
  it("returns layer1 for every known method (curated or auto-fallback)", () => {
    const missing: string[] = [];
    for (const id of Object.keys(METHODS)) {
      const h = getHint(id);
      if (!h.layer1 || h.layer1.trim().length === 0) missing.push(id);
    }
    expect(missing, `methods without layer1 hint: ${missing.join(", ")}`).toEqual([]);
  });

  it("returns empty hint for unknown method id", () => {
    expect(getHint("__no_such_method__")).toEqual({ layer1: undefined, layer2: undefined, layer3: undefined });
  });

  it("returns empty hint for null/undefined", () => {
    expect(getHint(null)).toEqual({});
    expect(getHint(undefined)).toEqual({});
  });

  it("curated methods include the high-pedagogical-value classics", () => {
    const curated = listCuratedMethods();
    for (const expected of ["ci", "hypothesis_testing", "logistic", "roc_auc", "multiple_testing"]) {
      expect(curated, `expected curated method: ${expected}`).toContain(expected);
    }
  });

  it("curated methods that include layer3 must also include layer2 (no gap in the ladder)", () => {
    for (const id of listCuratedMethods()) {
      const h = getHint(id);
      if (h.layer3 && !h.layer2) {
        throw new Error(`method ${id} has layer3 but no layer2`);
      }
    }
  });

  it("every curated layer is non-empty trimmed", () => {
    for (const id of listCuratedMethods()) {
      const h = getHint(id);
      for (const k of ["layer1", "layer2", "layer3"] as const) {
        const v = h[k];
        if (v !== undefined) expect(v.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("methodHints — tier gating", () => {
  it("layer 1 is free", () => {
    expect(isHintLayerFree(1)).toBe(true);
  });

  it("layers 2 and 3 are Pro-only (not free)", () => {
    expect(isHintLayerFree(2)).toBe(false);
    expect(isHintLayerFree(3)).toBe(false);
  });
});
