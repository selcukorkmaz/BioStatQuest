// Item families for the Regression branch: linear models, logistic models,
// proportional-hazards models, and model selection.

import type { RNG, QuestionFamily, Choice } from "./core";
import { assemble, degenerate, num } from "./core";

const f2 = (x: number) => x.toFixed(2);
const f3 = (x: number) => x.toFixed(3);

/** Right-aligned fixed-width table, close enough to R's print() to read as one. */
function rTable(header: string[], rows: string[][]): string {
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)) + 2);
  const line = (cells: string[], firstLeft: boolean) =>
    cells.map((c, i) => (i === 0 && firstLeft ? c.padEnd(widths[0]) : c.padStart(widths[i]))).join("");
  return [line(header, true), ...rows.map((r) => line(r, true))].join("\n");
}

// ============================================================
// Linear model — reading a coefficient table
// ============================================================
type LmCtx = {
  outcome: string; unit: string;
  p1: string; p1unit: string; p1range: [number, number];
  p2: string; p2unit: string; p2range: [number, number];
  cohort: string;
};

const LM_CONTEXTS: readonly LmCtx[] = [
  { outcome: "systolic blood pressure", unit: "mmHg", cohort: "a primary-care hypertension cohort",
    p1: "age", p1unit: "years", p1range: [40, 80], p2: "BMI", p2unit: "kg/m²", p2range: [20, 38] },
  { outcome: "six-minute walk distance", unit: "m", cohort: "a pulmonary rehabilitation cohort",
    p1: "age", p1unit: "years", p1range: [50, 85], p2: "FEV1", p2unit: "L", p2range: [1, 3] },
  { outcome: "HbA1c", unit: "%", cohort: "a type-2 diabetes registry",
    p1: "BMI", p1unit: "kg/m²", p1range: [22, 40], p2: "diabetes duration", p2unit: "years", p2range: [1, 20] },
  { outcome: "hospital length of stay", unit: "days", cohort: "a general-medicine admission cohort",
    p1: "age", p1unit: "years", p1range: [45, 90], p2: "Charlson comorbidity index", p2unit: "points", p2range: [0, 8] },
];

