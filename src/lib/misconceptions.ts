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
