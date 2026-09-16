// @vitest-environment jsdom
//
// Regression test for the "time up on one question times out every later
// question" bug. The countdown lives in state that is reset by an effect keyed
// on stepIdx; effects run *after* render, so advancing the question without
// resetting the clock in the same update let the timer effect observe the
// previous question's timeLeft of 0 and immediately auto-submit the new one.

import * as React from "react";
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, act, fireEvent } from "@testing-library/react";
import { CasePlay } from "./CasePlay";
import { REVIEW_CASE_ID, DIFFICULTIES } from "../lib/difficulty";

const questions = [
  { qid: "t_one", q: "First question?",  type: "mcq" as const, options: ["A", "B"], answer: 0, explain: "first explain" },
  { qid: "t_two", q: "Second question?", type: "mcq" as const, options: ["A", "B"], answer: 1, explain: "second explain" },
];

function renderPlay() {
  return render(
    <CasePlay
      caseId={REVIEW_CASE_ID}
      difficulty="intern"
      questions={questions}
      onFinish={() => {}}
      onExit={() => {}}
      srs={null}
      onOpenGlossary={() => {}}
    />
  );
}

// The countdown reschedules itself one setTimeout at a time from an effect, so
// the clock has to be advanced a tick at a time for React to flush in between.
function runOutClock(seconds: number) {
  for (let i = 0; i < seconds; i++) act(() => { vi.advanceTimersByTime(1000); });
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("CasePlay timer", () => {
  it("gives the next question a full clock after the previous one timed out", () => {
    renderPlay();
    expect(screen.getByText("First question?")).toBeTruthy();

    runOutClock(DIFFICULTIES.intern.time);
    expect(screen.queryByText(/Time.s up/)).toBeTruthy();

    act(() => { fireEvent.click(screen.getByText(/Next Question/)); });

    expect(screen.getByText("Second question?")).toBeTruthy();
    // The bug: this second question arrived already timed out and revealed.
    expect(screen.queryByText(/Time.s up/)).toBeNull();
    expect(screen.queryByText("second explain")).toBeNull();
    expect(screen.getByText("Submit Answer")).toBeTruthy();
    expect(screen.getByText(`${DIFFICULTIES.intern.time}s`)).toBeTruthy();
  });

  it("still counts down normally on the question after a timeout", () => {
    renderPlay();
    runOutClock(DIFFICULTIES.intern.time);
    act(() => { fireEvent.click(screen.getByText(/Next Question/)); });

    runOutClock(5);
    expect(screen.getByText(`${DIFFICULTIES.intern.time - 5}s`)).toBeTruthy();
    expect(screen.queryByText(/Time.s up/)).toBeNull();
  });
});