export const LM_INTERPRET_FAMILY: QuestionFamily = {
  fid: "gen_lm_interpret",
  title: "Reading a linear-model coefficient table",
  method: "lm",
  diffMin: "resident",
  variants: ["slope", "prediction", "intercept"],
  gen: (rng) => {
    const c = rng.pick(LM_CONTEXTS);
    const centred = rng.next() < 0.5;
    const b0 = rng.int(-400, 1400) / 10;
    const b1 = (rng.next() < 0.5 ? -1 : 1) * rng.int(80, 950) / 1000;
    const b2 = (rng.next() < 0.5 ? -1 : 1) * rng.int(150, 2400) / 1000;
    if (Math.abs(b1) < 0.05 || Math.abs(b2) < 0.05) degenerate("coefficient too close to zero to interpret");
    const se1 = +(Math.abs(b1) / rng.int(25, 90) * 10).toFixed(3);
    const se2 = +(Math.abs(b2) / rng.int(25, 90) * 10).toFixed(3);
    const n = rng.int(180, 1400);
    const p1Name = centred ? `${c.p1}_c` : c.p1.replace(/\s+/g, "_");
    const p2Name = centred ? `${c.p2.replace(/\s+/g, "_")}_c` : c.p2.replace(/\s+/g, "_");
    const mean1 = rng.int(c.p1range[0], c.p1range[1]);
    const mean2 = rng.int(c.p2range[0], c.p2range[1]);

    const output = `> summary(fit)$coefficients\n` + rTable(
      ["", "Estimate", "Std. Error", "t value"],
      [
        ["(Intercept)", f3(b0), f3(Math.abs(b0) / rng.int(20, 60) * 10), f2(b0 / (Math.abs(b0) / 4 + 0.1))],
        [p1Name, f3(b1), f3(se1), f2(b1 / se1)],
        [p2Name, f3(b2), f3(se2), f2(b2 / se2)],
      ],
    );
    const setup = centred
      ? `A linear model is fitted in ${c.cohort} (n = ${num(n)}). The outcome is ${c.outcome} (${c.unit}); both predictors are mean-centred (${p1Name} = ${c.p1} − ${mean1}, ${p2Name} = ${c.p2} − ${mean2}).`
      : `A linear model is fitted in ${c.cohort} (n = ${num(n)}). The outcome is ${c.outcome} (${c.unit}); the predictors are ${c.p1} (${c.p1unit}) and ${c.p2} (${c.p2unit}), both untransformed.`;
    const shared = { scenario: setup, output, outputLang: "r" };
    const variant = rng.pick(["slope", "prediction", "intercept"] as const);

    if (variant === "prediction") {
      const x1 = rng.int(c.p1range[0], c.p1range[1]);
      const x2 = rng.int(c.p2range[0], c.p2range[1]);
      const u1 = centred ? x1 - mean1 : x1;
      const u2 = centred ? x2 - mean2 : x2;
      const yhat = b0 + b1 * u1 + b2 * u2;
      return {
        ...shared,
        _variant: variant,
        _params: { b0, b1, b2, x1, x2, centred: centred ? 1 : 0, mean1, mean2, yhat },
        q: `What does the model predict for a patient with ${c.p1} = ${x1} ${c.p1unit} and ${c.p2} = ${x2} ${c.p2unit}, in ${c.unit}?`,
        type: "numeric",
        answer: +yhat.toFixed(2),
        tol: Math.max(0.05, +(Math.abs(yhat) * 0.01).toFixed(2)),
        hint: centred
          ? "The predictors are centred, so feed the model the DEVIATION from each mean, not the raw value."
          : "Multiply each raw predictor by its coefficient and add the intercept.",
        explain: centred
          ? `Centred values: ${x1} − ${mean1} = ${u1} and ${x2} − ${mean2} = ${u2}. ŷ = ${f3(b0)} + (${f3(b1)} × ${u1}) + (${f3(b2)} × ${u2}) ≈ ${yhat.toFixed(2)} ${c.unit}. Feeding in the RAW values would give ${(b0 + b1 * x1 + b2 * x2).toFixed(2)} — the commonest slip with centred models.`
          : `ŷ = ${f3(b0)} + (${f3(b1)} × ${x1}) + (${f3(b2)} × ${x2}) ≈ ${yhat.toFixed(2)} ${c.unit}. Centring would not change this prediction — only what the intercept means.`,
      };
    }

    if (variant === "slope") {
      const dir = b1 > 0 ? "higher" : "lower";
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
        { text: `Each additional ${c.p1unit.replace(/s$/, "")} of ${c.p1} is associated with a ${Math.abs(b1).toFixed(3)} ${c.unit} ${dir} ${c.outcome}, adjusting for ${c.p2}.`, correct: true },
        { text: `Increasing ${c.p1} by one ${c.p1unit.replace(/s$/, "")} CAUSES ${c.outcome} to change by ${Math.abs(b1).toFixed(3)} ${c.unit}.`,
          tag: "regression_coefficient_read_as_causal",
          explain: `The arithmetic is right, the claim is not. A coefficient from observational data is an association conditional on the covariates in the model — it becomes a causal effect only under assumptions (no unmeasured confounding, correct functional form) that a regression table cannot supply.` },
        { text: `${c.outcome[0].toUpperCase()}${c.outcome.slice(1)} changes by ${(Math.abs(b1) * 100).toFixed(1)}% for each additional ${c.p1unit.replace(/s$/, "")} of ${c.p1}.`,
          tag: "linear_coefficient_read_as_percentage",
          explain: `On an untransformed outcome the coefficient is in the OUTCOME'S OWN UNITS (${c.unit}), not a percentage. Percentage interpretations belong to models fitted on the log scale, where exp(β) is a multiplicative factor.` },
        { text: `${Math.abs(b1).toFixed(3)} ${c.unit} is the average ${c.outcome} among patients with a typical ${c.p1}.`,
          tag: "slope_confused_with_a_fitted_value",
          explain: `That would be a predicted VALUE, which comes from the intercept plus the slopes times the predictors. A slope is a rate of change — how much the prediction moves per one-unit step.` },
      ]);
      return {
        ...shared,
        _variant: variant,
        _params: { b1, b2, centred: centred ? 1 : 0 },
        q: `Which statement correctly interprets the ${p1Name} coefficient?`,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "A slope has three parts: a per-unit step in the predictor, a change in the outcome's own units, and the phrase 'holding the other predictors fixed'.",
        explain: `β = ${f3(b1)} means that, comparing two patients who differ by one ${c.p1unit.replace(/s$/, "")} in ${c.p1} but have the same ${c.p2}, the model expects ${c.outcome} to differ by ${Math.abs(b1).toFixed(3)} ${c.unit} (${dir} for the older/larger one). Centring shifts the intercept, never the slopes.`,
      };
    }

    // intercept — whether the intercept is interpretable flips with centring.
    const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
      centred
        ? { text: `The expected ${c.outcome} for a patient at the mean ${c.p1} and the mean ${c.p2} — a meaningful reference value here.`, correct: true }
        : { text: `The expected ${c.outcome} for a patient with ${c.p1} = 0 and ${c.p2} = 0 — an extrapolation far outside the data, so not interpretable on its own.`, correct: true },
      centred
        ? { text: `The expected ${c.outcome} for a patient with ${c.p1} = 0 and ${c.p2} = 0 — an extrapolation far outside the data.`,
            tag: "centring_overlooked_when_reading_the_intercept",
            explain: `That is what the intercept means for RAW predictors. Here both are centred, so zero on the model's scale is the sample mean, not a patient of age zero. Centring exists precisely to make the intercept interpretable.` }
        : { text: `The expected ${c.outcome} for a patient at the mean ${c.p1} and the mean ${c.p2}.`,
            tag: "raw_intercept_read_as_the_centred_one",
            explain: `That would be true if the predictors were mean-centred; they are not. With raw predictors the intercept sits at ${c.p1} = 0 and ${c.p2} = 0 — a patient who does not exist.` },
      { text: `The average ${c.outcome} across all patients in the sample, whatever their covariates.`,
        tag: "intercept_confused_with_the_marginal_mean",
        explain: `The sample mean of the outcome is a one-number summary that ignores the model. The intercept is a CONDITIONAL quantity: the prediction at one specific point in predictor space (wherever zero happens to be).` },
      { text: `The smallest ${c.outcome} the model is willing to predict.`,
        tag: "intercept_read_as_a_bound",
        explain: `Nothing bounds a linear prediction: with a negative slope and a large enough predictor the fitted value can fall below the intercept, or below zero entirely. That is one reason linear models misbehave on strictly positive outcomes.` },
    ]);
    return {
      ...shared,
      _variant: variant,
      _params: { b0, centred: centred ? 1 : 0 },
      q: `What does the intercept (${f3(b0)}) represent?`,
      type: "mcq",
      options, answer, optionExplanations, misconceptionTag,
      hint: "The intercept is always the prediction when every predictor equals zero. The only question is where zero happens to sit on this model's scale.",
      explain: centred
        ? `With both predictors centred, zero means "at the sample mean", so the intercept ${f3(b0)} ${c.unit} is the predicted ${c.outcome} for an average patient — a number worth reporting.`
        : `With raw predictors, zero means ${c.p1} = 0 and ${c.p2} = 0. The intercept ${f3(b0)} ${c.unit} is the model's prediction there, far outside the observed range, so it is a fitting constant rather than a clinical quantity. Centring would fix that without changing a single slope.`,
    };
  },
};

