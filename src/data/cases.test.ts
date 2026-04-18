import { describe, it, expect } from "vitest";
import { CASES } from "./cases";
import { METHODS } from "./methods";
import { BRANCHES } from "./branches";

const DIFFICULTIES = ["intern", "resident", "fellow", "pi"];

describe("Case bank structural validation", () => {
  it("has at least one case", () => {
    expect(CASES.length).toBeGreaterThan(0);
  });

  it("has no sparse-array holes (stray commas)", () => {
    // `CASES[i] === undefined` doesn't catch holes — sparse slots are skipped by most
    // iterators (including the for..of above) but still counted by .length, and they
    // crash `.find(x => x.id === ...)` because `find` visits holes as `undefined`.
    const holes = [];
    for (let i = 0; i < CASES.length; i++) {
      if (!(i in CASES)) holes.push(i);
    }
    expect(holes, `sparse holes at indices ${holes.join(", ")}`).toEqual([]);
  });

  it("has unique case ids", () => {
    const ids = CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  CASES.forEach((c, idx) => {
    if (!c) throw new Error(`CASES[${idx}] is undefined`);
    describe(`case ${c.id} (${c.title})`, () => {
      it("has required top-level fields", () => {
        expect(c.id).toBeTruthy();
        expect(c.title).toBeTruthy();
        expect(c.story).toBeTruthy();
        expect(typeof c.qPerRun).toBe("number");
        expect(c.qPerRun).toBeGreaterThan(0);
        expect(Array.isArray(c.bank)).toBe(true);
        expect(c.bank.length).toBeGreaterThanOrEqual(c.qPerRun);
      });

      it("references a valid branch", () => {
        expect(Object.keys(BRANCHES)).toContain(c.branch);
      });

      it("declares a valid minimum difficulty", () => {
        expect(DIFFICULTIES).toContain(c.diffMin);
      });

      it("has unique qids within the bank", () => {
        const qids = c.bank.map((q) => q.qid);
        expect(new Set(qids).size).toBe(qids.length);
      });

      for (const q of c.bank) {
        describe(`q ${q.qid}`, () => {
          it("has a non-empty prompt and explanation", () => {
            expect(q.q).toBeTruthy();
            expect(q.explain).toBeTruthy();
          });

          it("has a supported question type", () => {
            expect(["mcq", "multi", "numeric"]).toContain(q.type);
          });

          if (q.type === "mcq") {
            const options = q.options as string[];
            const answer = q.answer as number;
            it("has ≥2 options", () => {
              expect(Array.isArray(options)).toBe(true);
              expect(options.length).toBeGreaterThanOrEqual(2);
            });

            it("has exactly one answer index within bounds", () => {
              expect(typeof answer).toBe("number");
              expect(Number.isInteger(answer)).toBe(true);
              expect(answer).toBeGreaterThanOrEqual(0);
              expect(answer).toBeLessThan(options.length);
            });

            it("has no duplicate option strings", () => {
              expect(new Set(options).size).toBe(options.length);
            });
          }

          if (q.type === "multi") {
            const options = q.options as string[];
            const answer = q.answer as number[];
            it("has ≥2 options", () => {
              expect(Array.isArray(options)).toBe(true);
              expect(options.length).toBeGreaterThanOrEqual(2);
            });

            it("has an answer array of in-bounds, unique indices", () => {
              expect(Array.isArray(answer)).toBe(true);
              expect(answer.length).toBeGreaterThanOrEqual(1);
              expect(new Set(answer).size).toBe(answer.length);
              for (const idx of answer) {
                expect(Number.isInteger(idx)).toBe(true);
                expect(idx).toBeGreaterThanOrEqual(0);
                expect(idx).toBeLessThan(options.length);
              }
            });

            it("has no duplicate option strings", () => {
              expect(new Set(options).size).toBe(options.length);
            });
          }

          if (q.type === "numeric") {
            it("has a numeric answer and tolerance", () => {
              expect(typeof q.answer).toBe("number");
              expect(Number.isFinite(q.answer)).toBe(true);
              expect(typeof q.tol).toBe("number");
              expect(q.tol).toBeGreaterThanOrEqual(0);
            });
          }

          if (q.method !== undefined) {
            it(`references a known method (${q.method})`, () => {
              expect(Object.keys(METHODS)).toContain(q.method);
            });
          }
        });
      }
    });
  });
});

describe("Method deep-dives", () => {
  it("every METHODS entry has title + intuition", () => {
    for (const [id, m] of Object.entries(METHODS)) {
      expect(m.title, `${id} missing title`).toBeTruthy();
      expect(m.intuition, `${id} missing intuition`).toBeTruthy();
    }
  });
});

describe("Branches", () => {
  it("every BRANCHES entry has name + color + icon", () => {
    for (const [id, b] of Object.entries(BRANCHES)) {
      expect(b.name, `${id} missing name`).toBeTruthy();
      expect(b.color, `${id} missing color`).toBeTruthy();
      expect(b.icon, `${id} missing icon`).toBeTruthy();
    }
  });
});
