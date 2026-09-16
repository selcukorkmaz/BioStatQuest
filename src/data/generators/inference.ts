// Item families for the Estimation & Inference branch beyond confidence
// intervals: p-values, chi-square tables, and the bootstrap.

import type { RNG, QuestionFamily, Choice } from "./core";
import { assemble, degenerate, num } from "./core";

// ============================================================
// p-values — what they are, and what follows from one
// ============================================================
type TrialCtx = { comparison: string; outcome: string; setting: string };

const TRIALS: readonly TrialCtx[] = [
  { comparison: "the new inhaler against usual care", outcome: "exacerbation rate", setting: "a respiratory trial" },
  { comparison: "early surgery against conservative management", outcome: "12-month function score", setting: "an orthopaedic trial" },
  { comparison: "the shortened antibiotic course against the standard one", outcome: "treatment failure", setting: "an infectious-disease trial" },
  { comparison: "nurse-led follow-up against consultant clinics", outcome: "unplanned readmission", setting: "a cardiology trial" },
  { comparison: "the digital programme against a leaflet", outcome: "six-month weight change", setting: "a primary-care trial" },
];

export const PVALUE_FAMILY: QuestionFamily = {
  fid: "gen_pvalue",
  title: "p-values — meaning, decision and error rates",
  method: "hypothesis_testing",
  diffMin: "resident",
  variants: ["meaning", "decision", "errors"],
  gen: (rng) => {
    const t = rng.pick(TRIALS);
    const variant = rng.pick(["meaning", "decision", "errors"] as const);

    if (variant === "meaning") {
      const p = rng.int(1, 240) / 1000;
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
        { text: `The probability of observing a difference at least this large IF the null hypothesis were true.`, correct: true },
        { text: `The probability that the null hypothesis is true, given these data.`,
          tag: "p_value_read_as_posterior_probability_of_the_null",
          explain: `This reverses the conditioning. The p-value is P(data this extreme | H₀), not P(H₀ | data). Getting from one to the other needs a prior — that is exactly what a Bayesian analysis supplies and a p-value does not. A p of ${p.toFixed(3)} says nothing about how likely the null is.` },
        { text: `The probability that the observed result was produced by chance alone.`,
          tag: "p_value_read_as_probability_the_result_is_chance",
          explain: `A subtler version of the same reversal: "produced by chance" is a statement about the hypothesis, not about the data. The p-value already ASSUMES chance alone was at work and asks how surprising the data would then be.` },
        { text: `The probability of making a mistake if you reject the null hypothesis.`,
          tag: "p_value_read_as_the_error_rate_of_this_decision",
          explain: `That is α, a rate fixed in advance across all the studies you will ever run under the null — not a property of this one result. A single p-value of ${p.toFixed(3)} does not mean a ${(p * 100).toFixed(1)}% chance that rejecting is wrong here.` },
      ]);
      return {
        _variant: variant, _params: { p },
        q: `The trial reports p = ${p.toFixed(3)}. What does that number mean?`,
        scenario: `${t.setting[0].toUpperCase()}${t.setting.slice(1)} compares ${t.comparison} on ${t.outcome}.`,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "Read the definition's conditioning carefully: what is assumed, and what is being assigned a probability?",
        explain: `A p-value is P(data at least this extreme | H₀ true). Everything it can say is conditional on the null being true; it cannot turn round and tell you how likely the null is. Three of the four readings above swap the two sides of that conditional, which is the most consequential error in applied statistics.`,
      };
    }

    if (variant === "decision") {
      const alpha = rng.pick([0.05, 0.01] as const);
      const significant = rng.next() < 0.5;
      const p = significant
        ? rng.int(1, Math.round(alpha * 1000) - 8) / 1000
        : rng.int(Math.round(alpha * 1000) + 8, 600) / 1000;
      if (Math.abs(p - alpha) < 0.008) degenerate("p sits on the threshold");
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
        significant
          ? { text: `Reject the null at the ${alpha} level; the data are unusual enough under it to be worth acting on — though the size of the effect is a separate question.`, correct: true }
          : { text: `Do not reject the null at the ${alpha} level; this is an absence of evidence, not evidence of absence.`, correct: true },
        significant
          ? { text: `Do not reject the null at the ${alpha} level.`,
              tag: "threshold_comparison_reversed",
              explain: `p = ${p.toFixed(3)} is BELOW α = ${alpha}, so the result falls in the rejection region. The comparison is a simple one, and getting it backwards usually means reading "p < 0.05 is significant" as a statement about the size of p rather than its position relative to α.` }
          : { text: `Reject the null at the ${alpha} level.`,
              tag: "threshold_comparison_reversed",
              explain: `p = ${p.toFixed(3)} is ABOVE α = ${alpha}, so the data are not unusual enough under the null to reject it at this level.` },
        { text: `Conclude that the two arms are equivalent.`,
          tag: "non_significance_read_as_equivalence",
          explain: `Equivalence is a claim that any difference is too small to matter, and it requires a pre-specified equivalence margin and an interval that fits inside it. A hypothesis test that fails to reject has simply not ruled the null out — it has not ruled anything IN either.` },
        { text: `Conclude that there is a ${(p * 100).toFixed(1)}% probability that the null hypothesis is true.`,
          tag: "p_value_read_as_posterior_probability_of_the_null",
          explain: `The p-value is computed ASSUMING the null; it cannot also be the probability of the null. This is the same reversal of conditioning that makes "p = 0.04 means 4% chance it is a fluke" wrong.` },
      ]);
      return {
        _variant: variant, _params: { p, alpha, significant: significant ? 1 : 0 },
        q: `The pre-specified significance level is α = ${alpha} and the trial reports p = ${p.toFixed(3)}. What follows?`,
        scenario: `${t.setting[0].toUpperCase()}${t.setting.slice(1)} compares ${t.comparison} on ${t.outcome}.`,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "First place p relative to α. Then be careful about what the resulting decision does and does not license you to claim.",
        explain: significant
          ? `p = ${p.toFixed(3)} < α = ${alpha}, so the null is rejected at this level. That is a statement about compatibility with the null and nothing more — whether the effect is big enough to change practice needs the estimate and its interval, not the p-value.`
          : `p = ${p.toFixed(3)} > α = ${alpha}, so the null is not rejected. The trial may simply have been too small to detect a real effect: the honest summary is the confidence interval, which shows which effects remain compatible with the data.`,
      };
    }

    // errors — power, beta and what alpha actually controls
    const power = rng.int(60, 95);
    const alpha = rng.pick([5, 1] as const);
    return {
      _variant: variant, _params: { power, alpha },
      q: `What is the probability of a type II error, as a percentage?`,
      scenario: `${t.setting[0].toUpperCase()}${t.setting.slice(1)} of ${t.comparison} is designed with ${power}% power to detect the target difference in ${t.outcome}, at a two-sided significance level of ${alpha}%.`,
      type: "numeric",
      answer: 100 - power,
      tol: 0.5,
      hint: "Power is the probability of DETECTING a real effect of the target size. A type II error is the complementary outcome.",
      explain: `β = 1 − power = ${100 - power}%. So if the true effect really is the target size, this trial has a ${100 - power}% chance of failing to detect it. Note that α = ${alpha}% and β = ${100 - power}% control different errors and are set independently: α is fixed by convention, β by how many patients you can afford.`,
    };
  },
};

