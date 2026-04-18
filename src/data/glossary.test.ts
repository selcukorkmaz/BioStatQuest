// @ts-nocheck
import { describe, it, expect } from "vitest";
import { BRANCHES } from "./branches";
import { CASES } from "./cases";
import { METHODS } from "./methods";
import { GLOSSARY, GLOSSARY_BY_ID, GLOSSARY_KIND_META, normalizeGlossaryText } from "./glossary";

describe("Glossary knowledge base", () => {
  it("has unique ids", () => {
    const ids = GLOSSARY.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique terms", () => {
    const terms = GLOSSARY.map((entry) => entry.term);
    expect(new Set(terms).size).toBe(terms.length);
  });

  it("every entry has required fields", () => {
    for (const entry of GLOSSARY) {
      expect(entry.id).toBeTruthy();
      expect(entry.term).toBeTruthy();
      expect(Object.keys(GLOSSARY_KIND_META)).toContain(entry.kind);
      expect(entry.kind).not.toBe("all");
      expect(Object.keys(BRANCHES)).toContain(entry.branch);
      expect(typeof entry.oneLine).toBe("string");
      expect(entry.oneLine.length).toBeGreaterThan(0);
      expect(typeof entry.plainEnglish).toBe("string");
      expect(entry.plainEnglish.length).toBeGreaterThan(0);
      expect(typeof entry.whenToUse).toBe("string");
      expect(entry.whenToUse.length).toBeGreaterThan(0);
      expect(typeof entry.commonMistake).toBe("string");
      expect(entry.commonMistake.length).toBeGreaterThan(0);
      expect(Array.isArray(entry.aliases)).toBe(true);
      expect(Array.isArray(entry.relatedTerms || [])).toBe(true);
      expect(Array.isArray(entry.relatedMethods || [])).toBe(true);
      expect(Array.isArray(entry.relatedCaseIds || [])).toBe(true);
    }
  });

  it("search normalization handles alpha and beta", () => {
    expect(normalizeGlossaryText("Type I Error (α)")).toContain("alpha");
    expect(normalizeGlossaryText("Type II Error (β)")).toContain("beta");
  });

  it("related glossary links resolve", () => {
    for (const entry of GLOSSARY) {
      for (const relatedId of entry.relatedTerms || []) {
        expect(GLOSSARY_BY_ID[relatedId], `${entry.id} -> ${relatedId}`).toBeTruthy();
      }
    }
  });

  it("related method links resolve", () => {
    for (const entry of GLOSSARY) {
      for (const methodId of entry.relatedMethods || []) {
        expect(METHODS[methodId], `${entry.id} -> ${methodId}`).toBeTruthy();
      }
    }
  });

  it("related case links resolve", () => {
    const caseIds = new Set(CASES.map((c) => c.id));
    for (const entry of GLOSSARY) {
      for (const caseId of entry.relatedCaseIds || []) {
        expect(caseIds.has(caseId), `${entry.id} -> ${caseId}`).toBe(true);
      }
    }
  });

  it("includes one method entry per METHODS record", () => {
    const glossaryMethodIds = GLOSSARY.filter((entry) => entry.kind === "method").map((entry) => entry.methodId);
    expect(new Set(glossaryMethodIds).size).toBe(Object.keys(METHODS).length);
    for (const methodId of Object.keys(METHODS)) {
      expect(glossaryMethodIds).toContain(methodId);
    }
  });
});
