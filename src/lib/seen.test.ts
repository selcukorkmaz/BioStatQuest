import { describe, it, expect } from "vitest";
import { updateSeenQuestions } from "./seen";

const isGen = (qid: string) => qid.startsWith("gen_");

describe("updateSeenQuestions", () => {
  it("adds answered bank qids", () => {
    const out = updateSeenQuestions({}, "f1", ["f1_0", "f1_1"], 10, isGen);
    expect(out.f1.sort()).toEqual(["f1_0", "f1_1"]);
  });

  it("merges with what was already there and de-duplicates", () => {
    const out = updateSeenQuestions({ f1: ["f1_0"] }, "f1", ["f1_0", "f1_2"], 10, isGen);
    expect(out.f1.sort()).toEqual(["f1_0", "f1_2"]);
  });

  it("never records a generated item", () => {
    // A family qid is reused by every instance, so it is never "seen".
    const out = updateSeenQuestions({}, "f1", ["f1_0", "gen_cv", "gen_zscore"], 10, isGen);
    expect(out.f1).toEqual(["f1_0"]);
  });

  it("resets the cycle once every bank question has been answered", () => {
    const out = updateSeenQuestions({ f1: ["f1_0", "f1_1"] }, "f1", ["f1_2"], 3, isGen);
    expect(out.f1).toEqual([]);
  });

  it("does not let generated items trigger the reset early", () => {
    // Regression: counting family qids made a 3-question bank look exhausted
    // after two authored questions, recycling content the learner had not seen.
    const out = updateSeenQuestions({ f1: ["f1_0"] }, "f1", ["f1_1", "gen_cv", "gen_zscore"], 3, isGen);
    expect(out.f1.sort()).toEqual(["f1_0", "f1_1"]);
  });

  it("leaves other cases untouched", () => {
    const out = updateSeenQuestions({ f1: ["f1_0"], p1: ["p1_3"] }, "f1", ["f1_1"], 10, isGen);
    expect(out.p1).toEqual(["p1_3"]);
  });
});
