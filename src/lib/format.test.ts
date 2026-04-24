import { describe, it, expect } from "vitest";
import { fmtNumber, fmtDate, fmtDateMD, fmtDateTime, fmtTime } from "./format";

describe("fmtNumber", () => {
  it("formats thousands with comma in en-US", () => {
    expect(fmtNumber(1697)).toBe("1,697");
    expect(fmtNumber(1234567)).toBe("1,234,567");
  });

  it("does NOT use Turkish dot-as-thousands separator", () => {
    // Regression for the 1.697 / 1697 confusion bug. If this test starts
    // failing because the rendering becomes "1.697", the en-US lock has
    // regressed somewhere upstream.
    expect(fmtNumber(1697)).not.toBe("1.697");
  });

  it("returns em-dash for nullish or non-finite input", () => {
    expect(fmtNumber(null)).toBe("—");
    expect(fmtNumber(undefined)).toBe("—");
    expect(fmtNumber(NaN)).toBe("—");
    expect(fmtNumber(Infinity)).toBe("—");
  });

  it("handles zero and negatives", () => {
    expect(fmtNumber(0)).toBe("0");
    expect(fmtNumber(-1500)).toBe("-1,500");
  });
});

describe("fmtDate", () => {
  it("renders en-US short date for ISO string", () => {
    expect(fmtDate("2026-04-22T10:00:00Z")).toMatch(/^Apr 22, 2026$/);
  });

  it("does NOT render Turkish month abbreviations", () => {
    // Regression for the "22 Nis 2026" bug.
    const result = fmtDate("2026-04-22T10:00:00Z");
    expect(result).not.toContain("Nis");
    expect(result).toContain("Apr");
  });

  it("accepts Date objects", () => {
    // Use noon UTC so timezone drift doesn't roll the date forward/back.
    const d = new Date("2026-12-31T12:00:00Z");
    expect(fmtDate(d)).toMatch(/Dec 31, 2026/);
  });

  it("returns em-dash for null/undefined/empty/invalid", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate(undefined)).toBe("—");
    expect(fmtDate("")).toBe("—");
    expect(fmtDate("not-a-date")).toBe("—");
  });
});

describe("fmtDateMD", () => {
  it("omits the year", () => {
    const result = fmtDateMD("2026-04-22T10:00:00Z");
    expect(result).toMatch(/Apr 22/);
    expect(result).not.toContain("2026");
  });
});

describe("fmtDateTime", () => {
  it("includes time in en-US 12h format", () => {
    const result = fmtDateTime("2026-04-22T14:15:00Z");
    // Time depends on test runner's tz, but format shape is stable.
    expect(result).toMatch(/Apr 22, 2026,? \d{1,2}:\d{2} (AM|PM)/);
  });
});

describe("fmtTime", () => {
  it("returns time-only en-US 12h format", () => {
    const result = fmtTime("2026-04-22T14:15:00Z");
    expect(result).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);
  });
});
