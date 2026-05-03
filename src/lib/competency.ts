// F16 — competency map. Promotes the per-method SRS rollup (mastery.ts)
// into a 4-tier ladder used by both the Competency view (free + Pro) and
// the Statement of Competency print page (Pro).
//
// The tiers are deliberately conservative — calling a learner "Mastered"
// is a public claim, so the threshold favours the conservative side.
// They are derived from SRS state only (FSRS reviews, accessible client-
// side); a future v0.1 can blend in question_attempts accuracy from F2
// telemetry for richer signal.

import { METHODS, METHOD_BRANCH } from "../data/methods";
import { BRANCHES } from "../data/branches";
import { getMethodMastery, type MasterySummary } from "./mastery";

export type Tier = "untouched" | "familiar" | "practiced" | "proficient" | "mastered";

export const TIER_ORDER: Tier[] = ["untouched", "familiar", "practiced", "proficient", "mastered"];

export const TIER_META: Record<Tier, { label: string; color: string; description: string }> = {
  untouched: { label: "Untouched", color: "#475569", description: "No attempts yet on questions tagged with this method." },
  familiar:  { label: "Familiar",  color: "#0ea5e9", description: "At least one attempt — the topic is on your radar." },
  practiced: { label: "Practiced", color: "#8b5cf6", description: "You've worked through ≥30% of the bank and demonstrated correct recall on at least one." },
  proficient:{ label: "Proficient",color: "#22c55e", description: "≥50% of the bank reviewed (≥2 correct reps each) and at least one item on a long-interval mastery schedule." },
  mastered:  { label: "Mastered",  color: "#f59e0b", description: "≥60% of the bank held at long-interval recall (≥4 reps, ≥21-day interval) — the conservative bar for an external statement." },
};

// Compute the tier from an SRS rollup. Walks the ladder top-down; first
// matching tier wins. `max(1, …)` stops single-question methods from
// being unreachable for the higher tiers.
export function tierFromMastery(s: MasterySummary): Tier {
  const total = s.total | 0;
  if (total === 0) return "untouched";
  const reqMastered  = Math.max(1, Math.ceil(total * 0.6));
  const reqReviewed  = Math.max(1, Math.ceil(total * 0.5));
  const reqAttempted = Math.max(1, Math.ceil(total * 0.3));
  if (s.mastered >= reqMastered) return "mastered";
  if (s.reviewed >= reqReviewed && s.mastered >= 1) return "proficient";
  if (s.attempted >= reqAttempted && s.reviewed >= 1) return "practiced";
  if (s.attempted >= 1) return "familiar";
  return "untouched";
}

export type MethodCompetency = {
  methodId: string;
  title: string;
  branch: string;
  tier: Tier;
  stats: MasterySummary;
};

// Per-method competency for every known method. Methods without a branch
// mapping fall back to "foundations" so the view can still group them.
export function computeCompetency(srs: Record<string, any>): MethodCompetency[] {
  const out: MethodCompetency[] = [];
  for (const [id, m] of Object.entries(METHODS)) {
    const stats = getMethodMastery(id, srs);
    out.push({
      methodId: id,
      title: (m as any).title,
      branch: (METHOD_BRANCH as any)[id] || "foundations",
      tier: tierFromMastery(stats),
      stats,
    });
  }
  return out;
}

export type BranchCompetency = {
  branch: string;
  branchName: string;
  branchColor: string;
  methods: MethodCompetency[];        // ordered: highest tier first
  tierCounts: Record<Tier, number>;
};

export function groupByBranch(methods: MethodCompetency[]): BranchCompetency[] {
  const acc: Record<string, MethodCompetency[]> = {};
  for (const m of methods) {
    if (!acc[m.branch]) acc[m.branch] = [];
    acc[m.branch].push(m);
  }
  const tierRank = Object.fromEntries(TIER_ORDER.map((t, i) => [t, i])) as Record<Tier, number>;
  return Object.entries(acc).map(([branch, ms]) => {
    const sorted = ms.slice().sort((a, b) => tierRank[b.tier] - tierRank[a.tier] || a.title.localeCompare(b.title));
    const counts: Record<Tier, number> = { untouched: 0, familiar: 0, practiced: 0, proficient: 0, mastered: 0 };
    for (const m of sorted) counts[m.tier] += 1;
    return {
      branch,
      branchName: (BRANCHES as any)[branch]?.name ?? branch,
      branchColor: (BRANCHES as any)[branch]?.color ?? "#64748b",
      methods: sorted,
      tierCounts: counts,
    };
  }).sort((a, b) => a.branchName.localeCompare(b.branchName));
}

export type CompetencyOverview = {
  total: number;                     // total methods in the catalog
  byTier: Record<Tier, number>;
  branches: BranchCompetency[];
};

export function overviewFromSrs(srs: Record<string, any>): CompetencyOverview {
  const methods = computeCompetency(srs);
  const branches = groupByBranch(methods);
  const byTier: Record<Tier, number> = { untouched: 0, familiar: 0, practiced: 0, proficient: 0, mastered: 0 };
  for (const m of methods) byTier[m.tier] += 1;
  return { total: methods.length, byTier, branches };
}
