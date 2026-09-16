// Light metadata for every item family — fid, title, method, difficulty floor.
// NO generator functions, so importing this costs ~3 KB instead of the ~57 KB
// (gzipped) that the family modules weigh together.
//
// WHY THIS EXISTS: the app needs family *metadata* synchronously, in hot
// paths — isFamilyQid() when tracking seen questions, FAMILY_BY_ID.method for
// branch attribution on review answers, familiesForMethods() when composing a
// run. It only needs the actual `gen` functions at the moment it draws a
// question, which is a user action we can await. Splitting the two lets the
// heavy half live in a lazy chunk. See ./lazy.ts for the loader.
//
// ORDER IS LOAD-BEARING: it mirrors FAMILIES in ./index.ts. familiesForMethods()
// preserves it and run composition consumes the result in order, so reordering
// here silently reorders what learners see.
//
// DO NOT hand-edit to add a family. Add it to ./index.ts as usual; manifest.test.ts
// fails until this file matches the real families exactly (id, title, method,
// difficulty AND order), which is what keeps the duplication honest.

export type FamilyMeta = {
  fid: string;
  title: string;
  method: string;
  diffMin: "intern" | "resident" | "fellow" | "pi";
};

export const FAMILY_MANIFEST: readonly FamilyMeta[] = [
  { fid: "gen_variable_type", title: "Classifying a variable's measurement scale", method: "variable_types", diffMin: "intern" },
  { fid: "gen_center_outlier", title: "Mean vs median with one extreme value", method: "central_tendency", diffMin: "intern" },
  { fid: "gen_descriptive_output", title: "Reading shape and spread off an R summary()", method: "descriptive", diffMin: "intern" },
  { fid: "gen_cv", title: "Relative spread — coefficient of variation, SD vs SE", method: "spread_variability", diffMin: "resident" },
  { fid: "gen_zscore", title: "The normal scale — z-scores, cut-offs and tail areas", method: "normal_zscore", diffMin: "intern" },
  { fid: "gen_binomial", title: "Binomial risk and choosing a distribution", method: "prob_dist", diffMin: "resident" },
  { fid: "gen_clt_se", title: "Central limit theorem — standard error, shape, and what spread means", method: "clt_sampling", diffMin: "resident" },
  { fid: "gen_sampling_design", title: "Sampling designs — naming, choosing, and their effect on precision", method: "sampling_methods", diffMin: "resident" },
  { fid: "gen_lm_interpret", title: "Reading a linear-model coefficient table", method: "lm", diffMin: "resident" },
  { fid: "gen_logistic_or", title: "Logistic regression — odds ratios and the log-odds scale", method: "logistic", diffMin: "resident" },
  { fid: "gen_survival_hr", title: "Cox models — reading a hazard ratio", method: "cox_ph", diffMin: "resident" },
  { fid: "gen_model_selection", title: "Model selection — AIC, ΔAIC, and the R² trap", method: "model_selection", diffMin: "fellow" },
  { fid: "gen_study_design", title: "Naming a study design and knowing what it can estimate", method: "study_design", diffMin: "intern" },
  { fid: "gen_bias", title: "Naming a bias, its direction and its remedy", method: "bias", diffMin: "resident" },
  { fid: "gen_confounding", title: "Confounding — reading crude against adjusted estimates", method: "confounding", diffMin: "resident" },
  { fid: "gen_causal_role", title: "Confounder, mediator or collider — and whether to adjust", method: "causal_assumptions", diffMin: "fellow" },
  { fid: "gen_missing_mechanism", title: "Missingness mechanisms and what they cost you", method: "mice", diffMin: "resident" },
  { fid: "gen_validity", title: "Validity, reliability and what measurement error does", method: "measurement_validity", diffMin: "resident" },
  { fid: "gen_kappa", title: "Cohen's kappa — agreement beyond chance", method: "kappa", diffMin: "fellow" },
  { fid: "gen_ci_width", title: "Confidence intervals — width, scaling and interpretation", method: "ci", diffMin: "resident" },
  { fid: "gen_pvalue", title: "p-values — meaning, decision and error rates", method: "hypothesis_testing", diffMin: "resident" },
  { fid: "gen_chisq", title: "Chi-square tables — expected counts, degrees of freedom, Fisher's rule", method: "chi_square", diffMin: "resident" },
  { fid: "gen_bootstrap", title: "The bootstrap — resampling, B, and where it fails", method: "bootstrap", diffMin: "fellow" },
  { fid: "gen_bayes_odds", title: "Bayes in odds form — priors, likelihood ratios and credible intervals", method: "bayes", diffMin: "fellow" },
  { fid: "gen_multiple_testing", title: "Multiplicity — family-wise error, Bonferroni and FDR", method: "multiple_testing", diffMin: "resident" },
  { fid: "gen_power", title: "Power — effect size, sample size and the non-significant result", method: "power", diffMin: "resident" },
  { fid: "gen_correlation", title: "Correlation — variance explained, Pearson versus Spearman", method: "correlation", diffMin: "resident" },
  { fid: "gen_ppv", title: "Predictive value under a shifting base rate", method: "roc_auc", diffMin: "resident" },
];
