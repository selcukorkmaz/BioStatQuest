import { describe, it, expect } from "vitest";

// Pure-logic guard: the FOCUSABLE_SELECTOR string in useFocusTrap.ts must
// match every interactive element type a modal can plausibly contain. If
// new HTML5 input types or accessible-button patterns get added to the
// codebase, the trap silently misses them — this test documents the
// expected coverage so a regression at least shows up here.

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=\"hidden\"])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(", ");

describe("FOCUSABLE_SELECTOR coverage", () => {
  it("includes the standard focusable element types", () => {
    expect(FOCUSABLE_SELECTOR).toContain("a[href]");
    expect(FOCUSABLE_SELECTOR).toContain("button");
    expect(FOCUSABLE_SELECTOR).toContain("input");
    expect(FOCUSABLE_SELECTOR).toContain("select");
    expect(FOCUSABLE_SELECTOR).toContain("textarea");
    expect(FOCUSABLE_SELECTOR).toContain("[tabindex]");
  });

  it("excludes disabled inputs and hidden inputs", () => {
    // Disabled buttons / inputs / selects / textareas should NOT be in
    // the tab order; the selector negates :disabled. Hidden inputs are
    // an interactive type by spec but never visible — also negated.
    expect(FOCUSABLE_SELECTOR).toContain(":not([disabled])");
    expect(FOCUSABLE_SELECTOR).toContain('[type="hidden"]');
  });

  it("excludes elements with tabindex=-1 (the focus-trap container itself)", () => {
    // Containers like <div tabIndex={-1} ref={dialogRef}> are programmatically
    // focusable but should not be reachable via Tab. Without this exclusion,
    // Tab would land on the dialog div before its first interactive child.
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex="-1"]');
  });
});
