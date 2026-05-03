// Open-beta flag contract — a single switch decides whether all signed-in
// users are temporarily treated as Pro for client-side gating. The flag
// is read at module import time from VITE_OPEN_BETA_PRO; tests assert
// the public helper's behaviour given the current env (whichever it
// happens to be in the test environment).

import { describe, it, expect } from "vitest";
import { effectivelyPro, OPEN_BETA_PRO } from "./launchFlags";

describe("launchFlags — effectivelyPro contract", () => {
  it("Pro users are always effectively Pro (regardless of flag)", () => {
    expect(effectivelyPro("pro")).toBe(true);
  });

  it("institutional users are always effectively Pro", () => {
    expect(effectivelyPro("institutional")).toBe(true);
  });

  it("free / undefined / null behaviour follows the open-beta flag", () => {
    if (OPEN_BETA_PRO) {
      expect(effectivelyPro("free")).toBe(true);
      expect(effectivelyPro(undefined)).toBe(true);
      expect(effectivelyPro(null)).toBe(true);
    } else {
      expect(effectivelyPro("free")).toBe(false);
      expect(effectivelyPro(undefined)).toBe(false);
      expect(effectivelyPro(null)).toBe(false);
    }
  });

  it("OPEN_BETA_PRO defaults to false when the env var is absent", () => {
    // The constant is captured at import time. We can't change it here,
    // but in any environment that doesn't explicitly set the flag,
    // OPEN_BETA_PRO must be false (fail-safe).
    if (!(import.meta as any)?.env?.VITE_OPEN_BETA_PRO) {
      expect(OPEN_BETA_PRO).toBe(false);
    }
  });
});
