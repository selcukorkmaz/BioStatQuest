// Per-case access checks. Currently a stub — every case is free for all
// users. Kept as a function (rather than `false`) so the future Pro
// gating story is a one-file change: this module is the single source of
// truth that the Skill Tree, case picker, and play surfaces consult.
//
// When gating returns:
//   • Read FREE_CASES_LIMIT from a config module
//   • Sort CASES by some canonical order (creation date or branch order)
//   • Return true for cases beyond the limit when userType ∈ {undefined,
//     null, "free"}; false otherwise

export function isCaseLockedForUser(
  _caseId: string,
  _userType: string | undefined | null
): boolean {
  // Pro gating disabled — all cases free for now.
  return false;
}