// ============================================================
// Chi-square tables — expected counts, df, and when to use Fisher
// ============================================================
type TableCtx = { exposure: string; outcome: string; setting: string };

const TABLE_CONTEXTS: readonly TableCtx[] = [
  { exposure: "the new dressing", outcome: "wound infection", setting: "a surgical audit" },
  { exposure: "the vaccine", outcome: "laboratory-confirmed infection", setting: "an immunisation study" },
  { exposure: "the rapid-triage pathway", outcome: "admission within 24 hours", setting: "an emergency-department evaluation" },
  { exposure: "the smoking-cessation programme", outcome: "abstinence at 6 months", setting: "a public-health evaluation" },
];

export const CHISQ_FAMILY: QuestionFamily = {
  fid: "gen_chisq",
  title: "Chi-square tables — expected counts, degrees of freedom, Fisher's rule",
  method: "chi_square",
  diffMin: "resident",
  variants: ["expected", "df", "fisher"],
  gen: (rng) => {
    const c = rng.pick(TABLE_CONTEXTS);
    const variant = rng.pick(["expected", "df", "fisher"] as const);

    if (variant === "df") {
      const rows = rng.int(2, 5);
      const cols = rng.int(2, 5);
      if (rows === 2 && cols === 2 && rng.next() < 0.5) degenerate("2×2 drawn too often");
      const df = (rows - 1) * (cols - 1);
      return {
        _variant: variant, _params: { rows, cols, df },
        q: `How many degrees of freedom does the chi-square test of independence have?`,
        scenario: `${c.setting[0].toUpperCase()}${c.setting.slice(1)} cross-tabulates ${rows} categories of exposure against ${cols} categories of ${c.outcome}, in ${num(rng.int(4, 90) * 25)} patients.`,
        type: "numeric",
        answer: df,
        tol: 0,
        hint: "Once the row and column totals are fixed, how many cells are still free to vary?",
        explain: `df = (rows − 1)(cols − 1) = (${rows} − 1)(${cols} − 1) = ${df}. The margins are treated as fixed, so filling in ${df} cells determines the rest. Note that df does not depend on the sample size at all — a ${rows}×${cols} table has ${df} df whether it holds 40 patients or 40,000.`,
      };
    }

    // Build a 2×2 whose smallest expected count is either comfortably above or
    // clearly below 5, so the Fisher decision is never a judgement call.
    const sparse = rng.next() < 0.5;
    const n1 = sparse ? rng.int(14, 30) : rng.int(90, 400);
    const n2 = sparse ? rng.int(14, 30) : rng.int(90, 400);
    const N = n1 + n2;
    const eventRate = sparse ? rng.int(8, 20) / 100 : rng.int(20, 50) / 100;
    const events = Math.max(1, Math.round(N * eventRate));
    const nonEvents = N - events;
    const expected = [
      (n1 * events) / N, (n1 * nonEvents) / N,
      (n2 * events) / N, (n2 * nonEvents) / N,
    ];
    const minExpected = Math.min(...expected);
    if (sparse && minExpected >= 4.2) degenerate("sparse draw is not sparse enough");
    if (!sparse && minExpected <= 7) degenerate("dense draw is too close to the rule of 5");
    const setup = `${c.setting[0].toUpperCase()}${c.setting.slice(1)} compares ${c.exposure} against control for ${c.outcome}. Group sizes are ${num(n1)} and ${num(n2)}; across both groups there were ${num(events)} events and ${num(nonEvents)} non-events.`;

    if (variant === "expected") {
      const want = (n1 * events) / N;
      return {
        _variant: variant, _params: { n1, n2, events, nonEvents, N, expected: want },
        q: `Under the null hypothesis of no association, what is the EXPECTED number of events in the ${c.exposure} group?`,
        scenario: setup,
        type: "numeric",
        answer: +want.toFixed(2),
        tol: Math.max(0.05, +(want * 0.02).toFixed(2)),
        hint: "Under independence, each group should get the overall event rate applied to its own size.",
        explain: `Expected = (row total × column total)/N = (${num(n1)} × ${num(events)})/${num(N)} ≈ ${want.toFixed(2)}. Equivalently, the overall event rate ${(events / N * 100).toFixed(1)}% applied to ${num(n1)} patients. Expected counts need not be whole numbers — they are an average over hypothetical repetitions, not a count of anyone.`,
      };
    }

    // fisher — the rule of 5, applied to the smallest expected count
    const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
      sparse
        ? { text: `Fisher's exact test — the smallest expected count is about ${minExpected.toFixed(1)}, below the usual threshold of 5.`, correct: true }
        : { text: `The chi-square test is fine — the smallest expected count is about ${minExpected.toFixed(1)}, comfortably above 5.`, correct: true },
      sparse
        ? { text: `The chi-square test is fine — the smallest expected count is comfortably above 5.`,
            tag: "sparse_table_passed_to_chi_square",
            explain: `The smallest expected count here is about ${minExpected.toFixed(1)}. The chi-square statistic's reference distribution is an approximation that degrades in sparse tables, giving p-values that are too small — which is the direction that produces false positives.` }
        : { text: `Fisher's exact test — the smallest expected count is below the threshold of 5.`,
            tag: "fisher_applied_by_reflex",
            explain: `The smallest expected count is about ${minExpected.toFixed(1)}, so the chi-square approximation is in good shape. Fisher's test is valid here too but is conservative, and with ${num(N)} patients it buys nothing.` },
      { text: `Neither — with ${num(N)} patients you should use a t-test on the proportions.`,
        tag: "t_test_applied_to_a_contingency_table",
        explain: `A t-test compares means of a continuous outcome. The data here are counts in categories; comparing two proportions is the chi-square/Fisher family's job (or a z-test for two proportions, which is algebraically the same as chi-square on a 2×2).` },
      { text: `It depends on the OBSERVED counts, not the expected ones — the rule applies to whichever cell is smallest in the table.`,
        tag: "rule_of_five_applied_to_observed_counts",
        explain: `The rule of 5 is about EXPECTED counts, which come from the margins under the null. An observed zero in a cell is not itself a problem if the expected count there is comfortable.` },
    ]);
    return {
      _variant: variant, _params: { n1, n2, events, N, minExpected, sparse: sparse ? 1 : 0 },
      q: `Which test should you use for this 2 × 2 table?`,
      scenario: setup,
      type: "mcq",
      options, answer, optionExplanations, misconceptionTag,
      hint: "The rule of thumb is about EXPECTED counts under the null, which you build from the margins — not about the observed cells and not about the total sample size.",
      explain: `The smallest expected count is (${num(Math.min(n1, n2))} × ${num(events)})/${num(N)} ≈ ${minExpected.toFixed(1)}, ${sparse ? "below" : "above"} the conventional threshold of 5, so ${sparse ? "the exact test is the safer choice" : "the chi-square approximation is sound"}. Total sample size is a poor guide on its own: a large study with a very rare outcome can still have an expected count under 5.`,
    };
  },
};

