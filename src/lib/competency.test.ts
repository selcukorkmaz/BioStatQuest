// Lock-in tests for competency tier thresholds. The tier ladder is a
// public-facing claim about a learner's ability — boundary changes
// must be deliberate. Pin them here.

import { describe, it, expect } from "vitest";
import {
  tierFromMastery,
  TIER_ORDER,
  groupByBranch,
  type MethodCompetency,
} from "./competency";

describe("competency — tierFromMastery", () => {
  it("returns 'untouched' when total is 0", () => {
    expect(tierFromMastery({ total: 0, attempted: 0, reviewed: 0, mastered: 0 })).toBe("untouched");
  });

  it("returns 'untouched' when nothing attempted (even if total > 0)", () => {
    expect(tierFromMastery({ total: 10, attempted: 0, reviewed: 0, mastered: 0 })).toBe("untouched");
  });

  it("returns 'familiar' on the first attempt", () => {
    expect(tierFromMastery({ total: 10, attempted: 1, reviewed: 0, mastered: 0 })).toBe("familiar");
  });

  it("requires 30% attempted AND ≥1 reviewed for 'practiced'", () => {
    // 10 questions, 3 attempted, 1 reviewed → practiced
    expect(tierFromMastery({ total: 10, attempted: 3, reviewed: 1, mastered: 0 })).toBe("practiced");
    // Same attempts but no reviews → still familiar
    expect(tierFromMastery({ total: 10, attempted: 3, reviewed: 0, mastered: 0 })).toBe("familiar");
    // Below 30% attempted → familiar even with reviewed (must clear both gates)
    expect(tierFromMastery({ total: 10, attempted: 2, reviewed: 1, mastered: 0 })).toBe("familiar");
  });

  it("requires 50% reviewed AND ≥1 mastered for 'proficient'", () => {
    expect(tierFromMastery({ total: 10, attempted: 6, reviewed: 5, mastered: 1 })).toBe("proficient");
    // 50% reviewed without any mastered → only practiced
    expect(tierFromMastery({ total: 10, attempted: 6, reviewed: 5, mastered: 0 })).toBe("practiced");
    // Mastered=1 without enough reviewed → still practiced
    expect(tierFromMastery({ total: 10, attempted: 4, reviewed: 4, mastered: 1 })).toBe("practiced");
  });

  it("requires 60% mastered for 'mastered'", () => {
    // 10 q, 6 mastered → mastered
    expect(tierFromMastery({ total: 10, attempted: 10, reviewed: 10, mastered: 6 })).toBe("mastered");
    // 5/10 mastered (50%) → not yet mastered → proficient
    expect(tierFromMastery({ total: 10, attempted: 10, reviewed: 10, mastered: 5 })).toBe("proficient");
  });

  it("handles tiny methods (1 question) without becoming unreachable", () => {
    // For total=1, ceil(1*0.6)=1, ceil(1*0.5)=1, ceil(1*0.3)=1 — minimum 1.
    expect(tierFromMastery({ total: 1, attempted: 1, reviewed: 1, mastered: 1 })).toBe("mastered");
    expect(tierFromMastery({ total: 1, attempted: 1, reviewed: 1, mastered: 0 })).toBe("practiced");
    expect(tierFromMastery({ total: 1, attempted: 1, reviewed: 0, mastered: 0 })).toBe("familiar");
  });

  it("handles the rounding edge at 30/50/60 percent", () => {
    // total=7, ceil(7*0.3)=3, ceil(7*0.5)=4, ceil(7*0.6)=5
    expect(tierFromMastery({ total: 7, attempted: 3, reviewed: 1, mastered: 0 })).toBe("practiced");
    expect(tierFromMastery({ total: 7, attempted: 4, reviewed: 4, mastered: 1 })).toBe("proficient");
    expect(tierFromMastery({ total: 7, attempted: 7, reviewed: 7, mastered: 5 })).toBe("mastered");
  });
});

describe("competency — TIER_ORDER", () => {
  it("ladders from low to high in the order the UI relies on", () => {
    expect(TIER_ORDER).toEqual(["untouched", "familiar", "practiced", "proficient", "mastered"]);
  });
});

describe("competency — groupByBranch", () => {
  const methods: MethodCompetency[] = [
    { methodId: "a", title: "AAA", branch: "foundations", tier: "mastered",   stats: { total: 10, attempted: 10, reviewed: 10, mastered: 6 } },
    { methodId: "b", title: "BBB", branch: "foundations", tier: "familiar",   stats: { total: 5,  attempted: 1,  reviewed: 0, mastered: 0 } },
    { methodId: "c", title: "CCC", branch: "regression",  tier: "untouched",  stats: { total: 3,  attempted: 0,  reviewed: 0, mastered: 0 } },
    { methodId: "d", title: "DDD", branch: "regression",  tier: "proficient", stats: { total: 4,  attempted: 4,  reviewed: 3, mastered: 1 } },
  ];

  it("groups methods by branch and counts tiers per branch", () => {
    const grouped = groupByBranch(methods);
    expect(grouped).toHaveLength(2);
    const f = grouped.find((g) => g.branch === "foundations")!;
    const r = grouped.find((g) => g.branch === "regression")!;
    expect(f.methods).toHaveLength(2);
    expect(f.tierCounts.mastered).toBe(1);
    expect(f.tierCounts.familiar).toBe(1);
    expect(r.tierCounts.proficient).toBe(1);
    expect(r.tierCounts.untouched).toBe(1);
  });

  it("orders methods within a branch highest-tier first", () => {
    const grouped = groupByBranch(methods);
    const f = grouped.find((g) => g.branch === "foundations")!;
    expect(f.methods[0].tier).toBe("mastered");
    expect(f.methods[1].tier).toBe("familiar");
  });

  it("orders branches by name alphabetically", () => {
    const grouped = groupByBranch(methods);
    expect(grouped.map((g) => g.branch)).toEqual(["foundations", "regression"].sort());
  });
});
