// F4 (Phase 0) — adaptive item selection. The job is small but pivotal:
// when the picker has multiple candidate questions, bias selection toward
// the methods the learner is currently WEAKEST on, so attention follows
// gaps instead of being spent uniformly across everything.
//
// This is heuristic, NOT IRT. IRT requires per-item difficulty calibration,
// which in turn requires ≥50 attempts/question — we're nowhere near that
// volume yet. Until then, "weakest method" derived from the FSRS rollup is
// a defensible, low-cost approximation.
//
// Design principles:
//   • Pure: takes srs and a question bank, returns a permutation.
//     No DOM, no telemetry side-effects.
//   • Stable: weighted-without-replacement sampling via the Efraimidis-
//     Spirakis trick (r_i = U^(1/w_i)) — well-known, easy to test.
//   • Backward compatible: when no SRS data exists, every question gets
//     equal weight → behaviour collapses to uniform random (matches v1).
//   • Conservative: higher weight = pick FIRST, but ties broken randomly
//     so we don't deterministically loop the same questions every run.

export type AdaptiveQuestion = {
  qid?: string;
  method?: string;
};

type SrsCard = { reps?: number; interval?: number; [k: string]: any };
type SrsMap = Record<string, SrsCard | undefined>;

// ---------- weakness ----------
// Map method → weakness ∈ [0, 1]. 1 = weakest (untouched / poorly held),
// 0 = strongest (most questions mastered). Computed from the bank we're
// PICKING from so a method's weight reflects this case's question pool,
// not the global catalog (which would skew toward methods the case
// doesn't even cover).
export function methodWeaknessFromBank(bank: AdaptiveQuestion[], srs: SrsMap): Record<string, number> {
  const byMethod: Record<string, { total: number; mastered: number }> = {};
  for (const q of bank) {
    const m = q.method || "_unknown";
    if (!byMethod[m]) byMethod[m] = { total: 0, mastered: 0 };
    byMethod[m].total += 1;
    const c = q.qid ? srs[q.qid] : undefined;
    if (c && (c.reps || 0) >= 4 && (c.interval || 0) >= 21) {
      byMethod[m].mastered += 1;
    }
  }
  const out: Record<string, number> = {};
  for (const [m, v] of Object.entries(byMethod)) {
    out[m] = v.total === 0 ? 1 : 1 - v.mastered / v.total;
  }
  return out;
}

// ---------- weighted shuffle ----------
// Efraimidis-Spirakis weighted reservoir: each item draws r = U^(1/w),
// items are then ordered by r descending — top n is a weighted sample
// without replacement. Items with weight 0 still get a chance (we floor
// to a small epsilon) so a fully-mastered method's questions can still
// surface as occasional spaced-repetition refreshers.
const MIN_WEIGHT = 0.05;

export function weightedShuffle<T>(
  items: T[],
  weightOf: (item: T) => number,
  rand: () => number = Math.random,
): T[] {
  if (items.length <= 1) return items.slice();
  const keyed = items.map((item) => {
    const w = Math.max(MIN_WEIGHT, weightOf(item));
    const u = Math.max(1e-12, rand());     // avoid log(0)
    const key = Math.log(u) / w;           // equivalent to ranking by U^(1/w) desc
    return { item, key };
  });
  keyed.sort((a, b) => b.key - a.key);
  return keyed.map((k) => k.item);
}

// ---------- entry point ----------
// Returns a fresh permutation of `bank` biased toward weaker methods.
// Caller picks the first n. Wrapped this way (return all, slice outside)
// so the same call powers test assertions over many trials.
export function adaptiveOrder(
  bank: AdaptiveQuestion[],
  srs: SrsMap,
  opts: { rand?: () => number } = {},
): AdaptiveQuestion[] {
  const weakness = methodWeaknessFromBank(bank, srs);
  return weightedShuffle(bank, (q) => weakness[q.method || "_unknown"] ?? 1, opts.rand);
}
