// Branches of biostatistics — used for skill tree + case categorisation.
// `icon` is a key into ICON_MARKUP (defined in App.tsx), used only as a
// fallback when BRANCH_ICON has no entry for a branch key. The primary
// visual is the hand-drawn BRANCH_ICON SVG (stroke-based, currentColor).
export type BranchId =
  | "foundations"
  | "probability"
  | "estimation_inference"
  | "regression"
  | "design_bias"
  | "missing_measurement"
  | "causal"
  | "advanced_bayesian";

export type Branch = {
  name: string;
  color: string;
  icon: string;
  desc: string;
};

const BRANCHES: Record<BranchId, Branch> = {
  foundations:          { name: "Foundations",            color: "#0ea5e9", icon: "chart-bar",  desc: "Data types, descriptive stats, distributions" },
  probability:          { name: "Probability & Sampling", color: "#6366f1", icon: "dice",       desc: "Random variables, CLT, sampling, distributions" },
  estimation_inference: { name: "Estimation & Inference", color: "#d946ef", icon: "scale",      desc: "CIs, SEs, bootstrap, t-tests, χ², ANOVA, p-values" },
  regression:           { name: "Regression",             color: "#ec4899", icon: "chart-up",   desc: "Linear, logistic, survival, mixed models, GLM" },
  design_bias:          { name: "Study Design & Bias",    color: "#f43f5e", icon: "beaker",     desc: "RCT, cohort, case-control, selection & information bias" },
  missing_measurement:  { name: "Missing Data & Measurement", color: "#14b8a6", icon: "set-square", desc: "MCAR/MAR/MNAR, imputation, reliability, validity, ROC" },
  causal:               { name: "Causal Inference",       color: "#ef4444", icon: "compass",    desc: "Confounding, DAGs, IPTW, IV, DiD, mediation, target trial" },
  advanced_bayesian:    { name: "Advanced & Bayesian",    color: "#10b981", icon: "brain",      desc: "Multiple testing, power, meta-analysis, Bayes, R output" },
};

export { BRANCHES };
