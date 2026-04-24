// Per-branch accuracy rollup, factored out of TeachView's InsightsTab so
// it can be unit-tested without rendering React.
//
// The rollup aggregates `per_method` rows from /api/classes/insights into
// per-branch totals using METHOD_BRANCH. The previous version aggregated
// per_case using cases.ts branch metadata — that produced wrong numbers
// whenever a case contained questions tagged with methods naturally
// belonging to a different branch (e.g. a CI question inside a regression
// case attributed CI struggles to "regression").

import { METHOD_BRANCH } from "../data/methods";

export type PerMethodRow = { method: string; attempts: number; correct: number };
export type BranchTotal = { branch: string; attempts: number; correct: number };

/**
 * Sum per-method rows into per-branch totals using METHOD_BRANCH.
 * Methods without a branch attribution are silently dropped — a sentinel
 * the test suite catches via the methods.test.ts coverage check.
 */
export function rollupBranches(perMethod: PerMethodRow[]): Map<string, { attempts: number; correct: number }> {
  const out = new Map<string, { attempts: number; correct: number }>();
  for (const row of perMethod) {
    const branch = METHOD_BRANCH[row.method];
    if (!branch) continue;
    const cur = out.get(branch) || { attempts: 0, correct: 0 };
    cur.attempts += row.attempts;
    cur.correct += row.correct;
    out.set(branch, cur);
  }
  return out;
}
