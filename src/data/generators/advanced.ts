// Item families for the Advanced & Bayesian branch: Bayes' rule in odds form,
// multiplicity, power, and correlation.

import type { RNG, QuestionFamily, Choice } from "./core";
import { assemble, degenerate, num } from "./core";

// ============================================================
// Bayes in odds form
// ============================================================
type BayesCtx = { condition: string; test: string; population: string };

const BAYES_CONTEXTS: readonly BayesCtx[] = [
  { condition: "pulmonary embolism", test: "a CT pulmonary angiogram", population: "ED patients with pleuritic chest pain" },
  { condition: "bacterial meningitis", test: "a CSF lactate assay", population: "febrile infants under 3 months" },
  { condition: "prostate cancer", test: "an MRI-targeted biopsy pathway", population: "men with a raised PSA" },
  { condition: "coeliac disease", test: "a tissue transglutaminase antibody test", population: "adults with chronic diarrhoea" },
  { condition: "giant cell arteritis", test: "a temporal artery ultrasound", population: "patients over 50 with new headache" },
];

export const BAYES_ODDS_FAMILY: QuestionFamily = {
  fid: "gen_bayes_odds",
  title: "Bayes in odds form — priors, likelihood ratios and credible intervals",
  method: "bayes",
  diffMin: "fellow",
  variants: ["lr_from_sens_spec", "posterior", "credible_vs_ci"],
  gen: (rng) => {
    const c = rng.pick(BAYES_CONTEXTS);
    const variant = rng.pick(["lr_from_sens_spec", "posterior", "credible_vs_ci"] as const);
    const sens = rng.int(78, 97) / 100;
    const spec = rng.int(80, 97) / 100;
    const lrPos = sens / (1 - spec);

    if (variant === "lr_from_sens_spec") {
      return {
        _variant: variant, _params: { sens, spec, lrPos },
        q: `What is the positive likelihood ratio of this test?`,
        scenario: `${c.test[0].toUpperCase()}${c.test.slice(1)} for ${c.condition} has sensitivity ${(sens * 100).toFixed(0)}% and specificity ${(spec * 100).toFixed(0)}%.`,
        type: "numeric",
        answer: +lrPos.toFixed(2),
        tol: Math.max(0.05, +(lrPos * 0.02).toFixed(2)),
        hint: "A likelihood ratio compares how often a positive result happens in people WITH the condition against how often it happens in people WITHOUT it.",
        explain: `LR+ = sensitivity / (1 − specificity) = ${sens.toFixed(2)} / ${(1 - spec).toFixed(2)} ≈ ${lrPos.toFixed(2)}. A positive result multiplies the odds of ${c.condition} by this factor, whatever the starting odds were — which is exactly why the likelihood ratio, unlike a predictive value, travels between populations unchanged.`,
      };
    }

    if (variant === "posterior") {
      const prior = rng.pick([0.02, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4] as const);
      const priorOdds = prior / (1 - prior);
      const postOdds = priorOdds * lrPos;
      const post = (postOdds / (1 + postOdds)) * 100;
      if (post > 96 || post < 5) degenerate("posterior pinned at the edge of the scale");
      return {
        _variant: variant, _params: { prior, lrPos, post },
        q: `The test is positive. What is the post-test probability of ${c.condition}, as a percentage?`,
        scenario: `Among ${c.population}, your pre-test probability of ${c.condition} is ${(prior * 100).toFixed(0)}%. ${c.test[0].toUpperCase()}${c.test.slice(1)} has a positive likelihood ratio of ${lrPos.toFixed(2)}.`,
        type: "numeric",
        answer: +post.toFixed(2),
        tol: Math.max(0.5, +(post * 0.03).toFixed(2)),
        hint: "Bayes' rule is a multiplication once you are on the ODDS scale. Convert probability → odds, multiply, convert back.",
        explain: `Pre-test odds = ${(prior * 100).toFixed(0)}/${((1 - prior) * 100).toFixed(0)} = ${priorOdds.toFixed(3)}. Post-test odds = ${priorOdds.toFixed(3)} × ${lrPos.toFixed(2)} = ${postOdds.toFixed(3)}. Probability = odds/(1 + odds) ≈ ${post.toFixed(1)}%. Multiplying the PROBABILITY by the likelihood ratio instead would give ${(prior * lrPos * 100).toFixed(0)}% — wrong, and capable of exceeding 100%.`,
      };
    }

    // credible_vs_ci
    const lo = rng.int(10, 60) / 100;
    const hi = +(lo + rng.int(15, 60) / 100).toFixed(2);
    const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
      { text: `Given the prior and the data, there is a 95% probability that the true value lies between ${lo.toFixed(2)} and ${hi.toFixed(2)}.`, correct: true },
      { text: `Intervals constructed this way contain the true value 95% of the time across repeated studies.`,
        tag: "credible_interval_read_as_a_confidence_interval",
        explain: `That is the coverage guarantee of a frequentist CONFIDENCE interval — a property of the procedure across hypothetical repetitions, not a probability about this interval. A credible interval makes the direct statement instead, at the price of requiring a prior.` },
      { text: `95% of future patients will have a value between ${lo.toFixed(2)} and ${hi.toFixed(2)}.`,
        tag: "credible_interval_read_as_a_prediction_interval",
        explain: `That is a posterior PREDICTIVE interval, which is wider because it carries individual variation as well as uncertainty about the parameter. A credible interval is about the parameter alone.` },
      { text: `The result is statistically significant because the interval excludes zero.`,
        tag: "bayesian_interval_forced_into_a_testing_frame",
        explain: `Bayesian intervals are not built around a null hypothesis and carry no significance verdict. You can ask for the posterior probability that the effect exceeds some clinically meaningful value — a different and usually more useful question.` },
    ]);
    return {
      _variant: variant, _params: { lo, hi },
      q: `How should a 95% CREDIBLE interval of ${lo.toFixed(2)} to ${hi.toFixed(2)} be read?`,
      scenario: `A Bayesian analysis of ${c.test} for ${c.condition} reports a 95% credible interval of ${lo.toFixed(2)} to ${hi.toFixed(2)} for the effect of interest.`,
      type: "mcq",
      options, answer, optionExplanations, misconceptionTag,
      hint: "A credible interval is the statement people wrongly attribute to confidence intervals. Which statement is that?",
      explain: `A credible interval carries a genuine probability statement about the parameter, conditional on the prior and the data. Confidence intervals cannot say this — their 95% belongs to the procedure. The irony is that the intuitive reading is correct here and wrong for the interval most papers actually report.`,
    };
  },
};

