// How one run's questions are chosen from the five pools.
//
// Priority, highest first:
//   1. bankDue   — authored questions the scheduler says are due
//   2. famDue    — generated families the scheduler says are due
//   3. unseen    — authored questions the learner has never met
//   4. famFresh  — generated families not currently due (these displace repeats)
//   5. repeats   — authored questions already answered and not yet due
//
// The cap exists because a case claims every family whose method appears
// anywhere in its bank, and the busier cases now claim more families than they
// have slots. Without a ceiling a run could be entirely generated, which starves
// the authored material the case was written around.

export type RunPools<Q> = {
  bankDue: Q[];
  famDue: Q[];
  unseen: Q[];
  famFresh: Q[];
  repeats: Q[];
};

/** At most half a run (rounded up) may be generated, and never fewer than one. */
export const defaultGeneratedCap = (n: number) => Math.max(1, Math.ceil(n / 2));

export function composeRun<Q>(
  pools: RunPools<Q>,
  n: number,
  maxGenerated: number = defaultGeneratedCap(n),
): Q[] {
  const out: Q[] = [];
  let generated = 0;

  const take = (pool: Q[], isGenerated: boolean) => {
    for (const q of pool) {
      if (out.length >= n) return;
      if (isGenerated) {
        if (generated >= maxGenerated) return;
        generated++;
      }
      out.push(q);
    }
  };

  take(pools.bankDue, false);
  take(pools.famDue, true);
  take(pools.unseen, false);
  take(pools.famFresh, true);
  take(pools.repeats, false);
  return out;
}
