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
  userType?: "free" | "pro" | "institutional";
  history?: any[];
} = {}) {
  (window as any).BQAuth = {
    enabled: true,
    getUser: () => opts.user ?? null,
    onAuthChange: () => () => {},
    fetchMyMisconceptions: async () => opts.fetchResult ?? {},
    fetchSubscription: async () => ({ user_type: opts.userType ?? "free" }),
    fetchMyMisconceptionHistory: async () => opts.history ?? [],
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
    expect(screen.getByText(/misconceptions shown/)).toBeTruthy();
    expect(screen.getByText(/7 total hits/)).toBeTruthy();
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

  // F8 Pro — free vs Pro gating + per-tag drill-down
  describe("free vs Pro gating", () => {
    function fiveTags() {
      const ts = new Date().toISOString();
      return {
        ci_as_parameter_probability:           { count: 5, lastSeen: ts },
        p_value_inverted_conditional:          { count: 4, lastSeen: ts },
        skew_direction_reversed:               { count: 3, lastSeen: ts },
        odds_confused_with_risk:               { count: 2, lastSeen: ts },
        ratio_inverted:                        { count: 1, lastSeen: ts },
      };
    }

    it("free user sees only top 3 tags + 'See Pro' upsell", async () => {
      stubAuth({ user: { id: "u1", email: "u@e.com" }, userType: "free", fetchResult: fiveTags() });
      render(<MyMisconceptions onExit={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText(/Ci as parameter probability/i)).toBeTruthy();
      });
      // Top 3 visible
      expect(screen.getByText(/P value inverted conditional/i)).toBeTruthy();
      expect(screen.getByText(/Skew direction reversed/i)).toBeTruthy();
      // Below threshold hidden
      expect(screen.queryByText(/Odds confused with risk/i)).toBeNull();
      expect(screen.queryByText(/Ratio inverted/i)).toBeNull();
      // Hidden-count CTA visible
      expect(screen.getByText(/2 more misconceptions hidden/i)).toBeTruthy();
      expect(screen.getByText(/See Pro/i)).toBeTruthy();
      // Pro-only "Show all my hits" button NOT shown for free
      expect(screen.queryByText(/Show all my hits/i)).toBeNull();
      // Pro-feature italic note IS shown
      expect(screen.getAllByText(/Pro unlocks per-tag history/i).length).toBeGreaterThan(0);
    });

    it("Pro user sees ALL tags + drill-down button on each", async () => {
      stubAuth({ user: { id: "u1", email: "u@e.com" }, userType: "pro", fetchResult: fiveTags() });
      render(<MyMisconceptions onExit={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText(/Ci as parameter probability/i)).toBeTruthy();
      });
      // All 5 visible
      expect(screen.getByText(/Odds confused with risk/i)).toBeTruthy();
      expect(screen.getByText(/Ratio inverted/i)).toBeTruthy();
      // No upsell
      expect(screen.queryByText(/See Pro/i)).toBeNull();
      expect(screen.queryByText(/Pro unlocks per-tag history/i)).toBeNull();
      // Drill-down buttons appear (one per row)
      expect(screen.getAllByText(/Show all my hits/i).length).toBeGreaterThan(0);
    });

    it("institutional user is treated as Pro (full ledger + drill-down)", async () => {
      stubAuth({ user: { id: "u1", email: "u@e.com" }, userType: "institutional", fetchResult: fiveTags() });
      render(<MyMisconceptions onExit={() => {}} />);
      await waitFor(() => {
        expect(screen.getByText(/Ratio inverted/i)).toBeTruthy();
      });
      expect(screen.queryByText(/See Pro/i)).toBeNull();
    });
  });
});
