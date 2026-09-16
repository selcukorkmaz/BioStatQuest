import { describe, it, expect } from "vitest";
import { composeRun, defaultGeneratedCap, type RunPools } from "./runComposition";

const pools = (p: Partial<RunPools<string>>): RunPools<string> => ({
  bankDue: [], famDue: [], unseen: [], famFresh: [], repeats: [], ...p,
});

describe("composeRun", () => {
  it("follows the priority order", () => {
    const out = composeRun(pools({
      bankDue: ["due1"], famDue: ["gd1"], unseen: ["u1", "u2"], famFresh: ["gf1"], repeats: ["r1"],
    }), 6, 6);
    expect(out).toEqual(["due1", "gd1", "u1", "u2", "gf1", "r1"]);
  });

  it("never returns more than n", () => {
    const out = composeRun(pools({ unseen: ["u1", "u2", "u3", "u4"] }), 2);
    expect(out).toEqual(["u1", "u2"]);
  });

  it("caps how much of a run can be generated", () => {
    // Six families claimed, six slots — without the cap the learner would see
    // no authored content at all.
    const out = composeRun(pools({
      famFresh: ["g1", "g2", "g3", "g4", "g5", "g6"],
      repeats: ["r1", "r2", "r3", "r4", "r5", "r6"],
    }), 6);
    expect(out.filter((x) => x.startsWith("g"))).toHaveLength(3);
    expect(out.filter((x) => x.startsWith("r"))).toHaveLength(3);
  });

  it("counts due and fresh families against the same cap", () => {
    const out = composeRun(pools({
      famDue: ["gd1", "gd2"], unseen: ["u1", "u2"], famFresh: ["gf1", "gf2"], repeats: ["r1", "r2"],
    }), 6);
    // Two due families plus one fresh one exhausts the cap of three; the last
    // slot falls through to a repeat rather than a fourth generated item.
    expect(out).toEqual(["gd1", "gd2", "u1", "u2", "gf1", "r1"]);
    expect(out.filter((x) => x.startsWith("g"))).toHaveLength(3);
  });

  it("lets unseen authored questions outrank fresh generated ones", () => {
    const out = composeRun(pools({
      unseen: ["u1", "u2", "u3", "u4", "u5", "u6"], famFresh: ["g1", "g2"],
    }), 6);
    expect(out).toEqual(["u1", "u2", "u3", "u4", "u5", "u6"]);
  });

  it("falls back to repeats when the generated cap is reached", () => {
    const out = composeRun(pools({ famFresh: ["g1", "g2"], repeats: ["r1", "r2"] }), 3, 1);
    expect(out).toEqual(["g1", "r1", "r2"]);
  });

  it("still allows one generated item in a single-question run", () => {
    expect(defaultGeneratedCap(1)).toBe(1);
    expect(composeRun(pools({ famFresh: ["g1"], repeats: ["r1"] }), 1)).toEqual(["g1"]);
  });

  it("returns a short run rather than inventing questions", () => {
    expect(composeRun(pools({ unseen: ["u1"] }), 6)).toEqual(["u1"]);
  });

  it("uses half the run, rounded up, as the default cap", () => {
    expect([1, 5, 6, 8, 12].map(defaultGeneratedCap)).toEqual([1, 3, 3, 4, 6]);
  });
});
