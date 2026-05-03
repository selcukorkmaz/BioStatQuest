// @vitest-environment jsdom
//
// Behavior tests for the F1 DistractorFeedback panel: per-option, post-reveal
// feedback that surfaces only for wrong picks on questions that have authored
// optionExplanations / misconceptionTag entries. Locks in the contract that
// (a) correct answers never show the panel, (b) the right distractor's text
// surfaces, (c) optional misconception badge renders when the tag is present,
// (d) multi-select shows feedback for every wrongly-checked option.

import * as React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DistractorFeedback } from "./CasePlay";

// Manual cleanup — the project doesn't configure RTL's auto-cleanup setupFile,
// so without this each render leaks into the next test's DOM and queries match
// stale nodes.
afterEach(() => cleanup());

const mcqQuestion = {
  qid: "test_mcq",
  q: "Pain score on a 0–10 scale is best described as:",
  type: "mcq" as const,
  options: ["Continuous", "Ordinal", "Nominal", "Ratio"],
  answer: 1,
  explain: "Ordered categories with unequal intervals → ordinal.",
  method: "variable_types",
  optionExplanations: {
    0: "Numbers on the scale aren't a true continuous measurement.",
    2: "The categories ARE ordered (0 < 1 < 2), so 'nominal' is wrong.",
    3: "Ratio scales need a true zero AND meaningful ratios.",
  },
  misconceptionTag: {
    0: "ordered_integers_treated_as_continuous",
    3: "numeric_labels_imply_ratio_scale",
  },
};

const vanillaMcq = {
  qid: "test_vanilla",
  q: "Plain question",
  type: "mcq" as const,
  options: ["A", "B", "C"],
  answer: 0,
  explain: "Plain explanation.",
  method: "variable_types",
};

const multiQuestion = {
  qid: "test_multi",
  q: "Pick all that apply",
  type: "multi" as const,
  options: ["alpha", "beta", "gamma", "delta"],
  answer: [0, 1],
  explain: "alpha and beta only.",
  method: "variable_types",
  optionExplanations: {
    2: "gamma is irrelevant here.",
    3: "delta confuses the parameter with the estimator.",
  },
  misconceptionTag: {
    3: "estimator_confused_with_parameter",
  },
};

