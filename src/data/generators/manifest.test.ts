// The manifest duplicates family metadata so the app can answer "is this qid a
// family?", "which method is it?" and "which families does this case claim?"
// without pulling the ~57 KB of generator code into the main bundle.
//
// Duplication is only safe if it can't drift. These tests are the mechanism:
// they compare the manifest against the real families field by field, IN ORDER,
// so adding a family to ./index.ts without updating ./manifest.ts fails the
// build rather than silently shipping a family the app can never draw.

import { describe, it, expect } from "vitest";
import { FAMILIES as REAL_FAMILIES } from "./index";
import { FAMILY_MANIFEST } from "./manifest";
import * as lazy from "./lazy";

describe("generators — manifest ↔ families conformance", () => {
  it("covers every family, in the same order", () => {
    expect(FAMILY_MANIFEST.map((f) => f.fid)).toEqual(
      REAL_FAMILIES.map((f) => f.fid),
    );
  });

  it("carries the same title, method and difficulty floor for each family", () => {
    for (const real of REAL_FAMILIES) {
      const meta = FAMILY_MANIFEST.find((m) => m.fid === real.fid);
      expect(meta, `manifest is missing ${real.fid}`).toBeTruthy();
      expect(meta!.title, `title drift on ${real.fid}`).toBe(real.title);
      expect(meta!.method, `method drift on ${real.fid}`).toBe(real.method);
      expect(meta!.diffMin, `diffMin drift on ${real.fid}`).toBe(real.diffMin);
    }
  });

  it("has no duplicate fids", () => {
    const fids = FAMILY_MANIFEST.map((f) => f.fid);
    expect(new Set(fids).size).toBe(fids.length);
  });
});

describe("generators — lazy façade", () => {
  it("answers metadata questions without loading the generator chunk", () => {
    // The whole point: these must work before any dynamic import resolves.
    expect(lazy.generatorsReady()).toBe(false);
    expect(lazy.FAMILIES.length).toBe(REAL_FAMILIES.length);
    expect(lazy.isFamilyQid(REAL_FAMILIES[0].fid)).toBe(true);
    expect(lazy.isFamilyQid("q_not_a_family")).toBe(false);
    expect(lazy.FAMILY_BY_ID.get(REAL_FAMILIES[0].fid)?.method).toBe(
      REAL_FAMILIES[0].method,
    );
  });

  it("draws nothing — rather than throwing — before the chunk loads", () => {
    // Every call site guards on null; this locks in that a cold draw is a
    // no-op instead of a crash or an exception the run composer can't handle.
    expect(lazy.drawFamilyQuestion(REAL_FAMILIES[0].fid)).toBeNull();
    expect(lazy.drawForMethods([REAL_FAMILIES[0].method])).toEqual([]);
  });

  it("familiesForMethods filters by method and preserves manifest order", () => {
    const methods = [REAL_FAMILIES[2].method, REAL_FAMILIES[0].method];
    const got = lazy.familiesForMethods(methods).map((f) => f.fid);
    const want = FAMILY_MANIFEST.filter((f) => methods.includes(f.method)).map((f) => f.fid);
    expect(got).toEqual(want);
  });

  it("draws real questions once ensureGenerators() resolves", async () => {
    await lazy.ensureGenerators();
    expect(lazy.generatorsReady()).toBe(true);
    for (const real of REAL_FAMILIES) {
      const q = lazy.drawFamilyQuestion(real.fid, 12345);
      expect(q, `no draw for ${real.fid}`).toBeTruthy();
      // Invariant 1 from core.ts: the instance's qid IS the family id.
      expect(q!.qid).toBe(real.fid);
      expect(q!.method).toBe(real.method);
    }
  });

  it("drawForMethods works after load and tags every instance correctly", async () => {
    await lazy.ensureGenerators();
    const method = REAL_FAMILIES[0].method;
    const drawn = lazy.drawForMethods([method], 999);
    expect(drawn.length).toBeGreaterThan(0);
    for (const q of drawn) expect(q.method).toBe(method);
  });
});