// ============================================================
// Logistic regression — the log-odds scale
// ============================================================
type LogitCtx = { outcome: string; exposure: string; unit: string; cohort: string };

const LOGIT_CONTEXTS: readonly LogitCtx[] = [
  { outcome: "30-day readmission", exposure: "age", unit: "year", cohort: "a heart-failure discharge cohort" },
  { outcome: "surgical-site infection", exposure: "operating time", unit: "10 minutes", cohort: "a colorectal surgery series" },
  { outcome: "in-hospital mortality", exposure: "admission lactate", unit: "mmol/L", cohort: "an ICU sepsis cohort" },
  { outcome: "treatment response", exposure: "baseline symptom score", unit: "point", cohort: "a depression trial" },
  { outcome: "post-operative delirium", exposure: "Charlson index", unit: "point", cohort: "an orthopaedic cohort" },
];

export const LOGISTIC_OR_FAMILY: QuestionFamily = {
  fid: "gen_logistic_or",
  title: "Logistic regression — odds ratios and the log-odds scale",
  method: "logistic",
  diffMin: "resident",
  variants: ["or_from_beta", "prob_from_logodds", "scale"],
  gen: (rng) => {
    const c = rng.pick(LOGIT_CONTEXTS);
    const variant = rng.pick(["or_from_beta", "prob_from_logodds", "scale"] as const);
    const beta = (rng.next() < 0.5 ? -1 : 1) * rng.int(40, 480) / 1000;
    const or = Math.exp(beta);

    if (variant === "or_from_beta") {
      return {
        _variant: variant, _params: { beta, or },
        q: `What is the odds ratio for a one-${c.unit} increase in ${c.exposure}?`,
        scenario: `A logistic model for ${c.outcome} in ${c.cohort} reports a coefficient of ${f3(beta)} for ${c.exposure}, on the log-odds scale.`,
        type: "numeric",
        answer: +or.toFixed(3),
        tol: 0.01,
        hint: "Logistic coefficients live on the log-odds scale. One exponential takes you back to a ratio.",
        explain: `OR = exp(β) = exp(${f3(beta)}) ≈ ${or.toFixed(3)}. ${beta > 0 ? `Odds rise by about ${((or - 1) * 100).toFixed(1)}% per ${c.unit}.` : `Odds fall by about ${((1 - or) * 100).toFixed(1)}% per ${c.unit}.`} Reporting β itself is almost never useful clinically — nobody thinks in log-odds.`,
      };
    }

    if (variant === "prob_from_logodds") {
      const b0 = -(rng.int(5, 30) / 10);
      const x = rng.int(1, 12);
      const logit = b0 + beta * x;
      const p = 1 / (1 + Math.exp(-logit)) * 100;
      if (p < 2 || p > 95) degenerate("predicted probability sits at the edge of the scale");
      return {
        _variant: variant, _params: { b0, beta, x, logit, p },
        q: `What probability of ${c.outcome} does the model predict for a patient with ${c.exposure} = ${x}? Answer as a percentage.`,
        scenario: `A logistic model for ${c.outcome} in ${c.cohort} has intercept ${f3(b0)} and a coefficient of ${f3(beta)} per ${c.unit} of ${c.exposure}.`,
        type: "numeric",
        answer: +p.toFixed(2),
        tol: Math.max(0.3, +(p * 0.02).toFixed(2)),
        hint: "The linear predictor gives log-odds. Convert log-odds → odds → probability, or use 1/(1 + e^−logit) in one step.",
        explain: `Linear predictor = ${f3(b0)} + (${f3(beta)} × ${x}) = ${f3(logit)} on the log-odds scale. Odds = e^${f3(logit)} = ${Math.exp(logit).toFixed(3)}, so p = odds/(1 + odds) ≈ ${p.toFixed(1)}%. Note how a coefficient that looks small on the log scale can move probability a great deal near p = 0.5, and hardly at all near the extremes.`,
      };
    }

    // scale — ORs compound multiplicatively, which is where intuition fails.
    const k = rng.pick([5, 10, 20] as const);
    const orK = Math.exp(beta * k);
    if (orK > 40 || orK < 0.02) degenerate("compounded OR is off any sensible scale");
    const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
      { text: `${orK.toFixed(2)}`, correct: true },
      { text: `${(or * k).toFixed(2)}`, tag: "odds_ratio_scaled_linearly",
        explain: `Multiplying the OR by ${k} treats odds ratios as if they added up. They compound: ${k} steps of ${or.toFixed(3)} is ${or.toFixed(3)}^${k} = ${orK.toFixed(2)}, equivalently exp(${k} × ${f3(beta)}). Scaling linearly can put the answer off by an order of magnitude.` },
      { text: `${or.toFixed(2)}`, tag: "per_unit_or_reused_for_a_larger_step",
        explain: `${or.toFixed(2)} is the odds ratio for a ONE-${c.unit} step. The question asks about ${k} ${c.unit}s, which is ${k} such steps applied one after another.` },
      { text: `${(or / k).toFixed(3)}`, tag: "or_divided_instead_of_exponentiated",
        explain: `Dividing shrinks the effect in the wrong direction entirely. Whatever the step size, the rule is the same: multiply β by the step, THEN exponentiate.` },
    ]);
    return {
      _variant: variant, _params: { beta, or, k, orK },
      q: `What is the odds ratio for a ${k}-${c.unit} increase in ${c.exposure}?`,
      scenario: `A logistic model for ${c.outcome} in ${c.cohort} reports a coefficient of ${f3(beta)} per ${c.unit} of ${c.exposure} (OR ${or.toFixed(3)} per ${c.unit}).`,
      type: "mcq",
      options, answer, optionExplanations, misconceptionTag,
      hint: "Rescale on the scale where the model is linear — the log-odds scale — and only then exponentiate.",
      explain: `OR for ${k} ${c.unit}s = exp(${k} × ${f3(beta)}) = ${or.toFixed(3)}^${k} ≈ ${orK.toFixed(2)}. Odds ratios compound multiplicatively because the model is linear in LOG odds, not in odds — which is exactly why "per 10 units" results must be rescaled before they are compared.`,
    };
  },
};