// ============================================================
// The bootstrap
// ============================================================
const BOOT_STATS = [
  { stat: "the median length of stay", ok: true },
  { stat: "the ratio of two group medians", ok: true },
  { stat: "the 25% trimmed mean", ok: true },
  { stat: "the correlation between two biomarkers", ok: true },
  { stat: "the MAXIMUM observed value", ok: false },
  { stat: "the minimum observed value", ok: false },
] as const;

export const BOOTSTRAP_FAMILY: QuestionFamily = {
  fid: "gen_bootstrap",
  title: "The bootstrap — resampling, B, and where it fails",
  method: "bootstrap",
  diffMin: "fellow",
  variants: ["percentile_index", "b_effect", "when"],
  gen: (rng) => {
    const variant = rng.pick(["percentile_index", "b_effect", "when"] as const);
    const n = rng.int(3, 24) * 25;
    const B = rng.int(2, 40) * 500;
    const boot = rng.pick(BOOT_STATS);

    if (variant === "percentile_index") {
      const level = rng.pick([90, 95, 99] as const);
      const tail = (100 - level) / 2;
      const idx = (B * tail) / 100;
      return {
        _variant: variant, _params: { B, level, idx },
        q: `In the sorted vector of ${num(B)} bootstrap estimates, which position gives the LOWER limit of the ${level}% percentile interval?`,
        scenario: `You bootstrap ${boot.stat} from a sample of n = ${n}, drawing B = ${num(B)} resamples and storing each resample's value.`,
        type: "numeric",
        answer: idx,
        tol: 0.5,
        hint: `A ${level}% interval leaves ${(100 - level).toFixed(0)}% outside it, split equally between the two tails.`,
        explain: `The lower limit is the ${tail}th percentile of the ${num(B)} stored estimates — position ${num(B)} × ${tail}/100 = ${num(idx)} once they are sorted. The upper limit is position ${num(B - idx)}. The percentile method needs no formula for the standard error at all, which is why it works for statistics whose sampling distribution you could never write down.`,
      };
    }

    if (variant === "b_effect") {
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
        { text: `The Monte-Carlo noise in the bootstrap estimate falls; the underlying sampling uncertainty is untouched.`, correct: true },
        { text: `The confidence interval gets narrower, because more resamples means more information.`,
          tag: "B_confused_with_sample_size",
          explain: `Resampling produces no new patients. The width of the interval is governed by n = ${n}; raising B only pins down more precisely where that width already was. Taking B to infinity would give the exact bootstrap interval for this sample — not a narrower one.` },
        { text: `The estimate becomes unbiased, because bias shrinks as B grows.`,
          tag: "B_assumed_to_remove_bias",
          explain: `Any bias in the statistic itself is a property of the estimator and the sample, and survives however many resamples you draw. The bootstrap can ESTIMATE that bias — that is the bootstrap bias correction — but B is not what removes it.` },
        { text: `Nothing changes; B is purely a computational convenience with no effect on the result.`,
          tag: "monte_carlo_error_ignored",
          explain: `B does matter, just not in the way people expect. Too small a B leaves visible run-to-run variation in the limits — rerun with a different seed and the interval moves. That is Monte-Carlo error, and it is the only thing B controls.` },
      ]);
      return {
        _variant: variant, _params: { B, n },
        q: `What happens if you raise B from ${num(B)} to ${num(B * 5)}?`,
        scenario: `You bootstrap ${boot.stat} from a sample of n = ${n}, currently using B = ${num(B)} resamples.`,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "Two different uncertainties are in play: how much the data could have differed, and how much your computation could have differed. Only one of them depends on B.",
        explain: `B controls Monte-Carlo error — the run-to-run wobble from having simulated rather than enumerated. Sampling uncertainty comes from n = ${n} and is fixed the moment the data are collected. Raising B makes your answer more reproducible, never more precise.`,
      };
    }

    // when — the bootstrap's failure mode
    const s = boot;
    const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
      s.ok
        ? { text: `Yes — the statistic is a smooth function of the data, which is where the bootstrap works well.`, correct: true }
        : { text: `No — the statistic depends on an extreme order statistic, and the bootstrap fails for these.`, correct: true },
      s.ok
        ? { text: `No — the statistic depends on an extreme order statistic, and the bootstrap fails for these.`,
            tag: "bootstrap_dismissed_for_a_smooth_statistic",
            explain: `${s.stat[0].toUpperCase()}${s.stat.slice(1)} moves gradually as the data change, so a resample's version of it behaves like a draw from the real sampling distribution. Extremes are the exception, not this.` }
        : { text: `Yes — the statistic is a smooth function of the data, which is where the bootstrap works well.`,
            tag: "bootstrap_assumed_universal",
            explain: `A resample can never contain a value larger than the largest one in the original sample, so the bootstrap distribution of ${s.stat} piles up on the observed extreme and cannot represent the true sampling distribution. The bootstrap is not assumption-free — it needs the statistic to vary smoothly with the data.` },
      { text: `Only if the underlying data are approximately normal.`,
        tag: "bootstrap_assumed_to_need_normality",
        explain: `Freedom from a distributional assumption is the bootstrap's main selling point: it resamples the observed data rather than a fitted curve. Normality is what you need for the formulas the bootstrap replaces.` },
      { text: `Only if n exceeds 1000, since smaller samples cannot be resampled reliably.`,
        tag: "bootstrap_assumed_to_need_a_huge_n",
        explain: `There is no such threshold. Small samples make ANY method imprecise, and the bootstrap inherits that — but n = ${n} is entirely workable, and the bootstrap is often chosen precisely when n is too small for a comfortable normal approximation.` },
    ]);
    return {
      _variant: variant, _params: { stat: s.stat, ok: s.ok ? 1 : 0, n, B },
      q: `Is the bootstrap appropriate here?`,
      scenario: `You want a 95% confidence interval for ${s.stat}, from a sample of n = ${n}, and plan to use B = ${num(B)} bootstrap resamples.`,
      type: "mcq",
      options, answer, optionExplanations, misconceptionTag,
      hint: "Ask what happens to the statistic when a resample happens to miss one particular observation. Does it shift a little, or jump?",
      explain: s.ok
        ? `${s.stat[0].toUpperCase()}${s.stat.slice(1)} is a smooth functional of the data distribution, so resampling reproduces its sampling behaviour well. This is the bootstrap's home ground: statistics with no tractable standard-error formula.`
        : `The bootstrap fails for extreme order statistics. Every resample is drawn from the observed values, so ${s.stat} can never exceed what you already saw — the bootstrap distribution is degenerate and its interval is meaningless however large B is.`,
    };
  },
};
