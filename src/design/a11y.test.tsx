// @vitest-environment jsdom
//
// axe-core a11y smoke tests for the design primitives. Catches the
// regressions that color/contrast reviews miss: missing labels on
// interactive elements, ARIA mistakes, focus indicators, etc.
//
// Each primitive gets one test that renders a representative usage
// and asserts zero axe violations. When you add a primitive, add a
// test here too.

import * as React from "react";
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { axe } from "vitest-axe";

import { Card } from "./Card";
import { Btn } from "./Btn";
import { Chip } from "./Chip";
import { SectionLabel } from "./SectionLabel";
import { Stat } from "./Stat";
import { Field } from "./Field";
import {
  EmptyState,
  ErrorBanner,
  InlineSpinner,
  Skeleton,
} from "./state";

// Helper: axe returns an AxeResults; we assert the violations array is empty.
// Cleaner than expect.extend() which wars with vitest's matcher registry.
async function expectNoA11yViolations(container: HTMLElement) {
  const results = await axe(container);
  if (results.violations.length > 0) {
    const pretty = results.violations
      .map((v: any) => `  • [${v.id}] ${v.help}: ${v.nodes.map((n: any) => n.html).join(", ")}`)
      .join("\n");
    throw new Error(`axe found ${results.violations.length} a11y violation(s):\n${pretty}`);
  }
  expect(results.violations).toEqual([]);
}

describe("Design primitives — axe", () => {
  it("Card has no a11y violations", async () => {
    const { container } = render(
      <Card>
        <h3>Card title</h3>
        <p>Body text</p>
      </Card>
    );
    await expectNoA11yViolations(container);
  });

  it("Btn has no a11y violations across variants", async () => {
    const { container } = render(
      <div>
        <Btn variant="primary">Primary</Btn>
        <Btn variant="ghost" disabled>Disabled ghost</Btn>
        <Btn variant="danger" busy busyLabel="Removing…">Remove</Btn>
      </div>
    );
    await expectNoA11yViolations(container);
  });

  it("Chip has no a11y violations across tones", async () => {
    const { container } = render(
      <div>
        <Chip tone="neutral">Archived</Chip>
        <Chip tone="warn">Lapsed</Chip>
        <Chip tone="ok">Synced</Chip>
        <Chip tone="err">Failed</Chip>
        <Chip tone="info">Beta</Chip>
      </div>
    );
    await expectNoA11yViolations(container);
  });

  it("SectionLabel has no a11y violations", async () => {
    const { container } = render(
      <SectionLabel count={12}>Members</SectionLabel>
    );
    await expectNoA11yViolations(container);
  });

  it("Stat has no a11y violations", async () => {
    const { container } = render(
      <div>
        <Stat label="XP" value={1697} />
        <Stat label="Cases" value="3" />
        <Stat label="Streak" value={null} hint="No activity yet" />
      </div>
    );
    await expectNoA11yViolations(container);
  });

  it("Field has no a11y violations (label associated with input)", async () => {
    const { container } = render(
      <Field label="Email address" required hint="we'll send the OTP here">
        <input type="email" placeholder="you@example.edu" />
      </Field>
    );
    await expectNoA11yViolations(container);
  });

  it("EmptyState has no a11y violations", async () => {
    const { container } = render(
      <EmptyState
        title="No classes yet"
        body="Create your first class to get started."
        cta={<Btn>Create class</Btn>}
      />
    );
    await expectNoA11yViolations(container);
  });

  it("ErrorBanner has role='alert' and no a11y violations", async () => {
    const { container, getByRole } = render(
      <ErrorBanner message="Could not load classes." />
    );
    // Screen readers must announce errors live — role=alert is the contract.
    expect(getByRole("alert")).toBeTruthy();
    await expectNoA11yViolations(container);
  });

  it("InlineSpinner has role='status' for screen-reader announcement", async () => {
    const { container, getAllByRole } = render(<InlineSpinner />);
    expect(getAllByRole("status").length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });

  it("Skeleton has role='status'", async () => {
    const { container, getAllByRole } = render(<Skeleton />);
    expect(getAllByRole("status").length).toBeGreaterThan(0);
    await expectNoA11yViolations(container);
  });
});
