import { describe, it, expect } from "vitest";
import { glossaryHashForId, parseGlossaryHash, GLOSSARY_HASH_PREFIX } from "./glossaryHash";
import { GLOSSARY } from "../data/glossary";

// Pick the first real entry id once so the tests don't go stale if
// glossary content changes.
const FIRST_ID: string = (GLOSSARY[0] && (GLOSSARY[0] as any).id) || "";

describe("glossaryHashForId", () => {
  it("formats with the documented prefix", () => {
    if (!FIRST_ID) return; // glossary data missing — defer to data tests
    expect(glossaryHashForId(FIRST_ID)).toBe(`${GLOSSARY_HASH_PREFIX}${encodeURIComponent(FIRST_ID)}`);
  });

  it("returns empty string for falsy ids", () => {
    expect(glossaryHashForId("")).toBe("");
    expect(glossaryHashForId(null)).toBe("");
    expect(glossaryHashForId(undefined)).toBe("");
  });

  it("URL-encodes the id (handles slashes, spaces, etc.)", () => {
    expect(glossaryHashForId("foo bar")).toBe(`${GLOSSARY_HASH_PREFIX}foo%20bar`);
  });
});

describe("parseGlossaryHash", () => {
  it("round-trips a real entry id", () => {
    if (!FIRST_ID) return;
    const hash = glossaryHashForId(FIRST_ID);
    expect(parseGlossaryHash(hash)).toEqual({ selectedId: FIRST_ID });
  });

  it("returns null for a hash with the right prefix but unknown id", () => {
    expect(parseGlossaryHash(`${GLOSSARY_HASH_PREFIX}does-not-exist-xyz123`)).toBeNull();
  });

  it("returns null for a hash without the prefix", () => {
    expect(parseGlossaryHash("#anything")).toBeNull();
    expect(parseGlossaryHash("#")).toBeNull();
    expect(parseGlossaryHash("")).toBeNull();
  });

  it("returns null for null/undefined input (defensive)", () => {
    expect(parseGlossaryHash(null)).toBeNull();
    expect(parseGlossaryHash(undefined)).toBeNull();
  });

  it("returns null for the prefix alone (no id)", () => {
    expect(parseGlossaryHash(GLOSSARY_HASH_PREFIX)).toBeNull();
  });
});
