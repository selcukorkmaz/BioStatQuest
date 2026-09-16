// Per-case "already answered" ledger.
//
// Two rules, both easy to break silently:
//
//   1. Only AUTHORED bank questions belong here. A generated item's qid is its
//      family id, which is reused for every instance — counting it would both
//      inflate the ledger and claim a question was "seen" when the learner will
//      never meet that instance again.
//   2. When every bank question has been answered the ledger resets, so the
//      next run starts a fresh cycle instead of having nothing left to offer.
//      Rule 1 is what makes that threshold correct: without it a case claiming
//      four families would recycle four authored questions too early.

export type SeenMap = Record<string, string[]>;

export function updateSeenQuestions(
  seen: SeenMap,
  caseId: string,
  answeredQids: string[],
  bankSize: number,
  isGeneratedQid: (qid: string) => boolean,
): SeenMap {
  const next = { ...seen };
  const cur = new Set(next[caseId] || []);
  for (const qid of answeredQids) {
    if (!qid || isGeneratedQid(qid)) continue;
    cur.add(qid);
  }
  next[caseId] = cur.size >= bankSize ? [] : [...cur];
  return next;
}
