// @vitest-environment jsdom
//
// Tests the provider routing contract for billing.ts. After the
// Stripe → Lemon Squeezy migration, the same client functions must hit
// different endpoints depending on which provider issued (or will issue)
// the subscription. Locks in:
//
//   1. New buyers default to Lemon Squeezy (DEFAULT_PROVIDER).
//   2. Explicit provider="stripe" still hits Stripe (legacy customers
//      who already have a Stripe subscription).
//   3. openPortal routes by provider so legacy Stripe customers don't
//      get sent to the Lemon Squeezy portal.
//
// The fetch implementation is mocked; we only assert which path was hit.

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

// Hoisted mock — billing.ts grabs createClient at import time, so the mock
// must replace the module BEFORE billing's import runs. vi.mock is hoisted
// to the top of the file by Vitest; vi.doMock is NOT and silently no-ops here.
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: "fake.access.token" } } }) },
  }),
}));

import { billing, DEFAULT_PROVIDER } from "./billing";

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];

beforeEach(() => {
  calls = [];

  // Stub Supabase access-token retrieval. billing.ts builds a fresh client
  // and calls c.auth.getSession(); here we replace fetch so we don't need
  // a real Supabase, and stub BQAuth so getAccessToken's gate passes.
  (window as any).BQAuth = {
    enabled: true,
    getUser: () => ({ id: "u1" }),
  };
  (window as any).__SUPABASE_URL = "https://example.supabase.co";
  (window as any).__SUPABASE_ANON_KEY = "anon-key";

  // Mock fetch for both the Supabase auth-session call and our billing
  // endpoint. Supabase's getSession() under the hood hits /auth/v1/token
  // or returns the cached session — we short-circuit by stubbing
  // Supabase's createClient via mock instead.
  vi.stubGlobal("fetch", vi.fn(async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input.url;
    calls.push({ url, init });
    return new Response(JSON.stringify({ url: "https://example.com/redirect" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }));

});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

// Block window.location.href assignments — billing.* sets location.href to
// redirect to the checkout/portal URL, which would crash jsdom or navigate
// the test page. Replace location with a plain object whose href setter is
// a no-op recorder.
function withMockedNav<T>(fn: () => T | Promise<T>): Promise<T> {
  const original = Object.getOwnPropertyDescriptor(window, "location")!;
  const recorder = {
    _href: "",
    get href() { return this._href; },
    set href(v: string) { this._href = v; },
  };
  Object.defineProperty(window, "location", {
    configurable: true,
    value: recorder,
  });
  return Promise.resolve(fn()).finally(() => {
    Object.defineProperty(window, "location", original);
  });
}

describe("billing — provider-aware routing", () => {
  it("DEFAULT_PROVIDER is lemonsqueezy after the v2 cutover", () => {
    expect(DEFAULT_PROVIDER).toBe("lemonsqueezy");
    expect(billing.DEFAULT_PROVIDER).toBe("lemonsqueezy");
  });

  it("startCheckout with no provider hits the Lemon Squeezy endpoint", async () => {
    await withMockedNav(async () => {
      await billing.startCheckout("monthly");
    });
    expect(calls.some((c) => c.url.endsWith("/api/lemonsqueezy/checkout"))).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/api/stripe/checkout"))).toBe(false);
  });

  it("startCheckout with provider='stripe' still hits Stripe", async () => {
    await withMockedNav(async () => {
      await billing.startCheckout("yearly", "stripe");
    });
    expect(calls.some((c) => c.url.endsWith("/api/stripe/checkout"))).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/api/lemonsqueezy/checkout"))).toBe(false);
  });

  it("openPortal routes Stripe customers to Stripe portal", async () => {
    await withMockedNav(async () => {
      await billing.openPortal("stripe");
    });
    expect(calls.some((c) => c.url.endsWith("/api/stripe/portal"))).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/api/lemonsqueezy/portal"))).toBe(false);
  });

  it("openPortal routes Lemon Squeezy customers to Lemon Squeezy portal", async () => {
    await withMockedNav(async () => {
      await billing.openPortal("lemonsqueezy");
    });
    expect(calls.some((c) => c.url.endsWith("/api/lemonsqueezy/portal"))).toBe(true);
    expect(calls.some((c) => c.url.endsWith("/api/stripe/portal"))).toBe(false);
  });

  it("openPortal default falls back to the configured DEFAULT_PROVIDER", async () => {
    await withMockedNav(async () => {
      await billing.openPortal();
    });
    const expected = DEFAULT_PROVIDER === "lemonsqueezy"
      ? "/api/lemonsqueezy/portal"
      : "/api/stripe/portal";
    expect(calls.some((c) => c.url.endsWith(expected))).toBe(true);
  });
});
