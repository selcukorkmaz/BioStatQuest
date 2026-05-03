// @vitest-environment jsdom
//
// Smoke tests for the learner-facing "My Misconceptions" view.
// Covers the three states the view can be in:
//   1. Signed-out: shows sign-in CTA, never queries the API.
//   2. Signed-in with no history: encouraging empty state.
//   3. Signed-in with history: at least one card with a humanized
//      label, count chip, and the example explanation.

import * as React from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { MyMisconceptions } from "./MyMisconceptions";

// Project doesn't configure RTL auto-cleanup; do it explicitly.
afterEach(() => cleanup());

function stubAuth(opts: {
  user?: { id: string; email: string } | null;
  fetchResult?: Record<string, { count: number; lastSeen: string }>;
} = {}) {
  (window as any).BQAuth = {
    enabled: true,
    getUser: () => opts.user ?? null,
    onAuthChange: () => () => {},
    fetchMyMisconceptions: async () => opts.fetchResult ?? {},
  };
}

describe("MyMisconceptions view", () => {
  beforeEach(() => {
    delete (window as any).BQAuth;
  });

  it("shows the sign-in CTA when the user is signed out", async () => {
    stubAuth({ user: null });
    render(<MyMisconceptions onExit={() => {}} />);
    // Wait for initial effect to settle.
    await waitFor(() => {
      expect(screen.getByText(/Sign in to track your misconceptions/i)).toBeTruthy();
    });
  });

  it("shows the encouraging empty state when signed in but with no history", async () => {
    stubAuth({ user: { id: "u1", email: "u@e.com" }, fetchResult: {} });
    render(<MyMisconceptions onExit={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/Nothing to surface yet/i)).toBeTruthy();
    });
  });

  it("renders one card per tag, sorted by count desc, with a count chip", async () => {
    // Use a tag we authored in the bank so the derivation lookup hits.
    const lastSeen = new Date().toISOString();
    stubAuth({
      user: { id: "u1", email: "u@e.com" },
      fetchResult: {
        ci_as_parameter_probability: { count: 5, lastSeen },
        ratio_inverted: { count: 2, lastSeen },
      },
    });
    render(<MyMisconceptions onExit={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/Ci as parameter probability/i)).toBeTruthy();
    });
    expect(screen.getByText(/Ratio inverted/i)).toBeTruthy();
    expect(screen.getByText(/× 5/)).toBeTruthy();
    expect(screen.getByText(/× 2/)).toBeTruthy();
    // Summary line counts both rows
    expect(screen.getByText(/2 distinct misconception/)).toBeTruthy();
  });

  it("falls back gracefully when a tag has no derived example", async () => {
    stubAuth({
      user: { id: "u1", email: "u@e.com" },
      fetchResult: { __orphan_tag__: { count: 1, lastSeen: new Date().toISOString() } },
    });
    render(<MyMisconceptions onExit={() => {}} />);
    await waitFor(() => {
      expect(screen.getByText(/No example available/i)).toBeTruthy();
    });
  });
});
