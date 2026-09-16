// Estimation / confidence-interval item families.
import type { RNG, QuestionFamily, Choice } from "./core";
import { assemble, degenerate, num } from "./core";

// ============================================================
// FAMILY 2 — Confidence intervals: width, scaling, and reading
// ============================================================

type ContinuousContext = {
  outcome: string; unit: string; setting: string;
  mean: [number, number]; sd: [number, number]; dec: 0 | 1;
};

const CONT_CONTEXTS: readonly ContinuousContext[] = [
  { outcome: "systolic blood pressure", unit: "mmHg", setting: "a hypertension trial",
    mean: [118, 162], sd: [10, 22], dec: 0 },
  { outcome: "6-minute walk distance", unit: "m", setting: "a pulmonary rehabilitation study",
    mean: [280, 460], sd: [45, 90], dec: 0 },
  { outcome: "HbA1c", unit: "%", setting: "a type-2 diabetes trial",
    mean: [7, 9.5], sd: [0.8, 1.6], dec: 1 },
  { outcome: "hospital length of stay", unit: "days", setting: "a care-pathway evaluation",
    mean: [4, 12], sd: [2, 6], dec: 1 },
  { outcome: "serum ferritin", unit: "µg/L", setting: "an iron-supplementation trial",
    mean: [40, 120], sd: [20, 55], dec: 0 },
  { outcome: "pain intensity", unit: "points on a 0–100 VAS", setting: "an analgesia trial",
    mean: [30, 70], sd: [12, 26], dec: 0 },
];

const Z95 = 1.96;
const SQUARE_N = [25, 36, 49, 64, 100, 144, 196, 225, 400] as const;
const PILOT_N = [24, 30, 40, 48, 60, 80, 100, 120] as const;

function drawRange(rng: RNG, [lo, hi]: [number, number], dec: 0 | 1): number {
  const m = dec === 1 ? 10 : 1;
  return rng.int(Math.round(lo * m), Math.round(hi * m)) / m;
}