// ============================================================
// Cox model — hazard ratios
// ============================================================
type SurvCtx = { outcome: string; arm: string; setting: string };

const SURV_CONTEXTS: readonly SurvCtx[] = [
  { outcome: "death from any cause", arm: "the intervention arm", setting: "a heart-failure trial" },
  { outcome: "disease progression", arm: "the combination-therapy arm", setting: "an oncology trial" },
  { outcome: "first hospitalisation", arm: "the nurse-led follow-up arm", setting: "a COPD cohort" },
  { outcome: "graft failure", arm: "the new immunosuppression regimen", setting: "a transplant registry" },
];

export const SURVIVAL_HR_FAMILY: QuestionFamily = {
  fid: "gen_survival_hr",
  title: "Cox models — reading a hazard ratio",
  method: "cox_ph",
  diffMin: "resident",
  variants: ["direction", "percent", "hr_vs_risk"],
  gen: (rng) => {
    const c = rng.pick(SURV_CONTEXTS);
    const variant = rng.pick(["direction", "percent", "hr_vs_risk"] as const);
    const protective = rng.next() < 0.5;
    const hr = protective ? rng.int(45, 88) / 100 : rng.int(115, 260) / 100;
    const width = rng.int(12, 40) / 100;
    const crosses = rng.next() < 0.4;
    const lo = crosses
      ? +Math.min(hr * (1 - width), 0.93).toFixed(2)
      : +(hr * (1 - width)).toFixed(2);
    const hi = crosses
      ? +Math.max(hr * (1 + width), 1.08).toFixed(2)
      : +(hr * (1 + width)).toFixed(2);
    const actuallyCrosses = lo < 1 && hi > 1;
    if (Math.abs(lo - 1) < 0.03 || Math.abs(hi - 1) < 0.03) degenerate("interval limit sits on the null");
    if (!(lo < hr && hr < hi)) degenerate("point estimate outside its own interval");

    if (variant === "percent") {
      const pct = Math.abs(1 - hr) * 100;
      return {
        _variant: variant, _params: { hr, pct, protective: protective ? 1 : 0 },
        q: `By what percentage does ${c.arm} change the hazard of ${c.outcome}? Give the size of the change as a positive percentage.`,
        scenario: `${c.setting[0].toUpperCase()}${c.setting.slice(1)} reports a Cox hazard ratio of ${hr.toFixed(2)} for ${c.arm} versus control.`,
        type: "numeric",
        answer: +pct.toFixed(2),
        tol: 0.5,
        hint: "A hazard ratio of 1 means no change. The percentage change is the distance from 1.",
        explain: `|1 − ${hr.toFixed(2)}| × 100 = ${pct.toFixed(0)}%, i.e. the hazard is ${protective ? "reduced" : "increased"} by about ${pct.toFixed(0)}%. This is a change in the instantaneous RATE of events among those still at risk, averaged over follow-up — not a statement about how many patients end up with the event.`,
      };
    }

    if (variant === "direction") {
      const pct = Math.abs(1 - hr) * 100;
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
        actuallyCrosses
          ? { text: `The interval includes 1, so these data are compatible with no difference in hazard.`, correct: true }
          : protective
            ? { text: `The hazard is about ${pct.toFixed(0)}% lower in ${c.arm}, and the interval excludes 1.`, correct: true }
            : { text: `The hazard is about ${pct.toFixed(0)}% higher in ${c.arm}, and the interval excludes 1.`, correct: true },
        actuallyCrosses
          ? { text: `The hazard is about ${pct.toFixed(0)}% ${protective ? "lower" : "higher"} in ${c.arm}, and the interval excludes 1.`,
              tag: "point_estimate_read_without_its_interval",
              explain: `The point estimate does point that way, but the interval runs ${lo.toFixed(2)} to ${hi.toFixed(2)} and straddles 1 — it is compatible with benefit, with harm, and with nothing at all. Reporting the direction as established here overstates what the data support.` }
          : { text: `The interval includes 1, so these data are compatible with no difference in hazard.`,
              tag: "interval_misread_as_covering_the_null",
              explain: `The interval is ${lo.toFixed(2)} to ${hi.toFixed(2)} — entirely ${hi < 1 ? "below" : "above"} 1, so no-difference is outside the range the data are compatible with.` },
        { text: `About ${pct.toFixed(0)}% ${protective ? "fewer" : "more"} patients in ${c.arm} experienced ${c.outcome}.`,
          tag: "hazard_ratio_read_as_a_risk_difference",
          explain: `A hazard ratio is a ratio of instantaneous event RATES among those still at risk, not a count or a proportion of patients. How many patients actually had the event depends on the baseline risk and the length of follow-up, neither of which the HR carries.` },
        { text: `Patients in ${c.arm} survive about ${pct.toFixed(0)}% longer.`,
          tag: "hazard_ratio_read_as_a_time_ratio",
          explain: `Hazard ratios do not translate into time ratios except under special models (an accelerated-failure-time model does exactly that job). Under proportional hazards, the effect on median survival depends on the shape of the baseline hazard.` },
      ]);
      return {
        _variant: variant, _params: { hr, lo, hi, crosses: actuallyCrosses ? 1 : 0 },
        q: `Which reading of this result is correct?`,
        scenario: `${c.setting[0].toUpperCase()}${c.setting.slice(1)} reports a Cox hazard ratio of ${hr.toFixed(2)} (95% CI ${lo.toFixed(2)} to ${hi.toFixed(2)}) for ${c.arm} versus control, for ${c.outcome}.`,
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "Two checks, in order: does the interval contain 1, and is the quantity a RATE or a count of patients?",
        explain: actuallyCrosses
          ? `The interval ${lo.toFixed(2)}–${hi.toFixed(2)} contains 1, so the result is not significant at the 5% level. It is also wide enough to be compatible with a clinically important effect in either direction — inconclusive, not negative.`
          : `The interval ${lo.toFixed(2)}–${hi.toFixed(2)} excludes 1, so the ${protective ? "reduction" : "increase"} in hazard is statistically significant. What the HR does NOT tell you is the absolute benefit — for that you need the control-arm event rate alongside it.`,
      };
    }

    // hr_vs_risk — what a hazard ratio cannot tell you
    const baseline = rng.int(8, 40);
    const treated = +(baseline * hr).toFixed(1);
    const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
      { text: `The absolute risk in the control arm, which the hazard ratio does not contain.`, correct: true },
      { text: `A larger sample size, so that the interval around the hazard ratio narrows.`, tag: "precision_confused_with_absolute_effect",
        explain: `More patients would sharpen the estimate of the RATIO, and leave you exactly as unable to convert it into an absolute benefit. Precision and scale are different problems.` },
      { text: `A longer follow-up, since hazard ratios only apply after the study ends.`, tag: "hazard_ratio_thought_to_need_completed_followup",
        explain: `A Cox model uses all the follow-up there is, censoring the rest; it does not wait for everyone to have an event. Longer follow-up changes precision and can expose non-proportionality — it is not what converts a ratio into a risk.` },
      { text: `The p-value, which determines whether the effect is large enough to matter.`, tag: "significance_confused_with_magnitude",
        explain: `A p-value speaks only to compatibility with the null. It carries nothing about how many events you would prevent, which is the question a clinician is actually asking.` },
    ]);
    return {
      _variant: variant, _params: { hr, baseline, treated },
      q: `You want to tell a patient how much this treatment would help THEM. What else must you know?`,
      scenario: `${c.setting[0].toUpperCase()}${c.setting.slice(1)} reports a hazard ratio of ${hr.toFixed(2)} for ${c.outcome} in ${c.arm}.`,
      type: "mcq",
      options, answer, optionExplanations, misconceptionTag,
      hint: "A ratio is a multiplier. A multiplier is useless until you know what it multiplies.",
      explain: `A hazard ratio is relative: ${hr.toFixed(2)} applied to a control-arm risk of ${baseline}% gives roughly ${treated}%, an absolute difference of ${Math.abs(baseline - treated).toFixed(1)} percentage points; applied to a control risk of 2% it would move almost nothing. Same ratio, wildly different clinical meaning — which is why relative effects should always be reported next to absolute ones.`,
    };
  },
};