// ============================================================
// Multiplicity
// ============================================================
const MULTI_CONTEXTS = [
  { what: "candidate biomarkers", setting: "a discovery proteomics screen" },
  { what: "secondary outcomes", setting: "a trial report" },
  { what: "subgroup analyses", setting: "a post-hoc exploration" },
  { what: "genetic variants", setting: "an association study" },
  { what: "quality indicators", setting: "a hospital dashboard" },
] as const;

export const MULTIPLE_TESTING_FAMILY: QuestionFamily = {
  fid: "gen_multiple_testing",
  title: "Multiplicity — family-wise error, Bonferroni and FDR",
  method: "multiple_testing",
  diffMin: "resident",
  variants: ["fwer", "bonferroni", "fdr_vs_fwer"],
  gen: (rng) => {
    const c = rng.pick(MULTI_CONTEXTS);
    const variant = rng.pick(["fwer", "bonferroni", "fdr_vs_fwer"] as const);
    const alpha = rng.pick([0.05, 0.01] as const);

    if (variant === "fwer") {
      const m = rng.int(3, 60);
      const cohort = rng.int(2, 40) * 50;
      const fwer = (1 - Math.pow(1 - alpha, m)) * 100;
      if (fwer > 97) degenerate("family-wise error pinned at 100%");
      return {
        _variant: variant, _params: { m, alpha, fwer },
        // After the learner commits to a number, run the family once for real.
        simulate: { kind: "multiplicity", seed: rng.int(1, 1 << 29), m, alpha },
        q: `If every null hypothesis is in fact true, what is the probability of at least one false positive? Answer as a percentage.`,
        scenario: `${c.setting[0].toUpperCase()}${c.setting.slice(1)} in ${num(cohort)} patients tests ${m} independent ${c.what}, each at α = ${alpha}.`,
        type: "numeric",
        answer: +fwer.toFixed(2),
        tol: Math.max(0.3, +(fwer * 0.02).toFixed(2)),
        hint: "\"At least one\" is easiest through its complement: the chance that every single test behaves itself.",
        explain: `P(no false positive) = (1 − ${alpha})^${m} = ${Math.pow(1 - alpha, m).toFixed(4)}, so P(at least one) ≈ ${fwer.toFixed(1)}%. Each test is well behaved at ${alpha * 100}%, and the FAMILY is not — which is the entire argument for multiplicity adjustment, and why a paper reporting ${m} outcomes with one "significant" finding deserves scepticism.`,
      };
    }

    if (variant === "bonferroni") {
      const m = rng.int(4, 90);
      const cohort = rng.int(2, 40) * 50;
      const thr = alpha / m;
      return {
        _variant: variant, _params: { m, alpha, thr },
        q: `Using a Bonferroni correction, what per-test significance threshold should you apply? Give the threshold itself.`,
        scenario: `${c.setting[0].toUpperCase()}${c.setting.slice(1)} in ${num(cohort)} patients tests ${m} ${c.what}, and you want a family-wise error rate of ${alpha}.`,
        type: "numeric",
        answer: +thr.toFixed(6),
        tol: Math.max(0.000005, +(thr * 0.02).toFixed(6)),
        hint: "Bonferroni splits the error budget equally among the tests.",
        explain: `Threshold = α/m = ${alpha}/${m} ≈ ${thr.toFixed(5)}. Bonferroni is conservative — it ignores any correlation between the tests — but it needs no assumptions, which is why it survives as the default when you cannot characterise the dependence.`,
      };
    }

    // fdr_vs_fwer
    const m = rng.int(200, 20000);
    const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
      { text: `The expected PROPORTION of the discoveries you call significant that are false.`, correct: true },
      { text: `The probability of making at least one false discovery anywhere in the family.`,
        tag: "fdr_confused_with_fwer",
        explain: `That is the family-wise error rate, which Bonferroni and Holm control. Across ${num(m)} tests, insisting on it is so strict that real signals are routinely lost — which is precisely why the FDR was proposed as the alternative for screening work.` },
      { text: `The proportion of the ${num(m)} tests that will produce a false positive.`,
        tag: "fdr_denominator_taken_as_all_tests",
        explain: `The denominator of the FDR is the set you DECLARED significant, not all ${num(m)} tests. That difference is what makes the FDR adaptive: discover more, and you are allowed proportionally more mistakes.` },
      { text: `The probability that any individual null hypothesis is true.`,
        tag: "fdr_read_as_a_posterior_probability",
        explain: `The FDR is an expected proportion over the rejected set, not a probability attached to one hypothesis. The per-hypothesis quantity has a name — the local false discovery rate — and it is a different number.` },
    ]);
    return {
      _variant: variant, _params: { m },
      q: `The Benjamini–Hochberg procedure controls the false discovery rate. What exactly is that?`,
      scenario: `${c.setting[0].toUpperCase()}${c.setting.slice(1)} screens ${num(m)} ${c.what} and you must choose a multiplicity approach.`,
      type: "mcq",
      options, answer, optionExplanations, misconceptionTag,
      hint: "The two frameworks differ in their DENOMINATOR. Ask what set each error rate is a fraction of.",
      explain: `The FDR is E[false discoveries / total discoveries]: a proportion of what you declared, not of what you tested. Controlling it at 10% across ${num(m)} tests accepts that about one in ten of your hits is noise — a sensible bargain for a screen whose findings will be validated, and a poor one for a confirmatory trial.`,
    };
  },
};