describe("DistractorFeedback (F1 — distractor-aware misconception feedback)", () => {
  it("renders nothing when the answer is correct", () => {
    const { container } = render(
      <DistractorFeedback step={mcqQuestion} correct={true} current={1} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the question has no per-option metadata", () => {
    const { container } = render(
      <DistractorFeedback step={vanillaMcq} correct={false} current={1} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the picked wrong option has no authored entry", () => {
    // Trim the question down so option 2 has no optionExplanations / tag.
    const partial = { ...mcqQuestion, optionExplanations: { 0: "only zero is documented" }, misconceptionTag: undefined };
    const { container } = render(
      <DistractorFeedback step={partial} correct={false} current={2} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("surfaces the explanation for the picked wrong distractor (mcq)", () => {
    render(<DistractorFeedback step={mcqQuestion} correct={false} current={0} />);
    expect(screen.getByText(/Numbers on the scale aren't a true continuous measurement/)).toBeTruthy();
    expect(screen.getByText(/your pick/i)).toBeTruthy();
    // A picked-option label "A" (index 0)
    expect(screen.getByText(/· A/)).toBeTruthy();
    // Misconception tag exists for index 0 → badge should render
    expect(screen.getByText("Common misconception")).toBeTruthy();
  });

  it("does NOT surface other distractors' explanations", () => {
    render(<DistractorFeedback step={mcqQuestion} correct={false} current={0} />);
    expect(screen.queryByText(/categories ARE ordered/)).toBeNull();
    expect(screen.queryByText(/Ratio scales need a true zero/)).toBeNull();
  });

  it("renders explanation but no badge when the picked option has only an explanation", () => {
    render(<DistractorFeedback step={mcqQuestion} correct={false} current={2} />);
    expect(screen.getByText(/categories ARE ordered/)).toBeTruthy();
    // Index 2 has no misconceptionTag → no badge
    expect(screen.queryByText("Common misconception")).toBeNull();
  });

  it("renders feedback for every wrongly-checked option in a multi-select", () => {
    // User checked 0 (correct), 2 (wrong, has explanation), 3 (wrong, has explanation + tag)
    render(<DistractorFeedback step={multiQuestion} correct={false} current={[0, 2, 3]} />);
    expect(screen.getByText(/gamma is irrelevant here/)).toBeTruthy();
    expect(screen.getByText(/delta confuses the parameter/)).toBeTruthy();
    expect(screen.getByText("Common misconception")).toBeTruthy();
    // Two cards (one per wrongly-checked option)
    const yp = screen.getAllByText(/your pick/i);
    expect(yp).toHaveLength(2);
  });

  it("renders nothing for multi-select when no checked options are wrong", () => {
    const { container } = render(
      <DistractorFeedback step={multiQuestion} correct={false} current={[0, 1]} />,
    );
    // [0,1] is the full correct answer; nothing wrong was checked. The component
    // is only entered when `correct === false`, but if the wrong was an *omission*
    // (missed correct), there are no per-option distractor messages to surface.
    expect(container.firstChild).toBeNull();
  });

  // F8 — repeat-offender chip. The chip surfaces only when the picked
  // distractor's misconception tag has been matched ≥ REPEAT_THRESHOLD times
  // (currently 3) in the learner's recent history.
  describe("repeat-offender chip (F8 ledger)", () => {
    it("does not render when count is below threshold", () => {
      const counts = { ordered_integers_treated_as_continuous: { count: 2, lastSeen: "2026-05-01" } };
      render(<DistractorFeedback step={mcqQuestion} correct={false} current={0} misconceptionCounts={counts} />);
      expect(screen.queryByText(/× 2 times/)).toBeNull();
      // Generic "Common misconception" badge still shows (count threshold doesn't gate it)
      expect(screen.getByText("Common misconception")).toBeTruthy();
    });

    it("renders '× N times' chip when count is at the threshold", () => {
      const counts = { ordered_integers_treated_as_continuous: { count: 3, lastSeen: "2026-05-01" } };
      render(<DistractorFeedback step={mcqQuestion} correct={false} current={0} misconceptionCounts={counts} />);
      expect(screen.getByText(/× 3 times/)).toBeTruthy();
    });

    it("renders the chip with the actual count when above threshold", () => {
      const counts = { ordered_integers_treated_as_continuous: { count: 7, lastSeen: "2026-05-01" } };
      render(<DistractorFeedback step={mcqQuestion} correct={false} current={0} misconceptionCounts={counts} />);
      expect(screen.getByText(/× 7 times/)).toBeTruthy();
    });

    it("does not render the chip when the picked option has no tag", () => {
      // Option 2 has only an explanation, no misconceptionTag.
      const counts = { center_summary_misidentified: { count: 99, lastSeen: "2026-05-01" } };
      render(<DistractorFeedback step={mcqQuestion} correct={false} current={2} misconceptionCounts={counts} />);
      // Explanation renders but no count chip and no badge
      expect(screen.getByText(/categories ARE ordered/)).toBeTruthy();
      expect(screen.queryByText(/times/)).toBeNull();
      expect(screen.queryByText("Common misconception")).toBeNull();
    });

    it("does not render the chip when counts map is missing the tag", () => {
      const counts = { unrelated_tag: { count: 42, lastSeen: "2026-05-01" } };
      render(<DistractorFeedback step={mcqQuestion} correct={false} current={0} misconceptionCounts={counts} />);
      expect(screen.queryByText(/times/)).toBeNull();
    });

    it("works without misconceptionCounts prop (backward-compatible)", () => {
      // Older callers — no chip ever appears, but explanation/badge render fine.
      render(<DistractorFeedback step={mcqQuestion} correct={false} current={0} />);
      expect(screen.getByText(/Numbers on the scale/)).toBeTruthy();
      expect(screen.getByText("Common misconception")).toBeTruthy();
      expect(screen.queryByText(/times/)).toBeNull();
    });
  });
});
