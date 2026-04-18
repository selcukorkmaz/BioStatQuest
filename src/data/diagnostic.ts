// @ts-nocheck
// Curated 8-question diagnostic — one item per branch, hand-picked to expose
// the single most-common misconception in that area. NOT generated from the
// full bank. Hand-authored so the diagnostic is short, believable, and
// obviously-about-judgment rather than trivia.
//
// Each item:
//   - branch    → src/data/branches.ts key (score is rolled up here)
//   - method    → METHODS key for the "why this matters" copy on results
//   - difficulty → rough cognitive level ("intern" | "resident" | "fellow")
//   - misconception → 1-line English label, surfaced in the results report

const DIAGNOSTIC = [
  {
    id: "dx_foundations",
    branch: "foundations",
    method: "variable_types",
    difficulty: "intern",
    misconception: "Treating ordinal data as continuous",
    q: "A patient rates their pain on a 0–10 scale. What type of variable is this, for the purpose of choosing a summary statistic?",
    options: [
      "Continuous — compute the mean and SD",
      "Ordinal — use the median and IQR",
      "Nominal — use the mode",
      "Ratio — use the mean with CI",
    ],
    answer: 1,
    explain:
      "Ordered categories without guaranteed equal spacing. The distance between 7 and 8 isn't necessarily the same as 3 → 4, so the mean is misleading; median + IQR is the honest summary.",
  },
  {
    id: "dx_probability",
    branch: "probability",
    method: "bayes_rule",
    difficulty: "resident",
    misconception: "Ignoring base rates in screening (base-rate fallacy)",
    q: "A disease has 1% prevalence. A test is 95% sensitive and 95% specific. A randomly-screened patient tests positive. Roughly, what's the probability they actually have the disease?",
    options: [
      "About 95%",
      "About 50%",
      "About 16%",
      "Not enough information",
    ],
    answer: 2,
    explain:
      "Bayes' rule. Out of 10,000 screened: 100 truly have it (95 test positive) but 9,900 don't (495 false-positive). 95 / (95 + 495) ≈ 16%. Low prevalence + imperfect test ⇒ most positives are false.",
  },
  {
    id: "dx_inference",
    branch: "estimation_inference",
    method: "hypothesis_testing",
    difficulty: "resident",
    misconception: "Misreading p as P(null is true) or as effect size",
    q: "A trial reports \"the treatment reduced mortality, p = 0.04.\" Which interpretation is correct?",
    options: [
      "There is a 4% chance the null hypothesis is true",
      "If the null were true, there'd be a 4% chance of observing data at least this extreme",
      "The treatment works in 96% of patients",
      "The effect size is small but significant",
    ],
    answer: 1,
    explain:
      "p is a long-run frequency computed under the null — not a probability that the null is true, not the effect size, not a treatment-response rate. It says nothing about clinical importance on its own.",
  },
  {
    id: "dx_regression",
    branch: "regression",
    method: "regression_diagnostics",
    difficulty: "resident",
    misconception: "Equating high R² with a correct model",
    q: "A linear model of blood pressure on age reports R² = 0.80. Which conclusion is safest?",
    options: [
      "The model is a good fit — no further checks needed",
      "80% of patients are well-predicted",
      "The model explains 80% of observed variance — still check residuals, leverage, and assumptions",
      "The relationship is causal",
    ],
    answer: 2,
    explain:
      "R² is a variance-explained measure, not a verdict on model adequacy. A single outlier can inflate it; heteroscedasticity, non-linearity, and omitted variables can all coexist with a high R². Always inspect residuals.",
  },
  {
    id: "dx_design",
    branch: "design_bias",
    method: "selection_bias",
    difficulty: "resident",
    misconception: "Missing selection bias in case-control recruitment",
    q: "A case-control study recruits cases from a tertiary referral hospital and controls from the general population. What bias is most likely introduced?",
    options: [
      "Recall bias from the exposure history",
      "Selection bias — tertiary cases may differ systematically from community cases",
      "Confounding by indication",
      "Immortal-time bias",
    ],
    answer: 1,
    explain:
      "Tertiary cases are typically sicker, more refractory, and socioeconomically different from both community cases and the general population. Controls must be drawn from the source population that produced the cases.",
  },
  {
    id: "dx_measurement",
    branch: "missing_measurement",
    method: "roc_auc",
    difficulty: "resident",
    misconception: "Assuming good AUC means good clinical utility at low prevalence",
    q: "A new biomarker has AUC = 0.90 for a disease with 1% prevalence. What can you conclude about its positive predictive value (PPV) at a typical cutoff?",
    options: [
      "PPV is also around 0.90",
      "PPV will be high because discrimination is strong",
      "PPV can still be low — it depends heavily on prevalence and the chosen cutoff",
      "PPV equals AUC by definition",
    ],
    answer: 2,
    explain:
      "AUC is prevalence-invariant; PPV is not. At 1% prevalence, even a strong test can yield more false positives than true positives. Reporting AUC alone hides this — always compute PPV/NPV at the target use case.",
  },
  {
    id: "dx_causal",
    branch: "causal",
    method: "confounding",
    difficulty: "fellow",
    misconception: "Belief that adjusting for measured covariates removes confounding",
    q: "An observational study finds coffee drinkers have lower mortality, adjusting for age, sex, smoking, and BMI. What's the most important alternative explanation?",
    options: [
      "Chance — with a large sample, chance always dominates",
      "Reverse causation — coffee drinking is caused by being alive",
      "Unmeasured confounding — e.g., overall health, diet, activity",
      "Measurement error in the coffee exposure",
    ],
    answer: 2,
    explain:
      "Observational adjustment only controls for what you measured. The classic coffee story is almost certainly unmeasured confounding: healthier, more active people drink more coffee. Use E-value or sensitivity analysis to bound the risk.",
  },
  {
    id: "dx_advanced",
    branch: "advanced_bayesian",
    method: "multiple_testing",
    difficulty: "resident",
    misconception: "Interpreting one-out-of-many significant tests as a finding",
    q: "A trial runs 20 pre-specified subgroup tests. One reports p = 0.04. What's the safest conclusion?",
    options: [
      "This is a real subgroup effect — treatment works in that subgroup",
      "Consistent with chance alone — at α = 0.05, you expect ~1 false positive in 20",
      "Apply Bonferroni retroactively and publish",
      "Combine the 20 into a single test and report the pooled p-value",
    ],
    answer: 1,
    explain:
      "Running 20 independent tests at α = 0.05 gives an expected ~1 false discovery even if nothing is going on. Subgroup findings need pre-registration, multiple-comparison adjustment, and independent replication before they count.",
  },
] as const;

export { DIAGNOSTIC };
