// Glossary URL-hash plumbing. Lives in lib/ rather than the Glossary
// view so App's initial-view resolver can call it without pulling the
// full Glossary chunk into the main bundle.
//
// Hash format: `#glossary:<encoded-id>` — e.g. `#glossary:cox_ph`.
// We use a hash (not a query param) because hash-only navigation
// doesn't trigger a full reload and survives the URL rewrites in
// vercel.json.

import { GLOSSARY_BY_ID } from "../data/glossary";

export const GLOSSARY_HASH_PREFIX = "#glossary:";

/** Build the canonical hash for a glossary entry id. Returns "" for falsy id. */
export function glossaryHashForId(id: string | null | undefined): string {
  return id ? `${GLOSSARY_HASH_PREFIX}${encodeURIComponent(id)}` : "";
}

/**
 * Parse a `#glossary:<id>` hash. Returns the resolved entry id when:
 *   • the hash starts with the prefix,
 *   • the decoded id is a key in GLOSSARY_BY_ID.
 *
 * Otherwise null — including for malformed prefixes, missing ids, or
 * ids that don't resolve to a known entry.
 */
export function parseGlossaryHash(hash: string | null | undefined): { selectedId: string } | null {
  const raw = String(hash || "").trim();
  if (!raw.startsWith(GLOSSARY_HASH_PREFIX)) return null;
  const id = decodeURIComponent(raw.slice(GLOSSARY_HASH_PREFIX.length));
  if (!id || !(GLOSSARY_BY_ID as any)[id]) return null;
  return { selectedId: id };
}