// ============================================================
// Power and sample size
// ============================================================
export const POWER_FAMILY: QuestionFamily = {
  fid: "gen_power",
  title: "Power — effect size, sample size and the non-significant result",
  method: "power",
  diffMin: "resident",
  variants: ["n_scaling", "beta_events", "underpowered"],
  gen: (rng) => {
    const t = rng.pick([
      { outcome: "systolic blood pressure", unit: "mmHg", setting: "a hypertension trial" },
      { outcome: "six-minute walk distance", unit: "m", setting: "a rehabilitation trial" },
      { outcome: "HbA1c", unit: "%", setting: "a diabetes trial" },
      { outcome: "pain score", unit: "points", setting: "an analgesia trial" },
    ] as const);
    const variant = rng.pick(["n_scaling", "beta_events", "underpowered"] as const);

    if (variant === "n_scaling") {
      const n0 = rng.int(3, 20) * 50;
      const k = rng.pick([2, 3] as const);
      const want = n0 * k * k;
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
        { text: `${num(want)} per arm`, correct: true },
        { text: `${num(n0 * k)} per arm`, tag: "sample_size_assumed_linear_in_effect_size",
          explain: `${num(n0 * k)} assumes n scales with 1/δ. It scales with 1/δ², because the standard error falls only as √n: detecting an effect ${k} times smaller costs ${k}² = ${k * k} times the patients, not ${k} times.` },
        { text: `${num(Math.round(n0 * Math.sqrt(k)))} per arm`, tag: "square_root_applied_to_the_effect_size",
          explain: `The square root belongs to the sample size, not to the effect. Inverting the relationship gives n ∝ 1/δ², so the multiplier is ${k}² = ${k * k}.` },
        { text: `${num(n0)} per arm — the required sample size depends on the variance, not on the effect size`, tag: "effect_size_omitted_from_sample_size",
          explain: `Both matter, and they enter as a ratio: n depends on (σ/δ)². Halving δ and halving σ have exactly the same effect on n, which is why sample-size calculations are quoted in standardised effect sizes.` },
      ]);
      return {
        _variant: variant, _params: { n0, k, want },
        q: `How many patients per arm will the definitive trial need?`,
        scenario: `${t.setting[0].toUpperCase()}${t.setting.slice(1)} was powered at 90% to detect a difference in ${t.outcome} with ${num(n0)} patients per arm. The definitive trial must detect a difference ${k} times SMALLER, at the same power, significance level and variance.`,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "Sample size depends on the SQUARE of the standardised effect. Invert that before reaching for a multiplier.",
        explain: `n ∝ (σ/δ)², so dividing δ by ${k} multiplies n by ${k}² = ${k * k}: ${num(n0)} → ${num(want)} per arm. This quadratic cost is why chasing small effects gets expensive so fast, and why a trial powered for an optimistic effect is usually hopeless against a realistic one.`,
      };
    }

    if (variant === "beta_events") {
      const power = rng.int(60, 92);
      const trials = rng.int(20, 200);
      const missed = (trials * (100 - power)) / 100;
      return {
        _variant: variant, _params: { power, trials, missed },
        q: `If the true effect really is the target size, how many of these trials would you expect to report a NON-significant result?`,
        scenario: `Imagine running ${trials} independent copies of ${t.setting}, each powered at ${power}% to detect the same target difference in ${t.outcome}.`,
        type: "numeric",
        answer: +missed.toFixed(2),
        tol: Math.max(0.2, +(missed * 0.02).toFixed(2)),
        hint: "Power is the proportion that WOULD detect the effect. The rest miss it.",
        explain: `${trials} × (1 − ${power / 100}) = ${missed.toFixed(1)} trials would miss a real effect of the target size. At ${power}% power, roughly ${(100 - power).toFixed(0)}% of honest, correctly-conducted trials of a genuinely effective treatment come back "negative" — which is why a single non-significant trial is weak evidence against an effect.`,
      };
    }

    // underpowered — how to read a non-significant result
    const powered = rng.next() < 0.5;
    const power = powered ? rng.int(85, 95) : rng.int(25, 45);
    const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
      powered
        ? { text: `The trial had a good chance of detecting the target effect and did not, so the data argue against an effect that large — check the confidence interval for what remains plausible.`, correct: true }
        : { text: `The trial was unlikely to detect even the target effect, so this result is largely uninformative about whether that effect exists.`, correct: true },
      powered
        ? { text: `The trial was unlikely to detect even the target effect, so the result is largely uninformative.`,
            tag: "adequate_power_dismissed",
            explain: `At ${power}% power the trial would have found a target-sized effect in about ${power} runs out of 100. Failing to find it is genuine, if limited, evidence against an effect of that magnitude — quite different from a study that never had a chance.` }
        : { text: `The trial had a good chance of detecting the target effect and did not, so the data argue against it.`,
            tag: "underpowered_null_read_as_evidence_of_absence",
            explain: `At ${power}% power, a real target-sized effect would have been missed about ${100 - power} times in 100. A non-significant result here is close to what you would expect whether or not the treatment works, so it discriminates between those possibilities hardly at all.` },
      { text: `Post-hoc power calculated from the observed effect would settle the question.`,
        tag: "post_hoc_power_treated_as_informative",
        explain: `Observed power is a one-to-one function of the p-value, so it adds no information whatsoever: a non-significant result always yields low observed power, by arithmetic. The confidence interval answers the question that post-hoc power is reaching for.` },
      { text: `A non-significant result always means the null hypothesis is true.`,
        tag: "non_significance_read_as_proof_of_the_null",
        explain: `No test can establish the null. Failing to reject means the data were compatible with it — along with a whole range of non-null effects that the interval will show you.` },
    ]);
    return {
      _variant: variant, _params: { power, powered: powered ? 1 : 0 },
      q: `How should this non-significant result be read?`,
      scenario: `${t.setting[0].toUpperCase()}${t.setting.slice(1)} reports no significant difference in ${t.outcome}. Its protocol states the study had ${power}% power to detect the target difference.`,
      type: "mcq",
      options, answer, optionExplanations, misconceptionTag,
      hint: "A negative result is only informative in proportion to the chance the study had of finding something.",
      explain: powered
        ? `With ${power}% power, a target-sized effect would have been detected in roughly ${power}% of repetitions. Not finding it is meaningful evidence against an effect that big — though the confidence interval, not the p-value, is what tells you which smaller effects are still on the table.`
        : `With only ${power}% power, this trial would have missed a real target-sized effect about ${100 - power}% of the time. The result is therefore close to uninformative: it is the confidence interval, almost certainly wide, that should be reported rather than the word "negative".`,
    };
  },
};

