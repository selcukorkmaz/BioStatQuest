// Catalog gating contract.
// Pin the rule both surfaces (Skill Tree, case picker) depend on:
// the first FREE_CASES_PER_BRANCH cases of each branch are free; the
// rest require Pro. Pro/institutional users see everything.
//
// Paid plans were withdrawn on 2026-09-17 (PAYMENTS_ENABLED=false), which
// makes every case free for everyone. The "is locked" assertions are kept
// but made flag-aware rather than deleted: the free/Pro split is the thing
// that comes back first if sales ever re-open, and silently dropping the
// coverage would mean re-deriving it from scratch.

import { describe, it, expect } from "vitest";
import { CASES } from "../data/cases";
import { PAYMENTS_ENABLED } from "./launchFlags";
import {
  isCaseLockedForUser,
  isCaseInFreeTier,
  freeCaseCount,
  FREE_CASES_PER_BRANCH,
} from "./access";

describe("access — catalog gating", () => {
  it("FREE_CASES_PER_BRANCH is 3 (locked-in product decision)", () => {
    expect(FREE_CASES_PER_BRANCH).toBe(3);
  });

  it("free user is NOT locked out of the first 3 cases per branch", () => {
    const seen: Record<string, number> = {};
    for (const c of CASES) {
      if (!c?.id || !c?.branch) continue;
      const idx = seen[c.branch] || 0;
      if (idx < 3) {
        expect(
          isCaseLockedForUser(c.id, "free"),
          `case ${c.id} (branch ${c.branch}, position ${idx}) should be free`,
        ).toBe(false);
      }
      seen[c.branch] = idx + 1;
    }
  });

  it("cases beyond the 3rd in a branch are locked for free users iff payments are on", () => {
    const seen: Record<string, number> = {};
    let lockedAtLeastOne = false;
    for (const c of CASES) {
      if (!c?.id || !c?.branch) continue;
      const idx = seen[c.branch] || 0;
      if (idx >= 3) {
        expect(
          isCaseLockedForUser(c.id, "free"),
          `case ${c.id} (branch ${c.branch}, position ${idx}) should be ${PAYMENTS_ENABLED ? "locked" : "free (payments off)"}`,
        ).toBe(PAYMENTS_ENABLED);
        lockedAtLeastOne = true;
      }
      seen[c.branch] = idx + 1;
    }
    // Sanity: with 50 cases across 8 branches, surely some branch has > 3
    expect(lockedAtLeastOne).toBe(true);
  });

  it("Pro user is never locked out, regardless of branch position", () => {
    for (const c of CASES) {
      if (!c?.id) continue;
      expect(isCaseLockedForUser(c.id, "pro"), `Pro should access ${c.id}`).toBe(false);
    }
  });

  it("institutional user is treated as Pro", () => {
    for (const c of CASES) {
      if (!c?.id) continue;
      expect(isCaseLockedForUser(c.id, "institutional")).toBe(false);
    }
  });

  it("undefined / null userType is treated as free", () => {
    const some = CASES.find((c) => isCaseInFreeTier(c?.id ?? ""));
    const someLocked = CASES.find((c) => !isCaseInFreeTier(c?.id ?? ""));
    expect(isCaseLockedForUser(some!.id, undefined)).toBe(false);
    expect(isCaseLockedForUser(some!.id, null)).toBe(false);
    if (someLocked) {
      expect(isCaseLockedForUser(someLocked.id, undefined)).toBe(PAYMENTS_ENABLED);
      expect(isCaseLockedForUser(someLocked.id, null)).toBe(PAYMENTS_ENABLED);
    }
  });

  it("freeCaseCount is positive and bounded by 3 × number of branches", () => {
    const branches = new Set(CASES.map((c) => c?.branch).filter(Boolean));
    const n = freeCaseCount();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(3 * branches.size);
  });

  it("unknown case id is locked for free users (defensive default)", () => {
    expect(isCaseLockedForUser("__no_such_case__", "free")).toBe(PAYMENTS_ENABLED);
    // But Pro can pass through (we don't second-guess them on unknown ids)
    expect(isCaseLockedForUser("__no_such_case__", "pro")).toBe(false);
  });
});
