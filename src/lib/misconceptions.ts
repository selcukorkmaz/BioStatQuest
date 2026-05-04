// F8 — misconception taxonomy derivation. We don't yet have a hand-curated
// dictionary of human-readable labels and remediation snippets for every
// misconception_tag in the bank; for the v0 ledger view we derive them
// from the questions where each tag is authored.
//
// For any tag, we return the FIRST question that uses it as the source of
// truth: that question's stem (sets the context), the picked distractor's
// option text (concrete what-they-saw), and the distractor's explanation
// (the pedagogical correction). Sufficient to render a useful "you fell
// for this; here's why" card without writing a parallel taxonomy file.
//
// When a curated taxonomy lands later, swap the data source — callers
// should keep using getMisconceptionMeta(tag).

import { CASES } from "../data/cases";

export type MisconceptionMeta = {
  tag: string;
  label: string;            // humanized tag, e.g. "ci_as_parameter_probability" → "Ci as parameter probability"
  qid: string;
  caseId: string;
  method?: string;
  exampleStem: string;
  exampleOption: string;    // the distractor option text the learner picked
  whyWrong: string;         // optionExplanations[idx] for that distractor
};

// Title-case + replace underscores. "ci_as_parameter_probability" →
// "Ci as parameter probability". Not perfect English, but good enough for a
// label and consistent until a curated dictionary exists.
export function humanizeTag(tag: string): string {
  if (!tag) return "";
  const spaced = tag.replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Build the lookup once at module load. Walks every question's
// misconceptionTag map and indexes the FIRST occurrence we find. Subsequent
// occurrences are ignored — picking one canonical example keeps the view
// stable regardless of question order.
const TAG_INDEX: Record<string, MisconceptionMeta> = (() => {
  const out: Record<string, MisconceptionMeta> = {};
  for (const c of CASES) {
    if (!c?.bank) continue;
    for (const q of c.bank) {
      const tagMap = q.misconceptionTag;
      if (!tagMap) continue;
      for (const [k, tag] of Object.entries(tagMap)) {
        if (!tag || out[tag]) continue;
        const idx = Number(k);
        const opt = q.options?.[idx] ?? "";
        const why = q.optionExplanations?.[idx] ?? "";
        if (!opt && !why) continue;        // skip degenerate entries
        out[tag] = {
          tag,
          label: humanizeTag(tag),
          qid: q.qid ?? `${c.id}_?`,
          caseId: c.id,
          method: q.method,
          exampleStem: q.q,
          exampleOption: opt,
          whyWrong: why,
        };
      }
    }
  }
  return out;
})();

export function getMisconceptionMeta(tag: string): MisconceptionMeta | null {
  return TAG_INDEX[tag] ?? null;
}

// All known tags — useful for the test that enforces 1:1 between authored
// tags and discoverable metadata.
export function listAllMisconceptionTags(): string[] {
  return Object.keys(TAG_INDEX);
}

export type CaseRefForTag = {
  caseId: string;
  caseTitle: string;
  branch: string;
  qids: string[];          // every question in this case that uses the tag
};

// Build a tag → case[] index so the per-tag drill-down can offer a
// "study this misconception" queue. Walks the bank once at module load.
// Cases are sorted by hit count (more questions targeting the tag = more
// concentrated practice) then by id for stability.
const TAG_TO_CASES: Record<string, CaseRefForTag[]> = (() => {
  const out: Record<string, Map<string, CaseRefForTag>> = {};
  for (const c of CASES) {
    if (!c?.bank) continue;
    for (const q of c.bank) {
      const tagMap = (q as any).misconceptionTag;
      if (!tagMap) continue;
      const tagsHere = new Set<string>();
      for (const tag of Object.values(tagMap as Record<string, string>)) {
        if (tag) tagsHere.add(tag);
      }
      for (const tag of tagsHere) {
        if (!out[tag]) out[tag] = new Map();
        const existing = out[tag].get(c.id);
        if (existing) {
          existing.qids.push(q.qid);
        } else {
          out[tag].set(c.id, {
            caseId: c.id,
            caseTitle: (c as any).title || c.id,
            branch: (c as any).branch || "",
            qids: [q.qid],
          });
        }
      }
    }
  }
  const sorted: Record<string, CaseRefForTag[]> = {};
  for (const [tag, m] of Object.entries(out)) {
    sorted[tag] = Array.from(m.values()).sort((a, b) =>
      (b.qids.length - a.qids.length) || a.caseId.localeCompare(b.caseId),
    );
  }
  return sorted;
})();

// Returns up to `limit` cases that contain questions tagged with this
// misconception, ranked by question-count (more = higher concentration).
// Empty array if the tag is unknown.
export function getCasesForTag(tag: string, limit = 3): CaseRefForTag[] {
  const all = TAG_TO_CASES[tag];
  if (!all) return [];
  return all.slice(0, limit);
}