export const CI_FAMILY: QuestionFamily = {
  fid: "gen_ci_width",
  title: "Confidence intervals — width, scaling and interpretation",
  method: "ci",
  diffMin: "resident",
  variants: ["halfwidth", "scaling", "interpret", "coverage"],
  gen: (rng) => {
    const ctx = rng.pick(CONT_CONTEXTS);
    const variant = rng.pick(["halfwidth", "scaling", "interpret", "coverage"] as const);

    if (variant === "halfwidth") {
      const n = rng.pick(SQUARE_N);
      const mean = drawRange(rng, ctx.mean, ctx.dec);
      const sd = drawRange(rng, ctx.sd, ctx.dec);
      const half = Z95 * sd / Math.sqrt(n);
      const dp = ctx.dec === 1 ? 2 : 2;
      return {
        _variant: variant,
        _params: { n, mean, sd, half },
        q: `What is the half-width (the "± part") of the 95% confidence interval for the mean, in ${ctx.unit}? Use z = 1.96.`,
        scenario: `In ${ctx.setting}, ${ctx.outcome} is measured in n = ${n} participants: mean ${mean} ${ctx.unit}, SD ${sd} ${ctx.unit}.`,
        type: "numeric",
        answer: +half.toFixed(dp),
        tol: Math.max(0.02, +(half * 0.02).toFixed(3)),
        hint: "The SD describes how spread the PATIENTS are. The interval is about the MEAN — so divide by √n first.",
        explain: `SE = SD/√n = ${sd}/${Math.sqrt(n)} = ${(sd / Math.sqrt(n)).toFixed(3)} ${ctx.unit}. Half-width = 1.96 × SE ≈ ${half.toFixed(dp)} ${ctx.unit}, so the CI runs ${(mean - half).toFixed(dp)} to ${(mean + half).toFixed(dp)}. Using the SD (${sd}) directly would overstate the uncertainty in the mean by a factor of √${n} = ${Math.sqrt(n)}.`,
      };
    }

    if (variant === "coverage") {
      // The one claim about confidence intervals that a picture settles and a
      // paragraph never does: what the 95% is actually counting.
      const n = rng.pick(SQUARE_N);
      const mu = drawRange(rng, ctx.mean, ctx.dec);
      const sigma = drawRange(rng, ctx.sd, ctx.dec);
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
        { text: "About 5 of the 100", correct: true },
        { text: "None — a 95% interval is constructed to contain the true value",
          tag: "confidence_interval_treated_as_a_guarantee",
          explain: `If no interval ever missed, the procedure would be making a promise it cannot keep from a sample of ${n}. The 95% is a long-run hit rate, and a hit rate below 100% means misses — about 1 study in 20, each of which looks exactly like the others from the inside.` },
        { text: "About 95 of the 100",
          tag: "coverage_and_miss_rate_swapped",
          explain: `95 is the number that CONTAIN the true mean. The question asks for the complement, which is the 5 that do not.` },
        { text: "Impossible to say without knowing the true mean",
          tag: "coverage_thought_to_require_the_unknown_truth",
          explain: `You would need the true mean to say WHICH intervals missed — and in a real study you never can. But how MANY miss is a property of the procedure, fixed by the confidence level before a single patient is recruited.` },
      ]);
      return {
        _variant: variant,
        _params: { n, mu, sigma },
        simulate: { kind: "ci_coverage", seed: rng.int(1, 1 << 29), n, reps: 100, mu, sigma },
        q: `If you repeated this study 100 times, about how many of the 100 intervals would MISS the true mean?`,
        scenario: `Imagine running ${ctx.setting} over and over. Each repetition draws a fresh sample of n = ${n} from the same population — whose true mean ${ctx.outcome} is ${mu} ${ctx.unit}, a number no real investigator would ever know — and reports a 95% confidence interval.`,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "The confidence level is a statement about the PROCEDURE's long-run hit rate. Read off what it implies about the misses.",
        explain: `About 5 in 100. "95% confidence" names the proportion of intervals built this way that cover the truth across repeated studies — so roughly 1 in 20 misses, and nothing has gone wrong in those studies. The uncomfortable part is that the missing ones are indistinguishable from the rest: you get one interval, and no way to tell which kind you are holding.`,
      };
    }

    if (variant === "scaling") {
      const n = rng.pick(PILOT_N);
      const k = rng.pick([2, 3] as const);
      const correctN = n * k * k;
      const linearN = n * k;
      const sqrtN = Math.round(n * Math.sqrt(k));
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
        { text: `${num(correctN)} participants`, correct: true },
        { text: `${num(linearN)} participants`, tag: "ci_width_assumed_inversely_proportional_to_n",
          explain: `${num(linearN)} = ${n} × ${k} assumes width ∝ 1/n. It is ∝ 1/√n, so multiplying n by ${k} only narrows the interval by a factor of √${k} ≈ ${Math.sqrt(k).toFixed(2)} — well short of ${k}×.` },
        { text: `${num(sqrtN)} participants`, tag: "sqrt_applied_in_the_wrong_direction",
          explain: `${num(sqrtN)} ≈ ${n} × √${k} applies the square root to n instead of inverting it. Precision is the expensive direction: you need n × ${k}², not n × √${k}.` },
        { text: `${num(n)} participants — width is driven by the SD, not the sample size`, tag: "sd_confused_with_se",
          explain: `The SD is a property of the patients and does not shrink with recruitment — true. But the CI is built on the standard ERROR, SD/√n, which does shrink. That is exactly why bigger trials give tighter intervals.` },
      ]);
      return {
        _variant: variant,
        _params: { n, k, correctN },
        q: `Holding the SD constant, roughly how many participants does the definitive trial need for a 95% CI ${k}× narrower than the pilot's?`,
        scenario: `A pilot study of ${ctx.outcome} in ${ctx.setting} enrolled n = ${n} and produced a 95% CI you consider too wide to act on. You want the definitive trial's interval to be ${k} times narrower.`,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "Width ∝ 1/√n. Invert that relationship before you reach for a number.",
        explain: `Width ∝ SD/√n, so narrowing by a factor of ${k} needs √n to grow by ${k} — i.e. n to grow by ${k}² = ${k * k}. From ${n} that is ${num(correctN)}. Precision is quadratically expensive: this is why "just add a few more patients" rarely rescues an underpowered study.`,
      };
    }

    // variant === "interpret" — the correct answer FLIPS with the seed,
    // depending on whether the interval covers the null. Memorising the
    // option text is therefore useless.
    const dp = ctx.dec === 1 ? 1 : 1;
    const m = ctx.dec === 1 ? 10 : 1;
    const half = rng.int(Math.round(ctx.sd[0] * m * 0.5), Math.round(ctx.sd[1] * m * 0.9)) / m;
    const coversNull = rng.next() < 0.5;
    const sign = rng.next() < 0.5 ? -1 : 1;
    const d = coversNull
      ? sign * (rng.int(0, Math.round(half * 0.7 * m)) / m)
      : sign * (rng.int(Math.round(half * 1.3 * m), Math.round(half * 3 * m)) / m);
    const lo = +(d - half).toFixed(dp);
    const hi = +(d + half).toFixed(dp);
    if (coversNull !== (lo < 0 && hi > 0)) degenerate("rounding pushed the interval across the null");
    if (Math.min(Math.abs(lo), Math.abs(hi)) < 0.05) degenerate("interval endpoint sits on the null");

    const rangeTxt = `${lo} to ${hi} ${ctx.unit}`;
    const choices: Choice[] = coversNull
      ? [
          { text: `The data are compatible with no difference at the 5% level — but also with a difference as large as ${Math.max(Math.abs(lo), Math.abs(hi))} ${ctx.unit}. The result is inconclusive, not negative.`, correct: true },
          { text: `The trial shows the two arms are equivalent.`, tag: "absence_of_evidence_as_evidence_of_absence",
            explain: `The interval reaches out to ${Math.max(Math.abs(lo), Math.abs(hi))} ${ctx.unit} — an effect that size has not been ruled out at all. Claiming equivalence requires an interval that excludes everything clinically meaningful, which this one does not.` },
        ]
      : [
          { text: `The difference is statistically significant at the 5% level, and the data are compatible with a true difference anywhere from ${rangeTxt}.`, correct: true },
          { text: `The difference is large enough to matter clinically.`, tag: "statistical_significance_conflated_with_clinical_importance",
            explain: `Significance only says the interval misses zero. Whether ${rangeTxt} is worth changing practice over is a clinical judgement about the minimal important difference — the statistics cannot supply it.` },
        ];
    choices.push(
      { text: `There is a 95% probability that the true difference lies between ${lo} and ${hi} ${ctx.unit}.`,
        tag: "bayesian_misreading_of_frequentist_ci",
        explain: `Tempting, but the frequentist interval has no probability attached to THIS interval — the true value is either in it or not. The 95% describes the procedure: intervals built this way cover the truth 95% of the time across repeated studies. To make a probability statement about the parameter you need a prior, i.e. a credible interval.` },
      { text: `95% of participants had a change between ${lo} and ${hi} ${ctx.unit}.`,
        tag: "ci_confused_with_reference_range",
        explain: `That would be a reference range, built from the SD and describing individual spread. This interval is built from the standard ERROR and describes only where the MEAN difference might sit — it is narrower than individual variation by a factor of √n.` },
    );
    const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, choices);

    return {
      _variant: variant,
      _params: { lo, hi, d, half, coversNull: coversNull ? 1 : 0 },
      q: `Which statement is the correct reading of this interval?`,
      scenario: `${ctx.setting[0].toUpperCase()}${ctx.setting.slice(1)} reports a mean between-arm difference in ${ctx.outcome} of ${d} ${ctx.unit} (95% CI ${lo} to ${hi}).`,
      type: "mcq",
      options, answer, optionExplanations, misconceptionTag,
      hint: "First check one thing: does the interval contain the null value of 0? Then ask what the 95% is actually attached to.",
      explain: coversNull
        ? `The interval ${rangeTxt} contains 0, so the difference is not significant at the 5% level. But it also contains values up to ${Math.max(Math.abs(lo), Math.abs(hi))} ${ctx.unit} — a wide interval straddling the null means "we do not know", not "no effect".`
        : `The interval ${rangeTxt} excludes 0, so the result is significant at the 5% level. What it licenses is a range of compatible effects — not a claim that the point estimate ${d} is the truth, and not on its own a claim of clinical importance.`,
    };
  },
};
