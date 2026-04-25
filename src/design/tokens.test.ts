import { describe, it, expect } from "vitest";
import { toneStyle, colors, type Tone } from "./tokens";

describe("toneStyle", () => {
  it("returns the documented (background, borderColor, color) triple per tone", () => {
    expect(toneStyle("warn")).toEqual({
      background: colors.warnTint,
      borderColor: colors.warnLine,
      color: colors.warn,
    });
    expect(toneStyle("ok")).toEqual({
      background: colors.okTint,
      borderColor: colors.okLine,
      color: colors.ok,
    });
    expect(toneStyle("err")).toEqual({
      background: colors.errTint,
      borderColor: colors.errLine,
      color: colors.err,
    });
    expect(toneStyle("info")).toEqual({
      background: colors.infoTint,
      borderColor: colors.infoLine,
      color: colors.info,
    });
    expect(toneStyle("neutral")).toEqual({
      background: colors.neutralTint,
      borderColor: colors.neutralLine,
      color: colors.neutral,
    });
  });

  it("falls back to neutral for unknown tones (defensive — guards against typos)", () => {
    expect(toneStyle("garbage" as Tone)).toEqual(toneStyle("neutral"));
  });
});

describe("colors palette", () => {
  it("solid + tint + line triplets exist for every state", () => {
    const states = ["warn", "ok", "err", "info", "neutral"] as const;
    for (const s of states) {
      expect(colors).toHaveProperty(s);
      expect(colors).toHaveProperty(`${s}Tint`);
      expect(colors).toHaveProperty(`${s}Line`);
    }
  });

  it("tint and line values are RGBA strings (so consumers can compose them inline)", () => {
    expect(colors.warnTint).toMatch(/^rgba\(/);
    expect(colors.warnLine).toMatch(/^rgba\(/);
    expect(colors.okTint).toMatch(/^rgba\(/);
  });
});
