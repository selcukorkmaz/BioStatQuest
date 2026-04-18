// Shared difficulty table + sentinel id for the daily review case.
// Extracted so both App.tsx and component modules (CasePlay, CaseResult, etc.)
// can reference the same source of truth without import cycles.

export type DifficultyKey = "intern" | "resident" | "fellow" | "pi";

export type Difficulty = {
  name: string;
  label: string;
  color: string;
  xpMult: number;
  desc: string;
  time: number;
};

export const DIFFICULTIES: Record<DifficultyKey, Difficulty> = {
  intern:   { name: "Intern",                 label: "Easy",     color: "#4ade80", xpMult: 1.0, desc: "Heavy scaffolding, plain-language hints.",       time: 90 },
  resident: { name: "Resident",               label: "Moderate", color: "#facc15", xpMult: 1.6, desc: "Med/MPH level. Pick tests yourself.",            time: 60 },
  fellow:   { name: "Fellow",                 label: "Hard",     color: "#fb923c", xpMult: 2.4, desc: "PhD level. Messy data & assumption checks.",     time: 45 },
  pi:       { name: "Principal Investigator", label: "Expert",   color: "#f87171", xpMult: 3.5, desc: "Peer-review. Find the errors in published work.", time: 35 },
};

// Sentinel case id for the Daily Review (cross-case SRS queue). Anything
// checking "is this a review run" compares against this rather than a magic
// string, so tools like grep find every site at once.
export const REVIEW_CASE_ID = "__review";
