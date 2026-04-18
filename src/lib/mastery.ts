// Per-method mastery — derived live from srs + CASES.
// `reviewed`  = questions the user has answered ≥1 time correctly (reps ≥ 2).
// `mastered`  = questions on a long interval (reps ≥ 4, interval ≥ 21 days).
import { CASES } from "../data/cases";

export type MasterySummary = {
  total: number;
  attempted: number;
  reviewed: number;
  mastered: number;
};

export function getMethodMastery(methodId: string | null | undefined, srs: Record<string, any>): MasterySummary {
  if (!methodId) return { total: 0, attempted: 0, reviewed: 0, mastered: 0 };
  const qids: string[] = [];
  for (const c of CASES) {
    for (const q of c.bank) {
      if (q.method === methodId && q.qid) qids.push(q.qid);
    }
  }
  let attempted = 0, reviewed = 0, mastered = 0;
  for (const qid of qids) {
    const s = srs && srs[qid];
    if (!s) continue;
    attempted++;
    if ((s.reps || 0) >= 2) reviewed++;
    if ((s.reps || 0) >= 4 && (s.interval || 0) >= 21) mastered++;
  }
  return { total: qids.length, attempted, reviewed, mastered };
}
