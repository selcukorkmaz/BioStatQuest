// F9 (Phase 0) — pure logic for the practice-exam mode.
//
// Lives entirely client-side for v0: question pool from CASES, scoring in
// memory, quota tracked in localStorage. Server-backed exam history,
// instructor assignments, and PDF export are F9 v0.1+ scope.
//
// All functions here are pure and seeded so they can be unit-tested
// deterministically. The seeded RNG is a small mulberry32 — fine for
// "shuffle me 20 questions" use; not crypto.

import { CASES } from "../data/cases";
import { BRANCHES } from "../data/branches";

export type ExamQuestion = {
  qid: string;
  caseId: string;
  branch: string;
  type: "mcq" | "multi" | "numeric";
  q: string;
  scenario?: string;
  options?: string[];
  answer: number | number[];
  tol?: number;
  explain: string;
  method: string;
};

export type ExamAnswer = {
  qid: string;
  branch: string;
  picked: number | number[] | string | null;
  correct: boolean;
  msToAnswer?: number;
};

export type BranchBreakdown = {
  branch: string;
  branchName: string;
  n: number;
  correct: number;
  accuracy: number;     // 0..1
};

// ---------- seeded RNG ----------
// mulberry32: tiny, fast, perfectly fine for "shuffle 20 of 1000".
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = r + Math.imul(r ^ (r >>> 7), 61 | r) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(arr: T[], rand: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---------- question pool ----------
// Flatten CASES into a flat list of {qid, caseId, branch, ...question fields}.
// This is recomputed each call (cheap; bank ≈ 1k items) so tests can mock
// or extend CASES without stale module-level state.
export function buildExamPool(opts: { branches?: string[] } = {}): ExamQuestion[] {
  const want = opts.branches && opts.branches.length > 0 ? new Set(opts.branches) : null;
  const out: ExamQuestion[] = [];
  for (const c of CASES) {
    if (!c?.bank) continue;
    if (want && !want.has(c.branch)) continue;
    for (const q of c.bank) {
      if (!q?.qid) continue;
      out.push({
        qid: q.qid,
        caseId: c.id,
        branch: c.branch,
        type: q.type,
        q: q.q,
        scenario: q.scenario,
        options: q.options,
        answer: q.answer,
        tol: q.tol,
        explain: q.explain,
        method: q.method,
      });
    }
  }
  return out;
}

export function pickExamQuestions(
  n: number,
  opts: { seed?: number; branches?: string[] } = {},
): ExamQuestion[] {
  const seed = opts.seed ?? Date.now();
  const pool = buildExamPool({ branches: opts.branches });
  const shuffled = seededShuffle(pool, mulberry32(seed));
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

// ---------- grading ----------
// Returns true if the picked value matches `q.answer`. Mirrors the per-type
// rules CasePlay's checkAnswer uses, kept in sync by hand for v0; once we
// extract that into a shared helper we should switch both callers to it.
export function gradeAnswer(q: ExamQuestion, picked: number | number[] | string | null): boolean {
  if (picked === null || picked === undefined || picked === "") return false;
  if (q.type === "mcq") {
    return typeof picked === "number" && picked === q.answer;
  }
  if (q.type === "multi") {
    if (!Array.isArray(picked)) return false;
    const ans = q.answer as number[];
    if (picked.length !== ans.length) return false;
    const a = picked.slice().sort().join(",");
    const b = ans.slice().sort().join(",");
    return a === b;
  }
  if (q.type === "numeric") {
    const v = typeof picked === "number" ? picked : parseFloat(String(picked));
    if (!Number.isFinite(v)) return false;
    return Math.abs(v - (q.answer as number)) <= (q.tol || 0);
  }
  return false;
}

export function scoreExam(answers: ExamAnswer[]): { n: number; correct: number; accuracy: number } {
  const n = answers.length;
  const correct = answers.filter((a) => a.correct).length;
  return { n, correct, accuracy: n === 0 ? 0 : correct / n };
}

export function getBranchBreakdown(answers: ExamAnswer[]): BranchBreakdown[] {
  const acc: Record<string, { n: number; correct: number }> = {};
  for (const a of answers) {
    const b = a.branch || "unknown";
    if (!acc[b]) acc[b] = { n: 0, correct: 0 };
    acc[b].n += 1;
    if (a.correct) acc[b].correct += 1;
  }
  return Object.entries(acc)
    .map(([branch, v]) => ({
      branch,
      branchName: (BRANCHES as any)[branch]?.name ?? branch,
      n: v.n,
      correct: v.correct,
      accuracy: v.n === 0 ? 0 : v.correct / v.n,
    }))
    .sort((a, b) => a.accuracy - b.accuracy);     // weakest branch first
}

// ---------- quota (v0: localStorage; v0.1: server-backed) ----------
// Free tier is 2 practice exams per rolling 30-day window; Pro is
// unlimited. State persists in bq_state_v1.examHistory — an array of
// ISO timestamps. Storage is injectable for testability; in app code
// callers omit the param and we use the browser's localStorage.
const STATE_KEY = "bq_state_v1";
const FREE_QUOTA_PER_30D = 2;

type ExamHistoryEntry = { startedAt: string };

// Minimal localStorage-shaped surface — covers what we need without
// pulling the full DOM Storage type. Tests pass an in-memory shim.
export type StorageLike = {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
};

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage as unknown as StorageLike;
  } catch { /* SSR or sandboxed env */ }
  return null;
}

export function getExamHistory(storage: StorageLike | null = getDefaultStorage()): ExamHistoryEntry[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STATE_KEY);
    if (!raw) return [];
    const s = JSON.parse(raw);
    return Array.isArray(s?.examHistory) ? s.examHistory : [];
  } catch { return []; }
}

export function recordExamStart(now: Date = new Date(), storage: StorageLike | null = getDefaultStorage()): void {
  if (!storage) return;
  try {
    const raw = storage.getItem(STATE_KEY);
    const s = raw ? JSON.parse(raw) : {};
    const hist: ExamHistoryEntry[] = Array.isArray(s.examHistory) ? s.examHistory : [];
    hist.push({ startedAt: now.toISOString() });
    s.examHistory = hist.slice(-50);     // cap to last 50 entries
    storage.setItem(STATE_KEY, JSON.stringify(s));
  } catch { /* private mode or quota exceeded — ignore */ }
}

export function examsTakenInLast30Days(now: Date = new Date(), storage: StorageLike | null = getDefaultStorage()): number {
  const cutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  return getExamHistory(storage).filter((e) => {
    const t = new Date(e.startedAt).getTime();
    return Number.isFinite(t) && t >= cutoff;
  }).length;
}

export type ExamQuotaState = {
  used: number;
  limit: number;
  remaining: number;
  blocked: boolean;
};

export function getExamQuota(isPro: boolean, now: Date = new Date(), storage: StorageLike | null = getDefaultStorage()): ExamQuotaState {
  if (isPro) return { used: 0, limit: Infinity, remaining: Infinity, blocked: false };
  const used = examsTakenInLast30Days(now, storage);
  const remaining = Math.max(0, FREE_QUOTA_PER_30D - used);
  return { used, limit: FREE_QUOTA_PER_30D, remaining, blocked: remaining <= 0 };
}

// In-memory storage shim — handy for unit tests that don't want jsdom.
export function makeMemoryStorage(): StorageLike {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => { m.set(k, v); },
  };
}
