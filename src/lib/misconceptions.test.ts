// Invariants for the misconception derivation library.
//
// (a) Every misconception_tag authored on a question's misconceptionTag
//     map must resolve to a discoverable meta entry — otherwise the
//     learner-facing card silently degrades to "no example available".
// (b) humanizeTag is pure and stable: same input always → same output;
//     does not crash on degenerate input.

import { describe, it, expect } from "vitest";
import { CASES } from "../data/cases";
import {
  getMisconceptionMeta,
  humanizeTag,
  listAllMisconceptionTags,
} from "./misconceptions";

describe("misconceptions — humanizeTag", () => {
  it("converts snake_case to a sentence-cased label", () => {
    expect(humanizeTag("ci_as_parameter_probability")).toBe(
      "Ci as parameter probability",
    );
    expect(humanizeTag("p_value_inverted_conditional")).toBe(
      "P value inverted conditional",
    );
  });

  it("returns empty string for empty input", () => {
    expect(humanizeTag("")).toBe("");
  });

  it("handles a single-word tag", () => {
    expect(humanizeTag("foo")).toBe("Foo");
  });
});

describe("misconceptions — derivation index", () => {
  it("indexes at least one tag (the bank has authored misconceptions)", () => {
    const tags = listAllMisconceptionTags();
    expect(tags.length).toBeGreaterThan(0);
  });

  it("every tag authored on a question resolves to a meta entry", () => {
    const missing: string[] = [];
    for (const c of CASES) {
      if (!c?.bank) continue;
      for (const q of c.bank) {
        if (!q.misconceptionTag) continue;
        for (const tag of Object.values(q.misconceptionTag)) {
          if (!tag) continue;
          const meta = getMisconceptionMeta(tag as string);
          if (!meta) missing.push(`${q.qid}:${tag}`);
        }
      }
    }
    expect(missing, `unresolved tags: ${missing.join(", ")}`).toEqual([]);
  });

  it("each indexed meta has the fields the view needs", () => {
    for (const tag of listAllMisconceptionTags()) {
      const m = getMisconceptionMeta(tag);
      expect(m).not.toBeNull();
      expect(m!.tag).toBe(tag);
      expect(m!.label.length).toBeGreaterThan(0);
      expect(m!.qid.length).toBeGreaterThan(0);
      expect(m!.caseId.length).toBeGreaterThan(0);
      // Either the option text or the why-wrong text must be non-empty —
      // a degenerate entry with neither is filtered out at index time.
      expect((m!.exampleOption.length + m!.whyWrong.length)).toBeGreaterThan(0);
    }
  });

  it("returns null for an unknown tag", () => {
    expect(getMisconceptionMeta("__not_a_real_tag__")).toBeNull();
  });
});
