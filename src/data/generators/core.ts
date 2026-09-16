// ============================================================
// SEEDED ITEM GENERATORS ("item families")
// ============================================================
// A family is a *question model*, not a question: given a seed it emits a
// concrete, fully-formed Question with fresh numbers, a fresh clinical
// context, and (for some families) a different correct answer entirely.
// One family therefore replaces an unbounded number of static bank items.
//
// Two invariants make this safe to bolt onto the existing app:
//
//   1. STABLE QID. Every instance carries `qid === family.fid`. The FSRS
//      card in public.reviews, the per-qid accuracy in public.events, and
//      state.srs all key on qid — so scheduling and analytics happen at the
//      SKILL level while the learner never sees the same numbers twice.
//      This is also the pedagogically correct unit: we want to know whether
//      they can compute a PPV, not whether they memorised "3.2%".
//
//   2. REPRODUCIBILITY. The seed actually used is returned on `_seed`, so a
//      learner-reported bad item can be regenerated exactly.
//
// The static bank in cases.ts is untouched; families run alongside it.
//
// This file holds the machinery. The families themselves live in the sibling
// modules and are collected in ./index.ts.

import type { Question } from "../cases";

// ------------------------------------------------------------
// Seeded RNG (mulberry32) — small, fast, well-distributed.
// ------------------------------------------------------------
export type RNG = {
  next(): number;                       // [0, 1)
  int(lo: number, hi: number): number;  // inclusive both ends
  pick<T>(arr: readonly T[]): T;
};

export function makeRng(seed: number): RNG {
  let a = (seed >>> 0) || 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
  };
}

// ------------------------------------------------------------
// Family contract
// ------------------------------------------------------------
export type QuestionFamily = {
  /** Stable id. Doubles as the qid of every instance — see invariant 1. */
  fid: string;
  /** Admin-facing label (Content tab, report triage). */
  title: string;
  /** Must be a key of METHODS — enforced by the test suite. */
  method: string;
  diffMin: "intern" | "resident" | "fellow" | "pi";
  /** Variant ids this family can emit; asserted reachable by the tests. */
  variants: readonly string[];
  gen: (rng: RNG) => GeneratedBody;
};

/** What `gen` returns: a Question minus the fields instantiate() fills in. */
export type GeneratedBody = Omit<Question, "qid" | "method"> & {
  _variant: string;
  /** Parameters behind the draw. Lets tests re-derive the key independently. */
  _params: Record<string, number | string>;
};

export type GeneratedQuestion = Question & {
  qid: string;
  _fid: string;
  _seed: number;
  _variant: string;
  _params: Record<string, number | string>;
};

/**
 * Thrown by a generator when a draw lands somewhere useless (two options that
 * round to the same string, a near-zero effect that makes the key ambiguous).
 * instantiate() silently redraws; the test suite asserts we never exhaust the
 * retry budget, which is what turns "rare flake" into "build failure".
 */
export class DegenerateDraw extends Error {}
export const degenerate = (why: string): never => {
  throw new DegenerateDraw(why);
};

const MAX_ATTEMPTS = 40;

export function instantiate(family: QuestionFamily, seed: number): GeneratedQuestion {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const s = (seed + attempt * 0x9e3779b1) >>> 0;
    try {
      const body = family.gen(makeRng(s));
      return {
        ...body,
        qid: family.fid,          // invariant 1
        method: family.method,
        _fid: family.fid,
        _seed: s,                 // invariant 2
      };
    } catch (e) {
      if (e instanceof DegenerateDraw) continue;
      throw e;
    }
  }
  throw new Error(
    `[generators] ${family.fid}: no valid draw in ${MAX_ATTEMPTS} attempts from seed ${seed}`,
  );
}

// ------------------------------------------------------------
// Option assembly
// ------------------------------------------------------------
export type Choice = { text: string; correct?: boolean; explain?: string; tag?: string };

/**
 * Shuffles choices, derives the answer index, and projects per-distractor
 * metadata onto post-shuffle indices. Mirrors the bank rule enforced in
 * cases.test.ts: optionExplanations / misconceptionTag never target the key.
 */
export function assemble(rng: RNG, choices: Choice[]) {
  const arr = choices.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const options = arr.map((c) => c.text);
  if (new Set(options).size !== options.length) {
    degenerate("two options rendered to the same string");
  }
  const answer = arr.findIndex((c) => c.correct);
  if (answer < 0) throw new Error("assemble(): no choice marked correct");
  if (arr.filter((c) => c.correct).length !== 1) {
    throw new Error("assemble(): exactly one choice must be correct");
  }
  const optionExplanations: Record<number, string> = {};
  const misconceptionTag: Record<number, string> = {};
  arr.forEach((c, i) => {
    if (c.correct) return;
    if (c.explain) optionExplanations[i] = c.explain;
    if (c.tag) misconceptionTag[i] = c.tag;
  });
  return { options, answer, optionExplanations, misconceptionTag };
}

export const pct = (x: number, d = 1) => `${x.toFixed(d)}%`;
export const num = (n: number) => n.toLocaleString("en-US");
