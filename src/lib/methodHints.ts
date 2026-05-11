// F3 — Layered hint registry, keyed by method.
//
// Three escalating layers per method:
//   Layer 1 (free)  — orienting nudge: which concept is in play
//   Layer 2 (Pro)   — structural: which formula/component to focus on
//   Layer 3 (Pro)   — partial walkthrough: get the learner most of the way
//
// We don't write hints per-question (1k+ questions = unsustainable for
// v0). Instead, hints attach to the question's `method` and apply to
// every question tagged with that method. For methods we haven't curated
// yet, Layer 1 auto-falls back to the method title (a no-op nudge that
// at least confirms what the question is about); higher layers are
// undefined and the UI degrades gracefully.

import { METHODS } from "../data/methods";

export type HintLayer = 1 | 2 | 3;

export type Hint = {
  layer1?: string;
  layer2?: string;
  layer3?: string;
};

// Curated hints for the highest-pedagogical-value methods. Add entries
// here over time; everything else falls back to title-based Layer 1.
const CURATED: Record<string, Hint> = {
  ci: {
    layer1: "Think about the difference between a frequentist statement (about the procedure) and a Bayesian one (about the parameter).",
    layer2: "The CI's coverage refers to the proportion of intervals from REPEATED sampling that contain the true parameter — not to this specific interval. Width depends on SE × critical value.",
    layer3: "If the question mixes a percentage with the parameter, watch for the inverted-conditional trap: P(parameter ∈ CI) is not what frequentist CIs assert. For ratio measures (OR/RR/HR), the null is 1, not 0.",
  },
  hypothesis_testing: {
    layer1: "Decide what H0 says (the null) and what evidence against it would look like.",
    layer2: "p-value is P(data ≥ observed | H0 true). It's NOT P(H0 true | data) — that requires a prior. 'Fail to reject' is not 'accept H0'.",
    layer3: "Smaller p does NOT mean larger effect: p combines effect size, n, and variability. Always pair the p with the effect estimate and CI before drawing a conclusion.",
  },
  multiple_testing: {
    layer1: "When you run many tests, the chance of at least one false positive grows fast. Decide whether you're controlling FWER or FDR.",
    layer2: "Bonferroni and Holm control FWER (probability of any false positive). Benjamini-Hochberg controls FDR (expected proportion of false discoveries among rejections). The right choice depends on the cost of a single false positive vs the desire to keep power at scale.",
    layer3: "If the question features a genome-wide / mass-screen scenario, FDR usually wins (Bonferroni rejects almost nothing). For a small confirmatory family with severe consequences per false positive, FWER is more defensible.",
  },
  roc_auc: {
    layer1: "Map test characteristics: sensitivity, specificity, PPV, NPV — and remember which depend on prevalence.",
    layer2: "Sensitivity = P(test+ | disease+); Specificity = P(test− | disease−). PPV/NPV depend on prevalence; sens/spec are properties of the TEST. SnNOUT (high sens → rule OUT on negative); SpPIN (high spec → rule IN on positive).",
    layer3: "When prevalence is low, even a great test produces many false positives — focus on specificity for screening; reserve high-sensitivity tests for ruling-out workflows. Discrimination (AUC) and calibration (predicted vs observed) are distinct.",
  },
  logistic: {
    layer1: "You're working in odds-space. The model coefficient is on the log-odds scale; OR = exp(β).",
    layer2: "OR is the multiplicative effect on the ODDS of the outcome per 1-unit change in the predictor. Null OR = 1, not 0. OR ≈ RR only when the outcome is rare (<~10%).",
    layer3: "If the question describes a common outcome and asks for risk interpretation, beware the OR-as-RR trap: OR overstates RR direction when prevalence is high. Pseudo-R² is not OLS R²; calibration via Hosmer-Lemeshow, discrimination via C-statistic.",
  },
  lm: {
    layer1: "Slope = expected change in Y per 1-unit change in X. Don't read the slope as a percentage.",
    layer2: "R² is variance explained, not causation. Adjusted R² penalizes added predictors. Diagnostics (residuals, Q-Q, Cook's distance) check the assumptions OLS depends on.",
    layer3: "Adding an irrelevant predictor never decreases R² — favours bigger models if you compare with raw R². Use adjusted R² or AIC/BIC. Centering predictors gives the intercept a meaningful interpretation; collinearity inflates SEs (VIF > 5 is a flag).",
  },
  bayes: {
    layer1: "Posterior ∝ prior × likelihood. The prior matters most when data are sparse.",
    layer2: "Bayes' rule: P(H | data) ∝ P(data | H) × P(H). With a flat prior and a normal-ish likelihood, the posterior interval often coincides numerically with a frequentist CI — but its INTERPRETATION is different (probability of the parameter, not the procedure).",
    layer3: "Watch for credible-interval framing on a frequentist question: 95% credible interval IS a probability statement about the parameter, but only under the prior + likelihood you assumed. Hierarchical models partially pool small-group estimates toward the grand mean.",
  },
  confounding: {
    layer1: "A confounder is associated with both exposure and outcome AND not on the causal pathway. A mediator IS on the path. A collider is a common EFFECT.",
    layer2: "Adjust for confounders → less bias. Adjust for mediators → blocks part of the causal effect. Adjust for colliders → INDUCES bias (opens a non-causal path). Direction matters; draw the DAG before deciding the adjustment set.",
    layer3: "Randomization handles BOTH measured and unmeasured confounders on average; PSM only the measured ones; instrumental variables can address unmeasured confounding under strong assumptions. Conditioning on a hospital-admission proxy is collider bias (Berkson's).",
  },
  variable_types: {
    layer1: "Decide between nominal, ordinal, interval, ratio. Order? Equal spacing? True zero?",
    layer2: "Nominal = unordered labels (blood type). Ordinal = ordered with unequal spacing (pain 0–10). Interval = equal spacing, no true zero (°C). Ratio = equal spacing AND true zero (kg, age).",
  },
  central_tendency: {
    layer1: "Mean, median, mode each summarize the CENTER. Spread (SD, IQR, range) is a different dimension.",
    layer2: "Mean is most affected by outliers; median and mode are robust. Adding a constant shifts the mean only; multiplying scales BOTH mean and SD.",
  },
  spread_variability: {
    layer1: "SD, variance, IQR, range — each summarizes how spread out the data are.",
    layer2: "SD invariant to translation; scales linearly with multiplication. CV = SD/mean (unitless, comparable across scales). For skewed data report median + IQR, not mean ± SD.",
  },
};