// ============================================================
// Model selection — information criteria
// ============================================================
const MODEL_TOPICS = [
  "predicting length of stay", "predicting 30-day readmission", "explaining HbA1c",
  "predicting ICU mortality", "explaining walk-test distance",
] as const;

export const MODEL_SELECTION_FAMILY: QuestionFamily = {
  fid: "gen_model_selection",
  title: "Model selection — AIC, ΔAIC, and the R² trap",
  method: "model_selection",
  diffMin: "fellow",
  variants: ["aic_compute", "pick_model", "delta"],
  gen: (rng) => {
    const topic = rng.pick(MODEL_TOPICS);
    const variant = rng.pick(["aic_compute", "pick_model", "delta"] as const);

    if (variant === "aic_compute") {
      const k = rng.int(3, 12);
      const logLik = -rng.int(2000, 9000) / 10;
      const aic = -2 * logLik + 2 * k;
      return {
        _variant: variant, _params: { k, logLik, aic },
        q: `What is the AIC of this model?`,
        scenario: `A model for ${topic} has a maximised log-likelihood of ${logLik.toFixed(1)} and estimates ${k} parameters (including the intercept and the residual variance).`,
        type: "numeric",
        answer: +aic.toFixed(2),
        tol: 0.5,
        hint: "AIC rewards fit and charges rent for every parameter — two units of rent each.",
        explain: `AIC = −2·logLik + 2k = −2(${logLik.toFixed(1)}) + 2(${k}) = ${aic.toFixed(1)}. The penalty is what stops AIC from always preferring the biggest model: adding a parameter must buy at least 1 unit of log-likelihood to pay for itself.`,
      };
    }

    if (variant === "pick_model") {
      // Constructed so the best AIC and the best R² are DIFFERENT models.
      const kA = rng.int(3, 5), kB = kA + rng.int(2, 4), kC = kB + rng.int(3, 8);
      const llA = -rng.int(3000, 5000) / 10;
      const llB = llA + rng.int(30, 90) / 10;   // clear improvement
      const llC = llB + rng.int(1, 12) / 10;    // marginal improvement, many parameters
      const aic = (ll: number, k: number) => -2 * ll + 2 * k;
      const rows = [
        { name: "Model A", k: kA, ll: llA, aic: aic(llA, kA), r2: 0 },
        { name: "Model B", k: kB, ll: llB, aic: aic(llB, kB), r2: 0 },
        { name: "Model C", k: kC, ll: llC, aic: aic(llC, kC), r2: 0 },
      ];
      // R² is monotone in fit, so C always "wins" on R² — the trap.
      rows[0].r2 = +(rng.int(30, 45) / 100).toFixed(3);
      rows[1].r2 = +(rows[0].r2 + rng.int(4, 9) / 100).toFixed(3);
      rows[2].r2 = +(rows[1].r2 + rng.int(1, 3) / 100).toFixed(3);
      const best = rows.reduce((a, b) => (b.aic < a.aic ? b : a));
      if (best.name !== "Model B") degenerate("construction failed to make the middle model best on AIC");
      if (rows[2].aic - best.aic < 3) degenerate("the overfitted model is not clearly worse on AIC");

      const output = `> model_comparison\n` + rTable(
        ["", "k", "logLik", "AIC", "R2"],
        rows.map((r) => [r.name, String(r.k), r.ll.toFixed(1), r.aic.toFixed(1), r.r2.toFixed(3)]),
      );
      const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
        { text: "Model B", correct: true },
        { text: "Model C", tag: "r_squared_used_for_model_selection",
          explain: `Model C does have the highest R² (${rows[2].r2.toFixed(3)}) and the highest log-likelihood — it must, because R² can only rise when you add predictors. That is exactly why it cannot be a selection criterion. AIC charges ${rows[2].k - rows[1].k} extra parameters against a log-likelihood gain of only ${(rows[2].ll - rows[1].ll).toFixed(1)}, leaving it ${(rows[2].aic - rows[1].aic).toFixed(1)} units worse.` },
        { text: "Model A", tag: "smallest_model_preferred_by_reflex",
          explain: `Parsimony is a tie-breaker, not a goal in itself. Model A is ${(rows[0].aic - rows[1].aic).toFixed(1)} AIC units worse than Model B: the extra parameters in B buy more than they cost.` },
        { text: "They are indistinguishable — AIC differences under 10 never matter", tag: "delta_aic_threshold_inflated",
          explain: `The usual rough guide is ΔAIC below about 2 for "hard to distinguish", not 10. Here the spread is ${(Math.max(...rows.map(r => r.aic)) - best.aic).toFixed(1)} units, which is well past any reading of the threshold.` },
      ]);
      return {
        _variant: variant,
        _params: { aicA: rows[0].aic, aicB: rows[1].aic, aicC: rows[2].aic },
        q: `Which model should you prefer?`,
        scenario: `Three nested models for ${topic} are compared on the same data.`,
        output, outputLang: "r",
        type: "mcq",
        options, answer, optionExplanations, misconceptionTag,
        hint: "One of these columns can only ever increase as you add predictors. Selecting on it is selecting on nothing.",
        explain: `Lowest AIC wins: Model B at ${rows[1].aic.toFixed(1)}, against ${rows[0].aic.toFixed(1)} and ${rows[2].aic.toFixed(1)}. R² rises monotonically with every predictor added, so it cannot arbitrate between models of different size — which is the whole reason information criteria exist.`,
      };
    }

    // delta — how big a difference is a difference
    const delta = rng.next() < 0.5 ? rng.int(2, 19) / 10 : rng.int(65, 200) / 10;
    const small = delta < 2;
    const { options, answer, optionExplanations, misconceptionTag } = assemble(rng, [
      small
        ? { text: "The two models are essentially indistinguishable on these data; choose on other grounds.", correct: true }
        : { text: "The lower-AIC model has clearly better support on these data.", correct: true },
      small
        ? { text: "The lower-AIC model has clearly better support on these data.", tag: "small_delta_over_interpreted",
            explain: `A gap of ${delta.toFixed(1)} AIC units is within the range where the criterion cannot separate the models. Picking the "winner" here is reading noise — interpretability, prior knowledge and the intended use should decide instead.` }
        : { text: "The two models are essentially indistinguishable; choose on other grounds.", tag: "large_delta_dismissed",
            explain: `${delta.toFixed(1)} units is far beyond the ≈2 that counts as indistinguishable. The evidence ratio here is e^(${delta.toFixed(1)}/2) ≈ ${Math.exp(delta / 2).toFixed(0)} to 1 in favour of the lower-AIC model.` },
      { text: "Neither model is usable, because AIC values must be positive.", tag: "sign_of_aic_treated_as_meaningful",
        explain: "The absolute value and sign of an AIC carry no information at all — they depend on the likelihood's scale. Only DIFFERENCES between AICs computed on the same data mean anything." },
      { text: "The models cannot be compared unless one is nested inside the other.", tag: "aic_confused_with_the_likelihood_ratio_test",
        explain: "Nesting is required for a likelihood-ratio TEST, not for AIC. AIC compares any models fitted to the same response data — that flexibility is one of its main attractions." },
    ]);
    return {
      _variant: variant, _params: { delta, small: small ? 1 : 0 },
      q: `What should you conclude?`,
      scenario: `Two candidate models for ${topic}, fitted to the same data, differ by ΔAIC = ${delta.toFixed(1)}.`,
      type: "mcq",
      options, answer, optionExplanations, misconceptionTag,
      hint: "Only the difference between AICs means anything, and there is a rough scale for how big a difference has to be.",
      explain: small
        ? `ΔAIC = ${delta.toFixed(1)} is inside the conventional "essentially equivalent" band of roughly 2 units. When models tie on AIC, the decision should be made on interpretability, prior evidence or the purpose of the model — not on the third decimal place.`
        : `ΔAIC = ${delta.toFixed(1)} is a substantial gap: the evidence ratio exp(Δ/2) ≈ ${Math.exp(delta / 2).toFixed(0)} means the data support the lower-AIC model many times over. Remember this is still a relative statement — the better of two poor models is still poor.`,
    };
  },
};
