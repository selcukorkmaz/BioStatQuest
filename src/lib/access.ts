// Per-case access checks. Single source of truth for the catalog gate
// consulted by SkillTree, the case picker (App.startCaseSelect), and any
// future surface that needs to ask "may this user start this case?"
//
// Free tier rule: the first FREE_CASES_PER_BRANCH cases per branch (in
// the order they appear in CASES) are unlocked; everything else is Pro.
// This keeps the foundational arc of every branch reachable for free,
// while saving the deeper / more advanced cases as the upgrade signal.
//
// Note: there's no grandfathering for legacy users — gating was disabled
// before this change, so every free user has potentially seen any case.
// A grandfather table would defeat the gate's purpose. If a vocal
// regression appears we can revisit.

import { CASES } from "../data/cases";

export const FREE_CASES_PER_BRANCH = 3;

// Built once at module load. Walks CASES in their declared order; the
// first N cases of each branch (by appearance) land in the free set.
const FREE_CASE_IDS: Set<string> = (() => {
  const counts: Record<string, number> = {};
  const free = new Set<string>();
  for (const c of CASES) {
    if (!c?.id || !c?.branch) continue;
    const seen = counts[c.branch] || 0;
    if (seen < FREE_CASES_PER_BRANCH) free.add(c.id);
    counts[c.branch] = seen + 1;
  }
  return free;
})();

export function isCaseLockedForUser(
  caseId: string,
  userType: string | undefined | null,
): boolean {
  // Pro / institutional → everything unlocked.
  if (userType === "pro" || userType === "institutional") return false;
  // Free / undefined → only the per-branch free quota is open.
  return !FREE_CASE_IDS.has(caseId);
}

// Useful for the Upgrade page copy and tests — how many cases the free
// tier currently surfaces in total across all branches.
export function freeCaseCount(): number {
  return FREE_CASE_IDS.size;
}

// Exported for tests + future surfaces (e.g. a "free preview" badge in
// Skill Tree that lists which cases the free user has unlocked).
export function isCaseInFreeTier(caseId: string): boolean {
  return FREE_CASE_IDS.has(caseId);
}
