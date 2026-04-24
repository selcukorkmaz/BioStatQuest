// Diagnostic scoring + study-path generation, extracted from App.tsx for
// testability. Pure functions — no React, no globals, no side effects.
// `buildStudyPath` takes the case bank as a parameter so tests can pin
// the bank rather than depending on the live data file.

import { BRANCHES } from "../data/branches";
import { CASES } from "../data/cases";

export type DiagnosticAnswer = {
  branch: string;
  method?: string;
  correct: boolean;
  // Other fields (id, picked) may be present but aren't used for scoring.
};

export type BranchScore = { correct: number; total: number };

export type DiagnosticProfile = {
  byBranch: Record<string, BranchScore>;
  overallPct: number;          // 0..1
  band: "emerging" | "developing" | "strong";
  totalCorrect: number;
  totalAnswered: number;
};

export type StudyPathStep = {
  caseId: string;
  branch: string;
  reason: string;
  kind: "gap" | "strength";
};

type CaseLike = { id: string; branch: string };

/**
 * Score a sequence of diagnostic answers.
 * Bands: <40% emerging, <70% developing, ≥70% strong.
 */
export function scoreDiagnostic(answers: DiagnosticAnswer[]): DiagnosticProfile {
  const byBranch: Record<string, BranchScore> = {};
  for (const a of answers) {
    byBranch[a.branch] = byBranch[a.branch] || { correct: 0, total: 0 };
    byBranch[a.branch].total++;
    if (a.correct) byBranch[a.branch].correct++;
  }
  const totalAnswered = answers.length;
  const totalCorrect = answers.filter((a) => a.correct).length;
  const overallPct = totalAnswered > 0 ? totalCorrect / totalAnswered : 0;
  const band: DiagnosticProfile["band"] =
    overallPct < 0.4 ? "emerging" : overallPct < 0.7 ? "developing" : "strong";
  return { byBranch, overallPct, band, totalCorrect, totalAnswered };
}

/**
 * Turn a profile into a 3-case curated path:
 *   - up to 2 weakest branches → one "gap" case each
 *   - strongest branch (if not already in weakest) → one "strength" case
 *
 * Deterministic given the same (profile, state, cases): no randomness.
 * Prefers cases the learner hasn't completed yet; falls back to the first
 * case in that branch if every case in the branch is already done.
 *
 * `cases` defaults to the live bank but can be overridden in tests.
 */
export function buildStudyPath(
  profile: DiagnosticProfile | null | undefined,
  state: { completed?: string[] } | null | undefined,
  cases: readonly CaseLike[] = CASES
): StudyPathStep[] {
  if (!profile || !profile.byBranch) return [];
  const branchKeys = Object.keys(BRANCHES);

  // Branches the diagnostic actually probed, ranked weakest → strongest.
  // Unscored branches drop out so we never recommend a branch we didn't see.
  const ranked = branchKeys
    .filter((b) => profile.byBranch[b])
    .map((b) => {
      const { correct, total } = profile.byBranch[b];
      return { branch: b, pct: total > 0 ? correct / total : 0, correct, total };
    })
    .sort((a, b) => a.pct - b.pct);

  if (ranked.length === 0) return [];

  const completed = new Set(state?.completed || []);
  const firstUnplayedIn = (branch: string) =>
    cases.find((c) => c.branch === branch && !completed.has(c.id)) ||
    cases.find((c) => c.branch === branch);

  const path: StudyPathStep[] = [];
  const weakest = ranked.slice(0, Math.min(2, ranked.length));
  const strongest = ranked[ranked.length - 1];

  for (const w of weakest) {
    const c = firstUnplayedIn(w.branch);
    if (c && !path.find((p) => p.caseId === c.id)) {
      path.push({
        caseId: c.id,
        branch: w.branch,
        reason: `Biggest gap: ${(BRANCHES as any)[w.branch].name}`,
        kind: "gap",
      });
    }
  }

  if (strongest && !weakest.find((w) => w.branch === strongest.branch)) {
    const c = firstUnplayedIn(strongest.branch);
    if (c && !path.find((p) => p.caseId === c.id)) {
      path.push({
        caseId: c.id,
        branch: strongest.branch,
        reason: `Build on strength: ${(BRANCHES as any)[strongest.branch].name}`,
        kind: "strength",
      });
    }
  }
  return path;
}

/** Recommended difficulty floor based on band. */
export function recommendedDifficultyFromBand(band: DiagnosticProfile["band"]): string {
  if (band === "strong") return "resident";
  return "intern";
}

/** Display label for the diagnostic band. */
export function bandLabel(band: DiagnosticProfile["band"]): string {
  return band === "strong" ? "Strong" : band === "developing" ? "Developing" : "Emerging";
}