// ============================================================
// Correlation
// ============================================================
const CORR_PAIRS = [
  { x: "BMI", y: "systolic blood pressure", shape: "linear" },
  { x: "age", y: "grip strength", shape: "linear" },
  { x: "serum creatinine", y: "measured GFR", shape: "curved" },
  { x: "drug dose", y: "receptor occupancy", shape: "curved" },
  { x: "tumour stage (I–IV)", y: "symptom burden score", shape: "ordinal" },
  { x: "NYHA class", y: "six-minute walk distance", shape: "ordinal" },
] as const;

export const CORRELATION_FAMILY: QuestionFamily = {
  fid: "gen_correlation",
  title: "Correlation — variance explained, Pearson versus Spearman",
  method: "correlation",
  diffMin: "resident",
  variants: ["r_squared", "which_coefficient", "interpret"],
  gen: (rng) => {
    const pair = rng.pick(CORR_PAIRS);
    const variant = rng.pick(["r_squared", "which_coefficient", "interpret"] as const);
    const r = (rng.next() < 0.5 ? -1 : 1) * rng.int(25, 92) / 100;

    if (variant === "r_squared") {
      const pct = r * r * 100;
      return {
        _variant: variant, _params: { r, pct },
        q: `What percentage of the variance in ${pair.y} is explained by ${pair.x}?`,
        scenario: `A study of ${num(rng.int(2, 15) * 100)} patients reports a Pearson correlation of r = ${r.toFixed(2)} between ${pair.x} and ${pair.y}.`,
        type: "numeric",
        answer: +pct.toFixed(2),
        tol: Math.max(0.3, +(pct * 0.02).toFixed(2)),
        hint: "The share of variance explained is not r itself.",
        explain: `r² = ${r.toFixed(2)}² = ${(r * r).toFixed(3)}, so about ${pct.toFixed(0)}% of the variance is shared. Note how much smaller this is than r suggests: a correlation of ${Math.abs(r).toFixed(2)} sounds substantial, yet leaves ${(100 - pct).toFixed(0)}% of the variation unaccounted for. Squaring is what keeps correlations honest.`,
      };
    }

    if (variant === "which_coefficient") {
      const pearsonOk = pair.shape === "linear";
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
        pearsonOk
          ? { text: `Pearson's r — the relationship is linear and both variables are continuous.`, correct: true }
          : { text: `Spearman's rho — it only assumes a monotone relationship and works on ranks.`, correct: true },
        pearsonOk
          ? { text: `Spearman's rho — it only assumes a monotone relationship and works on ranks.`,
              tag: "rank_method_used_where_pearson_applies",
              explain: `Spearman would not be wrong here, but it discards information: with a genuinely linear relationship between two continuous measurements, Pearson's r uses the actual values and is the more powerful summary.` }
          : { text: `Pearson's r — the relationship is linear and both variables are continuous.`,
              tag: "pearson_applied_to_a_nonlinear_or_ordinal_relationship",
              explain: pair.shape === "ordinal"
                ? `${pair.x} is an ordered CATEGORY, not a measurement: the gap between adjacent levels is not a known quantity, so the arithmetic Pearson performs on those numbers has no meaning. Ranks are exactly what the data support.`
                : `Pearson's r measures the strength of a STRAIGHT-LINE relationship. A strong curved relationship can produce a small r, and reporting that as "weakly associated" misses a real and possibly monotone pattern.` },
        { text: `Neither — correlation cannot be used when one variable might cause the other.`,
          tag: "correlation_thought_invalid_under_causation",
          explain: `Correlation is a description of co-variation and is perfectly valid whether or not a causal link exists. What it cannot do is establish that link.` },
        { text: `Either one — they give the same answer whenever the sample is large enough.`,
          tag: "pearson_and_spearman_assumed_to_converge",
          explain: `They answer different questions and do not converge: Pearson measures linearity, Spearman monotonicity. On a strongly curved but monotone relationship Spearman can approach 1 while Pearson stays middling, however large the sample.` },
      ]);
      return {
        _variant: variant, _params: { shape: pair.shape },
        q: `Which correlation coefficient should you report?`,
        scenario: pair.shape === "ordinal"
          ? `You want to summarise the association between ${pair.x} — an ordered category — and ${pair.y} in ${num(rng.int(1, 9) * 100)} patients.`
          : pair.shape === "curved"
            ? `A scatter plot of ${pair.x} against ${pair.y} in ${num(rng.int(1, 9) * 100)} patients shows a strong but clearly CURVED relationship: it rises steeply at first and then flattens.`
            : `A scatter plot of ${pair.x} against ${pair.y} in ${num(rng.int(1, 9) * 100)} patients shows a clean straight-line trend with even scatter throughout.`,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "Look at the plot and the measurement scales before choosing. One coefficient assumes a straight line; the other assumes only that the trend goes one way.",
        explain: pearsonOk
          ? `Pearson's r is the right choice: both variables are continuous and the relationship is linear, so r captures it faithfully and uses the full information in the values.`
          : pair.shape === "ordinal"
            ? `Spearman's rho: with an ordered category, only the RANKING is meaningful, and rho is built from ranks alone.`
            : `Spearman's rho: the relationship is monotone but not linear, so Pearson would understate it. Rho asks only whether one variable rises as the other does.`,
      };
    }

    // interpret — the standard traps
    const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
      { text: `Nothing about causation, and nothing about the STEEPNESS of the relationship.`, correct: true },
      { text: `That a one-unit rise in ${pair.x} produces an r-unit rise in ${pair.y}.`,
        tag: "correlation_read_as_a_slope",
        explain: `That is a regression slope, which carries units and depends on the scales of both variables. A correlation is unit-free and says only how tightly the points cluster around a line, not how steep that line is.` },
      { text: `That the association would be equally strong in any other population.`,
        tag: "correlation_assumed_portable_across_populations",
        explain: `Correlations depend on the RANGE of the variables in the sample. Restricting the range — studying only severe cases, say — shrinks r even when the underlying relationship is unchanged. This is restriction of range, and it makes correlations poor things to compare across studies.` },
      { text: `That ${pair.x} explains ${Math.abs(r * 100).toFixed(0)}% of the variation in ${pair.y}.`,
        tag: "r_read_as_variance_explained",
        explain: `Variance explained is r², not r: ${r.toFixed(2)}² = ${(r * r * 100).toFixed(0)}%, not ${Math.abs(r * 100).toFixed(0)}%. The gap between the two is largest for middling correlations, which is where the error does the most damage.` },
    ]);
    return {
      _variant: variant, _params: { r },
      q: `What does r = ${r.toFixed(2)} NOT tell you?`,
      scenario: `A cohort study reports a Pearson correlation of r = ${r.toFixed(2)} between ${pair.x} and ${pair.y}.`,
      type: "mcq",
      options, answer, optionExplanations, misconceptionTag,
      hint: "A correlation is a unit-free measure of scatter about a line. List what that leaves out.",
      explain: `A correlation says how tightly points hug a straight line, and nothing else. It carries no direction of causation, no slope (that needs regression, in real units), and no guarantee of portability to a population with a different spread of ${pair.x}.`,
    };
  },
};