// Auto-fallback Layer 1: pull from the method's intuition string (which
// is required for every method by methods.test.ts) so every question gets
// a substantive orienting hint, not just a placeholder. The intuition is
// usually 1–3 sentences — perfect Layer 1 length. Trim aggressively to
// the first sentence/clause to keep Layer 1 short and orientation-only;
// deeper structural detail is the job of curated Layer 2.
function fallbackLayer1(methodId: string): string | undefined {
  const m = (METHODS as any)[methodId];
  const intuition = (m?.intuition || "").trim();
  if (!intuition) {
    // Last-resort: just name the method. Should rarely fire.
    if (!m?.title) return undefined;
    return `Recall the core idea of ${m.title.toLowerCase()}.`;
  }
  // Keep the first sentence (or first ~200 chars) — Layer 1 is a nudge,
  // not a lecture. Curated Layer 1 entries already follow this shape.
  const firstSentence = intuition.split(/(?<=[.?!])\s/)[0];
  const trimmed = firstSentence.length > 240
    ? intuition.slice(0, 220).replace(/\s+\S*$/, "") + "…"
    : firstSentence;
  return trimmed;
}

// Question shape that may carry a per-question hint override. Only the
// keys we touch — keeps the type loose so we don't fight cases.ts.
type QWithHint = {
  method?: string | null;
  hint?: Partial<Hint> | string;
};

export function getHint(methodOrQuestion: string | QWithHint | null | undefined): Hint {
  if (!methodOrQuestion) return {};

  // Resolve question vs. plain methodId. When called with a question, the
  // question's own hint (if any) takes priority — this is how authors
  // override a too-generic method-level hint for a specific question.
  let methodId: string | null | undefined = null;
  let qHint: Partial<Hint> | undefined;
  if (typeof methodOrQuestion === "string") {
    methodId = methodOrQuestion;
  } else {
    methodId = methodOrQuestion.method;
    if (typeof methodOrQuestion.hint === "string") {
      qHint = { layer1: methodOrQuestion.hint };
    } else if (methodOrQuestion.hint && typeof methodOrQuestion.hint === "object") {
      qHint = methodOrQuestion.hint;
    }
  }

  const curated: Partial<Hint> = (methodId && CURATED[methodId]) || {};
  // Priority per layer: question override → curated method → fallback.
  const layer1 = qHint?.layer1 ?? curated.layer1 ?? (methodId ? fallbackLayer1(methodId) : undefined);
  const layer2 = qHint?.layer2 ?? curated.layer2;
  const layer3 = qHint?.layer3 ?? curated.layer3;
  return { layer1, layer2, layer3 };
}

// Tier mapping: Layer 1 is always free; Layers 2 and 3 are Pro.
export function isHintLayerFree(layer: HintLayer): boolean {
  return layer === 1;
}

// Surface for tests + admin reporting: which methods have curated content.
export function listCuratedMethods(): string[] {
  return Object.keys(CURATED);
}
