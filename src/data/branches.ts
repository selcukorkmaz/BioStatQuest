// @ts-nocheck
// Branches of biostatistics — used for skill tree + case categorisation.
const BRANCHES = {
  foundations:          { name: "Foundations",            color: "#0ea5e9", icon: "📊", desc: "Data types, descriptive stats, distributions" },
  probability:          { name: "Probability & Sampling", color: "#6366f1", icon: "🎲", desc: "Random variables, CLT, sampling, distributions" },
  estimation_inference: { name: "Estimation & Inference", color: "#d946ef", icon: "⚖️", desc: "CIs, SEs, bootstrap, t-tests, χ², ANOVA, p-values" },
  regression:           { name: "Regression",             color: "#ec4899", icon: "📈", desc: "Linear, logistic, survival, mixed models, GLM" },
  design_bias:          { name: "Study Design & Bias",    color: "#f43f5e", icon: "🧪", desc: "RCT, cohort, case-control, selection & information bias" },
  missing_measurement:  { name: "Missing Data & Measurement", color: "#14b8a6", icon: "📐", desc: "MCAR/MAR/MNAR, imputation, reliability, validity, ROC" },
  causal:               { name: "Causal Inference",       color: "#ef4444", icon: "🧭", desc: "Confounding, DAGs, IPTW, IV, DiD, mediation, target trial" },
  advanced_bayesian:    { name: "Advanced & Bayesian",    color: "#10b981", icon: "🧠", desc: "Multiple testing, power, meta-analysis, Bayes, R output" },
};

export { BRANCHES };
